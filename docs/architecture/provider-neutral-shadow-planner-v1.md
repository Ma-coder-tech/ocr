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

## Phase 2 implementation result — 2026-09-16

Phase 2 adds independent direct-OpenAI Responses and OpenRouter Chat
Completions transports behind the provider port. Both transports perform one
HTTP send, expose only bounded telemetry, enforce response-size limits, parse
the provider envelope and draft with duplicate-key rejection, normalize usage
and cost, and return an untrusted draft to the existing local binder. HTTP
fixtures cover success, malformed and duplicate JSON, refusal, truncation,
fallback evidence, model substitution, HTTP rejection, oversized response,
ambiguous send failure, and pre-send cost rejection. Provider pricing is
pinned per adapter and a conservative byte-based token upper bound rejects
requests that could breach the per-call cost ceiling before any network
attempt. The focused provider-neutral suite passes 23/23 and the repository
TypeScript build passes.

The qualification runner enforces three ordered controls per adapter: schema,
cross-request reference replay, and one existing non-customer Gold packet. It
stops an adapter on the first failure, permits no retry or fallback, and stores
no prompt, raw provider response, or draft. Before and after each call it
fingerprints canonical financial truth, RD artifacts, reconciliation,
commercial truth, governed knowledge, permissions, and customer-output state.

The bounded live run pinned direct OpenAI to `gpt-5.2` and OpenRouter to
`openai/gpt-5.2`, with the manifest ceiling of 12,000 output tokens and USD
0.25 per call. Both adapters exceeded the inherited 20-second
deadline on their first schema control. Each was therefore rejected and its
remaining controls were skipped. The run made two provider attempts total,
with zero retries and zero fallback attempts. Every protected-state fingerprint
was unchanged; no customer output, truth mutation, research, or source admission
occurred.

This result does not establish schema incompatibility: neither provider
returned an accepted or rejected response envelope before the local deadline.
It establishes that neither adapter is qualified under the current 20-second
operational contract. Neither adapter may be wired into shadow evaluation yet.
The safe qualification artifact is
`evaluations/provider-neutral-shadow-planner-v1/qualification-2026-09-16.json`.

The next engineering decision is a latency-contract change, not a schema or
field patch: explicitly pin provider reasoning effort, define a measured
qualification timeout distinct from interactive/customer latency, then run a
new separately authorized bounded qualification. OpenAI documents `none` as
the GPT-5.2 default and recommends pinning reasoning effort during migration;
OpenRouter exposes the analogous `reasoning.effort` control. Any requalification
must remain independently budgeted and must not reinterpret these failed calls
as passes.

## Requalification contract — 2026-09-16

The qualification-only deadline is 60 seconds per call. This is supported by
the repository's prior forensic evidence: a provider successfully completed a
full-planner structured response in 38,268 ms under a 60-second envelope. The
normal planner runtime still defaults to the original 20 seconds; only the
non-customer qualification runner can select the bounded 60-second maximum.

Both adapters use a 4,000-token output cap, `reasoning.effort: none`, and low
verbosity. Direct OpenAI pins the documented snapshot
`gpt-5.2-2025-12-11`. OpenRouter pins the corresponding canonical slug
`openai/gpt-5.2-20251211`, restricts the initial upstream to `openai`, disables
fallback, requires every request parameter, denies data-collection routing,
and sets prompt/completion price ceilings. A response with a missing or
different OpenRouter upstream fails local validation.

The requalification is protected by an exclusive attempt guard. Each adapter
still receives, in order, at most one schema control, one cross-request replay
control, and one non-customer Gold control. It stops on its first failure.
There are no retries and failure of one adapter does not select or suppress the
other adapter.

An adapter qualifies only when all three controls complete inside 60 seconds,
the exact snapshot and (for OpenRouter) upstream identity match, usage remains
inside token and USD 0.25 ceilings, the entire draft passes strict local
binding and semantic validation, the cross-request replay is rejected, and
all seven protected-state fingerprints remain unchanged. Any other outcome is
`REJECTED`; a partial pass is not qualification.

## Bounded requalification result — 2026-09-16

The approved run stopped after the first failed control for each independent
adapter. It made two provider calls total, with zero retries and zero automatic
fallbacks. The unused four-call allowance was not consumed.

Direct OpenAI returned HTTP 200 from the exact pinned
`gpt-5.2-2025-12-11` snapshot in 22,234 ms. The response used 1,395 input
tokens and 1,294 output tokens, with an estimated cost of 20,558 microdollars.
The structured draft passed the transport and schema boundary but failed local
semantic admission because both `exactCitedReferenceTokens` and a hypothesis
`supportingReferenceTokens` value named the wrong reference class. The runtime
therefore returned `SAFETY_BLOCKED`, discarded the draft, and skipped the
remaining controls. This is evidence of an instruction/semantic-contract
failure, not schema incompatibility or a deadline failure.

OpenRouter failed its first schema control with HTTP 404 before a provider
response envelope was available. The configured
`openai/gpt-5.2-20251211` slug therefore did not qualify at the Chat
Completions endpoint under the pinned routing contract. The runtime recorded
no response tokens or cost and skipped the remaining controls. The safe
telemetry intentionally does not retain the provider error body, so this run
establishes only model-or-endpoint rejection; it does not distinguish which
part OpenRouter rejected.

Every before/after fingerprint matched for canonical financial truth, RD
artifacts, reconciliation, commercial truth, governed knowledge, permissions,
and customer-output state. No customer output, truth mutation, research
operation, or source admission occurred. The privacy scan found no prohibited
filename, account, filesystem-path, internal-reference, synthetic-fact, or
credential pattern in the persisted artifacts.

Neither adapter is qualified. Phase 3 and customer-facing wiring remain
blocked. The evidence supports two separate offline changes before any future
live authorization: strengthen the provider-neutral instruction/semantic
fixture so reference classes are unambiguous without encoding request-specific
values, and replace the OpenRouter request model with a documented callable
model identifier while retaining the OpenAI-only routing assertion. These are
adapter/contract corrections; they do not change the deterministic authority
boundary. A future live run requires a new bounded authorization and must not
reuse or remove this run's attempt guard.

Safe artifacts:

- `evaluations/provider-neutral-shadow-planner-v1/requalification-2026-09-16.json`
- `evaluations/provider-neutral-shadow-planner-v1/requalification-report-2026-09-16.md`
- `evaluations/provider-neutral-shadow-planner-v1/requalification-attempt-guard-2026-09-16.json`

## Offline correction result — 2026-09-16

The two failed adapters were corrected independently without changing the
deterministic authority boundary or making another provider call.

For Direct OpenAI, request contract v2 adds a `referenceTokenContract` to every
privacy-contained provider payload. The contract contains only opaque tokens
and their explicit classes, defines the eligible classes for each output
reference field, identifies `STATEMENT_EVIDENCE` as input provenance that must
never be emitted, and directs the provider to leave a field empty rather than
substitute an ineligible class. The system instruction repeats these rules and
forbids inferring a class from token spelling or packet position. The local
binder continues to enforce the same class allowlists and still rejects
unknown, wrong-class, and cross-request tokens. No local validation rule was
relaxed.

For OpenRouter, the request model is now the documented callable identifier
`openai/gpt-5.2`. The adapter still targets Chat Completions, restricts routing
to the `openai` provider, disables fallback, requires parameter support, denies
data-collection routing, and retains the existing price ceilings. Returned
model and routed-provider identity checks remain fail closed.

The next live runner writes only to new `requalification-2` result, report, and
attempt-guard paths; the completed first-run guard and evidence remain
immutable. The recommended next qualification keeps the existing contract:
three ordered controls per adapter, at most three calls per adapter, 60 seconds
per call, 4,000 maximum output tokens, reasoning effort `none`, low verbosity,
zero retries, zero automatic fallback, adapter-independent stop conditions,
and safe fingerprints/telemetry only. Direct OpenAI remains pinned to
`gpt-5.2-2025-12-11`; OpenRouter uses `openai/gpt-5.2` with OpenAI-only
routing. A new explicit live authorization is required before running it.

Offline validation passed for the corrected boundary: the three focused planner
test files passed 31 of 31 tests, the TypeScript build passed, and the diff
passed whitespace/error checks. A repository-wide test run passed 2,414 tests
and failed 83 tests across 26 files in unrelated reconstruction, template, and
canonical baseline areas; none of the failures were in the provider-neutral
planner suites changed here. No live provider request was made during this
correction phase.

## Bounded live requalification result — 2026-09-16 (attempt 2)

Product authorized the corrected adapters under the unchanged bounded contract.
The run made two provider calls total and stopped each adapter after its first
failed schema control. No retries or fallbacks were attempted. Both adapters
remain rejected; the adversarial-reference and Gold controls were skipped.

Direct OpenAI returned HTTP 200 from the exact
`gpt-5.2-2025-12-11` snapshot in 19,288 ms. It used 1,802 input tokens and
1,312 output tokens, with an estimated cost of 21,522 microdollars. The response
passed transport, model-identity, structured-schema, and reference-token
binding checks, then failed deterministic semantic admission with
`shadow_planner_required_evidence_class_invalid`. The validator sequence proves
that the draft selected a globally recognized evidence class that was not in
the packet's allowed evidence-class subset. Raw provider content was not
persisted, so the safe evidence intentionally cannot identify the exact class
the provider selected. This is a provider-instruction/packet-semantics failure,
not a transport, schema, timeout, reference-token, or budget failure.

OpenRouter requested the documented public model identifier
`openai/gpt-5.2`, restricted routing to the OpenAI upstream, denied
data-collection routing, required support for every parameter, and disabled
fallback. OpenRouter returned HTTP 404 before a provider response envelope;
there were no response tokens or cost. Current OpenRouter documentation lists
the public model as served by OpenAI and Azure, while each configured routing
policy filters eligible endpoints. The evidence therefore establishes that no
route qualified under the combined request and account policy at run time; it
does not establish that the public model identifier is invalid or identify
which routing constraint excluded the OpenAI endpoint.

All seven protected-state fingerprints were identical before and after both
calls. Customer outputs, source admissions, research operations, and truth
mutations remained zero. Phase 3 and customer-facing wiring remain blocked.
