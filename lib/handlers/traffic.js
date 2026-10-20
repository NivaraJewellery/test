const crypto = require('crypto');
const { getSql, readJson, requireAdmin, send } = require('./_db');

async function ensureTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS website_traffic (
    id BIGSERIAL PRIMARY KEY,
    visitor_hash TEXT NOT NULL,
    page_path TEXT NOT NULL,
    referrer_domain TEXT,
    device_type TEXT NOT NULL DEFAULT 'Desktop',
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS website_traffic_viewed_at_idx ON website_traffic(viewed_at)`;
}

function cleanPath(value) {
  const path = String(value || '/').split('?')[0].slice(0, 180);
  return path.startsWith('/') ? path : '/';
}
function cleanText(value, max = 120) { return String(value || '').trim().slice(0, max); }
function visitorHash(id) {
  const secret = process.env.TRAFFIC_HASH_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || 'nivara-traffic';
  return crypto.createHmac('sha256', secret).update(String(id || '')).digest('hex');
}

module.exports = async function handler(request, response) {
  try {
    const sql = getSql();
    await ensureTable(sql);

    if (request.method === 'POST') {
      const body = await readJson(request);
      const visitorId = cleanText(body.visitorId, 100);
      const pagePath = cleanPath(body.path);
      if (!visitorId || pagePath.startsWith('/admin') || pagePath.startsWith('/reports') || pagePath.startsWith('/notify')) {
        return send(response, 200, { tracked: false });
      }
      const referrer = cleanText(body.referrer, 160) || 'Direct';
      const device = ['Mobile','Tablet','Desktop'].includes(body.device) ? body.device : 'Desktop';
      await sql`INSERT INTO website_traffic (visitor_hash, page_path, referrer_domain, device_type)
                VALUES (${visitorHash(visitorId)}, ${pagePath}, ${referrer}, ${device})`;
      return send(response, 200, { tracked: true });
    }

    if (request.method === 'GET') {
      if (!requireAdmin(request, response)) return;
      const days = Math.min(90, Math.max(7, Number(request.query?.days || 30)));
      const daily = await sql`
        SELECT (viewed_at AT TIME ZONE 'Asia/Kolkata')::date::text AS date,
               COUNT(*)::int AS page_views,
               COUNT(DISTINCT visitor_hash)::int AS visitors
        FROM website_traffic
        WHERE viewed_at >= NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY 1 ORDER BY 1 DESC`;
      const today = await sql`
        SELECT COUNT(*)::int AS page_views, COUNT(DISTINCT visitor_hash)::int AS visitors
        FROM website_traffic
        WHERE (viewed_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`;
      const pages = await sql`
        SELECT page_path AS path, COUNT(*)::int AS views
        FROM website_traffic WHERE viewed_at >= NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY page_path ORDER BY views DESC LIMIT 8`;
      const referrers = await sql`
        SELECT COALESCE(NULLIF(referrer_domain,''),'Direct') AS source, COUNT(*)::int AS views
        FROM website_traffic WHERE viewed_at >= NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY 1 ORDER BY views DESC LIMIT 8`;
      const devices = await sql`
        SELECT device_type AS device, COUNT(*)::int AS views
        FROM website_traffic WHERE viewed_at >= NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY device_type ORDER BY views DESC`;
      return send(response, 200, { today: today[0] || { visitors:0, page_views:0 }, daily, pages, referrers, devices, timezone: 'Asia/Kolkata' });
    }

    send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('traffic error', error);
    send(response, 500, { error: 'Traffic analytics is temporarily unavailable' });
  }
};
