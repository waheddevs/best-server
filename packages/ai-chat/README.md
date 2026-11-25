# Teacher AI chat foundation

Pure versioned job, input, free-model and retry policies for the approved
Teacher-only assistant. No provider SDK, fetch, queue consumer, persistence or
runtime activation is included in this package.

- `parseAiChatJob`: version 1 accepts a run UUID only; rejects extra data.
- `parseAiChatText`: bounded text, never a user-selected system/tool role.
- `deriveAiChatTitle`: first-message title without another provider request.
- `assertFreeModelEvidence`: pinned `:free` model and fresh zero-price evidence.
- `freeModelProviderPolicy`: one reviewed provider slug, no fallback, zero
  maximum pricing, data collection denied and ZDR requested. Account ZDR-only
  settings and endpoint eligibility still require review.
- `classifyAiDispatchFailure`: ambiguous outcomes require reconciliation.
- `aiChatPublishRetryDelay`: bounded outbox publication retries; this is not
  permission to retry an external inference request.

The future worker must load ownership/consent/quotas from PostgreSQL, validate
catalog JSON before constructing evidence, recheck pricing immediately before
dispatch and use the exact pinned model/provider policy without client overrides.
These pure helpers alone do not enforce runtime authorization or durable quotas.

Run `yarn workspace @best/ai-chat test`, `lint`, `typecheck` and `build`.
