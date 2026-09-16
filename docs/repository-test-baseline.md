# Repository test baseline

The supported repository test command is `npm test`. Vitest uses the `forks`
pool with serial file execution because the suite repeatedly loads and closes
native SQLite and PDF-parser state. Worker-thread execution is not a supported
baseline path for these native-backed suites.

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
