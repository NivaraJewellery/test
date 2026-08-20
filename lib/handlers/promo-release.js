const { getSql, readJson, send } = require('./_db');
const { releasePromo } = require('./_promo');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(request);
    const orderId = String(body.orderId || '').trim();
    if (!orderId) return send(response, 400, { error: 'Order id is required' });
    await releasePromo(getSql(), orderId);
    return send(response, 200, { released: true });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to release promo reservation' });
  }
};
