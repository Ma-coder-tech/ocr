# Printed Structure Coverage and Headerless Continuation v1

Product review, 5 September 2026. This bounded evaluation is complete, disconnected and uncommitted. Engineering recommends proceeding to a bounded **Financial Population and Semantic Scope v1**, using only admitted structural evidence. This is not a recommendation to integrate the prototype or expand authority.

## What “complete” now means

The prototype distinguishes a complete supported printed member set from an observed partial run. A complete result needs a verified source inventory, a supported explicit start, admitted joins for every intervening page, resolved rows, no unexplained material within the relevant scope, and a supported closing total. The result names the exact member rows and their original fragments; matching arithmetic is never used to select members.

This is completeness **relative to the independently retained native-text export and the supported table scope**. It does not prove that the extraction tool captured content absent from that export, that the entire statement is understood, or that these rows constitute a complete financial population. Those distinctions are explicit in the output.

Every native fragment now has one primary ledger entry: table row, table header, source-supported banner/context, identified page furniture, or unassigned material. Assigned does not mean resolved. An unexplained fragment within a table or continuation corridor prevents complete status. The source inventory records complete page fingerprints and fragment counts; removing an entire row/page or changing its text/geometry is detected against the independently retained reference. Without that reference, the engine can produce proposals but cannot mark membership complete.

## How a headerless join is admitted

The prototype checks the evidence as a chain rather than treating page proximity as sufficient:

1. There is one open predecessor and an explicit original header. Physical pages and printed page numbering are consecutive, and merchant/statement-period identifiers agree. These identifiers are compared as printed evidence; no merchant-specific branch exists.
2. A printed Fees banner begins the next segment. Its explanatory paragraph is accounted for separately, including wrapped text. The next rows fit the inherited description, Type and Amount columns. Alignment is learned from the printed rows: some layouts center Type values and others left-align them.
3. The chain reaches a closing total naming the same printed scope. Missing or differently named ends remain unresolved. A short continuation with only one detail row is sufficient when the remaining evidence is strong.
4. There is no unexplained intervening material, incompatible section heading, missing printed role, shifted amount column or ambiguous row. A neighboring explicit table starts a separate scope. Existing checks retain full parent header paths when headers repeat.

An earlier page remains a partial segment even when a later page establishes the whole set. Complete memberships are exposed at their supporting totals with lineage and source-page references. Closed subtotals remain separate from open member runs, preventing carryover or overlap. Incompatible mixtures of subtotal children and unfinished rows stay unresolved.

The new admission fields are `coverage.membershipStatus` and each total's `printedMembershipStatus`. Retained legacy `status` fields describe the earlier proposal/row stage and are not completeness admission. A future consumer must use the explicit coverage fields and their evidence boundary; this prototype has not been exposed as a runtime API.

## Known failures fixed

Exact source-cell and member-set scoring covered four previously failing fee tables, after reviewing all nine relevant rendered source pages:

| Known table | Complete printed members recovered | What changed |
| --- | ---: | --- |
| BASYS transaction fees, pages 4–5 | 98 | Headerless continuation admitted; footer address kept outside membership |
| BASYS account fees, pages 5–6 | 5 | The short final row and account total are recovered before Equipment begins; Equipment remains separate |
| Clover October transaction fees, pages 4–6 | 109 | Both headerless joins admitted into one exact printed member set |
| Clover November transaction fees, pages 4–6 | 109 | Both joins admitted; wrapped banner prose no longer becomes an ambiguous fee row; left-aligned Type values handled |

All **321 reviewed detail rows** had exact source-fragment cell assignments. All four final member sets matched the source gold exactly, with no duplicate members. The six previously studied public statements also retained exact assignments for **219 rows** and now have **18/18** reviewed total memberships complete, including the two transaction-fee scopes previously withheld.

The earlier positive Priority funding/fee, zero-volume fee, batch, debit-fee and account-fee results remained supported. These counts describe printed rows, not economic batches or transactions. Paysafe February's malformed fee values still prevent complete status for its affected fee subtotals and grand total. Its observed funding anomaly is preserved; this milestone does not reconcile or repair financial truth.

## Reserved holdout results

The implementation and 47 structural tests were frozen before opening the final three reserved statements in the public Monroe procurement exhibit. Only eligibility and pagination had been inspected earlier. Selection followed the original order, not performance. All 13 source pages were rendered and reviewed, and exhaustive in-scope cell/member gold was recorded before opening the new outputs. No classifier code, threshold or frozen test changed after unblinding.

These January, February and March 2023 statements belong to one additional courthouse merchant account. They are related Fiserv layouts in the same public exhibit, not three independent layout families.

| Statement | Original physical pages | Reviewed detail rows | Complete exact member sets | Continuation evidence |
| --- | --- | ---: | --- | --- |
| February | 273–276 | 49 | Batch 17; transaction fees 28; account fees 4 | Repeated batch headers and headerless transaction fees |
| January | 277–280 | 38 | Batch 17; transaction fees 19; account fees 2 | Repeated batch headers and a one-row headerless account continuation |
| March | 281–285 | 46 | Batch 17; transaction fees 25; account fees 4 | Headerless transaction fees following an initial two-row segment |

Result: **133/133 exact detail-cell assignments, 9/9 exact complete member sets, 3/3 supported headerless joins and 2/2 repeated-header batch joins**. No extra detail rows from neighboring sections entered the reviewed outputs. Exact source sets were checked, not just matching counts or amounts.

The ledger accounts for all **2,535 native fragments** in these statements. **1,494 remain explicitly unassigned outside the supported table scopes**, including cover-page material and unsupported summaries/details. Therefore these results are not a whole-document completeness claim. The March card-summary continuation and interchange continuations are visible in the source but remain outside this fee/batch slice; their fragments survive in the ledger.

Fifteen controlled negative probes on the held-out layouts separately removed a source page, changed statement identity, shifted the amount column, inserted an unrelated section, or changed the closing total's name. All 15 withheld the challenged membership. These are adversarial probes, separate from the unmodified holdout score, and were not used for tuning.

## What remains unresolved

- Malformed or missing amounts, uncertain row wrapping and incompatible membership evidence remain unresolved. Digits, signs and decimal points are not invented.
- Headerless schemas beyond the supported three-column fee pattern, continuations lacking adequate identity/banner/end evidence, and unexplained intervening material are not admitted.
- Day/card/submitted summaries and interchange detail still need their own structural admission work when required by a later milestone. The ledger preserves their absence from the current supported structure instead of implying they were understood.
- Native-extraction completeness beyond the retained export is not proven. The inventory protects against omission or alteration relative to the retained reference; it is not a substitute for that reference's trustworthy creation and source review.
- Same-looking tables do not establish financial population identity, deduplication, economic overlap or semantic scope. That is the next layer's work.

## Verification, provenance and boundaries

The original PDF byte hashes were verified. Every public statement packet is an exact subset of the independently retained complete native export, preserving original physical page numbers and fragment IDs. All 15 known/public statement inventories matched their source packets. All **15,946 fragments** across those evaluation inputs have an exhaustive, unique ledger entry, and all tested cell text reverses to original fragments.

All **47 frozen structural/adversarial tests passed**. Four further tests cover the JSON record boundary: round-trip replay, rehashed member edits, ledger omission and altered input. Internal printed-page tuples become JSON arrays, so `records.py` normalizes the recomputed result through JSON before exact comparison. This serialization-only boundary was added after unblinding; it changes no classifier behavior or frozen file. Use `validate_record` for saved JSON, rather than the prototype's in-memory equality helper. All 15 saved JSON results replayed exactly.

The audit checked **699 preexisting files**: none changed. The tracked Git diff is byte-identical to the starting diff, and HEAD remains `8a38208e3728fa84eb557738006e08bc719487b2`. New review code is confined to `evaluations/printed-coverage-v1/`; generated evidence is under ignored `artifacts/printed-coverage-v1/`. The preceding milestone's implementation and evidence remain intact.

The existing Kernel, deterministic proofs, canonical logic, five-fact authority and AI trust boundaries are unchanged. There is no runtime integration or new extractor. No AI, OCR, financial-population implementation, frontend, customer behavior, benchmark, multi-statement feature, Production, deployment, PR, merge, commit or remote push was performed. Existing unrelated dirty files predate this milestone and were preserved.

## Recommendation

Proceed next to **Financial Population and Semantic Scope v1**, as a bounded evaluation consuming only structurally admitted scopes. Its job should be to distinguish printed co-membership from economic membership: fee basis versus charge semantics, population identity, repeated summaries, overlap and double counting. Unresolved structural evidence must remain unresolved upstream; semantic reasoning must not invent missing members to reconcile a total.

The demonstrated fee/batch structure is sufficient to start that work. It does not justify blanket support for all Fiserv layouts, integration of this prototype, new authority, or resuming AI work. Product review is the stopping point for this milestone.

## Evidence and replay

- `protocol.md`, `frozen.json`: scope, selection and classifier freeze.
- `structure.py`, `coverage.py`: disconnected row/table and coverage logic.
- `holdout-gold.json`: source-first annotations for the reserved cohort. `known-gold.json`: exact regression annotations for the four known failure tables.
- `score.py`, `challenge_holdouts.py`, `records.py`, `audit.py`: exact-set scoring, negative probes, JSON replay and boundary checks.
- `artifacts/printed-coverage-v1/scores.json`, `holdout-challenges.json`, `boundary-audit.json`, `tests.log`, `record-tests.log`: result evidence; source inventories, saved results and rendered pages are alongside them.

From this worktree, run `python3 -m unittest discover -s evaluations/printed-coverage-v1 -p 'test_*.py' -v`, then `python3 evaluations/printed-coverage-v1/score.py` and `python3 evaluations/printed-coverage-v1/audit.py`. One analysis can be replayed with `python3 evaluations/printed-coverage-v1/structure.py INPUT_NATIVE_JSON OUTPUT_JSON INDEPENDENT_INVENTORY_JSON`. The reference must be retained independently and checked against the original source/export; do not manufacture it from a possibly damaged input to make a completeness check pass.

The public source is the [Monroe Clerk banking-procurement exhibit](https://monroe-clerk.com/uploads/documents/Questions_Answers_-_Monroe_County_Clerk_BOCC_RFP_Banking_Services_1.pdf), byte SHA256 `d052c1c0e137e0f0cd27a72daf2dac7a67b35b171a6fc78bee389cdd1e135016`. The unchanged local original is `artifacts/printed-membership-v1/holdout-sealed/monroe.pdf`; selected page packets are not new or rewritten PDFs.
