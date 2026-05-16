/**
 * config.js — Stock App LIFF configuration
 *
 * ⚠️ ต้องแก้ค่าหลัง deploy:
 *   1. API_URL = Apps Script Web App URL (หลัง deploy)
 *   2. LIFF_ID_* = LIFF App IDs จาก LINE Developers
 *
 * Dev mode:
 *   - DEV_MOCK_LIFF=true → ทดสอบใน browser ปกติได้ (mock LINE userId)
 *   - DEV_MOCK_USER_ID = LINE userId ของพี่ปุ้ย (ตั้งเป็น owner ใน Sheet Config)
 */

export const CONFIG = {
  // === Apps Script Web App URL ===
  API_URL: 'REPLACE_ME_AFTER_DEPLOY',

  // === LIFF App IDs (7 ตัว) ===
  LIFF_ID_PAIR:    'REPLACE_LIFF_ID_PAIR',
  LIFF_ID_IN:      'REPLACE_LIFF_ID_IN',
  LIFF_ID_OUT:     'REPLACE_LIFF_ID_OUT',
  LIFF_ID_LIST:    'REPLACE_LIFF_ID_LIST',
  LIFF_ID_PROPOSE: 'REPLACE_LIFF_ID_PROPOSE',
  LIFF_ID_ADMIN:   'REPLACE_LIFF_ID_ADMIN',
  LIFF_ID_MYID:    'REPLACE_LIFF_ID_MYID',

  // === Brand ===
  BRAND_NAME: 'โรงงานเครื่องสำอาง',

  // === Dev mode ===
  DEV_MOCK_LIFF: false,
  DEV_MOCK_USER_ID: 'Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
};
