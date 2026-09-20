# RateReveal Gold Authority & Derivability Conflict Report v1

Status: Frozen companion report  
Contract: `ratereveal_gold_authority_derivability_contract_v1`  
Freeze date: 2026-09-19

This report records conflicts and gaps; it does not change production behavior.

## 1. Reviewed current-output conflicts

| Gold assertion | Issue | Current conflict | Deferred package |
|---|---|---|---|
| `G3-RATE-STATE` | `RA-CONFLICT-ZERO-VOLUME-RATE` | The current selected-financial output reports numeric zero while Frozen Gold requires an undefined effective-rate state. | later authorized headline-financial semantics package |
| `G4-NO-EXACT-OWNER` | `RA-CONFLICT-OVERCONFIDENT-OWNERSHIP-G4` | Current legacy analysis emits an exact processor-controlled total without the frozen positive-mapping standard. | later authorized ownership semantics package |
| `G7-NO-EXACT-OWNER` | `RA-CONFLICT-OVERCONFIDENT-OWNERSHIP-G7` | Current legacy analysis emits exact processor ownership and junk-fee totals that Frozen Gold keeps evidence-bound. | later authorized ownership semantics package |
| `G8-NO-BUNDLED-BENCHMARK` | `RA-CONFLICT-UNSUPPORTED-BENCHMARK-G8` | Current legacy analysis emits a ready bundled benchmark not authorized by the frozen evidence boundary. | later authorized benchmark package |
| `G8-NO-SAVINGS` | `RA-CONFLICT-UNSUPPORTED-SAVINGS-G8` | Current legacy analysis emits exact annual savings without a valid admitted counterfactual. | later authorized counterfactual and savings package |
| `G1-NO-EXACT-OWNER` | `RA-CONFLICT-OVERCONFIDENT-OWNERSHIP-G1` | Current legacy analysis emits an exact processor-controlled total without the frozen positive-mapping standard. | later authorized ownership semantics package |
| `G3-NO-NUMERIC-RATE` | `RA-CONFLICT-ZERO-VOLUME-NUMERIC-CONCLUSION` | Current output emits a numeric effective rate for a zero-volume period where Gold prohibits that semantic conclusion. | later authorized headline-financial semantics package |
| `G4-NO-RATE-VERDICT` | `RA-CONFLICT-RATE-AS-VERDICT-G4` | Current legacy analysis turns an arithmetic effective rate into a pricing verdict prohibited by Gold. | later authorized interpretation semantics package |
| `G5-RATE` | `RA-CONFLICT-RATE-PRECISION-G5` | Current summary output rounds the rate to 2.0700% while Frozen Gold preserves 2.0740% on the canonical denominator. | later authorized headline-financial semantics package |
| `G7-NO-RATE-VERDICT` | `RA-CONFLICT-RATE-AS-VERDICT-G7` | Current legacy analysis turns an arithmetic effective rate into a pricing verdict prohibited by Gold. | later authorized interpretation semantics package |

The 10 reviewed baseline conflicts comprise seven cases where current behavior is stronger than Gold permits (G1 exact owner; G4 exact owner and rate verdict; G7 exact owner and rate verdict; G8 benchmark and savings) and three numeric/precision conflicts (G3 rate state and numeric conclusion; G5 rate precision).

## 2. Additional current canonical-semantic conflicts

These are code-level conflict surfaces, not additional rewritten Gold answers:

- `src/fiservProcessorFeeClassification.ts:361-366` and `:418-423` map a reference-rate match to broad `proven_at_cost`. The frozen contract permits only a narrow admitted-reference equality claim and keeps contractual pass-through, separately billed spread, and processor retention independent.
- `src/canonical/feeOwnershipActionability.ts:331-347` deterministically assigns interchange economic beneficiary and contractual controller. Gold requires claim-specific authority and preserves ownership limits where the statement alone is insufficient.
- `src/canonical/feeOwnershipActionability.ts:389-405` and `:409-424` can assign processor ownership/control from deterministic patterns. The frozen contract requires compatible component plus underlying-cost or merchant-private authority and forbids treating markup as retained profit.
- `src/canonical/opportunityPolicy.ts:78-137` already preserves conservative cadence/annualization separation; no conflict was found in that reviewed surface.

No production file is changed by this freeze.

## 3. Gold ambiguity and Product clarification

Product clarification items: **0**. Product adjudicated the 49 mixed assertions. Twenty-one are decomposed with explicit lineage and 28 are re-annotated without changing approved semantic meaning. Source gaps are not Product semantic ambiguity and remain visible as source statuses.

Decomposed originals: `G1-INTERCHANGE-DIFFERENCE`, `G1-PRICE-SUMMARY`, `G2-PRICE-SUMMARY`, `G4-PRICE-SUMMARY`, `G4-REG-DEBIT-COST`, `G4-REG-DEBIT-COST-RATE`, `G4-REG-DEBIT-SHARE`, `G4-REG-DEBIT-VOLUME`, `G4-REWARDS-COST-SHARE`, `G4-REWARDS-VOLUME`, `G4-REWARDS-VOLUME-SHARE`, `G4-WATS`, `G5-PREMIUM-COST-SHARE`, `G5-PREMIUM-VOLUME`, `G5-PREMIUM-VOLUME-SHARE`, `G5-PRICE-SUMMARY`, `G6-PRICE-SUMMARY`, `G7-OTHER-COMPONENTS`, `G7-PRICE-SUMMARY`, `G8-PRICE-SUMMARY`, `G9-PRICE-SUMMARY`.

Re-annotated mixed originals: `G1-PRICE-SCOPE`, `G1-PRICE-SHAPE`, `G1-PRICE-UNDERLYING`, `G2-PRICE-SCOPE`, `G2-PRICE-SHAPE`, `G2-PRICE-UNDERLYING`, `G3-PRICE-SCOPE`, `G3-PRICE-SHAPE`, `G3-PRICE-UNDERLYING`, `G4-PRICE-SCOPE`, `G4-PRICE-SHAPE`, `G4-PRICE-UNDERLYING`, `G5-PRICE-SCOPE`, `G5-PRICE-SHAPE`, `G5-PRICE-UNDERLYING`, `G6-NON-AMEX-SCOPE`, `G6-PRICE-SCOPE`, `G6-PRICE-SHAPE`, `G6-PRICE-UNDERLYING`, `G6-SECURITY-PRIORITY`, `G7-PRICE-SCOPE`, `G7-PRICE-SHAPE`, `G7-PRICE-UNDERLYING`, `G8-PRICE-SCOPE`, `G8-PRICE-SHAPE`, `G8-PRICE-UNDERLYING`, `G8-PRICING-BASE`, `G9-RATE-INTERPRETATION`.

## 4. Source authority and executability gaps

| Case | Source identity | Source execution | Limitation |
|---|---|---|---|
| G1 | `pending_authoritative_mapping` | `not_source_executable` | Authoritative source mapping incomplete; repository fixtures remain provisional. |
| G2 | `pending_authoritative_mapping` | `not_source_executable` | Authoritative source mapping incomplete; repository fixtures remain provisional. |
| G3 | `pending_authoritative_mapping` | `not_source_executable` | Authoritative source mapping incomplete; repository fixtures remain provisional. |
| G4 | `pending_authoritative_mapping` | `not_source_executable` | Authoritative source mapping incomplete; repository fixtures remain provisional. |
| G5 | `pending_authoritative_mapping` | `not_source_executable` | Authoritative source mapping incomplete; repository fixtures remain provisional. |
| G6 | `unresolved_identity` | `not_source_executable` | Authoritative source mapping and exact source identity remain unresolved. |
| G7 | `pending_authoritative_mapping` | `not_source_executable` | Authoritative source mapping incomplete; repository fixtures remain provisional. |
| G8 | `pending_authoritative_mapping` | `not_source_executable` | Authoritative source mapping incomplete; repository fixtures remain provisional. |
| G9 | `source_unavailable` | `source_unavailable` | Original source unavailable; retained as historical semantic guidance only. |

The secure authoritative source manifest was not available to this offline package (`RATEREVEAL_PRIVATE_CORPUS_DIR` was not configured). No repository fixture was promoted. The normalized counts remain 287 non-source-executable assertions for G1-G8 and 26 source-unavailable normalized assertions for G9. A future independently adjudicated, source-backed partial-document case is still required before G9 behavior is fully source-executable.

## 5. Terminology for later deprecation or narrowing

| Existing term | Later action | Frozen replacement/boundary |
|---|---|---|
| `proven_at_cost` | Retire as broad truth | Narrow admitted-reference comparison plus separate pass-through, spread, and retention claims. |
| `owner` | Deprecate when unqualified | Biller/issuer, collector, economic beneficiary, contractual controller, merchant-facing price controller, retained-margin recipient. |
| `processor markup` from labels/position | Prohibit | Broad merchant pricing component unless required underlying-cost or private authority exists. |
| `processor-controlled total` | Narrow | Dimension-specific, evidence-bound control claims only. |
| `junk fee` / `avoidable fee` | Avoid as factual category | Reviewed Product policy plus authority-backed actionability. |
| `monthly` inferred from one statement | Prohibit | Explicit cadence evidence and separate annualization permission. |
| `savings` from observed cost | Prohibit | Named, authority-backed, compatible, non-overlapping counterfactual chain. |
| one `pricing model` label | Decompose | Underlying-cost mode, merchant price schedule shape, scope uniformity, and other independent axes. |

## 6. Freeze boundary

The conflicts above remain intentionally unfixed. This package does not authorize the future Claim and Authority implementation, production architecture changes, live evidence admission, private infrastructure, UI/report changes, or deployment.
