# Google OAuth login

All routes use prefix `/api/v1/auth`. Google login uses Authorization Code flow with PKCE,
`state` and OpenID Connect `nonce`. The API does not persist Google access or refresh tokens.

| API | Result |
| --- | --- |
| `GET /google` | Sets a short-lived HttpOnly flow cookie and redirects to Google |
| `GET /google/callback` | Verifies Google, creates/links the account, sets the internal refresh cookie and redirects to the frontend |

## Browser flow

```text
Frontend navigates to GET /api/v1/auth/google
→ API creates state, nonce and PKCE verifier/challenge
→ Google authenticates the user
→ Google redirects to GET /api/v1/auth/google/callback
→ API validates state, PKCE, ID-token signature/audience/expiry/nonce and email_verified
→ API creates or links auth_identities(provider=GOOGLE, provider_subject=sub)
→ API creates an internal refresh session and HttpOnly refresh cookie
→ API redirects to WEB_URL/auth/google/callback?status=success
→ Frontend calls POST /api/v1/auth/refresh to obtain an access JWT
```

Access and refresh tokens are never put in redirect URLs. The frontend result URL contains only
`status=success`, or `status=error&error=<safe-code>` when authentication fails.

## Account rules

- A previously linked account is identified only by `(GOOGLE, Google sub)`, not by mutable email.
- A first Google login requires a verified email claim and serializes linking by provider subject,
  user and normalized email using PostgreSQL advisory locks.
- An existing ACTIVE customer with the same email is linked without overwriting profile data.
- An existing PENDING employee with matching email and ACTIVE employment is linked, activated and
  changed to ACTIVE. ACTIVE employees can also link Google.
- LOCKED/INACTIVE users, inactive employment and a different Google identity already linked to the
  same user are rejected.
- An unused email creates an ACTIVE customer and assigns the global CUSTOMER role.

## Cookies and configuration

The temporary `googleOAuthFlow` cookie is HMAC-authenticated, HttpOnly, SameSite=Lax, scoped to the
callback path and expires after 10 minutes. SameSite=Lax is required so it returns on Google's
top-level callback. Production cookies require HTTPS.

```env
GOOGLE_CLIENT_ID=<web-client-id>
GOOGLE_CLIENT_SECRET=<backend-only-secret>
GOOGLE_REDIRECT_URI=http://localhost:4000/api/v1/auth/google/callback
```

The redirect URI must exactly match Google Cloud Console. Production should use the public API
callback URL. Keep the downloaded client-secret JSON and `GOOGLE_CLIENT_SECRET` outside Git.

Google start and callback routes share a per-IP limit of 10 requests per 15 minutes. For multiple
API replicas, replace the in-process rate-limit store with a distributed store.
