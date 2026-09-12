import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import {
  buildClaimScopedQualificationIntegrityCostDriverAdmissionV1,
  classifyExplicitQualificationIntegrityDriverLabelV1,
  type ClaimScopedQualificationIntegrityCostDriverAdmissionV1,
} from "../../src/canonical/claimScopedQualificationIntegrityCostDriverAdmissionV1.js";
import { buildCommercialDecompositionContractV1 } from "../../src/canonical/commercialDecompositionContractV1.js";
import { buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1 } from "../../src/canonical/fiservClaimScopedActivityPopulationAdmissionV1.js";
import { GovernedPaymentKnowledgeAuthority } from "../../src/canonical/governedPaymentKnowledgeAuthority.js";
import type { InternalAnalystPricingModelInput } from "../../src/canonical/internalAnalystFindingV1.js";
import { inspectFiservOneStatementEvaluation } from "../../src/canonical/v2/evaluation/fiservEvaluationHarness.js";
import { analyzeStatementDocument } from "../../src/statementParserOrchestrator.js";

describe("Claim-Scoped Qualification & Integrity Cost Driver Admission v1", () => {
  let november: Awaited<ReturnType<typeof buildCase>>;
  let basys: Awaited<ReturnType<typeof buildCase>>;

  beforeAll(async () => {
    [november, basys] = await Promise.all([
      buildCase("Nov_2024_Statement.pdf", "restaurant_food_beverage"),
      buildCase("fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", "restaurant_food_beverage"),
    ]);
  }, 30_000);

  it("recognizes only explicit supported condition labels across every required driver family", () => {
    expect(classifyExplicitQualificationIntegrityDriverLabelV1("VI-NON QUAL CONSUMER CR").family).toBe("NON_QUALIFIED");
    expect(classifyExplicitQualificationIntegrityDriverLabelV1("VI-EIRF NON CPS ALL OTHER").family).toBe("EIRF_QUALIFICATION_RESULT");
    expect(classifyExplicitQualificationIntegrityDriverLabelV1("QUALIFICATION RESULT").family).toBe("QUALIFICATION_RESULT");
    expect(classifyExplicitQualificationIntegrityDriverLabelV1("DOWNGRADED TIER").family).toBe("DOWNGRADE_RESULT");
    expect(classifyExplicitQualificationIntegrityDriverLabelV1("VI TRANSACTION INTEGRITY FEE").family).toBe("INTEGRITY_CONDITION");
    expect(classifyExplicitQualificationIntegrityDriverLabelV1("VISA MISUSE OF AUTH FEE").family).toBe("MISUSE_CONDITION");
    expect(classifyExplicitQualificationIntegrityDriverLabelV1("DS PROGRAM INTEGRITY FEE").family).toBe("PROGRAM_INTEGRITY_CONDITION");
  });

  it("binds explicit qualification and integrity charges to unchanged RD dollars", () => {
    const result = november.driver;
    expect(result.findings).toHaveLength(3);
    expect(result.aggregate).toMatchObject({
      uniqueReferencedRdChargeCount: 3,
      referencedChargedAmountMinor: 98,
      qualificationRelatedAmountMinor: 57,
      integrityMisuseRelatedAmountMinor: 41,
      additiveDriverAmountMinor: 0,
      duplicateRdChargeReferenceCount: 0,
    });
    expect(result.findings.map((finding) => finding.driverFamily)).toEqual(expect.arrayContaining([
      "NON_QUALIFIED", "INTEGRITY_CONDITION",
    ]));
    for (const finding of result.findings) {
      expect(finding.rdChargeRefs).toHaveLength(1);
      expect(finding.statementEvidenceRefs.length).toBeGreaterThan(0);
      expect(finding.additiveContributionMinor).toBe(0);
      expect(finding.referencedChargedAmountMinor).toBe(november.rdAmounts.get(finding.rdChargeRefs[0]));
    }
  });

  it("keeps a vague Standard label unresolved instead of inferring a downgrade", () => {
    const candidate = basys.driver.unresolvedCandidates.find((item) => /SIGNATURE CARD STANDARD/i.test(item.printedLabel));
    expect(candidate).toMatchObject({
      referencedChargedAmountMinor: 1_046,
      reasonCode: "AMBIGUOUS_QUALIFICATION_LIKE_LABEL_WITHOUT_EXPLICIT_SUPPORTED_CONDITION",
    });
    expect(basys.driver.findings.some((finding) => finding.printedLabels.some((label) => /SIGNATURE CARD STANDARD/i.test(label)))).toBe(false);
  });

  it("preserves rule setter, collection, provider control, and operational influence as independent claims", () => {
    const network = november.driver.findings.find((finding) => finding.ruleSetter.state === "GOVERNED" && finding.merchantFacingPriceController.state === "UNKNOWN");
    expect(network).toBeDefined();
    expect(network!.collector.state).toBe("GOVERNED");
    expect(network!.providerControl.state).toBe("UNKNOWN");
    expect(network!.operationalInfluence.state).toBe("POSSIBLE_NOT_CAUSAL");
    expect(network!.merchantResponsibility.state).toBe("UNKNOWN");
    expect(network!.causalReason.state).toBe("UNKNOWN");
    expect(network!.controllability.state).toBe("UNKNOWN");
    expect(network!.avoidability.state).toBe("UNKNOWN");
  });

  it("does not mutate RD, its rounding metadata, or the current economics profile", () => {
    expect(november.rdBefore).toBe(november.rdAfter);
    expect(november.profileBefore).toBe(november.profileAfter);
    expect(basys.rdBefore).toBe(basys.rdAfter);
    expect(basys.profileBefore).toBe(basys.profileAfter);
  });

  it("keeps prohibited additive, comparison, savings, AI, knowledge, and routing outputs at zero", () => {
    for (const result of [november.driver, basys.driver]) {
      expect(result.safety).toMatchObject({
        rdIsSoleAdditiveLedger: true,
        rdMutationAllowed: false,
        canonicalMutationAllowed: false,
        driverCreatesAdditiveDollars: false,
        causalResponsibilityInferenceAllowed: false,
        controllabilityInferenceAllowed: false,
        avoidabilityInferenceAllowed: false,
        processorOrMerchantBlameAllowed: false,
        comparisonInputCount: 0,
        savingsOutputCount: 0,
        annualizationOutputCount: 0,
        aiOrWebOperationCount: 0,
        newKnowledgeAdmissionCount: 0,
        customerRoutingAllowed: false,
      });
    }
  });
});

async function buildCase(file: string, businessType: "restaurant_food_beverage") {
  const safeStatementId = file.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const inspected = await inspectFiservOneStatementEvaluation({ statementPaths: [`test/fixtures/pdfs/${file}`], safeStatementId });
  const canonical = buildCanonicalStatementFactsFromParsedDocument(inspected.document, { sourceFileName: file, businessType });
  const legacy = analyzeStatementDocument(inspected.document, businessType, { sourceFileName: file });
  const found = legacy.fiservFeeAnalysisV2 as { pricingModel?: { pricingModel?: string; confidence?: string } } | undefined;
  const model = found?.pricingModel?.pricingModel;
  if (!model || !["flat_discount_pricing", "tiered_pricing", "interchange_plus", "flat_rate", "unknown"].includes(model)) {
    throw new Error(`pricing unavailable ${file}`);
  }
  const pricingInput: InternalAnalystPricingModelInput = {
    model: model as InternalAnalystPricingModelInput["model"],
    confidence: found?.pricingModel?.confidence === "high" ? "high" : found?.pricingModel?.confidence === "medium" ? "medium" : "low",
    evidenceRefs: canonical.feeLedger.rows.slice(0, 3).flatMap((row) => row.contributionDecision.evidenceRefs),
    relevantPopulation: model === "interchange_plus" ? "processed_sales_with_itemized_interchange_population" : null,
    deterministic: true,
  };
  const knowledge = new GovernedPaymentKnowledgeAuthority().resolveStatement({
    analysis: canonical,
    context: { geography: { value: "us", evidenceClass: "statement_local", evidenceRefs: ["supported_fiserv_us_scope"] } },
    suppliedPricingObservation: pricingInput,
  });
  const decomposition = buildCommercialDecompositionContractV1({ analysis: canonical, knowledge });
  const profile = buildFiservCurrentRelationshipEconomicsProfileWithActivityAdmissionV1({
    document: inspected.document,
    economic: inspected.economic,
    canonicalAnalysis: canonical,
    commercialDecomposition: decomposition,
  }).profile;
  const rdBefore = fingerprint(inspected.economic);
  const profileBefore = fingerprint(profile);
  const driver = buildClaimScopedQualificationIntegrityCostDriverAdmissionV1({
    economic: inspected.economic,
    currentRelationshipProfile: profile,
    commercialDecomposition: decomposition,
  });
  const rdAmounts = new Map(inspected.economic.economicLayer.charges
    .filter((charge) => charge.observedAmount)
    .map((charge) => [charge.id, charge.observedAmount!.amountMinor]));
  return {
    driver,
    rdAmounts,
    rdBefore,
    rdAfter: fingerprint(inspected.economic),
    profileBefore,
    profileAfter: fingerprint(profile),
  };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
