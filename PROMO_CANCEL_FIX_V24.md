# Promo cancellation fix v24

Fixes the launch-promo reservation remaining blocked after a customer closes
the Razorpay payment window.

What changed:
- Razorpay `ondismiss` now waits for `/api/cancel-order`.
- The cancellation request uses `keepalive: true`.
- If cancellation fails, the browser calls `/api/promo-release` as a fallback.
- `/api/cancel-order` always attempts promo release and reports `promoReleased`.
- Expired promo reservations are automatically removed when eligibility is checked.
- Successful payment behavior is unchanged: the promo is redeemed normally.
- Shipping-charge changes from v23 are preserved.

Acceptance test:
1. Apply NIVARA5.
2. Continue to Razorpay.
3. Close/cancel Razorpay.
4. Start another checkout.
5. Apply NIVARA5 again.
6. Expected: promo applies successfully; no HTTP 409 reservation error.
