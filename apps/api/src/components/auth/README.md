# Auth component

Owns backend identity provisioning, short-lived BEST access tokens, request
authentication, and role enforcement. OAuth provider callbacks and the Auth.js
session remain in the Next.js web application.

## Internal identity exchange

`POST /internal/auth/exchange` accepts exactly this JSON body from the trusted
Next.js server:

```json
{
  "assertion": "signed-server-assertion"
}
```

The assertion is an HS256 JWT signed with `AUTH_EXCHANGE_SECRET`. It requires:

- configured `iss` and `aud` values;
- `jti`, `iat`, and `exp`, with a lifetime no longer than 60 seconds;
- `tokenType: "identity_exchange"`;
- `sub` containing the provider account ID;
- `provider` equal to `google`, `facebook`, or `apple`;
- a non-empty `name` and boolean `emailVerified`;
- optional `email`, required when `emailVerified` is true.

Role, BEST User ID, Teacher ID, and Admin ID claims are never accepted as
authority. Social provisioning always creates a `STUDENT`; existing User status
and role are loaded from PostgreSQL.

The response is server-only:

```json
{
  "accessToken": "short-lived-best-token",
  "expiresInSeconds": 900
}
```

The Next.js server keeps this token inside its encrypted HttpOnly Auth.js
session and adds it to server-side API calls. Its Auth.js `session` callback
must not expose the token to browser JavaScript.

The endpoint stores only provider identity metadata. Provider access tokens,
refresh tokens, and ID tokens are forbidden from the request and database.
