import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2FromFiserv,
  buildObservationalCanonicalPricingV2FromFiserv,
  canonicalPricingV2GoldObservation,
  privacySafeCanonicalPricingV2Diagnostic,
} from "../../../src/canonical/v2/index.js";
import { fiservFirstDataProcessorStatementDriver } from "../../../src/fiservFirstDataParser.js";
import { parsePdf } from "../../../src/parser.js";

const FIXTURE = path.resolve(process.cwd(), "test", "fixtures", "pdfs", "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf");

describe("Canonical Economics V2 RC observational Fiserv adapter", () => {
  it("retains deterministic row observations without promoting a legacy or AI pricing label", async () => {
    const document = await parsePdf(FIXTURE);
    const parserOutput = fiservFirstDataProcessorStatementDriver.parse(document, { sourceFileName: "observational-fixture.pdf" }) as unknown as Record<string, unknown>;
    const foundation = buildCanonicalEconomicsV2FromFiserv({
      document,
      parserOutput,
      sourceDocumentRef: "OBSERVATIONAL-FISERV-RC",
      parserId: "fiserv_first_data_processor_statement",
      provenanceStatus: "observational",
    });
    const original = buildObservationalCanonicalPricingV2FromFiserv(foundation);

    const contradictedParserOutput = structuredClone(parserOutput);
    contradictedParserOutput.pricingModel = { pricingModel: "tiered_pricing", confidence: "high" };
    const contradictedFoundation = buildCanonicalEconomicsV2FromFiserv({
      document,
      parserOutput: contradictedParserOutput,
      sourceDocumentRef: "OBSERVATIONAL-FISERV-RC",
      parserId: "fiserv_first_data_processor_statement",
      provenanceStatus: "observational",
    });
    const contradicted = buildObservationalCanonicalPricingV2FromFiserv(contradictedFoundation);

    expect(original.validation.status).toBe("valid");
    expect(original.pricingArchitecture.admissionProfile.source).toBe("observational");
    expect(original.pricingArchitecture.underlyingCostBillingMode.value).toBe("unknown");
    expect(original.pricingArchitecture.merchantPriceScheduleShape.value).toBe("unknown");
    expect(original.pricingArchitecture.scopeUniformity.value).toBe("unresolved");
    expect(original.pricingArchitecture.formulaCoverageStatus).toBe("partial_observed_components");
    expect(original.pricingArchitecture.observedPricingComponents.length).toBeGreaterThan(0);
    expect(canonicalPricingV2GoldObservation(original, { caseId: "G1" })).toMatchObject({
      sourceStatus: "requires_human_review",
      provenanceStatus: "observational",
    });
    expect(privacySafeCanonicalPricingV2Diagnostic(contradicted)).toEqual(privacySafeCanonicalPricingV2Diagnostic(original));
  });
});
