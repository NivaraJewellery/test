let notifyRequests = [];
const ADMIN_SESSION_MS = 30 * 60 * 1000;

const loginPanel = document.getElementById('loginPanel');
const notifyPanel = document.getElementById('notifyPanel');
const notifyList = document.getElementById('notifyList');
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

function showNotifyPanel() {
  loginPanel.hidden = true;
  notifyPanel.hidden = false;
}

function showLogin() {
  loginPanel.hidden = false;
  notifyPanel.hidden = true;
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
  const data = await response.json();
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

function renderNotifyRequests() {
  notifyList.innerHTML = notifyRequests.length ? notifyRequests.map(request => `
    <article class="notify-card">
      ${request.image ? `<img src="${request.image}" alt="${request.product_name}" />` : ''}
      <div>
        <h3>${request.product_name}</h3>
        <p>${request.customer_name || 'Customer'} - ${request.email}</p>
        <small>
          Status: ${request.status}
          ${Number(request.stock || 0) > 0 ? ` - Back in stock (${request.stock} available)` : ' - Still sold out'}
          ${request.notified_at ? ` - Notified ${new Date(request.notified_at).toLocaleString('en-IN')}` : ''}
        </small>
      </div>
      ${request.status === 'waiting' ? `<button type="button" data-close-notify="${request.id}">Mark closed</button>` : ''}
    </article>
  `).join('') : '<p class="muted-text">No notify requests yet.</p>';
}

async function loadNotifyRequests() {
  const data = await apiRequest('/api/notify-requests');
  notifyRequests = data.requests || [];
  renderNotifyRequests();
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.getElementById('adminPassword').value;

  try {
    await adminLogin(password);
    document.getElementById('adminPassword').value = '';
    await loadNotifyRequests();
    showNotifyPanel();
    showToast('Logged in');
  } catch (error) {
    clearAdminSession();
    showToast(error.message);
  }
});

document.getElementById('refreshNotify').addEventListener('click', async () => {
  try {
    await loadNotifyRequests();
    showToast('Notify requests refreshed');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('logoutButton').addEventListener('click', () => {
  clearAdminSession('Logged out');
});

document.addEventListener('click', async event => {
  const closeButton = event.target.closest('[data-close-notify]');
  if (!closeButton) return;
  if (!confirm('Close this notify request?')) return;

  try {
    await apiRequest('/api/notify-requests', {
      method: 'PATCH',
      body: JSON.stringify({ id: Number(closeButton.dataset.closeNotify), status: 'closed' })
    });
    await loadNotifyRequests();
    showToast('Notify request closed');
  } catch (error) {
    showToast(error.message);
  }
});

if (!isAdminSessionExpired()) {
  loadNotifyRequests()
    .then(showNotifyPanel)
    .catch(() => clearAdminSession());
} else {
  showLogin();
}
