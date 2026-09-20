# RateReveal Gold Authority & Derivability Contract v1

Status: **Frozen Product contract**  
Contract identity: `ratereveal_gold_authority_derivability_contract_v1`  
Register identity: `ratereveal_gold_authority_derivability_register_v1`  
Schema identity: `ratereveal_gold_authority_derivability_schema_v1`  
Freeze date: 2026-09-19

## 1. Purpose and force

This document and its machine-readable schema/register freeze the authority and derivability meaning of RateReveal Gold. Future engineering may implement this contract, but may not silently redefine its assertion semantics, authority lanes, missing-authority behavior, provenance boundaries, or permitted customer language.

This freeze authorizes future engineering specification against the contract and future independent evaluation of the frozen outcomes. It does **not** authorize production parser changes, canonical classification or ownership changes, opportunity/savings changes, Phase 2 evidence admission, live research, a universal fee taxonomy, private-document infrastructure, a knowledge-corpus migration, customer report or frontend changes, provider/model/configuration changes, deployment, or any claim that source mappings are complete.

## 2. Frozen Product principles

1. Material conclusions are independent claims. An observed value, calculation, structural inference, normalized identity, ownership dimension, policy judgment, and resolution state must not share one overloaded truth state.
2. Reasoning class is independent of resolution status. `unresolved_or_refused` is not a reasoning method.
3. Authority is claim-specific. There is no universal source hierarchy and no evidence lane may establish a dimension outside its authority.
4. Labels are evidence, not authority. Familiar labels can be observed and can create hypotheses; alone they cannot establish architecture, official identity, ownership, beneficiary, contractual control, at-cost treatment, negotiability, or removability.
5. Broad economic category is separate from exact normalized identity. `merchant_pricing_component` is not synonymous with `processor_markup`.
6. Processor markup is a strong claim. It requires compatible evidence of the merchant-facing component and underlying cost or merchant-private processor-control evidence. Markup is not retained profit.
7. Ownership is multidimensional: biller/issuer, collector, economic beneficiary, contractual controller, merchant-facing price controller, and retained-margin recipient remain separate.
8. Unknown is a valid state. Missing authority must not be coerced into a known category for coverage.
9. Product policy is not statement, financial, contractual, or industry truth, even when deterministic.
10. Correct refusal is successful behavior. Unsupported positive admission, evidence-lane leakage, historical back-projection, and unreviewed merchant-private-to-global promotion each have zero tolerance.

## 3. Stable reasoning classes

| Reasoning class | Permitted meaning |
|---|---|
| `direct_observation` | A value, label, date, amount, section, or other fact present in the accepted source scope. |
| `deterministic_calculation` | Reproducible arithmetic from admitted observations, with compatible sign, denominator, units, and population. |
| `template_structural_inference` | A documented relationship within a versioned statement/template family; never universal by default. |
| `economic_structural_inference` | Broad mechanics, component, or pricing-shape inference with explicit limitations. |
| `governed_public_dependency` | Effective-dated official network/regulator or processor/acquirer publication within publisher, scope, population, and geography. |
| `merchant_private_dependency` | Merchant-specific contract, schedule, correspondence, or processor explanation. |
| `product_policy_judgment` | Reviewed materiality, visibility, priority, blocking, reportability, severity, action-language, or suppression policy. |

Resolution uses the separate states `supported`, `partially_supported`, `unresolved`, `refused`, `source_mapping_incomplete`, `source_unavailable`, `gold_ambiguity`, and `policy_blocked`. A refusal can therefore retain the reasoning class that establishes why a positive claim is prohibited.

Each assertion records both `resolution.semanticStatus`/`semanticEvaluationOutcome` and `resolution.status`/`expectedEvaluationOutcome`. The former freezes the approved meaning (including a correct refusal); the latter records present source-execution readiness. Thus a G1-G8 refusal remains semantically refused while current evaluation is blocked by source mapping. G9 remains historical guidance, not a source-executable pass.

## 4. Claim-specific authority lanes

| Authority lane | Approved authority |
|---|---|
| `statement_source_document` | What was printed, represented, billed, and charged within accepted document scope. |
| `deterministic_arithmetic` | Arithmetic using admitted inputs and an explicit compatible denominator/population. |
| `versioned_template_mapping` | Documented within-template relationships only. |
| `statement_structural_evidence` | Broad mechanics or pricing shape; not exact owner, official identity, contract, or retained profit. |
| `governed_network_regulator` | Official network/regulatory rules, programs, rates, populations, and periods within stated scope. |
| `governed_processor_acquirer_publication` | The publisher's own schedule or program description within stated scope. |
| `governed_public_mixed` | A claim requiring compatible governed public lanes that cannot safely be reduced to one publisher class. |
| `merchant_private_contract_or_correspondence` | Merchant-specific contractual facts; never reusable global truth without a separate reviewed process. |
| `reviewed_product_policy` | Product materiality, wording, visibility, priority, blocking, and action ceilings. |
| `synthetic_falsification_input` | Adversarial test semantics only; never an expansion of production processor support. |

Every normalized assertion carries both a claim dimension and one or more authority lanes. Those fields are deliberately independent.

## 5. Strong-claim boundaries

### Processor markup and ownership

Position, percentage basis, processor-branded section, and labels such as `DISC`, `QUAL`, or `NQUAL` cannot establish processor markup. Processor billing or collection cannot establish economic beneficiary, contractual controller, price controller, or retained-margin recipient. Each ownership/control dimension needs compatible authority.

### Narrow replacement for `proven_at_cost`

The broad future meaning of `proven_at_cost` is retired. Rate equality may establish only an equality-under-tolerance claim after the reference publisher, effective period, scope/population, billing basis, and denominator are admitted. It does not prove contractual pass-through, absence of separately billed spread, or processor retention. Future implementations should use narrow states such as `observed_rate_matches_admitted_reference`, `observed_rate_exceeds_admitted_reference`, `observed_rate_below_admitted_reference`, `reference_scope_or_period_insufficient`, `contractual_pass_through_unverified`, and `processor_retention_unverified`.

### Recurrence and annualization

Observed statement-period amount, recurrence status, cadence, annualization permission, annualized amount, and estimated annual amount are separate claims. Recurrence requires explicit statement cadence, repeated compatible statements, an effective-dated governed program cadence, or merchant-private agreement. A single unlabeled occurrence is neither monthly nor annual.

### Benchmark, counterfactual, and savings

Observed cost alone does not create savings. A savings claim requires a named counterfactual plus target authority, compatible identity, scope, population, denominator, historical/effective period, merchant applicability, recurrence/cadence, document completeness, and overlap controls. Missing any required link produces a typed refusal or unresolved state and blocks downstream savings.

## 6. Independent completeness gates

| Gate | Minimum authority question |
|---|---|
| Observed-page fact eligibility | Is the fact present on an accepted page/section? |
| Statement-total eligibility | Are all contributing sections/pages and sign conventions reconciled? |
| Fee-composition eligibility | Are gross charges, credits/adjustments, repeated representations, unresolved amounts, and exclusions explicitly accounted for? |
| Pricing-architecture eligibility | Is the accepted scope sufficient for architecture, rather than one page or familiar labels? |
| Comparison eligibility | Are identity, scope, population, denominator, and effective period compatible? |
| Actionability eligibility | Is contractual/control authority present and is Product policy satisfied? |
| Savings eligibility | Is the full counterfactual, cadence, completeness, and non-overlap chain satisfied? |

Accounting completeness compares printed gross fees with reconciled contributing charges. Economic-classification completeness uses printed gross fees and separately identifies credits/adjustments. Merchant-facing completeness uses printed gross fees while explicitly reporting unresolved/excluded amounts, repeated representations, credits/adjustments, and partial coverage. Signed canonical contribution totals remain useful but are not the sole economic-coverage denominator.

## 7. Temporal, universality, provenance, and refusal

Public claims are effective-dated and cannot be projected backward. A current source does not prove a historical period. Every assertion declares one universality scope: universal acquiring/accounting, network-specific, processor-family-specific, template-specific, merchant/account-specific, or Product-policy-only.

Semantic approval is separate from source executability, source identity, and provenance. G1-G8 semantics are approved but source mapping remains incomplete; G6 exact source identity remains unresolved; G9 is preserved as non-executable historical semantic guidance because its original source is unavailable. Repository fixtures remain provisional unless authoritative equivalence is proven. S1-S10 remain synthetic. The 25 global prohibitions remain Product policy.

When authority is missing, the evaluator must preserve any independently supported narrower claim, return a typed refusal or unresolved state for the stronger claim, and block dependent dimensions. Correct refusal is a passing semantic outcome.

## 8. Decomposition and lineage

The source corpus contains 348 approved assertions. The normalized register contains 369. Product identified 49 mixed assertions: 21 are split into independent children and 28 are re-annotated without changing their approved meaning.

Decomposed originals: `G1-INTERCHANGE-DIFFERENCE`, `G1-PRICE-SUMMARY`, `G2-PRICE-SUMMARY`, `G4-PRICE-SUMMARY`, `G4-REG-DEBIT-COST`, `G4-REG-DEBIT-COST-RATE`, `G4-REG-DEBIT-SHARE`, `G4-REG-DEBIT-VOLUME`, `G4-REWARDS-COST-SHARE`, `G4-REWARDS-VOLUME`, `G4-REWARDS-VOLUME-SHARE`, `G4-WATS`, `G5-PREMIUM-COST-SHARE`, `G5-PREMIUM-VOLUME`, `G5-PREMIUM-VOLUME-SHARE`, `G5-PRICE-SUMMARY`, `G6-PRICE-SUMMARY`, `G7-OTHER-COMPONENTS`, `G7-PRICE-SUMMARY`, `G8-PRICE-SUMMARY`, `G9-PRICE-SUMMARY`.

Re-annotated mixed originals: `G1-PRICE-SCOPE`, `G1-PRICE-SHAPE`, `G1-PRICE-UNDERLYING`, `G2-PRICE-SCOPE`, `G2-PRICE-SHAPE`, `G2-PRICE-UNDERLYING`, `G3-PRICE-SCOPE`, `G3-PRICE-SHAPE`, `G3-PRICE-UNDERLYING`, `G4-PRICE-SCOPE`, `G4-PRICE-SHAPE`, `G4-PRICE-UNDERLYING`, `G5-PRICE-SCOPE`, `G5-PRICE-SHAPE`, `G5-PRICE-UNDERLYING`, `G6-NON-AMEX-SCOPE`, `G6-PRICE-SCOPE`, `G6-PRICE-SHAPE`, `G6-PRICE-UNDERLYING`, `G6-SECURITY-PRIORITY`, `G7-PRICE-SCOPE`, `G7-PRICE-SHAPE`, `G7-PRICE-UNDERLYING`, `G8-PRICE-SCOPE`, `G8-PRICE-SHAPE`, `G8-PRICE-UNDERLYING`, `G8-PRICING-BASE`, `G9-RATE-INTERPRETATION`.

Every normalized child carries `lineage.sourceAssertionId`, a decomposition kind, and a flag showing whether that child preserves the original expected value. No original assertion is dropped. No decomposition requires Product clarification under the completed adjudication.

## 9. Evaluation taxonomy and future metrics

The independent outcomes are `correct_answer`, `correct_refusal`, `unsupported_inference`, `incorrect_conclusion`, `extraction_failure`, `missing_source_authority`, `gold_ambiguity`, `source_mapping_incomplete`, and `policy_mismatch`.

The schema supports future measurement of direct-observation and deterministic-calculation accuracy; denominator/population correctness; reconciliation coverage; template/economic/normalized-identity precision; false admission and unsupported inference; correct refusal; public-authority coverage; private dependency; effective-date correctness; provenance completeness; unresolved gross/signed dollars; completeness gates; counterfactual validity; savings false positives; and Product-policy conformance. Search-result count and candidate retrieval count are not primary quality measures. This contract sets no new production threshold.

## 10. Frozen register counts

### Reasoning class

| Class | Count |
|---|---:|
| `deterministic_calculation` | 29 |
| `direct_observation` | 108 |
| `economic_structural_inference` | 60 |
| `governed_public_dependency` | 18 |
| `merchant_private_dependency` | 2 |
| `product_policy_judgment` | 148 |
| `template_structural_inference` | 4 |

### Primary authority lane

| Lane | Count |
|---|---:|
| `deterministic_arithmetic` | 27 |
| `governed_network_regulator` | 11 |
| `governed_processor_acquirer_publication` | 1 |
| `governed_public_mixed` | 6 |
| `merchant_private_contract_or_correspondence` | 2 |
| `reviewed_product_policy` | 148 |
| `statement_source_document` | 103 |
| `statement_structural_evidence` | 51 |
| `synthetic_falsification_input` | 16 |
| `versioned_template_mapping` | 4 |

### Resolution status

| Status | Count |
|---|---:|
| `refused` | 36 |
| `source_mapping_incomplete` | 287 |
| `source_unavailable` | 26 |
| `supported` | 18 |
| `unresolved` | 2 |

### Approved semantic resolution (independent of source executability)

| Status | Count |
|---|---:|
| `refused` | 83 |
| `supported` | 253 |
| `unresolved` | 33 |

### Source execution status

| Status | Count |
|---|---:|
| `not_source_executable` | 287 |
| `product_policy_executable` | 25 |
| `source_unavailable` | 26 |
| `synthetic_executable` | 31 |

### Source provenance status

| Status | Count |
|---|---:|
| `not_applicable_policy` | 25 |
| `synthetic_authored` | 31 |
| `unproven` | 313 |

## 11. Case provenance

| Case | Kind | Original | Normalized | Source identity | Execution | Provenance |
|---|---|---:|---:|---|---|---|
| G1 | real_statement | 35 | 37 | `pending_authoritative_mapping` | `not_source_executable` | `unproven` |
| G2 | real_statement | 33 | 34 | `pending_authoritative_mapping` | `not_source_executable` | `unproven` |
| G3 | real_statement | 24 | 24 | `pending_authoritative_mapping` | `not_source_executable` | `unproven` |
| G4 | real_statement | 40 | 49 | `pending_authoritative_mapping` | `not_source_executable` | `unproven` |
| G5 | real_statement | 38 | 42 | `pending_authoritative_mapping` | `not_source_executable` | `unproven` |
| G6 | real_statement | 37 | 38 | `unresolved_identity` | `not_source_executable` | `unproven` |
| G7 | real_statement | 27 | 29 | `pending_authoritative_mapping` | `not_source_executable` | `unproven` |
| G8 | real_statement | 33 | 34 | `pending_authoritative_mapping` | `not_source_executable` | `unproven` |
| G9 | real_statement | 25 | 26 | `source_unavailable` | `source_unavailable` | `unproven` |
| S1 | synthetic_adversarial | 4 | 4 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S2 | synthetic_adversarial | 4 | 4 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S3 | synthetic_adversarial | 3 | 3 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S4 | synthetic_adversarial | 6 | 6 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S5 | synthetic_adversarial | 2 | 2 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S6 | synthetic_adversarial | 2 | 2 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S7 | synthetic_adversarial | 3 | 3 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S8 | synthetic_adversarial | 2 | 2 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S9 | synthetic_adversarial | 2 | 2 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| S10 | synthetic_adversarial | 3 | 3 | `synthetic` | `synthetic_executable` | `synthetic_authored` |
| GLOBAL | global_policy | 25 | 25 | `not_applicable_policy` | `product_policy_executable` | `not_applicable_policy` |

## 12. Case-specific semantic boundaries

- **G1:** Composite pricing and the observed `QUAL DISC` label remain distinct; exact ownership, pricing-fairness, and dispute-ratio claims are refused without their own authority.
- **G2:** Tiered/bundled structure and `ADDITIONAL FEES` remain bounded observations; exact interchange/processor split is refused and Visa activity remains ambiguous.
- **G3:** Zero denominator yields an undefined effective rate, not numeric zero; minimum fee is observed, while recurrence and zero-volume pricing model remain independently unresolved.
- **G4:** Itemized mechanics, WATS, regulated-debit/rewards populations, and denominator-specific rate options are separate; neither labels nor ratios confer exact owner or a pricing verdict.
- **G5:** Preserve 2.0740% precision on its canonical denominator; ECR/WATS/Amex mapping and ownership limits remain distinct from any unsupported comparison-population counterfactual or savings.
- **G6:** Exact source identity and mapping remain unresolved; service removability depends on merchant-private terms and an authorization-fee label does not prove economic ownership.
- **G7:** Future notice is effective-dated, not back-projected; administrative/per-item ownership, debit share, and contract dependency are separately gated.
- **G8:** The 3.8% flat bundled merchant price is not all processor margin; benchmark, counterfactual, savings, and dispute-ratio claims remain refused without their separate evidence chains.
- **G9:** Page-bounded facts remain historical semantic guidance. The missing original source bars source execution, and partial-document coverage suppresses full pricing/decomposition/savings conclusions.
- **S1-S10:** Respectively preserve scope-specific bundled pricing; genuine hybrid structure; subscription plus pass-through; dual-pricing net burden; direct-Amex structure; adjustment outside fees; untrusted-content injection refusal; equal-specificity knowledge conflict; benchmark denominator mismatch; and savings-without-counterfactual refusal. They remain synthetic falsification cases.
- **GLOBAL:** All 25 prohibitions remain explicit reviewed Product-policy reasoning constraints, not inferred financial or industry facts.

## 13. Machine contract

The authoritative machine representation is `test/fixtures/gold-contract/gold-authority-derivability-v1.json`, validated by `test/fixtures/gold-contract/gold-authority-derivability.schema.json`. The deterministic freeze manifest binds this document, schema, register, conflict report, and source inputs with SHA-256 hashes.
