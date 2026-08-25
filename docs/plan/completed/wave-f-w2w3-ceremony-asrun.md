# Wave F W2/W3 — the six-car merge train's combined ceremony, as run (2026-08-25)

**The ceremony of record for the Wave-F merge train's second and third windows, run combined.**
Run from merged `main` @ `1b40ed2` (frontier `0127`), ~**10:47–11:05 MYT (UTC+8) /
02:47–03:05 UTC**, 2026-08-25. Live moved **112/`0117` → 122/`0127`**. Track A's backend is now
FULLY LIVE.

> **What this window activated.** Ten migrations across six independently-reviewed cars: F-A2's
> cutover + rules-tier retirement (`0118`, #324) · F-A3's three-part bank agency (PR-1a `0119`
> #327 · PR-1b `0121` #328 · PR-1c `0122` #330) · F-A4's Window-B close-lifecycle writers +
> task #17 Fix A (`0120`, #329) · F-A7's three review-ladder trains — γ firm-narrow egress
> (`0123`, #331), α judgement-basis admission + the congruence wall (`0124`/`0125`, #332), β the
> filing verb + interview wake surface (`0126`, #333) · F-A5's signed-original archive doors +
> byte-reproduction seal drill (`0127`, #334). Each car carried its own gate record, build,
> cross-model review and — for four of the six — a first-chain-meeting fix round found only when
> the whole batch met on one estate leg (DR-roles + frozen-window on PR-1b, cross-package fixture
> on γ, three failure classes on β; see the lane-brief amendment below).

## 1 · Pre-window verification — the manual-dispatch sweep

Before the window opened, the full manual-dispatch CI sweep ran against `main` at the `0127`
frontier — **ALL-GREEN**, including the closed-wave drills and the D-b frontier matrix
(`gh workflow run ci.yml`, **run `32801086161`**). This is the measured basis for striking the
pre-existing "d-b2 one cell under its own cells-floor" known issue: the same leg that had been
reported short of its floor ran clean on this sweep.

## 2 · Backup banked FIRST

| | |
|---|---|
| Bundle | **22,541,187 bytes** |
| Destination | `r2:clara-dr/db-snapshots/2026/2026-08-25T02-47-44-594Z/` |
| Exit | **0** · plaintext staging purged · hc-ping success |

## 3 · Pre-quiesce tripwire — ALL-PASS

| Check | Result |
|---|---|
| Live frontier is the expected pre-window state | **112 / `0117`** ✅ |
| Extraction backlog drained (`queued`/`running`/`held_egress`) | **0**, positive control: 526 total rows visible ✅ |
| Processing tasks drained | **0** open, positive control: 435 total rows visible ✅ |
| Migration set on merged `main` beyond `0117` | exactly `0118`–`0127`, 10 files (122 numbered migrations total on disk) ✅ |

Body-level prestate verification was left to each migration's own in-transaction §0 section
(abort-at-zero-cost once quiesced), per the F-A2 A+B / W1 precedent.

## 4 · Write-quiesce

`clara-runtime` machine `48ee715b763048` stopped. Read: **0 non-idle** sessions; **11 idle
`clara_runtime%` sessions** were reaped, and **1 idle Supavisor warm-pool server connection**
remained after the reap. Zero non-idle is the W1-precedent criterion — no client attached to
the one remaining idle connection means no in-flight body was possible. Quiesce judged
established by the same positive-read instrument that counted the 11 reaped sessions (it can
say YES, so its 0-non-idle read counts).

## 5 · The apply — 10 migrations, 112 → 122

`... | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs`, per the W1
runbook amendment (the `.cmd`-shim `ENOENT` avoided). All ten atomic, every in-txn tail battery
green:

| Migration | Car | PR | Tail highlight |
|---|---|---|---|
| `0118_f_a2_cutover_retirement` | F-A2 PR-3 | #324 | Seventeen retiring rules-machine verbs confirmed **ABSENT** |
| `0119_f_a3_pr1a_core_extractions` | F-A3 PR-1a | #327 | Nine cores re-proven pure at apply |
| `0120_f_a4_pr1b_close_lifecycle` | F-A4 PR-1b | #329 | Sixteen D1 rows + task #17 Fix A's both-body positional proof |
| `0121_f_a3_pr1b_agent_limb` | F-A3 PR-1b | #328 | DDL 1b M8 recut + the 13-row `bank_agent` role allowlist |
| `0122_f_a3_egress_purpose_bank_matching` | F-A3 PR-1c | #330 | `bank_matching` admitted to the egress-purpose family, ACLs measured before/after |
| `0123_f_a7_gamma_typed_egress` | F-A7 γ | #331 | The 5th egress purpose + the classify consent gate at enqueue |
| `0124`/`0125_f_a7_alpha_*` | F-A7 α | #332 | The congruence wall functionally proven both ways, in a forced-rollback subtransaction |
| `0126_f_a7_beta_filing_interview` | F-A7 β | #333 | The three-train staging confirmed wired to REAL merged bodies |
| `0127_f_a5_pr3_signed_original_archive` | F-A5 PR-3 | #334 | D1 **NONE** proven by catalog byte-identity |

## 6 · Positive-read probes — 9/9 ALL-PASS

| # | Probe | Result |
|---|---|---|
| 1 | Frontier | 122 / `0127` ✅ |
| 2 | Retirement absent, with positive control (other bodies still present) | ABSENT + control confirms the detector can see a live body ✅ |
| 3 | Five sampled F-A3 core bodies read `human_ctx`-free | 5/5 ✅ |
| 4 | `wake_credentials` CHECK carries all four new kinds | ✅ |
| 5 | `bank_agent` allowlist | 13 + 6 ✅ |
| 6 | ≥2 α2 congruence walls live on `document_filings` | confirmed reading 7 non-`internal` triggers ✅ |
| 7 | γ firm-narrow egress family | 2/2 ✅ |
| 8 | `0127` archive doors | authenticated-only ✅ |
| 9 | New cluster roles | 3, each present in `deploy/roles-bootstrap.sql` ✅ |

## 7 · Restart and post-checks

| Check | Result |
|---|---|
| `/ready` | **HTTP 200** ✅ |
| Boot loops / leases | Four leases acquired: `FACTS_GATE` · `SST_WATCH` · `CLASSIFY` · `WIKI_PROJECTION` ✅ |

## 8 · Ceremony hygiene

- DSN captured **env-to-env** from a dedicated `w2-dsn-sleeper` machine (split-argv
  `sleep 5400`), TLS `verify-full` with the committed CA via `scripts/ops/dsn-pipe.mjs` on every
  connection; **never printed, logged or persisted; the sleeper was destroyed at close.**
- No pinned id written or approved (canary `daba7f2e`, witness `d023b48c` — untouched).
- Probe scripts stayed untracked and were deleted at close.

## 9 · What this window unblocks

Track A's backend is now fully live: F-A2 (posting core + cutover), F-A3 (bank agency, all
three PRs), F-A4 (close key, Window B), F-A5 (reporting agency through the seal + byte-repro
drill), and F-A7's full three-train filing/interview/judgement family are all on the live
frontier. Remaining Track-A backend item: **F-A3/PR-3, the clock train — W4.** The owner-mandated
**debt-clearing sprint runs next** (see `PROGRESS.md` Backlog for the folded-in items from this
window's review ladders — the self-referential gate, the seal-drill CI leg decision, the drill
doc line, the defence-in-depth cell, the scanner comment-masking nit, the unprovable-kind waiver
hardening, the three stale `UNNUMBERED_f_a2_*` deletions, the `wake_propose_bank_identifier_promotion`
consolidation, and the six forward obligations named at the β/α/γ ladders). The frontend
(Codex session, `frontend/web`) continues in parallel per its 2026-08-23 handoff.
