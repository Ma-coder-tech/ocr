# Provider-neutral shadow planner v1

## Decision

The consolidation baseline is commit `d6ebcdbe919d11fb29ce73d7155c28848796a20f` (`Add shadow AI economic resolution planner v1`). It contains the deterministic issue-selection, bounded-packet, offline-runtime, local-validation, budget, and non-authoritative safety model without the later provider-specific debugging sequence.

The planner domain owns the problem being investigated. Provider adapters own only transport. Provider output is an untrusted inference draft and never contains or controls RateReveal authority, identity, permissions, admission, truth effect, or financial-mutation fields.

## Preserved evidence and design

- Issue-grounded reasoning from `60357c9`.
- Request-scoped opaque-reference containment from `9589484`.
- The stable provider-schema principle from `892e897`.
- Local issue binding and duplicate-key rejection direction from `137ba15`.
- Safe transport telemetry concepts from `e268d6e`.

These are being reimplemented behind a provider-neutral boundary rather than imported as an OpenRouter/Claude-specific stack.

## Retired from the implementation baseline

- Packet-expanded reference enums in provider schemas.
- Provider-side issue ID and input-hash enforcement.
- Synthetic-preflight prompts reused for real planner work.
- Multi-issue batching as the default provider failure boundary.
- Automatic provider fallback.
- Anthropic-specific schema translation inside the planner domain.
- One-field and regex-level compatibility branches as an implementation roadmap.

The prior branches and evaluation artifacts remain forensic evidence and are not rewritten or deleted.

## Baseline health

The selected baseline builds and its original shadow-planner suite passes. The
repository-wide suite at this historical commit is not fully green: unrelated
canonical roll-up, combined adjustment/chargeback qualification, and internal
analysis preflight tests fail without importing the new provider-neutral
modules. One representative roll-up failure reproduces in isolation. These are
recorded baseline defects, not silently folded into this planner consolidation.
Planner acceptance therefore uses the focused provider-neutral suite, the
original planner regression suite, the repository TypeScript build, and an
explicit invariant review. Repository-wide baseline repair is a separate work
stream and is not a reason to weaken this boundary.

## Authority boundary

The provider receives a privacy-contained issue packet and returns only:

- an unresolved question;
- hypotheses and alternatives;
- evidence gaps and confirmation/falsification requirements;
- a recommended evidence route;
- opaque citation tokens;
- research, merchant, document, or operational-data requests;
- limitations and optional reconstruction suspicions.

RateReveal locally:

1. binds the response to the in-flight issue and immutable input hash;
2. checks every citation token against the request-scoped alias map;
3. restores internal references;
4. stamps all authority and permission constants;
5. runs the existing deterministic planner validator;
6. rejects the entire draft on any structural, privacy, binding, reference, semantic, or budget failure.

## Adapter boundary

`ShadowAiPlannerTransportAdapterV1` is the provider port. Direct OpenAI and OpenRouter are separate adapters. Their request envelopes and error/usage extraction are adapter concerns. Direct Anthropic is deferred until credentials are available.

No adapter can select another adapter automatically. Provider selection must be explicit and observable.

## Engineering phases

### Phase 1 — offline consolidation

- Establish the provider-neutral draft and transport port.
- Compile privacy-contained provider payloads with request-scoped opaque aliases.
- Use one stable, request-independent structural schema.
- Bind identity, authority, and references locally.
- Add direct OpenAI and OpenRouter request compilers without executing network calls.
- Execute one explicit adapter for one issue through the fail-closed runtime.
- Prove fail-closed behavior and deterministic invariance offline.

The phase-one runtime has deliberately no adapter list, fallback callback, or retry
configuration. A caller supplies exactly one adapter. A failed or timed-out call
returns `UNAVAILABLE`; an invalid draft, usage breach, model mismatch, privacy
failure, or binding failure returns `SAFETY_BLOCKED`. Neither result contains a
plan.

### Phase 2 — bounded provider qualification

- Implement provider-specific response extraction and safe telemetry behind the
  existing transport port, with offline HTTP fixtures before any live request.
- Reject duplicate JSON object keys in raw provider text before materializing a
  draft object.
- Pin one explicit model identifier and one configured cost ceiling per adapter.
- Run one schema-only synthetic control and one adversarial reference-binding
  control through direct OpenAI, then repeat those same controls through
  OpenRouter as an independent qualification.
- Only after both controls pass for an adapter, run one issue-grounded,
  non-customer Gold case through that adapter.
- Keep retries and cross-provider fallbacks at zero.
- Cap qualification at three calls per adapter and stop that adapter on the
  first transport, schema, privacy, model-identity, usage, or local-validation
  failure.
- Persist only schema/request fingerprints, adapter/model identity, usage,
  latency, provider request ID, status, and privacy-safe error classifications.
- Compare canonical, RD, reconciliation, governed-knowledge, permission, and
  customer-output hashes before and after every call; any change is a release
  blocker.

### Phase 3 — Product shadow validation

- Cover every available issue family.
- Compare quality against the deterministic offline planner.
- Exercise timeouts, refusals, malformed outputs, reference attacks, and provider unavailability.
- Require repeatable transport success and unchanged canonical/RD/commercial/governed/customer state.

## Completion criteria

Engineering is complete only when at least direct OpenAI and OpenRouter accept the stable draft contract, every draft is locally bound and validated, cross-request references fail closed, all issue families pass bounded shadow evaluation, provider errors are actionable, and no provider outcome can mutate deterministic RateReveal truth or permissions.

## Offline validation matrix

Phase one must remain fully credential-free and prove:

- the output schema is request-independent and contains no packet-expanded
  enums, patterns, constants, or provider-fragile size constraints;
- issue identity, immutable input hashes, internal references, natural-person
  ambiguous names, file names, paths, and credentials cannot enter the provider
  payload;
- issued aliases restore locally, while invented, wrong-class, and cross-request
  aliases reject the whole draft;
- provider attempts to set identity, authority, admission, truth, mutation, or
  customer-rendering fields reject the whole draft;
- local structure, semantic, token, cost, list, and timeout budgets fail closed;
- adapter failure produces one attempt, zero retries, no alternative-adapter
  call, no plan, no customer output, and no deterministic mutation;
- direct OpenAI and OpenRouter envelopes use the same draft schema, while only
  OpenRouter carries its explicit `allow_fallbacks: false` transport control;
- the pre-existing deterministic planner regression suite remains green.

## Consolidation sequence

1. Land the provider-neutral contracts, local binder, request compilers, and
   single-adapter fail-closed runtime as an isolated consolidation commit.
2. Add fixture-driven transport response parsers and safe diagnostics without
   credentials or network access.
3. Run the bounded live qualification protocol, recording each adapter as
   independently qualified or rejected; do not substitute one for the other.
4. Wire only qualified adapters into the shadow evaluation runner through
   explicit configuration.
5. Retire the legacy batched provider path only after every issue family passes
   shadow evaluation and deterministic invariance is demonstrated.
