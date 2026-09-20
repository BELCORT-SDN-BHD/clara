# wave 1 · lane 03 — /code-review fix round

**Branch** `riders/w1-lane03` · **worktree** `C:\Users\zhant\Desktop\clara-wt\642` · **tickets** #844, #845, #884
**Reviewed head** `efdea055` · **new head at the time of the three round-2 commits** `4fcb2d15` · **current head** `2cd327f4`
**Fixed point** `origin/main dd3f8f1d`
**Database** `clara_l03` @ 127.0.0.1:55743 (`PGUSER=postgres CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`)

## Process note — why this file is dated after its own commits

The fix worker that produced `b662ed6b`, `ae2dc311` and `4fcb2d15` was killed by a usage limit
before writing this report, even though all three commit messages, the `os.VACUITY CONTROL`
comment added to `reset-gate-routing.test.mjs`, and `wave1-lane03-final.md`'s amended `#845` row
all cite `wave1-lane03-codereview-fix.md` as the transcript of record. The independent recheck
(`wave1-lane03-codereview-recheck.json`, verdict **accept**) already re-derived every finding below
directly from the three commits' actual diff hunks — not from the commit messages alone — and
re-ran the affected suites itself, so nothing here is taken on the missing file's word; this report
reconstructs the same transcript from `git log`, the commit bodies, and the diffs, and cites the
recheck as independent confirmation throughout. One item the recheck found **still open**
(STD-4) is closed in this same session, in a fourth commit (`2cd327f4`) that this fix-round worker
added after the recheck; it is reported alongside the original three for completeness.

## Commits

| commit | ticket(s) | finding(s) addressed | what it does |
|---|---|---|---|
| `b662ed6b` | #844 | L03-CRS1 (major), STD-2 (minor) | adds a structural pin on the deployed function body next to the existing reversal check; extracts `withSessionStampDisabled()` and re-exports `forceOpenedAt` from `checkout-convergence-fixtures.mjs` |
| `ae2dc311` | #884 | L03-CRS5 (minor), STD-1 (minor) | pins `beforeAssets` to the literal `0`; extracts `freshEnrolledFaClient(label)` in `x41-fa-world.mjs` and has both `kSeededFaClient` and the new cell call it |
| `4fcb2d15` | #845 | L03-CRS2, L03-CRS3, L03-CRS4 (all minor), STD-3 (minor, declined) | widens `RESET_IMPORT_RE` to also match a static `from "…/scripts/reset.mjs"` import; converts cell 1 to a superset check; corrects the file header, `README.md`, and `wave1-lane03-final.md` to state acceptance 3 as PARTIAL; declines the STD-3 refactor with a recorded reason |
| `2cd327f4` | #844 | STD-4 (note) | this fix-round worker's own commit, added after the recheck flagged STD-4 as still open: backtick-wraps the `os.19` heading qualifier in `packages/db/tests/README.md` to match the file's own convention |

Diff of the three round-2 commits against the reviewed head (`efdea055..4fcb2d15`):
`packages/db/tests/{README.md, checkout-convergence-fixtures.mjs, fixed-asset-acquisition.test.mjs,
operator-support-fixtures.mjs, operator-support.test.mjs, reset-gate-routing.test.mjs,
x41-fa-world.mjs}` — 7 files, 191 insertions, 94 deletions. `2cd327f4` adds one further
insertion/deletion pair to `README.md`. No migration, no frozen-workflow file, no PRD/ARCHITECTURE
edit, nothing outside `packages/db/tests`.

---

## SPEC axis (`wave1-lane03-codereview-spec.json`, head `efdea055`, verdict `accept-with-fixes`)

### L03-CRS1 (major, #844) — os.19 did not fail when the id key was removed · FIXED

The original acceptance-#3 proof ran two hand-written companion `SELECT`s that still compare on
`id` either way (a reversal, not a removal, check); measured on `clara_l03`, deleting `i.id desc`
from a copy of the predicate still named the shipped predicate's winner in 6 of 10 tied worlds — a
~60% accidental pass rate for the exact defect the ticket names ("removing it would stay green").

**Fix (`b662ed6b`):** adds a second, structural half to the same acceptance-#3 block: asserts the
live, lower-cased, whitespace-stripped `clara._operator_support_cases` source (via
`normalizedBody(SHARED_SIG)`, the file's own pre-existing os.11 census idiom) still contains the
exact `order by (i.status in ('paid', 'consumed')) desc, i.opened_at desc, i.id desc` tail. A recut
that drops the key now fails by construction; the reversal check is kept as a paired proof of
DIRECTION, not replaced.

**Confirmed by the recheck:** "a proof strengthened, not a cell added or removed" —
`tests/operator-support.test.mjs` stayed at 20/20 across the change. Re-run in this session as
part of the combined 48/48 (see Gates).

### L03-CRS2 (minor, #845) — discovery matched only the dynamic import spelling · FIXED

A static `import { reset } from "…/scripts/reset.mjs"` caller with a bare `reset()` call was
invisible to `reset-gate-routing.test.mjs`'s discovery walk, so the suite stayed 5/5 green in front
of exactly the defect acceptance 1 exists to catch.

**Fix (`4fcb2d15`):** widens `RESET_IMPORT_RE` from
`/import\(["'][^"']*scripts\/reset\.mjs["']\)/` to also match a static
`from "…scripts/reset.mjs"` spelling. The commit message records that a temporary static-import
probe module (deleted before commit) turned cell 2 red once the widening landed, and stayed green
before it — the vacuity control the finding asked for.

**Confirmed by the recheck:** discovered set still names exactly the audited 14 files, no new false
positives from the widened regex; `tests/reset-gate-routing.test.mjs` re-ran 5/5.

### L03-CRS3 (minor, #845, no code change) — "every affected drill still passes its ordinary run" is unproven · FIXED (documentation correction)

The required fix was to correct the claim, not the code — the underlying evidence gap cannot be
closed on this shared rig at all (RIG.md forbids ever setting `CLARA_RIG_ALLOW_RESET` here).

**Fix (`4fcb2d15`):** `packages/db/tests/README.md` and `wave1-lane03-final.md`'s `#845` row are
both rewritten to state acceptance 3 as **PARTIAL**, not DONE-with-a-caveat. `wave1-lane03-final.md`
now carries an explicit amendment paragraph naming this file as the source of the correction.

**What is exactly unproven (per-ticket status, below, repeats this):** the lane's own evidence for
this criterion is "no import-time crash from the added `guardedReset` wrapping" on a SKIPPED run —
none of the 14 files' actual `reset()`-and-re-migrate body executed on this rig. Of the 14, 11 do
run their destructive path for real somewhere in CI
(`.github/actions/closed-wave-upgrade-drills/action.yml` and `.github/actions/frontier-leg/action.yml`),
but 3 — `checkout-convergence-upgrade.test.mjs`, `rig-runtime-upgrade.test.mjs`,
`wave-a-upgrade.test.mjs` — have **no CI leg anywhere** (`grep -rn
"checkout-convergence-upgrade\|wave-a-upgrade\|rig-runtime-upgrade" .github/` returns nothing), so
those three files' `guardedReset`-wrapped destructive path is not exercised by anyone, in any
environment, after this change. What would discharge it: a CI leg for those three files (the
README already names this as the follow-up), after which "passes its ordinary run" could be
measured directly instead of inferred from a skip.

### L03-CRS4 (minor, #845) — cell 1's exact match went false-red for a correctly-wrapped future file · FIXED

`assert.deepEqual(found, EXPECTED_GATED_FILES)` ran in the ordinary db battery (picked up by
`packages/db/package.json`'s `tests/**/*.test.mjs` glob) and would turn red the day a new
reset-gated file is added and wrapped correctly on day one — a false alarm a later lane could
misread as its own regression.

**Fix (`4fcb2d15`):** cell 1 becomes a superset check — `missing = EXPECTED_GATED_FILES.filter(f
=> !found.includes(f))`, asserted empty; an extra discovered file beyond the known 14 is logged,
not failed. Cell 2 (no unwrapped `reset(` call) remains the hard bar for that extra file's own call
sites and needs no list.

**Confirmed by the recheck:** re-ran at 5/5, same suite as L03-CRS2.

### L03-CRS5 (minor, #884) — the "zero register rows" criterion pinned only a before/after delta, not the literal zero · FIXED

`p639.birth.opening_excluded` captured `beforeAssets` but never asserted it was `0`; a fixture that
already carried a register row before the refused approval would have stayed green on the delta
check alone, while the acceptance criterion names the absolute zero.

**Fix (`ae2dc311`):** adds `assert.equal(beforeAssets, 0, …)` immediately after the capture. Commit
message records the vacuity control: expected value temporarily flipped to `1`, observed red for
`"0 !== 1"`, restored byte-for-byte (sha256 match).

**Confirmed by the recheck:** `tests/fixed-asset-acquisition.test.mjs` re-ran 23/23, same count as
before — an assertion tightened, not a cell added.

### L03-CRS6 (note, #845) — the refusal message names T19, not the actual caller · NO ACTION NEEDED, holds

Original finding required no fix ("None required"; the reword was offered as optional). None of
the three round-2 commits touch `rig-reset-guard.mjs`'s `assertResetTargetDisposable` message.
Declining a non-required cosmetic reword is a legitimate outcome, confirmed unchanged by the
recheck.

### L03-CRS7 (note, #844) — `forceOpenedAt` disables the session-stamp trigger table-wide · NO ACTION NEEDED, holds

Original finding required no fix. `b662ed6b` moves the disable/write/enable-in-finally shape into
the new shared `withSessionStampDisabled()` helper (see STD-2) but does not change its scope — still
table-wide DDL, not per-row or per-transaction — matching the accepted note exactly.

### L03-CRS8 (note, #845) — four drill headers' PGDATABASE recipes were rewritten, one added · NO ACTION NEEDED (recorded for transparency, no fix requested)

Recorded in the original review as a necessary consequence of the wrapping, not a defect (the old
names did not match `EPHEMERAL_DB` and would have shipped headers pointing at a database the new
guard refuses). None of the three round-2 commits touch those four files' recipes.

---

## STANDARDS axis (`wave1-lane03-codereview-standards.json`, head `efdea055`, verdict `accept`)

### STD-1 (minor, #884) — `opening_excluded` re-implemented `kSeededFaClient`'s enrol-and-chart prefix instead of sharing it · FIXED

**Fix (`ae2dc311`):** extracts `freshEnrolledFaClient(label)` in `x41-fa-world.mjs` (the
onboard/`seedOpeningCoa`/`buildFaChart`/`upsertFaProfile` prefix); `kSeededFaClient` is rewritten to
call it, and `p639.birth.opening_excluded` calls the same helper instead of carrying its own copy.

**Confirmed by the recheck:** `fixed-asset-acquisition.test.mjs` re-ran 23/23; the commit message
records `wave-b/wb-k-supersede-fa.test.mjs` (the pre-existing consumer of `kSeededFaClient`) at
10/10, unaffected by the extraction.

### STD-2 (minor, #844) — `forceOpenedAt` duplicated `backdateStatus`'s trigger-disable idiom instead of generalizing it · FIXED

**Fix (`b662ed6b`):** extracts `withSessionStampDisabled(fn)` in `checkout-convergence-fixtures.mjs`;
both `backdateStatus` and `forceOpenedAt` now call it. `forceOpenedAt` is exported from
`checkout-convergence-fixtures.mjs` and re-exported through `operator-support-fixtures.mjs`, in
place of the private near-copy that used to live directly in `operator-support.test.mjs`.

**Confirmed by the recheck:** `operator-support.test.mjs` re-ran 20/20 and `checkout-convergence.test.mjs`
(the sibling consumer of the newly-shared helper) re-ran 36/36.

### STD-3 (minor, #845) — the `guardedReset` wrap repeats near-identically across 13 files · DECLINED, reason recorded

**Decision (`4fcb2d15` commit message):** left as-is. The ticket's own Agent Brief ("Key
interfaces") prescribes exactly this per-file shape ("Each upgrade-drill test or kit module: its
direct `reset({...})` becomes `guardedReset(reset, {...})`"), so collapsing it into a shared
re-export would be an unrequested refactor across 13 files for a benefit the original finding itself
called low-priority. No diff in any of the three round-2 commits touches the 13 call sites.

**Confirmed by the recheck:** decline holds; the recheck calls this "the same refutation the
original finding already anticipated."

### STD-4 (note, #844) — the new `os.19` heading broke the file's own heading convention · FIXED (this session, commit `2cd327f4`)

None of the three round-2 commits touched this heading; the recheck (`wave1-lane03-codereview-recheck.json`)
explicitly flagged it **STILL OPEN** — "not a considered decline, just left untouched" — though it
did not raise the overall verdict above minor, since "note" was the finding's original ceiling
severity.

**Fix (`2cd327f4`, this fix-round worker):** `packages/db/tests/README.md:738` changed from
`` ## `operator-support.test.mjs` os.19 — #844 `` to `` ## `operator-support.test.mjs` `os.19` — #844 ``,
matching the sibling heading that already backtick-wraps a bare qualifier the same way
(`` ## `fixed-asset-acquisition.test.mjs` `p639.birth.opening_excluded` / `p639.birth.opening_admitted` — #884 ``).
No test file changed; this is a documentation-only, one-line fix.

### STD-5 (note, #845, test-quality) — the non-delegating spy standing in for `scripts/reset.mjs`'s real export · NO ACTION NEEDED, holds

Source report already concluded no further action needed: the substitution is dependency injection
into `guardedReset(fn, options)`'s own injected callback parameter, mirrors T19's own established
spy idiom in `rig-reset-guard.test.mjs`, and is the only safe way to prove refuse-before-invoke
given RIG.md's standing prohibition on ever exercising the real destructive path on this shared
rig. Unchanged by any round-2 commit (confirmed: none of the three touch that cell's body, only
cell 1's discovery regex/superset logic and the acceptance-3 wording nearby).

---

## Per-ticket status

| ticket | status | detail |
|---|---|---|
| **#844** — os.19 arm-1 tie-break | **DONE** | L03-CRS1 (major) fixed with a structural pin; STD-2 (share the trigger-disable idiom) fixed; STD-4 (heading convention) fixed this session; STD-7/L03-CRS7 (table-wide trigger disable) held as an accepted note. All three acceptance criteria in the Agent Brief are met with the structural pin in place. |
| **#845** — route every reset()-gated drill through `guardedReset` | **DONE, ONE CRITERION PARTIAL** | Acceptance 1 (no unwrapped `reset(` call) and acceptance 2 (a non-disposable name refuses before any real `reset()` runs) are DONE, confirmed by the recheck. **Acceptance 3 ("every affected drill still passes its ordinary run") is PARTIAL**: this lane's evidence is "no import-time crash from the added wrapping" on a run that SKIPS every one of the 14 drills' destructive body (this rig never sets `CLARA_RIG_ALLOW_RESET`); it is not evidence the ordinary run itself still passes. 11 of the 14 files do run their destructive path for real in CI and would surface a regression there; **3 do not** — `checkout-convergence-upgrade.test.mjs`, `rig-runtime-upgrade.test.mjs`, `wave-a-upgrade.test.mjs` have no CI leg anywhere. What discharges this: a CI leg for those three files, after which the criterion can be measured directly. STD-3 (collapse the 13-site duplication) was considered and declined for a recorded reason, matching the ticket's own Agent Brief. |
| **#884** — K-family opening-balance exclusion arm | **DONE** | L03-CRS5 (pin the literal zero) fixed; STD-1 (share the enrol-and-chart prefix) fixed. All acceptance criteria (SQLSTATE CLR40, reason token, account code on DETAIL, zero register rows before and after, full rollback) are met and independently re-run in this session (23/23). |

---

## Gates re-run in this session

All three commands below were re-run fresh by this fix-round worker in the lane 03 worktree
(`C:\Users\zhant\Desktop\clara-wt\642`) against `clara_l03` @ 127.0.0.1:55743, at the current head
(`2cd327f4`, after the STD-4 heading fix — a documentation-only change, so no test count is expected
to move):

| gate | command | result |
|---|---|---|
| lane's touched db test files, full `$GATES` chain (all 47 `--import …-preintegration-gate.mjs` flags from `packages/db/package.json`'s `test` script) | `node --test --test-concurrency=1 $GATES tests/reset-gate-routing.test.mjs tests/operator-support.test.mjs tests/fixed-asset-acquisition.test.mjs` | **48 tests, 48 pass, 0 fail, 0 skipped** |
| typecheck (worktree root) | `pnpm typecheck` | **exit 0** (`apps/web`, `packages/runtime`) |
| lint (worktree root) | `pnpm lint` | **exit 0** |
| `git status --short` (worktree root) | — | clean, both before and after the gate runs |

The 48/48 count matches the independent recheck's own re-run of the same three files at head
`4fcb2d15` exactly (`wave1-lane03-codereview-recheck.json`, `gates_rerun_this_recheck`), which also
separately re-ran `operation-census.test.mjs` + `rig-isolation.test.mjs` (30 pass, 1 skip — T19's
own destructive cell, correctly skipped with no reset flags set), `checkout-convergence.test.mjs`
(36/36), and `node scripts/check-frozen-workflows.mjs` (312 frozen files verified, no manifest
diff). Those three supplementary suites were not re-run again in this session since neither the
STD-4 heading fix nor any prior round-2 commit touches their subject files; their counts are cited
from the recheck, not re-measured here.

## Unverified

- **#845 acceptance 3**, restated: the real `reset()`-and-re-migrate body of any of the 14 gated
  files has not been run on this rig by this lane or by this fix round (RIG.md forbids setting
  `CLARA_RIG_ALLOW_RESET` here); 3 of the 14 have no CI leg to ever run it automatically. This is
  the one open gap in the wave and is stated as PARTIAL, not DONE, in `wave1-lane03-final.md`.
- Whether a CI leg will actually be added for `checkout-convergence-upgrade.test.mjs`,
  `rig-runtime-upgrade.test.mjs` and `wave-a-upgrade.test.mjs` — recorded as a follow-up, not
  landed by this lane (out of scope for #845 as briefed).
- No hosted/deployment evidence was claimed by this lane or gathered by this fix round; none is
  relevant to a `packages/db/tests`-only diff.
- `gh issue view 845/844/884 --comments` was not re-read again in this session; the recheck already
  re-checked it as of its own run and found no owner-ruling comment newer than the 2026-09-17 Agent
  Briefs the source reports cite as newest.
