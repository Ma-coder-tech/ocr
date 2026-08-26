# RateReveal Merchant Processing Economics Schema v0.7

**Status:** Product-model release candidate after corpus falsification and final red-team cleanup.  
**Supersedes:** v0.6.  
**Scope:** Merchant card-processing statement economics. Fiserv-family statement templates are the first declared product scope; the conceptual model is processor-agnostic.  
**Purpose:** Define the stable economic objects, invariants, canonical metric populations, permissions, and audit requirements that RateReveal must implement. Ordered domain reasoning belongs in **Decision Procedures v0.2**; volatile mappings and rules belong in **Payments Knowledge Library v0.2**; AI/research behavior belongs in **Runtime Intelligence Policy v0.1**.

---

# 0. Normative hierarchy

The RateReveal product model is intentionally split so that stable concepts do not drift with changing network vocabulary or runtime behavior.

1. **Economics Schema v0.7 — authoritative for objects and invariants.**
2. **Decision Procedures v0.2 — authoritative for ordered economic reasoning and mathematics.**
3. **Gold Answer Tables v0.3 — authoritative for expected and forbidden answers in reference cases.**
4. **Payments Knowledge Library Spec v0.2 — authoritative for effective-dated mappings, rules, evidence admission, and knowledge scope.**
5. **Runtime Intelligence Policy v0.1 — authoritative for AI/research eligibility, budgets, degradation, and knowledge-candidate behavior.**
6. **Falsification / changelog artifacts — explanatory history, not runtime truth.**

When documents conflict, the artifact that owns the concept wins. A runtime implementation must not silently invent a seventh source of truth.

---

# PART I — PRODUCT STANDARD AND NON-NEGOTIABLE PRINCIPLES

## 1. Product standard

RateReveal is not a fee-label explainer. It is a **merchant-processing economics reconstruction and decision-support system**.

For every supported statement it should attempt to answer:

1. What happened financially during the period?
2. Does the statement reconcile under the correct template-family accounting graph?
3. What pricing structure was actually active, and for which transaction populations?
4. Where did the statement-observed processing cost go economically?
5. Who billed each cost, who benefits economically, who sets the rate/rule, who can negotiate it, and what constraints apply?
6. What explains the merchant’s observed effective cost?
7. What is controllable, operationally influenceable, merely explanatory, unresolved, or structurally unknowable?
8. What is proven by the statement, what is deterministic math, what requires dated external rules, merchant documents, history, processor explanation, or remains unknown?
9. Which current/future rules are actually applicable to the statement period, jurisdiction, merchant type, and product scope?
10. What are the smallest number of merchant-relevant conclusions that explain the account without overclaiming?

## 2. Four truth layers

RateReveal MUST keep these layers separate:

1. **Source truth** — what the uploaded statement literally states.
2. **Financial truth** — what deterministic math proves from source truth.
3. **Economic truth** — what financially correct amounts mean in the payment value chain.
4. **Merchant interpretation** — concise explanation, prioritization, uncertainty, and next steps.

A source row is not automatically a unique economic cost. Statements may repeat the same economics in fee ledgers, subtotals, interchange detail, card summaries, funding tables, or notices.

## 3. AI boundary

AI MAY interpret, cluster, hypothesize, research, and explain. AI MUST NOT author or override:

- source amounts/signs;
- sales/refund/fee totals;
- transaction counts;
- funding arithmetic;
- canonical effective rate;
- deterministic reconciliation;
- deterministic fee or driver sums;
- exact savings/overcharge claims without approved inputs and deterministic calculations.

## 4. Unknown is valid

The schema MUST support explicit uncertainty. A missing answer is safer than a fabricated exact answer.

## 5. Document capability governs depth

A detailed IC+ statement can support a deep reconstruction. A bundled/tiered or incomplete statement may support only top-level financial truth and limited pricing conclusions. Both can be useful, but not equally precise.

## 6. Time and applicability matter

Rates, rules, product names, dispute thresholds, surcharge rights, merchant levers, and processor pricing are not timeless. Rule-dependent conclusions require effective dating and applicability scope.

## 7. Source-confirmed does not mean authenticated

`source_confirmed` means confirmed from the uploaded document. RateReveal does not claim that the PDF itself has been independently authenticated by the processor unless a separate authenticity mechanism explicitly does so.

## 8. Assertions disclose how they were reached

Every material conclusion and every decision rule carries:

```text
assertion_basis ∈ {
  source_fact,
  deterministic_math,
  rule_application,
  corpus_pattern,
  external_verified,
  ai_hypothesis,
  human_expert_inference
}
```

A corpus pattern is not automatically a domain fact. A rule derived from limited examples must remain visibly corpus-derived until independently validated.

---

# PART II — ROOT OBJECT MODEL

## 9. MerchantProcessingEconomicsAnalysis

```text
MerchantProcessingEconomicsAnalysis
├── analysis_identity
├── support_and_capability
├── source_integrity
├── source_model
├── participant_chain
├── merchant_activity
├── billing_and_funding_mechanics
├── financial_model
├── reconciliation_model
├── pricing_architecture
├── economic_cost_ledger
├── statement_observed_processing_cost
├── off_statement_exposure
├── total_cost_of_acceptance
├── cost_stack
├── cost_driver_model
├── operational_signal_model
├── account_risk_status
├── account_service_model
├── merchant_pricing_programs
├── refund_economics
├── amex_acceptance_model
├── temporal_and_rule_context
├── statement_notices
├── evidence_and_derivability
├── merchant_levers
├── economic_themes
├── unresolved_questions
├── report_permissions
└── audit_proof
```

Report V2, Merchant Attention, AI explanation, future benchmarking, and future multi-statement analysis should project from this model rather than directly from fee rows.

---

# PART III — ANALYSIS IDENTITY, SUPPORT, SOURCE INTEGRITY

## 10. Analysis identity

```text
analysis_identity
- analysis_id
- statement_id
- merchant_ref
- processor_family
- processor_brand_or_iso
- statement_template_family
- statement_template_version
- statement_period_start
- statement_period_end
- statement_vintage
- currency
- country
- jurisdiction
- merchant_business_type
- business_type_confidence
- source_document_fingerprint
```

Merchant identifier/MID is not a globally unique identity key. Conflicting merchant names/addresses with the same identifier require explicit collision handling.

## 11. Source integrity

```text
source_integrity
- source_confirmed
- observed_page_count
- expected_page_count
- expected_page_count_basis
- missing_page_ranges[]
- document_completeness_status
- OCR_or_layout_quality
- source_identity_claims[]
- identity_resolution_status
- identity_conflict_refs[]
- do_not_merge_across_documents
```

### document_completeness_status

- `complete`
- `partial_pages_known`
- `partial_pages_suspected`
- `single_page_summary_only`
- `unreadable_or_corrupt`
- `unknown`

### identity_resolution_status

- `consistent`
- `conflicting_source_identity`
- `identifier_collision_across_documents`
- `insufficient_identity_evidence`

## 12. Support and capability profile

```text
support_and_capability
- support_status
- template_confidence
- pricing_detail_level
- opacity_state
- opacity_component_flags[]
- has_summary_totals
- has_card_type_summary
- has_daily_summary
- has_batch_summary
- has_refund_detail
- has_chargeback_detail
- has_adjustment_detail
- has_fee_ledger
- has_fee_subtotals
- has_detailed_interchange_table
- has_assessment_bases
- has_rate_columns
- has_per_item_columns
- has_transaction_counts
- has_volume_bases
- has_network_or_pin_debit_detail
- has_equipment_section
- has_account_fee_section
- has_notices
- has_1099_or_reportable_sales
- repeated_representation_patterns[]
- known_structural_limitations[]
```

### support_status

- `supported_full`
- `supported_limited`
- `recognized_but_insufficient`
- `unsupported_document_class`
- `unreadable_or_incomplete`

### opacity_state

- `transparent`
- `partially_transparent`
- `structurally_opaque`
- `unknown`

Opacity is ordinal plus explicit component flags. Do not invent a numeric opacity score until a defensible calibration exists.

---

# PART IV — DERIVABILITY, EVIDENCE, CONFIDENCE

## 13. Derivability

```text
derivability_tier ∈ {
  stated_on_statement,
  deterministically_derivable_from_statement,
  inferable_from_statement_with_qualification,
  requires_external_rule_or_schedule,
  requires_merchant_pricing_document,
  requires_additional_statement_history,
  requires_processor_explanation,
  not_derivable_from_this_document_class,
  unresolved
}
```

`requires_merchant_pricing_document` means an economic observation exists but contractual confirmation is required. `not_derivable_from_this_document_class` means the document structurally cannot expose the desired quantity.

## 14. Evidence classes

```text
evidence_class ∈ {
  statement_confirmed,
  deterministically_derived,
  approved_knowledge_supported,
  public_documentation_verified,
  merchant_document_supported,
  multi_statement_supported,
  industry_inference,
  hypothesis_only,
  unresolved
}
```

Evidence strength is **claim-specific**, not governed by one universal ranking. Claim-specific admissibility and conflict precedence are defined in the Knowledge Library Spec.

## 15. Confidence

```text
confidence ∈ { high, medium, low, unavailable }
```

Confidence and derivability are independent. RateReveal may be highly confident that something is not derivable.

---

# PART V — SOURCE MODEL AND REPEATED ECONOMICS

## 16. SourceSection

```text
SourceSection
- section_id
- normalized_section_kind
- raw_heading
- page_start
- page_end
- source_refs[]
- declared_subtotals[]
- population_definition
- represents_same_economics_as[]
```

## 17. SourceOccurrence

```text
SourceOccurrence
- occurrence_id
- section_ref
- page
- row_or_line_ref
- raw_description
- raw_type_label
- printed_amount
- printed_sign
- volume_base
- rate
- quantity
- per_item_amount
- subtotal
- brand_or_program_label
- source_evidence_refs[]
```

Source sign is determined from printed financial direction and section semantics, not keywords such as `CREDIT` inside product names.

## 18. Repeated representation

```text
repeated_representation
- source_occurrence_refs[]
- canonical_economic_ref
- representation_role
- duplicate_amount_handling
- reconciliation_role
```

A detailed interchange table may repeat costs already billed in a fee ledger. Repeated representations must never be added twice to cost.

---

# PART VI — PARTICIPANT CHAIN AND ECONOMIC CONTROL

## 19. Participant chain

A single `billing_intermediary` is insufficient for ISO-layered processing. Use a chain.

```text
participant_chain[]
- participant_id
- participant_name_or_role
- role_types[]
- evidence_refs[]
- confidence
- derivability_tier
```

Stable role types include:

- merchant
- iso_reseller
- acquirer
- processor_platform
- gateway
- card_brand_network
- issuer_or_interchange_system
- debit_network
- third_party_service
- equipment_lessor
- funding_provider
- regulator_or_rule_authority

## 20. Economic control dimensions

Each material economic charge may independently identify:

- `billing_intermediary_refs[]`
- `economic_beneficiary_refs[]`
- `economic_owner`
- `rate_or_rule_setter_refs[]`
- `contractual_negotiator_refs[]`
- `rule_or_statutory_constraint_refs[]`

Do not collapse rate-setting, economic ownership, billing, and negotiability into one controller field.

---

# PART VII — MERCHANT ACTIVITY AND CANONICAL HEADLINE POPULATIONS

## 21. Merchant activity

```text
merchant_activity
- canonical_gross_sale_volume
- canonical_refund_volume
- canonical_net_submitted_card_volume
- third_party_transactions_amount
- adjustments_amount
- chargeback_debits_amount
- chargeback_debits_count
- representment_credits_amount
- representment_credits_count
- net_dispute_amount
- net_funded_amount
- canonical_gross_sale_transaction_count
- refund_transaction_count
- settled_transaction_count
- authorization_count
- batch_count
- active_processing_days
- headline_effective_rate
- gross_sales_cost_rate
- average_ticket
- cost_per_sale_transaction
- fixed_fee_monthly
- effective_rate_ex_fixed
- fixed_fee_share_of_fees
- effective_rate_interpretability
- card_brand_mix[]
- tender_mix[]
- debit_credit_mix[]
- regulated_unregulated_debit_mix[]
- channel_mix[]
- geography_mix[]
- terminal_or_batch_families[]
```

Every metric carries where relevant value, population definition, evidence refs, derivability, confidence, period, and assertion basis.

## 22. Canonical product metric definitions

### 22.1 Canonical net submitted card volume

```text
canonical_net_submitted_card_volume =
  gross card sales submitted
  - card refunds/credits represented in the statement's submitted-volume equation
```

It is measured **before** processing fees, chargebacks, adjustments, reserves, funding deductions, or third-party non-card funding effects.

If a supported template exposes only an authoritative `Amount Submitted` and template semantics establish that it is this net card-volume population, that amount may instantiate the canonical metric. If the canonical population cannot be established, the headline effective rate is unavailable rather than silently switching denominator.

### 22.2 Headline effective rate

```text
headline_effective_rate =
  total_statement_processing_fees /
  canonical_net_submitted_card_volume
```

If the denominator is zero, the headline effective rate is **undefined**.

### 22.3 Gross sales cost rate

```text
gross_sales_cost_rate =
  total_statement_processing_fees /
  canonical_gross_sale_volume
```

This is a secondary diagnostic metric, useful when pricing components are assessed before refunds. It is not interchangeable with the headline effective rate.

### 22.4 Canonical headline transaction population

`canonical_gross_sale_transaction_count` is the headline count for average ticket and cost-per-sale-transaction unless the source lacks a defensible gross-sale population.

```text
average_ticket = canonical_gross_sale_volume /
                 canonical_gross_sale_transaction_count

cost_per_sale_transaction = total_statement_processing_fees /
                            canonical_gross_sale_transaction_count
```

Refund counts are reported separately; they do not mechanically subtract from gross sale count.

## 23. Effective-rate interpretability

```text
effective_rate_interpretability ∈ {
  pricing_signal,
  materially_size_sensitive,
  structurally_opaque,
  undefined,
  insufficient_data
}
```

Do not use a universal monthly-volume threshold. Exact fixed-fee share is an observed metric; scenario sensitivity belongs to Decision Procedures under explicit assumptions.

---

# PART VIII — BILLING AND FUNDING MECHANICS

## 24. Billing and funding mechanics

```text
billing_and_funding_mechanics
- billing_method
- fee_collection_cadence
- daily_discount_amount
- month_end_charge_amount
- gross_vs_net_funding
- third_party_funding_amount
- rolling_reserve_amount
- held_funds_amount
- reserve_release_amount
- settlement_delay_pattern
- funding_adjustments[]
- billing_mechanics_confidence
```

`Less Discount Paid` and `Month End Charge` are collection-cadence quantities, not economic pricing components unless independent evidence establishes equivalence. Reserves and held funds affect cash flow but are not processing fees by default.

---

# PART IX — FINANCIAL MODEL AND RECONCILIATION

## 25. Financial model

```text
financial_model
- authoritative_submitted_total
- authoritative_fee_total
- authoritative_adjustment_total
- authoritative_chargeback_or_reversal_total
- authoritative_funded_or_processed_total
- statement_declared_subtotals[]
- canonical_unique_fee_total
- canonical_unique_cost_occurrence_refs[]
- financial_controls[]
```

## 26. ReconciliationControl

```text
ReconciliationControl
- control_id
- control_type
- authoritative_value
- recomputed_value
- delta
- tolerance_rule_ref
- status
- severity
- reportability_impact
- source_refs[]
- variance_explanation
```

### severity

- `blocking`
- `warning`
- `informational`

General product rule:

- authoritative fee-ledger-to-fee-total mismatch is blocking;
- a cost stack declared complete but not summing to total fees is blocking;
- cross-section volume/count mismatch is normally warning unless template rules elevate it;
- rounding/recomputation differences are informational or warning according to parameterized tolerance.

Reconciliation graphs and tolerances are template-family specific and live in Decision Procedures / Knowledge Library.

## 27. Reconciliation status

- `fully_reconciled`
- `reconciled_with_documented_rounding`
- `financially_reconciled_economically_partial`
- `material_financial_mismatch`
- `not_testable_from_document`

A financially reconciled but economically partial report may still be useful if the partiality is explicit.

---

# PART X — PRICING ARCHITECTURE v0.7

## 28. Pricing architecture object

Pricing truth is represented by independent axes instead of one overloaded model enum.

```text
pricing_architecture
- pricing_populations[]
- underlying_cost_billing_mode
- merchant_price_schedule_shape
- scope_uniformity
- scope_models[]
- observed_pricing_components[]
- formula_coverage_status
- derived_human_summary
- confidence
- derivability_tier
- contract_confirmation_required
- opacity_state
- evidence_refs[]
- limitations[]
- assertion_basis
```

## 29. Axis A — underlying-cost billing mode

```text
underlying_cost_billing_mode ∈ {
  separately_billed_pass_through,
  bundled_into_merchant_price,
  mixed_by_scope,
  no_active_processing,
  unknown
}
```

This axis answers whether underlying card/network cost is separately billed for the active pricing populations.

## 30. Axis B — merchant price schedule shape

```text
merchant_price_schedule_shape ∈ {
  uniform_flat_percentage,
  scope_specific_flat_percentage,
  qualification_tier_ladder,
  rate_plus_per_item,
  fixed_plus_variable,
  subscription_membership,
  minimum_based,
  composite_multi_component,
  custom_or_other,
  no_active_processing,
  unknown
}
```

A statement may contain more than one component type. `composite_multi_component` is used when no single shape safely summarizes the active schedule. Detailed components remain canonical even when the human summary is simple.

## 31. Axis C — scope uniformity

```text
scope_uniformity ∈ {
  uniform,
  uniform_with_explicit_exceptions,
  scope_specific,
  no_active_processing,
  unresolved
}
```

## 32. PricingPopulation

Pricing scope is extensible and source-supported rather than a fixed Cartesian product.

```text
PricingPopulation
- population_id
- activity_status
- dimension_values[]
- source_population_refs[]
- observed_volume
- observed_count
- pricing_component_refs[]
- underlying_cost_billing_mode
- confidence
- derivability_tier
```

### activity_status

- `active_settled`
- `refund_or_credit`
- `fee_only`
- `inactive_informational`
- `unknown`

### dimension_values

Each dimension is explicit and source-supported:

```text
PricingDimension
- dimension_kind
- dimension_value
- evidence_refs[]
```

Stable dimension kinds may include brand, product class, debit/credit/prepaid, qualification, channel, domestic/international, ticket band, commercial data level, regulated status, PIN network, token/card-on-file state, MCC/sub-merchant population, funding program, and `custom_source_dimension`.

Do not invent dimensions to force a classification.

## 33. PricingComponent

```text
PricingComponent
- component_id
- population_ref
- presence_status
- basis_type
- basis_population_kind
- applied_base_amount
- rate
- per_item_amount
- fixed_amount
- minimum_amount
- tier_name
- observed_amount
- economic_owner
- rate_or_rule_setter_refs[]
- contractual_negotiator_refs[]
- derivability_tier
- evidence_refs[]
- assertion_basis
```

### presence_status

- `observed_nonzero`
- `explicitly_zero`
- `absent_from_complete_source`
- `not_observable`

Absence of a basis-point sales-discount line is not proof total processor economics are zero.

## 34. Derived human summary

Labels such as `interchange_plus`, `tiered`, `flat_rate`, `bundled`, `subscription`, or `hybrid` are **derived merchant-facing summaries**, not the primary economic truth. Decision Procedures define how they map from the canonical axes and population results.

---

# PART XI — ECONOMIC COST LEDGER

## 35. EconomicCharge

```text
EconomicCharge
- charge_id
- source_occurrence_refs[]
- represents_same_economics_as[]
- amount
- economic_category
- economic_facets[]
- calculation_basis
- pricing_population_refs[]
- participant_role_refs[]
- economic_owner
- rate_or_rule_setter_refs[]
- contractual_negotiator_refs[]
- billing_intermediary_refs[]
- derivability_tier
- evidence_class
- confidence
- assertion_basis
- effective_period
- unresolved_fields[]
```

Economic owner/control assignment requires positive identification. Unknown must never default to processor markup.

## 36. Stable economic category families

Stable semantic families belong in schema; network-specific aliases live in the knowledge library.

- issuer/interchange economics;
- card-brand/network economics;
- processor/acquirer pricing;
- processor service/admin;
- third-party/service/equipment;
- operational/exception/penalty;
- taxes specifically imposed on processing fees;
- other source-grounded statement fee cost;
- unknown/unresolved.

## 37. Economic facets

Facets are orthogonal descriptors such as function, trigger, channel, geography, qualification, product class, operational nature, or service nature. New network vocabulary should usually map into existing facets rather than force a new primary category.

---

# PART XII — COST CONCEPTS AND COST STACK

## 38. Statement-observed processing cost

`statement_observed_processing_cost` is the authoritative processing-fee total evidenced by the statement. It is not the merchant’s complete cost of card acceptance.

## 39. Off-statement exposure

```text
off_statement_exposure[]
- exposure_type
- presence_status
- observed_or_possible_amount
- evidence_requirement
- derivability_tier
- source_refs[]
```

Examples: equipment lease, separate gateway invoice, termination liability, reserve carrying cost, funding delay cost, disputed principal, external software/service charges.

`presence_status`:

- `observed_on_statement`
- `known_absent`
- `unknown_whether_exists`

## 40. Total cost of acceptance

`total_cost_of_acceptance` is a broader economic concept requiring additional evidence. A statement may safely report statement-observed cost while explicitly saying off-statement costs are unknown.

## 41. Cost stack

```text
cost_stack
- issuer_interchange_cost
- network_card_brand_cost
- processor_controlled_pricing
- processor_service_admin_cost
- third_party_and_equipment_cost
- operational_penalty_exception_cost
- taxes_on_processing_fees
- other_statement_fee_cost
- economically_unresolved_cost
- total_statement_observed_processing_cost
- completeness_status
```

**Settlement adjustments, representments, funding corrections, and taxes payable outside the authoritative fee total MUST NOT enter the cost stack.**

### completeness_status

- `complete`
- `complete_with_rounding`
- `partial_but_financially_reconciled`
- `not_derivable_from_document`
- `financially_unreconciled`

A complete stack must sum to the authoritative fee total under the applicable tolerance rule.

---

# PART XIII — COST DRIVERS

## 42. CostDriver

```text
CostDriver
- driver_id
- driver_type
- attribution_method
- population_predicate_ref
- derivability_tier
- affected_volume
- affected_transactions
- cost_amount
- excess_or_counterfactual_amount
- effective_cost_rate
- share_of_total_volume
- share_of_total_fees
- relevant_cost_pool_ref
- share_of_relevant_cost_pool
- comparison_population_ref
- overlaps_with[]
- may_be_summed_with[]
- evidence_refs[]
- confidence
- assertion_basis
```

### attribution_method

- `exclusive_partition`
- `overlapping_declared`
- `counterfactual_delta`

Overlapping drivers must not be summed as independent dollars. Counterfactual drivers report the supported delta, not the full observed cost.

Stable driver types may include premium/rewards mix, regulated debit, commercial/T&E, CNP/keyed, downgrade/qualification, international, small-ticket, high average-ticket, refund activity, fixed-fee burden, minimum-fee burden, dispute activity, authorization behavior, or other stable economic questions.

---

# PART XIV — OPERATIONAL SIGNALS AND ACCOUNT RISK

## 43. OperationalSignal

```text
OperationalSignal
- signal_id
- signal_type
- observed_value
- population_definition
- severity
- confidence
- derivability_tier
- external_rule_required
- evidence_refs[]
- assertion_basis
```

Signals do not automatically become blame or savings claims.

## 44. AccountRiskStatus

```text
account_risk_status
- dispute_debit_amount
- dispute_debit_count
- representment_credit_amount
- representment_credit_count
- net_dispute_amount
- descriptive_dispute_ratio_by_count
- descriptive_dispute_ratio_by_value
- monitoring_rule_refs[]
- monitoring_status
- funding_failure_signals[]
- reserve_hold_signals[]
- risk_context
- fairness_verdict
- risk_derivability
```

`fairness_verdict` must remain unavailable unless supported by a risk-matched benchmark, underwriting/contract evidence, or other approved evidence. High risk may contextualize pricing but never proves it is fair or unfair.

## 45. Multi-source dispute evidence

Disputes can appear in chargeback sections, adjustment sections, fee lines, or separate reports. Source observations remain distinct until they can be safely linked. Do not use a mechanical `max()` rule to manufacture a canonical count.

---

# PART XV — ACCOUNT SERVICES, SPECIAL PRICING, REFUNDS, AMEX

## 46. Account service model

Represents recurring services, compliance products, statement delivery, gateways, software, security, equipment, and other account-level services. Processor billing does not prove removability.

## 47. Merchant pricing programs

```text
merchant_pricing_programs[]
- program_type
- participation_status
- covered_population_refs[]
- consumer_facing_charge_revenue
- amount_retained_by_processor_or_third_party
- amount_retained_by_merchant
- net_merchant_borne_processing_cost
- refund_treatment
- rule_context_refs[]
- derivability_tier
- evidence_refs[]
```

Program types may include surcharge, cash discount, dual pricing, convenience fee, service fee, subscription/membership, reserve/funding program, or other supported program.

If consumer-facing revenue is unknown, RateReveal must not pretend gross processor fees equal net merchant-borne cost.

## 48. Refund economics

```text
refund_economics
- refund_volume
- refund_count
- interchange_returned_on_refund
- processor_pricing_returned_on_refund
- refund_pricing_basis_behavior
- return_transaction_fees[]
- negative_volume_rows[]
- negative_count_rows[]
- derivability_tier
```

Refunds may reduce net submitted volume while percentage pricing is still assessed on gross sales. The exact pricing base is a PricingComponent fact.

## 49. AmexAcceptanceModel

```text
amex_acceptance_model
- model
- duplicate_volume_linkage_refs[]
- acquirer_program_detail_present
- direct_indicator_present
- margin_components[]
- derivability_tier
- evidence_refs[]
- assertion_basis
```

`model ∈ { optblue_like, direct_esa_like, none, unknown }`.

Template/program structure may support a high-confidence rule application, but acceptance mode and margin are separate claims. Specific Amex margin components remain evidence-bound.

---

# PART XVI — TIME, NOTICES, RULES

## 50. Temporal and rule context

```text
temporal_and_rule_context
- statement_period
- current_analysis_date
- jurisdiction
- applicable_rule_refs[]
- future_rule_candidate_refs[]
- historical_rule_refs[]
```

## 51. StatementNotice

A statement notice is source evidence that the merchant was told something; it is not automatically verified industry truth.

```text
StatementNotice
- notice_id
- source_text_ref
- notice_date
- claimed_effective_date
- notice_claims[]
- processor_account_claims[]
- claimed_network_rule_claims[]
- mixed_claim_parts[]
```

## 52. RuleCandidate / RuleVersion

Processor-own fee changes may be supported for the account by the statement notice itself. Claimed network/legal rules require the appropriate external authority before global admission.

Verification states distinguish:

- `verified`
- `contradicted`
- `not_independently_verified`

`not_independently_verified` is not a processor-misstatement finding.

---

# PART XVII — MERCHANT LEVERS AND IMPACT

## 53. MerchantLever

```text
MerchantLever
- lever_id
- lever_type
- applies_to_charge_refs[]
- applies_to_driver_refs[]
- status
- controllability
- evidence_requirement
- rule_context_refs[]
- merchant_pricing_document_required
- history_required
- safe_action
- prohibited_claims[]
- expected_impact_type
- counterfactual_ref
- calculation_ref
- impact_value
- impact_range
- impact_period
- baseline_period
- recurrence_assumption
- implementation_dependency
- gross_or_net_impact
- impact_derivability
- may_express_dollar_impact
- confidence
- assertion_basis
```

A gross fee amount is never automatically a savings amount. Any dollar impact requires a named counterfactual, deterministic calculation, period, recurrence assumption, dependencies, and evidence permission.

Stable lever types belong in schema; dated/legal/network availability belongs in the knowledge/rule layer.

---

# PART XVIII — ECONOMIC THEMES AND REPORT PERMISSIONS

## 54. EconomicTheme

```text
EconomicTheme
- theme_id
- theme_type
- merchant_question_answered
- title
- supporting_charge_refs[]
- supporting_driver_refs[]
- amount_or_exposure
- confidence
- evidence_class
- derivability_tier
- assertion_basis
- actionability
- merchant_lever_refs[]
- what_statement_shows
- why_it_matters
- what_can_be_done
- what_remains_unknown
- priority_class
- materiality
- evidence_strength
```

## 55. Theme synthesis invariant

- One primary theme per economic question unless a materially different merchant action justifies separation.
- Supporting sub-findings remain inside the primary theme.
- Do not force a 3–7 count when the statement supports fewer meaningful themes.
- Do not create filler themes from routine fee rows.

## 56. Priority model

Priority considers:

1. priority class;
2. evidence strength;
3. materiality;
4. controllability;
5. recurrence/history where available;
6. ease of resolution.

Account survival risk generally outranks pricing only when adequately grounded. Low-confidence suspected risk must not automatically outrank a high-confidence material billing defect.

## 57. UnresolvedQuestion

```text
UnresolvedQuestion
- question_id
- materiality
- related_charge_refs[]
- related_theme_refs[]
- exact_unknown
- why_statement_is_insufficient
- derivability_tier
- evidence_needed
- who_can_answer
- merchant_safe_question
```

Open questions exist only after statement facts, deterministic math, and admitted knowledge have been exhausted.

## 58. Report permissions

```text
report_permissions
- may_show_headline_effective_rate
- may_show_gross_sales_cost_rate
- may_show_rate_benchmark
- may_show_pricing_architecture
- may_show_complete_cost_stack
- may_show_partial_cost_stack
- may_show_processor_controlled_amount
- may_show_cost_drivers
- may_show_operational_signals
- may_show_account_risk
- may_show_savings_estimate
- may_show_negotiation_lever
- may_show_external_claim
- may_show_multi_statement_pattern
- may_show_statement_observed_processing_cost
- may_show_total_cost_of_acceptance
```

Each permission has reason codes and evidence thresholds. Benchmark display additionally requires denominator and business-qualification compatibility.

---

# PART XIX — CANONICAL MATHEMATICAL DEFINITIONS

These formulas define stable metrics. Conditional domain use, tolerances, counterfactual eligibility, and inference procedures are governed by Decision Procedures.

## 59. Headline effective rate

```text
headline_effective_rate =
  total_statement_processing_fees /
  canonical_net_submitted_card_volume
```

If denominator = 0, the result is undefined.

## 60. Gross sales cost rate

```text
gross_sales_cost_rate =
  total_statement_processing_fees /
  canonical_gross_sale_volume
```

## 61. Average ticket and cost per sale transaction

```text
average_ticket = canonical_gross_sale_volume /
                 canonical_gross_sale_transaction_count

cost_per_sale_transaction = total_statement_processing_fees /
                            canonical_gross_sale_transaction_count
```

## 62. Fixed-fee decomposition

Where fixed fees are deterministically identifiable:

```text
effective_rate_ex_fixed =
  (total_statement_processing_fees - fixed_fee_monthly) /
  canonical_net_submitted_card_volume

fixed_fee_share_of_fees =
  fixed_fee_monthly / total_statement_processing_fees
```

Scenario elasticity under explicit assumptions belongs to Decision Procedures; it is not a universal canonical property.

## 63. Cost-stack control

```text
issuer_interchange
+ network_card_brand
+ processor_controlled_pricing
+ processor_service_admin
+ third_party_equipment
+ operational_penalty_exception
+ taxes_on_processing_fees
+ other_statement_fee_cost
+ economically_unresolved_cost
= total_statement_observed_processing_cost
```

## 64. Cost concentration

```text
share_of_total_fees = driver_cost / total_statement_processing_fees
share_of_relevant_cost_pool = driver_cost / named_relevant_cost_pool
share_of_total_volume = driver_volume / canonical_net_submitted_card_volume
```

Never use an unnamed `share_of_total_cost`.

## 65. Dispute ratios

Where gross debit numerator and appropriate denominator are actually derivable:

```text
descriptive_dispute_ratio_by_count = dispute_debit_count / relevant_transaction_population

descriptive_dispute_ratio_by_value = dispute_debit_amount / relevant_gross_sales_population
```

Network monitoring status requires the applicable dated network rule and its exact population definitions.

## 66. Counterfactual impact

A merchant-facing savings/impact value is valid only if the referenced Decision Procedure admits the comparison population and calculation inputs. The calculation itself is deterministic and stored by `calculation_ref`.

---

# PART XX — KNOWLEDGE AND RUNTIME INTEGRITY REFERENCES

## 67. Knowledge integrity invariant

No merchant-uploaded statement, OCR output, web page, or AI interpretation can automatically become shared global knowledge. Knowledge scope, promotion, conflict precedence, and tenant/privacy rules are normative in Payments Knowledge Library Spec v0.2.

## 68. Untrusted document content invariant

Text inside statements or retrieved documents is **data**, not an instruction to the model/runtime. Uploaded or retrieved content must never override system/product rules, request knowledge promotion, change tool policy, or alter canonical financial truth.

## 69. Runtime research invariant

Research is optional, bounded, independently degradable, and subordinate to statement facts/deterministic economics. Eligibility and stop behavior are normative in Runtime Intelligence Policy v0.1.

---

# PART XXI — UNSUPPORTED / FUTURE ECONOMIC EXTENSIONS

## 70. Explicitly not proven universal in v0.7

The schema can represent or reserve space for, but the current Fiserv corpus has not sufficiently falsified:

- genuine hybrid pricing with mixed pass-through/bundled scopes;
- subscription/membership + pass-through economics;
- dual-pricing/surcharge programs with consumer revenue;
- direct/ESA Amex;
- reserve/held-funds programs;
- separate equipment/gateway evidence;
- multi-location/MID economic hierarchies;
- multi-currency, FX spread, and DCC.

Until real or synthetic gold scenarios are admitted, these are detect-and-decline, limited-analysis, or unresolved capabilities—not claimed universal support.

---

# PART XXII — AUDIT PROOF

## 71. audit_proof

```text
audit_proof
- source_document_fingerprint
- template_version
- canonical_population_refs[]
- financial_control_results[]
- cost_stack_control_result
- pricing_population_resolution_refs[]
- decision_rule_versions[]
- knowledge_entry_versions[]
- rule_versions[]
- calculation_refs[]
- research_run_ref
- ai_admission_refs[]
- unresolved_conflict_refs[]
- projection_version
```

Every merchant-facing material conclusion should be traceable to source facts, deterministic math, admitted rules/knowledge, or an explicitly qualified inference.

---

# PART XXIII — ACCEPTANCE AND FREEZE CRITERIA

## 72. Financial truth

A conforming implementation must:

- preserve source sign and amount semantics;
- identify unique economic occurrences vs repeated representations;
- reconcile authoritative fee totals or explicitly block/limit the report;
- never move funding adjustments into processing cost merely to make a stack reconcile.

## 73. Pricing architecture

A conforming implementation must:

- resolve the independent pricing axes;
- use source-supported pricing populations;
- not infer tiered pricing from labels alone;
- not infer zero markup from a missing rate component;
- preserve scope-specific formulas and exceptions;
- treat inactive/zero-volume rows as informational rather than active pricing evidence.

## 74. Economic interpretation

A conforming implementation must:

- use positive identification for owner/control roles;
- leave unresolved ownership unresolved;
- prevent overlapping drivers from double-counting;
- require counterfactual provenance for savings/impact;
- separate statement-observed cost from total cost of acceptance.

## 75. Knowledge and AI safety

A conforming implementation must:

- enforce knowledge promotion scope;
- prevent untrusted document text from acting as instructions;
- use claim-specific evidence admission;
- deterministically fail unresolved on equal-specificity knowledge conflicts;
- keep AI non-authoritative over financial truth;
- bound and degrade research safely.

## 76. Report behavior

A conforming implementation must:

- use the canonical headline effective-rate basis;
- block benchmark comparisons when denominator/business qualification is incompatible;
- prefer a small set of distinct economic themes over row-by-row pseudo-findings;
- expose unresolved/limited states honestly;
- never imply document authentication when only source confirmation exists.

---

# PART XXIV — v0.7 CHANGE SUMMARY

## 77. Critical changes from v0.6

1. Split pricing architecture into independent canonical axes.
2. Replaced fixed pricing-scope Cartesian product with extensible `PricingPopulation` dimensions.
3. Standardized RateReveal’s headline effective-rate denominator to canonical net submitted card volume.
4. Standardized headline gross-sale transaction population for average ticket/cost-per-transaction.
5. Removed generic adjustments from the processing-cost stack.
6. Added explicit processing-fee tax / other-statement-fee buckets.
7. Strengthened participant/control role separation.
8. Added counterfactual provenance contract to MerchantLever.
9. Expanded surcharge/dual-pricing economics to consumer revenue and net merchant-borne cost.
10. Added explicit knowledge anti-poisoning and untrusted-content invariants.
11. Moved runtime research behavior to Runtime Intelligence Policy v0.1.
12. Declared normative hierarchy to prevent source-of-truth drift.
13. Marked unfalsified economic shapes as limited/unresolved rather than universal support.

## 78. Product-model freeze status

Schema v0.7 is a **release candidate for repository gap analysis**, not an implementation authorization. The package is considered product-model frozen only together with Decision Procedures v0.2, Gold Answer Tables v0.3, Payments Knowledge Library Spec v0.2, and Runtime Intelligence Policy v0.1 after the Product Model Freeze Review passes.

