import { lstat, mkdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { InternalStatementAnalysisV1, PublicSourceEvidenceManifestV1, RgInternalAuditV1 } from "./internalAnalysisTypes.js";
import { validateInternalAnalysisReferenceGraph, validateInternalStatementAnalysisV1, validatePublicSourceEvidenceManifestV1, validateRgInternalAuditV1 } from "./internalAnalysisValidate.js";

export async function writeInternalAnalysisBundle(outputDirectory: string, analysis: InternalStatementAnalysisV1,
  audit: RgInternalAuditV1, sources: PublicSourceEvidenceManifestV1, approvedOutputRoot = outputDirectory): Promise<string[]> {
  const issues = [...validateInternalStatementAnalysisV1(analysis), ...validateRgInternalAuditV1(audit), ...validatePublicSourceEvidenceManifestV1(sources),
    ...validateInternalAnalysisReferenceGraph(analysis, audit, sources)];
  if (issues.length > 0) throw new Error(`invalid_internal_analysis_bundle:${issues.join(",")}`);
  await assertSafeOutputDirectory(approvedOutputRoot, outputDirectory);
  const files = [
    ["internal-analysis.json", `${JSON.stringify(analysis, null, 2)}\n`], ["internal-analysis.md", formatInternalAnalysisMarkdown(analysis, sources, audit)],
    ["rg-audit.json", `${JSON.stringify(audit, null, 2)}\n`], ["public-source-evidence.json", `${JSON.stringify(sources, null, 2)}\n`],
  ] as const;
  for (const [name] of files) { try { await lstat(path.join(outputDirectory, name)); throw new Error(`internal_analysis_artifact_exists:${name}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  const temporary: Array<[string, string]> = [];
  try {
    for (const [name, value] of files) { const temp = path.join(outputDirectory, `.${name}.${randomUUID()}.tmp`); await writeFile(temp, value, { encoding: "utf8", flag: "wx", mode: 0o600 }); temporary.push([temp, path.join(outputDirectory, name)]); }
    for (const [temp, target] of temporary) await rename(temp, target);
  } catch (error) { await Promise.all(temporary.map(([temp]) => unlink(temp).catch(() => undefined))); throw error; }
  return files.map(([name]) => name);
}

export function formatInternalAnalysisMarkdown(analysis: InternalStatementAnalysisV1, sources: PublicSourceEvidenceManifestV1,
  audit?: RgInternalAuditV1): string {
  const findingLines = (items: InternalStatementAnalysisV1["canonicalFacts"]) => items.length === 0 ? "- none" : items.map((item) => `- **${md(item.title)}**${item.displayValue ? ` — ${md(item.displayValue)}` : ""} _(${md(item.authority)}; ${md(item.supportStatus)})_`).join("\n");
  const recommendationLines = analysis.recommendations.length === 0 ? "- none" : analysis.recommendations.map((item) => `- **${md(item.kind)}** — ${md(item.title)} _(${md(item.actionabilityCeiling)}; merchant control ${md(item.merchantControl)})_`).join("\n");
  const sourceLines = sources.entries.length === 0 ? "- none" : sources.entries.map((item) => `- [${md(item.sourceTitle)}](<${safeMarkdownUrl(item.sourceUrl)}>) — ${md(item.semanticVerification)}; locator ${md(item.locator.locatorId)}`).join("\n");
  const researchLines = analysis.researchQuestionOutcomes.length === 0 ? "- none" : analysis.researchQuestionOutcomes.map((item) =>
    `- **${md(item.questionClass)}** — ${md(item.outcome)}; attempted: ${item.attempted ? "yes" : "no"}; retained candidates: ${item.retainedCandidateCount}; public research still possible: ${item.publicResearchStillPossible ? "yes" : "no"}; reasons: ${item.operationalReasonCodes.length > 0 ? item.operationalReasonCodes.map(md).join(", ") : "none"}`).join("\n");
  const executionMode = audit?.executionMode ?? "not_recorded";
  const providerSends = audit?.externalNetworkCallCount ?? 0;
  return `# Internal Statement Analysis\n\nExecution status: **${analysis.executionStatus}**\n\nResearch outcome: **${analysis.researchOutcome}**\n\nLegacy terminal status: **${analysis.terminalStatus}**\n\nCanonical truth preserved: **${analysis.canonicalTruthPreserved}**\n\n## Execution phases\n\n- The deterministic RH evaluation completed before live research. Provider-disabled markers in \`review.md\` and \`run-audit.json\` describe that deterministic phase only.\n- The subsequent RG phase ran in \`${executionMode}\` mode, recorded ${providerSends} external provider send${providerSends === 1 ? "" : "s"}, and ended with research outcome \`${analysis.researchOutcome}\`.\n\n## Research operations\n\n${researchLines}\n\n## Canonical facts\n\n${findingLines(analysis.canonicalFacts)}\n\n## Statement observations\n\n${analysis.statementObservations.map((item) => `- **${item.label}** — observed ${item.currency} ${item.observedAmountMinor === null ? "unavailable" : (item.observedAmountMinor / 100).toFixed(2)}; noncanonical`).join("\n") || "- none"}\n\n## Admitted knowledge used\n\n${findingLines(analysis.admittedKnowledge)}\n\n## Supported research findings\n\n${findingLines(analysis.supportedResearchFindings)}\n\n## Investigative hypotheses\n\n${findingLines(analysis.investigativeHypotheses)}\n\n## Contradictions\n\n${findingLines(analysis.contradictions)}\n\n## Unresolved questions\n\n${findingLines(analysis.unresolvedQuestions)}\n\n## Recommendations\n\n${recommendationLines}\n\n## Impact\n\n${analysis.impact.map((item) => `- **${item.state}** — ${item.amountMinor === null ? "unquantified" : `USD ${(item.amountMinor / 100).toFixed(2)}`}; annualized: no`).join("\n") || "- unavailable"}\n\n## Public evidence\n\n${sourceLines}\n`;
}

async function assertSafeOutputDirectory(root: string, directory: string): Promise<void> {
  if (!path.isAbsolute(root) || !path.isAbsolute(directory)) throw new Error("internal_analysis_output_path_unsafe");
  const realRoot = await realpath(root); let realDirectory: string;
  try { realDirectory = await realpath(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = await realpath(path.dirname(directory)); if (parent !== realRoot && !parent.startsWith(`${realRoot}${path.sep}`)) throw new Error("internal_analysis_output_outside_root");
    await mkdir(directory, { recursive: false, mode: 0o700 }); realDirectory = await realpath(directory); }
  if (realDirectory !== realRoot && !realDirectory.startsWith(`${realRoot}${path.sep}`)) throw new Error("internal_analysis_output_outside_root");
  if (!(await lstat(realDirectory)).isDirectory()) throw new Error("internal_analysis_output_not_directory");
}
function md(value: string): string { return value.replace(/[\0-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").replace(/[\\`*_[\]{}()#+.!|<>-]/g, "\\$&").replace(/\r?\n/g, " "); }
function safeMarkdownUrl(value: string): string { return value.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/\(/g, "%28").replace(/\)/g, "%29"); }
