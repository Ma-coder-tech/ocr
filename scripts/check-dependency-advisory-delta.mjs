import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const baselinePath = path.resolve("config/dependency-advisory-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

const fullAudit = runAudit([]);
const productionAudit = runAudit(["--omit=dev"]);
const failures = [];

for (const [packageName, current] of Object.entries(fullAudit.vulnerabilities ?? {})) {
  const accepted = baseline.vulnerabilities[packageName];
  if (!accepted) {
    failures.push(`new vulnerable package: ${packageName} (${current.severity})`);
    continue;
  }
  if (severityRank[current.severity] > severityRank[accepted.severity]) {
    failures.push(`severity increased: ${packageName} ${accepted.severity} -> ${current.severity}`);
  }
  if (current.isDirect && !accepted.isDirect) {
    failures.push(`dependency exposure became direct: ${packageName}`);
  }
  const acceptedSources = new Set(accepted.advisorySources.map(String));
  for (const source of advisorySources(current)) {
    if (!acceptedSources.has(source)) failures.push(`new advisory source for ${packageName}: ${source}`);
  }
}

for (const [packageName, current] of Object.entries(productionAudit.vulnerabilities ?? {})) {
  const acceptedSeverity = baseline.productionVulnerabilities[packageName];
  if (!acceptedSeverity) {
    failures.push(`new production vulnerability: ${packageName} (${current.severity})`);
    continue;
  }
  if (severityRank[current.severity] > severityRank[acceptedSeverity]) {
    failures.push(`production severity increased: ${packageName} ${acceptedSeverity} -> ${current.severity}`);
  }
}

const result = {
  status: failures.length === 0 ? "accepted_inherited_baseline_no_regression" : "dependency_advisory_regression",
  baselineSourceCommit: baseline.sourceCommit,
  currentTotals: fullAudit.metadata?.vulnerabilities ?? null,
  currentProductionTotals: productionAudit.metadata?.vulnerabilities ?? null,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exit(1);

function runAudit(args) {
  const result = spawnSync("npm", ["audit", "--json", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!result.stdout.trim()) {
    throw new Error(`npm audit did not return JSON: ${result.stderr.trim() || "unknown error"}`);
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (parsed.error) throw new Error(parsed.error.summary || parsed.message || "npm audit endpoint error");
    return parsed;
  } catch (error) {
    throw new Error(`npm audit output could not be evaluated: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function advisorySources(vulnerability) {
  return (vulnerability.via ?? [])
    .filter((item) => item && typeof item === "object" && item.source !== undefined)
    .map((item) => String(item.source));
}
