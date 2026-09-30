# Local infrastructure

The reviewed Compose stack provides PostgreSQL, Redis, SeaweedFS, ClamAV, and
Mailpit for local development. These services:

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

## Development email inbox

Mailpit `v1.31.1` is the pinned local-only SMTP capture service. The API sends
login codes to `127.0.0.1:1025`, and its inbox is available at
`http://localhost:8025`. Both ports bind to host loopback only. Mailpit does not
deliver messages to the internet and must not be used as production email
infrastructure; production SMTP values must point to the selected real provider.

## Listening text-to-speech

Teacher Listening audio previews are generated inside the API process by the
pinned `kokoro-js` package. No separate text-to-speech container or port is
required. `TTS_MODEL_ID`, `TTS_MODEL_DTYPE`, `TTS_DEFAULT_VOICE`, and the
bounded transcript setting are documented in the root `.env.example`.

The model is downloaded from Hugging Face on the first generation request and
cached locally by Transformers.js. The first request is therefore slower and
requires network access; later requests reuse the cached model and the loaded
API-process singleton.

Generated WAV files are validated by the API and written to private object
storage. Generation alone creates an owner-only preview; the normal Teacher
section save attaches a confirmed preview to the draft.
