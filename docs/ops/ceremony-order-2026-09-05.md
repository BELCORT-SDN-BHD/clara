# The 2026-09-05 production ceremony — order of record

The order the lead issued for the 2026-09-05 production ceremony: DB migrations `0165`–`0176`
→ runtime v75 → the web Worker, filed here byte-verbatim from the session scratchpad
(historical label: order-CEREMONY-0905.md). The as-run is
[`runtime-deploy-2026-09-05-v75-and-db-0165-0176.md`](runtime-deploy-2026-09-05-v75-and-db-0165-0176.md)
plus [part 2](runtime-deploy-2026-09-05-part2-worker-and-deviations.md); the step-by-step
runsheet this order points to is
[`ceremony-runsheet-2026-09-05.md`](ceremony-runsheet-2026-09-05.md). The verbatim block below
cites the session scratchpad's own file names; they are historical labels, not repo paths.

<!-- begin verbatim: order-CEREMONY-0905.md · md5 1d6dab36d539df31d9ab5e2e449ccf58 -->
# ORDER — the 2026-09-05 production ceremony (DB 0165–0176 → runtime v75 → web Worker)

Lane: native **opus-5 xhigh** (裁-190), acting as the LEAD's hands; the lead is the owner's DELEGATE (裁-189).
Window: **opens on 裁-198** — only after (a) every code PR of the session is on `main`, (b) a hand-dispatched
`gh workflow run ci.yml` on that exact `main` tip is GREEN on all 13 jobs (read from `gh run view --json jobs`),
(c) the lead says "OPEN". Do not start §1 before the lead's OPEN.
Runsheet (read it whole before step 0): `scratchpad/ceremony-runsheet-2026-09-05.md` — every step's command shape,
positive read and rollback, cited to `docs/ops/*` and the migrations' own headers. Where this order and the
runsheet disagree, this order wins; where the runsheet and a live read disagree, STOP and report.

## Laws that bind every step
- **Secrets env-to-env, never printed, never in argv.** Every DSN rides the CA-pinned bridge (`docs/ops/dsn-bridge.md`,
  the sleeper recipe in `docs/ops/ceremony-practices.md:59-98`); `sslmode=no-verify` is forbidden; if a command would
  echo a DSN, do not run it.
- **A positive read before and after every irreversible step.** Report the read's VALUE to the lead (a query and its
  result), never "done". The lead acknowledges before the next irreversible step: the runtime stop, the migrate,
  the `fly deploy`, the Worker promote.
- **Stop-and-escalate, never proceed-anyway**, on: a drifted `verify_evaluator_freeze()`; non-zero non-terminal
  `workflow.workflow_runs`; a non-idle `clara_%` session that does not drain in 5 min; any migration tail notice
  that is not `OK`; a `/ready` that is not `true` after 90 s; a `/api/build-info` sha that is not the deployed sha;
  a recall run that fails 裁-199.
- **Test-data authority does not apply** — this is the live estate (constraint 14 expired at beta): nothing here is
  "resettable"; every step is reversible only by its named rollback.
- **The DB step is the only one that runs before the runtime image** (`chatRoutes.ts:168-171`: the session-list
  `archived_at` read 500s until 0174 is applied; the web on main also reads it).
- Interim ping at the start of every section and at 10 min into any wait. Silence reads as dead. **Never end a turn
  waiting to be "woken" by a background task** — read the teed output file on your own clock (a foreground poll with
  a deadline); a completion notification does not wake an idle lane.
- **Session-limit cut mitigation (four cuts on 09-04, one at ≈21:40):** the lead asks the owner to be at the keyboard
  for the write-quiesce window (§1–§4, ≈15–30 min) so a cut can be re-logged immediately; the window is opened only
  after §0 is fully reported; if a cut lands INSIDE the window the runner's per-file transactions leave the chain
  consistent at the last applied file and the runtime stays STOPPED — on resume the lead reads `schema_migrations`
  FIRST, then either finishes §2 or runs §4 as-is (the DB is forward-compatible with v71 at every prefix).

## 0 · Preflight (all reads; report a table of the values)
0.1 `main` tip sha; `gh pr list --state open` shows NO code PR of the session; the hand sweep run id + 13/13.
0.2 Live frontier: `count(*)`, `max(version)` from `clara.schema_migrations` (expect 170 / 0175 is WRONG for live —
    live is at **0164** per PROGRESS; report what you read); `clara.verify_evaluator_freeze()` unchanged.
0.3 Backup: `fly machine list -a clara-backup` → the CURRENT id (never the runbook's pre-reset id) → start it → the
    `DONE — bundle … r2:clara-dr/db-snapshots/…` line + healthchecks GREEN (`docs/ops/DR.md:404-416`).
0.4 `workflow.workflow_runs` non-terminal count (expect 0); `fly status -a clara-runtime` (machine, VERSION 74,
    image digest); `wrangler versions list --name clara-web` (promoted = I `c5b1e051…`).
0.5 pg client v17 on PATH (or `PG_DUMP`/`PSQL`); `pnpm --filter @clara/runtime build` succeeds locally on the tip
    (image build is §5); freeze compare-base `OK`.
0.6 Read `agent_tasks.last_refusal` on the two beta-walk admissions L8 named (the `failed · internal · tokens 0`
    shape) — a READ only; report the JSON for the lead's record (H-17's fix is proven as a defect, not as the cause).

## 1 · Write-quiesce window (on the lead's OPEN)
1.1 `fly machine stop <id> -a clara-runtime` → `fly status` = stopped. **Positive read**, then report.
1.2 `pg_stat_activity`: zero non-idle `clara\_%` sessions (wait ≤ 5 min; never terminate mid-statement).
1.3 `clara.document_processing_tasks`: zero in-flight rows for the statement lane (runsheet 1.3 flags the predicate as
    unverified — derive it from `0098`'s schema and SHOW the query before trusting it).
1.4 grep 0165–0176 for `runtime_heartbeats`; none expected (report the grep).
Rollback: `fly machine start` — zero DB change so far.

## 2 · Apply (ONE runner call, in order 0165 → 0176)
2.1 From repo root on the `main` tip, through the bridge: the runner (`pnpm db:migrate` shape per
    `packages/db/README.md`), deploy-onto-existing semantics (the 164 already-applied files are skipped; 12 apply).
2.2 Watch every tail notice: each file's `… tail: OK` line (the six D1 files, 0176's lock window with
    `lock_timeout='15s'`/`statement_timeout='10min'`). A rolled-back file = STOP (the runner rolls back that file; the
    chain is still consistent at the last applied file — report which).
Rollback: a failed file is rolled back by the runner; applied predecessors STAY (they are additive or reviewed CoRs
    with prestate pins) — report and stop; the lead decides between fix-forward and a restore from 0.3's bundle.

## 3 · Post-apply reads (report the table)
3.1 `count(*)` = 176-frontier count; `max(version)` = `0176_counterparty_alias_kind_scope`.
3.2 `clara.build_frontier()` (0174) returns `{count, max_version}`.
3.3 The six replaced bodies' `md5(pg_get_functiondef(...))` vs the values each migration's tail printed.
3.4 Role census unchanged (19 `clara%` roles); `verify_evaluator_freeze()` unchanged; RLS forced on every new table
    (0165's codeability table, 0176's index) — the query shapes from `docs/ops/DR.md`'s readiness section.

## 4 · Un-quiesce
4.1 `fly machine start <id>` → `/ready` true within 90 s (this is STILL v71: the lane probe does not exist yet —
    expect the OLD `/ready` shape). Report the `held_outbox` / wake-engine warning line for the record.
4.2 Web smoke on `app.clarabook.com` (read-only): sign in as the walk user, open a client, open the Journals tab and a
    document — expect no 500. Chat is expected to WORK (v71 does not read `archived_at`).

## 5 · Runtime v75 (gated)
5.1 **The recall gate (裁-199):** `node packages/runtime/scripts/measure-classify-recall.mjs` in `live`/`replay` mode
    against the REAL corpus, BOTH prompts (the live v71 prompt and the tip's), prompt shas recorded. PASS = for every
    kind, new recall ≥ old recall, AND zero cases with confidence ≥ 0.8 and a wrong kind under the new prompt. Report
    the per-kind table. A FAIL blocks the image: report; the lead decides (a revert lane for the calibration text).
    The script REFUSES contaminated fixtures — never pass `--allow-contaminated-fixtures` here.
5.2 `fly deploy` per `docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md`'s shape (the pooler CA is in the image
    since #558; the DSN secrets stay `sslmode=require` tonight — the verify-full flip is ITS OWN ceremony, H-43, not
    this one).
5.3 Positive reads: `fly releases --json` shows a NEW image digest at v75; `/ready` true with the NEW shape
    (`checks.pools` present, seven lanes, `pending` on the first poll then settled, no `stalled`); `/api/build-info`
    returns the deployed sha, image, and `frontier: {count, max_version: 0176…}` (NOT null — 0174 is applied);
    a chat session list (through the web) returns 200.
Rollback: `fly releases rollback` to v74's image (= v71's code) — the DB is forward-compatible with it.

## 6 · Web Worker
6.1 Build + `wrangler versions upload` + `wrangler versions deploy` (promote) per `apps/web/README.md` + the FS-10 as-run;
    six secrets + three vars UNCHANGED (read the count, never the values).
6.2 Positive reads: `wrangler versions list` shows the new version at 100 %; `app.clarabook.com` serves the new build
    (`/api/build-info` on the web arm); the 裁-86 smoke: sign-in → firm home → a client home → Journals → Documents →
    Bank → Close → a chat turn → the session list (archived_at) → sign out; axe clean on each.
Rollback: promote version I again (`c5b1e051…`) — fix-forward otherwise (裁-156).

## 7 · Receipts
7.1 As-run `docs/ops/runtime-deploy-2026-09-05-v75-and-db-0165-0176.md` (+ the Worker section): every read's VALUE,
    every timestamp from `date`, the recall table, the rollback points; docs-only PR, single-lane review.
7.2 PROGRESS rows: the deploy state, the new `/ready` shape, the frontier, the Worker version; the routine Worker
    redeploy runbook is BORN from 6.1 (write it into `apps/web/README.md` in the same PR).
7.3 Report to the lead under 300 words with the run ids, versions, and the one line that proves each arm.
<!-- end verbatim: order-CEREMONY-0905.md -->
