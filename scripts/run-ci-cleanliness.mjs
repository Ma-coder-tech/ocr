import { execFileSync } from "node:child_process";

/** @type {Array<[string, string[]]>} */
const commands = [
  ["npm", ["run", "repo:clean-check"]],
];
if (!process.argv.includes("--generated-only")) commands.push(["npm", ["test"]]);
commands.push(
  ["npm", ["run", "build"]],
  ["npm", ["run", "typecheck:web"]],
  ["npm", ["run", "build:web:check"]],
  ["npm", ["run", "corpus:test"]],
  ["npm", ["run", "gold:validate"]],
  ["npm", ["run", "gold:test"]],
  ["npm", ["run", "gold:audit"]],
  ["npm", ["run", "evaluation:integrity:dry-run"]],
  ["npm", ["run", "validate:foundation"]],
  ["npm", ["run", "fiserv:coverage:check"]],
  ["npm", ["run", "repo:clean-check"]],
);

for (const [command, args] of commands) {
  console.log(`\n[ci-cleanliness] ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      SHADOW_AI_PLANNER_INTERNAL_KILL_SWITCH: "true",
      OPENAI_API_KEY: "",
      OPENROUTER_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
  });
}
