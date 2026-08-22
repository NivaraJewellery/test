# Promo re-apply fix v27

Root cause:
- `/api/cancel-order` released the promo reservation correctly.
- But the browser variable `appliedPromo` remained set after Razorpay was cancelled.
- `applyPromoCode()` begins with:
      if (appliedPromo) {
        resetAppliedPromo(...);
        renderCart();
        return;
      }
  Therefore the next click on "Apply" was treated as a remove action and returned
  before making `/api/promo`. That is why the Network tab showed no promo request.

Fix:
- On Razorpay `ondismiss`, after releasing the pending order/promo reservation,
  clear the browser-side promo state with `resetAppliedPromo(...)`.
- Re-render the cart so the button/input/status reflect the cleared state.
- The next click on Apply now executes the normal `/api/promo` validation request.

v26 session/cart preservation, v24 promo-release and v23 shipping-charge changes
are all preserved.

Acceptance:
1. Apply NIVARA5.
2. Continue to Razorpay.
3. Close/cancel Razorpay.
4. Reopen checkout/bag.
5. Enter NIVARA5 and click Apply.
6. Expected: a POST `/api/promo` request is sent and the 5% discount is applied.
