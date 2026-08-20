const seedProducts = require('../../products.json');
const { getSql, requireAdmin, send } = require('./_db');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return send(response, 405, { error: 'Method not allowed' });
  }

  if (!requireAdmin(request, response)) return;

  try {
    const sql = getSql();

    await sql`
      create table if not exists collections (
        id serial primary key,
        name text not null,
        slug text not null unique,
        icon text not null default '◇',
        active boolean not null default true,
        created_at timestamptz not null default now()
      )
    `;

    await sql`
      create table if not exists products (
        id serial primary key,
        name text not null,
        category text not null default 'Necklace',
        type text not null default 'necklace',
        price integer not null default 0,
        stock integer not null default 0,
        description text not null default '',
        code text not null default '',
        care text not null default '',
        image text not null default '',
        collection_id integer references collections(id),
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      create table if not exists orders (
        id serial primary key,
        razorpay_order_id text,
        razorpay_payment_id text,
        amount integer not null default 0,
        customer_email text,
        status text not null default 'open',
        items jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now()
      )
    `;

    await sql`alter table orders add column if not exists customer_email text`;
    await sql`alter table orders add column if not exists status text not null default 'open'`;
    await sql`alter table orders add column if not exists updated_at timestamptz not null default now()`;
    await sql`alter table products add column if not exists collection_id integer references collections(id)`;
    await sql`alter table products add column if not exists image_2 text`;
    await sql`alter table products add column if not exists image_3 text`;

    await sql`
      create table if not exists customers (
        id serial primary key,
        name text not null default '',
        email text not null unique,
        phone text not null default '',
        phone_verified boolean not null default false,
        address_line1 text not null default '',
        address_line2 text not null default '',
        city text not null default '',
        state text not null default '',
        pincode text not null default '',
        pending_phone text,
        phone_otp text,
        phone_otp_expires_at timestamptz,
        failed_login_count integer not null default 0,
        locked_until timestamptz,
        password_hash text not null,
        created_at timestamptz not null default now()
      )
    `;

    await sql`alter table customers add column if not exists phone text not null default ''`;
    await sql`alter table customers add column if not exists phone_verified boolean not null default false`;
    await sql`alter table customers add column if not exists address_line1 text not null default ''`;
    await sql`alter table customers add column if not exists address_line2 text not null default ''`;
    await sql`alter table customers add column if not exists city text not null default ''`;
    await sql`alter table customers add column if not exists state text not null default ''`;
    await sql`alter table customers add column if not exists pincode text not null default ''`;
    await sql`alter table customers add column if not exists pending_phone text`;
    await sql`alter table customers add column if not exists phone_otp text`;
    await sql`alter table customers add column if not exists phone_otp_expires_at timestamptz`;
    await sql`alter table customers add column if not exists failed_login_count integer not null default 0`;
    await sql`alter table customers add column if not exists locked_until timestamptz`;


    await sql`
      create table if not exists promo_redemptions (
        id serial primary key,
        promo_code text not null,
        customer_id integer not null references customers(id),
        phone text not null,
        razorpay_order_id text unique,
        status text not null default 'reserved',
        reserved_until timestamptz,
        redeemed_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (promo_code, customer_id),
        unique (promo_code, phone)
      )
    `;
    await sql`create index if not exists idx_promo_redemptions_order on promo_redemptions(razorpay_order_id)`;

    await sql`
      create table if not exists password_reset_tokens (
        id serial primary key,
        customer_id integer not null references customers(id),
        token text not null unique,
        expires_at timestamptz not null,
        used_at timestamptz,
        created_at timestamptz not null default now()
      )
    `;

    const existing = await sql`select count(*)::int as count from products`;

    // Keep the storefront collection list aligned with the original Nivara taxonomy.
    // Test products are mapped into these existing categories instead of creating
    // generic Bracelet / Pendant & Chain / Ornament collections.
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

    // Clean up generic test collections created by the previous test build.
    // Existing products are moved into the closest original Nivara category.
    const categoryAliases = [
      { from: 'Bracelet', to: 'Anti Tarnish Bracelet', type: 'bracelet' },
      { from: 'Pendant & Chain', to: 'Anti Tarnish Chain', type: 'chain' },
      { from: 'Ornament', to: 'Hair Accessories', type: 'hair-accessories' }
    ];
    for (const alias of categoryAliases) {
      const target = await sql`select id from collections where lower(name) = lower(${alias.to}) limit 1`;
      if (target.length) {
        await sql`
          update products
          set category = ${alias.to}, type = ${alias.type}, collection_id = ${target[0].id}, updated_at = now()
          where lower(category) = lower(${alias.from})
        `;
      }
      await sql`update collections set active = false where lower(name) = lower(${alias.from})`;
    }

    // Seed only products that are missing. Existing products and stock are not
    // overwritten, so this is safe to run on a database that already has the
    // original necklace catalogue.
    let addedProducts = 0;
    for (const product of seedProducts) {
      const code = String(product.code || '').trim();
      const duplicate = code
        ? await sql`select id from products where code = ${code} limit 1`
        : await sql`select id from products where lower(name) = lower(${product.name}) limit 1`;
      if (duplicate.length) continue;

      const collections = await sql`select id from collections where lower(name) = lower(${product.category || 'Necklace'}) limit 1`;
      await sql`
        insert into products (name, category, type, price, stock, description, code, care, image, image_2, image_3, collection_id, active)
        values (
          ${product.name}, ${product.category || 'Necklace'}, ${product.type || 'necklace'},
          ${product.price || 0}, ${product.stock || 0}, ${product.description || ''}, ${code},
          ${product.care || ''}, ${product.image || ''}, ${product.image_2 || ''}, ${product.image_3 || ''},
          ${collections[0]?.id || null}, true
        )
      `;
      addedProducts++;
    }

    await sql`
      update products p
      set collection_id = c.id
      from collections c
      where p.collection_id is null and lower(p.category) = lower(c.name)
    `;

    return send(response, 200, {
      ok: true,
      seeded: addedProducts > 0,
      addedProducts,
      productCount: existing[0].count + addedProducts
    });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to initialize database' });
  }
};
