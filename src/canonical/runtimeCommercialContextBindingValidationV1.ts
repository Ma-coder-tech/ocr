import type { InternalAnalystFindingReportV1 } from "./internalAnalystFindingV1.js";

export const RUNTIME_COMMERCIAL_CONTEXT_BINDING_VALIDATION_V1 =
  "runtime_commercial_context_binding_validation_2026_09_12_v1" as const;

export const RUNTIME_COMMERCIAL_CONTEXT_BINDING_PRODUCT_AUTHORITY_V1 = {
  document: "Runtime Commercial Context-Binding Validation v1",
  sha256: "7e012b884dc2a38c8d48f16d52ac8e3504738259ab22f99a61f6217e9d149a6c",
} as const;

export type RuntimeCommercialContextSupportV1 =
  | "DIRECTLY_AVAILABLE"
  | "DERIVABLE_WITHOUT_INVENTION"
  | "PARTIAL"
  | "ABSENT"
  | "NOT_APPLICABLE";

export type RuntimeCommercialContextCapabilityV1 = {
  group: "current_merchant" | "alternative_commercial" | "comparison_arbitration";
  field: string;
  upstreamSource: string;
  runtimeStage: string;
  support: RuntimeCommercialContextSupportV1;
  deterministic: boolean;
  claimSpecific: boolean;
  safeForCommercialComparison: "yes" | "conditional" | "no";
  limitation: string | null;
  smallestCapabilityNeeded: string | null;
};

export type RuntimeCommercialComponentCapabilityV1 = {
  componentClass:
    | "per_authorization"
    | "gateway_transaction"
    | "gateway_batch"
    | "percentage_bps"
    | "fixed_monthly"
    | "episodic_chargeback";
  support: RuntimeCommercialContextSupportV1;
  disposition: "runtime_ready" | "runtime_partial" | "runtime_not_ready";
  comparisonStageReached: string;
  actionReadiness: string;
  failClosedReason: string | null;
  smallestCapabilityNeeded: string | null;
};

const cap = (
  group: RuntimeCommercialContextCapabilityV1["group"],
  field: string,
  upstreamSource: string,
  runtimeStage: string,
  support: RuntimeCommercialContextSupportV1,
  deterministic: boolean,
  claimSpecific: boolean,
  safeForCommercialComparison: RuntimeCommercialContextCapabilityV1["safeForCommercialComparison"],
  limitation: string | null = null,
  smallestCapabilityNeeded: string | null = null,
): RuntimeCommercialContextCapabilityV1 => ({
  group,
  field,
  upstreamSource,
  runtimeStage,
  support,
  deterministic,
  claimSpecific,
  safeForCommercialComparison,
  limitation,
  smallestCapabilityNeeded,
});

/**
 * Product-governed capability inventory. "Available" means available through
 * the normal statement -> canonical -> governed knowledge -> analyst path; a
 * value accepted only by a downstream synthetic constructor is not counted.
 */
export const RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1: RuntimeCommercialContextCapabilityV1[] = [
  cap("current_merchant", "current provider-controlled component", "canonical fee row plus commercial decomposition", "runtime comparison attachment", "DIRECTLY_AVAILABLE", true, true, "conditional", "Only reproduced per-item authorization/gateway families are extracted today.", "Add claim-specific extractors for other component classes."),
  cap("current_merchant", "exact amount/rate", "canonical billed amount and printed row arithmetic", "runtime current component", "DIRECTLY_AVAILABLE", true, true, "yes", "Whole-cent per-item prices only; percentage and sub-cent bridges are not implemented.", "Add unit-safe rate/basis bindings for non-per-item classes."),
  cap("current_merchant", "exact versus bounded economics", "commercial dollar attribution", "runtime current component currentAmount.state", "DIRECTLY_AVAILABLE", true, true, "yes"),
  cap("current_merchant", "economic layer", "governed commercial decomposition", "runtime current component and merchant permission revalidation", "DIRECTLY_AVAILABLE", true, true, "yes"),
  cap("current_merchant", "controller/participant role", "governed participant and commercial-control evidence", "merchant permission controlState", "PARTIAL", true, true, "conditional", "Control state is bound, but collector, beneficiary, rule setter, underlying price setter, and merchant-facing price controller are not all carried into the commercial candidate.", "Bind the existing governed participant-role object by fee-row reference."),
  cap("current_merchant", "service identity", "component kind plus governed economic layer", "merchant permission candidate", "DERIVABLE_WITHOUT_INVENTION", true, true, "yes", "Derivation exists only for authorization and gateway transaction/batch services.", "Add governed service mappings for each additional component class."),
  cap("current_merchant", "pricing basis", "printed mechanic, normalized unit, and population", "runtime current component", "DIRECTLY_AVAILABLE", true, true, "conditional", "Per-item basis is available; percentage denominator basis is not bound.", "Bind the exact canonical volume population and denominator for percentage components."),
  cap("current_merchant", "population identity", "printed label, governed population, and unit", "runtime and merchant permission population gates", "DERIVABLE_WITHOUT_INVENTION", true, true, "conditional", "Generic authorization populations are safe only against generic authorization populations; explicit settled/attempt/approved populations must remain distinct.", "Preserve explicit population subtype through the runtime component."),
  cap("current_merchant", "population quantity", "canonical printed row arithmetic", "runtime current component", "DIRECTLY_AVAILABLE", true, true, "yes", "Available only when the row prints and reproduces an exact per-item count.", "Add exact event/basis bindings for other classes."),
  cap("current_merchant", "card/program identity", "printed row label", "runtime current component cardBrandScope", "PARTIAL", true, true, "conditional", "Network brand is derived; product/program identity generally is not.", "Bind governed card/program identity when the comparison requires it."),
  cap("current_merchant", "channel", "merchant context or explicit row wording", "runtime merchant facts and current component", "PARTIAL", true, true, "conditional", "A statement may establish mixed or unknown activity without the component-level CP/CNP split.", "Bind a component-specific CP/CNP population split."),
  cap("current_merchant", "cadence", "governed recurrence plus statement occurrence", "merchant permission candidate", "PARTIAL", true, true, "conditional", "Monthly/current-period/unknown is available downstream, but current comparison extraction does not support fixed monthly or episodic components.", "Carry cadence into a supported fixed/episodic current component."),
  cap("current_merchant", "statement period", "canonical statement identity", "runtime attachment statement", "DIRECTLY_AVAILABLE", true, false, "yes"),
  cap("current_merchant", "current-component evidence binding", "canonical fee-row, arithmetic, and decomposition evidence refs", "internal commercial comparison finding", "DIRECTLY_AVAILABLE", true, true, "yes"),

  cap("alternative_commercial", "exact provider", "governed offer identity", "commercial component and internal finding", "DIRECTLY_AVAILABLE", false, true, "yes"),
  cap("alternative_commercial", "exact named offer", "governed offer composition", "commercial component and internal finding", "DIRECTLY_AVAILABLE", false, true, "yes"),
  cap("alternative_commercial", "distribution/sales channel", "governed offer identity", "internal finding alternative.salesChannel", "DIRECTLY_AVAILABLE", false, true, "yes"),
  cap("alternative_commercial", "product/service scope", "governed offer identity productScope", "merchant permission presentation group and service identity", "DERIVABLE_WITHOUT_INVENTION", false, true, "yes"),
  cap("alternative_commercial", "commercial component", "governed component version", "runtime alternative component ref", "DIRECTLY_AVAILABLE", false, true, "yes"),
  cap("alternative_commercial", "unit", "governed component version", "merchant permission alternative.unit", "DIRECTLY_AVAILABLE", false, true, "yes"),
  cap("alternative_commercial", "billing basis", "governed unit and billed population", "merchant permission alternative.billingBasis", "DERIVABLE_WITHOUT_INVENTION", false, true, "conditional", "Currently mirrors unit; percentage denominator semantics need a stronger bridge.", "Bind governed denominator vocabulary to canonical volume basis."),
  cap("alternative_commercial", "population definition", "governed billedPopulation", "merchant permission alternative.populationIdentity", "DERIVABLE_WITHOUT_INVENTION", false, true, "yes"),
  cap("alternative_commercial", "CP/CNP or other channel scope", "governed component/offer identity", "runtime alternative channel", "DERIVABLE_WITHOUT_INVENTION", false, true, "conditional", "Some components normalize to unknown channel.", "Admit or bind an explicit channel scope for the component."),
  cap("alternative_commercial", "card/program scope", "governed component identity and billed population", "runtime alternative brand scope", "PARTIAL", false, true, "conditional", "Brand family can be derived for admitted authorization components; finer program scope is not generally represented.", "Bind exact governed card/program scope."),
  cap("alternative_commercial", "effective period", "governed component/composition effective period plus source observation date", "runtime source-period gate", "DIRECTLY_AVAILABLE", false, true, "yes"),
  cap("alternative_commercial", "public policy status", "governed public-policy versions and predicates", "merchant permission applicability", "DIRECTLY_AVAILABLE", false, true, "conditional", "The status is available, but several predicates require merchant facts the normal merchant context does not yet carry.", "Bind the specific admitted policy predicate fact from merchant evidence."),
  cap("alternative_commercial", "qualification predicates", "governed offer composition", "runtime merchant-fact predicate evaluation", "DIRECTLY_AVAILABLE", false, true, "conditional", "Missing facts correctly produce unresolved qualification.", "Obtain the smallest missing admitted predicate fact."),
  cap("alternative_commercial", "approval/review status", "governed public policy and merchant-specific evidence", "merchant permission applicability", "PARTIAL", false, true, "conditional", "Public restriction/review is available; merchant-specific approval remains unknown unless independently supplied, and the normal statement path does not supply it.", "Bind merchant-specific approval evidence when available."),
  cap("alternative_commercial", "completeness/known/known-absent/unknown", "governed component completeness", "alternative candidate selection and commercial-fact path", "DIRECTLY_AVAILABLE", false, true, "yes"),
  cap("alternative_commercial", "governed evidence/source identity", "source observation and component version refs", "internal comparison evidence binding", "DIRECTLY_AVAILABLE", false, true, "yes"),

  cap("comparison_arbitration", "current-to-alternative component identity", "runtime component kind plus governed component identity", "runtime candidate selection and permission service gate", "DERIVABLE_WITHOUT_INVENTION", true, true, "conditional", "Implemented only for authorization and gateway transaction/batch families.", "Add an explicit component-class bridge for each new class."),
  cap("comparison_arbitration", "population compatibility", "current normalized population and alternative billed population", "permission revalidation population gate", "DERIVABLE_WITHOUT_INVENTION", true, true, "conditional", "Explicit population subtypes require preservation; unknown or mismatched bases must fail closed.", "Carry exact current population subtype through the runtime component."),
  cap("comparison_arbitration", "channel compatibility", "current merchant/component channel and governed alternative channel", "runtime and permission channel gates", "DERIVABLE_WITHOUT_INVENTION", true, true, "yes"),
  cap("comparison_arbitration", "billing-basis compatibility", "current unit and governed alternative unit", "permission unitBillingBasis gate", "DERIVABLE_WITHOUT_INVENTION", true, true, "conditional", "Unit equality is available; percentage denominator compatibility is absent.", "Add an exact denominator/basis gate."),
  cap("comparison_arbitration", "offer/scope identity", "governed composition and component offer identity", "permission presentation group", "DIRECTLY_AVAILABLE", false, true, "yes"),
  cap("comparison_arbitration", "same-scope offsets", "governed offer composition sibling components", "merchant permission offsetState", "DERIVABLE_WITHOUT_INVENTION", false, true, "conditional", "The normal path can identify incomplete scope but cannot infer missing offsets.", "Admit complete same-scope commercial components or retain incomplete."),
  cap("comparison_arbitration", "direction of matched comparison", "exact matched component arithmetic", "internal finding and permission decision", "DIRECTLY_AVAILABLE", true, true, "yes"),
  cap("comparison_arbitration", "evidence strength/claim ceiling", "diagnostic comparison strength, finding evidence, and permission gates", "internal finding and merchant permission", "PARTIAL", true, true, "conditional", "The report-set normal call currently falls back to medium/unresolved context instead of a first-class runtime evidence-strength binding.", "Bind claim-specific evidence strength into report-set candidate context."),
  cap("comparison_arbitration", "invalidating VERIFY dependency", "relationship between an unresolved merchant fact and a specific review", "report-set arbitration input", "ABSENT", true, true, "no", "The arbitration accepts this relationship, but the normal runtime does not construct it.", "Generate an evidence-bound verifyCandidateId to reviewCandidateId dependency."),
  cap("comparison_arbitration", "dispute/risk overlap", "canonical dispute/risk findings plus commercial event identity", "report-set arbitration existingRisk input", "PARTIAL", true, true, "no", "Canonical risk may exist, but the normal path does not bind it to commercial candidate IDs.", "Add a same-event evidence link without creating a new dispute model."),
  cap("comparison_arbitration", "consolidation compatibility", "component, population, channel, program, offer, and pricing identity", "report-set candidate context", "PARTIAL", true, true, "conditional", "Upstream facts exist for supported authorization attempts, but normal report construction uses fallback unresolved channel/program fields.", "Build report-set candidate contexts from runtime candidates."),
  cap("comparison_arbitration", "report-level named-offer grouping", "provider, named offer, distribution, and product scope", "permission presentation group and report-set offer coherence", "DERIVABLE_WITHOUT_INVENTION", false, true, "yes"),
  cap("comparison_arbitration", "merchant-verifiable smallest unlocker", "first failed evidence gate or admitted predicate boundary", "runtime attempt and merchant-safe blocker", "DIRECTLY_AVAILABLE", true, true, "yes", "Generic fallback wording remains when a predicate does not identify its missing fact.", "Emit the exact missing governed predicate field when available."),
];

export const RUNTIME_COMMERCIAL_COMPONENT_CAPABILITIES_V1: RuntimeCommercialComponentCapabilityV1[] = [
  {
    componentClass: "per_authorization",
    support: "PARTIAL",
    disposition: "runtime_partial",
    comparisonStageReached: "Normal Fiserv parsing can establish exact provider-controlled rows, exact counts, channel/brand scope, governed alternatives, and matched-component arithmetic.",
    actionReadiness: "Permission and report arbitration run, but normal-path public-policy facts, complete commercial denominator/offset scope, and first-class arbitration context may still block merchant pricing review.",
    failClosedReason: "A matched internal component comparison does not by itself authorize REVIEW_CURRENT_PRICING.",
    smallestCapabilityNeeded: "Bind claim-specific public-policy facts, complete same-scope economics/offsets, and report-set context from runtime evidence.",
  },
  {
    componentClass: "gateway_transaction",
    support: "PARTIAL",
    disposition: "runtime_partial",
    comparisonStageReached: "The runtime and governed Authorize.net evidence define the exact gateway transaction unit and enforce gateway-only scope.",
    actionReadiness: "No generalized current-period supported Fiserv fixture currently establishes the required gateway service identity and population through the normal extractor.",
    failClosedReason: "Gateway evidence cannot be treated as acquiring economics or matched without a current gateway component.",
    smallestCapabilityNeeded: "A statement-evidenced gateway transaction component with exact event population and service identity.",
  },
  {
    componentClass: "gateway_batch",
    support: "PARTIAL",
    disposition: "runtime_partial",
    comparisonStageReached: "The runtime and governed Authorize.net evidence define a per-batch component and settled-batch population.",
    actionReadiness: "Normal statement extraction has not proven an exact current gateway-batch component and cadence/service binding.",
    failClosedReason: "Ordinary acquiring batch fees cannot be assumed to be gateway batch fees.",
    smallestCapabilityNeeded: "Exact current gateway service and settled-batch population evidence.",
  },
  {
    componentClass: "percentage_bps",
    support: "ABSENT",
    disposition: "runtime_not_ready",
    comparisonStageReached: "Canonical rows may preserve printed rates and amounts, and governed alternatives contain bps components.",
    actionReadiness: "No runtime component extraction or exact denominator/basis bridge exists.",
    failClosedReason: "Matching percentage values cannot establish a common gross/net/submitted/refund-adjusted population.",
    smallestCapabilityNeeded: "An exact claim-specific denominator and volume-population compatibility bridge.",
  },
  {
    componentClass: "fixed_monthly",
    support: "ABSENT",
    disposition: "runtime_not_ready",
    comparisonStageReached: "Canonical fee identity and some recurrence evidence may exist; governed monthly components exist.",
    actionReadiness: "Fixed monthly rows are not emitted as runtime current comparison components.",
    failClosedReason: "One observed charge does not establish service identity or recurring cadence.",
    smallestCapabilityNeeded: "Bind exact service identity, provider control, and monthly cadence from statement evidence.",
  },
  {
    componentClass: "episodic_chargeback",
    support: "ABSENT",
    disposition: "runtime_not_ready",
    comparisonStageReached: "Canonical dispute counts and fee identity may exist separately; governed chargeback components exist.",
    actionReadiness: "No normal-path bridge binds the charged fee to the exact chargeback event population.",
    failClosedReason: "Statement-level chargebacks, fee lines, reversals, and dispute-risk findings cannot be assumed to concern the same events.",
    smallestCapabilityNeeded: "A same-event fee/count identity link using existing canonical evidence.",
  },
];

export type RuntimeCommercialContextBindingObservationV1 = {
  validationVersion: typeof RUNTIME_COMMERCIAL_CONTEXT_BINDING_VALIDATION_V1;
  productAuthority: typeof RUNTIME_COMMERCIAL_CONTEXT_BINDING_PRODUCT_AUTHORITY_V1;
  mode: "offline_validation_only";
  statementRef: string;
  statementPeriod: { start: string; end: string } | null;
  fieldCapabilities: RuntimeCommercialContextCapabilityV1[];
  componentCapabilities: RuntimeCommercialComponentCapabilityV1[];
  observed: {
    currentComponents: number;
    exactCurrentComponents: number;
    boundedCurrentComponents: number;
    matchedComparisons: number;
    blockedComparisons: number;
    comparisonsWithThreeEvidenceBindings: number;
    merchantPermissionDecisions: number;
    pricingReviewActions: number;
    reportSetLedgerEntries: number;
    reportSetPlacedItems: number;
    invalidatingVerifyDependenciesConstructedByNormalPath: 0;
    disputeRiskLinksConstructedByNormalPath: 0;
  };
  conclusion: {
    runtimeReady: string[];
    runtimePartial: string[];
    runtimeNotReady: string[];
    answer: "YES_FOR_SOME_NOT_ALL" | "NO_FULL_COMPONENT_CLASS_YET";
  };
  permissions: {
    customerRoutingAllowed: false;
    canonicalMutationAllowed: false;
    commercialSourceMutationAllowed: false;
    aiOrWebAllowed: false;
  };
};

export function observeRuntimeCommercialContextBindingV1(
  report: InternalAnalystFindingReportV1,
): RuntimeCommercialContextBindingObservationV1 {
  const attachment = report.commercialComparisonAttachment;
  const projection = report.merchantCommercialFindingShadowProjection;
  const arbitration = report.commercialReportSetOfflineIntegration;
  const componentCapabilities = structuredClone(RUNTIME_COMMERCIAL_COMPONENT_CAPABILITIES_V1);
  const runtimeReady = componentCapabilities.filter((item) => item.disposition === "runtime_ready").map((item) => item.componentClass);
  const runtimePartial = componentCapabilities.filter((item) => item.disposition === "runtime_partial").map((item) => item.componentClass);
  const runtimeNotReady = componentCapabilities.filter((item) => item.disposition === "runtime_not_ready").map((item) => item.componentClass);
  const placed = arbitration.commercialPlacement.priorityFindings.length
    + arbitration.commercialPlacement.questionsToResolve.length
    + arbitration.commercialPlacement.supportingDetails.length;
  return deepFreeze({
    validationVersion: RUNTIME_COMMERCIAL_CONTEXT_BINDING_VALIDATION_V1,
    productAuthority: RUNTIME_COMMERCIAL_CONTEXT_BINDING_PRODUCT_AUTHORITY_V1,
    mode: "offline_validation_only",
    statementRef: report.statementRef,
    statementPeriod: report.statementPeriod,
    fieldCapabilities: structuredClone(RUNTIME_COMMERCIAL_CONTEXT_CAPABILITY_MATRIX_V1),
    componentCapabilities,
    observed: {
      currentComponents: attachment.deterministicBaseline.currentProviderControlledComponents.length,
      exactCurrentComponents: attachment.deterministicBaseline.currentProviderControlledComponents.filter((item) => item.currentAmount.state === "EXACT").length,
      boundedCurrentComponents: attachment.deterministicBaseline.currentProviderControlledComponents.filter((item) => item.currentAmount.state === "UPPER_BOUND").length,
      matchedComparisons: attachment.attempts.filter((item) => item.comparisonPerformed).length,
      blockedComparisons: attachment.attempts.filter((item) => item.result === "COMPARISON_UNAVAILABLE").length,
      comparisonsWithThreeEvidenceBindings: attachment.attempts.filter((item) => item.comparisonPerformed
        && Boolean(item.finding.comparisonEvidenceBinding?.currentComponentEvidenceRefs.length)
        && Boolean(item.finding.comparisonEvidenceBinding?.alternativeComponentEvidenceRefs.length)
        && Boolean(item.finding.comparisonEvidenceBinding?.matchedPopulationEvidenceRefs.length)).length,
      merchantPermissionDecisions: projection.decisions.length,
      pricingReviewActions: projection.decisions.filter((item) => item.action.permitted).length,
      reportSetLedgerEntries: arbitration.selectionLedger.length,
      reportSetPlacedItems: placed,
      invalidatingVerifyDependenciesConstructedByNormalPath: 0,
      disputeRiskLinksConstructedByNormalPath: 0,
    },
    conclusion: {
      runtimeReady,
      runtimePartial,
      runtimeNotReady,
      answer: runtimeReady.length > 0 ? "YES_FOR_SOME_NOT_ALL" : "NO_FULL_COMPONENT_CLASS_YET",
    },
    permissions: {
      customerRoutingAllowed: false,
      canonicalMutationAllowed: false,
      commercialSourceMutationAllowed: false,
      aiOrWebAllowed: false,
    },
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
