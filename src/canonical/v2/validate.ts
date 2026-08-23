import { decimalRate, divideMoneyByCount } from "../money.js";
import type { MoneyAmount } from "../types.js";
import type {
  CanonicalEconomicsV2Fact,
  CanonicalEconomicsV2Foundation,
  CanonicalEconomicsV2SemanticAmendmentId,
} from "./types.js";
import { RB_SEMANTIC_AMENDMENT_IDS } from "./versionManifest.js";

export class CanonicalEconomicsV2ValidationError extends Error {
  readonly errors: string[];
  readonly foundation: CanonicalEconomicsV2Foundation;

  constructor(foundation: CanonicalEconomicsV2Foundation) {
    super(`Canonical Economics V2 validation failed: ${foundation.validation.errors.join(" ")}`);
    this.name = "CanonicalEconomicsV2ValidationError";
    this.errors = foundation.validation.errors;
    this.foundation = foundation;
  }
}

export function validateCanonicalEconomicsV2Foundation(
  foundation: CanonicalEconomicsV2Foundation,
): CanonicalEconomicsV2Foundation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifest = foundation.versionManifest;
  if (manifest.schemaVersion !== "canonical_economics_v2_foundation_v1") errors.push("Unsupported V2 foundation schema version.");
  if (manifest.authority !== "shadow_non_authoritative") errors.push("RB V2 must remain shadow and non-authoritative.");
  if (manifest.persistence !== "none") errors.push("RB V2 must not introduce persistence.");
  if (manifest.aiResearchAuthority !== "prohibited") errors.push("AI/research authority over RB financial truth must be prohibited.");

  const evidenceIds = uniqueIdSet(foundation.sourceModel.evidence, "evidence", errors);
  const sectionIds = uniqueIdSet(foundation.sourceModel.sections, "section", errors);
  const occurrenceIds = uniqueIdSet(foundation.sourceModel.occurrences, "occurrence", errors);
  const interpretationIds = uniqueIdSet(foundation.sourceModel.parserInterpretations, "parser interpretation", errors);
  const calculationIds = uniqueIdSet(foundation.calculations, "calculation", errors);
  const reconciliationIds = uniqueIdSet(foundation.reconciliation, "reconciliation", errors);
  const factList = financialFactList(foundation);
  const factIds = uniqueIdSet(factList, "financial fact", errors);
  const metricIds = new Set([
    foundation.metrics.headlineEffectiveRate.id,
    foundation.metrics.headlineAverageTicket.id,
    ...(foundation.metrics.grossBasedRateDiagnostic ? [foundation.metrics.grossBasedRateDiagnostic.id] : []),
  ]);

  validateSourceIdentity(foundation, errors);
  validateTemplateCapability(foundation, evidenceIds, errors, warnings);
  validateDocumentIntegrity(foundation, evidenceIds, errors);
  for (const section of foundation.sourceModel.sections) {
    for (const ref of section.declaredControlOccurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Section ${section.id} has broken control occurrence ref ${ref}.`);
    for (const ref of section.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Section ${section.id} has broken evidence ref ${ref}.`);
    for (const ref of section.representsSameEconomicsAsSectionRefs) if (!sectionIds.has(ref) && !foundation.sourceModel.sections.some((item) => item.sourceSectionRef === ref)) {
      errors.push(`Section ${section.id} has broken repeated-section ref ${ref}.`);
    }
  }
  for (const evidence of foundation.sourceModel.evidence) {
    if (evidence.sectionRef && !sectionIds.has(evidence.sectionRef)) errors.push(`Evidence ${evidence.id} has broken section ref ${evidence.sectionRef}.`);
    if (!evidence.redactionApplied) errors.push(`Evidence ${evidence.id} is not marked redacted.`);
    if (evidence.redactedExcerpt && (/\b\d{6,}\b/.test(evidence.redactedExcerpt) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(evidence.redactedExcerpt))) {
      errors.push(`Evidence ${evidence.id} contains prohibited unredacted identifier content.`);
    }
  }
  for (const interpretation of foundation.sourceModel.parserInterpretations) {
    if (!occurrenceIds.has(interpretation.occurrenceRef)) errors.push(`Parser interpretation ${interpretation.id} has broken occurrence ref.`);
    if (interpretation.authority !== "deterministic_parser_only") errors.push(`Parser interpretation ${interpretation.id} has non-deterministic authority.`);
  }
  for (const occurrence of foundation.sourceModel.occurrences) {
    if (!sectionIds.has(occurrence.sectionRef)) errors.push(`Occurrence ${occurrence.id} has broken section ref.`);
    if (!evidenceIds.has(occurrence.evidenceRef)) errors.push(`Occurrence ${occurrence.id} has broken evidence ref.`);
    for (const ref of occurrence.parserInterpretationRefs) if (!interpretationIds.has(ref)) errors.push(`Occurrence ${occurrence.id} has broken interpretation ref ${ref}.`);
    for (const ref of occurrence.reconciliationRefs) if (!reconciliationIds.has(ref)) errors.push(`Occurrence ${occurrence.id} has broken reconciliation ref ${ref}.`);
  }

  const groupedOccurrenceRefs = new Set<string>();
  const representationMembership = new Map<string, number>();
  for (const group of foundation.sourceModel.representationGroups) {
    if (!factIds.has(group.canonicalFactRef)) errors.push(`Representation group ${group.id} has broken canonical fact ref.`);
    for (const ref of group.occurrenceRefs) {
      if (!occurrenceIds.has(ref)) errors.push(`Representation group ${group.id} has broken occurrence ref ${ref}.`);
      groupedOccurrenceRefs.add(ref);
      representationMembership.set(ref, (representationMembership.get(ref) ?? 0) + 1);
    }
    if (group.authoritativeContributionOccurrenceRef && !group.occurrenceRefs.includes(group.authoritativeContributionOccurrenceRef)) {
      errors.push(`Representation group ${group.id} authoritative contributor is outside the group.`);
    }
    if (group.duplicateHandling === "one_authoritative_contributor" && !group.authoritativeContributionOccurrenceRef) {
      errors.push(`Representation group ${group.id} requires exactly one authoritative contributor.`);
    }
    const contributors = group.occurrenceRefs.filter((ref) =>
      foundation.sourceModel.occurrences.find((occurrence) => occurrence.id === ref)?.contributionRole === "authoritative_contributor",
    );
    if (contributors.length > 1) errors.push(`Representation group ${group.id} has more than one authoritative contributor.`);
    if (group.duplicateHandling === "one_authoritative_contributor" && contributors.length !== 1) {
      errors.push(`Representation group ${group.id} does not have exactly one authoritative contributor.`);
    }
    if (group.authoritativeContributionOccurrenceRef && group.supportingOccurrenceRefs.includes(group.authoritativeContributionOccurrenceRef)) {
      errors.push(`Representation group ${group.id} lists its authoritative contributor as supporting detail.`);
    }
    for (const ref of group.supportingOccurrenceRefs) if (!group.occurrenceRefs.includes(ref)) errors.push(`Representation group ${group.id} has supporting ref outside the group.`);
    for (const ref of group.reconciliationRefs) if (!reconciliationIds.has(ref)) errors.push(`Representation group ${group.id} has broken reconciliation ref ${ref}.`);
  }
  for (const [occurrenceRef, membershipCount] of representationMembership) {
    if (membershipCount > 1) errors.push(`Occurrence ${occurrenceRef} belongs to more than one representation group.`);
  }
  if (groupedOccurrenceRefs.size > 0 && !foundation.semanticAmendments.some((item) => item.id === "RB-AMEND-005-REPRESENTATION-CONTRIBUTION")) {
    errors.push("Repeated source representations require RB-AMEND-005-REPRESENTATION-CONTRIBUTION.");
  }

  for (const fact of factList) validateFact(fact, evidenceIds, occurrenceIds, calculationIds, errors);
  validateFinancialRelationships(foundation, errors, warnings);
  validateMetrics(foundation, factIds, calculationIds, metricIds, errors);
  validateBillingAndFunding(foundation, factIds, occurrenceIds, reconciliationIds, errors);
  for (const control of foundation.reconciliation) {
    for (const ref of control.factRefs) if (!factIds.has(ref)) errors.push(`Reconciliation ${control.id} has broken fact ref ${ref}.`);
    for (const ref of control.occurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Reconciliation ${control.id} has broken occurrence ref ${ref}.`);
    for (const ref of control.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Reconciliation ${control.id} has broken evidence ref ${ref}.`);
  }
  validateAmendments(foundation, factIds, evidenceIds, errors);

  return {
    ...foundation,
    validation: {
      status: errors.length === 0 ? "valid" : "invalid",
      errors: unique(errors),
      warnings: unique(warnings),
    },
  };
}

function validateSourceIdentity(foundation: CanonicalEconomicsV2Foundation, errors: string[]): void {
  const { sourceFingerprint, sourceFingerprintStatus } = foundation.identity;
  if (sourceFingerprintStatus === "available" && !/^[a-f0-9]{64}$/.test(sourceFingerprint ?? "")) {
    errors.push("Available source fingerprint must be a full SHA-256 digest.");
  }
  if (sourceFingerprintStatus !== "available" && sourceFingerprint !== null) {
    errors.push("Unavailable or unknown source fingerprint must be null.");
  }
  if (foundation.identity.provenanceStatus === "source_unavailable" && sourceFingerprintStatus !== "unavailable") {
    errors.push("Unavailable source provenance must expose unavailable fingerprint status.");
  }
}

function validateDocumentIntegrity(
  foundation: CanonicalEconomicsV2Foundation,
  evidenceIds: Set<string>,
  errors: string[],
): void {
  const integrity = foundation.documentIntegrity;
  if (integrity.observedPageCount !== null && (!Number.isSafeInteger(integrity.observedPageCount) || integrity.observedPageCount < 0)) {
    errors.push("Observed document page count must be a non-negative integer or null.");
  }
  if (integrity.processedPageCount !== null && (!Number.isSafeInteger(integrity.processedPageCount) || integrity.processedPageCount < 0)) {
    errors.push("Processed supplied-document page count must be a non-negative integer or null.");
  }
  if (integrity.fatalPageErrorCount !== null && (!Number.isSafeInteger(integrity.fatalPageErrorCount) || integrity.fatalPageErrorCount < 0)) {
    errors.push("Fatal supplied-document page-error count must be a non-negative integer or null.");
  }
  if (integrity.expectedPageCount !== null && (!Number.isSafeInteger(integrity.expectedPageCount) || integrity.expectedPageCount <= 0)) {
    errors.push("Expected document page count must be a positive integer or null.");
  }
  if (integrity.missingPageNumbers.some((page) => !Number.isSafeInteger(page) || page <= 0)) {
    errors.push("Missing document page numbers must be positive integers.");
  }
  for (const ref of integrity.proofEvidenceRefs) {
    if (!evidenceIds.has(ref)) errors.push(`Statement-completeness proof has broken evidence ref ${ref}.`);
  }
  if (integrity.suppliedDocumentStatus === "complete_supplied_document") {
    if (integrity.observedPageCount === null || integrity.processedPageCount !== integrity.observedPageCount) {
      errors.push("Complete supplied-document integrity requires all enumerated pages to be processed.");
    }
    if (integrity.fatalPageErrorCount !== 0) errors.push("Complete supplied-document integrity requires zero fatal page errors.");
    if (integrity.extractionLineageComplete !== true) errors.push("Complete supplied-document integrity requires complete extraction lineage.");
    if (integrity.localIngestionTruncated !== false) errors.push("Complete supplied-document integrity prohibits local ingestion truncation.");
  }
  if (integrity.suppliedDocumentStatus === "incomplete_or_corrupt_supplied_document") {
    const failureObserved = integrity.fatalPageErrorCount !== null && integrity.fatalPageErrorCount > 0
      || integrity.observedPageCount !== null && integrity.processedPageCount !== integrity.observedPageCount
      || integrity.extractionLineageComplete === false
      || integrity.localIngestionTruncated === true;
    if (!failureObserved) errors.push("Incomplete supplied-document integrity requires deterministic ingestion, page-processing, lineage, or truncation evidence.");
  }
  if (integrity.completenessStatus === "complete") {
    if (integrity.expectedPageCount === null || integrity.observedPageCount !== integrity.expectedPageCount) {
      errors.push("Proven-complete processor statement requires equal known observed and expected page counts.");
    }
    if (integrity.missingPageNumbers.length > 0) errors.push("Proven-complete processor statement cannot list missing pages.");
    if (integrity.proofEvidenceRefs.length === 0) errors.push("Proven-complete processor statement requires explicit structural source evidence.");
  }
  if (integrity.completenessStatus === "incomplete") {
    if (integrity.proofEvidenceRefs.length === 0) errors.push("Proven-incomplete processor statement requires explicit structural source evidence.");
    const countProvesIncomplete = integrity.observedPageCount !== null &&
      integrity.expectedPageCount !== null &&
      integrity.observedPageCount < integrity.expectedPageCount;
    if (!countProvesIncomplete && integrity.missingPageNumbers.length === 0) {
      errors.push("Proven-incomplete processor statement requires a known page-count shortfall or explicit missing-page evidence.");
    }
  }
}

export function assertCanonicalEconomicsV2Foundation(
  foundation: CanonicalEconomicsV2Foundation,
): CanonicalEconomicsV2Foundation {
  const validated = validateCanonicalEconomicsV2Foundation(foundation);
  if (validated.validation.status === "invalid") throw new CanonicalEconomicsV2ValidationError(validated);
  return validated;
}

function validateTemplateCapability(
  foundation: CanonicalEconomicsV2Foundation,
  evidenceIds: Set<string>,
  errors: string[],
  warnings: string[],
): void {
  const profile = foundation.templateCapability;
  if (profile.admissionStatus === "admitted") {
    const authority = profile.admissionAuthority;
    if (!authority || !["product_owner", "authorized_domain_reviewer", "data_steward"].includes(authority.authorityClass)
      || !authority.authorityRef || !authority.admissionVersion || Number.isNaN(Date.parse(authority.admittedAt))) {
      errors.push("Admitted template capability requires versioned approved human admission authority metadata.");
    }
    if (profile.identityStatus !== "proven" || profile.admissionProofEvidenceRefs.length === 0) {
      errors.push("Admitted template capability requires proven identity and claim-scoped evidence.");
    }
  } else if (profile.admissionAuthority !== null) {
    errors.push("Non-admitted template capability cannot carry admission authority metadata.");
  }
  if (profile.completenessStatus === "complete") {
    if (profile.admissionStatus !== "admitted" || profile.identityStatus !== "proven") {
      errors.push("Template completeness cannot be complete without admitted, proven template identity.");
    }
    if (profile.admissionProofEvidenceRefs.length === 0) errors.push("Complete template capability requires admission proof evidence.");
  }
  for (const ref of profile.admissionProofEvidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Template admission has broken evidence ref ${ref}.`);
  for (const capability of profile.capabilities) {
    if (capability.status === "supported" && profile.admissionStatus !== "admitted") {
      warnings.push(`Capability ${capability.capability} is observational because the template is not admitted.`);
    }
    for (const ref of capability.proofEvidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Template capability ${capability.capability} has broken evidence ref ${ref}.`);
  }
}

function validateFact(
  fact: CanonicalEconomicsV2Fact<unknown, string>,
  evidenceIds: Set<string>,
  occurrenceIds: Set<string>,
  calculationIds: Set<string>,
  errors: string[],
): void {
  if (fact.status === "available" && fact.value === null) errors.push(`Fact ${fact.id} is available with null value.`);
  if (fact.status !== "available" && fact.value !== null) errors.push(`Fact ${fact.id} is ${fact.status} with a value.`);
  if (fact.status === "available" && fact.evidenceRefs.length === 0 && fact.occurrenceRefs.length === 0 && !fact.calculationRef) {
    errors.push(`Fact ${fact.id} is available without source occurrence, evidence, or calculation lineage.`);
  }
  for (const ref of fact.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Fact ${fact.id} has broken evidence ref ${ref}.`);
  for (const ref of fact.occurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Fact ${fact.id} has broken occurrence ref ${ref}.`);
  if (fact.calculationRef && !calculationIds.has(fact.calculationRef)) errors.push(`Fact ${fact.id} has broken calculation ref ${fact.calculationRef}.`);
}

function validateFinancialRelationships(foundation: CanonicalEconomicsV2Foundation, errors: string[], warnings: string[]): void {
  const facts = foundation.financialPopulations;
  const gross = facts.grossSaleVolume.value;
  const refunds = facts.refundVolume.value;
  const net = facts.canonicalNetSubmittedCardVolume.value;
  if (facts.grossSaleVolume.status === "available" && facts.refundVolume.status === "available" && facts.canonicalNetSubmittedCardVolume.status === "available" && gross && refunds && net) {
    if (gross.amountMinor - refunds.amountMinor !== net.amountMinor) {
      errors.push("Gross sales less refunds does not equal canonical net submitted card volume.");
    }
  }
  if (facts.unresolvedAdjustmentChargebackAmount.status === "available" &&
      (facts.settlementAdjustmentAmount.status === "available" || facts.chargebackPrincipalDebitAmount.status === "available" || facts.chargebackRepresentmentAmount.status === "available")) {
    errors.push("An unresolved combined adjustment/chargeback fact cannot coexist as selected with separated adjustment or chargeback populations.");
  }
  for (const fact of [facts.chargebackPrincipalDebitAmount, facts.chargebackRepresentmentAmount, facts.chargebackFeeAmount, facts.feeCreditAmount]) {
    if (fact.value && fact.value.amountMinor < 0) errors.push(`Fact ${fact.id} must preserve direction by population and expose a non-negative magnitude.`);
  }
  if (facts.canonicalNetSubmittedCardVolume.status === "available" && facts.grossSaleVolume.status !== "available") {
    warnings.push("Net submitted is available while gross-sale volume remains unavailable; V2 correctly preserves the capability ceiling.");
  }
  if (facts.grossSaleTransactionCount.status === "available" && foundation.identity.provenanceStatus !== "approved_synthetic") {
    const countCapability = foundation.templateCapability.capabilities.find(
      (capability) => capability.capability === "gross_sale_transaction_count",
    );
    const capabilityProven = foundation.templateCapability.identityStatus === "proven" &&
      foundation.templateCapability.admissionStatus === "admitted" &&
      foundation.templateCapability.admissionAuthority !== null &&
      foundation.templateCapability.admissionProofEvidenceRefs.length > 0 &&
      countCapability?.status === "supported" &&
      countCapability.proofEvidenceRefs.length > 0;
    if (!capabilityProven) {
      errors.push("Gross-sale transaction count requires an admitted, complete template capability with population proof.");
    }
  }
}

function validateMetrics(
  foundation: CanonicalEconomicsV2Foundation,
  factIds: Set<string>,
  calculationIds: Set<string>,
  metricIds: Set<string>,
  errors: string[],
): void {
  const rate = foundation.metrics.headlineEffectiveRate;
  const facts = foundation.financialPopulations;
  if (rate.numeratorFactRef !== facts.totalStatementProcessingFees.id || rate.denominatorFactRef !== facts.canonicalNetSubmittedCardVolume.id) {
    errors.push("Headline effective rate is not inseparably bound to total fees and canonical net submitted facts.");
  }
  if (rate.denominatorPopulation !== "canonical_net_submitted_card_volume") errors.push("Headline effective rate uses the wrong denominator population.");
  if (!factIds.has(rate.numeratorFactRef) || !factIds.has(rate.denominatorFactRef)) errors.push("Headline effective rate has broken fact references.");
  const denominator = facts.canonicalNetSubmittedCardVolume.value;
  const numerator = facts.totalStatementProcessingFees.value;
  if (denominator?.amountMinor === 0 && (rate.state !== "undefined_zero_denominator" || rate.value !== null)) {
    errors.push("Zero headline denominator must produce explicit undefined state with no numeric rate.");
  }
  if (rate.state === "defined") {
    if (!numerator || !denominator || rate.value !== decimalRate(numerator, denominator, 6)) errors.push("Defined headline effective rate does not reconstruct exactly.");
    if (!rate.calculationRef || !calculationIds.has(rate.calculationRef)) errors.push("Defined headline effective rate lacks calculation lineage.");
  } else if (rate.value !== null || rate.calculationRef !== null) {
    errors.push("Non-defined headline effective rate cannot expose a numeric value or calculation conclusion.");
  }

  const average = foundation.metrics.headlineAverageTicket;
  if (average.numeratorFactRef !== facts.grossSaleVolume.id || average.denominatorFactRef !== facts.grossSaleTransactionCount.id) {
    errors.push("Headline average ticket is not bound to gross-sale volume and gross-sale transaction count.");
  }
  if (average.numeratorPopulation !== "gross_sale_volume" || average.denominatorPopulation !== "gross_sale_transaction_count") {
    errors.push("Headline average ticket uses an incompatible population.");
  }
  if (average.state === "defined") {
    const expected = facts.grossSaleVolume.value && facts.grossSaleTransactionCount.value !== null
      ? divideMoneyByCount(facts.grossSaleVolume.value, facts.grossSaleTransactionCount.value)
      : null;
    if (!sameMoney(expected, average.value)) errors.push("Defined headline average ticket does not reconstruct exactly.");
    if (!average.calculationRef || !calculationIds.has(average.calculationRef)) errors.push("Defined headline average ticket lacks calculation lineage.");
  } else if (average.value !== null || average.calculationRef !== null) {
    errors.push("Non-defined headline average ticket cannot expose a numeric value or calculation conclusion.");
  }
  for (const calculation of foundation.calculations) {
    for (const ref of calculation.inputFactRefs) if (!factIds.has(ref)) errors.push(`Calculation ${calculation.id} has broken input fact ref ${ref}.`);
    if (!factIds.has(calculation.resultFactRef) && !metricIds.has(calculation.resultFactRef)) errors.push(`Calculation ${calculation.id} has broken result ref.`);
  }
}

function validateBillingAndFunding(
  foundation: CanonicalEconomicsV2Foundation,
  factIds: Set<string>,
  occurrenceIds: Set<string>,
  reconciliationIds: Set<string>,
  errors: string[],
): void {
  const funding = foundation.billingAndFunding;
  for (const ref of [
    funding.submittedVolumeFactRef,
    funding.thirdPartyVolumeFactRef,
    funding.adjustmentFactRef,
    funding.chargebackDebitFactRef,
    funding.representmentFactRef,
    funding.feeFactRef,
    funding.fundedAmountFactRef,
    funding.batchCountFactRef,
  ]) if (!factIds.has(ref)) errors.push(`Billing/funding model has broken fact ref ${ref}.`);
  for (const ref of funding.batchOccurrenceRefs) if (!occurrenceIds.has(ref)) errors.push(`Billing/funding model has broken occurrence ref ${ref}.`);
  for (const ref of funding.reconciliationRefs) if (!reconciliationIds.has(ref)) errors.push(`Billing/funding model has broken reconciliation ref ${ref}.`);
}

function validateAmendments(
  foundation: CanonicalEconomicsV2Foundation,
  factIds: Set<string>,
  evidenceIds: Set<string>,
  errors: string[],
): void {
  const allowed = new Set<CanonicalEconomicsV2SemanticAmendmentId>(RB_SEMANTIC_AMENDMENT_IDS);
  const seen = new Set<CanonicalEconomicsV2SemanticAmendmentId>();
  for (const amendment of foundation.semanticAmendments) {
    if (!allowed.has(amendment.id)) errors.push(`Unapproved semantic amendment ${amendment.id}.`);
    if (seen.has(amendment.id)) errors.push(`Duplicate semantic amendment ${amendment.id}.`);
    seen.add(amendment.id);
    for (const ref of amendment.factRefs) if (!factIds.has(ref)) errors.push(`Semantic amendment ${amendment.id} has broken fact ref ${ref}.`);
    for (const ref of amendment.evidenceRefs) if (!evidenceIds.has(ref)) errors.push(`Semantic amendment ${amendment.id} has broken evidence ref ${ref}.`);
  }
  for (const id of RB_SEMANTIC_AMENDMENT_IDS) if (!seen.has(id)) errors.push(`Required approved RB semantic amendment ${id} is not recorded.`);
}

function financialFactList(foundation: CanonicalEconomicsV2Foundation): CanonicalEconomicsV2Fact<unknown, string>[] {
  return Object.values(foundation.financialPopulations) as CanonicalEconomicsV2Fact<unknown, string>[];
}

function uniqueIdSet(items: Array<{ id: string }>, label: string, errors: string[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) errors.push(`Duplicate ${label} id ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

function sameMoney(left: MoneyAmount | null, right: MoneyAmount | null): boolean {
  if (!left || !right) return left === right;
  return left.currency === right.currency && left.amountMinor === right.amountMinor;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
