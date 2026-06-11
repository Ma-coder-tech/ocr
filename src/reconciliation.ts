export type ReconciliationStatus = "pass" | "warning" | "fail" | "not_applicable";

export type ReconStatus =
  | "RECON_OK"
  | "RECON_ROUNDING"
  | "RECON_MINOR_BREAK"
  | "RECON_MATERIAL_BREAK"
  | "RECON_UNREFERENCED_VALUE"
  | "RECON_MISSING_INPUT";

export type ReconciliationEvidence = {
  section: string;
  pageNumber?: number | null;
  rowLabel?: string | null;
  rowIndex?: number | null;
  sourceText?: string | null;
};

export type ReconciliationResult = {
  identity: string;
  status: ReconStatus;
  stated: number | null;
  computed: number | null;
  delta: number | null;
  impliedCorrect?: number;
  toleranceBand: number;
  note?: string;
  evidence?: ReconciliationEvidence;
};

export type ReconciliationCheck = {
  status: ReconciliationStatus;
  expected: number | null;
  actual: number | null;
  delta: number | null;
  tolerance: number | null;
  explanation: string;
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round8(value: number): number {
  return Math.round((value + Number.EPSILON) * 100_000_000) / 100_000_000;
}

export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function fromCents(value: number): number {
  return round2(value / 100);
}

export function exactMoneyToleranceBand(): number {
  return 0.01;
}

export function sumMoneyToleranceBand(itemCount: number, options: { minimum?: number; perItem?: number; cap?: number } = {}): number {
  const minimum = options.minimum ?? 0.02;
  const perItem = options.perItem ?? 0.005;
  const uncapped = Math.max(minimum, perItem * Math.max(0, itemCount));
  const band = options.cap === undefined ? uncapped : Math.min(uncapped, options.cap);
  return Number(band.toFixed(6));
}

export function classifyReconDelta(delta: number, toleranceBand: number): ReconStatus {
  const deltaCents = Math.abs(toCents(delta));
  if (deltaCents === 0) return "RECON_OK";
  if (deltaCents <= toleranceBand * 100) return "RECON_ROUNDING";
  if (deltaCents <= 100) return "RECON_MINOR_BREAK";
  return "RECON_MATERIAL_BREAK";
}

export function makeReconResult(params: {
  identity: string;
  stated: number | null | undefined;
  computed: number | null | undefined;
  toleranceBand: number;
  impliedCorrect?: number;
  note?: string;
  evidence?: ReconciliationEvidence;
}): ReconciliationResult {
  if (params.stated === null || params.stated === undefined || params.computed === null || params.computed === undefined) {
    return {
      identity: params.identity,
      status: "RECON_MISSING_INPUT",
      stated: params.stated ?? null,
      computed: params.computed ?? null,
      delta: null,
      impliedCorrect: params.impliedCorrect,
      toleranceBand: params.toleranceBand,
      note: params.note,
      evidence: params.evidence,
    };
  }

  const delta = fromCents(toCents(params.stated) - toCents(params.computed));
  return {
    identity: params.identity,
    status: classifyReconDelta(delta, params.toleranceBand),
    stated: fromCents(toCents(params.stated)),
    computed: fromCents(toCents(params.computed)),
    delta,
    impliedCorrect: params.impliedCorrect === undefined ? undefined : fromCents(toCents(params.impliedCorrect)),
    toleranceBand: params.toleranceBand,
    note: params.note,
    evidence: params.evidence,
  };
}

export function makeUnreferencedValueResult(params: {
  identity: string;
  stated: number;
  nearestReference?: number | null;
  toleranceBand?: number;
  note?: string;
  evidence?: ReconciliationEvidence;
}): ReconciliationResult {
  const computed = params.nearestReference ?? null;
  const delta = computed === null ? null : fromCents(toCents(params.stated) - toCents(computed));
  return {
    identity: params.identity,
    status: "RECON_UNREFERENCED_VALUE",
    stated: fromCents(toCents(params.stated)),
    computed: computed === null ? null : fromCents(toCents(computed)),
    delta,
    toleranceBand: params.toleranceBand ?? exactMoneyToleranceBand(),
    note: params.note,
    evidence: params.evidence,
  };
}

export function makeAmountCheck(
  expected: number,
  actual: number,
  tolerance: number,
  explanation: string,
): ReconciliationCheck {
  const delta = round2(actual - expected);
  return {
    status: Math.abs(delta) <= tolerance ? "pass" : "fail",
    expected: round2(expected),
    actual: round2(actual),
    delta,
    tolerance,
    explanation,
  };
}

export function makeRateCheck(
  expected: number,
  actual: number,
  tolerance: number,
  explanation: string,
): ReconciliationCheck {
  const rawDelta = Number((actual - expected).toFixed(8));
  const delta = Object.is(rawDelta, -0) ? 0 : rawDelta;
  return {
    status: Math.abs(delta) <= tolerance ? "pass" : "fail",
    expected: round8(expected),
    actual: round8(actual),
    delta,
    tolerance,
    explanation,
  };
}

export function makeNotApplicableCheck(explanation: string): ReconciliationCheck {
  return {
    status: "not_applicable",
    expected: null,
    actual: null,
    delta: null,
    tolerance: null,
    explanation,
  };
}

export function makeWarningCheck(
  expected: number,
  actual: number,
  tolerance: number,
  explanation: string,
): ReconciliationCheck {
  const delta = round2(actual - expected);
  return {
    status: Math.abs(delta) <= tolerance ? "pass" : "warning",
    expected: round2(expected),
    actual: round2(actual),
    delta,
    tolerance,
    explanation,
  };
}
