const { getSql, readJson, requireAdmin, send } = require('./_db');
const {
  loadOrderByRazorpayOrderId,
  finalizePaidOrder,
  sendOrderNotifications
} = require('./_payment-finalizer');

async function fetchRazorpayPayment(paymentId) {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) throw new Error('Razorpay keys are not configured');

  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.description || 'Unable to verify payment with Razorpay');
  return data;
}

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });

  try {
    const body = await readJson(request);
    const razorpayOrderId = String(body.razorpayOrderId || '').trim();
    const razorpayPaymentId = String(body.razorpayPaymentId || '').trim();
    if (!razorpayOrderId || !razorpayPaymentId) {
      return send(response, 400, { error: 'Razorpay Order ID and Payment ID are required' });
    }

    const sql = getSql();
    const order = await loadOrderByRazorpayOrderId(sql, razorpayOrderId);
    if (!order) return send(response, 404, { error: 'Local order not found' });

    const payment = await fetchRazorpayPayment(razorpayPaymentId);
    if (String(payment.order_id || '') !== razorpayOrderId) {
      return send(response, 400, { error: 'Payment does not belong to this Razorpay order' });
    }
    if (String(payment.status || '').toLowerCase() !== 'captured') {
      return send(response, 400, { error: `Razorpay payment is ${payment.status || 'not captured'}` });
    }
    if (Number(payment.amount) !== Math.round(Number(order.amount) * 100)) {
      return send(response, 400, { error: 'Razorpay payment amount does not match the local order amount' });
    }

    const result = await finalizePaidOrder(sql, order, razorpayPaymentId);
    if (!result.alreadyVerified) {
      await sendOrderNotifications(order, result.normalizedOrder, razorpayPaymentId);
    }

    return send(response, 200, {
      ok: true,
      alreadyVerified: result.alreadyVerified,
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      message: result.alreadyVerified ? 'Order was already reconciled.' : 'Captured payment reconciled successfully.'
    });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to reconcile payment' });
  }
};
