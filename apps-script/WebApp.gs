/**
 * WebApp.gs — entry point ของ Apps Script Web App
 *
 * Stock App เป็น API-only — LIFF frontend host ที่ GitHub Pages
 *
 * doGet  — health check
 * doPost — รับ 2 ชนิด:
 *   1. LINE webhook event (มี field `events`)
 *   2. LIFF action (มี field `action` + `payload`)
 */

function doGet(e) {
  return jsonOut_({
    ok: true,
    service: 'stock-app',
    version: '0.1',
    note: 'Stock App API — LIFF frontend host ที่ GitHub Pages',
  });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    logError('doPost', 'invalid JSON: ' + err.message, e && e.postData ? e.postData.contents : '');
    return jsonOut_({ ok: false, error: 'invalid_json' });
  }

  try {
    // Webhook event (LINE)
    if (Array.isArray(body.events)) {
      body.events.forEach(handleLineEvent_);
      return jsonOut_({ ok: true });
    }

    // LIFF action
    if (body.action) {
      const result = routeAction_(body.action, body.payload || {});
      return jsonOut_(result);
    }

    return jsonOut_({ ok: false, error: 'unknown_request' });
  } catch (err) {
    logError('doPost', err.message, body);
    return jsonOut_({ ok: false, error: err.message });
  }
}

// ========== Router (LIFF actions) ==========

/** route LIFF action → handler + log audit */
function routeAction_(action, payload) {
  const result = dispatchAction_(action, payload);
  try {
    logAuditAction_(action, payload, result);
  } catch (e) {
    logWarn('routeAction_audit_failed', e.message);
  }
  return result;
}

function dispatchAction_(action, payload) {
  switch (action) {
    // === Pairing (open to anyone with LINE) ===
    case 'getMe':                return getMe(payload);
    case 'redeemPairing':        return redeemPairingCode(payload);

    // === Staff (verify isPairedStaff in handler) ===
    case 'receiveMaterial':      return receiveMaterial(payload);
    case 'issueMaterial':        return issueMaterial(payload);
    case 'listStock':            return listStock(payload);
    case 'getLotsForMaterial':   return getLotsForMaterial(payload);
    case 'listMaterials':        return listMaterials(payload);
    case 'proposeMaterial':      return proposeMaterial(payload);

    // === Owner only (verify isOwner in handler) ===
    case 'addEmployee':          return addEmployee(payload);
    case 'listEmployees':        return listEmployees(payload);
    case 'issuePairingCode':     return issuePairingCode(payload);
    case 'listPending':          return listPending(payload);
    case 'approveMaterial':      return approveMaterial(payload);
    case 'rejectMaterial':       return rejectMaterial(payload);
    case 'updateMinStock':       return updateMinStock(payload);
    case 'softDeleteMaterial':   return softDeleteMaterial(payload);
    case 'listMovements':        return listMovements(payload);

    default:
      return { ok: false, error: 'unknown_action', action: action };
  }
}

// ========== Audit logger ==========

function logAuditAction_(action, payload, result) {
  if (!action) return;

  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    const auditSheet = ss.getSheetByName('Audit_Log');
    if (!auditSheet) return;

    const lineUserId = (payload && payload.lineUserId) || '';
    let empCode = '';
    try {
      if (lineUserId && typeof getPairedInfo_ === 'function') {
        const info = getPairedInfo_(lineUserId);
        if (info && info.paired) empCode = info.emp_code;
      }
    } catch (e) {}

    auditSheet.appendRow([
      formatISOBangkok(new Date()),
      lineUserId,
      empCode,
      action,
      summarizePayload_(payload),
      result && result.ok ? 'ok' : 'error',
    ]);
  } catch (e) {
    // silent
  }
}

function summarizePayload_(payload) {
  if (!payload) return '';
  try {
    const clone = {};
    Object.keys(payload).forEach(k => {
      if (k === 'images' && Array.isArray(payload[k])) {
        clone[k] = `[${payload[k].length} images]`;
      } else if (typeof payload[k] === 'string' && payload[k].length > 100) {
        clone[k] = payload[k].slice(0, 100) + '...';
      } else {
        clone[k] = payload[k];
      }
    });
    return JSON.stringify(clone);
  } catch (e) {
    return '<unserializable>';
  }
}

// ========== LINE webhook event handlers ==========

function handleLineEvent_(ev) {
  if (!ev || !ev.type) return;

  if (ev.type === 'message' && ev.message && ev.message.type === 'text') {
    return handleMessageEvent_(ev);
  }

  if (ev.type === 'postback') {
    return handlePostback_(ev);
  }

  if (ev.type === 'follow') {
    return replyText(ev.replyToken,
      'ยินดีต้อนรับสู่ระบบคลังวัตถุดิบ\n\n' +
      'กดเมนูด้านล่างเพื่อเริ่มใช้งาน — หากยังไม่ได้รับสิทธิ์ ติดต่อเจ้าของเพื่อขอ "รหัสจับคู่"\n\n' +
      'พิมพ์ "id" เพื่อดู LINE User ID ของคุณ');
  }
}

/**
 * Message event handler:
 *   "id" → reply userId
 *   "รอ" / "pending" → reply pending approvals (owner only)
 *   "แจ้งเตือน" → run daily alert preview (owner only)
 *   อื่น ๆ → hint
 */
function handleMessageEvent_(ev) {
  const userId = ev.source && ev.source.userId;
  const text = (ev.message.text || '').trim();
  const lower = text.toLowerCase();
  logInfo('message', text, { userId: userId });

  if (lower === 'id') {
    return replyText(ev.replyToken,
      'LINE User ID ของคุณ:\n\n' + userId + '\n\n' +
      'คัดลอกส่งให้เจ้าของเพื่อขอสิทธิ์เข้าระบบ');
  }

  if (lower === 'รอ' || lower === 'pending' || lower === 'รออนุมัติ') {
    return replyPendingMaterials_(ev);
  }

  if (lower === 'alert' || lower === 'แจ้งเตือน' || lower === 'alerts') {
    return replyAlertPreview_(ev);
  }

  return replyText(ev.replyToken,
    'คำสั่งที่ใช้ได้:\n' +
    '• "id" — ดู LINE User ID\n' +
    '• "รอ" — รายการขออนุมัติสารใหม่ (เจ้าของ)\n' +
    '• "แจ้งเตือน" — preview alert (เจ้าของ)\n\n' +
    'หรือใช้เมนูด้านล่าง');
}

/**
 * Reply pending materials (owner only)
 */
function replyPendingMaterials_(ev) {
  const userId = ev.source && ev.source.userId;
  if (!isOwner(userId)) {
    return replyText(ev.replyToken, 'คำสั่งนี้สำหรับเจ้าของเท่านั้น');
  }

  const result = listPending({ lineUserId: userId });
  if (!result.ok || !result.pending || result.pending.length === 0) {
    return replyText(ev.replyToken, 'ไม่มีคำขออนุมัติที่รออยู่');
  }

  const items = result.pending.slice(0, 10);
  const bubbles = items.map(p => buildPendingApprovalCard({
    pending_id: p.pending_id,
    material_name: p.payload.name || '-',
    unit: p.payload.unit || '-',
    min_stock: p.payload.min_stock || 0,
    note: p.payload.note || '',
    proposer_name: p.proposer_name,
  }));

  return replyMessage(ev.replyToken, [{
    type: 'flex',
    altText: `มีคำขออนุมัติ ${result.pending.length} รายการ`,
    contents: { type: 'carousel', contents: bubbles },
  }]);
}

/**
 * Preview daily alert (owner only)
 */
function replyAlertPreview_(ev) {
  const userId = ev.source && ev.source.userId;
  if (!isOwner(userId)) {
    return replyText(ev.replyToken, 'คำสั่งนี้สำหรับเจ้าของเท่านั้น');
  }

  const r = runDailyAlerts();
  if (r && r.ok && !r.sent) {
    return replyText(ev.replyToken, 'ไม่มีรายการแจ้งเตือนวันนี้');
  }
  return replyText(ev.replyToken, 'ส่งแจ้งเตือนเรียบร้อย');
}

/**
 * Postback handler — รับจากปุ่มใน Flex Card
 * ใน MVP: เปิด LIFF admin ผ่าน uri action โดยตรง (ไม่ใช้ postback)
 * เก็บ skeleton ไว้เผื่ออนาคต
 */
function handlePostback_(ev) {
  const userId = ev.source && ev.source.userId;
  const data = parsePostbackData_(ev.postback.data);
  logInfo('postback', JSON.stringify(data), { userId: userId });
  return; // no-op for now
}

function parsePostbackData_(s) {
  const out = {};
  if (!s) return out;
  s.split('&').forEach(function (pair) {
    const kv = pair.split('=');
    out[kv[0]] = decodeURIComponent(kv[1] || '');
  });
  return out;
}

// ========== Output helper ==========

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
