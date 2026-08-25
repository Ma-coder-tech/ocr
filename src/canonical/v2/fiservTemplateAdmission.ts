import { evaluateFiservFullTemplateAdmission } from "./fiservFullTemplateAdmission.js";
import { resolveFiservShortTemplateAdmission } from "./fiservShortTemplateAdmission.js";

export type FiservTemplateAdmissionResolution = NonNullable<ReturnType<typeof resolveFiservShortTemplateAdmission>>
  | NonNullable<ReturnType<typeof evaluateFiservFullTemplateAdmission>["resolution"]>;

export function resolveFiservTemplateAdmission(input: Parameters<typeof resolveFiservShortTemplateAdmission>[0]): {
  resolution: FiservTemplateAdmissionResolution | null;
  fullFamilyDecision: ReturnType<typeof evaluateFiservFullTemplateAdmission>["decision"];
} {
  const full = evaluateFiservFullTemplateAdmission(input);
  const short = resolveFiservShortTemplateAdmission(input);
  return { resolution: full.resolution ?? short, fullFamilyDecision: full.decision };
}
