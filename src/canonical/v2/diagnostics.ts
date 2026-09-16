import type { CanonicalEconomicsV2Foundation } from "./types.js";

export type PrivacySafeCanonicalEconomicsV2Diagnostic = {
  policyVersion: "canonical_economics_v2_privacy_safe_diagnostic_v1";
  schemaVersion: CanonicalEconomicsV2Foundation["versionManifest"]["schemaVersion"];
  authority: "shadow_non_authoritative";
  provenanceStatus: CanonicalEconomicsV2Foundation["identity"]["provenanceStatus"];
  templateAdmissionStatus: CanonicalEconomicsV2Foundation["templateCapability"]["admissionStatus"];
  templateCompletenessStatus: CanonicalEconomicsV2Foundation["templateCapability"]["completenessStatus"];
  suppliedDocumentIntegrityStatus: CanonicalEconomicsV2Foundation["documentIntegrity"]["suppliedDocumentStatus"];
  statementCompletenessStatus: CanonicalEconomicsV2Foundation["documentIntegrity"]["completenessStatus"];
  validationStatus: "valid" | "invalid";
  factStatusCounts: Record<"available" | "unavailable" | "ambiguous" | "unsupported", number>;
  effectiveRateState: CanonicalEconomicsV2Foundation["metrics"]["headlineEffectiveRate"]["state"];
  averageTicketState: CanonicalEconomicsV2Foundation["metrics"]["headlineAverageTicket"]["state"];
  sectionCount: number;
  occurrenceCount: number;
  representationGroupCount: number;
  reconciliationStatusCounts: Record<string, number>;
  semanticAmendmentIds: string[];
  containsFinancialValues: false;
  containsSourceText: false;
  containsMerchantIdentity: false;
};

export function privacySafeCanonicalEconomicsV2Diagnostic(
  foundation: CanonicalEconomicsV2Foundation,
): PrivacySafeCanonicalEconomicsV2Diagnostic {
  const factStatusCounts = { available: 0, unavailable: 0, ambiguous: 0, unsupported: 0 };
  for (const fact of Object.values(foundation.financialPopulations)) factStatusCounts[fact.status] += 1;
  const reconciliationStatusCounts: Record<string, number> = {};
  for (const control of foundation.reconciliation) {
    reconciliationStatusCounts[control.status] = (reconciliationStatusCounts[control.status] ?? 0) + 1;
  }
  return {
    policyVersion: "canonical_economics_v2_privacy_safe_diagnostic_v1",
    schemaVersion: foundation.versionManifest.schemaVersion,
    authority: "shadow_non_authoritative",
    provenanceStatus: foundation.identity.provenanceStatus,
    templateAdmissionStatus: foundation.templateCapability.admissionStatus,
    templateCompletenessStatus: foundation.templateCapability.completenessStatus,
    suppliedDocumentIntegrityStatus: foundation.documentIntegrity.suppliedDocumentStatus,
    statementCompletenessStatus: foundation.documentIntegrity.completenessStatus,
    validationStatus: foundation.validation.status,
    factStatusCounts,
    effectiveRateState: foundation.metrics.headlineEffectiveRate.state,
    averageTicketState: foundation.metrics.headlineAverageTicket.state,
    sectionCount: foundation.sourceModel.sections.length,
    occurrenceCount: foundation.sourceModel.occurrences.length,
    representationGroupCount: foundation.sourceModel.representationGroups.length,
    reconciliationStatusCounts,
    semanticAmendmentIds: foundation.semanticAmendments.map((item) => item.id).sort(),
    containsFinancialValues: false,
    containsSourceText: false,
    containsMerchantIdentity: false,
  };
}
