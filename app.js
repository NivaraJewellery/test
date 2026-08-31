let products = [];
let collections = [];
let cart = JSON.parse(localStorage.getItem('nivara-cart') || '[]');
let activeFilter = 'all';
let customer = JSON.parse(localStorage.getItem('nivara-customer') || 'null');
let savedAddresses = [];
let selectedAddressId = null;
let addressModalMode = 'checkout';
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


function setCheckoutTransitionLoading(isLoading, message = 'Loading your saved delivery details...') {
  const overlay = document.getElementById('checkoutTransitionOverlay');
  if (!overlay) return;
  const messageNode = overlay.querySelector('.checkout-transition-card span');
  if (messageNode) messageNode.textContent = message;
  overlay.classList.toggle('open', Boolean(isLoading));
  overlay.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
}
const LAUNCH_PROMO_CODE = 'NIVARA5';
const LAUNCH_PROMO_PERCENT = 5;
const LAUNCH_PROMO_START = Date.parse('2026-08-21T11:30:00.000Z'); // 21 Aug 2026, 5:00 PM IST
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

  // Preserve the bag when authentication expires. The customer can sign in again
  // and resume checkout with the same cart.
  clearCustomerSession('Session expired. Please login again. Your bag has been kept.');
  return false;
}

function hasCompleteCheckoutProfile(customerData) {
  return Boolean(customerData?.phone && customerData?.phoneVerified);
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

async function loadProducts(options = {}) {
  const { forceFresh = false } = options;
  const cacheSuffix = forceFresh ? `?checkoutFresh=${Date.now()}` : '';
  let productLoadError = null;

  // Product and collection loading must be independent. A temporary failure in
  // one endpoint should never leave both storefront sections blank.
  const [productResult, collectionResult] = await Promise.allSettled([
    fetch(`/api/products${cacheSuffix}`, forceFresh ? { cache: 'no-store' } : undefined),
    fetch(`/api/collections${cacheSuffix}`, forceFresh ? { cache: 'no-store' } : undefined)
  ]);

  if (productResult.status === 'fulfilled') {
    try {
      const productData = await productResult.value.json();
      if (!productResult.value.ok) throw new Error(productData.error || 'Unable to load products');
      products = Array.isArray(productData.products) ? productData.products : [];
    } catch (error) {
      productLoadError = error;
    }
  } else {
    productLoadError = productResult.reason;
  }

  if (productLoadError) {
    try {
      const fallback = await fetch('products.json', forceFresh ? { cache: 'no-store' } : undefined);
      const fallbackProducts = await fallback.json();
      products = Array.isArray(fallbackProducts) ? fallbackProducts : [];
    } catch (fallbackError) {
      products = [];
    }
  }

  if (collectionResult.status === 'fulfilled') {
    try {
      const collectionData = await collectionResult.value.json();
      collections = collectionResult.value.ok && Array.isArray(collectionData.collections)
        ? collectionData.collections
        : buildFallbackCollections(products);
    } catch (error) {
      collections = buildFallbackCollections(products);
    }
  } else {
    collections = buildFallbackCollections(products);
  }

  const removedItems = [];
  const adjustedItems = [];
  cart = cart
    .map(item => {
      const product = products.find(entry => Number(entry.id) === Number(item.id));
      if (!product) {
        removedItems.push({ name: item.name || 'An item', reason: 'unavailable' });
        return null;
      }

      const variants = Array.isArray(product.variants) ? product.variants : [];
      const variant = item.variantId
        ? variants.find(v => Number(v.id) === Number(item.variantId))
        : null;

      // A variant that existed when the customer added it can also be removed
      // or made unavailable while the customer is on the login page.
      if (item.variantId && !variant) {
        removedItems.push({ name: item.name || product.name, reason: 'variant-unavailable' });
        return null;
      }

      const available = Math.max(0, Number(variant ? variant.stock : product.stock) || 0);
      if (available <= 0) {
        removedItems.push({ name: item.name || product.name, reason: 'out-of-stock' });
        return null;
      }

      const requested = Math.max(1, Number(item.quantity) || 1);
      const quantity = Math.min(requested, available);
      if (quantity < requested) {
        adjustedItems.push({ name: product.name, quantity });
      }

      return {
        ...product,
        variantId: variant?.id || null,
        size: variant?.size || '',
        uom: variant?.uom || '',
        variantStock: variant?.stock ?? null,
        quantity
      };
    })
    .filter(Boolean);

  renderFilters();
  renderCollections();
  renderCart();
  return { removedItems, adjustedItems, productLoadError };
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
    ? `Launch offer: ${LAUNCH_PROMO_PERCENT}% OFF • Use code ${LAUNCH_PROMO_CODE} • Started 21 Aug, 5:00 PM IST • Ends 23 Aug, 11:59 PM IST`
    : state === 'upcoming'
      ? `Launch offer starts today at 5:00 PM IST • ${LAUNCH_PROMO_PERCENT}% OFF • Use code ${LAUNCH_PROMO_CODE} • Ends 23 Aug, 11:59 PM IST`
      : 'Complimentary shipping on orders above ₹1,999';
  requestAnimationFrame(syncAnnouncementOffset);
}

function calculatePromoDiscount(subtotal) {
  if (!appliedPromo) return 0;
  return Math.round((Number(subtotal) * Number(appliedPromo.percent || LAUNCH_PROMO_PERCENT)) / 100);
}

const FREE_SHIPPING_THRESHOLD = 1999;
const STANDARD_SHIPPING_CHARGE = 99;

function calculateShippingCharge(subtotal) {
  const value = Number(subtotal || 0);
  if (value <= 0) return 0;
  return value >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_CHARGE;
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
  if (customer.emailVerified === false) {
    showPromoMessage('Please verify your email address before applying this promo code.');
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
        <small>Explore Now &rarr;</small>
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
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const isOutOfStock = variants.length ? !variants.some(v => Number(v.stock)>0) : product.stock === 0;
    const cartItem = variants.length ? null : cart.find(item => item.id === product.id && !item.variantId);
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
        ${variants.length ? `<label class="size-selector">Size <select data-size-select="${product.id}"><option value="">Select size</option>${variants.map(v=>`<option value="${v.id}" ${Number(v.stock)<=0?'disabled':''}>${v.size} ${v.uom}${Number(v.stock)<=0?' - Sold out':''}</option>`).join('')}</select></label>` : ''}
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
  const shipping = calculateShippingCharge(subtotal);
  const total = Math.max(0, subtotal - discount + shipping);
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
        <p>${formatPrice(item.price)}${item.size ? ` · Size ${item.size} ${item.uom}` : ''}</p>
        ${item.care ? `<details class="care-details"><summary>Care instructions</summary><p>${item.care}</p></details>` : ''}
        <div class="bag-stepper">
          <button data-decrease="${item.id}" data-variant="${item.variantId || ''}" aria-label="Remove one ${item.name}">-</button>
          <span>${item.quantity}</span>
          <button data-increase="${item.id}" data-variant="${item.variantId || ''}" aria-label="Add one more ${item.name}">+</button>
        </div>
        <button data-remove="${item.id}" data-variant="${item.variantId || ''}">Remove all</button>
      </div>
      <strong>${formatPrice(item.price * item.quantity)}</strong>
    </div>
  `).join('');

  const discountRow = document.getElementById('promoDiscountRow');
  const grandTotalRow = document.getElementById('cartGrandTotalRow');
  const discountNode = document.getElementById('promoDiscount');
  const discountLabel = document.getElementById('promoDiscountLabel');
  const grandTotalNode = document.getElementById('cartGrandTotal');
  const shippingRow = document.getElementById('cartShippingRow');
  const shippingNode = document.getElementById('cartShipping');
  if (discountRow) discountRow.hidden = !appliedPromo;
  if (shippingRow) shippingRow.hidden = !cart.length;
  if (shippingNode) shippingNode.textContent = shipping === 0 && cart.length ? 'FREE' : formatPrice(shipping);
  if (grandTotalRow) grandTotalRow.hidden = !cart.length;
  if (discountNode) discountNode.textContent = `- ${formatPrice(discount)}`;
  if (discountLabel) {
    const percent = Number(appliedPromo?.percent || LAUNCH_PROMO_PERCENT);
    discountLabel.textContent = appliedPromo ? `Promo discount (${percent}%)` : 'Promo discount';
  }
  if (grandTotalNode) grandTotalNode.textContent = formatPrice(total);

  localStorage.setItem('nivara-cart', JSON.stringify(cart));

  // Cart count/totals are visible immediately. Rebuilding the full product grid
  // is deferred to the next frame so Add to bag feels instant.
  requestAnimationFrame(() => renderProducts());
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

function addToCart(id) {
  const product = products.find(item => Number(item.id) === Number(id));
  if (!product) return;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  let variant = null;
  if (variants.length) {
    const select = document.querySelector(`[data-size-select="${id}"]`);
    const variantId = Number(select?.value);
    variant = variants.find(v => Number(v.id) === variantId);
    if (!variant) return showToast(`Please select a size for ${product.name}`);
    if (Number(variant.stock) <= 0) return showSoldOutWarning(`${product.name} (${variant.size} ${variant.uom})`);
  } else if (Number(product.stock) <= 0) {
    renderProducts(); return showSoldOutWarning(product.name);
  }
  const existing = cart.find(item => Number(item.id)===id && Number(item.variantId||0)===Number(variant?.id||0));
  const available = variant ? Number(variant.stock) : Number(product.stock);
  if (existing) {
    if (existing.quantity >= available) return showToast(`Only ${available} available for ${product.name}${variant ? ` (${variant.size} ${variant.uom})` : ''}`);
    existing.quantity++;
  } else {
    cart.push({ ...product, variantId: variant?.id || null, size: variant?.size || '', uom: variant?.uom || '', variantStock: variant?.stock ?? null, quantity: 1 });
  }
  renderCart(); showToast(`${product.name}${variant ? ` (${variant.size} ${variant.uom})` : ''} added to your bag`, 'success');
}

async function changeQuantity(id, delta, variantId = null) {
  let product = products.find(item => Number(item.id) === Number(id));
  const existing = cart.find(item => Number(item.id)===Number(id) && Number(item.variantId||0)===Number(variantId||0));
  if (!product || !existing) return;
  if (delta > 0) product = await getFreshProduct(id);
  const variant = (product?.variants||[]).find(v=>Number(v.id)===Number(variantId));
  const available = variantId ? Number(variant?.stock||0) : Number(product?.stock||0);
  if (delta > 0 && available <= 0) return showSoldOutWarning(existing.name);
  const next=existing.quantity+delta;
  if(next<=0) cart=cart.filter(item=>!(Number(item.id)===Number(id)&&Number(item.variantId||0)===Number(variantId||0)));
  else if(next<=available) existing.quantity=next;
  else showToast(`Only ${available} available for ${product.name}${variant ? ` (${variant.size} ${variant.uom})` : ''}`);
  renderCart();
}

function showToast(message, type = '', duration = 2600) {
  const toast = document.getElementById('toast');
  window.clearTimeout(toast.hideTimer);
  toast.classList.remove('toast-availability-warning');
  toast.textContent = message;
  toast.classList.toggle('toast-success', type === 'success');
  toast.classList.add('show');
  toast.hideTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.textContent = '';
  }, duration);
}

function showUnavailableCheckoutWarning(productNames = []) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  const names = [...new Set((productNames || []).filter(Boolean))];
  window.clearTimeout(toast.hideTimer);
  toast.textContent = '';
  toast.classList.remove('toast-success');
  toast.classList.add('toast-availability-warning');

  const content = document.createElement('div');
  content.className = 'toast-warning-content';

  const title = document.createElement('strong');
  title.className = 'toast-warning-title';
  title.textContent = names.length === 1 ? 'Product no longer available' : 'Some products are no longer available';

  const message = document.createElement('span');
  message.className = 'toast-warning-message';
  if (names.length === 1) {
    message.textContent = `${names[0]} is no longer available and has been removed from your bag. Please check our other products and choose another piece.`;
  } else if (names.length > 1) {
    message.textContent = `${names.join(', ')} are no longer available and have been removed from your bag. Please check our other products and choose another piece.`;
  } else {
    message.textContent = 'A product in your bag is no longer available and has been removed. Please check our other products and choose another piece.';
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Close message');
  close.textContent = '×';

  content.append(title, message);
  toast.append(content, close);
  toast.classList.add('show');

  // Keep availability warnings visible considerably longer than normal toasts,
  // while still allowing the customer to dismiss them immediately with ×.
  toast.hideTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.textContent = '';
  }, 12000);
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
  form.elements.name.value = customerData.name || '';
  form.elements.email.value = customerData.email || '';
  form.elements.phone.value = customerData.phone || '';
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
    savedAddresses = data.addresses || savedAddresses;
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


function formatSavedAddress(address) {
  return [address.line1, address.line2, address.city, address.state, address.pincode].filter(Boolean).join(', ');
}

async function loadSavedAddresses() {
  if (!customer) { savedAddresses = []; selectedAddressId = null; return []; }
  const data = await accountRequest({ action: 'addresses-list', customer });
  savedAddresses = data.addresses || [];
  if (!selectedAddressId || !savedAddresses.some(a => Number(a.id) === Number(selectedAddressId))) {
    selectedAddressId = savedAddresses.find(a => a.isDefault)?.id || savedAddresses[0]?.id || null;
  }
  return savedAddresses;
}

function renderSavedAddresses() {
  const list = document.getElementById('savedAddressList');
  const useButton = document.getElementById('useSelectedAddress');
  if (!list) return;
  if (!savedAddresses.length) {
    list.innerHTML = '<div class="address-empty-state"><strong>No saved delivery address yet.</strong><small>Add your first address to continue.</small></div>';
    if (useButton) useButton.hidden = true;
    return;
  }
  list.innerHTML = savedAddresses.map(address => `
    <article class="saved-address-card ${Number(address.id) === Number(selectedAddressId) ? 'selected' : ''}" data-address-card="${address.id}">
      <label class="saved-address-select"><input type="radio" name="deliveryAddress" value="${address.id}" ${Number(address.id) === Number(selectedAddressId) ? 'checked' : ''}/><span><strong>${address.label || 'Address'}${address.isDefault ? ' · Default' : ''}</strong><small>${address.recipientName || customer?.name || ''} · ${address.phone || customer?.phone || ''}</small><p>${formatSavedAddress(address)}</p></span></label>
      <div class="saved-address-actions"><button type="button" data-edit-address="${address.id}">Edit</button>${address.isDefault ? '' : `<button type="button" data-default-address="${address.id}">Set default</button>`}<button type="button" data-delete-address="${address.id}">Delete</button></div>
    </article>`).join('');
  if (useButton) useButton.hidden = addressModalMode !== 'checkout';
}

function resetAddressForm(address = null) {
  const form = document.getElementById('addressForm');
  if (!form) return;
  form.reset();
  form.elements.id.value = address?.id || '';
  form.elements.label.value = address?.label || 'Home';
  form.elements.recipientName.value = address?.recipientName || customer?.name || '';
  form.elements.phone.value = address?.phone || customer?.phone || '';
  form.elements.line1.value = address?.line1 || '';
  form.elements.line2.value = address?.line2 || '';
  form.elements.city.value = address?.city || '';
  form.elements.state.value = address?.state || '';
  form.elements.pincode.value = address?.pincode || '';
  form.elements.isDefault.checked = Boolean(address?.isDefault || !savedAddresses.length);
  form.hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function openDeliveryAddress(mode = 'checkout') {
  if (!customer) return;
  addressModalMode = mode;
  try { await loadSavedAddresses(); } catch (error) { return showToast(error.message); }
  const modal = document.getElementById('deliveryAddressModal');
  document.getElementById('deliveryAddressEyebrow').textContent = mode === 'checkout' ? 'Delivery address' : 'Address book';
  document.getElementById('deliveryAddressTitle').textContent = mode === 'checkout' ? 'Choose delivery address' : 'Saved addresses';
  document.getElementById('addressForm').hidden = true;
  renderSavedAddresses();
  modal.hidden = false; modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
  if (!savedAddresses.length) resetAddressForm();
}

function closeDeliveryAddress() {
  const modal = document.getElementById('deliveryAddressModal');
  if (!modal) return;
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); modal.hidden = true;
  document.getElementById('addressForm').hidden = true;
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
  const shipping = Number(
    order.shippingCharge ?? order.shipping_charge ??
    (typeof order.items === 'string' ? JSON.parse(order.items)?.shipping?.charge : order.items?.shipping?.charge) ??
    0
  );
  const amount = Number(order.amount || ((promo?.total != null ? Number(promo.total) : subtotal) + shipping));
  const discount = Number(promo?.discount || Math.max(0, subtotal + shipping - amount));
  const dateValue = order.createdAt || order.created_at || new Date().toISOString();
  const address = customerDetails.shippingAddress || customerDetails.billingAddress || [customerDetails.address?.line1,customerDetails.address?.line2,customerDetails.address?.city,customerDetails.address?.state,customerDetails.address?.pincode].filter(Boolean).join(', ') || 'Not available';
  return `<div class="order-summary-success">✓ Payment successful — your order is confirmed.</div>
    <div class="order-summary-meta"><div><small>Order number</small><br><strong>${order.orderId || order.razorpay_order_id || '-'}</strong></div><div><small>Order date</small><br><strong>${new Date(dateValue).toLocaleString('en-IN')}</strong></div><div><small>Payment reference</small><br><strong>${order.paymentId || order.razorpay_payment_id || '-'}</strong></div><div><small>Status</small><br><strong>Confirmed</strong></div></div>
    <h3>Items ordered</h3><div class="order-summary-items">${products.map(item=>`<div class="order-summary-item">${item.image?`<img src="${item.image}" alt="">`:'<span></span>'}<div><strong>${item.name || `Product ${item.id}`}</strong><small>Qty ${item.quantity || 1} × ${formatPrice(item.price || 0)}</small></div><strong>${formatPrice(Number(item.price||0)*Number(item.quantity||1))}</strong></div>`).join('')}</div>
    <div class="order-summary-customer"><strong>Delivery details</strong><p>${customerDetails.name || ''}${customerDetails.phone ? ` · ${customerDetails.phone}`:''}<br>${address}</p></div>
    <div class="order-summary-totals"><div class="order-summary-total-row"><span>Subtotal</span><strong>${formatPrice(subtotal)}</strong></div>${discount>0?`<div class="order-summary-total-row"><span>Promo discount${promo?.percent?` (${promo.percent}%)`:''}</span><strong>- ${formatPrice(discount)}</strong></div>`:''}<div class="order-summary-total-row"><span>Shipping</span><strong>${shipping === 0 ? 'FREE' : formatPrice(shipping)}</strong></div><div class="order-summary-total-row grand"><span>Total paid</span><strong>${formatPrice(amount)}</strong></div></div>`;
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
  const shipping=Number(order.shippingCharge??order.shipping_charge??(typeof order.items==='string'?JSON.parse(order.items)?.shipping?.charge:order.items?.shipping?.charge)??0);
  const lines=['NIVARA JEWELLERY','ORDER SUMMARY','',`Order: ${order.orderId||order.razorpay_order_id||'-'}`,`Payment: ${order.paymentId||order.razorpay_payment_id||'-'}`,`Date: ${new Date(order.createdAt||order.created_at||Date.now()).toLocaleString('en-IN')}`,'','Items:',...products.map(i=>`${i.name} | Qty ${i.quantity||1} | Rs. ${Number(i.price||0)*Number(i.quantity||1)}`),'',promo?.discount?`Promo discount (${promo.percent||0}%): - Rs. ${promo.discount}`:'',`Shipping: ${shipping===0?'FREE':'Rs. '+shipping}`,`Total paid: Rs. ${order.amount||((promo?.total||0)+shipping)||0}`].filter(v=>v!==undefined);
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
  if (increase) await changeQuantity(Number(increase.dataset.increase), 1, Number(increase.dataset.variant)||null);
  if (decrease) await changeQuantity(Number(decrease.dataset.decrease), -1, Number(decrease.dataset.variant)||null);
  if (viewImage) openImageViewer(Number(viewImage.dataset.viewImage));
  if (notify) requestStockNotification(Number(notify.dataset.notify));
  if (remove) {
    cart = cart.filter(item => !(Number(item.id) === Number(remove.dataset.remove) && Number(item.variantId||0) === Number(remove.dataset.variant||0)));
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
  closeDeliveryAddress();
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

  if (!customer) {
    localStorage.setItem('nivara-return-to-checkout', '1');
    window.location.href = 'account.html?return=checkout';
    return;
  }

  if (!selectedAddressId) {
    closeCheckoutReview();
    await openDeliveryAddress('checkout');
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
        customer,
        promoCode: appliedPromo?.code || '',
        selectedAddressId
      })
    });
    const orderData = await response.json();
    if (!response.ok) throw new Error(orderData.error || 'Unable to start payment.');

    const contact = customer;
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
      await loadProducts();
      showOrderSummary(completedOrder, true);
        } catch (error) {
          showToast(error.message || 'Payment verification failed.');
        }
      },
      modal: {
        async ondismiss() {
          if (orderData.orderId) {
            try {
              const cancelResponse = await fetch('/api/cancel-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: orderData.orderId }),
                keepalive: true
              });

              // If order cancellation itself cannot update the pending order for any
              // reason, still release the promo reservation explicitly.
              if (!cancelResponse.ok) {
                await fetch('/api/promo-release', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orderId: orderData.orderId }),
                  keepalive: true
                });
              }
            } catch (_) {
              try {
                await fetch('/api/promo-release', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ orderId: orderData.orderId }),
                  keepalive: true
                });
              } catch (_) {}
            }
          }

          // The backend reservation is now released, so clear the matching
          // in-memory promo state as well. Otherwise the next click on "Apply"
          // is interpreted as "Remove" by applyPromoCode() and no /api/promo
          // request is sent.
          resetAppliedPromo('Payment cancelled. You can apply the promo again.');
          renderCart();
          if (customer) refreshCustomerSession();
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
  const shipping = calculateShippingCharge(subtotal);
  const total = Math.max(0, subtotal - discount + shipping);
  document.getElementById('checkoutItemCount').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  document.getElementById('checkoutReviewSubtotal').textContent = formatPrice(subtotal);
  const shippingValue = document.getElementById('checkoutReviewShipping');
  if (shippingValue) shippingValue.textContent = shipping === 0 ? 'FREE' : formatPrice(shipping);
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
    if (customer) {
      const selectedAddress = savedAddresses.find(a => Number(a.id) === Number(selectedAddressId));
      customerBox.innerHTML = `<div class="checkout-customer-line"><span>${customer.name || 'Customer'}</span><strong>${customer.phone || ''}</strong></div><small>${customer.email || ''}</small>${selectedAddress ? `<div class="checkout-address-summary"><strong>${selectedAddress.label || 'Delivery address'}</strong><p>${formatSavedAddress(selectedAddress)}</p><button class="link-button" type="button" data-change-delivery-address>Change delivery address</button></div>` : '<div class="checkout-address-summary"><strong>Delivery address required</strong></div>'}`;
    } else customerBox.innerHTML = `<div class="checkout-customer-line"><span>Sign in required</span><strong>Secure checkout</strong></div><small>Please sign in to continue to payment.</small>`;
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

async function startCheckout() {
  if (!cart.length) return showToast('Your bag is empty');

  // A checkout attempt is active customer activity, so extend the session before
  // creating the Razorpay order.
  if (customer) refreshCustomerSession();

  if (!customer) {
    localStorage.setItem('nivara-return-to-checkout', '1');
    window.location.href = 'account.html?return=checkout';
    return;
  }

  try { await loadSavedAddresses(); } catch (error) { return showToast(error.message); }

  closeCart();

  // 0 addresses: ask the customer to add one.
  // 1 address: use it automatically and go straight to checkout review.
  // 2+ addresses: let the customer choose the delivery address.
  if (savedAddresses.length === 0) {
    await openDeliveryAddress('checkout');
    return;
  }

  if (savedAddresses.length === 1) {
    selectedAddressId = savedAddresses[0].id;
    openCheckoutReview();
    return;
  }

  await openDeliveryAddress('checkout');
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

document.getElementById('manageAddressesButton')?.addEventListener('click', () => openDeliveryAddress('manage'));
document.getElementById('deliveryAddressClose')?.addEventListener('click', closeDeliveryAddress);
document.getElementById('addAddressButton')?.addEventListener('click', () => resetAddressForm());
document.getElementById('cancelAddressEdit')?.addEventListener('click', () => { document.getElementById('addressForm').hidden = true; });
document.getElementById('useSelectedAddress')?.addEventListener('click', () => {
  if (!selectedAddressId) return showToast('Please select a delivery address.');
  closeDeliveryAddress();
  openCheckoutReview();
});

document.getElementById('savedAddressList')?.addEventListener('change', event => {
  if (!event.target.matches('input[name="deliveryAddress"]')) return;
  selectedAddressId = Number(event.target.value);
  renderSavedAddresses();
});

document.getElementById('savedAddressList')?.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit-address]');
  const del = event.target.closest('[data-delete-address]');
  const def = event.target.closest('[data-default-address]');
  try {
    if (edit) return resetAddressForm(savedAddresses.find(a => Number(a.id) === Number(edit.dataset.editAddress)));
    if (def) {
      const data = await accountRequest({ action:'address-default', customer, addressId:Number(def.dataset.defaultAddress) });
      savedAddresses = data.addresses || []; selectedAddressId = savedAddresses.find(a=>a.isDefault)?.id || selectedAddressId; renderSavedAddresses(); return showToast('Default address updated','success');
    }
    if (del) {
      if (!confirm('Delete this saved address?')) return;
      const data = await accountRequest({ action:'address-delete', customer, addressId:Number(del.dataset.deleteAddress) });
      savedAddresses = data.addresses || []; selectedAddressId = savedAddresses.find(a=>a.isDefault)?.id || savedAddresses[0]?.id || null; renderSavedAddresses();
      if (!savedAddresses.length) resetAddressForm();
      return showToast('Address deleted','success');
    }
  } catch (error) { showToast(error.message); }
});

document.getElementById('addressForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const address = {
    id: Number(form.elements.id.value || 0) || undefined,
    label: form.elements.label.value.trim(), recipientName: form.elements.recipientName.value.trim(), phone: form.elements.phone.value.trim(),
    line1: form.elements.line1.value.trim(), line2: form.elements.line2.value.trim(), city: form.elements.city.value.trim(), state: form.elements.state.value.trim(), pincode: form.elements.pincode.value.trim(), isDefault: form.elements.isDefault.checked
  };
  try {
    const data = await accountRequest({ action:'address-save', customer, address });
    savedAddresses = data.addresses || []; selectedAddressId = data.address?.id || savedAddresses.find(a=>a.isDefault)?.id || savedAddresses[0]?.id || null;
    form.hidden = true; renderSavedAddresses(); showToast('Address saved','success');
  } catch (error) { showToast(error.message); }
});


document.getElementById('profileForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const data = await accountRequest({ action:'profile-update', customer, name:form.elements.name.value, phone:form.elements.phone.value });
    saveCustomer(data.customer);
    showToast('Profile updated','success');
    closeProfile();
  } catch (error) { showToast(error.message); }
});


document.addEventListener('click', event => {
  if (event.target.closest('[data-change-delivery-address]')) { closeCheckoutReview(); openDeliveryAddress('checkout'); }
});

document.addEventListener('click', refreshCustomerSession);
document.addEventListener('keydown', refreshCustomerSession);
if (isCustomerSessionExpired()) {
  // Expired authentication must never destroy the customer's shopping bag.
  // Keep the cart in memory/localStorage so the customer can sign in again
  // and resume checkout.
  clearCustomerSession();
}
async function initializeStorefront() {
  renderCustomerMenu();
  const params = new URLSearchParams(window.location.search);
  const shouldResumeCheckout = params.get('checkout') === '1' || localStorage.getItem('nivara-return-to-checkout') === '1';
  let checkoutNotice = '';

  if (shouldResumeCheckout) {
    setCheckoutTransitionLoading(true, 'Loading your bag and delivery details...');

    // Consume the resume marker immediately. If any later request fails, a
    // refresh/logout must not keep reopening the checkout transition loader.
    localStorage.removeItem('nivara-return-to-checkout');
    if (params.has('checkout')) {
      params.delete('checkout');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
  }

  try {
    const loadResult = await loadProducts({ forceFresh: shouldResumeCheckout });

    if (shouldResumeCheckout) {
      const removed = loadResult.removedItems || [];
      if (removed.length) {
        const names = [...new Set(removed.map(item => item.name).filter(Boolean))];
        checkoutNotice = { type: 'unavailable-products', names };
      }

      // Never continue to checkout on static fallback data. The live product
      // list must be verified first so deleted/out-of-stock items cannot slip
      // through because of a temporary API failure.
      if (loadResult.productLoadError) {
        checkoutNotice = 'We could not verify your bag right now. Please try Secure checkout again.';
      } else if (customer && cart.length) {
        await startCheckout();
      } else if (customer && !cart.length && !checkoutNotice) {
        checkoutNotice = 'Your bag is empty. Please add an item before checkout.';
      }
    }
  } catch (error) {
    if (shouldResumeCheckout) {
      checkoutNotice = 'We could not refresh your bag. Please try again.';
    }
  } finally {
    setCheckoutTransitionLoading(false);
    if (checkoutNotice) {
      // Show the warning only after the transition overlay closes so it is
      // visible to the customer on the storefront.
      setTimeout(() => {
        if (checkoutNotice?.type === 'unavailable-products') {
          showUnavailableCheckoutWarning(checkoutNotice.names);
        } else {
          showToast(checkoutNotice, '', 7000);
        }
      }, 50);
    }
  }
}
initializeStorefront();





document.addEventListener('click', event => {
  const orderLink=event.target.closest('[data-order-index]');
  if(orderLink){const order=window.nivaraOrders?.[Number(orderLink.dataset.orderIndex)];if(order){closeOrders();showOrderSummary(order,false);}}
});
document.getElementById('orderSummaryClose')?.addEventListener('click',closeOrderSummary);
document.getElementById('downloadOrderSummary')?.addEventListener('click',()=>{if(currentOrderSummary)downloadOrderSummaryText(currentOrderSummary);});
document.getElementById('backToOrders')?.addEventListener('click',()=>{closeOrderSummary();openOrders();});
document.getElementById('continueAfterOrder')?.addEventListener('click',()=>{closeOrderSummary();document.getElementById('shop')?.scrollIntoView({behavior:'smooth'});});
