'use strict';

const nodemailer = require('nodemailer');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const BRAND = {
  name: 'Hot Dog Maracay',
  logoUrl: 'https://hotdogmaracay.com/fotos/email-receipt-logo.jpeg',
  siteUrl: 'https://hotdogmaracay.com',
  accent: '#FAA83C',
  red: '#E8272A',
  ink: '#14100d',
  muted: '#6b625b',
  paper: '#fff8ef'
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

function itemTotal(item) {
  return Number(item.price || 0) * Number(item.qty || item.quantity || 1);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function renderDetailLineHtml(line) {
  const hdMatch = String(line).match(/^(\[HD\d+\]\s+)(Sin|Extra|Nota):(.*)$/i);
  if (hdMatch) {
    return `<strong style="color:${BRAND.red};font-weight:900">${escapeHtml(hdMatch[1])}${escapeHtml(hdMatch[2])}:</strong>${escapeHtml(hdMatch[3])}`;
  }
  const labelMatch = String(line).match(/^(Salsa acompanante|Bebida|Nota|Sin|Extra):(.*)$/i);
  if (labelMatch) {
    return `<strong style="color:${BRAND.red};font-weight:900">${escapeHtml(labelMatch[1])}:</strong>${escapeHtml(labelMatch[2])}`;
  }
  return escapeHtml(line);
}

function renderItemsHtml(items) {
  return (items || []).map(item => {
    const qty = item.qty || item.quantity || 1;
    const details = formatItemDetailLines(item)
      .map(line => `<div style="color:${BRAND.muted};font-size:13px;margin-top:7px;line-height:1.45">${renderDetailLineHtml(line)}</div>`)
      .join('');
    return `
      <tr>
        <td style="padding:13px 0;border-bottom:1px solid #eadfce">
          <strong style="color:${BRAND.ink}">${escapeHtml(qty)} x ${escapeHtml(item.name)}</strong>
          ${details}
        </td>
        <td style="padding:13px 0;border-bottom:1px solid #eadfce;text-align:right;color:${BRAND.ink};font-weight:700">${money(itemTotal(item))}</td>
      </tr>`;
  }).join('');
}

function receiptShell({ title, eyebrow, body, footerNote }) {
  return `
    <div style="margin:0;padding:24px;background:#f2eee8;font-family:Arial,sans-serif;color:${BRAND.ink};line-height:1.5">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #eadfce;border-radius:18px;overflow:hidden">
        <div style="background:#000;padding:18px 24px;color:#fff">
          <table role="presentation" width="100%" style="border-collapse:collapse">
            <tr>
              <td style="vertical-align:middle">
                <img src="${BRAND.logoUrl}" alt="${BRAND.name}" width="118" height="86" style="display:block;border-radius:14px;background:#000;object-fit:cover">
              </td>
              <td style="vertical-align:middle;text-align:right">
                ${eyebrow ? `<div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.accent};font-weight:800">${escapeHtml(eyebrow)}</div>` : ''}
                <div style="font-size:28px;font-weight:900;margin-top:2px;text-transform:uppercase">${escapeHtml(title)}</div>
              </td>
            </tr>
          </table>
        </div>
        <div style="padding:26px 24px;background:${BRAND.paper}">
          ${body}
        </div>
        <div style="padding:18px 24px;background:#fff;color:${BRAND.muted};font-size:12px;text-align:center">
          ${footerNote || `Hot Dog Maracay · <a href="${BRAND.siteUrl}" style="color:${BRAND.red};text-decoration:none;font-weight:700">hotdogmaracay.com</a>`}
        </div>
      </div>
    </div>`;
}

function metaGrid(rows) {
  return `
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:18px 0;background:#fff;border:1px solid #eadfce;border-radius:12px;overflow:hidden">
      ${rows.map(row => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1e7d7;color:${BRAND.muted};font-size:12px;text-transform:uppercase;letter-spacing:.8px;font-weight:800">${escapeHtml(row.label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1e7d7;text-align:right;font-weight:700;color:${BRAND.ink}">${escapeHtml(row.value || '-')}</td>
        </tr>`).join('')}
    </table>`;
}

function instagramBlock(instagram) {
  return `
    <div style="margin:22px 0 0;padding:16px 18px;background:#fff;border:1px solid #eadfce;border-radius:12px;text-align:center">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:900;color:${BRAND.muted};margin-bottom:4px">Siguenos en Instagram</div>
      <a href="${escapeHtml(instagram.url)}" style="color:${BRAND.red};font-size:16px;font-weight:900;text-decoration:none">${escapeHtml(instagram.handle)}</a>
    </div>`;
}

function buildCustomerEmail(attempt) {
  const receiptLine = attempt.receipt_url ? `\nRecibo Square: ${attempt.receipt_url}` : '';
  const estimateLine = attempt.estimated_ready_text ? `\nTiempo estimado: ${attempt.estimated_ready_text}` : '';
  const paymentDate = paymentDateLabel(attempt);
  const instagram = instagramForLocation(attempt.location);
  const text = `Gracias por tu pedido en Hot Dog Maracay.

¡Gracias por tu compra! Tu pago fue confirmado y ya estamos preparando tu pedido con el autentico sabor de Hot Dog Maracay.

Cliente: ${attempt.customer?.name || ''}
Telefono: ${formatPhone(attempt.customer?.phone)}
Sede: ${locationLabel(attempt.location)}
Tipo de Entrega: ${orderTypeLabel(attempt.order_type)}
Pago: ${paymentDate}${estimateLine}

${renderItemsText(attempt.items)}

Total: ${money(attempt.total)}${receiptLine}

Siguenos en Instagram: ${instagram.handle} - ${instagram.url}`;

  const receiptButton = attempt.receipt_url
    ? `<p style="margin:22px 0 0"><a href="${escapeHtml(attempt.receipt_url)}" style="display:inline-block;background:${BRAND.red};color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:800">Ver recibo de Square</a></p>`
    : '';

  const html = receiptShell({
    eyebrow: '',
    title: 'Pedido confirmado',
    body: `
      <p style="margin:0 0 12px;font-size:16px">¡Gracias por tu compra! Tu pago fue confirmado y ya estamos preparando tu pedido con el auténtico sabor de <strong>${BRAND.name}</strong>.</p>
      ${metaGrid([
        { label: 'Cliente', value: attempt.customer?.name || '' },
        { label: 'Telefono', value: formatPhone(attempt.customer?.phone) },
        { label: 'Sede', value: locationLabel(attempt.location) },
        { label: 'Tipo de Entrega', value: orderTypeLabel(attempt.order_type) },
        { label: 'Tiempo estimado', value: attempt.estimated_ready_text || '15-25 min' },
        { label: 'Pago', value: paymentDate }
      ])}
      <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#fff;border-radius:12px;overflow:hidden">
        ${renderItemsHtml(attempt.items)}
        <tr>
          <td style="padding:16px 0;font-size:20px;color:${BRAND.ink}"><strong>Total pagado</strong></td>
          <td style="padding:16px 0;text-align:right;font-size:22px;color:${BRAND.red}"><strong>${money(attempt.total)}</strong></td>
        </tr>
      </table>
      ${receiptButton}
      <p style="color:${BRAND.muted};font-size:13px;margin:18px 0 0">El tiempo estimado puede variar segun la cantidad de ordenes activas en cocina.</p>`
      + instagramBlock(instagram)
  });

  return { subject: 'Pedido confirmado - Hot Dog Maracay', text, html };
}

function buildRestaurantEmail(attempt) {
  const paymentDate = paymentDateLabel(attempt);
  const instagram = instagramForLocation(attempt.location);
  const text = `Comprobante de pago desde la web.

Cliente: ${attempt.customer?.name || ''}
Telefono: ${formatPhone(attempt.customer?.phone)}
Email: ${attempt.customer?.email || ''}
Sede: ${locationLabel(attempt.location)}
Tipo de Entrega: ${orderTypeLabel(attempt.order_type)}
Tiempo estimado: ${attempt.estimated_ready_text || '15-25 min'}
Pago: ${paymentDate}

${renderItemsText(attempt.items)}

Notas: ${attempt.notes || ''}
Total: ${money(attempt.total)}
Pago Square: ${attempt.payment_id || ''}
Recibo: ${attempt.receipt_url || ''}`;

  const html = receiptShell({
    eyebrow: '',
    title: 'Comprobante de pago',
    body: `
      ${metaGrid([
        { label: 'Cliente', value: attempt.customer?.name || '' },
        { label: 'Telefono', value: formatPhone(attempt.customer?.phone) },
        { label: 'Email', value: attempt.customer?.email || '' },
        { label: 'Sede', value: locationLabel(attempt.location) },
        { label: 'Tipo de Entrega', value: orderTypeLabel(attempt.order_type) },
        { label: 'Tiempo estimado', value: attempt.estimated_ready_text || '15-25 min' },
        { label: 'Pago', value: paymentDate }
      ])}
      <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#fff;border-radius:12px;overflow:hidden">${renderItemsHtml(attempt.items)}</table>
      <p style="margin:12px 0"><strong>Notas:</strong> ${escapeHtml(attempt.notes || '')}</p>
      <p style="font-size:22px;margin:16px 0;color:${BRAND.red}"><strong>Total: ${money(attempt.total)}</strong></p>`
      + instagramBlock(instagram)
  });

  return { subject: 'Comprobante de pago - Hot Dog Maracay', text, html };
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

function internalOrderEmailEnabled() {
  return String(process.env.ORDER_NOTIFICATION_EMAIL_ENABLED || '').toLowerCase() === 'true';
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

  const restaurantEmail = internalOrderEmailEnabled() ? process.env.ORDER_NOTIFICATION_EMAIL || '' : '';
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
