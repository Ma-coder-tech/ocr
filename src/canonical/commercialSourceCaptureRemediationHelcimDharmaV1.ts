import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createCommercialSourceGovernanceRegistryV1,
  type CommercialSourceGovernanceRegistryV1,
  type CommercialSourceObservationV1,
} from "./commercialSourceGovernanceV1.js";
import type { ImmutableCommercialSourceCaptureBaselineV1 } from "./commercialImmutableSourceCaptureBaselineV1.js";

export const HELCIM_DHARMA_IMMUTABLE_CAPTURE_REMEDIATION_V1 =
  "helcim_dharma_immutable_capture_remediation_2026_09_10_v1" as const;

export const HELCIM_DHARMA_CAPTURE_REMEDIATION_PRODUCT_AUTHORITY_V1 = {
  document: "RateReveal_Helcim_Dharma_Immutable_Capture_Remediation_Product_Authority_v1.md",
  sha256: "fdce0458e370b0ac9c532e5abd187c1470801e22fec8292036ca00de85eb3658",
  section: "all",
} as const;

export type HelcimDharmaRemediationComparisonStateV1 =
  | "capture_matches_admitted_observation"
  | "capture_partial_but_nonconflicting"
  | "capture_conflict_requires_product_review"
  | "immutable_capture_unavailable_after_remediation";

type RawRemediationRecord = {
  captureId: string;
  provider: "helcim" | "dharma_merchant_services";
  sourceIdentity: string;
  sourceObservationId: string;
  relationshipToAdmittedObservation: string;
  requestedUrl: string;
  finalUrl: string | null;
  redirected: boolean | null;
  retrievalTimestampUtc: string;
  timezone: "UTC";
  browserProfile: string;
  captureMethod: "browser_rendered_print_to_pdf";
  contentType: "application/pdf";
  mainDocumentHttpStatus: number | null;
  mainDocumentHttpStatusText: string | null;
  mainDocumentMimeType: string | null;
  pageTitle: string | null;
  pageReadyState: string | null;
  byteLength: number;
  artifactPath: string;
  artifactSha256: string;
  artifactRole: "immutable_first_party_rendered_F1" | "remediation_failure_evidence_not_F1";
  remediationState: "captured" | "immutable_capture_unavailable_after_remediation";
  expectedAnchors: string[];
  matchedAnchors: string[];
  missingAnchors: string[];
  denialMarker: string | null;
  navigationError: string | null;
  hostChanged: boolean;
  credentialsUsed: false;
  authenticationUsed: false;
  antiBotBypassUsed: false;
};

export type HelcimDharmaCaptureRemediationRecordV1 = RawRemediationRecord & {
  comparisonState: HelcimDharmaRemediationComparisonStateV1;
  unadjudicatedSourceContent: string[];
  attemptHistory: NonNullable<NonNullable<CommercialSourceObservationV1["immutableCapture"]>["remediation"]>["attempts"];
};

export type HelcimDharmaCaptureRemediationBaselineV1 = {
  schemaVersion: typeof HELCIM_DHARMA_IMMUTABLE_CAPTURE_REMEDIATION_V1;
  productAuthority: typeof HELCIM_DHARMA_CAPTURE_REMEDIATION_PRODUCT_AUTHORITY_V1;
  records: HelcimDharmaCaptureRemediationRecordV1[];
};

const UNADJUDICATED_SOURCE_CONTENT: Record<string, string[]> = {
  d1_dharma_retail: ["Current rendered page includes illustrative card-specific interchange, assessment, and total-cost examples outside the already-admitted direct-plan component scope; preserved but not normalized or admitted."],
  d2_dharma_virtual: ["Current rendered page includes illustrative card-specific cost examples and broader promotional content outside the already-admitted Virtual/Online component scope; preserved but not normalized or admitted."],
  d8_dharma_referral: ["Current rendered referral page includes additional referral-channel terms, terminal pricing, gateway pricing, rate components, and application language beyond the Product-admitted $12 channel-isolation control; preserved but not normalized or admitted."],
};

export async function loadHelcimDharmaCaptureRemediationBaselineV1(input: {
  priorBaseline: ImmutableCommercialSourceCaptureBaselineV1;
  rootDir?: string;
}): Promise<HelcimDharmaCaptureRemediationBaselineV1> {
  const rootDir = input.rootDir ?? process.cwd();
  const manifest = JSON.parse(await readFile(path.join(rootDir, "evidence/commercial-source-capture-remediation-helcim-dharma-v1/capture-manifest.json"), "utf8")) as {
    productAuthority: { sha256: string };
    records: RawRemediationRecord[];
  };
  if (manifest.productAuthority.sha256 !== HELCIM_DHARMA_CAPTURE_REMEDIATION_PRODUCT_AUTHORITY_V1.sha256) throw new Error("Remediation Product authority fingerprint mismatch.");
  if (manifest.records.length !== 12) throw new Error(`Expected 12 remediation records, received ${manifest.records.length}.`);
  const priorById = new Map(input.priorBaseline.records.map((item) => [item.captureId, item]));
  return {
    schemaVersion: HELCIM_DHARMA_IMMUTABLE_CAPTURE_REMEDIATION_V1,
    productAuthority: HELCIM_DHARMA_CAPTURE_REMEDIATION_PRODUCT_AUTHORITY_V1,
    records: manifest.records.map((record) => {
      const prior = priorById.get(record.captureId);
      if (!prior) throw new Error(`Missing prior capture attempt for ${record.captureId}.`);
      const comparisonState: HelcimDharmaRemediationComparisonStateV1 = record.remediationState === "captured"
        ? "capture_matches_admitted_observation"
        : "immutable_capture_unavailable_after_remediation";
      return {
        ...record,
        comparisonState,
        unadjudicatedSourceContent: UNADJUDICATED_SOURCE_CONTENT[record.captureId] ?? [],
        attemptHistory: [
          {
            method: prior.captureMethod,
            result: prior.captureState,
            attemptedAtUtc: prior.retrievalTimestampUtc,
            status: prior.httpStatus,
            artifactPath: prior.artifactPath,
            artifactSha256: prior.artifactSha256,
            artifactRole: "failure_evidence_not_F1",
          },
          {
            method: "codex_in_app_browser_rendered_page_validation",
            result: prior.renderedFallback?.result ?? "rendered_fallback_not_available",
            attemptedAtUtc: "2026-09-10T19:57:11.000Z",
            status: null,
            artifactPath: null,
            artifactSha256: null,
            artifactRole: "no_artifact",
          },
          {
            method: record.captureMethod,
            result: record.remediationState,
            attemptedAtUtc: record.retrievalTimestampUtc,
            status: record.mainDocumentHttpStatus,
            artifactPath: record.artifactPath,
            artifactSha256: record.artifactSha256,
            artifactRole: record.remediationState === "captured" ? "immutable_first_party_F1" : "failure_evidence_not_F1",
          },
        ],
      };
    }),
  };
}

export function applyHelcimDharmaCaptureRemediationV1(input: {
  registry: CommercialSourceGovernanceRegistryV1;
  baseline: HelcimDharmaCaptureRemediationBaselineV1;
}): CommercialSourceGovernanceRegistryV1 {
  const records = new Map(input.baseline.records.map((item) => [item.sourceObservationId, item]));
  const sourceObservations = input.registry.sourceObservations.map((observation) => {
    const record = records.get(observation.observationId);
    if (!record) return structuredClone(observation);
    const captured = record.remediationState === "captured";
    const priorProvisionalF1 = observation.immutableCapture?.priorProvisionalF1Fingerprint ?? observation.fingerprints.f1RawSourceDocument;
    const adjudicationAuthorityArtifactRef = observation.immutableCapture?.adjudicationAuthorityArtifactRef ?? observation.provenance.rawArtifactRef;
    return {
      ...structuredClone(observation),
      provenance: {
        ...structuredClone(observation.provenance),
        rawArtifactRef: captured ? `${record.artifactPath}@sha256:${record.artifactSha256}` : observation.provenance.rawArtifactRef,
        retrievabilityLimitation: captured ? null : `${observation.provenance.retrievabilityLimitation ?? ""} Approved remediation remained unavailable: ${record.pageTitle ?? record.denialMarker ?? record.navigationError ?? "unknown failure"}.`.trim(),
      },
      fingerprints: {
        ...observation.fingerprints,
        f1RawSourceDocument: captured ? record.artifactSha256 : observation.fingerprints.f1RawSourceDocument,
      },
      immutableCapture: {
        ...observation.immutableCapture!,
        captureRecordRef: record.captureId,
        captureState: captured ? "captured" as const : "capture_unavailable" as const,
        validationState: captured ? record.comparisonState as "capture_matches_admitted_observation" : "capture_unavailable" as const,
        retainedFirstPartyArtifactPath: captured ? record.artifactPath : null,
        retainedFirstPartyArtifactSha256: captured ? record.artifactSha256 : null,
        priorProvisionalF1Fingerprint: priorProvisionalF1,
        adjudicationAuthorityArtifactRef,
        retrievalTimestampUtc: record.retrievalTimestampUtc,
        relationship: "immutable_capture_to_observation_to_f2_to_f3" as const,
        remediation: {
          productAuthorityDocument: input.baseline.productAuthority.document,
          productAuthoritySha256: input.baseline.productAuthority.sha256,
          remediationState: record.remediationState,
          comparisonState: record.comparisonState,
          attempts: record.attemptHistory,
          latestArtifactPath: record.artifactPath,
          latestArtifactSha256: record.artifactSha256,
          unadjudicatedSourceContent: record.unadjudicatedSourceContent,
        },
      },
    } satisfies CommercialSourceObservationV1;
  });
  return createCommercialSourceGovernanceRegistryV1({
    sourceObservations,
    priceComponentVersions: input.registry.priceComponentVersions,
    publicPolicyVersions: input.registry.publicPolicyVersions,
    predicateProposals: input.registry.predicateProposals,
    merchantAvailabilityEvidence: input.registry.merchantAvailabilityEvidence,
    serviceScopeVersions: input.registry.serviceScopeVersions,
    promotionVersions: input.registry.promotionVersions,
    offerCompositionVersions: input.registry.offerCompositionVersions,
    conflicts: input.registry.conflicts,
  });
}

export async function validateHelcimDharmaCaptureRemediationV1(input: {
  baseline: HelcimDharmaCaptureRemediationBaselineV1;
  registryBefore: CommercialSourceGovernanceRegistryV1;
  registryAfter: CommercialSourceGovernanceRegistryV1;
  rootDir?: string;
}): Promise<Array<{ code: string; ref: string; message: string }>> {
  const rootDir = input.rootDir ?? process.cwd();
  const issues: Array<{ code: string; ref: string; message: string }> = [];
  const before = new Map(input.registryBefore.sourceObservations.map((item) => [item.observationId, item]));
  const after = new Map(input.registryAfter.sourceObservations.map((item) => [item.observationId, item]));
  const urls = new Set<string>();
  for (const record of input.baseline.records) {
    urls.add(record.requestedUrl);
    const prior = before.get(record.sourceObservationId);
    const current = after.get(record.sourceObservationId);
    if (!prior || !current) issues.push(issue("wrong_observation_linkage", record.captureId, record.sourceObservationId));
    if (record.finalUrl && new URL(record.finalUrl).hostname !== new URL(record.requestedUrl).hostname) issues.push(issue("redirect_identity_change", record.captureId, record.finalUrl));
    const bytes = await readFile(path.join(rootDir, record.artifactPath));
    if (sha256(bytes) !== record.artifactSha256) issues.push(issue("artifact_sha_mismatch", record.captureId, record.artifactPath));
    if (record.remediationState === "captured" && current?.fingerprints.f1RawSourceDocument !== record.artifactSha256) issues.push(issue("successful_capture_not_f1", record.captureId, record.sourceObservationId));
    if (record.remediationState !== "captured" && current?.fingerprints.f1RawSourceDocument !== prior?.fingerprints.f1RawSourceDocument) issues.push(issue("unavailable_capture_changed_f1", record.captureId, record.sourceObservationId));
    if (prior && current && prior.fingerprints.f2RelevantCommercialExtract !== current.fingerprints.f2RelevantCommercialExtract) issues.push(issue("f2_changed", record.captureId, record.sourceObservationId));
  }
  if (input.baseline.records.length !== 12 || urls.size !== 12) issues.push(issue("authorized_set_cardinality", "baseline", `${input.baseline.records.length}/${urls.size}`));
  return issues;
}

function issue(code: string, ref: string, message: string) { return { code, ref, message }; }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
