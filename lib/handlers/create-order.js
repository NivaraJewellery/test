const { getSql, readJson, send } = require('./_db');
const { ensureVariantTable } = require('./_variants');
const {
  getRegisteredPromoCustomer,
  checkPromoEligibility,
  calculateDiscount,
  reservePromo,
  normalizePromoCode
} = require('./_promo');

function isDatabaseAuthError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('authentication failed') || message.includes('password authentication failed');
}

function isRazorpayAuthError(response, razorpayOrder) {
  const description = String(razorpayOrder?.error?.description || '').toLowerCase();
  return response.status === 401 || description.includes('authentication failed');
}

function getRazorpayKeyDiagnostic(keyId, keySecret) {
  return [
    `key id starts with ${keyId.slice(0, 8) || 'empty'}`,
    `key id length ${keyId.length}`,
    `secret length ${keySecret.length}`
  ].join(', ');
}

const FREE_SHIPPING_THRESHOLD = 1999;
const STANDARD_SHIPPING_CHARGE = 99;

function calculateShippingCharge(subtotal) {
  const value = Number(subtotal || 0);
  if (value <= 0) return 0;
  return value >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_CHARGE;
}

function formatAddress(address = {}) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.pincode
  ].map(value => String(value || '').trim()).filter(Boolean).join(', ');
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return send(response, 405, { error: 'Method not allowed' });
  }

  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();

  if (!keyId || !keySecret) {
    return send(response, 500, { error: 'Razorpay keys are not configured' });
  }

  try {
    const body = await readJson(request);
    const sql = getSql();
    await ensureVariantTable(sql);
    await sql`alter table orders add column if not exists status text not null default 'open'`;
    await sql`alter table orders add column if not exists updated_at timestamptz not null default now()`;
    await sql`alter table orders add column if not exists shipping_charge integer not null default 0`;
    const items = Array.isArray(body.items) ? body.items : [];
    let selectedAddress = null;
    const customerId = Number(body.customer?.id || 0);
    const customerEmailInput = String(body.customer?.email || '').trim().toLowerCase();
    const selectedAddressId = Number(body.selectedAddressId || 0);
    if (!customerId || !customerEmailInput) {
      return send(response, 401, { error: 'Please sign in before checkout.' });
    }
    const customerRows = await sql`
      select id, name, email, phone, email_verified
      from customers
      where id = ${customerId} and email = ${customerEmailInput}
      limit 1
    `;
    if (!customerRows.length) return send(response, 401, { error: 'Please sign in again before checkout.' });
    const registeredCustomer = customerRows[0];
    if (registeredCustomer.email_verified === false) return send(response, 403, { error: 'Please verify your email before checkout.' });
    {
      await sql`
        create table if not exists customer_addresses (
          id serial primary key,
          customer_id integer not null references customers(id) on delete cascade,
          label text not null default 'Address', recipient_name text not null default '', phone text not null default '',
          line1 text not null, line2 text not null default '', city text not null, state text not null, pincode text not null,
          is_default boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
        )
      `;
      const addressRows = selectedAddressId
        ? await sql`select * from customer_addresses where id=${selectedAddressId} and customer_id=${customerId} limit 1`
        : await sql`select * from customer_addresses where customer_id=${customerId} order by is_default desc, id asc limit 1`;
      if (!addressRows.length) return send(response, 400, { error: 'Please select a delivery address before payment.' });
      selectedAddress = addressRows[0];
    }
    const shippingAddress = formatAddress({ line1:selectedAddress.line1, line2:selectedAddress.line2, city:selectedAddress.city, state:selectedAddress.state, pincode:selectedAddress.pincode });
    const billingAddress = shippingAddress;
    const customerEmail = String(registeredCustomer.email || '').trim().toLowerCase();
    const customerDetails = {
      name: String(selectedAddress?.recipient_name || registeredCustomer.name || '').trim(),
      email: customerEmail,
      phone: String(selectedAddress?.phone || registeredCustomer.phone || '').trim(),
      shippingAddress,
      billingAddress,
      addressId: selectedAddress?.id || null,
      addressLabel: selectedAddress?.label || ''
    };
    const requestedPromoCode = normalizePromoCode(body.promoCode);
    let promoCustomer = null;
    let promoDetails = null;

    if (requestedPromoCode) {
      promoCustomer = await getRegisteredPromoCustomer(sql, body.customer);
      promoDetails = await checkPromoEligibility(sql, promoCustomer, requestedPromoCode);
      customerDetails.name = promoCustomer.name || customerDetails.name;
      customerDetails.email = promoCustomer.email;
      customerDetails.phone = promoCustomer.phone;
    }

    const orderItems = [];

    for (const item of items) {
      const id = Number(item.id);
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const rows = await sql`
        select id, name, price, stock, code, image
        from products
        where id = ${id} and active = true
      `;

      if (!rows.length) return send(response, 400, { error: `${item.name || 'An item'} is no longer available. Please review your bag.` });

      const product = rows[0];
      const variantId = Number(item.variantId || item.variant_id) || null;
      let variant = null;
      const variantRows = await sql`select id, size, uom, stock from product_variants where product_id=${id} and active=true order by id`;
      if (variantRows.length) {
        variant = variantRows.find(v => Number(v.id) === variantId);
        if (!variant) return send(response, 400, { error: `Please select a size for ${product.name}` });
        if (Number(variant.stock) < quantity) return send(response, 400, { error: `${product.name} (${variant.size} ${variant.uom}) has only ${variant.stock} available` });
      } else if (product.stock < quantity) {
        return send(response, 400, { error: `${product.name} has only ${product.stock} available` });
      }

      orderItems.push({ product, quantity, variant });
    }

    if (!orderItems.length) {
      return send(response, 400, { error: 'Your bag is empty' });
    }

    const subtotal = orderItems.reduce((total, item) => total + item.product.price * item.quantity, 0);
    const totals = promoDetails?.applied ? calculateDiscount(subtotal) : { subtotal, discount: 0, total: subtotal };
    const shippingCharge = calculateShippingCharge(subtotal);
    const amount = totals.total + shippingCharge;
    const receipt = `nivara_${Date.now()}`;
    const notes = {
      items: orderItems.map(item => `${item.product.code}${item.variant ? ` (${item.variant.size} ${item.variant.uom})` : ''} x ${item.quantity}`).join(', '),
      customer: customerDetails.name,
      phone: customerDetails.phone,
      promo: promoDetails?.code || ''
    };

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: 'INR',
        receipt,
        notes
      })
    });

    const order = await razorpayResponse.json();

    if (!razorpayResponse.ok) {
      if (isRazorpayAuthError(razorpayResponse, order)) {
        return send(response, 500, {
          error: `Razorpay authentication failed. Please check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel. Safe check: ${getRazorpayKeyDiagnostic(keyId, keySecret)}.`
        });
      }

      return send(response, razorpayResponse.status, { error: order.error?.description || 'Unable to create payment order' });
    }

    await sql.begin(async transaction => {
      if (promoDetails?.applied) {
        await reservePromo(transaction, promoCustomer, requestedPromoCode, order.id);
      }

      await transaction`
        insert into orders (razorpay_order_id, amount, shipping_charge, customer_email, items, status)
        values (${order.id}, ${amount}, ${shippingCharge}, ${customerDetails.email || null}, ${JSON.stringify({
          customer: customerDetails,
          shipping: {
            charge: shippingCharge,
            threshold: FREE_SHIPPING_THRESHOLD,
            standardCharge: STANDARD_SHIPPING_CHARGE
          },
          promo: promoDetails?.applied ? {
            code: promoDetails.code,
            percent: promoDetails.percent,
            subtotal: totals.subtotal,
            discount: totals.discount,
            total: totals.total,
            customerId: promoCustomer.id,
            phone: promoCustomer.normalizedPhone
          } : null,
          products: orderItems.map(item => ({ id: item.product.id, name: item.product.name, price: item.product.price, quantity: item.quantity, image: item.product.image || '', variantId: item.variant?.id || null, size: item.variant?.size || '', uom: item.variant?.uom || '' }))
        })}, 'pending_payment')
      `;
    });

    return send(response, 200, {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      name: 'Nivara Jewellery',
      description: `${orderItems.length} item${orderItems.length === 1 ? '' : 's'} from Nivara Jewellery`,
      shippingCharge,
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      promo: promoDetails?.applied ? { code: promoDetails.code, percent: promoDetails.percent, discount: totals.discount } : null
    });
  } catch (error) {
    if (isDatabaseAuthError(error)) {
      return send(response, 500, { error: 'Checkout is temporarily unavailable. Please contact Nivara Jewellery.' });
    }

    return send(response, 500, { error: error.message || 'Unable to create payment order' });
  }
};
