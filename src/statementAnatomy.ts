import {
  pageNumber,
  rowContent,
  signedMoneyTokens,
  type FinancialCandidate,
  type FinancialCandidateRole,
  type ParserConfidence,
  type RawDocumentRow,
  type RawExtractedDocument,
} from "./parserFoundation.js";
import { round2, round8 } from "./reconciliation.js";

export type StatementLine = {
  row: RawDocumentRow;
  index: number;
  content: string;
  normalized: string;
  pageNumber: number | null;
};

export type StatementAmountCandidate = {
  roleCandidate: FinancialCandidateRole;
  label: string;
  amount: number;
  line: StatementLine;
  sourceSection: string;
  score: number;
  confidence: ParserConfidence;
  selectionReason: string | null;
  rejectionReason: string | null;
  selected: boolean;
};

export type SelectedStatementAnatomy = {
  totalVolume: StatementAmountCandidate;
  totalFees: StatementAmountCandidate;
  amountFunded: StatementAmountCandidate;
  adjustmentsChargebacks: number;
  thirdPartyTransactions: number | null;
  effectiveRate: number;
  fundingFormulaDelta: number;
  fundingFormulaEvidenceLine: string | null;
  candidates: FinancialCandidate[];
  excludedTotals: StatementExcludedTotal[];
};

export type StatementExcludedTotal = {
  amount: number;
  label: string;
  sourceSection: string;
  evidenceLine: string;
  excludedFrom: string;
  reason: string;
};

type FundingControlCandidate = {
  totalVolume: StatementAmountCandidate;
  totalFees: StatementAmountCandidate;
  amountFunded: StatementAmountCandidate;
  adjustmentsChargebacks: number;
  thirdPartyTransactions: number | null;
  delta: number;
  score: number;
  evidenceLine: string;
};

const BAD_TOTAL_CONTEXT = /\b(?:ytd|year\s*to\s*date|year-to-date|gross reportable|aggregate reportable|tax identification|tin\b|explanation|less discount paid)\b/i;

export function statementLines(doc: RawExtractedDocument): StatementLine[] {
  return doc.rows.map((row, index) => {
    const content = cleanStatementText(rowContent(row));
    return {
      row,
      index,
      content,
      normalized: normalizeStatementText(content),
      pageNumber: pageNumber(row),
    };
  });
}

export function statementCorpus(doc: RawExtractedDocument): string {
  return statementLines(doc)
    .map((line) => line.content)
    .join("\n");
}

export function extractStatementAnatomy(lines: StatementLine[]): SelectedStatementAnatomy {
  const candidates = collectAmountCandidates(lines);
  const fundingControls = collectFundingControlCandidates(lines);
  const selected = selectReconciledAnatomy(candidates, fundingControls);
  if (!selected) {
    throw new Error("Statement anatomy extractor could not select reconciled volume, fee, and funded totals.");
  }
  const selectedKeys = new Set([
    candidateKey(selected.totalVolume),
    candidateKey(selected.totalFees),
    candidateKey(selected.amountFunded),
  ]);
  const financialCandidates = candidates.map((candidate) => toFinancialCandidate(candidate, selectedKeys.has(candidateKey(candidate))));

  return {
    totalVolume: markSelected(selected.totalVolume, "Selected by statement anatomy reconciliation as the period processing volume."),
    totalFees: markSelected(selected.totalFees, "Selected by statement anatomy reconciliation as the all-in fee total."),
    amountFunded: markSelected(selected.amountFunded, "Selected by statement anatomy reconciliation as the funded/processed amount."),
    adjustmentsChargebacks: selected.adjustmentsChargebacks,
    thirdPartyTransactions: selected.thirdPartyTransactions,
    effectiveRate: selected.totalVolume.amount === 0 ? 0 : round8(selected.totalFees.amount / selected.totalVolume.amount),
    fundingFormulaDelta: zeroSafeRound2(selected.delta),
    fundingFormulaEvidenceLine: selected.evidenceLine,
    candidates: financialCandidates,
    excludedTotals: financialCandidates.filter((candidate) => !candidate.selected).map(toExcludedTotal),
  };
}

function collectAmountCandidates(lines: StatementLine[]): StatementAmountCandidate[] {
  const candidates: StatementAmountCandidate[] = [];
  for (const line of lines) {
    const content = line.content;
    const normalized = line.normalized;
    if (!content || BAD_TOTAL_CONTEXT.test(content)) continue;
    const amounts = moneyTokens(content).map(Math.abs).filter((amount) => Number.isFinite(amount));
    if (amounts.length === 0) continue;

    addCandidate(candidates, line, "total_volume", "Total Amount Submitted", /^page\s*\|\s*\d+\s*\|\s*total amount submitted\b/i, 120);
    addCandidate(candidates, line, "total_volume", "Total Amount Submitted", /\btotal amount submitted\b/i, 105);
    addCandidate(candidates, line, "total_volume", "Amounts Submitted", /^page\s*\|\s*\d+\s*\|\s*amounts submitted\b/i, 100);
    addCandidate(candidates, line, "total_volume", "Amounts Submitted", /^amounts submitted\b/i, 65);

    addCandidate(candidates, line, "total_fees", "Total Fees", /^page\s*\|\s*\d+\s*\|\s*fees\b/i, 95);
    addCandidate(candidates, line, "total_fees", "Fees Charged", /^fees charged\b/i, 110);
    addCandidate(
      candidates,
      line,
      "total_fees",
      "Total Service/Interchange/Fee Charges",
      /^total\s*\(\s*service charges,\s*interchange charges(?:\/program fees)?,\s*and fees\s*\)/i,
      120,
    );
    addCandidate(
      candidates,
      line,
      "total_fees",
      "Total Miscellaneous/Card Fees",
      /^total\s*\(\s*misc(?:ellaneous)? fees and card fees\s*\)/i,
      120,
    );

    addCandidate(candidates, line, "amount_funded", "Total Amount Processed", /\btotal amount processed\b/i, 115);
    addCandidate(candidates, line, "amount_funded", "Total Amount Funded to Your Bank", /\btotal amount funded to your bank\b/i, 115);

    if (/^total\s*\|/i.test(content)) {
      addFundingTotalCandidates(candidates, line);
    }

    if (/^total\s*\|/i.test(content) && /\btotal amount you submitted\b/i.test(lines[Math.max(0, line.index - 2)]?.content ?? "")) {
      const first = amounts[0];
      if (first !== undefined) {
        candidates.push(makeCandidate(line, "total_volume", "Summary By Card Type Total", first, 80, "SUMMARY_BY_CARD_TYPE"));
      }
    }

    if (normalized.startsWith("total ") && normalized.includes("amount you submitted")) {
      const amount = amounts.at(-1);
      if (amount !== undefined) {
        candidates.push(makeCandidate(line, "total_volume", "Total Amount You Submitted", amount, 70, "SUMMARY"));
      }
    }
  }

  return dedupeCandidates(candidates).sort((left, right) => right.score - left.score || left.line.index - right.line.index);
}

function addCandidate(
  candidates: StatementAmountCandidate[],
  line: StatementLine,
  role: FinancialCandidateRole,
  label: string,
  pattern: RegExp,
  score: number,
): void {
  if (!pattern.test(line.content)) return;
  const amount = moneyTokens(line.content).map(Math.abs).at(-1);
  if (amount === undefined) return;
  candidates.push(makeCandidate(line, role, label, amount, score, sourceSectionForLine(line)));
}

function addFundingTotalCandidates(candidates: StatementAmountCandidate[], line: StatementLine): void {
  const control = parseFundingTotalLine(line);
  if (!control) return;
  candidates.push(makeCandidate(line, "total_volume", "Funding Control Submitted Total", control.totalVolume, 115, "FUNDING"));
  candidates.push(makeCandidate(line, "total_fees", "Funding Control Fees Total", control.totalFees, 115, "FUNDING"));
  candidates.push(makeCandidate(line, "amount_funded", "Funding Control Funded Total", control.amountFunded, 115, "FUNDING"));
}

function collectFundingControlCandidates(lines: StatementLine[]): FundingControlCandidate[] {
  return lines.flatMap((line) => {
    const parsed = parseFundingTotalLine(line);
    if (!parsed) return [];
    const submitted = makeCandidate(line, "total_volume", "Funding Control Submitted Total", parsed.totalVolume, 130, "FUNDING");
    const fees = makeCandidate(line, "total_fees", "Funding Control Fees Total", parsed.totalFees, 130, "FUNDING");
    const funded = makeCandidate(line, "amount_funded", "Funding Control Funded Total", parsed.amountFunded, 130, "FUNDING");
    return [
      {
        totalVolume: submitted,
        totalFees: fees,
        amountFunded: funded,
        adjustmentsChargebacks: parsed.adjustmentsChargebacks,
        thirdPartyTransactions: parsed.thirdPartyTransactions,
        delta: parsed.delta,
        score: 500 - Math.abs(parsed.delta) * 100,
        evidenceLine: line.content,
      },
    ];
  });
}

function selectReconciledAnatomy(
  candidates: StatementAmountCandidate[],
  fundingControls: FundingControlCandidate[],
): FundingControlCandidate | null {
  const reconciledFunding = fundingControls
    .filter((candidate) => Math.abs(candidate.delta) <= 0.02)
    .sort((left, right) => right.score - left.score || left.totalVolume.line.index - right.totalVolume.line.index)[0];
  if (reconciledFunding) return reconciledFunding;

  const volumes = candidates.filter((candidate) => candidate.roleCandidate === "total_volume");
  const fees = candidates.filter((candidate) => candidate.roleCandidate === "total_fees");
  const funded = candidates.filter((candidate) => candidate.roleCandidate === "amount_funded");
  const combos: FundingControlCandidate[] = [];
  for (const totalVolume of volumes.slice(0, 8)) {
    for (const totalFees of fees.slice(0, 8)) {
      for (const amountFunded of funded.slice(0, 8)) {
        const delta = round2(totalVolume.amount - totalFees.amount - amountFunded.amount);
        combos.push({
          totalVolume,
          totalFees,
          amountFunded,
          adjustmentsChargebacks: 0,
          thirdPartyTransactions: null,
          delta,
          score: totalVolume.score + totalFees.score + amountFunded.score - Math.abs(delta) * 50,
          evidenceLine: [totalVolume.line.content, totalFees.line.content, amountFunded.line.content].join(" / "),
        });
      }
    }
  }
  return combos
    .filter((candidate) => Math.abs(candidate.delta) <= 0.02)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

function parseFundingTotalLine(line: StatementLine): {
  totalVolume: number;
  totalFees: number;
  amountFunded: number;
  adjustmentsChargebacks: number;
  thirdPartyTransactions: number | null;
  delta: number;
} | null {
  const parts = line.content
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!/^total$/i.test(parts[0] ?? "")) return null;
  if (parts.length < 6) return null;

  const submitted = moneyFromCell(parts[1]);
  const second = signedMoneyFromCell(parts[2]);
  const third = signedMoneyFromCell(parts[3]);
  const fees = moneyFromCell(parts[4]);
  const funded = signedMoneyFromCell(parts[5]);
  if (submitted === null || second === null || third === null || fees === null || funded === null) return null;

  const optionA = zeroSafeRound2(submitted + second + third - fees - funded);
  const optionB = zeroSafeRound2(submitted - Math.abs(second) + third - fees - funded);
  const useThirdParty = Math.abs(optionB) < Math.abs(optionA) && Math.abs(second) > 0;
  const delta = useThirdParty ? optionB : optionA;
  return {
    totalVolume: Math.abs(submitted),
    totalFees: Math.abs(fees),
    amountFunded: funded,
    adjustmentsChargebacks: useThirdParty ? third : round2(second + third),
    thirdPartyTransactions: useThirdParty ? Math.abs(second) : null,
    delta,
  };
}

function makeCandidate(
  line: StatementLine,
  roleCandidate: FinancialCandidateRole,
  label: string,
  amount: number,
  score: number,
  sourceSection: string,
): StatementAmountCandidate {
  return {
    roleCandidate,
    label,
    amount: round2(Math.abs(amount)),
    line,
    sourceSection,
    score,
    confidence: score >= 100 ? "high" : "medium",
    selectionReason: null,
    rejectionReason: null,
    selected: false,
  };
}

function markSelected(candidate: StatementAmountCandidate, reason: string): StatementAmountCandidate {
  return {
    ...candidate,
    selected: true,
    selectionReason: reason,
    rejectionReason: null,
  };
}

function toFinancialCandidate(candidate: StatementAmountCandidate, selected: boolean): FinancialCandidate {
  return {
    roleCandidate: candidate.roleCandidate,
    label: candidate.label,
    amount: candidate.amount,
    sourceSection: candidate.sourceSection,
    pageNumber: candidate.line.pageNumber,
    evidenceLine: candidate.line.content,
    selected,
    selectionReason: selected ? "Selected by statement anatomy reconciliation." : null,
    rejectionReason: selected ? null : "Not selected; a stronger reconciled candidate set was available.",
    confidence: selected ? candidate.confidence : "medium",
  };
}

function toExcludedTotal(candidate: FinancialCandidate): StatementExcludedTotal {
  return {
    amount: candidate.amount,
    label: candidate.label,
    sourceSection: candidate.sourceSection,
    evidenceLine: candidate.evidenceLine,
    excludedFrom:
      candidate.roleCandidate === "total_volume"
        ? "totalVolume"
        : candidate.roleCandidate === "total_fees"
          ? "totalFees"
          : candidate.roleCandidate === "amount_funded"
            ? "amountFunded"
            : candidate.roleCandidate,
    reason: candidate.rejectionReason ?? "Not selected by reconciled statement anatomy candidate set.",
  };
}

function dedupeCandidates(candidates: StatementAmountCandidate[]): StatementAmountCandidate[] {
  const byKey = new Map<string, StatementAmountCandidate>();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const existing = byKey.get(key);
    if (!existing || candidate.score > existing.score) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}

function candidateKey(candidate: StatementAmountCandidate): string {
  return `${candidate.roleCandidate}:${candidate.amount}:${candidate.line.index}`;
}

function sourceSectionForLine(line: StatementLine): string {
  if (/funded|processed|submitted|fees charged/i.test(line.content)) return "SUMMARY";
  if (/^total\s*\|/i.test(line.content)) return "FUNDING";
  return "DOCUMENT";
}

function moneyTokens(input: string): number[] {
  return signedMoneyTokens(cleanStatementText(input));
}

function moneyFromCell(input: string | undefined): number | null {
  const signed = signedMoneyFromCell(input);
  return signed === null ? null : Math.abs(signed);
}

function signedMoneyFromCell(input: string | undefined): number | null {
  if (input === undefined) return null;
  const normalized = cleanStatementText(input)
    .replace(/\(([^)]+)\)/g, "-$1")
    .replace(/[$,\s]/g, "")
    .trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function cleanStatementText(input: string): string {
  return input
    .replace(/[\uE000-\uF8FF]/g, "$")
    .replace(/\bTotaI\b/g, "Total")
    .replace(/\$\s+/g, "$")
    .replace(/,\s+(?=\d{3}\b)/g, ",")
    .replace(/(\d)\s+\.(\d{2})\b/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStatementText(input: string): string {
  return cleanStatementText(input)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bmiscellaneous\b/g, "misc")
    .replace(/[^a-z0-9/$.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function zeroSafeRound2(value: number): number {
  const rounded = round2(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}
