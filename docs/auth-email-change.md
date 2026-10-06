# Authenticated email change

Both routes use the `/api/v1/auth` prefix, require a valid access JWT, reject untrusted browser
origins, apply an authentication rate limit, and return `Cache-Control: no-store`.

| API | Input | Result |
| --- | --- | --- |
| `POST /change-email/otp` | `newEmail`, `currentPassword` | Sends an OTP to the normalized new email and returns a challenge ID |
| `POST /change-email/confirm` | `challengeId`, six-digit `otp` | Changes the verified email, revokes sessions and clears the refresh cookie |

## Request an email change

The request route verifies the current Argon2id password before creating a challenge. The new
email must differ from the current address and must not belong to another user. The OTP is valid
for five minutes, allows five failed attempts, and has a sixty-second resend cooldown. Only an
HMAC-SHA256 hash bound to the challenge ID, user ID, target email and `email-change` purpose is
stored. The current `users.email` value remains unchanged until confirmation succeeds.

In local development, OTP delivery uses the existing console delivery mode. Production still
requires a real email provider.

## Confirm the new email

Confirmation locks authentication for the user and the target email, then rechecks challenge,
account and email ownership state inside one transaction. A wrong OTP increments `attempt_count`.
A successful confirmation updates `users.email` and `email_verified_at`, consumes the challenge,
deletes password-reset challenges issued to the old address, and revokes every refresh session.

The client must discard its in-memory access token and return to login using the new email.
Already-issued stateless access JWTs remain valid for at most their fifteen-minute lifetime.

Password changes and password resets delete pending email-change challenges because those
challenges were authorized using the previous password.
