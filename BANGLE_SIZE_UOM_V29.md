# Nivara Jewellery v29 — Bangle Size + UOM

Adds optional product size variants without changing normal product behaviour.

- Admin can add multiple sizes per product.
- UOM options: CM, Inch, MM.
- Stock is maintained per size variant.
- Variant products show a mandatory size selector before Add to bag.
- Bag, checkout and stored order preserve Size + UOM.
- Paid-order finalization deducts stock only from the purchased size.
- Existing products without variants continue to use the original single stock field.
- Database table `product_variants` is created automatically by the product/admin APIs and by Initialize database.
