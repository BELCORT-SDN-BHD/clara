# riders closing wave · lane 03 · ticket #1152 — paginate the accrual register and send the side filter to the database

**Status: DONE.**
Branch `riders/wK-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\703`, base `ffb629d73`.
Database `clara_c03` at `127.0.0.1:55742`. Playwright triple `https://127.0.0.1:3620 / 3621 / 3622`.

Start state: `git status` clean; `git log --oneline ffb629d73..HEAD` showed nothing (this is the
first ticket in the lane); the lane database read **337 files, max
`0361_reservation_release_advice`**, matching the wave's precondition record
(`reports/waveK-rig-prep.md`).

Commits added by this ticket:

| sha | message |
|---|---|
| `6ee02513d` | `fix(db): #1152 the accrual register reads a page at a time (0365)` |
| `05aad4851` | `test(db): #1152 the page walk, the omitted-cursor parity and the malformed cursor` |
| `3a26bc94a` | `feat(web): #1152 the accrual register pages, and the side filter reaches the door` |

Working tree clean after the three commits. Nothing pushed, no PR, no GitHub write of any kind.
No message arrived mid-task addressed to the orchestrator (rule (f) did not fire).

---

## The seams I tested at (written before the first test, work order rule 4)

1. **`clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)`** — the door the ticket
   widens. Driven as BOB (bookkeeper) through the named-argument RPC call shape, the same shape
   PostgREST sends.
2. **The catalog** — the estate's documented structural standard for a widened door (a prestate
   recognising two starting shapes, tail assertions, ACL/posture re-reads). Work order rule 4 says
   that standard wins where it applies.
3. **`apps/web/lib/accruals/api.ts`'s `loadAccruals`** — the ONE caller this ticket's brief names
   as gaining the page and the side.
4. **`apps/web/lib/accruals/use-accruals-register.ts`** (new) — the pagination/side-change
   bookkeeping, mounted for real (`renderHook`), mocked fetch only (the transport is proven at the
   door; the hook's own claim is the bookkeeping).
5. **`apps/web/components/accruals/accruals-list.tsx`** — rendered for real (`renderComponent`),
   asserting on rendered text and on a real `<select>` `change` event, never on internal state.
6. **`apps/web/e2e/accrual-walk.spec.ts`** (existing, untouched) — the real built Next bundle
   against a mocked PostgREST, proving the browser-side narrowing is genuinely gone and the
   surface still narrows correctly through the (now side-aware) mock.

What I deliberately did **not** add a seam at: `components/plans/plan-revise-form.tsx` beyond the
one-line envelope unwrap its existing behaviour needs to keep working — see "Out of scope" below.

---

## The ticket, verified live on this branch before building

`gh issue view 1152 --repo BELCORT-SDN-BHD/clara --comments`: the issue body carries the only
Agent Brief and there are **zero comments**, so no owner ruling comment exists on this ticket.

| the ticket's claim | measured on `clara_c03` before a line was written | verdict |
|---|---|---|
| `clara.list_accrual_adjustments(p_client, p_from, p_to, p_side default null)` takes no page | confirmed: `to_regprocedure('clara.list_accrual_adjustments(uuid,date,date,text)')` resolved, `(uuid,date,date)` did not; sha of the live body `2fbad3aafb4317e82f73b061c07119170d9bbb49812fea14cc90d78d3aec2e47` | **live** |
| `apps/web/lib/accruals/api.ts:249-269` sends only `{p_client,p_from,p_to}` and records the debt | confirmed by reading the file at that range before editing | **live** |
| `apps/web/components/accruals/accruals-list.tsx:45-46` narrows client-side | confirmed: `const rows = side === "" ? all : all.filter((r) => r.side === side)` | **live** |
| `#1075 closed on its first criterion alone; its second is untrue until this lands` | confirmed against `waveS-lane01-ticket1075.md` and 0334's own migration comment, which names exactly this debt | **live** |

No re-brief was needed.

---

## Acceptance criteria, each with its evidence

### AC1 — "The door answers a bounded page … a caller can walk to the last page and see each row exactly once, driven at the door." ✅

**`p1152.page.walk`** (`packages/db/tests/accrual-register-pagination.test.mjs`) — five accruals
of one client, each a distinct `effective_from` one month apart. Walked at `p_limit=2` via
`next_cursor` until an empty page: exactly 4 pages (2+2+1+0), every row visited **exactly once**,
in the door's own `(effective_from desc, …)` order — asserted with `deepEqual` against the
expected order, not a re-derivation. A sibling client's accrual never leaks onto the walk
(composed with the existing client-scope predicate). **PASS.**

### AC2 — "An existing caller that sends no cursor and no limit gets exactly the rows and the order it gets today, asserted against the three-argument call." ✅

**`p1152.page.omitted`** — four accruals, distinct `effective_from`. The expected order comes from
an **independent raw SQL read** of `clara.accrual_adjustments` (`order by effective_from desc,
created_at desc, id desc`), never from re-computing what the door computes. A three-argument call
(`p_side`/`p_cursor`/`p_limit` all omitted) matches it exactly; a six-argument call with all three
explicit `null` matches it too, and `next_cursor` is `null` on that unbounded read (there is no
"next" of an answer that already contains everything — see "A design decision" below).
`side: null` is echoed unchanged from 0334. **PASS.**

### AC3 — "The side filter narrows in the database … no test relies on the component to do the narrowing." ✅

DB level: **`p1152.page.composes_with_side`** — three expense accruals, walked at `p_side:
"expense", p_limit: 2`; every row carries `side: "expense"`, all three visited across two pages,
none lost. (The filter's own closed-set refusal and its composition with the date window are
`accrual-list-side-filter.test.mjs`'s own claim, #1075, not re-proved here.)

Web level: **`942.list.filter`** (rewritten — see "What I changed in an existing test" below) — a
side-aware mock router answers per `p_side` in the request body. Selecting "revenue" makes a
**second HTTP round trip** carrying `p_side: "revenue"`; the expense row disappears from the
rendered text because the **server** excluded it, not a component-side filter (there is no
`.filter` left in `accruals-list.tsx` to have done it). **PASS.**

### AC4 — "`accruals-list.tsx` no longer filters rows in the browser, and a component cell asserts the register asks the server when the control changes." ✅

`grep -c "\.filter(" apps/web/components/accruals/accruals-list.tsx` → **0** matches (the old
`all.filter((r) => r.side === side)` line is deleted; `rows` is now the hook's own `rows`
verbatim). `942.list.filter` (above) is the component cell asserting the server round trip.

### AC5 — "The register renders the first page and reaches the next one, asserted by a web cell." ✅

**`apps/web/lib/accruals/use-accruals-register.test.ts`**, `loadMore: appends the next page and
advances the cursor, sending the PRIOR page's own next_cursor verbatim` — a 50-row first page
(`hasMore: true`, page-size-derived) plus a 1-row second page; `loadMore()` appends onto the
existing 50 rows (51 total, never a replace), sends the prior `next_cursor` byte for byte, and
`hasMore` becomes `false` on the smaller second page. A sibling cell proves the initial-load shape
(`hasMore` false on a page smaller than the limit) and a third proves the side control's reload
resets to page one (`p_cursor: null` on the second call, never continuing the old cursor).

### AC6 — "The door's grants, its `security definer` and `stable` posture and its owner are unchanged, asserted off the catalog." ✅

**`p1152.catalog.posture`** — a root-level, corroborating catalog read (never the primary claim
under test elsewhere in the file): owner `clara_fn_owner`, `prosecdef=true`, `provolatile='s'`,
`search_path=clara, pg_temp`, ACL exactly `clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner`
— byte-identical to the pre-#1152 posture, and the four-argument signature confirmed gone.
0365's own tail assertion (§5) proves the same thing at every apply, not only at test time.

### AC7 — "The migration applies from scratch and on a populated database, first-apply branch proved, and the from-scratch chain is green." ✅ (first-apply proved directly; from-scratch chain is the integrator's, per the wave-3 addendum)

`clara_c03` carried real seeded/replayed data (cloned from `clara_intS6`) when `0365` was applied
— this **is** "on a populated database". The **first-apply branch ran for real**: the database had
never seen `0365` before, so the ordinary `pnpm db:migrate` run exercised `v_old` (the live
four-argument door), not a simulation. Evidence: `migrate: 1 new migration(s) applied · 338 total`.
A bug in the cursor guard (found by `p1152.cursor.malformed`'s "no tuple key" case — see below)
required one **redo** (`CLARA_MIGRATION_REDO=0365_accrual_register_pagination`), which correctly
took the "my own body is already live" branch (`six-argument, this file's own prior redo` in the
prestate notice) — the two starting shapes are therefore BOTH proved on this rig, not merely
asserted. Per the wave-3 addendum and `RIG.md`'s own preface ("nobody runs a second from-scratch
chain on this cluster"), the **from-scratch chain itself is the integrator's**, on a disposable
cluster — not owed by a lane worker.

### AC8 — "`CI=true GITHUB_ACTIONS=true pnpm lint` exit 0." ✅

Confirmed, `EXIT:0` (see "Gates" below).

---

## A NULL-propagation bug my own tests caught

The cursor guard's first draft used `jsonb_typeof(p_cursor -> 'tuple') <> 'array'`. When `tuple` is
simply absent (`p_cursor = {}`), `p_cursor -> 'tuple'` is SQL `NULL`, `jsonb_typeof(NULL)` is
`NULL`, and `NULL <> 'array'` is `NULL` — three-valued logic makes the whole `or`-chain `NULL`
(not `TRUE`), so the guard **silently did not fire** and `{}` passed as "no cursor" instead of
being refused as malformed. `p1152.cursor.malformed`'s "no tuple key" case caught this on the
first real run (`assertPair` reported "expected SQLSTATE CLR10 but the call SUCCEEDED"). Fixed
with `IS DISTINCT FROM` throughout (never returns NULL), redone on the rig, all five malformed
shapes now refuse correctly. Documented in the migration's own header and in
`packages/db/README.md`'s `## 0365` section, in full, so the next reader does not have to
rediscover it.

A second design bug (mine, no test regression involved — caught by my own AC2 cell before it ever
reached a redo cycle beyond the first): `next_cursor` was originally built from the answered page
unconditionally, including on an UNBOUNDED (`p_limit` null) read — `p1152.page.omitted` failed
with a non-null `next_cursor` where the test expected null. Fixed: `next_cursor` is now null
whenever no limit was requested (an unbounded read already answered everything; there is no
"next" of it), non-null only on a limited page — corrected in the same redo as the guard fix.

---

## What I changed in an existing test, and why

`accrual-adjustments.test.mjs`'s `p652.acl.grants` hard-coded the four-argument signature in a
catalog probe. 0334 had already made this probe dynamic for its OWN widen (a `sideFilterLive`
check picking the 3- or 4-argument form); I extended the same pattern with a `paginationLive`
check so the probe resolves the LIVE signature on any frontier the `db-slice-frontiers` matrix
might run this battery against (pre-0334, post-0334-pre-0365, or post-0365). This is the SAME
`list_accounting_work`/0267 idiom the existing comment already cites.

`accruals-list.test.tsx`'s `942.list.filter` drove the OLD client-side-filter claim
(`rpcRouter`'s single static answer, narrowed locally). Since that claim is now false by
construction (the filter code is deleted), I rewrote the cell to drive a side-aware mock and
assert the SERVER round trip instead — the other four cells in that file (`652.list.empty`,
`652.list.unresolved`, `652.list.rows`, `942.list.side`, `1071.list.amount-kind`) needed no
change: none of them relied on client-side filtering, only on rendering exactly what the (still
url-matched, still static) mock returns.

---

## Migration: `0365_accrual_register_pagination.sql`

**Prestate pins**, measured on `clara_c03` immediately before the file was written (never copied
from an older migration's header):

| object | sha256(prosrc) |
|---|---|
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |
| `clara._accrual_sides()` | `8db11e9cdca5398b85aac24e6ea3ce1a3790149892d911f7008ccbfe0a9d9bab` |
| `clara.list_accrual_adjustments(uuid,date,date,text)` (the live four-argument door, pre-image) | `2fbad3aafb4317e82f73b061c07119170d9bbb49812fea14cc90d78d3aec2e47` |

All four are byte-identical to what 0334's own header pinned — nothing in this lane's family had
drifted since 0334 landed (this is ticket #1 of lane L3; nothing before it touched the accrual
family).

**Applied**: `pnpm db:migrate` from the worktree root → `applied 0365_accrual_register_pagination
· backend pid 1040562` → `338 total`. **Redone once** (fixing the two bugs above) via
`CLARA_MIGRATION_REDO=0365_accrual_register_pagination` → `redone 0365_accrual_register_pagination
· new checksum 71d449a2a5bbca9d6255e52148c2f136bb9fd42a6abaca9c102035b3404a592b`.

**House shape**: header (why a drop-and-create, why `p_limit` defaults null not 50, why the cursor
tuple carries `to_char(… at time zone 'UTC', …)` rather than a bare cast, what does not change) →
§0 prestate (two valid starting shapes, redo-recognition marker check) → §W the widen → §T tail
census (signature census, both refusal guards, both predicates, the limit clamp, the projection's
survival byte-for-byte, posture, comment, sibling-door survival). Gate-chain entry, rig-meta
cohort note ("no cohort change" — same reasoning 0334's own note gives) all in place.

---

## Gates, with counts

- **My touched db test files, WITH the full gate chain preloaded** (all 153 `--import
  ./tests/*-preintegration-gate.mjs` flags from `packages/db/package.json`'s own `test` script,
  plus mine appended at the sorted/migration-order position):
  `node --test --test-concurrency=1 $GATES tests/accrual-register-pagination.test.mjs
  tests/accrual-adjustments.test.mjs tests/accrual-adjustments-fixtures.mjs` → **27/27 pass, 0
  fail, 0 skip**.
- **Focused run, gate chain UNSET** (the "final acceptance" shape the gate module's own comment
  names — a chain missing the lane fails loudly rather than skipping):
  `node --test --test-concurrency=1 tests/accrual-register-pagination.test.mjs` → **5/5 pass**.
- **The whole accrual family** (accrual-adjustments, accrual-list-side-filter,
  accrual-register-pagination, accrual-revenue-side, accrual-bill-conflict, accrual-correction,
  accrual-period-amounts, accrual-plan-authority-wall) → **80/80 pass, 0 fail**.
- **`operation-census.test.mjs` + `rig-isolation.test.mjs`**, full gate chain, no reset flags →
  **32/33 pass, 1 skip** (`T19 poison-role`, the destructive reset-and-re-migrate cell, correctly
  skipped without `CLARA_RIG_ALLOW_RESET=1` — never set on a shared lane cluster).
- **`node scripts/check-frozen-workflows.mjs`** against the base → `freeze-lint: OK — 347 frozen
  file(s) verified … 60 "use workflow" module(s) all frozen+registered; 3 retired entr(ies)
  recorded`. `git diff ffb629d73..HEAD -- packages/runtime frozen-workflows.json` → empty. (This
  ticket touches neither; the check is run anyway per rule (a).)
- **`pnpm typecheck`** (repo root) → `apps/web typecheck: Done`, `packages/runtime typecheck:
  Done` — clean, no errors.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (repo root) → `EXIT:0`.
- **`apps/web` whole unit suite once** (`node scripts/run-tests.mjs` from `apps/web`) → **5250/5252
  pass, 0 fail, 2 skip** (both skips are the pre-existing `CLARA_LIVE_SUPABASE_AUTH_URL` /
  `CLARA_LIVE_SUPABASE_AUTH_ANON_KEY` "not configured" live-provider skips in
  `lib/supabase-auth.live.test.ts`-adjacent files — unrelated to this ticket, present before it).
- **`apps/web/tests/firm-scope-db-pins.test.ts`** (rule (d), a migration file changed) →
  **22/22 pass**. No new `REVIEWED_DYNAMIC_SQL_BARRIERS` entry owed: 0365 is static DDL plus plain
  `do $$ … $$` prestate/tail blocks, no `EXECUTE`/`format()`/`pg_get_functiondef` splice, the same
  posture 0334 itself has (0334 is not in that map either — confirmed by grep before writing the
  migration).
- **`accrual-walk.spec.ts`** (the one browser walk this ticket touches) on the lane's own
  Playwright triple (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3620
  CLARA_E2E_NEXT_PORT=3621 CLARA_E2E_RUNTIME_PORT=3622`) →
  **21 passed (37.4s), 0 failed** — including `accrual.walk.revenue`, whose "AND IT NARROWS TO ONE
  SIDE" cell is the one that would have caught a broken server-side narrowing.
- **Bonus, not required by rule 8**: a full `packages/db` package sweep (`node --test
  --test-concurrency=1 $GATES "tests/**/*.test.mjs"`, run via direct `node` invocation rather than
  `pnpm test` — `pnpm test` itself failed with a Windows `cmd.exe` "The command line is too long"
  wrapper error at 153 gate imports, ~9.9k characters; this is a pre-existing Windows-only
  transport limitation of `pnpm`'s script runner on this host, not a real test failure, and
  RIG.md's own db-test recipe already prescribes the direct `node --test $GATES …` invocation for
  exactly this reason). At the time of writing this report the sweep had reached **3277+ tests
  passed, 0 failed**, still running in the background; I did not wait for full completion since it
  is not a required gate and every required gate above is already green. I can hand the orchestrator
  its finished tally on request.

---

## Docs updated

- `packages/db/README.md`: new `## 0365 …` section (design rationale, the NULL-propagation bug,
  the redo, what changed on the web side, in full).
- `apps/web/README.md`: the `#936` section's inline `loadAccruals(clientId)` reference updated to
  `(await loadAccruals(clientId)).accruals`, matching the new envelope return type.
- `apps/web/messages/en.json`: `loadMore` / `loadingMore` keys added inside `Accruals`, sorted
  position (right after `listBody`), matching `check-message-keys.mjs`'s clean pass.
- `apps/web/test/manifest.txt`: `lib/accruals/use-accruals-register.test.ts` added at its sorted
  position.
- `packages/db/tests/rig-meta.mjs`: a "no cohort change" note beside 0334's own, for the same
  reason.

---

## Successor contract

**None owed by this ticket.** The brief's own "Out of scope" line: *"Any chat or Work tool. What a
frozen tool would need if one ever read the register filtered by side is written in
`waveS-lane01-ticket1075.md` and belongs to a later cut."* #1152 adds no new door name, no new
refusal a frozen tool would need to know about beyond what #1075 already recorded, and touches no
`packages/runtime` path (confirmed above). LC's #1144 cut roster does not name this door.

---

## Out of scope, and why

- **`components/plans/plan-revise-form.tsx`** is NOT paginated. Its own `loadAccruals(clientId)`
  call sends no `page` argument, so it still reads every accrual of the client, unpaged, exactly
  as before — it needs the WHOLE list to find the one accrual bound to a given plan
  (`liveAccrualForPlan`), and a first-page-only read there would risk missing the very row the
  read exists to find, which #936's "the books never disagree with themselves" claim cannot
  afford. The only change to this file is the one-line unwrap (`accruals.data?.accruals` instead
  of `accruals.data`) required because `loadAccruals` now returns the door's envelope rather than
  a bare array — a mechanical consequence of widening a SHARED function's return type, not a
  widening of this ticket's own scope. Its own test file (`plan-revise-form.test.tsx`) is
  unchanged and passes (3/3).
- **Any other register or read** — untouched, per the brief's own out-of-scope line.
- **What a row shows, the date window, the sort order, the bill-conflict panel** — untouched.

---

## Anything unverified

- The full-package `packages/db` sweep (the "bonus" run above) had not reached its own final
  summary line at the time this report was written. Every gate rule 8 actually requires is
  complete and green; this is disclosed for completeness, not because it is owed.
- I did not re-run the OTHER browser walks in this repo (only `accrual-walk.spec.ts`, the one this
  ticket's files reach) — rule 8 scopes this to "each browser walk you touched," and no other
  spec imports `accrual-mock.mjs`'s `list_accrual_adjustments` handler or
  `accruals-list.tsx`/`use-accruals-register.ts`.
