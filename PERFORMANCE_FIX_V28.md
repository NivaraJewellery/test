# Performance fix v28

Two hot paths were identified in the deployed storefront code.

## Initial page load
`loadProducts()` waits for `/api/products` and `/api/collections`.

Previously:
- `/api/products` executed two `ALTER TABLE ... IF NOT EXISTS` statements on every GET.
- `/api/collections` executed an `ALTER TABLE` plus eight collection UPSERTs on every GET.
- These database writes were happening on normal customer page loads.

v28:
- Removes schema/taxonomy writes from storefront GET requests.
- Schema/taxonomy setup remains an admin/init concern.
- Adds short CDN caching:
  - products: 15 seconds, stale-while-revalidate 60 seconds
  - collections: 5 minutes, stale-while-revalidate 30 minutes

## Add to bag
Previously each click:
1. fetched the entire `/api/products` list with `cache: no-store`,
2. waited for that request,
3. then added the item,
4. then synchronously rebuilt the cart and full product grid.

v28:
- Adds the item immediately using the stock already loaded on the page.
- Updates cart count/totals immediately.
- Refreshes live stock in the background and reconciles if stock changed.
- Defers full product-grid rerender to the next animation frame.
- Checkout remains the authoritative server-side stock validation.

All v23-v27 shipping, promo, Razorpay-cancel and session/cart fixes are preserved.
