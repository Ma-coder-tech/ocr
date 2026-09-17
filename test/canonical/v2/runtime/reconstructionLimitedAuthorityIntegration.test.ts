import { beforeAll, describe, expect, it } from "vitest";

import { executeDeterministicCanonicalAnalysisRun } from "../../../../src/canonical/v2/runtime/analysisRun.js";
import {
  CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS,
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

function execute(caseId: CaseId, authority: boolean) {
  return executeDeterministicCanonicalAnalysisRun({
    runId: `limited-authority-${caseId}`,
    sourceDocumentRef: files[caseId],
    document: documents.get(caseId)!,
    executionContext: "evaluation_compatibility",
    ...(authority ? { reconstructionLimitedAuthority: { enabled: true as const } } : {}),
  });
}

beforeAll(async () => {
  await Promise.all((Object.entries(files) as Array<[CaseId, string]>).map(async ([caseId, pdfPath]) => {
    documents.set(caseId, await parsePdf(pdfPath));
  }));
}, 30_000);

describe("limited canonical authority for direct card-summary populations", () => {
  it("creates a canonical population overlay without mutating RB or any downstream artifact", () => {
    const baseline = execute("basys-march-2020", false);
    const authorized = execute("basys-march-2020", true);
    const result = authorized.diagnostics.reconstructionLimitedAuthority!;

    expect(authorized.run).toEqual(baseline.run);
    expect(result).toMatchObject({
      status: "granted",
      authority: "limited_canonical_financial_population_authority",
      executionBoundary: "evaluation_only_rb_population_overlay",
      productionUse: "prohibited",
      downstreamUse: "prohibited",
      persistence: "none",
      providerAuthority: "prohibited",
      baseFoundationMutation: "none",
      canonicalOverlayHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      sourceBinding: {
        fingerprintMatched: true,
        completeSuppliedDocument: true,
        familyAccepted: true,
        admittedFiservFamily: true,
        exactCardSummaryMapped: true,
      },
    });
    expect(result.allowlistedPopulations).toEqual(CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS);
    expect(Object.keys(result.canonicalFacts).sort()).toEqual([...CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS].sort());
  });

  it("cannot be enabled in Production", () => {
    expect(() => executeDeterministicCanonicalAnalysisRun({
      runId: "production-limited-authority-prohibited",
      sourceDocumentRef: files["basys-march-2020"],
      document: documents.get("basys-march-2020")!,
      executionContext: "production",
      reconstructionLimitedAuthority: { enabled: true },
    })).toThrow("RECONSTRUCTION_LIMITED_AUTHORITY_REQUIRES_EVALUATION_CONTEXT");
  });

  const expected = {
    "basys-march-2020": {
      grants: ["grossSaleVolume", "refundVolume", "grossSaleTransactionCount", "refundTransactionCount", "submittedTransactionCount"],
      changed: 5,
    },
    "paysafe-october-2025": { grants: ["grossSaleVolume", "refundVolume"], changed: 2 },
    "wells-fargo-september-2024": {
      grants: ["grossSaleVolume", "refundVolume", "grossSaleTransactionCount", "refundTransactionCount", "submittedTransactionCount"],
      changed: 2,
    },
    "clover-duplicate-resubmission": {
      grants: ["grossSaleTransactionCount", "refundTransactionCount", "submittedTransactionCount"],
      changed: 1,
    },
    "vortax-september-2022": { grants: ["grossSaleVolume", "refundVolume"], changed: 2 },
    "paysafe-february-2024": { grants: [], changed: 0 },
    "priority-payment-systems-december-2024": { grants: ["grossSaleVolume", "refundVolume"], changed: 2 },
    "paysafe-zero-volume-september-2025": { grants: [], changed: 0 },
  } as const;

  for (const caseId of Object.keys(expected) as CaseId[]) {
    it(`enforces the same claim-local authority policy for ${caseId}`, () => {
      const result = execute(caseId, true).diagnostics.reconstructionLimitedAuthority!;
      const grants = result.decisions.filter((item) => item.decision !== "withheld");
      expect(grants.map((item) => item.populationKey)).toEqual(expected[caseId].grants);
      expect(grants.filter((item) => item.decision === "granted_changes_rb")).toHaveLength(expected[caseId].changed);
      expect(Object.keys(result.canonicalFacts)).toEqual(expected[caseId].grants);
      expect(result.decisions).toHaveLength(CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS.length);
      expect(result.errors).toEqual([]);
      expect(result.decisions.every((item) =>
        CANONICAL_RB_LIMITED_AUTHORITY_POPULATIONS.includes(item.populationKey))).toBe(true);
    });
  }

  it("keeps Clover's contradictory amount claims non-authoritative while admitting independently reconciled counts", () => {
    const result = execute("clover-duplicate-resubmission", true).diagnostics.reconstructionLimitedAuthority!;
    for (const populationKey of ["grossSaleVolume", "refundVolume"] as const) {
      expect(result.decisions).toContainEqual(expect.objectContaining({
        populationKey,
        decision: "withheld",
        reasonCodes: expect.arrayContaining([
          "required_control_not_passing:document-ir.control.card-summary-formula",
          "required_control_not_passing:document-ir.control.card-summary-headline-match",
        ]),
      }));
      expect(result.canonicalFacts[populationKey]).toBeUndefined();
    }
    expect(result.canonicalFacts.refundTransactionCount?.value).toBe(2);
  });

  it("withholds counts when the source does not explicitly print and reconcile a submitted count", () => {
    const result = execute("vortax-september-2022", true).diagnostics.reconstructionLimitedAuthority!;
    expect(result.canonicalFacts.grossSaleVolume).toBeDefined();
    expect(result.canonicalFacts.refundVolume).toBeDefined();
    for (const key of ["grossSaleTransactionCount", "refundTransactionCount", "submittedTransactionCount"] as const) {
      expect(result.decisions).toContainEqual(expect.objectContaining({
        populationKey: key,
        decision: "withheld",
        reasonCodes: expect.arrayContaining([
          "required_control_not_passing:document-ir.control.card-summary-count-formula",
        ]),
      }));
    }
  });

  it("fails closed on source mismatch, incomplete provenance, and RB disagreement", () => {
    const document = documents.get("basys-march-2020")!;
    const foundation = execute("basys-march-2020", false).run.artifacts.rb!;

    const mismatched = grantCanonicalRbLimitedAuthority({
      document: documents.get("wells-fargo-september-2024")!,
      sourceDocumentRef: foundation.identity.sourceDocumentRef,
      foundation,
      executionContext: "evaluation_compatibility",
    });
    expect(Object.keys(mismatched.canonicalFacts)).toEqual([]);
    expect(mismatched.decisions.every((item) => item.reasonCodes.includes("source_fingerprint_or_reference_mismatch"))).toBe(true);

    const incompleteFoundation = structuredClone(foundation);
    incompleteFoundation.documentIntegrity.suppliedDocumentStatus = "incomplete_or_corrupt_supplied_document";
    incompleteFoundation.documentIntegrity.extractionLineageComplete = false;
    const incomplete = grantCanonicalRbLimitedAuthority({ document,
      sourceDocumentRef: foundation.identity.sourceDocumentRef, foundation: incompleteFoundation,
      executionContext: "evaluation_compatibility" });
    expect(Object.keys(incomplete.canonicalFacts)).toEqual([]);
    expect(incomplete.decisions.every((item) => item.reasonCodes.includes("supplied_document_integrity_not_complete"))).toBe(true);

    const contradictoryFoundation = structuredClone(foundation);
    contradictoryFoundation.financialPopulations.grossSaleVolume = {
      ...contradictoryFoundation.financialPopulations.grossSaleVolume,
      status: "available",
      value: { amountMinor: 1, currency: "USD" },
      confidence: "high",
    };
    const contradiction = grantCanonicalRbLimitedAuthority({ document,
      sourceDocumentRef: foundation.identity.sourceDocumentRef, foundation: contradictoryFoundation,
      executionContext: "evaluation_compatibility" });
    expect(contradiction.decisions).toContainEqual(expect.objectContaining({
      populationKey: "grossSaleVolume",
      decision: "withheld",
      reasonCodes: expect.arrayContaining(["rb_kernel_value_contradiction"]),
    }));
  });

  it("withholds every claim when duplicate section structure makes the source scope ambiguous", () => {
    const document = structuredClone(documents.get("basys-march-2020")!);
    const heading = document.rows.find((row) => /summary by card type/i.test(String(row.content ?? "")))!;
    document.rows.push({ ...heading });
    const execution = executeDeterministicCanonicalAnalysisRun({
      runId: "duplicate-card-summary-heading",
      sourceDocumentRef: "fixture-duplicate-card-summary-heading",
      document,
      executionContext: "evaluation_compatibility",
      reconstructionLimitedAuthority: { enabled: true },
    });
    const result = execution.diagnostics.reconstructionLimitedAuthority!;

    expect(result.sourceBinding.exactCardSummaryMapped).toBe(false);
    expect(result.status).toBe("withheld");
    expect(Object.keys(result.canonicalFacts)).toEqual([]);
  });
});
