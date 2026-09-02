# RateReveal Product Model Freeze Review v0.1

**Review target:** Economics Schema v0.7 + Decision Procedures v0.2 + Gold Answer Tables v0.3 + Payments Knowledge Library Spec v0.2 + Runtime Intelligence Policy v0.1.  
**Review mode:** Product red-team / consistency review only. No repository implementation was reviewed or authorized.  
**Disposition:** **PASS for read-only repository gap audit. NOT an implementation authorization.**

---

# 1. Executive review

The v0.7 package closes the five blockers identified in the prior final red-team and incorporates the high-value hardening items that could otherwise produce subtle but economically wrong implementations.

The package now has a clean ownership hierarchy:

- Schema owns stable objects/invariants.
- Decision Procedures own ordered reasoning and math.
- Gold owns expected/forbidden answers.
- Knowledge Library owns effective-dated mappings/rules/admission.
- Runtime Policy owns AI/research eligibility, budgets, stop/degradation, and candidate behavior.

I did not find a remaining reason to redesign the core merchant-processing economics model before a **read-only repository gap audit**.

---

# 2. Review against the five prior blockers

## 2.1 Pricing architecture independent axes — PASS

v0.7 no longer treats `interchange_plus`, `tiered`, `flat_rate`, `subscription`, and `hybrid` as one mutually exclusive canonical enum.

Canonical pricing now separates:

- underlying-cost billing mode;
- merchant price schedule shape;
- scope uniformity;
- extensible source-supported pricing populations.

Human labels are derived summaries only.

Synthetic gold cases explicitly test:

- bundled scope-specific flat rates without tiering;
- mixed pass-through/bundled hybrid;
- subscription plus pass-through.

## 2.2 One headline effective-rate basis — PASS

Canonical RateReveal metric is now:

```text
headline_effective_rate = total_statement_processing_fees /
                          canonical_net_submitted_card_volume
```

Gross-sales cost rate is secondary, never silently substituted. Zero volume produces undefined. Benchmark use requires denominator compatibility.

## 2.3 Cost-stack adjustment ambiguity — PASS

Generic `taxes_adjustments_other` is removed.

Cost stack now permits only source-grounded processing-cost categories, including `taxes_on_processing_fees` and `other_statement_fee_cost`. Settlement/funding adjustments remain outside the fee stack unless explicitly included in authoritative fees.

## 2.4 Knowledge anti-poisoning/globalization boundary — PASS

Knowledge v0.2 adds:

- knowledge scope;
- tenant scope;
- promotion history;
- account-only default for merchant observations;
- no one-statement globalization;
- no AI self-promotion;
- untrusted-document-content rule;
- claim-specific evidence matrix;
- deterministic specificity precedence;
- fail-closed equal-specificity conflict handling.

## 2.5 Operational bounded-research policy — PASS

Runtime Intelligence Policy v0.1 now defines:

- materiality eligibility;
- no-research cases;
- selected-question ceiling;
- search/candidate/refinement ceilings;
- explicit budget object;
- diminishing-return stop;
- mandatory stop conditions;
- deterministic locator-first retrieval analysis;
- safe unresolved completion;
- research independence from financial report availability.

The policy makes the research ceiling a maximum, not a target.

---

# 3. Review of high-priority hardening items

## 3.1 Extensible pricing scope — PASS

`PricingPopulation` uses source-supported dimension/value pairs and supports future dimensions without schema migration.

## 3.2 Claim-specific evidence admission — PASS

Knowledge v0.2 replaces a generic evidence hierarchy with claim-type-specific admissibility and conflict precedence.

## 3.3 Deterministic knowledge specificity — PASS

Exact template/version/period/section mappings outrank broader mappings. Equal-specificity conflicts return `unresolved_conflict`.

## 3.4 Savings/impact provenance — PASS

MerchantLever now requires counterfactual, calculation ref, period, recurrence, implementation dependency, gross/net definition, derivability, and permission before dollar impact may be expressed.

## 3.5 Surcharge/dual-pricing economics — PASS as conceptual support; REAL-CORPUS SUPPORT NOT YET CLAIMED

Schema represents consumer-facing revenue, processor/third-party retention, merchant retention, and net merchant-borne cost. Synthetic gold covers the logic. Real Fiserv support remains detect-and-decline/unresolved until an admitted source enters the corpus.

## 3.6 Machine-verifiable gold conversion — PASS WITH PLANNED WORK

Gold v0.3 defines `GoldAssertion` and conversion priority. The full corpus is not yet machine-converted. This is acceptable for a read-only repository gap audit; machine conversion is required before implementation acceptance.

## 3.7 Unfalsified concepts — PASS WITH EXPLICIT BOUNDARY

Genuine hybrid, subscription, dual pricing, direct Amex, reserves, multi-location, and multi-currency are not falsely claimed as proven universal. Synthetic cases or detect-and-decline behavior are explicit.

## 3.8 Normative-document duplication — PASS

Normative hierarchy is explicit. Schema v0.7 no longer claims the embedded historical falsification material is authoritative over separate procedure/gold/knowledge/runtime artifacts.

## 3.9 Headline transaction population — PASS

Average ticket and cost-per-sale-transaction use canonical gross sale transaction population; refunds remain separate.

## 3.10 Source authenticity wording — PASS

`source_confirmed` is explicitly bounded to what the uploaded document says; it is not independent processor authentication.

## 3.11 Multi-location / multi-currency — PASS AS EXPLICIT FUTURE EXTENSION

Not claimed as fully supported for Fiserv V1.

## 3.12 Theme deduplication — PASS

One primary theme per economic question unless merchant action materially differs; no filler theme-count target.

---

# 4. Adversarial scenario review

| Scenario | Expected result | Package status |
|---|---|---|
| bundled 2.90/2.50/3.50 by scope, no tiers | bundled + scope-specific flat, not tiered | PASS in Gold v0.3 |
| Visa/MC pass-through, Amex bundled | mixed-by-scope / hybrid summary | PASS |
| subscription + separately billed interchange | pass-through axis + subscription/fixed schedule | PASS |
| refund priced on gross sales | net headline rate + gross pricing base preserved | PASS |
| settlement adjustment outside fee total | funding only; never cost stack | PASS |
| statement/web prompt injection | untrusted data; zero instruction effect | PASS |
| unknown fee repeats across merchants | corpus candidate only | PASS |
| equal-specificity knowledge conflict | unresolved conflict | PASS |
| dual pricing with consumer revenue | gross fees vs net merchant-borne cost separated | PASS conceptually |
| low-volume scenario calculation | explicit scenario assumptions, not forecast fact | PASS |
| high dispute + high markup | risk context; fairness unresolved | PASS |
| direct/ESA Amex | no OptBlue assumption | PASS conceptually |
| multi-location network fee | source population preserved; no transaction-count confusion | PASS conceptually |
| future rule notice | candidate until applicable/verified | PASS |
| benchmark denominator mismatch | benchmark blocked | PASS |

---

# 5. Self-review: remaining non-blocking risks

## 5.1 Merchant price schedule shape is intentionally lossy at statement summary level

Real accounts can have percentage + per-item + fixed + minimum simultaneously. v0.7 preserves detailed `PricingComponent`s and allows `composite_multi_component`; therefore the summary enum is not relied upon for authoritative math. This is acceptable.

## 5.2 Claim-specific evidence matrix will need extension

The v0.2 matrix covers the current important claim types. New legal/network/product claims may require additional rows. The extension belongs in the Knowledge Library, not schema.

## 5.3 Research numerical budgets are deployment policy

Runtime v0.1 defines semantic ceilings and initial count caps but intentionally does not freeze exact wall-time milliseconds. The deployment must define and test those values. This is acceptable for repository gap audit.

## 5.4 Gold corpus still has bounded/provisional sources

Vortax is bounded-source gold; M P Painting and some other corpus artifacts remain provisional/quality-limited. This is explicitly encoded rather than hidden.

## 5.5 Knowledge library content is still largely unpopulated

The specification is complete enough to audit the repository, but many actual effective-dated mappings/rules still need to be sourced/admitted later. This is expected and should appear as implementation scope, not schema failure.

## 5.6 Current report design is not yet reconciled to the new economics model

Report V2 was designed before this product reset. It should not be treated as the target information architecture until the repository gap audit and subsequent product report redesign.

---

# 6. Freeze criteria from prior red-team

| Criterion | Status |
|---|---|
| pricing architecture has non-overlapping canonical axes | PASS |
| one headline effective-rate denominator approved | PASS |
| fee cost stack cannot ingest non-fee adjustments | PASS |
| knowledge promotion/globalization tenant-safe | PASS |
| research eligibility/stop/degradation explicit | PASS |
| adversarial economic shapes representable | PASS |
| Gold has provenance/derivability or conversion plan | PASS — conversion plan defined |
| unsupported templates/concepts limited or decline | PASS |
| savings/impact requires counterfactual provenance | PASS |
| normative hierarchy explicit | PASS |

---

# 7. Final disposition

**Product-model freeze status:** **FROZEN FOR READ-ONLY REPOSITORY GAP AUDIT.**

This means:

- do not keep revising the economics schema in response to every implementation inconvenience;
- repository code should be evaluated against this package rather than the package being bent to current code;
- new real statement evidence may reopen the product model only if it exposes a genuinely missing economic concept or falsifies a decision procedure;
- no implementation should begin merely because this review passed; first obtain and review the repository gap audit.

**Next authorized product step:** send the frozen package to Codex for a **read-only repository gap audit** that reports what exists, what conflicts, what is missing, and a recommended implementation sequence. No code changes in that audit.

