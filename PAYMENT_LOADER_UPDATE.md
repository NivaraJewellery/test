# Payment loader update

When the customer clicks **Continue to payment** on the checkout review screen:

- The button is immediately disabled.
- A spinner is shown with **Preparing secure payment...**.
- The checkout review remains visible while the server creates the Razorpay order.
- The review closes only when the Razorpay payment window is ready to open.
- If order creation fails, the loader stops and the checkout review remains available for retry.

This prevents repeated clicks and gives the customer clear feedback during the few-second payment handoff.
