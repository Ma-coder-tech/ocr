import { beforeAll, describe, expect, it } from "vitest";

import { executeDeterministicCanonicalAnalysisRun } from "../../../../src/canonical/v2/runtime/analysisRun.js";
import { parsePdf, type ParsedDocument } from "../../../../src/parser.js";

const files = {
  paysafe: "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf",
  priority: "test/fixtures/pdfs/fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf",
  zero: "test/fixtures/pdfs/fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf",
  basys: "test/fixtures/pdfs/fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf",
  wells: "test/fixtures/pdfs/fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf",
  clover: "test/fixtures/pdfs/SAMPLE_MERCHANT_3-Clover-June-Processing-Report.pdf",
  vortax: "test/fixtures/pdfs/fiserv_NXGEN_VORTAX_Sep_2022.pdf",
  paysafeFebruary: "test/fixtures/pdfs/fiserv_PAYSAFE_Febr_2024.pdf",
} as const;
type CaseId = keyof typeof files;
const documents = new Map<CaseId, ParsedDocument>();

function rb(caseId: CaseId) {
  return executeDeterministicCanonicalAnalysisRun({
    runId: `funding-batch-membership-${caseId}`,
    sourceDocumentRef: files[caseId],
    document: documents.get(caseId)!,
    executionContext: "evaluation_compatibility",
  }).run.artifacts.rb!;
}

beforeAll(async () => {
  await Promise.all((Object.entries(files) as Array<[CaseId, string]>).map(async ([caseId, file]) => {
    documents.set(caseId, await parsePdf(file));
  }));
}, 30_000);

describe("RB funding-batch count source-membership gate", () => {
  it.each([
    ["paysafe", 9, 10],
    ["priority", 30, 31],
    ["zero", 0, 1],
  ] as const)("records positive shadow agreement for %s without granting authority", (caseId, sourceCount, evidenceCount) => {
    const foundation = rb(caseId);
    const fact = foundation.financialPopulations.fundingBatchCount;

    expect(fact).toMatchObject({ status: "unavailable", value: null });
    expect(fact.limitations.join(" ")).toContain(`Shadow controls agree on ${sourceCount} submitted funding batches`);
    expect(fact.occurrenceRefs).toHaveLength(evidenceCount);
    expect(fact.evidenceRefs).toHaveLength(evidenceCount);
    expect(foundation.reconciliation).toContainEqual(expect.objectContaining({
      implementation: "independent_document_ir",
      controlIdentity: "funding_batch_population_membership",
      status: "pass",
      factRefs: [fact.id],
      occurrenceRefs: fact.occurrenceRefs,
      evidenceRefs: fact.evidenceRefs,
      tolerance: "0 rows",
    }));
    expect(foundation.financialPopulations.netFundedAmount.status).toBe("available");
    expect(foundation.financialPopulations.thirdPartyTransactionVolume.status).toBe("available");
  });

  it.each(["basys", "wells", "clover"] as const)(
    "withholds %s when DocumentIR cannot independently bound the population",
    (caseId) => {
      const foundation = rb(caseId);
      const fact = foundation.financialPopulations.fundingBatchCount;
      expect(fact).toMatchObject({ status: "unavailable", value: null, evidenceRefs: [], occurrenceRefs: [] });
      expect(fact.limitations.join(" ")).toMatch(/dated daily totals are not funding batches/i);
      expect(foundation.reconciliation).toContainEqual(expect.objectContaining({
        controlIdentity: "funding_batch_population_membership",
        status: "missing_input",
      }));
    },
  );

  it.each([
    ["vortax", 26],
    ["paysafeFebruary", 17],
  ] as const)(
    "does not turn positive independent %s agreement into new RB authority",
    (caseId, sourceCount) => {
      const foundation = rb(caseId);
      const fact = foundation.financialPopulations.fundingBatchCount;
      expect(fact).toMatchObject({ status: "unavailable", value: null });
      expect(fact.occurrenceRefs.length).toBeGreaterThan(0);
      expect(fact.limitations.join(" ")).toContain(`Shadow controls agree on ${sourceCount} submitted funding batches`);
      expect(foundation.reconciliation).toContainEqual(expect.objectContaining({
        controlIdentity: "funding_batch_population_membership",
        status: "pass",
      }));
    },
  );
});
