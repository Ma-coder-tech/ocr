import { canonicalJson, containsPrivateLocatorOrPayload, isCanonicalCode, isSafeStructuredString } from "../knowledge/knowledgeSafety.js";
import type { ThemeLanguageCandidate, ThemeLanguageInput } from "./intelligenceTypes.js";

const FORBIDDEN_STRENGTHENING = /(?:\bsav(?:e|es|ing|ings)\b|\bovercharg(?:e|ed|ing)\b|\brenegotiat|\bdemand\b|\b(?:remove|eliminate)\b.{0,24}\bfee\b|\bswitch\b.{0,24}\bproviders?\b|\bavoidable\b|\bprocessor\b.{0,32}\b(?:keep|keeping|keeps|retain|retaining|retains|fault|profit|margin|control|controls|benefit|benefits)\b|\b(?:owner|ownership|beneficiary|blame|fault|unfair)\b|\bguarantee(?:d)?\b|\bexpected savings\b|\$|\b\d+(?:\.\d+)?%)/i;

export function validateThemeLanguageInput(input: ThemeLanguageInput, canonicalReferenceIds: readonly string[]): string[] {
  const issues: string[] = [];
  const refs = [input.themeRef, ...input.factRefs, ...input.driverRefs, ...input.leverRefs];
  if (!isSafeStructuredString(input.itemId) || !isSafeStructuredString(input.themeRef) || !isCanonicalCode(input.themeType)
    || !refs.every(isSafeStructuredString) || refs.some((ref) => !canonicalReferenceIds.includes(ref))) issues.push("language_input_reference_invalid");
  if (!input.limitationCodes.every(isCanonicalCode) || !isCanonicalCode(input.actionabilityCode)
    || !["verification_only", "informational_only", "unresolved", "not_actionable"].includes(input.actionabilityCode)
    || !["resolved", "limited", "unresolved"].includes(input.uncertaintyState)) issues.push("language_input_semantics_invalid");
  if (refs.some(containsPrivateLocatorOrPayload) || input.limitationCodes.some(containsPrivateLocatorOrPayload)) issues.push("language_input_private_payload_forbidden");
  return [...new Set(issues)];
}

export function deterministicThemeLanguageFallback(input: ThemeLanguageInput): ThemeLanguageCandidate {
  const uncertainty = input.limitationCodes.length > 0 ? " The stated limitations remain unresolved." : " The supporting canonical references remain unchanged.";
  const text = `This structured economic theme reflects the supported ${input.themeType.replace(/_/g, " ")} question.${uncertainty}`;
  return {
    itemId: input.itemId,
    themeRef: input.themeRef,
    text,
    deterministicFallbackText: text,
    factRefs: [...input.factRefs],
    driverRefs: [...input.driverRefs],
    leverRefs: [...input.leverRefs],
    limitationCodes: [...input.limitationCodes],
    actionabilityCode: input.actionabilityCode,
    uncertaintyState: input.uncertaintyState,
    claimClasses: input.uncertaintyState === "resolved" ? ["neutral_observation"] : ["neutral_observation", "uncertainty_preserved"],
    source: "deterministic_fallback",
    authority: "non_authoritative_candidate",
    customerVisible: false,
    reportPermission: "none",
    validation: "accepted",
  };
}

export function validateThemeLanguageCandidate(
  input: ThemeLanguageInput,
  candidate: ThemeLanguageCandidate,
): { accepted: boolean; reasonCodes: string[]; candidate: ThemeLanguageCandidate } {
  const fallback = deterministicThemeLanguageFallback(input);
  const reasons: string[] = [];
  if (candidate.itemId !== input.itemId || candidate.themeRef !== input.themeRef) reasons.push("language_identity_mismatch");
  if (!isSafeStructuredString(candidate.itemId) || !isSafeStructuredString(candidate.themeRef)) reasons.push("language_identity_malformed");
  if (canonicalJson([...candidate.factRefs].sort()) !== canonicalJson([...input.factRefs].sort())) reasons.push("language_fact_refs_changed");
  if (canonicalJson([...candidate.driverRefs].sort()) !== canonicalJson([...input.driverRefs].sort())) reasons.push("language_driver_refs_changed");
  if (canonicalJson([...candidate.leverRefs].sort()) !== canonicalJson([...input.leverRefs].sort())) reasons.push("language_lever_refs_changed");
  if (canonicalJson([...candidate.limitationCodes].sort()) !== canonicalJson([...input.limitationCodes].sort())) reasons.push("language_limitations_changed");
  if (candidate.actionabilityCode !== input.actionabilityCode || candidate.uncertaintyState !== input.uncertaintyState) reasons.push("language_semantics_changed");
  const requiredClasses = input.uncertaintyState === "resolved" ? ["neutral_observation"] : ["neutral_observation", "uncertainty_preserved"];
  if (canonicalJson([...candidate.claimClasses].sort()) !== canonicalJson(requiredClasses.sort())) reasons.push("language_claim_class_strengthened");
  if (candidate.authority !== "non_authoritative_candidate" || candidate.customerVisible !== false || candidate.reportPermission !== "none") {
    reasons.push("language_authority_strengthened");
  }
  if (typeof candidate.text !== "string" || candidate.text.length < 1 || candidate.text.length > 1_000) reasons.push("language_text_malformed");
  if (typeof candidate.text === "string" && containsPrivateLocatorOrPayload(candidate.text)) reasons.push("language_private_payload_forbidden");
  if (FORBIDDEN_STRENGTHENING.test(candidate.text)) reasons.push("language_logical_strengthening");
  if (reasons.length > 0) {
    return {
      accepted: false,
      reasonCodes: reasons,
      candidate: { ...fallback, validation: reasons.some((reason) => reason.includes("strengthen")) ? "rejected_strengthening" : "malformed" },
    };
  }
  return {
    accepted: true,
    reasonCodes: ["language_candidate_validated"],
    candidate: {
      ...candidate,
      deterministicFallbackText: fallback.text,
      source: "provider_candidate",
      authority: "non_authoritative_candidate",
      customerVisible: false,
      reportPermission: "none",
      validation: "accepted",
    },
  };
}
