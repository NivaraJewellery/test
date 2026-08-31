const { getSql, readJson, send } = require('./_db');
const { ensureFeedbackTables, normalizeOrderItems } = require('./_feedback');

function validRating(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

module.exports = async function handler(request, response) {
  try {
    const sql = getSql();
    await ensureFeedbackTables(sql);

    if (request.method === 'GET') {
      const rows = await sql`
        select id, customer_name, overall_rating, comments, created_at
        from website_feedback
        where approved = true
        order by created_at desc
        limit 12
      `;
      return send(response, 200, { feedback: rows });
    }

    if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
    const body = await readJson(request);
    const orderNumber = String(body.orderId || '').trim();
    const email = String(body.customerEmail || '').trim().toLowerCase();
    const overall = validRating(body.overallRating);
    const discovery = validRating(body.discoveryRating);
    const checkout = validRating(body.checkoutRating);
    const performance = validRating(body.performanceRating);
    const comments = String(body.comments || '').trim().slice(0, 1500);

    if (!orderNumber || !email || !overall || !discovery || !checkout || !performance) {
      return send(response, 400, { error: 'Please complete all four ratings.' });
    }

    const orders = await sql`
      select id, razorpay_order_id, razorpay_payment_id, customer_email, items
      from orders
      where razorpay_order_id = ${orderNumber}
      limit 1
    `;
    const order = orders[0];
    if (!order || !order.razorpay_payment_id) return send(response, 404, { error: 'Paid order not found.' });
    if (String(order.customer_email || '').trim().toLowerCase() !== email) {
      return send(response, 403, { error: 'Feedback could not be matched to this order.' });
    }

    const details = normalizeOrderItems(order.items);
    const customerName = String(details.customer?.name || '').trim().slice(0, 120);

    const existing = await sql`select id from website_feedback where razorpay_order_id = ${orderNumber} limit 1`;
    if (existing.length) return send(response, 409, { error: 'Feedback has already been submitted for this order.' });

    await sql`
      insert into website_feedback (
        order_id, razorpay_order_id, customer_email, customer_name,
        overall_rating, discovery_rating, checkout_rating, performance_rating, comments
      ) values (
        ${order.id}, ${orderNumber}, ${email}, ${customerName},
        ${overall}, ${discovery}, ${checkout}, ${performance}, ${comments}
      )
    `;

    return send(response, 201, { ok: true, message: 'Thank you! Your feedback helps us improve Nivara Jewellery.' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to save feedback.' });
  }
};
