import type { BusinessTypeId } from "../businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../canonical/buildCanonicalFacts.js";
import { normalizeEvidenceText } from "../canonical/evidence.js";
import type { CanonicalFactValue, CanonicalStatementAnalysis, MoneyAmount } from "../canonical/types.js";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "../fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../genericFiservStatementParser.js";
import { fiservParserOutputSchema } from "../fiservParserOutputSchema.js";
import type { ParsedDocument } from "../parser.js";
import type { ParserDriver } from "../parserFoundation.js";
import {
  CONTEXTUAL_ASSESSMENT_VERSION,
  FACT_PACKET_VERSION,
  MODELED_SCENARIO_VERSION,
  type FiservContextualAssessmentV1,
  type FiservFactPacketV1,
  type FiservModeledScenarioV1,
  type ProductRateChangeAssumptionV1,
  type ProofFact,
} from "./contracts.js";
import { VISIBLE_FISERV_PRICING_REVIEW_V1 } from "./knowledge.js";

const FISERV_DRIVERS: ParserDriver[] = [
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
  genericFiservStatementDriver,
];

export type OfflineFiservProof = {
  factPacket: FiservFactPacketV1;
  contextualAssessment: FiservContextualAssessmentV1;
  modeledScenario: FiservModeledScenarioV1;
};

/** Offline only: calls deterministic parsers, never legacy analysis, AI, storage, or reports. */
export function buildOfflineFiservProof(input: {
  document: ParsedDocument;
  sourceFileName: string;
  businessType: BusinessTypeId;
  scenarioAssumption: ProductRateChangeAssumptionV1;
}): OfflineFiservProof {
  const parserOutput = validatedFiservParserOutput(input.document, input.sourceFileName, input.businessType);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(input.document, {
    sourceFileName: input.sourceFileName,
    businessType: input.businessType,
  });
  const factPacket = buildFiservFactPacket({ analysis, parserOutput });
  return {
    factPacket,
    contextualAssessment: assessVisiblePricingForReview(factPacket),
    modeledScenario: modelRateChangeScenario(factPacket, input.scenarioAssumption),
  };
}

export function buildFiservFactPacket(input: {
  analysis: CanonicalStatementAnalysis;
  parserOutput: Record<string, unknown> | null;
}): FiservFactPacketV1 {
  const { analysis } = input;
  const checkedParser = input.parserOutput ? fiservParserOutputSchema.safeParse(input.parserOutput) : null;
  const parser = checkedParser?.success ? checkedParser.data as Record<string, unknown> : null;
  const identity = record(parser?.statementIdentity);
  const selected = record(parser?.selectedFinancials);
  const decision = record(parser?.decision);
  const reconciliation = record(parser?.reconciliation);
  const pricing = record(parser?.pricingModel);
  const period = analysis.identity.statementPeriod;
  const volume = analysis.financialFacts.processedSales;
  const fees = analysis.financialFacts.totalFees;
  const rate = analysis.financialFacts.rateRevealCalculatedAllInRate;
  const basis = analysis.financialFacts.effectiveRateBasis;
  const sourceOccurrences = new Map(analysis.feeLedger.sourceOccurrences.map((item) => [item.id, item.evidenceRef]));
  const evidenceIds = new Set(analysis.evidence.map((item) => item.id));
  const visibleRows = analysis.feeLedger.rows
    .filter((row) => (row.role === "individual_charge" || row.role === "interchange_detail_row") && row.contributesToUniqueTotal && row.selectedAmount !== null && row.selectedAmount.amountMinor > 0)
    .map((row) => ({
      feeRowId: row.id,
      amount: row.selectedAmount!,
      evidenceRefs: unique(row.sourceOccurrenceIds.map((id) => sourceOccurrences.get(id)).filter((id): id is string => Boolean(id && evidenceIds.has(id)))),
    }))
    .filter((row) => row.evidenceRefs.length > 0);
  const rawPricingModel = string(pricing?.pricingModel);
  const pricingModel = rawPricingModel === "unknown" ? null : rawPricingModel;
  const pricingEvidence = arrayOfRecords(pricing?.evidence).flatMap((item) => {
    const line = string(item.evidenceLine);
    if (!line) return [];
    const normalized = normalizeEvidenceText(line);
    return analysis.evidence.filter((entry) => entry.normalizedText === normalized).map((entry) => entry.id);
  });
  const transactionCount = compatibleTransactionCount(analysis);
  const selectedTotalsAgreeWithParser =
    moneyMatchesNumber(volume.value, selected?.totalVolume) && moneyMatchesNumber(fees.value, selected?.totalFees) &&
    period.value?.start === string(identity?.statementPeriodStart) && period.value?.end === string(identity?.statementPeriodEnd);
  const parserReportable = decision?.reportable === true;
  const parserFeeBucket = reconStatus(reconciliation?.feeBucketFormula);
  const parserEffectiveRate = reconStatus(reconciliation?.effectiveRateFormula);
  const supportedFiserv = parser !== null && /fiserv|first data/i.test(analysis.identity.processorFamily.value ?? "") &&
    typeof analysis.versionManifest.parserId === "string" && FISERV_DRIVERS.some((driver) => driver.id === analysis.versionManifest.parserId) &&
    string(identity?.processorFamily) === analysis.identity.processorFamily.value && string(identity?.statementFamily) !== null;
  const coreTotalsReconciled = supportedFiserv && analysis.validation.status !== "invalid" && parserReportable &&
    parserFeeBucket === "pass" && parserEffectiveRate === "pass" && selectedTotalsAgreeWithParser &&
    volume.status === "selected" && fees.status === "selected" && rate.status === "selected" &&
    basis.populationCompatibility === "compatible";

  return {
    contractVersion: FACT_PACKET_VERSION,
    source: {
      canonicalAnalysisId: analysis.analysisId,
      canonicalSchemaVersion: analysis.canonicalSchemaVersion,
      parserId: analysis.versionManifest.parserId,
      processorFamily: analysis.identity.processorFamily.value,
      statementFamily: string(identity?.statementFamily),
      supportedFiserv,
    },
    context: {
      businessType: projectFact(analysis.identity.businessType),
      statementPeriod: projectFact(period),
      pricingModel: pricingModel && pricingEvidence.length > 0
        ? { status: "selected", value: pricingModel, confidence: confidence(pricing?.confidence), evidenceRefs: unique(pricingEvidence), calculationRef: null,
            limitations: ["Pricing architecture is parser-inferred, not a contractual assertion."] }
        : unavailable("A parser-inferred pricing model with matched canonical evidence was unavailable."),
    },
    observed: {
      processedVolume: projectFact(volume),
      totalFees: projectFact(fees),
      allInEffectiveRate: rate.status === "selected" && rate.value !== null
        ? {
            status: "selected", value: { decimalRate: rate.value, numeratorBasis: basis.numeratorFeeBasis, denominatorBasis: basis.denominatorVolumeBasis },
            confidence: rate.confidence, evidenceRefs: [...rate.evidenceRefs], calculationRef: rate.calculationRef ?? null,
            limitations: [...rate.limitations, ...(basis.populationCompatibility === "compatible" ? [] : ["Effective-rate populations are incompatible."])],
          }
        : unavailable("A compatible calculated effective rate is unavailable."),
      compatibleTransactionCount: transactionCount,
      averageTicket: analysis.financialFacts.averageTicketBasis.allowed
        ? projectFact(analysis.financialFacts.averageTicket)
        : unavailable(analysis.financialFacts.averageTicketBasis.reason),
      feeComposition: {
        status: analysis.feeLedger.status,
        countedRowCount: analysis.feeLedger.rows.filter((row) => row.contributesToUniqueTotal).length,
        uniqueChargeTotal: analysis.feeLedger.uniqueChargeTotal,
        visiblePricingFeeRows: visibleRows.slice(0, 12),
        limitations: [...analysis.feeLedger.limitations, ...(visibleRows.length > 12 ? ["Visible fee-row sample is limited to the first 12 counted rows."] : [])],
      },
      observedRateCount: analysis.feeLedger.parserInterpretations.filter((item) => item.printedRate !== null || item.printedPerItemRate !== null).length,
      observedItemCountRowCount: analysis.feeLedger.parserInterpretations.filter((item) => item.itemCount !== null).length,
    },
    reconciliation: {
      canonicalValidation: analysis.validation.status,
      parserReportable,
      parserFeeBucket,
      parserEffectiveRate,
      selectedTotalsAgreeWithParser,
      coreTotalsReconciled,
    },
    limitations: unique([
      ...analysis.validation.warnings,
      ...analysis.feeLedger.limitations,
      ...(basis.populationCompatibility === "compatible" ? [] : ["Effective-rate numerator and denominator are incompatible."]),
      ...(supportedFiserv ? [] : ["No supported validated Fiserv parser output was matched."]),
      ...(coreTotalsReconciled ? [] : ["Core fee and effective-rate reconciliation requirements were not all met."]),
    ]),
    missingContext: [
      "Merchant contract and processor pricing schedule were not supplied.",
      "Actual merchant MCC, channel mix, and card mix were not independently established for this proof.",
      "One statement cannot prove future volume or recurring pricing terms.",
    ],
  };
}

export function assessVisiblePricingForReview(packet: FiservFactPacketV1): FiservContextualAssessmentV1 {
  const reasons: string[] = [];
  if (!packet.source.supportedFiserv) reasons.push("unsupported_statement_family");
  if (!packet.reconciliation.coreTotalsReconciled) reasons.push("core_totals_not_reconciled");
  if (packet.context.businessType.status !== "selected") reasons.push("business_type_unavailable");
  if (packet.context.statementPeriod.status !== "selected") reasons.push("statement_period_unavailable");
  if (packet.observed.processedVolume.value?.amountMinor === undefined || packet.observed.processedVolume.value.amountMinor <= 0) reasons.push("positive_volume_unavailable");
  if (packet.observed.feeComposition.visiblePricingFeeRows.length === 0) reasons.push("visible_pricing_fee_evidence_unavailable");
  const matched = reasons.length === 0;
  const selectedRows = matched ? packet.observed.feeComposition.visiblePricingFeeRows.slice(0, 3) : [];
  const evidenceRefs = unique([
    ...packet.observed.processedVolume.evidenceRefs,
    ...packet.observed.totalFees.evidenceRefs,
    ...selectedRows.flatMap((row) => row.evidenceRefs),
  ]);
  return {
    contractVersion: CONTEXTUAL_ASSESSMENT_VERSION,
    factPacketVersion: FACT_PACKET_VERSION,
    knowledge: VISIBLE_FISERV_PRICING_REVIEW_V1,
    status: matched ? "deserves_review" : "not_assessed",
    observed: matched
      ? ["Selected processing volume and total fees are present.", `At least ${packet.observed.feeComposition.visiblePricingFeeRows.length} counted fee row(s) have source evidence; the fact packet samples at most 12.`]
      : [],
    rationale: matched
      ? "A supported Fiserv statement has reconciled core totals and visible pricing/processing fee activity. Its fee composition deserves review to understand the charges."
      : "The narrow Product rule could not be applied because required observed evidence or core reconciliation is unavailable.",
    evidenceRefs: matched ? evidenceRefs : [],
    confidence: matched ? (packet.observed.feeComposition.status === "available" ? "high" : "medium") : null,
    applicability: { matched, reasonCodes: matched ? ["product_visible_fiserv_pricing_rule_matched"] : reasons },
    limitations: unique([...packet.limitations, ...packet.observed.feeComposition.limitations, VISIBLE_FISERV_PRICING_REVIEW_V1.uncertainty]),
    evidenceToReduceUncertainty: [
      "Obtain the merchant agreement and current processor pricing schedule.",
      "Resolve any remaining fee-row or control-total discrepancies and confirm fee descriptions with the processor.",
      "Obtain additional statements to assess recurrence and changes in volume or mix.",
    ],
  };
}

export function modelRateChangeScenario(packet: FiservFactPacketV1, assumption: ProductRateChangeAssumptionV1): FiservModeledScenarioV1 {
  if (assumption.source !== "product_supplied_illustrative" || !Number.isSafeInteger(assumption.rateChangeBasisPoints) ||
      assumption.rateChangeBasisPoints <= 0 || assumption.rateChangeBasisPoints > 10_000 || !assumption.assumptionId.trim()) {
    throw new Error("Offline scenario requires an explicit positive Product-supplied basis-point assumption.");
  }
  const period = packet.context.statementPeriod.value;
  const volume = packet.observed.processedVolume.value;
  const rate = packet.observed.allInEffectiveRate.value;
  const reasons: string[] = [];
  if (!packet.source.supportedFiserv) reasons.push("unsupported_statement_family");
  if (!packet.reconciliation.coreTotalsReconciled) reasons.push("core_totals_not_reconciled");
  if (!period || !isFullCalendarMonth(period)) reasons.push("full_calendar_month_not_established");
  if (packet.context.statementPeriod.evidenceRefs.length === 0 || packet.observed.processedVolume.evidenceRefs.length === 0 ||
      packet.observed.totalFees.evidenceRefs.length === 0 || packet.observed.allInEffectiveRate.evidenceRefs.length === 0) reasons.push("source_evidence_unavailable");
  if (packet.observed.processedVolume.status !== "selected" || !volume || !Number.isSafeInteger(volume.amountMinor) || volume.amountMinor <= 0) reasons.push("compatible_positive_volume_unavailable");
  if (packet.observed.allInEffectiveRate.status !== "selected" || !rate || rate.numeratorBasis !== "all_in_processing_fees" ||
      rate.denominatorBasis === "unsupported" || !Number.isFinite(Number(rate.decimalRate)) ||
      Number(rate.decimalRate) < assumption.rateChangeBasisPoints / 10_000) reasons.push("compatible_effective_rate_unavailable");
  const available = reasons.length === 0;
  const monthly = available ? effect(volume!, assumption.rateChangeBasisPoints, 1) : null;
  const annual = available ? effect(volume!, assumption.rateChangeBasisPoints, 12) : null;
  if (available && (!monthly || !annual)) reasons.push("arithmetic_overflow");
  const modeled = available && monthly !== null && annual !== null;
  const points = (assumption.rateChangeBasisPoints / 100).toFixed(2);
  const volumeLabel = volume ? `$${(volume.amountMinor / 100).toFixed(2)}` : "unavailable";
  const periodLabel = period ? `${period.start} to ${period.end}` : "unavailable";
  return {
    contractVersion: MODELED_SCENARIO_VERSION,
    factPacketVersion: FACT_PACKET_VERSION,
    kind: "modeled_financial_effect",
    status: modeled ? "modeled" : "unavailable",
    reasonCodes: modeled ? [] : reasons,
    statementPeriod: period ?? null,
    compatibleMonthlyVolume: modeled ? volume : null,
    suppliedAssumption: { ...assumption },
    monthlyModeledFinancialEffect: modeled ? monthly : null,
    annualizedModeledFinancialEffect: modeled ? annual : null,
    formula: "monthly_volume_times_rate_change; annual_volume_assumed_twelve_equal_months",
    rounding: "round_each_displayed_effect_to_nearest_cent_half_up",
    assumptions: modeled ? [
      "The supplied rate change is illustrative and is applied to the all-in effective cost on the same processed-volume basis.",
      "Future monthly processed volume is assumed constant at the selected statement-month volume.",
      "The annualized illustration assumes twelve comparable months from one full calendar-month statement.",
      "Card mix, transaction behavior, fee structure, and other terms are assumed unchanged.",
    ] : [],
    merchantFacingAssumptions: modeled ? [
      `Illustration: a ${points} percentage-point change in all-in effective cost.`,
      `The calculation holds the observed monthly processing volume of ${volumeLabel} constant for twelve comparable months.`,
      `It uses one full calendar-month statement (${periodLabel}); future activity and terms may differ.`,
      "Card mix, transaction behavior, fee structure, and other terms are assumed unchanged.",
    ] : [],
    sourceFacts: [
      { path: "identity.statementPeriod", evidenceRefs: [...packet.context.statementPeriod.evidenceRefs], calculationRef: packet.context.statementPeriod.calculationRef },
      { path: "financialFacts.processedSales", evidenceRefs: [...packet.observed.processedVolume.evidenceRefs], calculationRef: packet.observed.processedVolume.calculationRef },
      { path: "financialFacts.rateRevealCalculatedAllInRate", evidenceRefs: [...packet.observed.allInEffectiveRate.evidenceRefs], calculationRef: packet.observed.allInEffectiveRate.calculationRef },
    ],
    limitations: modeled ? [...packet.limitations, "The scenario does not establish that the illustrative rate change is obtainable or contractually applicable."] : [...packet.limitations, "No financial effect was calculated because required compatible facts were unavailable."],
  };
}

function validatedFiservParserOutput(document: ParsedDocument, sourceFileName: string, businessType: BusinessTypeId): Record<string, unknown> | null {
  if (document.sourceType !== "pdf") return null;
  for (const driver of FISERV_DRIVERS) {
    if (!driver.supports(document)) continue;
    try {
      const parsed: unknown = driver.parse(document, { sourceFileName, businessType });
      const checked = fiservParserOutputSchema.safeParse(parsed);
      if (checked.success) return checked.data as Record<string, unknown>;
    } catch {
      // Unsupported or incomplete deterministic parser output fails closed.
    }
  }
  return null;
}

function compatibleTransactionCount(analysis: CanonicalStatementAnalysis): ProofFact<{ count: number; population: "submitted_transactions" | "settled_transactions" }> {
  const basis = analysis.financialFacts.averageTicketBasis;
  const population = basis.selectedCountType;
  if (!basis.allowed || (population !== "submitted_transactions" && population !== "settled_transactions")) return unavailable(basis.reason);
  const fact = population === "submitted_transactions" ? analysis.financialFacts.transactionCounts.submittedTransactions : analysis.financialFacts.transactionCounts.settledTransactions;
  return fact.status === "selected" && fact.value !== null
    ? { status: "selected", value: { count: fact.value, population }, confidence: fact.confidence, evidenceRefs: [...fact.evidenceRefs], calculationRef: fact.calculationRef ?? null, limitations: [...fact.limitations] }
    : unavailable("Population-compatible transaction count was not selected.");
}

function projectFact<T>(fact: CanonicalFactValue<T>): ProofFact<NonNullable<T>> {
  return fact.status === "selected" && fact.value !== null
    ? { status: "selected", value: fact.value as NonNullable<T>, confidence: fact.confidence, evidenceRefs: [...fact.evidenceRefs], calculationRef: fact.calculationRef ?? null, limitations: [...fact.limitations] }
    : unavailable(fact.limitations[0] ?? "Canonical fact is unavailable.");
}

function unavailable<T>(reason: string): ProofFact<T> {
  return { status: "unavailable", value: null, confidence: null, evidenceRefs: [], calculationRef: null, limitations: [reason] };
}

function effect(volume: MoneyAmount, basisPoints: number, months: number): MoneyAmount | null {
  const numerator = BigInt(volume.amountMinor) * BigInt(basisPoints) * BigInt(months);
  const cents = (numerator + 5_000n) / 10_000n;
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? { amountMinor: Number(cents), currency: "USD" } : null;
}

function isFullCalendarMonth(period: { start: string; end: string }): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period.start) || !/^\d{4}-\d{2}-\d{2}$/.test(period.end)) return false;
  const [year, month, day] = period.start.split("-").map(Number);
  if (day !== 1 || month < 1 || month > 12) return false;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return period.end === end;
}

function moneyMatchesNumber(money: MoneyAmount | null, raw: unknown): boolean {
  return money !== null && typeof raw === "number" && Number.isFinite(raw) && Math.round(raw * 100) === money.amountMinor;
}

function reconStatus(raw: unknown): FiservFactPacketV1["reconciliation"]["parserFeeBucket"] {
  const value = string(record(raw)?.status);
  return value === "pass" || value === "warning" || value === "fail" || value === "not_applicable" ? value : "unavailable";
}

function confidence(raw: unknown): ProofFact<unknown>["confidence"] {
  return raw === "high" || raw === "medium" || raw === "low" || raw === "needs_review" ? raw : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter((item): item is Record<string, unknown> => item !== null) : [];
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
