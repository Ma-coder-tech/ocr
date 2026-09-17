# Governed Knowledge Batch 3 — Dated Network Fee Evidence v1

Status: implemented for internal analyst use; awaiting Product review

Review date: 2026-09-07

Supported statement family: Fiserv U.S. Gold corpus

Customer-facing authority: none

## Baseline and admission evidence

- Baseline branch: `codex/governed-knowledge-batch2-authorization-per-item-v1`
- Baseline commit: `bc0e8f1486987af0ff5a66c59b862e6a0de03261`
- Controlling Product adjudication: `RateReveal_Product_Batch3_Dated_Network_Authorization_Access_Exception_Integrity_Evidence_Adjudication_2026_09_07`
  - SHA-256: `6c984034cf405c23e757bf1499cf0afd0283a54b5c7e4c9828b441336cd642fc`
- Supporting independent review: `CLAUDE_RateReveal_Batch3_Dated_Network_Fee_Evidence.md`
  - SHA-256: `3269be0ea4594bd7644ab12c56666ebdc96dfa48735b1ddc5c8fdab05d8131ec`

The Product adjudication controls where the two sources differ. In particular, a processor notice proves an announcement, presentation change, or postponement—not implementation; cross-merchant observations are not a merchant's own history; and network identity does not make the merchant-facing billed amount automatically non-negotiable or proven at par.

## Executable rules and evidence state

The single governed payment-knowledge authority now includes catalog `governed_dated_network_fee_evidence_batch3_2026_09_07_v1`.

| Rule | Admitted rule | Evidence state |
|---|---|---|
| `RR-B3-01` | Historical evidence follows a period-correct hierarchy. | Product-adjudicated governance; no E3 rate admitted. |
| `RR-B3-02` | Merchant statements never define official network par. | Product-adjudicated governance; E1 is observation only. |
| `RR-B3-03` | Rate/mechanic entries require temporal scope, source version/date, and review status. | Product-adjudicated governance. |
| `RR-B3-04` | Mechanic and rate version independently; similar labels do not prove continuity. | Product-adjudicated governance. |
| `RR-B3-05` | Announced, implemented, postponed, withdrawn, presentation-only, rate-change, and mechanic-change states remain distinct. | Product-adjudicated governance plus E4 notice records. |
| `RR-B3-06` | Cross-corpus observations are not merchant history without verified account continuity. | Product-adjudicated governance. |
| `RR-B3-07` | Absence on an unrelated statement proves neither nonimplementation nor nonapplicability. | Product-adjudicated governance. |
| `RR-B3-08` | Rule setter, underlying price, billed amount, collector, beneficiary, and merchant-facing controller remain separate. | Product-adjudicated governance; par comparison blocked. |
| `RR-B3-09` | A conclusion inherits the weakest evidence layer it needs. | Product-adjudicated governance. |
| `RR-B3-10` | Authorization/access families remain network-, geography-, and product-scoped. | Product-adjudicated semantics; exact rates unresolved. |
| `RR-B3-11` | Visa Transaction Integrity is an integrity/exception family; exact triggers remain bounded. | Product-adjudicated semantics; E1 billed evidence where present. |
| `RR-B3-12` | Visa Misuse and Zero Floor are distinct directional exception families. | Product-adjudicated semantics; exact historic rate/window unresolved. |
| `RR-B3-13` | Visa IAF/ISA, Mastercard Global Acquirer/cross-border, non-U.S. access, and risk supplements remain separate. | Product-adjudicated semantics; E4 presentation evidence where present. |
| `RR-B3-14` | Statement-embedded processor/account notices are dated E4 announcement evidence. | Product-adjudicated governance plus 12 admitted E4 records. |
| `RR-B3-15` | Discover Program Integrity retains separated dated points and explicit gaps. | Product-adjudicated semantics; no interpolation or merchant history. |
| `RR-B3-16` | Clearing/data-record population and economics remain separate. | Product-adjudicated semantics; generic Data Usage economics unresolved. |
| `RR-B3-17` | Category, exact trigger/window, and transaction causation require progressively stronger evidence. | Product-adjudicated governance. |
| `RR-B3-18` | Network price and incidence actionability remain separate. | Product-adjudicated governance. |

The executable rules explicitly prohibit current-rate backdating, statement-derived par, announcement-as-implementation, presentation-change-as-cost-increase, cross-merchant “your history,” absence-based applicability, identity-derived pass-through-at-par, unsupported above-par claims, fault language, and “network fee means not actionable.”

## Admitted dated notice records

Twelve statement-embedded E4 records were mined and fingerprinted. Each record retains source document, statement period, evidence locator, normalized excerpt fingerprint, announced effective date and its precision, geography/product/merchant scope, mechanic, event type, announced value variants, and later-confirmation state.

| Source statement | Notice record | Lifecycle | Announced scope/value | Implementation state |
|---|---|---|---|---|
| BASYS March 2020 | Visa IAF, non-high-risk | Presentation-only | 0.45%; separate display from interchange; expressly no overall-expense change | Unconfirmed; presentation evidence only |
| BASYS March 2020 | Mastercard Global Acquirer, non-high-risk | Presentation-only | 0.85%; separate display from interchange; expressly no overall-expense change | Unconfirmed; presentation evidence only |
| BASYS March 2020 | Visa IAF, high-risk | Presentation-only | 0.45% base plus stated additional 0.45% high-risk supplement; no overall-expense change | Unconfirmed; presentation evidence only |
| BASYS March 2020 | American Express General Assessment | Announced rate change | 0.15% to 0.16%, announced effective 2020-04-18 | Unconfirmed |
| BASYS March 2020 | Discover Acquirer Assessment | Announced rate change | 0.13% to 0.14%, announced effective 2020-04-18 | Unconfirmed |
| BASYS March 2020 | Discover Program Integrity | Announced new fee | $0.05 per qualifying U.S. Mid/Base Submission transaction, announced effective 2020-04-18 | Unconfirmed |
| BASYS March 2020 | Visa Data Consistency | Announced new fee | $0.10 domestic / $0.15 international for the stated changed-data declined-resubmission conditions, announced effective 2020-05-01 | Unconfirmed |
| BASYS March 2020 | Visa declined-transaction resubmission | Announced new fee | $0.10 domestic / $0.15 international after the stated fifteenth re-attempt in 30 days, announced effective 2020-05-01 | Unconfirmed |
| NXGEN September 2022 | STAR annual network fee | Announced mechanic/value change | $16 per stated participating location or website; effective month November 2022 | Unconfirmed |
| NXGEN September 2022 | ACCEL annual network fee | Announced mechanic/value change | $16 per stated participating location or website; effective month December 2022 | Unconfirmed |
| NXGEN September 2022 | Interlink System Integrity | Postponed | October 2022 release postponed to an unspecified future release | Unconfirmed; no effective date |
| NXGEN September 2022 | EMV Fallback | Postponed | October 2022 release postponed to an unspecified future release | Unconfirmed; no effective date |

None of these E4 records populates the independent official-network-rate lane. Even the notices using network-attributed language remain contemporaneous processor/acquirer evidence below a period-matched primary network publication.

## Three independently governed row layers

For each applicable fee row, the Internal Analyst Finding now carries a `datedNetworkEvidence` block with:

1. semantic family, network, confidence, and evidence references;
2. mechanic/population, separate confidence, independent-versioning flag, and no continuity claim;
3. E1 billed amount/rate observation, dated to the statement and explicitly prohibited from defining network par;
4. bounded trigger state with no exact threshold/window or causation unless the required evidence exists;
5. separate underlying network price setter/reference, merchant-billed value, collector, beneficiary, merchant-facing controller, at-par state, and above-par state;
6. historical-comparison gates for announcement, current documents, cross-merchant history, unrelated absence, and interpolation;
7. separate underlying-price negotiability, merchant-billed-price review, and incidence influence;
8. rendering permissions that prohibit par, above-par, implementation, merchant-history, and fault language.

An exact fee-family resolution does not increase mechanic confidence and neither can increase historical-rate confidence.

## Full Gold-corpus calibration

The evaluation covers all 11 supported Fiserv Gold statements and all 483 material fee findings.

| Measure | Batch 2 baseline | After Batch 3 |
|---|---:|---:|
| Material fee findings | 483 | 483 |
| Exact identities | 76 | 76 |
| Category-only findings | 96 | 96 |
| Fully unresolved findings | 311 | 311 |
| Ambiguous/competing findings | 90 | 90 |
| Material findings receiving dated-network analysis | 0 | 60 |
| Supported specific network fee families within that scope | 0 | 58 |
| Category-only network families within that scope | 0 | 2 |
| Supported mechanics within that scope | 0 | 24 |
| E1 billed observations retained | 0 | 60 |
| Statement-embedded E4 lifecycle records | 0 | 12 |
| Admitted official network par values | 0 | 0 |
| Official-par/above-par comparisons | 0 | 0 |

The unchanged identity/category totals are intentional. Batch 3 adds an independent temporal and price-evidence layer; it does not inflate semantic confidence merely to improve coverage.

Every source document's canonical financial fingerprint is identical before and after the governed analyst resolution. Batch 1 pricing-layer metrics and all Batch 2 population/economic-layer metrics remain unchanged.

## Historical observations and explicit gaps

- Every billed row is an E1 account-and-period observation with `establishesOfficialNetworkPar: false`.
- Corpus history is labeled `cross_merchant_observation_series` unless a verified merchant/account continuity key is provided; none is available in canonical v1.
- Discover Program Integrity retains the March 2020 E4 $0.05 announcement and a 2025 E1 billed observation as separated points. Exact fee continuity, implementation timing, values between points, a single rate change, network par, and merchant-specific history all remain unresolved.
- Similar Digital Enablement, Data Usage, cross-border, and other family labels with different mechanics are not represented as proof that one continuous fee changed mechanic.
- Absence from other merchants' statements is ignored as applicability or implementation evidence.

## Merchant-facing analyst posture

- A supported network-defined fee can identify the underlying network as rule/price setter while the processor/acquirer remains the statement collector.
- Merchant-facing billed amount control remains unresolved until evidence establishes at-par pass-through or an acquiring-side pricing layer.
- Without dated independent par, commercial reasonableness, pass-through-at-par, above-par spread, and a combined “negotiability” answer remain non-assessable.
- The merchant may still ask for the applicable independent schedule, an at-par demonstration, and an explanation of spread or bundling without producing the merchant agreement.
- Exception/integrity incidence may be behaviorally influenceable where a verified trigger applies; authorization/access population may warrant configuration review; international-fee incidence may reflect business/card mix. None of these statements establishes fault or universal avoidability.
- An exact contractual-rate, breach, right, entitlement, or remedy conclusion remains merchant-document dependent.

## Validation and regressions

The Batch 3 corpus test proves:

- out-of-period or current rates never become historical authority;
- all 60 billed observations remain non-par E1 evidence;
- all 12 notices remain implementation-unconfirmed;
- presentation-only notices cannot become cost increases;
- postponed notices have no invented effective date;
- cross-merchant series cannot render as merchant history;
- unrelated absence cannot prove applicability;
- underlying network price and merchant-billed amount remain separate;
- Discover Program Integrity keeps an explicit historical gap with no interpolation;
- Visa Transaction Integrity, Misuse, and Zero Floor triggers remain bounded and fault-free;
- generic Data Usage can retain clearing/data-record population support while economic ownership remains unresolved;
- network-related findings retain a practical verification/commercial action without claiming that the underlying price is negotiable;
- canonical fingerprints remain unchanged;
- Batch 1 and Batch 2 regression suites remain intact.

## Remaining limitations and architecture conflicts

- No period-matched primary network publication is admitted in Batch 3. Historical par, at-par pass-through, and processor/acquirer spread remain blocked for every row.
- Only 24 of 60 material dated-network findings have a supported mechanic from current canonical statement operands/population evidence; the other 36 retain a separate unresolved mechanic layer.
- Canonical v1 has no verified merchant/account continuity identifier. Cross-document history must therefore remain cross-merchant observation only.
- The two notice-bearing Gold statements are admitted through immutable source-document references and fingerprinted excerpts. A future generalized notice-admission pipeline should produce equivalent neutral inputs; it must not silently admit arbitrary parsed notice text.
- The legacy `RepricingEvent` model does not fully distinguish announced, implemented, presentation-only, postponed, withdrawn, rate-change, and mechanic-change states. Internal Analyst Finding v1 does not consume it as Batch 3 authority.
- Legacy `referenceRateCatalog` values and older `fiservFeeAnalysis` rate assumptions are not consulted by the governed Batch 3. They remain unsafe as historical-par authority until individually sourced, dated, scoped, reviewed, and admitted.
- Static label matching remains Fiserv-scoped. The rule, evidence, lifecycle, participant, temporal, and rendering models are processor-independent; another processor requires its own reviewed alias/evidence adapter rather than copied Fiserv labels.
- No customer wording, report cutover, frontend, OCR, multi-statement customer analysis, second processor, deployment, or production behavior is included.

## Recommended next domain-review/admission batch

Acquire and adjudicate period-matched primary network publications for the highest-value observed families before adding more semantic breadth. The first source batch should prioritize:

1. 2024–2025 Mastercard network access/NABU and Visa APF/access values by U.S. product and geography;
2. 2024–2025 Visa Transaction Integrity, Misuse, and Zero Floor trigger/rate versions;
3. 2020 primary or later implementation-confirming evidence for the American Express/Discover assessment changes, Discover Program Integrity, and Visa Authorization Consistency announcements;
4. Mastercard merchant-location and Discover Program Integrity histories where the corpus shows materially different billed observations;
5. Data Usage/Base II and Digital Enablement source records sufficient to decide exact fee continuity and mechanics before any rate comparison.

Each admitted value must carry effective-from/effective-through scope, source date/version, geography/product constraints, review status, and a direct source fingerprint. Until then, the current fail-closed result is the intended analyst answer.
