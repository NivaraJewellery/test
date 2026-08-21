const crypto = require('crypto');
const { getSql, readJson, send } = require('./_db');
const {
  buildOrderSummary,
  loadOrderByRazorpayOrderId,
  finalizePaidOrder,
  sendOrderNotifications
} = require('./_payment-finalizer');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return send(response, 500, { error: 'Razorpay secret is not configured' });

  try {
    const body = await readJson(request);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return send(response, 400, { error: 'Missing payment verification details' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return send(response, 400, { error: 'Payment verification failed' });
    }

    const sql = getSql();
    const order = await loadOrderByRazorpayOrderId(sql, razorpay_order_id);
    if (!order) return send(response, 404, { error: 'Order not found' });

    const result = await finalizePaidOrder(sql, order, razorpay_payment_id);
    if (!result.alreadyVerified) {
      await sendOrderNotifications(order, result.normalizedOrder, razorpay_payment_id);
    }

    return send(response, 200, {
      verified: true,
      alreadyVerified: result.alreadyVerified,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      order: buildOrderSummary(order, result.normalizedOrder, razorpay_payment_id, razorpay_order_id)
    });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to verify payment' });
  }
};
