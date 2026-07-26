# Canonical Golden Corpus Fixtures

This directory contains privacy-safe corpus metadata for Package A.

Rules:
- Do not store original merchant PDFs here.
- Do not store merchant names, account numbers, private file paths, document hashes, raw statement text, or uploaded filenames.
- Do not mark an expectation as `verified` unless a human reviewer approved the value from the statement or trusted documentation.
- Codex-prepared expectations must remain `candidate_only` until human approval.
- Known backend defects must remain visible as `knownFailure` records and must not be converted into passing expectations.

Private original-PDF tests must use `RATEREVEAL_PRIVATE_CORPUS_DIR` and must skip safely when that variable is absent.
