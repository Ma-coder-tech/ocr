import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1,
  AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1,
} from "../../src/canonical/authorizeNetDirectGatewayCommercialSourceBatch1AV1.js";
import {
  applyImmutableCapturesToCommercialRegistryV1,
  commercialRegistrySemanticFingerprintSetV1,
  loadImmutableCommercialSourceCaptureBaselineV1,
  validateImmutableCommercialSourceCaptureBaselineV1,
} from "../../src/canonical/commercialImmutableSourceCaptureBaselineV1.js";
import {
  resolveGovernedCommercialOfferV1,
  validateCommercialSourceGovernanceRegistryV1,
} from "../../src/canonical/commercialSourceGovernanceV1.js";
import {
  DHARMA_HIGH_VOLUME_IDENTITY_V1,
  DHARMA_REFERRAL_CONTROL_IDENTITY_V1,
  DHARMA_STANDARD_RETAIL_IDENTITY_V1,
  HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1,
  HELCIM_DIRECT_PROCESSING_IDENTITY_V1,
} from "../../src/canonical/helcimDharmaCommercialSourceBatch1BV1.js";
import { parsePdf } from "../../src/parser.js";

const baseline = await loadImmutableCommercialSourceCaptureBaselineV1();
const authorizeCaptured = applyImmutableCapturesToCommercialRegistryV1({ registry: AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, baseline });
const batch1BCaptured = applyImmutableCapturesToCommercialRegistryV1({ registry: HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, baseline });

describe("Immutable First-Party Commercial Source Capture Baseline v1", () => {
  it("contains exactly the 15 authorized first-party URL attempts and valid retained artifact hashes", async () => {
    expect(baseline.records).toHaveLength(15);
    expect(new Set(baseline.records.map((item) => item.requestedUrl))).toHaveLength(15);
    expect(await validateImmutableCommercialSourceCaptureBaselineV1({ baseline, registries: [AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1, HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1] })).toEqual([]);
    expect(baseline.records.every((item) => item.attemptCount === 1)).toBe(true);
    expect(baseline.records.every((item) => item.sensitiveHeadersRetained.length === 0)).toBe(true);
  });

  it("preserves three usable Authorize.net captures and records twelve unavailable captures honestly", () => {
    expect(baseline.records.filter((item) => item.captureState === "captured")).toHaveLength(3);
    expect(baseline.records.filter((item) => item.captureMethod === "original_http_response_body" && item.captureState === "captured")).toHaveLength(2);
    expect(baseline.records.filter((item) => item.captureMethod === "original_pdf_response_body" && item.captureState === "captured")).toHaveLength(1);
    expect(baseline.records.filter((item) => item.validationState === "capture_matches_admitted_observation")).toHaveLength(3);
    expect(baseline.records.filter((item) => item.validationState === "capture_unavailable")).toHaveLength(12);
    expect(baseline.records.filter((item) => item.validationState === "capture_partial_but_nonconflicting")).toHaveLength(0);
    expect(baseline.records.filter((item) => item.validationState === "capture_conflict_requires_product_review")).toHaveLength(0);
  });

  it("proves the retained Authorize.net bytes contain the reviewed source anchors", async () => {
    const pricing = await readFile("evidence/commercial-source-captures/v1/artifacts/a1_authorize_net_gateway_pricing.html", "utf8");
    expect(pricing).toContain("Gateway only");
    expect(pricing).toContain("$25 ");
    expect(pricing).toContain("10¢");
    expect(pricing).toContain("daily batch fee");

    const updater = await parsePdf("evidence/commercial-source-captures/v1/artifacts/a2_authorize_net_account_updater.pdf");
    expect(updater.textPreview).toContain("$0.25 per update");
    expect(updater.textPreview).toContain("No update. No charge.");

    const support = await readFile("evidence/commercial-source-captures/v1/artifacts/a3_authorize_net_direct_partner_support.html", "utf8");
    expect(support).toContain("KA-07342");
    expect(support).toContain("04/09/2025");
    expect(support).toContain("Payment Gateway only");
    expect(support).toContain("Sign Up through a Partner");
  });

  it("corrects successful Authorize.net F1 values while preserving Product-pack provenance", () => {
    expect(validateCommercialSourceGovernanceRegistryV1(authorizeCaptured)).toEqual([]);
    for (const observation of authorizeCaptured.sourceObservations) {
      expect(observation.immutableCapture).toMatchObject({ captureState: "captured", validationState: "capture_matches_admitted_observation", relationship: "immutable_capture_to_observation_to_f2_to_f3" });
      expect(observation.fingerprints.f1RawSourceDocument).toBe(observation.immutableCapture?.retainedFirstPartyArtifactSha256);
      expect(observation.immutableCapture?.priorProvisionalF1Fingerprint).toBe("774f12eb3632df2db56034b406230b41d934222e10202500b3aef8493a9fa210");
      expect(observation.immutableCapture?.adjudicationAuthorityArtifactRef).toContain("RateReveal_AuthorizeNet_Evidence_Completion_Pack");
    }
    expect(new Set(authorizeCaptured.sourceObservations.map((item) => item.fingerprints.f1RawSourceDocument))).toHaveLength(3);
  });

  it("does not pretend failure responses are Helcim or Dharma first-party F1 evidence", () => {
    expect(validateCommercialSourceGovernanceRegistryV1(batch1BCaptured)).toEqual([]);
    for (const observation of batch1BCaptured.sourceObservations) {
      expect(observation.immutableCapture?.captureState).toBe("capture_unavailable");
      expect(observation.immutableCapture?.retainedFirstPartyArtifactSha256).toBeNull();
      expect(observation.immutableCapture?.failureResponseArtifactSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(observation.fingerprints.f1RawSourceDocument).toBe("391c4c1ee04a511baf029a58b30dd45c6d1d9c5d72bdf3c0e363ae7b10b62e6d");
    }
  });

  it("leaves every F2 and F3 value unchanged after the F1 provenance backfill", () => {
    expect(authorizeCaptured.sourceObservations.map((item) => item.fingerprints.f2RelevantCommercialExtract)).toEqual(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.sourceObservations.map((item) => item.fingerprints.f2RelevantCommercialExtract));
    expect(batch1BCaptured.sourceObservations.map((item) => item.fingerprints.f2RelevantCommercialExtract)).toEqual(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1.sourceObservations.map((item) => item.fingerprints.f2RelevantCommercialExtract));
    expect(commercialRegistrySemanticFingerprintSetV1(authorizeCaptured)).toEqual(commercialRegistrySemanticFingerprintSetV1(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1));
    expect(commercialRegistrySemanticFingerprintSetV1(batch1BCaptured)).toEqual(commercialRegistrySemanticFingerprintSetV1(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1));
    expect(authorizeCaptured.priceComponentVersions).toEqual(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.priceComponentVersions);
    expect(batch1BCaptured.priceComponentVersions).toEqual(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1.priceComponentVersions);
  });

  it("keeps Authorize.net Gateway Only, acquiring, channel, and Account Updater boundaries unchanged", () => {
    expect(resolveGovernedCommercialOfferV1({ registry: authorizeCaptured, identity: AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status).toBe("resolved");
    expect(resolveGovernedCommercialOfferV1({ registry: authorizeCaptured, identity: { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, productScope: "acquiring_only" }, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_channel_or_identity");
    expect(resolveGovernedCommercialOfferV1({ registry: authorizeCaptured, identity: { ...AUTHORIZE_NET_DIRECT_GATEWAY_IDENTITY_V1, distributionChannel: "reseller", sellerIdentity: "reseller" }, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_channel_or_identity");
    expect(authorizeCaptured.offerCompositionVersions.map((item) => item.offerIdentity.namedOffer)).toEqual(["Gateway only", "Account Updater"]);
  });

  it("keeps Helcim and Dharma semantic controls and current/historical firewall unchanged", () => {
    expect(batch1BCaptured.sourceObservations.find((item) => item.observationId === "obs_helcim_h1_fee_disclosures_v1")?.sourceFaithfulExtract).toContain("$1,000,001+");
    expect(batch1BCaptured.sourceObservations.find((item) => item.observationId === "obs_helcim_h2_public_pricing_v1")?.sourceFaithfulExtract).toContain("$1M-$5M");
    expect(batch1BCaptured.conflicts).toHaveLength(3);
    expect(resolveGovernedCommercialOfferV1({ registry: batch1BCaptured, identity: DHARMA_REFERRAL_CONTROL_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_channel_or_identity");
    expect(resolveGovernedCommercialOfferV1({ registry: batch1BCaptured, identity: DHARMA_STANDARD_RETAIL_IDENTITY_V1, asOf: "2025-01-01", mode: "historical" }).status).toBe("unresolved_period");
    expect(resolveGovernedCommercialOfferV1({ registry: batch1BCaptured, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2025-01-01", mode: "historical" }).status).toBe("unresolved_period");
    const high = batch1BCaptured.offerCompositionVersions.find((item) => item.offerIdentity.namedOffer === DHARMA_HIGH_VOLUME_IDENTITY_V1.namedOffer)!;
    expect(high.qualificationBoundary?.state).toBe("UNRESOLVED_QUALIFICATION_BOUNDARY");
  });

  it("retains unadjudicated live content without normalizing or admitting it", () => {
    const records = baseline.records.filter((item) => item.unadjudicatedSourceContent.length > 0);
    expect(records.map((item) => item.captureId)).toEqual(["a1_authorize_net_gateway_pricing"]);
    expect(authorizeCaptured.priceComponentVersions).toHaveLength(AUTHORIZE_NET_DIRECT_GATEWAY_COMMERCIAL_SOURCE_REGISTRY_V1.priceComponentVersions.length);
  });
});
