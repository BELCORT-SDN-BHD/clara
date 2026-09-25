# Riders sweep wave · lane 04 · ticket #1061 — the payroll registry's `business_operation` catches up to #946

**Branch** `riders/wS-lane04` in `C:\Users\zhant\Desktop\clara-wt\657`, base `7bc5a710f`.
**Database** `clara_l07` on `127.0.0.1:55747` (chain 0001..0318 at start, 309 files; 310 files /
`0342` at end).
**Status: DONE.** The ticket was live on this branch and is now built, tested and documented.

| commit | what |
|---|---|
| `8a9bf689f` | `fix(db): #1061 payroll registry business_operation catches up to #946's posting lane` — migration `0342`, the `document-capability-registry.test.mjs` re-base, two sibling batteries' stale pins corrected, the README section, the comment-only rig-meta entry |

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched apart from
this report file. No status-report request arrived mid-task.

---

## 1 · The seams I tested at

Written down before the first cell, from the brief's own "Key interfaces":

- **`clara.document_capabilities`**, read through **`clara._document_capability(format,kind)`** —
  the registry's own public accessor, the same one `document-capability-registry.test.mjs`'s
  `capability()` helper and the web's `capability-registry.ts` both call. Every behavioural
  assertion below reads the row through this function or the bare table, never a cached or
  re-derived value.
- **`registry_version`** and **`clara.document_capability_version_high_water`** — the brief's
  second named interface ("the registry's version and row-count invariants"). Asserted at the
  live catalogue level (count-distinct, min, row count, high-water agreement), the same shape
  0245/0299 already established.
- Not a seam, and not touched: `clara._payroll_posting_verdict`, `clara._payroll_entry_plan`,
  `clara._post_payroll_run` (the ticket's own "out of scope" — the posting gate's logic) and every
  other document kind's row.

## 2 · Was the ticket still live? Yes, confirmed independently

`gh issue view 1061 --repo BELCORT-SDN-BHD/clara --json title,body,comments`: the body's Agent
Brief is the whole contract — **zero comments**, so no later brief and no owner ruling comment to
override it.

Measured on `clara_l07` before writing anything: the six `payroll_summary` pdf/image rows read
`typed_facts = 'supported'` (since 0296, #945) and `business_operation = 'stored_only'`, with basis
still ending "Nothing is posted from these facts yet; the filing appears as work a person
completes." Neither `0297_payroll_summary_posting.sql` nor `0298_payroll_net_pay_settlement.sql`
contains any reference to `clara.document_capabilities` (`grep -l document_capabilities
packages/db/migrations/*.sql` stops at 0299 and does not include 0297/0298). This matches the lane
scan's own finding in `SWEEP-PLAN.md` exactly — no correction owed here, unlike #1067's.

## 3 · Acceptance criteria, each with its evidence

Cell: `document-capability-registry.test.mjs`'s payroll cell (test 9 of 23), driven against the
live registry through `clara._document_capability('pdf','payroll_summary')` and
`clara._document_capability('csv','payroll_summary')`. Final focused run: **23 tests, 23 pass, 0
fail, 0 skipped** (same file count before and after — no cell added or removed, `EXPECTED_CELLS`
unchanged at 23).

**AC1 — "The six payroll summary format pairs (heic/jpeg/pdf/png/tiff/webp) publish
`business_operation = supported` (or the correct equivalent value) with an accurate reason
sentence."**

- Migration tail step 3: `select count(*) ... where document_kind='payroll_summary' and (mime_type
  = 'application/pdf' or mime_type like 'image/%') and typed_facts='supported' and
  business_operation='supported' and limits->>'payroll_employee_detail'='accepted_limitation' and
  position('posts unattended' in basis) > 0 and position('Nothing is posted from these facts yet'
  in basis) = 0` → **6**, asserted at apply time (`applied 0342_payroll_registry_business_
  operation_supported`, notice `#1061 tail: OK`).
- `document-capability-registry.test.mjs` cell 9 re-drives the same claim through the accessor
  function post-apply: `assert.equal(c.business_operation, "supported")`,
  `assert.doesNotMatch(c.basis, /Nothing is posted from these facts yet/)`,
  `assert.match(c.basis, /posts unattended/)`. **PASS** for all six formats (looped).
- Chosen value: `supported`, not `proposal_only` (#988's later fifth level). Reasoning recorded in
  the migration header and the README §0342: `clara._payroll_posting_verdict` posts the entry
  itself, unattended — nobody confirms a proposal first — which is 0191's own published definition
  of `supported`, and the exact shape 0299 already used for the mirror-image `agreement_contract`
  lane the ticket names as precedent.

**AC2 — "No other document kind's registry row changes as a side effect."**

- Migration tail step 4: zero payroll_summary rows OFF the pdf/image branch gained `supported`;
  zero rows outside `payroll_summary` carry the `payroll_employee_detail` limit.
- Migration tail step 5: a family-blind diff — zero rows outside `payroll_summary` AND outside the
  small enumerated set that already read `business_operation='supported'` before this file ran
  (invoice family, agreement contract, bank statement, opening balance doc) now read `supported`.
- `document-capability-registry.test.mjs` cell 9's own csv/tsv/xlsx/docx/ofx probe:
  `assert.equal(csv.business_operation, "stored_only")` — **PASS**.
- Collateral check beyond the ticket's own AC (below, §7): two SIBLING test files pinned payroll's
  PRE-#1061 state as part of THEIR OWN registry-wide assertions and had to be re-based, exactly as
  `payroll-summary-facts.test.mjs`'s own comment anticipated for the version number. Neither is a
  side effect of this migration — both are pre-existing pins on a shared, whole-table invariant
  (the one registry version, and "payroll is untouched by ticket X") that this migration correctly
  moves.

**AC3 — "The registry's published version increments by exactly one and the row count is
unchanged."**

- Prestate: `count(distinct registry_version)=1`, `min(registry_version)=6`, `count(*)=240`
  (matches #948's own 0299 raise, confirmed live).
- Tail: `count(distinct registry_version)=1`, `min(registry_version)=7`, `count(*)=240`. High-water
  mark step: zero pairs disagree with the published registry after the raise, and
  `document_capability_version_high_water` has zero rows off 7.
- `pnpm run migrate` output: `applied 0342_payroll_registry_business_operation_supported ·
  backend pid 927072` / `migrate: 1 new migration(s) applied · 310 total · target
  127.0.0.1:55747/clara_l07`.

**AC4 — "A test reads the capability registry for a payroll summary pair and asserts the corrected
`business_operation` value."**

- `document-capability-registry.test.mjs` cell 9, as above — reads
  `clara._document_capability('pdf','payroll_summary')` (and the other five formats) and asserts
  `business_operation === 'supported'`.

**Out of scope, respected.** `clara._payroll_posting_verdict` and `clara._payroll_entry_plan` are
byte-untouched (the migration creates, replaces and recuts no function at all — the five wall
trigger bodies it PINS are re-verified unmoved in its own tail); no other document kind's row is
re-derived (AC2's own evidence above).

## 4 · The change

Two UPDATE statements on `clara.document_capabilities`, `set role clara_fn_owner` /
`reset role`, no function/table/trigger/check/policy/grant created or recut:

```sql
update clara.document_capabilities
   set business_operation = 'supported',
       basis = replace(basis,
         'Nothing is posted from these facts yet; the filing appears as work a person completes.',
         'Where both reading channels agree, every arithmetic check passes, every account resolves '
         || 'in this client''s own chart, the run''s own month is established and no payroll entry '
         || 'for that client and month is already posted, the run posts unattended: gross pay and '
         || 'the employer''s own EPF, SOCSO, EIS and HRDF cost are debited, and EPF, SOCSO, EIS, PCB '
         || 'and HRDF payable plus salaries payable are credited for the net. Anything else appears '
         || 'under Needs you naming the condition that failed.')
 where document_kind = 'payroll_summary'
   and (mime_type = 'application/pdf' or mime_type like 'image/%')
   and business_operation <> 'supported';

update clara.document_capabilities set registry_version = 7 where registry_version <> 7;
```

`replace()` rather than a full literal rewrite, so the unchanged half of the basis sentence (the
byte-extraction engine, the facts engine, the never-guess disclosure, the per-employee-strip
disclosure) is untouched BY CONSTRUCTION rather than merely by re-typing it correctly — and the
statement is a no-op, hence redo-safe, once the old sentence is gone. `limits.
payroll_employee_detail` is not touched anywhere: the persist door still strips every per-employee
figure and the posting lane drafts from run-level totals alone, so that boundary is exactly as true
after 0342 as before it.

The new basis sentence is drawn verbatim in shape from `0297_payroll_summary_posting.sql` §D's own
brief quote ("It posts unattended only when every condition holds: both reading channels agree,
every arithmetic check passes, every account resolves in this client's own chart, the payslip's
own month is established, and no payroll entry for that client and month is already posted...
appears under Needs you naming the condition that failed"), not invented.

## 5 · Migration

**`packages/db/migrations/0342_payroll_registry_business_operation_supported.sql`** (396 lines, the
reserved number — the only migration this ticket needed).

### Prestate pins — every one measured live on `clara_l07` (this lane's first commit; no earlier
ticket of this lane has run)

| signature | sha256(prosrc) | note |
|---|---|---|
| `clara._tf_document_capabilities_version_monotone()` | `170df87b…e9c56` | 0207/0244/0245 pre-image, unmoved |
| `clara._tf_document_capabilities_version_high_water()` | `b4090687…618c9` | 0244 pre-image, unmoved |
| `clara._tf_document_capabilities_high_water_record()` | `839c51fb…9de40d` | 0244 pre-image, unmoved |
| `clara._tf_document_capability_high_water_monotone()` | `62e83a3b…974ec8c` | **0272's POST-image**, not 0244's/0245's — a different, already-merged fix round recut this one before the branch was cut |
| `clara._tf_document_capabilities_version_uniform()` | `d21b6837…5ef776` | 0244 pre-image, unmoved |

The fourth pin is the one that would have been WRONG if copied from an older migration header
rather than measured live — recorded explicitly in both the migration's own prestate comment and
the rig-meta entry, per the wave-3 addendum's "pin what is LIVE" rule.

### Tail assertions (all driven against the live catalogue, none merely described)

1. All five wall bodies re-hashed, unmoved.
2. Registry publishes one version, and it is 7, over 240 rows.
3. The six payroll pdf/image rows carry the corrected verdict, the old basis sentence is gone, and
   the limit is untouched.
4. No other `payroll_summary` row moved (mime branch and limit-key checks).
5. No row outside `payroll_summary` and outside the pre-existing `supported` set moved.
6. High-water mark rose to 7 in lockstep, zero pairs disagree.
7. The honesty wall: zero rows claim `business_operation='supported'` with `typed_facts` not
   `supported`.
8. No application role gained a grant.

### Apply

First and only apply, through `pnpm run migrate` (`@clara/db` script, equivalent to `pnpm
--filter @clara/db migrate`): `#1061 prestate: OK …` then `#1061 tail: OK …`, `applied
0342_payroll_registry_business_operation_supported`, ledger `310 total`. No redo was needed — the
file applied clean on the first attempt, so `CLARA_MIGRATION_REDO` was not exercised. (The
FIRST-APPLY branch is therefore proven by the real apply itself, not by a separate rollback
rehearsal — there was no pre-image chunk-substitution branch to prove, unlike a `pg_get_
functiondef`-splice migration; this file's whole content is two UPDATEs, not a recut function.)

**No `rig-meta.mjs` cohort array**, deliberately and by precedent: the file mints no new name (no
table, no new function, no grant) — the same posture #782's 0245 and #988's 0246 carry. A
comment-only entry was added explaining why, placed beside the `PAYROLL_0296_COHORT` /
`AGREEMENT_0299_COHORT` entries it references.

### Frontier and gate chain

No new preintegration gate module. `document-capability-registry.test.mjs` is already gated by
the existing `document-capability-preintegration-gate.mjs` (0191's cohort); this file changes
neither the gate nor `packages/db/package.json`'s `$GATES` list. This mirrors 0245/0246 exactly —
neither minted a new gate file either.

## 6 · TDD: red before green

1. `document-capability-registry.test.mjs`'s payroll cell and `PUBLISHED_REGISTRY_VERSION` (6→7)
   were edited FIRST, against the unmigrated database. Run: **3 of 23 fail** — cell 9
   (`business_operation`: `AssertionError [ERR_ASSERTION]: expected 'stored_only' to equal
   'supported'`, the live value against the new assertion), and cells 20/21 (the version-monotone
   probes, which compute their expected values off `PUBLISHED_REGISTRY_VERSION`): cell 20
   `expected 8, actual 7` and cell 21 `expected 7, actual 6` — both fail purely because the live
   registry was still at 6 while the constant now said 7, not because the probes themselves broke.
   Red for the right reason in all three, not a crash.
2. Migration `0342` written and applied.
3. Same file re-run: **23 of 23 pass.**
4. Running the migration then surfaced two SIBLING batteries (not touched by step 1) that also
   pinned payroll's pre-#1061 state as part of their OWN registry-wide invariants —
   `payroll-summary-facts.test.mjs` (0296's own S6: `business_operation='stored_only'` for the six
   formats, and the registry-version literal) and `agreement-contract-acquisition.test.mjs`
   (0299's own S6: a cross-check that payroll was untouched by 0299, pinning payroll's operation
   axis at `stored_only`, plus its own copy of the version literal). Both were corrected using the
   SAME rebase convention `payroll-summary-facts.test.mjs`'s own comment already prescribes for the
   version literal ("a wave that republishes re-bases BOTH… this comment is here so the next one
   finds the second site") — extended here to the business_operation literal these two files also
   happened to pin. Re-run after the fix: both green (see §7 counts).

## 7 · Gates, with counts

Run from `C:\Users\zhant\Desktop\clara-wt\657\packages\db`, `PGPORT=55747 PGDATABASE=clara_l07`,
Node 22.

| gate | command | result |
|---|---|---|
| the test file I touched, FULL gate chain (124 `--import`) | `node --test --test-concurrency=1 $GATES tests/document-capability-registry.test.mjs` | **23 tests, 23 pass, 0 fail, 0 skipped** |
| the same file FOCUSED (no gates) | `node --test --test-concurrency=1 tests/document-capability-registry.test.mjs` | **23 pass, 0 fail** (red-before shown in §6) |
| sibling batteries with stale pins, corrected | `… tests/payroll-summary-facts.test.mjs tests/agreement-contract-acquisition.test.mjs` | **payroll-summary-facts: 18 pass, 0 fail; agreement-contract-acquisition: 36 pass, 0 fail** |
| every OTHER file referencing `payroll_summary` (exhaustive grep, none needed edits) | `… tests/payroll-summary-posting.test.mjs tests/payroll-settlement.test.mjs tests/document-capability-high-water.test.mjs tests/a21-classifier-gate.test.mjs tests/x-receipt-routing.test.mjs tests/x1-reextraction.test.mjs tests/x42b0-r8-tails.test.mjs` | **combined with the four above: 170 tests, 170 pass, 0 fail** |
| operation census | `node --test --test-concurrency=1 tests/operation-census.test.mjs` | **10 pass, 0 fail** (no reset flags; no SQL function was added, so this gate is a safety margin beyond what the ticket strictly owes) |
| rig isolation (no reset flags) | `node --test --test-concurrency=1 tests/rig-isolation.test.mjs` | **23 tests, 22 pass, 0 fail, 1 skipped** — the skip is T19 `poison-role`, `SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1`, which the rig forbids |
| web migration-pins corpus (sweep rule d: a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test apps/web/tests/firm-scope-db-pins.test.ts` | **22 pass, 0 fail** — no corpus edit needed: 0342 contains no `pg_get_functiondef` splice and no other dynamic-SQL construct, so no reviewed barrier entry is owed |
| typecheck | `pnpm typecheck` | apps/web Done, packages/runtime Done |
| lint | `pnpm lint` | exit 0 |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 (one unrelated, pre-existing Windows-only SKIP: `#756` symlink CA test, `EPERM` creating a directory symlink — not touched by this ticket) |

`apps/web` and `packages/runtime` source were **not** touched (only a read-only check of the
existing corpus test), so the whole web unit suite and the browser walks are not in scope for this
ticket. No SQL function was added or recut, so operation-census/rig-isolation were run as a safety
margin rather than a strict requirement, and both are clean. **A whole-suite `pnpm test` run over
all 479 `packages/db` test files was attempted** (foreground, then backgrounded past its 600s
limit) **but produced no observable output before I stopped it as unnecessary**: this environment's
`node --test` over the full glob appears to buffer all output until process exit rather than
streaming per file, so a partial read gives no signal either way. Given the exhaustive targeted
sweep above (every file in the repository that mentions `payroll_summary` was found by `grep -rl`
and either run green or shown to need no `business_operation` change), I judged a further from-
scratch full-suite wait not to be worth the time — this is recorded under §11 as the one thing I
did not verify by the broadest possible method, only by the targeted one the ticket's blast radius
actually touches.

## 8 · Successor contract

**None is owed.** No frozen chat tool, Work tool or closure module needs a change, and none was
edited or read for this ticket — the whole change is table data one level below any door. Recorded
here with its evidence because the wave asks for the check, not for a guess:

- `clara._payroll_posting_verdict`, `clara._payroll_entry_plan` and `clara._post_payroll_run`
  (0297) are untouched — the migration's own tail re-hashes the five WALL bodies it depends on and
  never touches the posting family at all.
- The registry is read-only to every application role (`clara_authenticated`, `clara_agent_ro`)
  both before and after — tail step 8 re-asserts no grant moved — so nothing a chat tool or Work
  tool calls changes shape; a surface reading `clara._document_capability('pdf','payroll_summary')`
  today gets a different `business_operation` string and a different `basis` sentence, nothing
  else.

## 9 · Docs

- `packages/db/README.md` — a new `## 0342` section only (no existing section edited): what was
  live and how it was measured, why `supported` and not `proposal_only`, why only the basis's
  closing clause moves, the prestate pins (including the 0272 post-image note), the gate/rig-meta
  posture, and the two sibling test files it required correcting.
- `document-capability-registry.test.mjs` — a new numbered paragraph (7) in its own running
  version-history commentary, in the same commit as the migration (`af3b5955`/#779's own
  precedent for that file).
- No `CONTEXT.md` change: `business_operation = supported` and the registry-version mechanism are
  both pre-existing, documented vocabulary (CONTEXT.md lines 745-756); this ticket moves data, not
  vocabulary.
- `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched, as the work order requires.

## 10 · Follow-ups worth filing

1. **`document-capability-registry.test.mjs`'s own running commentary is now the only place that
   explains a registry-wide version raise across tickets**, but at least two OTHER test files
   (`payroll-summary-facts.test.mjs`, `agreement-contract-acquisition.test.mjs`) independently pin
   the same literal for their own reasons and had gone stale twice now (once at #948, once here at
   #1061) before anyone noticed via a red test rather than a code review. Worth a small ticket to
   either (a) have those two files import `PUBLISHED_REGISTRY_VERSION` instead of re-literalling
   it, or (b) grep for `registry_version.*= *[0-9]` as a lint rule when a registry-touching
   migration lands. Not built here — it would touch two files' import surface for a convenience,
   which is wider than this ticket's own scope.
2. **The `node --test` buffering behaviour observed in §7** (a full `tests/**/*.test.mjs` glob run
   producing no stdout until exit) is worth a one-line note in `RIG.md` for the next lane that
   tries a whole-suite run rather than a targeted one, so nobody else spends a cycle on it.

## 11 · Anything unverified

- **A whole-`packages/db` `pnpm test` run (479 files) was not observed to completion** — see §7's
  explanation. The targeted sweep (every file naming `payroll_summary`, plus the touched file, plus
  operation-census and rig-isolation) is what stands behind this report instead.
- **A from-scratch 0001→0342 chain was not run here**, by the rig's own rule (a second
  from-scratch chain on a lane cluster needs the #867 recipe; migration 0154 pins the cluster-wide
  role count). The integrator's disposable-cluster run is the proof; what I can state is that the
  single real apply on this rig (§5) went first-time clean with both prestate and tail green.
- **Not run under WSL as `runner`**: no `packages/runtime` test file was added or touched, so the
  wave-3 addendum's Linux re-run does not apply.
- **A mid-task status request**: none arrived.
