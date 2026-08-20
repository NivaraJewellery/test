const { getSql, send } = require('./_db');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    return send(response, 405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const collections = await sql`
      select c.id, c.name, c.slug, c.icon, count(p.id)::int as product_count, min(p.image) as image
      from collections c
      left join products p on p.collection_id = c.id and p.active = true
      where c.active = true
      group by c.id
      order by c.id
    `;

    return send(response, 200, { collections });
  } catch (error) {
    return send(response, 500, { error: 'Unable to load collections' });
  }
};
