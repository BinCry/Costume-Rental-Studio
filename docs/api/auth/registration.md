# Customer registration and counter-account claim

These public APIs do not require JWT. They never accept role, userId, customerId or unverified email.

| API | Purpose |
| --- | --- |
| `POST /api/v1/auth/register/otp` | Request email verification; returns challengeId, not the OTP |
| `POST /api/v1/auth/register` | Verify OTP, create or claim a customer, set password and issue a 15-minute JWT |

Request OTP:

```json
{ "email": "customer@example.com" }
```

Register using the returned challengeId:

```json
{
  "email": "customer@example.com",
  "challengeId": "<returned-uuid>",
  "otp": "<six-digit-code>",
  "displayName": "Nguyen Van A",
  "password": "<12-to-128-character-password>",
  "preferredBranchId": "<optional-active-branch-uuid>"
}
```

Email is normalized to lowercase. New email: creates users + customers, stores passwordHash and emailVerifiedAt in users, and assigns the
global CUSTOMER role (201). Existing ACTIVE counter customer with no login credentials or
employee/non-customer role: retains the original userId, profile and rental history, and adds
passwordHash and emailVerifiedAt on users (200). Existing password/Google identity, locked account or employee:
409, never overwrites credentials. Existing profile fields are not overwritten by registration.
An account with Google already linked must use its existing login, not claim through this API.

Response data includes created, customer, accessToken, tokenType=Bearer,
expiresIn=900 and refreshExpiresIn (approximately 604800 seconds).
Refresh token is delivered in an HttpOnly cookie (Secure in production, SameSite=Lax,
Path=/api/v1/auth), not in JSON. Browser requests must use credentials: 'include'.
Password and OTP hashes are never returned. A successful registration and audit entry commit
atomically. Only CUSTOMER is assigned, regardless of caller input.

## Configuration and migration

Set independent random secrets JWT_ACCESS_SECRET and OTP_HASH_SECRET (at least 32 characters).
JWT_ISSUER and JWT_AUDIENCE must match auth middleware. Apply the CUSTOMER core role before use.
Requesting an OTP requires OTP_HASH_SECRET; completing registration also requires
JWT_ACCESS_SECRET because successful registration issues access and refresh tokens.
Apply the reviewed additive migration with `pnpm exec prisma migrate deploy` from apps/api.
The implementation does not automatically apply this migration.

The forward migration `20261003010000_user_password_fields` copies existing credentials into users
before dropping password_credentials. Earlier migrations stay unchanged, whether already applied
or pending. passwordHash and emailVerifiedAt are nullable for counter/Google-only accounts.
Changing users.email must clear emailVerifiedAt until the new email is verified; no email-change
API is implemented yet. Password hashes must never be included in public user responses.

For local development only: NODE_ENV=development and OTP_DELIVERY_MODE=console. The code appears
in the API terminal, never the HTTP response. Default mode is disabled. Production and test mode
cannot deliver OTP via console. No real email provider is configured yet: integrate a provider in
otp.delivery.ts before enabling real registration. This is not production-ready email delivery.

## Protection and scope

- OTP expires after 5 minutes; 5 failed attempts; 60 seconds between requests; single use.
- Per-IP limit: 10 registration/OTP requests total per 15 minutes (in-process limiter).
- HMAC-SHA256 OTP storage; Argon2id password storage; PostgreSQL transaction phone lock.
- Delivery failure leaves the challenge unusable. Resend invalidates the previous UUID/code.
- Missing secrets or delivery provider: 503. Bad/expired/reused OTP: 400. Cooldown/rate limit: 429.
- A conditional users update (matching phone and passwordHash=null) rejects concurrent overwrite.
  Login, refresh and me are documented in [Auth sessions](session.md).
  Password recovery, logout and Google linking endpoints are not implemented yet.

Before production, configure trusted proxy hops for the actual deployment (do not blindly trust
all proxies), distributed rate limiting for multiple instances, SMS abuse controls, and retention/
cleanup for expired challenges. DB integration/concurrency testing remains separate from mocked
unit/HTTP tests. Public account claiming relies on possession of the recorded phone; recycled
phone-number risk requires an additional recovery policy if long-lived customers are supported.
