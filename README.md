# Merchant Fee Analyzer (V1 MVP)

Simple upload-and-analyze tool for merchant statements (`CSV` or `PDF`) with progress tracking and a live browser report.

## What is implemented

- File upload endpoint (`CSV`/`PDF`)
- Background job queue (in-process worker)
- Stage-by-stage progress states:
  - `analyzing`
  - `classifying`
  - `calculating`
  - `generating_report`
- Deterministic parser + fee estimation pipeline
- Dynamic field capture for unknown numeric columns
- Live report page for merchant-friendly results
- Frontend that routes uploads directly into the report view

## Project structure

- `src/server.ts`: API server + static frontend hosting
- `src/worker.ts`: queue + processing pipeline
- `src/parser.ts`: CSV/PDF parsing
- `src/analyzer.ts`: classification + fee calculation + insights
- `src/store.ts`: in-memory job/event store
- `public/index.html`: upload entry page
- `public/report.html`: live report page

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Build:

```bash
npm run build
```

3. Start dev server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

4. Optional: enable Anthropic refinement

```bash
cp .env.example .env
```

## API

- `POST /api/jobs` (multipart with field `file`)
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/events`
- `GET /report/:id`
- `GET /health`

## Notes

- Anthropic report refinement is enabled only when `ANTHROPIC_API_KEY` is set.
- Default report-refinement model is `claude-sonnet-4-6` (override with `ANTHROPIC_MODEL`).
- Fiserv fee classification runs deterministic fee-name, reference-rate, OCR-normalized rate-fingerprint, and Durbin-regulated debit cap checks before any AI fallback.
- AI-assisted fee classification is opt-in with `AI_FEE_CLASSIFICATION_ENABLED=true`; it sends only structured unresolved fee rows, not raw PDFs, and defaults to `AI_FEE_CLASSIFICATION_MODEL=claude-opus-4-8`.
- Current storage and job state are local/in-memory; restarting the server resets job state.
- On Vercel, runtime temp files are written under `/tmp/ocr-data`.
- This MVP is designed as a low-cost base that can be extended with OCR workers, persistent queue/db, auth, and billing.
