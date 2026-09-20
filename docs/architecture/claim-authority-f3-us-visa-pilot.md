# F3 U.S. Visa governed-knowledge admission pilot

This is a three-record, shadow-only admission through the F3 version 2 snapshot interface. It is a manually reviewed pilot, not a general publication ingestion or approval workflow. Nothing here supplies a production decision, customer output, merchant contract finding, or F2 attestation.

## Source and provenance

- Publisher and lane: Visa; `governed_network_regulator`.
- First-party source: [Visa USA Interchange Reimbursement Fees](https://usa.visa.com/content/dam/VCOM/download/merchants/visa-usa-interchange-reimbursement-fees.pdf), Visa Supplemental Requirements, printed 18 April 2026. The introduction limits the tables to financial transactions completed within the 50 United States and the District of Columbia. The admitted rows are in “Visa U.S.A. Other Transactions Interchange Reimbursement Fees,” Credit Voucher table, printed page 20, PDF page 23.
- Captured source file: `data/authority/f3-us-visa-pilot/visa-usa-interchange-reimbursement-fees-2026-04-18.pdf`; SHA-256 `2c34e719746a8710e0f78342b9f435b637911f6ed072ae1b1728a06768b2b5bd` (877,295 bytes).
- The table explicitly says “Rates Effective April 18, 2026.” That is the effective **start**, not the publication date. The PDF prints 18 April 2026 as its document date. The captured URL's HTTP `Last-Modified` was Mon, 07 Sep 2026 13:13:20 GMT. F3 records 2026-09-07 as the conservative captured-version `source.publishedOn` gate. This server metadata is **not Visa's authoritative publication date**; it does not prove the exact bytes were available before that date or establish a fee end date. The byte retrieval was recorded at 2026-09-20T16:49:55.000Z.
- Admission decision `f3_us_visa_benchmark_admission_2026_09_20`, reviewer ID `product_authorized_f3_us_visa_pilot`, admission time 2026-09-20T17:07:32.752Z. Snapshot recording time 2026-09-20T17:07:32.753Z.
- Pinned snapshot file: `data/authority/f3-us-visa-pilot/snapshot.json`; ID `f3_snapshot_952b92bcb298bdf74f2f70e98a2418ad31691873ee6e5c4229e90f157d5ee22f`.

## Admitted facts

All three records have geography `US_50_STATES_DC`, network `visa`, program `visa_usa_other_transactions_credit_voucher`, fee identity `visa_usa_credit_voucher_interchange_reimbursement`, basis `credit_voucher_transaction_value`, unit `decimal_fraction`, and **only** the `benchmark` claim dimension. Each has `validPeriod: { state: "unresolved_end", start: "2026-04-18", end: null }`. The end is not inferred from later schedules or the retrieval date.

| Assertion ID | Exact Credit Voucher population | Published rate | Decimal value |
| --- | --- | ---: | ---: |
| `visa_us_credit_voucher_non_passenger_consumer_credit_2026_04_18` | Non-Passenger Transport — Consumer Credit | 1.76% | `0.0176` |
| `visa_us_credit_voucher_mail_phone_ecommerce_consumer_credit_2026_04_18` | Mail/Phone Order and eCommerce Merchants — Consumer Credit | 2.05% | `0.0205` |
| `visa_us_credit_voucher_debit_2026_04_18` | Credit Voucher — Debit | 0.00% | `0.0000` |

These are Visa interchange reimbursement benchmarks for the named transaction populations. Visa distinguishes interchange reimbursement paid between financial institutions from a merchant's discount. The records cannot establish a merchant-billed rate, network assessment, contractual correctness, pass-through, at-cost treatment, processor markup, retained profit, removability, negotiability, avoidable cost, or savings. They cannot authorize a `reference_comparison` claim because only `benchmark` was admitted. Merchant-private evidence remains in a separate unavailable port.

## Admission versus applicability

The snapshot validates and replays deterministically from its exact JSON and PDF hash. Each fact is admitted even though its end is unresolved. F3 refuses a pre-18-April-2026 period, refuses historical periods that start before the conservative captured-version publication gate, and returns `missing_authority/effective_end_unresolved` for an otherwise matching October 2026 monthly benchmark claim. An exact population or geography mismatch fails closed. The pilot test adds a **synthetic, test-only** independently sourced bounded assertion to a new snapshot to show how a later period can resolve without changing the original admitted record or snapshot. A contradictory synthetic assertion yields explicit, order-independent conflict. No synthetic source is admitted to the real pilot snapshot.
