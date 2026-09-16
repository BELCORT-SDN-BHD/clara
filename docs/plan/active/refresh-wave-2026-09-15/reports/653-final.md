# #653 — prepayment recognition and amortisation over an explicit service period · final report

**Branch** `impl/653-prepayment-amortisation` · **worktree** `C:\Users\zhant\Desktop\clara-wt\653` · rig
`127.0.0.1:55511/clara_653` (PG 17.11, **194** migrations on a from-scratch chain).
All evidence below is **LOCAL**. **Hosted evidence pending** — none exists for this surface.

`git log --oneline origin/main..HEAD` (8 commits)

```
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
| **AC1** required full set + zero-value refusal | **done** | `clara.create_prepayment_schedule` (0208 §D) requires the posted recognition, the judged expense account **and its stated grounds**, the purpose and a resolved authority; the term comes from the document. Cells `p653.schedule.target_underivable`, `.target_ineligible`, `.source_unfit`, `.term_missing`, `.zero_basis` — all green. |
| **AC2** exact-cent allocation, final-period residual, no invented term/authority | **done** | `p653.schedule.exact_cents` (12 × 100,000 ⇒ 8333×11 + 8337, sum exact); `p653.occ.per_period` drives the belt and the catch-up and reads each period's own amount off the admitted Work's basis. Both structural holes closed: the per-period basis (§C) and the re-derived expense half (§D). |
| **AC3** one occurrence under repetition / lost response / restart | **done** | `p653.occ.identity` (two scans behind a real `pg_stat_activity` lock barrier ⇒ one occurrence, one Work, the loser converges) and `prepayment-occurrence-e2e.mjs` legs 1–4 on the real Postgres World. |
| **AC4** atomic occurrence, configuration ≠ posted | **partial-with-named-residual**, as briefed. Per-occurrence atomicity: e2e legs 2+3 (crash between commit and checkpoint ⇒ one entry, one receipt, one occurrence). Recognition + configuration in one commit is **unbuildable** (the evaluator refuses a non-`approved` source entry, `0140:1040-1044`) — said in the door's own answer (`configuration_only: true`), in `Prepayments.configurationBody` on every surface, and in the list's `posted_periods` count. Residue (a) = the door's inline refusal **and** attention arm B (`p653.attention.arm_b`); residue (b) = arm A (`p653.occ.locked_period`, `p653.attention.arm_a`, `p653.attention.egress`). |
| **AC5** park / locked-period catch-up / no historical authority | **partial-with-named-residual**, as briefed. Locked period: `p653.occ.locked_period`. No historical authority: `p653.catchup.window` (`catch_up_before_authority`). **The park is NOT claimed** — `claraWork_v4` contract only (below). |
| **AC6** register the adapter; preview / revision / pause / end retain prior runs; explanatory failures in C8 | **done** | `p653.kind.unsupported` (the widening is additive), `p653.schedule.due_dates_cover` (preview projects each period's own amount), `p653.revision.cadence_pinned` (revision refuses a cadence change, the stored lines do not move, revision 2 keeps its predecessor), `list_prepayment_attention` + the detail's explain-and-choose surface for C8. |
| **AC7** the real journey, all states, 320px/zoom/keyboard/SR/motion/URL/drafts | **done** | `prepayments-walk.spec.ts` (6 cells) + `prepayments-render-states` (11), `-a11y` (3, axe-shaped rule engine, zero findings), `-keyboard` (4). |
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
| `packages/db/tests/prepayment-schedule.test.mjs` | 15 cells — the arithmetic, the derived cadence, the five refusal tokens, the additive kind widening, the unrevisable cadence, the grants/floor census. |
| `packages/db/tests/prepayment-occurrences.test.mjs` | 8 cells — the per-period basis on the real belt, the missing-line refusal, the lock-barrier race, the locked period, both attention arms, the egress axis, the catch-up window. |
| `packages/db/tests/prepayment-0208-preintegration-gate.mjs` | The package-wide sweep's escape; a focused run fails loudly. |
| `packages/runtime/tests/prepayment-schedule-basis-unit.test.mjs` | 11 cells — the `.strict()` schema's deliberate absences, the mirror's shallowness, the door payload's names, the configuration-only part. |
| `packages/runtime/tests/prepayment-occurrence-e2e.mjs` | The real Postgres World: **the final period posts the residual through the frozen tool schema**, plus identity, crash-replay and catch-up. |
| `apps/web/components/prepayments/prepayments-render-states.test.tsx` | 11 cells — the state ladder, both attention arms rendered distinctly, the explain-and-choose surface. |
| `apps/web/components/prepayments/prepayments-a11y.test.tsx` | 3 cells — zero structural findings on list, detail and form; colour is never the only cue. |
| `apps/web/components/prepayments/prepayments-keyboard.test.tsx` | 4 cells — reachability, focus-on-first-invalid with the draft kept, the disabled preview, the dialog. |
| `apps/web/lib/prepayments/schedule.test.ts` | 12 cells — token parity with 0208, the mirror's shallowness, the derived cadence as a constant, the allocation check. |
| `apps/web/e2e/prepayments-walk.spec.ts` + `prepayments-mock.mjs` | 6 browser cells — attention, the refused-then-retried configure, the detail, the lifecycle dialog, 320px/200%, reduced motion + Back. |

### Commands and counts

```
RUNS_PLACEHOLDER
```

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

FINDINGS_PLACEHOLDER

---

## Follow-ups worth filing

FOLLOWUPS_PLACEHOLDER

---

## Unverified

UNVERIFIED_PLACEHOLDER
