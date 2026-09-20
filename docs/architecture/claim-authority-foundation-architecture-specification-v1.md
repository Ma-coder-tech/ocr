# RateReveal Claim and Authority Foundation — Architecture Specification v1

Status: **Engineering proposal for Product review; no implementation authorized**  
Product semantic authority: `artifacts/gold-contract/RateReveal_Gold_Authority_Derivability_Contract_v1.md` and `test/fixtures/gold-contract/gold-authority-derivability-v1.json`  
Repository baseline inspected: `codex/package-h1-4-canonical-report-preview` at `3f9328bb4d2fc458f0e05715d0c45e7a78cf9b63`, including uncommitted worktree state  
Scope: architecture only; no changes to parser, canonical analysis, opportunities, customer output, Retrieve Phase 2, private storage, or governed corpus

## 1. Executive recommendation and answer to the architecture gate

**Introduce the foundation incrementally as a read-only, versioned claim-and-decision sidecar around the existing canonical accounting/reconciliation core. A deeper restructuring is not required before implementation can safely begin.** The canonical model already has independently identified evidence records, fact candidates and selections, fee source occurrences, parser interpretations, fee rows, calculations, controls, and cross-summary relationships (`src/canonical/types.ts`, `buildCanonicalFacts.ts`, `feeLedger.ts`, `crossSummaryLinkEvidence.ts`). Those are the right authoritative anchors for statement facts and arithmetic. A new claim layer should reference them, not own duplicate money or recalculate financial truth.

The necessary structural change is at the **semantic boundary above** that core: claims must become dimension-specific, traceable decisions evaluated against claim-specific authority, completeness, temporal scope, and Product policy. Existing `CanonicalFeeSelectedClassification`, `CanonicalFeeOwnership`, broad at-cost statuses, opportunity eligibility, and customer state cannot simply be renamed into this model: they conflate dimensions or presuppose authority the frozen Gold contract does not grant. They remain unchanged as compatibility/shadow objects until independently gated migration. The sidecar must have no path to Report V1, frontend, APIs, customer wording, opportunity totals, or protected state during its initial phases.

This is a target architecture, not a claim that current canonical output already satisfies Gold. Product's zero-tolerance categories are hard fail gates; this document sets no new numeric production threshold.

## 2. Current-to-target architecture map

| Current object / behavior | Current owner and role | Target relationship | Initial migration posture |
|---|---|---|---|
| `CanonicalStatementAnalysis.identity`, `financialFacts` | Canonical selected statement/accounting facts with candidates, evidence, and calculation refs | Remain the only selected financial-fact owner; claim nodes point to typed fact paths and selection IDs | Read-only projection; no replacement |
| `CanonicalEvidenceRecord`, extraction observations, parser interpretations | Source location and extraction/interpretation trail | Typed evidence links; raw printed labels remain observation evidence, not semantic authority | Reuse IDs and source roles; no extraction changes |
| `CanonicalFeeLedger.sourceOccurrences`, `.parserInterpretations`, `.rows` | One row identity/contribution decision per canonical charge, with duplicate/control exclusions | Fee-subject claims reference row ID plus occurrence/interpretation IDs; no parallel fee total | Reuse; preserve unique-total contribution rules |
| `CanonicalCalculationRecord`, `CanonicalEffectiveRateBasis` | Deterministic financial math, numerator/denominator and compatibility | Calculation claim references formula/version/inputs/result; no re-computation in claim layer | Reuse; explicit undefined when denominator invalid |
| `CanonicalFeeLedger.controls`, `CanonicalCrossSummaryLinkEvidence` | Reconciliation and reference-only cross-summary relationships | Evidence for separate completeness/relationship decisions; never add charges | Reuse; keep cross-summary reference-only |
| `CanonicalFeeOwnershipActionability` / selected classifications | Current bundled category, three ownership fields, actionability | Legacy/shadow comparison source only; future independent category, owner/control, and action claims derived separately from accepted evidence | No override or silent promotion |
| `CanonicalOpportunityEngine` | Current cadence, target, overlap and aggregation controls | Future savings claims reference eligible component IDs only after independent target/authority/completeness gates | Preserve existing fail-closed controls; no sidecar output to E initially |
| `CanonicalCustomerStateProjection`, permissions, wording, report projection | Product policy and customer projection over current canonical objects | Eventually consume gated claim decisions; policy nodes are separate from financial nodes | No routing or wording change now |
| Retrieve Phase 1 / Phase 2 candidate bundles | Bounded untrusted research output and deterministic candidate assessment | Possible input to a future reviewed admission workflow, never direct runtime authority | No production import or automatic write |

`src/canonical/runtimeAdapter.ts` already rejects legacy savings, markup amounts, AI-generated amounts, Report V1 totals, and aliases as canonical truth. `runtimeShadow.ts` runs behind a flag and emits redacted diagnostics. Extend that isolation pattern for future claim shadowing rather than threading new conclusions into production response types early. The current customer report projection is synthetic-fixture-only (`customerReportProjection.ts`) and is not an authority source.

## 3. Proposed claim model: first-class records versus derived views

Use an immutable, per-analysis **claim graph** with three conceptual record types: `ClaimAssertion` (what is asserted), `ClaimSupport` (why it could be asserted), and `ClaimDecision` (what the evaluator permits). The following is an interface sketch, not code to add now:

```ts
type ClaimValue =
  | { kind: "known"; value: typedScalarOrStructuredValue; unit?: string; basis?: string }
  | { kind: "unknown"; reasonCode: string }
  | { kind: "not_applicable"; reasonCode: string };

type ClaimAssertion = {
  claimId: string; analysisId: string; subject: TypedCanonicalRef | ExternalSubjectRef;
  dimension: ClaimDimension; semanticCode: string; polarity: "required" | "prohibited";
  value: ClaimValue; scope: ClaimScope; validTime: EffectiveInterval | null;
  universality: UniversalityScope; sourceAssertionLineage?: string[];
};

type ClaimSupport = {
  claimId: string; reasoningClass: ReasoningClass; ruleId: string; ruleVersion: string;
  inputClaimIds: string[]; typedEvidenceRefs: TypedEvidenceRef[];
  requiredAuthorityLanes: AuthorityLane[]; authorityProofRefs: string[];
  calculationRef?: string; knowledgeSnapshotId?: string; privateScopeRef?: OpaqueAccountRef;
};

type ClaimDecision = {
  claimId: string; status: ResolutionStatus; admittedValue: ClaimValue;
  satisfiedLanes: AuthorityLane[]; missingLanes: AuthorityLane[];
  supportEdgeIds: string[]; contradictionClaimIds: string[]; conflictGroupId?: string;
  refusalReasonCode?: string; blockedDimensions: ClaimDimension[];
  completenessGateRefs: string[]; productPolicyDecisionRefs: string[];
  evaluatorVersion: string; decidedAt: string;
};
```

First-class fields are identity, subject, one claim dimension, value/explicit unknown, scope and valid time, reasoning/proof edges, exact authority requirements and satisfactions, resolution/refusal, evidence and contradiction links, Product-policy dependencies, and the evaluator/snapshot versions. A stable claim ID is scoped to analysis, subject, dimension, semantic, period and assertion lineage; competing candidates receive distinct IDs. Do not encode a mutable `owner` or one `truthState` on a fee row. The graph is acyclic for derivation edges, while contradiction and supersession links may be lateral. Missing refs, unsupported edges, cycles, scope mismatches, and unknown enum values fail closed.

Derived views—not stored as independent truth—include a fee-row summary, a merchant-facing grouped category, an ownership matrix, at-cost comparison display, action guidance, and evaluation metrics. Money, selected fact values, fee contribution decisions, and deterministic calculations continue to live in canonical accounting; their claim nodes hold typed references and optional read-only display copies with source hashes, never a second authoritative amount. A resolved claim does not mutate its input fact or row. Candidate and decision records are append-only/versioned; reruns produce a new snapshot rather than rewriting history.

The frozen Gold register is an **evaluation contract**, not a runtime claim database. Its `semanticStatus` and `status` are distinct; runtime decisions should likewise separate semantic refusal/unknown from evaluation readiness or a missing Gold source. `source_mapping_incomplete` for G1–G8 is a Gold-execution gate, not a statement fact about the merchant.

## 4. Reasoning provenance and graph semantics

Each claim records exactly one primary reasoning class and all supporting operations. Direct observation points to accepted `CanonicalEvidenceRecord` and, where relevant, source occurrence. Deterministic calculation points to `CanonicalCalculationRecord`, ordered input fact/claim IDs, formula and rounding version, units, numerator, denominator and population. Template inference points to a versioned template mapping plus the observed fields that satisfy it; its universality is template-specific. Economic-structural inference points to independently observed components and a versioned bounded rule; it may support broad mechanics, not exact owner or contract truth. Governed-public dependency points to an **admitted** public claim and pinned snapshot. Merchant-private dependency points to an opaque tenant/account-scoped admitted private claim. Product-policy judgment points to a reviewed policy rule/version and its prerequisite decisions.

Edges are typed `observed_from`, `calculated_from`, `inferred_from`, `authorized_by`, `requires`, `contradicts`, `supersedes`, `blocked_by`, or `policy_depends_on`. A positive decision must have a complete proof path from admitted inputs and cannot be justified by a free-text explanation or model confidence. Human review is a reviewed admission/override record with reviewer, scope, effective time and supersession; it cannot silently become a reusable global rule. AI suggestions are candidate edges only.

## 5. Authority enforcement

Implement a versioned **dimension-to-authority policy table**, not a global rank of sources. The evaluator accepts a requested `(subject, dimension, semantic, scope, period)` and checks (a) allowed reasoning classes, (b) required evidence lanes, (c) source/claim scope and applicability, (d) temporal validity, (e) completeness gates, (f) contradictions, and (g) policy ceilings. It returns a typed decision; an unrecognized dimension defaults to refusal, not a generic fallback. A source may satisfy only the dimensions explicitly listed in its admitted authority record.

| Attempted shortcut | Required enforcement |
|---|---|
| Statement structure → economic beneficiary | Structure supports broad component mechanics; beneficiary remains unknown absent dimension-specific public/private positive mapping. |
| Public rate equality → contractual pass-through | Equality proves only compatible reference comparison; merchant-private terms, spread, and retention remain separate. |
| Processor billing/collection → retained margin | Biller/collector may be observed; beneficiary, controller and recipient each need independent proof. |
| Familiar fee label → official identity | Label is candidate text; official identity needs admitted effective-dated network/regulator or publisher mapping. |
| Public publication → merchant authorization | Public scope is not the merchant agreement; account-private applicability is required. |
| Private evidence → global knowledge | Tenant/account scope is enforced on every lookup, cache key and output; promotion requires a distinct reviewed process that this package does not implement. |

Authority proofs carry a source identity, provenance status, publisher/issuer, signed or content hash, applicable dimensions, subject/population/scope, effective interval, admission review and snapshot. A mere `authoritative: true`, high confidence, a matching label, or a selected classification does not satisfy the evaluator. Equally authoritative contradictions produce `conflict`/`requires_review`; ordering, recency, or AI preference cannot choose a winner unless a reviewed supersession rule applies.

## 6. Ownership/control and pricing-component semantics

Model six independent ownership/control dimensions on the fee-row or component subject: `biller_statement_issuer`, `collector`, `economic_beneficiary`, `contractual_controller`, `merchant_facing_price_controller`, `retained_margin_recipient`. Each holds its own `ClaimValue`, authority proof, effective scope, and resolution. `unknown` is first-class, not a `CanonicalFeeParty` guessed from another dimension. A valid state is, for example, processor-collected with unknown beneficiary and unknown retained-margin recipient. Current `CanonicalFeeOwnership` has only collector, beneficiary, and controller; its selected tuple is a compatibility object, not the target owner source of truth.

Broad categories should be separate dimension-specific claims: `merchant_pricing_component`, `merchant_percentage_pricing_component`, `merchant_per_item_pricing_component`, `flat_bundled_merchant_price`, `separately_represented_program_cost_component`, and `underlying_cost_split_unavailable`. A broad category can be established by accepted statement/structural evidence while exact network program identity or beneficiary stays unknown. One fee row may have a percentage mechanic and a merchant-facing price claim without a processor-markup claim. `processor_markup` is a gated **strong claim** requiring the observed merchant price/component plus compatible underlying cost or merchant-private processor-control evidence. Even an established markup does not assert retained processor profit. Scope-specific mixed schedules remain multiple claims, never one overloaded pricing-model label.

## 7. Reference comparison and replacement for `proven_at_cost`

Do not migrate `rate_matches_reference` into broad `proven_at_cost` (`src/fiservProcessorFeeClassification.ts`). Use separate claims for observed billed amount, printed rate, basis/denominator, admitted reference rate, publisher, source version, effective interval, geography/network/program/population, compatibility, and equality/exceeds/below under the approved tolerance. The comparison decision includes its input IDs and exact decimal/rounding policy, and can be `reference_scope_or_period_insufficient` without rewriting the observed rate.

Then assess contractual pass-through, separately billed spread, and processor-retention **independently** with the appropriate merchant-private or other dimension-specific authority. `observed_rate_matches_admitted_reference` must not imply `contractual_pass_through_verified` or `processor_retention_zero`. If the reference is not effective for the historical period, the evaluator refuses the comparison rather than using the nearest current schedule. Preserve the current canonical denominator/population controls and decimal-string precision; never substitute gross for net volume or silently round G5's 2.0740% into 2.0700%.

## 8. Completeness and denominator model

Represent each frozen gate as a versioned `CompletenessDecision` with `eligible | partial | blocked | unknown`, supporting controls/refs, missing coverage and affected dimensions. The seven IDs are `observed_page_fact`, `statement_total`, `fee_composition`, `pricing_architecture`, `comparison`, `actionability`, and `savings`. They are **not one serial boolean**: a page fact may be eligible while totals are blocked; a row-specific comparison can be assessed only for its compatible population while whole-statement composition remains partial. Downstream claims declare the exact gates they require.

Accounting completeness compares printed gross fees to reconciled contributing charges. Economic-classification completeness uses printed gross fees and explicitly separates credits/adjustments. Merchant-facing completeness uses printed gross fees and separately reports unresolved/excluded gross amounts, repeated representations, credits/adjustments and partial coverage. Signed `feeLedger.uniqueChargeTotal` remains a reconciliation result but must not be the sole denominator for economic coverage. Reuse `feeLedger.controls`, contribution decisions, `crossSummaryLinkEvidence` and fee-rollup assessments; cross-summary relationships remain reference-only and never add money. Savings must additionally require named counterfactual, target authority, identity/scope/population/denominator/period compatibility, merchant applicability, recurrence, document coverage and non-overlap.

For any recurring-charge interpretation, keep separate claims for observed statement-period amount, recurrence status, frequency/cadence, annualization permission, annualized amount, and estimated annual amount. The permission proof may use an explicit statement cadence, repeated compatible statements, an effective-dated governed program cadence, or an applicable merchant-private agreement. A single unlabeled charge supports only the observed period amount. The current E cadence default of `unknown`/no annualization is the minimum-safe behavior to preserve.

## 9. Temporal model and governed-public interface

Public knowledge uses two time axes: **valid/effective time** from the publisher and **recorded/admission time** when RateReveal accepted the claim. Each admitted assertion has immutable ID/version, source document ID and hash, publisher, publication/retrieval/admission dates, valid-from/to interval, geography/network/program, fee identity, unit/basis, population, supported authority dimensions, limitations, conflict/supersession links, and reviewer/decision ID. A superseding publication does not erase the old claim or silently make a newly published rate applicable to old periods.

The future interface is conceptually `resolveAdmittedPublicClaims({ snapshotId, dimension, subject, geography, network, population, basis, analysisPeriod }) -> admitted matches | typed missing/conflict`. It accepts only a **pinned, immutable knowledge snapshot**; no web search or Retrieve call occurs during statement analysis. Selection requires period containment and compatible scope, not nearest-date or label similarity. Every analysis pins `knowledgeSnapshotId`, authority-policy version, Product-policy version, claim-evaluator version, Gold contract version (for evaluation), canonical version manifest, and selected source claim IDs/hashes. Replaying these versions reproduces the same historical decision even after the corpus changes. Withdrawal/correction creates a new snapshot and explicit supersession trail; it does not rewrite a prior analysis.

This specifies an interface only. It does not create a corpus, migration, admission workflow, or runtime knowledge service.

## 10. Merchant-private interface

The future private resolver is conceptually `resolveAdmittedPrivateClaims({ tenantId, accountId, snapshotId, dimension, subject, analysisPeriod }) -> opaque admitted claims | typed missing/conflict`. It returns reviewed claim metadata and opaque evidence IDs, not document contents. Admission records require tenant/account identity, document hash, reviewer, authorized claim dimensions, valid interval, supersession, access scope and audit trail. Cache and graph keys include tenant/account; queries and evaluations fail closed if that context is absent. A public claim cannot manufacture a private contract claim, and a private claim cannot be reused globally. Any later promotion is a separate reviewed, provenance-preserving process requiring explicit Product authorization. This document authorizes no private storage or infrastructure.

## 11. Product policy layer

Materiality, priority, reportability, visibility, blocking, customer wording and action ceilings are policy **decisions** with reviewed rule ID/version, input claim IDs, completeness refs and output permission/reason codes. They can depend on financial or economic claims but cannot change their values or masquerade as public/statement authority. A deterministic rule is still `product_policy_judgment`. Keep `customerState` and permissions as current downstream compatibility objects; future projections may read policy decisions only after gated cutover. The new layer must never route candidate/unknown claims into customer output by default.

## 12. Refusal, unknown, conflict and evaluation-readiness model

Represent (1) the assertion value state (`known`, `unknown`, `not_applicable`), (2) the claim's semantic decision (`supported`, `partially_supported`, `unresolved`, `refused`, `conflict`, `policy_blocked`, `incomplete_document`, or typed authority/source absence), and (3) source-execution/evaluation readiness **separately**. A refusal records prohibited positive semantic, exact missing lane or violated constraint, evidence checked, downstream dimensions blocked, and a passing `correct_refusal` evaluation expectation. `unresolved` means authority genuinely does not resolve the value; it is not a low-confidence guess. `partially_supported` retains only the independently proven narrower claim and refuses the stronger remainder. Contradictory evidence is preserved, not selected by source order.

`source_mapping_incomplete` for G1–G8 and `source_unavailable` for G9 describe Gold execution readiness; neither should overwrite approved semantic refusal. Runtime source-unavailable/incomplete-document states are separate typed reasons tied to that analysis. Unknown is permitted even when billing mechanics are known, a broad component is known but official identity is not, public reference is known but merchant applicability is not, or processor collection is known but retention is not.

## 13. Current canonical conflict and migration map

The reviewed Gold conflict report records 10 assertion-level conflicts. This table distinguishes confirmed legacy-output defects from current canonical risk surfaces; it does not claim every canonical result is customer-visible today.

| Area / current behavior | Frozen requirement | Likely migration impact |
|---|---|---|
| G1/G4/G7 legacy exact processor-controlled or junk-fee totals; canonical D can assign beneficiary/controller from structural interchange or network context (`feeOwnershipActionability.ts`) | Separate six dimensions; structure/collector does not prove beneficiary or control | Shadow new owner claims; eventually narrow D classifications and downstream actionability, not fee ledger |
| Canonical D high-confidence discount/markup/per-item patterns select processor category/ownership (`feeOwnershipActionability.ts`); legacy label-based markup exists | Broad merchant component first; markup needs compatible underlying-cost or private control proof; no profit inference | Replace strong classification projections with gated claims; keep fee amount unchanged |
| Fiserv reference-rate match yields `proven_at_cost` (`fiservProcessorFeeClassification.ts`) | Narrow equality plus independent contract, spread, retention | Deprecate broad status after comparison and private/public interfaces are proven |
| G3 legacy zero-volume output emits zero/numeric rate; canonical `decimalRate` already returns null for nonpositive denominator (`money.ts`, `effectiveRateBasis.ts`) | Undefined rate and no numeric verdict at zero denominator | Correct legacy headline semantics at later authorized cutover; preserve canonical math |
| G5 legacy summary rounds 2.0740% to 2.0700%; canonical rate uses decimal string and explicit basis | Exact approved precision and denominator/population compatibility | Add precision/basis evaluation and later projection fix; no calculation rewrite without evidence |
| G4/G7 legacy arithmetic rate becomes fairness verdict | Rate calculation does not establish price fairness | Keep separate calculation and Product-policy/customer language decisions |
| G8 legacy bundled benchmark and annual savings | No benchmark without compatible admitted target; observed cost alone yields no savings | Block legacy benchmark/savings projection at future cutover; retain E's target/overlap controls |
| Cadence risk: current canonical E accepts explicit fee-label cadence when period/evidence are linked (`opportunityPolicy.ts`); no confirmed conflict in this surface | Single unlabeled occurrence never monthly; annualization is separately gated | Preserve current fail-closed default, add claim-level recurrence proof and coverage; do not weaken it |
| D `potentially_actionable` and E eligibility use selected three-field ownership | Actionability requires dimension-specific control/contract, applicability and policy; no automatic removability | Future adapter requires admitted actionability claim before opportunity/customer projection |

Current canonical E is already conservative in several places: missing target becomes verification-only/excluded, cadence defaults unknown, and overlap is explicit (`opportunityEngine.ts`, `opportunityPolicy.ts`). Those safeguards are invariants to keep. The conflict map is not permission to change them now. The current runtime shadow is diagnostic, while Report V1 and the synthetic customer preview have separate routing; neither is a valid shortcut to claim authority.

## 14. Retrieve Phase 2 relationship

Phase 2 may produce **documents and passages as provenance-bearing retrieval artifacts, then bounded claim candidates** (`EvidenceCandidateBundleV1`) after deterministic extraction. None is an admitted public claim. Its deterministic assessment may say consistent, conflicting or insufficient and mark a candidate eligible for human review; it cannot grant authority. The admission boundary is a separate reviewed process that validates the actual publisher, identity, effective period, scope/population, independence and conflicts, then writes an immutable governed snapshot in a later authorized package. Runtime statement analysis reads only such pinned admitted snapshots and must not depend on Phase 2 availability or invoke research.

Existing Phase 1 candidate standing is `untrusted_candidate_only`; Phase 2 manifests prohibit catalog/database writes, financial truth mutation and customer output (`retrievePhase1/contracts.ts`, `retrievePhase2Design/liveQualificationProposal.ts`). The inspected latest local Phase 2 qualification artifact reports `not_qualified` and zero candidates; it is an untrusted evaluation artifact, not evidence authority. The architecture does not alter Phase 2 behavior or infer that a successful transport result would imply admissibility.

## 15. Gold evaluation integration and source dependency

The 369 normalized assertions trace to all 348 approved originals; 21 original mixed assertions have two independent children, and 28 are re-annotated. A future evaluator should load the frozen schema/register and compare claim dimension, value/polarity, reasoning proof, authority lanes, refusal reason, temporal/scope compatibility, and Product-policy dependencies—not just final customer text. It should independently count `correct_answer`, `correct_refusal`, `unsupported_inference`, `incorrect_conclusion`, `extraction_failure`, `missing_source_authority`, `gold_ambiguity`, `source_mapping_incomplete`, and `policy_mismatch`. False admission, lane leakage, historical back-projection and private-to-global promotion are separate zero-tolerance checks; refusal is a successful semantic outcome. Metrics must separate unresolved gross/signed dollars, completeness gates, denominator/population correctness, normalized-identity precision, counterfactual validity and savings false positives. Search-result or Retrieve-candidate count is not a primary quality metric.

S1–S10 (31 normalized claims) and all 25 global policy prohibitions can exercise the model immediately with synthetic and policy-only fixtures. Hand-authored, explicitly non-Gold unit fixtures can also test graph, authority, temporal and private-scope invariants. G1–G8 have approved semantics but 287 normalized assertions remain non-source-executable pending authoritative source mapping; G6's 38 normalized assertions additionally carry unresolved exact source identity. G9's 26 normalized assertions remain historical guidance because the original source is unavailable. No repository fixture is promoted by this specification. A new, independently adjudicated source-backed partial-document case is a later Product/source task, not a replacement silently created here.

**Implementation can start before source mapping** for the schema/graph, typed canonical refs, proof validation, synthetic policy tests, authority evaluator, fail-closed interface stubs, and shadow-only diagnostic adapters. Source-backed acceptance for G1–G8, G6 identity-dependent assertions, G9 partial-document behavior, real-statement precision/ownership/benchmark migration, and customer/production cutover remain blocked until their authoritative source gates are satisfied. Source mapping is not a prerequisite for every foundational type or invariant, but it is a prerequisite for claiming real-case Gold coverage or promoting the layer to runtime authority.

## 16. Migration strategy and invariance

Start with a sidecar produced from an already validated `CanonicalStatementAnalysis`, using typed references only. The first output is an internal claim graph and redacted diagnostic, with no external route. Keep the current canonical builder, selected financial facts, fee ledger, controls, calculations, opportunity engine, customer state and legacy report byte-for-byte unchanged. Validate the sidecar independently; if it fails, discard it without weakening canonical validation or changing customer output. Never let claim construction alter fee contribution, gross/net arithmetic, reconciliation or source evidence IDs.

Next run the authority evaluator on synthetic/policy fixtures and shadow analyses. Compare against frozen Gold at claim granularity and against current canonical/legacy outputs as **diagnostics**, not automatic truth. A later cutover must be per downstream dimension and fail closed; it must prove no unsupported positives, lane leakage, back-projection or private-global promotion, and preserve all protected accounting/reconciliation and customer-output invariants. Introduce compatibility projections only after their claim decisions and source mappings pass review. Do not remove a current conservative refusal merely because the new graph has more fields.

Deprecations are eventual, not in this package: overloaded `proven_at_cost`; unqualified `owner`; label-derived `processor_markup`; single pricing-model/fee truth labels; selected D actionability treated as customer permission; observed-cost-derived savings or inferred monthly cadence. Retain read-only legacy fields during a bounded shadow period with explicit divergence categories (known legacy defect, expected improvement, regression, human review). No automatic cutover deadline is prescribed.

## 17. Smallest coherent implementation sequence — proposed packages only

These are **recommendations for later separate authorization**, not implementation instructions for this turn. Each package must retain the frozen Gold contract identity and a versioned output contract. A failed gate stops downstream promotion without altering canonical truth.

| Package | Product outcome and why now | Dependencies; current reuse; eventual retirement | Acceptance and invariance | Major risk |
|---|---|---|---|---|
| **F0 — Evaluation seam and frozen fixtures** | Turn Gold claim dimensions, refusal and zero-tolerance rules into executable acceptance surfaces before building runtime semantics. | Frozen spec/schema/register; reuse Gold harness and synthetic S1–S10/global cases. Retires no production concept. | All original-to-normalized lineage reconciles; semantic vs source-execution status distinct; synthetic/policy evaluation deterministic; no source promotion or protected-state write. | Mistaking fixture agreement for real-source coverage. |
| **F1 — Claim graph and read-only canonical adapters** | Represent one dimension per claim and trace facts without duplicating accounting. | F0; reuse canonical IDs, evidence, occurrences, rows, calculations, controls, version manifest. Eventually supersedes bundled semantic read models, not financial facts. | Referential integrity, cycle/conflict handling, explicit unknown, immutable snapshot and stable replay; canonical facts/ledger/calculations/validation, API and report output unchanged byte-for-byte. | Reference drift, private data leakage in diagnostics, accidental second money owner. |
| **F2 — Dimension authority, completeness and policy evaluator** | Refuse unsupported strong claims while preserving narrower supported claims; this is the core enforcement seam. | F1; reuse fee controls, cross-summary/rollup evidence and reviewed Product policy. Eventually supersedes selected D ownership/actionability as authority. | Mutation tests for every prohibited lane hop; seven independent gates and gross-denominator accounting; six owner dimensions; correct-refusal success; zero unsupported positives/lane leakage on available synthetic tests; no change to current fail-closed behavior. | Overbroad rules, conflict-by-ranking, completeness gates accidentally serialized. |
| **F3 — Pinned external-authority interfaces and narrow comparison** | Add effective-dated public/private claim ports and auditable reference comparison without a corpus or private store. | F2; reuse period, rate/basis, reference provenance structures. Eventually retires broad `proven_at_cost` and label-derived official identity. | Stub resolvers fail closed; snapshot replay and historical selection pass; public/private scope isolation; rate equality never establishes contract/retention; no live Retrieve dependency or private storage created by this package unless separately authorized. | Back-projection, misleading reference compatibility, hidden source promotion. |
| **F4 — Shadow migration of ownership, opportunity and customer decisions** | Compare dimension-specific outcomes with D/E/G and later plan a controlled consumer cutover. Last because it can affect merchant language or money. | F0–F3 plus authoritative source mapping for affected real cases and separate Product cutover approval; reuse opportunity targets/cadence/overlap, customer permissions/wording and redacted runtime shadow. Eventually retires overloaded D/E/G projections only where replaced. | Real source-backed Gold passes for in-scope claims; no accounting/reconciliation regressions; savings chain and non-overlap proven; existing customer/protected-state output invariant until explicit cutover; divergence reviewed per dimension. | False savings/actionability, premature customer exposure, coupling to unqualified Phase 2. |

F3 defines ports only; admitting real public or private sources, standing up a corpus, and deploying a service are **separate future authorizations**. F4's cutover is not authorized by finishing F0–F3. G1–G8 mapping and G9 replacement are external acceptance dependencies, not excuses to weaken the sidecar's fail-closed behavior.

## 18. Decision for Product review

Approve or amend this **incremental sidecar** boundary and package order before any implementation. The existing canonical accounting/reconciliation core need not be rebuilt; its identified facts, ledger, controls and calculations are assets. The risky redesign is semantic authority above that core, and it can be specified and built additively with synthetic/policy evaluation while real-source acceptance remains explicitly blocked. No production, Phase 2, private-document, knowledge-corpus, customer-output or deployment change is proposed for this specification phase.
