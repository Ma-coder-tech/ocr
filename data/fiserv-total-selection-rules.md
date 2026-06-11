# Fiserv Total Selection Rules - First Pass

Purpose: define how to choose the financially correct totals from Fiserv-related statements when multiple visible totals exist.

Scope:
- Based on the five current Fiserv-related samples and the Fiserv guide/reference docs.
- This is a rules document, not parser code.
- These rules should drive the first parser driver and reconciliation logic later.

Core principle:

Do not extract "the total." Extract candidate totals, classify their financial role, then select the value that matches the metric being calculated and reconciles with the statement formula.

## Canonical Concepts

For merchant-facing fee analysis, these concepts are separate:

| Concept | Meaning | Merchant report use |
|---|---|---|
| `totalVolume` | Statement-period processing/submitted volume used as the effective-rate denominator | Primary |
| `totalFees` | Total processing fees charged for the statement period | Primary |
| `amountFunded` | Amount deposited/funded/processed after deductions | Secondary/explanatory |
| `grossSales` | Sales before refunds | Secondary/explanatory |
| `refunds` | Refunds/credits reducing submitted amount | Secondary/explanatory |
| `adjustmentsChargebacks` | Adjustments, chargebacks, reversals, or correction amounts | Secondary/explanatory |
| `thirdPartyTransactions` | Transactions not funded by this processor, often AmEx/Discover pass-through | Secondary/explanatory |
| `interchangeOrProgramFees` | Card-brand/pass-through or program-fee bucket from fee summary | Fee breakdown |
| `interchangeDetailTotal` | Total from interchange detail table | Audit/detail only |
| `serviceCharges` | Processor/service-charge bucket from fee summary | Fee breakdown |
| `processorFees` | Account/monthly/misc/processor-owned fees | Fee breakdown |
| `reportableSales` | Tax/reporting sales by TIN or YTD sales | Do not use for core fee analysis |

## Source Priority Rules

### `totalVolume`

Use the first candidate that passes reconciliation:

1. Summary section `Total Amount Submitted` or `Amounts Submitted`.
2. Summary-by-day total submitted amount.
3. Summary-by-batch total submitted amount.
4. Summary-by-card-type total amount submitted, only if the section is not visibly distorted by adjustment rows.
5. Amounts-submitted section total, only if it reconciles to the statement summary or card/batch totals.

Reject as `totalVolume`:

- `Total Amount Funded to Your Bank`
- `Total Amount Processed`
- `Month End Charge`
- `Less Discount Paid`
- `Fees Charged`
- `Gross Reportable Sales By TIN`
- `YTD Gross Reportable Sales`
- interchange detail volume unless it matches the summary total and is being used only as supporting evidence
- card-type final total when an adjustment row or non-card row changes the section total

Notes:
- `totalVolume` is the denominator for net effective rate.
- If the statement has both gross sales and refunds, prefer the submitted/refund-adjusted amount, not gross sales before refunds.
- If a visible total conflicts with the summary total, keep it as conflicting evidence rather than deleting it.

### `totalFees`

Use the first candidate that passes reconciliation:

1. Summary section `Fees` or `Fees Charged`.
2. Final grand total in the `FEES` / `FEES CHARGED` section.
3. Sum of fee-summary buckets when the bucket sum reconciles to the statement total.

Reject as `totalFees`:

- `Total Interchange Charges`
- `Total Interchange Charges/Program Fees`
- `Total Service Charges`
- `Total Fees` when it is only one bucket beside interchange/service charges
- `Total Card Fees` alone
- `Total Miscellaneous Fees` alone
- `Less Discount Paid` alone
- `Month End Charge` alone
- interchange detail table total

Notes:
- Fiserv statements may show a bucket named `Total Fees`. That is not always the all-in fee total. If it appears beside `Total Interchange...` and `Total Service Charges`, it is only one component.
- Store fees internally as positive merchant costs, even when evidence lines show negative deductions.

### `amountFunded`

Use:

1. `Total Amount Funded to Your Bank`.
2. `Total Amount Processed`, when the statement uses processed instead of funded.
3. Summary-by-day final processed/funded column, if it reconciles.

Reject as `amountFunded`:

- submitted volume
- gross sales
- reportable sales
- fee totals

Notes:
- This is not the effective-rate denominator. It is the post-deduction result.

### `grossSales` and `refunds`

Use:

1. `SUMMARY BY CARD TYPE` gross sales and refunds columns.
2. `SUMMARY BY BATCH` gross sales and refunds columns.

Reject:

- statement-level submitted volume as gross sales if refunds are separately visible
- reportable sales as gross sales unless explicitly doing tax/reporting analysis

Notes:
- Gross sales can be useful for explanation, but effective rate should usually use submitted/refund-adjusted volume.

### `adjustmentsChargebacks`

Use:

1. Summary section `Adjustments`, `Chargebacks/Reversals`, or `Adjustments/Chargebacks`.
2. Dedicated adjustments/chargebacks section total.
3. Summary-by-day or funding table column if it reconciles.

Notes:
- Preserve sign from financial meaning, not only text display.
- Adjustments can be positive or negative.

### `thirdPartyTransactions`

Use:

1. Summary section `Third Party Transactions`.
2. Dedicated third-party section total.
3. Funding table column if it reconciles.

Notes:
- These are usually excluded from funded amount because the processor is not funding those transactions.

### Fee Breakdown Buckets

Use fee-summary bucket totals for merchant-facing fee mix:

| Bucket | Candidate labels |
|---|---|
| card-brand/pass-through | `Total Interchange Charges`, `Total Interchange Charges/Program Fees`, `Total Card Fees` when card fees represent pass-through/card fees |
| service/processor charges | `Total Service Charges`, discount/service charge rows |
| processor/account/misc fees | `Total Fees`, `Total Account Fees`, `Total Miscellaneous Fees`, application/monthly/statement/PCI/equipment fees |

Rules:
- The selected buckets must sum to `totalFees` within tolerance.
- If they do not sum, show the fee mix as partial or low confidence.
- Do not replace the fee-summary pass-through bucket with the interchange detail total unless they reconcile.

### `interchangeDetailTotal`

Use:

1. Total row from `INTERCHANGE`, `INTERCHANGE CHARGES/PROGRAM FEES`, or equivalent detail section.

Rules:
- Store separately from `interchangeOrProgramFees`.
- Use for audit/detail, downgrade hints, and line-item analysis.
- Do not use as total fees.
- Do not assume it equals the fee-summary interchange/program bucket.

### `reportableSales`

Use:

1. `Total Gross Reportable Sales By TIN`.
2. `YTD Gross Reportable Sales`.

Rules:
- Never use as `totalVolume` for fee/effective-rate analysis.
- Keep for tax/reporting context only.

## Reconciliation Rules

### Funding Formula

For statements with `amountFunded`:

```txt
submitted
- thirdPartyTransactions
+ adjustmentsChargebacks
- totalFees
= amountFunded
```

Use the signs from the statement's meaning:

- `totalFees` is a positive merchant cost internally.
- adjustments/chargebacks may be positive or negative.
- third-party transactions reduce the processor-funded amount.

For statements that display fees as negative, the raw statement may visually resemble:

```txt
submitted + adjustments + fees_charged = funded
```

where `fees_charged` is already negative.

### Fee Bucket Formula

Fee-summary buckets should reconcile:

```txt
interchangeOrProgramFees + serviceCharges + processorFees = totalFees
```

or, for card-fee/misc layouts:

```txt
cardFees + miscellaneousFees = totalFees
```

Accept small rounding/display differences up to `$0.02` for now.

### Effective Rate

```txt
effectiveRate = totalFees / totalVolume
```

Rules:
- Only show effective rate as confident when `totalFees` and `totalVolume` both pass source-priority and reconciliation checks.
- Flag unusually high/low values for review, but do not auto-reject if the statement explains them through low volume, application fees, chargebacks, or adjustments.

## Current Sample Decisions

| File | Selected `totalVolume` | Rejected/secondary visible total | Reason |
|---|---:|---:|---|
| `Fiserv_BasysProcessing_March_2020.pdf` | `$171,283.93` | `$180,449.83` reportable sales, `$358,203.54` YTD | Summary/card/batch totals agree; reportable/YTD are not fee-analysis volume |
| `fiserv_Clover_Jan_2024.pdf` | `$52,460.55` | `$49,565.71` reportable sales, `$572,505.96` YTD | Summary/card/batch/interchange volume agree; reportable/YTD excluded |
| `fiserv_Clover_June_2024.pdf` | `$2,400.00` | `$1,200.00` card-type final total | Summary/funding/batch total reconcile; card-type section is distorted by adjustment row |
| `fiserv_NXGEN PAYMENT SERVICES_jan_2022.pdf` | `$42,638.08` | `$43,498.06` gross/reportable sales, `158` interchange txns vs `159` gross items | Summary/funding/amounts-submitted agree; gross/reportable and detail counts are secondary |
| `fiserv_PAYSAFE_Febr_2024.pdf` | `$36,912.94` | `$38,758.59` visible amounts-submitted total | Summary/card/funded/reportable agree; visible total conflicts and should be preserved as secondary evidence |

## Confidence Rules

High confidence:
- summary total exists
- one or more supporting section totals agree
- funding formula reconciles
- fee bucket formula reconciles

Medium confidence:
- summary total exists and funding formula reconciles, but a supporting section conflicts
- fee buckets reconcile with small rounding difference

Low confidence:
- no summary total
- multiple unreconciled visible totals
- signs cannot be inferred reliably
- statement has only partial pages or missing fee section

Unsupported / needs review:
- no reliable statement-period total volume
- no reliable total fees
- funding formula cannot be evaluated and supporting totals conflict

## Product Decisions

These decisions affect what the parser must preserve for later reporting. They do not mean the report is being built now.

1. Show `amountFunded` as an important metric later. Parser should extract and reconcile it.
2. Preserve conflicting visible totals so they can be shown/explained later, not silently discarded.
3. Detect and label distorted effective rates caused by low volume, one-time fees, adjustments, or unusual statement activity.
4. Do not include reportable/YTD sales in the merchant fee-analysis report by default. Parser may capture them as excluded evidence, but they should not drive fee metrics.
