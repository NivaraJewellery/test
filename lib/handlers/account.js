const crypto = require('crypto');
const { getSql, readJson, send } = require('./_db');
const { sendEmail } = require('./_email');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, savedHash) {
  const [salt, hash] = String(savedHash || '').split(':');
  if (!salt || !hash) return false;
  const testHash = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || '',
    phoneVerified: Boolean(customer.phone_verified),
    address: {
      line1: customer.address_line1 || '',
      line2: customer.address_line2 || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || ''
    }
  };
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').trim();
}

function requireCustomerBody(body) {
  const id = Number(body.customer?.id || body.customerId || 0);
  const email = String(body.customer?.email || body.email || '').trim().toLowerCase();
  return { id, email };
}

async function sendPhoneOtp(sql, customer, phone) {
  const otp = String(crypto.randomInt(100000, 999999));
  await sql`
    update customers
    set pending_phone = ${phone},
        phone_otp = ${otp},
        phone_otp_expires_at = now() + interval '10 minutes'
    where id = ${customer.id}
  `;
  await sendEmail({
    to: customer.email,
    subject: 'Verify your Nivara Jewellery mobile number',
    html: `<p>Hello ${customer.name || ''},</p><p>Your OTP to verify mobile number ${phone} is <strong>${otp}</strong>.</p><p>This OTP expires in 10 minutes.</p>`
  });
}

async function ensureCustomerSecurityColumns(sql) {
  await sql`alter table customers add column if not exists failed_login_count integer not null default 0`;
  await sql`alter table customers add column if not exists locked_until timestamptz`;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return send(response, 405, { error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const body = await readJson(request);
    const action = String(body.action || '');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    await ensureCustomerSecurityColumns(sql);

    if (action === 'signup') {
      const name = String(body.name || '').trim();
      const phone = normalizePhone(body.phone);
      if (!name || !email || !phone || !password) {
        return send(response, 400, { error: 'Name, email, mobile number, and password are required' });
      }

      const created = await sql`
        insert into customers (name, email, phone, phone_verified, pending_phone, password_hash)
        values (${name}, ${email}, '', false, ${phone}, ${hashPassword(password)})
        returning id, name, email, phone, phone_verified, pending_phone, address_line1, address_line2, city, state, pincode
      `;

      await sendPhoneOtp(sql, created[0], phone);
      return send(response, 201, {
        otpRequired: true,
        pendingCustomer: { id: created[0].id, email: created[0].email, name: created[0].name }
      });
    }

    if (action === 'login') {
      const customers = await sql`
        select id, name, email, phone, phone_verified, address_line1, address_line2, city, state, pincode, password_hash, failed_login_count, locked_until
        from customers
        where email = ${email}
        limit 1
      `;
      if (!customers.length) {
        return send(response, 401, { error: 'Invalid email or password' });
      }

      if (customers[0].locked_until && new Date(customers[0].locked_until) > new Date()) {
        return send(response, 423, { error: 'Account locked after 3 invalid attempts. Please reset your password.' });
      }

      if (!verifyPassword(password, customers[0].password_hash)) {
        const failedCount = Number(customers[0].failed_login_count || 0) + 1;
        await sql`
          update customers
          set failed_login_count = ${failedCount},
              locked_until = ${failedCount >= 3 ? sql`now() + interval '24 hours'` : sql`locked_until`}
          where id = ${customers[0].id}
        `;
        if (failedCount >= 3) {
          return send(response, 423, { error: 'Account locked after 3 invalid attempts. Please reset your password.' });
        }
        return send(response, 401, { error: `Invalid email or password. ${3 - failedCount} attempt${3 - failedCount === 1 ? '' : 's'} left.` });
      }

      await sql`
        update customers
        set failed_login_count = 0, locked_until = null
        where id = ${customers[0].id}
      `;

      return send(response, 200, { customer: publicCustomer(customers[0]) });
    }

    if (action === 'signup-verify') {
      const customerId = Number(body.customerId || body.customer?.id || 0);
      const otp = String(body.otp || '').trim();
      if (!customerId || !email || !otp) return send(response, 400, { error: 'Email and OTP are required' });

      const customers = await sql`
        select id, name, email, pending_phone
        from customers
        where id = ${customerId}
          and email = ${email}
          and phone_otp = ${otp}
          and phone_otp_expires_at > now()
        limit 1
      `;
      if (!customers.length) return send(response, 400, { error: 'OTP is invalid or expired' });

      await sql`
        update customers
        set phone = ${customers[0].pending_phone},
            phone_verified = true,
            pending_phone = null,
            phone_otp = null,
            phone_otp_expires_at = null
        where id = ${customerId}
      `;

      const updated = await sql`
        select id, name, email, phone, phone_verified, address_line1, address_line2, city, state, pincode
        from customers
        where id = ${customerId}
        limit 1
      `;

      return send(response, 200, { customer: publicCustomer(updated[0]) });
    }

    if (action === 'resend-phone-otp') {
      const current = requireCustomerBody(body);
      const phone = normalizePhone(body.phone || body.customer?.phone);
      if (!current.id || !current.email || !phone) return send(response, 400, { error: 'Customer and mobile number are required' });
      const customers = await sql`
        select id, name, email
        from customers
        where id = ${current.id} and email = ${current.email}
        limit 1
      `;
      if (!customers.length) return send(response, 404, { error: 'Customer not found' });
      await sendPhoneOtp(sql, customers[0], phone);
      return send(response, 200, { ok: true });
    }

    if (action === 'reset-request') {
      const customers = await sql`select id, name, email from customers where email = ${email} limit 1`;
      if (customers.length) {
        const token = crypto.randomBytes(24).toString('hex');
        await sql`
          insert into password_reset_tokens (customer_id, token, expires_at)
          values (${customers[0].id}, ${token}, now() + interval '30 minutes')
        `;
        const origin = request.headers.origin || `https://${request.headers.host}`;
        const resetLink = `${origin}/account.html?reset=${token}`;
        await sendEmail({
          to: email,
          subject: 'Reset your Nivara Jewellery password',
          html: `<p>Hello ${customers[0].name || ''},</p><p>Reset your password here:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 30 minutes.</p>`
        });
      }

      return send(response, 200, { ok: true });
    }

    if (action === 'reset-confirm') {
      const token = String(body.token || '').trim();
      if (!token || !password) return send(response, 400, { error: 'Reset token and new password are required' });

      const tokens = await sql`
        select id, customer_id
        from password_reset_tokens
        where token = ${token} and used_at is null and expires_at > now()
        limit 1
      `;

      if (!tokens.length) return send(response, 400, { error: 'Reset link is invalid or expired' });

      await sql.begin(async transaction => {
        await transaction`
          update customers
          set password_hash = ${hashPassword(password)},
              failed_login_count = 0,
              locked_until = null
          where id = ${tokens[0].customer_id}
        `;
        await transaction`
          update password_reset_tokens
          set used_at = now()
          where id = ${tokens[0].id}
        `;
      });

      return send(response, 200, { ok: true });
    }

    if (action === 'profile-get') {
      const current = requireCustomerBody(body);
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });

      const customers = await sql`
        select id, name, email, phone, phone_verified, address_line1, address_line2, city, state, pincode
        from customers
        where id = ${current.id} and email = ${current.email}
        limit 1
      `;

      if (!customers.length) return send(response, 404, { error: 'Customer not found' });
      return send(response, 200, { customer: publicCustomer(customers[0]) });
    }

    if (action === 'profile-update') {
      const current = requireCustomerBody(body);
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });

      const name = String(body.name || '').trim();
      const phone = normalizePhone(body.phone);
      const address = body.address || {};
      if (!name || !phone) return send(response, 400, { error: 'Name and mobile number are required' });

      const customers = await sql`
        select id, name, email, phone, phone_verified
        from customers
        where id = ${current.id} and email = ${current.email}
        limit 1
      `;
      if (!customers.length) return send(response, 404, { error: 'Customer not found' });

      const phoneChanged = phone !== normalizePhone(customers[0].phone);
      const phoneNeedsVerification = phoneChanged || !customers[0].phone_verified;
      let otpRequired = false;

      if (phoneNeedsVerification) {
        otpRequired = true;
        await sql`
          update customers
          set name = ${name},
              address_line1 = ${String(address.line1 || '').trim()},
              address_line2 = ${String(address.line2 || '').trim()},
              city = ${String(address.city || '').trim()},
              state = ${String(address.state || '').trim()},
              pincode = ${String(address.pincode || '').trim()},
              pending_phone = ${phone}
          where id = ${current.id} and email = ${current.email}
        `;
        await sendPhoneOtp(sql, { id: current.id, email: current.email, name }, phone);
      } else {
        await sql`
          update customers
          set name = ${name},
              address_line1 = ${String(address.line1 || '').trim()},
              address_line2 = ${String(address.line2 || '').trim()},
              city = ${String(address.city || '').trim()},
              state = ${String(address.state || '').trim()},
              pincode = ${String(address.pincode || '').trim()}
          where id = ${current.id} and email = ${current.email}
        `;
      }

      const updated = await sql`
        select id, name, email, phone, phone_verified, address_line1, address_line2, city, state, pincode
        from customers
        where id = ${current.id} and email = ${current.email}
        limit 1
      `;

      return send(response, 200, { customer: publicCustomer(updated[0]), otpRequired });
    }

    if (action === 'verify-phone') {
      const current = requireCustomerBody(body);
      const otp = String(body.otp || '').trim();
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });
      if (!otp) return send(response, 400, { error: 'OTP is required' });

      const customers = await sql`
        select id, pending_phone
        from customers
        where id = ${current.id}
          and email = ${current.email}
          and phone_otp = ${otp}
          and phone_otp_expires_at > now()
        limit 1
      `;

      if (!customers.length) return send(response, 400, { error: 'OTP is invalid or expired' });

      await sql`
        update customers
        set phone = ${customers[0].pending_phone},
            phone_verified = true,
            pending_phone = null,
            phone_otp = null,
            phone_otp_expires_at = null
        where id = ${current.id} and email = ${current.email}
      `;

      const updated = await sql`
        select id, name, email, phone, phone_verified, address_line1, address_line2, city, state, pincode
        from customers
        where id = ${current.id} and email = ${current.email}
        limit 1
      `;

      return send(response, 200, { customer: publicCustomer(updated[0]) });
    }

    if (action === 'orders') {
      const current = requireCustomerBody(body);
      if (!current.email) return send(response, 401, { error: 'Please login again' });

      const orders = await sql`
        select razorpay_order_id, razorpay_payment_id, amount, items, created_at
        from orders
        where customer_email = ${current.email}
        order by created_at desc
        limit 20
      `;

      return send(response, 200, { orders });
    }

    return send(response, 400, { error: 'Unknown account action' });
  } catch (error) {
    if (String(error.message || '').includes('duplicate key')) {
      return send(response, 409, { error: 'An account already exists for this email' });
    }
    return send(response, 500, { error: error.message || 'Account request failed' });
  }
};
