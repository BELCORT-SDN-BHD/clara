# Clara — Project Progress

Minimal session state. Everything durable lives on GitHub (issues, PRs, the #597 wayfinder map) and in git: `docs/plan/active/riders-2026-09-20/` (the riders programme, now complete: plan, work order, rig, sweep plan, the six release runbooks with their as-run RESULTS, and every lane, merge, gate, CI-reds, release-prep, closure and follow-up report under `reports/`).

## Current State

- `main` = **`322fdf291`** (PR #1143, the riders SWEEP WAVE: 44 tickets across 8 lanes, migrations
  `0330` to `0353` plus the overflow files `0360` and `0361`, no version cut, no frozen body moved)
  on top of the cut phase (PR #1140, `061a6992b`), wave 4 (PR #1053, `6da02a8de`), wave 3 (PR #1039),
  wave 2 (PR #1029), wave 1 (PR #1025) and #1008. The docs PR recording this release's as-run
  follows (`docs/riders-sweep-as-run`).
- Hosted (2026-09-25 14:59Z to 15:03Z window): DB **337 / `0361_reservation_release_advice`**
  (migrate: 25 new migration(s) applied · 337 total, every file on its FIRST or FRESH branch);
  `clara-runtime` image **`refresh-322fdf29`**
  (`sha256:20ab8c8352fd4372f1c8a6f50f2f163f742e92c65c7fa6dc1f227435a608344f`, machine
  `48ee715b763048`, serving `git_sha=322fdf29…`, `bodies=60`, pins unchanged at `chatTurn_v22` /
  `claraWork_v6` / `statementFacts_v4`, stranded bodies 0); web
  **`fa2c6c0b-474c-40dc-9f6e-5064a2488a47`** (tag `refresh-322fdf29`, 100% since 15:03:37Z). As-run:
  `riders-2026-09-20/RELEASE-WS-RUNBOOK.md` § RESULTS (machine stopped 14:59:25Z, `/ready` 200 at
  15:03:00Z; preflight and post reads CLEAN, 145 of 145 body pins). Restore point before the window:
  full dump `2026-09-25T14-58-04-276Z` (221,258,058 bytes). Verification: `reports/waveS-gates-A.md`
  (from scratch, census diff 0), `-B.md` (upgrade path, en_US twin, browser suite twice with no red),
  `-C.md` (whole runtime suite on a provisioned DevKit schema, two-build drill), `waveS-ci-reds.md`.
- Rollback: web one command back to **`3089d906-5bae-48cb-9666-72dff5aa8ef4`** (lawful, previously
  100%). The runtime's rollback preflight read **ALLOWED** against `refresh-061a6992` at
  2026-09-25T15:04Z (bundle sha `1ded5130…` verified on both sides) and, because this wave repoints no
  pin and adds no unlocked manifest entry, that reading does not expire with traffic. No below-frontier
  database rollback is drafted; the dump is the restore point.
- The 0348 first retention sweep deleted the five rate-wall attempt rows older than two hours during
  the window, by design and disclosed in its notice (`migrate.log`); nothing the 15-minute wall reads
  was lost.
- Standing owner rulings: release go for a wave is given per wave; **beta, nothing dark** (2026-09-20:
  a legal or similar compliance gate prompts and never disables; enforcement returns before launch
  after lawyer review); every non-mainline ticket ends CLOSED with hosted evidence or is re-parented
  into the #597 map; the owner delegated the pending rulings of the riders programme to the agent
  ("待我拍板的我都听你的推荐", 2026-09-23), recorded per ticket (#1050 L02-SPEC-06 on 2026-09-25 is
  the latest).

## In Progress

- **The riders programme is COMPLETE.** Six hosted windows (waves 1 to 4, the cut phase, the sweep
  wave) between 2026-09-21 and 2026-09-25; every non-mainline ticket is closed with hosted evidence.
  The sweep's closures: `reports/waveS-closures.md` (44 closed, none left open; six carry a named
  residual in their own comment). Two tickets filed at closure: **#1144** (the successor contracts of
  the sweep wave, the seven chat tools over the now-hosted 0352/0353 doors and lane L5's
  `claraWork.v6` step, re-parented to #597's next version cut) and **#1145** (the DevKit bootstrap
  command belongs in the repository README).
- **Open issues: 31.** The #597 mainline (26: #597, #612, #645, #661 to #683), the three re-parented
  to it (#1049, #1063, #1076), and #1144, #1145.
- **Follow-up candidates, collected, NOT filed:** `reports/waveS-followup-candidates.md`, 52 items in
  seven groups with a recommendation per group. Group B is eight owner rulings that decide whether
  several of the others exist at all; they are grilled first, one at a time, before anything from
  groups C to G is filed.

## Known Issues

- Windows-host reds that are not code: no `pg_dump` on PATH, the Defender/EICAR skip, host-contention
  flakes under many concurrent lanes; `pnpm --filter @clara/db test` no longer runs on Windows at all
  (the 152-gate command line exceeds the `cmd.exe` limit): run `node --test` from Git Bash. CI (Linux)
  does not have these.
- The CI `db-estate` job runs the WHOLE `packages/db` suite; a wave's gates ran only the lanes' own
  files, which is how PR #1143's first run went red on forty-one whole-suite censuses (fixed in
  `waveS-ci-reds.md`). Run the whole suite on the integrated head before opening a PR.
- `ceremony-wS/reads-wS.mjs` section (f) references `clara.knowledge_keys.retired_at`, a column that
  does not exist; the read errored `42703` after the release (the count, 15 keys, is in the same
  log). Fix before the script is reused (candidate in group E).
- Hosted, correct rather than broken: zero published cash account sets; one
  `document_processing_tasks` row reads `statement_facts · running` with no live run behind it.
- The flip of the legal mode has no web control yet; consents minted under `prompt` are not
  re-derived at the launch flip (a later ticket decides).
- `scripts/ops/dsn-pipe.mjs` pins the CA with its Windows spelling, so the backup runs under a WSL
  wrapper (#917).
- Blueprint drift recorded for the #683 sync, not edited: the wave lists, the pins line, 0195's
  activation assumption (replaced for beta by #1008), and the pack shapes.

## Next Steps

1. **The #597 mainline resumes from a clean state, next session:** the mainline's remaining children
   (#645, #661 to #683) with #1049, #1063, #1076 and #1144 riding where their maps say, ending with
   **#682** (verify the real accounting journey on the released combination) then **#683** (final
   acceptance + blueprint sync, then close #612 and #597).
2. **Grill the owner over group B of `waveS-followup-candidates.md`** (eight rulings), then file or
   drop groups C to G per their recommendations.
3. **The owner's signed-in walk** of the sweep wave's surfaces per `RELEASE-WS-RUNBOOK.md` step 8's
   per-lane table, and the still-owed walks of the three successor bodies (`RELEASE-WC-RUNBOOK.md`
   step 8). Three surfaces stay unexercisable on hosted data without an owner write (a payroll
   summary or agreement upload, a fresh invite, starting the firm-setup checklist).
4. Owner, whenever convenient: accept Terms of Service v1 for BELCORT on `/settings/firm`.
5. When the lawyer-reviewed Terms/DPA wording arrives: publish v2 and flip the legal mode to
   `enforce` before launch.
6. Housekeeping done 2026-09-25: the ten sweep worktrees removed (branches kept). Still standing:
   `clara-wt/int` (stale, `riders/w4-chart`), `clara-wt/int2` (docs), and the WSL clusters
   `rl01` to `rl10`, `rigw4`, `rigw4h`, `rigw4c`, `rigint`, `rigrt`, `rigreh` (rows in `RIG.md`);
   drop them when the mainline no longer needs rigs.
