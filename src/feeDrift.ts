import { collectFeeFacts, confidenceFromScore, mergeConfidence, normalizeFeeKey, type FeeFact } from "./feeFacts.js";
import type {
  AnalysisSummary,
  FeeDriftFinding,
  FeeDriftFindingKind,
  FeeDriftReport,
  FeeDriftSeverity,
  RepricingEvent,
} from "./types.js";

const MONEY_INCREASE_FLOOR = 5;
const MONEY_INCREASE_PCT = 0.1;
const NEW_FEE_FLOOR = 3;
const RATE_INCREASE_BPS_FLOOR = 5;
const PER_ITEM_INCREASE_FLOOR = 0.01;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function evidenceLine(label: string, section: string | null | undefined, evidence: string | null | undefined): string {
  const parts = [section, evidence].filter((part) => part && String(part).trim());
  return parts.length > 0 ? `${label}: ${parts.join(": ")}` : label;
}

function moneyDelta(earlier: number | null, later: number | null): number | null {
  return earlier !== null && later !== null ? round2(later - earlier) : null;
}

function rateDelta(earlier: number | null, later: number | null): number | null {
  return earlier !== null && later !== null ? round4(later - earlier) : null;
}

function shouldFlagAmountIncrease(earlier: number | null, later: number | null): boolean {
  if (earlier === null || later === null || later <= earlier) return false;
  const delta = later - earlier;
  const pct = earlier > 0 ? delta / earlier : 1;
  return delta >= MONEY_INCREASE_FLOOR && pct >= MONEY_INCREASE_PCT;
}

function shouldFlagNewFee(fact: FeeFact): boolean {
  if (fact.origin === "rollup") return false;
  const amount = fact.amountUsd ?? 0;
  return fact.knownUnwanted || fact.recurring || amount >= NEW_FEE_FLOOR || fact.perItemUsd !== null || fact.rateBps !== null;
}

function severityFor(kind: FeeDriftFindingKind, fact: FeeFact, deltaAmount: number | null): FeeDriftSeverity {
  if (kind === "opaque_change" || kind === "repricing_notice") return "warning";
  if (fact.knownUnwanted && (kind === "new_fee" || kind === "recurring_fee_added")) return "critical";
  if (kind === "removed_fee") return "info";
  if ((deltaAmount ?? 0) >= 25) return "critical";
  return "warning";
}

function formatMoney(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(2)}`;
}

function formatBps(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(2)} bps`;
}

function formatPerItem(value: number | null): string {
  return value === null ? "n/a" : `$${value.toFixed(4)} per item`;
}

function buildFinding(
  kind: FeeDriftFindingKind,
  fact: FeeFact,
  earlier: FeeFact | null,
  reason: string,
  evidence: string[],
): FeeDriftFinding {
  const amountDelta = moneyDelta(earlier?.amountUsd ?? null, fact.amountUsd);
  const bpsDelta = rateDelta(earlier?.rateBps ?? null, fact.rateBps);
  const perItemDelta = rateDelta(earlier?.perItemUsd ?? null, fact.perItemUsd);
  return {
    kind,
    severity: severityFor(kind, fact, amountDelta),
    label: fact.label,
    normalizedKey: fact.key,
    bucket: fact.bucket,
    earlierAmountUsd: earlier?.amountUsd ?? null,
    laterAmountUsd: fact.amountUsd,
    amountDeltaUsd: amountDelta,
    earlierRateBps: earlier?.rateBps ?? null,
    laterRateBps: fact.rateBps,
    rateDeltaBps: bpsDelta,
    earlierPerItemUsd: earlier?.perItemUsd ?? null,
    laterPerItemUsd: fact.perItemUsd,
    perItemDeltaUsd: perItemDelta,
    reason,
    evidence: [...new Set(evidence)].slice(0, 6),
    confidence: mergeConfidence(earlier?.confidence ?? "low", fact.confidence),
  };
}

function repricingFinding(event: RepricingEvent): FeeDriftFinding {
  const key = normalizeFeeKey(event.feeLabel ?? event.kind);
  const label = event.feeLabel ?? event.kind.replace(/_/g, " ");
  const newValue = event.newValue;
  const oldValue = event.oldValue;
  const deltaValue = event.deltaValue;
  const laterAmount = newValue?.valueType === "money" ? round4(newValue.value) : null;
  const earlierAmount = oldValue?.valueType === "money" ? round4(oldValue.value) : null;
  const amountDelta =
    deltaValue?.valueType === "money"
      ? round4(deltaValue.value)
      : earlierAmount !== null && laterAmount !== null
        ? round4(laterAmount - earlierAmount)
        : null;
  const bpsDelta = deltaValue?.valueType === "basis_points" ? round4(deltaValue.value) : null;

  return {
    kind: "repricing_notice",
    severity: "warning",
    label,
    normalizedKey: key,
    bucket: "repricing",
    earlierAmountUsd: earlierAmount,
    laterAmountUsd: laterAmount,
    amountDeltaUsd: amountDelta,
    earlierRateBps: null,
    laterRateBps: null,
    rateDeltaBps: bpsDelta,
    earlierPerItemUsd: oldValue?.cadence === "per_item" && oldValue.valueType === "money" ? round4(oldValue.value) : null,
    laterPerItemUsd: newValue?.cadence === "per_item" && newValue.valueType === "money" ? round4(newValue.value) : null,
    perItemDeltaUsd: deltaValue?.cadence === "per_item" && deltaValue.valueType === "money" ? round4(deltaValue.value) : null,
    reason: event.effectiveDate
      ? `Statement notice discloses a pricing change effective ${event.effectiveDate}.`
      : "Statement notice discloses a pricing change.",
    evidence: event.evidenceLines?.length > 0 ? event.evidenceLines : [event.evidenceLine],
    confidence: confidenceFromScore(event.confidence),
  };
}

function sortFindings(left: FeeDriftFinding, right: FeeDriftFinding): number {
  const severityRank: Record<FeeDriftSeverity, number> = { critical: 0, warning: 1, info: 2 };
  const kindRank: Record<FeeDriftFindingKind, number> = {
    recurring_fee_added: 0,
    new_fee: 1,
    amount_increase: 2,
    rate_increase: 3,
    per_item_increase: 4,
    repricing_notice: 5,
    opaque_change: 6,
    removed_fee: 7,
  };
  return (
    severityRank[left.severity] - severityRank[right.severity] ||
    kindRank[left.kind] - kindRank[right.kind] ||
    Math.abs(right.amountDeltaUsd ?? right.rateDeltaBps ?? right.perItemDeltaUsd ?? 0) -
      Math.abs(left.amountDeltaUsd ?? left.rateDeltaBps ?? left.perItemDeltaUsd ?? 0)
  );
}

export function detectFeeDrift(earlier: AnalysisSummary, later: AnalysisSummary): FeeDriftReport {
  const earlierFacts = collectFeeFacts(earlier);
  const laterFacts = collectFeeFacts(later);
  const findings: FeeDriftFinding[] = [];

  for (const laterFact of laterFacts.values()) {
    const earlierFact = earlierFacts.get(laterFact.key) ?? null;
    if (!earlierFact) {
      if (laterFact.bucket === "card_brand_pass_through" && !laterFact.knownUnwanted) continue;
      if (!shouldFlagNewFee(laterFact)) continue;
      findings.push(
        buildFinding(
          laterFact.recurring ? "recurring_fee_added" : "new_fee",
          laterFact,
          null,
          `${laterFact.label} appears in the later statement but was not found in the earlier statement.`,
          laterFact.evidence,
        ),
      );
      continue;
    }

    if (laterFact.bucket !== "card_brand_pass_through" && shouldFlagAmountIncrease(earlierFact.amountUsd, laterFact.amountUsd)) {
      const delta = moneyDelta(earlierFact.amountUsd, laterFact.amountUsd);
      findings.push(
        buildFinding(
          "amount_increase",
          laterFact,
          earlierFact,
          `${laterFact.label} increased from ${formatMoney(earlierFact.amountUsd)} to ${formatMoney(laterFact.amountUsd)} (${formatMoney(
            delta,
          )} increase).`,
          [...earlierFact.evidence, ...laterFact.evidence],
        ),
      );
    }

    if (
      laterFact.rateBps !== null &&
      earlierFact.rateBps !== null &&
      laterFact.rateBps - earlierFact.rateBps >= RATE_INCREASE_BPS_FLOOR
    ) {
      const delta = rateDelta(earlierFact.rateBps, laterFact.rateBps);
      findings.push(
        buildFinding(
          "rate_increase",
          laterFact,
          earlierFact,
          `${laterFact.label} rate increased from ${formatBps(earlierFact.rateBps)} to ${formatBps(laterFact.rateBps)} (${formatBps(
            delta,
          )} increase).`,
          [...earlierFact.evidence, ...laterFact.evidence],
        ),
      );
    }

    if (
      laterFact.perItemUsd !== null &&
      earlierFact.perItemUsd !== null &&
      laterFact.perItemUsd - earlierFact.perItemUsd >= PER_ITEM_INCREASE_FLOOR
    ) {
      const delta = rateDelta(earlierFact.perItemUsd, laterFact.perItemUsd);
      findings.push(
        buildFinding(
          "per_item_increase",
          laterFact,
          earlierFact,
          `${laterFact.label} increased from ${formatPerItem(earlierFact.perItemUsd)} to ${formatPerItem(laterFact.perItemUsd)} (${formatPerItem(
            delta,
          )} increase).`,
          [...earlierFact.evidence, ...laterFact.evidence],
        ),
      );
    }
  }

  for (const earlierFact of earlierFacts.values()) {
    if (laterFacts.has(earlierFact.key) || !earlierFact.knownUnwanted) continue;
    findings.push(
      buildFinding(
        "removed_fee",
        { ...earlierFact, amountUsd: null, rateBps: null, perItemUsd: null },
        earlierFact,
        `${earlierFact.label} was present in the earlier statement but not found in the later statement.`,
        earlierFact.evidence,
      ),
    );
  }

  for (const event of later.repricingEvents ?? []) {
    findings.push(repricingFinding(event));
  }

  const opaqueNotice = (later.noticeFindings ?? []).find((notice) => notice.kind === "online_only" || notice.kind === "fee_change");
  if (opaqueNotice && !(later.repricingEvents ?? []).length) {
    findings.push({
      kind: "opaque_change",
      severity: "warning",
      label: "Billing change notice",
      normalizedKey: "billing_change_notice",
      bucket: "repricing",
      earlierAmountUsd: null,
      laterAmountUsd: null,
      amountDeltaUsd: null,
      earlierRateBps: null,
      laterRateBps: null,
      rateDeltaBps: null,
      earlierPerItemUsd: null,
      laterPerItemUsd: null,
      perItemDeltaUsd: null,
      reason:
        opaqueNotice.kind === "online_only"
          ? "The later statement points to online fee-change details instead of disclosing the changed fee directly on the statement."
          : "The later statement includes billing-change language, but no exact line-item delta was captured.",
      evidence: [evidenceLine("Billing change notice", opaqueNotice.sourceSection, opaqueNotice.evidenceLine)],
      confidence: confidenceFromScore(opaqueNotice.confidence),
    });
  }

  const uniqueFindings = new Map<string, FeeDriftFinding>();
  for (const finding of findings.sort(sortFindings)) {
    const dedupeKey = `${finding.kind}:${finding.normalizedKey}`;
    if (!uniqueFindings.has(dedupeKey)) uniqueFindings.set(dedupeKey, finding);
  }

  const finalFindings = [...uniqueFindings.values()].sort(sortFindings);
  const comparedFeeCount = new Set([...earlierFacts.keys(), ...laterFacts.keys()]).size;
  const status = comparedFeeCount === 0 ? "unknown" : finalFindings.some((finding) => finding.severity !== "info") ? "warning" : "pass";
  const summary =
    status === "unknown"
      ? "No comparable fee line items were available for month-over-month drift detection."
      : finalFindings.length > 0
        ? `${finalFindings.length} fee drift finding${finalFindings.length === 1 ? "" : "s"} detected across ${comparedFeeCount} comparable fee item${
            comparedFeeCount === 1 ? "" : "s"
          }.`
        : `No material fee drift detected across ${comparedFeeCount} comparable fee item${comparedFeeCount === 1 ? "" : "s"}.`;

  return {
    status,
    summary,
    comparedFeeCount,
    findings: finalFindings,
  };
}
