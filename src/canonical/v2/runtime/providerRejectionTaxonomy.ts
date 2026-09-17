import type { CanonicalRgProviderDiagnostics } from "./rgWorkLedger.js";

export const OPENAI_ACCOUNT_QUOTA_EXHAUSTED_REASON = "rg_openai_account_quota_exhausted" as const;

const ACCOUNT_QUOTA_ERROR_TYPES = new Set(["insufficient_quota"]);
const ACCOUNT_QUOTA_ERROR_CODES = new Set(["credit_balance_exhausted", "insufficient_quota"]);
const READINESS_REASON_PATTERN = /(authentication|authorization|account|model|configuration|credential)/;
const READINESS_HTTP_STATUSES = new Set([400, 401, 402, 403, 404, 415, 422]);

type ProviderErrorIdentity = Pick<CanonicalRgProviderDiagnostics, "providerErrorType" | "providerErrorCode">;

export function isProviderAccountQuotaExhaustion(diagnostics: ProviderErrorIdentity | null | undefined): boolean {
  const errorType = normalizedDiagnosticCode(diagnostics?.providerErrorType);
  const errorCode = normalizedDiagnosticCode(diagnostics?.providerErrorCode);
  return ACCOUNT_QUOTA_ERROR_TYPES.has(errorType) || ACCOUNT_QUOTA_ERROR_CODES.has(errorCode);
}

export function providerRejectionRequiresReadinessChange(
  reasonCode: string,
  diagnostics: CanonicalRgProviderDiagnostics | null | undefined,
): boolean {
  return READINESS_REASON_PATTERN.test(reasonCode)
    || READINESS_HTTP_STATUSES.has(diagnostics?.httpStatus ?? -1)
    || isProviderAccountQuotaExhaustion(diagnostics);
}

function normalizedDiagnosticCode(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
