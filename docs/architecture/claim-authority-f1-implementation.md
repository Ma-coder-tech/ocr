# F1 — Claim graph and read-only canonical adapters

Status: engineering implementation for Product review. F1 is representational and diagnostic only; it does not implement F2 authority decisions or change any production consumer.

## Output contract

`src/claimAuthorityF1/types.ts` defines `claim_authority_graph_f1_v1` and a versioned representational evaluator. F0 owns the frozen evaluation-contract identity outside production source. A graph snapshot contains stable claim IDs, typed canonical subjects, one dimension per claim, known/unknown/not-applicable value state, reasoning provenance, required—but never satisfied—authority lanes, resolution/refusal, temporal and universality scope, evidence/calculation references, optional Product-policy dependency, typed edges, and unresolved conflict groups. Snapshot and canonical-core digests are deterministic; customer state, opportunities, legacy semantic selections, and wall-clock timestamps do not enter graph identity. The returned graph is deeply frozen.

Known canonical financial claims carry a **reference**, selected candidate ID, and evidence/calculation IDs—not the amount, rate, volume, count, fee contribution, or savings value. A semantic-code value can be represented only as `candidate_only`, not as an admitted fact. `authority.assessment` is always `not_evaluated` and `satisfiedLanes` must remain empty. Unknown ownership and actionability are explicit even when a fee-row record is known. Neither a graph nor its diagnostic is routed to Report V1, customer projection, frontend, APIs, persistence, opportunity logic, or Phase 2.

`createF1ClaimGraph` validates vocabulary, canonical references, selected candidates, value-state consistency, provenance, authority non-promotion, temporal scope, conflict membership, and acyclic dependency edges. Unknown dimensions/enums/refs and copied money fields fail closed. `buildF1ClaimGraphFromCanonical` projects already-existing canonical facts, fee rows, occurrences, parser interpretations, controls, calculations, and cross-summary diagnostic records by reference. It does not recompute or select financial truth. `buildF1ShadowGraph` catches construction failure and returns a redacted unavailable diagnostic without touching canonical analysis.

## Scope and interpretation

The compatibility diagnostic counts current selected ownership/actionability rows that F1 has **not adjudicated**. This is not a verdict that the legacy value is wrong; it is a shadow coverage difference for later Product review. F1 supplies no public or merchant-private resolver, no admitted corpus, no policy/completeness evaluator, and no customer cutover. The F0 synthetic/Product-policy fixture test checks that the graph can carry independent dimensions, reasoning classes, refusal, and policy dependency while F0 remains the evaluation authority. It does not claim G1–G8/G6/G9 source-backed execution.

## Verification

`test/claimAuthorityF1.test.ts` exercises deterministic replay, immutable/versioned output, canonical referential integrity, explicit unknowns, all seven reasoning classes, independent resolution, conflict preservation, cycle rejection, no duplicated financial values, no authority grant, fail-closed malformed inputs, F0 compatibility, and canonical/Report V1 invariance. Existing full regression and frozen Gold tests remain required before any F2 authorization decision.
