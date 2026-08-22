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

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '').trim();
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || '',
    phoneVerified: Boolean(customer.phone_verified),
    emailVerified: customer.email_verified !== false,
    address: {
      line1: customer.address_line1 || '',
      line2: customer.address_line2 || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || ''
    }
  };
}

function publicAddress(row) {
  return {
    id: row.id,
    label: row.label || 'Address',
    recipientName: row.recipient_name || '',
    phone: row.phone || '',
    line1: row.line1 || '',
    line2: row.line2 || '',
    city: row.city || '',
    state: row.state || '',
    pincode: row.pincode || '',
    isDefault: Boolean(row.is_default)
  };
}

function requireCustomerBody(body) {
  const id = Number(body.customer?.id || body.customerId || 0);
  const email = String(body.customer?.email || body.email || '').trim().toLowerCase();
  return { id, email };
}

async function ensureCustomerSecurityColumns(sql) {
  await sql`alter table customers add column if not exists failed_login_count integer not null default 0`;
  await sql`alter table customers add column if not exists locked_until timestamptz`;
}

async function ensureAddressTable(sql) {
  await sql`
    create table if not exists customer_addresses (
      id serial primary key,
      customer_id integer not null references customers(id) on delete cascade,
      label text not null default 'Address',
      recipient_name text not null default '',
      phone text not null default '',
      line1 text not null,
      line2 text not null default '',
      city text not null,
      state text not null,
      pincode text not null,
      is_default boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists idx_customer_addresses_customer on customer_addresses(customer_id)`;
  await sql`
    insert into customer_addresses (customer_id, label, recipient_name, phone, line1, line2, city, state, pincode, is_default)
    select c.id, 'Home', c.name, c.phone, c.address_line1, c.address_line2, c.city, c.state, c.pincode, true
    from customers c
    where trim(c.address_line1) <> ''
      and not exists (select 1 from customer_addresses a where a.customer_id = c.id)
  `;
}

async function getCustomer(sql, current) {
  const rows = await sql`
    select id, name, email, phone, phone_verified, email_verified, address_line1, address_line2, city, state, pincode
    from customers
    where id = ${current.id} and email = ${current.email}
    limit 1
  `;
  return rows[0] || null;
}

async function getAddresses(sql, customerId) {
  await ensureAddressTable(sql);
  const rows = await sql`
    select id, label, recipient_name, phone, line1, line2, city, state, pincode, is_default
    from customer_addresses
    where customer_id = ${customerId}
    order by is_default desc, id asc
  `;
  return rows.map(publicAddress);
}

async function ensureEmailVerificationColumns(sql) {
  await sql`alter table customers add column if not exists email_verified boolean not null default true`;
  await sql`alter table customers add column if not exists email_otp text`;
  await sql`alter table customers add column if not exists email_otp_expires_at timestamptz`;
}

async function sendEmailOtp(sql, customer) {
  const otp = String(crypto.randomInt(100000, 999999));
  await sql`
    update customers
    set email_otp = ${otp},
        email_otp_expires_at = now() + interval '10 minutes'
    where id = ${customer.id}
  `;
  await sendEmail({
    to: customer.email,
    subject: 'Verify your Nivara Jewellery email',
    html: `<p>Hello ${customer.name || ''},</p><p>Your Nivara Jewellery email verification code is <strong>${otp}</strong>.</p><p>This code expires in 10 minutes.</p>`
  });
}

async function ensurePhoneAvailable(sql, phone, excludeCustomerId = 0) {
  if (!phone) return;
  const rows = await sql`
    select id from customers
    where (phone = ${phone} or pending_phone = ${phone})
      and id <> ${excludeCustomerId}
    limit 1
  `;
  if (rows.length) throw new Error('This mobile number is already registered to another account.');
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });

  try {
    const sql = getSql();
    const body = await readJson(request);
    const action = String(body.action || '');
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    await ensureCustomerSecurityColumns(sql);
    await ensureEmailVerificationColumns(sql);

    if (action === 'signup') {
      const name = String(body.name || '').trim();
      const phone = normalizePhone(body.phone);
      if (!name || !email || !phone || !password) return send(response, 400, { error: 'Name, email, mobile number, and password are required' });
      await ensurePhoneAvailable(sql, phone);
      const created = await sql`
        insert into customers (name, email, phone, phone_verified, email_verified, password_hash)
        values (${name}, ${email}, ${phone}, false, false, ${hashPassword(password)})
        returning id, name, email, phone, phone_verified, email_verified, address_line1, address_line2, city, state, pincode
      `;
      await sendEmailOtp(sql, created[0]);
      return send(response, 201, { otpRequired: true, verificationType: 'email', pendingCustomer: { id: created[0].id, email: created[0].email, name: created[0].name } });
    }

    if (action === 'signup-verify') {
      const customerId = Number(body.customerId || body.customer?.id || 0);
      const otp = String(body.otp || '').trim();
      if (!customerId || !email || !otp) return send(response, 400, { error: 'Email and OTP are required' });
      const customers = await sql`
        select id, name, email from customers
        where id = ${customerId} and email = ${email} and email_otp = ${otp} and email_otp_expires_at > now()
        limit 1
      `;
      if (!customers.length) return send(response, 400, { error: 'Verification code is invalid or expired' });
      await sql`
        update customers
        set email_verified = true, email_otp = null, email_otp_expires_at = null
        where id = ${customerId}
      `;
      const updated = await getCustomer(sql, { id: customerId, email });
      return send(response, 200, { customer: publicCustomer(updated) });
    }

    if (action === 'login') {
      const customers = await sql`
        select id, name, email, phone, phone_verified, email_verified, address_line1, address_line2, city, state, pincode, password_hash, failed_login_count, locked_until
        from customers where email = ${email} limit 1
      `;
      if (!customers.length) return send(response, 401, { error: 'Invalid email or password' });
      if (customers[0].locked_until && new Date(customers[0].locked_until) > new Date()) return send(response, 423, { error: 'Account locked after 3 invalid attempts. Please reset your password.' });
      if (!verifyPassword(password, customers[0].password_hash)) {
        const failedCount = Number(customers[0].failed_login_count || 0) + 1;
        await sql`update customers set failed_login_count = ${failedCount}, locked_until = ${failedCount >= 3 ? sql`now() + interval '24 hours'` : sql`locked_until`} where id = ${customers[0].id}`;
        if (failedCount >= 3) return send(response, 423, { error: 'Account locked after 3 invalid attempts. Please reset your password.' });
        return send(response, 401, { error: `Invalid email or password. ${3 - failedCount} attempt${3 - failedCount === 1 ? '' : 's'} left.` });
      }
      if (customers[0].email_verified === false) return send(response, 403, { error: 'Please verify your email address before logging in.' });
      await sql`update customers set failed_login_count = 0, locked_until = null where id = ${customers[0].id}`;
      await ensureAddressTable(sql);
      return send(response, 200, { customer: publicCustomer(customers[0]) });
    }

    if (action === 'resend-email-otp') {
      const customerId = Number(body.customerId || body.customer?.id || 0);
      const resendEmail = String(body.email || body.customer?.email || '').trim().toLowerCase();
      if (!customerId || !resendEmail) return send(response, 400, { error: 'Customer and email are required' });
      const rows = await sql`select id, name, email, email_verified from customers where id = ${customerId} and email = ${resendEmail} limit 1`;
      if (!rows.length) return send(response, 404, { error: 'Customer not found' });
      if (rows[0].email_verified) return send(response, 200, { ok: true, alreadyVerified: true });
      await sendEmailOtp(sql, rows[0]);
      return send(response, 200, { ok: true });
    }

    if (action === 'reset-request') {
      const customers = await sql`select id, name, email from customers where email = ${email} limit 1`;
      if (customers.length) {
        const token = crypto.randomBytes(24).toString('hex');
        await sql`insert into password_reset_tokens (customer_id, token, expires_at) values (${customers[0].id}, ${token}, now() + interval '30 minutes')`;
        const origin = request.headers.origin || `https://${request.headers.host}`;
        const resetLink = `${origin}/account.html?reset=${token}`;
        await sendEmail({ to: email, subject: 'Reset your Nivara Jewellery password', html: `<p>Hello ${customers[0].name || ''},</p><p>Reset your password here:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in 30 minutes.</p>` });
      }
      return send(response, 200, { ok: true });
    }

    if (action === 'reset-confirm') {
      const token = String(body.token || '').trim();
      if (!token || !password) return send(response, 400, { error: 'Reset token and new password are required' });
      const tokens = await sql`select id, customer_id from password_reset_tokens where token = ${token} and used_at is null and expires_at > now() limit 1`;
      if (!tokens.length) return send(response, 400, { error: 'Reset link is invalid or expired' });
      await sql.begin(async transaction => {
        await transaction`update customers set password_hash = ${hashPassword(password)}, failed_login_count = 0, locked_until = null where id = ${tokens[0].customer_id}`;
        await transaction`update password_reset_tokens set used_at = now() where id = ${tokens[0].id}`;
      });
      return send(response, 200, { ok: true });
    }

    if (action === 'profile-get') {
      const current = requireCustomerBody(body);
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });
      const customer = await getCustomer(sql, current);
      if (!customer) return send(response, 404, { error: 'Customer not found' });
      return send(response, 200, { customer: publicCustomer(customer), addresses: await getAddresses(sql, current.id) });
    }

    if (action === 'profile-update') {
      const current = requireCustomerBody(body);
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });
      const name = String(body.name || '').trim();
      const phone = normalizePhone(body.phone);
      if (!name || !phone) return send(response, 400, { error: 'Name and mobile number are required' });
      const customer = await getCustomer(sql, current);
      if (!customer) return send(response, 404, { error: 'Customer not found' });
      await ensurePhoneAvailable(sql, phone, current.id);
      await sql`update customers set name = ${name}, phone = ${phone}, phone_verified = false, pending_phone = null, phone_otp = null, phone_otp_expires_at = null where id = ${current.id}`;
      const updated = await getCustomer(sql, current);
      return send(response, 200, { customer: publicCustomer(updated), otpRequired: false });
    }


    if (action === 'addresses-list') {
      const current = requireCustomerBody(body);
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });
      const customer = await getCustomer(sql, current);
      if (!customer) return send(response, 404, { error: 'Customer not found' });
      return send(response, 200, { addresses: await getAddresses(sql, current.id) });
    }

    if (action === 'address-save') {
      const current = requireCustomerBody(body);
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });
      const customer = await getCustomer(sql, current);
      if (!customer) return send(response, 404, { error: 'Customer not found' });
      await ensureAddressTable(sql);
      const a = body.address || {};
      const id = Number(a.id || 0);
      const label = String(a.label || 'Address').trim() || 'Address';
      const recipientName = String(a.recipientName || customer.name || '').trim();
      const phone = normalizePhone(a.phone || customer.phone);
      const line1 = String(a.line1 || '').trim();
      const line2 = String(a.line2 || '').trim();
      const city = String(a.city || '').trim();
      const state = String(a.state || '').trim();
      const pincode = String(a.pincode || '').trim();
      if (!recipientName || !phone || !line1 || !city || !state || !pincode) return send(response, 400, { error: 'Recipient name, phone, address, city, state, and pincode are required' });
      const existing = await sql`select count(*)::int as count from customer_addresses where customer_id = ${current.id}`;
      const makeDefault = Boolean(a.isDefault) || existing[0].count === 0;
      let row;
      await sql.begin(async transaction => {
        if (makeDefault) await transaction`update customer_addresses set is_default = false where customer_id = ${current.id}`;
        if (id) {
          const updated = await transaction`
            update customer_addresses set label=${label}, recipient_name=${recipientName}, phone=${phone}, line1=${line1}, line2=${line2}, city=${city}, state=${state}, pincode=${pincode}, is_default=${makeDefault}, updated_at=now()
            where id=${id} and customer_id=${current.id}
            returning id,label,recipient_name,phone,line1,line2,city,state,pincode,is_default
          `;
          row = updated[0];
        } else {
          const created = await transaction`
            insert into customer_addresses (customer_id,label,recipient_name,phone,line1,line2,city,state,pincode,is_default)
            values (${current.id},${label},${recipientName},${phone},${line1},${line2},${city},${state},${pincode},${makeDefault})
            returning id,label,recipient_name,phone,line1,line2,city,state,pincode,is_default
          `;
          row = created[0];
        }
      });
      if (!row) return send(response, 404, { error: 'Address not found' });
      return send(response, 200, { address: publicAddress(row), addresses: await getAddresses(sql, current.id) });
    }

    if (action === 'address-delete') {
      const current = requireCustomerBody(body);
      const id = Number(body.addressId || 0);
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });
      await ensureAddressTable(sql);
      const rows = await sql`select is_default from customer_addresses where id=${id} and customer_id=${current.id} limit 1`;
      if (!rows.length) return send(response, 404, { error: 'Address not found' });
      await sql`delete from customer_addresses where id=${id} and customer_id=${current.id}`;
      if (rows[0].is_default) {
        await sql`update customer_addresses set is_default=true where id=(select id from customer_addresses where customer_id=${current.id} order by id limit 1)`;
      }
      return send(response, 200, { ok: true, addresses: await getAddresses(sql, current.id) });
    }

    if (action === 'address-default') {
      const current = requireCustomerBody(body);
      const id = Number(body.addressId || 0);
      if (!current.id || !current.email) return send(response, 401, { error: 'Please login again' });
      await ensureAddressTable(sql);
      await sql.begin(async transaction => {
        await transaction`update customer_addresses set is_default=false where customer_id=${current.id}`;
        const updated = await transaction`update customer_addresses set is_default=true, updated_at=now() where id=${id} and customer_id=${current.id} returning id`;
        if (!updated.length) throw new Error('Address not found');
      });
      return send(response, 200, { ok: true, addresses: await getAddresses(sql, current.id) });
    }

    if (action === 'orders') {
      const current = requireCustomerBody(body);
      if (!current.email) return send(response, 401, { error: 'Please login again' });
      const orders = await sql`
        select razorpay_order_id, razorpay_payment_id, amount, shipping_charge, items, created_at
        from orders
        where customer_email = ${current.email}
          and razorpay_payment_id is not null
          and coalesce(status, '') <> 'cancelled'
        order by created_at desc
        limit 20
      `;
      return send(response, 200, { orders });
    }

    return send(response, 400, { error: 'Unknown account action' });
  } catch (error) {
    if (String(error.message || '').includes('duplicate key')) return send(response, 409, { error: 'An account already exists for this email or mobile number' });
    return send(response, 500, { error: error.message || 'Account request failed' });
  }
};
