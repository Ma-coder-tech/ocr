# Financial Population and Semantic Scope v1

Product review, 5 September 2026. The bounded evaluation is complete and **uncommitted**. It adds source-backed financial measure descriptions and safe printed-contribution relationships. It does **not** establish unique underlying economic populations across independently printed summaries. Engineering recommends **Claim Verification and Evidence Calibration v1** next, limited to these admitted measures and explicit unknowns.

## Preservation checkpoint

The approved printed-membership and printed-coverage evaluations, source gold, compact native evidence packets, independent inventories, saved results and portable replay were preserved in commit **f5e89d4e3afd63a7f687d1359f801fe62136b6fe** on `codex/statement-reconstruction-kernel-v0`. The push succeeded. An independent `git ls-remote --exit-code origin refs/heads/codex/statement-reconstruction-kernel-v0` returned that same SHA before semantic implementation began.

The structural checkpoint is recoverable from GitHub. A fresh-directory replay passed 51 tests, reproduced all scored structural memberships and rejected all 15 continuation challenges. Only `evaluations/printed-membership-v1/` and `evaluations/printed-coverage-v1/` entered the preservation commit. Unrelated parser, OCR, generalization and database state was excluded. This is a structural preservation claim, not a claim that every preexisting uncommitted experiment is backed up. The new semantic milestone has not been committed or pushed.

## What was added

The semantic prototype first recomputes the saved structural record against its independently retained inventory and requires exact JSON agreement. It uses complete **total member sets**, accepted rows, their actual column headers and their admitting totals. A partial page segment contributes only through a complete cumulative scope. Unassigned source material and unresolved scopes cannot supply rescue evidence.

Each measure observation retains its exact raw text, original PDF hash, physical page, source fragments, column header path, admitting total references and explicit limits. Monetary values preserve the printed sign. Currency identity is not promoted from an ambiguous dollar symbol. Uncertain numeric splits are not repaired. A saved semantic record is also checked by exact recomputation, including its evidence and relationship assertions; a replacement hash does not authorize edited meaning.

The supported distinctions are:

- **Fee charge versus basis:** explicit Volume and Rate columns remain separate from Total. A Volume value of `1` is not automatically a transaction count. In three-column fee tables, explicit description phrases such as `51 TRANSACTIONS AT .1` or `.002 TIMES $1,200.00` become separate basis observations with source spans. The terminal Amount remains the charge. A fee basis does not become a merchant-wide activity population.
- **Funding versus activity measures:** submitted, third-party, combined adjustment/chargeback, fee-charged and funded columns retain different meanings. A month-end charge row is not counted as a sale. Batch gross sales, refunds and submitted amounts retain their full parent-header paths; counts remain counts, and average ticket is non-additive.
- **Combined versus split categories:** the explicit Adjustments/Chargebacks column stays combined, including zero. A CHARGEBACKS line in the fee table is a fee, not chargeback principal. Separate explicitly printed component columns can support adjustment or chargeback amount observations with unspecified subtype. This positive split case is synthetic evaluation evidence; no real admitted input demonstrated a justified allocation of a combined total. No principal, lifecycle or inferred-zero component claim is produced.

## Population relationships and double counting

The layer distinguishes **printed contribution identity** from **economic activity identity**.

A contribution is anchored to its actual source cell and measure. Totals with the same contributions represent the same printed evidence. Exact member-set inclusion supports a contribution subset; shared source contributions support overlap. Disjoint sibling sets under one admitted common total are separate contributions to that printed scope. They may still arise from the same underlying transactions.

An evaluation aggregation selects the union of source contributions, never adds detail plus subtotal plus grand total. It removes repeated references to the same source evidence. It refuses different measures, non-additive columns, incomplete/ambiguous values and independently printed scopes lacking a common admitted parent. Identical text and amounts in different source rows are **not** silently deduplicated. Matching totals, different section names, zero refunds and distinct page locations prove neither activity identity nor economic separation.

This produces useful positive contribution sets without pretending the missing economic link exists. Independently printed fee detail and funding deductions remain related only as unresolved representations. Day/card/interchange summaries outside structural admission cannot be used to establish their overlap. The prototype does not produce a whole-statement financial total.

## Known-case results

Source-cell scoring on the targeted known cases and six previously studied public statements matched **972/972 measure assignments and 58/58 exact measure member sets**. These are values/sets across several measures, not unique transactions. Additional source-based regression tests covered Priority, the zero-volume statement and Paysafe's incomplete fee scopes.

| Case | Observed behavior |
| --- | --- |
| BASYS | Transaction fees: 98 contributions, printed signed sum −3,512.68. Five account-fee contributions remain separate from Equipment and Debit Network sections. |
| Clover October / November | Each transaction-fee scope retains 109 contributions across its admitted page chain. Printed sums are −1,210.89 / −1,228.33. Embedded basis numbers never replace charges. |
| Priority | Card fees 12 + miscellaneous fees 2 form the grand total's same 14 contributions. Selecting all three removes 14 duplicated references and gives −3,082.82 once. The funding Fees Charged representation cannot be added again. |
| Zero-volume | Fee detail has six contributions totaling −44.90; the single month-end funding deduction also prints −44.90. Their economic identity remains unproven, so joint aggregation is refused. Combined zero does not create separate adjustment and chargeback zeros. |
| Paysafe February | All three malformed/incomplete fee totals remain withheld. Funding columns retain their printed meanings. The observed source arithmetic anomaly is neither repaired nor used to invent membership. |

These signed sums are evaluation-only sums of admitted printed contributions. Their agreement with a printed control has not been turned into proof of financial completeness or canonical truth.

## Reserved semantic validation

There are no untouched native statements left in the supplied/reserved corpus. The final three Monroe courthouse statements had already been studied structurally. They were withheld from semantic development and output inspection until the first implementation freeze, and semantic expectations were recorded from source cells before unblinding. They are related monthly layouts from one public exhibit, not independent layout families or a blind new-document test.

| Statement | Fee contributions | Batch printed rows | Exact measure values | Exact measure sets | Clear basis phrases recovered |
| --- | ---: | ---: | ---: | ---: | ---: |
| February, physical pages 273–276 | 28 transaction + 4 account | 17 | 151/151 | 9/9 | 10/13 |
| January, pages 277–280 | 19 transaction + 2 account | 17 | 140/140 | 9/9 | 5/6 |
| March, pages 281–285 | 25 transaction + 4 account | 17 | 148/148 | 9/9 | 9/11 |

All **439/439 measure values and 27/27 exact sets** matched source gold, with no extra atoms outside reviewed scope. These comprise 82 fee charge observations plus seven measures for each of 51 printed batch rows. Each statement correctly retained 21 pairs of different measures on shared rows and 15 unknown relationships between independently printed scopes. None was upgraded to economic identity or permission to add headline totals.

Basis scoring deliberately includes clearly readable phrases outside the supported grammar: **24/30 recovered, six missed, zero wrong accepted values or false positives**. The misses were five compact `AT0.0001`/`AT0.0002` phrases and one `0.5 DISC RATE TIMES $8.12` phrase. Three `0 X TRNS` descriptions remained ambiguous. All 49 fee descriptions without an explicit basis stayed without a basis interpretation. These misses limit basis coverage, not the already supported charged-amount cell.

The 1,494 fragments outside the prior supported scopes remain unassigned; they are not new semantic evidence. The results demonstrate transfer within admitted Fiserv layouts. They do not demonstrate reliable interpretation of every unfamiliar Fiserv layout or cross-summary economic identity.

## Final review correction and verification

The initial 27-test engine was frozen before semantic holdout output. A subsequent **synthetic source-wording adversary** revealed that the inherited six-column structural schema supplies the generated title “Fees charged.” The first semantic gate could mistake that generated title for printed financial evidence when actual fee wording was removed. The final gate requires source-backed fee wording in an admitted title/closing total, and refuses explicit basis/estimate contexts. It also uses whole words, so “coffee” cannot establish a fee context.

This is a disclosed post-unblinding correction, not a new blind validation. `first-pass/` preserves the first engine, tests and freeze; the final freeze records the correction. All **15 real-statement semantic JSON outputs are byte-identical before and after it**. Thus the measured first-pass results stand, while the final version has regression validation and no untouched holdout. No grammar was expanded to recover the six missed phrases.

Final verification:

- **29 semantic regression/adversarial tests** and **51 unchanged structural tests** passed.
- **15/15** post-freeze holdout probes rejected changed charges, invented component meaning, invented economic identity, removed evidence or missing source pages.
- All **15 saved semantic records** replayed exactly. Atom text reverses to original fragments and all source/header/admitting-total references were checked.
- The boundary audit checked **773 preexisting files**: none changed. The preexisting tracked diff is unchanged, the Git index is empty, and HEAD remains the verified preservation SHA.

The reconstruction Kernel, proof obligations, evidence posture, AI trust boundary, canonical truth and five-fact authority are unchanged. All additions are under this evaluation directory and ignored evaluation artifacts. No extractor integration, AI work, OCR, frontend, customer report, benchmark, multi-statement feature, Production, deployment, PR or merge occurred.

## Most important next step

Proceed to **Claim Verification and Evidence Calibration v1**, scoped to admitted printed measures and explicitly limited contribution relationships. Build claim-specific deterministic checks for value consistency, evidence sufficiency and permissible wording. For example, verifying a fee-detail sum against its printed total is a different claim from proving that a funding deduction is that same fee population. The latter must remain withheld without explicit linking evidence, even if the amounts match.

The next milestone should make those distinctions testable and expose mismatches without selecting convenient members, repairing source values or expanding canonical authority. It should not resume AI ranking or retrofit every unsupported summary. Broader cross-summary economic identity will still need structural admission of the missing representations and stronger member-level links; it remains a major unsolved capability.

## Review files and commands

`semantics.py` is the disconnected implementation. `protocol.md`, `frozen.json`, `first-pass/` and the source-gold files record evaluation order and its limitations. `run.py`, `score.py`, `challenge_holdouts.py` and `audit.py` reproduce analysis, exact source scoring, negative checks and local boundary verification. Results are in ignored `artifacts/financial-population-scope-v1/`, including `scores.json`, `holdout-challenges.json`, both cohort summaries, test logs and `boundary-audit.json`.

From the worktree, using Python's standard library:

```sh
python3 evaluations/printed-coverage-v1/replay_checkpoint.py
python3 -m unittest discover -s evaluations/financial-population-scope-v1 -p 'test_*.py' -v
python3 evaluations/financial-population-scope-v1/run.py --cohort development
python3 evaluations/financial-population-scope-v1/run.py --cohort holdout
python3 evaluations/financial-population-scope-v1/score.py
python3 evaluations/financial-population-scope-v1/challenge_holdouts.py
python3 evaluations/financial-population-scope-v1/audit.py
```

The final audit uses the original local before-snapshot and first-pass outputs; it is a worktree boundary audit, not a fresh-checkout source extraction check. The analysis inputs come from the verified structural checkpoint. Original PDF/export fidelity remains bounded by that checkpoint's recorded source verification.

Stop for Product review. The new semantic work remains uncommitted.
