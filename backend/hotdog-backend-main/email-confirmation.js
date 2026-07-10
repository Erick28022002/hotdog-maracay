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

function renderItemsText(items) {
  return (items || []).map(item => {
    const qty = item.qty || item.quantity || 1;
    const details = item.details ? `\n   ${item.details}` : '';
    return `- ${qty} x ${item.name} (${money(itemTotal(item))})${details}`;
  }).join('\n');
}

function renderItemsHtml(items) {
  return (items || []).map(item => {
    const qty = item.qty || item.quantity || 1;
    const details = item.details ? `<div style="color:${BRAND.muted};font-size:13px;margin-top:4px">${escapeHtml(item.details)}</div>` : '';
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
        <div style="background:${BRAND.ink};padding:22px 24px;color:#fff">
          <table role="presentation" width="100%" style="border-collapse:collapse">
            <tr>
              <td style="vertical-align:middle">
                <img src="${BRAND.logoUrl}" alt="${BRAND.name}" width="64" height="64" style="display:block;border-radius:14px;background:#fff;object-fit:cover">
              </td>
              <td style="vertical-align:middle;text-align:right">
                <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.accent};font-weight:800">${escapeHtml(eyebrow)}</div>
                <div style="font-size:26px;font-weight:900;margin-top:2px">${escapeHtml(title)}</div>
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

function buildCustomerEmail(attempt) {
  const receiptLine = attempt.receipt_url ? `\nRecibo Square: ${attempt.receipt_url}` : '';
  const estimateLine = attempt.estimated_ready_text ? `\nTiempo estimado: ${attempt.estimated_ready_text}` : '';
  const text = `Gracias por tu pedido en Hot Dog Maracay.

Pedido pagado correctamente.

Cliente: ${attempt.customer?.name || ''}
Telefono: ${attempt.customer?.phone || ''}
Sede: ${attempt.location || ''}
Tipo de orden: ${attempt.order_type || 'pickup'}${estimateLine}

${renderItemsText(attempt.items)}

Total: ${money(attempt.total)}${receiptLine}

Estamos preparando tu orden.`;

  const receiptButton = attempt.receipt_url
    ? `<p style="margin:22px 0 0"><a href="${escapeHtml(attempt.receipt_url)}" style="display:inline-block;background:${BRAND.red};color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:800">Ver recibo de Square</a></p>`
    : '';

  const html = receiptShell({
    eyebrow: 'Recibo de pedido',
    title: 'Orden pagada',
    body: `
      <p style="margin:0 0 12px;font-size:16px">Gracias por tu pedido en <strong>${BRAND.name}</strong>. Tu pago fue procesado correctamente.</p>
      ${metaGrid([
        { label: 'Cliente', value: attempt.customer?.name || '' },
        { label: 'Telefono', value: attempt.customer?.phone || '' },
        { label: 'Sede', value: attempt.location || '' },
        { label: 'Tipo', value: attempt.order_type || 'pickup' },
        { label: 'Tiempo estimado', value: attempt.estimated_ready_text || '15-25 min' },
        { label: 'Pago', value: attempt.payment_id || 'Aprobado' }
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
  });

  return { subject: 'Orden pagada - Hot Dog Maracay', text, html };
}

function buildRestaurantEmail(attempt) {
  const text = `Comprobante de pago desde la web.

Cliente: ${attempt.customer?.name || ''}
Telefono: ${attempt.customer?.phone || ''}
Email: ${attempt.customer?.email || ''}
Sede: ${attempt.location || ''}
Tipo: ${attempt.order_type || 'pickup'}
Tiempo estimado: ${attempt.estimated_ready_text || '15-25 min'}

${renderItemsText(attempt.items)}

Notas: ${attempt.notes || ''}
Total: ${money(attempt.total)}
Pago Square: ${attempt.payment_id || ''}
Recibo: ${attempt.receipt_url || ''}`;

  const html = receiptShell({
    eyebrow: 'Orden web pagada',
    title: 'Comprobante de pago',
    body: `
      ${metaGrid([
        { label: 'Cliente', value: attempt.customer?.name || '' },
        { label: 'Telefono', value: attempt.customer?.phone || '' },
        { label: 'Email', value: attempt.customer?.email || '' },
        { label: 'Sede', value: attempt.location || '' },
        { label: 'Tipo', value: attempt.order_type || 'pickup' },
        { label: 'Tiempo estimado', value: attempt.estimated_ready_text || '15-25 min' },
        { label: 'Pago Square', value: attempt.payment_id || '' }
      ])}
      <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#fff;border-radius:12px;overflow:hidden">${renderItemsHtml(attempt.items)}</table>
      <p style="margin:12px 0"><strong>Notas:</strong> ${escapeHtml(attempt.notes || '')}</p>
      <p style="font-size:22px;margin:16px 0;color:${BRAND.red}"><strong>Total: ${money(attempt.total)}</strong></p>`
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
