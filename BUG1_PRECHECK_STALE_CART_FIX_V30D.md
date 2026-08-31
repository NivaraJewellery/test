# Bug 1 follow-up – stale cart pre-check (v30d)

Scope: Bug 1 only.

## Scenario fixed
A customer can add two different bangle products (for example both size 2.8), then an admin can delete one product or its selected 2.8 variant before the customer clicks Secure checkout. Previously, if the customer was already signed in, the storefront could open checkout using the stale local cart because live product validation only ran during the post-login resume flow.

## Change
`startCheckout()` now forces a fresh `/api/products` validation before every normal Secure checkout attempt.

- Deleted product: the exact cart line is removed; checkout does not open.
- Deleted selected bangle size/UOM: only that selected variant line is removed; another size is never substituted.
- Out-of-stock item/variant: removed; checkout does not open.
- Quantity reduced by admin stock: cart quantity is corrected; customer is asked to review the bag before continuing.
- Live product API cannot be verified: checkout is blocked instead of using fallback data.
- Post-login resume avoids a redundant second fetch because it has already completed the same live validation.

This update does not include the separate mandatory UOM-row or stock-breakup validation work.
