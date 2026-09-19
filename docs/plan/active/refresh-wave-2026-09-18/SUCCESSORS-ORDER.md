# Successor cut order — wave 2026-09-18 (`chatTurn_v21` + `claraWork_v5`, cut ONCE on the integration branch)

Runs only after `reports/integration-merge.md` records §3's gates green and the orchestrator has reviewed it.
Worktree `C:\Users\zhant\Desktop\clara-wt\int`, branch `integration/wave-2026-09-18`; rigs `rigint` 55720 /
`clara_int` (db) and `rigrt` 55721 / `clara_rt` (runtime World legs). Authority: `DECISIONS.md` §1 (frozen-body plan),
§6 (part-kind rule, #658's chat stanza is conditional), §6.2 (ratifications), and `reports/WAVE-DIGEST.md` §4 — the
VERBATIM stanzas. Read `../refresh-wave-2026-09-15/reports/successors-final.md` first: copy its shape and its
discipline (measured digests, registry diff printed, every prior version kept exported).

## 1. `chatTurn_v21`

1. Copy v20's five files to `chatTurn.v21.{ts,impl,prompt,tools,usage}.ts`; the ONLY behavioural differences are
   the tool map `buildToolsV21 = Object.assign(buildToolsV20(...), {…})` and, if §1.4 is taken, one sibling step.
2. Register **`start_trade_invoice_work`** from `packages/runtime/lib/trade-invoice-basis.ts` (#655's carrier; digest
   §4 #655 — schema, nine-argument door order, deterministic op key, the eighteen-token refusal map incl.
   `invalid_kind`, existing `work_accepted` part, "I have QUEUED it" stanza; `due_date_source` may only claim
   `stated` or `absent`).
3. Register **`run_depreciation_period_for_client`** from `packages/runtime/lib/depreciation-run.ts` (#651's carrier;
   digest §4 #651 — `{client_id, through?}`, door `clara.run_depreciation_period_for($1::uuid,$2::date,$3::text,$4::uuid)`,
   the CLR38/CLR19/CLR04 sentence map, no floor bypass, the "you execute an authority; the period is the database's"
   stanza; NO new part kind, NO purpose widening).
4. **Conditional (#658 chat stanza, digest §4 (B))**: a sibling step `loadClientBasisStepV21(clientId, firmId,
   createdBy, asOf)` beside the byte-untouched `loadContextStepV10`, reading `clara.retrieve_knowledge(...)` with
   `p_purpose='chat_turn'` through `lib/knowledge-retrieval.mjs` and surfacing a read failure as a typed status
   (never `catch { contextPack = null }`). Take it if it lands with its cells green in this cut; otherwise reduce it
   to contract-only and SAY SO in the report. Part kind: first try an existing kind for the "knowledge unavailable"
   status; register `knowledge_unavailable` (with its `apps/web` reader in the same commit) ONLY if none fits, and
   record the measurement.
5. Enumerate v20's complete roster and prompt stanzas (the #655 stanza's stated limit) and reconcile the three
   stanzas into one prompt; engine stamp `llm-openai:<modelId>:chatturn-v21` in `chatTurn.v21.usage.ts`.
6. `WORK_ACCEPTED_PURPOSES` stays at three; `chatTurn.v19.parts.ts` / `v20` stay the declarers unless §1.4 mints a kind.

## 2. `claraWork_v5`

1. Six files `claraWork.v5.{ts,impl,tools,prompt,errors,bundle}.ts` from v4's shape.
2. **#658 (A)**: `loadWorkKnowledgeStepV5(clientId, firmId, asOf, purpose)` before the segment loop through
   `lib/knowledge-retrieval.mjs` (`retrieveKnowledge` → `clara.retrieve_knowledge(p_client,p_purpose,p_as_of,p_keys,
   p_limit,p_firm)`, `WORK_KNOWLEDGE_READ_PURPOSE='accounting_work'`, limit 40) then `recordWorkKnowledgeRead` →
   `clara.record_work_knowledge_read(p_task,p_run,p_seq,p_purpose,p_as_of,p_knowledge_version,p_keys,p_tiers,
   p_records_shown,p_truncated,p_status,p_reason)` with the key set actually returned; tools `read_knowledge_source`
   and `read_knowledge_history` (`{record_id, reason}`, doors `read_knowledge_record_for` / `read_knowledge_history_for`
   `(p_firm,p_client,p_record)`, CLR11 → `record_not_in_scope`, CLR03 → `no_pack_context`, data never instruction, no
   part kind, spend `budget.toolCalls`); terminal `knowledge_read_failed` on ANY `{status:'unavailable'}` (atomic door —
   R-D; never write it as if a per-tier signal existed; `{status:'ok'}` with an empty core is NOT a failure); replan
   trigger after resume via `readKnowledgeDrift` → `clara.work_knowledge_drift_for(p_firm,p_work)` — `relevant:true`
   spends one existing `budget.replans`, `relevant:null` is surfaced never coerced; budgets unchanged; the read step
   records its own next `seq` on replay.
3. Capability ids `accounting_work.retrieve_knowledge` / `accounting_work.inspect_knowledge_source` from
   `lib/capability-registry-v2.mjs` (`clara-capability-registry/v2`; v1 untouched).
4. **Rider #847 (C)**: `lib/work-trace-bounds.mjs` — `boundedRevisionNumber` (abs < 1e12, scale ≤ 6) and `boundedRunId`
   (`^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$` or no 13+-digit run), called by the v5 impl before `traceSafely`; no
   tighter than the door; `lib/work-trace.mjs` never edited.
5. **Rider #882(a) (D)**: ONE row in `claraWork.v5.errors.ts` — `(CLR40, fa_cost_adjustment_deferred) → refusal` with the
   door's remedy verbatim; the other two CLR40 reasons are NOT added; a cell proves the Work settles as a refusal.
6. **Bundle `clara-work/v5`** whose digest covers each tool's JSON schema and declared dependencies
   (ARCHITECTURE:435-445); a cell fails when a schema changes and the name does not.
7. Roster `CLARA_WORK_TOOL_NAMES_V5` = v4's five + `read_knowledge_source` + `read_knowledge_history`; the tools that
   v4 re-exported by import (`openWorkQuestionStep`, `emitWorkQuestionStepV3`, `emitWorkStatusStepV3`) stay imports.

## 3. Registry, freeze, parity

- `packages/runtime/workflows/registry.ts`: import/export both bodies, repoint `chatTurn → chatTurn_v21` and
  `claraWork → claraWork_v5`, add both to `workflowBodies`; **v1…v20 and v1…v4 stay exported and listed** (the boot
  census refuses database-wide otherwise). Print the registry diff in the report.
- `node scripts/check-frozen-workflows.mjs --update` locally (never under CI=true); `--compare-base origin/main` must
  report additions only — the new carriers (`trade-invoice-basis.ts`, `depreciation-run.ts`, `knowledge-retrieval.mjs`,
  `capability-registry-v2.mjs`, `work-trace-bounds.mjs`) enter the manifest by closure; `retired` byte-identical.
- `node packages/runtime/scripts/check-parts-parity.mjs`: reader superset of emittable; a new kind, if any, has its
  reader in the same commit.

## 4. Evidence (all LOCAL, on `rigrt` / `clara_rt` unless db-only)

- Unit cells per tool: `.strict()` refuses extras; door argument order pinned by a spy; refusal map covers every token
  the door raises (`p*.tool.refusals`); deterministic op key (`stableOpKey` twice = same); the `knowledge_read_failed`
  terminal on `unavailable`; the replan spend on `relevant:true` and the surfaced `relevant:null`; bundle-digest cell.
- World legs: the existing `claraWork` legs green on v5 (a run records a `work_knowledge_reads` row per attempt with
  the keys it read; `read_knowledge_source` returns data); the chat legs green on v21 (`start_trade_invoice_work`
  admits one Work and replays to the same; `run_depreciation_period_for_client` posts one period or refuses by name);
  the two-build cutover leg; every leg in `.github/actions/db-live-gates/action.yml`.
- `pnpm typecheck`, `pnpm lint`, the whole `apps/web` unit suite (a new kind, if any, moves the parity census), the
  chat and Work browser walks on the 3400/3401/3402 triple.
- Report `reports/successors-final.md` in the 2026-09-15 shape: what each body carries, the exact registry diff,
  what was NOT cut and why (measured), every command with counts, frozen-manifest deltas, the engine stamp.

## 5. Then

The cut is reviewed with three lenses + a fix round + a recheck like a ticket (`reports/successors-review-*.json`,
`successors-fixround-1.md`, `successors-recheck-1.json`); after that the orchestrator opens the PR (INTEGRATION-ORDER §5).
