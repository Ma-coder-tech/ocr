import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const status = execFileSync(
  "git",
  ["status", "--porcelain=v1", "--untracked-files=all"],
  { cwd: root, encoding: "utf8" },
).trim();

if (status.length > 0) {
  console.error("Repository clean-check failed. Commit, stash, or remove the following worktree changes:");
  console.error(status);
  process.exit(1);
}

console.log(JSON.stringify({ status: "clean", head }));
