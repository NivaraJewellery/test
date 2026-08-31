const crypto = require('crypto');
const { sendEmail } = require('./_email');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function ensureFeedbackTables(sql) {
  await sql`
    create table if not exists website_feedback (
      id serial primary key,
      order_id integer,
      razorpay_order_id text not null,
      customer_email text,
      customer_name text,
      overall_rating integer not null check (overall_rating between 1 and 5),
      discovery_rating integer not null check (discovery_rating between 1 and 5),
      checkout_rating integer not null check (checkout_rating between 1 and 5),
      performance_rating integer not null check (performance_rating between 1 and 5),
      comments text,
      approved boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (razorpay_order_id)
    )
  `;

  await sql`
    create table if not exists product_review_tokens (
      id serial primary key,
      order_id integer not null unique,
      token text not null unique,
      customer_email text,
      email_sent_at timestamptz,
      used_at timestamptz,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists product_reviews (
      id serial primary key,
      order_id integer not null,
      razorpay_order_id text not null,
      product_id integer,
      product_name text not null,
      customer_email text,
      customer_name text,
      rating integer not null check (rating between 1 and 5),
      comments text,
      approved boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (order_id, product_id)
    )
  `;
}

function normalizeOrderItems(items) {
  let parsed = items;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (_) { parsed = {}; }
  }
  if (Array.isArray(parsed)) return { customer: {}, products: parsed };
  return {
    customer: parsed?.customer || {},
    products: Array.isArray(parsed?.products) ? parsed.products : []
  };
}

function reviewSiteUrl(request) {
  const configured = String(process.env.SITE_URL || process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const host = request?.headers?.['x-forwarded-host'] || request?.headers?.host || 'nivarajewellery.com';
  const proto = request?.headers?.['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

async function createOrLoadReviewToken(sql, order) {
  await ensureFeedbackTables(sql);
  const existing = await sql`
    select id, token, customer_email, email_sent_at, used_at, expires_at
    from product_review_tokens
    where order_id = ${order.id}
    limit 1
  `;
  if (existing.length) return existing[0];

  const token = crypto.randomBytes(32).toString('hex');
  const rows = await sql`
    insert into product_review_tokens (order_id, token, customer_email, expires_at)
    values (${order.id}, ${token}, ${order.customer_email || ''}, now() + interval '90 days')
    returning id, token, customer_email, email_sent_at, used_at, expires_at
  `;
  return rows[0];
}

async function sendDeliveredProductReviewEmail({ sql, order, request }) {
  if (!order?.id || !order?.customer_email || !order?.razorpay_payment_id) {
    return { sent: false, reason: 'Order does not have a paid customer email.' };
  }

  const tokenRow = await createOrLoadReviewToken(sql, order);
  if (tokenRow.email_sent_at) return { sent: false, alreadySent: true };

  const details = normalizeOrderItems(order.items);
  const productNames = details.products.map(item => item.name || `Product ${item.id}`).filter(Boolean);
  const customerName = details.customer?.name || order.customer_email.split('@')[0] || 'Customer';
  const url = `${reviewSiteUrl(request)}/review?token=${encodeURIComponent(tokenRow.token)}`;
  const productsHtml = productNames.length
    ? `<p><strong>Your order:</strong> ${productNames.map(escapeHtml).join(', ')}</p>`
    : '';

  const result = await sendEmail({
    to: order.customer_email,
    subject: 'How did you like your Nivara Jewellery order?',
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#332b26;max-width:620px;margin:auto">
        <h2 style="font-family:Georgia,serif;color:#6f451f">We'd love your product feedback</h2>
        <p>Hello ${escapeHtml(customerName)},</p>
        <p>Your Nivara Jewellery order <strong>${escapeHtml(order.razorpay_order_id || '')}</strong> has been marked as delivered. We hope you love your purchase.</p>
        ${productsHtml}
        <p>Please take a moment to rate the product(s) you received. Your feedback helps other customers shop with confidence and helps us improve.</p>
        <p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#332b26;color:#fff;text-decoration:none;padding:13px 22px;border-radius:4px;font-weight:700">Review your purchase</a></p>
        <p style="font-size:12px;color:#766e66">This secure review link is valid for 90 days and can be submitted once.</p>
        <p>Thank you,<br><strong>Nivara Jewellery</strong></p>
      </div>
    `
  });

  if (result?.skipped) return { sent: false, reason: 'Email service is not configured.' };

  await sql`
    update product_review_tokens
    set email_sent_at = now(), updated_at = now()
    where id = ${tokenRow.id}
  `;
  return { sent: true };
}

module.exports = {
  ensureFeedbackTables,
  normalizeOrderItems,
  sendDeliveredProductReviewEmail
};
