# Trusted merge attestation closure (operator-run)

This package is an independent check publisher, not a corpus validator. It reads
GitHub PR, workflow-run and job metadata; it never receives merchant documents,
cloud/corpus credentials, or validator output artifacts. The approved caller
workflow bytes and reusable-workflow SHA are pinned in
`scripts/private-corpus-merge-attest.mjs`. It recomputes relevance with the
reviewed private-corpus gate classifier and requires the secure job, including
its source/package/validation steps, to pass whenever relevant. A successful
generic GitHub Actions check is not evidence for publication.

## Execution and credential boundary

The minimum no-hosting model is one trusted operator invocation after the
exact-head CI run completes and immediately before considering merge. It is not
run in the target repository's Actions, a fork, a PR checkout, or a browser
callback. There is no webhook, server, scheduler, client secret or OAuth user
token. This incurs no standing service cost, but a trusted operator must attest
every new PR head (and repeat after the base or trusted run changes).

After Product approves an exact attestor commit, the operator uses a clean,
detached checkout at **that approved commit**, outside any PR-writable runner,
and verifies its HEAD and file hashes against the Product-approved values
before allowing it to read the App key. Do not execute a later PR modification
with the key. Keep the private PEM outside Git, the checkout, Actions secrets,
artifacts, logs and shell history. The CLI requires an absolute path to a
regular key file with no group/other permissions. Prefer an operator-owned
encrypted vault/keychain-backed filesystem and an ephemeral protected
workstation session; rotate and revoke the App key on compromise or operator
turnover. A short-lived, single-repository installation token is minted in
memory for each invocation. Do not print that token.

The only CLI input is a PR number. The script obtains the live PR, changed-file
list, caller workflow at the live head, workflow runs filtered by head SHA,
latest exact run attempt, and its jobs from GitHub APIs. It refuses if evidence
is absent, incomplete, stale, ambiguous or mismatched. It re-reads the live PR
just before posting the check. Its success payload contains only PR/run IDs,
the head SHA and approved workflow SHA. No source document data is read.

## Proposed GitHub App (not yet registered)

- Name: `RateReveal Attestor Macodertech`; expected slug:
  `ratereveal-attestor-macodertech` (GitHub-wide name availability must be
  confirmed by the owner).
- Owner: the repository-owning `Ma-coder-tech` personal account. Private App,
  install on **only** `Ma-coder-tech/ocr`.
- Repository permissions: Actions **read-only** (workflow runs/jobs), Pull
  requests **read-only** (live PR/files), Contents **read-only** (exact-head
  caller workflow), Checks **read and write** (dedicated check run). Metadata
  read is implicit. All other repository, organization and account permissions
  are **No access**. No corpus/cloud permission. No webhook events.
- Webhook **Active off**. No webhook URL, callback URL, setup URL, or user OAuth
  authorization is needed.
- App private key: owner-generated only after Product reviews this design.
  Store outside the repository and PR-accessible GitHub Actions. App ID and
  installation ID are not secrets; the CLI discovers the installation. The
  private key does not expire automatically; rotate it deliberately and delete
  the old key in GitHub. Installation tokens expire after one hour.

GitHub's ruleset documentation says App-source selection may require
`statuses:write` in addition to a recently submitted check, even though the
Checks API documents `checks:write` for publishing. Do **not** grant Statuses
write preemptively. Test the checks-only App canary first. If the ruleset cannot
select it, stop and return this additional permission for Product review; do
not change the ruleset or self-grant wider scope.

Owner registration steps, when separately approved:

1. In GitHub, profile menu → **Settings** → **Developer settings** → **GitHub
   Apps** → **New GitHub App**. Enter the exact name above, description
   `Attests approved RateReveal private-corpus CI evidence`, and homepage
   `https://github.com/Ma-coder-tech/ocr`.
2. Leave callback/setup URL blank and user authorization on installation off;
   deselect **Active** under Webhook. Set the four repository permissions above,
   no events, no other permissions, and select **Only on this account**.
3. Register. Record the App ID and verify its slug. In **Install App**, install
   on `Ma-coder-tech` with **Only select repositories** → `ocr`.
4. Under **Private keys**, generate one key. Move it immediately to the
   operator's secure store outside any repo; restrict mode to `0600`. Verify its
   fingerprint against GitHub. Do not paste the PEM into Codex, a shell command,
   Actions secrets, a PR, or a ticket.
5. After Product approves the exact attestor commit and operator checkout,
   set `RATEREVEAL_ATTESTOR_APP_ID` and
   `RATEREVEAL_ATTESTOR_PRIVATE_KEY_FILE` in the protected operator session,
   then run `node scripts/private-corpus-merge-attest.mjs <PR-number>`. Never
   run that command in GitHub Actions or from an unreviewed PR head.

## Proof and ruleset transition

The synthetic test uses a fake publisher and no App key; it verifies one
success and adversarial refusals. A later App canary must inspect the actual
GitHub `check-runs` response and confirm `app.id` equals the new App ID and
`head_sha` equals the live PR head. Only then may Product consider replacing
the existing `private-corpus-policy` requirement (GitHub Actions integration
`15368`) with `ratereveal-private-corpus-attested` bound to that **observed**
App integration ID. Preserve all seven other required checks, strict-status
policy and all other ruleset entries. No ruleset change is authorized by this
document.

The operator model is intentionally manual. It is suitable only if Product
accepts an operator attestation immediately before merge and repeats it after
any head/base/run change. For unattended continuous re-attestation or immediate
revocation after a run is rerun, a separate private control plane or webhook
service would be needed; that is a separate infrastructure/Product decision.
