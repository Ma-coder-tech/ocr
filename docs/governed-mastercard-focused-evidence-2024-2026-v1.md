# Governed Mastercard Focused Evidence 2024–2026 v1

Status: implemented for internal analyst evaluation only. It has no customer-report or production authority.

## Authority and composition

The milestone admits the final Product-adjudicated v2 package, fingerprint `0de1b4b1a724cf596bf05a0e8beba276c0fa9c1a9e363e7ff363562dbf17614a`, as a derived layer within `GovernedPaymentKnowledgeAuthority`. It composes the existing U.S. network evidence; it does not create a second callable truth authority.

Retained source records are immutable. In particular, the existing Fiserv source assertion `8393 and 8661` and the retained Nuvei/Paya assertion `8938 and 8661` remain verbatim. The canonical Product correction to `8398 and 8661` exists only in the focused adjudication result.

## Admitted records and rules

The catalog admits nine Product decisions, each with a matching rule:

| Record | Rule | Admitted disposition |
| --- | --- | --- |
| MC-FOCUSED-01 | RR-MCF-01 | 2024 U.S. Acquirer Brand Volume Fee increased from 0.13% to 0.14%; April 5/April 15 remains an early-April date conflict. |
| MC-FOCUSED-02 | RR-MCF-02 | The September 2024 0.1475% line is strongly explained by 0.14% ABVF plus a plausible 0.0075% ALF component; it is not an above-reference candidate. |
| MC-FOCUSED-03 | RR-MCF-03 | Mastercard Location Fee reference is $1.25 per qualifying location/month. |
| MC-FOCUSED-04 | RR-MCF-04 | Canonical exclusions are under $200 Mastercard monthly volume, MCC 8398, and MCC 8661, with raw source variants preserved. |
| MC-FOCUSED-05 | RR-MCF-05 | A 2025 $3.00 Location Fee is above the available reference; acquiring-side uplift is LIKELY, not confirmed. |
| MC-FOCUSED-06 | RR-MCF-06 | Non-U.S. NABU is $0.0295 per transaction from April 15, 2024 for U.S.-merchant/non-U.S.-issuer scope, supported by processor/platform evidence. |
| MC-FOCUSED-07 | RR-MCF-07 | The current 2026 Mastercard assessment remains unresolved; neither 0.1375% nor 0.1475% is admitted. |
| MC-FOCUSED-08 | RR-MCF-08 | Line-to-fee cardinality and bidirectional residual decomposition precede markup/undercharge inference; exact math alone is not proof. |
| MC-FOCUSED-09 | RR-MCF-09 | Candidate counts require distinct statement and fee-row source occurrences. |

## Corpus impact

The focused suite runs all 11 supported Fiserv Gold PDFs. Canonical financial fingerprints are identical before and after every analyst run.

| Measure | Before focused adjudication | After |
| --- | ---: | ---: |
| Material findings | 483 | 483 |
| Exact identities | 89 | 89 |
| Category-only findings | 92 | 92 |
| Fully unresolved findings | 302 | 302 |
| Ambiguous/competing findings | 94 | 93 |
| Above-reference candidates | 3 | 2 |
| High-priority network research items | 3 | 2 |
| Corpus research queue | 402 | 401 |
| Confirmed at-par findings | 0 | 0 |
| Confirmed markup findings | 0 | 0 |

The removed candidate is the September 2024 0.1475% Mastercard assessment. Its 0.000075 residual exactly matches a documented candidate component, but the implementation also requires independent existence, same network/program/period, documented range, and statement-structure corroboration. The result remains `bundledComponentProven: false`, `confirmedAtPar: false`, and `markupEstablished: false` because the acquirer-specific schedule is absent.

After source-occurrence verification, the two remaining candidates are distinct:

- October 2025, statement `doc_19a4477fecfb1432`: Mastercard Location Fee $3.00 versus the $1.25 available reference.
- September 2025, statement `doc_1d37bac7aeadf39c`: Mastercard Location Fee $3.00 versus the $1.25 available reference.

Both carry `LIKELY` acquiring-side uplift, unresolved line composition, unresolved contract compliance, and unresolved beneficiary/retention of the excess. Their merchant action is to request the period/program price construction and does not require the merchant agreement; a breach or remedy conclusion does.

The non-material Wells Fargo non-U.S. NABU row now resolves at the authority level to $0.0295 per transaction effective April 15, 2024, with processor/platform—not Mastercard-primary—source classification.

## Verification

- `npm run build`: passed.
- Six focused and predecessor analyst-knowledge suites: 6 files, 14 tests passed.
- Focused Mastercard plus U.S. network corpus rerun after final cardinality tightening: 2 files, 5 tests passed.
- `git diff --check`: passed.
- The legacy `npm run evaluate:internal-analyst-finding` harness still reports its two pre-existing post-Batch-2 expectation failures (`unfamiliarFeeResolvedThroughGovernedResearch` and `unresolvedMaterialIssueQueuedForBoundedResearch`). Its other acceptance checks pass; this focused milestone does not alter those CPU-gateway fixtures or broaden scope to repair the legacy harness.

## Remaining gaps

- A September 2024 Wells Fargo/Fiserv schedule confirming whether the 0.0075% ALF component applies and whether the two components were intentionally passed through at par.
- Period/program-specific evidence explaining the $3.00 Location Fee composition, merchant-facing controller, and ultimate beneficiary of any excess.
- A reliable current 2026 Mastercard assessment source that resolves the 0.1375% versus 0.1475% conflict.
- Stronger evidence resolving April 5 versus April 15 for statements that span early April 2024.
- Primary Mastercard publications for the admitted processor/platform claims where obtainable.
- Generalization of the cardinality guardrail beyond the focused Mastercard families requires a separately reviewed domain batch.

## Recommended next domain batch

The next Product review should target acquirer/program-specific Mastercard price construction: the 2025 $3.00 Location Fee composition and the September 2024 Wells Fargo/Fiserv assessment schedule first, with a current 2026 assessment source in the same evidence collection. This directly attacks the two remaining commercial candidates and the principal at-par uncertainty without broadening to another processor or network family.
