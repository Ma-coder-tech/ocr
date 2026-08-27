import { describe, expect, it } from "vitest";
import { wellsFargo2026ReferenceRateCatalog } from "../../../../src/referenceRateCatalogData.js";
import { loadFiservFeeReference } from "../../../../src/fiservFeeReference.js";
import {
  CANONICAL_KNOWLEDGE_V2_AMENDMENTS,
  canonicalKnowledgeV2VersionManifest,
  compareLegacyKnowledge,
  compareLegacyKnowledgeSemantics,
  fiservFeeReferenceEntryToKnowledgeCandidates,
  knowledgeDiagnosticsContainPrivatePayload,
  knowledgePrivacySafeDiagnostics,
  ingestKnowledgeCandidatePacket,
  referenceRateRowToKnowledgeCandidates,
  resolveKnowledge,
  type FiservFeeReferenceEntry,
} from "../../../../src/canonical/v2/index.js";
import { admittedKnowledge, knowledgeQuery } from "./knowledgeFixtures.js";

describe("Payments Knowledge Library v0.2 candidates, comparison, and privacy", () => {
  it("converts every legacy reference row only to candidate packets", () => {
    const packets = wellsFargo2026ReferenceRateCatalog.flatMap(referenceRateRowToKnowledgeCandidates);
    expect(wellsFargo2026ReferenceRateCatalog).toHaveLength(19);
    expect(packets.length).toBeGreaterThan(19);
    expect(new Set(packets.map((item) => item.lifecycle))).toEqual(new Set(["candidate"]));
    expect(packets.every((item) => item.requiresHumanAdmission && item.sourceAuthority === "legacy_reference_candidate")).toBe(true);
    expect(packets.every((item) => item.privacy === "private_by_default")).toBe(true);
    expect(ingestKnowledgeCandidatePacket(packets[0]!)).toMatchObject({ lifecycle: "candidate", privacy: "private_by_default", requiresHumanAdmission: true });
  });

  it("keeps legacy Fiserv labels, rates, paid-to, and negotiability candidate-only", () => {
    const row: FiservFeeReferenceEntry = {
      id: "batch_fee", network: "Processor", canonical_name: "Batch Fee", fiserv_labels: ["BATCH FEE"],
      reference_rate: 0.25, rate_type: "per_batch", rate_unit: "USD", applies_to: "batch", category: "processor_markup",
      negotiable: true, paid_to: "processor", effective_date: "2025-01-01", last_verified: "2025-01-01",
      notes: "legacy", verification_formula: "legacy", tolerance_pct: null,
    };
    const packets = fiservFeeReferenceEntryToKnowledgeCandidates(row);
    expect(packets.map((item) => item.proposedClaimType)).toEqual(expect.arrayContaining(["alias_identity", "processor_term", "participant_control_role"]));
    expect(packets.every((item) => item.lifecycle === "candidate" && item.requiresHumanAdmission)).toBe(true);
    const allLegacyPackets = loadFiservFeeReference().fees.flatMap(fiservFeeReferenceEntryToKnowledgeCandidates);
    expect(allLegacyPackets.length).toBeGreaterThan(43);
    expect(allLegacyPackets.every((item) => item.lifecycle === "candidate" && item.privacy === "private_by_default")).toBe(true);
  });

  it("classifies comparison only with the approved four-state vocabulary", () => {
    const resolved = resolveKnowledge([admittedKnowledge()], knowledgeQuery());
    const entry = admittedKnowledge();
    expect(compareLegacyKnowledge({ v2Entry: entry, legacyFactPresent: true, legacyValueEquivalent: true, resolution: resolved }).classification).toBe("same_semantic_fact");
    expect(compareLegacyKnowledge({ v2Entry: entry, legacyFactPresent: true, legacyValueEquivalent: false, resolution: resolved, differenceDimension: "conflict_state", approvedAmendmentId: "RF-AMEND-005-CONFLICT-REFUSAL" }).classification).toBe("approved_semantic_amendment");
    const unavailable = resolveKnowledge([], knowledgeQuery());
    expect(compareLegacyKnowledge({ v2Entry: entry, legacyFactPresent: true, legacyValueEquivalent: false, resolution: unavailable }).classification).toBe("v2_unavailable_or_ambiguous");
    expect(compareLegacyKnowledge({ v2Entry: entry, legacyFactPresent: true, legacyValueEquivalent: false, resolution: resolved }).classification).toBe("unexpected_divergence");
  });

  it("compares all RF semantic dimensions and stops on an unexplained difference", () => {
    const base = {
      claim_identity: "published_network_rate:opaque", typed_value: { kind: "rate", value: 1 }, source_authority: ["official_network_publication"],
      reuse_scope: "reusable", tenant_account_boundary: "reusable",
      processor_network_program_template_population_scope: "network:opaque", effective_period: "[2026-01-01,null)", admission_state: "admitted",
      specificity_outcome: null, supersession: [], conflict_state: "resolved_single",
    };
    const approved = compareLegacyKnowledgeSemantics({
      legacy: { ...base, admission_state: "verified" }, v2: base,
      approvedAmendments: { admission_state: "RF-AMEND-003-EXPLICIT-ADMISSION" },
    });
    expect(approved.counts.approved_semantic_amendment).toBe(1);
    expect(approved.hasUnexpectedDivergence).toBe(false);
    const unexpected = compareLegacyKnowledgeSemantics({ legacy: { ...base, specificity_outcome: "closest_rate" }, v2: base });
    expect(unexpected.hasUnexpectedDivergence).toBe(true);
    expect(unexpected.items.find((item) => item.dimension === "specificity_outcome")!.classification).toBe("unexpected_divergence");
  });

  it("emits only aggregate privacy-safe diagnostics", () => {
    const entry = admittedKnowledge({
      visibility: "account_private", tenantRef: "sensitive-tenant", accountRef: "sensitive-account",
      evidence: [{ ref: "sensitive-source-hash", sourceAuthority: "official_network_publication", private: true }],
    });
    const resolution = resolveKnowledge([entry], knowledgeQuery({ scope: { ...knowledgeQuery().scope, tenantRef: "sensitive-tenant", accountRef: "sensitive-account" } }));
    const diagnostics = knowledgePrivacySafeDiagnostics({ entries: [entry], resolutions: [resolution], unknownQueue: [], viewer: { tenantRef: "sensitive-tenant", accountRef: "sensitive-account" } });
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("sensitive");
    expect(serialized).not.toContain("visa_assessment");
    expect(knowledgeDiagnosticsContainPrivatePayload(diagnostics)).toBe(false);
  });

  it("declares all eight approved RF amendments and no runtime authority", () => {
    expect(CANONICAL_KNOWLEDGE_V2_AMENDMENTS).toHaveLength(8);
    expect(canonicalKnowledgeV2VersionManifest).toMatchObject({
      schemaVersion: "payments_knowledge_library_v0_2", authority: "shadow_non_authoritative",
      persistence: "durable_append_only_governed_catalog", runtimeConnection: "production_analysis_run_immutable_snapshot", aiAuthority: "prohibited", realSeedAdmission: "prohibited",
    });
  });
});
