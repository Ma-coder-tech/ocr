# Statement Structure and Printed Membership v1 — Product review

Evaluation completed on 5 September 2026. Work is disconnected and uncommitted. The slice demonstrates useful printed structure on new statements, with explicit limits. Engineering recommends completing coverage and headerless continuation before starting Financial Population and Semantic Scope v1.

## What was added

The prototype takes positioned, source-bound text fragments and produces logical rows, column assignments, table fragments, proposed page links, and explicit lists of the rows printed under each subtotal/total. Every cell retains original fragment references and raw text. The input packet retains the PDF byte hash, physical page numbers and coordinates.

Rows use text baselines and horizontal alignment. Explicit headers establish column bands. Multi-line headers retain their component fragments; repeated Items/Amount columns retain their parent gross-sales, refund or submitted labels. An unlabelled description column stays unlabelled. Dollar figures within a fee description stay there; the amount under the printed Amount header is a separate cell. A printed Volume column remains basis-or-volume: the structure layer does not decide its economic units.

Closely positioned pieces can form a row or a uniquely attached split label. Missing terminal amounts, overlaid text, incompatible fragments and uncertain wrapping prevent admission of the affected membership. Raw characters are preserved; spaces can be normalized separately, but missing decimal points or signs are not invented.

Totals contain explicit member-row references and, where supported, child-subtotal references. Open member runs and already closed subtotals are separate. Matching arithmetic never selects members or proves completeness. A correctly identified printed run may contain financially contradictory numbers, adjustments or a month-end charge; it does not become a verified financial population.

Page continuation requires adjacent pages, an open predecessor, matching scope, full header paths and aligned columns. A closed table or changed parent header rejects the join. Headerless fee continuation currently carries column proposals with unresolved scope. Even when those proposed cells are correct, its complete subtotal membership is withheld.

## Known failures

The six previously studied statements remained development/regression cases. All 12 preselected in-scope challenge anchors were recovered in accepted rows with the expected cells. This is not a whole-document accuracy score; card/day/submitted-table schemas were excluded before testing.

| Statement | Useful recovery | Remaining failure or uncertainty |
| --- | --- | --- |
| Priority | 34 printed funding rows across pages 3–4; fee groups of 12 and 2 rows, and their 14-row grand total | These 34 rows are not a claim of 34 financial batches; adjustment rows remain printed members |
| Paysafe February | 18 printed funding rows; fee basis stays separate from charge; repeated fee headers linked | Malformed amount text such as `-0 02` remains unresolved; affected fee subtotals/grand total withheld; source funding anomaly preserved |
| Paysafe zero-volume | The one printed month-end-charge funding row; fee groups of 2 and 4 and their 6-row grand total | No inference that the month-end charge is a settlement batch |
| BASYS | 44 batch-detail rows across pages 2–3; debit and equipment totals | Headerless transaction-fee membership unresolved; short account-fee continuation before Equipment is missed/unassigned |
| Clover October | 51 batch-detail rows across pages 2–3; 11 debit-fee and 14 account-fee members; embedded fee basis remains in description | Headerless transaction-fee scope unresolved |
| Clover November | 37 batch-detail rows across pages 2–3; 11 debit-fee and 14 account-fee members | Headerless transaction-fee scope and a problematic row remain unresolved |

Two extra adversarial checks exposed unsafe prototype behavior during review: changed parent headers could pass a continuation check, and a completed subtotal's members could enter the next subtotal after a page break. Both were corrected with general structural rules and regression coverage. Mixed grand-total scope with both closed children and an open run is now withheld. No merchant, fixture, source hash, amount target or file-name branch was added to the engine.

## Untouched statements and scored results

Product had no unused statements. We acquired a previously unstudied [Monroe Clerk public banking-procurement exhibit](https://monroe-clerk.com/uploads/documents/Questions_Answers_-_Monroe_County_Clerk_BOCC_RFP_Banking_Services_1.pdf), SHA256 `d052c1c0e137e0f0cd27a72daf2dac7a67b35b171a6fc78bee389cdd1e135016`. No known PDF byte duplicate or earlier account-text match was found in the inspected local corpus/evaluation records. An account exposed in the web search preview was excluded.

Selection followed physical order and printed pagination, not parsing success. Each complete statement was processed independently; original PDF pages and fragment IDs were retained. All 25 selected source pages were rendered and visually reviewed. Source-only gold records contain every detail cell and each total's expected member count in the selected tables. Gold was recorded before opening the corresponding structure outputs. Review had one reviewer, not independent double annotation.

| Cohort | Original physical pages | Reviewed detail rows | Exact total memberships | Status |
| --- | --- | --- | --- | --- |
| Freeman Justice Center, February/January/March 2023 | 145–149, 151–155, 157–161 | 185/185 correct cell assignments; 153 under explicit headers, 32 under inherited proposals | 7/9 accepted correctly; 2 unresolved | Untouched for first frozen implementation; regression evidence after safety correction |
| Board of County Commissioners, February/January/March 2023 | 255–257, 259–261, 263–266 | 34/34 correct, all under explicit headers | 9/9 accepted correctly | Fresh holdout after corrected implementation was frozen |

The first cohort contained 13 physical table fragments. Both real repeated-header batch continuations were accepted correctly. Both real headerless transaction-fee continuations remained unresolved; their complete sets contain 37 and 36 rows. Local proposed cells were correct, but the engine did not claim those full memberships. Its outputs still reproduce these results after correction.

The second cohort contained nine table regions, all recovered, with no extra detail rows or incorrect accepted memberships observed. The nine totals had the exact source member sets, not merely matching counts. Its colored-grid layout and smaller tables differed from the first cohort. It did not contain a positive multi-page batch/fee continuation; continuation evidence for the corrected version is therefore the earlier source regression set plus adversarial tests.

Across both cohorts the fee-basis amounts stayed in their description cells, separate from charged amounts. Adjacent card/day summaries, chargebacks, interchange detail and repeated fee-category summaries did not enter the tested member sets. That separation does not resolve whether different printed summaries represent overlapping financial populations.

These are six new statements from two merchant accounts in one public exhibit and related Fiserv layout variants, not six independent layout families. The fresh final cohort is small and simpler. No natural split-number/wrapped-row positive appeared there. Results demonstrate transfer of supported printed patterns to previously unstudied statements, not reliable understanding of all unfamiliar Fiserv statements.

## Extractors, provenance and authority

Existing PDF.js native geometry was sufficient for the positive results. This milestone did not run or integrate Docling, Camelot or pdfplumber as structure extractors, so it supplies no new evidence of their incremental benefit. PDFium was used only to render source pages for review. Other extractors could later propose positioned structures against the same source contract; their output would still require independent admission and coverage checks.

Replay reproduced all 12 saved known/new statement results exactly. Referenced cell text reverses to its source fragments, with no missing header references. The original public PDF hash and every selected packet's exact subset of the original native export were verified. Saved-result changes are checked by recomputation, not by trusting a recomputed hash supplied with the result.

This does not prove that extraction retained everything printed. An omitted whole source row cannot be discovered solely from a text packet. Some headings, page furniture and unsupported regions remain outside the structured output, although the original native packet is retained. A comprehensive accounting of assigned, excluded and unexplained source material remains a prerequisite.

All 664 preexisting inspected files remained byte-identical, and the tracked Git diff is identical to the starting diff. This work added only evaluation/review files and ignored artifacts. The Kernel, proof obligations, AI trust boundary, canonical path and five-fact authority are unchanged. The existing dirty work predates this milestone. No integration, AI/model work, OCR, frontend, benchmark, multi-statement feature, customer behavior, Production, deployment, PR, merge, commit or push was performed.

Validation: 24 structural/adversarial tests passed, including four added safety regressions; 69 existing Kernel/limited-authority/combined-semantics tests passed in an isolated copy of the current work. The first isolated run omitted required data assets and failed; adding those unchanged assets fixed the harness, without changing application code. Structure-only subprocess runs on the fresh three statements took approximately 0.09 seconds each; this excludes PDF extraction and is not a hosting or load benchmark.

## Recommended next milestone

**Printed Structure Coverage and Headerless Continuation v1.** Account for every source region, establish conservative start/end boundaries for headerless continuations, and distinguish a complete printed member set from a partial observed run. This should recover the missed BASYS account continuation and the unresolved Clover/public-statement transaction-fee scopes without accepting unrelated neighboring summaries. Keep mixed or contradictory scopes unresolved, and validate against newly reserved statements plus the existing negative cases.

That is the prerequisite before Financial Population and Semantic Scope v1. Financial population reasoning would otherwise receive incomplete or uncertain member sets and repeat the original failure at a higher layer. AI ranking/model work should remain paused. No extractor integration decision is needed to authorize that prerequisite.

This evaluation slice is complete and ready for Product review; whole-statement structural readiness is not established.

## Review and replay files

- `structure.py`: current disconnected engine. `native.mts`: standalone PDF.js evidence export.
- `test_structure.py`, `test_revision.py`: 24 tests. Run `python3 -m unittest discover -s evaluations/printed-membership-v1 -p 'test_*.py' -v` from this worktree.
- `protocol.md`, `frozen.json`: original freeze; its exact code and first-pass scores are preserved under `artifacts/printed-membership-v1/round-1/`.
- `round-2-protocol.md`, `frozen-v2.json`: corrected implementation's freeze, before supplemental source review. No changes to those frozen files after unblinding.
- `holdout-gold.json`, `holdout-v2-gold.json`: source-only annotations; explicit source coordinates exist only in evaluation gold, not engine dispatch.
- `score.py`: exact cell/member-set scoring. `audit.py`: source/hash/worktree boundary checks. `review_probes.py`: reproduces both safety checks against the current engine.
- `artifacts/printed-membership-v1/scores.json`, `boundary-audit.json`, `authority-tests-with-data.log`: final evidence. Saved packets, source PDF, rendered pages and both gold-before-engine hashes are beside them.

To regenerate one result: `python3 evaluations/printed-membership-v1/structure.py INPUT_NATIVE_JSON OUTPUT_STRUCTURE_JSON`. Then run `python3 evaluations/printed-membership-v1/score.py` and `python3 evaluations/printed-membership-v1/audit.py`. Run the native adapter with the existing Node 22 runtime: `/usr/local/bin/node --import tsx evaluations/printed-membership-v1/native.mts INPUT_PDF OUTPUT_NATIVE_JSON`. This is a disconnected evaluation command, not a runtime entry point.
