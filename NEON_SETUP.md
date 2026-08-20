# Neon + Vercel Setup

Create a Neon project, then copy its pooled connection string into Vercel.

## Vercel Environment Variables

Add these in Vercel > Project > Settings > Environment Variables:

- `DATABASE_URL` - Neon pooled connection string
- `ADMIN_PASSWORD` - password for `admin.html`
- `RAZORPAY_KEY_ID` - Razorpay key id
- `RAZORPAY_KEY_SECRET` - Razorpay key secret
- `RESEND_API_KEY` - optional, for order and password reset emails
- `FROM_EMAIL` - optional sender email, for example `Nivara Jewellery <orders@yourdomain.com>`
- `ORDER_NOTIFY_EMAIL` - optional owner email, defaults to `nikkisakthi@gmail.com`
- `RESEND_ORDER_TEMPLATE_ID` - optional published Resend order confirmation template ID or alias
- `ESTIMATED_DELIVERY_DAYS` - optional delivery estimate in days, defaults to `7`

Redeploy after adding or changing environment variables.

## First Database Setup

After deployment:

1. Open `https://nivarajewellery.com/admin.html`
2. Login with `ADMIN_PASSWORD`
3. Click `Initialize database`

That creates the `products` and `orders` tables and imports the current 14 products.

## Daily Admin Work

Use `admin.html` to:

- add new products
- change product stock
- mark products sold out
- remove products from the shop

Customer purchases reduce stock automatically after Razorpay payment verification.

## Email

For emails, create a free Resend account and add `RESEND_API_KEY` in Vercel.
To use your published order confirmation template, also add `RESEND_ORDER_TEMPLATE_ID` in Vercel.
Estimated delivery is calculated as order confirmation date + `ESTIMATED_DELIVERY_DAYS`.

Emails supported:

- new order email to store owner
- order confirmation to logged-in customer
- password reset email
