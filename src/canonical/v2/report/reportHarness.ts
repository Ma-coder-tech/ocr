import type { BuildCanonicalMerchantReportProjectionV2Input, BuildCanonicalMerchantReportProjectionV2Result } from "./reportProjection.js";
import { buildCanonicalMerchantReportProjectionV2 } from "./reportProjection.js";
import { assertValidCanonicalMerchantReportProjectionV2 } from "./reportValidate.js";

/** Local-only composition seam over a real accepted V2 synthesis analysis. It has no runtime, API, or persistence integration. */
export function composeCanonicalMerchantReportV2(
  input: BuildCanonicalMerchantReportProjectionV2Input,
): BuildCanonicalMerchantReportProjectionV2Result {
  const result = buildCanonicalMerchantReportProjectionV2(input);
  assertValidCanonicalMerchantReportProjectionV2(result.projection);
  if (result.audit.validation.status !== "valid") {
    throw new Error(`RH_REPORT_AUDIT_INVALID:${result.audit.validation.errors.join("|")}`);
  }
  return result;
}
