# Order confirmation & history update
- SMS code is retained but disabled by default. Set `SMS_ENABLED=true` later to enable MSG91 sending (existing MSG91 variables are still used).
- After backend Razorpay signature verification, customers see an Order Confirmed summary.
- Order History is a separate customer popup. Clicking an order number opens its full summary.
- Order summary includes items, delivery details, payment reference, subtotal, promo discount and total.
- Download Order Summary creates a PDF file in the browser.
- The redundant logged-in top navigation Account/My Account link is hidden; Profile, Order History and Logout remain in the customer menu.
