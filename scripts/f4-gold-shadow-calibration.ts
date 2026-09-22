import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parsePdf, type ParsedDocument } from "../src/parser.js";
import type { BusinessTypeId } from "../src/businessTypes.js";
import { buildCanonicalStatementFactsFromParsedDocument } from "../src/canonical/buildCanonicalFacts.js";
import { buildCanonicalCustomerActionGuidance } from "../src/canonical/customerActionGuidance.js";
import { validateCanonicalStatementAnalysis } from "../src/canonical/validate.js";
import { evaluateF4Shadow, type F4LegacyComparison, type F4ShadowDecision } from "../src/claimAuthorityF4/shadow.js";
import { consumeInternalFeeSemantics } from "../src/claimAuthorityF4/observedFeeComponentConsumer.js";
import { applyPackageECustomerStateAuthorityCutover } from "../src/claimAuthorityF4/packageECustomerStateAuthorityReadBoundary.js";
import {
  authorityBackedPricingEvidenceCopyEligible,
  buildProductionReportProjection,
} from "../src/canonical/productionReportProjection.js";

// These are existing repository observations, not authenticated Gold source mappings.
// Names stay local to the loader and never enter the privacy-safe result.
const fixtures = [
  { caseId: "G1", file: "fiserv_NXGEN_PAYMENT_SERVICES_jan_2022.pdf", businessType: "other" },
  { caseId: "G2", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Oct_2025.pdf", businessType: "ecommerce" },
  { caseId: "G3", file: "fiserv_PAYSAFE_PHILIP_FUTURMARKET_Sep_2025_zero_volume.pdf", businessType: "ecommerce" },
  { caseId: "G4", file: "fiserv_WELLS_FARGO_EL_NUEVO_TEQUILA_Sep_2024.pdf", businessType: "restaurant_food_beverage" },
  { caseId: "G5", file: "fiserv_BASYS_JEFES_TACOS_Mar_2020.pdf", businessType: "restaurant_food_beverage" },
  { caseId: "G7", file: "fiserv_ABDUL_BASHER_Aug_2025.pdf", businessType: "retail" },
  { caseId: "G8", file: "fiserv_PRIORITY_PAYMENT_SYSTEMS_Dec_2024.pdf", businessType: "restaurant_food_beverage" },
] as const satisfies ReadonlyArray<{ caseId: string; file: string; businessType: BusinessTypeId }>;

const semanticAnchors: Record<string, Record<string, "supported" | "refused" | "unresolved">> = {
  G1: { "G1-PRICE-UNDERLYING": "supported", "G1-NO-EXACT-OWNER": "refused" },
  G2: { "G2-MARKUP-SPLIT": "unresolved", "G2-NO-EXACT-MARKUP": "refused", "G2-NO-NQUAL-SAVINGS": "refused" },
  G3: { "G3-MINIMUM-FEE": "supported", "G3-NO-RECURRENCE": "refused", "G3-NO-NUMERIC-RATE": "refused" },
  G4: { "G4-NO-EXACT-OWNER": "refused", "G4-NO-ZERO-MARKUP": "refused", "G4-NO-WATS-PROFIT": "refused" },
  G5: { "G5-MARKUP": "unresolved", "G5-NO-EXACT-MARKUP": "refused",
    "G5-KEYED-DOWNGRADE-COUNTERFACTUAL": "supported", "G5-NO-FULL-AVOIDABLE": "refused" },
  G7: { "G7-NO-EXACT-OWNER": "refused", "G7-NO-FUTURE-CURRENT": "refused" },
  G8: { "G8-MARKUP-SPLIT": "unresolved", "G8-NO-MARGIN": "refused",
    "G8-NO-SAVINGS": "refused", "G8-NO-BUNDLED-BENCHMARK": "refused" },
};

type Count = Record<string, number>;
function counts(values: string[]): Count {
  const result: Count = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function materialGroups(comparisons: F4LegacyComparison[], decisions: F4ShadowDecision[]) {
  const byKey = new Map(decisions.map((item) => [item.key, item]));
  const groups = new Map<string, {
    dimension: string; semanticCode: string; basis: string; currentStatus: string; shadowStatus: string;
    relation: string; reasonCodes: string[]; missingGates: string[]; missingFacets: string[];
    missingLanes: string[][]; count: number;
  }>();
  for (const comparison of comparisons) {
    if (comparison.relation === "agreement") continue;
    const decision = byKey.get(comparison.decisionKey);
    if (!decision) throw new Error("F4 calibration decision/comparison mismatch");
    const entry = {
      dimension: decision.dimension, semanticCode: decision.semanticCode,
      basis: comparison.comparisonBasis, currentStatus: comparison.currentStatus,
      shadowStatus: comparison.shadowStatus, relation: comparison.relation,
      reasonCodes: comparison.reasonCodes, missingGates: decision.missingGates,
      missingFacets: decision.missingFacets, missingLanes: decision.missingLanes,
    };
    const key = JSON.stringify(entry);
    const prior = groups.get(key);
    groups.set(key, { ...entry, count: (prior?.count ?? 0) + 1 });
  }
  return [...groups.values()].sort((a, b) => a.dimension.localeCompare(b.dimension)
    || a.semanticCode.localeCompare(b.semanticCode) || a.relation.localeCompare(b.relation));
}

const catalogBytes = readFileSync(new URL("../test/fixtures/gold-contract/gold-catalog-v0.3.final.json", import.meta.url));
const catalog = JSON.parse(catalogBytes.toString("utf8")) as { schema_version: string; cases: Array<{
  case_id: string; case_kind: string; source: { availability: string; provenance_status: string };
}> };
if (catalog.schema_version !== "ratereveal_gold_catalog_final_v3") throw new Error("F4 Gold catalog version drift");
const registerBytes = readFileSync(new URL("../test/fixtures/gold-contract/gold-authority-derivability-v1.json", import.meta.url));
const register = JSON.parse(registerBytes.toString("utf8")) as { schemaVersion: string; assertions: Array<{
  assertionId: string; caseId: string; resolution: { semanticStatus: string };
  provenance: { sourceExecutionStatus: string };
}> };
if (register.schemaVersion !== "ratereveal_gold_authority_derivability_register_v1")
  throw new Error("F4 Gold authority register version drift");

const cases = [];
for (const fixture of fixtures) {
  const gold = catalog.cases.find((item) => item.case_id === fixture.caseId);
  if (!gold || gold.case_kind !== "real_statement" || gold.source.availability !== "requires_human_review")
    throw new Error(`F4 Gold source state changed for ${fixture.caseId}`);
  const anchors = Object.entries(semanticAnchors[fixture.caseId]).map(([assertionId, expected]) => {
    const assertion = register.assertions.find((item) => item.assertionId === assertionId && item.caseId === fixture.caseId);
    if (!assertion || assertion.resolution.semanticStatus !== expected
      || assertion.provenance.sourceExecutionStatus !== "not_source_executable")
      throw new Error(`F4 Gold semantic anchor drift: ${assertionId}`);
    return { assertionId, semanticStatus: expected, sourceExecutionStatus: assertion.provenance.sourceExecutionStatus };
  });
  const originalLog = console.log;
  const originalWarn = console.warn;
  let document: ParsedDocument;
  try {
    // The PDF parser prints progress and font diagnostics; keep the result valid JSON.
    console.log = () => {};
    console.warn = () => {};
    document = await parsePdf(fileURLToPath(new URL(`../test/fixtures/pdfs/${fixture.file}`, import.meta.url)));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  const analysis = buildCanonicalStatementFactsFromParsedDocument(document, {
    sourceFileName: fixture.file, businessType: fixture.businessType,
  });
  const canonicalBefore = JSON.stringify(analysis);
  const reportProjectionBefore = JSON.stringify(buildProductionReportProjection(analysis));
  const report = evaluateF4Shadow({ analysis });
  const internalSemantics = consumeInternalFeeSemantics(analysis);
  if (JSON.stringify(analysis) !== canonicalBefore)
    throw new Error(`Internal F4 consumption changed canonical money or downstream state for ${fixture.caseId}`);
  if (JSON.stringify(buildProductionReportProjection(analysis)) !== reportProjectionBefore)
    throw new Error(`Internal F4 consumption changed canonical report projection for ${fixture.caseId}`);
  const internal = internalSemantics.observedFeeComponents;
  const internalMarkup = internalSemantics.processorMarkup;
  if (internal.status !== "available" || internal.legacyComparison.excludedAndSupported !== 0
    || internal.rows.some((row) => row.status !== report.decisions.find((decision) =>
      decision.feeRowId === row.feeRowId && decision.semanticCode === "merchant_facing_fee_component")?.status))
    throw new Error(`Internal observed fee-component consumer diverged for ${fixture.caseId}`);
  const selectedMarkup = analysis.feeOwnershipActionability.rowClassifications
    .filter((item) => item.selected.category === "processor_markup");
  if (internalMarkup.status !== "available" || internalMarkup.comparison.legacySelected !== selectedMarkup.length
    || internalMarkup.rows.some((row) => {
      const decisions = report.decisions.filter((decision) => decision.feeRowId === row.feeRowId
        && decision.semanticCode === "processor_markup" && decision.dimension === "economic_broad_category");
      return decisions.length !== 1 || row.status !== decisions[0].status
        || row.legacyCandidateId !== selectedMarkup.find((item) => item.feeRowId === row.feeRowId)?.selected.candidateId;
    })) throw new Error(`Internal processor-markup authority diverged for ${fixture.caseId}`);
  if (internalMarkup.comparison.supported !== 0 || internalMarkup.comparison.unknown !== 0)
    throw new Error(`Unexpected positive or unknown processor-markup authority for ${fixture.caseId}`);
  const attentionShadow = internalSemantics.merchantAttentionMarkupShadow;
  if (attentionShadow.status !== "available"
    || attentionShadow.summary.legacyMarkupRows !== selectedMarkup.length
    || attentionShadow.summary.authorityExceeding !== selectedMarkup.length
    || attentionShadow.summary.agreement !== 0 || attentionShadow.summary.noAttentionItem !== 0
    || attentionShadow.summary.observedComponentSupported !== selectedMarkup.length
    || attentionShadow.rows.some((row) => row.guidanceStatus !== "authority_exceeding"
      || row.f4.processorMarkup.status !== "refused" || row.f4.actionability.status !== "refused"
      || row.f4.economicBeneficiary.status !== "unknown" || row.f4.contractualController.status !== "unknown"
      || row.f4.observedFeeComponent.status !== "supported"
      || row.currentAttention?.attentionType !== "potential_negotiation"
      || row.currentAttention.actionType !== "request_pricing_review"
      || row.authorityBackedSemantics.potentialNegotiation !== "not_established"
      || row.authorityBackedSemantics.observedFeeComponent !== "supported"
      || row.authorityBackedSemantics.economicBeneficiary !== "unknown"
      || row.authorityBackedSemantics.contractualController !== "unknown"
      || row.authorityBackedSemantics.merchantFacingPriceController !== "unknown"
      || row.authorityBackedSemantics.actionability !== "not_established"
      || row.neutralFallbackCandidate?.feeMeaning !== "observed_fee_component"))
    throw new Error(`Merchant-attention markup shadow diverged for ${fixture.caseId}`);
  const internalRetirement = {
    negotiationNotEstablished: attentionShadow.rows.filter((row) => row.authorityBackedSemantics.potentialNegotiation === "not_established").length,
    observedComponentSupported: attentionShadow.rows.filter((row) => row.authorityBackedSemantics.observedFeeComponent === "supported").length,
    ownerUnknown: attentionShadow.rows.filter((row) => row.authorityBackedSemantics.economicBeneficiary === "unknown").length,
    contractualControllerUnknown: attentionShadow.rows.filter((row) => row.authorityBackedSemantics.contractualController === "unknown").length,
    priceControllerUnknown: attentionShadow.rows.filter((row) => row.authorityBackedSemantics.merchantFacingPriceController === "unknown").length,
    actionabilityNotEstablished: attentionShadow.rows.filter((row) => row.authorityBackedSemantics.actionability === "not_established").length,
  };
  const customerFacingCopyCutover = {
    eligibleRows: attentionShadow.rows.filter(authorityBackedPricingEvidenceCopyEligible).length,
  };
  const packageERead = internalSemantics.packageECustomerStateAuthorityReadBoundary;
  if (packageERead.status !== "available"
    || packageERead.summary.gatedRows !== selectedMarkup.length
    || packageERead.summary.modeledRows !== selectedMarkup.length
    || packageERead.summary.unmatchedRows !== 0
    || packageERead.summary.positiveOpportunityAuthority !== 0
    || packageERead.summary.positiveSavingsAuthority !== 0
    || packageERead.summary.eligibleSavingsAmountMinor !== 0
    || packageERead.rows.some((row) => row.legacyComparison.packageE.kind !== "fee_row_review"
      || row.legacyComparison.packageE.ownership.economicBeneficiary !== "processor"
      || row.legacyComparison.packageE.ownership.contractualController !== "processor"
      || row.legacyComparison.packageE.actionabilityCeiling !== "potentially_actionable"
      || row.legacyComparison.packageE.eligibility !== "verification_only"
      || row.legacyComparison.preliminaryActionTypes.join(",") !== "verify_charge"
      || row.authorityBacked.ownership.collector !== "unknown"
      || row.authorityBacked.ownership.economicBeneficiary !== "unknown"
      || row.authorityBacked.ownership.contractualController !== "unknown"
      || row.authorityBacked.actionability !== "not_established"
      || row.authorityBacked.opportunityKind !== "fee_row_review"
      || row.authorityBacked.verificationStanding !== "verification_only_evidence_review"
      || row.authorityBacked.neutralPreliminaryActionCandidate !== "request_explanation"
      || row.authorityBacked.opportunityAuthority !== "none_not_established"
      || row.authorityBacked.savingsAuthority !== "none_not_established"
      || row.authorityBacked.eligibleSavings.amountMinor !== 0
      || JSON.stringify(row.authorityBacked.observedAmount) !== JSON.stringify(row.legacyComparison.packageE.observedAmount)
      || JSON.stringify(row.authorityBacked.evidenceRefs) !== JSON.stringify(row.legacyComparison.packageE.evidenceRefs)
      || row.predictedCutover.verificationOnlyObservedAmount.changed
      || row.predictedCutover.excludedObservedAmount.changed
      || row.predictedCutover.totalEligibleAnnualAmount.changed
      || row.predictedCutover.masterSavingsAnnualAmount.changed
      || row.predictedCutover.customerStateClassification.changed
      || row.predictedCutover.permissions.changed
      || row.predictedCutover.visibleVerification.changed
      || row.predictedCutover.preliminaryActionTypes.legacy.join(",") !== "verify_charge"
      || row.predictedCutover.preliminaryActionTypes.predicted.join(",") !== "request_explanation"))
    throw new Error(`Package E/customer-state authority read boundary diverged for ${fixture.caseId}`);
  if (!packageERead.statement
    || packageERead.statement.predictedCutover.verificationOnlyObservedAmount.changed
    || packageERead.statement.predictedCutover.excludedObservedAmount.changed
    || packageERead.statement.predictedCutover.totalEligibleAnnualAmount.changed
    || packageERead.statement.predictedCutover.masterSavingsAnnualAmount.changed
    || packageERead.statement.predictedCutover.customerStateClassification.changed
    || packageERead.statement.predictedCutover.permissions.changed
    || packageERead.statement.predictedCutover.visibleVerification.changed)
    throw new Error(`Package E/customer-state predicted statement diagnostics diverged for ${fixture.caseId}`);
  const packageEAuthorityReadBoundary = {
    ...packageERead.summary,
    legacyVerifyCharge: packageERead.rows.filter((row) => row.legacyComparison.preliminaryActionTypes.includes("verify_charge")).length,
    predictedRequestExplanation: packageERead.rows.filter((row) =>
      row.predictedCutover.preliminaryActionTypes.predicted.includes("request_explanation")).length,
    statementVerificationTotalsChanged: packageERead.statement.predictedCutover.verificationOnlyObservedAmount.changed ? 1 : 0,
    statementCustomerStateChanged: packageERead.statement.predictedCutover.customerStateClassification.changed ? 1 : 0,
    statementPermissionsChanged: packageERead.statement.predictedCutover.permissions.changed ? 1 : 0,
    statementVisibilityChanged: packageERead.statement.predictedCutover.visibleVerification.changed ? 1 : 0,
  };
  const liveAnalysis = validateCanonicalStatementAnalysis(applyPackageECustomerStateAuthorityCutover({
    analysis,
    authorityReadBoundary: packageERead,
  }));
  const gatedComponentIds = new Set(packageERead.rows.map((row) => row.opportunityComponentId));
  const liveComponents = liveAnalysis.opportunityEngine.components.filter((component) => gatedComponentIds.has(component.id));
  const livePreliminaryActions = buildCanonicalCustomerActionGuidance({
    opportunityEngine: liveAnalysis.opportunityEngine,
    classifications: liveAnalysis.feeOwnershipActionability.rowClassifications,
  }).filter((action) => action.verificationComponentRefs.some((id) => gatedComponentIds.has(id)));
  const liveFinalActions = liveAnalysis.customerState.actionGuidance
    .filter((action) => action.verificationComponentRefs.some((id) => gatedComponentIds.has(id)));
  const packageELiveCutover = {
    gatedRows: packageERead.rows.length,
    cutoverRows: liveComponents.filter((component) =>
      component.ownership.collector === "unknown"
      && component.ownership.economicBeneficiary === "unknown"
      && component.ownership.contractualController === "unknown"
      && component.actionabilityCeiling === "unknown"
      && component.kind === "fee_row_review"
      && component.eligibility === "verification_only"
      && component.inclusionStatus === "excluded"
      && component.exclusionReasonCodes.join(",") === "authority_gated_unresolved_evidence_review").length,
    observedAmountPreserved: liveComponents.filter((component) => {
      const legacy = analysis.opportunityEngine.components.find((item) => item.id === component.id);
      return JSON.stringify(component.observedAmount) === JSON.stringify(legacy?.observedAmount);
    }).length,
    evidencePreserved: liveComponents.filter((component) => {
      const legacy = analysis.opportunityEngine.components.find((item) => item.id === component.id);
      return JSON.stringify(component.evidenceRefs) === JSON.stringify(legacy?.evidenceRefs);
    }).length,
    noTargetOrCalculation: liveComponents.filter((component) => component.target.type === "none"
      && component.calculation.calculationRef === null && component.calculation.result === null).length,
    preliminaryRequestExplanation: livePreliminaryActions.filter((action) => action.actionType === "request_explanation"
      && action.opportunityComponentRefs.length === 0).length,
    visibleFinalRequestExplanation: liveFinalActions.filter((action) => action.actionType === "request_explanation"
      && action.opportunityComponentRefs.length === 0).length,
    verificationTotalChanged: Number(JSON.stringify(liveAnalysis.opportunityEngine.summary.verificationOnlyObservedAmount)
      !== JSON.stringify(analysis.opportunityEngine.summary.verificationOnlyObservedAmount)),
    excludedTotalChanged: Number(JSON.stringify(liveAnalysis.opportunityEngine.summary.excludedObservedAmount)
      !== JSON.stringify(analysis.opportunityEngine.summary.excludedObservedAmount)),
    eligibleTotalChanged: Number(JSON.stringify(liveAnalysis.opportunityEngine.summary.totalEligibleAnnualAmount)
      !== JSON.stringify(analysis.opportunityEngine.summary.totalEligibleAnnualAmount)),
    masterSavingsChanged: Number(JSON.stringify(liveAnalysis.opportunityEngine.summary.masterSavingsAnnualAmount)
      !== JSON.stringify(analysis.opportunityEngine.summary.masterSavingsAnnualAmount)),
    customerStateClassificationChanged: Number(JSON.stringify({
      primaryState: liveAnalysis.customerState.primaryState, axes: liveAnalysis.customerState.axes,
    }) !== JSON.stringify({ primaryState: analysis.customerState.primaryState, axes: analysis.customerState.axes })),
    permissionsChanged: Number(JSON.stringify(liveAnalysis.customerState.permissions) !== JSON.stringify(analysis.customerState.permissions)),
    visibilityChanged: Number(JSON.stringify(liveAnalysis.customerState.visibility) !== JSON.stringify(analysis.customerState.visibility)),
    packageDChanged: Number(JSON.stringify(liveAnalysis.feeOwnershipActionability) !== JSON.stringify(analysis.feeOwnershipActionability)),
    canonicalFinancialsChanged: Number(JSON.stringify(liveAnalysis.financialFacts) !== JSON.stringify(analysis.financialFacts)
      || JSON.stringify(liveAnalysis.feeLedger) !== JSON.stringify(analysis.feeLedger)),
    merchantAttentionChanged: Number(JSON.stringify(liveAnalysis.merchantAttention) !== JSON.stringify(analysis.merchantAttention)),
    positiveOpportunityLinks: livePreliminaryActions.filter((action) => action.opportunityComponentRefs.length > 0).length,
    positiveEligibleSavingsAmountMinor: liveComponents
      .filter((component) => component.inclusionStatus === "included")
      .reduce((sum, component) => sum + (component.calculation.result?.amountMinor ?? 0), 0),
  };
  if (packageELiveCutover.cutoverRows !== packageELiveCutover.gatedRows
    || packageELiveCutover.observedAmountPreserved !== packageELiveCutover.gatedRows
    || packageELiveCutover.evidencePreserved !== packageELiveCutover.gatedRows
    || packageELiveCutover.noTargetOrCalculation !== packageELiveCutover.gatedRows
    || packageELiveCutover.preliminaryRequestExplanation !== packageELiveCutover.gatedRows
    || Object.entries(packageELiveCutover).some(([key, value]) =>
      !["gatedRows", "cutoverRows", "observedAmountPreserved", "evidencePreserved", "noTargetOrCalculation",
        "preliminaryRequestExplanation", "visibleFinalRequestExplanation"].includes(key) && value !== 0))
    throw new Error(`Package E/customer-state live cutover diverged for ${fixture.caseId}`);
  const authorityContext = { merchantAttentionMarkupShadow: attentionShadow };
  const cutoverProjection = buildProductionReportProjection(analysis, authorityContext);
  const legacyProjection = buildProductionReportProjection(analysis);
  const eligibleRows = attentionShadow.rows.filter(authorityBackedPricingEvidenceCopyEligible);
  const eligibleFeeRowIds = new Set(eligibleRows.map((row) => row.feeRowId));
  const eligibleItemIds = new Set(eligibleRows.flatMap((row) => row.currentAttention ? [row.currentAttention.itemId] : []));
  const totalFeesMinor = Math.abs(analysis.financialFacts.totalFees.value?.amountMinor ?? 0);
  const materialThresholdMinor = Math.max(1_000, Math.round(totalFeesMinor * 0.15));
  const independentlyMaterialRows = eligibleRows.filter((row) => Math.abs(row.observedAmount?.amountMinor ?? 0) >= materialThresholdMinor);
  const materialPriorityFindings = cutoverProjection.report?.priorityFindings.items
    .filter((item) => eligibleItemIds.has(item.id)) ?? [];
  const neutralAllCharges = cutoverProjection.report?.allCharges.rows.filter((row) => eligibleFeeRowIds.has(row.id)
    && row.category === "Observed fee component" && row.likelyOwner === null) ?? [];
  const coherentFindingCutover = {
    eligibleRows: eligibleRows.length,
    independentlyMaterialRows: independentlyMaterialRows.length,
    belowMaterialityRows: eligibleRows.length - independentlyMaterialRows.length,
  };
  if (materialPriorityFindings.some((item) => item.attentionType !== "unresolved_pricing_question"
    || item.category !== "Observed fee component" || item.likelyOwner !== null
    || item.merchantTitle !== "Pricing basis for this charge needs clarification"
    || /processor markup|processor.controlled|negotiat/i.test(`${item.category} ${item.merchantTitle} ${item.whyDeservesAttention} ${item.whatThisLikelyMeans}`)))
    throw new Error(`Coherent finding cutover retained unsupported finding semantics for ${fixture.caseId}`);
  const projectedEligibleCharges = cutoverProjection.report?.allCharges.rows.filter((row) => eligibleFeeRowIds.has(row.id)) ?? [];
  if ((cutoverProjection.report?.allCharges.status !== "omitted" && neutralAllCharges.length !== projectedEligibleCharges.length)
    || neutralAllCharges.some((row) => /processor markup|processor.controlled|negotiat/i.test(`${row.category} ${row.whatRateRevealKnows ?? ""}`)))
    throw new Error(`Coherent finding cutover retained unsupported All Charges semantics for ${fixture.caseId}`);
  if (cutoverProjection.report?.composition.categories.some((category) => category.id === "processor"
    && category.label === "Processor markup"
    && eligibleRows.every((eligible) => analysis.feeOwnershipActionability.rowClassifications
      .filter((classification) => classification.selected.category === "processor_markup")
      .some((classification) => classification.feeRowId === eligible.feeRowId)))) {
    const nonGatedProcessorRows = analysis.feeOwnershipActionability.rowClassifications.some((classification) =>
      ["processor_markup", "processor_per_item_fee", "administrative_fee"].includes(classification.selected.category)
      && !eligibleFeeRowIds.has(classification.feeRowId));
    if (!nonGatedProcessorRows) throw new Error(`Coherent finding cutover retained gated Processor markup composition for ${fixture.caseId}`);
  }
  if (Boolean(cutoverProjection.report) !== Boolean(legacyProjection.report))
    throw new Error(`Coherent finding cutover changed report availability for ${fixture.caseId}`);
  if (cutoverProjection.report && legacyProjection.report && JSON.stringify({
    representedTotal: cutoverProjection.report.composition.representedTotal,
    statementFeeTotal: cutoverProjection.report.composition.statementFeeTotal,
    difference: cutoverProjection.report.composition.difference,
    reconciled: cutoverProjection.report.composition.reconciled,
  }) !== JSON.stringify({
    representedTotal: legacyProjection.report.composition.representedTotal,
    statementFeeTotal: legacyProjection.report.composition.statementFeeTotal,
    difference: legacyProjection.report.composition.difference,
    reconciled: legacyProjection.report.composition.reconciled,
  })) throw new Error(`Coherent finding cutover changed projected financial totals for ${fixture.caseId}`);
  if (report.publicProbe !== null || report.decisions.some((item) => item.status === "supported"
    && item.semanticCode !== "merchant_facing_fee_component"))
    throw new Error(`F4 Gold calibration produced an out-of-scope positive claim for ${fixture.caseId}`);
  const exact = report.comparisons.filter((item) => item.comparisonBasis === "exact_semantic");
  const proxy = report.comparisons.filter((item) => item.comparisonBasis === "proxy_only");
  const readiness = report.comparisons.find((item) => item.decisionKey === "statement:ownership_actionability_claim_readiness");
  if (!readiness) throw new Error("F4 customer readiness comparison absent");
  const componentUnknownByRole: Record<string, number> = {};
  const componentSupportedByRole: Record<string, number> = {};
  for (const decision of report.decisions.filter((item) => item.semanticCode === "merchant_facing_fee_component" && item.status === "supported")) {
    const row = analysis.feeLedger.rows.find((item) => item.id === decision.feeRowId);
    if (!row) throw new Error("F4 supported component decision row absent");
    const key = `${row.role}/${row.contributionDecision.reasonCode}/${row.contributesToUniqueTotal ? "included" : "excluded"}`;
    componentSupportedByRole[key] = (componentSupportedByRole[key] ?? 0) + 1;
  }
  for (const decision of report.decisions.filter((item) => item.semanticCode === "merchant_facing_fee_component" && item.status === "unknown")) {
    const row = analysis.feeLedger.rows.find((item) => item.id === decision.feeRowId);
    if (!row) throw new Error("F4 component decision row absent");
    const key = `${row.role}/${row.contributionDecision.reasonCode}/${row.contributesToUniqueTotal ? "included" : "excluded"}`;
    componentUnknownByRole[key] = (componentUnknownByRole[key] ?? 0) + 1;
  }
  cases.push({
    caseId: fixture.caseId, standing: "repository_fixture_provisional_not_authoritative_gold_source_execution",
    semanticAnchors: anchors,
    canonicalStatus: analysis.validation.status, feeLedgerStatus: analysis.feeLedger.status,
    feeRowCount: analysis.feeLedger.rows.length,
    comparisons: { exact: counts(exact.map((item) => item.relation)), proxy: counts(proxy.map((item) => item.relation)) },
    decisionStatusByDimension: Object.fromEntries([...new Set(report.decisions.map((item) => item.dimension))].sort()
      .map((dimension) => [dimension, counts(report.decisions.filter((item) => item.dimension === dimension).map((item) => item.status))])),
    materialDivergences: materialGroups(report.comparisons, report.decisions),
    customerReadiness: { currentPermission: readiness.currentValue, shadowStatus: readiness.shadowStatus,
      comparisonBasis: readiness.comparisonBasis, relation: readiness.relation },
    componentSupportedByRole: Object.fromEntries(Object.entries(componentSupportedByRole).sort(([a], [b]) => a.localeCompare(b))),
    componentUnknownByRole: Object.fromEntries(Object.entries(componentUnknownByRole).sort(([a], [b]) => a.localeCompare(b))),
    internalMarkup: internalMarkup.comparison,
    merchantAttentionMarkupShadow: attentionShadow.summary,
    internalMerchantAttentionRetirement: internalRetirement,
    packageECustomerStateAuthorityReadBoundary: packageEAuthorityReadBoundary,
    packageECustomerStateLiveCutover: packageELiveCutover,
    customerFacingActionToolkitCopyCutover: customerFacingCopyCutover,
    customerFacingCoherentFindingCutover: coherentFindingCutover,
    completeness: {
      savingsMissingStatementTotal: report.decisions.filter((item) => item.dimension === "savings" && item.missingGates.includes("statement_total")).length,
      savingsMissingFeeComposition: report.decisions.filter((item) => item.dimension === "savings" && item.missingGates.includes("fee_composition")).length,
      savingsMissingSavingsGate: report.decisions.filter((item) => item.dimension === "savings" && item.missingGates.includes("savings")).length,
      grandControls: counts(analysis.feeLedger.controls.filter((item) => item.basis === "grand_control")
        .map((item) => `${item.independence}/${item.status}`)),
    },
  });
}

const totals = { exact: {} as Count, proxy: {} as Count };
const internalMarkupTotals = { legacySelected: 0, supported: 0, refused: 0, unknown: 0 };
const merchantAttentionMarkupShadowTotals = {
  legacyMarkupRows: 0, agreement: 0, authorityExceeding: 0, noAttentionItem: 0,
  observedComponentSupported: 0, currentResearchQuestions: 0, selectedResearchQuestions: 0,
};
const internalMerchantAttentionRetirementTotals = {
  negotiationNotEstablished: 0, observedComponentSupported: 0, ownerUnknown: 0,
  contractualControllerUnknown: 0, priceControllerUnknown: 0, actionabilityNotEstablished: 0,
};
const customerFacingActionToolkitCopyCutoverTotals = { eligibleRows: 0 };
const packageECustomerStateAuthorityReadBoundaryTotals = {
  gatedRows: 0, modeledRows: 0, unmatchedRows: 0, ownerUnknown: 0, controllerUnknown: 0,
  actionabilityNotEstablished: 0, feeRowReviewPreserved: 0, observedAmountPreserved: 0,
  evidencePreserved: 0, masterSavingsUnchanged: 0, verificationOnlyEvidenceReview: 0,
  neutralRequestExplanationCandidates: 0,
  positiveOpportunityAuthority: 0, positiveSavingsAuthority: 0, eligibleSavingsAmountMinor: 0,
  legacyVerifyCharge: 0, predictedRequestExplanation: 0, statementVerificationTotalsChanged: 0,
  statementCustomerStateChanged: 0, statementPermissionsChanged: 0, statementVisibilityChanged: 0,
};
const customerFacingCoherentFindingCutoverTotals = {
  eligibleRows: 0, independentlyMaterialRows: 0, belowMaterialityRows: 0,
};
const packageECustomerStateLiveCutoverTotals = {
  gatedRows: 0, cutoverRows: 0, observedAmountPreserved: 0, evidencePreserved: 0,
  noTargetOrCalculation: 0, preliminaryRequestExplanation: 0, visibleFinalRequestExplanation: 0,
  verificationTotalChanged: 0, excludedTotalChanged: 0, eligibleTotalChanged: 0, masterSavingsChanged: 0,
  customerStateClassificationChanged: 0, permissionsChanged: 0, visibilityChanged: 0, packageDChanged: 0,
  canonicalFinancialsChanged: 0, merchantAttentionChanged: 0, positiveOpportunityLinks: 0,
  positiveEligibleSavingsAmountMinor: 0,
};
for (const item of cases) {
  for (const basis of ["exact", "proxy"] as const) {
    for (const [relation, count] of Object.entries(item.comparisons[basis]))
      totals[basis][relation] = (totals[basis][relation] ?? 0) + count;
  }
  for (const key of ["legacySelected", "supported", "refused", "unknown"] as const)
    internalMarkupTotals[key] += item.internalMarkup[key];
  for (const key of Object.keys(merchantAttentionMarkupShadowTotals) as Array<keyof typeof merchantAttentionMarkupShadowTotals>)
    merchantAttentionMarkupShadowTotals[key] += item.merchantAttentionMarkupShadow[key];
  for (const key of Object.keys(internalMerchantAttentionRetirementTotals) as Array<keyof typeof internalMerchantAttentionRetirementTotals>)
    internalMerchantAttentionRetirementTotals[key] += item.internalMerchantAttentionRetirement[key];
  for (const key of Object.keys(packageECustomerStateAuthorityReadBoundaryTotals) as Array<keyof typeof packageECustomerStateAuthorityReadBoundaryTotals>)
    packageECustomerStateAuthorityReadBoundaryTotals[key] += item.packageECustomerStateAuthorityReadBoundary[key];
  for (const key of Object.keys(packageECustomerStateLiveCutoverTotals) as Array<keyof typeof packageECustomerStateLiveCutoverTotals>)
    packageECustomerStateLiveCutoverTotals[key] += item.packageECustomerStateLiveCutover[key];
  customerFacingActionToolkitCopyCutoverTotals.eligibleRows += item.customerFacingActionToolkitCopyCutover.eligibleRows;
  for (const key of Object.keys(customerFacingCoherentFindingCutoverTotals) as Array<keyof typeof customerFacingCoherentFindingCutoverTotals>)
    customerFacingCoherentFindingCutoverTotals[key] += item.customerFacingCoherentFindingCutover[key];
}
for (const basis of ["exact", "proxy"] as const)
  totals[basis] = Object.fromEntries(Object.entries(totals[basis]).sort(([a], [b]) => a.localeCompare(b)));
if (internalMarkupTotals.legacySelected !== 24 || internalMarkupTotals.refused !== 24
  || internalMarkupTotals.supported !== 0 || internalMarkupTotals.unknown !== 0)
  throw new Error("F4 provisional calibration processor-markup refusal count changed");
if (merchantAttentionMarkupShadowTotals.legacyMarkupRows !== 24
  || merchantAttentionMarkupShadowTotals.authorityExceeding !== 24
  || merchantAttentionMarkupShadowTotals.agreement !== 0
  || merchantAttentionMarkupShadowTotals.noAttentionItem !== 0
  || merchantAttentionMarkupShadowTotals.observedComponentSupported !== 24)
  throw new Error("F4 provisional calibration merchant-attention shadow count changed");
if (Object.values(internalMerchantAttentionRetirementTotals).some((count) => count !== 24))
  throw new Error("F4 provisional calibration internal merchant-attention retirement count changed");
if (customerFacingActionToolkitCopyCutoverTotals.eligibleRows !== 24)
  throw new Error("F4 provisional calibration customer-facing copy gate count changed");
for (const key of ["gatedRows", "modeledRows", "ownerUnknown", "controllerUnknown",
  "actionabilityNotEstablished", "feeRowReviewPreserved", "observedAmountPreserved", "evidencePreserved", "masterSavingsUnchanged",
  "verificationOnlyEvidenceReview", "neutralRequestExplanationCandidates", "legacyVerifyCharge",
  "predictedRequestExplanation"] as const) {
  if (packageECustomerStateAuthorityReadBoundaryTotals[key] !== 24)
    throw new Error(`F4 provisional Package E/customer-state authority count changed: ${key}`);
}
for (const key of ["unmatchedRows", "positiveOpportunityAuthority", "positiveSavingsAuthority",
  "eligibleSavingsAmountMinor", "statementVerificationTotalsChanged", "statementCustomerStateChanged",
  "statementPermissionsChanged", "statementVisibilityChanged"] as const) {
  if (packageECustomerStateAuthorityReadBoundaryTotals[key] !== 0)
    throw new Error(`F4 provisional Package E/customer-state nonzero boundary changed: ${key}`);
}
if (customerFacingCoherentFindingCutoverTotals.eligibleRows !== 24
  || customerFacingCoherentFindingCutoverTotals.independentlyMaterialRows !== 5
  || customerFacingCoherentFindingCutoverTotals.belowMaterialityRows !== 19)
  throw new Error("F4 provisional calibration coherent finding cutover count changed");
for (const key of ["gatedRows", "cutoverRows", "observedAmountPreserved", "evidencePreserved",
  "noTargetOrCalculation", "preliminaryRequestExplanation"] as const) {
  if (packageECustomerStateLiveCutoverTotals[key] !== 24)
    throw new Error(`F4 provisional Package E/customer-state live cutover count changed: ${key}`);
}
for (const key of ["verificationTotalChanged", "excludedTotalChanged", "eligibleTotalChanged", "masterSavingsChanged",
  "customerStateClassificationChanged", "permissionsChanged", "visibilityChanged", "packageDChanged",
  "canonicalFinancialsChanged", "merchantAttentionChanged", "positiveOpportunityLinks",
  "positiveEligibleSavingsAmountMinor"] as const) {
  if (packageECustomerStateLiveCutoverTotals[key] !== 0)
    throw new Error(`F4 provisional Package E/customer-state live invariant changed: ${key}`);
}

const result = {
  schemaVersion: "f4_gold_shadow_calibration_v1",
  standing: "provisional_repository_fixture_observation_no_gold_source_promotion",
  goldCatalogSha256: createHash("sha256").update(catalogBytes).digest("hex"),
  goldAuthorityRegisterSha256: createHash("sha256").update(registerBytes).digest("hex"),
  caseIds: fixtures.map((item) => item.caseId),
  excluded: [
    { caseId: "G6", reason: "exact_source_identity_and_mapping_unresolved" },
    { caseId: "G9", reason: "original_gold_source_unavailable" },
  ],
  totals, internalMarkupTotals, merchantAttentionMarkupShadowTotals, internalMerchantAttentionRetirementTotals,
  packageECustomerStateAuthorityReadBoundaryTotals,
  packageECustomerStateLiveCutoverTotals,
  customerFacingActionToolkitCopyCutoverTotals, customerFacingCoherentFindingCutoverTotals, cases,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
