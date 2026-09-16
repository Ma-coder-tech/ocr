import type { MoneyAmount } from "../../types.js";
import type { CanonicalEconomicCostBucketKind } from "../economicTypes.js";
import type { ThemeLanguageCandidate } from "../intelligence/intelligenceTypes.js";
import type { CanonicalEconomicsV2PricingAnalysis, CanonicalPricingAxisConclusion } from "../pricingTypes.js";
import type {
  CanonicalEconomicTheme,
  CanonicalEconomicsV2SynthesisAnalysis,
  CanonicalMerchantLever,
  CanonicalSynthesisDependencyKind,
} from "../synthesisTypes.js";
import type { CanonicalEconomicsV2SourceSection, CanonicalEconomicsV2Fact } from "../types.js";
import { buildSourceReadinessEnvelope, type SourceReadinessEnvelope } from "../evaluation/sourceReadiness.js";
import { rhCopy } from "./reportCopy.js";
import { permission, RH_PERMISSION_CATEGORIES } from "./reportPermissions.js";
import { CANONICAL_REPORT_V2_VERSION_MANIFEST } from "./reportVersionManifest.js";
import type {
  CanonicalMerchantReportProjectionAuditV1,
  CanonicalMerchantReportProjectionV2,
  RhActionItem,
  RhAttentionItem,
  RhCompositionCategory,
  RhCompositionCategoryCode,
  RhCopyCode,
  RhCustomerCopy,
  RhEvidenceStrength,
  RhFeeCreditOffset,
  RhImpact,
  RhInventoryItem,
  RhOpenQuestionState,
  RhPermissionCategory,
  RhPricingAxisState,
  RhPriority,
  RhProjectionAuditEntry,
  RhQuestionItem,
  RhSnapshotMetric,
  RhStatementEvidence,
  RhVisibilityPermission,
} from "./reportTypes.js";
import { validateCanonicalMerchantReportProjectionV2 } from "./reportValidate.js";

export type RhKnowledgeConflictInput = {
  state: "conflicting";
  materiality: "material" | "nonblocking";
};

export type BuildCanonicalMerchantReportProjectionV2Input = {
  synthesisAnalysis: CanonicalEconomicsV2SynthesisAnalysis;
  customerSafeIdentity?: {
    merchantDisplayName?: string | null;
    processorDisplayName?: string | null;
    sameAccountIdentityProven: boolean;
    customerDisplaySafe: boolean;
  };
  knowledgeConflicts?: RhKnowledgeConflictInput[];
  rgLanguageCandidates?: ThemeLanguageCandidate[];
  sourceReadiness?: SourceReadinessEnvelope;
};

export type BuildCanonicalMerchantReportProjectionV2Result = {
  projection: CanonicalMerchantReportProjectionV2;
  audit: CanonicalMerchantReportProjectionAuditV1;
};

type Context = {
  input: BuildCanonicalMerchantReportProjectionV2Input;
  synthesis: CanonicalEconomicsV2SynthesisAnalysis;
  pricing: CanonicalEconomicsV2PricingAnalysis;
  sections: Map<string, CanonicalEconomicsV2SourceSection>;
  auditEntries: RhProjectionAuditEntry[];
  evidenceOrdinals: Map<string, number>;
  readiness: SourceReadinessEnvelope;
  questionTargetByTheme: Map<string, string>;
};

const zeroMoney = (): MoneyAmount => ({ currency: "USD", amountMinor: 0 });
const money = (amountMinor: number): MoneyAmount => ({ currency: "USD", amountMinor });

export function buildCanonicalMerchantReportProjectionV2(
  input: BuildCanonicalMerchantReportProjectionV2Input,
): BuildCanonicalMerchantReportProjectionV2Result {
  const synthesis = input.synthesisAnalysis;
  const pricing = synthesis.economicAnalysis.pricingAnalysis;
  const foundation = pricing.foundation;
  const economic = synthesis.economicAnalysis.economicLayer;
  const readiness = input.sourceReadiness ?? readinessFromSynthesis(synthesis);
  const duplicateContributors = duplicateValues(
    economic.charges
      .filter((charge) => charge.contributionStatus === "contributes_classified" || charge.contributionStatus === "contributes_unresolved")
      .map((charge) => charge.contributingOccurrenceRef)
      .filter((value): value is string => value !== null),
  );
  const hardReadinessBlock = ["unsupported_source", "parser_not_reportable", "incomplete_document", "incomplete_statement"].includes(readiness.outcome.state);
  const foundationalUnsafe = hardReadinessBlock ||
    synthesis.validation.status !== "valid"
    || synthesis.economicAnalysis.validation.status !== "valid"
    || pricing.validation.status !== "valid"
    || foundation.validation.status !== "valid"
    || foundation.financialPopulations.canonicalNetSubmittedCardVolume.status !== "available"
    || foundation.financialPopulations.totalStatementProcessingFees.status !== "available"
    || duplicateContributors.length > 0;

  const context: Context = {
    input,
    synthesis,
    pricing,
    sections: new Map(foundation.sourceModel.sections.map((section) => [section.id, section])),
    auditEntries: [],
    evidenceOrdinals: new Map(),
    readiness,
    questionTargetByTheme: new Map(),
  };

  const questions = foundationalUnsafe ? [] : buildQuestions(context);
  const attention = foundationalUnsafe ? [] : buildAttention(context);
  const actions = foundationalUnsafe ? [] : buildActions(context, attention);
  const comparisonPosition = "comparison_unavailable" as const;
  const synthesisCoverageSufficient = synthesis.synthesisLayer.themes.length > 0;
  const openQuestionState: RhOpenQuestionState = questions.some((item) => item.amountUnderReview !== null)
    || (input.knowledgeConflicts ?? []).some((item) => item.materiality === "material")
    || synthesis.synthesisLayer.themes.some((theme) => theme.materiality === "unresolved")
    ? "material"
    : questions.length > 0 || !readiness.outcome.analysisCompletionPermitted || !synthesisCoverageSufficient ? "nonblocking" : "none";
  const experience = foundationalUnsafe
    ? "unable_to_complete" as const
    : openQuestionState !== "none" ? "analysis_with_open_questions" as const : "analysis_completed" as const;

  const supportedImpact = attention.some((item) => item.impact?.kind === "potential_reduction" || item.impact?.kind === "potential_reduction_range");
  const materialAttention = attention.some((item) => item.priority !== "routine");
  const economicFinding = foundationalUnsafe
    ? "unavailable" as const
    : supportedImpact
      ? "supported_impact_present" as const
      : openQuestionState === "material"
        ? "unresolved_material_items" as const
        : attention.length > 0
          ? "attention_items_present" as const
          : hasProvenNoMaterialAttention(synthesis)
            ? "no_material_attention_proven" as const
            : "unresolved_material_items" as const;
  const priority: RhPriority = foundationalUnsafe ? "review" : maxPriority(attention.map((item) => item.priority), openQuestionState);
  const evidenceStrength = foundationalUnsafe ? "unresolved" as const : determineEvidenceStrength(synthesis, questions.length);
  const permissions = buildPermissions({
    foundationalUnsafe,
    pricing,
    synthesis,
    hasAttention: attention.length > 0,
    hasImpact: supportedImpact,
    hasAnnualImpact: attention.some((item) => item.impact?.annual === true),
    hasVerificationAmount: attention.some((item) => item.impact?.kind === "amount_under_review")
      || questions.some((item) => item.amountUnderReview !== null),
    hasActions: actions.length > 0,
    comparisonAvailable: false,
    continuationAvailable: !foundationalUnsafe,
  });

  const identity = safeIdentity(input);
  const snapshot = foundationalUnsafe ? null : buildSnapshot(context);
  const composition = foundationalUnsafe ? null : buildComposition(context);
  const inventory = foundationalUnsafe ? null : buildInventory(context);
  const pricingProjection = foundationalUnsafe ? null : buildPricing(pricing);
  const verdictCopy = experience === "unable_to_complete"
    ? ["unable_title", "unable_body"] as const
    : experience === "analysis_with_open_questions"
      ? ["open_title", "open_body"] as const
      : ["completed_title", "completed_body"] as const;

  const projection: CanonicalMerchantReportProjectionV2 = {
    schemaVersion: CANONICAL_REPORT_V2_VERSION_MANIFEST.schemaVersion,
    authority: CANONICAL_REPORT_V2_VERSION_MANIFEST.authority,
    persistence: CANONICAL_REPORT_V2_VERSION_MANIFEST.persistence,
    sourceOfTruth: CANONICAL_REPORT_V2_VERSION_MANIFEST.sourceOfTruth,
    customerLanguage: CANONICAL_REPORT_V2_VERSION_MANIFEST.customerLanguage,
    experience,
    header: {
      title: rhCopy("report_title"),
      merchantDisplayName: identity.merchantDisplayName,
      processorDisplayName: identity.processorDisplayName,
      statementPeriod: foundation.identity.statementPeriod,
    },
    verdict: {
      title: rhCopy(verdictCopy[0]),
      body: rhCopy(verdictCopy[1]),
      axes: {
        analysisReadiness: foundationalUnsafe ? "unavailable" : openQuestionState === "none" ? "completed" : "available_with_questions",
        comparisonPosition,
        economicFinding,
        priority,
        evidenceStrength,
        openQuestionState,
      },
      axisDisplay: buildAxisDisplay({
        analysisReadiness: foundationalUnsafe ? "unavailable" : openQuestionState === "none" ? "completed" : "available_with_questions",
        comparisonPosition,
        economicFinding,
        priority,
        evidenceStrength,
        openQuestionState,
      }),
    },
    permissions,
    recovery: foundationalUnsafe
      ? { body: rhCopy("unable_body"), action: rhCopy("recovery_cta"), targetId: "report-v2-recovery" }
      : null,
    snapshot,
    pricing: pricingProjection,
    composition,
    attention: attention.length > 0 ? { title: rhCopy("attention_title"), items: attention } : null,
    questions: questions.length > 0 ? { title: rhCopy("questions_title"), items: questions } : null,
    inventory,
    actions: actions.length > 0 ? { title: rhCopy("action_title"), items: actions } : null,
    continuation: foundationalUnsafe ? null : {
      title: rhCopy("compare_months_title"),
      body: rhCopy("compare_months_body"),
      action: rhCopy("compare_months_cta"),
      targetId: "report-v2-compare-months",
    },
    methodology: foundationalUnsafe ? null : {
      title: rhCopy("methodology_title"),
      items: [
        rhCopy("method_one_statement"), rhCopy("method_net_submitted"), rhCopy("method_rate_denominator"),
        rhCopy(methodologyCompositionCode(synthesis)), rhCopy("method_no_external_links"),
        ...(openQuestionState !== "none" ? [rhCopy("method_open_questions")] : []),
      ],
    },
  };

  context.auditEntries.push({
    reportItemRef: "report",
    canonicalRefs: [foundation.versionManifest.schemaVersion, pricing.versionManifest.schemaVersion,
      synthesis.economicAnalysis.versionManifest.schemaVersion, synthesis.versionManifest.schemaVersion],
    permission: "public_experience",
    copyCodes: ["report_title", verdictCopy[0], verdictCopy[1]],
    omissionReason: foundationalUnsafe ? "foundational_reporting_unsafe" : null,
  });
  const validation = validateCanonicalMerchantReportProjectionV2(projection);
  const audit: CanonicalMerchantReportProjectionAuditV1 = {
    schemaVersion: "canonical_merchant_report_projection_audit_v1",
    entries: context.auditEntries,
    ignoredRgLanguageCandidateCount: input.rgLanguageCandidates?.length ?? 0,
    knowledgeConflictCount: input.knowledgeConflicts?.length ?? 0,
    validation: { status: validation.errors.length === 0 ? "valid" : "invalid", errors: validation.errors, warnings: validation.warnings },
  };
  return { projection, audit };
}

function safeIdentity(input: BuildCanonicalMerchantReportProjectionV2Input) {
  const identity = input.customerSafeIdentity;
  if (!identity?.sameAccountIdentityProven || !identity.customerDisplaySafe) {
    return { merchantDisplayName: null, processorDisplayName: null };
  }
  return {
    merchantDisplayName: safeIdentityString(identity.merchantDisplayName),
    processorDisplayName: safeIdentityString(identity.processorDisplayName),
  };
}

function safeIdentityString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120 || /[/\\]|\.(pdf|csv|xlsx?)$/i.test(trimmed)) return null;
  return trimmed;
}

function buildSnapshot(context: Context): CanonicalMerchantReportProjectionV2["snapshot"] {
  const f = context.pricing.foundation.financialPopulations;
  const metrics = context.pricing.foundation.metrics;
  return {
    title: rhCopy("snapshot_title"),
    processedSales: moneyMetric(context, "processed_sales", f.canonicalNetSubmittedCardVolume),
    processingFees: moneyMetric(context, "processing_fees", f.totalStatementProcessingFees),
    effectiveRate: {
      label: rhCopy("effective_rate"),
      state: metrics.headlineEffectiveRate.state === "defined" ? "available"
        : metrics.headlineEffectiveRate.state === "undefined_zero_denominator" ? "undefined" : "unavailable",
      moneyValue: null,
      decimalValue: metrics.headlineEffectiveRate.state === "defined" ? metrics.headlineEffectiveRate.value : null,
      countValue: null,
      evidence: evidenceForRefs(context, [metrics.headlineEffectiveRate.numeratorFactRef, metrics.headlineEffectiveRate.denominatorFactRef]),
    },
    transactionCount: countMetric(context, "transaction_count", f.grossSaleTransactionCount),
    averageTicket: moneyMetric(context, "average_ticket", {
      ...f.grossSaleVolume,
      status: metrics.headlineAverageTicket.state === "defined" ? "available" : "unavailable",
      value: metrics.headlineAverageTicket.value,
      evidenceRefs: unique([...f.grossSaleVolume.evidenceRefs, ...f.grossSaleTransactionCount.evidenceRefs]),
    }),
  };
}

function moneyMetric(
  context: Context,
  label: RhCopyCode,
  fact: Pick<CanonicalEconomicsV2Fact<MoneyAmount, string>, "status" | "value" | "evidenceRefs">,
): RhSnapshotMetric {
  return { label: rhCopy(label), state: fact.status === "available" && fact.value ? "available" : "unavailable",
    moneyValue: fact.status === "available" ? fact.value : null, decimalValue: null, countValue: null,
    evidence: evidenceForRefs(context, fact.evidenceRefs) };
}

function countMetric(
  context: Context,
  label: RhCopyCode,
  fact: Pick<CanonicalEconomicsV2Fact<number, string>, "status" | "value" | "evidenceRefs">,
): RhSnapshotMetric {
  return { label: rhCopy(label), state: fact.status === "available" && fact.value !== null ? "available" : "unavailable",
    moneyValue: null, decimalValue: null, countValue: fact.status === "available" ? fact.value : null,
    evidence: evidenceForRefs(context, fact.evidenceRefs) };
}

function buildPricing(pricing: CanonicalEconomicsV2PricingAnalysis): CanonicalMerchantReportProjectionV2["pricing"] {
  const architecture = pricing.pricingArchitecture;
  const axes = [architecture.underlyingCostBillingMode, architecture.merchantPriceScheduleShape, architecture.scopeUniformity];
  const supportedCount = axes.filter((item) => pricingAxisState(item) === "confirmed").length;
  const axis = (label: RhCopyCode, conclusion: CanonicalPricingAxisConclusion<unknown>, value: (axis: CanonicalPricingAxisConclusion<unknown>) => RhCustomerCopy) => {
    const state = pricingAxisState(conclusion);
    const reasonByState: Record<RhPricingAxisState, RhCopyCode> = {
      confirmed: "pricing_axis_confirmed",
      unknown: "pricing_axis_unknown",
      unresolved: "pricing_axis_unresolved",
      unavailable: "pricing_axis_unavailable",
      not_applicable: "pricing_axis_not_applicable",
    };
    return { state, label: rhCopy(label),
      value: state === "confirmed" || state === "not_applicable" ? value(conclusion) : null,
      reason: rhCopy(reasonByState[state]) };
  };
  return {
    title: rhCopy("pricing_title"),
    status: supportedCount === 3 ? "supported" : supportedCount > 0 ? "partially_supported" : "not_confirmed",
    summary: rhCopy(supportedCount === 3 ? "pricing_supported_summary" : supportedCount > 0 ? "pricing_partially_supported" : "pricing_not_confirmed"),
    underlyingCost: axis("pricing_underlying_cost", architecture.underlyingCostBillingMode, pricingCostCopy),
    schedule: axis("pricing_schedule", architecture.merchantPriceScheduleShape, pricingShapeCopy),
    scope: axis("pricing_scope", architecture.scopeUniformity, pricingScopeCopy),
  };
}

function pricingAxisState(conclusion: CanonicalPricingAxisConclusion<unknown>): RhPricingAxisState {
  if (conclusion.status === "ambiguous") return "unresolved";
  if (conclusion.status !== "available" || conclusion.value === null) return "unavailable";
  if (conclusion.value === "unknown") return "unknown";
  if (conclusion.value === "unresolved") return "unresolved";
  if (conclusion.value === "no_active_processing") return "not_applicable";
  const provingTier = conclusion.derivabilityTier === "stated_on_statement"
    || conclusion.derivabilityTier === "deterministically_derivable_from_statement";
  const provingBasis = conclusion.assertionBasis !== "ai_hypothesis" && conclusion.assertionBasis !== "corpus_pattern";
  return provingTier && provingBasis && conclusion.evidenceRefs.length > 0
    ? "confirmed"
    : "unresolved";
}

function pricingCostCopy(axis: CanonicalPricingAxisConclusion<unknown>): RhCustomerCopy {
  const map: Record<string, RhCopyCode> = {
    separately_billed_pass_through: "pricing_cost_pass_through", bundled_into_merchant_price: "pricing_cost_bundled",
    mixed_by_scope: "pricing_cost_mixed", no_active_processing: "pricing_no_active", unknown: "pricing_unknown",
  };
  return rhCopy(map[String(axis.value)] ?? "pricing_unknown");
}

function pricingShapeCopy(axis: CanonicalPricingAxisConclusion<unknown>): RhCustomerCopy {
  const map: Record<string, RhCopyCode> = {
    uniform_flat_percentage: "pricing_shape_uniform_flat", scope_specific_flat_percentage: "pricing_shape_scope_flat",
    qualification_tier_ladder: "pricing_shape_tier_ladder", rate_plus_per_item: "pricing_shape_rate_item",
    fixed_plus_variable: "pricing_shape_fixed_variable", subscription_membership: "pricing_shape_subscription",
    minimum_based: "pricing_shape_minimum", composite_multi_component: "pricing_shape_composite",
    custom_or_other: "pricing_shape_custom", no_active_processing: "pricing_no_active", unknown: "pricing_unknown",
  };
  return rhCopy(map[String(axis.value)] ?? "pricing_unknown");
}

function pricingScopeCopy(axis: CanonicalPricingAxisConclusion<unknown>): RhCustomerCopy {
  const map: Record<string, RhCopyCode> = {
    uniform: "pricing_scope_uniform", uniform_with_explicit_exceptions: "pricing_scope_exceptions",
    scope_specific: "pricing_scope_specific", no_active_processing: "pricing_no_active", unresolved: "pricing_unknown",
  };
  return rhCopy(map[String(axis.value)] ?? "pricing_unknown");
}

function buildComposition(context: Context): CanonicalMerchantReportProjectionV2["composition"] {
  const stack = context.synthesis.economicAnalysis.economicLayer.costStack;
  const unreconciled = stack.completeness === "financially_unreconciled" || stack.completeness === "not_derivable_from_document";
  const partial = stack.completeness === "partial_but_financially_reconciled";
  const positive = stack.buckets.reduce((sum, bucket) => sum + Math.max(0, bucket.debitAmount.amountMinor), 0);
  const categories: RhCompositionCategory[] = stack.buckets
    .filter((bucket) => bucket.debitAmount.amountMinor > 0)
    .map((bucket, index) => {
      const code = bucketCode(bucket.kind);
      return {
        itemId: `composition-${index + 1}`,
        code,
        label: rhCopy(categoryCopy(code)),
        amount: bucket.debitAmount,
        percentageOfPositiveCosts: unreconciled || positive === 0 ? null : ratio(bucket.debitAmount.amountMinor, positive),
      };
    });
  const creditOffsets: RhFeeCreditOffset[] = stack.buckets
    .filter((bucket) => bucket.creditAmount.amountMinor > 0)
    .map((bucket, index) => ({ itemId: `credit-${index + 1}`, label: rhCopy("fee_credit_offset"), amount: money(-bucket.creditAmount.amountMinor) }));
  const representedNet = stack.buckets.reduce((sum, bucket) => sum + bucket.debitAmount.amountMinor - bucket.creditAmount.amountMinor, 0);
  const calculatedDifference = stack.authoritativeStatementFeeTotal
    ? stack.authoritativeStatementFeeTotal.amountMinor - representedNet : 0;
  const differenceMinor = unreconciled && stack.reconciliationDeltaMinor !== 0
    ? stack.reconciliationDeltaMinor : calculatedDifference;
  return {
    title: rhCopy("composition_title"),
    state: unreconciled ? "unreconciled" : partial ? "partial_reconciled" : "reconciled",
    stateCopy: unreconciled ? rhCopy("composition_unreconciled") : partial ? rhCopy("composition_partial") : null,
    authoritativeTotal: stack.authoritativeStatementFeeTotal,
    positiveCostTotal: money(positive),
    categories,
    creditOffsets,
    reconciliationDifference: differenceMinor ? money(differenceMinor) : null,
    unresolvedDifference: unreconciled
      ? differenceMinor ? { state: "known", amount: money(differenceMinor) } : { state: "unknown", amount: null }
      : { state: "none", amount: null },
    percentagesPermitted: !unreconciled,
  };
}

function buildInventory(context: Context): CanonicalMerchantReportProjectionV2["inventory"] {
  const economic = context.synthesis.economicAnalysis.economicLayer;
  const stack = economic.costStack;
  const completeness = economic.admissionProfile.feeDetailCoverage === "complete"
    && (stack.completeness === "complete" || stack.completeness === "complete_with_rounding")
    ? "complete" as const
    : stack.completeness === "partial_but_financially_reconciled" || economic.admissionProfile.feeDetailCoverage === "unknown"
      ? "available" as const : "partial" as const;
  const items: RhInventoryItem[] = economic.charges
    .filter((charge) => (charge.contributionStatus === "contributes_classified" || charge.contributionStatus === "contributes_unresolved")
      && charge.observedAmount !== null)
    .map((charge, index) => {
      const code = bucketCodeFromCategory(charge.category);
      const provenControl = charge.roleClaimRefs.some((ref) => economic.roleClaims.some((claim) => claim.id === ref && claim.resolution === "proven"));
      const item: RhInventoryItem = {
        itemId: `inventory-${index + 1}`,
        label: rhCopy(charge.financialDirection === "credit" ? "inventory_item_credit" : "inventory_item_fee"),
        category: rhCopy(categoryCopy(code)),
        direction: charge.financialDirection === "credit" ? "credit" : "charge",
        amount: charge.financialDirection === "credit" ? money(-Math.abs(charge.observedAmount!.amountMinor)) : charge.observedAmount!,
        ownerControl: rhCopy(provenControl ? "control_confirmed" : "owner_not_confirmed"),
        evidence: evidenceForRefs(context, charge.evidenceRefs),
      };
      context.auditEntries.push({ reportItemRef: item.itemId, canonicalRefs: [charge.id, ...charge.evidenceRefs], permission: "inventory",
        copyCodes: [item.label.code, item.category.code, item.ownerControl!.code], omissionReason: null });
      return item;
    });
  return {
    title: rhCopy(completeness === "complete" ? "inventory_title_complete" : completeness === "available" ? "inventory_title_available" : "inventory_title_partial"),
    completeness,
    items,
  };
}

function buildAttention(context: Context): RhAttentionItem[] {
  return context.synthesis.synthesisLayer.themes
    .filter((theme) => context.synthesis.synthesisLayer.contractV1 ? theme.materiality === "material" : theme.materiality !== "unresolved")
    .map((theme, index) => {
      const copies = themeCopies(theme);
      const item: RhAttentionItem = {
        itemId: `attention-${index + 1}`,
        title: rhCopy(copies[0]), body: rhCopy(copies[1]), priority: themePriority(theme),
        evidenceStrength: proofStrength(theme), impact: impactForTheme(context, theme),
        evidence: evidenceForRefs(context, theme.evidenceRefs),
      };
      context.auditEntries.push({ reportItemRef: item.itemId, canonicalRefs: [theme.id, ...theme.factRefs, ...theme.driverRefs, ...theme.leverRefs],
        permission: "attention", copyCodes: copies, omissionReason: null });
      return item;
    });
}

function buildQuestions(context: Context): RhQuestionItem[] {
  const items: RhQuestionItem[] = [];
  if (!context.readiness.outcome.analysisCompletionPermitted) {
    items.push({ itemId: `question-${items.length + 1}`, known: rhCopy("question_known"),
      uncertain: rhCopy(context.readiness.outcome.state === "template_admission_unknown" ? "question_template_admission" : "question_synthesis_coverage"),
      nextStep: rhCopy("question_next_step_review"), amountUnderReview: null });
  }
  if (context.synthesis.synthesisLayer.themes.length === 0) {
    items.push({ itemId: `question-${items.length + 1}`, known: rhCopy("question_known"), uncertain: rhCopy("question_synthesis_coverage"),
      nextStep: rhCopy("question_next_step_review"), amountUnderReview: null });
  }
  const unresolved = context.synthesis.synthesisLayer.dependencies
    .filter((dependency) => dependency.status === "required" || dependency.status === "conflicting" || dependency.status === "unavailable");
  for (const dependency of uniqueBy(unresolved, (item) => item.kind)) {
    const codes = dependencyQuestionCopies(dependency.kind, dependency.status === "conflicting");
    items.push({ itemId: `question-${items.length + 1}`, known: rhCopy("question_known"), uncertain: rhCopy(codes[0]),
      nextStep: rhCopy(codes[1]), amountUnderReview: null });
  }
  for (const theme of context.synthesis.synthesisLayer.themes.filter((item) => item.materiality === "unresolved")) {
    const itemId = `question-${items.length + 1}`;
    context.questionTargetByTheme.set(theme.id, itemId);
    items.push({ itemId, known: rhCopy("question_known"), uncertain: rhCopy("question_processor_explanation"),
      nextStep: rhCopy("question_next_step_review"), amountUnderReview: impactForTheme(context, theme, true) });
  }
  for (const conflict of context.input.knowledgeConflicts ?? []) {
    items.push({ itemId: `question-${items.length + 1}`, known: rhCopy("question_known"), uncertain: rhCopy("question_knowledge_conflict"),
      nextStep: rhCopy("question_next_step_review"), amountUnderReview: null });
    void conflict;
  }
  const verificationCounterfactuals = context.synthesis.synthesisLayer.counterfactuals
    .filter((item) => item.resultState === "verification_only" && item.observedCost !== null);
  for (const counterfactual of verificationCounterfactuals) {
    items.push({ itemId: `question-${items.length + 1}`, known: rhCopy("question_known"), uncertain: rhCopy("question_processor_explanation"),
      nextStep: rhCopy("question_next_step_processor"), amountUnderReview: {
        kind: "amount_under_review", label: rhCopy("amount_under_review"), amount: counterfactual.observedCost!, annual: false,
      } });
  }
  return items;
}

function buildActions(context: Context, attention: RhAttentionItem[]): RhActionItem[] {
  const contractActive = Boolean(context.synthesis.synthesisLayer.contractV1);
  const themes = context.synthesis.synthesisLayer.themes.filter((theme) => contractActive
    ? theme.materiality !== "contextual" : theme.materiality !== "unresolved");
  const actions: RhActionItem[] = [];
  for (const theme of themes) {
    for (const leverRef of theme.leverRefs) {
      const lever = context.synthesis.synthesisLayer.merchantLevers.find((item) => item.id === leverRef);
      if (!lever || lever.state === "not_available" || lever.state === "unresolved") continue;
      if (theme.materiality === "unresolved" && (!contractActive
        || !["request_governing_documentation", "verify_account_capability_or_configuration"].includes(lever.safeActionCode)
        || !["documentation_or_monitoring_only", "candidate_requires_verification"].includes(lever.state))) continue;
      const copies = actionCopies(lever);
      const target = theme.materiality === "unresolved" ? context.questionTargetByTheme.get(theme.id)
        : attention.find((_item, index) => (contractActive ? themes.filter((item) => item.materiality !== "unresolved") : themes)[index]?.id === theme.id)?.itemId;
      if (!target) continue;
      actions.push({ itemId: `action-${actions.length + 1}`, kind: actionKind(lever), title: rhCopy(copies[0]), callQuestion: rhCopy(copies[1]), targetId: target });
      context.auditEntries.push({ reportItemRef: `action-${actions.length}`, canonicalRefs: [theme.id, lever.id], permission: "actions",
        copyCodes: copies, omissionReason: null });
    }
  }
  return uniqueBy(actions, (item) => `${item.title.code}:${item.targetId}`);
}

function impactForTheme(context: Context, theme: CanonicalEconomicTheme, verificationOnly = false): RhImpact | null {
  for (const leverRef of theme.leverRefs) {
    const lever = context.synthesis.synthesisLayer.merchantLevers.find((item) => item.id === leverRef);
    if (!lever) continue;
    const counterfactual = lever.counterfactualRef
      ? context.synthesis.synthesisLayer.counterfactuals.find((item) => item.id === lever.counterfactualRef) : null;
    if (counterfactual?.resultState === "verification_only" && counterfactual.observedCost) {
      return { kind: "amount_under_review", label: rhCopy("amount_under_review"), amount: counterfactual.observedCost, annual: false };
    }
    if (verificationOnly || lever.state !== "eligible_supported" || !counterfactual
      || lever.calculatedImpactState !== counterfactual.resultState
      || counterfactual.populationCompatibility !== "compatible"
      || !counterfactual.baselinePeriod || !counterfactual.impactPeriod
      || counterfactual.relationshipRefs.some((ref) => {
        const relationship = context.synthesis.synthesisLayer.attributionRelationships.find((item) => item.id === ref);
        return !relationship || ["overlaps_with", "shared_population", "unresolved"].includes(relationship.relationshipType);
      })) continue;
    const annual = counterfactual.annualized && counterfactual.recurrenceProven;
    if (annual && (counterfactual.cadenceEvidenceRefs.length === 0 || counterfactual.cadenceClaimRef === null)) continue;
    if (counterfactual.resultState === "exact_deterministic_delta" && counterfactual.exactDelta) {
      return { kind: "potential_reduction", label: rhCopy("potential_reduction"), amount: counterfactual.exactDelta, annual };
    }
    if (!context.synthesis.synthesisLayer.contractV1 && counterfactual.resultState === "bounded_conditional_delta" && counterfactual.lowerBound && counterfactual.upperBound) {
      return { kind: "potential_reduction_range", label: rhCopy("potential_reduction_range"),
        lowerAmount: counterfactual.lowerBound, upperAmount: counterfactual.upperBound, annual };
    }
  }
  return null;
}

function buildPermissions(input: {
  foundationalUnsafe: boolean; pricing: CanonicalEconomicsV2PricingAnalysis; synthesis: CanonicalEconomicsV2SynthesisAnalysis;
  hasAttention: boolean; hasImpact: boolean; hasVerificationAmount: boolean; hasActions: boolean;
  hasAnnualImpact: boolean;
  comparisonAvailable: boolean; continuationAvailable: boolean;
}): Record<RhPermissionCategory, RhVisibilityPermission> {
  const foundation = input.pricing.foundation;
  const stack = input.synthesis.economicAnalysis.economicLayer.costStack;
  const reconciled = !["financially_unreconciled", "not_derivable_from_document"].includes(stack.completeness);
  const partial = stack.completeness === "partial_but_financially_reconciled";
  const rate = foundation.metrics.headlineEffectiveRate;
  const pricingSupported = [input.pricing.pricingArchitecture.underlyingCostBillingMode,
    input.pricing.pricingArchitecture.merchantPriceScheduleShape, input.pricing.pricingArchitecture.scopeUniformity]
    .every((axis) => pricingAxisState(axis) === "confirmed");
  const anyControl = input.synthesis.economicAnalysis.economicLayer.roleClaims.some((claim) => claim.resolution === "proven");
  const permissions = {} as Record<RhPermissionCategory, RhVisibilityPermission>;
  for (const category of RH_PERMISSION_CATEGORIES) {
    permissions[category] = permission(category, "denied", "canonical_fact_unavailable", "denied");
  }
  permissions.public_experience = permission("public_experience", "permitted", input.foundationalUnsafe ? "foundational_reporting_unsafe" : "canonical_fact_available", "presentation_only");
  permissions.financial_metrics = permission("financial_metrics", input.foundationalUnsafe ? "denied" : "permitted", input.foundationalUnsafe ? "foundational_reporting_unsafe" : "canonical_fact_available", input.foundationalUnsafe ? "denied" : "upstream_canonical_only");
  permissions.effective_rate = permission("effective_rate", input.foundationalUnsafe ? "denied" : rate.state === "defined" ? "permitted" : "limited",
    input.foundationalUnsafe ? "foundational_reporting_unsafe" : rate.state === "defined" ? "canonical_metric_defined" : rate.state === "undefined_zero_denominator" ? "canonical_metric_undefined" : "population_unproven",
    input.foundationalUnsafe ? "denied" : "upstream_canonical_only");
  permissions.transaction_count = permission("transaction_count", input.foundationalUnsafe ? "denied" : foundation.financialPopulations.grossSaleTransactionCount.status === "available" ? "permitted" : "limited",
    input.foundationalUnsafe ? "foundational_reporting_unsafe" : foundation.financialPopulations.grossSaleTransactionCount.status === "available" ? "canonical_fact_available" : "population_unproven",
    input.foundationalUnsafe ? "denied" : "upstream_canonical_only");
  permissions.qualified_comparison = permission("qualified_comparison", input.comparisonAvailable ? "permitted" : "limited", input.comparisonAvailable ? "canonical_fact_available" : "qualified_comparison_missing", "upstream_canonical_only");
  permissions.pricing = permission("pricing", input.foundationalUnsafe ? "denied" : pricingSupported ? "permitted" : "limited", input.foundationalUnsafe ? "foundational_reporting_unsafe" : pricingSupported ? "pricing_supported" : "pricing_unresolved", input.foundationalUnsafe ? "denied" : "upstream_canonical_only");
  const knownComposition = !input.foundationalUnsafe && (stack.buckets.some((item) => item.debitAmount.amountMinor !== 0 || item.creditAmount.amountMinor !== 0)
    || stack.authoritativeStatementFeeTotal !== null);
  permissions.composition = permission("composition", knownComposition ? (reconciled ? "permitted" : "limited") : "denied",
    input.foundationalUnsafe ? "foundational_reporting_unsafe" : reconciled ? "cost_stack_reconciled" : "cost_stack_unreconciled",
    knownComposition ? "upstream_canonical_only" : "denied");
  permissions.partial_composition = permission("partial_composition", knownComposition && (partial || !reconciled) ? "limited" : "denied",
    partial ? "cost_stack_partial_reconciled" : reconciled ? "cost_stack_reconciled" : "cost_stack_unreconciled",
    knownComposition && (partial || !reconciled) ? "upstream_canonical_only" : "denied");
  permissions.composition_percentages = permission("composition_percentages", knownComposition && reconciled ? "permitted" : "denied",
    reconciled ? "cost_stack_reconciled" : "cost_stack_unreconciled", knownComposition && reconciled ? "upstream_canonical_only" : "denied");
  permissions.inventory = permission("inventory", input.foundationalUnsafe ? "denied" : "permitted", input.foundationalUnsafe ? "foundational_reporting_unsafe" : "inventory_coverage_available", input.foundationalUnsafe ? "denied" : "upstream_canonical_only");
  permissions.ownership_control = permission("ownership_control", anyControl ? "limited" : "denied", anyControl ? "ownership_positive_proof" : "ownership_unproven", anyControl ? "upstream_control_proof_only" : "denied");
  permissions.attention = permission("attention", input.hasAttention ? "permitted" : "denied", input.hasAttention ? "supported_theme_available" : "canonical_fact_unavailable", input.hasAttention ? "upstream_canonical_only" : "denied");
  permissions.potential_reduction = permission("potential_reduction", input.hasImpact ? "permitted" : "denied", input.hasImpact ? "eligible_counterfactual_available" : "eligible_counterfactual_missing", input.hasImpact ? "upstream_counterfactual_only" : "denied");
  permissions.annual_impact = permission("annual_impact", input.hasAnnualImpact ? "permitted" : "denied", input.hasAnnualImpact ? "eligible_counterfactual_available" : "recurrence_unproven", input.hasAnnualImpact ? "upstream_counterfactual_only" : "denied");
  permissions.amount_under_review = permission("amount_under_review", input.hasVerificationAmount ? "limited" : "denied", input.hasVerificationAmount ? "verification_amount_available" : "canonical_fact_unavailable", input.hasVerificationAmount ? "upstream_canonical_only" : "denied");
  permissions.actions = permission("actions", input.hasActions ? "limited" : "denied", input.hasActions ? "supported_lever_available" : "canonical_fact_unavailable", input.hasActions ? "single_statement_education_only" : "denied");
  permissions.call_guidance = permission("call_guidance", input.hasActions ? "limited" : "denied", input.hasActions ? "safe_call_guidance_available" : "canonical_fact_unavailable", input.hasActions ? "single_statement_education_only" : "denied");
  permissions.statement_evidence = permission("statement_evidence", input.foundationalUnsafe ? "limited" : "permitted", "safe_statement_reference_available", "statement_evidence_only");
  permissions.external_source = permission("external_source", "denied", "external_citations_disabled", "denied");
  permissions.methodology = permission("methodology", input.foundationalUnsafe ? "denied" : "permitted", input.foundationalUnsafe ? "foundational_reporting_unsafe" : "methodology_available", input.foundationalUnsafe ? "denied" : "presentation_only");
  permissions.continuation = permission("continuation", input.continuationAvailable ? "permitted" : "denied", input.continuationAvailable ? "continuation_available" : "continuation_hidden_for_unable", input.continuationAvailable ? "presentation_only" : "denied");
  return permissions;
}

function evidenceForRefs(context: Context, refs: string[]): RhStatementEvidence[] {
  const foundation = context.pricing.foundation;
  const evidenceIds = new Set<string>();
  for (const ref of refs) {
    const fact = Object.values(foundation.financialPopulations).find((item) => item.id === ref);
    if (fact) fact.evidenceRefs.forEach((item) => evidenceIds.add(item));
    if (foundation.sourceModel.evidence.some((item) => item.id === ref)) evidenceIds.add(ref);
    const occurrence = foundation.sourceModel.occurrences.find((item) => item.id === ref);
    if (occurrence) evidenceIds.add(occurrence.evidenceRef);
  }
  return [...evidenceIds].sort().map((evidenceRef) => {
    const evidence = foundation.sourceModel.evidence.find((item) => item.id === evidenceRef);
    if (!context.evidenceOrdinals.has(evidenceRef)) context.evidenceOrdinals.set(evidenceRef, context.evidenceOrdinals.size + 1);
    const section = evidence?.sectionRef ? context.sections.get(evidence.sectionRef) : null;
    return {
      ordinal: context.evidenceOrdinals.get(evidenceRef)!,
      pageNumber: evidence?.pageNumber ?? null,
      kind: sectionEvidenceKind(section?.kind),
      section: rhCopy(sectionEvidenceCopy(section?.kind)),
    };
  });
}

function sectionEvidenceKind(kind: CanonicalEconomicsV2SourceSection["kind"] | undefined): RhStatementEvidence["kind"] {
  const allowed = new Set<RhStatementEvidence["kind"]>(["summary", "sales", "funding", "fees", "interchange", "card_activity", "adjustments", "chargebacks", "account", "notices"]);
  const normalized = kind === "sales_activity" ? "sales" : kind;
  return allowed.has(normalized as RhStatementEvidence["kind"]) ? normalized as RhStatementEvidence["kind"] : "other";
}

function sectionEvidenceCopy(kind: CanonicalEconomicsV2SourceSection["kind"] | undefined): RhCopyCode {
  const map: Partial<Record<CanonicalEconomicsV2SourceSection["kind"], RhCopyCode>> = {
    summary: "evidence_summary", sales_activity: "evidence_sales", funding: "evidence_funding", fees: "evidence_fees",
    interchange: "evidence_interchange", card_activity: "evidence_card_activity", adjustments: "evidence_adjustments",
    chargebacks: "evidence_chargebacks", account: "evidence_account", notices: "evidence_notices",
  };
  return kind ? map[kind] ?? "evidence_other" : "evidence_other";
}

function bucketCode(kind: CanonicalEconomicCostBucketKind): RhCompositionCategoryCode {
  const map: Record<CanonicalEconomicCostBucketKind, RhCompositionCategoryCode> = {
    issuer_interchange_cost: "interchange", network_card_brand_cost: "network_card_brand",
    processor_controlled_pricing: "processor_controlled", processor_service_admin_cost: "services_admin",
    third_party_equipment_cost: "third_party_equipment", operational_penalty_cost: "operational_penalty",
    processing_fee_taxes: "processing_fee_taxes", other_source_grounded_fee: "other_source_grounded",
    unresolved_cost: "unresolved",
  };
  return map[kind];
}

function bucketCodeFromCategory(category: string): RhCompositionCategoryCode {
  const map: Record<string, RhCompositionCategoryCode> = {
    issuer_interchange_economics: "interchange", network_card_brand_economics: "network_card_brand",
    processor_acquirer_pricing: "processor_controlled", processor_service_administrative_cost: "services_admin",
    third_party_service_equipment: "third_party_equipment", operational_exception_penalty_fee: "operational_penalty",
    processing_fee_tax: "processing_fee_taxes", other_source_grounded_fee: "other_source_grounded",
    unresolved_unclassified: "unresolved",
  };
  return map[category] ?? "unresolved";
}

function categoryCopy(code: RhCompositionCategoryCode): RhCopyCode {
  const map: Record<RhCompositionCategoryCode, RhCopyCode> = {
    interchange: "category_interchange", network_card_brand: "category_network", processor_controlled: "category_processor",
    services_admin: "category_services", third_party_equipment: "category_third_party", operational_penalty: "category_operational",
    processing_fee_taxes: "category_taxes", other_source_grounded: "category_other", unresolved: "category_unresolved",
  };
  return map[code];
}

function themeCopies(theme: CanonicalEconomicTheme): [RhCopyCode, RhCopyCode] {
  const map: Record<CanonicalEconomicTheme["themeType"], [RhCopyCode, RhCopyCode]> = {
    pricing_structure: ["theme_pricing_structure_title", "theme_pricing_structure_body"],
    major_economic_driver: ["theme_major_driver_title", "theme_major_driver_body"],
    unresolved_cost_control: ["theme_control_title", "theme_control_body"],
    refund_economics: ["theme_refund_title", "theme_refund_body"],
    service_economics: ["theme_service_title", "theme_service_body"],
    operational_signal: ["theme_operational_title", "theme_operational_body"],
    dispute_risk_state: ["theme_dispute_title", "theme_dispute_body"],
    pricing_program_economics: ["theme_program_title", "theme_program_body"],
    off_statement_question: ["theme_off_statement_title", "theme_off_statement_body"],
    positive_control: ["theme_positive_title", "theme_positive_body"],
    other_supported_question: ["theme_other_title", "theme_other_body"],
  };
  return map[theme.themeType];
}

function themePriority(theme: CanonicalEconomicTheme): RhPriority {
  if (theme.priorityClass === "account_survival" || theme.priorityClass === "financial_integrity") return "high_priority";
  if (theme.priorityClass === "material_economics" || theme.priorityClass === "operational_review" || theme.priorityClass === "unresolved") return "review";
  return "routine";
}

function proofStrength(theme: CanonicalEconomicTheme): RhEvidenceStrength {
  if (theme.evidenceClass === "statement_confirmed") return "statement_confirmed";
  if (theme.evidenceClass === "deterministically_derived") return "deterministically_derived";
  if (theme.evidenceClass === "approved_knowledge_supported" || theme.evidenceClass === "public_documentation_verified") return "admitted_knowledge_supported";
  if (theme.evidenceRefs.length > 0 && theme.dependencyRefs.length > 0) return "mixed_supported";
  if (theme.evidenceRefs.length > 0) return "limited";
  return "unresolved";
}

function dependencyQuestionCopies(kind: CanonicalSynthesisDependencyKind, conflict: boolean): [RhCopyCode, RhCopyCode] {
  if (conflict) return ["question_knowledge_conflict", "question_next_step_review"];
  const map: Record<CanonicalSynthesisDependencyKind, [RhCopyCode, RhCopyCode]> = {
    requires_external_rule_or_schedule: ["question_external_rule", "question_next_step_review"],
    requires_merchant_pricing_document: ["question_pricing_document", "question_next_step_document"],
    requires_processor_explanation: ["question_processor_explanation", "question_next_step_processor"],
    requires_additional_statement_history: ["question_more_history", "question_next_step_history"],
    requires_versioned_source_template_admission: ["question_template_admission", "question_next_step_review"],
    requires_external_source: ["question_external_source", "question_next_step_review"],
  };
  return map[kind];
}

function actionCopies(lever: CanonicalMerchantLever): [RhCopyCode, RhCopyCode] {
  const map: Record<CanonicalMerchantLever["leverType"], [RhCopyCode, RhCopyCode]> = {
    pricing_term_change: ["action_pricing_review", "call_pricing"],
    configuration_acceptance_method_change: ["action_configuration_review", "call_configuration"],
    service_use_decision: ["action_service_review", "call_service"],
    documentation_verification: ["action_documentation", "call_documentation"],
    operational_process_change: ["action_process_review", "call_process"],
    monitoring_baseline: ["action_monitoring", "call_monitoring"],
  };
  return map[lever.leverType];
}

function actionKind(lever: CanonicalMerchantLever): RhActionItem["kind"] {
  const map: Record<CanonicalMerchantLever["leverType"], RhActionItem["kind"]> = {
    pricing_term_change: "pricing_review", configuration_acceptance_method_change: "configuration_review",
    service_use_decision: "service_review", documentation_verification: "documentation",
    operational_process_change: "process_review", monitoring_baseline: "monitoring",
  };
  return map[lever.leverType];
}

function methodologyCompositionCode(synthesis: CanonicalEconomicsV2SynthesisAnalysis): RhCopyCode {
  const completeness = synthesis.economicAnalysis.economicLayer.costStack.completeness;
  if (completeness === "partial_but_financially_reconciled") return "method_partial";
  if (completeness === "financially_unreconciled" || completeness === "not_derivable_from_document") return "method_unreconciled";
  return "method_reconciled";
}

function hasProvenNoMaterialAttention(synthesis: CanonicalEconomicsV2SynthesisAnalysis): boolean {
  return synthesis.synthesisLayer.themes.length > 0
    && synthesis.synthesisLayer.themes.every((theme) => theme.themeType === "positive_control" && theme.materiality !== "unresolved")
    && synthesis.synthesisLayer.dependencies.every((dependency) => dependency.status === "satisfied_by_admitted_evidence");
}

function determineEvidenceStrength(synthesis: CanonicalEconomicsV2SynthesisAnalysis, questionCount: number): RhEvidenceStrength {
  if (synthesis.synthesisLayer.themes.length === 0) return "unresolved";
  const classes = new Set(synthesis.synthesisLayer.themes.map((theme) => proofStrength(theme)));
  if (classes.has("unresolved")) return "unresolved";
  if (questionCount > 0) return "limited";
  if (classes.has("admitted_knowledge_supported") && (classes.has("statement_confirmed") || classes.has("deterministically_derived"))) return "mixed_supported";
  if (classes.has("admitted_knowledge_supported")) return "admitted_knowledge_supported";
  if (classes.has("deterministically_derived")) return "deterministically_derived";
  return "statement_confirmed";
}

function readinessFromSynthesis(synthesis: CanonicalEconomicsV2SynthesisAnalysis): SourceReadinessEnvelope {
  const foundation = synthesis.economicAnalysis.pricingAnalysis.foundation;
  const provenance = foundation.identity.provenanceStatus;
  const authoritative = provenance === "authoritative" || provenance === "approved_synthetic";
  const approvedSynthetic = provenance === "approved_synthetic";
  return buildSourceReadinessEnvelope({
    parser: { driverId: foundation.identity.parserId, reportable: foundation.validation.status === "valid",
      decisionStatus: foundation.validation.status === "valid" ? "accepted" : "failed",
      validationState: foundation.validation.status === "valid" ? "validated" : "failed" },
    source: { provenance, templateAdmission: approvedSynthetic ? "admitted" : foundation.templateCapability.admissionStatus,
      suppliedDocumentIntegrity: approvedSynthetic ? "complete_supplied_document" : foundation.documentIntegrity.suppliedDocumentStatus,
      statementCompleteness: approvedSynthetic ? "complete" : foundation.documentIntegrity.completenessStatus,
      authority: authoritative ? "authoritative" : provenance === "observational" ? "observational" : "withheld",
      humanReviewRequired: provenance === "requires_human_review" },
  });
}

function maxPriority(priorities: RhPriority[], open: RhOpenQuestionState): RhPriority {
  if (priorities.includes("high_priority") || open === "material") return "high_priority";
  if (priorities.includes("review") || open === "nonblocking") return "review";
  return "routine";
}

function buildAxisDisplay(axes: CanonicalMerchantReportProjectionV2["verdict"]["axes"]): CanonicalMerchantReportProjectionV2["verdict"]["axisDisplay"] {
  const labels: Record<keyof typeof axes, RhCopyCode> = {
    analysisReadiness: "axis_analysis_readiness", comparisonPosition: "axis_comparison_position",
    economicFinding: "axis_economic_finding", priority: "axis_priority", evidenceStrength: "axis_evidence_strength",
    openQuestionState: "axis_open_questions",
  };
  const values: Record<string, RhCopyCode> = {
    unavailable: "axis_unavailable", available_with_questions: "axis_available_with_questions", completed: "axis_completed",
    comparison_unavailable: "comparison_unavailable", needs_confirmation: "axis_needs_confirmation",
    below_reference: "axis_needs_confirmation", within_reference: "axis_needs_confirmation", above_reference: "axis_needs_confirmation",
    materially_above_reference: "axis_needs_confirmation", no_material_attention_proven: "axis_no_attention_proven",
    attention_items_present: "axis_attention_present", supported_impact_present: "axis_supported_impact",
    unresolved_material_items: "axis_unresolved_material", routine: "axis_routine", review: "axis_review",
    high_priority: "axis_high_priority", statement_confirmed: "axis_statement_confirmed",
    deterministically_derived: "axis_deterministically_derived", admitted_knowledge_supported: "axis_knowledge_supported",
    mixed_supported: "axis_mixed_supported", limited: "axis_limited", unresolved: "axis_unresolved",
    none: "axis_questions_none", nonblocking: "axis_questions_nonblocking", material: "axis_questions_material",
  };
  return (Object.keys(labels) as Array<keyof typeof axes>).map((key) => ({ key, label: rhCopy(labels[key]), value: rhCopy(values[axes[key]]!) }));
}

function ratio(value: number, total: number): string {
  return (value / total).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function unique(values: string[]): string[] { return [...new Set(values)]; }
function duplicateValues(values: string[]): string[] { return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]; }
function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => { const candidate = key(value); if (seen.has(candidate)) return false; seen.add(candidate); return true; });
}

export function emptyRhMoney(): MoneyAmount { return zeroMoney(); }
