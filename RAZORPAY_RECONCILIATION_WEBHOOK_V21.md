# Razorpay reconciliation + webhook (v21)

## Fix for an already captured payment stuck as pending_payment
1. Deploy v21.
2. Open `reports.html` and login as admin.
3. In **Reconcile captured Razorpay payment**, enter the Razorpay `order_...` ID and `pay_...` Payment ID.
4. Click **Verify & reconcile payment**.
5. The backend fetches the payment directly from Razorpay and only proceeds when:
   - payment status is `captured`
   - Razorpay Order ID matches the local order
   - paid amount matches the local order amount
6. If valid, the existing Nivara finalization transaction runs once: promo redemption (if used), stock deduction, payment ID save, status -> `open`, confirmation notifications.

Do not manually edit only the order status in Neon.

## Webhook setup to prevent future missed confirmations
Add a new Vercel environment variable:

`RAZORPAY_WEBHOOK_SECRET=<your own strong webhook secret>`

Then in Razorpay Dashboard create a webhook pointing to:

`https://nivarajewellery.com/api/razorpay-webhook`

Use the exact same webhook secret in Razorpay and Vercel.
Enable these events:
- `payment.captured`
- `order.paid`

Redeploy after adding the environment variable.

The webhook signature is verified against the raw request body. Processing is idempotent: if browser verification already finalized the order, webhook retries do not deduct stock twice.
