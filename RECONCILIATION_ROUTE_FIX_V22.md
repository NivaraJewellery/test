# Razorpay reconciliation route hotfix — v22

## Root cause
v21 added the reconciliation and webhook handlers to `api/index.js`, but `vercel.json` did not contain rewrites for their public URLs. On Vercel, `/api/admin-reconcile-payment` therefore returned a non-JSON 404 page, which the Reports page attempted to parse as JSON.

## Fix
- Added `/api/admin-reconcile-payment` -> `/api?route=admin-reconcile-payment`.
- Added `/api/razorpay-webhook` -> `/api?route=razorpay-webhook`.
- Hardened Reports API parsing so a future non-JSON API response shows a useful HTTP error instead of `JSON.parse: unexpected character`.

## Existing captured order
After deploying v22, use Admin > Reports > Reconcile captured Razorpay payment with the existing `order_...` and `pay_...` IDs. The server verifies the captured payment against Razorpay before finalizing the local order.
