import { beforeAll, describe, expect, it } from "vitest";

import { executeDeterministicCanonicalAnalysisRun } from "../../../../src/canonical/v2/runtime/analysisRun.js";
import { resolveFiservRuntimeCapabilityAdmission } from "../../../../src/canonical/v2/fiservRuntimeCapabilityAdmission.js";
import { evaluateRbClaimCapabilityDependencies, RB_DEPENDENCY_REGISTRY } from "../../../../src/canonical/v2/rbDependencyRegistry.js";
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
const splitKeys = [
  "settlementAdjustmentAmount",
  "chargebackPrincipalDebitAmount",
  "chargebackRepresentmentAmount",
] as const;

function execution(caseId: CaseId, document = documents.get(caseId)!) {
  return executeDeterministicCanonicalAnalysisRun({
    runId: `rb-split-population-evidence-${caseId}`,
    sourceDocumentRef: files[caseId],
    document,
    executionContext: "evaluation_compatibility",
  });
}

function execute(caseId: CaseId, document = documents.get(caseId)!) {
  return execution(caseId, document).run.artifacts.rb!;
}

beforeAll(async () => {
  await Promise.all((Object.entries(files) as Array<[CaseId, string]>).map(async ([caseId, file]) => {
    documents.set(caseId, await parsePdf(file));
  }));
}, 30_000);

describe("RB split adjustment and chargeback population evidence", () => {
  const sourceProvenCases = {
    "basys-march-2020": { settlementAdjustmentAmount: 0 },
    "wells-fargo-september-2024": { settlementAdjustmentAmount: -108 },
    "clover-duplicate-resubmission": { settlementAdjustmentAmount: -120_000 },
    "priority-payment-systems-december-2024": {
      settlementAdjustmentAmount: -600,
      chargebackPrincipalDebitAmount: 0,
      chargebackRepresentmentAmount: 0,
    },
  } as const;

  for (const [caseId, expected] of Object.entries(sourceProvenCases) as Array<[
    keyof typeof sourceProvenCases,
    Partial<Record<typeof splitKeys[number], number>>,
  ]>) {
    it(`selects only independently source-proven split facts for ${caseId}`, () => {
      const foundation = execute(caseId);
      expect(foundation.validation.status).toBe("valid");
      splitKeys.forEach((key) => {
        const fact = foundation.financialPopulations[key];
        const expectedValue = expected[key];
        if (expectedValue === undefined) {
          expect(fact).toMatchObject({ status: "unavailable", value: null });
          return;
        }
        expect(fact).toMatchObject({
          status: "available",
          value: { amountMinor: expectedValue, currency: "USD" },
          confidence: "high",
        });
        expect(["authoritative", "observational"]).toContain(fact.provenanceStatus);
        expect(fact.occurrenceRefs.length).toBeGreaterThan(0);
        for (const occurrenceRef of fact.occurrenceRefs) {
          const occurrence = foundation.sourceModel.occurrences.find((item) => item.id === occurrenceRef)!;
          const evidence = foundation.sourceModel.evidence.find((item) => item.id === occurrence.evidenceRef)!;
          expect(occurrence.contributionRole).not.toBe("funding_only");
          expect(occurrence.limitations.some((item) => item.startsWith("Independent split proof basis:"))).toBe(true);
          expect(evidence).toMatchObject({ extractionMethod: "document_ir", documentRef: files[caseId] });
          expect(evidence.lineRef).toBeTruthy();
        }
      });
    });
  }

  for (const caseId of [
    "paysafe-october-2025",
    "paysafe-zero-volume-september-2025",
    "paysafe-february-2024",
  ] as const) {
    it(`preserves combined no-activity without promoting split zeros for ${caseId}`, () => {
      const foundation = execute(caseId);
      for (const key of splitKeys) {
        const fact = foundation.financialPopulations[key];
        expect(fact).toMatchObject({ status: "unavailable", value: null });
        expect(fact.limitations).toContain(
          "processor_presented_combined_no_activity_preserved_without_split_zero_inference",
        );
      }
      expect(foundation.financialPopulations.unresolvedAdjustmentChargebackAmount).toMatchObject({
        status: "unavailable",
        value: null,
      });
      expect(foundation.financialPopulations.unresolvedAdjustmentChargebackAmount.occurrenceRefs.length)
        .toBeGreaterThan(0);
    });
  }

  for (const caseId of ["vortax-september-2022"] as const) {
    it(`preserves independently observed split evidence without promoting it to capability authority for ${caseId}`, () => {
      const foundation = execute(caseId);
      for (const key of splitKeys) {
        const fact = foundation.financialPopulations[key];
        expect(fact).toMatchObject({ status: "available", provenanceStatus: "observational" });
        expect(fact.value).not.toBeNull();
      }
      const proof = execution(caseId).run.capabilityProof!;
      expect(proof.capabilities.find((item) => item.capability === "settlement_adjustments")?.status).toBe("unknown");
      expect(proof.capabilities.find((item) => item.capability === "chargeback_financial_populations")?.status).toBe("unknown");
    });
  }

  it("declares and enforces claim-capability dependencies without funding-ledger inputs", () => {
    const caseId = "priority-payment-systems-december-2024" as const;
    const run = execution(caseId);
    const foundation = run.run.artifacts.rb!;
    const registryNodes = RB_DEPENDENCY_REGISTRY.filter((entry) => entry.nodeKind === "capability");
    expect(registryNodes).toHaveLength(3);
    expect(registryNodes.every((entry) => entry.forbiddenDependencies.includes("fundingLedgerStatus")
      && entry.forbiddenDependencies.includes("fundingBatchPopulation")
      && entry.forbiddenDependencies.includes("fundingReconciliationStatus"))).toBe(true);

    const before = evaluateRbClaimCapabilityDependencies({
      capabilityId: "settlement_adjustments",
      foundation,
      statementCompleteness: "proven_complete",
    });
    const fundingDamaged = structuredClone(foundation);
    for (const control of fundingDamaged.reconciliation.filter((item) =>
      /funding|batch|amount_funded|processed/i.test(item.controlIdentity)
      && !item.controlIdentity.startsWith("independent_split_population:"))) {
      control.status = "fail";
      control.evidenceRefs = [];
    }
    const after = evaluateRbClaimCapabilityDependencies({
      capabilityId: "settlement_adjustments",
      foundation: fundingDamaged,
      statementCompleteness: "proven_complete",
    });
    expect(after).toEqual(before);

    const parserOutput = run.diagnostics.driver!.parse(documents.get(caseId)!);
    const failedFundingOutput = structuredClone(parserOutput) as Record<string, any>;
    failedFundingOutput.fundingBatchLedger = { status: "not_mapped", rows: [] };
    failedFundingOutput.decision.validationState.batchDetailAllowed = false;
    failedFundingOutput.decision.validationState.batchLedger = "failed";
    const resolved = resolveFiservRuntimeCapabilityAdmission({
      document: documents.get(caseId)!,
      driverId: run.run.parser.driverId!,
      parserOutput: failedFundingOutput,
      observationalFoundation: foundation,
      statementCompleteness: "proven_complete",
    }).proof;
    expect(resolved.capabilities.find((item) => item.capability === "settlement_adjustments"))
      .toMatchObject({ status: "unknown", reasonCodes: expect.arrayContaining(["funding_ledger_not_a_dependency"]) });
    expect(resolved.capabilities.find((item) => item.capability === "chargeback_financial_populations"))
      .toMatchObject({ status: "unknown", reasonCodes: expect.arrayContaining(["funding_ledger_not_a_dependency"]) });
    expect(resolved.capabilities.find((item) => item.capability === "funding_batches")?.status).toBe("unknown");
  });

  it("withholds split zeros when only headline and funding-batch zeros remain", () => {
    const caseId = "paysafe-october-2025" as const;
    const document = structuredClone(documents.get(caseId)!);
    document.rows = document.rows.filter((row) =>
      !/^adjustments\s*\/\s*chargebacks$/i.test(String(row.content ?? "").trim())
      && !/\bno adjustments\s*\/\s*chargebacks for (?:this|the) statement period\b/i.test(String(row.content ?? "")));
    const foundation = execute(caseId, document);

    for (const key of splitKeys) {
      expect(foundation.financialPopulations[key]).toMatchObject({ status: "unavailable", value: null });
    }
    const batchZeros = foundation.sourceModel.occurrences.filter((occurrence) =>
      occurrence.contributionRole === "funding_only"
      && occurrence.semanticRole === "supporting_representation"
      && occurrence.printedAmount?.amountMinor === 0);
    expect(batchZeros.length).toBeGreaterThan(0);
    expect(batchZeros.every((occurrence) => occurrence.limitations.some((item) =>
      /does not prove|cannot prove/i.test(item)))).toBe(true);
  });

  it("withholds every split when a reconciled combined detail row cannot be classified", () => {
    const caseId = "priority-payment-systems-december-2024" as const;
    const document = structuredClone(documents.get(caseId)!);
    for (const row of document.rows.filter((item) => /^\d{2}\/\d{2}\s*\|\s*ADJUSTMENT\s*\|/i
      .test(String(item.content ?? "").trim()))) {
      row.content = String(row.content).replace(/\bADJUSTMENT\b/i, "OTHER");
      row.label = "OTHER";
    }
    const foundation = execute(caseId, document);
    for (const key of splitKeys) {
      const fact = foundation.financialPopulations[key];
      expect(fact).toMatchObject({ status: "unavailable", value: null });
      expect(fact.limitations).toContain("combined_section_contains_unclassified_rows");
    }
  });

  it("does not misclassify a chargeback-labelled fee as principal or representment", () => {
    const foundation = execute("priority-payment-systems-december-2024");
    const splitOccurrenceRefs = new Set(splitKeys.flatMap((key) =>
      foundation.financialPopulations[key].occurrenceRefs));
    const fee = foundation.sourceModel.occurrences.find((occurrence) =>
      /CHARGEBACKS/i.test(occurrence.sourceLabel) && occurrence.semanticRole === "fee_charge");
    expect(fee).toBeDefined();
    expect(splitOccurrenceRefs.has(fee!.id)).toBe(false);
  });
});
