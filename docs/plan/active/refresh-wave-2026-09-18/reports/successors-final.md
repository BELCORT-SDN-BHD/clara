# Wave 2026-09-18 — the successor cut (`chatTurn_v21`, `claraWork_v5`)

Cut ONCE on `integration/wave-2026-09-18` after the ten merges and the integration fix round, per
`SUCCESSORS-ORDER.md` and `DECISIONS.md` §1.1. Base `origin/main` = `abcc5030`.

**Last code commit: `a18c8e73`.** Six code commits, plus this report on top of them:

| commit | what |
|---|---|
| `4e2309f6` | the eleven body files + `registry.ts` + the frozen manifest + the parity-exemption rows + the freeze-lint attribution rosters + two repointed pin cells |
| `e8ad2929` | 56 new unit cells and the parts-parity census the cut moved |
| `5f2dfded` | `startWorld`'s missing v5 banner and `build-info`'s identity list — **a real defect of the cut**, §7.1 — plus `packages/runtime/README.md` |
| `c1c21293` | the new `chat-turn-v21-e2e` World leg + its serve harness, registered in the live-gates action (23 legs) |
| `956ae8bb` | three corrections the battery found: the v21 leg's replay leg was testing a false property, its run-lane probes spoke for other runs, and `work-egress-e2e` pinned the pre-v5 trace shape |
| `a18c8e73` | the build-info bundle census, which names five now and reads the array as a list rather than as a string |

> **FIX ROUND 1 CHANGED SOME OF WHAT IS BELOW.** The three review lenses returned one blocker and
> sixteen further findings; `reports/successors-fixround-1.md` is the record, and the claims this
> report made that were wrong have been corrected IN PLACE here (each one says so, with the finding
> id). The fix-round commits are `c4136de8`, `4c110b89`, `d97df49b`, `7417029d`, `0008849c` and the
> report commit on top of them. Where this report still says "measured", it was re-measured after
> those commits.

**#658's conditional chat stanza (SUCCESSORS-ORDER §1.4) was TAKEN, not reduced to contract-only.**
It landed with its cells green and its World leg green, and it registered NO part kind — §3 records
the measurement that settled that.

---

## 1 · What each body carries

### `chatTurn_v21` — five files, copies of v20's shape

`chatTurn.v21.{ts,impl,prompt,tools,usage}.ts`. `buildToolsV21 = Object.assign({}, buildToolsV20(ctx,
modelId, segment), {…two literal keys})`. Engine stamp `llm-openai:<modelId>:chatturn-v21`.

| carries | how |
|---|---|
| `start_trade_invoice_work` (#655) | Schema, `localTradeInvoiceRefusal`, `tradeInvoiceFromInput`, `journalBasisFromInput` and the eighteen-token `TRADE_INVOICE_REFUSALS` all imported from `packages/runtime/lib/trade-invoice-basis.ts`. Door: `clara.admit_trade_invoice_work($1 clientId, $2 ctx.createdBy, $3 intentKey, $4 input.kind, $5::jsonb particulars, $6::jsonb basis, $7 input.basis_origin, $8::jsonb [{kind:'chat_task',task_id,session_id}], $9 modelId)` — **nine arguments, in the carrier's order**. `intentKey = stableOpKey(ctx.taskId, TOOL, input)`. Session read from the task, never from a model argument. A REPLAY returns `invoice_id` alone, so `counterparty_id` / `due_date` / `due_date_source` come back **null rather than invented**; `kind` is safe to echo because a differing kind raises `intent_payload_conflict` first. Mints the existing `work_accepted`; `WORK_ACCEPTED_PURPOSES` stays at three. |
| `run_depreciation_period_for_client` (#651) | Schema, `depreciationRunDoorArgs`, `localRunRefusal`, `refusalSentence`, `runSummary`, `floorSentence` from `packages/runtime/lib/depreciation-run.ts`. Door: `clara.run_depreciation_period_for($1::uuid, $2::date, $3::text, $4::uuid)` = `(p_client, p_through, p_op_key, p_obo)`. `clara.run_depreciation_manual` is named in PROSE (the floor sentence) and **never called** — `rig-meta.mjs:691-693` is an executable census that fails the moment the human verb reaches a machine role. A `client_id` disagreeing with the conversation's pin is refused **CLR03 `client_not_in_conversation` before any round trip** — a provenance wall, not a business rule: silently substituting the pin would run a period on a client the model did not name. `{pending:true}` from `_reserve_op` answers `ok:true, in_flight:true, periods_run:0` and mints no CLR of its own. **No part kind and NOT in `hasCodingIntent_v21`** — §3. |
| `loadClientBasisStepV21` (#658 (B), TAKEN) | A SIBLING step beside the byte-untouched `loadContextStepV10`, which is still called for the history and the context pack. Reads `clara.retrieve_knowledge` with `p_purpose='chat_turn'` at `p_limit=60` through `lib/knowledge-retrieval.mjs`. **Corrected in fix round 1 (ADV-S-5):** asking for sixty and PRINTING forty is not "the block does not shrink at the repoint", which is what this row claimed while `renderRetrievedKnowledge` capped every lane at 40 records and 200 value characters. The lane now passes its own caps, both imported from v19's `KNOWLEDGE_CONTEXT_MAX_RECORDS` / `_VALUE_CHARS` (60 / 300), and `records_shown` / `truncated` describe the BLOCK rather than the door's answer. Answers `{status, reason, face_status, knowledge_version, as_of, records_shown, truncated, text}` and **never collapses to null**; `faceStatusOf` is the one mapping between the runtime's two frozen words and the estate's four. `clara.get_context_pack` is NOT recut and NOT repointed — a cell greps the closure's CODE (comments stripped) for both door names and finds neither. |

`SYSTEM_PROMPT_V21` = `SYSTEM_PROMPT_V20` + three paragraphs, byte for byte (cell). `ClaraPartV21`
IS `ClaraPartV20` — no new wire kind.

### `claraWork_v5` — six files

`claraWork.v5.{ts,impl,tools,prompt,errors,bundle}.ts`. Roster `CLARA_WORK_TOOL_NAMES_V5` = v4's five
+ `read_knowledge_source` + `read_knowledge_history`; `openWorkQuestionStep`,
`emitWorkQuestionStepV3`, `emitWorkStatusStepV3`, the whole #639 particulars pair and
`findQuestionCallV4` stay IMPORTS.

- **`loadWorkKnowledgeStepV5(clientId, firmId, asOf, purpose, taskId, runId)`** — the stanza's four
  arguments FIRST, in its order; `taskId`/`runId` follow because the recorder needs them and a WDK
  step's argument list is part of its journal shape. `retrieveKnowledge` → `clara.retrieve_knowledge`
  at `WORK_KNOWLEDGE_DEFAULT_LIMIT` 40, purpose `accounting_work`; then
  `recordWorkKnowledgeRead` → `clara.record_work_knowledge_read` with the key set ACTUALLY returned
  and the estate's FACE word. **It records its own next seq on a divergent replay**: a
  `replayed:true, payload_match:false` answer means the estate holds a row that is not what this
  attempt saw, so the step takes seq+1 (bounded at 4, and it converges — the third execution matches
  what the second wrote). A failure to WRITE the row sets `recorded:false` and nothing else, and
  **`read_seq` answers `null`** when nothing landed — a failed first write, or a fourth seq that
  still diverged (fix round 1, ADV-S-12(a); it used to answer the last seq it TRIED). The row it
  writes carries the counts the BLOCK printed, not the door's (ADV-S-5(c)).
- **`knowledge_read_failed`** — settles `failed`/`internal`, recoverable, nothing posted, on ANY
  `{status:'unavailable'}` answer. Extracted as the pure predicate `knowledgeReadFailedV5` so the
  cells drive it: TRUE over all five frozen reasons, FALSE for `{status:'ok'}` with `tiers.core: 0`
  and for `truncated:true`. A cell greps all three v5 files, **comments included**, for
  `core_readable|core_unreadable|core_ok|tiers.core === 0` and finds none — the integrator was told
  twice not to write a per-tier signal, and this is the cell that would catch it being added back.
- **The block NAMES its records** — fix round 1's blocker (ADV-S-1). `renderRetrievedKnowledge`
  printed key, value and trust and no id, so `read_knowledge_source`, `read_knowledge_history` and
  v4's still-rostered `ask_knowledge_conflict` — three tools whose only identifier is a `record_id`
  the model can learn nowhere else — were rostered, hashed and unreachable, while three sentences
  the model reads promised the id would be there. The line carries `record_id` again, with the
  `in force` / firm-scope / `applies_when` / `source` marks v19 and v4 both printed.
- **`read_knowledge_source` / `read_knowledge_history`** — one shared `.strict()` schema
  `{record_id: uuid, reason: 1..500}` carrying **no firm and no client**; those come from the Work
  row. Doors `clara.read_knowledge_record_for` / `clara.read_knowledge_history_for` called with
  NAMED args `(p_firm => ctx.firmId, p_client => ctx.clientId, p_record => input.record_id)`. CLR11 →
  `record_not_in_scope`, CLR03 → `no_pack_context` (refused LOCALLY, before any round trip, because
  it is a fact about the RUN), anything else keeps the door's message VERBATIM. They run on
  `pools().withRuntime`, not the wake-scoped path: 0230 grants these doors to `clara_runtime` and
  nobody else, so a wake-scoped call would answer 42501. Spend `budget.toolCalls`, mint no part,
  return no document bytes, and set no terminal — a read that refuses is a fact to reason about.
  **What they leave behind (fix round 1, ADV-S-2):** nothing in `clara`. The stated `reason` is no
  argument of either door, `clara.work_knowledge_reads` records the PRELOAD only, and
  `clara.work_execution_traces` has no free payload column by design — so the reason lives in the
  run's own journal. Three places claimed otherwise, including the schema's model-facing
  `.describe()`; all three now say what is true, and the durable per-read row is a RATIFICATION
  REQUEST (it needs a migration that tells the two kinds of read apart, because 0230's
  `_work_knowledge_drift_core` reads the latest read-set row's keys as the run's whole read-set).
- **Drift replan** — `readKnowledgeDrift` → `clara.work_knowledge_drift_for(p_firm, p_work)`, asked
  ONCE per resume, AFTER the authority recheck and BEFORE the next segment — and **only when a next
  segment exists** (fix round 1, ADV-S-3: on the LAST segment's resume the row's seq
  `segmentTraceBase(budgets.segments)` IS `SETTLE_TRACE_SEQ`, and the settle's own row was then
  dropped by `on conflict do nothing`, silently). It traces under its OWN capability id,
  `accounting_work.read_knowledge_drift` (ADV-S-10). `driftSpendsReplanV5` is
  the pure predicate: only `relevant === true` spends one EXISTING `budget.replans`; `relevant:null`
  (`observed_from:'trace'`) and an unreadable drift are SURFACED and spend nothing. `driftNoteV5`
  writes three DIFFERENT sentences for the three facts (a cell asserts they are three). With the
  allowance already gone and a relevant drift, the run settles `failed`/`limit` — recoverable — rather
  than re-planning outside the budget that bounds re-planning. **Budgets do not move** (cell:
  deep-equal against v4's).
- **Rider #847** — `boundedRevisionNumber` over every NUMERIC observed revision and `boundedRunId`
  over the run id, applied in `traceRow`/`traceSafely` **before** the write, through the new sibling
  `lib/work-trace-bounds.mjs`. A refused number drops its KEY (`observedRevisions`' own contract); a
  refused run id skips the WHOLE row, which is not tighter than the door (the door would refuse it)
  and is safer inside the settle's transaction. `lib/work-trace.mjs` is NOT opened.
- **Rider #882(a)** — ONE row: `(CLR40, fa_cost_adjustment_deferred) → refusal`, carrying 0041's own
  remedy verbatim. A cell proves the Work settles `refused`/`tool_error`/recoverable where v4
  settled `invariant`/not-recoverable, and that the other two CLR40 reasons are byte-identical to
  v4's classification.
- **Bundle `clara-work/v5`**, digest `fe64198207d5082c06eff21b7cf7193c9a6dc03254f871cc1bdda5752bedc698`
  (it was `b9f25a81…1cc17114` when this report was first written; fix round 1 re-worded one
  `.describe()` the model reads and the digest moved, which is §2's claim paying out).
  §2 is its own section, because it is the first time this class has met ARCHITECTURE:435-445.
- **Trace scheme** — v5 is the first cut in this class to move it: seq 1 claim, **seq 2 the
  knowledge preload**, `3 + index*4 + {0 drift, 1 dispatch, 2 model_call, 3 tool_call}`, settle at
  `3 + segments*4 = 19`. v1–v4's knowledge read and particulars pair wrote no rows at all because
  there was no free seq; widening the block is the honest alternative to wedging them in. Every row
  records `registry_version = clara-capability-registry/v2` with an EXPLICIT purpose from
  `purposeForV2` — `lib/work-trace.mjs` defaults purpose from v1's `capability()`, which answers null
  for the THREE new ids (the third is the drift read's, added in fix round 1), and a null purpose on
  a model-bound row is the field an auditor most needs.

---

## 2 · The bundle digest finally covers a tool's schema (ARCHITECTURE:435-445)

Binding on `claraWork_v4` since #791; v4 shipped `tools: {id, names}` and did not meet it. v5's
block is `{id, names, schemas, dependencies}`:

- `schemas[name]` — the tool's input JSON Schema, from zod 4.4.3's own `z.toJSONSchema` over the
  very object the builder hands to `tool({inputSchema})`. `target: "draft-07"` and `io: "input"` are
  **pinned rather than defaulted** (the defaults are draft-2020-12 and `"output"`), so a library
  default moving cannot move a digest that is supposed to change only when a contract does.
- `dependencies[name]` — the doors that tool reaches, declared. The three execute-less question
  tools name `clara.open_work_question` because that is the door their CALL causes the workflow to
  reach.

The canonical hashed text goes from **10,217 bytes (v4) to 22,429 (v5)** — that is the coverage
arriving, measured rather than asserted. (22,375 at the first cut; fix round 1's one corrected
`.describe()` added the rest and moved the digest with it.)

**AND WHAT THE DIGEST STILL CANNOT SEE, measured in fix round 1 (ADV-S-4).** `z.toJSONSchema`
renders STRUCTURE and erases `.refine` / `.superRefine` entirely, so a rule that lives in a check
contributes nothing to the hashed text. The roster carries exactly one — `ask_question.fields[]`'s
"`options` is required for `choice` and forbidden for everything else", which is #791's own example
of a schema changing under an unchanged name. Three cells now stand where the digest cannot: one
asserts the JSON Schema is byte-identical with and without that rule (the limit, as a measurement,
not a memory), one censuses which roster schemas carry an unrepresentable check so a NEW one must be
declared, and one drives the rule's behaviour so relaxing it reds. The header's general sentence is
true of every item it lists and is not true of everything a schema can say; both texts now say so. Two cells carry it: one deep-equals every hashed schema
against `z.toJSONSchema` of the BUILT tool's `inputSchema` (the hashed schema IS the served schema);
the other tightens one bound on one schema, leaves the roster and the `tools.id` untouched, proves
the digest moves — and proves the **v4-shaped projection of the same change is byte-identical**,
which is the measurement of what #791 reported.

The declarations live in `claraWork.v5.prompt.ts`, not beside the builder: the bundle must read them
while the tools module must read the bundle's DIGEST, and a cycle across a frozen closure is a
load-order bug waiting for the WDK's VM to find it. The split is declare / hash / build, one arrow
each way.

---

## 3 · What was NOT cut, and the measurement that stopped it

| Contract | Ticket | Measured |
|---|---|---|
| `knowledge_unavailable` part kind | #658 (B) | **NOT registered, and the finding that would have justified it is answered rather than ignored.** The stanza's finding — `knowledge_receipt` has no status field, `refusal` has no version/as-of/key-set/partial distinction — is true, but it assumes a PART is owed at all. The chat-lane read is a STEP, not a tool, and a card would address a row that does not exist: `clara.work_knowledge_reads` is the WORK lane's relation, written by `clara.record_work_knowledge_read` off an `accounting_work` join a chat turn has no row in. The card could only carry remembered text, which is the one thing every part shape in this estate refuses to do. The typed status rides in the step's answer and the failure is spoken in the block (`renderRetrievedKnowledge` prints "the read did not succeed" plus "Do NOT tell anybody that this client has no recorded knowledge"), which is #603's closure in the one place the model can act on it. `loadKnowledgeContextStepV19` registers no kind either. **Parts-parity: the same six emittable kinds as `origin/main`.** |
| a part kind for `run_depreciation_period_for_client` | #651 | Three existing kinds measured and each refused BY NAME: `entry_posted` needs a `clara.entry_post_receipts` row and the FA poster writes none (0041/0042, never 0106's core) — and one run clears up to twelve periods, so one card could not address them anyway; `agent_receipt` hydrates `clara.agent_receipts_visible`, a union of the SEVEN shims at 0103:294-301, and this door finishes through `clara._finish_op` into `clara.op_receipts`, which is not a registered surface; `work_accepted` would name an `accounting_work` row and depreciation never reaches the Work lane (0195:1711 / live 0204:180 stay closed). #651's stanza forbids a new kind. Consequence, and the thing a later reader will question: the tool is therefore **OUT of `hasCodingIntent_v21`**, because C-19's remedy sentence — "the coding could not be completed into a review card this turn" — would be FALSE beside charges that were in fact posted. The World leg asserts that refusal is absent from a turn that posted. |
| a part kind for the two v5 reads | #658 (A) | Forbidden by the stanza; measured absent by a cell that greps the code region. |
| `read_opening_source` | #656 | Its own stanza: "a future `chatTurn_vN`, **NOT this wave's v21**" — it appears in no row of DECISIONS §1.2. Cell asserts absence by name. |
| `open_intake_batch` | #636 | Contract-only (D5). Cell asserts absence by name. |
| `read_client_financial_pack` | #660 | Follow-up text only, no stanza authored. Cell asserts absence by name. |
| `start_prepayment_schedule_work` / `read_prepayment_source` | #653 | Unchanged grant wall, re-measured: `clara.get_prepayment_schedule` and its siblings are `clara_authenticated`-only (0223 §D.1). **v5's frozen "no source document" sentence is therefore byte-unchanged from v4's** — softening it would license citing a source the run cannot read. Cell pins the sentence. |
| `record_counterparty_alias` | #647 | No OBO twin exists (D11). Cell asserts absence by name. |
| `documentIngest_v3`, `bankAgent_v2`, `autoDraft_v11`, `clientOnboarding_v6` | — | DECISIONS §1.1: not cut this wave. |

---

## 4 · The exact registry diff

Ten edits, five per body — the five `registry.ts` itself documents, and `registry-view.test.mjs`
reds on each one left out:

```
+import { chatTurn_v21 } from "./chatTurn.v21.js";
+import { claraWork_v5 } from "./claraWork.v5.js";
-  chatTurn: chatTurn_v20,
+  chatTurn: chatTurn_v21,
-  claraWork: claraWork_v4,
+  claraWork: claraWork_v5,
+export { chatTurn_v21 };
+export { claraWork_v5 };
+  "chatTurn_v21",          (workflowBodies)
+  "claraWork_v5",          (workflowBodies)
-  chatTurn: "chatTurn_v20",
+  chatTurn: "chatTurn_v21",
-  claraWork: "claraWork_v4",
+  claraWork: "claraWork_v5",
```

**v1…v20 and v1…v4 stay imported, exported and rostered.** No export removed, no roster entry
removed — the stranded-body gate refuses World startup database-wide otherwise, and the boot line
measured on the rig reads `bodies=55 … stranded bodies n=0`.

---

## 5 · The manifest diff

`node scripts/check-frozen-workflows.mjs --update` (locally, never under `CI=true`), then
`--compare-base origin/main`: **296 existing entries retain the same hash and deployed flag; 16
additions; 0 mutations; 3 recorded retirements.** 296 → 312.

| new entry | why it is in the manifest |
|---|---|
| `workflows/chatTurn.v21.{ts,impl,prompt,tools,usage}.ts` | marked `@frozen` |
| `workflows/claraWork.v5.{ts,impl,prompt,tools,errors,bundle}.ts` | marked `@frozen` |
| `lib/trade-invoice-basis.ts`, `lib/depreciation-run.ts` | **by closure** — `chatTurn_v21` imports them (intended; both modules' own footers said so) |
| `lib/knowledge-retrieval.mjs` | **by closure** — imported by BOTH `chatTurn_v21` and `claraWork_v5`, which is why it alone is reached by two classes |
| `lib/capability-registry-v2.mjs`, `lib/work-trace-bounds.mjs` | **by closure** — `claraWork_v5` imports them |

`retired` is byte-identical. The freeze-lint self-test's `#815` per-entry attribution rosters grew
and were re-measured, not re-guessed — and one row is worth reading: `lib/knowledge.mjs` is STILL
reached by both new bodies, transitively, because v21's prompt re-exports v19's knowledge helpers
and v5's impl imports v4's. The repoint is about which DOOR the running code calls; a closure is
reachability, not intent. Three new baseline rows were added for the three new modules so the NEXT
cut's growth is measured against something written down.

---

## 6 · Every command, with its counts

| command | result |
|---|---|
| `pnpm typecheck` | **exit 0** — `packages/runtime: Done`, `apps/web: Done` |
| `pnpm lint` | **exit 0** — freeze-lint + its three self-tests, the sibling checkers, eslint in all four workspaces, `apps/web`'s `check-token-contrast` / `check-test-manifest` / `check-message-keys` / `check-ui-add-guard.selftest`, and the root guard battery |
| `node scripts/check-frozen-workflows.mjs` | **exit 0** — `312 frozen file(s) verified`, `55 "use workflow" module(s) all frozen+registered`, 3 retired |
| `… --compare-base origin/main` | **exit 0** — `296 … same hash and deployed flag; 16 addition(s)` |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **exit 0** — emittable `{freeform_result, work_accepted, work_status, work_result, work_question, knowledge_receipt}` — **the same six as `origin/main`, no new kind**; `work_accepted` gains a site in `chatTurn.v21.tools.ts` and `work_result` one in `claraWork.v5.impl.ts` (the census pins the FILE; this row named a line number that no longer held after the first edit — review S2) |
| `pnpm --filter @clara/runtime build` | **exit 0** (nitro; `.output/server/index.mjs` 10.8 MB, 55 workflows) |
| `node scripts/check-workflow-bundle.mjs` | **exit 0** — `12 pinned class(es) … 55 superseded body(ies) still ship for parked runs, chatTurn pinned at v21 with its step directive, engine stamp and freeform_result emitter (40 checks)` |
| `node --test tests/{chat-turn-v21-tools,clara-work-v5}.test.mjs` | **64 pass / 0 fail** (26 + 38) after fix round 1's cells; it was 56 (24 + 32) at the first cut |
| `node --test tests/{registry-view,work-bundle,clara-work-v4,chat-turn-v20-tools}.test.mjs` | **65 pass / 0 fail** (7 + 17 + 25 + 16, re-measured in fix round 1 — this row said 58, which was simply wrong when it was written; review S1) |
| `node --test tests/p6-1-parts-parity.test.mjs` | **22 pass / 0 fail** (after the census gained its two sites) |
| **`node --test "tests/**/*.test.mjs"`** (whole runtime suite, `clara_rt` 55721) — run THREE times | **2788 tests · 2767–2768 pass · 4–5 fail · 16 skip · ~35 s**, the spread being which of the wake-engine flake's two variants fires — §7.2 |
| **`node scripts/run-tests.mjs`** (whole `apps/web` unit suite) | **4628 tests · 4626 pass · 0 fail · 2 skip · 68.8 s · exit 0** |
| World e2e battery, all 23 legs | §7.1 |
| `pnpm --filter @clara/web e2e` (chat + Work walks, 3400/3401/3402) | §7.3 |

---

## 7 · Evidence in detail

### 7.1 · The World battery — and the defect it found

**Two clean runs are reported, and the FIRST one is why there are two.** The battery was built on
a purpose-made cluster each time (`mkrig.sh`, migrate 228, seed 2, world-bootstrap, then
`clara_wave_b_ci` and `clara_rt_test` cut as TEMPLATE COPIES at the pristine moment — the CI
action's own idiom, and the reason 0154 forbids a second from-scratch chain on one cluster). The
first run, on `rigint4`, failed SEVEN work-lane legs.

**THE DEFECT, AND THE SHAPE OF IT.** Every one of the seven reported *"serve child did not become
ready (/health + /ready 200)"* — a sentence about the HTTP boundary, and false. Spawning the harness
by hand and probing showed the engine perfectly healthy: `/health` 200, `/ready` 200 with every
check ok, `stranded bodies n=0`, and a provenance line reading `bodies=55 … chatTurn=chatTurn_v21
claraWork=claraWork_v5`. What was missing was ONE LOG LINE. `plugins/startWorld.ts` emits a bundle
banner per RETAINED claraWork body and stopped at v4; every spawned-engine e2e reads the PINNED
bundle's banner through `tests/pinned-work-bundle.mjs` and blocks in `waitBooted` until it appears —
and `waitBooted`'s throw is swallowed by the caller's own retry loop, so only the outer deadline's
message ever surfaced. A missing banner is therefore a silent, MISATTRIBUTED failure of the whole
work-lane battery. `5f2dfded` adds the line, `build-info` gains the same identity, and both call
sites now carry the comment that says why the next cut adds its line in the same commit as its pin.
`work-journal-e2e` passing on a pristine database is the control.

**The final run, on `rigint6`, at head `a18c8e73`: 23 of 24 green.**

| # | leg | db | result |
|---|---|---|---|
| 1 | `intake-e2e` | `clara_intake_ci` | **PASS** (4 s) |
| 2 | `intake-admission-e2e` | `clara_intake_ci` | **FAIL in the battery, PASS alone twice** — §7.1.1 |
| 3 | `intake-batch-e2e` (#636) | `clara_intake_ci` | **PASS** (140 s) |
| 4 | `interview-e2e` | `clara_wave_b_ci` | **PASS** (82 s) |
| 5 | `interview-kill-resume-e2e` | `clara_wave_b_ci` | **PASS** (41 s) |
| 6 | `version-cutover-e2e` | `clara_wave_b_ci` | **PASS** (7 s) |
| 7 | `work-journal-e2e` (#623) | `clara_wave_b_ci` | **PASS** (24 s) |
| 8 | `work-question-e2e` (#629) | `clara_wave_b_ci` | **PASS** (44 s) |
| 9 | `work-cancel-e2e` (#630) | `clara_wave_b_ci` | **PASS** (32 s) |
| 10 | `periodic-adjustment-e2e` (#643) | `clara_wave_b_ci` | **PASS** (11 s) |
| 11 | `fixed-asset-acquisition-e2e` (#639) | `clara_wave_b_ci` | **PASS** (13 s) |
| 12 | `staff-expense-claim-e2e` (#638) | `clara_wave_b_ci` | **PASS** (25 s) |
| 13 | `trade-invoice-e2e` (#655) | `clara_wave_b_ci` | **PASS** (11 s) |
| 14 | `work-egress-e2e` (#631) | `clara_wave_b_ci` | **PASS** (7 s) — its trace-shape cell moved with v5's scheme, §7.1.2 |
| 15 | `chat-turn-v19-e2e` | `clara_wave_b_ci` | **PASS** (15 s) |
| 16 | `chat-turn-v20-e2e` | `clara_wave_b_ci` | **PASS** (8 s) |
| 17 | **`chat-turn-v21-e2e` (NEW)** | `clara_wave_b_ci` | **PASS (5 legs)** (7 s) — §7.1.3 |
| 18 | `plan-occurrence-e2e` (#640) | `clara_wave_b_ci` | **PASS** (16 s) |
| 19 | `accrual-e2e` (#652) | `clara_wave_b_ci` | **PASS** (22 s) |
| 20 | `prepayment-occurrence-e2e` (#653) | `clara_wave_b_ci` | **PASS** (7 s) |
| 21 | `opening-ledger-source-e2e` (#656) | `clara_wave_b_ci` | **PASS** (1 s) |
| 22 | `work-knowledge-e2e` (#658) | `clara_wave_b_ci` | **PASS** (0 s) |
| 23 | `two-build-cutover-e2e` (#637) | `clara_rt_test` | **PASS** (37 s) |
| 24 | `body-census-guard-db.test.mjs` (world guard, LAST) | `clara_rt_test` | **PASS** (6 s) |

**Legs 15 and 16 are the ones worth naming**: `chat-turn-v19-e2e` and `chat-turn-v20-e2e` run their
PREDECESSOR closures against this image, so a successor that broke a predecessor's lane would red
there rather than here. Both green. Leg 23 is the two-build cutover, which builds a second image
pinned at the PREDECESSOR body and drives a run across the pair — green on this chain.

#### 7.1.1 · `intake-admission-e2e` — a Windows spool-rename race, not this cut

`EPERM: operation not permitted, rename '…\spool\intake-<id>.json.<pid>.<ts>.tmp' → '…json'` in the
intake spool, under `%TEMP%`. **Run ALONE it passes, twice in a row**, and the leg names neither
`chatTurn` nor `claraWork` (grep count: 0). It passed in the battery on `rigint5` and failed on
`rigint4` and `rigint6` — the same code, three clusters, two outcomes. It is the Windows host's
file-rename race under battery load, in a lane this cut does not touch. Same class as RIG.md's two
standing host reds.

#### 7.1.2 · `work-egress-e2e` — v5's trace scheme, and three assertions that moved with it

The leg pinned the trace shape v1…v4 had. v5 widened the seq scheme so the knowledge preload gets
its own row, so a run now traces one `tool_call` BEFORE its first dispatch. Three assertions moved,
each saying why in the file: the phase order is asserted as a SUFFIX plus one named row ahead of it
(so a future body may add a row without re-pinning a count); the segment's tool row is found BY
CAPABILITY rather than by phase, because "the only `tool_call` in the run" stopped being a way to
name it; and `registry_version` is DERIVED from the pinned bundle id rather than retyped, because it
is `clara-capability-registry/v2` from v5 on. The leg also now asserts the preload row's capability
id, registry version and purpose positively — so the scheme change is evidence rather than a
tolerated difference.

#### 7.1.3 · `chat-turn-v21-e2e` — and the two defects it had before it was trustworthy

Five legs, all green, **three consecutive runs stable**:

1. one turn admits a trade-invoice Work through `clara.admit_trade_invoice_work`; one
   `clara.trade_invoices` row lands with the party the DOOR resolved, the source ref names the REAL
   chat task and session, and `claraWork_v5` runs it to one approved entry and one committed receipt.
2. **the replay** — see below.
3. `run_depreciation_period_for_client` reaches `clara.run_depreciation_period_for` (a
   `clara_runtime`-ONLY door, so arriving at all is the grant measured rather than assumed) on the
   conversation's own client, with the `through` the model gave, and charges NOTHING on an empty
   register. The audit row is the evidence; a grant refusal would have left none.
4. #658's read in both lanes and in the durable row: the bounded block reaches the CHAT prompt and
   the RUN prompt (probes INSIDE the model, because only the model can say the block arrived), the
   run leaves a `work_knowledge_reads` row at seq 1 carrying `["sst_regime"]` at face word `ok`, the
   preload traces under `clara-capability-registry/v2`, and `read_knowledge_source` answers with the
   record's own envelope (`record`, `key`, `source`, `source_document` — and NOT bytes).
5. the transcript carries EXACTLY ONE `work_accepted`, and C-19 did NOT append its
   incomplete-coding refusal — the depreciation tool's absence from the intent signal, measured
   from the side that would have been embarrassing.

**Two defects in the leg itself, both mine, both corrected in `956ae8bb`:**

- **The replay leg was testing something FALSE.** It drove a SECOND CHAT TURN with the same payload
  and expected one Work. But the intent key is `stableOpKey(ctx.taskId, TOOL, input)`, and a second
  turn carries a different task id — so it mints a different key and the door admits a second Work,
  *correctly*, because two turns are two requests. The property #655's stanza claims is that a
  REPLAYED CALL under one identity re-reserves, and the only place a World leg can produce that is
  inside ONE turn. The scripted model now calls the admission tool twice with a byte-identical
  payload, and the leg asserts a CONTROL first — that the model really did call it twice — before
  counting one Work, one invoice row, one receipt, one card. Without the control the count would
  have passed for the wrong reason.
- **The run-lane probes spoke for runs that were not this leg's.** These legs share throwaway
  databases that carry every earlier run's Works, and a fresh engine's reconciler dispatches one;
  that run reached the same script, read the same env-supplied record id against ANOTHER firm, and
  was correctly refused `record_not_in_scope`. The leg reported the stranger's refusal as its own
  tool failing — intermittently, which is the worst way to be wrong. Every run-lane probe is now
  gated on this leg's client id, which the run envelope names verbatim.


### 7.2 · The runtime unit suite

**2788 tests · 2767 pass · 5 fail · 16 skip** on the final run. The suite was run THREE times; the
reds are the named baseline every time, each re-run ALONE, and **not one of their files imports a
v21 or v5 module** (measured with a grep over the five):

| red | alone | verdict |
|---|---|---|
| `intake-unit` — scanner rejects EICAR, encrypted PDF, XML entity expansion | red alone | **#693**, named in RIG.md as one of two reds to ignore and never "fix" |
| `pg-tools-fixture` — `(#806)` this host's own probe: pg_dump/psql on PATH | red alone | there is no `pg_dump` on this Windows host at all; PostgreSQL lives in WSL. DECISIONS §6.3's named row |
| `rollback-preflight` — `637.pf: B3` | red alone | shared-database contamination, the same cell and the same cause the 2026-09-15 cut recorded in its §7.3 |
| `wake-engine` — `M1` (a different variant on each run) | **GREEN ALONE (32/32)** | the whole-suite flake DECISIONS §6.3 names |
| `relay-runner` — kill-mid-stream (red on the first pass, absent on the second) | **GREEN ALONE (4/4)** | same list |

**The suite is what caught three of this cut's four own misses** — `p6-1-parts-parity`'s literal
census, the two pin cells that asserted the superseded pin as a string literal, and
`l9-build-info`'s `bundles: [...]` census (which the SECOND whole-suite run surfaced, after the
banner fix changed that file). The World battery caught the fourth and worst, the missing banner.
That is the 2026-09-15 lesson paid again: a grep is not a census, and a targeted run is not the
suite.

### 7.3 · The browser walks

`pnpm --filter @clara/web e2e` on the **3400 / 3401 / 3402** triple
(`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3400`, `CLARA_E2E_NEXT_PORT=3401`,
`CLARA_E2E_RUNTIME_PORT=3402`), over the nine chat and Work walks — `chat-parity`, `journal-work`,
`work-cancel`, `work-knowledge`, `work-list`, `work-question`, plus the three surfaces this cut's
two tools and its repointed read belong to (`trade-invoice`, `depreciation`, `knowledge`):

**116 passed · 0 failed · 4.6 min · exit 0.**

The known `use-clara-thread-stop` flake (DECISIONS §6.2.2 NF-2) did not fire on this run.


---

## 8 · Docs

- `packages/runtime/README.md` — a "two pins the wave 2026-09-18 cut moved" section; the boot-line
  example repointed to `chatTurn=chatTurn_v21 claraWork=claraWork_v5`; **three sections corrected
  because their future arrived**: #658's three modules are frozen now (with the 296 → 312 additions-only
  number), the "Requirements carried by the next frozen `claraWork` version" list is retitled **ALL
  THREE TAKEN** with #847's two rows and #791's row each naming what v5 actually does, and #653's two
  owed contracts now say that v21/v5 were cut and took neither, for the measured grant-wall reason.
- `.github/actions/db-live-gates/action.yml` — the new `chat-turn-v21-e2e` step, after its v20
  sibling, with the five legs and the skip conditions written out. **23 legs registered.**

### Blueprint drift this cut creates or settles

| pointer | claim | state after this cut |
|---|---|---|
| `docs/ARCHITECTURE.md:171` and `:207` | pins are `chatTurn → chatTurn_v20`, `claraWork → claraWork_v4` | **Now wrong on both** — `chatTurn_v21`, `claraWork_v5`. (The 2026-09-15 cut left the same row; it was never synced.) For the blueprint sync; this cut does not edit PRD or ARCHITECTURE. |
| `docs/ARCHITECTURE.md:264` | a `work-trace.mjs` hardening "只能随下一个冻结版本（`claraWork_v4`）交付" | The rule holds and its example is now spent TWICE: v4 did not take it, **v5 did** — through a sibling module, with `work-trace.mjs` unopened, which is what #815's ruling actually asked for. |
| `docs/ARCHITECTURE.md:435-445` | the coverage requirement, "[已记录，未实现——铸造 `claraWork_v4` 时执行]" | **Implemented, on v5.** §2. The bracketed status line is now stale. |
