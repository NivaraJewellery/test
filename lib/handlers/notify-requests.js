const { getSql, readJson, requireAdmin, send } = require('./_db');

async function ensureNotifyTable(sql) {
  await sql`
    create table if not exists notify_requests (
      id serial primary key,
      product_id integer references products(id) on delete cascade,
      product_name text not null,
      customer_name text,
      email text not null,
      status text not null default 'waiting',
      notified_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create index if not exists notify_requests_product_email_idx
    on notify_requests (product_id, email)
  `;
}

module.exports = async function handler(request, response) {
  try {
    const sql = getSql();
    await ensureNotifyTable(sql);

    if (request.method === 'POST') {
      const body = await readJson(request);
      const productId = Number(body.product_id);
      const email = String(body.email || '').trim().toLowerCase();
      const customerName = String(body.customer_name || '').trim();

      if (!productId) return send(response, 400, { error: 'Product is required' });
      if (!email || !email.includes('@')) return send(response, 400, { error: 'Valid email is required' });

      const product = await sql`
        select id, name, stock
        from products
        where id = ${productId} and active = true
      `;

      if (!product.length) return send(response, 404, { error: 'Product not found' });
      if (Number(product[0].stock) > 0) return send(response, 400, { error: 'This product is already available' });

      const existing = await sql`
        select id
        from notify_requests
        where product_id = ${productId} and lower(email) = ${email}
        limit 1
      `;

      const created = existing.length ? await sql`
        update notify_requests
        set customer_name = ${customerName}, status = 'waiting', notified_at = null, updated_at = now()
        where id = ${existing[0].id}
        returning id
      ` : await sql`
        insert into notify_requests (product_id, product_name, customer_name, email, status, updated_at)
        values (${productId}, ${product[0].name}, ${customerName}, ${email}, 'waiting', now())
        returning id
      `;

      return send(response, 200, { ok: true, id: created[0].id });
    }

    if (!requireAdmin(request, response)) return;

    if (request.method === 'GET') {
      const requests = await sql`
        select n.id, n.product_id, n.product_name, n.customer_name, n.email, n.status, n.notified_at, n.created_at,
          p.stock, p.image
        from notify_requests n
        left join products p on p.id = n.product_id
        order by n.created_at desc
      `;
      return send(response, 200, { requests });
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      const id = Number(body.id);
      const status = String(body.status || '').trim();
      if (!id || !status) return send(response, 400, { error: 'Request id and status are required' });

      const updated = await sql`
        update notify_requests
        set status = ${status}, updated_at = now()
        where id = ${id}
        returning id
      `;
      return send(response, 200, { ok: Boolean(updated.length) });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to save notify request' });
  }
};

module.exports.ensureNotifyTable = ensureNotifyTable;
