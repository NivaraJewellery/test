const { getSql, readJson, send } = require('./_db');
const { ensureFeedbackTables, normalizeOrderItems } = require('./_feedback');


function uniqueProducts(products) {
  const seen = new Set();
  return (Array.isArray(products) ? products : []).filter(product => {
    const key = Number(product.id) || String(product.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validRating(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : null;
}

async function loadTokenOrder(sql, token) {
  const rows = await sql`
    select t.id as token_id, t.order_id, t.customer_email, t.used_at, t.expires_at,
           o.razorpay_order_id, o.razorpay_payment_id, o.items
    from product_review_tokens t
    join orders o on o.id = t.order_id
    where t.token = ${token}
    limit 1
  `;
  return rows[0] || null;
}

module.exports = async function handler(request, response) {
  try {
    const sql = getSql();
    await ensureFeedbackTables(sql);

    if (request.method === 'GET') {
      const url = new URL(request.url || '/', 'https://nivarajewellery.com');
      const token = String(url.searchParams.get('token') || request.query?.token || '').trim();
      if (!token) return send(response, 400, { error: 'Review link is missing.' });
      const row = await loadTokenOrder(sql, token);
      if (!row || !row.razorpay_payment_id) return send(response, 404, { error: 'This review link is invalid.' });
      if (new Date(row.expires_at).getTime() < Date.now()) return send(response, 410, { error: 'This review link has expired.' });
      if (row.used_at) return send(response, 409, { error: 'Thank you — this order has already been reviewed.', submitted: true });

      const details = normalizeOrderItems(row.items);
      const reviewProducts = uniqueProducts(details.products);
      return send(response, 200, {
        orderId: row.razorpay_order_id,
        customerName: details.customer?.name || '',
        products: reviewProducts.map(item => ({
          id: Number(item.id) || null,
          name: item.name || `Product ${item.id}`,
          image: item.image || '',
          size: item.size || '',
          uom: item.uom || '',
          type: item.type || '',
          category: item.category || ''
        }))
      });
    }

    if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
    const body = await readJson(request);
    const token = String(body.token || '').trim();
    const reviews = Array.isArray(body.reviews) ? body.reviews : [];
    if (!token || !reviews.length) return send(response, 400, { error: 'Please rate the products in your order.' });

    await sql.begin(async transaction => {
      const rows = await transaction`
        select t.id as token_id, t.order_id, t.customer_email, t.used_at, t.expires_at,
               o.razorpay_order_id, o.razorpay_payment_id, o.items
        from product_review_tokens t
        join orders o on o.id = t.order_id
        where t.token = ${token}
        for update
      `;
      const row = rows[0];
      if (!row || !row.razorpay_payment_id) throw new Error('This review link is invalid.');
      if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('This review link has expired.');
      if (row.used_at) throw new Error('This order has already been reviewed.');

      const details = normalizeOrderItems(row.items);
      const products = uniqueProducts(details.products);
      const customerName = String(details.customer?.name || '').slice(0, 120);

      for (const product of products) {
        const submitted = reviews.find(review => Number(review.productId) === Number(product.id));
        const rating = validRating(submitted?.rating);
        if (!rating) throw new Error(`Please choose a rating for ${product.name || 'each product'}.`);
        const comments = String(submitted?.comments || '').trim().slice(0, 1500);
        await transaction`
          insert into product_reviews (
            order_id, razorpay_order_id, product_id, product_name,
            customer_email, customer_name, rating, comments
          ) values (
            ${row.order_id}, ${row.razorpay_order_id}, ${Number(product.id) || null}, ${product.name || `Product ${product.id}`},
            ${row.customer_email || ''}, ${customerName}, ${rating}, ${comments}
          )
          on conflict (order_id, product_id) do nothing
        `;
      }

      await transaction`
        update product_review_tokens set used_at = now(), updated_at = now() where id = ${row.token_id}
      `;
    });

    return send(response, 201, { ok: true, message: 'Thank you for reviewing your Nivara Jewellery purchase.' });
  } catch (error) {
    const message = error.message || 'Unable to submit product review.';
    const known = /invalid|expired|already|choose a rating/i.test(message);
    return send(response, known ? 400 : 500, { error: message });
  }
};
