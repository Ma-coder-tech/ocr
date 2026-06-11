# Fiserv / First Data Processor Output Contract - First Pass

Purpose: define what the shared Fiserv / First Data processor-branded parser must return after reading a statement.

This is not code and not a final schema. It is the contract the Fiserv / First Data parser driver should satisfy across supported visible brands.

## Contract Boundary

This contract belongs to the processor family and layout, not to one visible reseller brand.

```txt
Global parser contract: Fiserv / First Data processor-branded statement
Fixture examples: Paysafe February 2024, Priority Payment Systems December 2024, Clover samples
```

Paysafe-specific values belong only in fixture expectations and evidence examples. Shared parser code, schemas, reconciliation logic, and fee classification rules should use Fiserv / First Data processor-branded terminology unless a rule is intentionally fixture-specific.

## Core Requirement

The parser must return financial facts with evidence, not just naked values.

Every selected value must answer:

- What is the value?
- What financial role does it play?
- Where did it come from?
- Why was it selected over other visible totals?
- Did it reconcile?
- How confident are we?

## Top-Level Output

The parser output should contain these top-level groups:

```txt
statementIdentity
selectedFinancials
feeBreakdown
interchangeDetail
candidateTotals
excludedTotals
reconciliation
confidence
warnings
evidence
```

## 1. `statementIdentity`

Identifies the document and the likely statement family.

Required fields:

```txt
processorFamily
visibleBrand
statementFamily
merchantName
merchantNumber
statementPeriodStart
statementPeriodEnd
sourceFileName
pageCount
```

Examples:

```txt
processorFamily: Fiserv / First Data
visibleBrand: Paysafe Payment Processing
statementFamily: fiserv_first_data_processor_statement
merchantName: M P PAINTING LLC
```

Rules:
- Do not trust the filename for statement period.
- `statementFamily` identifies the parser layout, not the visible brand. Paysafe, Priority Payment Systems, and similar visible brands can share `fiserv_first_data_processor_statement` when the layout contract matches.
- If merchant number is masked or unavailable, return null with evidence/warning.

## 2. `selectedFinancials`

The selected values used for fee analysis.

Required fields:

```txt
totalVolume
totalFees
effectiveRate
amountFunded
grossSales
refunds
adjustmentsChargebacks
thirdPartyTransactions
transactionCount
```

Rules:
- `totalVolume` is the statement-period submitted/processed amount used as the effective-rate denominator.
- `totalFees` is stored as a positive merchant cost.
- `effectiveRate = totalFees / totalVolume`.
- `amountFunded` is not the denominator. It is the post-deduction result.
- `grossSales`, `refunds`, `adjustmentsChargebacks`, and `thirdPartyTransactions` may be null if not visible.
- `transactionCount` may contain more than one count if sections disagree.

Transaction count shape:

```txt
primaryTransactionCount
supportingTransactionCounts
```

Example:

```txt
primaryTransactionCount: 159
supportingTransactionCounts:
  - role: interchange_detail_transactions
    value: 158
    reason: Interchange detail total differs from card summary item count.
```

## 3. `feeBreakdown`

The selected fee buckets used to explain total fees.

Expected buckets:

```txt
cardBrandOrPassThrough
serviceCharges
processorOrAccountFees
miscellaneousFees
equipmentFees
unknownOrUnclassified
```

Rules:
- Bucket amounts are positive merchant costs.
- Buckets should reconcile to `totalFees`.
- If the statement uses `card fees + miscellaneous fees`, preserve that layout.
- If the statement uses `interchange/program + service charges + fees`, preserve that layout.
- Do not force every statement into the same bucket structure if the statement layout is different.

Each bucket should include:

```txt
label
amount
sourceSection
evidenceLine
confidence
```

## 4. `interchangeDetail`

Detailed interchange/program totals and rows, if visible.

Required fields:

```txt
available
detailTotal
detailTransactionCount
detailVolume
rows
```

Rules:
- Keep `interchangeDetail.detailTotal` separate from fee-summary pass-through totals.
- Do not use interchange detail total as `totalFees`.
- Do not assume interchange detail total equals `cardBrandOrPassThrough`.
- If detail rows are not parsed yet, preserve visible section totals and mark rows as unavailable.

Row fields, when available:

```txt
brandOrNetwork
description
volume
transactionCount
rate
perItem
amount
evidenceLine
```

## 5. `candidateTotals`

All plausible totals the parser considered.

Each candidate should include:

```txt
roleCandidate
label
amount
sourceSection
pageNumber
evidenceLine
selected
selectionReason
rejectionReason
confidence
```

Examples of `roleCandidate`:

```txt
total_volume
gross_sales
amount_funded
total_fees
interchange_detail_total
fee_bucket_total
reportable_sales
ytd_sales
conflicting_total
```

Rules:
- Do not delete conflicting totals.
- Preserve visible totals that were rejected, especially when they could confuse a merchant or future parser.
- Candidate totals are how we debug parser choices.

## 6. `excludedTotals`

Totals explicitly excluded from core fee analysis.

Examples:

```txt
Gross Reportable Sales By TIN
YTD Gross Reportable Sales
visible conflicting totals
interchange detail totals
card-type totals distorted by adjustments
```

Each excluded total should include:

```txt
amount
label
sourceSection
evidenceLine
excludedFrom
reason
```

Example:

```txt
amount: 572505.96
label: 2024 YTD Gross Reportable Sales
excludedFrom: totalVolume
reason: YTD tax/reporting value is not statement-period processing volume.
```

## 7. `reconciliation`

Validation results that prove or challenge selected values.

Required checks:

```txt
fundingFormula
feeBucketFormula
effectiveRateFormula
supportingVolumeAgreement
supportingFeeAgreement
```

Funding formula:

```txt
submitted - thirdPartyTransactions + adjustmentsChargebacks - totalFees = amountFunded
```

Fee bucket formula:

```txt
fee buckets sum to totalFees
```

Each reconciliation check should include:

```txt
status: pass | warning | fail | not_applicable
expected
actual
delta
tolerance
explanation
```

Rules:
- A parser result should not be high confidence if core funding formula fails.
- Small display/rounding differences up to `$0.02` can be warning/pass depending on context.
- If formula inputs are missing, return `not_applicable`, not `pass`.

## 8. `confidence`

Overall and field-level confidence.

Required fields:

```txt
overall
totalVolume
totalFees
amountFunded
feeBreakdown
statementIdentity
```

Allowed values:

```txt
high
medium
low
needs_review
```

High confidence requires:

- summary total exists
- supporting section agrees or is explainably different
- funding formula reconciles
- fee bucket formula reconciles
- evidence lines are present

Medium confidence allows:

- a visible conflicting total exists but selected value reconciles
- a fee bucket sum differs by small rounding tolerance

Low confidence / needs review:

- no reliable statement-period volume
- no reliable total fees
- selected values do not reconcile
- parser cannot explain why it chose a value

## 9. `warnings`

Warnings should be explicit and useful.

Examples:

```txt
filename_period_mismatch
visible_conflicting_total
card_type_total_distorted_by_adjustments
reportable_sales_excluded
interchange_detail_total_differs_from_fee_summary
slow_pdf_extraction
abnormal_pdf_header
text_spacing_noise
transaction_count_disagreement
distorted_effective_rate
```

Each warning should include:

```txt
code
severity
message
evidenceLine
```

## 10. `evidence`

Evidence should be attached to fields, but the parser should also return a compact evidence list for review.

Evidence item shape:

```txt
field
sourceSection
pageNumber
lineIndex
evidenceLine
value
```

Rules:
- Evidence must preserve the original statement wording/sign.
- Normalized values should not replace raw evidence.
- If page number is unavailable in early implementation, return null and keep line/evidence text.

## Required Behavior On Current Samples

### Basys March 2020

Must select:

```txt
totalVolume = 171283.93
totalFees = 3552.45
amountFunded/processed = 167731.48
transactionCount = 3310
```

Must warn:

```txt
slow_pdf_extraction
interchange_detail_total_differs_from_fee_summary
reportable_sales_excluded
```

### First Data / Fiserv Full Statement

Must select:

```txt
totalVolume = 52460.55
totalFees = 1312.55
amountFunded/processed = 51148.00
transactionCount = 1800
```

Must warn:

```txt
filename_period_mismatch
interchange_detail_total_differs_from_fee_summary
reportable_sales_excluded
```

### First Data / Fiserv Short Statement

Must select:

```txt
totalVolume = 2400.00
totalFees = 141.31
amountFunded/processed = 1058.69
transactionCount = 10
```

Must preserve/exclude:

```txt
card-type final total = 1200.00
reason: distorted by adjustment row; not the statement-level submitted volume
```

Must warn:

```txt
card_type_total_distorted_by_adjustments
distorted_effective_rate
```

### NXGEN September 2022

Must select:

```txt
totalVolume = 42638.08
totalFees = 2007.73
amountFunded = 40842.11
transactionCount.primary = 159
```

Must preserve:

```txt
interchange detail transactions = 158
```

Must warn:

```txt
filename_period_mismatch
abnormal_pdf_header
transaction_count_disagreement
fee_bucket_rounding_tolerance
```

### Paysafe February 2024

Must select:

```txt
totalVolume = 36912.94
totalFees = 1565.73
amountFunded = 35347.21
transactionCount = 17
```

Must preserve/exclude:

```txt
visible AMOUNTS SUBMITTED total = 38758.59
reason: visible conflicting total; not selected because summary/card/funded/reportable evidence supports 36912.94
```

Must warn:

```txt
visible_conflicting_total
text_spacing_noise
reportable_sales_excluded
```

## Non-Goals For First Parser Driver

Do not require the first parser driver to:

- parse every interchange row perfectly
- calculate official interchange padding
- choose an OCR provider
- analyze every Fiserv reseller format
- generate the merchant report
- produce savings estimates

First driver success means:

```txt
selected core financials are correct
evidence exists
conflicting/excluded totals are preserved
reconciliation passes
confidence is honest
```
