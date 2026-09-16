import { describe, expect, it } from "vitest";
import { buildCanonicalEconomicsV2SynthesisAnalysis } from "../../../src/canonical/v2/index.js";
import { buildSynthesis, money, synthesisInput, supportedProof } from "./synthesisFixtures.js";

describe("Canonical Economics V2 RE special economics, signals, risk, and themes", () => {
  it("keeps refund populations, return behavior, pricing basis, and fees distinct", () => {
    const refund = buildSynthesis().synthesisLayer.refundEconomics;

    expect(refund).toMatchObject({
      status: "supported",
      underlyingCostReturnState: "mixed_by_scope",
      processorPricingReturnState: "unresolved",
      percentagePricingBasis: "gross_sales",
    });
    expect(refund.refundVolumeFactRef).not.toBe(refund.refundCountFactRef);
    expect(refund.returnFeeChargeRefs).toEqual([]);
  });

  it("refuses Amex acceptance mode and margin without admitted structural and control evidence", () => {
    const amex = buildSynthesis().synthesisLayer.amexEconomics;

    expect(amex).toMatchObject({
      status: "unresolved",
      acceptanceMode: "unknown",
      acceptanceModeMappingRef: null,
      marginState: "unresolved",
      marginChargeRefs: [],
      ownershipRoleRefs: [],
    });
    expect(amex.limitations).toContain("Amex margin was refused without admitted margin charges and ownership evidence.");
  });

  it("preserves service charge observation without inferring usage, duplication, or removability", () => {
    const service = buildSynthesis().synthesisLayer.accountServices[0]!;

    expect(service).toMatchObject({
      serviceType: "gateway",
      state: "charge_observed_usage_unknown",
      usageEvidenceRefs: [],
      potentiallyDuplicativeWithRefs: [],
    });
    expect(service.chargeRefs).toHaveLength(1);
  });

  it("implements S4 as separate evidenced flows and no gross-fee shortcut", () => {
    const program = buildSynthesis().synthesisLayer.merchantPricingPrograms[0]!;

    expect(program).toMatchObject({
      programType: "dual_pricing",
      statementObservedProcessorFees: money(10000),
      consumerFacingRevenue: money(8000),
      merchantRetainedAmount: money(6000),
      thirdPartyRetention: money(2000),
      offsets: money(0),
      netMerchantBorneCost: money(4000),
      netBurdenState: "derived_when_evidenced",
    });
    expect(program.netMerchantBorneCost).not.toEqual(program.statementObservedProcessorFees);
  });

  it("withholds S4 net burden when any required flow is missing", () => {
    const input = synthesisInput();
    input.merchantPricingPrograms![0]!.merchantRetainedAmount = null;
    const program = buildCanonicalEconomicsV2SynthesisAnalysis(input).synthesisLayer.merchantPricingPrograms[0]!;

    expect(program).toMatchObject({ netMerchantBorneCost: null, netBurdenCalculationRef: null, netBurdenState: "unavailable" });
  });

  it("withholds positive special-economics states and values when proof is not canonical", () => {
    const input = synthesisInput();
    const unsupportedProof = {
      derivabilityTier: "unresolved" as const,
      evidenceClass: "hypothesis_only" as const,
      assertionBasis: "ai_hypothesis" as const,
      evidenceRefs: input.refundEconomics!.proof.evidenceRefs,
    };
    input.refundEconomics!.proof = unsupportedProof;
    for (const claim of input.claims!.filter((item) => item.subjectKey === "refund" || item.subjectKey === "gateway_service" || item.subjectKey === "dual_pricing" || item.subjectKey === "future_notice")) {
      claim.proof = unsupportedProof;
    }
    input.accountServices![0]!.state = "charge_observed_usage_proven";
    input.accountServices![0]!.proof = unsupportedProof;
    input.merchantPricingPrograms![0]!.proof = unsupportedProof;
    input.notices![0]!.verificationState = "verified";
    input.notices![0]!.proof = unsupportedProof;
    const layer = buildCanonicalEconomicsV2SynthesisAnalysis(input).synthesisLayer;

    expect(layer.refundEconomics).toMatchObject({
      status: "unresolved",
      underlyingCostReturnState: "unresolved",
      processorPricingReturnState: "unresolved",
      percentagePricingBasis: "unresolved",
    });
    expect(layer.accountServices[0]).toMatchObject({ state: "unresolved" });
    expect(layer.merchantPricingPrograms[0]).toMatchObject({
      status: "unresolved",
      statementObservedProcessorFees: null,
      consumerFacingRevenue: null,
      merchantRetainedAmount: null,
      thirdPartyRetention: null,
      offsets: null,
      netMerchantBorneCost: null,
    });
    expect(layer.notices[0]).toMatchObject({ verificationState: "not_independently_verified" });
  });

  it("represents unknown off-statement exposure without changing RD cost", () => {
    const analysis = buildSynthesis();
    const before = analysis.economicAnalysis.economicLayer.costStack;
    const exposure = analysis.synthesisLayer.offStatementExposures[0]!;

    expect(exposure).toMatchObject({ state: "unknown_whether_exists", observedAmount: null });
    expect(analysis.economicAnalysis.economicLayer.costStack).toEqual(before);
    expect(analysis.synthesisLayer).not.toHaveProperty("totalCostOfAcceptance");
  });

  it("requires positive admitted evidence before asserting off-statement presence or absence", () => {
    const input = synthesisInput();
    input.offStatementExposures![0]!.state = "known_absent_with_evidence";
    const absentRefused = buildCanonicalEconomicsV2SynthesisAnalysis(input).synthesisLayer.offStatementExposures[0]!;
    expect(absentRefused).toMatchObject({ state: "unknown_whether_exists", observedAmount: null });

    const evidenceRef = input.economicAnalysis.pricingAnalysis.foundation.sourceModel.evidence[0]!.id;
    input.offStatementExposures![0]!.state = "observed_with_admitted_evidence";
    input.offStatementExposures![0]!.observedAmount = money(2500);
    const period = input.economicAnalysis.pricingAnalysis.foundation.identity.statementPeriod!;
    const occurrenceRef = input.economicAnalysis.pricingAnalysis.foundation.sourceModel.occurrences[0]!.id;
    const presenceProof = { ...supportedProof(evidenceRef), evidenceClass: "merchant_document_supported" as const };
    input.offStatementExposures![0]!.proof = presenceProof;
    input.offStatementExposures![0]!.stateClaimKey = "equipment_presence";
    input.claims!.push({
      key: "equipment_presence", kind: "off_statement_presence", subjectKey: "equipment_lease", claimCode: "observed_equipment_lease",
      occurrenceRefs: [occurrenceRef], moneyValue: money(2500), periodStart: period.start, periodEnd: period.end, proof: presenceProof,
    });
    const observed = buildCanonicalEconomicsV2SynthesisAnalysis(input).synthesisLayer.offStatementExposures[0]!;
    expect(observed).toMatchObject({ state: "observed_with_admitted_evidence", observedAmount: money(2500) });
  });

  it("isolates future notices from current economics", () => {
    const analysis = buildSynthesis();
    const notice = analysis.synthesisLayer.notices[0]!;

    expect(notice).toMatchObject({
      verificationState: "not_independently_verified",
      analyzedPeriodApplicability: "future_candidate",
      candidateEconomicChangeCode: "future_network_fee_candidate",
    });
    expect(analysis.synthesisLayer.counterfactuals[0]!.alternativeProvenanceId).not.toBe(notice.id);
  });

  it("keeps operational signal, economic driver, causality, and risk independent", () => {
    const analysis = buildSynthesis();
    const signal = analysis.synthesisLayer.operationalSignals[0]!;

    expect(signal).toMatchObject({ status: "supported", causalStatus: "observed_only" });
    expect(signal.economicDriverRefs).toHaveLength(1);
    expect(analysis.synthesisLayer.accountRisk).toMatchObject({
      state: "observed_unreconciled",
      denominatorCompatibility: "unresolved",
      descriptiveRatioByCount: null,
      descriptiveRatioByValue: null,
      monitoringStatus: "unresolved",
      fairnessVerdict: "unavailable",
    });
  });

  it("fails dispute ratios closed when denominator compatibility is not proven", () => {
    const input = synthesisInput();
    input.accountRisk!.denominatorCompatibility = "incompatible";
    const risk = buildCanonicalEconomicsV2SynthesisAnalysis(input).synthesisLayer.accountRisk;

    expect(risk).toMatchObject({ state: "observed_unreconciled", descriptiveRatioByCount: null, descriptiveRatioByValue: null });
  });

  it("deduplicates themes by economic question and action boundary without prose", () => {
    const themes = buildSynthesis().synthesisLayer.themes;
    const driverTheme = themes.find((item) => item.economicQuestionCode === "major_processing_mix_driver")!;

    expect(themes).toHaveLength(2);
    expect(driverTheme.driverRefs).toHaveLength(2);
    expect(driverTheme.semanticCoverageCodes).toEqual([
      "THEME_PREMIUM_REWARDS_MAJOR_COST_DRIVER",
      "THEME_REGULATED_DEBIT_LOWERS_UNDERLYING_COST",
    ]);
    expect(driverTheme.projectionPermission).toBe("structured_only_no_customer_prose");
    expect(driverTheme).not.toHaveProperty("title");
    expect(driverTheme).not.toHaveProperty("explanation");
    expect(driverTheme).not.toHaveProperty("recommendation");
  });

  it("records only demonstrated approved amendments", () => {
    const amendments = buildSynthesis().synthesisLayer.semanticAmendments;
    expect(amendments.map((item) => item.id)).toEqual([
      "RE-AMEND-001-DRIVER-NOT-OPPORTUNITY",
      "RE-AMEND-002-OVERLAP-AWARE-ATTRIBUTION",
      "RE-AMEND-003-EVIDENCE-BOUND-COUNTERFACTUAL",
      "RE-AMEND-004-CONTROL-GATED-MERCHANT-LEVER",
      "RE-AMEND-005-SEPARATE-SPECIAL-ECONOMIC-FLOWS",
      "RE-AMEND-006-TEMPORAL-NOTICE-ISOLATION",
      "RE-AMEND-007-SIGNAL-RISK-NONCAUSALITY",
      "RE-AMEND-008-SEMANTIC-THEME-SYNTHESIS",
    ]);
    expect(amendments.every((item) => item.synthesisRefs.length > 0)).toBe(true);

    const input = synthesisInput();
    input.demonstratedAmendments = [];
    expect(buildCanonicalEconomicsV2SynthesisAnalysis(input).synthesisLayer.semanticAmendments).toEqual([]);
  });
});
