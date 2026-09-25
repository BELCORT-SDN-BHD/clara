# Cut phase · lane C1 · ticket #1135 — apply the successor-contract roster of waves 2 to 4

Branch `riders/wC-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, base `6da02a8de`.
Database `clara_l01` on `127.0.0.1:55741`, 311 files / `0321_work_source_correction_rederivation`
(the lane's three tickets before this one applied `0320` and `0321`; `0319` went unused, as §1.2 A4
predicted).

**Status: DONE.** Every class-A and class-D entry of CUT-PLAN §1.2 and §1.5 is applied, in the
§1.10 conflict order, each with its own cell. No migration: this ticket needed none and took none.

## Commits (`git log --oneline 4d880d301..HEAD`)

| commit | what |
|---|---|
| `184cbef5b` | A1 + A2 — the TIN resolves a party, and a look-alike is a question |
| `e95801f08` | A3 — `refresh_opening_source`, and the pair #985 owed a re-measurement |
| `d0c181991` | A5 — one claim off several advances, and never a split nobody confirmed |
| `0360f24e0` | A6 + A7 — a figure for each period, and two ways for an accrual to run |
| `6936f9eef` | A8 + A9 (chat halves) — configure an amortisation and a recognition, never the term |
| `2adf436b2` | A11 — read a payroll summary back, and an unprinted figure is not zero |
| `2ad2efcaa` | A8.2 + A9.2 + A10 + D1 — the Work lane's two reads, its term park, the proposal |
| `120612538` | the three literal censuses this cut moves |
| `a4c28f194` | the chat walk and the Work walk, green on a real World |
| `626568ea9` | docs — the README's cut section and CONTEXT's vocabulary |

## The seams I tested at (written before the first test, WORK-ORDER rule 4)

1. **The successor carrier module's exported surface** — a zod schema's shape and `.describe()`, a
   refusal map's keys and values, a payload builder's output object, a local refusal's
   `(reason, code, field, details)`. Pure, driveable without a database, and the place a contract
   is either transcribed correctly or not.
2. **`buildToolsV22(ctx, model, segment)`'s own map** — the roster as a set of names, and each
   tool's `inputSchema` by identity. It is what a model actually meets.
3. **`buildClaraWorkToolsV6(ctx, ledger, budgets)`'s map, and the three declarations the bundle
   digest hashes** (`CLARA_WORK_TOOL_NAMES_V6` / `_SCHEMAS_V6` / `_DEPENDENCIES_V6`).
4. **The composed prompt** — `SYSTEM_PROMPT_V22` and `CLARA_WORK_INSTRUCTIONS_V6` as strings, and
   each exported stanza on its own.
5. **The source text of the frozen bodies**, for the four claims a pure function cannot make: which
   door is called, in which order, with which binding order, and which door is NOT called.
6. **The HTTP boundary and a real World** (`tests/chat-turn-v22-e2e.mjs`): a chat session, a turn,
   the reconciler's `accounting_work` arm, the claraWork_v6 run, and the durable rows.

## Acceptance criteria, each with its evidence

### AC1 — every class-A and class-D entry applied in the §1.10 order, each with its cell; the trade-invoice refusal map ends at twenty-one tokens

| entry | shipped as | cell |
|---|---|---|
| A1 #982 | `lib/trade-invoice-basis.v2.ts` — `tradeInvoicePartySchemaV2.tin`'s sentence, `party_identifier_conflict` | `v22.trade-invoice: only the TIN's describe moves…`, `…the refusal map is v1's EIGHTEEN plus exactly three…` |
| A2 #1007 | the probe / question / acknowledgement in `runStartTradeInvoiceWorkV22` | `…a match ASKS; it never refuses and it writes nothing`, `…the tool calls the probe, then the ack, then the admission` |
| A3 #986 | `refresh_opening_source` in `chatTurn.v22.tools.ts` | `tests/chat-turn-v22-opening-refresh.test.mjs`, 10 cells |
| A4 #985 | landed by #985 (this lane's first ticket) | `tests/chat-turn-v22-tools.test.mjs` |
| A5 #931 | `lib/staff-expense-claim-basis.v2.ts` + the replaced tool | `tests/chat-turn-v22-claim-allocations.test.mjs`, 16 cells |
| A6 #937 + A7 #942 | `lib/accrual-basis.v2.ts`, ONE carrier, both deltas | `tests/chat-turn-v22-accrual.test.mjs`, 22 cells |
| A8 #915 | `start_prepayment_schedule_work`, `read_prepayment_source`, `answer_prepayment_term` | `tests/chat-turn-v22-schedules.test.mjs`, `tests/clara-work-v6-roster.test.mjs` |
| A9 #941 | `lib/revenue-recognition-basis.ts`, `start_revenue_recognition_work`, `read_revenue_recognition_source` | same two files |
| A10 #933 | `loadFaProposalInputsStepV6` + `particularsQuestionV6`, wired in `claraWork.v6.ts` | `v6.proposal:` ×4 |
| A11 #945 | `lib/payroll-fact-state.ts` + `read_payroll_fact_state` | `tests/chat-turn-v22-payroll.test.mjs`, 10 cells |
| D1 #939 | the prompt stanza, and `answer_prepayment_term`'s having no date field | `v22.schedules: the stanzas say she configures…`, `v6.term: the tool has NO date field…` |
| D2 #940 | the prompt stanza, and the not-enrolled refusal naming the panel | `v22.prepayment: the three tokens #915 named…`, `v22.revenue: the enrolment refusal names the account and the panel…` |

**TWENTY-ONE, measured rather than counted from a comment.** `v22.trade-invoice: the refusal map is
v1's EIGHTEEN plus exactly three, byte for byte` asserts `Object.keys(v1).length === 18`,
`Object.keys(v2).length === 21`, the three added keys by name, and every inherited sentence value
against the frozen map's own. `party_ambiguous` is asserted byte-identical and
`party_identifier_conflict` is a separate token, so the collapse §1.10 warns about cannot happen
quietly. A second cell reads the three new sentences out of `apps/web/messages/en.json` rather than
re-typing them.

**The §1.10 order is the order the commits landed in**, and two of the four conflicts have a cell of
their own: the trade-invoice token count (above), and the accrual pair (`v22.accrual: p_accrual
carries the side, and an expense accrual is what it always was` holds v2's output against v1's key
by key, so #942's key cannot silently move what #937's did not).

### AC2 — `registry-view.test.mjs` green; the manifest change; the boot pins; the previous bodies stay carried

* `node --test tests/registry-view.test.mjs` — **green** (part of the 119-cell version-gate run
  below). The pins were repointed by #985 and #1030; this ticket did not move them.
* **The boot pins, measured on a running engine** rather than read off a file. From the walk's own
  child: `[clara-runtime] serving … pins closeExample=closeExampleV1 chatTurn=chatTurn_v22
  claraWork=claraWork_v6 … statementFacts=statementFacts_v3 …`, and the walk asserts both
  substrings (`the engine serves THIS cut's chat body` / `…and THIS cut's Work body`).
* **`bodies=59`** on the same line, and `check-workflow-bundle` reports `59 superseded body(ies)
  still ship for parked runs` — policy (c), enforced rather than promised. `version-cutover-e2e`
  stages a parked run on the retained `chatTurn_v7` fixture, cuts over to `chatTurn_v22`, and the
  parked run resumes ON ITS ORIGINAL BODY: **ALL PASS**.
* **The manifest change**: `node scripts/check-frozen-workflows.mjs --update` (local only), then
  `--compare-base 6da02a8de` → `322 existing entr(ies) retain the same hash and deployed flag;
  20 addition(s); 3 recorded retirement(s)`. Additions-only, 0 changed, 0 removed. The twenty are
  the twelve `chatTurn.v22.*` / `claraWork.v6.*` files (including `claraWork.v6.schemas.ts`, new
  here) and eight `lib/` modules.

**ONE CLAUSE OF AC2 I DID NOT SATISFY, DELIBERATELY, AND THE ORCHESTRATOR SHOULD RULE ON IT.** The
ticket says "`check-frozen-workflows --lock-deployed` produces the manifest change", and my prompt's
rule (g) repeats it. I did **not** run `--lock-deployed`, because the plan of record and the
module README both forbid it here:

> **`--lock-deployed` is NOT a cut gate.** `packages/runtime/README.md:1037-1039`: run it "and commit
> the manifest **after** the image is live, locking before deploy would freeze a body that no parked
> run can yet exist for." It belongs to the hosted release ceremony (runbook step 11a) …
> — `CUT-PLAN.md` §2.4

Locking now would also globally lock the ten `payrollFacts.v1.*` / `agreementFacts.v1.*` entries and
this cut's twenty, none of which any image serves yet. The manifest change AC2 asks for IS produced
and committed — by `--update`, which is the cut's own command — and the lock is the release's.
Recorded here rather than decided unilaterally.

### AC3 — one chat walk and one Work walk per successor body; the version-cutover e2e; the whole runtime suite

* **`tests/chat-turn-v22-e2e.mjs` + `tests/chat-turn-v22-serve.mjs`** — NEW, a separate file per
  version for the reason each predecessor gives. **ALL PASS (130 243 ms)** on the final built bytes.
  Four legs:
  1. Turn one records a supplier bill and leaves **zero** acknowledgement rows and **zero** claims —
     the control, without which "one acknowledgement row" could have been true before anything was
     asked.
  2. Turn two sends the same particulars. The model SEES `status: "duplicates_found"`
     (`match_count: 1`, reference `ALPHA-2026-0042`, question *"…Record this one anyway, or
     stop?"*), and only after `record_anyway` does a second Work exist, with **exactly one**
     `clara.trade_invoice_duplicate_acks` row whose `shown[].invoice_id` is turn one's own invoice.
     The expected id is read from the database, never supplied by the script — v21's ADV-S-1 trap
     designed out rather than discovered.
  3. Both Works run on `clara-work/v6` and their committed receipts record its digest, read from
     the registry's own pin (`pinnedClaraWorkBundleId()`) rather than a version literal.
  4. Turn three's unconfirmed split is refused LOCALLY with `constraint: "confirmation"` and the
     exact two-line list; the confirmed split then posts ONE entry and leaves TWO
     `clara.staff_advance_applications` rows.
* **`tests/version-cutover-e2e.mjs`** — **ALL PASS**, twice (before and after the final build). It
  needs no edit for v22: it derives the newest export from `registry.ts`.
* **The whole runtime suite, once, at the end**: `pnpm --filter @clara/runtime test` →
  **3129 tests, 3089 pass, 2 fail, 38 skipped.** Both failures are the documented Windows-only reds
  and are reported as such, never "fixed":
  * `scanner rejects EICAR, encrypted PDF, and XML entity expansion` (#693, Defender eats the EICAR
    fixture);
  * `(#806) this host's OWN probe: pg_dump/psql are on PATH here` (no `pg_dump` on this PATH).
  The suite is what caught three of this ticket's own misses (AC5 below).

**THE THREE LEGS §4.5 NAMES THAT I DID NOT BUILD, and why, stated rather than left to be
discovered:**
* #937/#942's two accrual legs on `tests/accrual-e2e.mjs` (a two-period `stated_period_amount`
  accrual whose entries carry the two stated amounts, and a revenue accrual posting Dr asset / Cr
  income). The tool half is cut and cell-covered; the World legs need `accrual-e2e.mjs`'s own
  fixture widened and are **owed**.
* #915's real World leg driving `start_prepayment_schedule_work` end to end. It needs a posted entry
  debiting an enrolled prepaid account plus a recorded service period — a fixture no existing
  spawner builds — and is **owed**.
* A Work walk that parks on **A10's proposal block**. The walk above exercises claraWork_v6 end to
  end but through the journal path, not the fixed-asset particulars path;
  `tests/fixed-asset-acquisition-e2e.mjs` is where that leg belongs and it is **owed**.
Three follow-ups are filed below.

### AC4 — the web parts census and the browser suite

**NO WIRE KIND IS ADDED BY THIS CUT, and that is a measurement rather than a decision.**
`check-parts-parity.mjs`'s discriminant is the `type` property (`check-parts-parity.mjs:268/340/357`,
`part-shapes.mjs:44/65`). #915's `prepaymentSchedulePart` and #941's `revenueRecognitionPart` build
payloads whose discriminant is **`kind`**, so they ride INSIDE the tool result as data and never
become a `ClaraPart`. A cell asserts it on both (`part.type === undefined`).

Consequently §2.6's seven-step census is a no-op, and the gate's own output says so: the emittable
set is unchanged at `{freeform_result, work_accepted, work_status, work_result, work_question,
knowledge_receipt}`.

* `node packages/runtime/scripts/check-parts-parity.mjs` — **OK**.
* `node --test tests/p6-1-parts-parity.test.mjs` — **22/22**, after extending its literal
  construction-site census by the three `chatTurn.v22.tools.ts` sites the three REPLACED tools add
  (all `work_accepted`, all `journal_entry`; `WORK_ACCEPTED_PURPOSES` stays at three for the fourth
  cut running).
* **`apps/web` is untouched by this ticket** (`git diff --name-only 4d880d301..HEAD | grep ^apps/`
  → empty). The whole unit suite was still run once, as §4.6 asks: `node scripts/run-tests.mjs`
  from `apps/web` → **5173 tests, 5171 pass, 0 fail, 2 skipped.** No browser walk was touched, so
  none was run.

### AC5 — the lane report carries the roster as shipped, and names every deferred entry with its follow-up

This document, plus the "Successor roster, as shipped" table below. Class C's seven entries are
DEFERRED to #1136 and #1137 by ruling and are **not** in `buildToolsV22` — asserted by name in
`chat-turn-v22-tools.test.mjs`'s `the contracts this cut DEFERRED are absent BY NAME` cell. Class E
(#960) is excluded by ruling and is likewise absent.

## Successor roster, as shipped

| # | entry | source | shipped | door(s) |
|---|---|---|---|---|
| A1 | #982 | `wave3-lane02-ticket982.md` §Successor contract + `wave3-lane02-fix.md` items 1,2,4 | `tradeInvoicePartySchemaV2`, `TRADE_INVOICE_REFUSALS_V2` (21) | `admit_trade_invoice_work`, unchanged order |
| A2 | #1007 | `wave3-lane02-ticket1007.md` §the chat half, as amended | probe → question → ack → admission | `probe_trade_invoice_duplicates_for`, `record_trade_invoice_duplicate_ack` |
| A3 | #986 | `wave3-lane06-ticket986.md` §Successor contract | `refresh_opening_source` | `refreshOpeningTargets(client,{seedId,firmId,reassert})` |
| A4 | #985 | landed by #985 | `read_opening_source` | `parseOpeningTargets(...)` |
| A5 | #931 | `wave4-lane02-ticket931.md` §Successor contract | `claimAllocationInputSchema`, `claimFromInputV2`, 3 local refusals, `proposeAllocationsByDate` | `admit_staff_expense_claim_work`, unchanged |
| A6 | #937 | `wave4-lane03-ticket937.md` §AC4 | `ACCRUAL_METHODS_V2`, `period_amounts`, 8 tokens | `create_accrual_adjustment_for`, arity unchanged |
| A7 | #942 | `wave4-lane03-ticket942.md` §AC5 | `ACCRUAL_SIDES`, side-aware descriptions, `accrualRefusalMessageV2` | same door |
| A8 | #915 | `wave4-lane04-ticket915.md` items 1,2 | `start_prepayment_schedule_work`, `read_prepayment_source`, `answer_prepayment_term` | `create_prepayment_schedule_for`, `read_prepayment_source_for`, `open_work_question` |
| A9 | #941 | `wave4-lane04-ticket941.md` items 1,2,4 | `lib/revenue-recognition-basis.ts`, `start_revenue_recognition_work`, `read_revenue_recognition_source` | `create_revenue_recognition_schedule_for`, `read_revenue_recognition_source_for` |
| A10 | #933 | `wave4-lane05-ticket933.md` §1,4-8 + `wave4-lane05-fix.md` §2,3 CORRECTED | `loadFaProposalInputsStepV6`, `particularsQuestionV6` | `open_work_question`, argument order unchanged |
| A11 | #945 | `wave4-lane01-ticket945.md` §Successor contract | `lib/payroll-fact-state.ts`, `read_payroll_fact_state` | `get_document_extract`, `get_document_state` |
| D1 | #939 | `wave4-lane04-ticket939.md` items 1-3 | prompt stanza only; no tool, no door | — |
| D2 | #940 | `wave4-lane04-ticket940.md` item 3 | prompt stanza only; the refusal names the panel | — |

## Five contract deviations, each a measurement

1. **`clara.get_document_extract` takes THREE arguments, not two.** #945's contract writes
   `(p_document, p_max_chars)`; measured on `clara_l01`, the live signature is
   `(p_document uuid, p_client uuid, p_max_chars integer)`. The client argument is taken and is
   load-bearing: it keeps the read inside the conversation's own client rather than merely inside
   the firm.
2. **`p_author` is `ctx.createdBy`, not `ctx.actorUserId`.** #915 names a field that does not exist
   on `ToolCtx` (`{firmId, clientId, createdBy, taskId}`, `chatTurn.v13.infra.ts:59`).
   `ctx.createdBy` IS "the same value the other OBO tools pass" — v21's trade-invoice door passes it
   as `p_author` — so the contract's intent is met under the name the type actually has.
3. **The parked ENROLMENT question of #915 item 3 and #941 item 3 is not constructible from the
   chat lane.** `clara.open_work_question` needs a `running` task and a hook token a Work run mints
   (0184:1643); the schedule doors are reached from the chat lane, where no Work exists at the
   moment the refusal arrives. The chat half does what it can honestly do — names the account, names
   the panel, stops — and the parked question is a follow-up rather than an approximation. This is
   the same shape as #1030's own "admitting a successor parked on a question is not constructible".
4. **`proposeAllocationsByDate`'s CANDIDATE READ is unreachable from this lane.** The pure proposer
   is shipped and cell-covered, but `clara.staff_advance_summary(p_client, p_as_of)` is granted to
   `clara_authenticated` ALONE (measured: `clara_fn_owner=X | clara_authenticated=X`). So the tool
   cannot fetch candidates to propose FROM. What it can do it does: a split of two or more lines is
   refused until confirmed, and the refusal carries the model's own list back for reading out. A
   follow-up is filed.
5. **`create_revenue_recognition_schedule_for` has a NINTH argument**, `p_pattern text default
   'straight_line'`. #941 says `p_pattern` is not sent; measured, it has a default, so the
   named-argument call omits it and a cell asserts the source contains no `p_pattern`.

## The lib modules that joined a frozen closure (§2.7 / rule (f))

`--print-closure` was run implicitly by `--update`; the resulting additions are the evidence.

| module | decision | why |
|---|---|---|
| `lib/trade-invoice-basis.ts` | **succeeded** by `.v2.ts` | already frozen under v21; its own header rules that a later change ships as a new module beside it |
| `lib/staff-expense-claim-basis.ts` | **succeeded** by `.v2.ts` | already frozen under v20 |
| `lib/accrual-basis.ts` | **succeeded** by `accrual-basis.v2.ts` | already frozen under v20; #937 and #942 land in ONE successor, as `wave4-lane03-fix.md` requires |
| `lib/prepayment-schedule-basis.ts` | **frozen in place** | MEASURED: `grep -rn prepayment-schedule-basis` finds its own unit cell and two comments, and no first-party importer. A versioned copy would have put a second prepayment refusal vocabulary in the estate for no caller's benefit |
| `lib/fa-particulars-proposal.ts` | **frozen in place** | same measurement (its only importers are its own unit cell and the db battery's comments); #933's report says the module is written to be final |
| `lib/revenue-recognition-basis.ts` | **new**, frozen on arrival | #941 follow-up 3 asks for a twin beside the prepayment module rather than a widening |
| `lib/payroll-fact-state.ts` | **new**, frozen on arrival | the parse and the refusal map, extracted so they can be driven without a database |

**`lib/opening-parse.mjs` was frozen in place by #985, not by this ticket.** Rule (f) asks me to
prefer a versioned copy over freezing a live shared core with four importers; that decision was
already taken and shipped before I started, with its reasoning in `packages/runtime/README.md`
("a versioned COPY … was refused: it would put a second derivation of a client's opening figures in
the estate"). A3 needed `refreshOpeningTargets` from the same already-frozen module, so it added no
new exposure. Recorded, not re-opened.

The three SUCCEEDED modules re-export every unchanged symbol from their frozen predecessor **by
reference**, so there is one claimant rule, one refusal sentence and one journal derivation on this
estate rather than two that can drift. Cells assert the identity (`assert.equal(v2.X, v1.X)`).

## Gates, with counts

| gate | result |
|---|---|
| `tests/chat-turn-v22-trade-invoice.test.mjs` (new) | 11/11 |
| `tests/chat-turn-v22-opening-refresh.test.mjs` (new) | 10/10 |
| `tests/chat-turn-v22-claim-allocations.test.mjs` (new) | 16/16 |
| `tests/chat-turn-v22-accrual.test.mjs` (new) | 22/22 |
| `tests/chat-turn-v22-schedules.test.mjs` (new) | 13/13 |
| `tests/chat-turn-v22-payroll.test.mjs` (new) | 10/10 |
| `tests/clara-work-v6-roster.test.mjs` (new) | 15/15 |
| `tests/chat-turn-v22-tools.test.mjs` (touched) | 18/18 |
| `tests/chat-turn-v22-financial-pack.test.mjs` (touched) | 12/12 |
| `tests/chat-turn-v20-tools.test.mjs` (touched) | 16/16 |
| `tests/clara-work-v6.test.mjs` (touched) | 8/8 |
| `tests/p6-1-parts-parity.test.mjs` (touched) | 22/22 |
| `tests/prepayment-schedule-basis-unit.test.mjs` (touched) | 11/11 |
| `tests/local-db-gate-drivers-census.test.mjs` (touched) | 8/8 |
| the seven version gates of §4.2, one run | 119 tests, 97 pass, 0 fail, 22 skipped |
| **the WHOLE runtime suite** | **3129 tests, 3089 pass, 2 fail, 38 skipped** (both failures the documented Windows reds) |
| `pnpm typecheck` | Done (web + runtime) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 (it caught one unused import, fixed in `626568ea9`) |
| `pnpm --filter @clara/runtime build` | OK |
| `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites |
| `node scripts/check-workflow-bundle.mjs` | OK — 14 pinned classes, 59 superseded bodies still shipped, chatTurn pinned at v22 (46 checks) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — emittable set unchanged (six kinds) |
| `node scripts/check-frozen-workflows.mjs` | OK — 342 frozen files, 59 `"use workflow"` modules, 3 retired |
| `… --compare-base 6da02a8de` | OK — 322 unchanged, **20 additions, 0 rehashed, 0 removed** |
| `… .selftest.mjs` / `… .registration.selftest.mjs` | OK / OK |
| `tests/version-cutover-e2e.mjs` | ALL PASS |
| `tests/chat-turn-v22-e2e.mjs` | ALL PASS (130 243 ms) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | 5173 tests, 5171 pass, 0 fail, 2 skipped |

**No db gate chain was owed**: this ticket adds no migration, no SQL function and touches no file
under `packages/db/tests`, so `operation-census` and `rig-isolation` have nothing of mine to
measure and were not run.

### The rig work the walks needed, recorded

`tests/chat-turn-v22-e2e.mjs`'s own gate admits only `clara_rt_test` / `clara_wave_b_ci`, and
RIG.md forbids bootstrapping a World on a lane database (#866 reds `rig-isolation` T10b). So:
`create database clara_rt_test template clara_l01` on the lane's own cluster (a template copy, never
a second from-scratch chain — 0154 pins a cluster-wide role count), `pnpm --filter @clara/runtime
exec bootstrap` for the WDK schemas, and then **one rig action worth naming**: the clone inherits
`clara_l01`'s db batteries' leftovers — 1 556 queued/running `clara.accounting_work` rows and 2 984
`clara.agent_tasks` — which a fresh engine's reconciler dispatches, starving the queue this leg is
waiting on and racing it (v21's own trap 2). I cancelled them on the CLONE with
`session_replication_role = replica`, which is a disposable-database action and belongs nowhere
near `clara_l01`. **CI needs none of this**: `clara_wave_b_ci` is pristine at the point the action
creates it. The clone was dropped afterwards; `clara_l01` is the only database on the cluster and
the worktree is clean.

## Docs, in the same commits

* `packages/runtime/README.md` — the cut-phase section retitled ("the two pins … moved", not "so
  far"), two new bullets carrying the roster tool by tool with the three REPLACEMENTS named, the
  deploy-order paragraph ("NOTHING NEW": no migration, and the coupled ones are still 0320 and
  0321), the modules ledger extended with a decision-per-module table, and the #656 section's last
  open sentence closed now that the refresh tool exists.
* `CONTEXT.md` — five terms in the house "term / _Avoid_" shape: **look-alike document**,
  **advance allocation**, **accrual side**, **stated period amount**, **configuration receipt**.
* `.github/actions/db-live-gates/action.yml` — the v22 walk wired after v21's, with what only a real
  World can show and the migrations it skips cleanly without.

## Successor contract

**None is owed by this ticket.** #1135 IS the ticket that discharges the accumulated ones. Nothing
frozen was edited: `check-frozen-workflows --compare-base` proves 0 rehashed entries, so every
byte-untouched predecessor is still byte-untouched, and every change landed in a NEW file or in one
of the twenty unlocked entries this cut phase minted.

What the NEXT cut inherits, as a contract rather than as a wish:

1. **The parked enrolment question** (#915 item 3, #941 item 3). It needs a Work run: a
   `clara.open_work_question` caller with a `running` task and a minted hook token. The shape is
   written in both reports and unchanged; what it needs is a lane that HAS a run at the moment the
   schedule door refuses `axis = prepaid_account_not_enrolled` / `deferred_account_not_enrolled`.
2. **An agent-granted candidate read for the advance split** (#931 item 6). Name:
   `clara.staff_advance_summary_for(p_client uuid, p_author uuid, p_as_of date)`, the OBO twin
   shape 0307 and 0275 already use, `clara_runtime` EXECUTE, same envelope, narrowed to
   `outstanding_cents > 0 && !voided` and to the claimant's enrolment. With it,
   `proposeAllocationsByDate` (shipped, pure, cell-covered) can be fed and the tool can PROPOSE a
   split instead of only refusing an unconfirmed one.
3. **`wave4-lane03-fix.md` follow-up 2's rename** (`expense_account_code` / `liability_account_code`
   → `pl_account_code` / `bs_account_code`) is still owed and still needs a migration: they are the
   database's own wire keys on `p_accrual`. CUT-PLAN §1.8 G2 ruled it out of this phase and this
   ticket kept the names, with side-aware descriptions instead.

## Follow-ups worth filing

1. **The three World legs §4.5 names that this ticket did not build** (accrual per-period, accrual
   revenue side, prepayment configuration end to end), and a fourth: a Work walk that parks on
   #933's proposal block through `fixed-asset-acquisition-e2e.mjs`. Every tool half is cut and
   cell-covered; what is missing is the fixture each leg needs.
2. **`clara.staff_advance_summary` has no agent twin** — successor contract 2 above. Without it the
   chat lane can judge a split but not propose one.
3. **The enrolment question needs a lane with a run** — successor contract 1 above.
4. **`docs/ARCHITECTURE.md:171, :183, :207, :445` carry pins that have been wrong since the
   2026-09-15 cut** ("chatTurn → chatTurn_v19, claraWork → claraWork_v3"). Per AGENTS.md rule 4 a
   blueprint edit belongs to a wayfinder session, so this ticket recorded the drift rather than
   editing a blueprint inside a lane. CUT-PLAN §5 R8 says the same; the orchestrator carries it.
5. **A multi-turn chat session errors with `Invalid prompt: messages must not be empty`.** Observed
   while building the walk: three turns in ONE session made `runModelSegmentStepV22` fail after 3
   retries on the second turn. I worked around it by giving each turn its own session (which is the
   better measurement anyway — the duplicate probe is client-scoped, not session-scoped), so I did
   not diagnose it. It is NOT introduced by this cut: the step is v22's copy of v21's, and no
   existing e2e drives two turns in one session. Worth a ticket, because a person does come back to
   a conversation.
6. **`clara.probe_trade_invoice_duplicates` (the non-`_for` door) still has no shipped caller**,
   which `wave3-lane02-fix.md` follow-up 1 already noted. The chat lane uses the twin; the form uses
   the twin; the original is now callerless.

## Anything unverified

* **Nothing here has been seen against hosted data or a hosted deployment.** Every measurement is on
  `clara_l01` / its clone, on this Windows host.
* **The two-build cutover drill on a fresh cluster (§4.4) is the integrator's** and was not run here,
  per rule (h). Its `claraWork` v5 → v6 and `chatTurn` v21 → v22 legs both depend on §2.2's exact
  textual shapes in `registry.ts`, which #985 and #1030 wrote and this ticket did not touch.
* **`--lock-deployed` was not run** (see AC2). The manifest therefore carries this cut's twenty
  entries as `deployed: false`, which is what the release ceremony expects to find.
* **The scripted model is a mock.** The walk proves the DOORS, the ORDER and the DURABLE ROWS; it
  does not prove that a real model reads the stanzas the way they are written. No harness can.
* **Three of the eight per-period accrual tokens are reachable only through a non-model caller.**
  `accrual_period_amount_invalid` and `accrual_side_unsupported` are refused by the SCHEMA before
  the mirror sees them for anything a model can send; their cells drive the mirror directly and say
  so in a comment. Both belts matter — the schema is what a model meets, the mirror is what the
  door agrees with — but only one of them is reachable from a conversation.
* **`accrual_period_remainder_misplaced` fires only on a set that IS an even split** (n−1 entries at
  `floor(total/n)` and one at `+remainder`). A set of genuinely different stated figures is nobody's
  arithmetic to correct, and the cell asserts both directions. That reading of #937's one-line
  description is mine; a reviewer may disagree with it.
* **A status request arrived mid-task?** No. Rule (j) was not exercised: no message reached me while
  I worked.
