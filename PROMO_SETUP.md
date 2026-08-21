# Nivara launch promo — NIVARA5

## Offer
- Code: `NIVARA5`
- Discount: 5% off product subtotal
- TEST BUILD START: 20 Aug 2026, 12:00 AM IST (enabled now)
- Ends: 23 Aug 2026, 11:59 PM IST
- TEST server-side UTC window: 2026-08-19T18:30:00Z through 2026-08-23T18:30:00Z (end is exclusive)
- FINAL launch start to restore after testing: 21 Aug 2026, 5:00 PM IST / 2026-08-21T10:30:00Z

## Eligibility rules implemented
1. Customer must be signed in.
2. Customer must have a verified registered mobile number.
3. Code is case-insensitive and whitespace is ignored.
4. Date/time is enforced by the server, not the browser clock.
5. One successful redemption per customer account.
6. One successful redemption per normalized mobile number.
7. If a customer changes their mobile after using the code, their customer ID still blocks a second use.
8. If another account later registers the previously used mobile, the mobile number also blocks a second use.
9. Promo is reserved during Razorpay checkout to reduce simultaneous/double-redemption attempts; closing the payment modal releases the reservation.
10. Discount is calculated again on the server from live product prices, never trusted from the browser.

## Optional Vercel environment variables
Defaults are already built in. Only set these if you want to change the offer:
- `LAUNCH_PROMO_CODE=NIVARA5`
- `LAUNCH_PROMO_PERCENT=5`
- `LAUNCH_PROMO_START=2026-08-19T18:30:00.000Z` (TEST)
- Final launch value: `LAUNCH_PROMO_START=2026-08-21T10:30:00.000Z`
- `LAUNCH_PROMO_END=2026-08-23T18:30:00.000Z`
- `PROMO_RESERVATION_MINUTES=30`

## Pre-launch testing
This package is intentionally PROMO-ENABLED NOW for testing. Do not use this exact build for the final launch. After testing, restore the start to `2026-08-21T10:30:00.000Z` (21 Aug, 5:00 PM IST) in both `app.js` and the server environment/default.

If Vercel already has a `LAUNCH_PROMO_START` environment variable, it overrides the backend default. Set that Vercel variable to `2026-08-19T18:30:00.000Z` while testing, then restore it to `2026-08-21T10:30:00.000Z` before launch.

## Database
`api/admin-init.js` creates the `promo_redemptions` table. The promo API also creates it defensively when first used, so an existing database does not require a destructive reset.

## Launch routing
`vercel.json` now routes `/` to `index.html`. The maintenance page is still available at `/maintenance`.
