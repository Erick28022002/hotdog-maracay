'use strict';

const nodemailer = require('nodemailer');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const BRAND = {
  name: 'Hot Dog Maracay',
  logoUrl: 'https://hotdogmaracay.com/fotos/email-receipt-logo.jpeg',
  siteUrl: 'https://hotdogmaracay.com',
  header: '#111111',
  background: '#F8F3EB',
  card: '#FFFFFF',
  text: '#111111',
  muted: '#666666',
  divider: '#ECECEC',
  red: '#E53935',
  gold: '#D8A438'
};
const FROM_BY_LOCATION = {
  nmb: 'ORDER_FROM_NMB',
  doral: 'ORDER_FROM_DORAL',
  downtown: 'ORDER_FROM_DOWNTOWN'
};
const LOCATION_LABELS = {
  nmb: 'North Miami Beach',
  'North Miami': 'North Miami Beach',
  'North Miami Beach': 'North Miami Beach',
  doral: 'Doral',
  Doral: 'Doral',
  downtown: 'Downtown Miami',
  'Downtown Miami': 'Downtown Miami'
};
const INSTAGRAM_BY_LOCATION = {
  nmb: { handle: '@hotdogmaracaynorthmiami', url: 'https://www.instagram.com/hotdogmaracaynorthmiami' },
  'North Miami': { handle: '@hotdogmaracaynorthmiami', url: 'https://www.instagram.com/hotdogmaracaynorthmiami' },
  'North Miami Beach': { handle: '@hotdogmaracaynorthmiami', url: 'https://www.instagram.com/hotdogmaracaynorthmiami' },
  doral: { handle: '@hotdogmaracaydoral', url: 'https://www.instagram.com/hotdogmaracaydoral' },
  Doral: { handle: '@hotdogmaracaydoral', url: 'https://www.instagram.com/hotdogmaracaydoral' },
  downtown: { handle: '@hotdogmaracaymiami', url: 'https://www.instagram.com/hotdogmaracaymiami' },
  'Downtown Miami': { handle: '@hotdogmaracaymiami', url: 'https://www.instagram.com/hotdogmaracaymiami' }
};
const SOCIAL_LINKS_BY_LOCATION = {
  nmb: {
    hasUber: true,
    hasDoorDash: true,
    uberUrl: 'https://www.ubereats.com/store/hot-dog-maracay-north-miami-18315-west-dixie-highway/oiHtSzWqQ1utCXqChre-ow',
    doorDashUrl: 'https://www.doordash.com/store/hot-dog-maracay-north-miami-beach-north-miami-beach-37436883/84611775/'
  },
  'North Miami': {
    hasUber: true,
    hasDoorDash: true,
    uberUrl: 'https://www.ubereats.com/store/hot-dog-maracay-north-miami-18315-west-dixie-highway/oiHtSzWqQ1utCXqChre-ow',
    doorDashUrl: 'https://www.doordash.com/store/hot-dog-maracay-north-miami-beach-north-miami-beach-37436883/84611775/'
  },
  'North Miami Beach': {
    hasUber: true,
    hasDoorDash: true,
    uberUrl: 'https://www.ubereats.com/store/hot-dog-maracay-north-miami-18315-west-dixie-highway/oiHtSzWqQ1utCXqChre-ow',
    doorDashUrl: 'https://www.doordash.com/store/hot-dog-maracay-north-miami-beach-north-miami-beach-37436883/84611775/'
  },
  doral: {
    hasUber: true,
    hasDoorDash: true,
    uberUrl: 'https://www.ubereats.com/store/hot-dog-maracay-miami/CEtjUmJEUWWz1Rqa3tteIQ',
    doorDashUrl: 'https://www.doordash.com/store/26219712'
  },
  Doral: {
    hasUber: true,
    hasDoorDash: true,
    uberUrl: 'https://www.ubereats.com/store/hot-dog-maracay-miami/CEtjUmJEUWWz1Rqa3tteIQ',
    doorDashUrl: 'https://www.doordash.com/store/26219712'
  },
  downtown: {
    hasUber: true,
    hasDoorDash: true,
    uberUrl: 'https://www.ubereats.com/store/hot-dog-maracay-miamidowntown/xU2LTXX1VQioO0iuyW-Lvg',
    doorDashUrl: 'https://www.doordash.com/store/hot-dog-maracay-miami-27691950/31795151/'
  },
  'Downtown Miami': {
    hasUber: true,
    hasDoorDash: true,
    uberUrl: 'https://www.ubereats.com/store/hot-dog-maracay-miamidowntown/xU2LTXX1VQioO0iuyW-Lvg',
    doorDashUrl: 'https://www.doordash.com/store/hot-dog-maracay-miami-27691950/31795151/'
  }
};
const DRINK_NAMES = new Set([
  'Coca Cola', 'Coca Cola Zero', 'Diet Coke', 'Sprite', 'Nestea Limon',
  'Nestea Durazno', 'Frescolita', 'Malta', 'Uvita', 'Agua'
]);

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function itemTotal(item) {
  return Number(item.price || 0) * Number(item.qty || item.quantity || 1);
}

function titleCaseMod(value) {
  const text = normalizeText(value).replace(/^(sin|no|extra|con|mas|más)\s+/i, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length === 10) {
    return `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
  }
  return value || '';
}

function locationLabel(location) {
  return LOCATION_LABELS[location] || location || '';
}

function orderTypeLabel(type) {
  if (type === 'pickup') return 'Recoleccion';
  if (type === 'delivery') return 'Delivery';
  return type || 'Recoleccion';
}

function paymentDateLabel(attempt) {
  const rawDate = attempt.created_at || attempt.updated_at || attempt.createdAt || attempt.payment_created_at;
  const date = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-US', {
    timeZone: 'America/New_York',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function instagramForLocation(location) {
  return INSTAGRAM_BY_LOCATION[location] || INSTAGRAM_BY_LOCATION.nmb;
}

function socialLinksForLocation(location) {
  const instagram = instagramForLocation(location);
  return {
    instagram,
    ...(SOCIAL_LINKS_BY_LOCATION[location] || SOCIAL_LINKS_BY_LOCATION.nmb)
  };
}

function orderNumber(attempt) {
  return attempt.order_number
    || attempt.square_order_id
    || attempt.checkout_attempt_id
    || attempt.payment_id
    || 'Confirmado';
}

function statusLabel(attempt) {
  if (attempt.order_status) return attempt.order_status;
  if (attempt.status && attempt.status !== 'paid') return attempt.status;
  return 'Confirmado';
}

function statusBadge(label) {
  const normalized = normalizeText(label).toLowerCase();
  const colors = {
    confirmado: { color: '#1B8F2F', border: '#D8F2D8', bg: '#EAF8EA' },
    preparando: { color: BRAND.text, border: BRAND.gold },
    'en cocina': { color: BRAND.text, border: BRAND.gold },
    listo: { color: BRAND.text, border: BRAND.text },
    'en camino': { color: BRAND.text, border: BRAND.text },
    entregado: { color: BRAND.muted, border: BRAND.divider },
    cancelado: { color: BRAND.red, border: BRAND.red }
  };
  const style = colors[normalized] || colors.confirmado;
  return `<span style="display:inline-block;border:1px solid ${style.border};border-radius:999px;background:${style.bg || '#FFFFFF'};color:${style.color};padding:7px 12px;font-size:14px;font-weight:800;line-height:1">${escapeHtml(label)}</span>`;
}

function formatComponentLine(component, index) {
  const removed = (component.mods || [])
    .filter(mod => /^(sin|no)\s+/i.test(mod))
    .map(titleCaseMod);
  const extras = (component.mods || [])
    .filter(mod => /^(extra|con|mas|más)\s+/i.test(mod))
    .map(titleCaseMod);
  const notes = (component.notes || []).map(normalizeText).filter(Boolean);
  const parts = [];
  if (removed.length) parts.push(`Sin: ${removed.join(', ')}`);
  if (extras.length) parts.push(`Extra: ${extras.join(', ')}`);
  if (notes.length) parts.push(`Nota: ${notes.join(', ')}`);
  return parts.length ? `[HD${index + 1}] ${parts.join(' | ')}` : '';
}

function formatItemDetailLines(item) {
  const lines = [];
  if (Array.isArray(item.components) && item.components.length) {
    item.components.forEach((component, index) => {
      const line = formatComponentLine(component, index);
      if (line) lines.push(line);
    });
  } else if (item.details) {
    const mods = String(item.details).split(/(?:\s*Â·\s*|\s*·\s*)/).map(normalizeText).filter(Boolean);
    const removed = mods.filter(mod => /^(sin|no)\s+/i.test(mod)).map(titleCaseMod);
    const extras = mods.filter(mod => /^(extra|con|mas|más)\s+/i.test(mod)).map(titleCaseMod);
    const neutral = mods.filter(mod => !/^(sin|no|extra|con|mas|más)\s+/i.test(mod));
    if (removed.length) lines.push(`Sin: ${removed.join(', ')}`);
    if (extras.length) lines.push(`Extra: ${extras.join(', ')}`);
    if (neutral.length) lines.push(...neutral);
  }

  const general = Array.isArray(item.general) ? item.general.map(normalizeText).filter(Boolean) : [];
  const drink = general.find(name => DRINK_NAMES.has(name));
  const sauces = general.filter(name => name !== drink);
  if (sauces.length) lines.push(`Salsa acompanante: ${sauces.join(', ')}`);
  if (drink) lines.push(`Bebida: ${drink}`);
  if (item.note_text) lines.push(`Nota: ${normalizeText(item.note_text)}`);
  return lines;
}

function renderItemsText(items) {
  return (items || []).map(item => {
    const qty = item.qty || item.quantity || 1;
    const details = formatItemDetailLines(item).map(line => `  ${line}`).join('\n');
    return `${qty} x ${item.name} (${money(itemTotal(item))})${details ? `\n${details}` : ''}`;
  }).join('\n');
}

function renderItemsHtml(items) {
  return (items || []).map(item => {
    const qty = item.qty || item.quantity || 1;
    const details = formatItemDetailLines(item)
      .map(line => `<div style="color:${BRAND.muted};font-size:14px;margin-top:8px;line-height:1.5">${escapeHtml(line)}</div>`)
      .join('');
    return `
      <div style="padding:20px 0;border-bottom:1px solid ${BRAND.divider}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px">
          <div style="font-size:16px;font-weight:700;color:${BRAND.text};line-height:1.4">${escapeHtml(qty)} x ${escapeHtml(item.name)}</div>
          <div style="font-size:16px;font-weight:700;color:${BRAND.text};white-space:nowrap">${money(itemTotal(item))}</div>
        </div>
        ${details ? `<div style="margin-top:12px">${details}</div>` : ''}
      </div>`;
  }).join('');
}

function card(title, body, tone = 'default') {
  const titleColor = tone === 'red' ? BRAND.red : BRAND.text;
  return `
    <section class="receipt-card" style="background:${BRAND.card};border-radius:20px;padding:32px;margin:0 0 24px;box-shadow:0 10px 30px rgba(17,17,17,.08);border:1px solid ${BRAND.divider}">
      ${title ? `<h2 style="margin:0 0 18px;color:${titleColor};font-size:20px;line-height:1.2;font-weight:900;text-transform:uppercase;letter-spacing:.3px">${escapeHtml(title)}</h2>` : ''}
      ${body}
    </section>`;
}

function receiptHeader() {
  return `
    <header class="receipt-header" style="background:${BRAND.header};padding:42px 48px;margin:0 0 32px;color:#fff;box-shadow:0 10px 30px rgba(17,17,17,.12)">
      <div class="receipt-header-inner" style="display:flex;align-items:center;justify-content:space-between;gap:32px">
        <img class="receipt-logo" src="${BRAND.logoUrl}" alt="${BRAND.name}" style="display:block;width:190px;max-width:30%;height:auto;border:0;border-radius:0;background:${BRAND.header};object-fit:contain">
        <div class="receipt-title" style="flex:1;text-align:center;color:#fff;font-size:42px;line-height:1.05;font-weight:900;letter-spacing:0;text-transform:uppercase;white-space:normal">COMPROBANTE DE PAGO</div>
      </div>
    </header>`;
}

function receiptFooter() {
  return `
    <footer style="padding:4px 0 0;text-align:center;color:${BRAND.muted};font-size:12px">
      Hot Dog Maracay <span style="padding:0 8px">&bull;</span> <a href="${BRAND.siteUrl}" style="color:${BRAND.muted};text-decoration:none">hotdogmaracay.com</a>
    </footer>`;
}

function receiptShell({ body }) {
  return `
    <div class="receipt-outer" style="margin:0;padding:0;background:${BRAND.background};font-family:Inter,Arial,sans-serif;color:${BRAND.text};line-height:1.5">
      <style>
        @media only screen and (max-width: 640px) {
          .receipt-outer { padding:0 !important; }
          .receipt-wrap { width:100% !important; max-width:100% !important; }
          .receipt-main { padding:18px 14px 24px !important; }
          .receipt-header { padding:26px 18px !important; margin-bottom:18px !important; }
          .receipt-header-inner { display:block !important; text-align:center !important; }
          .receipt-logo { width:168px !important; max-width:82% !important; margin:0 auto 18px !important; }
          .receipt-title { font-size:28px !important; text-align:center !important; }
          .receipt-card { padding:22px !important; margin-bottom:16px !important; border-radius:16px !important; }
          .receipt-grid { display:block !important; }
          .receipt-half { width:100% !important; display:block !important; padding:0 !important; margin:0 0 16px !important; }
          .receipt-row { align-items:flex-start !important; }
          .receipt-row-label { min-width:0 !important; width:auto !important; font-size:13px !important; }
          .receipt-row-value { text-align:right !important; font-size:14px !important; }
          .receipt-social-button { width:30% !important; min-width:82px !important; }
          .receipt-social-label { font-size:11px !important; }
        }
      </style>
      <div class="receipt-wrap" style="max-width:900px;margin:0 auto;background:${BRAND.background}">
        ${receiptHeader()}
        <main class="receipt-main" style="padding:0 32px 32px">
          ${body}
        </main>
        ${receiptFooter()}
      </div>
    </div>`;
}

function receiptRow({ icon, label, value, html }) {
  return `
    <div class="receipt-row" style="display:flex;align-items:center;gap:16px;padding:15px 0;border-bottom:1px solid ${BRAND.divider}">
      <div style="width:28px;text-align:center;color:${BRAND.text};font-size:18px;line-height:1">${icon}</div>
      <div class="receipt-row-label" style="color:${BRAND.text};font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.2px;line-height:1.3;min-width:190px">${escapeHtml(label)}</div>
      <div class="receipt-row-value" style="flex:1;min-width:0;text-align:right;color:${BRAND.text};font-size:18px;font-weight:500;line-height:1.4;word-break:break-word">
        ${html || escapeHtml(value || '-')}
      </div>
    </div>`;
}

function customerCard(attempt) {
  return card('Informacion del Cliente', [
    receiptRow({ icon: '&#9679;', label: 'Cliente', value: attempt.customer?.name || '' }),
    receiptRow({ icon: '&#9742;', label: 'Telefono', value: formatPhone(attempt.customer?.phone) }),
    receiptRow({ icon: '&#9993;', label: 'Email', value: attempt.customer?.email || '' }),
    receiptRow({ icon: '&#8962;', label: 'Sede', value: locationLabel(attempt.location) }),
    receiptRow({ icon: '&#8594;', label: 'Tipo de entrega', value: orderTypeLabel(attempt.order_type) }),
    receiptRow({ icon: '&#9716;', label: 'Tiempo estimado', value: attempt.estimated_ready_text || '15-25 min' }),
    receiptRow({ icon: '&#128197;', label: 'Fecha de pago', value: paymentDateLabel(attempt) }),
    receiptRow({ icon: '#', label: 'Numero de orden', value: orderNumber(attempt) }),
    receiptRow({ icon: '&#10003;', label: 'Estado', html: statusBadge(statusLabel(attempt)) })
  ].join(''));
}

function orderCard(attempt) {
  return card('Detalle del Pedido', renderItemsHtml(attempt.items), 'red');
}

function paymentValues(attempt) {
  const subtotal = Number(attempt.subtotal || attempt.subtotal_amount || (attempt.items || []).reduce((sum, item) => sum + itemTotal(item), 0));
  const total = Number(attempt.total || 0);
  const discount = Number(attempt.discount || attempt.discount_amount || 0);
  const deliveryFee = Number(attempt.delivery_fee || attempt.deliveryFee || 0);
  const tip = Number(attempt.tip || attempt.tip_amount || 0);
  const tax = Number(attempt.tax || attempt.tax_amount || Math.max(0, total - subtotal + discount - deliveryFee - tip));
  return {
    subtotal,
    tax,
    discount,
    deliveryFee,
    tip,
    total: total || Math.max(0, subtotal + tax - discount + deliveryFee + tip)
  };
}

function summaryRow(label, value, total = false) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:18px;padding:${total ? '18px 0 0' : '10px 0'};${total ? `border-top:1px solid ${BRAND.divider};margin-top:8px` : ''}">
      <div style="color:${total ? BRAND.text : BRAND.muted};font-size:${total ? '18px' : '16px'};font-weight:${total ? '700' : '500'}">${escapeHtml(label)}</div>
      <div style="color:${total ? BRAND.red : BRAND.text};font-size:${total ? '36px' : '16px'};font-weight:700;line-height:1">${money(value)}</div>
    </div>`;
}

function paymentSummary(attempt) {
  const payment = paymentValues(attempt);
  return card('Resumen del Pago', [
    summaryRow('Subtotal', payment.subtotal),
    summaryRow('Impuestos', payment.tax),
    summaryRow('Descuentos', payment.discount),
    summaryRow('Delivery', payment.deliveryFee),
    summaryRow('Propina', payment.tip),
    summaryRow('TOTAL', payment.total, true)
  ].join(''), 'red');
}

function notesCard(attempt) {
  const note = normalizeText(attempt.notes || '');
  return note ? card('Notas Generales', `<div style="color:${BRAND.text};font-size:16px;line-height:1.6">${escapeHtml(note)}</div>`, 'red') : '';
}

function socialButton({ label, url, icon }) {
  return `
    <a class="receipt-social-button" href="${escapeHtml(url)}" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;width:120px;color:${BRAND.text};text-decoration:none">
      <span style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:999px;border:1px solid ${BRAND.divider};color:${BRAND.text};font-size:22px;font-weight:700;transition:all 200ms">${icon}</span>
      <span class="receipt-social-label" style="color:${BRAND.text};font-size:14px;font-weight:800;text-transform:uppercase">${escapeHtml(label)}</span>
    </a>`;
}

function socialLinks(attempt) {
  const links = socialLinksForLocation(attempt.location);
  const buttons = [
    socialButton({ label: 'Instagram', url: links.instagram.url, icon: '&#9678;' }),
    links.hasUber ? socialButton({ label: 'Uber Eats', url: links.uberUrl, icon: 'U' }) : '',
    links.hasDoorDash ? socialButton({ label: 'DoorDash', url: links.doorDashUrl, icon: 'D' }) : ''
  ].filter(Boolean).join('');
  return card('ENCUÉNTRANOS', `<div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap">${buttons}</div>`);
}

function customerMessage() {
  return card('', `<p style="margin:0;color:${BRAND.text};font-size:16px;line-height:1.7">Gracias por tu compra. Tu pago fue confirmado y ya estamos preparando tu pedido con el autentico sabor de <strong>${BRAND.name}</strong>.</p>`);
}

function buildReceiptHtml(attempt, includeNotes = true) {
  return receiptShell({
    body: [
      customerMessage(),
      customerCard(attempt),
      `<div class="receipt-grid" style="display:flex;gap:24px;align-items:stretch;margin:0 0 24px">
        <div class="receipt-half" style="width:50%;display:block">${orderCard(attempt)}</div>
        <div class="receipt-half" style="width:50%;display:block">${paymentSummary(attempt)}</div>
      </div>`,
      includeNotes ? notesCard(attempt) : '',
      socialLinks(attempt)
    ].filter(Boolean).join('')
  });
}

function buildCustomerEmail(attempt) {
  const receiptLine = attempt.receipt_url ? `\nRecibo Square: ${attempt.receipt_url}` : '';
  const paymentDate = paymentDateLabel(attempt);
  const links = socialLinksForLocation(attempt.location);
  const text = `Comprobante de pago - Hot Dog Maracay

Gracias por tu compra. Tu pago fue confirmado y ya estamos preparando tu pedido con el autentico sabor de Hot Dog Maracay.

Cliente: ${attempt.customer?.name || ''}
Telefono: ${formatPhone(attempt.customer?.phone)}
Email: ${attempt.customer?.email || ''}
Sede: ${locationLabel(attempt.location)}
Tipo de entrega: ${orderTypeLabel(attempt.order_type)}
Tiempo estimado: ${attempt.estimated_ready_text || '15-25 min'}
Fecha de pago: ${paymentDate}
Numero de orden: ${orderNumber(attempt)}
Estado: ${statusLabel(attempt)}

${renderItemsText(attempt.items)}

Subtotal: ${money(paymentValues(attempt).subtotal)}
Impuestos: ${money(paymentValues(attempt).tax)}
Total: ${money(paymentValues(attempt).total)}${receiptLine}

Encuentranos:
Instagram: ${links.instagram.url}${links.hasUber ? `\nUber Eats: ${links.uberUrl}` : ''}${links.hasDoorDash ? `\nDoorDash: ${links.doorDashUrl}` : ''}`;

  return {
    subject: 'Comprobante de pago - Hot Dog Maracay',
    text,
    html: buildReceiptHtml(attempt, true)
  };
}

function buildRestaurantEmail(attempt) {
  const text = `Comprobante de pago desde la web.

Cliente: ${attempt.customer?.name || ''}
Telefono: ${formatPhone(attempt.customer?.phone)}
Email: ${attempt.customer?.email || ''}
Sede: ${locationLabel(attempt.location)}
Tipo de entrega: ${orderTypeLabel(attempt.order_type)}
Tiempo estimado: ${attempt.estimated_ready_text || '15-25 min'}
Fecha de pago: ${paymentDateLabel(attempt)}
Numero de orden: ${orderNumber(attempt)}
Estado: ${statusLabel(attempt)}

${renderItemsText(attempt.items)}

Notas: ${attempt.notes || ''}
Total: ${money(paymentValues(attempt).total)}
Pago Square: ${attempt.payment_id || ''}
Recibo: ${attempt.receipt_url || ''}`;

  return {
    subject: 'Comprobante de pago - Hot Dog Maracay',
    text,
    html: buildReceiptHtml(attempt, true)
  };
}

async function sendResendEmail({ apiKey, from, to, subject, text, html }) {
  if (!to) return { skipped: true, reason: 'missing_recipient' };
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, text, html })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `Resend error ${response.status}`);
  }
  return { sent: true, id: data.id };
}

function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    requireTLS: port === 587
  });
}

function fromForAttempt(attempt) {
  const locationKey = FROM_BY_LOCATION[attempt.location];
  return (locationKey && process.env[locationKey])
    || process.env.ORDER_CONFIRMATION_FROM
    || process.env.SMTP_USER
    || '';
}

async function sendSmtpEmail({ transport, from, to, subject, text, html }) {
  if (!to) return { skipped: true, reason: 'missing_recipient' };
  const result = await transport.sendMail({ from, to, subject, text, html });
  return { sent: true, id: result.messageId };
}

async function sendOrderEmails(attempt) {
  const smtpTransport = createSmtpTransport();
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromForAttempt(attempt);
  if (!smtpTransport && (!apiKey || !from)) {
    return { skipped: true, reason: 'email_not_configured' };
  }

  const results = [];
  const sendEmail = smtpTransport
    ? payload => sendSmtpEmail({ transport: smtpTransport, ...payload })
    : payload => sendResendEmail({ apiKey, ...payload });

  const customerEmail = attempt.customer?.email || '';
  if (customerEmail) {
    const email = buildCustomerEmail(attempt);
    results.push(await sendEmail({ from, to: customerEmail, ...email }));
  }

  const restaurantEmail = process.env.ORDER_NOTIFICATION_EMAIL || '';
  if (restaurantEmail) {
    const email = buildRestaurantEmail(attempt);
    results.push(await sendEmail({ from, to: restaurantEmail, ...email }));
  }

  return { sent: results.length, results };
}

module.exports = {
  buildCustomerEmail,
  buildRestaurantEmail,
  sendOrderEmails
};
