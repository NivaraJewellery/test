const handlers = {
  'account': require('../lib/handlers/account'),
  'cancel-order': require('../lib/handlers/cancel-order'),
  'admin-auth': require('../lib/handlers/admin-auth'),
  'admin-collections': require('../lib/handlers/admin-collections'),
  'admin-init': require('../lib/handlers/admin-init'),
  'admin-orders': require('../lib/handlers/admin-orders'),
  'admin-products': require('../lib/handlers/admin-products'),
  'collections': require('../lib/handlers/collections'),
  'create-order': require('../lib/handlers/create-order'),
  'notify-requests': require('../lib/handlers/notify-requests'),
  'products': require('../lib/handlers/products'),
  'promo-release': require('../lib/handlers/promo-release'),
  'promo': require('../lib/handlers/promo'),
  'verify-payment': require('../lib/handlers/verify-payment')
};

function resolveRoute(req) {
  const queryRoute = req.query && req.query.route;
  if (Array.isArray(queryRoute)) return String(queryRoute[0] || '').trim();
  if (queryRoute) return String(queryRoute).trim();

  try {
    const pathname = new URL(req.url || '/', 'https://nivarajewellery.com').pathname;
    const match = pathname.match(/^\/api\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (_) {
    return '';
  }
}

module.exports = async function handler(req, res) {
  const route = resolveRoute(req);
  const selected = handlers[route];

  if (!selected) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'API route not found' }));
  }

  return selected(req, res);
};
