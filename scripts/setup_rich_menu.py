#!/usr/bin/env python3
"""
setup_rich_menu.py — สร้างรูป rich menu + upload ผ่าน LINE API

Layout:
  Stock App มี 5 ปุ่มในแถวเดียว
  +---------+---------+---------+---------+---------+
  | รับเข้า | เบิกออก |  สต๊อก  | เสนอสาร |  Admin  |
  | (cherry)| (cherry)| (cherry)| (cherry)| (dark)  |
  +---------+---------+---------+---------+---------+
  ปุ่ม Admin สีเข้ม (#374151) เพื่อแยกให้ชัด — เจ้าของกดได้คนเดียว

ก่อนใช้:
  1. ใส่ ACCESS_TOKEN ใน env: export LINE_CHANNEL_ACCESS_TOKEN=xxx
  2. LIFF_IDs อ่านจาก liff/js/config.js อัตโนมัติ
     (override ได้ด้วย env: export LIFF_ID_IN=... ฯลฯ)
  3. pip install Pillow requests
  4. python3 scripts/setup_rich_menu.py

หลังรัน:
  rich menu ปรากฏใน LINE chat (ทุก user)
  Owner เห็นปุ่ม Admin ใช้ได้ — Staff เห็นแต่กดแล้วจะติด "not_owner"
"""

import os
import re
import sys
import json
import requests
from PIL import Image, ImageDraw, ImageFont

# ========== Auto-read LIFF IDs from liff/js/config.js ==========

CONFIG_JS = os.path.join(os.path.dirname(__file__), '..', 'liff', 'js', 'config.js')


def read_liff_ids_from_config():
    """อ่าน LIFF_ID_* จาก liff/js/config.js โดย regex"""
    if not os.path.exists(CONFIG_JS):
        return {}
    with open(CONFIG_JS, 'r', encoding='utf-8') as f:
        content = f.read()
    pattern = re.compile(r"(LIFF_ID_[A-Z]+)\s*:\s*['\"]([^'\"]+)['\"]")
    return {m.group(1): m.group(2) for m in pattern.finditer(content)}


LIFF_FROM_CONFIG = read_liff_ids_from_config()

# ========== CONFIG ==========

ACCESS_TOKEN = os.environ.get('LINE_CHANNEL_ACCESS_TOKEN', '')
if not ACCESS_TOKEN:
    print('error: set LINE_CHANNEL_ACCESS_TOKEN env var')
    print('  export LINE_CHANNEL_ACCESS_TOKEN=xxx')
    sys.exit(1)

# Rich menu canvas: full size 2500x1686 (เผื่อข้อมูลเพิ่ม) หรือ compact 2500x843
CANVAS_W, CANVAS_H = 2500, 843

# Sections — 5 ปุ่มในแถวเดียว
# Format: (label_thai, color_hex, env_var_name_for_liff_id)
SECTIONS = [
    ('รับเข้า',     '#c8102e', 'LIFF_ID_IN'),
    ('เบิกออก',     '#c8102e', 'LIFF_ID_OUT'),
    ('สต๊อก',       '#c8102e', 'LIFF_ID_LIST'),
    ('เสนอสาร',     '#c8102e', 'LIFF_ID_PROPOSE'),
    ('ADMIN',       '#374151', 'LIFF_ID_ADMIN'),  # สีเข้ม แยกชัด
]

OUTPUT_IMG = '/tmp/stock_app_rich_menu.png'
HEADERS = {'Authorization': f'Bearer {ACCESS_TOKEN}'}


def resolve_liff_ids():
    """resolve LIFF IDs — priority: env var > config.js"""
    resolved = []
    missing = []
    for label, color, env_key in SECTIONS:
        liff_id = os.environ.get(env_key) or LIFF_FROM_CONFIG.get(env_key, '')
        if liff_id and liff_id.startswith('REPLACE_'):
            liff_id = ''
        if not liff_id:
            missing.append(env_key)
        resolved.append((label, color, liff_id))
    if missing:
        print('error: ยังไม่มี LIFF IDs ต่อไปนี้ (ทั้งใน env + config.js):')
        for m in missing:
            print(f'  {m}')
        sys.exit(1)
    return resolved


def get_font(size):
    """พยายามหา font ที่รองรับภาษาไทย"""
    candidates = [
        # macOS
        '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
        '/System/Library/Fonts/Thonburi.ttc',
        # Linux
        '/usr/share/fonts/truetype/tlwg/Sarabun-Bold.ttf',
        '/usr/share/fonts/truetype/tlwg/Sarabun.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        # Windows
        'C:/Windows/Fonts/tahoma.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def generate_image(sections):
    """สร้างรูป rich menu — section ละสี"""
    img = Image.new('RGB', (CANVAS_W, CANVAS_H), '#ffffff')
    draw = ImageDraw.Draw(img)
    section_w = CANVAS_W // len(sections)

    font_label = get_font(90)
    font_brand = get_font(40)

    for i, (label, color, _) in enumerate(sections):
        x = i * section_w
        draw.rectangle([x, 0, x + section_w, CANVAS_H], fill=color)

        # label ตรงกลาง
        bbox = draw.textbbox((0, 0), label, font=font_label)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text(
            (x + (section_w - tw) // 2, (CANVAS_H - th) // 2 - 20),
            label, fill='white', font=font_label,
        )

        # brand subtitle ด้านล่าง (เล็ก)
        sub = 'STOCK'
        bbox2 = draw.textbbox((0, 0), sub, font=font_brand)
        tw2 = bbox2[2] - bbox2[0]
        draw.text(
            (x + (section_w - tw2) // 2, CANVAS_H - 90),
            sub, fill='rgba(255,255,255,0.5)' if False else '#ffffff80', font=font_brand,
        )

    # บางครั้ง PIL ไม่รองรับ rgba ใน fill string — เปิดใหม่ + paste alpha layer ก็ได้ แต่ขอเลี่ยง
    img.save(OUTPUT_IMG, 'PNG')
    print(f'  ✓ generated: {OUTPUT_IMG}')


def list_existing():
    r = requests.get('https://api.line.me/v2/bot/richmenu/list', headers=HEADERS)
    r.raise_for_status()
    return r.json().get('richmenus', [])


def delete_existing():
    for rm in list_existing():
        rid = rm['richMenuId']
        requests.delete(f'https://api.line.me/v2/bot/richmenu/{rid}', headers=HEADERS)
        print(f'  ✓ deleted: {rid}')


def create_menu(sections):
    section_w = CANVAS_W // len(sections)
    areas = []
    for i, (_, _, liff_id) in enumerate(sections):
        areas.append({
            'bounds': {'x': i * section_w, 'y': 0, 'width': section_w, 'height': CANVAS_H},
            'action': {'type': 'uri', 'uri': f'https://liff.line.me/{liff_id}'},
        })

    payload = {
        'size': {'width': CANVAS_W, 'height': CANVAS_H},
        'selected': True,
        'name': 'Stock App menu',
        'chatBarText': 'เมนู',
        'areas': areas,
    }
    r = requests.post(
        'https://api.line.me/v2/bot/richmenu',
        headers={**HEADERS, 'Content-Type': 'application/json'},
        data=json.dumps(payload),
    )
    r.raise_for_status()
    rid = r.json()['richMenuId']
    print(f'  ✓ created: {rid}')
    return rid


def upload_image(rid):
    with open(OUTPUT_IMG, 'rb') as f:
        r = requests.post(
            f'https://api-data.line.me/v2/bot/richmenu/{rid}/content',
            headers={**HEADERS, 'Content-Type': 'image/png'},
            data=f.read(),
        )
    r.raise_for_status()
    print(f'  ✓ image uploaded')


def set_default(rid):
    r = requests.post(
        f'https://api.line.me/v2/bot/user/all/richmenu/{rid}',
        headers=HEADERS,
    )
    r.raise_for_status()
    print(f'  ✓ set as default')


def main():
    sections = resolve_liff_ids()
    print('1. delete existing rich menus...')
    delete_existing()
    print('2. generate image...')
    generate_image(sections)
    print('3. create rich menu...')
    rid = create_menu(sections)
    print('4. upload image...')
    upload_image(rid)
    print('5. set as default...')
    set_default(rid)
    print('done. เปิด LINE chat → ตรวจดู rich menu')


if __name__ == '__main__':
    main()
