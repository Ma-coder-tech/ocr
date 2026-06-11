# Fiserv Extraction Audit - First Pass

Purpose: compare current `pdfjs`-based extraction against the first-pass ground truth for the five Fiserv-related samples.

This is not parser design. It is a practical audit of what the extraction layer can and cannot safely provide.

## Bottom Line

All five files have extractable text. For this Fiserv sample set, the immediate bottleneck is not OCR. The bottleneck is financial interpretation:

- multiple visible totals can exist in the same statement
- summary totals, card-type totals, batch totals, and interchange totals do not always mean the same thing
- signs are inconsistent across tables
- some useful PDFs are slow or malformed enough to need extraction-health handling

Do not start by buying an OCR provider for these samples. Start by building parser rules that use statement sections, evidence, and reconciliation.

## Extraction Coverage

| File | Current extraction result | Ground-truth core fields visible? | Main extraction risk |
|---|---|---:|---|
| `Fiserv_BasysProcessing_March_2020.pdf` | Structured text extraction succeeds with longer timeout | Yes | Slow old AFP-generated PDF; default timeout risk |
| `fiserv_Clover_Jan_2024.pdf` | Structured text extraction succeeds cleanly | Yes | Interchange detail total differs from fee-summary pass-through bucket |
| `fiserv_Clover_June_2024.pdf` | Structured text extraction succeeds cleanly | Yes | Card-type final total is `$1,200.00`, while statement-level submitted volume is `$2,400.00` |
| `fiserv_NXGEN PAYMENT SERVICES_jan_2022.pdf` | Structured text extraction succeeds with PDF/font warning | Yes | Abnormal PDF header; transaction count differs by section; fee bucket rounding |
| `fiserv_PAYSAFE_Febr_2024.pdf` | Structured text extraction succeeds, but text has spacing/noise | Yes | Visible `$38,758.59` total conflicts with core submitted volume; sign/noise issues |

## File Findings

### 1. Basys March 2020

Core fields extracted:
- statement period: `03/01/20 - 03/31/20`
- total amount submitted: `$171,283.93`
- fees: `-$3,552.45`
- total amount processed: `$167,731.48`
- card-type total: `3,310` transactions and `$171,283.93`
- fee summary buckets:
  - interchange charges: `-$3,077.86`
  - service charges: `-$142.35`
  - fees: `-$332.24`
  - grand total: `-$3,552.45`

Audit result:
- Core extraction is good.
- The default parser timeout is too short for this file.
- Interchange detail total is `-$2,850.23`, while fee-summary interchange is `-$3,077.86`. A future parser must not treat those as automatically equivalent.

### 2. First Data / Fiserv-Style Full Statement

Core fields extracted:
- statement period: `10/01/24 - 10/31/24`
- total amount submitted: `$52,460.55`
- fees: `-$1,312.55`
- total amount processed: `$51,148.00`
- card-type total: `1,800` transactions and `$52,460.55`
- fee summary buckets:
  - interchange/program fees: `-$955.20`
  - service charges: `-$89.12`
  - fees: `-$268.23`
  - grand total: `-$1,312.55`

Audit result:
- This is the cleanest first full-statement target.
- Filename says January, but statement content says October 2024.
- Interchange/program detail total is `-$806.59`, while fee-summary pass-through bucket is `-$955.20`. A future parser must keep those fields separate.

### 3. First Data / Fiserv-Style Short Statement

Core fields extracted:
- statement period: `06/01/24 - 06/30/24`
- total amount submitted: `$2,400.00`
- fees: `-$141.31`
- total amount processed: `$1,058.69`
- card-type total visibly ends with `$1,200.00`
- batch total ends with `$2,400.00`
- fee summary buckets:
  - service charges: `-$42.31`
  - fees: `-$99.00`
  - grand total: `-$141.31`

Audit result:
- Core extraction is good, but this statement is a trap.
- The card-type final total must not be used as the fee-analysis volume.
- The statement-level summary and funding formula support `$2,400.00` as the submitted amount:
  - `$2,400.00 - $1,200.00 adjustments - $141.31 fees = $1,058.69 processed`

### 4. NXGEN September 2022

Core fields extracted:
- statement period: `09/01/22 - 09/30/22`
- amounts submitted: `$42,638.08`
- fees charged: `-$2,007.73`
- less discount paid: `-$652.48`
- total amount funded: `$40,842.11`
- card-type total: `159` gross items and `$42,638.08`
- fee summary buckets:
  - card fees: `-1624.30`
  - miscellaneous fees: `-383.41`
  - grand total: `-$2,007.73`

Audit result:
- Core extraction is good.
- File has abnormal leading bytes before the PDF header, and extraction emits a font warning.
- Card summary shows `159` items; interchange detail shows `158` transactions. A future parser should preserve both rather than forcing one number.
- Fee buckets sum to `$2,007.71`, which is `$0.02` below the statement total. This should be treated as rounding/display tolerance.

### 5. Paysafe February 2024

Core fields extracted:
- statement period: `02/01/24 - 02/29/24`
- amounts submitted: `$36,912.94`
- fees charged: `-$1,565.73`
- total amount funded: `$35,347.21`
- card-type total: `17` items and `$36,912.94`
- `AMOUNTS SUBMITTED` visibly shows another total: `$38,758.59`
- fee summary buckets:
  - card fees: `-$1,542.28`
  - miscellaneous fees: `-23.45`
  - grand total: `-$1,565.73`

Audit result:
- Core extraction is usable, but text normalization will matter.
- Extraction includes spacing/noise such as `$36,912 .94`, `$1 ,565.73`, and `TotaI`.
- `$38,758.59` is a visible total, not extraction noise, but it should not replace the core submitted amount.
- The funded-summary row may show the fees column without a negative sign in extracted text. A future parser should infer sign from section/column context and reconciliation, not just the literal token.

## Rules Learned From This Audit

1. Prefer statement-level summary totals for core `totalVolume` and `totalFees`.
2. Use card-type and batch totals as supporting evidence, not as automatic replacements.
3. Keep fee-summary pass-through totals separate from interchange-detail table totals.
4. Treat visible YTD/reportable-sales totals as non-core unless explicitly requested.
5. Do not trust signs without section and column context.
6. Add an extraction-health flag for slow or abnormal PDFs.
7. Preserve conflicting totals as evidence instead of deleting them.

## Immediate Decision

The first parser target should be:

`fiserv_Clover_Jan_2024.pdf`

Reason:
- clean extraction
- full statement
- clear summary section
- clear fee summary
- clear interchange/program section
- enough traps to force proper section-aware parsing without starting from the hardest file

The June short statement should be used as a second test for fallback behavior, not as proof that the full-statement parser is complete.
