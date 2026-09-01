# Local infrastructure

The reviewed Compose stack currently provides PostgreSQL and Redis for local
development. Both services:

- use explicit supported image versions;
- persist data in named volumes;
- expose ports only on the host loopback interface;
- define readiness health checks;
- avoid destructive shutdown commands.

## Start and stop

Copy the root `.env.example` to an untracked `.env`, replace the local database
password, and validate the resolved Compose model before starting it:

```bash
corepack yarn infra:config
corepack yarn infra:up
corepack yarn infra:logs
corepack yarn infra:down
```

`infra:down` preserves the named data volumes. Volume deletion is intentionally
not exposed as a package script.

## Object storage status

Object storage is not included yet. The previously planned MinIO Community
repository was archived in April 2026 and its maintained pre-built community
containers were discontinued. A replacement or approved distribution must be
selected before an S3-compatible service is added to this stack.
