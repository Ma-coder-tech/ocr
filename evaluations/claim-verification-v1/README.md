# Claim Verification and Evidence Calibration v1

Product review, 5 September 2026. This bounded, disconnected evaluation is complete and **uncommitted**. It checks explicit claims against their own evidence obligations and distinguishes supported assertions, contradictions, incomplete evidence, unresolved interpretation and unusable evidence. It does not expand canonical authority or verify merchant pricing merely because numbers reconcile.

Engineering recommends **Cross-Summary Identity and Overlap v1 next, before Statement Understanding Generalization v2**. Fee-basis gaps remain visible, fail closed and materially block affected pricing claims. They do not prevent verification of already admitted charge-column totals.

## What was added

`verification.py` consumes the original native packet, independent structural inventory, saved structural result, saved semantic result and a separately retained list of claim requests. It first recomputes structural and semantic admission. Every supported assertion must then satisfy its own obligations; evidence sufficient for one assertion cannot silently authorize a stronger one.

The supported request types are:

- **Printed total:** compare a complete additive measure's unique signed detail values with the printed control in that same column and admitting total. Counts use integer counts; money uses exact signed minor units. No tolerance, sign reversal, rounding or member selection is introduced to make a check pass.
- **Printed contribution union:** verify a claimed union value under an admitted common scope, removing repeated references to the same source contributions. Subtotals and their grand total cannot be counted twice.
- **Printed contribution relation:** verify exact source-set equality, subset, overlap, sibling separation under a common printed parent, or different measures on shared rows. These are not assertions about unique underlying economic activity.
- **Economic relation:** assess whether the evidence establishes same, separate, overlapping or subset activity across representations. Current semantic evidence does not prove these links, so they remain unresolved, including when totals match.
- **Basis phrase versus fee calculation:** verify that a literal basis phrase is supported separately from whether a fee calculation is sufficiently specified. Explicit Volume and Rate columns remain available as observations, with their unit uncertainty preserved. A conditional product of printed numbers never establishes correct pricing.
- **Printed role and financial completeness:** check an asserted printed role without inferring unprinted components. A complete printed scope does not establish a complete financial population or whole-document coverage.

Each outcome records the requested assertion, source binding, member and control references, relevant source observations, passed/missing/failed obligations, exact arithmetic operands and residual where applicable, interpretation limits and permitted wording. Saved outcomes are checked by exact recomputation against the independently supplied request list. Editing a verdict, evidence, calculation, obligation or request and replacing its hash cannot authorize a saved result.

## How sufficiency and calibration work

| Outcome | What it means here |
| --- | --- |
| Supported | Valid admitted evidence satisfies every obligation for this narrow assertion. For example, signed detail values equal their printed column total. |
| Contradicted | Valid evidence decides the narrow assertion and disagrees with it. This is different from proving incorrect billing. |
| Incomplete evidence | The required member set, control, basis or rate is absent, incomplete, malformed or unsupported. No convenient observed subset is substituted. |
| Unresolved interpretation | Relevant observations exist, but the requested meaning, unit, aggregation, pricing rule or economic relationship is not established. |
| Invalid evidence | Structural/semantic replay fails. The evidence cannot be used either to support or to contradict the financial claim. |
| Invalid request | The assertion falls outside the explicit request contract or is malformed; it was not evaluated. |

Calibration is qualitative and obligation-based. It is **not a probability, model confidence score or empirical accuracy estimate for unseen statements**. “Strong” means strong for the stated source-bound assertion, relative to admitted native evidence. A detail total and its control on the same statement are not independent confirmation of external financial truth. Currency identity, contract correctness and source completeness beyond the retained native export remain unproven.

## Evaluation results

All 15 statements were previously studied. The last three Monroe courthouse statements were retained as final transfer/regression cases, not represented as new untouched holdouts. Claim contracts and source/control expectations were saved before generating verification outputs. The verifier and tests were frozen before corpus runs; no classifier change followed those runs. Annotations and expectations have a single reviewer, not independent dual review.

The evaluation produced **1,472 explicit claim outcomes**:

| Assertion family | Supported | Contradicted | Incomplete | Interpretation unresolved |
| --- | ---: | ---: | ---: | ---: |
| Printed column totals | 119 | 2 | 3 | 21 |
| Deduplicated printed unions | 2 | 0 | 0 | 0 |
| Literal basis phrases | 164 | 0 | 458 | 0 |
| Fee calculations | 0 | 0 | 466 | 156 |
| Economic same/separate activity | 0 | 0 | 0 | 66 |
| Financial population completeness | 0 | 0 | 0 | 15 |

These are deliberately different hypotheses, not 1,472 independent facts or transactions. The 21 unresolved total requests concern non-additive average-ticket, basis/volume or rate columns. The three incomplete totals are the previously withheld Paysafe fee scopes. The 458 incomplete phrase requests include descriptions without an explicit basis as well as unsupported/ambiguous descriptions; this is not a claim of 458 parser misses.

All **228 predeclared control, relationship, completeness and union outcomes** matched expectations, including exact residuals for the two known control contradictions. Separate source-gold checks retained the six known phrase misses and their fail-closed outcomes. All 15 saved reports replayed exactly.

## Contradictions and changed conclusions

Two Paysafe February assertions that were previously unverified now receive an explicit **printed signed-total contradiction** in this evaluation:

1. The admitted fee-column detail values sum to **−1,547.13**, while its printed control is **+1,565.73**. There is a sign difference and a magnitude difference of **18.60**. The verifier records the exact signed residual of **−3,112.86**; it does not reverse signs or insert missing members.
2. Admitted funded detail values sum to **35,347.22**, while the printed control is **35,347.21**, a difference of **0.01**. No rounding tolerance erases it.

These are disagreements in the admitted printed evidence. They do not identify the cause, prove a merchant overcharge, establish an economic population, or authorize a replacement canonical value. Financial interpretation remains separate from the narrow signed-arithmetic assertion. The malformed fee-table populations remain incomplete, rather than receiving a misleading arithmetic pass or contradiction.

Priority's card and miscellaneous subtotals plus their grand total correctly resolve to the same 14 charge contributions and **−3,082.82 once**. The zero-volume fee subtotals likewise resolve to six contributions and **−44.90 once**. Its separate funding deduction also prints −44.90; matching that amount still does not establish the economic link or permission to add the two representations.

No existing canonical conclusion, structural member set, semantic role or Kernel proof changed. Only the new offline claim reports turn previously deferred checks into explicit supported, contradicted or withheld outcomes.

## Fee-basis coverage remains an active gap

On the three reserved source-reviewed statements, **24 of 30 clearly printed basis phrases** remain supported. The six known misses—five compact `AT0.0001`/`AT0.0002` forms and one `DISC RATE TIMES` form—remain unavailable to both basis and pricing verification. All three ambiguous `0 X TRNS` descriptions remain unresolved. None of these gaps was repaired with fixture rules or arithmetic rescue.

The six affected charge cells still belong to admitted fee totals whose arithmetic checks pass. Therefore missing basis grammar **does not block printed charge-total verification**. It **does materially block those row-level pricing claims**. The 49 descriptions without an explicit phrase in this cohort also remain without inferred bases.

Across all 622 fee-detail pricing requests, 466 lack supported basis or rate inputs. The other 156 have observations but lack enough proof of rate units/conversion, charge sign, rounding/per-item versus aggregate calculation, or the applicable pricing rule. A count and total volume without a rate does not supply the missing rate. Exact agreement in a conditional multiplication cannot promote a pricing claim, and disagreement in that conditional calculation is not automatically an overcharge.

General phrase coverage can expand safely as source evidence is encountered, with source-first annotations and adversarial regression tests. It remains tracked in `GAP_REGISTER.md` and gated in every report. Improving grammar alone will not establish the additional pricing rules needed for stronger conclusions.

## Cross-summary identity remains materially unresolved

All **66 same/separate activity assertions across 33 scope pairs** remain unresolved. The prototype can prove printed source-contribution relations, but it cannot yet show that independently printed summaries describe the same underlying activity, separate activity or a valid economic subset. It refuses to combine them as if that proof existed.

This is the larger population-level blocker to useful generalization. More question generation over these unknown relationships would risk recreating false leads and double counting. Engineering therefore recommends **Cross-Summary Identity and Overlap v1 before Generalization v2**.

That next bounded milestone should establish claim-specific requirements for comparable measures, period, grain, units, member keys, complete coverage and explicit source-supported links. Begin with admitted fee/funding representations and require real positive link evidence, not equal totals or similar labels. Where a necessary linking passage or representation lacks structure, propose only the targeted structural prerequisite needed for that link. Include real positive cases and deliberate mismatches/duplicates; merely returning unknown everywhere would not demonstrate the desired capability. Preserve unknown when the PDF does not actually provide the necessary evidence.

No work on that next milestone has begun.

## Verification and unchanged boundaries

- **28 new verification tests**, **29 unchanged semantic tests** and **51 unchanged structural tests** passed.
- **21/21** post-freeze altered-evidence probes on the reserved layouts were rejected: promoted identity/pricing verdicts, lost control evidence or obligations, altered operands or requests, and missing source pages.
- **3/3** changed-source control probes produced contradictions while retaining the exact member sets. These use updated synthetic source inventories to distinguish contradiction handling from integrity rejection; they are not original statement findings.
- Exact replay covered all **15 reports / 1,472 claims**. The audit checked **7,143 referenced source-atom occurrences** against admitted atoms and original fragments.
- All **792 preexisting files** in the protected snapshot remain unchanged. The original tracked diff is unchanged and the Git index is empty. HEAD remains `f5e89d4e3afd63a7f687d1359f801fe62136b6fe`.

There was no need to change the reconstruction, structure, semantic-scope, proof, evidence-posture, AI-boundary or five-fact authority foundations. No canonical authority or truth changed. AI ranking/model expansion remains paused. No runtime/extractor integration, OCR, frontend, customer report, benchmark, multi-statement feature, Production, deployment, PR, merge, commit or push was performed. This milestone remains uncommitted for Product review.

## Evidence and replay

Review code and gold are under `evaluations/claim-verification-v1/`. Ignored outputs are under `artifacts/claim-verification-v1/`: per-statement requests and reports, both cohort summaries, `scores.json`, `challenges.json`, test logs and `boundary-audit.json`.

From the current worktree:

```sh
python3 -m unittest discover -s evaluations/claim-verification-v1 -p 'test_*.py' -v
python3 evaluations/claim-verification-v1/run.py --cohort development
python3 evaluations/claim-verification-v1/run.py --cohort reserved
python3 evaluations/claim-verification-v1/score.py
python3 evaluations/claim-verification-v1/challenges.py
python3 evaluations/claim-verification-v1/audit.py
```

These commands use retained structural and semantic evidence; they do not rerun PDF extraction. `prepare.py` is the original pre-run request/gold preparation and deliberately refuses to overwrite expectations after reports exist. The local audit depends on the original before-snapshot. Frozen hashes bind the implementation and retained requests. No new tool or model dependency is needed beyond Python's standard library and the previous disconnected evaluations.

Stop for Product review.
