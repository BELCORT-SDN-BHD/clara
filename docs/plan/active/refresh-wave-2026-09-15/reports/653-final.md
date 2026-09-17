# #653 — prepayment recognition and amortisation over an explicit service period · final report

**Branch** `impl/653-prepayment-amortisation` · **worktree** `C:\Users\zhant\Desktop\clara-wt\653` · rig
`127.0.0.1:55511/clara_653` (PG 17.11, **194** migrations on a from-scratch chain).
All evidence below is **LOCAL**. **Hosted evidence pending** — none exists for this surface.

> **FIX ROUND 1 APPLIED (2026-09-17).** Three review lenses returned two blockers, three shoulds and
> six notes against `cc2beaa5`. All five blockers/shoulds are fixed and re-measured; the counts and
> claims below are this branch's CURRENT state, and the finding-by-finding account with its red-cell
> evidence is in `653-fixround-1.md`. The rig was **dropped, re-created and re-migrated from a true
> prestate** because the migration changed.

`git log --oneline origin/main..HEAD` (12 commits)

```
6252a08d docs: #653 review round 1 — CONTEXT's Prepayment schedule term: the prepaid-leg wall and the instruction
1cebbe56 fix(web): #653 review round 1 — the instruction a schedule cites is a field, never the recognition's own id
8d151d4a fix(ci): #653 review note F1 — the prepayment e2e step's per-line continuation
5bebc528 fix(db): #653 review round 1 — the prepaid leg is judged too, arm B carries the same wall, ordered-then-cut paging, a typed raced duplicate
cc2beaa5 fix(e2e,db): #653 — the shared caching body reader for a genuinely shared RPC verb; lint
84e778da feat(web): #653 — the Playwright walk, its lane mock, and the dead lifecycle strings removed
ffc1e60d docs: #653 — the four module READMEs and CONTEXT's two new terms
c3bbaa9e feat(web): #653 — the prepayments journey: attention band, configure form, allocation, explain-and-choose
40b76fff feat(runtime): #653 — the non-frozen chat-lane module, its unit cells and the real-World occurrence e2e
40b6bd6d test(db): #653 — the belt's own cells: per-period basis, identity race, locked period, both attention arms, catch-up
88d55300 feat(db): #653 migration 0208 — the amortisation adapter, its per-period basis and its four doors
4f4caefe test(db): #653 red — the prepayment-schedule door's seams, before the door exists
```

The RED was measured first (`4f4caefe`, run 2026-09-16): every cell failed with
`#653: the prepayment-amortisation lane is absent.` — the right reason.

---

## Per acceptance criterion

| AC | Verdict | Evidence |
|---|---|---|
| **AC1** required full set + zero-value refusal | **done** | `clara.create_prepayment_schedule` (0208 §D) requires the posted recognition, the judged expense account **and its stated grounds**, the purpose and a resolved authority; the term comes from the document. Cells `p653.schedule.target_underivable`, `.target_ineligible`, `.source_unfit`, `.term_missing`, `.zero_basis` — all green. **Fix round 1:** the door also judges the PREPAID leg by the estate's own `clara._adj_line_eligibility_breach` (`p653.schedule.prepaid_leg_ineligible`), and the web form now asks for the instruction it cites instead of fabricating one from the recognition (`p653.schedule.authority_ref_unresolved` + `prepayments.authority`). |
| **AC2** exact-cent allocation, final-period residual, no invented term/authority | **done** | `p653.schedule.exact_cents` (12 × 100,000 ⇒ 8333×11 + 8337, sum exact); `p653.occ.per_period` drives the belt and the catch-up and reads each period's own amount off the admitted Work's basis. Both structural holes closed: the per-period basis (§C) and the re-derived expense half (§D). |
| **AC3** one occurrence under repetition / lost response / restart | **done** | `p653.occ.identity` (two scans behind a real `pg_stat_activity` lock barrier ⇒ one occurrence, one Work, the loser converges) and `prepayment-occurrence-e2e.mjs` PASS 1–5 on the real Postgres World (measured this session, exit 0). |
| **AC4** atomic occurrence, configuration ≠ posted | **partial-with-named-residual**, as briefed. Per-occurrence atomicity: e2e legs 2+3 (crash between commit and checkpoint ⇒ one entry, one receipt, one occurrence). Recognition + configuration in one commit is **unbuildable** (the evaluator refuses a non-`approved` source entry, `0140:1040-1044`) — said in the door's own answer (`configuration_only: true`), in `Prepayments.configurationBody` on every surface, and in the list's `posted_periods` count. Residue (a) = the door's inline refusal **and** attention arm B (`p653.attention.arm_b`); residue (b) = arm A (`p653.occ.locked_period`, `p653.attention.arm_a`, `p653.attention.egress`). |
| **AC5** park / locked-period catch-up / no historical authority | **partial-with-named-residual**, as briefed. Locked period: `p653.occ.locked_period`. No historical authority: `p653.catchup.window` (`catch_up_before_authority`). **The park is NOT claimed** — `claraWork_v4` contract only (below). |
| **AC6** register the adapter; preview / revision / pause / end retain prior runs; explanatory failures in C8 | **done** | `p653.kind.unsupported` (the widening is additive), `p653.schedule.due_dates_cover` (preview projects each period's own amount), `p653.revision.cadence_pinned` (revision refuses a cadence change, the stored lines do not move, revision 2 keeps its predecessor), `list_prepayment_attention` + the detail's explain-and-choose surface for C8. |
| **AC7** the real journey, all states, 320px/zoom/keyboard/SR/motion/URL/drafts | **done** (fix round 1 re-ran the walk on a quiet host) | `prepayments-walk.spec.ts` (6 cells) + `prepayments-render-states` (11), `-a11y` (3, hand-written rule engine, zero findings), `-keyboard` (4). Every unit cell is green. Each of the six browser cells passed in at least one of three measured walk runs, but **no single whole-file run was green** on this contended host — the counts and the diagnosis are in "Commands and counts" and "Unverified". |
| **AC8** production read/command, least-privileged roles, real World, labelled evidence | **done for local**; **hosted evidence pending.** Every db door cell runs as **bob, an ordinary bookkeeper**, through `humanQuery(sub, namedCall(...))`; `p653.census.floor` proves a viewer is refused the write and admitted the read. The World leg is `prepayment-occurrence-e2e.mjs` (**scripted model ⇒ supplementary**); the web e2e is a **mocked RPC boundary serving AC7 only**. |

## Per historical row

| Row | Verdict | Evidence |
|---|---|---|
| **C08.1** adjustment UI · reframe | **partial** | The new surface renders the schedule, its authority, its allocation and its per-period feedback. Still unrendered, as briefed: `adjustment_templates.schedule` (`0140:660`) — the 0045 register is untouched. |
| **C08.2** zero-value proposal | **verify-only + one red cell at the new door** — with a **finding** (below). `p653.schedule.zero_basis` proves the door routes through `clara._assert_journal_basis` (`detail.owner`), and that the arm which actually answers is `exactly_one_side`, not `nonzero_total`. |
| **C55.13** re-read evidence then ask a bounded question | **not claimed** — `claraWork_v4` contract only. |
| **C83.7** duplicate | closes with C55.13's amended verdict — **not done**. |
| **C88.13** synthetic + real-environment | **partial** — the synthetic is extended to amortisation (trigger, one effect, crash-retry, a third pass admitting nothing, plus an explicit catch-up leg). **Real-environment evidence is separately owed and not claimed.** |

---

## Tests added

| File | What it proves |
|---|---|
| `packages/db/tests/prepayment-schedule-fixtures.mjs` | The scene: `f-a4-pr2a`'s `prepaidScene` + the plan lane's fixtures + calendar-year FYs + the accepted Terms/DPA. |
| `packages/db/tests/prepayment-schedule.test.mjs` | **18** cells — the arithmetic, the derived cadence, the five refusal tokens, the additive kind widening, the unrevisable cadence, the grants/floor census, plus (fix round 1) the prepaid leg's own eligibility wall, the web form's exact authority payload, and the duplicate race behind a real lock barrier. |
| `packages/db/tests/prepayment-occurrences.test.mjs` | **10** cells — the per-period basis on the real belt, the missing-line refusal, the lock-barrier race, the locked period, both attention arms, the egress axis, the catch-up window, plus (fix round 1) arm B's own eligibility wall and its ordered-then-cut paging with the truncation flag. |
| `packages/db/tests/prepayment-0208-preintegration-gate.mjs` | The package-wide sweep's escape; a focused run fails loudly. |
| `packages/runtime/tests/prepayment-schedule-basis-unit.test.mjs` | 11 cells — the `.strict()` schema's deliberate absences, the mirror's shallowness, the door payload's names, the configuration-only part. |
| `packages/runtime/tests/prepayment-occurrence-e2e.mjs` | The real Postgres World: **the final period posts the residual through the frozen tool schema**, plus identity, crash-replay and catch-up. |
| `apps/web/components/prepayments/prepayments-render-states.test.tsx` | **13** cells — the state ladder, both attention arms rendered distinctly, the explain-and-choose surface, and (fix round 1) the truncated / untruncated attention band. |
| `apps/web/components/prepayments/prepayments-a11y.test.tsx` | 3 cells — zero structural findings on list, detail and form; colour is never the only cue. |
| `apps/web/components/prepayments/prepayments-keyboard.test.tsx` | **5** cells — reachability, focus-on-first-invalid with the draft kept, the disabled preview, the dialog, and (fix round 1) `prepayments.authority`: the door payload read off the REQUEST, proving the cited instruction is the one a person chose and never the recognition's own id. |
| `apps/web/lib/prepayments/schedule.test.ts` | 12 cells — token parity with 0208, the mirror's shallowness, the derived cadence as a constant, the allocation check. |
| `apps/web/e2e/prepayments-walk.spec.ts` + `prepayments-mock.mjs` | 6 browser cells — attention, the refused-then-retried configure, the detail, the lifecycle dialog, 320px/200%, reduced motion + Back. |

### Commands and counts — all LOCAL, all on `127.0.0.1:55511 / clara_653`

Env on every db command: `PGHOST=127.0.0.1 PGPORT=55511 PGUSER=postgres PGDATABASE=clara_653
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`. `CLARA_RIG_ALLOW_RESET` / `CLARA_RIG_ALLOW_ROLE_SWEEP`
were **never** set. `$GATES` = the 29 `--import ./tests/*-preintegration-gate.mjs` flags copied
verbatim out of `packages/db/package.json`'s `test` script.

| Command | Result |
|---|---|
| `packages/db$ node --test --test-concurrency=1 $GATES tests/prepayment-schedule.test.mjs` | **18 tests / 18 pass / 0 fail / 0 skip**, 9.4 s, exit 0 (fix round 1; was 15 at `cc2beaa5`) |
| `packages/db$ node --test --test-concurrency=1 $GATES tests/prepayment-occurrences.test.mjs` | **10 / 10 pass / 0 fail / 0 skip**, 10.0 s, exit 0 (fix round 1; was 8) |
| `packages/db$ node --test --test-concurrency=1 tests/operation-census.test.mjs` | **10 / 10 pass / 0 fail / 0 skip**, 160.3 s, exit 0 |
| `packages/db$ node --test --test-concurrency=1 tests/rig-isolation.test.mjs` — **BEFORE** the world bootstrap | **21 / 20 pass / 0 fail / 1 skip** (T19, destructive), 295.1 s, exit 0 |
| the same command **AFTER** `pnpm --filter @clara/runtime exec bootstrap` | **21 / 19 pass / 1 fail (T10b) / 1 skip**, 277.9 s, exit 1 — **rig state, not 0208**; see "Unverified" |
| `packages/runtime$ node --test tests/prepayment-schedule-basis-unit.test.mjs` | **11 / 11 pass / 0 fail / 0 skip**, exit 0 |
| `pnpm --filter @clara/runtime build` (nitro, once) | **exit 0** — `.output/server/index.mjs` 9.93 MB |
| `pnpm --filter @clara/runtime exec bootstrap` (WDK world, once) | **exit 0** — "Database schema created successfully!" |
| `packages/runtime$ RELAY_TEST_MODE=1 WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55511/clara_653 node tests/prepayment-occurrence-e2e.mjs` | **PASS 1 · PASS 2+3 · PASS 4 · PASS 5, exit 0.** 100,001 cents over two months ⇒ `2026-05-31=50000, 2026-06-30=50001`; after the `exit_after_commit` crash the ledger holds **ONE** entry charging **50001**; the catch-up admits the earlier period carrying **50000** |
| `apps/web$ node scripts/run-tests.mjs` (whole unit suite) | **3752 tests / 3750 pass / 0 fail / 2 skipped**, 309.7 s, exit 0 (fix round 1; was 3749/3747 at `cc2beaa5`) |
| `pnpm --filter @clara/web e2e prepayments-walk` on `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3330 CLARA_E2E_NEXT_PORT=3331 CLARA_E2E_RUNTIME_PORT=3332` — **run 1**, whole file | **3 passed / 3 failed**, 17.0 m, exit 1. Failed: `walk.attention` (:88), `walk.refusal` (:115), `walk.motion_and_back` (:256) |
| the same command — **run 2**, whole file, re-run | **2 passed / 4 failed**, 20.5 m, exit 1. Failed: `walk.attention` (:88), `walk.detail` (:151), `walk.lifecycle` (:183), `walk.motion_and_back` (:256) |
| the same harness — **run 3**, `-g "walk.attention\|walk.motion_and_back"` (the only two cells that had not yet passed) | **2 passed**, 1.8 m, **exit 0** (`walk.motion_and_back` in 11.1 s) |
| **fix round 1, run A** — whole file, after the authority control landed | **5 passed / 1 failed**, 3.9 m, exit 1 — `walk.detail` inside `signInTo` (`net::ERR_ABORTED`), never a prepayment assertion |
| **fix round 1**, that cell alone (`-g "walk.detail"`) | **1 failed**, 32.2 s, exit 1 — again inside `signInTo`; alone it is the FIRST cell and absorbs the cold start, which is follow-up 8 measured |
| **fix round 1, run B** — whole file, quiet host | **6 passed / 0 failed, 34.8 s, exit 0** — the green whole-file run this report said was still owed |
| **fix round 1** — `pnpm --filter @clara/web e2e plans-walk` (653-N2, #640's own walk after this branch touched its mock) | **9 passed / 0 failed**, 41.5 s, exit 0 |
| `pnpm typecheck` (worktree root) | **exit 0** — `packages/runtime typecheck: Done`, `apps/web typecheck: Done` |
| `pnpm lint` (worktree root) | **exit 0** — 370 manifest files listed and ordered, 3042 static `t("…")` keys all resolve, token contrast AA |
| `node scripts/check-frozen-workflows.mjs` | **OK — 281 frozen file(s) verified, 51 `"use workflow"` modules all frozen+registered**, exit 0 |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK**, exit 0 |

Rig facts measured this session, not transcribed: `select count(*) from clara.schema_migrations` =
**194**, newest row `0208_prepayment_amortisation`; `current_setting('server_version')` = `17.11
(Ubuntu 17.11-1.pgdg26.04+2)`; before the bootstrap the database carried schema `clara` and **no**
`graphile_worker`.

**FIX ROUND 1 CLOSED THE WALK CAVEAT.** Run B above is a **green whole-file run** — six of six,
34.8 s, exit 0 — so AC7 no longer carries a host caveat. The wall clock fell from 3.9 m to 34.8 s on
the same build between runs A and B, which measures the contention/cold-start diagnosis below rather
than asserting it, and follow-up 8 stands unchanged.

**The walk's three runs at `cc2beaa5`, read together.** The union of the passing cells across runs 1–3 is **all six**:
`walk.detail`, `walk.lifecycle` and `walk.geometry` passed in run 1; `walk.refusal` and
`walk.geometry` in run 2; `walk.attention` and `walk.motion_and_back` in run 3. The failing SET
differed between the two whole-file runs, and **every** failure was a 30 s test budget exhausted
inside the shared `signInTo` helper — `page.goto('/login?next=…')` answering `net::ERR_ABORTED`, or
the email `locator.fill` timing out — never an assertion about prepayment behaviour. Six sibling
lanes were building or running their own Playwright fixtures at the same time (one of them holding
26 node processes). Nothing was "fixed": all three runs are reported, and the budget is filed as
follow-up 8.

Known reds **not** touched: #707 and #693 never appeared (neither is in the `apps/web` suite). The
`thread-live-clarify.test.tsx` load flake did **not** fire in the whole-suite run (0 fail).

---

## Docs updated

* `CONTEXT.md` — new terms **Prepayment schedule** and **Service period**; `Accounting plan` gains its third kind; **Plan occurrence** extended (not rivalled).
* `packages/db/README.md` §Operation-contract census — the definer call to the frozen evaluator, the re-derived expense half, the attention read's two arms and what neither reaches.
* `packages/db/tests/README.md` §Freshness and split chains — the battery, its gate, and the two measured scene facts (calendar-year FYs; the accepted Terms/DPA).
* `packages/runtime/README.md` §Current structure — the non-frozen module, why nothing frozen may import it, and both successor contracts in summary.
* `apps/web/README.md` §Application map — one row.

### Blueprint drift (recorded, not fixed)

`docs/PRD.md:69` accepts *已有的授权规则* (an existing authorisation rule) as plan authority, while
`accounting_plans.authority_kind`'s CHECK admits exactly one member, `explicit_instruction`
(`0193:418`), and `create_accounting_plan` refuses `authority_rule` by name (`0193:1474-1480`). 0208
does not touch that CHECK. Second, `PRD.md:69` lists 预付款摊销 under *对话、文件或 Accounting 直接处理*
as current behaviour; the chat half is a `chatTurn_v20` contract here, not a delivery.

---

## Successor contracts (exact)

Both are written in full in `packages/runtime/lib/prepayment-schedule-basis.ts`'s footer. **Neither is cut.**

### 1 · `chatTurn_v20` — `start_prepayment_schedule_work`

* **Tool name** `start_prepayment_schedule_work` (`START_PREPAYMENT_SCHEDULE_WORK_TOOL`).
* **`.strict()` zod input** — exactly four fields: `source_entry_id` (uuid), `expense_account_code`
  (trimmed 1..64), `expense_account_basis` (trimmed 1..4000), `purpose` (trimmed 1..200). **No
  amount, no period count, no term, no cadence, no authority id** — each absence is a rule
  (`schema.no_accounting_facts` pins all eight).
* **Local mirror** `localPrepaymentRefusal(input)` before any round trip.
* **Op key** `stableOpKey(ctx.taskId, START_PREPAYMENT_SCHEDULE_WORK_TOOL, input)` — 0208 asks its
  `_reserve_op` *before* the duplicate check for exactly this, so a re-run turn replays rather than
  answering `prepayment_schedule_exists`.
* **Door call and argument order** —
  `clara.create_prepayment_schedule(p_client => $1::uuid, p_source_entry => $2::uuid,
  p_expense_account => $3::text, p_expense_basis => $4::text, p_purpose => $5::text,
  p_authority_ref => $6::jsonb, p_op_key => $7::text)`, the seven values of
  `prepaymentDoorPayload(input, {clientId, taskId, opKey})`. `p_authority_ref` is
  `{kind:"chat_task", id: ctx.taskId}` — the conversation is the instruction; a model never names
  the row that authorises its own act.
* **Refusal → message map** `prepaymentRefusalMessage(reason, detail)` over the eleven tokens in
  `PREPAYMENT_REFUSAL`. None is a new error CLASS: `claraWork.v1.errors.ts` needs no change.
* **Part kind** `prepayment_schedule_configured`, built by `prepaymentSchedulePart(answer)`, always
  carrying `configurationOnly: true`.
* **No `WORK_ACCEPTED_PURPOSES` widening, no new `accounting_work.purpose`, no new claraWork bundle.**

### 2 · `claraWork_v4` — the TERM PARK (AC5 / C55.13)

Why it cannot be delivered here, measured: `clara.open_work_question` is `grant execute … to
clara_runtime` only (`0180:686`, re-granted `0184:1696`), refuses a null/blank **hook token**
(`0180:585-588`) and requires the task to be `running` (`0184:1643`) — so **no human door can park a
Work**; and the frozen prompt forbids the run from citing a source document at all
(`claraWork.v1.prompt.ts:68`, roster `:36-40`).

1. **Roster** — add `read_prepayment_source` (read-only: the bound document's recorded service
   period, its `basis_kind` and its basis text; **never the document's bytes**). `ask_question` stays
   execute-less so the run parks on the WDK hook (`claraWork.v3.tools.ts:29-32`).
2. **Prompt** — the "no source document" sentence becomes "the document this Work's entry binds is
   the ONLY source you may cite, by its recorded facts and never by inventing one".
3. **The question**, through the run's own hook token:
   `clara.open_work_question(p_work => <this Work>, p_prompt => 'Over what service period does this
   prepayment run?', p_fields => [{key:'period_start',kind:'date',required:true},
   {key:'period_end',kind:'date',required:true},{key:'basis',kind:'text',required:true,max:4000}],
   p_context => {document_id, source_entry_id, prepaid_account_code, total_cents},
   p_hook => <hook token>, p_asked_against => {basis_version: <the Work's basis digest>})`.
   `p_fields` uses 0180's **closed** field kinds (`0180:362-479`).
4. **The answer applies through the HUMAN door, not the run.** The settled answer is delivered to the
   parked run, which writes nothing: `clara.record_document_service_period` — bookkeeper floor,
   human-only by law, `basis_kind='human_stated'` structurally (`0140:944-959`) — records it, and the
   run then re-derives by calling the schedule door. A run that wrote the term itself would make a
   model-read period a durable accounting fact.
5. **An expired question.** 0198 removed the `work_id is not null` predicate from the expiry sweep, so
   a past-due parked question moves to `expired` and the run resumes with no answer. The correct
   settle is **`refused` carrying `prepayment_term_underivable`**, which leaves the recognition
   visible in `list_prepayment_attention`'s **arm B** rather than in no surface at all. It must NOT
   settle `completed` and must NOT re-ask.

---

## Findings, assumptions and residuals

**Findings (each measured, with the cell that measured it).**

1. **C08.2's owner is confirmed; its expected arm is unreachable.** `p653.schedule.zero_basis` asserts
   `detail.owner = 'clara._assert_journal_basis'` and then the constraint that actually answered —
   **`exactly_one_side`**, not `nonzero_total`. 0178's per-line arm (`:771-775`) fires first and every
   surviving line carries exactly one *positive* side, so the debit total can never reach `:785-787`.
   The door carries 0178's own constraint through rather than choosing a word (`0208:1224-1236`).
   #652 reached the same conclusion from the accrual side; filed once below.
2. **Model egress is a standing precondition for every occurrence, and it is measurable.** The
   locked-period cell answered CLR13 `egress_not_authorized` instead of CLR19 until the scene
   accepted the published Terms/DPA as firm owner (`0195:502`) — recorded in
   `packages/db/tests/README.md`. `p653.attention.egress` now pins that axis and proves arm A reaches
   it.
3. **The immutable-argument form held; the brief's fallback was not needed.**
   `clara._plan_occurrence_basis` stays `immutable` with a fifth `p_line_override jsonb`; the table
   read lives in the new `stable`, ungranted `clara._plan_amortisation_period_line(uuid,date)`
   (`0208:389`). `preview_accounting_plan`'s live `provolatile` was **measured** as `s` before the
   recut (`0208:51-54`, `:976-977`) and `0208:1748` re-asserts it in the tail. No
   `_plan_amortisation_basis` branch was cut.
4. **A genuinely shared RPC verb broke the walk in the browser, and the fix crossed into a merged
   sibling lane's mock.** `plans-mock.mjs` drained the request stream with a lane-local reader that
   cached nothing; once #653 legitimately answered `pause_accounting_plan` on its own plan id, that
   lane read the body, answered `false` for a foreign id and left this lane an empty object — the
   pause dialog stayed open. Both mocks now use `e2e/mock-dispatch.mjs`'s `readCachedJson`, the new
   one gating with `matchVerb` first (`cc2beaa5`); four verbs declared shared in
   `e2e-fixture-ownership.test.ts:1001-1013`. **This edits a file outside the brief's declared
   one-liner list** — declared here rather than made silently.
5. **33 duplicated lifecycle strings were deleted, not left as a second copy.** The surface reuses
   #640's dialogs, which speak the plan lane's words, so the `Prepayments.*` twins were unreachable.
   Every deleted key was this branch's own addition in its own namespace
   (`git show 84e778da -- apps/web/messages/en.json`).
6. **The db fixtures seed document extractions as root** (`clara_runtime` lacks privilege on
   `document_extractions`). That is scene *setup*, never the assertion under test: every door cell
   runs through `humanQuery(sub, namedCall(...))` as bookkeeper `bob`, and `p653.census.floor` proves
   a viewer is refused the write and admitted the read.
7. **FIX ROUND 1 — five findings a review measured that this report did not.** Two blockers: the
   web create form sent the recognition entry's own id as its `authority_ref` (unresolvable at the
   door, so the surface could never have succeeded against the real database), and the door
   accepted ANY single-debited-asset entry — a receivable, a bank account — as a prepayment while
   arm B advertised them. Three shoulds: an unordered `limit 50` in both attention arms, a bare
   23505 for a raced duplicate, and a cell title claiming a negative it never measured. All five
   fixed, each red-celled first; the account is in `653-fixround-1.md`. Two of my own claims moved
   with them: **arm B's predicate is no longer "the evaluator's own" alone** (it carries 0042's
   eligibility wall too), and **the form asks five things, not four**.
8. **The World e2e quiesced 73 unrelated queued Work items** left by the db batteries before arming
   the crash — its own guard against SIGKILLing onto a stranger's Work
   (`packages/runtime/tests/prepayment-occurrence-e2e.mjs:341`). Rig state; 0 on a clean CI database.

**Assumptions (taken conservatively, not asked).** (a) The lifecycle doors are #640's, **reused** on
the schedule's `plan_id` — a prepayment-shaped twin would be two lanes disagreeing about "paused".
(b) One schedule per recognition entry and per plan; a repeat of the same `op_key` replays
(`p653.schedule.one_per_entry`). (c) `_reserve_op` is asked **before** the duplicate check, so a lost
response replays rather than answering `prepayment_schedule_exists` — the chat contract depends on
it. (d) Arm A carries the **stage** it stopped at (admission vs posting), because CLR04 and CLR13 need
different next acts. (e) `zero_basis` and `granularity` are one proposal seen twice — 1 cent over 2
months is the only balanced all-zero amortisation basis this estate can build. (f) Nav row
`prepayments` beside `plans`, viewer floor, icon `route` (`tree.ts:346`); `/new` takes `?entry=<id>`
so an arm-B row prefills. (g) No `firm-scope-db-pins.corpus.ts` entry — this lane adds no dynamic SQL.

**Residuals (named, not closed).** (0) **The prepaid-leg wall added in fix round 1 is NEGATIVE, not
a roster** — it refuses an unknown, inactive, control-class, bank or role-reserved account by
0042's own rule, so an ordinary unclassified asset still passes. A positive "this account holds
prepayments" classification does not exist in this estate; follow-up 10. (1) **A memo-only
recognition has no amortisation path at all** —
the evaluator refuses an entry binding no document (`0140:1070-1075`), so neither arm reaches it;
**Q8 is not closed**. (2) Double posting across the 0045 lane is not closed: `_plan_overlap_warning`
runs at create/revise only (`0193:1552`, `:1751`). (3) Re-derivation from a corrected term is not
claimed; a revision only moves the authority window (`p653.revision.cadence_pinned`). (4) AC5's park,
C55.13 and C83.7 are **not claimed**. (5) `adjustment_templates.schedule` (`0140:660`) is still
unrendered, so C08.1 stays partial. (6) A deactivated authoriser silently stops a multi-year schedule
(`p653.attention.arm_a`); #625 owns the other side. (7) Hosted real-environment evidence is owed.

---

## Follow-ups worth filing

1. **`clara._assert_journal_basis`'s `nonzero_total` arm is unreachable (`0178:785-787`).** The
   per-line `exactly_one_side` arm fires first, so no caller can drive the debit total to zero.
   Retire it, or give it a reachable caller. #652 found the same from the accrual side — file once,
   cite both lanes.
2. **A human-stated typed term for a prepayment with no document.** `prepayment_schedule_v1` reads
   the term only from `document_service_periods`, so a memo-only recognition can never be amortised
   and appears in no surface. A typed term has no document to supersede, so it mints a second
   correction discipline #646 would then have to serve — weigh that before opening it.
3. **`rig-isolation` T10b vs the WDK world bootstrap.** T10b reds on any rig database that also
   carries the world (`graphile_worker`'s functions are PUBLIC-executable). CI keeps them apart by
   database; a local rig cannot. Either scope T10b's probe to exclude `graphile_worker`, or record in
   `RIG.md` that T10b is expected red after the bootstrap.
4. **Overlap with the 0045 template lane is advisory and one-sided.** Closing it needs a check at
   occurrence admission or on the 0045 sign door — larger than feeding the new kind into
   `_plan_overlap_warning`.
5. **Nothing tells a live schedule its term row was superseded.** A read listing schedules whose
   `document_service_periods` row is no longer live would make "a corrected term needs a new
   schedule" visible instead of tribal.
6. **Cut the two successors** — `chatTurn_v20` (`start_prepayment_schedule_work`) and `claraWork_v4`
   (the term park). Both contracts are above and in the module's footer; neither is cut here.
7. **Hosted real-environment evidence for C88.13 / AC8**, separately authorised.
8. **The walk's sign-in step needs the harness's long budget on a shared host.** `signInTo`
   (`apps/web/e2e/prepayments-walk.spec.ts:43-53`) already gives the post-sign-in navigation 30 s, but
   the *test* budget is also 30 s, so `page.goto('/login…')` plus two fills can exhaust it before that
   assertion is reached. The one cell carrying `test.slow()` (`walk.lifecycle`, `:188`) survived the
   worst contention. Give `signInTo` its own budget, or mark every cell in a sign-in-first walk slow.
   A harness-budget issue that will bite every lane's walk on this host — filed, not patched here.
9. **`packages/runtime/README.md`'s "five standalone e2es" sentence is stale** — it already excluded
   `plan-occurrence-e2e.mjs` and now `prepayment-occurrence-e2e.mjs`. Pre-existing; the new file is
   documented at `:78`.
10. **A positive prepayment-eligibility roster for the prepaid leg.** Fix round 1's wall closes the
   receivable-control, bank, inactive and role-reserved cases by the estate's own rule; it does not
   stop a plain unclassified asset being amortised into an expense. Closing that needs a
   chart-level classification (or a `coa_accounts.account_class` member for prepayments), which
   touches every lane that reads the chart — a product decision, not a fix-round one.
11. **`0154_binding_proposal_pr_1`'s role census is a cluster-global literal (`= 14`).** Roles
   survive `drop database`, so a from-scratch re-apply into a fresh DATABASE on an EXISTING cluster
   reds there (`the clara role count moved from 14 to 18`). Either scope the census to the roles the
   chain has minted by that frontier, or record in `RIG.md` that a re-apply needs a fresh cluster or
   the four post-0154 roles (`clara_stripe_webhook{,_login}` 0160, `clara_auth_wall{,_login}` 0163)
   dropped first. It cost fix round 1 a full chain restart.

---

## Unverified

- **The original RED run was measured by the pre-cut attempt, not re-measured here.** The mechanism
  is checkable at `packages/db/tests/prepayment-schedule-fixtures.mjs:91-94`, and both batteries
  reported **0 skips**, which proves the cohort gate saw the lane present rather than skipping. **Fix
  round 1's five new cells WERE red-measured on this rig before their fix**, each failing for the
  reviewer's own reason; the failure text is quoted in `653-fixround-1.md`.
- **Fix round 1 rebuilt the rig.** `clara_653` was dropped, re-created (measured empty prestate) and
  the whole chain re-applied — 194 migrations, `#653 prestate: clean` and `#653 tail: OK` on that
  chain — then re-seeded and the WDK world re-bootstrapped. The chain needed one manual step, and it
  is a finding rather than a workaround: see follow-up 11.
- **T10b fails on this rig, and it is rig state.** Direct before/after on the same database:
  **21 / 20 pass / 0 fail / 1 skip** before `pnpm --filter @clara/runtime exec bootstrap`,
  **21 / 19 pass / 1 fail / 1 skip** after, the only new failure being T10b reporting `clara_agent_ro`
  / `clara_wake_interactive` / `clara_wake_proactive` each reaching seven `graphile_worker.*`
  functions. No migration creates that schema (`grep -rniE "create schema[^;]*graphile"
  packages/db/migrations/` → **0**) and 0208 never mentions it (**0**). Follow-up 3.
- **At `cc2beaa5` no single whole-file Playwright run was green.** Runs 1 and 2 are reported in full
  with their failing sets; run 3 proves the two cells that had not yet passed do pass alone.
  **Fix round 1 took one on a quiet host: 6 passed / 0 failed, 34.8 s, exit 0**, so this is no longer
  unverified — with the contended run A reported beside it rather than discarded.
- **The a11y cells are structural, not an axe run.** `prepayments-a11y.test.tsx` rides the repo's
  hand-written `apps/web/test/a11yRules.ts` engine (the `staff-advances-a11y.test.tsx` precedent), not
  axe-core, and no screen reader was driven.
- **Hosted evidence: pending.** No hosted artefact was read or produced, for any AC or historical row.
- **Not run (orchestrator/CI's job):** the `packages/db` estate suite, the `packages/runtime` unit
  suite, the whole browser suite. **T19 skipped (counted)** — the reset/role-sweep flags were never
  set. **The two `apps/web` skips are counted but not named** (the run was captured through `tail -60`
  and their reasons fell outside the window); zero failures.
- **Host contention was heavy throughout** — 54 to 106 concurrent `node` processes from the eleven
  sibling lanes, six of them running their own Playwright fixtures while this walk ran (one holding 26
  processes). Nothing was re-run away; every run is reported.
- **What the cut attempt left, and what I kept.** On resume `git status` was **clean**,
  `git stash list` **empty**, and all **8** commits present: there was no uncommitted work to keep or
  discard, and I discarded nothing. The cut left exactly four unfilled blocks in this report — the
  commands-and-counts table, the findings section, the follow-ups and the unverified list. Every number
  that replaced them was measured this session, and no source file needed a fix to make a run green,
  so the branch is byte-identical to `cc2beaa5`.
