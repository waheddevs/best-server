# Local infrastructure

The reviewed Compose stack provides PostgreSQL, Redis, SeaweedFS, and ClamAV
for local development. These services:

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

## Object storage

SeaweedFS `4.45` is pinned as the maintained Apache-2.0 local S3 provider. The
single-node `weed mini` mode persists data in the `object-storage-data` volume,
pre-creates `S3_BUCKET`, and exposes only the S3 port at
`http://127.0.0.1:8333`.

The master, filer, volume, and admin interfaces remain inside the Compose
network. This setup is for local development, not a production topology. The
application uses the standard S3 API and does not depend on SeaweedFS-specific
runtime APIs.

Keep the local access and secret keys only in the ignored root `.env`. Do not
reuse them in production or make the bucket public.

## Malware scanner

ClamAV `1.5.3_base` is pinned from the official GPL-2.0 image. Signature data
persists in the `clamav-signatures` volume and is refreshed by the image's
FreshClam process. The API streams validated file bytes to `clamd` and requires
a `CLEAN` verdict before marking new media ready.

Port 3310 is bound only to `127.0.0.1`. The clamd TCP protocol is not
authenticated or encrypted, so never expose this port publicly. Allow roughly
4 GB of available memory for the scanner during local startup and wait for its
built-in health check/signature initialization before running the API.
