import { describe, expect, it } from "vitest";

import { AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1 } from "../../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import { applyHelcimDharmaCaptureRemediationV1, loadHelcimDharmaCaptureRemediationBaselineV1 } from "../../src/canonical/commercialSourceCaptureRemediationHelcimDharmaV1.js";
import { applyImmutableCapturesToCommercialRegistryV1, loadImmutableCommercialSourceCaptureBaselineV1 } from "../../src/canonical/commercialImmutableSourceCaptureBaselineV1.js";
import { evaluateCommercialOfferQualificationV1 } from "../../src/canonical/commercialSourceGovernanceV1.js";
import { DHARMA_HIGH_VOLUME_IDENTITY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1 } from "../../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import {
  comparatorConsumptionProductTestMatrixV01,
  evaluateComparatorConsumptionDiagnosticV1,
} from "../../scripts/lib/comparatorConsumptionRefusalDiagnosticV1.js";

const priorBaseline = await loadImmutableCommercialSourceCaptureBaselineV1();
const authorize = applyImmutableCapturesToCommercialRegistryV1({ registry: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, baseline: priorBaseline });
const batchBefore = applyImmutableCapturesToCommercialRegistryV1({ registry: HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, baseline: priorBaseline });
const remediation = await loadHelcimDharmaCaptureRemediationBaselineV1({ priorBaseline });
const batch1B = applyHelcimDharmaCaptureRemediationV1({ registry: batchBefore, baseline: remediation });
const matrix = comparatorConsumptionProductTestMatrixV01();
const results = matrix.map((testCase) => evaluateComparatorConsumptionDiagnosticV1({ testCase, registries: [authorize, batch1B] }));
const byId = (id: string) => results.find((item) => item.caseId === id)!;

describe("Comparator Consumption / Refusal Diagnostic v1", () => {
  it("covers all 38 Product matrix cases exactly once", () => {
    expect(matrix).toHaveLength(38);
    expect(new Set(matrix.map((item) => item.caseId)).size).toBe(38);
    expect(matrix.filter((item) => item.caseId.startsWith("AN-"))).toHaveLength(4);
    expect(matrix.filter((item) => item.caseId.startsWith("H-"))).toHaveLength(11);
    expect(matrix.filter((item) => item.caseId.startsWith("D-"))).toHaveLength(13);
    expect(matrix.filter((item) => item.caseId.startsWith("X-"))).toHaveLength(10);
  });

  it("makes all 15 mandatory Product fields visible", () => {
    for (const result of results) {
      expect(result.providerIdentity).toBeTruthy();
      expect(result.offerIdentity).toBeTruthy();
      expect(result.salesChannel).toBeTruthy();
      expect(result.merchantChannel).toBeTruthy();
      expect(result.matchedPopulation).toBeTruthy();
      expect(result.economicLayer).toBeTruthy();
      expect(result.sourceApplicableWhen).toBeTruthy();
      expect(result.merchantEligibilityStatus).toBeTruthy();
      expect(result.commercialFactState).toMatch(/^(KNOWN|KNOWN_ABSENT|UNKNOWN)$/);
      expect(result.decompositionStrength).toBeTruthy();
      expect(result.comparisonStrength).toMatch(/^(exact_component|bounded_component|conditional_scenario|unavailable)$/);
      expect(result.allowedClaim).toBeTruthy();
      expect(result.refusedClaims.length).toBeGreaterThan(0);
      expect(result.refusalReasons.length).toBeGreaterThan(0);
      if (result.comparisonStrength === "unavailable") expect(result.smallestUnlocker).toBeTruthy();
    }
  });

  it("binds every provider-specific case to the admitted commercial registries", () => {
    for (const result of results.filter((item) => !item.caseId.startsWith("X-"))) {
      expect(result.evidenceBinding.allRefsGovernedOrProductControl).toBe(true);
      expect(result.sourceObservationRefs.length + result.componentVersionRefs.length).toBeGreaterThan(0);
    }
  });

  it("produces the expected strength distribution without treating refusal as failure", () => {
    expect(Object.groupBy(results, (item) => item.comparisonStrength)).toMatchObject({
      exact_component: expect.arrayContaining([byId("AN-01"), byId("AN-04"), byId("D-10"), byId("X-01"), byId("X-05"), byId("X-07")]),
      bounded_component: expect.arrayContaining([byId("D-09"), byId("X-02"), byId("X-03")]),
      conditional_scenario: expect.arrayContaining([byId("H-01"), byId("H-03"), byId("D-03"), byId("D-07"), byId("X-08")]),
      unavailable: expect.arrayContaining([byId("AN-02"), byId("H-02"), byId("D-06"), byId("D-12"), byId("X-04"), byId("X-10")]),
    });
    expect(results.filter((item) => item.comparisonStrength === "exact_component")).toHaveLength(6);
    expect(results.filter((item) => item.comparisonStrength === "bounded_component")).toHaveLength(3);
    expect(results.filter((item) => item.comparisonStrength === "conditional_scenario")).toHaveLength(13);
    expect(results.filter((item) => item.comparisonStrength === "unavailable")).toHaveLength(16);
  });

  it("preserves Authorize.net gateway, acquiring, Account Updater, and scoped-zero boundaries", () => {
    expect(byId("AN-01").claimPermissions.scopedEvidenceUseAllowed).toBe(true);
    expect(byId("AN-02").refusedClaims).toContain("Zero acquiring cost.");
    expect(byId("AN-03").matchedPopulation).toBe("successful account updates");
    expect(byId("AN-04").commercialFactState).toBe("KNOWN_ABSENT");
    expect(byId("AN-04").claimPermissions.completeTotalCostClaimAllowed).toBe(false);
  });

  it("preserves Helcim channel, tier, eligibility, chargeback, and recurring boundaries", () => {
    expect(byId("H-01").claimPermissions.merchantApprovalClaimAllowed).toBe(false);
    expect(byId("H-02").comparisonStrength).toBe("unavailable");
    expect(byId("H-03").matchedPopulation).toContain("separately known");
    expect(byId("H-05").smallestUnlocker).toContain("qualifying volume");
    expect(byId("H-06").commercialFactState).toBe("UNKNOWN");
    expect(byId("H-07").merchantEligibilityStatus).toBe("review_required");
    expect(byId("H-08").comparisonStrength).toBe("unavailable");
    expect(byId("H-09").merchantEligibilityStatus).toBe("no_known_public_block");
    expect(byId("H-10").smallestUnlocker).toContain("Won versus lost");
    expect(byId("H-11").matchedPopulation).toBe("recurring-payment transaction volume");
  });

  it("uses Dharma's admitted OR qualification and preserves exact-$25, source, PCI, and channel boundaries", () => {
    const high = batch1B.offerCompositionVersions.find((item) => item.offerIdentity.namedOffer === DHARMA_HIGH_VOLUME_IDENTITY_V1.namedOffer)!;
    expect(evaluateCommercialOfferQualificationV1(high, { monthly_volume_minor: 12_000_000, transaction_count: 4_000, merchant_type: "retail", average_ticket_minor: 3_000 }).state).toBe("QUALIFIED");
    expect(evaluateCommercialOfferQualificationV1(high, { monthly_volume_minor: 9_000_000, transaction_count: 6_000, merchant_type: "retail", average_ticket_minor: 1_500 }).state).toBe("QUALIFIED");
    expect(evaluateCommercialOfferQualificationV1(high, { monthly_volume_minor: 9_000_000, transaction_count: 4_000, merchant_type: "restaurant", average_ticket_minor: 2_000 }).state).toBe("QUALIFIED");
    expect(evaluateCommercialOfferQualificationV1(high, { monthly_volume_minor: 9_000_000, transaction_count: 4_000, merchant_type: "restaurant", average_ticket_minor: 2_500 }).state).toBe("UNRESOLVED_QUALIFICATION_BOUNDARY");
    expect(evaluateCommercialOfferQualificationV1(high, { monthly_volume_minor: 9_000_000, transaction_count: 6_000, merchant_type: "restaurant", average_ticket_minor: 2_500 }).state).toBe("QUALIFIED");
    expect(byId("D-09").comparisonStrength).toBe("bounded_component");
    expect(byId("D-10").refusedClaims[0]).toContain("Early Termination");
    expect(byId("D-11").comparisonStrength).toBe("unavailable");
    expect(byId("D-12").claimPermissions.historicalAvailabilityClaimAllowed).toBe(false);
    expect(byId("D-13").offerIdentity).toContain("identity must be established");
  });

  it("computes bounds directionally without turning an upper bound into savings", () => {
    expect(byId("X-02").directionalArithmetic).toMatchObject({
      candidateExactMinor: 35_000,
      differenceRangeCurrentMinusCandidateMinor: { low: null, high: 15_000 },
      candidateExceedsCurrentByAtLeastMinor: null,
      preciseSavingsClaimAllowed: false,
    });
    expect(byId("X-03").directionalArithmetic).toMatchObject({ candidateExactMinor: 60_000, candidateExceedsCurrentByAtLeastMinor: 10_000 });
  });

  it("keeps channel, approval, history, decomposition, and removability claims independent", () => {
    expect(byId("H-01").gateStates.merchantChannel).toBe("matched");
    expect(byId("H-01").claimPermissions.merchantApprovalClaimAllowed).toBe(false);
    expect(byId("D-12").sourceApplicableWhen).toBe("historical_unavailable");
    expect(byId("X-01").claimPermissions.completeTotalCostClaimAllowed).toBe(false);
    expect(byId("X-02").claimPermissions.preciseSavingsClaimAllowed).toBe(false);
    for (const result of results) {
      expect(result.claimPermissions.overpaymentOrMarketGradeAllowed).toBe(false);
      expect(result.claimPermissions.negotiabilityOrRemovabilityClaimAllowed).toBe(false);
      expect(result.claimPermissions.switchingRecommendationAllowed).toBe(false);
      expect(result.claimPermissions.customerFacingComparatorOutputAllowed).toBe(false);
      expect(result.claimPermissions.reusableKnowledgeAdmissionAllowed).toBe(false);
      expect(result.claimPermissions.canonicalMutationAllowed).toBe(false);
    }
  });
});
