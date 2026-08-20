# Razorpay Setup for Nivara Jewellery

Add these environment variables in Vercel before testing checkout:

1. Open the Vercel project.
2. Go to Settings > Environment Variables.
3. Add:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
4. Use Razorpay Test Mode keys first.
5. Redeploy after adding the variables.

The website creates Razorpay orders through `/api/create-order`.
The secret key is used only inside Vercel's serverless API and is not exposed in browser JavaScript.

When you are ready for real payments:

1. Switch Razorpay Dashboard to Live Mode.
2. Generate Live Mode API keys.
3. Replace the Vercel environment variables with the live keys.
4. Redeploy.
5. Make a small real payment test.
