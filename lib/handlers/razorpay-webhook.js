const crypto = require('crypto');
const { getSql, send } = require('./_db');
const {
  loadOrderByRazorpayOrderId,
  finalizePaidOrder,
  sendOrderNotifications
} = require('./_payment-finalizer');

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > 2_000_000) {
        reject(new Error('Webhook payload too large'));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });

  const webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) return send(response, 500, { error: 'RAZORPAY_WEBHOOK_SECRET is not configured' });

  try {
    const rawBody = await readRawBody(request);
    const signature = request.headers['x-razorpay-signature'];
    const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!signature || !safeEqual(signature, expected)) {
      return send(response, 401, { error: 'Invalid webhook signature' });
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const event = String(payload.event || '');
    if (!['payment.captured', 'order.paid'].includes(event)) {
      return send(response, 200, { ok: true, ignored: true, event });
    }

    const payment = payload?.payload?.payment?.entity;
    const razorpayPaymentId = String(payment?.id || '').trim();
    const razorpayOrderId = String(payment?.order_id || payload?.payload?.order?.entity?.id || '').trim();
    const paymentStatus = String(payment?.status || '').toLowerCase();

    if (!razorpayPaymentId || !razorpayOrderId) {
      return send(response, 200, { ok: true, ignored: true, reason: 'Missing payment/order id' });
    }
    if (event === 'payment.captured' && paymentStatus && paymentStatus !== 'captured') {
      return send(response, 200, { ok: true, ignored: true, reason: `Payment status ${paymentStatus}` });
    }

    const sql = getSql();
    const order = await loadOrderByRazorpayOrderId(sql, razorpayOrderId);
    if (!order) return send(response, 200, { ok: true, ignored: true, reason: 'Order not found locally' });

    if (payment?.amount != null && Number(payment.amount) !== Math.round(Number(order.amount) * 100)) {
      return send(response, 400, { error: 'Webhook payment amount does not match local order amount' });
    }

    const result = await finalizePaidOrder(sql, order, razorpayPaymentId);
    if (!result.alreadyVerified) {
      await sendOrderNotifications(order, result.normalizedOrder, razorpayPaymentId);
    }

    return send(response, 200, { ok: true, reconciled: !result.alreadyVerified, orderId: razorpayOrderId, paymentId: razorpayPaymentId });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to process Razorpay webhook' });
  }
};
