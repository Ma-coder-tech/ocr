import type {
  CanonicalFeeActionability,
  CanonicalFeeAiSuggestion,
  CanonicalFeeCategory,
  CanonicalFeeClassificationCandidate,
  CanonicalFeeClassificationConfidence,
  CanonicalFeeClassificationResolution,
  CanonicalFeeDocumentationRequirement,
  CanonicalFeeHumanOverrideRecord,
  CanonicalFeeLedger,
  CanonicalFeeOwnership,
  CanonicalFeeOwnershipActionability,
  CanonicalFeeParty,
  CanonicalFeeRuleReference,
  CanonicalFeeSelectedClassification,
  CanonicalFeeSpreadAssertion,
  CanonicalFeeSpreadAssertionStatus,
} from "./types.js";

export const FEE_OWNERSHIP_ACTIONABILITY_POLICY_VERSION = "fee_ownership_actionability_v1" as const;
export const FEE_TAXONOMY_VERSION = "fee_taxonomy_v1" as const;
export const FEE_OWNERSHIP_RULE_REGISTRY_VERSION = "fee_ownership_rules_v1" as const;
export const FEE_AI_SUGGESTION_POLICY_VERSION = "fee_ai_suggestion_policy_v1" as const;
export const FEE_HUMAN_OVERRIDE_POLICY_VERSION = "fee_human_override_policy_v1" as const;

export type CanonicalFeeReferenceRuleInput = {
  referenceId: string;
  version: string;
  aliases: string[];
  category: Extract<
    CanonicalFeeCategory,
    "interchange" | "card_brand_network_assessment" | "network_access_or_authorization" | "tax_or_government"
  >;
  owner: Extract<CanonicalFeeParty, "network" | "card_brand" | "issuer_or_interchange" | "tax_or_government">;
  applicableProcessorOrNetwork: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceProvenance: string;
  requiredMatchingFields: string[];
  negativePatterns: string[];
};

type BuildOptions = {
  processorFamily?: string | null;
  statementPeriodStart?: string | null;
  referenceRules?: CanonicalFeeReferenceRuleInput[];
  aiSuggestions?: CanonicalFeeAiSuggestion[];
  humanOverrides?: CanonicalFeeHumanOverrideRecord[];
};

type RowContext = {
  label: string;
  section: string;
  combined: string;
  normalizedLabel: string;
  normalizedCombined: string;
  evidenceRefs: string[];
  confidence: CanonicalFeeClassificationConfidence;
};

type CandidateInput = Omit<CanonicalFeeClassificationCandidate, "id" | "feeRowId" | "evidenceRefs" | "authoritative"> & {
  authoritative?: boolean;
  evidenceRefs?: string[];
};

const RULE_VERSION = "1.0.0";

const unknownOwnership: CanonicalFeeOwnership = {
  collector: "unknown",
  economicBeneficiary: "unknown",
  contractualController: "unknown",
};

const processorOwnership: CanonicalFeeOwnership = {
  collector: "processor",
  economicBeneficiary: "processor",
  contractualController: "processor",
};

const merchantContractOwnership: CanonicalFeeOwnership = {
  collector: "processor",
  economicBeneficiary: "merchant_contract",
  contractualController: "merchant_contract",
};

export function buildCanonicalFeeOwnershipActionability(
  ledger: CanonicalFeeLedger,
  options: BuildOptions = {},
): CanonicalFeeOwnershipActionability {
  if (ledger.rows.length === 0) {
    return emptyLayer("Canonical fee ledger did not include rows to classify.");
  }

  const rowClassifications = ledger.rows.map((row): CanonicalFeeClassificationResolution => {
    const context = rowContext(row.id, ledger);
    const candidates = [
      ...deterministicCandidates(row.id, row.role, context, options),
      ...overrideCandidatesForRow(row.id, options.humanOverrides ?? []),
    ];
    return resolveFeeClassificationCandidates(row.id, candidates, context.evidenceRefs);
  });

  const unresolvedCount = rowClassifications.filter((item) => item.conflictStatus !== "none" || item.selected.actionabilityCeiling === "unknown").length;
  return {
    policyVersion: FEE_OWNERSHIP_ACTIONABILITY_POLICY_VERSION,
    taxonomyVersion: FEE_TAXONOMY_VERSION,
    ruleRegistryVersion: FEE_OWNERSHIP_RULE_REGISTRY_VERSION,
    aiSuggestionPolicyVersion: FEE_AI_SUGGESTION_POLICY_VERSION,
    humanOverridePolicyVersion: FEE_HUMAN_OVERRIDE_POLICY_VERSION,
    status: unresolvedCount === 0 ? "available" : "partial",
    rowClassifications,
    spreadAssertions: [],
    aiSuggestions: options.aiSuggestions ?? [],
    humanOverrides: options.humanOverrides ?? [],
    limitations: [
      "Package D classification does not calculate savings, annualization, benchmarks, report states, or customer wording.",
      ...(unresolvedCount > 0 ? ["One or more fee rows require verification or conflict review before any downstream eligibility decision."] : []),
    ],
  };
}

export function resolveFeeClassificationCandidates(
  feeRowId: string,
  rawCandidates: CanonicalFeeClassificationCandidate[],
  evidenceRefs: string[] = [],
): CanonicalFeeClassificationResolution {
  const candidates = rawCandidates.length > 0 ? rawCandidates : [safeDefaultCandidate(feeRowId, evidenceRefs, "No deterministic Package D rule matched this fee row.")];
  const authoritative = candidates.filter((candidate) => candidate.authoritative);
  const selectable = authoritative.length > 0 ? authoritative : [safeDefaultCandidate(feeRowId, evidenceRefs, "No authoritative Package D candidate was available.")];
  const ranked = selectable
    .map((candidate) => ({ candidate, rank: candidateRank(candidate) }))
    .sort((left, right) => right.rank - left.rank || left.candidate.id.localeCompare(right.candidate.id));
  const topRank = ranked[0]?.rank ?? 0;
  const topCandidates = ranked.filter((item) => item.rank === topRank).map((item) => item.candidate);

  const conflicting = hasMaterialConflict(topCandidates);
  if (conflicting) {
    const fallback = safeDefaultCandidate(
      feeRowId,
      evidenceRefs,
      "Conflicting Package D candidates had equal authority; selected verification-only safe default instead of resolving by source order.",
    );
    const allCandidates = candidates.some((candidate) => candidate.id === fallback.id) ? candidates : [...candidates, fallback];
    return resolution({
      feeRowId,
      selected: fallback,
      candidates: allCandidates,
      conflictStatus: "requires_human_review",
      conflictReason: "Multiple equally authoritative candidates conflict on category, ownership, or actionability; Package D did not resolve by source order.",
    });
  }

  const selected = ranked[0]?.candidate ?? candidates[0]!;
  const materiallyRejected = candidates.filter((candidate) => candidate.id !== selected.id && conflictsWith(selected, candidate));
  const conflictStatus = materiallyRejected.length > 0 ? "resolved_by_stronger_evidence" : "none";
  return resolution({
    feeRowId,
    selected,
    candidates,
    conflictStatus,
    conflictReason:
      conflictStatus === "resolved_by_stronger_evidence"
        ? "Lower-authority conflicting candidates were rejected by deterministic confidence/source ranking."
        : null,
  });
}

export function makeCanonicalFeeAiSuggestion(input: Omit<CanonicalFeeAiSuggestion, "authoritative" | "sanitizedExplanation"> & {
  sanitizedExplanation: string;
}): CanonicalFeeAiSuggestion {
  return {
    ...input,
    sanitizedExplanation: sanitizeText(input.sanitizedExplanation, 500),
    authoritative: false,
  };
}

export function createStatementSpecificHumanOverride(input: Omit<CanonicalFeeHumanOverrideRecord, "scope" | "reusableRuleCreated"> & {
  scope?: "statement_specific";
}): CanonicalFeeHumanOverrideRecord {
  return {
    ...input,
    scope: "statement_specific",
    reusableRuleCreated: false,
  };
}

export function reusableRuleCannotBeCreatedAutomatically(): false {
  return false;
}

export function makeCanonicalFeeSpreadAssertion(input: {
  id: string;
  baseFeeRowId: string;
  status: CanonicalFeeSpreadAssertionStatus;
  evidenceRefs: string[];
  reference: CanonicalFeeRuleReference | null;
  reason: string;
}): CanonicalFeeSpreadAssertion {
  if (input.status === "proven") {
    if (!input.reference?.periodApplicable) {
      throw new Error("Package D proven spread assertions require a period-applicable authoritative reference.");
    }
    if (input.evidenceRefs.length === 0) {
      throw new Error("Package D proven spread assertions require matching fee-row evidence.");
    }
  }
  return {
    id: input.id,
    baseFeeRowId: input.baseFeeRowId,
    status: input.status,
    owner: input.status === "proven" ? "processor" : "unknown",
    actionabilityCeiling: input.status === "proven" ? "potentially_actionable" : input.status === "suspected" ? "verify_only" : "not_actionable",
    evidenceRefs: input.evidenceRefs,
    reference: input.reference,
    reason: input.reason,
    authoritative: input.status === "proven",
  };
}

export function referenceRuleToCanonicalReference(
  rule: CanonicalFeeReferenceRuleInput,
  statementPeriodStart: string | null | undefined,
): CanonicalFeeRuleReference {
  return {
    referenceId: rule.referenceId,
    version: rule.version,
    applicableProcessorOrNetwork: rule.applicableProcessorOrNetwork,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    sourceProvenance: rule.sourceProvenance,
    requiredMatchingFields: rule.requiredMatchingFields,
    negativePatterns: rule.negativePatterns,
    periodApplicable: referencePeriodApplies(rule, statementPeriodStart),
  };
}

function deterministicCandidates(
  feeRowId: string,
  rowRole: string,
  context: RowContext,
  options: BuildOptions,
): CanonicalFeeClassificationCandidate[] {
  if (context.confidence === "low") {
    return [
      candidate(feeRowId, context, {
        category: "unknown_needs_review",
        ownership: unknownOwnership,
        actionabilityCeiling: "unknown",
        documentationRequirement: "blocking",
        confidence: "low",
        sourceType: "safe_default",
        ruleId: "D-SAFE-LOW-CONFIDENCE",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D approved safe defaults.",
        reference: null,
        reason: "Low-confidence classification cannot establish ownership or actionability.",
        permissionConsequences: ["Ownership unknown.", "Excluded from Package D actionability authority.", "No savings eligibility can be inferred."],
        limitations: ["Requires human review or stronger deterministic evidence."],
      }),
    ];
  }

  const candidates: CanonicalFeeClassificationCandidate[] = [];
  const reference = matchingReference(context, options.referenceRules ?? [], options.statementPeriodStart);
  const hasPeriodApplicableReference = reference ? referencePeriodApplies(reference, options.statementPeriodStart) : false;
  const interchangeEvidence = rowRole === "interchange_detail_row" || hasInterchangeSectionEvidence(context);
  const highConfidenceProcessorMarkup = hasHighConfidenceProcessorMarkup(context);
  const highConfidenceProcessorPerItem = hasHighConfidenceProcessorPerItem(context);
  if (reference) {
    const canonicalReference = referenceRuleToCanonicalReference(reference, options.statementPeriodStart);
    if (canonicalReference.periodApplicable) {
      candidates.push(
        candidate(feeRowId, context, {
          category: reference.category,
          ownership: ownershipForReference(reference.owner),
          actionabilityCeiling: "not_actionable",
          documentationRequirement: "recommended",
          confidence: "high",
          sourceType: "deterministic_rule",
          ruleId: "D-REF-PERIOD-APPLICABLE",
          ruleVersion: RULE_VERSION,
          ruleProvenance: "Package D source-backed reference rule.",
          reference: canonicalReference,
          reason: "A period-applicable authoritative reference matched the fee row and establishes non-actionable base ownership.",
          permissionConsequences: ["Base pass-through row remains not actionable.", "Any processor spread must be represented separately."],
          limitations: ["This classification does not calculate at-cost spread or savings."],
        }),
      );
    } else {
      candidates.push(
        candidate(feeRowId, context, {
          category: "unknown_needs_review",
          ownership: unknownOwnership,
          actionabilityCeiling: "verify_only",
          documentationRequirement: "blocking",
          confidence: "medium",
          sourceType: "safe_default",
          ruleId: "D-REF-PERIOD-INAPPLICABLE",
          ruleVersion: RULE_VERSION,
          ruleProvenance: "Package D reference safety policy.",
          reference: canonicalReference,
          reason: "A reference matched the label, but its effective period does not apply to the statement period.",
          permissionConsequences: ["Reference cannot prove ownership, at-cost status, spread, or actionability."],
          limitations: ["Requires period-correct documentation."],
        }),
      );
    }
  }

  if (rowRole === "credit") {
    candidates.push(
      candidate(feeRowId, context, {
        category: "credit",
        ownership: unknownOwnership,
        actionabilityCeiling: "not_actionable",
        documentationRequirement: "none",
        confidence: context.confidence,
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-CREDIT",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D fee role policy.",
        reference: null,
        reason: "Credits and reversals are not treated as removable fee charges.",
        permissionConsequences: ["Excluded from actionability and savings."],
        limitations: [],
      }),
    );
  }

  if (interchangeEvidence) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "interchange",
        ownership: { collector: "processor", economicBeneficiary: "issuer_or_interchange", contractualController: "card_brand" },
        actionabilityCeiling: "not_actionable",
        documentationRequirement: "recommended",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-INTERCHANGE",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D approved interchange safe default.",
        reference: null,
        reason: "Interchange/program detail evidence identifies issuer/interchange economics; Package D defaults it to not actionable.",
        permissionConsequences: ["Cannot be represented as removable processor fees."],
        limitations: ["Does not prove whether the processor passed the cost through at cost."],
      }),
    );
  }

  if (!interchangeEvidence && hasProvenNetworkContext(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: hasNetworkAuthorizationSignal(context) ? "network_access_or_authorization" : "card_brand_network_assessment",
        ownership: { collector: "processor", economicBeneficiary: "card_brand", contractualController: "card_brand" },
        actionabilityCeiling: "not_actionable",
        documentationRequirement: "recommended",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-NETWORK-CONTEXT",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D network/card-brand pass-through safe default.",
        reference: null,
        reason: "The row has card-brand/network section context beyond fee-label keywords, so the base fee is non-actionable.",
        permissionConsequences: ["Base network/card-brand fee cannot become potentially actionable without separate processor-spread evidence."],
        limitations: ["Processor collection does not establish processor economic ownership."],
      }),
    );
  } else if (!hasPeriodApplicableReference && !interchangeEvidence && hasNetworkLikeKeyword(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "unknown_needs_review",
        ownership: unknownOwnership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "blocking",
        confidence: "medium",
        sourceType: "safe_default",
        ruleId: "D-SAFE-NETWORK-LIKE-INSUFFICIENT",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D approved safe defaults.",
        reference: null,
        reason: "Network/card-brand-like keywords are insufficient by themselves to prove ownership or actionability.",
        permissionConsequences: ["Requires documentation.", "Cannot become potentially actionable in Package D."],
        limitations: ["Needs processor or source-backed pass-through documentation."],
      }),
    );
  }

  if (highConfidenceProcessorMarkup) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "processor_markup",
        ownership: processorOwnership,
        actionabilityCeiling: "potentially_actionable",
        documentationRequirement: "required_for_savings",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-PROCESSOR-MARKUP-HIGH",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D deterministic processor-markup patterns.",
        reference: null,
        reason: "High-confidence processor discount/markup evidence establishes processor control, but not savings eligibility.",
        permissionConsequences: ["May be considered by Package E only after separate opportunity evidence."],
        limitations: ["Package D does not calculate target pricing, cadence, or savings."],
      }),
    );
  }

  if (highConfidenceProcessorPerItem) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "processor_per_item_fee",
        ownership: processorOwnership,
        actionabilityCeiling: "potentially_actionable",
        documentationRequirement: "required_for_savings",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-PROCESSOR-PERITEM-HIGH",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D deterministic processor per-item patterns.",
        reference: null,
        reason: "High-confidence gateway/auth/batch processor fee evidence establishes processor control, but not savings eligibility.",
        permissionConsequences: ["May be considered by Package E only after separate opportunity evidence."],
        limitations: ["Package D does not calculate target pricing, cadence, or savings."],
      }),
    );
  } else if (!highConfidenceProcessorMarkup && hasMediumConfidenceProcessorSignal(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "administrative_fee",
        ownership: processorOwnership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "required_for_authority",
        confidence: "medium",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-PROCESSOR-MEDIUM",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D approved medium-confidence safe default.",
        reference: null,
        reason: "Medium-confidence processor-like evidence remains verification-only.",
        permissionConsequences: ["Cannot become potentially actionable without stronger deterministic or human-verified evidence."],
        limitations: ["Label or section evidence is not specific enough for high-confidence processor control."],
      }),
    );
  }

  if (hasThirdPartySignal(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "third_party_product",
        ownership: { collector: "processor", economicBeneficiary: "third_party", contractualController: "merchant_contract" },
        actionabilityCeiling: "verify_only",
        documentationRequirement: "required_for_authority",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-THIRD-PARTY-DEFAULT",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D approved third-party safe default.",
        reference: null,
        reason: "Third-party service fees default to verification-only until cancellation or contract evidence proves actionability.",
        permissionConsequences: ["Cannot become potentially actionable without deterministic or human-verified service/contract evidence."],
        limitations: ["Package D does not infer unused service or contract cancellation rights from the label alone."],
      }),
    );
  }

  if (hasComplianceSignal(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "compliance_fee",
        ownership: merchantContractOwnership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "required_for_authority",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-COMPLIANCE-DEFAULT",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D contract-dependent safe default.",
        reference: null,
        reason: "Compliance labels are contract-dependent and require verification before removal claims.",
        permissionConsequences: ["Verification-only in Package D.", "No savings eligibility can be inferred."],
        limitations: ["Compliance keyword alone does not establish government or processor ownership."],
      }),
    );
  }

  if (hasEquipmentSignal(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "equipment_or_lease",
        ownership: merchantContractOwnership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "required_for_authority",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-EQUIPMENT-LEASE",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D contract-dependent safe default.",
        reference: null,
        reason: "Equipment and lease fees are contract-dependent and require documentation.",
        permissionConsequences: ["Verification-only in Package D."],
        limitations: ["Requires contract or cancellation evidence before stronger actionability."],
      }),
    );
  }

  if (hasAuthoritativeTaxGovernmentEvidence(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "tax_or_government",
        ownership: { collector: "processor", economicBeneficiary: "tax_or_government", contractualController: "tax_or_government" },
        actionabilityCeiling: "not_actionable",
        documentationRequirement: "recommended",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-TAX-GOVERNMENT-AUTHORITATIVE",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D authoritative tax/government safe default.",
        reference: null,
        reason: "Authoritative tax/government context supports tax/government ownership and a not-actionable ceiling.",
        permissionConsequences: ["Cannot be represented as removable processor fees."],
        limitations: [],
      }),
    );
  } else if (hasTaxGovernmentKeyword(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "unknown_needs_review",
        ownership: unknownOwnership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "blocking",
        confidence: "medium",
        sourceType: "safe_default",
        ruleId: "D-SAFE-TAX-GOV-KEYWORD-INSUFFICIENT",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D approved safe defaults.",
        reference: null,
        reason: "Tax/government/regulatory keywords are insufficient by themselves to prove government ownership.",
        permissionConsequences: ["Requires documentation.", "Cannot become potentially actionable in Package D."],
        limitations: ["Needs authoritative tax/government source evidence."],
      }),
    );
  }

  if (hasChargebackDisputeSignal(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "chargeback_or_dispute",
        ownership: merchantContractOwnership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "required_for_authority",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-CHARGEBACK-DISPUTE",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D contract-dependent safe default.",
        reference: null,
        reason: "Chargeback/dispute fees require dispute and contract context before actionability.",
        permissionConsequences: ["Verification-only in Package D."],
        limitations: [],
      }),
    );
  }

  if (hasFundingAdjustmentSignal(context)) {
    candidates.push(
      candidate(feeRowId, context, {
        category: "funding_adjustment",
        ownership: merchantContractOwnership,
        actionabilityCeiling: "verify_only",
        documentationRequirement: "required_for_authority",
        confidence: "high",
        sourceType: "deterministic_rule",
        ruleId: "D-OWN-FUNDING-ADJUSTMENT",
        ruleVersion: RULE_VERSION,
        ruleProvenance: "Package D contract-dependent safe default.",
        reference: null,
        reason: "Funding adjustments require reconciliation and contract evidence before actionability.",
        permissionConsequences: ["Verification-only in Package D."],
        limitations: [],
      }),
    );
  }

  return candidates;
}

function rowContext(rowId: string, ledger: CanonicalFeeLedger): RowContext {
  const row = ledger.rows.find((item) => item.id === rowId);
  const interpretations = (row?.parserInterpretationIds ?? [])
    .map((id) => ledger.parserInterpretations.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const occurrences = (row?.sourceOccurrenceIds ?? [])
    .map((id) => ledger.sourceOccurrences.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const label = row?.selectedLabel ?? interpretations[0]?.label ?? "Fee row";
  const section = interpretations.map((item) => item.section).filter(Boolean).join(" ");
  const occurrenceText = occurrences.map((item) => item.normalizedSourceText).filter(Boolean).join(" ");
  const combined = [label, section, occurrenceText].filter(Boolean).join(" ");
  const confidence = confidenceFromInterpretations(interpretations.map((item) => item.confidence));
  return {
    label,
    section,
    combined,
    normalizedLabel: normalize(label),
    normalizedCombined: normalize(combined),
    evidenceRefs: occurrences.map((item) => item.evidenceRef),
    confidence,
  };
}

function confidenceFromInterpretations(values: string[]): CanonicalFeeClassificationConfidence {
  if (values.includes("low") || values.includes("needs_review")) return "low";
  if (values.includes("medium") || values.length === 0) return "medium";
  return "high";
}

function candidate(
  feeRowId: string,
  context: RowContext,
  input: CandidateInput,
): CanonicalFeeClassificationCandidate {
  return {
    ...input,
    id: `feecand_${stableId([feeRowId, input.ruleId, input.category, input.actionabilityCeiling, input.confidence])}`,
    feeRowId,
    ownership: cloneOwnership(input.ownership),
    evidenceRefs: input.evidenceRefs ?? context.evidenceRefs,
    authoritative: input.authoritative ?? input.sourceType !== "ai_suggestion",
  };
}

function safeDefaultCandidate(feeRowId: string, evidenceRefs: string[], reason: string): CanonicalFeeClassificationCandidate {
  return {
    id: `feecand_${stableId([feeRowId, "D-SAFE-UNKNOWN", reason])}`,
    feeRowId,
    category: "unknown_needs_review",
    ownership: cloneOwnership(unknownOwnership),
    actionabilityCeiling: "unknown",
    documentationRequirement: "blocking",
    confidence: "low",
    sourceType: "safe_default",
    ruleId: "D-SAFE-UNKNOWN",
    ruleVersion: RULE_VERSION,
    ruleProvenance: "Package D approved safe defaults.",
    evidenceRefs,
    reference: null,
    authoritative: true,
    reason,
    permissionConsequences: ["Unknown ownership cannot become actionable or savings-eligible."],
    limitations: ["Requires stronger deterministic evidence or statement-specific human verification."],
  };
}

function overrideCandidatesForRow(feeRowId: string, overrides: CanonicalFeeHumanOverrideRecord[]): CanonicalFeeClassificationCandidate[] {
  return overrides
    .filter((override) => override.feeRowId === feeRowId && override.supersededByOverrideId === null)
    .map((override) => ({
      id: `feecand_${stableId([feeRowId, "human_override", override.id])}`,
      feeRowId,
      category: override.newClassification.category,
      ownership: cloneOwnership(override.newClassification.ownership),
      actionabilityCeiling: override.newClassification.actionabilityCeiling,
      documentationRequirement: override.newClassification.documentationRequirement,
      confidence: override.newClassification.confidence,
      sourceType: "human_override",
      ruleId: "D-HUMAN-STATEMENT-SPECIFIC-OVERRIDE",
      ruleVersion: RULE_VERSION,
      ruleProvenance: "Package D human override policy.",
      evidenceRefs: override.evidenceRefs,
      reference: null,
      authoritative: true,
      reason: override.reason,
      permissionConsequences: ["Statement-specific override applies only to this analysis and does not create a reusable rule."],
      limitations: ["Reusable rule promotion requires separate approval and tests."],
    }));
}

function resolution(input: {
  feeRowId: string;
  selected: CanonicalFeeClassificationCandidate;
  candidates: CanonicalFeeClassificationCandidate[];
  conflictStatus: CanonicalFeeClassificationResolution["conflictStatus"];
  conflictReason: string | null;
}): CanonicalFeeClassificationResolution {
  return {
    feeRowId: input.feeRowId,
    selected: selectedFromCandidate(
      input.selected,
      input.conflictStatus === "none"
        ? input.selected.reason
        : input.conflictReason ?? input.selected.reason,
      input.candidates.filter((candidate) => candidate.id !== input.selected.id).map((candidate) => candidate.id),
    ),
    candidates: input.candidates,
    conflictStatus: input.conflictStatus,
    conflictReason: input.conflictReason,
  };
}

function selectedFromCandidate(
  candidate: CanonicalFeeClassificationCandidate,
  selectionReason: string,
  rejectedCandidateIds: string[],
): CanonicalFeeSelectedClassification {
  return {
    candidateId: candidate.id,
    category: candidate.category,
    ownership: cloneOwnership(candidate.ownership),
    actionabilityCeiling: candidate.actionabilityCeiling,
    documentationRequirement: candidate.documentationRequirement,
    confidence: candidate.confidence,
    selectionReason,
    rejectedCandidateIds,
  };
}

function cloneOwnership(ownership: CanonicalFeeOwnership): CanonicalFeeOwnership {
  return {
    collector: ownership.collector,
    economicBeneficiary: ownership.economicBeneficiary,
    contractualController: ownership.contractualController,
  };
}

function candidateRank(candidate: CanonicalFeeClassificationCandidate): number {
  const sourceRank = candidate.sourceType === "human_override" ? 40 : candidate.sourceType === "deterministic_rule" ? 30 : candidate.sourceType === "safe_default" ? 20 : 0;
  const confidenceRank = candidate.confidence === "high" ? 3 : candidate.confidence === "medium" ? 2 : 1;
  return sourceRank + confidenceRank;
}

function hasMaterialConflict(candidates: CanonicalFeeClassificationCandidate[]): boolean {
  if (candidates.length <= 1) return false;
  const [first, ...rest] = candidates;
  return rest.some((candidate) => conflictsWith(first!, candidate));
}

function conflictsWith(left: CanonicalFeeClassificationCandidate, right: CanonicalFeeClassificationCandidate): boolean {
  return (
    left.category !== right.category ||
    left.actionabilityCeiling !== right.actionabilityCeiling ||
    left.ownership.collector !== right.ownership.collector ||
    left.ownership.economicBeneficiary !== right.ownership.economicBeneficiary ||
    left.ownership.contractualController !== right.ownership.contractualController
  );
}

function matchingReference(
  context: RowContext,
  rules: CanonicalFeeReferenceRuleInput[],
  statementPeriodStart: string | null | undefined,
): CanonicalFeeReferenceRuleInput | null {
  const matches = rules.filter((rule) => {
    const hasAlias = rule.aliases.some((alias) => normalize(alias) === context.normalizedLabel);
    if (!hasAlias) return false;
    return !rule.negativePatterns.some((pattern) => new RegExp(pattern, "i").test(context.combined));
  });
  return matches
    .sort((left, right) => Number(referencePeriodApplies(right, statementPeriodStart)) - Number(referencePeriodApplies(left, statementPeriodStart)) || left.referenceId.localeCompare(right.referenceId))[0] ?? null;
}

function referencePeriodApplies(rule: CanonicalFeeReferenceRuleInput, statementPeriodStart: string | null | undefined): boolean {
  if (!statementPeriodStart || !rule.effectiveFrom) return false;
  if (statementPeriodStart < rule.effectiveFrom) return false;
  if (rule.effectiveTo !== null && statementPeriodStart > rule.effectiveTo) return false;
  return true;
}

function ownershipForReference(owner: CanonicalFeeReferenceRuleInput["owner"]): CanonicalFeeOwnership {
  if (owner === "issuer_or_interchange") {
    return { collector: "processor", economicBeneficiary: "issuer_or_interchange", contractualController: "card_brand" };
  }
  if (owner === "tax_or_government") {
    return { collector: "processor", economicBeneficiary: "tax_or_government", contractualController: "tax_or_government" };
  }
  return { collector: "processor", economicBeneficiary: owner, contractualController: owner };
}

function hasInterchangeSectionEvidence(context: RowContext): boolean {
  return /\b(interchange charges?|program fees?)\b/.test(context.normalizedCombined);
}

function hasProvenNetworkContext(context: RowContext): boolean {
  const sectionBacked = /\b(card brand|card network|network fees?|program fees?|interchange charges?)\b/.test(normalize(context.section));
  const label = /\b(visa|mastercard|american express|amex|discover|nabu|dues|assessment|assessments|acquirer|network access|integrity)\b/.test(
    context.normalizedLabel,
  );
  return sectionBacked && label;
}

function hasNetworkAuthorizationSignal(context: RowContext): boolean {
  return /\b(auth|authorization|nabu|network access|acquirer|processor fee|integrity|kilobyte|base ii)\b/.test(context.normalizedCombined);
}

function hasNetworkLikeKeyword(context: RowContext): boolean {
  return /\b(network|assessment|assessments|dues|nabu|card brand|acquirer|access fee|interchange|program fees?)\b/.test(context.normalizedCombined);
}

function hasHighConfidenceProcessorMarkup(context: RowContext): boolean {
  if (context.confidence !== "high") return false;
  return /\b(qual disc|mqual disc|nqual disc|sales discount|non swiped discount|disc rate|processor markup|discount fee)\b/.test(context.normalizedCombined);
}

function hasHighConfidenceProcessorPerItem(context: RowContext): boolean {
  if (context.confidence !== "high") return false;
  return /\b(cpu gtwy|wats auth fee|batch header|gateway auth|processor auth fee|avs cpu|eci cpu)\b/.test(context.normalizedCombined);
}

function hasMediumConfidenceProcessorSignal(context: RowContext): boolean {
  if (context.confidence === "low") return false;
  return /\b(processor fee|service charges?|monthly fee|statement fee|admin(?:istrative)? fee|account fee|platform fee|gateway fee|other item fees|sales items)\b/.test(
    context.normalizedCombined,
  );
}

function hasThirdPartySignal(context: RowContext): boolean {
  return /\b(doordash|grubhub|uber eats|bentobox|online ordering|clover app|third party)\b/.test(context.normalizedCombined);
}

function hasComplianceSignal(context: RowContext): boolean {
  return /\b(non compliance|noncompliance|pci non compliance|pci non validated|non emv|nonemv|managed security|risk fee|security non validated)\b/.test(
    context.normalizedCombined,
  );
}

function hasEquipmentSignal(context: RowContext): boolean {
  return /\b(terminal lease|equipment lease|lease fee|rental|pin pad|pos lease)\b/.test(context.normalizedCombined);
}

function hasAuthoritativeTaxGovernmentEvidence(context: RowContext): boolean {
  return /\b(tax|government)\b/.test(context.normalizedCombined) && /\b(tax|government|state|local|federal)\b/.test(normalize(context.section));
}

function hasTaxGovernmentKeyword(context: RowContext): boolean {
  return /\b(tax|government|regulatory)\b/.test(context.normalizedCombined);
}

function hasChargebackDisputeSignal(context: RowContext): boolean {
  return /\b(chargeback|retrieval|dispute)\b/.test(context.normalizedCombined);
}

function hasFundingAdjustmentSignal(context: RowContext): boolean {
  return /\b(funding adjustment|express funding|ach reject|returns?)\b/.test(context.normalizedCombined);
}

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stableId(values: unknown[]): string {
  return values
    .map((value) => normalize(String(value ?? "")))
    .join("_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 96) || "unknown";
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted_api_key]")
    .replace(/\/Users\/[^\s]+/g, "[redacted_path]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function emptyLayer(reason: string): CanonicalFeeOwnershipActionability {
  return {
    policyVersion: FEE_OWNERSHIP_ACTIONABILITY_POLICY_VERSION,
    taxonomyVersion: FEE_TAXONOMY_VERSION,
    ruleRegistryVersion: FEE_OWNERSHIP_RULE_REGISTRY_VERSION,
    aiSuggestionPolicyVersion: FEE_AI_SUGGESTION_POLICY_VERSION,
    humanOverridePolicyVersion: FEE_HUMAN_OVERRIDE_POLICY_VERSION,
    status: "unavailable",
    rowClassifications: [],
    spreadAssertions: [],
    aiSuggestions: [],
    humanOverrides: [],
    limitations: [reason],
  };
}
