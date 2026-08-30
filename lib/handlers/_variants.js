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

function validateVariants(value, { required = false, declaredStock = null } = {}) {
  if (!Array.isArray(value)) {
    if (required) throw new Error('Bangle products require Size / UOM / Quantity breakup.');
    return [];
  }
  if (required && value.length === 0) throw new Error('Bangle products require at least one Size / UOM / Quantity row.');
  const seen = new Set();
  const normalized = value.map((v, index) => {
    const size = String(v?.size || '').trim();
    const uom = String(v?.uom || '').trim();
    const rawStock = v?.stock;
    const stock = Number(rawStock);
    if (!size) throw new Error(`Size is mandatory for bangle row ${index + 1}.`);
    if (!['CM','Inch','MM'].includes(uom)) throw new Error(`UOM is mandatory for bangle row ${index + 1}. Select CM, Inch or MM.`);
    if (rawStock === '' || rawStock === null || rawStock === undefined || !Number.isInteger(stock) || stock < 0) throw new Error(`Quantity is mandatory and must be a whole number 0 or above for bangle row ${index + 1}.`);
    const key = `${size}|${uom}`.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate bangle size ${size} ${uom}.`);
    seen.add(key);
    return { id: Number(v.id) || null, size, uom, stock };
  });
  if (declaredStock !== null && declaredStock !== undefined) {
    const expected = Number(declaredStock);
    if (!Number.isInteger(expected) || expected < 0) throw new Error('Stock quantity must be a whole number 0 or above.');
    const total = normalized.reduce((sum, v) => sum + v.stock, 0);
    if (total !== expected) throw new Error(`Stock quantity (${expected}) must equal the total UOM breakup (${total}).`);
  }
  return normalized;
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
  await sql`delete from product_variants where product_id=${productId}`;
  for (const v of normalized) {
    await sql`insert into product_variants (product_id,size,uom,stock) values (${productId},${v.size},${v.uom},${v.stock})`;
  }
  const total = normalized.reduce((s,v)=>s+v.stock,0);
  await sql`update products set stock=${total}, updated_at=now() where id=${productId}`;
  return normalized;
}
module.exports={ensureVariantTable,normalizeVariants,validateVariants,getVariants,replaceVariants};
