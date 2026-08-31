const { getSql, send } = require('./_db');
const { ensureFeedbackTables } = require('./_feedback');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return send(response, 405, { error: 'Method not allowed' });
  try {
    const sql = getSql();
    await ensureFeedbackTables(sql);
    const website = await sql`
      select id, customer_name, overall_rating as rating, comments, created_at
      from website_feedback
      where approved = true and coalesce(trim(comments), '') <> ''
      order by created_at desc
      limit 8
    `;
    const products = await sql`
      select id, customer_name, rating, comments, product_name, created_at
      from product_reviews
      where approved = true and coalesce(trim(comments), '') <> ''
      order by created_at desc
      limit 8
    `;
    const reviews = [
      ...website.map(item => ({ ...item, kind: 'website', label: 'Shopping experience' })),
      ...products.map(item => ({ ...item, kind: 'product', label: item.product_name || 'Verified purchase' }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
    return send(response, 200, { reviews });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to load reviews.' });
  }
};
