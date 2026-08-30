# Bug 1 fix — checkout return after a product is removed

This build is based on the bangle size/UOM v29 build and changes only the
storefront checkout-return/product-loading flow in `app.js`.

Fixed scenario:
1. Guest adds a product to the bag.
2. Guest clicks Secure checkout and is sent to login.
3. Admin removes/deactivates that product before the guest signs in.
4. Customer signs in and returns to the storefront.

Expected result after this fix:
- The checkout return performs a fresh product/collection fetch instead of
  trusting a cached storefront response.
- The deleted/unavailable item is removed from the bag.
- After the checkout loader closes, the customer sees a warning explaining
  that the item is no longer available and was removed.
- Product and category sections still render if one storefront endpoint has a
  temporary failure; categories fall back to the currently loaded product
  data.
- The `nivara-return-to-checkout` flag and `?checkout=1` URL marker are consumed
  before network loading. A failed request, refresh, or logout can therefore
  no longer reopen the "Preparing for checkout" loader indefinitely.
- Checkout is not resumed when the live product API could not be verified.

No admin size/UOM validation, stock-breakup validation, or payment-flow changes
are included in this build. Those remain for separate fixes.
