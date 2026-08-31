const params = new URLSearchParams(window.location.search);
const token = String(params.get('token') || '').trim();
const state = document.getElementById('reviewState');
const form = document.getElementById('productReviewForm');
const productsNode = document.getElementById('reviewProducts');
const intro = document.getElementById('reviewIntro');
const statusNode = document.getElementById('reviewStatus');
const thanks = document.getElementById('reviewThanks');
let orderData = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
}

function productSize(product) {
  const isBangle = String(product.type || product.category || '').toLowerCase().includes('bangle') || Boolean(product.size);
  return isBangle && product.size ? `Size: ${escapeHtml(product.size)}${product.uom ? ` ${escapeHtml(product.uom)}` : ''}` : '';
}

function starInputs(productId, index) {
  const group = `product-rating-${index}`;
  return `<div class="review-stars">${[5,4,3,2,1].map(value => `<input type="radio" id="${group}-${value}" name="${group}" value="${value}" required><label for="${group}-${value}" title="${value} out of 5">★</label>`).join('')}</div>`;
}

async function loadReview() {
  if (!token) {
    state.textContent = 'This review link is incomplete. Please use the link from your delivery email.';
    return;
  }
  try {
    const response = await fetch(`/api/product-review?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load this review.');
    orderData = data;
    intro.textContent = `${data.customerName ? `Hi ${data.customerName}. ` : ''}Please rate the product${data.products.length === 1 ? '' : 's'} from order ${data.orderId}.`;
    productsNode.innerHTML = data.products.map((product, index) => `
      <article class="review-product" data-review-product="${index}">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">` : '<div></div>'}
        <div>
          <h3>${escapeHtml(product.name)}</h3>
          ${productSize(product) ? `<small>${productSize(product)}</small>` : ''}
          <div class="review-field"><span>Your rating</span>${starInputs(product.id, index)}</div>
          <label class="review-field"><span>Comments <small>(optional)</small></span><textarea maxlength="1500" data-review-comment="${index}" placeholder="Tell us about the quality, look, fit, packaging, or anything else..."></textarea></label>
        </div>
      </article>
    `).join('');
    state.hidden = true;
    form.hidden = false;
  } catch (error) {
    state.textContent = error.message;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!orderData) return;
  const reviews = orderData.products.map((product, index) => ({
    productId: product.id,
    rating: Number(form.querySelector(`input[name="product-rating-${index}"]:checked`)?.value || 0),
    comments: form.querySelector(`[data-review-comment="${index}"]`)?.value || ''
  }));
  if (reviews.some(review => !review.rating)) {
    statusNode.textContent = 'Please choose a star rating for every product.';
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Submitting...';
  statusNode.textContent = '';
  try {
    const response = await fetch('/api/product-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, reviews })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to submit your review.');
    form.hidden = true;
    thanks.hidden = false;
  } catch (error) {
    statusNode.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Submit product review';
  }
});

loadReview();
