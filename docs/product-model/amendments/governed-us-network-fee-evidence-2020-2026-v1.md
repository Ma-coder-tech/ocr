# Governed U.S. Network Fee Evidence 2020–2026 v1

Status: implemented for internal analyst use; no customer-facing authority.

Baseline: `codex/governed-knowledge-batch3-dated-network-fee-evidence-v1` at `d7ce7d3569762fdd2a49767c080aed7258d7396a`.

Catalog: `governed_us_network_fee_evidence_2020_2026_product_adjudicated_2026_09_07_v1`.

## Governing inputs

The Product request and the final Product-adjudicated evidence pack are retained by identity and SHA-256 so that a similarly named earlier document cannot silently replace them.

| Record | Evidence class | Date/version | Locator | Retained SHA-256 | Scope and limitation |
| --- | --- | --- | --- | --- | --- |
| `rr_product_us_network_pack_2020_2026_final` | G1 Product/domain adjudication | 2026-09-07, final | `RateReveal_US_Network_Fee_Evidence_Pack_2020-2026_FINAL_Product_Adjudicated.md` | `e9af92f905f8dc1fbe9445099fc9e92df1fd87d786787d6a61e19df6b46ee5dd` | U.S. merchant acquiring; governs admission and classification, but does not convert processor evidence into network-primary evidence. |
| `fiserv_card_brand_pass_through_guide_2023_04` | E4 processor/acquirer schedule | April 2023 (month precision) | Product pack §S-A | same retained pack | U.S./U.S. Territories subject to product scope; point-in-time Fiserv evidence, not a card-network publication. |
| `fiserv_card_brand_updates_2026_06` | E4 processor change bulletin | June 2026 (month precision) | Product pack §S-B | same retained pack | Only the listed changes; silence proves no unchanged 2026 core value, and an announcement does not prove implementation. |

The Product request fingerprint is `ad9ad7a3503a5db0db68674ef3897b0d6842bfeaef374bdd0a5cae0dea7fb7e3`.

## Admitted control rules

| Rule | Admitted control |
| --- | --- |
| `RR-USN-01` | Fiserv schedules remain processor evidence, never primary network publications. |
| `RR-USN-02` | Reference applicability is period-scoped; current or adjacent material cannot establish historical par. |
| `RR-USN-03` | Adjacent matches may say “consistent with the available dated reference,” never confirmed at par or confirmed markup. |
| `RR-USN-04` | Visa APF product/geography variants remain separate until the row supplies the applicable scope. |
| `RR-USN-05` | Visa Misuse, Zero Floor, and TIF mechanics and values are versioned to their evidence period. |
| `RR-USN-06` | FANF structure is admitted without inventing unretained tier rates. |
| `RR-USN-07` | NABU is not authorization-only and is not forced to gateway-authorization counts. |
| `RR-USN-08` | Digital Enablement is one bounded mechanic; MIN and percentage lines do not prove different mechanics. |
| `RR-USN-09` | The 2025 $3 Location Fee and 2024 0.1475% assessment are research candidates, not confirmed markup. |
| `RR-USN-10` | Conflicting Location Fee excluded-MCC lists remain explicit and unresolved. |
| `RR-USN-11` | Data Usage settlement-side population support remains separate from ownership and historical change-date claims. |
| `RR-USN-12` | Discover Program Integrity and Amex assessment histories retain unresolved intervals; no interpolation. |
| `RR-USN-13` | Similar cross-border or processing-integrity labels do not prove continuity or mechanic change. |
| `RR-USN-14` | The 2026 bulletin is change-only evidence; silence cannot supply unchanged core rates. |
| `RR-USN-15` | Identity, mechanic/population, reference value, billed value, collector, beneficiary, rule setter, and merchant-facing controller remain independent. |

## Exact reference records admitted

All April 2023 values below are strong E4 Fiserv references for April 2023 only. None is represented as primary-network evidence or silently projected to another period.

| Record | Admitted identity/mechanic/value | Population or retained gap |
| --- | --- | --- |
| `visa_assessment_debit_2023_04` | Visa debit assessment, 0.13% | Applicable Visa debit volume. |
| `visa_assessment_credit_2023_04` | Visa credit assessment, 0.14% | Applicable Visa credit volume. |
| `visa_isa_2023_04` | ISA, 1.00% base / 1.40% enhanced | Qualifying international Visa volume; variant must resolve. |
| `visa_iaf_2023_04` | IAF, 0.45% base / 0.90% specified high-risk | Qualifying non-U.S.-issued Visa volume; high-risk scope remains distinct. |
| `visa_apf_2023_04` | APF per authorization: U.S. debit/prepaid $0.0155; U.S. credit $0.0195; non-U.S. debit/prepaid $0.0355; non-U.S. credit $0.0395 | Product/geography variant must resolve. |
| `visa_misuse_2023_04` | Misuse of Authorization, $0.09/event | April 2023 scope: T&E unmatched within 20 days; other unmatched within 10 days. |
| `visa_zero_floor_2023_04` | Zero Floor Limit, $0.20/event | Qualifying settlement lacking the required authorization relationship. |
| `visa_tif_2023_04` | Transaction Integrity Fee, $0.10/event | Specified U.S.-merchant/U.S.-issued transaction scope in the retained guide. |
| `visa_base_ii_system_file_2023_04` | Base II System File Fee, $0.0018/record | Qualified system-file/data records. |
| `visa_fanf_structure_2023_04` | FANF monthly card-present/card-not-present structure | Actual tier tables are not retained; no tier value is admitted. |
| `mastercard_assessment_2023_04` | Mastercard assessment, 0.13% base plus 0.01% for transactions at or above $1,000 | High-ticket component remains separately scoped. |
| `mastercard_cross_border_2023_04` | Cross-Border, 0.60% USD settlement / 1.00% non-USD | U.S.-merchant cross-border volume; similar labels do not prove continuity. |
| `mastercard_nabu_2023_04` | NABU, $0.0195/record | Authorization records, Collection Only, and Return/Credit settled transactions in the stated U.S. scope. |
| `mastercard_global_acquirer_2023_04` | Global Acquirer Support Fee, 0.85% | Qualifying non-U.S.-issued Mastercard volume. |
| `mastercard_digital_enablement_2023_04` | One formula: 0.02%, $0.02 minimum, $0.20 maximum where applicable | Applicable card-not-present transactions. |
| `mastercard_pre_auth_integrity_2023_04` | Separate Pre-Authorization processing-integrity structure; no value admitted | Exact retained scope only; no same-family continuity inference. |
| `mastercard_undefined_auth_integrity_2023_04` | Separate Undefined Authorization structure; no value admitted | Exact retained scope only. |
| `mastercard_final_auth_integrity_2023_04` | Separate Final Authorization structure; no value admitted | Exact retained scope only. |
| `mastercard_location_2023_04` | $1.25 per qualifying location/month | At least one Mastercard transaction and at least $200 monthly gross Mastercard volume; excluded MCCs conflict (`8393, 8661` versus `8661, 8398`). |
| `mastercard_connectivity_kb_2023_04` | Connectivity Kilobyte Fee, $0.002294/KB | Documented connectivity kilobytes. |
| `discover_network_authorization_2023_04` | Network Authorization Fee, $0.019/authorization | Discover authorization records. |
| `discover_data_usage_2023_04` | Data Usage Fee, $0.0025/network card sales transaction | Settlement-side network card sales transactions; owner is not inferred from count. |
| `discover_program_integrity_2023_04` | Program Integrity, $0.10/event | Change date from the 2020 $0.05 announcement remains unresolved. |
| `amex_assessment_2023_04` | General Assessment, 0.165% | Acquired/OptBlue scope; exact date of the additional increase after the 2020 announced step to 0.16% remains unresolved. |

The following 2026 entries are E4 change records. Their lifecycle is `announced_change` and implementation state is `unconfirmed`.

| Record | Effective precision | Admitted announced change |
| --- | --- | --- |
| `visa_cnp_token_fee_2026_06` | June 2026 | Card-not-present token fee 0.015%, $0.01 minimum. |
| `visa_cp_token_fee_2026_06` | June 2026 | Card-present token fee 0.01%. |
| `visa_cross_border_cp_token_fee_2026_06` | June 2026 | Cross-border card-present token fee 0.05%. |
| `visa_foreign_cnp_digital_commerce_2026_06` | June 2026 | Foreign-card CNP digital-commerce fee 0.0075%→0.035%; minimum $0.0075→$0.01. |
| `mastercard_fallback_avoidance_2026` | Year 2026 only | Fallback Avoidance 0.10%; exact month not invented. |
| `mastercard_mchip_deployment_2026_08` | August 2026 | M/Chip Deployment Performance Program $12/terminal/recurring 30-day period. |
| `mastercard_dispute_image_2026_07` | July 2026 | Dispute Image $0.20→$0.23. |
| `mastercard_dispute_case_2026_07` | July 2026 | Dispute Case $1.35→$1.55. |

This catalog composes with, rather than duplicates, Batch 3's retained statement-notice records. In particular, `b3_notice_basys_discover_program_integrity` retains the $0.05 announcement effective 2020-04-18 and `b3_notice_basys_amex_general_assessment` retains the 0.15%→0.16% announcement effective 2020-04-18; both remain E4 and `unconfirmed`. Together with the April 2023 references and dated E1 corpus observations, the analyst preserves the approved Discover and Amex multi-point histories while keeping implementation, exact continuity, and intervening effective dates unresolved.

## Corpus calibration

The full supported Fiserv Gold corpus contains 11 statements and 483 material findings. The Batch 3 baseline and post-admission disposition are:

| Measure | Batch 3 baseline | This milestone | Delta |
| --- | ---: | ---: | ---: |
| Exact identities | 76 | 89 | +13 |
| Category-only | 96 | 92 | -4 |
| Fully unresolved | 311 | 302 | -9 |
| Ambiguous/competing interpretation | 90 | 94 | +4 |
| Research-queue questions | 407 | 402 | -5 net |

The increase in explicit ambiguity is intentional: retained conflicts and period gaps are now represented instead of being hidden by an exact identity. The research queue falls net by five because stronger semantic support removes more generic questions than the new targeted questions add.

Within the 60 material network-fee findings:

| Evidence result | Count |
| --- | ---: |
| Identity strengthened | 39 |
| Mechanic strengthened | 39 |
| Population strengthened | 39 |
| Period-matched April 2023 references | 0 |
| Adjacent-period April 2023 references | 39 |
| Identity/mechanic-only | 0 |
| No applicable admitted reference | 21 |
| Still lacking a current 2026 core value | 60 |
| Above-reference research candidates | 3 |
| Confirmed at-par conclusions | 0 |
| Confirmed markup conclusions | 0 |
| Material NABU rows corrected | 2 |
| Material Digital Enablement rows corrected | 2 |
| Material Data Usage rows strengthened | 1 |
| Rows carrying the Location Fee MCC-source conflict | 7 |

The three above-reference candidates are two 2025 Mastercard Location Fee observations billed at $3.00 against the closest April 2023 Fiserv reference of $1.25, and one September 2024 Mastercard Assessment observation billed at 0.1475% against the April 2023 0.13% base reference. Each remains non-confirmed because period and/or population evidence is missing.

## Corrections and invariants

- NABU no longer uses the older authorization-only simplification and is never forced to equal gateway authorization counts.
- Digital Enablement percentage and MIN presentations resolve to the same bounded formula; no mechanic change is inferred.
- Discover Data Usage gains settlement-side population and exact mechanic support without using count matching to infer its owner.
- Mastercard processing-integrity identities require the corresponding explicit processing-integrity wording; generic `MIN` rows do not inherit those identities.
- April 2023 Fiserv values remain E4 processor references. No statement observation, adjacent match, or Fiserv schedule becomes official network par.
- The 2026 change bulletin supplies only the listed changes. It supplies no unlisted core 2026 rate and no announcement is automatically treated as implemented.
- Canonical financial fingerprints were identical before and after analyst generation for all 11 statements. The evidence layer has `canonicalMutationAllowed: false`.
- Merchant agreement review remains separate from the evidence comparison and is not required to request an explanation, source support, pricing review, or waiver consideration.

## Unresolved evidence and recommended next batch

Highest-value open source work is period-matched primary-network or retained processor evidence for:

1. the September 2024 0.1475% Mastercard Assessment observation, including whether high-ticket population blending explains it;
2. the 2025 $3.00 Mastercard Location Fee, merchant-facing controller, and the conflicting excluded-MCC lists;
3. stable/core 2026 assessment, access, location, data-usage, integrity, and international values, since the retained 2026 bulletin is change-only;
4. the 2021 source blackout and archived 2024–2025 Fiserv updates or merchant-specific processor schedules;
5. actual period-specific FANF tiers;
6. historical Discover Program Integrity/Data Usage and American Express assessment effective dates.

Recommended next domain batch: a narrow **2024–2025 Mastercard Assessment and Location Fee source-admission batch**, because it directly resolves all three present above-reference candidates without widening into a general market-norm exercise.

## Regression scope

Milestone validation covers the new governed source/rule/reference catalogs, all 11 supported Fiserv Gold statements, the Batch 1 pricing semantics, Batch 2 per-item semantics, Batch 3 dated-network evidence, Internal Analyst Finding v1, build/type checking, and canonical financial fingerprint invariance. Older corpus expectations were updated only where they incorrectly treated pre-admission totals or the older generic Data Usage mechanic as permanent architecture truth.

The supplementary legacy command `npm run evaluate:internal-analyst-finding` still exits nonzero on two pre-existing post-Batch-2 expectations: an admitted CPU Gateway research contribution is suppressed by the current per-item identity disposition, and the same row consequently remains in the research queue. This milestone does not alter that unrelated research-admission precedence. The focused Internal Analyst Finding and Batch 1–3 regressions pass; Product should treat the legacy evaluation mismatch as a separate architecture-calibration item rather than as network-evidence authority.
