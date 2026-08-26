# Wave F W4 — the closing window's ceremony, as run (2026-08-26)

**The ceremony of record for the Wave-F merge train's fourth and final window.**
Run from merged `main` @ `72dbe0b` (frontier `0136`), ~**18:55–19:05 MYT (UTC+8) /
10:55–11:05 UTC**, 2026-08-26. Live moved **122/`0127` → 131/`0136`**. The Wave-F backend is
now FULLY LIVE end to end, and card 1's stage (b) is LIT.

> **What this window activated.** Nine migrations: F-A4's A.4 segregation truth (`0128`) ·
> F-A3 PR-3's clock train — the eleven-verb bank-rules retirement + parity doors (`0129`,
> #343) · chatTurn v14's bank interactive grants (`0130`) · F-A6's freeform read (`0131`,
> #346) · F-A5b PR-1's sandbox export (`0132`, #345) · G1's wake engine (`0133`, #349) ·
> F-A3 PR-3's C1-bis receipt identity fix-forward (`0134`, #348) · **card 1's substitution
> seam, stages (a)+(b)** (`0135`, #351) · the freeform basis-type fix-forward (`0136`, #350).
> Plus the BL-3 deploy flip: `('evaluate_metric', 2)` DARK → deployed.

## 1 · Pre-window verification — the sweep gate did its job

The first manual-dispatch sweep on merged `main` @ `5601e00` (run `32947061658`) came back
**RED on exactly one leg**: the closed-wave D-b2 upgrade drill's B3 floor still pinned
`clara.accept_bank_rule_suggestion` as live — a verb `0129` legitimately retired. Not a
product regression: a closed-wave floor gone stale against a recorded retirement (closed
drills don't run per-PR by ADR-0073, so the debt surfaces at the first sweep — which is
exactly what the mandatory post-pipeline-merge manual dispatch exists to catch, before a
ceremony rather than after one). The fix — succession-aware floors, branch on migration-stem
OR catalog-witness, post-retirement arm asserting all eleven signatures ABSENT with six
positive controls — landed as **PR #352** (independent review CLEAN with an M3–M5 mutation
matrix; fold round F1–F3). The second sweep (run `32957943076`, `main` @ `72dbe0b`) was
**ALL-GREEN**, including the repaired closed-wave leg and the first true run of the
`wave-e-contract-drills` leg this cycle. That green is the window's measured basis.

## 2 · Backup banked FIRST

| | |
|---|---|
| Bundle | **22,826,361 bytes** |
| Destination | `r2:clara-dr/db-snapshots/2026/2026-08-26T10-56-13-153Z/` |
| Exit | **0** · hc-ping success |

*Instrument note for the next operator: the first DONE-watcher matched a STALE `DONE` line
from an earlier run in the same log stream. The detector must pin THIS run's id/timestamp,
not the phrase alone.*

## 3 · Pre-quiesce tripwire — ALL-PASS

| Check | Result |
|---|---|
| Live frontier is the expected pre-window state | **122 / `0127`** ✅ |
| Extraction backlog drained | **0** open, positive control: 526 total rows visible ✅ |
| Processing tasks drained | **0** open, positive control: 435 total rows visible ✅ |
| `agent_tasks` in-flight states | none (only terminal/held) ✅ |
| Migration set on merged `main` beyond `0127` | exactly `0128`–`0136`, 9 files (131 total on disk) ✅ |

## 4 · Write-quiesce

`clara-runtime` machine `48ee715b763048` stopped (0/2 checks). **11 idle `clara_runtime%`
sessions reaped** (the same figure as the W2/W3 window); positive-read: **0 non-idle**. One
idle Supavisor warm-pool server connection re-appeared between reads and was accepted per the
W2/W3 precedent — with the machine stopped, no client is attached, so no in-flight body is
possible.

## 5 · The apply — 9 migrations, 122 → 131

`fly ssh console -a clara-backup --machine <sleeper> -C "printenv DATABASE_URL" |
node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/migrate.mjs` — all nine atomic,
every in-transaction tail battery green. Tail highlight of record: `0136` re-proved at apply
that its post-image prosrc sha256 is `bf83ebf1…f9553b` (byte-identical to the reviewed
value), that the sole changes are the four freeform-arm substitutions (+7,413 chars, no other
byte moved), and that card-1 `0135`'s three placeholder-arm markers are POSITIVELY present.

## 6 · The BL-3 deploy flip — stage (b) out of DARK

`deploy-evaluator-version.mjs --name evaluate_metric --version 2` under the bare migration
principal (the script verifies `current_user = session_user` first and runs
`clara.verify_evaluator_freeze()` BEFORE the flip): `('evaluate_metric', 2)` · entrypoint
`clara.evaluate_metric_v2(uuid,uuid,uuid[],uuid,uuid)` · 9 members · DARK → **deployed** ·
freeze **7 registered / 7 deployed**. Repo-side manifest lock ran after the window
(`check-frozen-evaluators.mjs --lock-deployed`): it stamped `deployed: true` on
`evaluate_metric_v2` AND on `evaluate_fs_pack_agent_v1` — the latter a **stale-manifest
truing**, not a new act: that evaluator was flipped at the 2026-08-24 D-a window's C-flip and
the manifest was never re-stamped then.

## 7 · Positive-read probes — 8/8 ALL-PASS

| # | Probe | Result |
|---|---|---|
| 1 | Frontier | 131 / `0136` ✅ |
| 2 | `accept_bank_rule_suggestion` ABSENT, with four positive controls (`confirm_bank_identifier_promotion` 1 · `match_bank_line` 1 · `resolve_and_book_bank_line` 1 · `settle_from_bank_line` 1 — the surviving overloads) | ✅ |
| 3 | `metric_primitives` = 12 incl. `cell` | ✅ |
| 4 | `('evaluate_metric', 2)` deployed, 9 members | ✅ |
| 5 | Wake allowlist: `wake_compose_metric_preview_v2` = ONE row, `interactive` only | ✅ |
| 6 | `metric_cells`: 0 grants to `clara_runtime`/`clara_agent_ro`, positive control 8 total grants visible | ✅ |
| 7 | `_sandbox_client_set`: 3 markers, length 19,443 (exact) | ✅ |
| 8 | `verify_evaluator_freeze()` post-flip | `{"ok": true, 7/7}` ✅ |

## 8 · Restart and post-checks

| Check | Result |
|---|---|
| `/ready` | **HTTP 200** ✅ |
| Leases | SIX acquired: `LOCAL_FACTS` · `RULE_POST` · `FACTS_GATE` · `SST_WATCH` · `WIKI_PROJECTION` · `CLASSIFY` ✅ |

## 9 · Ceremony hygiene

- DSN env-to-env from a dedicated `w4-dsn-sleeper` machine (split-argv `sleep 5400`), TLS
  `verify-full` with the committed CA via `scripts/ops/dsn-pipe.mjs` on every connection;
  never printed, logged or persisted; both sleepers (apply + manifest-lock) destroyed at
  close, 0 residue confirmed.
- No pinned id written or approved (canary `daba7f2e`, witness `d023b48c` — untouched).
- `workflow` / `graphile_worker` / `spike` schemas untouched (re-asserted by `0136`'s own
  tail).
- Probe SQL lived in the session scratchpad only; nothing tracked.

## 10 · What this window unblocks

The Wave-F backend is fully live: the retirement/parity clock train, the wake engine, the
receipt-identity wall, the sandbox export lane, freeform read, and **card 1's
constitutional-law-2 substitution seam with stage (b) lit** — `wake_compose_metric_preview_v2`
now mints real placeholder previews for interactive clients, numerals substituted at render
from DB-owned metric cells only. Next: the frontend 磨合 window (its own session), then
Wave G (factory reset + estate e2e + beta). The byte-burn render worker (placeholder→PDF
end-to-end) remains F-A5b PR-3 by prior ruling — sequenced, not owed.
