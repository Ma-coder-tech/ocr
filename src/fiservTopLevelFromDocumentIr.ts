import type { DocumentIR, DocumentLine } from "./documentIr.js";
import { makeAmountCheck, makeNotApplicableCheck, makeRateCheck, round2, round8 } from "./reconciliation.js";

export type FiservTopLevelLayoutFamily = "first_data_statement" | "fiserv_processor_branded";

export type DocumentIrFinancialEvidence = {
  field: string;
  lineId: string;
  pageNumber: number;
  evidenceLine: string;
  value: number;
};

export type FiservDocumentIrTopLevelFinancials = {
  layoutFamily: FiservTopLevelLayoutFamily;
  totalVolume: number;
  totalFees: number;
  effectiveRate: number;
  amountFunded: number;
  adjustmentsChargebacks: number | null;
  thirdPartyTransactions: number | null;
  reconciliation: {
    fundingFormula: ReturnType<typeof makeAmountCheck>;
    effectiveRateFormula: ReturnType<typeof makeRateCheck> | ReturnType<typeof makeNotApplicableCheck>;
  };
  evidence: DocumentIrFinancialEvidence[];
};

type RequiredLine = {
  line: DocumentLine;
  value: number;
};

type AmountMode = "absolute" | "signed";

export function extractFiservTopLevelFinancialsFromDocumentIr(ir: DocumentIR): FiservDocumentIrTopLevelFinancials {
  return looksLikeFirstDataSummary(ir) ? extractFirstDataStatementTopLevel(ir) : extractProcessorBrandedTopLevel(ir);
}

function extractFirstDataStatementTopLevel(ir: DocumentIR): FiservDocumentIrTopLevelFinancials {
  const summaryLines = linesForFamilySection(ir, "summary").filter((line) => line.pageNumber === 1);
  const searchLines = summaryLines.length > 0 ? summaryLines : allLines(ir).filter((line) => line.pageNumber === 1);

  const totalVolume = requireLineAmount(searchLines, /total amount submitted/i, "Total Amount Submitted");
  const amountFunded = requireLineAmount(searchLines, /total amount processed/i, "Total Amount Processed");
  const fees = requireLineAmount(
    searchLines,
    (line) => /\bfees\b/i.test(line.text) && /-\s*\$?/.test(normalizeMoneyText(line.text)),
    "Fees",
  );
  const adjustments = optionalLineAmount(searchLines, /\badjustments\b/i, "signed");
  const chargebacks = optionalLineAmount(searchLines, /\bchargebacks\/reversals\b/i, "signed");
  const adjustmentsChargebacks = round2((adjustments?.value ?? 0) + (chargebacks?.value ?? 0));
  const effectiveRate = totalVolume.value === 0 ? 0 : round8(fees.value / totalVolume.value);
  const fundingExpected = round2(totalVolume.value - 0 + adjustmentsChargebacks - fees.value);

  return {
    layoutFamily: "first_data_statement",
    totalVolume: totalVolume.value,
    totalFees: fees.value,
    effectiveRate,
    amountFunded: amountFunded.value,
    adjustmentsChargebacks,
    thirdPartyTransactions: 0,
    reconciliation: {
      fundingFormula: makeAmountCheck(
        fundingExpected,
        amountFunded.value,
        0.01,
        `${totalVolume.value.toFixed(2)} - 0.00 + ${adjustmentsChargebacks.toFixed(2)} - ${fees.value.toFixed(2)} = ${fundingExpected.toFixed(2)}`,
      ),
      effectiveRateFormula:
        totalVolume.value === 0
          ? makeNotApplicableCheck("Effective rate is not applicable because selected volume is $0.00.")
          : makeRateCheck(
              effectiveRate,
              fees.value / totalVolume.value,
              0.000001,
              `${fees.value.toFixed(2)} / ${totalVolume.value.toFixed(2)} = ${effectiveRate.toFixed(8)}`,
            ),
    },
    evidence: [
      evidence("totalVolume", totalVolume),
      evidence("totalFees", fees),
      evidence("amountFunded", amountFunded),
      ...(adjustments ? [evidence("adjustments", adjustments)] : []),
      ...(chargebacks ? [evidence("chargebacks", chargebacks)] : []),
    ],
  };
}

function extractProcessorBrandedTopLevel(ir: DocumentIR): FiservDocumentIrTopLevelFinancials {
  const firstPageLines = allLines(ir).filter((line) => line.pageNumber === 1);
  const summaryLines = takeUntil(firstPageLines, (line) => /^important information\b/i.test(line.text));

  const totalVolume = requireLineAmount(summaryLines, /\bamounts submitted\b/i, "Amounts Submitted");
  const thirdParty = requireLineAmount(summaryLines, /\bthird party transactions\b/i, "Third Party Transactions");
  const adjustmentsChargebacks = requireLineAmount(summaryLines, /\badjustments\/chargebacks\b/i, "Adjustments/Chargebacks", "signed");
  const fees = requireLineAmount(summaryLines, /\bfees charged\b/i, "Fees Charged");
  const amountFunded = requireLineAmount(
    summaryLines,
    (line) => /\btotal amount funded to your bank\b/i.test(normalizedLabelText(line.text)),
    "Total Amount Funded to Your Bank",
    "signed",
  );
  const effectiveRate = totalVolume.value === 0 ? 0 : round8(fees.value / totalVolume.value);
  const fundingExpected = round2(totalVolume.value - thirdParty.value + adjustmentsChargebacks.value - fees.value);

  return {
    layoutFamily: "fiserv_processor_branded",
    totalVolume: totalVolume.value,
    totalFees: fees.value,
    effectiveRate,
    amountFunded: amountFunded.value,
    adjustmentsChargebacks: adjustmentsChargebacks.value,
    thirdPartyTransactions: thirdParty.value,
    reconciliation: {
      fundingFormula: makeAmountCheck(
        fundingExpected,
        amountFunded.value,
        0.01,
        `${totalVolume.value.toFixed(2)} - ${thirdParty.value.toFixed(2)} + ${adjustmentsChargebacks.value.toFixed(2)} - ${fees.value.toFixed(2)} = ${fundingExpected.toFixed(2)}`,
      ),
      effectiveRateFormula:
        totalVolume.value === 0
          ? makeNotApplicableCheck("Effective rate is not applicable because selected volume is $0.00.")
          : makeRateCheck(
              effectiveRate,
              fees.value / totalVolume.value,
              0.000001,
              `${fees.value.toFixed(2)} / ${totalVolume.value.toFixed(2)} = ${effectiveRate.toFixed(8)}`,
            ),
    },
    evidence: [
      evidence("totalVolume", totalVolume),
      evidence("thirdPartyTransactions", thirdParty),
      evidence("adjustmentsChargebacks", adjustmentsChargebacks),
      evidence("totalFees", fees),
      evidence("amountFunded", amountFunded),
    ],
  };
}

function looksLikeFirstDataSummary(ir: DocumentIR): boolean {
  const firstPageText = allLines(ir)
    .filter((line) => line.pageNumber === 1)
    .map((line) => line.text)
    .join("\n");
  return /\btotal amount submitted\b/i.test(firstPageText) && /\btotal amount processed\b/i.test(firstPageText);
}

function linesForFamilySection(ir: DocumentIR, familySectionType: string): DocumentLine[] {
  const ids = new Set(
    ir.sections
      .filter((section) => section.familySectionType === familySectionType)
      .flatMap((section) => section.lineIds),
  );
  if (ids.size === 0) return [];
  return allLines(ir).filter((line) => ids.has(line.id));
}

function allLines(ir: DocumentIR): DocumentLine[] {
  return ir.pages.flatMap((page) => page.lines);
}

function requireLineAmount(
  lines: DocumentLine[],
  predicate: RegExp | ((line: DocumentLine) => boolean),
  label: string,
  mode: AmountMode = "absolute",
): RequiredLine {
  const found = optionalLineAmount(lines, predicate, mode);
  if (!found) {
    throw new Error(`DocumentIR Fiserv top-level extractor could not find ${label}.`);
  }
  return found;
}

function optionalLineAmount(
  lines: DocumentLine[],
  predicate: RegExp | ((line: DocumentLine) => boolean),
  mode: AmountMode = "absolute",
): RequiredLine | null {
  const matcher = typeof predicate === "function" ? predicate : (line: DocumentLine) => predicate.test(line.text);
  const line = lines.find((candidate) => matcher(candidate));
  if (!line) return null;
  return { line, value: lastMoneyAmount(line.text, mode) };
}

function lastMoneyAmount(input: string, mode: AmountMode): number {
  const matches = signedMoneyTokens(input);
  const last = matches.at(-1);
  if (last === undefined) {
    throw new Error(`DocumentIR Fiserv top-level extractor could not read amount from: ${input}`);
  }
  return mode === "signed" ? last : Math.abs(last);
}

function signedMoneyTokens(input: string): number[] {
  const normalized = normalizeMoneyText(input);
  return [...normalized.matchAll(/-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+\.\d{2}/g)]
    .map((match) => Number(match[0].replace(/[$,]/g, "")))
    .filter(Number.isFinite);
}

function normalizeMoneyText(input: string): string {
  return input
    .replace(/\bTotaI\b/g, "Total")
    .replace(/(?<=\d)\s+(?=[,.]\d)/g, "")
    .replace(/(?<=\d)\s+(?=,\d{3})/g, "")
    .replace(/\$\s+/g, "$")
    .replace(/-\s+\$/g, "-$");
}

function normalizedLabelText(input: string): string {
  return normalizeMoneyText(input).replace(/\bTotaI\b/g, "Total");
}

function takeUntil(lines: DocumentLine[], predicate: (line: DocumentLine) => boolean): DocumentLine[] {
  const index = lines.findIndex(predicate);
  return index < 0 ? lines : lines.slice(0, index);
}

function evidence(field: string, item: RequiredLine): DocumentIrFinancialEvidence {
  return {
    field,
    lineId: item.line.id,
    pageNumber: item.line.pageNumber,
    evidenceLine: item.line.text,
    value: item.value,
  };
}
