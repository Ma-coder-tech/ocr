# Fiserv Statement Ground Truth - First Pass

Purpose: manually capture the core truth for the five Fiserv-related statement samples before parser work.

Conventions:
- Fee amounts are stored as positive merchant cost amounts, even when the statement displays them as negative deductions.
- Evidence lines preserve the statement wording/sign.
- This is a first-pass ground truth document. Values marked with a note should be visually verified in the PDF before being used as strict regression fixtures.
- Arithmetic reconciliation has been checked against the extracted evidence, but the source PDFs still need one visual pass before this becomes strict fixture data.

## Summary

| File | Visible brand / format | Statement period | Merchant | Total volume | Total fees | Transactions | Effective rate | Status |
|---|---|---:|---|---:|---:|---:|---:|---|
| `Fiserv_BasysProcessing_March_2020.pdf` | Basys / Fiserv-style card processing statement | `03/01/20 - 03/31/20` | JEFES TACOS & TEQUILA | `$171,283.93` | `$3,552.45` | `3,310` | `2.0740%` | full candidate, slow extraction |
| `fiserv_Clover_Jan_2024.pdf` | First Data / Fiserv-style card processing statement | `10/01/24 - 10/31/24` | PEPES MEXICAN RESTURANT | `$52,460.55` | `$1,312.55` | `1,800` | `2.5020%` | full candidate |
| `fiserv_Clover_June_2024.pdf` | First Data / Fiserv-style short statement | `06/01/24 - 06/30/24` | EMERGING SOLUTIONS PLA | `$2,400.00` | `$141.31` | `10` | `5.8879%` | core totals candidate |
| `fiserv_NXGEN PAYMENT SERVICES_jan_2022.pdf` | NXGEN Payment Services | `09/01/22 - 09/30/22` | VORTAX | `$42,638.08` | `$2,007.73` | `159 gross / 158 interchange detail` | `4.7088%` | full candidate, PDF health note |
| `fiserv_PAYSAFE_Febr_2024.pdf` | Paysafe Payment Processing | `02/01/24 - 02/29/24` | M P PAINTING LLC | `$36,912.94` | `$1,565.73` | `17` | `4.2417%` | core totals candidate |

## 1. Basys March 2020

Source file: `/Users/martialmahougnonamoussou/Downloads/Fiserv_BasysProcessing_March_2020.pdf`

Core values:
- visible brand / format: Basys / `basyspro.com`, card processing statement
- merchant: JEFES TACOS & TEQUILA
- statement period: `03/01/20 - 03/31/20`
- total volume: `$171,283.93`
- total fees: `$3,552.45`
- total transactions: `3,310`
- effective rate: `2.0740%`
- pricing model guess: interchange/detail style

Evidence:
- `Statement Period | 03/01/20 - 03/31/20`
- `Page | 2 | Total Amount Submitted | $171,283.93`
- `Page | 4 | Fees | -$3,552.45`
- `Total Amount Processed | $167,731.48`
- `Total | 3,310 | $171,283.93 | 0 | 0.00 | 3,310 | $171,283.93`
- `TOTAL | -$3,552.45`
- `Total Interchange Charges | -$3,077.86`
- `Total Service Charges | -$142.35`
- `Total Fees | -$332.24`
- `Total (Service Charges, Interchange Charges, and Fees) | -$3,552.45`
- `TOTAL | $171,283.93 | 3,310 | -$2,850.23`

Notes:
- Existing extraction succeeds with a longer timeout, but timed out at the default timeout.
- Fee summary total reconciles: `3,077.86 + 142.35 + 332.24 = 3,552.45`.
- Interchange detail table total (`$2,850.23`) does not equal the fee summary's `Total Interchange Charges` (`$3,077.86`). Treat these as separate fields.

## 2. First Data / Fiserv-Style Full Statement

Source file: `/Users/martialmahougnonamoussou/Downloads/fiserv_Clover_Jan_2024.pdf`

Core values:
- visible brand / format: First Data / Fiserv-style card processing statement
- merchant: PEPES MEXICAN RESTURANT
- statement period: `10/01/24 - 10/31/24`
- total volume: `$52,460.55`
- total fees: `$1,312.55`
- total transactions: `1,800`
- effective rate: `2.5020%`
- pricing model guess: interchange-plus/detail style

Evidence:
- `Statement Period | 10/01/24 - 10/31/24`
- `Page | 1 | Total Amount Submitted | $52,460.55`
- `Page | 4 | Fees | -$1,312.55`
- `Total Amount Processed | $51,148.00`
- `Total | 1,797 | $52,497.03 | 3 | -$36.48 | 1,800 | $52,460.55`
- `TOTAL | -$1,312.55`
- `Total Interchange Charges/Program Fees | -$955.20`
- `Total Service Charges | -$89.12`
- `Total Fees | -$268.23`
- `Total (Service Charges, Interchange Charges/Program Fees, and Fees) | -$1,312.55`
- `TOTAL | $52,460.55 | 1,800 | -$806.59`

Notes:
- File name says January, but statement content says October 2024.
- Fee summary total reconciles: `955.20 + 89.12 + 268.23 = 1,312.55`.
- Interchange/program detail table total (`$806.59`) does not equal fee summary pass-through bucket (`$955.20`). Treat these as separate fields.

## 3. First Data / Fiserv-Style Short Statement

Source file: `/Users/martialmahougnonamoussou/Downloads/fiserv_Clover_June_2024.pdf`

Core values:
- visible brand / format: First Data / Fiserv-style short statement
- merchant: EMERGING SOLUTIONS PLA
- statement period: `06/01/24 - 06/30/24`
- total volume: `$2,400.00`
- total fees: `$141.31`
- total transactions: `10`
- effective rate: `5.8879%`
- pricing model guess: simple discount / swipe-non-swipe style

Evidence:
- `Statement Period | 06/01/24 - 06/30/24`
- `Page | 1 | Total Amount Submitted | $2,400.00`
- `Page | 2 | Fees | -$141.31`
- `Total Amount Processed | $1,058.69`
- `Total | $2,400.00 | 0.00 | -$1,200.00 | -$141.31 | $1,058.69`
- `SUMMARY BY CARD TYPE` visibly nets to `Total ... 10 ... $1,200.00` after an `Adjustments` row.
- `SUMMARY BY BATCH` total shows `Total | 8 | $2,900.00 | 2 | -$500.00 | 10 | $2,400.00`
- `NON SWIPED DISCOUNT $1,450.00 AT .028900 , 4 TRANS AT .100000 | Service charges | -$42.31`
- `APPLICATION FEE | Fees | -$99.00`
- `TOTAL | -$141.31`
- `Total Service Charges | -$42.31`
- `Total Fees | -$99.00`
- `Total (Service Charges, Interchange Charges/Program Fees, and Fees) | -$141.31`

Notes:
- This is not equivalent to the full 8-page statement. It has core totals and simple fee detail, but no visible interchange detail in the extraction pass.
- Fee summary total reconciles: `42.31 + 99.00 = 141.31`.
- Effective rate is high because volume is low and includes a `$99.00` application fee.
- Visual verification confirmed the card-type section's final total is `$1,200.00`. Treat `$2,400.00` as the statement-level `Total Amount Submitted`; do not use the card-type final total as the fee-analysis denominator for this statement.

## 4. NXGEN September 2022

Source file: `/Users/martialmahougnonamoussou/Downloads/fiserv_NXGEN PAYMENT SERVICES_jan_2022.pdf`

Core values:
- visible brand / format: NXGEN Payment Services
- merchant: VORTAX
- statement period: `09/01/22 - 09/30/22`
- total volume: `$42,638.08`
- total fees: `$2,007.73`
- total transactions: `159 gross / 158 interchange detail`
- effective rate: `4.7088%`
- pricing model guess: interchange/detail style

Evidence:
- `Statement Period | 09/01/22 - 09/30/22`
- `Page | 6 | Amounts Submitted | $42,638.08`
- `Fees Charged | -$2,007.73`
- `Less Discount Paid | -$652.48`
- `Total Amount Funded to Your Bank | $40,842.11`
- `Total | 159 | $43,498.06 | 3 | $859.98 | $42,638.08`
- `Total | $42,638.08 | 0.00 | $211.76 | -$2,007.73 | $40,842.11`
- `Total Card Fees | -1624.30`
- `Total Miscellaneous Fees | -383.41`
- `Total (Miscellaneous Fees and Card Fees) | -$2,007.73`
- `Total | 42,638.08 | 158 | -798.63`

Notes:
- File name says January 2022, but statement content says September 2022.
- File has abnormal leading bytes before the PDF header, but extraction succeeds.
- Fee summary total reconciles: `1,624.30 + 383.41 = 2,007.71`, which is within `$0.02` of the statement total. Treat as rounding/display tolerance.
- Transaction count has a meaningful discrepancy: card summary shows `159` gross items; interchange detail shows `158`. Do not force a single transaction truth yet.

## 5. Paysafe February 2024

Source file: `/Users/martialmahougnonamoussou/Downloads/fiserv_PAYSAFE_Febr_2024.pdf`

Core values:
- visible brand / format: Paysafe Payment Processing
- merchant: M P PAINTING LLC
- statement period: `02/01/24 - 02/29/24`
- total volume: `$36,912.94`
- total fees: `$1,565.73`
- total transactions: `17`
- effective rate: `4.2417%`
- pricing model guess: card-fee/detail style, but extracted detail is noisy

Evidence:
- `Statement Period | 02/01 /24 - 02/29/24`
- `Page | 5 | Amounts Submitted | $36,912 .94`
- `Fees Charged | -$1 ,565.73`
- `TotaI Amount Funded to Your Bank | $35,347.21`
- `Total | 17 | $36,912.94 | 0 | 0.00 | $36,912.94`
- `Total | $36,912.94 | 0.00 | 0.00 | $1,565.73 | $35,347.21`
- `AMOUNTS SUBMITTED` section visibly shows `Total | $38,758.59`
- `Total Card Fees | -$1,542.28`
- `Total Miscellaneous Fees | -23.45`
- `Total (Miscellaneous Fees and Card Fees) | -$1,565.73`
- `FEB | Gross Reportable Sales - TIN XXXXX9304 | $36,912.94`

Notes:
- Extraction contains spacing/OCR-like noise: examples include `$36,912 .94`, `$1 ,565.73`, and `TotaI` with capital `I`.
- Fee summary total reconciles: `1,542.28 + 23.45 = 1,565.73`.
- Visual verification confirmed the `AMOUNTS SUBMITTED` section visibly shows `$38,758.59` as a total. Treat it as a visible non-core/conflicting total for this first-pass ground truth. Treat `$36,912.94` as the core submitted volume because it appears in the statement summary, card-type total, funded summary, and reportable sales.
