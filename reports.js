let orders = [];
let report = {};
let orderPage = 1;
const ORDERS_PER_PAGE = 8;
const ADMIN_SESSION_MS = 30 * 60 * 1000;

const loginPanel = document.getElementById('loginPanel');
const reportPanel = document.getElementById('reportPanel');
const orderList = document.getElementById('orderList');
const orderPagination = document.getElementById('orderPagination');
const reportGrid = document.getElementById('reportGrid');
const adminSessionNote = document.getElementById('adminSessionNote');

function authHeaders() {
  return {
    'Content-Type': 'application/json'
  };
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

function showReports() {
  loginPanel.hidden = true;
  reportPanel.hidden = false;
}

function showLogin() {
  loginPanel.hidden = false;
  reportPanel.hidden = true;
}

function saveAdminSession() {
  sessionStorage.setItem('nivara-admin-session', String(Date.now()));
  if (adminSessionNote) adminSessionNote.textContent = 'Admin session expires after 30 minutes of inactivity.';
}

async function clearAdminSession(message) {
  sessionStorage.removeItem('nivara-admin-session');
  try {
    await fetch('/api/admin-auth', { method: 'DELETE', credentials: 'same-origin' });
  } catch (error) {
    // Ignore network errors during local logout.
  }
  showLogin();
  if (message) showToast(message);
}

function isAdminSessionExpired() {
  const lastSeen = Number(sessionStorage.getItem('nivara-admin-session') || 0);
  return !lastSeen || Date.now() - lastSeen > ADMIN_SESSION_MS;
}

function refreshAdminSession() {
  if (!isAdminSessionExpired()) sessionStorage.setItem('nivara-admin-session', String(Date.now()));
}

function ensureAdminSession() {
  if (!isAdminSessionExpired()) {
    refreshAdminSession();
    return true;
  }
  clearAdminSession('Admin session expired. Please login again.');
  return false;
}

async function apiRequest(path, options = {}) {
  if (!ensureAdminSession()) throw new Error('Admin session expired');
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    throw new Error(`API returned ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 120)}` : ''}`);
  }
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function adminLogin(password) {
  const response = await fetch('/api/admin-auth', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Login failed');
  saveAdminSession();
}

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
}

function renderReport() {
  reportGrid.innerHTML = [
    ['Total orders', report.total_orders || 0],
    ['Open orders', report.open_orders || 0],
    ['In progress', report.in_progress_orders || 0],
    ['Delivered', report.delivered_orders || 0],
    ['Items sold', report.items_sold || 0],
    ['Sales total', formatPrice(report.total_sales || 0)]
  ].map(([label, value]) => `<article class="report-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
}

function renderOrders() {
  const totalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PER_PAGE));
  orderPage = Math.min(orderPage, totalPages);
  const visibleOrders = orders.slice((orderPage - 1) * ORDERS_PER_PAGE, orderPage * ORDERS_PER_PAGE);

  orderList.innerHTML = visibleOrders.length ? visibleOrders.map(order => {
    const products = order.products || [];
    const customer = order.customer || {};
    const address = customer.shippingAddress || customer.billingAddress || 'No address saved';
    return `
      <article class="admin-order-card">
        <div>
          <h3>${order.orderNumber || 'Order'}</h3>
          <p>${new Date(order.createdAt).toLocaleString('en-IN')} - ${formatPrice(order.amount)} - Shipping ${Number(order.shippingCharge || 0) === 0 ? 'FREE' : formatPrice(order.shippingCharge)} - ${order.paymentId || 'Payment pending'}</p>
          <p><strong>${customer.name || order.customerEmail || 'Customer'}</strong> - ${customer.phone || 'No phone'} - ${order.customerEmail || customer.email || 'No email'}</p>
          <p>${address}</p>
          <ul>${products.map(item => { const isBangle=String(item.type||item.category||'').toLowerCase().includes('bangle') || Boolean(item.variantId && item.size); return `<li>${item.name || `Product ${item.id}`}${isBangle&&item.size?` — Size: ${item.size}${item.uom?` ${item.uom}`:''}`:''} x ${item.quantity}</li>`; }).join('')}</ul>
        </div>
        <div class="order-status-controls">
          <select data-order-status="${order.id}">
            <option value="open" ${order.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="in_progress" ${order.status === 'in_progress' ? 'selected' : ''}>In progress</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Delivered</option>
          </select>
          <button data-save-order-status="${order.id}">Save status</button>
        </div>
      </article>
    `;
  }).join('') : '<p class="muted-text">No orders yet.</p>';

  orderPagination.innerHTML = orders.length > ORDERS_PER_PAGE ? `
    <button type="button" data-order-page="prev" ${orderPage === 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${orderPage} of ${totalPages} - showing latest ${ORDERS_PER_PAGE}</span>
    <button type="button" data-order-page="next" ${orderPage === totalPages ? 'disabled' : ''}>Next</button>
  ` : '';
}

async function loadReports() {
  const data = await apiRequest('/api/admin-orders');
  orders = data.orders || [];
  report = data.report || {};
  renderReport();
  renderOrders();
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.getElementById('adminPassword').value;

  try {
    await adminLogin(password);
    document.getElementById('adminPassword').value = '';
    await loadReports();
    showReports();
    showToast('Logged in');
  } catch (error) {
    clearAdminSession();
    showToast(error.message);
  }
});

document.getElementById('refreshReports').addEventListener('click', async () => {
  try {
    await loadReports();
    showToast('Reports refreshed');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('clearReports').addEventListener('click', async () => {
  if (!confirm('Clear all order reports and purchase details? This cannot be undone.')) return;

  const password = prompt('Enter admin password to clear all reports');
  if (!password) return showToast('Password is required');

  try {
    await apiRequest('/api/admin-orders', {
      method: 'DELETE',
      headers: { 'x-admin-password': password },
      body: '{}'
    });
    await loadReports();
    showToast('Reports cleared');
  } catch (error) {
    showToast(error.message || 'Unable to clear reports');
  }
});

document.getElementById('logoutButton').addEventListener('click', () => {
  clearAdminSession('Logged out');
});

document.addEventListener('click', async event => {
  const orderPageButton = event.target.closest('[data-order-page]');
  const saveOrderStatusButton = event.target.closest('[data-save-order-status]');

  try {
    if (orderPageButton) {
      orderPage += orderPageButton.dataset.orderPage === 'next' ? 1 : -1;
      renderOrders();
      return;
    }

    if (saveOrderStatusButton) {
      const id = Number(saveOrderStatusButton.dataset.saveOrderStatus);
      const select = document.querySelector(`[data-order-status="${id}"]`);
      await apiRequest('/api/admin-orders', {
        method: 'PATCH',
        body: JSON.stringify({ id, status: select.value })
      });
      await loadReports();
      showToast('Order status updated');
    }
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('click', refreshAdminSession);
document.addEventListener('keydown', refreshAdminSession);

if (!isAdminSessionExpired()) {
  loadReports()
    .then(showReports)
    .catch(showLogin);
} else {
  showLogin();
}

const reconcilePaymentForm = document.getElementById('reconcilePaymentForm');
reconcilePaymentForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const orderId = document.getElementById('reconcileOrderId').value.trim();
  const paymentId = document.getElementById('reconcilePaymentId').value.trim();
  const button = reconcilePaymentForm.querySelector('button[type="submit"]');
  if (!orderId || !paymentId) return showToast('Order ID and Payment ID are required');
  if (!confirm('Verify this payment directly with Razorpay and reconcile the Nivara order?')) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Verifying with Razorpay...';
  try {
    const data = await apiRequest('/api/admin-reconcile-payment', {
      method: 'POST',
      body: JSON.stringify({ razorpayOrderId: orderId, razorpayPaymentId: paymentId })
    });
    await loadReports();
    showToast(data.message || 'Payment reconciled');
    reconcilePaymentForm.reset();
  } catch (error) {
    showToast(error.message || 'Unable to reconcile payment');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});
