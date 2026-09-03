import { beforeAll, describe, expect, it } from "vitest";

import {
  RB_DEPENDENCY_REGISTRY,
  evaluateRbDependencyRegistry,
  validateCanonicalEconomicsV2Foundation,
} from "../../../../src/canonical/v2/index.js";
import { executeDeterministicCanonicalAnalysisRun } from "../../../../src/canonical/v2/runtime/analysisRun.js";
import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";

const sourceDocumentRef = "test/fixtures/pdfs/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf";
let document: ParsedDocument;

beforeAll(async () => {
  document = await parsePdf(sourceDocumentRef);
}, 30_000);

function execute() {
  return executeDeterministicCanonicalAnalysisRun({
    runId: "kernel-provenance-registry",
    sourceDocumentRef,
    document,
    executionContext: "evaluation_compatibility",
    reconstructionLimitedAuthorityRegeneration: { enabled: true },
  });
}

describe("first-class Kernel provenance in RB", () => {
  it("produces a standalone RB-valid foundation with typed Kernel evidence and proof lineage", () => {
    const result = execute().diagnostics.reconstructionLimitedAuthorityRegeneration!;
    const foundation = result.projection.rbFoundation;

    expect(result.projection.rbValidation).toEqual({ status: "valid", errors: [], warnings: expect.any(Array) });
    expect(result.integrity.projectedRbValidationPassed).toBe(true);
    expect(result.integrity.kernelEvidenceRecordCount).toBe(5);
    expect(foundation.versionManifest.kernelAuthorityMode).toBe("evaluation_limited_overlay");
    expect(validateCanonicalEconomicsV2Foundation(structuredClone(foundation)).validation.status).toBe("valid");

    for (const key of result.application.appliedPopulationKeys) {
      const fact = foundation.financialPopulations[key];
      expect(fact).toMatchObject({
        status: "available",
        confidence: "high",
        provenanceStatus: "authoritative",
        calculationRef: null,
        authorityBasis: {
          kind: "statement_reconstruction_kernel_limited_authority",
          populationKey: key,
          deterministicOnly: true,
          providerAuthority: "prohibited",
          proofHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      });
      expect(fact.evidenceRefs).not.toHaveLength(0);
      for (const evidenceRef of fact.evidenceRefs) {
        expect(foundation.sourceModel.evidence.find((item) => item.id === evidenceRef)).toMatchObject({
          documentRef: sourceDocumentRef,
          pageNumber: expect.any(Number),
          lineRef: expect.any(String),
          extractionMethod: "reconstruction_kernel_deterministic",
          redactedExcerpt: null,
          redactionApplied: true,
          kernelProof: {
            populationKey: key,
            proofHash: fact.authorityBasis!.proofHash,
          },
        });
      }
    }
  });

  it("fails standard RB validation when Kernel proof, source binding, controls, or evidence are damaged", () => {
    const valid = execute().diagnostics.reconstructionLimitedAuthorityRegeneration!.projection.rbFoundation;

    const badHash = structuredClone(valid);
    badHash.financialPopulations.grossSaleVolume.authorityBasis!.proofHash = "0".repeat(64);
    expect(validateCanonicalEconomicsV2Foundation(badHash).validation.errors)
      .toContain("Fact fact_v2_gross_sale_volume has a non-reconstructable Kernel proof hash.");

    const badSource = structuredClone(valid);
    const evidenceRef = badSource.financialPopulations.grossSaleVolume.evidenceRefs[0]!;
    badSource.sourceModel.evidence.find((item) => item.id === evidenceRef)!.kernelProof!.sourceFingerprint = "f".repeat(64);
    expect(validateCanonicalEconomicsV2Foundation(badSource).validation.errors)
      .toContain(`Kernel evidence ${evidenceRef} is bound to the wrong source fingerprint.`);

    const badControl = structuredClone(valid);
    (badControl.financialPopulations.grossSaleVolume.authorityBasis!.controlProofs[0] as { state: string }).state = "fail";
    expect(validateCanonicalEconomicsV2Foundation(badControl).validation.errors)
      .toContain("Fact fact_v2_gross_sale_volume does not carry the exact passing claim-specific Kernel controls.");

    const missingEvidence = structuredClone(valid);
    missingEvidence.sourceModel.evidence = missingEvidence.sourceModel.evidence.filter((item) => item.id !== evidenceRef);
    expect(validateCanonicalEconomicsV2Foundation(missingEvidence).validation.status).toBe("invalid");

    const noEvaluationMode = structuredClone(valid);
    delete noEvaluationMode.versionManifest.kernelAuthorityMode;
    expect(validateCanonicalEconomicsV2Foundation(noEvaluationMode).validation.errors)
      .toContain(`Kernel evidence ${evidenceRef} is prohibited outside the evaluation-limited overlay mode.`);
  });

  it("rejects an attempt to reuse Kernel evidence for a non-allowlisted RB population", () => {
    const foundation = structuredClone(execute().diagnostics.reconstructionLimitedAuthorityRegeneration!.projection.rbFoundation);
    const gross = foundation.financialPopulations.grossSaleVolume;
    foundation.financialPopulations.chargebackCount = {
      ...foundation.financialPopulations.chargebackCount,
      status: "available",
      value: 1,
      confidence: "high",
      provenanceStatus: "authoritative",
      evidenceRefs: [...gross.evidenceRefs],
      occurrenceRefs: [],
      calculationRef: null,
      authorityBasis: structuredClone(gross.authorityBasis),
    };

    expect(validateCanonicalEconomicsV2Foundation(foundation).validation.errors)
      .toContain("Fact fact_v2_chargeback_count attempts Kernel authority outside the approved population allowlist.");
  });
});

describe("declarative RB dependency registry", () => {
  it("declares fact, metric, control, calculation, and permission behavior without deriving adjacent facts", () => {
    const execution = execute();
    const result = execution.diagnostics.reconstructionLimitedAuthorityRegeneration!;
    const foundation = result.projection.rbFoundation;
    const nodeIds = RB_DEPENDENCY_REGISTRY.map((item) => item.nodeId);

    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(result.projection.dependencyRegistryValidation).toEqual({ status: "valid", errors: [] });
    expect(result.projection.dependencyRegistryNodes.map((item) => item.nodeId)).toEqual(nodeIds);
    expect(result.projection.dependencyRegistryNodes).toContainEqual(expect.objectContaining({
      nodeId: "fact_v2_canonical_net_submitted_card_volume",
      nodeKind: "fact",
      strategy: "preserve_existing_fact",
      permissionAfter: {
        state: "prohibited",
        dependencyPopulationKeys: ["grossSaleVolume", "refundVolume"],
        reasonCodes: ["limited_authority_cannot_derive_adjacent_canonical_fact"],
      },
    }));
    expect(foundation.financialPopulations.canonicalNetSubmittedCardVolume)
      .toEqual(execution.run.artifacts.rb!.financialPopulations.canonicalNetSubmittedCardVolume);
  });

  it("drives existing average-ticket and gross-rate calculations plus both controls from registered dependencies", () => {
    const result = execute().diagnostics.reconstructionLimitedAuthorityRegeneration!;
    const nodes = result.projection.dependencyRegistryNodes;

    expect(nodes).toContainEqual(expect.objectContaining({
      nodeId: "metric_v2_headline_average_ticket",
      dependencyPopulationKeys: ["grossSaleVolume", "grossSaleTransactionCount"],
      strategy: "recompute",
    }));
    expect(nodes).toContainEqual(expect.objectContaining({
      nodeId: "metric_v2_gross_based_rate_diagnostic",
      dependencyPopulationKeys: ["totalStatementProcessingFees", "grossSaleVolume"],
      strategy: "recompute_if_preconfigured",
      permissionAfter: expect.objectContaining({ state: "not_configured" }),
    }));
    expect(result.projection.relationshipControls.after).toEqual([
      expect.objectContaining({ id: "gross_refund_equals_net_submitted", state: "pass",
        dependencyPopulationKeys: ["grossSaleVolume", "refundVolume", "canonicalNetSubmittedCardVolume"] }),
      expect.objectContaining({ id: "gross_refund_count_equals_submitted_count", state: "pass",
        dependencyPopulationKeys: ["grossSaleTransactionCount", "refundTransactionCount", "submittedTransactionCount"] }),
    ]);
  });

  it("fails closed when a registered calculation or control dependency is missing or ambiguous", () => {
    const execution = execute();
    const foundation = execution.run.artifacts.rb!;
    const before = structuredClone(foundation.financialPopulations);
    const after = structuredClone(execution.diagnostics.reconstructionLimitedAuthorityRegeneration!
      .projection.financialPopulations);
    after.grossSaleTransactionCount = {
      ...after.grossSaleTransactionCount,
      status: "ambiguous",
      value: null,
      confidence: "needs_review",
    };
    after.submittedTransactionCount = {
      ...after.submittedTransactionCount,
      status: "unavailable",
      value: null,
      confidence: null,
    };

    const projection = evaluateRbDependencyRegistry({ foundation, before, after });
    expect(projection.metrics.headlineAverageTicket).toMatchObject({ state: "population_unproven", value: null });
    expect(projection.calculationPermissions.headlineAverageTicket.after.state).toBe("withheld");
    expect(projection.relationshipControls.after.find((item) =>
      item.id === "gross_refund_count_equals_submitted_count")?.state).toBe("unresolved");
    expect(projection.calculationPermissions.submittedCountControl.after.state).toBe("withheld");
    expect(projection.calculations.map((item) => item.id)).not.toContain("calc_v2_headline_average_ticket");
  });
});
