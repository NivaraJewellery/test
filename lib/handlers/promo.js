const { getSql, readJson, send } = require('./_db');
const {
  PROMO_CODE,
  PROMO_PERCENT,
  PROMO_START,
  PROMO_END,
  getPromoState,
  getPromoMessage,
  getRegisteredPromoCustomer,
  checkPromoEligibility
} = require('./_promo');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(request);
    const sql = getSql();
    const state = getPromoState();

    if (body.action === 'status') {
      return send(response, 200, {
        code: PROMO_CODE,
        percent: PROMO_PERCENT,
        state,
        message: getPromoMessage(state),
        startsAt: PROMO_START.toISOString(),
        endsAt: PROMO_END.toISOString()
      });
    }

    const customer = await getRegisteredPromoCustomer(sql, body.customer);
    const promo = await checkPromoEligibility(sql, customer, body.code);
    return send(response, 200, {
      valid: Boolean(promo.applied),
      code: promo.code,
      percent: promo.percent,
      state
    });
  } catch (error) {
    return send(response, error.statusCode || 500, { error: error.message || 'Unable to validate promo code' });
  }
};
