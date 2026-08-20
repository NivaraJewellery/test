# Checkout review update

The bag remains the place to review/remove items. Clicking **Secure checkout** now opens a separate Nivara-styled checkout review panel inspired by the reference provided.

The panel includes:
- Order summary and item count
- Product list with quantity and line price
- Compact promo-code field with Apply/Remove
- Dynamic promo percentage and discount amount
- Logged-in customer/mobile summary (or guest checkout notice)
- Subtotal and final payable total
- Secure payment message and Continue to payment button

The existing Razorpay payment flow, promo validation, stock validation, guest checkout, and server-side order logic are unchanged.


## Follow-up UI fixes
- Promo entry removed from the bag drawer; promo can be entered only in checkout review.
- Bag drawer is positioned below the live announcement/promotion banner using the banner's measured height.
- Hidden promo/total rows remain hidden when no promo is applied.
