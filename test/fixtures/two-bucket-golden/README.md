# Two-Bucket Golden Fixtures

These fixtures define statement-anchored expected outputs for the first implementation pass of the two-bucket evaluator.

Phase 1 scope:
- `E001 Two-bucket cost model`
- `E003 Card-brand fee share baseline`
- `E004 Processor fee share baseline`

Phase 1 asserted fields:
- `totalFees`
- `cardBrandTotal`
- `processorOwnedTotal`
- `unknownTotal`
- `cardBrandSharePct`
- `processorOwnedSharePct`
- `coveragePct`
- `reconciliationDeltaUsd`
- expected checklist statuses for `E001`, `E003`, and `E004`

Phase 1 intentionally does not require:
- `processorMarkupTotal`
- `processorAncillaryTotal`

Those sub-buckets need a stricter ownership rubric and should not be guessed from presentation-oriented fee tables.

Fixture set:
- `clover_october_2024_pass.json`: clean pass case derived from statement section totals
- `clover_november_2024_pass.json`: second clean pass case from the same Clover/Fiserv family to confirm month-over-month consistency
- `bloom_january_2024_warning.json`: clean warning case with card-brand share below guide baseline
- `clover_june_processing_unknown.json`: clean unknown case where the statement does not expose a usable card-brand subtotal

Interpretation rules for these fixtures:
- When the statement provides explicit section totals that map cleanly to the two-bucket baseline, use those section totals as the golden target.
- When the statement does not expose a trustworthy card-brand total, the evaluator should return `unknown` instead of fabricating a split.
- These fixtures are source-of-truth references for implementation and testing. They are not meant to mirror the current analyzer output.
