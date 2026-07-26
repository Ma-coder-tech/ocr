import type { ParsedDocument } from "../parser.js";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "../fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../genericFiservStatementParser.js";
import type { ParserDriver } from "../parserFoundation.js";
import { attachParserInterpretation, documentIdForSource, makeEvidenceRecord } from "./evidence.js";
import { candidate, selectedFact, unavailableFact } from "./facts.js";
import { buildEffectiveRateFacts } from "./effectiveRateBasis.js";
import { buildCanonicalFeeLedger } from "./feeLedger.js";
import { moneyFromNumber } from "./money.js";
import { buildAverageTicket, emptyTransactionCounts, transactionCountsFromParserSupport } from "./transactionCounts.js";
import { buildVersionManifest, CANONICAL_SCHEMA_VERSION } from "./versionManifest.js";
import { validateCanonicalStatementAnalysis } from "./validate.js";
import type {
  CanonicalCalculationRecord,
  CanonicalEvidenceRecord,
  CanonicalFactCandidate,
  CanonicalFactValue,
  CanonicalFinancialFacts,
  CanonicalStatementAnalysis,
  CanonicalStatementIdentity,
  CanonicalVolumePopulation,
  CountValue,
  DecimalString,
  MoneyAmount,
} from "./types.js";

type BuildOptions = {
  sourceFileName?: string | null;
  businessType?: string | null;
  sourceAnalysisId?: string | null;
  preferExtractedRows?: boolean;
};

type MatchedOutput = {
  driverId: string | null;
  driverName: string | null;
  output: Record<string, unknown> | null;
};

const PDF_PARSER_DRIVERS: ParserDriver<unknown>[] = [
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
  genericFiservStatementDriver,
];

export function buildCanonicalStatementFactsFromParsedDocument(
  doc: ParsedDocument,
  options: BuildOptions = {},
): CanonicalStatementAnalysis {
  const matched = findParserOutput(doc, options);
  const documentId = documentIdForSource(options.sourceFileName ?? null);
  const evidence = new Map<string, CanonicalEvidenceRecord>();
  const calculations: CanonicalCalculationRecord[] = [];

  const analysis =
    matched.output !== null && !options.preferExtractedRows
      ? fromParserOutput({ doc, options, matched, documentId, evidence, calculations })
      : fromExtractedRows({ doc, options, matched, documentId, evidence, calculations });

  return validateCanonicalStatementAnalysis(analysis);
}

export function canonicalActualValues(analysis: CanonicalStatementAnalysis): Record<string, unknown> {
  const counts = analysis.financialFacts.transactionCounts;
  return {
    "identity.processorName": analysis.identity.processorName.value,
    "identity.processorFamily": analysis.identity.processorFamily.value,
    "identity.statementPeriod": analysis.identity.statementPeriod.value,
    "financialFacts.processedSales": analysis.financialFacts.processedSales.value,
    "financialFacts.totalFees": analysis.financialFacts.totalFees.value,
    "financialFacts.amountFunded": analysis.financialFacts.amountFunded.value,
    "financialFacts.adjustments": analysis.financialFacts.adjustments.value,
    "financialFacts.credits": analysis.financialFacts.credits.value,
    "financialFacts.refunds": analysis.financialFacts.refunds.value,
    "financialFacts.rateRevealCalculatedAllInRate": analysis.financialFacts.rateRevealCalculatedAllInRate.value,
    "financialFacts.effectiveRate.rateRevealCalculatedAllInRate": analysis.financialFacts.rateRevealCalculatedAllInRate.value,
    "financialFacts.effectiveRate.processorStatedRate": analysis.financialFacts.processorStatedRate.value,
    "financialFacts.effectiveRate.numeratorFeeBasis": analysis.financialFacts.effectiveRateBasis.numeratorFeeBasis,
    "financialFacts.effectiveRate.denominatorVolumeBasis": analysis.financialFacts.effectiveRateBasis.denominatorVolumeBasis,
    "financialFacts.effectiveRate.refundsTreatment": analysis.financialFacts.effectiveRateBasis.refundsTreatment,
    "financialFacts.effectiveRate.oneTimeFeeTreatment": analysis.financialFacts.effectiveRateBasis.oneTimeFeeTreatment,
    "financialFacts.effectiveRate.populationCompatibility": analysis.financialFacts.effectiveRateBasis.populationCompatibility,
    "financialFacts.transactionCounts.submittedTransactions": counts.submittedTransactions.value,
    "financialFacts.transactionCounts.settledTransactions": counts.settledTransactions.value,
    "financialFacts.transactionCounts.authorizations": counts.authorizations.value,
    "financialFacts.transactionCounts.captures": counts.captures.value,
    "financialFacts.transactionCounts.refunds": counts.refunds.value,
    "financialFacts.transactionCounts.chargebacks": counts.chargebacks.value,
    "financialFacts.transactionCounts.networkTransactions": counts.networkTransactions.value,
    "financialFacts.transactionCounts.cardTypeItems": counts.cardTypeItems.value,
    "financialFacts.transactionCounts.auditSpecificCounts": counts.auditSpecificCounts.value,
    "financialFacts.averageTicket": analysis.financialFacts.averageTicket.value,
    "financialFacts.averageTicketBasis.allowed": analysis.financialFacts.averageTicketBasis.allowed,
    "financialFacts.averageTicketBasis.selectedCountType": analysis.financialFacts.averageTicketBasis.selectedCountType,
    "financialFacts.averageTicketBasis.selectedVolumePopulation": analysis.financialFacts.averageTicketBasis.selectedVolumePopulation,
    "feeLedger.status": analysis.feeLedger.status,
    "feeLedger.uniqueChargeTotal": analysis.feeLedger.uniqueChargeTotal,
    "feeLedger.uniqueChargeRowCount": analysis.feeLedger.rows.filter((row) => row.contributesToUniqueTotal).length,
    "feeLedger.sourceOccurrenceCount": analysis.feeLedger.sourceOccurrences.length,
    "feeLedger.parserInterpretationCount": analysis.feeLedger.parserInterpretations.length,
    "feeLedger.controlStatuses": analysis.feeLedger.controls.map((control) => control.status),
    "validation.status": analysis.validation.status,
  };
}

function fromParserOutput(input: {
  doc: ParsedDocument;
  options: BuildOptions;
  matched: MatchedOutput;
  documentId: string;
  evidence: Map<string, CanonicalEvidenceRecord>;
  calculations: CanonicalCalculationRecord[];
}): CanonicalStatementAnalysis {
  const output = input.matched.output!;
  const selectedFinancials = record(output.selectedFinancials);
  const statementIdentity = record(output.statementIdentity);
  const candidateTotals = arrayOfRecords(output.candidateTotals);
  const contextEvidenceRef = addEvidence(
    input.evidence,
    input.documentId,
    "Parser statement identity and selected financial context.",
    null,
    null,
    "parser_context",
    input.matched,
    input.matched.driverId,
  );

  const processedSales = moneyFactFromCandidates({
    field: "processedSales",
    sourceRole: "total_volume",
    selectedValue: numberOrNull(selectedFinancials.totalVolume),
    candidateTotals,
    matched: input.matched,
    documentId: input.documentId,
    evidence: input.evidence,
    fallbackReason: "Processed sales were not verified by parser candidates.",
  });
  const totalFees = moneyFactFromCandidates({
    field: "totalFees",
    sourceRole: "total_fees",
    selectedValue: numberOrNull(selectedFinancials.totalFees),
    candidateTotals,
    matched: input.matched,
    documentId: input.documentId,
    evidence: input.evidence,
    fallbackReason: "Total fees were not verified by parser candidates.",
  });
  const amountFunded = moneyFactFromCandidates({
    field: "amountFunded",
    sourceRole: "amount_funded",
    selectedValue: numberOrNull(selectedFinancials.amountFunded),
    candidateTotals,
    matched: input.matched,
    documentId: input.documentId,
    evidence: input.evidence,
    fallbackReason: "Funding amount was not verified.",
  });
  const adjustments = nullableMoneyFact({
    value: numberOrNull(selectedFinancials.adjustmentsChargebacks),
    reason: "Adjustments and chargebacks were not separately verified.",
    evidenceRefs: [contextEvidenceRef],
  });
  const refunds = nullableMoneyFact({
    value: numberOrNull(selectedFinancials.refunds),
    reason: "Refunds were not separately verified.",
    evidenceRefs: [contextEvidenceRef],
  });
  const credits = unavailableFact<MoneyAmount | null>("Credits were not separately verified.");
  const selectedVolumePopulation = populationForProcessedSales(processedSales);
  const transactionEvidenceRefs = transactionEvidence(candidateTotals, input.matched, input.documentId, input.evidence);
  const transactionSource = record(selectedFinancials.transactionCount);
  const transactionCounts = transactionCountsFromParserSupport({
    primaryCount: transactionSource.primaryTransactionCount,
    supportingCounts: arrayOfRecords(transactionSource.supportingTransactionCounts),
    evidenceRefs: transactionEvidenceRefs,
    parserId: input.matched.driverId,
    parserVersion: null,
  });

  return buildAnalysisEnvelope({
    options: input.options,
    matched: input.matched,
    documentId: input.documentId,
    identity: {
      merchantName: stringFact(stringOrNull(statementIdentity.merchantName), "Merchant name was not verified.", [contextEvidenceRef]),
      merchantIdentifier: nullableStringFact(stringOrNull(statementIdentity.merchantNumber), "Merchant identifier was not verified.", [contextEvidenceRef]),
      processorName: stringFact(
        stringOrNull(statementIdentity.visibleBrand) ?? stringOrNull(statementIdentity.processorFamily),
        "Processor name was not verified.",
        [contextEvidenceRef],
      ),
      processorFamily: stringFact(stringOrNull(statementIdentity.processorFamily), "Processor family was not verified.", [contextEvidenceRef]),
      statementPeriod: periodFact(stringOrNull(statementIdentity.statementPeriodStart), stringOrNull(statementIdentity.statementPeriodEnd), [contextEvidenceRef]),
      businessType: stringFact(input.options.businessType ?? null, "Business type was not supplied to canonical analysis.", [contextEvidenceRef]),
      sourceDocumentRef: input.documentId,
    },
    financialFactsInput: {
      processedSales,
      totalFees,
      amountFunded,
      adjustments,
      credits,
      refunds,
      transactionCounts,
      selectedVolumePopulation,
    },
    doc: input.doc,
    parserOutput: output,
    evidence: input.evidence,
    calculations: input.calculations,
  });
}

function fromExtractedRows(input: {
  doc: ParsedDocument;
  options: BuildOptions;
  matched: MatchedOutput;
  documentId: string;
  evidence: Map<string, CanonicalEvidenceRecord>;
  calculations: CanonicalCalculationRecord[];
}): CanonicalStatementAnalysis {
  const processed = findMoneyLine(input.doc, /total amount submitted|amounts submitted/i);
  const fees = findMoneyLine(input.doc, /fees charged|total fees/i);
  const processedEvidence = processed
    ? [addEvidence(input.evidence, input.documentId, processed.content, processed.pageNumber, processed.rowIndex, "processedSales", input.matched)]
    : [];
  const feeEvidence = fees ? [addEvidence(input.evidence, input.documentId, fees.content, fees.pageNumber, fees.rowIndex, "totalFees", input.matched)] : [];
  const contextEvidenceRef = addEvidence(
    input.evidence,
    input.documentId,
    "Canonical harness context for extracted statement rows.",
    null,
    null,
    "harness_context",
    input.matched,
    "extracted_rows",
  );
  const processedSales = processed?.money
    ? selectedFact({
        value: processed.money,
        confidence: "medium",
        evidenceRefs: processedEvidence,
        selectionReason: "Selected from extracted statement text in canonical harness mode.",
      })
    : unavailableFact<MoneyAmount>("Processed sales were not found in extracted statement text.");
  const totalFees = fees?.money
    ? selectedFact({
        value: fees.money,
        confidence: "medium",
        evidenceRefs: feeEvidence,
        selectionReason: "Selected from extracted statement text in canonical harness mode.",
      })
    : unavailableFact<MoneyAmount>("Total fees were not found in extracted statement text.");

  return buildAnalysisEnvelope({
    options: input.options,
    matched: input.matched,
    documentId: input.documentId,
    identity: {
      merchantName: unavailableFact("Merchant name was not verified."),
      merchantIdentifier: unavailableFact("Merchant identifier was not verified."),
      processorName: unavailableFact("Processor name was not verified."),
      processorFamily: unavailableFact("Processor family was not verified."),
      statementPeriod: unavailableFact("Statement period was not verified."),
      businessType: stringFact(input.options.businessType ?? null, "Business type was not supplied to canonical analysis.", [contextEvidenceRef]),
      sourceDocumentRef: input.documentId,
    },
    financialFactsInput: {
      processedSales,
      totalFees,
      amountFunded: unavailableFact("Funding amount was not verified."),
      adjustments: unavailableFact("Adjustments were not verified."),
      credits: unavailableFact("Credits were not verified."),
      refunds: unavailableFact("Refunds were not verified."),
      transactionCounts: emptyTransactionCounts(),
      selectedVolumePopulation: processed ? "submitted_sales" : "unknown",
    },
    doc: input.doc,
    parserOutput: input.matched.output,
    evidence: input.evidence,
    calculations: input.calculations,
  });
}

function buildAnalysisEnvelope(input: {
  options: BuildOptions;
  matched: MatchedOutput;
  documentId: string;
  doc: ParsedDocument;
  parserOutput: Record<string, unknown> | null;
  identity: CanonicalStatementIdentity;
  financialFactsInput: {
    processedSales: CanonicalFactValue<MoneyAmount>;
    totalFees: CanonicalFactValue<MoneyAmount>;
    amountFunded: CanonicalFactValue<MoneyAmount | null>;
    adjustments: CanonicalFactValue<MoneyAmount | null>;
    credits: CanonicalFactValue<MoneyAmount | null>;
    refunds: CanonicalFactValue<MoneyAmount | null>;
    transactionCounts: ReturnType<typeof emptyTransactionCounts>;
    selectedVolumePopulation: CanonicalVolumePopulation;
  };
  evidence: Map<string, CanonicalEvidenceRecord>;
  calculations: CanonicalCalculationRecord[];
}): CanonicalStatementAnalysis {
  const effectiveRateCalcId = "calc_ratereveal_all_in_effective_rate";
  const effective = buildEffectiveRateFacts({
    processedSales: input.financialFactsInput.processedSales,
    totalFees: input.financialFactsInput.totalFees,
    denominatorVolumeBasis: input.financialFactsInput.selectedVolumePopulation,
    refundsPresent: input.financialFactsInput.refunds.value !== null,
    adjustmentsPresent: input.financialFactsInput.adjustments.value !== null,
    calculationRef: effectiveRateCalcId,
  });
  if (effective.rateRevealCalculatedAllInRate.value !== null) {
    input.calculations.push({
      id: effectiveRateCalcId,
      formulaCode: "ratereveal_all_in_effective_rate",
      formulaVersion: "effective_rate_basis_v1",
      inputs: [
        {
          label: "Total fees",
          value: input.financialFactsInput.totalFees.value,
          unit: "money",
          evidenceRefs: input.financialFactsInput.totalFees.evidenceRefs,
        },
        {
          label: "Processed sales",
          value: input.financialFactsInput.processedSales.value,
          unit: "money",
          evidenceRefs: input.financialFactsInput.processedSales.evidenceRefs,
        },
      ],
      result: effective.rateRevealCalculatedAllInRate.value,
      unit: "decimal_rate",
      roundingPolicy: "decimal_rate_6_places_v1",
    });
  }

  const averageCalcId = "calc_average_ticket_population_matched";
  const average = buildAverageTicket({
    processedSales: input.financialFactsInput.processedSales,
    selectedVolumePopulation: input.financialFactsInput.selectedVolumePopulation,
    transactionCounts: input.financialFactsInput.transactionCounts,
    calculationRef: averageCalcId,
    evidence: [...input.evidence.values()],
  });
  if (average.averageTicket.value !== null) {
    input.calculations.push({
      id: averageCalcId,
      formulaCode: "average_ticket",
      formulaVersion: "transaction_population_match_v1",
      inputs: [
        {
          label: "Processed sales",
          value: input.financialFactsInput.processedSales.value,
          unit: "money",
          evidenceRefs: input.financialFactsInput.processedSales.evidenceRefs,
        },
        {
          label: "Compatible transaction count",
          value: input.financialFactsInput.transactionCounts.submittedTransactions.value ?? input.financialFactsInput.transactionCounts.settledTransactions.value,
          unit: "count",
          evidenceRefs: average.basis.evidenceRefs,
        },
      ],
      result: average.averageTicket.value,
      unit: "money",
      roundingPolicy: "money_minor_units_usd_v1",
    });
  }

  const financialFacts: CanonicalFinancialFacts = {
    processedSales: input.financialFactsInput.processedSales,
    totalFees: input.financialFactsInput.totalFees,
    rateRevealCalculatedAllInRate: effective.rateRevealCalculatedAllInRate,
    processorStatedRate: effective.processorStatedRate,
    effectiveRateBasis: effective.basis,
    transactionCounts: input.financialFactsInput.transactionCounts,
    averageTicketBasis: average.basis,
    averageTicket: average.averageTicket,
    amountFunded: input.financialFactsInput.amountFunded,
    adjustments: input.financialFactsInput.adjustments,
    credits: input.financialFactsInput.credits,
    refunds: input.financialFactsInput.refunds,
  };
  const feeLedger = buildCanonicalFeeLedger({
    doc: input.doc,
    parserOutput: input.parserOutput,
    matched: input.matched,
    documentId: input.documentId,
    evidence: input.evidence,
    calculations: input.calculations,
  });

  return {
    canonicalSchemaVersion: CANONICAL_SCHEMA_VERSION,
    analysisId: `canonical_${input.documentId}`,
    sourceAnalysisId: input.options.sourceAnalysisId ?? null,
    createdAt: new Date(0).toISOString(),
    identity: input.identity,
    financialFacts,
    feeLedger,
    evidence: [...input.evidence.values()],
    calculations: input.calculations,
    validation: { status: "valid", errors: [], warnings: [] },
    versionManifest: buildVersionManifest({ parserId: input.matched.driverId }),
  };
}

function findParserOutput(doc: ParsedDocument, options: BuildOptions): MatchedOutput {
  if (doc.sourceType !== "pdf") return { driverId: null, driverName: null, output: null };
  for (const driver of PDF_PARSER_DRIVERS) {
    if (!driver.supports(doc)) continue;
    try {
      const output = driver.parse(doc, {
        sourceFileName: options.sourceFileName ?? undefined,
        businessType: options.businessType as any,
      });
      return { driverId: driver.id, driverName: driver.displayName, output: record(output) };
    } catch {
      continue;
    }
  }
  return { driverId: null, driverName: null, output: null };
}

function moneyFactFromCandidates(input: {
  field: string;
  sourceRole: string;
  selectedValue: number | null;
  candidateTotals: Record<string, unknown>[];
  matched: MatchedOutput;
  documentId: string;
  evidence: Map<string, CanonicalEvidenceRecord>;
  fallbackReason: string;
}): CanonicalFactValue<MoneyAmount> {
  const matching = input.candidateTotals.filter((item) => item.roleCandidate === input.sourceRole);
  const candidates = matching.flatMap((item, index): CanonicalFactCandidate<MoneyAmount>[] => {
    const amount = numberOrNull(item.amount);
    if (amount === null) return [];
    const evidenceRef = addEvidence(
      input.evidence,
      input.documentId,
      stringOrNull(item.evidenceLine) ?? String(item.label ?? input.field),
      numberOrNull(item.pageNumber),
      index,
      input.field,
      input.matched,
      moneyFromNumber(amount),
    );
    const value = moneyFromNumber(amount);
    if (!value) return [];
    return [
      candidate({
        id: `cand_${input.field}_${index}`,
        role: candidateRoleForParserCandidate(item),
        value,
        evidenceRefs: [evidenceRef],
        parserId: input.matched.driverId,
        parserVersion: null,
        confidence: confidenceOrDefault(item.confidence),
        selected: item.selected === true,
        selectionReason: stringOrNull(item.selectionReason),
        rejectionReason: item.selected === true ? null : stringOrNull(item.rejectionReason) ?? "Candidate was not selected by parser policy.",
      }),
    ];
  });
  const selected = candidates.find((item) => item.selected);
  const selectedValue = selected?.value ?? (input.selectedValue === null ? null : moneyFromNumber(input.selectedValue));
  if (!selectedValue) return unavailableFact(input.fallbackReason, candidates);
  return selectedFact({
    value: selectedValue,
    confidence: selected?.confidence ?? "medium",
    evidenceRefs: selected?.evidenceRefs ?? [],
    selectedCandidateId: selected?.id,
    selectionReason: selected?.selectionReason ?? "Selected from parser output.",
    candidates,
  });
}

function nullableMoneyFact(input: { value: number | null; reason: string; evidenceRefs?: string[] }): CanonicalFactValue<MoneyAmount | null> {
  if (input.value === null) return unavailableFact(input.reason);
  const value = moneyFromNumber(input.value);
  return value
    ? selectedFact({
        value,
        confidence: "medium",
        evidenceRefs: input.evidenceRefs ?? [],
        selectionReason: "Selected from parser output for internal canonical diagnostics.",
      })
    : unavailableFact(input.reason);
}

function stringFact(value: string | null, unavailableReason: string, evidenceRefs: string[] = []): CanonicalFactValue<string> {
  return value === null || value === ""
    ? unavailableFact<string>(unavailableReason)
    : selectedFact({ value, confidence: "medium", evidenceRefs, selectionReason: "Selected from parser or supplied analysis context." });
}

function nullableStringFact(value: string | null, unavailableReason: string, evidenceRefs: string[] = []): CanonicalFactValue<string | null> {
  return value === null || value === ""
    ? unavailableFact<string | null>(unavailableReason)
    : selectedFact({ value, confidence: "medium", evidenceRefs, selectionReason: "Selected from parser or supplied analysis context." });
}

function periodFact(start: string | null, end: string | null, evidenceRefs: string[] = []): CanonicalFactValue<{ start: string; end: string }> {
  if (!start || !end) return unavailableFact("Statement period was not verified.");
  return selectedFact({
    value: { start, end },
    confidence: "medium",
    evidenceRefs,
    selectionReason: "Selected from parser statement identity.",
  });
}

function populationForProcessedSales(processedSales: CanonicalFactValue<MoneyAmount>): CanonicalVolumePopulation {
  const selected = processedSales.candidates.find((item) => item.id === processedSales.selectedCandidateId);
  const role = selected?.role;
  if (role === "statement_level_total" || role === "processor_summary_total" || role === "card_type_total") return "submitted_sales";
  return processedSales.value ? "processor_reported_volume" : "unknown";
}

function transactionEvidence(
  candidateTotals: Record<string, unknown>[],
  matched: MatchedOutput,
  documentId: string,
  evidence: Map<string, CanonicalEvidenceRecord>,
): string[] {
  const rows = candidateTotals.filter((item) => /card type/i.test(String(item.sourceSection ?? item.label ?? "")));
  return rows.map((item, index) =>
    addEvidence(
      evidence,
      documentId,
      stringOrNull(item.evidenceLine) ?? String(item.label ?? "transaction count"),
      numberOrNull(item.pageNumber),
      index,
      "transactionCount",
      matched,
      numberOrNull(item.amount),
    ),
  );
}

function addEvidence(
  evidence: Map<string, CanonicalEvidenceRecord>,
  documentId: string,
  text: string,
  pageNumber: number | null,
  rowIndex: number | null,
  interpretedRole: string,
  matched: MatchedOutput,
  interpretedValue?: MoneyAmount | DecimalString | CountValue | string | null,
): string {
  const base = makeEvidenceRecord({
    documentId,
    extractedText: text,
    pageNumber,
    rowIndex,
    sourceRole: "selected_fact",
    confidence: "medium",
  });
  const withInterpretation = attachParserInterpretation(base, {
    parserId: matched.driverId,
    parserVersion: null,
    interpretedRole,
    interpretedValue: interpretedValue ?? null,
    confidence: "medium",
  });
  evidence.set(withInterpretation.id, withInterpretation);
  return withInterpretation.id;
}

function findMoneyLine(doc: ParsedDocument, pattern: RegExp): { money: MoneyAmount | null; content: string; pageNumber: number | null; rowIndex: number } | null {
  for (const [rowIndex, row] of doc.rows.entries()) {
    const content = String(row.content ?? "");
    const labelIndex = content.search(pattern);
    if (labelIndex < 0) continue;
    const match = content
      .slice(labelIndex)
      .match(/-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+\.\d{2}/g)
      ?.at(0);
    if (!match) continue;
    return {
      money: moneyFromNumber(Math.abs(Number(match.replace(/[$,]/g, "")))),
      content,
      pageNumber: pageFromRow(row),
      rowIndex,
    };
  }
  return null;
}

function candidateRoleForParserCandidate(item: Record<string, unknown>) {
  const role = String(item.roleCandidate ?? "");
  const label = String(item.label ?? "");
  if (role === "total_volume" && /amounts? submitted|total amount submitted/i.test(label)) return "statement_level_total" as const;
  if (role === "total_fees") return "statement_level_total" as const;
  if (role === "amount_funded") return "funding_formula_result" as const;
  if (role === "fee_bucket_total") return "fee_bucket_total" as const;
  if (/card type/i.test(label)) return "card_type_total" as const;
  if (role === "interchange_detail_total") return "interchange_detail_total" as const;
  return "unknown" as const;
}

function confidenceOrDefault(value: unknown) {
  return value === "high" || value === "medium" || value === "low" || value === "needs_review" ? value : "medium";
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pageFromRow(row: Record<string, unknown>): number | null {
  const match = String(row.page ?? "").match(/page-(\d+)/i);
  return match ? Number(match[1]) : null;
}
