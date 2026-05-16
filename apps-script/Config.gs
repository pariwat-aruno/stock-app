/**
 * Config.gs — อ่านค่าตั้งระบบ
 *
 * 2 แหล่ง:
 *   1) Script Properties — secret + ID (SHEET_ID, LINE token, LIFF IDs)
 *   2) Sheet `Config` — settings ที่เจ้าของแก้เองได้ (owner_line_user_ids, alert_hour, ...)
 *
 * cache 5 นาที กัน read sheet ซ้ำ
 *
 * Usage:
 *   const cfg = getConfig();              // full object
 *   const val = getConfig('alert_hour');  // single key
 *   const v   = getConfig('xxx', '8');    // single key + default
 */

const CONFIG_CACHE_KEY = 'stock_app_config_v1';
const CONFIG_CACHE_TTL = 300; // 5 นาที

/**
 * Unified getConfig
 *   - getConfig()           → full object (Script Props + Sheet Config + OWNER_LINE_USER_IDS resolved)
 *   - getConfig(key)        → string value of key (or undefined)
 *   - getConfig(key, def)   → string value (or default)
 */
function getConfig(key, defaultValue) {
  const cfg = buildConfigObject_();

  if (arguments.length === 0) {
    return cfg;
  }

  const val = cfg[key];
  if (val == null || val === '') {
    return (arguments.length >= 2) ? defaultValue : undefined;
  }
  return val;
}

function buildConfigObject_() {
  const props = PropertiesService.getScriptProperties();
  const cfg = {};

  // === Script Properties (non-secret + IDs) ===
  const propKeys = [
    'SHEET_ID',
    'DRIVE_FOLDER_ID',
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'LIFF_ID_PAIR',
    'LIFF_ID_IN',
    'LIFF_ID_OUT',
    'LIFF_ID_LIST',
    'LIFF_ID_PROPOSE',
    'LIFF_ID_ADMIN',
    'LIFF_ID_MYID',
    'BRAND_NAME',
  ];
  propKeys.forEach(k => {
    const v = props.getProperty(k);
    if (v) cfg[k] = v;
  });

  // SHEET_ID + LINE_CHANNEL_ACCESS_TOKEN เป็น minimal required
  if (!cfg.SHEET_ID) {
    throw new Error('missing required Script Property: SHEET_ID');
  }

  // === Sheet `Config` (settings) ===
  Object.assign(cfg, readSheetConfig_(cfg.SHEET_ID));

  // === Owners — รองรับหลายคน ===
  let ownerIds = [];
  if (cfg.owner_line_user_ids) {
    ownerIds = String(cfg.owner_line_user_ids)
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  cfg.OWNER_LINE_USER_IDS = ownerIds;

  return cfg;
}

/** เช็คว่า userId เป็น owner ไหม */
function isOwner(userId) {
  if (!userId) return false;
  try {
    const cfg = getConfig();
    return cfg.OWNER_LINE_USER_IDS && cfg.OWNER_LINE_USER_IDS.indexOf(userId) >= 0;
  } catch (e) {
    return false;
  }
}

/** push message ให้ owner ทุกคน */
function pushToAllOwners(messages) {
  try {
    const cfg = getConfig();
    if (!cfg.OWNER_LINE_USER_IDS || cfg.OWNER_LINE_USER_IDS.length === 0) {
      logWarn('pushToAllOwners', 'no owners configured');
      return;
    }
    cfg.OWNER_LINE_USER_IDS.forEach(uid => {
      try {
        pushMessage(uid, messages);
      } catch (e) {
        logError('pushToAllOwners', `failed for ${uid}: ${e.message}`);
      }
    });
  } catch (e) {
    logError('pushToAllOwners', e.message);
  }
}

/**
 * อ่านค่าจาก sheet `Config` (cache 5 นาที)
 * return: object ของ key→value
 */
function readSheetConfig_(sheetId) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CONFIG_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Config');
  if (!sh) {
    // Config sheet ยังไม่ถูกสร้าง — return empty object (setupDatabase จะสร้างให้)
    return {};
  }

  const last = sh.getLastRow();
  const result = {};
  if (last >= 2) {
    const data = sh.getRange(2, 1, last - 1, 2).getValues();
    data.forEach(row => {
      const k = row[0];
      let v = row[1];
      if (!k) return;
      // Sheets auto-convert "08:00" → Date — format กลับเป็น HH:mm string
      if (v instanceof Date) {
        v = Utilities.formatDate(v, 'Asia/Bangkok', 'HH:mm');
      }
      result[k] = v;
    });
  }

  cache.put(CONFIG_CACHE_KEY, JSON.stringify(result), CONFIG_CACHE_TTL);
  return result;
}

/** invalidate cache (เรียกตอนเจ้าของแก้ค่าใน sheet) */
function clearConfigCache() {
  CacheService.getScriptCache().remove(CONFIG_CACHE_KEY);
  return 'config cache cleared';
}
