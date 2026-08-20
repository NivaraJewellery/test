const crypto = require('crypto');
const postgres = require('postgres');

let sql;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (!sql) {
    sql = postgres(process.env.DATABASE_URL, {
      ssl: 'require',
      max: 1
    });
  }

  return sql;
}

function send(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 2_000_000) request.destroy();
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getAdminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
}

function signAdminPayload(payload) {
  return crypto
    .createHmac('sha256', getAdminSessionSecret())
    .update(payload)
    .digest('base64url');
}

function createAdminSessionCookie() {
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({
    iat: now,
    exp: now + 30 * 60 * 1000
  })).toString('base64url');
  const signature = signAdminPayload(payload);
  return `nivara_admin_session=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=1800`;
}

function clearAdminSessionCookie() {
  return 'nivara_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name) cookies[name] = valueParts.join('=');
    return cookies;
  }, {});
}

function verifyAdminSession(request) {
  const token = parseCookies(request.headers.cookie || '').nivara_admin_session;
  if (!token || !getAdminSessionSecret()) return false;

  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, signAdminPayload(payload))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(session.exp || 0) > Date.now();
  } catch (error) {
    return false;
  }
}

function requireAdmin(request, response) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const suppliedPassword = request.headers['x-admin-password'];

  if (!configuredPassword) {
    send(response, 500, { error: 'ADMIN_PASSWORD is not configured' });
    return false;
  }

  if (verifyAdminSession(request)) {
    return true;
  }

  if (!suppliedPassword || !safeEqual(suppliedPassword, configuredPassword)) {
    send(response, 401, { error: 'Invalid admin password' });
    return false;
  }

  return true;
}

module.exports = {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  getSql,
  readJson,
  requireAdmin,
  safeEqual,
  send,
  verifyAdminSession
};
