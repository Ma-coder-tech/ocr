# RateReveal Canonical Synthesis Admission Contract v1

**Status:** Frozen product-owner-approved production semantics.

**Approved:** 2026-08-29.

**Contract identifier:** `canonical_synthesis_admission_contract_v1`.

**Integrity identity:** `canonical-synthesis-admission-contract-v1.lock.json` in this directory.

**Amends and narrows:** the synthesis-admission and internal-permission behavior described by the Frozen Product Model. This contract is a versioned overlay; it does not rewrite any frozen original.

## 1. Authority, precedence, and implementation boundary

This contract is governed by, and must be read consistently with:

1. Merchant Processing Economics Schema v0.7, especially Parts VI, XVII, XVIII, XIX, and XX;
2. Decision Procedures v0.2, especially Procedures K–L, O–P, W–X, and Y–AB;
3. Payments Knowledge Library Spec v0.2, especially its claim-specific evidence, positive-identification, admission, scope, effective-date, conflict, and supersession rules;
4. Runtime Intelligence Policy v0.1 as amended by Runtime Policy Amendment v0.2;
5. Materiality Contract v1; and
6. all accepted product-owner decisions recorded in the maintained RA–RH traceability crosswalk.

The Frozen Product Model controls stable objects, evidence ceilings, and permission invariants. This contract supplies the smallest new production definitions needed to admit evidence into narrow-v1 synthesis without inventing adjacent meaning.

Once a separately authorized implementation connects this contract, properly admitted synthesis evidence may authoritatively change the **internal canonical AnalysisRun**: RE, facet-aware unresolved claims, materiality, remaining RG work, internal RH permission state, semantic revisions, and the autonomous outcome. That authority does not extend to RB/RC financial truth, automatic RF promotion, benchmark qualification, savings authority, or the customer report.

This artifact freezes product semantics only. It does not grant the current RE component new runtime, persistence, report, or customer authority and does not authorize an implementation package.

## 2. Governing admission principle

> Evidence may progressively unlock explanation → actionability → impact, but every transition requires its own independently sufficient proof. No downstream permission may be inferred merely because an upstream fact is true. Exact facets remain independent and adjacent-claim bleed is prohibited.

Accordingly:

- admission is exact-claim, exact-facet, exact-subject, exact-scope, exact-period, and direction-specific;
- governed RF knowledge resolves first when the immutable run-bound snapshot contains an applicable admitted answer;
- properly verified current-run RG evidence may support only the current AnalysisRun without becoming an RF catalog entry;
- current-run evidence never overrides applicable governed RF knowledge; an applicable contradiction leaves only the exact claim conflicting/unresolved;
- source authority and evidence strength remain separate;
- one source may prove one facet without proving category, ownership, control, actionability, recurrence, counterfactual, recommendation, or impact;
- authoritative negative evidence may establish a negative state only for the exact scope and period it covers; and
- a failed search, no-result response, omission from public documentation, silence in one document, or absence from one statement never proves non-existence, non-applicability, or unavailability.

External synthesis evidence remains first-class external provenance. It is not inserted into RB or source-document evidence and cannot mutate statement facts, financial populations, charge amounts or direction, contribution membership, authoritative processing cost, effective rate, or reconciliation.

## 3. Narrow-v1 activation scope

Contract v1 covers only:

- exact constraints and their independently proven effects on cataloged actions;
- merchant change-right and operational controllability as separate claims;
- statement-grounded economic drivers;
- recurrence and cadence;
- verification-only or exact-deterministic counterfactuals;
- the six safe actions in Section 10;
- the two economic questions and five action boundaries in Section 11; and
- the resulting bounded internal RH permission changes in Section 12.

Contract v1 does not activate refund economics, Amex economics, account-service economics, merchant pricing-program economics, off-statement exposure, statement-notice synthesis, operational-risk/account-risk synthesis, bounded counterfactual ranges, or another specialized RE family.

Business type and benchmarks remain outside canonical synthesis admission. The separate existing pricing projection remains unchanged; Contract v1 adds no `pricing_structure` theme or new pricing-axis synthesis semantics.

## 4. Common evidence and resolution contract

Every admitted synthesis claim must preserve:

- immutable atomic claim/facet identity;
- opaque subject and occurrence/population lineage;
- applicable scope and scope fingerprint;
- statement period and evidence effective period;
- claim-specific derivability route and evidence class;
- admitted evidence references, source identity, fingerprint, exact support locator, and authority locator when different;
- dependencies and conditions;
- resolution state and limitations; and
- application provenance identifying governed RF or current-run verified RG evidence.

Evidence is admitted only when its authority, origin/publisher binding, document identity, locator support, scope, period, applicability, and exact semantic support satisfy their existing deterministic contracts. Evidence obtained for one claim may be evaluated for another claim only through a separate exact-claim admission; it never bleeds automatically.

Supported/proven, unresolved, conflicting, unavailable, and not-applicable meanings remain those of the Frozen Product Model and existing approved contracts. This contract does not reinterpret them. Partial truthful synthesis is permitted: a withheld or unresolved facet does not erase independently proven upstream facts or other independently admitted facets.

## 5. Constraint identity

A constraint identity is separate from every effect it may have on a merchant action. The minimum canonical payload is:

```text
ConstraintIdentity
- constraint_id
- constrained_subject_refs[]
- identity_resolution_state
- applicability_resolution_state
- governing_authority_ref
- governing_source_ref
- scope_fingerprint
- effective_from
- effective_to
- evidence_refs[]
- limitations[]
```

Requirements:

- `constraint_id` identifies the exact constraint established by admitted evidence; it is not free-form model-authored meaning.
- identity and applicability are independently resolved.
- applicability must be established for the exact subject, scope, and period.
- the authority and source references must identify who/what creates the constraint and where it is established.
- an identity with no separately admitted action effect remains explanatory only.

Constraint identity alone never proves that economics are unavoidable, non-negotiable, uncontrollable, removable, changeable, beneficial, or harmful. It never proves merchant change-right, operational controllability, or impact.

## 6. Constraint effect on an action

The minimum action-effect payload is:

```text
ConstraintActionEffect
- effect_id
- constraint_ref
- safe_action_code
- effect_state
- effect_resolution_state
- condition_claim_refs[]
- dependency_refs[]
- scope_fingerprint
- effective_from
- effective_to
- evidence_refs[]
- limitations[]
```

`effect_state` has exactly three Contract-v1 values:

- `blocks_action` — applicable authoritative evidence explicitly prohibits the exact action;
- `conditions_action` — applicable authoritative evidence explicitly makes the exact action dependent on one or more identified conditions; or
- `does_not_restrict_this_action` — applicable authoritative evidence explicitly establishes that this exact constraint does not restrict the exact action.

The third state clears only the named constraint/action relationship. It does not prove that the action is generally available, that another constraint does not apply, or that any other action prerequisite is satisfied.

An effect must not be inferred from constraint identity, a generic authority relationship, economic ownership, billing, collection, rate/rule setting, or model opinion. The evidence must support the exact effect on the exact cataloged action.

## 7. Constraint-effect aggregation and explicit negatives

For one action, effects are evaluated independently at matching scope and period:

1. An identity without a supported exact action effect does not change action permission.
2. A supported `blocks_action` effect makes that exact action `not_available`.
3. A supported `conditions_action` effect requires every named condition to be independently resolved.
4. Positive authoritative proof that a required condition is not satisfied makes that exact action `not_available` for the applicable scope and period.
5. Missing evidence, an unresolved condition, or a failure to find proof leaves the action unresolved/withheld; it does not establish `not_available`.
6. A supported `does_not_restrict_this_action` effect clears only that exact constraint. All other constraints and action prerequisites remain active.
7. Multiple constraints remain independent. One applicable supported block is sufficient to block the exact action; every applicable supported condition must be satisfied before that constraint ceases to withhold it.
8. Contradictory equally applicable evidence about the same constraint/action effect is an unresolved conflict. It is not resolved by choosing the more convenient effect, and the action remains withheld.
9. An unresolved or conflicting material constraint effect withholds the exact action but does not erase explanation, financial truth, or unrelated actions.

No aggregation outcome establishes merchant change-right, operational controllability, recurrence, counterfactual validity, recommendation, or impact.

Allowed example: an applicable contract clause explicitly says a particular configuration change requires terminal certification; certification is independently proven absent. That configuration action is `not_available` for the covered account and period.

Forbidden example: an official network rule exists, therefore every fee governed by the network is “non-negotiable” and no merchant action is possible.

## 8. Change-right and operational controllability

`merchant_change_right` and `merchant_operational_controllability` are separate atomic facets.

### 8.1 Merchant change-right

An exact merchant change-right normally requires applicable account-specific merchant evidence such as an agreement, addendum, or pricing schedule. An applicable law, rule, or program authority may independently establish a right only when it explicitly grants that right to the covered merchant/account/program and action.

An admitted exact change-right is sufficient for `request_pricing_term_review` when the same proof already establishes the relevant authority relationship. A redundant negotiator/change-authority role is not required. The right supports requesting a review only; it does not imply successful negotiation, entitlement to a different price, removability, or economic impact.

### 8.2 Operational controllability

Operational controllability requires applicable official documentation establishing the mechanism plus evidence that the capability applies to this merchant/account/program. Feature availability without account applicability is insufficient.

Ownership, beneficiary, collector, billing intermediary, rule setter, price setter, processor identity, feature availability, or a cost-driver classification does not imply change-right or operational controllability.

Allowed example: official account documentation proves that this merchant may request review of the exact pricing term. RateReveal may support the review request, subject to all other prerequisites.

Forbidden example: the processor bills a charge, therefore the merchant can renegotiate it.

## 9. Drivers, recurrence, and counterfactuals

### 9.1 Economic drivers

External evidence may establish exact program or semantic meaning. Merchant population membership, amounts, counts, volume, deterministic calculations, and cost allocation remain grounded in admitted statement evidence and canonical financial/economic lineage.

A driver is explanatory. Driver status alone never establishes avoidability, actionability, merchant influence, recurrence, counterfactual validity, savings, or priority.

### 9.2 Recurrence and cadence

Recurrence may be supported by one of three distinct evidence routes:

- compatible multi-statement history;
- an applicable merchant contract; or
- an applicable verified schedule.

The evidence route remains explicit. One observed statement occurrence never proves recurrence. Annualization additionally requires supported cadence or occurrences-per-year, compatible period/population scope, a valid deterministic calculation, and every existing impact prerequisite.

### 9.3 Counterfactuals

Contract v1 admits only:

- `verification_only`; or
- `exact_deterministic_delta`.

Bounded conditional ranges are outside Contract v1 activation, not permanently prohibited.

An exact delta requires compatible observed and alternative populations/periods, an admitted alternative, explicit assumptions, approved inputs, deterministic calculation provenance, overlap controls, implementation dependencies, and gross-versus-net meaning. Recurrence/cadence is required before annualization.

A counterfactual never proves that the merchant can implement the action. Conversely, an actionable lever never proves a dollar impact. A gross observed charge is never a savings or potential-reduction amount.

## 10. Stable safe-action catalog v1

Only the six action codes below exist for Contract v1. Models and runtime providers may propose evidence or wording within a code's boundary but may not create, rename, or broaden action identities.

Common rules for every action:

- every prerequisite is exact-claim, exact-scope, and exact-period;
- required evidence must be admitted under its claim-specific authority contract;
- every applicable constraint effect must satisfy Sections 5–7;
- missing prerequisites leave the action unresolved or at its stated verification ceiling;
- implementation/document dependencies remain explicit;
- action support does not imply success, entitlement, removability, recommendation, or impact; and
- no action supplies legal advice or unsupported switch, cancel, or renegotiate language; and
- quantified impact is admitted only through a separate valid counterfactual and permission path.

### 10.1 `request_governing_documentation`

- **Purpose:** ask the appropriate holder for the exact agreement, schedule, addendum, rule, or account document needed to resolve a material claim.
- **Class:** candidate-verification action.
- **Prerequisites:** an exact unresolved material claim; a named missing document/evidence class; an identified relationship between that document and the claim; and a known appropriate document holder or request channel when derivable.
- **Required evidence:** admitted statement/canonical evidence for the subject and dependency; evidence that the named document class could resolve the exact claim. The document's answer need not yet be known.
- **Change-right/control:** neither merchant change-right nor operational controllability is required because the action obtains evidence rather than changing economics.
- **Constraint state:** no supported applicable block on this request; unresolved effects keep the request withheld only when they concern this exact action.
- **Dependencies:** document identity/type, covered scope/period, and request target/channel when available.
- **Internal RH permission:** explicit question plus limited verification/document-request action and bounded call guidance.
- **Prohibited claims:** what the missing document says; entitlement; invalid billing; negotiability; removability; recommendation; or economic impact.
- **Quantified impact:** prohibited.

### 10.2 `verify_account_capability_or_configuration`

- **Purpose:** verify whether an officially documented capability or configuration is available and applicable to this account/program.
- **Class:** candidate-verification action.
- **Prerequisites:** an exact unresolved material capability/configuration claim; applicable official documentation establishing the capability class or mechanism; and unresolved account applicability.
- **Required evidence:** official mechanism evidence plus admitted account/program scope sufficient to ask the exact applicability question. Generic feature marketing is insufficient.
- **Change-right/control:** neither is required to verify availability; neither is implied by a positive answer.
- **Constraint state:** no supported applicable block on verification; unresolved economic-change constraints do not themselves bar this evidence request.
- **Dependencies:** exact capability/configuration identity, account/program scope, and an appropriate verification source/channel.
- **Internal RH permission:** explicit question plus limited verification action and bounded call guidance.
- **Prohibited claims:** current enablement, eligibility, change-right, controllability, successful implementation, recommendation, or impact before separately proven.
- **Quantified impact:** prohibited.

### 10.3 `request_pricing_term_review`

- **Purpose:** request review of an exact applicable merchant pricing term.
- **Class:** supported action.
- **Prerequisites:** the exact pricing term and scope; an admitted exact merchant change-right that establishes the relevant authority relationship; all stated implementation/document dependencies; and resolved applicable constraint conditions.
- **Required evidence:** normally applicable account-specific agreement/addendum/pricing schedule; alternatively an applicable law/rule/program source explicitly granting the right. Statement observation alone is insufficient.
- **Change-right/control:** exact merchant change-right is required. A separate redundant negotiator/change-authority role is not required when the right evidence already proves the authority relationship.
- **Constraint state:** no applicable supported block; every applicable supported condition is positively satisfied; no material conflicting/unresolved exact effect.
- **Dependencies:** governing pricing document and any named review procedure or submission requirement established by evidence.
- **Internal RH permission:** supported action and bounded call guidance. Statement-period or annual impact may be added only if separately admitted.
- **Prohibited claims:** successful negotiation, entitlement to a different price, guaranteed reduction, removability, invalid billing, cancellation/switch advice, or impact without a valid counterfactual.
- **Quantified impact:** optional, never required for the action, and separately gated.

### 10.4 `review_supported_configuration_change`

- **Purpose:** review an exact configuration or acceptance-method change that evidence shows is available to the merchant/account.
- **Class:** supported action.
- **Prerequisites:** exact account/program applicability; the supported configuration mechanism; required merchant change-right or operational controllability for that mechanism; current-state evidence where the action depends on current state; all implementation dependencies; and resolved constraint conditions.
- **Required evidence:** applicable official mechanism documentation plus account-specific applicability/control evidence; merchant documentation where contractual change-right is required.
- **Change-right/control:** the exact action must have whichever of change-right or operational controllability its mechanism requires. One does not substitute for the other unless the admitted authority expressly establishes both.
- **Constraint state:** no applicable supported block; every applicable supported condition is positively satisfied; no material conflicting/unresolved exact effect.
- **Dependencies:** named configuration, supported implementation path, account/program prerequisites, and any documented equipment/certification dependency.
- **Internal RH permission:** supported action and bounded call guidance. Statement-period or annual impact may be added only if separately admitted.
- **Prohibited claims:** automatic eligibility, successful enablement, guaranteed qualification or rate change, recommendation beyond the exact supported review, or impact without a valid counterfactual.
- **Quantified impact:** optional and separately gated.

### 10.5 `review_supported_operational_process_change`

- **Purpose:** review an exact merchant-operable process change supported by an observed driver and applicable mechanism evidence.
- **Class:** supported action.
- **Prerequisites:** an exact supported driver/population; an applicable process mechanism; exact operational controllability; all implementation dependencies; and resolved constraint conditions.
- **Required evidence:** statement-grounded driver membership and magnitude plus applicable official or merchant-specific evidence for the process mechanism and account applicability.
- **Change-right/control:** exact operational controllability is required; merchant change-right is additionally required only when the mechanism itself is contractually permissioned.
- **Constraint state:** no applicable supported block; every applicable supported condition is positively satisfied; no material conflicting/unresolved exact effect.
- **Dependencies:** named process, affected population, implementation method, and any documented system/training/configuration prerequisite.
- **Internal RH permission:** supported action and bounded call guidance. Statement-period or annual impact may be added only if separately admitted.
- **Prohibited claims:** merchant fault, causal savings, guaranteed requalification, guaranteed fee avoidance, or impact without a valid counterfactual.
- **Quantified impact:** optional and separately gated.

### 10.6 `establish_monitoring_baseline`

- **Purpose:** collect comparable evidence over time for an exact recurring, changing, or presently unresolvable economic question.
- **Class:** supported evidence-collection action.
- **Prerequisites:** an exact supported or unresolved material claim/population for which compatible history would materially improve understanding; a defined measurement/population; and a valid comparison plan.
- **Required evidence:** admitted current-period subject/population identity and a supported need for additional compatible history. Recurrence need not already be proven.
- **Change-right/control:** neither is required because monitoring changes evidence collection, not underlying economics.
- **Constraint state:** no supported applicable block on collecting the identified evidence; an economic constraint does not automatically block monitoring.
- **Dependencies:** compatible future/prior statement periods, stable population definition, measurement cadence or comparison trigger, and retained provenance.
- **Internal RH permission:** bounded monitoring action and call guidance where a third party must provide the records.
- **Prohibited claims:** recurrence already proven, trend, causality, avoidability, recommendation to change economics, savings, or annual impact.
- **Quantified impact:** prohibited until recurrence and a separate valid counterfactual independently support it.

## 11. Theme, question, and action-boundary mapping v1

Themes answer an economic question; they do not group fee rows merely because the rows look similar. Materiality, actionability, impact, and priority remain separate axes.

### 11.1 Economic questions and theme types

| Economic question code | Question answered | Supported theme type | Unresolved theme type |
|---|---|---|---|
| `observed_cost_driver` | What materially drove observed statement processing cost in this period? | `major_economic_driver` | `major_economic_driver`, explicitly unresolved and containing no affirmative driver answer |
| `cost_control_and_merchant_action` | Who controls or can change this material cost, what constrains the exact action, and what can the merchant safely do? | `other_supported_question` | `unresolved_cost_control` |

Contract v1 does not add a separate `pricing_structure` theme. Existing pricing projection remains independent.

### 11.2 Action boundaries

The action boundary is the highest synthesis/RH permission independently supported for the exact theme scope:

1. `explanation_only` — supported economic explanation; no action permission.
2. `verification_or_document_request` — only an approved candidate-verification/document-request action.
3. `supported_action_no_quantified_impact` — an approved supported action whose prerequisites are proven; no dollar impact permission.
4. `supported_action_with_statement_period_impact` — the supported action plus a separately admitted exact deterministic statement-period counterfactual.
5. `supported_action_with_annual_impact` — the preceding requirements plus independently proven recurrence/cadence and valid annualization.

No boundary may be skipped. A higher boundary requires all permissions below it and its own independent proof.

### 11.3 Deterministic grouping

The grouping key is:

```text
economic_question_code
+ canonical_question_scope_fingerprint
+ action_boundary_code
+ statement_period
```

The question-scope fingerprint is derived from exact atomic lineage: subject, occurrence/population, scope, period, and direction. A debit and a credit do not merge. Independent category, ownership, control, actionability, constraint, recurrence, and counterfactual facets do not merge merely because they concern the same charge.

Charges, drivers, claims, and levers may contribute to one theme only when they answer the same question within the same scope and action boundary. A materially different action boundary requires separation. One occurrence is referenced once within the same contribution and is never double-counted.

### 11.4 Supported-theme eligibility

A supported theme requires:

- at least one supported canonical contribution answering the economic question;
- valid exact-scope references and evidence provenance;
- a lossless deterministic mapping to the approved question and theme type;
- materiality and actionability recorded independently; and
- an action boundary no higher than the independently proven permission ceiling.

A supported material driver theme may remain `explanation_only`. A supported actionable theme may remain without quantified impact. Quantified impact does not itself make an action supported.

### 11.5 Explicitly unresolved-theme eligibility

An unresolved theme requires at least one material unresolved atomic claim whose resolution would answer the approved economic question, plus its exact unknown, evidence requirement, scope, and dependencies. It must not manufacture an affirmative answer.

An unresolved material `cost_control_and_merchant_action` theme may produce both:

- an explicit internal RH question; and
- a linked `request_governing_documentation` or `verify_account_capability_or_configuration` action when that action independently satisfies its catalog requirements.

The theme remains explicitly unresolved. It cannot produce an affirmative conclusion, recommendation, supported economic-change action, potential reduction, or annual impact.

### 11.6 Contextual themes and default priority

Supported contextual themes remain internal to RE for Contract v1. They do not independently enter RH or its attention list. Contextual evidence may still support a material theme only through exact-scope admission; contextual status itself creates no permission.

When no higher priority is independently established:

- a supported material theme defaults to `material_economics`;
- a supported contextual theme defaults to `context`; and
- an unresolved material theme defaults to `unresolved`.

Amount, actionability, or quantified impact alone does not promote a theme to account-survival, financial-integrity, or operational-review priority. Business type and benchmark context never participate in canonical theme priority.

Allowed example: a material supported driver is explained in `observed_cost_driver`, while an unresolved change-right for the same charge appears under `cost_control_and_merchant_action` with a document request. The two questions and permissions remain distinct.

Forbidden example: all fees with a similar label are grouped into one “pricing problem” theme and assigned a negotiation action because their total is material.

## 12. Internal RH permission effects

This section defines internal permission ceilings only. It does not authorize customer-report cutover or change existing customer routing.

- A supported material `explanation_only` theme may support internal cost-driver explanation/attention only to the existing evidence ceiling.
- A candidate-verification action may support a bounded internal question, action, and call-guidance entry; it cannot support a recommendation or dollar-impact claim.
- An approved supported action may support bounded internal action/call guidance without quantified impact.
- A separately admitted exact deterministic counterfactual may unlock statement-period `potential_reduction` only when the related action is independently supported.
- Annual-impact permission additionally requires independently proven recurrence/cadence and valid annualization.
- A verification-only amount remains `amount_under_review`; it is not `potential_reduction`.
- An unresolved material theme may support an explicit question and independently eligible limited verification/document action, but no affirmative conclusion, supported economic-change action, recommendation, potential reduction, or annual impact.
- A supported contextual theme produces no independent RH entry or attention item in Contract v1.

This contract grants no benchmark, qualified-comparison, broader savings, external-link, public-report, or customer-report authority.

## 13. Allowed and forbidden conclusions

### Allowed when all exact prerequisites are admitted

- “This program meaning explains part of the observed cost for the statement period.”
- “The account documentation establishes a right to request review of this exact pricing term.”
- “Official documentation plus account evidence shows this configuration can be changed; review the supported configuration path.”
- “The exact action is unavailable in this scope because an authoritative condition is proven unsatisfied.”
- “Additional compatible statements are needed; establish a monitoring baseline.”
- “The exact supported action has an exact deterministic statement-period potential reduction,” only when actionability and the counterfactual are separately proven.

### Forbidden

- “The charge is processor-controlled” because the processor collected or billed it.
- “The fee is non-negotiable” because a network or statutory rule exists.
- “The merchant can change this” because a feature exists in generic documentation.
- “The action is unavailable” because search found nothing or one statement omitted it.
- “This should recur annually” because it appeared once.
- “This charge amount is the available savings.”
- “Switch, cancel, or renegotiate” without an approved action identity and all exact prerequisites.
- any guaranteed result, legal advice, benchmark conclusion, or customer-facing recommendation created by this contract.

## 14. Frozen baseline versus Contract-v1 definitions

| Rule family | Status before this contract | Contract-v1 disposition |
|---|---|---|
| Exact-facet independence; positive identification; evidence-specific derivability; RF specificity/conflict; current-run verified evidence boundary | Already settled | Preserved without expansion. |
| Financial-truth non-mutation and partial truthful unresolved output | Already settled | Preserved without expansion. |
| Driver is not opportunity; recurrence before annualization; counterfactual and impact gates; actionability and impact independence | Already settled in principle | Narrow activation and exact v1 ceilings recorded. |
| One economic question per theme; split on materially different action; no filler themes; priority axes remain separate | Already settled | Deterministic narrow-v1 mapping recorded. |
| Constraint identity/effect separation | Already selected in approved decision history | Frozen with the three effect states and exact aggregation behavior in Sections 5–7. |
| Positive unsatisfied condition behavior | New Contract-v1 product definition | Frozen as exact-action `not_available`; absence/unresolved remains non-negative. |
| Stable safe-action identities and prerequisites | New Contract-v1 product definitions | Frozen as the six-entry catalog in Section 10. |
| Monitoring without change-right/control | New Contract-v1 product definition | Frozen because monitoring changes evidence collection, not economics. |
| Pricing-review authority prerequisite | New Contract-v1 product definition | Exact change-right is sufficient when it already proves the relevant authority relationship. |
| Economic-question and action-boundary identities | New Contract-v1 product definitions | Frozen as two questions and five ordered boundaries in Section 11. |
| Contextual-theme RH visibility; unresolved question plus limited verification action; no new pricing theme | New Contract-v1 product definitions | Frozen in Sections 11–12. |

No Contract-v1 product choice remains open. Any broader action, question, constraint effect, counterfactual form, specialized RE family, RH permission, benchmark/savings authority, or customer exposure requires a new versioned product decision.

## 15. Non-drift requirements for implementation

A future Contract-v1 implementation must fail closed if it:

1. lets an upstream fact imply an adjacent synthesis facet or downstream permission;
2. treats constraint identity as an action effect;
3. uses a constraint to imply unavoidable economics, non-negotiability, control, change-right, or impact;
4. treats missing evidence as a negative state;
5. creates a free-form/model-generated action or broadens a cataloged action;
6. creates an action without every exact prerequisite and applicable constraint condition;
7. requires quantified impact for a supported non-dollar action or treats actionability as impact proof;
8. expresses impact without an admitted counterfactual, calculation, period, dependencies, and required recurrence/cadence;
9. annualizes one observed occurrence;
10. groups fee rows instead of one exact economic question;
11. lets materiality create actionability or priority, or lets actionability/impact create materiality;
12. projects contextual themes into RH under Contract v1;
13. turns an unresolved theme into an affirmative conclusion or supported economic-change action;
14. adds a `pricing_structure` theme or activates a specialized RE family under this contract;
15. changes RF governance, evidence authority, financial truth, provider behavior, business-type/benchmark semantics, savings authority, or customer-report routing; or
16. uses Gold, fixtures, observation registries, fee-label registries, or legacy report logic as production synthesis policy.

Any supersession or expansion requires a separate versioned contract/amendment, an explicit product-owner decision, an integrity identity, and a traceability update. This Contract v1 artifact must not be edited in place after acceptance.
