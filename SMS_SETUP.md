# Nivara Jewellery - Order Confirmation SMS Setup

The project now sends an SMS to the customer after a Razorpay payment is successfully verified and stock is committed.

## Provider used

MSG91 Flow API is integrated because it supports India transactional SMS/DLT flows.

## 1. Create the SMS template/flow in MSG91

Create a transactional SMS Flow with these exact variable names (they are case-sensitive):

- `Customer_Name`
- `Order_Number`
- `Amount`
- `Estimated_Delivery_Date`

Suggested message:

`Hi ##Customer_Name##, your NIVARA order ##Order_Number## for Rs. ##Amount## is confirmed. Estimated delivery: ##Estimated_Delivery_Date##. Thank you for shopping with NIVARA Jewellery.`

For Indian SMS delivery, complete the required DLT registration/template mapping in MSG91.

## 2. Add Vercel environment variables

Add these in Vercel -> Project -> Settings -> Environment Variables:

- `MSG91_AUTH_KEY` - your MSG91 authentication key
- `MSG91_FLOW_ID` - the Flow ID created for the order-confirmation message
- `MSG91_SENDER_ID` - optional if the sender is already fixed in the MSG91 Flow

Redeploy after adding/changing environment variables.

## 3. Test

1. Use a test product with stock = 1 or 2.
2. Complete a Razorpay test payment using a customer phone number.
3. After payment verification, the order email is sent and the SMS call runs.
4. If MSG91 is not configured, checkout still succeeds; SMS is deliberately skipped so an SMS-provider issue cannot turn a successful payment into a failed checkout.

## Stock race-condition test

To test the sold-out warning with stock = 1:

1. Open the website in Browser A and Browser B.
2. Both users view the same product while stock shows 1.
3. Browser A completes the purchase.
4. In Browser B, click `Add to bag` without refreshing.
5. Browser B re-checks `/api/products` before adding and should show:
   `This item has just sold out. Please refresh the page to see the latest availability.`
