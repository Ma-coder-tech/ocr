# First narrow Phase 2 customer implementation — Product review

Status: local implementation branch `codex/phase2-fee-customer` from verified `origin/main` `4f6a4bc637c468eae58a2a51f5e3c9c608c7537c`. The research commits `a883e732`, `1abbfdf7`, `6e923bb`, and `a8a4b4a` were inspected as engineering inputs, not merged or cherry-picked. This is a default-off implementation. It has not been pushed, merged, deployed, or enabled in production.

## Architecture and scope

The ported foundation comprises the generic evidence packet, document class routing hint, neutral core, proof ID, direct source/page/period proof, current Fiserv card/fee adapter, and HPS shadow package. The Fiserv card binding remains a transitional compatibility implementation behind the neutral proposal interface. The HPS package remains shadow only; its facts are never on the Product fee allowlist. No old `engine.ts`, `engineCore.ts`, `installedProtocols.ts`, or `protocolRouting.ts` research compatibility module was ported. The old 29-case fixture definitions were adapted into an evaluation-only neutral mutation script. Public corpus parity uses a frozen mapping of the reviewed research outputs instead of importing the old engine into production.

For a new PDF upload, the worker reads one immutable byte snapshot, parses it once with the current PDF.js row parser, and runs the fee proof over those parsed rows and the same snapshot hash. Production does not run the research token-extraction pass. The evidence packet explicitly has no token-to-row/cell relation; it does not invent one. The original research helper remains available only for test parity and extraction measurement. The feature has no OCR lane. A strict source-bound Fiserv Product identity rule is an independent gate, in addition to direct fee proof; a package match or brand text alone cannot qualify a statement.

The fact is a **bounded aggregate of declared processing fee charge components as printed in the fee section**, independently checked against the printed statement summary. Its source amount is a negative debit in minor units. The customer display is the positive magnitude of that debit, still marked only with the printed `$` symbol; ISO currency is unresolved. The statement header provides printed period context. Fee earning period, posting period, compatibility with card activity, occurrence-level completeness, processor ownership, and backend processor identity remain unresolved. The aggregate does not authorize an effective rate or a complete fee inventory.

The internal audit in `analysis_jobs.phase2_fee_audit_json` contains the source hash/reference, source debit, display transformation, printed period/evidence refs, bounded population, proof ID, package/rule versions, independent control refs, permission version and withholding reasons. The upload cleanup now retains the immutable PDF while a completed or partial job holds an eligible fee audit, so the source and proof can be replayed for the lifetime of that job record. Anonymous terminal jobs retain their existing expiry; when the job is pruned, normal file cleanup resumes. The public `phase2FeeFact` field contains only the charge magnitude, printed `$`, printed statement dates, bounded scope, `completeFeeOccurrenceInventory:false`, and permission version. It does not expose the source hash, proof vector, internal refs, processor attribution, or a broad total-fees field.

`RATEREVEAL_PHASE2_FEE_CHARGE_V1_ENABLED=true` is the sole v1 enablement. It defaults off. Computation runs only for new uploads while enabled; every job API projection checks the switch again. Turning it off immediately hides an already persisted fact and maps a partial job back to the prior failed customer state. Re-enabling it restores the isolated projection while the job remains within its retention. Normal completed/reportable analyses keep their existing job state and broad projection. No saved-statement row, canonical analysis, reconciliation, comparison, aggregate audit, or Claim & Authority output is written from the fee fact.

When the broad parser decision is nonreportable and this one fact passes, the worker records the distinct terminal job state `fee_fact_available`; it does not mark full analysis completed or save the statement. The authenticated and anonymous job APIs may return the isolated fact for their respective authorized job viewer. The authenticated statement library labels the unsaved job “One fee fact,” keeps volume/legacy fees/rate unavailable, and links to the partial result. The anonymous React app and authenticated dashboard show a dedicated result instead of a report. Report V1 remains unavailable or `unable_to_analyze` under its existing flag and policy. The customer report, comparison, aggregate audit, historical saved records and broad public summary retain their previous quarantine rules.

Proposed customer wording:

> **Processing fee charges shown on this statement: $X.** This is one charge amount verified from the statement’s fee section and summary. A full processing cost analysis is unavailable for this statement. The statement period shown is [start] to [end]; the dates when individual fees were earned or posted are not established.

On an otherwise complete reportable analysis, the same fact appears in a separate card. It does not replace the report's legacy fee metric. The partial result has no benchmark, rate, savings, negotiation guidance, report download, or processor attribution.

## Acceptance evidence

| Requirement | Result |
| --- | --- |
| Supported Fiserv | November Clover and Sample Clover have source-bound direct fee proof and strict Product identity. |
| BASYS / Priority | BASYS direct fee proof remains customer-withheld for missing strict source origin. Priority has no proven fee aggregate and also lacks strict origin. |
| Heartland / Elavon | Three HPS statements retain three shadow activity facts each with no fee permission. Elavon is unknown protocol with zero admission. |
| Banks / image-only | Readable Chase and Navy Federal are nonmerchant; image-only Chase is unknown under PDF.js; no merchant fee permission. |
| Nonreportable November | Internal terminal state is `fee_fact_available` under test flag. Broad parser remains `reportable=false`; no saved statement, public broad summary, customer report metrics, Report V1 financial prerequisites, comparison, or aggregate input is granted. |
| Kill switch | A persisted partial job projects its fact only while the v1 flag is on; off maps customer status to failed and returns no fact; on restores the isolated fact. A reportable completed job stays completed while the switch changes. |
| Direct-proof parity | Fifteen public statement fixtures replay 12 proven neutral facts against frozen pre-integration research values and states. Only two pass the customer fee gate. |
| Contrasts / mutations | Four public reference/pricing PDFs have zero admissions. Twenty-nine mutation/adversarial cases preserve scoped proofs and withholding. Private Heartland/Elavon/bank contrasts also have zero customer fee admissions. |
| Authority | Phase 0/1 five-fixture replay unchanged; reportable-authority diff grants zero new broad financial outputs. Canonical, reconciliation, and Claim & Authority code was not edited. |

Extraction measurements used four iterations per mode (first warm-up excluded), the same two public fixtures, and separate Node processes. The Sample median was 118 ms for the existing parse, 127 ms for parse plus reused-row proof, and 389 ms for the old research three-pass path. November medians were 79, 199, and 277 ms respectively; November's reuse measurements varied from 110 to 205 ms. These are local wall times, not production latency guarantees. Sampled RSS deltas were 0–4 MiB across the runs, but process final RSS varied substantially with PDF.js/native caching, so the short sample cannot establish a stable memory saving. The architectural reduction is exact: production uses one PDF.js extraction pass rather than three, and retains the immutable snapshot long enough for SHA/proof replay. Further load measurement on larger statements remains prudent before flag activation.

## Integration sequence, rollback and risks

1. Review and integrate the generic evidence/core and its frozen authority/parity/mutation harnesses, then the current Fiserv adapter. Keep HPS customer authority absent and its package shadow only. Retain the card compatibility binder until native neutral Fiserv proof reaches identical corpus parity; retire it in a separate reviewed change.
2. Review the isolated fee candidate, strict Product support gate, versioned permission, job audit column and terminal partial state. Confirm job API and two UI projections. The customer feature remains default off after merge.
3. Enable only after Product approves the final wording and deployment plan. Roll back by removing `RATEREVEAL_PHASE2_FEE_CHARGE_V1_ENABLED=true`; the public job projections immediately hide the fact, partial jobs revert to failed customer status, and canonical/historical data is untouched.

The main bounded risks are the temporary Fiserv card compatibility binder, absent token-to-row/cell relation, local benchmark variability, retained PDF storage for long-lived authenticated fee jobs, and the new partial job state across all product clients. The added tests cover the current web and API consumers; future clients must treat `fee_fact_available` as a terminal limited result, never full completion. Neither a direct fee proof on BASYS nor a shadow HPS proof widens Product support.

## Final gate and engineering recommendation

The frozen candidate passed the production build, web typecheck and web build. The full test suite passed **257 files / 2,648 tests in 26 isolated processes**, including all new fee proof, worker, API and web tests. The previous timeout-sensitive tests passed in dedicated fresh processes without longer assertion timeouts. The five-fixture Phase 0/1 authority matrix replay passed; the reportable-authority diff recorded `newlyGrantedFinancialOutputs:0`; the 15-PDF public corpus recorded 12 unchanged neutral facts, two Product-qualified fee candidates and zero reference admissions; the 29 adversarial mutations passed. Three HPS, Elavon, and bank private contrasts were replayed with zero customer fee admissions. `git diff --check` passed. No canonical financial, reconciliation, Claim & Authority, comparison, aggregate audit, Report V1 or savings source file changed. Under the test flag, the only new customer output permission is the isolated printed fee fact for the two strictly supported positive cases. With the flag off, that permission returns to zero.

**Final engineering recommendation: READY TO INTEGRATE for Product review, with the flag kept off.** Prefer a foundation review followed by a dependent customer-capability review, using the two local commits as the split. No PR was created in this task. Product should approve final wording and the integration/activation sequence separately; merging code is not activation. The rollback is the one environment switch, confirmed by on/off/on job and API tests. The remaining performance and storage observations are documented above; they do not authorize family expansion, historical recovery, effective rate or any savings claim.

Exact changed files against the verified main base (37):

```text
.env.example
docs/architecture/phase2-fee-customer-implementation.md
public/analyze-second.html
public/statements.html
scripts/benchmark-phase2-fee-extraction.ts
scripts/phase2-fee-corpus.ts
scripts/phase2-fee-mutations.ts
scripts/run-test-baseline.mjs
src/customerFinancialProjection.ts
src/db.ts
src/phase2FeeFact.ts
src/processorNeutral/directProof/cardActivityPackage.ts
src/processorNeutral/directProof/cardActivityProof.ts
src/processorNeutral/directProof/documentUnderstanding.ts
src/processorNeutral/directProof/evidence.ts
src/processorNeutral/directProof/heartlandPackage.ts
src/processorNeutral/directProof/neutralContracts.ts
src/processorNeutral/directProof/neutralCore.ts
src/processorNeutral/directProof/neutralEngine.ts
src/processorNeutral/directProof/neutralEvidence.ts
src/processorNeutral/directProof/neutralInstalledProtocols.ts
src/processorNeutral/directProof/neutralProofId.ts
src/processorNeutral/directProof/types.ts
src/processorNeutral/feeFactCandidate.ts
src/server.ts
src/store.ts
src/types.ts
src/worker.ts
test/phase2FeeFact.test.ts
test/phase2FeeWorker.test.ts
test/statementRoutes.test.ts
web/src/App.tsx
web/src/Phase2FeeFactResult.tsx
web/src/ResultsScreen.tsx
web/src/phase2FeeFactView.test.tsx
web/src/reportAdapter.ts
web/src/styles.css
```
