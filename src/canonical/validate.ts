import { isMoneyAmount } from "./money.js";
import type { CanonicalStatementAnalysis } from "./types.js";

export function validateCanonicalStatementAnalysis(analysis: CanonicalStatementAnalysis): CanonicalStatementAnalysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const evidenceIds = new Set(analysis.evidence.map((item) => item.id));
  const calculationIds = new Set(analysis.calculations.map((item) => item.id));

  for (const collection of [analysis.evidence.map((item) => item.id), analysis.calculations.map((item) => item.id)]) {
    const seen = new Set<string>();
    for (const id of collection) {
      if (seen.has(id)) errors.push(`Duplicate canonical id ${id}.`);
      seen.add(id);
    }
  }

  visitFactValues(analysis, (path, fact) => {
    for (const evidenceRef of fact.evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) errors.push(`${path} evidence ref ${evidenceRef} is broken.`);
    }
    if (fact.calculationRef && !calculationIds.has(fact.calculationRef)) errors.push(`${path} calculation ref ${fact.calculationRef} is broken.`);
    if (fact.status === "selected" && fact.value === null) errors.push(`${path} is selected with null value.`);
    if (fact.status === "selected" && fact.evidenceRefs.length === 0 && !fact.calculationRef) {
      errors.push(`${path} is selected without evidence or calculation.`);
    }
    if (fact.status !== "selected" && fact.value !== null) errors.push(`${path} is ${fact.status} but has a value.`);
    const selectedCandidates = fact.candidates.filter((candidate) => candidate.selected);
    if (selectedCandidates.length > 1) errors.push(`${path} has multiple selected candidates.`);
    if (fact.selectedCandidateId && !selectedCandidates.some((candidate) => candidate.id === fact.selectedCandidateId)) {
      errors.push(`${path}.selectedCandidateId does not identify a selected candidate.`);
    }
    for (const candidate of fact.candidates) {
      if (!Array.isArray(candidate.evidenceRefs)) {
        errors.push(`${path} candidate ${candidate.id ?? "unknown"} has invalid evidenceRefs.`);
        continue;
      }
      for (const evidenceRef of candidate.evidenceRefs) {
        if (!evidenceIds.has(evidenceRef)) errors.push(`${path} candidate ${candidate.id} evidence ref ${evidenceRef} is broken.`);
      }
      if (candidate.selected && !candidate.selectionReason) errors.push(`${path} selected candidate ${candidate.id} lacks selectionReason.`);
      if (!candidate.selected && !candidate.rejectionReason) errors.push(`${path} rejected candidate ${candidate.id} lacks rejectionReason.`);
    }
  });

  if (analysis.financialFacts.averageTicket.value !== null && !analysis.financialFacts.averageTicketBasis.allowed) {
    errors.push("Average ticket has a value when averageTicketBasis is not allowed.");
  }
  if (analysis.financialFacts.averageTicketBasis.allowed) {
    const basis = analysis.financialFacts.averageTicketBasis;
    if (basis.selectedVolumePopulation === "submitted_sales" && basis.selectedCountType !== "submitted_transactions") {
      errors.push("Submitted-sales average ticket must use submitted transactions.");
    }
    if (basis.selectedVolumePopulation === "settled_sales" && basis.selectedCountType !== "settled_transactions") {
      errors.push("Settled-sales average ticket must use settled transactions.");
    }
  }
  if (analysis.financialFacts.transactionCounts.cardTypeItems.value !== null && analysis.financialFacts.averageTicketBasis.selectedCountType === "card_type_items") {
    errors.push("Card-type item counts cannot be selected for average ticket in Package B.");
  }
  if (analysis.financialFacts.processedSales.value && !isMoneyAmount(analysis.financialFacts.processedSales.value)) {
    errors.push("Processed sales must use canonical MoneyAmount.");
  }
  if (analysis.financialFacts.totalFees.value && !isMoneyAmount(analysis.financialFacts.totalFees.value)) {
    errors.push("Total fees must use canonical MoneyAmount.");
  }
  if (analysis.versionManifest?.schemaVersion !== "canonical_statement_analysis_v1") {
    errors.push("Canonical version manifest is missing or has an unsupported schemaVersion.");
  }
  if (analysis.versionManifest?.effectiveRatePolicyVersion !== "effective_rate_basis_v1") {
    errors.push("Canonical version manifest must include effective_rate_basis_v1.");
  }
  if (analysis.financialFacts.effectiveRateBasis?.policyVersion !== "effective_rate_basis_v1") {
    errors.push("Effective rate basis is missing or unsupported.");
  }
  if (
    analysis.financialFacts.rateRevealCalculatedAllInRate.value !== null &&
    (analysis.financialFacts.effectiveRateBasis.numeratorFeeBasis === "unsupported" ||
      analysis.financialFacts.effectiveRateBasis.denominatorVolumeBasis === "unsupported" ||
      !analysis.financialFacts.effectiveRateBasis.calculationRef)
  ) {
    errors.push("Selected effective rate requires explicit supported numerator and denominator basis plus calculationRef.");
  }

  const validated: CanonicalStatementAnalysis = {
    ...analysis,
    validation: {
      status: errors.length > 0 ? "invalid" : warnings.length > 0 ? "valid_with_warnings" : "valid",
      errors,
      warnings,
    },
  };
  if (errors.length > 0) {
    throw new Error(`Canonical statement analysis validation failed: ${errors.join(" ")}`);
  }
  return validated;
}

function visitFactValues(
  analysis: CanonicalStatementAnalysis,
  visitor: (
    path: string,
    value: {
      value: unknown;
      status: string;
      evidenceRefs: string[];
      calculationRef?: string;
      selectedCandidateId?: string;
      candidates: any[];
    },
  ) => void,
): void {
  for (const [key, value] of Object.entries(analysis.identity)) {
    if (key === "sourceDocumentRef") continue;
    visitor(`identity.${key}`, value as any);
  }
  for (const [key, value] of Object.entries(analysis.financialFacts)) {
    if (key === "transactionCounts") {
      for (const [countKey, countValue] of Object.entries(analysis.financialFacts.transactionCounts)) {
        visitor(`financialFacts.transactionCounts.${countKey}`, countValue as any);
      }
      continue;
    }
    if (key === "averageTicketBasis" || key === "effectiveRateBasis") continue;
    visitor(`financialFacts.${key}`, value as any);
  }
}
