const { sendEmail } = require('./_email');
const { sendOrderConfirmationSms } = require('./_sms');
const { redeemPromo } = require('./_promo');

function normalizeOrderItems(items) {
  const parsed = typeof items === 'string' ? JSON.parse(items) : items;
  if (Array.isArray(parsed)) return { customer: {}, products: parsed, promo: null };
  return {
    customer: parsed?.customer || {},
    products: Array.isArray(parsed?.products) ? parsed.products : [],
    promo: parsed?.promo || null
  };
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDate(date) {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function buildOrderSummary(order, normalizedOrder, paymentId, orderId) {
  const products = normalizedOrder.products || [];
  const promo = normalizedOrder.promo || null;
  const subtotal = promo?.subtotal != null
    ? Number(promo.subtotal)
    : products.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);

  return {
    orderId,
    paymentId,
    amount: Number(order.amount || 0),
    subtotal,
    promo,
    customer: normalizedOrder.customer || {},
    products,
    createdAt: new Date().toISOString(),
    status: 'confirmed'
  };
}

async function loadOrderByRazorpayOrderId(sql, razorpayOrderId) {
  const rows = await sql`
    select id, razorpay_order_id, razorpay_payment_id, items, amount, customer_email, status, created_at
    from orders
    where razorpay_order_id = ${razorpayOrderId}
    limit 1
  `;
  return rows[0] || null;
}

async function finalizePaidOrder(sql, order, razorpayPaymentId) {
  if (!order) throw new Error('Order not found');
  const normalizedOrder = normalizeOrderItems(order.items);
  const storedItems = normalizedOrder.products;
  const storedPromo = normalizedOrder.promo;
  let alreadyVerified = false;

  await sql.begin(async transaction => {
    const lockedRows = await transaction`
      select id, razorpay_payment_id
      from orders
      where id = ${order.id}
      for update
    `;
    const lockedOrder = lockedRows[0];
    if (!lockedOrder) throw new Error('Order not found during payment finalization.');

    if (lockedOrder.razorpay_payment_id) {
      if (lockedOrder.razorpay_payment_id !== razorpayPaymentId) {
        throw new Error('Order has already been verified with a different payment.');
      }
      alreadyVerified = true;
      return;
    }

    if (storedPromo?.code) {
      await redeemPromo(transaction, order.razorpay_order_id);
    }

    for (const item of storedItems) {
      const productId = Number(item.id);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
        throw new Error('Order contains an invalid product or quantity.');
      }

      const updatedProducts = await transaction`
        update products
        set stock = stock - ${quantity}, updated_at = now()
        where id = ${productId} and stock >= ${quantity}
        returning id, stock
      `;
      if (!updatedProducts.length) {
        throw new Error(`${item.name || `Product ${productId}`} is out of stock or unavailable.`);
      }
    }

    await transaction`
      update orders
      set razorpay_payment_id = ${razorpayPaymentId}, status = 'open', updated_at = now()
      where id = ${order.id}
    `;
  });

  return { alreadyVerified, normalizedOrder };
}

async function sendOrderNotifications(order, normalizedOrder, paymentId) {
  const storedItems = normalizedOrder.products || [];
  const storedCustomer = normalizedOrder.customer || {};
  const storedPromo = normalizedOrder.promo || null;
  const razorpayOrderId = order.razorpay_order_id;
  const itemRows = storedItems.map(item => `<li>${item.name || `Product ${item.id}`} x ${item.quantity} - Rs. ${Number(item.price || 0).toLocaleString('en-IN')}</li>`).join('');
  const productNames = storedItems.length
    ? storedItems.map(item => `${item.name || `Product ${item.id}`} x ${item.quantity}`).join(', ')
    : 'Nivara Jewellery order';
  const orderDate = formatDate(new Date());
  const estimatedDeliveryDate = formatDate(addDays(new Date(), Number(process.env.ESTIMATED_DELIVERY_DAYS || 7)));
  const customerName = storedCustomer.name || (order.customer_email ? order.customer_email.split('@')[0] : 'Customer');
  const customerAddress = storedCustomer.shippingAddress || storedCustomer.billingAddress || 'Address shared during checkout';
  const amountText = Number(order.amount).toLocaleString('en-IN');
  const promoSummary = storedPromo?.code
    ? `<p><strong>Promo:</strong> ${storedPromo.code} (${storedPromo.percent}% off)</p><p><strong>Discount:</strong> Rs. ${Number(storedPromo.discount || 0).toLocaleString('en-IN')}</p>`
    : '';
  const orderTemplateId = process.env.RESEND_ORDER_TEMPLATE_ID;
  const orderTemplate = orderTemplateId ? {
    id: orderTemplateId,
    variables: {
      Customer_Name: customerName,
      Order_Number: razorpayOrderId,
      Order_Date: orderDate,
      Product_Names: productNames,
      Amount: amountText,
      Payment_Method: 'Razorpay',
      Customer_Address: customerAddress,
      Estimated_Delivery_Date: estimatedDeliveryDate
    }
  } : null;

  const customerHtml = storedCustomer.email ? `
    <h3>Customer details</h3>
    <p><strong>Name:</strong> ${storedCustomer.name || ''}</p>
    <p><strong>Email:</strong> ${storedCustomer.email || ''}</p>
    <p><strong>Phone:</strong> ${storedCustomer.phone || ''}</p>
    <p><strong>Shipping address:</strong><br>${storedCustomer.shippingAddress || ''}</p>
    <p><strong>Billing address:</strong><br>${storedCustomer.billingAddress || ''}</p>
  ` : '';

  const orderHtml = `
    <h2>Nivara Jewellery order received</h2>
    <p><strong>Payment ID:</strong> ${paymentId}</p>
    <p><strong>Order ID:</strong> ${razorpayOrderId}</p>
    ${promoSummary}
    <p><strong>Total:</strong> Rs. ${amountText}</p>
    <ul>${itemRows}</ul>
    ${customerHtml}
  `;

  await Promise.allSettled([
    sendEmail({
      to: process.env.ORDER_NOTIFY_EMAIL || 'nikkisakthi@gmail.com',
      subject: 'New Nivara Jewellery order',
      html: orderHtml
    }),
    order.customer_email ? sendEmail({
      to: order.customer_email,
      subject: 'Your Nivara Jewellery order is confirmed',
      html: `<p>Thank you for your order.</p>${orderHtml}`,
      template: orderTemplate
    }) : Promise.resolve(),
    sendOrderConfirmationSms({
      phone: storedCustomer.phone,
      customerName,
      orderNumber: razorpayOrderId,
      amount: amountText,
      estimatedDeliveryDate
    })
  ]);
}

module.exports = {
  normalizeOrderItems,
  buildOrderSummary,
  loadOrderByRazorpayOrderId,
  finalizePaidOrder,
  sendOrderNotifications
};
