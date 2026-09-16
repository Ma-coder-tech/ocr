import { describe, expect, it } from "vitest";

import {
  buildCanonicalEconomicsV2FromFiserv,
  buildCanonicalUnresolvedClaimInventory,
  buildCanonicalRfClaimResolution,
  buildCanonicalRgWorkLedger,
  buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing,
  categorySubjectCode,
  buildObservationalCanonicalPricingV2FromFiserv,
  fiservFeeLedgerOccurrences,
  unboundedKnowledgeScope,
  validateCanonicalRfSemanticConvergence,
  validateCanonicalEconomicsV2EconomicAnalysis,
} from "../../../../src/canonical/v2/index.js";
import { v2SyntheticStatement } from "../fixtures.js";
import { admittedKnowledge } from "../knowledge/knowledgeFixtures.js";

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
      .toContain("Capability-bound category semantics require exactly one admitted canonical semantic application.");

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

  it("applies one exact admitted category mapping without resolving ownership, control, actionability, or financial truth", () => {
    const pricing = admittedSyntheticPricing(true);
    const base = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(pricing);
    const baseInventory = buildCanonicalUnresolvedClaimInventory({ pricing, economic: base, synthesis: null });
    const firstCharge = base.economicLayer.charges[0]!;
    const occurrence = pricing.foundation.sourceModel.occurrences.find((item) =>
      item.id === firstCharge.contributingOccurrenceRef,
    )!;
    const subjectCode = categorySubjectCode(occurrence.sourceLabel);
    const entry = admittedKnowledge({
      id: "admitted-category-map",
      claimType: "stable_facet_mapping",
      subjectCode,
      value: { kind: "mapping", canonicalCode: "network_card_brand_economics", sourceCode: subjectCode },
      scope: unboundedKnowledgeScope(),
      effectiveFrom: "2026-01-01",
      evidence: [{ ref: "reviewed-category-map", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    });
    const rf = buildCanonicalRfClaimResolution({ inventory: baseInventory, economic: base, entries: [entry],
      tenantRef: "tenant-a", accountRef: "account-a" });
    const resolved = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(pricing, rf.categoryApplications);
    const finalInventory = buildCanonicalUnresolvedClaimInventory({ pricing, economic: resolved, synthesis: null });

    expect(rf.validation.status).toBe("valid");
    expect(rf.categoryApplications).toHaveLength(1);
    const compilerProof = buildCanonicalRgWorkLedger({ inventory: baseInventory, economic: base, synthesis: null,
      rfResolution: rf }).claimAdmissions.find((item) => item.facet === "economic_category" &&
        item.canonicalRefs.includes(firstCharge.id));
    expect(compilerProof?.atomicClaimId).toBe(rf.categoryApplications[0]!.atomicClaimId);
    expect(rf.decisions.find((item) => item.applicationKey)?.disposition).toBe("resolved_by_admitted_knowledge");
    expect(resolved.validation.status).toBe("valid");
    expect(resolved.economicLayer.charges[0]).toMatchObject({
      category: "network_card_brand_economics",
      categoryResolution: "proven",
      contributionStatus: "contributes_classified",
      observedAmount: firstCharge.observedAmount,
      financialDirection: firstCharge.financialDirection,
      contributingOccurrenceRef: firstCharge.contributingOccurrenceRef,
      reconciliationRefs: firstCharge.reconciliationRefs,
      semanticApplicationRefs: ["economic_semantic_application_001"],
      roleClaimRefs: [],
    });
    expect(resolved.economicLayer.charges.slice(1).every((item) =>
      item.categoryResolution === "unresolved" && item.contributionStatus === "contributes_unresolved",
    )).toBe(true);
    expect(resolved.economicLayer.costStack.totalStatementProcessingCost)
      .toEqual(base.economicLayer.costStack.totalStatementProcessingCost);
    const financiallyTampered = structuredClone(resolved);
    financiallyTampered.economicLayer.charges[0]!.observedAmount!.amountMinor += 1;
    expect(validateCanonicalRfSemanticConvergence({ base, resolved: financiallyTampered, rf }))
      .toContain(`rf_semantic_application_changed_charge_truth:${firstCharge.id}`);
    const lineageTampered = structuredClone(resolved);
    lineageTampered.economicLayer.semanticApplications[0]!.selectedEntryRefs = [];
    expect(validateCanonicalEconomicsV2EconomicAnalysis(lineageTampered).validation.errors)
      .toContain("Semantic application economic_semantic_application_001 lacks admitted RF snapshot provenance.");
    expect(finalInventory.countsByClass).toMatchObject({
      economic_category: 2,
      economic_ownership: 3,
      economic_control: 3,
      merchant_actionability: 3,
    });
    const remainingClasses = finalInventory.claims.filter((item) => item.canonicalRefs[0] === firstCharge.id)
      .map((item) => item.claimClass);
    expect(remainingClasses).toHaveLength(3);
    expect(remainingClasses).toEqual(expect.arrayContaining([
      "economic_control", "economic_ownership", "merchant_actionability",
    ]));

    const selfAssertedExternal = {
      ...rf.categoryApplications[0]!,
      sourceKind: "current_run_verified_rg_evidence" as const,
      knowledgeSnapshotHash: null,
      selectedEntryRefs: [],
      sourceAuthorities: ["processor_publication" as const],
      externalEvidenceRefs: ["rg-evidence-not-admitted"],
    };
    const rejectedExternal = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(pricing, [selfAssertedExternal]);
    expect(rejectedExternal.validation.status).toBe("invalid");
    expect(rejectedExternal.validation.errors).toContain(
      "Semantic application economic_semantic_application_001 lacks verified current-run external evidence provenance.",
    );
    const missingAuthority = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(pricing, [{
      ...selfAssertedExternal,
      sourceAuthorities: [],
    }], ["rg-evidence-not-admitted"]);
    expect(missingAuthority.validation.errors).toContain(
      "Semantic application economic_semantic_application_001 lacks verified current-run external evidence provenance.",
    );
  });

  it("refuses non-admitted, wrong-period, conflicting, and malformed category knowledge", () => {
    const pricing = admittedSyntheticPricing(true);
    const economic = buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing(pricing);
    const inventory = buildCanonicalUnresolvedClaimInventory({ pricing, economic, synthesis: null });
    const occurrence = pricing.foundation.sourceModel.occurrences.find((item) =>
      item.id === economic.economicLayer.charges[0]!.contributingOccurrenceRef,
    )!;
    const subjectCode = categorySubjectCode(occurrence.sourceLabel);
    const baseEntry = admittedKnowledge({
      id: "category-map",
      claimType: "stable_facet_mapping",
      subjectCode,
      value: { kind: "mapping", canonicalCode: "network_card_brand_economics", sourceCode: subjectCode },
      scope: unboundedKnowledgeScope(),
      effectiveFrom: "2026-01-01",
      evidence: [{ ref: "reviewed-category-map", sourceAuthority: "approved_internal_manual_mapping", private: false }],
    });
    const resolve = (entries: Parameters<typeof buildCanonicalRfClaimResolution>[0]["entries"]) =>
      buildCanonicalRfClaimResolution({ inventory, economic, entries, tenantRef: "tenant-a", accountRef: "account-a" });

    const candidate = resolve([{ ...baseEntry, admission: { lifecycle: "candidate", authorityClass: null,
      authorityRef: null, admittedAt: null, conditions: [] } }]);
    expect(candidate.categoryApplications).toEqual([]);
    expect(candidate.decisions.find((item) => item.query?.subjectCode === subjectCode)?.disposition)
      .toBe("unresolved_no_admitted_knowledge");

    const wrongPeriod = resolve([{ ...baseEntry, effectiveFrom: "2027-01-01" }]);
    expect(wrongPeriod.categoryApplications).toEqual([]);
    expect(wrongPeriod.decisions.find((item) => item.query?.subjectCode === subjectCode)?.disposition)
      .toBe("unresolved_scope_or_period");

    const conflict = resolve([baseEntry, { ...baseEntry, id: "category-map-conflict",
      value: { kind: "mapping", canonicalCode: "processor_acquirer_pricing", sourceCode: subjectCode } }]);
    expect(conflict.categoryApplications).toEqual([]);
    expect(conflict.decisions.find((item) => item.query?.subjectCode === subjectCode)?.disposition)
      .toBe("unresolved_conflict");

    const privateEntry = { ...baseEntry, id: "private-category-map", visibility: "account_private" as const,
      tenantRef: "tenant-a", accountRef: "account-a",
      evidence: [{ ref: "private-reviewed-map", sourceAuthority: "approved_internal_manual_mapping" as const, private: true }] };
    const wrongBoundary = buildCanonicalRfClaimResolution({ inventory, economic, entries: [privateEntry],
      tenantRef: "tenant-b", accountRef: "account-b" });
    expect(wrongBoundary.categoryApplications).toEqual([]);
    expect(wrongBoundary.decisions.find((item) => item.query?.subjectCode === subjectCode)?.disposition)
      .toBe("unresolved_visibility_boundary");

    const malformed = resolve([{ ...baseEntry,
      value: { kind: "mapping", canonicalCode: "not_a_canonical_category", sourceCode: subjectCode } }]);
    expect(malformed.validation).toMatchObject({
      status: "valid",
      warnings: [expect.stringContaining("rf_category_value_rejected")],
    });
    expect(malformed.categoryApplications).toEqual([]);
    expect(malformed.decisions.find((item) => item.query?.subjectCode === subjectCode)?.disposition)
      .toBe("unresolved_policy_rejection");

    const secondOccurrence = pricing.foundation.sourceModel.occurrences.find((item) =>
      item.id === economic.economicLayer.charges[1]!.contributingOccurrenceRef,
    )!;
    const secondSubjectCode = categorySubjectCode(secondOccurrence.sourceLabel);
    const independentValidEntry = admittedKnowledge({
      ...baseEntry,
      id: "independent-valid-category-map",
      subjectCode: secondSubjectCode,
      value: { kind: "mapping", canonicalCode: "other_source_grounded_fee", sourceCode: secondSubjectCode },
    });
    const mixed = resolve([{ ...baseEntry,
      value: { kind: "mapping", canonicalCode: "not_a_canonical_category", sourceCode: subjectCode } }, independentValidEntry]);
    expect(mixed.validation.status).toBe("valid");
    expect(mixed.categoryApplications).toEqual([
      expect.objectContaining({
        chargeRef: economic.economicLayer.charges[1]!.id,
        value: expect.objectContaining({ kind: "mapping", canonicalCode: "other_source_grounded_fee" }),
      }),
    ]);
    expect(subjectCode).toMatch(/^economic_category_[a-f0-9]{32}$/);
    expect(subjectCode).not.toContain(occurrence.sourceLabel.toLowerCase().replace(/\s+/g, "_"));
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
