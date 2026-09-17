# Credential refresh session data design

Status: approved by the user on 2026-09-16.

## Goal and ownership

The credentials plus email-code login keeps short-lived BEST API access tokens,
but an active Student, Teacher, or operational Admin must not be forced through
email verification every hour. PostgreSQL owns revocable credential sessions;
the NestJS auth component owns issuance, rotation, reuse detection, and
revocation; Auth.js owns the encrypted HttpOnly web-session boundary.

This design does not create public signup, password reset, social login, or a
client-authoritative role. Every refresh reloads the active User and its role
from PostgreSQL before a new access token is issued.

## Token contract

- Access tokens remain bearer JWTs with the configured lifetime of at most one
  hour.
- Successful email-code verification also issues a 256-bit opaque refresh
  token formatted as `<token-id>.<secret>`.
- The raw refresh secret is returned only at issuance/rotation and is never
  persisted or logged. PostgreSQL stores its SHA-256 digest.
- A credential session has a 30-day absolute lifetime and a seven-day idle
  lifetime. Successful rotation extends the idle deadline, but never beyond
  the absolute deadline.
- Refresh tokens are single-use. Rotation consumes the presented token and
  creates exactly one replacement in the same transaction.
- Reusing a consumed token revokes the whole credential session and writes an
  audit event. Unknown tokens fail generically without revoking a session, so a
  guessed token identifier cannot be used for denial of service.
- Next.js serializes refresh calls for one web session. The database transaction
  remains authoritative and uses a compare-and-set consume plus the
  one-active-token partial unique index.

## Physical model

### `credential_sessions`

- `id UUID` primary key.
- `user_id UUID` references `users(id)` with cascade deletion.
- `expires_at TIMESTAMPTZ(3)` is the absolute deadline.
- `idle_expires_at TIMESTAMPTZ(3)` is advanced after successful rotation.
- `last_used_at TIMESTAMPTZ(3)` records successful rotation activity.
- `revoked_at TIMESTAMPTZ(3)` and bounded `revoke_reason` record terminal
  revocation without deleting security history.
- created/updated timestamps support audit and cleanup.

### `credential_refresh_tokens`

- `id UUID` primary key and public lookup portion of the opaque token.
- `session_id UUID` references `credential_sessions(id)` with cascade deletion.
- `token_hash VARCHAR(64)` is unique and contains only the SHA-256 digest.
- `consumed_at TIMESTAMPTZ(3)` marks single use.
- `created_at` records issuance.
- A partial unique index permits only one unconsumed token per session.

No access token, raw refresh token, password, or email code is stored in either
table.

## Transactions and concurrency

Initial verification creates the credential session and first refresh-token
digest in the same transaction that consumes the email challenge and records
the login audit event.

Refresh performs the following transaction:

1. Parse and hash the opaque secret.
2. Load the token and parent session within the transaction.
3. Reject an unknown, revoked, expired, idle-expired, or mismatched token.
4. If a matching token was already consumed, revoke the session and record
   `AUTH_REFRESH_TOKEN_REUSED`; commit that revocation before returning an
   unauthenticated error.
5. Reload the User and require an active credential-enabled Student, Teacher,
   or Admin.
6. Mark the old token consumed, create one replacement digest, advance the idle
   deadline, and issue a new short-lived access token after commit.

Logout is idempotent. A valid refresh token identifies and revokes its session;
an absent, malformed, unknown, or already-revoked token still returns success
and reveals no session existence.

## Web integration

Auth.js keeps access and refresh tokens only in its encrypted HttpOnly JWT
cookie. The refresh token is never copied into the public Session object. The
JWT callback refreshes five minutes before access expiry and shares one pending
refresh promise for concurrent requests in the same Next.js process. A failed
or revoked refresh produces an explicit session error and a localized login
redirect; a temporary API outage is distinguished from invalid credentials.

The web session refreshes five minutes before access-token expiry, and the
client SessionProvider revalidates every four minutes and on window focus. This
keeps authenticated operations on a fresh access token without introducing an
operation-level retry loop.

## Audit and revocation

- `AUTH_CREDENTIAL_LOGIN_VERIFIED` remains the login event.
- `AUTH_CREDENTIAL_SESSION_REVOKED` records explicit logout or account-driven
  revocation when an actor is known.
- `AUTH_REFRESH_TOKEN_REUSED` records reuse detection.
- Password rotation, account deactivation, and future sign-out-everywhere flows
  must revoke all active credential sessions for the User.

## Rollout and rollback

The migration is additive: existing Users and access tokens remain valid until
their current expiry. Existing web sessions have no refresh token and therefore
require one normal email-code login after rollout.

Rollback first deploys web/API code that no longer calls refresh, then removes
the two tables in a separately reviewed forward migration. The deployed
migration is never edited in place. No business-domain rows require backfill.
