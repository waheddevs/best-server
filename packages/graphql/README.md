# GraphQL contract boundary

This directory owns the generated sorted GraphQL schema artifact. It must not
contain business rules or handwritten duplicates of generated operation types.

- [Generated schema](schema.graphql)

The API's code-first TypeScript classes remain the schema source. The separate
frontend repository will use the accepted artifact to generate types for its
named operations; it will not import Prisma or backend resolver types.

The current artifact includes Teacher Library category/item management,
group-authorized Student Library reads, and signed Student attachment delivery.
