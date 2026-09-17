import type { EvidenceNeed, EvidenceRoute, EvidenceScope } from "./types.js";

const ROUTE_ORDER: EvidenceScope[] = ["statement_local", "private_authorized", "public_rg", "unresolvable"];

export function routeEvidenceNeeds(needs: EvidenceNeed[]): EvidenceRoute[] {
  return [...needs]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((need) => {
      const exhausted = new Set(need.exhaustedScopes ?? []);
      const available = new Set(need.availableScopes);
      const scope = ROUTE_ORDER.find((candidate) => available.has(candidate) && !exhausted.has(candidate)) ?? "unresolvable";
      const publicRgBlocked = scope !== "public_rg" && (
        (available.has("statement_local") && !exhausted.has("statement_local")) ||
        (available.has("private_authorized") && !exhausted.has("private_authorized"))
      );
      return {
        evidenceNeedId: need.id,
        scope,
        publicRgBlocked,
        reason: publicRgBlocked
          ? `Lower-scope ${scope} evidence must be exhausted before public RG.`
          : scope === "unresolvable"
            ? "No admissible unexhausted evidence route remains."
            : `Next admissible route is ${scope}.`,
      };
    });
}
