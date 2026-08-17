import type {
  CanonicalMerchantAttentionAiInterpretationOutput,
  CanonicalMerchantAttentionItem,
  CanonicalMerchantAttentionModel,
} from "./types.js";

export const MERCHANT_ATTENTION_AI_INTERPRETATION_POLICY_VERSION = "merchant_attention_ai_interpretation_v1" as const;
export const MERCHANT_ATTENTION_AI_INPUT_POLICY_VERSION = "merchant_attention_ai_input_v1" as const;
export const MERCHANT_ATTENTION_SEMANTIC_FIDELITY_POLICY_VERSION = "merchant_attention_semantic_fidelity_v1" as const;
export const MERCHANT_ATTENTION_AI_PROVIDER_TRANSPORT_STATUS = "implemented_in_package_3" as const;

type MerchantLanguageField =
  | "merchantTitle"
  | "whyThisDeservesAttention"
  | "reasonableConclusion"
  | "remainingUncertainty"
  | "safeNextAction"
  | "resolutionMeaning"
  | "question.question"
  | "question.whatRateRevealKnows"
  | "question.whatRemainsUncertain"
  | "question.safeNextStep"
  | "actionToolkit.whatToDo"
  | "actionToolkit.why"
  | "actionToolkit.exactAsk"
  | "actionToolkit.unclearAnswerFollowUp"
  | "actionToolkit.avoidClaiming"
  | "actionToolkit.successCriteria";

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
  coverage: {
    policyVersion: "merchant_attention_language_eligibility_v1";
    exactEligibleCoverageRequired: true;
    routineInventoryRequiresAiLanguage: false;
  };
  semanticFidelity: {
    policyVersion: "merchant_attention_semantic_fidelity_v1";
    fieldScopedSupportRequired: true;
    lexicalEntailmentRequired: true;
    logicalQualificationPreservationRequired: true;
    newSemanticClaimsAllowed: false;
  };
  runtimeBoundary: {
    providerTransportStatus: "implemented_in_package_3";
    productionReadyWithoutAdmittedProviderOutput: false;
    deterministicFallbackIsDegradedPath: true;
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
    semanticSupportUnits: Array<{
      supportRef: string;
      field: MerchantLanguageField;
      canonicalMeaning: string;
    }>;
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
  "semanticSupportRefs",
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
    coverage: {
      policyVersion: "merchant_attention_language_eligibility_v1",
      exactEligibleCoverageRequired: true,
      routineInventoryRequiresAiLanguage: false,
    },
    semanticFidelity: {
      policyVersion: MERCHANT_ATTENTION_SEMANTIC_FIDELITY_POLICY_VERSION,
      fieldScopedSupportRequired: true,
      lexicalEntailmentRequired: true,
      logicalQualificationPreservationRequired: true,
      newSemanticClaimsAllowed: false,
    },
    runtimeBoundary: {
      providerTransportStatus: MERCHANT_ATTENTION_AI_PROVIDER_TRANSPORT_STATUS,
      productionReadyWithoutAdmittedProviderOutput: false,
      deterministicFallbackIsDegradedPath: true,
    },
    items: model.items
      .filter((item) => item.merchantLanguageEligibility.eligibleForAiInterpretation)
      .map((item) => ({
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
      semanticSupportUnits: semanticSupportUnits(item),
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
    const interpretation = interpretations.get(item.id);
    if (!item.merchantLanguageEligibility.eligibleForAiInterpretation) return item;
    if (!interpretation) throw new Error(`Missing admitted merchant-language interpretation for ${item.id}.`);
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
          reasonCodes: ["merchant_attention_ai_interpretation_admitted", "merchant_attention_semantic_fidelity_validated"],
        },
        coverage: {
          policyVersion: "merchant_attention_language_eligibility_v1",
          eligibleItemCount: output.items.length,
          admittedItemCount: output.items.length,
          deterministicRoutineItemCount: input.model.items.length - output.items.length,
          exactEligibleCoverage: true,
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
  const expected = new Map(model.items
    .filter((item) => item.merchantLanguageEligibility.eligibleForAiInterpretation)
    .map((item) => [item.id, item]));
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
    if (!stringArray(value.semanticSupportRefs, false)) errors.push(`AI merchant interpretation ${value.attentionItemId}.semanticSupportRefs is invalid.`);
    validateQuestion(value.question, canonical, errors);
    validateToolkit(value.actionToolkit, canonical, errors);
    const language = merchantLanguageOnly(value);
    const unsafe = unsafeLanguage(language);
    if (unsafe) errors.push(`AI merchant interpretation ${value.attentionItemId} contains unsafe merchant language: ${unsafe}.`);
    const permissionError = actionPermissionError(canonical, value);
    if (permissionError) errors.push(`AI merchant interpretation ${value.attentionItemId} exceeds its action permission: ${permissionError}.`);
    const claimError = unsupportedPositiveClaim(value);
    if (claimError) errors.push(`AI merchant interpretation ${value.attentionItemId} contains an unsupported positive claim: ${claimError}.`);
    const fidelityErrors = semanticFidelityErrors(canonical, value);
    errors.push(...fidelityErrors.map((error) => `AI merchant interpretation ${value.attentionItemId} fails semantic fidelity: ${error}.`));
  }
  const expectedIds = [...expected.keys()].sort();
  const actualIds = [...seen].sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) errors.push("AI merchant interpretation must cover each AI-language-eligible attention item exactly once.");
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

function semanticSupportUnits(item: CanonicalMerchantAttentionItem): MerchantAttentionAiInterpretationPacket["items"][number]["semanticSupportUnits"] {
  return merchantLanguageFieldValues(item)
    .filter((entry) => entry.canonicalMeaning.length > 0)
    .map((entry) => ({
      supportRef: semanticSupportRef(item.id, entry.field),
      field: entry.field,
      canonicalMeaning: minimizeMerchantLanguageSupport(entry.canonicalMeaning),
    }));
}

function semanticFidelityErrors(canonical: CanonicalMerchantAttentionItem, value: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const units = semanticSupportUnits(canonical);
  const expectedRefs = units.map((unit) => unit.supportRef).sort();
  const rawRefs = Array.isArray(value.semanticSupportRefs)
    ? value.semanticSupportRefs.filter((ref): ref is string => typeof ref === "string")
    : [];
  const actualRefs = [...new Set(rawRefs)].sort();
  if (rawRefs.length !== actualRefs.length) errors.push("semantic support refs must be unique");
  if (JSON.stringify(expectedRefs) !== JSON.stringify(actualRefs)) {
    errors.push("semantic support refs do not exactly link every generated field to its canonical meaning");
  }

  const generated = generatedLanguageFieldValues(value);
  const canonicalByField = new Map(merchantLanguageFieldValues(canonical).map((entry) => [entry.field, entry.canonicalMeaning]));
  const expectedArrayLengths = {
    remainingUncertainty: canonical.evidenceBoundary.remainingUncertainty.length,
    "actionToolkit.avoidClaiming": canonical.actionToolkit?.avoidClaiming.length ?? 0,
    "actionToolkit.successCriteria": canonical.actionToolkit?.successCriteria.length ?? 0,
  } as const;
  const generatedArrayLengths = {
    remainingUncertainty: Array.isArray(value.remainingUncertainty) ? value.remainingUncertainty.length : -1,
    "actionToolkit.avoidClaiming": isRecord(value.actionToolkit) && Array.isArray(value.actionToolkit.avoidClaiming) ? value.actionToolkit.avoidClaiming.length : 0,
    "actionToolkit.successCriteria": isRecord(value.actionToolkit) && Array.isArray(value.actionToolkit.successCriteria) ? value.actionToolkit.successCriteria.length : 0,
  } as const;
  for (const field of Object.keys(expectedArrayLengths) as Array<keyof typeof expectedArrayLengths>) {
    if (expectedArrayLengths[field] !== generatedArrayLengths[field]) {
      errors.push(`${field} must preserve the canonical semantic-claim count`);
    }
  }

  for (const entry of generated) {
    const support = canonicalByField.get(entry.field);
    if (!support) {
      errors.push(`${entry.field} has no canonical support unit`);
      continue;
    }
    const unsupported = unsupportedSemanticTokens(entry.generatedText, support);
    if (unsupported.length > 0) errors.push(`${entry.field} adds unsupported semantic tokens: ${unsupported.join(", ")}`);
  }
  const generatedByField = new Map<MerchantLanguageField, string[]>();
  for (const entry of generated) {
    const values = generatedByField.get(entry.field) ?? [];
    values.push(entry.generatedText);
    generatedByField.set(entry.field, values);
  }
  for (const [field, generatedValues] of generatedByField) {
    const support = canonicalByField.get(field);
    if (support && altersLogicalQualification(generatedValues.join(" "), support)) {
      errors.push(`${field} alters canonical qualification, modality, negation, conditionality, or evidentiary scope`);
    }
  }
  return [...new Set(errors)];
}

function merchantLanguageFieldValues(item: CanonicalMerchantAttentionItem): Array<{ field: MerchantLanguageField; canonicalMeaning: string }> {
  const result: Array<{ field: MerchantLanguageField; canonicalMeaning: string }> = [
    { field: "merchantTitle", canonicalMeaning: item.merchantTitle },
    { field: "whyThisDeservesAttention", canonicalMeaning: item.whyThisDeservesAttention },
    { field: "reasonableConclusion", canonicalMeaning: item.evidenceBoundary.reasonableConclusion.summary },
    { field: "remainingUncertainty", canonicalMeaning: item.evidenceBoundary.remainingUncertainty.join(" ") },
    { field: "safeNextAction", canonicalMeaning: item.safestNextAction.instruction },
    { field: "resolutionMeaning", canonicalMeaning: item.resolution.merchantMeaning },
  ];
  if (item.questionToResolve) {
    result.push(
      { field: "question.question", canonicalMeaning: item.questionToResolve.question },
      { field: "question.whatRateRevealKnows", canonicalMeaning: item.questionToResolve.whatRateRevealKnows },
      { field: "question.whatRemainsUncertain", canonicalMeaning: item.questionToResolve.whatRemainsUncertain },
      { field: "question.safeNextStep", canonicalMeaning: item.questionToResolve.safeNextStep },
    );
  }
  if (item.actionToolkit) {
    result.push(
      { field: "actionToolkit.whatToDo", canonicalMeaning: item.actionToolkit.whatToDo },
      { field: "actionToolkit.why", canonicalMeaning: item.actionToolkit.why },
      ...(item.actionToolkit.exactAsk ? [{ field: "actionToolkit.exactAsk" as const, canonicalMeaning: item.actionToolkit.exactAsk }] : []),
      ...(item.actionToolkit.unclearAnswerFollowUp ? [{ field: "actionToolkit.unclearAnswerFollowUp" as const, canonicalMeaning: item.actionToolkit.unclearAnswerFollowUp }] : []),
      { field: "actionToolkit.avoidClaiming", canonicalMeaning: item.actionToolkit.avoidClaiming.join(" ") },
      { field: "actionToolkit.successCriteria", canonicalMeaning: item.actionToolkit.successCriteria.join(" ") },
    );
  }
  return result;
}

function generatedLanguageFieldValues(value: Record<string, unknown>): Array<{ field: MerchantLanguageField; generatedText: string }> {
  const result: Array<{ field: MerchantLanguageField; generatedText: string }> = [];
  const add = (field: MerchantLanguageField, candidate: unknown) => {
    if (typeof candidate === "string" && candidate.trim()) result.push({ field, generatedText: candidate });
    else if (Array.isArray(candidate)) {
      for (const text of candidate) if (typeof text === "string" && text.trim()) result.push({ field, generatedText: text });
    }
  };
  add("merchantTitle", value.merchantTitle);
  add("whyThisDeservesAttention", value.whyThisDeservesAttention);
  add("reasonableConclusion", value.reasonableConclusion);
  add("remainingUncertainty", value.remainingUncertainty);
  add("safeNextAction", value.safeNextAction);
  add("resolutionMeaning", value.resolutionMeaning);
  if (isRecord(value.question)) {
    add("question.question", value.question.question);
    add("question.whatRateRevealKnows", value.question.whatRateRevealKnows);
    add("question.whatRemainsUncertain", value.question.whatRemainsUncertain);
    add("question.safeNextStep", value.question.safeNextStep);
  }
  if (isRecord(value.actionToolkit)) {
    add("actionToolkit.whatToDo", value.actionToolkit.whatToDo);
    add("actionToolkit.why", value.actionToolkit.why);
    add("actionToolkit.exactAsk", value.actionToolkit.exactAsk);
    add("actionToolkit.unclearAnswerFollowUp", value.actionToolkit.unclearAnswerFollowUp);
    add("actionToolkit.avoidClaiming", value.actionToolkit.avoidClaiming);
    add("actionToolkit.successCriteria", value.actionToolkit.successCriteria);
  }
  return result;
}

function semanticSupportRef(itemId: string, field: MerchantLanguageField): string {
  return `merchant_language_support:${itemId}:${field}`;
}

const SEMANTIC_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "in", "into", "is", "it", "of", "on", "or", "that", "the", "their", "this", "to", "was", "with", "you", "your",
]);

const SEMANTIC_SYNONYMS: Record<string, string> = {
  ask: "request",
  asking: "request",
  requested: "request",
  requests: "request",
  explain: "explanation",
  explained: "explanation",
  explaining: "explanation",
  clarify: "explanation",
  clarified: "explanation",
  clarification: "explanation",
  itemize: "itemization",
  itemized: "itemization",
  breakdown: "itemization",
  fee: "charge",
  fees: "charge",
  charges: "charge",
  line: "charge",
  lines: "charge",
  document: "documentation",
  documented: "documentation",
  documents: "documentation",
  writing: "written",
  identifies: "identify",
  identified: "identify",
  shows: "show",
  shown: "show",
  needs: "need",
  needed: "need",
  requires: "require",
  required: "require",
  demonstrate: "establish",
  demonstrated: "establish",
  demonstrates: "establish",
  demonstrating: "establish",
  relates: "relate",
  related: "relate",
  may: "possibility",
  might: "possibility",
  could: "possibility",
  possible: "possibility",
  possibly: "possibility",
  perhaps: "possibility",
  appear: "appearance",
  appeared: "appearance",
  appears: "appearance",
  apparently: "appearance",
  seem: "appearance",
  seemed: "appearance",
  seems: "appearance",
  seemingly: "appearance",
  prior: "before",
  till: "until",
};

function unsupportedSemanticTokens(generated: string, support: string): string[] {
  const supported = new Set(semanticTokens(support));
  return [...new Set(semanticTokens(generated).filter((token) => !supported.has(token)))].sort();
}

function semanticTokens(value: string): string[] {
  return (value.toLowerCase().match(/[a-z][a-z'-]*/g) ?? [])
    .map((token) => token.replace(/^['-]+|['-]+$/g, ""))
    .filter((token) => token.length > 1 && !SEMANTIC_STOP_WORDS.has(token))
    .map((token) => SEMANTIC_SYNONYMS[token] ?? token);
}

const LOGICAL_QUALIFICATION_TOKENS: Record<string, string> = {
  may: "modality:possibility",
  might: "modality:possibility",
  could: "modality:possibility",
  possible: "modality:possibility",
  possibly: "modality:possibility",
  perhaps: "modality:possibility",
  appear: "epistemic:appearance",
  appeared: "epistemic:appearance",
  appears: "epistemic:appearance",
  apparently: "epistemic:appearance",
  seem: "epistemic:appearance",
  seemed: "epistemic:appearance",
  seems: "epistemic:appearance",
  seemingly: "epistemic:appearance",
  likely: "epistemic:likelihood",
  probably: "epistemic:likelihood",
  uncertain: "epistemic:uncertainty",
  uncertainty: "epistemic:uncertainty",
  unclear: "epistemic:uncertainty",
  unknown: "epistemic:uncertainty",
  unless: "condition:exception",
  before: "temporal:before",
  prior: "temporal:before",
  until: "temporal:until",
  till: "temporal:until",
  if: "condition:if",
  when: "condition:when",
  while: "condition:while",
  after: "temporal:after",
  once: "condition:once",
  except: "condition:exception",
  provided: "condition:provided",
  providing: "condition:provided",
  must: "modality:requirement",
  should: "modality:recommendation",
  would: "modality:conditional",
  can: "modality:capability",
  will: "modality:prediction",
  automatically: "scope:automatic",
  necessarily: "scope:necessary",
  only: "scope:only",
  alone: "scope:alone",
  itself: "scope:alone",
  limited: "scope:limited",
  current: "scope:current",
  currently: "scope:current",
  available: "scope:available",
  observed: "scope:observed",
  specific: "scope:specific",
  separate: "scope:separate",
  individual: "scope:individual",
  exact: "scope:exact",
  fully: "scope:fully",
  sufficiently: "scope:sufficiently",
  enough: "scope:enough",
  support: "evidence:support",
  supported: "evidence:support",
  supporting: "evidence:support",
  supports: "evidence:support",
  suggest: "evidence:suggest",
  suggested: "evidence:suggest",
  suggesting: "evidence:suggest",
  suggests: "evidence:suggest",
  indicate: "evidence:indicate",
  indicated: "evidence:indicate",
  indicates: "evidence:indicate",
  indicating: "evidence:indicate",
  establish: "evidence:establish",
  established: "evidence:establish",
  establishes: "evidence:establish",
  establishing: "evidence:establish",
  demonstrate: "evidence:establish",
  demonstrated: "evidence:establish",
  demonstrates: "evidence:establish",
  demonstrating: "evidence:establish",
  prove: "evidence:prove",
  proved: "evidence:prove",
  proven: "evidence:prove",
  proves: "evidence:prove",
  proving: "evidence:prove",
  confirm: "evidence:confirm",
  confirmed: "evidence:confirm",
  confirming: "evidence:confirm",
  confirms: "evidence:confirm",
};

const LOGICAL_NEGATIONS = new Set(["not", "no", "never", "neither", "nor", "without"]);
const NEGATION_TARGET_FILLERS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "by", "do", "does", "did", "for", "from", "has", "have", "had", "in", "is", "it", "of", "on", "or", "that", "the", "their", "this", "to", "was", "were", "with", "you", "your",
]);

function altersLogicalQualification(generated: string, support: string): boolean {
  return JSON.stringify(logicalQualificationSignature(generated)) !== JSON.stringify(logicalQualificationSignature(support));
}

function logicalQualificationSignature(value: string): string[] {
  const tokens = logicalTokens(value);
  const signature: string[] = [];
  for (const [index, token] of tokens.entries()) {
    const qualification = LOGICAL_QUALIFICATION_TOKENS[token];
    if (qualification) signature.push(qualification);
    if (LOGICAL_NEGATIONS.has(token)) signature.push(`negation:${logicalNegationTarget(tokens, index + 1)}`);
    if (token === "without") signature.push("condition:without");
  }
  return signature.sort();
}

function logicalTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\bwon['’]t\b/g, "will not")
    .replace(/\bcan['’]t\b|\bcannot\b/g, "can not")
    .replace(/n['’]t\b/g, " not")
    .match(/[a-z]+/g) ?? [];
}

function logicalNegationTarget(tokens: string[], start: number): string {
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (NEGATION_TARGET_FILLERS.has(token) || LOGICAL_NEGATIONS.has(token)) continue;
    return LOGICAL_QUALIFICATION_TOKENS[token] ?? `semantic:${SEMANTIC_SYNONYMS[token] ?? token}`;
  }
  return "end_of_clause";
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
  const eligibleItemCount = model.items.filter((item) => item.merchantLanguageEligibility.eligibleForAiInterpretation).length;
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
        coverage: {
          policyVersion: "merchant_attention_language_eligibility_v1",
          eligibleItemCount,
          admittedItemCount: 0,
          deterministicRoutineItemCount: model.items.length - eligibleItemCount,
          exactEligibleCoverage: false,
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

function minimizeMerchantLanguageSupport(value: string): string {
  return value
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/[$€£¥]\s*\d[\d,.]*/g, "[amount]")
    .replace(/\b\d[\d\s().-]{3,}\d\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
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
