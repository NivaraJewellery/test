const {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  readJson,
  safeEqual,
  send,
  verifyAdminSession
} = require('./_db');

module.exports = async function handler(request, response) {
  if (request.method === 'GET') {
    send(response, verifyAdminSession(request) ? 200 : 401, { authenticated: verifyAdminSession(request) });
    return;
  }

  if (request.method === 'POST') {
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredPassword) {
      send(response, 500, { error: 'ADMIN_PASSWORD is not configured' });
      return;
    }

    const body = await readJson(request);
    if (!safeEqual(body.password, configuredPassword)) {
      send(response, 401, { error: 'Invalid admin password' });
      return;
    }

    response.setHeader('Set-Cookie', createAdminSessionCookie());
    send(response, 200, { authenticated: true });
    return;
  }

  if (request.method === 'DELETE') {
    response.setHeader('Set-Cookie', clearAdminSessionCookie());
    send(response, 200, { authenticated: false });
    return;
  }

  send(response, 405, { error: 'Method not allowed' });
};
