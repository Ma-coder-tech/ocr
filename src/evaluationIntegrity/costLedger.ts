import { EvaluationIntegrityError } from "./errors.js";
import type {
  CostBudgetLedgerSnapshot,
  CostCallStatus,
  CostCapability,
  CostLedgerEntry,
  CostOperationKind,
  CostReservationScope,
  CostToolEvent,
  EvaluationPricingPolicy,
} from "./types.js";
import { calculateWorstCaseCostUsd } from "./providerAccounting.js";
import { EVALUATION_COST_LEDGER_VERSION } from "./types.js";

export const EVALUATION_COST_CURRENCY = "USD" as const;
export const EVALUATION_COST_FIXED_POINT_SCALE = 1_000_000_000;

export type CostReservationInput = {
  callId: string;
  parentCallId?: string | null;
  operationKind?: CostOperationKind;
  operationRef?: string | null;
  reservationScope?: CostReservationScope;
  attempt: number;
  retryOfCallId?: string | null;
  capability: CostCapability;
  pricingPolicyRef: string;
  providerRoute: string;
  provider: string;
  model: string | null;
  toolClass: string;
  maximumInputTokens: number | null;
  maximumOutputTokens: number | null;
  maximumToolUses: number | null;
  pricing?: EvaluationPricingPolicy | null;
  estimatedMaximumCostUsd: number;
  startedAt?: string;
};

export type CostFinalizeInput = {
  status: Exclude<CostCallStatus, "reserved">;
  requestId?: string | null;
  endedAt?: string;
  durationMs: number;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  toolEvents?: CostToolEvent[];
  observedOrEstimatedFinalCostUsd?: number | null;
  billingDisposition: "observed" | "provider_confirmed_zero" | "unknown";
};

export class EvaluationCostBudgetLedger {
  readonly approvedBudgetUsd: number;
  private readonly approvedBudgetUnits: number;
  private readonly entries: CostLedgerEntry[] = [];

  constructor(approvedBudgetUsd: number) {
    this.approvedBudgetUnits = usdUnits(approvedBudgetUsd);
    if (this.approvedBudgetUnits <= 0) throw new Error("Approved evaluation budget must be greater than zero.");
    this.approvedBudgetUsd = unitsUsd(this.approvedBudgetUnits);
  }

  reserve(input: CostReservationInput): CostLedgerEntry {
    if (this.entries.some((entry) => entry.callId === input.callId)) throw new Error(`Cost ledger call ID already exists: ${input.callId}`);
    assertReservationProvenance(input, this.entries);
    const reservationUnits = usdUnits(input.estimatedMaximumCostUsd);
    if (reservationUnits <= 0) throw new Error("Every provider call requires a positive maximum cost reservation.");
    if (input.pricing) {
      const calculatedWorstCaseUnits = usdUnits(calculateWorstCaseCostUsd(input));
      if (reservationUnits < calculatedWorstCaseUnits) {
        throw new EvaluationIntegrityError(
          "insufficient_budget_reservation",
          "The call reservation is below its policy-calculated worst-case cost.",
          {
            requestedReservationUsd: unitsUsd(reservationUnits),
            calculatedWorstCaseUsd: unitsUsd(calculatedWorstCaseUnits),
          },
        );
      }
    }
    const committedBefore = this.committedUnits();
    const envelopeParent = this.coveringEnvelopeFor(input);
    if (envelopeParent) {
      const childReservedUnits = this.entries
        .filter((entry) => entry.parentCallId === envelopeParent.callId)
        .reduce((sum, entry) => sum + usdUnits(entry.estimatedMaximumCostUsd), 0);
      if (childReservedUnits + reservationUnits > usdUnits(envelopeParent.estimatedMaximumCostUsd)) {
        throw new EvaluationIntegrityError(
          "insufficient_budget_reservation",
          "Remaining Package 5B envelope budget cannot cover the work-unit reservation.",
          {
            parentCallId: envelopeParent.callId,
            remainingBudgetUsd: unitsUsd(usdUnits(envelopeParent.estimatedMaximumCostUsd) - childReservedUnits),
            requestedReservationUsd: unitsUsd(reservationUnits),
          },
        );
      }
    } else if (committedBefore + reservationUnits > this.approvedBudgetUnits) {
      throw new EvaluationIntegrityError(
        "insufficient_budget_reservation",
        "Remaining approved budget cannot cover the call's worst-case reservation.",
        {
          remainingBudgetUsd: unitsUsd(this.approvedBudgetUnits - committedBefore),
          requestedReservationUsd: unitsUsd(reservationUnits),
        },
      );
    }
    const entry: CostLedgerEntry = {
      callId: input.callId,
      parentCallId: input.parentCallId ?? null,
      operationKind: input.operationKind ?? "manifest_call",
      operationRef: input.operationRef ?? null,
      reservationScope: input.reservationScope ?? "provider_send",
      attempt: input.attempt,
      attemptKind: input.retryOfCallId ? "retry" : "initial",
      retryOfCallId: input.retryOfCallId ?? null,
      capability: input.capability,
      currency: EVALUATION_COST_CURRENCY,
      fixedPointScale: EVALUATION_COST_FIXED_POINT_SCALE,
      pricingPolicyRef: input.pricingPolicyRef,
      providerRoute: input.providerRoute,
      provider: input.provider,
      model: input.model,
      toolClass: input.toolClass,
      maximumInputTokens: input.maximumInputTokens,
      maximumOutputTokens: input.maximumOutputTokens,
      maximumToolUses: input.maximumToolUses,
      requestId: null,
      startedAt: input.startedAt ?? new Date().toISOString(),
      endedAt: null,
      durationMs: null,
      status: "reserved",
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      toolEvents: [],
      estimatedMaximumCostUsd: unitsUsd(reservationUnits),
      worstCaseReservedCostUsd: unitsUsd(reservationUnits),
      observedOrEstimatedFinalCostUsd: null,
      billingDisposition: "pending",
      cumulativeReservedUsd: unitsUsd(this.reservedHistoricalUnits() + reservationUnits),
      cumulativeObservedUsd: unitsUsd(this.observedUnits()),
      cumulativeBudgetCommittedUsd: unitsUsd(envelopeParent ? committedBefore : committedBefore + reservationUnits),
      cumulativeReleasedUsd: unitsUsd(this.releasedUnits()),
      remainingBudgetUsd: unitsUsd(this.approvedBudgetUnits - committedBefore - (envelopeParent ? 0 : reservationUnits)),
    };
    this.entries.push(entry);
    return structuredClone(entry);
  }

  finalize(callId: string, input: CostFinalizeInput): CostLedgerEntry {
    const entry = this.entries.find((item) => item.callId === callId);
    if (!entry) throw new Error(`Cost ledger call ID was not reserved: ${callId}`);
    if (entry.status !== "reserved") throw new Error(`Cost ledger call was already finalized: ${callId}`);
    const observedUnits = input.observedOrEstimatedFinalCostUsd === null || input.observedOrEstimatedFinalCostUsd === undefined
      ? null
      : usdUnits(input.observedOrEstimatedFinalCostUsd);
    const reservedUnits = usdUnits(entry.estimatedMaximumCostUsd);
    const exceededReservation = observedUnits !== null && observedUnits > reservedUnits;
    entry.status = exceededReservation ? "failure" : input.status;
    entry.requestId = input.requestId ?? null;
    entry.endedAt = input.endedAt ?? new Date().toISOString();
    entry.durationMs = input.durationMs;
    entry.inputTokens = input.inputTokens ?? null;
    entry.cachedInputTokens = input.cachedInputTokens ?? null;
    entry.outputTokens = input.outputTokens ?? null;
    entry.toolEvents = [...(input.toolEvents ?? [])].sort((left, right) => left.type.localeCompare(right.type));
    entry.observedOrEstimatedFinalCostUsd = observedUnits === null ? null : unitsUsd(observedUnits);
    entry.billingDisposition = input.billingDisposition;
    entry.cumulativeReservedUsd = unitsUsd(this.reservedHistoricalUnits());
    entry.cumulativeObservedUsd = unitsUsd(this.observedUnits());
    entry.cumulativeBudgetCommittedUsd = unitsUsd(this.committedUnits());
    entry.cumulativeReleasedUsd = unitsUsd(this.releasedUnits());
    entry.remainingBudgetUsd = unitsUsd(this.approvedBudgetUnits - this.committedUnits());
    if (exceededReservation) {
      throw new EvaluationIntegrityError("cost_exceeded_reservation", "Observed cost exceeded the pre-call maximum reservation.", {
        callId,
        reservedUsd: unitsUsd(reservedUnits),
        observedUsd: unitsUsd(observedUnits!),
      });
    }
    return structuredClone(entry);
  }

  snapshot(): CostBudgetLedgerSnapshot {
    const committed = this.committedUnits();
    return {
      type: EVALUATION_COST_LEDGER_VERSION,
      currency: EVALUATION_COST_CURRENCY,
      fixedPointScale: EVALUATION_COST_FIXED_POINT_SCALE,
      approvedBudgetUsd: this.approvedBudgetUsd,
      cumulativeReservedUsd: unitsUsd(this.reservedHistoricalUnits()),
      cumulativeObservedUsd: unitsUsd(this.observedUnits()),
      cumulativeBudgetCommittedUsd: unitsUsd(committed),
      cumulativeReleasedUsd: unitsUsd(this.releasedUnits()),
      remainingBudgetUsd: unitsUsd(this.approvedBudgetUnits - committed),
      blocked: committed >= this.approvedBudgetUnits,
      entries: structuredClone(this.entries),
    };
  }

  assertReadyToSend(callId: string): CostLedgerEntry {
    const entry = this.entries.find((item) => item.callId === callId);
    if (!entry) throw new Error(`Cost ledger call ID was not reserved: ${callId}`);
    if (entry.status !== "reserved") throw new Error(`Cost ledger call is not sendable: ${callId}`);
    const committed = this.committedUnits();
    if (committed > this.approvedBudgetUnits) {
      throw new EvaluationIntegrityError(
        "insufficient_budget_reservation",
        "Committed spend exceeds the approved run budget before provider send.",
      );
    }
    return structuredClone(entry);
  }

  private reservedHistoricalUnits(): number {
    return this.entries.reduce((sum, entry) => sum + usdUnits(entry.estimatedMaximumCostUsd), 0);
  }

  private observedUnits(): number {
    return this.entries.reduce((sum, entry) => {
      if (entry.billingDisposition !== "observed") return sum;
      return sum + usdUnits(entry.observedOrEstimatedFinalCostUsd ?? 0);
    }, 0);
  }

  private committedUnits(): number {
    return this.entries.reduce((sum, entry) => {
      if (this.isCoveredChildWhileEnvelopeOpen(entry)) return sum;
      if (entry.reservationScope === "budget_envelope"
        && entry.status !== "reserved"
        && entry.billingDisposition !== "pending"
        && entry.billingDisposition !== "unknown") {
        return sum;
      }
      if (entry.status === "reserved" || entry.billingDisposition === "pending" || entry.billingDisposition === "unknown") {
        return sum + usdUnits(entry.estimatedMaximumCostUsd);
      }
      if (entry.billingDisposition === "provider_confirmed_zero") return sum;
      return sum + usdUnits(entry.observedOrEstimatedFinalCostUsd ?? entry.estimatedMaximumCostUsd);
    }, 0);
  }

  private releasedUnits(): number {
    return Math.max(0, this.reservedHistoricalUnits() - this.committedUnits());
  }

  private coveringEnvelopeFor(input: CostReservationInput): CostLedgerEntry | null {
    const parentCallId = input.parentCallId ?? null;
    if (!parentCallId) return null;
    const parent = this.entries.find((entry) => entry.callId === parentCallId);
    if (!parent || parent.reservationScope !== "budget_envelope") return null;
    if (parent.status !== "reserved") throw new Error("A child reservation cannot use a finalized budget envelope.");
    return parent;
  }

  private isCoveredChildWhileEnvelopeOpen(entry: CostLedgerEntry): boolean {
    if (!entry.parentCallId) return false;
    const parent = this.entries.find((item) => item.callId === entry.parentCallId);
    return Boolean(parent
      && parent.reservationScope === "budget_envelope"
      && (parent.status === "reserved" || parent.billingDisposition === "pending" || parent.billingDisposition === "unknown"));
  }
}

export async function executeBudgetedProviderCall<T>(input: {
  ledger: EvaluationCostBudgetLedger;
  reservation: CostReservationInput;
  invoke: () => Promise<{
    value: T;
    accounting: Omit<CostFinalizeInput, "status" | "billingDisposition"> & {
      billingDisposition?: "observed" | "provider_confirmed_zero";
    };
  }>;
}): Promise<T> {
  input.ledger.reserve(input.reservation);
  const started = Date.now();
  let result: Awaited<ReturnType<typeof input.invoke>>;
  try {
    result = await input.invoke();
  } catch (error) {
    input.ledger.finalize(input.reservation.callId, {
      status: "failure",
      durationMs: Math.max(0, Date.now() - started),
      billingDisposition: "unknown",
    });
    throw error;
  }
  input.ledger.finalize(input.reservation.callId, {
    ...result.accounting,
    status: "success",
    billingDisposition: result.accounting.billingDisposition ?? "observed",
  });
  return result.value;
}

function usdUnits(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("USD cost values must be finite and nonnegative.");
  return Math.round(value * EVALUATION_COST_FIXED_POINT_SCALE);
}

function unitsUsd(value: number): number {
  return Number((value / EVALUATION_COST_FIXED_POINT_SCALE).toFixed(9));
}

function assertReservationProvenance(input: CostReservationInput, entries: CostLedgerEntry[]): void {
  if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error("Cost-ledger attempt must be a positive integer.");
  const operationKind = input.operationKind ?? "manifest_call";
  const reservationScope = input.reservationScope ?? "provider_send";
  if (!["manifest_call", "package_5b_budget_envelope", "package_5b_work_unit"].includes(operationKind)) throw new Error("Cost-ledger operation kind is invalid.");
  if (!["provider_send", "budget_envelope"].includes(reservationScope)) throw new Error("Cost-ledger reservation scope is invalid.");
  if (reservationScope === "budget_envelope" && operationKind !== "package_5b_budget_envelope") throw new Error("Budget envelopes must identify their owning operation kind.");
  if (operationKind === "package_5b_work_unit" && !input.parentCallId) throw new Error("Package 5B work-unit reservations must identify their parent envelope.");
  if (input.parentCallId && !input.operationRef) throw new Error("Child reservations must identify a safe operation reference.");
  if (input.operationRef !== null && input.operationRef !== undefined && !/^[A-Za-z0-9_.:-]{1,160}$/.test(input.operationRef)) throw new Error("Cost-ledger operation reference is not safe.");
  for (const [name, value] of [
    ["pricing policy reference", input.pricingPolicyRef],
    ["provider route", input.providerRoute],
    ["provider", input.provider],
    ["tool class", input.toolClass],
  ] as const) {
    if (!value.trim()) throw new Error(`Cost-ledger ${name} is required.`);
  }
  for (const [name, value] of [
    ["maximum input tokens", input.maximumInputTokens],
    ["maximum output tokens", input.maximumOutputTokens],
    ["maximum tool uses", input.maximumToolUses],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error(`Cost-ledger ${name} must be a nonnegative integer or null.`);
  }
  const retryOfCallId = input.retryOfCallId ?? null;
  if (input.attempt === 1 && retryOfCallId !== null) throw new Error("An initial attempt cannot identify a parent call.");
  if (input.attempt > 1 && retryOfCallId === null) throw new Error("Every retry requires a new reservation linked to its parent call.");
  if (retryOfCallId !== null) {
    const parent = entries.find((entry) => entry.callId === retryOfCallId);
    if (!parent) throw new Error("A retry reservation must reference an existing parent call.");
    if (input.attempt !== parent.attempt + 1) throw new Error("A retry attempt must increment its parent attempt by one.");
  }
}
