# Wave 2026-09-15 — the successor cut (`chatTurn_v20`, `claraWork_v4`, `clientOnboarding_v5`)

Branch `integration/wave-2026-09-15`, commit **`12cdc528`** (48 files, +6226/−122), worktree `C:\Users\zhant\Desktop\clara-wt\int`. Cut once, after
the twelve merges, the two integration fix rounds and the browser sweep. Authority: `DECISIONS.md`
§1.1 and §3.3, `WAVE-DIGEST.md` §4–§5, and each ticket's own "successor contract" stanza — read in
full, not the summary line.

**Headline.** Three bodies cut and three pins repointed. Two of the wave's contracts were NOT cut and
both are grant walls measured on the merged chain, not omissions: **#653's
`start_prepayment_schedule_work` and `read_prepayment_source`**, and **#647's
`record_counterparty_alias`**. No migration was written. No blueprint was edited.

---

## 1 · What each body carries

### `chatTurn_v20` — five files, copies of v19's shape

`chatTurn.v20.{ts,impl,prompt,tools,usage}.ts` (202 / 181 / 214 / 381 / 29 lines). v19's five files
carried forward; the ONLY behavioural difference is the tool map `runModelSegmentStepV20` hands the
model.

| | |
|---|---|
| `start_staff_expense_claim_work` (#638) | `buildToolsV20` = `Object.assign` over `buildToolsV19(ctx, modelId, segment)` plus two literal keys. Schema, `localClaimRefusal`, `claimFromInput` imported from `packages/runtime/lib/staff-expense-claim-basis.ts`. Door: `clara.admit_staff_expense_claim_work($1 clientId, $2 ctx.createdBy, $3 intentKey, $4::jsonb claim, $5 'clara_interpreted', $6::jsonb [{kind:'chat_task',task_id,session_id}], $7 modelId)` — **seven arguments, no `p_basis`**, exactly the stanza. `intentKey = stableOpKey(ctx.taskId, TOOL, input)`. Session read from the task, never from a model argument. |
| `start_accrual_work` (#652) | Schema and `accrualFromInput` from `packages/runtime/lib/accrual-basis.ts` **as merged** — `effective_to` is REQUIRED and window-inside-term (DECISIONS §3.1 R4), `method` has one member `stated_amount`; the older stanza text is superseded. Door: `clara.create_accrual_adjustment_for` with the stanza's twelve arguments in order, `'Asia/Kuala_Lumpur'` as `$9`. A future-dated authority window answers `ok:true` with `work_accepted: null` — "configured, nothing due yet" rather than a card naming a Work that does not exist. |

* **No new wire kind and no `WORK_ACCEPTED_PURPOSES` widening**, verified rather than assumed:
  0206 calls the unchanged `clara._admit_accounting_work_core(..., 'journal_entry', ...)`
  (`0206:1288`), and 0208's/0193's `_plan_admit_occurrence` admits every occurrence through
  `clara.admit_journal_work`, which inserts the literal `'journal_entry'` (`0178:918`).
  `chatTurn.v19.parts.ts` is **byte-untouched** (`git diff --stat` empty) and stays the declarer;
  `WORK_ACCEPTED_PURPOSES_V19` is still `["journal_entry","periodic_stock_adjustment","payroll_obligation"]`.
* **Therefore there is no `chatTurn.v20.parts.ts` and no `apps/web` change at all.** The only new wire
  kind the wave asked for was `prepayment_schedule_configured`, which belongs to the tool that was
  stopped at the grant wall (§3). This is the first chat repoint in the estate that owes no reader work.
* The C-19 terminal set is v19's (= v18's), unchanged; `hasCodingIntent_v20` returns true for both
  new tools and both mint the `work_accepted` card already in that set.
* Engine stamp `llm-openai:<modelId>:chatturn-v20` (`chatTurn.v20.usage.ts`). Nothing in the database
  pins a chat engine id, so no migration is implied (`grep chatturn-v19` across `*.sql`: zero hits).

### `claraWork_v4` — six files

`claraWork.v4.{ts,impl,tools,prompt,errors,bundle}.ts` (359 / 915 / 377 / 223 / 86 / 102 lines).

1. **#654 (a) — the knowledge-context step.** New NON-frozen module
   `packages/runtime/lib/knowledge-conflicts.mjs` (223 lines; never an edit to the frozen
   `knowledge.mjs`). `readWorkKnowledge(sql, {clientId, purpose, firmId})` returns
   `readKnowledgePack`'s envelope verbatim plus a rendered, bounded `text` block and a
   `knowledge_version` normalised to a **string**; it never throws and never returns null. Read once,
   before the segment loop, as `clara_runtime`. Its version rides into the EXISTING trace call:
   `observed: observedRevisions({ knowledge_version, basis_digest: null })` (`claraWork.v4.impl.ts:588`)
   — `knowledge_version` was already in `lib/work-trace.mjs`'s closed vocabulary, so the trace itself
   is unchanged, exactly as the stanza says.
2. **#654 (b) — `ask_knowledge_conflict`.** Execute-less (`ask_question`'s shape). `.strict()` input is
   the stanza's: `knowledge_key`, `rows` (2–4, each `record_id`/`scope_kind`/`applies_when`/`value`),
   `why_it_blocks`. `knowledgeConflictFields(rows)` builds ONE `choice` field, one option per row plus
   `neither_correct_the_record` — it **picks no winner**. Opens through the existing
   `clara.open_work_question` (`clara_runtime` + hook token, `0180:686`); part kind is the existing
   `work_question`.
3. **#652 — `answer_accrual_term`.** Execute-less. Fields `service_period_start` /
   `service_period_end` only; the schema **cannot express a period the model derived** (celled).
4. **#639 — the dependent particulars question.** A WORKFLOW act, not a roster entry: the run opens it
   after a commit whose entry birthed a register row with no method or in-service date
   (`loadPendingFixedAssetStepV4`), parks on the WDK hook, and applies the answer through
   `clara.complete_fixed_asset_particulars_for($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::uuid)` —
   `clara_runtime`-only (`0201:835`), `p_obo` = the Work's initiator, op key derived from
   `(work, asset)`. **No second journal**: 0201's tail T.9 asserts neither particulars door's body
   names `journal_entries`, and the e2e/unit cells hold the entry count unmoved.
5. **Roster and ids.** `CLARA_WORK_TOOL_NAMES_V4` = `list_accounts`, `record_journal_entry`,
   `ask_question`, `answer_accrual_term`, `ask_knowledge_conflict` (three → five).
   `clara-work/v4` · `clara-work-instructions/v4` · `journal-entry/v4` · `clara-work-tools/v4`.
   Measured digest `81e1ffcd55269b061a75057aaaf53b17d41740c4a46e07bc4cea4775a9c5245a` (v3's is
   `345f2a38c3c8…`, unmoved).
6. **`claraWork.v4.errors.ts` adds NO row** — it delegates to v3's classifier, so every v1/v2/v3
   mapping is preserved by construction. #639's follow-up `(CLR40, fa_cost_adjustment_deferred) →
   refusal` was deliberately NOT taken: it is a follow-up the wave ruled on nowhere, and a
   classification change is a behavioural change to every Work that hits that code. The file says so
   at its head so the absence is legible.
7. **No new wire kind.** `claraWork.v3.parts.ts` stays the declarer; v4 re-exports v2's/v3's
   `openWorkQuestionStep`, `emitWorkQuestionStepV3`, `emitWorkStatusStepV3` by import rather than
   copying them, so the parity census gains exactly one site (`work_result`, v4.impl:553).

### `clientOnboarding_v5` + `interview.v4.questions.ts` + `interview.v4.known.ts`

245 / 154 / 246 lines. Per #649's stanza, and only that:

1. **H-52** — `sst_no` gains `appliesTo: prior => prior["sst_regime"] !== "not_registered"`, the shape
   `interview.v2.segments.ts:375` already uses; `segmentApplies` unchanged.
2. **`fye_day`** — a new segment emitted immediately after `fye`, validated as an integer 1–31 against
   the month `prior["fye"]` recorded (`ck_clients_fy_end`'s own month-length table).
   **`required_for_commit` stays FALSE** — the stanza's ruling, left where the stanza left it.
3. **Known-facts pre-read** — one `clara.get_knowledge_pack` read before the segment loop
   (`interview.v4.known.ts`), admitted only where the segment's OWN validator accepts the recorded
   value; a value the validator REFUSES is **asked with the record shown** ("known, confirm"), never
   silently skipped.
4. `CLIENT_SEGMENTS_V4` is built by flat-mapping `CLIENT_SEGMENTS_V3` and replacing only the changed
   segments **by reference** — celled (`v5.inventory`, 3 cells).

**Left open by the stanza and named here:** writing a corrected fact back to Knowledge from the
interview. That is `capture_knowledge`'s act under a named human's authority and a workflow step
carries no authenticated actor — the same wall `interview.v3.questions.ts` documents for the chart
apply. Not half-built.

---

## 2 · The exact registry diff

`packages/runtime/workflows/registry.ts`, +99/−6. Three kinds of line, nothing else:

```
+ import { chatTurn_v20 }        from "./chatTurn.v20.js";
+ import { claraWork_v4 }        from "./claraWork.v4.js";
+ import { clientOnboarding_v5 } from "./clientOnboarding.v5.js";

  workflows.chatTurn:          chatTurn_v19        -> chatTurn_v20
  workflows.claraWork:         claraWork_v3        -> claraWork_v4
  workflows.clientOnboarding:  clientOnboarding_v4 -> clientOnboarding_v5

+ export { chatTurn_v20 };  + export { claraWork_v4 };  + export { clientOnboarding_v5 };

  workflowBodies += "chatTurn_v20", "claraWork_v4", "clientOnboarding_v5"   (every prior name kept)

  workflowPins.chatTurn:          "chatTurn_v19"        -> "chatTurn_v20"
  workflowPins.claraWork:         "claraWork_v3"        -> "claraWork_v4"
  workflowPins.clientOnboarding:  "clientOnboarding_v4" -> "clientOnboarding_v5"
```

Every superseded body stays exported AND in `workflowBodies` — the stranded-body gate refuses
database-wide otherwise. Each repointed key gains a note stating the deploy order in the direction
that is owed (0206+0207 for chatTurn; 0192+0201 for claraWork; none for clientOnboarding), the
rollback cost, and what is deliberately absent. `chatturn-v18.test.mjs` now asserts those sentences
for the CURRENT pin rather than for a version literal.

**Boot provenance and build-info, repointed with it:**
`plugins/startWorld.ts` prints a fourth bundle banner (`CLARA_WORK_BUNDLE_V4_BANNER`);
`src/buildInfoRoutes.ts` serves four identities, **pinned first**:
`[claraWorkBundleIdentityV4(), …V3(), …V2(), …()]`. Both measured live in the two-build drill:
`bodies=54 pins … chatTurn=chatTurn_v20 claraWork=claraWork_v4 clientOnboarding=clientOnboarding_v5`.

---

## 3 · What was NOT cut, and the measurement that stopped it

Both are grant walls on the merged chain. `Grants: STOP and report; no new migration in this cut.`

| Contract | Ticket | Measured on the merged chain |
|---|---|---|
| `start_prepayment_schedule_work` | #653 | `clara.create_prepayment_schedule` is granted to `clara_authenticated` ALONE (`0208:1674`) and is `_human_ctx`-fronted at the bookkeeper rank (`0208:1044`). 0208 defines no `_for` twin (`grep '_for('` in 0208: zero door hits). The runtime pool SET ROLEs to `clara_runtime` and carries no JWT actor, so the tool could only ever return a grant refusal. |
| `read_prepayment_source` (claraWork_v4 roster) | #653 | `get_prepayment_schedule` / `list_prepayment_schedules` / `list_prepayment_attention` are `clara_authenticated`-only (`0208:1675-1677`); `clara.prepayment_schedules` has a NULL relacl; `clara.document_service_periods` is granted select to `clara_authenticated` only (`0140:627`). No machine-lane read of the term exists. **Consequently the frozen prompt's "no source document" sentence is UNCHANGED from v3's** — changing it would license citing a source the run cannot read. |
| `record_counterparty_alias` | #647 | Needs an OBO door `clara.add_counterparty_alias_for` that no branch shipped; `clara.add_counterparty_alias` is `_human_ctx`-fronted, `clara_authenticated`-only and refuses `origin='agent_proposed'`. DECISIONS D11 keeps it a contract — this cut confirms it rather than reopening it. |

All three stanzas stay written in their non-frozen modules, and **those modules stay OUT of every
frozen closure** — importing one would hash-lock it before its door exists. Both carrier files gained
a dated paragraph saying the ceremony happened and they were left outside it, with the measurement,
so the next reader does not have to rediscover it:
`packages/runtime/lib/prepayment-schedule-basis.ts` and `packages/runtime/lib/counterparty-identity.ts`.

**Other stanza items left open, by name:** #649's write-back of a corrected known fact (§1);
#646's successor contract is an explicit NEGATIVE and nothing was added for it; #652's three withdrawn
selection rules stay a successor residual (they need a run-time reader of `clara.accrual_adjustments`
that #653's `_plan_occurrence_basis` does not provide); #639's `fa_cost_adjustment_deferred`
classification follow-up (§1.6).

---

## 4 · The manifest diff

`node scripts/check-frozen-workflows.mjs --update`, run locally and never under `CI=true`, and then
re-run against the final tree to a **measured NO-OP** (`git diff --numstat frozen-workflows.json`
still `72 0` after the second `--update`), so the committed manifest is exactly what `--update`
produces and nothing was hand-edited into it.
**+18 entries, 0 removed, 0 changed** (`git diff --numstat frozen-workflows.json` → `72 0`; four lines
per entry). None carries `deployed: true` — `--update` preserves that flag and never grants it; the
`--lock-deployed` ceremony stamps it after the image is live.

| new entry | why it is in the manifest |
|---|---|
| `workflows/chatTurn.v20.{ts,impl,prompt,tools,usage}.ts` | marked `@frozen` |
| `workflows/claraWork.v4.{ts,impl,prompt,tools,errors,bundle}.ts` | marked `@frozen` |
| `workflows/clientOnboarding.v5.ts`, `workflows/interview.v4.{questions,known}.ts` | marked `@frozen` |
| `lib/staff-expense-claim-basis.ts`, `lib/accrual-basis.ts` | **by closure** — `chatTurn_v20` imports them (intended; #638's and #652's modules said so at their feet) |
| `lib/fixed-asset-acquisition.ts`, `lib/knowledge-conflicts.mjs` | **by closure** — `claraWork_v4` imports them |

`lib/prepayment-schedule-basis.ts` and `lib/counterparty-identity.ts` are deliberately still absent.

---

## 5 · Every command, with its counts

Node 22.23.2. Rig for the World legs: `rigint2` at `127.0.0.1:55601` — see §7.4 for why that
cluster rather than `rigint`.

| command | result |
|---|---|
| `node scripts/check-frozen-workflows.mjs` | **exit 0** — `299 frozen file(s) verified` (281 before, +18), `54 "use workflow" module(s) all frozen+registered` (51 before, +3) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **exit 0** — emittable `{freeform_result, work_accepted, work_status, work_result, work_question, knowledge_receipt}`; **no new kind**; `work_accepted` gains `chatTurn.v20.prompt.ts:178` + `chatTurn.v20.tools.ts:229,329`, `work_result` gains `claraWork.v4.impl.ts:553` |
| `pnpm typecheck` | **exit 0** — `packages/runtime: Done`, `apps/web: Done` |
| `pnpm lint` | **exit 0** — every workspace lint chain (`apps/web` incl. `check-token-contrast` / `check-test-manifest` / `check-message-keys`, `packages/db`, `packages/runtime`) plus the root guard battery (`43 cases · ALL GREEN`) |
| `pnpm --filter @clara/runtime build` | **exit 0** (nitro; the `input source map` ERROR lines from `@ai-sdk/*` are pre-existing noise, exit code unaffected) |
| `node scripts/check-workflow-bundle.mjs` | **exit 0** — `12 pinned class(es) … 54 superseded body(ies) still ship for parked runs, chatTurn pinned at v20 with its step directive, engine stamp and freeform_result emitter (40 checks)` |
| `node --test tests/{chat-turn-v20-tools,clara-work-v4,client-onboarding-v5}.test.mjs` | **53 pass / 0 fail** (16 + 20 + 17) |
| `node --test` on the seven cell files repointed in the first pass ¹ | **97 pass / 0 fail / 0 skipped** |
| `node --test` on the six files the suite caught ² | **119 pass / 4 fail** over nine files; all six repaired cells green, the four reds are `pg_dump ENOENT` (§7.1) |
| `node --test tests/p6-1-chatturn-v16.test.mjs` (shells out to the bundle gate) | **29 pass / 0 fail** |
| `node tests/interview-e2e.mjs` (World, `clara_wave_b_ci`) | **INTERVIEW E2E: ALL PASS** — `full 16-segment drive → interview_complete, 17 items`; `p649.interview.sst_park_closed` |
| `node tests/version-cutover-e2e.mjs` (World) | **VERSION CUTOVER E2E: ALL PASS** — derived `chatTurn_v20` from registry.ts; v7 park resumes on v7 |
| `node tests/chat-turn-v20-e2e.mjs` (World, NEW) | **PASS (4 legs)** — see §6 |
| `node tests/two-build-cutover-e2e.mjs` (World, `clara_rt_test`) | **exit 0** — pair derived `claraWork_v3 → claraWork_v4`; A carries 53 bodies, B 54 |
| **`pnpm test`** (runtime unit suite, `packages/runtime`) — run in full TWICE, because the first run is what caught the cut's own misses | run 1: **2618 tests, 2599 pass, 13 fail, 6 skipped, 374s**. Six of the thirteen were REAL and are fixed in this commit; run 2 after the fixes: **2618 tests, 2610 pass, 7 fail, 1 skipped, 348s**, and those seven are exactly the pre-cut baseline `integration-merge.md` §8.3 recorded. Full triage: §7.1 |

¹ `chatturn-v18`, `coa-interview-v4`, `f-a3-pr3-chatturn-v14-registry`, `fs7-v17-chatturn`,
`l9-build-info`, `p6-1-parts-parity`, `wave-7a-rt-blind-registry`.
² `f-a1-pr3a-consumers`, `f-a2-pr2-post`, `f-a6-pr2-freeform-unit`, `p6-1-chatturn-v16-db`,
`wave-e-f9-chatturn-v10`, `wave-b-interview-park-ordering` — run together with the three
`pg_dump`-bound files (`fs7-v17-chatturn-db`, `leader-state`, `relay-taxonomy`) so the four host reds
are measured beside the six repairs rather than separately.


---

## 6 · The new World e2e, and its CI row

`packages/runtime/tests/chat-turn-v20-e2e.mjs` (550 lines) + `chat-turn-v20-serve.mjs` (237) — the
`chat-turn-v19-e2e.mjs` / `work-journal-e2e.mjs` shape: it SPAWNS `scripts/serve.mjs` as a child, so
the real World, the real HTTP boundary, the real pools and the real frozen bodies are in the loop. It
skips cleanly (exit 0, printed reason) when 0206 or 0207 is absent.

```
[v20-e2e] PASS 1: a real chatTurn_v20 turn admitted a staff-expense-claim Work and the reconciler
                  ran it to a posted entry in 7596ms
[v20-e2e] PASS 2: the accrual is configured on a reversing_journal plan with NO occurrence —
                  'configured, nothing due yet' is a real state
[v20-e2e] PASS 3: the run read the client's knowledge AND recorded knowledge_version=0 as an
                  observed revision
[v20-e2e] PASS 4: the claim's particulars never reached the run, and the transcript carries exactly
                  one card — the Work that exists
CHAT TURN V20 E2E: PASS (4 legs)
```

PASS 3 is #654 stanza (a) measured in **both** places it can be — the block in the run's prompt AND
`knowledge_version` in the `model_call` execution-trace row. Either alone would be weak.

Registered in `.github/actions/db-live-gates/action.yml` immediately after its v19 sibling, on the
same rig, before the two builds and the world guard (25 added lines, per-line `\` continuations
intact). **`clientOnboarding_v5`'s World leg is folded into the already-registered
`interview-e2e.mjs`** rather than given a new row: the drive now answers 16 segments and 17 plan items,
`fye_day` is asserted as a `capture` that does not gate commit, and `p649.interview.sst_park_today`
is **flipped in the same commit** to `p649.interview.sst_park_closed` — which is the evidence #649's
report asked for. `claraWork_v4`'s World leg is legs 1 and 3 of the v20 e2e.

---

## 7 · The whole-suite run, one drill I had to repair, and the reds that are the host

### 7.1 · The runtime unit suite caught six things the targeted runs could not

`pnpm test` from `packages/runtime` — **2618 tests, 2599 pass, 13 fail, 6 skipped, 374s**. Every one of
the thirteen is triaged below; **six were REAL misses by this cut and are fixed in this same commit**,
and the other seven are the host or the shared database.

| red | verdict | evidence, and what I did |
|---|---|---|
| Five registry-pin cells — `f-a1-pr3a-consumers`, `f-a2-pr2-post`, `f-a6-pr2-freeform-unit`, `p6-1-chatturn-v16-db`, `wave-e-f9-chatturn-v10` | **REAL — the cut's own miss. FIXED.** | each asserted the string literal `chatTurn_v19` (`+ 'chatTurn_v20' - 'chatTurn_v19'`). All five now read `registry.workflowPins.chatTurn` and assert what they were written to assert — policy (c), the superseded bodies stay exported — with `chatTurn_v19` added to each ladder. This is the same treatment the first pass gave the seven files it did find; these five carry no registry- or pin-shaped name (`f-a1-pr3a-consumers`, `f-a6-pr2-freeform-unit`, `wave-e-f9-chatturn-v10`) and one is PG-gated, so only a whole-suite run reaches them. A grep is not a census — the suite is. |
| `GH #152: the guard REFUSES every shape whose written position is not its execution order` | **REAL — the cut's own miss. FIXED.** | the guard self-tests its own mutations and **announced its own vacuity** rather than passing: *"the `an ask the exported body never reaches (every hand-off replaced by an inline stand-in)` mutation did not apply — this self-test would be VACUOUS"*. `KILL_HANDOFFS` was a `replaceAll` of v4's literal argument list `askAndConfirmSegmentV2(seg, ask, prior)`; `clientOnboarding_v5` passes `segmentAsking(seg, knownQuestionFor(seg, prior, known))`. Re-anchored on the HAND-OFF (`, ask, prior)`) so a future body may change the first argument freely. That the file failed loudly instead of silently is the reason this was catchable at all. |
| `fs7.v17.db.report-tools`, `fs7.v17.db.close-stop`, `tests/leader-state.test.mjs`, `tests/relay-taxonomy.test.mjs` | **host, not the cut** | all four clone a private database. Without `CLARA_ALLOW_DESTRUCTIVE=1` they refuse at the guard (`createDisposableDatabase (…) is destructive and REFUSED`); **with** it they get one step further and fail identically at `pg_dump failed to start (spawnSync pg_dump ENOENT)` — there is no `pg_dump` and no `psql` on this Windows host at all (`which pg_dump` → not found; RIG.md says the same about `psql`; PostgreSQL lives in WSL). Same class as the RIG.md-sanctioned #707. None of the four touches the registry, a workflow body or a pin. |
| `scanner rejects EICAR, encrypted PDF, and XML entity expansion` | **known pre-existing Windows red (#693)** | named in RIG.md as one of two reds to ignore and never "fix". Untouched. |
| `637.pf` B2 and B3 | **shared-database contamination** | §7.3. |

**Re-run after the six fixes**: the five registry cells and the GH #152 guard are green
(`119 pass / 4 fail` over the nine files, the four being the `pg_dump` ones), and the whole suite was
then re-run end to end: **2618 tests, 2610 pass, 7 fail, 1 skipped, 348s**.

**AND THE SEVEN NON-CUT REDS ARE A MATCH AGAINST A DOCUMENTED PRE-CUT BASELINE, not a judgement.**
`integration-merge.md` §8.3 ran this same suite at the pre-cut integration tip, isolated on
`rigint2`'s own `clara_unit_test` — **2534 tests, 2522 pass, 7 fail** — and names its seven with their
error text: the same four `pg_dump failed to start (spawnSync pg_dump ENOENT)` files, the same #693
EICAR red, `637.pf` B3 (`19 !== 1`, named there as "a cross-file test-isolation gap … not a wave
regression"), and one `ready.test.mjs` host-contention flake. My thirteen minus the six I fixed are
that same set with `637.pf` B2 in place of the `ready` flake — two contamination-shaped reds swapping
places on a differently-dirty database. **No red survives the cut that was not already there.**

### 7.2 · `two-build-cutover-e2e.mjs`'s frontier leg was pinned to the wrong identifier

**First run: RED, and the red was correct.** `AssertionError: the GLOBAL verdict refuses a drained
rollback to A … + 'allowed' - 'refused'`.

Measured cause: the leg was authored at the `claraWork v2 → v3` pair, where `pair.pinned` and the body
migration 0195's frontier rule requires happened to be the same string, and it wrote `pair.pinned`
into four assertions. At the `v3 → v4` pair they come apart — `FRONTIER_BODY_RULES` still requires
`claraWork_v3`, which build A (the v3 image) **carries** — so the file asserted a refusal that must not
happen. The drill's own header had already promised a v3→v4 pair would need no edit; that promise held
for the cutover legs and not for this one.

**Fix (this commit, `+97/−37` on that file).** The required bodies are now read from the rule table
itself — `frontierBodyViolations(frontierVersion, [])` — and nothing is assumed about the cut:

* build A's own frontier violations are asserted to be **exactly** the required bodies it lacks
  (empty at this pair, and the log says so out loud);
* the rule is still measured **by difference**, but the difference is now *constructed*: build A's
  roster minus the required bodies is a target that predates the rule, which is what the rule is
  about — and at the v2→v3 pair that subtraction removes nothing, so the old measurement is preserved
  exactly;
* the CLI leg drives that pre-rule roster through `--supported` (the third door) instead of
  `--target-bundle <A>`, because A's real artifact is no longer a pre-rule target. The positive
  control still reads build B's **real** bundle through `--json`.

**Second run: exit 0.**
`preflight frontier rule: database at 0209_preview_invite REFUSES a target without claraWork_v3; adding it clears the reason (build A itself CARRIES the required body, so its own verdict is allowed)`.

**Two stale sentences corrected with it** (neither file is frozen or manifest-locked):
`lib/rollback-preflight.mjs` and `scripts/rollback-preflight.mjs` both said `claraWork_v3` is "the
ONLY body" that obtains an egress authorisation and that the doors are called "from
claraWork.v3.impl.ts and nowhere else". `claraWork.v4.impl.ts:390,401` now calls them too. The rule's
`requires: ["claraWork_v3"]` is **unchanged and still correct** — it names the FLOOR, and policy (c)
means every later image carries v3 anyway, so naming v3 is what makes the rule refuse pre-v3 targets
and only those. `rollback-preflight.test.mjs`'s cell pins that literal and still passes.

### 7.3 · `rollback-preflight.test.mjs` — two cells that a shared database decides

Measured on two databases at the same commit; **no cell fails on both**, which is what makes the
reading a measurement rather than a hope:

| database | red cell | measured cause |
|---|---|---|
| `clara_wave_b_ci` (rigint2) | B2 (`a name scope may NOT allow while an out-of-scope body is stranded`) | two **non-terminal** `claraWork` runs left by earlier legs whose servers were SIGTERM'd — one `claraWork_v3` parked `awaiting_input`, one `claraWork_v4` whose task is already `completed`. The cell scopes `nameLike: "claraWork"` against `supported: ["claraWork_v1","chatTurn_v17"]`, so a refusal is the honest answer. B3 passes here. |
| `clara_unit_test` (rigint2) | B3 (`two sources sharing one task_kind count the task ONCE`) | the cell expects exactly ONE unbound row estate-wide; this database carries **19** (18 foreign `clara.document_processing_tasks` in `queued`, from other lanes' batteries). B2 passes here. |

Not wave-introduced: `rigint`'s own `clara_wave_b_ci` carries **three** non-terminal `claraWork_v3`
runs created 02:29–02:49 on 2026-09-17, hours before the first `claraWork_v4` run anywhere on that
database (05:24) — so the same cell reds there for a purely v3-era reason. This is
WAVE-DIGEST §5's shared-`clara_rt_test` hazard and the merge report's §8.3 "pre-existing cross-file
isolation gap", in its unit form. Not fixed here: the cell belongs to #637's lane and a fix is a
scoping decision, not a cut.

### 7.4 · Which cluster, and why not `rigint`

The World legs ran on **`rigint2` (`127.0.0.1:55601`)**, the clean comparison cluster the merge worker
built and explicitly left for the orchestrator (`integration-merge.md` §8.4): a genuine from-scratch
`pnpm db:migrate` (204 migrations) + `pnpm db:seed` (2 firms). `rigint`'s own `clara_wave_b_ci` and
`clara_rt_test` are the **documented-contaminated** template copies taken from an already-dirty
`clara_int` (§8.1: 795 firms, ~1790 stale `workflow_runs`), and six of the eighteen `db-live-gates`
legs read as FAILED against them purely from that backlog. Running the cut's evidence there would have
measured the rig. Nothing was reset, dropped, or re-migrated on either cluster;
`CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set; no second from-scratch chain
was applied anywhere. `clara_int` on `rigint` was not written to by this leg.

---

## 8 · Docs

* **`packages/runtime/README.md`** — a new "The three pins the wave 2026-09-15 cut moved" section
  (what each body carries, in one paragraph each, with its deploy order), the two contracts the cut
  could not deliver and why, the boot-line example repointed to the three current pins, the standalone
  `staff-expense-claim-e2e` paragraph corrected (it reads the bundle digest off the boot banner, so its
  "`clara-work/v3`" sentence is now "the bundle the image pins"), and the frozen-by-closure paragraph
  extended with this cut as the worked example **in both directions**.
* **`CONTEXT.md` — not edited, deliberately.** No term this cut touches changed meaning. The entries
  this cut makes *operative* rather than aspirational (**Dependent particulars question**, **Work
  question**, **Body roster**, **Stranded body**) were already written as the design and are true
  verbatim now; nothing in the file names a version, a tool roster or a contract status.
* **`docs/PRD.md` and `docs/ARCHITECTURE.md` — not edited** (WORK-ORDER §5 / owner ruling 2026-09-15).

### Blueprint drift this cut creates or settles

| pointer | claim | measured state after this cut |
|---|---|---|
| `docs/ARCHITECTURE.md:171` | pins are `chatTurn → chatTurn_v19`, `claraWork → claraWork_v3` | **Now wrong on both, and still silent on the third.** The pins are `chatTurn_v20`, `claraWork_v4`, `clientOnboarding_v5`. This is DECISIONS §3.2's own row, now realised. For the #683 blueprint sync. |
| `docs/ARCHITECTURE.md:207` | "`chatTurn` class … 当前 `chatTurn_v19`" | Same sentence, second occurrence — also `chatTurn_v20` now. **Not in DECISIONS §3.2's table**; added here. |
| `docs/ARCHITECTURE.md:264` | a `work-trace.mjs` hardening "只能随下一个冻结版本（`claraWork_v4`）交付" | The named next version **now exists** and does NOT harden the redaction logic — it only feeds `knowledge_version` into the existing `observed` object. The sentence's *rule* still holds; its example has been spent. Worth one word at the sync. |
| `docs/PRD.md:69` | prepayment amortisation is handled "through conversation, documents or Accounting directly" today | **Still false, and now for a stated reason** rather than a pending cut: the chat half was stopped at 0208's grant wall (§3). #653's drift row stands, unchanged. |
| `docs/PRD.md:122` | #654's remainder is 「界面或对话入口」 | The Work-lane half **is now shipped** (`ask_knowledge_conflict` + the knowledge-context read). The *chat-capture* half — capturing a firm-scope knowledge record from a conversation — is still not built and was never in a stanza. #654's drift row narrows rather than closes. |

---

## 9 · Unverified

* **Everything hosted.** No hosted run exists for any part of this cut; the wave-wide status is
  unchanged (WAVE-DIGEST §6).
* **The `--lock-deployed` ceremony has not run**, so the eighteen new manifest entries are hash-locked
  against `origin/main` but not deploy-locked. That is the correct state before the image is live.
* **`lib/capability-registry.mjs:30`** still says it is "reached from the FROZEN `claraWork_v3` body";
  `claraWork_v4` reaches it too. The file is `deployed: true` and hash-locked, so the comment cannot be
  corrected without superseding it — named, not edited.
* **The full `db-live-gates` battery was not re-run end to end.** Four legs were: `interview-e2e`,
  `version-cutover-e2e`, the new `chat-turn-v20-e2e`, `two-build-cutover-e2e`. The other fourteen were
  green at the merge report's own run and this cut changes no migration and no DB-facing runtime code
  outside the three bodies.
* **The apps/web browser suite was not re-run**: this cut changes no file under `apps/web` (`git
  status` is empty there), and parts-parity proves the reader still covers every emittable kind.
