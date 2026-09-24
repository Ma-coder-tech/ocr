import { createHash } from "node:crypto";
import type { ContextualFactPacket, ContextualKnowledgeSnapshot, ContextualObservedCostResult, ObservedCostItem } from "../contextualKnowledge/contracts.js";
import { evaluateContextualObservedCosts } from "../contextualKnowledge/evaluate.js";
import { REQUIRED_PROHIBITIONS, validateContextualSnapshot } from "../contextualKnowledge/governance.js";
import { FIRST_CONTEXTUAL_SNAPSHOT } from "../contextualKnowledge/pack.js";
import { GOVERNED_AI_PACKET_VERSION, GOVERNED_AI_OUTPUT_VERSION, type GovernedAiInputPacket, type GovernedAiOutput, type GovernedClause, type GovernedFinding, type GovernedNumericFact, type GovernedUnavailableState, type NextDocumentCode } from "./contracts.js";

export const APPROVED_NEXT_DOCUMENTS: GovernedAiInputPacket["approvedNextDocuments"] = [
  { code: "second_consecutive_statement", rationale: "A second consecutive statement would show whether the observed line item recurs or changes." },
  { code: "pricing_schedule_rate_sheet", rationale: "A pricing schedule or rate sheet would show which written pricing terms apply." },
  { code: "merchant_agreement", rationale: "A merchant agreement could clarify contract terms relevant to the observed line item." },
  { code: "additional_consecutive_statements", rationale: "Additional consecutive statements could show how the observed line item varies across periods." },
  { code: "transaction_batch_detail", rationale: "Transaction or batch detail could clarify the activity behind a statement line item." },
];

function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function usd(minor: number): string {
  const abs = BigInt(Math.abs(minor));
  const whole = (abs / 100n).toLocaleString("en-US");
  return `$${whole}.${String(abs % 100n).padStart(2, "0")}`;
}
function safeLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z][A-Za-z &/().-]{0,99}$/.test(trimmed)) throw new Error("unsafe_statement_label_for_ai_packet");
  return trimmed;
}

function lineFinding(item: ObservedCostItem, knowledgeRecordId: string, limitations: string[]): { finding: GovernedFinding; clauses: GovernedClause[]; numerics: GovernedNumericFact[] } {
  const id = `observed:${item.feeRowId}`;
  const label = safeLabel(item.statementLabel);
  const credit = item.signedAmount.amountMinor < 0;
  const display = usd(item.signedAmount.amountMinor);
  const numericId = `${id}:signed_amount`;
  const finding: GovernedFinding = {
    id, kind: "observed_line_item_effect", state: "assessed", statementLabel: label,
    knowledgeRecordId, permittedUse: "display_observed_amount", presentationCeiling: "observed_signed_contribution_only",
    limitations: [...limitations], prohibitedClaimCodes: [...REQUIRED_PROHIBITIONS],
    evidenceRefs: [...item.evidenceRefs], numericFactIds: [numericId],
  };
  const clauses: GovernedClause[] = [
    { id: `${id}:observation`, findingId: id, claimCode: credit ? "observed_credit" : "observed_charge",
      text: credit ? `A credit of ${display} labeled ${label} appeared as a signed contribution to observed fees.` :
        `A charge of ${display} labeled ${label} appeared in this period and contributed to observed fees.`,
      evidenceRefs: [...item.evidenceRefs], knowledgeRecordId },
    { id: `${id}:review`, findingId: id, claimCode: "review_context",
      text: credit ? "This identifies a signed credit to review alongside the statement's charges." :
        "This identifies a specific charge to review alongside the applicable pricing terms.",
      evidenceRefs: [...item.evidenceRefs], knowledgeRecordId },
    { id: `${id}:limit`, findingId: id, claimCode: "changeability_unknown",
      text: credit ? "The statement does not establish whether this credit can be changed." :
        "The statement does not establish whether this charge can be changed.",
      evidenceRefs: [...item.evidenceRefs], knowledgeRecordId },
  ];
  const numerics: GovernedNumericFact[] = [{ id: numericId, kind: "signed_fee_amount", amountMinor: item.signedAmount.amountMinor,
    decimalValue: null, currency: "USD", display, evidenceRefs: [...item.evidenceRefs] }];
  return { finding, clauses, numerics };
}

function fixedFinding(result: ContextualObservedCostResult, volumeEvidenceRefs: string[], knowledgeRecordId: string, limitations: string[]): { finding: GovernedFinding; clauses: GovernedClause[]; numerics: GovernedNumericFact[] } {
  const fixed = result.fixedFeeBurden;
  if (!fixed.fixedChargeTotal || (fixed.status !== "assessed" && fixed.status !== "amount_only")) throw new Error("fixed_result_not_eligible");
  const id = `fixed:${result.factPacketId}`;
  const totalId = `${id}:total`;
  const evidenceRefs = [...fixed.evidenceRefs];
  const numerics: GovernedNumericFact[] = [{ id: totalId, kind: "fixed_total", amountMinor: fixed.fixedChargeTotal.amountMinor,
    decimalValue: null, currency: "USD", display: usd(fixed.fixedChargeTotal.amountMinor), evidenceRefs }];
  const clauses: GovernedClause[] = [
    { id: `${id}:total_clause`, findingId: id, claimCode: "fixed_total",
      text: `Fixed charges observed in this period total ${usd(fixed.fixedChargeTotal.amountMinor)}.`, evidenceRefs, knowledgeRecordId },
    { id: `${id}:review`, findingId: id, claimCode: "review_context",
      text: "This shows the observed fixed charges alongside this period's processing activity.", evidenceRefs, knowledgeRecordId },
    { id: `${id}:limit`, findingId: id, claimCode: "changeability_unknown",
      text: "The statement does not establish whether these charges can be changed.", evidenceRefs, knowledgeRecordId },
  ];
  if (fixed.status === "assessed" && fixed.compatibleProcessedVolume && fixed.basisPointsEquivalent) {
    const volumeId = `${id}:volume`;
    const bpsId = `${id}:bps`;
    numerics.push({ id: volumeId, kind: "compatible_volume", amountMinor: fixed.compatibleProcessedVolume.amountMinor,
      decimalValue: null, currency: "USD", display: usd(fixed.compatibleProcessedVolume.amountMinor), evidenceRefs: [...volumeEvidenceRefs] });
    numerics.push({ id: bpsId, kind: "basis_points_equivalent", amountMinor: null,
      decimalValue: fixed.basisPointsEquivalent, currency: null, display: fixed.basisPointsEquivalent, evidenceRefs: unique([...evidenceRefs, ...volumeEvidenceRefs]) });
    clauses.splice(1, 0, { id: `${id}:ratio`, findingId: id, claimCode: "fixed_ratio",
      text: `Against ${usd(fixed.compatibleProcessedVolume.amountMinor)} of compatible processed volume, those charges equaled ${fixed.basisPointsEquivalent} basis points for this period.`,
      evidenceRefs: unique([...evidenceRefs, ...volumeEvidenceRefs]), knowledgeRecordId });
  } else {
    clauses.splice(1, 0, { id: `${id}:ratio_unavailable`, findingId: id, claimCode: "ratio_unavailable",
      text: "A basis-point equivalent is unavailable because compatible positive processed volume is not available.",
      evidenceRefs, knowledgeRecordId });
  }
  const finding: GovernedFinding = {
    id, kind: "fixed_fee_burden", state: fixed.status === "assessed" ? "assessed" : "amount_only",
    statementLabel: null, knowledgeRecordId, permittedUse: "contextual_cost_burden",
    presentationCeiling: "observed_fixed_cost_burden_only", limitations: [...limitations],
    prohibitedClaimCodes: [...REQUIRED_PROHIBITIONS],
    evidenceRefs: fixed.status === "assessed" ? unique([...evidenceRefs, ...volumeEvidenceRefs]) : evidenceRefs,
    numericFactIds: numerics.map((value) => value.id),
  };
  return { finding, clauses, numerics };
}

export function eligibleContextualFindingIds(factPacket: ContextualFactPacket, asOf: string, snapshot = FIRST_CONTEXTUAL_SNAPSHOT): string[] {
  const result = evaluateContextualObservedCosts({ packet: factPacket, snapshot, asOf });
  const ids = result.observedLineItems.status === "assessed" ?
    [...result.observedLineItems.items, ...result.observedLineItems.creditsAndReversals].map((item) => `observed:${item.feeRowId}`) : [];
  if (result.fixedFeeBurden.status !== "not_assessed") ids.push(`fixed:${result.factPacketId}`);
  return unique(ids);
}

/** The caller curates an evaluation set from already eligible IDs; the model never sees excluded fee rows. */
export function buildGovernedAiInputPacket(input: {
  factPacket: ContextualFactPacket;
  fixtureId: string;
  asOf: string;
  includeFindingIds: string[];
  snapshot?: ContextualKnowledgeSnapshot;
}): GovernedAiInputPacket {
  const snapshot = input.snapshot ?? FIRST_CONTEXTUAL_SNAPSHOT;
  validateContextualSnapshot(snapshot);
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(input.fixtureId)) throw new Error("invalid_fixture_id");
  const result = evaluateContextualObservedCosts({ packet: input.factPacket, snapshot, asOf: input.asOf });
  if (result.observedLineItems.reasonCodes.includes("invalid_fact_packet") || !result.statementPeriod) throw new Error("invalid_contextual_fact_packet");
  const eligible = new Set(eligibleContextualFindingIds(input.factPacket, input.asOf, snapshot));
  if (input.includeFindingIds.length > 6 || new Set(input.includeFindingIds).size !== input.includeFindingIds.length ||
    input.includeFindingIds.some((id) => !eligible.has(id))) throw new Error("finding_not_preapproved");
  const observedRecord = snapshot.records.find((record) => record.id === result.observedLineItems.knowledgeRecordRef && record.ruleId === "observed_line_item_effect");
  const fixedRecord = snapshot.records.find((record) => record.id === result.fixedFeeBurden.knowledgeRecordRef && record.ruleId === "fixed_fee_burden");
  const allItems = [...result.observedLineItems.items, ...result.observedLineItems.creditsAndReversals];
  const parts: Array<{ finding: GovernedFinding; clauses: GovernedClause[]; numerics: GovernedNumericFact[] }> = [];
  for (const id of unique(input.includeFindingIds)) {
    if (id.startsWith("observed:")) {
      const item = allItems.find((value) => `observed:${value.feeRowId}` === id);
      if (!item || !observedRecord) throw new Error("observed_finding_not_resolved");
      parts.push(lineFinding(item, observedRecord.id, observedRecord.limitations));
    } else {
      if (id !== `fixed:${result.factPacketId}` || !fixedRecord) throw new Error("fixed_finding_not_resolved");
      parts.push(fixedFinding(result, input.factPacket.processedVolume.evidenceRefs, fixedRecord.id, fixedRecord.limitations));
    }
  }
  const unavailableStates: GovernedUnavailableState[] = [];
  if (result.observedLineItems.status === "not_assessed") unavailableStates.push({ kind: "observed_line_item_effect", status: "not_assessed", reasonCodes: [...result.observedLineItems.reasonCodes] });
  if (result.fixedFeeBurden.status === "not_assessed") unavailableStates.push({ kind: "fixed_fee_burden", status: "not_assessed", reasonCodes: [...result.fixedFeeBurden.reasonCodes] });
  if (result.fixedFeeBurden.status === "amount_only") unavailableStates.push({ kind: "fixed_burden_ratio", status: "unavailable", reasonCodes: [...result.fixedFeeBurden.reasonCodes] });
  const payload = {
    schemaVersion: GOVERNED_AI_PACKET_VERSION,
    mode: "offline_evaluation" as const,
    fixtureId: input.fixtureId,
    sourceDocumentRef: result.sourceDocumentRef,
    contextualFactPacketId: result.factPacketId,
    knowledgeSnapshotId: snapshot.snapshotId,
    selectionBasis: "product_curated_fixture_ids" as const,
    approvedFindingIds: parts.map((part) => part.finding.id),
    findings: parts.map((part) => part.finding),
    allowedClauses: parts.flatMap((part) => part.clauses),
    numericFacts: parts.flatMap((part) => part.numerics),
    unavailableStates,
    approvedNextDocuments: APPROVED_NEXT_DOCUMENTS.map((item) => ({ ...item })),
    prohibitedClaimCodes: [...REQUIRED_PROHIBITIONS],
  };
  return freeze({ ...payload, packetId: `governed_ai_${digest(payload)}` });
}

export function validateGovernedAiPacket(packet: GovernedAiInputPacket): boolean {
  try {
    const { packetId, ...payload } = packet;
    return packet.schemaVersion === GOVERNED_AI_PACKET_VERSION && packet.mode === "offline_evaluation" &&
      packetId === `governed_ai_${digest(payload)}` &&
      packet.approvedFindingIds.length === packet.findings.length &&
      packet.approvedFindingIds.every((id, index) => packet.findings[index]?.id === id) &&
      packet.findings.every((finding) => [...finding.prohibitedClaimCodes].sort().join("|") === [...REQUIRED_PROHIBITIONS].sort().join("|")) &&
      [...packet.prohibitedClaimCodes].sort().join("|") === [...REQUIRED_PROHIBITIONS].sort().join("|") &&
      packet.approvedNextDocuments.map((item) => item.code).join("|") === APPROVED_NEXT_DOCUMENTS.map((item) => item.code).join("|") &&
      packet.approvedNextDocuments.every((item, index) => item.rationale === APPROVED_NEXT_DOCUMENTS[index]?.rationale);
  } catch { return false; }
}

/** Fixed baseline for the same packet, used only to compare communication quality. */
export function deterministicTemplateCopy(packet: GovernedAiInputPacket): GovernedAiOutput {
  if (!validateGovernedAiPacket(packet)) throw new Error("invalid_governed_ai_packet");
  const selectedClauseIds = packet.findings.flatMap((finding) => packet.allowedClauses
    .filter((clause) => clause.findingId === finding.id &&
      (["observed_charge", "observed_credit", "fixed_total", "fixed_ratio", "ratio_unavailable", "changeability_unknown"] as string[]).includes(clause.claimCode))
    .map((clause) => clause.id));
  const clauses = selectedClauseIds.map((id) => packet.allowedClauses.find((clause) => clause.id === id)!);
  const nextDocumentCode: NextDocumentCode | null = packet.findings.length === 0 ? null :
    packet.unavailableStates.some((state) => state.kind === "fixed_burden_ratio")
      ? "second_consecutive_statement" : "pricing_schedule_rate_sheet";
  return {
    schemaVersion: GOVERNED_AI_OUTPUT_VERSION,
    selectedFindingIds: [...packet.approvedFindingIds], orderedFindingIds: [...packet.approvedFindingIds], selectedClauseIds,
    merchantExplanation: clauses.map((clause) => clause.text).join(" "),
    nextDocumentCode, rationale: nextDocumentCode === null ? "" : packet.approvedNextDocuments.find((item) => item.code === nextDocumentCode)!.rationale,
    evidenceRefsUsed: unique(clauses.flatMap((clause) => clause.evidenceRefs)),
    knowledgeRecordIdsUsed: unique(clauses.map((clause) => clause.knowledgeRecordId)),
  };
}
