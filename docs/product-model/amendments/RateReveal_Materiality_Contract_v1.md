# RateReveal Materiality Contract v1

**Status:** Product-owner approved production semantics.

**Contract identifier:** `canonical_materiality_contract_v1`.

This contract controls claim-specific admission to production RG work planning. It does not change canonical financial truth, create evidence, authorize provider execution, or grant report permission.

## 1. Atomic basis

Materiality belongs to an exact atomic canonical claim, not to a fee row. Exact semantic grouping is permitted only when claim class/facet, opaque subject identity, scope, and statement period match. Debit and credit directions remain distinct. One canonical occurrence or subject may contribute its magnitude only once within one atomic claim.

Category, economic beneficiary, economic owner, collector, billing intermediary, rule setter, price setter, negotiator/change authority, contractual controller, constraint, recurrence, counterfactual, merchant lever, and other independent facets do not merge merely because they concern the same charge.

`A` is the observed-statement-period magnitude governed by the exact atomic claim. It is not annualized. `T` is the magnitude of valid authoritative canonical statement processing cost. `R = A / T` only when `T` is valid and nonzero. If `T` is zero or unavailable, relative significance is unavailable, not zero.

Business type and benchmark context are excluded from canonical materiality.

## 2. Economic axis

`E2 — economically material` applies when any condition is true:

1. `A ≥ $100` and `R ≥ 1%`;
2. `A ≥ $500`;
3. `R ≥ 10%` and `A ≥ $10`.

`E1 — economically contextual` applies when E2 does not and either `A ≥ $10` or `R ≥ 1%`.

`E0 — economically immaterial` applies otherwise.

When the exact claim has no monetary amount, its economic tier is unavailable and the decision axis still applies.

## 3. Decision/permission axis

- `D2 — permission-decisive`: resolving this claim is necessary for at least one presently reachable merchant-facing interpretation or permission to change, with at least two admissible answers leading to materially different outcomes.
- `D1 — interpretation-relevant`: resolving it improves economic understanding, but other independent prerequisites presently prevent that decision or permission change.
- `D0 — no reachable decision delta`: resolving it cannot presently change an allowed merchant-facing interpretation or permission.

Decision evaluation must record the exact atomic facet, presently reachable effects, independent blocking atomic facets or prerequisites, and the materially different admissible outcome classes used for D2. A D2 outcome record must identify concrete answer classes and different resulting merchant-facing states; generic positive/negative placeholders are insufficient. Resolution of one facet never implicitly resolves an adjacent facet.

## 4. Combination matrix

| Economic tier | D2 | D1 | D0 |
|---|---|---|---|
| E2 | material | material | contextual |
| E1 | material | contextual | contextual |
| E0 | material | contextual | immaterial |
| amount unavailable | material | contextual | unresolved |

The unavailable/D0 result remains unresolved rather than being guessed immaterial.

## 5. Research admission

Material claims may initiate independent work only when their exact claim type, subject, scope, period, evidence objective, source-authority requirements, and RF visibility context admit that work.

Contextual claims do not independently initiate external research by default. Evidence legitimately obtained for material work may be evaluated opportunistically for a contextual claim, but that claim must independently satisfy its evidence and admission requirements.

Immaterial claims do not initiate external research. Catalog unavailability, missing authorized knowledge mappings, and private/contract-only evidence requirements are distinct withheld states, not empty/no-match results.

The thresholds and matrix are versioned product semantics. They may not be changed as silent operational tuning.

## 6. This implementation slice

The initial production connection evaluates and persists claim admissions and planned RG work in the shared durable `AnalysisRun`. Provider calls, search, retrieval, AI, reservations, candidate creation, knowledge promotion, benchmarks, savings, and customer-report cutover remain disabled. Planned work therefore records zero operations and zero resource consumption.
