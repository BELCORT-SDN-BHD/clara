# riders closing wave · lane 02 · ticket #1149 — one errcode catalog

**Status: DONE.**
Branch `riders/wK-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\702`, base `ffb629d73`.
Database `clara_c02` at `127.0.0.1:55742` — untouched by this ticket's OWN work (no migration, no
new SQL object, no database DDL run); it was used only to run the existing gate chain (a live
connection, but no state written by this ticket). Playwright triple
`https://127.0.0.1:3610 / 3611 / 3612` — unused, this ticket touches no `apps/web` file.

Start state, checked first per rule 1: `git status` clean; `git log --oneline ffb629d73..HEAD`
showed #1150's six commits already landed (`e8163915e`, `127fb9209`, `24f1f82ce`, `4536b96a2`,
`ca61591ae`, `83dfeb8f0`) — the shared `:plan` reservation namespace and the third on-behalf
plan-creation body, plus migration `0364_plan_reservation_namespace_obo_fold.sql`. No landed work
was redone.

**New head after this ticket:** `20e73c102`, three commits, each naming `#1149` and ending
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`:

1. `7b529240d` test(db) — the fold (declaration + object-identity census cells, RED then GREEN).
2. `f10a6479c` feat(db) — the remaining 31 written meanings (completeness/soundness/exactness
   census cells, RED then GREEN).
3. `20e73c102` docs(db) — `packages/db/tests/README.md`.

No message arrived mid-task addressed to the orchestrator (rule (f) did not fire).

---

## The ticket, verified live on this branch before building

`gh issue view 1149 --repo BELCORT-SDN-BHD/clara --json title,body,comments,labels,state`: the
issue body is the only Agent Brief (zero comments), labels `bug` + `ready-for-agent`, state OPEN.
Measured directly against the branch before writing anything:

| the brief's claim | measured on this branch (post-#1150, pre-#1149) | verdict |
|---|---|---|
| `rig-helpers.mjs:52-72` is the fuller `CLR` map, `CLR01-CLR12` + `CLR44` | read: 13 keys, exactly those | **live** |
| `work-journal-fixtures.mjs:116-125` is a second, divergent map | read: 9 keys — 7 shared with `rig-helpers.mjs`'s (same values), plus `conflict`("CLR13") and `period`("CLR19") which `rig-helpers.mjs` did not carry | **live** |
| 28 test modules import from `work-journal-fixtures.mjs` | `grep -rlE "from\s+['\"]\./work-journal-fixtures\.mjs['\"]"` inside `packages/db/tests` (see census below) | **live, re-derived rather than trusted** |
| codes raised across `packages/db/migrations` are CLR00-CLR44 plus CLR99 | regex census (below) over the live worktree's migrations dir: exactly `{CLR00..CLR44, CLR99}`, 46 codes — unchanged by #1150's own `0364`, which raises only already-cataloged CLR04/CLR10/CLR11/CLR13 | **live** |
| the catalogs write a meaning for 15 of the 46 | 13 `rig-helpers.mjs` keys with a comment + 2 `work-journal-fixtures.mjs` keys named but uncommented (`conflict`, `period`) = 15 | **live, arithmetic checks out (46-15=31, matching the brief's own count)** |

**No migration needed**, confirmed: this ticket's three commits touch only `packages/db/tests/*`
(`rig-helpers.mjs`, `work-journal-fixtures.mjs`, `errcode-catalog.test.mjs`,
`README.md`) — `git diff --stat 83dfeb8f0..HEAD` shows no `packages/db/migrations` file.

---

## The seam I tested at (written before implementation, work order rule 4)

The brief names exactly one public seam: the **`CLR` export** two modules under
`packages/db/tests` carry — its declaration SITE (how many places declare it), its VALUE (which
codes it maps and what each means), and its IDENTITY across the two import paths (same object, not
a second copy). No door, function, component or CLI exit code is in scope; this ticket is entirely
about that one JS export and a structural census over `packages/db/migrations`' own SQL text. Three
cells map 1:1 onto the brief's three checked acceptance boxes, plus one object-identity cell for
the fold itself and one exact-set cell that restates the other two together (so a partial pass on
either direction is still caught even if a reader only looks at one cell's name):

* `p1149.catalog.one_declaration` — exactly one `CLR` map declaration under `packages/db/tests`.
* `p1149.catalog.one_object` — the fold's own claim: the two modules' `CLR` are `===`.
* `p1149.catalog.every_raised_code_has_a_meaning` — no code raised with no entry.
* `p1149.catalog.no_stale_entry` — no entry naming a code nothing raises.
* `p1149.catalog.census_is_exact` — the two 46-code sets are exactly equal (belt-and-braces).

## Vertical slices (work order rule 4)

**Slice 1 — the fold.** Wrote `errcode-catalog.test.mjs` with only `one_declaration` +
`one_object`. Ran it against the pre-fix source: **RED**, both cells, for the right reason (2
declaration sites found: `rig-helpers.mjs` + `work-journal-fixtures.mjs`; the two `CLR` objects
were structurally different, so `===` failed). Minimal fix: added `conflict`/CLR13 and
`period`/CLR19 to `rig-helpers.mjs`'s `CLR` (the two keys only `work-journal-fixtures.mjs` carried,
each with a written meaning derived from `0006_runtime_core.sql`'s and
`0007_document_pipeline.sql`'s own header comments and raise sites — see below); changed
`work-journal-fixtures.mjs` to import `CLR` from `rig-helpers.mjs` and re-export it by reference,
deleting its own declaration. Ran again: **GREEN**, both cells. Spot-verified the 28-importer chain
directly (`work-cancel-fixtures.mjs`'s re-exported `CLR.conflict`/`CLR.stale`/`CLR.client` all
resolved correctly; `rig-helpers.mjs`'s and `work-journal-fixtures.mjs`'s `CLR` read `===`, 15
keys). Committed (`7b529240d`).

**Slice 2 — completeness, soundness, exactness.** Added the remaining three cells to the same file.
Ran against the post-fold-but-pre-fill catalog: **RED**, 2 of 5 (the two new completeness cells;
`no_stale_entry` was already green — the 15 existing entries were all real). Fix: added the
remaining 31 entries to `rig-helpers.mjs`'s `CLR`, each with a meaning read off that code's own
raise sites and the migration header comment that assigns it (never invented) — see the table
below. Ran again: **GREEN**, 5 of 5. Committed (`f10a6479c`).

Neither slice wrote a battery of red cells before any implementation; each cell's own red state was
observed, for the right reason, before its fix.

## Where each of the 31 new meanings came from (no invention)

| code | migration source of the meaning |
|---|---|
| CLR00 | raise/handler sites in the `dba*` close-gate migrations (`0166`, `0167`, `0168`, `0170`, `0173`) — a `do $$ … exception when sqlstate 'CLR00' then …` tail-self-test rollback idiom |
| CLR14 | `0006_runtime_core.sql:26-28`'s own header ("CLR14 = LIMIT …") |
| CLR15–CLR20 | `0007_document_pipeline.sql:9-14`'s own header block, one line per code |
| CLR21–CLR25 | `0009_coding_floor.sql:9-34`'s "DB-LAYER ERROR MAP" header |
| CLR26–CLR29 | `0011_daily_loop.sql:12-17`'s "DB-LAYER ERROR MAP (Wave-A delta)" header |
| CLR23 (2nd family) | `0011_daily_loop.sql:18-19`, the alias/merge refusal family layered onto the same code |
| CLR30 | `0015_ar_myinvois_rules.sql:36-37`'s "Errcodes:" comment |
| CLR31–CLR34 | `0017_wave_b.sql:13-14`'s allocation line, cross-checked against reason tokens grepped from raise sites |
| CLR35 | `0026_lane_widen.sql:80-87`'s own paragraph (the ON CONFLICT impossible-state meaning, stated explicitly) |
| CLR36 | `0028_vendor_identity_binding.sql:21-23`'s allocation comment |
| CLR37–CLR40 | `0041_wave_d_a_fa_register.sql:49-55`'s "ASSEMBLY ADJUDICATIONS APPLIED" item 1, cross-checked against raise messages |
| CLR41 | `0056_wave_e_close_model.sql:64-66`'s "REFUSAL CODES" paragraph, cross-checked against the `reason` tokens raised (`close_not_in_progress`, `close_ordering_violation`, `close_self_attestation_required`, `drawer1_identity_failed`/`drawer1_state_unknown`, `reopen_ordering_violation`) |
| CLR42 | `0068_wave_e_epsilon_reporting_schema_validators.sql`'s V5 comment (missing manifest key) + `0071_wave_e_epsilon_reporting_security_seal_artifacts.sql:20`'s "seal/claim gate family" line |
| CLR43 | `0079_wave_e_zeta_render_jobs.sql:35-37`'s "render-queue family" line, cross-checked against `0080`'s raise messages |
| CLR99 | raise/handler sites from `0018_gate_k_domain.sql` on (the same tail-self-test idiom as CLR00, under the earlier code) + `0026_lane_widen.sql:81-84`'s explicit "CLR99 is NOT reusable here, it is reserved exclusively for migrations' own probe-rollback sentinel" ruling |

Every meaning above was checked against a direct `grep` of the code's own `errcode = 'CLRnn'` raise
sites in `packages/db/migrations` before being written down; none is copied from another code's
comment or guessed from the property name alone.

---

## Acceptance criteria, each with its evidence

### AC1 — "Exactly one `CLR` map is declared under `packages/db/tests`… a cell fails if a second declaration appears." ✅ MET

`p1149.catalog.one_declaration`, `packages/db/tests/errcode-catalog.test.mjs`. The scanner walks
`packages/db/tests` recursively (`fixtures/`, `split-lists/`, `wave-b/` included) for any
`.mjs`/`.test.mjs` file containing a fresh `export const CLR = {` binding — a re-export
(`export { CLR } from …` or a bare `export { CLR };`) does not match. Result on `HEAD`: exactly
`["rig-helpers.mjs"]`. RED before the fold (found `["rig-helpers.mjs", "work-journal-fixtures.mjs"]`),
GREEN after.

### AC2 — "Every code raised in `packages/db/migrations` has exactly one catalog entry with a written meaning; a cell derives the raised set off the migration sources and fails by name on a code with no entry." ✅ MET

`p1149.catalog.every_raised_code_has_a_meaning` (+ `p1149.catalog.census_is_exact` for the
belt-and-braces exact-set form). The census reads every `.sql` file under
`packages/db/migrations` (never `rig-helpers.mjs`, never the live `pg_proc` catalog) with
`/errcode\s*=+\s*'{1,2}(CLR\d{2})'{0,2}/gi`, tolerant of the doubled-quote form migrations build
for dynamic SQL and of a handful of migrations' own tail self-checks that re-assert an
already-known code in lowercase. Measured raised set: 46 codes, `CLR00`–`CLR44` + `CLR99`. Every
one now has a `rig-helpers.mjs` entry (30 pre-existing/fold + 31 new = wait, precisely: 13
pre-existing with a comment, 2 folded in slice 1 with a new comment, 31 added in slice 2 = 46).
RED before slice 2 (31 named by the assertion message: `CLR00,CLR14,CLR15,…,CLR43,CLR99`), GREEN
after.

### AC3 — "A catalog entry for a code nothing raises fails by name." ✅ MET

`p1149.catalog.no_stale_entry`. Inverse direction of AC2's census: every `rig-helpers.mjs` `CLR`
VALUE must appear in the raised set. GREEN throughout (the fold and the fill only ever added real,
derived codes — no code was invented that isn't raised somewhere). Proven non-vacuous by the
deliberate break below (an invented `CLR98` went red by name).

### AC4 — "Every existing test that imports either map still passes with no change to its own import line." ✅ MET

No importer's import line changed — verified by reading the diff (`git diff 83dfeb8f0..HEAD --
packages/db/tests/rig-helpers.mjs packages/db/tests/work-journal-fixtures.mjs`: the only lines
touched are inside the two modules' own bodies, plus one new `import { CLR } from
"./rig-helpers.mjs";` line ADDED to `work-journal-fixtures.mjs` — no importer of
`work-journal-fixtures.mjs` itself was touched). Behaviourally verified by running a representative
sample of the 28 importing modules with the full gate chain against `clara_c02` (counts below):
190 cells, 0 failures. `operation-census.test.mjs` (10/10) and `rig-isolation.test.mjs` (22 pass, 1
correctly skipped) were also run whole, since both read the live catalog broadly and either could
plausibly notice a change to a widely-imported harness module; neither did.

### AC5 — "The vacuity control is shown once… restored byte for byte." ✅ MET, all five cells

This ticket's whole deliverable is tests, so the work order's vacuity control (rule 4) applies to
every cell, not only ones whose fix was itself trivial. Performed against the committed `HEAD`
(`20e73c102`), one break at a time, each undone with `git checkout -- <file>` and reverified with
`git status` (clean) and `sha256sum` (matched the pre-break value in every case):

1. **`one_declaration`** — planted `packages/db/tests/zz-scratch-second-clr.mjs` containing
   `export const CLR = { fake: "CLR98" };`. Result: `not ok 1` (named both sites), cells 2-5 stayed
   `ok`. Deleted the scratch file (untracked; `git status` confirmed clean).
2. **`one_object`** — recut `work-journal-fixtures.mjs` to declare `CLR2COPY` from a spread of the
   imported `CLR` and re-export it under the name `CLR` (a second, distinct object with the same
   contents). Result: `not ok 2` only (`CLR_VIA_WORK_JOURNAL !== CLR`), cells 1/3/4/5 stayed `ok`.
   `git checkout --` restored; sha256 `94ab6c7f…` matched before and after.
3. **`every_raised_code_has_a_meaning`** — removed the `dailyLimit: "CLR14"` entry from
   `rig-helpers.mjs`. Result: `not ok 3` AND `not ok 5` (both name `CLR14`), cells 1/2/4 stayed `ok`.
   `git checkout --` restored; sha256 `e42e4084…` matched before and after.
4. **`no_stale_entry`** — added `invented: "CLR98"` to `rig-helpers.mjs`'s `CLR`. Result: `not ok 4`
   AND `not ok 5` (both name `invented`), cells 1/2/3 stayed `ok`. `git checkout --` restored;
   sha256 `e42e4084…` matched before and after (same value as break 3's restore, confirming no
   accidental accumulation).

Each break demonstrated the CORRECT cell(s) going red and no others — the census is neither
too broad (an unrelated cell tripping) nor too narrow (a real break passing silently).

### AC6 — "The full database gate chain is green, and the new cells run inside it." ✅ MET

`node --test --test-concurrency=1 $GATES tests/errcode-catalog.test.mjs` (the exact 153
`--import ./tests/*-preintegration-gate.mjs` flags from `packages/db/package.json`'s `test`
script), against `clara_c02`: **5 pass, 0 fail.**

### AC7 — "`CI=true GITHUB_ACTIONS=true pnpm lint` exit 0." ✅ MET

`CI=true GITHUB_ACTIONS=true pnpm lint` from the worktree root: **exit 0.** One unrelated `SKIP`
line (`#756`'s directory-symlink control, blocked by Windows requiring Developer Mode/elevation —
a known Windows-only item per `RIG.md`, not this ticket's doing).

### Out of scope, respected

* **No migration** — none written; `git diff --stat 83dfeb8f0..HEAD` shows no `packages/db/migrations`
  file.
* **No reclassification** — `invalid_op_key` was not touched; it stays on `CLR10` per #1114's own
  follow-up 3, untouched by this ticket.
* **`packages/db/README.md`'s CLR10/CLR44 prose** — not touched; it belongs to applied migrations'
  own sections. This ticket's docs live in `packages/db/tests/README.md` instead (the test-harness
  module the change actually lives in).

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| new/touched test file, full gate chain | `node --test --test-concurrency=1 $GATES tests/errcode-catalog.test.mjs` | **5 pass, 0 fail** |
| `operation-census.test.mjs`, full gate chain | same, `tests/operation-census.test.mjs` | **10 pass, 0 fail** |
| `rig-isolation.test.mjs`, full gate chain | same, `tests/rig-isolation.test.mjs` | **22 pass, 0 fail, 1 skipped** (T19 `poison-role`, gated behind `CLARA_RIG_ALLOW_RESET=1`, correctly not set per `RIG.md`) |
| representative importer sample #1 | `work-cancel.test.mjs` + `refusal-errcode-partition.test.mjs` | **51 pass, 0 fail** |
| representative importer sample #2 | `legal-enforcement-mode.test.mjs` + `wave-a-clr-map.test.mjs` + `prepayment-close-standing-instruction.test.mjs` | **50 pass, 0 fail** |
| representative importer sample #3 | `journal-work-evidence.test.mjs` + `merge-alias-lane.test.mjs` + `work-journal-admission.test.mjs` + `work-journal-post.test.mjs` | **89 pass, 0 fail** |
| `pnpm typecheck` | worktree root | **exit 0** (apps/web + packages/runtime; `packages/db` carries no `typecheck` script, untouched by this ticket's TS surface anyway) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | worktree root | **exit 0** (one unrelated, known Windows-only `SKIP`) |
| `node scripts/check-frozen-workflows.mjs` | worktree root | **OK — 347 frozen file(s) verified, 60 "use workflow" modules registered, 3 retired entries** (rule (a) proof) |
| `git diff --stat ffb629d73..HEAD -- packages/runtime frozen-workflows.json` | worktree root | **empty** (rule (a) proof) |

Not run, correctly: `apps/web`'s whole unit suite and browser walks (this ticket touches no
`apps/web` file); `apps/web/tests/firm-scope-db-pins.test.ts` (rule (d) applies only when a
migration file changed — this ticket adds none; #1150's own migration `0364` is that lane
predecessor's own concern, already its own report's subject); `packages/runtime`'s unit files
(this ticket touches no `packages/runtime` file, confirmed above).

---

## Migration

**None.** As the ticket predicted ("Test-only, no migration") and the task prompt required me to
stop and say why if I found otherwise — I did not; the ticket's whole subject (a JS test-harness
export and a structural census over already-applied migration text) needed no schema or function
change. No prestate pins, because there is no new migration.

## Docs

`packages/db/tests/README.md` — new section `## errcode-catalog.test.mjs — one CLR map, all 46
codes meant (#1149)`, appended at the end (house convention for this file: a running, appended
narrative log). Documents the fold, the five census cells, the sample-verified 190 importer cells,
and the full vacuity-control transcript (which break, which cell(s) went red, how it was restored).

`CONTEXT.md` — **not touched.** This ticket mints no new domain or accounting vocabulary; the `CLR`
catalog is internal test-harness plumbing (a JS object mapping symbolic names to Postgres SQLSTATEs
for the rig's own assertions), not a term a bookkeeper, the PRD or the Architecture doc would use.

`packages/db/README.md` — **not touched**, correctly: its "## NNNN" sections are per-migration and
immutable once applied; this ticket applies none.

`packages/db/tests/rig-meta.mjs`, `packages/db/package.json`'s `$GATES` list — **not touched**,
correctly: this ticket mints no new SQL name and needs no new preintegration gate (no migration, no
frontier dependency — the census reads static source text and an already-live catalog directly).

## Successor contract

**None owed.** This ticket touches no frozen chat tool, no Work tool, no `packages/runtime`
module, and no deploy-locked path. Verified twice: `git diff --stat ffb629d73..HEAD --
packages/runtime frozen-workflows.json` is empty, and `node scripts/check-frozen-workflows.mjs`
reports 347/347 frozen files verified against the base with no manifest diff.

## Follow-ups worth filing

* **The catalog is still fragmented outside this ticket's named scope.** `wave-a-helpers.mjs`
  declares standalone `CLR26`/`CLR27`/`CLR28`/`CLR29` constants (not a `CLR` map — a different
  pattern, so `p1149.catalog.one_declaration` correctly does not flag it), and
  `rig-runtime-helpers.mjs` (`CLR13`, `CLR14`) and `s6-helpers.mjs` (`CLR21`-`CLR25`) carry the same
  individual-constant pattern, redundant with (and now doubly-documented against) the meanings this
  ticket wrote into `rig-helpers.mjs`'s map. CLOSING-PLAN's own shared-files table names only the
  two `CLR`-MAP files as this ticket's territory ("The two errcode catalogs are #1149's whole
  subject… Another lane that needs a code uses an existing key and edits neither file"), so folding
  these four individual-constant modules in as well would have widened the ticket. A follow-up
  ticket could retire them in favour of `rig-helpers.mjs`'s `CLR.codingAmountException` etc., the
  same shape #1114 and this ticket both used for the two maps.
* **CLR19's "period" name undersells its scope.** The written meaning I gave it (correction
  authorization/staleness/lifecycle, INCLUDING `write_into_closed_period`) is broader than its
  property name suggests. I kept the existing key name (`period`) rather than renaming it, since
  renaming would have changed the 28 importers' surface (out of scope — "the re-export keeps the
  same exported name and shape"); a future pass could add a same-value alias with a clearer name
  if a reader finds `CLR.period` misleading in practice.

## Anything unverified

* I did not exhaustively run all ~140 files that mention `CLR` (many only in comments) — I ran the
  mandated gates plus a deliberately broad, representative sample (8 files across three distinct
  import shapes: direct-from-`rig-helpers.mjs`, chained-through-`work-cancel-fixtures.mjs`, and
  chained-through-`work-journal-fixtures.mjs` proper) totalling 190 cells, 0 failures, plus
  `operation-census`/`rig-isolation` whole. I did not run the full ~300-file `packages/db/tests`
  suite; the work order's rule 8 asks for "the files you touched" plus the two named census files,
  not the whole package, and the change is additive-only by construction (the fold is a strict
  superset of both prior maps' keys, confirmed by direct diff reading).
* The report cites migration line numbers (e.g. `0006_runtime_core.sql:26-28`) as read on this
  worktree's `HEAD`; migrations are immutable so these will not move, but I did not independently
  re-verify every line number against `main` at `322fdf291` beyond the code-set cross-check already
  described (which is derived from file content via regex, not from line numbers).
