/**
 * Stock.gs — handler หลักของระบบ
 *   - receiveMaterial    : รับเข้า (ถ่าย 3 รูป + create lot)
 *   - issueMaterial      : เบิกออก (เลือก lot + 3 รูป + update qty)
 *   - listStock          : ดูสต๊อกคงเหลือ (aggregate per material)
 *   - getLotsForMaterial : ดู lot ของสารหนึ่ง (FIFO sort)
 *   - listMovements      : audit movement (owner only)
 *   - listMaterials      : list active materials (สำหรับ autocomplete)
 */

// ========== Action: receiveMaterial (รับสารเข้า) ==========

function receiveMaterial(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isPairedStaff(lineUserId)) return { ok: false, error: 'not_paired_staff' };

    // validate
    if (!payload.material_id) return { ok: false, error: 'missing_material_id' };
    if (!payload.lot_no) return { ok: false, error: 'missing_lot_no' };
    const qty = parseFloat(payload.qty);
    if (!qty || qty <= 0) return { ok: false, error: 'invalid_qty' };
    if (!payload.expire_date) return { ok: false, error: 'missing_expire_date' };
    if (!payload.images || payload.images.length !== 3) {
      return { ok: false, error: 'need_3_images' };
    }

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

    // verify material exists + active
    const matSheet = ss.getSheetByName('Materials');
    const matData = matSheet.getDataRange().getValues();
    const matRow = matData.slice(1).find(r => r[0] === payload.material_id);
    if (!matRow) return { ok: false, error: 'material_not_found' };
    if (matRow[4] !== true) return { ok: false, error: 'material_inactive' };

    const materialName = matRow[1];
    const unit = matRow[2];

    // generate IDs
    const now = new Date();
    const lotId = nextId(ss, 'Inventory_Lots', 'LOT', true);
    const movementId = nextId(ss, 'Movements', 'MOV', true);

    // upload 3 images
    const yearMonth = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM');
    const subPath = `${yearMonth}/in`;
    const imageUrls = [];
    for (let i = 0; i < 3; i++) {
      const url = uploadImage(payload.images[i], subPath, `${movementId}_${i + 1}.jpg`);
      imageUrls.push(driveUrlToThumbnail_(url));
    }

    // insert Inventory_Lots
    ss.getSheetByName('Inventory_Lots').appendRow([
      lotId,
      payload.material_id,
      payload.lot_no,
      qty,
      qty,  // qty_remaining = qty_initial ตอนรับเข้า
      payload.supplier || '',
      formatISOBangkok(now),
      payload.expire_date,
      lineUserId,
      true,
      payload.note || '',
    ]);

    // insert Movements
    ss.getSheetByName('Movements').appendRow([
      movementId,
      'in',
      payload.material_id,
      lotId,
      qty,
      lineUserId,
      '',  // for_user_note (in ไม่ต้องมี)
      imageUrls[0],
      imageUrls[1],
      imageUrls[2],
      formatISOBangkok(now),
    ]);

    // push flex receipt to owners
    const actorInfo = getPairedInfo_(lineUserId);
    try {
      const card = buildReceiveReceiptCard({
        movement_id: movementId,
        material_name: materialName,
        qty: qty,
        unit: unit,
        lot_no: payload.lot_no,
        supplier: payload.supplier || '-',
        expire_date: payload.expire_date,
        actor_name: actorInfo.name,
        images: imageUrls,
      });
      pushToAllOwners([{ type: 'flex', altText: `รับสารเข้า ${materialName} ${qty} ${unit}`, contents: card }]);
    } catch (e) {
      logWarn('receiveMaterial_push_owner_failed', e.message);
    }

    logInfo('receiveMaterial', `${movementId} ${materialName} ${qty}${unit}`, payload);
    return {
      ok: true,
      movement_id: movementId,
      lot_id: lotId,
    };
  } catch (e) {
    logError('receiveMaterial', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: issueMaterial (เบิกสารออก) ==========

function issueMaterial(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isPairedStaff(lineUserId)) return { ok: false, error: 'not_paired_staff' };

    // validate
    if (!payload.material_id) return { ok: false, error: 'missing_material_id' };
    if (!payload.lot_id) return { ok: false, error: 'missing_lot_id' };
    const qty = parseFloat(payload.qty);
    if (!qty || qty <= 0) return { ok: false, error: 'invalid_qty' };
    if (!payload.for_user_note) return { ok: false, error: 'missing_for_user_note' };
    if (!payload.images || payload.images.length !== 3) {
      return { ok: false, error: 'need_3_images' };
    }

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

    // lookup lot (re-read for fresh qty_remaining)
    const lotsSheet = ss.getSheetByName('Inventory_Lots');
    const lotsData = lotsSheet.getDataRange().getValues();
    let lotRowIdx = -1;
    let lotRow = null;
    for (let i = 1; i < lotsData.length; i++) {
      if (lotsData[i][0] === payload.lot_id) {
        lotRowIdx = i;
        lotRow = lotsData[i];
        break;
      }
    }
    if (!lotRow) return { ok: false, error: 'lot_not_found' };
    if (lotRow[1] !== payload.material_id) return { ok: false, error: 'lot_material_mismatch' };
    if (lotRow[9] !== true) return { ok: false, error: 'lot_inactive' };

    const qtyRemaining = parseFloat(lotRow[4]);
    if (qty > qtyRemaining) {
      return { ok: false, error: 'insufficient_qty', qty_remaining: qtyRemaining };
    }

    // lookup material name
    const matSheet = ss.getSheetByName('Materials');
    const matData = matSheet.getDataRange().getValues();
    const matRow = matData.slice(1).find(r => r[0] === payload.material_id);
    const materialName = matRow ? matRow[1] : payload.material_id;
    const unit = matRow ? matRow[2] : '';

    // generate IDs
    const now = new Date();
    const movementId = nextId(ss, 'Movements', 'MOV', true);

    // upload 3 images
    const yearMonth = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM');
    const subPath = `${yearMonth}/out`;
    const imageUrls = [];
    for (let i = 0; i < 3; i++) {
      const url = uploadImage(payload.images[i], subPath, `${movementId}_${i + 1}.jpg`);
      imageUrls.push(driveUrlToThumbnail_(url));
    }

    // update qty_remaining
    const newQty = qtyRemaining - qty;
    lotsSheet.getRange(lotRowIdx + 1, 5).setValue(newQty);

    // insert Movements
    ss.getSheetByName('Movements').appendRow([
      movementId,
      'out',
      payload.material_id,
      payload.lot_id,
      qty,
      lineUserId,
      payload.for_user_note,
      imageUrls[0],
      imageUrls[1],
      imageUrls[2],
      formatISOBangkok(now),
    ]);

    // push flex receipt to owners
    const actorInfo = getPairedInfo_(lineUserId);
    try {
      const card = buildIssueReceiptCard({
        movement_id: movementId,
        material_name: materialName,
        qty: qty,
        unit: unit,
        lot_no: lotRow[2],
        for_user_note: payload.for_user_note,
        qty_remaining_after: newQty,
        actor_name: actorInfo.name,
        images: imageUrls,
      });
      pushToAllOwners([{ type: 'flex', altText: `เบิกสาร ${materialName} ${qty} ${unit}`, contents: card }]);
    } catch (e) {
      logWarn('issueMaterial_push_owner_failed', e.message);
    }

    logInfo('issueMaterial', `${movementId} ${materialName} ${qty}${unit} → ${payload.for_user_note}`, payload);
    return {
      ok: true,
      movement_id: movementId,
      qty_remaining: newQty,
    };
  } catch (e) {
    logError('issueMaterial', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: listStock (ดูสต๊อกคงเหลือ) ==========

function listStock(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isPairedStaff(lineUserId)) return { ok: false, error: 'not_paired_staff' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

    // load materials
    const matData = ss.getSheetByName('Materials').getDataRange().getValues();
    const lotsData = ss.getSheetByName('Inventory_Lots').getDataRange().getValues();

    const warnDays = parseInt(getConfig('expire_warning_days', '30'), 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const warnDate = new Date(today.getTime() + warnDays * 86400 * 1000);

    const result = [];
    for (let i = 1; i < matData.length; i++) {
      const m = matData[i];
      if (m[4] !== true) continue;  // skip inactive

      const matId = m[0];
      // aggregate
      let totalQty = 0;
      let hasExpiring = false;
      for (let j = 1; j < lotsData.length; j++) {
        if (lotsData[j][1] === matId && lotsData[j][9] === true) {
          const q = parseFloat(lotsData[j][4]) || 0;
          totalQty += q;
          if (q > 0) {
            const exp = new Date(lotsData[j][7]);
            if (exp <= warnDate) hasExpiring = true;
          }
        }
      }

      const minStock = parseFloat(m[3]) || 0;
      const isLow = minStock > 0 && totalQty < minStock;

      result.push({
        material_id: matId,
        name: m[1],
        unit: m[2],
        qty: totalQty,
        min_stock: minStock,
        is_low: isLow,
        has_expiring: hasExpiring,
      });
    }

    // sort: has_expiring (true first) → is_low → name
    result.sort((a, b) => {
      if (a.has_expiring !== b.has_expiring) return a.has_expiring ? -1 : 1;
      if (a.is_low !== b.is_low) return a.is_low ? -1 : 1;
      return a.name.localeCompare(b.name, 'th');
    });

    return { ok: true, materials: result };
  } catch (e) {
    logError('listStock', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: getLotsForMaterial (ดู lot ของสาร) ==========

function getLotsForMaterial(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isPairedStaff(lineUserId)) return { ok: false, error: 'not_paired_staff' };

    if (!payload.material_id) return { ok: false, error: 'missing_material_id' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const lotsData = ss.getSheetByName('Inventory_Lots').getDataRange().getValues();

    const lots = lotsData.slice(1)
      .filter(r => r[1] === payload.material_id && r[9] === true && parseFloat(r[4]) > 0)
      .map(r => ({
        lot_id: r[0],
        lot_no: r[2],
        qty_remaining: parseFloat(r[4]),
        supplier: r[5],
        received_at: r[6],
        expire_date: r[7],
      }))
      .sort((a, b) => new Date(a.expire_date) - new Date(b.expire_date));  // FIFO suggest

    return { ok: true, lots: lots };
  } catch (e) {
    logError('getLotsForMaterial', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: listMaterials (autocomplete สำหรับ in/out) ==========

function listMaterials(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isPairedStaff(lineUserId)) return { ok: false, error: 'not_paired_staff' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const matData = ss.getSheetByName('Materials').getDataRange().getValues();

    const includeInactive = payload && payload.include_inactive && isOwner(lineUserId);

    const materials = matData.slice(1)
      .filter(r => includeInactive || r[4] === true)
      .map(r => ({
        material_id: r[0],
        name: r[1],
        unit: r[2],
        min_stock: parseFloat(r[3]) || 0,
        is_active: r[4] === true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'));

    return { ok: true, materials: materials };
  } catch (e) {
    logError('listMaterials', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: listMovements (owner only — audit) ==========

function listMovements(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const movData = ss.getSheetByName('Movements').getDataRange().getValues();
    const userMap = ss.getSheetByName('User_Map').getDataRange().getValues();
    const empData = ss.getSheetByName('Employees').getDataRange().getValues();
    const matData = ss.getSheetByName('Materials').getDataRange().getValues();

    // helper lookups
    const userToEmp = {};
    userMap.slice(1).forEach(r => { userToEmp[r[0]] = r[1]; });
    const empToName = {};
    empData.slice(1).forEach(r => { empToName[r[0]] = r[1]; });
    const matToName = {};
    matData.slice(1).forEach(r => { matToName[r[0]] = `${r[1]} (${r[2]})`; });

    const filterType = payload && payload.type;
    const filterMat = payload && payload.material_id;
    const limit = (payload && payload.limit) || 50;

    let rows = movData.slice(1);
    if (filterType) rows = rows.filter(r => r[1] === filterType);
    if (filterMat) rows = rows.filter(r => r[2] === filterMat);

    // sort by created_at DESC
    rows.sort((a, b) => new Date(b[10]) - new Date(a[10]));
    rows = rows.slice(0, limit);

    const result = rows.map(r => {
      const actorEmp = userToEmp[r[5]] || '';
      const actorName = empToName[actorEmp] || r[5];
      return {
        movement_id: r[0],
        type: r[1],
        material_name: matToName[r[2]] || r[2],
        lot_id: r[3],
        qty: parseFloat(r[4]),
        actor_name: actorName,
        for_user_note: r[6],
        image_url_1: r[7],
        image_url_2: r[8],
        image_url_3: r[9],
        created_at: r[10],
      };
    });

    return { ok: true, movements: result };
  } catch (e) {
    logError('listMovements', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Helper: nextId (running ID generator) ==========

/**
 * สร้าง next ID
 * @param ss spreadsheet
 * @param sheetName ชื่อ tab (เช่น 'Movements')
 * @param prefix prefix (เช่น 'MOV')
 * @param dailyReset true = MOV-YYYYMMDD-XXXX · false = MOV-XXXX
 */
function nextId(ss, sheetName, prefix, dailyReset) {
  const sheet = ss.getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  let pattern;

  if (dailyReset) {
    const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd');
    pattern = `${prefix}-${today}-`;
  } else {
    pattern = `${prefix}-`;
  }

  let maxN = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]);
    if (id.indexOf(pattern) === 0) {
      const n = parseInt(id.slice(pattern.length), 10);
      if (n > maxN) maxN = n;
    }
  }

  const nextN = String(maxN + 1).padStart(4, '0');
  return `${pattern}${nextN}`;
}

/**
 * แปลง Drive URL (/file/d/ID/view) → thumbnail (/thumbnail?id=ID&sz=w800)
 * เพื่อให้ LINE Flex render รูปได้
 */
function driveUrlToThumbnail_(url) {
  const match = url && url.match(/[?&/]id=([^&]+)|\/file\/d\/([^\/]+)/);
  if (!match) return url;
  const id = match[1] || match[2];
  return `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
}

// ========== Test functions ==========

function testListStock_() {
  const ownerIds = (getConfig('owner_line_user_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ownerIds.length) throw new Error('ยังไม่ตั้ง owner_line_user_ids');
  const r = listStock({ lineUserId: ownerIds[0] });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
