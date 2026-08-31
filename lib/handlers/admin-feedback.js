const { getSql, readJson, requireAdmin, send } = require('./_db');
const { ensureFeedbackTables } = require('./_feedback');

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;
  try {
    const sql = getSql();
    await ensureFeedbackTables(sql);

    if (request.method === 'GET') {
      const website = await sql`
        select id, razorpay_order_id, customer_email, customer_name,
               overall_rating, discovery_rating, checkout_rating, performance_rating,
               comments, approved, created_at
        from website_feedback
        order by created_at desc
        limit 200
      `;
      const products = await sql`
        select id, razorpay_order_id, product_id, product_name, customer_email,
               customer_name, rating, comments, approved, created_at
        from product_reviews
        order by created_at desc
        limit 300
      `;
      return send(response, 200, { websiteFeedback: website, productReviews: products });
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      const id = Number(body.id);
      const type = String(body.type || '').trim();
      const approved = Boolean(body.approved);
      if (!id || !['website', 'product'].includes(type)) return send(response, 400, { error: 'Valid feedback type and id are required.' });
      const rows = type === 'website'
        ? await sql`update website_feedback set approved=${approved}, updated_at=now() where id=${id} returning id`
        : await sql`update product_reviews set approved=${approved}, updated_at=now() where id=${id} returning id`;
      if (!rows.length) return send(response, 404, { error: 'Feedback not found.' });
      return send(response, 200, { ok: true, approved });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to load feedback.' });
  }
};
