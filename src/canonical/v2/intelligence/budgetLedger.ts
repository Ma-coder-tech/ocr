import type {
  BudgetDimension,
  BudgetReservation,
  BudgetSnapshot,
  RgFreeV1BudgetProfile,
} from "./intelligenceTypes.js";

export const RG_FREE_V1_BUDGET: RgFreeV1BudgetProfile = Object.freeze({
  profile: "RG-FREE-v1",
  maxSelectedQuestions: 4,
  maxSearchCalls: 8,
  maxAdaptiveSearchesPerQuestion: 1,
  maxCandidatesPerQuestion: 3,
  maxCandidatesTotal: 8,
  maxRetrievalDocuments: 8,
  maxRetrievalBytesPerDocument: 5_242_880,
  maxRetrievalBytesTotal: 20_971_520,
  maxInvestigativeAiCalls: 4,
  maxSemanticVerificationCalls: 4,
  maxSemanticSupportItems: 8,
  maxLanguageCalls: 2,
  maxStructuredItemsPerBatch: 4,
  searchTimeoutMs: 8_000,
  retrievalTimeoutMs: 12_000,
  pdfExtractionTimeoutMs: 10_000,
  investigativeAiTimeoutMs: 20_000,
  semanticVerificationTimeoutMs: 20_000,
  languageTimeoutMs: 15_000,
  globalWallTimeMs: 90_000,
  maxInvestigativeOutputTokensPerCall: 1_200,
  maxSemanticOutputTokensPerCall: 1_200,
  maxLanguageOutputTokensPerCall: 800,
  maxModelOutputTokensTotal: 12_000,
  automaticProviderRetries: 0,
  schemaRepairRetries: 0,
  maxRemoteConcurrency: 2,
});

export const RG_FREE_V1_INTERNAL_LIVE_TIMING_V2_BUDGET = Object.freeze({
  ...RG_FREE_V1_BUDGET,
  searchTimeoutMs: 40_000,
  globalWallTimeMs: 180_000,
}) satisfies RgFreeV1BudgetProfile;

function limits(profile: RgFreeV1BudgetProfile): Record<BudgetDimension, number> {
  return {
    search_calls: profile.maxSearchCalls,
    adaptive_searches: profile.maxSelectedQuestions * profile.maxAdaptiveSearchesPerQuestion,
    candidates: profile.maxCandidatesTotal,
    retrieval_documents: profile.maxRetrievalDocuments,
    retrieval_bytes: profile.maxRetrievalBytesTotal,
    pdf_extractions: profile.maxRetrievalDocuments,
    investigative_ai_calls: profile.maxInvestigativeAiCalls,
    semantic_verification_calls: profile.maxSemanticVerificationCalls,
    semantic_support_items: profile.maxSemanticSupportItems,
    language_calls: profile.maxLanguageCalls,
    model_output_tokens: profile.maxModelOutputTokensTotal,
  };
}

export class IntelligenceBudgetExceeded extends Error {
  constructor(public readonly dimension: BudgetDimension) {
    super(`intelligence_budget_exhausted:${dimension}`);
  }
}

export class IntelligenceBudgetLedger {
  private readonly dimensionLimits: Record<BudgetDimension, number>;
  private readonly consumed: Record<BudgetDimension, number>;
  private readonly reservations: BudgetReservation[] = [];
  private readonly reservationIds = new Set<string>();

  constructor(public readonly profile: RgFreeV1BudgetProfile = RG_FREE_V1_BUDGET) {
    if (profile.profile !== "RG-FREE-v1") throw new Error("invalid_intelligence_budget_profile");
    this.dimensionLimits = limits(profile);
    this.consumed = Object.fromEntries(Object.keys(this.dimensionLimits).map((key) => [key, 0])) as Record<BudgetDimension, number>;
  }

  canReserve(dimension: BudgetDimension, amount: number): boolean {
    return Number.isInteger(amount) && amount >= 0 && this.consumed[dimension] + amount <= this.dimensionLimits[dimension];
  }

  reserve(params: { reservationId: string; operationId: string; dimension: BudgetDimension; amount: number }): BudgetReservation {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(params.reservationId) || this.reservationIds.has(params.reservationId)) {
      throw new Error("invalid_or_duplicate_budget_reservation");
    }
    if (!this.canReserve(params.dimension, params.amount)) throw new IntelligenceBudgetExceeded(params.dimension);
    this.reservationIds.add(params.reservationId);
    this.consumed[params.dimension] += params.amount;
    const reservation: BudgetReservation = {
      ...params,
      consumedAmount: params.amount,
      state: "reserved",
      usageState: "known",
    };
    this.reservations.push(reservation);
    return { ...reservation };
  }

  reserveMany(params: Array<{ reservationId: string; operationId: string; dimension: BudgetDimension; amount: number }>): BudgetReservation[] {
    const ids = params.map((item) => item.reservationId);
    if (new Set(ids).size !== ids.length || ids.some((id) => this.reservationIds.has(id))) {
      throw new Error("invalid_or_duplicate_budget_reservation");
    }
    const totals = new Map<BudgetDimension, number>();
    for (const item of params) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(item.reservationId) || !Number.isInteger(item.amount) || item.amount < 0) {
        throw new Error("invalid_or_duplicate_budget_reservation");
      }
      totals.set(item.dimension, (totals.get(item.dimension) ?? 0) + item.amount);
    }
    for (const [dimension, amount] of totals) {
      if (!this.canReserve(dimension, amount)) throw new IntelligenceBudgetExceeded(dimension);
    }
    return params.map((item) => this.reserve(item));
  }

  release(reservationId: string): void {
    const reservation = this.reservations.find((item) => item.reservationId === reservationId);
    if (!reservation || reservation.state !== "reserved") throw new Error("invalid_budget_release");
    this.consumed[reservation.dimension] -= reservation.amount;
    reservation.consumedAmount = 0;
    reservation.state = "released";
    reservation.usageState = "known";
  }

  settle(
    reservationId: string,
    params: {
      state: Exclude<BudgetReservation["state"], "reserved">;
      actualAmount?: number;
      usageKnown?: boolean;
    },
  ): void {
    const reservation = this.reservations.find((item) => item.reservationId === reservationId);
    if (!reservation || reservation.state !== "reserved") throw new Error("invalid_budget_settlement");
    const usageKnown = params.usageKnown !== false;
    if (params.actualAmount !== undefined) {
      if (!usageKnown || !Number.isInteger(params.actualAmount) || params.actualAmount < 0 || params.actualAmount > reservation.amount) {
        throw new Error("invalid_budget_actual_usage");
      }
      this.consumed[reservation.dimension] -= reservation.amount - params.actualAmount;
      reservation.consumedAmount = params.actualAmount;
    }
    reservation.state = params.state;
    reservation.usageState = usageKnown ? "known" : "unknown_possible_billable";
  }

  reserveAndComplete(params: { reservationId: string; operationId: string; dimension: BudgetDimension; amount: number }): void {
    this.reserve(params);
    this.settle(params.reservationId, { state: "completed", actualAmount: params.amount });
  }

  snapshot(): BudgetSnapshot {
    const remaining = Object.fromEntries(
      (Object.keys(this.dimensionLimits) as BudgetDimension[]).map((dimension) => [dimension, this.dimensionLimits[dimension] - this.consumed[dimension]]),
    ) as Record<BudgetDimension, number>;
    return {
      profile: "RG-FREE-v1",
      limits: { ...this.dimensionLimits },
      consumed: { ...this.consumed },
      remaining,
      reservations: this.reservations.map((item) => ({ ...item })),
      exhaustedDimensions: (Object.keys(remaining) as BudgetDimension[]).filter((dimension) => remaining[dimension] === 0),
    };
  }
}

export function validateRgFreeV1Budget(profile: RgFreeV1BudgetProfile): string[] {
  const allowed = [RG_FREE_V1_BUDGET, RG_FREE_V1_INTERNAL_LIVE_TIMING_V2_BUDGET];
  if (allowed.some((expected) => (Object.keys(expected) as Array<keyof RgFreeV1BudgetProfile>).every((key) => profile[key] === expected[key]))) return [];
  const expected = profile.searchTimeoutMs === 40_000 || profile.globalWallTimeMs === 180_000
    ? RG_FREE_V1_INTERNAL_LIVE_TIMING_V2_BUDGET : RG_FREE_V1_BUDGET;
  return (Object.keys(expected) as Array<keyof RgFreeV1BudgetProfile>)
    .filter((key) => profile[key] !== expected[key])
    .map((key) => `rg_free_v1_budget_mismatch:${String(key)}`);
}
