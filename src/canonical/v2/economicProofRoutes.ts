import type { CanonicalEconomicSemanticApplication } from "./economicTypes.js";
import type { CanonicalEconomicSemanticApplicationAdmission } from "./economicAnalysis.js";
import type { CanonicalPricingAssertionBasis, CanonicalPricingDerivabilityTier } from "./pricingTypes.js";

const PROVING_BASES = new Set<CanonicalPricingAssertionBasis>([
  "source_fact", "deterministic_math", "rule_application", "external_verified",
]);
const STATEMENT_DERIVABILITY_TIERS = new Set<CanonicalPricingDerivabilityTier>([
  "stated_on_statement", "deterministically_derivable_from_statement", "inferable_from_statement_with_qualification",
]);

export function canonicalRoleProofRouteSatisfied(input: {
  derivabilityTier: CanonicalPricingDerivabilityTier;
  assertionBasis: CanonicalPricingAssertionBasis;
  sourceEvidenceRefs: readonly string[];
  externalEvidenceRefs: readonly string[];
  semanticApplication: CanonicalEconomicSemanticApplicationAdmission | CanonicalEconomicSemanticApplication | null | undefined;
}): boolean {
  if (!PROVING_BASES.has(input.assertionBasis)) return false;
  if (STATEMENT_DERIVABILITY_TIERS.has(input.derivabilityTier)) {
    return input.sourceEvidenceRefs.length > 0 && input.externalEvidenceRefs.length === 0 &&
      input.assertionBasis !== "external_verified" && !input.semanticApplication;
  }
  const application = input.semanticApplication;
  if (!application) return false;
  const rfSupported = application.sourceKind === "governed_rf_snapshot" && input.assertionBasis === "rule_application" &&
    application.selectedEntryRefs.length > 0 && application.sourceAuthorities.length > 0 &&
    application.externalEvidenceRefs.length === 0;
  const currentRunSupported = application.sourceKind === "current_run_verified_rg_evidence" &&
    input.assertionBasis === "external_verified" && input.externalEvidenceRefs.length > 0 &&
    application.externalEvidenceRefs.every((ref) => input.externalEvidenceRefs.includes(ref));
  if (!rfSupported && !currentRunSupported) return false;
  if (input.derivabilityTier === "requires_merchant_pricing_document") {
    return application.sourceAuthorities.includes("merchant_contract");
  }
  return input.derivabilityTier === "requires_external_rule_or_schedule" &&
    !application.sourceAuthorities.includes("merchant_contract");
}
