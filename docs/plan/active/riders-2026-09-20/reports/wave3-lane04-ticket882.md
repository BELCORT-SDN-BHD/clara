# Wave 3 · Lane 04 · Ticket #882

Fixed assets (2/2, half b only): the belt (`clara._tf_fa_movement_belt`) and the birth trigger
(`clara._tf_fa_acquisition_birth`) read an enrolled account's enrolment window with two DIFFERENT
signals, and disagree at exactly one instant — an entry approved in the SAME transaction that
retires its cost account's profile. Half (a) (the commit-time CLR40 `fa_cost_adjustment_deferred`
refusal settling `refused`/`recoverable: true` in `claraWork_v5`) already shipped in PR #954
(`ede1df83`, wave-2 rider #882(a) inside ticket #658) — verified still live on this branch before
building (below). This ticket is half (b) only, per the owner's 2026-09-18 ruling on this same
issue: **no trigger change.** The instant stays refused; what was owed was the pin (a cell driving
it from scratch) and the documentation (both trigger bodies gain a `comment on function` stating
the convention).

Branch: `riders/w3-lane04` (worktree `C:\Users\zhant\Desktop\clara-wt\651`), base
`ffe63a0dd084e99b84c1368119845be273c421ce`. #932 (this lane's first ticket) had already landed six
commits and applied migration 0277 before I started — confirmed by `git status` (clean) and
`git log --oneline ffe63a0dd084e99b84c1368119845be273c421ce..HEAD` (six `#932` commits, no
uncommitted changes) as my first action. The "implementer cut off by a usage limit" note in my
brief describes an EARLIER attempt at #932, already resolved and committed by the time I started;
there was nothing uncommitted for me to judge.

Commits (in order, both mine):

- `37d2ead95` `test(db): #882 pin the same-transaction retire-and-approve refusal, from scratch`
- `06ca88229` `docs(db): #882 the belt/birth convention, in the catalog (migration 0278)`

## The ticket is the contract — verified live on this branch

`gh issue view 882 --comments` (3 comments, newest first): (1) the Agent Brief (`ready-for-human`
for half b); (2) the owner ruling, 2026-09-18: "no trigger change… Pin it instead: a cell drives a
retire and an approve inside one transaction and asserts CLR40; both trigger bodies gain a comment
stating the convention"; (3) the newest, post-PR-#954 status: half (a) landed, half (b)'s remaining
scope is exactly those two things, and it names where to ride the migration — "#932's migration
(open, same fixed-asset acquisition and policy family)". Checked against what actually landed:
`packages/runtime/workflows/claraWork.v5.errors.ts:87` carries the `["CLR40",
FA_COST_ADJUSTMENT_DEFERRED, "refusal"]` row (half a, confirmed present on this branch/worktree —
I did not touch `packages/runtime` at all). #932's own migration (0277, applied on this database)
recuts `clara._tf_fa_acquisition_birth` but does **not** add the convention comment the ticket
wants — checked by grep before writing anything (`grep -n "comment on function" 0277*.sql`; 0277's
one `comment on function clara._tf_fa_acquisition_birth()` documents ONLY #932's own policy feature,
never the belt-vs-birth temporal convention). **#932's migration did not already carry what half
(b) needs, so I used my own migration (0278) and say so, per the brief's own instruction.**

## Seams this ticket's brief names (written down before touching anything)

- `p639.settle.clr40_classification` (already re-pointed by half a — not touched by me).
- A NEW cell: an entry approved in the same transaction that retires its enrolled account's
  profile, asserting the single agreed outcome (CLR40 `fa_belt_unregistered_movement`).
- The migration's tail re-pins both trigger bodies.
- `clara._tf_fa_movement_belt` (0041) and `clara._tf_fa_acquisition_birth` (0216/0247/0277) each
  gain a `comment on function`.

## Acceptance criteria, with evidence

**AC (from the Agent Brief) — `p639.settle.clr40_classification` re-pointed and green.** Already
done by half (a) (PR #954); unchanged by me. Re-ran it as part of the full file: **pass**
(`packages/db/tests/fixed-asset-acquisition.test.mjs`, `p639.settle.clr40_classification`).

**AC — a cell proves `fa_belt_unregistered_movement` still settles `failed`/`internal`.** Owned by
half (a)'s own runtime cell (`packages/runtime/tests/clara-work-v5.test.mjs:420`, unchanged),
outside my scope (I did not touch `packages/runtime`).

**AC — a cell approves an entry against an enrolled account in the same transaction that retires
the profile, and asserts the single agreed outcome from both guards, from scratch.** New cell
`p639.belt.same_txn_retire_approve` (`packages/db/tests/fixed-asset-acquisition.test.mjs:617`).
Drives the PRODUCTION Work lane (`clara.wake_record_journal_entry` — the only lane 0216's deferred
birth trigger exists for; the document lane's `approve_entry` calls `clara._fa_on_approve`
synchronously and would have already birthed the row before the retire even ran) through a
hand-opened transaction that ALSO calls `clara.retire_fa_account_profile`, both over the SAME
connection so `now()` is transaction-constant and `retired_at` lands exactly equal to
`approved_at`. New fixture `sameTxnRetireAndApprove`
(`packages/db/tests/fixed-asset-acquisition-fixtures.mjs`), mirroring
`journal-work-evidence-fixtures.mjs`'s `recordJournalEntryOn`/`raceEnter` idiom for the identical
reason: `armedAcquisition`/`postAcquisition` and `retireFaProfile` each own and commit their own
pooled connection, so composing them cannot share one transaction.

Result: `err.code === "CLR40"`, `reasonToken(err) === "fa_belt_unregistered_movement"`; the WHOLE
transaction rolled back — `entryCountOf`/`committedReceiptCountOf`/`assetCountOf` all unchanged,
and the profile itself is untouched (still exactly one active row, the SAME `id` as before —
`profileRows(client)`). This proves the mechanism the ticket triaged: the birth trigger
(`t_je_fa_acquisition_birth`, fires first — `p639.birth.fire_order`, unchanged, still pins this
order) reads `fp.active` at commit and declines to register the row (the retire already flipped it
false, same transaction); the belt then finds no register act, its own closed interval still
matching at the equality instant, and refuses. **Pass**, run from a clean, fresh client every time
(no shared state with any other cell).

**AC — the migration's tail re-pins both trigger bodies.** `packages/db/migrations/0278_fa_belt_birth_convention.sql` §C: re-reads `prosrc` sha256 for both `clara._tf_fa_movement_belt` and
`clara._tf_fa_acquisition_birth` and asserts them EQUAL to the prestate's pinned values (neither
body is recut — this is a comment-only migration). **Pass at apply time** (migration applied
cleanly on `clara_l04`, `applied 0278_fa_belt_birth_convention · backend pid 624224`, `269 total`).

**AC — both trigger bodies gain a comment stating the convention.** `clara._tf_fa_movement_belt`
gets its FIRST-EVER catalog comment (states its own closed `approved_at` interval design AND names
the birth trigger's differing `fp.active` signal). `clara._tf_fa_acquisition_birth`'s comment is
ACCRETED, never rewritten — the migration's literal opens with 0277's own text copied VERBATIM
from `0277_fa_default_depreciation_policy.sql:601-609` (never retyped from a printed value), and
both the migration's own tail AND the independent test cell `p639.belt.convention_comment`
(`packages/db/tests/fixed-asset-acquisition.test.mjs:721`) hash the first 842 characters (0277's
own measured `comment_len`) against 0277's measured pre-image sha256
(`831df896cf2f76bb82e5378d1e2664b4d79056997d33aa0fe1712b9c44acb67c`) to prove the prefix is
byte-exact, and confirm the three earlier provenance markers (`#639`, `#972 (0247)`, `#932 (0277)`)
survived. **Pass**, plus a genuine red-then-green vacuity demonstration (below).

## Vacuity control

`p639.belt.convention_comment`'s whole deliverable is a documentation fact, so per work order
rule 4 I drove it against a deliberately broken subject once: captured the live (correct) comment
text for both functions, set the belt's comment to `NULL` and the birth's comment back to 0277's
own pre-image text (both via a throwaway script, `set role clara_fn_owner; comment on function …`),
ran `p639.belt.convention_comment` alone (`--test-name-pattern`) — **failed** for the right reason
(`convention_comment: the belt carries a catalog comment`, `expected: true, actual: null`) — then
restored BOTH comments from the exact captured text and verified the restoration byte-identical
(`sha256` compared against the pre-break capture, both matched) and `prosrc` still pinned at the
same two sha256 values throughout. Re-ran the whole file after restoring: 25/25 green.
`p639.belt.same_txn_retire_approve` pins pre-existing production behaviour (unaffected by 0278);
its positive control is the ALREADY-EXISTING `p639.birth.work_lane` cell in the same file, which
proves the identical door (`wake_record_journal_entry`) succeeds and births a row when nothing
retires the profile — so the new cell's refusal is demonstrably caused by the retirement, not by
an unrelated defect in the harness.

## Migration

`packages/db/migrations/0278_fa_belt_birth_convention.sql`. Comment-only: two
`comment on function` statements, no row moved, no function minted, no new grant. Prestate pins
(measured on `clara_l04`, moments before the file was written, never transcribed from an older
migration's header):

- `clara._tf_fa_movement_belt()` `prosrc` sha256 =
  `be97ea51a8db4d69a32da6986a1f0ab7b136c7dc8432913fe783354a3e4c8b5a`; comment `NULL`.
- `clara._tf_fa_acquisition_birth()` `prosrc` sha256 =
  `c2c62b2997a6dd9a1202e509954b6f1b311ab5c704064b9a71d806e8fb456c50`; comment sha256 =
  `831df896cf2f76bb82e5378d1e2664b4d79056997d33aa0fe1712b9c44acb67c` (0277's own text, 842 chars).
- ACL for both, unmoved and re-checked in the tail: `{clara_fn_owner=X/clara_fn_owner}`.

Both are SINGLE-valued pins (never bimodal) because this file recuts neither body on ANY path —
first apply or redo, the executable text is the one same value. The prestate's comment checks ARE
bimodal (accept the pre-#882 state or this file's own already-applied text, marker-tested via
`position('#882 (0278)' in …)`), per house convention for a redo-tolerant prestate. **This run was
a genuine FIRST APPLY** — 0278 carried no prior row in `clara.schema_migrations` before this
session, and `migrate.mjs`'s own output confirms one new migration applied, 269 total — so the
prestate's first-apply branch was exercised directly by the real run, not merely asserted; no
`CLARA_MIGRATION_REDO` was used at any point and no separate rollback-and-restore probe is owed
(riders wave-3 addendum on bimodal pins). Applied cleanly:
`applied 0278_fa_belt_birth_convention · backend pid 624224`, `migrate: 1 new migration(s)
applied · 269 total · target 127.0.0.1:55744/clara_l04`.

House shape: header (why a new file, why comment-only, why the accretion is provably byte-exact,
why no rig-meta cohort is owed), prestate, the change (§B.1 belt, §B.2 birth), tail assertions
(§C — body-unchanged, comment-content markers, the accreted prefix hash, the ACL), a
preintegration gate module with a stable stem
(`tests/fa-belt-birth-convention-preintegration-gate.mjs`, stem `fa_belt_birth_convention$`), and
its `--import` entry appended last in `packages/db/package.json`'s gate chain (after 0277's, in
migration order). **No rig-meta cohort**: no new function is minted and neither body's grant moves
— the same finding this package's own README already records for 0265 (#839) and 0266 (#880)'s
comment/projection-only migrations; I checked `tests/rig-meta.mjs` for an FA-family cohort near
0277's and confirmed it lists only #932's two NEW doors, nothing this file would need to add to.

## Gates, with counts

- `packages/db`, focused, full gate chain (`node --test --test-concurrency=1 $GATES
  tests/fixed-asset-acquisition.test.mjs tests/operation-census.test.mjs
  tests/rig-isolation.test.mjs`, `$GATES` = the 86 `--import` flags in
  `packages/db/package.json`'s `test` script, post-0278): **58 tests total, 57 pass, 1 skipped, 0
  fail.** Breakdown: `fixed-asset-acquisition.test.mjs` **25/25**; `operation-census.test.mjs`
  **10/10**; `rig-isolation.test.mjs` **22 pass, 1 skipped** (`T19` poison-role — the known,
  intentional destructive skip RIG.md names; no reset flags were ever set).
- `pnpm typecheck` (repo root): clean, exit 0 (`apps/web`, `packages/runtime` — `packages/db` has
  no typecheck script).
- `pnpm lint` (repo root): clean, exit 0 — `apps/web`, `packages/db`, `packages/runtime` and
  `packages/reporting-render` all `Done`, `check-frozen-workflows.mjs` reports `OK` (nothing frozen
  touched).
- `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, as the runner sees it): clean, exit 0.
- `packages/runtime` and `apps/web` were not touched by this ticket: `check-frozen-workflows.mjs` /
  `check-parts-parity.mjs` and the web unit suite / Playwright triple do not apply.

## Docs

- `packages/db/README.md` — new `## 0278` section (the established per-migration shape: what it
  does, the owner ruling restated, the byte-exact-accretion proof, the "no cohort owed" finding,
  the redo-safety shape, the frontier gate and the two cells it gates).
- `CONTEXT.md` — **not touched.** This ticket introduces no new domain/product vocabulary; the
  belt/birth convention is an internal SQL-catalog documentation fact about two already-defined
  triggers, not a term an accountant or a reader of the shared glossary would look up. (`Fixed
  asset acquisition`, `Pending particulars` and the other fixed-asset terms already there fully
  cover the concepts this ticket touches.)

## Successor contract

None. Neither trigger is `clara_runtime`-callable or reachable by any door at all (both are
`revoke all … from public`, fired only by the trigger mechanism); this ticket adds no new
capability, only catalog documentation on two existing, ungranted bodies. Nothing here is a frozen
chat or Work-tool capability, so no successor contract is owed.

## Follow-ups worth filing

- None new. The ticket's own remaining-scope list (the pin cell + the two comments) is now fully
  closed; no gap surfaced during the work that isn't already covered by an existing ticket.

## Anything unverified

- I did not independently re-derive `clara._fa_lock_roles`' own lock ordering or
  `retire_fa_account_profile`'s internal `_human_ctx` floor from first principles beyond running
  it — I relied on the door behaving as `x41-belt.test.mjs`'s own existing cells already prove it
  does (bookkeeper-floored, version-forwards the profile) rather than re-proving that door's own
  contract here, since it is out of this ticket's scope.
- Hosted-only states (a real firm's data, or a genuinely concurrent two-connection race hitting
  this exact instant) are out of scope for a lane database and were not exercised; only the seeded
  `clara_l04` rig was used throughout, and the owner ruling itself states the instant is reachable
  by no production door today, so no hosted state could exhibit it either.
- I did not drive the `#957` redo branch on this rig (0278 needed no edit after it was first
  written and applied cleanly, and no `CLARA_MIGRATION_REDO` was used at any point in this
  session), so only the FIRST-APPLY branch is directly proven here; the REDO branch's marker logic
  (`position('#882 (0278)' in …)`) is exercised only by construction/inspection, not by an actual
  redo run on this lane.
