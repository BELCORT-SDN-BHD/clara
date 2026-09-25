# riders sweep wave · lane 01 · ticket #1080 — the accrual lane joins the one authority wall

**Status: DONE.**
Branch `riders/wS-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, base `7bc5a710f`.
Database `clara_l04` at `127.0.0.1:55744`. Playwright triple unused (no `apps/web` change).

Start state, as the work order requires: `git status` clean; `git log --oneline 7bc5a710f..HEAD`
showed the two #1051 commits (`b1e0f9c3c`, `2ada717aa`) and the lane database read **310 files,
max `0330_plan_authority_wall_predicate`**.

Commits added by this ticket:

| sha | message |
|---|---|
| `012d31ac8` | `fix(db): #1080 the accrual lane joins the one authority wall (0331)` |
| `fe77786ea` | `test(db): #1080 both accrual entrances answer one wall, and the three kinds are driven` |
| `d9172f450` | `test(db): #1080 the census, and #977's carrier roster reaches zero` |
| `b28375a4d` | `test(db): #1080 re-pin clara._accrual_plan_core in the 0283 census cell` |
| `f762c1a87` | `docs: #1080 CONTEXT records that the accrual lane now enforces the rule it states` |

Working tree clean. Nothing pushed, no PR, no GitHub write of any kind. **No message arrived
mid-task.**

---

## The seams I tested at (written before the first test, work order rule 4)

1. **`clara.create_accrual_adjustment_for`** — the ON-BEHALF entrance, granted to `clara_runtime`
   only, driven on a real least-privileged runtime connection carrying no human JWT. This is the
   lane the ticket's own threat model names, and it turned out to be the only exposed one.
2. **`clara.create_accrual_adjustment`** — the human accrual door, granted to
   `clara_authenticated`, driven as a bookkeeper.
3. **The catalog** — the estate's documented structural standard for a recut body (a census, a
   prestate pin, a tail assertion). Work order rule 4 says that standard wins where it applies, and
   *"there is exactly ONE spelling of the plan authority wall and #977's inline probe survives
   nowhere"* is a claim only a census can carry: `clara._accrual_plan_core` is an ungranted
   internal with no public interface of its own.

---

## The ticket, verified live before building

`gh issue view 1080 --comments`: the issue body carries the only Agent Brief and there are **zero
comments** (`gh api repos/BELCORT-SDN-BHD/clara/issues/1080/comments` returns an empty array), so
there is no owner ruling comment on this ticket. The binding shape is the brief plus the sweep
wave's plan of record (`SWEEP-PLAN.md`, "Why each lane is grouped this way", L1).

| the ticket's claim | measured on this branch | verdict |
|---|---|---|
| `clara._accrual_plan_core` still resolves authority with 0222's own `exists` probes | live `prosrc` sha `31adc6d4…` = 0283:621-712 byte for byte, carrying `select exists (select 1 from clara.agent_tasks t where t.id = v_ref_id …)` | **live** |
| the human and other OBO plan cores call the shared wall | `clara._assert_plan_authority` called by exactly `_obo_plan_core, create_accounting_plan` (catalog census) | true |
| *"a wake task or an autodraft run could, in principle, authorise an accrual adjustment plan today"* | **not "in principle" — measured.** The first cell drove `clara.create_accrual_adjustment_for` on a real `clara_runtime` connection with a `wake` reference and it **SUCCEEDED**, writing the plan, revision, occurrence, accrual and Work | **live** |

**One correction to the ticket's framing, which changes nothing it asks for but changes the blast
radius.** The brief says `clara._accrual_plan_core` is what "the accrual lane" uses. Only ONE of
the two accrual entrances reaches it. `clara.create_accrual_adjustment` nests
`clara.create_accounting_plan` — and has since 0222 itself (`0222_accrual_adjustments.sql`, the
human door's plan step is `clara.create_accounting_plan`, the OBO door's is
`clara._accrual_plan_core`; the live catalog agrees: `_accrual_plan_core` is named by exactly one
body, `create_accrual_adjustment_for`). So the human accrual door has been behind #977's definition
since 0250 and behind #1051's predicate since 0330, and the gap was exactly where #977 aimed: the
machine lane, on a connection with no human on it.

---

## Acceptance criteria, each with its evidence

### AC1 — "`clara._accrual_plan_core` refuses a non-human-authored authority reference … the same way the human and other OBO plan doors already do." ✅

* Migration `packages/db/migrations/0331_accrual_plan_authority_wall.sql` replaces the block with
  `perform clara._assert_plan_authority(p_authority_kind, p_authority_ref, p_firm, p_client);`.
* **`p1080.accrual.obo_machine_task_refused`** — the on-behalf entrance, on a real `clara_runtime`
  connection, refuses a `wake` task (no author by construction) and an `autodraft` run (which DOES
  carry a named author) with `CLR10` / `authority_ref_not_human_instruction`, naming the reference's
  kind and the row it refused; the whole write footprint (plans, revisions, occurrences, accruals,
  Work) is unmoved on both; and the lane's own `accounting_work` instruction still configures on the
  same client. **PASS.**
* **`p1080.wall.one_spelling`** — off the catalog: the body calls the predicate, carries neither the
  wall's sentence nor #977's inline probe, and keeps its volatility, definer flag, owner, pinned
  `search_path` and owner-only ACL (no application role holds EXECUTE). **PASS.**

### AC2 — "A test drives an accrual plan configuration attempt with a non-human authority reference and asserts it is refused with the same reason the other plan lanes give." ✅

`p1080.accrual.obo_machine_task_refused` is that drive. **`p1080.accrual.entrances_agree`** is the
"same reason" half, and it is stronger than the criterion asks: it drives BOTH accrual entrances on
the same five references — a wake task, an autodraft run, a `chat_task` naming no row, an
`accounting_work` naming no row, and a kind nobody admits — and requires the **whole** refusal to
match, SQLSTATE and sentence and detail payload, with each side's payload naming its own row. It
also keeps #977's two tokens told apart (`authority_ref_not_human_instruction` vs
`authority_ref_unresolved`) and asserts neither entrance wrote anything on any of the five. **PASS.**

**`p1080.accrual.three_kinds_admitted`** is the admissions half, so a wall that refused everything
could not pass: an `accounting_work`, a HUMAN-AUTHORED chat turn and a real
`clara.contract_plan_confirmations` row are each ADMITTED through both entrances, and each plan row
is read back for the authority it cites (`authority_ref` deep-equal to the reference) and the human
it is authorised by (`authorised_by = BOB`, never the run). **PASS.**

### AC3 — "Every existing accrual-plan test that depends on the current (looser) behavior is reviewed and updated if it was relying on the gap." ✅

Reviewed by running them, not by reading them. **250 plan-family cells** ran (counts in the gates
table). Exactly **one** live cell depended on the gap and exactly one pinned the moved body:

1. **`packages/db/tests/authority-ref-human-instruction.test.mjs` → `p977.definition.one`** — its
   `carriers` roster was the closed literal `["_accrual_plan_core"]`, because 0250 could not reach
   that body and pinned the surviving inline probe there (0250:604). Seen RED
   (`+ [] - ['_accrual_plan_core']`), then made **BIMODAL on 0331** in the same idiom the cell
   already uses for #1051's wall. The branch is measured off the **applied chain** (0331's stable
   stem `accrual_plan_authority_wall$`, via a new `accrualPlanAuthorityWallReady()` in
   `authority-ref-human-instruction-fixtures.mjs`), not off the body under test: 0331 mints no name,
   so `to_regprocedure` cannot feature-detect it and asking the body would be asking the subject
   what it should be. Still an exact closed world in either branch. Now GREEN.
2. **`packages/db/tests/plan-overlap-template-arm-retired.test.mjs` → `p929.tail`** — pinned
   `_accrual_plan_core` at `31adc6d4…`. Seen RED, re-pinned to `89d2ac3a…` with the comment that
   file's own convention asks for (what recut it, why, and why what the pin is FOR — the client rung
   above any plan row lock, the advisory taking the door's own plan id — is unaffected and is
   re-checked structurally against the live body a few lines below). Now GREEN.
   **Note for the merger:** `SWEEP-PLAN.md` lists this file among L7's six census files (#1047),
   cross-checked against L1. This is the **second** L1 touch of it (the first was #1051's
   `create_accounting_plan` pin); mine is one sha literal and its comment.

**`packages/db/tests/plan-authority-wall.test.mjs` needed no edit** — #1051 stated its census as a
RULE (a body either calls the predicate or keeps its own copy, never both, and
`_accrual_plan_core` may be either) and the accrual core moved from the carrier side to the caller
side, which the rule already admitted. Verified by running it: GREEN, unedited.

### Out of scope, respected

* **"Any change to the accrual plan's other validation rules."** Proved mechanically, not asserted:
  the tail's **reverse substitution** (T.5) reads the installed body, puts 0222/0283's own authority
  block and the three declarations back, and requires the result to hash to `31adc6d4…`. The client
  rung, `_assert_plan_schedule`, `_assert_journal_basis`, both inserts, the overlap warning, the
  preview and the audit row therefore cannot have moved.
* **"Widening or narrowing the authority-reference vocabulary itself."** The estate's vocabulary is
  unchanged at three kinds. See the next section for the one lane-level consequence and why it is a
  parity fix rather than a widening.

---

## What moves, beyond the refusal the ticket is about

Folding onto the ONE predicate is what the ticket asks for, and sameness is not selective. Three
things change and each is this lane catching up with the estate:

| what | before 0331 | after 0331 |
|---|---|---|
| a `chat_task` naming a wake task or an autodraft run | **ADMITTED** | CLR10 `authority_ref_not_human_instruction` |
| a `contract_confirmation` (#949, 0300) | CLR10 `authority_ref_invalid` / `kind` | admitted, resolved by `clara._authority_ref_refusal` under the same firm-and-client ladder |
| two sentences | "names an accounting_work or a chat_task"; "the instruction this **accrual** cites does not exist for this client" | the three-kind sentence; "the instruction this **plan** cites does not exist for this client" |

**Row 2 is a parity fix, not a widening.** The HUMAN accrual entrance has admitted a
`contract_confirmation` since 0300 (it nests the human plan door); only the on-behalf one refused it,
because 0222's list was frozen at two kinds. Nothing new becomes authority:
`clara.contract_plan_confirmations.confirmed_by` is NOT NULL and the only two writers of that table
(`clara.confirm_tenancy_rent_plan`, `clara.confirm_tenancy_rent_plan_revision`) are granted to
`clara_authenticated` alone (measured on the live catalog), so a runtime connection cannot
manufacture one. Driven, not argued: `p1080.accrual.three_kinds_admitted` plants a real row and
admits it through both entrances.

**Row 3 changes a sentence a bookkeeper can see, towards what the human entrance already says.**
Every SQLSTATE and every `detail.reason` token is unchanged; what ends is one client getting two
different sentences for one refusal depending on which entrance ran. Driven by
`p1080.accrual.entrances_agree`, which requires `o.message === h.message`.

---

## The migration

**`packages/db/migrations/0331_accrual_plan_authority_wall.sql`** (469 lines). Exactly one new file,
at the number reserved for me. **No overflow number was needed.**

### Prestate pins — MEASURED on `clara_l04` now, after #1051's 0330, never copied from a header

| signature | pin | role |
|---|---|---|
| `clara._assert_plan_authority(text,jsonb,uuid,uuid)` | `60f2c5d10378f9fc853e672cc6bc53d662322283c3ed5276e399e87e71ee202b` | the predicate this file calls — pinned UNCONDITIONALLY (it *is* what this lane admits and refuses from today), re-pinned at the tail |
| `clara._authority_ref_refusal(text,uuid,uuid,uuid)` | `55c20b2008d51cc58cd4dc29b3f434965ead8450a846a73eb9f01f62d53cc208` | the #977 definition beneath the predicate; the new refusal this lane gains is its answer — pinned unconditionally, re-pinned at the tail |
| `clara._accrual_plan_core(uuid,uuid,uuid,text,text,jsonb,text,text,integer,text,date,date,jsonb)` | pre `31adc6d4ae74d220b33fc950d164b0a256cafc914b2e1486400db20124939bc5` → post `89d2ac3a33e8dcda53b0f42a6c500a6a9aefd567af57ecfe181ce82eaa248625` | RECUT, bimodal |
| `clara.create_accounting_plan(…)` and `clara._obo_plan_core(…)` | **deliberately NOT sha-pinned** | asserted STRUCTURALLY (each must CALL the predicate, which is the fact the tail's census relies on). Sha-pinning 0330's output bytes from a later file of the same lane would couple this one to them for no gain, and #1074/#1073/#1075 follow me in this lane |

The prestate also pins `clara._accrual_plan_core`'s **grant posture** (owner-only ACL, PUBLIC denied)
so the tail can prove the recut preserved it — a `create or replace` preserves an ACL, and this
asserts there was nothing to preserve but the owner's own. It has **no data-dependent branch**:
every arm reads the catalog only, so no arm needs rows to be entered.

### The change

One `create or replace function clara._accrual_plan_core(…)`, a `revoke all … from public`, and a
`comment on function` recording what moved and what did not. No new name, no table, no CHECK, no
chart row, no grant. The new body was produced mechanically from the LIVE pre-image by two
replacements (the authority block → one `perform` plus a comment; the declaration line minus
`v_ref_kind`, `v_ref_id`, `v_ok`), and the reverse substitution was verified in the generator before
the file was written.

### Tail

T.1/T.1b/T.1c/T.1d the recut body at its post-image with definer/volatile/owner/`search_path` and
owner-only ACL, and unreachable by `clara_authenticated` / `clara_runtime` / `clara_agent_ro` /
PUBLIC · T.2/T.2b/T.2c it calls the predicate and carries neither the wall's sentence nor #977's
inline probe · T.3/T.3b/T.3c the predicate and the definition beneath it byte-identical and still
ungranted · **T.4 the four censuses**: the wall's sentence in exactly `_assert_plan_authority`; the
predicate called by exactly `_accrual_plan_core, _obo_plan_core, create_accounting_plan`; #977's
inline probe in **ZERO** bodies (0250:604 pinned it at one; this is the file that took it to none);
0222's own "the instruction this accrual cites" sentence in **ZERO** · **T.5 reverse substitution**
back to `31adc6d4…`. Each roster is compared against a literal built with `order by p.proname`,
which is the catalog's own C ordering (`proname` is `name`), so it is collation-proof by
construction (sweep rule (e)). No digest over text-ordered row content is pinned anywhere.

### Apply history on this rig

1. `pnpm --filter @clara/db migrate` → `applied 0331_accrual_plan_authority_wall`, prestate printed
   **`FIRST APPLY`**, tail printed OK including the reverse substitution. (The first-apply branch was
   exercised for real here, so no hand proof of it was needed; the REDO branch is below.)
2. **`CLARA_MIGRATION_REDO=0331_accrual_plan_authority_wall`** (`CLARA_ALLOW_DESTRUCTIVE=1`,
   `CLARA_RIG_DB=1`) → `redone … new checksum 6e959c69b9affec58cba143f87d8a84079028d51bbad229a654bd8e6341aea63`,
   prestate printed **`REDO APPLY`**, tail OK. **Recorded as the work order requires.**
3. A third `migrate` → `0 new migration(s) applied · 311 total`, no drift. Ledger now **311 files,
   max `0331_accrual_plan_authority_wall`**.

---

## TDD — the slices, and the red I saw for each

**Slice 1 — the behaviour the ticket is about.** `p1080.accrual.obo_machine_task_refused` written
first and run against the un-migrated lane database: **RED, for exactly the right reason —**

```
error: 'the on-behalf accrual entrance, on a wake task — the estate enqueuing work for itself,
        no author by construction: expected SQLSTATE CLR10 but the call SUCCEEDED (no error)'
```

That line is the ticket's own claim, measured. Then the migration (the minimal change: one block
becomes one `perform`), then **GREEN**. The file's frontier gate and its preintegration gate module
landed with the migration in the same commit, which is the house shape for a new db test file; the
first red was run with the gate scaffolded out, and the scaffold is recorded here rather than
hidden.

**Slice 2 — the rest of the surface at the same two seams.** `p1080.accrual.entrances_agree` and
`p1080.accrual.three_kinds_admitted`, written one at a time and shaped by what slice 1 taught (that
only the on-behalf entrance was exposed, so PARITY is the claim worth making). Both green on first
run against the folded body.

**Slice 3 — the catalog.** `p1080.wall.one_spelling`.

**The vacuity control (work order rule 4), run twice.** Cells written after a change is live cannot
go red by being written first, so the control the work order names was applied: with
`clara._accrual_plan_core` recut **on the rig only** back to its 0283 pre-image (sha re-measured as
`31adc6d4…` to prove the break was exact), the whole file went RED — all four cells, each for its
own reason:

```
not ok 1 … error: 'the on-behalf accrual entrance … expected SQLSTATE CLR10 but the call SUCCEEDED'
not ok 2 … error: 'the on-behalf accrual entrance … expected a refusal but the call SUCCEEDED'
not ok 3 … error: 'a plan authority reference names an accounting_work or a chat_task'
not ok 4 … error: 'clara._accrual_plan_core(…) reaches the wall through clara._assert_plan_authority('
```

The subject was then restored **byte for byte** by re-running 0331's own function statement and the
body re-measured (`89d2ac3a…` before the break and `89d2ac3a…` after the restore); all four green
again. The control does double duty: it proves no cell is vacuous **and** it shows on the rig
exactly what the gap looked like.

No battery of red cells was written ahead of implementation.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| my new file + the two repaired files, **full gate chain** (127 `--import` gate modules, mine included) | `node --test --test-concurrency=1 $GATES tests/accrual-plan-authority-wall.test.mjs tests/authority-ref-human-instruction.test.mjs tests/plan-authority-wall.test.mjs` | **13 tests, 13 pass, 0 fail, 0 skipped** |
| operation census + rig isolation, **no reset flags** | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests, 32 pass, 0 fail, 1 skipped** — the one skip is `T19 poison-role`, skipped *because* `CLARA_RIG_ALLOW_RESET` is unset, which is the rig rule. Run although I added no SQL function (I recut one), and `T17`/`T18` both pass. |
| behaviour preservation, accrual + plan part 1 (`accrual-adjustments`, `accrual-correction`, `accrual-bill-conflict`, `accrual-period-amounts`, `accrual-revenue-side`, `accounting-plans`, `accounting-plan-occurrences`), full chain | as above | **103 tests, 103 pass, 0 fail, 0 skipped** |
| behaviour preservation, plan family part 2 (`plan-schedule-yield-wall`, `plan-overlap-sibling-arm`, `plan-overlap-template-arm-retired`, `prepayment-schedule`, `prepayment-schedule-obo`, `prepayment-occurrences`, `prepayment-wake-reroute`, `revenue-recognition`, `tenancy-rent-plan`, `depreciation-history`), full chain | as above | **147 tests, 147 pass, 0 fail, 0 skipped** (1 fail on the first run — `p929.tail`'s pin — then green after the re-pin) |
| web migration-pins corpus (sweep rule (d): in scope because a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` from `apps/web` | **22 tests, 22 pass, 0 fail** — confirms **no barrier entry is owed for 0331** |
| typecheck | `pnpm typecheck` | **exit 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** (run twice: after the re-pin commit and again after the CONTEXT commit) |
| frozen closures | `node scripts/check-frozen-workflows.mjs` | `OK — 322 frozen file(s) verified …` no manifest diff |
| migration ledger | `pnpm --filter @clara/db migrate` (third run) | `0 new migration(s) applied · 311 total`, max `0331_accrual_plan_authority_wall` |

**250 plan-family cells** were run for behaviour preservation. That is beyond the letter of rule 8;
I ran them because a body shared by every accrual entrance was recut and the ticket's own AC3 asks
for exactly this review — a green census is not that proof.

**`apps/web` and `packages/runtime` were not touched** (`git diff --name-only 2ada717aa..HEAD --
apps packages/runtime` → 0 files), so the whole web unit suite and the browser walks were not
required and were not run. The one `apps/web` file I did run is the pins corpus, which sweep rule
(d) puts in scope for any migration change.

---

## Docs, in the same commits

* **`packages/db/README.md`** — new `## 0331` section: why this one is a behaviour fix rather than a
  fold, the probe quoted, which entrance was exposed and which never was, the three-row table of
  what moves with the parity argument and the grant evidence for it, what is proved and how (static
  DDL → no corpus entry owed; reverse substitution; the four censuses), redo safety with both
  branches, and what the file does not do. **No existing section was edited** and no applied
  migration was touched (`git show --stat` on every commit: 0222, 0250, 0283, 0300, 0308 and 0330 are
  all untouched).
* **`packages/db/tests/README.md`** — a new `## The accrual lane's own authority wall (#1080, …)`
  section describing all four cells and the non-vacuity control; the `p977.definition.one` bullet
  rewritten for its new bimodality on 0331; and the `p1051.wall.one_definition` bullet updated to
  record that its rule-shaped census composed with #1080 exactly as intended and needed no edit.
* **`packages/db/package.json`** — one `--import ./tests/accrual-plan-authority-wall-preintegration-gate.mjs`,
  at the sorted position in migration order (immediately after 0330's). Minimal hunk on a shared
  file; JSON re-parsed after the edit.
* **`packages/db/tests/rig-meta.mjs` — NO cohort is owed and none was added.** The plan's own rule
  is "one cohort entry per migration that **mints a new name**"; 0331 mints none (it recuts one
  existing body), so there is no name that could be half-present at an earlier frontier. Stated here
  so the integrator does not read the absence as an omission.
* **`CONTEXT.md`** — one minimal correction inside the existing **"Authorising instruction"** entry:
  it said the plan lane states the admitted set "in one predicate **both plan doors** call", which
  three bodies now call, and the third is the one where the rule that entry states was written down
  and not enforced. No new term, no new heading.
  **Flagged for the merger:** `SWEEP-PLAN.md`'s shared-file table assigns `CONTEXT.md` to **L3 only,
  and only if #1049 stays in the wave**. This is the second L1 hunk (the first was #1051's) and both
  are adjacent lines of the same paragraph, so they merge as one region.

---

## Successor contract

**None is owed.** This ticket touches no frozen workflow body and no module in a frozen closure
(`check-frozen-workflows.mjs` clean, 322 files), and it changes no door's name, signature, argument
order, grant or `detail.reason` vocabulary. `clara.create_accrual_adjustment` and
`clara.create_accrual_adjustment_for` keep their exact signatures and grants, and every refusal keeps
its SQLSTATE and its token.

What a caller of the on-behalf accrual entrance should know, for a later ticket's reference — this
is a **behaviour** note, not a new interface:

```
clara.create_accrual_adjustment_for(p_client uuid, p_author uuid, p_purpose text,
    p_authority_ref jsonb, p_accrual jsonb, p_frequency text, p_day_rule text,
    p_day_of_month integer, p_timezone text, p_effective_from date, p_effective_to date,
    p_op_key text) returns jsonb            -- clara_runtime only, unchanged
```
`p_authority_ref` now admits `{kind: 'accounting_work'|'chat_task'|'contract_confirmation', id}`
(was two kinds), and a `chat_task` is admitted only when the named `clara.agent_tasks` row is a
`chat_turn` carrying a non-null `created_by`. New refusal reachable from this door:
`CLR10` / `detail.reason = 'authority_ref_not_human_instruction'`, with `kind` and `id`. A wake or
autodraft caller that used to pass its own task id must instead pass the human instruction it is
acting on — which is what every other plan lane already requires.

---

## Follow-ups worth filing (I filed nothing — no GitHub write)

1. **A stale literal in `apps/web/components/accruals/accrual-form.test.tsx:337-340,350`.** The cell
   `652.form: a form-level refusal is a persistent banner carrying the code and reason` mocks the
   submit with `refusal("CLR10", "authority_ref_unresolved", "the instruction this accrual cites
   does not exist for this client")`. That sentence is **not** what the door the form calls answers,
   and never was: `apps/web/lib/accruals/api.ts:313` calls `create_accrual_adjustment`, the human
   door, which has nested `clara.create_accounting_plan` since 0222 and therefore answers "the
   instruction this **plan** cites…". After 0331 the string exists nowhere in the estate at all
   (0331's tail T.4d asserts exactly that). It is a **pre-existing** staleness in a mocked value, the
   cell's own claim is about banner rendering, and it is not caused by this ticket — so I left
   `apps/web` untouched rather than widen the ticket into a whole-web-suite gate for one string.
   Worth a one-line fix in a lane that is already touching that file.
2. **A `CLARA_MIGRATION_REDO` of 0330 after 0331 would red.** 0330's tail `T.6` pins the wall's
   sentence to the literal roster `'_accrual_plan_core, _assert_plan_authority'`, which is a true
   statement of the world at 0330's own apply point and false once 0331 has applied. A from-scratch
   chain is unaffected (0330 applies first, in order, and its own cells and 0331's prestate both
   passed on this rig). Only a redo of 0330 *out of order* would hit it, which the redo mode already
   refuses (it takes the highest applied version only). Recorded so nobody reads it as a defect.
3. **The parameterised admitted set now has exactly one home.** #1051's report already noted this;
   with 0331 it is three bodies behind one predicate, so if a lane ever needs one plan lane narrower
   than the others, the parameter goes on `clara._assert_plan_authority` and nothing else moves.
4. **`clara.agent_tasks.kind = 'close_prep'` and `'accounting_work'`** are refused by the same arm
   as `wake`/`autodraft` (they are runs, not turns). The accrual lane now refuses them too. No cell
   of mine drives those two kinds at the accrual seam —
   `authority-ref-human-instruction.test.mjs` drives the rule at `clara._authority_ref_refusal`'s own
   two doors and `mintAgentTaskRef` only mints `chat_turn`/`autodraft`/`wake`. Cheap to add if a
   reviewer wants the full kind matrix at this seam.

---

## Anything unverified

* **The from-scratch chain.** Not run, and deliberately not runnable here (RIG.md forbids a second
  from-scratch chain on a lane cluster; the integrator runs it on a disposable cluster). What
  supports it: 0331's prestate took its **FIRST APPLY** branch for real against the live pre-image;
  the tail's reverse substitution proves the installed body reduces to exactly `31adc6d4…`, which is
  the pre-image 0283, 0303 and 0304 pin and all three apply BEFORE 0331 in file order; and
  `31adc6d4…` was re-grepped across the repo after the change — it survives only in 0331's own two
  pin constants and in those three applied files' prestates (plus historical reports).
* **Hosted rows I could not exercise.** A `contract_plan_confirmations` row born through #949's real
  tenancy confirm door: my cell plants the row directly and says so in the fixture comment, because
  what the cell is about is the accrual lane's treatment of the kind, not how the row is born
  (`tenancy-rent-plan.test.mjs` owns that door, and it ran green in the plan-family batch). The wall
  resolves a confirmation by existence under the firm-and-client ladder either way, through
  `clara._authority_ref_refusal`, which this file pins byte-identical before and after.
* **The two remaining `agent_tasks` kinds** (`close_prep`, `accounting_work`) at the accrual seam —
  see follow-up 4. Their refusal follows from the same pinned body, but no cell of mine drove them
  *at this door*, so I do not claim it as driven.
* **The lane database is now two migrations ahead of the other lanes' databases** (311 files vs 309).
  Expected; recorded so #1074, the next ticket of this lane, does not read it as drift, and so it
  knows its own prestate must pin what is live AFTER 0330 and 0331.
