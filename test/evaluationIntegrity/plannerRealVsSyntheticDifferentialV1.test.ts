import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { ShadowAiEconomicResolutionPacketV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  pathLevelDifferentialV1,
  providerVisibleIdentifierAuditV1,
  reconstructRealVsSyntheticPlannerRequestsV1,
  safeRequestComparisonViewV1,
  validateRealAuthorizationRequestConsistencyV1,
} from "../../src/evaluationIntegrity/plannerRealVsSyntheticDifferentialV1.js";
import { inspectPlannerProviderCompatibilityV1 } from "../../src/evaluationIntegrity/plannerProviderCompatibilityDiagnosticsV1.js";

const HISTORICAL_PATH = "evaluations/issue-diversity-shadow-ai-economic-analyst-pilot-v1/evaluation-2026-09-15.json";
const ARTIFACT_PATH = "evaluations/planner-real-vs-synthetic-differential-v1/differential-2026-09-16.json";

describe("real-vs-synthetic planner request differential v1", () => {
  it("reconstructs both exact request anchors deterministically without network activity", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = reconstruct();
    const second = reconstruct();
    const synthetic = inspectPlannerProviderCompatibilityV1(first.requests.syntheticCall3);
    const real = inspectPlannerProviderCompatibilityV1(first.requests.realAuthorization);

    expect(synthetic).toMatchObject({
      requestBodyBytes: 9_512,
      requestBodySha256: "5018a11fe4b71ff28e24668a8d0c273b9e80829f174937224f2fae046b0ab180",
      providerSchemaBytes: 5_389,
      providerSchemaSha256: "45f4b1ec60730727ebc4a1871d008fb27a23414e7353e3ee47403cfb0ad7eb99",
      patternCount: 8,
      constCount: 15,
    });
    expect(real).toMatchObject({
      requestBodyBytes: 11_596,
      requestBodySha256: "1a73ad76d9d19a4c6f1186ccd2bbe417f4d2be2ecd4138111c5fb6e59bbaa7b0",
      providerSchemaBytes: 5_472,
      providerSchemaSha256: "9d382aab64862b3818e1e46de385170cf3f1cc392b7e335d5d33acf1e334bcb6",
      patternCount: 9,
      constCount: 13,
    });
    expect(first.requests.syntheticCall3.body).toBe(second.requests.syntheticCall3.body);
    expect(first.requests.realAuthorization.body).toBe(second.requests.realAuthorization.body);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("generates a deterministic safe path-level differential", () => {
    const first = reconstruct().differential;
    const second = reconstruct().differential;
    const classifications = first.reduce<Record<string, number>>((counts, row) => ({
      ...counts, [row.classification]: (counts[row.classification] ?? 0) + 1,
    }), {});

    expect(first).toEqual(second);
    expect(first).toHaveLength(988);
    expect(classifications).toEqual({ UNCHANGED: 498, CHANGED: 77, SYNTHETIC_ONLY: 124, REAL_ONLY: 289 });
    expect(first.every((row) => ["UNCHANGED", "CHANGED", "SYNTHETIC_ONLY", "REAL_ONLY"].includes(row.classification))).toBe(true);
  });

  it("proves the rejected real request is locally self-consistent", () => {
    const { packet, requests } = reconstruct();
    const validation = validateRealAuthorizationRequestConsistencyV1(requests.realAuthorization, packet);
    const identifiers = providerVisibleIdentifierAuditV1(requests.realAuthorization);

    expect(validation.locallySelfConsistent).toBe(true);
    expect(validation.invalidPaths).toEqual([]);
    expect(Object.values(validation.checks).every(Boolean)).toBe(true);
    expect(identifiers).toMatchObject({
      schemaName: { matchesExpectedPattern: true, asciiOnly: true, containsWhitespace: false, containsControlCharacters: false },
      issueId: { matchesExpectedPattern: true, asciiOnly: true },
      inputHash: { matchesExpectedPattern: true, asciiOnly: true },
      aliases: { count: 7, uniqueCount: 7, allTypedAliasShape: true, duplicateCount: 0 },
    });
  });

  it("keeps the committed artifact privacy-safe and records zero provider/network calls", () => {
    const packet = reconstruct().packet;
    const text = readFileSync(ARTIFACT_PATH, "utf8");
    const artifact = JSON.parse(text);
    const prohibited = [
      packet.merchantBusinessContext?.businessName,
      ...packet.sanitizedFeeLabels,
      ...packet.acceptedFactRefs,
      ...packet.currentGovernedEvidenceRefs,
      ...packet.selectedRdChargeRefs,
      ...packet.acceptedIssueRelevantActivityFacts.flatMap((fact) => [fact.factRef, ...fact.evidenceRefs]),
    ].filter((value): value is string => typeof value === "string" && value.length > 0);

    for (const value of prohibited) expect(text).not.toContain(value);
    expect(text).not.toMatch(/Bearer\s|sk-or-v1-|OPENROUTER_API_KEY|"Authorization"\s*:/);
    expect(artifact.executionBoundary).toMatchObject({ offlineOnly: true, providerCalls: 0, networkCalls: 0, compatibilityFixes: 0 });
    expect(artifact.localValidationSimulation).toMatchObject({ locallySelfConsistent: true, invalidPaths: [] });
    expect(artifact.architecture).toMatchObject({ conflictFound: false, packageBPrivacyPreserved: true, packageCStableSchemaPreserved: true, fixImplemented: false });
  });
});

function reconstruct() {
  const historical = JSON.parse(readFileSync(HISTORICAL_PATH, "utf8"));
  const execution = historical.executions.find((item: any) => item.family === "AUTHORIZATION_ECONOMICS");
  const packet = execution.packet.transmitted as ShadowAiEconomicResolutionPacketV1;
  const requests = reconstructRealVsSyntheticPlannerRequestsV1(packet);
  const differential = pathLevelDifferentialV1(safeRequestComparisonViewV1(requests.syntheticCall3), safeRequestComparisonViewV1(requests.realAuthorization));
  return { packet, requests, differential };
}
