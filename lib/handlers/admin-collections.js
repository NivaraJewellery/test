const { getSql, readJson, requireAdmin, send } = require('./_db');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCollection(body) {
  return {
    id: Number(body.id) || 0,
    name: String(body.name || '').trim(),
    icon: String(body.icon || '◇').trim(),
    image: String(body.image || '').trim()
  };
}

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  try {
    const sql = getSql();
    await sql`alter table collections add column if not exists image text not null default ''`;

    if (request.method === 'GET') {
      const collections = await sql`
        select c.id, c.name, c.slug, c.icon, c.image, c.active, count(p.id)::int as product_count
        from collections c
        left join products p on p.collection_id = c.id and p.active = true
        group by c.id
        order by c.id
      `;
      return send(response, 200, { collections });
    }

    if (request.method === 'POST') {
      const collection = normalizeCollection(await readJson(request));

      if (!collection.name) return send(response, 400, { error: 'Collection name is required' });

      const created = await sql`
        insert into collections (name, slug, icon, image, active)
        values (${collection.name}, ${slugify(collection.name)}, ${collection.icon}, ${collection.image}, true)
        on conflict (slug) do update set active = true, name = excluded.name, icon = excluded.icon, image = excluded.image
        returning id, name, slug, icon, image, active
      `;

      return send(response, 201, { collection: created[0] });
    }

    if (request.method === 'PATCH') {
      const collection = normalizeCollection(await readJson(request));

      if (!collection.id || !collection.name) {
        return send(response, 400, { error: 'Collection id and name are required' });
      }

      const updated = await sql`
        update collections
        set name = ${collection.name},
            slug = ${slugify(collection.name)},
            icon = ${collection.icon},
            image = ${collection.image},
            active = true
        where id = ${collection.id}
        returning id, name, slug, icon, image, active
      `;

      if (!updated.length) return send(response, 404, { error: 'Collection not found' });
      return send(response, 200, { collection: updated[0] });
    }

    if (request.method === 'DELETE') {
      const body = await readJson(request);
      const id = Number(body.id);

      if (!id) return send(response, 400, { error: 'Collection id is required' });

      const mappedProducts = await sql`
        select count(*)::int as count
        from products
        where collection_id = ${id} and active = true
      `;

      if (mappedProducts[0].count > 0) {
        return send(response, 400, { error: 'Cannot delete collection while products are mapped to it' });
      }

      const deleted = await sql`
        update collections
        set active = false
        where id = ${id}
        returning id
      `;

      if (!deleted.length) return send(response, 404, { error: 'Collection not found' });
      return send(response, 200, { ok: true });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to update collections' });
  }
};
