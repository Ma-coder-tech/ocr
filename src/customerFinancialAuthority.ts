import type { AnalysisSummary } from "./types.js";

/** Internal parser observations become customer financial facts only after this gate. */
export function customerFinancialsAuthorized(summary: AnalysisSummary | null | undefined): boolean {
  if (!summary) return false;
  if (summary.parserDecision?.reportable === false
    || summary.parserDecision?.validationState?.customerFacingTotalsAllowed === false) return false;
  if (summary.sourceType === "csv") return true;
  if (summary.sourceType !== "pdf") return false;
  const decision = summary.parserDecision;
  return decision?.reportable === true
    && decision.validationState?.customerFacingTotalsAllowed !== false;
}

export class CustomerFinancialAuthorityError extends Error {
  constructor() {
    super("PARSER_FINANCIAL_OUTPUT_NOT_AUTHORIZED");
  }
}

export function requireCustomerFinancialAuthority(summary: AnalysisSummary): void {
  if (!customerFinancialsAuthorized(summary)) throw new CustomerFinancialAuthorityError();
}

export const CUSTOMER_UNAVAILABLE_MESSAGE =
  "We could not verify this statement for a customer financial report. Your upload remains available for review.";
