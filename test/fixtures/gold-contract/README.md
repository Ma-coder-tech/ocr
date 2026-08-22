# RateReveal Executable Gold Contract

This directory contains the privacy-safe, machine-readable **finalized semantic conversion** of Frozen Gold v0.3 for RA.

The committed catalog and tolerance filenames use `.final.json` so approved semantic Gold cannot be mistaken for the earlier candidate review state.

- All 348 semantic assertions are product-owner approved under the D1-D15 finalization decision; semantic approval remains separate from source identity and source-executed validation.
- Case identifiers and source identifiers are opaque. No merchant identity, raw statement text, account identifier, private path, or private source hash belongs here.
- `requires_human_review` and `source_unavailable` are provenance outcomes, not semantic passes or failures.
- Real-statement sources are resolved only through secure, non-committed mappings. Existing repository parser fixtures may provide provisional current-behavior evidence but are not silently promoted to authoritative Gold sources.
- Synthetic cases are falsification inputs and do not expand production processor support.
- Expected Gold data must never be imported into production code.
- Finalized contract v3 uses the canonical Economics Schema v0.7 derivability vocabulary and records applicability, effective-period, confidence-status, evidence-mapping status, comparison availability, and contract role explicitly.
- A null confidence with `not_explicitly_supplied_requires_review` means Frozen Gold requires confidence metadata but supplies no value; it is not a default confidence.
- S1-S10 all have fully derivable synthetic inputs; S5 and S8 use the product-owner-approved minimal opaque structures and invent no real-world economics.
- `TOL-MONEY-CENT` and `TOL-RATE-4DP-PERCENT` use approved decimal quantization. `TOL-EXACT` is retired; both approximate rules are unavailable and cannot execute a numeric pass/fail gate.
- The versioned `gold-v0.3-metadata-clarification-v0.1` addendum supplies the D15 machine-contract fields without rewriting the original frozen artifacts.
