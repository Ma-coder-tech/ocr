# Unknown-Fee Research Diagnosis — E1 + E2

Evaluation date: 2026-09-08

Baseline branch: `codex/unknown-fee-research-calibration-retrieval-strategy-v1`

Baseline commit: `a0be0bef1eb81742e655e3c99e7621213a99bdf4`

This was a diagnostic experiment only. It did not change runtime triage, admit knowledge, build a source library or retrieval memory, or alter canonical financial truth.

## Executive diagnosis

The dominant problem is **research warrant/triage**. Three of the four prior live-research cases already had enough statement structure and governed knowledge for the useful merchant conclusion. Suppressing those calls removes 17 of the prior 24 external operations (70.8%) with no measured loss in determinant quality, actionability, commercial usefulness, confidence discipline, or the merchant recommendation.

For the one case that still warrants research, `Monthly Advantage Fee`, **query generation is not the primary failure in this replay**. The automated and manual arms discovered the same four core URLs and the same single occurrence-level useful document. Neither arm improved D1–D4, action, governed confidence, or evidence tier.

The remaining Monthly Advantage failure is a measured combination of:

- **source applicability:** the retrieved same-platform statement demonstrates occurrence but does not define the charge or establish economic control;
- **retrieval/post-fetch handling:** the synthesis excerpt is the first 2,000 document characters rather than a relevance-centered window around `Monthly Advantage`/`MCVDB`/`AMDS`;
- **access/ranking limitations:** a procurement addendum returned HTTP 429, an application copy returned HTTP 404, and a discovered merchant-application candidate was not among the three ranked fetches.

Provider discovery itself was adequate for this sample. The manual arm did not find materially stronger or more applicable evidence than the automated arm.

## E1 — research-warrant decisions

| Case | E1 decision | What statement/governed evidence already establishes | Material unresolved question | Effect of suppressing prior research |
|---|---|---|---|---|
| Monthly Advantage Fee | Research warranted | Clover / A First Data statement; proprietary `MCVDB` token; Other/service-charge placement; printed proportional formula; interchange-plus context; processor/acquirer collection | Fee family/economic layer and merchant-facing price control could change verification-only into a supported commercial review | Not suppressed |
| Batch Settlement Fee | Suppress | Plain-language batch charge; printed per-transaction unit/population; arithmetic reproduces; governed F6 acquiring-side batch/per-item family; acquiring-side price control; operational and commercial action already supported | Ultimate retention and contract compliance | No loss across all five comparison dimensions |
| Application Fee | Suppress | Explicit label in Account Fees; single current-period account charge on processor statement; collector known; explanation/reduction/waiver review does not require contract proof | Beneficiary, contractual authorization, recurrence | No loss across all five comparison dimensions |
| AMEXCT043 / NQUAL | Suppress | `AMEXCT043` is the card-type section; `NQUAL DISC` is the row label; rate-times-volume is printed; governed F5 bundled acquiring price and price control; itemization/commercial review already supported | Bundled component allocation, retention, contract compliance | No loss across all five comparison dimensions |
| CPU GTWY | Suppress/control | AUTHS & AVS placement; event count/rate; governed technology/gateway family and acquiring-side commercial review | Exact provider and retention | Correct existing zero-operation control |

The previous Batch Settlement, Application Fee, and AMEXCT043/NQUAL research calls are therefore suppressible. Their prior runs used 6, 5, and 6 external operations respectively. All ended with zero determinant lift, zero action lift, zero evidence-tier lift, zero governed D1–D4 change, and zero governed confidence change.

### E1 architecture findings

The current Stage-0 planner overweights missing exact identity or any unresolved D2 field. It does not consistently ask whether the unresolved field can change the merchant conclusion.

Three cross-layer mismatches inflate research:

1. Batch Settlement has `per_item` and confirmed arithmetic in the analyst finding, but the Open-World D2 projection remains unresolved.
2. AMEX NQUAL has a supported `rate_times_volume` mechanic and qualification-labeled population in the analyst finding, but Open-World D2 remains unresolved.
3. Monthly Advantage prints a proportional rate-times-volume formula, while Open-World D2 classifies it as a fixed periodic charge and the analyst arithmetic bridge remains unresolved.

Application Fee is also too conservative at Stage 0: the explicit label plus Account Fees section is sufficient for a bounded account/application category and review action, even though beneficiary, recurrence, and contractual compliance remain unresolved.

These are diagnostic observations, not newly admitted rules.

## E2 — exact query inputs

### Arm A: current automated planner

1. `"MONTHLY ADVANTAGE FEE MCVDB" fee`
2. `"Clover" "MONTHLY ADVANTAGE FEE MCVDB"`
3. `"MCVDB OR AMDS" "Clover" "fee schedule" OR "merchant application" OR "statement guide" filetype:pdf`
4. `"MCVDB OR AMDS" "Clover" "processing statement" OR "merchant statement"`

The quoted `"MCVDB OR AMDS"` token is syntactically weak because it can be interpreted as one literal phrase. It did not prevent discovery in this run, but remains a query-shape defect.

### Arm B: Product-specified manual shapes

1. `"Monthly Advantage Fee" payment processing`
2. `"Monthly Advantage Fee" MCVDB`
3. `"Monthly Advantage Fee" AMDS`
4. `"Monthly Advantage Fee" "merchant application" "Clover" "First Data"`

The fourth query uses the statement-derived `Clover` and `A First Data Company` identity. No merchant identity, account data, counts, rates, amounts, or whole-statement content was sent.

## E2 — discovery and retrieval results

### Shared discovery

Both arms discovered these four URLs:

- Southwest Tennessee Community College public merchant statements: same-platform occurrence evidence; fetched successfully in both arms; contains the target code/label somewhere in the full extracted text, but does not by itself define the fee.
- CCRTA `Addendum No. 1`: potentially useful procurement/institutional lane; fetch failed with HTTP 429 in both arms.
- NPP Agents `PCS2705_Editable.pdf`: merchant-application candidate; discovered in both arms but not selected within the three-fetch cap.
- Scribd merchant-processing application: generic navigation lead; fetched only by Arm A and was not specific enough.

Arm B additionally discovered a Value Added Merchant Services application copy, which returned HTTP 404 when fetched. It was not materially stronger evidence.

### Applicability and source quality

The Southwest statement was the only fetched source marked useful by the runner, based on presence of the distinctive code in the full document. That is occurrence evidence, not definitional authority. Both syntheses returned no candidate interpretations because the bounded excerpt did not expose a sufficiently specific, applicable explanation.

The runner currently passes the beginning of each retrieved document to synthesis. For a multi-page statement, the target fee occurs later. This means a source can pass full-document token matching while the synthesis model receives an unrelated opening excerpt. That is a post-fetch relevance-window defect, separate from web discovery.

No source established the precise fee identity, beneficiary, rule setter, price setter, or merchant-facing price controller. No source was admitted.

## E2 — operation accounting and lift

| Measure | Arm A | Arm B |
|---|---:|---:|
| Search operations | 4 | 4 |
| Document fetches | 3 | 3 |
| Synthesis calls | 1 | 1 |
| Total external operations | 8 | 8 |
| Provider requests | 5 | 5 |
| Provider-internal web-search calls | 8 | 8 |
| Applicable D1–D4 lift | none | none |
| Action lift | no | no |
| Evidence-tier lift | no | no |
| Stop | `S3_RESEARCH_STAGNATION` | `S3_RESEARCH_STAGNATION` |

There were no retries and no fallback provider. All OpenAI calls used `store: false`.

## Interpretation against Product's decision framework

- **Warrant/triage problem:** strong evidence. Three of four prior research cases were unnecessary and consumed 17 operations without lift.
- **Query-generation problem:** present but not primary. The automated planner has a malformed quoted-OR shape and underuses adjacent statement context, yet it found the same core documents as the manual arm.
- **Provider/discovery problem:** weak evidence in this sample. The provider found the human-style procurement, statement, and application candidates in both arms.
- **Retrieval/access problem:** moderate evidence. HTTP 429/404 and ranking prevented inspection of some discovered candidates.
- **Source-applicability/post-fetch problem:** strong evidence. The only fetched matching statement showed occurrence rather than meaning, and the synthesis excerpt did not center the matching passage.

The evidence therefore supports a **measured combination led by warrant/triage, with source-applicability and post-fetch retrieval second**.

## Smallest recommended next milestone

Implement **Decision-Relevant Stage-0 Warrant Gate v1** only.

The gate should reconcile the analyst finding and Open-World projections before escalation, and should research a missing determinant only when resolving it can change the merchant conclusion, action class, or confidence permission. It should explicitly preserve unresolved beneficiary, retention, and contract questions when they do not block a useful action. Re-run the full Fiserv corpus and these five controls to quantify suppression and guard false negatives.

Do not combine that milestone with source-library construction. After the warrant gate is reviewed, a separate small experiment can address relevance-centered excerpt extraction and fetch ranking for the remaining genuinely research-worthy cases.

## Safety, invariance, and repository evidence

- All three statement-level canonical financial fingerprints matched before and after E1/E2.
- Governed D1–D4 and governed confidence were not mutated by either arm.
- No reusable knowledge was self-admitted.
- No runtime triage rule was changed.
- Raw evaluation: `evaluations/unknown-fee-research-diagnosis-e1-e2-v1/evaluation-2026-09-08.json`.
- Reproducible harness: `scripts/evaluate-unknown-fee-research-diagnosis-e1-e2-v1.ts`.
- Focused diagnostic and inherited calibration tests are required before checkpointing.
