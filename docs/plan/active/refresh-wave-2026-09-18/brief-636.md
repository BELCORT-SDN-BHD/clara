# Brief: #636 — 让资料充分的批次项目继续，缺资料的独立等待

*C1 Source intake → B3 Work list/detail — a durable parent summary over client-attributed child Work: 95 finish while
5 wait, cancel-remaining keeps every committed receipt, and no number on the surface is one the database did not count.*

## Orchestrator decisions (binding)

- **Migration `0229` only**, ONE file `packages/db/migrations/0229_intake_batches.sql` (DECISIONS §2, row 0229 —
  binding). It **RECUTS NOTHING** (§2 "Recuts: none"), and the tail *proves* that by pinning twelve live bodies
  byte-identical. Numbers are a merge order, not a dependency order (§2.1); a released number is a gap, never a
  renumber (SYNTHESIS §2.4 rule 1).
- **Every pin is MEASURED on your rig, never transcribed** (§2.2; SYNTHESIS §7.4 #1, K4). You recut nothing, so all
  twelve are **non-regression** prestate pins taken off `pg_proc.prosrc` on `clara_636` after `pnpm db:migrate`, and
  re-asserted in the tail: `_tf_accounting_work_immutable` (created `0178:370`, live **`0200:251`**, frozen array
  `0200:255-257`), `_assert_journal_source_refs` (`0182:496`), `_admit_accounting_work_core` (`0194:1062`),
  `cancel_accounting_work` (created `0184:1216`, live **`0199:201`**), `_work_door_ctx` (`0184:231`),
  `create_document_intake` (`0007:1825`), `finalize_document_intake` (0007 → `0015:3431` → `0026:234` → 0051 §5
  **dynamic splice** → live **`0125:730`**), `_reserve_document_ingest` (`0007:1632`), `_resize_document_reservation`
  (`0007:1656`), `_settle_document_reservation` (`0007:1694`), `_declared_page_ceiling` (`0007:1622`),
  `list_accounting_work` (created `0189:301`, live **`0203:214`**). Four of these are splices — a pin written from
  file text will not match and 0229 refuses to apply (`0125:134` says so about this very family).
- **D4 (§0) — the capacity wall is a WAITING state, not a raised limit.** "Blocked by the daily quota" becomes an
  explicit child dependency `awaiting_capacity`. You change **no default**, you do **not** open `firm_document_limits`
  (that surface is #635's — `0196:38-42` names it), and you do **not** edit the three reservation bodies
  (`0007:1632/1656/1694`, never recut since 0007). The UTC-vs-MYT window is a **named residual** plus a pinning cell,
  and the "move the window to MYT" ticket is filed against **#635**.
- **D5 (§0) — the batch lives on the Documents side.** A batch card on `/clients/:id/documents` and `/documents`, each
  child linking to its own Work detail; **ONE row** on Work detail ("part of batch X"); **no `list_accounting_work`
  recut** (that body is #905's, and §3.2 declares the Work-list projection frozen for this wave); **no chat entrance**
  — you write the contract and cut nothing.
- **D17 (§0) + §1.1/§1.2 — two bodies are cut this wave (`chatTurn_v21`, `claraWork_v5`), ONCE each, by the
  integration worker after the ten merges. #636 needs NEITHER and cuts NEITHER.** §1.4: everything in your slice ships
  without a cut except the chat entrance, which is "contract delivered, entrance pending" (§1.4 names it).
  **§6 "Part kinds": you register none — `intake_batch_accepted` stays contract-only.** Do not open
  `apps/web/lib/parts/types.ts`, `catalog.ts` or `PartRenderer.tsx`; the parity pair is untouched this wave
  (SYNTHESIS §3.1).
- **§1.3 — no implementer cuts a body, edits a frozen file, or edits `registry.ts`.** Your lane's freeze fact, and the
  reason your logic goes in a NEW module: `lib/intake.mjs` is **one manifest line from freezing** via five real
  reverse importers (`invoiceFacts.v1.services.mjs:9`, `statementFacts.v1.services.mjs:19`,
  `statementFacts.v2.services.mjs:31`, `witnessFacts.v1.services.mjs:27`, `witnessFacts.v2.services.mjs:38`), none of
  which is in `frozen-workflows.json` today (SYNTHESIS §0, §1.6). Therefore **all new runtime logic goes in
  `packages/runtime/lib/intake-batches.mjs` and the attach call hangs on `src/intakeRoutes.ts`, never inside
  `lib/intake.mjs`.** The batch id **must not enter `documentIngest`'s step IO** — that would be `documentIngest_v3`,
  which §1.1 says nobody cuts.
- **§6 F6 (the orchestrator's explicit ruling on gap-636 Q2) — the child is the MEMBER ROW**, carrying up to three
  identities in order (intake always, document once in custody, Work once admitted), and **the three populations are
  reported separately**. A Work needs a non-NULL *active* client and a bookkeeper+ author (`0194:1086-1113`), so an
  unattributed file can never be a child Work — it is a member with two of three identities.
- **Q3 ruled — #636 is a GROUPER, never a producer.** "No `accounting_work` minting at intake" stands
  (`refresh-wave-2026-09-15/DECISIONS.md:53`); #655/autodraft own document→Work admission (§3.2: "#636 never mints a
  child Work; it joins whatever Work names the document").
- **Q6 ruled (A) — orchestrator ruling, closes the one open half of gap-636 Q6.** Cancel goes through the runtime
  route (`POST /api/intake/batches/:id/cancel` → `cancel_intake_batch` → immediate fan-out of
  `cancel_accounting_work`); the sweep arm owns **resume only**. Reason: the accountant sees *正在停止* on the press,
  which is what AC4 and `appendix-C-journeys.md:82` require, and the fan-out's caller must be able to reach
  `cancel_accounting_work`, granted to `clara_runtime` **and nobody else** (`0199:371-372`, re-granted `0184:1365`;
  `apps/web/lib/work/api.ts:467-471` states why the web cannot call it). The three write doors were never open
  (gap-636 Q6's own evidence).
- **The parent STORES the cancel decision — `cancel_requested_by`, `cancel_op_key`, `cancel_requested_at`.**
  *Orchestrator ruling, and it is load-bearing*: `_work_door_ctx` reserves `cancel_accounting_work` under
  `_hash(jsonb_build_object('work', p_work, 'author', p_author))` (`0184:262-264`), so a resumed fan-out that passes a
  **different** author with the same derived key raises CLR10 `op_key_conflict` (`0184:262-270`) on every child. The
  resume arm therefore re-issues with the **stored** actor, never the sweep's identity. Measure it first
  (`p636.batch.derived_key_author`).
- **A SIXTH verb, `sweep_intake_batch_cancellations(p_limit int)` — a BRIEF-WRITER ADDITION, not in DECISIONS §2's
  object list; flagged for orchestrator confirmation before the migration text is written.** §2 (`DECISIONS.md:82`)
  enumerates four write doors plus one read and requires a resumable fan-out ("new `lib/reconciler-batches.mjs` arm
  registered beside the other nine") **without naming how that arm finds its worklist**; no ruling anywhere in
  DECISIONS or SYNTHESIS mentions this verb. It is the brief-writer's own technical necessity, and the necessity is
  measured: `clara.operation_receipts` carries **no `clara_runtime` grant and no `clara_runtime` policy** — 0178
  asserts BOTH in its own executable tail (`0178:1619-1630`; the grant roster is `0178:457-463`) — and §2 gives the
  runtime SELECT on the two CHILD tables only, so the pool can read neither the committed receipts that decide which
  children are still live nor the parent row that carries `cancelling`. A `clara_runtime`-only SECURITY DEFINER
  worklist verb on the `release_held_document_tasks(int)` / `wake_due_plan_occurrences(int)` precedent (bounded,
  oldest-first, no op key), which also performs the terminal flip, is the only shape left. *It also corrects gap-636
  §Migration 4a / §Runtime, which had the arm deriving live children from `clara.operation_receipts` and finding
  parents in `clara.intake_batches` **from the runtime pool** — measured impossible.* **Accept the consequences
  knowingly**: the file installs SIX granted names, not five, and item 13's cohort plus the grant censuses bind CI to
  six. **If the orchestrator refuses the sixth name**, the fallback is stated and buildable — drop the sweep, let
  `cancel_intake_batch`'s stored child list be the only worklist, and the resume arm has nothing to resume from after
  a process death: `p636.batch.cancel_resume` and AC7's recovery half then become a **named residual** and a follow-up
  ticket. Nothing else about §2's roster moves either way.
- **Ownership (§3, binding).** You **OWN**: `packages/db/migrations/0229_intake_batches.sql`;
  `packages/runtime/lib/intake-batches.mjs`, `lib/reconciler-batches.mjs` (new);
  `apps/web/components/documents/*` (the batch card and its dialog) and `documents-workbench.tsx`;
  `apps/web/components/firm/documents/unassigned-sources.tsx` (the same card, read-only mount — no other lane touches
  it this wave); `apps/web/lib/documents/intake-batch*.ts`. You may touch with **ONE commented hunk each**:
  `packages/runtime/src/intakeRoutes.ts` (optional `batch_id`, two new routes, and — **only if cell 2 measures
  `internal`** — the one-line `recordCapacityWait` call in the finalize route's existing catch arm),
  `packages/runtime/lib/reconciler.mjs` (one import line in the block at `:27-34`, one `belt(...)` call after
  `:754`'s accounting-work belt), `apps/web/lib/documents/intake.ts` (`BeginOpts.batchId` + the body field),
  `apps/web/lib/documents/useUploadQueue.ts` (one option, passed through at `:278` — **#642 owns this hook's
  signature**; additive and commented, and #642 must not remove it), `apps/web/components/work/work-detail.tsx` (ONE
  row via one hook line; integration sequence **#658 → #655 → #636**). You must **NOT** open: `lib/intake.mjs` (the
  freeze edge), `lib/parts/*` + `PartRenderer.tsx` (no part kind), `lib/firm/needs-you.ts` (§3: **NO new row kind this
  wave**, carried from 2026-09-15 §1.6), `components/clara/*` / `ClaraThreadView.tsx` (#642),
  `components/firm/client-workspace-overview.tsx` (#660 owns it; §3 allows #636 "at most one link — prefer none":
  **prefer none, and this brief rules none**), `components/bank/*` (#657), `app/(firm)/page.tsx` + `firm-home/*`
  (#659), `/settings/*` (#635), `lib/journals/api.ts` (#655), `packages/db/migrations/0007*/0178*/0182*/0194*/0199*/
  0203*` or any merged migration.
- **No new route and no `tree.ts` leaf** — *orchestrator ruling; supersedes SYNTHESIS §3.1's "#636 = E (new leaf)"
  row.* The batch is `?batch=<uuid>` URL state on the two Documents leaves that already exist
  (`lib/navigation/tree.ts:346` client `documents`, `:227` firm `documents`), on `lib/documents/url-state.ts`'s own
  `?document=` idiom. Reason: D5 puts the batch on the Documents side, and a new file under `app/**` reds
  `tests/firm-scope-fourth-entrance.test.ts` and `tests/firm-scope-surfaces.test.ts` for no product gain.
- **CONTEXT terms you write (§3.1, ratified — house "term / _Avoid_" shape):** *Intake batch*, *Batch member*,
  *Member dependency* (awaiting_fact / awaiting_attribution / awaiting_capacity). Every other addition is the
  integrator's union at the sorted position.
- **Boundaries ruled (§3.2).** #636 ↔ **#664**: #636 owns the grouping relation and its doors; #664 becomes a second
  PRODUCER that opens a batch with `origin='chat'`. The three mitigations are **binding** — firm-scoped relation,
  **nullable child client from day one**, `origin` CHECK that already admits `'chat'`. #636 ↔ **#655**: #655 owns
  document→Work admission, #636 owns the parent and the join. #636 ↔ **#642**: #642 owns the composer and
  `useUploadQueue`'s signature; you add the transport field only. #636 ↔ **#659**: share the vocabulary
  (`coverage`, `reason`, count-distinct, no sums), not the door. #636 ↔ **#635**: you build **no** limits editor.
- **Riders and non-goals (§5), stated in code comments AND in the report:** **#905** is not folded — no
  `list_accounting_work` recut; state the started-vs-posted divergence on the surface. **#876** is not folded — #636
  does its own set-shaped filing join internally, and does not build a second batched filings reader. **#904** stays
  #904's: the batch card uses `useSettlePoll` with its own `resetKey` and refreshes without a reload; you state the
  residual rather than silently fixing a sibling's indicator. **#636 mints no Work and raises no quota.** No new
  `accounting_work` column, no new `purpose`, no new `source_refs` kind, no new needs-you row kind, no part kind,
  **no new `clara.event_types` / `clara.trigger_taxonomy` row and no `clara._append_event` call** — the slice writes
  its history into its own append-only ledger instead (see **§3 item 14** for the reason and the `0199` §I precedent
  it deliberately does not copy; `clara.domain_events` (`0005:79`) is the log those types route, and this slice
  appends to it nowhere).
- **DECISIONS §7's note "World leg with 100 intakes" (`DECISIONS.md:243`) is SUPERSEDED — stated, not silent.**
  *Orchestrator ruling — supersedes the §7 Notes phrase only (§2's roster and §0 D4 are untouched).* The same file's
  §6 makes the capacity arithmetic a measurement #636 owes before it writes anything (`DECISIONS.md:213` — "#636 —
  the capacity arithmetic on a migrated rig"), SYNTHESIS §7.4 #12 says the re-derivation is "prerequisite work, not
  documentation work" (`SYNTHESIS.md:746-749`), and C83.X2's own instruction is that the old figures are **discarded**.
  So the World leg's N and the battery's N are whatever cells 2–3 measure on `clara_636`, **split by file kind** —
  not the literal 100. If the measurement lands on 100, the leg runs 100 **and says that it was measured**. The final
  report quotes `DECISIONS.md:243` beside the measured N so the departure is on the record and the orchestrator can
  reverse it in one line.
- **Evidence law (§4).** Every AC and historical row closes with a red-first cell (`p636.<area>.<name>`), a
  browser-walk leg, or a **named** residual; REDESIGN rows are re-measured, never copied; new DB batteries assert
  through `humanQuery`/`roleQuery` least-privileged personas, never `rootQuery` except labelled fixture DML; a skipped
  frontier-gated battery is not evidence; local ≠ hosted — write "hosted evidence pending". Blueprints are never
  edited: record **`docs/PRD.md:120`** and **`docs/ARCHITECTURE.md:530`** under "blueprint drift" (both go stale on
  your merge) and **`ARCHITECTURE.md:134-135`** (firm-altitude batch organising still does not exist after this
  ticket — the batch is client/Documents-altitude).
- **Playwright port triple**: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3310`, `CLARA_E2E_NEXT_PORT=3311`,
  `CLARA_E2E_RUNTIME_PORT=3312`. **Rig row (verbatim, RIG.md:21)**: ticket 636 · worktree
  `C:\Users\zhant\Desktop\clara-wt\636` · branch `impl/636-work-batch` · PG port **55702** · db **clara_636** ·
  install ok 437s · 219 applied · seed ok (2 files) · smoke 219 · 0224 · PG 17.11.

## 1. Current state

**DB.** `clara.accounting_work` (`0178:301-338`) carries `id, firm_id, client_id, purpose, status, initiator,
initiator_role, intent_key, logical_op_id, basis, basis_digest, basis_origin, source_refs, current_task_id, bundle,
result, error, created_at, updated_at` plus exactly three later additions — `initiated_by` (`0184:401`),
`adjustment_basis` (`0194:243`), `supersedes`/`superseded_by` (`0200:227-231`). **No parent, batch, group, dependency
or waits-on column exists, and `document_intakes` took no `add column` at all.** Identity is frozen after admission by
`_tf_accounting_work_immutable` (created `0178:370`, recut `0184:446` → `0194:260` → live `0200:251`; the frozen array
is `0200:255-257`). The tenant-carrying composite FK target a child relation needs is
`unique (id, firm_id, client_id)` (`0178:337`); RLS is FORCE with owner + `clara_authenticated` SELECT (`0178:345-351`)
and a **SELECT-ONLY** `clara_runtime` policy whose stated reason is "the run must be able to read the Work it was
handed" (`0178:352-365`). `clara.operation_receipts` gets the owner policy and `clara_authenticated` SELECT only
(`0178:459-463`) — **no runtime grant anywhere in the estate.**
Purpose is a closed three-value vocabulary in four enforced places (`0194:228-230`, `:232-233`, `0194:1080-1084`,
live core `0195:1711`), and 0221's header states the consequence — *"A FOURTH PURPOSE CANNOT POST"* (`0221:18-36`) —
shipping a new relation instead. That is the shape this ticket inherits.
Admission: `_admit_accounting_work_core(...)` (`0194:1062`), nine checks in a fixed order, client **active** at
`:1110`, bookkeeper+ at `:1106`. Evidence: `_assert_journal_source_refs(p_firm,p_client,p_source_refs,p_check_filed)`
(`0182:496`), `kind in ('chat_task','document')` (`:513`), **at most ONE document per Work** (`:520-527`) — the
one-file-one-child mapping is already law, and it is what makes a lane-agnostic join possible.
Cancel: `cancel_accounting_work(p_work,p_author,p_op_key)`, live body `0199:201`, granted **`clara_runtime` only**
(`0199:371-372`). Shared preamble `_work_door_ctx` (`0184:231`): no existence oracle (CLR11 `work_not_found` for both
a missing Work and a non-member), CLR04 `actor_not_active` / `insufficient_role`, then `_reserve_op` over
`_hash({work, author})` with CLR10 `op_key_conflict` on a hash mismatch (`0184:270`) and **CLR13 `operation_in_flight`** on a
reserved-but-unfinished key (`0184:274`). Five arms: already_completed (books asked FIRST, no reversal, receipt named, run still
asked to abort — `0199:230-272`), already_terminal (`:274`), converge-a-terminal-run (`:282`), already_stopping
(`:295`), no-engine-run (`:316`); every arm returns through `_finish_op`, so a replay is byte-identical.
Intake: `document_intakes` (`0007:100-145`) has **no client column**, `unique(id, firm_id)` `:127`,
`unique(firm_id, op_key)` `:128`, eight statuses `:109-111`, nine failure codes `:115-117` (including **`limit`**),
`ck_document_intakes_terminal_doc` making `document_id` non-NULL **exactly** at `finalized`/`adopted` (`:137-139`),
FK `(document_id, firm_id) → documents(id, firm_id)` (`:129-130`). Capacity: defaults `docs_per_day` 100 /
`pages_per_day` 1000 (`0007:366-367`, function-level `coalesce` at `:1638-1640`), the five-rung ladder
`_declared_page_ceiling` — **image `1`**, ≤1MB `10`, ≤5MB `50`, ≤10MB `100`, else `200` (`0007:1622-1630`) — and both
guards refuse **only on `>`** (`:1645`, `:1648`), so exactly 100 files and exactly 1000 pages pass and the 101st
fails; refusals are `CLR18` with the messages `document daily limit reached (docs)` / `(pages)` (`:1646`, `:1649`)
and **no `detail.reason`**. The day window is `date_trunc('day', now() at time zone 'utc')` at `:1644`, `:1672`,
`:1709` — a reset at **08:00 Asia/Kuala_Lumpur**, contradicting the house rule (GAP-ORDER §2) and 0214's own MYT
window (`0214:288-292`). The serialisation family is **six** advisory-lock sites, not four: `0007:1637`, `:1661`,
`:1683`, `:1698`, `:1761`, `:2117`.
`create_document_intake(p_uploaded_by,…,p_op_key)` (`0007:1825-1841`) is the precedent your write doors copy
step for step: SECURITY DEFINER, **actor explicit**, membership + `role_rank('bookkeeper')` inlined, never
`_human_ctx`, `_reserve_op`/`_finish_op`, `_audit`, CLR11 with no oracle — granted to **`clara_runtime` alone**
(`0007:2780-2799`). `_human_ctx` (`0004:299-309`) reads `jwt_sub()`/`jwt_firm()` and raises CLR04 without them, so it
is **unreachable from the runtime pool**; `authenticate()` decodes the JWT in Node and passes the actor on as an
argument (`intakeRoutes.ts:1-15`, `:91-96`). Reads: `document_intakes_visible` (`0007:2233`) and
`document_processing_tasks_visible` (`0007:2238`), both `security_barrier` since `0144:315`, both
`clara_authenticated`-granted at `0007:2747`; `document_filings` (`0007:63`, live filing = `retired_at is null`)
granted at `0007:2740`; `agent_interruptions` SELECT to `clara_authenticated` at `0006:785`; `_work_run_attempts`
(`0189:251`) refuses a null array or **more than 101 ids** with CLR10 `invalid_work_ids` (`0189:262-274`).
The envelope you copy is `get_client_work_pack` (`0214:234`): inline bookkeeper floor restating `0189:344-347`
because an INVOKER body cannot call `_human_ctx` (`0214:262-274`), preview clamped 1..25 (`:283-286`), count over
**DISTINCT** Work ids, completion = a **committed `operation_receipts` row** never `status='completed'` (`0214:40-57`),
a completion it cannot date driving `coverage='partial'` + `uncounted_completions` with reason
`completions_without_receipt` (`0214:406-412`), `computed_at` as the read instant, **no total key**, facets that
overlap and are never summed (`0214:414-446`).
Two batch-shaped precedents exist and teach opposite lessons: **`clara.seeding_batches`** (`0017:1252`, children
`seeding_proposals` `:1285-1305`, facets derived at read time by four live `count(*)` sub-selects `0017:4602-4610`,
`cancel_seeding_batch` `:4647` — **the shape to copy**) and **`clara.sales_backfill_batches`** (`0046:496-516`,
`admitted_count` a **stored counter an admission verb increments** at `0046:2287`, client-scoped at `:499` with one
open batch per (firm, client) at `:515-516` — **the shape to reject**).
The relation family shape you copy is 0221: parent RLS pair at `0221:456-462`, append-only child at `0221:557-563`
with `t_*_append_only`/`t_*_no_truncate` at `:565-569`, and the **lane-agnostic birth trigger** at `0221:1471-1568`
(`_tf_adv_claim_application_birth`: one indexed negative lookup first, `on conflict … do nothing`, trigger name chosen
so its sort order is the mechanism).

**Runtime.** `src/intakeRoutes.ts:57-171` — three routes, exact-allowlist CORS, router-scoped 32 kB JSON parser,
`shuttingDown()` 503 on all three; `POST /api/intake/documents` runs `authenticate` + `beginDocumentIntake` inside one
`withRuntime` transaction (`:91-96`) and finalize enqueues **one `documentIngest` run per document** (`:142`).
`lib/intake.mjs` (504 lines, **NOT frozen**): `validateBegin` (`:84-103`, takes no client and rejects any origin
outside `chat|documents_tab`), `beginDocumentIntake` (`:165`), `finalizeDocumentIntake` (`:252`),
`recoverPendingDocumentIntakes` (`:434`), `mapIntakeError` (`:496`, CLR16→404, **CLR18→429**, CLR11→403),
`failureCode` (`:155-159`) mapping only eight literal codes and **everything else to `internal`**.
`lib/reconciler.mjs`: nine belt imports at `:27-34`, the belts themselves at `:728-755` inside `runReconcilerSweep`,
each wrapped by `belt(name, run, fallback)` so one escape costs that belt only; the sweep's return spreads every
belt's counters (`:761`). `lib/pools.mjs:70` `RUNTIME_POOL_MAX` 5. Registry pins at base: `chatTurn_v20`
(`registry.ts:173`), `claraWork_v4` (`:270`), `documentIngest_v2` (`:271`).

**Web.** `/clients/:id/documents` is `documents-workbench.tsx` (386 lines) composing `upload-panel.tsx` (the LIVE
queue), `intake-receipts.tsx` (the DURABLE receipts, whose header states the rule this ticket inherits — *"Every row
here is a DURABLE record read back from the database — not the browser's memory of what it did"*, `:5-10`),
`filed-document-list`, `open-candidate-list`, `document-detail`, `document-work-links`, wired to `useSettlePoll` at
`:94-96`; selection lives in the URL through `lib/documents/url-state.ts` (three answers: `none` / `document` /
`malformed`, uuid shape-checked, `router.push` to open so Back closes). `/documents` (firm leaf) is
`components/firm/documents/unassigned-sources.tsx` — #633's unassigned population, ancestor-covered for scope.
`upload-panel.tsx` has **ONE announcement owner** (`:44-52`, `:185`: a single `sr-only role="status" aria-live="polite"`
region speaking each file's settlement once; rows are not live regions) and the only legitimate `Progress` on this
surface — a **measured** byte transfer with `value={null}` for the unmeasurable case (`:285-302`).
`useUploadQueue.ts` (477 lines) is nine states, `CONCURRENCY = 2` (`:53`), three controls with distinct meanings
(`:417-468`), everything in refs and state — **nothing durable**; the transport is `lib/documents/intake.ts`
`beginIntake` (`:49-74`) posting `{filename, mime, declared_bytes, origin, session_id?}` to
`/api/runtime/intake/documents`. `accounting-work-list.tsx:27-47` already names the five read outcomes and refuses
"caught error → empty array"; `work-detail.tsx:6-12` already forbids a progress bar, a percentage and an elapsed-time
estimate on a Work. Installed primitives include `table`, `badge`, `empty`, `pagination`, `progress`, `skeleton`,
`toggle-group`, `sheet`, `dialog`, `alert`, `card`, `tooltip` — **no new primitive is needed** (`ui/` holds 32
entries; there is no `item.tsx`; Data Table is the `components/common/data-table-card.tsx` composition).

**Tests.** DB: `work-list.test.mjs` (wl.1–wl.25), `work-cancel.test.mjs`, `client-work-pack.test.mjs` (twelve
`p650.pack.*` + its own gate module and 0214 cohort), `document-intake-receipts.test.mjs`,
`firm-document-limits.test.mjs`, `x51-intake-recovery.test.mjs`. Runtime: `intake-e2e.mjs` (real World transport,
CI `action.yml:37`), `intake-admission-e2e.mjs` (CI `action.yml:65`), `work-cancel-e2e.mjs`,
`intake-recovery-retryset.test.mjs`. Web unit: `upload-panel.test.tsx`, `documents-workbench-refresh.test.tsx`,
`documents-a11y.test.tsx`, `documents-url-state.test.tsx`, `useUploadQueue.test.ts`. Playwright:
`documents-intake-walk.spec.ts` + `documents-intake-mock.mjs`, `work-list-walk.spec.ts` + `work-list-mock.mjs`,
`work-cancel-walk.spec.ts`. Census structures: `e2e-fixture-ownership.test.ts` `LANE_MOCKS` (`:53`),
`LANE_DECLARATIONS` (`:216`), `SHARED_RPC_VERBS` (`:1106`), `CORE_RELATION_HANDOVERS` (`:1311`); the gate chain holds
**exactly 40** `--import ./tests/*-preintegration-gate.mjs` flags in **migration order**, last
`preview-invite-preintegration-gate.mjs`; `rig-meta.mjs` cohorts carry the migration number
(`PREVIEW_INVITE_0224_COHORT` `:2311`).
**Nothing in the gap map was executed.** Every claim above is source-read at `abcc5030`; §4 turns each unverified one
into a red cell you run first.

## 2. Gaps / rows

| Row | Disposition | Evidence the implementer must produce |
|---|---|---|
| **AC1** admit each adopted source idempotently and **group** it without one transaction; each child retains client, source, **dependency**, attempt, outcome identities | **partial → to build (the two it is named after).** Idempotent admission, not-one-transaction, source, attempt and outcome already ship (`0007:128`, `intake.mjs:399`, `0182:520-527`, `0007:160`, `0189:251`, `0178:322-323`). **GROUP and DEPENDENCY are absent** and are this slice's core. | `p636.batch.attach_idempotent`, `p636.batch.no_transaction`, `p636.batch.dependency_lifecycle`, `p636.batch.member_rls_child` |
| **AC2** real storage/intake + migrations + Workflow: 95 reach persistent results while 5 independently wait / fail / stay unassigned; **one poison event cannot block unrelated firms/items** | **to build (proof); mechanism `partial`.** The isolation machinery is real (`relay.mjs:419-453` per-firm round-robin, `:354-365` dead-letter-and-continue, `drain.mjs:114-120`, `reconciler-pacing.mjs:21-27`, the six-site advisory family) but **no 95/5 leg and no cross-firm poison leg exists anywhere**; `intake-e2e.mjs`'s only concurrency arm is a second PUT on the same intake (`:178-183`). | `packages/runtime/tests/intake-batch-e2e.mjs` (sized by `p636.batch.ladder_by_kind`, **not** by the prose "100" — `DECISIONS.md:243` superseded, ruling above) + `p636.poison.cross_firm`, both on YOUR rig with `WORKFLOW_POSTGRES_URL` |
| **AC3** derive parent progress from child states, count **distinct Work ids**; needs-you and active may overlap; completed = business completion; unknown totals never become a fabricated percentage | **to build.** The vocabulary is ratified and the producer does not exist: `0214:295-297` (distinct), `0214:40-51` (completion is a committed receipt), `0214:53-57` / `:59-78` (coverage + named preview limitation), `CONTEXT.md:133-138` (facets never summed; unread = unknown, not zero), appendix D item 44 (`Progress` only with a measured numerator/denominator; *"Indeterminate agent Work keeps its durable named state instead"*). | `p636.batch.distinct_work_ids`, `p636.batch.settled_is_a_receipt`, `p636.batch.facets_overlap`, `p636.batch.no_percentage`, `p636.batch.preview_bound` |
| **AC4** answer one waiting child and retry one technical failure **without repeating completed effects**; cancel remaining children while retaining completed receipts and any operation **already settling** | **partial → to build (the batch half).** Every per-Work half is built and reviewed (`0178:290-294` logical_op_id reuse; `0199:230-272` / `:274` / `:282` / `:295` / `:316`; question cascade `:309-314`). Missing: a batch-scoped cancel, a dependency object to answer against, and a single readable mixed outcome. | `p636.batch.cancel_keeps_receipts`, `p636.batch.cancel_while_settling`, `p636.batch.one_receipt_through_retry`, `p636.batch.cancel_resume` |
| **AC5** Work list/detail **and Documents** expose per-file failure/recovery and stable links after reload, pagination and worker restart | **partial → to build (the batch's own address).** Per-file failure/recovery and stable links ship (`useUploadQueue.ts:55-135`, `:333-348`, `:417-468`; `intake-receipts.tsx:5-10`; `use-settle-poll.ts:9-24`; `work-list-walk.spec.ts:107`, `:145`; `intake.mjs:434`). Owed: `?batch=` on both Documents surfaces and the reverse row on Work detail. **#904 is a live defect on this very surface** — do not inherit it, do not fix it. | `intake-batch-walk.spec.ts` reload + Back legs; `intake-batch-card.test.tsx`; the Work-detail row cell |
| **AC6** the full state ladder; scope & exact values; 320px; 200%; keyboard/focus return; SR names; reduced motion; stable URL/Back; preserved drafts; accepted shadcn/Base composition with a **persistent** outcome | **partial → to build on the NEW surface.** The taxonomy exists once on both neighbours and is copied, not invented (`accounting-work-list.tsx:27-47`, `upload-panel.tsx:44-52`). Both appendix C §3 rows are quoted **cell by cell** in §3 Web and each is a walk leg. | `intake-batch-a11y.test.tsx`, `intake-batch-keyboard.test.tsx`, the walk's 320px / 200% / reduced-motion / axe cells |
| **AC7** production-facing read/command under real least-privileged roles and current migrations; durable execution, races and recovery on the real Workflow/Postgres World; deterministic barriers and replay/current-authority checks | **partial → to build (the aggregate).** Per-object coverage is strong (wl.1–wl.25, `p650.pack.*`, `x51-intake-recovery`, both CI intake legs) and **zero of it reaches the aggregate**. | the whole DB battery through `humanQuery`/`roleQuery`; `intake-batch-e2e.mjs`; `p636.batch.cancel_resume`; `p636.batch.authority_revoked_midbatch` |
| **UI-30** (historical PARTIAL; refresh **REDESIGN**) — an agent card that offers only Cancel and says nothing | **verify-only, RE-MEASURED on the new surface** (§4 forbids copying a REDESIGN row). It governs the batch card: the parent must name what each child is doing and offer each child's own address. | `p636.card.child_addresses` (web unit): every preview row renders its own state word and its own link; the card offers at least one act besides Cancel |
| **UI-31** (historical FIXED; refresh **REDESIGN**) — a to-do row with no detail and no interaction | **verify-only, re-measured.** A child row is interactive **at the child's own altitude** (answer / retry / open), never a read-only line in the parent's table. | same cell + the walk's keyboard leg (focus returns into the table after a child row acts) |
| **C51.1** documents/runtime · **discovery** — isolated failure→retry→success asserts **one business receipt** | **partial → to build (ONE cell).** The document path is built and tested (`0051:100`, `:558`, tail `:600-606`; `x51-intake-recovery.test.mjs`; `intake-recovery-retryset.test.mjs:1-25`); **nothing asserts the business receipt.** | `p636.batch.one_receipt_through_retry` — exactly ONE `clara.operation_receipts` row for the child's `logical_op_id`. Hosted evidence out of scope |
| **C51.4** documents/authority · **preserve** — authority/ownership through the reclaim commit, incl. revoke / concurrent claim | **verify-only + ONE new obligation.** The mechanism is live-authority-recheck by construction (`0024:301-302`, `0038:6949-6950`, `reconciler-documents.mjs:18-21`, `intake.mjs:212-221`, `:291-299`, `useUploadQueue.ts:333-348`). No cell revokes **mid-batch**. | `p636.batch.authority_revoked_midbatch` |
| **C51.7** capacity · **preserve** — slot reservation and release atomically with the actual admission outcome | **verify-only + TWO live findings you must carry.** Atomicity is there (`0007:1632/1656/1679/1694`; refund `0015:3487`, `0026:299`, `0051:1163`; settle `0015:3002-3003`, `0016:3791-3792`, `0026:640-641`; `0196` preserving upsert). (i) the shipped defaults refuse this ticket's own headline; (ii) the window is a **UTC** day. Neither is fixed here (D4). | `p636.batch.reservation_atomicity`, `p636.batch.capacity_refusal`, `p636.batch.capacity_window_utc` |
| **C77.1** quality · **preserve** — recensus poll helpers; progress/deadline/error/cleanup, not a fixed iteration count | **verify-only.** Done in both layers (`apps/web/test/settleUntil.ts:1-33`; `lib/documents/use-settle-poll.ts:9-24` with five explicit bounds and an honest `exhausted`). **Add no new fixed-iteration poll**: the card reuses `useSettlePoll` with its own `resetKey`. Residual **#875** already filed and open. | `intake-batch-card.test.tsx` asserts the exhausted state + manual Refresh; no new poll primitive appears in the diff |
| **C83.X2** documents QA · **discovery** — rebuild the corpus/slot inventory and define representative acceptance **from evidence**; old figures are discarded | **to build (discovery) — and it is PREREQUISITE WORK, not documentation** (SYNTHESIS §7.4 #12). Derive, on the migrated rig, what batch size and file mix a fresh firm can admit in one day, **split by file type** (the ladder's image rung is 1 page, `0007:1625`), and state **when** the window rolls (08:00 MYT). The battery's and the World leg's N come from that derivation; the number "100" is discarded by this row's own instruction. | `p636.batch.ladder_by_kind` + the derivation written into the battery header and the final report |

## 3. Slice (one branch)

### Migration `0229_intake_batches.sql` — additive; FORCE RLS; no app-role DML; `Asia/Kuala_Lumpur` calendar days

Write the file in this order: **header → prestate pins → relations → policies/grants → triggers → helpers → doors →
reads → grants → tail census**, the 0221 shape.

1. **Header** (0221:1-45's register). One sentence of what the file adds; then the two precedents **by path:line with
   one sentence each** — `clara.seeding_batches` (`0017:1252`; facets derived at read time, `0017:4602-4610`; **the
   shape copied**) and `clara.sales_backfill_batches` (`0046:496`; `admitted_count` a stored counter incremented by a
   verb at `0046:2287`; client-scoped `:499`; **the shape rejected**) — so the next batch-shaped ticket does not land
   a third counter. Then: *this file recuts nothing*, and the twelve pins that prove it.
2. **Prestate.** The twelve measured pins listed in "Orchestrator decisions", each `sha256(prosrc)` off
   `pg_proc` on `clara_636`, plus `raise notice` in the `0194:171-196` / `0216:205-219` house idiom.
3. **`clara.intake_batches`** — the durable parent. `id uuid pk`, `firm_id uuid not null references clara.firms(id)`,
   `opened_by uuid not null references clara.users(id)`, `origin text not null check (origin in
   ('documents_tab','chat','firm_documents'))` — **`'chat'` is admitted from day one so #664 needs no migration**
   (§3.2) — `label text not null check (label !~ '^\s*$' and length(label) <= 120)` (`!~ '^\s*$'` not
   `btrim(...) <> ''`, for 0221's measured reason: one-argument `btrim` strips spaces only), `state text not null
   default 'open' check (state in ('open','cancelling','cancelled'))`, `op_key text not null`,
   `cancel_requested_by uuid references clara.users(id)`, `cancel_op_key text`, `cancel_requested_at timestamptz`,
   `cancelled_at timestamptz`, `created_at`, `updated_at`, `unique (id, firm_id)`, `unique (firm_id, op_key)`,
   `check ((cancel_requested_at is null) = (cancel_requested_by is null) and (cancel_requested_at is null) =
   (cancel_op_key is null))`. **Deliberately NO `client_id`** (the five that wait may be unattributed; `CONTEXT.md`
   *Intake receipt* already rules that an intake "carries no client, because attribution is a separate act on the
   document"). **NO stored counts** (0214's rule; `0046:2287` is the counter-example). **The state set is three, not
   four** — *orchestrator narrowing of gap-636 item 1, with the reason*: an open batch is never "settled", because
   nothing in this slice closes it and a new member may always join; "everything here is done" is derived by the read
   from the facets, and inventing a close ceremony is out of scope. The three cancel columns exist because the resume
   arm must re-issue with the **stored** actor and key (see the ruling above).
4. **`clara.intake_batch_members`** — the child. `id`, `batch_id`, `firm_id`, **`intake_id uuid not null unique`**,
   `document_id uuid null`, `client_id uuid null`, `work_id uuid null`, `dependency text null check (dependency in
   ('awaiting_fact','awaiting_attribution','awaiting_capacity'))`, `dependency_reason text null`, `created_at`,
   `updated_at`. Tenant-carrying composite FKs throughout: `(batch_id, firm_id) → intake_batches(id, firm_id)`,
   `(intake_id, firm_id) → document_intakes(id, firm_id)` (`0007:127`), `(document_id, firm_id) → documents(id,
   firm_id)`, `(work_id, firm_id, client_id) → accounting_work(id, firm_id, client_id)` (`0178:337`).
   **`unique(intake_id)` IS AC1's "admit each adopted source once"**: a second attach is absorbed, never a second row.
   Index `ix_intake_batch_members_open on clara.intake_batch_members(document_id) where work_id is null` — the cheap
   negative the Work-side trigger reads (item 8).
5. **`clara.intake_batch_member_events`** — the append-only child ledger, the `0221:530-569` shape.
   `id`, `member_id`, `batch_id`, `firm_id`, `event text not null check (event in ('attached','document_stamped',
   'work_stamped','dependency_set','dependency_cleared','cancel_requested'))`, `detail jsonb not null default
   '{}'::jsonb check (jsonb_typeof(detail) = 'object')`, `actor_id uuid null`, `recorded_at timestamptz not null
   default now()`, composite FKs, `unique (member_id, event, recorded_at)`.
6. **RLS on ALL THREE, written out one table at a time — it is NOT inherited.** For each: `enable row level
   security` + `force row level security`; `create policy p_<t>_owner … for all to clara_fn_owner using (true) with
   check (true)`; `create policy p_<t>_read … for select to clara_authenticated using (firm_id = clara.jwt_firm())`;
   `grant select … to clara_authenticated`. **No DML grant to any application role, on any of the three.** On the two
   CHILDREN only, additionally `create policy p_<t>_runtime … for select to clara_runtime using (true)` +
   `grant select … to clara_runtime` (§2 "runtime SELECT-only on the children"; `0178:352-365`'s stated ground —
   and note the divergence from 0221, which gives `clara_runtime` nothing and says so at `0221:463`: say why here).
   `intake_batch_member_events` additionally takes `t_intake_batch_member_events_append_only` (before update or
   delete, `clara._tf_append_only`, `0003:431`) and `t_intake_batch_member_events_no_truncate` (before truncate,
   `clara._tf_no_truncate`, `0003:439`) — the `0221:565-569` pair. **Why this is written per table:** the read is
   SECURITY INVOKER, so a parent-only policy would leave both children readable firm-wide and
   `p636.batch.cross_firm` would be asserting the parent's policy while the child leaked.
7. **Trigger 1 — `_tf_intake_batch_member_intake_stamp()`, AFTER UPDATE on `clara.document_intakes`.** Two jobs, both
   idempotent, both keyed by `intake_id` (already unique on the member):
   (a) **custody** — on the `document_id` NULL → non-NULL transition (`0007:114`, FK `:129-130`, CHECK `:137-139`),
   `update clara.intake_batch_members set document_id = new.document_id … where intake_id = new.id and document_id is
   null`, then one `document_stamped` ledger row. It lands here rather than at admission because `failed` and
   `unassigned` are precisely the members that never become a Work.
   (b) **capacity** — on the transition to `status='failed'` with `failure_code='limit'` (`0007:115-117`), stamp
   `dependency='awaiting_capacity'` with `dependency_reason` = the intake's own failure code, and one
   `dependency_set` ledger row. **This is D4's first-class waiting state.** Guard with `where dependency is null`.
   *Measure first (`p636.batch.capacity_refusal`): a post-custody CLR18 reaches `fail_document_intake` through
   `intake.mjs:407-418`, whose `failureCode()` (`:155-159`) maps only eight literal codes and sends everything else to
   `internal` — the eight include the literal string `limit`, but a PG error arrives with `err.code` = the SQLSTATE
   `CLR18`, which is not in the list.* **If the rig shows the intake reaches `failure_code='internal'`, arm (b) never
   fires in production**, and then the ONLY production path to `awaiting_capacity` is the explicit door
   **`clara.set_intake_batch_member_dependency`** — **item 10's third write door, NOT item 11**: item 11
   (`sweep_intake_batch_cancellations`) is the cancellation worklist and never touches a member's dependency. Reach it
   like this, exactly, because the finalize route has no human principal: `src/intakeRoutes.ts`'s
   `POST /api/intake/documents/:id/finalize` catch arm (`:125-147`) calls a new best-effort
   `recordCapacityWait(intakeId, err)` in `intake-batches.mjs`, which (i) fires only when the error's SQLSTATE is
   `CLR18`, (ii) takes `p_actor` from the intake's own sidecar `uploadedBy` (`readIntakeMeta`, `lib/spool.mjs:64`,
   written at `intake.mjs:182`; **import it, never edit it**) — the sidecar still exists on this path because
   `canonicalReached` is true and `internal` is not one of the three spool-clearing codes (`intake.mjs:424-426`) — and
   the door's own live-authority recheck re-verifies that human at bookkeeper rank, (iii) returns typed and swallows
   its own refusal: a CLR04 (the uploader's authority was revoked between upload and refusal) or a CLR11 (the intake
   is in no batch) is logged and **never turns the route's 429 into a 500**. When the door refuses, the member keeps
   only the read's derived signals and that is a **named residual** on the surface. The trigger arm (b) stays in the
   file either way, as the durable belt for the case the DB does raise `limit`. The branch is decided by the cell,
   named on the surface and stated in the report — do not guess.
8. **Trigger 2 — `_tf_intake_batch_member_work_stamp()`, ONE lane-agnostic AFTER INSERT on
   `clara.accounting_work`.** The pattern the estate ratified for exactly this problem
   (`refresh-wave-2026-09-15/DECISIONS.md:32`; the working example is `0221:1471-1568`). It reads the new Work's
   single `source_refs` document — at most one is possible (`0182:520-527`) — and stamps `work_id` + `client_id` on
   the member of the same firm whose `document_id` is that document, `where work_id is null`, then one `work_stamped`
   ledger row. **The FIRST statement must be the cheap negative**: return immediately when `source_refs` names no
   document, and otherwise look the member up through `ix_intake_batch_members_open`, which is empty on a firm with no
   open batch. **Lane-agnostic is the whole point** — #655's trade-invoice lane, the autodraft lane and any future
   producer stamp without knowing this table exists, which is what §3.2's "#636 joins whatever Work names the
   document" requires. It is a NEW trigger, **not a recut**: `_tf_accounting_work_immutable` (`0200:251`, array
   `0200:255-257`) is untouched and **no column is added to `accounting_work`**. **Named fallback, decided now rather
   than invented later:** if `p636.batch.work_id_stamp`'s no-op cost is unacceptable on the rig, `get_intake_batch`
   derives `work_id` at read time over the members' `document_id` set, the columns stay NULL until a later ticket
   stamps them, the envelope is unchanged, and the residual is named on the surface and in the report.
9. **Ungranted helpers.** `_intake_batch_actor_ctx(p_actor uuid, p_batch uuid default null)` — the inline
   live-authority recheck every write door calls: an ACTIVE `firm_memberships` row for `p_actor` with
   `role_rank >= role_rank('bookkeeper')`, firm derived from the membership, **no existence oracle** (a non-member and
   an absent batch answer identically, `0184:245`'s rule). `_intake_batch_live_children(p_batch uuid)` —
   returns `(member_id, work_id)` for members whose Work is neither terminal (`status in
   ('completed','refused','failed','cancelled','expired')`) nor holding a committed `operation_receipts` row.
   Both `revoke all … from public`, granted to nobody.
10. **Write doors — all four `clara_runtime` ONLY, actor-explicit, `revoke all … from public`, SECURITY DEFINER,
    `set search_path = clara, pg_temp`, `_reserve_op`/`_finish_op` + `_audit`, and NO `_human_ctx` twin.** The
    precedent is `create_document_intake` (`0007:1825-1841`, granted `0007:2780-2799`) and the reason is measured:
    `_human_ctx` reads the JWT (`0004:299-309`) and the runtime pool carries none. Every refusal carries
    `(errcode, detail.reason)` — the 0180 law.
    - `clara.open_intake_batch(p_actor uuid, p_origin text, p_label text, p_session uuid, p_op_key text) returns jsonb`
      — refusals: CLR10 `invalid_op_key`, CLR10 `invalid_label`, CLR10 `invalid_origin`, CLR10 `invalid_session`
      (`p_session` non-null iff `p_origin='chat'`, the `ck_document_intakes_origin` idiom `0007:131-133`),
      CLR11 `batch_actor_not_authorised` (no membership — no oracle), CLR04 `actor_not_active`,
      CLR04 `insufficient_role`. Returns `{batch_id, label, origin, state:'open', opened_at, replayed}`. **It raises
      no CLR18** — opening reserves nothing; capacity arrives per member at `create_document_intake`.
    - `clara.attach_intake_to_batch(p_actor uuid, p_batch uuid, p_intake uuid, p_op_key text) returns jsonb` —
      CLR10 `invalid_op_key`; CLR11 `batch_not_found` / `intake_not_found` (both no-oracle, both requiring the same
      firm as the actor's membership); CLR04 ×2; CLR13 `batch_not_open` when `state <> 'open'`; CLR13
      `intake_already_in_batch` naming the other `batch_id` in `detail` when the global `unique(intake_id)` is hit by
      a **different** parent. A second attach of the same intake to the **same** batch is absorbed
      (`on conflict (intake_id) do nothing`) and answers `{member_id, attached:false}`. Appends `attached`.
    - `clara.set_intake_batch_member_dependency(p_actor uuid, p_intake uuid, p_dependency text, p_reason text,
      p_op_key text) returns jsonb` — `p_dependency` NULL **clears**; anything outside the three CHECK values is
      CLR10 `invalid_dependency`; CLR11 `member_not_found`; CLR04 ×2. Appends `dependency_set` /
      `dependency_cleared` with `p_reason` carried **verbatim** in `detail`.
    - `clara.cancel_intake_batch(p_actor uuid, p_batch uuid, p_op_key text) returns jsonb` — takes
      `clara.intake_batches` FOR UPDATE; CLR11 `batch_not_found`; CLR04 ×2; CLR13 `batch_already_cancelling` naming
      the live `cancel_op_key` when the parent is already `cancelling` under a **different** key (so a second decision
      can never re-key the children); flips `open → cancelling`, stamps `cancel_requested_by/at` and
      `cancel_op_key = p_op_key`, derives `_intake_batch_live_children`, appends one `cancel_requested` row per live
      child, and **if none is live flips straight to `cancelled`** (so cancelling a batch that already finished is
      terminal at once, while `appendix-C-journeys.md:82`'s "do not show terminal cancellation early" still holds,
      because terminal is written only when nothing is live). Returns `{batch_id, state, cancel_op_key,
      cancel_requested_by, children:[{member_id, work_id}], replayed}` — and because `_finish_op` stores that result,
      **any replay returns the identical child list**, which is what makes the resume deterministic.
      **It is NOT one transaction and must not be**: the caller invokes the existing `cancel_accounting_work` once
      per child, so a child that already posted answers `already_completed` and keeps its receipt (`0199:230-272`) and
      a child already settling answers `already_stopping` (`0199:295-304`) — appendix C's *"let independent children
      continue"*, and the shape `0017:4604-4617` already uses.
11. **`clara.sweep_intake_batch_cancellations(p_limit int default 20) returns jsonb`** — **the brief-writer addition
    flagged in "Orchestrator decisions"; confirm it before you write this section, and take the stated fallback if it
    is refused.** `clara_runtime` ONLY,
    SECURITY DEFINER, bounded and oldest-first on the `release_held_document_tasks(int)` precedent (granted
    `0007:2780-2799`), **no op key** (it is a sweep, not a decision). CLR10 `invalid_limit` outside 1..100. For each
    parent in `cancelling` (oldest `cancel_requested_at` first): derive `_intake_batch_live_children`; if empty, flip
    `cancelling → cancelled` and stamp `cancelled_at` under `where state = 'cancelling'` (idempotent, convergent).
    Returns `{batches:[{batch_id, firm_id, cancel_requested_by, cancel_op_key, live:[{member_id, work_id}]}],
    settled:[batch_id …]}`. **This verb exists because the runtime pool cannot read `clara.operation_receipts` at
    all** — no grant and no policy, asserted by 0178's own tail (`0178:1619-1630`, roster `0178:457-463`) — and holds
    no SELECT on the parent (§2 grants it the two children only).
12. **`clara.get_intake_batch(p_batch uuid, p_preview int default 10) returns jsonb`** — **`clara_authenticated`
    ONLY** (*narrowing of gap-636 item 4's table, with the reason*: the sweep verb gives the runtime its worklist, and
    0214's own argument is that an attention board is a human read). SECURITY INVOKER, `set search_path = clara,
    pg_temp`, `set plan_cache_mode = force_custom_plan`, with the **inline** bookkeeper floor restating
    `0189:344-347` verbatim (an INVOKER body cannot call `_human_ctx` — `0214:262-274`). NULL `p_batch` is CLR10
    `invalid_batch`. `p_preview` clamped **1..25** (`0214:283-286`'s reason: the retry label hands these ids to a
    helper that refuses more than 101). **It reads `clara.document_intakes_visible` and
    `clara.document_processing_tasks_visible`, never the base tables** — the base tables carry no
    `clara_authenticated` grant, and the views are `security_barrier` and firm-filtered (`0007:2233-2240`, `:2747`,
    `0144:315`). Envelope:
    ```
    { computed_at, preview_limit,
      batch:  { id, label, origin, state, opened_by, opened_at, cancel_requested_at },
      facets: { admitted, settled, waiting, failed, unassigned },   -- each { status, count, coverage,
                                                                    --         coverage_reason, rows[] }
      waiting_basis: { by_question, by_dependency: {awaiting_fact, awaiting_attribution, awaiting_capacity},
                       by_unfiled, by_capacity_failure },
      capacity: { window: 'utc_day', resets_at_local: '08:00', timezone: 'Asia/Kuala_Lumpur' } }
    ```
    Facets, each over DISTINCT ids and **never summed** (`CONTEXT.md:136-138`): `admitted` = distinct `work_id` where
    non-NULL; `settled` = distinct `work_id` with a **committed `operation_receipts` row** (`0214:40-51`), carrying
    `uncounted_completions` and driving `coverage='partial'` with reason **`completions_without_receipt`** when a
    member's Work is `completed` with no committed receipt (0214's own words, `0214:406-412`); `waiting` = distinct
    members with a pending `agent_interruptions` row (`0203:398-404`'s lateral-limit-1 shape) **or** a non-NULL
    `dependency` **or** a document in custody with no live `document_filings` row **or** an intake failed with
    `failure_code='limit'`; `failed` = distinct members whose intake `failure_code` is set **excluding `'limit'`**
    (a quota block is waiting, not dead — D4) or whose `document_processing_tasks_visible.error_code` is set;
    `unassigned` = distinct members with a `document_id` and no live filing. `admitted.rows` are retry-labelled
    through `_work_run_attempts` with **at most the preview ids** and `coverage='partial'` reason
    `retry_label_preview_only` when the population is larger (`0214:59-78`). **NO total, NO percentage, NO page
    length, anywhere** (§2 binds it) — and the tail proves it. `waiting_basis` exists because the batch's waiting
    number legitimately differs from the review queue's (the queue never sees a dependency), and 0214's 裁-190 lesson
    is that a page showing two numbers over one relation must be able to explain why: state the two sources.
13. **Grants, then the tail census.** T1 — each of the six installed names has **exactly ONE `pg_proc` row** (this
    file writes its own census; `0103:1055-1070` does not reach new names — §2.2). T2 — owner, definer/invoker,
    `search_path`, and ACL for each of the six, byte-for-byte; `get_intake_batch` reaches `clara_runtime` nowhere and
    the four write doors + the sweep reach `clara_authenticated` nowhere. T3 — the three relations carry
    `relrowsecurity` **and** `relforcerowsecurity`, the exact policy roster, `clara_authenticated` SELECT on all
    three, `clara_runtime` SELECT on the two children only, and `has_table_privilege` = false for insert/update/delete
    over every application role × all three. T4 — the append-only pair exists on the events child. T5 — the **twelve
    non-regression pins** re-read from the committed catalog, byte-identical (this is the file's proof that it recuts
    nothing). T6 — both new triggers exist with their exact names, tables and events, and
    `_tf_accounting_work_immutable`'s frozen array text (`0200:255-257`) is unchanged. T7 — both purpose CHECK texts
    (`0194:228-230`, `:232-233`) are unmoved. T8 — `strpos(prosrc, '''total''') = 0` for `get_intake_batch`.
    Then the **preintegration gate module** `packages/db/tests/intake-batches-preintegration-gate.mjs` (setting
    `CLARA_ALLOW_MISSING_INTAKE_BATCHES = "1"`, the `client-work-pack-preintegration-gate.mjs` text) and **one
    `rig-meta.mjs` cohort**: `INTAKE_BATCHES_0229_HUMAN_FNS = ["get_intake_batch"]`,
    `INTAKE_BATCHES_0229_RUNTIME_FNS = ["open_intake_batch","attach_intake_to_batch",
    "set_intake_batch_member_dependency","cancel_intake_batch","sweep_intake_batch_cancellations"]`,
    `INTAKE_BATCHES_0229_UNGRANTED_FNS = ["_intake_batch_actor_ctx","_intake_batch_live_children",
    "_tf_intake_batch_member_intake_stamp","_tf_intake_batch_member_work_stamp"]`, exported as
    `INTAKE_BATCHES_0229_COHORT` (the "wholly present or wholly absent" law).
14. **NOT in this file:** no new `accounting_work.purpose`, no new `accounting_work` column, no `source_refs` kind, no
    recut of anything in 2026-09-15 §1.3's roster, no edit to the three reservation bodies (their UTC window is D4's
    named residual), **and no `clara.event_types` / `clara.trigger_taxonomy` row and no `clara._append_event` call**
    (the same pair the "Orchestrator decisions" non-goal names — one name in both places) — *orchestrator narrowing of
    gap-636 item 5, with the reason*: the coverage law requires the active taxonomy to route every catalog row, so the
    house rule is to register a type in the SAME migration that first emits it (`0199:179-182`, the executable pair at
    `0199:188-194`); this slice emits none, its history lives in its own append-only
    `clara.intake_batch_member_events` ledger, and registering a type with no producer is inventing one. #664 may
    register when it emits.

### Runtime

- **NEW non-frozen module `packages/runtime/lib/intake-batches.mjs`** — `openBatch`, `attachIntake`,
  `setMemberDependency`, `recordCapacityWait`, `cancelBatch`, `resumeCancel`, `sweepBatchCancellations`. **Nothing
  frozen imports it** (the constraint that matters — the five `*.services.mjs` reverse edges into `lib/intake.mjs`
  are why the logic is not written there); it may *import* `lib/spool.mjs`'s `readIntakeMeta` for
  `recordCapacityWait`'s actor, because an import edge pointing INTO a closure does not pull the importer in — cell 1
  prints the closure and settles it.
  `recordCapacityWait(intakeId, err)` is the item-7(b) fallback door call: SQLSTATE `CLR18` only, actor from the
  sidecar's `uploadedBy`, one `set_intake_batch_member_dependency(p_actor, p_intake, 'awaiting_capacity',
  <the DB's own CLR18 message>, p_op_key)` call, typed return, refusal swallowed and logged. It is written **only if
  cell 2 measures `internal`**; if the DB's `limit` survives, trigger arm (b) is the whole path and this function is
  not written at all (say which, in the report).
  `cancelBatch(client, {actor, batchId, opKey})` calls the door, then fans out **one `cancel_accounting_work` per
  child, one call per transaction**, with `op_key = <cancel_op_key> || ':' || <work_id>` and `p_author =
  <cancel_requested_by returned by the door>`. **Never a fresh uuid**: `_reserve_op` (`0004:46-60`) replays a stored
  result for the same `(firm, fn, op_key)` + same request hash and raises CLR10 for a different hash, so a resumed
  fan-out is a byte-identical replay rather than a second decision (D15's "one decision, one key", server-side; the
  web analogue is `work-cancel-dialog.tsx:95-107`'s `useDecisionKey`). It must treat **CLR13 `operation_in_flight`**
  as "a sibling holds this key — leave it for the next sweep", never as a failure. Every function returns a typed
  `{status:'ok'|'refused'|'unavailable', …}` — never null, never a raw throw.
- **`src/intakeRoutes.ts`, one hunk**: `POST /api/intake/documents` accepts an optional `batch_id` in the body and,
  when present, calls `attachIntake` **inside the same `withRuntime` transaction** as `beginDocumentIntake`
  (`:86-99`), so a begun intake and its membership commit together; plus two new routes, `POST /api/intake/batches`
  (body `{label, origin, session_id?, opKey}`) and `POST /api/intake/batches/:id/cancel` (body `{opKey}`, actor
  `principal.sub`, the `workRoutes.ts:1187-1220` shape). Both carry the `shuttingDown()` 503 guard and go through
  `sendError`. **Nothing about the batch enters `lib/intake.mjs`.**
- **No `documentIngest_v3`**: the workflow's step IO is untouched and the batch is read back from the DB.
- **NEW `packages/runtime/lib/reconciler-batches.mjs`** — `reconcileIntakeBatchCancellations(client, {log})`: call
  `sweep_intake_batch_cancellations(p_limit)`, and for every returned parent re-issue the fan-out for its `live`
  children **with the stored actor and the derived keys**; the verb settles the parents that have none. Registered
  with ONE import line in `reconciler.mjs`'s block at `:27-34` and ONE `belt("intake batch cancellations", …)` call
  after the accounting-work belt at `:754` (before the trace prune), returning its own counters into the sweep's
  spread at `:761`. The shape is `reconciler-work.mjs` / `reconciler-documents.mjs` / `reconciler-fa.mjs`.
- **Successor contract, written and NOT cut** (§1.2/§1.4; reproduce this stanza verbatim in your final report):

  > tool `open_intake_batch` · `.strict()` zod `{ label: string().min(1).max(120), origin: enum(["chat"]),
  > session_id: string().uuid() }` · door `clara.open_intake_batch(p_actor, p_origin, p_label, p_session,
  > p_op_key)` in that argument order · refusals CLR04 `insufficient_role` → "needs a bookkeeper",
  > CLR18 `daily_limit` → the operator remedy verbatim, CLR10 `invalid_label` → field error ·
  > part kind `intake_batch_accepted` carrying `{ batch_id, label, admitted, waiting }` and NOTHING
  > derived · `WORK_ACCEPTED_PURPOSES` needs **no** widening (children are `journal_entry` Works).

  One clarifying line **beside** the stanza (not inside it): `open_intake_batch` itself raises no CLR18; the CLR18 in
  the map is the attach half's, arriving from `create_document_intake`'s reservation. The part kind is **contract
  only** (§6) — you register nothing. **#642 and #664 own that entrance.**

### Web

- **A durable Batch card**, `components/documents/intake-batch-card.tsx`, fed by `get_intake_batch` — **not** by the
  queue's memory (`intake-receipts.tsx:5-10`'s rule). `upload-panel.tsx` stays the LIVE transfer view and the two are
  labelled as two different things. Mounted on `/clients/:id/documents` (in `documents-workbench.tsx`, above
  `IntakeReceipts`) and on `/documents` (in `components/firm/documents/unassigned-sources.tsx`, read-only apart from
  Cancel). URL state `?batch=<uuid>` through a new `lib/documents/batch-url-state.ts` written on
  `lib/documents/url-state.ts`'s idiom — three answers (`none` / `batch` / `malformed`), uuid shape-checked,
  `router.push` to open so Back closes, `router.replace` when loaded directly, every other parameter preserved.
  The facet filter is `?batchFacet=` over a 5-way `ToggleGroup` (all / waiting / failed / unassigned / settled) —
  appendix D #62; every primitive it uses is already installed, so **no `ui:add` is expected**; if one ever is,
  `pnpm --filter @clara/web ui:add <name> --dry-run` runs first and never overwrites a protected file
  (DECISIONS §6 §7.4 #15).
- **NO `Progress` element in ANY state, and no percentage-shaped string.** *Binding, and it reverses an earlier
  draft*: the door supplies no denominator by ruling (§2: "no total, no percentage"), appendix D item 44 permits
  `Progress` only for a known numerator/denominator and says **"Indeterminate agent Work keeps its durable named
  state instead"**, AC3 forbids a fabricated percentage, and `work-detail.tsx:6-12` already forbids one for a single
  Work. The card renders labelled facet counts with their coverage word (`0214:53-57`'s treatment). A bar appears
  only where it already legitimately does — `upload-panel.tsx:285-302`'s measured byte transfer, a different
  component on a different surface.
- **The eight states, each with its own copy**: loading (shape-matched `Skeleton` + one `sr-only role="status"`
  sentence); successful-empty (a batch with no members yet — what will appear and the permitted first action);
  no-results (a facet selected with zero rows while others have rows — the facet is PRESERVED and "Show all" is
  offered right there); partial/stale (`coverage='partial'` rendered with its named reason and `computed_at`);
  invalid/saving (the cancel dialog's pending label + the refusal inline, draft preserved); denied (**rows cleared**,
  the access state explained, no affordance that could only refuse — `accounting-work-list.tsx:33-35`); failed first
  read (Alert + Retry, **never** an Empty — a read that did not answer proves nothing); cancelled/recovery (a parent
  in `cancelling` shows *正在停止* and **reveals the completed receipts**; terminal cancellation is never shown early).
  The two appendix C §3 rows, quoted cell by cell, are the acceptance text for the last two:
  **Partial batch** — UI contract: *"Show actual child counts and individual outcomes; let independent children
  continue."* · state owner: *"Parent summary derives from children and distinguishes complete from merely no longer
  running."* · **Cancellation settling** — UI contract: *"Show stopping and explain that already admitted operations
  are finishing; reveal completed receipts."* · state owner: *"No new operations admitted after cancellation; do not
  show terminal cancellation early."* The clause *"let independent children continue"* is load-bearing: it is why the
  cancel fans out per child instead of flipping a parent flag.
- **320px** (columns withdrawn into the row's primary cell; the table primitive's own focusable `overflow-x-auto`
  keeps the PAGE from scrolling horizontally), **200% zoom**, **keyboard + focus return** into the table after a child
  row acts (`upload-panel.tsx`'s `rowRefs` Map idiom), **SR names**, **reduced motion**, **stable URL/Back**,
  **drafts preserved** across a refusal.
- **ONE announcement owner for the whole card** (`upload-panel.tsx:44-52`, `:185`): a single `sr-only role="status"
  aria-live="polite"` region; rows are **not** live regions — a hundred rows must never speak a hundred times.
- **The capacity copy says 08:00, never "midnight" and never "tomorrow".** A member blocked by quota renders the
  database's own reason plus the true reset moment: the window is `date_trunc('day', now() at time zone 'utc')`
  (`0007:1644`), i.e. **08:00 Asia/Kuala_Lumpur**. One string, one source, pinned by `p636.batch.capacity_window_utc`
  and asserted by a web unit cell that the string contains neither "midnight" nor "tomorrow".
- **A named residual on the surface, not only in the report**: a file refused by CLR18 **before** its intake exists
  never becomes a member (the member's FK is `intake_id`). The card says so in one sentence and points at the upload
  list, which already renders the DB's own CLR18 message and remedy (`useUploadQueue.ts:333-348`,
  `intake.mjs:501`). File the follow-up.
- **Cancel** — `components/documents/intake-batch-cancel-dialog.tsx`: one confirm performs **exactly one** governed
  call (`POST /api/runtime/intake/batches/:id/cancel`), never N calls from the dialog (`DocumentsDoorDialog.tsx:8-9`'s
  house rule) — the fan-out is the server's. ONE op key per open decision, minted with the
  `work-cancel-dialog.tsx:95-107` `useDecisionKey` idiom copied into this file with its source named (the
  `plan-lifecycle-dialogs.tsx:66` precedent for copying it).
- **Work detail** — ONE row, "part of batch «label»", linking to `/clients/<clientId>/documents?batch=<id>`, added
  through one hook line inside an existing block. **No change to the Work-list projection** (Q4; §3.2). State the
  started-vs-posted divergence (#905) beside the row rather than fixing it.
- **`lib/documents/intake.ts`** (one hunk): `BeginOpts` gains `batchId?: string`; the body gains
  `...(opts.batchId ? { batch_id: opts.batchId } : {})`. **`lib/documents/useUploadQueue.ts`** (one hunk): the options
  object gains `batchId?: string`, passed through at the `beginIntake` call (`:276-279`), with a comment naming #642
  as the hook's owner.

### Docs

`CONTEXT.md`, in the house "term / _Avoid_" shape, three terms (§3.1):
- **Intake batch** — a firm-scoped, durable grouping of admitted sources opened by one person in one act; it holds no
  client, no counts and no transaction. _Avoid_: a transaction; a client-scoped object; the browser's upload queue; a
  synonym for a Work.
- **Batch member** — one admitted source's membership row, carrying up to three identities in order (intake always,
  document once in custody, Work once admitted) and at most one declared dependency. _Avoid_: calling an unattributed
  source a Work; calling a processing task a child; a percentage; a total; a page length.
- **Member dependency** — the declared reason a member is waiting: `awaiting_fact` (a question is open),
  `awaiting_attribution` (in custody, no live filing), `awaiting_capacity` (the firm's daily document quota, which
  resets at 08:00 `Asia/Kuala_Lumpur`). _Avoid_: treating a quota block as a failure; treating the declared value as
  the only source of "waiting" (the read unions it with the derived signals and says which is which).

READMEs, in the same commits as the code: `packages/db/README.md` (the relation family, the six verbs with their
floors and grants, the derive-never-store rule, the fan-out cancel and its derived keys), `packages/db/tests/README.md`
(the new cohort and its frontier gate), `packages/runtime/README.md` (the new non-frozen module, the new belt, and
**why there is no `documentIngest_v3`**), `apps/web/README.md` (the durable-card-vs-live-queue distinction and the
08:00 copy rule). **Never `docs/PRD.md`, never `docs/ARCHITECTURE.md`** — record `PRD.md:120`,
`ARCHITECTURE.md:530` and `ARCHITECTURE.md:134-135` under "blueprint drift".

## 4. TDD seams (red first)

**The first seven cells are MEASUREMENTS and they run before the migration text is written** (SYNTHESIS §7.4 #12/#13,
§7.5 #1; gap-636 §Unverified). Each changes what you write, not merely what you claim.

1. **`p636.frozen.closure`** — from the worktree root, `node scripts/check-frozen-workflows.mjs --print-closure` on
   your rig. *Red-first reason: the gap map's 296-file closure came from a scratchpad resolver, not the harness; the
   whole "`lib/intake.mjs` is editable" licence rests on it.* Report the count and whether `lib/intake.mjs`,
   `src/intakeRoutes.ts` and `lib/reconciler.mjs` are outside it. If any is inside, **stop and report** — the module
   plan changes, not the code.
2. **`p636.batch.capacity_refusal`** — on `clara_636`, drive `create_document_intake` to the shipped ceilings
   (`docs_per_day` 100 / `pages_per_day` 1000, `0007:366-367`) and record which guard fires, with which message, at
   which file. *Red-first reason: "100 ≤1MB PDFs sit flush on both ceilings" is derived from text (`0007:1645`,
   `:1648` are `>`-only), never executed, and it sets the battery's and the World leg's N.* Then drive a
   **post-custody** capacity refusal and record the `failure_code` the intake actually reaches — `limit` or
   `internal` (`intake.mjs:155-159`). **This decides §3 item 7 arm (b)**: `limit` ⇒ the trigger arm is the whole
   production path and `recordCapacityWait` is never written; `internal` ⇒ the explicit door
   `set_intake_batch_member_dependency` (item 10) is the production path, reached from the finalize route's catch arm,
   and the trigger stays as the belt. Write the measured answer into the migration header.
3. **`p636.batch.ladder_by_kind`** — the same member count binds on `docs_per_day` for image members (1 page each,
   `0007:1625`) and on `pages_per_day` for ≤1MB PDF members (10 pages each, `:1626`), and the refusal names **which**
   ceiling it hit. *Red-first reason: C83.X2's own instruction is to re-derive the inventory split by file type and
   discard the figure "100".*
4. **`p636.batch.capacity_window_utc`** — a reservation stamped just before 00:00 UTC and one just after are counted
   in **different** daily windows (`0007:1644`); the same two straddling 00:00 `Asia/Kuala_Lumpur` are counted in the
   **same** window. *Red-first reason: it pins TODAY's behaviour so a later MYT move reds here instead of silently
   shifting every firm's ceiling by eight hours, and it is the source for the card's "08:00" copy.* It asserts
   nothing about what the window **should** be — that is #635's call.
5. **`p636.batch.derived_key_author`** — call `cancel_accounting_work(work, authorA, 'k')` twice: the second is a
   byte-identical replay. Call it again as `authorB` with key `'k'`: **CLR10 `op_key_conflict`** (`0184:262-270`).
   *Red-first reason: it is the whole reason `intake_batches` stores `cancel_requested_by`; without the measurement a
   resumed fan-out would be written with the sweep's identity and every child would refuse.* Record whether CLR13
   `operation_in_flight` is reachable for this door at all.
6. **`p636.census.no_recut`** — the twelve non-regression pins, measured off `pg_proc.prosrc` on the rig and
   re-asserted after 0229 applies. *Red-first reason: four of the twelve are splices (`finalize_document_intake`
   0007→0015→0026→0051 dynamic→`0125:730`; `_tf_accounting_work_immutable` →`0200:251`; `cancel_accounting_work`
   →`0199:201`; `list_accounting_work` →`0203:214`); a pin transcribed from file text refuses to apply.*
7. **`p636.batch.work_id_stamp`** — a member whose intake reached `finalized` carries `document_id` from
   `clara.document_intakes.document_id` (`0007:114`); when ANY lane later admits a Work naming that document in
   `source_refs`, `work_id` + `client_id` are stamped **once** (a second, unrelated admission does not restamp —
   `where work_id is null`), and a Work admitted for a document in no batch leaves every member untouched. **The
   negative half is the cost measurement**: the trigger's no-op path on a rig with zero matching members. *Red-first
   reason: this trigger fires on every `accounting_work` INSERT in the estate (Risk 11); if the cost is unacceptable,
   §3 item 8's read-time-derivation fallback is taken and the residual is named — decided by this cell, not by
   opinion.*

**DB battery `packages/db/tests/intake-batch.test.mjs`** — its own gate module and 0229 cohort, frontier-gated on the
`intake_batches$` stem (the `client-work-pack.test.mjs:1-80` shape: a FOCUSED run without the gate flag **fails
loudly** below 0229). **Every assertion through `humanQuery`/`roleQuery` least-privileged personas, never
`rootQuery`** except labelled fixture DML.

8. `p636.batch.attach_idempotent` — attaching the same intake twice leaves ONE member row and a replayed receipt;
   attaching it to a second batch raises CLR13 `intake_already_in_batch` naming the first; a third firm's intake
   cannot be attached at all (CLR11, no oracle).
9. `p636.batch.no_transaction` — 5 of 20 children fail their intake and the other 15 still reach `admitted`; the
   parent stays `open`.
10. `p636.batch.distinct_work_ids` — a child with two runs counts once; two children naming the same document count
    as two members but one Work if one Work names it.
11. `p636.batch.settled_is_a_receipt` — a child Work with `status='completed'` and **no** committed
    `operation_receipts` row is NOT `settled`, and drives `settled.coverage='partial'` with `uncounted_completions`
    and reason `completions_without_receipt` (the `p650.pack.completed_no_receipt` shape,
    `client-work-pack.test.mjs:301`).
12. `p636.batch.facets_overlap` — one child appears in `waiting` and `admitted` at once; the facet numbers
    legitimately exceed the member count and the envelope carries no total.
13. `p636.batch.no_percentage` — the envelope contains no key at any depth that could be read as a total,
    denominator or percentage (assert the key set, the `p650.pack.no_period_axis` shape at `:615`), and the tail's
    `prosrc` probe is green.
14. `p636.batch.preview_bound` — 120 members still answer; `_work_run_attempts` is asked about ≤25 ids and
    `admitted.coverage='partial'` names `retry_label_preview_only` (`0189:262-274`).
15. `p636.batch.dependency_lifecycle` — the door sets each of the three values and clears to NULL; an unknown value
    is CLR10 `invalid_dependency`; each transition appends exactly one ledger row carrying the reason verbatim; a
    member whose intake failed with `failure_code='limit'` appears under `waiting`, **never** under `failed`.
16. `p636.batch.cancel_keeps_receipts` — three children (one committed, one running, one queued). Cancel the batch →
    the committed one answers `already_completed` with its receipt id and **its entry is untouched**; the running one
    reaches `cancel_requested`; the queued one settles `cancelled`; a second cancel under the same key is a
    byte-identical replay; a second cancel under a **different** key raises CLR13 `batch_already_cancelling`.
17. `p636.batch.cancel_while_settling` — a child whose run is `cancel_requested` answers `already_stopping` and the
    parent reports *stopping*, never terminal (AC4 + `appendix-C-journeys.md:82`).
18. `p636.batch.cancel_all_terminal` — cancelling a batch whose children are all terminal returns an empty child list
    and the parent reaches `cancelled` **in the same call** (no sweep round-trip).
19. `p636.batch.sweep_settles` — `sweep_intake_batch_cancellations` returns the live children of a `cancelling`
    parent with the **stored** `cancel_requested_by` and `cancel_op_key`, and flips a parent with none to `cancelled`
    exactly once; `p_limit` outside 1..100 is CLR10 `invalid_limit`.
20. `p636.batch.reservation_atomicity` — refuse one child's finalize after custody and assert its reservation is
    refunded (`_refund_document_reservation`), while a settled sibling's reservation carries its **actual** pages
    (`_settle_document_reservation`, `0007:1694`).
21. `p636.batch.one_receipt_through_retry` — **C51.1's owed cell**: an isolated failure → retry → success leaves
    **exactly one** `clara.operation_receipts` row for the child's `logical_op_id`.
22. `p636.batch.authority_revoked_midbatch` — **C51.4's owed cell**: a membership revoked between two children —
    the affected child's next governed act refuses CLR04 with its typed reason, every already-committed sibling is
    untouched, and the parent read still answers for a caller who is still a member.
23. `p636.batch.floors` — a viewer is refused CLR04 by `get_intake_batch`; `clara_runtime` holds EXECUTE on the five
    runtime verbs and **not** on `get_intake_batch`; `clara_authenticated` holds EXECUTE on `get_intake_batch` and on
    **none** of the five; no table DML grant moved (the `p650.pack.catalog` shape, `:573`).
24. `p636.batch.cross_firm` — another firm's owner reads zero through the door; an invented batch id answers
    identically (no oracle).
25. `p636.batch.member_rls_child` — firm B's bookkeeper selects `clara.intake_batch_members` and
    `clara.intake_batch_member_events` **directly, bypassing the read door**, and reads **zero** rows for firm A's
    batch; the same persona holds no INSERT/UPDATE/DELETE on either. *Red-first reason: a cell that goes through
    `get_intake_batch` only ever proves the parent's policy.*

**Runtime.** `packages/runtime/tests/intake-batch-unit.test.mjs` — `intake-batches.mjs` returns a typed
`{status:'unavailable'}` on a raising door (never null, never a throw); the fan-out **derives** each child's op key
from the parent decision (`<cancel_op_key>:<work_id>`) so two runs produce byte-identical calls; `resumeCancel`
re-issues with the **stored** actor; a CLR13 `operation_in_flight` leaves the child for the next sweep; and — if cell
2 measured `internal` — `recordCapacityWait` calls the dependency door **only** on SQLSTATE `CLR18`, passes the
sidecar's `uploadedBy` as `p_actor`, and swallows a CLR04/CLR11 refusal into a log line instead of re-throwing into
the finalize route's 429.

26. **`p636.batch.cancel_resume`** — on the real World: cancel a 100-child batch and kill the process between child
    50 and 51. On resume the belt settles the remaining children, **no child is cancelled twice** (each replayed call
    returns the stored `_finish_op` receipt, `0004:62-66`), none is skipped, every already-committed child still
    answers `already_completed` with its receipt id, and the parent reaches a terminal state exactly once.
    *Red-first reason: without it the fan-out's only proof is one uninterrupted three-child call, which is neither
    what AC7 asks for nor what a hundred-file batch does.*
27. **`packages/runtime/tests/intake-batch-e2e.mjs`** (standalone, real Postgres World) — the headline leg, sized
    from cell 3's derivation and **not** from the prose "100" (`DECISIONS.md:243`'s "World leg with 100 intakes" is
    superseded — see the ruling in "Orchestrator decisions"; report the measured N beside it): N children where N−5 reach a supported persistent
    result and 5 independently (a) wait on a fact, (b) fail extraction, (c) stay unassigned; deterministic
    admission/commit barriers; a SIGKILL between two children and a resume proving no duplicate effect; then a batch
    cancel proving every completed receipt survives.
28. **`p636.poison.cross_firm`** — firm A's child holds a permanently-failing event (the `relay.mjs:354-365`
    dead-letter arm) while firm B's batch, admitted in the same sweep, still completes; assert firm B's progress
    moved and firm A's dead-letter budget absorbed the failure. *Red-first reason: cross-firm isolation is argued
    from source today and observed nowhere.*

**Exact World-leg commands, on YOUR rig** (from `packages/runtime`, Node 22 via
`export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`):
```
export PGHOST=127.0.0.1 PGPORT=55702 PGUSER=postgres PGDATABASE=clara_636 \
       CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 \
       WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55702/clara_636
node tests/intake-batch-e2e.mjs
node tests/intake-batch-unit.test.mjs
```
Bootstrapping a World on `clara_636` makes `rig-isolation.test.mjs` T10b red afterwards (#866) — report it as that.
If you need that cell green after the leg, clone first (`create database clara_636_world template clara_636`) and
point the World legs at the clone (RIG.md).
CI registration: **one row** in `.github/actions/db-live-gates/action.yml` immediately after the `#633 intake
admission e2e` step (`:65`), same isolated DB and world:
`- name: "#636 intake batch e2e (same isolated DB + world)"` → `cd packages/runtime` →
`PGDATABASE=clara_intake_ci WORKFLOW_POSTGRES_URL="postgres://postgres@localhost:$PGPORT/clara_intake_ci" node tests/intake-batch-e2e.mjs`.

**Web unit — five files, each added to `apps/web/test/manifest.txt` at its alphabetical position** (a plain string
compare; an unregistered file silently never runs, and `pnpm --filter @clara/web lint` checks it):
`components/documents/intake-batch-card.test.tsx` (the eight states; **no `Progress` element renders in ANY state**
and no rendered string matches a percentage; labelled facet counts plus the coverage word; `computed_at` labelled;
the denied face clears rows and offers nothing that could only refuse; the exhausted poll offers manual Refresh;
`p636.card.child_addresses` — every preview row names its own state and carries its own link, and at least one act
besides Cancel exists);
`components/documents/intake-batch-cancel.test.tsx` (one confirm ⇒ exactly ONE governed call, never N from the
dialog; one op key per open decision; a new press renews it);
`components/documents/intake-batch-a11y.test.tsx` (ONE announcement owner; no row is a live region; SR names);
`components/documents/intake-batch-keyboard.test.tsx` (focus returns into the table after a child row acts; focus
return from the cancel dialog);
`lib/documents/batch-url-state.test.ts` (three answers; every other parameter preserved; a malformed id yields
not-found plus a URL that stops repeating the lie; the capacity string contains neither "midnight" nor "tomorrow").

**Playwright** — `apps/web/e2e/intake-batch-walk.spec.ts` + `apps/web/e2e/intake-batch-mock.mjs`, registered with one
import + one dispatch line in `e2e/serve-built.mjs` and one ownership row in `e2e/e2e-fixture-ownership.test.ts`.
POST bodies **only** through the shared `readCachedJson` (`e2e/mock-dispatch.mjs:34`) — never a private reader.
Cells: a mixed batch settling per child; the parent summary derived and re-read **after a reload**; cancel-remaining
showing *stopping* and then the completed receipts; a facet with no rows while others have rows; the denied face;
320px with **no page-level horizontal scroll**; 200% zoom; reduced motion; keyboard + focus return; `?batch=` deep
link and Back restoring the identical query; an axe scan at 320px.
**Verbs the mock answers — and this corrects gap-636's list.** The three write doors are **not** PostgREST RPCs
(they are `clara_runtime`-only), so the mock answers **one** new RPC verb, `/rest/v1/rpc/get_intake_batch`, plus
**two runtime routes** in its runtime handler, `POST /api/intake/batches` and `POST /api/intake/batches/:id/cancel`
(both matched by regex, the `journal-work-mock.mjs` precedent recorded at `e2e-fixture-ownership.test.ts:303-309` —
a regex-matched, id-carrying `/api/…` path **the census cannot see at all**, so the `LANE_DECLARATIONS` row must say
so in the same words rather than claim a clean file), and
it must fall through (`return false`) on a batch id it did not mint. Verbs it shares with a sibling lane —
`list_accounting_work`, `get_accounting_work_row`, `document_intakes_visible`,
`document_processing_tasks_visible`, `document_filings` — are declared **shared** in `SHARED_RPC_VERBS` (`:1106`)
beside `work-list-mock.mjs` / `documents-intake-mock.mjs`, or answered by nobody new; `caller_context` stays the
CORE dispatcher's (`CORE_RELATION_HANDOVERS`, `:1311`).

**Census suites that will red, and how this branch keeps them green:** `tests/sql-oracle.test.ts` (six new SQL
functions), `tests/parity-holes.test.ts`, `tests/firm-scope-surfaces.test.ts` and
`tests/firm-scope-fourth-entrance.test.ts` (**expected no-ops — you add no file under `app/**` and change no href**;
run them and report the counts as the evidence for that claim), `e2e/e2e-fixture-ownership.test.ts` (the new lane
mock + every verb), `lib/navigation/tree.test.ts` (**expected no-op — no leaf, no href change**),
`packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` (mandatory: this slice adds SQL
functions; run **without** the reset flags). Frozen/parts checks are expected no-ops
(`node scripts/check-frozen-workflows.mjs`, `node packages/runtime/scripts/check-parts-parity.mjs`) — **run them
anyway and report the counts**, because a green there is the evidence for "no successor, no part kind".

## 5. Risks

1. **Merge collisions, exact files, one line each at the sorted position** (nine other lanes are editing the same
   handful): `packages/db/package.json` → **one** `--import ./tests/intake-batches-preintegration-gate.mjs` appended
   after `preview-invite-preintegration-gate.mjs` (the chain is **migration order, not alphabetical**; the integrator
   resolves 0225–0228's relative order); `packages/db/tests/rig-meta.mjs` → one 0229 cohort block (**the `];` repair
   is the known hazard**); `.github/actions/db-live-gates/action.yml` → one step after `:65` (per-line `\`
   continuations); `apps/web/test/manifest.txt` → **five** lines; `apps/web/messages/en.json` → **one new namespace
   `IntakeBatch`** (never a replacement — #635 is the lane REPLACING `Settings.unbuiltNote` and that is the
   collision-prone shape); `apps/web/e2e/serve-built.mjs` → one import + one dispatch line;
   `apps/web/e2e/e2e-fixture-ownership.test.ts` → one `LANE_MOCKS` entry, one `LANE_DECLARATIONS` row and the shared
   verbs; `CONTEXT.md` → three terms. **No `tree.ts`, no `needs-you.ts`, no `require-firm-scope.ts`, no
   `lib/parts/*`.** `work-detail.tsx` is contested three ways — **#658 → #655 → #636**; yours is ONE row and you
   restructure nothing. `useUploadQueue.ts` is #642's signature — yours is one option, additive and commented.
2. **The capacity wall can turn acceptance into a false green.** A battery sized at 10 files never reds
   `p636.batch.capacity_refusal` while a real hundred is refused in production. C83.X2's re-derivation is
   prerequisite work (cells 2–3), not documentation.
3. **A hundred live rows will shout at a screen reader.** `upload-panel.tsx:44-52` already fixed this once; the card
   inherits ONE announcement owner or AC6's SR-names line fails outright.
4. **`_work_run_attempts`' 101-id ceiling is a real wall** (`0189:262-274`; `0214:59-78` records the cost of hitting
   it — one refusal darkens a whole board). Label the **preview**, never the population.
5. **Blast radius of the Work-side trigger**: it fires on every `accounting_work` INSERT in the estate, including
   #655's new invoice lane. It is additive, not a recut, and it is not on `journal_entries`, so it does **not**
   interact with #655's new deferred trigger (SYNTHESIS LOUD #1) — say so in the header rather than leaving a reader
   to wonder. The cheap negative + the partial index is the mitigation; `p636.batch.work_id_stamp` measures the
   no-op path; the read-time-derivation fallback is pre-decided.
6. **Child RLS is written per table and is not inherited.** `get_intake_batch` is SECURITY INVOKER; a missing child
   policy is a real cross-firm leak, not a theoretical one. `p636.batch.member_rls_child` selects the children
   **directly** for exactly that reason.
7. **`0051:1031-1038` / `:1392` is an executable exactly-one-overload assertion** on `finalize_document_intake`, and
   `0103:1055-1070` is the same law for 0103's names. Any new intake verb is a **new name**, never a defaulted
   parameter on an existing one — and 0229 writes its own single-row census for the six names it installs.
8. **#664 will otherwise build a second batch table and a second cancel ceremony** (its AC1 is a "grouping identity",
   its AC4 is "group cancellation"; both tickets cite user story 25). The three mitigations are binding; write them
   into the migration header so the next reader cannot miss them.
9. **#904 is a live defect on the same workbench.** The card uses `useSettlePoll` with its own `resetKey`; do not
   silently fix #904's indicator, and state the residual.
10. **Host contention**: ten lanes share 24 cores / 32 GB and ~8 GB free RAM. `next build` may panic `0xc0000142` —
    retry once (#869). Free disk on C: is 67 GB.
11. **Known Windows-only reds you must NOT "fix"**: #707 (x56-rest-c shells out to grep), #693 (EICAR fixture
    quarantined by Defender), no `pg_dump` on PATH (four runtime files), `thread-live-clarify.test.tsx`'s whole-suite
    load flake (re-run alone and report both), `rig-isolation.test.mjs` T10b after a World bootstrap (#866).
12. **Never** set `CLARA_RIG_ALLOW_RESET=1` or `CLARA_RIG_ALLOW_ROLE_SWEEP=1`, and never run two from-scratch
    migration chains on `clara_636` (0154 pins the cluster-wide `clara%` role count at 18).

## 6. Effort and rig

**Effort: XL** (§7) — a two-table relation family with an append-only ledger child, six governed verbs with their
floors and grants, two triggers, a derived read in the 0214 envelope shape, RLS and a tail census; **plus** a fan-out
cancellation correct against all five arms of an already-reviewed cancel door and resumable after a kill; **plus** a
non-frozen runtime module, two routes and a reconciler belt; **plus** a new web surface carrying the full eight-state
taxonomy at 320px/200%/reduced-motion; **plus** a new battery with its own cohort and frontier gate, a **new
real-World CI leg**, a cross-firm poison leg, a walk and a mock; **plus** two historical rows owing genuinely new
cells (C51.1, C51.4) and one owing a **discovery** that sets the battery's own numbers (C83.X2).
**The clean L fallback, if the window closes** (§7's own note): ship the parent, the join, the read and the durable
card — `intake_batches`, `intake_batch_members`, `attach_intake_to_batch`, `get_intake_batch` — and split the
cancellation fan-out **with its resume arm, its derived per-child op keys and `sweep_intake_batch_cancellations`**
into a second ticket shared with #664. Do not take the fallback silently: it is a report line and an orchestrator
decision.

**Rig**: worktree `C:\Users\zhant\Desktop\clara-wt\636`, branch `impl/636-work-batch`, PG **55702** / db
**clara_636** (`export PGHOST=127.0.0.1 PGPORT=55702 PGUSER=postgres PGDATABASE=clara_636 CLARA_ALLOW_DESTRUCTIVE=1
CLARA_RIG_DB=1`). Node 22 via `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"` (the Windows default `node` is
v20 and must not be used). **Port triple**: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3310
CLARA_E2E_NEXT_PORT=3311 CLARA_E2E_RUNTIME_PORT=3312`. Playwright goes through
`pnpm --filter @clara/web e2e intake-batch` — `npx playwright test` alone serves a STALE build (#865).

**Before the final report, run — and report the exact counts**: `pnpm typecheck` and `pnpm lint` (worktree root, both
green); the **whole `apps/web` unit suite** once (`node scripts/run-tests.mjs` from `apps/web`, ~5 min);
`packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` **without** the reset flags (this slice
adds SQL functions); your battery with the **40** `--import ./tests/*-preintegration-gate.mjs` flags copied verbatim
from `packages/db/package.json` **plus your own**, and once **without** your gate to prove it fails loudly below
0229; both runtime legs on your own rig with `WORKFLOW_POSTGRES_URL` (the commands in §4); and
`node scripts/check-frozen-workflows.mjs` + `node packages/runtime/scripts/check-parts-parity.mjs` from the worktree
root — expected no-ops, run anyway, because their green is the evidence for "no successor, no part kind".

**Copy the house shapes from**: `packages/db/migrations/0221_staff_expense_claims.sql` (#638, merge `6123efbe`,
`git show --stat 6123efbe` — migration header at `:1-45`, the parent/child RLS pair at `:456-462` / `:557-563`, the
append-only pair at `:565-569`, the **lane-agnostic birth trigger** at `:1471-1568`, the tail census at `:1710`, its
gate module, its `rig-meta` cohort, its `staff-expense-claim.test.mjs` persona battery, its
`staff-expense-claim-e2e.mjs` World leg, its `staff-expense-claim-mock.mjs` + walk pair, and its
`e2e-fixture-ownership.test.ts` rows); `packages/db/migrations/0214_client_work_pack.sql` (#650, `cfa1c710`, merge
`2d17ab95` — the derived envelope at `:234-447`, the inline invoker floor at `:262-274`, the preview clamp at
`:283-286`, the coverage/`uncounted_completions` treatment at `:400-412`, `client-work-pack.test.mjs`'s gate + cell
idiom, and `client-work-pack-preintegration-gate.mjs` verbatim);
`packages/db/migrations/0199_work_cancelled_event.sql` (#750, `961d24fe` — the five cancel arms you must not
duplicate and the `§I` taxonomy idiom you deliberately do not use); `0017_wave_b.sql:1252`/`:4602-4617` (the
derive-never-store batch) and `0046_wave_7a_sales_lane.sql:496`/`:2287` (the stored counter you reject); and
`docs/plan/active/refresh-wave-2026-09-15/brief-649.md` + `refresh-wave-2026-09-14/brief-640.md` for the brief's own
shape, with `.../reports/640-review-closure.md` and `643-final.md` for what a reviewer later demanded —
**behavioural** cells rather than `prosrc` assertions, re-measured rather than copied evidence, an explicit
merge-order collision table, and every claim carrying the command that produced it with its pass/fail counts.

## Verifier findings not applied

**None. All four findings (V636-1 … V636-4) were opened, checked against source, and applied.** Where they land:

| Finding | Applied where |
|---|---|
| **V636-1** (wrong door for the capacity fallback) | §3 item 7(b) now names `clara.set_intake_batch_member_dependency` (**item 10**, not item 11's sweep) and, because the finalize route carries a capability token and no principal (`intakeRoutes.ts:125-147`), spells out the only buildable path: `recordCapacityWait` in `intake-batches.mjs`, CLR18-only, actor from the sidecar's `uploadedBy` (`spool.mjs:64` / `intake.mjs:182`, still present because `canonicalReached` is true and `internal` is not spool-clearing, `intake.mjs:424-426`), refusal swallowed. Ownership bullet, Runtime section, §4 cell 2 and the runtime unit cell carry the same wording. |
| **V636-2** (wrong cross-reference + inconsistent name) | The non-goal now points at **§3 item 14** and both places say `clara.event_types` / `clara.trigger_taxonomy` (+ "no `clara._append_event` call"), citing `0199:179-182` and the executable pair `0199:188-194`. |
| **V636-3** (silent departure from `DECISIONS.md:243`) | A new binding bullet states the supersession in the house form, cites `DECISIONS.md:213` and `SYNTHESIS.md:746-749` (§7.4 #12) as its authority, and requires the report to quote `DECISIONS.md:243` beside the measured N. §2's AC2 row and §4 cell 27 carry the pointer. |
| **V636-4** (sixth verb mislabelled as a ruling) | The bullet is relabelled a **brief-writer addition, flagged for orchestrator confirmation**, with the measured necessity (`0178:1619-1630` — the tail that asserts `clara_runtime` holds neither grant nor policy on `operation_receipts`) and an explicit refusal fallback (drop the sweep; `p636.batch.cancel_resume` / AC7's recovery half become a named residual). §3 item 11 repeats the flag. **This is the one item escalated to the orchestrator before implementation starts.** |

**Two premises corrected while applying** (recorded so the next reader does not inherit them):
- V636-2's evidence says `clara.domain_events` does not exist. It does — `packages/db/migrations/0005_event_spine.sql:79`, the append-only log. The draft's error was a category error, not an invented relation: a *type* is a row in `clara.event_types` + `clara.trigger_taxonomy`, and `domain_events` is what those types route. The corrected text says both.
- V636-4's evidence cites the `operation_receipts` grant roster as `0178:459-463`. The grant line is `0178:463` and the policy pair `:457-462`; the load-bearing proof is the executable tail at `0178:1619-1630`, which refuses the migration if `clara_runtime` ever holds SELECT or a policy there. The brief now cites the tail.
