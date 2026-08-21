# Nivara Jewellery v11 — checkout/address changes

Implemented from the voice-session scope:

- Logged-in checkout no longer opens Profile for missing address.
- Dedicated delivery-address popup is shown before checkout review.
- Multiple saved addresses are supported: add, edit, delete, set default, select for checkout.
- Checkout review shows the selected delivery address with a Change delivery address action.
- OTP is not part of checkout.
- Signup mobile-verification flow remains in the signup page.
- Profile no longer contains an embedded OTP/address form.
- Changing the mobile number in Profile starts a separate verification popup; the number changes only after OTP verification.
- Existing single legacy customer addresses are migrated into the new customer_addresses table automatically, without deleting the legacy fields.
- Cancelled Razorpay attempts are marked cancelled and excluded from Order History. Order History also filters out all records without a verified Razorpay payment id.
- Shop by Category legacy image overlay pseudo-elements are force-disabled.
- SMS integration remains present but disabled unless SMS_ENABLED=true.

Production data safety:
- No destructive table reset is performed by these changes.
- Existing customers and paid orders are preserved.
- The new customer_addresses table is additive and legacy address data is copied only when a customer has no saved-address rows yet.
