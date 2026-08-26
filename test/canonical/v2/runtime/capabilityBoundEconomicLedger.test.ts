import { describe, expect, it } from "vitest";

import {
  buildCanonicalEconomicsV2FromFiserv,
  buildCanonicalUnresolvedClaimInventory,
  buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing,
  buildObservationalCanonicalPricingV2FromFiserv,
  fiservFeeLedgerOccurrences,
  validateCanonicalEconomicsV2EconomicAnalysis,
} from "../../../../src/canonical/v2/index.js";
import { v2SyntheticStatement } from "../fixtures.js";

describe("capability-bound economic ledger", () => {
  it("admits debit and credit fee rows as unresolved cost without inventing economic semantics", () => {
    const pricing = admittedSyntheticPricing(true);
    const economic = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(pricing);
    const charges = economic.economicLayer.charges;
    const feeDetailProof = new Set(pricing.foundation.templateCapability.capabilities
      .find((item) => item.capability === "fee_detail")!.proofEvidenceRefs);

    expect(economic.validation.status).toBe("valid");
    expect(economic.economicLayer.admissionProfile).toMatchObject({
      source: "runtime_capability",
      feeDetailCoverage: "complete",
      statementPeriodApplicabilityProven: true,
    });
    expect(charges).toHaveLength(3);
    expect(charges.map((charge) => [charge.financialDirection, charge.observedAmount?.amountMinor]))
      .toEqual([["debit", 1_500], ["debit", 3_100], ["credit", 100]]);
    expect(charges.every((charge) => charge.contributionStatus === "contributes_unresolved" &&
      charge.category === "unresolved_unclassified" && charge.categoryResolution === "unresolved")).toBe(true);
    expect(charges.every((charge) => charge.evidenceRefs.every((ref) => feeDetailProof.has(ref)))).toBe(true);
    expect(economic.economicLayer.participants).toEqual([]);
    expect(economic.economicLayer.roleClaims).toEqual([]);
    expect(economic.economicLayer.costStack).toMatchObject({
      classifiedChargeNet: { amountMinor: 4_500, currency: "USD" },
      unresolvedRemainder: null,
      reconciliationDeltaMinor: 0,
      completeness: "partial_but_financially_reconciled",
    });

    const inventory = buildCanonicalUnresolvedClaimInventory({ pricing, economic, synthesis: null });
    expect(inventory.validation.status).toBe("valid");
    expect(inventory.countsByClass).toMatchObject({
      economic_category: 3,
      economic_ownership: 3,
      economic_control: 3,
      merchant_actionability: 3,
    });
    expect(inventory.claims.filter((item) => item.canonicalRefs[0] === charges[2]!.id)
      .every((item) => item.amountUnderReview?.direction === "credit" && item.amountUnderReview.amountMinor === 100)).toBe(true);

    const overclaimed = structuredClone(economic);
    overclaimed.economicLayer.charges[0]!.category = "processor_acquirer_pricing";
    overclaimed.economicLayer.charges[0]!.categoryResolution = "proven";
    overclaimed.economicLayer.charges[0]!.contributionStatus = "contributes_classified";
    expect(validateCanonicalEconomicsV2EconomicAnalysis(overclaimed).validation.errors)
      .toContain("Capability-bound fee occurrence authority cannot establish economic category semantics.");

    const detachedProof = structuredClone(economic);
    detachedProof.economicLayer.charges[0]!.supportingDetailAdmissionEvidenceRefs = [];
    expect(validateCanonicalEconomicsV2EconomicAnalysis(detachedProof).validation.errors)
      .toContain(`Capability-bound charge ${detachedProof.economicLayer.charges[0]!.id} lacks claim-scoped fee-detail proof.`);
  });

  it("keeps proven total economics valid and emits a typed coverage claim when detail authority is absent", () => {
    const pricing = admittedSyntheticPricing(false);
    const economic = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(pricing);
    const inventory = buildCanonicalUnresolvedClaimInventory({ pricing, economic, synthesis: null });

    expect(economic.validation.status).toBe("valid");
    expect(economic.economicLayer.admissionProfile).toMatchObject({
      source: "runtime_capability",
      feeDetailCoverage: "incomplete",
    });
    expect(economic.economicLayer.charges).toEqual([]);
    expect(economic.economicLayer.costStack).toMatchObject({
      authoritativeStatementFeeTotal: { amountMinor: 4_500, currency: "USD" },
      classifiedChargeNet: { amountMinor: 0, currency: "USD" },
      unresolvedRemainder: { amountMinor: 4_500, currency: "USD" },
      reconciliationDeltaMinor: 0,
      completeness: "partial_but_financially_reconciled",
    });
    expect(inventory.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimClass: "fee_detail_coverage",
        requiredEvidenceClass: "admitted_fee_detail_evidence",
        possibleDecisionEffects: expect.arrayContaining(["cost_stack_completeness", "composition_permission"]),
      }),
    ]));
    expect(inventory.claims.some((item) => item.claimClass === "economic_category")).toBe(false);
  });
});

function admittedSyntheticPricing(detailSupported: boolean) {
  const fixture = v2SyntheticStatement();
  (fixture.parserOutput as { evidence: Array<Record<string, unknown>> }).evidence.push({
    field: "statementPeriod",
    sourceSection: "SUMMARY",
    pageNumber: 1,
    lineIndex: 0,
    evidenceLine: "Statement period 2026-08-01 through 2026-08-31",
    value: "2026-08-01/2026-08-31",
  });
  const baseInput = {
    document: fixture.document,
    parserOutput: fixture.parserOutput,
    sourceDocumentRef: "SYNTH-CAPABILITY-BOUND-LEDGER",
    parserId: "synthetic_fiserv_foundation_parser",
    provenanceStatus: "observational" as const,
  };
  const observed = buildCanonicalEconomicsV2FromFiserv(baseInput);
  const feeOccurrences = fiservFeeLedgerOccurrences(observed);
  const feeDetailRefs = feeOccurrences.map((item) => item.evidenceRef);
  const statementPeriodRefs = observed.sourceModel.occurrences
    .filter((item) => item.sourceLabel === "statementPeriod").map((item) => item.evidenceRef);
  const feeTotalRefs = observed.sourceModel.occurrences
    .filter((item) => item.sourceLabel === "totalFees").map((item) => item.evidenceRef);
  const proofRefs = [...new Set([...feeTotalRefs, ...feeDetailRefs, ...statementPeriodRefs])];
  const foundation = buildCanonicalEconomicsV2FromFiserv({
    ...baseInput,
    templateAdmission: {
      detectedFamily: "Fiserv / First Data",
      detectedTemplate: "synthetic-runtime-capability",
      detectedVersion: "1.0.0",
      identityStatus: "proven",
      admissionStatus: "admitted",
      admissionAuthority: {
        lifecycle: "admitted_with_conditions",
        authorityClass: "deterministic_capability_policy",
        authorityRef: "test-runtime-capability-policy",
        admittedAt: "2026-08-26T00:00:00.000Z",
        admissionVersion: "1.0.0",
        effectiveFrom: null,
        effectiveTo: null,
      },
      completenessStatus: "unknown",
      admissionProofEvidenceRefs: proofRefs,
      capabilities: [
        { capability: "fee_total", status: "supported", proofEvidenceRefs: feeTotalRefs },
        { capability: "fee_detail", status: detailSupported ? "supported" : "unknown",
          proofEvidenceRefs: detailSupported ? feeDetailRefs : [] },
        { capability: "statement_period", status: "supported", proofEvidenceRefs: statementPeriodRefs },
      ],
    },
  });
  expect(foundation.validation.status).toBe("valid");
  return buildObservationalCanonicalPricingV2FromFiserv(foundation);
}
