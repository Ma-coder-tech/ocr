# RateReveal Decision Procedures v0.2

**Status:** Normative domain-reasoning companion to Merchant Processing Economics Schema v0.7.  
**Purpose:** Define the ordered tests, precedence rules, mathematics, and safe failure behavior used to populate the stable economics schema.  
**Not included:** volatile fee/program mappings, current network rates, or legal rules; those belong in the Payments Knowledge Library.

---

# 0. Governing rules

1. Source facts first; deterministic math second; admitted knowledge third; external research only when material and unresolved.
2. Never promote a corpus pattern to a domain rule without labeling its `assertion_basis`.
3. Unknown is a valid outcome.
4. Every procedure returns both an answer and its derivability/evidence status.
5. A procedure must fail closed when its required population cannot be established.
6. A procedure may not repair missing source data by inventing values.

Every decision rule carries:

```text
DecisionRule
- rule_id
- version
- assertion_basis
- applicability_scope
- required_inputs[]
- outputs[]
- failure_state
- evidence_dependencies[]
- supersession_ref
```

---

# PART I — SOURCE / SUPPORT PROCEDURES

## 1. Procedure A — template and support recognition

1. Establish source fingerprint and page completeness.
2. Detect template family/version from stable structure, not merchant/processor brand alone.
3. Verify required pages/sections for the intended capability.
4. Assign `support_status` and `pricing_detail_level`.
5. If the document is incomplete, allow only fields supported by observed pages.
6. Merchant identifiers that collide across conflicting identities must create `identifier_collision_across_documents`, never an automatic merge.

**Failure state:** `recognized_but_insufficient` / `unsupported_document_class` / `unreadable_or_incomplete`.

## 2. Procedure B — source occurrence identity and repeated economics

For every financially relevant source row:

1. Preserve raw label, amount, sign, section, page, basis/rate/count where printed.
2. Determine financial direction from printed direction + section semantics, never from product words like `CREDIT` alone.
3. Link duplicated representations using structural evidence and amount/population reconciliation.
4. Only one canonical economic occurrence contributes to fee totals.
5. Detailed interchange tables that explicitly state they are reflected in a fee section are informative representations, not additive fee rows.

---

# PART II — CANONICAL POPULATION PROCEDURES

## 3. Procedure C — canonical sales/refund populations

Resolve in this order:

1. Gross card sales volume and sale-item count, if explicitly printed.
2. Refund/credit volume and refund count, if explicitly printed.
3. Net submitted card volume from statement equation or deterministic subtraction.
4. If only an authoritative submitted amount exists and the template semantics establish it equals net card volume, map it to `canonical_net_submitted_card_volume`.
5. Never use funded amount, net after chargebacks, or 1099 sales as a silent substitute.

### Headline metrics

```text
headline_effective_rate = total_statement_processing_fees /
                          canonical_net_submitted_card_volume

average_ticket = canonical_gross_sale_volume /
                 canonical_gross_sale_transaction_count

cost_per_sale_transaction = total_statement_processing_fees /
                            canonical_gross_sale_transaction_count
```

If the relevant denominator is zero or unavailable, emit `undefined` / unavailable.

---

# PART III — RECONCILIATION PROCEDURES

## 4. Procedure D — template-family reconciliation graph

The control graph is parameterized by admitted template-family knowledge.

### Family A archetype

Typical source equation:

```text
Submitted - Chargebacks/Reversals + Adjustments - Fees = Processed/Funded
```

Typical fee decomposition:

```text
Interchange/Program + Service Charges + Fees = Total Fees
```

### Family B archetype

Typical source equation:

```text
(Submitted - Third Party) + Adjustments/Chargebacks + Fees = Funded
```

Typical fee decomposition:

```text
Card Fees + Miscellaneous Fees = Total Fees
```

Exact sign convention is template-specific and must come from the source equation.

## 5. Procedure E — reconciliation severity

### Blocking

- unique canonical fee occurrences do not reconcile to authoritative fee total beyond applicable tolerance;
- cost stack is declared complete but does not reconcile to authoritative fee total;
- source sign ambiguity changes total cost materially;
- duplicated economics cannot be disambiguated and materially affect totals.

### Warning

- card summary vs batch/interchange volume mismatch;
- transaction count mismatch across source sections;
- detailed-table total differs but authoritative fee ledger still reconciles;
- OCR/layout concerns that do not change authoritative totals.

### Informational

- line recomputation differences attributable to displayed precision/rounding;
- nonmaterial table-display differences.

Tolerance is never a universal fixed dollar amount. It is resolved from template, printed precision, calculation form, and admitted rounding behavior.

---

# PART IV — PRICING ARCHITECTURE PROCEDURES

## 6. Procedure F — construct PricingPopulations

Start with active source populations, not labels.

1. Build a population from the smallest set of source-supported dimensions needed to distinguish pricing behavior.
2. Standard dimensions may include brand, product class, debit/credit, channel, qualification, geography, regulated status, ticket band, commercial data level, PIN network, tokenization, or other source dimensions.
3. Assign activity status:
   - active settled;
   - refund/credit;
   - fee-only;
   - inactive informational;
   - unknown.
4. Zero-volume/zero-fee configuration rows are not active pricing evidence.

## 7. Procedure G — underlying-cost billing mode per population

For each active settled population:

1. Ask whether a **separately billed underlying-cost occurrence** exists and reconciles into billed fees.
2. A merely disclosed interchange/program table does not count if the underlying cost is already bundled in the merchant price and not separately billed.
3. Use effective-dated template knowledge for brand-specific names such as `INTERCHANGE` or `PROGRAM FEES`.
4. If separate underlying cost exists → population mode `separately_billed_pass_through`.
5. If not → population mode `bundled_into_merchant_price`.
6. If evidence is insufficient → `unknown`.

Statement axis:

```text
all active populations pass-through -> separately_billed_pass_through
all bundled -> bundled_into_merchant_price
mixed -> mixed_by_scope
no active processing -> no_active_processing
else -> unknown
```

## 8. Procedure H — merchant price schedule shape

Evaluate active pricing components independent of the pass-through axis.

### Qualification tier ladder

Requires evidence that rates differ by qualification outcome within a comparable scope. Words `QUAL`, `MQUAL`, `NQUAL` alone are insufficient.

### Uniform flat percentage

One merchant percentage applies across all relevant active populations, with no material exceptions.

### Scope-specific flat percentage

Different flat percentages apply by source-supported population without a qualification ladder.

### Rate plus per item

A resolved percentage component and a resolved per-item component both apply to the same or explicitly related merchant pricing population.

### Fixed plus variable

A resolved fixed recurring component coexists with resolved variable pricing.

### Subscription / minimum based

Require actual billed recurring/minimum structure; inactive configured rows do not establish the model in a zero-volume month.

### Composite multi-component

Use when multiple economic formula shapes are active and no one shape safely summarizes the merchant schedule.

## 9. Procedure I — scope uniformity

- `uniform` if equivalent components apply across all active populations;
- `uniform_with_explicit_exceptions` if one dominant formula has bounded named exceptions;
- `scope_specific` if materially different formulas govern populations;
- `no_active_processing` for zero-volume periods;
- `unresolved` otherwise.

## 10. Procedure J — derived human pricing summary

Derived label only; it is not canonical truth.

Examples:

- pass-through + rate/per-item markup -> “interchange-plus / cost-plus”;
- bundled + qualification ladder -> “tiered/bundled”;
- bundled + uniform percentage -> “flat/blended rate”;
- mixed-by-scope -> “hybrid / scope-specific pricing”;
- no active processing -> “current-period pricing model not observable.”

Never infer `tiered` from labels alone.

---

# PART V — ECONOMIC OWNER / CONTROL PROCEDURES

## 11. Procedure K — economic owner assignment

Ownership is positive-identification only.

Accepted bases include:

1. exact admitted template/program mapping;
2. structural statement evidence that proves the role;
3. effective-dated official network/processor documentation;
4. merchant pricing document where the claim is contractual.

If none resolves ownership, return `unknown`.

**Forbidden:** round-number heuristics, lexical resemblance alone, “processor billed it so processor owns it.”

## 12. Procedure L — participant/control roles

Resolve each role separately:

- billing intermediary;
- economic beneficiary;
- rate/rule setter;
- contractual negotiator;
- statutory/rule constraint.

Do not derive all roles from `economic_owner` automatically.

For interchange-like economics, a network/rule framework may set category rules while issuer economics receive the amount; the merchant may influence qualification or acceptance behavior without negotiating the published rate.

---

# PART VI — COST STACK PROCEDURES

## 13. Procedure M — allocate statement-observed cost

For each unique source-grounded fee occurrence:

1. allocate only if the economic role is admitted;
2. unresolved ownership/category stays in `economically_unresolved_cost`;
3. never force unresolved amounts into processor markup to make totals reconcile;
4. settlement adjustments, representments, funding corrections, and taxes payable outside fee total stay outside cost stack;
5. taxes specifically included in processing-fee total may enter `taxes_on_processing_fees`;
6. stack must reconcile to authoritative fee total when declared complete.

---

# PART VII — EFFECTIVE-RATE AND FIXED-FEE PROCEDURES

## 14. Procedure N — effective-rate interpretability

Headline effective rate is always the canonical formula when denominator exists. Interpretation is a separate question.

Consider:

- fixed-fee share of total fees;
- minimum-fee burden;
- whether variable pricing is visible;
- structural opacity;
- activity level;
- whether the month is representative.

Do not use a universal dollar-volume threshold.

### Scenario sensitivity

Under explicit simplifying assumptions only:

```text
C = F + rV
e = F/V + r
elasticity(e,V) = -F/C
```

This is a scenario model. It does not account for transaction count, average ticket, mix, qualification, channel, minimums, or step functions unless those are explicitly held constant or modeled.

---

# PART VIII — COST DRIVER PROCEDURES

## 15. Procedure O — driver synthesis

For each stable driver question:

1. define an explicit population predicate;
2. determine whether population fields are derivable from this document;
3. if not, emit not-derivable rather than estimate;
4. aggregate amount/volume/count deterministically;
5. declare attribution method;
6. name relevant cost pool;
7. preserve overlaps.

### exclusive partition

Populations are mutually exclusive and may sum to a parent total.

### overlapping declared

Populations can overlap. Dollar amounts may not be summed across drivers.

### counterfactual delta

The finding is the evidence-supported **difference** between observed and comparison population, not the full observed cost.

## 16. Procedure P — downgrade / qualification counterfactual

```text
excess_cost = observed_cost -
              (eligible_volume * comparison_rate +
               eligible_count * comparison_per_item)
```

Only allowed when:

- observed population is source-grounded;
- comparison population/program is eligible and supported;
- applicable dated rate inputs are admitted;
- calculation is deterministic.

Otherwise downgrade exposure may be qualitative but exact savings is unavailable.

---

# PART IX — DISPUTE / ACCOUNT RISK PROCEDURES

## 17. Procedure Q — dispute source observations

Collect independently from:

- chargeback/dispute section;
- adjustments section;
- fee-event lines;
- representment/reversal entries;
- separate admitted evidence.

Do not assume all negative adjustments are dispute principal.

## 18. Procedure R — reconcile disputes

1. Link events only when source identifiers, amounts, dates, or admitted template rules support linkage.
2. Fee-event count may corroborate dispute event count but does not prove principal amount.
3. Do not use `max()` across sources as canonical count.
4. If a precise numerator cannot be reconciled, emit a bounded/unresolved risk observation.
5. Gross debit and representment populations stay separate.

Descriptive ratios:

```text
ratio_by_count = resolved_dispute_debit_count / relevant_transaction_population
ratio_by_value = resolved_dispute_debit_value / relevant_gross_volume
```

Network monitoring status requires the exact effective-dated external program definition and denominator.

## 19. Procedure S — risk and pricing context

High risk may explain why pricing could differ, but it does not prove pricing is fair or unfair.

Safe language:

> This pricing may reflect risk allocation; fairness cannot be determined from the statement alone.

A fairness verdict requires risk-matched benchmark or contract/underwriting evidence.

---

# PART X — REFUND PROCEDURES

## 20. Procedure T — refund economics

Resolve separately:

- refund sales/count population;
- whether headline submitted volume is net of refunds;
- whether underlying interchange/program cost is returned;
- whether processor pricing percentage is returned;
- whether per-item refund/return fees are charged;
- whether pricing percentage uses gross or net sales basis.

Negative volume/count rows must be representable without being mistaken for financial credits outside their source population.

---

# PART XI — AMEX PROCEDURES

## 21. Procedure U — acceptance model

Acceptance mode and margin are separate claims.

1. Identify effective-dated template/program structure.
2. Link duplicated `AMERICAN EXPRESS` authorization and `AMEX ACQ`/program sections to one underlying volume when appropriate.
3. If admitted structural knowledge supports acquirer-side OptBlue-like processing -> `optblue_like` rule application.
4. If direct/ESA evidence exists -> `direct_esa_like`.
5. Otherwise unknown.
6. Do not infer Amex margin solely from acceptance mode.

---

# PART XII — NOTICE / RULE PROCEDURES

## 22. Procedure V — statement notices

1. Extract notice source fact.
2. Split mixed notices into separate claims.
3. Classify each claim as processor-own account change, claimed network rule, legal/regulatory claim, or other.
4. Processor-own account changes may support account-level future context.
5. Network/legal claims require the appropriate external authority before broader rule admission.
6. Verification result is one of: verified / contradicted / not independently verified.
7. Only contradiction supports a misstatement/conflict finding; non-verification is not contradiction.

---

# PART XIII — KNOWLEDGE RESOLUTION PROCEDURES

## 23. Procedure W — knowledge specificity precedence

Applicable admitted knowledge is resolved by deterministic specificity:

1. exact template version + period + section + description/structural identity;
2. template version + section + structural predicate;
3. template family + period + network/product scope;
4. processor family / ISO overlay;
5. generic stable semantic mapping.

More specific applicable knowledge wins over broader knowledge **only when the claims are compatible**.

If equally specific applicable admitted entries conflict -> `unresolved_conflict`. Never choose by model confidence.

## 24. Procedure X — claim-specific evidence admission

Do not use a universal evidence ranking. Use the Knowledge Library claim-type matrix.

Examples:

- amount billed -> source statement;
- contract obligation -> merchant agreement/addendum;
- network rate/rule -> official network source;
- legal applicability -> official court/regulatory source;
- processor-specific service meaning -> official processor documentation;
- account notification -> statement notice.

---

# PART XIV — MERCHANT LEVER / IMPACT PROCEDURES

## 25. Procedure Y — merchant lever eligibility

A lever requires:

- economic question resolved enough to act;
- applicable rule/jurisdiction status where relevant;
- evidence/derivability ceiling;
- controllability definition;
- safe action wording.

No direct lever is acceptable when the best conclusion is explanation/monitoring.

## 26. Procedure Z — impact / savings contract

Dollar impact may be expressed only if all are present:

- baseline population;
- counterfactual population or alternative price;
- approved inputs;
- calculation reference;
- time period;
- recurrence assumption;
- implementation dependency;
- gross vs net impact definition;
- derivability sufficient for the requested precision.

A gross fee amount is not a savings estimate.

---

# PART XV — THEME SYNTHESIS PROCEDURES

## 27. Procedure AA — create merchant themes

1. Group charges/drivers/signals that answer the same merchant question.
2. Prefer one primary theme per economic question.
3. Split only when merchant action materially differs.
4. Routine source rows remain supporting detail, not standalone findings.
5. Do not force a theme-count target.
6. Positive controls are allowed when they materially explain the account.

## 28. Procedure AB — priority

Priority is a structured ordering using:

- priority class;
- evidence strength;
- materiality;
- controllability;
- recurrence/history;
- ease of resolution.

Account survival risk can outrank pricing only when sufficiently grounded. High-confidence material billing defects can outrank low-confidence suspected risk.

---

# PART XVI — MULTI-STATEMENT PROCEDURES

## 29. Procedure AC — period change decomposition

At minimum distinguish:

- volume effect;
- fixed-fee effect;
- aggregate rate/mix effect.

```text
Delta_cost = C1 - C0
volume_effect = (V1 - V0) * r0
fixed_fee_effect = F1 - F0
aggregate_rate_mix_effect = Delta_cost - volume_effect - fixed_fee_effect
```

This is accounting, not causal attribution.

Where sufficient detailed populations exist, further isolate:

- mix effect;
- qualification/operational effect;
- actual pricing-rule change.

Only the last supports “processor pricing changed.”

---

# PART XVII — RECOMPUTATION / VERIFICATION MATH

## 30. Rate-based fee recomputation

```text
delta = abs(printed_amount - base * rate)
```

## 31. Per-item recomputation

```text
delta = abs(printed_amount - quantity * unit_rate)
```

## 32. Interchange/program recomputation

```text
delta = abs(printed_subtotal - (sales * rate + count * per_item))
```

Tolerance comes from a versioned tolerance rule based on source precision and statement family; a corpus-observed $0.03 is not a universal rule.

## 33. Assessment verification

```text
observed_rate = assessment_amount / assessment_base
```

Compare only with applicable dated schedules. Tiered/blended network assessments must be modeled as such; a blended observed rate is not automatically an error.

## 34. Authorization-to-settlement diagnostic

```text
excess_auth_rate = (authorization_count - settled_count) / settled_count
```

Diagnostic only. A negative result indicates quantity-basis misunderstanding may exist. “Normal” requires a benchmark or rule.

---

# PART XVIII — SAFE FAILURE STATES

## 35. Required fail-closed outcomes

The procedures must be able to return:

- `unknown`
- `unresolved`
- `not_derivable_from_this_document_class`
- `requires_external_rule_or_schedule`
- `requires_merchant_pricing_document`
- `requires_additional_statement_history`
- `requires_processor_explanation`
- `unresolved_conflict`
- `supported_limited`

None of these is an error if it faithfully reflects the evidence ceiling.

---

# PART XIX — PROCEDURE ACCEPTANCE TESTS

## 36. Pricing discriminators

The decision procedures must correctly distinguish at least:

- Vortax-style pass-through + flat 1.50% component -> IC+ human summary, not tiered because of `QUAL` labels;
- Xpress-style separately billed interchange + 0.20% component -> IC+ summary;
- Philip/Animal Delta tier ladders with no separately billed interchange -> bundled/tiered;
- Jamaica Fish uniform 3.80% bundled across populations -> flat/blended, not tiered;
- hypothetical bundled Visa 2.90%, debit 2.50%, Amex 3.50% with no tier ladder -> bundled + scope-specific flat, not tiered;
- hypothetical Visa/MC pass-through + Amex bundled -> mixed-by-scope/hybrid summary.

## 37. Forbidden reasoning

Must never:

- infer ownership from round numbers;
- infer pricing type from `QUAL/MQUAL/NQUAL` labels alone;
- call missing sales-discount line zero total markup;
- use inactive rate rows as active pricing evidence;
- call high-risk pricing fair without matched evidence;
- call full downgraded cost “avoidable savings”;
- treat unverified future notices as current rules;
- absorb non-fee adjustments into cost stack;
- choose among equal-specificity conflicting knowledge by confidence.

