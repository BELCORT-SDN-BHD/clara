# Riders sweep wave — lane 07, ticket #1132

**`clara.sweep_run_items.outcome` has no `admitted` member — documented as a trap on
`clara.admit_autodraft_task`, not enum-widened.**

| | |
|---|---|
| branch | `riders/wS-lane07` in `C:\Users\zhant\Desktop\clara-wt\659` |
| base | `7bc5a710f` (the integrated head of the wave before) |
| lane database | `127.0.0.1:55749` / `clara_l09`, 312 migration files, max `0349_admit_autodraft_task_outcome_disclosure` |
| commit (this ticket) | `1780f0f9e` `docs(db): #1132 disclose the no-sweep-item admission trap on admit_autodraft_task (0349)` |
| tickets before mine on this branch | #1047 (README + `packages/db/tests` only, no migration), #1098 (migration `0347`), #1046 (migration `0348`) — none recut `clara.admit_autodraft_task` or `clara.sweep_run_items` |
| verdict | **done** |

Ticket contract read from `gh issue view 1132 --repo BELCORT-SDN-BHD/clara --comments`: the Agent
Brief is in the **issue body**, the issue carries **zero comments** and no owner ruling comment on
the issue itself. Labels `bug` + `ready-for-agent`. The brief itself offers two candidate fixes and
explicitly defers the choice ("if the owner prefers the enum-widening fix instead of documentation
…"). The binding choice for this lane comes from the orchestrator's own lane notes and
`SWEEP-PLAN.md`'s lane table/owner-questions section, both read before building: **"#1132 takes the
DOCUMENTATION path, a comment on function plus a README section, not the enum widening."** Verified
still live on this branch before building: `clara.admit_autodraft_task`'s successful arm still
writes no `clara.sweep_run_items` row and `sweep_run_items_outcome_check` still admits no
`'admitted'` member, both re-measured live on `clara_l09` in this ticket's own migration prestate
(see below) — the trap the brief describes had not been closed by #1047/#1098/#1046.

A status-report request mid-task did not arrive; none to note.

---

## The seams I tested at

Written down before the first cell, per work-order rule 4:

1. **The catalog comment on `clara.admit_autodraft_task(uuid,text,uuid,text,bigint)`**
   (`obj_description(...)`) — the primary seam AC1 names.
2. **`packages/db/README.md`'s own new section** — the second half of AC1, read as bytes off disk.
3. **`clara.admit_autodraft_task` itself, driven for real** — not to change its behaviour (this
   ticket never may), but to ground the claim the comment and the README state, and to fold in a
   live check that AC2's alternative (the enum widening) was genuinely not taken.
4. **The migration's own prestate and tail** — the repo's documented standard for a structural cell
   (work-order rule 4's carve-out).

No seam outside this list was touched. No `apps/web` file, no frozen workflow, no applied
migration, no other ticket's new migration, no recut of `clara.admit_autodraft_task`'s body or of
`clara.sweep_run_items`'s CHECK constraint.

### Why a catalog comment, not a body recut

`clara.admit_autodraft_task`'s body is unowned by this ticket — the brief's own AC1 asks only for a
"clear, documented way to avoid this trap." A `comment on function` is this estate's existing idiom
for exactly that: readable by any client of `pg_proc` (a human at `psql \df+`, an agent reading the
schema, or a test), and the precedent this file follows explicitly —
`clara.create_client`'s own `#1038` closure comment
(`packages/db/migrations/0316_create_client_human_grant_withdrawn.sql`), cross-checked live by
`client-birth-wall.test.mjs`'s own `obj_description(...)` read. Recutting the function body was
never necessary and would have been the wrong tool: the trap is not a bug in the body, it is an
absence of documentation about the body's own, otherwise-correct behaviour.

---

## Acceptance criteria, each with its evidence

### AC1 — "`clara.admit_autodraft_task`'s own documentation (header comment or README section)
states plainly that a successful admission writes no sweep-run-item row, and names the correct
place to read the real admission outcome."

**DONE.**

- `p1132.comment.discloses_no_sweep_item_and_names_op_receipts`
  (`packages/db/tests/admit-autodraft-task-outcome-disclosure.test.mjs`): reads
  `obj_description('clara.admit_autodraft_task(uuid,text,uuid,text,bigint)'::regprocedure,
  'pg_proc')`, asserts it is non-null, names `sweep_run_items`, `op_receipts` and `#1132`, and
  matches a "writes no … sweep_run_items" phrase pattern rather than merely existing. **Pass.**
- `p1132.readme.section_discloses_no_sweep_item_and_names_op_receipts` (same file): reads
  `packages/db/README.md` off disk, locates the `## 0349` section, and asserts the same four
  tokens and the same phrase pattern inside that section specifically (not merely anywhere in the
  5900+ line file). **Pass.**
- Both cells were driven **RED first, for the right reason**, before the migration existed: a
  focused run of the file (no gate preload) failed with `"the #1132 admission outcome disclosure
  is required for a focused run: apply 0349_admit_autodraft_task_outcome_disclosure.sql"` — the
  `assert.ok(comment, …)` / `assert.ok(idx >= 0, …)` paths were never reached because the file's own
  `gate()` helper refused first, confirming the migration was genuinely required, not a vacuous
  pass. After the migration applied, both went green with no other code change. **TDD vertical
  slice, evidenced.**

### AC2 (the offered alternative) — "If the owner prefers the enum-widening fix instead, `clara.sweep_run_items.outcome` gains an `admitted` member … with existing readers of the column reviewed."

**Not taken, by the lane's own ruling — confirmed, not merely asserted.**

- `p1132.trap.admitted_writes_no_sweep_item_noop_does_and_the_enum_still_lacks_admitted`'s own last
  assertion reads `pg_get_constraintdef` for `sweep_run_items_outcome_check` and asserts it does
  **not** match `'admitted'`. The migration's own prestate (§0(c)) and tail (T.3) independently pin
  the constraint's exact text byte-for-byte before and after, and refuse to proceed if it drifts.
  **Pass**, and because AC2 was not built, "existing readers … reviewed" does not apply — the whole
  point of the documentation path is that no reader's code changes.

### The grounding fact both AC1 cells' claim rests on — driven, not only read off the body text

`p1132.trap.admitted_writes_no_sweep_item_noop_does_and_the_enum_still_lacks_admitted` (same test
file) builds a world (`buildWorld()`), primes a real ready filing
(`primeReadyFiling`, vendor `P1132TRAP SDN BHD`), and:

1. Opens a sweep run, admits the filing on it. Outcome: `admitted`. Asserts **zero**
   `clara.sweep_run_items` rows for that filing on that run, and that `clara.op_receipts` DOES
   carry `{outcome: 'admitted', ...}` for `fn='admit_autodraft_task'`,
   `op_key='autodraft:<filing>:sweep'`.
2. Opens a **second** sweep run, re-admits the **same** filing on it (the registry short-circuit).
   Outcome: `noop_existing`. Asserts **exactly one** `clara.sweep_run_items` row now exists, with
   `outcome='noop_existing'`.

Step 2 is the vacuity control the work-order's rule 4 asks for ("show the new cell FAILING against
a deliberately broken subject once, then restore … byte for byte"), done by **contrast** rather
than by editing an applied migration, which this file may never do: if the zero-row assertion in
step 1 were checking an always-empty query (a bug in the test, not the subject), step 2's
one-row assertion on the exact same helper (`sweepItemRows`) over the exact same filing would also
read zero, and it does not. This cell needed **no code change to pass** — it is already true on
`main`, which is exactly why the ticket is a documentation ticket and not a bug fix: the code was
already correct, only undocumented. It ran green both before and after the migration (it is gated
on the ordinary Wave-A `0011` readiness, never on `0349`'s own stem), and both times found the same
answer.

### Out of scope (the ticket's own)

"Changing how a refused admission's sweep item is written today (already correct and eager)." Not
touched — every refusal/noop arm's own `insert into clara.sweep_run_items(...)` call
(`packages/db/migrations/0036_wave_c0_deferred_belts.sql:1182, 1190, 1232, 1240, 1251, 1337, 1367,
1400, 1411, 1476`) is unmoved; only the successful arm's absence of such a call is documented.

---

## The migration

`packages/db/migrations/0349_admit_autodraft_task_outcome_disclosure.sql`, the number reserved for
this ticket. A single `comment on function` statement — no `create or replace function`, no DDL on
`clara.sweep_run_items`.

Shape: header (the trap, measured with exact line citations; why documentation and why a catalog
comment; what the file does not change) → `set local statement_timeout` / `lock_timeout` →
`create temporary table _p1132_pre … on commit drop` → §0 prestate → §A the one `comment on
function` statement → §T the tail.

### Prestate pins — measured LIVE on `clara_l09` at 311 files / `0348_rate_wall_attempts_retention`, this lane's own frontier before this ticket

| signature / object | measured value | this file |
|---|---|---|
| `clara.admit_autodraft_task(uuid,text,uuid,text,bigint)` — `sha256(convert_to(prosrc,'UTF8'))` | `e492813ca194a1c35098c79e1b18c5c3d51063829140b667e95113b011c18b3c` | read only, never recut; re-measured identical in the tail |
| `clara.admit_autodraft_task`'s catalog comment (`obj_description`) | `null` (no foreign comment) | set to this file's own `#1132:` comment |
| `sweep_run_items_outcome_check` (`pg_get_constraintdef`) | `CHECK ((outcome = ANY (ARRAY['drafted'::text, 'skipped_lane'::text, 'refused_budget'::text, 'refused_concurrency'::text, 'refused_attempts'::text, 'noop_existing'::text, 'posted'::text])))` | read only, never recut; re-measured byte-identical in the tail, and re-confirmed to admit no `'admitted'` value |

No neighbour body beyond the one function above is touched or relied upon — this file mints no new
name (no function, no table, no index, no trigger), so it owes **no**
`packages/db/tests/rig-meta.mjs` cohort entry (the shared-files rule's own qualifier: "one cohort
entry per migration that mints a new name" — this one mints none). Confirmed no privilege, grant or
RLS change anywhere: the migration contains no `grant`, `revoke`, `alter table … row level
security`, or `create/alter role` statement at all.

### Redo (#957): exercised, and it landed clean

- **FIRST-apply branch**: the real first `node scripts/migrate.mjs` reported `#1132 prestate: clean
  (FIRST)`, then `applied 0349_admit_autodraft_task_outcome_disclosure`, `312 total`.
- **REDO branch**: `CLARA_MIGRATION_REDO=0349_admit_autodraft_task_outcome_disclosure node
  scripts/migrate.mjs` reported `#1132 prestate: clara.admit_autodraft_task already carries a
  #1132 comment — this is a REDO (#957)`, then `#1132 prestate: clean (REDO)`, then `#1132 tail:
  OK`, then `redone 0349_admit_autodraft_task_outcome_disclosure · new checksum
  4f58275a1339f630bf07f9d802e5304b65f127235126649556c436f2cafcf8db`. A plain `node
  scripts/migrate.mjs` immediately after reports `0 new migration(s) applied · 312 total` — no
  drift, one row in `clara.schema_migrations` for `0349` (the redo updates the existing row in
  place; it never inserts a second one). The full test file re-ran 3/3 green after the redo, with
  no change to any assertion.
- The REDO branch was exercised because the prestate's own mode logic (FIRST vs REDO vs a refused
  "foreign comment" state) is the one piece of this file with a real branch, and the wave-3
  addendum's own lesson ("a marker-tolerant or bimodal pin hides its sha branch from a redo") is
  about exactly this shape. I did not need a second redo to prove the "foreign comment" refusal
  branch (§0(b)'s `else raise exception … FOREIGN catalog comment`), since planting an unrelated
  comment on an applied migration's function is itself an edit this house rule forbids me from
  rehearsing destructively on this lane database; the branch is read-verified by inspection only
  and recorded here as such.

This is recorded in `packages/db/README.md`'s `## 0349` section in the same words, so a future
reader who trusts the migration's own "OK" can see exactly what was measured.

---

## Gates, with counts

Every db run used `PGHOST=127.0.0.1 PGPORT=55749 PGUSER=postgres PGDATABASE=clara_l09
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, from `packages/db`, `--test-concurrency=1`.

| gate | result |
|---|---|
| `tests/admit-autodraft-task-outcome-disclosure.test.mjs` — FOCUSED, no gate preload, **before** the migration | **RED, for the right reason**: 2 fail (`gate()`'s own refusal, migration required), 1 pass (the grounding cell, already true) |
| same file, FOCUSED, **after** the migration | **3 tests, 3 pass, 0 fail, 0 skipped** |
| same file + the FULL `$GATES` chain (every `--import …preintegration-gate.mjs` in `packages/db/package.json`) | **3 tests, 3 pass, 0 fail, 0 skipped** |
| `tests/operation-census.test.mjs`, full chain | **10 tests, 10 pass, 0 fail, 0 skipped** (all CONTROL findings fired, per the file's own design) |
| `tests/rig-isolation.test.mjs`, full chain, **no reset flags** | **23 tests, 22 pass, 0 fail, 1 skipped** — the one skip is `T19 poison-role: reset + re-migrate`, which `RIG.md` forbids running |
| `apps/web` → `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` (sweep rule d: in scope whenever a migration file changed, even a comment) | **22 tests, 22 pass, 0 fail, 0 skipped** — no new `REVIEWED_DYNAMIC_SQL_BARRIERS` entry owed; `0349` contains no dynamic SQL (one static `comment on function` statement) |
| `pnpm typecheck` (repo root) | **Done** — `apps/web` and `packages/runtime`, no errors (this ticket touched neither package's `.ts`) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` (repo root) | **pass, exit 0** — see "the `FREEZE_BASE_REF` finding" below for why the override was necessary |
| `pnpm db:migrate` after everything (plain, no redo) | `0 new migration(s) applied · 312 total`, no drift |

Not owed and not run, with the reason: the **whole** `apps/web` unit suite and any browser walk
(work-order rule 8's trigger is "if you touched `apps/web`" — no `apps/web` file was edited; the
one web test above ran because sweep rule d puts the pins corpus specifically in scope, and it
reads migration files rather than app code); `node scripts/check-frozen-workflows.mjs` and `node
packages/runtime/scripts/check-parts-parity.mjs` standalone (rule 8's trigger is "if you touched
`packages/runtime`" — I did not; both are exercised anyway as part of the full `pnpm lint` chain
above and passed).

### The `FREEZE_BASE_REF` finding

`pnpm lint`'s `check-frozen-workflows.mjs` step compares the working tree against `origin/main` by
default. On this host, `origin/main` has moved **59 commits past `7bc5a710f`** (this lane's own
base) — PR #1140 (the riders cut-phase integration) merged into `origin/main` after this lane
branch was cut, adding `chatTurn_v22` / `claraWork_v6` / `statementFacts_v4` and their frozen
manifest entries. Comparing my branch (still on the pre-cut frontier) against that newer
`origin/main` reported 25 false `REMOVED-VS-BASE` violations and 3 false `REGISTRY-DOWNGRADE`
violations — none caused by this ticket's own diff, all caused by the base mismatch. The
work-order addendum's own rule ("Everywhere a rule above says `origin/main..HEAD`, read
`<base>..HEAD`") applies here too: `check-frozen-workflows.mjs` already supports a
`FREEZE_BASE_REF` environment override (`scripts/check-frozen-workflows.mjs:153`), and
`FREEZE_BASE_REF=7bc5a710f pnpm lint` is clean. This is an environment fact about the lane's own
drift from `origin/main`, not a defect this ticket introduced or fixed — recorded here so the
integrator does not re-discover it, and flagged again under "anything unverified" below.

Known Windows-only reds from `RIG.md`: none encountered.

---

## Shared files

| file | my hunk |
|---|---|
| `packages/db/package.json` (the `$GATES` list) | one `--import ./tests/admit-autodraft-task-outcome-disclosure-preintegration-gate.mjs`, appended after `rate-wall-attempts-retention-preintegration-gate.mjs` (0348) — the last entry, migration order. |
| `packages/db/README.md` | ONE new section, `## 0349 — a successful admission writes no sweep-run-item row, disclosed rather than fixed (#1132, riders sweep wave, lane 07)`, appended at the end. No existing section edited. |
| `packages/db/tests/rig-meta.mjs` | **not touched** — this migration mints no new catalog name. |
| `apps/web/messages/en.json`, `apps/web/lib/navigation/tree.ts`, `apps/web/lib/firm/needs-you.ts`, `CONTEXT.md` | **not touched.** No web file changed, no new domain vocabulary — this is a documentation act on an existing function's existing behaviour, not a new entity. |
| `apps/web/test/manifest.txt` | **not touched** — no new `apps/web` test file. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **not touched** — its own test (`firm-scope-db-pins.test.ts`) ran clean (22/22); no new barrier owed since `0349` contains no dynamic SQL. |
| the six `packages/db/tests` census files #1047 works (`coa-template-pr-b`, `firm-document-limits-writer`, `firm-portfolio-pack`, `plan-overlap-template-arm-retired`, `preview-invite`, `subledger-hook-caller-roster`) | **not touched** by this ticket. |
| `packages/runtime/*` | **not touched** — this ticket is `packages/db` only. |

---

## Docs

- `packages/db/README.md` — the new `## 0349` section: the trap measured with exact line
  citations; the two candidate fixes and why documentation was chosen; where to actually read a
  successful admission's outcome; how the claim was grounded (driven, not only read); what the file
  does not change; the acceptance criteria with their cells; the gate.
- `0349`'s own header carries the same reasoning at statement level, plus the Windows/portability
  note on why `encode(sha256(...))` is used instead of `digest(...)`.
- `comment on function clara.admit_autodraft_task(...)` states, in the catalog itself, exactly what
  a future reader needs: that a successful admission writes no `sweep_run_items` row, and the exact
  `clara.op_receipts` read (`fn`, `op_key` shape, `result` columns) that carries the real outcome.

---

## Successor contract

**None owed.** This ticket touches no frozen workflow body and no module in a frozen closure —
`grep -rn "admit_autodraft_task\|sweep_run_items" packages/runtime/workflows` returns nothing, so
no chat or Work tool reaches either name. `pnpm lint` (with `FREEZE_BASE_REF=7bc5a710f`) ran
`check-frozen-workflows.mjs` clean as part of its chain.

---

## Follow-ups worth filing

1. **Not a defect, an observation.** `clara.admit_autodraft_task` carries ten separate
   `insert into clara.sweep_run_items(...)` call sites across its refusal/noop arms
   (`0036_wave_c0_deferred_belts.sql:1182, 1190, 1232, 1240, 1251, 1337, 1367, 1400, 1411, 1476`).
   A future refactor collapsing these into one shared internal helper would reduce the surface a
   reader has to audit for "does this arm write an item," but that is a body change this ticket's
   own scope (documentation only) correctly excludes, and the ten sites are already individually
   tested elsewhere in the estate (`wave-a-second-run.test.mjs`, `wave-a-budget.test.mjs`,
   `f-a9-pr-1b.test.mjs`). Not urgent; noted for whoever next touches this function's body.
2. **The `FREEZE_BASE_REF` drift** noted above under "Gates" will recur for every remaining ticket
   in this lane (and every other sweep-wave lane cut from `7bc5a710f`) until the lane branches
   merge past PR #1140. Worth a one-line addition to `RIG.md` or `WORK-ORDER.md` naming
   `FREEZE_BASE_REF=<lane base>` explicitly, so the next lane worker does not have to re-derive it
   from the script's own source the way this ticket did.

---

## Anything unverified

- **A true from-scratch chain** (0001 → 0349 on a disposable cluster) was **not** run: `RIG.md`
  forbids a second from-scratch chain on a lane cluster and forbids creating new clusters from a
  lane worker. Reasoned, not measured: this migration is a single idempotent `comment on function`
  statement with no dependency on any row population, so its FIRST-apply branch is
  population-independent by construction — the same branch this lane database's own first apply
  already took. The integrator's from-scratch proof is still owed, per house practice.
- **Hosted.** Not touched; no claim made about hosted's own catalog comments or README state.
- **The "foreign comment" refusal branch** (§0(b)'s `else raise exception`) is verified by code
  reading only, not by driving it — deliberately: the only way to enter it live would be to plant an
  unrelated comment on `clara.admit_autodraft_task` first, which is an edit to a function this
  lane's database treats as settled, and reversing it cleanly afterward is not guaranteed the same
  way a rolled-back transaction is. Recorded as a reasoned-not-measured gap rather than asserted as
  tested.
- **Whether any runtime or web code currently reads `clara.sweep_run_items` expecting to infer a
  successful admission from its absence** (the inverse of the trap: code that treats "no row yet"
  as meaningful rather than merely "not settled") was not swept for. AC1's own scope is the
  documentation, not an audit of every existing reader; AC2's "existing readers … reviewed" clause
  applies only to the enum-widening path, which was not taken.
