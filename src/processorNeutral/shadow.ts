import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ParsedDocument } from "../parser.js";
import type { CanonicalAnalysisRunExecution } from "../canonical/v2/runtime/analysisRunTypes.js";
import { FISERV_RUNTIME_CAPABILITY_POLICY_VERSION } from "../canonical/v2/fiservRuntimeCapabilityAdmission.js";
import { validateProcessorNeutralShadow } from "./core.js";
import { fiservRepresentationObservations } from "./fiservRepresentationAdapter.js";
import {
  PROCESSOR_NEUTRAL_CONTRACT_VERSION,
  type AdmissionPremise, type ChainRole, type OutputDecision, type ProcessorNeutralShadow,
  type SourceEvidence,
} from "./contracts.js";

const CHAIN_ROLES: readonly ChainRole[] = [
  "merchant_facing_brand", "statement_issuer_or_servicer", "sponsor_bank",
  "backend_processor", "processing_platform", "statement_renderer",
];
const require = createRequire(import.meta.url);
const PDFJS_BUILD_VERSION = String(require("pdfjs-dist/package.json").version);
const CSV_BUILD_VERSION = String(JSON.parse(readFileSync(path.resolve(
  path.dirname(require.resolve("csv-parse/sync")), "../../package.json"), "utf8")).version);
const PREMISES: readonly AdmissionPremise[] = [
  "source_integrity", "population_binding", "population_meaning", "sign_semantics",
  "period_semantics", "duplicate_representation", "independent_controls", "output_assumptions",
];

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Ported in spirit from e4877aa: typography is normalized for candidate search only.
// Raw source text remains unchanged, and this function never parses money or identities.
export function normalizeEvidenceText(value: string): string {
  return value.normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/gu, "-")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, " ")
    .replace(/\s+/gu, " ").trim();
}

export function observeParsedDocumentEvidence(document: ParsedDocument, inputSha256: string): SourceEvidence[] {
  const laneId = document.sourceType === "pdf" ? "pdfjs_current" : "csv_current";
  return document.rows.map((row, rowIndex) => {
    const rawText = String(row.content ?? Object.values(row).join(" | ")).trim();
    const pageMatch = String(row.page ?? "").match(/page-(\d+)/i);
    const pageNumber = pageMatch ? Number(pageMatch[1]) : null;
    const legacyRef = `document_row:${pageNumber ?? "unknown"}:${rowIndex}`;
    return {
      id: `evidence:${sha256(`${inputSha256}:${legacyRef}:${rawText}`).slice(0, 24)}`,
      laneId,
      rawText,
      normalizedText: normalizeEvidenceText(rawText),
      coordinate: { pageIndex: pageNumber === null ? null : pageNumber - 1, rowIndex,
        tokenStart: null, tokenEnd: null, polygon: null },
      modality: "direct_text" as const,
      transformation: "unicode_typography_and_whitespace" as const,
      legacyRef,
      conflictRefs: [],
    };
  }).filter((observation) => observation.rawText.length > 0);
}

/** Translate the existing Fiserv decision without granting any new permission. */
export function observeProcessorNeutralShadow(input: {
  document: ParsedDocument;
  inputBytes: Uint8Array;
  execution: CanonicalAnalysisRunExecution;
}): ProcessorNeutralShadow {
  const { document, execution } = input;
  const { run } = execution;
  const inputSha256 = sha256(input.inputBytes);
  const evidence = observeParsedDocumentEvidence(document, inputSha256);
  const integrity = document.suppliedDocumentIntegrity;
  const pageStatus = !integrity ? "unknown" : integrity.openedSuccessfully
    && integrity.processedPageCount === integrity.enumeratedPageCount
    && integrity.fatalPageErrorCount === 0 && integrity.extractionLineageComplete
    && !integrity.localIngestionTruncated ? "complete" : "incomplete";
  const proof = run.capabilityProof;
  const protocol = proof?.protocolIdentity;
  const controls = (run.artifacts.rb?.reconciliation ?? []).map((item) => ({
    id: item.id,
    populationIds: item.factRefs,
    // A separate implementation does not by itself prove independent source regions.
    independent: null,
    result: item.status,
    evidenceRefs: item.evidenceRefs,
    tolerance: item.tolerance,
  }));
  const outputs: OutputDecision[] = (proof?.outputPermissions ?? []).map((item) => ({
    outputId: item.output,
    state: item.state === "downstream_gated" ? "withheld" : item.state,
    legacyState: item.state,
    reasonCodes: item.reasonCodes,
    evidenceRefs: item.prerequisiteCapabilities.flatMap((id) => proof?.capabilities
      .filter((capability) => capability.capability === id)
      .flatMap((capability) => capability.proofEvidenceRefs) ?? []),
    assumptionIds: [],
    controlIds: item.prerequisiteCapabilities.flatMap((id) => proof?.capabilities
      .filter((capability) => capability.capability === id)
      .flatMap((capability) => capability.reconciliationControlRefs) ?? []),
    policyVersion: FISERV_RUNTIME_CAPABILITY_POLICY_VERSION,
    authority: "shadow_translation_only",
  }));
  const populations = Object.entries(run.artifacts.rb?.financialPopulations ?? {}).map(([id, fact]) => ({
    id,
    meaning: fact.populationDefinition,
    periodRelation: "unknown" as const,
    signSemantics: "unproven" as const,
    currency: fact.value && typeof fact.value === "object" && "currency" in fact.value
      ? String(fact.value.currency) : null,
    sourceRefs: fact.evidenceRefs,
    duplicateGroup: null,
  }));
  const financialAdmission = outputs.map((decision) => ({
    outputId: decision.outputId,
    status: decision.legacyState === "permitted" || decision.legacyState === "limited"
      ? "admitted" as const : "withheld" as const,
    premises: Object.fromEntries(PREMISES.map((premise) => [premise,
      decision.legacyState === "permitted" || decision.legacyState === "limited"
        ? "legacy_translated" : "unresolved"])) as Record<AdmissionPremise, "legacy_translated" | "unresolved">,
    populationIds: proof?.outputPermissions.find((item) => item.output === decision.outputId)?.prerequisiteCapabilities ?? [],
    controlIds: decision.controlIds,
    evidenceRefs: decision.evidenceRefs,
    assumptionIds: [],
    reasonCodes: [...decision.reasonCodes, "shadow_only_no_new_financial_authority"],
  }));
  const claimDecisionHash = run.artifacts.unresolvedClaims
    ? sha256(JSON.stringify(run.artifacts.unresolvedClaims)) : null;
  const legacyVisibleBrand = typeof execution.diagnostics.identity.visibleBrand === "string"
    ? execution.diagnostics.identity.visibleBrand : null;
  const laneId = document.sourceType === "pdf" ? "pdfjs_current" : "csv_current";
  return validateProcessorNeutralShadow({
    manifest: {
      schemaVersion: PROCESSOR_NEUTRAL_CONTRACT_VERSION,
      inputSha256,
      extractorLanes: [{ id: laneId,
        implementation: document.sourceType === "pdf" ? "pdfjs_dist_existing_parser" : "csv_parse_existing_parser",
        buildVersion: document.sourceType === "pdf" ? PDFJS_BUILD_VERSION : CSV_BUILD_VERSION,
        modelVersion: null, configHash: null, modality: "direct_text" }],
      grammarReleases: run.parser.driverId ? [`legacy_adapter:${run.parser.driverId}`] : [],
      chainKnowledgeRelease: null,
      financialPolicyVersion: run.manifest.policyVersion,
      outputPolicyVersion: FISERV_RUNTIME_CAPABILITY_POLICY_VERSION,
      claimAuthorityVersion: "existing_runtime_unchanged",
      legacyRunVersion: run.manifest.schemaVersion,
      mode: "shadow",
    },
    document: { sha256: inputSha256, byteLength: input.inputBytes.byteLength, sourceType: document.sourceType },
    pages: { enumerated: integrity?.enumeratedPageCount ?? null, processed: integrity?.processedPageCount ?? null,
      fatalErrors: integrity?.fatalPageErrorCount ?? null,
      localTruncation: integrity?.localIngestionTruncated ?? null, status: pageStatus },
    evidence,
    protocol: { grammarId: protocol?.target ?? "unresolved", variantId: null,
      version: protocol?.ruleVersion ?? "none", driverId: run.parser.driverId,
      status: protocol?.status === "proven" ? "resolved" : run.parser.matched ? "candidate" : "unresolved",
      evidenceRefs: protocol?.proofEvidenceRefs ?? [],
      negativeCollisionRefs: protocol?.contradictoryOriginEvidenceRefs ?? [],
      representationObservations: fiservRepresentationObservations(evidence),
      reasonCodes: protocol?.reasonCodes ?? ["no_current_protocol_proof"] },
    chain: CHAIN_ROLES.map((role) => role === "merchant_facing_brand" && legacyVisibleBrand
      ? { role, status: "candidate", value: legacyVisibleBrand, competingValues: [], sourceRefs: [],
        knowledgeRelease: null, ruleId: "legacy_parser_display_label_only",
        limitations: ["Legacy visible brand may be filename-derived; it is not source-proven chain identity."] }
      : { role, status: "unresolved", value: null,
        competingValues: [], sourceRefs: [], knowledgeRelease: null, ruleId: null,
        limitations: ["No governed chain resolution runs in Phase 1."] }),
    populations,
    assumptions: [],
    controls,
    financialAdmission,
    outputs,
    canonicalFinancialHash: run.financialFoundationHash,
    claimAuthority: { consumer: "existing_claim_authority", inputs: ["canonical_existing_runtime"],
      decisionHash: claimDecisionHash, mayAuthorizeFromShadow: false },
    rollback: "omit_shadow_observer",
  });
}
