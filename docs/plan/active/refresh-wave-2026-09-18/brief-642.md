# Brief: #642 — 以原生 AI 消息、附件和流式结果发起工作

*B6 Start Clara — visible firm/client context → composer and attachments → accepted message → streamed explanation
and/or accepted Work card.*

## Orchestrator decisions (binding)

- **NO MIGRATION — and say so out loud.** DECISIONS §2's own heading reads "frontier 0224 → this wave 0225–0233;
  **#642 ships no migration**", and §2.1's allocation table has no row for you. You add **no** `.sql` file, **no**
  `packages/db/tests/rig-meta.mjs` cohort, **no** preintegration gate module, **no** `packages/db/package.json` gate
  row and **no** `.github/actions/db-live-gates/action.yml` row. Nine siblings each carry a migration and a reader who
  assumes symmetry will hunt for one that does not exist, so the absence goes in the ticket evidence **and** in your
  final report with its reason: the door's idempotency arm already exists (`0006_runtime_core.sql:954-960`) and every
  defect this ticket closes is above the database (SYNTHESIS §2.2 row #642, §5 K1).
- **You recut NOTHING.** `clara.begin_chat_turn(p_session uuid, p_author uuid, p_turn_key text, p_user_parts jsonb,
  p_model text) returns jsonb` (`0006:923`, SECURITY DEFINER, `search_path = clara, pg_temp`, EXECUTE to
  `clara_runtime` at `0006:1176`) is the only door on this path and **nothing about it changes**. The cost of the
  alternative is on the record: `0105_f_a9_chat_token_cap.sql` is its one and only recut, pins the pre-image
  `sha256(prosrc)`, asserts exactly one body (`:163-165`), re-asserts owner + `clara_runtime` EXECUTE (`:268-273`)
  and **refuses to apply while a runtime heartbeat is fresh** (`:141`) — a quiesce window this wave does not arrange.
  A defaulted sixth parameter would be an **overload**, and `0103:1055-1070` raises CLR10 on a second `pg_proc` row
  for an installed name (DECISIONS §2.2): a new parameterisation is a NEW verb, never a default. Do not touch
  `clara.expire_due_interruptions` (`0198:206-238`) or `clara._tf_validate_chat_attachments` (`0007:598-633`) either.
- **D6 — the native chat component family ships, in TWO steps, inside this ONE ticket. Orchestrator ruling —
  supersedes gap-642 Q1** (which recommended the L path: behaviour now, components split into a follow-up shared with
  #645). **Step 1: prove the behaviour green with the code you already have** — scroll anchoring, labelled
  jump-to-latest, the content-addressed duplicate-send key, reconnect replacement, the four live tool states,
  `revoked`. **Step 2: migrate the appearance** onto Message / Message Scroller / Bubble / Attachment / Marker /
  Avatar **with the same tests still green** — no cell is rewritten to fit a component; a cell that has to change to
  pass is a behaviour regression, not a migration detail. **If step 2 cannot finish, the behaviour ships and the
  component migration is a NAMED residual** in your report. That order is appendix D's own instruction
  (`appendix-D-components.md:149`: *Migrate only after preserving real reconnect/streaming, keyboard/log behavior,
  anchoring, focus, and narrow-panel tests*). Effort is **XL** (DECISIONS §7).
- **D17 / §1.1–§1.4 — two frozen bodies are cut this wave (`chatTurn_v21`, `claraWork_v5`), by the integration worker
  after the ten merges, and you are a claimant on NEITHER.** You therefore write **no successor-contract stanza**
  (§1.2 lists five stanzas: #655's, #651's, #658's ×2 and the two riders #658's worker writes — none is yours).
  Instead you publish the **negative finding** with its measurement, because #915 and #847 plan against that slot:
  the model's whole `fullStream` already reaches the browser verbatim (`chatTurn.v10.impl.ts:216-221` writes every
  part; `chatTurn.v20.impl.ts:148-157` calls it; `streamRoute.ts:139` relays each as `event: chunk`), so live tool
  state is a **web fold**, not a version cut (SYNTHESIS §1.2, §4 "#658 ↔ #642 — no successor collision exists").
- **G3 (§6/§5 Theme G) — deliver FOUR live tool states, not five.** *preparing* (`tool-input-start`) / *running*
  (`tool-call`) / *done* (`tool-result`) / *failed* (`tool-error`), plus *refused* resolved from a settled `refusal`
  part (`lib/parts/types.ts:441`). **`queued` is a named residual with its reason** — the stream carries no admission
  event, and inventing one means a `chatTurn_v21` cut this ticket does not take. Never pass *preparing* off as
  *queued*. Every label is a next-intl lookup with the raw runtime token as fallback (**UI-32**).
- **G4 (§6) — source links hang on the result card, never on the tool chip.** A chip-level link would need a new
  field on `tool_result`, whose wire shape is minted by `toTypedParts_v10` inside the **frozen**
  `chatTurn.v10.prompt.ts`.
- **Register NO part kind** (§3 and §6: "Part kinds: implementers register none"; SYNTHESIS §3.1 — with v21 uncut,
  nobody touches the parity pair). Your fold maps existing chunks onto the existing `tool_call` / `tool_result` /
  `tool_error` kinds; `lib/parts/catalog.ts`'s `AllCovered`/`NoExtra` pair stays untouched and
  `check-parts-parity.mjs` green is your proof (**CB-AE2E-008** re-opens through exactly this back door otherwise).
- **§7.4 #14 (measure-first, binding) — capture a REAL chunk trace before writing the fold.** That the AI SDK
  `fullStream` emits `tool-input-start` / `tool-call` / `tool-result` / `tool-error` for this model and provider is
  the SDK's documented vocabulary, **not measured**. What *is* measured is that every part is forwarded unfiltered.
  **Cell `p642.measure.chunk_trace` is the first work you do on the rig; do not write the mapping from the docs.**
- **§7.4 #15 (measure-first, binding) — whether the six primitives resolve for this project's `base-nova` style is
  UNVERIFIED.** `components.json:3` is `"style": "base-nova"`, `:24` is `"registries": {}`; appendix D records a CLI
  failure on that exact configuration (`appendix-D-components.md:41`: *`shadcn search @shadcn --limit 500 --json`
  failed because `components.json` has no configured registries… This CLI/config mismatch remains unresolved and is
  not a reason to add a registry blindly*), MCP/app-context skew on these exact items (`:37`), and **no `shadcn docs`
  links for four of your six** — Message, Message Scroller, Bubble, Attachment (`:35`), so research those from the
  catalog/direct pages and the generated code, not from the docs lane; the `shadcn` MCP server failed to connect this
  session. What DECISIONS §6 *did* measure is one add on a sibling rig: `chart --dry-run` resolves for `base-nova`
  (#660 rig), i.e. the registry itself works and the open question is these six items and what they would overwrite —
  and the same bullet binds you to `pnpm --filter @clara/web ui:add <name> --dry-run` first, never overwriting a
  protected file. **Cell `p642.measure.ui_add_dryrun` precedes any install.**
  Measured this pass and binding on you: `apps/web/scripts/protected-components.json` protects exactly **two** files
  (`components/ui/button.tsx`, `components/ui/pagination.tsx`), while appendix D's own combined dry run
  (`appendix-D-components.md:39`) resolved **19 files, 13 creates and six overwrites — Button, Label, Separator,
  Card, Input, Sheet** — so four of those six would sail past the guard. **If a dry run names any existing
  `components/ui/*.tsx` that is not one of your six, STOP**: do not set `CLARA_UI_ADD_OVERWRITE=1`, record it, and
  either take the component without that registry dependency or name the residual. Generated files import `cn` from
  `"cn"` while this repo uses `@/lib/utils` (same line) — fix it on the way in.
- **Ownership (§3), exact.** You **own** `apps/web/components/clara/*`, `apps/web/lib/clara/*`, `apps/web/lib/parts/*`
  and `apps/web/lib/documents/useUploadQueue.ts` + the composer attach path (its options type is
  `useUploadQueue.ts:137-139`, `origin?: IntakeOrigin; sessionId?: string`; **#636 threads ONE optional `batchId`
  through the transport in one commented hunk and you must not remove it**). You **do not open**:
  `apps/web/components/work/work-detail.tsx` (§3 row: "#642 does not edit it"), `app/(firm)/layout.tsx` (#659 —
  *a needed height contract for the transcript's new scroll ownership is a QUESTION in your report, never an edit*),
  `components/clara/rail-chrome.tsx` (the docked/overlay arms at `:29-32` are the shell's), any reconciler
  (`lib/reconciler-chat-clarify.mjs` is #852's), `components/documents/*` (#636's). #645 (archive/delete) and #839
  (restate-as-new-instruction) rewrite `ClaraThreadView.tsx` **after** you — **#642 lands first, it is #645's
  blocker**; add no delete/archive affordance and no per-question action row, but leave a documented slot for one.
  **#664** fills per-result client attribution one altitude up: you build **one** data-driven scope band and **no**
  cross-client attribution, no pending-attribution state, no firm-intake identity.
- **Shared files, one-line registrations at the sorted position** (§3, WORK-ORDER rule 8): `apps/web/messages/en.json`
  (one namespace; #635 *replaces* `Settings.unbuiltNote` in the same file — do not re-order it),
  `apps/web/test/manifest.txt` (every new test file, plain string sort), `apps/web/e2e/serve-built.mjs` if a dispatch
  line is needed, `apps/web/e2e/e2e-fixture-ownership.test.ts` **only if you add an RPC verb** (SYNTHESIS §3.1 marks
  you "—"; your walk extension adds none), `CONTEXT.md`. **No `lib/navigation/tree.ts` row** (no new route). **No new
  `lib/firm/needs-you.ts` row kind** (2026-09-15 §1.6, carried by §3). POST bodies in any mock read only through the
  shared `readCachedJson` — `chat-parity-mock.mjs:156` already imports it as `readJson`; keep it.
- **`apps/web/package.json` + lockfile (§6).** `@shadcn/react` is yours to add on your branch, beside
  `@base-ui/react@1.7.0`; **the integration worker resolves the lockfile ONCE** with `pnpm install --lockfile-only`
  and re-runs the frozen install. Two other lanes (#660 `recharts`, #657 `combobox`/`popover`) add dependencies in
  the same window — your manifest hunk stays minimal and is committed with its reason.
- **CONTEXT.md terms you write — three, already ratified, no fourth.** DECISIONS §3.1 binds them by name at
  `DECISIONS.md:132-133`: *"#642 — **Turn key** (content-addressed intent identity), **Conversation scope** (the
  firm/client band beside the composer), **Tool outcome** (the four live states + refused)"*; SYNTHESIS §3.1's
  shared-file table carries the same count (`SYNTHESIS.md:353`, "#642 | R (3)"). Write those three in the house
  "term / _Avoid_" shape, integration unions — the ratified gloss plus its _Avoid_ clause, nothing new:
  *Turn key* (the caller's **content-addressed** identity for one message intent; a retry of the same intent reuses
  it, a changed intent derives a new one. *Avoid*: treating a fresh uuid per press as idempotency);
  *Conversation scope* (the firm or client a conversation's executions belong to, named beside the composer.
  *Avoid*: inferring it from the URL alone); *Tool outcome* (what the transcript records about a step — the four
  live states plus *refused*. *Avoid*: reading a tool-call count, prose or a shimmer as accounting completion).
- **Non-goals, stated in a code comment at the seam AND in the report:** no new part kind; no `queued` state; no
  source link on a chip; no conversation lifecycle (new/archive/restore/delete — #645); no cross-client attribution
  (#664); no segment/attempt identity mechanism (that is #645's own AC4 — your `message`/`detached`/`revoked` edits
  do **not** close it); no reconciler edit (#852); no `InterviewRunCard` Field re-composition (#900) and no
  `StateBanner` `data-testid` repair (#896 — use role + accessible name in walks and record #896 as the reason); no
  second e2e harness for the escalated route (**#897** owns that runnable home).
- **Evidence law (§4).** Every AC and historical row closes with a red-first cell, a browser-walk leg, or a **named**
  residual; REDESIGN rows are **re-measured, never copied**; local ≠ hosted — every report line is "hosted evidence
  pending". Never cite `packages/runtime/.output/server/index.mjs`: it is a build artifact, not source.
- **Playwright port triple**: `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3320`, `CLARA_E2E_NEXT_PORT=3321`,
  `CLARA_E2E_RUNTIME_PORT=3322`. **Rig row (RIG.md, verbatim)**: worktree `C:\Users\zhant\Desktop\clara-wt\642`,
  branch `impl/642-chat-stream-admission`, PG port **55703**, db **clara_642**, install ok 437s, **219 applied**,
  seed ok (2 files), smoke 219 · `0224_preview_invite` · PG 17.11.

## 1. Current state

**DB.** No object is missing and none is needed. `clara.chat_sessions` / `chat_messages` (append-only, `turn_key` on
the user row) / `agent_tasks` / `agent_interruptions` all live in `0006`. `begin_chat_turn` (`0006:923`) runs
session→firm, the live-active-member floor (CLR04), continuation authority (private → author only, else CLR11
no-oracle), the namespaced two-arg advisory lock `pg_advisory_xact_lock(202991617, hashtext(firm))` (`0006:952`),
**the `turn_key` replay lookup over `(session_id, turn_key, role='user')` returning
`{task_id, status, replayed:true}` (`:954-960`)**, limits, the compute cap (CLR14), the task insert (23505 → CLR13)
and only then the user-message insert (`:995-996`) before returning `replayed:false`. `uq_agent_task_one_live_turn`
(`0006:165-166`) is partial on `(session_id)` for `queued/running/awaiting_input/cancel_requested` — it stops the
common double-press and **stops working the moment the first turn reaches a terminal**. `_tf_validate_chat_attachments`
(`0007:598-633`) is the five-per-turn wall with no client scoping at all (the reason
`ClaraThreadView.tsx:127-160`'s reset exists). `settle_chat_turn` (`0006:1001+`) cancels every still-pending
interruption in the same statement sequence — the fact `liveClarify.ts:6-16` is built on.

**Runtime.** `registry.ts:173` pins `chatTurn_v20`, `:270` `claraWork_v4`; `workflowBodies` holds 53 ids
(`:929-981`). `chatTurn.v20.{ts,impl,prompt,tools,usage}` are `deployed:true` in `frozen-workflows.json` (296
entries, zero `apps/**` keys, zero `.sql` keys — SYNTHESIS §0). **`packages/runtime/src/*` is NOT frozen**, so
`chatRoutes.ts` and `streamRoute.ts` are editable. The turn route is `chatRoutes.ts:214`; `turnKey` is required at
`:222-226` (400 `turn_key_required`); the door call is `:234-240`; **`:241` reads only `task_id` off the receipt**
and **`:298` answers `res.status(202).json({ task_id: taskId })`**, so a real replay is indistinguishable from a
fresh admission. `streamRoute.ts`: per-poll re-authorisation in the same checkout (`:84-90`),
`getReadable({startIndex: 0})` full replay on every attach (`:113`), `send("chunk", winner.value)` verbatim (`:139`),
**`send("revoked", { taskId, reason: err.status === 404 ? "not_found" : err.code })` (`:157`)**, bounded tail drain
then terminal `message` + `done` (`:175-198`), `detached` (`:198`). `stableOpKey(taskId, tool, input)`
(`chatTurn.v11.tools.ts:126-135`) is keyed on the **task**, so it dedupes a replayed step and never two sends.

**Web.** Routes: `app/(full)/clara/[threadId]/page.tsx` and `app/(full)/clients/[clientId]/clara/[threadId]/page.tsx`
(`:26-29` — `resolveServerSession` → `loadChatSession` → `sessionBelongsToClient` or `notFound()`); the rail mounts
once from `app/(firm)/layout.tsx` via `rail-mount.tsx:97` with `key={clientId ?? FIRM_ALTITUDE}`.
`ClaraThreadView.tsx` (658 lines) is the single conversation UI for both mount points: scroll region `:297`
(a bare `overflow-y-auto`), onboarding card `:308`, resolve ladder `:312-320`, **the log** `:376-387`
(`role="log" aria-live="polite" aria-busy=…` wrapping welcome + messages + the provisional bubble and nothing else),
the clarify group deliberately outside it (`:438-451`), five mutually exclusive `role="status"` lines
(`:457`, `:465`, `:479`, `:504`, Stop at `:510-529`), four banners `:551-572`, the composer form `:582-640`, the send
gate `sendDisabled` at `:254` (five terms, **none** requiring an attachment) read by both Enter (`:607-613`) and the
Button (`:637`), and the draft/attachment retirement boundary at `:268-271` (`if (onRecord)` only).
`lib/clara/`: `api.ts` (`postTurn(auth, sessionId, text, turnKey, attachments)` at `:205-210`; `TurnResult`'s accepted
arm is `{kind:"accepted"; taskId}` at `:73-77`; the 202 read is `:231`), `stream.ts`
(`applyClaraStreamEvent` `:178-202` — cases `chunk`/`message`/`done`/`detached` and **no `revoked` case**;
`runClaraTaskStream` `:407-450` — `sawProgress` `:416`/`:424`, backoff reset `:432`, the ungraceful-close arm
`:434-439`), `threadStore.ts` (module-level, drafts keyed `(altitude, threadId)` — `getDraft` `:195`, `setDraft`
`:202`, `clearDraft` `:215`, `beginSend` `:241`, `markAccepted` `:258`, `markSendFailed` `:311`),
`useClaraThread.ts` (`sendMessage` `:393`, **`crypto.randomUUID()` minted per press at `:405`**), `liveClarify.ts`
(the one live fold, `foldLiveClarifyParts` `:51-71`, defensive: no question text → **nothing rendered**),
`turnRun.ts`, `useActiveThread.ts`, `welcomeState.ts`. `lib/parts/`: `types.ts` (31-kind union;
`AttachmentPart = {type:"attachment"; document_id; intake_id}` `:54`; `tool_call`/`tool_result`/`tool_error`
`:434-436`; `refusal` `:441`), `catalog.ts` (registry + exhaustiveness asserts), `toolStatus.ts`
(`resolveToolStatuses` `:49-65` → `done`/`failed`/`unresolved`, with the deliberate **no-running-arm** decision
recorded at `:23-32`). **Scope is absent from the screen**: `ClaraRail.tsx:113` renders `t("title")`,
`ClaraFullScreenThread.tsx:53`'s only `<h1>` is `t("title")`, and the one scope sentence is the negative one
(`ClaraThreadView.tsx:589-591`, `attachments.firmAltitudeNote`). The name sources that already exist, with no new
fetch: `useFirmScopeOrNull()` (`components/firm-scope-provider.tsx:86`; `firm_name` on `FirmScopeValue` `:49-50`,
provided at `app/(firm)/layout.tsx:92`) and `useClientIdentity()` (`components/app-shell/scope-context.tsx:96` — the
stored name is used **only** when the stored id equals the URL's `clientId`, else `null`, never a guess).
**Measured this pass**: `apps/web/components/ui/` holds **32 entries** = 30 installed components + `pagination.test.tsx`
+ `README.md`; **absent**: `message`, `message-scroller`, `bubble`, `attachment`, `marker`, `avatar`, `scroll-area`,
`chart`, `questionnaire`. `apps/web/package.json` has `@base-ui/react@1.7.0` and **no `@shadcn/react`**. A repo-wide
grep for `scrollTop|scrollIntoView|scrollHeight|jumpToLatest|scrollBy` over `components/clara/` + `lib/clara/`
(tests excluded) returns **nothing**. One locale (`messages/en.json`).

**Tests.** DB: `rig-runtime-lifecycle.test.mjs` (§3.5 turn_key laws — NOT-NULL on user rows, `(session_id, turn_key)`
uniqueness `:357-361`, parts immutability, the agent_tasks transition matrix). Runtime:
`c5-chat-clr-census-db.test.mjs` (drives `turnErrorStatus` against the live catalog both ways),
`c5-stream-reauth-db.test.mjs` (express + `tsx/esm/api` `register` + a real signed JWT + `server.listen(0,
"127.0.0.1")` at `:73` — **the boot shape your new cells copy**), `chat-attachment-admission.test.mjs`,
`chat-turn-v20-e2e.mjs` (real Postgres World + real HTTP chat session, registered at
`.github/actions/db-live-gates/action.yml:266-290`). Web unit: `thread-live-regions` (3 cells — zero-nested at `:87`,
its **vacuity control** at `:100`, `aria-busy` at `:121`), `thread-live-stream-stability` (8), `thread-rehydrate`
(6), `thread-stop-reply` (9), `thread-live-clarify` (2), `rail-boundary` (6), `composer-attachment-scope` (6),
`composer-attachment` (7), `composer-keyboard` (5, incl. the IME arm), `composer-attachment-control` (2).
Playwright: `chat-parity-walk.spec.ts` (586 lines, 7 legs at `:138`, `:199`, `:230`, `:238`, `:287`, `:459`, `:565`)
against `chat-parity-mock.mjs` (498 lines; `/api/chat/:id/turns` at `:358` answering `202 {task_id}` only,
`/api/tasks/:id/stream` at `:366` already emitting AI-SDK-shaped `{type:"tool-call", toolCallId, toolName, input}`
and `{type:"text-delta", id, text}` chunks). **Nothing drives `begin_chat_turn`'s replay BRANCH anywhere.**

## 2. Gaps / rows

| Row | Disposition and the evidence the implementer must produce |
|---|---|
| **AC1** scope beside the composer; separate send/attachment states; instruction without a file | **Two halves.** *States — verify-only, re-measured*: `sendStatus` (`ClaraThreadView.tsx:181`), nine `QueueState` values with per-row retry/remove (`ComposerAttachmentControl.tsx:64-65`, `:108-118`, `useUploadQueue.ts:55`), a `failed` row deliberately not bricking the composer, and `sendDisabled` (`:254`) never requiring an attachment → cells `composer-attachment*` re-run, not copied. *Scope — **to build*** → `p642.web.scope_band_names_the_client` + `p642.e2e.scope_visible_at_both_altitudes`. |
| **AC2** Message Scroller / Message / Avatar / Bubble / Attachment / Marker; typed cards stay siblings | **Siblings — verify-only** (31-kind union + catalog parity pair; no Vercel AI Elements anywhere — GAP-ORDER §2). **Components — to build, D6 step 2**, gated on `p642.measure.ui_add_dryrun`; the same step-1 cells must stay green. Appendix D's "15-component production baseline" is **stale** — 30 are installed. |
| **AC3** duplicate send resolves one intent; accepted Work survives stream loss | *First half — **to build***: the content-addressed intent key + `replayed` on the 202 (`chatRoutes.ts:241`, `:298`) → `p642.db.begin_chat_turn_replay`, `p642.runtime.turn_replay_after_terminal`, `p642.web.intent_key_and_changed_attachments`, `p642.e2e.duplicate_send`. *Second half — verify-only*: `work_accepted` is a persisted part, the run is durable, `rail-boundary.test.tsx` pins survival across a scope switch away and back. |
| **AC4** queued/running/succeeded/refused/failed + source links; no prose/shimmer/count as completion | **partial → to build the live fold** (`p642.measure.chunk_trace` first, then `p642.web.live_tool_states`, `p642.e2e.tool_state_live`). `queued` = **named residual** (G3). Source links from the result card (G4). "Never accounting completion" is **verify-only** (`TurnProgress.tsx:3-28`; no shimmer anywhere). |
| **AC5** scroll position, labelled jump-to-latest, reconnect replacement, no late SSE across scope | *Scroll — **to build from zero*** (`p642.web.scroll_holds_position`, `p642.web.jump_to_latest`, `p642.e2e.long_history_scroll`). *Reconnect replacement — verify-only* (`stream.ts:186-199` clears `provisionalChunks` on both `message` and `detached`). *Scope — verify-only* (`rail-mount.tsx:97`) **except the `revoked` hole → to build** (`p642.web.revoked_is_not_reconnecting`). |
| **AC6** real reconnect, late attachment, long history, remounts, unsent draft, one log, focus, reduced motion | **partial.** Existing breadth is verify-only and re-run. **Owed cells**: long history, duplicate-send, `revoked`, scope-beside-composer, live tool state, 320px and 200% on the transcript itself. `@shadcn/helpers/ai-sdk` stays absent — no synthetic helper is acceptance. |
| **AC7** eight states, 320px, 200%, keyboard/focus return, SR names, reduced motion, URL/Back, drafts, accepted composition | **partial.** The state ladder is verify-only and re-measured after the restructure. **To build**: 320px + 200% on the transcript, the composer on `Field`/`FieldGroup` (`GAP-ORDER.md:81` §2 — *not* a 2026-09-15 §1 rule), and the D6 step-2 composition. **No money or date is rendered by the composer**; single locale, so C-45's localization is a missing-key question. |
| **AC8** production-facing read/command under least-privileged roles; durable execution, races, recovery on the real World; local vs hosted | **partial → to build the one missing arm**: `p642.db.*` through `humanQuery`/`asRuntime` personas plus the existing `chat-turn-v20-e2e.mjs` World leg re-run on YOUR rig. Everything else is verify-only (CLR census, `c5-stream-reauth-db`). **Hosted evidence pending** — ARCHITECTURE `<!-- #764 -->` block `:305-317` closes `[已实现，hosted evidence pending]` at `:316`. |
| **Blocked by #629 / #633** | **Both CLOSED/COMPLETED → #642 is unblocked.** Load-bearing: #633 owns the upload transport (which is why AC1's attachment half measures as built and why you must not re-own it beyond the hook's signature), #629 is the shared-question mechanism that makes UI-10's first third done. |
| **UI-02** card composition (DRIFT → REDESIGN) | **to build** — this is AC2's component half. Carry the keyboard (`composer-keyboard`, `interview-run-keyboard`) and scope (`rail-boundary`) regressions into whatever replaces the rows. |
| **UI-06** study a real precedent (PARTIAL → REDESIGN) | **verify-only** — the study exists: `docs/plan/active/prototypes/clara-visual/` (three variants, desktop + narrow screenshots, a seven-file native prototype; `src/components/ui/message-scroller.tsx:9`, `:84-120`). **Measure the redesign against those variants rather than re-deriving**, and cite the precedent in the report. |
| **UI-10 / UI-27** generative UI in chat (PARTIAL → REDESIGN) | **partial → AC4.** Shared question ✔, receipt-driven settled UI ✔, native streaming of tool state ✘ (only `clarify` is folded live, `liveClarify.ts:57-58`). **Resolve once; do not build twice.** |
| **UI-21** escalate onboarding to full screen (FIXED as opt-in → REDESIGN) | **verify-only, re-measured** (focus return, 320px, 200% on the escalated route). **#897 owns the runnable home** — build no second harness. |
| **UI-22** settled cards remain (FIXED → REDESIGN) | **verify-only, re-measured on the new transcript.** `OnboardingChecklistCard` is the FIRST child of the SCROLL region, not pinned above it (`ClaraThreadView.tsx:298-308` is deliberate) — a Message Scroller migration moves that boundary; keep the R7 shape. |
| **UI-32** no implementation jargon (FIXED → **LIVE AGAIN**) | **gap → build.** `PartRenderer.tsx:203` prints `part.tool` verbatim, so `start_accrual_work` reaches the reader as-is. Human label per tool via next-intl, raw token only as fallback. This is the row that makes AC4 more than cosmetics. |
| **CB-AE2E-008** `[object Object]` (FIXED → REDESIGN) | **verify-only** — carry the catalog parity pair intact; any new live fold registers no kind (see the binding line) so the back door stays shut. |
| **H-24** Enter sends (FIXED → REDESIGN) | **verify-only, re-run not copied.** The gate is the Button's own `sendDisabled`; after the key change **both** entries must still read that one predicate and `composer-keyboard.test.tsx`'s five cells (incl. IME) must be re-run. |
| **H-26** checklist `[object Object]` (FIXED → REDESIGN) | **verify-only** — out of surface except where the card sits inside the transcript. |
| **H-32** clarify card reads as a question (FIXED → REDESIGN) | **verify-only** — and the same defensive rule governs the new tool fold: absence renders **nothing**, never a guessed state (`liveClarify.ts:63-65`). |
| **C-42** provisional stream / parked reload / route errors / independent Work identity | **partial** — three quarters verify-only; the unclosed quarter **is** AC3's key reuse. |
| **C-45** truthful copy, localization, typed concurrency/budget feedback | **verify-only + two stale comments corrected**: `ComposerAttachmentControl.tsx:28-31` (CLR10 now maps to 400 at `chatRoutes.ts:111-112`, `:283-292`) and `ClaraThreadView.tsx:250-251` ("ships zh/ms locales" — only `en.json` exists). |

## 3. Slice (one branch)

**Migration — NONE.** See the first binding line. *The one thing that would change this answer is ruled out:* the
intent key does **not** need to survive a reload (appendix C §3, `appendix-C-journeys.md:85`: *Do not promise reload
recovery from memory-only state*), and content-addressing improves that case for free — the same sentence with the
same files retyped after a reload derives the same key and lands on the replay branch.

**Runtime — one non-frozen route edit, additive.** `packages/runtime/src/chatRoutes.ts:241` reads `replayed` off the
receipt beside `task_id` (the door already returns it, `0006:958`); `:298` answers
`res.status(202).json({ task_id: taskId, replayed })`. No client that ignores the field breaks. **`streamRoute.ts` is
NOT edited** — `revoked` is already emitted correctly at `:157`; the defect is the client's. **Add no `packages/runtime/lib/`
module**: anything a workflow imports freezes by closure (`lib/periodic-adjustment-basis.ts` is the precedent), and
nothing here belongs in a workflow's closure. `packages/runtime/README.md` gains two lines: the 202 body now carries
`replayed`, and the standing note that the full model stream reaches the browser verbatim, so a live-state question
is a web question.

**Web.**
1. **Scope band (AC1).** New `components/clara/ClaraScopeBand.tsx`, rendered by `ClaraThreadView` immediately above
   the composer `<form>` (`:582`) in **both** variants. Firm name always; client name when `clientId` is set; at firm
   altitude the existing `attachments.firmAltitudeNote` (`:589-591`) folds **into** the band instead of sitting as a
   loose `<p>` in the form grid. Read-only — **not** a switcher (the shell's `ScopeSwitcher` owns switching).
   Data, with **no new fetch on the rail's critical path**: inside `(firm)` use `useFirmScopeOrNull()`
   (`components/firm-scope-provider.tsx:86` — **never `useFirmScope()` at `:69`, which throws outside
   `FirmScopeProvider`, and `app/(full)/layout.tsx` is a bare passthrough that never mounts it**) and
   `useClientIdentity()` (`components/app-shell/scope-context.tsx:96`, whose null-not-a-guess rule you must preserve
   verbatim); on the two `(full)` pages pass `firmName`/`clientName` as props measured **server-side** —
   `requireFirmScope()` returns `CallerContextRow` carrying `firm_name` (`lib/require-firm-scope.ts:94`, `:201-207`)
   and `loadClientById` (`lib/firm/reads.ts:125`) uses the token the page already resolved (`page.tsx:26-29`).
   Degrade to the firm name alone rather than blocking the composer; never render another client's name.
   `ClaraFullScreenThread`'s `<h1>` (`:53`) takes the scope as its accessible name. Shape it **data-driven** (a label
   plus an optional per-item client attribution slot) so #664 fills the slot without a second band.
2. **One intent per send (AC3).** New web-only `lib/clara/intentKey.ts` exporting
   `deriveIntentKey({ threadId, altitude, draft, attachments }): string` — a stable hash over
   `threadId ‖ altitude ‖ draftText ‖ sorted(attachment.document_id)`. It needs **no new state**: `AttachmentPart` is
   `{type, document_id, intake_id}` (`types.ts:54`) and `ComposerAttachmentControl.tsx:109-115` emits only ready
   items carrying a `documentId`, so the address is a pure function of what is already on screen. `useClaraThread.ts:405`
   stops calling `crypto.randomUUID()` and passes the derived key as `postTurn`'s **fourth** argument
   (`postTurn(auth, sessionId, text, turnKey, attachments)`, `api.ts:205-210`); `TurnResult`'s accepted arm
   (`api.ts:73-77`) gains `replayed: boolean`, read from the 202 body at `:231`. Four properties, each with its reason:
   *(a)* a retry of the same intent reuses the key, because a refused or lost send leaves text **and** files in the
   composer (`ClaraThreadView.tsx:268-271` clears both only on `onRecord`) — appendix C §3's *Same operation identity
   for retries* (`appendix-C-journeys.md:77`); *(b)* a changed intent — **including a changed attachment set** — gets
   a new key automatically, because `begin_chat_turn` returns at `0006:957-960` **before** the insert at `:995-996`
   and never reads `p_user_parts`, so a same-key repost carrying invoice B after invoice A was admitted would return
   the original task and **drop B in silence** while the screen said "already accepted" (a wrong-books failure, not a
   UI annoyance) — the other half of the same row, *new intent gets a new identity*; *(c)* a **distinct** resubmit
   whose earlier outcome is unknown (`sendStatus === "error"`) shows a `checking` `role="status"` line and re-reads
   run + messages before posting (appendix C §3's left column), while a **same-key** retry does **not** gate on that
   read — the door's replay branch reads `clara.chat_messages` under the per-firm advisory lock (`0006:952`,
   `:955-956`), which is strictly better than any client read that would race the admission it protects;
   *(d)* on `replayed:true` the view says so **once** instead of drawing a second bubble. Enter and the Button keep
   reading the one `sendDisabled` predicate (H-24). **Binding**: if you choose a session-scoped or handed-out key
   instead, you must ship a user-facing "your attachment change was not resent" path **and** a named residual.
3. **Live tool state (AC4).** New `lib/clara/liveTools.ts` exporting `foldLiveToolParts(chunks)` beside
   `foldLiveClarifyParts`, copying its discipline line for line: deduplicate by `toolCallId` (a reattach replays from
   index 0, `streamRoute.ts:113`), and an unrecognised, malformed or incomplete chunk yields **nothing**. Four states
   per G3 plus *refused* from a settled `refusal` sibling. It renders **outside the log**, as a sibling group beside
   the clarify group, for the reason `ClaraThreadView.tsx:421-437` already gives. Chip label via next-intl keyed by
   the tool token, raw token as fallback (**UI-32**). No link on the chip (**G4**).
4. **Scroll ownership and jump-to-latest (AC5).** Step 1: a Clara-owned `lib/clara/useTranscriptScroll.ts` over the
   existing region (`ClaraThreadView.tsx:297`). Step 2: Message Scroller provider/viewport/content/item (appendix D
   #39) with **no nested scroll trap** (appendix D #48 — Message Scroller owns transcript scrolling). Requirements
   either way: a reader scrolled up stays put while content arrives; at the bottom, new content follows **without
   scrolling the primary workspace**; a labelled, keyboard-reachable jump-to-latest appears only when there is
   something below and has a real accessible name (not an icon alone); reduced motion gives an instant jump;
   reopening a closed rail re-reads current state (`useRailPresence`).
5. **`revoked` (AC5).** A `case "revoked"` in `applyClaraStreamEvent` (`stream.ts:178-202`) mapping the
   `{taskId, reason}` payload (`reason` is `"not_found"` or the AuthError code, `streamRoute.ts:157`) to a distinct
   **terminal** state, and a `break` in `runClaraTaskStream`'s event loop (`:419-425`) so it does not count as
   `sawProgress` (`:424`), does not reset the backoff (`:432`), does not take the ungraceful-close arm (`:434-439`)
   and **does not re-attach**. Its own `role="status"` line, exclusive with the other four exactly as they are with
   each other. The copy gets the care the five Stop-reply refusals got (`:479-496`) and must never become an
   existence oracle about the task.
6. **Composer on `Field` (AC7).** `FieldGroup`/`Field`/`FieldLabel`/`FieldDescription`/`FieldError` around the
   textarea following `work-question-form.tsx:70`; **keep the raw `<textarea>`** (the fixed 2/3-row decision at
   `:623-627` is deliberate — `Textarea` is `field-sizing-content`). What changes is label/description/error wiring
   and `aria-invalid`, never the control. **Keep `ring-ring/70`**: `tests/focus-ring-contract.test.ts` reds on
   `ring-ring/50` and `ClaraThreadView.tsx:628-635` records that trap by name.
7. **Responsive / a11y pass on both mount points**: 320px, 200% zoom, reduced motion, focus return, SR names, and the
   zero-nested-live-region invariant re-proven **with its vacuity control** after the restructure.
8. **Two stale comments corrected** (C-45): `ComposerAttachmentControl.tsx:28-31`, `ClaraThreadView.tsx:250-251`.
9. **D6 step 2 — the component migration.** One component at a time, `pnpm --filter @clara/web ui:add <name>
   --dry-run` then `--diff`, through `apps/web/scripts/ui-add.mjs`'s guard (WORK-ORDER rule 2), in this order:
   `avatar` → `bubble` → `message` → `marker` → `attachment` → `message-scroller` (cheapest blast radius first; the
   scroller last because it moves the live-region boundary). Stop rules are in the binding lines above. Check current
   official documentation through Context7 before using any of their APIs.

**Docs.** `CONTEXT.md` — the three terms above, house shape, sorted position. `apps/web/README.md` — the transcript's
live-region contract (one log, N exclusive statuses, no nesting), the scroll-ownership decision, and the intent-key
lifecycle with why it is memory-only. `packages/runtime/README.md` — as above. **Never `docs/PRD.md` or
`docs/ARCHITECTURE.md`** (AGENTS.md steps 4–5; GAP-ORDER §2). **Blueprint drift, recorded not edited, for #683**:
`ARCHITECTURE.md:182` says 51 `workflowBodies` (there are 53); `:183` and `:293` name `chatTurn_v19` / `claraWork_v3`
while `registry.ts:173`/`:270` pin **v20 / v4**; `PRD.md:121` lists 对话车道断线后的完整恢复 under 已接受、留待以后
citing the now-closed #764, while this ticket's AC5 builds exactly that.

**Successor contract: none.** State it positively in the report with the measurement, so #915 and #847 own the next
cut alone and no later reader re-litigates it.

## 4. TDD seams (red first)

**Measure first — these are the first work you do on the rig, before a line of the fold or an install.**

- **M1 `p642.measure.chunk_trace`** — drive one real turn on your rig (the `chat-turn-v20-e2e.mjs` World leg, or the
  runtime serve harness) and **capture the actual `fullStream` chunk sequence** reaching `event: chunk`; write the
  observed part names and payload fields into the test fixture and into the report. *Reason: DECISIONS §6 §7.4 #14 —
  the part vocabulary is documented, not measured; only the unfiltered forwarding is measured.*
- **M2 `p642.measure.ui_add_dryrun`** — `pnpm --filter @clara/web ui:add <name> --dry-run` (then `--diff`) for each of
  `message`, `message-scroller`, `bubble`, `attachment`, `marker`, `avatar`; record every file each would create or
  **overwrite**, every dependency it proposes, and whether it resolves at all for `base-nova`. *Reason: §7.4 #15 —
  unverified, `"registries": {}`, a recorded CLI failure on this exact config, and the guard protects only two files.*
- **M3 `p642.measure.frozen_closure`** — `node scripts/check-frozen-workflows.mjs --print-closure` from the worktree
  root, proving `packages/runtime/src/chatRoutes.ts`, `streamRoute.ts` and every `apps/web/**` file you touch are
  **outside** the closure, plus `node packages/runtime/scripts/check-parts-parity.mjs` green. *Reason: the harness,
  not a manifest parse, is the evidence for "this branch cuts nothing" (SYNTHESIS §7.2).*
- **M4 `p642.measure.mock_second_post`** — drive `chat-parity-mock.mjs`'s `/api/chat/:id/turns` arm (`:358`) twice and
  its `/stream` arm (`:366`) with a scripted `tool-call` + `tool-result` pair before writing the walk. *Reason: the
  map inferred both from reading, never drove them.*

**DB — extend `packages/db/tests/rig-runtime-lifecycle.test.mjs`. No new battery, no gate module, no cohort.**

1. **`p642.db.begin_chat_turn_replay`** — call the door twice with one key as `clara_runtime`: same `task_id`,
   `replayed: true`, **exactly one** `clara.chat_messages` user row, and the compute-cap counter unmoved.
   *Red today: nothing in the estate drives `0006:954-960`.*
2. **`p642.db.replay_is_not_a_second_live_turn`** — a replay while the original is still live returns the original
   rather than raising CLR13; the two arms must never be confused. *Red today: same reason.*

**Runtime — new `packages/runtime/tests/chat-turn-replay-db.test.mjs`, copying `c5-stream-reauth-db.test.mjs`'s boot
shape (express + `register` from `tsx/esm/api` + a real signed JWT + `server.listen(0, "127.0.0.1")`).**

3. **`p642.runtime.turn_replay_202`** — a second POST with the same `turnKey` answers
   `202 {task_id: <same>, replayed: true}` and adds no second user row. *Red today: `chatRoutes.ts:241` never reads
   the field and `:298` never sends it.*
4. **`p642.runtime.turn_replay_after_terminal`** — the same, **after the first turn has settled** (the case
   `uq_agent_task_one_live_turn` does not cover), and `clara.accounting_work` gains no second row. *AC3's decisive
   cell.*

**World leg — no new leg and no `action.yml` row.** Re-run the already-registered `packages/runtime/tests/chat-turn-v20-e2e.mjs`
on your own rig (command in §6) and report its exit code; a skipped leg is not evidence.

**Web unit — each file added to `apps/web/test/manifest.txt` at the sorted position.**

5. **`p642.web.intent_key_survives_a_refusal`** — a 500/network-failed send leaves draft **and** files in the
   composer; the retry derives and posts the SAME key; a successful send clears both and the next key differs.
6. **`p642.web.intent_key_and_changed_attachments`** — *the blocker's cell.* Same sentence, invoice A removed and
   invoice B attached after a lost ack → the derived key **differs**, a new turn carries B, and B is never silently
   dropped; control: identical text **and** identical attachment ids derive the **same** key. *Red today: no key
   exists at all.*
7. **`p642.web.distinct_resubmit_reads_state_first`** — with an earlier outcome unknown, a differing key shows
   `checking` and re-reads run/messages before posting; a SAME-key retry does **not** gate on that read.
8. **`p642.web.replayed_draws_no_second_bubble`** — a `replayed:true` 202 says so once and draws no second bubble.
9. **`p642.web.scope_band_names_the_client`** — rail and full-screen name the client; firm altitude names the firm and
   carries no client name; a scope switch re-labels it (the `rail-boundary` shape); an unpublished identity renders
   the neutral placeholder, never a stale name.
10. **`p642.web.scroll_holds_position`** — a reader scrolled up stays put across 50 appended deltas.
11. **`p642.web.jump_to_latest`** — the control appears only when there is something below, is keyboard-reachable,
    has an accessible name, returns to the bottom, and under reduced motion jumps instantly.
12. **`p642.web.live_tool_states`** — a `tool-call` chunk renders *running*, its `tool-result` *done*, a `tool-error`
    *failed*, a malformed chunk renders **nothing**, a settled `refusal` sibling renders *refused*; the chip shows
    the human label with the raw token only as fallback (**UI-32**). Built from M1's captured trace, not from docs.
13. **`p642.web.revoked_is_not_reconnecting`** — a `revoked` event stops the loop, renders its own single
    `role="status"`, and does **not** re-attach. *Red today: no case in the reducer; the loop counts it as progress.*
14. **`p642.web.live_regions_after_restructure`** — re-run `thread-live-regions`' zero-nested assertion **and its
    vacuity control** against the new tree; treat `nested-live-region` as a **gate**, not a check.
15. **`p642.web.composer_field_wiring`** — label/description/`aria-invalid`; the draft survives a validation failure;
    Enter and the Button still read one predicate.
16. **D6 step 2 re-run — no new cells.** Cells 5–15 plus `composer-keyboard`, `composer-attachment*`,
    `thread-live-*`, `thread-rehydrate`, `thread-stop-reply` and `rail-boundary` must all be green **unchanged**
    after the component swap. A cell that must change to pass is a regression; record it and stop step 2 there.

**Playwright — extend `chat-parity-walk.spec.ts` + `chat-parity-mock.mjs` (new RPC verbs: none; the mock needs only a
second-POST arm returning `replayed` and a scripted tool-call/tool-result pair). If you nonetheless add a verb,
declare it in `e2e-fixture-ownership.test.ts`, shared verbs declared shared (#863's census is blind to non-standard
dispatch spellings).**

17. **`p642.e2e.duplicate_send`** — post, drop the ack, post again: one bubble, one task, one Work.
18. **`p642.e2e.long_history_scroll`** — scroll up, stream 40 deltas, assert the position held and the jump-to-latest
    reachable by keyboard; then at **320px** and at **200% zoom**, with an axe scan.
19. **`p642.e2e.scope_visible_at_both_altitudes`** — rail and escalated route name the client; Back restores.
20. **`p642.e2e.tool_state_live`** — the chip moves *running* → *done* inside one turn, **before settle**.

**Census suites that will red, and how you keep them green**: `apps/web/test/manifest.txt` (every new file),
`tests/focus-ring-contract.test.ts` (any new `ring-ring/50` carrier — your named trap),
`scripts/check-token-contrast.mjs`'s `PAIR_SPECS` (a new chip tone or a new ground is a new pair;
`ClaraMessageBubble.tsx:43-53` records two live axe measurements on these exact grounds),
`scripts/check-message-keys.mjs` (every new user-facing string in `messages/en.json`),
`e2e/e2e-fixture-ownership.test.ts` (only if a verb is added). No new file under `app/**`, so
`tests/firm-scope-fourth-entrance.test.ts` should stay green — run the whole suite anyway and report counts.

## 5. Risks

1. **The live-region restructure is the highest-consequence edit in this ticket.** `ClaraThreadView.tsx:282-296` and
   `:349-375` record that the log was moved DOWN off the scroll container precisely because `InterviewRunCard`'s own
   `role="log"` nested inside it, and that the first suggested fix (dropping `aria-live`) would NOT have worked
   because `role="log"` carries an implicit polite live region. A Message Scroller migration moves that boundary
   again. Cell 14 is a gate.
2. **Merge collisions, exact files, whose hunk wins.** `ClaraThreadView.tsx` — **yours**; #645 and #839 rewrite it
   after you (sequence #642 → #645). `lib/documents/useUploadQueue.ts` — **you own the signature**, #636 adds one
   commented transport field; neither of you touches `ComposerAttachmentControl`'s `IN_FLIGHT` state strings
   (`chat-parity-walk.spec.ts:209` pins the terminal word). `lib/parts/types.ts` + `catalog.ts` + `messages/en.json`
   are read by #636 and #651/#655–#660 — additive registrations only, one ticket per kind, and **nobody registers a
   kind this wave**. `apps/web/package.json` + lockfile — three lanes; the integration worker regenerates the
   lockfile once. `chat-parity-walk.spec.ts` + `chat-parity-mock.mjs` are yours and #645's — append, never
   restructure the dispatch.
3. **`@shadcn/react` is a new production dependency** pulling a second component runtime beside `@base-ui/react` into
   a Cloudflare-Workers-built bundle. D6 rules it in; you still report the manifest delta and any build-size
   observation you can measure.
4. **The `ui:add` guard protects only two files.** See M2's stop rule. An unreviewed overwrite of `card.tsx` or
   `input.tsx` reverts owner-ruled decisions in files whose headers record them.
5. **The `revoked` fix is a behaviour change with a visible face.** Today a member removed mid-stream sees
   "Reconnecting…" forever; after the fix they see a refusal. That is correct, and it is the first time this surface
   tells someone they have lost access — the copy needs the Stop-reply sentences' care and must not become an
   existence oracle.
6. **A reused turn key can silently resend — or silently DROP — an intent.** Both hazards are designed out by content
   addressing; both need their own cell (5 and 6). *(b)* is the sharp one: a swapped invoice under one key is a
   wrong-books failure with no error anywhere.
7. **Blueprint drift is already on the floor and will widen** — carry the four lines to #683 or the next reader plans
   a cut against a stale pin.
8. **"No migration" will read as an omission.** Say it in the evidence, in the report, and in the branch's first
   commit message.
9. **Host contention and known reds.** `next build` may panic `0xc0000142` under ten-lane contention — retry once
   (#869); `npx playwright test` alone serves a STALE build (#865) — always go through `pnpm --filter @clara/web e2e`;
   `thread-live-clarify.test.tsx` has a known whole-suite load flake — re-run it alone and report **both**;
   `rig-isolation.test.mjs` T10b reds after a Workflow World has been bootstrapped on your database (#866) — report
   it as that, not as your defect, or clone `clara_642_world` first. Do not "fix" #707, #693 or the missing `pg_dump`.

## 6. Effort and rig

**Effort: XL** (DECISIONS §7) — the intent key and its route line, the live tool fold behind a captured trace, the
scope band on two mount points with two different data paths, the `revoked` arm, scroll ownership and jump-to-latest
from zero, the Field re-composition, 320px/200%/reduced-motion/focus passes, four new browser legs, two DB cells and
two runtime cells — **and then** six `ui:add` installs, a new production dependency and a rewrite of the product's
most carefully argued accessibility region, with every step-1 cell still green.

**Rig**: worktree `C:\Users\zhant\Desktop\clara-wt\642`, branch `impl/642-chat-stream-admission`, PG **55703** / db
**clara_642**. Node 22 first, every call: `export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`. DB env:
`export PGHOST=127.0.0.1 PGPORT=55703 PGUSER=postgres PGDATABASE=clara_642 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`.
**Never** set `CLARA_RIG_ALLOW_RESET=1` / `CLARA_RIG_ALLOW_ROLE_SWEEP=1`. Port triple:
`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3320 CLARA_E2E_NEXT_PORT=3321 CLARA_E2E_RUNTIME_PORT=3322`.

**Before your final report, run and report counts for every one of these:**

- `pnpm typecheck` and `pnpm lint` (worktree root) — both green.
- The **whole `apps/web` unit suite** once: `node scripts/run-tests.mjs` from `apps/web` (~5 min).
- Your DB cells: from `packages/db`, `node --test --test-concurrency=1 $GATES tests/rig-runtime-lifecycle.test.mjs`,
  where `$GATES` is the exact list of **40** `--import ./tests/*-preintegration-gate.mjs` flags copied verbatim from
  `packages/db/package.json`'s `"test"` script. **You add no gate to that chain.**
- Your runtime cells: from `packages/runtime`, with the PG env set,
  `node --test tests/chat-turn-replay-db.test.mjs`.
- The World leg, on your own rig: from `packages/runtime`,
  `PGHOST=127.0.0.1 PGPORT=55703 PGUSER=postgres PGDATABASE=clara_642 RELAY_TEST_MODE=1
  WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55703/clara_642 node tests/chat-turn-v20-e2e.mjs`
  (the CI shape at `action.yml:266-290`). If you need `rig-isolation.test.mjs` T10b green afterwards, clone first:
  `create database clara_642_world template clara_642` from a root connection with no other sessions open.
- The freeze evidence (M3): `node scripts/check-frozen-workflows.mjs` (+ `--print-closure`) and
  `node packages/runtime/scripts/check-parts-parity.mjs` — both expected **no-ops**, and their green **is** the
  evidence for the "no successor, no frozen edit" verdict.
- The browser legs: `pnpm --filter @clara/web e2e chat-parity` with your triple exported.
- **`packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` are NOT applicable** — this slice adds
  no SQL function. Say that in the report rather than leaving it unstated.

**Copy the house shapes from** (read the files, not only the stat): `packages/runtime/tests/c5-stream-reauth-db.test.mjs`
(real-HTTP + real-JWT + real-PG runtime cell), `apps/web/lib/clara/liveClarify.ts` (the defensive live-fold idiom your
`liveTools.ts` mirrors), `apps/web/components/clara/thread-live-regions.test.tsx` (assertion + vacuity control),
`84e778da` #653 (Playwright walk + file-disjoint lane mock + shared-verb declarations with the reason),
`1d042586` #646 and `e7b905e4` #647 (browser-lane shape and the defects running one found), `b24128c6` #633 (the real
-World e2e and its CI step — and the lane that owns the upload transport you inherit), and
`docs/plan/active/refresh-wave-2026-09-15/brief-649.md` + `refresh-wave-2026-09-14/brief-640.md` for the brief's own
discipline: behavioural cells rather than `prosrc` assertions, re-measured rather than copied evidence, an explicit
merge-order collision table, and every claim carrying the command that produced it with its pass/fail counts.

## Verifier findings not applied

**None — both findings were opened against their evidence, both were confirmed, and both are applied above.**
Nothing is refuted back, and nothing is withheld.

- **F1 (minor, `contradicts_decisions`) — applied.** The draft's closing note claimed *"DECISIONS §3.1 … omits
  #642's three"* CONTEXT terms. That was false: `DECISIONS.md:132-133` ratifies them **by name** — *"#642 —
  **Turn key** (content-addressed intent identity), **Conversation scope** (the firm/client band beside the
  composer), **Tool outcome** (the four live states + refused)"*. The "CONTEXT.md terms you write" bullet now states
  that binding and presents the three as the ratified glosses expanded with the house _Avoid_ clause; the false
  meta-claim is deleted from **both** places it appeared (that bullet and this section). This brief fills no gap in
  DECISIONS on CONTEXT terms — it restates one, and no fourth term may be added without an orchestrator ruling.
- **F2 (minor, `inexact`) — applied.** The `§7.4 #15` binding paragraph cited `appendix-D-components.md:35` for
  *"a recorded CLI failure on that exact configuration"*. Re-opened: `:35` is a different finding (`shadcn docs`
  returned no page links for Message / Message Scroller / Bubble / Attachment); the registries-config failure is at
  `:41` (*"`shadcn search @shadcn --limit 500 --json` failed because `components.json` has no configured
  registries… This CLI/config mismatch remains unresolved"*), which is where gap-642's own Unverified section cites
  it (`gap-642.md:543`). The citation is corrected to `:41`. `:35`'s separate fact is now carried in the same
  paragraph, because "four of your six components have no docs page in the CLI lane" changes how the implementer
  researches their APIs. The adjacent `:37` (MCP/app-context skew) and `:39` (combined dry run — 19 files, 13
  creates, six overwrites: Button, Label, Separator, Card, Input, Sheet) were re-opened and are correct as cited.

**One reconciler refinement, recorded rather than made silently** (no finding raised it; it contradicts nothing and
needs no ruling): the same `§7.4 #15` paragraph now also carries what DECISIONS §6 measured for that item — `pnpm
dlx shadcn@latest add chart --dry-run` resolved for this project's `base-nova` style on the #660 rig, with the
`ui:add … --dry-run`-first / never-overwrite-a-protected-file procedure binding. "Unverified" for your six items
therefore means *these six are unmeasured*, not *the registry is broken*; M2 still precedes any install, and its
STOP rule is unchanged.
