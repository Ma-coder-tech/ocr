# Fiserv Merchant Statement Fee Analysis — Engineering Specification

**Version:** 2.0  
**Date:** June 15, 2026  
**Purpose:** Complete technical reference for Codex to implement fee classification, rate verification, and padding detection on Fiserv/First Data merchant processing statements.  
**Scope:** US market only. Fiserv Omaha/North statement format. Merchants processed through Fiserv and its ISOs (Merchant One, CardConnect, PNC, etc.)

---

## 1. How a Merchant Statement Works

Every time a cardholder pays a merchant, three parties take a cut of the transaction before the merchant receives their money.

**Party 1 — The issuing bank** receives interchange. This is the largest cost component. Example: on a $50 Visa credit sale, the issuing bank might take $0.97 (1.65% + $0.10). Interchange rates vary by card type, MCC, and qualification level. They are set by the card networks (Visa, Mastercard) and published in interchange tables updated in April and October each year.

**Party 2 — The card network** (Visa, Mastercard, Amex, Discover) receives assessment and network fees. These are small percentage-of-volume or per-transaction fees. Example: on that same $50 Visa credit sale, Visa takes about $0.09 across several fees (assessment, APF, etc.).

**Party 3 — The processor and ISO** (Fiserv + the reselling ISO like Merchant One) receives the markup. This is the only negotiable part. Example: the processor takes $0.15 in discount rate, per-item fees, gateway fees, etc.

The merchant receives: $50.00 - $0.97 - $0.09 - $0.15 = $48.79. The total fee ($1.21) divided by the sale ($50.00) = 2.42% effective rate.

A statement summarizes all these fees for a billing period (typically one month).

### 1.1 Key Metric: Effective Rate

```
effective_rate = total_fees / total_volume
```

For the Abdul Basher August 2025 statement:
```
effective_rate = $91.19 / $2,712.11 = 3.36%
```

This is the single most important number on any statement. It tells the merchant what percentage of their sales went to fees.

### 1.2 Key Metric: Processor Markup Rate

```
processor_markup_rate = processor_controlled_fees / total_volume
```

For Abdul Basher:
```
processor_markup_rate = $47.46 / $2,712.11 = 1.75%
```

This tells the merchant what percentage of their sales goes specifically to the processor — the only part they can negotiate down.

---

## 2. Fiserv Statement Structure

A Fiserv Omaha/North format statement has these sections, in order:

### 2.1 Summary (Page 1)
Contains: total amounts submitted, third-party transactions, adjustments/chargebacks, fees charged, total amount funded. Also contains the **Important Information / Attention notice block** — this is where fee changes, rate increases, and new annual fees are announced.

### 2.2 Summary By Card Type (Pages 1-2)
Breaks down volume by card type: Mastercard, Mastercard Debit, Visa, Visa Debit, AMEXCT043, DCVR ACQ, etc. Shows items, amount, refunds, and net submitted per card type.

### 2.3 Amounts Funded By Batch (Page 2)
Lists every batch settlement with date, batch number, submitted amount, third-party transactions, adjustments, fees charged, and funded amount. The last row is "Month End Charge" which carries all the fees.

### 2.4 Fees Charged (Pages 3-4)
**This is the most important section for fee analysis.** Lists every individual fee with: date, type (CF = Card Fee, MISC = Miscellaneous), description, volume (count or dollar amount), rate, and total.

Fees are organized under **card-type section headers**:
- `MASTERCARD` — Mastercard credit fees
- `MC OFLN DB` — Mastercard offline/signature debit fees
- `AMEXCT043` — American Express OptBlue fees
- `VISA` — Visa credit fees
- `VS OFLN DB` — Visa offline/signature debit fees
- `DCVR ACQ` — Discover acquirer fees

Under each card-type section, there may be a sub-header `AUTHS & AVS` that groups authorization-related fees.

At the bottom: `Total Card Fees`, then MISC fees (batch, statement, regulatory, sales items), then `Total Miscellaneous Fees`, then `Total (Misc Fees and Card Fees)`.

**CRITICAL:** The same fee name can appear under multiple card-type sections with DIFFERENT rates. The section header determines which network and which rate to expect. Example: `ACQR PROCESSOR FEES` under `VISA` = $0.0195/auth (credit APF), but under `VS OFLN DB` = $0.0155/auth (debit APF).

### 2.5 Interchange Charges/Program Fees (Pages 4-5)
Detailed breakdown of interchange by program. Each line shows: product/description, sales total, number of transactions, rate, cost per transaction, sub total. Grouped by card type. Has a grand total at the bottom.

### 2.6 Tax Gross Reportable Sales (Page 5)
IRS reporting section. Shows month and YTD gross reportable sales by TIN.

---

## 3. The Reconciliation Math

Before classifying fees, verify the statement's internal consistency.

### 3.1 Funding Reconciliation
```
amount_funded = amounts_submitted - third_party_transactions + adjustments_chargebacks + fees_charged
```
Note: fees_charged is negative (it's a deduction).

For Abdul Basher:
```
$2,620.92 = $2,712.11 - $0.00 + $0.00 + (-$91.19)
$2,620.92 = $2,620.92 ✓
```

### 3.2 Fee Total Reconciliation
```
total_card_fees + total_miscellaneous_fees = total_fees
```
For Abdul Basher:
```
$63.85 + $27.35 = $91.20 (detail sum)
```
Statement printed total: $91.19. Delta = $0.01 (rounding). Preserve the printed total; log the delta.

**Rule:** If the delta exceeds $0.50, flag as a reconciliation error.

### 3.3 Interchange Cross-Check
```
sum_of_interchange_lines_in_fees_charged ≈ interchange_detail_table_total
```
The "Fees Charged" section has lines labeled `INTERCHANGE` under each card type. Their sum should approximately equal the total at the bottom of the Interchange Charges/Program Fees detail table.

For Abdul Basher:
- Interchange lines in Fees Charged: $5.00 + $6.48 + $8.36 + $13.67 + $1.19 + $1.24 (Amex program) = $35.94
- Interchange detail table total: $35.88
- Delta: $0.06

**Rule:** If delta exceeds $1.00 or 2% of interchange total, flag as potential interchange padding.

### 3.4 Batch Ledger Reconciliation
```
sum_of_all_batch_submitted_amounts = total_amounts_submitted
sum_of_all_batch_funded_amounts = total_amount_funded
```

---

## 4. Fee Classification System

Every fee row must be classified into exactly one of these categories:

| Category | Code | Description | Negotiable |
|---|---|---|---|
| Interchange | `interchange` | Pass-through to issuing bank | No |
| Card brand / network fee | `card_brand_network` | Pass-through to Visa/MC/Amex/Discover | No (but verify at-cost) |
| Processor percentage markup | `processor_pct_markup` | Processor's basis-point fee on volume | Yes |
| Processor per-item markup | `processor_per_item` | Processor's per-transaction/auth fee | Yes |
| Processor fixed/monthly fee | `processor_fixed` | Monthly or annual flat fees | Yes |
| PIN debit network fee | `pin_debit_network` | STAR, Accel, NYCE, Pulse fees | Partially |
| Compliance penalty | `compliance_penalty` | Network non-compliance fines (TIF, misuse, etc.) | Avoidable |
| Unknown | `unknown` | Cannot classify — needs review | Unknown |

### 4.1 Classification Decision Logic

For each fee row, follow this sequence:

```
1. Read the card-type section header the fee appears under.
2. Read the fee description (normalize: uppercase, trim whitespace, remove OCR artifacts).
3. Check: is the description "INTERCHANGE"?
   → Yes: classify as `interchange`. Done.
4. Check: does the description match a known network fee in the reference table?
   → Yes: classify as `card_brand_network`. Proceed to rate verification (Section 5).
5. Check: is the fee type "MISC"?
   → Yes: classify as `processor_fixed` (STATEMENT FEE, REGULATORY PRODUCT, etc.)
   → Exception: BATCH HEADER is `processor_per_item` (per-batch).
6. Check: does the description contain "DISC" and a number?
   → Yes: classify as `processor_pct_markup`.
7. Check: does the description match known processor per-item fees (OTHER ITEM FEES, CPU GTWY, SALES ITEMS)?
   → Yes: classify as `processor_per_item`.
8. Check: does the description match a known compliance/penalty fee (TIF, MISUSE, etc.)?
   → Yes: classify as `compliance_penalty`.
9. Fall through: classify as `unknown`.
```

---

## 5. Network Fee Rate Reference Table (US Market, Current as of June 2026)

**CRITICAL RULE: All rates in this section are US market rates sourced from US-focused industry references. DO NOT substitute rates from the Fiserv Canada pass-through fee page or any other non-US source. The Canadian market has different assessment rates, network fees, and fee structures. Using Canadian rates for US merchant analysis will produce incorrect results.**

### 5.1 Mastercard Network Fees

| Fee (Fiserv label) | Canonical Name | Rate | Type | Source & Confidence |
|---|---|---|---|---|
| `NABU FEES` | Network Access and Brand Usage | **$0.0195/auth** | Per authorization | Unchanged since July 2013. Confirmed by Mastercard documentation, Paya/Nuvei, MerchantCostConsulting, CardFellow, Braintree. **HIGH confidence.** |
| `DUES & ASSESSMENTS` (under MASTERCARD or MC OFLN DB) | Acquirer Brand Volume Fee (Assessment) | **0.13%** of volume (txns < $1,000); **0.14%** (txns ≥ $1,000) | Percent of volume | Confirmed by multiple sources. Verisave (Feb 2026) reports MC at 0.1375% blended. **HIGH confidence.** |
| `LICENSE RATE` | Acquirer License Fee | **0.0075%** of volume (commonly cited US reference) | Percent of volume | Mastercard does NOT publicly publish a single rate. Varies by acquirer volume tier. MerchantCostConsulting reports 0.0061% (TSYS) and 0.02% (Global). **MEDIUM confidence.** Flag any rate above 0.02% for review. |
| `LOCATION FEE` | Merchant Location Fee | **$1.25/location/month** | Per location, monthly | Swipesum reports $1.25. Billed annually (typically May) or monthly depending on processor. **MEDIUM confidence.** |
| `KILOBYTE AUTH FEE US` | Kilobyte Access / Connectivity Fee | **~$0.0023/auth** (effective per-auth average) | Per auth (approximately) | Rate is technically per kilobyte of data transmitted but effectively works out to ~$0.0023 per auth on typical transactions. Exact amount varies by data payload size. **MEDIUM confidence** on per-auth approximation. |
| `BIN ICA FEE` | BIN / ICA Service Fee | **Variable** (small, typically $0.01–$0.15) | Variable | No single public rate. **LOW confidence.** Classify as network pass-through but mark `not_proof_eligible`. |
| `DIGITAL ENABLEMENT FEE` | Digital Enablement Fee | **$0.025 minimum** (txns ≤ $100); **0.025%** of auth value (txns $100–$2,000); **$0.50 max** (txns ≥ $2,000) | Per CNP authorization | **UPDATED April 6, 2026.** Previous rate was 0.01%. New tiered structure per Wind River Payments April 2026 update. **HIGH confidence** (post-April 2026). |
| `CROSS BORDER ASSESSMENT` | Cross-Border Assessment (Domestic USD) | **0.60%** | Percent of cross-border volume | For US-acquired transactions with non-US card, settled in USD. **HIGH confidence.** |

**New Mastercard fees effective April 2026 (may appear on statements from June 2026 onward):**

| Fee | Rate | Description |
|---|---|---|
| Fallback Avoidance Fee | **0.10%** | Assessed when chip card is used with magnetic stripe at chip-enabled terminal |
| Force Post Transaction Fee | **$0.09/txn** | Clearing submitted without prior approved authorization |

### 5.2 Visa Network Fees

| Fee (Fiserv label) | Canonical Name | Rate | Type | Source & Confidence |
|---|---|---|---|---|
| `ACQR PROCESSOR FEES` (under VISA) | Acquirer Processing Fee — Credit | **$0.0195/auth** | Per authorization | Confirmed by Visa documentation references, CardFellow, MerchantCostConsulting, Swipesum, Paya/Nuvei. **HIGH confidence.** |
| `ACQR PROCESSOR FEES` (under VS OFLN DB) | Acquirer Processing Fee — Debit | **$0.0155/auth** | Per authorization | Same sources. Only applies to signature debit, NOT PIN debit. **HIGH confidence.** |
| `CR DUES AND ASSESS` | Visa Assessment — Credit | **0.14%** of gross credit volume | Percent of volume | Confirmed by multiple 2026 sources including Chargebacks911 (May 2026), Verisave (Feb 2026). **HIGH confidence.** |
| `DB DUES AND ASSESS` | Visa Assessment — Debit | **0.13%** of gross debit volume | Percent of volume | Same sources. **HIGH confidence.** |
| `FIXED NETWORK CP FEE` | Fixed Acquirer Network Fee (FANF) | **Tiered** — single CP location typically $2–$5/month | Per location, monthly | No single rate. Tiered by location count, MCC, volume. Exempt if monthly Visa CP volume < $200. **NOT proof-eligible** at a single rate. |
| `FILE TRANSMISSION FEE` | Base II System File Fee | **$0.0018/transaction** | Per transaction | Applies to all Visa transactions (sales, returns, reversals). **HIGH confidence.** |
| `INTERNTL ACQUIRER FEE` | International Acquirer Fee (IAF) | **0.45%** | Percent of international volume | Per Chargebacks911 (May 2026). **HIGH confidence.** |
| `ACQ ISA FEE` | International Service Assessment | **Variable** (0.3%–2.3% depending on settlement currency and region) | Percent of volume | Multiple tiers. **NOT proof-eligible** at a single rate. |
| `INTRNTL ACQ PROC FEE DB` | International Acquirer Processing Fee (Debit) | **Variable** | Per transaction | Not publicly fixed at a single rate. **LOW confidence.** |

**New/updated Visa fees effective April 2026:**

| Fee | Rate | Description |
|---|---|---|
| Digital Commerce Service Fee (DCSF) — Domestic | **0.015%** (min $0.01) | Increased from 0.0075%. Applies to all domestic CNP transactions. Replaces separate AVS and CVV2 fees. |
| Digital Commerce Service Fee (DCSF) — Cross-Border | **0.035%** (min $0.01) | Applies to all cross-border CNP transactions. |
| Consumer Enhanced Data Program Fee | **0.05%** | On transactions with enhanced data. Part of CEDP program. |
| Visa CP Token Fee | TBD (effective June 2026 per Moneris network fee updates) | Assessed on mobile wallet contactless transactions. |

### 5.3 American Express Network Fees (OptBlue)

| Fee (Fiserv label) | Canonical Name | Rate | Type | Source & Confidence |
|---|---|---|---|---|
| `NETWORK FEE` (under AMEXCT043) | OptBlue Assessment / Network Fee | **0.165%** of Amex volume | Percent of volume | Helcim publishes 0.165%. Some sources show 0.15%. Use **0.165%** for US market. **MEDIUM-HIGH confidence.** |
| `AMEX ACQR TRANSACTION FEE` | Acquirer Transaction Fee | **$0.02/transaction** | Per transaction | MerchantCostConsulting explicitly states $0.02 and warns about padding above this rate. **MEDIUM-HIGH confidence.** The Abdul Basher statement shows $0.04 (double). Flag any rate > $0.025 as `rate_exceeds_reference`. |
| `PROGRAM FEES` | OptBlue Interchange / Wholesale Discount | **Variable** by MCC, ticket size, program | Variable | Amex equivalent of interchange. Cannot verify at a single rate. **NOT proof-eligible.** |

### 5.4 Discover Network Fees

| Fee (Fiserv label) | Canonical Name | Rate | Type | Source & Confidence |
|---|---|---|---|---|
| `DSCV DATA USAGE FEE` | Data Usage Fee | **$0.0195/transaction** | Per transaction | CardFellow (March 2025) confirms $0.0195. Unchanged since 2018. **HIGH confidence.** |
| `DSCV AUTH FEE` | Network Authorization Fee | **$0.0025/auth** | Per authorization | CardFellow (March 2025) confirms $0.0025. Separate from Data Usage Fee. **HIGH confidence.** |
| `DUES & ASSESSMENTS` (under DCVR ACQ) | Discover Assessment | **0.13%** of gross Discover volume | Percent of volume | Confirmed by Paya/Nuvei support docs. **HIGH confidence.** |

---

## 6. Rate Verification Math (Padding Detection)

For each fee row classified as `card_brand_network`, run the following verification:

### 6.1 Per-Auth Fee Verification

Applies to: NABU, ACQR PROCESSOR FEES, DSCV AUTH FEE, AMEX ACQR TRANSACTION FEE, KILOBYTE AUTH FEE

```
expected_amount = auth_count × reference_rate
actual_amount = amount from statement
delta = actual_amount - expected_amount
delta_pct = abs(delta) / expected_amount × 100

if delta_pct <= tolerance:
    proof_status = "proven_at_cost"
elif actual_amount > expected_amount:
    proof_status = "rate_exceeds_reference"
elif actual_amount < expected_amount:
    proof_status = "below_reference"  // unusual but possible
```

**Worked example — NABU FEES from Abdul Basher:**
```
auth_count = 20 (from the "Volume" column)
reference_rate = $0.0195
expected = 20 × $0.0195 = $0.39
actual = $0.39
delta = $0.00
proof_status = "proven_at_cost" ✓
```

**Worked example — AMEX ACQR TRANSACTION FEE from Abdul Basher:**
```
auth_count = 2 (from the "Volume" column)
reference_rate = $0.02
expected = 2 × $0.02 = $0.04
actual = $0.08 (statement shows rate of $0.04/txn)
delta = $0.04
delta_pct = 100%
proof_status = "rate_exceeds_reference" ⚠️
finding = "Charged at $0.04/txn vs reference rate of $0.02/txn (2× reference)"
```

**Worked example — ACQR PROCESSOR FEES (Visa debit) from Abdul Basher:**
```
auth_count = 32
reference_rate = $0.0155 (debit rate, because section header is VS OFLN DB)
expected = 32 × $0.0155 = $0.496
actual = $0.50
delta = $0.004
delta_pct = 0.8%
proof_status = "proven_at_cost" ✓ (within rounding)
```

### 6.2 Percent-of-Volume Fee Verification

Applies to: DUES & ASSESSMENTS, CR/DB DUES AND ASSESS, LICENSE RATE, NETWORK FEE (Amex)

```
expected_amount = volume × reference_rate_pct
actual_amount = amount from statement
delta = actual_amount - expected_amount
delta_pct = abs(delta) / expected_amount × 100
```

**Worked example — CR DUES AND ASSESS (Visa credit) from Abdul Basher:**
```
volume = $396.73 (from the "Volume" column)
reference_rate = 0.0014 (0.14% for Visa credit)
expected = $396.73 × 0.0014 = $0.5554
actual = $0.56
delta = $0.0046
delta_pct = 0.8%
proof_status = "proven_at_cost" ✓
```

**Worked example — DB DUES AND ASSESS (Visa debit) from Abdul Basher:**
```
volume = $1,379.16
reference_rate = 0.0013 (0.13% for Visa debit)
expected = $1,379.16 × 0.0013 = $1.7929
actual = $1.79
delta = $0.0029
delta_pct = 0.2%
proof_status = "proven_at_cost" ✓
```

**Worked example — LICENSE RATE (Mastercard credit) from Abdul Basher:**
```
volume = $281.07
statement_rate = 0.0005 (0.05%, shown on statement)
reference_rate = 0.000075 (0.0075%, commonly cited US rate)
expected = $281.07 × 0.000075 = $0.02
actual = $0.14
delta = $0.12
proof_status = "rate_exceeds_reference" ⚠️
finding = "Statement rate 0.05% vs reference ~0.0075%. However, MC does
           not publish a single fixed rate for this fee. Confidence: MEDIUM.
           Flag for review but do not assert padding definitively."
```

### 6.3 Per-Transaction Fee Verification

Applies to: FILE TRANSMISSION FEE, DSCV DATA USAGE FEE

```
expected_amount = transaction_count × reference_rate
actual_amount = amount from statement
```

**Worked example — FILE TRANSMISSION FEE from Abdul Basher:**
```
// The statement shows this as a lump $0.10, not itemized per transaction
// Visa credit had 9 transactions
expected = 9 × $0.0018 = $0.0162
actual = $0.10
delta = $0.0838
proof_status = "rate_exceeds_reference" ⚠️
// However: could be charged across ALL Visa txns (9 credit + 32 debit = 41)
// Alternative: 41 × $0.0018 = $0.0738, still less than $0.10
// Could include other Visa transaction types (reversals, etc.)
// Confidence: MEDIUM. Flag but note uncertainty.
```

### 6.4 Tolerance Thresholds

| Rate confidence | Tolerance | Logic |
|---|---|---|
| HIGH | ±10% | Rate confirmed by 3+ independent sources and/or Fiserv published schedule |
| MEDIUM-HIGH | ±15% | Rate cited by 2+ sources, consistent arithmetic |
| MEDIUM | ±25% | Rate cited by sources but not officially published, or varies by acquirer |
| LOW | N/A | Rate not reliably known. Mark as `not_proof_eligible`. |

---

## 7. Processor Markup Detection

Processor markup fees have NO network reference rate. They are identified by what they are NOT (they don't match any known network fee) and by known patterns.

### 7.1 Known Fiserv Processor Markup Fee Labels

| Fiserv Label | What It Is | Typical Rate | Red Flags |
|---|---|---|---|
| `DISC 1` (also `DISC 2`, `DISC 3`) | Processor discount rate markup (percent of volume) | 0.05%–0.30% competitive; 0.30%+ expensive | If DISC rates differ across card types → tiered pricing (less transparent). If uniform → IC+ markup. |
| `OTHER ITEM FEES` | Processor per-item fee #1 | $0.05–$0.10 competitive; $0.10+ expensive | Stacks with CPU GTWY and SALES ITEMS |
| `CPU GTWY` | Processor gateway/authorization fee #2 | $0.02–$0.05 competitive; $0.10+ expensive | Second per-item fee, often stacks |
| `SALES ITEMS` | Processor per-item fee #3 | Should not exist separately if OTHER ITEM FEES already charged | Triple-stacking indicator |
| `BATCH HEADER` | Per-batch settlement fee | $0.10–$0.25 competitive; $0.35+ expensive | |
| `STATEMENT FEE` | Monthly statement fee | $5–$10 typical; $0 competitive | Often waivable |
| `REGULATORY PRODUCT` | Junk fee — no regulatory mandate | $0 (should not exist) | Pure processor revenue. No network or regulation requires this. |
| `OTHER VOLUME FEES` | Additional percentage markup (often on Amex) | Should not exist separately from DISC | Extra percentage on top of DISC |
| `PCI COMPLIANCE` / `PCI NON COMPLIANCE` | PCI program fee | $5–$15/month compliance; $19.95–$49.95 non-compliance | Non-compliance fees are punitive; compliance fees should be minimal |
| `ANNUAL FEE` / `MEMBERSHIP FEE` | Annual account fee | $49–$299/year | Pure processor revenue. Often waivable. MerchantCostConsulting reports CardConnect at $119, PNC at $109.95. |

### 7.2 Triple-Stack Detection

If a statement contains ALL THREE of: `OTHER ITEM FEES`, `CPU GTWY`, and `SALES ITEMS`, the merchant is being charged three separate per-item fees. Calculate the total per-item cost:

```
per_item_total = other_item_rate + cpu_gtwy_rate + sales_items_rate
```

Abdul Basher: $0.10 + $0.10 + $0.10 = **$0.30/transaction**

At a $42.38 average ticket:
```
per_item_as_pct = $0.30 / $42.38 = 0.71%
```

This means 0.71% of every sale goes to per-item processor fees alone, before the percentage markup. For context, competitive interchange-plus pricing has a TOTAL per-item fee of $0.05–$0.10 (one fee, not three stacked).

**Rule:** If total per-item processor fees exceed $0.15/transaction, flag as "excessive per-item stacking."

### 7.3 COMM CARD I/C Savings Adjustment Fee

Per MerchantCostConsulting (October 2025), Fiserv charges a fee where they keep a percentage (25%–75%) of Level 2/Level 3 interchange optimization savings. Look for labels containing:
- `COMM CARD`
- `I/C SAVINGS`
- `ADJ` followed by a percentage and `DISC RATE`

This is a processor fee disguised as a savings program. Classify as `processor_pct_markup`.

---

## 8. Pricing Model Detection

### 8.1 Interchange-Plus (IC+) Detection

**Positive signals (all must be present):**
1. DISC rate is uniform across ALL card-type sections (same basis-point markup everywhere)
2. INTERCHANGE is listed as a separate line item under each card type
3. An Interchange Charges/Program Fees detail table exists
4. Network fees (NABU, assessments, APF, etc.) are broken out individually

**Abdul Basher:** DISC 1 = 0.20% under all six card types. Interchange is listed separately. Detail table exists. Network fees are itemized. → **Interchange-plus pricing confirmed.**

### 8.2 Tiered Pricing Detection

**Positive signals:**
1. DISC rates differ across card types (e.g., DISC 1 = 1.69%, DISC 2 = 2.49%, DISC 3 = 3.49%)
2. Fee descriptions contain QUAL, MQUAL, NQUAL, QUALIFIED, MID-QUALIFIED, NON-QUALIFIED
3. Interchange is NOT broken out separately (bundled into the discount rate)

### 8.3 Flat-Rate Detection

**Positive signals:**
1. A single percentage appears with no interchange detail
2. Very simple fee structure (one or two lines total)
3. Common with Square, Stripe, PayPal — rare on Fiserv statements

---

## 9. Statement Notice Extraction

Fiserv statements include a text block (typically on page 1, after the summary) that announces upcoming fee changes. This block is NOT a table — it is free-form text.

### 9.1 What to Extract

Parse the notice block for:
- **Fee name** (e.g., "STAR PIN DEBIT NETWORK ANNUAL FEE")
- **Amount** (e.g., "$20.95")
- **Effective date** (e.g., "EFFECTIVE WITH YOUR OCTOBER 2025 STATEMENT")
- **Condition/trigger** (e.g., "PER ACTIVE LOCATION")
- **Acceptance clause** (e.g., "CONTINUING YOUR MERCHANT ACCOUNT... WILL REPRESENT YOUR ACCEPTANCE")
- **Action window** (e.g., "AFTER 30 DAYS")

### 9.2 Abdul Basher Notice Example

The August 2025 statement contains two upcoming fee announcements:

```json
{
  "notices": [
    {
      "fee_name": "STAR PIN DEBIT NETWORK ANNUAL FEE",
      "new_amount": 20.95,
      "change": "increasing by $2.00",
      "effective": "October 2025 statement",
      "condition": "per active location (any address/domain with 1+ STAR transactions June-August 2025)",
      "acceptance": "deemed acceptance after 30 days",
      "action_deadline": "30 days from statement date"
    },
    {
      "fee_name": "ACCEL PIN DEBIT NETWORK ANNUAL FEE",
      "new_amount": 21.95,
      "change": "increasing by $2.00",
      "effective": "October 2025 statement",
      "condition": "per active location (any address/domain with 1+ Accel transactions June-August 2025)",
      "acceptance": "deemed acceptance after 30 days",
      "action_deadline": "30 days from statement date"
    }
  ]
}
```

### 9.3 Notice Detection Patterns

Search the notice block for these regex patterns:
- Fee increase: `INCREASING BY`, `WILL BE ASSESSED`, `NEW FEE`, `RATE CHANGE`
- Effective date: `EFFECTIVE WITH YOUR [MONTH] [YEAR] STATEMENT`, `EFFECTIVE [DATE]`
- Acceptance: `CONTINUING YOUR MERCHANT ACCOUNT`, `ACCEPTANCE TO THESE TERMS`, `USE OF YOUR MERCHANT ACCOUNT`
- Action window: `AFTER [NUMBER] DAYS`

---

## 10. Known Fiserv Rate Increases (Historical Context)

Per MerchantCostConsulting (updated December 2025):

| Date | Change | Impact |
|---|---|---|
| March 2025 | +0.30% rate hike | Applied to processor discount markup across affected accounts |
| September 2025 | +0.10% + $0.10/transaction | Applied to some accounts |
| November 2025 | +0.10% + $0.10/transaction | Applied to remaining accounts |

If a statement from October 2025 shows DISC 1 at 0.30% and a statement from February 2025 showed 0.20%, this is a legitimate processor rate increase, not a billing error. Your tool should track these known increases to avoid false-positive padding alerts.

---

## 11. Residual Analysis (The Master Validation)

After classifying every fee row, verify that the buckets sum correctly:

```
interchange_total = sum of all rows classified as interchange
network_total = sum of all rows classified as card_brand_network
processor_total = sum of all rows classified as processor_*
other_total = sum of all rows classified as compliance_penalty, pin_debit_network, unknown

grand_total = interchange_total + network_total + processor_total + other_total

residual = abs(grand_total - statement_total_fees)
```

**Rule:** If residual > $1.00, something is misclassified. Investigate.

For Abdul Basher:
```
interchange = $35.94 (sum of INTERCHANGE lines + PROGRAM FEES)
network = $7.80 (assessments, NABU, APF, FANF, file fees, BIN, intl fees)
processor = $47.46 (DISC, items, gateway, batch, statement, regulatory, sales, other vol)
zero_amount = $0.00 (DSCV DATA USAGE rounded to zero)
total = $91.20 (detail sum), statement says $91.19
residual = $0.01 (rounding) ✓
```

---

## 12. Output Schema

For each analyzed statement, produce this JSON structure:

```json
{
  "statement": {
    "merchant_name": "XPRESS FIX",
    "merchant_number": "5189934211169970",
    "processor": "Fiserv",
    "iso": "Merchant One",
    "period": {"start": "2025-08-01", "end": "2025-08-31"},
    "pricing_model": "interchange_plus",
    "pricing_model_confidence": "high",
    "pricing_model_evidence": "Uniform DISC 1 at 0.20% across all card types + separate interchange lines"
  },
  "totals": {
    "volume": 2712.11,
    "transactions": 64,
    "average_ticket": 42.38,
    "total_fees": 91.19,
    "amount_funded": 2620.92,
    "effective_rate": 0.0336
  },
  "reconciliation": {
    "funding_check": "pass",
    "fee_total_check": "pass_with_rounding",
    "rounding_delta": 0.01,
    "interchange_cross_check": "pass",
    "interchange_cross_check_delta": 0.06,
    "batch_ledger_check": "pass"
  },
  "fee_classification": {
    "total_fee_rows": 51,
    "classified_rows": 51,
    "unresolved_rows": 0,
    "buckets": {
      "interchange": {"amount": 35.94, "rows": 6, "pct_of_fees": 39.4},
      "card_brand_network": {"amount": 7.80, "rows": 23, "pct_of_fees": 8.6},
      "processor_pct_markup": {"amount": 5.61, "rows": 7, "pct_of_fees": 6.2},
      "processor_per_item": {"amount": 27.90, "rows": 12, "pct_of_fees": 30.6},
      "processor_fixed": {"amount": 13.95, "rows": 2, "pct_of_fees": 15.3},
      "zero_amount": {"amount": 0.00, "rows": 1, "pct_of_fees": 0.0}
    }
  },
  "rate_verification": {
    "proven_at_cost": 10,
    "rate_exceeds_reference": 4,
    "not_proof_eligible": 6,
    "indeterminate": 3,
    "processor_controlled": 7,
    "findings": [
      {
        "fee": "AMEX ACQR TRANSACTION FEE",
        "section": "AMEXCT043",
        "statement_rate": 0.04,
        "reference_rate": 0.02,
        "excess_pct": 100,
        "excess_dollars": 0.04,
        "confidence": "medium-high",
        "finding": "Charged at $0.04/txn vs commonly reported $0.02/txn"
      }
    ]
  },
  "processor_cost_analysis": {
    "total_processor_controlled": 47.46,
    "processor_markup_rate": 0.0175,
    "per_item_stacking": {
      "detected": true,
      "fees": ["OTHER ITEM FEES ($0.10)", "CPU GTWY ($0.10)", "SALES ITEMS ($0.10)"],
      "total_per_item": 0.30,
      "per_item_as_pct_of_avg_ticket": 0.0071
    },
    "junk_fees": [
      {"name": "REGULATORY PRODUCT", "amount": 3.95, "reason": "No regulatory mandate for this fee"}
    ]
  },
  "notices": [],
  "annualized_estimates": {
    "annual_volume_estimate": 32545.32,
    "annual_fees_estimate": 1094.28,
    "annual_processor_controlled_estimate": 569.52,
    "potential_savings_range": {"low": 100, "high": 250}
  }
}
```

---

## 13. Confidence and Sourcing Policy

Every rate in the reference table must have a confidence level and sourcing chain. The tool's output must be honest about uncertainty.

**Language to use when confidence is HIGH:**
"This fee was verified against the published network rate of [X]. The charged amount matches / exceeds the reference."

**Language to use when confidence is MEDIUM:**
"This fee is commonly reported at [X] by multiple industry sources. The charged amount appears to exceed this reference. We recommend verifying with your processor."

**Language to use when confidence is LOW or NOT proof-eligible:**
"This fee could not be verified against a single published rate. It is classified as a network pass-through based on the fee name and context."

**Language to NEVER use:**
"Your processor is stealing from you." / "This is fraud." / "We guarantee this rate is wrong."

The tool provides evidence and analysis. The merchant and their advisor decide what to do with it.

---

## 14. Rate Update Cadence

Network fees are updated by the card networks primarily in **April and October** each year. Some changes take effect in January or July.

The reference table (`fiserv_fee_reference.json`) must be reviewed and updated:
- **After every April network cycle** (check by May 1)
- **After every October network cycle** (check by November 1)
- **When processing a statement that contains fee rows with rates not matching any reference** (add new entries to the table)
- **When a Fiserv statement notice announces upcoming fee changes** (add future-dated entries)

Sources to check during updates:
1. MerchantCostConsulting interchange updates: `https://merchantcostconsulting.com/lower-credit-card-processing-fees/2026-interchange-updates/`
2. Wind River Payments network fee updates: `https://www.windriverpayments.com/` (search for "interchange" or "network fee updates")
3. Moneris Payment Card Network Fee Updates: `https://www.moneris.com/en/support/additional-resources/payment-card-network-fee-updates`
4. CardFellow fee articles: `https://www.cardfellow.com/blog/` (search specific fee names)
5. Fiserv Canada Pass Through Fees page: `https://merchants.fiserv.com/en-ca/client-support/rates-fees/pass-through-fees/` — **USE FOR FEE NAME VALIDATION ONLY.** This page confirms which fee names are legitimate network pass-throughs (useful for classification). **DO NOT use any rates from this page for US rate verification.** The Canadian market has different rates than the US market (e.g., Canadian MC Assessment = 0.1017% vs US = 0.13%, Canadian Amex OptBlue = 0.12% vs US = 0.165%). Using Canadian rates would cause false padding alerts on US statements.
