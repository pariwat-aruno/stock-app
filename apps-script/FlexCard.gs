/**
 * FlexCard.gs — Flex Message templates สำหรับ Stock App
 *
 * Cards:
 *   - buildReceiveReceiptCard      : ใบรับเข้า (push ถึง Owner หลัง staff รับเข้า)
 *   - buildIssueReceiptCard        : ใบเบิกออก (push ถึง Owner หลัง staff เบิก)
 *   - buildPendingApprovalCard     : คำขออนุมัติสารใหม่ (push ถึง Owner)
 *   - buildLowStockAlertCard       : แจ้งเตือนสารใกล้หมด (daily 08:00)
 *   - buildExpiringLotsAlertCard   : แจ้งเตือนสารใกล้หมดอายุ (daily 08:00)
 *
 * Theme: cherry red (#c8102e / #9a0c24) · no emoji ยกเว้น ⚠️ สำหรับ warning
 */

const BRAND_PRIMARY = '#c8102e';
const BRAND_DARK = '#9a0c24';
const BRAND_TEXT = '#1a1a1a';
const BRAND_MUTED = '#757575';
const BRAND_BG = '#ffffff';
const BRAND_WARN = '#d97706';
const BRAND_DANGER = '#b91c1c';

// ========== Header helper (ใช้ได้ทุก card) ==========

function flexHeader_(title) {
  const brand = getConfig('brand_name', 'Stock App');
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: BRAND_PRIMARY,
    paddingAll: '16px',
    contents: [
      {
        type: 'text',
        text: brand,
        weight: 'bold',
        color: '#ffffff',
        size: 'xs',
      },
      {
        type: 'text',
        text: title,
        weight: 'bold',
        color: '#ffffff',
        size: 'lg',
        margin: 'sm',
      },
    ],
  };
}

function flexFooter_() {
  const brand = getConfig('brand_name', 'Stock App');
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#f5f5f5',
    paddingAll: '8px',
    contents: [{
      type: 'text',
      text: `ระบบคลังวัตถุดิบ · ${brand}`,
      size: 'xxs',
      color: BRAND_MUTED,
      align: 'center',
    }],
  };
}

function row_(label, value, valueColor) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: BRAND_MUTED, flex: 3 },
      { type: 'text', text: String(value || '-'), size: 'sm', color: valueColor || BRAND_TEXT, flex: 5, wrap: true, weight: 'bold' },
    ],
  };
}

// ========== Card: รับเข้าสำเร็จ ==========

function buildReceiveReceiptCard(args) {
  // args: { movement_id, material_name, qty, unit, lot_no, supplier, expire_date, actor_name, images: [url,url,url] }
  const created = formatThaiDateTime(new Date());

  // Hero image (รูปแรก)
  const hero = args.images && args.images[0] ? {
    type: 'image',
    url: args.images[0],
    size: 'full',
    aspectRatio: '4:3',
    aspectMode: 'cover',
  } : null;

  // Thumbnail row (รูปที่ 2, 3)
  const thumbs = [];
  if (args.images && args.images[1]) {
    thumbs.push({ type: 'image', url: args.images[1], aspectMode: 'cover', aspectRatio: '1:1', size: 'full', flex: 1 });
  }
  if (args.images && args.images[2]) {
    thumbs.push({ type: 'image', url: args.images[2], aspectMode: 'cover', aspectRatio: '1:1', size: 'full', flex: 1 });
  }

  const bubble = {
    type: 'bubble',
    size: 'kilo',
    header: flexHeader_('รับสารเข้าคลัง'),
  };

  if (hero) bubble.hero = hero;

  bubble.body = {
    type: 'box',
    layout: 'vertical',
    spacing: 'md',
    paddingAll: '16px',
    contents: [
      {
        type: 'text',
        text: args.material_name,
        weight: 'bold',
        size: 'xl',
        color: BRAND_TEXT,
        wrap: true,
      },
      {
        type: 'box',
        layout: 'baseline',
        contents: [
          { type: 'text', text: String(args.qty), size: 'xxl', color: BRAND_PRIMARY, weight: 'bold', flex: 0 },
          { type: 'text', text: ` ${args.unit}`, size: 'md', color: BRAND_MUTED, flex: 0 },
        ],
      },
      { type: 'separator', margin: 'md' },
      row_('Lot', args.lot_no),
      row_('Supplier', args.supplier),
      row_('หมดอายุ', formatDate_(args.expire_date)),
      row_('ผู้บันทึก', args.actor_name),
      row_('วันที่', created),
      row_('Movement', args.movement_id),
    ],
  };

  if (thumbs.length > 0) {
    bubble.body.contents.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'md',
      contents: thumbs,
    });
  }

  bubble.footer = flexFooter_();
  return bubble;
}

// ========== Card: เบิกออกสำเร็จ ==========

function buildIssueReceiptCard(args) {
  // args: { movement_id, material_name, qty, unit, lot_no, for_user_note, qty_remaining_after, actor_name, images }
  const created = formatThaiDateTime(new Date());

  const hero = args.images && args.images[0] ? {
    type: 'image',
    url: args.images[0],
    size: 'full',
    aspectRatio: '4:3',
    aspectMode: 'cover',
  } : null;

  const thumbs = [];
  if (args.images && args.images[1]) {
    thumbs.push({ type: 'image', url: args.images[1], aspectMode: 'cover', aspectRatio: '1:1', size: 'full', flex: 1 });
  }
  if (args.images && args.images[2]) {
    thumbs.push({ type: 'image', url: args.images[2], aspectMode: 'cover', aspectRatio: '1:1', size: 'full', flex: 1 });
  }

  const bubble = {
    type: 'bubble',
    size: 'kilo',
    header: flexHeader_('เบิกสารออกจากคลัง'),
  };

  if (hero) bubble.hero = hero;

  // alert ถ้า qty_remaining_after น้อย
  const remainingColor = args.qty_remaining_after < 50 ? BRAND_DANGER : BRAND_TEXT;

  bubble.body = {
    type: 'box',
    layout: 'vertical',
    spacing: 'md',
    paddingAll: '16px',
    contents: [
      {
        type: 'text',
        text: args.material_name,
        weight: 'bold',
        size: 'xl',
        color: BRAND_TEXT,
        wrap: true,
      },
      {
        type: 'box',
        layout: 'baseline',
        contents: [
          { type: 'text', text: '-' + String(args.qty), size: 'xxl', color: BRAND_PRIMARY, weight: 'bold', flex: 0 },
          { type: 'text', text: ` ${args.unit}`, size: 'md', color: BRAND_MUTED, flex: 0 },
        ],
      },
      { type: 'separator', margin: 'md' },
      row_('Lot', args.lot_no),
      row_('สำหรับ', args.for_user_note),
      row_('คงเหลือใน lot', `${args.qty_remaining_after} ${args.unit}`, remainingColor),
      row_('ผู้บันทึก', args.actor_name),
      row_('วันที่', created),
      row_('Movement', args.movement_id),
    ],
  };

  if (thumbs.length > 0) {
    bubble.body.contents.push({
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'md',
      contents: thumbs,
    });
  }

  bubble.footer = flexFooter_();
  return bubble;
}

// ========== Card: คำขออนุมัติสารใหม่ ==========

function buildPendingApprovalCard(args) {
  // args: { pending_id, material_name, unit, min_stock, note, proposer_name }
  return {
    type: 'bubble',
    size: 'kilo',
    header: flexHeader_('คำขออนุมัติสารใหม่'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: [
        {
          type: 'text',
          text: args.material_name,
          weight: 'bold',
          size: 'xl',
          color: BRAND_TEXT,
          wrap: true,
        },
        { type: 'separator', margin: 'md' },
        row_('หน่วย', args.unit),
        row_('ขั้นต่ำ (min_stock)', args.min_stock > 0 ? String(args.min_stock) : '-'),
        row_('หมายเหตุ', args.note || '-'),
        row_('ผู้เสนอ', args.proposer_name),
        row_('คำขอ', args.pending_id),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: BRAND_PRIMARY,
          action: {
            type: 'uri',
            label: 'เปิดหน้า admin',
            uri: `https://liff.line.me/${getScriptProperty_('LIFF_ID_ADMIN')}?tab=pending`,
          },
        },
        {
          type: 'text',
          text: `ระบบคลังวัตถุดิบ · ${getConfig('brand_name', 'Stock App')}`,
          size: 'xxs',
          color: BRAND_MUTED,
          align: 'center',
          margin: 'sm',
        },
      ],
    },
  };
}

// ========== Card: แจ้งเตือนสารใกล้หมด ==========

function buildLowStockAlertCard(items) {
  // items: [{ material_id, name, unit, qty, min_stock }, ...]
  const rows = items.slice(0, 12).map(it => ({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    margin: 'md',
    contents: [
      {
        type: 'text',
        text: it.name,
        size: 'sm',
        weight: 'bold',
        color: BRAND_TEXT,
        wrap: true,
      },
      {
        type: 'box',
        layout: 'baseline',
        contents: [
          { type: 'text', text: `${it.qty} ${it.unit}`, size: 'sm', color: BRAND_DANGER, weight: 'bold', flex: 4 },
          { type: 'text', text: `/ ${it.min_stock} ${it.unit}`, size: 'xs', color: BRAND_MUTED, flex: 5 },
        ],
      },
      { type: 'separator', margin: 'sm', color: '#eeeeee' },
    ],
  }));

  return {
    type: 'bubble',
    size: 'mega',
    header: flexHeader_(`⚠️ สารใกล้หมด (${items.length} รายการ)`),
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: [
        {
          type: 'text',
          text: `พบสาร ${items.length} รายการที่คงเหลือน้อยกว่าขั้นต่ำที่ตั้งไว้`,
          size: 'xs',
          color: BRAND_MUTED,
          wrap: true,
        },
        ...rows,
        items.length > 12 ? {
          type: 'text',
          text: `... และอีก ${items.length - 12} รายการ`,
          size: 'xs',
          color: BRAND_MUTED,
          margin: 'md',
          align: 'center',
        } : { type: 'filler' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: BRAND_PRIMARY,
          action: {
            type: 'uri',
            label: 'ดูรายละเอียด',
            uri: `https://liff.line.me/${getScriptProperty_('LIFF_ID_LIST')}`,
          },
        },
      ],
    },
  };
}

// ========== Card: แจ้งเตือนสารใกล้หมดอายุ ==========

function buildExpiringLotsAlertCard(items) {
  // items: [{ lot_id, material_name, unit, lot_no, qty_remaining, expire_date, days_left }, ...]
  const rows = items.slice(0, 12).map(it => {
    const expColor = it.days_left <= 7 ? BRAND_DANGER : BRAND_WARN;
    const daysLabel = it.days_left < 0
      ? `หมดอายุไปแล้ว ${Math.abs(it.days_left)} วัน`
      : (it.days_left === 0 ? 'หมดอายุวันนี้' : `อีก ${it.days_left} วัน`);
    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      margin: 'md',
      contents: [
        {
          type: 'text',
          text: it.material_name,
          size: 'sm',
          weight: 'bold',
          color: BRAND_TEXT,
          wrap: true,
        },
        {
          type: 'box',
          layout: 'baseline',
          contents: [
            { type: 'text', text: `Lot ${it.lot_no}`, size: 'xs', color: BRAND_MUTED, flex: 4 },
            { type: 'text', text: `${it.qty_remaining} ${it.unit}`, size: 'xs', color: BRAND_TEXT, flex: 3 },
          ],
        },
        {
          type: 'box',
          layout: 'baseline',
          contents: [
            { type: 'text', text: formatDate_(it.expire_date), size: 'xs', color: BRAND_MUTED, flex: 4 },
            { type: 'text', text: daysLabel, size: 'xs', color: expColor, weight: 'bold', flex: 5, align: 'end' },
          ],
        },
        { type: 'separator', margin: 'sm', color: '#eeeeee' },
      ],
    };
  });

  return {
    type: 'bubble',
    size: 'mega',
    header: flexHeader_(`⚠️ สารใกล้หมดอายุ (${items.length} รายการ)`),
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      contents: [
        {
          type: 'text',
          text: `พบ lot ${items.length} รายการที่จะหมดอายุภายใน ${getConfig('expire_warning_days', '30')} วัน`,
          size: 'xs',
          color: BRAND_MUTED,
          wrap: true,
        },
        ...rows,
        items.length > 12 ? {
          type: 'text',
          text: `... และอีก ${items.length - 12} รายการ`,
          size: 'xs',
          color: BRAND_MUTED,
          margin: 'md',
          align: 'center',
        } : { type: 'filler' },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: BRAND_PRIMARY,
          action: {
            type: 'uri',
            label: 'ดูรายละเอียด',
            uri: `https://liff.line.me/${getScriptProperty_('LIFF_ID_LIST')}`,
          },
        },
      ],
    },
  };
}

// ========== helpers ==========

function getScriptProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function formatDate_(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM/yyyy');
  } catch (e) {
    return String(dateStr);
  }
}
