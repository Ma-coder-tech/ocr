import { RH_COPY_REGISTRY } from "./reportCopy.js";
import { RH_PERMISSION_CATEGORIES } from "./reportPermissions.js";
import { RH_PUBLIC_EXPERIENCES } from "./reportTypes.js";
import type {
  CanonicalMerchantReportProjectionV2,
  RhCustomerCopy,
  RhPermissionCategory,
} from "./reportTypes.js";

export type RhProjectionValidation = { errors: string[]; warnings: string[] };

const forbiddenText = [
  /https?:\/\//i, /file:\/\//i, /[\\/]Users[\\/]/i, /[\\/]private[\\/]tmp[\\/]/i,
  /\b(?:tenant|account)[-_ ]?id\b/i, /\b(?:source|document)[-_ ]?(?:hash|fingerprint)\b/i,
  /\b(?:candidate|policy|package)[-_ ]?id\b/i, /\b(?:prompt|provider|model metadata|api key|credential)\b/i,
  /\b(?:RA|RB|RC|RD|RE|RF|RG)-AMEND-/i, /\.pdf\b/i,
];

export function validateCanonicalMerchantReportProjectionV2(
  projection: unknown,
): RhProjectionValidation {
  try {
    if (!isRecord(projection)) return { errors: ["report:malformed_structure"], warnings: [] };
    return validateProjectionStructure(projection as CanonicalMerchantReportProjectionV2);
  } catch {
    return { errors: ["report:malformed_structure"], warnings: [] };
  }
}

function validateProjectionStructure(
  projection: CanonicalMerchantReportProjectionV2,
): RhProjectionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const publicIds = new Set<string>();
  const oneOf = (value: unknown, allowed: readonly string[], path: string) => {
    if (typeof value !== "string" || !allowed.includes(value)) errors.push(`${path}:invalid_enum`);
  };
  const publicId = (value: unknown, path: string, uniqueId = true) => {
    if (typeof value !== "string" || value.length > 80 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
      || /(?:account|tenant|document|fingerprint|hash|candidate|policy|package)/i.test(value)) {
      errors.push(`${path}:invalid_public_id`); return;
    }
    if (uniqueId && publicIds.has(value)) errors.push(`${path}:duplicate_public_id`);
    if (uniqueId) publicIds.add(value);
  };
  const decimal = (value: unknown, path: string) => {
    if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) errors.push(`${path}:invalid_decimal`);
  };
  const nullableText = (value: unknown, path: string) => {
    if (value !== null && (typeof value !== "string" || value.length > 120)) errors.push(`${path}:invalid_text`);
  };
  const exact = (value: unknown, allowed: readonly string[], path: string) => {
    if (!isRecord(value)) { errors.push(`${path}:expected_object`); return; }
    for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}:unknown_key:${key}`);
    for (const key of allowed) if (!(key in value)) errors.push(`${path}:missing_key:${key}`);
  };
  const copy = (value: unknown, path: string) => {
    exact(value, ["code", "text"], path);
    if (!isRecord(value) || typeof value.code !== "string" || typeof value.text !== "string") return;
    const expected = RH_COPY_REGISTRY[value.code as keyof typeof RH_COPY_REGISTRY];
    if (!expected) errors.push(`${path}:unknown_copy_code`);
    else if (expected !== value.text) errors.push(`${path}:copy_text_mismatch`);
  };
  const money = (value: unknown, path: string) => {
    exact(value, ["amountMinor", "currency"], path);
    if (!isRecord(value) || value.currency !== "USD" || !Number.isSafeInteger(value.amountMinor)) errors.push(`${path}:invalid_money`);
  };
  const evidence = (value: unknown, path: string) => {
    exact(value, ["ordinal", "pageNumber", "kind", "section"], path);
    if (!isRecord(value)) return;
    if (!Number.isSafeInteger(value.ordinal) || Number(value.ordinal) < 1) errors.push(`${path}:invalid_ordinal`);
    if (value.pageNumber !== null && (!Number.isSafeInteger(value.pageNumber) || Number(value.pageNumber) < 1)) errors.push(`${path}:invalid_page`);
    oneOf(value.kind, ["summary", "sales", "funding", "fees", "interchange", "card_activity", "adjustments", "chargebacks", "account", "notices", "other"], `${path}.kind`);
    copy(value.section, `${path}.section`);
  };
  const evidenceList = (value: unknown, path: string) => {
    if (!Array.isArray(value)) { errors.push(`${path}:expected_array`); return; }
    value.forEach((item, index) => evidence(item, `${path}[${index}]`));
  };

  exact(projection, ["schemaVersion", "authority", "persistence", "sourceOfTruth", "customerLanguage", "experience", "header", "verdict",
    "permissions", "recovery", "snapshot", "pricing", "composition", "attention", "questions", "inventory", "actions", "continuation", "methodology"], "report");
  if (projection.schemaVersion !== "canonical_merchant_report_projection_v2_v1") errors.push("report:wrong_schema_version");
  if (projection.authority !== "shadow_non_authoritative" || projection.persistence !== "none"
    || projection.sourceOfTruth !== "canonical_economics_v2_only" || projection.customerLanguage !== "deterministic_copy_registry_only") {
    errors.push("report:authority_boundary_invalid");
  }
  if (!RH_PUBLIC_EXPERIENCES.includes(projection.experience)) errors.push("report:invalid_public_experience");
  exact(projection.header, ["title", "merchantDisplayName", "processorDisplayName", "statementPeriod"], "header");
  copy(projection.header.title, "header.title");
  nullableText(projection.header.merchantDisplayName, "header.merchantDisplayName");
  nullableText(projection.header.processorDisplayName, "header.processorDisplayName");
  if (projection.header.statementPeriod) {
    exact(projection.header.statementPeriod, ["start", "end"], "header.statementPeriod");
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso.test(projection.header.statementPeriod.start) || !iso.test(projection.header.statementPeriod.end)
      || projection.header.statementPeriod.start > projection.header.statementPeriod.end) errors.push("header.statementPeriod:invalid_period");
  }
  exact(projection.verdict, ["title", "body", "axes", "axisDisplay"], "verdict");
  copy(projection.verdict.title, "verdict.title"); copy(projection.verdict.body, "verdict.body");
  exact(projection.verdict.axes, ["analysisReadiness", "comparisonPosition", "economicFinding", "priority", "evidenceStrength", "openQuestionState"], "verdict.axes");
  oneOf(projection.verdict.axes.analysisReadiness, ["unavailable", "available_with_questions", "completed"], "verdict.axes.analysisReadiness");
  oneOf(projection.verdict.axes.comparisonPosition, ["below_reference", "within_reference", "above_reference", "materially_above_reference", "needs_confirmation", "comparison_unavailable"], "verdict.axes.comparisonPosition");
  oneOf(projection.verdict.axes.economicFinding, ["no_material_attention_proven", "attention_items_present", "supported_impact_present", "unresolved_material_items", "unavailable"], "verdict.axes.economicFinding");
  oneOf(projection.verdict.axes.priority, ["routine", "review", "high_priority"], "verdict.axes.priority");
  oneOf(projection.verdict.axes.evidenceStrength, ["statement_confirmed", "deterministically_derived", "admitted_knowledge_supported", "mixed_supported", "limited", "unresolved"], "verdict.axes.evidenceStrength");
  oneOf(projection.verdict.axes.openQuestionState, ["none", "nonblocking", "material"], "verdict.axes.openQuestionState");
  projection.verdict.axisDisplay.forEach((item, index) => {
    exact(item, ["key", "label", "value"], `verdict.axisDisplay[${index}]`);
    oneOf(item.key, ["analysisReadiness", "comparisonPosition", "economicFinding", "priority", "evidenceStrength", "openQuestionState"], `verdict.axisDisplay[${index}].key`);
    copy(item.label, `verdict.axisDisplay[${index}].label`); copy(item.value, `verdict.axisDisplay[${index}].value`);
  });
  if (projection.verdict.axisDisplay.length !== 6 || new Set(projection.verdict.axisDisplay.map((item) => item.key)).size !== 6) {
    errors.push("verdict.axisDisplay:must_render_six_independent_axes");
  }

  exact(projection.permissions, RH_PERMISSION_CATEGORIES, "permissions");
  for (const category of RH_PERMISSION_CATEGORIES) {
    const item = projection.permissions[category];
    exact(item, ["category", "state", "reasonCode", "authorityCeiling"], `permissions.${category}`);
    if (item.category !== category) errors.push(`permissions.${category}:category_mismatch`);
    oneOf(item.state, ["permitted", "limited", "denied"], `permissions.${category}.state`);
    oneOf(item.reasonCode, ["canonical_fact_available", "canonical_fact_unavailable", "foundational_reporting_unsafe", "canonical_metric_defined", "canonical_metric_undefined", "population_unproven", "qualified_comparison_missing", "pricing_supported", "pricing_unresolved", "cost_stack_reconciled", "cost_stack_partial_reconciled", "cost_stack_unreconciled", "inventory_coverage_available", "ownership_positive_proof", "ownership_unproven", "supported_theme_available", "eligible_counterfactual_available", "eligible_counterfactual_missing", "recurrence_unproven", "verification_amount_available", "supported_lever_available", "safe_call_guidance_available", "safe_statement_reference_available", "external_citations_disabled", "methodology_available", "continuation_available", "continuation_hidden_for_unable"], `permissions.${category}.reasonCode`);
    oneOf(item.authorityCeiling, ["presentation_only", "statement_evidence_only", "upstream_canonical_only", "upstream_control_proof_only", "upstream_counterfactual_only", "single_statement_education_only", "denied"], `permissions.${category}.authorityCeiling`);
    if (item.state === "denied" && item.authorityCeiling !== "denied") errors.push(`permissions.${category}:denied_requires_denied_ceiling`);
    if (item.state !== "denied" && item.authorityCeiling === "denied") errors.push(`permissions.${category}:visible_requires_authority_ceiling`);
  }

  if (projection.recovery) {
    exact(projection.recovery, ["body", "action", "targetId"], "recovery");
    copy(projection.recovery.body, "recovery.body"); copy(projection.recovery.action, "recovery.action");
    publicId(projection.recovery.targetId, "recovery.targetId");
  }
  if (projection.snapshot) validateSnapshot(projection.snapshot, exact, copy, money, evidenceList, errors);
  if (projection.pricing) {
    exact(projection.pricing, ["title", "status", "summary", "underlyingCost", "schedule", "scope"], "pricing");
    copy(projection.pricing.title, "pricing.title"); copy(projection.pricing.summary, "pricing.summary");
    oneOf(projection.pricing.status, ["supported", "partially_supported", "not_confirmed"], "pricing.status");
    for (const [name, axis] of Object.entries({ underlyingCost: projection.pricing.underlyingCost, schedule: projection.pricing.schedule, scope: projection.pricing.scope })) {
      const path = `pricing.${name}`;
      exact(axis, ["state", "label", "value", "reason"], path); oneOf(axis.state, ["confirmed", "unknown", "unresolved", "unavailable", "not_applicable"], `${path}.state`);
      copy(axis.label, `${path}.label`); if (axis.value) copy(axis.value, `${path}.value`); copy(axis.reason, `${path}.reason`);
      const valueRequired = axis.state === "confirmed" || axis.state === "not_applicable";
      if (valueRequired !== (axis.value !== null)) errors.push(`${path}:state_value_mismatch`);
    }
    const confirmedAxes = [projection.pricing.underlyingCost, projection.pricing.schedule, projection.pricing.scope].filter((axis) => axis.state === "confirmed").length;
    if ((projection.pricing.status === "supported" && confirmedAxes !== 3)
      || (projection.pricing.status === "partially_supported" && (confirmedAxes < 1 || confirmedAxes > 2))
      || (projection.pricing.status === "not_confirmed" && confirmedAxes !== 0)) errors.push("pricing:status_axis_mismatch");
  }
  if (projection.composition) {
    const section = projection.composition;
    exact(section, ["title", "state", "stateCopy", "authoritativeTotal", "positiveCostTotal", "categories", "creditOffsets",
      "reconciliationDifference", "unresolvedDifference", "percentagesPermitted"], "composition");
    oneOf(section.state, ["reconciled", "partial_reconciled", "unreconciled"], "composition.state");
    if (typeof section.percentagesPermitted !== "boolean") errors.push("composition.percentagesPermitted:invalid_boolean");
    copy(section.title, "composition.title"); if (section.stateCopy) copy(section.stateCopy, "composition.stateCopy");
    if (section.authoritativeTotal) money(section.authoritativeTotal, "composition.authoritativeTotal");
    money(section.positiveCostTotal, "composition.positiveCostTotal");
    if (section.reconciliationDifference) money(section.reconciliationDifference, "composition.reconciliationDifference");
    exact(section.unresolvedDifference, ["state", "amount"], "composition.unresolvedDifference");
    oneOf(section.unresolvedDifference.state, ["none", "known", "unknown"], "composition.unresolvedDifference.state");
    if (section.unresolvedDifference.amount) money(section.unresolvedDifference.amount, "composition.unresolvedDifference.amount");
    if ((section.unresolvedDifference.state === "known") !== (section.unresolvedDifference.amount !== null)) errors.push("composition.unresolvedDifference:state_amount_mismatch");
    section.categories.forEach((item, index) => {
      exact(item, ["itemId", "code", "label", "amount", "percentageOfPositiveCosts"], `composition.categories[${index}]`);
      publicId(item.itemId, `composition.categories[${index}].itemId`);
      oneOf(item.code, ["interchange", "network_card_brand", "processor_controlled", "services_admin", "third_party_equipment", "operational_penalty", "processing_fee_taxes", "other_source_grounded", "unresolved"], `composition.categories[${index}].code`);
      if (item.percentageOfPositiveCosts !== null) decimal(item.percentageOfPositiveCosts, `composition.categories[${index}].percentageOfPositiveCosts`);
      copy(item.label, `composition.categories[${index}].label`); money(item.amount, `composition.categories[${index}].amount`);
      if (!section.percentagesPermitted && item.percentageOfPositiveCosts !== null) errors.push(`composition.categories[${index}]:percentage_not_permitted`);
    });
    section.creditOffsets.forEach((item, index) => {
      exact(item, ["itemId", "label", "amount"], `composition.creditOffsets[${index}]`);
      publicId(item.itemId, `composition.creditOffsets[${index}].itemId`);
      copy(item.label, `composition.creditOffsets[${index}].label`); money(item.amount, `composition.creditOffsets[${index}].amount`);
      if (item.amount.amountMinor >= 0) errors.push(`composition.creditOffsets[${index}]:credit_must_be_negative`);
    });
  }
  if (projection.attention) {
    exact(projection.attention, ["title", "items"], "attention"); copy(projection.attention.title, "attention.title");
    projection.attention.items.forEach((item, index) => {
      const path = `attention.items[${index}]`;
      exact(item, ["itemId", "title", "body", "priority", "evidenceStrength", "impact", "evidence"], path);
      publicId(item.itemId, `${path}.itemId`); oneOf(item.priority, ["routine", "review", "high_priority"], `${path}.priority`);
      oneOf(item.evidenceStrength, ["statement_confirmed", "deterministically_derived", "admitted_knowledge_supported", "mixed_supported", "limited", "unresolved"], `${path}.evidenceStrength`);
      copy(item.title, `${path}.title`); copy(item.body, `${path}.body`); evidenceList(item.evidence, `${path}.evidence`);
      if (item.impact) validateImpact(item.impact, `${path}.impact`, exact, copy, money, errors);
    });
  }
  if (projection.questions) {
    exact(projection.questions, ["title", "items"], "questions"); copy(projection.questions.title, "questions.title");
    projection.questions.items.forEach((item, index) => {
      const path = `questions.items[${index}]`;
      exact(item, ["itemId", "known", "uncertain", "nextStep", "amountUnderReview"], path);
      publicId(item.itemId, `${path}.itemId`);
      copy(item.known, `${path}.known`); copy(item.uncertain, `${path}.uncertain`); copy(item.nextStep, `${path}.nextStep`);
      if (item.amountUnderReview) validateImpact(item.amountUnderReview, `${path}.amountUnderReview`, exact, copy, money, errors);
      if (item.amountUnderReview && item.amountUnderReview.kind !== "amount_under_review") errors.push(`${path}:question_impact_must_be_under_review`);
    });
  }
  if (projection.inventory) {
    exact(projection.inventory, ["title", "completeness", "items"], "inventory"); copy(projection.inventory.title, "inventory.title");
    oneOf(projection.inventory.completeness, ["complete", "available", "partial"], "inventory.completeness");
    projection.inventory.items.forEach((item, index) => {
      const path = `inventory.items[${index}]`;
      exact(item, ["itemId", "label", "category", "direction", "amount", "ownerControl", "evidence"], path);
      publicId(item.itemId, `${path}.itemId`); oneOf(item.direction, ["charge", "credit"], `${path}.direction`);
      copy(item.label, `${path}.label`); copy(item.category, `${path}.category`); money(item.amount, `${path}.amount`);
      if (item.ownerControl) copy(item.ownerControl, `${path}.ownerControl`); evidenceList(item.evidence, `${path}.evidence`);
      if (item.direction === "credit" && item.amount.amountMinor >= 0) errors.push(`${path}:credit_must_be_negative`);
    });
  }
  if (projection.actions) {
    exact(projection.actions, ["title", "items"], "actions"); copy(projection.actions.title, "actions.title");
    projection.actions.items.forEach((item, index) => {
      const path = `actions.items[${index}]`;
      exact(item, ["itemId", "kind", "title", "callQuestion", "targetId"], path);
      publicId(item.itemId, `${path}.itemId`); publicId(item.targetId, `${path}.targetId`, false);
      oneOf(item.kind, ["pricing_review", "configuration_review", "service_review", "documentation", "process_review", "monitoring"], `${path}.kind`);
      copy(item.title, `${path}.title`); copy(item.callQuestion, `${path}.callQuestion`);
      if (!projection.attention?.items.some((attention) => attention.itemId === item.targetId)
        && !projection.questions?.items.some((question) => question.itemId === item.targetId)) errors.push(`${path}:missing_target`);
    });
  }
  if (projection.continuation) {
    exact(projection.continuation, ["title", "body", "action", "targetId"], "continuation");
    copy(projection.continuation.title, "continuation.title"); copy(projection.continuation.body, "continuation.body");
    copy(projection.continuation.action, "continuation.action");
    publicId(projection.continuation.targetId, "continuation.targetId");
  }
  if (projection.methodology) {
    exact(projection.methodology, ["title", "items"], "methodology"); copy(projection.methodology.title, "methodology.title");
    projection.methodology.items.forEach((item, index) => copy(item, `methodology.items[${index}]`));
  }

  if (projection.experience === "unable_to_complete") {
    for (const [name, value] of Object.entries({ snapshot: projection.snapshot, pricing: projection.pricing, composition: projection.composition,
      attention: projection.attention, questions: projection.questions, inventory: projection.inventory, actions: projection.actions,
      continuation: projection.continuation, methodology: projection.methodology })) {
      if (value !== null) errors.push(`unable_to_complete:forbidden_section:${name}`);
    }
  } else if (projection.recovery !== null) errors.push("completed_or_open:recovery_must_be_null");
  if (projection.experience === "analysis_completed" && projection.verdict.axes.openQuestionState !== "none") errors.push("analysis_completed:open_questions_present");
  if (projection.experience === "analysis_with_open_questions" && projection.verdict.axes.openQuestionState === "none") errors.push("analysis_with_open_questions:question_state_none");
  if (projection.verdict.axes.comparisonPosition !== "comparison_unavailable"
    && projection.permissions.qualified_comparison.state !== "permitted") errors.push("comparison:qualified_permission_missing");
  if (projection.attention?.items.some((item) => item.impact?.annual)
    && projection.permissions.annual_impact.state !== "permitted") errors.push("impact:unsupported_annualization");
  if (projection.composition) {
    const visibleComposition = projection.permissions.composition.state !== "denied";
    if (!visibleComposition) errors.push("composition:section_permission_contradiction");
    if (projection.composition.percentagesPermitted !== (projection.permissions.composition_percentages.state === "permitted")) errors.push("composition:percentage_permission_contradiction");
    if (projection.composition.state === "unreconciled" && projection.permissions.partial_composition.state === "denied") errors.push("composition:partial_disclosure_permission_missing");
    if (projection.composition.state === "unreconciled" && projection.composition.unresolvedDifference.state === "none") errors.push("composition:unresolved_difference_required");
    if (projection.composition.state !== "unreconciled" && projection.composition.unresolvedDifference.state !== "none") errors.push("composition:unexpected_unresolved_difference");
  }

  scanStrings(projection, "report", errors);
  return { errors: unique(errors), warnings };
}

function validateSnapshot(
  snapshot: NonNullable<CanonicalMerchantReportProjectionV2["snapshot"]>,
  exact: (value: unknown, allowed: readonly string[], path: string) => void,
  copy: (value: unknown, path: string) => void,
  money: (value: unknown, path: string) => void,
  evidenceList: (value: unknown, path: string) => void,
  errors: string[],
) {
  exact(snapshot, ["title", "processedSales", "processingFees", "effectiveRate", "transactionCount", "averageTicket"], "snapshot");
  copy(snapshot.title, "snapshot.title");
  for (const [name, metric] of Object.entries(snapshot).filter(([name]) => name !== "title")) {
    const item = metric as NonNullable<CanonicalMerchantReportProjectionV2["snapshot"]>["processedSales"];
    const path = `snapshot.${name}`;
    exact(item, ["label", "state", "moneyValue", "decimalValue", "countValue", "evidence"], path);
    copy(item.label, `${path}.label`); if (item.moneyValue) money(item.moneyValue, `${path}.moneyValue`); evidenceList(item.evidence, `${path}.evidence`);
    if (!["available", "undefined", "unavailable"].includes(item.state)) errors.push(`${path}.state:invalid_enum`);
    if (item.decimalValue !== null && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(item.decimalValue)) errors.push(`${path}.decimalValue:invalid_decimal`);
    if (item.countValue !== null && (!Number.isSafeInteger(item.countValue) || item.countValue < 0)) errors.push(`${path}:invalid_count`);
    const valueCount = [item.moneyValue, item.decimalValue, item.countValue].filter((value) => value !== null).length;
    if (item.state === "available" && valueCount !== 1) errors.push(`${path}:available_requires_one_value`);
    if (item.state !== "available" && valueCount !== 0) errors.push(`${path}:unavailable_must_not_have_value`);
  }
  if (snapshot.effectiveRate.state === "undefined" && snapshot.effectiveRate.decimalValue !== null) errors.push("snapshot.effectiveRate:undefined_must_not_be_zero");
}

function validateImpact(
  impact: NonNullable<NonNullable<CanonicalMerchantReportProjectionV2["attention"]>["items"][number]["impact"]>,
  path: string,
  exact: (value: unknown, allowed: readonly string[], path: string) => void,
  copy: (value: unknown, path: string) => void,
  money: (value: unknown, path: string) => void,
  errors: string[],
) {
  if (!["potential_reduction", "potential_reduction_range", "amount_under_review"].includes(String(impact.kind))) {
    errors.push(`${path}.kind:invalid_enum`);
    return;
  }
  if (impact.kind === "potential_reduction") {
    exact(impact, ["kind", "label", "amount", "annual"], path); copy(impact.label, `${path}.label`); money(impact.amount, `${path}.amount`);
  } else if (impact.kind === "potential_reduction_range") {
    exact(impact, ["kind", "label", "lowerAmount", "upperAmount", "annual"], path); copy(impact.label, `${path}.label`);
    money(impact.lowerAmount, `${path}.lowerAmount`); money(impact.upperAmount, `${path}.upperAmount`);
    if (impact.lowerAmount.amountMinor > impact.upperAmount.amountMinor) errors.push(`${path}:invalid_range`);
  } else {
    exact(impact, ["kind", "label", "amount", "annual"], path); copy(impact.label, `${path}.label`); money(impact.amount, `${path}.amount`);
    if (impact.annual !== false) errors.push(`${path}:amount_under_review_cannot_be_annual`);
  }
}

function scanStrings(value: unknown, path: string, errors: string[]) {
  if (typeof value === "string") {
    if (forbiddenText.some((pattern) => pattern.test(value))) errors.push(`${path}:unsafe_string`);
    return;
  }
  if (Array.isArray(value)) value.forEach((item, index) => scanStrings(item, `${path}[${index}]`, errors));
  else if (isRecord(value)) Object.entries(value).forEach(([key, item]) => scanStrings(item, `${path}.${key}`, errors));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] { return [...new Set(values)]; }

export function assertValidCanonicalMerchantReportProjectionV2(projection: CanonicalMerchantReportProjectionV2): void {
  const validation = validateCanonicalMerchantReportProjectionV2(projection);
  if (validation.errors.length > 0) throw new Error(`RH_REPORT_VALIDATION_FAILED:${validation.errors.join("|")}`);
}

export function isRhCustomerCopy(value: unknown): value is RhCustomerCopy {
  return isRecord(value) && typeof value.code === "string" && typeof value.text === "string"
    && RH_COPY_REGISTRY[value.code as keyof typeof RH_COPY_REGISTRY] === value.text;
}

export function permissionIsCustomerVisible(
  projection: CanonicalMerchantReportProjectionV2,
  category: RhPermissionCategory,
): boolean {
  return projection.permissions[category].state !== "denied";
}
