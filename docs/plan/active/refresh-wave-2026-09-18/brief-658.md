# Brief: #658 — 按客户、期间和任务读取相关知识及原始依据

*B6 Start Clara → B3 Work list/detail → C13 Knowledge/identity — the retrieval half: what a run reads before it acts,
which versions it read, and what it says when the read did not succeed.*

## Orchestrator decisions (binding)

- **Migration `0230` only**, ONE file `packages/db/migrations/0230_knowledge_retrieval.sql` (DECISIONS §2, row 0230 —
  binding). It **CREATES**: `clara.retrieve_knowledge(...)` (`clara_runtime` ONLY — #783 stands), `read_knowledge_record_for`,
  `read_knowledge_history_for`, relation `work_knowledge_reads` (FORCE RLS, append-only, status in `ok/partial/unknown/denied`,
  **NO FK to `accounting_work`**, sole writer `record_work_knowledge_read` deriving work/firm/client from the
  agent_tasks→accounting_work join), `work_knowledge_drift(p_work)` (human, viewer floor) + `work_knowledge_drift_for`
  (runtime) over ONE ungranted core with the `observed_revisions` fallback, **and a SEVENTH door
  `clara.list_work_knowledge_reads_for_record(p_record)`** (`clara_authenticated`, SECURITY DEFINER, viewer floor,
  client-scoped) so C13's record detail can list the Work that read a record — `DECISIONS.md:83` states its reason in
  its own voice: *"AC5's 'historical basis' half needs it and the relation has no app-role SELECT"*. It **RECUTS
  NOTHING** — "none (`get_context_pack` and `get_knowledge_pack` untouched)" — and the tail *proves* that by pinning
  eight bodies. **SEVEN granted functions** + one ungranted core + one relation; the gap map's phrase "five doors"
  counted only the reads, and an earlier draft of this brief counted six — `DECISIONS.md:83` is binding and the seventh
  door is built here, not deferred.
- **Every pin is MEASURED on your rig, never transcribed** (§2.2; SYNTHESIS §7.4 #1, K4). You recut nothing, so the eight
  are **non-regression** pins taken off `pg_proc.prosrc` on `clara_658` after `pnpm db:migrate`, re-asserted in the tail:
  `get_knowledge_pack`, `list_client_knowledge`, `_knowledge_legacy_rows`, `_knowledge_capture_core`, `_knowledge_floor`,
  `capture_knowledge`, `get_context_pack`, `answer_work_question`. `get_context_pack` (eleven generations, live at
  `0209:139`) and `answer_work_question` (live at `0200:406`, not `0180:761`) are **splices** — a pin read from file text
  will not match and 0230 refuses to apply.
- **D16 (§0) — the layered required read, binding.** CORE tier (`kind='policy'`, `authority_bearing`, and the five
  legacy-carried keys) unreadable → the run **stops**: settle `failed`/`internal`, `recoverable:true`, **nothing posted**.
  Every other tier degrades to `partial` and the Work says it read only part. "Your basis changed" lives **on the face plus
  a runtime recheck at resume**; `clara.answer_work_question` is **not** touched (a door five migrations have spliced —
  `0180`, `0184`, `0198`, `0200`, `0216`; and one refusal code for "you were slow" and "your basis moved" is unreadable).
- **D17 (§0) + §1.2 — TWO bodies are cut, ONCE each, by the integration worker after the ten merges. You cut neither.**
  `claraWork_v5` carries your step, your two read tools, your terminal, your replan and `lib/capability-registry-v2.mjs`.
  `chatTurn_v21` carries your bounded chat-side read — **conditional**: the integrator may drop that stanza to
  "contract only" and say so in `reports/successors-final.md`. This **supersedes gap-658 Q4** (which recommended cutting
  only `claraWork_v5`): *orchestrator ruling — supersedes gap-658 Q4*, on D17's reason (PRD §1, chat is a peer entry).
- **§1.2 — you write FOUR stanzas, not one.** Your own `claraWork_v5` stanza; the conditional `chatTurn_v21` stanza; and
  the two rider stanzas the integrator will otherwise reconcile from nothing: **#847** (writer-side mirror of 0210's two
  trace bounds, in a NEW module the v5 body imports — `work-trace.mjs` stays byte-untouched, and **the writer's clause
  stays no tighter than the door's**) and **#882(a)** (one row in `claraWork.v5.errors.ts`:
  `(CLR40, fa_cost_adjustment_deferred) → refusal`, with the human remedy; a cell proves the Work settles as a refusal).
  The v5 bundle digest must cover **each tool's JSON schema and declared dependencies**, not `tools:{id,names}`
  (ARCHITECTURE:435-445, `[已记录，未实现]`; `claraWork.v4.bundle.ts:53` still hashes names only).
- **§1.3 — no implementer cuts a body, edits a frozen file, or edits `registry.ts`.** The four frozen libs your lane
  touches are `lib/knowledge.mjs`, `lib/knowledge-conflicts.mjs`, `lib/work-trace.mjs`, `lib/capability-registry.mjs` —
  **all four `deployed:true`** (measured: 296 entries, 16 `/lib/` members; `knowledge-conflicts.mjs` sha
  `7591e952…`, note "#654 — frozen BY CLOSURE"). The orchestrator's earlier note that `knowledge-conflicts.mjs` is
  non-frozen is **refuted**. Every NEW module you write (`knowledge-retrieval.mjs`, `capability-registry-v2.mjs`, the
  work-trace bounds module) sits outside every frozen closure, is imported by nothing frozen, and **freezes at the cut** —
  so **durable rules live in 0230, never in these modules**. v1–v4 and v1–v20 stay exported and in `workflowBodies`
  (stranded-body gate refuses World startup database-wide). Engine stamp at the cut: `llm-openai:<modelId>:chatturn-v21`.
- **§1.4 — AC1/AC2/AC3's Work-lane behaviour is "contract delivered, closes at the cut". Say so; do not claim it fixed.**
  What ships on your branch: the whole migration, the C13 freshness/in-effect faces, the Work-detail knowledge block and
  the **real drift banner** (which closes **#885**'s human-visible half, because deployed `claraWork_v4` already writes
  `observed_revisions.knowledge_version` at `claraWork.v4.impl.ts:593` and a human can already read it through
  `get_work_execution_trace`, `0195:1590`, `:2225`).
- **§6 / C7 — purpose is RECORDED and joins the drift judgement; it filters nothing, and you mint no
  `knowledge_key_purposes` side table.** State it in the door's own voice, the way `0192:1452-1454` does, and assert it
  (`p658.retrieve.purpose_is_recorded_not_filtered`) so a later ticket has a red cell to flip. *(gap-658 Q8's
  recommendation, ratified.)*
- **§6 / SYNTHESIS §4 — the face word set is the estate's four**: `ok` / `partial` / `unknown` / `denied`
  (`client-work-attention.tsx:65-71`, "The WORD is the state; the tone only agrees with it"). The **runtime envelope keeps
  its frozen words** `ok`/`unavailable` (`knowledge.mjs:139`, `:156`); **no face and no DB column ever says `unavailable`**,
  and the CHECK refuses it. One mapping, exported once, as `faceStatusOf`. **No lane builds a shared freshness library
  this wave.**
- **§6 — part kinds: you register NONE.** Measure whether an existing kind in `lib/parts/catalog.ts` can carry the
  knowledge-unavailable status and **report the finding**; only if none fits does the *integration worker* register
  `knowledge_unavailable` with its reader in the same cut. `lib/parts/*` is #642's (§3). Do not open
  `PartRenderer.tsx`, `types.ts` or `catalog.ts`.
- **#783 stands, and the tail proves it.** `retrieve_knowledge` is pack-shaped, so the owner's 2026-09-15 ruling binds it:
  `.out-of-scope/human-read-of-knowledge-pack.md` ("The register is the human surface; the pack is the model's"),
  `ARCHITECTURE:297-299`. Grant `clara_runtime` only, plus a **POSITIVE** tail assertion naming #783. "One register, one
  pack, one answer" is proven by `p658.retrieve.shadow_parity` across two personas, not by a shared grant. Re-opening
  #783 is **Q7 to the owner**, never a grant smuggled inside this slice. **The seventh door does not breach it, and its
  header says why**: `list_work_knowledge_reads_for_record` is granted to `clara_authenticated` because it returns READ
  METADATA — which Work, at which `knowledge_version` and `as_of`, under which `purpose`, with which face word, over
  which key NAMES — and **never** a record's value, its `applies_when`, source bytes or any assembled pack content.
  Cell `p658.record_reads.no_values` asserts that, so "just add the value, the human is already allowed" has a wall.
- **Ownership (§3).** You **OWN**: `packages/db/migrations/0230_*`, the new DB battery + gate + cohort,
  `packages/runtime/lib/knowledge-retrieval.mjs`, `capability-registry-v2.mjs`, the work-trace bounds module, the new
  runtime unit battery and World leg, `components/registers/knowledge*`, `apps/web/lib/registers/knowledge.ts` (ONE
  new `callDoor` wrapper) and the `/settings/knowledge` panel's C13 presentation, and **the Sources tab's new content**
  in `components/work/work-detail.tsx`. You may touch with **ONE
  hunk**: `work-detail.tsx` (a single mount line inside `TabsContent value="sources"`; **sequence at integration is
  #658 → #655 → #636**), `components/work/work-diagnostics.tsx` (one `observed_revisions` block — see §3 Web 3),
  `components/work/work-question-form.tsx` (the drift banner). You must **NOT open**: `lib/parts/*` and
  `ClaraThreadView.tsx` (#642); `app/(firm)/settings/*` shell and `lib/firm/capabilities.ts` (#635); any `/bank` file
  (#657); `components/firm/client-workspace-overview.tsx` and `client-home/*` (#660); `firm-home/*` (#659);
  `accounting-hub.tsx` / `lib/journals/api.ts` (#655); `documents-workbench.tsx` / `useUploadQueue.ts` (#636/#642);
  `packages/runtime/workflows/registry.ts` and any frozen file (§1.3). **No new `REVIEW_QUEUE_ROW_KINDS` row kind**
  (§3, rule carried from 2026-09-15 §1.6). **No `tree.ts` row** — you add no route and re-label no leaf.
- **Boundaries, verbatim where DECISIONS §3.2 says verbatim.** **#658 reads and records; #663 writes and repairs.**
  #658 delivers the DETECTOR — the recorded read-set (`work_knowledge_reads`), the drift comparison
  (`work_knowledge_drift`) and the human-visible marker; #663 delivers the ENGINE — deduplicated events, affected-concept
  update, index/wiki/OKF rebuild, experience accrual and the withdrawal cascade. **#658 builds no event, no consumer, no
  experience record and no wiki/OKF write.** #664 fans the per-client retrieval out; you mint no firm-intake object.
  #665 measures accuracy; **you measure none and pin no threshold**. #673 owns freeform SQL — **do not widen
  `freeform_read`**. #913 owns `scope_default`'s drop; you read `knowledge_keys` by `kind`/`authority_bearing` and
  **never** `scope_default`, in a comment. #912 records role-at-the-time; you record versions, not roles.
  #635 links to `/settings/knowledge` and renders nothing there; you add no Settings section.
- **Non-goals, stated in code comments AND in the report** (§5): #658 **captures nothing, corrects nothing, promotes
  nothing, accrues no experience and writes no wiki/OKF page**. It widens no `accounting_work.purpose` (the IN-list is
  untouched by every lane this wave, measured — SYNTHESIS §0.4). It mints no knowledge key (`kp.01`'s ten-entry
  `deepEqual` stays green). It adds no part kind, no needs-you row kind, no route.
- **Playwright port triple**: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3370`, `CLARA_E2E_NEXT_PORT=3371`,
  `CLARA_E2E_RUNTIME_PORT=3372`. **Rig row (verbatim, RIG.md)**: `| 658 | C:\Users\zhant\Desktop\clara-wt\658 |
  impl/658-knowledge-retrieval | 55708 | clara_658 | https://127.0.0.1:3370 / 3371 / 3372 | ok 437s | 219 applied |
  ok (2 files) | 219 · 0224 · PG 17.11 |`.

### Measure FIRST, before a line of the migration is written

These are the gap map's **unverified** items promoted to red cells; each one changes what the brief's slice may claim.

1. **`p658.rig.pins`** — take all eight pre-image `sha256(prosrc)` off `clara_658` with `pg_get_functiondef`/`prosrc`.
   *Why first:* SYNTHESIS K4 — "a pin read from source will not match; the migration refuses to apply, and the last wave
   already paid this tuition."
2. **`p658.rig.closure`** — `node scripts/check-frozen-workflows.mjs --print-closure` from the worktree root. Confirm the
   four frozen libs, and that `lib/wiki-projection.mjs`, `lib/wiki-projection-ops.mjs` and your three NEW modules are
   **outside** the closure at base. *Why first:* gap-658 Unverified — that status came from a key lookup in
   `frozen-workflows.json`, not from the harness; C34.3's cells and the #847 module placement both depend on it.
3. **`p658.core.size`** — enumerate the CORE tier on the migrated rig: `select knowledge_key from clara.knowledge_keys
   where kind='policy' or authority_bearing` UNION the five legacy-carried keys, and count. *Why first:* SYNTHESIS §7.4
   #18 and gap Risk 5 — a required-read terminal over a core larger than expected stops legitimate accounting. If the
   core is not small and enumerable, **stop and report** before the terminal ships; do not widen it to "everything".
4. **`p658.retrieve.no_human_grant` baseline** — run `has_function_privilege` on the rig for `clara_authenticated`,
   `clara_agent_ro` and both wake roles over `get_knowledge_pack` **before** you add anything. *Why first:* gap-658
   Unverified — `0192:1438-1441` says the human arm holds no grant "today"; the #783 assertion is only evidence if the
   base state is measured, not read.
5. **C-87 Mobbin** — one bounded Mobbin pass for *a stale/refreshing data banner* and *an inline "your basis changed"
   affordance*, recording the inspected frames. *Why first:* it shapes the two banners you are about to build. **Never
   claim full video viewing**; state the remainder as still outstanding.

## 1. Current state

**DB.** `clara.knowledge_records` (`0192:388`) — stable `record_id`, monotone `revision_n`, `scope_kind` client/firm,
`applies_when`+`applies_when_digest`, `effective_from`/`effective_to`, source pins, derived `trust`, `state`
live/superseded/withdrawn, firm-wide monotone `knowledge_version`; `uq_knowledge_live` at `:512`; supersede-only trigger
`:521-566`; authority trigger `:570-594`; SELECT-only to app roles `:617`. `clara.knowledge_keys` (`0192:157-183`) carries
`kind`/`value_shape`/`validated_against`/`allowed_values`/`scope_default`/`authority_bearing`/`min_role` and **no purpose
dimension**; it is **append-only on UPDATE *and* DELETE** (`:185-189`), so no new column could ever be populated for the
13 seeded rows. `knowledge_key_firm_eligibility` (`0220:368`) is the estate's precedent for a per-key property: a side
table, never a column. Reads: `list_client_knowledge(uuid)` (`0192:1316`, viewer floor) whose rows come from
`_knowledge_row_json` (`0192:1013-1036`) and **already carry `effective_from`, `effective_to`, per-row `knowledge_version`
(text), `state`, `trust`, `source`, `applies_when`** — no envelope `as_of`, no bound, no period filter;
`get_knowledge_record` (`:1377`); `get_knowledge_history` (`:1404`); `get_knowledge_pack(uuid,text,uuid)` (`:1458`) —
runtime-only by grant (`:1747-1764`), lane picker at `:1474-1500` (`jwt_sub()` → `_human_ctx(role_rank('viewer'))`, else
`current_setting('role')='clara_runtime'` or `session_user in ('clara_runtime','clara_runtime_login')` requiring `p_firm`
(CLR10 `pack_firm_required`), else CLR03 `no_pack_context`), client looked up INSIDE the bound firm so absent and foreign
answer alike (CLR11), a per-applicability `not exists` shadow, the legacy union through `_knowledge_legacy_rows`,
**no LIMIT and no `effective_*` filter**, and the header's own confession that `p_purpose` "is RECORDED and echoed; it does
not yet filter" (`:1452-1454`). `get_knowledge_applicability(uuid,text)` (`0220:707`) is the only read carrying `as_of`
(`:816`). `get_context_pack(uuid,text)` — the fixed preload, live at `0209:139`: `limit 50` entries, `limit 25` approvals,
`limit 200` coding patterns, wiki pages ranked `row_number() over(order by priority, updated_at desc, slug)` then byte-capped
(`0209:283-326`), with `last_projected_seq` / `has_stale_sources` computed at `:272-274`, `:316-322` and reaching no read
and no surface. `clara.work_execution_traces` (`0195:1276`) — FORCE RLS, no payload column, `observed_revisions` under a
CLOSED key set bounded in shape by `0210` (`abs(v) < 1e12 and scale(v) <= 6`; run grammar
`^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$ or !~ '[0-9]{13,}'`), **no FK to `accounting_work`** by measurement
(`0195:254-268`: an FK takes `FOR KEY SHARE`, the posting core holds `FOR UPDATE`, a trace insert **blocked 4001 ms and was
silently cancelled**; DDL comment `:1308-1315`; tail `:2357-2360`), the binding carried instead by the POSITIVE join at
`0195:1525-1529`. `answer_work_question` (live `0200:406-470`) compares op-key hash, `question_version` and client status
and **never a knowledge version** — #885.

**Runtime.** Pins at base: `chatTurn_v20` (`registry.ts:173`, `:990`), `claraWork_v4` (`:270`, `:991`). `lib/knowledge.mjs`
— `readKnowledgePack` never null, never throws; `{status:'ok'|'unavailable', reason}` with five reasons `no_client`,
`no_purpose`, `refused`, `malformed`, `read_failed` (`:28-42`, `:137-140`, `:156`); no module-level `node:` import, a hard
measured constraint (`:44-64`). `lib/knowledge-conflicts.mjs` — purpose `accounting_work` (`:38`), caps **40 records /
200 chars** (`:44-45`), `renderWorkKnowledge` (`:100-141`) renders unavailable ≠ empty, and `:93-98` records the deliberate
decision **not** to block a posting on a failed knowledge read. `lib/work-trace.mjs` — `OBSERVED_REVISION_KEYS` =
`knowledge_version, books_version, chart_revision, basis_digest, source_sha256, question_version` (`:283-286`);
`observedRevisions` conforms values (`:293-303`); `traceRevisionOf` still admits any finite number and `traceRunOf` is never
applied to the value sent — **0210's owed writer half, filed as #847**. `lib/capability-registry.mjs` — five
`accounting_work.*` ids (`model_segment`, `list_accounts`, `record_journal_entry`, `ask_question`, `settle`),
`CAPABILITY_REGISTRY_VERSION = "clara-capability-registry/v1"` (`:37`), header `:29-34` ("a new capability ships as a NEW
frozen version or in non-frozen infrastructure, never as an edit"); **there is no knowledge-read capability id**.
`claraWork_v4` — `loadWorkKnowledgeStepV4(clientId, firmId)` (`claraWork.v4.impl.ts:269-277`) reads once before the loop;
`knowledgeVersion` rides into every segment's `model_call` observed revisions (`:593`, `basis_digest` explicitly null);
roster is five names (`claraWork.v4.prompt.ts:72-79`, `CLARA_WORK_TOOL_NAMES_V4`), the only read tool `list_accounts`;
budgets `{segments:4, modelCalls:8, toolCalls:12, replans:2, transientRetries:3}` (`claraWork.v4.bundle.ts:39-45`); bundle
`clara-work/v4` hashes `{id, instructions, skills, tools{id,names}, budgets}` (`:49-62`) — no per-tool schema.
`chatTurn_v20` — `loadContextStepV10`'s `catch { contextPack = null }` (`chatTurn.v10.impl.ts:125-138`) is FROZEN and
reached by import from v11…v20; `loadKnowledgeContextStepV19` reads with purpose `chat_turn` and never swallows
(`chatTurn.v19.impl.ts:129-150`); the only knowledge part kind is `knowledge_receipt` (`chatTurn.v19.parts.ts:67-80`).

**Web.** C13 list `/clients/[clientId]/knowledge` → `knowledge-panel.tsx`: four named faces (successful-empty;
filtered-no-results with Clear; contradictory-pair under a warning; failed read via `DataState`), version line at
`:99-103`, **no `as_of` and no in-effect mark**. `knowledge-shared.tsx` carries value/applies-when (`:29-48`), badges with
words never colour alone (`:50-90`), applicability + effective window (`:92-109`), the source block with its own
inaccessible-source `StateBanner` (`:112-160`), the provenance trio (`:163-183`). C13 detail → `knowledge-detail.tsx`
(revision timeline = the historical basis). `lib/registers/knowledge.ts` has **no** read of `get_knowledge_pack` and no
freshness type. B3 `work-detail.tsx` — tabs Results / Sources / Activity at `:567-572`, current question above them
(`:545-549`), **no knowledge anything**; `WorkDiagnostics` is already mounted **inside the Activity tab** at `:645` and
already loads the trace rows through `lib/work/diagnostics.ts` — whose `observed_revisions` field (`:54`) is typed and
**rendered nowhere in the repo** (grep: zero hits for `observed` in `work-diagnostics.tsx`). B6 → `KnowledgeCards.tsx:42-56`
is the capture receipt only; no unavailable/partial/stale card. The estate's live coverage vocabulary is
`client-work-attention.tsx:65-71`.

**Tests.** DB: `knowledge-records.test.mjs` 27 cells behind a cohort gate (`kn.01`–`kn.04` trust belts; `kn.05`–`kn.09`
revision chain + op-key replay; `kn.10`–`kn.14` scope/shadow/floor; `kn.17`/`kn.23` legacy never shadowed; `kn.18`/`kn.26`
pack tenancy; `kn.21` watermark is TEXT and never moves backwards); `knowledge-firm-defaults.test.mjs` 21 cells incl.
`p654.evidence.race_capture_vs_filing`, `p654.promote.race`, `p654.promote.replay_is_one_receipt`;
`knowledge-legacy-readers-converge.test.mjs` `c784.01`–`.08`. Runtime: `knowledge-lib.test.mjs` 16 cells;
`chat-turn-v19-knowledge-context.test.mjs` 11; `clara-work-v4.test.mjs` `v4.knowledge.*`, `v4.roster.*`, `v4.registry`;
`work-trace-redaction.test.mjs:297` is the **only** place `books_version` ever reaches `observedRevisions` — a test, not a
caller. Web unit: seven knowledge files. Playwright: `knowledge-walk.spec.ts` 13 cells, `knowledge-firm-walk.spec.ts` 14,
shared `knowledge-mock.mjs` (declared at `e2e-fixture-ownership.test.ts:70`, `:388`, `list_firm_knowledge` `unscopeable`).
`get_work_execution_trace` is answered today by `journal-work-mock.mjs` only.

## 2. Gaps / rows

| Row | Disposition | Evidence the implementer must produce |
|---|---|---|
| **AC1** bounded core-first + tool-based inspection; firm defaults merge only through explicit scope | **partial → to build (DB + contract), closes at the cut.** (a) the fixed preload IS `get_context_pack` and is **not touched** (Q3, ratified); (b) the bounded core-first door is built as `retrieve_knowledge`; (c) tool-based inspection is **contract only** (v5 stanza); (d) **purpose-relevance is a NAMED NON-GOAL**, asserted not assumed (C7); (e) the firm-default merge is **verify-only** — it is implemented and correct (`0192:1355-1363`, `:1508-1519`, `0220:418`, `:443`, `:546`, `:707`) | `p658.retrieve.core_first`, `.bounds`, `.purpose_is_recorded_not_filtered`, `p658.retrieve.shadow_parity`; v5 stanza in the report |
| **AC2** record versions per attempt; relevant revision replans, unrelated does not block | **partial → to build (relation + drift), replan closes at the cut.** Only `knowledge_version` is recorded today (`claraWork.v4.impl.ts:593`, `basis_digest` null); `observedRevisions(` has exactly three production sites (`work-trace.mjs:339`, `claraWork.v3.impl.ts:474`, `claraWork.v4.impl.ts:593`) and **no caller feeds the other four keys**. There is no wiki/experience version anywhere — **descoped to #663 by boundary**, named. The read-set makes "relevant vs unrelated" computable for the first time | `p658.drift.relevant`, `p658.drift.trace_fallback`, `p658.reads.append_only`; the replan cell rides `clara-work-v5.test.mjs` at the cut |
| **AC3** required read failure / projection lag → visible recoverable state, no accounting write; explicit status not null-as-empty | **partial.** The null-as-empty law is **verify-only** in the runtime envelope (`knowledge.mjs:31-42`, `:137-140`) and `renderWorkKnowledge` (`:100-141`). The required-read terminal is **contract only** (D16 core tier; closes at the cut). **The projection-lag half is a NAMED RESIDUAL → #663**: `last_projected_seq` / `has_stale_sources` live inside `get_context_pack`'s wiki block (`0209:272-274`, `:316-322`) and surfacing them needs a recut this brief forbids | `faceStatusOf` cells; `p658.reads.status_vocabulary`; the residual named in the report and in the CONTEXT _Avoid_ |
| **AC4** conflicting independent sources → one shared question; untrusted imports cannot change tools/permission | **verify-only, re-measured.** Conflict handling and the anti-injection belts are built and tested (`knowledge-conflicts.mjs:196-243`, `knowledge-panel.tsx:138-163`, `0192:50-65`, `:570-594`, `claraWork.v4.tools.ts:320-376`, `work-bundle.test.mjs:256`). **Two independent SOURCES disagreeing has no representation** (`_knowledge_source_pins` pins ONE document/extraction/region per record, `0192:750-803`) — **named residual**, not built here | re-run `kn.01`–`kn.04` and `v4.roster.*`; cite counts. The residual named with `0192:750-803` |
| **AC5** C13 and Work expose source / applicability / freshness-lag / historical basis + real migration isolation tests | **partial → to build (presentation-only on the C13 register; a NEW door + list on the C13 record detail; a new block on Work).** The **freshness** half needs **no new door**: `_knowledge_row_json` already returns `effective_from`, `effective_to`, per-row `knowledge_version` (`0192:1013-1036`). The **historical-basis** half on C13 — the "Work that read this record" list — **IS BUILT**, and it needs the **SEVENTH door** `list_work_knowledge_reads_for_record(p_record)` because `work_knowledge_reads` is FORCE-RLS with **no app-role SELECT**: `DECISIONS.md:83` mandates exactly that door for exactly that reason (*orchestrator ruling — ratifies gap-658 Proposed slice / Web item 2*). The RUN's half of the historical basis is the `read_knowledge_history` tool, contract-only, closing at the cut. Isolation is **verify-only** (`kn.10`, `kn.12`/`kn.13`, `kn.18`/`kn.26`, `p654.exception.*`, `c784.01`–`.08`). **"Current access" is `_human_ctx` at read time, not a live-authority recheck at use time — say so.** | `p658.retrieve.period`; `p658.record_reads.lists` / `.floor_and_tenancy` / `.firm_scope_shadow` / `.bounded` / `.no_values`; web cells for the `as_of` line, the `in_effect:false` mark and the reads list; the knowledge-walk extension on the detail route |
| **AC6** full state ladder / 320px / 200% / keyboard+focus / SR names / reduced motion / URL-Back / drafts / accepted composition | **to build on the surfaces you own.** C13's ladder already exists and stays (`knowledge-walk.spec.ts:80`, `:87`, `:95`, `:109`, `:124`, `:139`, `:165`, `:184`, `:195`; firm walk `:170`, `:198`, `:242`) — extend it, do not move the four faces. **New: partial/stale, and a cancelled/recovery leg for a knowledge-read failure.** The drift banner **must not clear a typed answer** | the extended `knowledge-walk.spec.ts` + the new `work-knowledge-walk.spec.ts`; the four web unit files |
| **AC7** production-facing reads under real least-privileged roles + real Workflow/Postgres World | **to build.** Every new-battery assertion through `humanQuery`/`roleQuery` personas, **never `rootQuery`** for the assertion under test | the whole `p658.*` battery with the 40 gate flags, plus `work-knowledge-e2e.mjs` on your own rig with its exit code |
| **C-36** version instructions/skills/tools; evaluate real error recovery (REDESIGN) | **`to build` (partial carry).** The schema-covering bundle digest rides `claraWork_v5` (ARCHITECTURE:435-445). **OCR ordering and numeric invariants are #665's, which this ticket blocks — record the split so the row is not consumed twice** | the v5 stanza's digest clause; the split stated in the report |
| **C-84** SQL-boundary analyzer dollar-quote/comment fixture (VERIFY) | **`verify-only`. Closed.** `wiki-lint-checks.mjs:490`, `:588-590`, `:609-613`, `:667-669`; fixture `check-wiki-dynamic-sql.selftest.mjs:236-241`, `:386-392` | run `node scripts/check-wiki-dynamic-sql.selftest.mjs` on the branch and cite the count. **No new fixture owed** |
| **C-87** Mobbin flow/motion research (VERIFY, partly consumed) | **`verify-only`, carried forward by name** — see measure-first #5 | inspected frames listed; the remainder stated as outstanding; never "full video viewing" |
| **C34.3** three `to_regprocedure` probes; typed failure on missing/overloaded (preserve) | **`verify-only` PLUS one cell per probe owed.** Re-censused: three, none bare — `wiki-projection.mjs:341-346`, `:348-353`, `:612-615`, each pinning an EXACT signature (`:328-331` says why `to_regproc` would be wrong), evaluated per event (`:337-339`, `:609-611`); the skip is a deliberate design (`:332-336`). The second clause is **unproven** | three cells in `wave-b-wiki-projection-unit.test.mjs`: missing → the named skip receipt, never a throw; an added overload of the same name → still not matched. Gate on measure-first #2 |
| **C55.6** unread source → parked question, never an inferred statutory fact (reframe) | **`descoped (authority)` for the tax specifics** — `PRD:125`, beta does not enable tax; **`to build` for the general rule** via D16's core tier | the terminal's stanza + `p658.core.size`; the tax descope named with `PRD:125` |
| **C55.17** unavailable / stale / partial source states, each tested, each blocking unsupported computation (preserve) | **`to build` — this is the ticket's core deliverable.** Unavailable is built and tested; **stale and partial are states nowhere** today (truncation is a sentence, `knowledge-conflicts.mjs:137-139`). Face words are the estate's four, never a fifth | `p658.reads.status_vocabulary`, `faceStatusOf` cells, the partial face on Work detail |
| **C83.14** official-source access | **`duplicate` — closes with C55.17.** Carry no second deliverable | one line in the report |

## 3. Slice (one branch)

### Migration `0230_knowledge_retrieval.sql` — additive, recuts nothing, FORCE RLS, no app-role DML

Written in this order: **header → prestate pins → objects → grants → events → tail → gate module → cohort.**

*Header* carries, in its own voice: why `retrieve_knowledge` is minted beside `get_knowledge_pack` rather than spliced into
it (`0192:1458-1462`'s stated reason, restated as `0220`'s §2); why the new relation carries **no FK to
`accounting_work`**, quoting 0195's measurement (`0195:254-268`) so a later "hardening" pass cannot add it back; the #783
ruling and where it lives (`.out-of-scope/human-read-of-knowledge-pack.md`); and the four non-goals.

*Prestate*: the eight **measured** non-regression pins (measure-first #1), in `0195:396-409`'s idiom.

1. **`clara.retrieve_knowledge(p_client uuid, p_purpose text, p_as_of date default null, p_keys text[] default null,
   p_limit int default 40, p_firm uuid default null) returns jsonb`** — `language plpgsql stable security definer`,
   `set search_path = clara, pg_temp`, `set plan_cache_mode = force_custom_plan`. **Lane picker copied verbatim from
   `0192:1474-1500`**, refusals identical: CLR10 `knowledge_purpose_required`; human lane `_human_ctx(role_rank('viewer'))`
   with `p_firm <> c.firm` → CLR11; runtime lane requires `p_firm` → CLR10 `pack_firm_required`; neither → CLR03
   `no_pack_context`; client looked up INSIDE the bound firm → CLR11 for absent and foreign alike.
   **Three tiers, each labelled on every record and summarised in the envelope:**
   `core` — every live in-scope row whose key is `authority_bearing`, whose `kind` is `policy`, or which is one of the five
   legacy-carried keys; **unbounded and never truncated**; if the core cannot be read the whole answer is `unavailable`.
   `requested` — rows matching `p_keys`; an unknown key is CLR10 `knowledge_key_unknown`, **never a silent empty**.
   `remainder` — the rest, ordered `(knowledge_key, recorded_at desc)`, capped at `p_limit` (bounded `1..200`; outside →
   CLR10 `knowledge_limit_out_of_range`).
   **Period**: `p_as_of` defaults to `(now() at time zone 'Asia/Kuala_Lumpur')::date` (the `0220:816` idiom); a row outside
   `[effective_from, effective_to]` at `p_as_of` is **marked `in_effect:false` and RETURNED, never dropped** — silently
   dropping a rule is how a run reasons without a fact that applies.
   **Purpose is RECORDED and echoed, not filtered**, and the header says so in the door's own voice (C7).
   **Firm/client merge unchanged**: the same per-applicability `not exists` shadow both shipped reads use, copied not
   re-invented; legacy union through `_knowledge_legacy_rows(firm, client)` — **the pinned expression is CALLED, never
   changed** (`0209:62-72`, sha `65f4f0f3…`; any change makes 0209 unreplayable).
   Returns `{status:'ok', client_id, firm_id, purpose, as_of, knowledge_version (text), tiers:{core,requested,remainder},
   keys text[], truncated boolean, hidden_count int, records:[…]}`. **`grant execute … to clara_runtime` ONLY.**
2. **`clara.read_knowledge_record_for(p_firm uuid, p_client uuid, p_record uuid) returns jsonb`** and
   **`clara.read_knowledge_history_for(p_firm uuid, p_client uuid, p_record uuid) returns jsonb`** — in that argument
   order, SECURITY DEFINER, `clara_runtime` only. They return the record, its source PINS and the source document's
   **METADATA** (`id`, `filename`, `kind`, `bytes_verified_at`, `legal_hold`) — **never bytes**, and never another client's
   filing. CLR11 for a record outside the named firm/client, **with no existence oracle**.
3. **`clara.work_knowledge_reads`** — FORCE RLS, append-only, owner policy only, in `0195:2351-2354`'s idiom:
   `(id, task_id, firm_id, client_id, work_id, run_id, seq, read_at, purpose, as_of, knowledge_version text, keys text[],
   tiers jsonb, records_shown int, truncated boolean, status text check (status in ('ok','partial','unknown','denied')),
   reason text)`, unique `(work_id, run_id, seq)` so a WDK re-execution replays onto the same row. The **only** declared
   FKs are `(client_id, firm_id) → clara.clients(id, firm_id)` and `task_id → clara.agent_tasks(id)` — the residual set
   `0195:266-268` keeps and explains. **No FK to `clara.accounting_work`.** No app-role DML and no app-role SELECT.
4. **`clara.record_work_knowledge_read(p_task uuid, p_run text, p_seq int, p_purpose text, p_as_of date,
   p_knowledge_version text, p_keys text[], p_tiers jsonb, p_records_shown int, p_truncated boolean, p_status text,
   p_reason text) returns jsonb`** — SECURITY DEFINER, `clara_runtime`, the **sole writer**. It **DERIVES** `work_id`,
   `firm_id`, `client_id` from the positive join `0195:1525-1529` uses **verbatim** — `from clara.agent_tasks t join
   clara.accounting_work aw on aw.id = t.work_id and aw.firm_id = t.firm_id where t.id = p_task and t.kind =
   'accounting_work'` — and never from a parameter (CLR11 `work_not_found` when the join finds nothing). Idempotent on
   `(work_id, run_id, seq)`.
5. **Drift, TWO doors over ONE ungranted core** (house rule: human doors are `clara_authenticated` + `_human_ctx` floors,
   agent doors are `clara_runtime` + actor-explicit `_for` twins):
   `clara.work_knowledge_drift(p_work uuid) returns jsonb` — `_human_ctx(clara.role_rank('viewer'))`, session firm,
   `clara_authenticated`; `clara.work_knowledge_drift_for(p_firm uuid, p_work uuid) returns jsonb` — `clara_runtime`, firm
   explicit, CLR11 outside it with no oracle; `clara._work_knowledge_drift_core(p_firm uuid, p_work uuid)` — ungranted.
   The core takes the observed watermark from the newest `work_knowledge_reads` row **and falls back to the newest
   `work_execution_traces.observed_revisions->>'knowledge_version'`** (`0195:1276`, written today by
   `claraWork.v4.impl.ts:593`), compares it to the client's current watermark using the same expression both shipped reads
   use (`0192:1333-1335`), and resolves which keys moved by scanning `knowledge_records` for `knowledge_version > observed`
   in scope. Returns `{observed_version, current_version, observed_from:'read'|'trace', drifted, moved_keys[], read_keys[],
   relevant, as_of}` where `relevant = moved_keys ∩ read_keys ≠ ∅` and **`relevant` is `null` — never `false` — when
   `observed_from='trace'`**, because no read-set was recorded and pretending otherwise is the null-as-empty defect this
   ticket exists to kill.
6. **`clara.list_work_knowledge_reads_for_record(p_record uuid) returns jsonb`** — the **SEVENTH door**, mandated by
   `DECISIONS.md:83` and built here because C13's record detail has no other way in: the relation is FORCE-RLS with
   **no app-role SELECT**, so a door is the only human path to it and a `grant select` is not an alternative.
   `language plpgsql stable security definer`, `set search_path = clara, pg_temp`;
   **`grant execute … to clara_authenticated` ONLY** — not `clara_runtime`, not `clara_agent_ro`, neither wake role
   (the run already knows what it read).
   **Floor and firm**: `_human_ctx(clara.role_rank('viewer'))` with the firm taken from the session, written in
   `work_knowledge_drift`'s own idiom so the two human doors in this file read alike.
   **Client-scoped, and the scope comes from the RECORD, never from a parameter**: resolve `p_record` in
   `clara.knowledge_records` INSIDE the session firm and take its `firm_id`, `client_id`, `scope_kind` and
   `knowledge_key` from there. A record in another firm and a record that does not exist answer **identically** —
   CLR11, **no existence oracle** — the same rule `read_knowledge_record_for` follows.
   **The join axis is the KEY, because the relation stores key names and a watermark, not record ids** (object 3):
   a read row matches when `<record>.knowledge_key = any(r.keys)` and the client band agrees —
   `scope_kind='client'` → `r.client_id = <record>.client_id`; `scope_kind='firm'` → every client in the firm
   **except those whose own live record shadows that key**, using the per-applicability `not exists` shadow
   **copied from the live body measured on your rig** (`0192:1355-1363`, `:1508-1519`), never re-invented. The header
   says this in the door's own voice: it answers *"this Work read this KEY at this version"*, which for a stable
   `record_id` is the honest form of *"read this record"*, and it never claims a revision a read row cannot prove.
   **Bounded**: newest `read_at` first, hard cap **100** rows inside the body, with `truncated` + `hidden_count` in the
   envelope (the 0214 envelope posture). The register at Web 1 is unbounded and this list is not — do not make the two
   surfaces look alike.
   Returns `{status:'ok', record_id, knowledge_key, scope_kind, client_id, reads:[{work_id, client_id, run_id, seq,
   read_at, purpose, as_of, knowledge_version, status, reason}], truncated, hidden_count, computed_at}` — **no record
   value, no `applies_when`, no source bytes, no pack content** (the #783 bullet above; cell `p658.record_reads.no_values`).
7. **No event registration** (`0220:44-49`'s posture): an event with no consumer is #663's to design.
8. **Tail (fail-closed, re-read from the catalog, never asserted from this file's own text):** every new function is
   `clara_fn_owner`-owned, SECURITY DEFINER, `search_path` pinned, granted to exactly the named roles and nobody else —
   **including a POSITIVE assertion that no human role, `clara_agent_ro` or either wake role holds EXECUTE on
   `retrieve_knowledge`, `read_knowledge_record_for` or `read_knowledge_history_for`, citing #783 in the message**
   (0057's dark-grant rule restated at `0192:1742-1745`), **and its mirror for the seventh door — EXECUTE on
   `list_work_knowledge_reads_for_record` is held by `clara_authenticated` and by NOBODY else** (not `clara_runtime`,
   not `clara_agent_ro`, neither wake role), with `DECISIONS.md:83` named in the failure message; each new name has
   **exactly one** `pg_proc` row
   (`0103:1055-1070`); **`work_knowledge_reads` carries no `pg_constraint` of contype `'f'` referencing
   `clara.accounting_work`**, with 0195's measurement quoted in the failure message; the status CHECK admits exactly the
   four words and **refuses `unavailable`**; the eight named bodies are **byte-identical to their measured pre-image
   sha256**; `0109:361`'s exactly-one-`get_context_pack`-overload assertion is green; `work_knowledge_reads` is
   RLS-forced, **privilege-free to every application role even after the seventh door is granted** — the door is
   SECURITY DEFINER and the RELATION gains no SELECT, which is the whole reason `DECISIONS.md:83` mandates a door
   rather than a grant — append-only, no-truncate and empty.
9. **Gate module** `packages/db/tests/knowledge-retrieval-preintegration-gate.mjs` (stable stem, **no number** — §2.2),
   registered as ONE `--import ./tests/knowledge-retrieval-preintegration-gate.mjs` line in `packages/db/package.json`'s
   chain **after `preview-invite-preintegration-gate.mjs`** (the chain is in **migration order, not alphabetical**; at
   integration yours lands after 0229's and before 0231's). **Cohort** `KNOWLEDGE_RETRIEVAL_0230_COHORT` in
   `packages/db/tests/rig-meta.mjs` (the number lives on the cohort constant — `PREVIEW_INVITE_0224_COHORT` at `:2311` is
   the shape), split human / runtime / ungranted the way `KNOWLEDGE_0192_*` is at `:1826-1851` — **human** =
   `work_knowledge_drift`, `list_work_knowledge_reads_for_record`; **runtime** = `retrieve_knowledge`,
   `read_knowledge_record_for`, `read_knowledge_history_for`, `record_work_knowledge_read`, `work_knowledge_drift_for`;
   **ungranted** = `_work_knowledge_drift_core`. A focused run of your
   battery **without** its gate must FAIL loudly below 0230.

### Runtime — three NEW non-frozen modules, no successor, no `registry.ts` edit

- **`packages/runtime/lib/knowledge-retrieval.mjs`** — `retrieveKnowledge(sql, {clientId, firmId, purpose, asOf, keys,
  limit})` (never null, never throws), `renderRetrievedKnowledge(answer)` (the three-status block; **`partial` must not
  read as either neighbour**), `recordWorkKnowledgeRead(sql, …)`, `readKnowledgeDrift(sql, firmId, workId)`. It
  **delegates the envelope discipline to `lib/knowledge.mjs` rather than restating it**, the way `knowledge-conflicts.mjs`
  does (`:19-24`) — a second copy is how two lanes come to disagree about what an unreadable pack means. **No module-level
  `node:` import**, absolutely, for `knowledge.mjs:44-64`'s measured reason (the WDK compiles this closure into a VM script
  where `require` is undefined; the failure is a RUN-TIME one no build gate sees). It exports the ONE mapping,
  **`faceStatusOf(answer)`**: `{status:'ok'}` → `ok`; `{status:'ok', truncated:true}` or core-ok/remainder-failed →
  `partial`; `{status:'unavailable', reason:'refused'}` → `denied`; `reason` in
  `read_failed|malformed|no_client|no_purpose` → `unknown`. **The runtime keeps `unavailable`; no face and no DB column
  ever says it.** The file header states that the moment `claraWork_v5` imports it, freeze-lint hash-locks it — so durable
  rules live in 0230.
- **`packages/runtime/lib/capability-registry-v2.mjs`** at `clara-capability-registry/v2` — v1's five entries plus
  `accounting_work.retrieve_knowledge` and `accounting_work.inspect_knowledge_source`, both `modelBound: true` under the
  existing `accounting_work` purpose. A **sibling**, never an added export to the frozen v1 (`layout-sandbox.mjs`'s
  precedent in `frozen-workflows.json`). Without it the two new reads write trace rows carrying an id v1 does not know,
  `capability()` returns null, and the trace says "someone read something and this machine does not know what".
- **`packages/runtime/lib/work-trace-bounds.mjs`** (#847's module — §1.3 names it among the NEW modules "written by its
  ticket's worker"; #658 is the only ticket in this wave that owns #847). It mirrors 0210's two door-side bounds on the
  WRITER side: a revision-number clause `abs(v) < 1e12 and scale <= 6`, and a run-id clause
  `^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$ or !~ '[0-9]{13,}'`. **The writer's clause stays NO TIGHTER than the door's**
  (§1.2) — a writer stricter than the door loses rows that the database would have accepted, and `traceSafely` swallows
  the loss. `packages/runtime/lib/work-trace.mjs` is **not opened**. The module is imported by nothing until the v5 cut.
- **No edit to `registry.ts`**, no `_vN` file, no frozen file. `registry.ts` is not a frozen manifest key, but §1.3 puts
  the repoint in the integration worker's hands.

### Web — no new route, no `tree.ts` row, no part kind

1. **C13 register** (`components/registers/knowledge-panel.tsx`) — a freshness line beside the version it already prints
   (`:99-103`): the `knowledge_version` plus **`as_of` = the Kuala Lumpur date the view was rendered for**; and a per-row
   **`in_effect:false` mark** ("not in effect on \<date\>"), visually distinct from withdrawn and carrying a word, not a
   colour (appendix D #7). Both come from fields `list_client_knowledge` **already returns** (`0192:1013-1036`), so **no
   new door, no recut, and no human grant on any pack**. **Do not move the four existing faces.** No "partial view /
   hidden_count" banner here: the register is unbounded, so nothing on this surface is truncated.
2. **C13 record detail** (`components/registers/knowledge-detail.tsx`, route
   `app/(firm)/clients/[clientId]/knowledge/[recordId]/page.tsx`) — a **"Work that read this record"** list: the human
   half of AC5's historical basis, read through the new seventh door via ONE `callDoor` wrapper in
   `apps/web/lib/registers/knowledge.ts` (`loadWorkKnowledgeReadsForRecord`, in the shape `loadKnowledgeHistory` already
   uses at `:204-211`). It **reuses `knowledge-shared.tsx`** (gap-658 Web item 2 — the badge idiom at `:50-90`, words
   never colour alone) and sits **below** the revision timeline, because the timeline is what the record IS and this is
   who consumed it. Each row: the Work, linked to `/clients/<clientId>/work/<workId>`
   (`app/(firm)/clients/[clientId]/work/[workId]/page.tsx`); the `knowledge_version` and `as_of` it read at; its
   `purpose`; and its face word (`ok`/`partial`/`unknown`/`denied`) with the reason — the same four words as everywhere
   else, **never a fifth**. It carries **its own** state ladder, because this read fails independently of the two the
   page already makes: loading (shape-matched `Skeleton`, no placeholder zero); successful-empty — **"no Work has
   recorded a read of this record"**, never "this record is unused" and never styled as an error; denied (its own
   `StateBanner`, distinct from the detail's, and the revision timeline stays readable beside it); failed (verbatim
   code); and **partial when `truncated` is true** ("showing the 100 most recent"). The list is **read-only**: no act
   hangs off it and it never becomes a second entrance to a Work.
3. **B3 Work detail** — a NEW component `apps/web/components/work/work-knowledge-block.tsx`, mounted in **ONE hook line**
   inside `work-detail.tsx`'s `TabsContent value="sources"`. It renders what was read (the key set and the per-tier
   counts), at which `knowledge_version` and `as_of`, with the face word (`ok`/`partial`/`unknown`/`denied`) and its
   reason. A `StateBanner` when drift is present — **on the Work AND on the question form**
   (`components/work/work-question-form.tsx`) — naming the affected keys with a re-ask action, in **two wordings because
   the door distinguishes them**: `relevant:true` → "a record this Work read has changed: \<keys\>";
   `relevant:null` (`observed_from:'trace'`) → "this client's knowledge changed after this Work last read it; which
   records it read was not recorded" — **never a confident "unrelated"**. The banner **must not clear a typed answer**.
   **`observed_revisions` is rendered inside the EXISTING `components/work/work-diagnostics.tsx` (Activity tab), as ONE
   added block** — that component already loads the trace rows through `lib/work/diagnostics.ts` (typed at `:54`,
   rendered nowhere), and a second `get_work_execution_trace` read on one page would double the request and split the
   honesty story across two components. Keep its "re-read is a READ" labelling intact.
4. **B6 chat** — **nothing ships and no kind is registered** this wave (§6). Measure whether an existing kind in
   `lib/parts/catalog.ts` can carry the knowledge-unavailable status and **report the finding**; the integration worker
   decides at the v21 cut. The card's copy, when it lands, must never be phrased as "this client has no knowledge".
5. **States on every touched surface**: meaningful loading (shape-matched `Skeleton`, **no placeholder zero**);
   successful-empty vs filtered-no-results (already distinct — keep); **partial/stale (new)**; invalid/saving on the
   re-ask (`aria-invalid` + `FieldError`, draft preserved); denied (names the restriction, no fake retry); failed read
   (verbatim code); **cancelled/recovery on a Work whose knowledge read failed**. 320px with no page-wide horizontal
   scroll; 200% zoom; keyboard and focus return to the trigger; SR names on every new banner and control; reduced motion
   respected; stable URL/Back on the record and Work routes; drafts preserved.
6. **Composition**: `StateBanner` / inline `Alert` for refusals (appendix D #2 — "a transient Toast cannot replace it";
   **no Sonner**), `Badge` for the face word (#7 — a label, never the sole action affordance or sole colour cue),
   `Skeleton` matching the content shape and stopping immediately on success/empty/denied/error (#53), `Tabs` unchanged
   (#58 — a tab switch is never a write), `Field`/`FieldGroup` for any new input (#28), the existing
   `DataState`/`EmptyState` ladder, `base-nova` tokens. **No new shadcn component** unless it goes through
   `pnpm --filter @clara/web ui:add <name> --dry-run` and `apps/web/scripts/ui-add.mjs`'s guard first.
7. **Shared-file one-liners only, at the sorted position**: `apps/web/messages/en.json` (one namespace),
   `apps/web/test/manifest.txt` (five lines), `apps/web/e2e/serve-built.mjs` (one import + one dispatch line),
   `apps/web/e2e/e2e-fixture-ownership.test.ts` (one lane row + the SHARED declarations),
   `packages/db/tests/rig-meta.mjs` (one cohort block — **the `];` repair is the known merge hazard**),
   `packages/db/package.json` (one gate flag), `.github/actions/db-live-gates/action.yml` (one step line, per-line `\`
   continuations), `CONTEXT.md` (two terms + one _Avoid_ extension).

### Docs

- **`CONTEXT.md`**, house `term` / `_Avoid_` shape, beside the existing **Knowledge pack** entry — **exactly the two terms
  DECISIONS §3.1 ratifies** (*orchestrator ruling — supersedes gap-658 Docs item 1, which proposed four*; CONTEXT.md is a
  ten-lane collision this wave and the ratified set is the budget):
  **Knowledge read status** — the four live values every face uses (`ok` / `partial` / `unknown` / `denied`) for what a
  read of a client's knowledge produced. *Avoid*: a fifth word; `unavailable` on a human surface; a version with no
  as-of; a stale view presented as current.
  **Knowledge read-set** — the exact keys, tiers and version a Work attempt actually read, recorded on that attempt.
  *Avoid*: the current version standing in for the one that was read; reporting "unrelated" when no read-set was
  recorded; reading a lagging projection as absence.
  Plus **extend Knowledge pack's own _Avoid_** with: *a pack carrying a rule that is not in effect for the period being
  worked, with no mark saying so*; and *a human surface built on the pack instead of the register (#783)*.
- **READMEs**: `packages/db/README.md` (the **seven** doors, their floors and grants, the #783 negative-grant assertion
  **and the seventh door's positive one**, the read
  relation and its **deliberate** FK absence with 0195's measurement, the no-recut tail); `packages/db/tests/README.md`
  (the battery and its cohort gate); `packages/runtime/README.md` (the two — three with #847's — new non-frozen modules
  with their freeze-by-closure warnings, the status-mapping table, the registry-v2 sibling, and **moving #847's and
  #791's entries from "owed on v4" to "owed on v5, stanza written"**); `apps/web/README.md` (the new faces, the drift
  banner's two wordings and its draft rule).
- **Never `docs/PRD.md`, never `docs/ARCHITECTURE.md`.** Record **blueprint drift** in the report instead:
  `ARCHITECTURE:183`/`:293` (pins stated as v19/v3; live pins are v20/v4); `:373-386` (writer bounds binding on v4, v4
  shipped without them — #847); `:435-445` (schema-covering bundle digest binding on v4; `claraWork.v4.bundle.ts:53`
  still hashes names only); `:297-299` (this slice **complies**; the remaining drift is the opposite one — the sentence
  names only `get_knowledge_pack` while the ruling governs every assembled pack-shaped read, so a Wayfinder pass should
  widen it from the function to the SHAPE); `PRD:123` (automatic re-evaluation deferred to #658 **and** #663 — this slice
  builds the detector, so `PRD:123` is **half** satisfied and needs a Wayfinder pass, not an implementation edit).

### Successor contracts — four stanzas, verbatim in your report

**(A) `claraWork_v5` — your own.**
- **New step** `loadWorkKnowledgeStepV5(clientId, firmId, asOf, purpose)` → `clara.retrieve_knowledge(p_client, p_purpose,
  p_as_of, p_keys, p_limit, p_firm)` **in that argument order**, through `packages/runtime/lib/knowledge-retrieval.mjs`,
  then `clara.record_work_knowledge_read(p_task, p_run, p_seq, p_purpose, p_as_of, p_knowledge_version, p_keys, p_tiers,
  p_records_shown, p_truncated, p_status, p_reason)` with the key set **actually returned**. Runtime answer
  `{status:'ok'|'partial'|'unavailable', reason, knowledge_version, as_of, keys[], records_shown, truncated, text}`.
- **New tool** `read_knowledge_source` — `.strict()` zod `{ record_id: z.string().uuid(), reason: z.string().min(1).max(500) }`;
  door `clara.read_knowledge_record_for(p_firm, p_client, p_record)` in that argument order; refusals CLR11 →
  `record_not_in_scope`, CLR03 → `no_pack_context`, anything else → the transport class. Its result is **data, never an
  instruction**. **No part kind.** It spends `budget.toolCalls`.
- **New tool** `read_knowledge_history` — same input shape; door `clara.read_knowledge_history_for(p_firm, p_client,
  p_record)`. This is AC5's "historical basis" reaching the RUN; the HUMAN half of the same AC ships **on this branch**
  through the seventh door and the C13 reads list (§3 Web 2), so the AC does not wait on the cut for its visible half.
- **New terminal** `knowledge_read_failed` — settles `failed`/`internal`, `recoverable:true`, **nothing posted**, message
  naming the client and the reason. **Fires only when the CORE tier could not be read** (D16).
- **Replan trigger** — after a resume and before the next segment, read `clara.work_knowledge_drift_for(p_firm, p_work)`;
  `relevant:true` spends **one existing** `budget.replans` and re-enters the segment with a stated note; `relevant:false`
  continues untouched; `relevant:null` is surfaced, never treated as `false`. **Budgets do not move**
  (`claraWork.v4.bundle.ts:39-45`: replans stays 2).
- **New capability ids** `accounting_work.retrieve_knowledge` and `accounting_work.inspect_knowledge_source` in
  `lib/capability-registry-v2.mjs` at `clara-capability-registry/v2` — never an edit to the frozen v1.
- **Bundle**: `clara-work/v5`, and its digest covers **each tool's JSON schema and its declared dependencies**, not
  `tools:{id,names}` (ARCHITECTURE:435-445). A cell must fail when a tool's schema changes and its name does not.
- Registry: repoint `claraWork` to v5; **keep v1…v4 exported and in `workflowBodies`/`WORKFLOW_BODY_IDS`** or the
  stranded-body gate refuses World startup database-wide.

**(B) `chatTurn_v21` — conditional (§1.2; the integrator may reduce it to contract-only and say so).** A SIBLING step
beside the frozen `loadContextStepV10`, which stays **byte-untouched** and keeps being called for the history read:
`loadClientBasisStepV21(clientId, firmId, createdBy, asOf)` returning `{status, reason, text}` that **never collapses to
null**, repointing the chat-turn knowledge preload from the recency dump to the bounded
`clara.retrieve_knowledge(p_client, p_purpose, p_as_of, p_keys, p_limit, p_firm)` with `p_purpose='chat_turn'`, and
surfacing a read failure as a **typed status** rather than `catch { contextPack = null }`
(`chatTurn.v10.impl.ts:136`). **`clara.get_context_pack` is not recut and not repointed — not one byte** (Q3, ratified:
eleven generations, six surgery markers asserted by three later files, `0109:361`/`:431`/`:436`). The five frozen
`knowledge.mjs` reasons map onto the four face words through `faceStatusOf`. Part kind: **none registered by you** —
`knowledge_unavailable` only if the integrator finds no existing kind fits (§6). Engine stamp
`llm-openai:<modelId>:chatturn-v21`.

**(C) Rider #847 — writer-side trace bounds.** `packages/runtime/lib/work-trace-bounds.mjs` (a v5 sibling module the v5
body imports; **`lib/work-trace.mjs` is never edited**) mirrors the two bounds 0210 put at the door:
`abs(v) < 1e12 and scale(v) <= 6` for an `observed_revisions` number, and
`^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$ or !~ '[0-9]{13,}'` for a run id. **The writer's clause stays no tighter than the
door's.** Sources: the ticket, `ARCHITECTURE:373-386`, `0210:32-41`, `work-trace.mjs:293-303`. The honest sentence that
replaces the current one in `packages/runtime/README.md`: *the door bounds these two fields in shape, and from v5 so does
the writer.*

**(D) Rider #882(a) — CLR40 classification.** ONE row in `claraWork.v5.errors.ts`:
`(CLR40, fa_cost_adjustment_deferred) → refusal`, carrying the door's own human remedy verbatim ("reverse the acquisition
entry and re-book it at the corrected cost", `0041:2727-2731`). The other two CLR40 reasons
(`fa_k_gl_balance_on_enrolled`, `fa_belt_unregistered_movement`, `0041:2717`, `:2733`) are **not** added by this stanza —
name them so the integrator does not widen it. A cell proves such a Work settles as a **refusal**, not as the transport
class. Source: the ticket; `claraWork.v1.errors.ts`'s keyed-on-(code, reason) table; adjacency to the FA belt, **not** to
the CLR38 depreciation family.

## 4. TDD seams (red first)

**Measure-first cells** `p658.rig.pins`, `p658.rig.closure`, `p658.core.size`, and the `no_human_grant` baseline run
**before** the migration is written (above). Everything below is red before it is green, for the stated reason.

**DB battery `packages/db/tests/knowledge-retrieval.test.mjs`** + its own cohort gate; **every assertion through
`humanQuery`/`roleQuery` least-privileged personas, never `rootQuery`** for the assertion under test (labelled fixture DML
excepted).

1. `p658.retrieve.core_first` — a client with 3 core rows and 60 remainder rows returns **every** core row, at most
   `p_limit` remainder rows, `truncated:true` and an exact `hidden_count`. *Red: the function does not exist.*
2. `p658.retrieve.period` — a rule whose `effective_to` precedes `p_as_of` comes back **marked `in_effect:false` and
   present**, not dropped; the default `as_of` is the server's Kuala Lumpur date. *Red: no door reads `effective_*`.*
3. `p658.retrieve.tenancy` — runtime lane without `p_firm` → CLR10 `pack_firm_required`; wrong firm → CLR11; a
   below-floor caller **cannot tell a real foreign client from a random uuid**.
4. `p658.retrieve.no_human_grant` — **the #783 cell.** `has_function_privilege` is false for `clara_authenticated`,
   `clara_agent_ro` and both wake roles on all three new reads; a `clara_authenticated` session calling
   `retrieve_knowledge` gets a **privilege error, not an answer**.
5. `p658.retrieve.shadow_parity` — **two personas, one answer.** The `clara_runtime` persona's `retrieve_knowledge` merge
   result is byte-identical, on the rows they share, to the `clara_authenticated` persona's `list_client_knowledge` and to
   `get_knowledge_pack`'s. This is how "one register, one pack, one answer" is proven now that the grant is not shared.
6. `p658.retrieve.legacy_unshadowed` — the five carried keys still ride in with `authoritative:true` and are never hidden
   by a knowledge record.
7. `p658.retrieve.bounds` — `p_limit` outside `1..200` → CLR10 `knowledge_limit_out_of_range`; `p_keys` naming an unknown
   key → CLR10 `knowledge_key_unknown`, **never a silent empty**.
8. `p658.retrieve.purpose_is_recorded_not_filtered` — **the C7 cell.** Two calls differing only in `p_purpose` return the
   SAME record set and each echoes its own purpose. *Red-first reason: the non-goal is asserted rather than assumed, so a
   later ticket that builds the filter has a cell to flip.*
9. `p658.inspect.record_for` / `p658.inspect.history_for` — the runtime twins answer inside the named firm, refuse outside
   it **with no oracle**, carry source metadata and **no document bytes**.
10. `p658.reads.no_work_fk` — **the 0195 cell.** No `pg_constraint` of contype `'f'` on `clara.work_knowledge_reads`
    references `clara.accounting_work`; **and** the writer still refuses a `p_task` whose task is not
    `kind='accounting_work'` or whose work belongs to another firm — proving the positive join carries the binding the FK
    would have. *Red-first reason: without it a later "hardening" pass adds the FK back.*
11. `p658.reads.append_only` — `record_work_knowledge_read` is idempotent on `(work_id, run_id, seq)`; UPDATE and DELETE
    are refused **even as `clara_fn_owner`**; no app role holds DML or SELECT.
12. `p658.reads.status_vocabulary` — the CHECK admits exactly `ok`/`partial`/`unknown`/`denied` and **refuses
    `unavailable`**, so the runtime word can never leak into the register.
13. `p658.record_reads.lists` — **the seventh door's cell.** A `clara_authenticated` viewer persona calling
    `list_work_knowledge_reads_for_record` on a record whose key a Work read gets that Work back with its `work_id`,
    `knowledge_version`, `as_of`, `purpose` and face word. *Red: the function does not exist.*
14. `p658.record_reads.floor_and_tenancy` — a below-viewer persona is refused; a record in ANOTHER firm and a random
    uuid answer **identically** (CLR11, **no existence oracle**); a read row belonging to another firm never appears.
15. `p658.record_reads.firm_scope_shadow` — for a `scope_kind='firm'` record, a client whose OWN live record shadows
    that key is **excluded** and a client with no exception is **included**. *Red-first reason: the shadow is the one
    place this door can silently lie about who was actually reading the firm default.*
16. `p658.record_reads.bounded` — more than 100 matching reads come back newest-first, capped at 100, with
    `truncated:true` and an exact `hidden_count`. *Red-first reason: an unbounded list on a detail page is how a
    record page becomes a Work directory.*
17. `p658.record_reads.no_values` — **the #783 guard.** The envelope carries no record value, no `applies_when`, no
    source bytes and no pack-shaped content; `clara_runtime`, `clara_agent_ro` and both wake roles hold **no** EXECUTE
    on this door; and `clara_authenticated` still holds **no SELECT** on `clara.work_knowledge_reads` itself.
18. `p658.drift.relevant` — moving a key the run READ makes `relevant:true`; moving an unrelated key leaves
    `relevant:false` with `drifted:true`. **The cell AC2 turns on.**
19. `p658.drift.trace_fallback` — with **no** `work_knowledge_reads` row but a v4-shaped trace present, the door answers
    `observed_from:'trace'`, computes `drifted`, and returns **`relevant:null`, never `false`**. **The cell the
    human-lane-only delivery turns on.**
20. `p658.drift.lanes` — the human door floors at viewer and binds the session firm; the `_for` twin requires `p_firm` and
    refuses another firm's Work with no oracle.
21. `p658.drift.isolation` — another firm's revision never moves this Work's drift.
22. `p658.census.no_recut` — after a replay to 0230 the eight named bodies are byte-identical to their measured pre-image
    sha256, `0103:1055-1070`'s single-`pg_proc`-row census is green and `0109:361`'s exactly-one-`get_context_pack`-overload
    assertion is green. **Cheap, decisive, and the negative the whole design turns on.**

**Runtime.** New unit battery `packages/runtime/tests/knowledge-retrieval.test.mjs` mirroring `knowledge-lib.test.mjs`'s
shape: a raising door → `unavailable` (never null, never a throw); a truncated answer → `partial`, and the rendered block
says so in a sentence neither neighbour uses; a core-read failure → `unavailable` even when the remainder succeeded;
**`faceStatusOf` maps each of the five frozen reasons onto exactly one of the four face words and never emits a fifth**.
New `packages/runtime/tests/work-trace-bounds.test.mjs` for the #847 module: the two clauses accept everything `0210`'s
door accepts (**no tighter**) and reject a 16-digit revision and a `run-<16 digits>` id. Extend
`clara-work-v5.test.mjs` **at the cut, not on this branch**: the five-plus-two roster; the two read tools spend
`toolCalls` and write nothing; the required-core terminal settles `failed`/recoverable with `posted:null`; a relevance
drift at resume spends exactly one `replan` and an irrelevant one spends none; the #882(a) CLR40 row settles as a refusal.

**World leg.** `packages/runtime/tests/work-knowledge-e2e.mjs` on the real Postgres World: admit a Work, **SIGKILL between
the knowledge read and the post**, respawn, and assert the replayed step lands on the SAME `(work_id, run_id, seq)` read
row with the same `knowledge_version`, and that exactly one entry and one receipt exist. Exact command, from
`packages/runtime`:
`PGHOST=127.0.0.1 PGPORT=55708 PGUSER=postgres PGDATABASE=clara_658 WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55708/clara_658 node tests/work-knowledge-e2e.mjs`
Register it with ONE line in `.github/actions/db-live-gates/action.yml` after the last standalone leg. **Bootstrapping a
World on `clara_658` makes `rig-isolation.test.mjs` T10b red afterwards (#866)** — report it as that, or clone
`clara_658_world` first (RIG.md).

**Web unit — five files, each added to `apps/web/test/manifest.txt` at the sorted position:**
`components/registers/knowledge-panel-freshness.test.tsx` (the `as_of` line and the `in_effect:false` mark render from the
register's own fields; the four existing faces are unmoved);
`components/registers/knowledge-record-reads.test.tsx` (the "Work that read this record" list renders each row with its
face word and links to the Work; **empty reads as "no Work has recorded a read of this record", never as an error**;
`truncated:true` renders the partial line; a denied reads-read gets its own banner and the revision timeline beside it
still renders);
`components/work/work-knowledge-block.test.tsx` (the four face words and their reasons; `partial` reads as neither
neighbour);
`components/work/work-diagnostics-observed.test.tsx` (`observed_revisions` renders key by key from the rows the component
already loads; no second trace read);
`components/work/work-question-drift-banner.test.tsx` (the banner appears on `relevant:true` **and** on `relevant:null`
with its distinct wording, never with a confident "unrelated", and **does not clear a typed answer**).

**Playwright.** Extend `apps/web/e2e/knowledge-walk.spec.ts` with an out-of-effect row and the `as_of` line **at desktop
and 320px**, and — on the **detail route the walk already visits** (`:124`) — the **"Work that read this record"** list:
a Work row carrying its version and face word, the empty wording, the `truncated` line, and a denied leg that leaves the
revision timeline readable. The verb is answered by the EXISTING `apps/web/e2e/knowledge-mock.mjs`, which already answers
`get_knowledge_record` (`:509`) and `get_knowledge_history` (`:521`); it keys on a record id **this lane minted**, so it
is scopeable and needs **no** `unscopeable` entry beside `list_firm_knowledge` (`e2e-fixture-ownership.test.ts:388`). NEW `apps/web/e2e/work-knowledge-walk.spec.ts` + `apps/web/e2e/work-knowledge-mock.mjs`: Work detail shows
what was read and at which version → a knowledge correction lands → the drift banner appears with the key named → the
typed draft survives → re-ask → the answer is recorded against the new version; plus 320px, 200% zoom, a keyboard-only
path with focus return, reduced motion and stable URL/Back. **Every RPC verb the mock answers is declared** in
`e2e-fixture-ownership.test.ts`'s four structures (`LANE_MOCKS` `:53`, `LANE_DECLARATIONS` `:216`, `SHARED_RPC_VERBS`
`:1106`, `CORE_RELATION_HANDOVERS` `:1311`): `work_knowledge_drift` (exclusive to this lane),
`list_work_knowledge_reads_for_record` (exclusive to `knowledge-mock.mjs`, scopeable — see the leg above),
`get_work_execution_trace`
(**declare SHARED with `journal-work-mock.mjs`**, which answers it today), `list_client_knowledge` (**shared** with
`knowledge-mock.mjs`), plus every Work-detail verb your walk needs. **`retrieve_knowledge` is NOT a mock verb** — no web
read calls it. POST bodies are read **only** through the shared `readCachedJson`.

**C34.3 cells** in `packages/runtime/tests/wave-b-wiki-projection-unit.test.mjs` — one per probe (`:341-346`, `:348-353`,
`:612-615`): a MISSING function yields the named skip receipt, never a throw; an ADDED overload of the same name is
**still not matched**. Gate these on measure-first #2.

## 5. Risks

- **Merge collisions, exact files and whose hunk wins.** `components/work/work-detail.tsx` (1332 lines) — **three lanes**:
  you own the Sources tab's new content, #655 adds ONE link block inside an existing block, #636 adds ONE "part of batch
  X" row; **integration sequence #658 → #655 → #636**; do not restructure the tabs. `knowledge-panel.tsx` — yours this
  wave; #663 rewrites it next wave. `messages/en.json` — ten lanes, and **#635 REPLACES `Settings.unbuiltNote`**; keep
  yours to one namespace. `rig-meta.mjs` — nine lanes; the `];` repair is the known hazard. `packages/db/package.json`
  gate chain — nine lanes, **migration order not alphabetical**. `action.yml` — nine lanes, per-line `\` continuations.
  `e2e-fixture-ownership.test.ts` — nine lanes across four structures, **nine shared verbs**. `CONTEXT.md` — ten lanes,
  ~37 terms. **Not** `lib/parts/catalog.ts`, `PartRenderer.tsx`, `tree.ts` or `registry.ts` — you touch none of them.
- **Blast radius of every recut: none, and the tail is what proves it.** The only way this slice can break another lane is
  a wrong pin or an accidental overload, and cells 4, 12, 17 and 22 are the walls.
- **Census suites will red on files you never touched.** `packages/db/tests/operation-census.test.mjs` and
  `rig-isolation.test.mjs` (new SQL functions — run both, without the reset flags); `apps/web/tests/sql-oracle.test.ts`
  (every new SQL function joins its corpus); `tests/parity-holes.test.ts`; `tests/firm-scope-surfaces.test.ts` and
  `firm-scope-fourth-entrance.test.ts` (new files under `app/**` or changed hrefs — you add neither; run them anyway);
  `e2e/e2e-fixture-ownership.test.ts` (every new mock verb); `lib/navigation/tree.test.ts` (no href change — confirm).
  `kp.01`'s ten-entry `deepEqual` must stay green: **no lane mints a knowledge key this wave.** Budget a whole-suite run.
- **`knowledge_keys` is append-only on UPDATE *and* DELETE** (`0192:185-189`). Define the CORE tier from **existing**
  columns (`kind`, `authority_bearing`) plus the legacy-carried list. Anything per-key and new is a side table in
  `0220:368`'s shape **with owner ratification first** — and C7 says you build none.
- **A required-read terminal can stop legitimate accounting.** Measure-first #3 is the mitigation; if the core is large,
  report before the terminal ships.
- **Widening what a run retrieves changes what EVERY Work sees.** Core-first tiering changes the prompt for every client
  and purpose at once. Keep the rendered block's shape stable enough that `v4.knowledge.*`'s assertions carry forward, and
  state that the behavioural effect is **unmeasured** (no hosted pilot exists).
- **`observed_revisions` is a closed vocabulary with shape bounds at the door** (`work-trace.mjs:283-286`, `0210:32-41`).
  A key LIST will not fit; the read-set goes in the new relation. Anything stuffing keys into `observed_revisions` is
  refused CLR10 `invalid_trace` **at run time, not at build time**, because the writer side is still ungated (#847).
- **The `claraWork_v5` cut carries up to SIX tickets' contracts and you write four of them.** #915, #931 and #933 remain
  unwritten; that reconciliation is **integration work with its own budget, not yours**. Do not write their stanzas.
- **IMPORT-ESCAPE.** The moment v5 imports your modules they hash-lock forever. Durable rules in 0230. The
  `periodic-adjustment-basis.ts` precedent shows the trap has sprung once already.
- **Stranded-body gate.** A CI leg sharing a database with another lane's parked run refuses to boot database-wide.
- **#783 will be re-litigated** by whoever wants the register and the pack to converge; the ruling lives in
  `.out-of-scope/`, not in a migration. The positive tail assertion naming #783 is the cheapest durable defence — and the
  report must name the file so the next reader finds it.
- **The seventh door is the ONLY human path into a FORCE-RLS relation, so its floor IS the wall.** Two failure modes to
  test rather than reason about: a firm-scope record whose list silently includes clients that never read the default
  (the shadow — cell 15), and a record page that quietly becomes a Work directory (read-only, capped at 100, no record
  value — cells 16 and 17). `DECISIONS.md:83` mandates the door; nothing in it licenses a `grant select` on
  `clara.work_knowledge_reads`, and the tail refuses one.
- **Host contention.** Ten lanes; `next build` may panic `0xc0000142` — **retry once (#869)**. Do **not** "fix" the known
  Windows-only reds: #707 (grep shell-out), #693 (EICAR quarantine), no `pg_dump` on PATH, the
  `thread-live-clarify.test.tsx` whole-suite load flake (re-run alone and report both), `rig-isolation.test.mjs` T10b
  after a World bootstrap (#866). **Local ≠ hosted: every claim is local; write "hosted evidence pending".**

## 6. Effort and rig

**Effort: XL** (§7) — **seven** new governed functions plus an ungranted core, a FORCE-RLS append-only relation with a
derive-not-declare writer, a negative-grant assertion **and the seventh door's positive one**, and a no-recut census
over eight measured pins; **three** new
non-frozen runtime modules; **four** successor-contract stanzas (your v5, the conditional v21, and the #847 and #882(a)
riders the integrator would otherwise reconcile from nothing); three web surfaces with the full state ladder (C13
register, C13 record detail, B3 Work detail); a new DB
battery with its own cohort gate; a new World e2e; a new Playwright walk plus mock and an extension of an existing one;
and three C34.3 probe cells. It inherits two obligations the blueprint made binding on `claraWork_v4` and which v4 did not
deliver, and it unblocks #663, #664, #665 and #673.

**Rig**: worktree `C:\Users\zhant\Desktop\clara-wt\658`, branch `impl/658-knowledge-retrieval`, PG **55708** / db
**clara_658** (`export PGHOST=127.0.0.1 PGPORT=55708 PGUSER=postgres PGDATABASE=clara_658 CLARA_ALLOW_DESTRUCTIVE=1
CLARA_RIG_DB=1`). Node 22 via `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`. **Never** set
`CLARA_RIG_ALLOW_RESET=1` or `CLARA_RIG_ALLOW_ROLE_SWEEP=1`; never run a second from-scratch chain on this cluster
(0154 pins the cluster-wide `clara%` role count at 18). **Port triple**:
`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3370 CLARA_E2E_NEXT_PORT=3371 CLARA_E2E_RUNTIME_PORT=3372`; always go through
`pnpm --filter @clara/web e2e <spec-substring>` (`npx playwright test` alone serves a STALE build, #865).

**Before the final report, run — and report counts, not adjectives:**
`pnpm typecheck` and `pnpm lint` (worktree root, both green);
the **whole `apps/web` unit suite** once (`node scripts/run-tests.mjs` from `apps/web`, ~5 min);
`packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` (**no reset flags**) — this slice adds SQL
functions;
your DB battery with the **40** `--import ./tests/*-preintegration-gate.mjs` flags copied **verbatim** from
`packages/db/package.json` (plus your own, in migration-order position), and a **focused run without your gate that FAILS
loudly** below 0230;
`node packages/runtime/scripts/check-parts-parity.mjs` and `node scripts/check-frozen-workflows.mjs` from the worktree
root — expected **no-ops**, and **the green is the evidence for the "no frozen byte moved" verdict**, so run them and
report the counts; `--print-closure` for measure-first #2;
`node scripts/check-wiki-dynamic-sql.selftest.mjs` (C-84);
the World leg's exact command above, with its exit code.

**Copy the house shapes from**: `05f8c056` (#644 — `0192` + its doors + the non-frozen runtime helper: header voice,
floors, grants, `_knowledge_row_json`'s one-shape rule); `165cce0f` / `1251e374` (#654 — `0220`'s side-table idiom,
fail-closed eligibility, `get_knowledge_applicability`'s `as_of`); `892bb1b7` and `1310d028` (`0195` — the FORCE-RLS
append-only relation, the derive-not-declare DEFINER writer, the deadlock-discipline header and the ACL/FK tail);
`a59d39ed` (#784 — `0209`'s pinned legacy expression); `c19a0c91` (#811 — `0210`'s shape bounds, the source of #847's
clauses); `ac1dd6e6` (#643 — `0194`'s prestate/tail/gate/cohort shape); `12cdc528` (the 2026-09-15 successor cut — what a
stanza has to say so the integrator can cut from text alone); and
`docs/plan/active/refresh-wave-2026-09-15/brief-649.md` + `../refresh-wave-2026-09-14/brief-640.md` for the slice shape.
Read `reports/649-final.md`-era reviews for what a reviewer later demanded: **behavioural** cells rather than `prosrc`
assertions, re-measured rather than copied evidence, an explicit merge-order collision table, and every claim carrying the
command that produced it with its pass/fail counts.

## Verifier findings not applied

**None. The single finding (F1, blocker) was APPLIED IN FULL; nothing was refuted back.**

- **F1 — `contradicts_decisions`, applied.** Verified at `DECISIONS.md:83`: the 0230/#658 row mandates a **SEVENTH**
  door, `list_work_knowledge_reads_for_record(p_record)` (`clara_authenticated`, SECURITY DEFINER, viewer floor,
  client-scoped), "so C13's record detail can list the Work that read a record — AC5's 'historical basis' half needs it
  and the relation has no app-role SELECT". A grep over `DECISIONS.md`, `SYNTHESIS.md` and `gap-658.md` returns that one
  occurrence and no retraction later in the file, §6's reconciliation included; `gap-658.md:345` (Proposed slice, Web
  item 2) asked for exactly this list, reusing `knowledge-shared.tsx`, before DECISIONS ratified it into a concrete
  door. The draft's AC5 row therefore cited its own descope to a ruling that says the opposite. Applied: §3 migration
  object **6** builds the door (floor, grant, record-derived scope, key join axis, firm-scope shadow, 100-row bound,
  envelope); the tail asserts its grant positively and re-proves that the relation itself gains **no** app-role SELECT;
  §4 adds cells `p658.record_reads.lists` / `.floor_and_tenancy` / `.firm_scope_shadow` / `.bounded` / `.no_values`
  (old cells 13–17 renumbered 18–22); §3 Web 2 restores the C13 "Work that read this record" list on
  `knowledge-detail.tsx`, reusing `knowledge-shared.tsx`, with its own state ladder and a fifth web unit file; and the
  AC5 row, the top decisions bullet, the READMEs and the Effort section now read **seven** granted functions.
