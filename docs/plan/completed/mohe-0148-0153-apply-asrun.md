# 0148–0153 apply — as-run (2026-08-30, the overnight merge train: six files, one ceremony, TWO windows)

**Outcome: APPLIED. Live = 148 / `0153_f_t1_sst_reference_tables`.** Six migrations (`0148`
duplicate-open wall · `0149` 裁-19 PR-1 counterparty-merge read layer · `0150` 裁-21 PR-a COA
template · `0151` F-A9 PR-1B brake census · `0152` F-T3 PR-1 tax platform · `0153` F-T1 PR-1 SST
reference tables) applied in one ceremony that needed **two** D1 write-quiesce windows — the first
(00:30:06Z–00:31:06Z) applied `0148`–`0150` and was **refused by `0151`'s own quiesce guard**; the
second (00:32:54Z–00:35:21Z) waited the guard out and applied `0151`–`0153`. **Eleven live writer
bodies replaced** (`0148`: 2 · `0149`: 4 · `0151`: 5), **nine do-not-touch witnesses byte-identical**
across both windows (`_identifier_promotion_core`, `_canonical_counterparty`, `_control_tie_core`,
`_tf_counterparty_update_0011`, `_approve_entry_core` `d5ab4afc…`, `_human_ctx`, `_reserve_op`,
`_finish_op`, `jwt_firm`, `agent_user_id`). Runtime `/ready` 200 after both windows (10 s each).

Source PRs: #425 (`0148`, `7b47fa5f`) · #427 (`0149`, `91f7a5eb`) · #428 (`0150`, `32902902`) ·
#429 (`0151`, `31de7f97`) · #431 (`0152`, `a4973d31`) · #432 (`0153`, `3ecbe657`). Repo head at the
window: `3ecbe657` on `main`. File shas pinned equal on the rehearsal rig and at BOTH windows (a
differing sha, or a seventh numbered file on disk, is a refuse-condition — exits 91 / 88):
`0148` `85493954…` · `0149` `e44758a0…` · `0150` `ce24b492…` · `0151` `f6d093e5…` · `0152`
`fe1341a9…` · `0153` `e05ce9c2…`.

## The gates the windows waited on

1. **Rehearsal rig at the live frontier** (`postgres:17`, throwaway, migrations `0001–0147` held
   out physically, seeded at 0147 — the seed applies at that frontier now that `0147` is the
   token-hash shape): `142 total` → tripwire captured (73 rows) → the six files applied in ONE
   migrate call (`6 new · 148 total`, every prestate and tail notice OK) → post-reads (87 rows) →
   second apply `0 new · 148 total`. A mechanical body check over the two captures: **11 RECUT, every
   witness SAME** (`BODY-CHECK|OK`). Two read-instrument defects found and fixed BEFORE live was
   read: `metric_na_reason_versions` keys on `reason_key`, not `key`, and carries no
   `seeded_in_migration`; and psql on Windows writes CRLF, so a sha read as the LAST field of a
   line carried a `\r` and compared unequal (the pre sha sat mid-line) — `split(/\r?\n/)` and strip.
2. **Tripwire, rig vs live: IDENTICAL 64/64** (sorted sets; instrument
   `encode(sha256(convert_to(prosrc,'UTF8')),'hex')`; the eleven bodies + nine witnesses with ACL /
   owner / secdef / proconfig, the pre-shapes — `ix_client_identifier_promotions_open` non-unique,
   no partial uniques on either 0148 target, `counterparty_merges` ABSENT, the eight new relations
   ABSENT, `firm_limits` 9 columns + its CHECKs, `sst_threshold_schedule` 5 columns — allowlist 88,
   the two invariant indexes). REPORTED rows on live: `EVENT_TYPES 112`, `TAXONOMY_ACTIVE 112`,
   `REASON_VERSIONS_PLATFORM 9`, `FACT_KEYS 5`, `OPEN_PROMO_GROUPS 0`, `OPEN_ONBOARDING_Q_DOCS 0`,
   `SWEEP_ITEMS_REFUSED_BUDGET 461`, `MERGED_COUNTERPARTIES 0`, frozen schemas 20/23.
3. **Backup banked first**: `clara-backup` run `2026-08-30T00-21-17-636Z`, migration-head 142,
   bundle 23,305,012 bytes → `r2:clara-dr/db-snapshots/2026/2026-08-30T00-21-17-636Z/`, machine
   auto-stopped (log ANSI-stripped, pinned by the pre-start timestamp).
4. **In-flight zero, with the totals as positive controls**: agent_tasks 0/232 · document
   processing 0/435 · intakes 0/159 · sweep runs 0 open / 16,124 · both wake sources
   `enabled=false` · open promotions 0 · open firm questions 0 · pending invites 0 · operator
   firms 0.
5. **Every file's own prestate** re-pinned its bodies by prosrc sha on live (each file is the
   ceremony's second wall): `0148` both bodies + `_identifier_promotion_core`'s caller census
   exactly 1; `0149` four bodies to their Annex B.1 pre-images + 15 witnesses stashed, the
   `_canonical_counterparty` caller census 33 WITHOUT `_aging_core` (finding M2 reproduced on
   live), 14 tie baselines through the OLD bodies, 0 pre-existing merges without a carrier row;
   `0150` 996 functions snapshotted for its whole-catalog D1-EMPTY differential; `0151` five
   bodies at the 0147-measured shas, 116,920 `sweep_run_items` of which 461 `refused_budget`
   (checksum `c9c4bd42…`), whole-catalog baseline 1010 functions / 259 relations; `0152` 24 reason
   keys free by NAME + the 9 Wave-E platform v1 rows present (scoped, never a whole-table count);
   `0153` the closure roots roster + the `sst_threshold_schedule` 2-row premise.

## Window 1 (run `win0148-20260830T003003Z`) — refused by design at 0151

- `fly machine stop 48ee715b763048` → `stopped` (00:30:06Z). Quiesce: two idle
  `clara_runtime_login` sessions reaped, **`NON_IDLE_AFTER|0`**. Apply at 00:30:19Z.
- `0148` applied (tail: both partial uniques censused BY PROPERTY) · `0149` applied · `0150`
  applied · **`0151` REFUSED and rolled back**: *"F-A9 PR-1B QUIESCE GUARD: a runtime heartbeat is
  fresh (component world, beat_at 2026-08-30 00:30:08) … stop clara-runtime, wait for staleness
  (>90s), and re-apply"*. The file replaces the unattended admission hot path and both
  processing-call reservation verbs, and refuses while ANY `runtime_heartbeats` row is younger
  than 90 s — the apply came 13 s after the stop. **Correct behaviour; the window's pacing was the
  defect.** Post-reads read live at `0150 / 145` (the six 0148/0149 bodies at their rehearsal POST
  shas; `0151`'s five at PRE); runtime restarted, `/ready` 200 after 10 s; sleeper destroyed. Each
  file is its own transaction, so live was consistent at `0150` between the windows.
- Fix to the kit before window 2: after the positive quiesce read, the script polls the freshest
  heartbeat age through the bridge (`heartbeat-age.sql`, any component) and applies only once it
  exceeds 95 s. A fresh live tripwire at `0150` read exactly the expected diff against the rig's
  0147 capture — the applied files' rows and nothing else.

## Window 2 (run `win0148-20260830T003250Z`) — applied

- Stop 00:32:54Z → `stopped`; quiesce reaped 12 idle sessions, **`NON_IDLE_AFTER|0`**; heartbeat
  age polled 13 → 25 → … → 98 s; apply at 00:34:33Z.
- `0151`: prestate clean on live; tail OK — whole-catalog census UNMOVED (same function count AND
  signature checksum, same relation count), **five bodies re-cut and each delta proven EXACTLY its
  splices by inverse re-substitution**, the three spend brakes gone from executable text, the KEPT
  arms surviving positively, `refused_concurrency` appearing exactly 4 times, `firm_limits` lost
  exactly 3 columns, the 461 historical `refused_budget` rows byte-identical by count AND checksum.
  `0152`: S0 prestate OK, applied. `0153`: applied. `migrate: 3 new · 148 total`.
- **Post-reads on live vs the rehearsal capture: diff = the REPORTED rows only** (`FROZEN` 20/23
  exist only on live; `SWEEP_ITEMS_REFUSED_BUDGET` 461 vs the rig's 0). Positive reads: every
  recut body at its rehearsal POST sha (`_aging_core` `6ac3d6d5…`, `_firm_question_core`
  `52f2197d…`, `_statement_core` `95237c0a…`, `list_open_items_by_counterparty` `1000d893…`,
  `merge_counterparties` `840180a8…`, `wake_propose_identifier_promotion` `a3a05e58…`,
  `admit_autodraft_task` `e492813c…`, `_reserve_processing_call` `a713fa37…`,
  `_settle_processing_call` `e8b50f0d…`, `reconcile_sweep_runs` `179b85cf…`,
  `open_sales_backfill` `9696946f…`); the nine witnesses unchanged; `counterparty_merges` forced
  RLS with its policy pair, 0 rows; `_aging_core` names `_canonical_counterparty(` IN CODE; the
  two partial uniques `unique=true|valid=true|partial=true`; `firm_limits` 6 columns; `COA_SEED`
  templates 1 / families 42 / accounts 142 / adoptions 0; `SST_RATE_ROWS 10`; `sst_threshold_schedule`
  13 columns / 2 rows; `tax_treatment_codes` 13, `signed=0` (裁-38: codes seed UNSIGNED);
  `tax_issue_unavailable` present (裁-33); allowlist 88; `REASON_VERSIONS_PLATFORM 9 → 33`,
  `EVENT_TYPES 112 → 113`, `TAXONOMY_ACTIVE 112 → 113`.
- Restart 00:34:55Z → `/ready` 200 after 10 s. Sleeper `1854e46c263168` destroyed. A windowless
  post-read from a fresh sleeper (`d895475f49d7e8`, destroyed) re-read the same rows (`05-post.log`).

## Recorded, not a live defect

- **The runtime's own guard is now part of the window recipe**: a file that carries a heartbeat
  staleness guard needs `stop → wait > 90 s → apply`. Window 1's pacing (13 s) was inherited from
  the 0147 kit, whose file carried no such guard. The kit now paces on a positive heartbeat-age read.
- `REFUSED_BUDGET_IN_CODE|1` after the apply is `reconcile_sweep_runs` BUCKETING the historical
  value (0151's tail: "NO clara function EMITS refused_budget"); it is reported, not asserted.
- Per 裁-19 PR-1's P1: **0 pre-existing merges without a carrier row on live** (measured by the
  prestate) — the un-merge door in PR-2 will reach every live merge.
- The manual `ci.yml` sweep was dispatched on `main` at `3ecbe657` after the ceremony (run
  `33283730630`) — the closed drills and the D-b frontier matrix re-prove the six files.

## Ceremony notes

- Kit: scratch `ceremony-0148-0153/` (01-rig · 02-backup · 03-pre-live · 04-window · 05-post ·
  tripwire / inflight / quiesce / post-reads / heartbeat-age .sql), the 0147 kit's five-step shape
  extended to a multi-file window: the rehearsal applies all pending files in ONE migrate call, the
  window pins every file's sha and REFUSES any un-rehearsed numbered file beyond the set (exit 88),
  and the body check is mechanical over the two captures (RECUT vs WITNESS-SAME).
- The night's host incident (C: at 0 bytes, WSL dead ~03:55–04:40 MYT) preceded the ceremony; the
  rehearsal rig, the backup and both windows ran after the host was recovered (see the lesson ledger).
