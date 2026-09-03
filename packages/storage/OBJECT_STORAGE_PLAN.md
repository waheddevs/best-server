# Object-storage foundation decision

Status: steps 7A through 7D implemented. Step 7 is complete; Telegram import was
removed from the backend plan on 2026-09-03.

## Provider decision

SeaweedFS 4.45 is the local-development S3 provider because it is actively
maintained, has a current stable release, ships a versioned container, and uses
the permissive Apache-2.0 license. MinIO Community is archived, Garage uses
AGPLv3, and RustFS still marks parts of its distributed and lifecycle behavior
as under testing.

The decision applies only to local infrastructure. `@best/storage` uses AWS SDK
v3 S3 commands so an approved production S3-compatible provider can be selected
without changing domain code.

## Implemented boundary

- typed and startup-validated S3 configuration;
- private, opaque, owner-scoped object keys;
- short-lived presigned PUT uploads bound to the exact byte length;
- conditional `If-None-Match: *` writes that prevent key reuse;
- short-lived signed GET URLs;
- bucket availability and object metadata probes;
- fake-data unit tests that perform signing without network access;
- database-owned pending, verifying, ready, and rejected lifecycle;
- `READY + CLEAN` Library attachment and payment receipt constraints;
- Teacher/Admin GraphQL upload intent and confirmation mutations;
- owner-only signed download intents for ready objects;
- server-side MIME, magic-byte, size, ETag, and SHA-256 confirmation;
- ClamAV scanning with immutable engine/signature verdict metadata;
- group-authorized Student Library reads and signed attachment downloads.

## Security invariants

- Buckets remain private.
- Original filenames and client-provided paths never become storage keys.
- Credentials never enter GraphQL, URLs, logs, or PostgreSQL.
- PostgreSQL remains authoritative for owner, visibility, status, size, MIME,
  and checksum.
- Upload confirmation must verify the stored object before it can become ready.
- Publication requires MIME-signature validation, size enforcement, checksum,
  and a `CLEAN` malware verdict.

## 7C operation contract

- `createMediaUploadIntent`: Teacher/Admin only; filename, extension, MIME, and
  declared size are validated before a private opaque key is signed.
- `confirmMediaUpload`: creator only; confirmation is idempotent after `READY`
  and rejects MIME, signature, metadata, or size mismatches.
- `createMediaDownloadIntent`: creator only and only for `READY` media.
- Allowed image uploads are capped at 10 MiB. PDF, audio, and video are capped
  at 50 MiB and can never exceed the typed environment hard limit.
- Confirmation computes SHA-256 from the stored bytes. PostgreSQL remains the
  authoritative lifecycle record.

Abandoned-object cleanup and permanent deletion remain later work. Telegram
media ingestion is no longer part of the backend plan.

Sources:

- https://github.com/seaweedfs/seaweedfs
- https://github.com/seaweedfs/seaweedfs/releases/tag/4.45
- https://github.com/minio/minio
- https://github.com/deuxfleurs-org/garage
- https://github.com/rustfs/rustfs
