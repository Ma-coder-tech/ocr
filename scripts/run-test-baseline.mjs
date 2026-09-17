import { execFileSync } from "node:child_process";

const requestedArgs = process.argv.slice(2);

if (requestedArgs.length > 0) {
  runVitest(requestedArgs);
} else {
  runVitest(["--exclude", "test/evaluationPackage5BIntegration.test.ts"]);
  runVitest(["test/evaluationPackage5BIntegration.test.ts"]);
}

function runVitest(args) {
  execFileSync(
    process.execPath,
    [
      "scripts/run-node-tool.mjs",
      "./node_modules/vitest/vitest.mjs",
      "run",
      ...args,
    ],
    { cwd: process.cwd(), stdio: "inherit" },
  );
}
