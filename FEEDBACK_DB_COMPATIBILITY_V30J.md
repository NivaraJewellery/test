# Feedback DB Compatibility Fix — v30j

- Fixes production Reports error: `column "razorpay_order_id" does not exist`.
- Root cause: older feedback/review tables can already exist in Neon; `CREATE TABLE IF NOT EXISTS` does not add newer columns.
- `ensureFeedbackTables()` now performs additive, idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` upgrades for all feedback/review tables.
- Existing feedback and product reviews are preserved; tables are not dropped or recreated.
- Adds safe unique indexes for current feedback/review identities.
- Keeps all v30i carousel, publish/hide, Delivered-email, bangle, checkout, and payment-loader behavior unchanged.
