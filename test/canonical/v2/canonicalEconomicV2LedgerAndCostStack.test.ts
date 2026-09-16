import { describe, expect, it } from "vitest";
import {
  buildCanonicalEconomicsV2EconomicAnalysis,
  buildCanonicalEconomicsV2PricingAnalysis,
  buildUnavailableCanonicalEconomicsV2Foundation,
} from "../../../src/canonical/v2/index.js";
import { approvedEconomicInput, buildApprovedEconomics, economicPricing } from "./economicFixtures.js";

describe("Canonical Economics V2 RD economic ledger and cost stack", () => {
  it("builds unique economic charges with debit/credit behavior and a complete reconciled stack", () => {
    const analysis = buildApprovedEconomics();

    expect(analysis.validation).toMatchObject({ status: "valid", errors: [] });
    expect(analysis.economicLayer.charges.map((charge) => [
      charge.subtype,
      charge.financialDirection,
      charge.observedAmount?.amountMinor,
      charge.contributionStatus,
    ])).toEqual([
      ["chargeback_fee", "debit", 1500, "contributes_classified"],
      ["service_admin", "debit", 3100, "contributes_classified"],
      ["fee_credit", "credit", 100, "contributes_classified"],
    ]);
    expect(analysis.economicLayer.costStack).toMatchObject({
      completeness: "complete",
      reconciliationDeltaMinor: 0,
      classifiedChargeNet: { amountMinor: 4500, currency: "USD" },
      totalStatementProcessingCost: { amountMinor: 4500, currency: "USD" },
    });
    expect(bucket(analysis, "processor_service_admin_cost")).toMatchObject({
      debitAmount: { amountMinor: 3100 },
      creditAmount: { amountMinor: 100 },
      netAmount: { amountMinor: 3000 },
    });
    expect(bucket(analysis, "operational_penalty_cost").netAmount.amountMinor).toBe(1500);
  });

  it("keeps distinct admitted source occurrences as distinct economic charges", () => {
    const analysis = buildApprovedEconomics();
    const refs = analysis.economicLayer.charges.map((charge) => charge.contributingOccurrenceRef);

    expect(new Set(refs).size).toBe(3);
    expect(new Set(analysis.economicLayer.charges.map((charge) => charge.id)).size).toBe(3);
  });

  it("uses an explicit unresolved remainder only for admitted incomplete detail coverage", () => {
    const partial = buildApprovedEconomics(undefined, { feeDetailCoverage: "incomplete", omitStatementFee: true });
    const unexplained = buildApprovedEconomics(undefined, { feeDetailCoverage: "complete", omitStatementFee: true });

    expect(partial.validation.status).toBe("valid");
    expect(partial.economicLayer.costStack).toMatchObject({
      completeness: "partial_but_financially_reconciled",
      unresolvedRemainder: { amountMinor: 3100, currency: "USD" },
      reconciliationDeltaMinor: 0,
      totalStatementProcessingCost: { amountMinor: 4500, currency: "USD" },
    });
    expect(bucket(partial, "unresolved_cost").netAmount.amountMinor).toBe(3100);
    expect(unexplained.economicLayer.costStack).toMatchObject({
      completeness: "financially_unreconciled",
      unresolvedRemainder: null,
      reconciliationDeltaMinor: 3100,
      totalStatementProcessingCost: null,
    });
  });

  it("blocks a fee credit when direction is not positively admitted", () => {
    const input = approvedEconomicInput();
    const credit = input.charges!.find((charge) => charge.key === "fee_credit")!;
    credit.directionProven = false;
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis(input);

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.economicLayer.charges.find((charge) => charge.subtype === "fee_credit")).toMatchObject({
      financialDirection: "unresolved",
      contributionStatus: "blocked_direction",
      contributingOccurrenceRef: null,
    });
    expect(analysis.economicLayer.costStack.completeness).toBe("financially_unreconciled");
  });

  it("excludes settlement, refund, chargeback-principal, representment, and funding populations from fee cost", () => {
    const analysis = buildApprovedEconomics();
    const reasons = new Set(analysis.economicLayer.nonFeeExclusions.map((item) => item.reason));
    const contributingRefs = new Set(analysis.economicLayer.charges.map((charge) => charge.contributingOccurrenceRef));

    expect(reasons).toEqual(new Set(["sales_refund", "settlement_adjustment", "chargeback_principal", "funding_activity"]));
    for (const exclusion of analysis.economicLayer.nonFeeExclusions) expect(contributingRefs.has(exclusion.occurrenceRef)).toBe(false);
  });

  it("keeps a chargeback representment outside processing-fee cost", () => {
    const analysis = buildApprovedEconomics(economicPricing({ chargeback: 6 }));

    expect(analysis.economicLayer.nonFeeExclusions).toContainEqual(expect.objectContaining({
      reason: "chargeback_representment",
    }));
    expect(analysis.economicLayer.costStack.totalStatementProcessingCost).toEqual({ amountMinor: 4500, currency: "USD" });
  });

  it("uses complete-with-rounding only when an admitted RB reconciliation control documents it", () => {
    const pricing = structuredClone(economicPricing());
    const statement = pricing.foundation.sourceModel.occurrences.find((occurrence) => occurrence.pageNumber === 3 && occurrence.semanticRole === "fee_charge")!;
    statement.printedAmount = { amountMinor: statement.printedAmount!.amountMinor + 1, currency: "USD" };
    const unrelatedControl = structuredClone(pricing.foundation.reconciliation[0]!);
    unrelatedControl.id = "reconciliation_rd_unrelated_rounding";
    unrelatedControl.status = "pass_with_rounding";
    unrelatedControl.tolerance = "0.01";
    pricing.foundation.reconciliation.push(unrelatedControl);
    const feeControl = structuredClone(pricing.foundation.reconciliation.find((item) => item.controlIdentity === "fee_detail:all_line_items_eq_total_fees")!);
    feeControl.id = "reconciliation_rd_fee_bound_rounding";
    feeControl.status = "pass_with_rounding";
    feeControl.tolerance = "0.01";
    pricing.foundation.reconciliation.push(feeControl);

    const unrelatedInput = approvedEconomicInput(pricing);
    unrelatedInput.documentedRoundingReconciliationRef = unrelatedControl.id;
    const unrelated = buildCanonicalEconomicsV2EconomicAnalysis(unrelatedInput);
    const input = approvedEconomicInput(pricing);
    input.documentedRoundingReconciliationRef = feeControl.id;
    const documented = buildCanonicalEconomicsV2EconomicAnalysis(input);

    expect(unrelated.economicLayer.costStack.completeness).toBe("financially_unreconciled");
    expect(documented.validation.status).toBe("valid");
    expect(documented.economicLayer.costStack).toMatchObject({
      completeness: "complete_with_rounding",
      reconciliationDeltaMinor: -1,
      reconciliationRef: feeControl.id,
      totalStatementProcessingCost: { amountMinor: 4500 },
    });
  });

  it("keeps source-unavailable G9-style economics not derivable", () => {
    const foundation = buildUnavailableCanonicalEconomicsV2Foundation({
      sourceDocumentRef: "SOURCE-UNAVAILABLE-RD",
      provenanceStatus: "source_unavailable",
      reason: "Source unavailable.",
    });
    const pricing = buildCanonicalEconomicsV2PricingAnalysis({
      foundation,
      admissionProfile: {
        source: "observational",
        pricingAdmissionId: "unavailable_rd_pricing_v1",
        populationSemanticsProven: false,
        pricingCoverageProven: false,
        underlyingCostRolesProven: false,
        formulaRelationshipsProven: false,
        noActiveProcessingProven: false,
        noActiveProcessingEvidenceRefs: [],
        evidenceRefs: [],
        limitations: ["Source unavailable."],
      },
    });
    const analysis = buildCanonicalEconomicsV2EconomicAnalysis({
      pricingAnalysis: pricing,
      admissionProfile: {
        source: "observational",
        admissionId: "source_unavailable_rd_v1",
        feeDetailCoverage: "unavailable",
        statementPeriodApplicabilityProven: false,
        evidenceRefs: [],
        limitations: ["Source unavailable."],
      },
    });

    expect(analysis.validation.status).toBe("valid");
    expect(analysis.economicLayer.charges).toEqual([]);
    expect(analysis.economicLayer.costStack).toMatchObject({
      completeness: "not_derivable_from_document",
      authoritativeStatementFeeTotal: null,
      totalStatementProcessingCost: null,
    });
  });
});

function bucket(analysis: ReturnType<typeof buildApprovedEconomics>, kind: string) {
  return analysis.economicLayer.costStack.buckets.find((item) => item.kind === kind)!;
}
