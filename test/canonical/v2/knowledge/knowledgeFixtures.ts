import {
  knowledgeExact,
  unboundedKnowledgeScope,
  type KnowledgeEntry,
  type KnowledgeAdmissionCondition,
  type KnowledgeQuery,
} from "../../../../src/canonical/v2/index.js";

export function admittedKnowledge(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "knowledge-1",
    version: 1,
    claimType: "published_network_rate",
    subjectCode: "visa_assessment",
    value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 14, fixedAmountMinor: null, currency: null },
    scope: { ...unboundedKnowledgeScope(), network: knowledgeExact("visa"), region: knowledgeExact("us"), jurisdiction: knowledgeExact("us") },
    visibility: "reusable",
    tenantRef: null,
    accountRef: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    evidence: [{ ref: "public-evidence-1", sourceAuthority: "official_network_publication", private: false }],
    admission: {
      lifecycle: "admitted",
      authorityClass: "authorized_domain_reviewer",
      authorityRef: "review-role-1",
      admittedAt: "2026-01-02T00:00:00Z",
      conditions: [],
    },
    supersedes: [],
    limitations: [],
    confidence: "high",
    ...overrides,
  };
}

export function satisfiedKnowledgeCondition(overrides: Partial<KnowledgeAdmissionCondition> = {}): KnowledgeAdmissionCondition {
  return {
    type: "claim_evidence_scope_period",
    claimType: "published_network_rate",
    requiredSourceAuthorities: ["official_network_publication"],
    requiredScope: { network: "visa", region: "us" },
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    evaluation: "satisfied",
    evaluatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

export function knowledgeQuery(overrides: Partial<KnowledgeQuery> = {}): KnowledgeQuery {
  return {
    claimType: "published_network_rate",
    subjectCode: "visa_assessment",
    asOf: "2026-08-01",
    scope: {
      tenantRef: "tenant-a",
      accountRef: "account-a",
      processor: "fiserv",
      acquirer: "fiserv",
      isoReseller: "iso-a",
      processorProgram: "program-a",
      network: "visa",
      region: "us",
      channel: "card_present",
      cardProduct: "credit",
      merchantCategory: "restaurant",
      pricingProgram: "interchange_plus",
      templateFamily: "fiserv",
      templateVersion: "2026-v1",
      sourceSection: "fees",
      population: "visa_credit",
      jurisdiction: "us",
    },
    ...overrides,
  };
}
