# API-local libraries

Focused cross-domain transport concerns live here:

- `errors`: typed application errors.
- `filters`: NestJS and GraphQL exception mapping.
- `middleware`: request context and correlation IDs.
- `enums`: API-owned error codes.
- `pagination`: cursor encoding and shared input validation.
- `types`: small API-runtime contracts shared across domains.

Domain rules remain inside their components. GraphQL input/object classes live
under `src/schemas`; generated Prisma contracts belong to `@best/database`.
Create additional folders only when they have an actual consumer.
