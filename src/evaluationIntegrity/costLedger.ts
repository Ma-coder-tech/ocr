import { EvaluationIntegrityError } from "./errors.js";
import type {
  CostBudgetLedgerSnapshot,
  CostCallStatus,
  CostCapability,
  CostLedgerEntry,
  CostToolEvent,
  EvaluationPricingPolicy,
} from "./types.js";
import { calculateWorstCaseCostUsd } from "./providerAccounting.js";
import { EVALUATION_COST_LEDGER_VERSION } from "./types.js";

export const EVALUATION_COST_CURRENCY = "USD" as const;
export const EVALUATION_COST_FIXED_POINT_SCALE = 1_000_000_000;

export type CostReservationInput = {
  callId: string;
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

type FinalizeInput = {
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
    if (committedBefore + reservationUnits > this.approvedBudgetUnits) {
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
      cumulativeBudgetCommittedUsd: unitsUsd(committedBefore + reservationUnits),
      cumulativeReleasedUsd: unitsUsd(this.releasedUnits()),
      remainingBudgetUsd: unitsUsd(this.approvedBudgetUnits - committedBefore - reservationUnits),
    };
    this.entries.push(entry);
    return structuredClone(entry);
  }

  finalize(callId: string, input: FinalizeInput): CostLedgerEntry {
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
      if (entry.status === "reserved" || entry.billingDisposition === "pending" || entry.billingDisposition === "unknown") {
        return sum + usdUnits(entry.estimatedMaximumCostUsd);
      }
      if (entry.billingDisposition === "provider_confirmed_zero") return sum;
      return sum + usdUnits(entry.observedOrEstimatedFinalCostUsd ?? entry.estimatedMaximumCostUsd);
    }, 0);
  }

  private releasedUnits(): number {
    return this.entries.reduce((sum, entry) => {
      const reserved = usdUnits(entry.estimatedMaximumCostUsd);
      if (entry.status === "reserved" || entry.billingDisposition === "pending" || entry.billingDisposition === "unknown") return sum;
      if (entry.billingDisposition === "provider_confirmed_zero") return sum + reserved;
      const observed = usdUnits(entry.observedOrEstimatedFinalCostUsd ?? entry.estimatedMaximumCostUsd);
      return sum + Math.max(0, reserved - observed);
    }, 0);
  }
}

export async function executeBudgetedProviderCall<T>(input: {
  ledger: EvaluationCostBudgetLedger;
  reservation: CostReservationInput;
  invoke: () => Promise<{
    value: T;
    accounting: Omit<FinalizeInput, "status" | "billingDisposition"> & {
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
