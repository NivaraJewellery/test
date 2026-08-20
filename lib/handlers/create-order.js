const { getSql, readJson, send } = require('./_db');
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
    await sql`alter table orders add column if not exists status text not null default 'open'`;
    await sql`alter table orders add column if not exists updated_at timestamptz not null default now()`;
    const items = Array.isArray(body.items) ? body.items : [];
    const guest = body.guest || {};
    const profileAddress = formatAddress(body.customer?.address);
    const shippingAddress = String(guest.shippingAddress || profileAddress || '').trim();
    const billingAddress = String(guest.billingAddress || shippingAddress || '').trim();
    const customerEmail = String(body.customer?.email || guest.email || '').trim().toLowerCase();
    const customerDetails = {
      name: String(body.customer?.name || guest.name || '').trim(),
      email: customerEmail,
      phone: String(body.customer?.phone || guest.phone || '').trim(),
      shippingAddress,
      billingAddress
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
        select id, name, price, stock, code
        from products
        where id = ${id} and active = true
      `;

      if (!rows.length) continue;

      const product = rows[0];
      if (product.stock < quantity) {
        return send(response, 400, { error: `${product.name} has only ${product.stock} available` });
      }

      orderItems.push({ product, quantity });
    }

    if (!orderItems.length) {
      return send(response, 400, { error: 'Your bag is empty' });
    }

    const subtotal = orderItems.reduce((total, item) => total + item.product.price * item.quantity, 0);
    const totals = promoDetails?.applied ? calculateDiscount(subtotal) : { subtotal, discount: 0, total: subtotal };
    const amount = totals.total;
    const receipt = `nivara_${Date.now()}`;
    const notes = {
      items: orderItems.map(item => `${item.product.code} x ${item.quantity}`).join(', '),
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
        insert into orders (razorpay_order_id, amount, customer_email, items, status)
        values (${order.id}, ${amount}, ${customerDetails.email || null}, ${JSON.stringify({
          customer: customerDetails,
          promo: promoDetails?.applied ? {
            code: promoDetails.code,
            percent: promoDetails.percent,
            subtotal: totals.subtotal,
            discount: totals.discount,
            total: totals.total,
            customerId: promoCustomer.id,
            phone: promoCustomer.normalizedPhone
          } : null,
          products: orderItems.map(item => ({ id: item.product.id, name: item.product.name, price: item.product.price, quantity: item.quantity }))
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
      promo: promoDetails?.applied ? { code: promoDetails.code, percent: promoDetails.percent, discount: totals.discount } : null
    });
  } catch (error) {
    if (isDatabaseAuthError(error)) {
      return send(response, 500, { error: 'Checkout is temporarily unavailable. Please contact Nivara Jewellery.' });
    }

    return send(response, 500, { error: error.message || 'Unable to create payment order' });
  }
};
