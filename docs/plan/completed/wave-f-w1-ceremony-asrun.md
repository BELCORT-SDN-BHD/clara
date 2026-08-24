# Wave-F W1 — the train-activation ceremony, as run (2026-08-24)

**The ceremony of record for the Wave-F merge train's first window.** Run from merged `main`
@ `5649d64` (frontier 0108), ~**16:03–16:10 MYT (UTC+8)**, 2026-08-24. Live moved
**97/`0102_f_a2_statement_activation` → 103/`0108_f_a2_posted_chain`**. DB-only window —
the runtime image is untouched by design (the next image ships with F-A2/PR-2's D-a deploy;
F-A9/PR-0's `chatRoutes` copy rides that image).

> **What this window activated.** The whole four-car train (#313 `0103` π · #310 `0104` ·
> #312 `0105` · #311 `0106-0108`) merged tonight and none of it was live until this window:
> the agent-receipts contract layer, the F-A4 close-gate measurement layer (three D1 rows),
> the F-A9 `begin_chat_turn` recut (law 76, "meter never cap"), and the F-A2 agentic posting
> core with its grants and posted chain.

## 1 · Backup banked FIRST

| | |
|---|---|
| Bundle | **22,416,832 bytes** |
| Destination | `r2:clara-dr/db-snapshots/2026/2026-08-24T08-03-03-719Z` |
| Exit | **0** · plaintext staging purged · hc-ping success |

## 2 · Pre-quiesce tripwire — ALL-PASS

| Check | Result |
|---|---|
| Live frontier is the expected pre-window state | **97 / `0102_f_a2_statement_activation`** ✅ |
| Extraction backlog drained (`queued`/`running`/`held_egress`) | **0**, positive control: 526 total rows visible ✅ |
| Migration set on merged `main` beyond 0102 | exactly `0103`-`0108`, 103 files ✅ |

Body-level prestate verification was left to each migration's own in-transaction §0 section
(abort-at-zero-cost once quiesced), per the F-A2 A+B precedent.

## 3 · Write-quiesce

`clara-runtime` machine `48ee715b763048` stopped. First read: 0 non-idle but **11 idle
`clara_runtime%` sessions** — the known zombie-pooler class. By the reap attempt a minute
later the pooler had dropped them itself: terminate matched 0, and the confirming read
(the same instrument that had just counted 11 — it can say YES) read **0 sessions of any
state**. Quiesce established by positive read.

## 4 · The apply — 6 migrations, 97 → 103

One instrument note, zero live impact: the runbook's `dsn-pipe -- pnpm db:migrate` form dies
on Windows with `spawn pnpm ENOENT` (pnpm is a `.cmd`; dsn-pipe's shell-less spawn is
deliberate argv hygiene and cannot resolve it). It failed BEFORE any connection was made.
Re-run as `dsn-pipe -- node packages/db/scripts/migrate.mjs` (the script resolves its
migrations dir from its own file path, cwd-independent). **Runbook amendment recorded below.**

Applied, each atomic with its in-txn tail battery, every notice green:
`0103_f_a7_pi_additive` · `0104_f_a4_pr_1a_measurement_layer` · `0105_f_a9_chat_token_cap` ·
`0106_f_a2_posting_core` · `0107_f_a2_posting_grants` · `0108_f_a2_posted_chain` —
**103 total, frontier `0108_f_a2_posted_chain`.**

**First live measurement from the F-A4 layer (designed R-3 census, not a failure):** 4 of 7
clients carry live undated uncoded filings, 28 filings total — test-data population, visible
exactly as the design predicted (P2).

## 5 · Positive-read probes — ALL-PASS (two probe defects owned in-line)

| Probe | Result |
|---|---|
| Frontier | 103 / `0108_f_a2_posted_chain` ✅ |
| π settle verbs resolve | 4/4 ✅ |
| `agent_receipts_visible` → `clara_authenticated` SELECT | true ✅ |
| Close-gate catalog rows (`clara.close_gate_checks`) | **14** — matches 0104's tail claim ✅ |
| `begin_chat_turn` carries `v_today` | **0 hits**, positive control: the same detector finds 6 other bodies still carrying `v_today` ✅ |
| `sweep_runs.posted_count` (D43 fourth counter) | present ✅ |
| `_approve_entry_core` | 1 body (gen 9 live; byte-equivalence was the pre-merge battery's evidence) ✅ |

Two probe defects owned as instrument faults, not migration faults (the B3/A+B precedent):
a guessed catalog name (`close_gate_catalog` — the real relation is `close_gate_checks`) and
a guessed `begin_chat_turn` signature; both re-cut onto catalog facts and re-run.

## 6 · Restart and post-checks

| Check | Result |
|---|---|
| `/ready` | **HTTP 200** ✅ |
| Boot loops | 10 acquired incl. `WIKI_PROJECTION acquired` (not dormant) ✅ |
| Post-restart session read | 0 non-idle zombies; 11 sessions = the fresh runtime's own pool ✅ |

## 7 · Ceremony hygiene

- DSN captured **env-to-env** from a dedicated `clara-backup` sleeper machine (`w1-dsn-sleeper`,
  split-argv `sleep 5400`), TLS `verify-full` with the committed CA via `scripts/ops/dsn-pipe.mjs`
  on every connection; **never printed, logged or persisted; the sleeper was destroyed at close.**
- No pinned id written or approved (canary `daba7f2e`, witness `d023b48c` — untouched).

## 8 · Runbook amendment minted here

**On Windows conductors, the dsn-pipe child must be a real executable** — `node <script>`,
never a `.cmd` shim like `pnpm`: dsn-pipe spawns without a shell by design, so `.cmd`
shims die `ENOENT` (loudly, before any connection — the failure is safe but wastes a window
minute). The migrate invocation of record is
`... | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs`.

## 9 · What this window unblocks

The post-W1 cascade, in DAG order: F-A2/PR-1b rebase+merge → F-A9/PR-1A merge → F-A2/PR-2
rig-battery verification lane → merge + the D-a runtime deploy → F-A5 PR-1/PR-2 merges →
the C-flip ceremony → F-A5/PR-3 build (the 11 h seal drill).
