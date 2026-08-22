# Session startup cart fix v26

Root cause found in the deployed v25 source:
there was a second session-expiry check during storefront startup:

    if (isCustomerSessionExpired()) {
      clearCart();
      clearCustomerSession();
    }

So even though v25 fixed `ensureActiveCustomerSession()`, a reload/return to the
storefront could still erase `nivara-cart` before the promo Apply handler ran.

v26 removes that startup `clearCart()` call.

Expected behavior:
- Expired login session clears authentication only.
- Shopping bag remains in localStorage and on the storefront.
- Customer can log in again and resume checkout.
- Re-applying NIVARA5 after cancelling Razorpay reaches `/api/promo`.
- v24 promo-release and v23 shipping-charge fixes are preserved.
