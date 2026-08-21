Nivara checkout-login fix

Replace these two files in the test application root:
- account.html
- account.js

Fixes:
1. Prevents login submission until account.js has attached its submit handler.
2. Adds POST as a defensive form fallback so credentials are never put in the URL by native GET submission.
3. Uses an absolute /account.js script path.
4. Preserves ?return=checkout and redirects successful login to /?checkout=1.

After deploying, run:
npx.cmd playwright test tests/checkout-auth.spec.js --project=desktop-chromium --headed --workers=1

Security check: the browser URL must never contain email= or password=.
