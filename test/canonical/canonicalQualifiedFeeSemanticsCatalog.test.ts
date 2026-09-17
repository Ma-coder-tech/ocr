import { describe, expect, it } from "vitest";
import type { FeeSemanticQuery } from "../../src/canonical/feeSemanticsEvidenceModel.js";
import { QUALIFIED_FEE_SEMANTICS_SEED_V1 } from "../../src/canonical/feeSemanticsSeedCatalog.js";
import {
  resolveQualifiedFeeSemanticsCatalog,
  validateQualifiedFeeSemanticCatalog,
  type QualifiedFeeSemanticCatalog,
} from "../../src/canonical/qualifiedFeeSemanticsCatalog.js";

const query = (label: string, overrides: Partial<FeeSemanticQuery> = {}): FeeSemanticQuery => ({
  statementRef: "seed_evaluation_statement_a",
  label,
  asOf: "2026-01-31",
  geography: "us",
  processorId: "fiserv_first_data",
  isoId: null,
  networkId: null,
  merchantAccountId: null,
  statementLocalMeaning: "unknown",
  ...overrides,
});

const resolve = (label: string, overrides: Partial<FeeSemanticQuery> = {}) =>
  resolveQualifiedFeeSemanticsCatalog(QUALIFIED_FEE_SEMANTICS_SEED_V1, query(label, overrides));

describe("Qualified Fee Semantics Catalog Admission & Seed Pack v1", () => {
  it("admits a bounded, versioned, immutable 20-concept seed with complete governance records", () => {
    const seed = QUALIFIED_FEE_SEMANTICS_SEED_V1;
    expect(validateQualifiedFeeSemanticCatalog(seed)).toEqual([]);
    expect(seed.catalog.concepts).toHaveLength(20);
    expect(seed.catalog.evidence).toHaveLength(13);
    expect(seed.sourceSnapshots).toHaveLength(13);
    expect(seed.admissions.filter((item) => item.subjectType === "concept" && item.lifecycle === "active")).toHaveLength(19);
    expect(seed.auditTrail.length).toBe(seed.sourceSnapshots.length + seed.admissions.length);
    expect(Object.isFrozen(seed)).toBe(true);
    expect(Object.isFrozen(seed.catalog.concepts)).toBe(true);
  });

  it("resolves high-value network aliases while leaving pricing correctness unresolved", () => {
    const cases = [
      ["NABU FEES", "mastercard", "mastercard_network_access_brand_usage"],
      ["MC NABU AUTH", "mastercard", "mastercard_network_access_brand_usage"],
      ["ACQR PROCESSOR FEES", "visa", "visa_acquirer_processing_fee"],
      ["NAPF", "visa", "visa_acquirer_processing_fee"],
      ["VI TRANSACTION INTEGRITY FEE", "visa", "visa_transaction_integrity_fee"],
      ["MISUSE AUTH FEES", "visa", "visa_misuse_of_authorization_system_fee"],
      ["UNMATCHED CLEARING FEE", "visa", "visa_unmatched_clearing_fee"],
      ["ZERO FLOOR FEES", "visa", "visa_zero_floor_limit_fee"],
      ["DSCV DATA USAGE FEE", "discover", "discover_data_usage_fee"],
      ["DSCV AUTH FEE", "discover", "discover_network_authorization_fee"],
      ["AM PGRM CONT FEE", "american_express", "american_express_program_continuation_fee"],
    ] as const;
    for (const [label, networkId, conceptId] of cases) {
      const result = resolve(label, { networkId });
      expect(result.governanceStatus).toBe("valid");
      expect(result.resolution).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptId, researchRequired: false });
      expect(result.resolution.axes.pricing_correctness).toMatchObject({ status: "unresolved", value: null });
      expect(result.admissionRefs.length).toBeGreaterThan(0);
      expect(result.sourceSnapshotRefs.length).toBeGreaterThan(0);
    }
  });

  it("admits only the supported parts of broad processor-neutral concepts", () => {
    const interchange = resolve("INTERCHANGE");
    const assessment = resolve("DUES & ASSESSMENTS");
    const authorization = resolve("AUTHORIZATION FEE");
    const avs = resolve("ADDR VERIFICATION SRV FEE");
    expect(interchange.resolution.axes.ownership.value).toBe("issuer_interchange_system");
    expect(assessment.resolution.axes.assessment_unit.value).toBe("gross_transaction_amount");
    expect(authorization.resolution.axes.assessment_unit.value).toBe("authorization_event");
    expect(authorization.resolution.axes.ownership.status).toBe("unresolved");
    expect(avs.resolution.axes.assessment_unit.value).toBe("address_verification_event");
    expect(avs.resolution.axes.ownership.status).toBe("unresolved");
    expect([interchange, assessment, authorization, avs].every((item) => item.resolution.axes.pricing_correctness.status === "unresolved")).toBe(true);
  });

  it("keeps CPU GTWY processor-scoped instead of borrowing another processor's definition", () => {
    const documentedProcessor = resolve("CPU GTWY", { processorId: "electronic_payments" });
    const fiserv = resolve("CPU GTWY", { processorId: "fiserv_first_data" });
    expect(documentedProcessor.resolution).toMatchObject({
      status: "resolved_from_qualified_knowledge",
      conceptId: "electronic_payments_cpu_gateway_authorization",
    });
    expect(fiserv.resolution).toMatchObject({ status: "candidate_only", conceptId: null, researchRequired: true });
    expect(fiserv.resolution.candidates.some((item) => item.aliasId === "candidate_fiserv_cpu_gtwy" && item.acceptanceEligible === false)).toBe(true);
  });

  it("classifies PROGRAM INTEGRITY FEE as a context-dependent candidate, not a universal identity", () => {
    const noNetwork = resolve("PROGRAM INTEGRITY FEE", { networkId: null });
    const visa = resolve("PROGRAM INTEGRITY FEE", { networkId: "visa" });
    const mastercard = resolve("PROGRAM INTEGRITY FEE", { networkId: "mastercard" });
    expect(noNetwork.resolution).toMatchObject({ status: "unresolved_scope_or_period", conceptId: null });
    expect(visa.resolution).toMatchObject({ status: "candidate_only", conceptId: null });
    expect(mastercard.resolution).toMatchObject({ status: "candidate_only", conceptId: null });
    expect(visa.resolution.candidates.some((item) => item.conceptId === "visa_processing_integrity_fee_family" && item.acceptanceEligible === false)).toBe(true);
    expect(mastercard.resolution.candidates.some((item) => item.conceptId === "mastercard_processing_integrity_fee_family" && item.acceptanceEligible === false)).toBe(true);
    expect(QUALIFIED_FEE_SEMANTICS_SEED_V1.admissions.filter((item) => item.subjectRef.includes("candidate_program_integrity_fee")))
      .toSatisfy((items: typeof QUALIFIED_FEE_SEMANTICS_SEED_V1.admissions) => items.length === 2 && items.every((item) => item.lifecycle === "rejected"));
  });

  it("admits the documented Visa processing-integrity family and specific members without conflating them", () => {
    const usFamily = resolve("VISA PROCESSING INTEGRITY FEES", { networkId: "visa" });
    const euFamily = resolve("PROCESSING INTEGRITY PROGRAM FEES", { asOf: "2024-01-31", geography: "europe", networkId: "visa" });
    const tooEarly = resolve("PROCESSING INTEGRITY PROGRAM FEES", { asOf: "2023-06-30", geography: "europe", networkId: "visa" });
    const misuse = resolve("MISUSE OF AUTHORIZATION SYSTEM FEE", { networkId: "visa" });
    expect(usFamily.resolution.conceptId).toBe("visa_processing_integrity_fee_family");
    expect(euFamily.resolution.conceptId).toBe("visa_processing_integrity_fee_family");
    expect(tooEarly.resolution.status).toBe("unresolved_scope_or_period");
    expect(misuse.resolution.conceptId).toBe("visa_misuse_of_authorization_system_fee");
    expect(usFamily.resolution.conceptId).not.toBe(misuse.resolution.conceptId);
  });

  it("retains historical terminology only for its effective period and records supersession", () => {
    const historical = resolve("DIGITAL COMMERCE FEE", { asOf: "2025-09-30", geography: "ap", networkId: "visa" });
    const expired = resolve("DIGITAL COMMERCE FEE", { asOf: "2026-04-30", geography: "ap", networkId: "visa" });
    const current = resolve("DCSF", { asOf: "2026-04-30", geography: "ap", networkId: "visa" });
    expect(historical.resolution.conceptId).toBe("visa_digital_commerce_services_fee");
    expect(expired.resolution.status).toBe("unresolved_scope_or_period");
    expect(current.resolution.conceptId).toBe("visa_digital_commerce_services_fee");
    const oldSnapshot = QUALIFIED_FEE_SEMANTICS_SEED_V1.sourceSnapshots.find((item) => item.evidenceRef === "braintree_ap_digital_commerce_fee_2025")!;
    const nextSnapshot = QUALIFIED_FEE_SEMANTICS_SEED_V1.sourceSnapshots.find((item) => item.evidenceRef === "braintree_ap_digital_commerce_services_fee_2026")!;
    expect(oldSnapshot).toMatchObject({ lifecycle: "superseded", supersededBySnapshotRef: nextSnapshot.snapshotId });
    expect(nextSnapshot.supersedesSnapshotRefs).toEqual([oldSnapshot.snapshotId]);
  });

  it("reuses the same qualified catalog on another applicable statement", () => {
    const first = resolve("NABU FEES", { statementRef: "statement_a", networkId: "mastercard" });
    const second = resolve("MC NABU AUTH", { statementRef: "statement_b", networkId: "mastercard" });
    expect(first.resolution.researchRequired).toBe(false);
    expect(second.resolution.researchRequired).toBe(false);
    expect(second.resolution.conceptId).toBe(first.resolution.conceptId);
    expect(second.sourceSnapshotRefs).toEqual(first.sourceSnapshotRefs);
  });

  it("uses similarity only for retrieval and leaves misspellings unadmitted", () => {
    const typo = resolve("ACQR PROCESSR FEES", { networkId: "visa" });
    const misleading = resolve("NABU COMPLIANCE FEES", { networkId: "mastercard" });
    expect(typo.resolution.status).toBe("candidate_only");
    expect(misleading.resolution.status).toBe("candidate_only");
    expect(typo.resolution.candidates.some((item) => item.conceptId === "visa_acquirer_processing_fee")).toBe(true);
    expect([...typo.resolution.candidates, ...misleading.resolution.candidates].every((item) => item.acceptanceEligible === false)).toBe(true);
  });

  it("keeps repeated labels and AI hypotheses outside the admitted catalog", () => {
    const regulatoryProduct = resolve("REGULATORY PRODUCT");
    expect(regulatoryProduct.resolution).toMatchObject({ status: "candidate_only", conceptId: null, researchRequired: true });
    const aiSnapshot = QUALIFIED_FEE_SEMANTICS_SEED_V1.sourceSnapshots.find((item) => item.evidenceRef === "ai_program_integrity_research_hypothesis")!;
    expect(aiSnapshot).toMatchObject({ qualificationDecision: "candidate", reviewerRole: null });
    expect(QUALIFIED_FEE_SEMANTICS_SEED_V1.admissions.some((item) =>
      item.lifecycle === "active" && item.sourceSnapshotRefs.includes(aiSnapshot.snapshotId)
    )).toBe(false);
  });

  it("fails closed when fingerprints, admission records, audit history, or privacy boundaries are damaged", () => {
    const badFingerprint = structuredClone(QUALIFIED_FEE_SEMANTICS_SEED_V1) as QualifiedFeeSemanticCatalog;
    badFingerprint.sourceSnapshots[0]!.fingerprint = "0".repeat(64);
    expect(validateQualifiedFeeSemanticCatalog(badFingerprint).some((code) => code.includes("fingerprint_mismatch"))).toBe(true);
    expect(resolveQualifiedFeeSemanticsCatalog(badFingerprint, query("NABU FEES", { networkId: "mastercard" })).governanceStatus).toBe("invalid");

    const missingAdmission = structuredClone(QUALIFIED_FEE_SEMANTICS_SEED_V1) as QualifiedFeeSemanticCatalog;
    missingAdmission.admissions = missingAdmission.admissions.filter((item) => item.subjectRef !== "alias_nabu_fees");
    missingAdmission.auditTrail = missingAdmission.auditTrail.filter((item) => item.admissionRef !== "admission_alias_nabu_fees");
    expect(validateQualifiedFeeSemanticCatalog(missingAdmission)).toContain("qualified_fee_semantics_subject_admission_missing:alias_nabu_fees");

    const missingAudit = structuredClone(QUALIFIED_FEE_SEMANTICS_SEED_V1) as QualifiedFeeSemanticCatalog;
    missingAudit.auditTrail = missingAudit.auditTrail.filter((item) => item.admissionRef !== "admission_alias_nabu_fees");
    expect(validateQualifiedFeeSemanticCatalog(missingAudit)).toContain("qualified_fee_semantics_admission_audit_missing:admission_alias_nabu_fees");

    const unrelatedSource = structuredClone(QUALIFIED_FEE_SEMANTICS_SEED_V1) as QualifiedFeeSemanticCatalog;
    unrelatedSource.admissions.find((item) => item.subjectRef === "alias_nabu_fees")!.sourceSnapshotRefs = ["snapshot_visa_authorization_reversal_requirements_2024"];
    expect(validateQualifiedFeeSemanticCatalog(unrelatedSource)).toContain("qualified_fee_semantics_admission_source_not_bound_to_subject:admission_alias_nabu_fees");

    const privateLeak = structuredClone(QUALIFIED_FEE_SEMANTICS_SEED_V1) as QualifiedFeeSemanticCatalog;
    const source = privateLeak.catalog.evidence[0]!;
    source.sourceAuthority = "merchant_agreement";
    source.scope.merchantAccountIds = ["private_account"];
    expect(validateQualifiedFeeSemanticCatalog(privateLeak)).toContain(`fee_semantics_private_evidence_marked_reusable:${source.evidenceId}`);
  });

  it("rejects an attempted AI-assisted promotion even when an exact label looks plausible", () => {
    const promoted = structuredClone(QUALIFIED_FEE_SEMANTICS_SEED_V1) as QualifiedFeeSemanticCatalog;
    const concept = promoted.catalog.concepts.find((item) => item.conceptId === "visa_processing_integrity_fee_family")!;
    concept.aliases.find((item) => item.aliasId === "candidate_program_integrity_fee_visa")!.status = "admitted";
    promoted.admissions.find((item) => item.subjectRef === "candidate_program_integrity_fee_visa")!.lifecycle = "active";
    const errors = validateQualifiedFeeSemanticCatalog(promoted);
    expect(errors).toContain("qualified_fee_semantics_weak_source_admitted:admission_candidate_program_integrity_fee_visa");
  });
});
