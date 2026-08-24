# RateReveal internal live evaluation

This interface is for Codex-owned, explicitly product-authorized internal evaluations. It is not a general statement runner. The initial committed profile supports only `statement-one` (`fsv-03-clover-short-jun`) with the 2024 public research context.

## One-time credential setup

The product owner creates two Generic Password items in macOS Keychain Access:

- `RateReveal/OpenRouter`
- `RateReveal/OpenAI`

The password value of each item is the corresponding existing API credential. Credentials are not entered in Terminal, chat, repository files, shell configuration, command arguments, or artifacts.

On first authorized Codex access, macOS may display a prompt stating that `security` wants to use confidential information stored in `RateReveal/OpenRouter` or `RateReveal/OpenAI` in the keychain. The product owner may choose **Always Allow** for each entry to avoid repeated prompts. No provider operation occurs merely because Keychain access is granted.

## Codex interface

After separate, explicit product-owner authorization for one live evaluation, Codex runs:

```sh
npm run evaluate:fiserv-internal-live -- --profile statement-one --authorization product-owner-approved --run-id auto
```

Without the exact authorization token the runner cancels before Keychain access, run-ID allocation, or provider-capable construction and prints `Provider sends: 0`. The runner allocates a fresh three-digit run ID under `/private/tmp/ratereveal-live-internal-evaluation`, refuses collisions, executes once, and has no rerun, retry, or fallback loop.

The project Codex permission profile enables its managed network proxy and allows exactly `openrouter.ai`, `api.openai.com`, and `merchants.fiserv.com`. The runner separately verifies its committed host profile against the fixed provider endpoints and every production authority origin. Adding a registry origin without explicit network-profile review therefore fails preflight.
