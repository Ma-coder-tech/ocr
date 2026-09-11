import { describe, expect, it } from "vitest";

import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { applyHelcimDharmaCaptureRemediationV1, loadHelcimDharmaCaptureRemediationBaselineV1 } from "../../src/canonical/commercialSourceCaptureRemediationHelcimDharmaV1.js";
import { applyImmutableCapturesToCommercialRegistryV1, loadImmutableCommercialSourceCaptureBaselineV1 } from "../../src/canonical/commercialImmutableSourceCaptureBaselineV1.js";
import { HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { buildInternalCommercialComparisonFindingV1, type InternalComparisonEconomicsV1 } from "../../src/canonical/internalCommercialComparisonFindingV1.js";
import { comparatorConsumptionProductTestMatrixV01, evaluateComparatorConsumptionDiagnosticV1 } from "../../scripts/lib/comparatorConsumptionRefusalDiagnosticV1.js";

const prior = await loadImmutableCommercialSourceCaptureBaselineV1();
const authorize = applyImmutableCapturesToCommercialRegistryV1({ registry: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, baseline: prior });
const before = applyImmutableCapturesToCommercialRegistryV1({ registry: HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, baseline: prior });
const remediation = await loadHelcimDharmaCaptureRemediationBaselineV1({ priorBaseline: prior });
const batch1B = applyHelcimDharmaCaptureRemediationV1({ registry: before, baseline: remediation });
const diagnostics = comparatorConsumptionProductTestMatrixV01().map((testCase) => evaluateComparatorConsumptionDiagnosticV1({ testCase, registries: [authorize, batch1B] }));
const diagnostic = (id: string) => diagnostics.find((item) => item.caseId === id)!;
const finding = (id: string, economics: InternalComparisonEconomicsV1 | null = null) => buildInternalCommercialComparisonFindingV1({ acceptedDiagnostic: diagnostic(id), currentProvider: "Wells Fargo/Fiserv family", statementFamily: "supported_fiserv", currentEvidenceRefs: [`statement_row:${id}`], economics });
const exactEconomics: InternalComparisonEconomicsV1 = { currency: "USD", unitLabel: "per authorization", matchedPopulationCount: 5_000, currentUnitPriceMinor: 11, alternativeUnitPriceMinor: 8, currentAmount: { state: "EXACT", amountMinor: 55_000 }, alternativeAmount: { state: "EXACT", amountMinor: 40_000 } };

describe("Internal Commercial Comparison Finding v1", () => {
  it("maps every accepted diagnostic strength to an equally narrow internal finding", () => {
    const findings = diagnostics.map((item) => buildInternalCommercialComparisonFindingV1({ acceptedDiagnostic: item, currentProvider: "current_provider", statementFamily: "supported_fiserv", currentEvidenceRefs: [] }));
    expect(findings).toHaveLength(38);
    expect(findings.filter((item) => item.status === "VALID_EXACT_COMPONENT_COMPARISON")).toHaveLength(6);
    expect(findings.filter((item) => item.status === "VALID_BOUNDED_COMPONENT_COMPARISON")).toHaveLength(3);
    expect(findings.filter((item) => item.status === "VALID_CONDITIONAL_COMPONENT_COMPARISON")).toHaveLength(13);
    expect(findings.filter((item) => item.status === "COMPARISON_UNAVAILABLE")).toHaveLength(16);
  });

  it("calculates an exact matched component difference without calling it savings", () => {
    const result = finding("X-01", exactEconomics);
    expect(result.status).toBe("VALID_EXACT_COMPONENT_COMPARISON");
    expect(result.economics).toMatchObject({ unitDifferenceMinor: 3, matchedPopulationCount: 5_000, currentAmountMinor: 55_000, alternativeAmountMinor: 40_000, matchedComponentDifference: { state: "EXACT", currentMinusAlternativeMinor: 15_000 } });
    expect(result.conclusion.whatThisProves).toContain("$150.00 more");
    expect(result.permissions.savingsClaimAllowed).toBe(false);
  });

  it("preserves public-offer qualification and approval conditions around exact arithmetic", () => {
    const result = finding("D-01", exactEconomics);
    expect(result.status).toBe("VALID_CONDITIONAL_COMPONENT_COMPARISON");
    expect(result.conclusion.whatThisProves).toMatch(/^If the merchant qualifies for and is approved under Standard Retail/);
    expect(result.conclusion.whatThisProves).toContain("$150.00 more");
    expect(result.conclusion.whatThisDoesNotProve.join(" ")).toContain("merchant approval");
    expect(result.action.signal).toBe("REVIEW_CURRENT_PRICING");
    expect(result.action.possibleMerchantAction).toBe("Ask the current processor whether this pricing component can be reviewed.");
  });

  it("does not turn a favorable current upper bound into an exact difference", () => {
    const result = finding("X-02", { ...exactEconomics, currentUnitPriceMinor: null, alternativeUnitPriceMinor: null, matchedPopulationCount: null, currentAmount: { state: "UPPER_BOUND", amountMinor: 50_000 }, alternativeAmount: { state: "EXACT", amountMinor: 35_000 } });
    expect(result.status).toBe("VALID_BOUNDED_COMPONENT_COMPARISON");
    expect(result.economics.matchedComponentDifference).toEqual({ state: "DIRECTIONAL_BOUND", currentMinusAlternativeMinor: null, alternativeExceedsCurrentByAtLeastMinor: null });
    expect(result.conclusion.whatThisProves).toContain("at or below $500.00");
    expect(result.conclusion.whatThisProves).toContain("does not establish an exact difference or savings amount");
    expect(result.action.signal).toBe("NONE");
  });

  it("allows the adverse direction when the candidate exceeds the current ceiling", () => {
    const result = finding("X-03", { ...exactEconomics, currentUnitPriceMinor: null, alternativeUnitPriceMinor: null, matchedPopulationCount: null, currentAmount: { state: "UPPER_BOUND", amountMinor: 50_000 }, alternativeAmount: { state: "EXACT", amountMinor: 60_000 } });
    expect(result.economics.matchedComponentDifference).toEqual({ state: "DIRECTIONAL_BOUND", currentMinusAlternativeMinor: null, alternativeExceedsCurrentByAtLeastMinor: 10_000 });
    expect(result.conclusion.whatThisProves).toContain("at least $100.00 more expensive");
    expect(result.permissions.processorOrOverallGradeAllowed).toBe(false);
  });

  it("turns a refused diagnostic into an explanatory finding with no arithmetic", () => {
    const result = finding("H-04");
    expect(result.status).toBe("COMPARISON_UNAVAILABLE");
    expect(result.conclusion.whatThisProves).toContain("merchant mix is unresolved");
    expect(result.conclusion.whatThisProves).toContain("CP versus CNP volume and transaction split");
    expect(result.economics.matchedComponentDifference.state).toBe("NOT_ESTABLISHED");
    expect(result.action.signal).toBe("NONE");
  });

  it("rejects arithmetic attached to a refused diagnostic", () => {
    expect(() => finding("H-04", exactEconomics)).toThrow(/refused diagnostic cannot carry comparison arithmetic/i);
  });

  it("rejects a diagnostic that attempts to grant a prohibited downstream permission", () => {
    const unsafe = structuredClone(diagnostic("X-01")) as any;
    unsafe.claimPermissions.preciseSavingsClaimAllowed = true;
    expect(() => buildInternalCommercialComparisonFindingV1({ acceptedDiagnostic: unsafe, currentProvider: "current", statementFamily: "supported_fiserv", currentEvidenceRefs: [] })).toThrow(/stronger permissions disabled/i);
  });

  it("keeps every prohibited customer, grade, savings, switching, and mutation permission false", () => {
    for (const id of ["X-01", "D-01", "X-02", "X-03", "H-04"]) {
      const result = finding(id, id === "X-01" || id === "D-01" ? exactEconomics : id === "X-02" ? { ...exactEconomics, currentUnitPriceMinor: null, alternativeUnitPriceMinor: null, matchedPopulationCount: null, currentAmount: { state: "UPPER_BOUND", amountMinor: 50_000 }, alternativeAmount: { state: "EXACT", amountMinor: 35_000 } } : id === "X-03" ? { ...exactEconomics, currentUnitPriceMinor: null, alternativeUnitPriceMinor: null, matchedPopulationCount: null, currentAmount: { state: "UPPER_BOUND", amountMinor: 50_000 }, alternativeAmount: { state: "EXACT", amountMinor: 60_000 } } : null);
      expect(Object.entries(result.permissions).filter(([key]) => key !== "internalAnalystFindingAllowed").every(([, value]) => value === false)).toBe(true);
    }
  });
});
