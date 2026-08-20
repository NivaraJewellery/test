const PROMO_CODE = String(process.env.LAUNCH_PROMO_CODE || 'NIVARA5').trim().toUpperCase();
const PROMO_PERCENT = Number(process.env.LAUNCH_PROMO_PERCENT || 5);
const PROMO_START = new Date(process.env.LAUNCH_PROMO_START || '2026-08-19T18:30:00.000Z'); // TEST: active from 20 Aug 2026, 12:00 AM IST
const PROMO_END = new Date(process.env.LAUNCH_PROMO_END || '2026-08-23T18:30:00.000Z'); // exclusive: 24 Aug 2026, 12:00 AM IST
const RESERVATION_MINUTES = Math.max(10, Number(process.env.PROMO_RESERVATION_MINUTES || 30));

function normalizePromoCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits;
}

function getPromoState(now = new Date()) {
  const time = now.getTime();
  if (time < PROMO_START.getTime()) return 'upcoming';
  if (time >= PROMO_END.getTime()) return 'ended';
  return 'active';
}

function getPromoMessage(state = getPromoState()) {
  if (state === 'upcoming') return 'Launch offer is not active yet.';
  if (state === 'ended') return 'This launch offer ended on 23 Aug at 11:59 PM IST.';
  return 'Launch offer is active.';
}

function calculateDiscount(subtotal) {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const discount = Math.round((safeSubtotal * PROMO_PERCENT) / 100);
  return {
    subtotal: safeSubtotal,
    discount,
    total: Math.max(0, safeSubtotal - discount)
  };
}

async function ensurePromoTable(sql) {
  await sql`
    create table if not exists promo_redemptions (
      id serial primary key,
      promo_code text not null,
      customer_id integer not null references customers(id),
      phone text not null,
      razorpay_order_id text unique,
      status text not null default 'reserved',
      reserved_until timestamptz,
      redeemed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (promo_code, customer_id),
      unique (promo_code, phone)
    )
  `;
  await sql`create index if not exists idx_promo_redemptions_order on promo_redemptions(razorpay_order_id)`;
}

async function getRegisteredPromoCustomer(sql, customerInput) {
  const id = Number(customerInput?.id || 0);
  const email = String(customerInput?.email || '').trim().toLowerCase();
  if (!id || !email) {
    const error = new Error('Please sign in to use this promo code.');
    error.statusCode = 401;
    throw error;
  }

  const rows = await sql`
    select id, name, email, phone, phone_verified
    from customers
    where id = ${id} and email = ${email}
    limit 1
  `;
  if (!rows.length) {
    const error = new Error('Please sign in again to use this promo code.');
    error.statusCode = 401;
    throw error;
  }

  const customer = rows[0];
  const phone = normalizePhone(customer.phone);
  if (!customer.phone_verified || phone.length < 12) {
    const error = new Error('Please verify your registered mobile number before using this promo code.');
    error.statusCode = 400;
    throw error;
  }

  return { ...customer, normalizedPhone: phone };
}

function validatePromoWindow(code) {
  const normalized = normalizePromoCode(code);
  if (!normalized) return { applied: false };
  if (normalized !== PROMO_CODE) {
    const error = new Error('Promo code is invalid.');
    error.statusCode = 400;
    throw error;
  }
  const state = getPromoState();
  if (state !== 'active') {
    const error = new Error(getPromoMessage(state));
    error.statusCode = 400;
    throw error;
  }
  return { applied: true, code: PROMO_CODE };
}

async function checkPromoEligibility(sql, customer, code) {
  const promo = validatePromoWindow(code);
  if (!promo.applied) return promo;
  await ensurePromoTable(sql);

  const matches = await sql`
    select id, customer_id, phone, status, reserved_until, razorpay_order_id
    from promo_redemptions
    where promo_code = ${PROMO_CODE}
      and (customer_id = ${customer.id} or phone = ${customer.normalizedPhone})
    order by id desc
    limit 1
  `;

  if (matches.length) {
    const existing = matches[0];
    if (existing.status === 'redeemed') {
      const error = new Error('This launch promo has already been used for this account or registered mobile number.');
      error.statusCode = 409;
      throw error;
    }
    if (existing.status === 'reserved' && existing.reserved_until && new Date(existing.reserved_until) > new Date()) {
      const error = new Error('This promo is already reserved in another checkout. Complete or close that payment and try again.');
      error.statusCode = 409;
      throw error;
    }
  }

  return { applied: true, code: PROMO_CODE, percent: PROMO_PERCENT };
}

async function reservePromo(transaction, customer, code, razorpayOrderId) {
  const promo = validatePromoWindow(code);
  if (!promo.applied) return null;
  await ensurePromoTable(transaction);

  const matches = await transaction`
    select id, customer_id, phone, status, reserved_until
    from promo_redemptions
    where promo_code = ${PROMO_CODE}
      and (customer_id = ${customer.id} or phone = ${customer.normalizedPhone})
    order by id desc
    limit 1
    for update
  `;

  if (matches.length) {
    const existing = matches[0];
    if (existing.status === 'redeemed') {
      const error = new Error('This launch promo has already been used for this account or registered mobile number.');
      error.statusCode = 409;
      throw error;
    }
    if (existing.status === 'reserved' && existing.reserved_until && new Date(existing.reserved_until) > new Date()) {
      const error = new Error('This promo is already reserved in another checkout. Complete or close that payment and try again.');
      error.statusCode = 409;
      throw error;
    }

    await transaction`
      update promo_redemptions
      set customer_id = ${customer.id},
          phone = ${customer.normalizedPhone},
          razorpay_order_id = ${razorpayOrderId},
          status = 'reserved',
          reserved_until = now() + (${RESERVATION_MINUTES} * interval '1 minute'),
          redeemed_at = null,
          updated_at = now()
      where id = ${existing.id}
    `;
  } else {
    await transaction`
      insert into promo_redemptions (promo_code, customer_id, phone, razorpay_order_id, status, reserved_until)
      values (${PROMO_CODE}, ${customer.id}, ${customer.normalizedPhone}, ${razorpayOrderId}, 'reserved', now() + (${RESERVATION_MINUTES} * interval '1 minute'))
    `;
  }

  return { code: PROMO_CODE, percent: PROMO_PERCENT };
}

async function redeemPromo(transaction, razorpayOrderId) {
  const rows = await transaction`
    update promo_redemptions
    set status = 'redeemed', redeemed_at = now(), reserved_until = null, updated_at = now()
    where razorpay_order_id = ${razorpayOrderId} and status = 'reserved'
    returning id, promo_code, customer_id, phone
  `;
  if (!rows.length) {
    throw new Error('Promo reservation could not be confirmed for this payment. Please contact Nivara Jewellery support.');
  }
  return rows[0];
}

async function releasePromo(sql, razorpayOrderId) {
  await ensurePromoTable(sql);
  await sql`
    delete from promo_redemptions
    where razorpay_order_id = ${razorpayOrderId} and status = 'reserved'
  `;
}

module.exports = {
  PROMO_CODE,
  PROMO_PERCENT,
  PROMO_START,
  PROMO_END,
  normalizePromoCode,
  normalizePhone,
  getPromoState,
  getPromoMessage,
  calculateDiscount,
  ensurePromoTable,
  getRegisteredPromoCustomer,
  checkPromoEligibility,
  reservePromo,
  redeemPromo,
  releasePromo,
  validatePromoWindow
};
