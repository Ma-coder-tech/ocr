import type { KnowledgeEntry } from "./knowledgeTypes.js";
import { validateKnowledgeLibrary } from "./knowledgeValidate.js";

export type ImmutableKnowledgeLibrary = Readonly<{ entries: readonly KnowledgeEntry[] }>;

export function createImmutableKnowledgeLibrary(entries: readonly KnowledgeEntry[]): ImmutableKnowledgeLibrary {
  const validation = validateKnowledgeLibrary(entries);
  if (!validation.valid) throw new Error(`invalid_knowledge_library:${validation.issues.map((item) => item.code).join(",")}`);
  const copied = entries.map((entry) => Object.freeze({
    ...entry,
    value: Object.freeze({ ...entry.value }),
    scope: Object.freeze(Object.fromEntries(Object.entries(entry.scope).map(([key, value]) => [key, Object.freeze({ ...value })]))) as KnowledgeEntry["scope"],
    evidence: Object.freeze(entry.evidence.map((evidence) => Object.freeze({ ...evidence }))) as unknown as KnowledgeEntry["evidence"],
    supersedes: Object.freeze([...entry.supersedes]) as unknown as string[],
    limitations: Object.freeze([...entry.limitations]) as unknown as string[],
    admission: Object.freeze({
      ...entry.admission,
      conditions: Object.freeze(entry.admission.conditions.map((condition) => Object.freeze({
        ...condition,
        requiredSourceAuthorities: Object.freeze([...condition.requiredSourceAuthorities]),
        requiredScope: Object.freeze({ ...condition.requiredScope }),
      }))) as unknown as KnowledgeEntry["admission"]["conditions"],
    }),
  }));
  return Object.freeze({ entries: Object.freeze(copied) });
}
