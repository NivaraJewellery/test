# Nivara v15 launch fixes

- Promo eligibility now requires a signed-in customer with a verified email.
- Promo redemption is checked by customer account ID, verified email, and registered mobile number.
- Changing a mobile number cannot reset account/email promo redemption history.
- Existing promo rows remain compatible; the email column is added non-destructively.
- Shop by Category no longer renders the Explore Now arrow inside a span, eliminating the legacy global `.category span` overlay at its source.
- SMS/mobile verification remains disabled; email verification remains enabled.
- Includes v14 and earlier checkout/address/order-history fixes.
