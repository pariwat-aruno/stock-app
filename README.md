# Stock App — ระบบคลังวัตถุดิบโรงงานเครื่องสำอาง

LIFF mini-app สำหรับบันทึกการรับเข้า-เบิกออกของสารวัตถุดิบในโรงงานเครื่องสำอาง พร้อม trace ผู้ใช้และ alert ใกล้หมด/ใกล้หมดอายุ

**Stack:** GitHub Pages (LIFF) + Apps Script (API) + Google Sheet (DB) + LINE Messaging API + Drive (รูปภาพ)

---

## ⚠️ อ่านก่อนเริ่ม

| ไฟล์ | อ่านเมื่อไหร่ |
|---|---|
| **CLAUDE.md** | Claude Code อ่านก่อนเขียน code ทุกครั้ง |
| **CONTEXT.md** | ทุกคน — glossary + role + data model |
| **TASKS.md** | Claude Code — หยิบ task ทีละชิ้น |
| **docs/architecture.md** | ก่อน implement — เข้าใจ data flow |

---

## Features (MVP)

| Feature | Role | Description |
|---|---|---|
| **Pairing** | Visitor → Owner | คนใหม่ใส่ code 6 หลักเพื่อ pair บัญชี LINE |
| **รับเข้า** | Staff | บันทึกสารรับเข้า + ถ่าย 3 รูป + lot + expire |
| **เบิกออก** | Staff | เบิกสารตาม lot (FIFO suggest) + 3 รูป + ระบุผู้ใช้ |
| **ดูสต๊อก** | Staff/Owner | List สาร + คงเหลือ + lots + filter |
| **เสนอสารใหม่** | Staff → Owner | propose → flex card → approve/reject |
| **Admin** | Owner | จัดการพนักงาน · อนุมัติ · audit · ตั้งค่า min_stock |
| **Alert daily 08:00** | Owner | ใกล้หมด (< min_stock) + ใกล้หมดอายุ (≤ 30 วัน) |

---

## Workflow ขั้นตอนทำงาน (Claude Code)

```
1. อ่าน CLAUDE.md (recipe + gotchas)
   ↓
2. อ่าน CONTEXT.md (glossary + data model)
   ↓
3. อ่าน docs/architecture.md (flows)
   ↓
4. หยิบ TASK-01 จาก TASKS.md → implement → ติ๊ก
   ↓
5. clasp push (apps-script) / git push (liff/)
   ↓
6. หยิบ task ถัดไป
```

---

## Manual setup ที่ Claude ทำให้ไม่ได้

- [ ] สร้าง Google Sheet เปล่า + copy SHEET_ID
- [ ] สร้าง Google Drive folder + copy DRIVE_FOLDER_ID
- [ ] สร้าง LINE OA + Messaging API channel ([LINE Developers](https://developers.line.biz/console/))
- [ ] สร้าง 7 LIFF apps
- [ ] วาง `liff/img/logo.jpg`
- [ ] ตั้ง Script Properties: LINE_CHANNEL_ACCESS_TOKEN + LINE_CHANNEL_SECRET (manual ผ่าน UI)
- [ ] Deploy Apps Script Web App "Anyone" (Apps Script UI — clasp 3.x ไม่รองรับ)
- [ ] Enable GitHub Pages ใน repo (Settings → Pages → GitHub Actions)
- [ ] Set LINE webhook URL = Apps Script Web App URL

---

## Project structure

```
stock-app/
├── CLAUDE.md                       # recipe (Claude อ่านอัตโนมัติ)
├── CONTEXT.md                      # domain knowledge
├── TASKS.md                        # 46 tasks
├── README.md                       # ไฟล์นี้
├── docs/architecture.md            # Mermaid + flows + edge cases
├── .github/workflows/pages.yml     # auto-deploy
├── .gitignore
├── apps-script/                    # backend
│   ├── appsscript.json
│   ├── package.json
│   ├── .claspignore
│   ├── Setup.gs                    # ⚠️ project-specific
│   ├── Logger.gs                   # foundation
│   ├── Config.gs                   # foundation
│   ├── Utils.gs                    # foundation
│   ├── LineApi.gs                  # foundation
│   ├── DriveStore.gs               # foundation
│   ├── WebApp.gs                   # foundation + project router
│   ├── FlexCard.gs                 # ⚠️ project-specific
│   ├── Reminder.gs                 # foundation skeleton
│   ├── Pairing.gs                  # ⚠️ project-specific
│   ├── Stock.gs                    # ⚠️ project-specific
│   ├── Material.gs                 # ⚠️ project-specific
│   └── Alert.gs                    # ⚠️ project-specific
├── liff/                           # frontend
│   ├── css/style.css               # foundation
│   ├── js/
│   │   ├── config.js               # ⚠️ project-specific (LIFF_IDs)
│   │   ├── api.js                  # foundation
│   │   ├── auth.js                 # foundation
│   │   ├── utils.js                # foundation
│   │   └── camera.js               # foundation
│   ├── img/logo.jpg                # ⚠️ ต้องวางเอง
│   ├── myid.html                   # foundation
│   ├── pair.html                   # ⚠️ project-specific
│   ├── in.html                     # ⚠️ project-specific
│   ├── out.html                    # ⚠️ project-specific
│   ├── list.html                   # ⚠️ project-specific
│   ├── propose.html                # ⚠️ project-specific
│   └── admin.html                  # ⚠️ project-specific
└── scripts/
    └── setup_rich_menu.py          # ⚠️ project-specific
```

**Foundation** = ไฟล์ที่ copy ตรงไม่ต้องแก้
**Project-specific** = ไฟล์ที่สร้าง/แก้ตาม CONTEXT.md

---

## เริ่มทำงาน (Claude Code)

```bash
cd ~/Downloads/stock-app
claude
```

แล้วบอก Claude Code:
> "อ่าน CLAUDE.md, CONTEXT.md, TASKS.md แล้วเริ่มจาก TASK-01"

Claude Code จะอ่านครบและ implement ทีละ task

---

## Timeline (1.5 วัน)

| Day | Time | งาน |
|---|---|---|
| 1 | Morning | Setup Sheet/Drive/LINE/LIFF + Apps Script foundation |
| 1 | Afternoon | Apps Script flows (Pairing/Stock/Material/Alert) |
| 2 | Morning | LIFF frontend + Rich menu + Deploy + Test |
| 2 | Afternoon | Inventory count + Train ทีม |
