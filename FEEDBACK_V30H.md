# Nivara Jewellery v30h — Complete Feedback System

Built on the working v30g post-payment-loader baseline.

## 1. Website experience feedback after purchase
- After payment succeeds, the existing confirmation loader and Order Summary still run first.
- About 3.5 seconds after the confirmed Order Summary appears, an optional Website Experience feedback modal opens.
- If the customer closes the Order Summary sooner, the feedback modal opens immediately after it closes.
- Four required 1–5 star questions:
  - Overall website experience
  - Finding and selecting products
  - Checkout and payment experience
  - Website speed and navigation
- Optional comments/suggestions field.
- One website-experience submission per paid order.
- Customers can choose “Maybe later”.

## 2. Customer feedback at the bottom of the website
- New “What Our Customers Say” section is placed immediately above the footer.
- It can show both approved website-experience comments and approved product reviews.
- Only approved feedback with a written comment is displayed publicly.
- Public names are shortened (for example, Priya S.) and email addresses are never shown.

## 3. Product review email when an order becomes Delivered
- In Reports/Admin, saving an order status as `Delivered` creates a secure one-time product-review link and emails it to the order customer.
- The email is sent only once per order. Saving Delivered again does not send a duplicate email.
- If email delivery fails or Resend is not configured, the Delivered status is still saved and saving Delivered again can retry the email.
- Review links expire after 90 days and can be submitted once.

## 4. Product review form
- New `/review` page loads the products from that paid order using the secure token.
- Customer gives each unique purchased product a required 1–5 star rating and an optional comment.
- Bangle size is shown when relevant.
- Submitted product reviews are pending approval by default.

## 5. Admin moderation
The Reports page now includes:
- Website experience feedback
- Product reviews
- Show on website / Hide from website controls
- All website question ratings, comments, order ID, customer and timestamp
- Product rating, comment, product, order ID, customer and timestamp

## Database
The following tables are created automatically when the feedback endpoints are first used:
- `website_feedback`
- `product_review_tokens`
- `product_reviews`

No manual Neon SQL migration is required.

## Email / URL configuration
- Existing `RESEND_API_KEY` and `FROM_EMAIL` settings are reused.
- Review URLs use `SITE_URL` or `PUBLIC_SITE_URL` if configured; otherwise the current production host is inferred from the admin request.
- Optional recommended production environment variable: `SITE_URL=https://nivarajewellery.com`

## Existing behavior preserved
The v30g baseline remains intact, including bangle size/UOM handling, stale-cart validation, checkout/order bangle size display, order emails, and the post-payment confirmation loader.
