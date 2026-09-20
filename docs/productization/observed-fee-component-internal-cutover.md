# Observed fee component: internal cutover review

## Implemented boundary

`consumeObservedFeeComponents` accepts only F4 `merchant_facing_fee_component` decisions. A positive decision means **this statement includes this fee component**. F4 requires a positive selected charge, canonical inclusion, an allowed contribution decision, and a source occurrence linked to page evidence. Every missing or refused decision remains `unknown`. The adapter returns this internal state separately from `CanonicalStatementAnalysis`; the report projection and opportunity engine receive the unchanged analysis.

The production worker can run the internal comparison with `RATEREVEAL_OBSERVED_FEE_COMPONENT_INTERNAL_ENABLED=true`. It logs counts only, never row IDs, labels, amounts, claims, or customer text. Failure is isolated from job completion. The flag is off by default pending Product review of this local implementation.

## Legacy markup consumer inventory

These are **two separate legacy streams**. Package D's selected canonical category and the older `AnalysisSummary` markup amounts must not be treated as one authority source.

The active upload path is `src/worker.ts` → `src/statementParserOrchestrator.ts` → `src/analyzer.ts` → `src/accountStore.ts`/`src/server.ts` reporting. The H1 `productionReportRuntime.ts` and `productionReportProjection.ts` are a separate canonical path; the current server does not call them. The worker's new, flagged F4 use records internal counts only and does not feed the active legacy summary.

| Effect | Exact current consumer | Retirement implication |
| --- | --- | --- |
| Package D semantic state | `src/canonical/feeOwnershipActionability.ts:389-405` selects `processor_markup`, processor ownership, and `potentially_actionable` from patterns. | Stop treating this selected tuple as positive markup/control authority; retain it temporarily as a comparison input. |
| Package D opportunity and actionability | `src/canonical/opportunityEngine.ts:250-267` copies selected ownership and ceiling; `src/canonical/opportunityPolicy.ts:151-159` uses them to set verification-only or excluded eligibility. `src/canonical/customerStateResolver.ts:55-62` consumes opportunity and classifications for guidance. | Replace each semantic dependency only after its own authority and Product policy are bound. No savings behavior changes in this slice. |
| Package D internal attention and research | `src/canonical/merchantAttention.ts:70-82,571-635` uses category, owner, and ceiling for priority, pricing review, potential negotiation, and evidence requirements. `src/canonical/feeKnowledgeResearch.ts:1450-1545` uses markup to prioritize and phrase research questions. | Keep selected category diagnostic; remove its ability to establish markup or negotiation eligibility when those decisions cut over. |
| Canonical report projection | `src/canonical/productionReportProjection.ts:274-312,324-340,408-428,638-642,688-695` turns selected category into a “Processor markup” composition bucket, finding, and charge label, alongside selected owner. `src/canonical/productionReportRuntime.ts:24-31` projects the unchanged analysis. | Gate markup and owner language independently before any customer projection cutover. |
| Older `AnalysisSummary` state | `src/analyzer.ts:570-587,978-985` derives `processorMarkupAudit` and explanatory text; `src/feeFacts.ts:145-158,264-279` and `src/twoBucketAnalysis.ts:334-361,369-381` classify processor markup and controlled totals. | Audit this stream independently; F4 row decisions do not validate aggregate markup amounts. |
| Older reports and customer wording | `src/reporting/buildSingleStatement.ts:231-239,327-354` emits an exact markup section when bps is positive; `src/reporting/policy.ts:752-786` groups fee rows as processor fees; `src/reporting/v1/buildReport.ts:1424,1504` maps processor fee and finding kinds. `src/fiservFeeAnalysis.ts:1440-1449,2125-2150` can produce processor-controlled language, estimated overpayment, negotiation, and avoidability findings. | Suppress or qualify each unsupported positive at its own projection boundary after evidence review; do not globally rename the bucket. |
| Persistence and multi-statement scoring | `src/accountStore.ts:314-347` derives stored markup amount/bps; `src/aggregateAudit.ts:108-110,195,356-376` uses bps in trends, score, and explanation; `src/server.ts:931-932,1385-1427` exposes stored markup and deltas. | Preserve stored historical values as legacy diagnostics while removing their authority for economic or customer claims in a later, reviewed migration. |

## Next safe retirement path

1. Verify the internal component decision on authenticated, source-mapped real cases. The current G1-G5/G7-G8 PDFs are **provisional repository fixtures**, not that gate; G6 and G9 remain unavailable for this calibration.
2. Compare each selected legacy `processor_markup` row with an independently authorized markup claim. A selected Package D category alone cannot satisfy the underlying-cost or merchant-private-control facet. Keep unresolved rows unknown and retain the raw charge and financial totals.
3. Retire positive markup authority at the internal semantic consumers first. Review canonical attention/actionability and the separate `AnalysisSummary` route independently; do not infer savings or ownership from the observed component.
4. After Product approves claim-readiness policy and source-backed coverage, gate each customer wording/report location. No customer projection is authorized by this change.
