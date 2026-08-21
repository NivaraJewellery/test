# Category completeness fix — v16

The public collections API now safely ensures the original Nivara category taxonomy exists on every deployment, even when the production database was initialized by an older build.

Canonical categories:
- Necklace
- Hair Accessories
- Temple Collections
- Premium Collections
- Nethi Chutti / Maang Tikka
- Anti Tarnish Bracelet
- Anti Tarnish Chain
- AD Stone Collections

This uses idempotent inserts and does not delete products, orders, customers, stock, addresses, or existing category images.
