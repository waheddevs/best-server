# API-local libraries

This directory contains focused API-local building blocks used by more than one
domain:

- `errors` contains shared typed application errors.
- `filters` contains global NestJS and GraphQL exception mapping.
- `middleware` establishes early request context such as request IDs.

- `errors` contains shared typed application errors.
- `filters` contains global NestJS and GraphQL exception mapping.
- `middleware` establishes early request context such as request IDs.

- `dto` — transport-neutral DTOs shared across API domains.
- `enums` — API-owned enums that are not generated from Prisma or owned by one
  domain.
- `interceptor` — NestJS interceptors that apply across API domains.
- `types` — small API-runtime TypeScript types shared across domains.

Domain-owned declarations stay in their domain. GraphQL object and input
classes stay in `src/schemas`; Prisma types and database enums remain owned by
`@best/database`.
