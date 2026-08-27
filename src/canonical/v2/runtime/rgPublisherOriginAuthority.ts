import { createHash } from "node:crypto";

import { canonicalJson } from "../canonicalJson.js";
import type { KnowledgeSourceAuthority } from "../knowledge/knowledgeTypes.js";
import { normalizeSafeHttpsUrl } from "../intelligence/retrievalSafety.js";

export const RG_PUBLISHER_ORIGIN_BINDING_CATALOG_VERSION = "canonical_rg_publisher_origin_bindings_v1" as const;

type PublicAuthority = Extract<KnowledgeSourceAuthority, "official_network_publication" | "processor_publication">;
type PublicScopeDimension = "processor" | "processorProgram" | "acquirer" | "isoReseller" | "network";

export type CanonicalRgPublisherOriginBinding = Readonly<{
  bindingId: string;
  bindingVersion: number;
  publisherIdentityCodes: readonly string[];
  authorityClasses: readonly PublicAuthority[];
  organizationalDomains: readonly string[];
  applicableScopeDimensions: readonly PublicScopeDimension[];
}>;

export type CanonicalRgPublisherOriginProof = {
  schemaVersion: "canonical_rg_publisher_origin_proof_v1";
  catalogVersion: typeof RG_PUBLISHER_ORIGIN_BINDING_CATALOG_VERSION;
  catalogHash: string;
  bindingId: string;
  bindingVersion: number;
  sourceOrigin: string;
  sourceHostname: string;
  matchedOrganizationalDomain: string;
  publisherIdentityCode: string;
  authorityClass: PublicAuthority;
  applicableScopeDimension: PublicScopeDimension;
  applicableScopeIdentityCode: string;
  proofMethod: "governed_publisher_domain_suffix_plus_independent_https_retrieval";
};

// These are publisher/domain trust anchors, not document or path admissions. Any newly
// discovered HTTPS document under a bound origin still has to pass fingerprint, locator,
// period, scope, authority-locator, and exact semantic-support validation independently.
export const GOVERNED_RG_PUBLISHER_ORIGIN_BINDINGS: readonly CanonicalRgPublisherOriginBinding[] = Object.freeze([
  Object.freeze({
    bindingId: "fiserv_public_web_origins_v1",
    bindingVersion: 1,
    publisherIdentityCodes: Object.freeze(["fiserv_first_data", "fiserv"]),
    authorityClasses: Object.freeze(["processor_publication"] as const),
    organizationalDomains: Object.freeze(["fiserv.com", "cardpointe.com"]),
    applicableScopeDimensions: Object.freeze(["processor", "processorProgram", "acquirer", "isoReseller"] as const),
  }),
]);

export const RG_PUBLISHER_ORIGIN_BINDING_CATALOG_HASH = digest(GOVERNED_RG_PUBLISHER_ORIGIN_BINDINGS);

validateBindings(GOVERNED_RG_PUBLISHER_ORIGIN_BINDINGS);

export function dynamicallyBindPublisherOrigin(input: {
  sourceOrigin: string;
  finalUrl: string;
  publisherIdentityCode: string;
  authorityClass: PublicAuthority;
  publicScope: Record<string, string>;
  bindings?: readonly CanonicalRgPublisherOriginBinding[];
}): CanonicalRgPublisherOriginProof | null {
  try {
    const normalizedFinalUrl = normalizeSafeHttpsUrl(input.finalUrl);
    const normalizedOrigin = new URL(normalizeSafeHttpsUrl(input.sourceOrigin)).origin;
    if (normalizedOrigin !== input.sourceOrigin || new URL(normalizedFinalUrl).origin !== normalizedOrigin) return null;
    const hostname = new URL(normalizedOrigin).hostname.toLowerCase();
    const bindings = input.bindings ?? GOVERNED_RG_PUBLISHER_ORIGIN_BINDINGS;
    validateBindings(bindings);
    for (const binding of bindings) {
      if (!binding.publisherIdentityCodes.includes(input.publisherIdentityCode)
        || !binding.authorityClasses.includes(input.authorityClass)) continue;
      const scopeDimension = binding.applicableScopeDimensions.find((dimension) =>
        input.publicScope[dimension] === input.publisherIdentityCode);
      if (!scopeDimension) continue;
      const matchedDomain = binding.organizationalDomains.find((domain) =>
        hostname === domain || hostname.endsWith(`.${domain}`));
      if (!matchedDomain) continue;
      return {
        schemaVersion: "canonical_rg_publisher_origin_proof_v1",
        catalogVersion: RG_PUBLISHER_ORIGIN_BINDING_CATALOG_VERSION,
        catalogHash: input.bindings ? digest(bindings) : RG_PUBLISHER_ORIGIN_BINDING_CATALOG_HASH,
        bindingId: binding.bindingId,
        bindingVersion: binding.bindingVersion,
        sourceOrigin: normalizedOrigin,
        sourceHostname: hostname,
        matchedOrganizationalDomain: matchedDomain,
        publisherIdentityCode: input.publisherIdentityCode,
        authorityClass: input.authorityClass,
        applicableScopeDimension: scopeDimension,
        applicableScopeIdentityCode: input.publisherIdentityCode,
        proofMethod: "governed_publisher_domain_suffix_plus_independent_https_retrieval",
      };
    }
    return null;
  } catch {
    return null;
  }
}

function validateBindings(bindings: readonly CanonicalRgPublisherOriginBinding[]): void {
  const ids = new Set<string>();
  for (const binding of bindings) {
    if (!/^[-a-z0-9_]{3,96}$/.test(binding.bindingId) || ids.has(binding.bindingId)
      || !Number.isSafeInteger(binding.bindingVersion) || binding.bindingVersion < 1
      || binding.publisherIdentityCodes.length === 0 || binding.publisherIdentityCodes.some((code) => !/^[a-z][a-z0-9_]{0,95}$/.test(code))
      || binding.authorityClasses.length === 0 || binding.authorityClasses.some((authority) =>
        !["official_network_publication", "processor_publication"].includes(authority))
      || binding.organizationalDomains.length === 0 || binding.organizationalDomains.some((domain) =>
        domain !== domain.toLowerCase() || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain))
      || binding.applicableScopeDimensions.length === 0) {
      throw new Error("invalid_rg_publisher_origin_binding");
    }
    ids.add(binding.bindingId);
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
