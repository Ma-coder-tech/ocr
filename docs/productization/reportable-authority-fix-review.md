# Reportable financial authority repair — Product review

## Decision and root cause

This isolated branch starts from the accepted Phase 0/1 state (`74ab30ee50b55cfb3d3d385f36c80714a44b8a4f`). The November finding from processor-neutral readiness commit `ef3947b5b4213a7798c87cbbaabc26eb2a8e1454` is treated as the defect evidence; the baseline was not redefined.

The legacy PDF orchestrator copied a validated parser's selected totals, rate, benchmark, savings, and fee details into `AnalysisSummary` even when its decision was `reportable=false`. That summary served two roles: internal parser observation and customer financial result. The worker then treated positive totals as a successful analysis, persisted customer-visible scalar columns, and could create a comparison. `toPublicReportSummary` and several saved-statement API routes projected the same values without checking the parser decision. An old customer-report policy exception also admitted a specific `needs_review` Fiserv path.

The parser observation remains intact internally. The new `customerFinancialsAuthorized` gate requires affirmative `reportable=true` for PDF statements, rejects any explicit `reportable=false` or `customerFacingTotalsAllowed=false` decision, and fails closed for PDF summaries missing a decision. Existing CSV summaries without a parser decision remain eligible. The same gate is enforced at worker completion, statement persistence and claim, public projections, report building, comparison adapters and storage, and aggregate audit input. Report V1 is given an unable-to-analyze projection when the summary lacks authority.

## Customer behavior

| Surface | Before | After for a nonreportable summary |
| --- | --- | --- |
| Job/history | Could appear completed with financial conclusions | Existing `failed` state; history retained with a review-required message |
| Public summary | Totals, effective rate, benchmark, and legacy savings exposed | Summary omitted |
| Customer report / Report V1 | Legacy exceptions or raw summary could reach report paths | Blocked customer report; unable-to-analyze Report V1 with no financial facts |
| Saved statement | Financial scalar columns written | New nonreportable result is never saved; old rows retained internally and read as unavailable with null customer financial fields |
| Statement detail API | Raw `analysisSummary` exposed | HTTP 409 with a redacted history placeholder |
| Comparison / aggregate audit | Untrusted rows could be used | Ineligible at write, read, and input-adapter boundaries |

The worker stores the rejected parser observation in the failed job for internal audit and stops before AI refinement, checklist, customer persistence, or comparison. A failed analysis is never claimable as the first saved statement. The UI labels the existing failed state “Unable to analyze”; no new Product state was introduced. A historical saved placeholder has no retry action because it is not itself a runnable job.

## Historical read-only audit

The repository's tracked `data/feeclear.sqlite` snapshot contains 9 saved PDF statements: 0 with an affirmative decision, 0 explicitly denied, and 9 with no parser decision. It contains 7 completed jobs: 2 affirmative, 5 missing a decision. Both stored comparisons involve at least one unauthorized saved row. Seven of the nine saved rows lack a matching source job, so their original decisions cannot be reconstructed reliably from that snapshot. This is a repository snapshot audit, not a production database census.

The repair does not rewrite or delete historical rows. Missing-decision PDFs are quarantined on customer reads, leaving the raw columns and JSON for restricted investigation. Existing comparisons remain stored but cannot be returned. The read-only audit is reproducible with `node --import tsx scripts/reportable-authority-history-audit.ts [database-path]`. A future historical backfill should require source evidence and an explicit Product decision; scalar values alone cannot establish reportability.

This conservative rule can hide historical reports that were actually valid. Existing saved rows still occupy their physical slots. Automatic sign-in claims cannot overwrite a quarantined first statement; there is no self-service recovery for those accounts in this package. Operations should review affected accounts and design a separately authorized reanalysis/replacement flow that preserves the original observation before restoring access.

## Authority and regression evidence

The frozen Phase 0/1 authority matrix replay passed for five fixtures against the accepted baseline, with byte-for-byte parity for active legacy analysis, canonical V1 and V2 facts, reconciliation, output permissions, processor-neutral shadow, and Claim & Authority. Its `assertNoClaimWidening` check passed. No canonical or Claim & Authority implementation was changed.

The customer projection replay covers the November Clover denial plus reportable Paysafe and BASYS examples. November's internal observation remains $53,291.02 volume, $1,330.96 fees, 2.5% effective rate, and $1,188.12 legacy annual savings. Those four values and its benchmark disappear from the public summary after the repair; customer report is blocked and Report V1 is unable to analyze. Paysafe and BASYS public totals, rates, benchmarks, and legacy savings are unchanged. No financial output or savings claim was newly granted. Reproduce with `node --import tsx scripts/reportable-authority-diff.ts`.

The Paysafe fixture still produces its pre-existing Report V1 validation error (`incomplete required advanced review requires low_confidence state`); this package does not change Report V1 rules. The frozen baseline replay confirms that projection is unchanged.

Focused tests cover explicit denial, missing PDF decision, independent totals flag, unchanged reportable/CSV projection, public report and direct customer report blocking, worker terminal state and retained internal summary, historical read-time scalar redaction, stored comparison suppression, persistence and comparison write guards, and canonical run retention. An HTTP route regression verifies that a historical denied row is redacted in the library and detail API, excluded from aggregate audit and stored comparison, and projected as failed in the job API. The archived Pepe November/December regression fixtures both carry `reportable=false`; the updated regression preserves those observations but asserts that neither enters comparison. The full repository suite and production/web builds are recorded in the final Product handoff.

## Validation result

- `npm run build`: passed.
- `npm run build:web:check`: passed, including web typecheck and production Vite build.
- `npm test`: passed across all 23 isolated processes, 254 test files, and 2,636 tests.
- Focused authority, historical API, report-boundary, aggregate, store, comparison-adapter, orchestrator, and real-pipeline regression tests: passed.
- `node --import tsx scripts/phase01-authority-matrix.ts`: `PHASE01_AUTHORITY_PARITY: 5 fixtures`; no active runtime, canonical financial, reconciliation, permission, Claim & Authority, or shadow diff; no claim widening.
- `node --import tsx scripts/reportable-authority-diff.ts`: 1 denied and 2 reportable cases; denied public financial output removed, reportable public fields unchanged, 0 newly granted financial outputs.
- `node --import tsx scripts/reportable-authority-history-audit.ts`: read-only tracked snapshot audit reported above.
- `git diff --check`: passed.

## Rollback and recommendation

This is a code-only change with no schema migration or historical rewrite, so the local commit can be reverted. Reverting the authority gate would restore the original leak; a production rollback should therefore use a fixed forward version or suspend affected financial surfaces until a replacement is ready.

The identified customer authority leak is closed by shared write, read, and downstream gates. The main remaining operational risk is conservative unavailability of historical PDF records with missing decisions. Product should review this package before authorizing any more processor-neutral readiness work or a separate historical recovery design. No Phase 2 permissions were changed.

## Changed files

Runtime: `src/customerFinancialAuthority.ts`, `src/customerFinancialProjection.ts`, `src/worker.ts`, `src/accountStore.ts`, `src/publicReport.ts`, `src/reporting/policy.ts`, `src/reporting/buildSingleStatement.ts`, `src/server.ts`, `src/aggregateAudit.ts`, `src/multiStatementComparisonInput.ts`, `src/multiStatementOrchestrator.ts`, `public/statements.html`.

Regression and evidence: `test/customerFinancialAuthority.test.ts`, `test/accountStore.test.ts`, `test/aggregateAudit.test.ts`, `test/publicReport.test.ts`, `test/statementRoutes.test.ts`, `test/multiStatementOrchestrator.test.ts`, `test/multiStatementRealPipelineRegression.test.ts`, `scripts/reportable-authority-history-audit.ts`, `scripts/reportable-authority-diff.ts`, and this review note.
