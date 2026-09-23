# Wave 3, lane 07, ticket #889 — the counterparty merge door's residue alias write names its recording lane

Branch `riders/w3-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\657`, database `clara_l07`
(127.0.0.1:55747), base `ffe63a0dd084e99b84c1368119845be273c421ce`.

**Status: done.** All acceptance criteria that survived the ticket's narrowing have evidence
below; the from-scratch chain is delegated to the integrator, as RIG.md reserves.

## Commits (this ticket only; #899's three and #1012's eight sit below them on the branch)

| sha | message |
|---|---|
| `6d57162e5` | `feat(db): #889 the merge door's residue alias write names the human lane` |
| `29df86ba7` | `test(db): #889 a merge's alias, revision and event agree, and the writer census closes` |
| `61b7463fb` | `docs(db): #889 the counterparty merge door's own lock order` |

Verified live before building: `gh issue view 889 --comments`. Two comments, both AI-generated
during triage: the original Agent Brief, and a 2026-09-20 triage note that narrows scope after
#1012. The Agent Brief's acceptance criteria that name `clara.tick_seeding_proposal`'s alias
writer are explicitly dropped by the triage note as moot, because #1012 (this same lane, landed
first) turns that whole function into a typed refusal that inserts nothing. I re-verified the
narrowing was still true on this branch before writing anything: `select position('into
clara.counterparty_aliases(' in prosrc) > 0 from pg_proc where oid =
'clara.tick_seeding_proposal(uuid,text)'::regprocedure` read `false` before my migration touched
anything.

## The seams I tested at

From the (narrowed) brief's "Key interfaces", written down before the first test:

1. `clara.merge_counterparties(uuid,uuid,uuid,text,text)` — driven through `humanQuery` as a
   real bookkeeper, the exact floor the door enforces.
2. `clara.counterparty_identity_revisions`, read back as rows for both parties a merge touches
   (the survivor's `alias_added` act and the merged party's `merged` act).
3. `clara.domain_events`, read back for the emitted `counterparty.alias_added` event.
4. A closed-catalog census over `pg_proc`/`pg_namespace`/`has_function_privilege`, matching the
   same instrument the migration's own tail runs.

`clara._tf_counterparty_alias_revision` is named in the brief's "Key interfaces" as **unchanged**
— pinned as a witness in the migration, never driven as a seam of its own, because it already
copies `new.recorded_via` verbatim; fixing the write fixes the revision and the event for free.

## Migration

`packages/db/migrations/0289_merge_alias_lane.sql` (the number reserved for this ticket; used).
House shape: S0 prestate, S1 the one-anchor splice (bimodal, redo-safe both ways), S2 the
re-substitution proof and witness re-pin, S3 the closed-world census — S2 and S3 are two
**separate** `do` blocks on purpose (see "A lint false positive, found and fixed" below).

### Prestate pin, MEASURED on `clara_l07` on 2026-09-23, after #899 (0287) and #1012 (0288) applied

**Bimodal** (#957 — first apply = the pre-splice sha; redo = the body this file's own S1 already
installed):

| signature | sha256(prosrc) | branch |
|---|---|---|
| `clara.merge_counterparties(uuid,uuid,uuid,text,text)` | `840180a8c22a4d43c2ed9b69c0907c568368201a0b348bb9415b66a1d46546c2` | first apply — **identical to 0215's own P6 residue pin**, confirming the body has not moved since 0149's S2 splice installed it; no ticket before this one in this lane touched it (`git log <base>..HEAD -- packages/db/migrations` names only 0287 and 0288, neither mentioning `merge_counterparties`) |
| `clara.merge_counterparties(uuid,uuid,uuid,text,text)` | `2e4cb1af232e4b9ef6eec18c9b147fe0d2beefe40fff5b04d31d2b8d4782f8f9` | redo — the post-splice body this file installs |

**Hard, single-valued witnesses** (bodies this file must not touch; each re-pinned in the tail):

| signature | sha256(prosrc) |
|---|---|
| `clara._tf_counterparty_alias_revision()` | `bab93f74d1bfb2b6ca6525d64b473bf0a4d2c25e99a56870b6e4c3dd9d672ce3` |
| `clara._tf_counterparty_merge_revision()` | `47138417e7ba7c3d23ec82963e08df6a953ba6d7a0befddb6f4226bfa6639e88` |
| `clara._append_counterparty_identity_revision(uuid,uuid,uuid,text,jsonb,jsonb,text,uuid,text,uuid,uuid,uuid,uuid,text)` | `ca080f22caca1c16d2d4f0f0132b07c97296ffb28e33caaca786363bd988a569` |
| `clara.add_counterparty_alias(uuid,uuid,text,text,text,text,uuid,uuid,uuid,text)` | `5922d2cb95dd6a8f24da1e3d0c2acdb26a4ba6dbab04938bffa772225ca405da` |
| `clara.rename_counterparty(uuid,uuid,text,text)` | `aaaaa2c8be919f227910babbefe33e3b7139e17e110313737b1bc9026b7928fd` |

### Redo, proven both ways for real

Applied first-apply once, then redone THREE times through
`CLARA_MIGRATION_REDO=0289_merge_alias_lane` (always `CLARA_ALLOW_DESTRUCTIVE=1
CLARA_RIG_DB=1`, always the highest applied version) while fixing a notice-message variable bug
and, separately, the lint false positive below. Final state: `redid 0289_merge_alias_lane · new
checksum 5a5d1a4278f35fed41ef7d7c6a1414c3a890b5b13c87e6fce83f7c56d6bd2c56`, 270 migration files
applied.

**I proved the FIRST-APPLY branch for real, not by reasoning, twice**: once as the genuine first
apply, and once more during the vacuity control below, where I manually reverted the live body
to the exact pre-image (reconstructed byte-for-byte from `pg_get_functiondef` by reversing the
splice) and re-ran the file — its S0 correctly read the reverted sha, took the `first_apply`
branch, and the tail printed `branch first_apply` rather than `branch redo`.

### A lint false positive, found and fixed

`CI=true GITHUB_ACTIONS=true pnpm lint`'s `wiki-dynamic-sql` check (0019 §9's repo-side half)
initially FAILED against my first draft: it classifies any `do $tag$…$tag$` block that both calls
`pg_get_functiondef` and contains the bare word `execute` anywhere (including inside an unrelated
string literal) as installing a callable surface, then scans every quoted literal in that block
for dynamic-SQL statements. My original single tail block called `pg_get_functiondef` (for the
re-substitution proof) **and** ran the closed-world census's
`has_function_privilege(role_name, p.oid, 'execute')` — the privilege NAME, not a dynamic-SQL
keyword — in the SAME block, so the literal `'execute'` was extracted as a fragment and reported
as an unprovable dynamic-SQL execute. **Fix: split the tail into S2 (re-substitution proof +
witness check; calls `pg_get_functiondef`, no `'execute'` literal) and S3 (the census; calls
`has_function_privilege(…,'execute')`, no `pg_get_functiondef`)** — two separate `do` blocks, so
neither one satisfies both halves of the lint's classification. Re-ran `node
scripts/check-wiki-dynamic-sql.mjs` clean afterward (`wiki-dynamic-sql: OK — 1432 … 227
change-of-record patch(es) scanned`), and the whole-repo `pnpm lint` green. This is a real
interaction with existing shared infrastructure, recorded in the migration's own S2/S3 header
comments so a future reader does not reintroduce it.

### Vacuity control

Before accepting either test cell, I manually reverted the live `clara.merge_counterparties` body
to its exact pre-0289 pre-image (reconstructed from `pg_get_functiondef` by reversing the one
splice, verified `sha256(prosrc)` back to `840180a8…`) and drove a real merge directly (bypassing
the test file's own readiness gate, which is BY DESIGN keyed to the same sha and would otherwise
correctly skip rather than run against that frontier). The result reproduced the bug exactly:
`alias.recorded_via = legacy_unknown`, the survivor's `alias_added` revision =
`legacy_unknown`, the merged party's `merged` revision = `human_ui` — **disagreeing**, which is
the defect the ticket names. I then ran the real test file: `p889.merge.human_lane` and
`p889.census.no_legacy_writer` both FAILED, correctly, via the fail-closed `need()` gate (the
readiness sha check refused to run behavior-dependent assertions against a frontier it did not
recognize as 0289). I restored the fix with `CLARA_MIGRATION_REDO=0289_merge_alias_lane`
(byte-for-byte back to the pinned post-splice text — the migration's own tail proves this, not
merely my own restoration script) and re-ran: both cells green.

## Acceptance criteria, with evidence

The Agent Brief's acceptance criteria, filtered by the 2026-09-20 triage note (the two mentioning
`tick_seeding_proposal`'s alias writer are dropped as moot).

**AC1 — a cell merges two counterparties and asserts the alias row, its revision and its event
all carry the human lane and agree.**
`merge-alias-lane.test.mjs` → `p889.merge.human_lane` — **PASS**. Drives a real merge through
`humanQuery` as a bookkeeper; reads the carrier's `alias_id`, the alias row's `recorded_via`, the
survivor's `alias_added` revision (matched by `alias_id`, not merely by act name, so a coexisting
unrelated alias cannot satisfy it), the merged party's `merged` revision, and the emitted
`counterparty.alias_added` event's payload — all four assert `'human_ui'`, and the two revision
acts are asserted to agree with each other, which is the exact disagreement the bug produced
(proven by the vacuity control above).

**AC2 — a cell ticks a seeding proposal with aliases and asserts the seeding lane.**
**Dropped by the triage note as moot** — #1012/0288 already removed `tick_seeding_proposal`'s
insert outright, so there is no alias-writing tick left to assert a lane on. Verified structurally
(not merely trusted): `p889.census.no_legacy_writer`'s second half queries
`position('into clara.counterparty_aliases(' in prosrc) > 0` for
`clara.tick_seeding_proposal(uuid,text)` directly and asserts it is `false`.

**AC3 — a census cell asserts no writer reachable from an application role can still land
`legacy_unknown`; pre-existing rows keep theirs.**
`merge-alias-lane.test.mjs` → `p889.census.no_legacy_writer` — **PASS**. A catalog query over
`pg_proc`/`pg_namespace`, filtered to functions whose `prosrc` contains
`into clara.counterparty_aliases(` AND that are EXECUTE-granted to at least one of
`clara_authenticated` / `clara_agent_ro` / `clara_wake_interactive` / `clara_wake_proactive` /
`clara_runtime`, returns EXACTLY `{add_counterparty_alias, merge_counterparties,
rename_counterparty}` — a closed roster, asserted with `assert.deepEqual` against the sorted
expected array, so a fourth member appearing (or one vanishing) fails loudly rather than being
silently tolerated. Each member's comment-stripped code is checked to contain `recorded_via`
between its `into clara.counterparty_aliases(` and the matching `values(`. The SAME instrument
runs a second time, independently, inside the migration's own S3 tail at apply time (so drift is
caught at both migration-apply time and by the daily battery). "Pre-existing rows keep theirs" is
true by construction: this migration's splice is a pure `CREATE OR REPLACE FUNCTION` on the
DOOR's body — it contains no `UPDATE` of `clara.counterparty_aliases` at all, so no existing row's
`recorded_via` can move; the migration's own S1 anchor-count check (exactly one occurrence) is the
structural proof no stray statement was added.

**AC4 — the README entry names the three rungs in order and the deadlock class.**
`packages/db/README.md`, new section "The counterparty merge door's own lock order" (right after
the existing "Member doors: the lock order other migrations depend on" section) — names the three
rungs in the body's own order (both counterparty rows `for update` in `id` order; the alias
insert; the merged party's `coding_rules` rows `for update`, vendor_account then autopost), each
with its exact 0015 line citation, and names the deadlock class explicitly: an AB/BA lock-order
inversion between two sessions that would otherwise acquire the same two row locks in opposite
orders, the classic `40P01` shape, avoided by sorting on `id` rather than on the caller's argument
position — the same fix shape the member-doors section documents for `clara.firms`, independently
(no shared lock: nothing here touches `clara.firms`, nothing there touches
`clara.counterparties`).

**AC5 — from-scratch apply with the splice proof; counterparty identity and merge suites
green.**
From-scratch apply: **not run by me** — RIG.md reserves it for the integrator on a disposable
cluster and forbids a second from-scratch chain on a lane cluster (0154 pins the cluster-wide
role count). What I can offer instead: 0289 applied cleanly as file 270 on a database migrated
0001 → 0272 from scratch, then 0287 (#899), then 0288 (#1012); its own S0 refuses rather than
adapts if any premise (the `recorded_via` column, the 0215 CHECK, or the pinned body) is missing.
The splice proof itself (S1's anchor-count check, S2's re-substitution reconstructing the
pre-image byte-for-byte from the post-image) IS run, every apply and every redo — see the migrate
notices quoted below.
Suites: **counterparty identity and merge suites green** — see Gates below (86/86 across
`counterparty-identity.test.mjs`, `counterparty-merge-pr-1.test.mjs`,
`counterparty-merge-pr-1b.test.mjs`, `counterparty-alias-kind.test.mjs`,
`seeding-lane-retired.test.mjs`, `client-birth-wall.test.mjs`).

## Gates, with counts

Every db run below preloads the FULL gate chain (87 `--import` flags taken from
`packages/db/package.json`'s `test` script, including this ticket's own new gate module);
`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | result |
|---|---|
| `merge-alias-lane.test.mjs` (new) | **2/2 pass** |
| `preintegration-gate-chain.test.mjs` | **5/5 pass** (confirms the new `--import` token is preloaded and names a real file) |
| `counterparty-identity.test.mjs` + `counterparty-merge-pr-1.test.mjs` + `counterparty-merge-pr-1b.test.mjs` + `counterparty-alias-kind.test.mjs` + `seeding-lane-retired.test.mjs` + `client-birth-wall.test.mjs` | **86/86 pass** (the last two are this lane's own prior tickets, re-run for regression) |
| `operation-census.test.mjs` | **10/10 pass** |
| `rig-isolation.test.mjs` | **22/22 pass, 1 skip** (T19's destructive poison-role drill — the reset flag is correctly never set), 0 fail |
| `node scripts/check-wiki-dynamic-sql.mjs` | OK — 1432 function definitions, 227 change-of-record patches scanned, no finding |
| `pnpm typecheck` (root) | exit 0 — `apps/web` and `packages/runtime` both Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root, the wave-3 addendum's runner shape) | exit 0 |

**`apps/web`, `packages/runtime`, browser walks: none touched, none run.** This ticket edits only
`packages/db/migrations`, `packages/db/tests`, `packages/db/package.json` and
`packages/db/README.md`; the work order's web-unit-suite and Playwright-walk gates apply only
when `apps/web` is touched, and it was not.

## Docs

- `packages/db/README.md` — new section "The counterparty merge door's own lock order" (AC4).
- **`CONTEXT.md` — not touched, deliberately.** No new vocabulary: "Counterparty alias" already
  documents "Each alias records the lane that wrote it (a person in the app, Clara, client setup,
  or an unrecorded legacy lane)" — this ticket makes an existing writer honest about a concept
  CONTEXT.md already names, it does not coin one.
- `packages/db/tests/rig-meta.mjs` — **not touched**. This ticket recuts an existing function's
  BODY only; no grant moves and no function is added or removed, so there is nothing for the
  WRITERS grant-matrix census to record. (#899 and #1012, the two tickets before this one in the
  lane, each had a hunk there for their own reasons; #889 has none.)

## Successor contract

**None is owed.** This is a pure data-layer honesty fix inside an existing human-only door; no
frozen workflow body or closure module calls `clara.merge_counterparties`, and nothing here adds,
removes or reshapes a part kind, a door call, a refusal mapping or a prompt stanza a chat or Work
tool would need. `node scripts/check-frozen-workflows.mjs` (run as part of the root lint chain
above) shows no manifest diff.

## Follow-ups worth filing

1. **The lint's CoR-patch classifier can be tripped by an unrelated `'execute'` string literal
   co-located with a `pg_get_functiondef` call in one `do` block.** I worked around it here by
   splitting my own tail into two blocks (S2/S3), which is also better-organized on its own
   merits, so I am not filing a ticket to WIDEN the lint — but a future migration that
   legitimately needs both `pg_get_functiondef` and `has_function_privilege(…,'execute')` in ONE
   block (not two, for some structural reason) would hit the same false positive and might not
   have as clean a split available. Worth a note in `scripts/wiki-lint-checks.mjs`'s own header
   for the next person who meets it, naming the workaround.
2. **The README's "Member doors" and my new "counterparty merge door" lock-order sections are
   siblings that do not cross-reference each other.** Both document the same class of fix
   (sort by a stable key, not by caller argument order, to avoid an AB/BA deadlock) for two
   unrelated tables. A future reader hunting for "how does this codebase avoid deadlocks" would
   benefit from a short index section listing every documented lock order in one place, rather
   than discovering each one by grepping for "lock order". Not this ticket's to build.

## Anything unverified

- **The from-scratch chain.** Not run by me; RIG.md reserves it for the integrator on a
  disposable cluster.
- **The runner's own WSL re-run of new runtime test files.** N/A — this ticket touches no
  `packages/runtime` file.
- **Hosted/production behaviour.** Everything above is measured on `clara_l07`, a rig database
  migrated from scratch this wave; I have not observed a real firm's merge produce
  `legacy_unknown` in production, only reasoned it from the pinned pre-image body and reproduced
  it directly via the vacuity control's manual revert.
