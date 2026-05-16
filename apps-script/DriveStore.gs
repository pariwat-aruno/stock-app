/**
 * DriveStore.gs — รับ base64 → upload ไป Drive → return URL
 *
 * Pattern: DRIVE_FOLDER_ID (root) → <year-month> → <in|out>
 * subPath format: "2026-05/in" หรือ "2026-05/out"
 *
 * permission: anyone with link, view
 */

/**
 * upload base64 image → Drive → return public URL
 *
 * @param {string} base64 — data URL (data:image/...;base64,xxx) หรือ raw base64
 * @param {string} subPath — relative path under root (e.g. "2026-05/in")
 * @param {string} filename — ชื่อไฟล์ (เช่น "MOV-20260515-0001_1.jpg")
 * @return {string} public URL
 */
function uploadImage(base64, subPath, filename) {
  if (!base64) throw new Error('uploadImage: base64 ว่าง');
  if (!filename) throw new Error('uploadImage: filename ว่าง');
  if (!subPath) throw new Error('uploadImage: subPath ว่าง');

  const rootId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!rootId) throw new Error('uploadImage: DRIVE_FOLDER_ID not set');

  // navigate / create subfolders
  const parts = subPath.split('/').filter(s => s.length > 0);
  let folder = DriveApp.getFolderById(rootId);
  parts.forEach(name => {
    folder = getOrCreateSubfolder_(folder, name);
  });

  // decode base64
  let raw = base64;
  let mimeType = 'image/jpeg';
  const m = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (m) {
    mimeType = m[1];
    raw = m[2];
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(raw);
  } catch (err) {
    logError('uploadImage', 'base64 decode failed', { filename: filename, err: err.message });
    throw new Error('invalid_base64');
  }

  const blob = Utilities.newBlob(bytes, mimeType, filename);
  const file = folder.createFile(blob);

  // permission: anyone with link, view
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    logWarn('uploadImage', 'setSharing failed: ' + err.message, { fileId: file.getId() });
  }

  return file.getUrl();
}

/**
 * find sub-folder by name under parent, or create if not exists
 */
function getOrCreateSubfolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}
