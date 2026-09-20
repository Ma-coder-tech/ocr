# F4 real Gold fixture calibration v1

## Standing

This is a **provisional repository-fixture calibration**, not authoritative Gold source execution. Product accepts this level of calibration for shadow-only F4 integration. Frozen Gold v0.3 semantics are approved, but G1–G8 still lack an authenticated source crosswalk. G6's exact source identity remains unresolved; G9's original source is unavailable. The existing repository PDFs permit local observations for G1–G5 and G7–G8 only. No fixture, statement label, parser output, or current classification is promoted to Gold authority by this pass.

`scripts/f4-gold-shadow-calibration.ts` parses those seven local PDFs, builds the existing canonical analysis, calls the F4 shadow sidecar, and emits aggregate JSON keyed only by opaque Gold case ID. It pins the frozen Gold catalog and normalized authority register by SHA-256 and verifies case-specific semantic anchors. It emits no source filenames, row IDs, labels, merchant identifiers, amounts, or customer text. G6 and G9 are explicit exclusions. No F3 probe was made: the admitted 2026 Visa credit-voucher populations and validity cannot be projected onto these 2020–2025 statements. Retrieve was not run.

## Current-to-F4 comparisons

`A` = agreement; `R` = stronger F4 refusal; `U` = unresolved/unknown. A comparison counts a fee-row dimension, not an independent Gold assertion. Exact comparisons are Package D processor-markup and selected-party dimensions. Broad component, actionability ceiling, opportunity eligibility, and customer permission are proxy comparisons.

| Case | Rows | Exact A/R/U | Proxy A/R/U | Material observation |
| --- | ---: | ---: | ---: | --- |
| G1 | 67 | 187 / 6 / 75 | 184 / 12 / 6 | Six selected markup categories refused; six source-backed, canonically included interchange-detail charges now have broad-component support only. Frozen Gold separates composite pricing from exact owner proof. |
| G2 | 50 | 141 / 5 / 54 | 127 / 16 / 8 | Five selected markup categories refused; eight zero-dollar reference rows correctly remain outside positive fee-component support. Gold refuses an exact split on opaque pricing. |
| G3 | 6 | 20 / 1 / 3 | 17 / 1 / 1 | One selected markup category refused. Five positive charges retain broad support; one zero-dollar row remains unknown. Gold withholds recurrence and a numeric effective rate in the zero-volume period. |
| G4 | 104 | 176 / 0 / 240 | 309 / 4 / 0 | All 104 charge rows retain broad support; no markup selection diverges. Gold's exact-owner and rate-verdict prohibitions remain separate from the F4 row slice. |
| G5 | 105 | 150 / 6 / 264 | 306 / 9 / 1 | Six selected markup categories refused; one signed credit is not promoted to a fee component. Gold leaves exact markup unresolved and a keyed-downgrade counterfactual conditional on a valid comparison population. |
| G7 | 51 | 147 / 0 / 57 | 147 / 6 / 1 | Six source-backed, canonically included interchange-detail charges now have broad-component support only. Gold refuses owner inference and back-projection of a future notice. |
| G8 | 14 | 29 / 6 / 21 | 31 / 6 / 6 | Six selected markup categories refused; six zero-dollar reference rows remain unknown. Gold refuses margin, unqualified benchmark, and savings conclusions. |
| **Total** | **397** | **850 / 24 / 714** | **1121 / 54 / 23** | The 12 prior proxy unknowns became agreements. No stronger support or positive-value disagreement occurred. |

The 24 exact stronger refusals are all `processor_markup`. They occur in G1, G2, G3, G5, and G8. They are **legacy overclaim candidates**, not 24 authenticated Gold violations: exact source-to-row Gold mapping remains absent. G2, G5, and G8 have especially direct frozen prohibitions against exact markup, margin, or split inference. G1 likewise forbids ownership from the `QUAL DISC` label. G3's particular fee has no direct row-level Gold markup adjudication. The 714 exact unknowns are three separate selected ownership values on 238 rows; they must not be described as 714 proven overclaims. Frozen Gold explicitly refuses unsupported exact economic-owner conclusions in G1, G2, G4, G7, and G8.

All 397 F4 actionability and savings decisions were refused. The 54 actionability stronger-refusal relations compare legacy `potentially_actionable` ceilings with a substantive F4 actionability claim, so they are **proxy-only** and do not prove 54 legacy violations. Package E's row opportunity eligibility did not yield a positive savings divergence in this slice. The seven customer-readiness decisions were refused and agreed with seven current denied permissions, also proxy-only. Existing Gold conflicts in other legacy rate-verdict, benchmark, and savings paths are outside the current F4 comparison slice and were not silently counted as resolved.

## Authority and completeness diagnosis

- **Correct unknown/refusal:** Public or statement labels cannot prove processor margin, economic beneficiary, contractual controller, merchant price control, retained profit, merchant applicability, actionability, or savings. F4 has no merchant-private authority port. The 22 zero-dollar reference rows and one signed credit correctly receive no positive merchant-facing fee-component support.
- **Resolved broad-component binding:** Twelve *included* `interchange_detail_row` charges in G1 and G7 have canonical `pass_through_fee_charge_included` contribution decisions and source evidence. Product authorized the same narrow fee-component support as included individual charges. The canonical reason-code name is not contractual pass-through proof and supplies no markup, ownership, control, actionability, or savings authority. The remaining 23 component unknowns are 22 zero-dollar reference rows and one signed credit.
- **Collector boundary:** F4 never supplies F2's `explicit_collector` facet. Product directed that collector remain unknown unless statement/source evidence explicitly supports that dimension; Package D selection, processor section, branding, or billing placement does not. Beneficiary and contractual-control unknowns remain correct without dimension-specific public or merchant-private authority.
- **Completeness:** The statement-total gate was present for every row. Fee-composition remained blocked on 377 of 397 row-level savings probes: G1, G2, G4, G5, and G7 have partial fee ledgers or printed grand controls requiring verification. G3 and G8 pass that gate. Every case still lacks the independent F2 savings gate, target, merchant applicability, recurrence, and no-overlap chain. Do not loosen the gate to match Gold's full-statement designation; reconcile the printed controls and source mapping first.
- **Product policy:** F4 customer claim readiness has no reviewed F4 policy attestation/binding even though canonical customer permission versions exist. All seven current permissions were denied, so this caused no positive-loss divergence here. It remains a cutover requirement, not permission to promote the version string into authority.

No observed positive F4 decision exceeds the frozen Gold authority ceiling within the calibrated dimensions: positive broad support is limited to 362 source-backed included individual charges and 12 source-backed included interchange-detail charges; F4 supports no markup, owner, actionability, savings, or merchant-applicable benchmark. Because source crosswalks remain unverified, this is an observational result, not a source-executed Gold pass.

## Recommendation

Product has adjudicated the 12-row binding and accepted provisional fixture calibration for this shadow-only package. The requested local validation passed, and F4 is ready for Git integration review. This does not authorize production or customer cutover. The binding does not imply contractual pass-through, processor markup, retained profit, or savings.
