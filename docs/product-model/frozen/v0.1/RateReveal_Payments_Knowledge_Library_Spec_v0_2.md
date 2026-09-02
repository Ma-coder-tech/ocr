# RateReveal Payments Knowledge Library Specification v0.2

**Status:** Product-model specification paired with Merchant Processing Economics Schema v0.7, Decision Procedures v0.2, Gold Answer Tables v0.3, and Runtime Intelligence Policy v0.1  
**Purpose:** Define the effective-dated, evidence-backed knowledge system RateReveal needs in order to turn unfamiliar processor/network vocabulary into safe economic interpretation without hardcoding merchant-specific answers or letting AI invent financial truth.  
**Implementation status:** Product design only. No repository implementation is authorized by this artifact.

---

## 0. Executive position

The Economics Schema defines **what concepts exist**. The Decision Procedures define **how RateReveal reasons**. The Knowledge Library defines **what RateReveal knows about changing payment-industry vocabulary, rules, mappings, ownership, rates, and applicability**.

The three must remain separate.

RateReveal should eventually be able to encounter a supported but unfamiliar Fiserv-family statement and answer:

> What does this charge/program mean, who economically owns it, who bills it, who sets or controls it, what rule/rate applied at the statement date, what economic facet does it belong to, what merchant action is permitted, and how certain are we?

If the library cannot support that answer, the result is `unknown` / `unresolved` — not a fabricated classification.

---

# PART I — BOUNDARY BETWEEN SCHEMA, PROCEDURES, AND KNOWLEDGE

## 1. Stable concepts stay in the schema

Examples:

- `pricing_architecture` / canonical pricing axes
- `economic_owner`
- `participant_chain`
- `derivability_tier`
- `assertion_basis`
- `economic_facets`
- `cost_driver.attribution_method`
- `account_risk_status`
- `refund_economics`
- `merchant_lever`
- `RuleCandidate` / `RuleVersion`
- reconciliation severity

These concepts should not change when a network renames a program.

## 2. Ordered reasoning stays in Decision Procedures

Examples:

- active pricing-scope determination;
- IC+ / tiered / flat / hybrid resolution;
- repeated-economic-representation handling;
- derivability assignment;
- cost-driver synthesis;
- dispute reconciliation;
- refund treatment;
- priority/theme synthesis.

## 3. Volatile knowledge belongs in this library

Examples:

- processor/network aliases;
- fee-code and product-name mappings;
- network program names;
- historical interchange and assessment schedules;
- dispute-monitoring thresholds;
- processor-specific terminology;
- template-specific structural mappings;
- Amex structural/acceptance mappings;
- refund/interchange-return rules;
- network/processor rule applicability;
- dated merchant-lever availability;
- statement-notice verification;
- aliases for services, compliance products, gateway items and equipment programs.

### Placement test

If the fact can change because a network/processor renamed a program, changed a rate, revised a rule, changed a product, or changed legal/rule applicability, it belongs here rather than in the stable schema.

---

# PART II — ROOT KNOWLEDGE OBJECT

## 4. KnowledgeEntry

```text
KnowledgeEntry
- knowledge_id
- knowledge_scope
- tenant_scope
- promotion_history[]
- claim_type
- knowledge_type
- canonical_concept
- semantic_role
- stable_schema_refs[]
- surface_match
- structural_match
- template_scope
- participant_scope
- card_network_scope
- card_product_scope
- pricing_scope
- channel_scope
- geography_scope
- merchant_category_scope
- jurisdiction_scope
- effective_from
- effective_to
- rule_status
- evidence_class
- assertion_basis
- confidence
- sources[]
- source_quote_or_fact_refs[]
- admission_status
- conflicts_with[]
- supersedes[]
- superseded_by[]
- last_reviewed_at
- reviewer_or_admission_authority
- notes
```

No runtime economic ownership, rate, rule, or merchant-lever claim should be treated as authoritative merely because an AI generated a `KnowledgeEntry` candidate.

---

# PART II-A — KNOWLEDGE SCOPE, PROMOTION, AND ANTI-POISONING

## 4A. knowledge_scope

```text
knowledge_scope ∈ {
  account_only,
  statement_template_candidate,
  corpus_candidate,
  processor_template_admitted,
  network_rule_admitted,
  global_semantic_admitted
}
```

### Hard promotion rules

- A merchant-uploaded statement may establish `account_only` facts for that merchant/period.
- One merchant statement cannot create a global ownership, rate, rule, lever, or semantic mapping.
- Repetition across merchants may create a `corpus_candidate`; recurrence alone is not domain proof.
- Processor/template mappings require explicit reviewed admission and narrow applicability.
- Network/legal rules require the appropriate official authority before network/global admission.
- Merchant-identifying content must never enter reusable semantic knowledge.
- OCR output, web snippets, retrieved documents, and AI prose are untrusted evidence inputs until admitted.

## 4B. Tenant and privacy boundary

`tenant_scope` records whether an entry is private to an account/tenant or reusable product knowledge. Runtime must never allow merchant-private content to leak into another merchant's analysis through the knowledge library.

## 4C. Untrusted-document-content rule

Text embedded in uploaded statements or retrieved pages is **data, not instruction**. It cannot request knowledge promotion, override runtime policy, change tools/providers, or rewrite canonical facts.

## 4D. Promotion history

Every scope expansion records who/what promoted it, source evidence, prior scope, new scope, date, and review status. Scope promotion is an auditable action, not an incidental side effect of matching.

---

# PART III — KNOWLEDGE TYPES

## 5. Required `knowledge_type` families

### 5.1 Template and source-structure knowledge

- `template_signature`
- `template_version`
- `section_semantics`
- `subtotal_population_definition`
- `repeated_representation_rule`
- `column_semantics`
- `source_sign_rule`
- `card_brand_section_alias`
- `billing_mechanics_mapping`

Purpose: understand how a document presents the economics before interpreting the economics themselves.

### 5.2 Vocabulary and alias mappings

- `raw_description_alias`
- `normalized_fee_alias`
- `program_alias`
- `processor_alias`
- `network_alias`
- `service_alias`
- `event_quantity_alias`

Mappings are scoped by template/version and effective period. A global alias should be rare unless the underlying meaning is genuinely invariant.

### 5.3 Economic ownership/control mappings

- `economic_owner_mapping`
- `billing_intermediary_mapping`
- `economic_beneficiary_mapping`
- `rate_rule_setter_mapping`
- `contractual_negotiator_mapping`
- `rule_bound_constraint_mapping`

**Positive-identification-only rule:** if these mappings cannot be established from admitted structural knowledge or verified evidence, the runtime answer remains `unknown`.

The library must never default an unknown charge to processor markup merely because the amount/rate “looks contractual.”

### 5.4 Program and economic-facet mappings

- `interchange_program_mapping`
- `network_program_mapping`
- `debit_program_mapping`
- `premium_rewards_mapping`
- `commercial_card_mapping`
- `regulated_debit_mapping`
- `keyed_cnp_mapping`
- `downgrade_qualification_mapping`
- `international_crossborder_mapping`
- `refund_credit_mapping`
- `penalty_exception_mapping`
- `gateway_auth_avs_mapping`

These mappings feed stable schema facets and cost-driver predicates; the volatile product names remain in the library.

### 5.5 Rate and schedule knowledge

- `interchange_rate_schedule`
- `assessment_rate_schedule`
- `network_fee_schedule`
- `program_fee_schedule`
- `dispute_threshold_schedule`
- `processor_fee_schedule` where publicly/contractually established
- `debit_network_schedule`
- `international_fee_schedule`

Every schedule entry must be effective-dated and applicability-scoped.

### 5.6 Refund and reversal knowledge

- `interchange_return_rule`
- `refund_transaction_fee_rule`
- `credit_voucher_rule`
- `negative_count_semantics`
- `representment_semantics`

A rule may vary by network, card type, program, period, channel and transaction type.

### 5.7 Account-risk and dispute knowledge

- `chargeback_program_rule`
- `monitoring_threshold_rule`
- `retrieval_dispute_fee_rule`
- `ach_return_rule`
- `reserve_or_hold_rule`
- `funding_risk_rule`

Risk rules provide context, not an automatic fairness verdict for processor pricing.

### 5.8 Amex structural knowledge

- `amex_acceptance_structure_mapping`
- `amex_optblue_indicator`
- `amex_direct_indicator`
- `amex_program_fee_mapping`
- `amex_assessment_mapping`
- `amex_duplicate_volume_linkage`

Amex acceptance model and Amex margin are separate claims and may have different derivability/evidence.

### 5.9 Merchant-service knowledge

- `pci_service_mapping`
- `compliance_status_mapping`
- `gateway_service_mapping`
- `equipment_service_mapping`
- `paper_statement_mapping`
- `software_security_service_mapping`
- `third_party_ordering_service_mapping`
- `access_portal_service_mapping`

A service label does not prove removability or contract breach.

### 5.10 Merchant-lever knowledge

- `negotiate_pricing_rule`
- `cancel_or_review_service_rule`
- `operational_remediation_rule`
- `qualification_remediation_rule`
- `surcharge_rule`
- `cash_discount_rule`
- `card_acceptance_rule`
- `documentation_request_rule`
- `monitor_only_rule`

Lever applicability must include date, jurisdiction, network/product, merchant type/channel where relevant, and rule status.

### 5.11 Notice and future-change knowledge

- `statement_notice_pattern`
- `processor_own_notice_rule`
- `claimed_network_notice_rule`
- `notice_to_rule_candidate_mapping`
- `future_fee_verification_rule`

Processor statement notices are not automatically authoritative network rules.

---

# PART IV — MATCHING AND APPLICABILITY

## 6. `surface_match`

A mapping can use one or more of:

- exact raw description;
- normalized exact description;
- versioned regex/pattern;
- source section + description;
- source type + description;
- brand section + description;
- structural position/table identity;
- correlated base/rate/count relationship.

### Matching rule

Keyword similarity alone is insufficient for authoritative ownership or rule assignment.

## 7. `template_scope`

```text
template_scope
- processor_family
- processor_brand_or_iso
- statement_template_family
- statement_template_version
- source_section_kind
- statement_vintage_range
```

Knowledge should be as narrow as required to stay correct. A mapping discovered in BASYS 2020 should not automatically apply to Merchant One 2025.

## 8. Economic applicability scope

```text
applicability
- network
- brand
- product_class
- debit_credit_class
- channel
- card_present_state
- qualification_state
- international_state
- merchant_category_or_mcc
- ticket_band
- jurisdiction
- country
- currency
- statement_period
```

Any unscoped rate/rule claim should be treated as suspicious.

---

# PART V — EVIDENCE AND PROVENANCE

## 9. Evidence classes for knowledge admission

Evidence strength is claim-specific. Available evidence classes include:

- `source_statement_fact`
- `merchant_pricing_document`
- `official_network_documentation`
- `official_processor_documentation`
- `official_regulatory_or_court_source`
- `verified_cross_statement_evidence`
- `high_quality_secondary_source`
- `ai_research_candidate`

No universal strongest-to-weakest ranking is authoritative for every claim.

## 9A. Claim-specific evidence matrix

Every admitted `claim_type` defines admissible evidence, minimum evidence, and conflict precedence. Minimum baseline matrix:

| Claim type | Preferred evidence | Minimum admission rule | Conflict precedence |
|---|---|---|---|
| amount billed / observed rate / source label | merchant statement | source-grounded occurrence | statement for that account/period wins |
| template/section semantics | reviewed template corpus + source structure | admitted template mapping | exact template/version > family mapping |
| processor service meaning | official processor/ISO docs or reviewed template mapping | positive identification | exact processor/template docs > generic semantic |
| economic owner / beneficiary | official network/processor docs, structural proof, merchant docs as applicable | positive identification; no lexical guess | claim-specific exact source > broader mapping |
| rate/rule setter | official network/processor/regulatory source | verified applicable authority | applicable official authority > corpus pattern |
| contractual negotiator / obligation | merchant agreement/addendum/pricing schedule | merchant document | merchant contract > public generic docs |
| network rate correctness | official dated network schedule | exact period/product applicability | exact dated schedule > historical/generic |
| legal lever applicability | official law/court/regulatory/network rule as applicable | currently effective/applicable authority | effective authority > announced/secondary |
| account notification | source statement notice | statement proves notification only | source notice for account wins on notification fact |
| benchmark/rate-position claim | approved RateReveal benchmark + qualified business tuple | tuple match + denominator match | approved benchmark registry |
| dispute monitoring status | official dated program rule + resolved population | exact network/population rule | exact rule > generic threshold |

A source may prove one claim (for example terminology) without proving another (for example negotiability).

## 10. Evidence requirements

Every admitted entry records:

- source identity;
- publication/effective date;
- retrieval date;
- version or schedule identifier where available;
- exact claim supported;
- scope supported;
- expiry/supersession information;
- whether the source proves meaning, rate, ownership, controller, applicability, or merely terminology.

One source may prove a fee definition without proving negotiability.

---

# PART VI — KNOWLEDGE STATUS AND ADMISSION

## 11. Admission states

```text
admission_status ∈ {
  candidate,
  researched,
  verified,
  admitted,
  admitted_with_conditions,
  contradicted,
  superseded,
  deprecated,
  rejected
}
```

### Runtime rule

Only `admitted` or applicable `admitted_with_conditions` entries may create canonical economic mappings or current merchant levers.

## 12. Rule status

```text
rule_status ∈ {
  historical,
  announced,
  proposed,
  preliminarily_approved,
  finally_approved,
  effective,
  suspended,
  superseded,
  expired,
  withdrawn,
  unknown
}
```

An announced or preliminarily approved rule can support a future-context note but cannot automatically activate a current merchant lever.

---

# PART VII — RUNTIME RESOLUTION ALGORITHM

## 13. Statement-row knowledge resolution

For each source-grounded economic occurrence:

1. **Preserve source fact first.** Amount/sign/base/count/rate/page/section remain deterministic.
2. **Resolve template/version.** No semantic library lookup is considered authoritative until the document capability/profile is established.
3. **Resolve by deterministic specificity.** Apply admitted entries in this order:
   1. exact template version + period + section + description/structural identity;
   2. template version + section + structural predicate;
   3. template family + period + network/product scope;
   4. processor/ISO family overlay;
   5. generic stable semantic mapping.
4. **Conflict rule.** If equally specific applicable admitted entries conflict, return `unresolved_conflict`; never choose by model confidence.
5. **If unresolved, emit an unresolved economic object.** Do not force owner/category/controller.
7. **AI may generate a candidate interpretation/research question.** Candidate remains non-authoritative.
8. **Research/admission may later promote knowledge.** Re-run or future statements can then use the admitted mapping.

## 14. Pricing-rule resolution

The library supplies aliases and scope semantics; the **Decision Procedures** still determine whether the account is IC+, tiered, flat or hybrid. The library must not hardcode `QUAL = tiered` or similar shortcuts.

## 15. Cost-driver resolution

The library defines which volatile program names map into stable driver predicates such as:

- premium/rewards;
- regulated debit;
- commercial/T&E;
- keyed/CNP;
- international;
- downgrade/qualification;
- small-ticket;
- refund/reversal populations.

The schema/decision procedures perform the aggregation math and overlap controls.

---

# PART VIII — AI ROLE IN THE KNOWLEDGE LIBRARY

## 16. AI is the scout, not the authority

AI MAY:

- cluster unfamiliar aliases;
- propose candidate mappings;
- identify likely network/processor terminology;
- compare new descriptions to admitted concepts;
- propose cost-driver predicates;
- identify contradictions between statement language and existing library entries;
- generate bounded research questions;
- search official documentation when authorized;
- propose effective-date changes;
- summarize evidence into an admission packet.

AI MUST NOT:

- promote its own candidate into `admitted` knowledge;
- invent a rate schedule;
- declare owner/controller from lexical resemblance alone;
- turn a processor notice into a verified network rule;
- change financial facts;
- silently overwrite an admitted mapping because a new model output disagrees.

## 17. AI candidate packet

```text
KnowledgeCandidatePacket
- raw_occurrence_context_minimized
- proposed_canonical_concept
- proposed_owner_control_roles
- proposed_facets[]
- proposed_applicability
- assertion_basis = ai_hypothesis
- candidate_confidence
- research_questions[]
- possible_sources[]
- known_conflicts[]
- privacy_review_status
```

A candidate must be semantically and evidentially reviewed before admission.

---

# PART IX — CONFLICT, SUPERSESSION, AND EFFECTIVE DATING

## 18. Conflict handling

If two admitted entries disagree:

- never choose based solely on model confidence;
- first eliminate entries that are not effective/applicable;
- apply deterministic specificity precedence;
- use the claim-specific evidence matrix for the exact claim;
- preserve both when they apply to different templates/periods/scopes;
- if equally specific and equally admissible entries genuinely conflict, return `unresolved_conflict`;
- prevent merchant-facing certainty and dependent levers until resolved.

Conflict resolution itself is auditable and must record the considered entries and rule version.

## 19. Supersession

Every time-sensitive mapping supports:

- `effective_from`
- `effective_to`
- `supersedes`
- `superseded_by`
- `rule_status`

A historical statement must be analyzed under the knowledge/rules applicable to its own period, not today's schedule.

---

# PART X — STATEMENT NOTICES AND RULE CANDIDATES

## 20. Notice pipeline

```text
StatementNotice
→ classify into one or more claims
→ RuleCandidate(s)
→ verify applicability/evidence
→ admitted RuleVersion or unresolved/contradicted candidate
```

### Processor-own notice

The statement may be sufficient to prove that **this account was notified** of an account-level fee/pricing change, subject to the notice wording.

### Claimed network notice

Requires official external verification before becoming authoritative network knowledge.

### Verification outcomes

- `verified`
- `contradicted`
- `not_independently_verified`

`not_independently_verified` is not the same as `contradicted`.

## 21. Next-period verification

Where a later statement exists, RateReveal may test:

- did the announced fee/rate appear?
- did it appear on/after the stated effective date?
- did the amount/rate match the notice?

This becomes deterministic cross-statement verification once both source periods are admitted.

---

# PART XI — KNOWLEDGE PACKS FOR FISERV V1

## 22. Template-family packs

### Pack A — Full detailed Family A

Observed brands/templates include BASYS, Clover/First Data, Wells Fargo.

Must cover:

- source-declared Interchange/Program vs Service vs Fees axis;
- 8-column interchange/program tables;
- assessment/base mappings;
- card-brand/product aliases;
- refund/credit-voucher rows;
- account/equipment/debit-network sections;
- Amex `AMERICAN EXPRESS` vs `AMEX ACQ` linkage;
- program-vintage changes.

### Pack B — Short Family B

Observed brands/templates include Paysafe, Merchant One, NXGEN, Priority Payment Systems.

Must cover:

- `CF` / `MISC` fee taxonomy;
- QUAL/MQUAL/NQUAL labels without assuming pricing model;
- optional 5/6-column interchange/program tables;
- `DISC 1`, `DISC 6`, processor/event/gateway aliases;
- `Additional Fees`, minimum fee, batch header, online access, statement fee;
- refunds/adjustments/chargeback evidence across multiple sections;
- fee-only/zero-volume periods.

---

# PART XII — INITIAL PROCESSOR/ISO OVERLAY BACKLOG

## 23. BASYS / Jefes overlay

High-priority mappings to verify:

- ECR/WATS/AUTH ownership/control;
- Visa/MC/Discover access/network fees;
- assessment mappings;
- Amex Program Cost Fee;
- PCI/admin/service terminology;
- TIF/Misuse operational rules;
- interchange-program vintage aliases.

## 24. Wells Fargo / El Nuevo overlay

High-priority mappings:

- WATS authorization-fee ownership;
- assessment and Base II/data-usage mappings;
- account-service fees (paper, shipping, monthly service);
- Amex acquirer transaction/program terms;
- refund/credit-voucher behavior.

## 25. Clover / Pepes overlay

High-priority mappings:

- scope-specific Sales Discount rows;
- Managed Security Non Validated;
- BentoBox Online Order Fee;
- PIN/debit-network sections;
- refund return fee and credit-voucher semantics;
- Amex sales-discount/program mappings.

## 26. NXGEN / Vortax overlay

High-priority mappings:

- `QUAL DISC` as a surface label, not model type;
- CPU/AVS event fees;
- dispute fees and ACH reject semantics;
- CNP/ecommerce aliases;
- network/program mappings;
- historical dispute threshold rules (external verification required).

## 27. Merchant One / Xpress overlay

High-priority mappings:

- `DISC 1` pricing component;
- `OTHER ITEM FEES`;
- `OTHER VOLUME FEES`;
- `CPU GTWY`;
- `ACQR PROCESSOR FEES`;
- program table aliases;
- STAR/Accel notices and mixed network/processor notice decomposition.

## 28. Paysafe / Philip overlay

High-priority mappings:

- active tier-ladder rows;
- zero-volume inactive pricing rows;
- Minimum Discount Fee semantics;
- `**ADDITIONAL FEES` unresolved workflow;
- system processing/network/gateway aliases;
- notice verification for commercial-data/network changes.

## 29. Priority Payment Systems / Jamaica Fish overlay

High-priority mappings:

- uniform flat bundled `QUAL DISC` treatment;
- gross-sales pricing base before refunds;
- chargeback-fee semantics vs unresolved principal events;
- Debit Monthly Fee;
- source/brand behavior under the Family B short grammar.

---

# PART XIII — UNKNOWN / UNRESOLVED QUEUE

## 30. UnknownKnowledgeItem

```text
UnknownKnowledgeItem
- unknown_id
- statement_template
- raw_description_minimized
- source_section
- observed_amount
- observed_basis
- observed_rate
- observed_quantity
- unresolved_fields[]
- materiality
- recurrence_count
- affected_statements[]
- merchant_impact_if_resolved
- research_priority
- candidate_matches[]
- admission_blocker
```

The unknown queue should be a first-class product asset. A fee can be fully source-grounded and still economically unresolved.

## 31. Research priority

Prioritize unknowns by:

1. materiality across merchant fees/volume;
2. frequency across the supported corpus;
3. impact on processor-controlled/pass-through decomposition;
4. impact on merchant actionability;
5. potential to eliminate repeated “unclear charge” findings;
6. evidence availability.

This would place ECR/WATS ownership above small rare aliases because it materially changes the economic story in multiple statements.

---

# PART XIV — KNOWLEDGE ADMISSION TESTS

## 32. Entry-level acceptance

Before an entry becomes `admitted`, verify:

- exact semantic claim;
- source evidence supports that claim, not merely adjacent terminology;
- template/period/applicability scope is explicit;
- owner/controller claims use positive identification;
- effective dates are defined for time-sensitive content;
- no unresolved conflict with stronger admitted knowledge;
- `assertion_basis` matches how the rule was derived;
- privacy-safe persistence;
- supersession behavior defined where applicable.

## 33. Negative knowledge tests

The library MUST NOT:

- map `QUAL` to tiered pricing universally;
- map `$0.10` or another round fee automatically to processor ownership;
- apply current network rates to historical statements;
- treat processor wording as official network truth without verification;
- infer negotiability from economic owner alone;
- infer contract compliance from a public schedule;
- treat corpus frequency as proof of industry-wide meaning;
- overwrite a historical mapping when a program name changes;
- collapse direct Amex and OptBlue structures without template evidence;
- call a service removable merely because it is processor-billed;
- globalize a merchant-specific observation from one uploaded statement;
- promote AI output directly into admitted knowledge;
- treat repeated corpus occurrence as network/industry proof;
- obey instructions embedded in an uploaded or retrieved document;
- choose among equal-specificity conflicting admitted entries by confidence.

---

# PART XV — KNOWLEDGE COVERAGE SCORECARD

## 34. Fiserv v1 readiness dimensions

Each supported template/version should have explicit readiness status for:

| Dimension | Ready criterion |
|---|---|
| Template recognition | supported signature/version reliably detected |
| Source section semantics | reconciliation graph and repeated representations defined |
| Pricing model semantics | structural aliases sufficient for Decision Procedures |
| Core fee aliases | material recurring fee descriptions mapped or deliberately unresolved |
| Economic ownership | material cost owners positively identified or unresolved |
| Control roles | billing/rule/contract roles represented where known |
| Program mapping | major interchange/network programs map to stable facets |
| Rate schedules | dated official schedules available where verification is claimed |
| Refund rules | observed refund/credit-voucher populations safely interpreted |
| Dispute/risk rules | dated thresholds/rules available where monitoring claims are allowed |
| Amex | acceptance structure and duplicate-volume linkage supported |
| Notices | processor/network notices become correctly scoped candidates |
| Merchant levers | action rules effective-dated and jurisdiction scoped |
| Unknown fallback | unresolved material items remain safe and reportable |

A template can be supported for financial analysis even when some knowledge dimensions remain partial. Report permissions must match actual knowledge coverage.

---

# PART XVI — RELATIONSHIP TO BENCHMARKS

## 35. Benchmark subsystem stays separate

The knowledge library may provide inputs required to qualify a benchmark — template, pricing model, business type, risk context, channel/card mix — but market reference ranges themselves remain a distinct benchmark subsystem.

A knowledge mapping must never silently turn a benchmark into contract truth or overcharge proof.

---

# PART XVII — RELATIONSHIP TO GOLD ANSWERS

## 36. Gold answers drive library priorities

A Gold Answer Table field may be:

- **fully deterministic** — no library lookup needed;
- **library-resolved** — requires admitted mapping/rule;
- **merchant-document-dependent**;
- **externally verified**;
- **structurally not derivable**;
- **unresolved**.

Every gold case should therefore identify which expected outputs are blocked by knowledge gaps.

## 37. First knowledge objectives from the current gold corpus

1. resolve ECR/WATS/AUTH role/ownership by relevant template/version;
2. resolve Amex Program Cost and Amex acceptance mappings;
3. create historical assessment/network fee schedules for tested statement periods;
4. establish processor/template alias packs for BASYS, Wells Fargo, Clover, NXGEN, Merchant One, Paysafe and Priority Payment Systems;
5. establish refund/credit-voucher rules for the observed program families;
6. establish dated dispute-monitoring/risk rules before any monitoring-status claims;
7. establish notice verification workflow for the observed 2020–2025 notices;
8. establish actionability/lever rules that remain separate from fee meaning.

---

# PART XVIII — SELF-REVIEW

## 38. Risks intentionally preserved

### 38.1 Knowledge-library quality becomes a product dependency

Positive-identification-only ownership is safer than heuristics, but poor mappings would leave too much unresolved. The solution is better evidence/admission, not weaker certainty rules.

### 38.2 AI can increase coverage and also amplify bad mappings

AI proposals must never gain canonical authority automatically. One wrong global alias could contaminate many reports.

### 38.3 Historical rate maintenance is substantial work

The product needs correct historical analysis as well as current analysis. Versioning/supersession is therefore mandatory from the beginning.

### 38.4 Processor contract economics are not fully public knowledge

Some questions will remain merchant-document-dependent even with an excellent public knowledge library.

### 38.5 This specification does not claim universal processor coverage

The conceptual architecture is broad; product support must remain an explicit template/version matrix.

## 39. Definition of success

The knowledge library succeeds when RateReveal can encounter a supported statement row or program it has seen before and resolve its economic semantics **without AI improvisation**, while an unfamiliar row safely becomes an evidence-backed research candidate rather than an “unclear charge” dead end or a guessed classification.



---

# PART XVI — v0.2 CHANGE SUMMARY

## 35. Changes from v0.1

1. Added explicit `knowledge_scope`, tenant scope, promotion history, and anti-poisoning rules.
2. Added the untrusted-document-content boundary.
3. Replaced rough global evidence ranking with a claim-specific evidence matrix.
4. Added deterministic specificity precedence for runtime lookup.
5. Added fail-closed `unresolved_conflict` behavior for equal-specificity conflicts.
6. Strengthened negative tests against merchant-data globalization and AI self-promotion.
7. Aligned the library with Economics Schema v0.7, Decision Procedures v0.2, and Runtime Intelligence Policy v0.1.

## 36. Product rule

Shared knowledge is a reviewed product asset. Runtime observations may propose knowledge, but scope expansion from merchant-specific fact to reusable rule is always explicit, evidence-backed, privacy-safe, effective-dated, and auditable.
