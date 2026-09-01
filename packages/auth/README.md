# Auth package boundary

Reserved for server-owned identity and authorization contracts shared by the
API and workers. Client-selected roles and identifiers will never be trusted as
authorization evidence.

The API uses short-lived bearer access tokens. Token verification reloads the
active user and authoritative role from PostgreSQL. Cross-runtime token or job
contracts may move here only when more than one deployable application owns the
same approved contract.
