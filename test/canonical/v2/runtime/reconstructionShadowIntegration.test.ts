import { beforeAll, describe, expect, it } from "vitest";

import { executeDeterministicCanonicalAnalysisRun } from "../../../../src/canonical/v2/runtime/analysisRun.js";
import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";
import {
  CLAIM_RECONCILIATION_POLICY,
  observeCanonicalRbReconstructionShadow,
  reconciliationTreatment,
  runCanonicalRbReconstructionShadow,
} from "../../../../src/reconstructionKernel/index.js";
import { rescueSourceFiles } from "../../../fixtures/reconstructionKernel/rescueSourceManifest.js";

const additionalSupportedFiservFiles = {
  "paysafe-february-2024": "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf",
  "priority-payment-systems-december-2024": "test/fixtures/pdfs/fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  "paysafe-zero-volume-september-2025": "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
} as const;
const duplicateSourceAliases = {
  "nxgen-payment-services-january-2022-alias": "test/fixtures/pdfs/fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf",
} as const;
const files = { ...rescueSourceFiles, ...additionalSupportedFiservFiles, ...duplicateSourceAliases };
const documents = new Map<keyof typeof files, ParsedDocument>();

function execute(caseId: keyof typeof files, shadow: boolean) {
  return executeDeterministicCanonicalAnalysisRun({
    runId: `reconstruction-shadow-${caseId}`,
    sourceDocumentRef: `fixture-${caseId}`,
    document: documents.get(caseId)!,
    executionContext: "evaluation_compatibility",
    ...(shadow ? { reconstructionShadow: { enabled: true as const } } : {}),
  });
}

beforeAll(async () => {
  await Promise.all((Object.entries(files) as Array<[keyof typeof files, string]>).map(async ([caseId, pdfPath]) => {
    documents.set(caseId, await parsePdf(pdfPath));
  }));
}, 30_000);

describe("canonical RB reconstruction shadow integration", () => {
  it("is opt-in diagnostics and leaves the complete canonical run byte-for-byte unchanged", () => {
    const withoutShadow = execute("basys-march-2020", false);
    const withShadow = execute("basys-march-2020", true);

    expect(withoutShadow.diagnostics.reconstructionShadow).toBeUndefined();
    expect(withShadow.diagnostics.reconstructionShadow).not.toBeNull();
    expect(withShadow.run).toEqual(withoutShadow.run);
    expect(withShadow.run.canonicalTruthHash).toBe(withoutShadow.run.canonicalTruthHash);
    expect(withShadow.run.financialFoundationHash).toBe(withoutShadow.run.financialFoundationHash);
    expect(withShadow.run.semanticHash).toBe(withoutShadow.run.semanticHash);
    expect(withShadow.run.canonicalStateHash).toBe(withoutShadow.run.canonicalStateHash);
  });

  it("cannot be enabled in the production execution context", () => {
    expect(() => executeDeterministicCanonicalAnalysisRun({
      runId: "production-shadow-prohibited",
      sourceDocumentRef: "fixture-production-shadow-prohibited",
      document: documents.get("basys-march-2020")!,
      executionContext: "production",
      reconstructionShadow: { enabled: true },
    })).toThrow("RECONSTRUCTION_SHADOW_REQUIRES_EVALUATION_CONTEXT");
  });

  it("reads DocumentIR evidence and no RB interpretation when reconstructing", () => {
    const shadow = execute("paysafe-october-2025", true).diagnostics.reconstructionShadow!;

    expect(shadow).toMatchObject({
      authority: "shadow_non_authoritative",
      pipelineBoundary: "post_rb_diagnostics",
      canonicalMutation: "prohibited",
      downstreamUse: "diagnostics_only",
      providerAuthority: "proposal_only_no_canonical_truth",
      status: "compared",
      inputIndependence: {
        kernelRbSemanticRoleInputs: 0,
        kernelRbContributionRoleInputs: 0,
        kernelRbRepresentationGroupInputs: 0,
        kernelRbReconciliationInputs: 0,
        kernelRbOccurrenceInputs: 0,
        rbUse: "comparison_plus_validated_source_model_category_binding",
      },
      sourceEvidence: { topLevelExtraction: "complete", familyAccepted: true },
    });
    expect(shadow.inputIndependence.documentIrObservationCount).toBeGreaterThan(0);
    expect(shadow.inputIndependence.independentControlCount).toBeGreaterThan(0);
    expect(shadow.inputIndependence.kernelProcessorPresentedCategoryInputs).toBe(1);
    expect(shadow.inputIndependence.kernelProcessorPresentedCategoryControlInputs).toBe(1);
    expect(shadow.processorPresentedCategoryBindings).toContainEqual(expect.objectContaining({
      categoryIdentity: "adjustments_chargebacks",
      disposition: "consumed_as_processor_presented_observation",
      observationRef: expect.stringMatching(/^source-model\.processor-presented-category_v2_/),
      claimRef: "shadow.financial_population.unresolvedAdjustmentChargebackAmount",
    }));
    expect(shadow.sourceEvidence.documentIrFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(shadow.reconstruction?.canonicalClaims.every((claim) =>
      claim.support === "source_observation" || claim.support === "deterministic_derivation")).toBe(true);
  });

  it("uses claim-specific reconciliation policy for pass, warning, fail, and unresolved evidence", () => {
    expect(CLAIM_RECONCILIATION_POLICY.canonicalNetSubmittedCardVolume.reconciliationDependency).toBe("none");
    expect(reconciliationTreatment("canonicalNetSubmittedCardVolume", "failed")).toBe("reject_claim");
    expect(reconciliationTreatment("totalStatementProcessingFees", "warning")).toBe("withhold_pending_proof");
    expect(reconciliationTreatment("netFundedAmount", "passing")).toBe("admit_deterministic_derivation");
    expect(reconciliationTreatment("netFundedAmount", "warning")).toBe("withhold_pending_proof");
    expect(reconciliationTreatment("netFundedAmount", "unresolved")).toBe("withhold_pending_proof");
    expect(reconciliationTreatment("netFundedAmount", "failed")).toBe("reject_claim");
    expect(reconciliationTreatment("grossSaleVolume", "passing")).toBe("preserve_direct_source_fact");
    expect(reconciliationTreatment("grossSaleVolume", "failed")).toBe("preserve_direct_source_fact");
    expect(reconciliationTreatment("settlementAdjustmentAmount", "failed")).toBe("reject_claim");
    expect(reconciliationTreatment("fundingBatchCount", "warning")).toBe("admit_deterministic_derivation");
  });

  it("limits a failed funding formula to the funded claim", () => {
    const document = structuredClone(documents.get("paysafe-october-2025")!);
    const fundedRow = document.rows.find((row) => /total amount funded to your bank/i.test(String(row.content ?? "")));
    expect(fundedRow).toBeDefined();
    fundedRow!.content = `${String(fundedRow!.content)} $0.00`;
    const foundation = execute("paysafe-october-2025", false).run.artifacts.rb!;
    const shadow = observeCanonicalRbReconstructionShadow({ document,
      sourceDocumentRef: foundation.identity.sourceDocumentRef, foundation });

    expect(shadow.reconciliationFindings).toContainEqual(expect.objectContaining({
      populationKey: "netFundedAmount", outcome: "failed", treatment: "reject_claim",
    }));
    expect(shadow.reconstruction?.canonicalClaims).toContainEqual(expect.objectContaining({
      key: "shadow.financial_population.canonicalNetSubmittedCardVolume",
    }));
    expect(shadow.reconstruction?.canonicalClaims).toContainEqual(expect.objectContaining({
      key: "shadow.financial_population.totalStatementProcessingFees",
    }));
    expect(shadow.reconstruction?.canonicalClaims).not.toContainEqual(expect.objectContaining({
      key: "shadow.financial_population.netFundedAmount",
    }));
  });

  const expectedRescueSummaries = {
    "basys-march-2020": { agree_value: 4, agree_withheld: 10, kernel_withheld_ambiguity: 0,
      kernel_rejected_rb_value: 0, kernel_diverged_value: 0, kernel_proposed_rb_withheld: 5 },
    "paysafe-october-2025": { agree_value: 4, agree_withheld: 9, kernel_withheld_ambiguity: 0,
      kernel_rejected_rb_value: 0, kernel_diverged_value: 0, kernel_proposed_rb_withheld: 6 },
    "wells-fargo-september-2024": { agree_value: 7, agree_withheld: 9, kernel_withheld_ambiguity: 1,
      kernel_rejected_rb_value: 0, kernel_diverged_value: 0, kernel_proposed_rb_withheld: 2 },
    "clover-duplicate-resubmission": { agree_value: 8, agree_withheld: 9, kernel_withheld_ambiguity: 1,
      kernel_rejected_rb_value: 0, kernel_diverged_value: 0, kernel_proposed_rb_withheld: 1 },
    "vortax-september-2022": { agree_value: 1, agree_withheld: 9, kernel_withheld_ambiguity: 0,
      kernel_rejected_rb_value: 0, kernel_diverged_value: 0, kernel_proposed_rb_withheld: 9 },
  } as const;

  for (const caseId of Object.keys(rescueSourceFiles) as Array<keyof typeof rescueSourceFiles>) {
    it(`replays independent source evidence for rescue case ${caseId}`, () => {
      const execution = execute(caseId, true);
      const shadow = execution.diagnostics.reconstructionShadow!;

      expect(execution.run.familyStatus).toBe("proven");
      expect(execution.run.artifacts.rb?.templateCapability.admissionStatus).toBe("admitted");
      expect(shadow.status).toBe("compared");
      expect(shadow.errors).toEqual([]);
      expect(shadow.sourceEvidence.topLevelExtraction).toBe("complete");
      expect(shadow.comparisons).toHaveLength(19);
      expect(shadow.summary).toEqual(expectedRescueSummaries[caseId]);
      expect(shadow.inputIndependence.kernelRbOccurrenceInputs).toBe(0);
      expect(shadow.inputIndependence.totalKernelObservationCount).toBe(
        shadow.inputIndependence.documentIrObservationCount
          + shadow.inputIndependence.sourceModelBoundObservationCount,
      );
      const combinedBinding = shadow.processorPresentedCategoryBindings[0];
      if (combinedBinding?.categoryIdentity === "chargebacks_reversals") {
        expect(combinedBinding).toMatchObject({
          disposition: "consumed_as_processor_presented_observation",
          claimRef: null,
          reasonCodes: expect.arrayContaining([
            "combined_chargebacks_reversals_preserved_without_subtype_claim",
          ]),
        });
        expect(shadow.comparisons).toContainEqual(expect.objectContaining({
          populationKey: "unresolvedAdjustmentChargebackAmount",
          kernelValue: null,
          disposition: "agree_withheld",
        }));
      }
    });
  }

  it("shows that the VORTAX result no longer depends on RB's failed generic reconciliation gate", () => {
    const shadow = execute("vortax-september-2022", true).diagnostics.reconstructionShadow!;
    expect(shadow.comparisons).toContainEqual(expect.objectContaining({
      populationKey: "canonicalNetSubmittedCardVolume",
      rbStatus: "available",
      rbValue: 4_263_808,
      kernelValue: 4_263_808,
      disposition: "agree_value",
      reasonCodes: expect.arrayContaining(["document_ir_direct_source_observation"]),
    }));
    expect(shadow.reconciliationFindings).toContainEqual(expect.objectContaining({
      populationKey: "netFundedAmount", outcome: "passing", controlState: "pass",
    }));
    expect(shadow.summary.kernel_proposed_rb_withheld).toBeGreaterThan(0);
  });

  it("preserves Clover's directly printed gross and refund facts while exposing their failed card-summary formula", () => {
    const shadow = execute("clover-duplicate-resubmission", true).diagnostics.reconstructionShadow!;

    expect(shadow.reconciliationFindings).toContainEqual(expect.objectContaining({
      populationKey: "grossSaleVolume", outcome: "failed", treatment: "preserve_direct_source_fact",
    }));
    expect(shadow.comparisons).toContainEqual(expect.objectContaining({
      populationKey: "grossSaleVolume", rbValue: 290_000, kernelValue: 290_000, disposition: "agree_value",
    }));
    expect(shadow.comparisons).toContainEqual(expect.objectContaining({
      populationKey: "refundVolume", rbValue: 50_000, kernelValue: 50_000, disposition: "agree_value",
    }));
  });

  it("withholds legacy funding-batch counts when independent source membership disagrees", () => {
    const paysafe = execute("paysafe-october-2025", true).diagnostics.reconstructionShadow!;
    const priority = execute("priority-payment-systems-december-2024", true).diagnostics.reconstructionShadow!;
    const zero = execute("paysafe-zero-volume-september-2025", true).diagnostics.reconstructionShadow!;

    expect(paysafe.comparisons).toContainEqual(expect.objectContaining({
      populationKey: "fundingBatchCount", rbValue: null, kernelValue: 9, disposition: "kernel_proposed_rb_withheld",
    }));
    expect(priority.comparisons).toContainEqual(expect.objectContaining({
      populationKey: "fundingBatchCount", rbValue: null, kernelValue: 30, disposition: "kernel_proposed_rb_withheld",
    }));
    expect(zero.comparisons).toContainEqual(expect.objectContaining({
      populationKey: "fundingBatchCount", rbValue: null, kernelValue: 0, disposition: "kernel_proposed_rb_withheld",
    }));
    expect([paysafe, priority, zero].every((result) => result.authority === "shadow_non_authoritative")).toBe(true);
  });

  const expectedAdditionalSummaries = {
    "paysafe-february-2024": { agree_value: 1, agree_withheld: 13, kernel_withheld_ambiguity: 0,
      kernel_rejected_rb_value: 0, kernel_diverged_value: 0, kernel_proposed_rb_withheld: 5 },
    "priority-payment-systems-december-2024": { agree_value: 4, agree_withheld: 6, kernel_withheld_ambiguity: 3,
      kernel_rejected_rb_value: 0, kernel_diverged_value: 0, kernel_proposed_rb_withheld: 6 },
    "paysafe-zero-volume-september-2025": { agree_value: 4, agree_withheld: 13, kernel_withheld_ambiguity: 0,
      kernel_rejected_rb_value: 0, kernel_diverged_value: 0, kernel_proposed_rb_withheld: 2 },
  } as const;

  for (const caseId of Object.keys(additionalSupportedFiservFiles) as Array<keyof typeof additionalSupportedFiservFiles>) {
    it(`observes additional supported Fiserv fixture ${caseId} without a fixture mapping`, () => {
      const shadow = execute(caseId, true).diagnostics.reconstructionShadow!;
      expect(shadow.status).toBe("compared");
      expect(shadow.errors).toEqual([]);
      expect(shadow.comparisons).toHaveLength(19);
      expect(shadow.summary).toEqual(expectedAdditionalSummaries[caseId]);
    });
  }

  it("identifies the NXGEN-named PDF as a duplicate source alias rather than independent coverage", () => {
    const vortax = execute("vortax-september-2022", true).diagnostics.reconstructionShadow!;
    const nxgenAlias = execute("nxgen-payment-services-january-2022-alias", true).diagnostics.reconstructionShadow!;

    expect(nxgenAlias.sourceEvidence.documentIrFingerprint).toBe(vortax.sourceEvidence.documentIrFingerprint);
    expect(nxgenAlias.reconstruction?.canonicalClaims.map((claim) => [claim.key, claim.value]))
      .toEqual(vortax.reconstruction?.canonicalClaims.map((claim) => [claim.key, claim.value]));
  });

  it("produces the same reconstruction after all RB semantic, contribution, representation, and reconciliation inputs are removed", () => {
    const document = documents.get("paysafe-october-2025")!;
    const foundation = execute("paysafe-october-2025", false).run.artifacts.rb!;
    const baseline = observeCanonicalRbReconstructionShadow({ document,
      sourceDocumentRef: foundation.identity.sourceDocumentRef, foundation });
    const stripped = structuredClone(foundation);
    stripped.sourceModel.occurrences = [];
    stripped.sourceModel.representationGroups = [];
    stripped.reconciliation = [];
    const independent = observeCanonicalRbReconstructionShadow({ document,
      sourceDocumentRef: foundation.identity.sourceDocumentRef, foundation: stripped });

    expect(independent.reconstruction).toEqual(baseline.reconstruction);
    expect(independent.sourceEvidence).toEqual(baseline.sourceEvidence);
    expect(independent.reconciliationFindings).toEqual(baseline.reconciliationFindings);
  });

  it("does not mutate either the parsed source or RB when called directly", () => {
    const document = documents.get("clover-duplicate-resubmission")!;
    const foundation = execute("clover-duplicate-resubmission", false).run.artifacts.rb!;
    const documentBefore = structuredClone(document);
    const foundationBefore = structuredClone(foundation);

    observeCanonicalRbReconstructionShadow({ document,
      sourceDocumentRef: foundation.identity.sourceDocumentRef, foundation });

    expect(document).toEqual(documentBefore);
    expect(foundation).toEqual(foundationBefore);
  });

  it("contains adapter failures inside the non-authoritative diagnostic", () => {
    const foundation = structuredClone(execute("basys-march-2020", false).run.artifacts.rb!);
    (foundation as unknown as { financialPopulations: null }).financialPopulations = null;
    const shadow = runCanonicalRbReconstructionShadow({
      document: documents.get("basys-march-2020")!,
      sourceDocumentRef: foundation.identity.sourceDocumentRef,
      foundation,
    });

    expect(shadow.status).toBe("failed");
    expect(shadow.reconstruction).toBeNull();
    expect(shadow.comparisons).toEqual([]);
    expect(shadow.errors[0]).toContain("failed without affecting RB");
  });
});
