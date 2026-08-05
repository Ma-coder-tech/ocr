import {
  CUSTOMER_ACTION_TYPES,
  CUSTOMER_ANALYSIS_READINESS_VALUES,
  CUSTOMER_DATA_INTEGRITY_VALUES,
  CUSTOMER_OPPORTUNITY_POSTURE_VALUES,
  CUSTOMER_PERMISSION_KEYS,
  CUSTOMER_PRIMARY_STATE_VALUES,
  CUSTOMER_RATE_POSITION_VALUES,
} from "./customerStateTypes.js";
import {
  CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS,
  CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION,
  type CanonicalCustomerReportProjectionV1,
  type CanonicalCustomerReportProjectionValidation,
  type CustomerActionProjection,
  type CustomerSectionVisibility,
} from "./customerReportProjectionTypes.js";
import { isApprovedCustomerLimitation } from "./customerReportProjectionLimitations.js";

const TOP_LEVEL_KEYS = [
  "reportVersion",
  "projectionReadiness",
  "source",
  "displayId",
  "primaryState",
  "axes",
  "permissions",
  "visibility",
  "headline",
  "statementSummary",
  "coreMetrics",
  "effectiveRate",
  "benchmark",
  "feeInventory",
  "opportunities",
  "verificationItems",
  "limitations",
  "actions",
  "explanation",
  "methodology",
] as const;

const FORBIDDEN_VALUE_PATTERNS: RegExp[] = [
  /\bmerchant\s*(name|id|number|account)\b/i,
  /\baccount\s*(number|id)\b/i,
  /(?:^|\s)(?:\/(?:users|private|tmp|var)\/|[a-z]:\\)/i,
  /\.(?:pdf|png|sqlite|json|log)\b/i,
  /\b[a-f0-9]{32,}\b/i,
  /\braw\s+statement\b/i,
  /\bevidence\s+excerpt\b/i,
  /\b(provider|model|prompt|response|api[-_\s]?key|billing error)\b/i,
  /\b(openai|anthropic|gpt(?:-[0-9a-z.]+)?|claude|gemini|responses api|web search)\b/i,
  /\b(candidate|rejected candidate|sidecar|shadow|capability record|grounding gateway|package [b-g]|report v1|legacy)\b/i,
  /\b(harness|policy|adapter|implementation|runtime|feature flag|worker|persistence)\b/i,
  /\b(canonical|qualified comparison|limited fee inventory|fee ledger is partial|classification review|this fixture permits|how this view was prepared)\b/i,
  /\b(overpaying|cheating|guaranteed savings|definitely remove|bad rate)\b/i,
];

const FORBIDDEN_KEY_PATTERNS: RegExp[] = [
  /^merchant(Name|Id|Number|Account)?$/i,
  /^merchant_(name|id|number|account)$/i,
  /account.*(number|identifier|id)/i,
  /(file|filename|path|hash|prompt|response|provider|model|raw|excerpt|sidecar|candidate|debug|shadow)/i,
  /legacy.*saving/i,
  /reportV1/i,
];

const COMPETITIVE_STATES = new Set(["competitive_no_opportunity", "competitive_with_opportunity"]);
const OPPORTUNITY_HIDDEN_STATES = new Set(["unable_to_analyze", "analysis_withheld", "analysis_limited"]);
const STRONG_ACTIONS = new Set(["request_removal", "request_repricing"]);
const CUSTOMER_SECTION_LIMITATION_CODES = new Set([
  "opportunity_support_unavailable",
  "fee_reconciliation_incomplete",
  "fee_section_content_unsafe",
  "benchmark_unavailable",
  "rate_basis_limited",
  "fee_requires_review",
  "documentation_needed",
]);
const KNOWN_DTO_KEYS = new Set<string>([
  ...TOP_LEVEL_KEYS,
  ...CUSTOMER_PERMISSION_KEYS,
  "amountMinor",
  "currency",
  "basisPoints",
  "displayBasis",
  "status",
  "reasonCode",
  "reasonCodes",
  "limitationCodes",
  "permitted",
  "title",
  "body",
  "tone",
  "processor",
  "statementPeriod",
  "businessType",
  "processedVolume",
  "totalFees",
  "transactionCount",
  "averageTicket",
  "count",
  "value",
  "population",
  "amount",
  "rate",
  "basisLabel",
  "position",
  "rangeLabel",
  "methodologyLabel",
  "customerMessage",
  "totalVisibleAmount",
  "rows",
  "omittedRowCount",
  "displayId",
  "label",
  "role",
  "feeOwner",
  "customerCategory",
  "actionability",
  "removabilityLevel",
  "evidenceStatus",
  "synthetic",
  "effectiveDate",
  "safeUrl",
  "conditions",
  "deterministicAmount",
  "estimatedAmount",
  "items",
  "certainty",
  "cadence",
  "supportedAction",
  "observedAmount",
  "notSavingsCopy",
  "code",
  "severity",
  "affectedSections",
  "type",
  "targetDisplayIds",
  "source",
  "sections",
  "fallbackReasonCodes",
  "dataQuality",
  "guidance",
  "docsToGather",
  "analysisReadiness",
  "dataIntegrity",
  "ratePosition",
  "opportunityPosture",
  "explanationReadiness",
]);

export function validateCanonicalCustomerReportProjection(
  value: unknown,
): CanonicalCustomerReportProjectionValidation {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return { status: "invalid", errors: ["projection_not_object"] };
  }
  rejectUnknownKeys(value, TOP_LEVEL_KEYS, "projection", errors);
  const projection = value as CanonicalCustomerReportProjectionV1;

  if (projection.reportVersion !== CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION) errors.push("unsupported_report_version");
  if (projection.projectionReadiness !== CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS) errors.push("unsupported_projection_readiness");
  if (projection.source !== "synthetic_fixture") errors.push("unsupported_projection_source");
  if (!CUSTOMER_PRIMARY_STATE_VALUES.includes(projection.primaryState)) errors.push("unsupported_primary_state");
  validateAxes(projection, errors);
  validatePermissions(projection, errors);
  validateVisibility(projection.visibility, errors);
  validateStateCompatibility(projection, errors);
  validateSections(projection, errors);
  validateLimitations(projection, errors);
  validateCoreMath(projection, errors);
  validateSourceMetadata(projection, errors);
  validateActions(projection.actions, projection, errors);
  rejectUnsafeContent(projection, errors);

  return { status: errors.length === 0 ? "valid" : "invalid", errors: [...new Set(errors)].sort() };
}

function validateAxes(projection: CanonicalCustomerReportProjectionV1, errors: string[]) {
  const axes = projection.axes;
  if (!isPlainObject(axes)) {
    errors.push("axes_missing");
    return;
  }
  rejectUnknownKeys(axes, ["analysisReadiness", "dataIntegrity", "ratePosition", "opportunityPosture", "explanationReadiness"], "axes", errors);
  if (!CUSTOMER_ANALYSIS_READINESS_VALUES.includes(axes.analysisReadiness)) errors.push("unsupported_analysis_readiness");
  if (!CUSTOMER_DATA_INTEGRITY_VALUES.includes(axes.dataIntegrity)) errors.push("unsupported_data_integrity");
  if (!CUSTOMER_RATE_POSITION_VALUES.includes(axes.ratePosition)) errors.push("unsupported_rate_position");
  if (!CUSTOMER_OPPORTUNITY_POSTURE_VALUES.includes(axes.opportunityPosture)) errors.push("unsupported_opportunity_posture");
  if (!["ready", "limited", "withheld", "unavailable"].includes(financialReadinessForState(projection.primaryState, axes.analysisReadiness))) {
    errors.push("contradictory_primary_state_axes");
  }
  if (projection.primaryState === "unable_to_analyze" && axes.analysisReadiness !== "unavailable") errors.push("contradictory_primary_state_axes");
  if (projection.primaryState === "analysis_withheld" && axes.analysisReadiness !== "withheld") errors.push("contradictory_primary_state_axes");
  if (projection.primaryState === "analysis_limited" && axes.analysisReadiness !== "limited") errors.push("contradictory_primary_state_axes");
  if (projection.primaryState === "verified_benchmark_unavailable" && axes.ratePosition !== "unavailable") errors.push("contradictory_primary_state_axes");
  if (projection.primaryState === "material_fee_opportunity" && axes.opportunityPosture !== "material_eligible_opportunity") errors.push("contradictory_primary_state_axes");
}

function validatePermissions(projection: CanonicalCustomerReportProjectionV1, errors: string[]) {
  if (!isPlainObject(projection.permissions)) {
    errors.push("permissions_missing");
    return;
  }
  rejectUnknownKeys(projection.permissions, CUSTOMER_PERMISSION_KEYS, "permissions", errors);
  for (const key of CUSTOMER_PERMISSION_KEYS) {
    const permission = projection.permissions[key];
    if (!isPlainObject(permission)) {
      errors.push(`permission_missing_${key}`);
      continue;
    }
    rejectUnknownKeys(permission, ["permitted", "reasonCodes"], `permissions.${key}`, errors);
    if (typeof permission.permitted !== "boolean") errors.push(`permission_invalid_${key}`);
    if (!Array.isArray(permission.reasonCodes) || permission.reasonCodes.some((code) => !isSafeCode(code))) errors.push(`permission_reason_invalid_${key}`);
  }
}

function validateVisibility(visibility: CustomerSectionVisibility, errors: string[]) {
  if (!isPlainObject(visibility)) {
    errors.push("visibility_missing");
    return;
  }
  rejectUnknownKeys(visibility, ["coreMetrics", "effectiveRate", "benchmark", "feeInventory", "opportunities", "verificationItems", "actions", "explanation"], "visibility", errors);
}

function validateStateCompatibility(projection: CanonicalCustomerReportProjectionV1, errors: string[]) {
  const state = projection.primaryState;
  if (state === "unable_to_analyze") {
    if (projection.coreMetrics.status !== "hidden") errors.push("unable_state_financial_metrics_visible");
    if (projection.effectiveRate.status !== "hidden") errors.push("unable_state_effective_rate_visible");
    if (projection.benchmark.status !== "hidden") errors.push("unable_state_benchmark_visible");
    if (projection.feeInventory.status !== "hidden") errors.push("unable_state_fee_inventory_visible");
    if (projection.opportunities.status !== "hidden") errors.push("unable_state_opportunity_visible");
    if (projection.verificationItems.status !== "hidden") errors.push("unable_state_verification_visible");
  }
  if (OPPORTUNITY_HIDDEN_STATES.has(state) && projection.opportunities.status !== "hidden") errors.push("opportunity_visible_in_hidden_state");
  if ((state === "analysis_limited" || state === "analysis_withheld") && projection.actions.some((action) => STRONG_ACTIONS.has(action.type))) errors.push("strong_action_visible_in_limited_state");
  if (state === "verified_benchmark_unavailable" && projection.headline.title.toLowerCase().includes("competitive")) errors.push("benchmark_unavailable_competitive_claim");
  if (!COMPETITIVE_STATES.has(state) && /\bcompetitive\b/i.test(`${projection.headline.title} ${projection.headline.body}`)) errors.push("competitive_language_without_competitive_state");
}

function validateSections(projection: CanonicalCustomerReportProjectionV1, errors: string[]) {
  if (projection.visibility.opportunities === "hidden" && projection.opportunities.status !== "hidden") errors.push("visibility_opportunity_mismatch");
  if (projection.visibility.opportunities !== "shown" && projection.opportunities.status === "shown") errors.push("hidden_opportunity_amounts_or_ids");
  if (projection.opportunities.status === "shown") {
    if (!projection.permissions.deterministic_opportunity.permitted && projection.opportunities.deterministicAmount) errors.push("deterministic_amount_without_permission");
    if (!projection.permissions.estimated_opportunity.permitted && projection.opportunities.estimatedAmount) errors.push("estimated_amount_without_permission");
    if (projection.opportunities.items.length === 0) errors.push("shown_opportunity_without_items");
  }
  if (projection.visibility.benchmark !== "shown" && projection.benchmark.status === "shown") errors.push("hidden_benchmark_conclusion");
  if (projection.benchmark.status === "shown" && !projection.permissions.benchmark.permitted) errors.push("benchmark_without_permission");
  if (projection.benchmark.status === "unavailable" && /\bcompetitive\b/i.test(projection.benchmark.customerMessage)) errors.push("benchmark_unavailable_competitive_claim");
  if (projection.verificationItems.status === "shown") {
    if (!projection.permissions.verification_amounts.permitted) errors.push("verification_without_permission");
    if (!/verify/i.test(projection.verificationItems.label) || /savings/i.test(projection.verificationItems.label)) errors.push("verification_labeled_as_savings");
    if (!/not treated as savings/i.test(projection.verificationItems.notSavingsCopy)) errors.push("verification_not_separated_from_savings");
  }
  if (projection.explanation.status === "shown" && !projection.permissions.customer_explanation.permitted) errors.push("explanation_without_permission");
  if (projection.explanation.source === "ai_enhanced" && !projection.permissions.ai_enhanced_narrative.permitted) errors.push("ai_narrative_without_permission");
  if (projection.explanation.status === "shown" && projection.explanation.source === "deterministic_fallback" && projection.explanation.sections.length === 0) errors.push("missing_deterministic_fallback");
  if (projection.feeInventory.status !== "hidden") {
    for (const row of projection.feeInventory.rows) {
      if (row.removabilityLevel === "confirmed_opportunity" && row.evidenceStatus !== "verified") errors.push("confirmed_fee_without_verified_evidence");
      if (row.removabilityLevel === "needs_verification" && row.status !== "verification_only" && row.status !== "unresolved") errors.push("verification_fee_marked_included");
    }
  }
  if (projection.opportunities.status === "shown") {
    for (const item of projection.opportunities.items) {
      if (item.removabilityLevel === "confirmed_opportunity" && item.certainty !== "verified") errors.push("confirmed_opportunity_not_verified");
      if (item.evidenceStatus === "needs_verification") errors.push("verification_item_in_opportunity_total");
    }
  }
  validateSectionLimitationCodes(projection, errors);
}

function validateSectionLimitationCodes(value: unknown, errors: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => validateSectionLimitationCodes(item, errors));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "limitationCodes") {
      if (!Array.isArray(nested) || nested.some((code) => !CUSTOMER_SECTION_LIMITATION_CODES.has(code))) {
        errors.push("unapproved_section_limitation_code");
      }
      continue;
    }
    validateSectionLimitationCodes(nested, errors);
  }
}

function validateLimitations(projection: CanonicalCustomerReportProjectionV1, errors: string[]) {
  if (!Array.isArray(projection.limitations)) {
    errors.push("limitations_not_array");
    return;
  }
  for (const limitation of projection.limitations) {
    if (!isApprovedCustomerLimitation(limitation)) errors.push("unmapped_customer_limitation");
  }
}

function validateCoreMath(projection: CanonicalCustomerReportProjectionV1, errors: string[]) {
  if (projection.coreMetrics.status !== "shown") return;
  const { transactionCount, averageTicket, processedVolume } = projection.coreMetrics;
  if (transactionCount.status === "shown") {
    if (!Number.isInteger(transactionCount.count.value) || transactionCount.count.value <= 0) errors.push("invalid_transaction_count");
    if (averageTicket.status !== "shown") errors.push("average_ticket_missing_with_transaction_count");
    if (averageTicket.status === "shown") {
      const expected = Math.round(processedVolume.amountMinor / transactionCount.count.value);
      if (averageTicket.amount.amountMinor !== expected || averageTicket.amount.currency !== processedVolume.currency) errors.push("average_ticket_does_not_reconstruct");
    }
  }
  if (averageTicket.status === "shown" && transactionCount.status !== "shown") errors.push("average_ticket_without_transaction_count");
  if (transactionCount.status === "unavailable" && !/unsafe|missing|unavailable|not_safe/.test(transactionCount.reasonCode)) errors.push("transaction_count_unavailable_without_reason");
}

function validateSourceMetadata(projection: CanonicalCustomerReportProjectionV1, errors: string[]) {
  const sources: unknown[] = [];
  if (projection.feeInventory.status !== "hidden") sources.push(...projection.feeInventory.rows.map((row) => row.source).filter(Boolean));
  if (projection.opportunities.status === "shown") sources.push(...projection.opportunities.items.map((item) => item.source));
  if (projection.verificationItems.status === "shown") sources.push(...projection.verificationItems.items.map((item) => item.source).filter(Boolean));

  for (const source of sources) {
    if (!isPlainObject(source)) {
      errors.push("source_metadata_missing");
      continue;
    }
    if (source.synthetic !== true) errors.push("source_not_synthetic");
    if (typeof source.title !== "string" || !/^Example /.test(source.title)) errors.push("source_title_not_synthetic");
    if (typeof source.effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(source.effectiveDate)) errors.push("source_effective_date_invalid");
    if (source.safeUrl !== null && (typeof source.safeUrl !== "string" || !/^https:\/\/example\.com\//.test(source.safeUrl))) errors.push("source_url_not_safe");
    rejectUnknownKeys(source, ["synthetic", "title", "effectiveDate", "safeUrl"], "source", errors);
  }
}

function validateActions(actions: CustomerActionProjection[], projection: CanonicalCustomerReportProjectionV1, errors: string[]) {
  if (!Array.isArray(actions)) {
    errors.push("actions_not_array");
    return;
  }
  if (!projection.permissions.actions.permitted && actions.length > 0) errors.push("actions_without_permission");
  for (const action of actions) {
    if (!CUSTOMER_ACTION_TYPES.includes(action.type)) errors.push("unsupported_action_type");
    if (STRONG_ACTIONS.has(action.type) && projection.opportunities.status !== "shown") errors.push("strong_action_without_opportunity");
  }
}

function rejectUnsafeContent(value: unknown, errors: string[], path = "projection") {
  if (typeof value === "string") {
    if (path === "projection.reportVersion" && value === CANONICAL_CUSTOMER_REPORT_PROJECTION_VERSION) return;
    if (path === "projection.projectionReadiness" && value === CANONICAL_CUSTOMER_REPORT_PROJECTION_READINESS) return;
    if (path === "projection.source" && value === "synthetic_fixture") return;
    if (path.endsWith(".displayId") && /^preview-[a-z0-9-]+$/i.test(value)) return;
    if (path.endsWith(".reasonCode") && isSafeCode(value)) return;
    if (path.endsWith(".reasonCodes[]") && isSafeCode(value)) return;
    if (path.endsWith(".limitationCodes[]") && isSafeCode(value)) return;
    if (containsForbiddenCustomerProjectionContent(value)) errors.push(`unsafe_content_${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => rejectUnsafeContent(item, errors, `${path}[]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (!KNOWN_DTO_KEYS.has(key)) errors.push(`unknown_field_${path}.${key}`);
    if (FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key))) errors.push(`unsafe_key_${path}.${key}`);
    rejectUnsafeContent(nested, errors, `${path}.${key}`);
  }
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`unknown_field_${path}.${key}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value) && !containsForbiddenCustomerProjectionContent(value);
}

export function containsForbiddenCustomerProjectionContent(value: string): boolean {
  return FORBIDDEN_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function financialReadinessForState(state: string, readiness: string) {
  if (state === "unable_to_analyze") return readiness === "unavailable" ? "unavailable" : "invalid";
  if (state === "analysis_withheld") return readiness === "withheld" ? "withheld" : "invalid";
  if (state === "analysis_limited") return readiness === "limited" ? "limited" : "invalid";
  return readiness === "verified" ? "ready" : "invalid";
}
