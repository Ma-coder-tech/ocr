# F4 shadow semantic migration (v1)

## Standing and inputs

`evaluateF4Shadow` is a pure, opt-in sidecar. No runtime route, report projection, parser, canonical builder, permission resolver, or customer-facing producer calls it. The caller supplies one existing `CanonicalStatementAnalysis` and may supply one explicitly pinned F3 public snapshot query for a fee row. The method never reads a live source, admits facts, writes data, or changes the supplied analysis. `tryEvaluateF4Shadow` yields a coded unavailable result for invalid canonical or shadow input.

F4 builds the frozen F1 canonical observation graph, then a second F1 graph of **semantic candidates**, one per dimension and fee row. `buildF4DecisionGraph` exposes the latter for inspection and replay. Those F1 candidates do not grant authority. Each F4 decision has its own F1 claim ID, and the F4 report pins both graph IDs, the frozen F2 rule version, and the canonical input digest. The report has a deterministic content hash and frozen output.

## Shadowed slice

| Decision | Current comparison input | F4 treatment |
| --- | --- | --- |
| Merchant-facing fee component | Included fee-ledger row (proxy) | Requires a positive individual charge, selected amount, source occurrence and page evidence, and a canonical contribution decision. This supports only a broad fee component. |
| Processor markup | Selected Package D category (exact semantic comparison) | Applies the frozen F2 special markup rule. The observed component alone lacks a compatible underlying-cost or merchant-private processor-control facet and comparison gate, so markup is refused. |
| Collector, economic beneficiary, contractual controller | Package D selected parties (exact semantic comparison) | Each dimension has its own F1 claim and F2 rule. A label or Package D selection supplies no explicit party facet or private contract. |
| Merchant-facing price controller, retained margin recipient | No corresponding Package D selection | Independent claims remain unknown without their private evidence. |
| Actionability | Package D actionability ceiling (proxy) | Refused without merchant-private control, applicability, and the F2 actionability gate. |
| Savings | Package E row-linked opportunity eligibility (proxy) | Refused without the full F2 authority, gates, and facets. Statement-total and fee-composition gates are independently observed, and neither supplies target, recurrence, merchant applicability, or no-overlap proof. |
| Customer ownership/actionability claim readiness | Customer permission (proxy) | A separate Product-policy claim remains refused pending a reviewed F4 claim-readiness rule and dimension-specific support. This does not change the existing permission. |

The comparison records the current path and value, F4 result, reason codes, and whether the comparison is exact or proxy. Relations are `agreement`, `disagreement` for two incompatible positive values, `stronger_refusal`, `stronger_support`, or `unresolved_unknown`. Proxy comparisons are triage signals and must not be read as Product findings of a legacy overclaim. No relation changes the current selected value.

## F3 public knowledge

An optional benchmark probe creates a distinct F1 benchmark claim for one fee row and calls `tryResolveAdmittedPublicClaims` with the caller's exact snapshot ID and F3 scope. It uses F3's exact dimension, geography, population, basis, unit, publication gate, and period rules. The scope supplied to a probe is a **hypothesis**; F4 has no evidence that the merchant's transaction population matches it. Therefore even a matched bounded public assertion leaves merchant applicability unknown. The real U.S. Visa pilot remains pinned with unresolved effective ends; its bounded monthly period is unavailable unless independent later authority establishes an end. The Visa server `Last-Modified` date remains a conservative captured-version gate, not a claimed Visa publication date.

F4 never routes public authority to the private F3 port, processor markup, merchant contract, pass-through, retained profit, actionability, or savings. It has no private evidence admission workflow. Synthetic bounded and conflicting snapshots exist only inside tests; they do not add to the governed corpus.

## Current assessment and cutover limits

The synthetic `QUAL DISC` statement exercises an existing Package D category selection of `processor_markup`. Its eight current-to-shadow comparisons yield three agreements, two stronger refusals, and three unresolved unknowns. F4 supports only the source-backed broad fee component and refuses markup. The markup result is an exact semantic divergence and a concrete label-based legacy overclaim candidate for Product review, not a production correction. The other stronger refusal compares legacy `potentially_actionable` with F4 actionability and is proxy-only. Legacy selected collector/beneficiary/controller values also exceed the current F4 evidence for those dimensions; F4 leaves them unknown. Package E's verification-only or excluded opportunity treatment agrees with F4's savings refusal in this test. The customer permission comparison is a proxy because permission to display qualified information is not equivalent to proving a strong semantic claim.

F4 is deliberately conservative. It will yield unknowns where a source explicitly identifies a collector or beneficiary, or where reviewed merchant-private evidence exists outside this package, because neither a scoped party-evidence admission port nor a private workflow is in F4. Product should review those excessive-unknown cases and define exact authority bindings, comparison tolerances, customer readiness policy, and migration thresholds before any cutover. F0–F3 rules and the current customer/production paths remain in force.
