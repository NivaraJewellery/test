# Promo testing build — ENABLED NOW

This build intentionally enables `NIVARA5` before the planned launch time so the complete promo flow can be tested.

## Test window
- Start: 20 Aug 2026, 12:00 AM IST
- End: 23 Aug 2026, 11:59 PM IST
- Discount: 5%
- Code: `NIVARA5`

## Important before launch
Restore the production start to:
- IST: 21 Aug 2026, 4:00 PM
- UTC: `2026-08-21T10:30:00.000Z`

If Vercel has `LAUNCH_PROMO_START` configured, it overrides the backend default. For this test, temporarily set it to `2026-08-19T18:30:00.000Z`. After testing, restore it to `2026-08-21T10:30:00.000Z`.
