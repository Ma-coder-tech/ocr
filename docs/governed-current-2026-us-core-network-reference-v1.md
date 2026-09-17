# Governed Current 2026 U.S. Core Network Reference v1

## Milestone boundary and lineage

This internal-only milestone is built from `codex/governed-mastercard-focused-evidence-2024-2026-v1` at `c238a3206a6a544212cd8de1645c525a44fa71d5`. It admits the Product-adjudicated package `RateReveal_Current_2026_US_Core_Network_Reference_FINAL_Product_Adjudicated.md` (SHA-256 `c56f815e911d6955d0a006e9ccfd24d56c4b4bbb071450489e3e7a7b6c86eecd`) through the existing single governed payment-knowledge authority.

It does not change canonical statement facts, customer reports, OCR, frontend behavior, processor support, deployment, or production behavior. Current-reference confidence is neither official-network-par confidence nor a merchant-pricing verdict.

## Exact formal rules and enforced policies

| Rule | Governing behavior |
| --- | --- |
| `CUR-26-01` | Establish currency per claim/row. A current-looking page can contain current and stale rows. |
| `CUR-26-02` | Prefer period-matched dated changes and row-specific currency over stale source-count consensus. |

The Product pack names only those two rules. The authority separately enforces the four reference-confidence states, historical-period protection, no automatic official-par or merchant-pricing upgrade, bulletin-plus-level-source maintenance, immutable evidence/new adjudication layers, and independent Location-case construction. These policies are not given invented `CUR-26-*` rule IDs.

## Exact admitted records

### Dated current changes — `CURRENT_CONFIRMED_CHANGE`

| Record | Current value/mechanic | Effective date and preserved qualification |
| --- | --- | --- |
| `CUR26-CHG-VISA-MISUSE` | $0.15/event | 2025-01-01; preserves $0.09 through 2024-12-31 |
| `CUR26-CHG-VISA-DCSF-POP` | authorization activity | 2025-01-01; preserves clearing/settlement population through 2024-12-31 |
| `CUR26-CHG-VISA-DCSF-RATE` | 0.035%, $0.01 minimum | 2026-06-01; foreign-card U.S. CNP scope |
| `CUR26-CHG-MC-DIGITAL-NO-CAP` | 0.02%, $0.02 minimum, no maximum | 2025-10-01 |
| `CUR26-CHG-MC-CREDENTIAL-CONTINUITY` | $0.09/event | 2025-04-01 |
| `CUR26-CHG-MC-TPE-EXCESSIVE-AUTH` | $0.50/event | 2025-01-01; exact trigger remains separately scoped |
| `CUR26-CHG-MC-DISPUTE-IMAGE` | $0.23/event | 2026-07-01; preserves $0.20 through 2026-06-30 |
| `CUR26-CHG-MC-DISPUTE-CASE` | $1.55/event | 2026-07-01; preserves $1.35 through 2026-06-30 |
| `CUR26-CHG-MC-FALLBACK` | 0.10% | Fiserv's April/June 2026 wording ambiguity is retained; no exact date is invented |
| `CUR26-CHG-MC-MCHIP` | $12/terminal/recurring 30 days | 2026-08-01 |

### Current working references — `CURRENT_WORKING_REFERENCE_STRONG`

| Record | Governed working reference |
| --- | --- |
| `CUR26-WRK-VISA-APF` | domestic credit $0.0195/event; domestic debit/prepaid $0.0155/event |
| `CUR26-WRK-VISA-ASSESSMENT` | credit 0.14%; debit/prepaid 0.13% |
| `CUR26-WRK-VISA-TIF` | $0.10/event in supported trigger scope |
| `CUR26-WRK-VISA-ZERO-FLOOR` | $0.20/qualifying event |
| `CUR26-WRK-VISA-ISA-IAF` | ISA 1.00% USD / 1.40% non-USD; IAF 0.45%; supported high-risk MCC scope 0.90% |
| `CUR26-WRK-MC-NABU-US` | domestic $0.0195/event |
| `CUR26-CHG-MC-NABU-NON-US` | $0.0295/event from 2024-04-15, U.S. merchant/non-U.S. issuer scope; dated processor evidence, therefore strong working reference rather than confirmed network par |
| `CUR26-WRK-MC-LOCATION` | $1.25/qualifying location-month; under-$200, MCC 8398, and MCC 8661 exclusions retained |
| `CUR26-WRK-MC-GLOBAL-CROSS-BORDER` | Global Acquirer Support 0.85%; cross-border USD 0.60%; non-USD 1.00% |
| `CUR26-WRK-DISCOVER-ASSESSMENT` | 0.14% |
| `CUR26-WRK-AMEX-OPTBLUE-ASSESSMENT` | 0.165% in acquired/OptBlue context |

These are useful current references, not official network rate sheets, universal values, or merchant-price conclusions. No `CURRENT_WORKING_REFERENCE_LIKELY` core value was admitted in this pack; that state remains available for a later thinner-but-usable evidence record.

### Explicitly unresolved — `CURRENT_RATE_UNRESOLVED`

| Record | Preserved conflict/gap |
| --- | --- |
| `CUR26-UNR-MC-ASSESSMENT` | 0.13%, 0.1375%, 0.14%, and 0.1475% are candidates; none is admitted universally for 2026 |
| `CUR26-UNR-VISA-BASE-II` | $0.0025 vs $0.0027 per event; System File/Transmission/Network Access identity continuity unresolved |
| `CUR26-UNR-VISA-FANF` | mechanic usable; current tiers not admitted |
| `CUR26-UNR-MC-CONNECTIVITY` | $0.002294 vs $0.0035 per kilobyte |
| `CUR26-UNR-DISCOVER-NETWORK-AUTH` | $0.019 vs $0.025 per event |
| `CUR26-UNR-AMEX-INTERNATIONAL` | 1.00% vs 0.60% |
| `CUR26-UNR-MC-AUTH-INTEGRITY` | 2023 mechanics can remain supported; current pre/final authorization-integrity values unresolved |

## Corrections to stale or unsafe authority behavior

- Multiple current-looking copies of Visa Misuse at $0.09 do not override the dated $0.15 change.
- A current page repeating Mastercard assessment at 0.13% does not override or settle the dated 2024 conflict.
- Page-wide `current` status and majority-source voting are prohibited.
- Bulletin silence cannot confirm unlisted level values.
- A current value does not overwrite a historical row, prove official network par, prove pass-through at par, or establish merchant markup.
- Existing historical Mastercard assessment and Location adjudications remain intact; current-reference status is a separate axis.

## Full Fiserv Gold corpus calibration

All 11 supported Gold statements were rebuilt and analyzed. Across 483 material fee findings:

| Measure | Before | After |
| --- | ---: | ---: |
| Material findings with a usable current-2026 core value/reference | 0 | 49 |
| `CURRENT_CONFIRMED_CHANGE` | 0 | 3 |
| `CURRENT_WORKING_REFERENCE_STRONG` | 0 | 46 |
| `CURRENT_WORKING_REFERENCE_LIKELY` | 0 | 0 |
| `CURRENT_RATE_UNRESOLVED` | 0 | 11 |
| Current-reference-applicable material findings | 0 | 60 |
| Historical findings protected from backward projection | n/a | 49 |
| Confirmed official-network-par findings | 0 | 0 |
| Confirmed markup findings | 0 | 0 |

Usable coverage is 49/60 (81.7%) among material findings to which this focused current-reference pack applies. The Gold corpus ends in 2025, so those 49 references are attached for forward analyst use while historical conclusions remain governed by their actual statement periods. Canonical fingerprints were unchanged before/after for every statement.

The 11 explicit current conflicts add 11 honest ambiguity signals and 11 high-priority bounded research questions. Accordingly, prior regression expectations of 93 ambiguous/competing findings and 401 queued questions were updated to 104 and 412; identities, categories, arithmetic, and canonical values did not move.

## Paysafe Location cases

- Case A: October 2025, statement `doc_19a4477fecfb1432`, fee row `feerow_207eaed065066bddbb8d05b6`, occurrence `srcocc_cabef8ca7ddba4696b2bbe60`.
- Case B: September 2025 zero-volume, statement `doc_1d37bac7aeadf39c`, fee row `feerow_c0d7e771a2f97fc06b9eb588`, occurrence `srcocc_5b849564daf5e6571817d59b`.

Each case independently verifies its period, Fiserv/Paysafe context, exact label, unique occurrence, and its own nonzero separate-fee inventory. Each supports `STRONG` billed-above-reference and `LIKELY` acquiring-side uplift. Separate itemization weakens but does not exclude bundling. Contractual violation, excess price controller, and excess beneficiary remain unresolved; the merchant agreement is needed only for the contract-specific conclusion.

## Validation and remaining gaps

The milestone test suite verifies all 28 records, both formal rules and the separately represented maintenance/safety policies, mixed-current/stale rows within one retained source, dated evidence outranking stale counts, historical Visa Misuse and DCSF protection, separation of the June 2026 token-fee family, all 11 Gold statements, the two independent Location constructions, zero official-par/markup conclusions, immutable evidence, and unchanged canonical fingerprints.

Remaining high-value gaps are the seven explicit unresolved families above, primary-network or comparably authoritative level sources where Product wants official-par confidence, a true 2026 supported statement fixture, and a quarterly refresh/adjudication workflow. Current working references should not be promoted merely by accumulating undated copies.

Recommended next Product batch: resolve the highest-occurrence current conflicts using row-specific dated sources, beginning with Mastercard assessment, Visa Base II identity/value mapping, Mastercard connectivity/kilobyte, and Discover Network Authorization. That batch should preserve merchant price construction as a separate later decision.
