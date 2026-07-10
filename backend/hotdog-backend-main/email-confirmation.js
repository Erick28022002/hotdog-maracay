'use strict';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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
    const details = item.details ? `<div style="color:#666;font-size:13px;margin-top:4px">${escapeHtml(item.details)}</div>` : '';
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee">
          <strong>${escapeHtml(qty)} x ${escapeHtml(item.name)}</strong>
          ${details}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right">${money(itemTotal(item))}</td>
      </tr>`;
  }).join('');
}

function buildCustomerEmail(attempt) {
  const receiptLine = attempt.receipt_url ? `\nRecibo Square: ${attempt.receipt_url}` : '';
  const text = `Gracias por tu pedido en Hot Dog Maracay.

Pedido pagado correctamente.

Cliente: ${attempt.customer?.name || ''}
Telefono: ${attempt.customer?.phone || ''}
Sede: ${attempt.location || ''}
Tipo de orden: ${attempt.order_type || 'pickup'}

${renderItemsText(attempt.items)}

Total: ${money(attempt.total)}${receiptLine}

Estamos preparando tu orden.`;

  const receiptButton = attempt.receipt_url
    ? `<p><a href="${escapeHtml(attempt.receipt_url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Ver recibo de Square</a></p>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;max-width:560px;margin:auto">
      <h1 style="font-size:24px;margin-bottom:8px">Pedido confirmado</h1>
      <p>Gracias por tu pedido en <strong>Hot Dog Maracay</strong>. Tu pago fue procesado correctamente.</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">
        ${renderItemsHtml(attempt.items)}
        <tr>
          <td style="padding:14px 0;font-size:18px"><strong>Total</strong></td>
          <td style="padding:14px 0;text-align:right;font-size:18px"><strong>${money(attempt.total)}</strong></td>
        </tr>
      </table>
      <p><strong>Sede:</strong> ${escapeHtml(attempt.location || '')}</p>
      <p><strong>Tipo de orden:</strong> ${escapeHtml(attempt.order_type || 'pickup')}</p>
      ${receiptButton}
      <p style="color:#666;font-size:13px">Estamos preparando tu orden.</p>
    </div>`;

  return { subject: 'Tu pedido en Hot Dog Maracay esta confirmado', text, html };
}

function buildRestaurantEmail(attempt) {
  const text = `Nueva orden pagada desde la web.

Cliente: ${attempt.customer?.name || ''}
Telefono: ${attempt.customer?.phone || ''}
Email: ${attempt.customer?.email || ''}
Sede: ${attempt.location || ''}
Tipo: ${attempt.order_type || 'pickup'}

${renderItemsText(attempt.items)}

Notas: ${attempt.notes || ''}
Total: ${money(attempt.total)}
Pago Square: ${attempt.payment_id || ''}
Recibo: ${attempt.receipt_url || ''}`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
      <h1>Nueva orden pagada</h1>
      <p><strong>Cliente:</strong> ${escapeHtml(attempt.customer?.name || '')}</p>
      <p><strong>Telefono:</strong> ${escapeHtml(attempt.customer?.phone || '')}</p>
      <p><strong>Email:</strong> ${escapeHtml(attempt.customer?.email || '')}</p>
      <p><strong>Sede:</strong> ${escapeHtml(attempt.location || '')}</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0">${renderItemsHtml(attempt.items)}</table>
      <p><strong>Notas:</strong> ${escapeHtml(attempt.notes || '')}</p>
      <p><strong>Total:</strong> ${money(attempt.total)}</p>
      <p><strong>Pago Square:</strong> ${escapeHtml(attempt.payment_id || '')}</p>
    </div>`;

  return { subject: 'Nueva orden pagada - Hot Dog Maracay', text, html };
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

async function sendOrderEmails(attempt) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_CONFIRMATION_FROM;
  if (!apiKey || !from) {
    return { skipped: true, reason: 'email_not_configured' };
  }

  const results = [];
  const customerEmail = attempt.customer?.email || '';
  if (customerEmail) {
    const email = buildCustomerEmail(attempt);
    results.push(await sendResendEmail({ apiKey, from, to: customerEmail, ...email }));
  }

  const restaurantEmail = process.env.ORDER_NOTIFICATION_EMAIL || '';
  if (restaurantEmail) {
    const email = buildRestaurantEmail(attempt);
    results.push(await sendResendEmail({ apiKey, from, to: restaurantEmail, ...email }));
  }

  return { sent: results.length, results };
}

module.exports = {
  buildCustomerEmail,
  buildRestaurantEmail,
  sendOrderEmails
};
