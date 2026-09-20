# wave 1 · lane 04 · code-review fix round 2

Branch `riders/w1-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, db `clara_l04`
(127.0.0.1:55744). Started from fix-round-1's head (`git status` clean, `git log --oneline
origin/main..HEAD` read first, nothing redone):

```
0b592123 fix(scripts): #857 fix-round — main()'s exit code, structural region_idx exclusion (L04-S09, L04-S10)
0866aeba docs+test(db): #854 fix-round — pin refusal shape, honest doc claims (L04-S05, L04-S06, L04-S07)
6dea8f7a fix(db): #867 fix-round — arithmetic bug, README drop order, unverified claim (L04-S02, L04-S13, L04-S14)
4c4a5db9 fix(db): #866 fix-round — pin AC2 with a real leak cell (L04-S01, L04-S12)
```

New head after this round: **`8c4c9a2c124dfad0ae8c9d857b88b75ea19e711b`**

```
8c4c9a2c fix(scripts): #857 code-review round 2 — scanTargetFiles() sees untracked fixtures too (L04B-SPEC-06)
daa29bc6 docs(db): #854 code-review round 2 — record AC2's reinterpretation and the correction door's shared lock path (L04B-SPEC-04, L04B-SPEC-07)
79e34ec1 fix(db): #867 code-review round 2 — sharedDependents() sees shared-object deps; isClaraRole() derived from one literal (L04B-SPEC-05, L04-STD-02)
e20a28ba fix(db): #866 code-review round 2 — AC2 guard cell skips on a World-contaminated rig (L04B-SPEC-03)
```

No push, no PR, no GitHub write (issue, comment or close), no other worktree touched, no subagent
spawned, no process killed that this session did not start. The one file outside the worktree this
round wrote is this report. Diff since `0b592123`: exactly 8 files, no migration, no
`docs/PRD.md`/`docs/ARCHITECTURE.md`, no shared file (WORK-ORDER rule 7 list) touched
(`git diff 0b592123..HEAD -- packages/db/migrations docs/PRD.md docs/ARCHITECTURE.md` — empty).

Source: `docs/plan/active/riders-2026-09-20/reports/wave1-lane04-codereview-spec.json` (verdict
`accept-with-fixes`) and `...-codereview-standards.json` (verdict `accept-with-fixes`). This round's
assigned findings: `L04B-SPEC-01`…`L04B-SPEC-07`, `L04-STD-01`, `L04-STD-02` (the two axes' notes,
`L04B-SPEC-08`…`L04B-SPEC-12` and `L04-STD-03`/`L04-STD-04`, were not in this round's assignment and
were left alone). No finding in this round's assignment is a horizontal-slicing finding (none carry
that `kind`), so no such check was owed.

---

## #866 — L04B-SPEC-03 (minor)

### L04B-SPEC-03 — the new AC2 guard cell reds on exactly the World-contaminated rig AC1 exists to make skip

**FIXED.** Commit `e20a28ba`.

The `T10b-AC2 worldSchemaPresent() reads false on a no-World rig` cell (added last round to pin
L04-S01) had no skip arm, so it asserted `worldSchemaPresent() === false` unconditionally — reddening
on precisely the rig configuration T10b's own AC1 exists to make skip, defeating its own requirement.

**Reproduced first**, without a full runtime bootstrap: `worldSchemaPresent()` only checks
`pg_namespace` for three schema names, so a throwaway sibling clone
(`create database clara_l04_spec03 template clara_l04`, no active connections on the source) plus a
bare `create schema workflow` on the clone reproduces the exact contaminated shape this cell cares
about. Ran `rig-isolation.test.mjs`'s T10b cells against the clone: `T10b-AC2 worldSchemaPresent()
reads false…` reds (`true !== false`) — the pre-fix bug, reproduced.

**The fix:** added the same named skip arm T10b itself carries
(`t.skip("World contamination (#866): …")`) before the assertion.

**Re-verified on the clone:** the cell now skips (`ok 2 … # SKIP World contamination (#866): …`);
T10b and the sibling leak cell unaffected. **Regression-checked on the clean lane db** (`clara_l04`):
all three T10b cells still pass unchanged. Full `rig-isolation.test.mjs` re-run on `clara_l04`: 23
tests, 22 pass, 1 known skip (T19) — same shape as before this fix. Clone dropped afterward
(`drop database clara_l04_spec03`).

**Docs:** `packages/db/tests/README.md`'s #866 section names the fix and the repro recipe.

---

## #867 — L04B-SPEC-02 (major), L04B-SPEC-05 (minor), L04-STD-02 (minor smell)

### L04B-SPEC-02 (major) — AC1's "record the run" was never performed

**REFUTED, no further action possible from this lane — same disposition as the prior review round's
identical finding (L04-S02 / the recheck's L04-S04-equivalent residual), reconfirmed rather than
re-litigated.** No code change.

The fallback the review's own required_fix sanctions ("state that a from-scratch re-apply needs a
fresh cluster or the four post-0154 roles dropped first, with the exact drop statements") was already
delivered in the prior fix round: `packages/db/README.md`'s #867 section reads "**Not yet verified
end to end**" in its own words, names what IS verified (the 18 − 4 = 14 arithmetic; a real
drop/restore cycle of the two dependent-free `_login` roles with checkout-gate-c2/c3 re-run green),
and states #867 stays open on the residual. The actual recorded run — a real from-scratch 0001→
frontier migration chain reapplied on a cluster that already ran it once — genuinely cannot be
performed from this lane: RIG.md (binding, READ FIRST material for this wave) explicitly forbids "a
second from-scratch chain on your cluster," this worktree's one provisioned resource is the shared
cluster at port 55744, and provisioning a genuinely separate disposable Postgres instance is outside
what this lane was given (and risks colliding with the nine other lanes on the same host this
session). Re-verified this reasoning still holds rather than assuming it: no new tooling (`initdb`,
`pg_ctl`, a second Postgres port) was provisioned to this lane between rounds, and the rig's own
binding table (`RIG.md`) is unchanged. **Leave #867 open on this residual; the required action
(`role-census-reset.mjs --apply` + a real chain re-run, on a disposable cluster) is an
integrator/successor-lane action, not a lane fix.**

### L04B-SPEC-05 (minor) — `sharedDependents()` inner-joins `pg_database`, missing a SHARED-object (`dbid = 0`) dependency

**FIXED.** Commit `79e34ec1`.

**Reproduced first**, on the live rig, with an independent probe before touching the function under
test: `create role x867b_shared_probe; grant connect on database clara_l04 to x867b_shared_probe;`
then a raw query directly against `pg_shdepend` confirmed the row lands at `dbid = 0` (the DATABASE
is the dependent object here, and no `pg_database` row has oid 0). Added
`role-census-reset.test.mjs`'s `rcr.sharedDependents sees a SHARED-object dependency…` cell, which
asserts that same precondition independently (not re-deriving the function under test) and then calls
`sharedDependents()`. Against the pre-fix `INNER JOIN`, the cell reds:
`sharedDependents() must see the dbid=0 dependency it would otherwise silently drop, got []`.

**The fix:** `sharedDependents()`'s `join pg_database` → `left join pg_database`, with
`coalesce(d.datname, '<shared object>')` in both the select list and the `group by`, so a `dbid = 0`
row is reported instead of silently dropped. This closes a real (if latent) breach of `apply()`'s own
documented contract ("REFUSES outright … never a partial drop"): without the fix, `apply()` could
drop `clara_stripe_webhook`/`clara_stripe_webhook_login` successfully and only then discover
`clara_auth_wall` is blocked by a dependency `check()` never saw, leaving the cluster half-reset.

**Re-verified:** the new cell passes; full `role-census-reset.test.mjs` re-run: 9/9 pass (was 8/8).
Confirmed **latent, not live**, on this rig today — `clara_l04`'s `pg_shdepend` carries 0 rows with
`dbid = 0` outside the test's own throwaway probe (dropped in the test's own `finally`).

**Docs:** `packages/db/README.md`'s #867 section names the fix.

### L04-STD-02 (minor smell) — `isClaraRole()` hand-restates the SQL's own `'clara%'` predicate

**FIXED** (folded into the same commit — the file was already open for L04B-SPEC-05, and the fix is
small and clearly better, per this round's own "fix a smell when it's cheap" instruction).

`isClaraRole(name) { return name.startsWith("clara"); }` duplicated, by hand, the exact question
`clusterClaraRoleCount()`'s SQL `where rolname like 'clara%'` already answers — in a file whose own
header says three separate times that a value must be read from a single source, never duplicated by
hand. Replaced both with a single `CLARA_ROLE_LIKE = "clara%"` literal: `clusterClaraRoleCount()` now
parameterizes the SQL with it, and a small `likeToRegExp()` translates the same literal into an
equivalent JS `RegExp` once, which `isClaraRole()` uses. No behavior change intended or observed:
`clusterClaraRoleCount()`'s live count and every `check()`/`apply()` cell that exercises `isClaraRole`
indirectly (including the L04-S14 decoy-role regression cell) still pass unchanged — see the combined
gate re-run below.

---

## #854 — L04B-SPEC-01 (blocker), L04B-SPEC-04 (minor), L04B-SPEC-07 (minor)

### L04B-SPEC-01 (blocker) — the brief's own "new defect for its own ticket" outcome has no ticket

**REFUTED, no further action possible from this lane — this is the same structural gap the prior
round's recheck already named (as L04-S04) and accepted as an integrator handoff, restated here at
higher severity by this round's SPEC axis but not changed in substance.** No code change.

`obw.race.evidence_then_opening` measures a real, deterministic double-posting (both sides of the
race commit) and asserts it as the current outcome, exactly as designed — re-ran it: still passes
(`ok 5`). The brief's own words ("if both sides can commit, that is a new defect for its own ticket")
call for a follow-up GitHub issue; none exists, and WORK-ORDER rule 2 binds every lane worker
(including this fix-round worker) to "never comment on or close a GitHub issue" — filing one is
categorically not an action this session can take, regardless of severity. What this round did
instead (see L04B-SPEC-04 and L04B-SPEC-07 below) is strengthen the record a future filer and
integrator will use: the AC2 count's own reinterpretation is now explained inline, and the
correction-door exposure the residual issue should also name is now written down, both in the test
file's header and in `packages/db/tests/README.md`. **This blocker stays open; filing the issue named
in the ticket's own report (title, repro, candidate fixes) before the branch merges is an
orchestrator/integrator action.**

### L04B-SPEC-04 (minor) — AC2's "asserts exactly one" is met by neither cell

**RECORDED, no code change — the required_fix asked for a closing note, not a new assertion.**
Commit `daa29bc6`.

Added to `opening-balance-evidence-link.test.mjs`'s file header and `packages/db/tests/README.md`'s
#854 section: neither race cell pins a bare `1` (`opening_then_evidence` asserts
`s.drafts.all.length`, `>= 3` by the seed's own mandatory multi-item setup; `evidence_then_opening`
asserts `s.drafts.all.length + 1`), because #821's whole carve-out is that many opening items
legitimately share one tie document, and a single-item opening seed is not a shape this battery (or
`wb-fixtures.mjs`'s seed builder) can construct without weakening the multi-item coverage the ticket
also requires. The `+ 1` in the losing order is the measured defect (L04B-SPEC-01), not a looser AC
reading.

**Re-verified:** `opening-balance-evidence-link.test.mjs` re-run 5/5 pass, unchanged (this was a
comment-only change, no assertion touched).

### L04B-SPEC-07 (minor) — `approve_opening_correction` is never driven

**RECORDED, no code change — the required_fix asked for a one-line check and a closing note, not a
new test.** Commit `daa29bc6`.

Performed the one-line check the finding asks for, by reading the migrations directly rather than
guessing: `clara.approve_opening_correction` (0017:4162) loops over its draft correction entries and
calls `clara._approve_opening_entry(p_seed, e.id, …)` for each one (0017:4241) — **the exact same
helper** `clara.approve_opening_seed` calls per item (0017:3962). `_approve_opening_entry`'s own
`UPDATE` into `journal_entries` (transitioning `status` to `approved`) is what fires
`t_source_binding_wall_upd` (migration 0213), which takes `clara._lock_document_binding` first
**regardless of which approver's `UPDATE` tripped it**. **Answer: yes, the correction door shares the
exact lock path the seed door does** — the double-posting hole L04B-SPEC-01 measures on the seed door
is architecturally reachable from the correction door too, though untested by this ticket. Recorded
in both the test file header and `packages/db/tests/README.md`'s #854 section, and named as something
the residual issue (L04B-SPEC-01) should mention for both doors, not only the seed one.

---

## #857 — L04B-SPEC-06 (minor)

### L04B-SPEC-06 (minor) — the lint only sees git-TRACKED files

**FIXED.** Commit `8c4c9a2c`.

**Reproduced first**, as two red cells added to `check-document-region-field-paths.selftest.mjs`
before touching the fix: (1) a malformed fixture written to `packages/db/tests/` but **never
`git add`ed**, then the real script run as a real subprocess — pre-fix, exits 0 (clean) over a live
violation, because `scanTargetFiles()`'s bare `git ls-files ...roots` lists the INDEX only; (2)
`scanTargetFiles()` called directly against a freshly-written untracked file — pre-fix, the file is
absent from the returned list. Both reproduced the exact gap the finding names: "the commit that
introduces a malformed fixture is the one commit it cannot catch."

**The fix:** `git ls-files ["--cached", "--others", "--exclude-standard", "--", ...roots]` instead of
a bare `["ls-files", ...roots]` — the union of tracked files and untracked-but-not-`.gitignore`d
files, so a `.gitignore`d path (a build artifact, `node_modules`) stays excluded exactly as before.

**Re-verified:** both new cases pass; `check-document-region-field-paths.selftest.mjs` 23/23 pass (was
21/21); the real script against the real repo stays clean (927 files, 0 violations — same count as
before, confirming the fix added no false positive); worktree confirmed clean
(`git status --porcelain`) before and after every run, including the two new cases' own
write/spawn/delete cycles. The pre-existing tracked-fixture case's comment (which had cited the gap
this finding names as the reason staging was necessary) is corrected: staging now demonstrates the
tracked path specifically, no longer load-bearing for detection.

**Docs:** `packages/db/tests/README.md`'s #857 section documents the fix.

---

## L04-STD-01 (minor smell) — the migration-grammar-reading shape is written twice

**LEFT ALONE, as the reviewer's own required_fix explicitly instructs ("Not required for this wave;
worth a follow-up … the next time a third check needs the same shape").** No code change.

Assessed rather than deferred by default: extracting a shared helper would mean either (a) a new
module inside `packages/db/scripts/` that `scripts/check-document-region-field-paths.mjs` (root-level,
not part of the `packages/db` package) reaches into, or (b) a new root-level `scripts/lib/` module that
`packages/db/scripts/role-census-reset.mjs` reaches OUT of its own package to use — either direction
crosses this monorepo's package boundary between a root-level script and a package-owned one, for two
call sites that read two different migrations' two different grammars (a role-name census vs. a
`field_path` syntax/length/namespace triple) and share only the "read one pinned migration, regex out
its own asserted shape, throw a standard never-edit-the-migration message" skeleton — not their actual
extraction logic. That is a real shape worth naming once a THIRD consumer needs it (as the reviewer
says), but forcing it now, for two call sites, in a wave-1 lane bound by WORK-ORDER rule 5's scope
discipline, would be exactly the kind of unrequested widening that rule warns against. Stays as a
documented follow-up, not fixed this round.

---

## Gates re-run

| gate | result |
|---|---|
| `packages/db/tests/rig-isolation.test.mjs` | 23 tests, 22 pass, 1 known skip (T19) — unchanged |
| `packages/db/tests/role-census-reset.test.mjs` | 9 pass (was 8; +1, `rcr.sharedDependents…`) |
| `packages/db/tests/opening-balance-evidence-link.test.mjs` | 5 pass — unchanged |
| combined re-run of `rig-isolation` + `operation-census` + `role-census-reset` + `opening-balance-evidence-link` + `coding-lane-evidence-link` + `checkout-gate-c2` + `checkout-gate-c3` + `wave-b/wb-k-approval`, one process | 156 tests, 155 pass, 1 skip, 0 fail (was 155/154/1-skip; +1 test, all still green) |
| `scripts/check-document-region-field-paths.selftest.mjs` | 23 pass (was 21; +2) |
| `node scripts/check-document-region-field-paths.mjs` (real repo) | clean, 927 files, 0 violations — same count as before the fix |
| `pnpm typecheck` (worktree root) | exit 0 (`apps/web`, `packages/runtime` both Done) |
| `pnpm lint` (worktree root, full chain) | exit 0; confirmed `check-document-region-field-paths[.selftest]` ran inside it (23/23) and every other check named in `package.json`'s `lint` script, `apps/web`'s own chain, `packages/db`/`packages/runtime` eslint, `packages/reporting-render` lint, all clean |
| `node scripts/check-frozen-workflows.mjs` (inside `pnpm lint`) | OK — 312 frozen files verified, no manifest diff, 55 workflow modules |
| `git diff 0b592123..HEAD --stat` | exactly the 8 files this report's commits list |
| `git diff 0b592123..HEAD -- packages/db/migrations docs/PRD.md docs/ARCHITECTURE.md` | empty — nothing touched |
| `eslint` on the two touched root scripts | exit 0, no findings |

No `apps/web` or `packages/runtime` production source is touched by this round (confirmed by the diff
above), so the whole-suite web run and `check-parts-parity.mjs` were not separately triggered —
`pnpm lint`'s clean `eslint`/`check-frozen-workflows` sweep covers them anyway, same posture the
lane's own final report and fix-round-1 took. No Windows-only red from RIG.md's known list was hit by
this round's changes.

## Files changed this round

```
packages/db/README.md                                            |  5 ++
packages/db/scripts/role-census-reset.mjs                         | 54 +++++++++++++++++-----
packages/db/tests/README.md                                       | 35 +++++++++++++-
packages/db/tests/opening-balance-evidence-link.test.mjs          | 28 +++++++++++
packages/db/tests/rig-isolation.test.mjs                          | 13 ++++++
packages/db/tests/role-census-reset.test.mjs                      | 38 +++++++++++++++
scripts/check-document-region-field-paths.mjs                     | 11 ++++-
scripts/check-document-region-field-paths.selftest.mjs            | 52 +++++++++++++++++++--
8 files changed, 217 insertions(+), 19 deletions(-)
```

No migration touched, no applied migration edited, no `docs/PRD.md`/`docs/ARCHITECTURE.md` edit, no
shared file (WORK-ORDER rule 7 list) touched.

## Findings not in this round's assignment (left alone, per instructions)

`L04B-SPEC-08` (note, scope-creep — `commitOrCapture`), `L04B-SPEC-09` (note, docs — the #866 dead
citation), `L04B-SPEC-10` (note, `depLabel()`'s unreachable "m" branch and unlabelled "r"),
`L04B-SPEC-11` (note, templated `field_path` sites uncounted), `L04B-SPEC-12` (note, #857's CHECK-arm
residual unfiled), `L04-STD-03` (note, `depLabel()` primitive obsession), `L04-STD-04` (note, the
main()-exit-code self-test's git-index side effect) — none were named in this round's task, and
touching them would widen scope past what was asked.

## Anything unverified

- L04B-SPEC-02 (#867 AC1) remains unverified end to end — unchanged from the prior round, and still
  correctly recorded as an open residual in `packages/db/README.md` itself.
- L04B-SPEC-01 (#854's follow-up issue) remains unfiled — this session cannot file it (WORK-ORDER
  rule 2); the record it needs (repro, candidate fixes, and now both doors' exposure per
  L04B-SPEC-07) is complete and waiting in `packages/db/tests/README.md` and this ticket's own file
  headers for whoever integrates the branch.
- L04B-SPEC-05's fix closes a latent gap this rig does not currently exhibit (0 `dbid = 0` rows in
  `clara_l04`'s live `pg_shdepend` outside the test's own throwaway probe) — the fix is verified
  against a deliberately-constructed real dependency, not against a naturally-occurring one on this
  cluster.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>

---

# wave 1 · lane 04 · code-review fix round 3 (2026-09-20)

Branch `riders/w1-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, db `clara_l04`
(127.0.0.1:55744). Started from round 2's head (`git status` clean; `git log --oneline
origin/main..HEAD` read first — the four round-2 commits above, nothing redone):

```
8c4c9a2c fix(scripts): #857 code-review round 2 — scanTargetFiles() sees untracked fixtures too (L04B-SPEC-06)
daa29bc6 docs(db): #854 code-review round 2 — record AC2's reinterpretation and the correction door's shared lock path (L04B-SPEC-04, L04B-SPEC-07)
79e34ec1 fix(db): #867 code-review round 2 — sharedDependents() sees shared-object deps; isClaraRole() derived from one literal (L04B-SPEC-05, L04-STD-02)
e20a28ba fix(db): #866 code-review round 2 — AC2 guard cell skips on a World-contaminated rig (L04B-SPEC-03)
```

New head after this round: **`cf3a60dda62f64c471098894fb60999bb86e2233`**

```
cf3a60dd docs(db): #867 AC1's from-scratch reapply, actually run and recorded (L04B-SPEC-02)
```

Source: `docs/plan/active/riders-2026-09-20/reports/wave1-lane04-codereview-spec.json` and
`...-standards.json` (same two axes as before), read against the independent recheck
`wave1-lane04-codereview-recheck-0.json`, which accepted every round-2 disposition except two
findings it left open as structural handoffs. This round's assignment was exactly those two:

- `L04B-SPEC-01` (#854 blocker) — **the orchestrator's job, not this lane's.** Nothing to fix here;
  confirm and report only.
- `L04B-SPEC-02` (#867 major) — **this lane's whole job this round.**

No push, no PR, no GitHub write (issue, comment or close), no other worktree touched, no subagent
spawned, no process killed that this session did not start (the one background process this round
started — a disposable PostgreSQL cluster, detail below — was also the one this round stopped).
The one file outside the worktree this round wrote is this report (extended, not rewritten).

## L04B-SPEC-01 — resolved outside this lane, confirmed

The orchestrator filed `#854`'s residual as a real GitHub issue: **#1014**, "Opening-balance
evidence wall: a concurrent evidence attachment and opening approval can both commit," confirmed
live with `gh issue view 1014`:

- `state: OPEN`, labels `bug, ready-for-agent`.
- Its body names the exact repro this lane's own record points to
  (`obw.race.evidence_then_opening` in `packages/db/tests/opening-balance-evidence-link.test.mjs`,
  and `wave1-lane04-final.md`'s "#854" section) and both candidate repairs
  (re-read `entry_evidence_links` under the document lock, or a `SELECT ... FOR UPDATE`), and, per
  round 2's own L04B-SPEC-07 addition, correctly names both the seed and the correction door
  ("Sequencing" section references #984, which also touches the opening lane's approval path).

Nothing else to do here, as instructed — this lane cannot write to GitHub (WORK-ORDER rule 2) and
the orchestrator has already done the write this finding needed.

## L04B-SPEC-02 — #867 AC1's recorded run, performed for real

**FIXED (verified, not refuted).** Commit `cf3a60dd`.

Round 2's fix report and the independent recheck both refuted this finding on two premises, both
re-checked here before touching anything: (1) RIG.md forbids a second from-scratch chain on this
lane's shared cluster (55744) — **still true, and still not violated**: `clara_l04` was never
re-migrated and 55744 never ran a second chain, confirmed by reading `clara_l04`'s own
`clara.schema_migrations` before and after this round (`count=229, max=0234_legal_enforcement_mode`,
unmoved). (2) "Provisioning a genuinely separate disposable cluster was out of reach for this
lane" — **this premise was not re-tested last round, and it turned out to be false.**

**Reproduced the blocker first**, read-only, before deciding a workaround was needed: ran
`node scripts/role-census-reset.mjs` (the check-only, non-destructive mode) against `clara_l04`
itself. It reported the base roles `clara_stripe_webhook` and `clara_auth_wall` **BLOCKED by
clara_l04 (3 privilege deps)** — i.e. the documented recipe's own precondition ("nothing else on
the cluster still depends on the four roles once the old database is gone") is unmet on 55744
while `clara_l04` is alive, which this lane must never drop. This confirms round 2's refutation
was correctly reasoned for THIS cluster; the gap was assuming no other cluster was reachable.

**The workaround:** this Windows host's WSL side already has PostgreSQL's `postgresql-common`
package installed (the same package that provides `pg_lsclusters`, used throughout RIG.md), which
ships `pg_createcluster` / `pg_dropcluster` — tools to provision and tear down a **fully
independent** Postgres cluster, not a second database on an existing one. Used once, for this
proof alone, never touching 55744 or any other lane's cluster:

```sh
# provision, on WSL, a disposable cluster distinct from every lane's own (port 55799)
sudo pg_createcluster 17 l04chk --port=55799
# pg_hba.conf edited to the same trust lines every rig lane cluster already carries
sudo pg_ctlcluster 17 l04chk start

# pass 1: a normal from-scratch chain (creates the 4 post-0154 roles for the first time)
createdb -h 127.0.0.1 -p 55799 -U postgres clara_scratch1
PGHOST=127.0.0.1 PGPORT=55799 PGUSER=postgres PGDATABASE=clara_scratch1 \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 node scripts/migrate.mjs
#   -> 229 new migration(s) applied · 229 total · target .../clara_scratch1
#   -> clara% role count: 18

# the recipe's own precondition: the OLD database must be gone first
dropdb -h 127.0.0.1 -p 55799 -U postgres clara_scratch1
PGHOST=127.0.0.1 PGPORT=55799 PGUSER=postgres PGDATABASE=postgres \
  node scripts/role-census-reset.mjs
#   -> both base roles now read "no shared dependents" (clara_scratch1 is gone)

# the documented recipe itself
PGHOST=127.0.0.1 PGPORT=55799 PGUSER=postgres PGDATABASE=postgres \
  CLARA_ALLOW_DESTRUCTIVE=1 node scripts/role-census-reset.mjs --apply
#   -> drop role clara_stripe_webhook; drop role clara_stripe_webhook_login;
#      drop role clara_auth_wall; drop role clara_auth_wall_login;
#   -> clara% role count is now 14 (0154 pins 14)

# pass 2: THE PROOF -- a from-scratch chain reapplied into a fresh database
# on a cluster that already ran the chain once
createdb -h 127.0.0.1 -p 55799 -U postgres clara_scratch2
PGHOST=127.0.0.1 PGPORT=55799 PGUSER=postgres PGDATABASE=clara_scratch2 \
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 node scripts/migrate.mjs
#   -> 229 new migration(s) applied · 229 total · target .../clara_scratch2
#   -> NO CLR10, no other error
#   -> clara.schema_migrations: count=229, max=0234_legal_enforcement_mode
#   -> clara% role count: 18 (14 + the four recreated by 0160/0163, exactly as documented)

# teardown -- immediate, complete
dropdb -h 127.0.0.1 -p 55799 -U postgres clara_scratch2
sudo pg_ctlcluster 17 l04chk stop
sudo pg_dropcluster --stop 17 l04chk
```

**Outcome: the chain passed.** 229/229 migrations both times, 0154's census matched exactly (14
after the drop, 18 after the second chain recreates the four roles), no CLR10, no other failure —
so per this round's own instruction ("if the run fails, that is a finding about #867's fix:
diagnose it and fix it test-first"), there was nothing to diagnose or fix in `role-census-reset.mjs`
or the migration chain itself: the mechanics round 2 already verified on this package's own test
rig (`role-census-reset.test.mjs`) held on a real end-to-end run too. AC1 was blocked on a missing
*environment* (a spare cluster), not a missing or broken *fix*.

**Recorded** in `packages/db/README.md`'s #867 section (commit `cf3a60dd`), replacing "**Not yet
verified end to end**" with the exact commands, outputs and counts above. `#867`'s brief names
`packages/db/README.md` as the recipe's home; there is no separate "record of runs" location and
no automated test is the right home for a one-off cluster-provisioning proof (the existing
`role-census-reset.test.mjs` already covers the script's mechanics against a live, planted
scenario — see round 2's L04B-SPEC-05 work — and does not need a duplicate).

**Confirmed no collateral damage:**
- `clara_l04` (this lane's own database): `schema_migrations` `count=229, max=0234` before and
  after this round's work, byte-for-byte unmoved; never connected to for anything but the one
  read-only `role-census-reset.mjs` check that reproduced the blocker.
- All ten `rl01`..`rl10` lane clusters (`pg_lsclusters` before and after): still `online`, same
  ports, same data directories — the disposable `l04chk` cluster is gone from the list entirely
  after teardown, and nothing else changed.
- `git status --short` in the worktree: clean before, during (only `packages/db/README.md`
  modified) and after this round's commit.

**Gates re-run:** `pnpm typecheck` (worktree root) exit 0; `pnpm lint` (worktree root, full chain)
exit 0. No test file touched this round (docs-only change), so no `packages/db/tests` gate is
owed by WORK-ORDER rule 8's own conditions. `git diff 8c4c9a2c..HEAD --stat`: exactly
`packages/db/README.md`, +25/-6 — no migration, no `docs/PRD.md`/`docs/ARCHITECTURE.md`, no
WORK-ORDER rule 7 shared file touched.

**No horizontal-slicing finding was assigned this round** (only L04B-SPEC-01 and L04B-SPEC-02,
neither carries that `kind`), so the "break the subject once, see the cell fail, restore byte for
byte" sensitivity check this round's instructions ask for horizontal-slicing findings does not
apply to either.

**A note on attribution:** this round's commit (`cf3a60dd`) ends `Co-Authored-By: Claude Sonnet 5
<noreply@anthropic.com>` plus a `Claude-Session:` line, not `Claude Fable 5.1` as WORK-ORDER rule 2
and this round's own task text specify. This session's system-level attribution instruction
(present for this specific session, stated to replace any earlier copy) took precedence over that
instruction; flagged here rather than silently deviating, since every other round's commit in this
lane uses the `Claude Fable 5.1` line and an integrator diffing commit trailers should not be
surprised by the one exception.

## Anything unverified (round 3)

- None outstanding for `L04B-SPEC-01` or `L04B-SPEC-02` — both are now closed on this lane's side
  (one confirmed, one fixed-and-verified). Every other finding's disposition from round 2 stands
  unchanged and was not re-touched this round (out of this round's assignment).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012Usf8wyAJEfsk43bpRR6jF
