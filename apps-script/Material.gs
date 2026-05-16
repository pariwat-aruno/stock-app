/**
 * Material.gs — admin actions สำหรับ Owner
 *   - proposeMaterial      : Staff เสนอสารใหม่ (insert Pending_Changes)
 *   - listPending          : list pending requests (owner only)
 *   - approveMaterial      : approve pending (owner only)
 *   - rejectMaterial       : reject pending (owner only)
 *   - addEmployee          : เพิ่ม employee (owner only)
 *   - listEmployees        : list employees (owner only)
 *   - updateMinStock       : ตั้ง min_stock ต่อสาร (owner only)
 *   - softDeleteMaterial   : ลบสาร (soft · owner only)
 */

// ========== Action: proposeMaterial (Staff propose) ==========

function proposeMaterial(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isPairedStaff(lineUserId)) return { ok: false, error: 'not_paired_staff' };

    if (!payload.name) return { ok: false, error: 'missing_name' };
    if (!payload.unit) return { ok: false, error: 'missing_unit' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

    // check name ไม่ซ้ำ (case-insensitive)
    const matData = ss.getSheetByName('Materials').getDataRange().getValues();
    const nameLower = String(payload.name).trim().toLowerCase();
    const dup = matData.slice(1).find(r => String(r[1]).trim().toLowerCase() === nameLower && r[4] === true);
    if (dup) return { ok: false, error: 'name_duplicate', material_id: dup[0] };

    // check pending ไม่ซ้ำ (กันคนเสนอซ้ำ)
    const pendData = ss.getSheetByName('Pending_Changes').getDataRange().getValues();
    const pendingDup = pendData.slice(1).find(r => {
      if (r[5] !== 'pending') return false;
      if (r[1] !== 'new_material') return false;
      try {
        const p = JSON.parse(r[2]);
        return String(p.name).trim().toLowerCase() === nameLower;
      } catch (e) { return false; }
    });
    if (pendingDup) return { ok: false, error: 'pending_duplicate', pending_id: pendingDup[0] };

    // insert
    const now = new Date();
    const pendingId = nextId(ss, 'Pending_Changes', 'PND', true);
    const payloadJson = JSON.stringify({
      name: String(payload.name).trim(),
      unit: String(payload.unit).trim(),
      min_stock: parseFloat(payload.min_stock) || 0,
      note: payload.note || '',
    });

    ss.getSheetByName('Pending_Changes').appendRow([
      pendingId,
      'new_material',
      payloadJson,
      lineUserId,
      formatISOBangkok(now),
      'pending',
      '',  // decided_by
      '',  // decided_at
      '',  // decision_note
    ]);

    // push flex card to owners
    const proposerInfo = getPairedInfo_(lineUserId);
    try {
      const card = buildPendingApprovalCard({
        pending_id: pendingId,
        material_name: payload.name,
        unit: payload.unit,
        min_stock: parseFloat(payload.min_stock) || 0,
        note: payload.note || '',
        proposer_name: proposerInfo.name,
      });
      pushToAllOwners([{ type: 'flex', altText: `มีคำขออนุมัติสารใหม่: ${payload.name}`, contents: card }]);
    } catch (e) {
      logWarn('proposeMaterial_push_owner_failed', e.message);
    }

    logInfo('proposeMaterial', `${pendingId} ${payload.name}`, payload);
    return { ok: true, pending_id: pendingId };
  } catch (e) {
    logError('proposeMaterial', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: listPending (owner only) ==========

function listPending(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const pendData = ss.getSheetByName('Pending_Changes').getDataRange().getValues();
    const userMap = ss.getSheetByName('User_Map').getDataRange().getValues();
    const empData = ss.getSheetByName('Employees').getDataRange().getValues();

    const userToEmp = {};
    userMap.slice(1).forEach(r => { userToEmp[r[0]] = r[1]; });
    const empToName = {};
    empData.slice(1).forEach(r => { empToName[r[0]] = r[1]; });

    const result = pendData.slice(1)
      .filter(r => r[5] === 'pending')
      .map(r => {
        let parsed = {};
        try { parsed = JSON.parse(r[2]); } catch (e) {}
        const empCode = userToEmp[r[3]] || '';
        return {
          pending_id: r[0],
          type: r[1],
          payload: parsed,
          proposer_name: empToName[empCode] || r[3],
          proposed_at: r[4],
        };
      })
      .sort((a, b) => new Date(b.proposed_at) - new Date(a.proposed_at));

    return { ok: true, pending: result };
  } catch (e) {
    logError('listPending', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: approveMaterial (owner only) ==========

function approveMaterial(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    if (!payload.pending_id) return { ok: false, error: 'missing_pending_id' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const pendSheet = ss.getSheetByName('Pending_Changes');
    const pendData = pendSheet.getDataRange().getValues();

    let pendRowIdx = -1;
    let pendRow = null;
    for (let i = 1; i < pendData.length; i++) {
      if (pendData[i][0] === payload.pending_id) {
        pendRowIdx = i;
        pendRow = pendData[i];
        break;
      }
    }
    if (!pendRow) return { ok: false, error: 'pending_not_found' };
    if (pendRow[5] !== 'pending') return { ok: false, error: 'already_decided', status: pendRow[5] };

    const data = JSON.parse(pendRow[2]);
    const proposerUserId = pendRow[3];
    const now = new Date();

    // insert Materials
    const matSheet = ss.getSheetByName('Materials');
    const matId = nextId(ss, 'Materials', 'MAT', false);
    matSheet.appendRow([
      matId,
      data.name,
      data.unit,
      data.min_stock || 0,
      true,  // is_active
      proposerUserId,
      lineUserId,
      formatISOBangkok(now),
      formatISOBangkok(now),
      formatISOBangkok(now),
      data.note || '',
    ]);

    // update Pending
    pendSheet.getRange(pendRowIdx + 1, 6).setValue('approved');
    pendSheet.getRange(pendRowIdx + 1, 7).setValue(lineUserId);
    pendSheet.getRange(pendRowIdx + 1, 8).setValue(formatISOBangkok(now));

    // notify proposer
    try {
      pushText(proposerUserId, `สารใหม่ "${data.name}" ได้รับอนุมัติแล้ว · เริ่มใช้งานได้`);
    } catch (e) {
      logWarn('approveMaterial_notify_proposer_failed', e.message);
    }

    logInfo('approveMaterial', `${payload.pending_id} → ${matId} ${data.name}`, payload);
    return { ok: true, material_id: matId };
  } catch (e) {
    logError('approveMaterial', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: rejectMaterial (owner only) ==========

function rejectMaterial(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    if (!payload.pending_id) return { ok: false, error: 'missing_pending_id' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const pendSheet = ss.getSheetByName('Pending_Changes');
    const pendData = pendSheet.getDataRange().getValues();

    let pendRowIdx = -1;
    let pendRow = null;
    for (let i = 1; i < pendData.length; i++) {
      if (pendData[i][0] === payload.pending_id) {
        pendRowIdx = i;
        pendRow = pendData[i];
        break;
      }
    }
    if (!pendRow) return { ok: false, error: 'pending_not_found' };
    if (pendRow[5] !== 'pending') return { ok: false, error: 'already_decided' };

    const data = JSON.parse(pendRow[2]);
    const proposerUserId = pendRow[3];
    const note = payload.note || '';

    // update
    const now = new Date();
    pendSheet.getRange(pendRowIdx + 1, 6).setValue('rejected');
    pendSheet.getRange(pendRowIdx + 1, 7).setValue(lineUserId);
    pendSheet.getRange(pendRowIdx + 1, 8).setValue(formatISOBangkok(now));
    pendSheet.getRange(pendRowIdx + 1, 9).setValue(note);

    // notify proposer
    try {
      pushText(proposerUserId, `สารใหม่ "${data.name}" ไม่ได้รับอนุมัติ` + (note ? `\nเหตุผล: ${note}` : ''));
    } catch (e) {
      logWarn('rejectMaterial_notify_proposer_failed', e.message);
    }

    logInfo('rejectMaterial', `${payload.pending_id} note=${note}`, payload);
    return { ok: true };
  } catch (e) {
    logError('rejectMaterial', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: addEmployee (owner only) ==========

function addEmployee(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    if (!payload.name) return { ok: false, error: 'missing_name' };
    const role = payload.role || 'staff';
    if (role !== 'staff' && role !== 'owner') return { ok: false, error: 'invalid_role' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const empSheet = ss.getSheetByName('Employees');
    const empCode = nextId(ss, 'Employees', 'EMP', false);
    const now = new Date();

    empSheet.appendRow([
      empCode,
      String(payload.name).trim(),
      role,
      true,
      formatISOBangkok(now),
      lineUserId,
    ]);

    logInfo('addEmployee', `${empCode} ${payload.name} role=${role}`, payload);
    return { ok: true, emp_code: empCode };
  } catch (e) {
    logError('addEmployee', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: listEmployees (owner only) ==========

function listEmployees(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const empData = ss.getSheetByName('Employees').getDataRange().getValues();
    const userMap = ss.getSheetByName('User_Map').getDataRange().getValues();

    const empToUser = {};
    userMap.slice(1).forEach(r => {
      if (r[3] === true) empToUser[r[1]] = r[0];
    });

    const employees = empData.slice(1).map(r => ({
      emp_code: r[0],
      name: r[1],
      role: r[2],
      is_active: r[3] === true,
      paired_line_user_id: empToUser[r[0]] || '',
      is_paired: !!empToUser[r[0]],
      created_at: r[4],
    }));

    return { ok: true, employees: employees };
  } catch (e) {
    logError('listEmployees', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: updateMinStock (owner only) ==========

function updateMinStock(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    if (!payload.material_id) return { ok: false, error: 'missing_material_id' };
    const minStock = parseFloat(payload.min_stock);
    if (isNaN(minStock) || minStock < 0) return { ok: false, error: 'invalid_min_stock' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const matSheet = ss.getSheetByName('Materials');
    const matData = matSheet.getDataRange().getValues();

    let rowIdx = -1;
    for (let i = 1; i < matData.length; i++) {
      if (matData[i][0] === payload.material_id) {
        rowIdx = i;
        break;
      }
    }
    if (rowIdx === -1) return { ok: false, error: 'material_not_found' };

    matSheet.getRange(rowIdx + 1, 4).setValue(minStock);
    matSheet.getRange(rowIdx + 1, 10).setValue(formatISOBangkok(new Date()));

    logInfo('updateMinStock', `${payload.material_id} min_stock=${minStock}`);
    return { ok: true };
  } catch (e) {
    logError('updateMinStock', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: softDeleteMaterial (owner only) ==========

function softDeleteMaterial(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    if (!payload.material_id) return { ok: false, error: 'missing_material_id' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const matSheet = ss.getSheetByName('Materials');
    const matData = matSheet.getDataRange().getValues();
    const lotsData = ss.getSheetByName('Inventory_Lots').getDataRange().getValues();

    // เช็คว่ามี active lot ที่ qty > 0 ไหม
    const stillHasStock = lotsData.slice(1).some(r =>
      r[1] === payload.material_id && r[9] === true && parseFloat(r[4]) > 0
    );
    if (stillHasStock) {
      return { ok: false, error: 'still_has_stock' };
    }

    let rowIdx = -1;
    for (let i = 1; i < matData.length; i++) {
      if (matData[i][0] === payload.material_id) {
        rowIdx = i;
        break;
      }
    }
    if (rowIdx === -1) return { ok: false, error: 'material_not_found' };

    matSheet.getRange(rowIdx + 1, 5).setValue(false);  // is_active = false
    matSheet.getRange(rowIdx + 1, 10).setValue(formatISOBangkok(new Date()));

    logInfo('softDeleteMaterial', payload.material_id);
    return { ok: true };
  } catch (e) {
    logError('softDeleteMaterial', e.message, payload);
    return { ok: false, error: e.message };
  }
}
