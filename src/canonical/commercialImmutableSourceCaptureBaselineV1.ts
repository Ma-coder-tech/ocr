import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createCommercialSourceGovernanceRegistryV1,
  type CommercialSourceGovernanceRegistryV1,
  type CommercialSourceObservationV1,
} from "./commercialSourceGovernanceV1.js";

export const IMMUTABLE_FIRST_PARTY_COMMERCIAL_SOURCE_CAPTURE_BASELINE_V1 =
  "immutable_first_party_commercial_source_capture_baseline_2026_09_10_v1" as const;

export const IMMUTABLE_CAPTURE_PRODUCT_AUTHORITY_V1 = {
  document: "RateReveal_Immutable_FirstParty_Commercial_Source_Capture_Baseline_Product_Authority_v1.md",
  sha256: "7efd4f553f2b9a61ee6cace0d7e1a0b8a395e44a276f8f61c50e32b80aead412",
  section: "all",
} as const;

export type ImmutableCaptureValidationStateV1 = NonNullable<CommercialSourceObservationV1["immutableCapture"]>["validationState"];

export type ImmutableCommercialSourceCaptureRecordV1 = {
  captureId: string;
  provider: string;
  sourceIdentity: string;
  sourceObservationId: string;
  relationshipToAdmittedObservation: string;
  requestedUrl: string;
  finalUrl: string | null;
  redirected: boolean | null;
  retrievalTimestampUtc: string;
  timezone: "UTC";
  httpStatus: number | null;
  httpStatusText: string | null;
  contentType: string | null;
  captureMethod: "original_http_response_body" | "original_pdf_response_body" | "capture_unavailable";
  captureState: "captured" | "capture_unavailable";
  byteLength: number | null;
  etag: string | null;
  lastModifiedHeader: string | null;
  artifactPath: string | null;
  artifactSha256: string | null;
  expectedGenre: "html" | "pdf";
  expectedAnchors: string[];
  sensitiveHeadersRetained: string[];
  attemptCount: 1;
  failure: string | null;
};

export type ImmutableCommercialSourceCaptureBaselineV1 = {
  schemaVersion: string;
  productAuthority: typeof IMMUTABLE_CAPTURE_PRODUCT_AUTHORITY_V1;
  records: Array<ImmutableCommercialSourceCaptureRecordV1 & {
    validationState: ImmutableCaptureValidationStateV1;
    anchorValidation: {
      method: "html_source_anchor_review" | "parsed_pdf_anchor_review" | "not_applicable_capture_unavailable";
      matchedAnchors: string[];
      missingAnchors: string[];
    };
    unadjudicatedSourceContent: string[];
    renderedFallback: null | {
      result: string;
      expectedAnchorsMatched: boolean;
      artifactExportSupported: false;
    };
  }>;
};

type RawManifest = {
  schemaVersion: string;
  productAuthority: { document: string; sha256: string };
  records: ImmutableCommercialSourceCaptureRecordV1[];
};
type RenderAttemptManifest = {
  artifactExportSupported: false;
  records: Array<{ captureId: string; expectedAnchorsMatched: boolean; result: string }>;
};

const CAPTURE_VALIDATION: Record<string, { state: ImmutableCaptureValidationStateV1; matched: string[]; missing: string[]; unadjudicated: string[] }> = {
  a1_authorize_net_gateway_pricing: {
    state: "capture_matches_admitted_observation",
    matched: ["Gateway only", "$25 per month", "10¢ per transaction", "daily batch fee 10¢"],
    missing: [],
    unadjudicated: ["The retained page includes additional Authorize.net plans, eCheck terms, comparative marketing, and other content outside the already-admitted Gateway Only scope; none was normalized or admitted."],
  },
  a2_authorize_net_account_updater: {
    state: "capture_matches_admitted_observation",
    matched: ["$0.25 per update", "$.25 per successful updated response", "successful updated response"],
    missing: [],
    unadjudicated: [],
  },
  a3_authorize_net_direct_partner_support: {
    state: "capture_matches_admitted_observation",
    matched: ["KA-07342", "04/09/2025", "Payment Gateway only", "Sign Up through a Partner"],
    missing: [],
    unadjudicated: [],
  },
};

export async function loadImmutableCommercialSourceCaptureBaselineV1(input: {
  rootDir?: string;
} = {}): Promise<ImmutableCommercialSourceCaptureBaselineV1> {
  const rootDir = input.rootDir ?? process.cwd();
  const manifestPath = path.join(rootDir, "evidence/commercial-source-captures/v1/capture-manifest.json");
  const renderPath = path.join(rootDir, "evidence/commercial-source-captures/v1/rendered-capture-attempts.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RawManifest;
  const rendered = JSON.parse(await readFile(renderPath, "utf8")) as RenderAttemptManifest;
  if (manifest.records.length !== 15) throw new Error(`Expected 15 authorized capture records, received ${manifest.records.length}.`);
  if (manifest.productAuthority.sha256 !== IMMUTABLE_CAPTURE_PRODUCT_AUTHORITY_V1.sha256) throw new Error("Capture manifest Product authority fingerprint mismatch.");
  const renderedById = new Map(rendered.records.map((item) => [item.captureId, item]));
  return {
    schemaVersion: IMMUTABLE_FIRST_PARTY_COMMERCIAL_SOURCE_CAPTURE_BASELINE_V1,
    productAuthority: IMMUTABLE_CAPTURE_PRODUCT_AUTHORITY_V1,
    records: manifest.records.map((record) => {
      const validation = CAPTURE_VALIDATION[record.captureId];
      const fallback = renderedById.get(record.captureId);
      return {
        ...record,
        validationState: validation?.state ?? "capture_unavailable",
        anchorValidation: validation
          ? { method: record.expectedGenre === "pdf" ? "parsed_pdf_anchor_review" : "html_source_anchor_review", matchedAnchors: validation.matched, missingAnchors: validation.missing }
          : { method: "not_applicable_capture_unavailable", matchedAnchors: [], missingAnchors: [...record.expectedAnchors] },
        unadjudicatedSourceContent: validation?.unadjudicated ?? [],
        renderedFallback: fallback ? { result: fallback.result, expectedAnchorsMatched: fallback.expectedAnchorsMatched, artifactExportSupported: false } : null,
      };
    }),
  };
}

export function applyImmutableCapturesToCommercialRegistryV1(input: {
  registry: CommercialSourceGovernanceRegistryV1;
  baseline: ImmutableCommercialSourceCaptureBaselineV1;
}): CommercialSourceGovernanceRegistryV1 {
  const records = new Map(input.baseline.records.map((item) => [item.sourceObservationId, item]));
  const sourceObservations = input.registry.sourceObservations.map((observation) => {
    const record = records.get(observation.observationId);
    if (!record) return structuredClone(observation);
    const priorF1 = observation.fingerprints.f1RawSourceDocument;
    const priorArtifactRef = observation.provenance.rawArtifactRef;
    const captured = record.captureState === "captured" && record.validationState !== "capture_unavailable" && record.artifactPath !== null && record.artifactSha256 !== null;
    return {
      ...structuredClone(observation),
      provenance: {
        ...structuredClone(observation.provenance),
        rawArtifactRef: captured ? `${record.artifactPath}@sha256:${record.artifactSha256}` : priorArtifactRef,
        retrievabilityLimitation: captured
          ? null
          : `${observation.provenance.retrievabilityLimitation ?? ""} Immutable first-party capture remained unavailable: ${record.failure ?? record.renderedFallback?.result ?? "unknown failure"}.`.trim(),
      },
      fingerprints: {
        ...observation.fingerprints,
        f1RawSourceDocument: captured ? record.artifactSha256! : priorF1,
      },
      immutableCapture: {
        captureRecordRef: record.captureId,
        captureState: captured ? "captured" as const : "capture_unavailable" as const,
        validationState: captured ? record.validationState : "capture_unavailable",
        retainedFirstPartyArtifactPath: captured ? record.artifactPath : null,
        retainedFirstPartyArtifactSha256: captured ? record.artifactSha256 : null,
        failureResponseArtifactPath: captured ? null : record.artifactPath,
        failureResponseArtifactSha256: captured ? null : record.artifactSha256,
        priorProvisionalF1Fingerprint: priorF1,
        adjudicationAuthorityArtifactRef: priorArtifactRef,
        retrievalTimestampUtc: record.retrievalTimestampUtc,
        relationship: "immutable_capture_to_observation_to_f2_to_f3" as const,
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

export async function validateImmutableCommercialSourceCaptureBaselineV1(input: {
  baseline: ImmutableCommercialSourceCaptureBaselineV1;
  registries: CommercialSourceGovernanceRegistryV1[];
  rootDir?: string;
}): Promise<Array<{ code: string; ref: string; message: string }>> {
  const rootDir = input.rootDir ?? process.cwd();
  const issues: Array<{ code: string; ref: string; message: string }> = [];
  const observations = new Map(input.registries.flatMap((registry) => registry.sourceObservations).map((item) => [item.observationId, item]));
  const seenUrls = new Set<string>();
  for (const record of input.baseline.records) {
    if (seenUrls.has(record.requestedUrl)) issues.push(issue("duplicate_authorized_url", record.captureId, record.requestedUrl));
    seenUrls.add(record.requestedUrl);
    const observation = observations.get(record.sourceObservationId);
    if (!observation) issues.push(issue("unknown_source_observation", record.captureId, record.sourceObservationId));
    if (observation && observation.offerIdentity.providerBrand !== record.provider) issues.push(issue("wrong_provider_link", record.captureId, `${record.provider} != ${observation.offerIdentity.providerBrand}`));
    if (record.finalUrl && new URL(record.finalUrl).hostname !== new URL(record.requestedUrl).hostname) issues.push(issue("redirect_identity_change", record.captureId, `${record.requestedUrl} -> ${record.finalUrl}`));
    if (record.artifactPath && record.artifactSha256) {
      const bytes = await readFile(path.join(rootDir, record.artifactPath));
      if (sha256(bytes) !== record.artifactSha256) issues.push(issue("artifact_sha_mismatch", record.captureId, record.artifactPath));
    } else if (record.captureState === "captured") {
      issues.push(issue("captured_artifact_missing_sha", record.captureId, "Captured bytes require path and SHA."));
    }
  }
  if (input.baseline.records.length !== 15 || seenUrls.size !== 15) issues.push(issue("authorized_set_cardinality", "baseline", `${input.baseline.records.length}/${seenUrls.size}`));
  return issues;
}

export function commercialRegistrySemanticFingerprintSetV1(registry: CommercialSourceGovernanceRegistryV1): string[] {
  return [
    ...registry.priceComponentVersions.map((item) => item.f3GovernedSemantic),
    ...registry.publicPolicyVersions.map((item) => item.f3GovernedSemantic),
    ...registry.serviceScopeVersions.map((item) => item.f3GovernedSemantic),
    ...registry.promotionVersions.map((item) => item.f3GovernedSemantic),
    ...registry.offerCompositionVersions.map((item) => item.f3GovernedSemantic),
  ];
}

function issue(code: string, ref: string, message: string) { return { code, ref, message }; }
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
