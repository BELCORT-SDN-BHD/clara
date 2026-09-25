# Riders sweep wave — lane 07, ticket #1096

**Disclose (or fix) that 29 February outside a leap year still bypasses the financial-year-end
pair check — narrowed by the sweep scan to ONE pinning test cell, the disclosure itself having
already landed with #1031's fix round (0318).**

| | |
|---|---|
| branch | `riders/wS-lane07` in `C:\Users\zhant\Desktop\clara-wt\659` |
| base | `7bc5a710f` (the integrated head of the wave before) |
| lane database | `127.0.0.1:55749` / `clara_l09`, 312 migration files, max `0349_admit_autodraft_task_outcome_disclosure` (unchanged by this ticket — no migration) |
| commit (this ticket) | `3cbdc63f7` `test(db): #1096 pin the 29-February year-end pair as ACCEPTED, the disclosed residual` |
| tickets before mine on this branch | #1047 (README + `packages/db/tests` only), #1098 (migration `0347`), #1046 (migration `0348`), #1132 (migration `0349`) — none touch `clara._knowledge_assert_fye_pair` or `knowledge-onboarding-promotion.test.mjs` |
| verdict | **done** |

Ticket contract read from `gh issue view 1096 --comments`: the Agent Brief is in the **issue
body**, the issue carries **zero comments**, no owner-ruling comment on the issue itself. Labels
`bug` + `ready-for-agent`. The brief's own AC1/AC2 ask for a documented, disclosed residual plus a
pinning test.

The BINDING narrowing comes from `docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` (read before
building, per rule g) and the orchestrator's own lane notes, both agreeing: **"the disclosure
already landed: `packages/db/migrations/0318_knowledge_fye_pair_applicability.sql:57-64` names the
residual in its header, the function comment repeats it at line 243, and
`packages/db/README.md:7240-7249` carries it. What is missing is the test: no cell anywhere drives
month 2 day 29 and pins the accepted outcome. The ticket shrinks to one test cell."** Verified
still live on this branch before building: I re-read 0318's header (lines 57-64: the "DISCLOSED
RESIDUAL (L06-SPEC-07, minor)" block), the function's own catalog comment (lines 241-244: "…
Disclosed residual: 29 February outside a leap year is accepted…"), and `packages/db/README.md`'s
`## 0318` section's "Disclosed residual" paragraph — all three still present, byte-identical to
what the scan cites, none touched by #1047/#1098/#1046/#1132. `grep` for `financial_year_end_day`
and `fye_pair` across `packages/db/tests` confirmed no existing cell captures month 2 day 29 and
asserts an accepted outcome (`knowledge-onboarding-promotion.test.mjs` had `kp.14`, month 2 day
31, refused — no accepted-29 mirror).

**This ticket is expected to need NO migration, and needed none.** No PostgreSQL object was
created, recut or touched by an applied statement; the pair rule's live body is byte-for-byte
identical before and after this ticket (proven below, not merely claimed).

No status-report request arrived mid-task; none to note.

---

## The seam I tested at

Written down before the first cell, per work-order rule 4:

1. **`clara.promote_plan_answers_to_knowledge`, through the human door, for a committed plan
   carrying `financial_year_end_month => 2, financial_year_end_day => 29`.** This is the public
   interface the ticket's own "Key interfaces" section names alongside
   `clara._knowledge_assert_fye_pair` itself — the pair rule is `UNGRANTED` (owned by
   `clara_fn_owner`, `EXECUTE` revoked from `PUBLIC`), so it is reachable and observable only
   through a real write door, never called directly. `kp.14` (already in the file, #1031's own
   fix-round cell) drives the SAME door with the SAME shape for the day-31 refusal; `kp.15` is its
   mirror image for day 29, so the seam and the fixture shapes are identical and directly
   comparable.

No seam outside this one was touched: no `apps/web` file, no frozen workflow, no applied migration,
no other ticket's migration, no recut of `clara._knowledge_assert_fye_pair` or any of its callers.

---

## Acceptance criteria, each with its evidence

### AC1 — "The 29-February residual is documented as a deliberate, disclosed limitation in the
migration header and the README section for this ticket."

**Already satisfied — verified, not re-done.**

- `packages/db/migrations/0318_knowledge_fye_pair_applicability.sql:236-244` — the
  "DISCLOSED RESIDUAL (L06-SPEC-07, minor) — 29 FEBRUARY OUTSIDE A LEAP YEAR IS STILL ACCEPTED"
  header block, naming the rule (`clara.set_client_fy_end`'s calendar rule, 0041, copied verbatim),
  why it admits `v_month = 2 and v_day = 29` unconditionally, and why refusing it in Knowledge
  alone would reopen the disagreement #1031 exists to close.
- The function's own catalog comment on `clara._knowledge_assert_fye_pair(uuid,text,jsonb,jsonb)`
  (same file, lines ~232-244): "…Disclosed residual: 29 February outside a leap year is accepted,
  because the client-row door accepts it and the pair carries no year."
- `packages/db/README.md`'s `## 0318` section, "**Disclosed residual — 29 February outside a leap
  year is still accepted.**" paragraph: the same claim, in the README's own words.
- **No edit made to any of the three** — the migration is applied and immutable (house rule); the
  README paragraph was left as-is and a NEW paragraph appended immediately after it (see "Docs"
  below) rather than rewritten, so the original disclosure stays intact and attributable to #1031's
  own fix round.

### AC2 — "A test exists that drives capturing month 2 (February) and day 29 and asserts the
current (accepted, not refused) outcome, so the residual is pinned rather than silently
reintroduced or silently fixed without notice."

**DONE.**

- `kp.15` — `packages/db/tests/knowledge-onboarding-promotion.test.mjs`, added immediately after
  `kp.14`. Commits a plan with `entity_type => "sdn_bhd"`, `fye => 2`, `fye_day => 29` (mirroring
  `kp.14`'s day-31 shape exactly, so the contrast is direct), promotes it as the plan's own admin,
  and asserts:
  - `receipt.promoted` names all THREE keys (`entity_type`, `financial_year_end_day`,
    `financial_year_end_month`) — nothing withheld.
  - `receipt.withheld` is the empty array.
  - `clara.list_client_knowledge` shows all three keys live, with
    `financial_year_end_month === 2` and `financial_year_end_day === 29` at the captured values.
- **Result, focused run, full `$GATES` chain, `clara_l09`:** `ok 15 - kp.15 …` — **PASS.**
- **`PAIR_EXPECTED_CELLS`** (the file's own vacuity-against-a-silent-skip counter, `before`/`after`
  hooks) bumped `1 → 2`; the file's `after` hook enforces exactly two pair-wall cells ran, so a
  future accidental skip of `kp.15` fails the file outright rather than passing silently.

#### The vacuity control (work-order rule 4: "a ticket whose whole deliverable is a test … still
needs the vacuity control: show the new cell FAILING against a deliberately broken subject once,
then restore the subject byte for byte")

Because AC2's deliverable is a PINNING test over ALREADY-SHIPPED, already-correct behaviour, there
is no natural red-green-refactor cycle (the subject was never wrong). I substituted the rule's own
named alternative: a scratch script (`packages/db/vacuity-1096.mjs`, run then deleted, never
committed — see `git status` after commit above, clean) that

1. **Measured** the live `sha256(prosrc)` of `clara._knowledge_assert_fye_pair(uuid,text,jsonb,
   jsonb)` on `clara_l09`: `1c9637a9987197fd536ac7f4aa7456b1fd021b630bbb84b7e7bdfe0895ff4bb9`.
2. **Extracted** the function's ORIGINAL body verbatim (lines 173-244) directly from
   `packages/db/migrations/0318_knowledge_fye_pair_applicability.sql` on disk — never retyped, to
   remove transcription risk — and asserted the slice both contains the expected `create or
   replace function` opener and ends at the expected `…no year.';` comment terminator before
   trusting it.
3. **Broke** the subject on the LIVE catalog only (`set role clara_fn_owner; create or replace
   function …` with `create or replace`, never an edit to the migration file): the calendar check's
   `(v_month = 2 and v_day > 29)` was changed to `(v_month = 2 and v_day >= 29)`, so day 29 is now
   ALSO refused. New `sha256(prosrc)`:
   `8fafe4b0e729555cd5aad63cc3b19f6c0a40a7576d219b65672e3a1b55333d0e` — confirmed different from
   step 1.
4. **Ran** the full test file against the broken subject: `kp.15` went **RED, for the right
   reason** — `financial_year_end_day` now appears in `receipt.withheld` with `sqlstate: "CLR37"`,
   `detail.reason: "fa_particulars_invalid"`, `detail.month: 2, detail.day: 29` — exactly the
   refusal shape `kp.14` asserts for day 31, now firing on day 29 too. **Every other cell in the
   file, `kp.14` included, stayed green** — 14 pass, 1 fail (`kp.15`), confirming the break is
   scoped to exactly the behaviour `kp.15` exists to catch.
5. **Restored** the subject with the SAME extracted `ORIGINAL_SQL` text (`create or replace
   function`, then `revoke`, then `comment on function`, all three statements, byte-identical to
   the migration file). New `sha256(prosrc)`: `1c9637a9987197fd536ac7f4aa7456b1fd021b630bbb84b7e7bdfe0895ff4bb9`
   — **equal to step 1's measurement**, asserted by the script itself (it throws if they differ).
6. **Re-ran** the full test file: **15/15 pass**, `kp.15` included.

This is a stronger proof than the migration-body case `kp.14`'s own vacuity control used
(`CLARA_MIGRATION_REDO`, since that ticket DID ship a migration): here there is no migration to
redo, so the restore is proven by direct `sha256(prosrc)` equality against a pre-break measurement,
recorded above, rather than by re-running a migration file.

### AC3 — "If the owner separately decides the underlying gap should be fixed … that is tracked as
its own follow-up, not bundled into this documentation fix."

**Honoured by omission.** No calendar-tying fix, no data-model change, no new column was added.
`clara._knowledge_assert_fye_pair`'s body is byte-for-byte the one 0318 shipped (see the vacuity
control's own sha equality). See "Follow-ups worth filing" below for the one open question this
raises, filed as a follow-up rather than built.

---

## Gates, with counts

Every db run used `PGHOST=127.0.0.1 PGPORT=55749 PGUSER=postgres PGDATABASE=clara_l09
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, from `packages/db`, `--test-concurrency=1`, the full
`$GATES` list (every `--import …preintegration-gate.mjs` in `packages/db/package.json`).

| gate | result |
|---|---|
| `tests/knowledge-onboarding-promotion.test.mjs`, BEFORE my edit (baseline) | **14 tests, 14 pass, 0 fail** |
| same file, AFTER adding `kp.15`, subject unbroken | **15 tests, 15 pass, 0 fail** |
| same file, subject DELIBERATELY BROKEN (vacuity control) | **15 tests, 14 pass, 1 fail** — the fail is `kp.15`, for the right reason (see above) |
| same file, subject RESTORED byte-for-byte (sha verified equal) | **15 tests, 15 pass, 0 fail** |
| `tests/operation-census.test.mjs`, full chain | **10 tests, 10 pass, 0 fail, 0 skipped** |
| `tests/rig-isolation.test.mjs`, full chain, **no reset flags** | **23 tests, 22 pass, 0 fail, 1 skipped** — the one skip is `T19 poison-role: reset + re-migrate`, which `RIG.md` forbids running |
| `pnpm typecheck` (repo root) | **Done** — `apps/web` and `packages/runtime`, no errors (this ticket touched neither package's `.ts`) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` (repo root) | **pass, exit 0** — see "The `FREEZE_BASE_REF` finding" below |

No SQL function was added (no migration), so `operation-census.test.mjs` and
`rig-isolation.test.mjs` were run anyway because work-order rule 8's `packages/db/tests` clause is
unconditional on ANY touch to that directory, not only on new functions — both ran clean.

Not owed and not run, with the reason: `apps/web`'s unit suite or any browser walk (no `apps/web`
file touched, and sweep rule d's web-pins-corpus trigger is "whenever a MIGRATION FILE changed" —
none did here); `node scripts/check-frozen-workflows.mjs` /
`node packages/runtime/scripts/check-parts-parity.mjs` standalone (no `packages/runtime` file
touched; both ran anyway as part of the full `pnpm lint` chain above and passed).

### The `FREEZE_BASE_REF` finding (same drift #1132's report already flagged for this lane)

`pnpm lint`'s `check-frozen-workflows.mjs` step compares the working tree against `origin/main` by
default, and on this host `origin/main`'s local ref has moved past this lane's own base
(`7bc5a710f`) — PR #1140 (the riders cut-phase integration) merged into `origin/main` after this
lane branch was cut. Plain `CI=true GITHUB_ACTIONS=true pnpm lint` reported 25 false
`REMOVED-VS-BASE` and 3 false `REGISTRY-DOWNGRADE` violations, none caused by this ticket's own
diff (my diff touches only `packages/db/README.md` and one test file). Re-run with
`FREEZE_BASE_REF=7bc5a710f` (the script's own documented override, `scripts/check-frozen-workflows.mjs:153`,
matching the work-order addendum's "everywhere a rule says `origin/main..HEAD`, read
`<base>..HEAD`"): clean, `freeze-lint: OK — 322 frozen file(s) verified …`. This is the same
environment fact #1132's report already recorded for this lane; recorded again here because it
recurs on every ticket in this lane until the branch merges past PR #1140.

Known Windows-only reds from `RIG.md`: none encountered.

---

## Migration

**None.** No `packages/db/migrations/*.sql` file was added, edited, or applied. No entry was added
to `packages/db/package.json`'s `$GATES` list, no cohort was added to `packages/db/tests/rig-meta.mjs`.
The lane database stays at 312 files / `0349_admit_autodraft_task_outcome_disclosure`, unchanged by
this ticket. `pnpm --filter @clara/db migrate` was not re-run (nothing to apply); the ticket's own
"expected to need NO migration" line held.

---

## Shared files

| file | my hunk |
|---|---|
| `packages/db/README.md` | ONE new paragraph, "**Pinned by kp.15 (#1096, riders sweep wave, lane 07).**", appended immediately after the EXISTING "Disclosed residual" paragraph inside the `## 0318` section — the existing paragraph is untouched, byte-for-byte. |
| `packages/db/tests/knowledge-onboarding-promotion.test.mjs` | `PAIR_EXPECTED_CELLS` `1 → 2`, plus one new `pairCell("kp.15 …")` block appended immediately after `kp.14`. No existing cell edited. |
| `packages/db/package.json` (the `$GATES` list) | **not touched** — no new gate module, no new cohort. |
| `packages/db/tests/rig-meta.mjs` | **not touched** — no new catalog name minted. |
| `apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `apps/web/e2e/serve-built.mjs`, `apps/web/e2e/e2e-fixture-ownership.test.ts`, `apps/web/lib/navigation/tree.ts`, `CONTEXT.md` | **not touched.** No web file changed, no new domain vocabulary. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **not touched** — sweep rule d's trigger ("whenever a migration file changed, even a comment") did not fire; no migration file changed. |
| `packages/runtime/*` | **not touched** — this ticket is `packages/db` only. |

---

## Docs

- `packages/db/README.md`'s `## 0318` section gains one new paragraph, "**Pinned by kp.15 (#1096,
  riders sweep wave, lane 07).**", naming the test cell, its shape (mirrors `kp.14`), and the
  vacuity control performed (the calendar check bumped, `kp.15` seen red for the right reason,
  restored byte-for-byte, sha256 equality verified) — placed directly after the existing
  "Disclosed residual" paragraph so a reader sees the original #1031 disclosure and its #1096 pin
  together.
- No migration header to update (no migration).
- `CONTEXT.md`: no new vocabulary introduced by this ticket (no new entity, key or term) — not
  touched.

---

## Successor contract

**None owed.** This ticket touches no frozen workflow body and no module in a frozen closure — the
pair rule and its test are pure `packages/db`; `grep -rn "_knowledge_assert_fye_pair\|financial_year_end"
packages/runtime/workflows` returns nothing that reaches a chat or Work tool surface this ticket's
diff moved. `pnpm lint` (with `FREEZE_BASE_REF=7bc5a710f`) ran `check-frozen-workflows.mjs` clean.

---

## Follow-ups worth filing

1. **The underlying gap itself (AC3's deferred half).** The year-end pair still carries no year, so
   Knowledge cannot distinguish a genuine leap-year 29 February from an impossible one in any given
   recorded year — this is unchanged by #1096 and by design (AC3). A real fix needs either (a)
   tying the recorded pair to a specific year, which the brief itself calls "a larger data-model
   change," or (b) the client-row door (`clara.set_client_fy_end`) and Knowledge moving together, as
   0318's own header already recommends ("a follow-up belongs on the CLIENT-ROW door, where both
   records can move together"). Not built here, per AC3's own instruction; worth filing as a
   distinct ticket if the owner wants the gap closed rather than only pinned.
2. **The `FREEZE_BASE_REF` drift**, flagged again above and already flagged by #1132's own report
   for this lane — will keep recurring for the remaining tickets in this lane until the branch
   merges past PR #1140. Still worth the one-line `RIG.md`/`WORK-ORDER.md` addition #1132's report
   proposed.

---

## Anything unverified

- **Hosted.** Not touched; no claim made about hosted's own catalog data or README state.
- **A true from-scratch chain** was not run and is not owed — no migration exists for this ticket
  to prove a first-apply/redo branch over.
- **Whether any OTHER caller of `clara._knowledge_assert_fye_pair`** besides
  `clara._knowledge_capture_core` and `clara.correct_knowledge` (the two 0318's own header and
  README already name) exists was not re-swept — out of this ticket's scope (a pinning test, not an
  audit), and the migration's own tail already proves both are the only two callers with a static
  grep the migration commits to.
- The scratch vacuity script (`packages/db/vacuity-1096.mjs`) was deleted after use and never
  committed; its exact content (the extraction logic, the sha values quoted above, and the
  break/restore SQL) is reproduced in full in this report's "AC2" section above so the steps are
  independently re-creatable without the file.
