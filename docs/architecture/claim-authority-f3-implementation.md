# F3 — Pinned External Authority and Narrow Comparison

Status: local, shadow-only implementation for Product review. This package creates an interface and synthetic tests. It does not admit a real publication, stand up a corpus or private store, connect Retrieve, or change a production consumer.

## Public snapshot and replay

`createF3PublicSnapshot(recordedAt, assertions)` copies, canonicalizes, hashes, validates, and recursively freezes a caller-supplied set of **already admitted** public assertions. `validateF3PublicSnapshot` checks the versioned schema and content digest on replay, including after JSON serialization. The snapshot ID identifies the exact record set and recorded time. A caller must pass that ID explicitly to `resolveAdmittedPublicClaims`; a mismatch fails closed. Corrections create a new snapshot. Supersession and conflict links remain provenance, not automatic winner selection.

Each assertion records immutable ID/version, source document ID and SHA-256, publisher, publication/retrieval time, reviewer/decision and admission time, inclusive valid dates, exact geography/network/program/fee identity/population/basis/unit, authorized dimensions, value, limitations, and conflict/supersession links. The validator requires publication ≤ retrieval ≤ admission ≤ snapshot recording time. A later admission may describe an earlier effective interval, but it is absent from every prior snapshot. Valid time is checked separately: the assertion's interval must contain the full statement claim interval. A publication dated after the statement interval begins cannot silently apply retroactively, even if it declares earlier valid dates. No nearest-date selection or historical back-projection occurs.

This interface trusts the upstream admission decision metadata supplied to it. It does not authenticate publishers, review decisions, or document hashes against an external store. Thus its result carries `shadow_only_admitted_snapshot_interface` standing and cannot be treated as a production authority grant. A real admission workflow and independently verified source corpus require separate authorization.

## Resolution and authority ceiling

The resolver validates the F1 graph against the same canonical analysis before looking up a claim. It pins the graph ID, canonical version digest, F2 evaluator version, F3 resolver and authority-policy versions, snapshot ID, claim ID, and selected assertion IDs/versions/source hashes. Matching requires the claim dimension, exact scope, and full effective-period containment. Missing dimension, scope, period, and assertion states have distinct reason codes. Overlapping incompatible values or explicit conflict links return `conflict` with all conflicting IDs; order and recency never choose a winner. The `tryResolveAdmittedPublicClaims` wrapper returns a redacted unavailable result for malformed input.

The public port supports only official identity, reference comparison, benchmark, recurrence, and cadence. It cannot satisfy contractual pass-through, merchant authorization or control, retained margin, processor markup, actionability, removability, negotiability, or savings. This is deliberately narrower than the full F2 public-lane rule table. No result is converted into an F2 test attestation or fed to customer output. F2 continues to accept only its hand-authored non-authoritative test attestations.

`resolveAdmittedPrivateClaims` is a tenant/account-scoped unavailable port. It returns no document content or evidence and always reports missing private authority. There is no private storage, global promotion, or public-to-private fallback.

## Narrow published-rate comparison

`compareAdmittedPublicRate` reads only a selected canonical `financialFacts.processorStatedRate` fact on the same F1 claim subject. It requires a matched pinned public rate with exact scope. Integer-scaled decimal arithmetic preserves input precision without floating-point rounding. F3 permits only native exact equality (`tolerance: 0`); it does not invent or accept a caller-selected tolerance policy. The output is only equal, above, below, unknown, conflict, or refusal. It includes the observed and reference values, exact difference, canonical reference, and pinned resolution. Basis/population are exact-match inputs, not independently established by this package, so the comparison remains a shadow diagnostic. Equality is never a pass-through, at-cost, markup, excess-charge, avoidability, retained-profit, or savings verdict.

## Production boundary

F3 adds only `src/claimAuthorityF3`, a focused test, and this document. It does not import Retrieve, modify parser/canonical arithmetic, fee ledger, opportunity logic, permissions, runtime decisions, or report code. F4 remains the separate migration/cutover package. Frozen Gold and the existing F0–F2 tests are run as regression checks; the synthetic F3 assertions are not promoted to Gold source authority.
