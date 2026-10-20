# Nivara Jewellery Build V31 — Website Traffic

Adds privacy-conscious first-party traffic analytics to the existing admin dashboard.

## Admin dashboard
- Today's unique visitors
- Today's page views
- Daily visitor/view table
- 7 / 30 / 90 day selector
- Top pages
- Traffic sources/referrer domains
- Device split (Mobile / Tablet / Desktop)
- All dates use India Standard Time (Asia/Kolkata)

## Tracking
- Starts collecting only after this build is deployed; it cannot reconstruct earlier traffic.
- Admin, reports and notify pages are excluded.
- Uses a random browser visitor ID and stores only a one-way HMAC hash in Neon; it does not store the visitor's IP address in the analytics table.
- The `website_traffic` table and index are created automatically on first traffic request.

## Environment variables
No new variable is required. It uses the existing `DATABASE_URL` and admin authentication. For stronger separation you may optionally set `TRAFFIC_HASH_SECRET` to a long random secret.
