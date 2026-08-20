const crypto = require('crypto');
const { getSql, readJson, send } = require('./_db');
const { sendEmail } = require('./_email');
const { sendOrderConfirmationSms } = require('./_sms');
const { redeemPromo } = require('./_promo');

function normalizeOrderItems(items) {
  const parsed = typeof items === 'string' ? JSON.parse(items) : items;
  if (Array.isArray(parsed)) return { customer: {}, products: parsed };
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

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return send(response, 405, { error: 'Method not allowed' });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keySecret) {
    return send(response, 500, { error: 'Razorpay secret is not configured' });
  }

  try {
    const body = await readJson(request);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return send(response, 400, { error: 'Missing payment verification details' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return send(response, 400, { error: 'Payment verification failed' });
    }

    const sql = getSql();
    const orders = await sql`
      select id, items, amount, customer_email
      from orders
      where razorpay_order_id = ${razorpay_order_id}
      limit 1
    `;

    if (!orders.length) {
      return send(response, 404, { error: 'Order not found' });
    }

    const order = orders[0];
    const normalizedOrder = normalizeOrderItems(order.items);
    const storedItems = normalizedOrder.products;
    const storedCustomer = normalizedOrder.customer;
    const storedPromo = normalizedOrder.promo;

  let alreadyVerified = false;

  await sql.begin(async transaction => {
    const lockedOrders = await transaction`
      select id, razorpay_payment_id
      from orders
      where id = ${order.id}
      for update
    `;
    const lockedOrder = lockedOrders[0];

    if (!lockedOrder) {
      throw new Error('Order not found during payment verification.');
    }

    if (lockedOrder.razorpay_payment_id) {
      if (lockedOrder.razorpay_payment_id !== razorpay_payment_id) {
        throw new Error('Order has already been verified with a different payment.');
      }
      alreadyVerified = true;
      return;
    }

    if (storedPromo?.code) {
      await redeemPromo(transaction, razorpay_order_id);
    }

    for (const item of storedItems) {
      const productId = Number(item.id);
      const quantity = Number(item.quantity);

      if (
        !Number.isInteger(productId) ||
        productId <= 0 ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
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
      set razorpay_payment_id = ${razorpay_payment_id}, status = 'open', updated_at = now()
      where id = ${order.id}
    `;
  });

  if (alreadyVerified) {
    return send(response, 200, { verified: true, alreadyVerified: true, paymentId: razorpay_payment_id, orderId: razorpay_order_id });
  }

    const itemRows = storedItems.map(item => `<li>${item.name || `Product ${item.id}`} x ${item.quantity} - Rs. ${Number(item.price || 0).toLocaleString('en-IN')}</li>`).join('');
    const productNames = storedItems.length
      ? storedItems.map(item => `${item.name || `Product ${item.id}`} x ${item.quantity}`).join(', ')
      : 'Nivara Jewellery order';
    const orderDate = formatDate(new Date());
    const estimatedDeliveryDate = formatDate(addDays(new Date(), Number(process.env.ESTIMATED_DELIVERY_DAYS || 7)));
    const customerName = storedCustomer.name || (order.customer_email ? order.customer_email.split('@')[0] : 'Customer');
    const customerAddress = storedCustomer.shippingAddress || storedCustomer.billingAddress || 'Address shared during checkout';
    const amountText = Number(order.amount).toLocaleString('en-IN');
    const promoSummary = storedPromo?.code ? `<p><strong>Promo:</strong> ${storedPromo.code} (${storedPromo.percent}% off)</p><p><strong>Discount:</strong> Rs. ${Number(storedPromo.discount || 0).toLocaleString('en-IN')}</p>` : '';
    const orderTemplateId = process.env.RESEND_ORDER_TEMPLATE_ID;
    const orderTemplate = orderTemplateId ? {
      id: orderTemplateId,
      variables: {
        Customer_Name: customerName,
        Order_Number: razorpay_order_id,
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
      <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
      <p><strong>Order ID:</strong> ${razorpay_order_id}</p>
      ${promoSummary}
      <p><strong>Total:</strong> Rs. ${Number(order.amount).toLocaleString('en-IN')}</p>
      <ul>${itemRows}</ul>
      ${customerHtml}
    `;

    await Promise.allSettled([
      sendEmail({
        to: process.env.ORDER_NOTIFY_EMAIL || 'nikkisakthi@gmail.com',
        subject: 'New Nivara Jewellery order',
        html: orderHtml
      }),
      sendEmail({
        to: order.customer_email,
        subject: 'Your Nivara Jewellery order is confirmed',
        html: `<p>Thank you for your order.</p>${orderHtml}`,
        template: orderTemplate
      }),
      sendOrderConfirmationSms({
        phone: storedCustomer.phone,
        customerName,
        orderNumber: razorpay_order_id,
        amount: amountText,
        estimatedDeliveryDate
      })
    ]);

    return send(response, 200, {
      verified: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id
    });
  } catch (error) {
    return send(response, 500, { error: error.message || 'Unable to verify payment' });
  }
};
