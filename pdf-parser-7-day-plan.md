# PDF Parser 7-Day Execution Plan

## Purpose

This document is the operational plan for the PDF parser migration and bake-off.

The product requirement is clear:

- merchants upload processor statements as PDF or CSV
- we extract data from those statements
- we analyze the extracted data
- the resulting report and dashboard drive merchant decisions

Because of that, PDF extraction is part of the product foundation, not a side utility.

## Current Status

As of April 22, 2026, the codebase has already completed the first migration step:

- the primary PDF parser has moved from `pdf-parse` to `pdfjs-dist`
- [src/parser.ts](/Users/martialmahougnonamoussou/Documents/OCR/src/parser.ts) now does layout-aware positioned text extraction
- [src/analyzer.ts](/Users/martialmahougnonamoussou/Documents/OCR/src/analyzer.ts) owns the PDF recovery path directly
- [test/pdfStructuredExtraction.test.ts](/Users/martialmahougnonamoussou/Documents/OCR/test/pdfStructuredExtraction.test.ts) locks in Clover, Bloom, and scanned-PDF behavior

Baseline result on the current `data/uploads` corpus:

- `8` PDFs classify as `structured`
- `1` PDF classifies as `text_only`
- `1` PDF classifies as `unusable`
- the Bloom sample now recovers `totalFees = 82.62` instead of the bad `1.01` subtotal result

## Working Corpus

The exact bake-off corpus for now is the current upload set in [data/uploads](/Users/martialmahougnonamoussou/Documents/OCR/data/uploads).

Files currently present:

- `1776725929008-SAMPLE_MERCHANT_2Statement_Bloom-To-Beauty-By-Maria-Jan-24.pdf`
- `1776726441895-SAMPLE_MERCHANT1.pdf`
- `1776726627359-110012-Arre_t_n_05-CJ-CM_Dos_2022-20_QUENUM_C_MEGNIGBETO.pdf`
- `1776726662317-SAMPLE_MERCHANT4_CLOVER.pdf`
- `1776726820810-SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf`
- `1776727065772-SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf`
- `1776771633841-SAMPLE_MERCHANT4_CLOVER.pdf`
- `1776771845085-SAMPLE_MERCHANT4_CLOVER.pdf`
- `1776860073457-Dec_2024_Statement.pdf`
- `1776860175284-Dec_2024_Statement.pdf`

Important note:

- these include duplicate statement families
- duplicates are still useful because they verify determinism across repeated uploads

## What We Freeze Right Now

Do not add these until the bake-off criteria are consistently met:

- new PDF-only pricing logic that assumes extracted totals are universally trustworthy
- new processor-specific PDF rules that depend on detailed table structure not yet validated on the corpus
- support claims for scanned/image-only PDFs
- franchise or multi-store combined-PDF support
- broad UI/product claims that imply “all PDFs are fully supported”

## What We Keep Building

These can continue in parallel:

- CSV ingestion and analysis
- report and dashboard UX that consumes already-validated summary fields
- comparison workflows between statements
- account/session/store/server work unrelated to PDF extraction correctness
- checklist/report presentation improvements
- parser observability and confidence reporting
- additional tests and fixtures
- manual verification workflow for totals while the corpus is still small

## 7-Day Sequence

### Day 1: Lock The Baseline

Goals:

- keep the current parser migration green
- freeze the exact bake-off corpus
- capture a baseline JSON result from the current parser

Deliverables:

- this plan document
- [scripts/pdf-bakeoff.mjs](/Users/martialmahougnonamoussou/Documents/OCR/scripts/pdf-bakeoff.mjs)
- a repeatable `npm run bakeoff:pdf` command

Acceptance:

- `npm run build`
- `npm test`
- `npm run bakeoff:pdf`

### Day 2: Ground Truth The Corpus

Goals:

- define expected outcomes for each PDF family
- identify what “correct” means for the current MVP

For each statement family, record:

- statement period
- total volume
- total fees
- effective rate
- whether two-bucket totals are expected to reconcile
- whether the PDF should be `structured`, `text_only`, or `unusable`

Deliverables:

- fixture JSON or markdown notes under `test/fixtures/`
- one owner-reviewed expected result for each unique statement family

Acceptance:

- no statement in the working corpus lacks an agreed expected total-fee answer

### Day 3: Parser Bake-Off Expansion

Goals:

- compare the current `pdfjs-dist` parser output to at least one alternative parser path if needed
- identify where our current reconstruction still drops signal

If we evaluate alternatives later, compare on:

- total volume accuracy
- total fees accuracy
- table line readability
- ability to recover section totals
- failure mode quality
- engineering integration cost

Deliverables:

- parser comparison notes
- one winner or “stay with current parser” decision for the next sprint

Acceptance:

- every parser candidate is judged against the same exact corpus and rubric

### Day 4: Analyzer Calibration

Goals:

- tighten how structured PDF rows are converted into summary totals
- remove false confidence on edge cases

Work items:

- improve structured row normalization
- refine selection between grand totals and subtotals
- tune confidence levels for `structured` PDFs that still need heuristic recovery

Acceptance:

- no known corpus file returns a clearly wrong core total with `medium` or `high` confidence

### Day 5: Rule And Comparison Validation

Goals:

- make sure downstream logic behaves correctly on the new structured PDF rows

Work items:

- validate checklist behavior
- validate two-bucket outputs
- validate comparison summaries between statement months

Acceptance:

- Clover and Bloom fixture expectations still pass
- no regression in comparison/report generation on existing sample paths

### Day 6: Product Guardrails

Goals:

- align the UX and product behavior with parser confidence

Work items:

- surface data quality and confidence consistently
- keep scanned PDFs blocked or clearly downgraded
- make low-confidence cases visually obvious

Acceptance:

- users cannot easily mistake a weak PDF parse for a fully trusted statement analysis

### Day 7: Ship Gate

Goals:

- decide whether the PDF parser is ready for MVP scope

Go criteria:

- all tests pass
- bake-off command passes on the current corpus
- no corpus file has a known-wrong total presented as trustworthy
- scanned PDFs fail safely
- the supported PDF scope is documented

No-go criteria:

- any corpus file still shows contradictory core totals across internal analysis paths
- known-wrong totals still surface with medium or high confidence
- we are still relying on ad hoc manual explanation to justify obviously incorrect numbers

## How To Run The Bake-Off

From the repo root:

```bash
npm run bakeoff:pdf
```

What it does:

- builds the project
- runs the current parser/analyzer on every PDF in `data/uploads`
- prints JSON including extraction mode, quality score, summary totals, confidence, and two-bucket availability

This is the command we should use whenever:

- parser code changes
- analyzer selection logic changes
- new PDFs are added to the working corpus

## What The Bake-Off Must Tell Us

For each PDF, we need to be able to answer:

- Did we classify it correctly as `structured`, `text_only`, or `unusable`?
- Did we recover the right statement totals?
- If not, did we fail safely instead of inventing numbers?
- Do the downstream rules agree with the main summary?
- Is the confidence level honest?

## Immediate Engineering Priority

The current priority order is:

1. keep the new `pdfjs-dist` parser path stable
2. ground-truth the upload corpus
3. tighten confidence and row normalization where the corpus still exposes weak spots
4. only then broaden PDF-supported product claims

## Decision Rule

If the current parser path continues to recover correct totals on the working corpus and fails safely outside that support envelope, we keep building on it for the MVP.

If the bake-off shows recurring statement families with wrong totals or unstable row reconstruction, we pause further PDF feature expansion and do a second parser comparison immediately.
