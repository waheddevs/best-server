# Current deployment policy (2026-10-13)

The owner deferred email-code verification. `credentialLogin` validates the
existing account, password, profile name, active status and backend-owned role,
then creates an audited credential session. It never marks the email verified.
`AUTH_REQUIRE_EMAIL_VERIFICATION=false` is the default. Set it to `true` with
working SMTP to have the same operation return an email challenge instead.
The existing code verification/resend contracts remain available. SMTP is
required when verification is enabled; disabled delivery never fakes a send.
Login email syntax is validated on both sides. Reserved test domains are
rejected in production and allowed in development/integration fixtures.

# Auth component

Owns Admin-provisioned credential login, email-code challenges, short-lived
BEST access tokens, request authentication, and server-owned role enforcement.
There is no public signup or social-provider exchange.

## GraphQL credential flow

`beginCredentialLogin(input)` accepts `name`, `email`, `password`, and
`expectedRole`. The split login form also sends `firstName` and `lastName`;
older clients can continue to send only the combined `name`. Email is the unique
credential identifier. Names confirm the stored profile only; `expectedRole`
merely requires the selected UI flow to match the database-owned role. Neither
value is authorization evidence. Incorrect email, first name, surname,
password, and verification code return distinct error codes. Inactive accounts,
role mismatches, and locked logins retain a generic authentication error.

Legacy Teacher profiles that contain only one name accept that same given name
followed by a surname from the split login form. Login does not save the surname;
the Teacher must save it in Settings. Once the profile contains a surname, the
complete name must match. Other roles keep the exact full-name check.

A valid credential creates a PostgreSQL challenge and sends a random six-digit
code through configured SMTP. Only an HMAC digest is stored. Codes expire after
five minutes, allow five attempts, are single-use, and may be resent after a
sixty-second cooldown. Resend rotates the digest and invalidates the old code.

`verifyCredentialLogin(input)` consumes the challenge and returns:

```json
{
  "accessToken": "short-lived-best-token",
  "expiresInSeconds": 900,
  "user": { "id": "...", "displayName": "...", "role": "STUDENT" }
}
```

The role is always loaded from PostgreSQL. An authenticated Admin provisions
Student and Teacher credentials through `adminProvisionUser`; that mutation
cannot create another Admin. Existing deployment-provisioned Admin credentials
may use the same login challenge.

SMTP delivery is mandatory when email-code verification is enabled. When delivery is explicitly disabled
for local development, login fails with `SERVICE_UNAVAILABLE`; it never reports
a fake successful send. Tests inject a capturing sender and use reserved data.
