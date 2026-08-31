async function ensureVariantTable(sql) {
  await sql`
    create table if not exists product_variants (
      id serial primary key,
      product_id integer not null references products(id) on delete cascade,
      size text not null,
      uom text not null check (uom in ('CM','Inch','MM')),
      stock integer not null default 0 check (stock >= 0),
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(product_id, size, uom)
    )
  `;
}

function normalizeVariants(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(v => ({
    id: Number(v.id) || null,
    size: String(v.size || '').trim(),
    uom: ['CM','Inch','MM'].includes(String(v.uom || '')) ? String(v.uom) : '',
    stock: Math.max(0, Number(v.stock) || 0)
  })).filter(v => {
    const key = `${v.size}|${v.uom}`;
    if (!v.size || !v.uom || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

async function getVariants(sql, productIds) {
  if (!productIds.length) return new Map();
  await ensureVariantTable(sql);
  const rows = await sql`select id, product_id, size, uom, stock from product_variants where active=true and product_id in ${sql(productIds)} order by id`;
  const map = new Map();
  for (const row of rows) {
    if (!map.has(Number(row.product_id))) map.set(Number(row.product_id), []);
    map.get(Number(row.product_id)).push(row);
  }
  return map;
}

async function replaceVariants(sql, productId, variants) {
  await ensureVariantTable(sql);
  const normalized = normalizeVariants(variants);

  // Keep the database id stable for an unchanged Size + UOM row. Cart items
  // reference variant ids, so deleting/re-inserting every row during an admin
  // edit can invalidate good carts or, worse, allow a stale id to represent a
  // different size later.
  const existing = await sql`
    select id, size, uom, stock
    from product_variants
    where product_id=${productId}
    order by id
  `;
  const incomingKeys = new Set(normalized.map(v => `${v.size}|${v.uom}`));

  for (const row of existing) {
    const key = `${String(row.size)}|${String(row.uom)}`;
    if (!incomingKeys.has(key)) {
      await sql`delete from product_variants where id=${row.id} and product_id=${productId}`;
    }
  }

  const saved = [];
  for (const v of normalized) {
    const current = existing.find(row => String(row.size) === v.size && String(row.uom) === v.uom);
    if (current) {
      const updated = await sql`
        update product_variants
        set stock=${v.stock}, active=true, updated_at=now()
        where id=${current.id} and product_id=${productId}
        returning id, product_id, size, uom, stock
      `;
      if (updated[0]) saved.push(updated[0]);
    } else {
      const inserted = await sql`
        insert into product_variants (product_id,size,uom,stock,active)
        values (${productId},${v.size},${v.uom},${v.stock},true)
        returning id, product_id, size, uom, stock
      `;
      if (inserted[0]) saved.push(inserted[0]);
    }
  }

  const total = normalized.reduce((s,v)=>s+v.stock,0);
  await sql`update products set stock=${total}, updated_at=now() where id=${productId}`;
  return saved;
}
module.exports={ensureVariantTable,normalizeVariants,getVariants,replaceVariants};
