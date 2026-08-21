let products = [];
let collections = [];
let cart = JSON.parse(localStorage.getItem('nivara-cart') || '[]');
let activeFilter = 'all';
let customer = JSON.parse(localStorage.getItem('nivara-customer') || 'null');
let pendingGuestDetails = null;
let imageViewerZoom = 1;
let imageViewerPan = { x: 0, y: 0 };
let imageViewerDrag = null;
let imageViewerImages = [];
let imageViewerIndex = 0;
const PRODUCT_HOVER_DELAY_MS = 1000;
let productPage = 1;
const CUSTOMER_SESSION_MS = 30 * 60 * 1000;
const PRODUCTS_PER_PAGE = 8;
const WHATSAPP_ORDER_NUMBER = '917899890736';
const LAUNCH_PROMO_CODE = 'NIVARA5';
const LAUNCH_PROMO_PERCENT = 5;
const LAUNCH_PROMO_START = Date.parse('2026-08-19T18:30:00.000Z'); // TEST: active from 20 Aug 2026, 12:00 AM IST
const LAUNCH_PROMO_END = Date.parse('2026-08-23T18:30:00.000Z');
let appliedPromo = null;

const formatPrice = value => `Rs. ${Number(value).toLocaleString('en-IN')}`;
const productsNode = document.getElementById('products');
const collectionsNode = document.getElementById('collectionsList');
const productPaginationNode = document.getElementById('productPagination');

function saveCustomer(customerData) {
  const previousEmail = customer?.email;
  customer = customerData;
  if (previousEmail && previousEmail !== customerData.email) {
    clearCart();
  }
  localStorage.setItem('nivara-customer', JSON.stringify(customerData));
  localStorage.setItem('nivara-customer-session', String(Date.now()));
  renderCustomerMenu();
}

function clearCustomerSession(message) {
  localStorage.removeItem('nivara-customer');
  localStorage.removeItem('nivara-customer-session');
  customer = null;
  appliedPromo = null;
  renderCustomerMenu();
  if (message) showToast(message);
}

function isCustomerSessionExpired() {
  if (!customer) return false;
  const lastSeen = Number(localStorage.getItem('nivara-customer-session') || 0);
  return !lastSeen || Date.now() - lastSeen > CUSTOMER_SESSION_MS;
}

function refreshCustomerSession() {
  if (customer) localStorage.setItem('nivara-customer-session', String(Date.now()));
}

function ensureActiveCustomerSession() {
  if (!isCustomerSessionExpired()) {
    refreshCustomerSession();
    return true;
  }
  clearCart();
  clearCustomerSession('Session expired. Please login again.');
  return false;
}

function hasCompleteCheckoutProfile(customerData) {
  const address = customerData?.address || {};
  return Boolean(customerData?.phone && customerData?.phoneVerified && address.line1 && address.city && address.state && address.pincode);
}

function clearCart() {
  cart = [];
  localStorage.removeItem('nivara-cart');
  renderCart();
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

async function loadProducts() {
  try {
    const [productResponse, collectionResponse] = await Promise.all([
      fetch('/api/products'),
      fetch('/api/collections')
    ]);
    const productData = await productResponse.json();
    const collectionData = await collectionResponse.json();
    if (!productResponse.ok) throw new Error(productData.error || 'Unable to load products');
    products = productData.products;
    collections = collectionResponse.ok ? collectionData.collections : [];
  } catch (error) {
    const fallback = await fetch('products.json');
    products = await fallback.json();
    collections = buildFallbackCollections(products);
  }

  cart = cart
    .map(item => {
      const product = products.find(entry => entry.id === item.id);
      return product ? { ...product, quantity: Math.min(item.quantity, product.stock) } : null;
    })
    .filter(item => item && item.quantity > 0);

  renderFilters();
  renderCollections();
  renderCart();
}

function buildFallbackCollections(sourceProducts) {
  const counts = {};
  sourceProducts.forEach(product => {
    const key = product.type || 'necklace';
    counts[key] = counts[key] || { name: product.category || friendlyLabel(key), slug: key, image: product.image, product_count: 0 };
    counts[key].product_count++;
  });
  return Object.values(counts);
}

function friendlyLabel(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function getLaunchPromoState(now = Date.now()) {
  if (now < LAUNCH_PROMO_START) return 'upcoming';
  if (now >= LAUNCH_PROMO_END) return 'ended';
  return 'active';
}

function syncAnnouncementOffset() {
  const bar = document.getElementById('announcementBar');
  const height = bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--announcement-bar-height', `${height}px`);
}

function updateAnnouncementBar() {
  const bar = document.getElementById('announcementBar');
  if (!bar) return;
  const state = getLaunchPromoState();
  bar.textContent = state === 'active'
    ? `Launch offer: ${LAUNCH_PROMO_PERCENT}% OFF • Use code ${LAUNCH_PROMO_CODE} • Ends 23 Aug, 11:59 PM IST`
    : 'Complimentary shipping on orders above ₹1,999';
  requestAnimationFrame(syncAnnouncementOffset);
}

function calculatePromoDiscount(subtotal) {
  if (!appliedPromo) return 0;
  return Math.round((Number(subtotal) * Number(appliedPromo.percent || LAUNCH_PROMO_PERCENT)) / 100);
}

function updateFilterScrollButtons() {
  const node = document.getElementById('productFilters');
  const previousButton = document.getElementById('filterPrev');
  const nextButton = document.getElementById('filterNext');
  if (!node) return;
  const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
  if (previousButton) previousButton.disabled = node.scrollLeft <= 2;
  if (nextButton) nextButton.disabled = node.scrollLeft >= maxScrollLeft - 2;
}

function scrollProductFilters(direction) {
  const node = document.getElementById('productFilters');
  if (!node) return;
  const distance = Math.max(220, Math.round(node.clientWidth * 0.8));
  node.scrollBy({ left: direction * distance, behavior: 'smooth' });
}


function resetAppliedPromo(message = '') {
  appliedPromo = null;
  const input = document.getElementById('promoCode') || document.getElementById('checkoutPromoCode');
  const button = document.getElementById('promoApplyButton') || document.getElementById('checkoutPromoApply');
  const checkoutModal = document.getElementById('checkoutReviewModal');
  const checkoutIsOpen = Boolean(checkoutModal && !checkoutModal.hidden && checkoutModal.classList.contains('open'));
  const status = checkoutIsOpen
    ? document.getElementById('checkoutPromoStatus')
    : (document.getElementById('promoStatus') || document.getElementById('checkoutPromoStatus'));
  if (input) input.value = '';
  if (button) {
    button.textContent = 'Apply';
    button.disabled = cart.length === 0;
  }
  if (status) {
    status.textContent = message;
    status.classList.remove('success');
    status.classList.toggle('error', Boolean(message));
  }
}

async function applyPromoCode() {
  const input = document.getElementById('promoCode') || document.getElementById('checkoutPromoCode');
  const button = document.getElementById('promoApplyButton') || document.getElementById('checkoutPromoApply');
  const checkoutModal = document.getElementById('checkoutReviewModal');
  const checkoutIsOpen = Boolean(checkoutModal && !checkoutModal.hidden && checkoutModal.classList.contains('open'));
  const status = checkoutIsOpen
    ? document.getElementById('checkoutPromoStatus')
    : (document.getElementById('promoStatus') || document.getElementById('checkoutPromoStatus'));
  const code = String(input?.value || '').trim().toUpperCase();

  if (appliedPromo) {
    resetAppliedPromo('Promo removed.');
    renderCart();
    return;
  }

  const showPromoMessage = (message, type = 'error') => {
    if (status) {
      status.textContent = message;
      status.classList.toggle('success', type === 'success');
      status.classList.toggle('error', type === 'error');
      status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      showToast(message, type === 'success' ? 'success' : undefined);
    }
  };

  if (!cart.length) return showPromoMessage('Add an item to your bag before applying a promo code.');
  if (!code) return showPromoMessage('Enter a promo code.');
  if (!customer || !ensureActiveCustomerSession()) {
    showPromoMessage('Please sign in to your Nivara account before applying this promo code.');
    return;
  }
  if (!customer.phoneVerified || !customer.phone) {
    showPromoMessage('Please verify your registered mobile number before applying this promo code.');
    return;
  }

  if (button) button.disabled = true;
  try {
    const response = await fetch('/api/promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate', code, customer })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Promo code could not be applied.');
    appliedPromo = { code: data.code, percent: Number(data.percent || LAUNCH_PROMO_PERCENT) };
    if (input) input.value = data.code;
    if (button) button.textContent = 'Remove';
    if (status) {
      status.textContent = `${data.percent}% launch discount applied.`;
      status.classList.add('success');
      status.classList.remove('error');
    }
    renderCart();
    showToast(`${data.percent}% promo applied`, 'success');
  } catch (error) {
    appliedPromo = null;
    if (status) {
      status.textContent = error.message;
      status.classList.remove('success');
      status.classList.add('error');
    }
    showToast(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

function renderFilters() {
  const filtersNode = document.querySelector('.filters');
  if (!filtersNode) return;
  const collectionFilters = collections.length ? collections.map(collection => [collection.slug, collection.name]) : [];
  const productFilters = [...new Map(products
    .filter(product => product.type)
    .map(product => [product.collection_slug || product.type, product.collection_name || product.category || friendlyLabel(product.type)]))];
  const filters = collectionFilters.length ? collectionFilters : productFilters;
  filtersNode.innerHTML = [
    '<button class="filter active" data-filter="all">All</button>',
    ...filters.map(([type, label]) => `<button class="filter" data-filter="${type}">${friendlyLabel(label)}</button>`)
  ].join('');
  filtersNode.scrollLeft = 0;
  requestAnimationFrame(updateFilterScrollButtons);
}

function updateCollectionScrollButtons() {
  if (!collectionsNode) return;
  const previousButton = document.getElementById('collectionPrev');
  const nextButton = document.getElementById('collectionNext');
  const maxScrollLeft = Math.max(0, collectionsNode.scrollWidth - collectionsNode.clientWidth);
  if (previousButton) previousButton.disabled = collectionsNode.scrollLeft <= 2;
  if (nextButton) nextButton.disabled = collectionsNode.scrollLeft >= maxScrollLeft - 2;
}

function scrollCollections(direction) {
  if (!collectionsNode) return;
  const distance = Math.max(240, Math.round(collectionsNode.clientWidth * 0.82));
  collectionsNode.scrollBy({ left: direction * distance, behavior: 'smooth' });
}

function renderCollections() {
  if (!collectionsNode) return;
  collectionsNode.innerHTML = collections.map(collection => `
    <a href="#shop" class="category" data-collection-filter="${collection.slug}" aria-label="Explore ${collection.name}">
      <span class="category-image-wrap">
        <img src="${collection.image || 'assets/logo.png'}" alt="${collection.name}" loading="lazy" />
      </span>
      <span class="category-card-copy">
        <b>${collection.name}</b>
        <small>Explore Now <span aria-hidden="true">&rarr;</span></small>
      </span>
    </a>
  `).join('');
  collectionsNode.scrollLeft = 0;
  requestAnimationFrame(updateCollectionScrollButtons);
}
function getStockLabel(product) {
  if (!product.stock) return 'Out of stock';
  if (product.stock === 1) return 'Only 1 left';
  return 'In stock';
}

function getVisibleProducts() {
  return activeFilter === 'all' ? products : products.filter(product => product.type === activeFilter || product.collection_slug === activeFilter);
}

function renderProductPagination(totalProducts) {
  if (!productPaginationNode) return;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
  productPage = Math.min(productPage, totalPages);
  productPaginationNode.innerHTML = totalPages > 1 ? `
    <button type="button" data-product-page="prev" ${productPage === 1 ? 'disabled' : ''}>Previous</button>
    <span>Page ${productPage} of ${totalPages}</span>
    <button type="button" data-product-page="next" ${productPage === totalPages ? 'disabled' : ''}>Next</button>
  ` : '';
}

function renderProducts() {
  const visible = getVisibleProducts();
  const totalPages = Math.max(1, Math.ceil(visible.length / PRODUCTS_PER_PAGE));
  productPage = Math.min(productPage, totalPages);
  const pageProducts = visible.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE);

  productsNode.innerHTML = pageProducts.map(product => {
    const isOutOfStock = product.stock === 0;
    const cartItem = cart.find(item => item.id === product.id);
    const hoverImage = product.image_2 || product.image;
    return `
      <article class="product">
        <div class="product-image">
          <button class="product-photo-button" type="button" data-view-image="${product.id}" aria-label="View ${product.name} image">
            <img class="product-photo" src="${product.image}" data-main-image="${product.image}" data-hover-image="${hoverImage}" alt="${product.name}" loading="lazy" />
          </button>
          <span class="product-tag ${isOutOfStock ? 'product-tag-sold' : ''}">${getStockLabel(product)}</span>
        </div>
        <div class="product-info">
          <div>
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <small>Code ${product.code} - ${isOutOfStock ? 'Out of stock' : `${product.stock} available`}</small>
          </div>
          <strong class="price">${formatPrice(product.price)}</strong>
        </div>
        ${cartItem ? `
          <div class="quantity-stepper product-stepper">
            <button data-decrease="${product.id}" aria-label="Remove one ${product.name}">-</button>
            <span>${cartItem.quantity}</span>
            <button data-increase="${product.id}" aria-label="Add one more ${product.name}" ${cartItem.quantity >= product.stock ? 'disabled' : ''}>+</button>
          </div>
        ` : isOutOfStock
          ? `<button class="add-button notify-button" data-notify="${product.id}" aria-label="Notify me when ${product.name} is back in stock">Notify me</button>`
          : `<button class="add-button" data-add="${product.id}" aria-label="Add ${product.name} to bag">Add to bag</button>`}
      </article>
    `;
  }).join('');
  renderProductPagination(visible.length);
}

function renderCart() {
  if (!cart.length && appliedPromo) {
    resetAppliedPromo('Promo removed because your bag is empty.');
  }
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const discount = calculatePromoDiscount(subtotal);
  const total = Math.max(0, subtotal - discount);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTitleCount').textContent = `(${count})`;
  document.getElementById('cartSubtotal').textContent = formatPrice(subtotal);
  document.getElementById('cartEmpty').style.display = cart.length ? 'none' : 'block';
  const promoInput = document.getElementById('promoCode');
  const promoButton = document.getElementById('promoApplyButton');
  if (promoInput) promoInput.disabled = cart.length === 0;
  if (promoButton) promoButton.disabled = cart.length === 0;
  document.getElementById('cartItems').innerHTML = cart.map(item => `
    <div class="cart-item">
      <img class="cart-photo" src="${item.image}" alt="${item.name}" />
      <div>
        <h3>${item.name}</h3>
        <p>${formatPrice(item.price)}</p>
        ${item.care ? `<details class="care-details"><summary>Care instructions</summary><p>${item.care}</p></details>` : ''}
        <div class="bag-stepper">
          <button data-decrease="${item.id}" aria-label="Remove one ${item.name}">-</button>
          <span>${item.quantity}</span>
          <button data-increase="${item.id}" aria-label="Add one more ${item.name}">+</button>
        </div>
        <button data-remove="${item.id}">Remove all</button>
      </div>
      <strong>${formatPrice(item.price * item.quantity)}</strong>
    </div>
  `).join('');

  const discountRow = document.getElementById('promoDiscountRow');
  const grandTotalRow = document.getElementById('cartGrandTotalRow');
  const discountNode = document.getElementById('promoDiscount');
  const discountLabel = document.getElementById('promoDiscountLabel');
  const grandTotalNode = document.getElementById('cartGrandTotal');
  if (discountRow) discountRow.hidden = !appliedPromo;
  if (grandTotalRow) grandTotalRow.hidden = !appliedPromo;
  if (discountNode) discountNode.textContent = `- ${formatPrice(discount)}`;
  if (discountLabel) {
    const percent = Number(appliedPromo?.percent || LAUNCH_PROMO_PERCENT);
    discountLabel.textContent = appliedPromo ? `Promo discount (${percent}%)` : 'Promo discount';
  }
  if (grandTotalNode) grandTotalNode.textContent = formatPrice(total);

  localStorage.setItem('nivara-cart', JSON.stringify(cart));
  renderProducts();
}

function buildWhatsAppOrderMessage() {
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const lines = [
    'Hello Nivara Jewellery,',
    '',
    'I would like to place this order:',
    '',
    ...cart.map((item, index) => `${index + 1}. ${item.name} - Qty: ${item.quantity} - ${formatPrice(item.price * item.quantity)}`),
    '',
    `Total: ${formatPrice(subtotal)}`,
    '',
    'Customer details:',
    'Name:',
    'Phone:',
    'Shipping address:'
  ];
  return lines.join('\n');
}

function continueOrderOnWhatsApp() {
  if (!cart.length) return showToast('Your bag is empty');
  const message = encodeURIComponent(buildWhatsAppOrderMessage());
  window.open(`https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${message}`, '_blank', 'noopener');
}

async function requestStockNotification(productId) {
  const product = products.find(item => item.id === productId);
  if (!product) return;

  const email = prompt(`Enter your email. We will notify you when ${product.name} is back in stock.`, customer?.email || '');
  if (!email) return;

  try {
    const response = await fetch('/api/notify-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        customer_name: customer?.name || '',
        email
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to save notify request');
    showToast('Done. We will notify you when it is back in stock.', 'success');
  } catch (error) {
    showToast(error.message);
  }
}

function updateImageViewerZoom() {
  const photo = document.getElementById('imageViewerPhoto');
  photo.style.transform = `translate(${imageViewerPan.x}px, ${imageViewerPan.y}px) scale(${imageViewerZoom})`;
  document.getElementById('imageZoomLevel').textContent = `${Math.round(imageViewerZoom * 100)}%`;
  const zoomSlider = document.getElementById('imageZoomSlider');
  if (zoomSlider) zoomSlider.value = String(imageViewerZoom);
}

function setImageViewerZoom(nextZoom) {
  imageViewerZoom = Math.min(3, Math.max(1, nextZoom));
  if (imageViewerZoom === 1) imageViewerPan = { x: 0, y: 0 };
  updateImageViewerZoom();
}

function getProductImages(product) {
  return [product.image, product.image_2, product.image_3]
    .map(image => String(image || '').trim())
    .filter(Boolean);
}

function setImageViewerImage(index) {
  if (!imageViewerImages.length) return;
  imageViewerIndex = (index + imageViewerImages.length) % imageViewerImages.length;
  const photo = document.getElementById('imageViewerPhoto');
  photo.src = imageViewerImages[imageViewerIndex];
  imageViewerZoom = 1;
  imageViewerPan = { x: 0, y: 0 };
  updateImageViewerZoom();

  const counter = document.getElementById('imageViewerCount');
  if (counter) counter.textContent = `${imageViewerIndex + 1}/${imageViewerImages.length}`;

  const previous = document.getElementById('imageViewerPrev');
  const next = document.getElementById('imageViewerNext');
  if (previous) previous.disabled = imageViewerImages.length < 2;
  if (next) next.disabled = imageViewerImages.length < 2;
}

function openImageViewer(productId) {
  const product = products.find(item => item.id === productId);
  if (!product) return;
  imageViewerImages = getProductImages(product);
  imageViewerIndex = 0;
  imageViewerZoom = 1;
  imageViewerPan = { x: 0, y: 0 };
  imageViewerDrag = null;
  const modal = document.getElementById('imageViewer');
  const photo = document.getElementById('imageViewerPhoto');
  photo.alt = product.name;
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setImageViewerImage(0);
}

function closeImageViewer() {
  const modal = document.getElementById('imageViewer');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
  document.getElementById('imageViewerPhoto').src = '';
  imageViewerImages = [];
  imageViewerIndex = 0;
  imageViewerDrag = null;
}

async function getFreshProduct(id) {
  const currentProduct = products.find(item => Number(item.id) === Number(id)) || null;

  try {
    const response = await fetch('/api/products', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to confirm current stock');
    const data = await response.json();

    const freshProduct = (data.products || []).find(item => Number(item.id) === Number(id));
    if (!freshProduct) return currentProduct;

    const index = products.findIndex(item => Number(item.id) === Number(id));
    if (index >= 0) products[index] = { ...products[index], ...freshProduct };
    return index >= 0 ? products[index] : freshProduct;
  } catch (error) {
    // During local/static testing the API may not be available. In that case,
    // keep the page usable with the stock value already loaded from products.json.
    // On Vercel/production, the API result above remains the source of truth.
    return currentProduct;
  }
}

function showSoldOutWarning(productName = 'This item') {
  showToast(`${productName} has just sold out. Please refresh the page to see the latest availability.`);
}

async function addToCart(id) {
  const product = await getFreshProduct(id);

  if (!product || Number(product.stock) <= 0) {
    renderProducts();
    return showSoldOutWarning(product?.name || 'This item');
  }

  const existing = cart.find(item => item.id === id);
  if (existing) {
    if (existing.quantity >= product.stock) return showToast(`Only ${product.stock} available for ${product.name}`);
    existing.quantity++;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
  showToast(`${product.name} added to your bag`, 'success');
}

async function changeQuantity(id, delta) {
  let product = products.find(item => item.id === id);
  const existing = cart.find(item => item.id === id);
  if (!product || !existing) return;

  if (delta > 0) {
    product = await getFreshProduct(id);

    if (!product || Number(product.stock) <= 0) {
      renderProducts();
      return showSoldOutWarning(product?.name || existing.name || 'This item');
    }
  }

  const nextQuantity = existing.quantity + delta;
  if (nextQuantity <= 0) {
    cart = cart.filter(item => item.id !== id);
  } else if (nextQuantity <= product.stock) {
    existing.quantity = nextQuantity;
  } else {
    showToast(`Only ${product.stock} available for ${product.name}`);
  }

  renderCart();
}

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

function renderCustomerMenu() {
  const userIcon = document.getElementById('userMenuToggle');
  const accountLink = document.getElementById('accountLink');
  if (!userIcon) return;
  userIcon.classList.toggle('logged-in', Boolean(customer));
  userIcon.textContent = customer ? String(customer.name || customer.email || 'N').trim().charAt(0).toUpperCase() : 'N';
  userIcon.title = customer ? `Logged in as ${customer.name || customer.email}` : 'Login or signup';
  if (accountLink) {
    accountLink.textContent = 'Account';
    accountLink.href = 'account.html';
    accountLink.hidden = Boolean(customer);
  }
}

function fillProfileForm(customerData) {
  const form = document.getElementById('profileForm');
  const address = customerData.address || {};
  form.elements.name.value = customerData.name || '';
  form.elements.email.value = customerData.email || '';
  form.elements.phone.value = customerData.phone || '';
  form.elements.line1.value = address.line1 || '';
  form.elements.line2.value = address.line2 || '';
  form.elements.city.value = address.city || '';
  form.elements.state.value = address.state || '';
  form.elements.pincode.value = address.pincode || '';
}

async function openProfile() {
  if (!customer) {
    window.location.href = 'account.html';
    return;
  }

  try {
    const data = await accountRequest({ action: 'profile-get', customer });
    saveCustomer(data.customer);
    fillProfileForm(data.customer);
    document.getElementById('otpForm').hidden = true;
    const modal = document.getElementById('profileModal');
    modal.hidden = false;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  } catch (error) {
    showToast(error.message);
  }
}

function closeProfile() {
  const modal = document.getElementById('profileModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
}

async function openOrders() {
  if (!customer) {
    window.location.href = 'account.html';
    return;
  }

  const list = document.getElementById('ordersList');
  list.innerHTML = '<p>Loading your orders...</p>';
  const modal = document.getElementById('ordersModal');
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  try {
    const data = await accountRequest({ action: 'orders', customer });
    list.innerHTML = data.orders.length ? data.orders.map(order => `
      <div class="order-card">
        <strong>${formatPrice(order.amount)}</strong>
        <small>${new Date(order.created_at).toLocaleString('en-IN')} - ${order.razorpay_payment_id || 'Payment pending'}</small>
      </div>
    `).join('') : '<p>No orders yet. Your first sparkle is waiting.</p>';
  } catch (error) {
    list.innerHTML = `<p>${error.message}</p>`;
  }
}

function closeOrders() {
  const modal = document.getElementById('ordersModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
}

function normalizeOrderDetails(order) {
  const details = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  if (Array.isArray(details)) return { customer: {}, products: details };
  return {
    customer: details?.customer || {},
    products: Array.isArray(details?.products) ? details.products : []
  };
}

function renderOrderCard(order) {
  const details = normalizeOrderDetails(order);
  const products = details.products;
  const address = details.customer.shippingAddress || details.customer.billingAddress || 'Not available';
  const orderDate = new Date(order.created_at);
  const deliveryDate = new Date(orderDate);
  deliveryDate.setDate(deliveryDate.getDate() + 7);

  return `
    <details class="order-card" open>
      <summary>
        <strong>${formatPrice(order.amount)}</strong>
        <small>${order.razorpay_order_id || 'Order'} - ${order.razorpay_payment_id || 'Payment pending'}</small>
      </summary>
      <dl class="order-detail-grid">
        <div><dt>Order number</dt><dd>${order.razorpay_order_id || '-'}</dd></div>
        <div><dt>Order date</dt><dd>${orderDate.toLocaleDateString('en-IN')}</dd></div>
        <div><dt>Payment method</dt><dd>Razorpay</dd></div>
        <div><dt>Estimated delivery</dt><dd>${deliveryDate.toLocaleDateString('en-IN')}</dd></div>
      </dl>
      <div class="order-detail-block">
        <h3>Items ordered</h3>
        ${products.length ? `<ul>${products.map(item => `<li>${item.name || `Product ${item.id}`} x ${item.quantity} - ${formatPrice(item.price || 0)}</li>`).join('')}</ul>` : '<p>No item details found.</p>'}
      </div>
      <div class="order-detail-block">
        <h3>Delivery address</h3>
        <p>${address}</p>
      </div>
    </details>
  `;
}

let currentOrderSummary = null;

function orderSummaryMarkup(order) {
  const products = order.products || normalizeOrderDetails(order).products || [];
  const details = order.customer ? { customer: order.customer } : normalizeOrderDetails(order);
  const customerDetails = order.customer || details.customer || {};
  const promo = order.promo || (typeof order.items === 'string' ? JSON.parse(order.items)?.promo : order.items?.promo) || null;
  const subtotal = Number(order.subtotal != null ? order.subtotal : (promo?.subtotal != null ? promo.subtotal : products.reduce((sum,item)=>sum+Number(item.price||0)*Number(item.quantity||1),0)));
  const amount = Number(order.amount || promo?.total || subtotal);
  const discount = Number(promo?.discount || Math.max(0, subtotal-amount));
  const dateValue = order.createdAt || order.created_at || new Date().toISOString();
  const address = customerDetails.shippingAddress || customerDetails.billingAddress || [customerDetails.address?.line1,customerDetails.address?.line2,customerDetails.address?.city,customerDetails.address?.state,customerDetails.address?.pincode].filter(Boolean).join(', ') || 'Not available';
  return `<div class="order-summary-success">✓ Payment successful — your order is confirmed.</div>
    <div class="order-summary-meta"><div><small>Order number</small><br><strong>${order.orderId || order.razorpay_order_id || '-'}</strong></div><div><small>Order date</small><br><strong>${new Date(dateValue).toLocaleString('en-IN')}</strong></div><div><small>Payment reference</small><br><strong>${order.paymentId || order.razorpay_payment_id || '-'}</strong></div><div><small>Status</small><br><strong>Confirmed</strong></div></div>
    <h3>Items ordered</h3><div class="order-summary-items">${products.map(item=>`<div class="order-summary-item">${item.image?`<img src="${item.image}" alt="">`:'<span></span>'}<div><strong>${item.name || `Product ${item.id}`}</strong><small>Qty ${item.quantity || 1} × ${formatPrice(item.price || 0)}</small></div><strong>${formatPrice(Number(item.price||0)*Number(item.quantity||1))}</strong></div>`).join('')}</div>
    <div class="order-summary-customer"><strong>Delivery details</strong><p>${customerDetails.name || ''}${customerDetails.phone ? ` · ${customerDetails.phone}`:''}<br>${address}</p></div>
    <div class="order-summary-totals"><div class="order-summary-total-row"><span>Subtotal</span><strong>${formatPrice(subtotal)}</strong></div>${discount>0?`<div class="order-summary-total-row"><span>Promo discount${promo?.percent?` (${promo.percent}%)`:''}</span><strong>- ${formatPrice(discount)}</strong></div>`:''}<div class="order-summary-total-row grand"><span>Total paid</span><strong>${formatPrice(amount)}</strong></div></div>`;
}

function showOrderSummary(order, confirmed = false) {
  currentOrderSummary = order;
  document.getElementById('orderSummaryEyebrow').textContent = confirmed ? 'Order confirmed' : 'Order details';
  document.getElementById('orderSummaryTitle').textContent = confirmed ? 'Thank you for your order' : (order.orderId || order.razorpay_order_id || 'Order summary');
  document.getElementById('orderSummaryContent').innerHTML = orderSummaryMarkup(order);
  document.getElementById('backToOrders').hidden = confirmed;
  const modal=document.getElementById('orderSummaryModal'); modal.hidden=false; modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
}
function closeOrderSummary(){const modal=document.getElementById('orderSummaryModal');modal.classList.remove('open');modal.setAttribute('aria-hidden','true');modal.hidden=true;}
function downloadOrderSummaryText(order){
  const products=order.products || normalizeOrderDetails(order).products || []; const promo=order.promo || null;
  const lines=['NIVARA JEWELLERY','ORDER SUMMARY','',`Order: ${order.orderId||order.razorpay_order_id||'-'}`,`Payment: ${order.paymentId||order.razorpay_payment_id||'-'}`,`Date: ${new Date(order.createdAt||order.created_at||Date.now()).toLocaleString('en-IN')}`,'','Items:',...products.map(i=>`${i.name} | Qty ${i.quantity||1} | Rs. ${Number(i.price||0)*Number(i.quantity||1)}`),'',promo?.discount?`Promo discount (${promo.percent||0}%): - Rs. ${promo.discount}`:'',`Total paid: Rs. ${order.amount||promo?.total||0}`].filter(v=>v!==undefined);
  const esc=t=>String(t).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,' ');
  let y=790, content='BT /F1 11 Tf 50 810 Td ';
  lines.forEach((line,i)=>{if(i) content+=' 0 -18 Td '; content+=`(${esc(line)}) Tj`;}); content+=' ET';
  const objs=[]; const add=x=>{objs.push(x);return objs.length};
  const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const stream=add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const page=add(`<< /Type /Page /Parent 4 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`);
  add(`<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`); add('<< /Type /Catalog /Pages 4 0 R >>');
  let pdf='%PDF-1.4\n', offsets=[0]; objs.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;}); const xref=pdf.length;pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';pdf+=`trailer\n<< /Size ${objs.length+1} /Root 5 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob=new Blob([pdf],{type:'application/pdf'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Nivara-Order-${order.orderId||order.razorpay_order_id||'summary'}.pdf`;a.click();URL.revokeObjectURL(a.href);
}

async function openOrders() {
  if (!customer) { window.location.href='account.html'; return; }
  const list=document.getElementById('ordersList'); list.innerHTML='<p>Loading your orders...</p>';
  const modal=document.getElementById('ordersModal');modal.hidden=false;modal.classList.add('open');modal.setAttribute('aria-hidden','false');
  try { const data=await accountRequest({action:'orders',customer}); window.nivaraOrders=data.orders||[];
    list.innerHTML=window.nivaraOrders.length?window.nivaraOrders.map((order,index)=>`<div class="order-history-row"><button class="order-history-link" type="button" data-order-index="${index}">${order.razorpay_order_id||'Order'}</button><small>${new Date(order.created_at).toLocaleDateString('en-IN')} · ${order.razorpay_payment_id?'Paid':'Payment pending'}</small><strong>${formatPrice(order.amount)}</strong></div>`).join(''):'<p>No orders yet. Your first sparkle is waiting.</p>';
  } catch(error){list.innerHTML=`<p>${error.message}</p>`;}
}

function openGuestCheckout() {
  const modal = document.getElementById('guestCheckoutModal');
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeGuestCheckout() {
  const modal = document.getElementById('guestCheckoutModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
}

function openCart() {
  document.getElementById('cartPanel').classList.add('open');
  document.getElementById('overlay').classList.add('open');
  document.getElementById('cartPanel').setAttribute('aria-hidden', 'false');
}

function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('cartPanel').setAttribute('aria-hidden', 'true');
}

document.addEventListener('click', async event => {
  const add = event.target.closest('[data-add]');
  const increase = event.target.closest('[data-increase]');
  const decrease = event.target.closest('[data-decrease]');
  const remove = event.target.closest('[data-remove]');
  const viewImage = event.target.closest('[data-view-image]');
  const notify = event.target.closest('[data-notify]');
  if (add) await addToCart(Number(add.dataset.add));
  if (increase) await changeQuantity(Number(increase.dataset.increase), 1);
  if (decrease) await changeQuantity(Number(decrease.dataset.decrease), -1);
  if (viewImage) openImageViewer(Number(viewImage.dataset.viewImage));
  if (notify) requestStockNotification(Number(notify.dataset.notify));
  if (remove) {
    cart = cart.filter(item => item.id !== Number(remove.dataset.remove));
    renderCart();
  }
});

document.addEventListener('mouseover', event => {
  const photo = event.target.closest('.product-photo');
  if (!photo || !photo.dataset.hoverImage || photo.dataset.hoverImage === photo.dataset.mainImage) return;
  clearTimeout(Number(photo.dataset.hoverTimer || 0));
  const timer = setTimeout(() => {
    photo.src = photo.dataset.hoverImage;
    photo.dataset.hoverTimer = '';
  }, PRODUCT_HOVER_DELAY_MS);
  photo.dataset.hoverTimer = String(timer);
});

document.addEventListener('mouseout', event => {
  const photo = event.target.closest('.product-photo');
  if (!photo || !photo.dataset.mainImage) return;
  clearTimeout(Number(photo.dataset.hoverTimer || 0));
  photo.dataset.hoverTimer = '';
  photo.src = photo.dataset.mainImage;
});

document.addEventListener('click', event => {
  const toggle = event.target.closest('#userMenuToggle');
  const dropdown = document.getElementById('userDropdown');

  if (toggle) {
    if (!ensureActiveCustomerSession()) return;
    if (!customer) {
      window.location.href = 'account.html';
      return;
    }
    dropdown.hidden = !dropdown.hidden;
    return;
  }

  if (!event.target.closest('#userMenu')) dropdown.hidden = true;
  if (event.target.closest('[data-profile-open]')) {
    dropdown.hidden = true;
    openProfile();
  }
  if (event.target.closest('[data-orders-open]')) {
    dropdown.hidden = true;
    openOrders();
  }
  if (event.target.closest('[data-logout]')) {
    clearCustomerSession();
    dropdown.hidden = true;
    clearCart();
    showToast('Logged out and bag cleared');
  }
});

const accountLinkNode = document.getElementById('accountLink');
if (accountLinkNode) {
  accountLinkNode.addEventListener('click', event => {
    if (!ensureActiveCustomerSession()) return;
    if (!customer) return;
    event.preventDefault();
    openProfile();
  });
}

document.addEventListener('click', event => {
  const collection = event.target.closest('[data-collection-filter]');
  if (!collection) return;
  activeFilter = collection.dataset.collectionFilter;
  productPage = 1;
  document.querySelectorAll('.filter').forEach(filter => filter.classList.toggle('active', false));
  renderProducts();
});

document.addEventListener('click', event => {
  const filter = event.target.closest('.filter');
  if (!filter) return;
  activeFilter = filter.dataset.filter;
  productPage = 1;
  document.querySelectorAll('.filter').forEach(button => button.classList.toggle('active', button === filter));
  renderProducts();
});

document.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-product-page]');
  if (!pageButton) return;
  productPage += pageButton.dataset.productPage === 'next' ? 1 : -1;
  renderProducts();
  document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('cartToggle').addEventListener('click', openCart);
document.getElementById('cartClose').addEventListener('click', closeCart);
document.getElementById('overlay').addEventListener('click', closeCart);
document.getElementById('continueShopping').addEventListener('click', closeCart);
document.getElementById('guestCheckoutClose').addEventListener('click', closeGuestCheckout);
document.getElementById('imageViewerClose').addEventListener('click', closeImageViewer);
document.getElementById('imageViewer').addEventListener('click', event => {
  if (event.target.id === 'imageViewer') closeImageViewer();
});
document.getElementById('imageZoomSlider').addEventListener('input', event => {
  setImageViewerZoom(Number(event.target.value));
});
document.getElementById('imageZoomReset').addEventListener('click', () => {
  imageViewerZoom = 1;
  imageViewerPan = { x: 0, y: 0 };
  updateImageViewerZoom();
});
document.getElementById('imageViewerPrev')?.addEventListener('click', () => {
  setImageViewerImage(imageViewerIndex - 1);
});
document.getElementById('imageViewerNext')?.addEventListener('click', () => {
  setImageViewerImage(imageViewerIndex + 1);
});
document.getElementById('imageViewerPhoto').addEventListener('wheel', event => {
  event.preventDefault();
  setImageViewerZoom(imageViewerZoom + (event.deltaY < 0 ? 0.12 : -0.12));
}, { passive: false });
document.getElementById('imageViewerPhoto').addEventListener('pointerdown', event => {
  if (imageViewerZoom <= 1) return;
  imageViewerDrag = {
    startX: event.clientX,
    startY: event.clientY,
    panX: imageViewerPan.x,
    panY: imageViewerPan.y
  };
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add('is-dragging');
});
document.getElementById('imageViewerPhoto').addEventListener('pointermove', event => {
  if (!imageViewerDrag) return;
  imageViewerPan = {
    x: imageViewerDrag.panX + event.clientX - imageViewerDrag.startX,
    y: imageViewerDrag.panY + event.clientY - imageViewerDrag.startY
  };
  updateImageViewerZoom();
});
document.getElementById('imageViewerPhoto').addEventListener('pointerup', event => {
  imageViewerDrag = null;
  event.currentTarget.classList.remove('is-dragging');
});
document.getElementById('imageViewerPhoto').addEventListener('pointercancel', event => {
  imageViewerDrag = null;
  event.currentTarget.classList.remove('is-dragging');
});
document.getElementById('toast').addEventListener('click', event => {
  event.currentTarget.classList.remove('show');
  event.currentTarget.textContent = '';
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  closeCart();
  closeCheckoutReview();
  closeGuestCheckout();
  closeProfile();
  closeOrders();
  closeImageViewer();
  document.getElementById('userDropdown').hidden = true;
});

document.querySelector('.menu-button').addEventListener('click', event => {
  const navigation = document.getElementById('navigation');
  navigation.classList.toggle('open');
  event.currentTarget.setAttribute('aria-expanded', navigation.classList.contains('open'));
});


document.getElementById('collectionPrev')?.addEventListener('click', () => scrollCollections(-1));
document.getElementById('collectionNext')?.addEventListener('click', () => scrollCollections(1));
collectionsNode?.addEventListener('scroll', updateCollectionScrollButtons, { passive: true });
window.addEventListener('resize', updateCollectionScrollButtons);
document.getElementById('filterPrev')?.addEventListener('click', () => scrollProductFilters(-1));
document.getElementById('filterNext')?.addEventListener('click', () => scrollProductFilters(1));
document.getElementById('productFilters')?.addEventListener('scroll', updateFilterScrollButtons, { passive: true });
document.getElementById('promoApplyButton')?.addEventListener('click', applyPromoCode);
document.getElementById('promoCode')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    applyPromoCode();
  }
});
window.addEventListener('resize', updateFilterScrollButtons);
window.addEventListener('resize', syncAnnouncementOffset);
updateAnnouncementBar();
setInterval(updateAnnouncementBar, 30000);

function setCheckoutPaymentLoading(isLoading) {
  const button = document.getElementById('checkoutContinueButton');
  const card = document.querySelector('#checkoutReviewModal .checkout-review-card');
  if (button) {
    button.disabled = isLoading;
    button.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    button.innerHTML = isLoading
      ? '<span class="payment-button-spinner" aria-hidden="true"></span><span>Preparing secure payment...</span>'
      : 'Continue to payment';
  }
  if (card) card.classList.toggle('payment-loading', isLoading);
}

async function proceedToPayment() {
  if (!cart.length) return showToast('Your bag is empty');

  if (!customer && !pendingGuestDetails) {
    closeCheckoutReview();
    openGuestCheckout();
    return;
  }

  if (customer && !hasCompleteCheckoutProfile(customer)) {
    showToast('Please add and verify your mobile number and address.');
    closeCheckoutReview();
    openProfile();
    return;
  }

  if (typeof window.Razorpay !== 'function') {
    showToast('Payment service is unavailable. Please try again.');
    return;
  }

  setCheckoutPaymentLoading(true);

  const checkoutButton = document.getElementById('checkoutButton');
  if (checkoutButton) {
    checkoutButton.disabled = true;
    checkoutButton.textContent = 'Preparing payment...';
  }

  try {
    const response = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart,
        guest: customer ? null : pendingGuestDetails,
        customer: customer || null,
        promoCode: appliedPromo?.code || ''
      })
    });
    const orderData = await response.json();
    if (!response.ok) throw new Error(orderData.error || 'Unable to start payment.');

    const contact = customer || pendingGuestDetails;
    const razorpay = new window.Razorpay({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: orderData.name || 'Nivara Jewellery',
      description: orderData.description || 'Jewellery order',
      order_id: orderData.orderId,
      prefill: {
        name: contact?.name || '',
        email: contact?.email || '',
        contact: contact?.phone || ''
      },
      theme: { color: '#8a571d' },
      handler: async paymentResponse => {
        try {
          const verifyResponse = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentResponse)
          });
          const verifyData = await verifyResponse.json();
          if (!verifyResponse.ok) throw new Error(verifyData.error || 'Payment verification failed.');

      const completedOrder = verifyData.order || { orderId: verifyData.orderId, paymentId: verifyData.paymentId, amount: orderData.amount / 100, products: cart.map(item => ({...item, image: products.find(p => p.id === item.id)?.image || ''})), customer: contact || {} };
      resetAppliedPromo();
      clearCart();
      closeCart();
      closeGuestCheckout();
      pendingGuestDetails = null;
      await loadProducts();
      showOrderSummary(completedOrder, true);
        } catch (error) {
          showToast(error.message || 'Payment verification failed.');
        }
      },
      modal: {
        ondismiss() {
          if (orderData.promo?.code && orderData.orderId) {
            fetch('/api/promo-release', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: orderData.orderId })
            }).catch(() => {});
          }
          showToast('Payment cancelled. Your bag has been kept.');
        }
      }
    });
    closeCheckoutReview();
    razorpay.open();
  } catch (error) {
    showToast(error.message || 'Unable to start payment.');
  } finally {
    setCheckoutPaymentLoading(false);
    if (checkoutButton) {
      checkoutButton.disabled = false;
      checkoutButton.textContent = 'Secure checkout';
    }
  }
}

function renderCheckoutReview() {
  const modal = document.getElementById('checkoutReviewModal');
  if (!modal) return;
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
  const discount = calculatePromoDiscount(subtotal);
  const total = Math.max(0, subtotal - discount);
  document.getElementById('checkoutItemCount').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  document.getElementById('checkoutReviewSubtotal').textContent = formatPrice(subtotal);
  document.getElementById('checkoutReviewTotal').textContent = formatPrice(total);
  document.getElementById('checkoutPayableTotal').textContent = formatPrice(total);
  const original = document.getElementById('checkoutOriginalTotal');
  if (original) { original.textContent = formatPrice(subtotal); original.hidden = !discount; }
  const discountRow = document.getElementById('checkoutReviewDiscountRow');
  const discountLabel = document.getElementById('checkoutReviewDiscountLabel');
  const discountValue = document.getElementById('checkoutReviewDiscount');
  if (discountRow) discountRow.hidden = !discount;
  if (discountLabel) discountLabel.textContent = `Promo discount (${Number(appliedPromo?.percent || LAUNCH_PROMO_PERCENT)}%)`;
  if (discountValue) discountValue.textContent = `- ${formatPrice(discount)}`;
  const items = document.getElementById('checkoutReviewItems');
  if (items) items.innerHTML = cart.map(item => `<div class="checkout-review-item"><img src="${item.image}" alt="${item.name}" /><div><strong>${item.name}</strong><small>Qty: ${item.quantity}</small></div><span>${formatPrice(item.price * item.quantity)}</span></div>`).join('');
  const promoInput = document.getElementById('checkoutPromoCode');
  const promoButton = document.getElementById('checkoutPromoApply');
  const promoStatus = document.getElementById('checkoutPromoStatus');
  if (promoInput) promoInput.value = appliedPromo?.code || '';
  if (promoButton) promoButton.textContent = appliedPromo ? 'Remove' : 'Apply';
  if (promoStatus) {
    if (appliedPromo) {
      promoStatus.textContent = `${appliedPromo.percent}% launch discount applied.`;
      promoStatus.classList.add('success');
      promoStatus.classList.remove('error');
    } else if (!promoStatus.classList.contains('error')) {
      promoStatus.textContent = '';
      promoStatus.classList.remove('success');
    }
  }
  const customerBox = document.getElementById('checkoutCustomerDetails');
  if (customerBox) {
    if (customer) customerBox.innerHTML = `<div class="checkout-customer-line"><span>${customer.name || 'Customer'}</span><strong>${customer.phone || 'Mobile not added'}</strong></div><small>${customer.email || ''}</small>`;
    else customerBox.innerHTML = `<div class="checkout-customer-line"><span>Guest checkout</span><strong>Delivery details required</strong></div><small>You can continue without creating an account.</small>`;
  }
}

function openCheckoutReview() {
  if (!cart.length) return showToast('Your bag is empty');
  closeCart();
  renderCheckoutReview();
  const modal = document.getElementById('checkoutReviewModal');
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('checkout-review-open');
}

function closeCheckoutReview() {
  const modal = document.getElementById('checkoutReviewModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  modal.hidden = true;
  document.body.classList.remove('checkout-review-open');
}

async function applyCheckoutPromo() {
  const checkoutInput = document.getElementById('checkoutPromoCode');
  const bagInput = document.getElementById('promoCode');
  if (bagInput) bagInput.value = checkoutInput?.value || '';
  await applyPromoCode();
  renderCheckoutReview();
}

function startCheckout() {
  openCheckoutReview();
}

document.getElementById('checkoutButton')?.addEventListener('click', startCheckout);
document.getElementById('checkoutReviewClose')?.addEventListener('click', closeCheckoutReview);
document.getElementById('checkoutPromoApply')?.addEventListener('click', applyCheckoutPromo);
document.getElementById('checkoutPromoCode')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); applyCheckoutPromo(); }
});
document.getElementById('checkoutContinueButton')?.addEventListener('click', () => {
  proceedToPayment();
});
document.getElementById('whatsappCheckoutButton')?.addEventListener('click', continueOrderOnWhatsApp);
document.getElementById('profileClose').addEventListener('click', closeProfile);
document.getElementById('ordersClose').addEventListener('click', closeOrders);

document.getElementById('guestCheckoutForm').addEventListener('change', event => {
  if (!event.target.matches('[name="sameBilling"]')) return;
  document.getElementById('billingAddressWrap').hidden = event.target.checked;
});

document.getElementById('guestCheckoutForm').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  pendingGuestDetails = {
    name: form.elements.name.value.trim(),
    email: form.elements.email.value.trim().toLowerCase(),
    phone: form.elements.phone.value.trim(),
    shippingAddress: form.elements.shippingAddress.value.trim(),
    billingAddress: form.elements.sameBilling.checked ? form.elements.shippingAddress.value.trim() : form.elements.billingAddress.value.trim()
  };
  if (!pendingGuestDetails.billingAddress) return showToast('Billing address is required');
  closeGuestCheckout();
  proceedToPayment();
});

document.getElementById('resendProfileOtp').addEventListener('click', async () => {
  const form = document.getElementById('profileForm');
  try {
    await accountRequest({
      action: 'resend-phone-otp',
      customer,
      phone: form.elements.phone.value
    });
    showToast('OTP resent', 'success');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    action: 'profile-update',
    customer,
    name: form.elements.name.value,
    phone: form.elements.phone.value,
    address: {
      line1: form.elements.line1.value,
      line2: form.elements.line2.value,
      city: form.elements.city.value,
      state: form.elements.state.value,
      pincode: form.elements.pincode.value
    }
  };

  try {
    const data = await accountRequest(payload);
    saveCustomer(data.customer);
    if (data.otpRequired) {
      document.getElementById('otpForm').hidden = false;
      showToast('OTP sent to your email', 'success');
    } else {
      showToast('Profile updated', 'success');
      closeProfile();
    }
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('otpForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await accountRequest({
      action: 'verify-phone',
      customer,
      otp: event.currentTarget.elements.otp.value
    });
    saveCustomer(data.customer);
    fillProfileForm(data.customer);
    document.getElementById('otpForm').hidden = true;
    showToast('Mobile number verified', 'success');
    closeProfile();
  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('click', refreshCustomerSession);
document.addEventListener('keydown', refreshCustomerSession);
if (isCustomerSessionExpired()) {
  clearCart();
  clearCustomerSession();
}
renderCustomerMenu();
loadProducts();





document.addEventListener('click', event => {
  const orderLink=event.target.closest('[data-order-index]');
  if(orderLink){const order=window.nivaraOrders?.[Number(orderLink.dataset.orderIndex)];if(order){closeOrders();showOrderSummary(order,false);}}
});
document.getElementById('orderSummaryClose')?.addEventListener('click',closeOrderSummary);
document.getElementById('downloadOrderSummary')?.addEventListener('click',()=>{if(currentOrderSummary)downloadOrderSummaryText(currentOrderSummary);});
document.getElementById('backToOrders')?.addEventListener('click',()=>{closeOrderSummary();openOrders();});
document.getElementById('continueAfterOrder')?.addEventListener('click',()=>{closeOrderSummary();document.getElementById('shop')?.scrollIntoView({behavior:'smooth'});});
