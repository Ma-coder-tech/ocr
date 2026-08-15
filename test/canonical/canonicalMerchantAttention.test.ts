import { describe, expect, it } from "vitest";
import { buildCanonicalAiCapabilities, type CanonicalAiCapabilityHarnessInput } from "../../src/canonical/buildCanonicalAiCapabilities.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerState } from "../../src/canonical/customerStateResolver.js";
import { buildFeeKnowledgeIntelligenceRecord } from "../../src/canonical/feeKnowledgeIntelligence.js";
import { buildCanonicalFeeLedger } from "../../src/canonical/feeLedger.js";
import { buildCanonicalFeeOwnershipActionability } from "../../src/canonical/feeOwnershipActionability.js";
import {
  buildCanonicalMerchantAttentionModel,
  merchantAttentionResolutionFromFeeKnowledge,
  validateCanonicalMerchantAttentionModel,
} from "../../src/canonical/merchantAttention.js";
import {
  admitMerchantAttentionAiInterpretation,
  buildMerchantAttentionAiInterpretationPacket,
} from "../../src/canonical/merchantAttentionAiInterpretation.js";
import { buildCanonicalOpportunityEngine, type CanonicalOpportunityInput } from "../../src/canonical/opportunityEngine.js";
import { validateCanonicalStatementAnalysis } from "../../src/canonical/validate.js";
import {
  WHOLE_STATEMENT_FEE_INTELLIGENCE_ACCEPTANCE_POLICY_VERSION,
  WHOLE_STATEMENT_FEE_INTELLIGENCE_COVERAGE_POLICY_VERSION,
  WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
} from "../../src/canonical/wholeStatementFeeIntelligenceReview.js";
import type {
  CanonicalAiCapabilityOutput,
  CanonicalEvidenceRecord,
  CanonicalOpportunityTargetProvenance,
  CanonicalStatementAnalysis,
  MoneyAmount,
} from "../../src/canonical/types.js";
import type { ParsedDocument } from "../../src/parser.js";

type TestRow = { label: string; amount: number; section?: string; confidence?: "high" | "medium" | "low" };

describe("Package 2 canonical merchant attention", () => {
  it("builds one stable high-priority pricing item from a material processor-controlled fee", () => {
    const analysis = analysisWithRows([
      { label: "PROCESSOR MARKUP", amount: 100 },
      { label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" },
    ]);
    const item = analysis.merchantAttention.items.find((candidate) => candidate.originalObservedStatementLabel === "PROCESSOR MARKUP")!;

    expect(item).toMatchObject({
      id: `attention_fee_${item.feeRowIds[0]}`,
      attentionType: "potential_negotiation",
      priority: "high_priority",
      category: "processor_markup",
      likelyOwner: { economicBeneficiary: "processor", contractualController: "processor" },
      surfaceEligibility: { priorityFinding: true, feeInventory: true },
    });
    expect(item.observedAmount).toEqual(money(100));
    expect(item.evidenceBoundary.statementProof.observedAmount).toEqual(money(100));
  });

  it("turns OTHER and ADDITIONAL charges into itemization questions without treating amounts as savings", () => {
    for (const label of ["OTHER", "ADDITIONAL FEES"]) {
      const analysis = analysisWithRows([{ label, amount: 9.48 }]);
      const item = analysis.merchantAttention.items[0]!;
      expect(item).toMatchObject({
        attentionType: "explanation_or_itemization",
        safestNextAction: { actionType: "request_itemization" },
        questionToResolve: { amountUnderReview: money(9.48), amountIsSavings: false },
      });
      expect(JSON.stringify(item.opportunityLink)).not.toMatch(/amount|saving|overpay/i);
      expect(item.evidenceBoundary.reasonableConclusion.summary).toMatch(/not sufficiently itemized/i);
    }
  });

  it("keeps a statement or paper fee at a service-use review ceiling and never promises removal", () => {
    const item = analysisWithRows([{ label: "PAPER STATEMENT FEE", amount: 5 }]).merchantAttention.items[0]!;
    expect(item).toMatchObject({
      attentionType: "service_use_review",
      merchantTitle: "Statement delivery fee",
      safestNextAction: { actionType: "check_service_use" },
      evidenceStatus: "needs_processor_explanation",
    });
    expect(item.actionToolkit?.whatToDo).not.toMatch(/remove|guarantee/i);
    expect(item.actionToolkit?.avoidClaiming.join(" ")).toMatch(/guaranteed removal/i);
  });

  it("distinguishes generic PCI administration from explicit PCI non-compliance", () => {
    const generic = analysisWithRows([{ label: "PCI DSS COMPLIANCE ADMIN FEE", amount: 12 }]).merchantAttention.items[0]!;
    const explicit = analysisWithRows([{ label: "PCI NON COMPLIANCE", amount: 12 }]).merchantAttention.items[0]!;

    expect(generic.attentionType).toBe("service_use_review");
    expect(generic.evidenceBoundary.reasonableConclusion.summary).toMatch(/does not by itself prove merchant non-compliance/i);
    expect(explicit.attentionType).toBe("compliance_or_remediation");
    expect(explicit.safestNextAction.actionType).toBe("verify_charge");
    expect(explicit.actionToolkit?.exactAsk).toMatch(/what compliance condition triggered/i);
  });

  it.each([
    "MONTHLY CPU GTWY",
    "AVS FEE",
    "BATCH HEADER FEE",
    "AUTHORIZATION FEE",
  ])("projects %s as configuration or payment-practice review", (label) => {
    const item = analysisWithRows([{ label, amount: 18 }]).merchantAttention.items[0]!;
    expect(item.attentionType).toBe("configuration_or_payment_practice_review");
    expect(item.safestNextAction.actionType).toBe("review_configuration");
    expect(item.actionToolkit?.exactAsk).toMatch(/configuration|transaction handling/i);
  });

  it.each(["NON QUALIFIED FEE", "DOWNGRADE SURCHARGE", "EIRF"]) (
    "projects %s as an investigation without asserting an exact cause",
    (label) => {
      const item = analysisWithRows([{ label, amount: 45 }]).merchantAttention.items[0]!;
      expect(item.attentionType).toBe("configuration_or_payment_practice_review");
      expect(item.evidenceBoundary.reasonableConclusion.summary).toMatch(/does not establish an exact cause/i);
      expect(item.evidenceBoundary.remainingUncertainty.join(" ")).toMatch(/does not establish the exact qualification cause/i);
    },
  );

  it("keeps routine interchange and network charges informational and below actionable items", () => {
    const analysis = analysisWithRows([
      { label: "VISA INTERCHANGE", amount: 80, section: "Interchange Charges" },
      { label: "PROCESSOR MARKUP", amount: 30 },
    ]);
    const network = analysis.merchantAttention.items.find((item) => item.originalObservedStatementLabel === "VISA INTERCHANGE")!;
    expect(network).toMatchObject({
      attentionType: "informational",
      priority: "routine",
      safestNextAction: { actionType: "no_action" },
      questionToResolve: null,
      actionToolkit: null,
      inventoryDisposition: "routine_context",
    });
    expect(analysis.merchantAttention.items.at(-1)?.id).toBe(network.id);
  });

  it("preserves unresolved ownership as unresolved evidence instead of positive authority", () => {
    const item = analysisWithRows([{ label: "MYSTERY CHARGE", amount: 25 }]).merchantAttention.items[0]!;
    expect(item).toMatchObject({
      category: "unknown_needs_review",
      actionabilityCeiling: "unknown",
      conflict: { status: "unresolved" },
      evidenceStatus: "unresolved",
      inventoryDisposition: "unresolved_review",
    });
    expect(item.questionToResolve).not.toBeNull();
  });

  it("bridges admitted public-documentation semantics only into the conclusion layer", () => {
    const analysis = analysisWithRows([{ label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" }]);
    refresh(analysis, [
      { capability: "whole_statement_fee_intelligence_review", status: "completed", output: wholeStatementOutput(analysis, "approved_external_documentation") },
    ]);
    const item = analysis.merchantAttention.items[0]!;

    expect(item.evidenceStatus).toBe("public_documentation_supported");
    expect(item.evidenceBoundary.reasonableConclusion.basis).toBe("admitted_intelligence");
    expect(item.evidenceBoundary.statementProof.kind).toBe("observed_charge");
    expect(item.sourceIntelligenceRefs).toContain("ai_output_whole_statement_fee_intelligence_review");
    expect(item.sourceIntelligenceRefs.join(" ")).not.toMatch(/provider|model/i);
  });

  it("gives rejected row intelligence zero authority over merchant meaning", () => {
    const analysis = analysisWithRows([{ label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" }]);
    const deterministic = structuredClone(analysis.merchantAttention.items[0]!);
    const output: any = wholeStatementOutput(analysis, "statement_evidence");
    output.rowInterpretations[0].conflicts = ["Adversarial claim: pricing agreement conflicts with this fee."];
    output.rowInterpretations[0].missingEvidence = ["Adversarial claim: additional history and public documentation are required."];
    output.rowInterpretations[0].recommendedDisposition = "conflicting_evidence";
    output.acceptanceRecords[0] = {
      ...output.acceptanceRecords[0],
      status: "rejected",
      acceptedSemanticFields: {
        category: null,
        likelyEconomicOwner: null,
        likelyContractualController: null,
        actionabilityCeiling: null,
        evidenceProvenance: null,
      },
      conflicts: ["Adversarial claim: ask the processor for a contract explanation."],
      reasonCodes: ["whole_statement_fee_intelligence_rejected"],
    };

    refresh(analysis, [{ capability: "whole_statement_fee_intelligence_review", status: "completed", output }]);
    const after = analysis.merchantAttention.items[0]!;

    expect(after).toEqual(deterministic);
    expect(after.resolution.requirement).toBe("no_additional_evidence_required");
    expect(after.questionToResolve).toBeNull();
    expect(after.safestNextAction.actionType).toBe("no_action");
    expect(after.sourceIntelligenceRefs).toEqual([]);
  });

  it("maps accepted resolution requirements into merchant-safe questions", () => {
    const requirements = [
      ["public_evidence_required", "public_documentation_required"],
      ["merchant_pricing_document_required", "merchant_pricing_agreement_required"],
      ["additional_statement_history_required", "additional_statement_history_required"],
      ["deterministic_math_required", "deterministic_math_required"],
      ["public_evidence_unavailable", "processor_explanation_required"],
      ["unresolved_review_required", "unresolved_review_required"],
    ] as const;
    for (const [source, expected] of requirements) expect(merchantAttentionResolutionFromFeeKnowledge(source)).toBe(expected);

    const analysis = analysisWithRows([{ label: "MYSTERY CHARGE", amount: 22 }]);
    const row = analysis.feeLedger.rows[0]!;
    const intelligence = buildFeeKnowledgeIntelligenceRecord({
      feeRowRef: row.id,
      origin: "statement_grounded",
      state: "unresolved_review_needed",
      subject: "investigation_question",
      summary: "The charge needs another statement period.",
      reasonCodes: ["additional_history_needed"],
      confidence: "low",
      actionabilityCeiling: "verify_only",
      merchantActionability: "merchant_display_provisional",
      proofRequirement: "human_review_required",
      statementEvidenceRefs: row.contributionDecision.evidenceRefs,
      resolutionRequirement: "additional_statement_history_required",
    });
    analysis.merchantAttention = buildCanonicalMerchantAttentionModel(analysis, { feeKnowledgeIntelligence: [intelligence] });
    expect(analysis.merchantAttention.items[0]).toMatchObject({
      evidenceStatus: "unresolved",
      resolution: { requirement: "unresolved_review_required" },
    });
  });

  it.each([
    ["public_evidence_required", "public_documentation_required", "statement_confirmed"],
    ["public_evidence_unavailable", "processor_explanation_required", "needs_processor_explanation"],
    ["additional_statement_history_required", "additional_statement_history_required", "needs_additional_statement_history"],
  ] as const)("projects %s into a merchant-safe resolution and evidence status", (sourceRequirement, expectedRequirement, expectedStatus) => {
    const analysis = analysisWithRows([{ label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" }]);
    const row = analysis.feeLedger.rows[0]!;
    const intelligence = buildFeeKnowledgeIntelligenceRecord({
      feeRowRef: row.id,
      origin: "statement_grounded",
      state: "investigation_lead",
      subject: "investigation_question",
      summary: "Additional support is required for a stronger merchant conclusion.",
      reasonCodes: [sourceRequirement],
      confidence: "low",
      actionabilityCeiling: "verify_only",
      merchantActionability: "merchant_display_provisional",
      proofRequirement: "human_review_required",
      statementEvidenceRefs: row.contributionDecision.evidenceRefs,
      resolutionRequirement: sourceRequirement,
    });
    analysis.merchantAttention = buildCanonicalMerchantAttentionModel(analysis, { feeKnowledgeIntelligence: [intelligence] });
    expect(analysis.merchantAttention.items[0]).toMatchObject({
      evidenceStatus: expectedStatus,
      resolution: { requirement: expectedRequirement },
      questionToResolve: { requirement: expectedRequirement, amountIsSavings: false },
    });
  });

  it("requires the merchant pricing agreement for a processor-pricing conclusion", () => {
    const item = analysisWithRows([{ label: "PROCESSOR MARKUP", amount: 50 }]).merchantAttention.items[0]!;
    expect(item).toMatchObject({
      resolution: { requirement: "merchant_pricing_agreement_required" },
      evidenceStatus: "needs_merchant_pricing_agreement",
      questionToResolve: { requiredEvidenceOrConfirmation: expect.arrayContaining([expect.stringMatching(/pricing agreement/i)]) },
    });
  });

  it("returns an explicit empty model when no positive unique charge supports an attention item", () => {
    const analysis = analysisWithRows([{ label: "ZERO DOLLAR REFERENCE", amount: 0 }]);
    expect(analysis.merchantAttention).toMatchObject({
      status: "empty",
      items: [],
      summary: { itemCount: 0, questionCount: 0, actionToolkitCount: 0 },
    });
  });

  it("preserves deterministic attention when AI is unavailable, failed, or rejected", () => {
    const analysis = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    const deterministic = structuredClone(analysis.merchantAttention);
    refresh(analysis, [{ capability: "whole_statement_fee_intelligence_review", status: "failed", output: null }]);
    expect(analysis.merchantAttention).toEqual(deterministic);
  });

  it("marks AI interpretation as the required normal language path and deterministic wording as degraded fallback", () => {
    const interpretation = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]).merchantAttention.interpretation;
    expect(interpretation).toMatchObject({
      normalPathRequirement: "ai_interpretation_required",
      source: "deterministic_fallback",
      readiness: "degraded_fallback",
      authoritative: false,
      financialMutationAllowed: false,
    });
  });

  it("builds a bounded privacy-safe AI packet from accepted canonical information", () => {
    const analysis = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    analysis.identity.merchantName.value = "Private Merchant Name";
    analysis.identity.merchantIdentifier.value = "account-secret";
    const packet = buildMerchantAttentionAiInterpretationPacket(analysis.merchantAttention);
    const serialized = JSON.stringify(packet);

    expect(packet).toMatchObject({
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
      semanticFidelity: {
        fieldScopedSupportRequired: true,
        lexicalEntailmentRequired: true,
        logicalQualificationPreservationRequired: true,
        newSemanticClaimsAllowed: false,
      },
      runtimeBoundary: {
        providerTransportStatus: "not_implemented_in_package_2",
        productionReadyWithoutAdmittedProviderOutput: false,
        deterministicFallbackIsDegradedPath: true,
      },
    });
    expect(packet.items[0]).toMatchObject({
      observedFact: { statementLabel: "ADDITIONAL FEES", amount: money(9.48) },
      permissionBoundary: { permittedActionType: "request_itemization" },
      requiredShape: { questionRequired: true, actionToolkitRequired: true },
    });
    expect(serialized).not.toContain("Private Merchant Name");
    expect(serialized).not.toContain("account-secret");
    expect(serialized).not.toMatch(/sourceDocumentRef|textPreview|providerName|modelName|prompt/i);
  });

  it("redacts identifier-shaped substrings from observed labels before AI use", () => {
    const analysis = analysisWithRows([{ label: "SERVICE ACCOUNT 1234-5678-9012", amount: 8 }]);
    const packet = buildMerchantAttentionAiInterpretationPacket(analysis.merchantAttention);
    expect(packet.items[0]!.observedFact.statementLabel).toBe("SERVICE ACCOUNT [redacted]");
    expect(JSON.stringify(packet)).not.toContain("1234-5678-9012");
  });

  it("admits schema-valid AI merchant language while preserving every authoritative field", () => {
    const analysis = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    const authoritativeBefore = authoritativeAttentionProjection(analysis.merchantAttention);
    const output = validMerchantInterpretation(analysis.merchantAttention);
    const result = admitMerchantAttentionAiInterpretation({ model: analysis.merchantAttention, output });

    expect(result.admitted).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.model.interpretation).toMatchObject({
      source: "admitted_ai_interpretation",
      readiness: "ready",
      outputRef: "attention_language_output",
      admission: {
        schemaValidated: true,
        canonicalLinkageValidated: true,
        actionabilityCeilingValidated: true,
        privacyValidated: true,
      },
    });
    expect(result.model.items[0]).toMatchObject({
      merchantTitle: "Unclear fee needs itemization",
      merchantLanguageSource: "admitted_ai_interpretation",
      originalObservedStatementLabel: "ADDITIONAL FEES",
      observedAmount: money(9.48),
      safestNextAction: { actionType: "request_itemization" },
    });
    expect(authoritativeAttentionProjection(result.model)).toEqual(authoritativeBefore);
    analysis.merchantAttention = result.model;
    expect(validateCanonicalMerchantAttentionModel(analysis)).toEqual([]);
  });

  it.each([
    ["invented fee owner", "This charge belongs to the processor."],
    ["invented service or fee purpose", "This charge pays for account maintenance."],
    ["invented cause", "Card-not-present transactions caused this charge."],
    ["invented network attribution", "Visa assessed this charge."],
    ["invented certainty outside the legacy prohibited phrases", "This charge is unquestionably valid."],
  ])("rejects %s through field-scoped semantic support", (_label, inventedConclusion) => {
    const model = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]).merchantAttention;
    const output: any = validMerchantInterpretation(model);
    output.items[0].reasonableConclusion = inventedConclusion;
    const result = admitMerchantAttentionAiInterpretation({ model, output });

    expect(result.admitted).toBe(false);
    expect(result.errors.join(" ")).toMatch(/semantic fidelity/i);
    expect(result.model.items).toEqual(model.items);
  });

  it("admits a plain-English paraphrase only when every semantic field remains linked and entailed", () => {
    const model = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]).merchantAttention;
    const output: any = validMerchantInterpretation(model);
    expect(output.items[0].merchantTitle).toBe("Unclear fee needs itemization");
    expect(output.items[0].safeNextAction).toMatch(/^Request\b/);

    const result = admitMerchantAttentionAiInterpretation({ model, output });
    expect(result.admitted).toBe(true);
    expect(result.model.items[0]!.merchantLanguageSource).toBe("admitted_ai_interpretation");
  });

  it.each([
    [
      "negation scope",
      "The observed amount is not automatically an overcharge.",
      "The observed amount is not an overcharge.",
    ],
    [
      "evidentiary negation",
      "The statement does not establish that this charge is negotiable.",
      "This charge is not negotiable.",
    ],
    [
      "possibility modality",
      "This charge may relate to the listed service.",
      "This charge relates to the listed service.",
    ],
    [
      "evidentiary strength",
      "The statement supports review of the issue.",
      "The statement proves the issue.",
    ],
    [
      "exception condition",
      "Review is appropriate unless the processor documents the charge.",
      "Review is appropriate; the processor documents the charge.",
    ],
    [
      "temporal precondition",
      "Review is appropriate before the processor confirms the charge.",
      "Review is appropriate; the processor confirms the charge.",
    ],
    [
      "temporal limit",
      "Review remains appropriate until the processor confirms the charge.",
      "Review remains appropriate; the processor confirms the charge.",
    ],
    [
      "could modality",
      "This charge could relate to the listed service.",
      "This charge relates to the listed service.",
    ],
    [
      "appearance qualification",
      "This charge appears related to the listed service.",
      "This charge is related to the listed service.",
    ],
  ])("rejects a paraphrase that alters %s", (_label, canonicalMeaning, strengthenedMeaning) => {
    const model = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]).merchantAttention;
    model.items[0]!.evidenceBoundary.reasonableConclusion.summary = canonicalMeaning;
    const output: any = validMerchantInterpretation(model);
    output.items[0].reasonableConclusion = strengthenedMeaning;

    const result = admitMerchantAttentionAiInterpretation({ model, output });

    expect(result.admitted).toBe(false);
    expect(result.errors.join(" ")).toMatch(/alters canonical qualification/i);
    expect(result.model.items).toEqual(model.items);
  });

  it("admits an equivalent paraphrase that preserves logical modality", () => {
    const model = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]).merchantAttention;
    model.items[0]!.evidenceBoundary.reasonableConclusion.summary = "This charge may relate to the listed service.";
    const output: any = validMerchantInterpretation(model);
    output.items[0].reasonableConclusion = "This fee could relate to the listed service.";

    const result = admitMerchantAttentionAiInterpretation({ model, output });

    expect(result.admitted).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("requires exact AI coverage only for the deterministic merchant-language-eligible population", () => {
    const model = analysisWithRows([
      { label: "PROCESSOR MARKUP", amount: 75 },
      { label: "ADDITIONAL FEES", amount: 9.48 },
      { label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" },
      { label: "MASTERCARD INTERCHANGE", amount: 18, section: "Interchange Charges" },
    ]).merchantAttention;
    const routine = model.items.filter((item) => item.inventoryDisposition === "routine_context");
    const eligible = model.items.filter((item) => item.merchantLanguageEligibility.eligibleForAiInterpretation);
    const packet = buildMerchantAttentionAiInterpretationPacket(model);

    expect(eligible.length).toBeGreaterThanOrEqual(2);
    expect(routine.length).toBe(2);
    expect(routine.every((item) => !item.merchantLanguageEligibility.eligibleForAiInterpretation)).toBe(true);
    expect(packet.items.map((item) => item.attentionItemId)).toEqual(eligible.map((item) => item.id));
    expect(packet.items.some((item) => routine.some((candidate) => candidate.id === item.attentionItemId))).toBe(false);

    const output: any = validMerchantInterpretation(model);
    const missingRequired: any = structuredClone(output);
    missingRequired.items.shift();
    expect(admitMerchantAttentionAiInterpretation({ model, output: missingRequired }).admitted).toBe(false);

    const beforeIdentity = model.items.map((item) => ({ id: item.id, feeRowIds: item.feeRowIds }));
    const admitted = admitMerchantAttentionAiInterpretation({ model, output });
    expect(admitted.admitted).toBe(true);
    expect(admitted.model.interpretation.coverage).toMatchObject({
      eligibleItemCount: eligible.length,
      admittedItemCount: eligible.length,
      deterministicRoutineItemCount: routine.length,
      exactEligibleCoverage: true,
    });
    expect(admitted.model.items.map((item) => ({ id: item.id, feeRowIds: item.feeRowIds }))).toEqual(beforeIdentity);
    expect(admitted.model.items.filter((item) => routine.some((candidate) => candidate.id === item.id))
      .every((item) => item.merchantLanguageSource === "deterministic_fallback")).toBe(true);
  });

  it("does not let a later output overwrite an already admitted interpretation", () => {
    const model = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]).merchantAttention;
    const first = admitMerchantAttentionAiInterpretation({ model, output: validMerchantInterpretation(model) });
    const secondOutput: any = validMerchantInterpretation(model);
    secondOutput.outputId = "attention_language_replacement";
    secondOutput.items[0].merchantTitle = "Replacement wording";
    const second = admitMerchantAttentionAiInterpretation({ model: first.model, output: secondOutput });
    expect(second.admitted).toBe(false);
    expect(second.model).toEqual(first.model);
    expect(second.model.items[0]!.merchantTitle).toBe("Unclear fee needs itemization");
  });

  it.each([
    ["numeric claim", (output: any) => { output.items[0].whyThisDeservesAttention = "This could save $500."; }],
    ["stronger action", (output: any) => { output.items[0].actionType = "request_removal"; }],
    ["stronger action in prose", (output: any) => { output.items[0].safeNextAction = "Ask the processor to remove and refund the charge."; }],
    ["invented contract term", (output: any) => { output.items[0].reasonableConclusion = "The contract requires the processor to waive this charge."; }],
    ["unsupported overcharge", (output: any) => { output.items[0].reasonableConclusion = "This is an overcharge."; }],
    ["erased uncertainty", (output: any) => { output.items[0].remainingUncertainty = ["Nothing remains uncertain."]; }],
    ["missing uncertainty", (output: any) => { output.items[0].remainingUncertainty = []; }],
    ["private provider metadata", (output: any) => { output.providerName = "private-model-provider"; }],
    ["unknown item linkage", (output: any) => { output.items[0].attentionItemId = "attention_unknown"; }],
    ["invented question", (output: any) => { output.items[0].question = null; }],
    ["missing toolkit", (output: any) => { output.items[0].actionToolkit = null; }],
  ])("rejects %s and retains degraded deterministic language", (_label, mutate) => {
    const analysis = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    const fallback = structuredClone(analysis.merchantAttention);
    const output: any = validMerchantInterpretation(analysis.merchantAttention);
    mutate(output);
    const result = admitMerchantAttentionAiInterpretation({ model: analysis.merchantAttention, output });

    expect(result.admitted).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.model.interpretation).toMatchObject({
      source: "deterministic_fallback",
      readiness: "degraded_fallback",
      outputRef: null,
    });
    expect(result.model.items).toEqual(fallback.items);
  });

  it("fails closed to deterministic fallback when AI is unavailable or times out", () => {
    const model = analysisWithRows([{ label: "PAPER STATEMENT FEE", amount: 5 }]).merchantAttention;
    for (const output of [null, undefined, { timedOut: true }]) {
      const result = admitMerchantAttentionAiInterpretation({ model, output });
      expect(result.admitted).toBe(false);
      expect(result.model.interpretation.readiness).toBe("degraded_fallback");
      expect(result.model.items).toEqual(model.items);
    }
  });

  it("keeps fee-level attention available when benchmark comparison is unavailable", () => {
    const analysis = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    expect(analysis.customerState.rateComparison.status).toBe("unavailable");
    expect(analysis.merchantAttention.items).toHaveLength(1);
    expect(analysis.merchantAttention.items[0]!.attentionType).toBe("explanation_or_itemization");
  });

  it("uses a qualified above-range result only as a statement-level pricing review with no savings", () => {
    const analysis = analysisWithRows([{ label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" }]);
    analysis.customerState.rateComparison = qualifiedAboveReference(analysis);
    analysis.merchantAttention = buildCanonicalMerchantAttentionModel(analysis);
    const item = analysis.merchantAttention.items.find((candidate) => candidate.scope === "statement_pricing")!;

    expect(item).toMatchObject({
      attentionType: "pricing_review",
      priority: "review",
      observedAmount: null,
      opportunityLink: null,
      actionabilityCeiling: "verify_only",
      questionToResolve: { amountUnderReview: null, amountIsSavings: false },
    });
    expect(JSON.stringify(item)).not.toMatch(/opportunityAmount|annualImpact|monthlyImpact|recoverableAmount/i);
  });

  it("links an existing supported opportunity by ID without copying or recomputing money", () => {
    const analysis = analysisWithRows([{ label: "PROCESSOR MARKUP", amount: 20 }]);
    addSupportedOpportunity(analysis);
    refresh(analysis);
    const item = analysis.merchantAttention.items[0]!;

    expect(item.opportunityLink).toEqual({
      componentRefs: [analysis.opportunityEngine.components[0]!.id],
      linkageOnly: true,
      moneyRecomputed: false,
    });
    expect(JSON.stringify(item.opportunityLink)).not.toContain("amountMinor");
    expect(item.safestNextAction.actionType).not.toMatch(/request_removal|request_repricing/);
  });

  it("does not mutate Packages B–E or the benchmark comparison", () => {
    const analysis = analysisWithRows([
      { label: "PROCESSOR MARKUP", amount: 75 },
      { label: "ADDITIONAL FEES", amount: 9.48 },
    ]);
    const protectedBefore = protectedProjection(analysis);
    const benchmarkBefore = structuredClone(analysis.customerState.rateComparison);
    const model = buildCanonicalMerchantAttentionModel(analysis);

    expect(model.items.length).toBeGreaterThan(0);
    expect(protectedProjection(analysis)).toEqual(protectedBefore);
    expect(analysis.customerState.rateComparison).toEqual(benchmarkBefore);
  });

  it("is deterministic under fee-row, classification, opportunity, and evidence input ordering", () => {
    const analysis = analysisWithRows([
      { label: "PROCESSOR MARKUP", amount: 75 },
      { label: "ADDITIONAL FEES", amount: 9.48 },
      { label: "VISA INTERCHANGE", amount: 20, section: "Interchange Charges" },
    ]);
    const expected = buildCanonicalMerchantAttentionModel(analysis);
    const reordered = structuredClone(analysis);
    reordered.feeLedger.rows.reverse();
    reordered.feeOwnershipActionability.rowClassifications.reverse();
    reordered.opportunityEngine.components.reverse();
    reordered.evidence.reverse();

    expect(buildCanonicalMerchantAttentionModel(reordered)).toEqual(expected);
  });

  it("rejects detached questions, broken evidence, reconstructed opportunity money, and unsupported stronger actions", () => {
    const analysis = analysisWithRows([{ label: "ADDITIONAL FEES", amount: 9.48 }]);
    expect(validateCanonicalMerchantAttentionModel(analysis)).toEqual([]);

    const detached = structuredClone(analysis);
    detached.merchantAttention.items[0]!.questionToResolve!.attentionItemId = "attention_wrong";
    expect(validateCanonicalMerchantAttentionModel(detached)).toContainEqual(expect.stringMatching(/question .* inconsistent/i));

    const brokenEvidence = structuredClone(analysis);
    brokenEvidence.merchantAttention.items[0]!.evidenceRefs.push("evidence_missing");
    expect(validateCanonicalMerchantAttentionModel(brokenEvidence)).toContainEqual(expect.stringMatching(/broken evidence/i));

    const moneyMutation = structuredClone(analysis) as any;
    moneyMutation.merchantAttention.items[0].calculatedOpportunityAmount = money(10);
    expect(validateCanonicalMerchantAttentionModel(moneyMutation)).toContainEqual(expect.stringMatching(/forbidden reconstructed financial field/i));

    const stronger = structuredClone(analysis);
    stronger.merchantAttention.items[0]!.safestNextAction.actionType = "request_removal";
    expect(validateCanonicalMerchantAttentionModel(stronger)).toContainEqual(expect.stringMatching(/stronger action without canonical support/i));
  });

  it("attaches and validates Package 2 on generalized canonical construction", () => {
    const analysis = analysisWithRows([
      { label: "PROCESSOR MARKUP", amount: 30 },
      { label: "PAPER STATEMENT FEE", amount: 5 },
    ]);
    expect(analysis.versionManifest.merchantAttentionPolicyVersion).toBe("canonical_merchant_attention_v1");
    expect(validateCanonicalStatementAnalysis(analysis).validation.status).toMatch(/^valid/);
    expect(JSON.stringify(analysis.merchantAttention)).not.toMatch(/Package [A-Z]|provider model|model inference/i);
  });
});

function analysisWithRows(rows: TestRow[]): CanonicalStatementAnalysis {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const doc = statement(total);
  const analysis = buildCanonicalStatementFactsFromParsedDocument(doc, {
    sourceFileName: null,
    sourceAnalysisId: "package_2_generalized_fixture",
    businessType: "restaurant_food_beverage",
    preferExtractedRows: true,
  });
  const evidence = new Map<string, CanonicalEvidenceRecord>();
  const calculations: CanonicalStatementAnalysis["calculations"] = [];
  analysis.feeLedger = buildCanonicalFeeLedger({
    doc,
    documentId: "doc_package_2_generalized",
    matched: { driverId: "synthetic_parser", driverName: "Synthetic parser" },
    evidence,
    calculations,
    parserOutput: {
      feeLedger: {
        rows: rows.map((row, index) => ({
          description: row.label,
          amount: row.amount,
          sourceSection: row.section ?? "Fees",
          evidenceLine: `${row.label} | -$${row.amount.toFixed(2)}`,
          pageNumber: 1,
          rowIndex: index,
          confidence: row.confidence ?? "high",
        })),
        controls: [{ label: "Total Fees", rowSum: total, printedTotal: total, delta: 0, evidenceLine: `Total Fees | -$${total.toFixed(2)}` }],
        printedTotal: total,
        delta: 0,
      },
    },
  });
  analysis.evidence = [...analysis.evidence, ...evidence.values()];
  analysis.calculations = [...analysis.calculations, ...calculations];
  analysis.feeOwnershipActionability = buildCanonicalFeeOwnershipActionability(analysis.feeLedger, {
    processorFamily: "fiserv",
    statementPeriodStart: "2026-08-01",
  });
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
  });
  refresh(analysis);
  return analysis;
}

function refresh(analysis: CanonicalStatementAnalysis, harnessInputs: readonly CanonicalAiCapabilityHarnessInput[] = []): void {
  analysis.aiCapabilities = buildCanonicalAiCapabilities({
    identity: analysis.identity,
    businessQualification: analysis.businessQualification,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    evidence: analysis.evidence,
    harnessInputs,
  });
  analysis.customerState = buildCanonicalCustomerState({
    identity: analysis.identity,
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    aiCapabilities: analysis.aiCapabilities,
    rateComparison: analysis.customerState.rateComparison,
  });
  analysis.merchantAttention = buildCanonicalMerchantAttentionModel(analysis);
}

function wholeStatementOutput(
  analysis: CanonicalStatementAnalysis,
  provenance: "statement_evidence" | "approved_external_documentation" = "statement_evidence",
): CanonicalAiCapabilityOutput {
  const rowRefs = analysis.feeLedger.rows.map((row) => row.id).sort();
  const occurrenceEvidence = new Map(analysis.feeLedger.sourceOccurrences.map((occurrence) => [occurrence.id, occurrence.evidenceRef]));
  const evidenceByRow = new Map(analysis.feeLedger.rows.map((row) => [
    row.id,
    [...new Set([
      ...row.sourceOccurrenceIds.map((id) => occurrenceEvidence.get(id)).filter((id): id is string => Boolean(id)),
      ...row.contributionDecision.evidenceRefs,
    ])].sort(),
  ]));
  return {
    type: "whole_statement_fee_intelligence_review",
    reviewPolicyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_REVIEW_POLICY_VERSION,
    authoritative: false,
    evidenceRefs: [...new Set([...evidenceByRow.values()].flat())].sort(),
    factRefs: [],
    limitationCodes: [],
    reviewStatus: "completed",
    coverageProof: {
      policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_COVERAGE_POLICY_VERSION,
      expectedFeeRowRefs: rowRefs,
      reviewedFeeRowRefs: rowRefs,
      missingFeeRowRefs: [],
      duplicatedFeeRowRefs: [],
      unknownFeeRowRefs: [],
      malformedFeeRowRefs: [],
      malformedFeeRowRefCount: 0,
      exactCoverage: true,
    },
    rowInterpretations: rowRefs.map((feeRowRef) => {
      const classification = analysis.feeOwnershipActionability.rowClassifications.find((row) => row.feeRowId === feeRowRef)!.selected;
      return {
        feeRowRef,
        proposedCategory: classification.category,
        likelyEconomicOwner: classification.ownership.economicBeneficiary,
        likelyContractualController: classification.ownership.contractualController,
        proposedActionabilityCeiling: classification.actionabilityCeiling,
        confidence: classification.confidence,
        conciseRationale: "Accepted statement and documented context support this limited semantic interpretation.",
        evidenceProvenance: provenance,
        evidenceRefs: evidenceByRow.get(feeRowRef) ?? [],
        externalSourceRef: provenance === "statement_evidence" ? null : "source_approved_public_documentation",
        externalClaimSupportRef: provenance === "statement_evidence" ? null : "claim_support_approved_public_documentation",
        conflicts: [],
        missingEvidence: [],
        recommendedDisposition: "supported" as const,
        authoritative: false as const,
      };
    }),
    acceptanceRecords: rowRefs.map((feeRowRef) => {
      const classification = analysis.feeOwnershipActionability.rowClassifications.find((row) => row.feeRowId === feeRowRef)!.selected;
      return {
        feeRowRef,
        policyVersion: WHOLE_STATEMENT_FEE_INTELLIGENCE_ACCEPTANCE_POLICY_VERSION,
        status: "accepted" as const,
        acceptedSemanticFields: {
          category: classification.category,
          likelyEconomicOwner: classification.ownership.economicBeneficiary,
          likelyContractualController: classification.ownership.contractualController,
          actionabilityCeiling: classification.actionabilityCeiling,
          evidenceProvenance: provenance,
        },
        evidenceRefs: evidenceByRow.get(feeRowRef) ?? [],
        externalSourceRef: provenance === "statement_evidence" ? null : "source_approved_public_documentation",
        externalClaimSupportRef: provenance === "statement_evidence" ? null : "claim_support_approved_public_documentation",
        reasonCodes: ["whole_statement_fee_intelligence_accepted"],
        conflicts: [],
        actionabilityCeiling: classification.actionabilityCeiling,
        immutableFeeRowRef: feeRowRef,
      };
    }),
    reasonCodes: ["whole_statement_fee_intelligence_reviewed"],
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function addSupportedOpportunity(analysis: CanonicalStatementAnalysis): void {
  const row = analysis.feeLedger.rows[0]!;
  const evidenceRefs = row.contributionDecision.evidenceRefs;
  const result = money(120);
  const input: CanonicalOpportunityInput = {
    id: "package_2_supported_link",
    kind: "fee_removal",
    eligibility: "deterministic",
    feeRowIds: [row.id],
    target: { type: "zero_removal", removalCondition: "Synthetic agreement supports a zero target.", proofEvidenceRefs: evidenceRefs, aiSourced: false },
    targetProvenance: provenance(analysis, evidenceRefs),
    cadence: { value: "monthly", proven: true, annualizationAllowed: true, frequencyPerYear: 12, proof: "merchant_pricing_document", evidenceRefs, reason: "Synthetic agreement documents monthly cadence.", aiSourced: false },
    calculation: { calculationRef: "calc_package_2_supported_link", formulaCode: "opportunity_monthly_delta_times_12", inputRefs: [row.id], result, annualized: true, evidenceRefs },
    confidence: "high",
    evidenceRefs,
  };
  analysis.calculations.push({
    id: input.calculation.calculationRef!,
    formulaCode: "opportunity_monthly_delta_times_12",
    formulaVersion: "canonical_opportunity_formula_v1",
    inputs: [
      { label: "Observed monthly amount", value: row.selectedAmount!, unit: "money", evidenceRefs },
      { label: "Target monthly amount", value: money(0), unit: "money", evidenceRefs },
    ],
    result,
    unit: "money",
    roundingPolicy: "money_minor_units_usd_v1",
  });
  analysis.opportunityEngine = buildCanonicalOpportunityEngine({
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    evidence: analysis.evidence,
    statementPeriodVerified: true,
    opportunityInputs: [input],
  });
}

function provenance(analysis: CanonicalStatementAnalysis, evidenceRefs: string[]): CanonicalOpportunityTargetProvenance {
  return {
    sourceType: "merchant_contract",
    referenceId: "package_2_synthetic_contract",
    version: "1.0.0",
    policyOwner: "rr_policy_owner",
    reviewer: "rr_reviewer",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    applicableProcessor: "fiserv",
    applicableBusinessType: "restaurant",
    applicableChannel: "unknown",
    applicableCardEnvironment: "unknown",
    methodology: "Synthetic deterministic opportunity support.",
    limitations: [],
    opportunityApproved: true,
    authoritativeForDeterministic: true,
    approvedForEstimate: false,
    evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : [analysis.evidence[0]!.id],
    aiSourced: false,
  };
}

function qualifiedAboveReference(analysis: CanonicalStatementAnalysis): CanonicalStatementAnalysis["customerState"]["rateComparison"] {
  const evidenceRefs = analysis.evidence.slice(0, 2).map((record) => record.id);
  return {
    status: "qualified",
    effectiveRate: "0.050000",
    position: "above_reference",
    benchmarkRef: {
      referenceId: "rr_test_reference",
      displayLabel: "RateReveal test reference range",
      referenceKind: "ratereveal_reference_range",
      version: "test-v1",
      effectiveFrom: "2026-08-01",
      effectiveTo: "2027-02-28",
      market: "US",
      applicableProcessor: "fiserv",
      segmentId: "restaurant_food_service",
      riskClass: "standard",
      channel: "card_present",
      annualVolumeTier: "100k_500k",
      range: { low: "0.018000", high: "0.029000" },
      confidence: "low",
      methodology: "Test-only contextual reference.",
      limitations: [],
      evidenceRefs,
      qualified: true,
      aiSourced: false,
      opportunityApproved: false,
    },
    calculationRef: "calc_test_rate_position",
    evidenceRefs,
    reasonCodes: ["qualified_reference_applied"],
  };
}

function protectedProjection(analysis: CanonicalStatementAnalysis) {
  return structuredClone({
    financialFacts: analysis.financialFacts,
    feeLedger: analysis.feeLedger,
    feeOwnershipActionability: analysis.feeOwnershipActionability,
    opportunityEngine: analysis.opportunityEngine,
    calculations: analysis.calculations,
  });
}

function authoritativeAttentionProjection(model: CanonicalStatementAnalysis["merchantAttention"]) {
  return model.items.map((item) => ({
    id: item.id,
    policyVersion: item.policyVersion,
    scope: item.scope,
    feeRowIds: item.feeRowIds,
    originalObservedStatementLabel: item.originalObservedStatementLabel,
    observedAmount: item.observedAmount,
    category: item.category,
    likelyOwner: item.likelyOwner,
    attentionType: item.attentionType,
    priority: item.priority,
    evidenceStatus: item.evidenceStatus,
    confidence: item.confidence,
    statementProof: item.evidenceBoundary.statementProof,
    conclusionBasis: item.evidenceBoundary.reasonableConclusion.basis,
    conflict: item.conflict,
    resolutionRequirement: item.resolution.requirement,
    resolutionDocumentation: item.resolution.documentationNeeded,
    safestActionType: item.safestNextAction.actionType,
    actionabilityCeiling: item.actionabilityCeiling,
    opportunityLink: item.opportunityLink,
    questionIdentity: item.questionToResolve && {
      questionId: item.questionToResolve.questionId,
      amountUnderReview: item.questionToResolve.amountUnderReview,
      requirement: item.questionToResolve.requirement,
      evidenceRefs: item.questionToResolve.evidenceRefs,
      amountIsSavings: item.questionToResolve.amountIsSavings,
    },
    toolkitAuthority: item.actionToolkit && {
      moduleId: item.actionToolkit.moduleId,
      actionType: item.actionToolkit.actionType,
      statementEvidenceRefs: item.actionToolkit.statementEvidenceRefs,
      requestDocumentation: item.actionToolkit.requestDocumentation,
    },
    surfaceEligibility: item.surfaceEligibility,
    inventoryDisposition: item.inventoryDisposition,
    reasonCodes: item.reasonCodes,
    evidenceRefs: item.evidenceRefs,
    sourceIntelligenceRefs: item.sourceIntelligenceRefs,
  }));
}

function validMerchantInterpretation(model: CanonicalStatementAnalysis["merchantAttention"]): unknown {
  const packet = buildMerchantAttentionAiInterpretationPacket(model);
  const supportRefs = new Map(packet.items.map((item) => [
    item.attentionItemId,
    item.semanticSupportUnits.map((unit) => unit.supportRef).sort(),
  ]));
  return {
    type: "merchant_attention_ai_interpretation",
    policyVersion: "merchant_attention_ai_interpretation_v1",
    outputId: "attention_language_output",
    items: model.items
      .filter((item) => item.merchantLanguageEligibility.eligibleForAiInterpretation)
      .map((item) => ({
      attentionItemId: item.id,
      merchantTitle: item.merchantTitle.replace(/\bcharge\b/i, "fee"),
      whyThisDeservesAttention: item.whyThisDeservesAttention,
      reasonableConclusion: item.evidenceBoundary.reasonableConclusion.summary,
      remainingUncertainty: [...item.evidenceBoundary.remainingUncertainty],
      safeNextAction: item.safestNextAction.instruction.replace(/^Ask\b/i, "Request"),
      resolutionMeaning: item.resolution.merchantMeaning,
      question: item.questionToResolve ? {
        question: item.questionToResolve.question.replace(/ labeled “[^”]+”/i, "").replace(/Which pricing terms and fee components/i, "Which pricing terms and charge components"),
        whatRateRevealKnows: item.scope === "fee_row"
          ? "The statement contains an observed charge."
          : item.questionToResolve.whatRateRevealKnows,
        whatRemainsUncertain: item.questionToResolve.whatRemainsUncertain,
        safeNextStep: item.questionToResolve.safeNextStep.replace(/^Ask\b/i, "Request"),
      } : null,
      actionToolkit: item.actionToolkit ? {
        whatToDo: item.actionToolkit.whatToDo.replace(/^Ask\b/i, "Request"),
        why: item.actionToolkit.why,
        exactAsk: item.actionToolkit.exactAsk,
        unclearAnswerFollowUp: item.actionToolkit.unclearAnswerFollowUp,
        avoidClaiming: [...item.actionToolkit.avoidClaiming],
        successCriteria: [...item.actionToolkit.successCriteria],
      } : null,
      semanticSupportRefs: supportRefs.get(item.id) ?? [],
    })),
    authoritative: false,
    financialMutationAllowed: false,
    providerDetailsStripped: true,
  };
}

function statement(totalFees: number): ParsedDocument {
  const lines = [
    "SYNTHETIC FISERV STATEMENT",
    "Processor: Fiserv",
    "Statement Period: 08/01/2026 - 08/31/2026",
    "Total Amount Submitted | $20,000.00",
    `Fees Charged | -$${totalFees.toFixed(2)}`,
  ];
  return {
    sourceType: "pdf",
    headers: [],
    rows: lines.map((content) => ({ content, page: "page-1" })),
    textPreview: lines.join("\n"),
    extraction: { mode: "structured", qualityScore: 1, warnings: [], pageCount: 1 },
  };
}

function money(dollars: number): MoneyAmount {
  return { amountMinor: Math.round(dollars * 100), currency: "USD" };
}
