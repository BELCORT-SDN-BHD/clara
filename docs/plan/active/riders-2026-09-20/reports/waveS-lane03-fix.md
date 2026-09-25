# waveS-lane03 — fix round (single implementer, /implement-spec)

- **Branch** `riders/wS-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\656`, database `clara_l06` (127.0.0.1:55746).
- **Base** `7bc5a710f`. **Review head** `51c50bd88`. **New head `62e5837298e6a049b9920aaf3b64d691aabf8841`** (25 commits on the branch).
- **Reports answered**: `waveS-lane03-codereview-spec.json`, `waveS-lane03-codereview-standards.json`, `waveS-lane03-review-adversarial.json` — every finding of every severity, read in full.
- **Status request received mid-task**: none.

## Resume — what the killed worker had already landed, judged on its merits

An earlier fix worker on this lane was killed by a usage limit. `git status` at start showed **no
uncommitted tracked changes**: only eight untracked scratch helpers (`packages/db/zzz-dump.mjs`,
`zzz-q.mjs`, `zzz-live-law.txt`, and `zzz-patch3..7.py` at the worktree root). I read all eight.
`zzz-patch3..6.py` are exactly the four commits already on the branch (13:52–14:00), so they were
applied and committed; `zzz-patch7.py` (written 14:01, after the last commit) was the *start* of the
L03-SPEC-01 fix and had **not** been applied — `grep L03-SPEC-01 0341_…sql` returned 0. Nothing was
half-applied, so nothing had to be completed or reverted. The helpers were read and then deleted;
they are not deliverables. (`zzz-dump.mjs`/`zzz-q.mjs` were a pg dump/query pair; `zzz-live-law.txt`
was a `prosrc` dump of `clara.list_accounting_work` — the same body this round recuts, which is how
I knew where the killed worker had got to.)

Four fix-round commits were already on the branch and are **not** redone here. I verified each
against its finding by reading the diff and by re-running its cells (all green in the gates below):

| commit | answers |
|---|---|
| `42bc59c7e` fix(web) #1068 | **ADV-01 / L03-SPEC-02** and **ADV-02** |
| `35437a0ea` fix(web) #1052 | **ADV-03** |
| `5016b82a7` fix(web) #1066 | **ADV-04**, **ADV-05**, **L03-SPEC-03**, and the cell L03-SPEC-09 asked for |
| `62dfb9306` test(db) #1066 | **L03-SPEC-04** |

`zzz-patch7.py`'s approach to L03-SPEC-01 was sound and I reused its two byte-for-byte pre-image
extractions after re-verifying them myself; the prestate/tail/web halves below are my own.

## New commits this round

```
6dfb2292f  fix(db):   #1069 the count reaches the Work LIST, not only the Work detail
82223b81a  fix(web):  #1069 the Work LIST row names how many advances a claim settles
ddfd02b3a  docs(db):  #1067 T.6 is structurally unreachable, and the lane's statement_timeout decision
62e583729  style(web):#1069 a bare ticket reference trips the raw-colour selector
```

(The first of these was amended after the fact to drop three scratch files that a `git add -A`
swept in; the two commits above it were re-applied onto the amended commit, so the branch carries
no `zzz-*` file in any commit and `git ls-files | grep zzz` is empty.)

---

## Finding by finding

### L03-SPEC-01 — major — #1069's count renders on the Work DETAIL, not the Work LIST — **FIXED**

**Reproduced.** Ticket AC2 is "The Work list card renders that count when it is greater than 1" and
its stated value is *without opening the claim*. The first cut projected `allocation_count` on
`clara.get_work_claim_origin` (the detail read) alone. The Work list renders from
`clara.list_accounting_work`'s own projection, which carried no count — so a reviewer still had to
open the claim, the one thing the ticket asked to avoid. The issue carries zero comments, so no
owner ruling accepts the substitution, and I cannot obtain one (no GitHub writes in this lane).
The fix is therefore the reviewer's first option: carry the count into the list's own projection.

**Fixed — database (`6dfb2292f`).** 0341 is this lane's own **unmerged** migration, so it was edited
and re-applied the supported way rather than claiming a new number. It now recuts **three** bodies,
each at its true pre-image byte for byte plus the same one projected key:

| body | pre-image from | pre-image sha256 (measured live on `clara_l06`) |
|---|---|---|
| `clara.get_work_claim_origin(uuid)` | 0221 | `d2b9f1d1a28136f59dff36870d2926d501e38c35c7726f190ea3bddea02e46f8` (unchanged, already pinned) |
| `clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)` | 0267 | `dffa917db2180f5a13be48795ea823ef5cece813677d8d6ad6c61cf01726a828` |
| `clara.get_accounting_work_row(uuid)` | 0266 | `9979520fe0202141686d960c8dfa4ae8efd3ffb31f14aae787074218fbce0781` |

Both new pre-images were verified **byte for byte against the live `prosrc`** before use (the source
statement text lifted from 0267 lines 274–532 and 0266 lines 484–554 compared `=== true`, 13327 and
3369 characters), so the copy in 0341 is the pre-image and not a re-typing of it.

*Why the addressed row is not optional*: 0266's own comment calls `get_accounting_work_row` "ONE
Work in the SAME projection `clara.list_accounting_work` emits", `work-list.test.mjs`'s wl.13
asserts it, and `apps/web/lib/work/work-list.ts` types both doors' answers as one `WorkListRow`.
Widening the list alone would have made all three false and left a deep-linked claim silently
without its count.

*Why the INVOKER posture is safe*: both list doors are `SECURITY INVOKER` (the detail read is
DEFINER), so the new subquery is read by the signed-in role.
`clara.staff_expense_claim_allocations` is FORCE-RLS, `SELECT` is granted to `clara_authenticated`
alone, and its one read policy is `p_sec_allocations_read … for select to clara_authenticated using
(firm_id = clara.jwt_firm())` — all three re-measured on the rig before the file was written. A
caller can only ever count allocations of their own firm's claims.

New tail assertions:
- **T.1g/T.1h** — each list door exists exactly once at its unchanged signature, keeps owner
  `clara_fn_owner`, `not prosecdef`, `search_path=clara, pg_temp`, `plan_cache_mode=force_custom_plan`,
  PUBLIC-revoked / `clara_authenticated`-only (and not `clara_runtime` / `clara_agent_ro`), carries
  this file's marker and its projection, still carries `claimant_label`, still returns the
  `{rows, next_cursor, truncated}` envelope, and **reads the register exactly once** (the count is
  over `from clara.staff_expense_claim_allocations al`, because the prose above it names the
  register too — the first spelling of this assertion counted the word and failed, correctly).
- **T.2f/T.2g** — the two list doors are **DRIVEN as `clara_authenticated`** (`set_config('role', …)`
  inside the same rolled-back sub-transaction, under the probe's faked JWT), so the count is proved
  *through* RLS rather than around it: the page carries the three claims the probe admitted, every
  row carries the `allocation_count` key, the reimbursement reads 0, the single-advance claim 1, the
  two-advance claim 2, its `claim_id`/`claimant_label` are unmoved, and the addressed row answers
  the same 2 for the same Work.

**Re-applied** with `CLARA_MIGRATION_REDO=0341_work_claim_allocation_count` (the #957 path; ledger
checksum now `6fac2a872e965baa00215e5fd304ea937c4eab89e3698a413e1183524bb6741f`, 312 files, max
`0341`). Post-image shas: detail `4c0dad6e…`, list `fc679a2d4d96341d664d881b9e43da54ed1d8d2e5fe04f4ca45351ff7dbf8dbc`,
addressed row `28aba20bdb39b0f6f5deb2ddf24937f1fa847c0b1128c3d6a4eeaae08781713e`.

**The FIRST-APPLY branch of the two new pins was proved by hand** (wave-3 addendum: a redo can only
ever take the marker branch). Inside one transaction that was rolled back, 0267's and 0266's own
`create or replace` statements were re-run to restore the pre-images (marker position 0 on both,
printed), the `$p1069_pre$` block was run verbatim and **passed**, and the rollback put the
post-images back. A **negative control** drifted `get_accounting_work_row`'s pre-image by one
comment and the prestate refused it: `CLR10 … has DRIFTED from its pinned pre-image (measured
3c4b104d…, expected 9979520f…)`.

**Fixed — web (`82223b81a`).** `WorkListRow` gains `allocation_count: number | null`, and
`workRowClaimLabel` — the one decision behind both the `md:hidden` compact line and the
always-visible desktop line, so they cannot drift — names the count when it is greater than 1
(`WorkList.claimLabelWithCount`, an ICU plural). The ticket's own threshold is preserved exactly: a
single-advance claim (1), a reimbursement (0), a row from a door below the 0341 frontier (`null`)
and a wire answer that omits the key are all byte-identical to what #880 shipped, and `claim_id`
still decides what is a claim.

**Evidence.**
- `packages/db/tests/work-list.test.mjs` — new cell **wl.33** ("a claim row carries how many
  advances it discharges, on the page and on the addressed row"), with its own frontier gate on the
  `work_claim_allocation_count$` stem in the file's existing three-gate idiom. It seeds two real
  advances through the estate's own disbursement doors, admits a two-advance claim, a reimbursement
  claim and a plain journal Work onto **one page**, reads the expected count **off the register
  itself** (`select count(*) … where claim_id = $1` as root), and asserts 2 / 0 / `null` on the list
  and 2 / `null` on the addressed row. **Seen red first** for the right reason
  (`undefined !== 2` — the list row had no such field), green after the redo.
- `apps/web/components/work/accounting-work-list.test.tsx` — two new branch cells at the function
  boundary (3 → names it; 1, 0, `null`, absent and non-claim → unchanged; the first was **seen red**
  as `'…Farah binti Idris' !== '…Farah binti Idris (settles 3 advances)'`), plus one **mounted** cell
  through the project's own `en.json` so the ICU plural, the key name and the wiring onto *both*
  lines are proved together, with a three-advance and a one-advance claim on the same page. Vacuity
  control: with the threshold deliberately broken to `> 5` the mounted cell failed; the subject was
  restored byte for byte (`git diff` shows only the intended change).

**Not done, deliberately**: no e2e mock was widened. `staff-expense-claim-mock.mjs` states in its own
header that it answers `list_accounting_work` *for no one*, and `work-list-mock.mjs` — the module
that does answer it — emits no row with `claim_id` set, so no list mock has a claim row for a count
to hang off. Adding the key to rows that are not claims would render nothing and assert nothing.
Worth a follow-up if anyone wants a claim row on the Work-list walk (it has been absent since #880).

### L03-SPEC-02 / ADV-01 — major — the empty-state focus target is a DISABLED button — **FIXED** (`42bc59c7e`, already on the branch)

`disabled` no longer follows `candidates.length === 0` when a caller *addresses* the empty state by
field id (`addressesEmptyState = allocations.length === 0 && rowProps !== undefined`); a caller that
addresses nothing — the staff-advance register's own dialog — keeps the old disabled button. The
cells now assert the target is **not disabled** *and* is in `focusableElements(h.container)`, so the
harness's `.focus()` stub can no longer hide a disabled target, plus a third cell pinning the
register's untouched path. Re-verified green in the whole-suite run and in the
`staff-advances-register-walk` (4/4).

### ADV-02 — major — the button inherited the field's `<Label htmlFor>` name — **FIXED** (`42bc59c7e`)

`emptyStateProps` now carries `aria-label={t("addAllocation")}`, which outranks a native label, and
two cells assert the name is present when addressed and **absent** when not.

### ADV-03 — major — the chooser offered an advance the door refuses `not_this_claimant` — **FIXED** (`35437a0ea`)

`enrolment_active` now guards **both** arms of `advanceCandidates`, because the wall tests the
*advance's own enrolment*, never its account code. The account-code arm stays an account-code arm,
so a form whose enrolment register could not be read still offers the claimant's own advances;
only the retired generation leaves. #1052's positive attribution cell moved onto a candidate the
door admits, and the retired generation has its own refusal cell.

### L03-SPEC-03 — major — #1066 silently overrode the preparer's Advance-account field — **FIXED** (`5016b82a7`)

The claim form now renders a reconciling line under the Advance-account picker,
`StaffExpenseClaim.advanceAccountCodeFollowsHead` — "This claim will credit {account}, the account
the first confirmed advance sits on." — `data-testid="advance-account-follows-head"`, derived from
the same `claimAdvanceAccountCode` reader the wire uses and `null` whenever the two agree (every
single-account claim, i.e. every claim before #1066). A mounted cell asserts nothing is said while
the head sits on the typed account and that the line names 1191 once a second-account advance is
confirmed as the head.

### L03-SPEC-04 — minor — the cross-account HEAD shape was never driven through the real door — **FIXED** (`62dfb9306`)

`packages/db/tests/staff-expense-claim-allocations.test.mjs` gains **p1066.head**, which posts the
exact `toClaimWire` shape (bare head row on the second account, `advance_account_code` following the
head, the non-head row stating its own account) and asserts both credit legs, each allocation keyed
to the leg on its own advance account, both outstanding balances and the stored
`advance_account_code`. Green in the 79-cell db run.

### ADV-04 / ADV-05 — minor — validate-one-thing-send-another; an unbalanced preview — **FIXED** (`5016b82a7`)

One reader, `claimAdvanceAccountCode`, now answers "which account does this claim credit" for
validation, preview and wire alike, so the chart check asks about the account that will actually be
sent. And `derivedLines` previews the per-account split **only when the confirmed list adds up**;
until then it renders the one balanced leg exactly as before, so no journal that cannot exist is
ever shown beside the `allocationsNotExact` message. Cells `head.account` and `preview.balance` pin
both — `preview.balance` is also the cell L03-SPEC-09 asked for.

### L03-SPEC-05 — minor — #1066 AC2's second branch is a silent omission — **STAYS, with reason**

The reviewer's own required fix offers two routes: record on the issue that the accept branch was
taken, or add a preparer-facing signal beside the chooser. I cannot write to GitHub from this lane,
and **I argue against the signal on its merits**, so this is a deliberate residue rather than an
omission — the orchestrator can carry the paragraph below onto #1066.

A chooser-side note would have to be built from "an outstanding advance on another enrolled account
whose label does not match the claimant's after `lower(btrim())`". That predicate cannot tell *the
same person spelled differently* from *a different person altogether* — which is precisely why the
door answers the flat ownership refusal, and precisely what #1049 (staff master, re-parented to the
mainline by the 2026-09-25 ruling) exists to fix. Rendering it as "held under a different name"
would state as a labelling issue something the system does not know to be one, and would surface the
existence of another person's advance to a preparer who has no business seeing it. The honest state
today is: the accept branch (case and surrounding whitespace, #1052/0340) is built and proved; any
wider label difference stays a flat refusal until a person record exists. #1066's own report should
read "the accept branch was taken" rather than the blanket "already satisfied by #1052".

### ADV-06 — note — 0339 tail T.6 is a dead branch — **RECORDED, with the claim independently reproduced**

Confirmed by reading both bodies out of `pg_proc` on the lane database:
`clara._claim_basis_canonical` appends `advance_allocations` only under
`case when jsonb_array_length(clara._claim_allocations(p_claim)) >= 2`, and `clara._claim_allocations`
turns a present-but-empty array into the one-element `advance_id` shape. T.6's count is therefore
structurally 0 on every database, hosted included, and the wave-3 "a data-dependent branch must be
entered once" rule cannot be met for it.

It is **said out loud** in `packages/db/README.md`'s own 0339 section (`ddfd02b3a`) rather than
dropped, because dropping it is not free: 0339 is applied on every lane rig,
`CLARA_MIGRATION_REDO` refuses anything below the highest applied version (0341 here, verified in
`scripts/migrate.mjs`), and editing 0339's bytes would abort every later `migrate` on those
databases with checksum drift — a disproportionate price for deleting an assertion that costs one
sequential scan and can only ever pass. The real guard for the `>= 2` rule is the `sha256(prosrc)`
pin on `clara._claim_basis_canonical` in the same tail, and that is live.

### ADV-07 — note — 0339/0340 omit the `set local statement_timeout` 0341 calls "the runner rule" — **DECIDED and RECORDED**

Recorded in the same README section: **setting it is the better default** (a long `create or
replace` on a loaded hosted database should not inherit an unbounded timeout), and it is a note for
the next migration this family writes, not an edit to an applied file — the reviewer's own
preferred route. Both 0339 and 0340 are single `create or replace function` statements, so the
practical exposure is nil either way.

### Standards, minor — #1069's ticket report omits the rule-(d) pins-corpus gate — **RUN AND RECORDED HERE**

`apps/web/tests/firm-scope-db-pins.test.ts` re-run on the **widened** 0341: **22 pass, 0 fail**, no
corpus edit owed. (`MIGRATION_FILES` is read from disk, and 0341 uses no `EXECUTE` /
`pg_get_functiondef`, so no `REVIEWED_DYNAMIC_SQL_BARRIERS` entry is owed either.) The ticket
reports in the main checkout are not mine to edit under this lane's write rule, so the evidence
lives here; the integrator can fold it into `waveS-lane03-ticket1069.md`.

### L03-SPEC-06, L03-SPEC-07, L03-SPEC-08 — notes — no action, as the reviewer states

Each is a recorded residue or an observation for the integrator, not a required change. L03-SPEC-08
in particular ("#1052's AC2 became true only once #1066 widened the filter") is now doubly true: the
ADV-03 fix moved #1052's positive cell onto a candidate the door admits, so a revert of #1066 would
take #1052's AC2 with it.

---

## Gates (with counts), re-run at `62e583729`

| gate | result |
|---|---|
| `packages/db` — `work-list.test.mjs` + `staff-expense-claim.test.mjs` + `staff-expense-claim-allocations.test.mjs`, full `$GATES` chain (128 `--import` flags) | **79 pass, 0 fail, 0 skipped** |
| `packages/db` — `operation-census.test.mjs` + `rig-isolation.test.mjs`, same chain | **32 pass, 0 fail, 1 skipped** (T19 poison-role, the destructive arm RIG.md forbids) |
| `packages/db` — migration chain | `migrate` redo green; ledger 312 files, max `0341`, checksum `6fac2a87…` |
| `apps/web` — whole unit suite (`node scripts/run-tests.mjs`) | **5204 tests, 5202 pass, 0 fail, 2 skipped** |
| `apps/web` — `tests/firm-scope-db-pins.test.ts` (sweep rule (d)) | **22 pass, 0 fail** |
| `pnpm typecheck` (root) | **Done** — `apps/web` and `packages/runtime` both clean |
| `CI=true GITHUB_ACTIONS=true pnpm -r --if-present lint` + `packages/reporting-render` | **clean** (one real error found and fixed: `62e583729`) |
| root lint scripts (17 of the 18 in the chain) + `eslint scripts eslint.config.mjs` | **all OK** |
| e2e `work-list-walk` (triple 3550/3551/3552) | **18 passed** |
| e2e `staff-expense-claim-walk` | **14 passed** |
| e2e `staff-advances-register-walk` | **4 passed** |

**One gate fails, and it is base drift, not this lane.** `node scripts/check-frozen-workflows.mjs`
(the first step of `pnpm lint`) reports 28 violations — 25 `REMOVED-VS-BASE` for
`chatTurn.v22.*`, `claraWork.v6.*`, `statementFacts.v4.*` and six `packages/runtime/lib/*` files,
plus 3 `REGISTRY-DOWNGRADE`. It diffs against `origin/main`, which has advanced to `061a6992b`
(PR #1140, the unrelated riders-cut integration merge) since this lane's base. Verified, not
assumed: `git diff --name-only 7bc5a710f..HEAD | grep -c packages/runtime` → **0**;
`git merge-base --is-ancestor 7bc5a710f origin/main` → true;
`git cat-file -e origin/main:packages/runtime/workflows/chatTurn.v22.ts` → present, and the same
path at `7bc5a710f` → **absent**. Every other step of the chain was run individually and passes.
This is the same environmental failure the standards reviewer recorded; it clears when the lane is
integrated onto current `main`.

**The one real lint error** was mine: `"#1069"` inside a test assertion message is four hex-looking
characters after a hash, which trips the repo's raw-colour `no-restricted-syntax` selector (owner
ruling Q4, 2026-08-27). Its own stated fix is to reword the string, which is what `62e583729` does;
the rule is untouched. It is only reachable through `CI=true GITHUB_ACTIONS=true pnpm lint`, which
is why the work order's wave-3 addendum asks for that run.

## Shared files touched, and how

- `apps/web/messages/en.json` — **one** key, `WorkList.claimLabelWithCount`, inserted immediately
  after `WorkList.claimLabel`. The `WorkList` section is *not* alphabetically sorted (it runs
  `heading, loading, refreshing, rowCount, …`), so "the sorted position" is the position beside the
  key it extends; the file was not re-serialised, and `check-message-keys.mjs` passes.
- `packages/db/README.md` — this lane's **own** `## 0339` and `## 0341` sections only; no existing
  section from another ticket was edited.
- `packages/db/package.json`, `apps/web/test/manifest.txt`, `packages/db/tests/rig-meta.mjs`,
  `apps/web/tests/firm-scope-db-pins.corpus.ts` — **untouched this round**. No new test file and no
  new migration was created (wl.33 and the web cells extend files that already exist; 0341 is this
  lane's own unmerged file, re-applied by redo), and 0341 still mints no new name.
- No `packages/runtime` file, no frozen workflow, no `docs/PRD.md`, no `docs/ARCHITECTURE.md`, no
  applied (pre-0339) migration.

## Unverified / for the integrator

1. **A true from-scratch `0001 → 0341` chain** is the integrator's proof, not run here (RIG.md
   forbids a second from-scratch chain on a lane cluster). The new prestate pins are the risk
   surface, and their first-apply branch was proved by hand as described above.
2. **Cross-lane pin check.** 0341 now pins `clara.list_accounting_work` and
   `clara.get_accounting_work_row`. `SWEEP-PLAN.md` names neither body for any lane (its named
   must-not-pin seams are L1's plan cores and L2's schedule cores), so these should be collision
   free — but I can only read the plan, not the other lanes' branches. If another lane recuts either
   door, 0341's 0.2b pins are what will say so, loudly, at integration.
3. **Windows-only reds**: none encountered. The two whole-suite skips and the one db skip are the
   documented ones.
4. **Follow-up worth filing**: no e2e list mock emits a claim row, so no browser walk renders the
   claim label *or* the new count on the Work list. That gap predates this ticket (#880 shipped the
   label the same way) and is recorded rather than widened here.
