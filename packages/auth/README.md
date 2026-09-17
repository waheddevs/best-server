# Auth package boundary

Reserved for server-owned identity and authorization contracts shared by the
API and workers. Client-selected roles and identifiers are never trusted as
authorization evidence. Public signup and social-provider exchange are no
longer approved product flows.

The API uses short-lived bearer access tokens. Token verification reloads the
active user and authoritative role from PostgreSQL. Cross-runtime token or job
contracts may move here only when more than one deployable application owns the
same approved contract.

The approved Admin-provisioned credentials and email-code decisions are
documented in `packages/database/docs/AUTH_IDENTITY_PLAN.md`. This shared
package remains a placeholder until an approved contract is genuinely consumed
by more than one backend runtime.
