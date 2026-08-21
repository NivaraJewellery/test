# Mobile UI Fix v20

- Shop by Category mobile cards now show the full image using a square image area and `object-fit: contain`.
- Removed mobile image padding/cropping behavior so category images match the desktop presentation more closely.
- Checkout review now uses the dynamic mobile viewport (`100dvh`).
- Checkout content is independently scrollable, so customer details, bill summary, totals, and delivery address remain reachable above the payment footer.
- Payment footer remains visible without permanently covering checkout content.
