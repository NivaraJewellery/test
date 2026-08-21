# Email verification update (v14)

- Mobile OTP verification is disabled.
- New accounts now receive a 6-digit verification code at the signup email address.
- A new account cannot log in until its email has been verified.
- Existing customer accounts remain compatible: the new `email_verified` column defaults to true for existing rows.
- Changing a mobile number in Profile no longer triggers OTP; uniqueness validation is still enforced.
- Promo eligibility no longer requires `phone_verified`; it still requires a valid registered mobile number and a verified email for newly-created accounts.
- Existing mobile OTP database columns are retained for backward compatibility but are no longer used by the active flow.
