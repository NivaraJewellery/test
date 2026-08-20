# Vercel Hobby Plan Function Consolidation

This build consolidates all Nivara API endpoints into a single Vercel Serverless Function so the project stays within the Hobby-plan function limit.

## What changed

- `api/index.js` is now the only deployable Serverless Function.
- Existing endpoint implementations were moved unchanged to `server/api/`.
- `vercel.json` rewrites the existing public API URLs (for example `/api/products`, `/api/create-order`, `/api/promo`) to the single router.
- Frontend API URLs remain unchanged, so no browser-side checkout, account, admin, promo, stock, email, or SMS flow needs to be changed.

## Expected Vercel function count

1 Serverless Function (`api/index.js`).

## Deployment

Push this project to GitHub and redeploy in Vercel. Existing environment variables for Neon, Razorpay, Resend, SMS, promo configuration, and admin access should remain configured exactly as before.
