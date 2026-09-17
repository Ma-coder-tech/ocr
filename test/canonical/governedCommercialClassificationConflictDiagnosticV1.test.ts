import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const evaluation = JSON.parse(readFileSync(
  "evaluations/governed-commercial-classification-conflict-diagnostic-v1/evaluation-2026-09-09.json",
  "utf8",
));

describe("Governed Commercial Classification Conflict Diagnostic v1", () => {
  it("reviews exactly the 37 preserved E1/E2 rows and reconciles them into eight families", () => {
    expect(evaluation.summary.totalRowsReviewed).toBe(37);
    expect(evaluation.summary.rootCauseFamilies).toBe(8);
    expect(evaluation.rows).toHaveLength(37);
    expect(evaluation.families).toHaveLength(8);
    expect(evaluation.families.reduce((sum: number, family: any) => sum + family.rowCount, 0)).toBe(37);
    expect(evaluation.families.reduce((sum: number, family: any) => sum + family.affectedDollarsMinor, 0))
      .toBe(evaluation.summary.totalAffectedDollarsMinor);
  });

  it("keeps identity/layer separate from full-dollar provider attribution", () => {
    expect(evaluation.rows.every((row: any) => row.commercialDiagnosticTreatment.fullBilledAmountAssignedToProvider === false)).toBe(true);
    expect(evaluation.rows.filter((row: any) => row.familyId === "MC_NETWORK_ACCESS_ALIAS_AND_LAYER_PRECEDENCE")).toHaveLength(2);
    expect(evaluation.rows.filter((row: any) => row.familyId === "VISA_INTERNATIONAL_SERVICE_FALLBACK_PRECEDENCE")).toHaveLength(4);
    expect(evaluation.rows.filter((row: any) => row.familyId === "TIERED_QUALIFICATION_ROW_VS_DOLLAR_COMPOSITION")).toHaveLength(15);
    expect(evaluation.summary.assessments.BOTH_CAN_COEXIST_DIFFERENT_FIELDS_OR_SCOPES).toBe(23);
  });

  it("routes only the bounded historical evidence gaps to future research", () => {
    const researchRows = evaluation.rows.filter((row: any) => row.researchDisposition === "BOUNDED_DOMAIN_RESEARCH_BEFORE_PRODUCT_ADJUDICATION");
    expect(researchRows).toHaveLength(6);
    expect(researchRows.map((row: any) => row.printedLabel)).toEqual(expect.arrayContaining([
      "AMEX ACQ - PROGRAM COST FEE - AX .003 DISC RATE TIMES $6519.6",
      "VISA - VISA INTL SERVICE FEE - BASE",
      "MASTERCARD - KILOBYTE AUTH FEE US",
      "MASTERCARD - MC DISPUTE IMAGE FEE",
      "MASTERCARD - MC DISPUTE CASE FEE",
      "VISA - VISA DISPUTE NO ACCEPT",
    ]));
  });

  it("preserves canonical truth and all diagnostic-only safety boundaries", () => {
    expect(evaluation.statementFingerprints).toHaveLength(11);
    expect(evaluation.statementFingerprints.every((item: any) => item.invariant && item.before === item.after)).toBe(true);
    expect(evaluation.summary.canonicalFingerprintChanges).toBe(0);
    expect(evaluation.scope).toMatchObject({
      diagnosticOnly: true,
      aiOrWebResearchExecuted: false,
      governedKnowledgeMutation: false,
      commercialRoleMutation: false,
      researchWarrantMutation: false,
      canonicalMutation: false,
      customerRenderingMutation: false,
    });
    expect(Object.values(evaluation.invariants).every(Boolean)).toBe(true);
  });
});
