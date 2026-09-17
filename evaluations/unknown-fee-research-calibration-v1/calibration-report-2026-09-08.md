# Unknown-Fee Research Calibration & Retrieval Strategy v1

Evaluation date: 2026-09-08

Baseline: `49b7ed81a4a4100bc383fe3a02f2332d66cbfd01`

Baseline remote: `origin/codex/open-world-determinant-unknown-fee-analysis-v1`

## 1. Preserved baseline

The accepted Open-World checkpoint was pushed before follow-up implementation. The remote branch resolved to the exact baseline SHA and the new milestone began from that commit on `codex/unknown-fee-research-calibration-retrieval-strategy-v1`.

## 2. Implemented behavior

Each material fee now receives a typed Stage-0 plan before external work. The plan records determinant sufficiency, whether exact identity would change the merchant conclusion, the fee research type, distinct hypothesis-driven query shapes, document-genre priorities, a bounded budget, and an explicit stop reason. The internal analyst research queue contains the calibrated plan but does not execute it while deterministic findings are built.

The execution runner separates candidate discovery, safe public-document retrieval, and optional candidate synthesis. It permits at most two candidates per search, no retries, no fallback, two or three document fetches, one synthesis, and no more than eight request/fetch operations for a fee. Search utility never constitutes admitted authority. Results are candidate-only and cannot mutate canonical facts or reusable knowledge.

## 3. Query routing

- Proprietary/branded: exact phrase, processor plus phrase, code plus processor/document genre, and same-platform statement. `MCVDB` explicitly permits `AMDS` as a retrieval hypothesis without asserting an alias.
- Generic descriptive: statement mechanic/population and processor fee/pricing schedule; structural analysis is preferred when already sufficient.
- Abbreviated/coded: exact code, code plus processor and application/schedule/guide genres, and same-platform statements.
- Network-looking: network, statement period, U.S. scope, product/mechanic, and dated schedule/change-notice shapes.
- Third-party/service: provider/service documentation and controller hypotheses, but only after Stage 0.
- Unfamiliar per-item/recurring: exact label, statement mechanic/population/section, and processor schedule.

## 4. Corpus calibration

The full 11-statement supported Fiserv Gold corpus retained all Open-World financial and determinant metrics: 483 material fee rows, 90 exact identities, 244 family-known/identity-unresolved rows, 149 identity-and-layer-unresolved rows, 265 determinant-sufficient rows, and 326 actionable classifications. Canonical financial truth changed on zero statements.

Stage 0 reduced per-fee external-research candidates from 200 to 168. It stopped 315 of 483 rows without external work and suppressed 32 prior escalations. No new escalation was introduced. Of the 168 research plans, 21 used two query shapes, 76 used three, and 71 used four; none exceeded eight operations. Stopped plans had zero external budget.

Research-type incidence among the 168 selected rows was overlapping: proprietary/branded 6, generic descriptive 25, abbreviated/coded 69, network-looking 108, third-party/service 0, and unfamiliar per-item/recurring 39. The absence of a third-party/service external case reflects determinant sufficiency in the current corpus, not lack of routing support.

## 5. Controlled live evaluation

The authorized run used four live cases and one Stage-0 control.

| Case | Searches | Fetches | Synthesis | Total | Result | Candidate D1-D4/action lift |
|---|---:|---:|---:|---:|---|---|
| Monthly Advantage Fee / MCVDB-AMDS hypothesis | 4 | 3 | 0 | 7 | `S4_SOURCE_QUALITY_FAILURE` | none |
| Batch Settlement Fee | 3 | 3 | 0 | 6 | `S4_SOURCE_QUALITY_FAILURE` | none |
| Application Fee | 2 | 2 | 1 | 5 | `S3_RESEARCH_STAGNATION` | none |
| AMEXCT043 / NQUAL | 3 | 3 | 0 | 6 | `S4_SOURCE_QUALITY_FAILURE` | none |
| CPU GTWY third-party/service control | 0 | 0 | 0 | 0 | `S1_DETERMINANT_SUFFICIENCY` | not researched |

Total: 12 distinct query-shape requests, 11 public-document fetches, one synthesis, and 24 external request/fetch operations. Every fee remained within its individual cap. There were no retries and no fallback. The 13 OpenAI requests (12 search and one synthesis) recorded 23 provider-internal `web_search_call` events; those internal actions are reported separately from the runner's distinct query-shape operation ledger.

The OpenAI requests used `store: false`. The payload contained only processor name, year, statement role, sanitized label, amount-free query hypothesis/mechanic, document genre, and retrieved public excerpts. Merchant identity, account data, counts, rates, amounts, and whole-statement content were excluded.

## 6. Sources and applicability

Eleven candidate documents were fetched: seven processor-owned, two same-platform public statements, and two generic/navigation sources. Zero were admitted as authority. Two Fiserv documents contained generic Application Fee text, making the mechanic/population search shape useful for navigation, but they were Australia and India materials and did not establish U.S. applicability. Synthesis correctly proposed no determinant or action lift.

Monthly Advantage retrieval produced Clover pricing, an unrelated Clover Health page, and a same-platform Scribd statement; none established MCVDB/AMDS identity or applicability. Batch Settlement produced a U.K. Clover schedule that returned HTTP 406, general Clover pricing, and unrelated Clover Health content. AMEXCT043 retrieval produced two general Paysafe statement-help pages and a public statement, none specific enough to establish the code's meaning.

The live result exposed and corrected one local source-lane bug: a processor-name substring had initially treated `cloverhealth.com` and a Scribd title as processor-owned. Source classification now requires a known processor hostname or an explicitly official processor title. The durable result reflects the corrected lanes without repeating any external request.

## 7. Research-quality metrics

- Determinant lift: 0 of 4 researched cases.
- Action lift: 0 of 4.
- Governed confidence changes: 0 of 5 evaluated cases.
- Evidence-tier improvements: 0 of 4 researched cases.
- Research efficiency: 0 improved cases / 24 operations.
- Wasted-budget rate: 0%; the determinant-sufficient service control consumed no external budget.
- Correction/reversal ledger: 0 downgraded, 0 corrected, 0 reversed during this run.
- Query-shape utility: mechanic/population produced superficially relevant text in 1 of 2 executions; exact phrase 0/3, processor exact 0/1, code-plus-document 0/2, same-platform 0/2, and processor schedule 0/2. No shape produced admitted authority.

## 8. Candidate reusable knowledge

No reusable fee identity or determinant claim met even candidate-quality output requirements in this run. The AU/India Application Fee documents are document-genre leads only. Nothing was auto-admitted.

## 9. Failed cases

The three S4 cases failed because the best bounded retrievals were irrelevant, geographically mismatched, inaccessible, or insufficiently specific to the printed label and statement structure. Application Fee reached a synthesis call because two processor documents contained the generic phrase, but no evidence/confidence tier improved after applicability review, so it stopped for stagnation. These are valid calibrated failures rather than forced resolutions.

## 10. Invariants and regressions

- Canonical fingerprint changes: 0 cases and 0 corpus statements.
- Governed D1-D4 changes from live research: 0.
- Governed confidence changes from live research: 0.
- Reusable knowledge self-admissions: 0.
- `LAYER_UNRESOLVED`, family-known/identity-unresolved, line-to-fee cardinality, acquiring-side affirmative evidence, negotiability separation, claim-constrained rendering, and dollar coverage remain unchanged.
- The stale corpus expectation that all 200 Open-World escalations must enter external research was replaced with 168 calibrated entries and an explicit 32-row Stage-0 suppression assertion.

## 11. Remaining limitations and architecture conflicts

- Search-candidate relevance is still weaker than document applicability. Geography, product/template, and effective-period applicability should become first-class ranking inputs before synthesis.
- Public processor applications and schedules are fragmented by country and partner; processor ownership alone is not evidence of U.S. applicability.
- Search providers may perform multiple internal web actions inside one bounded query-shape request; both counts must remain visible.
- The calibrated runner is reusable but deliberately is not invoked automatically by the deterministic report builder.
- The corpus currently offers no third-party/service case that passes Stage 0, so that route is unit-tested but not externally calibrated.

## 12. Recommendation

The next Product milestone should be **U.S. Processor Document Applicability and Source-Adjudication v1**: assemble and domain-review a small processor-independent source packet for U.S. Fiserv/Clover/Paysafe merchant applications, fee schedules, program/statement guides, and same-platform exemplars; add explicit geography, processor/template, period, and product applicability decisions; then re-run only these unresolved cases. This should precede broader fee-dictionary expansion or commercial norm work.
