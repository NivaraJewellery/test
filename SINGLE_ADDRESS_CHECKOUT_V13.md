# Single Address Checkout Update - v13

For signed-in customers, Secure Checkout now follows this flow:

- No saved addresses: open the delivery-address popup and prompt the customer to add one.
- Exactly one saved address: select it automatically and open Checkout Review directly.
- Two or more saved addresses: open the delivery-address popup so the customer can choose.

Checkout Review still includes the Change delivery address action, so a customer with one saved address can add or select another address when needed.
