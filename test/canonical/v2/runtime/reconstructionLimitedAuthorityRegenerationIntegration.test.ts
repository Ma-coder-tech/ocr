import { beforeAll, describe, expect, it } from "vitest";

import { buildGrossBasedRateDiagnostic } from "../../../../src/canonical/v2/metrics.js";
import { executeDeterministicCanonicalAnalysisRun } from "../../../../src/canonical/v2/runtime/analysisRun.js";
import {
  CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
  evaluateCanonicalRbLimitedAuthorityRegeneration,
  grantCanonicalRbLimitedAuthority,
} from "../../../../src/reconstructionKernel/index.js";
import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";
import { rescueSourceFiles } from "../../../fixtures/reconstructionKernel/rescueSourceManifest.js";

const additionalFiles = {
  "paysafe-february-2024": "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf",
  "priority-payment-systems-december-2024": "test/fixtures/pdfs/fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "paysafe-zero-volume-september-2025": "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
} as const;
const files = { ...rescueSourceFiles, ...additionalFiles };
type CaseId = keyof typeof files;
const documents = new Map<CaseId, ParsedDocument>();

function execute(caseId: CaseId, regeneration: boolean) {
  return executeDeterministicCanonicalAnalysisRun({
    runId: `limited-authority-regeneration-${caseId}`,
    sourceDocumentRef: files[caseId],
    document: documents.get(caseId)!,
    executionContext: "evaluation_compatibility",
    ...(regeneration ? { reconstructionLimitedAuthorityRegeneration: { enabled: true as const } } : {}),
  });
}

beforeAll(async () => {
  await Promise.all((Object.entries(files) as Array<[CaseId, string]>).map(async ([caseId, pdfPath]) => {
    documents.set(caseId, await parsePdf(pdfPath));
  }));
}, 30_000);

describe("isolated RB dependency regeneration from limited Kernel authority", () => {
  it("regenerates the BASYS average-ticket dependency and local controls without changing the analysis run", () => {
    const baseline = execute("basys-march-2020", false);
    const evaluated = execute("basys-march-2020", true);
    const result = evaluated.diagnostics.reconstructionLimitedAuthorityRegeneration!;

    expect(evaluated.run).toEqual(baseline.run);
    expect(result).toMatchObject({
      status: "regenerated",
      executionBoundary: "isolated_evaluation_rb_dependency_graph",
      productionUse: "prohibited",
      canonicalPersistence: "none",
      downstreamExecution: "prohibited",
      authorityScope: CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
      application: {
        appliedPopulationKeys: CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
        changedPopulationKeys: CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
        confirmedPopulationKeys: [],
      },
      integrity: {
        baseFoundationUnchanged: true,
        nonAllowlistedPopulationsUnchanged: true,
        unrelatedFoundationFieldsUnchanged: true,
        protectedDownstreamArtifactsUnchanged: true,
        onlyAllowlistedPopulationKeysChanged: true,
        onlyDeclaredDependencyNodesChanged: true,
        resultHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      errors: [],
    });
    expect(result.projection.metrics.headlineAverageTicket).toMatchObject({
      state: "defined",
      value: { amountMinor: 5_175, currency: "USD" },
      calculationRef: "calc_v2_headline_average_ticket",
    });
    expect(result.projection.calculations).toContainEqual(expect.objectContaining({
      id: "calc_v2_headline_average_ticket",
      formula: "gross_sales_divided_by_gross_sale_count",
    }));
    expect(result.changes).toContainEqual(expect.objectContaining({
      kind: "calculation",
      nodeId: "calc_v2_headline_average_ticket",
    }));
    expect(result.projection.calculationPermissions.headlineAverageTicket).toMatchObject({
      before: { state: "withheld" },
      after: { state: "permitted" },
    });
    expect(controlStates(result, "gross_refund_equals_net_submitted")).toEqual(["unresolved", "pass"]);
    expect(controlStates(result, "gross_refund_count_equals_submitted_count")).toEqual(["unresolved", "pass"]);
  });

  it("keeps the gross-rate configuration gate closed and preserves non-dependent headline rate", () => {
    const evaluated = execute("basys-march-2020", true);
    const rb = evaluated.run.artifacts.rb!;
    const result = evaluated.diagnostics.reconstructionLimitedAuthorityRegeneration!;

    expect(result.projection.metrics.headlineEffectiveRate).toEqual(rb.metrics.headlineEffectiveRate);
    expect(result.projection.metrics.grossBasedRateDiagnostic).toBeNull();
    expect(result.projection.calculationPermissions.headlineEffectiveRate).toMatchObject({
      before: { state: "preserved" }, after: { state: "preserved" },
    });
    expect(result.projection.calculationPermissions.grossBasedRateDiagnostic).toMatchObject({
      before: { state: "not_configured" }, after: { state: "not_configured" },
    });
    expect(result.changes.map((item) => item.nodeId)).not.toContain("metric_v2_headline_effective_rate");
    expect(result.changes.map((item) => item.nodeId)).not.toContain("metric_v2_gross_based_rate_diagnostic");
  });

  const expected = {
    "basys-march-2020": { applied: 5, changed: 5, averageState: "defined", amountControl: "pass", countControl: "pass" },
    "paysafe-october-2025": { applied: 2, changed: 2, averageState: "unavailable_denominator", amountControl: "pass", countControl: "unresolved" },
    "wells-fargo-september-2024": { applied: 5, changed: 2, averageState: "defined", amountControl: "pass", countControl: "pass" },
    "clover-duplicate-resubmission": { applied: 3, changed: 1, averageState: "defined", amountControl: "pass", countControl: "pass" },
    "vortax-september-2022": { applied: 2, changed: 2, averageState: "unavailable_denominator", amountControl: "pass", countControl: "unresolved" },
    "paysafe-february-2024": { applied: 0, changed: 0, averageState: "unavailable_numerator", amountControl: "unresolved", countControl: "unresolved" },
    "priority-payment-systems-december-2024": { applied: 2, changed: 2, averageState: "unavailable_denominator", amountControl: "pass", countControl: "unresolved" },
    "paysafe-zero-volume-september-2025": { applied: 0, changed: 0, averageState: "unavailable_numerator", amountControl: "unresolved", countControl: "unresolved" },
  } as const;

  for (const caseId of Object.keys(expected) as CaseId[]) {
    it(`regenerates only declared RB-local dependencies for ${caseId}`, () => {
      const baseline = execute(caseId, false);
      const evaluated = execute(caseId, true);
      const result = evaluated.diagnostics.reconstructionLimitedAuthorityRegeneration!;
      const expectedCase = expected[caseId];

      expect(evaluated.run).toEqual(baseline.run);
      expect(result.application.appliedPopulationKeys).toHaveLength(expectedCase.applied);
      expect(result.application.changedPopulationKeys).toHaveLength(expectedCase.changed);
      expect(result.projection.metrics.headlineAverageTicket.state).toBe(expectedCase.averageState);
      if (expectedCase.averageState === "defined") {
        expect(result.projection.metrics.headlineAverageTicket.value).toEqual(expect.any(Object));
      } else {
        expect(result.projection.metrics.headlineAverageTicket.value).toBeNull();
      }
      expect(result.projection.relationshipControls.after.find((item) =>
        item.id === "gross_refund_equals_net_submitted")?.state).toBe(expectedCase.amountControl);
      expect(result.projection.relationshipControls.after.find((item) =>
        item.id === "gross_refund_count_equals_submitted_count")?.state).toBe(expectedCase.countControl);
      expect(result.integrity).toMatchObject({
        baseFoundationUnchanged: true,
        nonAllowlistedPopulationsUnchanged: true,
        unrelatedFoundationFieldsUnchanged: true,
        protectedDownstreamArtifactsUnchanged: true,
        onlyAllowlistedPopulationKeysChanged: true,
        onlyDeclaredDependencyNodesChanged: true,
      });
      expect(result.errors).toEqual([]);
      expect(result.status).toBe(expectedCase.applied > 0 ? "regenerated" : "no_authority_applied");
    });
  }

  it("does not execute or mutate RC through RH, permissions, attention, actions, or reports", () => {
    const baseline = execute("basys-march-2020", false);
    const evaluated = execute("basys-march-2020", true);

    expect(evaluated.run.artifacts.rc).toEqual(baseline.run.artifacts.rc);
    expect(evaluated.run.artifacts.rfResolution).toEqual(baseline.run.artifacts.rfResolution);
    expect(evaluated.run.artifacts.rd).toEqual(baseline.run.artifacts.rd);
    expect(evaluated.run.artifacts.re).toEqual(baseline.run.artifacts.re);
    expect(evaluated.run.artifacts.unresolvedClaims).toEqual(baseline.run.artifacts.unresolvedClaims);
    expect(evaluated.run.artifacts.rgWorkLedger).toEqual(baseline.run.artifacts.rgWorkLedger);
    expect(evaluated.run.artifacts.rh).toEqual(baseline.run.artifacts.rh);
    expect(evaluated.run.canonicalTruthHash).toBe(baseline.run.canonicalTruthHash);
    expect(evaluated.run.financialFoundationHash).toBe(baseline.run.financialFoundationHash);
    expect(evaluated.run.semanticHash).toBe(baseline.run.semanticHash);
    expect(evaluated.run.canonicalStateHash).toBe(baseline.run.canonicalStateHash);
  });

  it("fails closed in Production and on a mismatched or contradictory source overlay", () => {
    expect(() => executeDeterministicCanonicalAnalysisRun({
      runId: "production-regeneration-prohibited",
      sourceDocumentRef: files["basys-march-2020"],
      document: documents.get("basys-march-2020")!,
      executionContext: "production",
      reconstructionLimitedAuthorityRegeneration: { enabled: true },
    })).toThrow("RECONSTRUCTION_AUTHORITY_REGENERATION_REQUIRES_EVALUATION_CONTEXT");

    const basys = execute("basys-march-2020", false).run.artifacts.rb!;
    const mismatchedAuthority = grantCanonicalRbLimitedAuthority({
      document: documents.get("wells-fargo-september-2024")!,
      sourceDocumentRef: basys.identity.sourceDocumentRef,
      foundation: basys,
      executionContext: "evaluation_compatibility",
    });
    const mismatch = evaluateCanonicalRbLimitedAuthorityRegeneration({
      foundation: basys,
      authority: mismatchedAuthority,
      protectedDownstreamArtifacts: { marker: "unchanged" },
      executionContext: "evaluation_compatibility",
    });
    expect(mismatch.status).toBe("no_authority_applied");
    expect(mismatch.application.appliedPopulationKeys).toEqual([]);
    expect(mismatch.projection.financialPopulations).toEqual(basys.financialPopulations);
    expect(mismatch.changes).toEqual([]);

    const corruptedAuthority = structuredClone(mismatchedAuthority);
    (corruptedAuthority as { allowlistedPopulations: readonly string[] }).allowlistedPopulations = ["grossSaleVolume"];
    const corrupted = evaluateCanonicalRbLimitedAuthorityRegeneration({
      foundation: basys,
      authority: corruptedAuthority,
      protectedDownstreamArtifacts: { marker: "unchanged" },
      executionContext: "evaluation_compatibility",
    });
    expect(corrupted.status).toBe("failed");
    expect(corrupted.errors).toContain("authority_allowlist_does_not_match_product_approved_scope");
    expect(corrupted.projection.financialPopulations).toEqual(basys.financialPopulations);
    expect(corrupted.projection.metrics).toEqual(basys.metrics);
    expect(corrupted.projection.calculations).toEqual(basys.calculations);
    expect(corrupted.changes).toEqual([]);

    const contradictoryFoundation = structuredClone(basys);
    contradictoryFoundation.financialPopulations.grossSaleVolume = {
      ...contradictoryFoundation.financialPopulations.grossSaleVolume,
      status: "available",
      value: { amountMinor: 1, currency: "USD" },
      confidence: "high",
    };
    const contradictoryAuthority = grantCanonicalRbLimitedAuthority({
      document: documents.get("basys-march-2020")!,
      sourceDocumentRef: contradictoryFoundation.identity.sourceDocumentRef,
      foundation: contradictoryFoundation,
      executionContext: "evaluation_compatibility",
    });
    const contradiction = evaluateCanonicalRbLimitedAuthorityRegeneration({
      foundation: contradictoryFoundation,
      authority: contradictoryAuthority,
      protectedDownstreamArtifacts: { marker: "unchanged" },
      executionContext: "evaluation_compatibility",
    });
    expect(contradiction.application.appliedPopulationKeys).not.toContain("grossSaleVolume");
    expect(contradiction.projection.financialPopulations.grossSaleVolume.value).toEqual({ amountMinor: 1, currency: "USD" });
  });

  it("regenerates a pre-configured gross-rate diagnostic but does not create the permission itself", () => {
    const baselineExecution = execute("basys-march-2020", false);
    const foundation = structuredClone(baselineExecution.run.artifacts.rb!);
    const configured = buildGrossBasedRateDiagnostic({
      fees: foundation.financialPopulations.totalStatementProcessingFees,
      grossSales: foundation.financialPopulations.grossSaleVolume,
    });
    foundation.metrics.grossBasedRateDiagnostic = configured.metric;
    const authority = grantCanonicalRbLimitedAuthority({
      document: documents.get("basys-march-2020")!,
      sourceDocumentRef: foundation.identity.sourceDocumentRef,
      foundation,
      executionContext: "evaluation_compatibility",
    });
    const result = evaluateCanonicalRbLimitedAuthorityRegeneration({
      foundation,
      authority,
      protectedDownstreamArtifacts: null,
      executionContext: "evaluation_compatibility",
    });

    expect(configured.metric.state).toBe("unavailable_denominator");
    expect(result.projection.metrics.grossBasedRateDiagnostic).toMatchObject({
      state: "defined",
      calculationRef: "calc_v2_gross_based_rate_diagnostic",
    });
    expect(result.projection.calculationPermissions.grossBasedRateDiagnostic).toMatchObject({
      before: { state: "withheld" }, after: { state: "permitted" },
    });
  });
});

function controlStates(
  result: NonNullable<ReturnType<typeof execute>["diagnostics"]["reconstructionLimitedAuthorityRegeneration"]>,
  id: "gross_refund_equals_net_submitted" | "gross_refund_count_equals_submitted_count",
) {
  return [
    result.projection.relationshipControls.before.find((item) => item.id === id)?.state,
    result.projection.relationshipControls.after.find((item) => item.id === id)?.state,
  ];
}
