const { getSql, readJson, requireAdmin, send } = require('./_db');
const { sendEmail } = require('./_email');
const { ensureNotifyTable } = require('./notify-requests');
const { ensureVariantTable, getVariants, replaceVariants, validateVariants } = require('./_variants');

function normalizeProduct(body) {
  return {
    name: String(body.name || '').trim(),
    category: String(body.category || 'Necklace').trim(),
    type: String(body.type || body.category || 'necklace').trim().toLowerCase(),
    price: Math.max(0, Number(body.price) || 0),
    stock: Math.max(0, Number(body.stock) || 0),
    description: String(body.description || '').trim(),
    code: String(body.code || '').trim(),
    care: String(body.care || '').trim(),
    image: String(body.image || '').trim(),
    image_2: String(body.image_2 || body.image2 || '').trim(),
    image_3: String(body.image_3 || body.image3 || '').trim(),
    collectionId: Number(body.collection_id) || null
  };
}

async function ensureProductImageColumns(sql) {
  await sql`alter table products add column if not exists image_2 text`;
  await sql`alter table products add column if not exists image_3 text`;
}

async function sendRestockNotifications(sql, product) {
  await ensureNotifyTable(sql);

  const requests = await sql`
    select id, customer_name, email
    from notify_requests
    where product_id = ${product.id} and status = 'waiting' and notified_at is null
  `;

  let sent = 0;
  for (const request of requests) {
    let emailResult;
    try {
      emailResult = await sendEmail({
        to: request.email,
        subject: `${product.name} is back in stock`,
        html: `
          <p>Dear ${request.customer_name || 'Customer'},</p>
          <p>Good news! <strong>${product.name}</strong> is back in stock at NIVARA Jewellery.</p>
          <p>You can visit <a href="https://nivarajewellery.com/">nivarajewellery.com</a> to place your order.</p>
          <p>Warm regards,<br/>NIVARA Jewellery</p>
        `
      });
    } catch (error) {
      continue;
    }

    if (emailResult?.skipped) continue;

    await sql`
      update notify_requests
      set status = 'notified', notified_at = now(), updated_at = now()
      where id = ${request.id}
    `;
    sent++;
  }

  return sent;
}

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  try {
    const sql = getSql();
    await ensureProductImageColumns(sql);
    await ensureVariantTable(sql);

    if (request.method === 'GET') {
      const products = await sql`
        select id, name, type, category, price, stock, description, code, care, image, image_2, image_3, collection_id, active
        from products
        where active = true
        order by id
      `;
      const variantMap = await getVariants(sql, products.map(p => p.id));
      for (const p of products) p.variants = variantMap.get(Number(p.id)) || [];
      return send(response, 200, { products });
    }

    if (request.method === 'POST') {
      const body = await readJson(request);
      const product = normalizeProduct(body);

      if (!product.name) {
        return send(response, 400, { error: 'Product name is required' });
      }

      if (!product.image) {
        return send(response, 400, { error: 'Product image path is required' });
      }

      const isBangle = `${product.category} ${product.type}`.toLowerCase().includes('bangle');
      if (isBangle) {
        try { body.variants = validateVariants(body.variants, { required: true, declaredStock: product.stock }); }
        catch (error) { return send(response, 400, { error: error.message }); }
      }

      const created = await sql`
        insert into products (name, category, type, price, stock, description, code, care, image, image_2, image_3, collection_id, active)
        values (${product.name}, ${product.category}, ${product.type}, ${product.price}, ${product.stock}, ${product.description}, ${product.code}, ${product.care}, ${product.image}, ${product.image_2}, ${product.image_3}, ${product.collectionId}, true)
        returning id, name, type, category, price, stock, description, code, care, image, image_2, image_3, collection_id, active
      `;

      if (Array.isArray(body.variants) && body.variants.length) {
        created[0].variants = await replaceVariants(sql, created[0].id, body.variants);
        created[0].stock = created[0].variants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
      } else created[0].variants = [];
      return send(response, 201, { product: created[0] });
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      if (Array.isArray(body.products)) {
        let updatedCount = 0;

        for (const row of body.products) {
          const id = Number(row.id);
          const code = String(row.code || '').trim();
          const hasStock = Object.prototype.hasOwnProperty.call(row, 'stock') && Number.isFinite(Number(row.stock));
          const hasPrice = Object.prototype.hasOwnProperty.call(row, 'price') && Number.isFinite(Number(row.price));
          const hasImage = Boolean(String(row.image || '').trim());
          const hasImage2 = Object.prototype.hasOwnProperty.call(row, 'image_2') || Object.prototype.hasOwnProperty.call(row, 'image2');
          const hasImage3 = Object.prototype.hasOwnProperty.call(row, 'image_3') || Object.prototype.hasOwnProperty.call(row, 'image3');
          const hasCategory = Boolean(String(row.category || '').trim());
          const hasCollection = Object.prototype.hasOwnProperty.call(row, 'collection_id');
          const stock = Math.max(0, Number(row.stock) || 0);
          const price = Math.max(0, Number(row.price) || 0);
          const image = String(row.image || '').trim();
          const image2 = String(row.image_2 || row.image2 || '').trim();
          const image3 = String(row.image_3 || row.image3 || '').trim();
          const category = String(row.category || '').trim();
          const type = String(row.type || category || '').trim().toLowerCase();
          const collectionId = Number(row.collection_id) || null;

          if (!id && !code) continue;

          const before = hasStock ? await sql`
            select id, stock
            from products
            where active = true and (${id ? sql`id = ${id}` : sql`false`} or ${code ? sql`code = ${code}` : sql`false`})
            limit 1
          ` : [];

          const updated = await sql`
            update products
            set stock = ${hasStock ? stock : sql`stock`},
                price = ${hasPrice ? price : sql`price`},
                image = ${hasImage ? image : sql`image`},
                image_2 = ${hasImage2 ? image2 : sql`image_2`},
                image_3 = ${hasImage3 ? image3 : sql`image_3`},
                category = ${hasCategory ? category : sql`category`},
                type = ${hasCategory ? type : sql`type`},
                collection_id = ${hasCollection ? collectionId : sql`collection_id`},
                updated_at = now()
            where active = true and (${id ? sql`id = ${id}` : sql`false`} or ${code ? sql`code = ${code}` : sql`false`})
            returning id, name, stock
          `;
          if (hasStock && Number(before[0]?.stock || 0) === 0 && stock > 0 && updated[0]) {
            await sendRestockNotifications(sql, updated[0]);
          }
          updatedCount += updated.length;
        }

        return send(response, 200, { updated: updatedCount });
      }

      const id = Number(body.id);
      const hasStock = Object.prototype.hasOwnProperty.call(body, 'stock');
      const hasPrice = Object.prototype.hasOwnProperty.call(body, 'price');
      const hasCode = Object.prototype.hasOwnProperty.call(body, 'code');
      const hasImage = Object.prototype.hasOwnProperty.call(body, 'image');
      const hasImage2 = Object.prototype.hasOwnProperty.call(body, 'image_2') || Object.prototype.hasOwnProperty.call(body, 'image2');
      const hasImage3 = Object.prototype.hasOwnProperty.call(body, 'image_3') || Object.prototype.hasOwnProperty.call(body, 'image3');
      const hasCategory = Object.prototype.hasOwnProperty.call(body, 'category');
      const hasCollection = Object.prototype.hasOwnProperty.call(body, 'collection_id');
      const stock = Math.max(0, Number(body.stock) || 0);
      const price = Math.max(0, Number(body.price) || 0);
      const code = String(body.code || '').trim();
      const image = String(body.image || '').trim();
      const image2 = String(body.image_2 || body.image2 || '').trim();
      const image3 = String(body.image_3 || body.image3 || '').trim();
      const category = String(body.category || '').trim();
      const type = String(body.type || category || '').trim().toLowerCase();
      const collectionId = Number(body.collection_id) || null;

      if (!id) {
        return send(response, 400, { error: 'Product id is required' });
      }

      const currentRows = await sql`select id, category, type, stock from products where id=${id} limit 1`;
      if (!currentRows.length) return send(response, 404, { error: 'Product not found' });
      const currentProduct = currentRows[0];
      const isBangle = `${hasCategory ? category : currentProduct.category} ${hasCategory ? type : currentProduct.type}`.toLowerCase().includes('bangle');
      if (isBangle) {
        try {
          if (Array.isArray(body.variants)) {
            body.variants = validateVariants(body.variants, { required: true, declaredStock: hasStock ? stock : currentProduct.stock });
          } else if (hasStock) {
            const existingVariants = await getVariants(sql, [id]);
            validateVariants(existingVariants.get(id) || [], { required: true, declaredStock: stock });
          }
        } catch (error) { return send(response, 400, { error: error.message }); }
      }

      const before = hasStock ? await sql`
        select id, stock
        from products
        where id = ${id}
        limit 1
      ` : [];

      const updated = await sql`
        update products
        set stock = ${hasStock ? stock : sql`stock`},
            price = ${hasPrice ? price : sql`price`},
            code = ${hasCode ? code : sql`code`},
            image = ${hasImage ? image : sql`image`},
            image_2 = ${hasImage2 ? image2 : sql`image_2`},
            image_3 = ${hasImage3 ? image3 : sql`image_3`},
            category = ${hasCategory ? category : sql`category`},
            type = ${hasCategory ? type : sql`type`},
            collection_id = ${hasCollection ? collectionId : sql`collection_id`},
            updated_at = now()
        where id = ${id}
        returning id, name, type, category, price, stock, description, code, care, image, image_2, image_3, collection_id, active
      `;

      if (!updated.length) {
        return send(response, 404, { error: 'Product not found' });
      }

      if (Array.isArray(body.variants)) {
        updated[0].variants = await replaceVariants(sql, id, body.variants);
        updated[0].stock = updated[0].variants.reduce((sum, v) => sum + Number(v.stock || 0), 0);
      }
      if (hasStock && Number(before[0]?.stock || 0) === 0 && stock > 0) {
        await sendRestockNotifications(sql, updated[0]);
      }

      return send(response, 200, { product: updated[0] });
    }

    if (request.method === 'DELETE') {
      const body = await readJson(request);
      const id = Number(body.id);

      if (!id) {
        return send(response, 400, { error: 'Product id is required' });
      }

      await sql`
        update products
        set active = false, updated_at = now()
        where id = ${id}
      `;

      return send(response, 200, { ok: true });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to update products' });
  }
};
