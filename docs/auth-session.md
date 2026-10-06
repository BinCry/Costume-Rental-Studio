# Login, refresh and current user

All routes have prefix `/api/v1/auth`. Uses JWT_ACCESS_SECRET, JWT_ISSUER and JWT_AUDIENCE
already configured for registration. Refresh tokens are random opaque 256-bit values, not JWTs;
no additional refresh signing secret is needed. Responses use the existing `{ success, data, message }` envelope.

| API | Input | Result |
| --- | --- | --- |
| `POST /login` | email + password | Access JWT and safe user summary; refresh token in HttpOnly cookie |
| `POST /refresh` | refreshToken cookie, no body required | New access JWT and rotated HttpOnly cookie |
| `GET /me` | Authorization: Bearer accessToken | Safe user identity, active role assignments and their permissions |
| `POST /change-password` | Bearer access token + currentPassword + newPassword | Changes the password, revokes all refresh sessions and clears the refresh cookie |

## Login

```json
{ "email": "customer@example.com", "password": "<your-password>" }
```

Email is normalized to lowercase. Password is not trimmed and is bounded
to 128 characters. Unknown fields such as role/userId are rejected. Argon2id verifies users.passwordHash.
Missing account, passwordless/Google-only account, wrong password, non-ACTIVE account or
non-ACTIVE employee all return the same 401 INVALID_CREDENTIALS. Pending employees still
need the future Google activation flow, not this password endpoint.

Successful login updates lastLoginAt, records AUTH_LOGIN and creates a refresh session atomically.
New registration/account claiming also issues both tokens.

Example response data:

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "refreshExpiresIn": 604799,
  "user": {
    "id": "<uuid>", "displayName": "Customer",
    "phone": "+84901234567", "email": null
  }
}
```

## Refresh

The browser sends the `refreshToken` cookie automatically. Login and registration set this
cookie; refresh rotates it. Refresh tokens are no longer returned in JSON or accepted from
the request body.

No access JWT is required; refreshing works even after access JWT expiry. On success, replace
the access JWT in memory; the browser updates the cookie. Only SHA256(refreshToken) is stored in refresh_sessions.
Each refresh marks the old row usedAt and inserts a replacement in the same familyId, within
one transaction. A PostgreSQL advisory lock serializes operations for that family.

The family expires seven days after login/registration. Refresh does not extend that deadline.
Using a consumed/revoked token revokes all tokens in that family and returns 401 INVALID_REFRESH_TOKEN.
Expiry, account locks and inactive employment also deny refresh. A different login has its own
family and is not revoked by replay in this family. Concurrent refresh requests using one token
are treated as replay: clients must serialize refresh, not send it twice or blindly retry after
an ambiguous network failure. Log in again if rotation cannot be recovered.

Refresh requests inside the final five seconds of the absolute expiry are rejected as expired. This
avoids creating a replacement row that would violate the database expiry constraint while the
transaction is committing.

Revoking refresh tokens does not immediately invalidate already-issued stateless access JWTs;
they last up to 15 minutes. Middleware rechecks user status on every authenticated request.
Password recovery is available through `/forgot-password`, `/verify-reset-otp` and `/reset-password`.
Google login is documented in [Google OAuth login](auth-google.md).

## Change password

`POST /api/v1/auth/change-password` requires an access JWT and accepts `currentPassword` plus a
12-to-128-character `newPassword`. It verifies the current Argon2id hash, rejects an unchanged
password, hashes the replacement before opening the database transaction, and serializes the
credential update with session issuance for that user. A successful update revokes every refresh
session and clears the refresh cookie. The client must also discard its in-memory access token and
return to login; already-issued stateless access JWTs remain usable for at most their 15-minute
lifetime.

## Me

Send `Authorization: Bearer <accessToken>`. Returns id, displayName, email, phone, avatarUrl,
status, emailVerifiedAt and roles. Each role includes roleCode, name, actorGroup, branchId and
permission code/scope. Inactive roles/branches are omitted; employee roles are omitted without
active employment. The list is current DB assignments, not a substitute for server-side authorization.
No passwordHash, OTP hash, refresh hash, internal customer notes or raw Prisma user objects are returned.
Missing/invalid/expired JWT or inactive user returns 401.

## Session management

Each login or registration creates a new refresh-token family. The family is associated with
optional client metadata (`deviceId`, `deviceName`) and server-derived `userAgent` and IP.
Metadata is informational; it is not used as an authentication factor. Rotated tokens keep the
same family and absolute expiry, while the latest token carries the latest request IP and
User-Agent.

### List sessions

`GET /api/v1/auth/sessions` requires an access JWT and returns active sessions owned by the user.
The response contains the family ID, device metadata, family creation time, last rotation time
and absolute expiry. Raw refresh tokens and token hashes are never returned.

### Logout and revoke

`POST /api/v1/auth/logout` reads the refresh cookie, revokes its entire family and clears the
cookie. A missing cookie is a successful no-op. Logout-all also clears the current cookie.
Invalid refresh requests returning 401 clear the cookie; transient server errors preserve it.

`DELETE /api/v1/auth/sessions/:sessionId` requires an access JWT and revokes only the selected
family after checking ownership. `POST /api/v1/auth/logout-all` revokes every family belonging to
the authenticated user.

If an old refresh token is used again, the server treats it as replay and revokes the whole family.
A replay in one family does not revoke sessions from another login/device. Clients must serialize
refresh requests; simultaneous use of one token follows the strict replay policy and can require
the user to log in again.

## Operations and security

- Apply the reviewed migration with `pnpm exec prisma migrate deploy` in apps/api; implementation
  does not automatically apply it or reset existing data.
- Login and refresh share a per-IP allowance of 10 requests per 15 minutes. Me uses the general
  API rate limit. Configure trusted proxy hops correctly for Coolify; distributed limits and
  per-account abuse controls remain required before multi-instance public production use.
- Token and me responses use Cache-Control: no-store. Use HTTPS and never log raw tokens/passwords.
- The refresh cookie is host-only, HttpOnly, SameSite=Lax, with Path=/api/v1/auth and a lifetime
  limited to the remaining absolute session expiry. Secure is enabled in production (HTTPS required).
  Frontend and API must be same-site for this cookie policy, such as app.example.com and api.example.com.
  Authentication writes reject Origin headers that differ from WEB_URL, and reject cross-site
  browser requests without Origin. Non-browser clients without Origin remain supported.
- Frontend login/register/refresh/logout requests must use fetch `credentials: 'include'`
  or Axios `withCredentials: true`. Access JWT remains in JSON and uses Authorization: Bearer.
  Existing clients reading refreshToken from JSON must migrate to cookies.
- Keep used/revoked session rows until their family expires; expired-family cleanup is not automated.
- The one-active-token-per-family partial index is migration-managed SQL and must be preserved when
  recreating or deploying the database.
- Tests cover service logic and HTTP behavior with a transactional test double; database lock
  behavior and migration application must also be tested against a disposable PostgreSQL instance.
