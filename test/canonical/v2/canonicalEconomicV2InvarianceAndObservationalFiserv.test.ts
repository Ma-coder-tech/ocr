import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  buildCanonicalEconomicsV2FromFiserv,
  buildObservationalCanonicalEconomicsV2FromFiservPricing,
  buildObservationalCanonicalPricingV2FromFiserv,
  canonicalEconomicPrivacySafeDiagnostics,
  observeCanonicalEconomicsV2ForGold,
} from "../../../src/canonical/v2/index.js";
import { fiservFirstDataProcessorStatementDriver } from "../../../src/fiservFirstDataParser.js";
import { parsePdf } from "../../../src/parser.js";
import { approvedEconomicInput, economicPricing } from "./economicFixtures.js";

const OBSERVATIONAL_FIXTURE = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf");

describe("Canonical Economics V2 RD invariance and observational Fiserv boundary", () => {
  it("does not mutate accepted RB or RC objects", () => {
    const pricing = economicPricing();
    const before = structuredClone(pricing);
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(approvedEconomicInput(pricing));

    expect(analysis.validation.status).toBe("valid");
    expect(pricing).toEqual(before);
    expect(analysis.pricingAnalysis).toEqual(before);
    expect(analysis.pricingAnalysis.versionManifest.schemaVersion).toBe("canonical_economics_v2_pricing_architecture_v1");
    expect(analysis.pricingAnalysis.foundation.versionManifest.schemaVersion).toBe("canonical_economics_v2_foundation_v1");
  });

  it("retains real Fiserv fee observations without promoting identity, category, direction, ownership, or control", async () => {
    const document = await parsePdf(OBSERVATIONAL_FIXTURE);
    const parserOutput = fiservFirstDataProcessorStatementDriver.parse(document, { sourceFileName: "rd-observational-fixture.pdf" });
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      document,
      parserOutput,
      sourceDocumentRef: "OBSERVATIONAL-FISERV-RD",
      parserId: "fiserv_first_data_processor_statement",
      provenanceStatus: "observational",
    });
    const pricing = buildObservationalCanonicalPricingV2FromFiserv(foundation);
    const economics = buildObservationalCanonicalEconomicsV2FromFiservPricing(pricing);
    const observation = observeCanonicalEconomicsV2ForGold(economics);

    expect(economics.validation.status).toBe("valid");
    expect(economics.economicLayer.admissionProfile.source).toBe("observational");
    expect(economics.economicLayer.charges.length).toBeGreaterThan(0);
    expect(economics.economicLayer.charges.every((charge) =>
      charge.status === "unresolved" &&
      charge.category === "unresolved_unclassified" &&
      charge.financialDirection === "unresolved" &&
      !charge.contributionStatus.startsWith("contributes_"),
    )).toBe(true);
    expect(economics.economicLayer.roleClaims).toEqual([]);
    expect(economics.economicLayer.costStack.completeness).toBe("financially_unreconciled");
    expect(observation.provenanceStatus).toBe("observational");
    expect(observation.claims).toEqual([]);
    expect(canonicalEconomicPrivacySafeDiagnostics(economics)).toMatchObject({
      validationStatus: "valid",
      participantCount: 0,
      stackCompleteness: "financially_unreconciled",
    });
  }, 60_000);
});
