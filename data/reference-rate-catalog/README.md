# Reference Rate Catalog

This folder documents source-backed rate references used by the fee classifier.

The current source file is:

- `data/reference-rate-sources/wells-fargo-merchant-passthrough-fees-2026-04.pdf`

Important guardrails:

- The Wells Fargo schedule is effective April 2026. It cannot prove at-cost treatment for 2024 statements.
- Source-backed rows can only prove a line when the statement period falls inside the row's effective date range.
- Processor fees, flat discount fees, tiered discount buckets, and lump interchange totals are not proved at cost by this catalog.
- Acquirer-specific or processor-specific rows must not be treated as portable unless the statement context proves the same acquirer or processor applies.

The catalog is implemented in `src/referenceRateCatalogData.ts` so TypeScript tests can validate the matching rules directly.
