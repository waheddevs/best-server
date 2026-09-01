# Typed environment configuration

Owns environment loading, parsing, and startup validation for every runtime.
Applications consume typed configuration objects and must not read scattered
`process.env` values.

Current profiles validate:

- shared `NODE_ENV` values;
- the API listen port;
- bearer access-token issuer, audience, signing secret, and TTL;
- local PostgreSQL connection settings;
- local Redis connection settings.

Copy `.env.example` to an untracked root `.env` for local development. Runtime
environment variables take precedence over values in that file.
