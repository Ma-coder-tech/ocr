import { describe, expect, it } from "vitest";

import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
} from "../../../src/fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../../../src/genericFiservStatementParser.js";
import { parsePdf } from "../../../src/parser.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../../src/canonical/buildCanonicalFacts.js";
import {
  assertNoUnexpectedCanonicalV2Divergence,
  buildCanonicalEconomicsV2FromFiserv,
  canonicalEconomicsV2GoldObservation,
  compareCanonicalV1ToV2,
} from "../../../src/canonical/v2/index.js";

describe("Canonical Economics V2 observational Fiserv adapter", () => {
  it.each([
    ["G1", "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf"],
    ["G2", "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf"],
    ["G7", "fiserv_ABDUL_BASHER_Aug_2025.pdf"],
    ["G8", "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf"],
  ])("validates the existing %s falsification/observational path without admitting template completeness", async (caseId, fileName) => {
    const document = await parsePdf(`test/fixtures/pdfs/${fileName}`);
    const parserOutput = fiservFirstDataProcessorStatementDriver.parse(document, { sourceFileName: fileName });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      document,
      parserOutput,
      sourceDocumentRef: `OBS-${caseId}`,
      parserId: fiservFirstDataProcessorStatementDriver.id,
      provenanceStatus: "observational",
    });

    expect(foundation.validation.status).toBe("valid");
    expect(foundation.identity.provenanceStatus).toBe("observational");
    expect(foundation.templateCapability.admissionStatus).toBe("unknown");
    expect(foundation.templateCapability.completenessStatus).toBe("unknown");
    const comparison = compareCanonicalV1ToV2(
      buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fileName }),
      foundation,
    );
    expect(comparison.hasUnexpectedDivergence).toBe(false);
    expect(comparison.items.map((item) => item.fact)).toEqual(expect.arrayContaining([
      "net_submitted",
      "total_statement_processing_fees",
      "refund_volume",
      "net_funded",
      "refund_transaction_count",
      "gross_sale_transaction_count",
    ]));
    expect(comparison.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ amendmentId: "RB-AMEND-001-MULTI-POPULATION" }),
      expect.objectContaining({ amendmentId: "RB-AMEND-004-FINANCIAL-DIRECTION" }),
      ...(foundation.sourceModel.representationGroups.length > 0
        ? [expect.objectContaining({ amendmentId: "RB-AMEND-005-REPRESENTATION-CONTRIBUTION" })]
        : []),
    ]));
    expect(() => assertNoUnexpectedCanonicalV2Divergence(comparison)).not.toThrow();
  });

  it("corrects the G3 zero-volume metric state without treating the observational source as authoritative", async () => {
    const fileName = "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf";
    const document = await parsePdf(`test/fixtures/pdfs/${fileName}`);
    const parserOutput = fiservFirstDataProcessorStatementDriver.parse(document, { sourceFileName: fileName });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      document,
      parserOutput,
      sourceDocumentRef: "OBS-G3",
      parserId: fiservFirstDataProcessorStatementDriver.id,
      provenanceStatus: "observational",
    });

    expect(foundation.validation.status).toBe("valid");
    expect(foundation.identity.provenanceStatus).toBe("observational");
    expect(foundation.templateCapability).toMatchObject({ admissionStatus: "unknown", completenessStatus: "unknown" });
    expect(foundation.metrics.headlineEffectiveRate).toMatchObject({ state: "undefined_zero_denominator", value: null });
    expect(canonicalEconomicsV2GoldObservation(foundation).values).not.toHaveProperty("financial.effective_rate_decimal");
    const comparison = compareCanonicalV1ToV2(
      buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fileName }),
      foundation,
    );
    expect(comparison.items).toContainEqual(expect.objectContaining({
      fact: "headline_effective_rate",
      classification: "approved_semantic_amendment",
      amendmentId: "RB-AMEND-002-UNDEFINED-RATE",
    }));
    expect(comparison.hasUnexpectedDivergence).toBe(false);
  });

  it("adapts G4 money populations but refuses its card-type count until template population semantics are admitted", async () => {
    const fileName = "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf";
    const document = await parsePdf(`test/fixtures/pdfs/${fileName}`);
    const parserOutput = fiservFirstDataFullStatementDriver.parse(document, { sourceFileName: fileName });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      document,
      parserOutput,
      sourceDocumentRef: "OBS-G4",
      parserId: fiservFirstDataFullStatementDriver.id,
      provenanceStatus: "observational",
      includeGrossBasedRateDiagnostic: true,
    });
    const observation = canonicalEconomicsV2GoldObservation(foundation);

    expect(foundation.validation.status).toBe("valid");
    expect(foundation.templateCapability.completenessStatus).toBe("unknown");
    expect(observation.provenanceStatus).toBe("observational");
    expect(observation.values).toMatchObject({
      "financial.gross_sales": 177_417.44,
      "financial.refunds": 16.72,
      "financial.net_submitted": 177_400.72,
      "financial.total_fees": 2_954.38,
    });
    expect(observation.values).not.toHaveProperty("financial.gross_sale_items");
    expect(foundation.financialPopulations.grossSaleTransactionCount.status).toBe("unavailable");
    expect(foundation.metrics.headlineAverageTicket.state).toBe("unavailable_denominator");
    expect(foundation.financialPopulations.submittedTransactionCount.status).toBe("unavailable");
    const comparison = compareCanonicalV1ToV2(
      buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fileName }),
      foundation,
    );
    expect(comparison.hasUnexpectedDivergence).toBe(false);
    expect(comparison.items).toContainEqual(expect.objectContaining({
      fact: "gross_sale_transaction_count",
      classification: "v2_unavailable_or_ambiguous",
    }));
  });

  it("allows the same G4 count only after explicit complete template admission and population proof", async () => {
    const fileName = "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf";
    const document = await parsePdf(`test/fixtures/pdfs/${fileName}`);
    const parserOutput = fiservFirstDataFullStatementDriver.parse(document, { sourceFileName: fileName });
    const baseInput = {
      document,
      parserOutput,
      sourceDocumentRef: "OBS-G4-ADMISSION",
      parserId: fiservFirstDataFullStatementDriver.id,
      provenanceStatus: "observational" as const,
    };
    const preAdmission = buildCanonicalEconomicsV2FromFiserv(baseInput);
    const proofRef = preAdmission.sourceModel.evidence[0]!.id;
    const admitted = buildCanonicalEconomicsV2FromFiserv({
      ...baseInput,
      templateAdmission: {
        detectedFamily: "Fiserv / First Data",
        detectedTemplate: "test-only-versioned-g4-admission",
        detectedVersion: "test-v1",
        identityStatus: "proven",
        admissionStatus: "admitted",
        completenessStatus: "complete",
        admissionProofEvidenceRefs: [proofRef],
        capabilities: [{
          capability: "gross_sale_transaction_count",
          status: "supported",
          proofEvidenceRefs: [proofRef],
          limitations: [],
        }],
      },
    });

    expect(admitted.validation.status).toBe("valid");
    expect(admitted.financialPopulations.grossSaleTransactionCount).toMatchObject({ status: "available", value: 4_136 });
    expect(admitted.metrics.headlineAverageTicket.state).toBe("defined");
  });

  it("compares the available generic Fiserv observational path without importing V1 values", async () => {
    const fileName = "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf";
    const document = await parsePdf(`test/fixtures/pdfs/${fileName}`);
    const parserOutput = genericFiservStatementDriver.parse(document, { sourceFileName: fileName });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      document,
      parserOutput,
      sourceDocumentRef: "OBS-G5",
      parserId: genericFiservStatementDriver.id,
      provenanceStatus: "observational",
    });
    const comparison = compareCanonicalV1ToV2(
      buildCanonicalStatementFactsFromParsedDocument(document, { sourceFileName: fileName }),
      foundation,
    );

    expect(foundation.validation.status).toBe("valid");
    expect(comparison.hasUnexpectedDivergence).toBe(false);
    expect(comparison.items.some((item) => item.classification === "v2_unavailable_or_ambiguous")).toBe(true);
    expect(() => assertNoUnexpectedCanonicalV2Divergence(comparison)).not.toThrow();
  });
});
