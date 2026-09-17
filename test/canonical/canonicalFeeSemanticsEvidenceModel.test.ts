import { describe, expect, it } from "vitest";
import {
  FEE_SEMANTICS_EVIDENCE_MODEL_VERSION,
  emptyFeeSemanticScope,
  resolveFeeSemantics,
  retrieveFeeSemanticCandidates,
  validateFeeSemanticCatalog,
  type FeeSemanticAliasAssertion,
  type FeeSemanticAssertion,
  type FeeSemanticCatalog,
  type FeeSemanticConcept,
  type FeeSemanticEvidenceRecord,
  type FeeSemanticQuery,
  type FeeSemanticScope,
} from "../../src/canonical/feeSemanticsEvidenceModel.js";

const US_MC = emptyFeeSemanticScope({ geographies: ["us"], networkIds: ["mastercard"] });
const US_VISA = emptyFeeSemanticScope({ geographies: ["us"], networkIds: ["visa"] });
const EPI = emptyFeeSemanticScope({ geographies: ["us"], processorIds: ["electronic_payments"] });
const ACCOUNT = emptyFeeSemanticScope({
  geographies: ["us"],
  isoIds: ["example_iso"],
  merchantAccountIds: ["evaluation_account_7"],
});
const AP_DCF = emptyFeeSemanticScope({ effectiveFrom: "2025-07-01", effectiveTo: "2026-04-01", geographies: ["ap"], networkIds: ["visa"] });
const AP_DCSF = emptyFeeSemanticScope({ effectiveFrom: "2026-04-01", geographies: ["ap"], networkIds: ["visa"] });

const evidence = (
  evidenceId: string,
  overrides: Partial<FeeSemanticEvidenceRecord> = {},
): FeeSemanticEvidenceRecord => ({
  evidenceId,
  evidenceClass: "qualified_external_research",
  sourceAuthority: "processor_support_documentation",
  qualification: "qualified",
  title: "Reviewed payment-industry evidence",
  publisher: "Reviewed publisher",
  sourceUrl: "https://example.test/evidence",
  sourceLocator: "Reviewed fee definition",
  reviewedAt: "2026-09-05",
  scope: emptyFeeSemanticScope(),
  visibility: "reusable",
  limitations: [],
  ...overrides,
});

const alias = (
  aliasId: string,
  text: string,
  evidenceRefs: string[],
  scope: FeeSemanticScope = emptyFeeSemanticScope(),
  status: FeeSemanticAliasAssertion["status"] = "admitted",
): FeeSemanticAliasAssertion => ({ aliasId, alias: text, status, evidenceRefs, scope });

const assertion = (
  assertionId: string,
  axis: FeeSemanticAssertion["axis"],
  value: string,
  evidenceRefs: string[],
  scope: FeeSemanticScope = emptyFeeSemanticScope(),
  status: FeeSemanticAssertion["status"] = "admitted",
): FeeSemanticAssertion => ({ assertionId, axis, value, status, evidenceRefs, scope, limitations: [] });

const concept = (
  conceptId: string,
  displayName: string,
  kind: FeeSemanticConcept["kind"],
  aliases: FeeSemanticAliasAssertion[],
  assertions: FeeSemanticAssertion[],
  componentConceptIds: string[] = [],
): FeeSemanticConcept => ({ conceptId, displayName, kind, componentConceptIds, aliases, assertions });

const CATALOG: FeeSemanticCatalog = {
  modelVersion: FEE_SEMANTICS_EVIDENCE_MODEL_VERSION,
  catalogVersion: "fee_semantics_retrieval_falsification_pack_v1",
  evidence: [
    evidence("chase_nabu_support", {
      title: "Merchant statement support: payment brand fees",
      publisher: "Chase Payment Solutions",
      sourceUrl: "https://www.chase.com/business/support/payments/statements-and-fees",
      sourceLocator: "Mastercard fees: NABU (Network Access & Brand Usage)",
      scope: US_MC,
    }),
    evidence("epi_cpu_gateway_guide", {
      sourceAuthority: "processor_publication",
      title: "How to read a merchant processing statement",
      publisher: "Electronic Payments",
      sourceUrl: "https://staging.electronicpayments.com/blog/merchant-statements/",
      sourceLocator: "CPU GTWY is associated with an authorization requested via CPU-to-CPU line or gateway",
      scope: EPI,
    }),
    evidence("curated_gateway_and_authorization_taxonomy", {
      evidenceClass: "curated_industry_knowledge",
      sourceAuthority: "expert_curated",
      title: "Reviewed acquiring fee taxonomy",
      publisher: "RateReveal domain review",
      sourceUrl: null,
      sourceLocator: "Gateway, authorization, and verification concept boundaries",
    }),
    evidence("visa_tif_primary", {
      sourceAuthority: "official_network_publication",
      title: "Visa Partial Authorization Service",
      publisher: "Visa",
      sourceUrl: "https://bd.visa.com/dam/VCOM/global/support-legal/documents/visa-partial-authorization-service.pdf",
      sourceLocator: "Improper authorization data may lead to a Transaction Integrity Fee on impacted debit transactions",
      scope: US_VISA,
    }),
    evidence("first_financial_visa_fee_guide", {
      sourceAuthority: "processor_publication",
      title: "Miscellaneous interchange fees defined",
      publisher: "First Financial USA",
      sourceUrl: "https://cdn-sc.ffusa.com/ffusa/pdf/toolbox/interchange_fees.pdf",
      sourceLocator: "Visa ACQR Processor Fees apply to U.S.-based credit card authorizations acquired in the U.S.",
      scope: US_VISA,
    }),
    evidence("regulatory_product_statement_recurrence", {
      evidenceClass: "statement_local",
      sourceAuthority: "repeated_statement_observation",
      qualification: "candidate",
      title: "Repeated statement label observation",
      publisher: "Statement evidence",
      sourceUrl: null,
      sourceLocator: "REGULATORY PRODUCT recurs without a defining legend",
      reviewedAt: null,
    }),
    evidence("example_iso_private_schedule", {
      sourceAuthority: "merchant_agreement",
      title: "Merchant-specific ISO pricing schedule",
      publisher: "Example ISO",
      sourceUrl: null,
      sourceLocator: "RISK ASSURANCE PLAN definition for the governed merchant account",
      scope: ACCOUNT,
      visibility: "account_private",
    }),
    evidence("example_iso_bundle_schedule", {
      sourceAuthority: "merchant_agreement",
      title: "Merchant-specific combined fee schedule",
      publisher: "Example ISO",
      sourceUrl: null,
      sourceLocator: "AUTH & GATEWAY BUNDLE includes authorization and gateway service components",
      scope: ACCOUNT,
      visibility: "account_private",
    }),
    evidence("braintree_digital_commerce_fee_historical", {
      title: "2026 network fee updates",
      publisher: "Braintree",
      sourceUrl: "https://developer.paypal.com/braintree/articles/risk-and-security/compliance/network-updates/2026",
      sourceLocator: "AP Digital Commerce Fee historical name before April 2026 rename",
      scope: AP_DCF,
    }),
    evidence("braintree_digital_commerce_services_fee", {
      title: "2026 network fee updates",
      publisher: "Braintree",
      sourceUrl: "https://developer.paypal.com/braintree/articles/risk-and-security/compliance/network-updates/2026",
      sourceLocator: "AP renamed Digital Commerce Services Fee effective April 2026",
      scope: AP_DCSF,
    }),
    evidence("ai_mystery_fee_hypothesis", {
      evidenceClass: "ai_hypothesis",
      sourceAuthority: "ai_inference",
      qualification: "candidate",
      title: "AI investigation hypothesis",
      publisher: "AI investigator",
      sourceUrl: null,
      sourceLocator: "Possible network-access meaning; verification required",
      reviewedAt: null,
    }),
    evidence("conflicting_program_integrity_observation", {
      evidenceClass: "curated_industry_knowledge",
      sourceAuthority: "expert_curated",
      qualification: "conflicting",
      title: "Conflicting integrity-label interpretations",
      publisher: "RateReveal domain review",
      sourceUrl: null,
      sourceLocator: "PROGRAM INTEGRITY FEE lacks network and program disambiguation",
    }),
  ],
  concepts: [
    concept("gateway_service_fee", "Gateway service fee", "processor_neutral", [
      alias("alias_gateway_fee", "GATEWAY FEE", ["curated_gateway_and_authorization_taxonomy"]),
    ], [
      assertion("gateway_identity", "identity", "gateway_service_fee", ["curated_gateway_and_authorization_taxonomy"]),
    ]),
    concept("authorization_service_fee", "Authorization service fee", "processor_neutral", [
      alias("alias_network_authorization", "NETWORK AUTHORIZATION FEE", ["curated_gateway_and_authorization_taxonomy"]),
    ], [
      assertion("authorization_identity", "identity", "authorization_service_fee", ["curated_gateway_and_authorization_taxonomy"]),
      assertion("authorization_unit", "assessment_unit", "authorization_event", ["curated_gateway_and_authorization_taxonomy"]),
    ]),
    concept("address_verification_service_fee", "Address verification service fee", "processor_neutral", [
      alias("alias_addr_verification", "ADDR VERIFICATION SRV FEE", ["curated_gateway_and_authorization_taxonomy"]),
    ], [
      assertion("verification_identity", "identity", "address_verification_service_fee", ["curated_gateway_and_authorization_taxonomy"]),
      assertion("verification_unit", "assessment_unit", "verification_event", ["curated_gateway_and_authorization_taxonomy"]),
    ]),
    concept("mastercard_network_access_brand_usage", "Mastercard Network Access and Brand Usage", "network_specific", [
      alias("alias_nabu_fees", "NABU FEES", ["chase_nabu_support"], US_MC),
      alias("alias_mc_nabu_auth", "MC NABU AUTH", ["chase_nabu_support"], US_MC),
    ], [
      assertion("nabu_identity", "identity", "mastercard_network_access_brand_usage", ["chase_nabu_support"], US_MC),
      assertion("nabu_unit", "assessment_unit", "domestic_authorization_or_refund_record", ["chase_nabu_support"], US_MC),
      assertion("nabu_owner", "ownership", "mastercard_network", ["chase_nabu_support"], US_MC),
      assertion("nabu_applicability", "applicability", "us_domestic_authorizations_and_refunds", ["chase_nabu_support"], US_MC),
    ]),
    concept("electronic_payments_cpu_gateway_authorization", "Electronic Payments CPU/gateway authorization fee", "processor_specific", [
      alias("alias_cpu_gtwy", "CPU GTWY", ["epi_cpu_gateway_guide"], EPI),
    ], [
      assertion("cpu_identity", "identity", "electronic_payments_cpu_gateway_authorization", ["epi_cpu_gateway_guide"], EPI),
      assertion("cpu_unit", "assessment_unit", "authorization_request", ["epi_cpu_gateway_guide"], EPI),
    ]),
    concept("visa_acquirer_processing_fee", "Visa Acquirer Processing Fee", "network_specific", [
      alias("alias_acqr_processor_fees", "ACQR PROCESSOR FEES", ["first_financial_visa_fee_guide"], US_VISA),
    ], [
      assertion("apf_identity", "identity", "visa_acquirer_processing_fee", ["first_financial_visa_fee_guide"], US_VISA),
      assertion("apf_unit", "assessment_unit", "authorization_event", ["first_financial_visa_fee_guide"], US_VISA),
      assertion("apf_owner", "ownership", "visa_network", ["first_financial_visa_fee_guide"], US_VISA),
      assertion("apf_applicability", "applicability", "us_acquired_credit_authorizations", ["first_financial_visa_fee_guide"], US_VISA),
    ]),
    concept("visa_transaction_integrity_fee", "Visa Transaction Integrity Fee", "network_specific", [
      alias("alias_vi_transaction_integrity", "VI TRANSACTION INTEGRITY FEE", ["visa_tif_primary"], US_VISA),
      alias("alias_transaction_integrity", "TRAN INTEGRITY FEE", ["visa_tif_primary"], US_VISA),
    ], [
      assertion("tif_identity", "identity", "visa_transaction_integrity_fee", ["visa_tif_primary"], US_VISA),
      assertion("tif_unit", "assessment_unit", "impacted_debit_transaction", ["visa_tif_primary"], US_VISA),
      assertion("tif_owner", "ownership", "visa_network", ["visa_tif_primary"], US_VISA),
      assertion("tif_applicability", "applicability", "debit_transaction_integrity_condition", ["visa_tif_primary"], US_VISA),
    ]),
    concept("unresolved_regulatory_product", "Unresolved regulatory product label", "proprietary", [
      alias("alias_regulatory_product", "REGULATORY PRODUCT", ["regulatory_product_statement_recurrence"], emptyFeeSemanticScope(), "candidate"),
    ], [
      assertion("regulatory_product_identity_candidate", "identity", "unresolved_regulatory_product", ["regulatory_product_statement_recurrence"], emptyFeeSemanticScope(), "candidate"),
    ]),
    concept("example_iso_risk_assurance", "Example ISO Risk Assurance Plan", "iso_specific", [
      alias("alias_risk_assurance_plan", "RISK ASSURANCE PLAN", ["example_iso_private_schedule"], ACCOUNT),
    ], [
      assertion("risk_plan_identity", "identity", "example_iso_risk_assurance", ["example_iso_private_schedule"], ACCOUNT),
      assertion("risk_plan_owner", "ownership", "example_iso", ["example_iso_private_schedule"], ACCOUNT),
    ]),
    concept("example_iso_auth_gateway_bundle", "Example ISO authorization and gateway bundle", "combined", [
      alias("alias_auth_gateway_bundle", "AUTH & GATEWAY BUNDLE", ["example_iso_bundle_schedule"], ACCOUNT),
    ], [
      assertion("bundle_identity", "identity", "example_iso_auth_gateway_bundle", ["example_iso_bundle_schedule"], ACCOUNT),
      assertion("bundle_owner", "ownership", "example_iso", ["example_iso_bundle_schedule"], ACCOUNT),
    ], ["authorization_service_fee", "gateway_service_fee"]),
    concept("visa_digital_commerce_services_fee", "Visa Digital Commerce Services Fee", "network_specific", [
      alias("alias_digital_commerce_fee_historical", "DIGITAL COMMERCE FEE", ["braintree_digital_commerce_fee_historical"], AP_DCF),
      alias("alias_digital_commerce_services_fee", "DIGITAL COMMERCE SERVICES FEE", ["braintree_digital_commerce_services_fee"], AP_DCSF),
    ], [
      assertion("dcsf_identity_historical", "identity", "visa_digital_commerce_services_fee", ["braintree_digital_commerce_fee_historical"], AP_DCF),
      assertion("dcsf_identity_current", "identity", "visa_digital_commerce_services_fee", ["braintree_digital_commerce_services_fee"], AP_DCSF),
      assertion("dcsf_owner_current", "ownership", "visa_network", ["braintree_digital_commerce_services_fee"], AP_DCSF),
      assertion("dcsf_applicability_current", "applicability", "ap_digital_commerce_services_bundle", ["braintree_digital_commerce_services_fee"], AP_DCSF),
    ]),
    concept("ai_suspected_network_access_fee", "AI-suspected network access fee", "processor_neutral", [
      alias("alias_ai_mystery_network_access", "MYSTERY NETWORK ACCESS", ["ai_mystery_fee_hypothesis"], emptyFeeSemanticScope(), "candidate"),
    ], [
      assertion("ai_network_access_identity", "identity", "ai_suspected_network_access_fee", ["ai_mystery_fee_hypothesis"], emptyFeeSemanticScope(), "candidate"),
    ]),
    concept("unresolved_program_integrity_fee", "Unresolved program integrity fee", "proprietary", [
      alias("alias_program_integrity_conflict", "PROGRAM INTEGRITY FEE", ["conflicting_program_integrity_observation"], emptyFeeSemanticScope(), "conflicting"),
    ], [
      assertion("program_integrity_identity_conflict", "identity", "unresolved_program_integrity_fee", ["conflicting_program_integrity_observation"], emptyFeeSemanticScope(), "conflicting"),
    ]),
  ],
};

const query = (label: string, overrides: Partial<FeeSemanticQuery> = {}): FeeSemanticQuery => ({
  statementRef: "evaluation_statement_a",
  label,
  asOf: "2026-01-31",
  geography: "us",
  processorId: null,
  isoId: null,
  networkId: null,
  merchantAccountId: null,
  statementLocalMeaning: "unknown",
  ...overrides,
});

describe("Fee Semantics Evidence Model & Retrieval Falsification Pack v1", () => {
  it("validates the deliberately varied evaluation catalog", () => {
    expect(validateFeeSemanticCatalog(CATALOG)).toEqual([]);
    expect(CATALOG.concepts.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "processor_neutral", "network_specific", "processor_specific", "iso_specific", "proprietary", "combined",
    ]));
  });

  it("rejects AI-only admission, reusable private evidence, and malformed combined concepts", () => {
    const aiAdmitted = structuredClone(CATALOG);
    aiAdmitted.concepts.find((item) => item.conceptId === "ai_suspected_network_access_fee")!.aliases[0]!.status = "admitted";
    expect(validateFeeSemanticCatalog(aiAdmitted)).toContain("fee_semantics_alias_admitted_without_qualified_evidence:alias_ai_mystery_network_access");

    const leakedAgreement = structuredClone(CATALOG);
    leakedAgreement.evidence.find((item) => item.evidenceId === "example_iso_private_schedule")!.visibility = "reusable";
    expect(validateFeeSemanticCatalog(leakedAgreement)).toContain("fee_semantics_private_evidence_marked_reusable:example_iso_private_schedule");

    const malformedBundle = structuredClone(CATALOG);
    malformedBundle.concepts.find((item) => item.conceptId === "example_iso_auth_gateway_bundle")!.componentConceptIds = ["authorization_service_fee"];
    expect(validateFeeSemanticCatalog(malformedBundle)).toContain("fee_semantics_combined_components_incomplete:example_iso_auth_gateway_bundle");
  });

  it("resolves a statement-local unknown NABU acronym from scoped qualified knowledge without proving price", () => {
    const result = resolveFeeSemantics(CATALOG, query("NABU FEES", { networkId: "mastercard" }));
    expect(result).toMatchObject({
      status: "resolved_from_qualified_knowledge",
      conceptId: "mastercard_network_access_brand_usage",
      conceptKind: "network_specific",
      statementLocalMeaning: "unknown",
      researchRequired: false,
    });
    expect(result.axes.identity.value).toBe("mastercard_network_access_brand_usage");
    expect(result.axes.assessment_unit.value).toBe("domestic_authorization_or_refund_record");
    expect(result.axes.ownership.value).toBe("mastercard_network");
    expect(result.axes.applicability.status).toBe("resolved");
    expect(result.axes.pricing_correctness).toMatchObject({ status: "unresolved", value: null });
  });

  it("keeps processor-neutral identity separate from unit, owner, applicability, and pricing", () => {
    const gateway = resolveFeeSemantics(CATALOG, query("GATEWAY FEE"));
    expect(gateway).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptId: "gateway_service_fee", conceptKind: "processor_neutral" });
    expect(gateway.axes.identity.status).toBe("resolved");
    for (const axis of ["assessment_unit", "ownership", "applicability", "pricing_correctness"] as const) {
      expect(gateway.axes[axis]).toMatchObject({ status: "unresolved", value: null });
    }
  });

  it("resolves processor and network terminology only inside applicable context", () => {
    const cpuApplicable = resolveFeeSemantics(CATALOG, query("CPU GTWY", { processorId: "electronic_payments" }));
    const cpuWrongProcessor = resolveFeeSemantics(CATALOG, query("CPU GTWY", { processorId: "fiserv" }));
    const acquirerProcessor = resolveFeeSemantics(CATALOG, query("ACQR PROCESSOR FEES", { networkId: "visa" }));
    const integrity = resolveFeeSemantics(CATALOG, query("TRAN INTEGRITY FEE", { networkId: "visa" }));
    expect(cpuApplicable).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptKind: "processor_specific" });
    expect(cpuApplicable.axes.assessment_unit.value).toBe("authorization_request");
    expect(cpuWrongProcessor).toMatchObject({ status: "unresolved_scope_or_period", conceptId: null });
    expect(acquirerProcessor).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptId: "visa_acquirer_processing_fee" });
    expect(integrity).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptId: "visa_transaction_integrity_fee" });
    expect(acquirerProcessor.axes.pricing_correctness.status).toBe("unresolved");
    expect(integrity.axes.pricing_correctness.status).toBe("unresolved");
  });

  it("supports authorization and verification concepts without inventing ownership or pricing", () => {
    const authorization = resolveFeeSemantics(CATALOG, query("NETWORK AUTHORIZATION FEE"));
    const verification = resolveFeeSemantics(CATALOG, query("ADDR VERIFICATION SRV FEE"));
    expect(authorization).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptId: "authorization_service_fee" });
    expect(verification).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptId: "address_verification_service_fee" });
    expect(authorization.axes.assessment_unit.value).toBe("authorization_event");
    expect(verification.axes.assessment_unit.value).toBe("verification_event");
    expect(authorization.axes.ownership.status).toBe("unresolved");
    expect(verification.axes.pricing_correctness.status).toBe("unresolved");
  });

  it("retrieves misleading or misspelled near-matches but never accepts similarity as identity", () => {
    const misleading = resolveFeeSemantics(CATALOG, query("NABU COMPLIANCE FEES", { networkId: "mastercard" }));
    const misspelled = resolveFeeSemantics(CATALOG, query("ACQR PROCESSR FEES", { networkId: "visa" }));
    expect(misleading.status).toBe("candidate_only");
    expect(misleading.conceptId).toBeNull();
    expect(misleading.candidates[0]).toMatchObject({
      conceptId: "mastercard_network_access_brand_usage",
      acceptanceEligible: false,
    });
    expect(misspelled.status).toBe("candidate_only");
    expect(misspelled.candidates.some((item) => item.conceptId === "visa_acquirer_processing_fee")).toBe(true);
    expect(misspelled.candidates.every((item) => item.retrievalBasis !== "exact_alias" || !item.acceptanceEligible)).toBe(true);
    expect(retrieveFeeSemanticCandidates(CATALOG, query("NABX", { networkId: "mastercard" }))).toEqual([]);
  });

  it("does not allow AI hypotheses or repeated statement labels to verify meaning", () => {
    const ai = resolveFeeSemantics(CATALOG, query("MYSTERY NETWORK ACCESS"));
    const proprietary = resolveFeeSemantics(CATALOG, query("REGULATORY PRODUCT"));
    expect(ai).toMatchObject({ status: "candidate_only", conceptId: null, researchRequired: true });
    expect(proprietary).toMatchObject({ status: "candidate_only", conceptId: null, researchRequired: true });
    expect(ai.candidates[0]!.qualifiedEvidenceRefs).toEqual([]);
    expect(proprietary.candidates[0]!.qualifiedEvidenceRefs).toEqual([]);
  });

  it("handles proprietary and combined fees within private agreement scope and nowhere else", () => {
    const applicable = { isoId: "example_iso", merchantAccountId: "evaluation_account_7" };
    const proprietary = resolveFeeSemantics(CATALOG, query("RISK ASSURANCE PLAN", applicable));
    const bundle = resolveFeeSemantics(CATALOG, query("AUTH & GATEWAY BUNDLE", applicable));
    const otherAccount = resolveFeeSemantics(CATALOG, query("AUTH & GATEWAY BUNDLE", { ...applicable, merchantAccountId: "other_account" }));
    expect(proprietary).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptKind: "iso_specific" });
    expect(bundle).toMatchObject({
      status: "resolved_from_qualified_knowledge",
      conceptKind: "combined",
      componentConceptIds: ["authorization_service_fee", "gateway_service_fee"],
    });
    expect(bundle.axes.pricing_correctness.status).toBe("unresolved");
    expect(otherAccount).toMatchObject({ status: "unresolved_scope_or_period", conceptId: null });
  });

  it("applies a historical rename only during the evidence period", () => {
    const historical = resolveFeeSemantics(CATALOG, query("DIGITAL COMMERCE FEE", { asOf: "2025-09-30", geography: "ap", networkId: "visa" }));
    const expiredName = resolveFeeSemantics(CATALOG, query("DIGITAL COMMERCE FEE", { asOf: "2026-04-30", geography: "ap", networkId: "visa" }));
    const currentName = resolveFeeSemantics(CATALOG, query("DIGITAL COMMERCE SERVICES FEE", { asOf: "2026-04-30", geography: "ap", networkId: "visa" }));
    expect(historical).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptId: "visa_digital_commerce_services_fee" });
    expect(expiredName).toMatchObject({ status: "unresolved_scope_or_period", conceptId: null });
    expect(currentName).toMatchObject({ status: "resolved_from_qualified_knowledge", conceptId: "visa_digital_commerce_services_fee" });
  });

  it("reuses the same admitted knowledge on another applicable statement without research", () => {
    const first = resolveFeeSemantics(CATALOG, query("NABU FEES", { statementRef: "statement_a", networkId: "mastercard" }));
    const second = resolveFeeSemantics(CATALOG, query("MC NABU AUTH", { statementRef: "statement_b", networkId: "mastercard" }));
    expect(first.status).toBe("resolved_from_qualified_knowledge");
    expect(second.status).toBe("resolved_from_qualified_knowledge");
    expect(second.qualifiedKnowledgeRefs).toEqual(first.qualifiedKnowledgeRefs);
    expect(first.researchRequired).toBe(false);
    expect(second.researchRequired).toBe(false);
  });

  it("preserves conflicting exact evidence as unresolved", () => {
    const result = resolveFeeSemantics(CATALOG, query("PROGRAM INTEGRITY FEE"));
    expect(result).toMatchObject({ status: "unresolved_conflict", conceptId: null, researchRequired: true });
    expect(result.axes.identity.status).toBe("unresolved");
  });

  it("keeps candidate retrieval a read-only operation", () => {
    const before = JSON.stringify(CATALOG);
    const candidates = retrieveFeeSemanticCandidates(CATALOG, query("NABU COMPLIANCE FEES", { networkId: "mastercard" }));
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((item) => item.acceptanceEligible === false)).toBe(true);
    expect(JSON.stringify(CATALOG)).toBe(before);
  });
});
