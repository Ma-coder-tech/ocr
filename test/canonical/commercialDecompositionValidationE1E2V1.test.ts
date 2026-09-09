import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const evaluation = JSON.parse(readFileSync(
  "evaluations/commercial-decomposition-validation-e1-e2-v1/evaluation-2026-09-09.json",
  "utf8",
));

describe("Commercial Decomposition Validation E1 + E2 v1 diagnostic artifact", () => {
  it("covers all 11 supported Gold statements and reconciles primary roles without mutating canonical truth", () => {
    expect(evaluation.corpus.totalStatements).toBe(11);
    expect(evaluation.statements).toHaveLength(11);
    expect(evaluation.corpus.totalMaterialFindings).toBeGreaterThan(0);
    expect(evaluation.corpus.canonicalFingerprintChanges).toBe(0);
    expect(evaluation.invariants.canonicalFingerprintInvariant).toBe(true);

    for (const statement of evaluation.statements) {
      const primaryTotal = Object.values(statement.roleTotalsMinor)
        .reduce((sum: number, value) => sum + Number(value), 0);
      expect(primaryTotal + statement.canonicalReconciliationResidualMinor).toBe(statement.totalCanonicalFeesMinor);
      expect(statement.canonicalFingerprintBefore).toBe(statement.canonicalFingerprintAfter);
      expect(statement.materialFindings).toHaveLength(statement.materialFindingCount);
      expect(statement.materialFindings.every((row: any) =>
        row.printedLabel && row.amountMinor > 0 && row.primaryRole && row.confidence && row.determinant && Array.isArray(row.evidenceRefs),
      )).toBe(true);
    }
  });

  it("passes the Wells markup-location trap using affirmative per-event price control instead of a headline percentage", () => {
    const wells = evaluation.e2WellsFargoMarkupLocationTrap;
    expect(wells.result).toBe("PASS");
    expect(wells.providerControlledVariableMinor).toBeGreaterThan(0);
    expect(wells.authorizationPerItemMinor).toBe(wells.providerControlledVariableMinor);
    expect(wells.percentagePricingMinor).toBe(0);
    expect(wells.providerVariableRows.every((row: any) =>
      row.controlScope === "affirmative_acquiring_side_control" && row.evidenceRefs.length > 0,
    )).toBe(true);
  });

  it("keeps the diagnostic bounded and refuses unsupported stronger claims", () => {
    expect(evaluation.corpus.completeEnoughForPreciseProviderResidual).toBe(0);
    expect(evaluation.corpus.commercialComparatorReady).toBe(0);
    expect(evaluation.scope).toMatchObject({
      diagnosticOnly: true,
      commercialEngineImplemented: false,
      commercialGradesImplemented: false,
      benchmarksOrNormsAdmitted: false,
      aiOrWebResearchExecuted: false,
      customerFacingAuthority: "none",
      canonicalMutationAllowed: false,
    });
    expect(evaluation.invariants).toMatchObject({
      roleAssignmentByCatalogAbsenceAllowed: false,
      exactProviderResidualWithoutCompleteness: false,
      newKnowledgeOrNormsAdmitted: false,
      aiOrWebResearchExecuted: false,
    });
    expect(evaluation.statements.every((statement: any) =>
      !statement.claimSpecificPermissions.commercialComparatorEligibility &&
      !statement.claimSpecificPermissions.overallCommercialGradeEligibility,
    )).toBe(true);
  });
});
