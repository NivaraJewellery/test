# Login to Checkout Loader - v18

Added a visible full-page transition loader for the authenticated checkout handoff.

Flow:
- Logged-out customer clicks Secure checkout -> login page.
- Login button immediately changes to `Signing in...` while authentication runs.
- After successful login, a full-page `Preparing your checkout` loader is shown before redirect.
- On the storefront, the loader remains visible while products and saved delivery addresses are loaded.
- The loader closes only when the Address popup or Checkout Review is ready.
- Authentication failures restore the Login button and do not leave the loader visible.
