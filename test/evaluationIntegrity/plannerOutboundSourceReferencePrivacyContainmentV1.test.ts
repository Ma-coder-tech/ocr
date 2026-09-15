import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const HISTORICAL = "evaluations/planner-outbound-source-reference-privacy-containment-v1/historical-six-comparison-2026-09-15.json";
const GOLD = "evaluations/planner-outbound-source-reference-privacy-containment-v1/gold-corpus-offline-validation-2026-09-15.json";

describe("Package B source-reference privacy containment artifacts", () => {
  it("records zero-leak exact round trips for the six historical requests without asserting provider success", () => {
    const artifact = JSON.parse(readFileSync(HISTORICAL, "utf8"));
    expect(artifact.providerCalls).toBe(0);
    expect(artifact.reconstructedHistoricalRequestCount).toBe(6);
    expect(artifact.aggregate).toEqual({
      rawInternalReferenceLeakageCount: 0,
      sourceIdentityLeakageCount: 0,
      reverseMapMaterialLeakageCount: 0,
      reverseMapSerializedCount: 0,
      providerPacketReferenceOnlyDiffCount: 6,
      exactReferenceRoundTripCount: 6,
      acceptedPlannerValidationCount: 6,
      unknownAliasAcceptanceCount: 0,
      classConfusionAcceptanceCount: 0,
      rawInternalReferenceAcceptanceCount: 0,
    });
    expect(artifact.compatibilityFinding.containedRequestsProviderTested).toBe(false);
    expect(artifact.compatibilityFinding.exactProviderLimitClaimed).toBe(false);
    expect(artifact.compatibilityFinding.http400ResolutionClaimed).toBe(false);
    expect(artifact.requests.every((request: any) => request.previousCompatibilityMetrics.schemaDepth === request.containedCompatibilityMetrics.schemaDepth
      && request.previousCompatibilityMetrics.schemaNodeCount === request.containedCompatibilityMetrics.schemaNodeCount
      && request.previousCompatibilityMetrics.enumNodeCount === request.containedCompatibilityMetrics.enumNodeCount
      && request.previousCompatibilityMetrics.maximumEnumCardinality === request.containedCompatibilityMetrics.maximumEnumCardinality)).toBe(true);
  });

  it("covers all 11 Gold statements and all 60 selected issues with zero leakage or authority mutation", () => {
    const artifact = JSON.parse(readFileSync(GOLD, "utf8"));
    expect(artifact.providerCalls).toBe(0);
    expect(artifact.statementCount).toBe(11);
    expect(artifact.issueCount).toBe(60);
    expect(Object.keys(artifact.issueClassDistribution).sort()).toEqual([
      "AUTHORIZATION_ECONOMICS_MISSING_EVIDENCE",
      "CONTRACT_OFF_STATEMENT_EVIDENCE_NEED",
      "COST_INCIDENCE_UNCERTAINTY",
      "PARTICIPANT_CONTROL_UNCERTAINTY",
      "QUALIFICATION_INTEGRITY_ROOT_CAUSE",
      "SHARED_BUNDLED_UNRESOLVED_FEE_SEMANTICS",
    ]);
    expect(artifact.aggregate).toMatchObject({
      rawInternalReferenceLeakageCount: 0,
      sourceIdentityLeakageCount: 0,
      reverseMapMaterialLeakageCount: 0,
      reverseMapSerializedCount: 0,
      providerPacketReferenceOnlyDiffCount: 60,
      exactReferenceRoundTripCount: 60,
      acceptedPlannerValidationCount: 60,
      unknownAliasAcceptanceCount: 0,
      classConfusionAcceptanceCount: 0,
      rawReferenceAcceptanceCount: 0,
    });
    expect(artifact.aggregate.classConfusionTestedCount).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(artifact.invariance)) {
      if (/Unchanged$/.test(key) && typeof value === "string") expect(value).toBe("11/11");
    }
    expect(artifact.invariance.commercialSourceUnchanged).toBe(true);
    expect(artifact.executionBoundary).toEqual({
      offlineOnly: true,
      providerCalls: 0,
      networkCalls: 0,
      researchOperations: 0,
      evidenceAdmissions: 0,
      customerOutputs: 0,
      productionRoutingChanges: 0,
      truthMutations: 0,
    });
  });

  it("keeps raw references, source identities, packet bodies, and reverse maps out of committed artifacts", () => {
    for (const path of [HISTORICAL, GOLD]) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toMatch(/(?:\/Users\/|\/private\/|[A-Za-z]:\\|\b\S+\.(?:pdf|md|markdown)\b|document-ir:|pdfjs-line-|srcocc_|fact_v2_|accepted_profile_fact:|economic_charge_)/i);
      expect(text).not.toContain('"referenceMap"');
      expect(text).not.toContain('"internalReference"');
      expect(text).not.toContain('"packet"');
      expect(text).not.toContain('"sanitizedFeeLabels"');
      expect(text).not.toContain('"merchantBusinessContext"');
    }
  });
});
