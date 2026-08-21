const { getSql, send } = require('./_db');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    return send(response, 405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    await sql`alter table collections add column if not exists image text not null default ''`;

    // Always keep the storefront taxonomy complete. This is intentionally
    // idempotent so an older production database does not lose categories
    // simply because admin-init has not been run after a deployment.
    const canonicalCollections = [
      'Necklace',
      'Hair Accessories',
      'Temple Collections',
      'Premium Collections',
      'Nethi Chutti / Maang Tikka',
      'Anti Tarnish Bracelet',
      'Anti Tarnish Chain',
      'AD Stone Collections'
    ];
    for (const name of canonicalCollections) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await sql`
        insert into collections (name, slug, icon, active)
        values (${name}, ${slug}, '◇', true)
        on conflict (slug) do update set name = excluded.name, active = true
      `;
    }

    const collections = await sql`
      select c.id, c.name, c.slug, c.icon, count(p.id)::int as product_count, coalesce(nullif(c.image, ''), min(p.image)) as image
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
