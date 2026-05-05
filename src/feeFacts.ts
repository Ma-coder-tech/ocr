import { classifyFeeRow } from "./feeClassification.js";
import type { AnalysisSummary, FeeClassificationConfidence, StatementEconomicBucket } from "./types.js";

export type ComparableFeeBucket = StatementEconomicBucket | "per_item" | "repricing" | "unknown";
export type FeeFactOrigin = "line_item" | "modeled" | "rollup";

export type FeeFact = {
  key: string;
  label: string;
  bucket: ComparableFeeBucket;
  origin: FeeFactOrigin;
  amountUsd: number | null;
  rateBps: number | null;
  perItemUsd: number | null;
  recurring: boolean;
  knownUnwanted: boolean;
  evidence: string[];
  confidence: FeeClassificationConfidence;
  priority: number;
};

const KNOWN_FEE_KEYS = new Set([
  "customer_intelligence_suite",
  "pci_non_compliance",
  "non_emv",
  "risk_fee",
  "monthly_minimum_top_up",
  "daily_monthly_discount_handling",
  "express_merchant_funding",
  "commercial_card_savings_adjustment",
]);

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function positiveOrNull(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function confidenceFromScore(score: number | null | undefined): FeeClassificationConfidence {
  if (score !== null && score !== undefined) {
    if (score >= 0.82) return "high";
    if (score >= 0.58) return "medium";
    return "low";
  }
  return "medium";
}

function normalizedText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bfees?\b/g, " fee ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFeeKey(label: string): string {
  const normalized = normalizedText(label);
  if (!normalized) return "unknown_fee";
  if (/customer intelligence|cust(?:omer)? intel|intelligence suite|\bcis\b/.test(normalized)) return "customer_intelligence_suite";
  if (/\bpci\b.*\bnon\b|\bnon\b.*\bcompliance\b|\bnoncompliance\b/.test(normalized)) return "pci_non_compliance";
  if (/\bnon\s?emv\b|chip card|card not present/.test(normalized)) return "non_emv";
  if (/\brisk fee\b|chargeback risk/.test(normalized)) return "risk_fee";
  if (/monthly minimum|minimum discount|minimum markup|required minimum|top up/.test(normalized)) return "monthly_minimum_top_up";
  if (/express merchant funding|express funding|accelerated funding|faster funding/.test(normalized)) return "express_merchant_funding";
  if (/commercial card interchange savings|interchange savings adjustment|savings adjustment/.test(normalized)) {
    return "commercial_card_savings_adjustment";
  }
  if (/daily.*discount|monthly.*discount|discount handling/.test(normalized)) return "daily_monthly_discount_handling";
  if (/authori[sz]ation|auth fee/.test(normalized)) return "authorization_fee";
  if (/transaction fee|per item|per txn|per trans/.test(normalized)) return "transaction_fee";
  if (/gateway/.test(normalized)) return "gateway_fee";
  if (/statement fee|paper statement/.test(normalized)) return "statement_fee";
  if (/monthly service|service fee/.test(normalized)) return "monthly_service_fee";
  if (/card point|cardpoint/.test(normalized)) return "cardpoint_fee";
  if (/processor markup|service charge|processing fee|discount fee|assessment markup|markup/.test(normalized)) {
    return "processor_markup";
  }
  if (/interchange|assessment|card brand|card network|visa|mastercard|discover|amex|american express/.test(normalized)) {
    return `card_brand_${normalized.replace(/\s+/g, "_")}`;
  }
  return (
    normalized
      .replace(/\b(monthly|recurring|merchant|service|fee|charge|charges|total)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\s+/g, "_") || "unknown_fee"
  );
}

function evidenceLine(label: string, section: string | null | undefined, evidence: string | null | undefined): string {
  const parts = [section, evidence].filter((part) => part && String(part).trim());
  return parts.length > 0 ? `${label}: ${parts.join(": ")}` : label;
}

export function mergeConfidence(left: FeeClassificationConfidence, right: FeeClassificationConfidence): FeeClassificationConfidence {
  if (left === "high" || right === "high") return "high";
  if (left === "medium" || right === "medium") return "medium";
  return "low";
}

function addFact(facts: Map<string, FeeFact>, fact: FeeFact): void {
  const existing = facts.get(fact.key);
  if (!existing) {
    facts.set(fact.key, { ...fact, evidence: [...new Set(fact.evidence)].slice(0, 6) });
    return;
  }

  if (fact.priority > existing.priority) {
    facts.set(fact.key, {
      ...fact,
      amountUsd: fact.amountUsd ?? existing.amountUsd,
      rateBps: fact.rateBps ?? existing.rateBps,
      perItemUsd: fact.perItemUsd ?? existing.perItemUsd,
      evidence: [...new Set([...fact.evidence, ...existing.evidence])].slice(0, 6),
      confidence: mergeConfidence(existing.confidence, fact.confidence),
      recurring: existing.recurring || fact.recurring,
      knownUnwanted: existing.knownUnwanted || fact.knownUnwanted,
    });
    return;
  }

  facts.set(fact.key, {
    ...existing,
    amountUsd: existing.amountUsd ?? fact.amountUsd,
    rateBps: existing.rateBps ?? fact.rateBps,
    perItemUsd: existing.perItemUsd ?? fact.perItemUsd,
    recurring: existing.recurring || fact.recurring,
    knownUnwanted: existing.knownUnwanted || fact.knownUnwanted,
    evidence: [...new Set([...existing.evidence, ...fact.evidence])].slice(0, 6),
    confidence: mergeConfidence(existing.confidence, fact.confidence),
  });
}

function bucketForFeeClass(label: string, sourceSection?: string, evidence?: string): ComparableFeeBucket {
  const classification = classifyFeeRow({ label, sourceSection, evidenceLine: evidence });
  if (classification.feeClass === "card_brand_pass_through") return "card_brand_pass_through";
  if (classification.feeClass === "processor_markup" || classification.feeClass === "processor_transaction_or_auth") return "processor_markup";
  if (classification.feeClass === "processor_service_add_on" || classification.feeClass === "compliance_remediation") return "add_on_fees";
  return "unknown";
}

function isRecurring(label: string): boolean {
  return /\b(monthly|recurring|statement fee|service fee|gateway fee|platform fee|account fee|minimum|suite)\b/i.test(label);
}

function feeBreakdownBucket(row: AnalysisSummary["feeBreakdown"][number]): ComparableFeeBucket {
  if (row.feeClass === "card_brand_pass_through" || row.broadType === "Pass-through") return "card_brand_pass_through";
  if (row.feeClass === "processor_markup" || row.feeClass === "processor_transaction_or_auth" || row.broadType === "Processor") {
    return "processor_markup";
  }
  if (row.feeClass === "processor_service_add_on" || row.feeClass === "compliance_remediation" || row.broadType === "Service / compliance") {
    return "add_on_fees";
  }
  return bucketForFeeClass(row.label, row.sourceSection, row.evidenceLine);
}

export function collectFeeFacts(summary: AnalysisSummary): Map<string, FeeFact> {
  const facts = new Map<string, FeeFact>();

  for (const row of summary.feeBreakdown ?? []) {
    const amount = positiveOrNull(row.amount);
    const key = normalizeFeeKey(row.label);
    const confidence = row.classificationConfidence ?? "medium";
    addFact(facts, {
      key,
      label: row.label,
      bucket: feeBreakdownBucket(row),
      origin: "line_item",
      amountUsd: amount === null ? null : round2(amount),
      rateBps: null,
      perItemUsd: null,
      recurring: isRecurring(row.label),
      knownUnwanted: KNOWN_FEE_KEYS.has(key),
      evidence: [evidenceLine(row.label, row.sourceSection, row.evidenceLine)],
      confidence,
      priority: 2,
    });
  }

  for (const finding of summary.structuredFeeFindings ?? []) {
    const key = normalizeFeeKey(finding.kind);
    const amount = positiveOrNull(finding.estimatedImpactUsd ?? finding.amountUsd);
    const rateBps = finding.ratePercent !== null ? round4(finding.ratePercent * 100) : null;
    addFact(facts, {
      key,
      label: finding.label,
      bucket: "add_on_fees",
      origin: "modeled",
      amountUsd: amount === null ? null : round2(amount),
      rateBps,
      perItemUsd: null,
      recurring: isRecurring(finding.label) || key === "customer_intelligence_suite",
      knownUnwanted: true,
      evidence: [evidenceLine(finding.label, finding.sourceSection, finding.evidenceLine)],
      confidence: confidenceFromScore(finding.confidence),
      priority: 5,
    });
  }

  const monthlyMinimum = summary.guideMeasures?.monthlyMinimum;
  if (monthlyMinimum) {
    const amount = positiveOrNull(monthlyMinimum.topUpUsd ?? monthlyMinimum.minimumUsd);
    addFact(facts, {
      key: "monthly_minimum_top_up",
      label: "Monthly minimum top-up",
      bucket: "add_on_fees",
      origin: "modeled",
      amountUsd: amount === null ? null : round2(amount),
      rateBps: monthlyMinimum.effectiveRateImpactPct !== null ? round4(monthlyMinimum.effectiveRateImpactPct * 100) : null,
      perItemUsd: null,
      recurring: true,
      knownUnwanted: true,
      evidence: [evidenceLine("Monthly minimum top-up", monthlyMinimum.sourceSection, monthlyMinimum.evidenceLine)],
      confidence: confidenceFromScore(monthlyMinimum.confidence),
      priority: 5,
    });
  }

  const expressFunding = summary.guideMeasures?.expressFundingPremium;
  if (expressFunding) {
    addFact(facts, {
      key: "express_merchant_funding",
      label: "Express Merchant Funding",
      bucket: "add_on_fees",
      origin: "modeled",
      amountUsd: expressFunding.premiumUsd !== null ? round2(expressFunding.premiumUsd) : null,
      rateBps: expressFunding.premiumBps !== null ? round4(expressFunding.premiumBps) : null,
      perItemUsd: null,
      recurring: false,
      knownUnwanted: true,
      evidence: [evidenceLine("Express Merchant Funding", expressFunding.sourceSection, expressFunding.evidenceLine)],
      confidence: confidenceFromScore(expressFunding.confidence),
      priority: 5,
    });
  }

  const savingsShare = summary.guideMeasures?.savingsShareAdjustment;
  if (savingsShare) {
    addFact(facts, {
      key: "commercial_card_savings_adjustment",
      label: "Commercial card interchange savings adjustment",
      bucket: "add_on_fees",
      origin: "modeled",
      amountUsd: savingsShare.retainedSavingsUsd !== null ? round2(savingsShare.retainedSavingsUsd) : null,
      rateBps: null,
      perItemUsd: null,
      recurring: false,
      knownUnwanted: true,
      evidence: [evidenceLine("Commercial card interchange savings adjustment", savingsShare.sourceSection, savingsShare.evidenceLine)],
      confidence: confidenceFromScore(savingsShare.confidence),
      priority: 5,
    });
  }

  const processorMarkup = summary.processorMarkupAudit;
  if (processorMarkup && (processorMarkup.effectiveRateBps !== null || processorMarkup.totalPaid !== null)) {
    addFact(facts, {
      key: "processor_markup_effective_rate",
      label: "Processor markup",
      bucket: "processor_markup",
      origin: "rollup",
      amountUsd: processorMarkup.totalPaid !== null ? round2(processorMarkup.totalPaid) : null,
      rateBps: processorMarkup.effectiveRateBps !== null ? round4(processorMarkup.effectiveRateBps) : null,
      perItemUsd: null,
      recurring: false,
      knownUnwanted: false,
      evidence: (processorMarkup.rows ?? []).slice(0, 3).map((row) => evidenceLine(row.label, row.sourceSection, row.evidenceLine)),
      confidence: confidenceFromScore(processorMarkup.confidence),
      priority: 3,
    });
  }

  const perItem = summary.perItemFeeModel;
  if (perItem) {
    for (const component of perItem.components ?? []) {
      const key = component.kind === "authorization" ? "authorization_fee" : "transaction_fee";
      addFact(facts, {
        key,
        label: component.kind === "authorization" ? "Authorization fee" : "Transaction fee",
        bucket: "per_item",
        origin: "line_item",
        amountUsd: null,
        rateBps: null,
        perItemUsd: round4(component.amount),
        recurring: false,
        knownUnwanted: false,
        evidence: [evidenceLine(component.kind, component.sourceSection, component.evidenceLine)],
        confidence: confidenceFromScore(component.confidence),
        priority: 5,
      });
    }

    if (perItem.allInPerItemFee !== null) {
      addFact(facts, {
        key: "all_in_per_item_fee",
        label: "All-in per-item fee",
        bucket: "per_item",
        origin: "rollup",
        amountUsd: null,
        rateBps: null,
        perItemUsd: round4(perItem.allInPerItemFee),
        recurring: false,
        knownUnwanted: false,
        evidence: (perItem.components ?? []).slice(0, 3).map((component) => evidenceLine(component.kind, component.sourceSection, component.evidenceLine)),
        confidence: confidenceFromScore(perItem.confidence),
        priority: 4,
      });
    }
  }

  return facts;
}
