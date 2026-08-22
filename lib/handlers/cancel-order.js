const { getSql, readJson, send } = require('./_db');
const { releasePromo } = require('./_promo');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(request);
    const orderId = String(body.orderId || '').trim();
    if (!orderId) return send(response, 400, { error: 'Order id is required' });
    const sql = getSql();
    const rows = await sql`
      update orders
      set status='cancelled', updated_at=now()
      where razorpay_order_id=${orderId}
        and razorpay_payment_id is null
        and status='pending_payment'
      returning id
    `;
    let promoReleased = false;
    try {
      await releasePromo(sql, orderId);
      promoReleased = true;
    } catch (_) {}

    return send(response, 200, {
      ok: true,
      cancelled: rows.length > 0,
      promoReleased
    });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to cancel pending order' });
  }
};
