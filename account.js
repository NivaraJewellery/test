const accountParams = new URLSearchParams(window.location.search);
const resetToken = accountParams.get('reset');
const returnToCheckout = accountParams.get('return') === 'checkout' || localStorage.getItem('nivara-return-to-checkout') === '1';
const resetConfirmForm = document.getElementById('resetConfirmForm');
const resetRequestForm = document.getElementById('resetRequestForm');
let pendingSignupCustomer = null;

function setCheckoutTransitionLoading(isLoading, message = 'Signing you in and loading your delivery details...') {
  const overlay = document.getElementById('checkoutTransitionOverlay');
  if (!overlay) return;
  const messageNode = overlay.querySelector('.checkout-transition-card span');
  if (messageNode) messageNode.textContent = message;
  overlay.classList.toggle('open', Boolean(isLoading));
  overlay.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
}

document.querySelectorAll('form').forEach(form => form.reset());

function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  window.clearTimeout(toast.hideTimer);
  toast.textContent = message;
  toast.classList.toggle('toast-success', type === 'success');
  toast.classList.add('show');
  toast.hideTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.textContent = '';
  }, 2600);
}

function saveCustomerAndGoHome(customer) {
  const previousCustomer = JSON.parse(localStorage.getItem('nivara-customer') || 'null');
  if (previousCustomer?.email && previousCustomer.email !== customer.email) {
    localStorage.removeItem('nivara-cart');
  }
  localStorage.setItem('nivara-customer', JSON.stringify(customer));
  localStorage.setItem('nivara-customer-session', String(Date.now()));
  showToast('Welcome to Nivara Jewellery', 'success');
  if (returnToCheckout) {
    setCheckoutTransitionLoading(true);
  }
  setTimeout(() => {
    if (returnToCheckout) {
      localStorage.setItem('nivara-return-to-checkout', '1');
      window.location.href = 'index.html?checkout=1';
    } else {
      window.location.href = 'index.html';
    }
  }, returnToCheckout ? 250 : 650);
}

async function accountRequest(payload) {
  const response = await fetch('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Account request failed');
  return data;
}

function showAuthPanel(name) {
  document.querySelectorAll('[data-auth-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.authTab === name);
  });
  document.querySelectorAll('.auth-panel').forEach(panel => panel.classList.remove('active'));
  resetRequestForm.hidden = true;
  resetConfirmForm.hidden = true;
  document.getElementById(`${name}Form`)?.classList.add('active');
}

document.addEventListener('click', event => {
  const showPasswordButton = event.target.closest('.show-password');
  if (showPasswordButton) {
    const input = showPasswordButton.parentElement.querySelector('input');
    const showPassword = input.type === 'password';
    input.type = showPassword ? 'text' : 'password';
    showPasswordButton.textContent = showPassword ? '🙈' : '👁';
    showPasswordButton.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
  }

  const tab = event.target.closest('[data-auth-tab]');
  if (tab) showAuthPanel(tab.dataset.authTab);

  if (event.target.closest('#showReset')) {
    document.querySelectorAll('.auth-panel').forEach(panel => panel.classList.remove('active'));
    resetRequestForm.hidden = false;
    resetRequestForm.classList.add('active');
  }
});

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const values = Object.fromEntries(new FormData(form).entries());
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = returnToCheckout ? 'Signing in...' : 'Login';
  }
  try {
    const data = await accountRequest({ action: 'login', ...values });
    saveCustomerAndGoHome(data.customer);
  } catch (error) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Login';
    }
    setCheckoutTransitionLoading(false);
    showToast(error.message);
  }
});

document.getElementById('signupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const data = await accountRequest({ action: 'signup', ...values });
    pendingSignupCustomer = data.pendingCustomer;
    document.querySelectorAll('.auth-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById('signupOtpForm').hidden = false;
    document.getElementById('signupOtpForm').classList.add('active');
    showToast('Verification code sent to your email.', 'success');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('signupOtpForm').addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    const data = await accountRequest({
      action: 'signup-verify',
      customerId: pendingSignupCustomer?.id,
      email: pendingSignupCustomer?.email,
      otp: values.otp
    });
    pendingSignupCustomer = null;
    saveCustomerAndGoHome(data.customer);
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('resendSignupOtp').addEventListener('click', async () => {
  try {
    await accountRequest({
      action: 'resend-email-otp',
      customerId: pendingSignupCustomer?.id,
      email: pendingSignupCustomer?.email
    });
    showToast('Verification code resent', 'success');
  } catch (error) {
    showToast(error.message);
  }
});

resetRequestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await accountRequest({ action: 'reset-request', ...values });
    showToast('If the email exists, a reset link has been sent', 'success');
    showAuthPanel('login');
  } catch (error) {
    showToast(error.message);
  }
});

resetConfirmForm.addEventListener('submit', async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await accountRequest({ action: 'reset-confirm', token: resetToken, ...values });
    showToast('Password updated. Please login.', 'success');
    window.history.replaceState({}, '', 'account.html');
    showAuthPanel('login');
  } catch (error) {
    showToast(error.message);
  }
});

if (resetToken) {
  document.querySelectorAll('.auth-panel').forEach(panel => panel.classList.remove('active'));
  document.querySelectorAll('[data-auth-tab]').forEach(button => button.classList.remove('active'));
  resetConfirmForm.hidden = false;
  resetConfirmForm.classList.add('active');
}

document.getElementById('toast').addEventListener('click', event => {
  event.currentTarget.classList.remove('show');
  event.currentTarget.textContent = '';
});
