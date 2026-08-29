# RateReveal Canonical Synthesis Admission Contract v1.1

**Status:** Frozen product-owner-approved versioned amendment.

**Approved:** 2026-08-29.

**Contract identifier:** `canonical_synthesis_admission_contract_v1_1`.

**Integrity identity:** `canonical-synthesis-admission-contract-v1-1.lock.json` in this directory.

**Amends and narrowly supersedes:** Canonical Synthesis Admission Contract v1 only as expressly stated below. Contract v1 and its integrity lock remain immutable and continue to govern historical Contract-v1 runs.

## 1. Authority, precedence, and implementation boundary

This amendment must be read with:

1. the immutable Frozen Product Model v0.1 package;
2. Runtime Intelligence Policy v0.1 as amended by Runtime Policy Amendment v0.2;
3. Materiality Contract v1;
4. Canonical Synthesis Admission Contract v1; and
5. the maintained Frozen Product Model to RA–RH traceability crosswalk.

All Contract-v1 rules remain controlling unless this amendment expressly narrows or supersedes them. In particular, exact-facet independence, positive evidence, RF-first authority, current-run verified-evidence integrity, constraint identity/effect separation, recurrence before annualization, actionability/impact separation, financial-truth invariance, partial truthful completion, specialized-family exclusions, business-type and benchmark exclusions, savings ceilings, and unchanged customer-report authority remain intact.

This artifact freezes product semantics only. It grants no runtime, provider, RF, report, benchmark, savings, or customer authority. A separately authorized and accepted implementation package is required before a production AnalysisRun may bind to this amendment.

## 2. Amendment purpose

Contract v1 used the stable action identity `request_pricing_term_review` for an action whose label and purpose described asking for review, while its class, exact merchant-change-right prerequisite, potential impact boundary, and pricing-change lever mapping represented a stronger economic-change action.

Contract v1.1 separates those meanings:

- asking the provider to explain or review how observed pricing was applied is a candidate-verification action;
- requesting a governing pricing document remains a separate candidate-verification action; and
- pursuing or exercising a contractual pricing change is not activated by this amendment.

The lack of a merchant agreement, pricing schedule, addendum, or other account-specific document may limit contractual conclusions or stronger future actions. It must not erase valid single-statement financial or economic truth and must not prevent a truthful autonomous outcome with the affected portions unresolved or withheld.

## 3. Stable narrow-v1.1 safe-action catalog

For an AnalysisRun bound to Contract v1.1, the active safe-action catalog contains exactly:

- `request_governing_documentation`;
- `verify_account_capability_or_configuration`;
- `request_pricing_application_review`;
- `review_supported_configuration_change`;
- `review_supported_operational_process_change`; and
- `establish_monitoring_baseline`.

The five unchanged action identities retain every Contract-v1 prerequisite, evidence ceiling, constraint rule, prohibited claim, internal RH permission, and impact boundary.

`request_pricing_term_review` is not an active Contract-v1.1 action identity. It retains only its immutable historical Contract-v1 meaning. No Contract-v1.1 runtime may reinterpret a historical Contract-v1 application or silently migrate it to `request_pricing_application_review`.

No contractual pricing-change, pricing-renegotiation, price-reduction, or pricing-option-exercise action is activated by Contract v1.1.

## 4. `request_pricing_application_review`

### 4.1 Purpose and class

`request_pricing_application_review` means asking the applicable provider to explain or review how observed pricing was applied to the merchant for the exact statement scope and period.

It is a **candidate-verification action**. It is not a merchant economic-change lever, pricing-change action, negotiation action, contractual-option exercise, recommendation, or impact claim.

### 4.2 Exact prerequisites

The action requires:

1. an exact observed canonical pricing component, exact observed charge, or exact unresolved pricing question;
2. the exact statement scope and period to which the observation or question belongs;
3. an identified explanation or application-review question that the provider is being asked to answer; and
4. the appropriate provider or request target when that target is available from admitted evidence.

If an appropriate target is not established, RateReveal must not guess one. The action may remain bounded to the question with an explicit target limitation and without target-specific call guidance.

An unresolved contractual pricing term is not itself an obstacle to asking how the observed pricing was applied. Wording must distinguish an observed pricing component or charge from an unproven contractual term.

### 4.3 Required evidence and derivability ceiling

The action must be grounded in admitted statement/canonical evidence for the exact observed pricing subject and in the exact unresolved explanation or application question. It may identify missing provider explanation or documentation as a remaining evidence requirement.

The evidence required to ask the question does not establish the answer. Provider explanation, merchant documents, applicable rules, or additional evidence must undergo their own exact-claim admission before they can resolve any pricing, control, actionability, or impact claim.

### 4.4 Merchant influence

`request_pricing_application_review` requires:

- no `merchant_change_right`; and
- no merchant operational controllability.

The ability to ask a provider for an explanation does not prove that the merchant can alter pricing. Conversely, inability to prove a contractual change-right does not prohibit the explanation/application-review request.

### 4.5 Constraint scope

Only an independently admitted constraint effect on the exact `request_pricing_application_review` action may block or condition that request.

A constraint on changing, renegotiating, exercising an option concerning, or otherwise altering pricing does not automatically constrain asking for an explanation or application review. Constraint identity, pricing ownership, billing, collection, rate setting, or an unproven contract never supplies that effect.

All Contract-v1 exact effect, condition, explicit-negative, conflict, scope, and period rules continue to apply.

### 4.6 Internal RH permission and impact ceiling

The maximum internal RH action boundary is:

`verification_or_document_request`

The action may support an exact question and bounded call guidance asking the provider to explain or review how the observed pricing was applied. It cannot support an affirmative pricing-change conclusion or any stronger action boundary.

Quantified impact is prohibited for this action. A counterfactual, recurrence evidence, dollar amount, or separate impact claim cannot raise this action above `verification_or_document_request` and cannot be attributed to the act of requesting an explanation.

### 4.7 Prohibited conclusions

`request_pricing_application_review` must not state or imply:

- that the merchant can change the pricing term;
- that pricing is negotiable;
- entitlement to a lower or different price;
- overcharging, unfair pricing, or invalid billing;
- removability;
- successful negotiation or renegotiation;
- savings, potential reduction, avoidability, or economic impact;
- a recommendation to switch, cancel, renegotiate, or exercise an unproven contractual option; or
- any guaranteed outcome or legal conclusion.

Allowed bounded example:

> This exact observed pricing component is material and its application remains unresolved. Ask the identified provider to explain how it was applied for this statement period.

Forbidden example:

> This charge is negotiable, so ask the provider to lower it and expect the observed amount as savings.

## 5. Separation from `request_governing_documentation`

`request_governing_documentation` remains unchanged from Contract v1.

- A documentation request asks for the exact agreement, pricing schedule, addendum, rule, account document, or other governing artifact needed to resolve a claim.
- A pricing application review asks the provider to explain or review how observed pricing was applied.

Both actions may independently satisfy their own prerequisites for the same unresolved economic question. They remain separate action identities, applications, evidence objectives, and provenance records. Neither action establishes merchant change-right, operational controllability, negotiability, pricing-change authority, recommendation permission, or impact.

Obtaining a document or explanation may create evidence for a later exact claim only after that evidence passes its own authority, identity, locator, scope, period, applicability, and semantic-support admission.

## 6. No activated contractual pricing-change action

Contract v1.1 authorizes no action that concludes the merchant may change or renegotiate pricing, exercise a contractual pricing option, obtain different pricing, or pursue quantified pricing reduction.

Any future pricing-change action requires a separate versioned product decision defining at least:

- a stable action identity and exact purpose;
- the required merchant change-right or other authority relationship;
- applicable constraints and conditions;
- implementation and document dependencies;
- safe wording and prohibited claims;
- internal RH permission ceiling; and
- independent counterfactual and impact requirements, if impact is permitted.

Existing Contract-v1 rules for `review_supported_configuration_change` and `review_supported_operational_process_change` are not broadened into pricing-change authority.

## 7. Theme, materiality, and completion effects

Materiality remains claim-specific under Materiality Contract v1. This amendment does not make every observed pricing item material and does not use business type or benchmark context.

When otherwise eligible under the existing Contract-v1 theme rules, `request_pricing_application_review` may appear only as a linked limited verification action for the exact unresolved economic question. It does not create an affirmative pricing conclusion, supported economic-change theme, recommendation, or impact theme.

`request_pricing_application_review` and `request_governing_documentation` may coexist under the same exact unresolved economic question while retaining separate action identity and evidence purpose. Their coexistence does not increase actionability or priority.

A missing merchant agreement or other account-specific document may produce an explicit unresolved/document-required limitation. It must not invalidate independently proven statement totals, charge populations, effective rate, reconciliation, category, driver, or other canonical truth. A single-statement AnalysisRun may complete truthfully with the contractual portion unresolved or withheld.

## 8. Binding requirements for later prerequisite projection

A Contract-v1.1 prerequisite projector must:

1. never create `merchant_change_right` or merchant operational-controllability claims from `request_pricing_application_review`;
2. never create pricing-change constraint-effect, counterfactual, recurrence, recommendation, or impact prerequisites from that action;
3. preserve its exact observed subject, occurrence/population, scope, statement period, and direction lineage;
4. permit a separate `request_governing_documentation` action only when that action independently satisfies its own Contract-v1 prerequisites;
5. keep pricing-change constraints independent unless evidence proves an exact effect on the application-review request;
6. preserve unavailable merchant/account documents as typed unresolved or withheld evidence requirements rather than analytical failure; and
7. project `merchant_change_right` only for a separately approved action whose frozen contract expressly requires it.

The projector must not reinterpret legacy Contract-v1 `request_pricing_term_review` records. Historical runs remain bound to their recorded contract identity and semantics.

## 9. Exact Contract-v1 supersession map

For Contract-v1.1-bound runs only:

| Contract-v1 provision | Contract-v1.1 disposition |
|---|---|
| Section 3 activation of `request_pricing_term_review` | Replaced in the active narrow catalog by `request_pricing_application_review`. |
| Section 8.1 statement that exact change-right is sufficient for `request_pricing_term_review` | Retained only for historical Contract-v1 interpretation; it grants no authority to the Contract-v1.1 application-review action. |
| Section 10.3 `request_pricing_term_review` catalog entry | Superseded by Section 4 of this amendment for new Contract-v1.1 runs. The historical entry is not rewritten. |
| Section 10 common impact rule as applied to the old pricing-review action | Narrowed: quantified impact is prohibited for `request_pricing_application_review`. |
| Sections 11–12 action-boundary mapping for the old pricing-review action | Narrowed to `verification_or_document_request` for `request_pricing_application_review`. |
| Section 14 pricing-review authority-prerequisite row | Retained as historical Contract-v1 meaning only; Contract v1.1 activates no contractual pricing-change action. |
| Section 15 six-action catalog non-drift gate | The six active Contract-v1.1 identities are those in Section 3 of this amendment. |

Every other Contract-v1 provision remains unchanged.

## 10. Non-drift requirements

A later Contract-v1.1 implementation must fail closed if it:

1. accepts `request_pricing_term_review` as a new Contract-v1.1 action or silently migrates a historical application;
2. represents `request_pricing_application_review` as a pricing-change lever or supported economic-change action;
3. requires merchant change-right or operational controllability for the application-review request;
4. lets the application-review request imply change-right, controllability, negotiability, entitlement, removability, overcharging, recommendation, savings, potential reduction, or impact;
5. gives the action an internal boundary above `verification_or_document_request`;
6. attaches quantified impact, counterfactual permission, or annualization to the action;
7. merges its identity or evidence objective with `request_governing_documentation`;
8. applies a pricing-change constraint to the application-review request without separately admitted exact-action effect evidence;
9. treats missing merchant documents as invalidating independent canonical truth or preventing truthful partial completion;
10. creates an unapproved contractual pricing-change action; or
11. changes provider behavior, RF governance, financial truth, business-type or benchmark semantics, savings authority, specialized RE scope, or customer-report routing under this amendment.

Any further change requires another explicit product-owner decision, a separate versioned contract or amendment, a new integrity identity, and an updated traceability record. Contract v1 and this Contract v1.1 amendment must never be rewritten in place after acceptance.
