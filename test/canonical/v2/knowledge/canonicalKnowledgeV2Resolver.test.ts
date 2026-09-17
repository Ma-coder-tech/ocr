import { describe, expect, it } from "vitest";
import {
  knowledgeExact,
  knowledgeUnknown,
  resolveKnowledge,
  unboundedKnowledgeScope,
  validateKnowledgeLibrary,
} from "../../../../src/canonical/v2/index.js";
import { admittedKnowledge, knowledgeQuery, satisfiedKnowledgeCondition } from "./knowledgeFixtures.js";

describe("Payments Knowledge Library v0.2 deterministic resolver", () => {
  it("refuses candidate, researched, and verified material even when values look exact (S7)", () => {
    for (const lifecycle of ["candidate", "researched", "verified"] as const) {
      const entry = admittedKnowledge({ admission: { lifecycle, authorityClass: null, authorityRef: null, admittedAt: null, conditions: [] } });
      expect(resolveKnowledge([entry], knowledgeQuery())).toMatchObject({ status: "unresolved_no_admitted_knowledge", value: null });
    }
  });

  it("also refuses contradicted, superseded, deprecated, rejected, and inactive admitted states", () => {
    for (const lifecycle of ["contradicted", "superseded", "deprecated", "rejected"] as const) {
      const entry = admittedKnowledge({ admission: { lifecycle, authorityClass: "product_owner", authorityRef: "role", admittedAt: "2026-01-01", conditions: [] } });
      expect(resolveKnowledge([entry], knowledgeQuery()).status).toBe("unresolved_no_admitted_knowledge");
    }
  });

  it("admits satisfied conditional knowledge and refuses unsatisfied conditions", () => {
    const good = admittedKnowledge({ admission: { ...admittedKnowledge().admission, lifecycle: "admitted_with_conditions", conditions: [satisfiedKnowledgeCondition()] } });
    expect(resolveKnowledge([good], knowledgeQuery()).status).toBe("resolved_single");
    const bad = { ...good, admission: { ...good.admission, conditions: [satisfiedKnowledgeCondition({ evaluation: "unresolved" })] } };
    expect(resolveKnowledge([bad], knowledgeQuery()).status).toBe("unresolved_policy_rejection");
  });

  it("uses closed-open effective dating", () => {
    const entry = admittedKnowledge({ effectiveFrom: "2026-04-01", effectiveTo: "2026-07-01" });
    expect(resolveKnowledge([entry], knowledgeQuery({ asOf: "2026-04-01" })).status).toBe("resolved_single");
    expect(resolveKnowledge([entry], knowledgeQuery({ asOf: "2026-06-30" })).status).toBe("resolved_single");
    expect(resolveKnowledge([entry], knowledgeQuery({ asOf: "2026-07-01" })).status).toBe("unresolved_scope_or_period");
  });

  it("selects the applicable historical version and refuses a future version", () => {
    const historical = admittedKnowledge({ id: "historical", version: 1, effectiveFrom: "2025-01-01", effectiveTo: "2026-01-01" });
    const future = admittedKnowledge({ id: "future", version: 2, effectiveFrom: "2027-01-01", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 18, fixedAmountMinor: null, currency: null } });
    expect(resolveKnowledge([historical, future], knowledgeQuery({ asOf: "2025-06-01" }))).toMatchObject({ status: "resolved_single", selectedEntryRefs: ["historical"] });
    expect(resolveKnowledge([future], knowledgeQuery()).status).toBe("unresolved_scope_or_period");
  });

  it("does not treat unknown entry scope as a wildcard", () => {
    const scope = { ...admittedKnowledge().scope, network: knowledgeUnknown() };
    expect(resolveKnowledge([admittedKnowledge({ scope })], knowledgeQuery()).status).toBe("unresolved_scope_or_period");
  });

  it("does not let a null query dimension match an exact constraint", () => {
    const scope = { ...admittedKnowledge().scope, network: knowledgeExact("visa") };
    const query = knowledgeQuery({ scope: { ...knowledgeQuery().scope, network: null } });
    expect(resolveKnowledge([admittedKnowledge({ scope })], query).status).toBe("unresolved_scope_or_period");
  });

  it("selects a dimension-by-dimension dominant exact scope", () => {
    const broad = admittedKnowledge({ id: "broad" });
    const exact = admittedKnowledge({ id: "exact", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 15, fixedAmountMinor: null, currency: null }, scope: { ...admittedKnowledge().scope, channel: knowledgeExact("card_present") } });
    expect(resolveKnowledge([broad, exact], knowledgeQuery())).toMatchObject({ status: "resolved_single", value: exact.value, selectedEntryRefs: ["exact"] });
  });

  it("does not apply a universal account-wins rule when scopes are incomparable", () => {
    const account = admittedKnowledge({
      id: "account", visibility: "account_private", tenantRef: "tenant-a", accountRef: "account-a",
      evidence: [{ ref: "contract", sourceAuthority: "official_network_publication", private: true }],
      value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 13, fixedAmountMinor: null, currency: null },
    });
    const network = admittedKnowledge({ id: "network", scope: { ...admittedKnowledge().scope, channel: knowledgeExact("card_present") } });
    expect(resolveKnowledge([account, network], knowledgeQuery())).toMatchObject({ status: "unresolved_conflict", value: null, conflictEntryCount: 2 });
  });

  it("isolates private knowledge across tenants and accounts", () => {
    const privateEntry = admittedKnowledge({
      visibility: "account_private", tenantRef: "tenant-a", accountRef: "account-a",
      evidence: [{ ref: "private-contract", sourceAuthority: "official_network_publication", private: true }],
    });
    expect(resolveKnowledge([privateEntry], knowledgeQuery()).status).toBe("resolved_single");
    expect(resolveKnowledge([privateEntry], knowledgeQuery({ scope: { ...knowledgeQuery().scope, tenantRef: "tenant-b" } })).status).toBe("unresolved_visibility_boundary");
    expect(resolveKnowledge([privateEntry], knowledgeQuery({ scope: { ...knowledgeQuery().scope, accountRef: "account-b" } })).status).toBe("unresolved_visibility_boundary");
  });

  it("corroborates equal maxima without arbitrarily selecting one", () => {
    const first = admittedKnowledge({ id: "first" });
    const second = admittedKnowledge({ id: "second", evidence: [{ ref: "public-evidence-2", sourceAuthority: "official_network_publication", private: false }] });
    expect(resolveKnowledge([first, second], knowledgeQuery())).toMatchObject({
      status: "resolved_corroborated", selectedEntryRefs: ["first", "second"], corroboratingEntryRefs: ["first", "second"],
    });
  });

  it("fails closed on equally specific conflicting admitted entries (S8)", () => {
    const first = admittedKnowledge({ id: "first" });
    const second = admittedKnowledge({ id: "second", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 16, fixedAmountMinor: null, currency: null } });
    expect(resolveKnowledge([first, second], knowledgeQuery())).toMatchObject({ status: "unresolved_conflict", value: null, conflictEntryCount: 2 });
    expect(resolveKnowledge([second, first], knowledgeQuery())).toMatchObject({ status: "unresolved_conflict", value: null, conflictEntryCount: 2 });
  });

  it("does not use confidence as a conflict tie-breaker", () => {
    const high = admittedKnowledge({ id: "high", confidence: "high" });
    const low = admittedKnowledge({ id: "low", confidence: "low", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 99, fixedAmountMinor: null, currency: null } });
    expect(resolveKnowledge([high, low], knowledgeQuery()).status).toBe("unresolved_conflict");
  });

  it("keeps same-value corroboration order-independent", () => {
    const first = admittedKnowledge({ id: "first" });
    const second = admittedKnowledge({ id: "second" });
    const forward = resolveKnowledge([first, second], knowledgeQuery());
    const reverse = resolveKnowledge([second, first], knowledgeQuery());
    expect(forward.status).toBe("resolved_corroborated");
    expect(reverse.status).toBe("resolved_corroborated");
    expect(new Set(forward.selectedEntryRefs)).toEqual(new Set(reverse.selectedEntryRefs));
  });

  it("uses program and template constraints as independent specificity dimensions", () => {
    const broad = admittedKnowledge({ id: "broad" });
    const program = admittedKnowledge({ id: "program", scope: { ...admittedKnowledge().scope, processorProgram: knowledgeExact("program-a") } });
    const template = admittedKnowledge({ id: "template", scope: { ...program.scope, templateFamily: knowledgeExact("fiserv"), templateVersion: knowledgeExact("2026-v1") } });
    expect(resolveKnowledge([broad, program, template], knowledgeQuery())).toMatchObject({ status: "resolved_single", selectedEntryRefs: ["template"] });
  });

  it("uses only claim-policy evidence precedence, not global source ranking", () => {
    const publicTerm = admittedKnowledge({
      id: "public", claimType: "processor_term", subjectCode: "refund_markup", value: { kind: "term", termCode: "refund", termValue: "returned" },
      evidence: [{ ref: "processor-doc", sourceAuthority: "processor_publication", private: false }],
    });
    const accountContract = admittedKnowledge({
      id: "contract", claimType: "processor_term", subjectCode: "refund_markup", value: { kind: "term", termCode: "refund", termValue: "retained" },
      visibility: "account_private", tenantRef: "tenant-a", accountRef: "account-a",
      evidence: [{ ref: "contract", sourceAuthority: "merchant_contract", private: true }],
    });
    const query = knowledgeQuery({ claimType: "processor_term", subjectCode: "refund_markup" });
    expect(resolveKnowledge([publicTerm, accountContract], query)).toMatchObject({ status: "resolved_single", value: accountContract.value });
  });

  it("applies explicit supersession only to the referenced predecessor", () => {
    const old = admittedKnowledge({ id: "old", version: 1, effectiveFrom: "2026-01-01" });
    const current = admittedKnowledge({ id: "current", version: 2, supersedes: ["old"], effectiveFrom: "2026-07-01", value: { kind: "rate", basisCode: "percent_of_volume", rateBasisPoints: 17, fixedAmountMinor: null, currency: null } });
    expect(validateKnowledgeLibrary([old, current]).valid).toBe(true);
    expect(resolveKnowledge([old, current], knowledgeQuery())).toMatchObject({ status: "resolved_single", value: current.value, selectedEntryRefs: ["current"] });
  });

  it("rejects missing, cross-claim, and non-monotonic supersession", () => {
    const base = admittedKnowledge({ id: "base", version: 2 });
    const missing = admittedKnowledge({ id: "missing", version: 3, supersedes: ["not-there"] });
    const cross = admittedKnowledge({ id: "cross", version: 3, claimType: "alias_identity", supersedes: ["base"] });
    const backwards = admittedKnowledge({ id: "backwards", version: 1, supersedes: ["base"] });
    expect(validateKnowledgeLibrary([base, missing, cross, backwards]).issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      "missing_superseded_entry", "cross_claim_supersession", "non_monotonic_supersession",
    ]));
  });
});
