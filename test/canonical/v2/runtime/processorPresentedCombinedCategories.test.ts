import { beforeAll, describe, expect, it } from "vitest";

import { RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS } from "../../../../src/canonical/v2/kernelAuthorityContract.js";
import { executeDeterministicCanonicalAnalysisRun } from "../../../../src/canonical/v2/runtime/analysisRun.js";
import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";
import { rescueSourceFiles } from "../../../fixtures/reconstructionKernel/rescueSourceManifest.js";

const files = {
  basys: rescueSourceFiles["basys-march-2020"],
  priority: "test/fixtures/pdfs/fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  paysafe: "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf",
} as const;
type CaseId = keyof typeof files;
const documents = new Map<CaseId, ParsedDocument>();

function execute(caseId: CaseId, document = documents.get(caseId)!) {
  return executeDeterministicCanonicalAnalysisRun({
    runId: `processor-presented-category-${caseId}`,
    sourceDocumentRef: files[caseId],
    document,
    executionContext: "evaluation_compatibility",
  }).run.artifacts.rb!;
}

beforeAll(async () => {
  await Promise.all((Object.entries(files) as Array<[CaseId, string]>).map(async ([caseId, file]) => {
    documents.set(caseId, await parsePdf(file));
  }));
}, 30_000);

describe("processor-presented combined category source representations", () => {
  it("preserves a combined Adjustments/Chargebacks amount alongside independently proven splits", () => {
    const foundation = execute("priority");
    const representation = foundation.sourceModel.processorPresentedCategories.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks")!;
    const control = foundation.sourceModel.processorPresentedCategoryControls.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks")!;

    expect(foundation.validation.status).toBe("valid");
    expect(representation).toMatchObject({
      processorPresentedLabel: "Adjustments/Chargebacks",
      preservedMeaning: "processor_presented_combined_adjustments_chargebacks",
      observationStatus: "observed",
      observedAmount: { amountMinor: -600, currency: "USD" },
      coverageStatus: "reconciled_detail",
      completenessState: {
        suppliedDocumentStatus: foundation.documentIntegrity.suppliedDocumentStatus,
        statementCompletenessStatus: foundation.documentIntegrity.completenessStatus,
        proofEvidenceRefs: foundation.documentIntegrity.proofEvidenceRefs,
      },
      contradictionState: "matches_independently_proven_splits",
      contributionPermission: "prohibited_observation_only",
      sourceProvenance: {
        documentRef: files.priority,
        sourceFingerprint: foundation.identity.sourceFingerprint,
      },
    });
    expect(representation.independentlyProvenSplitFactRefs.sort()).toEqual([
      foundation.financialPopulations.settlementAdjustmentAmount.id,
      foundation.financialPopulations.chargebackPrincipalDebitAmount.id,
      foundation.financialPopulations.chargebackRepresentmentAmount.id,
    ].sort());
    expect(control).toMatchObject({
      status: "pass",
      calculation: "printed_category_amount_equals_independently_proven_split_net",
      inputs: {
        headingCount: 1,
        printedTotalMinor: -600,
        visibleDetailRowSumMinor: -600,
        independentlyProvenSplitNetMinor: -600,
      },
      authorityEffect: "none_observation_only",
    });
    expect(representation.controlRefs).toEqual([control.id]);
  });

  it("preserves explicit combined no-activity without creating split zero facts", () => {
    const foundation = execute("paysafe");
    const representation = foundation.sourceModel.processorPresentedCategories.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks")!;

    expect(representation).toMatchObject({
      observationStatus: "observed",
      observedAmount: { amountMinor: 0, currency: "USD" },
      coverageStatus: "explicit_no_activity",
      contradictionState: "not_comparable",
      independentlyProvenSplitFactRefs: [],
    });
    for (const key of [
      "settlementAdjustmentAmount",
      "chargebackPrincipalDebitAmount",
      "chargebackRepresentmentAmount",
    ] as const) {
      expect(foundation.financialPopulations[key]).toMatchObject({ status: "unavailable", value: null });
    }
  });

  it("preserves Chargebacks/Reversals as its own combined category without inventing subtypes", () => {
    const foundation = execute("basys");
    const representation = foundation.sourceModel.processorPresentedCategories.find((item) =>
      item.categoryIdentity === "chargebacks_reversals")!;
    const control = foundation.sourceModel.processorPresentedCategoryControls.find((item) =>
      item.categoryIdentity === "chargebacks_reversals")!;

    expect(representation).toMatchObject({
      processorPresentedLabel: "Chargebacks/Reversals",
      preservedMeaning: "processor_presented_combined_chargebacks_reversals",
      observedAmount: { amountMinor: 0, currency: "USD" },
      coverageStatus: "explicit_no_activity",
      contradictionState: "not_comparable",
      independentlyProvenSplitFactRefs: [],
      contributionPermission: "prohibited_observation_only",
    });
    expect(control).toMatchObject({ status: "pass", calculation: "preserve_printed_category_amount" });
    expect(representation.limitations).toContain(
      "Representment is not treated as reversal. A split-net comparison requires a separately proven first-class reversal population, which RB does not currently model.",
    );
    expect(foundation.financialPopulations.chargebackPrincipalDebitAmount.status).toBe("unavailable");
    expect(foundation.financialPopulations.chargebackRepresentmentAmount.status).toBe("unavailable");
  });

  it("keeps representation controls isolated from shared financial reconciliation and authority", () => {
    const foundation = execute("priority");
    const representations = foundation.sourceModel.processorPresentedCategories;
    const representationOccurrenceRefs = new Set(representations.flatMap((item) =>
      item.sourceProvenance.occurrenceRefs));

    expect(foundation.sourceModel.processorPresentedCategoryControls).toHaveLength(2);
    expect(foundation.reconciliation.some((control) =>
      control.controlIdentity.startsWith("processor_presented_combined_category:"))).toBe(false);
    expect(representations.every((item) => item.prohibitedDerivedSemantics.includes("net_funded")
      && item.prohibitedDerivedSemantics.includes("fee")
      && item.prohibitedDerivedSemantics.includes("downstream_economics"))).toBe(true);
    expect(Object.values(foundation.financialPopulations).filter((fact) => fact.status === "available")
      .every((fact) => fact.occurrenceRefs.every((ref) => !representationOccurrenceRefs.has(ref)))).toBe(true);
    expect(foundation.financialPopulations.unresolvedAdjustmentChargebackAmount)
      .toMatchObject({ status: "unavailable", value: null });
    expect(RB_KERNEL_LIMITED_AUTHORITY_POPULATIONS).toEqual([
      "grossSaleVolume",
      "refundVolume",
      "grossSaleTransactionCount",
      "refundTransactionCount",
      "submittedTransactionCount",
    ]);
  });

  it("fails closed when the combined category source scope is duplicated", () => {
    const duplicate = structuredClone(documents.get("priority")!);
    const heading = duplicate.rows.find((row) =>
      /^adjustments\s*\/\s*chargebacks$/i.test(String(row.content ?? "").trim()))!;
    duplicate.rows.push(structuredClone(heading));
    const foundation = execute("priority", duplicate);
    const representation = foundation.sourceModel.processorPresentedCategories.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks")!;
    const control = foundation.sourceModel.processorPresentedCategoryControls.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks")!;

    expect(representation).toMatchObject({
      observationStatus: "withheld_ambiguous_scope",
      observedAmount: null,
      coverageStatus: "ambiguous_source_scope",
      contributionPermission: "prohibited_observation_only",
    });
    expect(control).toMatchObject({ status: "fail", sourceScope: "ambiguous_source_scope" });
    expect(control.inputs.headingCount).toBe(2);
  });

  it("retains but fails an unreconciled combined category without producing stronger facts", () => {
    const changed = structuredClone(documents.get("priority")!);
    const total = changed.rows.find((row) => /^total\s*\|\s*-\$6\.00$/i.test(String(row.content ?? "").trim()))!;
    total.content = String(total.content).replace("-$6.00", "-$7.00");
    const foundation = execute("priority", changed);
    const representation = foundation.sourceModel.processorPresentedCategories.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks")!;
    const control = foundation.sourceModel.processorPresentedCategoryControls.find((item) =>
      item.categoryIdentity === "adjustments_chargebacks")!;

    expect(representation).toMatchObject({
      observationStatus: "observed",
      observedAmount: { amountMinor: -700, currency: "USD" },
      coverageStatus: "unreconciled_detail",
      contradictionState: "not_comparable",
    });
    expect(control).toMatchObject({
      status: "fail",
      calculation: "visible_detail_sum_equals_printed_total",
      inputs: { printedTotalMinor: -700, visibleDetailRowSumMinor: -600 },
    });
    for (const key of [
      "settlementAdjustmentAmount",
      "chargebackPrincipalDebitAmount",
      "chargebackRepresentmentAmount",
    ] as const) {
      expect(foundation.financialPopulations[key]).toMatchObject({ status: "unavailable", value: null });
    }
  });
});
