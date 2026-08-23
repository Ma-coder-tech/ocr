import { runFiservOneStatementEvaluation } from "../src/canonical/v2/evaluation/fiservEvaluationHarness.js";

const args = process.argv.slice(2);
const value = (flag: string): string => {
  const indexes = args.flatMap((item, index) => item === flag ? [index] : []);
  if (indexes.length !== 1 || indexes[0] === args.length - 1 || args[indexes[0]! + 1]!.startsWith("--")) {
    throw new Error(`Exactly one ${flag} value is required.`);
  }
  return args[indexes[0]! + 1]!;
};
const recognized = new Set(["--statement", "--safe-id", "--run-version", "--output", "--statement-completeness"]);
for (let index = 0; index < args.length; index += 2) if (!recognized.has(args[index]!)) throw new Error(`Unknown argument: ${args[index]}`);

const result = await runFiservOneStatementEvaluation({
  statementPaths: [value("--statement")], safeStatementId: value("--safe-id"), runVersion: value("--run-version"),
  outputDirectory: value("--output"), sourceProfile: { statementCompleteness: value("--statement-completeness") as any },
});
process.stdout.write(`${JSON.stringify({ safeStatementId: result.audit.safeStatementId, outcome: result.audit.finalPublicExperience,
  runVersion: result.audit.runVersion, readiness: result.audit.readiness.outcome.state,
  bundleFiles: ["rh-projection.json", "review.md", "run-audit.json"] })}\n`);
