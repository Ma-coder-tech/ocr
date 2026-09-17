import { describe, expect, it } from "vitest";

import {
  applyHelcimDharmaCaptureRemediationV1,
  loadHelcimDharmaCaptureRemediationBaselineV1,
  validateHelcimDharmaCaptureRemediationV1,
} from "../../src/canonical/commercialSourceCaptureRemediationHelcimDharmaV1.js";
import {
  applyImmutableCapturesToCommercialRegistryV1,
  commercialRegistrySemanticFingerprintSetV1,
  loadImmutableCommercialSourceCaptureBaselineV1,
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

const priorBaseline = await loadImmutableCommercialSourceCaptureBaselineV1();
const before = applyImmutableCapturesToCommercialRegistryV1({ registry: HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1, baseline: priorBaseline });
const remediation = await loadHelcimDharmaCaptureRemediationBaselineV1({ priorBaseline });
const after = applyHelcimDharmaCaptureRemediationV1({ registry: before, baseline: remediation });

describe("Helcim + Dharma Immutable Capture Remediation v1", () => {
  it("attempts exactly the 12 authorized URLs and validates every retained artifact hash", async () => {
    expect(remediation.records).toHaveLength(12);
    expect(new Set(remediation.records.map((item) => item.requestedUrl)).size).toBe(12);
    expect(await validateHelcimDharmaCaptureRemediationV1({ baseline: remediation, registryBefore: before, registryAfter: after })).toEqual([]);
    expect(validateCommercialSourceGovernanceRegistryV1(after)).toEqual([]);
  });

  it("retains five rendered-PDF first-party captures and formally bounds seven unavailable sources", () => {
    expect(remediation.records.filter((item) => item.remediationState === "captured")).toHaveLength(5);
    expect(remediation.records.filter((item) => item.comparisonState === "capture_matches_admitted_observation")).toHaveLength(5);
    expect(remediation.records.filter((item) => item.comparisonState === "capture_partial_but_nonconflicting")).toHaveLength(0);
    expect(remediation.records.filter((item) => item.comparisonState === "capture_conflict_requires_product_review")).toHaveLength(0);
    expect(remediation.records.filter((item) => item.comparisonState === "immutable_capture_unavailable_after_remediation")).toHaveLength(7);
  });

  it("promotes only successful Dharma rendered artifacts to F1 and retains Product-pack adjudication provenance", () => {
    const capturedIds = new Set(["obs_dharma_d1_retail_v1", "obs_dharma_d2_virtual_v1", "obs_dharma_d3_high_volume_v1", "obs_dharma_d6_pci_v1", "obs_dharma_referral_isolation_v1"]);
    for (const observation of after.sourceObservations) {
      if (!capturedIds.has(observation.observationId)) continue;
      expect(observation.immutableCapture?.captureState).toBe("captured");
      expect(observation.fingerprints.f1RawSourceDocument).toBe(observation.immutableCapture?.retainedFirstPartyArtifactSha256);
      expect(observation.immutableCapture?.priorProvisionalF1Fingerprint).toBe("391c4c1ee04a511baf029a58b30dd45c6d1d9c5d72bdf3c0e363ae7b10b62e6d");
      expect(observation.immutableCapture?.adjudicationAuthorityArtifactRef).toContain("RateReveal_Helcim_Dharma_Batch_1B_Evidence_Pack");
      expect(observation.immutableCapture?.remediation?.attempts).toHaveLength(3);
    }
  });

  it("keeps seven denial PDFs as failure evidence and never treats them as provider-content F1", () => {
    for (const record of remediation.records.filter((item) => item.remediationState !== "captured")) {
      const observation = after.sourceObservations.find((item) => item.observationId === record.sourceObservationId)!;
      expect(record.artifactRole).toBe("remediation_failure_evidence_not_F1");
      expect(observation.fingerprints.f1RawSourceDocument).toBe("391c4c1ee04a511baf029a58b30dd45c6d1d9c5d72bdf3c0e363ae7b10b62e6d");
      expect(observation.immutableCapture?.remediation?.latestArtifactSha256).toBe(record.artifactSha256);
      expect(observation.immutableCapture?.remediation?.remediationState).toBe("immutable_capture_unavailable_after_remediation");
    }
  });

  it("leaves all F2, F3, component, policy, composition, and conflict semantics unchanged", () => {
    expect(after.sourceObservations.map((item) => item.fingerprints.f2RelevantCommercialExtract)).toEqual(before.sourceObservations.map((item) => item.fingerprints.f2RelevantCommercialExtract));
    expect(commercialRegistrySemanticFingerprintSetV1(after)).toEqual(commercialRegistrySemanticFingerprintSetV1(before));
    expect(after.priceComponentVersions).toEqual(before.priceComponentVersions);
    expect(after.publicPolicyVersions).toEqual(before.publicPolicyVersions);
    expect(after.offerCompositionVersions).toEqual(before.offerCompositionVersions);
    expect(after.conflicts).toEqual(before.conflicts);
  });

  it("preserves all Helcim controls despite four unavailable rendered captures", () => {
    expect(after.sourceObservations.find((item) => item.observationId === "obs_helcim_h1_fee_disclosures_v1")?.sourceFaithfulExtract).toContain("$1,000,001+");
    expect(after.sourceObservations.find((item) => item.observationId === "obs_helcim_h2_public_pricing_v1")?.sourceFaithfulExtract).toContain("$1M-$5M");
    expect(after.sourceObservations.find((item) => item.observationId === "obs_helcim_h2_public_pricing_v1")?.sourceFaithfulExtract).toContain("custom");
    expect(resolveGovernedCommercialOfferV1({ registry: after, identity: HELCIM_DIRECT_PROCESSING_IDENTITY_V1, asOf: "2025-01-01", mode: "historical" }).status).toBe("unresolved_period");
  });

  it("preserves Dharma direct, qualification, calculator, referral, closure, and PCI boundaries", () => {
    const high = after.offerCompositionVersions.find((item) => item.offerIdentity.namedOffer === DHARMA_HIGH_VOLUME_IDENTITY_V1.namedOffer)!;
    expect(high.qualificationPredicate?.op).toBe("or");
    expect(high.qualificationBoundary?.state).toBe("UNRESOLVED_QUALIFICATION_BOUNDARY");
    expect(after.conflicts).toHaveLength(3);
    expect(resolveGovernedCommercialOfferV1({ registry: after, identity: DHARMA_REFERRAL_CONTROL_IDENTITY_V1, asOf: "2026-09-10", mode: "current" }).status).toBe("unresolved_channel_or_identity");
    expect(after.priceComponentVersions.find((item) => item.componentIdentity === "account_closure_fee")?.componentIdentity).not.toBe("early_termination_fee");
    expect(after.priceComponentVersions.some((item) => item.componentIdentity === "pci_noncompliance_fee" && item.completeness.state === "KNOWN")).toBe(true);
  });

  it("does not turn capture time into historical applicability", () => {
    expect(resolveGovernedCommercialOfferV1({ registry: after, identity: DHARMA_STANDARD_RETAIL_IDENTITY_V1, asOf: "2025-01-01", mode: "historical" }).status).toBe("unresolved_period");
    for (const observation of after.sourceObservations) {
      expect(observation.provenance.effectivePeriod).toEqual(before.sourceObservations.find((item) => item.observationId === observation.observationId)?.provenance.effectivePeriod);
    }
  });

  it("retains additional current content as unadjudicated rather than self-admitting it", () => {
    expect(remediation.records.filter((item) => item.unadjudicatedSourceContent.length > 0).map((item) => item.captureId)).toEqual(["d1_dharma_retail", "d2_dharma_virtual", "d8_dharma_referral"]);
    expect(after.priceComponentVersions).toHaveLength(HELCIM_DHARMA_COMMERCIAL_SOURCE_BATCH_1B_REGISTRY_V1.priceComponentVersions.length);
  });
});
