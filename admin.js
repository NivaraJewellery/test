let products = [];
let collections = [];
const ADMIN_SESSION_MS = 30 * 60 * 1000;

const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const stockList = document.getElementById('stockList');
const collectionSelect = document.getElementById('collectionSelect');
const collectionList = document.getElementById('collectionList');
const adminSessionNote = document.getElementById('adminSessionNote');
const bulkExcelUpload = document.getElementById('bulkExcelUpload');
const downloadBulkTemplate = document.getElementById('downloadBulkTemplate');

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

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
function showAdmin() {
  loginPanel.hidden = true;
  adminPanel.hidden = false;
}

function showLogin() {
  loginPanel.hidden = false;
  adminPanel.hidden = true;
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

async function loadProducts() {
  const [productData, collectionData] = await Promise.all([
    apiRequest('/api/admin-products'),
    apiRequest('/api/admin-collections')
  ]);
  products = productData.products;
  collections = collectionData.collections;
  renderCollectionOptions();
  renderCollectionList();
  renderStockList();
}

function renderCollectionOptions() {
  collectionSelect.innerHTML = '<option value="">No collection</option>' + collections
    .filter(collection => collection.active)
    .map(collection => `<option value="${collection.id}">${collection.name}</option>`)
    .join('');
}

function renderCollectionList() {
  if (!collectionList) return;
  const activeCollections = collections.filter(collection => collection.active);
  collectionList.innerHTML = activeCollections.length ? activeCollections.map(collection => `
    <article class="collection-card collection-card-with-image">
      <div class="collection-preview-wrap">
        <img class="collection-preview" src="${collection.image || 'assets/logo.png'}" alt="${collection.name || 'Collection'} category preview" />
      </div>
      <div class="collection-fields">
        <input value="${collection.name || ''}" data-collection-name="${collection.id}" aria-label="Collection name" />
        <input value="${collection.image || ''}" data-collection-image="${collection.id}" aria-label="Category image path" placeholder="assets/categories/category-image.jpg" />
        <small>${collection.product_count || 0} products • Leave image blank to use a product image automatically.</small>
      </div>
      <button type="button" data-save-collection="${collection.id}">Save collection</button>
      <button type="button" data-delete-collection="${collection.id}" ${Number(collection.product_count || 0) > 0 ? 'disabled title="Remove mapped products first"' : ''}>Delete</button>
    </article>
  `).join('') : '<p class="muted-text">No collections yet.</p>';
}
function renderProductCollectionOptions(product) {
  return '<option value="">No collection</option>' + collections
    .filter(collection => collection.active)
    .map(collection => `<option value="${collection.id}" ${Number(product.collection_id) === Number(collection.id) ? 'selected' : ''}>${collection.name}</option>`)
    .join('');
}

function showFirstRunMessage(message) {
  products = [];
  stockList.innerHTML = `<section class="admin-note">${message}. Click <strong>Initialize database</strong> to create the tables and import your first products.</section>`;
}

function isMissingDatabaseTable(error) {
  return error.message.toLowerCase().includes('relation "products" does not exist') ||
    error.message.toLowerCase().includes('relation "collections" does not exist') ||
    error.message.toLowerCase().includes('relation "orders" does not exist');
}

function renderStockList() {
  stockList.innerHTML = products.map(product => `
    <article class="stock-card ${product.active ? '' : 'stock-card-hidden'}">
      <img src="${product.image}" alt="${product.name}" />
      <div>
        <h2>${product.name}</h2>
        <p>Code ${product.code || '-'} - ${product.active ? 'Visible' : 'Removed'} - Rs. ${Number(product.price).toLocaleString('en-IN')}</p>
        <label class="image-path-field">Product code
          <input value="${product.code || ''}" data-code-input="${product.id}" placeholder="Product code" />
        </label>
        <label class="image-path-field">Selling price
          <input type="number" min="0" value="${product.price || 0}" data-price-input="${product.id}" placeholder="Selling price" />
        </label>
        <label class="image-path-field">Image path
          <input value="${product.image || ''}" data-image-input="${product.id}" placeholder="assets/products/example.jpg" />
        </label>
        <label class="image-path-field">Hover image path
          <input value="${product.image_2 || ''}" data-image-two-input="${product.id}" placeholder="assets/products/example-hover.jpg" />
        </label>
        <label class="image-path-field">Extra image path
          <input value="${product.image_3 || ''}" data-image-three-input="${product.id}" placeholder="assets/products/example-extra.jpg" />
        </label>
        <label class="image-path-field">Collection
          <select data-product-collection="${product.id}">
            ${renderProductCollectionOptions(product)}
          </select>
        </label>
        <label class="image-path-field">Category
          <input value="${product.category || ''}" data-category-input="${product.id}" placeholder="Necklace" />
        </label>
        <div class="stock-number">
          <input type="number" min="0" value="${product.stock}" data-stock-input="${product.id}" />
          <span>${product.stock ? `${product.stock} available` : 'Out of stock'}</span>
        </div>
        <div class="stock-controls">
          <button data-save-stock="${product.id}">Save stock</button>
          <button data-save-details="${product.id}">Save code/price</button>
          <button data-save-image="${product.id}">Save all images</button>
          <button data-save-category="${product.id}">Save category</button>
          <button data-sold-out="${product.id}">Sold out</button>
          <button data-remove-product="${product.id}">Remove</button>
        </div>
      </div>
    </article>
  `).join('');
}

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;
}

function normalizeBulkHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function bulkRowToLine(row) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeBulkHeader(key), value]));
  return [
    normalized.code || normalized.productcode || '',
    normalized.stock || normalized.quantity || '',
    normalized.price || normalized.sellingprice || '',
    normalized.category || normalized.collection || '',
    normalized.image || normalized.imagepath || normalized.photo || '',
    normalized.image2 || normalized.image_2 || normalized.hoverimage || '',
    normalized.image3 || normalized.image_3 || normalized.extraimage || ''
  ].map(value => String(value ?? '').trim()).join(', ');
}

function csvRowsToLines(text) {
  return text
    .split(/\r?\n/)
    .map(row => row.trim())
    .filter(Boolean)
    .map(row => row.split(',').map(value => value.trim()))
    .map((columns, index, rows) => {
      const firstCell = normalizeBulkHeader(columns[0]);
      if (index === 0 && ['code', 'productcode'].includes(firstCell)) return '';
      return columns.slice(0, 7).join(', ');
    })
    .filter(Boolean)
    .join('\n');
}

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.getElementById('adminPassword').value;

  try {
    await adminLogin(password);
    document.getElementById('adminPassword').value = '';
    await loadProducts();
    showAdmin();
    showToast('Logged in');
  } catch (error) {
    if (isMissingDatabaseTable(error)) {
      showAdmin();
      showFirstRunMessage('Database is connected, but the required tables are not created yet');
      showToast('Please initialize database');
      return;
    }

    clearAdminSession();
    showToast(error.message);
  }
});

document.getElementById('logoutButton').addEventListener('click', () => {
  clearAdminSession('Logged out');
});

document.getElementById('initializeDb').addEventListener('click', async () => {
  try {
    await apiRequest('/api/admin-init', { method: 'POST', body: '{}' });
    await loadProducts();
    showToast('Database initialized');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('productForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const product = Object.fromEntries(formData.entries());
  const selectedCollection = collections.find(collection => collection.id === Number(product.collection_id));
  if (selectedCollection) {
    product.category = selectedCollection.name;
    product.type = selectedCollection.slug;
  }

  try {
    await apiRequest('/api/admin-products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
    form.reset();
    form.category.value = 'Necklace';
    form.type.value = 'necklace';
    form.image.value = '';
    form.image_2.value = '';
    form.image_3.value = '';
    await loadProducts();
    showToast('Product added');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('collectionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const collection = Object.fromEntries(new FormData(form).entries());

  try {
    await apiRequest('/api/admin-collections', {
      method: 'POST',
      body: JSON.stringify(collection)
    });
    form.reset();
        await loadProducts();
    showToast('Collection added');
  } catch (error) {
    showToast(error.message);
  }
});

bulkExcelUpload.addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const textarea = document.querySelector('[name="bulkRows"]');
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'csv') {
      textarea.value = csvRowsToLines(await file.text());
    } else {
      if (!window.XLSX) throw new Error('Excel reader is still loading. Please try again in a few seconds.');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      textarea.value = rows.map(bulkRowToLine).filter(Boolean).join('\n');
    }

    showToast('File loaded. Review the rows, then click bulk update.');
  } catch (error) {
    showToast(error.message || 'Unable to read file');
  } finally {
    event.target.value = '';
  }
});

downloadBulkTemplate.addEventListener('click', event => {
  event.preventDefault();
  const csv = 'code,stock,price,category,image,image_2,image_3\n025,5,250,Forehead Ornament,assets/products/025-main.jpg,assets/products/025-hover.jpg,assets/products/025-extra.jpg\n030,2,500,Forehead Ornament,assets/products/030-main.jpg,assets/products/030-hover.jpg,assets/products/030-extra.jpg\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'nivara-bulk-product-template.csv';
  link.click();
  URL.revokeObjectURL(link.href);
});


document.getElementById('bulkUpdateForm').addEventListener('submit', async event => {
  event.preventDefault();
  const rows = event.currentTarget.elements.bulkRows.value
    .split(/\r?\n/)
    .map(row => row.trim())
    .filter(Boolean)
    .map(row => {
      const [code, stock, price, category, image, image2, image3] = row.split(',').map(value => value.trim());
      const collection = collections.find(item => item.name.toLowerCase() === String(category || '').toLowerCase());
      const update = {
        code,
        stock: stock === '' ? undefined : Number(stock),
        price: price === '' ? undefined : Number(price),
        category: category || undefined,
        type: collection?.slug || (category ? slugify(category) : undefined),
        collection_id: collection?.id || undefined,
        image: image || undefined
      };
      if (image2) update.image_2 = image2;
      if (image3) update.image_3 = image3;
      return update;
    });

  if (!rows.length) return showToast('Add at least one product row');
  if (!confirm(`Update ${rows.length} products in bulk?`)) return;

  try {
    const data = await apiRequest('/api/admin-products', {
      method: 'PATCH',
      body: JSON.stringify({ products: rows })
    });
    await loadProducts();
    showToast(`${data.updated || 0} products updated`);
  } catch (error) {
    showToast(error.message);
  }
});
document.addEventListener('click', async event => {
  const saveButton = event.target.closest('[data-save-stock]');
  const saveDetailsButton = event.target.closest('[data-save-details]');
  const saveImageButton = event.target.closest('[data-save-image]');
  const saveCategoryButton = event.target.closest('[data-save-category]');
  const soldOutButton = event.target.closest('[data-sold-out]');
  const removeButton = event.target.closest('[data-remove-product]');
  const saveCollectionButton = event.target.closest('[data-save-collection]');
  const deleteCollectionButton = event.target.closest('[data-delete-collection]');

  try {
    if (saveCollectionButton) {
      const id = Number(saveCollectionButton.dataset.saveCollection);
      const name = document.querySelector(`[data-collection-name="${id}"]`).value.trim();
      const image = document.querySelector(`[data-collection-image="${id}"]`)?.value.trim() || '';
      const icon = '◇';
      if (!name) return showToast('Collection name is required');
      await apiRequest('/api/admin-collections', {
        method: 'PATCH',
        body: JSON.stringify({ id, name, image, icon })
      });
      await loadProducts();
      showToast('Collection updated');
    }


    if (deleteCollectionButton) {
      const id = Number(deleteCollectionButton.dataset.deleteCollection);
      if (!confirm('Delete this collection? This is allowed only when no products are mapped to it.')) return;
      await apiRequest('/api/admin-collections', {
        method: 'DELETE',
        body: JSON.stringify({ id })
      });
      await loadProducts();
      showToast('Collection deleted');
    }
    if (saveButton) {
      if (!confirm('Save the stock quantity for this product?')) return;
      const id = Number(saveButton.dataset.saveStock);
      const input = document.querySelector(`[data-stock-input="${id}"]`);
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({ id, stock: Number(input.value) || 0 })
      });
      await loadProducts();
      showToast('Stock updated');
    }

    if (saveDetailsButton) {
      if (!confirm('Save the product code and selling price for this product?')) return;
      const id = Number(saveDetailsButton.dataset.saveDetails);
      const codeInput = document.querySelector(`[data-code-input="${id}"]`);
      const priceInput = document.querySelector(`[data-price-input="${id}"]`);
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({
          id,
          code: codeInput.value.trim(),
          price: Number(priceInput.value) || 0
        })
      });
      await loadProducts();
      showToast('Code and price updated');
    }
    if (saveImageButton) {
      if (!confirm('Save the main, hover, and extra image paths for this product?')) return;
      const id = Number(saveImageButton.dataset.saveImage);
      const input = document.querySelector(`[data-image-input="${id}"]`);
      const inputTwo = document.querySelector(`[data-image-two-input="${id}"]`);
      const inputThree = document.querySelector(`[data-image-three-input="${id}"]`);
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({
          id,
          image: input.value.trim(),
          image_2: inputTwo.value.trim(),
          image_3: inputThree.value.trim()
        })
      });
      await loadProducts();
      showToast('Image updated');
    }

    if (saveCategoryButton) {
      if (!confirm('Save the category for this product?')) return;
      const id = Number(saveCategoryButton.dataset.saveCategory);
      const input = document.querySelector(`[data-category-input="${id}"]`);
      const collectionInput = document.querySelector(`[data-product-collection="${id}"]`);
      const collectionId = Number(collectionInput?.value) || null;
      const collection = collections.find(item => Number(item.id) === collectionId);
      const category = input.value.trim() || collection?.name || 'Necklace';
      const type = collection?.slug || slugify(category);
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({ id, category, type, collection_id: collectionId })
      });
      await loadProducts();
      showToast('Category updated');
    }

    if (soldOutButton) {
      if (!confirm('Mark this product as sold out?')) return;
      await apiRequest('/api/admin-products', {
        method: 'PATCH',
        body: JSON.stringify({ id: Number(soldOutButton.dataset.soldOut), stock: 0 })
      });
      await loadProducts();
      showToast('Marked sold out');
    }

    if (removeButton) {
      if (!confirm('Remove this product from the shop?')) return;
      await apiRequest('/api/admin-products', {
        method: 'DELETE',
        body: JSON.stringify({ id: Number(removeButton.dataset.removeProduct) })
      });
      await loadProducts();
      showToast('Product removed from shop');
    }

  } catch (error) {
    showToast(error.message);
  }
});

document.addEventListener('click', refreshAdminSession);
document.addEventListener('keydown', refreshAdminSession);

if (!isAdminSessionExpired()) {
  loadProducts()
    .then(showAdmin)
    .catch(error => {
      if (isMissingDatabaseTable(error)) {
        showAdmin();
        showFirstRunMessage('Database is connected, but the required tables are not created yet');
        return;
      }
      showLogin();
    });
} else {
  showLogin();
}



