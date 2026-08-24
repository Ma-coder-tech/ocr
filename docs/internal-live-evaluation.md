# RateReveal internal live evaluation

This interface is for Codex-owned, explicitly product-authorized internal evaluations. It is not a general statement runner. The initial committed profile supports only `statement-one` (`fsv-03-clover-short-jun`) with the 2024 public research context.

## One-time credential setup

The product owner creates two Generic Password items in macOS Keychain Access:

- `RateReveal/OpenRouter`
- `RateReveal/OpenAI`

The password value of each item is the corresponding existing API credential. Credentials are not entered in Terminal, chat, repository files, shell configuration, command arguments, or artifacts.

On first authorized Codex access, macOS may display a SecurityAgent prompt stating that `security` wants to use confidential information stored in a Keychain entry. The runner reads `RateReveal/OpenRouter` first and does not request `RateReveal/OpenAI` until the first lookup has conclusively succeeded. Prompts therefore occur one at a time. The product owner may choose an appropriate one-time **Allow**; **Always Allow** is optional and is not required for correctness. No Terminal command, credential copy/paste, or provider operation is involved in approving the prompt.

Each Keychain lookup has a 120-second timeout. This allows time to notice and approve a macOS dialog while preventing an unattended SecurityAgent prompt from blocking Codex indefinitely. A timeout terminates that lookup, starts no second lookup, sends nothing to a provider, and clears any credential reference already acquired by the broker. Keychain failures retain only the service code (`openrouter` or `openai`) and one safe category: entry missing, access denied/cancelled, keychain locked, broker timeout, or unclassified read failure. Raw Keychain output is never logged or persisted.

## Codex interface

After separate, explicit product-owner authorization for one live evaluation, Codex runs:

```sh
npm run evaluate:fiserv-internal-live -- --profile statement-one --authorization product-owner-approved --run-id auto
```

Without the exact authorization token the runner cancels before Keychain access, run-ID allocation, or provider-capable construction and prints `Provider sends: 0`. The runner allocates a fresh three-digit run ID under `/private/tmp/ratereveal-live-internal-evaluation`, refuses collisions, executes once, and has no rerun, retry, or fallback loop.

For a separately authorized zero-send credential and preflight check, Codex uses:

```sh
npm run evaluate:fiserv-internal-live -- --mode readiness --profile statement-one --authorization product-owner-approved --run-id auto
```

Readiness mode verifies the branch, clean worktree, local/remote HEAD agreement, committed network profile, serial accessibility of both Keychain items, and provider-capability construction. It does not allocate a numbered Statement-1 run directory, construct provider ports, or execute analysis. It reports `Provider sends: 0` and clears the credential environment on exit.

For both readiness and live modes, the lifecycle before a numbered run is: authorization/profile validation → repository and network checks → serial bounded Keychain reads → zero-send capability preflight. Only a normal live mode that passes those stages acquires the allocation lock and finalizes a fresh run ID.

The project Codex permission profile enables its managed network proxy and allows exactly `openrouter.ai`, `api.openai.com`, and `merchants.fiserv.com`. The runner separately verifies its committed host profile against the fixed provider endpoints and every production authority origin. Adding a registry origin without explicit network-profile review therefore fails preflight.
