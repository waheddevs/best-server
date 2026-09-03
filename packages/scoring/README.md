# Deterministic scoring

`@best/scoring` owns framework-independent, versioned scoring rules. The first
approved rule is `single-choice-v1`: one point for a correct selection, zero for
an incorrect or unanswered question, percentage rounded to two decimals, and a
test-version-owned passing threshold.

The package has no NestJS, Prisma, Redis, or transport dependency. The scoring
worker maps immutable database input into this package and persists its result
transactionally.
