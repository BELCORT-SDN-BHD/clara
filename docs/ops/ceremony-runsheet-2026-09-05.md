# The 2026-09-05 production ceremony — runsheet of record

The step-by-step runsheet for the 2026-09-05 production ceremony (DB `0165`–`0176` → runtime v75
→ web Worker), filed here byte-verbatim from the session scratchpad
(`ceremony-runsheet-2026-09-05.md`). The order this runsheet serves is
[`ceremony-order-2026-09-05.md`](ceremony-order-2026-09-05.md); the as-run is
[`runtime-deploy-2026-09-05-v75-and-db-0165-0176.md`](runtime-deploy-2026-09-05-v75-and-db-0165-0176.md)
plus its part 2.

<!-- begin verbatim: ceremony-runsheet-2026-09-05.md · md5 3fc0d9fb384468456338ef9f640a35a2 -->
# Deploy ceremony runsheet — DB 0165–0176 → runtime v75 → web Worker (draft, 2026-09-05)

Read-only research product. All commands are UNRUN. Env names only, never values. Every DSN
travels through the CA-pinned bridge (`docs/ops/dsn-bridge.md`) — never `sslmode=no-verify`,
never a DSN in argv. The lead runs every live step as the owner's delegate (裁-189,
`PROGRESS.md:11`); test-data authority EXPIRED at beta (`PROGRESS.md:31`, `AGENTS.md` constraint
14) — nothing here is reversible test-data work.

**Fixed order (裁-189, `PROGRESS.md:11`): (1) DB 0165–0176 → (2) runtime v75 → (3) web Worker.**
Do not deploy the runtime ahead of the DB step — `packages/runtime/src/chatRoutes.ts:168-171`
states in code that the session-list `archived_at` read 500s on every call until migration
`0174` is applied.

## 0 · Preflight

**0.1 — Merge state, all four migrations on `main`.** `0176_counterparty_alias_kind_scope.sql`
is on PR **#556** (`runtime/autodraft-v10-clr23`), **OPEN**, CI still running `db-estate`/
`db-live-gates` as of this read, zero reviews yet. **Positive read:** `gh pr view 556 --json
state,mergedAt,statusCheckRollup` → `state: MERGED`, every required job `SUCCESS`. **Do not
start §1 until this is true** — 0176 takes an ACCESS EXCLUSIVE lock rebuilding
`uq_counterparty_aliases_live_name` (0176 header, PART B) and the window should carry every ready
file at once (`docs/ops/ceremony-practices.md:19,43` — "combine everything that is ready and
reviewed AT ceremony time … never open a window for a car that has not cleared its own gate
record yet").

**0.2 — CI sweep green at the intended frontier** (`docs/ops/ceremony-practices.md:19-31`, "a
ceremony never opens on a red sweep"): `gh workflow run ci.yml` on `main` at the tip carrying
#556 once merged, then `gh run view --json jobs` → every job `SUCCESS` (13/13 last proven shape).
Rollback: none — a red sweep blocks opening, not a step to undo.

**0.3 — DB frontier + evaluator freeze, read before touching anything.**
```sh
<DSN via sleeper> | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1 -c \
  "select count(*), max(version) from clara.schema_migrations;"
<DSN via sleeper> | node scripts/ops/dsn-pipe.mjs -- psql -v ON_ERROR_STOP=1 -c \
  "select clara.verify_evaluator_freeze();"
```
Expected: `count=170, max=0175` (main frontier at this read — recount, per `packages/db/
README.md:30-34`'s own "this ledger is a snapshot" disclaimer) and `verify_evaluator_freeze()`
unchanged from the last live read, `{"ok": true, "verified_deployed": 7, "verified_registered":
8}` (`PROGRESS.md`). A drifted evaluator count is stop-and-escalate, not proceed-anyway. DSN via
the sleeper-machine recipe (`docs/ops/ceremony-practices.md:59-98`).

**0.4 — Backup, fresh.** One-off `clara-backup` run (never `fly deploy` on that app —
`docs/ops/wave-b-0019-ceremony-runbook.md:34-35`). **The machine id that runbook names
(`d895470c6024e8`) predates the 2026-09-03 factory reset — re-read it, don't reuse it:**
`fly machine list -a clara-backup` → current id → `fly machine start <id> -a clara-backup`.
**Positive read:** the run's own `clara-backup: DONE — bundle <n> bytes -> r2:clara-dr/
db-snapshots/…` log line, object count vs. yesterday's, healthchecks.io ping GREEN
(`docs/ops/DR.md:404-416`). Rollback: none; if it fails, do not proceed to §1.

**0.5 — Rollback preflight on the RUNTIME side, read now so §5 has a clean baseline.**
```sql
select name, count(*) from workflow.workflow_runs
 where status not in ('completed','failed','cancelled') group by name;
```
(`packages/runtime/README.md:439-441`). **Expected: ZERO rows**, matching the v71 ceremony's
same read (`docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md` §2 item 4). A non-zero
row here means rolling forward OR back could strand a run — read it, do not act on it alone;
escalate to the owner if non-zero.

**0.6 — Fly + Worker baseline.** `fly status -a clara-runtime` → machine `48ee715b763048`,
**VERSION 74** expected (`PROGRESS.md:16-19` — v71's image `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ`,
served through v72–v74's secret-import releases; next real build is v75). `fly releases -a
clara-runtime --json` → confirm the current release's image digest matches (a mismatch means
someone deployed since this read — re-baseline before §5). `wrangler versions list --name
clara-web` → confirm the promoted version is still **I = `c5b1e051-6c68-4f56-8ba2-28b3265979e1`**
(`PROGRESS.md:14`).

**0.7 — Client version.** Confirm a **v17** `pg_dump`/`psql` on `PATH` or `PG_DUMP`/`PSQL` set (a
v16 client aborts against this PG 17.6 server, `packages/db/README.md`). Gates §0.4 only — the
migration runner is Node/`pg`.

## 1 · D1 write-quiesce

**Scope of the window.** Six of the twelve files replace a live audited body and name D1
explicitly: `0169`/`0172`/`0173` (`set_document_kind`, `_gate_outstanding_items`,
`apply_coa_template` — PR #551) and `0174`/`0175` (`_tf_chat_session_update`,
`_tf_counterparty_update_0011`, `_persist_statement_core_v2` — PR #552, §2.2 below has the
per-file detail). `0165`–`0168`/`0170`/`0171` are readers/attribute-only ALTERs, each saying so
in its own header. `0176` owes no D1 but wants a lock window on `counterparty_aliases`/
`counterparties` (its own header: "a lock window, not a D1 quiesce",
`lock_timeout='15s'`/`statement_timeout='10min'` for the index rebuild). **Fold all twelve into
ONE window** per `docs/ops/ceremony-practices.md:19,43` — no reason to split a same-reviewed
cohort, and the per-window overhead is fixed regardless of file count.

**1.1 — Stop the runtime.** `fly machine stop 48ee715b763048 -a clara-runtime` (the repeated
live recipe — `docs/plan/completed/mohe-0148-0153-apply-asrun.md` and four other as-runs cite
the identical command against this same machine id). **Positive read:** `fly status` → `stopped`.

**1.2 — Reap idle sessions, prove zero non-idle, across every clara login (not runtime-only —
this window touches statement-facts and coding-lane writers too).**
```sql
select usename, pid, state, state_change
  from pg_stat_activity
 where usename like 'clara\_%' and state <> 'idle';
```
Expected: **zero rows**. If any remain `active`/`idle in transaction`, wait — do not terminate a
session mid-statement (`docs/ops/runtime-hard-restart.md:57-73`'s fencing logic, adapted here
to a proactive quiesce rather than a post-crash cleanup).

**1.3 — `0175`'s own extra lane.** Its header says "QUIESCE THE `statement_facts` LANE (stop
admitting new statement tasks, let in-flight ones drain), apply, resume" — already covered by
stopping the whole runtime machine in 1.1 (no separate process), but confirm zero in-flight rows
for that lane in `clara.document_processing_tasks` before proceeding. **Flagged, not resolved:**
the exact `task_kind`/status predicate for the statement lane was not independently verified
against `0098`'s schema this pass — check it before relying on any one query shape.

**1.4 — Heartbeat staleness, if a target file carries a freshness guard.** None of `0165`–`0176`
name one (unlike `0151`, which refused a same-night window at 13s post-stop —
`docs/plan/completed/mohe-0148-0153-apply-asrun.md` Window 1) — grep each file for
`runtime_heartbeats` to confirm, and poll heartbeat age past 95s before applying if one appears.

**Rollback for §1:** `fly machine start 48ee715b763048 -a clara-runtime` restores service with
zero DB change if any 0.x/1.x precondition fails. No migration has been applied yet.

## 2 · Apply 0165–0176

**2.1 — One `pnpm db:migrate` call through the bridge**, repo root, live env:
```sh
<DSN via sleeper> | node scripts/ops/dsn-pipe.mjs -- pnpm db:migrate
```
Never `psql "$DATABASE_URL" -f file.sql` (puts the DSN in argv — `docs/ops/dsn-bridge.md:16,45`);
the bridge derives `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` so a bare `psql` call
needs no connection argument of its own. **Expect:** `applied 0165..0176 · 12 new migration(s) ·
170+12=182 total` (recompute the exact prior count from §0.3's live read, not this line).

**2.2 — Per-file tail notices to watch** (each migration's own `raise notice ... tail: OK …`
line, printed as the runner commits each file's own transaction — a failure at file N leaves
1..N-1 applied and N rolled back):
- `0165`–`0168` (dba1-4, PR #551): `_is_codeable_kind` seeded with 20 rows matching
  `documents_document_kind_check`'s live roster; both close gates re-cut sha-pinned to
  `0104`/`0138`; `_close_gate_bank_items` keeps `0121`'s arm 4 verbatim plus the new `unknown`
  no-statements arm; both coding-lane readers spliced (never rebuilt), `0017`'s join and `0146`'s
  ninth row-kind columns survive. None owe D1 (readers/no rebuild).
- `0169` (dba5): `set_document_kind` re-cut, five guards re-read from the installed body,
  **"D1 WRITE-QUIESCE IS OWED"** echoed in its own tail notice.
- `0170`–`0171` (dba6-7): `coa_chart_state` unchanged on every existing key plus
  `seed_decision_plan_state`; both opening-approval RPCs gain
  `default_transaction_isolation=serializable` as a proconfig attribute only. No D1 owed.
- `0172`–`0173` (dba8-9): `_gate_outstanding_items` and `apply_coa_template` both extend-only,
  each proven by subtraction back to its pinned pre-image byte for byte. **Both D1 owed.**
- `0174`: six doors + `build_frontier()` + `dr_canary_subjects`; `archived_at` column live;
  `_tf_chat_session_update`/`_tf_counterparty_update_0011` re-cut (D1 named, precautionary).
- `0175`: `_persist_statement_core_v2` gains `_stmt_institution_code`; legacy
  `_persist_statement_core` untouched (sha256-proved). **D1 owed, `statement_facts` lane.**
- `0176`: `counterparty_aliases.kind` column + FK + kind-scoped unique index; the owner-floored
  `set_firm_sales_lane_activation` wrapper granted, the original stays ungranted. No D1 (lock
  window only).

**Positive read for the whole apply:** re-run §0.3's `count/max_version` query, expect
`max_version=0176` and the delta count matching exactly the 12 files. **On any failure:** the
runner's own transaction-per-file model means STOP, diagnose against the failing file's own
prestate assertion text (never hand-patch live — `docs/ops/wave-b-0019-ceremony-runbook.md:104`),
re-run §1.1's stop is still in effect, do not restart the runtime with a half-applied chain if
any file after the failure depends on ones before it (0169/0172/0173/0176 are order-sensitive by
their own APPLY ORDER comments).

**Rollback:** migrations are forward-only by convention (`packages/db/README.md` "Migrations are
immutable"); there is no scripted down-migration. A failed file rolls back on its own (one
transaction each). Recovering from a file that applied but is later found wrong means restoring
from §0.4's backup, an owner-gated act now that the test-data authority has expired
(`PROGRESS.md:31`) — not an agent-run drop/reapply.

## 3 · Post-apply reads (still inside the quiesce window)

- Frontier: `select count(*), max(version) from clara.schema_migrations;` → `max=0176`, and
  `select clara.build_frontier();` → `{"count": <n>, "max_version": "0176"}` — the exact shape
  `/api/build-info` reports once v75 serves it (`packages/db/migrations/
  0174_web_reads_and_small_doors.sql:878-886`).
- The six D1 bodies' `prosrc` shas, re-measured from `pg_proc` independently (never trust the
  apply log alone — review law 3, "spelling is not identity").
- RLS/role census: `select count(*) from pg_roles where rolname like 'clara%';` — unchanged from
  before this window (`0176` grants EXECUTE on one new wrapper function only, no new role).
- `clara.dr_canary_subjects` — forced-RLS, one policy, two triggers, **ZERO rows** by ruling
  (裁-160/172, `0174…sql:1140`). Non-zero is a stop condition — the canary/witness ids are
  hard-blocked (`AGENTS.md` constraint 11).
- `clara.verify_evaluator_freeze()` again — must read identically to §0.3.

## 4 · Un-quiesce

**4.1 — Restart.** `fly machine start 48ee715b763048 -a clara-runtime`. **Positive read:**
`GET /health` → 200; `GET /ready` → 200 within ~10s (the repeated post-window timing across
every cited as-run). Do **not** yet expect `checks.pools`/lane-probe fields to reflect anything
new — the SERVING image is still v71-lineage (v74) until §5; `/ready`'s shape at this point is
whatever v74 already emits.

**4.2 — Zombie-session check anyway.** Even though this is a planned stop (not a crash),
positively re-run `docs/ops/runtime-hard-restart.md`'s Step 1 LOOK query scoped to
`clara_runtime_login` before declaring the window closed — cheap and idempotent per that doc's
own framing (`docs/ops/runtime-hard-restart.md:21-23`).

**4.3 — Close the window.** Destroy any sleeper machine used for the DSN
(`fly machine destroy <sleeper-id> --app clara-backup --force`); confirm zero residue.

## 5 · Runtime v75

**Precondition, restated:** the DB half (§2–§4) must be complete and read back before this
step — `packages/runtime/src/chatRoutes.ts:168-171` names the hazard directly: this image reads
`archived_at`, which does not exist before `0174`.

**5.1 — The classifier recall gate (H-04), run BEFORE the image ships, with the prompt sha
recorded.** Per PR #558's own review finding and its header
(`packages/runtime/scripts/measure-classify-recall.mjs:1-31`):
```sh
node packages/runtime/scripts/measure-classify-recall.mjs replay \
  --manifest <path-to-local-labelled-manifest.json> \
  --baseline packages/runtime/tests/fixtures/classify/baseline-prompt-2026-09-04.txt
# or: ... live --manifest <path.json>   (needs OPENAI_API_KEY)
```
**The corpus is off-repo** (`docs/plan/completed/corpus-manifest-2026-09-04.md` — not read this
session; locate it first). **Positive read:** the printed model id + `system prompt sha256`
line, then the two recall figures (at the `>=0.8` gate and at any confidence) for
`bank_statement` — the class the launch e2e missed at 0.05/0.00 confidence. **No numeric floor
is named in any doc read this session** — PR #558's own commit message says the floor is the
owner's to set and this reports only what it measured; get the floor before treating this as
pass/fail rather than informational.

**5.2 — The live TLS positive leg, before anything else** (`docs/ops/runtime-tls-verify-full-
ceremony.md:25-36` Step 1 — this is a re-run, not a first run, since the CA and pooler have not
changed; do it anyway, it needs no credential):
```sh
openssl s_client -connect aws-0-ap-southeast-1.pooler.supabase.com:5432 -starttls postgres \
  -CAfile ops/tls/pooler-ca.crt -verify_hostname aws-0-ap-southeast-1.pooler.supabase.com \
  -verify_return_error </dev/null; echo "exit: $?"   # expect 0
```

**5.3 — Build + deploy the image.**
```sh
fly deploy --config packages/runtime/fly.toml --remote-only --yes \
  --build-arg CLARA_BUILD_SHA=$(git rev-parse HEAD)
```
(`docs/ops/runtime-tls-verify-full-ceremony.md:41-42` — the `CLARA_BUILD_SHA` ARG feeds
`/api/build-info`'s `git_sha`, added in the same PR #558 commit that added the route; omitting
it leaves `git_sha: null`, which is honest but pointless to ship deliberately.) Local build
proof first (`pnpm --filter @clara/runtime build`, exit 0) per the v71 precedent's own §2 item 2.

**Positive reads** (per the v71 as-run's own instrument list,
`docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md` §4, §7):
- `fly status -a clara-runtime` → new version (**v75**, or the next free number past §0.6's
  baseline), checks 2/2; `fly releases -a clara-runtime` → a new image digest, distinct from
  `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ`.
- `GET /health` → 200. `GET /ready` → `ready: true`; `checks.pools` now an array of `{lane, ok,
  latency_ms}` / `{lane, skipped, reason}` for the seven `lib/lane-probe.mjs` lanes
  (`packages/runtime/lib/health.mjs:357-378`) — expect `runtime`/`read`/`write`/`freeform`
  `ok:true`, `bank`/`stripe_webhook`/`auth_wall` `skipped:true` (still lazy/NOLOGIN, H-47). A
  `pending: true` reading is normal for up to `CLARA_LANE_PROBE_INTERVAL_MS` (default 30s)
  after boot — re-poll before reading it as a failure.
- `fly ssh console -a clara-runtime -C "node -e \"...X509Certificate...\""` on
  `/app/ops/tls/pooler-ca.crt` (`docs/ops/runtime-tls-verify-full-ceremony.md:47-56`) →
  `CN=Supabase Root 2021 CA`, `true`, the pinned fingerprint, `Apr 26 2031`.
- `fly logs -a clara-runtime` → **no** TLS WARNING line only IF §5.4 has already run; before
  §5.4 the warning is expected and correct (no lane pins a CA yet) — not a defect at this point.
- `GET /api/build-info` (session JWT — `packages/runtime/src/buildInfoRoutes.ts:26-30`) →
  `frontier.max_version: "0176"`, count matching §2, workflow names incl. `chatTurn_v17`,
  `git_sha` matching this commit.
- `GET /api/chat/sessions` with a valid JWT → 200, not 500 (the `archived_at` read).

**5.4 — H-43: flip the six lane DSNs to `verify-full`** (`docs/ops/runtime-tls-verify-full-
ceremony.md:63-101` Step 3). This is a SEPARATE act from the image deploy, image-first order is
mandatory (that doc's own title clause): the five ceremonied-this-round secrets are
`WORKFLOW_POSTGRES_URL`, `CLARA_RUNTIME_DATABASE_URL`, `CLARA_READ_DATABASE_URL`,
`CLARA_WRITE_DATABASE_URL`, `CLARA_FREEFORM_DATABASE_URL`; the bank/stripe-webhook/auth-wall
three are deferred to their own later ceremonies (still NOLOGIN). Each gains
`?sslmode=verify-full&sslrootcert=/app/ops/tls/pooler-ca.crt`, replacing the current
`uselibpqcompat=true&sslmode=require` posture named in `PROGRESS.md:20-21` (裁-179 option c —
"encrypted, certificate UNVERIFIED"). One `fly secrets set` call for all five. **Positive read:**
`fly logs` shows no TLS WARNING line; `/ready`'s `checks.pools` lanes all still `ok:true` (a
wrong `sslrootcert` path throws inside `readFileSync` at connect, which would flip them false,
not pass silently). **Rollback:** drop `sslrootcert`/revert `sslmode` on the five secrets —
inert, no redeploy needed; reverting the IMAGE while secrets still carry `sslrootcert` is the
doc's own named outage shape, so never do that half alone.

**Rollback for the image (§5.3, before §5.4):** confirm §0.5's zero-row read is still zero, then
`fly releases` + roll back. Once §5.4 has run, rolling the image back while the five DSNs still
carry `sslrootcert` is safe (the CA is inert in an image that never reads that key); the
forbidden combination is a NEWER image with `sslrootcert` pinned but the CA missing from its own
filesystem — not reachable here since §5.3 always ships it.

## 6 · Worker deploy + smoke

**Gap, named rather than resolved:** `apps/web/README.md` documents the `cf:build`/`cf:preview`/
`cf:deploy`/`cf-typegen` scripts (`apps/web/package.json:16-19`) and that the Worker build needs
Node ≥22 (WSL) — it does **not** document version/promote mechanics. The only precedent is the
FS-10 cutover as-run (`docs/plan/completed/fs10-cutover-asrun-2026-09-03-part3.md`), a
**first-deploy** (new Worker, six secrets from scratch) heavier than a routine redeploy needs.
The shape below is inferred from that precedent for an EXISTING Worker with unchanged secrets,
not read off a runbook written for this case.

**6.1 — Build + deploy** (WSL/Node ≥22, per `apps/web/README.md:145-165`):
```sh
pnpm --filter @clara/web cf:build      # opennextjs-cloudflare build, after check-public-key.mjs
pnpm --filter @clara/web cf:deploy     # opennextjs-cloudflare deploy — uploads + deploys a version
```
No secret rotation is expected this round (unlike FS-10's six-secret first-deploy dance,
`fs10-cutover-asrun-2026-09-03-part3.md:59-81`) — confirm `wrangler secret list --name
clara-web` already shows all six names first; if one needs to change, stage it with `wrangler
versions secret put` and re-deploy, never a bare `secret put` mid-window.

**6.2 — Positive read.** `wrangler versions list --name clara-web` → a NEW version id and its
serving percentage. `cf:deploy` is expected to deploy it at 100% directly for a routine
redeploy — if it lands staged instead, promote explicitly: `wrangler versions deploy
<new-id>@100% --yes` (`fs10-cutover-asrun-2026-09-03-part3.md:132`, the only documented shape
found). Then `GET /api/build-info` on the web arm → its bundle sha (frozen at `next build` from
`CLARA_BUILD_SHA`/`WORKERS_CI_COMMIT_SHA`/`CF_PAGES_COMMIT_SHA`) and the runtime origin it
forwards to.

**6.3 — Smoke on `app.clarabook.com`.** Log in as an owner-invited tester; confirm the chat rail
loads a session list (the `archived_at` shape — this is the end-to-end proof that DB→runtime→web
landed in the right order); open one client workspace tab; confirm no CSP report-only console
noise beyond the known Next/OpenNext baseline (`apps/web/README.md` §6 "Content-Security-
Policy is REPORT-ONLY").

**Rollback:** `wrangler versions deploy <previous-version-id>@100% --yes` — "a broken Worker is
fixed FORWARD by re-promoting a walked version" (裁-156, `PROGRESS.md`'s FS-10 note); there is no
repoint-to-Pages rollback, that project is deleted.

## 7 · Receipts

1. **A new as-run** under `docs/ops/`, on the pattern of
   `runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md` — every positive read above with its exact
   instrument line, a deviations register for anything that did not go as planned, and the §5.1
   recall numbers with model id + prompt sha alongside them (never summarized without them, per
   裁-112, honesty over completeness).
2. **`PROGRESS.md` truing**: frontier `0176`; Fly version v75 + new image digest; new Worker
   version (retiring `I`); H-43 from "code shipped, ceremony owed" to "ceremonied, verify-full
   live on five lanes, three deferred"; H-48 to "probing, seven lanes, `checks.pools` live".
   **`PROGRESS.md`'s own P0 block (`PROGRESS.md:131-132`) still reads as if #558 had not
   landed** — it merged 2026-09-04 19:32:12+08:00, ~18h after PROGRESS.md's last truing commit
   (`dbaf9056`, 09:56:13+08:00) — true this explicitly rather than leaving stale wording beside a
   contradicting receipt.
3. **`docs/ops/dsn-bridge.md`'s runbook list** (`docs/ops/dsn-bridge.md:187-190`) omits
   `runtime-tls-verify-full-ceremony.md` — add it once this ceremony runs.

## Open items this research could not resolve

- **0176 / PR #556 is unmerged** (OPEN, CI in progress, zero reviews at this read) — the whole
  DB step gates on it landing; re-read `gh pr view 556` before trusting §0.1. The `statement_facts`
  in-flight-task predicate (§1.3) was likewise not independently verified against `0098`'s schema.
- **No numeric recall floor is named anywhere read this session** for §5.1's `bank_statement`
  gate — PR #558's commit message leaves it to the owner.
- **`apps/web/README.md` has no routine-redeploy/version-promote runbook** — §6 is inferred from
  the FS-10 first-deploy as-run, not a written procedure for this case.
- **`packages/runtime/README.md` is stale against PR #558**: no mention anywhere in its ~457
  lines of `lib/lane-probe.mjs`, `lib/tls-ca.mjs`, `lib/build-info.mjs`, `/api/build-info`,
  `measure-classify-recall.mjs`, or the new `checks.pools` `/ready` shape, and the `clara-backup`
  one-off-run machine id in `docs/ops/wave-b-0019-ceremony-runbook.md` is stale post-reset (§0.4
  re-derives it live).
<!-- end verbatim: ceremony-runsheet-2026-09-05.md -->
