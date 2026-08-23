import path from "node:path";
import { parsePdf } from "../../../parser.js";
import type { ParserDecision, ParserDriver, ParserValidationState } from "../../../parserFoundation.js";
import { fiservFirstDataFullStatementDriver, fiservFirstDataProcessorStatementDriver, fiservFirstDataShortStatementDriver } from "../../../fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../../../genericFiservStatementParser.js";
import { buildCanonicalEconomicsV2FromFiserv } from "../fiservAdapter.js";
import { resolveFiservShortTemplateAdmission } from "../fiservShortTemplateAdmission.js";
import { buildObservationalCanonicalPricingV2FromFiserv } from "../fiservPricingAdapter.js";
import { buildObservationalCanonicalEconomicsV2FromFiservPricing } from "../fiservEconomicAdapter.js";
import { observeFiservEconomicsInCanonicalSynthesisV2 } from "../fiservSynthesisAdapter.js";
import { composeCanonicalMerchantReportV2 } from "../report/reportHarness.js";
import { assertValidCanonicalMerchantReportProjectionV2 } from "../report/reportValidate.js";
import type { CanonicalEconomicsV2CompletenessStatus } from "../types.js";
import { buildSourceReadinessEnvelope } from "./sourceReadiness.js";
import { writeFiservReviewBundle, type FiservEvaluationRunAudit } from "./reviewBundle.js";
import { reviewFeeDetailCoverage, reviewFieldAuthority, type ReviewAdmissionMetadata } from "./reviewAuthority.js";

export type RunFiservOneStatementInput = {
  statementPaths: readonly string[];
  safeStatementId: string;
  runVersion: string;
  outputDirectory: string;
  sourceProfile?: { statementCompleteness?: CanonicalEconomicsV2CompletenessStatus; humanReviewRequired?: boolean };
};

const DRIVERS: ParserDriver[] = [fiservFirstDataProcessorStatementDriver, fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver, genericFiservStatementDriver];

export async function runFiservOneStatementEvaluation(input: RunFiservOneStatementInput): Promise<{ audit: FiservEvaluationRunAudit }> {
  if (input.statementPaths.length !== 1) throw new Error("FISERV_EVALUATION_REQUIRES_EXACTLY_ONE_PDF");
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(input.safeStatementId) || input.safeStatementId.length > 80) throw new Error("INVALID_SAFE_STATEMENT_ID");
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(input.runVersion) || input.runVersion.length > 80) throw new Error("INVALID_RUN_VERSION");
  const statementPath = input.statementPaths[0]!;
  if (path.extname(statementPath).toLowerCase() !== ".pdf") throw new Error("FISERV_EVALUATION_REQUIRES_PDF");
  const document = await parsePdf(statementPath);
  const driver = DRIVERS.find((candidate) => candidate.supports(document));
  if (!driver) throw new Error("FISERV_EVALUATION_UNSUPPORTED_PARSER");
  const parserOutput = driver.parse(document) as Record<string, unknown>;
  const identity = record(parserOutput.statementIdentity);
  if (!withinFiservCustomerScope(driver.id, String(identity.visibleBrand ?? ""), String(identity.processorFamily ?? ""))) {
    throw new Error("FISERV_EVALUATION_OUTSIDE_APPROVED_CUSTOMER_SCOPE");
  }
  const decision = record(parserOutput.decision) as ParserDecision & Record<string, unknown>;
  const selected = record(parserOutput.selectedFinancials);
  const validationState = normalizeParserValidation(decision.validationState);
  const profile = input.sourceProfile ?? {};
  if (profile.statementCompleteness && !["complete", "incomplete", "unknown", "unavailable"].includes(profile.statementCompleteness)) throw new Error("INVALID_STATEMENT_COMPLETENESS");
  const provenance = "observational" as const;
  const statementCompleteness = profile.statementCompleteness ?? "unknown";
  const suppliedDocument = suppliedDocumentIntegrity(document);
  const documentIntegrity = { suppliedDocumentStatus: suppliedDocument.status,
    observedPageCount: suppliedDocument.enumeratedPageCount, processedPageCount: suppliedDocument.processedPageCount,
    fatalPageErrorCount: suppliedDocument.fatalPageErrorCount, extractionLineageComplete: suppliedDocument.extractionLineageComplete,
    localIngestionTruncated: suppliedDocument.localIngestionTruncated, completenessStatus: statementCompleteness };
  const observationalFoundation = buildCanonicalEconomicsV2FromFiserv({ document, parserOutput, sourceDocumentRef: input.safeStatementId,
    parserId: driver.id, provenanceStatus: provenance, templateAdmission: { admissionStatus: "unknown",
      completenessStatus: "unknown", identityStatus: "observed" }, documentIntegrity });
  const admission = resolveFiservShortTemplateAdmission({ driverId: driver.id, parserOutput, observationalFoundation });
  const templateAdmission = admission ? "admitted" as const : "unknown" as const;
  const authority = "observational" as const;
  const readiness = buildSourceReadinessEnvelope({ parser: { driverId: driver.id, reportable: Boolean(decision.reportable),
    decisionStatus: parserDecisionStatus(decision.status), validationState }, source: { provenance, templateAdmission,
    suppliedDocumentIntegrity: suppliedDocument.status, statementCompleteness, authority,
    humanReviewRequired: profile.humanReviewRequired ?? false } });
  const foundation = admission ? buildCanonicalEconomicsV2FromFiserv({ document, parserOutput, sourceDocumentRef: input.safeStatementId,
    parserId: driver.id, provenanceStatus: provenance, templateAdmission: admission.templateAdmission,
    sectionAdmissions: admission.sectionAdmissions, documentIntegrity }) : observationalFoundation;
  const pricing = buildObservationalCanonicalPricingV2FromFiserv(foundation);
  const economic = buildObservationalCanonicalEconomicsV2FromFiservPricing(pricing);
  const synthesis = observeFiservEconomicsInCanonicalSynthesisV2(economic);
  const observed = observedFinancials(selected);
  const { projection, audit: reportAudit } = composeCanonicalMerchantReportV2({ synthesisAnalysis: synthesis, sourceReadiness: readiness });
  assertValidCanonicalMerchantReportProjectionV2(projection);
  const rhPricingContradiction = [projection.pricing?.underlyingCost, projection.pricing?.schedule, projection.pricing?.scope]
    .some((axis) => axis?.state === "confirmed")
    && [pricing.pricingArchitecture.underlyingCostBillingMode, pricing.pricingArchitecture.merchantPriceScheduleShape,
      pricing.pricingArchitecture.scopeUniformity]
      .every((axis) => axis.derivabilityTier === "unresolved" || axis.value === "unknown" || axis.value === "unresolved");
  const withheldSections = Object.entries(projection.permissions).filter(([, permission]) => permission.state === "denied")
    .map(([section, permission]) => ({ section, reasonCode: permission.reasonCode }));
  const audit = await writeFiservReviewBundle(input.outputDirectory, projection, {
    schemaVersion: "fiserv_pre_uat_run_audit_v4", harnessVersion: "fiserv_pre_uat_one_statement_v4", safeStatementId: input.safeStatementId,
    runVersion: input.runVersion,
    statement: { processorFamily: String(identity.processorFamily ?? "unknown"), visibleBrand: String(identity.visibleBrand ?? "unknown"),
      statementFamily: String(identity.statementFamily ?? "unknown"), periodStart: String(identity.statementPeriodStart ?? "unknown"),
      periodEnd: String(identity.statementPeriodEnd ?? "unknown") },
    parser: { matched: true, driverId: driver.id, reportable: Boolean(decision.reportable), decisionStatus: String(decision.status), validationState }, readiness,
    admission: admission ? { mappingId: admission.mappingId, mappingVersion: admission.mappingVersion,
      authorityClass: admission.authorityClass, authorityRef: admission.authorityRef, lifecycle: "admitted_with_conditions",
      scope: `${admission.templateAdmission.detectedTemplate}@${admission.templateAdmission.detectedVersion}`,
      supportedCapabilities: admission.templateAdmission.capabilities?.filter((item) => item.status === "supported").map((item) => item.capability) ?? [],
      feeDetailCoverage: admission.feeDetailCoverage } : null,
    reviewSummary: { detectedTemplate: String(identity.statementFamily ?? "unknown"),
      matchedAdmissionMappingId: admission?.mappingId ?? null, admissionLifecycle: admission ? "admitted_with_conditions" : null,
      evidenceAuthority: admission ? admission.authorityClass : authority, parserReportable: Boolean(decision.reportable),
      feeDetailCoverage: admission?.feeDetailCoverage ?? "unproven" },
    integrity: { suppliedDocumentStatus: suppliedDocument.status, openedSuccessfully: suppliedDocument.openedSuccessfully,
      enumeratedPageCount: suppliedDocument.enumeratedPageCount, processedPageCount: suppliedDocument.processedPageCount,
      fatalPageErrorCount: suppliedDocument.fatalPageErrorCount, extractionLineageComplete: suppliedDocument.extractionLineageComplete,
      localIngestionTruncated: suppliedDocument.localIngestionTruncated, statementCompleteness,
      expectedStatementPageCount: foundation.documentIntegrity.expectedPageCount },
    stageValidation: { rb: foundation.validation.status, rc: pricing.validation.status, rd: economic.validation.status,
      re: synthesis.validation.status, rh: reportAudit.validation.status }, reconciliationState: economic.economicLayer.costStack.completeness,
    stageIssues: {
      rb: { errors: foundation.validation.errors, warnings: foundation.validation.warnings },
      rc: { errors: pricing.validation.errors, warnings: pricing.validation.warnings },
      rd: { errors: economic.validation.errors, warnings: economic.validation.warnings },
      re: { errors: synthesis.validation.errors, warnings: synthesis.validation.warnings },
      rh: { errors: reportAudit.validation.errors, warnings: reportAudit.validation.warnings },
    },
    observedFinancials: observed,
    permissions: projection.permissions, withheldSections,
    comparison: { instance: "not_applicable_no_constructed_v1", staticConformanceState: "not_evaluated_in_runtime_harness", staticConformance: null },
    rf: { state: "not_applicable_no_admitted_knowledge", contributionCount: 0, conflictCount: 0 }, rg: { state: "disabled_no_provider" },
    finalPublicExperience: projection.experience,
    pricingAxes: [
      pricingAxis("underlying_cost", pricing.pricingArchitecture.underlyingCostBillingMode),
      pricingAxis("pricing_schedule", pricing.pricingArchitecture.merchantPriceScheduleShape),
      pricingAxis("scope_uniformity", pricing.pricingArchitecture.scopeUniformity),
    ],
    economics: {
      rdCompleteness: economic.economicLayer.costStack.completeness,
      chargeCount: economic.economicLayer.charges.length,
      contributingChargeCount: economic.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_")).length,
      feeCreditCount: economic.economicLayer.charges.filter((charge) => charge.financialDirection === "credit").length,
      inventoryCoverage: projection.inventory?.completeness ?? "withheld",
      ownershipControlProven: economic.economicLayer.roleClaims.some((claim) => claim.resolution === "proven"),
      themeCount: synthesis.synthesisLayer.themes.length,
      authoritativeFeeTotalMinor: economic.economicLayer.costStack.authoritativeStatementFeeTotal?.amountMinor ?? null,
      classifiedChargeNetMinor: economic.economicLayer.costStack.classifiedChargeNet.amountMinor,
      unresolvedRemainderMinor: economic.economicLayer.costStack.unresolvedRemainder?.amountMinor ?? null,
      reconciliationDeltaMinor: economic.economicLayer.costStack.reconciliationDeltaMinor,
    },
    financialFlows: {
      refund: { observedMinor: minor(selected.refunds), canonicalStatus: foundation.financialPopulations.refundVolume.status,
        canonicalMinor: foundation.financialPopulations.refundVolume.value?.amountMinor ?? null,
        admissionState: foundation.financialPopulations.refundVolume.provenanceStatus === "authoritative" ? "canonically_admitted" : "observational",
        processingFeeTreatment: "excluded", netVolumeTreatment: "deducted_from_gross" },
      settlementAdjustment: { observedMinor: minor(selected.adjustmentsChargebacks),
        canonicalStatus: foundation.financialPopulations.settlementAdjustmentAmount.status,
        canonicalMinor: foundation.financialPopulations.settlementAdjustmentAmount.value?.amountMinor ?? null,
        admissionState: foundation.financialPopulations.settlementAdjustmentAmount.provenanceStatus === "authoritative" ? "canonically_admitted" : "observational",
        processingFeeTreatment: "excluded", netVolumeTreatment: "excluded" },
    },
    templateAdmissionAudit: templateAdmissionAudit(parserOutput, foundation, admission, Boolean(decision.reportable), observed,
      economic.economicLayer.charges.length,
      economic.economicLayer.charges.filter((charge) => charge.contributionStatus.startsWith("contributes_")).length,
      synthesis.synthesisLayer.themes.length),
    issueClassifications: [
      { issue: "Processor-statement completeness is not proven.", primaryType: "normal unresolved",
        reason: "All supplied pages were processed, but no independent expected-statement-page proof was admitted." },
      ...(admission ? [] : [{ issue: `No approved claim-scoped admission mapping matched the detected ${String(identity.statementFamily ?? "unknown")} template.`,
        primaryType: "missing admission/mapping" as const,
        reason: "The parser recognized the template, but its extracted semantic claims remain observational until a versioned mapping is approved." }]),
      { issue: "Pricing axes, fee categories, ownership/control, RD contribution, and RE themes remain unsupported.",
        primaryType: "normal unresolved", reason: "This statement and current admitted knowledge do not independently prove those semantics." },
      ...(rhPricingContradiction ? [{ issue: "RH marks unresolved, non-admitted RC pricing axes as confirmed and supported.",
        primaryType: "systemic canonical defect" as const,
        reason: "The RH projection treats any available non-null axis value—including explicit unknown/unresolved sentinels—as confirmed admitted evidence." }] : []),
    ],
    warnings: unique([...foundation.validation.warnings, ...pricing.validation.warnings,
      ...economic.validation.warnings, ...synthesis.validation.warnings, ...reportAudit.validation.warnings]),
  });
  return { audit };
}

function withinFiservCustomerScope(driverId: string, visibleBrand: string, processorFamily: string): boolean {
  void processorFamily;
  return ["fiserv_first_data_full_statement", "fiserv_first_data_short_statement", "fiserv_first_data_processor_statement", "generic_fiserv_family_statement"].includes(driverId)
    && /^(?:FISERV|FIRST DATA|CLOVER|WELLS FARGO)(?:\b|\s*\/)/i.test(visibleBrand.trim());
}
function suppliedDocumentIntegrity(document: Awaited<ReturnType<typeof parsePdf>>) {
  const diagnostics = document.suppliedDocumentIntegrity;
  if (!diagnostics) return { status: "unknown" as const, openedSuccessfully: false, enumeratedPageCount: 0,
    processedPageCount: 0, fatalPageErrorCount: 0, extractionLineageComplete: false, localIngestionTruncated: false };
  const complete = diagnostics.openedSuccessfully && diagnostics.enumeratedPageCount === diagnostics.processedPageCount
    && diagnostics.fatalPageErrorCount === 0 && diagnostics.extractionLineageComplete && !diagnostics.localIngestionTruncated;
  const failed = !diagnostics.openedSuccessfully || diagnostics.fatalPageErrorCount > 0
    || diagnostics.processedPageCount !== diagnostics.enumeratedPageCount || !diagnostics.extractionLineageComplete
    || diagnostics.localIngestionTruncated;
  return { status: complete ? "complete_supplied_document" as const
    : failed ? "incomplete_or_corrupt_supplied_document" as const : "unknown" as const, ...diagnostics };
}
function parserDecisionStatus(value: unknown): "accepted" | "accepted_with_warnings" | "needs_review" | "unsupported" | "failed" {
  return ["accepted", "accepted_with_warnings", "needs_review", "unsupported", "failed"].includes(String(value)) ? value as any : "failed";
}
function normalizeParserValidation(value: ParserValidationState | undefined): "validated" | "validated_with_warnings" | "failed" | "missing" {
  if (!value) return "missing";
  if (!value.customerFacingTotalsAllowed || value.topLevelTotals === "failed") return "failed";
  return value.warningReasons.length > 0 || value.topLevelTotals === "warning" || value.topLevelTotals === "validated_with_rounding"
    ? "validated_with_warnings" : "validated";
}
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function unique(values: string[]): string[] { return [...new Set(values)]; }

function pricingAxis(axis: "underlying_cost" | "pricing_schedule" | "scope_uniformity",
  conclusion: { status: string; value: unknown; derivabilityTier: string; limitations: string[] }) {
  return { axis, status: conclusion.status, value: conclusion.value === null ? null : String(conclusion.value),
    derivabilityTier: conclusion.derivabilityTier, reason: conclusion.limitations.join(" ") || "No admitted evidence supports this axis.",
    canonicallyAdmitted: false as const };
}

function observedFinancials(selected: Record<string, any>) {
  const transaction = record(selected.transactionCount);
  const supporting = Array.isArray(transaction.supportingTransactionCounts) ? transaction.supportingTransactionCounts.map(record) : [];
  const grossSaleTransactionCount = supporting.find((item) => ["gross_sale_items", "gross_sale_transactions"].includes(String(item.role)))?.value;
  const grossSales = finite(selected.grossSales);
  const grossCount = finite(grossSaleTransactionCount);
  return {
    processedSalesMinor: minor(selected.totalVolume),
    processingFeesMinor: minor(selected.totalFees),
    effectiveRate: finite(selected.effectiveRate),
    grossSaleTransactionCount: grossCount,
    submittedTransactionCount: finite(transaction.primaryTransactionCount),
    averageTicketMinor: grossSales !== null && grossCount !== null && grossCount > 0 ? Math.round((grossSales / grossCount) * 100) : null,
  };
}

function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function minor(value: unknown): number | null { const amount = finite(value); return amount === null ? null : Math.round(amount * 100); }

function templateAdmissionAudit(
  parserOutput: Record<string, unknown>,
  foundation: ReturnType<typeof buildCanonicalEconomicsV2FromFiserv>,
  admission: ReturnType<typeof resolveFiservShortTemplateAdmission>,
  parserReportable: boolean,
  observed: ReturnType<typeof observedFinancials>,
  chargeCount: number,
  contributingChargeCount: number,
  themeCount: number,
) {
  const identity = record(parserOutput.statementIdentity);
  const selected = record(parserOutput.selectedFinancials);
  const feeLedger = record(parserOutput.feeLedger);
  const feeRows = records(feeLedger.rows);
  const funding = record(parserOutput.fundingBatchLedger);
  const facts = foundation.financialPopulations;
  const supportedCapabilities = admission?.templateAdmission.capabilities
    ?.filter((item) => item.status === "supported").map((item) => item.capability) ?? [];
  const admissionMetadata: ReviewAdmissionMetadata = admission ? { mappingId: admission.mappingId,
    lifecycle: "admitted_with_conditions", supportedCapabilities, feeDetailCoverage: admission.feeDetailCoverage } : null;
  const supported = (capability: string) => supportedCapabilities.includes(capability as any);
  const extracted = (value: unknown): "yes" | "no" => value === null || value === undefined || value === "unknown" ? "no" : "yes";
  const authority = (capability: string | undefined, isExtracted: boolean, options: { derived?: boolean; unresolved?: boolean;
    unavailable?: boolean } = {}) => reviewFieldAuthority({ parserReportable, extracted: isExtracted, capability,
      admission: admissionMetadata, derivedFromAdmittedInputs: options.derived, unresolved: options.unresolved,
      unavailable: options.unavailable });
  const candidate = (capability: string | undefined, value: "yes" | "conditional" | "no") =>
    capability && supported(capability) ? "already_admitted" as const : parserReportable ? value : "no" as const;
  const missing = (capability: string | undefined, fallback: string) => capability && supported(capability)
    ? "No missing claim proof within the matched mapping; no broader semantics follow." : fallback;
  const admittedEvidence = (capability: string, fallback: string) => supported(capability)
    ? `${fallback} Claim authority is limited to ${admission!.mappingId}@${admission!.mappingVersion}.` : fallback;
  const row = (item: string, extractedState: "yes" | "partial" | "no", structuralEvidence: string,
    currentAuthority: ReturnType<typeof authority>, canonicalResult: string,
    admissionCandidate: "yes" | "conditional" | "no" | "already_admitted", missingProof: string) =>
    ({ item, extracted: extractedState, structuralEvidence, currentAuthority, canonicalResult, admissionCandidate, missingProof });
  const grossObserved = observed.grossSaleTransactionCount;
  const submittedObserved = observed.submittedTransactionCount;
  const derivedAverage = foundation.metrics.headlineAverageTicket.state === "defined"
    && facts.grossSaleVolume.provenanceStatus === "authoritative" && facts.grossSaleTransactionCount.provenanceStatus === "authoritative";
  const feeCoverage = reviewFeeDetailCoverage({ parserReportable, observedRowCount: feeRows.length, admission: admissionMetadata });
  const amexRows = feeRows.filter((item) => /AMEX|AMERICAN EXPRESS|AXP/i.test(`${item.network ?? ""} ${item.description ?? ""}`));
  const serviceAdminRows = feeRows.filter((item) => item.sourceSection === "ACCOUNT FEES" || item.type === "Service charges");
  const pricingRows = feeRows.filter((item) => finite(item.rate) !== null || finite(item.volumeBasis) !== null);
  const fundingRows = records(funding.rows);
  return [
    row("family identity", extracted(identity.processorFamily), "Driver-recognized header and template structure.",
      authority("processor_identity", identity.processorFamily !== undefined), String(identity.processorFamily ?? "unavailable"),
      candidate("processor_identity", "yes"), missing("processor_identity", "A versioned mapping must bind identity to this exact detected template without admitting other semantics.")),
    row("statement period", foundation.identity.statementPeriod ? "yes" : "no", "Explicit labelled statement-period field; funding/service dates are excluded.",
      authority("statement_period", foundation.identity.statementPeriod !== null), foundation.identity.statementPeriod
        ? `${foundation.identity.statementPeriod.start} through ${foundation.identity.statementPeriod.end}` : "unavailable",
      candidate("statement_period", "yes"), missing("statement_period", "A claim-scoped template mapping must prove the labelled field and date format.")),
    row("gross sales", extracted(selected.grossSales), admittedEvidence("gross_sale_volume", "Gross-sale columns and gross/refund/net controls."),
      authority("gross_sale_volume", finite(selected.grossSales) !== null), factMoney(facts.grossSaleVolume), candidate("gross_sale_volume", "yes"),
      missing("gross_sale_volume", "Gross-sale population semantics require claim-scoped template admission.")),
    row("refunds", extracted(selected.refunds), admittedEvidence("refund_volume", "Refund columns and gross-minus-refund reconciliation."),
      authority("refund_volume", finite(selected.refunds) !== null), factMoney(facts.refundVolume), candidate("refund_volume", "yes"),
      missing("refund_volume", "Refund direction and population require template admission; it remains distinct from fees and fee credits.")),
    row("net submitted sales", extracted(selected.totalVolume), admittedEvidence("canonical_net_submitted_card_volume", "Summary/batch submitted totals and funding controls."),
      authority("canonical_net_submitted_card_volume", finite(selected.totalVolume) !== null), factMoney(facts.canonicalNetSubmittedCardVolume),
      candidate("canonical_net_submitted_card_volume", "yes"), missing("canonical_net_submitted_card_volume", "The net-submitted population and template control boundary require admission.")),
    row("processing-fee total", extracted(selected.totalFees), admittedEvidence("fee_total", "Printed fee total, row arithmetic, and funding reconciliation."),
      authority("fee_total", finite(selected.totalFees) !== null), factMoney(facts.totalStatementProcessingFees), candidate("fee_total", "yes"),
      missing("fee_total", "The printed total's processing-fee semantic role requires admission; it does not prove ownership, margin, or savings.")),
    row("gross-sale count", extracted(grossObserved), admittedEvidence("gross_sale_transaction_count", "Gross-sale count column with population-specific evidence."),
      authority("gross_sale_transaction_count", grossObserved !== null), grossObserved === null ? "unavailable" : `observed ${grossObserved}; canonical headline ${factCount(facts.grossSaleTransactionCount)}`,
      candidate("gross_sale_transaction_count", "yes"), missing("gross_sale_transaction_count", "Gross-sale population mapping is unadmitted and must remain distinct from submitted count.")),
    row("submitted count", extracted(submittedObserved), admittedEvidence("submitted_transaction_count", "Submitted-count columns and submitted total controls."),
      authority("submitted_transaction_count", submittedObserved !== null), submittedObserved === null ? "unavailable" : `observed ${submittedObserved}; canonical headline ${factCount(facts.submittedTransactionCount)}`,
      candidate("submitted_transaction_count", "yes"), missing("submitted_transaction_count", "Submitted population mapping is unadmitted and cannot substitute for gross-sale count.")),
    row("average ticket", observed.averageTicketMinor !== null ? "yes" : "no", "Deterministic gross-sales divided by gross-sale-count rule.",
      authority(undefined, observed.averageTicketMinor !== null, { derived: derivedAverage, unavailable: !derivedAverage }),
      derivedAverage && foundation.metrics.headlineAverageTicket.value ? `USD ${(foundation.metrics.headlineAverageTicket.value.amountMinor / 100).toFixed(2)}`
        : `${observed.averageTicketMinor === null ? "unavailable" : `observed candidate USD ${(observed.averageTicketMinor / 100).toFixed(2)}`}; canonical unavailable`,
      derivedAverage ? "no" : "conditional", derivedAverage ? "No separate admission is needed; the metric is derived from admitted, population-aligned inputs."
        : "Both gross-sale volume and gross-sale count must first carry admitted, population-aligned authority."),
    row("funding flows", fundingRows.length > 0 ? "yes" : "no", `${fundingRows.length} funding row(s); parser reconciliation ${String(funding.status ?? "unknown")}.`,
      authority("reconciliation_controls", fundingRows.length > 0), `${String(funding.status ?? "unavailable")}; submitted/funded/fee totals remain field-specific`,
      candidate("reconciliation_controls", "yes"), missing("reconciliation_controls", "A template mapping must define row boundaries, month-end fee treatment, and coverage controls.")),
    row("settlement adjustment", extracted(selected.adjustmentsChargebacks), admittedEvidence("settlement_adjustments", "Separated adjustment/funding role and reconciliation controls."),
      authority("settlement_adjustments", finite(selected.adjustmentsChargebacks) !== null), factMoney(facts.settlementAdjustmentAmount),
      candidate("settlement_adjustments", "yes"), missing("settlement_adjustments", "Adjustment, chargeback, and other non-fee roles must be independently distinguished.")),
    row("Amex occurrences", amexRows.length > 0 ? "yes" : "no", `${amexRows.length} occurrence(s) recognized by printed network/description fields.`,
      authority("fee_detail", amexRows.length > 0), `${amexRows.length} observed occurrence(s); economic meaning unadmitted`,
      amexRows.length > 0 ? candidate("fee_detail", "yes") : "no", amexRows.length > 0
        ? missing("fee_detail", "Occurrence identity/sign/amount and coverage boundaries need template admission; network rows do not prove pricing or ownership.")
        : "No Amex occurrence was observed; absence does not create an Amex semantic claim."),
    row("fee-detail occurrences", feeRows.length > 0 ? "yes" : "no", feeCoverage.description, feeCoverage.authority,
      `${feeRows.length} observed occurrence(s); coverage ${feeCoverage.coverageState}`, candidate("fee_detail", "yes"),
      feeCoverage.coverageState === "unproven" ? "Expected sections, coverage boundaries, missing-detail controls, and reconciliation coverage are not admitted."
        : "Economic categories, ownership, negotiability, margin, and RD contribution remain unadmitted."),
    row("service/admin occurrences", serviceAdminRows.length > 0 ? "yes" : "no", `${serviceAdminRows.length} occurrence(s) recognized from printed service/account fields.`,
      authority("fee_detail", serviceAdminRows.length > 0), `${serviceAdminRows.length} observed occurrence(s); economic meaning unadmitted`,
      serviceAdminRows.length > 0 ? candidate("fee_detail", "yes") : "no", missing("fee_detail", "Occurrence identity/sign/amount may be reviewed; category, beneficiary, control, and negotiability remain unproven.")),
    row("pricing rows", pricingRows.length > 0 ? "yes" : "no", `${pricingRows.length} row(s) expose observed component rate/volume/count arithmetic.`,
      authority(undefined, pricingRows.length > 0), `${pricingRows.length} observational pricing component row(s); no account-wide conclusion`, "no",
      "Row arithmetic cannot prove underlying-cost treatment, schedule shape, or account-wide uniformity."),
    row("pricing axes", pricingRows.length > 0 ? "partial" : "no", "RC evaluates each axis independently and excludes legacy/AI inference.",
      authority(undefined, false, { unresolved: true }), "underlying cost unknown; schedule unknown; scope unresolved", "no",
      "Account-wide pricing architecture requires separately admitted billing-role and coverage evidence."),
    row("economic categories", feeRows.length > 0 ? "partial" : "no", "Printed/legacy labels are retained only as observations.",
      authority(undefined, false, { unresolved: true }), "unavailable", "no", "Independent economic-category evidence and coverage are absent."),
    row("ownership/control", "no", "No positive contract, cost, beneficiary, or control evidence was observed.",
      authority(undefined, false, { unresolved: true }), "unresolved", "no", "Processor identity and printed labels cannot establish ownership, control, or negotiability."),
    row("RD contributions", chargeCount > 0 ? "partial" : "no", `${chargeCount} observational candidates reach RD; contribution gates remain authoritative.`,
      authority(undefined, false, { unresolved: true }), `${chargeCount} candidates; ${contributingChargeCount} admitted contributors`, "no",
      "Admitted fee identity, economic category, direction, and coverage are required for cost-stack contribution."),
    row("RE eligibility", themeCount > 0 ? "partial" : "no", "RE requires admitted upstream semantic dependencies.",
      authority(undefined, false, { unavailable: themeCount === 0, unresolved: themeCount > 0 }), `${themeCount} eligible theme(s)`, "no",
      "Fee existence alone cannot create Merchant Attention; empty output is not proof of health."),
    row("impact", "no", "No eligible counterfactual, benchmark, recurrence, or ownership evidence.",
      authority(undefined, false, { unavailable: true }), "unavailable", "no", "Potential reduction, savings, and comparison remain prohibited."),
  ];
}

function factMoney(fact: { status: string; value: { amountMinor: number } | null }): string {
  return fact.status === "available" && fact.value ? `USD ${(fact.value.amountMinor / 100).toFixed(2)}` : "unavailable";
}
function factCount(fact: { status: string; value: number | null }): string {
  return fact.status === "available" && fact.value !== null ? String(fact.value) : "unavailable";
}
function records(value: unknown): Record<string, any>[] { return Array.isArray(value) ? value.map(record) : []; }
