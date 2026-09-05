# Approved preservation checkpoint

Product authorized preservation of Claim Verification and Evidence Calibration v1 before Cross-Summary Identity and Overlap v1. This commit includes the completed claim layer and its required Financial Population and Semantic Scope v1 dependency. It excludes unrelated runtime/parser/OCR/database state, generalization work and document-tool research. Historical milestone reports describe their original uncommitted evaluation state; this is the subsequent authorized preservation action.

The compact checkpoint retains the 15 semantic inputs, 15 independently retained request lists, 15 saved claim reports, scores, challenges and validation logs. Its manifest binds uncompressed bytes. Source packets and inventories already belong to the prior structural checkpoint. No new original PDF is introduced.

From a fresh checkout, run `python3 evaluations/claim-verification-v1/replay_checkpoint.py`. Python standard-library replay restores missing ignored records, refuses to overwrite differing evidence, runs 108 tests, exactly recomputes all 15 claim reports, scores the 228 retained expected outcomes and reruns tampering/source-change challenges. This does not redo PDF extraction or the historical dirty-worktree audit.

The following Cross-Summary milestone is separate and must remain uncommitted until Product review. This preservation request authorizes a local Git checkpoint; no remote push is included in this sequence.
