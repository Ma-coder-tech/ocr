# Governed Knowledge Batch 2 — Authorization and Per-Item Semantics v1

Status: implemented for internal analyst use; awaiting Product review

Review date: 2026-09-07

Supported statement family: Fiserv U.S. Gold corpus

Customer-facing authority: none

## Admission evidence

- Controlling Product adjudication: `RateReveal_Product_Batch2_Authorization_PerItem_Semantics_Adjudication_2026_09_07`
  - SHA-256: `f5f4ca5b3d4e5eb1a98c7342f58accca8f17eda54755cff5ff43a834cdd3e78d`
- Supporting independent review: `CLAUDE_RateReveal_Batch2_Authorization_PerItem_Semantics.md`
  - SHA-256: `416351b83b3b45cecd07983e014fa5a5c27e73c226d84b5daa4f061979265197`

The Product adjudication controls where the two sources differ. In particular, Batch 2 rejects a universal population-ordering law, rejects authorization-minus-settlement as a decline count, and keeps `ECI` in `ECI CPU-G` unresolved.

## Admitted rules

The executable catalog `governed_per_item_knowledge_batch2_2026_09_07_v1` contains:

- `RR-B2-00`: quantity and unit are determined, never assumed;
- `RR-B2-01`: authorization, network, clearing, settlement, AVS, refund, batch, and exception populations remain distinct;
- `RR-B2-02`: population evidence is separate from economic-character evidence;
- `RR-B2-03`: exact identity is multi-dimensional and never established by rate alone;
- `RR-B2-04`: WATS/ECR/CPU are bounded access-token families, and token expansion is prohibited without applicable evidence;
- `RR-B2-05`: CPU GTWY can resolve to a broader acquiring-side gateway/authorization commercial category while exact provider, architecture, and retention stay unresolved;
- `RR-B2-06`: network per-event identity and price require brand-qualified, dated, geography/product-applicable evidence;
- `RR-B2-07`: AVS has acquiring-side, network-side, bundled, and unresolved states, with no causation from a low ratio;
- `RR-B2-08`: MIN quantities are minimum-applied counts unless a different trigger/population is proven;
- `RR-B2-09`: network exception identity, ownership, trigger, population, and actionability remain separate;
- `RR-B2-10`: clearing/data records and kilobytes are not transaction counts, and count matching does not prove economic ownership;
- `RR-B2-11`: acquiring-side classification requires affirmative evidence; otherwise `PER_ITEM_LAYER_UNRESOLVED` permits verification only;
- `RR-B2-12`: batch/header population requires validation against an actual batch table and cannot be reconstructed from funding/summary rows;
- `RR-B2-13`: burden is statement-period economics; one-cent sensitivity is not a target and annualization is an approximate current-month run rate, not a forecast;
- `RR-B2-14`: network-set price and operational incidence are separate;
- `RR-B2-15`: confidence controls internal rendering permission and prevents stronger downstream assertions.

No new market norm, pricing range, target price, network value, processor-retention claim, or contract conclusion was admitted in this batch.

## Full Gold-corpus calibration

The evaluation covers all 11 supported Fiserv Gold statements and all 483 material fee findings.

| Measure | Before Batch 2 | After Batch 2 |
|---|---:|---:|
| Exact identities | 81 | 76 |
| Category-only findings | 84 | 96 |
| Fully unresolved findings | 318 | 311 |
| Ambiguous/competing findings | 61 | 90 |
| Research-queue questions | 402 | 407 |

The five exact identities withdrawn are intentional overconfidence corrections and return to research. Across the 90 material per-item candidates after admission:

- 65 have a supported unit and 25 keep the unit unresolved;
- 65 have a supported population interpretation (with comparisons remaining diagnostic only);
- 52 resolve to an acquiring-side layer;
- 5 have qualified network economic ownership;
- 5 are AVS findings governed through the four-state AVS model;
- 28 remain `PER_ITEM_LAYER_UNRESOLVED`, and negotiation/waiver recommendations are withheld for all 28;
- 48 rows receive a Batch 2 exact-identity ceiling (most were already unresolved; five had previously been over-resolved);
- 0 unresolved layers receive false negotiation permission, and 0 population observations are converted into errors or decline counts.

Every source document's canonical financial fingerprint is identical before and after analyst resolution.

## Remaining limitations

- Canonical v1 does not expose a verified settlement-batch row count to the governed authority. Batch/header unit claims therefore remain unresolved until an actual batch-table observation can be supplied without changing canonical financial truth.
- Many source statements do not expose a usable printed quantity even when the fee-family unit is supported; quantity-dependent one-cent sensitivity is withheld in those cases.
- Network prices are not admitted from corpus rate clusters. A network amount can be compared only when an applicable dated, geography/product-scoped value source exists.
- CPU GTWY's broader acquiring-side category is useful, but exact provider, gateway, architecture, and ultimate retention remain unresolved.
- `ECI` remains an unresolved processor-specific access token.
- The legacy `fiservFeeAnalysis.ts` path still contains authorization-minus-settlement "excess" arithmetic, universal ratio thresholds, and fixed per-authorization target/annual-savings logic. Internal Analyst Finding v1 does not consume those conclusions, but that legacy path must not become customer-facing authority and should be retired or separately governed before any report cutover.
- Batch 2 does not create customer wording, UI, report cutover, OCR changes, another processor family, or production behavior.

## Recommended next domain batch

Review dated network per-event authorization/access and exception/integrity evidence by brand, product, geography, and effective period. This would resolve the highest-value remaining exact identities without weakening the newly admitted population and rendering controls.
