import { emptyFeeSemanticScope, type FeeSemanticAliasAssertion, type FeeSemanticEvidenceRecord } from "./feeSemanticsEvidenceModel.js";
import {
  QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION,
  createQualifiedFeeSemanticCatalog,
  feeSemanticClaimPacketFingerprint,
  type FeeSemanticAdmissionRecord,
  type FeeSemanticCatalogAuditEvent,
  type FeeSemanticSourceSnapshot,
} from "./qualifiedFeeSemanticsCatalog.js";
import { QUALIFIED_FEE_SEMANTICS_SEED_V1 } from "./feeSemanticsSeedCatalog.js";

export const FEE_SEMANTICS_FISERV_ALIAS_PACK_VERSION = "qualified_fee_semantics_fiserv_alias_pack_2026_09_06_v1" as const;
const REVIEWED_AT = "2026-09-06T00:00:00Z";
const REVIEW_DUE = "2027-03-06";
const REVIEWER_REF = "payments_domain_review_2026_09";
const CURATED_EVIDENCE_ID = "fiserv_corpus_high_value_alias_adjudication_2026";

const scope = (networkIds: string[] = []) => emptyFeeSemanticScope({
  geographies: ["us"],
  processorIds: ["fiserv_first_data"],
  networkIds,
});

const CURATED_EVIDENCE: FeeSemanticEvidenceRecord = {
  evidenceId: CURATED_EVIDENCE_ID,
  evidenceClass: "curated_industry_knowledge",
  sourceAuthority: "expert_curated",
  qualification: "qualified",
  title: "Fiserv-family high-value alias adjudication pack",
  publisher: "RateReveal payments-domain review",
  sourceUrl: null,
  sourceLocator: "Reviewed printed shorthand and spelling variants from the deduplicated Fiserv-family evaluation corpus",
  reviewedAt: REVIEWED_AT.slice(0, 10),
  scope: scope(),
  visibility: "reusable",
  limitations: [
    "The corpus establishes prioritization and printed usage, not fee identity by recurrence.",
    "Each admitted alias is also bound to qualified network or processor evidence for the underlying identity.",
    "Aliases are Fiserv/First Data presentation variants in the U.S. context; they do not establish a rate, merchant applicability, pass-through treatment, or pricing correctness.",
  ],
};

type AliasAddition = {
  conceptId: string;
  aliasId: string;
  alias: string;
  networkIds?: string[];
  evidenceRefs: string[];
};

const ALIAS_ADDITIONS: AliasAddition[] = [
  { conceptId: "network_assessment_fee", aliasId: "alias_fiserv_db_dues_and_assess", alias: "DB DUES AND ASSESS", networkIds: ["visa"], evidenceRefs: ["chase_payment_brand_fee_support_2026"] },
  { conceptId: "network_assessment_fee", aliasId: "alias_fiserv_cr_dues_and_assess", alias: "CR DUES AND ASSESS", networkIds: ["visa"], evidenceRefs: ["chase_payment_brand_fee_support_2026"] },
  { conceptId: "network_assessment_fee", aliasId: "alias_fiserv_discover_assessment_fee", alias: "DISCOVER ASSESSMENT FEE", networkIds: ["discover"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "network_assessment_fee", aliasId: "alias_fiserv_discover_dues_assessment_fee", alias: "DISCOVER DUES/ASSESSMENT FEE", networkIds: ["discover"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "network_assessment_fee", aliasId: "alias_fiserv_mastercard_assessment_fee", alias: "MASTERCARD ASSESSMENT FEE", networkIds: ["mastercard"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "network_assessment_fee", aliasId: "alias_fiserv_visa_assessment_fee_db", alias: "VISA ASSESSMENT FEE DB", networkIds: ["visa"], evidenceRefs: ["chase_payment_brand_fee_support_2026"] },
  { conceptId: "network_assessment_fee", aliasId: "alias_fiserv_visa_assessment_fee_cr", alias: "VISA ASSESSMENT FEE CR", networkIds: ["visa"], evidenceRefs: ["chase_payment_brand_fee_support_2026"] },
  { conceptId: "network_assessment_fee", aliasId: "alias_fiserv_amex_assessment_fee", alias: "AMEX ASSESSMENT FEE", networkIds: ["american_express"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "discover_network_authorization_fee", aliasId: "alias_fiserv_disc_network_auth_fee", alias: "DISC NETWORK AUTH FEE", networkIds: ["discover"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "discover_network_authorization_fee", aliasId: "alias_fiserv_discover_auth_fee", alias: "DISCOVER AUTH FEE", networkIds: ["discover"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "visa_misuse_of_authorization_system_fee", aliasId: "alias_fiserv_visa_misuse_of_auth_fee", alias: "VISA MISUSE OF AUTH FEE", networkIds: ["visa"], evidenceRefs: ["visa_authorization_reversal_requirements_2024"] },
  { conceptId: "authorization_service_fee", aliasId: "alias_fiserv_amex_auth_fee", alias: "AMEX AUTH FEE", networkIds: ["american_express"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "authorization_service_fee", aliasId: "alias_fiserv_visa_auth_fee", alias: "VISA AUTH FEE", networkIds: ["visa"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "authorization_service_fee", aliasId: "alias_fiserv_mastercard_auth_fee", alias: "MASTERCARD AUTH FEE", networkIds: ["mastercard"], evidenceRefs: ["shift4_statement_glossary_2026"] },
  { conceptId: "authorization_service_fee", aliasId: "alias_fiserv_amex_wats_auth_fee", alias: "AMEX WATS AUTH FEE", networkIds: ["american_express"], evidenceRefs: ["shift4_statement_glossary_2026"] },
];

const catalog = structuredClone(QUALIFIED_FEE_SEMANTICS_SEED_V1.catalog);
catalog.catalogVersion = FEE_SEMANTICS_FISERV_ALIAS_PACK_VERSION;
catalog.evidence.push(CURATED_EVIDENCE);
for (const addition of ALIAS_ADDITIONS) {
  const concept = catalog.concepts.find((item) => item.conceptId === addition.conceptId);
  if (!concept) throw new Error(`fee_semantics_alias_pack_concept_missing:${addition.conceptId}`);
  const aliasItem: FeeSemanticAliasAssertion = {
    aliasId: addition.aliasId,
    alias: addition.alias,
    status: "admitted",
    evidenceRefs: [...addition.evidenceRefs, CURATED_EVIDENCE_ID],
    scope: scope(addition.networkIds),
  };
  concept.aliases.push(aliasItem);
}

const sourceSnapshots: FeeSemanticSourceSnapshot[] = [
  ...QUALIFIED_FEE_SEMANTICS_SEED_V1.sourceSnapshots.map((item) => ({ ...structuredClone(item), catalogVersion: FEE_SEMANTICS_FISERV_ALIAS_PACK_VERSION })),
  {
    snapshotId: `snapshot_${CURATED_EVIDENCE_ID}`,
    evidenceRef: CURATED_EVIDENCE_ID,
    catalogVersion: FEE_SEMANTICS_FISERV_ALIAS_PACK_VERSION,
    lifecycle: "active",
    qualificationDecision: "qualified",
    fingerprintAlgorithm: "sha256",
    fingerprintScope: "qualified_claim_packet",
    fingerprint: feeSemanticClaimPacketFingerprint(CURATED_EVIDENCE),
    capturedAt: REVIEWED_AT,
    reviewedAt: REVIEWED_AT,
    reviewDueAt: REVIEW_DUE,
    reviewerRole: "payments_domain_reviewer",
    reviewerRef: REVIEWER_REF,
    supersedesSnapshotRefs: [],
    supersededBySnapshotRef: null,
  },
];

const admissions: FeeSemanticAdmissionRecord[] = [
  ...QUALIFIED_FEE_SEMANTICS_SEED_V1.admissions.map((item) => ({ ...structuredClone(item), catalogVersion: FEE_SEMANTICS_FISERV_ALIAS_PACK_VERSION })),
  ...ALIAS_ADDITIONS.map((item): FeeSemanticAdmissionRecord => ({
    admissionId: `admission_${item.aliasId}`,
    catalogVersion: FEE_SEMANTICS_FISERV_ALIAS_PACK_VERSION,
    subjectType: "alias",
    subjectRef: item.aliasId,
    lifecycle: "active",
    reviewerRole: "payments_domain_reviewer",
    reviewerRef: REVIEWER_REF,
    decidedAt: REVIEWED_AT,
    sourceSnapshotRefs: [...item.evidenceRefs, CURATED_EVIDENCE_ID].map((ref) => `snapshot_${ref}`),
    supersedesAdmissionRefs: [],
    supersededByAdmissionRef: null,
    reasonCodes: ["high_value_fiserv_alias_reviewed_against_qualified_fee_identity_evidence"],
  })),
];

const auditTrail: FeeSemanticCatalogAuditEvent[] = [
  ...structuredClone(QUALIFIED_FEE_SEMANTICS_SEED_V1.auditTrail),
  {
    auditEventId: `audit_snapshot_${CURATED_EVIDENCE_ID}`,
    policyVersion: QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION,
    eventType: "source_captured",
    subjectRef: CURATED_EVIDENCE_ID,
    admissionRef: null,
    sourceSnapshotRefs: [`snapshot_${CURATED_EVIDENCE_ID}`],
    occurredAt: REVIEWED_AT,
    reviewerRole: "payments_domain_reviewer",
    reviewerRef: REVIEWER_REF,
    reasonCodes: ["curated_alias_claim_packet_reviewed"],
  },
  ...ALIAS_ADDITIONS.map((item): FeeSemanticCatalogAuditEvent => ({
    auditEventId: `audit_admission_${item.aliasId}`,
    policyVersion: QUALIFIED_FEE_SEMANTICS_GOVERNANCE_POLICY_VERSION,
    eventType: "knowledge_admitted",
    subjectRef: item.aliasId,
    admissionRef: `admission_${item.aliasId}`,
    sourceSnapshotRefs: [...item.evidenceRefs, CURATED_EVIDENCE_ID].map((ref) => `snapshot_${ref}`),
    occurredAt: REVIEWED_AT,
    reviewerRole: "payments_domain_reviewer",
    reviewerRef: REVIEWER_REF,
    reasonCodes: ["high_value_scoped_alias_admitted"],
  })),
];

export const QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_PACK_V1 = createQualifiedFeeSemanticCatalog({
  schemaVersion: QUALIFIED_FEE_SEMANTICS_SEED_V1.schemaVersion,
  governancePolicyVersion: QUALIFIED_FEE_SEMANTICS_SEED_V1.governancePolicyVersion,
  catalog,
  sourceSnapshots,
  admissions,
  auditTrail,
});

export const QUALIFIED_FEE_SEMANTICS_FISERV_ALIAS_IDS_V1 = Object.freeze(ALIAS_ADDITIONS.map((item) => item.aliasId));
