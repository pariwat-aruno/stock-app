/**
 * Alert.gs — daily alert (08:00) สำหรับ Owner
 *   - checkLowStock      : หาสารที่ qty < min_stock
 *   - checkExpiringLots  : หา lot ที่ใกล้หมดอายุ ≤ 30 วัน
 *   - runDailyAlerts     : รวมทั้งสองและ push ไป Owner
 *   - setupAlertTrigger  : ตั้ง time-based trigger daily 08:00
 */

// ========== Trigger entry point ==========

/**
 * runDailyAlerts — ตัวเข้าจากตัว trigger
 * เรียก checkLowStock + checkExpiringLots แล้ว push แค่ครั้งเดียว
 */
function runDailyAlerts() {
  try {
    const lowItems = checkLowStock_internal();
    const expItems = checkExpiringLots_internal();

    if (lowItems.length === 0 && expItems.length === 0) {
      logInfo('runDailyAlerts', 'ไม่มี alert วันนี้');
      return { ok: true, sent: false };
    }

    const messages = [];
    if (lowItems.length > 0) {
      messages.push({
        type: 'flex',
        altText: `แจ้งเตือนสารใกล้หมด (${lowItems.length} รายการ)`,
        contents: buildLowStockAlertCard(lowItems),
      });
    }
    if (expItems.length > 0) {
      messages.push({
        type: 'flex',
        altText: `แจ้งเตือนสารใกล้หมดอายุ (${expItems.length} รายการ)`,
        contents: buildExpiringLotsAlertCard(expItems),
      });
    }

    pushToAllOwners(messages);

    logInfo('runDailyAlerts', `sent low=${lowItems.length} exp=${expItems.length}`);
    return { ok: true, sent: true, low_count: lowItems.length, expiring_count: expItems.length };
  } catch (e) {
    logError('runDailyAlerts', e.message);
    return { ok: false, error: e.message };
  }
}

// ========== Internal: checkLowStock ==========

/**
 * หาสารที่ qty รวม < min_stock (skip ถ้า min_stock=0)
 * @returns array ของ { material_id, name, unit, qty, min_stock }
 */
function checkLowStock_internal() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  const matData = ss.getSheetByName('Materials').getDataRange().getValues();
  const lotsData = ss.getSheetByName('Inventory_Lots').getDataRange().getValues();

  const results = [];
  for (let i = 1; i < matData.length; i++) {
    const m = matData[i];
    if (m[4] !== true) continue;  // skip inactive
    const minStock = parseFloat(m[3]) || 0;
    if (minStock <= 0) continue;  // skip ถ้าไม่ได้ตั้ง

    let totalQty = 0;
    for (let j = 1; j < lotsData.length; j++) {
      if (lotsData[j][1] === m[0] && lotsData[j][9] === true) {
        totalQty += parseFloat(lotsData[j][4]) || 0;
      }
    }

    if (totalQty < minStock) {
      results.push({
        material_id: m[0],
        name: m[1],
        unit: m[2],
        qty: totalQty,
        min_stock: minStock,
      });
    }
  }

  // sort: ขาดมากที่สุดก่อน (qty/min_stock น้อยสุด)
  results.sort((a, b) => (a.qty / a.min_stock) - (b.qty / b.min_stock));
  return results;
}

// ========== Internal: checkExpiringLots ==========

/**
 * หา lot ที่จะหมดอายุภายใน X วัน (default 30)
 * @returns array ของ { lot_id, material_name, lot_no, qty_remaining, expire_date, days_left }
 */
function checkExpiringLots_internal() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  const matData = ss.getSheetByName('Materials').getDataRange().getValues();
  const lotsData = ss.getSheetByName('Inventory_Lots').getDataRange().getValues();

  const warnDays = parseInt(getConfig('expire_warning_days', '30'), 10);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const warnDate = new Date(today.getTime() + warnDays * 86400 * 1000);

  // build material lookup
  const matLookup = {};
  matData.slice(1).forEach(r => {
    matLookup[r[0]] = { name: r[1], unit: r[2] };
  });

  const results = [];
  for (let j = 1; j < lotsData.length; j++) {
    const l = lotsData[j];
    if (l[9] !== true) continue;  // skip inactive lot
    const qtyRem = parseFloat(l[4]) || 0;
    if (qtyRem <= 0) continue;  // skip ถ้าหมดแล้ว

    const expDate = new Date(l[7]);
    if (expDate > warnDate) continue;  // ยังไม่ใกล้หมดอายุ

    const daysLeft = Math.floor((expDate - today) / 86400000);
    const mat = matLookup[l[1]] || { name: l[1], unit: '' };

    results.push({
      lot_id: l[0],
      material_id: l[1],
      material_name: mat.name,
      unit: mat.unit,
      lot_no: l[2],
      qty_remaining: qtyRem,
      expire_date: l[7],
      days_left: daysLeft,
    });
  }

  // sort: ใกล้สุดก่อน
  results.sort((a, b) => a.days_left - b.days_left);
  return results;
}

// ========== Setup trigger ==========

/**
 * ตั้ง daily trigger 08:00 → runDailyAlerts
 * อ่าน alert_hour จาก Config (default 8)
 */
function setupAlertTrigger() {
  // ลบ trigger เก่า
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runDailyAlerts') {
      ScriptApp.deleteTrigger(t);
    }
  });

  const hour = parseInt(getConfig('alert_hour', '8'), 10);

  ScriptApp.newTrigger('runDailyAlerts')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .create();

  const msg = `setupAlertTrigger สำเร็จ — trigger ตั้งทุกวัน ${hour}:00`;
  Logger.log(msg);
  return msg;
}

// ========== Test / Preview functions ==========

/**
 * Preview low stock alert (ส่งไป owner เพื่อดูหน้าตา)
 */
function previewLowStockToOwner_() {
  const items = checkLowStock_internal();
  if (items.length === 0) {
    // mock data
    items.push({ material_id: 'MAT-DEMO', name: 'Glycerin (ตัวอย่าง)', unit: 'g', qty: 50, min_stock: 100 });
  }
  const card = buildLowStockAlertCard(items);
  pushToAllOwners([{ type: 'flex', altText: 'แจ้งเตือนสารใกล้หมด (preview)', contents: card }]);
  return { ok: true, count: items.length };
}

function previewExpiringLotsToOwner_() {
  const items = checkExpiringLots_internal();
  if (items.length === 0) {
    items.push({
      lot_id: 'LOT-DEMO',
      material_id: 'MAT-DEMO',
      material_name: 'Glycerin (ตัวอย่าง)',
      unit: 'g',
      lot_no: 'L240515-A',
      qty_remaining: 200,
      expire_date: '2026-06-01',
      days_left: 17,
    });
  }
  const card = buildExpiringLotsAlertCard(items);
  pushToAllOwners([{ type: 'flex', altText: 'แจ้งเตือนสารใกล้หมดอายุ (preview)', contents: card }]);
  return { ok: true, count: items.length };
}

function testRunDailyAlerts_() {
  return runDailyAlerts();
}
