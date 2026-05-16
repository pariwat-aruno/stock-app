# TASKS.md — Stock App

> Claude อ่านไฟล์นี้คู่กับ CONTEXT.md + docs/architecture.md + CLAUDE.md
> ทำทีละ task ตามลำดับ ห้ามข้าม dependency
> เมื่อทำ task เสร็จ → `clasp push` (สำหรับ apps-script) หรือ `git push` (สำหรับ liff/)

---

## วิธีใช้

1. หยิบ task แรกที่ยังไม่ติ๊ก
2. อ่าน acceptance criteria
3. Implement
4. ทดสอบตาม "Test" ที่ระบุ
5. ติ๊ก ✅ → task ถัดไป

---

## Phase 1 — Setup ฐานข้อมูล + Storage

### ✅ TASK-01: เตรียม Setup.gs
**Files:** `apps-script/Setup.gs`
**Acceptance:**
- มี constant `SHEET_HEADERS` ครอบ 10 sheets ตรงกับ CONTEXT.md § 4
- มี constant `CONFIG_DEFAULTS` ตรงกับ CONTEXT.md § 4 Sheet Config
- มี constant `DRIVE_SUBFOLDERS = ['in', 'out']` (จะสร้างใต้ year-month อีกที)
- มี constant `NON_SECRET_PROPS = ['SHEET_ID', 'DRIVE_FOLDER_ID', 'LIFF_ID_PAIR', 'LIFF_ID_IN', 'LIFF_ID_OUT', 'LIFF_ID_LIST', 'LIFF_ID_PROPOSE', 'LIFF_ID_ADMIN', 'LIFF_ID_MYID', 'BRAND_NAME']`

### ✅ TASK-02: setupDatabase() function
**Files:** `apps-script/Setup.gs`
**Acceptance:**
- ใช้ SHEET_ID จาก Script Properties
- ถ้า sheet ไม่มี → create + set headers
- ถ้า sheet มี → skip (idempotent)
- รัน 2 ครั้ง = ผลเหมือนเดิม
**Test:** รันใน Apps Script editor → Sheet มี 10 tabs ครบ

### ✅ TASK-03: seedConfig() function
**Files:** `apps-script/Setup.gs`
**Acceptance:**
- ใส่ค่า default ลง `Config` sheet ตาม `CONFIG_DEFAULTS`
- ถ้า key มีอยู่แล้ว → skip
- รัน 2 ครั้ง = ผลเหมือนเดิม
**Test:** Sheet `Config` มี 6 rows (owner_line_user_ids · alert_hour · expire_warning_days · pairing_code_ttl_hours · pairing_max_failed_attempts · brand_name)

### ✅ TASK-04: setupDrive() function
**Files:** `apps-script/Setup.gs`
**Acceptance:**
- ใช้ DRIVE_FOLDER_ID จาก Script Properties
- ไม่ต้องสร้าง year-month subfolder ตอนนี้ (สร้าง on-demand ตอน upload)
- Set permission anyone-with-link สำหรับ root folder
**Test:** เปิด Drive folder จาก browser ตรงๆ ได้

### ✅ TASK-05: setupProperties() function
**Files:** `apps-script/Setup.gs`
**Acceptance:**
- print รายการ Script Properties ที่ต้องมี (สำหรับ user check)
- ไม่ overwrite ที่มีอยู่แล้ว
- guide user ใส่ที่ Apps Script editor → Project Settings → Script Properties
**Test:** รันแล้ว print list ตรงตาม CONTEXT.md § 4

---

## Phase 2 — LINE Channel + LIFF + Rich Menu

### TASK-06: สร้าง LINE Messaging API channel (manual ผ่าน UI)
**By:** พี่ปุ้ย
**Acceptance:**
- ไปที่ https://developers.line.biz/console/
- สร้าง Provider (ถ้ายังไม่มี)
- สร้าง Messaging API channel ชื่อ "Stock App"
- เปิด webhook · ปิด auto-reply · ปิด greeting message
- Publish channel (ไม่ใช่ Developing)
- copy ACCESS_TOKEN + SECRET → ใส่ Script Properties

### TASK-07: สร้าง 7 LIFF apps (manual ผ่าน UI)
**By:** พี่ปุ้ย
**Acceptance:** สร้าง LIFF apps 7 ตัวภายใต้ channel:
| # | name | size | endpoint (ใส่ placeholder ก่อน) | scope |
|---|---|---|---|---|
| 1 | Pair | tall | `https://USERNAME.github.io/REPO/pair.html` | profile + openid |
| 2 | In | full | `.../in.html` | profile + openid |
| 3 | Out | full | `.../out.html` | profile + openid |
| 4 | List | tall | `.../list.html` | profile + openid |
| 5 | Propose | tall | `.../propose.html` | profile + openid |
| 6 | Admin | full | `.../admin.html` | profile + openid |
| 7 | MyID | compact | `.../myid.html` | profile + openid |

- Bot link feature: On (Aggressive)
- copy 7 LIFF IDs → ใส่ Script Properties

### ✅ TASK-08: Rich menu image + setup_rich_menu.py
**Files:** `scripts/setup_rich_menu.py`
**Acceptance:**
- Python script generate image 2500×843 (full size)
- 4 sections: รับเข้า / เบิกออก / สต๊อก / เสนอสาร + 1 admin (สีเข้ม)
- upload ผ่าน LINE Messaging API
- set default rich menu
**Test:** รัน → rich menu ปรากฏใน LINE chat

---

## Phase 3 — Apps Script Foundation

### ✅ TASK-09: clasp setup
**By:** Claude Code
```bash
cd apps-script
npm install --save-dev @google/clasp
./node_modules/.bin/clasp login
./node_modules/.bin/clasp create-script --type standalone --title "stock-app-backend"
./node_modules/.bin/clasp push --force
```
**Acceptance:** `.clasp.json` ถูกสร้างใน apps-script/ (อยู่ใน .gitignore)

### ✅ TASK-10: Copy foundation files (8 ไฟล์)
**Files:** `apps-script/{Logger,Config,Utils,LineApi,DriveStore,WebApp,FlexCard,Reminder}.gs`
**Acceptance:**
- copy ตรงจาก foundation (มีให้แล้ว) ไม่ต้องแก้
- `Reminder.gs` neutralized — keep file แต่ implement trigger ใน Alert.gs แทน
**Test:** `clasp push` ไม่มี error

---

## Phase 4 — Apps Script Endpoints (project-specific)

### ✅ TASK-11: Pairing.gs — issuePairingCode
**Files:** `apps-script/Pairing.gs`
**Acceptance:**
- `issuePairingCode(empCode, byOwnerLineUserId)`
  - verify isOwner
  - find Employee by emp_code
  - revoke active codes ของ emp_code (set status=revoked)
  - generate 6-digit random
  - insert `Pairing_Codes` (status=active, expires=24h)
  - return `{ ok, code, expires_at }`
**Test:** call จาก Apps Script editor → row ใหม่ใน Sheet · status=active

### ✅ TASK-12: Pairing.gs — redeemPairingCode
**Files:** `apps-script/Pairing.gs`
**Acceptance:**
- `redeemPairingCode(code, lineUserId)`
  - find code in `Pairing_Codes` where status=active
  - check expires_at > now
  - if userId already paired → reject "already_paired"
  - if not match → increment failed_attempts → ถ้า ≥5 → revoke
  - if match → insert `User_Map` + update code status=used
  - return `{ ok, emp_code, name, role }`
**Test:** issue → redeem → User_Map มี row + code status=used

### ✅ TASK-13: Pairing.gs — expirePairingCodes (daily trigger)
**Files:** `apps-script/Pairing.gs`
**Acceptance:**
- `expirePairingCodes()` find codes where status=active AND expires_at < now → set status=expired
- setup trigger: daily 00:00
**Test:** sleep code → run → status=expired

### ✅ TASK-14: Pairing.gs — getMe (for LIFF init)
**Files:** `apps-script/Pairing.gs`
**Acceptance:**
- `getMe(lineUserId)` → check User_Map
- return `{ ok, paired: bool, emp_code?, role?, name? }`
**Test:** ยังไม่ pair → paired=false · pair แล้ว → paired=true + role

### ✅ TASK-15: Stock.gs — receiveMaterial
**Files:** `apps-script/Stock.gs`
**Acceptance:**
- `receiveMaterial(payload, lineUserId)`
  - payload: `{ material_id, lot_no, qty, supplier, expire_date, note, images: [b64, b64, b64] }`
  - verify isPairedStaff (or isOwner)
  - validate qty > 0 + 3 images + expire_date valid
  - upload 3 images → Drive `/Stock/<YYYY-MM>/in/` (filename = `<movement_id>_<n>.jpg`)
  - insert `Inventory_Lots` (lot_id, qty_initial=qty, qty_remaining=qty)
  - insert `Movements` (type=in, image URLs as thumbnail format)
  - push flex receipt → Owner
  - return `{ ok, lot_id, movement_id }`
**Test:** ส่ง JSON + 3 base64 → Drive มี 3 ไฟล์ + Sheet มี row 2 ที่ + Owner ได้ flex

### ✅ TASK-16: Stock.gs — issueMaterial
**Files:** `apps-script/Stock.gs`
**Acceptance:**
- `issueMaterial(payload, lineUserId)`
  - payload: `{ material_id, lot_id, qty, for_user_note, images: [b64×3] }`
  - verify paired
  - lock check qty ≤ lot.qty_remaining (re-read sheet)
  - upload 3 รูป → `/Stock/<YYYY-MM>/out/`
  - update `Inventory_Lots.qty_remaining -= qty`
  - insert `Movements` (type=out, for_user_note)
  - push flex receipt → Owner
**Test:** สร้าง lot 100 → เบิก 30 → คงเหลือ 70 + Owner ได้ flex

### ✅ TASK-17: Stock.gs — listStock
**Files:** `apps-script/Stock.gs`
**Acceptance:**
- `listStock(payload, lineUserId)` (paired only)
- aggregate sum(qty_remaining) per material_id (where is_active)
- mark each material:
  - `is_low`: qty < material.min_stock (skip if min_stock=0)
  - `has_expiring`: any active lot expire ≤ today + 30d
- sort: has_expiring → is_low → name
- return `{ ok, materials: [{material_id, name, unit, qty, min_stock, is_low, has_expiring}] }`
**Test:** mock 5 สาร → return array sorted

### ✅ TASK-18: Stock.gs — getLotsForMaterial
**Files:** `apps-script/Stock.gs`
**Acceptance:**
- `getLotsForMaterial(material_id, lineUserId)` (paired only)
- return active lots (qty_remaining > 0)
- sort by expire_date ASC (FIFO hint)
- include lot_id, lot_no, qty_remaining, expire_date, supplier
**Test:** material with 3 lots → return 3 sorted

### ✅ TASK-19: Stock.gs — listMovements (admin only)
**Files:** `apps-script/Stock.gs`
**Acceptance:**
- `listMovements(payload, lineUserId)` (owner only)
- filter: type, material_id, date_from, date_to, limit (default 50)
- return rows with actor name (lookup User_Map → Employees)
**Test:** filter type=out → return only out

### ✅ TASK-20: Material.gs — proposeMaterial
**Files:** `apps-script/Material.gs`
**Acceptance:**
- `proposeMaterial(payload, lineUserId)` (paired only)
- payload: `{ name, unit, min_stock?, note? }`
- check name ไม่ซ้ำใน `Materials` (case-insensitive)
- insert `Pending_Changes` (type=new_material, status=pending, payload_json)
- push flex card "มีคำขออนุมัติ" → Owner (with approve/reject buttons)
- return `{ ok, pending_id }`
**Test:** propose → Pending_Changes มี row + Owner ได้ flex

### ✅ TASK-21: Material.gs — approveMaterial / rejectMaterial
**Files:** `apps-script/Material.gs`
**Acceptance:**
- `approveMaterial(pending_id, lineUserId)` (owner only)
  - read Pending_Changes
  - insert `Materials` (with proposed_by + approved_by + approved_at)
  - update Pending status=approved
  - push flex → staff "สารของคุณได้รับอนุมัติ"
- `rejectMaterial(pending_id, lineUserId, note)` (owner only)
  - update Pending status=rejected + decision_note
  - push flex → staff "สารของคุณไม่ได้รับอนุมัติ" + เหตุผล

### ✅ TASK-22: Material.gs — listPending (admin)
**Files:** `apps-script/Material.gs`
**Acceptance:**
- `listPending(lineUserId)` (owner only)
- return pending where status=pending
- include proposer name + payload preview

### ✅ TASK-23: Material.gs — addEmployee (admin)
**Files:** `apps-script/Material.gs`
**Acceptance:**
- `addEmployee(payload, lineUserId)` (owner only)
- payload: `{ name, role }`
- generate emp_code (running)
- insert Employees + return emp_code

### ✅ TASK-24: Material.gs — updateMinStock (admin)
**Files:** `apps-script/Material.gs`
**Acceptance:**
- `updateMinStock(material_id, min_stock, lineUserId)` (owner only)
- update Materials row

### ✅ TASK-25: Material.gs — softDeleteMaterial (admin)
**Files:** `apps-script/Material.gs`
**Acceptance:**
- `softDeleteMaterial(material_id, lineUserId)` (owner only)
- check: ถ้ามี active lot (qty_remaining > 0) → reject "still_has_stock"
- update Materials.is_active = false
- return ok

### ✅ TASK-26: Alert.gs — checkLowStock
**Files:** `apps-script/Alert.gs`
**Acceptance:**
- `checkLowStock()` (called by daily trigger 08:00)
- find materials where total qty < min_stock (skip min_stock=0)
- if found → push flex carousel → all owners
- if not found → skip (no message)

### ✅ TASK-27: Alert.gs — checkExpiringLots
**Files:** `apps-script/Alert.gs`
**Acceptance:**
- `checkExpiringLots()` (called by daily trigger 08:00)
- find active lots where expire_date ≤ today + expire_warning_days (default 30) AND qty_remaining > 0
- merge with low_stock → single message ถ้ามีทั้งคู่
- push flex → owners

### ✅ TASK-28: Alert.gs — setupAlertTrigger()
**Files:** `apps-script/Alert.gs`
**Acceptance:**
- delete existing triggers ของ `runDailyAlerts`
- create new time-based trigger: daily 08:00 → `runDailyAlerts()`
- `runDailyAlerts()` calls checkLowStock + checkExpiringLots ลำดับ

### ✅ TASK-29: WebApp.gs — routeAction_ extension
**Files:** `apps-script/WebApp.gs`
**Acceptance:** เพิ่ม cases:
```
'getMe' → getMe
'redeemPairing' → redeemPairingCode
'receiveMaterial' → receiveMaterial
'issueMaterial' → issueMaterial
'listStock' → listStock
'getLotsForMaterial' → getLotsForMaterial
'listMovements' → listMovements
'proposeMaterial' → proposeMaterial
// Owner only:
'addEmployee' / 'issuePairingCode' / 'listPending' / 'approveMaterial' /
'rejectMaterial' / 'updateMinStock' / 'softDeleteMaterial' / 'listMaterials' / 'listEmployees'
```
- ทุก case: try-catch + log Audit_Log

### ✅ TASK-30: FlexCard.gs — build cards
**Files:** `apps-script/FlexCard.gs`
**Acceptance:** build functions:
- `buildReceiveReceiptCard(movement_id, material, qty, lot_no, actor_name, images)` — รับเข้าสำเร็จ
- `buildIssueReceiptCard(...)` — เบิกออกสำเร็จ
- `buildPendingApprovalCard(pending_id, name, unit, proposer_name)` — มีคำขออนุมัติ (2 buttons: Approve / Reject)
- `buildLowStockAlertCard(items)` — alert ใกล้หมด
- `buildExpiringLotsAlertCard(items)` — alert ใกล้หมดอายุ
- ทุก card: header logo + brand · footer brand · cherry palette

### ✅ TASK-31: Test functions
**Files:** ตาม flow
**Acceptance:**
- `testIssuePairingCode_()` — bypass owner check
- `previewLowStockToOwner_()` — preview flex
- `previewExpiringLotsToOwner_()` — preview flex
- `testReceiveMaterial_()` — bypass paired check + เอา image จาก Drive

---

## Phase 5 — LIFF Frontend

### ✅ TASK-32: liff/css/style.css + shared js
**Files:** `liff/css/style.css`, `liff/js/{config,api,auth,utils,camera}.js`
**Acceptance:** copy จาก foundation (no project edits except config.js)
- `config.js` — placeholder ทั้งหมด (API_URL = "REPLACE_ME", LIFF_IDs)

### ✅ TASK-33: liff/myid.html
**Files:** `liff/myid.html`
**Acceptance:** copy จาก foundation (show LINE userId + copy button)

### ✅ TASK-34: liff/pair.html
**Files:** `liff/pair.html`
**Acceptance:**
- LIFF init → getProfile → call `getMe`
- if paired → redirect ปกติ (rich menu)
- if not paired → แสดง:
  - User ID + ปุ่ม "คัดลอก User ID"
  - คำสั่งให้ส่ง User ID ให้เจ้าของ
  - form input "ใส่รหัสจับคู่ 6 หลัก"
  - ปุ่ม "ยืนยัน" → call `redeemPairing`
- handle error: invalid_code, expired, max_attempts
- success → "จับคู่สำเร็จ — ปิดหน้านี้ได้"

### ✅ TASK-35: liff/in.html
**Files:** `liff/in.html`
**Acceptance:**
- LIFF init → check paired (else redirect pair.html)
- step 1: เลือกสาร (datalist autocomplete จาก `listMaterials`)
- step 2: กรอก lot_no, qty, unit (auto), supplier, expire_date, note
- step 3: ถ่ายรูป 3 ใบ (camera.js + captureFromVideoWithStamp) — บังคับครบ
- ปุ่ม submit → call `receiveMaterial` (with base64 × 3)
- show progress: "อัปโหลดรูป 1/3...", "บันทึก..."
- success → "บันทึกสำเร็จ" + ปุ่มกลับ rich menu
- error → toast + allow retry

### ✅ TASK-36: liff/out.html
**Files:** `liff/out.html`
**Acceptance:**
- เลือกสาร → call `getLotsForMaterial` → show lots (FIFO suggest top)
- เลือก lot → show qty คงเหลือ
- กรอก qty (validate ≤ คงเหลือ) + for_user_note (เช่น "ให้ RD-สมชาย")
- ถ่ายรูป 3 ใบ
- submit → call `issueMaterial`

### ✅ TASK-37: liff/list.html
**Files:** `liff/list.html`
**Acceptance:**
- call `listStock` → render list
- แต่ละ row: ชื่อสาร · qty + unit · badge "ใกล้หมด" (สีส้ม) / "ใกล้หมดอายุ" (สีแดง)
- search bar (filter ชื่อ)
- tap row → expand lots (lot_no, qty, expire, supplier)

### ✅ TASK-38: liff/propose.html
**Files:** `liff/propose.html`
**Acceptance:**
- form: name, unit, min_stock (optional), note
- submit → `proposeMaterial`
- success → "ส่งคำขออนุมัติแล้ว เจ้าของจะตอบกลับ"

### ✅ TASK-39: liff/admin.html
**Files:** `liff/admin.html`
**Acceptance:**
- LIFF init → check isOwner (call `getMe` → role=owner)
- 5 tabs:
  1. **พนักงาน** — list employees + add new + issue pairing code
  2. **อนุมัติสาร** — list pending + approve/reject
  3. **ตั้งค่าสาร** — list materials + edit min_stock + soft-delete
  4. **ประวัติ** — list movements (filter type, date)
  5. **ตั้งค่า** — show Sheet Config (read-only · บอก link Sheet)
- not_owner → "คุณไม่มีสิทธิ์เข้าถึงหน้านี้"

---

## Phase 6 — Deploy + ทดสอบ

### TASK-40: Deploy Apps Script Web App
**By:** พี่ปุ้ย
**Acceptance:**
- Apps Script editor → Deploy → New deployment → Web app
- Execute as: Me / Who has access: **Anyone**
- copy URL → ส่งให้ Claude Code

### TASK-41: Update LIFF config + push GitHub
**By:** Claude Code
**Acceptance:**
- update `liff/js/config.js` API_URL + 7 LIFF_IDs
- `git push` → GitHub Actions deploy GitHub Pages
- ยืนยัน 7 LIFF URL เปิดได้

### TASK-42: Update LINE Developers
**By:** พี่ปุ้ย
**Acceptance:**
- update 7 LIFF endpoint URLs = GitHub Pages URLs จริง
- set webhook URL = Apps Script Web App URL (verify อาจ fail = ปกติ)

### TASK-43: Upload rich menu
**By:** Claude Code (call by user)
**Acceptance:**
- รัน `python3 scripts/setup_rich_menu.py`
- LINE chat แสดง rich menu

### TASK-44: ทดสอบ end-to-end
**By:** พี่ปุ้ย + Claude Code
**Acceptance:**
- [ ] Pairing flow: คนใหม่เปิด LIFF → ขอ code → pair สำเร็จ
- [ ] รับเข้า: เลือกสาร → ถ่าย 3 รูป → save → ดูใน Sheet + Drive
- [ ] เบิกออก: เลือกสาร → เลือก lot → ถ่าย 3 รูป → save · คงเหลือลด
- [ ] ดูสต๊อก: list ขึ้น · expand lots ได้
- [ ] เสนอสารใหม่: submit → owner ได้ flex → approve → สารใหม่ใน catalog
- [ ] Admin: 5 tabs ทำงาน
- [ ] Alert: รัน `previewLowStockToOwner_()` → owner ได้ flex

---

## Phase 7 — Setup Alert Triggers + Inventory Count

### TASK-45: Setup daily trigger
**By:** Claude Code (call by user)
**Acceptance:**
- รัน `setupAlertTrigger()` ใน Apps Script editor
- check Triggers → มี time-based trigger daily 08:00

### TASK-46: Day-1 inventory count
**By:** พี่ปุ้ย + ทีม
**Acceptance:**
- นับสารทั้งหมดในคลังจริง
- propose สารใหม่ → owner approve (หรือ owner เพิ่มเองผ่าน Sheet ตรงๆ ตอน setup)
- รับเข้า "ยอดยกมา" ผ่าน in.html (note: "ยกมาจากการนับวันแรก")

---

## Definition of Done

- [ ] ทุก task ติ๊กครบ
- [ ] Test ทุก flow ผ่านในมือถือจริง (รวมการถ่ายรูป 3 ใบ)
- [ ] Daily alert trigger ทำงาน (รอเช้าวันรุ่งขึ้นเพื่อ verify)
- [ ] Owner ได้ flex card ทุก transaction
- [ ] Sheet `Audit_Log` มี row ทุก action
- [ ] CONTEXT.md ตรงกับ implementation
- [ ] commit + push GitHub
- [ ] ส่ง LIFF URL ให้พนักงานคลัง 2-3 คน
- [ ] train ทีม

---

## หมายเหตุสำคัญ (สำหรับ Claude Code)

1. **clasp push เสมอ** หลังแก้ .gs ทุกครั้ง — ห้ามบอกพี่ปุ้ยให้ push เอง
2. **setupProperties()** ต้องมี ในไฟล์ Setup.gs — พี่ปุ้ยรันครั้งเดียว ห้ามบอกให้ใส่ Properties manual ทีละค่า
3. **คัดลอก User ID button** บนหน้า pair.html ห้ามขาด — admin จะ lookup userId ไม่ได้
4. **ห้าม `<input type="file">`** ทุกที่ — รูปต้องผ่าน camera.js + captureFromVideoWithStamp เท่านั้น
5. **Flex Message เท่านั้น** — ห้าม plain text push
6. **try-catch ทุก function** + log Sheet `Logs`
