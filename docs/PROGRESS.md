# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git: `docs/plan/active/riders-2026-09-20/` (the riders programme, complete: plan, work order, rig, sweep and closing plans, the seven release runbooks with their as-run RESULTS, and every lane, merge, gate, CI-reds, release-prep, closure and follow-up report under `reports/`) and `docs/plan/active/factory-reset-2026-09-26/` (the hosted reset, as run, with its scripts).

## Current State

- `main` = **`111196753`** (PR #1154, the riders CLOSING WAVE: 8 tickets across 4 lanes, migrations
  `0362` to `0365`, and a VERSION CUT repointing `chatTurn v22→v23` and `claraWork v6→v7`) on top of
  the sweep wave (PR #1143, `322fdf291`), the cut phase (PR #1140), wave 4 (PR #1053), wave 3, wave 2,
  wave 1 and #1008. The docs PR recording this release's as-run and the step 11a manifest lock
  follows (`docs/riders-closing-as-run`).
- Hosted (2026-09-26 06:08Z to 06:11Z window): DB **341 / `0365_accrual_register_pagination`**
  (migrate: 4 new migration(s) applied · 341 total, every file on its FIRST branch); `clara-runtime`
  image **`refresh-11119675`**
  (`sha256:a3a07a992b60208a4fe5e5a1cc26cb9a93a36c9b5fd84e69173f61632a062394`, machine
  `48ee715b763048`, serving `git_sha=111196753…`, `bodies=62`, pins `chatTurn=chatTurn_v23` /
  `claraWork=claraWork_v7`, stranded bodies 0); web **`cb003d14-9239-4653-b289-7c8a0faa7f6a`** (tag
  `refresh-11119675`, 100% since 06:11:20Z). The fifteen new manifest entries are deploy-locked at
  RELEASE_SHA (step 11a); every one of the 362 entries is `deployed:true`. As-run:
  `riders-2026-09-20/RELEASE-WK-RUNBOOK.md` § RESULTS (machine stopped 06:08:47Z, `/ready` 200 at
  06:10:49Z). Verification: `reports/waveK-gates-A.md` (from scratch, census diff 0), `-B.md`
  (upgrade path, en_US twin, browser suite twice), `-C.md` (whole runtime suite, the two-build
  cutover drill ALL PASS, seven rollback readings), `waveK-ci-reds.md`.
- **The estate is blank.** Hosted was factory-reset on 2026-09-26 (owner decision; beta data is test
  data): every login account, firm, client, document, journal entry, run, job and stored file
  removed; the product itself untouched. One firm exists, `Testing Firm` (`2126face-…`), the operator
  firm, with the owner as its one member; ToS v1 and DPA v1 accepted at sign-up. As-run:
  `factory-reset-2026-09-26/RUNBOOK.md` (seven deviations recorded, all of them lessons for any
  future rebuild).
- **The runtime uses DIRECT database connections** (`db.<ref>.supabase.co`, IPv6, TLS pinned to the
  same CA), not the shared session pooler: the pooler failed for two hours after the reset's project
  restart and the owner ruled (2026-09-26) that direct connection, Supabase's documented method for
  persistent backends, is the standing configuration. The limit to watch is the Micro instance's
  `max_connections` of 60; revisit (dedicated pooler or a compute upgrade) before real load.
  Consequence for ceremonies: the probe's DSN is the direct one and works through `dsn-pipe`
  unchanged; `pg_dump` under WSL2 cannot reach IPv6 and takes the pooler route
  (`release-wK/pooler-wrap.sh`).
- Rollback: web one command back to **`fa2c6c0b-474c-40dc-9f6e-5064a2488a47`** (lawful, previously
  100%). The runtime's rollback preflight read **ALLOWED** against `refresh-322fdf29` at
  2026-09-26T06:12Z (bundle sha `75ad1ec8…` verified on both sides, 60 bodies), but that image
  carries neither `chatTurn_v23` nor `claraWork_v7`, so it is a lawful boot target **only while no
  run on either body is non-terminal**: the first chat turn on hosted ends it. Restore point before
  the window: full dump `2026-09-26T06-06-…` (9,320,527 bytes, the blank estate).
- Standing owner rulings: release go for a wave is given per wave; **beta, nothing dark**
  (2026-09-20); every non-mainline ticket ends CLOSED with hosted evidence or is re-parented into the
  #597 map; the owner delegated the programme's pending rulings to the agent (2026-09-23), recorded per
  ticket (#1050 L02-SPEC-06 and #1147 follow-up 2 are the latest: withdrawing a standing instruction
  does not pause the plans it authorised).

## In Progress

- **The riders programme is COMPLETE.** Seven hosted windows between 2026-09-21 and 2026-09-26
  (waves 1 to 4, the cut phase, the sweep wave, the closing wave) plus the factory reset. Every ticket
  outside the mainline is closed with hosted evidence except the two filed at the last closure.
- **Open issues: 31.** The #597 mainline (26: #597, #612, #645, #661 to #683), the three re-parented
  to it (#1049, #1063, #1076), **#1155** (the six successor contracts owed to the cut after the
  closing wave, re-parented to #597's next version cut) and **#1156** (`collation-pin-scan.mjs` is
  blind to a bare `order by 1` over a text expression; a small fix).
- **Follow-up candidates, collected, not filed:** `reports/waveS-followup-candidates.md` (52 items in
  seven groups; the owner ruled on 2026-09-26 that a factory reset is done, which retires B01, B02,
  B07, G48 and G50; the six that became tickets are now shipped and closed).

## Known Issues

- Windows-host reds that are not code: no `pg_dump` on PATH, the Defender/EICAR skip, host-contention
  flakes (`responsive-shell-walk.spec.ts:708`, #736, and `work-question-walk` B4 before #1141);
  `pnpm --filter @clara/db test` no longer runs on Windows (the gate-chain command line exceeds the
  `cmd.exe` limit): run `node --test` from Git Bash. CI (Linux) has none of these.
- `role-census-reset.test.mjs:182` interpolates `PGDATABASE` unquoted into a `GRANT`, so a mixed-case
  database name fails the cell; name rig databases in lower case (hosted's `postgres` is).
- After ANY rebuild of the schema from empty, the chain leaves every lane `_login` role NOLOGIN and
  the operator-entered configuration rows empty (`clara.stripe_object_map` first among them): the
  login ceremony and the configuration restore are part of a rebuild (factory-reset RUNBOOK,
  deviations 5 and 7).
- `ceremony-wS/reads-wS.mjs` section (f) references `clara.knowledge_keys.retired_at`, a column that
  does not exist (`42703`); `ceremony-wK/reads-wK.mjs` is the current script.
- The CI `db-estate` job runs the WHOLE `packages/db` suite on `en_US.utf8`; run the whole suite on the
  integrated head before a PR, and order every catalog readback under collate "C" (#1047, #1156).
- Hosted, correct rather than broken: zero published cash account sets on a blank estate; the legal
  mode is `prompt` (migration-seeded), with no web control to flip it yet.
- Blueprint drift recorded for the #683 sync, not edited: the wave lists, the pins line (now
  `chatTurn_v23` / `claraWork_v7` / `statementFacts_v4`, `bodies=62`), 0195's activation assumption
  (replaced for beta by #1008), and the pack shapes.

## Next Steps

1. **The #597 mainline resumes from a clean, blank estate, next session:** the mainline's remaining
   children (#645, #661 to #683) with #1049, #1063, #1076 and #1155 riding where their maps say (#1155
   at the next version cut), ending with **#682** (verify the real accounting journey on the released
   combination) then **#683** (final acceptance + blueprint sync, then close #612 and #597).
2. **#1156**, the scanner fix: one small ticket, either before the mainline's first PR or inside it.
3. **The owner's signed-in walk** of the closing wave's surfaces per `RELEASE-WK-RUNBOOK.md` step 8's
   per-lane table (a blank estate: one firm, no client yet), and the first chat turn on hosted, which
   also ends the previous image's rollback window.
4. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 and flip the legal mode to
   `enforce` before launch.
5. Before real load: decide the runtime's connection path (stay direct with a compute upgrade, or the
   dedicated pooler); the shared pooler is not used.
6. Housekeeping when the mainline no longer needs rigs: the WSL clusters `rl01` to `rl10`, `rigw4`,
   `rigw4h`, `rigw4c`, `rigint`, `rigrt`, `rigreh`, `rigl06ac3` (rows in `RIG.md`); the lane
   databases `clara_c01` to `clara_c04` and the `clara_intS*` / `clara_intK` replays on 55742. Only
   `clara-wt/int2` remains as a worktree.
