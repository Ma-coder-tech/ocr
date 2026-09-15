import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createShadowAiEconomicResolutionEvaluationAdapterV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerEvaluationAdapterV1.js";
import { validateShadowAiEconomicResolutionPlanV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerRuntimeV1.js";
import { SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1, type ShadowAiEconomicResolutionPacketV1 } from "../../src/canonical/shadowAiEconomicResolutionPlannerTypesV1.js";
import {
  compileShadowAiProviderReferenceBoundaryV1,
  inspectShadowAiProviderBoundRequestPrivacyV1,
  inspectShadowAiProviderReferenceBoundaryV1,
  providerAliasForInternalReferenceV1,
  providerPacketDiffLimitedToReferenceContainmentV1,
  restoreShadowAiProviderReferencesV1,
  type ShadowAiProviderReferenceClassV1,
  type ShadowAiProviderReferenceMapV1,
} from "../../src/canonical/shadowAiEconomicResolutionProviderReferenceBoundaryV1.js";
import { canonicalJson } from "../../src/canonical/v2/canonicalJson.js";
import { createSyntheticFullPlannerPacketV1 } from "../../src/evaluationIntegrity/openRouterFullPlannerSchemaPreflightV1.js";
import { buildOpenRouterIssueGroundedShadowPlannerRequestV1 } from "../../src/evaluationIntegrity/openRouterIssueGroundedShadowPlannerV1.js";

describe("Shadow AI provider reference boundary v1", () => {
  it("deterministically aliases every provider-bound reference class and keeps the reverse map local", () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const first = compileShadowAiProviderReferenceBoundaryV1(packet);
    const second = compileShadowAiProviderReferenceBoundaryV1(packet);
    expect(first).toEqual(second);
    expect(first.providerPacket).not.toEqual(packet);
    expect(first.referenceMap.internalInputHash).toBe(packet.immutableInputHash);
    expect(first.referenceMap.providerInputHash).toBe(first.providerPacket.immutableInputHash);
    expect(providerPacketDiffLimitedToReferenceContainmentV1(packet, first.providerPacket, first.referenceMap)).toBe(true);
    expect(first.referenceMap.entries.map((entry) => entry.referenceClass)).toEqual([
      "FACT", "FACT", "STATEMENT_EVIDENCE", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE",
    ]);
    expect(new Set(first.referenceMap.entries.map((entry) => entry.alias)).size).toBe(first.referenceMap.entries.length);
    expect(inspectShadowAiProviderReferenceBoundaryV1(first.providerPacket, first.referenceMap)).toMatchObject({
      valid: true,
      aliasCounts: { FACT: 2, STATEMENT_EVIDENCE: 1, GOVERNED_EVIDENCE: 1, ECONOMIC_CHARGE: 1 },
      rawInternalReferenceLeakageCount: 0,
      rawReverseMapMaterialCount: 0,
      sourceIdentityLeakageCount: 0,
    });

    const request = buildOpenRouterIssueGroundedShadowPlannerRequestV1("test-only-key", packet);
    expect(Object.keys(request)).not.toContain("referenceMap");
    expect(JSON.stringify(request)).not.toContain("internalReference");
    expect(request.body).not.toContain("referenceMap");
    expect(request.body).not.toContain("internalReference");
    expect(request.body).not.toContain("internalInputHash");
    for (const entry of request.referenceMap.entries) expect(request.body).not.toContain(entry.internalReference);
  });

  it("round-trips valid fact, governed-evidence, and charge citations to exact internal references", async () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const boundary = compileShadowAiProviderReferenceBoundaryV1(packet);
    const internalPlan = await offlinePlan(packet);
    const providerPlan = aliasPlan(internalPlan, boundary.referenceMap);
    const restored = restoreShadowAiProviderReferencesV1(providerPlan, boundary.referenceMap);
    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error("expected reference restoration");
    expect(restored.output).toEqual(internalPlan);
    expect(restored.restoredReferenceCount).toBeGreaterThan(0);
    expect(validateShadowAiEconomicResolutionPlanV1(restored.output, packet).ok).toBe(true);
  });

  it("fails closed for malformed, unknown, cross-packet, wrong-class, duplicate, and raw references", async () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const boundary = compileShadowAiProviderReferenceBoundaryV1(packet);
    const internalPlan = await offlinePlan(packet);
    const providerPlan = aliasPlan(internalPlan, boundary.referenceMap) as Record<string, any>;
    const factAlias = providerPlan.exactCitedFactRefs[0];
    const chargeAlias = providerAliasForInternalReferenceV1(boundary.referenceMap, "ECONOMIC_CHARGE", packet.selectedRdChargeRefs[0]!);
    expect(chargeAlias).not.toBeNull();

    const malformed = restoreShadowAiProviderReferencesV1({ ...providerPlan, exactCitedFactRefs: ["not-an-alias"] }, boundary.referenceMap);
    expect(failureCodes(malformed)).toContain("shadow_planner_provider_reference_alias_malformed");

    const unknown = restoreShadowAiProviderReferencesV1({
      ...providerPlan,
      exactCitedFactRefs: [`prv_${boundary.referenceMap.scopeToken}_f_9999`],
    }, boundary.referenceMap);
    expect(failureCodes(unknown)).toContain("shadow_planner_provider_reference_alias_unknown");

    const otherPacket = changedPacket(packet, "other_shadow_run", "other_issue");
    const other = compileShadowAiProviderReferenceBoundaryV1(otherPacket);
    const crossPacket = restoreShadowAiProviderReferencesV1({ ...providerPlan, exactCitedFactRefs: [other.referenceMap.entries[0]!.alias] }, boundary.referenceMap);
    expect(failureCodes(crossPacket)).toContain("shadow_planner_provider_reference_alias_cross_packet");

    const wrongClass = restoreShadowAiProviderReferencesV1({ ...providerPlan, exactCitedFactRefs: [chargeAlias] }, boundary.referenceMap);
    expect(failureCodes(wrongClass)).toContain("shadow_planner_provider_reference_alias_wrong_class");

    const duplicate = restoreShadowAiProviderReferencesV1({ ...providerPlan, exactCitedFactRefs: [factAlias, factAlias] }, boundary.referenceMap);
    expect(failureCodes(duplicate)).toContain("shadow_planner_provider_reference_alias_duplicate");

    const rawKnown = restoreShadowAiProviderReferencesV1({ ...providerPlan, exactCitedFactRefs: [packet.acceptedFactRefs[0]] }, boundary.referenceMap);
    expect(failureCodes(rawKnown)).toContain("shadow_planner_provider_output_raw_internal_reference_rejected");

    const inventedPlausible = restoreShadowAiProviderReferencesV1({ ...providerPlan, exactCitedFactRefs: ["fact_v2_invented_001"] }, boundary.referenceMap);
    expect(failureCodes(inventedPlausible)).toContain("shadow_planner_provider_output_raw_internal_reference_rejected");
  });

  it("rejects map collisions and missing or confused grounding", async () => {
    const packet = createSyntheticFullPlannerPacketV1();
    const boundary = compileShadowAiProviderReferenceBoundaryV1(packet);
    const internalPlan = await offlinePlan(packet);
    const providerPlan = aliasPlan(internalPlan, boundary.referenceMap) as Record<string, any>;
    const forged = JSON.parse(JSON.stringify(boundary.referenceMap)) as ShadowAiProviderReferenceMapV1 & { entries: any[] };
    forged.entries.push({ ...forged.entries[0] });
    const collision = restoreShadowAiProviderReferencesV1(providerPlan, forged);
    expect(failureCodes(collision)).toContain("shadow_planner_provider_reference_map_collision");
    const missingMap = restoreShadowAiProviderReferencesV1(providerPlan, null);
    expect(failureCodes(missingMap)).toContain("shadow_planner_provider_reference_map_missing");

    const other = compileShadowAiProviderReferenceBoundaryV1(changedPacket(packet, "mismatch_run", "mismatch_issue"));
    const mismatchedMap = restoreShadowAiProviderReferencesV1(providerPlan, other.referenceMap);
    expect(failureCodes(mismatchedMap)).toContain("shadow_planner_provider_reference_alias_cross_packet");

    const omitted = restoreShadowAiProviderReferencesV1({ ...providerPlan, exactCitedFactRefs: [] }, boundary.referenceMap);
    expect(omitted.ok).toBe(true);
    if (!omitted.ok) throw new Error("expected syntactically valid omitted grounding");
    const validation = validateShadowAiEconomicResolutionPlanV1(omitted.output, packet);
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.errors).toContain("shadow_planner_missing_fact_citation");
  });

  it("detects source filenames, paths, raw namespaces, hashes, and reverse-map material in outbound values", () => {
    const boundary = compileShadowAiProviderReferenceBoundaryV1(createSyntheticFullPlannerPacketV1());
    const unsafe = canonicalJson({
      sourceFilename: "merchant-statement.md",
      path: "/Users/example/merchant.pdf",
      rawRef: "document-ir:block:77",
      rawHash: boundary.referenceMap.internalInputHash,
      referenceMap: { entries: boundary.referenceMap.entries },
    });
    const inspection = inspectShadowAiProviderBoundRequestPrivacyV1(unsafe, boundary.referenceMap);
    expect(inspection.valid).toBe(false);
    expect(inspection.sourceIdentityLeakageCount).toBeGreaterThanOrEqual(2);
    expect(inspection.rawInternalReferenceLeakageCount).toBeGreaterThanOrEqual(2);
    expect(inspection.rawReverseMapMaterialCount).toBeGreaterThanOrEqual(2);
  });

  it("supports empty optional classes, repeated structural references, and large governed-reference sets", () => {
    const base = createSyntheticFullPlannerPacketV1();
    const empty = rehash({ ...base, acceptedIssueRelevantActivityFacts: [], acceptedFactRefs: [], currentGovernedEvidenceRefs: [] });
    const emptyBoundary = compileShadowAiProviderReferenceBoundaryV1(empty);
    expect(inspectShadowAiProviderReferenceBoundaryV1(emptyBoundary.providerPacket, emptyBoundary.referenceMap)).toMatchObject({
      valid: true,
      aliasCounts: { FACT: 0, STATEMENT_EVIDENCE: 0, GOVERNED_EVIDENCE: 0, ECONOMIC_CHARGE: 1 },
    });

    const repeated = rehash({ ...base, acceptedFactRefs: [base.acceptedIssueRelevantActivityFacts[0]!.factRef] });
    const repeatedBoundary = compileShadowAiProviderReferenceBoundaryV1(repeated);
    expect(repeatedBoundary.referenceMap.entries.filter((entry) => entry.referenceClass === "FACT")).toHaveLength(1);
    expect(repeatedBoundary.providerPacket.acceptedFactRefs[0]).toBe(repeatedBoundary.providerPacket.acceptedIssueRelevantActivityFacts[0]!.factRef);

    const large = rehash({ ...base, currentGovernedEvidenceRefs: Array.from({ length: 500 }, (_, index) => `RR-GOV-${String(index).padStart(4, "0")}`) });
    const largeBoundary = compileShadowAiProviderReferenceBoundaryV1(large);
    expect(largeBoundary.referenceMap.entries.filter((entry) => entry.referenceClass === "GOVERNED_EVIDENCE")).toHaveLength(500);
    expect(inspectShadowAiProviderReferenceBoundaryV1(largeBoundary.providerPacket, largeBoundary.referenceMap).valid).toBe(true);
  });

  it("fails closed when a possible natural-person business name has not been replaced by an opaque reference", () => {
    const base = createSyntheticFullPlannerPacketV1();
    const unsafe = rehash({
      ...base,
      merchantBusinessContext: {
        privacyClassification: "PURPOSE_BOUND_BUSINESS_IDENTITY",
        businessName: "Ada Lovelace",
        naturalPersonOrSoleProprietorAmbiguity: "POSSIBLE",
        admittedBusinessCategory: "retail",
        businessLocation: { country: "US", region: null, city: null },
        knownChannel: null,
        acceptedAverageTicket: null,
        supportedOperatingContext: [],
      },
    });
    expect(() => compileShadowAiProviderReferenceBoundaryV1(unsafe)).toThrow("shadow_planner_provider_possible_natural_person_name_unsuppressed");
    const contained = rehash({
      ...unsafe,
      merchantBusinessContext: { ...unsafe.merchantBusinessContext!, businessName: "Opaque Business 01" },
    });
    expect(compileShadowAiProviderReferenceBoundaryV1(contained).providerPacket.merchantBusinessContext?.businessName).toBe("Opaque Business 01");
  });
});

async function offlinePlan(packet: ShadowAiEconomicResolutionPacketV1): Promise<Record<string, any>> {
  const result = await createShadowAiEconomicResolutionEvaluationAdapterV1().invoke({
    manifest: SHADOW_AI_ECONOMIC_RESOLUTION_MANIFEST_V1,
    packets: [packet],
    signal: new AbortController().signal,
  });
  return JSON.parse(JSON.stringify(result.outputs[0])) as Record<string, any>;
}

function aliasPlan(plan: Record<string, any>, map: ShadowAiProviderReferenceMapV1): Record<string, any> {
  const result = JSON.parse(JSON.stringify(plan)) as Record<string, any>;
  result.inputHash = map.providerInputHash;
  const alias = (value: string, allowed: readonly ShadowAiProviderReferenceClassV1[]): string => {
    for (const referenceClass of allowed) {
      const candidate = providerAliasForInternalReferenceV1(map, referenceClass, value);
      if (candidate) return candidate;
    }
    throw new Error(`missing alias for ${value}`);
  };
  result.exactCitedFactRefs = result.exactCitedFactRefs.map((value: string) => alias(value, ["FACT"]));
  for (const hypothesis of [result.primaryHypothesis, ...result.alternativeHypotheses]) {
    hypothesis.supportingFactRefs = hypothesis.supportingFactRefs.map((value: string) => alias(value, ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]));
    hypothesis.contradictingFactRefs = hypothesis.contradictingFactRefs.map((value: string) => alias(value, ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]));
  }
  for (const suspicion of result.reconstructionSuspicions) {
    suspicion.exactAcceptedFactOrOccurrenceRefs = suspicion.exactAcceptedFactOrOccurrenceRefs.map((value: string) => alias(value, ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]));
    suspicion.conflictingEvidenceRefs = suspicion.conflictingEvidenceRefs.map((value: string) => alias(value, ["FACT", "GOVERNED_EVIDENCE", "ECONOMIC_CHARGE"]));
  }
  return result;
}

function changedPacket(packet: ShadowAiEconomicResolutionPacketV1, opaqueRunRef: string, issueId: string): ShadowAiEconomicResolutionPacketV1 {
  return rehash({ ...packet, opaqueRunRef, issueId });
}

function rehash(value: Omit<ShadowAiEconomicResolutionPacketV1, "immutableInputHash"> | Record<string, unknown>): ShadowAiEconomicResolutionPacketV1 {
  const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  delete clone.immutableInputHash;
  return Object.freeze({ ...clone, immutableInputHash: createHash("sha256").update(canonicalJson(clone)).digest("hex") }) as ShadowAiEconomicResolutionPacketV1;
}

function failureCodes(result: ReturnType<typeof restoreShadowAiProviderReferencesV1>): readonly string[] {
  return result.ok ? [] : result.errorCodes;
}
