# CLAUDE.md — Stock App (คลังวัตถุดิบโรงงานเครื่องสำอาง)

> **อ่านไฟล์นี้ก่อนเริ่มทำงานบน project นี้ทุกครั้ง**
> Recipe นี้สรุปจาก LIFF mini-app foundation ที่ build จริง

---

## 1. Stack ที่บังคับใช้

| Layer | ใช้อะไร | เหตุผล |
|---|---|---|
| Frontend (LIFF) | GitHub Pages (vanilla HTML + ES module) | ฟรี + LINE webview compat |
| Backend (API) | Google Apps Script Web App (doPost JSON) | ฟรี + ผูก Sheet ตรง |
| Database | Google Sheet (multi-tab pattern) | ฟรี + เจ้าของแก้เองได้ |
| File storage | Google Drive (folder + sub-folders) | ฟรี + thumbnail URL render ใน flex |
| Channel | LINE Messaging API + LIFF + rich menu | ผู้ใช้ครอบคลุมในไทย |
| CI/CD | GitHub Actions (pages.yml) | auto-deploy ตอน push |

**ห้าม:**
- ห้าม host LIFF บน Apps Script HtmlService → LIFF SDK ใช้ไม่ได้ใน iframe sandbox
- ห้าม commit secret (token/secret) ลง git → ใช้ Script Properties แทน
- ห้าม set deployment access ผ่าน clasp → reset เป็น "Only myself" ทุกครั้ง — ใช้ UI เท่านั้น
- ห้ามใช้ `<input type="file">` สำหรับรูป → ใช้ `getUserMedia` (camera.js) เท่านั้น

---

## 2. โครงสร้าง project

```
stock-app/
├── CONTEXT.md              # glossary + data model + conventions (บังคับใช้)
├── TASKS.md                # phased tasks + acceptance criteria
├── README.md               # public readme
├── CLAUDE.md               # ไฟล์นี้
├── docs/
│   └── architecture.md     # flows + setup checklist
├── .github/workflows/
│   └── pages.yml           # auto-deploy liff/ → GitHub Pages
├── .gitignore
├── apps-script/            # backend (push ผ่าน clasp)
│   ├── .clasp.json         # script ID (gitignore)
│   ├── .claspignore
│   ├── appsscript.json     # timeZone Asia/Bangkok
│   ├── package.json
│   ├── Setup.gs            # schema + setupDatabase + seedConfig + setupDrive + setupProperties
│   ├── Logger.gs           # logInfo/logWarn/logError → Sheet Logs
│   ├── Config.gs           # getConfig + isOwner + pushToAllOwners
│   ├── Utils.gs            # IDs + datetime + formatThaiDateTime
│   ├── LineApi.gs          # pushMessage/replyMessage + retry
│   ├── DriveStore.gs       # uploadImage (base64 → Drive subfolder)
│   ├── FlexCard.gs         # buildAlertCard, buildPendingCard, buildReceiptCard
│   ├── WebApp.gs           # doPost router + handleLineEvent_
│   ├── Pairing.gs          # issuePairingCode + redeemPairingCode
│   ├── Stock.gs            # receiveMaterial + issueMaterial + listStock + listMovements
│   ├── Material.gs         # proposeMaterial + approveMaterial + rejectMaterial
│   ├── Alert.gs            # checkLowStock + checkExpiringLots (08:00 daily)
│   └── node_modules/       # gitignore
├── liff/                   # frontend (host GitHub Pages)
│   ├── css/style.css       # cherry palette + brand utility
│   ├── js/
│   │   ├── config.js       # LIFF_IDs + API_URL + DEV_MOCK
│   │   ├── api.js          # POST helper (text/plain CORS workaround)
│   │   ├── auth.js         # initAuth (LIFF init + getProfile)
│   │   ├── utils.js        # fileToResizedBase64 + showError
│   │   └── camera.js       # startCamera + captureFromVideoWithStamp + stopCamera
│   ├── img/logo.jpg
│   ├── myid.html           # show LINE userId (สำหรับ owner เก็บ ID)
│   ├── pair.html           # ใส่ pairing code
│   ├── in.html             # รับสารเข้า (ถ่าย 3 รูป)
│   ├── out.html            # เบิกสารออก (ถ่าย 3 รูป)
│   ├── list.html           # ดูสต๊อกคงเหลือ
│   ├── propose.html        # เสนอสารใหม่ (staff)
│   └── admin.html          # owner LIFF (audit + approve)
└── scripts/
    └── setup_rich_menu.py  # generate image + upload via LINE API
```

---

## 3. Phased workflow (เคร่งครัด)

### Phase 1 — Sheet + Drive
- เขียน `Setup.gs::setupDatabase()` สร้าง Sheet 10 tab + headers
- `seedConfig()` ใส่ค่า default ใน Sheet `Config`
- `setupDrive()` สร้าง Drive folder root + 2 sub-folder (in/out) + permission anyone-with-link
- ผู้ใช้รัน → ส่ง SHEET_ID + DRIVE_FOLDER_ID กลับมา → save ลง memory

### Phase 2 — LINE Channel + LIFF
- ผู้ใช้สร้าง: LINE OA + Messaging API channel + 6 LIFF apps + rich menu
- Claude เขียน `setup_rich_menu.py` regenerate image + upload
- ขอ: LINE_CHANNEL_ACCESS_TOKEN + LINE_CHANNEL_SECRET + LIFF_IDs (6 ตัว)

### Phase 3 — Apps Script foundation
- Copy `Logger/Config/Utils/LineApi/DriveStore.gs` ตาม template (ไม่ต้องแก้)
- Setup `clasp` (`npm install --save-dev @google/clasp` ใน apps-script/)
- `clasp create-script --type standalone --title "stock-app-backend"`
- `clasp push --force`

### Phase 4 — Apps Script endpoints
- เขียน `Pairing.gs` + `Stock.gs` + `Material.gs` + `Alert.gs` ตาม TASKS
- Update `WebApp.gs::routeAction_` เพิ่ม case ใหม่
- เขียน `FlexCard.gs::build*Card()` per card type
- ใส่ test functions

### Phase 5 — LIFF frontend
- เขียน HTML files ใน `liff/`
- ใช้ shared CSS + JS modules
- ทุกหน้า: logo + brand + footer brand
- `in.html` + `out.html` ใช้ camera.js → captureFromVideoWithStamp 3 ใบ

### Phase 6 — Deploy + ทดสอบ
- ผู้ใช้ Apps Script → Deploy → New deployment → Web app → Anyone → Deploy → ส่ง URL กลับ
- update `liff/js/config.js` API_URL → push GitHub
- ผู้ใช้ตั้ง LINE webhook URL = web app URL
- ผู้ใช้ update LIFF endpoint URLs = GitHub Pages URLs
- ทดสอบ flow ผ่าน LINE จริง

### Phase 7 — Alert triggers + Day-1 inventory count
- ตั้ง trigger: `checkLowStock` + `checkExpiringLots` daily 08:00
- Owner รัน `seedInitialInventory()` กรอกยอดยกมาวันแรก (manual ผ่าน Sheet)

---

## 4. Workflow per code change (สำคัญ — clasp 3.x bug)

```
แก้ local
   ↓
clasp push --force                      # อัพ HEAD
   ↓
clasp create-version "<desc>"           # สร้าง immutable version snapshot
   ↓
[ผู้ใช้] Apps Script → Deploy → Manage  # ผ่าน UI เพราะ clasp reset access เป็น Only myself
        → Edit เก่า → Version: ใหม่ล่าสุด → Deploy
```

**ห้าม** `clasp create-deployment --deploymentId X` หรือ `clasp update-deployment` — reset access ทุกครั้ง → 404 จาก outside

**สำคัญ:** Claude Code ต้องเป็นคนรัน `clasp push` เอง ทุกครั้งที่แก้ code — ห้ามบอกพี่ปุ้ยให้รันเอง

---

## 5. Conventions (บังคับ)

### Code
- Comment ใน .gs/.html = ไทย, function/var = อังกฤษ
- Apps Script function ทุกตัวต้อง try-catch + log ลง Sheet `Logs`
- Datetime: `Asia/Bangkok` ISO 8601 พร้อม `+07:00` → ใช้ `nowBangkok()` / `formatThaiDateTime()`
- Idempotent: setup functions รันซ้ำได้ปลอดภัย
- ID format: `<PREFIX>-XXXX` running — เช่น `MAT-0001`, `LOT-YYYYMMDD-XXXX`, `MOV-YYYYMMDD-XXXX`

### Config separation
- **Script Properties** = secret + immutable IDs (ACCESS_TOKEN, SECRET, SHEET_ID, DRIVE_FOLDER_ID, LIFF_IDs)
- **Sheet `Config` row** = ค่าที่เจ้าของอาจอยากแก้เอง (owner_line_user_ids, alert_hour, expire_warning_days)
- **Sheet `Materials`** = `min_stock` ต่อสาร — แก้ผ่าน Sheet ได้

### Brand & UI
- Cherry red palette (#c8102e primary, #9a0c24 dark) — ห้าม emoji ยกเว้น ⚠️ สำหรับ warning
- Logo + brand text ทุกหน้า + flex card header
- Footer brand ทุก LIFF page

### Camera (anti-fraud)
- ใช้ `getUserMedia` (camera.js) — ห้าม `<input type=file>` (ผู้ใช้เลือก gallery ได้)
- `captureFromVideoWithStamp(videoEl, label)` ฝัง timestamp + brand ลงใน JPEG (tamper-resistant)
- ทุก transaction ถ่าย 3 รูป — บังคับครบก่อน submit ได้

---

## 6. Access control — แยก staff vs owner ชัดเจน 3 ชั้น

### ชั้น 1 — LIFF apps แยกตัว
- **Staff LIFF apps** (5 ตัว): pair / in / out / list / propose
- **Owner LIFF app** (1 ตัว แยก): admin
- คนละ LIFF ID

### ชั้น 2 — Rich menu
- 4 ปุ่มหลัก: รับเข้า / เบิกออก / สต๊อก / เสนอสารใหม่
- ปุ่ม admin (สีเข้ม) ขวาสุด — แยกชัดจาก staff button

### ชั้น 3 — Backend verify (ห้ามขาดเด็ดขาด)
- ทุก endpoint ของ owner: `if (!isOwner(payload.lineUserId)) return { ok: false, error: 'not_owner' };`
- ทุก endpoint ของ staff: `if (!isPairedStaff(payload.lineUserId)) return { ok: false, error: 'not_staff' };`
- LIFF admin frontend: catch `not_owner` → แสดง "คุณไม่มีสิทธิ์เข้าถึงหน้านี้"

**สำคัญ:** ห้ามเชื่อ frontend อย่างเดียว — backend verify คือ authoritative

---

## 7. Pairing flow (สำคัญสำหรับ project นี้)

### Workflow
1. คนใหม่เปิด LIFF ครั้งแรก → ระบบเช็ค `User_Map`
2. ถ้าไม่มี → แสดงปุ่ม "คัดลอก User ID" + ปุ่ม "ใส่ Pairing Code"
3. พนักงานส่ง User ID ให้ Owner ผ่าน LINE
4. Owner เปิด admin LIFF → เพิ่มชื่อ + role → ระบบ generate code 6 หลัก
5. Owner ส่ง code ให้พนักงาน
6. พนักงานใส่ code → ระบบ verify + พิมพ์ pair ตาราง `User_Map`

### Code rules
- 6 หลัก ตัวเลขล้วน
- TTL 24 ชม. (configurable ใน Sheet Config)
- 1 active code ต่อ emp_code — issue ใหม่ revoke เก่า
- Daily trigger: `expirePairingCodes()` ลบ code หมดอายุ
- Rate limit: ใส่ผิด 5 ครั้ง = invalidate code

---

## 8. Gotchas (เจอจริงตอน build LIFF foundation)

| ปัญหา | สาเหตุ | วิธีแก้ |
|---|---|---|
| LIFF + Apps Script HtmlService = iframe sandbox block LIFF SDK | webview bridge | host LIFF บน GitHub Pages |
| GitHub Pages บน private repo = paid plan | GitHub Free | repo ต้องเป็น public (ตรวจให้ไม่มี secret) |
| `clasp create-deployment` reset access เป็น "Only myself" → 404 | clasp 3.x | ใช้ Apps Script UI ทำ Web App deployment |
| Apps Script Web App POST → 302 redirect | normal behavior | browser fetch + LINE webhook follow ได้ |
| LINE webhook Verify = 302 fail | LINE Verify ไม่ follow redirect | ignore Verify, real event ทำงานปกติ |
| Sheet `08:00` กลายเป็น Date object ตอน read | Sheets auto-convert | format Date → 'HH:mm' string ใน readSheetConfig_ |
| Drive URL `/file/d/.../view` แสดง HTML viewer (LINE flex render ไม่ได้) | Drive default URL | แปลง → `https://drive.google.com/thumbnail?id=ID&sz=w800` |
| iOS file input บางครั้ง show gallery แม้ใส่ `capture="user"` | browser ignore hint | ใช้ getUserMedia แทน |
| `clasp push` รายงานสำเร็จแต่ server มีไฟล์ไม่ครบ | OAuth expired silently | `clasp login` ใหม่ + force push |
| Apps Script timeout 6 นาที | upload 3 รูปอาจช้า | upload แบบ sequential + log progress |

---

## 9. Test pattern

ทุก Apps Script flow ต้องมี:
- `testReceiveMaterial()` — call handler ตรง bypass time/state check
- `previewAlertToOwner()` — ส่ง flex card หา owner เพื่อดูหน้าตา
- บน LIFF: `DEV_MOCK_LIFF: true` ใน config.js ทดสอบใน browser ปกติได้

ทดสอบ POST API จาก CLI:
```bash
python3 -c "
import urllib.request, json
url = 'https://script.google.com/macros/s/.../exec'
data = json.dumps({'action':'listStock','payload':{'lineUserId':'U...'}}).encode()
req = urllib.request.Request(url, data=data, headers={'Content-Type':'text/plain;charset=utf-8'})
print(urllib.request.urlopen(req).read().decode())
"
```

---

## 10. ห้ามทำ (out of scope สำหรับ MVP — เก็บไว้ Phase 2)

- ❌ Multi-warehouse / หลายคลัง (1 คลังเดียวเท่านั้น)
- ❌ การคำนวณราคา / ต้นทุน / มูลค่า inventory
- ❌ Reorder point auto / PO อัตโนมัติ
- ❌ Barcode scanner / QR scan
- ❌ Export PDF / Excel (ดูใน Sheet ตรงๆ ได้)
- ❌ ระบบสูตร RD (BOM) — เก็บไว้ RD App Sprint หน้า
- ❌ ผูกกับ batch production — เก็บไว้ Production App Sprint หน้า

ถ้าผู้ใช้ขอเหล่านี้ → ตอบ "ออก scope MVP — Phase 2"
