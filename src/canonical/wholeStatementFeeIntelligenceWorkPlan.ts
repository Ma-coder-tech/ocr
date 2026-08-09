import { createHash } from "node:crypto";
import type { FeeKnowledgeSourcePacket } from "./feeKnowledgeTypes.js";
import type {
  CanonicalAiWholeStatementFeeIntelligenceOutput,
  CanonicalStatementAnalysis,
} from "./types.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
  buildWholeStatementFeeIntelligencePacket,
  validateWholeStatementFeeIntelligenceReviewForPacket,
  type ApprovedWholeStatementFeeIntelligenceSourceRegistry,
  type CanonicalWholeStatementFeeIntelligencePacket,
  type CanonicalWholeStatementFeeIntelligenceValidationResult,
} from "./wholeStatementFeeIntelligenceReview.js";
import { wholeStatementFeeIntelligenceProviderInputBytes } from "./wholeStatementFeeIntelligenceProviderInput.js";

export const WHOLE_STATEMENT_FEE_INTELLIGENCE_WORK_PLAN_POLICY_VERSION =
  "whole_statement_fee_intelligence_work_plan_v1" as const;

export type WholeStatementFeeIntelligenceWorkPlanMode = "production_selective" | "comprehensive";

export type WholeStatementFeeIntelligenceWorkUnitStatus =
  | "planned"
  | "selected"
  | "not_selected_policy"
  | "not_selected_budget"
  | "not_attempted_provider_unavailable"
  | "completed"
  | "failed"
  | "timed_out"
  | "rejected"
  | "safety_blocked";

export type WholeStatementFeeIntelligenceWorkUnitOutcomeClass =
  | "not_attempted"
  | "completed_exact_unit_coverage"
  | "provider_transport_failed"
  | "provider_refused"
  | "provider_schema_failed"
  | "output_length_exhausted"
  | "incomplete_response"
  | "timeout_watchdog"
  | "budget_not_selected"
  | "policy_not_selected"
  | "provider_unavailable_before_send"
  | "validation_rejected"
  | "safety_blocked";

export type WholeStatementFeeIntelligenceWorkPlanLimits = {
  maxRowsPerUnit: number;
  maxSelectedUnits: number;
  maxSelectedRows: number;
  maxAggregateInputBytes: number | null;
  maxAggregateOutputTokens: number | null;
  outputTokensPerRowEstimate: number;
  outputTokenOverheadPerUnit: number;
};

export type WholeStatementFeeIntelligenceWorkUnit = {
  workUnitRef: string;
  ordinal: number;
  status: WholeStatementFeeIntelligenceWorkUnitStatus;
  selectionReasonCodes: string[];
  expectedFeeRowRefs: string[];
  packet: CanonicalWholeStatementFeeIntelligencePacket;
  packetContentHash: string;
  estimatedInputBytes: number;
  estimatedOutputTokens: number;
  outputTokenCeiling: number | null;
};

export type WholeStatementFeeIntelligenceWorkPlan = {
  type: "whole_statement_fee_intelligence_work_plan";
  policyVersion: typeof WHOLE_STATEMENT_FEE_INTELLIGENCE_WORK_PLAN_POLICY_VERSION;
  mode: WholeStatementFeeIntelligenceWorkPlanMode;
  statementAnalysisRef: string;
  statementPacketContentHash: string;
  expectedFeeRowRefs: string[];
  plannedFeeRowRefs: string[];
  selectedFeeRowRefs: string[];
  notSelectedFeeRowRefs: string[];
  limits: WholeStatementFeeIntelligenceWorkPlanLimits;
  units: WholeStatementFeeIntelligenceWorkUnit[];
  reasonCodes: string[];
};

export type WholeStatementFeeIntelligenceWorkUnitResult = {
  workUnitRef: string;
  status: Exclude<WholeStatementFeeIntelligenceWorkUnitStatus, "planned" | "selected">;
  outcomeClass: WholeStatementFeeIntelligenceWorkUnitOutcomeClass;
  validation: CanonicalWholeStatementFeeIntelligenceValidationResult | null;
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  billingDisposition: "observed" | "provider_confirmed_zero" | "unknown" | "pending";
  reasonCodes: string[];
};

export type WholeStatementFeeIntelligenceMergedWorkPlan = {
  plan: WholeStatementFeeIntelligenceWorkPlan;
  workUnitResults: WholeStatementFeeIntelligenceWorkUnitResult[];
  output: CanonicalAiWholeStatementFeeIntelligenceOutput;
  validation: CanonicalWholeStatementFeeIntelligenceValidationResult;
  selectedWorkUnitCount: number;
  completedWorkUnitCount: number;
  unavailableWorkUnitCount: number;
  notSelectedWorkUnitCount: number;
  reasonCodes: string[];
};

const DEFAULT_LIMITS: WholeStatementFeeIntelligenceWorkPlanLimits = {
  maxRowsPerUnit: 18,
  maxSelectedUnits: 20,
  maxSelectedRows: 360,
  maxAggregateInputBytes: null,
  maxAggregateOutputTokens: null,
  outputTokensPerRowEstimate: 92,
  outputTokenOverheadPerUnit: 260,
};

export function buildWholeStatementFeeIntelligenceWorkPlan(input: {
  packet: CanonicalWholeStatementFeeIntelligencePacket;
  mode?: WholeStatementFeeIntelligenceWorkPlanMode;
  limits?: Partial<WholeStatementFeeIntelligenceWorkPlanLimits>;
}): WholeStatementFeeIntelligenceWorkPlan {
  const mode = input.mode ?? "comprehensive";
  const limits = normalizeLimits(input.limits);
  const rows = selectRowsForMode(input.packet, mode);
  const chunks = chunk(rows, limits.maxRowsPerUnit);
  const units: WholeStatementFeeIntelligenceWorkUnit[] = [];
  let aggregateInputBytes = 0;
  let aggregateOutputTokens = 0;
  let selectedUnits = 0;
  let selectedRows = 0;

  chunks.forEach((rowChunk, index) => {
    const expectedFeeRowRefs = rowChunk.map((row) => row.feeRowRef).sort();
    const packet = slicePacketForRows(input.packet, expectedFeeRowRefs);
    const estimatedInputBytes = wholeStatementFeeIntelligenceProviderInputBytes(packet);
    const estimatedOutputTokens = limits.outputTokenOverheadPerUnit + expectedFeeRowRefs.length * limits.outputTokensPerRowEstimate;
    const policyBlocked = selectedUnits >= limits.maxSelectedUnits || selectedRows + expectedFeeRowRefs.length > limits.maxSelectedRows;
    const budgetBlocked =
      !policyBlocked &&
      ((limits.maxAggregateInputBytes !== null && aggregateInputBytes + estimatedInputBytes > limits.maxAggregateInputBytes) ||
        (limits.maxAggregateOutputTokens !== null && aggregateOutputTokens + estimatedOutputTokens > limits.maxAggregateOutputTokens));
    const status = policyBlocked ? "not_selected_policy" : budgetBlocked ? "not_selected_budget" : "selected";
    if (status === "selected") {
      selectedUnits += 1;
      selectedRows += expectedFeeRowRefs.length;
      aggregateInputBytes += estimatedInputBytes;
      aggregateOutputTokens += estimatedOutputTokens;
    }
    units.push({
      workUnitRef: workUnitRef(input.packet, mode, index + 1, expectedFeeRowRefs),
      ordinal: index + 1,
      status,
      selectionReasonCodes: status === "selected"
        ? ["whole_statement_fee_intelligence_work_unit_selected"]
        : status === "not_selected_budget"
          ? ["whole_statement_fee_intelligence_work_unit_not_selected_budget"]
          : ["whole_statement_fee_intelligence_work_unit_not_selected_policy"],
      expectedFeeRowRefs,
      packet,
      packetContentHash: sha256Canonical(packet),
      estimatedInputBytes,
      estimatedOutputTokens,
      outputTokenCeiling: limits.maxAggregateOutputTokens === null
        ? null
        : Math.min(estimatedOutputTokens, Math.max(0, limits.maxAggregateOutputTokens - aggregateOutputTokens + (status === "selected" ? estimatedOutputTokens : 0))),
    });
  });

  const selectedFeeRowRefs = units.filter((unit) => unit.status === "selected").flatMap((unit) => unit.expectedFeeRowRefs).sort();
  const selectedSet = new Set(selectedFeeRowRefs);
  return {
    type: "whole_statement_fee_intelligence_work_plan",
    policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_WORK_PLAN_POLICY_VERSION,
    mode,
    statementAnalysisRef: input.packet.statementAnalysisRef,
    statementPacketContentHash: sha256Canonical(input.packet),
    expectedFeeRowRefs: input.packet.admittedFeeRows.map((row) => row.feeRowRef).sort(),
    plannedFeeRowRefs: rows.map((row) => row.feeRowRef).sort(),
    selectedFeeRowRefs,
    notSelectedFeeRowRefs: rows.map((row) => row.feeRowRef).filter((ref) => !selectedSet.has(ref)).sort(),
    limits,
    units,
    reasonCodes: [...new Set([
      `whole_statement_fee_intelligence_${mode}_work_plan`,
      units.some((unit) => unit.status === "not_selected_budget") ? "whole_statement_fee_intelligence_budget_limited" : "",
      units.some((unit) => unit.status === "not_selected_policy") ? "whole_statement_fee_intelligence_policy_limited" : "",
    ].filter(Boolean))].sort(),
  };
}

export function notSelectedWholeStatementFeeIntelligenceWorkUnitResult(
  unit: WholeStatementFeeIntelligenceWorkUnit,
): WholeStatementFeeIntelligenceWorkUnitResult {
  const budget = unit.status === "not_selected_budget";
  return {
    workUnitRef: unit.workUnitRef,
    status: budget ? "not_selected_budget" : "not_selected_policy",
    outcomeClass: budget ? "budget_not_selected" : "policy_not_selected",
    validation: null,
    requestId: null,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    billingDisposition: "provider_confirmed_zero",
    reasonCodes: unit.selectionReasonCodes,
  };
}

export function providerUnavailableWholeStatementFeeIntelligenceWorkUnitResult(input: {
  workUnitRef: string;
  reasonCodes?: readonly string[];
}): WholeStatementFeeIntelligenceWorkUnitResult {
  return {
    workUnitRef: input.workUnitRef,
    status: "not_attempted_provider_unavailable",
    outcomeClass: "provider_unavailable_before_send",
    validation: null,
    requestId: null,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    billingDisposition: "provider_confirmed_zero",
    reasonCodes: unique([
      "whole_statement_fee_intelligence_provider_unavailable_before_send",
      ...(input.reasonCodes ?? []),
    ]).sort(),
  };
}

export function classifyWholeStatementFeeIntelligenceWorkUnitFailure(error: unknown): {
  status: "failed" | "timed_out" | "safety_blocked";
  outcomeClass: WholeStatementFeeIntelligenceWorkUnitOutcomeClass;
  reasonCodes: string[];
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
} {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const reasonCodes = safeReasonCodes(record.reasonCodes, typeof record.reasonCode === "string" ? record.reasonCode : "provider_transport_failed");
  const primary = reasonCodes[0] ?? "provider_transport_failed";
  const timedOut = primary.includes("timed_out") || /timeout|timed out/i.test(error instanceof Error ? error.message : "");
  const safetyBlocked = primary.includes("safety") || primary.includes("refused");
  return {
    status: timedOut ? "timed_out" : safetyBlocked ? "safety_blocked" : "failed",
    outcomeClass: timedOut ? "timeout_watchdog"
      : primary.includes("refused") ? "provider_refused"
        : primary.includes("schema") || primary.includes("parse") ? "provider_schema_failed"
          : primary.includes("length") || primary.includes("context") || primary.includes("maximum") ? "output_length_exhausted"
            : safetyBlocked ? "safety_blocked" : "provider_transport_failed",
    reasonCodes,
    requestId: safeString((record.accounting as Record<string, unknown> | undefined)?.requestId),
    inputTokens: safeNumber((record.accounting as Record<string, unknown> | undefined)?.inputTokens),
    cachedInputTokens: safeNumber((record.accounting as Record<string, unknown> | undefined)?.cachedInputTokens),
    outputTokens: safeNumber((record.accounting as Record<string, unknown> | undefined)?.outputTokens),
    durationMs: safeNumber((record.accounting as Record<string, unknown> | undefined)?.durationMs),
  };
}

export function wholeStatementFeeIntelligenceWorkUnitResultFromValidation(input: {
  unit: WholeStatementFeeIntelligenceWorkUnit;
  validation: CanonicalWholeStatementFeeIntelligenceValidationResult;
  requestId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  billingDisposition: "observed" | "provider_confirmed_zero" | "unknown" | "pending";
}): WholeStatementFeeIntelligenceWorkUnitResult {
  const ok = input.validation.ok && input.validation.output.reviewStatus === "completed";
  return {
    workUnitRef: input.unit.workUnitRef,
    status: ok ? "completed" : input.validation.output.reviewStatus === "safety_blocked" ? "safety_blocked" : "rejected",
    outcomeClass: ok ? "completed_exact_unit_coverage"
      : input.validation.errors.some((error) => /completion_without_exact_coverage|missing_reviewed_row/.test(error)) ? "incomplete_response"
        : input.validation.errors.some((error) => /schema|unknown_key|type_invalid|policy_version/.test(error)) ? "provider_schema_failed"
          : input.validation.output.reviewStatus === "safety_blocked" ? "safety_blocked" : "validation_rejected",
    validation: input.validation,
    requestId: input.requestId,
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
    durationMs: input.durationMs,
    billingDisposition: input.billingDisposition,
    reasonCodes: ok ? ["whole_statement_fee_intelligence_work_unit_completed"] : input.validation.output.reasonCodes,
  };
}

export function mergeWholeStatementFeeIntelligenceWorkUnitResults(input: {
  analysis: Pick<CanonicalStatementAnalysis, "identity" | "feeLedger" | "feeOwnershipActionability" | "evidence">;
  registry?: ApprovedWholeStatementFeeIntelligenceSourceRegistry;
  sourcePacket: FeeKnowledgeSourcePacket;
  fullPacket: CanonicalWholeStatementFeeIntelligencePacket;
  plan: WholeStatementFeeIntelligenceWorkPlan;
  results: WholeStatementFeeIntelligenceWorkUnitResult[];
}): WholeStatementFeeIntelligenceMergedWorkPlan {
  const selectedUnits = input.plan.units.filter((unit) => unit.status === "selected");
  const resultByUnit = new Map(input.results.map((result) => [result.workUnitRef, result]));
  const mergeErrors: string[] = [];
  const rawInterpretations: unknown[] = [];
  const evidenceRefs: string[] = [];
  const factRefs: string[] = [];
  const limitationCodes: string[] = [];
  const reasonCodes: string[] = [...input.plan.reasonCodes];

  for (const unit of selectedUnits) {
    const result = resultByUnit.get(unit.workUnitRef);
    if (!result) {
      mergeErrors.push("whole_statement_fee_intelligence_work_unit_result_missing");
      continue;
    }
    reasonCodes.push(...result.reasonCodes);
    if (!result.validation?.ok || result.validation.output.reviewStatus !== "completed") continue;
    rawInterpretations.push(...result.validation.output.rowInterpretations);
    evidenceRefs.push(...result.validation.output.evidenceRefs);
    factRefs.push(...result.validation.output.factRefs);
    limitationCodes.push(...result.validation.output.limitationCodes);
  }

  for (const result of input.results) {
    if (!input.plan.units.some((unit) => unit.workUnitRef === result.workUnitRef)) {
      mergeErrors.push("whole_statement_fee_intelligence_foreign_work_unit_result");
    }
  }

  const allSelectedCompleted = selectedUnits.every((unit) => resultByUnit.get(unit.workUnitRef)?.status === "completed");
  const anyCompleted = selectedUnits.some((unit) => resultByUnit.get(unit.workUnitRef)?.status === "completed");
  const rawReview = {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    reviewStatus: allSelectedCompleted && input.plan.notSelectedFeeRowRefs.length === 0 ? "completed" : anyCompleted ? "partial" : "failed",
    evidenceRefs: unique(evidenceRefs).sort(),
    factRefs: unique(factRefs).sort(),
    limitationCodes: unique([
      ...limitationCodes,
      ...(allSelectedCompleted && input.plan.notSelectedFeeRowRefs.length === 0 ? [] : ["whole_statement_fee_intelligence_review_required"]),
      ...(selectedUnits.some((unit) => resultByUnit.get(unit.workUnitRef)?.status !== "completed") ? ["provider_unavailable"] : []),
    ]).sort(),
    rowInterpretations: rawInterpretations,
    reasonCodes: unique([
      anyCompleted ? "whole_statement_fee_intelligence_reviewed" : "whole_statement_fee_intelligence_failed",
      ...(allSelectedCompleted ? [] : ["whole_statement_fee_intelligence_partial_work_unit_coverage"]),
      ...mergeErrors,
    ]).filter((code) => /^whole_statement_fee_intelligence_[a-z0-9_]{1,90}$/.test(code)).sort(),
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
  const validation = validateWholeStatementFeeIntelligenceReviewForPacket(
    rawReview,
    input.fullPacket,
    input.analysis,
    input.registry,
    input.sourcePacket,
  );
  const notSelectedWorkUnitCount = input.results.filter((result) =>
    result.status === "not_selected_budget" ||
    result.status === "not_selected_policy" ||
    result.status === "not_attempted_provider_unavailable"
  ).length;
  const unavailableWorkUnitCount = input.results.filter((result) => ["failed", "timed_out", "rejected", "safety_blocked"].includes(result.status)).length;
  return {
    plan: input.plan,
    workUnitResults: input.results.sort((left, right) => left.workUnitRef.localeCompare(right.workUnitRef)),
    output: validation.output,
    validation,
    selectedWorkUnitCount: input.results.length - notSelectedWorkUnitCount,
    completedWorkUnitCount: input.results.filter((result) => result.status === "completed").length,
    unavailableWorkUnitCount,
    notSelectedWorkUnitCount,
    reasonCodes: unique([...reasonCodes, ...validation.output.reasonCodes]).sort(),
  };
}

function selectRowsForMode(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  mode: WholeStatementFeeIntelligenceWorkPlanMode,
): CanonicalWholeStatementFeeIntelligencePacket["admittedFeeRows"] {
  if (mode === "comprehensive") return [...packet.admittedFeeRows].sort(byRowRef);
  return packet.admittedFeeRows
    .filter((row) =>
      row.currentLimitations.length > 0 ||
      row.currentDeterministicCandidates.some((candidate) => candidate.confidence !== "high" || candidate.actionabilityCeiling !== "not_actionable") ||
      packet.sourceProvenancePacket.rowPackets.some((rowPacket) =>
        rowPacket.feeRowRef === row.feeRowRef &&
        (rowPacket.applicableApprovedClaimSupportRefs.length > 0 ||
          rowPacket.runtimeVerifiedClaimSupportRefs.length > 0 ||
          rowPacket.absenceOrFailureAttemptRefs.length > 0 ||
          rowPacket.contradictionRefs.length > 0),
      ),
    )
    .sort(byRowRef);
}

function slicePacketForRows(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  expectedFeeRowRefs: readonly string[],
): CanonicalWholeStatementFeeIntelligencePacket {
  const rowRefs = new Set(expectedFeeRowRefs);
  const sourcePacket = packet.sourceProvenancePacket;
  const sourceMatches = sourcePacket.sourceMatches.filter((item) => rowRefs.has(item.feeRowRef));
  const researchAttempts = sourcePacket.researchAttempts.filter((item) => rowRefs.has(item.feeRowRef));
  const researchAttemptRefs = new Set(researchAttempts.map((item) => item.attemptId));
  const researchCandidates = sourcePacket.researchCandidates.filter((item) => rowRefs.has(item.feeRowRef) && researchAttemptRefs.has(item.attemptId));
  const candidateRefs = new Set(researchCandidates.map((item) => item.candidateId));
  const claimSupports = sourcePacket.claimSupports.filter((item) => rowRefs.has(item.feeRowRef) && (item.candidateId === null || candidateRefs.has(item.candidateId)));
  const claimSupportRefs = new Set(claimSupports.map((item) => item.claimSupportId));
  const provenanceDecisions = sourcePacket.provenanceDecisions.filter((item) =>
    rowRefs.has(item.feeRowRef) &&
    (item.candidateId === null || candidateRefs.has(item.candidateId)) &&
    (item.claimSupportId === null || claimSupportRefs.has(item.claimSupportId)),
  );
  const rowPackets = sourcePacket.rowPackets.filter((item) => rowRefs.has(item.feeRowRef)).map((rowPacket) => ({
    ...rowPacket,
    applicableApprovedClaimSupportRefs: rowPacket.applicableApprovedClaimSupportRefs.filter((ref) => claimSupportRefs.has(ref)).sort(),
    runtimeVerifiedClaimSupportRefs: rowPacket.runtimeVerifiedClaimSupportRefs.filter((ref) => claimSupportRefs.has(ref)).sort(),
    verifiedCandidateRefs: rowPacket.verifiedCandidateRefs.filter((ref) => candidateRefs.has(ref)).sort(),
    absenceOrFailureAttemptRefs: rowPacket.absenceOrFailureAttemptRefs.filter((ref) => researchAttemptRefs.has(ref)).sort(),
    contradictionRefs: rowPacket.contradictionRefs.filter((ref) => provenanceDecisions.some((decision) => decision.decisionId === ref)).sort(),
    permittedProvenanceChoices: rowPacket.permittedProvenanceChoices.filter((choice) =>
      choice.claimSupportId === null || claimSupportRefs.has(choice.claimSupportId),
    ),
  }));
  return {
    ...packet,
    admittedFeeRows: packet.admittedFeeRows.filter((row) => rowRefs.has(row.feeRowRef)).sort(byRowRef),
    approvedExternalSourceRefs: packet.approvedExternalSourceRefs.filter((ref) =>
      claimSupports.some((support) => support.claimSupportId === ref || support.sourceId === ref || support.claimId === ref),
    ).sort(),
    sourceProvenancePacket: {
      ...sourcePacket,
      rowPackets,
      sourceMatches,
      researchAttempts,
      researchCandidates,
      claimSupports,
      provenanceDecisions,
      customerSafeSources: sourcePacket.customerSafeSources.filter((source) =>
        claimSupports.some((support) => support.sourceId === source.sourceId),
      ),
    },
  };
}

function normalizeLimits(input: Partial<WholeStatementFeeIntelligenceWorkPlanLimits> | undefined): WholeStatementFeeIntelligenceWorkPlanLimits {
  return {
    maxRowsPerUnit: positiveInteger(input?.maxRowsPerUnit, DEFAULT_LIMITS.maxRowsPerUnit),
    maxSelectedUnits: positiveInteger(input?.maxSelectedUnits, DEFAULT_LIMITS.maxSelectedUnits),
    maxSelectedRows: positiveInteger(input?.maxSelectedRows, DEFAULT_LIMITS.maxSelectedRows),
    maxAggregateInputBytes: nonnegativeIntegerOrNull(input?.maxAggregateInputBytes ?? DEFAULT_LIMITS.maxAggregateInputBytes),
    maxAggregateOutputTokens: nonnegativeIntegerOrNull(input?.maxAggregateOutputTokens ?? DEFAULT_LIMITS.maxAggregateOutputTokens),
    outputTokensPerRowEstimate: positiveInteger(input?.outputTokensPerRowEstimate, DEFAULT_LIMITS.outputTokensPerRowEstimate),
    outputTokenOverheadPerUnit: positiveInteger(input?.outputTokenOverheadPerUnit, DEFAULT_LIMITS.outputTokenOverheadPerUnit),
  };
}

function workUnitRef(
  packet: CanonicalWholeStatementFeeIntelligencePacket,
  mode: WholeStatementFeeIntelligenceWorkPlanMode,
  ordinal: number,
  rowRefs: readonly string[],
): string {
  return `whole_stmt_work_${sha256Canonical({
    policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_WORK_PLAN_POLICY_VERSION,
    statementAnalysisRef: packet.statementAnalysisRef,
    mode,
    ordinal,
    rowRefs,
  }).slice(0, 32)}`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function byRowRef(
  left: CanonicalWholeStatementFeeIntelligencePacket["admittedFeeRows"][number],
  right: CanonicalWholeStatementFeeIntelligencePacket["admittedFeeRows"][number],
): number {
  return left.feeRowRef.localeCompare(right.feeRowRef);
}

function positiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function nonnegativeIntegerOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function safeNumber(value: unknown): number | null {
  return Number.isFinite(value) && Number(value) >= 0 ? Number(value) : null;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : null;
}

function safeReasonCodes(value: unknown, fallback: string): string[] {
  const source = Array.isArray(value) ? value : [fallback];
  const safe = source.filter((item): item is string => typeof item === "string" && /^[a-z0-9_]{1,120}$/i.test(item));
  return unique(safe.length > 0 ? safe : [fallback]).sort();
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}
