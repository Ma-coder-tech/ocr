import { createHash } from "node:crypto";
import type { ClaimScopedFixedCostSensitivityAdmissionV1, FixedCostSensitivityAdmissionRecordV1 } from "../canonical/claimScopedFixedCostSensitivityAdmissionV1.js";
import { CLAIM_SCOPED_FIXED_COST_SENSITIVITY_ADMISSION_V1 } from "../canonical/claimScopedFixedCostSensitivityAdmissionV1.js";
import type { CanonicalFeeRow, CanonicalStatementAnalysis, MoneyAmount } from "../canonical/types.js";
import { CONTEXTUAL_FACT_PACKET_VERSION, CONTEXTUAL_RESULT_VERSION, type ContextualFactPacket, type ContextualFeeFact, type ContextualKnowledgeSnapshot, type ContextualObservedCostResult, type ContextualQuery, type ObservedCostItem } from "./contracts.js";
import { REQUIRED_PROHIBITIONS, resolveContextualRule } from "./governance.js";
import { FIRST_CONTEXTUAL_SNAPSHOT } from "./pack.js";

function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function money(value: MoneyAmount | null): value is MoneyAmount {
  return value?.currency === "USD" && Number.isSafeInteger(value.amountMinor);
}
function samePeriod(a: { start: string; end: string } | null, b: { start: string; end: string } | null): boolean {
  return a !== null && b !== null && a.start === b.start && a.end === b.end;
}
function day(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function fixedAdmissionIsCompatible(
  admission: ClaimScopedFixedCostSensitivityAdmissionV1 | null,
  record: FixedCostSensitivityAdmissionRecordV1,
  analysis: CanonicalStatementAnalysis,
  row: CanonicalFeeRow,
  evidenceRefs: string[],
): boolean {
  return admission?.schemaVersion === CLAIM_SCOPED_FIXED_COST_SENSITIVITY_ADMISSION_V1 &&
    admission.mode === "internal_offline" && admission.authority === "derived_claim_scoped_sensitivity_reference_only" &&
    admission.status === "ADMITTED" &&
    admission.safety?.savingsOutputCount === 0 && admission.safety.customerRoutingAllowed === false &&
    admission.safety.feeNameAloneProvesFixedBehavior === false && admission.safety.comparisonInputCount === 0 &&
    samePeriod(admission.statementPeriod, analysis.identity.statementPeriod.value) &&
    record.sourceDocumentRef === admission.sourceDocumentRef && samePeriod(record.statementPeriod, admission.statementPeriod) &&
    record.commercialFeeRowRef === row.id && record.sensitivityClass === "FIXED_COST_DRIVEN" &&
    record.referencedChargedAmountMinor === row.signedAmount?.amountMinor && record.currency === "USD" &&
    record.fixedBehavior?.state === "PROVEN" && record.fixedBehavior.amountKnown === true &&
    record.fixedBehavior.amountActivityIndependent === true && record.cadence?.state === "PROVEN" &&
    record.cadence.source === "STATEMENT_EXPLICIT" &&
    ["monthly", "statement_period", "annual"].includes(record.cadence.type) &&
    Array.isArray(record.cadence.evidenceRefs) && record.cadence.evidenceRefs.length > 0 &&
    record.annualization?.allowed === false && record.additiveContributionMinor === 0 &&
    record.negotiability?.state === "UNKNOWN" && record.avoidability?.state === "UNKNOWN" &&
    evidenceRefs.some((ref) => record.evidenceRefs.includes(ref));
}

/** Copies only canonical statement facts and separately proven statement mechanics. No report or savings path imports this module. */
export function buildContextualFactPacket(input: {
  analysis: CanonicalStatementAnalysis;
  fixedAdmission?: ClaimScopedFixedCostSensitivityAdmissionV1 | null;
}): ContextualFactPacket {
  const { analysis } = input;
  const admission = input.fixedAdmission ?? null;
  const evidenceIds = new Set(analysis.evidence.map((item) => item.id));
  const source = new Map(analysis.feeLedger.sourceOccurrences.map((item) => [item.id, item.evidenceRef]));
  const duplicateRowIds = new Set<string>();
  const seenRows = new Set<string>();
  const sourceCounts = new Map<string, number>();
  for (const row of analysis.feeLedger.rows) {
    if (seenRows.has(row.id)) duplicateRowIds.add(row.id);
    seenRows.add(row.id);
    if (row.contributesToUniqueTotal) for (const id of row.sourceOccurrenceIds) sourceCounts.set(id, (sourceCounts.get(id) ?? 0) + 1);
  }
  const admissions = new Map<string, FixedCostSensitivityAdmissionRecordV1[]>();
  for (const record of admission?.admissions ?? []) admissions.set(record.commercialFeeRowRef, [...(admissions.get(record.commercialFeeRowRef) ?? []), record]);
  const admissionSourceCounts = new Map<string, number>();
  for (const record of admission?.admissions ?? []) admissionSourceCounts.set(record.sourceOccurrenceRef, (admissionSourceCounts.get(record.sourceOccurrenceRef) ?? 0) + 1);
  const feeFacts: ContextualFeeFact[] = analysis.feeLedger.rows.map((row) => {
    const refs = unique(row.sourceOccurrenceIds.map((id) => source.get(id)).filter((ref): ref is string => Boolean(ref && evidenceIds.has(ref))));
    const sourceComplete = row.sourceOccurrenceIds.length > 0 && new Set(row.sourceOccurrenceIds).size === row.sourceOccurrenceIds.length &&
      refs.length > 0 && row.sourceOccurrenceIds.every((id) => source.has(id) && (sourceCounts.get(id) ?? 0) <= 1);
    const charge = (row.role === "individual_charge" || row.role === "interchange_detail_row") &&
      row.contributionDecision.signedAmountBasis === "fee_charge_magnitude" && row.signedAmount !== null && row.signedAmount.amountMinor > 0;
    const credit = (row.role === "credit" || row.role === "adjustment") &&
      row.contributionDecision.signedAmountBasis === "printed_signed_amount" && row.signedAmount !== null && row.signedAmount.amountMinor < 0 &&
      refs.some((ref) => /credit|refund|reversal|adjustment/i.test(analysis.evidence.find((item) => item.id === ref)?.normalizedText ?? ""));
    const amountUnambiguous = analysis.validation.status !== "invalid" && analysis.feeLedger.status !== "unavailable" &&
      row.contributesToUniqueTotal && row.contributionDecision.contributes && sourceComplete &&
      !duplicateRowIds.has(row.id) && row.rejectedAmountCandidates.length === 0 &&
      row.mergeReason !== "ambiguous_similarity_unresolved" && money(row.selectedAmount) && money(row.signedAmount) &&
      Math.abs(row.signedAmount.amountMinor) === Math.abs(row.selectedAmount.amountMinor) && (charge || credit);
    const matches = admissions.get(row.id) ?? [];
    const proven = amountUnambiguous && charge && matches.length === 1 &&
      (admissionSourceCounts.get(matches[0]!.sourceOccurrenceRef) ?? 0) === 1 &&
      fixedAdmissionIsCompatible(admission, matches[0]!, analysis, row, refs);
    return {
      feeRowId: row.id,
      statementLabel: row.selectedLabel,
      role: row.role,
      signedAmount: money(row.signedAmount) ? { ...row.signedAmount } : null,
      contributionReasonCode: row.contributionDecision.reasonCode,
      signedAmountBasis: row.contributionDecision.signedAmountBasis,
      sourceOccurrenceIds: [...row.sourceOccurrenceIds].sort(),
      evidenceRefs: refs,
      amountUnambiguous,
      fixedMechanic: proven ? { admissionId: matches[0]!.admissionId, cadence: matches[0]!.cadence.type, evidenceRefs: refs } : null,
      fixedProofReasonCodes: proven ? [] : [matches.length > 1 ? "duplicate_fixed_admission" : matches.length === 1 ? "fixed_admission_mismatch" : "fixed_mechanic_unproven"],
    };
  }).sort((a, b) => a.feeRowId.localeCompare(b.feeRowId));
  const periodFact = analysis.identity.statementPeriod;
  const period = periodFact.status === "selected" && periodFact.value &&
    day(periodFact.value.start) && day(periodFact.value.end) &&
    periodFact.value.start <= periodFact.value.end && periodFact.evidenceRefs.length > 0 &&
    periodFact.evidenceRefs.every((ref) => evidenceIds.has(ref))
    ? { ...periodFact.value } : null;
  const volumeFact = analysis.financialFacts.processedSales;
  const basis = analysis.financialFacts.effectiveRateBasis;
  const volume = volumeFact.status === "selected" && money(volumeFact.value) && volumeFact.value.amountMinor >= 0 &&
    volumeFact.evidenceRefs.length > 0 && volumeFact.evidenceRefs.every((ref) => evidenceIds.has(ref)) &&
    basis.denominatorVolumeBasis !== "unknown" && basis.denominatorVolumeBasis !== "unsupported"
    ? { ...volumeFact.value } : null;
  const payload = {
    schemaVersion: CONTEXTUAL_FACT_PACKET_VERSION,
    canonicalAnalysisId: analysis.analysisId,
    sourceDocumentRef: analysis.identity.sourceDocumentRef,
    merchantIdentifier: analysis.identity.merchantIdentifier.status === "selected" ? analysis.identity.merchantIdentifier.value : null,
    processorFamily: analysis.identity.processorFamily.status === "selected" &&
      analysis.identity.processorFamily.value?.toLowerCase().includes("fiserv") ? "fiserv_first_data" as const : "unsupported" as const,
    statementPeriod: period,
    statementPeriodEvidenceRefs: unique(periodFact.evidenceRefs.filter((ref) => evidenceIds.has(ref))),
    canonicalValidationStatus: analysis.validation.status,
    processedVolume: {
      amount: volume,
      evidenceRefs: unique(volumeFact.evidenceRefs.filter((ref) => evidenceIds.has(ref))),
      population: basis.denominatorVolumeBasis,
      populationCompatibility: basis.populationCompatibility,
      metricDefinitionId: "canonical_v1_selected_processed_sales_v1" as const,
    },
    feeFacts,
    limitations: unique([
      ...analysis.feeLedger.limitations,
      "Only included, source-linked canonical rows are eligible; statement charges do not prove control or savings.",
      "Fixed mechanics require a matching offline claim-scoped admission; names alone are insufficient.",
    ]),
  };
  return freeze({ ...payload, packetId: `contextual_fact_${digest(payload)}` });
}

function packetValid(packet: ContextualFactPacket): boolean {
  const { packetId, ...payload } = packet;
  return packet.schemaVersion === CONTEXTUAL_FACT_PACKET_VERSION && packetId === `contextual_fact_${digest(payload)}`;
}

function bps(amountMinor: number, volumeMinor: number): string {
  const scaled = (BigInt(amountMinor) * 1_000_000n + BigInt(volumeMinor) / 2n) / BigInt(volumeMinor);
  return `${scaled / 100n}.${String(scaled % 100n).padStart(2, "0")}`;
}

export function evaluateContextualObservedCosts(input: {
  packet: ContextualFactPacket;
  snapshot?: ContextualKnowledgeSnapshot;
  asOf: string;
  tenantRef?: string | null;
  accountRef?: string | null;
}): ContextualObservedCostResult {
  const { packet } = input;
  const snapshot = input.snapshot ?? FIRST_CONTEXTUAL_SNAPSHOT;
  const queryBase = {
    snapshotId: snapshot.snapshotId, asOf: input.asOf, processorFamily: packet.processorFamily,
    merchantIdentifier: packet.merchantIdentifier, tenantRef: input.tenantRef ?? null, accountRef: input.accountRef ?? null,
  } satisfies Omit<ContextualQuery, "ruleId">;
  const line = resolveContextualRule(snapshot, { ...queryBase, ruleId: "observed_line_item_effect" });
  const fixed = resolveContextualRule(snapshot, { ...queryBase, ruleId: "fixed_fee_burden" });
  const packetReasons = [
    ...(!packetValid(packet) ? ["invalid_fact_packet"] : []),
    ...(packet.canonicalValidationStatus === "invalid" ? ["invalid_canonical_analysis"] : []),
    ...(!packet.statementPeriod ? ["statement_period_unavailable"] : []),
    ...(packet.processorFamily === "unsupported" ? ["unsupported_processor_family"] : []),
  ];
  const lineAllowed = line.status === "resolved" && packetReasons.length === 0;
  const fixedAllowed = fixed.status === "resolved" && packetReasons.length === 0;
  const valid = packet.feeFacts.filter((fact) => fact.amountUnambiguous && fact.signedAmount !== null && fact.evidenceRefs.length > 0);
  const positive = lineAllowed ? valid.filter((fact) => fact.signedAmount!.amountMinor > 0) : [];
  const credits = lineAllowed ? valid.filter((fact) => fact.signedAmount!.amountMinor < 0) : [];
  const item = (fact: ContextualFeeFact): ObservedCostItem => ({
    feeRowId: fact.feeRowId, statementLabel: fact.statementLabel, signedAmount: fact.signedAmount!, evidenceRefs: fact.evidenceRefs,
    contributionReasonCode: fact.contributionReasonCode,
    presentationCeiling: fact.signedAmount!.amountMinor > 0 ? "observed_charge_only" : "observed_credit_only",
    prohibitedClaimCodes: [...REQUIRED_PROHIBITIONS],
  });
  const fixedRows = fixedAllowed ? positive.filter((fact) => fact.fixedMechanic !== null) : [];
  const fixedTotal = fixedRows.reduce((total, fact) => total + fact.signedAmount!.amountMinor, 0);
  const fixedAmount = fixedRows.length > 0 && Number.isSafeInteger(fixedTotal) ? { amountMinor: fixedTotal, currency: "USD" as const } : null;
  const volume = packet.processedVolume.amount;
  const compatibleVolume = volume && money(volume) && volume.amountMinor > 0 &&
    packet.processedVolume.populationCompatibility === "compatible" ? volume : null;
  const fixedStatus = fixedAmount ? compatibleVolume ? "assessed" : "amount_only" : "not_assessed";
  return freeze({
    schemaVersion: CONTEXTUAL_RESULT_VERSION,
    factPacketId: packet.packetId, knowledgeSnapshotId: snapshot.snapshotId,
    sourceDocumentRef: packet.sourceDocumentRef, statementPeriod: packet.statementPeriod,
    observedLineItems: {
      status: lineAllowed && (positive.length + credits.length > 0) ? "assessed" : "not_assessed",
      knowledgeRecordRef: lineAllowed ? line.record!.id : null,
      items: positive.map(item), creditsAndReversals: credits.map(item),
      excluded: lineAllowed ? packet.feeFacts.filter((fact) => !valid.includes(fact)).map((fact) => ({ feeRowId: fact.feeRowId, reasonCodes: ["fee_row_not_unambiguous"] })) : [],
      reasonCodes: unique([...line.reasonCodes, ...packetReasons, ...(lineAllowed && positive.length + credits.length === 0 ? ["no_eligible_fee_rows"] : [])]),
    },
    fixedFeeBurden: {
      status: fixedStatus, knowledgeRecordRef: fixedAllowed ? fixed.record!.id : null,
      fixedChargeTotal: fixedAmount, feeRowIds: fixedRows.map((fact) => fact.feeRowId),
      evidenceRefs: unique(fixedRows.flatMap((fact) => fact.evidenceRefs)),
      compatibleProcessedVolume: fixedAmount ? compatibleVolume : null,
      volumeMetricDefinitionId: "canonical_v1_selected_processed_sales_v1",
      basisPointsEquivalent: fixedAmount && compatibleVolume ? bps(fixedAmount.amountMinor, compatibleVolume.amountMinor) : null,
      basisPointsMetricDefinitionId: "observed_fixed_charge_burden_bps_v1",
      excluded: fixedAllowed ? positive.filter((fact) => !fact.fixedMechanic).map((fact) => ({ feeRowId: fact.feeRowId, reasonCodes: fact.fixedProofReasonCodes })) : [],
      reasonCodes: unique([...fixed.reasonCodes, ...packetReasons,
        ...(fixedAllowed && !fixedAmount ? ["no_proven_fixed_charges"] : []),
        ...(fixedAmount && !compatibleVolume ? [volume?.amountMinor === 0 ? "zero_processed_volume" : "compatible_processed_volume_unavailable"] : [])]),
      presentationCeiling: "observed_fixed_cost_burden_only",
      prohibitedClaimCodes: [...REQUIRED_PROHIBITIONS],
    },
    limitations: packet.limitations,
  });
}
