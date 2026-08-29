import { createHash } from "node:crypto";

import type { ParsedDocument } from "../../../parser.js";
import type { ParserDecision, ParserDriver, ParserValidationState } from "../../../parserFoundation.js";
import {
  fiservFirstDataFullStatementDriver,
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataShortStatementDriver,
} from "../../../fiservFirstDataParser.js";
import { genericFiservStatementDriver } from "../../../genericFiservStatementParser.js";
import { canonicalJson } from "../canonicalJson.js";
import { buildCanonicalEconomicsV2FromFiserv } from "../fiservAdapter.js";
import { resolveFiservTemplateAdmission } from "../fiservTemplateAdmission.js";
import { resolveFiservRuntimeCapabilityAdmission } from "../fiservRuntimeCapabilityAdmission.js";
import { buildObservationalCanonicalPricingV2FromFiserv } from "../fiservPricingAdapter.js";
import { buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing } from "../fiservEconomicAdapter.js";
import { observeFiservEconomicsInCanonicalSynthesisV2 } from "../fiservSynthesisAdapter.js";
import { composeCanonicalMerchantReportV2 } from "../report/reportHarness.js";
import { buildSourceReadinessEnvelope } from "../evaluation/sourceReadiness.js";
import { buildCanonicalUnresolvedClaimInventory } from "./unresolvedClaims.js";
import {
  buildCanonicalRfClaimResolution,
  canonicalRfKnowledgeSnapshot,
  validateCanonicalRfSemanticConvergence,
  type CanonicalRfKnowledgeInput,
} from "./rfClaimResolution.js";
import type { CanonicalEconomicSemanticApplicationAdmission } from "../economicAnalysis.js";
import { buildCanonicalRgWorkLedger } from "./rgWorkLedger.js";
import type { CanonicalEconomicsV2CompletenessStatus } from "../types.js";
import { canonicalStateHash as buildCanonicalStateHash, financialFoundationHash, semanticStateHash } from "./integrityHashes.js";
import { buildSemanticTailPlan, buildSemanticTailRd, buildSemanticTailRe, buildSemanticTailRh,
  buildSemanticTailUnresolved } from "./semanticTail.js";
import {
  ANALYSIS_RUN_IMPLEMENTATION_VERSION,
  ANALYSIS_RUN_POLICY_VERSION,
  ANALYSIS_RUN_SCHEMA_VERSION,
  ANALYSIS_RUN_STAGE_IDS,
  type AnalysisRunStageId,
  type AnalysisRunStageObserver,
  type AnalysisRunStageOutcome,
  type CanonicalAnalysisArtifacts,
  type CanonicalAnalysisRun,
  type CanonicalAnalysisRunExecution,
} from "./analysisRunTypes.js";
import { initialAutonomousLifecycle } from "./adaptiveContinuationTypes.js";

const DRIVERS: ParserDriver[] = [
  fiservFirstDataProcessorStatementDriver,
  fiservFirstDataFullStatementDriver,
  fiservFirstDataShortStatementDriver,
  genericFiservStatementDriver,
];

type StageBuilders = {
  pricing: typeof buildObservationalCanonicalPricingV2FromFiserv;
  economic: (
    pricing: Parameters<typeof buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing>[0],
    applications?: readonly CanonicalEconomicSemanticApplicationAdmission[],
  ) => ReturnType<typeof buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing>;
  synthesis: typeof observeFiservEconomicsInCanonicalSynthesisV2;
  claims: typeof buildCanonicalUnresolvedClaimInventory;
  rgPlanning: typeof buildCanonicalRgWorkLedger;
  report: typeof composeCanonicalMerchantReportV2;
};

const DEFAULT_BUILDERS: StageBuilders = {
  pricing: buildObservationalCanonicalPricingV2FromFiserv,
  economic: buildCapabilityBoundCanonicalEconomicsV2FromFiservPricing,
  synthesis: observeFiservEconomicsInCanonicalSynthesisV2,
  claims: buildCanonicalUnresolvedClaimInventory,
  rgPlanning: buildCanonicalRgWorkLedger,
  report: composeCanonicalMerchantReportV2,
};

export function sourceFingerprintForAnalysisRun(document: ParsedDocument): string {
  return createHash("sha256").update(canonicalJson({
    sourceType: document.sourceType,
    headers: document.headers,
    rows: document.rows,
    extraction: document.extraction,
    suppliedDocumentIntegrity: document.suppliedDocumentIntegrity ?? null,
  })).digest("hex");
}

export function executeDeterministicCanonicalAnalysisRun(input: {
  runId: string;
  sourceDocumentRef: string;
  document: ParsedDocument;
  sourceProfile?: { statementCompleteness?: CanonicalEconomicsV2CompletenessStatus; humanReviewRequired?: boolean };
  executionContext?: "production" | "evaluation_compatibility";
  privacySafePersistence?: boolean;
  evaluationContinueInvalidStages?: boolean;
  observer?: AnalysisRunStageObserver;
  stageBuilders?: Partial<StageBuilders>;
  rfKnowledge?: CanonicalRfKnowledgeInput;
}): CanonicalAnalysisRunExecution {
  const fingerprint = sourceFingerprintForAnalysisRun(input.document);
  const executionContext = input.executionContext ?? "production";
  if (input.evaluationContinueInvalidStages && executionContext !== "evaluation_compatibility") {
    throw new Error("INVALID_ANALYSIS_RUN_EXECUTION_CONTEXT");
  }
  const stageOutcomes = emptyStageOutcomes();
  const artifacts: CanonicalAnalysisArtifacts = {
    rb: null, rc: null, rfResolution: null, rd: null, re: null, unresolvedClaims: null, rgWorkLedger: null, rh: null,
  };
  const profile = input.sourceProfile ?? {};
  const statementCompleteness = profile.statementCompleteness ?? "unknown";
  if (!(["complete", "incomplete", "unknown", "unavailable"] as const).includes(statementCompleteness)) {
    throw new Error("INVALID_STATEMENT_COMPLETENESS");
  }
  const suppliedDocument = suppliedDocumentIntegrity(input.document);
  finishStage(input.observer, stageOutcomes, "source_ingress", "valid", {
    schemaVersion: "analysis_run_source_ingress_v1",
    sourceDocumentRef: input.sourceDocumentRef,
    sourceFingerprint: fingerprint,
    sourceType: input.document.sourceType,
    extractionMode: input.document.extraction.mode,
    suppliedDocumentIntegrity: suppliedDocument.status,
  }, [], [], []);

  const driverCandidates = DRIVERS.filter((candidate) => candidate.supports(input.document));
  if (driverCandidates.length === 0) {
    const limitation = "No supported Fiserv-family parser could be selected from source evidence.";
    finishStage(input.observer, stageOutcomes, "capability_admission", "unsupported", null, [], [], [limitation]);
    for (const stage of ["rb", "rc", "rf_resolution", "rd", "re", "claim_inventory", "rg_planning", "rh"] as const) {
      finishStage(input.observer, stageOutcomes, stage, "unresolved", null, [], [], ["Upstream Fiserv-family admission is unsupported."]);
    }
    return {
      run: terminalRun({ input, fingerprint, status: "unsupported", parser: { matched: false, driverId: null, reportable: false,
        decisionStatus: "unsupported", validationState: "missing" }, familyStatus: "unsupported", capabilityProof: null,
        admission: null, knownLayoutAdmission: null, fullFamilyDecision: null, readiness: null, artifacts, stageOutcomes,
        limitations: [limitation] }),
      diagnostics: emptyDiagnostics(input.document, profile, statementCompleteness, suppliedDocument),
    };
  }

  let driver: ParserDriver | null = null;
  let parserOutput: Record<string, any> | null = null;
  const parserFailures: string[] = [];
  for (const candidate of driverCandidates) {
    try {
      parserOutput = addRuntimeFamilyEvidence(input.document, record(candidate.parse(input.document)));
      if (input.privacySafePersistence) parserOutput = stripMerchantIdentityEvidence(parserOutput);
      driver = candidate;
      break;
    } catch (error) {
      parserFailures.push(`${candidate.id}: ${errorMessage(error)}`);
    }
  }
  if (!driver || !parserOutput) {
    const limitation = `Deterministic Fiserv parsers failed: ${parserFailures.join("; ") || "unknown_error"}`;
    finishStage(input.observer, stageOutcomes, "capability_admission", "failed", null, [limitation], [], [limitation]);
    for (const stage of ["rb", "rc", "rf_resolution", "rd", "re", "claim_inventory", "rg_planning", "rh"] as const) {
      finishStage(input.observer, stageOutcomes, stage, "unresolved", null, [], [], ["Parser failure withheld this dependent stage."]);
    }
    return {
      run: terminalRun({ input, fingerprint, status: "failed", parser: { matched: true, driverId: driverCandidates[0]?.id ?? null, reportable: false,
        decisionStatus: "failed", validationState: "failed" }, familyStatus: "unresolved", capabilityProof: null,
        admission: null, knownLayoutAdmission: null, fullFamilyDecision: null, readiness: null, artifacts, stageOutcomes,
        limitations: [limitation] }),
      diagnostics: { ...emptyDiagnostics(input.document, profile, statementCompleteness, suppliedDocument),
        driver: driverCandidates[0] ?? null },
    };
  }

  const identity = record(parserOutput.statementIdentity);
  const selected = record(parserOutput.selectedFinancials);
  const decision = record(parserOutput.decision) as ParserDecision & Record<string, unknown>;
  const validationState = normalizeParserValidation(decision.validationState);
  const documentIntegrity = {
    suppliedDocumentStatus: suppliedDocument.status,
    observedPageCount: suppliedDocument.enumeratedPageCount,
    processedPageCount: suppliedDocument.processedPageCount,
    fatalPageErrorCount: suppliedDocument.fatalPageErrorCount,
    extractionLineageComplete: suppliedDocument.extractionLineageComplete,
    localIngestionTruncated: suppliedDocument.localIngestionTruncated,
    completenessStatus: statementCompleteness,
  };
  const provenance = "observational" as const;
  let observationalFoundation: ReturnType<typeof buildCanonicalEconomicsV2FromFiserv> | null = null;
  let admission: ReturnType<typeof resolveFiservRuntimeCapabilityAdmission>["resolution"] = null;
  let knownLayoutAdmission: ReturnType<typeof resolveFiservTemplateAdmission>["resolution"] = null;
  let fullFamilyDecision: ReturnType<typeof resolveFiservTemplateAdmission>["fullFamilyDecision"] | null = null;
  let capabilityProof: ReturnType<typeof resolveFiservRuntimeCapabilityAdmission>["proof"] | null = null;
  let readiness: ReturnType<typeof buildSourceReadinessEnvelope> | null = null;

  try {
    observationalFoundation = buildCanonicalEconomicsV2FromFiserv({
      document: input.document,
      parserOutput,
      sourceDocumentRef: input.sourceDocumentRef,
      parserId: driver.id,
      provenanceStatus: provenance,
      templateAdmission: { admissionStatus: "unknown", completenessStatus: "unknown", identityStatus: "observed" },
      documentIntegrity,
    });
    const knownEvaluation = resolveFiservTemplateAdmission({ driverId: driver.id, parserOutput, observationalFoundation });
    knownLayoutAdmission = knownEvaluation.resolution;
    fullFamilyDecision = knownEvaluation.fullFamilyDecision;
    const runtimeAdmission = resolveFiservRuntimeCapabilityAdmission({
      driverId: driver.id,
      parserOutput,
      observationalFoundation,
      knownLayoutResolution: knownLayoutAdmission,
      dynamicAdmissionAllowed: ![
        "fiserv_first_data_full_statement",
        "fiserv_first_data_short_statement",
      ].includes(driver.id) || knownLayoutAdmission !== null,
    });
    admission = runtimeAdmission.resolution;
    capabilityProof = runtimeAdmission.proof;
    const capabilityStatus = admission ? "valid" : "unresolved";
    finishStage(input.observer, stageOutcomes, "capability_admission", capabilityStatus, capabilityProof, [], [],
      admission ? capabilityProof.limitations : [...capabilityProof.limitations,
        capabilityProof.family.status === "proven"
          ? "Claim capabilities were not admitted; an exact-layout admission failed or claim proof was insufficient."
          : "Fiserv-family identity was not proven."]);
  } catch (error) {
    const limitation = `Capability admission failed closed: ${errorMessage(error)}`;
    finishStage(input.observer, stageOutcomes, "capability_admission", "failed", capabilityProof, [limitation], [], [limitation]);
  }

  const parserState = {
    matched: true,
    driverId: driver.id,
    reportable: Boolean(decision.reportable),
    decisionStatus: String(decision.status ?? "failed"),
    validationState,
  };
  readiness = buildSourceReadinessEnvelope({
    parser: {
      driverId: driver.id,
      reportable: Boolean(decision.reportable),
      decisionStatus: parserDecisionStatus(decision.status),
      validationState,
    },
    source: {
      provenance,
      templateAdmission: admission ? "admitted" : "unknown",
      suppliedDocumentIntegrity: suppliedDocument.status,
      statementCompleteness,
      authority: "observational",
      humanReviewRequired: profile.humanReviewRequired ?? false,
    },
  });

  if (observationalFoundation) {
    try {
      artifacts.rb = admission ? buildCanonicalEconomicsV2FromFiserv({
        document: input.document,
        parserOutput,
        sourceDocumentRef: input.sourceDocumentRef,
        parserId: driver.id,
        provenanceStatus: provenance,
        templateAdmission: admission.templateAdmission,
        sectionAdmissions: admission.sectionAdmissions,
        documentIntegrity,
      }) : observationalFoundation;
      finishValidatedStage(input.observer, stageOutcomes, "rb", artifacts.rb, artifacts.rb.validation);
    } catch (error) {
      failStage(input.observer, stageOutcomes, "rb", error);
    }
  } else {
    finishStage(input.observer, stageOutcomes, "rb", "unresolved", null, [], [], ["Capability-admission construction did not produce an observational RB foundation."]);
  }

  const builders = { ...DEFAULT_BUILDERS, ...(input.stageBuilders ?? {}) };
  if (artifacts.rb && (artifacts.rb.validation.status === "valid" || input.evaluationContinueInvalidStages)) {
    try {
      artifacts.rc = builders.pricing(artifacts.rb);
      finishValidatedStage(input.observer, stageOutcomes, "rc", artifacts.rc, artifacts.rc.validation);
    } catch (error) { failStage(input.observer, stageOutcomes, "rc", error); }
  } else dependencyWithheld(input.observer, stageOutcomes, "rc", "RB");

  let provisionalRd: CanonicalAnalysisArtifacts["rd"] = null;
  if (artifacts.rc && (artifacts.rc.validation.status === "valid" || input.evaluationContinueInvalidStages)) {
    try {
      provisionalRd = buildSemanticTailRd({ pricing: artifacts.rc, applications: [], builder: builders.economic });
      const provisionalClaims = buildSemanticTailUnresolved({ pricing: artifacts.rc, economic: provisionalRd, synthesis: null }, builders.claims);
      const rfKnowledge = input.rfKnowledge ?? {
        entries: [], tenantRef: `analysis_run_${input.runId}`, accountRef: `analysis_run_${input.runId}`,
        binding: {
          source: "run_isolated_empty" as const,
          availability: "available" as const,
          expectedSnapshotHash: canonicalRfKnowledgeSnapshot([]).snapshotHash,
          visibilityMode: "anonymous_run" as const,
          tenantPrivateKnowledge: "disabled" as const,
          limitationCodes: [],
        },
      };
      artifacts.rfResolution = buildCanonicalRfClaimResolution({
        inventory: provisionalClaims,
        economic: provisionalRd,
        entries: rfKnowledge.entries,
        tenantRef: rfKnowledge.tenantRef,
        accountRef: rfKnowledge.accountRef,
        binding: rfKnowledge.binding,
      });
      finishValidatedStage(input.observer, stageOutcomes, "rf_resolution", artifacts.rfResolution,
        artifacts.rfResolution.validation);
    } catch (error) { failStage(input.observer, stageOutcomes, "rf_resolution", error); }
  } else dependencyWithheld(input.observer, stageOutcomes, "rf_resolution", "RC");

  if (artifacts.rc && (artifacts.rc.validation.status === "valid" || input.evaluationContinueInvalidStages)) {
    try {
      const applications = artifacts.rfResolution?.validation.status === "valid"
        ? artifacts.rfResolution.semanticApplications
        : [];
      const resolvedRd = applications.length === 0 && provisionalRd ? provisionalRd
        : buildSemanticTailRd({ pricing: artifacts.rc, applications, builder: builders.economic });
      if (provisionalRd && artifacts.rfResolution?.validation.status === "valid") {
        const convergenceErrors = validateCanonicalRfSemanticConvergence({
          base: provisionalRd, resolved: resolvedRd, rf: artifacts.rfResolution,
        });
        if (convergenceErrors.length > 0) throw new Error(convergenceErrors.join(","));
      }
      artifacts.rd = resolvedRd;
      finishValidatedStage(input.observer, stageOutcomes, "rd", artifacts.rd, artifacts.rd.validation);
    } catch (error) { failStage(input.observer, stageOutcomes, "rd", error); }
  } else dependencyWithheld(input.observer, stageOutcomes, "rd", "RC");

  if (artifacts.rd && (artifacts.rd.validation.status === "valid" || input.evaluationContinueInvalidStages)) {
    try {
      artifacts.re = buildSemanticTailRe({ economic: artifacts.rd, builder: builders.synthesis });
      finishValidatedStage(input.observer, stageOutcomes, "re", artifacts.re, artifacts.re.validation);
    } catch (error) { failStage(input.observer, stageOutcomes, "re", error); }
  } else dependencyWithheld(input.observer, stageOutcomes, "re", "RD");

  try {
    artifacts.unresolvedClaims = buildSemanticTailUnresolved({ pricing: artifacts.rc, economic: artifacts.rd, synthesis: artifacts.re }, builders.claims);
    finishValidatedStage(input.observer, stageOutcomes, "claim_inventory", artifacts.unresolvedClaims,
      artifacts.unresolvedClaims.validation);
  } catch (error) {
    failStage(input.observer, stageOutcomes, "claim_inventory", error);
  }

  if (artifacts.unresolvedClaims && artifacts.unresolvedClaims.validation.status === "valid") {
    try {
      artifacts.rgWorkLedger = buildSemanticTailPlan({
        inventory: artifacts.unresolvedClaims,
        economic: artifacts.rd,
        synthesis: artifacts.re,
        rfResolution: artifacts.rfResolution,
      }, builders.rgPlanning);
      finishValidatedStage(input.observer, stageOutcomes, "rg_planning", artifacts.rgWorkLedger,
        artifacts.rgWorkLedger.validation);
    } catch (error) { failStage(input.observer, stageOutcomes, "rg_planning", error); }
  } else dependencyWithheld(input.observer, stageOutcomes, "rg_planning", "canonical claim inventory");

  if (artifacts.re && (artifacts.re.validation.status === "valid" || input.evaluationContinueInvalidStages) && readiness) {
    try {
      artifacts.rh = buildSemanticTailRh({ synthesisAnalysis: artifacts.re, sourceReadiness: readiness }, builders.report);
      finishValidatedStage(input.observer, stageOutcomes, "rh", artifacts.rh, artifacts.rh.audit.validation);
    } catch (error) { failStage(input.observer, stageOutcomes, "rh", error); }
  } else dependencyWithheld(input.observer, stageOutcomes, "rh", "RE");

  const limitations = unique([
    ...(capabilityProof?.limitations ?? []),
    ...(capabilityProof?.capabilities.filter((capability) => capability.status !== "supported")
      .map((capability) => `${capability.capability}: unresolved`) ?? []),
    ...(readiness?.outcome.reasonCodes ?? []),
    ...ANALYSIS_RUN_STAGE_IDS.flatMap((stage) => stageOutcomes[stage].status === "valid" ? [] : stageOutcomes[stage].limitations),
  ]);
  const failed = ANALYSIS_RUN_STAGE_IDS.some((stage) => stageOutcomes[stage].status === "failed");
  const invalid = ANALYSIS_RUN_STAGE_IDS.some((stage) => stageOutcomes[stage].status === "invalid");
  const status = failed && !artifacts.rb ? "failed" as const
    : limitations.length > 0 || failed || invalid ? "completed_with_limitations" as const : "completed" as const;
  const canonicalTruthHash = artifacts.rb
    ? hashCanonical({ rb: artifacts.rb, rc: artifacts.rc, rd: artifacts.rd, re: artifacts.re })
    : null;
  const financialHash = financialFoundationHash({ sourceFingerprint: fingerprint, capabilityProof, artifacts });
  const semanticHash = artifacts.rb ? semanticStateHash(artifacts) : null;
  const canonicalStateHash = semanticHash ? buildCanonicalStateHash({ financialFoundationHash: financialHash,
    semanticHash, rfSnapshotHash: artifacts.rfResolution?.snapshot.snapshotHash ?? "" }) : null;
  return {
    run: terminalRun({ input, fingerprint, status, parser: parserState,
      familyStatus: capabilityProof?.family.status ?? "unresolved", capabilityProof, admission, knownLayoutAdmission,
      fullFamilyDecision, readiness, artifacts, stageOutcomes, canonicalTruthHash, financialFoundationHash: financialHash,
      semanticHash, canonicalStateHash, limitations }),
    diagnostics: {
      document: input.document,
      driver,
      parserOutput,
      decision,
      identity,
      selected,
      observed: observedFinancials(selected),
      statementCompleteness,
      suppliedDocument,
      profile,
      provenance,
      authority: "observational",
      observationalFoundation,
    },
  };
}

function terminalRun(input: {
  input: Parameters<typeof executeDeterministicCanonicalAnalysisRun>[0];
  fingerprint: string;
  status: CanonicalAnalysisRun["status"];
  parser: CanonicalAnalysisRun["parser"];
  familyStatus: CanonicalAnalysisRun["familyStatus"];
  capabilityProof: CanonicalAnalysisRun["capabilityProof"];
  admission: CanonicalAnalysisRun["admission"];
  knownLayoutAdmission: CanonicalAnalysisRun["knownLayoutAdmission"];
  fullFamilyDecision: CanonicalAnalysisRun["fullFamilyDecision"];
  readiness: CanonicalAnalysisRun["readiness"];
  artifacts: CanonicalAnalysisArtifacts;
  stageOutcomes: CanonicalAnalysisRun["stageOutcomes"];
  limitations: string[];
  canonicalTruthHash?: string | null;
  financialFoundationHash?: string | null;
  semanticHash?: string | null;
  canonicalStateHash?: string | null;
}): CanonicalAnalysisRun {
  return {
    manifest: {
      schemaVersion: ANALYSIS_RUN_SCHEMA_VERSION,
      implementationVersion: ANALYSIS_RUN_IMPLEMENTATION_VERSION,
      policyVersion: ANALYSIS_RUN_POLICY_VERSION,
      executionAuthority: input.input.executionContext === "evaluation_compatibility"
        ? "evaluation_non_authoritative" : "production_internal_canonical",
      customerReportAuthority: "legacy_report_unchanged",
      persistence: input.input.executionContext === "evaluation_compatibility" ? "none" : "durable_versioned_stage_snapshots",
      providerExecution: "durable_claim_bound_evidence_execution",
      publicResearch: "typed_search_intent_dynamic_authority_validation",
      rfProductionKnowledge: "governed_catalog_snapshot_resolution_enabled",
      rgPlanning: "durable_claim_scoped_execution_eligible",
      semanticConvergence: "current_run_exact_claim_revisioned",
      synthesisAdmissionContract: "canonical_synthesis_admission_contract_v1",
      adaptiveContinuation: "durable_deterministic_delta_admission",
      regeneratedPlanExecution: "continuation_authorized_existing_executor",
      benchmarkExecution: "disabled",
      savingsExecution: "disabled",
      businessContextAuthority: "excluded_from_canonical_economics",
      goldRuntimeAuthority: "prohibited_oracle_only",
    },
    runId: input.input.runId,
    sourceDocumentRef: input.input.sourceDocumentRef,
    sourceFingerprint: input.fingerprint,
    status: input.status,
    parser: input.parser,
    familyStatus: input.familyStatus,
    capabilityProof: input.capabilityProof,
    admission: input.admission,
    knownLayoutAdmission: input.knownLayoutAdmission,
    fullFamilyDecision: input.fullFamilyDecision,
    readiness: input.readiness,
    artifacts: input.artifacts,
    stageOutcomes: input.stageOutcomes,
    canonicalTruthHash: input.canonicalTruthHash ?? null,
    financialFoundationHash: input.financialFoundationHash ?? null,
    semanticHash: input.semanticHash ?? null,
    canonicalStateHash: input.canonicalStateHash ?? null,
    semanticRevision: 0,
    autonomousLifecycle: initialAutonomousLifecycle(),
    canonicalTruthPreserved: true,
    limitations: unique(input.limitations),
  };
}

function addRuntimeFamilyEvidence(document: ParsedDocument, parserOutput: Record<string, any>): Record<string, any> {
  const evidence = Array.isArray(parserOutput.evidence) ? [...parserOutput.evidence] : [];
  const rows = document.rows.map((row, index) => ({ row, index, content: String(row.content ?? "").trim() }));
  const identityRow = rows.find((item) => /\b(?:fiserv|first data|clover|basys(?:pro)?)\b/i.test(item.content));
  if (identityRow) evidence.push(evidenceEntry("processorIdentity", identityRow, "Fiserv-family source marker"));
  const structuralPatterns = [
    /\byour card processing statement\b/i,
    /\btotal amount submitted\b/i,
    /\btotal amount funded(?: to your bank)?\b/i,
    /\binterchange charges(?:\/program fees)?\b/i,
    /\bservice charges\b/i,
    /\bfees charged\b/i,
  ];
  for (const pattern of structuralPatterns) {
    const row = rows.find((item) => pattern.test(item.content));
    if (row) evidence.push(evidenceEntry("processorStructure", row, "Fiserv-family structural marker"));
  }
  return { ...parserOutput, evidence };
}

function stripMerchantIdentityEvidence(parserOutput: Record<string, any>): Record<string, any> {
  const evidence = Array.isArray(parserOutput.evidence)
    ? parserOutput.evidence.filter((item: unknown) => {
      const field = String(record(item).field ?? "");
      return field !== "merchantName" && field !== "merchantNumber";
    })
    : parserOutput.evidence;
  return { ...parserOutput, evidence };
}

function evidenceEntry(field: string, item: { row: Record<string, string | number>; index: number; content: string }, value: string) {
  const match = String(item.row.page ?? "").match(/page-(\d+)/i);
  return { field, sourceSection: "HEADER", pageNumber: match ? Number(match[1]) : null,
    lineIndex: item.index, evidenceLine: item.content, value };
}

function finishValidatedStage(
  observer: AnalysisRunStageObserver | undefined,
  outcomes: Record<AnalysisRunStageId, AnalysisRunStageOutcome>,
  stage: AnalysisRunStageId,
  artifact: unknown,
  validation: { status: "valid" | "invalid"; errors: string[]; warnings: string[] },
) {
  finishStage(observer, outcomes, stage, validation.status, artifact, validation.errors, validation.warnings,
    validation.status === "invalid" ? ["Stage validation failed; dependent claims remain unresolved."] : []);
}

function failStage(observer: AnalysisRunStageObserver | undefined,
  outcomes: Record<AnalysisRunStageId, AnalysisRunStageOutcome>, stage: AnalysisRunStageId, error: unknown) {
  const message = `${stage.toUpperCase()} execution failed closed: ${errorMessage(error)}`;
  finishStage(observer, outcomes, stage, "failed", null, [message], [], [message]);
}

function dependencyWithheld(observer: AnalysisRunStageObserver | undefined,
  outcomes: Record<AnalysisRunStageId, AnalysisRunStageOutcome>, stage: AnalysisRunStageId, dependency: string) {
  finishStage(observer, outcomes, stage, "unresolved", null, [], [],
    [`${stage.toUpperCase()} was withheld because ${dependency} was unavailable or invalid; previously proven upstream facts remain preserved.`]);
}

function finishStage(
  observer: AnalysisRunStageObserver | undefined,
  outcomes: Record<AnalysisRunStageId, AnalysisRunStageOutcome>,
  stage: AnalysisRunStageId,
  status: AnalysisRunStageOutcome["status"],
  artifact: unknown,
  errors: string[],
  warnings: string[],
  limitations: string[],
) {
  const claimRef = stageClaimRef(stage);
  observer?.stageStarted?.(stage, claimRef);
  const outcome: AnalysisRunStageOutcome = {
    stage,
    status,
    artifactHash: artifact === null || artifact === undefined ? null : hashCanonical(artifact),
    errors: unique(errors),
    warnings: unique(warnings),
    limitations: unique(limitations),
  };
  outcomes[stage] = outcome;
  observer?.stageFinished?.(stage, outcome, artifact);
}

function stageClaimRef(stage: AnalysisRunStageId) {
  const values: Record<AnalysisRunStageId, { claimRef: string; evidenceObjective: string; expectedDecisionEffect: string }> = {
    source_ingress: { claimRef: "source.integrity", evidenceObjective: "Fingerprint the supplied source and establish extraction lineage.", expectedDecisionEffect: "Permit or withhold deterministic source processing." },
    capability_admission: { claimRef: "source.fiserv_capabilities", evidenceObjective: "Prove Fiserv family and each claim-scoped capability from source lineage and controls.", expectedDecisionEffect: "Set per-capability canonical authority ceilings." },
    rb: { claimRef: "rb.financial_truth", evidenceObjective: "Build and validate source-grounded financial populations and reconciliation.", expectedDecisionEffect: "Admit only independently proven financial facts." },
    rc: { claimRef: "rc.pricing_architecture", evidenceObjective: "Preserve observed pricing components without importing unsupported semantics.", expectedDecisionEffect: "Resolve or withhold each pricing axis." },
    rf_resolution: { claimRef: "rf.claim_specific_resolution", evidenceObjective: "Resolve exact canonical semantic dependencies against an immutable, scoped, effective-dated admitted-knowledge snapshot.", expectedDecisionEffect: "Apply only independently admitted category mappings and preserve every adjacent unresolved claim." },
    rd: { claimRef: "rd.economic_ledger", evidenceObjective: "Build the direction-preserving economic ledger and apply only exact losslessly representable admitted RF semantic applications.", expectedDecisionEffect: "Preserve charges while resolving or withholding each category, ownership, and control facet independently." },
    re: { claimRef: "re.economic_synthesis", evidenceObjective: "Build only evidence-permitted drivers, counterfactuals, levers, and themes.", expectedDecisionEffect: "Resolve or withhold synthesis claims independently." },
    claim_inventory: { claimRef: "runtime.unresolved_claim_inventory", evidenceObjective: "Project the final typed unresolved dependencies after RF without executing RG, providers, or research.", expectedDecisionEffect: "Provide the later RG input while preserving every remaining claim-specific authority ceiling." },
    rg_planning: { claimRef: "rg.claim_admission_and_work_ledger", evidenceObjective: "Evaluate versioned claim-atomic materiality and durably plan only admitted material work against the bound RF context.", expectedDecisionEffect: "Admit bounded claim-specific RG work without executing providers, search, retrieval, AI, or changing canonical truth." },
    rh: { claimRef: "rh.report_projection", evidenceObjective: "Project a limitation-accurate internal RH artifact from validated upstream stages.", expectedDecisionEffect: "Expose exactly what is proven and withheld without changing Report V1." },
  };
  return values[stage];
}

function emptyStageOutcomes(): Record<AnalysisRunStageId, AnalysisRunStageOutcome> {
  return Object.fromEntries(ANALYSIS_RUN_STAGE_IDS.map((stage) => [stage, {
    stage, status: "pending", artifactHash: null, errors: [], warnings: [], limitations: [],
  }])) as unknown as Record<AnalysisRunStageId, AnalysisRunStageOutcome>;
}

function suppliedDocumentIntegrity(document: ParsedDocument) {
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

function emptyDiagnostics(document: ParsedDocument, profile: Record<string, unknown>,
  statementCompleteness: CanonicalEconomicsV2CompletenessStatus, suppliedDocument: ReturnType<typeof suppliedDocumentIntegrity>) {
  return { document, driver: null, parserOutput: null, decision: null, identity: {}, selected: {},
    observed: { processedSalesMinor: null, processingFeesMinor: null, effectiveRate: null, grossSaleTransactionCount: null,
      submittedTransactionCount: null, averageTicketMinor: null }, statementCompleteness, suppliedDocument, profile,
    provenance: "observational" as const, authority: "observational" as const, observationalFoundation: null };
}

function hashCanonical(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "unknown_error"; }
function record(value: unknown): Record<string, any> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}; }
function finite(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function minor(value: unknown): number | null { const amount = finite(value); return amount === null ? null : Math.round(amount * 100); }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))].sort(); }
