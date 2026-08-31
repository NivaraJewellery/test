# Post-payment order loader — v30g

Added a full-screen confirmation loader immediately when Razorpay returns a successful payment response.

Flow: Payment successful -> loader -> server verification/order preparation -> Order Summary.

Loader text:
- Payment successful
- Confirming your order...
- Please don’t close this window.

The loader remains visible through verification, product refresh and summary preparation. It closes only after the order summary is opened, or if verification fails.
