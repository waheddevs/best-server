# Auth identity and account plan

Status: original provider identity design approved on 2026-09-01; superseded by
the approved credentials and email-code login decision on 2026-09-07. Rotating
credential refresh sessions were approved on 2026-09-16 and are specified in
`CREDENTIAL_REFRESH_SESSION_DATA_DESIGN.md`.

## Approved credentials and email-code login (2026-09-07)

The previous social-provider provisioning flow is superseded. BEST accounts are
provisioned operationally: an authenticated `ADMIN` may create only `STUDENT`
or `TEACHER` users with a unique normalized email, profile display name, and an
Argon2id password digest. There is no public signup, social provisioning,
password reset, or client-selected role authority. Operational Admin bootstrap
remains an out-of-band deployment responsibility; an existing Admin with a
credential digest may use the same login challenge.

Credential login is a two-step GraphQL flow:

1. `beginCredentialLogin` accepts name, email, password, and the role expected by
   the selected UI flow. Email is the unique credential identifier. Name is
   compared only with normalized profile data; expected role must match the
   database-owned role. Neither is authorization evidence. A generic
   unauthenticated error covers unknown, inactive, mismatched-name/role, locked,
   and invalid-password cases.
2. After a valid credential check, the API creates one expiring challenge,
   stores only a digest of its random six-digit code, and delivers the raw code
   through the configured SMTP adapter. The code expires after five minutes.
3. `verifyCredentialLogin` consumes the challenge. Five invalid attempts revoke
   it; successful verification marks it used before issuing the existing
   short-lived bearer access token. The active user and database-owned role are
   reloaded at verification and on every authenticated request.
4. `resendCredentialLoginCode` is available no earlier than sixty seconds after
   the last delivery. It rotates the digest, expiry, and delivery timestamp;
   the previous code becomes invalid.

Challenges are PostgreSQL-owned so multiple stateless API replicas enforce the
same expiry, cooldown, attempt, and single-use state. Raw passwords and raw
codes are never persisted or logged. Credential failures are counted on the
User record; five failures impose a short lock. SMTP is mandatory in production
and may be explicitly disabled in local/test environments, where beginning a
login fails honestly with `SERVICE_UNAVAILABLE` unless tests inject a fake
delivery adapter.

## Historical provider-exchange design (inactive)

The remainder of the original 2026-09-01 provider design is retained only as a
migration-history record. It does not authorize runtime OAuth, social
provisioning, or the deleted internal exchange endpoint.

### Ownership boundary

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
- The later approved credential refresh extension adds hashed, rotating,
  revocable backend sessions. It does not add provider-token persistence or
  browser local-storage ownership.

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
- Superseded: email/password credentials and Teacher login are implemented only
  through the Admin-provisioned email-code flow above. Password reset, magic
  links, and account linking/unlinking remain deferred. Rotating refresh tokens,
  per-device credential sessions, and revocation are owned by the separately
  approved 2026-09-16 extension.
- Superseded: the approved credential GraphQL mutations and existing protected
  product operations are active contracts.

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
