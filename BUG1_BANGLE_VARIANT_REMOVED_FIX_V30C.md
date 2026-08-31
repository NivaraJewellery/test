# Bug 1 follow-up: selected bangle size removed while customer is signing in

Fixes:
- A cart line is validated by selected Size + UOM as well as variant id.
- If that exact size is removed/out of stock while the customer is on login, it is removed from the bag and another size is never substituted automatically.
- If the bag changes while the customer is away (removed item or reduced quantity), automatic checkout resume is stopped so the customer can review the updated bag.
- Admin variant saves now preserve database ids for unchanged Size + UOM rows, instead of deleting and recreating every variant.
- Create-order also rejects stale/mismatched size/UOM selections server-side.
