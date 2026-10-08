# Create a counter customer

`POST /api/v1/customers` requires `Authorization: Bearer <access-token>`.

This endpoint creates a customer profile, not a password or login identity. A caller must be an
ACTIVE user and ACTIVE employee with an active ADMIN or SALES_STAFF role and a matching
`customers.create` permission. ALL scope requires a global assignment; BRANCH scope requires
assignment to the request branch. Roles and permissions are loaded from the database, never
accepted from the request or token claims.

```json
{
  "branchId": "<active-branch-uuid>",
  "displayName": "Nguyen Van A",
  "phone": "0901234567",
  "email": "customer@example.com",
  "birthday": "1998-01-15",
  "heightCm": 170,
  "weightKg": 60,
  "chestCm": 90,
  "waistCm": 75,
  "hipCm": 95,
  "internalNote": "Counter staff note"
}
```

Required: branchId, displayName, phone. Unknown fields are rejected. Vietnamese local phone
numbers are normalized to +84; international numbers must use E.164. Email is lowercased.
Birthday must be a valid date not in the future. Measurements must be positive and <=999.99.
branchId is the operating branch and becomes the preferred branch for a new customer.

- 201: users + customers created atomically, with CUSTOMER_CREATED audit event.
- 200: existing active customer found by phone; original information is preserved.
- 400: invalid input or inactive/missing branch.
- 401: missing/invalid/expired JWT or inactive account.
- 403: insufficient permissions, wrong branch, or inactive employment.
- 409: phone belongs to a non-customer/unavailable account, or email belongs to another user.
- 503: JWT verification has not been configured.

Responses expose only userId, customerCode, displayName, phone, email and preferredBranchId;
they do not expose internal notes, measurements, account identities or rental history.

Configure JWT_ACCESS_SECRET (random secret >=32 characters), JWT_ISSUER (default costume-api),
JWT_AUDIENCE (default costume-web) in the API environment. The access JWT uses HS256 with
sub=user UUID, iss, aud, iat and exp; maximum age is 15 minutes. No login or token issuance
endpoint is included in the counter-customer endpoint. Registration token issuance is documented
in [Customer registration](../auth/registration.md). Missing configuration denies access rather than bypassing auth.

Core seed adds customers.create.all to ADMIN and customers.create.branch to SALES_STAFF.
Apply these permission assignments to the intended environment before using the endpoint.
Do not run demo seed against production merely to add permissions.

Online registration, password credentials and phone OTP are documented in [Customer registration](../auth/registration.md).
This endpoint does not claim an existing customer account or mark their phone/email verified.
