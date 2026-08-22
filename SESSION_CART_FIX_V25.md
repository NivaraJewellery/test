# Session/cart preservation fix v25

Fixes the cancelled-payment scenario where a customer returned from Razorpay,
tried to re-apply a promo, and the browser reported that the bag was empty even
though the checkout UI still showed products.

Root cause:
- Customer sessions expire after 30 minutes.
- `ensureActiveCustomerSession()` previously called `clearCart()` when the
  session expired.
- That emptied the JavaScript/localStorage cart before the promo API call, while
  the already-rendered checkout modal could still display old line items.

Changes:
- Session expiry no longer clears the cart.
- Expiry clears only customer authentication and tells the customer the bag was kept.
- Starting checkout refreshes the customer session.
- Cancelling/dismissing Razorpay refreshes the customer session after promo/order release.
- v24 promo-release behavior is preserved.
- v23 shipping-charge behavior is preserved.

Acceptance test:
1. Add products and apply NIVARA5.
2. Continue to Razorpay.
3. Cancel/close Razorpay.
4. Return to checkout.
5. Confirm the bag still contains the products.
6. Apply NIVARA5 again.
7. Expected: `/api/promo` is called and the promo applies successfully.
