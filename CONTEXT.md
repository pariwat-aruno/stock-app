# CONTEXT.md — Stock App (คลังวัตถุดิบโรงงานเครื่องสำอาง)

> **สำคัญ:** AI / Claude ต้องอ่านไฟล์นี้ก่อนทำงานบน project นี้ทุกครั้ง
> ห้ามใช้ศัพท์ที่ไม่ตรงกับที่จดไว้ในนี้

---

## 1. Project Identity

- **ชื่อ:** `stock-app`
- **ชื่อไทย:** ระบบคลังวัตถุดิบ
- **Description:** LIFF mini-app บันทึกการรับเข้า-เบิกออกของสารวัตถุดิบในโรงงานเครื่องสำอาง พร้อม trace ผู้ใช้และ alert ใกล้หมด/ใกล้หมดอายุ
- **Type:** Mini app (ไม่ใช่ enterprise)
- **Stack:** Google Sheet + Apps Script + LINE Messaging API + LIFF + GitHub Pages
- **โรงงาน:** [BRAND_NAME] (พี่ปุ้ยใส่ชื่อจริงตอน setup)

---

## 2. Glossary — ศัพท์ที่ใช้ใน project นี้

| คำที่ใช้ในระบบ | คำเทคนิค (ห้ามใช้) | ความหมาย |
|---|---|---|
| **สาร** | material / ingredient / raw material | วัตถุดิบที่ใช้ผลิตเครื่องสำอาง |
| **ล็อต** | lot / batch | จำนวนสารที่รับเข้ามาคราวเดียวกัน มีวันหมดอายุเดียวกัน |
| **คงเหลือ** | balance / stock / qty | จำนวนสารที่ยังอยู่ในคลัง |
| **รับเข้า** | goods in / receive / inbound | บันทึกสารที่รับเข้าคลัง |
| **เบิกออก** | goods out / issue / outbound | บันทึกสารที่เบิกออกจากคลัง |
| **ใกล้หมด** | low stock | คงเหลือน้อยกว่า min_stock ของสารนั้น |
| **ใกล้หมดอายุ** | expiring | expire ภายใน 30 วัน (configurable) |
| **เจ้าของ** | admin / owner / boss | คนที่อนุมัติสารใหม่และดู audit (พี่ปุ้ย) |
| **พนักงานคลัง** | warehouse staff / stock staff | คนรับเข้า/เบิกออก (2-3 คน) |
| **ผู้เยี่ยมชม** | visitor / guest | คนที่ยังไม่ pair LINE userId กับระบบ |
| **เสนอสารใหม่** | propose material | พนักงานคลังเสนอสารใหม่ที่ยังไม่มีใน catalog |
| **อนุมัติ** | approve | เจ้าของกดอนุมัติสารใหม่ |
| **รหัสจับคู่** | pairing code | code 6 หลักสำหรับ pair บัญชี LINE กับ employee |
| **คัดลอก User ID** | copy user id | ปุ่มที่พนักงานกดคัดลอก LINE userId ส่งให้เจ้าของ |

**กฎ:** ใน code, comment, doc, message ทั้งหมดใช้คอลัมน์ซ้าย ห้ามคอลัมน์กลาง (ตัวแปรในโค้ดอังกฤษได้แต่ map ตรง)

---

## 3. Roles & Permissions

| Role | จำนวน | ทำอะไรได้ | ทำไม่ได้ |
|---|---|---|---|
| **เจ้าของ** (Owner) | 1 (พี่ปุ้ย) | ทุกอย่าง + อนุมัติสารใหม่ + ออก pairing code + ดู audit + ลบสาร (soft) | — |
| **พนักงานคลัง** (Stock Staff) | 2-3 คน | รับเข้า · เบิกออก · ดูสต๊อก · เสนอสารใหม่ | อนุมัติสารใหม่ · ลบสาร · ดู audit ครบ |
| **ผู้เยี่ยมชม** (Visitor) | ไม่กำหนด | เปิดหน้าใส่ pairing code · ดู User ID ตัวเอง | ทุกอย่างที่เหลือ |

**กฎเข้าระบบ:**
- ผู้ใช้ระบุตัวตนด้วย LINE User ID (จาก LIFF) — ไม่มี password
- เจ้าของระบุใน Sheet Config row `owner_line_user_ids` (comma-separated, multi-owner ready)
- พนักงานคลังต้องมี row ใน `User_Map` (linked กับ LINE userId)

---

## 4. Data Model

### Sheet: `Employees` — รายชื่อพนักงานที่สามารถ pair ได้
| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `emp_code` | string | `EMP-0001` | running, primary key |
| `name` | string | `สมชาย ใจดี` | |
| `role` | enum | `owner` / `staff` | (วันแรกใส่ owner ของพี่ปุ้ย) |
| `is_active` | boolean | `TRUE` | offboard = `FALSE` |
| `created_at` | datetime | ISO 8601 +07:00 | |
| `created_by` | string | LINE userId | คนที่เพิ่ม |

### Sheet: `User_Map` — map LINE userId กับ emp_code (paired แล้ว)
| Column | Type | หมายเหตุ |
|---|---|---|
| `line_user_id` | string | unique จาก LIFF (Uxxx...) |
| `emp_code` | string | FK → Employees |
| `paired_at` | datetime | |
| `is_active` | boolean | unpair = FALSE |

### Sheet: `Pairing_Codes` — รหัสจับคู่ที่ออกแต่ยังไม่ใช้
| Column | Type | หมายเหตุ |
|---|---|---|
| `code` | string | 6 หลักตัวเลข |
| `emp_code` | string | FK |
| `created_at` | datetime | |
| `expires_at` | datetime | created_at + 24h |
| `status` | enum | `active / used / expired / revoked` |
| `redeemed_at` | datetime | nullable |
| `redeemed_by_line_user_id` | string | nullable |
| `failed_attempts` | int | block ถ้า ≥ 5 |

### Sheet: `Materials` — รายการสาร (catalog)
| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `material_id` | string | `MAT-0001` | running, primary key |
| `name` | string | `Glycerin` | |
| `unit` | string | `g`, `ml`, `kg` | หน่วยใช้ในระบบ |
| `min_stock` | number | `100` | เกณฑ์ alert ใกล้หมด (0 = ไม่ alert) |
| `is_active` | boolean | `TRUE` | soft-delete = FALSE |
| `proposed_by_line_user_id` | string | | คนเสนอ (nullable ถ้า owner เพิ่มเอง) |
| `approved_by_line_user_id` | string | | nullable |
| `approved_at` | datetime | | nullable |
| `created_at` | datetime | | |
| `updated_at` | datetime | | |
| `note` | string | | |

### Sheet: `Inventory_Lots` — ล็อตของสารแต่ละล็อต
| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `lot_id` | string | `LOT-20260515-0001` | running per day |
| `material_id` | string | FK → Materials | |
| `lot_no` | string | `L240515-A` | เลขล็อตจาก supplier |
| `qty_initial` | number | `1000` | จำนวนรับเข้าครั้งแรก |
| `qty_remaining` | number | `750` | คงเหลือปัจจุบัน |
| `supplier` | string | `บริษัท ABC` | |
| `received_at` | datetime | | |
| `expire_date` | date | `2027-05-15` | |
| `received_by_line_user_id` | string | | คนกดรับ |
| `is_active` | boolean | `TRUE` | qty_remaining = 0 ก็ยัง TRUE (เก็บประวัติ) |
| `note` | string | | |

### Sheet: `Movements` — บันทึก in/out (ทุก transaction)
| Column | Type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `movement_id` | string | `MOV-20260515-0001` | running per day |
| `type` | enum | `in` / `out` | |
| `material_id` | string | FK | |
| `lot_id` | string | FK | สำหรับ `in` คือ lot ที่เพิ่งสร้าง · `out` คือ lot ที่หยิบ |
| `qty` | number | `50` | จำนวนสาร |
| `actor_line_user_id` | string | | คนกดในระบบ (หัวหน้าคลัง) |
| `for_user_note` | string | `ให้ RD-สมชาย ใช้กับสูตร X` | สำหรับ `out` เท่านั้น |
| `image_url_1` | string | Drive URL (thumbnail format) | |
| `image_url_2` | string | Drive URL | |
| `image_url_3` | string | Drive URL | |
| `created_at` | datetime | ISO 8601 +07:00 | |

### Sheet: `Pending_Changes` — คำขออนุมัติ (เสนอสารใหม่)
| Column | Type | หมายเหตุ |
|---|---|---|
| `pending_id` | string | `PND-20260515-0001` |
| `type` | enum | `new_material` (เผื่ออนาคต) |
| `payload_json` | string | JSON ของ material ใหม่ |
| `proposed_by_line_user_id` | string | |
| `proposed_at` | datetime | |
| `status` | enum | `pending / approved / rejected` |
| `decided_by_line_user_id` | string | nullable |
| `decided_at` | datetime | nullable |
| `decision_note` | string | nullable |

### Sheet: `Audit_Log` — บันทึกทุก action (auto by router)
| Column | Type | หมายเหตุ |
|---|---|---|
| `timestamp` | datetime | |
| `line_user_id` | string | |
| `emp_code` | string | (lookup) |
| `action` | string | `receive_material` / `issue_material` / `propose_material` / `approve_material` / ... |
| `payload_summary` | string | JSON shortened |
| `result` | enum | `ok / error` |

### Sheet: `Logs` — error log (มาตรฐาน foundation)
| Column | Type | หมายเหตุ |
|---|---|---|
| `timestamp` | datetime | |
| `level` | enum | `info / warn / error` |
| `function` | string | function name |
| `message` | string | |
| `payload` | string | JSON |

### Sheet: `Config` — ค่าตั้งระบบ
| key | value (ตัวอย่าง) | note |
|---|---|---|
| `owner_line_user_ids` | `U...` (comma-separated) | พี่ปุ้ยใส่หลัง paired ครั้งแรก |
| `alert_hour` | `8` | ส่ง alert ตอน 8 โมงเช้า |
| `expire_warning_days` | `30` | alert ก่อนหมดอายุกี่วัน |
| `pairing_code_ttl_hours` | `24` | code หมดอายุใน 24 ชม. |
| `pairing_max_failed_attempts` | `5` | ใส่ผิดกี่ครั้งจะ invalidate |
| `brand_name` | `[BRAND_NAME]` | ชื่อโรงงาน |

---

## 5. ID Schemes

| Entity | Format | ตัวอย่าง |
|---|---|---|
| Employee | `EMP-XXXX` | `EMP-0001` |
| Material | `MAT-XXXX` | `MAT-0001` |
| Lot | `LOT-YYYYMMDD-XXXX` | `LOT-20260515-0001` |
| Movement | `MOV-YYYYMMDD-XXXX` | `MOV-20260515-0001` |
| Pending | `PND-YYYYMMDD-XXXX` | `PND-20260515-0001` |
| Pairing code | 6 digits | `438217` |

---

## 6. Conventions

1. **ภาษา:** Comment ไทย, ตัวแปร/function อังกฤษ
2. **Error handling:** ทุก function Apps Script try-catch + log Sheet `Logs`
3. **Idempotent:** setup functions รันซ้ำได้ปลอดภัย
4. **Timeout:** Apps Script ต้องจบใน 6 นาที (รูป 3 ใบ resize ก่อน upload)
5. **Secrets:** Script Properties (LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, SHEET_ID, DRIVE_FOLDER_ID, LIFF_IDs) — ห้ามใส่ใน code
6. **Time zone:** Asia/Bangkok ISO 8601 +07:00
7. **ID format:** ดู section 5
8. **Image storage:** Drive folder `/Stock/<YYYY-MM>/<in|out>/` + URL thumbnail ใน Sheet (ห้าม base64 ในเซลล์)
9. **Multi-owner:** Sheet Config row `owner_line_user_ids` (comma-separated) — รองรับเผื่ออนาคต
10. **FIFO:** เบิกออก suggest lot ที่ใกล้ expire ก่อน (ไม่บังคับ — staff override ได้)

---

## 7. Approval Streams

| Stream | Actor → Approver | กี่ชั้น | implement ที่ |
|---|---|---|---|
| **Pair** | Visitor → Owner | 1 | Pairing.gs |
| **เสนอสารใหม่** | Staff → Owner | 1 | Material.gs |

---

## 8. Alert Streams (Time-based Triggers)

| Trigger | เมื่อไหร่ | ใคร | implement |
|---|---|---|---|
| `expirePairingCodes` | daily 00:00 | system | Pairing.gs |
| `checkLowStock` | daily 08:00 | Owner | Alert.gs |
| `checkExpiringLots` | daily 08:00 | Owner | Alert.gs |

---

## 9. ห้ามทำ (Out of Scope)

- ❌ Authentication เกินกว่า LINE Login
- ❌ Real-time websocket / live update
- ❌ Mobile native app
- ❌ Custom domain / SSL ของตัวเอง
- ❌ เปลี่ยน stack เป็น Firebase / Supabase / AWS (เก็บไว้ Phase 2)
- ❌ Multi-warehouse / หลายคลัง
- ❌ การคำนวณราคา / มูลค่า inventory / ต้นทุน
- ❌ Barcode / QR scanner
- ❌ Export PDF / Excel (ดู Sheet ตรงๆ ได้)
- ❌ ระบบสูตร RD (BOM) — เก็บไว้ RD App
- ❌ ผูกกับ batch production — เก็บไว้ Production App
- ❌ Reorder point auto / PO อัตโนมัติ

ถ้าขอเหล่านี้ → "ออก scope mini app — Phase 2"

---

## 10. Brand & UI

- Logo: `liff/img/logo.jpg`
- ชื่อ: บริษัท [BRAND_NAME] จำกัด (config ใน Script Properties)
- Palette: cherry red (`#c8102e` primary / `#9a0c24` dark)
- Style: minimal professional — **ห้าม emoji** (ยกเว้น `⚠️` สำหรับ warning)
- ทุก LIFF page: logo + brand text + footer brand
- ทุก flex card: header มี logo + brand
- **บังคับ 3 รูปต่อ transaction** (in/out) — ใช้ camera.js (getUserMedia + stamp)
