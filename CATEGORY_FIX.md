# Category correction

This build keeps the storefront categories aligned with the original Nivara Jewellery setup.

The temporary test categories from the previous build are no longer used:

- `Bracelet` -> `Anti Tarnish Bracelet`
- `Pendant & Chain` -> `Anti Tarnish Chain`
- `Ornament` -> `Hair Accessories`

The original category set remains:

- Necklace
- Hair Accessories
- Temple Collections
- Premium Collections
- Nethi Chutti / Maang Tikka
- Anti Tarnish Bracelet
- Anti Tarnish Chain
- AD Stone Collections

## Existing test database

If the previous build was already initialized against Neon, run the admin database initialization once after deploying this build. It will move products from the three temporary categories into the original Nivara categories and deactivate the temporary categories. It does not reset product stock or orders.
