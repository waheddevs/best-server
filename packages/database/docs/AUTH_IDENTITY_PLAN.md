# Auth identity and account plan

Status: approved on 2026-09-01 and implemented in the additive auth identity
migration and NestJS internal exchange boundary.

## Ownership boundary

- Auth.js remains in the independently deployed Next.js web application and
  owns Google, Facebook, and Apple OAuth callbacks.
- NestJS owns stable BEST identities, provider-account mappings, user status,
  authoritative roles, and short-lived BEST API access tokens.
- PostgreSQL remains private to `best-server`. The web application must not use
  an Auth.js Prisma adapter or connect directly to the BEST database.
- The browser never sends a provider token to NestJS and never receives the
  BEST API access token. The Next.js server acts as the BFF and adds the bearer
  token when it calls the NestJS API.
- Provider access tokens, refresh tokens, and ID tokens are not persisted in
  BEST PostgreSQL.

```text
Browser -> Next.js/Auth.js -> OAuth provider
Browser <- encrypted HttpOnly Auth.js session <- Next.js
Next.js server -> signed internal identity exchange -> NestJS
NestJS -> User/AuthAccount transaction -> PostgreSQL
Next.js server -> Bearer BEST access token -> NestJS GraphQL
```

## Session and token decisions

- Auth.js keeps its existing encrypted, HttpOnly JWT session in the web
  application. No Auth.js database `Session` table is added.
- NestJS access tokens remain short-lived and contain only the BEST User ID and
  access-token type. User status and role are reloaded from PostgreSQL on every
  authenticated API request.
- The Auth.js session may keep a BEST access token only inside its encrypted
  server-readable cookie. The Auth.js `session` callback must not expose that
  token to client JavaScript.
- The web server may obtain a new short-lived BEST access token while its
  Auth.js session remains valid by performing a fresh signed internal exchange.
- This milestone does not add a backend refresh token, browser token storage,
  provider-token persistence, a session-revocation table, or a refresh GraphQL
  operation.

## Internal identity exchange

- NestJS exposes one operational endpoint at `POST /internal/auth/exchange`;
  it is not a product GraphQL operation or an OAuth provider callback.
- The Next.js server sends a short-lived signed assertion with a dedicated
  secret that is different from the BEST access-token secret and Auth.js
  session secret.
- The assertion contains a fixed issuer and audience, expiry of at most 60
  seconds, unique assertion ID, provider, provider account ID, and the verified
  provider profile needed for first-time provisioning.
- The assertion never accepts a role, User ID, Teacher ID, Admin ID, or account
  status from the browser.
- Production traffic must use TLS. Rate limiting and gateway restriction remain
  production-hardening requirements in addition to assertion verification.

## User and provider-account rules

- Social sign-in provisions only a `STUDENT`. Teacher and Admin credential
  verification remains deferred; their frontend form fields are not
  authentication evidence.
- The provider/account tuple is the authoritative social identity. Facebook may
  omit email, so first-time provisioning cannot require email from every
  approved provider.
- A provider email is promoted to `User.email` only when the provider supplies
  an explicit trustworthy verification signal. User email is normalized to
  trimmed lowercase and is unique when present.
- `(provider, providerAccountId)` uniquely identifies one `AuthAccount`.
- One User may eventually own multiple provider accounts, but automatic linking
  by matching email is forbidden.
- If a new provider identity supplies a verified email already owned by a User,
  sign-in is rejected with an account-link-required result. An absent or
  unverified email is retained only as provider provenance and is never used to
  link accounts.
- Provider profile names initialize `User.displayName` only when the User is
  first provisioned. Later provider logins do not overwrite BEST-owned profile
  data.
- Inactive Users cannot exchange identity or use an existing BEST access token.

## Proposed physical changes

### `users`

- Add nullable `email VARCHAR(320)` with a unique index.
- Add nullable `email_verified_at TIMESTAMPTZ(3)`.
- Add a check that stored email is non-empty, trimmed, and lowercase.

Existing rows remain valid because both columns are nullable. No existing role,
status, ownership, or domain relation changes.

### `auth_accounts`

- `id UUID` primary key.
- `user_id UUID` foreign key to `users` with restricted deletion.
- `provider AuthProvider` limited to `GOOGLE`, `FACEBOOK`, and `APPLE`.
- `provider_account_id VARCHAR(255)`.
- `provider_email VARCHAR(320)` and `provider_email_verified_at TIMESTAMPTZ(3)`
  capture the verified identity used when the account was linked.
- `created_at` and `last_authenticated_at` timestamps.
- Unique `(provider, provider_account_id)` and `(user_id, provider)` keys.

No provider credential or token column is permitted.

## Transaction and race behavior

1. Verify the internal assertion before any database lookup.
2. Resolve an existing provider/account tuple and reject an inactive User.
3. For a new tuple, require a usable display name and normalize any email.
4. Promote only a provider-verified email to the User; reject an existing
   verified email rather than linking automatically.
5. Create the Student User and AuthAccount in one database transaction.
6. Treat unique-constraint races as deterministic conflicts; never create a
   duplicate User to recover from a race.
7. Issue the BEST access token only after the transaction succeeds.

## Explicitly rejected or deferred

- Rejected: direct database access or Auth.js Prisma adapter ownership in
  `best-react`; this violates the backend data boundary.
- Rejected: trusting the frontend role selector, Teacher ID, Admin ID, email
  alone, or an unsigned provider profile.
- Deferred: email/password credentials, password reset, magic links, automatic
  email account linking, account unlinking, Teacher/Admin login, rotating
  refresh tokens, per-device sessions, and session revocation.
- Deferred: product GraphQL auth mutations and protected product operations.

## Approved implementation boundary

Approval of this plan authorizes one additive reviewed migration, the internal
exchange endpoint, typed configuration, focused tests, and the minimum frontend
contract documentation. It does not authorize any deferred item above.

## Official references

- [Auth.js session strategies](https://authjs.dev/concepts/session-strategies)
- [Auth.js database models](https://authjs.dev/concepts/database-models)
- [Auth.js callbacks](https://authjs.dev/reference/core)
- [Auth.js Facebook provider](https://authjs.dev/getting-started/providers/facebook)
- [Auth.js Google provider](https://authjs.dev/getting-started/providers/google)
- [NestJS authentication](https://docs.nestjs.com/security/authentication)
