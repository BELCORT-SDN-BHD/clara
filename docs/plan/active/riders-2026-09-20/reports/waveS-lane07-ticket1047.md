# Sweep wave · lane 07 · ticket #1047 — pinned census digests must order with `collate "C"`

**Status: done.** No migration. The lane contingency `0351` was NOT needed and is returned unused.

- Branch `riders/wS-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\659`, base `7bc5a710f`
  (`git log --oneline 7bc5a710f..HEAD` was empty at start: this is the lane's first ticket).
- Database `127.0.0.1:55749/clara_l09`, 309 files applied, max `0318_knowledge_fye_pair_applicability`,
  `datcollate = C.UTF-8`.
- Commits (7):

| commit | what |
|---|---|
| `b6154f064` | classify an ORDER BY key by the type that decides collation |
| `1bc622069` | find the pins taken over text-ordered row content (4 slices, 4 controls) |
| `4d2fc05e1` | `collate "C"` on the four battery censuses whose key can move |
| `4b13161da` | record the estate's text-ordered pins and refuse a new one |
| `2d586b924` | prove the recorded orderings under a second collation, live |
| `360269c0c` | the collation-and-pinned-order house rule (README) |
| `4d975c8d0` | correct the record's own split (28 / 38) |

Files: `packages/db/tests/collation-pin-scan.mjs` (new instrument),
`packages/db/tests/collation-pin-scan.test.mjs` (new, no database),
`packages/db/tests/collation-pin-portability.test.mjs` (new, live),
four one-line battery fixes, and one new `packages/db/README.md` section. **No migration file
changed**, so the web pins corpus (`apps/web/tests/firm-scope-db-pins.corpus.ts`, sweep rule d) is
out of scope; `git diff --name-only 7bc5a710f..HEAD | grep -c migrations/` is `0`.

## The seams tested at, written down before the first test

1. `classifyOrderKey(key)` — which collation an ORDER BY key derives, decided by type.
2. `scanSqlText(source)` / `scanJsText(source)` — the pinned, text-ordered sites in one file.
3. `describeCollationFindings(observed, recorded)` — the refusal a new site gets.
4. `pg_collation_for(<expr>)` — PostgreSQL's own answer to "which collation would ORDER BY use
   here", driven against the estate's real expression shapes.
5. The ordering of a live value set under two named collations (`array_agg(v order by v collate X)`).

Seams 1–3 are the lint the ticket's Agent Brief asks for ("the migration lint or a new census
test"); seams 4–5 are the two-collation proof its AC2 asks for. Nothing reaches a private helper
and nothing re-implements a comparison in JavaScript.

## The re-derivation, which was this lane's first act (sweep plan, risk 3)

The ticket says **68 sites across about 20 migrations and six test files**. The plan's own strict
reproduction found **~37 sites across 16 migration files and one test file**. Both numbers count
PROXIMITY — a text `order by` in a block that also holds a 64-hex literal. I reproduced that
counting rule first and then replaced it, because it is not the class the rule governs:

| counting rule | result |
|---|---|
| a text `order by` in a STATEMENT that also holds a 64-hex literal | **0 sites.** The pin and the ORDER BY are never in one statement: the digest is measured into a variable and compared in the next statement. |
| a text `order by` in a dollar-quoted BLOCK that also holds a 64-hex literal (the audit's own rule) | **157 sites across 51 migration files.** Most are not pins at all — the block merely also holds `prosrc` pins. |
| **pinned** ordered aggregates in a migration's DO blocks (the class the README rule governs) | **206 sites**, of which **140** order only by keys no collation can move. |
| …of those, at least one movable key, first pass | **37 sites across 17 migration files** — the same number the plan's independent reproduction reached. |
| …after def-use scoping and the digest-vs-temp-table distinction (below) | **27 sites**, and after the four battery fixes the record holds **66 movable keys over 37 files: 28 keys in 16 applied migrations, 38 keys in 21 batteries**. |

**The count actually worked: 66 movable ORDER BY keys over 37 files**, every one recorded in
`RECORDED_SITES` with the reason it cannot flip.

Three findings shrank the class, each one a scanner cell with its own positive control:

- **The absence-cohort idiom is not a content pin.** Thirteen migrations write
  `coalesce(string_agg(x, ',' order by x), '(none)')` and take the verdict against the sentinel
  (0185:156, 0190:92, 0193:325, 0196:172, 0162:66 …). The order reaches the error message and
  nothing else.
- **A verdict belongs to the value's own def-use region.** A prestate reuses `v_bad` a dozen times;
  searching the whole block gave 0150:2058's `is not null` census the content verdict of a namesake
  300 lines away.
- **A digest checked against a value the same transaction measured is not a cross-server pin.**
  0151:323/911 is the CORRECT pattern — `md5(string_agg(p.oid::regprocedure::text, ',' order by …))`
  into a temp table in the prestate, re-measured in the tail. Only a digest checked against a
  literal carries a collation between servers.

**And one finding that explains the audit's empirical result.** The audit recorded "all 289
migrations applied on an `en_US.UTF-8` server, so nothing flips" without a mechanism. The mechanism
is the type, measured with `pg_collation_for` on the lane database:

| expression | derived collation |
|---|---|
| `p.proname` | `"C"` |
| `p.proname::text` | `"C"` — a cast does NOT drop it |
| `p.proname \|\| '=' \|\| <acl text>` | `"C"` — the `name`'s non-default collation wins over the default |
| `pg_get_userbyid(oid)`, `case … else pg_get_userbyid(…) end`, `coalesce(rolname,'PUBLIC')` | `"C"` |
| `p.oid::regprocedure::text` | `"default"` |
| `aclitem::text` | `"default"` |
| `privilege_type` (`information_schema.character_data` → `character varying`) | `"default"` |

`name`'s own type collation is `C`, and `information_schema.sql_identifier` IS `name`, so `grantee`,
`table_name` and `column_name` cannot move either. 0020:2304's ACL pin — the site that looked most
dangerous, since `_enqueue_invoice_facts_core` sorts first under `C` and fourth under a
punctuation-blind collation — is portable because its key concatenates `proname`. That is why the
whole ladder applies on `en_US.UTF-8`, and it was nowhere written down until now.

## Acceptance criteria

**AC1 — applied migrations are NOT edited; each site is either proved unable to flip and recorded,
or given a forward re-pin.** Done, entirely on the prove-and-record branch; no applied migration was
touched. `RECORDED_SITES` (`packages/db/tests/collation-pin-scan.mjs:399-470`) carries all 66 keys,
one entry per file, each with its reason. The 28 keys in applied migrations resolve as:

| reason | keys | example |
|---|---|---|
| the key derives `C` from a catalog `name` | 6 | 0020:2304, 0038:8329, 0106:2111, 0162:504, 0190:347 |
| the value set is proved live under two collations | 19 | 0150's chart vocabularies and grant matrices, 0215/0269/0270's `privilege_type`, 0218:1154, 0219:638/648/659, 0295:656 |
| the verdict admits one member, so order cannot decide it | 2 | 0152:1280 (one new signature), 0041:6493 (and its CTE already seeds `collate "C"`) |
| the key is an integer | 1 | 0295:646 (`clara.coa_templates.version`) |

Evidence: `collation-pin-scan.test.mjs` cell "every pin over text-ordered row content in the estate
is the RECORD" (12/12 in that file), and the live battery below.

**AC2 — a cell proves the two collations yield the same digest at every re-pinned site.** Done, and
widened from "re-pinned" to "recorded", since nothing needed re-pinning.
`collation-pin-portability.test.mjs`:

- builds a comparator — the real glibc `en_US.UTF-8` where the OS has the locale (CI's own database
  collation and hosted Supabase's), otherwise an ICU `ka-shifted` collation — inside a rolled-back
  transaction, and **makes it prove it is a real second collation** on the 0295 audit's own worked
  example before anything else runs;
- measures the type/derivation facts above;
- orders **each recorded site's own live value set** under `C` and under the comparator, with the
  comparison made per group where a site sorts one object's grantees, one door's signatures or one
  relation's index names — so the proof covers every sibling the census could be pointed at;
- recomputes 0295's structural digest from v1's rows: it still equals its pinned
  `d02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df`, and the SAME canonical form
  ordered under the comparator does not — its `collate "C"` is load-bearing, not decoration.

On the lane rig the comparator is `ICU en-US-u-ka-shifted`; on CI it will be the real
`glibc en_US.UTF-8`, which is the pair the ticket names.

**AC3 — the house rule is written and the guard cell refuses a fixture that violates it.** Done.
`packages/db/README.md`'s new section "Collation and pinned order (#1047)" (lines 412-466) states
the rule, the type table that says which ORDER BYs need it, where the record and the guard live, and
the concrete evidence that the estate is portable by luck. The guard is
`collation-pin-scan.test.mjs`, which needs no database (so it runs on every leg, including the
pre-migration chains — `preintegration-gate-chain.test.mjs`'s own reasoning) and carries six
positive controls: a pinned census with and without `collate "C"`, a non-pinned ordered read, a
function body, the sentinel idiom, the def-use reuse, the temp-table digest, an escaped `\"C\"`, a
planted NEW site and a planted MOVED site.

**AC4 — from-scratch chain green on both collations; `CI=true GITHUB_ACTIONS=true pnpm lint`
exit 0.** Lint is exit 0 (below). **The two-collation from-scratch chain was NOT run by this lane**
and is recorded as unverified: no migration changed, so the chain is byte-identical to the base, the
integrator's own from-scratch proof covers the `C.UTF-8` side, and CI's `db-live-gates` runs the
whole chain on a `postgres:17` container whose collation is `en_US.UTF-8`. Building a second cluster
here would have meant a second from-scratch chain, which RIG.md forbids on a lane cluster (0154 pins
the cluster-wide role count).

**Out of scope, honoured:** `clara._coa_template_content_sha256` is untouched.

## The four in-place battery fixes

Only four of the corpus's battery censuses sort by a key that can actually move, and all four are in
this lane's own six files (sweep plan, shared files):

| file:line | key | why it needed the fix |
|---|---|---|
| `firm-document-limits-writer.test.mjs:452` | `privilege_type` | `character_data` is `character varying`; the sibling `grantee` is `sql_identifier` = `name` and was left alone |
| `firm-portfolio-pack.test.mjs:605` | `privilege_type` | same; `table_name` left alone |
| `preview-invite.test.mjs:316` | `privilege_type` | same |
| `plan-overlap-template-arm-retired.test.mjs:426` | `wake_kind` | `clara.wake_fn_allowlist.wake_kind` is `text` (measured with `pg_collation_for`) |

Two sites in the same six files were deliberately NOT touched, and the record says so:
`subledger-hook-caller-roster.test.mjs:144` orders by `p.proname`, a catalog `name`; and
`coa-template-pr-b.test.mjs:1472/1475` are not censuses at all but a byte-for-byte quotation of
`clara.apply_coa_template`'s live body for the §9.4 mutant substitution — collating them would break
`src.includes(fixed)`. A blind "collate every ordered aggregate in tests" pass would have broken
that battery.

The values do not move on a `C.UTF-8` rig, which is why all four read green before and after; the
fix is for CI and hosted.

## Vacuity controls (work order rule 4, a test-only deliverable)

- **The guard, broken and restored.** Removing `collate "C"` from `preview-invite.test.mjs:316`
  made the corpus cell red — `NEW  tests/preview-invite.test.mjs` — and the file was restored with
  `git checkout --`; the working tree is clean and the cell is green again (12/12).
- **The live proof, broken and restored.** Changing one character of 0295's pinned structural
  digest made cell 5 red with "0295's structural digest no longer reproduces from v1's rows";
  restored the same way, 5/5 again.
- **The comparator proves itself** on every run: if it did not reorder `taxation` /
  `tax_liabilities`, every proof below it would be vacuous, so the battery refuses rather than
  skipping.
- **An unplanned red, kept as evidence.** The first cut of the value-set cell widened the index-name
  proof to every clara relation and went red on `clara.bank_accounts`: its five index names DO sort
  differently under the two collations (`uq_bank_accounts_id_firm_client` against
  `uq_bank_accounts_identity_active`). Nothing pins that relation's index names today; the entry was
  narrowed to the relation the site actually reads (`firm_admissions`) and the finding is recorded in
  the entry's own comment and in the README as the concrete form of the audit's "fragile by
  construction".

## Gates, with counts

Lane database `127.0.0.1:55749/clara_l09` with `PGHOST/PGPORT/PGUSER/PGDATABASE` +
`CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, run as
`node --test --test-concurrency=1 $GATES tests/<file>` with the exact 125-`--import` gate list from
`packages/db/package.json`'s `test` script. No reset flag was ever set.

| file | tests | pass | fail | skipped |
|---|---|---|---|---|
| `collation-pin-scan.test.mjs` (new) | 12 | 12 | 0 | 0 |
| `collation-pin-portability.test.mjs` (new) | 5 | 5 | 0 | 0 |
| `preview-invite.test.mjs` | 15 | 15 | 0 | 0 |
| `firm-document-limits-writer.test.mjs` | 11 | 11 | 0 | 0 |
| `firm-portfolio-pack.test.mjs` | 17 | 17 | 0 | 0 |
| `plan-overlap-template-arm-retired.test.mjs` | 6 | 6 | 0 | 0 |
| `subledger-hook-caller-roster.test.mjs` (read, unchanged) | 5 | 5 | 0 | 0 |
| `coa-template-pr-b.test.mjs` (read, unchanged) | 43 | 43 | 0 | 0 |
| `operation-census.test.mjs` | 10 | 10 | 0 | 0 |
| `rig-isolation.test.mjs` | 23 | 22 | 0 | 1 |

`rig-isolation`'s single skip is the pre-existing T10b World skip described in RIG.md, not a new one.

- `pnpm typecheck` at the worktree root: **exit 0** (no TypeScript changed).
- `CI=true GITHUB_ACTIONS=true pnpm lint` at the worktree root: **exit 0**; re-run for
  `@clara/db` alone after the last comment edit: exit 0.
- No `apps/web` file changed, so no web unit suite and no browser walk; no `packages/runtime` file
  changed, so no frozen-workflow or parts-parity run. No SQL function was added, so
  `operation-census` / `rig-isolation` were run for the "touched `packages/db/tests`" reason only.

## Migration and prestate pins

**None.** This ticket needed no migration, as the prompt expected: every site resolved on the
prove-and-record branch. The lane contingency number `0351` is unused and returns to the
orchestrator.

## Docs

- `packages/db/README.md`, new section "Collation and pinned order (#1047)" at line 412, inserted
  with the migration-behaviour conventions rather than appended, and 0295's own section is untouched
  (applied migrations and their sections are immutable; the new section cites it).
- No `CONTEXT.md` entry: the change introduces no accounting or product vocabulary, only a database
  pinning convention, which belongs to the module README.

## Successor contract

**None owed.** No frozen chat or Work tool is involved: nothing here adds a tool, a door, a part
kind or a prompt stanza. `frozen-workflows.json` and every closure module are untouched.

## Follow-ups worth filing

1. **The guard will red a sibling lane's new census.** Any new migration or battery in this wave
   that orders a census by `privilege_type`, a `reg*::text`, `aclitem::text` or an ordinary text
   column without `collate "C"` now fails `collation-pin-scan.test.mjs`. That is the rule working,
   and the fix is one `collate "C"` per ORDER BY — the refusal message says so and names the file.
   The integrator should expect it rather than treat it as a conflict.
2. **`clara.bank_accounts`' index names already move between the two collations** (measured, above).
   No census pins them; a ticket to write `collate "C"` into any future index-name census is not
   needed while the guard stands, but the finding is worth keeping visible.
3. **`clara.event_types.name` also moves** (`entry.post_refused` against `entry.posted`,
   `kb_binding.decline_reset` against `kb_binding.declined`). 0215:1472 orders by it but takes an
   `is not null` verdict, so nothing is pinned today.
4. **The scanner cannot resolve an alias.** `order by x` where `x` is an unnested array is recorded
   as `unresolved` and therefore movable. That is deliberate (it never calls an unknown safe), but
   it is why the record carries prose reasons for the alias sites rather than a machine
   classification.
5. **A battery's record entry is per file, not per line.** If a lane deletes a census from a
   recorded battery, the guard says `GONE` and asks for the entry to be dropped; that is a
   one-line edit, not a failure.

## Anything unverified

- **The from-scratch chain on two collations was not run here** (AC4's first half). Reasons above.
  What IS measured on this lane: every recorded site's value set under two collations, and the type
  derivation. The `en_US.UTF-8` leg of the chain is CI's.
- **The comparator on this rig is ICU, not glibc.** The WSL cluster has no `en_US.UTF-8` locale
  (`create collation … provider = libc, locale = 'en_US.UTF-8'` fails with `report_newlocale_failure`),
  so the battery fell through to `ICU en-US-u-ka-shifted`, which reproduces both primary-weight
  rules glibc has against `C` (punctuation ignorable, case not primary) but is not byte-identical to
  glibc at the tie-breaking levels. On CI the first candidate will be the real glibc collation. If a
  recorded value set agrees under ICU-shifted but not under glibc, the battery will say which site
  and which group.
- **Hosted was not touched or measured.** The claim that hosted Supabase is `en_US.UTF-8` is carried
  forward from the 0295 report, which itself marked it unverified.
- **Two earlier commit bodies (`4b13161da`, `360269c0c`) carry a wrong split** — "22 keys in 16
  applied migrations, 44 in 21 batteries". The totals were right; the split is 28 and 38, corrected
  in the files by `4d975c8d0`.
- **No message arrived mid-task**, so nothing under sweep rule (f) had to be deferred.
