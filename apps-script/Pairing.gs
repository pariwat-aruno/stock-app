/**
 * Pairing.gs — ระบบจับคู่บัญชี LINE กับ Employee record
 *
 * Flow:
 *   1) Owner เพิ่ม Employee (name, role) → ได้ emp_code
 *   2) Owner กด issuePairingCode(emp_code) → ได้ 6-digit code (TTL 24h)
 *   3) Owner ส่ง code ให้พนักงานผ่าน LINE
 *   4) พนักงานเปิด LIFF pair.html → ใส่ code → redeemPairingCode(code, lineUserId)
 *   5) ระบบ insert User_Map → พนักงานใช้ระบบได้
 *
 * Daily trigger 00:00 → expirePairingCodes()
 */

// ========== Helper: lookup helpers ==========

/**
 * เช็คว่า lineUserId paired กับ employee คนไหน
 * @returns {{paired: boolean, emp_code?: string, role?: string, name?: string}}
 */
function getPairedInfo_(lineUserId) {
  if (!lineUserId) return { paired: false };

  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

  // 1) check User_Map
  const userMap = ss.getSheetByName('User_Map').getDataRange().getValues();
  const userRow = userMap.slice(1).find(r => r[0] === lineUserId && r[3] === true);
  if (!userRow) return { paired: false };

  const empCode = userRow[1];

  // 2) lookup Employee
  const emp = ss.getSheetByName('Employees').getDataRange().getValues();
  const empRow = emp.slice(1).find(r => r[0] === empCode);
  if (!empRow) return { paired: false };

  return {
    paired: true,
    emp_code: empCode,
    name: empRow[1],
    role: empRow[2],
    is_active: empRow[3] === true,
  };
}

/**
 * เช็คว่า lineUserId เป็น staff ที่ paired แล้วและ active
 */
function isPairedStaff(lineUserId) {
  const info = getPairedInfo_(lineUserId);
  return info.paired && info.is_active && (info.role === 'staff' || info.role === 'owner');
}

// ========== Action: getMe (called from LIFF init) ==========

function getMe(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!lineUserId) return { ok: false, error: 'missing_line_user_id' };

    const info = getPairedInfo_(lineUserId);
    if (!info.paired) {
      return { ok: true, paired: false };
    }

    return {
      ok: true,
      paired: true,
      emp_code: info.emp_code,
      name: info.name,
      role: info.role,
      is_owner: isOwner(lineUserId),
    };
  } catch (e) {
    logError('getMe', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: issuePairingCode (owner only) ==========

function issuePairingCode(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    if (!isOwner(lineUserId)) return { ok: false, error: 'not_owner' };

    const empCode = payload.emp_code;
    if (!empCode) return { ok: false, error: 'missing_emp_code' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

    // verify employee exists + active
    const emp = ss.getSheetByName('Employees').getDataRange().getValues();
    const empRow = emp.slice(1).find(r => r[0] === empCode);
    if (!empRow) return { ok: false, error: 'employee_not_found' };
    if (empRow[3] !== true) return { ok: false, error: 'employee_inactive' };

    // revoke active codes ของ emp_code นี้
    const pcSheet = ss.getSheetByName('Pairing_Codes');
    const pcData = pcSheet.getDataRange().getValues();
    for (let i = 1; i < pcData.length; i++) {
      if (pcData[i][1] === empCode && pcData[i][4] === 'active') {
        pcSheet.getRange(i + 1, 5).setValue('revoked');
      }
    }

    // generate 6-digit code (ไม่ซ้ำกับ active codes ปัจจุบัน)
    let code;
    let attempts = 0;
    do {
      code = String(Math.floor(100000 + Math.random() * 900000));
      attempts++;
      if (attempts > 100) throw new Error('cannot_generate_unique_code');
    } while (pcData.slice(1).some(r => r[0] === code && r[4] === 'active'));

    // calc expires_at
    const ttlHours = parseInt(getConfig('pairing_code_ttl_hours', '24'), 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);

    // insert
    pcSheet.appendRow([
      code,
      empCode,
      formatISOBangkok(now),
      formatISOBangkok(expiresAt),
      'active',
      '',  // redeemed_at
      '',  // redeemed_by
      0,   // failed_attempts
    ]);

    logInfo('issuePairingCode', `code=${code} emp=${empCode}`, payload);
    return {
      ok: true,
      code: code,
      emp_code: empCode,
      emp_name: empRow[1],
      expires_at: formatISOBangkok(expiresAt),
      expires_in_hours: ttlHours,
    };
  } catch (e) {
    logError('issuePairingCode', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Action: redeemPairingCode (anyone with code) ==========

function redeemPairingCode(payload) {
  try {
    const lineUserId = payload && payload.lineUserId;
    const code = payload && payload.code;
    if (!lineUserId) return { ok: false, error: 'missing_line_user_id' };
    if (!code || !/^\d{6}$/.test(code)) return { ok: false, error: 'invalid_code_format' };

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));

    // check ยังไม่ paired
    const existing = getPairedInfo_(lineUserId);
    if (existing.paired) return { ok: false, error: 'already_paired', emp_code: existing.emp_code };

    const pcSheet = ss.getSheetByName('Pairing_Codes');
    const pcData = pcSheet.getDataRange().getValues();

    // find code
    let rowIdx = -1;
    for (let i = 1; i < pcData.length; i++) {
      if (String(pcData[i][0]) === code && pcData[i][4] === 'active') {
        rowIdx = i;
        break;
      }
    }
    if (rowIdx === -1) return { ok: false, error: 'invalid_code' };

    const row = pcData[rowIdx];
    const empCode = row[1];
    const expiresAt = new Date(row[3]);
    const now = new Date();
    const maxFailed = parseInt(getConfig('pairing_max_failed_attempts', '5'), 10);

    if (now > expiresAt) {
      pcSheet.getRange(rowIdx + 1, 5).setValue('expired');
      return { ok: false, error: 'code_expired' };
    }

    if (row[7] >= maxFailed) {
      pcSheet.getRange(rowIdx + 1, 5).setValue('revoked');
      return { ok: false, error: 'too_many_attempts' };
    }

    // OK to redeem
    // update User_Map
    const umSheet = ss.getSheetByName('User_Map');
    umSheet.appendRow([lineUserId, empCode, formatISOBangkok(now), true]);

    // update Pairing_Codes
    pcSheet.getRange(rowIdx + 1, 5).setValue('used');
    pcSheet.getRange(rowIdx + 1, 6).setValue(formatISOBangkok(now));
    pcSheet.getRange(rowIdx + 1, 7).setValue(lineUserId);

    // lookup name + role
    const info = getPairedInfo_(lineUserId);

    logInfo('redeemPairingCode', `lineUserId=${lineUserId} emp=${empCode}`, payload);

    // push welcome flex to user (optional)
    try {
      pushText(lineUserId, `จับคู่บัญชีสำเร็จ คุณ${info.name} (${info.role === 'owner' ? 'เจ้าของ' : 'พนักงานคลัง'}) — เริ่มใช้งานได้เลย`);
    } catch (e) {
      logWarn('redeemPairingCode_push_welcome_failed', e.message);
    }

    return {
      ok: true,
      emp_code: empCode,
      name: info.name,
      role: info.role,
    };
  } catch (e) {
    logError('redeemPairingCode', e.message, payload);
    return { ok: false, error: e.message };
  }
}

// ========== Daily trigger: expirePairingCodes ==========

function expirePairingCodes() {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const pcSheet = ss.getSheetByName('Pairing_Codes');
    const data = pcSheet.getDataRange().getValues();
    const now = new Date();

    let expired = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][4] === 'active') {
        const expAt = new Date(data[i][3]);
        if (now > expAt) {
          pcSheet.getRange(i + 1, 5).setValue('expired');
          expired++;
        }
      }
    }

    logInfo('expirePairingCodes', `expired ${expired} codes`);
    return { ok: true, expired: expired };
  } catch (e) {
    logError('expirePairingCodes', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Setup daily trigger 00:00 → expirePairingCodes
 */
function setupPairingTrigger() {
  // ลบ trigger เก่า
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'expirePairingCodes') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // สร้างใหม่
  ScriptApp.newTrigger('expirePairingCodes')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();
  return 'setupPairingTrigger สำเร็จ — trigger ตั้งทุกวัน 00:00';
}

// ========== Test functions ==========

function testIssuePairingCode_() {
  // Owner ของพี่ปุ้ย (ดึงจาก Config)
  const ownerIds = (getConfig('owner_line_user_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!ownerIds.length) throw new Error('ยังไม่ตั้ง owner_line_user_ids ใน Sheet Config');

  // เพิ่ม test employee
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  const empSheet = ss.getSheetByName('Employees');
  const empCode = `EMP-TEST-${Math.floor(Math.random() * 1000)}`;
  empSheet.appendRow([empCode, 'ทดสอบ', 'staff', true, formatISOBangkok(new Date()), ownerIds[0]]);

  // issue code
  const r = issuePairingCode({ lineUserId: ownerIds[0], emp_code: empCode });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
