# Shipping charge update v23

- Standard shipping charge: ₹99.
- Free shipping when product subtotal is ₹1,999 or higher.
- Free-shipping eligibility is based on product subtotal before promo discount.
- Promo discount applies to product subtotal only.
- Grand total = subtotal - promo discount + shipping.
- Razorpay amount is calculated server-side using the same rule.
- New orders store `shipping_charge` in the orders table and shipping metadata in the order payload.
- Cart, checkout review, order summary, Admin Reports API/listing, payment confirmation response and confirmation email expose the shipping value.
- Existing orders default to `shipping_charge = 0` when the new column is introduced.
