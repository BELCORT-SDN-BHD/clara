# Wave S, lane 03, ticket #1069 — as-run

Worktree `C:\Users\zhant\Desktop\clara-wt\656`, branch `riders/wS-lane03`, database `clara_l06`
(127.0.0.1:55746). Base for this lane: `7bc5a710f` (per the prompt's addendum, used everywhere a
rule says `origin/main..HEAD`). Tickets before mine in this lane (#1067, #1052, #1066, #1068) had
already landed their commits and applied their migrations before I started; I built on them and
touched none of their files.

Note (rule f): no status-report request arrived mid-task in this session. None to note.

## Commits (`7bc5a710f..HEAD`, mine only, oldest first)

```
a553a0289 fix(db): #1069 clara.get_work_claim_origin projects allocation_count
f0fc408ae test(db): #1069 allocation_count is DRIVEN for a claim's Work card
61577e449 fix(web): #1069 the Work card names how many advances a claim settles
48bfb5998 test(web): #1069 a single-advance card is unchanged, a multi-advance one names N
51c50bd88 docs(db): #1069 the 0341 migration section
```

## Ticket: #1069 — done

**Seams tested at** (written before building, per work-order rule 4): the door
`clara.get_work_claim_origin(uuid)` (a SQL RPC, driven directly in the migration's own tail and
through `getWorkClaimOrigin` in `packages/db/tests/staff-expense-claim-fixtures.mjs` from the node
test suite), and the rendered Work-detail identity block (`apps/web/components/work/work-detail.tsx`,
`data-testid="work-claim-origin"` / `"work-claim-allocation-count"`), driven through
`WorkDetailView`'s injected `loadClaimOrigin` seam in `work-detail.test.tsx`. No test at any other
seam — nothing else in the ticket's brief names one.

### Verify-live check (rule 3)

`gh issue view 1069 --json body,comments` returned the Agent Brief in the body, no comments, no
2026-09-20 owner-ruling comment. Confirmed the surface it names (`clara.get_work_claim_origin`,
`apps/web/components/work/work-detail.tsx`'s identity block) still had no `allocation_count`/count
field before I built — read directly off `packages/db/migrations/0221_staff_expense_claims.sql`'s
live `jsonb_build_object(...)` and off `work-detail.tsx`'s `origin.value` line. Not already
satisfied.

### AC1 — `clara.get_work_claim_origin` returns the number of allocations a claim's
advance-application arm carries (1 for a single-advance claim, matching row count for a
multi-advance one)

Migration `0341_work_claim_allocation_count.sql` recuts `clara.get_work_claim_origin(uuid)` at its
0221 pre-image (sha `d2b9f1d1a28136f59dff36870d2926d501e38c35c7726f190ea3bddea02e46f8`, measured on
this rig before writing) byte for byte plus one new key: `'allocation_count', (select count(*)::int
from clara.staff_expense_claim_allocations al where al.claim_id = sec.id)`. No `coalesce(...,1)` or
settlement branch — the migration's own header works through why none is needed: 0301's own §G
backfill gives every pre-0301 `advance_application` claim its one-row list unconditionally at 0301's
apply time; the admission door's §8a writes at least one row for every claim admitted after it
(`clara._claim_allocations`'s single-advance branch guarantees the legacy `advance_id`-only shape
still gets one row); and #1067 (0339) closed the one path that could have left a live claim with
zero rows (a present-but-empty `advance_allocations` array is now refused before admission). A
branch that can never be taken on a healthy database was not written.

**Evidence — DRIVEN, not read off the code**, in two independent places:

- The migration's own tail (`0341...sql`, `$p1069_tail$`, section T.2) builds a real client, chart,
  enrolment and three real advances, admits a reimbursement, a single-advance and a two-advance
  claim through the REAL door (`clara.admit_staff_expense_claim_work`, callable directly — its
  author is an explicit argument, not a JWT claim), and reads each back through the REAL recut
  door under a faked `request.jwt.claims` GUC (the same mechanism PostgREST sets;
  `clara._human_ctx` reads it). Result, printed by `pnpm db:migrate`:
  `#1069 tail OK: clara.get_work_claim_origin projects allocation_count, DRIVEN through the real
  door and the real read -- 0 for a reimbursement, 1 for a single-advance claim, 2 for a two-advance
  one, matching the register's own row count exactly; the rest of the envelope and the two neighbour
  bodies the new field leans on are unmoved.` Both the FIRST-APPLY branch (a true first apply, not
  simulated — the redo mode was not used until after this succeeded) and the `#957` REDO branch
  (`CLARA_MIGRATION_REDO=0341_work_claim_allocation_count`) were exercised for real; both printed
  `clean` and the same tail proof.
- `packages/db/tests/staff-expense-claim.test.mjs`, two new node-test cells:
  `p1069.origin allocation_count is 0 for a reimbursement and 1 for a single-advance claim` — PASS
  (a reimbursement claim reads `allocation_count: 0`; a single-advance claim built the legacy way,
  `advance_id` only, no `advance_allocations` key, reads `allocation_count: 1`).
  `p1069.origin allocation_count matches the register's own row count for a multi-advance claim` —
  PASS (a two-advance claim reads `allocation_count: 2`, and a second, independent read of
  `clara.staff_expense_claim_allocations`' own rows via `getStaffExpenseClaim` agrees exactly).
  Command: `node --test --test-concurrency=1 $GATES tests/staff-expense-claim.test.mjs` — **26
  tests, 26 pass, 0 fail, 0 skipped** (the two new cells plus the 24 pre-existing ones in this file,
  including the untouched `p638.origin` cell).

### AC2 — the Work list card renders that count when it is greater than 1 (a single-advance
claim's card is unchanged from today)

The ticket's "Work list card" is `work-detail.tsx`'s `PostedEntrySection` identity block, the ONE
site `clara.get_work_claim_origin` feeds (confirmed by grep: the Work LIST itself renders
`claim_id`/`claimant_label` from `clara.list_accounting_work`'s own projection, deliberately
WITHOUT a second per-row call to this door — 0266's own header states why; `get_work_claim_origin`
is the Work DETAIL's read). `apps/web/lib/work/staff-expense-claim-reads.ts`'s `WorkClaimOrigin`
type gained `allocation_count: number`; `work-detail.tsx` renders
`StaffExpenseClaim.origin.allocationCount` (`en.json`: `"settles {count, plural, one {# advance}
other {# advances}}"`, `data-testid="work-claim-allocation-count"`) beside the existing
claimant/settlement line ONLY when `allocation_count > 1`.

**Evidence**: `apps/web/components/work/work-detail.test.tsx`, two new cells —
`1069: a single-advance claim's card is unchanged from today — no allocation-count line` (mounts
with `allocation_count: 1`, asserts the base origin line renders and the allocation-count testid is
`null` — the card is byte-identical to before this ticket) and
`1069: a multi-advance claim's card names how many advances it settles` (mounts with
`allocation_count: 3`, asserts the text matches `/settles 3 advances/`). Both PASS. Full-file run:
`node --import ./test/bootstrap.mjs --import tsx --test components/work/work-detail.test.tsx` —
**57 tests, 57 pass, 0 fail** (the two new cells plus every pre-existing one in this file, including
the door-census cells that pin `get_work_claim_origin` is called exactly once per mount).

### AC3 — a test covers both a single-advance and a multi-advance claim's card rendering

Met by the two `work-detail.test.tsx` cells above (AC2's evidence) and the two db-level cells (AC1's
evidence) — four cells total, each driving a real single-advance and a real multi-advance shape at
its own layer.

### Deliberately left / not built

Nothing scoped by the ticket was left out. Out-of-scope items the brief itself names (no allocation
data-model change; no other Work list card kind) were not touched.

## Migration

`packages/db/migrations/0341_work_claim_allocation_count.sql` (assigned number). Recuts exactly one
body, `clara.get_work_claim_origin(uuid)`. Creates no relation, grants nothing, mints no new name —
no `rig-meta.mjs` cohort owed (stated in the file's own header, matching the 0274/0265 precedent).

**Prestate pins** (measured on `clara_l06`, chain `0001..0340`, moments before writing):
- Recut target: `clara.get_work_claim_origin(uuid)` = `d2b9f1d1a28136f59dff36870d2926d501e38c35c7726f190ea3bddea02e46f8` (0221's own body — no ticket between 0221 and 0340 recuts it).
- Neighbour reliance pins (not called by the recut body, but the invariant `allocation_count` leans on depends on them): `clara._claim_allocations(jsonb)` = `c303577a5c35d9f7c788edc4acded82fa64e7db414d4ee10a61a979ffa34b737`; `clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)` = `8ca64d40ff92d6dbc61f53d13269c5a80de39e892bedf5c6da54fd7827089ed2`. Both re-measured identical in the tail (T.3), after the recut.
- Structural: `clara.staff_expense_claim_allocations` exists with `claim_id` and the `uq_sec_allocations_claim_advance` unique constraint (so `count(*)` can never double-count one advance).

Post-image sha: `4c0dad6effd1883eaad3bbdff489fdcbf03e26228c80ea5e11a12b718c9771e4` (first apply);
redo re-applied it to `f7d1b9944349da60a0a8e9e8f7fd2418ace8fc2b08084cee0009578b280a99e2` (the
notice-text fix between the two applies changed the byte content of the comment, hence the
different post-image sha; the REDO branch and both tail proofs are otherwise identical).

**Applied with** `pnpm db:migrate` (real first apply, not simulated) and re-applied with the
supported redo mode, `CLARA_MIGRATION_REDO=0341_work_claim_allocation_count`, after a comment-only
edit to the prestate's own notice text — both runs green, both printed the tail's DRIVEN proof.
312 migrations total on this database afterward.

**Preintegration gate**: `packages/db/tests/work-claim-allocation-count-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_WORK_CLAIM_ALLOCATION_COUNT=1`), wired into `packages/db/package.json`'s
`test` script as the last `--import`, in migration order.

## Gates, with counts

- **DB test files touched, with the full gate chain** (128 `--import` flags, the exact list in
  `packages/db/package.json`'s `test` script):
  - `tests/staff-expense-claim.test.mjs` — **26 tests, 26 pass, 0 fail, 0 skipped**.
  - `tests/work-list.test.mjs` (not touched, but references `get_work_claim_origin`; ran for
    extra assurance) — **49 tests, 49 pass, 0 fail**.
  - `tests/firm-portfolio-pack.test.mjs` (not touched, same reason) — **17 tests, 17 pass, 0 fail**.
- **`operation-census.test.mjs`** — not strictly owed (no SQL function was ADDED, only recut in
  place at its existing signature/grants), run anyway for assurance: **10 tests, 10 pass, 0 fail**.
- **`rig-isolation.test.mjs`** — same, run without any reset flag: **23 tests, 22 pass, 1 skipped
  (T19, `CLARA_RIG_ALLOW_RESET`-gated, the documented always-skip on this rig), 0 fail**.
- **`pnpm typecheck`** — clean, `apps/web` and `packages/runtime` both `Done`, no errors.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** — clean across every workspace (`packages/db`,
  `apps/web`, `packages/runtime`, `packages/reporting-render`), including `apps/web`'s own selftest
  battery (`check-token-contrast`, `check-test-manifest` + selftest, `check-message-keys` +
  selftest, `check-ui-add-guard` selftest) and the repo-root eslint-config selftest.
- **`apps/web` touched → whole unit suite once**, `node scripts/run-tests.mjs`: **5194 tests, 5192
  pass, 0 fail, 2 skipped** (the two pre-existing `CLARA_LIVE_SUPABASE_AUTH_URL`-gated live-provider
  skips in `password-recovery`-adjacent tests — unrelated to this ticket, documented, environment-
  conditional).
- **Browser walk**: I did not edit an e2e spec file, so the letter of work-order rule 8 named none
  (the #1066 report for this same lane states the identical reasoning). Ran the one existing walk
  that exercises this exact surface anyway, on my own triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3550 CLARA_E2E_NEXT_PORT=3551
  CLARA_E2E_RUNTIME_PORT=3552 pnpm --filter @clara/web e2e staff-expense-claim-walk`): **14 passed,
  0 failed** — both before and after widening the mock's `get_work_claim_origin` handler to answer
  `allocation_count` (see below).
- **`packages/runtime` not touched** — `check-frozen-workflows.mjs` / `check-parts-parity.mjs` do
  not apply.

## Docs

- `packages/db/README.md` — new `## 0341` section (spec of record, what was live, the measurement
  and why no default branch is needed, what is pinned and why, the web half, redo/first-apply
  evidence with both post-image shas), in the commit `docs(db): #1069 the 0341 migration section`.
- `CONTEXT.md` — not touched. No new domain vocabulary: `allocation_count` is a projection of the
  existing "Allocation list" concept (CONTEXT.md line 839), not a new term. Matches the #1067/#1052
  precedent in this same lane (neither touched CONTEXT.md either).
- No web module README exists for `apps/web/components/work/` or `apps/web/lib/work/` (checked by
  grep across every `README.md` under `apps/web`) — nothing to update there.
- `apps/web/e2e/staff-expense-claim-mock.mjs`'s `get_work_claim_origin` handler was widened to
  answer `allocation_count` too (single-advance for the one HISTORY row that is `advance_application`,
  0 for every other settlement — the fixture carries no multi-advance row), so the mock stays an
  accurate mirror of the real door's contract rather than silently drifting from it.

## Successor contract

None. This ticket touches no frozen chat or Work tool: `clara.get_work_claim_origin` is a plain
viewer-floored PostgREST RPC called directly by the web app, not a door any `chatTurn`/`claraWork`
workflow version calls (grepped `packages/runtime/workflows/`; the one hit, `chatTurn.v20.tools.ts`,
only *mentions* the door's name in a comment explaining why a claim's purpose is `journal_entry`,
and calls nothing). Nothing here needs delivering as a successor contract.

## Follow-ups worth filing

None identified specific to this ticket. The ticket's own "Out of scope" line (no allocation
data-model change, no other Work list card kind) was respected.

## Anything unverified

- Hosted/production behaviour of the migration (this report covers the lane database only, per the
  work order's division of labour — the integrator runs the from-scratch and hosted proofs).
- I did not run the FULL `packages/db` test suite (100+ files, no rule requires it of a lane
  implementer); I ran the touched file plus the two other files that reference
  `clara.get_work_claim_origin` by name (found by grep, not by running everything), plus
  `operation-census`/`rig-isolation` for extra assurance beyond what was strictly owed.
