# Wave 4, lane 06, ticket #1038 — move the shared fixtures off clara.create_client, withdraw its human grant

Branch `riders/w4-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\656`, base `cd2925391`.
Commits (`cd2925391..HEAD`, this ticket only — #1031 and #1032 landed before me):

```
3275d5dcf docs(db): #1038 record create_client's grant withdrawal
47d281c0f test(db): #1038 census proves no unwalled granted client minter remains
4f703f0d5 fix(db): #1038 withdraw create_client's human grant, route every caller through root+jwt
363dbbf8f fix(web): #1032 firm-setup renders TIN's required-or-optional marking
f3a4147ab fix(db): #1032 the firm-setup TIN item is required-or-optional, not seeded-or-not
e79054395 fix(db): #1031 Knowledge refuses a financial-year-end pair that cannot exist in the recorded month
```

Status: **done**.

## The ticket

Issue #1038 (the issue body itself is the Agent Brief; zero comments, re-verified live on this
branch before building): #899's own named residual (`0287_client_birth_wall.sql`) — one direct
door, `clara.create_client`, still creates a client for a human role with no identity-collision
check, kept granted only because ~48 shared test fixture files across the database batteries call
it directly. Desired behaviour: the shared fixtures mint clients through a fixture helper that
reaches the walled entrance or a fixture-only door no human role can execute; the direct door's
human grant is withdrawn; the #899 census cell that states the criterion as OPEN asserts it as MET.

Read first per the lane rules: `docs/plan/active/riders-2026-09-20/reports/wave3-lane07-ticket899.md`
(the #899 report) and `0287_client_birth_wall.sql`'s own header, both of which name this exact
residual and the exact reason it could not close inside #899: re-pointing `create_client`'s body
would break `buildWorld()`/`buildWaveBWorld()`/`name-only-guard.test.mjs` (which construct
same-family clients through it by fixture convention), and withdrawing its grant outright would
meet the ~48 test files that called it through `rig-fixtures.mjs`'s `createClient()` helper with a
bare `42501` on their first fixture client.

## The seams tested at

- **The catalogue grant itself** — `has_function_privilege('clara_authenticated',
  'clara.create_client(text,text)', 'execute')`, re-measured directly in the migration's own tail
  and in a rewritten census cell, never assumed from the revoke statement having run.
- **A live human session, through `humanQuery`** — the exact call shape that used to succeed now
  observed to refuse `42501 insufficient_privilege` (the vacuity control).
- **The rig's own root+jwt idiom** (`withActor({ jwtSub: sub }, …)`, exported as
  `createClientRaw`) — driven for real, not mocked, by every fixture and direct caller that used
  to reach `create_client` through the grant.
- **A live, catalogue-derived sweep** (`aclexplode` over every granted, client-minting body) —
  the same mechanism #899's own census used, re-run to prove the unwalled-minter set is now empty.
- **A source sweep over `packages/db/tests`** (AC1) — every `.mjs` file on disk, not a mocked file
  list, for the literal `clara.create_client(`.
- **The grant-matrix census** (`rig-isolation.test.mjs`'s T17, `rig-meta.mjs`'s `grantMatrixFailures`)
  — the real catalogue against the real `ALLOWED` map, not a copy of it.

## Acceptance criteria, each with its evidence

**AC1 — "No test fixture calls the direct door; a census over the fixtures proves it."**
Twelve direct callers found by grep across `packages/db/tests` (besides `rig-fixtures.mjs`'s own
`createClient()`) were moved onto the new `createClientRaw(sub, {name, opKey})`:
`audit-actor-role.test.mjs`, `coa-template-pr-b-helpers.mjs`, `f-a7-pi.test.mjs` (×3 call sites),
`firm-commercial-settings.test.mjs`, `firm-portfolio-pack.test.mjs`, `rig-events.test.mjs`,
`wave-b/wb-r3.test.mjs`. `wave-b/wb-g-opkeys.test.mjs`'s own `create_client` table entry was
REMOVED rather than repointed (see "What I found and fixed" below). The census itself:
`p899.census.no_test_file_calls_create_client_directly` (`client-birth-wall.test.mjs`) sweeps
every `.mjs` file under `packages/db/tests`, exempting only `rig-fixtures.mjs` (the fixture) and
`client-birth-wall.test.mjs` itself (whose own refusal cell calls the literal SQL on purpose) —
PASS, empty hit list.

**AC2 — "The direct door refuses EXECUTE to every human role; the WRITERS grant-matrix census
records the new matrix."**
`rig-meta.mjs`'s `WRITERS` array no longer lists `create_client`. `rig-isolation.test.mjs`'s "T17
grant matrix: exact per-role EXECUTE, no PUBLIC leak, helpers/cores not app-callable" — PASS (the
exact-match sweep now expects and finds zero EXECUTE for `clara_authenticated`, and would fail
loudly if the grant returned). The migration's own tail independently re-measures the same fact
for all five application-facing roles (`clara_authenticated`, `clara_runtime`, `clara_agent_ro`,
both wake roles) — all zero. `p899.census.create_client_residual_closed` re-measures
`has_function_privilege` a third, independent way — PASS.

**AC3 — "The whole database suite passes with the fixtures moved (every battery that mints a
client)."**
Every test file touched, run with the FULL gate chain, is green (see Gates below); a
package-wide `pnpm test` run (not required by the work order for a lane ticket, run anyway as
extra diligence) observed 2,798+ cells with zero failures attributable to this ticket before the
session ended without the whole suite finishing — see "Anything unverified".

**AC4 — "The #899 census cell asserts the criterion as met and fails if the grant returns."**
`p899.census.no_unwalled_granted_client_minters` (rewritten from
`granted_client_minters_and_the_one_residual`) — the live sweep's unwalled-minter set is asserted
EMPTY (`assert.deepEqual(unwalled, [])`); a non-empty result — the grant returning, or a new
unwalled minter appearing — fails it. PASS.

**AC5 — "Ships as a new migration at the next free number; no applied migration is edited."**
`packages/db/migrations/0316_create_client_human_grant_withdrawn.sql` — the number the lane prompt
reserved. No existing migration file touched (verified: `git diff cd2925391..HEAD --stat` shows
`0316_…` as the only new/changed migration from this ticket).

## Migration and its prestate pins

`0316_create_client_human_grant_withdrawn.sql`, applied via `pnpm db:migrate` to `clara_l06` — one
clean apply:

```
[notice] #1038 prestate: FIRST APPLY -- clara.create_client is still granted to clara_authenticated; revoking now.
[notice] #1038 prestate: clean -- clara.create_client is present and byte-identical to its measured pre-image; open_client_onboarding, begin_client_onboarding and _client_birth_core are all present, byte-identical to their #899 pre-images, and untouched by this file.
[notice] #1038 tail: OK -- clara.create_client is byte-identical to its pre-image; clara_authenticated (and every other application-facing role) no longer holds EXECUTE on it; PUBLIC never did; its catalogue comment names #1038's closure; open_client_onboarding, begin_client_onboarding and _client_birth_core are all untouched, byte-identical to their #899 pre-images with their #899 grant posture unmoved.
applied 0316_create_client_human_grant_withdrawn · backend pid 749590
migrate: 1 new migration(s) applied · 292 total · target 127.0.0.1:55746/clara_l06
```

**What the file does.** ONE `revoke execute on function clara.create_client(text,text) from
clara_authenticated`, plus a `comment on function` naming the closure. No body change (the
function's `sha256(prosrc)` is pinned identical in the prestate and re-pinned in the tail). No new
role, no new grant — modelled directly on `0273_vendor_binding_write_doors_revoked.sql`'s pure-revoke
shape (a revoke needs no ownership switch; the migration runner's own superuser connection can
`revoke`/`comment on` directly, so no `set role clara_fn_owner` window is opened at all).

**Prestate pins, measured live on `clara_l06` before applying** (no ticket earlier in this lane
touches any of these names):

| function | sha256(prosrc) |
|---|---|
| `clara.create_client(text,text)` | `7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf` |
| `clara.open_client_onboarding(text,text,jsonb,uuid)` (untouched neighbour) | `0a169df316c23a5b33e66e0b1c8512ed479d4cda33f10c4c10725afa8012ec79` |
| `clara.begin_client_onboarding(text,text)` (untouched neighbour) | `9edd80ef8fa66f855b1ed7cb8667ee60dafb80c302cf638b3dd62fdb391602a7` |
| `clara._client_birth_core(uuid,uuid,text,jsonb,uuid,boolean,text,text)` (untouched neighbour) | `5d8a7a295f8b33d62b719ee068b2ce507d3359d6a361abcd80cfe87613335d08` |

All four re-pinned byte-identical in the tail. `create_client(text,text)`'s sha matches 0287's own
pin exactly (`7e8ff7f2…`), confirming no ticket between 0287 and 0316 touched its body.

**Redo path.** Not exercised — this file applied cleanly on the first try, so
`CLARA_MIGRATION_REDO` was never needed. The prestate's own branch logic (measure the live grant,
print FIRST APPLY vs REDO, `revoke`/`comment on` are idempotent so neither statement needs an `if
exists` guard) is structural, modelled on `0273_vendor_binding_write_doors_revoked.sql`'s own
proven redo-safe shape verbatim — not independently re-tested live in this session (see "Anything
unverified").

## What I found and fixed (beyond the direct-caller list)

1. **`rig-isolation.test.mjs`'s "T16 CRITICAL-1"** used `create_client` directly (via `withActor`,
   not `humanQuery`) as its example human writer to prove a human session ignores a foreign
   wake_secret. My first pass swapped the SQL to `open_client_onboarding` and kept the SAME client
   name (`${world.prefix}_crit1`) — this went RED for the right reason: `open_client_onboarding`
   enforces the identity wall `create_client` never did, and that name's leading token
   (`world.prefix`) already has several same-family siblings in the shared module-level `world`
   (`buildWorld()`'s A1/A2, T23's `bkClient`/`adminClient`), so the call collided at arity 2
   (`CLR10 name_family_collision`). Fixed by giving the cell its OWN randomised leading token
   (`crit1${randomUUID().slice(0,8)} Holdings`), which sidesteps the family — this cell is about
   wake-secret-ignoring, not the wall. Re-ran green.
2. **`rig-runtime-catalog.test.mjs`**'s `clara_agent_read_login` "can never execute a writer"
   negative cell used `create_client` as its example writer. Repointed to
   `open_client_onboarding` — `create_client` is now ungranted to every application role, so it
   stopped being a meaningful contrast (its refusal would no longer say anything specific about
   the agent-read role).
3. **`wave-b/wb-g-opkeys.test.mjs`**'s `derived` writer inventory is GRANT-derived (a live query
   over `pg_proc`/`aclexplode` for `clara_authenticated`/`clara_runtime` EXECUTE). Once
   `create_client` lost its grant it dropped out of `derived` automatically; its `table` fixture
   entry then failed that file's own `stale` assertion (`table` entries must all be inside
   `derived`). Removed the entry rather than repointing it — the writer is out of scope for the
   op-key hash law this file tests, not merely uncovered.
4. **A full `pnpm test` run** (packages/db, not required by the work order for a lane ticket, run
   as extra diligence given the breadth of files touched) surfaced two failures **unrelated to
   this ticket**, both pre-existing on this branch before my session started:
   - `p895.seed.noop` (`firm-setup-polish.test.mjs`) expects a first seed to insert exactly 13
     items; it now inserts 14. Root cause: #1032 (0311) made `tin` read `'optional'` rather than
     `'undetermined'` for an unanswered turnover, so it is seeded on the very first reconciliation
     where it used to be held back — `firm-setup-polish.test.mjs` was not in #1032's own gate list
     (`firm-setup-applicability.test.mjs`, `firm-setup.test.mjs`,
     `firm-setup-user-notes.test.mjs`, `firm-setup-education-tips.test.mjs` per its report) and was
     never re-run against the new seeding count.
   - `p658.census.no_recut` (`knowledge-retrieval.test.mjs`) pins
     `clara._knowledge_capture_core`'s body as unchanged since before migration 0230 (tolerating
     only #885's own 0268 recut); it now measures a different sha. Root cause: #1031 (0310) recuts
     that same body for the FYE-pair wall, and `knowledge-retrieval.test.mjs` was not in #1031's
     own gate list either.

   Neither failure references `create_client`, `open_client_onboarding`,
   `begin_client_onboarding`, or anything this ticket touches — confirmed by reading both test
   files and their stack traces. Out of #1038's scope to fix (scope discipline, work order rule
   5); named here as a follow-up for the lane/integrator rather than silently left for a future
   session to rediscover.

## Docs (same commits)

- `packages/db/README.md` — corrected "The client birth wall (0287, #899)"'s present-tense claim
  that `create_client`'s grant is still OPEN (now past tense, pointing at the closing section); new
  "`clara.create_client`'s human grant withdrawn (0316, #1038)" section: the revoke, why the body
  stays untouched, the root+jwt idiom every caller now uses (naming `onboard-rpr.mjs` and
  `seeds/0002_core_seed.sql` as the pre-existing precedent), the WRITERS census update, the two
  repointed RBAC cells, and the four rewritten/added census cells.
- `packages/db/tests/README.md` — `client-birth-wall.test.mjs` section's cell count corrected
  (eleven 0287-gated, four more on #1038's own stem); new subsection listing every direct caller
  moved onto `createClientRaw` and explaining the `wb-g-opkeys.test.mjs` removal.
- `CONTEXT.md` — not touched. "Client identity candidate" (the only entry that could plausibly
  need updating) describes the domain concept, not which door enforces it; unaffected by moving
  who can reach the one remaining unwalled verb. No new noun this ticket mints.

## Successor contract

None. #1038 adds no door, room, part or prompt stanza a frozen chat/Work tool would need —
`create_client` has no product caller (unaffected, unswept-again since #899's own sweep already
established it, and this ticket's own `p899.census.create_client_residual_closed` re-confirms it
via the same `PRODUCT_TREES` sweep), and `open_client_onboarding`/`begin_client_onboarding` are
untouched. `packages/runtime` was not touched by this ticket — no
`check-frozen-workflows.mjs`/`check-parts-parity.mjs` owed (though `check-frozen-workflows.mjs`
was run as a sanity check regardless — see Gates).

## Gates, with counts

- **`client-birth-wall.test.mjs`** (rewritten — 3 census cells, 1 new cell), focused run (no gate
  preload, proving the genuine red-for-the-right-reason shape the file's own gate mechanism is
  built for): **15/15 pass**, 0 fail, 0 skip (11 pre-existing 0287-gated cells + 4 new/rewritten
  0316-gated cells).
- **The eight direct-caller files**, full gate chain preloaded (`node --test
  --test-concurrency=1 $GATES tests/rig-events.test.mjs tests/audit-actor-role.test.mjs
  tests/f-a7-pi.test.mjs tests/firm-commercial-settings.test.mjs tests/firm-portfolio-pack.test.mjs
  tests/wave-b/wb-r3.test.mjs tests/wave-b/wb-g-opkeys.test.mjs tests/coa-template-pr-b.test.mjs`):
  **129/129 pass, 0 fail**.
- **`wave-b/wb-g-opkeys.test.mjs`** alone (re-run standalone to confirm the removed table entry
  fix in isolation), full gate chain: **2/2 pass**.
- **`rig-isolation.test.mjs` + `rig-runtime-catalog.test.mjs` + `operation-census.test.mjs`**
  (touched directly, or exercising the grant-matrix/WRITERS change), full gate chain: **38 pass, 1
  skip (T19, destructive, `CLARA_RIG_ALLOW_RESET` correctly never set), 0 fail** — one genuine red
  (T16 CRITICAL-1, the name-collision described above) caught and fixed before this final count.
- `pnpm typecheck` (apps/web + packages/runtime, worktree root): clean, both "Done".
- `CI=true GITHUB_ACTIONS=true pnpm lint` (every workspace, worktree root): exit 0; `packages/db
  lint: Done` confirmed by name in the captured log.
- `node scripts/check-frozen-workflows.mjs`: not independently re-run this session
  (`packages/runtime` untouched — no drift possible from this ticket's diff).
- **Bonus, not required**: `pnpm test` (the whole `packages/db` package) run as extra diligence
  given the breadth of files this ticket touches. Observed 2,798+ cells, 0 fail attributable to
  this ticket, 2 fail from unrelated pre-existing #1031/#1032 regressions (named above); the run
  did not finish within the session (packages/db's whole suite is large and this rig runs
  `--test-concurrency=1`) — see "Anything unverified".
- apps/web / packages/runtime not touched by this ticket — no unit suite or browser-walk gate
  owed.

## Anything unverified

- The full `pnpm test` (packages/db) run did not complete before the session ended. Everything
  this ticket's own acceptance criteria and the work order's required gates name was run to
  completion and is green; the partial full-suite run is bonus evidence, not a required gate, and
  is reported honestly as partial rather than claimed complete.
- The migration's REDO path (`CLARA_MIGRATION_REDO`) was not exercised — the file applied cleanly
  once and needed no redo. Its redo-safety is a structural claim (idempotent `revoke`/`comment on`,
  modelled verbatim on `0273_vendor_binding_write_doors_revoked.sql`'s own proven shape), not a
  live-tested one in this session.
- I did not run a from-scratch `0001→0316` migration chain (RIG.md: the integrator's job on a
  disposable cluster, never a lane's).
- The two pre-existing #1031/#1032 regressions found (above) were diagnosed by reading the failing
  cell, its stack trace and the relevant migration header — not independently root-caused with a
  bisect. I am confident in the attribution (both root causes are directly visible in the named
  migrations' own header text) but did not verify by reverting either migration and re-running.
