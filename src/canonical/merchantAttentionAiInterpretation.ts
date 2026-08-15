import type {
  CanonicalMerchantAttentionAiInterpretationOutput,
  CanonicalMerchantAttentionItem,
  CanonicalMerchantAttentionModel,
} from "./types.js";

export const MERCHANT_ATTENTION_AI_INTERPRETATION_POLICY_VERSION = "merchant_attention_ai_interpretation_v1" as const;
export const MERCHANT_ATTENTION_AI_INPUT_POLICY_VERSION = "merchant_attention_ai_input_v1" as const;

export type MerchantAttentionAiInterpretationPacket = {
  type: "merchant_attention_ai_interpretation_input";
  policyVersion: "merchant_attention_ai_input_v1";
  purpose: "merchant_friendly_interpretation_only";
  privacy: {
    directMerchantIdentityIncluded: false;
    accountIdentifiersIncluded: false;
    sourceDocumentIncluded: false;
    rawStatementTextIncluded: false;
  };
  authority: {
    outputIsAuthoritative: false;
    financialMutationAllowed: false;
    evidenceMutationAllowed: false;
    actionabilityExpansionAllowed: false;
  };
  items: Array<{
    attentionItemId: string;
    observedFact: {
      statementLabel: string | null;
      amount: CanonicalMerchantAttentionItem["observedAmount"];
    };
    acceptedMeaning: {
      category: CanonicalMerchantAttentionItem["category"];
      attentionType: CanonicalMerchantAttentionItem["attentionType"];
      priority: CanonicalMerchantAttentionItem["priority"];
      evidenceStatus: CanonicalMerchantAttentionItem["evidenceStatus"];
      confidence: CanonicalMerchantAttentionItem["confidence"];
      reasonableConclusion: string;
      remainingUncertainty: string[];
      resolutionRequirement: CanonicalMerchantAttentionItem["resolution"]["requirement"];
    };
    permissionBoundary: {
      actionabilityCeiling: CanonicalMerchantAttentionItem["actionabilityCeiling"];
      permittedActionType: CanonicalMerchantAttentionItem["safestNextAction"]["actionType"];
      opportunityLinked: boolean;
    };
    requiredShape: {
      questionRequired: boolean;
      actionToolkitRequired: boolean;
    };
    deterministicFallback: {
      merchantTitle: string;
      whyThisDeservesAttention: string;
      safeNextAction: string;
      resolutionMeaning: string;
    };
    evidenceRefs: string[];
    sourceIntelligenceRefs: string[];
  }>;
};

export type MerchantAttentionAiAdmissionResult = {
  admitted: boolean;
  model: CanonicalMerchantAttentionModel;
  errors: string[];
};

const OUTPUT_ROOT_KEYS = new Set([
  "type",
  "policyVersion",
  "outputId",
  "items",
  "authoritative",
  "financialMutationAllowed",
  "providerDetailsStripped",
]);
const OUTPUT_ITEM_KEYS = new Set([
  "attentionItemId",
  "merchantTitle",
  "whyThisDeservesAttention",
  "reasonableConclusion",
  "remainingUncertainty",
  "safeNextAction",
  "resolutionMeaning",
  "question",
  "actionToolkit",
]);
const OUTPUT_QUESTION_KEYS = new Set(["question", "whatRateRevealKnows", "whatRemainsUncertain", "safeNextStep"]);
const OUTPUT_TOOLKIT_KEYS = new Set([
  "whatToDo",
  "why",
  "exactAsk",
  "unclearAnswerFollowUp",
  "avoidClaiming",
  "successCriteria",
]);

export function buildMerchantAttentionAiInterpretationPacket(
  model: CanonicalMerchantAttentionModel,
): MerchantAttentionAiInterpretationPacket {
  return {
    type: "merchant_attention_ai_interpretation_input",
    policyVersion: MERCHANT_ATTENTION_AI_INPUT_POLICY_VERSION,
    purpose: "merchant_friendly_interpretation_only",
    privacy: {
      directMerchantIdentityIncluded: false,
      accountIdentifiersIncluded: false,
      sourceDocumentIncluded: false,
      rawStatementTextIncluded: false,
    },
    authority: {
      outputIsAuthoritative: false,
      financialMutationAllowed: false,
      evidenceMutationAllowed: false,
      actionabilityExpansionAllowed: false,
    },
    items: model.items.map((item) => ({
      attentionItemId: item.id,
      observedFact: {
        statementLabel: minimizeObservedLabel(item.originalObservedStatementLabel),
        amount: item.observedAmount ? { ...item.observedAmount } : null,
      },
      acceptedMeaning: {
        category: item.category,
        attentionType: item.attentionType,
        priority: item.priority,
        evidenceStatus: item.evidenceStatus,
        confidence: item.confidence,
        reasonableConclusion: item.evidenceBoundary.reasonableConclusion.summary,
        remainingUncertainty: [...item.evidenceBoundary.remainingUncertainty],
        resolutionRequirement: item.resolution.requirement,
      },
      permissionBoundary: {
        actionabilityCeiling: item.actionabilityCeiling,
        permittedActionType: item.safestNextAction.actionType,
        opportunityLinked: item.opportunityLink !== null,
      },
      requiredShape: {
        questionRequired: item.questionToResolve !== null,
        actionToolkitRequired: item.actionToolkit !== null,
      },
      deterministicFallback: {
        merchantTitle: item.merchantTitle,
        whyThisDeservesAttention: item.whyThisDeservesAttention,
        safeNextAction: item.safestNextAction.instruction,
        resolutionMeaning: item.resolution.merchantMeaning,
      },
      evidenceRefs: [...item.evidenceRefs],
      sourceIntelligenceRefs: [...item.sourceIntelligenceRefs],
    })),
  };
}

export function admitMerchantAttentionAiInterpretation(input: {
  model: CanonicalMerchantAttentionModel;
  output: unknown;
}): MerchantAttentionAiAdmissionResult {
  if (
    input.model.interpretation.source !== "deterministic_fallback" ||
    input.model.items.some((item) => item.merchantLanguageSource !== "deterministic_fallback")
  ) {
    return {
      admitted: false,
      model: input.model,
      errors: ["AI merchant interpretation admission requires a fresh deterministic merchant-attention model."],
    };
  }
  const errors = validateOutputShape(input.output, input.model);
  if (errors.length > 0) return rejected(input.model, errors);
  const output = input.output as CanonicalMerchantAttentionAiInterpretationOutput;
  const interpretations = new Map(output.items.map((item) => [item.attentionItemId, item]));
  const items = input.model.items.map((item) => {
    const interpretation = interpretations.get(item.id)!;
    return {
      ...item,
      merchantTitle: interpretation.merchantTitle.trim(),
      whyThisDeservesAttention: interpretation.whyThisDeservesAttention.trim(),
      evidenceBoundary: {
        ...item.evidenceBoundary,
        reasonableConclusion: {
          ...item.evidenceBoundary.reasonableConclusion,
          summary: interpretation.reasonableConclusion.trim(),
        },
        remainingUncertainty: interpretation.remainingUncertainty.map((value) => value.trim()),
      },
      resolution: {
        ...item.resolution,
        merchantMeaning: interpretation.resolutionMeaning.trim(),
      },
      safestNextAction: {
        ...item.safestNextAction,
        instruction: interpretation.safeNextAction.trim(),
      },
      questionToResolve: item.questionToResolve && interpretation.question
        ? {
            ...item.questionToResolve,
            question: interpretation.question.question.trim(),
            whatRateRevealKnows: interpretation.question.whatRateRevealKnows.trim(),
            whatRemainsUncertain: interpretation.question.whatRemainsUncertain.trim(),
            safeNextStep: interpretation.question.safeNextStep.trim(),
          }
        : item.questionToResolve,
      actionToolkit: item.actionToolkit && interpretation.actionToolkit
        ? {
            ...item.actionToolkit,
            whatToDo: interpretation.actionToolkit.whatToDo.trim(),
            why: interpretation.actionToolkit.why.trim(),
            exactAsk: interpretation.actionToolkit.exactAsk?.trim() ?? null,
            unclearAnswerFollowUp: interpretation.actionToolkit.unclearAnswerFollowUp?.trim() ?? null,
            avoidClaiming: interpretation.actionToolkit.avoidClaiming.map((value) => value.trim()),
            successCriteria: interpretation.actionToolkit.successCriteria.map((value) => value.trim()),
          }
        : item.actionToolkit,
      merchantLanguageSource: "admitted_ai_interpretation" as const,
    };
  });
  return {
    admitted: true,
    errors: [],
    model: {
      ...input.model,
      items,
      interpretation: {
        policyVersion: MERCHANT_ATTENTION_AI_INTERPRETATION_POLICY_VERSION,
        normalPathRequirement: "ai_interpretation_required",
        source: "admitted_ai_interpretation",
        readiness: "ready",
        authoritative: false,
        financialMutationAllowed: false,
        outputRef: output.outputId,
        admission: {
          schemaValidated: true,
          canonicalLinkageValidated: true,
          actionabilityCeilingValidated: true,
          privacyValidated: true,
          reasonCodes: ["merchant_attention_ai_interpretation_admitted"],
        },
        fallbackReasonCodes: [],
      },
    },
  };
}

function validateOutputShape(output: unknown, model: CanonicalMerchantAttentionModel): string[] {
  const errors: string[] = [];
  if (!isRecord(output)) return ["AI merchant interpretation output must be an object."];
  exactKeys(output, OUTPUT_ROOT_KEYS, "output", errors);
  if (output.type !== "merchant_attention_ai_interpretation") errors.push("AI merchant interpretation type is invalid.");
  if (output.policyVersion !== MERCHANT_ATTENTION_AI_INTERPRETATION_POLICY_VERSION) errors.push("AI merchant interpretation policy version is invalid.");
  if (!nonEmptyString(output.outputId)) errors.push("AI merchant interpretation outputId is required.");
  if (output.authoritative !== false || output.financialMutationAllowed !== false || output.providerDetailsStripped !== true) {
    errors.push("AI merchant interpretation authority or privacy declarations are unsafe.");
  }
  if (!Array.isArray(output.items)) {
    errors.push("AI merchant interpretation items must be an array.");
    return errors;
  }
  const expected = new Map(model.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const [index, value] of output.items.entries()) {
    if (!isRecord(value)) {
      errors.push(`AI merchant interpretation item ${index} must be an object.`);
      continue;
    }
    exactKeys(value, OUTPUT_ITEM_KEYS, `items[${index}]`, errors);
    if (!nonEmptyString(value.attentionItemId)) {
      errors.push(`AI merchant interpretation item ${index} has no attention item id.`);
      continue;
    }
    if (seen.has(value.attentionItemId)) errors.push(`AI merchant interpretation duplicates ${value.attentionItemId}.`);
    seen.add(value.attentionItemId);
    const canonical = expected.get(value.attentionItemId);
    if (!canonical) {
      errors.push(`AI merchant interpretation references unknown item ${value.attentionItemId}.`);
      continue;
    }
    for (const key of ["merchantTitle", "whyThisDeservesAttention", "reasonableConclusion", "safeNextAction", "resolutionMeaning"] as const) {
      if (!nonEmptyString(value[key])) errors.push(`AI merchant interpretation ${value.attentionItemId}.${key} is required.`);
    }
    if (!stringArray(value.remainingUncertainty, false)) errors.push(`AI merchant interpretation ${value.attentionItemId}.remainingUncertainty is invalid.`);
    validateQuestion(value.question, canonical, errors);
    validateToolkit(value.actionToolkit, canonical, errors);
    const language = merchantLanguageOnly(value);
    const unsafe = unsafeLanguage(language);
    if (unsafe) errors.push(`AI merchant interpretation ${value.attentionItemId} contains unsafe merchant language: ${unsafe}.`);
    const permissionError = actionPermissionError(canonical, value);
    if (permissionError) errors.push(`AI merchant interpretation ${value.attentionItemId} exceeds its action permission: ${permissionError}.`);
    const claimError = unsupportedPositiveClaim(value);
    if (claimError) errors.push(`AI merchant interpretation ${value.attentionItemId} contains an unsupported positive claim: ${claimError}.`);
  }
  const expectedIds = [...expected.keys()].sort();
  const actualIds = [...seen].sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) errors.push("AI merchant interpretation must cover each canonical attention item exactly once.");
  const forbidden = forbiddenFieldPath(output);
  if (forbidden) errors.push(`AI merchant interpretation contains a forbidden authoritative or private field at ${forbidden}.`);
  return errors;
}

function validateQuestion(value: unknown, canonical: CanonicalMerchantAttentionItem, errors: string[]): void {
  if (canonical.questionToResolve === null) {
    if (value !== null) errors.push(`AI merchant interpretation ${canonical.id} cannot create a question.`);
    return;
  }
  if (!isRecord(value)) {
    errors.push(`AI merchant interpretation ${canonical.id} must include its canonical question shape.`);
    return;
  }
  exactKeys(value, OUTPUT_QUESTION_KEYS, `${canonical.id}.question`, errors);
  for (const key of OUTPUT_QUESTION_KEYS) if (!nonEmptyString(value[key])) errors.push(`AI merchant interpretation ${canonical.id}.question.${key} is required.`);
}

function validateToolkit(value: unknown, canonical: CanonicalMerchantAttentionItem, errors: string[]): void {
  if (canonical.actionToolkit === null) {
    if (value !== null) errors.push(`AI merchant interpretation ${canonical.id} cannot create an Action Toolkit module.`);
    return;
  }
  if (!isRecord(value)) {
    errors.push(`AI merchant interpretation ${canonical.id} must include its canonical Action Toolkit shape.`);
    return;
  }
  exactKeys(value, OUTPUT_TOOLKIT_KEYS, `${canonical.id}.actionToolkit`, errors);
  for (const key of ["whatToDo", "why"] as const) if (!nonEmptyString(value[key])) errors.push(`AI merchant interpretation ${canonical.id}.actionToolkit.${key} is required.`);
  for (const key of ["exactAsk", "unclearAnswerFollowUp"] as const) {
    if (value[key] !== null && !nonEmptyString(value[key])) errors.push(`AI merchant interpretation ${canonical.id}.actionToolkit.${key} is invalid.`);
  }
  for (const key of ["avoidClaiming", "successCriteria"] as const) {
    if (!stringArray(value[key], false)) errors.push(`AI merchant interpretation ${canonical.id}.actionToolkit.${key} is invalid.`);
  }
}

function merchantLanguageOnly(value: Record<string, unknown>): unknown {
  return {
    merchantTitle: value.merchantTitle,
    whyThisDeservesAttention: value.whyThisDeservesAttention,
    reasonableConclusion: value.reasonableConclusion,
    remainingUncertainty: value.remainingUncertainty,
    safeNextAction: value.safeNextAction,
    resolutionMeaning: value.resolutionMeaning,
    question: value.question,
    actionToolkit: value.actionToolkit,
  };
}

function unsafeLanguage(value: unknown): string | null {
  const text = collectStrings(value).join(" ");
  if (/[$€£¥]|\d/.test(text)) return "new numeric or currency claim";
  if (/\b(?:guaranteed|definitely|certainly)\s+(?:removable|negotiable|overcharg|sav)/i.test(text)) return "unsupported certainty";
  if (/\b(?:you will save|savings (?:is|are)|overpayment (?:is|of)|recoverable amount)\b/i.test(text)) return "unsupported savings or overpayment claim";
  if (/\b(?:nothing|no uncertainty)\s+(?:remains|is left)?\b|\bfully proven\b/i.test(text)) return "erased uncertainty";
  if (/\b(?:contract|agreement|network rule|processor rule)\s+(?:says|requires|guarantees|proves)\b/i.test(text)) return "invented contract or rule claim";
  if (/\b(?:ignore|exceed|override)\s+(?:the\s+)?(?:evidence|actionability|canonical)/i.test(text)) return "attempt to override canonical constraints";
  return null;
}

function unsupportedPositiveClaim(value: Record<string, unknown>): string | null {
  const question = isRecord(value.question) ? value.question : {};
  const toolkit = isRecord(value.actionToolkit) ? value.actionToolkit : {};
  const positiveClaims = collectStrings({
    merchantTitle: value.merchantTitle,
    whyThisDeservesAttention: value.whyThisDeservesAttention,
    reasonableConclusion: value.reasonableConclusion,
    questionWhatRateRevealKnows: question.whatRateRevealKnows,
    toolkitWhy: toolkit.why,
  }).join(" ");
  if (/\b(?:is|was|proves?|shows?)\s+(?:an?\s+)?(?:overcharge|removable|negotiable|contract breach)\b|\byou (?:were|are) overcharged\b/i.test(positiveClaims)) {
    return "overcharge, removability, negotiability, or contract-breach conclusion";
  }
  return null;
}

function actionPermissionError(canonical: CanonicalMerchantAttentionItem, value: Record<string, unknown>): string | null {
  const question = isRecord(value.question) ? value.question : {};
  const toolkit = isRecord(value.actionToolkit) ? value.actionToolkit : {};
  const positiveGuidance = collectStrings({
    safeNextAction: value.safeNextAction,
    questionSafeNextStep: question.safeNextStep,
    toolkitWhatToDo: toolkit.whatToDo,
    toolkitExactAsk: toolkit.exactAsk,
    toolkitUnclearAnswerFollowUp: toolkit.unclearAnswerFollowUp,
    toolkitSuccessCriteria: toolkit.successCriteria,
  }).join(" ");
  if (canonical.safestNextAction.actionType !== "request_removal" && /\b(?:remove|removal|waive|waiver|refund|credit back)\b/i.test(positiveGuidance)) {
    return "removal or refund language is not permitted";
  }
  if (canonical.safestNextAction.actionType !== "request_repricing" && /\b(?:reprice|repricing|lower (?:the|your) rate|reduce (?:the|this) fee)\b/i.test(positiveGuidance)) {
    return "repricing language is not permitted";
  }
  return null;
}

function forbiddenFieldPath(value: unknown, path = "output"): string | null {
  if (!isRecord(value) && !Array.isArray(value)) return null;
  for (const [key, nested] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (key === "providerDetailsStripped" && nested === true) continue;
    if (/merchantName|merchantIdentifier|account|routing|sourceDocument|rawText|rawStatement|provider|modelName|prompt|benchmark|effectiveRate|processedSales|totalFees|savings|overpayment|opportunityAmount|contractTerm|removability|actionability|actionType|evidenceRefs|feeRowIds/i.test(key)) return next;
    const found = forbiddenFieldPath(nested, next);
    if (found) return found;
  }
  return null;
}

function rejected(model: CanonicalMerchantAttentionModel, errors: string[]): MerchantAttentionAiAdmissionResult {
  return {
    admitted: false,
    errors,
    model: {
      ...model,
      items: model.items.map((item) => ({ ...item, merchantLanguageSource: "deterministic_fallback" })),
      interpretation: {
        policyVersion: MERCHANT_ATTENTION_AI_INTERPRETATION_POLICY_VERSION,
        normalPathRequirement: "ai_interpretation_required",
        source: "deterministic_fallback",
        readiness: "degraded_fallback",
        authoritative: false,
        financialMutationAllowed: false,
        outputRef: null,
        admission: {
          schemaValidated: false,
          canonicalLinkageValidated: false,
          actionabilityCeilingValidated: false,
          privacyValidated: false,
          reasonCodes: ["merchant_attention_ai_interpretation_rejected"],
        },
        fallbackReasonCodes: ["merchant_attention_ai_interpretation_rejected"],
      },
    },
  };
}

function minimizeObservedLabel(value: string | null): string | null {
  if (!value) return null;
  const minimized = value
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\b\d[\d\s().-]{3,}\d\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return minimized || "[redacted]";
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, errors: string[]): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`AI merchant interpretation has unexpected field ${path}.${key}.`);
  for (const key of allowed) if (!(key in value)) errors.push(`AI merchant interpretation is missing field ${path}.${key}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2_000;
}

function stringArray(value: unknown, allowEmpty: boolean): value is string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= 20 && value.every(nonEmptyString);
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (isRecord(value)) return Object.values(value).flatMap(collectStrings);
  return [];
}
