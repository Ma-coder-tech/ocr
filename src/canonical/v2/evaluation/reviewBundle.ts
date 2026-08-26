import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CanonicalMerchantReportProjectionV2, RhComparisonReport } from "../report/reportTypes.js";
import type { SourceReadinessEnvelope } from "./sourceReadiness.js";
import type { ReviewAuthorityState } from "./reviewAuthority.js";
import type { FiservFullTemplateAdmissionDecision } from "../fiservFullTemplateAdmission.js";

export type FiservEvaluationRunAudit = {
  schemaVersion: "fiserv_pre_uat_run_audit_v5";
  harnessVersion: "fiserv_pre_uat_one_statement_v5";
  safeStatementId: string;
  runVersion: string;
  statement: { processorFamily: string; visibleBrand: string; statementFamily: string; periodStart: string; periodEnd: string };
  parser: { matched: true; driverId: string; reportable: boolean; decisionStatus: string; validationState: string };
  readiness: SourceReadinessEnvelope;
  admission: { mappingId: string; mappingVersion: string; authorityClass: "product_owner" | "deterministic_capability_policy"; authorityRef: string;
    lifecycle: "admitted" | "admitted_with_conditions"; scope: string; supportedCapabilities: string[]; feeDetailCoverage: string } | null;
  familyAdmissionDecision: FiservFullTemplateAdmissionDecision;
  reviewSummary: { detectedTemplate: string; matchedAdmissionMappingId: string | null;
    admissionLifecycle: "admitted" | "admitted_with_conditions" | null; evidenceAuthority: string;
    parserReportable: boolean; feeDetailCoverage: string };
  integrity: { suppliedDocumentStatus: string; openedSuccessfully: boolean; enumeratedPageCount: number; processedPageCount: number;
    fatalPageErrorCount: number; extractionLineageComplete: boolean; localIngestionTruncated: boolean;
    statementCompleteness: string; expectedStatementPageCount: number | null };
  stageValidation: Record<"rb" | "rc" | "rd" | "re" | "rh", "valid" | "invalid">;
  stageIssues: Record<"rb" | "rc" | "rd" | "re" | "rh", { errors: string[]; warnings: string[] }>;
  observedFinancials: { processedSalesMinor: number | null; processingFeesMinor: number | null; effectiveRate: number | null;
    grossSaleTransactionCount: number | null; submittedTransactionCount: number | null; averageTicketMinor: number | null };
  reconciliationState: string;
  permissions: CanonicalMerchantReportProjectionV2["permissions"];
  withheldSections: Array<{ section: string; reasonCode: string }>;
  comparison: { instance: "not_applicable_no_constructed_v1"; staticConformanceState: "not_evaluated_in_runtime_harness";
    staticConformance: RhComparisonReport | null };
  rf: { state: "not_applicable_no_admitted_knowledge"; contributionCount: 0; conflictCount: 0 };
  rg: { state: "disabled_no_provider" };
  finalPublicExperience: CanonicalMerchantReportProjectionV2["experience"];
  pricingAxes: Array<{ axis: "underlying_cost" | "pricing_schedule" | "scope_uniformity"; status: string; value: string | null;
    derivabilityTier: string; reason: string; canonicallyAdmitted: false }>;
  economics: { rdCompleteness: string; chargeCount: number; contributingChargeCount: number; feeCreditCount: number;
    inventoryCoverage: string; ownershipControlProven: boolean; themeCount: number; authoritativeFeeTotalMinor: number | null;
    classifiedChargeNetMinor: number; unresolvedRemainderMinor: number | null; reconciliationDeltaMinor: number | null };
  financialFlows: { refund: { observedMinor: number | null; canonicalStatus: string; canonicalMinor: number | null; admissionState: string;
      processingFeeTreatment: "excluded"; netVolumeTreatment: "deducted_from_gross" };
    settlementAdjustment: { observedMinor: number | null; canonicalStatus: string; canonicalMinor: number | null; admissionState: string;
      processingFeeTreatment: "excluded"; netVolumeTreatment: "excluded" } };
  templateAdmissionAudit: Array<{ item: string; extracted: "yes" | "partial" | "no"; structuralEvidence: string;
    currentAuthority: ReviewAuthorityState; canonicalResult: string; admissionCandidate: "yes" | "conditional" | "no" | "already_admitted";
    missingProof: string }>;
  issueClassifications: Array<{ issue: string; primaryType: "normal unresolved" | "missing admission/mapping" |
    "statement-specific defect" | "systemic canonical defect" | "systemic harness defect"; reason: string }>;
  warnings: string[];
  projectionChecksum: string;
};

export function formatFiservBackendReview(projection: CanonicalMerchantReportProjectionV2, audit: FiservEvaluationRunAudit): string {
  const money = (amount: { amountMinor: number } | null | undefined) => amount ? `USD ${(amount.amountMinor / 100).toFixed(2)}` : "unavailable";
  const pricing = audit.pricingAxes.map((axis) =>
    `- ${axis.axis.replaceAll("_", " ")}: ${axis.status}; value ${axis.value ?? "unresolved"}; ${axis.derivabilityTier}; not canonically admitted. Reason: ${axis.reason}`).join("\n");
  const questions = projection.questions?.items.map((item) => `- Known: ${item.known.text} Unresolved: ${item.uncertain.text} Next: ${item.nextStep.text}${item.amountUnderReview?.kind === "amount_under_review" ? ` Amount under review: ${money(item.amountUnderReview.amount)}` : ""}`).join("\n") || "- none";
  const attention = projection.attention?.items.map((item) => `- ${item.title.text} — ${item.priority}; ${item.evidenceStrength}; impact ${item.impact?.kind ?? "unavailable"}`).join("\n") || "- none; absence is not treated as proof of health or zero opportunity";
  const sectionRows = ["snapshot", "pricing", "composition", "attention", "questions", "inventory", "actions", "continuation", "methodology"]
    .map((section) => {
      const value = projection[section as keyof CanonicalMerchantReportProjectionV2];
      const permission = audit.permissions[permissionForSection(section)];
      const state = value === null ? "withheld" : permission.state === "limited" ? "partial" : "visible";
      return `- ${section}: ${state}; ${permission.reasonCode}; ceiling ${permission.authorityCeiling}`;
    }).join("\n");
  const matrix = audit.templateAdmissionAudit.map((row) =>
    `| ${row.item} | ${row.extracted} | ${row.structuralEvidence} | ${row.currentAuthority} | ${row.canonicalResult} | ${row.admissionCandidate} | ${row.missingProof} |`).join("\n");
  const issueClassifications = audit.issueClassifications.map((item) =>
    `- ${item.primaryType}: ${item.issue} — ${item.reason}`).join("\n");
  const impactItems = [
    ...(projection.attention?.items.map((item) => item.impact).filter(Boolean) ?? []),
    ...(projection.questions?.items.map((item) => item.amountUnderReview).filter(Boolean) ?? []),
  ];
  const impacts = impactItems.length === 0 ? "- Potential reduction: unavailable\n- Potential reduction range: unavailable\n- Amount under review: unavailable"
    : impactItems.map((impact) => `- ${impact!.kind}: ${impact!.kind === "potential_reduction_range" ? `${money(impact!.lowerAmount)}–${money(impact!.upperAmount)}` : money(impact!.amount)}`).join("\n");
  const observedMoney = (minor: number | null) => minor === null ? "unavailable" : `USD ${(minor / 100).toFixed(2)}`;
  const stageIssues = Object.entries(audit.stageIssues).map(([stage, issues]) =>
    `- ${stage.toUpperCase()}: ${audit.stageValidation[stage as keyof typeof audit.stageValidation]}; errors: ${issues.errors.join(" | ") || "none"}; warnings: ${issues.warnings.join(" | ") || "none"}`).join("\n");
  const authorityRows = (predicate: (row: FiservEvaluationRunAudit["templateAdmissionAudit"][number]) => boolean) => {
    const rows = audit.templateAdmissionAudit.filter(predicate);
    return rows.length > 0 ? rows.map((row) => `- ${row.item}: ${row.canonicalResult} — ${row.currentAuthority}; ${row.structuralEvidence}`).join("\n") : "- none";
  };
  const recognized = authorityRows((row) => row.extracted !== "no");
  const admitted = authorityRows((row) => row.currentAuthority === "admitted" || row.currentAuthority === "admitted_with_conditions");
  const derived = authorityRows((row) => row.currentAuthority === "canonical_derived_from_admitted_inputs");
  const candidates = authorityRows((row) => row.admissionCandidate === "yes" || row.admissionCandidate === "conditional");
  const refused = authorityRows((row) => ["unresolved", "unavailable", "withheld"].includes(row.currentAuthority)
    || (row.admissionCandidate === "no" && row.currentAuthority === "observational"));
  const operationalMeaning = !audit.parser.reportable
    ? `The matched driver did not authorize reporting. Extracted values cannot be described as admitted, regardless of mapping metadata.`
    : audit.admission
      ? `This run matched ${audit.admission.mappingId}@${audit.admission.mappingVersion}. Only its enumerated supported capabilities carry ${audit.admission.lifecycle} authority; all other claims retain their field-specific state.`
      : `The ${audit.reviewSummary.detectedTemplate} template was recognized by ${audit.parser.driverId}, but no claim-scoped admission mapping matched. Extracted values remain observational or unavailable pending a separately approved template mapping.`;
  const familyDecision = `- Family code/version: ${audit.familyAdmissionDecision.familyCode}@${audit.familyAdmissionDecision.familyVersion}\n- Matched: ${audit.familyAdmissionDecision.matched}\n- Reasons: ${audit.familyAdmissionDecision.reasonCodes.join(", ") || "none"}\n- Required markers: ${audit.familyAdmissionDecision.structuralMarkers.filter((item) => item.requirement === "required").map((item) => `${item.code}=${item.status}`).join(", ")}\n- Optional markers: ${audit.familyAdmissionDecision.structuralMarkers.filter((item) => item.requirement === "optional").map((item) => `${item.code}=${item.status}`).join(", ")}\n- Prohibited markers: ${audit.familyAdmissionDecision.structuralMarkers.filter((item) => item.requirement === "prohibited").map((item) => `${item.code}=${item.status}`).join(", ")}\n- Reconciliation: ${audit.familyAdmissionDecision.reconciliationControls.map((item) => `${item.code}=${item.status}${item.tolerance ? ` (${item.tolerance})` : ""}`).join(", ")}\n- Permitted unresolved: ${audit.familyAdmissionDecision.permittedUnresolvedConditions.join(", ")}\n- Rejected alternative: ${audit.familyAdmissionDecision.rejectedAlternativeFamily.familyCode}; ${audit.familyAdmissionDecision.rejectedAlternativeFamily.reasonCode}`;
  return `# Fiserv backend review — ${audit.safeStatementId} / ${audit.runVersion}\n\n## Source and readiness\n\n- Processor/family: ${audit.statement.visibleBrand} / ${audit.statement.processorFamily}\n- Statement family/driver: ${audit.statement.statementFamily} / ${audit.parser.driverId}\n- Statement period: ${audit.statement.periodStart} through ${audit.statement.periodEnd}\n- Parser matched: ${audit.parser.matched}\n- Parser decision/reportability/validation: ${audit.parser.decisionStatus} / ${audit.parser.reportable} / ${audit.parser.validationState}\n- Supplied-document integrity: ${audit.readiness.source.suppliedDocumentIntegrity}; opened ${audit.integrity.openedSuccessfully}; pages enumerated/processed ${audit.integrity.enumeratedPageCount}/${audit.integrity.processedPageCount}; fatal page errors ${audit.integrity.fatalPageErrorCount}; lineage complete ${audit.integrity.extractionLineageComplete}; truncated ${audit.integrity.localIngestionTruncated}\n- Processor-statement completeness: ${audit.readiness.source.statementCompleteness}; expected page count ${audit.integrity.expectedStatementPageCount ?? "not proven"}\n- Provenance/evidence authority: ${audit.readiness.source.provenance} / ${audit.reviewSummary.evidenceAuthority}\n- Template admission: ${audit.readiness.source.templateAdmission}\n- Claim-scoped admission: ${audit.admission ? `${audit.admission.mappingId}@${audit.admission.mappingVersion}; ${audit.admission.authorityClass}; ${audit.admission.lifecycle}` : "none"}\n- Fee-detail coverage: ${audit.reviewSummary.feeDetailCoverage}\n- Readiness/completion ceiling: ${audit.readiness.outcome.state}; reasons ${audit.readiness.outcome.reasonCodes.join(", ")}; analysis completion permitted = ${audit.readiness.outcome.analysisCompletionPermitted}\n\n**Operational meaning:** ${operationalMeaning}\n\n## Family admission decision\n\n${familyDecision}\n\n## Stage validation\n\n${stageIssues}\n\n## Recognized/extracted\n\n${recognized}\n\n## Canonically admitted\n\n${admitted}\n\n## Canonically derived\n\n${derived}\n\n## Candidate for admission\n\n${candidates}\n\n## Refused/unresolved\n\n${refused}\n\n## Financial flows\n\n- Refund: observed ${observedMoney(audit.financialFlows.refund.observedMinor)}; canonical ${observedMoney(audit.financialFlows.refund.canonicalMinor)}; ${audit.financialFlows.refund.admissionState}; excluded from fees; deducted from gross sales to net submitted volume.\n- Settlement adjustment: observed ${observedMoney(audit.financialFlows.settlementAdjustment.observedMinor)}; canonical ${observedMoney(audit.financialFlows.settlementAdjustment.canonicalMinor)}; ${audit.financialFlows.settlementAdjustment.admissionState}; excluded from fees, sales volume, composition, and impact.\n\n## RC pricing axes\n\n${pricing}\n\nRH pricing status: ${projection.pricing?.status ?? "withheld"}; axis states ${projection.pricing ? [projection.pricing.underlyingCost.state, projection.pricing.schedule.state, projection.pricing.scope.state].join(" / ") : "withheld"}.\n\n## RD economics\n\n- RD completeness: ${audit.economics.rdCompleteness}; reconciliation delta minor ${audit.economics.reconciliationDeltaMinor ?? "unavailable"}\n- Candidate charges / admitted contributors: ${audit.economics.chargeCount} / ${audit.economics.contributingChargeCount}\n- Statement fee-total basis: ${observedMoney(audit.economics.authoritativeFeeTotalMinor)}\n- Classified charge net: ${observedMoney(audit.economics.classifiedChargeNetMinor)}; unresolved remainder ${observedMoney(audit.economics.unresolvedRemainderMinor)}\n- Ownership/control proven: ${audit.economics.ownershipControlProven}; percentages ${projection.composition?.percentagesPermitted ? "permitted" : "withheld"}\n\n## RE / Merchant Attention\n\n${attention}\n\nRE produced ${audit.economics.themeCount} eligible theme(s). Empty output is not proof of health or zero opportunity.\n\n## Genuine limitations and missing mappings\n\n${questions}\n\n- Processor-statement completeness remains ${audit.readiness.source.statementCompleteness}.\n- Pricing architecture, fee economic categories, ownership/control, RD contribution, RE themes, impact, and comparison remain unadmitted or unsupported.\n\n## Impact\n\n${impacts}\n\nNo savings or potential reduction is created.\n\n## RF / RG\n\n- RF: ${audit.rf.state}; admitted contributions ${audit.rf.contributionCount}; conflicts ${audit.rf.conflictCount}\n- RG: ${audit.rg.state}; live research/provider activity: none\n\n## Final RH result\n\n- Public experience: ${projection.experience}\n- Completion permitted: ${audit.readiness.outcome.analysisCompletionPermitted}\n${sectionRows}\n\n## Issue classifications\n\n${issueClassifications}\n\n## Admission audit matrix\n\n| Item | Extracted? | Structural evidence | Current authority | Canonical result | Admission candidate? | Missing proof |\n|---|---|---|---|---|---|---|\n${matrix}\n`;
}

function permissionForSection(section: string): keyof CanonicalMerchantReportProjectionV2["permissions"] {
  const mapping = { snapshot: "financial_metrics", pricing: "pricing", composition: "composition", attention: "attention",
    questions: "statement_evidence", inventory: "inventory", actions: "actions", continuation: "continuation", methodology: "methodology" } as const;
  return mapping[section as keyof typeof mapping];
}

export async function writeFiservReviewBundle(outputDirectory: string, projection: CanonicalMerchantReportProjectionV2,
  auditWithoutChecksum: Omit<FiservEvaluationRunAudit, "projectionChecksum">): Promise<FiservEvaluationRunAudit> {
  const projectionText = `${JSON.stringify(projection, null, 2)}\n`;
  const audit: FiservEvaluationRunAudit = { ...auditWithoutChecksum,
    projectionChecksum: createHash("sha256").update(projectionText).digest("hex") };
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "rh-projection.json"), projectionText, "utf8"),
    writeFile(path.join(outputDirectory, "review.md"), formatFiservBackendReview(projection, audit), "utf8"),
    writeFile(path.join(outputDirectory, "run-audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8"),
  ]);
  return audit;
}
