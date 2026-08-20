function normalizeIndianMobile(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length > 10) return digits;
  return '';
}

async function sendOrderConfirmationSms({ phone, customerName, orderNumber, amount, estimatedDeliveryDate }) {
  const authKey = String(process.env.MSG91_AUTH_KEY || '').trim();
  const flowId = String(process.env.MSG91_FLOW_ID || '').trim();
  const senderId = String(process.env.MSG91_SENDER_ID || '').trim();
  const mobile = normalizeIndianMobile(phone);

  // SMS is optional until MSG91/DLT configuration is completed. Payment confirmation
  // must never fail just because the SMS provider is not configured or is unavailable.
  if (!authKey || !flowId || !mobile) {
    return {
      skipped: true,
      reason: !mobile ? 'Customer mobile number is missing or invalid' : 'MSG91 is not configured'
    };
  }

  const payload = {
    flow_id: flowId,
    recipients: [
      {
        mobiles: mobile,
        Customer_Name: String(customerName || 'Customer'),
        Order_Number: String(orderNumber || ''),
        Amount: String(amount || ''),
        Estimated_Delivery_Date: String(estimatedDeliveryDate || '')
      }
    ]
  };

  if (senderId) payload.sender = senderId;

  const response = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authkey: authKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }

  if (!response.ok || data?.type === 'error') {
    throw new Error(data?.message || `MSG91 SMS failed with status ${response.status}`);
  }

  return { skipped: false, provider: 'MSG91', response: data };
}

module.exports = {
  normalizeIndianMobile,
  sendOrderConfirmationSms
};
