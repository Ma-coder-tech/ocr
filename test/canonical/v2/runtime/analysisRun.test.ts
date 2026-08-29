import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";
import {
  executeDeterministicCanonicalAnalysisRun,
  FISERV_RUNTIME_CAPABILITY_POLICY_ID,
  categorySubjectCode,
  unboundedKnowledgeScope,
} from "../../../../src/canonical/v2/index.js";
import { admittedKnowledge } from "../knowledge/knowledgeFixtures.js";

const fullFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/SAMPLE_MERCHANT4_CLOVER.pdf");
const processorFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/fiserv_ABDUL_BASHER_Aug_2025.pdf");
const genericFixture = path.resolve(process.cwd(), "test/fixtures/pdfs/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf");

describe("production canonical AnalysisRun core", () => {
  let fullDocument: ParsedDocument;
  let processorDocument: ParsedDocument;
  let genericDocument: ParsedDocument;

  beforeAll(async () => {
    [fullDocument, processorDocument, genericDocument] = await Promise.all([
      parsePdf(fullFixture), parsePdf(processorFixture), parsePdf(genericFixture),
    ]);
  }, 30_000);

  it("admits a Fiserv-family processor statement by claim-specific runtime proof without an exact layout mapping", () => {
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "runtime-capability-proof",
      sourceDocumentRef: "runtime-capability-proof-source",
      document: processorDocument,
    });

    expect(run).toMatchObject({
      status: "completed_with_limitations",
      familyStatus: "proven",
      parser: { driverId: "fiserv_first_data_processor_statement" },
      manifest: {
        executionAuthority: "production_internal_canonical",
        customerReportAuthority: "legacy_report_unchanged",
        providerExecution: "durable_claim_bound_evidence_execution",
        publicResearch: "typed_search_intent_dynamic_authority_validation",
        rfProductionKnowledge: "governed_catalog_snapshot_resolution_enabled",
        benchmarkExecution: "disabled",
        savingsExecution: "disabled",
        businessContextAuthority: "excluded_from_canonical_economics",
        goldRuntimeAuthority: "prohibited_oracle_only",
      },
      admission: {
        mappingId: FISERV_RUNTIME_CAPABILITY_POLICY_ID,
        authorityClass: "deterministic_capability_policy",
        templateAdmission: {
          identityStatus: "proven",
          admissionStatus: "admitted",
          completenessStatus: "unknown",
          admissionAuthority: { authorityClass: "deterministic_capability_policy" },
        },
      },
      knownLayoutAdmission: null,
    });
    expect(run.capabilityProof?.family.proofEvidenceRefs.length).toBeGreaterThan(0);
    expect(run.capabilityProof?.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "canonical_net_submitted_card_volume", status: "supported", basis: "deterministic_runtime_proof" }),
      expect.objectContaining({ capability: "fee_total", status: "supported", basis: "deterministic_runtime_proof" }),
      expect.objectContaining({ capability: "gross_sale_volume", status: "unknown", basis: "unresolved" }),
    ]));
    expect(run.artifacts.rb?.financialPopulations).toMatchObject({
      canonicalNetSubmittedCardVolume: { status: "available", provenanceStatus: "authoritative" },
      totalStatementProcessingFees: { status: "available", provenanceStatus: "authoritative" },
      grossSaleVolume: { status: "unavailable" },
    });
    expect(Object.values(run.stageOutcomes).every((stage) => stage.status === "valid")).toBe(true);
    expect(run.artifacts.rh?.projection.permissions.financial_metrics.state).not.toBe("denied");
  });

  it("preserves valid RB-RD truth when RE fails and accurately withholds dependent RH output", () => {
    const baseline = executeDeterministicCanonicalAnalysisRun({
      runId: "partial-baseline",
      sourceDocumentRef: "partial-source",
      document: fullDocument,
    }).run;
    const partial = executeDeterministicCanonicalAnalysisRun({
      runId: "partial-re-failure",
      sourceDocumentRef: "partial-source",
      document: fullDocument,
      stageBuilders: {
        synthesis: () => { throw new Error("injected_re_failure"); },
      },
    }).run;

    expect(partial.status).toBe("completed_with_limitations");
    expect(partial.stageOutcomes).toMatchObject({
      rb: { status: "valid" },
      rc: { status: "valid" },
      rd: { status: "valid" },
      re: { status: "failed", errors: [expect.stringContaining("injected_re_failure")] },
      claim_inventory: { status: "valid" },
      rh: { status: "unresolved", limitations: [expect.stringContaining("previously proven upstream facts remain preserved")] },
    });
    expect(partial.artifacts.rb).toEqual(baseline.artifacts.rb);
    expect(partial.artifacts.rc).toEqual(baseline.artifacts.rc);
    expect(partial.artifacts.rd).toEqual(baseline.artifacts.rd);
    expect(partial.artifacts.re).toBeNull();
    expect(partial.artifacts.unresolvedClaims).toEqual(baseline.artifacts.unresolvedClaims);
    expect(partial.artifacts.rh).toBeNull();
    expect(partial.canonicalTruthHash).not.toBeNull();
    expect(partial.canonicalTruthPreserved).toBe(true);
  });

  it("keeps claim-bound RG execution outside deterministic planning and canonical truth hashing", () => {
    const baseline = executeDeterministicCanonicalAnalysisRun({
      runId: "rg-hash-baseline",
      sourceDocumentRef: "rg-hash-source",
      document: genericDocument,
    }).run;
    const planningFailure = executeDeterministicCanonicalAnalysisRun({
      runId: "rg-hash-planning-failure",
      sourceDocumentRef: "rg-hash-source",
      document: genericDocument,
      stageBuilders: {
        rgPlanning: () => { throw new Error("injected_rg_planning_failure"); },
      },
    }).run;

    expect(baseline.artifacts.rgWorkLedger).toMatchObject({
      providerExecution: "durable_claim_bound_executor_after_planning",
      searchExecution: "typed_privacy_safe_search_intent_only",
      retrievalExecution: "independent_https_retrieval_required",
      aiExecution: "separate_investigation_and_verification_only",
      operations: [],
      validation: { status: "valid" },
    });
    expect(baseline.artifacts.rgWorkLedger?.workItems.every((item) =>
      item.executionState === "planned_for_durable_execution")).toBe(true);
    expect(planningFailure.stageOutcomes.rg_planning).toMatchObject({
      status: "failed",
      errors: [expect.stringContaining("injected_rg_planning_failure")],
    });
    expect(planningFailure.artifacts.rgWorkLedger).toBeNull();
    expect(planningFailure.artifacts.rb).toEqual(baseline.artifacts.rb);
    expect(planningFailure.artifacts.rc).toEqual(baseline.artifacts.rc);
    expect(planningFailure.artifacts.rd).toEqual(baseline.artifacts.rd);
    expect(planningFailure.artifacts.re).toEqual(baseline.artifacts.re);
    expect(planningFailure.canonicalTruthHash).toBe(baseline.canonicalTruthHash);
    expect(planningFailure.canonicalTruthPreserved).toBe(true);
  });

  it("falls through a false-positive exact parser to the reusable generic Fiserv-family parser", () => {
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "generic-family-fallback",
      sourceDocumentRef: "generic-family-source",
      document: genericDocument,
    });

    expect(run).toMatchObject({
      parser: { driverId: "generic_fiserv_family_statement" },
      familyStatus: "proven",
      admission: { authorityClass: "deterministic_capability_policy" },
    });
    expect(run.capabilityProof?.capabilities.some((capability) => capability.status === "supported")).toBe(true);
    expect(run.stageOutcomes.rb.status).toBe("valid");
    const contributing = run.artifacts.rd?.economicLayer.charges.filter((charge) =>
      charge.contributionStatus === "contributes_unresolved",
    ) ?? [];
    const signedNet = contributing.reduce((sum, charge) => sum +
      (charge.financialDirection === "credit" ? -1 : 1) * (charge.observedAmount?.amountMinor ?? 0), 0);
    expect(run.artifacts.rd?.economicLayer.admissionProfile.source).toBe("runtime_capability");
    expect(contributing.length).toBeGreaterThan(0);
    expect(signedNet).toBe(run.artifacts.rb?.financialPopulations.totalStatementProcessingFees.value?.amountMinor);
    expect(run.artifacts.rd?.economicLayer.costStack).toMatchObject({
      completeness: "partial_but_financially_reconciled",
      reconciliationDeltaMinor: 0,
    });
    expect(contributing.every((charge) => charge.category === "unresolved_unclassified" &&
      charge.categoryResolution === "unresolved" && charge.roleClaimRefs.length === 0)).toBe(true);
    expect(run.artifacts.unresolvedClaims).toMatchObject({
      authority: "canonical_dependency_inventory_only",
      productionExecution: "rf_claim_resolution_enabled",
      rfResolution: "claim_specific_admitted_resolution_enabled",
      rgResearch: "disabled",
      benchmarkExecution: "disabled",
      businessContextAuthority: "excluded_from_canonical_economics",
      validation: { status: "valid" },
    });
    const ledger = run.artifacts.rgWorkLedger!;
    expect(ledger).toMatchObject({
      schemaVersion: "canonical_rg_work_ledger_v2",
      authority: "claim_admission_and_planning_only",
      providerExecution: "durable_claim_bound_executor_after_planning",
      searchExecution: "typed_privacy_safe_search_intent_only",
      retrievalExecution: "independent_https_retrieval_required",
      aiExecution: "separate_investigation_and_verification_only",
      automaticKnowledgePromotion: "prohibited",
      contextualResearchDefault: "opportunistic_only_no_independent_initiation",
      businessContextAuthority: "excluded_from_canonical_materiality",
      benchmarkAuthority: "excluded_from_canonical_materiality",
      operations: [], validation: { status: "valid" },
    });
    expect(ledger.authoritativeStatementCostMinor)
      .toBe(run.artifacts.rd!.economicLayer.costStack.authoritativeStatementFeeTotal!.amountMinor);
    expect(ledger.workItems.length).toBeGreaterThan(0);
    expect(ledger.workItems.every((item) => item.executionState === "planned_for_durable_execution"
      && item.reservation === null && item.progress.operationsAttempted === 0
      && item.resourceConsumption.providerCalls === 0 && item.resourceConsumption.searchCalls === 0
      && item.resourceConsumption.retrievalBytes === 0 && item.resourceConsumption.aiCalls === 0)).toBe(true);
    expect(ledger.workItems.every((item) => ledger.claimAdmissions.find((claim) =>
      claim.atomicClaimId === item.atomicClaimId)?.materiality === "material")).toBe(true);
    const targetRef = contributing[0]!.id;
    const targetFacets = ledger.claimAdmissions.filter((claim) => claim.canonicalRefs.includes(targetRef));
    expect(targetFacets.map((claim) => claim.facet)).toEqual(expect.arrayContaining([
      "economic_category", "economic_beneficiary", "economic_owner", "collector", "price_setter", "merchant_lever",
    ]));
    expect(new Set(targetFacets.map((claim) => claim.atomicClaimId)).size).toBe(targetFacets.length);
    expect(targetFacets.find((claim) => claim.facet === "economic_category")?.expectedKnowledgeValueConstraint)
      .toMatchObject({ kind: "mapping" });
    expect(targetFacets.find((claim) => claim.facet === "economic_owner")?.expectedKnowledgeValueConstraint)
      .toEqual({ kind: "role", controlDimension: "economic_owner" });
  });

  it("retains the authoritative fee total and types the coverage gap when fee detail is unproven", () => {
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "fee-total-with-unproven-detail",
      sourceDocumentRef: "fee-total-with-unproven-detail-source",
      document: processorDocument,
    });

    const feeDetail = run.capabilityProof?.capabilities.find((item) => item.capability === "fee_detail");
    expect(feeDetail?.status).toBe("unknown");
    expect(run.artifacts.rb?.financialPopulations.totalStatementProcessingFees).toMatchObject({
      status: "available",
      provenanceStatus: "authoritative",
    });
    expect(run.artifacts.rd?.economicLayer).toMatchObject({
      admissionProfile: { source: "runtime_capability", feeDetailCoverage: "incomplete" },
      charges: [],
      costStack: {
        completeness: "partial_but_financially_reconciled",
        reconciliationDeltaMinor: 0,
      },
    });
    expect(run.artifacts.rd?.economicLayer.costStack.unresolvedRemainder)
      .toEqual(run.artifacts.rb?.financialPopulations.totalStatementProcessingFees.value);
    expect(run.artifacts.unresolvedClaims?.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimClass: "fee_detail_coverage",
        state: "unresolved",
        requiredEvidenceClass: "admitted_fee_detail_evidence",
        blockingEffect: "limits_authority",
      }),
    ]));
  });

  it("runs admitted RF category resolution inside the shared AnalysisRun and preserves adjacent claims", () => {
    const baseline = executeDeterministicCanonicalAnalysisRun({
      runId: "rf-baseline",
      sourceDocumentRef: "rf-source",
      document: genericDocument,
    }).run;
    const targetCharge = baseline.artifacts.rd!.economicLayer.charges.find((charge) =>
      charge.contributionStatus === "contributes_unresolved",
    )!;
    const occurrence = baseline.artifacts.rb!.sourceModel.occurrences.find((item) =>
      item.id === targetCharge.contributingOccurrenceRef,
    )!;
    const subjectCode = categorySubjectCode(occurrence.sourceLabel);
    const entry = admittedKnowledge({
      id: "runtime-admitted-category",
      claimType: "stable_facet_mapping",
      subjectCode,
      value: { kind: "mapping", canonicalCode: "processor_service_administrative_cost", sourceCode: subjectCode },
      scope: unboundedKnowledgeScope(),
      effectiveFrom: "2019-01-01",
      evidence: [{ ref: "runtime-reviewed-category", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    });
    const resolved = executeDeterministicCanonicalAnalysisRun({
      runId: "rf-resolved",
      sourceDocumentRef: "rf-source",
      document: genericDocument,
      rfKnowledge: { entries: [entry], tenantRef: "tenant-a", accountRef: "account-a" },
    }).run;
    const finalCharge = resolved.artifacts.rd!.economicLayer.charges.find((charge) => charge.id === targetCharge.id)!;
    const remainingForCharge = resolved.artifacts.unresolvedClaims!.claims.filter((claim) =>
      claim.canonicalRefs.includes(finalCharge.id),
    );

    expect(resolved.stageOutcomes.rf_resolution.status).toBe("valid");
    expect(resolved.artifacts.rfResolution).toMatchObject({
      authority: "claim_specific_admitted_knowledge_only",
      automaticPromotion: "prohibited",
      rgExecution: "disabled",
      providerExecution: "disabled",
      categoryApplications: [expect.objectContaining({ selectedEntryRefs: [entry.id] })],
    });
    expect(finalCharge).toMatchObject({
      category: "processor_service_administrative_cost",
      categoryResolution: "proven",
      contributionStatus: "contributes_classified",
      observedAmount: targetCharge.observedAmount,
      financialDirection: targetCharge.financialDirection,
      contributingOccurrenceRef: targetCharge.contributingOccurrenceRef,
    });
    expect(remainingForCharge.map((claim) => claim.claimClass)).toEqual(expect.arrayContaining([
      "economic_ownership", "economic_control", "merchant_actionability",
    ]));
    expect(remainingForCharge.some((claim) => claim.claimClass === "economic_category")).toBe(false);
    expect(resolved.artifacts.rb!.financialPopulations).toEqual(baseline.artifacts.rb!.financialPopulations);
    expect(resolved.artifacts.rb!.metrics.headlineEffectiveRate).toEqual(baseline.artifacts.rb!.metrics.headlineEffectiveRate);
    expect(resolved.artifacts.rd!.economicLayer.costStack.totalStatementProcessingCost)
      .toEqual(baseline.artifacts.rd!.economicLayer.costStack.totalStatementProcessingCost);
  });

  it("rejects an unauthorized RF mapping claim while preserving the complete deterministic result", () => {
    const baseline = executeDeterministicCanonicalAnalysisRun({
      runId: "rf-invalid-baseline",
      sourceDocumentRef: "rf-invalid-source",
      document: genericDocument,
    }).run;
    const target = baseline.artifacts.rd!.economicLayer.charges.find((charge) =>
      charge.contributionStatus === "contributes_unresolved",
    )!;
    const occurrence = baseline.artifacts.rb!.sourceModel.occurrences.find((item) => item.id === target.contributingOccurrenceRef)!;
    const subjectCode = categorySubjectCode(occurrence.sourceLabel);
    const invalidEntry = admittedKnowledge({
      id: "runtime-invalid-category",
      claimType: "stable_facet_mapping",
      subjectCode,
      value: { kind: "mapping", canonicalCode: "invented_category", sourceCode: subjectCode },
      scope: unboundedKnowledgeScope(),
      effectiveFrom: "2019-01-01",
      evidence: [{ ref: "runtime-invalid-reviewed-category", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    });
    const result = executeDeterministicCanonicalAnalysisRun({
      runId: "rf-invalid",
      sourceDocumentRef: "rf-invalid-source",
      document: genericDocument,
      rfKnowledge: { entries: [invalidEntry], tenantRef: "tenant-a", accountRef: "account-a" },
    }).run;

    expect(result.status).toBe("completed_with_limitations");
    expect(result.stageOutcomes.rf_resolution).toMatchObject({
      status: "valid",
      warnings: [expect.stringContaining("rf_category_value_rejected")],
    });
    expect(result.artifacts.rfResolution!.categoryApplications).toEqual([]);
    expect(result.artifacts.rfResolution!.decisions.some((item) => item.disposition === "unresolved_policy_rejection")).toBe(true);
    expect(result.stageOutcomes.rd.status).toBe("valid");
    expect(result.stageOutcomes.re.status).toBe("valid");
    expect(result.stageOutcomes.rh.status).toBe("valid");
    expect(result.artifacts.rd).toEqual(baseline.artifacts.rd);
    expect(result.artifacts.unresolvedClaims).toEqual(baseline.artifacts.unresolvedClaims);
    expect(result.artifacts.rb!.financialPopulations).toEqual(baseline.artifacts.rb!.financialPopulations);

    const invalidSnapshot = executeDeterministicCanonicalAnalysisRun({
      runId: "rf-invalid-snapshot",
      sourceDocumentRef: "rf-invalid-source",
      document: genericDocument,
      rfKnowledge: { entries: [invalidEntry, invalidEntry], tenantRef: "tenant-a", accountRef: "account-a" },
    }).run;
    expect(invalidSnapshot.stageOutcomes.rf_resolution.status).toBe("invalid");
    expect(invalidSnapshot.stageOutcomes.rd.status).toBe("valid");
    expect(invalidSnapshot.stageOutcomes.re.status).toBe("valid");
    expect(invalidSnapshot.stageOutcomes.rh.status).toBe("valid");
    expect(invalidSnapshot.artifacts.rd).toEqual(baseline.artifacts.rd);
  });

  it("fails closed as unsupported without fabricating canonical stages for a non-Fiserv document", () => {
    const document: ParsedDocument = {
      sourceType: "pdf",
      headers: ["content"],
      rows: [{ page: "page-1", content: "Unrelated monthly accounting report" }],
      textPreview: "Unrelated monthly accounting report",
      extraction: { mode: "text_only", qualityScore: 1, reasons: [], lineCount: 1, amountTokenCount: 0, hasExtractableText: true },
      suppliedDocumentIntegrity: { openedSuccessfully: true, enumeratedPageCount: 1, processedPageCount: 1,
        fatalPageErrorCount: 0, extractionLineageComplete: true, localIngestionTruncated: false },
    };
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "unsupported-source",
      sourceDocumentRef: "unsupported-source",
      document,
    });

    expect(run).toMatchObject({ status: "unsupported", familyStatus: "unsupported", parser: { matched: false } });
    expect(run.artifacts).toEqual({ rb: null, rc: null, rfResolution: null, rd: null, re: null,
      unresolvedClaims: null, rgWorkLedger: null, rh: null });
    expect(run.stageOutcomes.capability_admission.status).toBe("unsupported");
    expect(run.stageOutcomes.rb.status).toBe("unresolved");
  });

  it("does not bypass a failed exact-layout admission through the dynamic fallback", () => {
    const document = structuredClone(fullDocument);
    document.suppliedDocumentIntegrity = { ...document.suppliedDocumentIntegrity!, localIngestionTruncated: true };
    const { run } = executeDeterministicCanonicalAnalysisRun({
      runId: "failed-exact-layout",
      sourceDocumentRef: "failed-exact-layout",
      document,
    });

    expect(run.parser.driverId).toBe("fiserv_first_data_full_statement");
    expect(run.knownLayoutAdmission).toBeNull();
    expect(run.admission).toBeNull();
    expect(run.stageOutcomes.capability_admission.status).not.toBe("valid");
    expect(run.artifacts.rb?.templateCapability.admissionStatus).toBe("unknown");
  });
});
