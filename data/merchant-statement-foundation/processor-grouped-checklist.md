# Processor-Grouped Merchant Statement Analysis Checklist

Source: /Users/martialmahougnonamoussou/Downloads/How to analyze a merchant statement.docx

## Heartland Payment Systems (Global Payments family)
- Verify the statement month is representative using the monthly sales graph before quoting savings.
- Capture interchange detail by card brand (Visa, Mastercard, Discover, AmEx): transaction count, volume, rate, per-item fee, total paid.
- Extract processor markup from HPS processing fees by brand and convert to basis points.
- Flag brand-level markup inconsistency, especially higher AmEx markup without justification.
- Flag over-market markup (source guidance: anything over ~70 bps is over-marked for most/new businesses).
- Detect monthly-vs-daily discount handling add-on and quantify extra bps (source example: +5 bps).
- Detect non-EMV fee trigger threshold (source example: >10% non-EMV share).
- Detect non-EMV fixed monthly fee (source example: $25).
- Detect non-EMV additional percentage markup on non-EMV/card-not-present volume (source example: +1%).
- Detect Customer Intelligence Suite recurring fee (source mentions around $55/month), confirm merchant usage, and flag auto-trial conversion risk.
- Run month-over-month new-fee appearance check and force explanation workflow.

## TSYS (Global Payments family)
- Capture card-type sales summary, credits, and total sales.
- Parse daily batch totals.
- Split blended pricing rows where top number is processor markup and bottom number is interchange.
- Normalize blended row outputs into interchange component and processor component.
- Confirm statement is truly interchange-plus/cost-plus after unbundling rows.
- Ensure markup and per-item economics are comparable to benchmark outputs after normalization.

## Fiserv / First Data (Interchange-Plus style statements)
- Scan fine print for explicit repricing notices and effective dates.
- Capture acceptance-by-use clauses in terms notices.
- Parse daily batch summary and fee sections.
- Identify processor markup lines (for example, service charge labeling) and normalize notation (for example, 0.008 -> 0.80% -> 80 bps).
- Check debit vs credit markup consistency and flag unjustified differential pricing.
- Detect downgrade indicators in descriptors (for example, non-qualified, EIRF).
- Estimate downgrade penalty impact (source guidance: ~0.3% to 0.4% extra).
- Detect "commercial card interchange savings adjustment" fee and quantify processor savings share retained (source example: 75%).
- Flag repricing or hidden-fee risk when fee increases are hard to identify or buried.

## Fiserv / First Data (Bundled style statements)
- Detect bundled model via qualified/mid-qualified/non-qualified bucket presentation.
- Capture bucket rates and volume/fee distributions by bucket.
- Flag processor-controlled bucket assignment risk.
- Flag over-market bundle rates (source examples around 4.09% mid-qualified and ~5% non-qualified).
- Mark bundled model as high overpayment risk compared to interchange-plus for most merchants.
- Recommend interchange-plus conversion analysis when bundled pricing is active.

## Clearent
- Extract assessment markup (source example: 64 bps) and per-item charge.
- Detect Express Merchant Funding fee and quantify faster-funding premium (source example: +5 bps).
- Detect monthly minimum required markup amount (source example: $25).
- Detect actual markup paid in the period.
- Detect monthly minimum top-up difference charged when actual markup is below minimum.
- Flag monthly minimum risk for lower-volume merchants (source note: common under roughly $55k/month).
- Detect PCI non-compliance fee and open compliance remediation workflow.
- Track PCI completion requirements (SAQ + vulnerability scans + recert cycle reminders).

## Worldpay
- Extract basis-point markup by brand (source example shown: 86 bps).
- Extract per-item transaction fee.
- Extract separate authorization fee and combine with transaction fee for true all-in per-item cost.
- Flag high all-in per-item fee burden (source example discussed: >$0.40 can be problematic; low-teens often expected in competitive setups).
- Prioritize per-item optimization for low-average-ticket merchants (source note: under ~$50 ticket size is especially sensitive).
- Detect monthly minimum charge language and assess effective-rate distortion.

## Elavon
- Parse summary sales/deposits and daily batch totals.
- Scan notices for billing changes, including online-only change disclosures.
- Extract basis-point markup and per-item transaction fee.
- Detect additional authorization fee section and combine with per-item transaction fee for true per-item total (source warning: 10 cents can effectively become ~20 cents).
- Flag transparency risk when fee-change details are not clearly disclosed on-statement.

## Mandatory Cross-Processor Checks (Apply to Every Processor Above)
- Compute net effective rate = total fees / total sales.
- Split all fees into card-brand costs vs processor-owned costs.
- Benchmark card-brand share and processor share against expected ranges from source context.
- Detect and classify unnecessary fees: non-EMV overlays, risk fees, unused intelligence suites, daily/monthly discount handling add-ons, avoidable PCI non-compliance charges.
- Detect hidden markup inside interchange presentation (advanced check).
- Detect month-over-month fee drift and newly introduced recurring fees.
- Enforce surcharge cap from source guidance (max 3%).
- Enforce debit exclusion from surcharging (never surcharge debit).
- Enforce uniform surcharge rule (if surcharging eligible credit, surcharge all eligible credit).
- Enforce robust debit identification controls (prefer BIN automation over manual-only handling).
- Trigger full review cadence at least every 6 to 12 months (source guidance).
