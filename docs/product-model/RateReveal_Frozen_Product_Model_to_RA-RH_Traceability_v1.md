# RateReveal Frozen Product Model → RA–RH Traceability Crosswalk v1

**Status:** Maintained normative-to-implementation traceability record.
**Frozen package identity:** `docs/product-model/frozen/v0.1/frozen-product-model.lock.json`.
**Accepted implementation baseline:** `codex/e2e-internal-analysis-v1` at `38bd5e8036c8329fda8ad7224961bc25ca23da25`.
**Current scope:** Accepted RA–RH implementation plus accepted internal-analysis integration through the baseline above. This artifact does not authorize production convergence.

## 1. How to maintain this crosswalk

Every later package that changes a mapped rule, implementation location, test oracle, runtime connection, or amendment must update this crosswalk in the same change. Frozen artifacts are referenced by filename and section; they are never edited in place.

Status vocabulary:

- **fully implemented** — the accepted package implements its approved bounded contract and its tests pass;
- **partially implemented** — material approved product semantics remain absent or are superseded by a later policy not yet connected;
- **evaluation-only** — executable in shadow, fixture, injected-provider, internal-live, or review tooling, but not authoritative customer production behavior;
- **not production-connected** — no accepted production upload/report/persistence routing grants this package authority.

These labels are independent. For example, a package can be fully implemented for its accepted shadow contract and still be evaluation-only and not production-connected.

Gold fixtures and tests are correctness oracles. Production code must not import Gold expected answers, fixture identities, tolerances, statement-specific mappings, or test source admissions as runtime configuration.

## 2. Chain summary

| Package | Frozen product responsibility | Accepted commit | Accepted status | Production connection |
|---|---|---|---|---|
| RA | Executable Frozen Gold v0.3 semantic oracle and forbidden outcomes | `3f9328b` | Fully implemented as an oracle; source-executed provenance remains separately bounded | Evaluation-only; never runtime configuration |
| RB | Source identity, canonical financial populations, headline math, direction, and reconciliation | `93635ba` | Fully implemented for accepted shadow V2 foundation | Not production-connected |
| RC | Independent pricing axes, population-scoped formulas, evidence and pricing states | `2c55cea` | Fully implemented for accepted shadow V2 pricing contract | Not production-connected |
| RD | Economic charges, participant/control claims, statement-observed cost ledger and cost stack | `f447b9f` | Fully implemented for accepted shadow V2 economic contract | Not production-connected |
| RE | Drivers, counterfactuals, levers, special economics, signals, notices, themes, and impact gates | `4dc012f` | Fully implemented for accepted shadow V2 synthesis contract | Not production-connected |
| RF | Effective-dated, scoped, evidence-bound knowledge resolution, conflicts, candidates, and unknowns | `82e5b8e` | Fully implemented for accepted in-memory shadow library; production service absent | RF-first is exercised in internal analysis; no production service/persistence |
| RG | Bounded research graph, retrieval, investigation, verification, safety, and candidate projection | `7a0c5a7` plus accepted integration through `38bd5e8` | Partially implemented against amended production policy; accepted evaluation/internal-live topology is substantial | Evaluation/internal-live only; not wired to production uploads |
| RH | Evidence-bounded Report V2 projection and customer permission ceilings | `d8d3816` | Fully implemented for accepted shadow backend evaluation baseline | Runtime integration is `none`; Report V1 authority/routing unchanged |

Accepted chain order:

```text
RA 3f9328b
→ RB 93635ba
→ RC 2c55cea
→ RD f447b9f
→ RE 4dc012f
→ RF 82e5b8e
→ RG 7a0c5a7
→ RH d8d3816
→ internal-analysis integration 103837c..38bd5e8
```

## 3. RA — executable Gold correctness oracle

| Frozen provision/rule | Owning frozen artifact | Accepted implementation location | Implementation status | Applicable tests/Gold assertions | Later approved amendment or clarification |
|---|---|---|---|---|---|
| Gold is a product truth oracle, not a parser fixture or runtime rules engine; provenance and applicability must remain explicit | Gold v0.3 §§0, 1A, 18–20 | `test/fixtures/gold-contract/gold-catalog-v0.3.final.json`; `test/fixtures/gold-contract/README.md`; `scripts/gold-contract-lib.ts` | Fully implemented as privacy-safe semantic contract; evaluation-only | `test/gold-contract/goldContract.test.ts`; all 348 finalized semantic assertions | `gold-v0.3-metadata-clarification-v0.1` adds machine-contract metadata without rewriting or weakening Frozen Gold |
| Case-specific required answers and “must not say” boundaries for G1–G9 | Gold v0.3 §§3–11 | Final catalog; `scripts/gold-contract-validate.ts`; `scripts/gold-contract-secure.ts`; `scripts/gold-contract-scope-check.ts` | Fully implemented as semantic oracle; source availability may yield review/unavailable rather than false pass | G1–G9 catalog assertions and `goldContract.test.ts` | D1–D15 product-owner finalization recorded in the final catalog/README; no frozen expected outcome is replaced |
| Global forbidden outputs: invented totals, unsupported ownership/control, benchmark, savings, pricing, certainty, or future-rule claims | Gold v0.3 §15 | Final catalog forbidden assertions; `current-baseline.json` explicitly records legacy divergences | Fully implemented as fail-closed oracle; legacy conflicts are documented, not accepted as correct runtime behavior | Global negative assertions; RA conflict validation in `goldContract.test.ts` | `current-baseline.json` is a reviewed divergence ledger, not a supersession of Frozen Gold |
| Synthetic/adversarial scenarios S1–S10, including prompt injection, equal-specificity conflict, denominator mismatch, and savings without counterfactual | Gold v0.3 §§S1–S10 | Final Gold catalog plus minimal opaque synthetic structures | Fully implemented; evaluation-only | S1–S10 assertions and tolerance tests | Metadata clarification only; synthetic cases do not expand production support |
| Tolerances must be explicit and machine-verifiable; approximate/unknown rules cannot silently pass | Gold v0.3 §§18–20 and structured contract | `tolerance-rules.final.json`; Gold validator/library | Fully implemented | Decimal quantization, unavailable tolerance, duplicate/missing assertion, privacy, and schema tests | D1–D15 finalization retires `TOL-EXACT` and preserves approved decimal rules |

RA package amendments/clarifications are test-contract metadata and approved conversion decisions. Gold data remains prohibited from production imports.

## 4. RB — canonical financial foundation

| Frozen provision/rule | Owning frozen artifact | Accepted implementation location | Implementation status | Applicable tests/Gold assertions | Later approved amendment |
|---|---|---|---|---|---|
| Analysis/source identity, completeness, provenance, capability, section, occurrence, and repeated-representation identity are first-class | Schema v0.7 §§9–18; Procedures A–B | `src/canonical/v2/sourceModel.ts`; `facts.ts`; `types.ts`; `validate.ts`; Fiserv adapters/admissions | Fully implemented for the accepted shadow foundation | `canonicalEconomicsV2SourceModel.test.ts`; `canonicalEconomicsV2ObservationalFiserv.test.ts`; template-admission tests | `RB-AMEND-005-REPRESENTATION-CONTRIBUTION` makes one contributor explicit for repeated representations |
| Gross sales, refunds, canonical net submitted volume, gross counts, headline count, and average-ticket populations remain distinct | Schema v0.7 §§21–23, 59–61; Procedures C | `facts.ts`; `metrics.ts`; `fiservAdapter.ts`; `fiservEconomicAdapter.ts` | Fully implemented; shadow/evaluation-only | `canonicalEconomicsV2FinancialFoundation.test.ts`; `canonicalEconomicsV2StatesAndDirection.test.ts`; `canonicalEconomicsV2GoldObservation.test.ts`; Gold headline assertions | `RB-AMEND-001-MULTI-POPULATION`; `RB-AMEND-003-GROSS-AVERAGE-TICKET` |
| Headline effective rate uses the canonical denominator; zero denominator is undefined, not numeric zero | Schema v0.7 §§22.2, 23, 59; Procedures C and N; Gold G3/global negatives | `metrics.ts`; `validate.ts`; `goldObservation.ts` | Fully implemented in RB; legacy production output remains outside RB authority | Financial foundation, Gold observation, comparison tests; G3 rate-state assertions | `RB-AMEND-002-UNDEFINED-RATE` explicitly supersedes legacy numeric-zero behavior and aligns implementation with Frozen Gold |
| Refunds, credits, settlement adjustments, chargeback principal, representments, and chargeback fees retain correct direction and distinct populations | Schema v0.7 §§21, 24–27, 45, 48; Procedures C–E, Q–T | `facts.ts`; `fiservEconomicAdapter.ts`; `validate.ts` | Fully implemented for admitted RB inputs; not production-connected | `canonicalEconomicsV2StatesAndDirection.test.ts`; financial/reconciliation tests | `RB-AMEND-004-FINANCIAL-DIRECTION` |
| Reconciliation is template/capability-aware, severity-typed, fail-closed, and does not invent missing financial truth | Schema v0.7 §§25–27, 63; Procedures D–E and §35 | `facts.ts`; `validate.ts`; `diagnostics.ts`; evaluation source-readiness/admission code | Fully implemented for accepted short/full admitted templates and safe observational states | Financial foundation, observational Fiserv, source readiness, short/full template admission, evaluation harness tests | No approved amendment weakens reconciliation; RB amendments refine population and direction semantics |

Accepted RB semantic amendment registry: `src/canonical/v2/versionManifest.ts`. Authority remains `shadow_non_authoritative`; persistence is `none`; AI/research authority is `prohibited`.

## 5. RC — canonical pricing architecture

| Frozen provision/rule | Owning frozen artifact | Accepted implementation location | Implementation status | Applicable tests/Gold assertions | Later approved amendment |
|---|---|---|---|---|---|
| Underlying-cost billing mode, merchant price-schedule shape, and scope uniformity are independent axes | Schema v0.7 §§28–31; Procedures F–J; Gold Part X and S1–S4 | `src/canonical/v2/pricingTypes.ts`; `pricingResolver.ts`; `pricingSemantics.ts`; `pricingValidate.ts` | Fully implemented for accepted shadow pricing | `canonicalPricingV2Architecture.test.ts`; `canonicalPricingV2Gold.test.ts`; comparison/privacy tests | `RC-AMEND-001-INDEPENDENT-PRICING-AXES` |
| Materially different pricing populations retain their own activity, scope, formulas, basis, evidence, and components | Schema v0.7 §§32–33; Procedures F–I | `pricingMath.ts`; `pricingResolver.ts`; `pricingValidate.ts`; `fiservPricingAdapter.ts` | Fully implemented for admitted/observational V2 inputs; not production-connected | Architecture, evidence/states, bounded corrections, observational Fiserv tests | `RC-AMEND-002-POPULATION-SCOPED-PRICING`; `RC-AMEND-003-ACTIVITY-GATED-PRICING`; `RC-AMEND-004-EVIDENCE-BOUND-COMPONENTS` |
| Zero/inactive rows cannot prove active pricing, unresolved axes remain unresolved, and one axis cannot repair another | Schema v0.7 §§29–34; Procedures G–J; Gold pricing discriminators | `pricingResolver.ts`; `pricingValidate.ts`; `pricingDiagnostics.ts` | Fully implemented; fail-closed | Evidence/states, bounded corrections, Gold and comparison tests | RC amendments 001–004 |
| Human pricing summary is derived, lossy, noncanonical, and cannot override canonical axes | Schema v0.7 §34; Procedure J; Freeze Review §3.1 | `pricingSemantics.ts`; `pricingTypes.ts`; `pricingValidate.ts` | Fully implemented; no customer/report authority | Architecture, comparison/privacy, Gold tests | `RC-AMEND-005-NONCANONICAL-PRICING-SUMMARY` |

Accepted RC semantic amendment registry: `src/canonical/v2/pricingVersionManifest.ts`. All RC runtime/report/customer authority remains prohibited.

## 6. RD — economic ledger, ownership/control, and cost stack

| Frozen provision/rule | Owning frozen artifact | Accepted implementation location | Implementation status | Applicable tests/Gold assertions | Later approved amendment |
|---|---|---|---|---|---|
| An economic charge is identified from admitted occurrence/representation evidence, not label/amount coincidence | Schema v0.7 §§16–18, 35–37; Procedures B, K, M | `src/canonical/v2/economicTypes.ts`; `economicAnalysis.ts`; `economicValidate.ts` | Fully implemented for accepted RD shadow contract | `canonicalEconomicV2RepresentationsAndStates.test.ts`; ledger/cost-stack and bounded-corrections tests | `RD-AMEND-001-ECONOMIC-CHARGE-IDENTITY` |
| Collector, intermediary, beneficiary, owner, setters, negotiator, controller, and constraints are independent claims requiring positive identification | Schema v0.7 §§19–20, 35; Procedures K–L; Gold ownership forbidden outcomes | `economicAnalysis.ts`; `economicValidate.ts`; `economicDiagnostics.ts` | Fully implemented; unresolved unless positively proven | `canonicalEconomicV2ParticipantsAndControl.test.ts`; Gold/comparison/privacy; bounded corrections | `RD-AMEND-002-INDEPENDENT-CONTROL-ROLES`; `RD-AMEND-003-POSITIVE-IDENTIFICATION` |
| Numerical reconciliation does not imply semantic classification completeness; unresolved allocation is preserved | Schema v0.7 §§25–27, 41; Procedure M | `economicAnalysis.ts`; `economicValidate.ts` | Fully implemented in shadow | Ledger/cost-stack, representations/states, invariance tests | `RD-AMEND-004-RECONCILED-UNRESOLVED-COST-STACK` |
| Fee credits keep direction; settlement/refund/dispute principal/reserve/funding activity is excluded from processing-fee cost | Schema v0.7 §§24–25, 35–41, 45, 48; Procedures M, Q–T | `economicAnalysis.ts`; `economicValidate.ts`; `fiservEconomicAdapter.ts` | Fully implemented for supported RD admission | Ledger/cost-stack, bounded corrections, Gold/comparison/privacy tests | `RD-AMEND-005-FEE-DIRECTION-AND-NONFEE-EXCLUSION` |
| The ledger proves statement-observed processing cost only; unknown off-statement exposure prevents total-acceptance-cost overclaim | Schema v0.7 §§38–41; Gold global negatives | `economicTypes.ts`; `economicAnalysis.ts`; `economicValidate.ts` | Fully implemented; not production-connected | Ledger/cost-stack, invariance, Gold/comparison/privacy tests | `RD-AMEND-006-STATEMENT-COST-NOT-TOTAL-ACCEPTANCE-COST` |

Accepted RD semantic amendment registry: `src/canonical/v2/economicVersionManifest.ts`. RD remains shadow, non-persistent, non-customer-visible, and has no total-acceptance-cost authority.

## 7. RE — synthesis, counterfactuals, levers, and themes

| Frozen provision/rule | Owning frozen artifact | Accepted implementation location | Implementation status | Applicable tests/Gold assertions | Later approved amendment |
|---|---|---|---|---|---|
| A cost driver is not automatically an opportunity; exclusive, overlapping, and counterfactual attribution must not double count | Schema v0.7 §§42, 62–66; Procedures O–P; Gold S9–S10 | `src/canonical/v2/synthesisAnalysis.ts`; `synthesisSemantics.ts`; `synthesisValidate.ts` | Fully implemented for accepted shadow synthesis | `canonicalSynthesisV2DriversCounterfactualsAndLevers.test.ts`; adversarial admission/comparison tests | `RE-AMEND-001-DRIVER-NOT-OPPORTUNITY`; `RE-AMEND-002-OVERLAP-AWARE-ATTRIBUTION` |
| Counterfactuals require compatible populations, admitted alternatives, deterministic math, period/scope, uncertainty, and no overlap inflation | Schema v0.7 §§53, 66; Procedures P, Y–Z; Gold savings/benchmark negatives | `synthesisAnalysis.ts`; `synthesisValidate.ts`; `synthesisDiagnostics.ts` | Fully implemented; account-savings authority prohibited | Driver/counterfactual/lever, Gold/comparison/privacy, adversarial tests | `RE-AMEND-003-EVIDENCE-BOUND-COUNTERFACTUAL` |
| Merchant levers, recommendations, and savings require proven control or operational influence, recurrence where applicable, and actionability permission | Schema v0.7 §§53–58; Procedures Y–AB; Gold must-not-say/global negatives | `synthesisAnalysis.ts`; `synthesisSemantics.ts`; `synthesisValidate.ts` | Fully implemented as upstream shadow permission state; no customer/report authority | Driver/counterfactual/lever and special-economics/risk/theme tests | `RE-AMEND-004-CONTROL-GATED-MERCHANT-LEVER` |
| Refunds, Amex, services, pricing programs, off-statement exposure, signals, disputes, notices, and future rules remain separately evidenced and noncausal unless proven | Schema v0.7 §§43–52; Procedures Q–V | `synthesisAnalysis.ts`; `synthesisValidate.ts` | Fully implemented for accepted RE contract; unresolved states preserved | `canonicalSynthesisV2SpecialEconomicsRiskAndThemes.test.ts`; adversarial tests | `RE-AMEND-005-SEPARATE-SPECIAL-ECONOMIC-FLOWS`; `RE-AMEND-006-TEMPORAL-NOTICE-ISOLATION`; `RE-AMEND-007-SIGNAL-RISK-NONCAUSALITY` |
| Themes group one economic question, deduplicate evidence, preserve permissions, and do not manufacture prose | Schema v0.7 §§54–58; Procedures AA–AB; Freeze Review §3.12 | `synthesisAnalysis.ts`; `synthesisSemantics.ts`; `synthesisValidate.ts` | Fully implemented; shadow/evaluation-only | Special-economics/risk/themes and Gold/comparison/privacy tests | `RE-AMEND-008-SEMANTIC-THEME-SYNTHESIS` |

Accepted RE semantic amendment registry: `src/canonical/v2/synthesisVersionManifest.ts`. RE has no persistence, runtime, customer, report, knowledge-resolution, or savings authority.

## 8. RF — Payments Knowledge Library

| Frozen provision/rule | Owning frozen artifact | Accepted implementation location | Implementation status | Applicable tests/Gold assertions | Later approved amendment |
|---|---|---|---|---|---|
| Stable schema/procedure concepts stay out of volatile runtime knowledge; entries are claim-specific and typed | Knowledge Library v0.2 Parts I–III; Schema v0.7 §67 | `src/canonical/v2/knowledge/knowledgeTypes.ts`; `knowledgePolicy.ts`; `knowledgeValidate.ts` | Fully implemented for accepted in-memory shadow library | `canonicalKnowledgeV2AdmissionAuditUnknown.test.ts`; Gold tests | `RF-AMEND-001-CLAIM-SPECIFIC-KNOWLEDGE` |
| Reuse scope, tenant/account privacy, processor/network/program/template/population scope, and anti-poisoning boundaries are explicit | Knowledge Library v0.2 §§4A–4D, 6–8, 16–17 | `knowledgeTypes.ts`; `knowledgePolicy.ts`; `knowledgeSafety.ts`; `knowledgeValidate.ts` | Fully implemented; no production persistence/service | Admission/audit/unknown, bounded correction, adapters/comparison/privacy tests | `RF-AMEND-002-SCOPE-TENANT-ISOLATION`; `RF-AMEND-007-CANDIDATE-AUTHORITY-SEPARATION` |
| Evidence admission is claim-specific; runtime candidates never self-admit or broaden scope | Knowledge Library v0.2 §§9–12, 16–19; Procedures W–X | `knowledgePolicy.ts`; `knowledgeResolver.ts`; `knowledgeAdapters.ts`; `knowledgeAudit.ts` | Fully implemented; runtime candidates require human admission | Resolver, admission/audit/unknown, adapters/comparison/privacy tests; Gold S8 | `RF-AMEND-003-EXPLICIT-ADMISSION`; `RF-AMEND-007-CANDIDATE-AUTHORITY-SEPARATION` |
| Deterministic specificity, equal-specificity conflict refusal, effective dating, and supersession govern resolution | Knowledge Library v0.2 §§13–19; Procedure W; Gold S8 | `knowledgeResolver.ts`; `knowledgePolicy.ts`; `knowledgeValidate.ts` | Fully implemented and exercised RF-first in internal analysis | `canonicalKnowledgeV2Resolver.test.ts`; bounded correction; `observationOriginRfWiring.test.ts` | `RF-AMEND-004-DETERMINISTIC-SPECIFICITY`; `RF-AMEND-005-CONFLICT-REFUSAL`; `RF-AMEND-006-EFFECTIVE-DATED-SUPERSESSION` |
| Unknowns are first-class, prioritized for research, and never guessed | Knowledge Library v0.2 §§30–31; Schema v0.7 §§4, 57 | `knowledgeUnknownQueue.ts`; `knowledgeResolver.ts`; `knowledgeAudit.ts` | Fully implemented for supplied entries/internal analysis; production service absent | Admission/audit/unknown, Gold, observation-origin/RF-wiring tests | `RF-AMEND-008-FIRST-CLASS-UNKNOWN-QUEUE` |

Accepted RF amendment registry: `src/canonical/v2/knowledge/knowledgeVersionManifest.ts`. Later accepted integration (`103837c`, `37ac556`, `851169a`) wires RF-first resolution and privacy-safe audit provenance into the internal-analysis harness only. `runtimeConnection` remains `none`; persistence remains in-memory supplied entries only; real seed admission remains prohibited.

## 9. RG — Runtime Intelligence

| Frozen provision/rule | Owning frozen artifact | Accepted implementation location | Implementation status | Applicable tests/Gold assertions | Later approved amendment |
|---|---|---|---|---|---|
| Research begins only from material unresolved canonical/RF dependencies; RF resolves first; contract/private-only questions do not trigger futile public search | Runtime Policy v0.1 §§3–10; Knowledge Library §§13, 16; Schema v0.7 §69 | `src/canonical/v2/intelligence/questionPlanning.ts`; `budgetLedger.ts`; `runtime.ts`; internal `observationOrigins.ts` | Fully implemented for accepted evaluation profiles; dynamic production question generation remains not connected | Planning/budget, runtime, bounded-corrections, observation-origin/RF-wiring tests | `RG-AMEND-001-DETERMINISTIC-QUESTION-SELECTION`; `RG-AMEND-002-ADMITTED-KNOWLEDGE-FIRST`; Runtime Policy Amendment v0.2 replaces permanent fixed question-count semantics |
| Each evaluation operation reserves bounded work; failures consume reservations; canonical truth survives provider/retrieval/budget failure | Runtime Policy v0.1 §§12–17, 27–29, 33–35 | `budgetLedger.ts`; `remoteConcurrency.ts`; `runtime.ts`; `providerAdapters.ts` | Fully implemented for `RG-FREE-v1` evaluation; partially implemented against adaptive production policy because scheduling/ledger redesign is not authorized yet | Planning/budget, runtime, safety/batching, bounded-corrections, live failure recovery tests | `RG-AMEND-003-RESERVATION-BOUNDED-EXECUTION`; `RG-AMEND-007-FAILURE-PRESERVES-CANONICAL-TRUTH`; Runtime Policy Amendment v0.2 §§7–9 supersedes fixed production completeness cutoffs |
| Public retrieval maintains question/attempt/candidate/document/locator/support identities, destination safety, fingerprints, locators, authority, period/scope, and applicability | Runtime Policy v0.1 §§18–21; Knowledge Library §§9–10; Schema v0.7 §§14, 68–69 | `retrievalSafety.ts`; `publicRetrievalAdapters.ts`; `publicDocumentExtraction.ts`; `sourceAuthority.ts`; `publicSourceAuthorityRegistry.ts`; `runtime.ts` | Fully implemented for injected/internal-live accepted topology and exact admitted authorities; dynamic production source admission absent | Authority/comparison, runtime, provider infrastructure, public registry, processor-presentation authority tests | `RG-AMEND-004-IDENTITY-COMPLETE-RESEARCH-GRAPH`; `RG-AMEND-005-SEMANTIC-NOT-SUBSTRING-SUPPORT`; `RG-AMEND-012-KNOWN-AUTHORITY-DISCOVERY-RESILIENCE` |
| Investigation and semantic verification are separate; support requires semantic, authority, locator, period, scope, applicability, and local admission checks | Runtime Policy v0.1 §§19–24; Knowledge Library §§9A, 16–17 | `semanticVerification.ts`; `providerSchemas.ts`; `structuredMemberValidation.ts`; `providerReadiness.ts`; `runtime.ts` | Separate calls/contracts and deterministic validation implemented for accepted topology; same-model permission is normative but no payload/runtime change is made here | Semantic/language/RF, safety/batching, provider readiness, provider infrastructure tests | `RG-AMEND-005`; `RG-AMEND-008-AI-NON-MUTATION`; Runtime Policy Amendment v0.2 §5 expressly permits same provider/model without treating calls as extra evidence |
| Uploaded/retrieved content is untrusted data; prompt injection cannot alter tools, policy, scope, canonical facts, or admission | Runtime Policy v0.1 §1 and §§18, 22; Knowledge Library §4C; Schema v0.7 §68; Gold S7 | `providerAdapters.ts`; `providerSchemas.ts`; `retrievalSafety.ts`; `structuredMemberValidation.ts`; `intelligenceValidate.ts` | Fully implemented for accepted RG boundaries; evaluation-only | Safety/batching, bounded-corrections, provider infrastructure; Gold S7 | `RG-AMEND-009-UNTRUSTED-CONTENT-ISOLATION`; expressly preserved by Runtime Policy Amendment v0.2 |
| Runtime research emits only account-private candidates, never admitted RF knowledge, financial mutation, report authority, or source-strength inflation | Runtime Policy v0.1 §§21, 23, 25–29; Knowledge Library §§16–19 | `runtime.ts`; `knowledgeAdapters.ts`; `intelligenceValidate.ts`; internal audit projection | Fully implemented in accepted internal analysis | Semantic/language/RF, bounded-corrections, harness and live-boundary tests | `RG-AMEND-006-CANDIDATE-NOT-ADMISSION`; `RG-AMEND-008-AI-NON-MUTATION` |
| Provider context may include the complete statement when useful, while public query compilation remains privacy-separated | Runtime Policy v0.1 §2 as amended | Current accepted code uses purpose-shaped/sanitized provider contexts in `providerPrivacy.ts`; public research paths validate bounded query/context | **Partially implemented:** public query/privacy safety exists; complete-provider-context permission is not yet reflected in payload behavior by explicit package boundary | Provider infrastructure, observation-origin privacy, live boundary tests | Runtime Policy Amendment v0.2 §§3–4 supersedes mandatory minimization for approved AI context but preserves public-query separation and diagnostic privacy |
| Production work adapts by material claim, evidence objective, progress, diminishing returns, cost/resource accounting, early completion, and emergency circuit breakers | Runtime Policy v0.1 §§12–17, 31–35 as amended | Current `budgetLedger.ts`, internal live timing policy, runtime stop/degradation paths | **Partially implemented:** evaluation budgets/timing are bounded, but adaptive production scheduling and work-ledger semantics are not implemented or production-connected | Existing planning/budget and internal-live tests prove evaluation behavior only | Runtime Policy Amendment v0.2 §§7–9; existing `RG-AMEND-011-INTERNAL-LIVE-TIMING-V2` remains an internal-live operational profile, not production completeness truth |
| Theme-language AI is non-authoritative, reference-validated, bounded, and has deterministic fallback | Runtime Policy v0.1 §24 | `themeLanguage.ts`; `structuredBatching.ts`; `intelligenceValidate.ts` | Fully implemented for evaluation; RH deliberately ignores RG language candidates in initial report | Semantic/language/RF and safety/batching tests | `RG-AMEND-010-BOUNDED-THEME-LANGUAGE-CANDIDATE`; RH amendment 010 preserves deterministic report fallback |

Accepted RG amendment registry: `src/canonical/v2/intelligence/intelligenceVersionManifest.ts` plus the internal-live timing amendment in `intelligenceTypes.ts`. Runtime Policy Amendment v0.2 is the only amendment in this package that explicitly supersedes frozen Runtime Policy text.

Later accepted integration work covered by this baseline:

- `103837c` — shadow end-to-end internal analysis across deterministic RB–RH and injected RG;
- `5562d46` through `b251113` — public-source registry, retrieval/provider boundaries, timeout accounting, readiness, and semantic lineage;
- `37ac556` and `851169a` — reusable internal audit boundaries and safe RF/retrieval provenance;
- `d4d193f` — reusable admitted full-layout Fiserv family evaluation path;
- `6c1450c` — reusable full-layout investigation planner;
- `38bd5e8` — bounded Fiserv processor-presentation authority and locator coverage.

This integration remains internal/evaluation work. It does not establish dynamic source admission, an RF production service, production provider payload policy, adaptive scheduling, or RG upload wiring.

## 10. RH — Merchant Report V2 projection

| Frozen provision/rule | Owning frozen artifact | Accepted implementation location | Implementation status | Applicable tests/Gold assertions | Later approved amendment |
|---|---|---|---|---|---|
| Customer projection consumes accepted canonical economics only and never legacy/AI output as competing financial truth | Schema v0.7 §§1–3, 58, 72–76; Gold global negatives | `src/canonical/v2/report/reportProjection.ts`; `reportValidate.ts`; `reportTypes.ts` | Fully implemented for shadow backend evaluation | `canonicalReportV2Projection.test.ts`; `canonicalReportV2GoldSafety.test.ts` | `RH-AMEND-001-V2-SOURCE-OF-TRUTH`; `RH-AMEND-012-REPORT-V1-COEXISTENCE` |
| Readiness, comparison, findings, priority, evidence, questions, and public experience remain independent; unavailable is not silently converted to a verdict | Schema v0.7 §§55–58; Gold case permissions | `reportProjection.ts`; `reportPermissions.ts`; `reportTypes.ts` | Fully implemented; evaluation-only | Projection and Gold safety tests | `RH-AMEND-002-THREE-PUBLIC-EXPERIENCES`; `RH-AMEND-003-INDEPENDENT-VERDICT-AXES`; `RH-AMEND-004-QUALIFIED-COMPARISON-OR-UNAVAILABLE` |
| Merchant Attention comes from supported RE themes; composition is dynamic/reconciled; credits remain signed; impact differs from verification-only amounts | Schema v0.7 §§41, 53–58; Procedures Y–AB; Gold must-not-say | `reportProjection.ts`; `reportPermissions.ts`; `reportDiagnostics.ts` | Fully implemented for accepted RH projection | Projection and Gold safety tests | `RH-AMEND-005-THEME-BASED-ATTENTION`; `RH-AMEND-006-DYNAMIC-RECONCILED-COMPOSITION`; `RH-AMEND-007-IMPACT-VERIFICATION-SEPARATION` |
| Every visible claim/action is capped by upstream evidence, controllability, recurrence, counterfactual, recommendation, impact, and report permission | Schema v0.7 §§53–58, 76; Procedures Y–Z; Gold §15 and S10 | `reportPermissions.ts`; `reportProjection.ts`; `reportValidate.ts` | Fully implemented for accepted shadow contract; no production/customer authority | Projection and Gold safety tests | `RH-AMEND-008-EVIDENCE-ACTIONABILITY-CEILINGS`; `RH-AMEND-011-SINGLE-STATEMENT-ACTION-CEILING` |
| Customer language is typed, deterministic, uncertainty-preserving, and cannot use non-authoritative AI language to strengthen claims | Runtime Policy v0.1 §24; Schema v0.7 §§8, 58; Gold must-not-say | `reportCopy.ts`; `reportProjection.ts`; `reportValidate.ts` | Fully implemented; RG language candidates intentionally ignored | Projection and Gold safety tests | `RH-AMEND-009-TYPED-CUSTOMER-COPY`; `RH-AMEND-010-DETERMINISTIC-LANGUAGE-FALLBACK` |
| Safe unresolved completion remains a valid customer outcome | Schema v0.7 §§4–5, 57–58, 76; Runtime Policy v0.1 §§17, 28–29 | `reportProjection.ts`; `reportPermissions.ts`; `reportCopy.ts` | Fully implemented for report projection; not production-connected | Projection/Gold safety; internal analysis harness validation | No supersession; Runtime Policy Amendment v0.2 expressly preserves safe unresolved completion |

Accepted RH semantic amendment registry: `src/canonical/v2/report/reportVersionManifest.ts`. Its manifest states `authority: shadow_non_authoritative`, `persistence: none`, `runtimeIntegration: none`, and `reportV1Authority: unchanged`.

## 11. Non-drift gates for future packages

A future implementation package must fail review if it:

1. changes or rewrites a frozen original rather than adding a versioned amendment;
2. imports RA Gold expected data into production configuration or statement routing;
3. lets AI/research mutate RB–RE canonical truth;
4. collapses RC axes or RD control roles without positive evidence;
5. creates a lever, recommendation, savings, or impact without RE gates;
6. lets RF candidates self-promote, escape tenant/account scope, ignore dates, or win an equal-specificity conflict;
7. treats search/retrieval/model output as evidence without RG identity, authority, locator, period, scope, applicability, and semantic admission;
8. interprets full approved-provider context as permission to leak private statement data into public queries;
9. treats two same-model calls as two sources or as higher authority;
10. treats an emergency wall-time/resource ceiling as proof of analytical completeness;
11. lets RH exceed upstream evidence/actionability/report permissions or alters Report V1 without explicit authorization;
12. hides unresolved material work after degradation.

Any approved exception must identify the exact frozen provision, the superseding versioned amendment, the affected implementation and tests, and the new production-connection status in this crosswalk.
