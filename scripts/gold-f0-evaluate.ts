import fs from "node:fs/promises";
import path from "node:path";
import { assertNormalizedRegister, type NormalizedAuthorityRegister } from "./gold-authority-derivability-lib.js";
import { assertF0Candidates, evaluateF0Register, type F0Candidate } from "./gold-f0-evaluation-lib.js";
import { f0ExecutableCandidates } from "../test/fixtures/gold-contract/f0-candidate-observations.js";

const fixturePath = path.resolve(process.cwd(), "test/fixtures/gold-contract/gold-authority-derivability-v1.json");
const candidateArg = process.argv[2];
if (candidateArg && process.argv.length !== 3) throw new Error("Usage: gold-f0-evaluate.ts [candidate-json-path]");

const register: NormalizedAuthorityRegister = JSON.parse(await fs.readFile(fixturePath, "utf8"));
assertNormalizedRegister(register);
const candidates: F0Candidate[] = candidateArg
  ? JSON.parse(await fs.readFile(path.resolve(candidateArg), "utf8"))
  : f0ExecutableCandidates;
assertF0Candidates(candidates);
const results = evaluateF0Register(register, candidates);
const counts = Object.fromEntries([...new Set(results.map((item) => item.outcome))].sort().map((outcome) => [outcome, results.filter((item) => item.outcome === outcome).length]));
const safety = Object.fromEntries(register.normativeRules.zeroToleranceErrors.map((category) => [category, results.filter((item) => item.hardFailures.includes(category as typeof item.hardFailures[number])).length]));
const byCase = Object.fromEntries([...new Set(results.map((item) => item.caseId))].map((caseId) => [caseId, {
  count: results.filter((item) => item.caseId === caseId).length,
  outcomes: Object.fromEntries([...new Set(results.filter((item) => item.caseId === caseId).map((item) => item.outcome))].map((outcome) => [outcome, results.filter((item) => item.caseId === caseId && item.outcome === outcome).length])),
}]));
const unexpected = results.filter((item) => item.hardFailures.length > 0 || !["correct_answer", "correct_refusal", "source_mapping_incomplete", "missing_source_authority"].includes(item.outcome));
process.stdout.write(`${JSON.stringify({
  mode: candidateArg ? "candidate_json" : "frozen_offline_fixture",
  originalAssertions: register.sourceGold.originalAssertionCount,
  normalizedAssertions: register.assertions.length,
  candidateAssertions: candidates.length,
  counts,
  zeroTolerance: safety,
  byCase,
  unexpected: unexpected.map((item) => ({ assertionId: item.assertionId, outcome: item.outcome, hardFailures: item.hardFailures })),
}, null, 2)}\n`);
if (unexpected.length) process.exitCode = 1;
