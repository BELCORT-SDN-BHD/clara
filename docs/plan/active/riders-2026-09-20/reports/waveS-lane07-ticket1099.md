# Riders sweep wave — lane 07, ticket #1099

**Restore op-key idempotence test coverage for `clara.create_client`, dropped along with its
human grant by #1038 (0316) — no migration.**

| | |
|---|---|
| branch | `riders/wS-lane07` in `C:\Users\zhant\Desktop\clara-wt\659` |
| base | `7bc5a710f` (the integrated head of the wave before) |
| lane database | `127.0.0.1:55749` / `clara_l09`, 312 migration files, max `0349_admit_autodraft_task_outcome_disclosure` (**unchanged** — no migration) |
| commit (this ticket) | `d7d7def8c` `test(db): #1099 restore create_client's op-key idempotence coverage off the grant census` |
| tickets before mine on this branch | #1047 (README + `packages/db/tests` only), #1098 (migration `0347`), #1046 (migration `0348`), #1132 (migration `0349`), #1096 (`knowledge-onboarding-promotion.test.mjs`, no migration) — none touch `clara.create_client`, `wb-g-opkeys.test.mjs` or `rig-fixtures.mjs` |
| verdict | **done** |

`git status` / `git log --oneline 7bc5a710f..HEAD` at start: clean tree, 14 commits ahead of base,
the five tickets above already landed (matches the prompt). Ticket contract read from
`gh issue view 1099 --repo BELCORT-SDN-BHD/clara --json title,body,comments,labels,state`: the
Agent Brief is in the **issue body**, the issue carries **zero comments**, no owner-ruling comment
dated 2026-09-20. Labels `enhancement` + `ready-for-agent`. Re-verified live on this branch before
building (see "The seam I tested at" below) — nothing before me in the lane touches this surface.

**This ticket is expected to need NO migration, and needed none.** No PostgreSQL object was
created, recut, or touched by any applied statement; `clara.create_client`'s live body is
byte-for-byte identical before and after this ticket (proven in the vacuity control below, not
merely claimed).

No status-report request arrived mid-task; none to note.

---

## The seam I tested at

Written down before the first cell, per work-order rule 4:

1. **`clara.create_client(text,text)`, driven through `packages/db/tests/rig-fixtures.mjs`'s
   `createClientRaw(sub, {name, opKey})`** — the ticket's own "Key interfaces" section names this
   exact pair: "the shared op-key idempotence test file's grant-derived writer inventory" (i.e.
   `packages/db/tests/wave-b/wb-g-opkeys.test.mjs`'s G4/[R2-F8] census) and "`clara.create_client`'s
   own internal reservation logic … reachable through the root+jwt idiom its remaining callers now
   use" (i.e. `createClientRaw`, which stays at the pooled connection's base identity — the
   postgres superuser, bypassing EXECUTE grants — and hand-sets `request.jwt.claims` so
   `clara._human_ctx` resolves the same actor/firm/floor a granted `clara_authenticated` caller
   would have gotten; `packages/db/README.md`'s "`clara.create_client`'s human grant withdrawn
   (0316, #1038)" section documents this as the house idiom). This is a real public interface, not
   an internal collaborator: it is the SAME fixture every other test file in `packages/db/tests`
   already uses to mint a client since #1038 (`client-birth-wall.test.mjs`'s own census,
   `p899.census.no_test_file_calls_create_client_directly`, asserts it is the ONE call site).

No seam outside this one was touched: no `apps/web` file, no frozen workflow, no applied
migration, no other ticket's migration, no recut of `clara.create_client` or `clara._reserve_op`/
`clara._finish_op` (both untouched, prestate-pinned).

---

## First finding, before building: confirming the gap is real

Grepped `packages/db/tests` for any existing cell driving `clara.create_client`'s op-key hash law
(same `op_key`, mutated payload → refuse; same `op_key`, identical payload → replay) — none found.
Every existing caller of `createClientRaw`/`createClient` (`audit-actor-role.test.mjs`,
`coa-template-pr-b-helpers.mjs`, `f-a7-pi.test.mjs`, `firm-commercial-settings.test.mjs`,
`firm-portfolio-pack.test.mjs`, `rig-events.test.mjs`, `wave-b/wb-r3.test.mjs`, and
`packages/runtime/tests`' twin fixture) mints exactly one client with a fresh `opKey` each time —
none replays a key or mutates a payload under one. Confirmed the mechanical cause: `wb-g-opkeys
.test.mjs`'s G4 census derives its writer set from a live `aclexplode`/EXECUTE-grant query
(`clara_authenticated`/`clara_runtime`); `create_client`'s grant to `clara_authenticated` was
withdrawn by #1038 (0316), so it can never appear in that inventory again — and the file's own
`table` object already carries a comment marking exactly this: *"create_client dropped out of
`table` on purpose … an entry here for it would fail the `stale` assertion below, not merely go
unused."* The ticket's description of the defect matches the code exactly.

---

## Acceptance criteria, each with its evidence

### AC1 — "`clara.create_client`'s (or an equivalent ungranted-but-still-idempotent writer's)
`_reserve_op` behavior is covered by a test again, driven through whatever path can still reach it
(root connection, fixture helper, or similar), not only through a grant-derived census that
excludes it."

**DONE.**

- New test, `packages/db/tests/wave-b/wb-g-opkeys.test.mjs`, **"G4/[R2-F8] supplement (#1099):
  clara.create_client's _reserve_op hash law, driven through createClientRaw since the
  grant-derived census can no longer reach it"** — added as a SEPARATE top-level `test(...)`,
  outside the census test's `table`/`derived` machinery (an entry inside `table` would fail that
  test's own `stale` assertion, since `create_client` is structurally absent from `derived`).
  Drives `createClientRaw` (never raw SQL — keeping the file's own "one call site" law) and
  asserts BOTH halves of the law, mirroring exactly what the census proves for every granted
  writer:
  - **Replay:** a fresh reservation (`createClientRaw(hana, {name: nameA, opKey: key})`), then an
    EXACT replay (same `key`, same `nameA`) — `assert.deepEqual(replay, first)` (the cached
    receipt, byte-for-byte) plus a direct row-count check
    (`select count(*) from clara.clients where id = $1` → `1`), proving no second insert happened.
  - **Mutated-payload refusal:** same `key`, a DIFFERENT name (`nameB`) —
    `assertRaises(CLR.badRequest, …)`, i.e. `CLR10`, the exact law
    `packages/db/migrations/0017_wave_b.sql:2538-2539` implements
    (`clara._hash(jsonb_build_object('name', btrim(p_name)))`).
  - **Result, focused run, full `$GATES` chain, `clara_l09`:** `ok 4 - G4/[R2-F8] supplement
    (#1099): …` — **PASS**.

### AC2 — "The fix generalizes: a future writer whose grant is withdrawn while its idempotency
logic stays in place should not silently drop out of this coverage the way `create_client` did."

**DONE**, as a named convention plus a self-checking mechanism, not only a comment:

- **`UNGRANTED_RESERVING_FNS`** — a new registry in `wb-g-opkeys.test.mjs`, next to the existing
  `EXEMPT` dict, mapping a fn name to "which migration withdrew its grant; where the dedicated
  cell that now drives it lives." Today it holds one entry, `create_client`. Its header comment
  states the convention explicitly: *"when a fn's human grant is withdrawn while it KEEPS calling
  `_reserve_op`, add it here … instead of letting it fall out of every census with no trace."*
- **A META test**, `"META/#1099: every UNGRANTED_RESERVING_FNS entry still calls _reserve_op in
  its live body — a grant withdrawal must never silently take the reservation discipline with
  it"** — re-measures each registry entry's live `prosrc` for the `_reserve_op` literal, the SAME
  law the census's own `droppedReservation` sweep enforces for every writer it can still see
  (lines 62-98 of the file), now extended to writers the grant-derived query structurally cannot
  reach. A future writer added to the registry whose body later drops `_reserve_op` fails this
  cell loudly, by name.
- Cross-referenced at the exact spot the gap was previously only commented on:
  `table`'s `create_client`-exclusion comment now points at both the registry and the dedicated
  cell, so a future reader lands on the coverage instead of a dead end.
- `packages/db/README.md`'s existing "`clara.create_client`'s human grant withdrawn (0316,
  #1038)" section gained one new paragraph (appended, nothing rewritten) naming the pattern and
  telling a future engineer where to put the next one.

**What AC2 does NOT do, deliberately:** it does not add an automatic, code-diffing mechanism that
detects a NEW grant withdrawal by itself (e.g. diffing the grant-derived inventory across
migrations) — that would be a materially larger, speculative build for a hazard that has occurred
once in the estate's history. The registry-plus-meta-cell is the same shape the file already uses
for `EXEMPT`/`RESERVE_LAW_EXEMPT` (a named, audited list with a self-checking assertion), scoped to
this ticket's actual finding rather than widened into a new detection framework.

### The `no product caller` / `one call site` invariant — not part of my brief, checked anyway

Re-ran `client-birth-wall.test.mjs`'s own census in full after my change (15/15 pass, including
`p899.census.no_test_file_calls_create_client_directly`), to confirm the new cell's use of
`createClientRaw` did not introduce a second direct SQL call site to `clara.create_client(` outside
the one fixture that census enforces. It did not.

---

## The vacuity control (work-order rule 4: "a ticket whose whole deliverable is a test … still
needs the vacuity control: show the new cell FAILING against a deliberately broken subject once,
then restore the subject byte for byte")

Because both new cells are pinning coverage over ALREADY-SHIPPED, unchanged behaviour, there is no
natural red-green-refactor cycle to start from (`create_client`'s body is untouched since 0017,
prestate-pinned again by 0316's own tail). Used the same technique #1096's report used: a scratch
script (`packages/db/vacuity-1099.mjs` + `packages/db/_vacuity-1099-original.sql`, run then
deleted, never committed — `git status` after the commit above is clean) that:

1. **Measured** the live `sha256(prosrc)` of `clara.create_client(text,text)` on `clara_l09`:
   `7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf`.
2. **Extracted** the function's ORIGINAL body verbatim (lines 2529-2561 of
   `packages/db/migrations/0017_wave_b.sql`, via `sed`, never retyped) into a `.sql` file, with a
   sanity assertion that the slice starts with the expected `create or replace function` opener
   and ends with `end $$;`.
3. **Broke** the subject on the LIVE CATALOG ONLY (`set role clara_fn_owner; create or replace
   function …`, never an edit to the migration file): the `_reserve_op`/`_finish_op` reservation
   was dropped entirely — every call now mints a NEW client regardless of `op_key`. New
   `sha256(prosrc)`: `f16ee86baa4e3652a36726508c40f6a3d2c0439f4c6a15dad6e1151b247c9a53` — confirmed
   different from step 1. (First attempt at this break used a comment mentioning the literal
   string `_reserve_op` to explain the change, which made the META cell's own `prosrc like
   '%_reserve_op%'` probe false-negative on the COMMENT text rather than the missing call —
   caught this, reworded the break's comment to avoid the literal, re-broke, and got the correct
   red below. Recorded here because it is itself evidence the META cell's mechanism does what it
   claims: it reads `prosrc` textually, exactly as documented, and is exactly as sensitive to that
   as the pre-existing `droppedReservation` sweep it mirrors.)
4. **Ran** the full test file against the broken subject:
   - `META/#1099` → **RED, for the right reason** —
     `UNGRANTED_RESERVING_FNS entries whose live body no longer calls _reserve_op … : create_client`
     (`1 !== 0`).
   - `G4/[R2-F8] supplement (#1099)` → **RED, for the right reason** — the SECOND `createClientRaw`
     call (intended to hit the cached-receipt replay path) instead attempted a real second insert
     under the broken body and collided on the `clients` name-uniqueness constraint: `error: 'a
     client with that name already exists', code: 'CLR10'` — proof the reservation short-circuit
     was gone (with `_reserve_op` intact, the second call never reaches the insert at all).
   - The **pre-existing G4 census cell stayed GREEN throughout** (`create_client` is not, and
     structurally cannot be, part of its `derived`/`table` set — confirming the break is scoped to
     exactly the new coverage, never a false positive elsewhere).
   - Full-file tally: **4 tests, 2 pass, 2 fail** (the two new cells).
5. **Restored** the subject with the SAME extracted `ORIGINAL_SQL` text (`create or replace
   function`, byte-identical to the migration file; no `revoke`/`comment on` re-run needed — `create
   or replace function` does not touch ACL or the catalogue comment, and neither was part of the
   break). New `sha256(prosrc)`: `7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf`
   — **equal to step 1's measurement**, asserted by the script itself (it throws if they differ).
6. **Re-ran** the full test file: **4/4 pass**, both new cells included.

This is the same style of proof #1096's report used (no migration to redo, so the restore is
proven by direct `sha256(prosrc)` equality rather than by `CLARA_MIGRATION_REDO`) — re-verified
independently just now, post-commit, with a fresh query against the live catalog: `create_client`
live sha `= 7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf` (see "Gates" below).

---

## Gates, with counts

Every db run used `PGHOST=127.0.0.1 PGPORT=55749 PGUSER=postgres PGDATABASE=clara_l09
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, from `packages/db`, `--test-concurrency=1`, the full
`$GATES` list (every `--import …preintegration-gate.mjs` in `packages/db/package.json`, 128
modules / 256 `--import` flags).

| gate | result |
|---|---|
| `tests/wave-b/wb-g-opkeys.test.mjs`, BEFORE my edit (baseline) | **2 tests, 2 pass, 0 fail** |
| same file, AFTER adding both new cells, subject unbroken | **4 tests, 4 pass, 0 fail** |
| same file, subject DELIBERATELY BROKEN (vacuity control) | **4 tests, 2 pass, 2 fail** — the two fails are the new `META/#1099` and `G4/[R2-F8] supplement (#1099)` cells, both for the right reason (see above); the pre-existing census cell stayed green |
| same file, subject RESTORED byte-for-byte (sha verified equal) | **4 tests, 4 pass, 0 fail** |
| `tests/operation-census.test.mjs`, full chain | **10 tests, 10 pass, 0 fail** |
| `tests/rig-isolation.test.mjs`, full chain, **no reset flags** | **23 tests, 22 pass, 0 fail, 1 skipped** — the one skip is `T19 poison-role: reset + re-migrate`, which `RIG.md` forbids running |
| `tests/client-birth-wall.test.mjs`, full chain (not strictly owed — run anyway, since my cell touches `create_client`'s call surface indirectly) | **15 tests, 15 pass, 0 fail** — including `p899.census.no_test_file_calls_create_client_directly`, confirming the new cell added no second direct call site |
| `pnpm typecheck` (repo root) | **Done** — `apps/web` and `packages/runtime`, no errors (this ticket touched neither package's `.ts`) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` (repo root) | **pass, exit 0** — `freeze-lint: OK — 322 frozen file(s) verified against frozen-workflows.json (append-only vs 7bc5a710f)`; `evaluator-freeze-lint: OK` |
| Post-commit re-check: `clara.create_client` live `sha256(prosrc)` | `7e8ff7f247ee14021f447f5a95da8a413b782aa97a99786fdac6e6d8bd297edf` — equal to the vacuity control's own prestate/restored measurement; `clara.schema_migrations` still `312` rows, max `0349_admit_autodraft_task_outcome_disclosure` |

No SQL function was added or recut (no migration), so `operation-census.test.mjs` and
`rig-isolation.test.mjs` were run anyway because work-order rule 8's `packages/db/tests` clause is
unconditional on ANY touch to that directory, not only on new functions — both ran clean, matching
the pattern #1096's report already recorded for this lane.

Not owed and not run, with the reason: `apps/web`'s unit suite or any browser walk (no `apps/web`
file touched, and sweep rule d's web-pins-corpus trigger is "whenever a MIGRATION FILE changed" —
none did here); `node scripts/check-frozen-workflows.mjs` /
`node packages/runtime/scripts/check-parts-parity.mjs` standalone (no `packages/runtime` file
touched; both ran anyway as part of the full `pnpm lint` chain above and passed).

### The `FREEZE_BASE_REF` finding (same drift #1132's and #1096's reports already flagged for this lane)

`pnpm lint`'s `check-frozen-workflows.mjs` step compares the working tree against `origin/main` by
default, and on this host `origin/main`'s local ref has moved past this lane's own base
(`7bc5a710f`) — PR #1140 (the riders cut-phase integration) merged into `origin/main` after this
lane branch was cut. Ran with `FREEZE_BASE_REF=7bc5a710f` from the start (the work-order
addendum's "everywhere a rule says `origin/main..HEAD`, read `<base>..HEAD`") and got a clean
result directly — recorded again here because it recurs on every ticket in this lane until the
branch merges past PR #1140.

Known Windows-only reds from `RIG.md`: none encountered.

---

## Migration

**None.** No `packages/db/migrations/*.sql` file was added, edited, or applied. No entry was added
to `packages/db/package.json`'s `$GATES` list, no cohort was added to `packages/db/tests/rig-meta.mjs`
(no new catalog name was minted — `UNGRANTED_RESERVING_FNS` is a plain JS object, not a database
object). The lane database stays at 312 files / `0349_admit_autodraft_task_outcome_disclosure`,
unchanged by this ticket. `pnpm --filter @clara/db migrate` was not re-run (nothing to apply); the
ticket's own "expected to need NO migration" line held.

---

## Shared files

| file | my hunk |
|---|---|
| `packages/db/tests/wave-b/wb-g-opkeys.test.mjs` | one import added (`createClientRaw`); a new `UNGRANTED_RESERVING_FNS` registry + its META test, placed beside `EXEMPT`; the existing `create_client`-exclusion comment in `table` extended (not replaced) with a pointer to the new coverage; a new dedicated `test(...)` appended at the end of the file. No existing test, fixture call, or assertion edited. |
| `packages/db/README.md` | ONE new paragraph, "**Restored by #1099 …**", appended immediately after the EXISTING "`clara.create_client`'s human grant withdrawn (0316, #1038)" section's last paragraph — the existing section is untouched, byte-for-byte, above that point. |
| `packages/db/package.json` (the `$GATES` list) | **not touched** — no new gate module, no new cohort. |
| `packages/db/tests/rig-meta.mjs` | **not touched** — no new catalog name minted. |
| `apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `apps/web/e2e/serve-built.mjs`, `apps/web/e2e/e2e-fixture-ownership.test.ts`, `apps/web/lib/navigation/tree.ts`, `CONTEXT.md` | **not touched.** No web file changed, no new domain vocabulary (no new entity, key or term — `UNGRANTED_RESERVING_FNS` is test-internal, not a product concept). |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **not touched** — sweep rule d's trigger ("whenever a migration file changed, even a comment") did not fire; no migration file changed. |
| `packages/db/tests/` six census files (`coa-template-pr-b`, `firm-document-limits-writer`, `firm-portfolio-pack`, `plan-overlap-template-arm-retired`, `preview-invite`, `subledger-hook-caller-roster`) | **not touched** — none of the six names `create_client`, `_reserve_op`, or `wb-g-opkeys`; out of this ticket's scope. |
| `packages/runtime/*` | **not touched** — this ticket is `packages/db` only. |

---

## Docs

- `packages/db/README.md`'s "`clara.create_client`'s human grant withdrawn (0316, #1038)" section
  gains one new paragraph, "**Restored by #1099 …**", naming the mechanism (`UNGRANTED_RESERVING_
  FNS`, the META cell, the dedicated supplement cell), the two halves of the law it proves, and the
  generalising convention for a future grant withdrawal.
- No migration header to update (no migration).
- `CONTEXT.md`: no new vocabulary introduced by this ticket (no new entity, key or term, only test
  infrastructure) — not touched.

---

## Successor contract

**None owed.** This ticket touches no frozen workflow body and no module in a frozen closure —
`clara.create_client`, `wb-g-opkeys.test.mjs` and `rig-fixtures.mjs` are all pure `packages/db`
test/database surfaces. `grep -rn "create_client" packages/runtime/workflows` returns nothing this
ticket's diff moved. `pnpm lint` (with `FREEZE_BASE_REF=7bc5a710f`) ran `check-frozen-workflows.mjs`
clean, `freeze-lint: OK`.

---

## Follow-ups worth filing

1. **The `UNGRANTED_RESERVING_FNS` convention has exactly one entry today.** If a future ticket
   withdraws another writer's grant while it keeps calling `_reserve_op` (the pattern #1038 and now
   #1099 establish), the convention this ticket documents in both the test file's own header
   comment and `packages/db/README.md` should be followed rather than rediscovered — worth a line
   in `AGENTS.md`'s or the wave-b battery's own onboarding notes if the estate expects more grant
   withdrawals of this shape. Not filed as a ticket by itself; noted here as the natural next reader
   of this pattern.
2. **The `FREEZE_BASE_REF` drift**, flagged again above and already flagged by #1132's and #1096's
   own reports for this lane — will keep recurring for the remaining tickets in this lane (#1094,
   #1095) until the branch merges past PR #1140. Still worth the one-line `RIG.md`/`WORK-ORDER.md`
   addition those reports already proposed.

---

## Anything unverified

- **Hosted.** Not touched; no claim made about hosted's own catalog data or README state.
- **A true from-scratch chain** was not run and is not owed — no migration exists for this ticket
  to prove a first-apply/redo branch over.
- **Whether `packages/runtime/tests`' twin `createClientRaw`** (`relay-fixtures.mjs`) needs the
  same supplementary coverage was not investigated — out of scope (the ticket names the DB-side
  census specifically, and `packages/runtime/tests` has no equivalent grant-derived op-key census
  that this ticket's brief or the sweep plan names); worth a look if the owner wants runtime-side
  parity, but not built here.
- The scratch vacuity script (`packages/db/vacuity-1099.mjs`) and its extracted SQL
  (`packages/db/_vacuity-1099-original.sql`) were deleted after use and never committed; their
  exact content (the break/restore SQL, the sha values quoted above) is reproduced in full in this
  report's vacuity-control section above so the steps are independently re-creatable without the
  files.
