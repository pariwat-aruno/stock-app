/**
 * Setup.gs — สร้าง Sheet schema + seed Config + Drive folder + Script Properties
 *
 * รันลำดับนี้ครั้งแรก:
 *   1) ใส่ SHEET_ID + DRIVE_FOLDER_ID ใน Script Properties (manual ผ่าน UI)
 *   2) setupDatabase()   → สร้าง Sheet 10 tab + headers
 *   3) seedConfig()      → ใส่ค่า default ใน Sheet `Config`
 *   4) setupDrive()      → set permission anyone-with-link
 *   5) setupProperties() → print รายการ Properties ที่ต้องมี
 *   6) setupAlertTrigger() → ตั้ง daily trigger 08:00
 *
 * Secret (ACCESS_TOKEN, SECRET) ใส่ผ่าน Apps Script UI manual
 * ทุก function idempotent — รันซ้ำได้
 */

// ========== SCHEMA (ตรงกับ CONTEXT.md § 4) ==========

/**
 * Sheet 10 tab + headers
 */
const SHEET_HEADERS = {
  // === Pairing pattern (foundation) ===
  'Employees': [
    'emp_code', 'name', 'role',
    'is_active', 'created_at', 'created_by',
  ],
  'User_Map': [
    'line_user_id', 'emp_code', 'paired_at', 'is_active',
  ],
  'Pairing_Codes': [
    'code', 'emp_code', 'created_at', 'expires_at',
    'status', 'redeemed_at', 'redeemed_by_line_user_id', 'failed_attempts',
  ],

  // === Stock entities (project-specific) ===
  'Materials': [
    'material_id', 'name', 'unit', 'min_stock',
    'is_active', 'proposed_by_line_user_id', 'approved_by_line_user_id', 'approved_at',
    'created_at', 'updated_at', 'note',
  ],
  'Inventory_Lots': [
    'lot_id', 'material_id', 'lot_no',
    'qty_initial', 'qty_remaining',
    'supplier', 'received_at', 'expire_date',
    'received_by_line_user_id', 'is_active', 'note',
  ],
  'Movements': [
    'movement_id', 'type', 'material_id', 'lot_id', 'qty',
    'actor_line_user_id', 'for_user_note',
    'image_url_1', 'image_url_2', 'image_url_3',
    'created_at',
  ],

  // === Approval pattern (foundation) ===
  'Pending_Changes': [
    'pending_id', 'type', 'payload_json',
    'proposed_by_line_user_id', 'proposed_at',
    'status', 'decided_by_line_user_id', 'decided_at', 'decision_note',
  ],

  // === Audit + system (foundation — บังคับมี) ===
  'Audit_Log': [
    'timestamp', 'line_user_id', 'emp_code',
    'action', 'payload_summary', 'result',
  ],
  'Logs': ['timestamp', 'level', 'function', 'message', 'payload'],
  'Config': ['key', 'value', 'note'],
};

/**
 * default ค่าใน Sheet Config
 * เจ้าของแก้ผ่าน Sheet UI โดยไม่ต้องแก้ code
 */
const CONFIG_DEFAULTS = [
  { key: 'owner_line_user_ids', value: '', note: 'ใส่ LINE userId ของเจ้าของ (comma-separated หากมีหลายคน) — เปิด myid.html เพื่อดู ID' },
  { key: 'alert_hour', value: '8', note: 'ส่ง alert ตอน 8 โมงเช้า (24-hour)' },
  { key: 'expire_warning_days', value: '30', note: 'alert ก่อนสารหมดอายุกี่วัน' },
  { key: 'pairing_code_ttl_hours', value: '24', note: 'รหัสจับคู่หมดอายุใน X ชั่วโมง' },
  { key: 'pairing_max_failed_attempts', value: '5', note: 'ใส่รหัสผิดกี่ครั้งจะถูก block' },
  { key: 'brand_name', value: 'โรงงานเครื่องสำอาง', note: 'ชื่อโรงงานที่จะแสดงใน UI + flex card' },
];

/**
 * Drive subfolder structure (ภายใต้ root)
 * จริง ๆ จะสร้าง year-month/in หรือ year-month/out ตอน upload (on-demand)
 */
const DRIVE_SUBFOLDERS = ['in', 'out'];

/**
 * Script Properties ที่เป็น non-secret IDs (ตั้งผ่าน setupProperties — print guide)
 * Secret (LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET) ใส่ผ่าน Apps Script UI manual
 */
const NON_SECRET_PROPS = [
  'SHEET_ID',
  'DRIVE_FOLDER_ID',
  'LIFF_ID_PAIR',
  'LIFF_ID_IN',
  'LIFF_ID_OUT',
  'LIFF_ID_LIST',
  'LIFF_ID_PROPOSE',
  'LIFF_ID_ADMIN',
  'LIFF_ID_MYID',
  'BRAND_NAME',
];

const SECRET_PROPS = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
];

// ========== SETUP FUNCTIONS ==========

/**
 * สร้าง Sheet 10 tab + headers (idempotent)
 * ต้องตั้ง SHEET_ID ใน Script Properties ก่อน
 */
function setupDatabase() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) {
    throw new Error('ยังไม่ได้ตั้ง SHEET_ID ใน Script Properties — ไป Project Settings → Script Properties แล้วใส่ SHEET_ID');
  }

  const ss = SpreadsheetApp.openById(sheetId);
  const existingTabs = ss.getSheets().map(s => s.getName());

  let created = 0;
  let skipped = 0;

  Object.keys(SHEET_HEADERS).forEach(tabName => {
    let sheet;
    if (existingTabs.indexOf(tabName) === -1) {
      sheet = ss.insertSheet(tabName);
      created++;
    } else {
      sheet = ss.getSheetByName(tabName);
      skipped++;
    }
    // ใส่ headers (ทำซ้ำได้ — overwrite ก็โอเค เพราะค่าเดิม)
    const headers = SHEET_HEADERS[tabName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  });

  // ลบ Sheet1 ถ้ามีและไม่อยู่ใน list
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && Object.keys(SHEET_HEADERS).indexOf('Sheet1') === -1) {
    ss.deleteSheet(defaultSheet);
  }

  const msg = `setupDatabase สำเร็จ — สร้างใหม่ ${created} tab · ข้าม ${skipped} tab (มีอยู่แล้ว)`;
  Logger.log(msg);
  return msg;
}

/**
 * ใส่ค่า default ใน Sheet Config (idempotent — skip ถ้า key มีอยู่)
 */
function seedConfig() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('ยังไม่ได้ตั้ง SHEET_ID');

  const ss = SpreadsheetApp.openById(sheetId);
  const configSheet = ss.getSheetByName('Config');
  if (!configSheet) throw new Error('Sheet "Config" ไม่มี — รัน setupDatabase ก่อน');

  // อ่าน existing keys
  const data = configSheet.getDataRange().getValues();
  const existingKeys = data.slice(1).map(row => row[0]);

  let added = 0;
  CONFIG_DEFAULTS.forEach(item => {
    if (existingKeys.indexOf(item.key) === -1) {
      configSheet.appendRow([item.key, item.value, item.note]);
      added++;
    }
  });

  const msg = `seedConfig สำเร็จ — เพิ่ม ${added} keys ใหม่`;
  Logger.log(msg);
  return msg;
}

/**
 * Setup Drive root folder permission (idempotent)
 * จริง ๆ subfolder สร้าง on-demand ตอน upload — ตรงนี้แค่ verify root + set permission
 */
function setupDrive() {
  const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!folderId) {
    throw new Error('ยังไม่ได้ตั้ง DRIVE_FOLDER_ID ใน Script Properties');
  }

  const folder = DriveApp.getFolderById(folderId);
  // permission: anyone with link can view (สำหรับ LINE Flex thumbnail)
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const msg = `setupDrive สำเร็จ — Drive folder "${folder.getName()}" set permission anyone-with-link`;
  Logger.log(msg);
  return msg;
}

/**
 * Print รายการ Script Properties ที่ต้องมี — guide user ใส่ผ่าน UI
 * (ไม่ overwrite ที่มีอยู่แล้ว)
 */
function setupProperties() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperties();

  let report = '=== Script Properties ที่ต้องมี ===\n\n';
  report += '--- NON-SECRET (ใส่ค่าได้จาก setupProperties นี้) ---\n';

  NON_SECRET_PROPS.forEach(key => {
    const has = existing.hasOwnProperty(key) && existing[key];
    report += `  ${has ? '✓' : '✗'} ${key}` + (has ? ` = ${existing[key]}` : ' (ยังไม่ตั้ง)') + '\n';
  });

  report += '\n--- SECRET (ต้องใส่ผ่าน UI manual) ---\n';
  SECRET_PROPS.forEach(key => {
    const has = existing.hasOwnProperty(key) && existing[key];
    report += `  ${has ? '✓' : '✗'} ${key}` + (has ? ' (ตั้งแล้ว · ไม่ print value)' : ' (ยังไม่ตั้ง)') + '\n';
  });

  report += '\nวิธีใส่: Apps Script editor → Project Settings → Script Properties → Add';
  Logger.log(report);
  return report;
}

/**
 * One-shot setup ทั้งหมด — รันคำสั่งเดียวจบ
 * (ต้องตั้ง SHEET_ID + DRIVE_FOLDER_ID ก่อน)
 */
function setupAll() {
  const results = [];
  results.push(setupDatabase());
  results.push(seedConfig());
  results.push(setupDrive());
  results.push(setupProperties());
  const summary = results.join('\n\n');
  Logger.log(summary);
  return summary;
}

/**
 * เผื่อเปลี่ยน schema ในอนาคต — migration helper
 * (skeleton — ไม่ implement จริง ตอน schema เปลี่ยนค่อยเขียน)
 */
function migrateSchema_v1_to_v2() {
  // TODO: implement เมื่อมี schema change
  throw new Error('ยังไม่มี migration ใน MVP');
}
