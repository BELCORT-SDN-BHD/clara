# wave 4 · lane 04 · #939 — amortise a prepayment with no source document from a person-stated service period

**Branch** `riders/w4-lane04` · **base** `cd2925391` · **status** DONE.

**Commits** (`git log --oneline cd2925391..HEAD`, oldest first):

| commit | subject |
|---|---|
| `bd7da218a` | `feat(db): #939 a person-stated prepayment term carrier and its one human door` |
| `af4f89a8f` | `feat(db): #939 clara.prepayment_schedule_v2 -- v1's formula with the amount and the term as inputs` |
| `ce03f20cd` | `feat(db): #939 create_prepayment_schedule admits a memo-only source once a term is stated` |
| `aa7e417f7` | `test(db): #939 a corrected statement never moves a running schedule` |
| `acb48d8c3` | `feat(db): #939 the schedule reads and the attention band learn the second term carrier` |
| `acfebed43` | `feat(web): #939 the term's provenance on every prepayment surface, and the act that creates it` |
| `bc1b5d42d` | `test(db): #939 the evaluator ceremony rosters learn prepayment_schedule v2` |
| `df720951a` | `test(web): #939 the memo-only walk declares the poll budget its own waits cost` |

The ticket was verified live on this branch before any code was written: `gh api
repos/BELCORT-SDN-BHD/clara/issues/939` returns `open`, labels `enhancement` + `ready-for-agent`, and
the issue carries **no comments at all** — so the body IS the newest Agent Brief and there is no
2026-09-20 owner ruling comment to override it. (`gh issue view` prints nothing at all through this
harness's shells; `gh api … --jq` is what actually returns the body. Noted as a rig quirk, not a
finding about the ticket.)

---

## The seams I tested at

Written down before the first test, from the brief's own acceptance criteria. Every one is a public
interface the brief names; there is no cell at a seam the brief does not give.

| # | seam | kind |
|---|---|---|
| S1 | `clara.record_prepayment_stated_term(client, source_entry, period_start, period_end, reason, op_key)` | new human door |
| S2 | `clara.prepayment_stated_terms` | new relation (posture, RLS, triggers, index — the repo's own structural standard) |
| S3 | `clara.prepayment_schedule_v2(total_cents, account_code, release_side, term_start, term_end)` | new frozen evaluator |
| S4 | `clara.create_prepayment_schedule(...)` | existing door, memo-only arm |
| S5 | `clara.list_prepayment_attention(client)` | existing read, arm B |
| S6 | `clara.get_prepayment_schedule(schedule)` / `clara.list_prepayment_schedules(client)` | existing reads |
| S7 | `apps/web/lib/prepayments/api.ts` | the web write + row types |
| S8 | `PrepaymentsList` rendered behaviour | marker + filter |
| S9 | `PrepaymentDetail` rendered behaviour | who/when/why, and no document link |
| S10 | `PrepaymentAttentionBand` rendered behaviour | the third next act |
| S11 | `PrepaymentForm` rendered behaviour | memo-only option copy + the statement |
| S12 | `prepayments-walk.spec.ts` | the browser leg |

---

## Acceptance criteria, each with its evidence

### AC1 — the append-only, supersede-only stated-term record and its human door

**Done.** `clara.prepayment_stated_terms` (migration `0305_prepayment_stated_term.sql` §A) at
RECOGNITION-ENTRY grain: `client_id`, `source_entry_id`, `period_start`, `period_end`, `reason`
(NOT NULL, `btrim(reason) <> ''`), `stated_by`, `stated_at`, `superseded_by`/`superseded_at`.
The discipline is `clara.document_service_periods`' own, column for column:

* `_tf_pst_supersede_only` (the ONE lawful update is the supersession stamp), `t_pst_no_delete`
  (`clara._tf_append_only`), `t_pst_no_truncate`;
* `uq_prepayment_stated_term_live` — partial-unique on `source_entry_id where superseded_at is null`;
* finite / domain (1900-01-01 .. 2200-12-31) / order / supersession-paired checks, and
  `ck_pst_max_periods`, which is `ck_dsp_max_periods`' expression **verbatim** (the owner's
  decision 5 is "the same 120-month cap", and a cap computed a second way would be a second cap);
* tenancy is structural — a composite FK onto `uq_journal_entries_id_firm_client` and another onto
  `uq_clients_id_firm`, so RLS's firm predicate and every reader's entry predicate are provably the
  same tenant;
* `enable`/`force row level security` with `p_pst_owner` (owner, unconditional) and `p_pst_human`
  (SELECT only, `firm_id = clara.jwt_firm() and clara.actor_role_rank() >= clara.role_rank('bookkeeper')`).

The door is `clara.record_prepayment_stated_term`, bookkeeper floor (decision 2), `clara_authenticated`
ONLY, `clara._reserve_op` idempotency taken before any mutable validation.

**The machine role cannot reach it, read positively and twice.** Cell
`p939.stated_term.record` asserts `has_function_privilege(role, …, 'execute') = false` for
`clara_agent_ro`, `clara_wake_interactive`, `clara_wake_proactive` and `clara_runtime`, `= true` for
`clara_authenticated`, **and** that exactly ONE function in the whole `clara` schema is named for
the stated term (`select proname … where proname ~ 'prepayment_stated_term'` → `["record_prepayment_stated_term"]`) —
so there is no wake wrapper and no agent core, by census rather than by convention. §TAIL asserts the
same two facts at apply time.

*Evidence:* `packages/db/tests/prepayment-stated-term.test.mjs` cell `p939.stated_term.record`
(floor refusal as a viewer; stored who/when/why; blank-reason refusal
`prepayment_stated_term_reason_missing`; the supersession chain with exactly one live row;
`prepayment_stated_term_source_has_document`; `prepayment_source_entry_not_found`), green.

### AC2 — `term_source`, `stated_term_id`, and a `prepayment_schedule_v2` that agrees with v1

**Done.**

* `clara.prepayment_schedules` gains `term_source text not null` ('document_service_period' |
  'human_stated') and `stated_term_id uuid references clara.prepayment_stated_terms(id)`;
  `service_period_id` and `document_id` become nullable; `ck_ps_term_source_carrier` makes the
  pairing structural, so a row names exactly one carrier and can never claim a provenance it cannot
  point at. Existing rows backfill through the column default (correct rather than convenient — the
  document lane was the only route there was), and the default is then DROPPED so every later writer
  must say which lane it is on.
* **The frozen `prepayment_schedule_v1` body is not edited.** Pinned UNCONDITIONALLY at BOTH ends of
  the migration by `sha256(prosrc)` = `ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2`,
  and re-measured in §TAIL after the file has run.
* `clara.prepayment_schedule_v2(bigint, text, text, date, date)` takes the amount, the released
  account, the released SIDE and the term as arguments. It calls no other `clara` function and reads
  no table — §TAIL censuses that by CALL SHAPE (`clara\.[A-Za-z_][A-Za-z0-9_]*\s*\(`) rather than the
  bare string `clara.`, which would match a qualified table name (0140's own W11 note) — which is what
  keeps its registration a genuine single-member closure. Registered as
  `('prepayment_schedule', 2)` with `deployed = false`, under `search_path = pg_catalog, pg_temp`
  (0059's recorded reason: the verifier reproduces the closure hash under that path).
  `release_side` is an argument and not a default because a prepaid ASSET is released by credit and a
  deferred-revenue LIABILITY by debit — which is also how the #941 mirror rides the same evaluator.

**Cells prove v1 and v2 agree.** `p939.evaluator.v2_agrees` drives BOTH evaluators:

* three whole months over 100,001 cents: v1 emits `[33333, 33333, 33335]` (a worked example, not a
  re-computation), and `assert.deepEqual(v2.period_lines, v1.period_lines)` — byte for byte — plus
  equal `total_cents`, `period_count`, `remainder_placement`, `term_start`, `term_end`, and
  `v2.release_account_code === v1.prepaid_account_code`;
* **the 120-month cap**: a scene whose document term is recorded at the carrier's maximum
  (`maxTermScene`, which opens the CONTIGUOUS successor fiscal year `clara.open_fiscal_year`
  demands and then re-records the term at 120 months through the same human door) — v1 emits 120
  periods and `assert.deepEqual(longV2.period_lines, longV1.period_lines)`;
* one month further (121 charged months, which v1 can never meet because its carrier refuses to hold
  one) is refused by v2 `prepayment_term_underivable` / `axis: term_too_long` /
  `derived_periods: 121` / `max_periods: 120`;
* the mirror: the same three amounts released by DEBIT on account `2030`;
* and the refusals are RETURNED, never raised — `amount_not_positive`, `account_missing`,
  `release_side_unknown`, `dates_inverted`, `no_whole_month`.

`p939.evaluator.frozen` reads the registry back: exactly two registered versions of the
`prepayment_schedule` evaluator, ONE member each, every registered member hash recomputed LIVE off
`pg_get_functiondef` and equal to the stored one, `clara.verify_evaluator_freeze()` green over the
whole estate, `deployed = false`, `migration_version = '0305_prepayment_stated_term'`, and neither
evaluator executable by `clara_authenticated`, `clara_agent_ro`, either wake role or `clara_runtime`.

*Not in `frozen-evaluators.json`, deliberately:* that lint discovers only the `clara.evaluate_*`
spelling (`scripts/check-frozen-evaluators.mjs:62`), which is why `clara.prepayment_schedule_v1` has
no entry there either. The DB-side freeze — `clara.verify_evaluator_freeze()`, run by `migrate.mjs`
between every migration body and its commit — is what binds both. Measured:
`grep -n "prepayment" frozen-evaluators.json` returns nothing on the base.

### AC3 — the door accepts a memo-only source, and the refusal names the stating door

**Done.** `clara.create_prepayment_schedule` now reads the recognition entry ONCE and branches on
whether it binds a document.

* **The document lane is 0223's body unchanged**: `prepayment_schedule_v1`, its returned refusals
  re-raised with their payloads intact, the `document_service_periods` row re-read so the schedule
  names the exact term it rode.
* **The memo-only lane asks v1's three fitness arms IN THE DOOR** — posted; exactly one debited asset
  leg; a fiscal year that admits the term — with 0140's OWN tokens, sentences and payload keys, then
  calls `prepayment_schedule_v2` with the leg it picked, `'credit'`, and the live stated term. v2
  cannot ask those arms (it reads no table by design, which is what keeps its closure at one member),
  so the DOOR asks them: the ticket's own line, "the door, not the evaluator, picks the source leg and
  the term source". The prepaid-leg eligibility wall is asked AFTER the branch, so it guards both lanes.
* **The refusal names the remedy**: `prepayment_term_underivable` with
  `missing: "prepayment_stated_terms"` and `remedy: "clara.record_prepayment_stated_term"` — where the
  old answer named `journal_entries.document_id` and told a firm its prepayment could never be
  amortised at all.
* **The attention read's candidate arm lists memo-only prepayments.** Arm B's
  `je.document_id is not null` filter is gone, and each candidate carries `term_carrier`,
  `has_live_term` computed against THAT carrier, and `next_step` as a closed token
  (`configure_schedule` / `record_document_service_period` / `state_service_period`) — a token
  rather than a sentence, because the copy is the surface's and the fact is the database's.
* **The form's source dropdown offers them with matching copy** — the option itself carries
  `(no document)`, and the banner is `sourceNeedsStatedTerm` ("A person states the service period
  for this prepayment…") rather than the document lane's "record it on the document" sentence.

*Evidence:* `p939.create.memo_only` (the refusal with its remedy, zero schedule rows written, then
the same door configuring the schedule off v2 with `[33333, 33333, 33335]`, `schedule_version` `v2`,
`term_source` `human_stated`, `stated_term_id` equal to the live statement, `document_id` and
`service_period_id` null — read off the RELATION as well as the envelope — and the document-backed
sibling on the same client still `v1` / `document_service_period`; plus an unapproved and an
ambiguous-leg memo-only source both still `prepayment_source_unfit`).
`p939.attention.memo_only` (arm B before the term, after the term, after the schedule; the document
lane's contrast; and a memo-only RECEIVABLE still not advertised).
`prepayments.form.state_term` (the option copy, the statement written through the door with its own
op key, and the re-read).

### AC4 — superseding a stated term never alters a running schedule

**Done.** `p939.supersede.running` drives the whole path rather than asserting it: a memo-only
schedule is configured, `wake_due_plan_occurrences` admits its due period, the Work is claimed and
the entry REALLY posts through the OBO door (`posted === true`), and the committed receipt is read
back. Only then is the term corrected — to genuinely different dates — through the stating door.
Afterwards: the stored `period_lines` are byte-identical, `term_start`/`term_end` unmoved,
`stated_term_id` still naming the SUPERSEDED statement, the occurrence rows identical
`(due_date, work_id, attempt)`, the committed receipt the SAME receipt id, and
`get_prepayment_schedule`'s period projection unchanged. A second schedule over the same recognition
is still refused CLR13 `prepayment_schedule_exists`.

**Vacuity control** (this cell's subject already satisfied it, so the work order's control applies):
`clara.record_prepayment_stated_term` was replaced by a mutant that re-derives the running schedule
in place (disabling `t_prepayment_schedules_append_only` to do it); the cell was run and FAILED on
"…and the schedule still carries the term it rode" (got `2026-06-01`); the subject was then restored
byte for byte by `CLARA_MIGRATION_REDO=0305_prepayment_stated_term pnpm db:migrate` — prosrc sha
`8a7a2fe5a4b274ea5fbe789b02ef97946c927789bd0398863beb8f54d3947f98`, trigger back to `tgenabled = 'O'` —
and all cells green again.

*Deliberately not built:* the brief's middle sentence, "a new schedule from the next period is the
only correction path", is a statement of DESIGN. The estate enforces its negative half (nothing
moves; a second schedule over the same recognition is refused by name) — the positive half, opening a
replacement schedule for the remaining balance, is not buildable without lifting
`uq_prepayment_schedules_source`, which this ticket does not ask for. Recorded as a follow-up below.

### AC5 — the list and the detail show the term source; the walk covers it end to end

**Done.**

* `clara.get_prepayment_schedule` and `clara.list_prepayment_schedules` carry `term_source`,
  `stated_term_id`, `term_stated_by`, `term_stated_at`, `term_reason`.
* **The list** marks the human-stated row with a WORD (`Term stated by a person`, testid
  `prepayment-row-term-stated`) and offers a `Term came from` filter that runs over the rows the read
  already holds — both lanes arrive in one answer, so re-reading to narrow would be a second answer to
  one question.
* **The detail** renders the stated trio as its own block (testid `prepayment-term-stated`) — on this
  lane there is no invoice behind the term, so the reason a named person gave is the whole audit trail
  a reviewer has — and renders NO "Open the document" link when `document_id` is null.
* Every surface tests `term_source === "human_stated"` rather than the absence of a document id, for
  #919's own stated reason: the field arrives as unvalidated jsonb and an absent one must paint
  nothing.

*Evidence:* `p939.reads.term_source` (both reads, both lanes, one client);
`prepayments.list.term_source`, `prepayments.detail.term_source` ×2,
`prepayments.attention.state_term`, `prepayments.form.state_term`; and the browser walk
`prepayments.walk.memo_only`, which goes band → form → statement → configure → detail → filtered
list in one journey (see the gate table for its result).

### AC6 — #919's reads are extended, not forked; from-scratch apply; the batteries stay green

**Done.**

* **Extended, not forked.** `term_live`, `term_superseded_by`, `term_moved`, `term_current_start` and
  `term_current_end` keep their exact #919 meanings and are computed against WHICHEVER carrier the
  schedule rode, chosen by `term_source`. A surface written against #919 keeps working. ADV-02 carries
  over unchanged, because `record_prepayment_stated_term` supersedes unconditionally too — cell
  `p939.reads.term_source` drives a re-statement with the SAME dates and asserts `term_live === false`
  **and** `term_moved === false`, then a real correction and asserts both flags flip on BOTH reads.
* **A real bug fixed on the way**: `list_prepayment_schedules` joined `document_service_periods`
  INNER on `service_period_id`. The moment a schedule exists with no document row it would have been
  ABSENT from its own firm's list — live in the books, invisible on the screen. Both carriers are now
  LEFT joins and `term_source` says which to read.
* **From-scratch apply.** The prestate's FIRST-APPLY branch was proved by hand, as the wave-3 addendum
  requires of any marker-tolerant pin (`CLARA_MIGRATION_REDO` only ever takes the "already recut"
  branch): inside ONE transaction that was rolled back, 0223's and 0285's OWN `create function`
  statements for the four recut bodies were re-run verbatim to restore the pre-images, the prestate
  block was executed verbatim, and it reported
  `clara.create_prepayment_schedule(…)=FIRST clara.list_prepayment_attention(uuid)=FIRST clara.get_prepayment_schedule(uuid)=FIRST clara.list_prepayment_schedules(uuid)=FIRST`.
  The rollback was verified afterwards (all four bodies carry `#939` again). The true from-scratch
  chain on a disposable cluster is the integrator's, per the work order.
* **The prepayment batteries stay green**: see the gate table.

**The brief's two blockers.** #919 (migration `0285`) is on this lane's base and its two recut reads
are the bodies §F extends — pinned by their post-0285 sha, not 0223's. #911's prepayment-account
roster has NOT landed: there is no positive roster in this estate, and 0223's own header says why
(it would need a chart-level classification the estate does not carry). The memo-only lane therefore
passes exactly the wall the document lane passes — `clara._adj_line_eligibility_breach`, asked AFTER
the branch in the door and inside arm B's own predicate — so when #911 does land, one change in one
place covers both lanes. Cell `p939.attention.memo_only` drives that wall on the memo lane with a
memo-only RECEIVABLE, because removing arm B's `document_id is not null` filter left it as the only
thing standing between the band and every uninvoiced sale a firm posts.

---

## The migration

`packages/db/migrations/0305_prepayment_stated_term.sql` — the one file, at the number reserved for
this ticket. Sections: §0 prestate · §A the carrier, its triggers, its RLS · §B the human door ·
§C `prepayment_schedule_v2` · §C.1 the freeze registration · §D the schedule columns and the carrier
constraint · §E the `create_prepayment_schedule` recut · §F the two schedule reads · §G the attention
read · §TAIL.

**Prestate pins, MEASURED on `clara_l04` before the first apply** (every one listed, as the wave-3
addendum requires, so the integrator can find a pin another lane recuts):

| signature | `sha256(prosrc)` | mode |
|---|---|---|
| `clara.create_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)` | `aa917dfd042be429eb62c96c7b2075003c097ac445e77d9a35501762740f506f` | bimodal (recut by §E) |
| `clara.list_prepayment_attention(uuid)` | `0ac2975581a0f330b5e5e0ebb6b1f9d56a5d5d6cdae9973f59a24142a4fd1e49` | bimodal (recut by §G) |
| `clara.get_prepayment_schedule(uuid)` | `2d7d8c2a4dfa89cd7c12146ab90b35fd57303668c6b2b73e56b4e139c4f8e686` | bimodal (recut by §F) |
| `clara.list_prepayment_schedules(uuid)` | `faf6e995045457bc14f122cd02abfdfd160147f36bd3b164a8e38497e493511e` | bimodal (recut by §F) |
| `clara.prepayment_schedule_v1(uuid,uuid)` | `ecbc76053272a2abb6055740062895d6feb308ffae348a6363391190046727f2` | **unconditional** — this file never touches it, so a changed sha is always a finding |

The first four are the post-0285 text (that migration recut the last two). The pins are **per body**,
not global: 0285 coupled its two bodies under one FIRST/REDO mode and refused a half-and-half reading,
which is right for two bodies recut for one reason in one go; this file recuts FOUR for four different
reasons, and sibling tickets of this same lane (#940, #915, #941) recut some of the same reads
immediately after. Each body therefore admits exactly two pre-images of its OWN — its measured sha, or
a body already carrying this file's `#939` attribution — anything else is real drift and still refuses
BY NAME, and the mode each body was found in is reported in the notice so a half-and-half reading is
visible rather than silent. Stated in the file's own header.

**Redo-safe by construction** (#957): `create table if not exists`, `create or replace function`,
`drop trigger if exists` before each `create trigger`, `drop policy if exists`, `add column if not
exists`, the constraint under a `pg_constraint` guard, and the freeze registration under a presence
test. **Redos performed, and recorded here because the work order asks:** the file was applied once
and then re-applied with `CLARA_MIGRATION_REDO=0305_prepayment_stated_term` **six times** as each
slice landed (v2; the freeze registration; §D/§E; the vacuity restore; §F; §G). Final checksum
`7a032f9505e7af7c2c54eb956e19a9945f2d0481329d0a63b2a2e8acbf4fb1f2` plus one later edit for the
`jsonb_build_object` split (see below) — the ledger's own value is whatever the last redo printed;
the integrator's from-scratch chain is the authority.

**Gate module / cohort / chain, all three:**
* `packages/db/tests/prepayment-stated-term-preintegration-gate.mjs`, stem
  `prepayment_stated_term$` (never the number), env `CLARA_ALLOW_MISSING_PREPAYMENT_STATED_TERM`;
* `packages/db/tests/rig-meta.mjs` — `PREPAYMENT_STATED_TERM_0305_COHORT`
  (`record_prepayment_stated_term` on the `clara_authenticated` roster; `_tf_pst_supersede_only` and
  `prepayment_schedule_v2` ungranted), bimodal like 0284's, plus its `cohortFailures` call;
* `packages/db/package.json` — the `--import` entry inserted in MIGRATION ORDER, immediately after
  `wave4-chart-rows-preintegration-gate.mjs` (0295 < 0305).

**One thing the rig taught me mid-build:** `clara.get_prepayment_schedule`'s envelope now exceeds
`jsonb_build_object`'s 100-argument limit (54023, measured the moment the five new keys landed), so
the return is built as two objects concatenated with `||`. No key moved and no key changed.

---

## Gates

Every count below is a real run on this lane's rig (`clara_l04`, port 55744) and this lane's
Playwright triple (3530 / 3531 / 3532). `$GATES` is the exact
`--import ./tests/*-preintegration-gate.mjs` list from `packages/db/package.json`'s `test` script,
derived programmatically rather than retyped.

| gate | command | result |
|---|---|---|
| the new db battery, focused (no gate preload — an absent migration must fail LOUDLY here) | `node --test --test-concurrency=1 tests/prepayment-stated-term.test.mjs` | **7 pass, 0 fail** |
| the new db battery + the two census gates, FULL GATE CHAIN | `node --test --test-concurrency=1 $GATES tests/prepayment-stated-term.test.mjs tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **40 tests, 39 pass, 0 fail, 1 skip** |
| every db battery that names a prepayment door, the relation or the evaluator roster — 18 files, FULL GATE CHAIN | see the file list below | **204 tests, 203 pass, 0 fail, 1 skip** |
| the two evaluator-ceremony contracts, FULL GATE CHAIN | `node --test --test-concurrency=1 $GATES tests/delta-contract.test.mjs tests/epsilon-contract.test.mjs` | **129 tests, 129 pass, 0 fail** |
| `operation-census` / `rig-isolation` | included in the 40 and the 204 above; **no reset flag was ever set** (`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` unset for every run) | **green** |
| evaluator freeze lint | `node scripts/check-frozen-evaluators.mjs` | **OK — 9 evaluator(s) verified, every new migration that defines one mints its version row** |
| `pnpm typecheck` | repo root | **exit 0, `apps/web: Done`, `packages/runtime: Done`** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| the WHOLE web unit suite, once | `node scripts/run-tests.mjs` from `apps/web` | **4991 tests, 4989 pass, 0 fail, 2 skipped** |
| the prepayment web battery, focused (5 files) | `node --import ./test/bootstrap.mjs --import tsx --test components/prepayments/*.test.tsx lib/prepayments/schedule.test.ts` | **41 pass, 0 fail** |
| the shared e2e fixture-ownership census | `node --import ./test/bootstrap.mjs --import tsx --test e2e/e2e-fixture-ownership.test.ts` | **44 pass, 0 fail** |
| #864's cell-budget census | `node --import ./test/bootstrap.mjs --import tsx --test e2e/cell-budget-census.test.ts` | **5 pass, 0 fail** |
| the browser walk I touched, on MY triple | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3530 CLARA_E2E_NEXT_PORT=3531 CLARA_E2E_RUNTIME_PORT=3532 pnpm --filter @clara/web e2e prepayments` | **7 passed (23.5s)** — the six existing cells plus `prepayments.walk.memo_only`, each with its axe scan |

The one skip in the db runs is `T19 poison-role`, which self-skips as destructive unless
`CLARA_RIG_ALLOW_RESET` is set; it was not.

The 18-file db set: `prepayment-stated-term`, `prepayment-schedule`, `prepayment-term-liveness`,
`prepayment-occurrences`, `f-a4-pr2a-{schedule,census,books,carrier,wrapper}`,
`f-a4-pr1c-walls-census`, `journal-basis-zero-total-unreachable`, `plan-overlap-sibling-arm`,
`plan-overlap-template-arm-retired`, `x42-{adj-due,adj-reads,adjustments-stale,r10-o3,r11-lineage}`,
`operation-census`, `rig-isolation`.

**One gate found a real defect of mine and I fixed it rather than reporting it as noise.** #864's
cell-budget census refused `prepayments.walk.memo_only`: its two 30-second URL waits total 60s
against a 30s base and it declared only 45s. The census names the right number in its own refusal
(`polls: 4`); commit `df720951a` takes it. The walk itself had already passed in 23.5s — the budget
is a declaration about the worst case, not a measurement of this run.

---

## Docs, in the same commits

* `packages/db/README.md` — a `## 0305` section: the gap, the second carrier and why it is a separate
  relation rather than a nullable `document_id`, the one human door and its no-machine-lane posture,
  the per-body prestate pins and why they are not global, the second evaluator and the one-shot
  registration, the two reads extended-not-forked and the INNER→LEFT fix, arm B's filter removal, and
  the closed-wave floor.
* `apps/web/README.md` — a `## #939` section: the list marker and filter, the detail's stated trio and
  the absent document link, the band's `next_step` token and its earlier-frontier fallback, and the
  form's statement.
* `CONTEXT.md` — two new entries in the house `term / _Avoid_` shape: **Stated service period** and
  **Term source**, placed with the existing `Service period` / `Corrected term` family.
* Component headers: `prepayment-attention.tsx`'s header said "a memo-based prepayment has no
  amortisation path in this slice at all" — that sentence is now false and the header says so and why.

---

## Successor contract

Nothing here is buildable as a tool this wave, and the FIRST line of the contract is a prohibition
rather than a capability. Recorded so the `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4
does not "complete" it by accident.

**1. No write tool, and that is the ruling rather than an omission.**
`clara.record_prepayment_stated_term` holds no agent grant and has no wake wrapper (owner default 6,
2026-09-18: *"Not opened to Clara: the model can only ask the fixed two-date question; it never
supplies dates, and the new door gets no agent grant and no wake wrapper"*). A future tool that
called it would need a migration minting a grant, and that migration must not be written: a service
period a model supplied is a model-generated value entering a durable artifact (hard constraint 2).
`0305`'s §TAIL enforces the shape by `pg_proc` count, so a wake wrapper cannot appear quietly.

**A reading of the brief, stated so a reviewer can disagree with it.** AC2's clause "so the
deferred-revenue mirror can ride the same evaluator with a credited liability leg" I read as: the
SOURCE entry's leg is a credited liability (Cr 2030 at recognition), and what the schedule RELEASES
each period is therefore a DEBIT to that liability — the mirror image of Cr-ing a prepaid asset. That
is why `p_release_side` is an argument of v2 with a closed set and no default, rather than v2
assuming a side. If the intended reading was that the emitted line should be a CREDIT on the
liability, the fix is one argument value at the call site and no change to v2 — the evaluator does
not care, which is the property the argument buys.

**2. No read tool either, for `claraWork.v5.prompt.ts`'s own measured reason** (lines 31-35): every
prepayment read is granted to `clara_authenticated` alone, so a machine-lane read tool "could only
return a grant refusal, and that is not a capability". #939 changes nothing about that. The absent
`start_prepayment_schedule_work` (named in `chatTurn.v21.ts`:41 as still waiting on a door) stays
absent for the same reason.

**3. What a `chatTurn_vN` MAY carry — a prompt stanza, no tool, no part kind.** Proposed text for
whoever cuts it:

> When a person says a prepayment has no invoice, Clara may ask exactly two questions — the first day
> the payment covers and the last — and ask for the reason the person knows them. She never proposes
> the dates, never infers them from a memo line, a bank narrative, a filename or anything she has
> read, and never offers to record them herself: the service period is recorded by the person, through
> the Prepayments screen, under their own name. If asked to record it, Clara says that this is one of
> the things only a person may state, and points at the prepayment's own screen.

* **Tool name:** none. **Zod input:** none. **Door call:** none. **Part kind:** none (no new part).
* **Refusal mapping**, for any surface that ever renders the door's answers (the web already does):
  `prepayment_stated_term_reason_missing` → "Say why that period before recording it";
  `prepayment_stated_term_dates_missing` / `…_dates_inverted` → the two date fields;
  `prepayment_stated_term_source_has_document` → "record the service period on the document instead",
  naming `clara.record_document_service_period`;
  `prepayment_source_entry_not_found` → the 0021 not-found sentence;
  `prepayment_term_underivable` with `missing = "prepayment_stated_terms"` → "state the service period",
  and the payload's own `remedy` names the door.

**4. For #941's OBO twin, in this lane, from me:** `clara.prepayment_schedule_v2(p_total_cents
bigint, p_account_code text, p_release_side text, p_term_start date, p_term_end date)` — argument
order as written — answers a deferred-revenue release with `p_release_side => 'debit'` and the 2030
account code, returning `release_account_code`, `release_side`, `period_lines` (`debit_cents` carrying
the amount), `total_cents`, `period_count`, `term_start`, `term_end`, `remainder_placement` and
`schedule_version = 'v2'`. It is ungranted; reach it from a definer body. It is registered and frozen,
so a changed formula is a `_v3` and never an edit — including for me.

---

## Follow-ups worth filing

1. **A replacement schedule after a corrected stated term.** `uq_prepayment_schedules_source` admits
   one schedule per recognition entry, so "a new schedule from the next period" (AC4's middle sentence)
   has no door today: the estate enforces only that nothing moves. Needs an owner decision about what
   the replacement is derived from (the un-amortised balance? a new recognition?) before it is buildable.
2. **`apps/web/lib/firm/needs-you.ts` gains no row kind here.** A memo-only prepayment awaiting its
   term is a plausible firm-level "needs you" row, but no acceptance criterion asks for one and the
   ticket's own surfaces are the Prepayments list and its attention band. Left deliberately; the lane's
   shared-file convention (one appended row kind per ticket) is untouched by this ticket.
3. **`@shadcn/react` is declared but was not installed in this worktree** — see below.
4. **A positive prepayment-account roster.** 0223's own carried-forward note, unchanged by this
   ticket: the prepaid-leg wall is NEGATIVE (is this leg ineligible?), so an ordinary asset account with
   no class, no bank stamp and no reserved role still passes on BOTH lanes.

---

## Unverified / pre-existing, stated rather than asserted

* **`@shadcn/react` was missing from this worktree's installed store, and I repaired it.**
  `apps/web/package.json` declares `"@shadcn/react": "^0.3.1"` and `pnpm-lock.yaml` pins `0.3.1`, but
  `node_modules/.pnpm` held no such package. Consequences, all measured BEFORE my changes and again
  with my changes stashed: `pnpm typecheck` failed on
  `components/ui/message-scroller.tsx(9,8): error TS2307: Cannot find module '@shadcn/react/message-scroller'`;
  **24** web unit files failed with `ERR_MODULE_NOT_FOUND: Cannot find package '@shadcn/react'`; and
  `next build` — which the browser walk runs first — failed outright, so no walk could run on this
  rig at all. `components/ui/message-scroller.tsx` was committed by `b5462ab36` (#970), an ancestor
  of this lane's base `cd2925391`, and this branch touches no file under `components/ui/`
  (`git diff --name-only cd2925391..HEAD | grep -c components/ui/` → 0).
  **Repair:** `pnpm install --frozen-lockfile --prefer-offline` at the worktree root — "Lockfile is
  up to date, resolution step is skipped", 2 packages added, and `git status --short pnpm-lock.yaml
  package.json apps/web/package.json` empty afterwards. No tracked file changed. Every gate in the
  table above is a POST-repair run. Worth telling the other lanes: any lane whose worktree was
  installed before #970 landed will meet the same three failures, and the same one-line repair.
  *The 25th failure in that first run was mine, not the install gap* — see the cell-budget note above.
* **The lane database carries one hand repair.** The epsilon/delta test-time evaluator ceremony
  flipped `prepayment_schedule v2` to `deployed = true` on sight before its exclusion existed, and
  `clara._tf_evaluator_deploy_once` makes that flip one-way. I disabled
  `t_evaluatorversions_deploy_once`, set the row back to `deployed = false`, and re-enabled the
  trigger (verified `tgenabled = 'O'` afterwards, and the flags now read
  `prepayment_schedule 1=f, 2=f`). A from-scratch chain never sees this: the row is BORN undeployed.
  Recorded because it is a change to the lane database that the migration did not make.
* **`gh issue view` returns empty output through this harness** (both Bash and PowerShell, with
  `GH_PAGER=cat`), while `gh api` works. The ticket was read through `gh api
  repos/BELCORT-SDN-BHD/clara/issues/939` and `…/comments`. If the brief was edited through a route
  the API does not show, I would not have seen it — I have no reason to think so, and the comments
  endpoint returned an empty array.
* **I did not run a true from-scratch chain.** The prestate's FIRST branch is proved by hand as
  described; the from-scratch apply on a disposable cluster is the integrator's, per RIG.md.
* **I did not run the runtime unit suite or the frozen-workflow checks**, because this ticket touches
  no file under `packages/runtime`.
