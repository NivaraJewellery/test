const { getSql, readJson, requireAdmin, send } = require('./_db');

function normalizeOrderItems(items) {
  const parsed = typeof items === 'string' ? JSON.parse(items) : items;
  if (Array.isArray(parsed)) return { customer: {}, products: parsed };
  return {
    customer: parsed?.customer || {},
    products: Array.isArray(parsed?.products) ? parsed.products : []
  };
}

function normalizeOrder(order) {
  const details = normalizeOrderItems(order.items);
  return {
    id: order.id,
    orderNumber: order.razorpay_order_id,
    paymentId: order.razorpay_payment_id,
    amount: order.amount,
    status: order.status || 'open',
    customerEmail: order.customer_email,
    createdAt: order.created_at,
    customer: details.customer,
    products: details.products
  };
}

async function ensureOrderColumns(sql) {
  await sql`alter table orders add column if not exists status text not null default 'open'`;
  await sql`alter table orders add column if not exists updated_at timestamptz not null default now()`;
}

module.exports = async function handler(request, response) {
  if (!requireAdmin(request, response)) return;

  try {
    const sql = getSql();
    await ensureOrderColumns(sql);

    if (request.method === 'GET') {
      const orders = await sql`
        select id, razorpay_order_id, razorpay_payment_id, amount, status, customer_email, items, created_at
        from orders
        where razorpay_payment_id is not null
        order by created_at desc
        limit 200
      `;

      const reportRows = await sql`
        select
          count(*) filter (where razorpay_payment_id is not null)::int as total_orders,
          coalesce(sum(amount) filter (where razorpay_payment_id is not null), 0)::int as total_sales,
          count(*) filter (where razorpay_payment_id is not null and status = 'open')::int as open_orders,
          count(*) filter (where razorpay_payment_id is not null and status = 'in_progress')::int as in_progress_orders,
          count(*) filter (where razorpay_payment_id is not null and status = 'delivered')::int as delivered_orders
        from orders
      `;
      const normalizedOrders = orders.map(normalizeOrder);
      const itemsSold = normalizedOrders.reduce((total, order) => {
        if (!order.paymentId) return total;
        return total + order.products.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      }, 0);

      return send(response, 200, {
        orders: normalizedOrders,
        report: { ...reportRows[0], items_sold: itemsSold }
      });
    }

    if (request.method === 'PATCH') {
      const body = await readJson(request);
      const id = Number(body.id);
      const status = String(body.status || '').trim();
      const allowed = ['open', 'in_progress', 'delivered'];

      if (!id || !allowed.includes(status)) {
        return send(response, 400, { error: 'Valid order id and status are required' });
      }

      const updated = await sql`
        update orders
        set status = ${status}, updated_at = now()
        where id = ${id}
        returning id
      `;

      if (!updated.length) return send(response, 404, { error: 'Order not found' });
      return send(response, 200, { ok: true });
    }

    if (request.method === 'DELETE') {
      await sql`delete from orders`;
      return send(response, 200, { ok: true });
    }

    return send(response, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to load orders' });
  }
};
