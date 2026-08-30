# Nivara v30 - Bangle checkout and validation fixes

1. Cart reconciliation now removes deleted, inactive, out-of-stock, or invalid legacy size-less bangle lines and shows the customer a clear message after login/return to checkout.
2. Bangle Size / UOM / Quantity rows are mandatory. Supported UOM values: CM, Inch, MM.
3. Bangle total Stock must exactly match the sum of all Size/UOM quantities. Validation is enforced in both Admin UI and backend API.
4. Checkout no longer allows legacy bangle cart lines without a valid variant. Customers are asked to add the bangle again with a size. Checkout summary now displays selected Size and UOM.
5. Server checkout returns a clear error when a cart product was removed from Admin instead of silently skipping it.

Existing non-bangle products continue to use normal stock behavior.
