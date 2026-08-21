# No Guest Checkout — v17

- Secure checkout now requires sign-in.
- Anonymous customers are redirected to `account.html?return=checkout`.
- After successful login (or completed signup/email verification), the customer returns automatically to checkout.
- Checkout resumes with the saved-address rules: 0 = add address, 1 = use directly, 2+ = select address.
- Guest checkout form and guest order creation are disabled.
- Server-side order creation now rejects unauthenticated/unknown customer payloads and requires a saved delivery address.
