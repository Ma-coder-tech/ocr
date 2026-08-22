import { describe, expect, it } from "vitest";

import {
  buildCanonicalEconomicsV2FromFiserv,
  canonicalEconomicsV2GoldObservation,
  validateCanonicalEconomicsV2Foundation,
} from "../../../src/canonical/v2/index.js";
import { v2SyntheticStatement } from "./fixtures.js";

describe("Canonical Economics V2 financial foundation", () => {
  it("preserves simultaneous gross, refund, net, fee, funding, and count populations", () => {
    const foundation = buildSynthetic();
    const facts = foundation.financialPopulations;

    expect(foundation.validation).toMatchObject({ status: "valid", errors: [] });
    expect(foundation.versionManifest).toMatchObject({
      schemaVersion: "canonical_economics_v2_foundation_v1",
      authority: "shadow_non_authoritative",
      persistence: "none",
      aiResearchAuthority: "prohibited",
    });
    expect(facts.grossSaleVolume.value).toEqual({ amountMinor: 100_000, currency: "USD" });
    expect(facts.refundVolume.value).toEqual({ amountMinor: 10_000, currency: "USD" });
    expect(facts.canonicalNetSubmittedCardVolume.value).toEqual({ amountMinor: 90_000, currency: "USD" });
    expect(facts.totalStatementProcessingFees.value).toEqual({ amountMinor: 4_500, currency: "USD" });
    expect(facts.netFundedAmount.value).toEqual({ amountMinor: 84_500, currency: "USD" });
    expect(facts.grossSaleTransactionCount.value).toBe(20);
    expect(facts.refundTransactionCount.value).toBe(2);
    expect(facts.submittedTransactionCount.status).toBe("unavailable");
    expect(facts.submittedTransactionCount.value).toBeNull();
  });

  it("uses exact canonical rate and frozen gross/gross average-ticket populations", () => {
    const foundation = buildSynthetic({ includeGrossBasedRateDiagnostic: true });

    expect(foundation.metrics.headlineEffectiveRate).toMatchObject({
      state: "defined",
      value: "0.050000",
      numeratorPopulation: "total_statement_processing_fees",
      denominatorPopulation: "canonical_net_submitted_card_volume",
    });
    expect(foundation.metrics.grossBasedRateDiagnostic).toMatchObject({
      state: "defined",
      value: "0.045000",
      denominatorPopulation: "gross_sale_volume",
    });
    expect(foundation.metrics.headlineAverageTicket).toMatchObject({
      state: "defined",
      value: { amountMinor: 5_000, currency: "USD" },
      numeratorPopulation: "gross_sale_volume",
      denominatorPopulation: "gross_sale_transaction_count",
    });
  });

  it("does not infer completeness merely because parsing succeeded", () => {
    const foundation = buildSynthetic();
    expect(foundation.templateCapability).toMatchObject({
      identityStatus: "observed",
      admissionStatus: "unknown",
      completenessStatus: "unknown",
    });

    const invalid = structuredClone(foundation);
    invalid.templateCapability.completenessStatus = "complete";
    expect(validateCanonicalEconomicsV2Foundation(invalid).validation.errors).toContain(
      "Template completeness cannot be complete without admitted, proven template identity.",
    );
    expect(foundation.documentIntegrity).toMatchObject({
      observedPageCount: 4,
      expectedPageCount: null,
      completenessStatus: "unknown",
    });
  });

  it("models document integrity independently from template admission", () => {
    const fixture = v2SyntheticStatement();
    const incomplete = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-RB-INCOMPLETE-DOCUMENT",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
      documentIntegrity: {
        expectedPageCount: 5,
        completenessStatus: "incomplete",
        missingPageNumbers: [5],
        proofOccurrenceKeys: ["evidence:0:grossSales"],
      },
    });
    expect(incomplete.validation.status).toBe("valid");
    expect(incomplete.templateCapability.admissionStatus).toBe("unknown");
    expect(incomplete.documentIntegrity).toMatchObject({
      observedPageCount: 4,
      expectedPageCount: 5,
      completenessStatus: "incomplete",
      missingPageNumbers: [5],
    });
    expect(canonicalEconomicsV2GoldObservation(incomplete).states["document.completeness"]).toBe("page_4_of_5_only");

    const completeWithUnknownTemplate = buildCanonicalEconomicsV2FromFiserv({
      ...fixture,
      sourceDocumentRef: "SYNTH-RB-COMPLETE-DOCUMENT-UNKNOWN-TEMPLATE",
      parserId: "synthetic_fiserv_foundation_parser",
      provenanceStatus: "approved_synthetic",
      documentIntegrity: {
        expectedPageCount: 4,
        completenessStatus: "complete",
        proofOccurrenceKeys: ["evidence:0:grossSales"],
      },
    });
    expect(completeWithUnknownTemplate.validation.status).toBe("valid");
    expect(completeWithUnknownTemplate.documentIntegrity.completenessStatus).toBe("complete");
    expect(completeWithUnknownTemplate.templateCapability.admissionStatus).toBe("unknown");
  });

  it("allows complete capability only after explicit admitted identity and proof evidence", () => {
    const foundation = structuredClone(buildSynthetic());
    const proofRef = foundation.sourceModel.evidence[0]!.id;
    foundation.templateCapability.identityStatus = "proven";
    foundation.templateCapability.admissionStatus = "admitted";
    foundation.templateCapability.completenessStatus = "complete";
    foundation.templateCapability.admissionProofEvidenceRefs = [proofRef];

    expect(validateCanonicalEconomicsV2Foundation(foundation).validation.status).toBe("valid");
  });

  it("exposes only foundational Gold observations and no pricing, ownership, benchmark, or savings fields", () => {
    const observation = canonicalEconomicsV2GoldObservation(buildSynthetic());
    expect(observation.values).toMatchObject({
      "financial.gross_sales": 1_000,
      "financial.refunds": 100,
      "financial.net_submitted": 900,
      "financial.total_fees": 45,
      "financial.gross_sale_items": 20,
      "financial.average_ticket": 50,
      "financial.effective_rate_decimal": 0.05,
    });
    expect(Object.keys(observation.values).some((key) => /pricing|owner|benchmark|saving|opportunity/.test(key))).toBe(false);
  });
});

function buildSynthetic(options: { includeGrossBasedRateDiagnostic?: boolean } = {}) {
  const fixture = v2SyntheticStatement();
  return buildCanonicalEconomicsV2FromFiserv({
    ...fixture,
    sourceDocumentRef: "SYNTH-RB-FOUNDATION",
    parserId: "synthetic_fiserv_foundation_parser",
    provenanceStatus: "approved_synthetic",
    includeGrossBasedRateDiagnostic: options.includeGrossBasedRateDiagnostic,
  });
}
