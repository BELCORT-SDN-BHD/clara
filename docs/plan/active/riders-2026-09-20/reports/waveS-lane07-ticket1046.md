# Riders sweep wave — lane 07, ticket #1046

**Retention sweep for `clara.invite_preview_attempts` (and `clara.confirmation_attempts` if unswept).**

| | |
|---|---|
| branch | `riders/wS-lane07` in `C:\Users\zhant\Desktop\clara-wt\659` |
| base | `7bc5a710f` (the integrated head of the wave before) |
| lane database | `127.0.0.1:55749` / `clara_l09`, 311 migration files, max `0348_rate_wall_attempts_retention` |
| commits (this ticket) | `ad8cefafb` `feat(db): #1046 mint the two rate-wall attempts retention verbs, prove them at their own seam (0348)`<br>`5b7abe3d7` `feat(runtime): #1046 ride the rate-wall attempts prune on the existing trace-prune belt`<br>`f420a9c55` `fix(runtime): #1046 use fresh random keys in the rate-wall prune cell, never a fixed literal` |
| tickets before mine on this branch | #1047 (README + `packages/db/tests` only, no migration), #1098 (migration `0347`, no body it recut overlaps this file's blast radius) |
| verdict | **done** |

Ticket contract read from `gh issue view 1046 --repo BELCORT-SDN-BHD/clara`: the Agent Brief is in
the **issue body**, the issue carries **zero comments** and no owner ruling. `enhancement` +
`ready-for-agent`. Verified still live on this branch before building: `grep -rn
"confirmation_attempts" packages/db/migrations packages/runtime` outside `0163` and `0309`
themselves returns test files and read sites only — no prune, retire or sweep verb exists for
either table — and `set role clara_fn_owner; delete from clara.invite_preview_attempts where
attempted_at < now()` (rolled back) still raises `invite_preview_attempts is append-only`, on the
lane database, before this ticket's migration.

A status-report request mid-task did not arrive; none to note.

---

## The seams I tested at

Written down before the first cell, per work-order rule 4:

1. **`clara.prune_invite_preview_attempts(timestamptz,int)`** and
   **`clara.prune_confirmation_attempts(timestamptz,int)`** — the two verbs `0348` mints. The
   primary seam: each is the only way to prune a table whose append-only trigger raises
   unconditionally for every role including its owner.
2. **`clara.preview_invite_by_token`** (0309) and **`clara.claim_confirmation_attempt`** (0163) —
   the two real wall doors, driven for real to prove a mid-window sweep changes neither wall's own
   count (AC2), never synthesized.
3. **`pruneTraces()`** (`packages/runtime/lib/reconciler.mjs`) — the existing runtime sweep cadence
   the brief names ("the runtime's maintenance sweeps"), extended rather than replaced.
4. **The migration's own prestate and tail** — the repo's documented standard for a structural
   cell (work-order rule 4's carve-out).

No seam outside this list was touched. No `apps/web` file, no frozen workflow, no applied
migration, no other ticket's new migration.

### Why a pair of verbs, and why each disables its own trigger inside itself

`0309`'s own header (lines 170-177) states the constraint: "a retention lane must disable and
re-enable that trigger inside its OWN migration … it cannot be written as a background job against
the shipped surface." A retention sweep is not a one-time backfill (unlike the `0176` /
`0215` / `0258` precedent this file's header cites and distinguishes itself from): it must run
again every time the reconciler's belt turns, against whatever has aged past the margin by then —
a population no migration can see at apply time. So `0348` mints two NAMED, IDEMPOTENT,
REDO-SAFE verbs (the `0347` "why a verb, not a bare statement" reasoning, turned to the opposite
purpose: repeatability rather than from-scratch observability) — each `SECURITY DEFINER`, owned by
`clara_fn_owner` (the table owner), so the disable/delete/enable sequence runs under the
DEFINER's privilege regardless of who calls it. Verified live, in a rolled-back transaction,
*before* the migration was written: a `security definer` function owned by `clara_fn_owner`,
called under `set role clara_runtime`, disabled the trigger, deleted rows and re-enabled it, with
no privilege error — `clara_runtime` holds no `ALTER TABLE` on either relation and needs none.

One verb per table (not a shared one parameterised by table name) because the two tables' columns
differ and a shared verb would need dynamic SQL or an `if/else` no simpler than two functions —
the `clara.prune_trace_spans` (0006) / `clara.prune_work_execution_traces` (0195) precedent, "one
prune verb per relation, both riding the same runtime belt."

---

## Acceptance criteria, each with its evidence

### AC1 — "A cell proves rows inside the window are never removed and rows past the margin are."

**DONE**, for both tables.

- `p1046.invite_preview.prune_removes_past_margin_keeps_window_row` and
  `p1046.confirmation.prune_removes_past_margin_keeps_window_row`
  (`packages/db/tests/rate-wall-attempts-retention.test.mjs`). Two rows planted through the root
  connection (there is no door that backdates `attempted_at`, so a direct insert is the only way
  to reach "2 hours old" without waiting in real time): one at `now() - interval '2 hours'`, one
  at `now() - interval '5 minutes'`. `clara.prune_invite_preview_attempts(now() - interval '60
  minutes', 10000)` / `clara.prune_confirmation_attempts(...)` driven under `set role
  clara_runtime`. Result: the 2-hour-old row is gone, the 5-minute-old row survives, the returned
  envelope's `attempts_deleted >= 1`. **Pass.**
- Also proved at the runtime seam:
  `"reconcile: rate-wall attempt prune rides the trace-prune lane, deletes past the margin, keeps
  the window"` (`packages/runtime/tests/reconcile.test.mjs`) drives `pruneTraces()` itself (not
  the SQL verb directly) over the same shape of planted rows and reads
  `prunedInvitePreviewAttempts` / `prunedConfirmationAttempts` back. **Pass.**
- The migration's own tail (T.6) additionally proves a real, apply-time call to each verb
  (threshold two hours in the past — safely outside both the window and the floor) returns a
  well-shaped envelope over whatever population the server actually held at apply time (13
  `invite_preview_attempts` rows, 15 `confirmation_attempts` rows, left over from the redo/vacuity
  exercise below — see "Anything unverified" for what that population means for evidence quality).

### AC2 — "A cell proves the wall's counts are unchanged by a sweep that runs mid-window."

**DONE**, for both tables, driven through the REAL doors rather than synthesised.

- `p1046.wall.invite_preview_count_unaffected_by_mid_window_sweep`: five real calls to
  `clara.preview_invite_by_token` with the same (fresh, random) token and origin digest — each
  admitted (`outcome !== 'rate_limited'`), reaching the wall's own ceiling of five. Row count for
  that key: 5, before the sweep. A sweep with a 60-minute margin (safely outside the 15-minute
  window) runs. Row count after: still 5 — the sweep touched none of them. A sixth call is **still
  `rate_limited`** — which is only true if none of the five rows backing the count was removed.
  **Pass.**
- `p1046.wall.confirmation_count_unaffected_by_mid_window_sweep`: the same shape over
  `clara.claim_confirmation_attempt` (five calls, all `allowed: true`; 5 rows; sweep; still 5 rows;
  sixth call `allowed: false`). **Pass.**
- The structural guarantee AC2 rests on — the floor — is driven directly, not merely read off the
  body text: `p1046.invite_preview.floor_refuses_in_window_threshold` and
  `p1046.confirmation.floor_refuses_in_window_threshold` call each verb with `p_before = now()`
  and assert `CLR10`. The migration's own tail T.5 drives the same refusal a second, independent
  way, at apply time. **Pass.**

### AC3 — "The migration (if one is needed) applies from scratch and on a populated database; the sweep runs on the existing cadence with no new scheduler."

**Migration needed: yes** (0309's header leaves no other path — see "Why a pair of verbs" above).
**DONE**, with one item honestly marked unverified (the true from-scratch chain — see below).

- **On a populated database**: the FIRST apply's own prestate recorded the population it was
  applying over (0 rows for both tables that first time — the lane database was fresh at that
  point); the tail's own apply-time smoke call (§B, threshold two hours in the past) exercises the
  disable/delete/enable sequence for real on every apply and every redo, not only in the test
  file. By the time the vacuity-control exercise (below) finished, the lane database genuinely
  held rows for both tables (13 and 15) and the redo's own prestate/tail ran over that real
  population, not zero rows. **Pass, on this lane database.**
- **The sweep runs on the existing cadence, no new scheduler**: `pruneTraces()`
  (`packages/runtime/lib/reconciler.mjs`) gained two more counters,
  `prunedInvitePreviewAttempts` / `prunedConfirmationAttempts`, calling the two new SQL verbs the
  same batched-loop way `prune_trace_spans` / `prune_work_execution_traces` are already called —
  the `prunedWorkTraces` precedent for a third and fourth relation riding the SAME function, which
  `runReconcilerSweep()` (`packages/runtime/lib/leader.mjs`) already calls under its existing
  `iteration % PRUNE_EVERY === 0` gate, leader-guarded. No `setInterval`, no cron entry, no new
  belt was added — `git diff` on `packages/runtime/lib/leader.mjs` for this ticket is empty; the
  belt call site (`const prune = deps.prune ? await belt("trace prune", () => pruneTraces(...` is
  unmoved. Driven, not only read from the diff: `"reconcile: rate-wall attempt prune rides the
  trace-prune lane, …"` calls `pruneTraces()` itself and reads both new counters. **Pass.**
- **From scratch**: NOT run (RIG.md forbids a second from-scratch chain on a lane cluster). See
  "Anything unverified."

### Out of scope (the ticket's own)

"Changing the window or the ceiling; the wall's limbs." Neither `clara.preview_invite_by_token`
nor `clara.claim_confirmation_attempt` is recut — both are pinned in the migration's prestate and
re-hashed in its tail (`sha256(prosrc)`, measured live on `clara_l09` after #1047/#1098, never
transcribed from either creating migration's own header).

---

## The migration

`packages/db/migrations/0348_rate_wall_attempts_retention.sql`, the number reserved for this
ticket. **File sha256 (final, current, live on `clara_l09`):
`5c4ada4f5ae8fb7ab47edfb9e194d72abae0b991c6008cda9d2762e1d7772b4b`** — see "Redo (#957)" below for
why this is not the FIRST-apply checksum.

Shape: header → `set local statement_timeout` → `create temporary table _p1046_pre … on commit
drop` → §0 prestate → `set role clara_fn_owner` → §A two new indexes + the two verbs + grants +
comments → `reset role` → §B one real apply-time smoke call per verb → §T the tail.

### Prestate pins — every signature with its sha, MEASURED LIVE on `clara_l09` after #1047/#1098

Neither #1047 nor #1098 recut any body this file touches (#1047: README + tests only; #1098: a new
function on a wholly different table family). These four are the neighbour bodies this file relies
on but never recuts:

| signature | `sha256(convert_to(prosrc,'UTF8'))` | this file |
|---|---|---|
| `clara._tf_append_only()` | `160e47b6659868d98163ee8cde1f851e6b8e6d344439a321a42c32fdd161fbf6` | called indirectly (via the trigger it disables/re-enables), never recut |
| `clara._tf_no_truncate()` | `e64ba9f6b93ba56d2752b095bae361dc4a3f0baf63e841e7c81f1b631c68eea8` | reads, never recuts |
| `clara.preview_invite_by_token(text,bytea)` | `5aafdea9a997fa20ebc13bbec7fead7c19a061176cf73514916c4afad71dbcd4` | read only (the 15-minute window this file's floor mirrors) |
| `clara.claim_confirmation_attempt(bytea,bytea)` | `6cd4d9bffd7816b14db4fb27dbf443421777332374c07a5ef9416cf55a8d18d5` | read only (same reason) |

All four are re-read in tail T.2 and must be unmoved. The integrator re-derives these four if
another lane's migration recuts one first.

Also pinned in the prestate, measured rather than transcribed: both tables' trigger roster by name
and `tgenabled` (`invite_preview_attempts`:
`t_invite_preview_attempts_append_only:O,t_invite_preview_attempts_no_truncate:O`;
`confirmation_attempts`:
`t_confirmation_attempt_settle_stamp:O,t_confirmation_attempts_append_only:O,t_confirmation_attempts_no_truncate:O`);
both tables' forced-RLS posture; both tables' column counts (4 and 6).

### Why the estate has no `pgcrypto` and what that changes

`select * from pg_extension where extname='pgcrypto'` returns zero rows on this lane database, so
every `sha256(prosrc)` pin uses core Postgres's built-in `sha256(bytea)` (14+) via
`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` — the exact idiom `0286`/`0347` already use,
never `digest(...)`.

### rig-meta cohort: `RATE_WALL_ATTEMPTS_RETENTION_0348_COHORT`

Two granted names, `clara_runtime` only (the "wholly present or wholly absent" bimodal cohort
shape, `packages/db/tests/rig-meta.mjs`): `prune_invite_preview_attempts`,
`prune_confirmation_attempts`. Added to `ALLOWED[ROLES.runtime]` and to the `cohortFailures(...)`
roster. `operation-census.test.mjs` (10/10, all CONTROLs firing) and `rig-isolation.test.mjs` T17
(the grant matrix) both ran clean with this addition in place, which is the strongest available
confirmation that the grant matrix and the call sites in `reconciler.mjs` agree with each other.

### Redo (#957): exercised, and it caught a real bug

- **FIRST-apply branch**: the real first `pnpm db:migrate` reported `clean (FIRST)` over a
  database where both tables held 0 rows, then `applied 0348_rate_wall_attempts_retention`.
- **REDO branch, exercised three times, one of them a genuine vacuity control**:
  1. `CLARA_MIGRATION_REDO=0348_rate_wall_attempts_retention` over the file as first written:
     succeeded, checksum `c1aeb623986e72b2d53050932d7337e3668e9bc1c91963bbe5ba2fe8a7514de6`.
  2. **The vacuity control.** I deliberately disabled the floor (`p_before > now() - interval '15
     minutes'` → `… and false`) in both verbs and redid the migration, expecting the tail's own
     T.5 ("the floor refuses a threshold inside the window, driven not asserted") to catch it.
     It did not: the redo reported `tail: OK (REDO)`. Reading T.5's own code found why — it raised
     its "admitted a threshold inside the window" failure **with `errcode='CLR10'` from inside the
     very `begin … exception when others …` block** whose `sqlstate <> 'CLR10'` guard was meant to
     catch a *wrong* refusal. A floor that raised nothing at all let execution reach that same
     raise, and the handler's own guard read `sqlstate = 'CLR10'` (true) and silently swallowed
     it — a broken verb was reported as passing.
  3. **Fixed** with a boolean flag (`v_floor_raised`) set only inside the exception handler and
     read only after the `begin…end` block closes — a raise inside the handler cannot
     short-circuit a read that happens after it. Redid over the fixed tail (floor still disabled):
     succeeded, checksum `5c4ada4f5ae8fb7ab47edfb9e194d72abae0b991c6008cda9d2762e1d7772b4b`.
  4. Re-applied the SAME break over the FIXED tail: **the redo genuinely failed this time** —
     `migrate: FAIL — migration 0348_rate_wall_attempts_retention failed and was rolled back:
     #1046 tail T.5: prune_invite_preview_attempts admitted a threshold inside the window` — proof
     the fix closes the hole rather than moving it. The failed transaction rolled back cleanly;
     the database was left exactly where step 3's successful redo left it (confirmed:
     `clara.schema_migrations`'s recorded checksum for `0348` still read
     `5c4ada4f...` immediately after the failed redo).
  5. The break was reverted byte for byte (confirmed: the restored file's `sha256sum` reads
     `5c4ada4f5ae8fb7ab47edfb9e194d72abae0b991c6008cda9d2762e1d7772b4b`, the SAME as step 3's
     checksum — the file the database already recorded, so no further redo was needed).
- A plain `pnpm db:migrate` afterwards reports `0 new migration(s) applied · 311 total`, no drift.
- The full gate battery (63 tests: the focused file, collation-pin-scan, ci-frontier-leg-contract,
  operation-census, rig-isolation) was re-run clean after the whole exercise: 62 pass, 1 expected
  skip (T19, forbidden by RIG.md).

This is recorded in `packages/db/README.md`'s `## 0348` section in the same words, because a
future reader who trusts a tail's "OK" should be able to see exactly how that trust was tested,
not only asserted.

---

## Gates, with counts

Every db run used the FULL gate chain (`GATES="$(node scripts/print-gate-chain.mjs)"`), from
`packages/db`, against `127.0.0.1:55749 / clara_l09`, `--test-concurrency=1`.

| gate | result |
|---|---|
| `tests/rate-wall-attempts-retention.test.mjs` — FOCUSED, no gate preload (final acceptance shape) | **8 tests, 8 pass, 0 fail, 0 skipped** |
| same file + `tests/collation-pin-scan.test.mjs` + `tests/ci-frontier-leg-contract.test.mjs`, full chain | **30 tests, 30 pass, 0 fail, 0 skipped** |
| `tests/operation-census.test.mjs`, full chain | **10 tests, 10 pass, 0 fail, 0 skipped** (all seven CONTROL findings fired and were caught, per the file's own design) |
| `tests/rig-isolation.test.mjs`, full chain, **no reset flags** | **33 tests, 32 pass, 0 fail, 1 skipped** — the one skip is `T19 poison-role: reset + re-migrate`, which the rig forbids |
| all five above together (final combined run, post-vacuity-control) | **63 tests, 62 pass, 0 fail, 1 skipped** |
| the two neighbour suites whose tables this migration touches — `tests/invite-preview-public.test.mjs` + `tests/checkout-gate-c3.test.mjs`, full chain | **85 tests, 85 pass, 0 fail, 0 skipped** |
| `packages/runtime` → `node --test tests/reconcile.test.mjs` | **11 tests, 11 pass, 0 fail, 0 skipped** (run twice back to back after the fresh-random-key fix, to confirm no cross-run collision) |
| `packages/runtime` → `node scripts/check-frozen-workflows.mjs` | **OK — 322 frozen files, no manifest diff** |
| `packages/runtime` → `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `apps/web` → `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` (sweep rule d: in scope whenever a migration file changed) | **22 tests, 22 pass, 0 fail, 0 skipped** — no new `REVIEWED_DYNAMIC_SQL_BARRIERS` entry owed; `0348` has no dynamic SQL |
| `pnpm typecheck` (repo root) | **Done** — `apps/web` and `packages/runtime`, no errors. (Only `.mjs` files were touched in `packages/runtime`; `checkJs: false` and `tests/**` is outside the package's `include`, so this ticket's runtime changes are proven by `node --test`, not `tsc`, per that package's own documented stance.) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, the runner's own shape) | **pass**, exit 0 |
| `pnpm lint` (repo root) | **pass**, exit 0 |
| `npx eslint` on the four new/touched JS/mjs files individually | **exit 0** on all four |
| `pnpm db:migrate` after everything | `0 new migration(s) applied · 311 total`, no drift |

Not owed and not run, with the reason: the **whole** `apps/web` unit suite and any browser walk
(work-order rule 8's trigger is "if you touched `apps/web`" — no `apps/web` file was edited; the
one web test above ran because sweep rule d puts the pins corpus in scope, and it reads migrations
rather than app code).

Known Windows-only reds from `RIG.md`: none encountered in any of the above.

---

## Shared files

| file | my hunk |
|---|---|
| `packages/db/package.json` (the `$GATES` list) | one `--import ./tests/rate-wall-attempts-retention-preintegration-gate.mjs`, appended after `firm-setup-committed-tin-backfill-preintegration-gate.mjs` (0347) — the last entry, migration order. `node scripts/print-gate-chain.mjs` reads it and `ci-frontier-leg-contract.test.mjs` passes. |
| `packages/db/README.md` | ONE new section, `## 0348 — the two pre-session rate-wall evidence tables gain a retention sweep`, appended at the end. No existing section edited — in particular the `## 0309` section (0309's own header on the retention constraint) is untouched; the new section points at it. |
| `packages/db/tests/rig-meta.mjs` | one new cohort (`RATE_WALL_ATTEMPTS_RETENTION_0348_COHORT`, two names), one spread into `ALLOWED[ROLES.runtime]`, one `cohortFailures(...)` registration — all at the sorted (chronological) position, immediately after the `0286`/`0317` entries and before `export const ALLOWED`. |
| `apps/web/messages/en.json`, `apps/web/lib/navigation/tree.ts`, `apps/web/lib/firm/needs-you.ts`, `CONTEXT.md` | **not touched.** No web file changed, no new domain vocabulary — this is a maintenance act on two existing evidence tables, not a new entity. |
| `apps/web/test/manifest.txt` | **not touched** — no new `apps/web` test file. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **not touched** — its own test (`firm-scope-db-pins.test.ts`) ran clean (22/22) with no new barrier owed, since `0348` contains no dynamic SQL. |
| the six `packages/db/tests` census files #1047 works (`coa-template-pr-b`, `firm-document-limits-writer`, `firm-portfolio-pack`, `plan-overlap-template-arm-retired`, `preview-invite`, `subledger-hook-caller-roster`) | **not touched** by this ticket. |
| `packages/runtime/lib/leader.mjs` | **not touched** — confirmed by `git diff`; the existing belt call site is unmoved, which is the evidence for "no new scheduler". |

---

## Docs

- `packages/db/README.md` — the new `## 0348` section: the gap and how it was measured; why a
  background job could never do this; why a pair of verbs and why each disables its own trigger
  inside itself; the safe margin as a refusal rather than a convention; the existing cadence and
  why no scheduler was added; what the file does not change; the redo exercise **including the
  vacuity-control bug it caught and how it was fixed**, with every checksum measured rather than
  assumed; the acceptance criteria with their cells.
- `0348`'s own header carries the same reasoning at statement level.
- `comment on function clara.prune_invite_preview_attempts(...)` / `...prune_confirmation_
  attempts(...)` state, in the catalog itself, what each verb does, why it refuses an in-window
  threshold, and which caller reaches it.
- Code comments in `packages/runtime/lib/reconciler.mjs` explain the belt extension and the
  `undefined_function` guard the same way `prunedWorkTraces`'s own comment does.

---

## Successor contract

**None owed.** This ticket touches no frozen workflow body and no module in a frozen closure —
`check-frozen-workflows.mjs` is clean (322 frozen files, no manifest diff) and
`check-parts-parity.mjs` is OK. `grep -n "invite_preview\|confirmation_attempt"
packages/runtime/workflows` returns nothing — neither evidence table has any chat or Work surface
to extend, so nothing here is the kind of thing a frozen chat or Work tool would ever need.

---

## Follow-ups worth filing

1. **The rig's own leftovers.** This ticket's cells and the vacuity-control exercise left rows in
   both evidence tables on `clara_l09` (13 `invite_preview_attempts`, 15 `confirmation_attempts`
   at last count, all with fresh/random keys, none colliding with a real invite or a real
   confirmation flow). Nothing outside `packages/db`'s own batteries and this ticket's runtime
   cell reads them. Not worth a ticket on its own; noted for the integrator.
2. **A margin knob nobody has needed to turn yet.**
   `CLARA_RATE_WALL_ATTEMPT_RETENTION_MINUTES` (default 60) is the one env var this ticket adds; it
   has no operational precedent to point at (unlike `CLARA_TRACE_RETENTION_DAYS`, which the 90-day
   default already has hosted experience behind it). Worth a line in ops notes once hosted has run
   the belt for a while, in case 60 minutes turns out to be too short or too long in practice — not
   a defect, just an unmeasured default.

---

## Anything unverified

- **A true from-scratch chain** (0001 → 0348 on a disposable cluster) was **not** run: `RIG.md`
  forbids a second from-scratch chain on a lane cluster (`0154` pins the cluster-wide role count)
  and forbids creating new clusters from a lane worker. Reasoned, not measured: the migration mints
  no role and no table (only two functions and two indexes on already-existing relations), so the
  FIRST-apply branch this file's prestate takes on a from-scratch chain is the SAME branch it took
  on this lane database's own first apply (both tables at zero rows) — already exercised for real,
  not simulated. The integrator's from-scratch proof is still owed, per house practice.
- **Hosted.** I have not touched hosted and cannot say how large either evidence table is there. The
  owner's standing beta ruling (hosted data is test data until a real firm is admitted) is why the
  lane database's own population is acceptable evidence for a wave, and is not evidence about a
  real firm's traffic.
- **The lock briefly taken by `ALTER TABLE … DISABLE/ENABLE TRIGGER` inside each verb.** Postgres
  takes a `SHARE ROW EXCLUSIVE` lock for the duration of the call, which briefly blocks a
  concurrent `INSERT` into that table (a real invite-preview page load, or a real signup
  confirmation attempt) for as long as the batched delete takes. This is inherent to the
  constraint 0309's own header sets (no other mechanism can prune an unconditionally-append-only
  table), and is the same trade-off the `0176`/`0215`/`0258` one-time backfills already accepted at
  migration-apply time — here it recurs every time the belt turns, bounded by `RATE_WALL_PRUNE_
  BATCH` (default 1000) and by how few rows the sweep usually finds once it runs on a healthy
  cadence. Not measured under load; reasoned from the batch bound and the belt's own cadence
  (`PRUNE_EVERY` × `POLL_INTERVAL_MS`, roughly every 100 seconds at defaults).
