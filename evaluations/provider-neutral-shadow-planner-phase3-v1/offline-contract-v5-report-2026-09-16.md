# Provider-neutral planner Phase 3 — offline contract-v5 hardening

Mode: offline only. Provider calls: 0. OpenRouter: disabled. Transport changes:
none. Production wiring and customer output: disabled.

## Cause

The remaining live failure was a local fail-closed rejection under
`shadow_planner_forbidden_conclusion`. The exact provider wording was not
persisted. The provider instruction stated only general prohibitions while the
local rule enforced a broader financial/commercial conclusion boundary and did
not identify every free-text field to which that boundary applied.

Test-first review also found that the local predicate's input traversal omitted
nested evidence gaps, confirmation requirements, falsification conditions,
top-level evidence gaps, limitation codes, and reconstruction-suspicion reasons.

## Changes

- Bumped the provider-neutral request contract from v4 to v5.
- Enumerated the existing forbidden conclusion classes in the shared provider
  instruction.
- Applied the instruction to every free-text planner field, including
  hypothetical, negated, example, confirmation-target, and falsification wording.
- Added neutral unresolved-language guidance.
- Kept the local forbidden predicate, error code, and fail-closed decision
  unchanged; expanded only its free-text traversal to cover every field.
- Left transport, routing, evidence classes, guidance channels, grounding,
  privacy, authority, retries, fallback, and OpenRouter configuration unchanged.

## Offline validation

- TypeScript build: passed.
- Focused planner suites: 5/5 files, 60/60 tests passed.
- Seven-family forbidden-conclusion matrix: 13 field placements per family,
  91/91 negative cases rejected fail-closed.
- Deterministic Gold replay: 11/11 statements, 60/60 selected issues, 60/60
  valid plans.
- Exact grounding, epistemic boundaries, resolution paths, useful evidence
  requests, meaningful alternatives, and operational/private-data routing: 100%.
- Safety counters: 0.
- Provider calls, network calls, research operations, source admissions,
  customer outputs, truth mutations, retries, and fallbacks: 0.
- Canonical, RD, reconciliation, commercial, governed-knowledge, permission,
  and customer-output state: invariant.

## Readiness

All seven issue families are ready for another bounded Direct OpenAI Phase 3
shadow run. This offline result does not qualify product behavior and does not
authorize customer-facing use.
