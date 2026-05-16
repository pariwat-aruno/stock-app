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
  API_URL: 'https://script.google.com/macros/s/AKfycbyzNgnuHgPFLnXtKX-9BSfExOqW5Mi0_JDbFPdNddDyxNyGI9xvRN0Ab19IIq-5nzkiyA/exec',

  // === LIFF App IDs (7 ตัว) ===
  LIFF_ID_PAIR:    '2010103289-x8xGsCA0',
  LIFF_ID_IN:      '2010103289-hJHB0Nwk',
  LIFF_ID_OUT:     '2010103289-bo94huhO',
  LIFF_ID_LIST:    '2010103289-tPqGVf9z',
  LIFF_ID_PROPOSE: '2010103289-EQKXh2HJ',
  LIFF_ID_ADMIN:   '2010103289-IzekFlmu',
  LIFF_ID_MYID:    '2010103289-KXlzoITP',

  // === Brand ===
  BRAND_NAME: 'โรงงานเครื่องสำอาง',

  // === Dev mode ===
  DEV_MOCK_LIFF: false,
  DEV_MOCK_USER_ID: 'Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
};
