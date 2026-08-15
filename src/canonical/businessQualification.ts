import type { ParsedDocument } from "../parser.js";
import { candidate, ambiguousFact, selectedFact, unavailableFact } from "./facts.js";
import { makeEvidenceRecord } from "./evidence.js";
import { moneyFromNumber } from "./money.js";
import {
  loadQualifiedBenchmarkRegistry,
  validateQualifiedBenchmarkRegistry,
  type QualifiedBenchmarkRegistry,
  type QualifiedBenchmarkRegistryEntry,
} from "./qualifiedBenchmarkRegistry.js";
import type {
  CanonicalAnnualVolumeQualification,
  CanonicalAnnualVolumeTier,
  CanonicalBusinessAlternative,
  CanonicalBusinessConflict,
  CanonicalBusinessQualification,
  CanonicalBusinessRiskClass,
  CanonicalCalculationRecord,
  CanonicalCustomerRateComparison,
  CanonicalEvidenceRecord,
  CanonicalFactValue,
  CanonicalFinancialFacts,
  CanonicalProcessingChannel,
  CanonicalQualifiedRatePosition,
  CanonicalStatementIdentity,
} from "./types.js";

export const BUSINESS_QUALIFICATION_POLICY_VERSION = "canonical_business_qualification_v1" as const;

export type CanonicalBusinessProfileInput = {
  merchantDeclaration?: {
    selectedCategoryId?: string | null;
    freeTextDescription?: string | null;
  } | null;
  confirmation?: {
    confirmedSegmentId?: string | null;
    confirmedRiskClass?: Exclude<CanonicalBusinessRiskClass, "unknown"> | null;
    confirmedChannel?: Exclude<CanonicalProcessingChannel, "unknown"> | null;
    confirmedAnnualVolumeUsd?: number | null;
  } | null;
  market?: "US" | null;
  aiSuggestion?: {
    segmentId: string;
    confidence: "high" | "medium" | "low";
    reason: string;
  } | null;
};

export type BuildBusinessQualificationInput = {
  doc: ParsedDocument;
  matchedParserId: string | null;
  parserOutput: Record<string, unknown> | null;
  identity: CanonicalStatementIdentity;
  financialFacts: CanonicalFinancialFacts;
  profile?: CanonicalBusinessProfileInput | null;
  evidence: Map<string, CanonicalEvidenceRecord>;
  calculations: CanonicalCalculationRecord[];
  registry?: QualifiedBenchmarkRegistry;
};

export function buildBusinessQualificationAndRateComparison(
  input: BuildBusinessQualificationInput,
): { businessQualification: CanonicalBusinessQualification; rateComparison: CanonicalCustomerRateComparison } {
  const businessQualification = buildBusinessQualification(input);
  const rateComparison = buildQualifiedRateComparison({ ...input, businessQualification });
  return { businessQualification, rateComparison };
}

export function buildBusinessQualification(input: BuildBusinessQualificationInput): CanonicalBusinessQualification {
  const profile = input.profile ?? {};
  const declaration = profile.merchantDeclaration ?? {};
  const confirmation = profile.confirmation ?? {};
  const selectedCategoryId = normalizedValue(declaration.selectedCategoryId);
  const freeTextDescription = normalizedValue(declaration.freeTextDescription);
  const confirmedSegmentId = normalizedValue(confirmation.confirmedSegmentId);
  const declarationEvidenceRefs = addDeclarationEvidence(input, selectedCategoryId, freeTextDescription, confirmedSegmentId);
  const actualMcc = explicitMccFact(input);
  const selectedSegment = selectedCategoryId ? segmentForCategory(selectedCategoryId) : null;
  const freeTextSegment = freeTextDescription ? segmentForText(freeTextDescription) : null;
  const confirmedSegment = confirmedSegmentId && isKnownSegment(confirmedSegmentId) ? confirmedSegmentId : null;
  const mccSegment = actualMcc.value ? segmentForMcc(actualMcc.value) : null;
  const alternatives: CanonicalBusinessAlternative[] = [];
  const conflicts: CanonicalBusinessConflict[] = [];
  const deterministicSignals: string[] = [];

  if (selectedSegment) alternatives.push(alternative(selectedSegment, "merchant_declaration", "high", "Merchant-selected category mapping.", declarationEvidenceRefs, true));
  if (freeTextSegment) alternatives.push(alternative(freeTextSegment, "merchant_declaration", "high", "Merchant free-text description mapping.", declarationEvidenceRefs, true));
  if (mccSegment) alternatives.push(alternative(mccSegment, "account_mcc", "high", "Explicit statement MCC mapping.", actualMcc.evidenceRefs, true));
  if (actualMcc.status === "ambiguous") {
    conflicts.push({
      id: "conflict_multiple_explicit_mcc_values",
      kind: "mcc_conflict",
      material: true,
      reason: "The supported statement contains multiple distinct explicitly labeled MCC values.",
      evidenceRefs: actualMcc.evidenceRefs,
      alternatives: unique(actualMcc.candidates.map((candidate) => String(candidate.value))),
    });
  } else if (actualMcc.value && !mccSegment) {
    conflicts.push({
      id: "conflict_unmapped_explicit_mcc",
      kind: "mcc_conflict",
      material: true,
      reason: "The explicit account MCC is not covered by the approved deterministic segment mapping, so alignment with the merchant declaration cannot be confirmed.",
      evidenceRefs: actualMcc.evidenceRefs,
      alternatives: [actualMcc.value],
    });
  }

  const merchantName = input.identity.merchantName.value ?? "";
  const merchantNameSegment = segmentForText(merchantName);
  const merchantNameHighRisk = highRiskText(merchantName);
  if (merchantNameSegment) {
    alternatives.push(
      alternative(
        merchantNameSegment,
        "merchant_name_signal",
        merchantNameHighRisk ? "high" : "low",
        "Merchant-name signal retained as corroboration only.",
        input.identity.merchantName.evidenceRefs,
        false,
      ),
    );
  }
  if (profile.aiSuggestion?.segmentId && isKnownSegment(profile.aiSuggestion.segmentId)) {
    alternatives.push(
      alternative(
        profile.aiSuggestion.segmentId,
        "ai_suggestion",
        profile.aiSuggestion.confidence,
        sanitizeReason(profile.aiSuggestion.reason),
        [],
        false,
      ),
    );
    deterministicSignals.push("non_authoritative_ai_alternative_present");
  }

  let resolvedSegmentId = confirmedSegment;
  if (confirmedSegment) deterministicSignals.push("merchant_confirmation_selected_segment");
  if (!resolvedSegmentId) {
    if (selectedSegment && freeTextSegment && selectedSegment !== freeTextSegment) {
      const refined = broadSegmentCanBeRefined(selectedSegment, freeTextSegment) ? freeTextSegment : null;
      if (refined) {
        resolvedSegmentId = refined;
        deterministicSignals.push("merchant_free_text_refined_broad_selection");
      } else {
        conflicts.push({
          id: "conflict_declaration_selected_vs_description",
          kind: "declaration_conflict",
          material: true,
          reason: "The merchant-selected category and free-text description map to materially different comparison segments.",
          evidenceRefs: declarationEvidenceRefs,
          alternatives: unique([selectedSegment, freeTextSegment]),
        });
      }
    } else {
      resolvedSegmentId = freeTextSegment ?? selectedSegment;
    }
  }

  if (!resolvedSegmentId && mccSegment) {
    conflicts.push({
      id: "conflict_mcc_without_declaration",
      kind: "mcc_conflict",
      material: true,
      reason: "An explicit account MCC is available, but account coding alone does not establish what the merchant says the business does.",
      evidenceRefs: actualMcc.evidenceRefs,
      alternatives: [mccSegment],
    });
  }

  if (resolvedSegmentId && mccSegment && resolvedSegmentId !== mccSegment) {
    const resolvedByConfirmation = confirmedSegment === resolvedSegmentId;
    conflicts.push({
      id: "conflict_declaration_vs_mcc",
      kind: "mcc_conflict",
      material: !resolvedByConfirmation,
      reason: resolvedByConfirmation
        ? "Merchant confirmation resolved a difference between declared business activity and explicit account MCC coding."
        : "Merchant-declared business activity conflicts with the explicit account MCC coding.",
      evidenceRefs: unique([...declarationEvidenceRefs, ...actualMcc.evidenceRefs]),
      alternatives: unique([resolvedSegmentId, mccSegment]),
    });
  }

  const mccHighRisk = actualMcc.value ? highRiskMcc(actualMcc.value) : false;
  const declarationHighRisk = resolvedSegmentId === "high_risk_retail" || (freeTextDescription ? highRiskText(freeTextDescription) : false);
  const strongHighRiskSignal = declarationHighRisk || mccHighRisk || merchantNameHighRisk;
  const confirmedRiskClass = confirmation.confirmedRiskClass ?? null;
  const resolvedRiskClass: CanonicalBusinessRiskClass = confirmedRiskClass ?? (declarationHighRisk ? "high_risk" : strongHighRiskSignal ? "unknown" : resolvedSegmentId ? "standard" : "unknown");
  if (strongHighRiskSignal) deterministicSignals.push("high_risk_signal_present");
  if (resolvedSegmentId && resolvedSegmentId !== "high_risk_retail" && strongHighRiskSignal && !confirmedRiskClass) {
    conflicts.push({
      id: "conflict_standard_vs_high_risk_signal",
      kind: "high_risk_conflict",
      material: true,
      reason: "Standard-risk merchant declaration conflicts with strong high-risk account or statement context.",
      evidenceRefs: unique([...declarationEvidenceRefs, ...actualMcc.evidenceRefs, ...input.identity.merchantName.evidenceRefs]),
      alternatives: unique([resolvedSegmentId, "high_risk_retail"]),
    });
  }

  const channel = resolveChannel(input, confirmation.confirmedChannel ?? null);
  const annualVolume = resolveAnnualVolume(input, confirmation.confirmedAnnualVolumeUsd ?? null);
  const processorIsFiserv = /fiserv|first data/i.test(input.identity.processorFamily.value ?? input.identity.processorName.value ?? "");
  const processorFamily = {
    value: processorIsFiserv ? ("fiserv" as const) : ("unknown" as const),
    status: processorIsFiserv ? ("qualified" as const) : ("unavailable" as const),
    confidence: processorIsFiserv ? ("high" as const) : ("low" as const),
    source: "canonical_statement_identity",
    evidenceRefs: unique([...input.identity.processorFamily.evidenceRefs, ...input.identity.processorName.evidenceRefs]),
    limitations: processorIsFiserv ? [] : ["Package 1 supports qualified comparisons only for Fiserv-family statements."],
  };
  const marketIsUs = profile.market === "US" && processorIsFiserv;
  const market = {
    value: marketIsUs ? ("US" as const) : ("unknown" as const),
    status: marketIsUs ? ("qualified" as const) : ("unavailable" as const),
    confidence: marketIsUs ? ("high" as const) : ("low" as const),
    source: profile.market === "US" ? "u_s_product_scope" : "not_supplied",
    evidenceRefs: marketIsUs ? processorFamily.evidenceRefs : [],
    limitations: marketIsUs ? [] : ["U.S. market applicability was not established by the Package 1 input contract."],
  };
  const risk = {
    value: resolvedRiskClass,
    status: resolvedRiskClass === "unknown" ? ("confirmation_required" as const) : ("qualified" as const),
    confidence: confirmedRiskClass || declarationHighRisk ? ("high" as const) : resolvedRiskClass === "standard" ? ("medium" as const) : ("low" as const),
    source: confirmedRiskClass ? "merchant_confirmation" : declarationHighRisk ? "merchant_declaration" : "approved_deterministic_risk_policy",
    evidenceRefs: unique([...declarationEvidenceRefs, ...actualMcc.evidenceRefs]),
    limitations: resolvedRiskClass === "unknown" ? ["Risk class requires merchant confirmation before comparison."] : [],
  };

  const materialConflicts = conflicts.filter((conflict) => conflict.material);
  const missingDeclaration = !confirmedSegment && !selectedSegment && !freeTextSegment;
  const confirmationReason =
    materialConflicts[0]?.id ??
    (missingDeclaration ? "business_declaration_required" : null) ??
    (channel.status !== "qualified" ? "processing_channel_confirmation_required" : null) ??
    (annualVolume.status === "confirmation_required" ? "annual_volume_confirmation_required" : null) ??
    (risk.status !== "qualified" ? "risk_class_confirmation_required" : null);
  const hardUnavailable = processorFamily.status !== "qualified" || market.status !== "qualified" || annualVolume.status === "unavailable";
  const status = hardUnavailable ? "unavailable" : confirmationReason ? "confirmation_required" : resolvedSegmentId ? "qualified" : "unavailable";
  const evidenceRefs = unique([
    ...declarationEvidenceRefs,
    ...actualMcc.evidenceRefs,
    ...risk.evidenceRefs,
    ...channel.evidenceRefs,
    ...annualVolume.evidenceRefs,
    ...market.evidenceRefs,
    ...processorFamily.evidenceRefs,
  ]);

  return {
    policyVersion: BUSINESS_QUALIFICATION_POLICY_VERSION,
    status,
    confidence: status === "qualified" ? (confirmedSegment ? "high" : "medium") : "low",
    merchantDeclaration: {
      selectedCategoryId,
      freeTextDescription,
      confirmedSegmentId: confirmedSegment,
      evidenceRefs: declarationEvidenceRefs,
    },
    accountCoding: {
      actualMcc,
      source: actualMcc.status === "selected" ? "explicit_statement" : actualMcc.status === "ambiguous" ? "conflicting_statement_values" : "not_available",
    },
    resolvedSegmentId,
    risk,
    channel,
    annualVolume,
    market,
    processorFamily,
    deterministicSignals: unique(deterministicSignals).sort(),
    alternatives: dedupeAlternatives(alternatives),
    conflicts,
    confirmationRequirement: confirmationReason
      ? {
          reasonCode: confirmationReason,
          prompt: confirmationPrompt(confirmationReason),
          allowedSegmentIds: unique(alternatives.map((alternative) => alternative.segmentId)).sort(),
          allowedRiskClasses: ["standard", "high_risk"],
          allowedChannels: ["card_present", "card_not_present", "mixed"],
        }
      : null,
    evidenceRefs,
    limitations: unique([
      "Merchant declaration and actual MCC account coding are preserved as separate facts.",
      "One statement provides a snapshot; annualized volume is used only for benchmark segmentation.",
      ...(status === "unavailable" ? ["Business qualification is unavailable for a merchant-facing benchmark."] : []),
    ]),
    aiAuthoritative: false,
  };
}

export function buildQualifiedRateComparison(
  input: BuildBusinessQualificationInput & { businessQualification: CanonicalBusinessQualification },
): CanonicalCustomerRateComparison {
  const qualification = input.businessQualification;
  if (qualification.status === "confirmation_required") {
    return unavailableComparison("confirmation_required", qualification.confirmationRequirement?.reasonCode ?? "business_confirmation_required", qualification.evidenceRefs);
  }
  if (qualification.status !== "qualified") {
    return unavailableComparison("unavailable", "business_qualification_unavailable", qualification.evidenceRefs);
  }
  if (
    input.financialFacts.processedSales.status !== "selected" ||
    input.financialFacts.totalFees.status !== "selected" ||
    input.financialFacts.rateRevealCalculatedAllInRate.status !== "selected" ||
    input.financialFacts.rateRevealCalculatedAllInRate.value === null ||
    input.financialFacts.effectiveRateBasis.populationCompatibility !== "compatible"
  ) {
    return unavailableComparison("unavailable", "verified_effective_rate_basis_unavailable", qualification.evidenceRefs);
  }

  let registry: QualifiedBenchmarkRegistry;
  try {
    registry = input.registry ? validateQualifiedBenchmarkRegistry(input.registry) : loadQualifiedBenchmarkRegistry();
  } catch {
    return unavailableComparison("unavailable", "qualified_benchmark_registry_invalid", qualification.evidenceRefs);
  }
  const period = input.identity.statementPeriod.value;
  if (!period) return unavailableComparison("unavailable", "statement_period_unavailable", qualification.evidenceRefs);
  const entry = uniqueApplicableEntry(registry, qualification, period);
  if (!entry) return unavailableComparison("unavailable", "qualified_reference_not_available_for_factors_or_period", qualification.evidenceRefs);

  const sourceRecords = entry.sourceIds.map((sourceId, index) => {
    const source = registry.sourceRecords.find((candidate) => candidate.sourceId === sourceId)!;
    const evidence = makeEvidenceRecord({
      documentId: registry.registryId,
      pageNumber: null,
      rowIndex: index,
      section: entry.referenceId,
      extractedText: `${source.title}. ${source.supportedClaim}`,
      sourceRole: "benchmark_reference",
      confidence: entry.confidence,
      extractionMethod: "reference_registry",
    });
    input.evidence.set(evidence.id, evidence);
    return { ...source, evidenceRef: evidence.id };
  });
  const calculationRef = `calc_benchmark_rate_position_${entry.referenceId}`;
  const effectiveRate = input.financialFacts.rateRevealCalculatedAllInRate.value;
  const position = positionFor(effectiveRate, entry);
  const financialEvidenceRefs = unique([
    ...input.financialFacts.processedSales.evidenceRefs,
    ...input.financialFacts.totalFees.evidenceRefs,
    ...input.financialFacts.rateRevealCalculatedAllInRate.evidenceRefs,
  ]);
  input.calculations.push({
    id: calculationRef,
    formulaCode: "benchmark_rate_position",
    formulaVersion: "canonical_customer_benchmark_policy_v1",
    inputs: [
      { label: "Verified effective rate", value: effectiveRate, unit: "decimal_rate", evidenceRefs: financialEvidenceRefs },
      { label: "Reference range lower boundary", value: entry.range.low, unit: "decimal_rate", evidenceRefs: sourceRecords.map((source) => source.evidenceRef) },
      { label: "Reference range upper boundary", value: entry.range.high, unit: "decimal_rate", evidenceRefs: sourceRecords.map((source) => source.evidenceRef) },
    ],
    result: effectiveRate,
    unit: "decimal_rate",
    roundingPolicy: "decimal_rate_6_places_v1",
  });
  const evidenceRefs = unique([...qualification.evidenceRefs, ...financialEvidenceRefs, ...sourceRecords.map((source) => source.evidenceRef)]);
  return {
    policyVersion: "canonical_customer_benchmark_policy_v1",
    status: "qualified",
    position,
    benchmarkRef: {
      referenceId: entry.referenceId,
      version: registry.version,
      effectiveFrom: entry.effectiveFrom,
      effectiveTo: entry.effectiveTo,
      applicableProcessor: entry.applicableProcessor,
      applicableBusinessType: entry.segmentId,
      applicableChannel: entry.channel,
      applicableCardEnvironment: null,
      market: "US",
      segmentId: entry.segmentId,
      riskClass: entry.riskClass,
      channel: entry.channel,
      annualVolumeTier: entry.annualVolumeTier,
      range: entry.range,
      confidence: entry.confidence,
      sourceRecords,
      methodology: entry.methodology,
      limitations: entry.limitations,
      evidenceRefs: sourceRecords.map((source) => source.evidenceRef),
      qualified: true,
      opportunityApproved: false,
      aiSourced: false,
    },
    calculationRef,
    evidenceRefs,
    reasonCodes: ["qualified_benchmark_reference", `rate_${position}`],
    aiSourced: false,
  };
}

function unavailableComparison(
  status: "confirmation_required" | "unavailable",
  reasonCode: string,
  evidenceRefs: string[],
): CanonicalCustomerRateComparison {
  return {
    policyVersion: "canonical_customer_benchmark_policy_v1",
    status,
    position: "unavailable",
    benchmarkRef: null,
    calculationRef: null,
    evidenceRefs: unique(evidenceRefs),
    reasonCodes: [reasonCode],
    aiSourced: false,
  };
}

function uniqueApplicableEntry(
  registry: QualifiedBenchmarkRegistry,
  qualification: CanonicalBusinessQualification,
  period: { start: string; end: string },
): QualifiedBenchmarkRegistryEntry | null {
  const matches = registry.entries.filter(
    (entry) =>
      entry.merchantDisplayEligible &&
      entry.segmentId === qualification.resolvedSegmentId &&
      entry.riskClass === qualification.risk.value &&
      entry.channel === qualification.channel.value &&
      entry.annualVolumeTier === qualification.annualVolume.tier &&
      entry.applicableProcessor === qualification.processorFamily.value &&
      registry.market === qualification.market.value &&
      period.start >= entry.effectiveFrom &&
      period.end <= entry.effectiveTo,
  );
  return matches.length === 1 ? matches[0]! : null;
}

function positionFor(effectiveRate: string, entry: QualifiedBenchmarkRegistryEntry): CanonicalQualifiedRatePosition {
  const rate = Number(effectiveRate);
  const low = Number(entry.range.low);
  const high = Number(entry.range.high);
  if (rate < low) return "below_reference";
  if (rate <= high) return "within_reference";
  return "above_reference";
}

function explicitMccFact(input: BuildBusinessQualificationInput): CanonicalFactValue<string | null> {
  if (!input.matchedParserId || !/fiserv|first_data/i.test(input.matchedParserId)) {
    return unavailableFact<string | null>("Actual MCC is unavailable because no supported Fiserv-family parser was selected.");
  }
  const matches: Array<{ mcc: string; evidenceRef: string; rowIndex: number }> = [];
  for (const [rowIndex, row] of input.doc.rows.entries()) {
    const text = String(row.content ?? "").replace(/\s+/g, " ").trim();
    const mcc = explicitMccFromText(text);
    if (!mcc) continue;
    const evidence = makeEvidenceRecord({
      documentId: input.identity.sourceDocumentRef,
      pageNumber: pageNumber(row.page),
      rowIndex,
      section: "statement_identity",
      extractedText: text,
      sourceRole: "account_coding",
      confidence: "high",
      extractionMethod: "pdf_text",
    });
    input.evidence.set(evidence.id, evidence);
    matches.push({ mcc, evidenceRef: evidence.id, rowIndex });
  }
  const uniqueMccs = unique(matches.map((match) => match.mcc));
  if (uniqueMccs.length === 0) {
    return unavailableFact<string | null>("No explicit MCC was safely identified on this supported statement.");
  }
  const candidates = uniqueMccs.map((mcc) => {
    const refs = matches.filter((match) => match.mcc === mcc).map((match) => match.evidenceRef);
    return candidate<string | null>({
      id: `candidate_actual_mcc_${mcc}`,
      role: "account_coding",
      value: mcc,
      evidenceRefs: refs,
      parserId: input.matchedParserId,
      parserVersion: null,
      extractionMethod: "pdf_text",
      confidence: "high",
      selected: uniqueMccs.length === 1,
      selectionReason: uniqueMccs.length === 1 ? "Selected from an explicitly labeled MCC field on the supported statement." : null,
      rejectionReason: uniqueMccs.length === 1 ? null : "Conflicting explicitly labeled MCC values require review.",
    });
  });
  if (uniqueMccs.length > 1) return ambiguousFact("Conflicting explicitly labeled MCC values were found on the statement.", candidates);
  return selectedFact({
    value: uniqueMccs[0]!,
    confidence: "high",
    evidenceRefs: candidates[0]!.evidenceRefs,
    selectionReason: "Selected from an explicitly labeled MCC field on the supported statement.",
    candidates,
    selectedCandidateId: candidates[0]!.id,
  });
}

function explicitMccFromText(text: string): string | null {
  const direct = text.match(/^\s*(?:MERCHANT\s+CATEGORY(?:\s+CODE)?|MCC(?:\s+CODE)?)\s*(?::|#|-|IS)?\s*(\d{4})\s*$/i);
  if (direct?.[1] && direct[1] !== "0000") return direct[1];
  const cells = text.split("|").map((cell) => cell.trim()).filter(Boolean);
  for (let index = 0; index < cells.length - 1; index += 1) {
    if (/^(?:MERCHANT\s+CATEGORY(?:\s+CODE)?|MCC(?:\s+CODE)?)$/i.test(cells[index]!) && /^\d{4}$/.test(cells[index + 1]!) && cells[index + 1] !== "0000") {
      return cells[index + 1]!;
    }
  }
  return null;
}

function resolveChannel(
  input: BuildBusinessQualificationInput,
  confirmedChannel: Exclude<CanonicalProcessingChannel, "unknown"> | null,
): CanonicalBusinessQualification["channel"] {
  if (confirmedChannel) {
    const refs = addConfirmationEvidence(input, `Confirmed processing channel: ${confirmedChannel}`);
    return { value: confirmedChannel, status: "qualified", confidence: "high", source: "merchant_confirmation", evidenceRefs: refs, limitations: [] };
  }
  const analysis = asRecord(input.parserOutput?.fiservFeeAnalysisV2);
  const channelAnalysis = asRecord(analysis.merchantChannelAnalysis);
  const channel = channelAnalysis.merchantChannel;
  const status = channelAnalysis.status;
  const confidence = channelAnalysis.confidence;
  if ((channel === "card_present" || channel === "card_not_present" || channel === "mixed") && status === "detected" && (confidence === "high" || confidence === "medium")) {
    const signals = Array.isArray(channelAnalysis.signals) ? channelAnalysis.signals.map(asRecord) : [];
    const refs = signals.slice(0, 8).map((signal, index) => {
      const evidence = makeEvidenceRecord({
        documentId: input.identity.sourceDocumentRef,
        pageNumber: null,
        rowIndex: typeof signal.rowIndex === "number" ? signal.rowIndex : index,
        section: "processing_channel",
        extractedText: typeof signal.evidenceLine === "string" ? signal.evidenceLine : String(signal.description ?? "Statement channel signal"),
        sourceRole: "selected_fact",
        confidence,
        extractionMethod: "pdf_text",
      });
      input.evidence.set(evidence.id, evidence);
      return evidence.id;
    });
    return { value: channel, status: "qualified", confidence, source: "statement_channel_signals", evidenceRefs: unique(refs), limitations: [] };
  }
  return {
    value: "unknown",
    status: "confirmation_required",
    confidence: "low",
    source: "statement_channel_not_detected",
    evidenceRefs: [],
    limitations: ["No sufficiently strong statement signal established card-present, card-not-present, or mixed processing."],
  };
}

function resolveAnnualVolume(input: BuildBusinessQualificationInput, confirmedAnnualVolumeUsd: number | null): CanonicalAnnualVolumeQualification {
  if (confirmedAnnualVolumeUsd !== null && Number.isFinite(confirmedAnnualVolumeUsd) && confirmedAnnualVolumeUsd > 0) {
    const money = moneyFromNumber(confirmedAnnualVolumeUsd)!;
    const refs = addConfirmationEvidence(input, "Merchant confirmed annual processing-volume tier input.");
    return {
      value: money,
      tier: annualVolumeTier(money.amountMinor),
      status: "qualified",
      confidence: "high",
      source: "confirmed_annual_volume",
      statementMonthsUsed: null,
      evidenceRefs: refs,
      limitations: ["Confirmed annual volume is used only for benchmark segmentation, not savings or forecasting."],
    };
  }
  const period = input.identity.statementPeriod.value;
  const processedSales = input.financialFacts.processedSales.value;
  if (input.identity.statementPeriod.status !== "selected" || !period || input.financialFacts.processedSales.status !== "selected" || !processedSales) {
    return unavailableAnnualVolume("Verified statement-period sales and dates are required for annual-volume segmentation.");
  }
  const days = inclusiveDays(period.start, period.end);
  if (days === null || days < 28 || days > 31) return unavailableAnnualVolume("Only a verified 28–31 day statement can use the statement-month × 12 volume policy.");
  const annualAmountMinor = processedSales.amountMinor * 12;
  if (!Number.isSafeInteger(annualAmountMinor) || annualAmountMinor <= 0) return unavailableAnnualVolume("Annualized volume could not be calculated safely.");
  const tier = annualVolumeTier(annualAmountMinor);
  const boundary = nearTierBoundary(annualAmountMinor);
  return {
    value: { amountMinor: annualAmountMinor, currency: "USD" },
    tier,
    status: boundary ? "confirmation_required" : "qualified",
    confidence: boundary ? "low" : "medium",
    source: "statement_month_x12",
    statementMonthsUsed: 1,
    evidenceRefs: unique([...input.financialFacts.processedSales.evidenceRefs, ...input.identity.statementPeriod.evidenceRefs]),
    limitations: [
      "Annualized volume equals verified statement-month processed sales × 12 and is used only to select a benchmark tier.",
      ...(boundary ? ["The estimate is within 5% of a benchmark tier boundary and requires confirmation."] : []),
    ],
  };
}

function unavailableAnnualVolume(reason: string): CanonicalAnnualVolumeQualification {
  return {
    value: null,
    tier: "unknown",
    status: "unavailable",
    confidence: "low",
    source: "not_available",
    statementMonthsUsed: null,
    evidenceRefs: [],
    limitations: [reason],
  };
}

function addDeclarationEvidence(
  input: BuildBusinessQualificationInput,
  selectedCategoryId: string | null,
  freeTextDescription: string | null,
  confirmedSegmentId: string | null,
): string[] {
  const values = [
    selectedCategoryId ? `Merchant selected category: ${selectedCategoryId}` : null,
    freeTextDescription ? `Merchant business description: ${freeTextDescription}` : null,
    confirmedSegmentId ? `Merchant confirmed comparison segment: ${confirmedSegmentId}` : null,
  ].filter((value): value is string => Boolean(value));
  return values.map((value, rowIndex) => {
    const evidence = makeEvidenceRecord({
      documentId: input.identity.sourceDocumentRef,
      pageNumber: null,
      rowIndex,
      section: "merchant_declaration",
      extractedText: value,
      sourceRole: "merchant_declaration",
      confidence: "high",
      extractionMethod: "manual_input",
    });
    input.evidence.set(evidence.id, evidence);
    return evidence.id;
  });
}

function addConfirmationEvidence(input: BuildBusinessQualificationInput, text: string): string[] {
  const evidence = makeEvidenceRecord({
    documentId: input.identity.sourceDocumentRef,
    pageNumber: null,
    rowIndex: null,
    section: "merchant_confirmation",
    extractedText: text,
    sourceRole: "merchant_declaration",
    confidence: "high",
    extractionMethod: "manual_input",
  });
  input.evidence.set(evidence.id, evidence);
  return [evidence.id];
}

function segmentForCategory(categoryId: string): string | null {
  const normalized = normalize(categoryId);
  const map: Record<string, string | null> = {
    restaurant: "restaurant_food_service",
    restaurant_food_beverage: "restaurant_food_service",
    restaurant_food_service: "restaurant_food_service",
    grocery: "grocery_specialty_food",
    grocery_specialty_food: "grocery_specialty_food",
    specialty_grocery: "grocery_specialty_food",
    retail: "general_retail",
    general_retail: "general_retail",
    professional: "professional_services",
    professional_services: "professional_services",
    healthcare: "professional_services",
    veterinary: "professional_services",
    auto: "auto_repair",
    auto_repair: "auto_repair",
    gas: "gas_petroleum",
    gas_petroleum: "gas_petroleum",
    hospitality: "lodging",
    lodging: "lodging",
    ecommerce: "general_retail",
    mobile_phone_repair: "mobile_phone_repair",
    smoke: "high_risk_retail",
    smoke_vape_cbd: "high_risk_retail",
    high_risk: "high_risk_retail",
    high_risk_retail: "high_risk_retail",
    other: null,
    default: null,
  };
  return Object.hasOwn(map, normalized) ? map[normalized]! : null;
}

function segmentForText(value: string): string | null {
  const text = normalize(value).replace(/_/g, " ");
  if (highRiskText(text)) return "high_risk_retail";
  if (/\b(?:mobile|cell)\s*(?:phone)?\s*repair\b|\bphone\s*repair\b/.test(text)) return "mobile_phone_repair";
  if (/\bauto(?:mobile)?\s*(?:repair|service)|\bmechanic|\bbody\s*shop|\btire\s*shop/.test(text)) return "auto_repair";
  if (/\bveterinar|\bvet\s+(?:clinic|hospital)/.test(text)) return "professional_services";
  if (/\bgrocery|\bsupermarket|\bspecialty\s+(?:food|market)|\bfish\s+market|\bmeat\s+market/.test(text)) return "grocery_specialty_food";
  if (/\brestaurant|\bresturant|\btaqueria|\bmexican|\bpizzeria|\bcafe|\bdiner|\bbar\s+and\s+grill/.test(text)) return "restaurant_food_service";
  if (/\bgas\s+station|\bpetroleum|\bfuel\s+station/.test(text)) return "gas_petroleum";
  if (/\bhotel|\bmotel|\binn\b|\bresort|\blodging/.test(text)) return "lodging";
  if (/\becommerce|\be-commerce|\bonline\s+(?:shop|store)/.test(text)) return "general_retail";
  if (/\bretail|\bstore|\bshop\b/.test(text)) return "general_retail";
  return null;
}

function segmentForMcc(mcc: string): string | null {
  const value = Number(mcc);
  if ([5812, 5813, 5814].includes(value)) return "restaurant_food_service";
  if ([5411, 5421, 5422, 5441, 5451, 5462, 5499].includes(value)) return "grocery_specialty_food";
  if ([5993, 5194, 5192].includes(value)) return "high_risk_retail";
  if ([5541, 5542].includes(value)) return "gas_petroleum";
  if ([7011, 7012, 7032, 7033].includes(value)) return "lodging";
  if ([5511, 5521, 5531, 5532, 5533, 5571, 5599, 7531, 7534, 7535, 7538, 7542, 7549].includes(value)) return "auto_repair";
  if ([8011, 8021, 8031, 8041, 8042, 8043, 8049, 8050, 8062, 8071, 8099, 8111, 8911, 8931, 8999].includes(value)) return "professional_services";
  return null;
}

function highRiskMcc(mcc: string): boolean {
  return [5993, 5194, 5192].includes(Number(mcc));
}

function highRiskText(value: string): boolean {
  return /\b(?:smoke|vape|vaping|vapor|cbd|hemp|cannabis|dispensary|tobacco|tobacconist|cigar|hookah|delta[ -]?[89]|kratom|head shop)\b/i.test(value);
}

function broadSegmentCanBeRefined(selected: string, described: string): boolean {
  if (selected === described) return true;
  if (selected === "general_retail" && ["grocery_specialty_food", "mobile_phone_repair", "gas_petroleum", "auto_repair"].includes(described)) return true;
  if (selected === "professional_services" && described === "professional_services") return true;
  return false;
}

function annualVolumeTier(amountMinor: number): CanonicalAnnualVolumeTier {
  const dollars = amountMinor / 100;
  if (dollars < 100_000) return "under_100k";
  if (dollars < 500_000) return "100k_500k";
  if (dollars < 2_000_000) return "500k_2m";
  if (dollars < 10_000_000) return "2m_10m";
  return "over_10m";
}

function nearTierBoundary(amountMinor: number): boolean {
  const dollars = amountMinor / 100;
  return [100_000, 500_000, 2_000_000, 10_000_000].some((boundary) => Math.abs(dollars - boundary) <= boundary * 0.05);
}

function inclusiveDays(start: string, end: string): number | null {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

function pageNumber(page: unknown): number | null {
  const match = String(page ?? "").match(/page-(\d+)/i);
  return match ? Number(match[1]) : null;
}

function alternative(
  segmentId: string,
  source: CanonicalBusinessAlternative["source"],
  confidence: CanonicalBusinessAlternative["confidence"],
  reason: string,
  evidenceRefs: string[],
  authoritative: boolean,
): CanonicalBusinessAlternative {
  return { segmentId, source, confidence, authoritative, reason, evidenceRefs: unique(evidenceRefs) };
}

function dedupeAlternatives(alternatives: CanonicalBusinessAlternative[]): CanonicalBusinessAlternative[] {
  const result: CanonicalBusinessAlternative[] = [];
  for (const alternative of alternatives) {
    if (!result.some((existing) => existing.segmentId === alternative.segmentId && existing.source === alternative.source)) result.push(alternative);
  }
  return result;
}

function confirmationPrompt(reasonCode: string): string {
  if (reasonCode.includes("channel")) return "Confirm whether transactions are primarily card-present, card-not-present, or mixed.";
  if (reasonCode.includes("annual_volume")) return "Confirm the merchant's approximate annual card-processing volume.";
  if (reasonCode.includes("risk")) return "Confirm the business activity and risk context before RateReveal selects a comparison segment.";
  return "Confirm which business description best represents what the merchant actually sells or does.";
}

function isKnownSegment(value: string): boolean {
  return [
    "restaurant_food_service",
    "grocery_specialty_food",
    "general_retail",
    "professional_services",
    "gas_petroleum",
    "lodging",
    "auto_repair",
    "mobile_phone_repair",
    "high_risk_retail",
  ].includes(value);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizedValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 240) : null;
}

function sanitizeReason(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240) || "AI supplied a non-authoritative category alternative.";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
