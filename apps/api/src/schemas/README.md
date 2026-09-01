# API schemas

This directory owns approved code-first GraphQL schema classes for the API.
Group concrete classes by domain and use explicit suffixes:

```text
schemas/
  tests/
    test.object.ts
    create-test.input.ts
    test-status.enum.ts
```

Create schema classes only after their fields and authorization contract are
approved. They are TypeScript classes decorated with NestJS GraphQL decorators,
not handwritten schema-first `.graphql` files. The generated GraphQL schema
artifact belongs in `packages/graphql`.
