# Approved structural checkpoint

Product authorized preservation after reviewing Printed Structure Coverage and Headerless Continuation v1. This checkpoint contains that completed evaluation and its earlier printed-membership dependency. Historical README and audit statements describe the uncommitted state at the time of evaluation; preservation is the subsequent authorized action.

The checkpoint directory retains compressed original native packets, independent source inventories, saved structural results and review evidence for all 15 inputs. Hashes cover uncompressed bytes. These records retain source PDF hashes, original physical pages and fragment geometry. They include the six existing repository fixtures and nine statements from the public Monroe procurement exhibit; no new private PDF is introduced. Native exports are evidence records, not substitutes for source PDF verification.

From a fresh checkout run `python3 evaluations/printed-coverage-v1/replay_checkpoint.py`. This restores only missing ignored artifacts, refuses to overwrite differing records, runs all 51 structural/serialization tests, exactly replays all 15 analyses, scores the four source-gold cohorts and runs the 15 continuation challenges. It needs only Python's standard library. Re-extraction requires PDF.js and the original PDFs; the public URL is retained in the manifest and its byte hash is in the source packets. Historical audits record the original source-byte checks; the portable replay does not claim to repeat PDF extraction or the old dirty-worktree audit.

No runtime, canonical, OCR, database, frontend or unrelated generalization changes are part of this checkpoint. Further financial-population work belongs to a separate, uncommitted review milestone.
