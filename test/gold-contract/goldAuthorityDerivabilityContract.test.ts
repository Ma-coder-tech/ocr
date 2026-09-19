import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadGoldContract } from "../../scripts/gold-contract-lib.js";
import {
  assertNormalizedRegister,
  buildNormalizedRegister,
  decomposedAssertionIds,
  jsonSchema,
  mixedAssertionIds,
  sha256File,
  type NormalizedAuthorityRegister,
} from "../../scripts/gold-authority-derivability-lib.js";

const fixtureRoot = path.resolve(process.cwd(), "test", "fixtures", "gold-contract");
const artifactRoot = path.resolve(process.cwd(), "artifacts", "gold-contract");

async function frozenRegister(): Promise<NormalizedAuthorityRegister> {
  return JSON.parse(await fs.readFile(path.join(fixtureRoot, "gold-authority-derivability-v1.json"), "utf8"));
}

describe("frozen Gold Authority & Derivability contract", () => {
  it("preserves all 348 original semantics with exact lineage into 369 independent claims", async () => {
    const source = await loadGoldContract();
    const register = await frozenRegister();
    expect(() => assertNormalizedRegister(register)).not.toThrow();
    expect(register).toEqual(buildNormalizedRegister(source));
    expect(mixedAssertionIds.size).toBe(49);
    expect(decomposedAssertionIds.size).toBe(21);
    expect(register.decomposition.reannotatedOriginalAssertionCount).toBe(28);

    for (const original of [...source.cases.flatMap((item) => item.assertions), ...source.global_assertions]) {
      const descendants = register.assertions.filter((item) => item.lineage.sourceAssertionId === original.assertion_id);
      expect(descendants.length, original.assertion_id).toBe(decomposedAssertionIds.has(original.assertion_id) ? 2 : 1);
      expect(descendants.filter((item) => item.lineage.preservesOriginalExpected).map((item) => item.claim.expected)).toEqual([original.expected_value_or_state]);
    }
  });

  it("separates Product policy, source provenance, and refusal from reasoning", async () => {
    const register = await frozenRegister();
    expect(register.counts.sourceExecutionStatus).toEqual({
      not_source_executable: 287,
      product_policy_executable: 25,
      source_unavailable: 26,
      synthetic_executable: 31,
    });
    expect(register.assertions.filter((item) => item.caseId === "G6").every((item) => item.authority.sourceIdentityStatus === "unresolved_identity")).toBe(true);
    expect(register.assertions.filter((item) => item.caseId === "G9").every((item) => item.adjudication.status === "frozen_historical_guidance")).toBe(true);
    expect(register.assertions.filter((item) => item.caseId === "GLOBAL").every((item) => item.reasoning.primaryClass === "product_policy_judgment" && item.universality === "product_policy_only")).toBe(true);
    expect(register.normativeRules.passingAbstentionOutcome).toBe("correct_refusal");
    expect(register.assertions.find((item) => item.assertionId === "G8-NO-SAVINGS")?.resolution).toMatchObject({
      status: "source_mapping_incomplete",
      semanticStatus: "refused",
      semanticEvaluationOutcome: "correct_refusal",
    });
    expect(register.normativeRules.completenessGates).toHaveLength(7);
    expect(register.normativeRules.denominatorPolicies).toHaveLength(3);
    expect(register.normativeRules.strongClaimGates).toHaveLength(6);
  });

  it("pins the schema and all four contract artifacts plus source inputs by SHA-256", async () => {
    const schema = JSON.parse(await fs.readFile(path.join(fixtureRoot, "gold-authority-derivability.schema.json"), "utf8"));
    const manifest = JSON.parse(await fs.readFile(path.join(artifactRoot, "gold-authority-derivability-freeze-manifest-v1.json"), "utf8"));
    expect(schema).toEqual(jsonSchema());
    expect(manifest.counts.productClarificationItems).toBe(0);
    expect(manifest.validation.manifestSelfHashExcluded).toBe(true);
    expect(Object.keys(manifest.hashes.contractArtifacts)).toHaveLength(4);
    expect(Object.keys(manifest.hashes.sourceInputs)).toHaveLength(5);
    for (const group of [manifest.hashes.contractArtifacts, manifest.hashes.sourceInputs]) {
      for (const [relativePath, digest] of Object.entries(group)) {
        expect(await sha256File(path.resolve(process.cwd(), relativePath)), relativePath).toBe(digest);
      }
    }
  });
});
