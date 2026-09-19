import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGoldContract } from "../../scripts/gold-contract-lib.js";
import { assertNormalizedRegister, type NormalizedAuthorityAssertion, type NormalizedAuthorityRegister } from "../../scripts/gold-authority-derivability-lib.js";
import { evaluateF0Assertion, evaluateF0Register, zeroToleranceCategories, type F0Candidate } from "../../scripts/gold-f0-evaluation-lib.js";
import { f0ExecutableCandidates, f0GlobalProhibitionCandidates, f0SyntheticCandidates } from "../fixtures/gold-contract/f0-candidate-observations.js";

const registerPath = path.resolve(process.cwd(), "test/fixtures/gold-contract/gold-authority-derivability-v1.json");
async function register(): Promise<NormalizedAuthorityRegister> {
  return JSON.parse(await fs.readFile(registerPath, "utf8"));
}
function assertion(data: NormalizedAuthorityRegister, id: string): NormalizedAuthorityAssertion {
  const found = data.assertions.find((item) => item.assertionId === id);
  if (!found) throw new Error(`Missing Gold assertion ${id}`);
  return found;
}
function candidate(id: string): F0Candidate {
  const found = f0ExecutableCandidates.find((item) => item.assertionId === id);
  if (!found) throw new Error(`Missing F0 fixture ${id}`);
  return found;
}

describe("F0 offline evaluation seam", () => {
  it("accounts for all 348 original assertions through exactly 369 normalized descendants", async () => {
    const data = await register();
    const original = await loadGoldContract();
    expect(() => assertNormalizedRegister(data)).not.toThrow();
    const originals = [...original.cases.flatMap((item) => item.assertions), ...original.global_assertions];
    expect(originals).toHaveLength(348);
    expect(data.assertions).toHaveLength(369);
    expect(new Set(data.assertions.map((item) => item.lineage.sourceAssertionId))).toEqual(new Set(originals.map((item) => item.assertion_id)));
    expect(data.assertions.filter((item) => item.lineage.preservesOriginalExpected)).toHaveLength(348);
  });

  it("executes every S1-S10 adversarial assertion and all 25 global prohibitions", async () => {
    const data = await register();
    const original = await loadGoldContract();
    const executable = data.assertions.filter((item) => ["synthetic_executable", "product_policy_executable"].includes(item.provenance.sourceExecutionStatus));
    expect(f0SyntheticCandidates).toHaveLength(31);
    expect(f0GlobalProhibitionCandidates).toHaveLength(25);
    expect(new Set(f0SyntheticCandidates.map((item) => item.assertionId.slice(0, item.assertionId.indexOf("-"))))).toEqual(new Set(Array.from({ length: 10 }, (_, i) => `S${i + 1}`)));
    expect(original.cases.filter((item) => item.case_id.startsWith("S"))).toHaveLength(10);
    expect(original.cases.filter((item) => item.case_id.startsWith("S")).every((item) => item.synthetic_input_readiness === "synthetic_input_fully_derivable" && item.synthetic_input != null)).toBe(true);
    expect(new Set(f0ExecutableCandidates.map((item) => item.assertionId))).toEqual(new Set(executable.map((item) => item.assertionId)));
    const results = evaluateF0Register(data, f0ExecutableCandidates);
    expect(results.filter((item) => item.outcome === "correct_answer")).toHaveLength(18);
    expect(results.filter((item) => item.outcome === "correct_refusal")).toHaveLength(38);
    expect(results.filter((item) => item.outcome === "source_mapping_incomplete")).toHaveLength(287);
    expect(results.filter((item) => item.outcome === "missing_source_authority")).toHaveLength(26);
    expect(results.filter((item) => item.hardFailures.length)).toHaveLength(0);
    for (const prohibited of f0GlobalProhibitionCandidates) {
      const target = assertion(data, prohibited.assertionId);
      const admitted = { ...prohibited, decision: "answer" as const, observed: true };
      const result = evaluateF0Assertion(target, admitted);
      expect(result.outcome, prohibited.assertionId).toBe("policy_mismatch");
      expect(result.hardFailures, prohibited.assertionId).toContain("unsupported_positive_admission");
    }
  });

  it("keeps reasoning, resolution, claim dimension, and authority lane independent", async () => {
    const data = await register();
    expect(assertion(data, "S8-STATE").reasoning.primaryClass).toBe("economic_structural_inference");
    expect(assertion(data, "S8-STATE").resolution.semanticStatus).toBe("unresolved");
    expect(assertion(data, "S10-SAVINGS").reasoning.primaryClass).toBe("product_policy_judgment");
    expect(assertion(data, "S10-SAVINGS").resolution.semanticStatus).toBe("unresolved");
    expect(assertion(data, "S1-NO-TIER").claim.dimension).toBe("pricing.architecture");
    expect(assertion(data, "S1-NO-TIER").authority.primaryLane).toBe("reviewed_product_policy");
    expect(assertion(data, "S1-UNDERLYING").claim.dimension).toBe("pricing.architecture");
    expect(assertion(data, "S1-UNDERLYING").authority.primaryLane).toBe("synthetic_falsification_input");
    expect(evaluateF0Assertion(assertion(data, "S1-UNDERLYING"), { ...candidate("S1-UNDERLYING"), dimension: "ownership.economic_beneficiary" }).outcome).toBe("incorrect_conclusion");
    expect(evaluateF0Assertion(assertion(data, "S1-UNDERLYING"), { ...candidate("S1-UNDERLYING"), reasoningClass: "direct_observation" }).outcome).toBe("unsupported_inference");
  });

  it("distinguishes all nine outcomes and typed abstention from unsupported positives", async () => {
    const data = await register();
    const s1 = assertion(data, "S1-UNDERLYING");
    const base = candidate("S1-UNDERLYING");
    const cases = new Map([
      ["correct_answer", evaluateF0Assertion(s1, base)],
      ["correct_refusal", evaluateF0Assertion(assertion(data, "S1-NO-TIER"), candidate("S1-NO-TIER"))],
      ["unsupported_inference", evaluateF0Assertion(s1, { ...base, authorityLanes: [] })],
      ["incorrect_conclusion", evaluateF0Assertion(s1, { ...base, observed: "interchange_plus" })],
      ["extraction_failure", evaluateF0Assertion(s1)],
      ["missing_source_authority", evaluateF0Assertion(assertion(data, "G9-RATE-INTERPRETATION"))],
      ["gold_ambiguity", evaluateF0Assertion({ ...s1, resolution: { ...s1.resolution, status: "gold_ambiguity" } }, base)],
      ["source_mapping_incomplete", evaluateF0Assertion(assertion(data, "G1-PRICE-UNDERLYING"))],
      ["policy_mismatch", evaluateF0Assertion(assertion(data, "S7-INSTRUCTION"), { ...candidate("S7-INSTRUCTION"), presentedAs: "financial_fact" })],
    ]);
    expect([...cases.keys()]).toEqual([...cases.values()].map((item) => item.outcome));
    expect(cases.get("correct_refusal")?.hardFailures).toEqual([]);
    expect(cases.get("unsupported_inference")?.hardFailures).toContain("unsupported_positive_admission");
    expect(evaluateF0Assertion(s1, { ...base, decision: "refuse", evidenceStatus: "missing", refusalReason: "missing_authority" }).outcome).toBe("correct_refusal");
    expect(evaluateF0Assertion(assertion(data, "S8-STATE"), { ...candidate("S8-STATE"), refusalReason: "uncertain" }).outcome).toBe("incorrect_conclusion");
    expect(evaluateF0Assertion(assertion(data, "S1-NO-TIER"), { ...candidate("S1-NO-TIER"), refusalReason: "uncertain" }).outcome).toBe("incorrect_conclusion");
  });

  it("raises four separately typed zero-tolerance failures without confidence blending", async () => {
    const data = await register();
    const s1 = assertion(data, "S1-UNDERLYING");
    const base = candidate("S1-UNDERLYING");
    expect(data.normativeRules.zeroToleranceErrors).toEqual([...zeroToleranceCategories]);
    const unsupported = evaluateF0Assertion(s1, { ...base, authorityLanes: [] });
    expect(unsupported.hardFailures).toEqual(["unsupported_positive_admission"]);
    const leakage = evaluateF0Assertion(s1, { ...base, authorityLanes: ["synthetic_falsification_input", "statement_source_document"] });
    expect(leakage.hardFailures).toContain("evidence_lane_leakage");
    const historical = evaluateF0Assertion({ ...s1, temporal: { ...s1.temporal, backProjectionProhibited: true, effectivePeriod: "2022-09" } }, { ...base, evidenceEffectiveFrom: "2024-01" });
    expect(historical.hardFailures).toContain("historical_back_projection");
    const expired = evaluateF0Assertion({ ...s1, temporal: { ...s1.temporal, effectivePeriodDependency: true, effectivePeriod: "2022-09" } }, { ...base, evidenceEffectiveFrom: "2022-01", evidenceEffectiveTo: "2022-08" });
    expect(expired.outcome).toBe("unsupported_inference");
    expect(expired.hardFailures).toEqual(["unsupported_positive_admission"]);
    const actualHistoricalGate = evaluateF0Assertion(assertion(data, "G1-PRICE-UNDERLYING"), { ...base, assertionId: "G1-PRICE-UNDERLYING", evidenceEffectiveFrom: "2024-01" });
    expect(actualHistoricalGate.hardFailures).toContain("historical_back_projection");
    expect(actualHistoricalGate.outcome).toBe("unsupported_inference");
    const privateLane = evaluateF0Assertion({ ...s1, authority: { ...s1.authority, primaryLane: "merchant_private_contract_or_correspondence", requiredLanes: ["merchant_private_contract_or_correspondence"] } }, { ...base, authorityLanes: ["merchant_private_contract_or_correspondence"], universality: "universal_acquiring_accounting" });
    expect(privateLane.hardFailures).toContain("merchant_private_to_global_unreviewed_promotion");
    expect(privateLane.hardFailures).not.toContain("evidence_lane_leakage");
    expect([unsupported, leakage, historical, privateLane].every((item) => item.outcome === "unsupported_inference")).toBe(true);
  });

  it("keeps real-case source readiness and frozen semantics separate", async () => {
    const data = await register();
    const results = evaluateF0Register(data, []);
    for (const item of results.filter((result) => /^G[1-8]$/.test(result.caseId))) {
      expect(item.outcome).toBe("source_mapping_incomplete");
      expect(item.sourceExecutionStatus).toBe("not_source_executable");
    }
    expect(results.filter((item) => /^G[1-8]$/.test(item.caseId))).toHaveLength(287);
    expect(results.filter((item) => item.caseId === "G6")).toHaveLength(38);
    expect(results.filter((item) => item.caseId === "G6").every((item) => item.sourceIdentityStatus === "unresolved_identity")).toBe(true);
    expect(results.filter((item) => item.caseId === "G9")).toHaveLength(26);
    expect(results.filter((item) => item.caseId === "G9").every((item) => item.outcome === "missing_source_authority" && item.sourceExecutionStatus === "source_unavailable")).toBe(true);
    expect(assertion(data, "G1-PRICE-UNDERLYING").resolution.semanticStatus).toBe("supported");
    expect(evaluateF0Assertion(assertion(data, "G1-PRICE-UNDERLYING"), { ...candidate("S1-UNDERLYING"), assertionId: "G1-PRICE-UNDERLYING" }).hardFailures).toContain("unsupported_positive_admission");
    expect(data.assertions.filter((item) => item.caseId.startsWith("G")).every((item) => item.provenance.sourceExecutionStatus !== "source_executable")).toBe(true);
  });

  it("requires semantic-theme coverage to preserve economic and evidence boundaries", async () => {
    const data = await register();
    const sourceGatedTheme = assertion(data, "G1-THEME-PRICE-LAYER");
    const isolatedComparatorFixture: NormalizedAuthorityAssertion = {
      ...sourceGatedTheme,
      provenance: { ...sourceGatedTheme.provenance, sourceExecutionStatus: "synthetic_executable" },
      temporal: { ...sourceGatedTheme.temporal, effectivePeriodDependency: false },
    };
    const observed = {
      semanticThemeCodes: ["THEME_PRICING_LAYER_OVER_SEPARATE_INTERCHANGE"],
      preservesEconomicMeaning: true,
      preservesEvidenceBoundaries: true,
      preservesActionability: true,
      overstatesCertainty: false,
      createsUnsupportedSavingsOrActionability: false,
    };
    const output: F0Candidate = {
      assertionId: sourceGatedTheme.assertionId, decision: "answer", observed,
      dimension: sourceGatedTheme.claim.dimension, reasoningClass: "product_policy_judgment",
      authorityLanes: ["reviewed_product_policy"], evidenceStatus: "verified",
      presentedAs: "product_policy", universality: "product_policy_only",
    };
    expect(evaluateF0Assertion(isolatedComparatorFixture, output).outcome).toBe("correct_answer");
    expect(evaluateF0Assertion(isolatedComparatorFixture, { ...output, observed: { ...observed, preservesEvidenceBoundaries: false } }).outcome).toBe("incorrect_conclusion");
    expect(evaluateF0Assertion(sourceGatedTheme, output).outcome).toBe("unsupported_inference");
  });

  it("rejects duplicate or unknown candidate IDs and mutated adversarial outputs", async () => {
    const data = await register();
    expect(() => evaluateF0Register(data, [candidate("S1-UNDERLYING"), candidate("S1-UNDERLYING")])).toThrow(/Duplicate/);
    expect(() => evaluateF0Register(data, [{ ...candidate("S1-UNDERLYING"), assertionId: "UNKNOWN" }])).toThrow(/Unknown/);
    for (const id of ["S1-NO-TIER", "S2-NO-COLLAPSE-IC", "S3-NO-REPLACE", "S4-NO-GROSS-BURDEN", "S5-NO-OPTBLUE", "S6-NO-CONTAMINATION", "S7-NO-SECRET", "S8-NO-AI-WINNER", "S9-NO-CONVERSION", "S10-NO-SAVINGS"]) {
      const positive = { ...candidate(id), decision: "answer" as const, observed: true };
      expect(evaluateF0Assertion(assertion(data, id), positive).hardFailures, id).toContain("unsupported_positive_admission");
    }
  });
});
