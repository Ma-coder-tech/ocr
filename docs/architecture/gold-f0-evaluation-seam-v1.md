# F0 — Gold evaluation seam and frozen fixtures

Status: engineering implementation for Product review. This file is not a new semantic authority and does not amend the frozen Gold Authority & Derivability contract.

## Design

The frozen normalized register is the sole semantic oracle. `gold-f0-evaluation-lib.ts` compares separately supplied candidate outputs against each assertion's claim dimension, expected value/state or prohibition, reasoning requirements, authority lanes, temporal scope, resolution, and Product-policy classification. Each result retains both frozen semantic status and source/provenance status. No production module imports the evaluator.

The candidate fixture is hand-authored adversarial test output, not an admitted source or runtime analysis. S1–S10 are synthetic falsification scenarios only. Their fixture authority lanes model the lanes being tested; they do not create public-source admissions, processor support, merchant-private records, or customer-facing facts. In particular, S5's simulated governed-public lane represents a mapping prerequisite, not an actual Amex mapping. Future candidates may be supplied as JSON to the CLI, but cannot make G1–G8 or G9 source-executable by claiming an answer.

The evaluator produces nine non-blended outcomes: correct answer, correct refusal, unsupported inference, incorrect conclusion, extraction failure, missing source authority, Gold ambiguity, source mapping incomplete, and policy mismatch. Refusal is explicit and typed; absent output on an executable assertion is an extraction failure, not a passing refusal. The four frozen zero-tolerance errors are separate hard-failure flags, never confidence penalties.

## Executable surfaces

- `npm run gold:test` runs the lineage/freeze tests and F0 evaluator tests.
- `node scripts/run-node-tool.mjs --import tsx scripts/gold-f0-evaluate.ts` evaluates the hand-authored offline fixture and emits JSON counts, per-case outcomes, hard failures, and unexpected assertions. It exits nonzero for unexpected outcomes or hard failures.
- Passing a candidate JSON file path to that command evaluates an independently produced candidate set. It must contain assertion-ID-keyed outputs in the `F0Candidate` shape; unknown or duplicate IDs are rejected. Missing executable outputs are extraction failures.

## Readiness boundaries

G1–G8 retain 287 source-mapping-incomplete, non-source-executable normalized assertions. G6's source identity remains unresolved. G9 retains 26 source-unavailable, historical-guidance assertions. Semantic approval does not override any of these gates. The original 348 assertions retain exact lineage into 369 normalized assertions, including the 21 splits. All 25 global prohibitions are executed as explicit refusals and individually mutation-tested as forbidden positive admissions.

F0 tests the evaluation contract and its failure modes. It does not prove that a future runtime semantic implementation is correct, does not authenticate real statement sources, and does not authorize F1 or any change to canonical financial ownership/actionability.
