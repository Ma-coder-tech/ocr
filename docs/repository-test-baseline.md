# Repository test baseline

The supported repository test command is `npm test`. Vitest uses the `forks`
pool with serial file execution because the suite repeatedly loads and closes
native SQLite and PDF-parser state. Worker-thread execution is not a supported
baseline path for these native-backed suites. The runner deterministically
partitions the test files into small, fresh Vitest processes, assigns each
process an isolated temporary SQLite database, and runs the high-volume
Package 5B integration file alone. This bounds native/PDF and worker-RPC
lifecycle state without skipping tests or relaxing any assertion or timeout.

CI distributes the same deterministic inventory across independent shards.
`RATEREVEAL_TEST_SHARD_INDEX` and `RATEREVEAL_TEST_SHARD_COUNT` are reserved
for that orchestration; an ordinary local `npm test` still executes every test.

The whole-statement work-plan tests use
`test/fixtures/evaluation/five-statement-live-work-plan-observation-v1.json`.
That file is a non-authoritative sizing and failure-shape observation. It is not
the external evaluation artifact and grants no evidence or product authority.
To verify the original artifact separately, set
`RATEREVEAL_FIVE_STATEMENT_LIVE_ARTIFACT_PATH` to an explicitly retained file
and run `npm run evaluation:five-statement-artifact:verify`. The forensic
command verifies the pinned SHA-256 before inspecting it; `npm test` never
reads the external path.

The historical `gold:scope-check` was tied to one branch, one base commit, and
untracked files from a dirty developer worktree. It is retired and is not a CI
gate. Use `npm run repo:clean-check` when a clean checkout is required. The
replacement checks only repository cleanliness and has no branch, base-SHA, or
developer-worktree assumptions.
