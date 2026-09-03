# Storage package

`@best/storage` owns the provider-neutral S3 client boundary shared by the API
and future approved workers. It creates private object keys, exact-size signed
`PUT` upload URLs, short-lived signed download URLs, and object metadata probes.

Upload URLs sign both `Content-Length` and `If-None-Match: *`. The first binds
the URL to the reviewed file size; the second prevents a completed private key
from being overwritten by reusing an upload URL. Domain code must still verify
the stored MIME value, file signature, size, and checksum before marking an
object ready.

The package never makes buckets public and never places original filenames,
user input, credentials, or provider URLs into object keys. PostgreSQL remains
the source of truth for ownership, authorization, visibility, checksum, and
processing state.

SeaweedFS 4.45 is the pinned local-development provider. Runtime code uses only
the S3 API and can target an approved production S3 provider through typed
environment configuration.
