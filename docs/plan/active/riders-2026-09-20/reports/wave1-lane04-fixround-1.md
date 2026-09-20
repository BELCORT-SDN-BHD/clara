# wave 1 · lane 04 · fix round 1

Branch `riders/w1-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, db `clara_l04`
(127.0.0.1:55744). Started from the four landed commits (`git status` clean, `git log --oneline
origin/main..HEAD` read first, nothing redone):

```
9e3a8c1e feat(scripts,db): #857 lint gate refuses a raw document_regions.field_path outside the canonical grammar
d3224a44 test(db): #854 opening-balance evidence wall gains real two-session races
130ff25e docs(db): #867 durable fresh-cluster rule + role-census-reset script
d331cc59 fix(db): #866 T10b names World contamination instead of guessing
```

New head after this round:

```
4c4a5db9 fix(db): #866 fix-round — pin AC2 with a real leak cell (L04-S01, L04-S12)
6dea8f7a fix(db): #867 fix-round — arithmetic bug, README drop order, unverified claim (L04-S02, L04-S13, L04-S14)
0866aeba docs+test(db): #854 fix-round — pin refusal shape, honest doc claims (L04-S05, L04-S06, L04-S07)
0b592123 fix(scripts): #857 fix-round — main()'s exit code, structural region_idx exclusion (L04-S09, L04-S10)   <- NEW HEAD
```

No push, no PR, no GitHub write (issue, comment or close), no other worktree touched, no subagent
spawned, no process killed that this session did not start. The one file outside the worktree this
round wrote is this report.

Source: `docs/plan/active/riders-2026-09-20/reports/wave1-lane04-review-spec.json`
(verdict `accept-with-fixes`), findings `L04-S01`…`L04-S14` (three majors, minors as listed
below; `L04-S08` does not exist in the spec and `L04-S11`/`L04-S15`, both `note` severity, were
not in this round's assignment and were left alone).

---

## #866 — L04-S01 (major), L04-S12 (minor)

### L04-S01 (major) — AC2 had no committed cell

**FIXED.** Commit `4c4a5db9`.

AC2 reads "on a rig database with no world bootstrap and a genuine RBAC leak, T10b still reds (a
cell pins it)" — the shipped change only had a skip arm, which by construction can never red.
Added two cells to `packages/db/tests/rig-isolation.test.mjs`:

- `T10b-AC2 worldSchemaPresent() reads false on a no-World rig` — guards the skip arm from
  silently becoming universal.
- `T10b-AC2 a genuine PUBLIC-executable leak outside clara is named by
  agentReachableOutsideClara()` — plants a real PUBLIC-executable function in a throwaway schema
  (`x866_ac2_leak_probe`, dropped in a `finally`) and asserts the enumeration names it.

**Vacuity control:** neutered `agentReachableOutsideClara()` to `return []`, watched the second
cell red (`not ok 8`), restored the file byte-for-byte (`git diff` clean before committing).

**Evidence:** `rig-isolation.test.mjs` — 23 tests, 22 pass, 1 known skip (T19), ×2 (once green,
once with the vacuity break reproducing the intended red).

### L04-S12 (minor) — broken relative link

**FIXED.** Commit `4c4a5db9`. `packages/db/tests/README.md`'s "World contamination and T10b
(#866)" section linked `../runtime/README.md` (resolves to `packages/db/runtime/README.md`, does
not exist); corrected to `../../runtime/README.md` (confirmed the real file is there). The section
also now names the two new AC2 cells.

---

## #867 — L04-S02 (major), L04-S03 (major, no code owed), L04-S13 (minor), L04-S14 (minor)

### L04-S02 (major) — AC1's recorded run was never performed

**REFUTED-WITH-LIMITS / deferred, per the reviewer's own sanctioned fallback.** Commit `6dea8f7a`.

The required_fix offered two options: run the recipe end to end on a disposable cluster, **or**
soften the README's claim to "expected, not yet verified end to end" and keep #867 open on the
residual. The first option was not available to this fix round: RIG.md (READ FIRST material)
explicitly forbids a second from-scratch chain on this shared lane cluster ("migration 0154 pins
the cluster-wide role count"), and this worktree's assigned resources are one shared cluster
(port 55744) — provisioning a genuinely separate disposable Postgres instance is outside what this
lane was given, and risks colliding with the nine other lanes running concurrently on the same
host. I took the second option: `packages/db/README.md`'s "From-scratch reapply on a reused
cluster (#867)" section now says plainly the chain re-run is **expected, not yet verified end to
end**, names the two things that *are* verified (arithmetic: live 18 − 4 = 14; a real drop/restore
cycle of the two dependent-free `_login` roles with checkout-gate-c2/c3 re-run green), and states
that #867 stays open on this residual until a lane with a disposable cluster to spare runs it.

**Evidence:** `packages/db/README.md` diff; `role-census-reset.test.mjs` unchanged-behaviour
re-run (see L04-S14 below, 8 pass).

### L04-S03 (major) — destructive `drop role` outside the guarded script

**NO CODE CHANGE OWED — already resolved, re-confirmed.** The reviewer's own required_fix says so
explicitly ("No code change owed — state restored and proven"): the reviewer independently
re-verified full restoration (`pg_roles`/`pg_auth_members` posture byte-for-byte matching the
migrations, `checkout-gate-c2` 18/18, `checkout-gate-c3` 69/69) before this fix round started.
This round re-ran both batteries again as part of its own gate re-runs (see below) and they are
still green, so nothing this round did disturbed that repair. Recorded here per the fix-round
instructions as a ceremony finding for the orchestrator, not a code defect: `clara_l04`'s two
`_login` roles were re-created by hand during #867, not by migration.

### L04-S13 (minor) — README's drop order doesn't match `apply()`'s real order

**FIXED.** Commit `6dea8f7a`. Confirmed the real order by reading the migrations directly:
`0160_checkout_gate_c2_stripe_events.sql:120,123` creates `clara_stripe_webhook` then
`clara_stripe_webhook_login`; `0163_checkout_gate_c3_folded_door.sql:165,168` creates
`clara_auth_wall` then `clara_auth_wall_login` — base role first in both, matching
`rolesMintedAfterPin()`'s file-order read and `apply()`'s iteration, and matching
`role-census-reset.test.mjs`'s own "rcr.mint against the REAL migrations directory" cell.
`packages/db/README.md` corrected from login-then-base to base-then-login.

### L04-S14 (minor) — tautological assertion, and a real arithmetic bug it was hiding

**FIXED.** Commit `6dea8f7a`.

**Reproduced first, as a red cell.** New case
`rcr.check never subtracts a non-clara-matching "minted" role from the clara% count`: a fixture
migration text mints (textually) `create role postgres` — `rolesMintedAfterPin()`'s regex has no
opinion on role names, and `postgres` is a real, pre-existing cluster role that does **not** match
`clara%`. Against the pre-fix `check()`, this failed: `wouldReadAfterDrop` (17) ≠ `currentCount`
(18) — the decoy was silently subtracted from the clara% census, exactly the bug the finding
named ("a future migration minting a non-clara role would be silently subtracted").

**The fix** (`packages/db/scripts/role-census-reset.mjs`): added `isClaraRole()` and used it in
both `check()`'s `existing` filter (the subtraction) and `apply()`'s drop loop (defense in depth —
`apply()` previously had no such filter at all, meaning a hypothetical non-clara "minted" role
would have been *dropped*, not merely miscounted).

**The tautology itself:** `assert.equal(result.matchesPin, result.wouldReadAfterDrop === 14)` can
never fail (`matchesPin` is *defined* as `wouldReadAfterDrop === pinned`, and `pinned` was already
asserted `14` two lines above). Replaced with direct assertions:
`assert.equal(result.wouldReadAfterDrop, 14)` and `assert.equal(result.matchesPin, true)`.

**Evidence:** `role-census-reset.test.mjs` — 7 → 8 cases, 8/8 pass after the fix (confirmed red
before it, for the right reason).

---

## #854 — L04-S04 (major, deferred), L04-S05 (minor), L04-S06 (minor), L04-S07 (minor)

### L04-S04 (major) — the follow-up issue is not filed

**DEFERRED — handoff, not something this fix round can close.** This fix-round worker is bound by
the same "never write to GitHub" rule the original lane was; filing an issue is not something I
can do from here regardless of severity. What I *did* do (commit `0866aeba`): corrected the false
claim that it *was* filed (L04-S05, below), named the exact repro (`obw.race.evidence_then_opening`)
and candidate fix shape in both `packages/db/tests/opening-balance-evidence-link.test.mjs`'s file
header and `packages/db/tests/README.md`, and asked explicitly, in the doc, for whoever integrates
this branch to file the issue before merge and replace the sentence with its number. The
regression sentinel itself (asserting the double-posting as the CURRENT, measured outcome) is
unchanged and still green — nothing about the defect's visibility to a future reader was weakened.

### L04-S05 (minor) — README falsely claims the issue was filed

**FIXED.** Commit `0866aeba`. `packages/db/tests/README.md`'s #854 section said "Filed as a
follow-up issue at the same time"; the lane's own final report said the opposite. Corrected to say
plainly it was **not** filed, names both reports it is recorded in
(`wave1-lane04-final.md`, this file), and asks the integrator to file it before merge.

### L04-S06 (minor) — `assertLoserRefusal` doesn't pin the observed shape

**FIXED.** Commit `0866aeba`. `assertLoserRefusal(loser, label)` → `assertLoserRefusal(loser,
label, expectedShape)`; the one call site (`obw.race.opening_then_evidence`) now passes `"CLR13"`,
the shape this rig actually produces. The disjunction (CLR13 vs. bare 40001) lives only in the
helper's own contract comment now, not in what a cell will silently accept.

**Vacuity control:** flipped the call site's expected value to `"40001"`, watched it red with
`expected the 40001 refusal shape; this rig produced CLR13 (...)`, restored to `"CLR13"`
(`git diff` byte-for-byte after restore, confirmed line-by-line).

**Evidence:** `opening-balance-evidence-link.test.mjs` — 5/5 pass (and 4/5 with the deliberate
break, the one expected failure being the targeted cell).

### L04-S07 (minor) — the SSI mechanism is asserted as fact, contradicted by the lane's own report

**FIXED.** Commit `0866aeba`. Reworded both `opening-balance-evidence-link.test.mjs`'s §4 header
and `packages/db/tests/README.md`'s #854 section: the "second updater" account is now presented as
this lane's own reading, a real alternative (SSI's pivot/rw-antidependency requirement, per the
PostgreSQL docs' "Serializable Isolation Level" section) is named as at least equally plausible and
not ruled out, and a successor fix is told to verify the actual mechanism first. The **measurement**
itself (both sides commit, reproduced twice, deterministic) is unchanged and still asserted as the
finding — only the causal explanation's certainty was corrected.

---

## #857 — L04-S09 (minor), L04-S10 (minor)

### L04-S09 (minor) — the self-test never exercises `main()`'s exit code

**FIXED.** Commit `0b592123`.

AC1's literal wording: "the check runs from the lint chain and exits non-zero on a seeded
malformed path (self-test proves it)". All 17 prior cases drove the exported pure functions
directly; none called `main()` or ran the script as a program. Added two cases to
`scripts/check-document-region-field-paths.selftest.mjs`, using the same idiom as this repo's own
`apps/web/scripts/check-ui-add-guard.selftest.mjs`:

- stages a seeded malformed fixture into **this worktree's own git index** (`git add`, never
  committed, removed in a `finally` even on assertion failure), spawns the real script as a real
  subprocess, asserts exit code 1 and that stdout names `file:line:path`;
- a second case confirms a clean run exits 0.

**Vacuity control:** changed the entry-point line from `process.exit(main())` to `main();`
(dropping the exit code), watched the new exit-1 case fail with `expected: 1, actual: 0`, restored
byte-for-byte (confirmed no diff on `check-document-region-field-paths.mjs` after restore, before
applying the L04-S10 fix below).

**Cleanup verified:** `git status --porcelain` clean and the decoy file absent after every run,
including the failing vacuity run.

### L04-S10 (minor) — the region_idx exclusion is proximity-based, not structural

**FIXED.** Commit `0b592123`.

**Reproduced the false-negative directly** (standalone repro, before touching production code):
with the OLD 200-char window, a genuinely malformed `field_path: "rogue.company_ssm"` sitting a
line below an unrelated citation object's own `region_idx` was wrongly excluded
(`excluded(old window)= true` for both literals in the repro). This is exactly the finding's
failure scenario.

**The fix:** added `stringMask()` (marks characters inside JS string/template literals) and
`enclosingObjectLiteralSpan()` (a brace-depth scan back to the enclosing `{` and forward to its
matching `}`, skipping any brace inside a string), and scoped the `region_idx` check to that exact
span instead of a character window. Running the fix against the real two-tree scan (927 files)
immediately surfaced one real regression: `packages/runtime/tests/wave-e-f9-chatturn-v10.test.mjs:156`
deliberately constructs `{ region_id: REGION_TOTAL, quote: "q", field_path: "p" }` (testing that a
bare `region_id`, without `idx`, is refused by the real schema) — same citation family, but
`region_idx` itself absent by design in that one object. Widened the marker to
`region_idx` **or** a `quote:` property key (the citation shape's other defining property, per
`wave-e-f9-testkit.mjs:206`'s own `cite = (region_idx, quote, field_path) => ({...})`; no
`document_regions` row object ever carries `quote`).

**New unit cases:** the `region_id`+`quote` real-repo shape stays excluded; a genuinely malformed
`field_path` in a *different*, nearby object literal is **not** excluded merely because
`region_idx` appears in the sibling object (this is the one that would have failed under the old
window logic — confirmed via the standalone repro above).

**Evidence:** `check-document-region-field-paths.selftest.mjs` — 17 → 21 cases, 21/21 pass; the
real-repo integration case (927 files, today's 87 real exclusions across 18 files) stays at zero
violations — no verdict changed on anything that ships today.

---

## Gates re-run

| gate | result |
|---|---|
| `packages/db/tests/rig-isolation.test.mjs` | 23 tests, 22 pass, 1 known skip (T19) |
| `packages/db/tests/operation-census.test.mjs` | 10 pass |
| `packages/db/tests/role-census-reset.test.mjs` | 8 pass (was 7; +1) |
| `packages/db/tests/opening-balance-evidence-link.test.mjs` | 5 pass |
| `packages/db/tests/coding-lane-evidence-link.test.mjs` (shared driver, regression check) | 8 pass |
| `packages/db/tests/checkout-gate-c2.test.mjs` | 18 pass |
| `packages/db/tests/checkout-gate-c3.test.mjs` | 69 pass |
| `packages/db/tests/wave-b/wb-k-approval.test.mjs` | 14 pass |
| combined re-run of all eight files above, one process | 155 tests, 154 pass, 1 skip, 0 fail |
| `scripts/check-document-region-field-paths.selftest.mjs` | 21 pass (was 17; +4) |
| `pnpm typecheck` (worktree root) | exit 0 |
| `pnpm lint` (worktree root, full chain — confirmed `check-document-region-field-paths[.selftest]` ran and passed inside it, plus every other check named in `package.json`'s `lint` script, `apps/web`'s own chain, `packages/db`/`packages/runtime` eslint, `packages/reporting-render` lint) | exit 0 |
| `node scripts/check-frozen-workflows.mjs` (inside `pnpm lint`) | OK — 312 frozen files verified, no manifest diff |

No `apps/web` or `packages/runtime` production source is touched by this round (confirmed by the
diff below), so the whole-suite web run and `check-parts-parity.mjs` were not separately triggered
— `pnpm lint`'s clean `eslint`/`check-frozen-workflows` sweep covers them anyway, same posture the
lane's own final report took.

## Files changed this round

```
packages/db/README.md                                       |  16 +++-
packages/db/scripts/role-census-reset.mjs                    |  16 +++-
packages/db/tests/README.md                                  |  42 +++++++---
packages/db/tests/opening-balance-evidence-link.test.mjs      |  62 ++++++++++-----
packages/db/tests/rig-isolation.test.mjs                      |  41 ++++++++++
packages/db/tests/role-census-reset.test.mjs                  |  33 +++++++-
scripts/check-document-region-field-paths.mjs                 |  93 ++++++++++++++++++----
scripts/check-document-region-field-paths.selftest.mjs        |  86 +++++++++++++++++++-
8 files changed, 334 insertions(+), 55 deletions(-)
```

No migration touched, no applied migration edited, no `docs/PRD.md`/`docs/ARCHITECTURE.md` edit,
no shared file (WORK-ORDER rule 7 list) touched.

## Follow-ups worth filing (still not filed — this fix round cannot write to GitHub either)

1. **Opening-balance evidence wall double-posting** (#854 residual, unchanged from the lane's own
   report) — repro `obw.race.evidence_then_opening`. Now doubly flagged (in the file header and in
   `tests/README.md`) as needing filing before this branch merges.
2. **document_regions.field_path table CHECK** (#857 residual, unchanged) — the migration AC2
   describes, still unwritten; a wave-1 lane may not cut a migration.
3. **#867 end-to-end proof** — an actual from-scratch migration chain reapplied on a cluster after
   `role-census-reset.mjs --apply`, on a disposable cluster this lane does not have. README now
   says so explicitly instead of asserting the untested claim as fact.

## Anything unverified

- #867 AC1 remains unverified end to end (see L04-S02 above) — this is now stated as an open
  residual in `packages/db/README.md` itself, not just in this report.
- #854's SSI mechanism explanation is explicitly marked, in both permanent docs, as this lane's own
  reading rather than a confirmed fact (see L04-S07) — the measurement it explains is unchanged.
- I could not independently verify PostgreSQL's exact SSI pivot semantics against the source or a
  core committer; the reworded docs say this rather than asserting either causal account.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Usf8wyAJEfsk43bpRR6jF
