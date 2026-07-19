# Lane 1 — runtime turn lifecycle (ground truth for Slice-6 contract)

Scope: `packages/runtime/workflows/{chatTurn.v1.ts,chatTurn.impl.ts,chatTurn.prompt.ts,registry.ts}`,
`packages/runtime/src/{chatRoutes.ts,streamRoute.ts,index.ts}`, `scripts/check-frozen-workflows.mjs`,
`docs/plan/slice4-durable-runtime-contract.md` (v2.2), `docs/plan/slice5-as-built-amendments.md`.

## (a) chatTurn_v1 exact shape — frozen closure, infra injection, parts[] path

**Frozen closure (3 files, all `// @frozen`, hash-locked in `frozen-workflows.json`):**
- `chatTurn.v1.ts` — the workflow body (`"use workflow"`, `chatTurn.v1.ts:39-127`).
- `chatTurn.impl.ts` — every `"use step"` function it calls (`chatTurn.impl.ts:1-14` header).
- `chatTurn.prompt.ts` — `SYSTEM_PROMPT`, `clarifyTool`, the `ClaraPart`/`AiContentPart` types,
  `toTypedParts`/`findClarifyCall` (`chatTurn.prompt.ts:1-13` header: "changing the system
  prompt or a tool's shape IS a behavioural change ⇒ new `_vN`").

**Infrastructure vs. frozen behavior (the AB-16 precedent, `documentIngest.behavior.mjs` reuses
this exact pattern per `slice5-as-built-amendments.md:68-70`):** connection pools and the model
provider are **process globals**, never imported — `chatTurn.impl.ts:44-55`:
```
function pools() { return (globalThis).__claraPools ?? throw(...) }
function resolveModel(modelId) { return (globalThis).__claraModelForTest ?? openai(modelId) }
```
This keeps `lib/pools.mjs` tuning and provider wiring **outside** the frozen import closure (not a
workflow-version change), while every SQL statement a step runs (workflow *semantics*) stays
frozen. Per-attempt read credentials are minted **inside** the step that uses them and never cross
a step boundary (`chatTurn.impl.ts:174-179`, `199-203`) — step IO is durably persisted (contract
§4.1), so a plaintext secret must never appear in step input/output.

**Model binding:** `task.model` (the durable `model_snapshot`, minted once at admission by
`begin_chat_turn`, `0006_runtime_core.sql:990`) is read in `loadTaskStep` (`chatTurn.impl.ts:146-159`)
and passed straight into `runModelSegmentStep` → `resolveModel(model)` → `streamText({model,...})`
(`chatTurn.impl.ts:205-213`). This is **the one run-scoped parameter** (contract §4.9); everything
else in the closure is frozen text/schema, not a parameter.

**Where parts[] from `begin_chat_turn` reach the model:** `begin_chat_turn` (`0006_runtime_core.sql:923-999`)
inserts the user's `chat_messages` row (arbitrary `parts` jsonb, `:995-996`) **in the same
transaction** as the task row, then returns. The workflow's `loadContextStep`
(`chatTurn.impl.ts:162-181`) re-reads **all** `chat_messages` for the session ordered by `seq`
(`:169`) — including the just-inserted current-turn user row — and folds each through
`messageFromParts(role, parts)` (`chatTurn.impl.ts:324-338`) into an AI SDK `ModelMessage`.
**`messageFromParts` only understands two part types: `"text"` and `"clarify"`** (`:326-330`); any
other part `type` (including `"attachment"`) maps to `""`, is filtered out by `.filter(Boolean)`,
and — if it was the *only* content in that message's parts array — the whole message is dropped
(`messageFromParts` returns `null` when `text` is empty, and `loadContextStep` filters out nulls,
`:170`). **This is the precise, current-code confirmation of the Slice-6 gap:** an attachment part
on the user's turn is silently invisible to the model; nothing in the frozen v1 closure surfaces
even the *existence* of an attachment, let alone its content, to `messages[]`.

This is not accidental — it is Slice-5's ratified design decision, stated explicitly in the
dashboard: `apps/dashboard/app/chat/parts.tsx:111-113` —
```
// Honest-state law ([DELTA-OWNER-2]): the chat door is a CAPTURE door in Slice 5 —
// Clara does not perceive the attachment in-turn.
export const ATTACHMENT_NON_PERCEPTION_COPY = "Clara will see this document once it is filed.";
```
Slice 6's "in-turn attachment perception" is the reversal of this named Slice-5 boundary, not a
greenfield feature — so v2 must (i) change `messageFromParts`/`loadContextStep` (or an equivalent)
to surface attachment parts into the model's context, and (ii) the design contract should decide
whether the dashboard copy/DELTA-OWNER-2 framing is superseded or narrowed.

## (b) Attachment part admission as-built (AB-12)

Attachment parts are **not** validated inside `begin_chat_turn` itself — they are validated by a
**BEFORE INSERT trigger on `clara.chat_messages`**, `clara._tf_validate_chat_attachments()`
(`0007_document_pipeline.sql:601-634`), fired for every `role='user'` message insert — including
the one `begin_chat_turn` performs, so a rejection rolls back the just-created task too
(comment at `:598-600`). Checks, in order:
1. `new.parts` must be a JSON array (else `CLR10`, `:606-608`).
2. At most 5 elements with `type='attachment'` per turn (else `CLR10`, `:615-617`) — AB-13/F-10
   groups this under the CLR18-for-S5-limits amendment for *other* S5 limits, but this specific
   trigger still raises CLR10 as coded.
3. Each attachment element must have well-formed UUID `intake_id` **and** `document_id`, and there
   must exist a `clara.document_intakes` row with that `intake_id`, `firm_id = v_firm` (the
   **task's session's firm**, `:609-611`), `uploaded_by = v_author` (**the session's `created_by`**,
   not necessarily the turn's author — same-author-as-session-creator is the actual predicate),
   `status in ('finalized','adopted')`, and `document_id` matching (else `CLR11` — foreign,
   nonexistent, wrong-uploader, and non-terminal-status handles all collapse to the same CLR11,
   deliberately, "no tenant oracle", `:598-600`, `:627`).
4. `CLR11` is also returned when the task/session join itself doesn't resolve (`:612-614`).

Verified against `packages/runtime/tests/chat-attachment-admission.test.mjs` (skips if Slice-5
surface absent): own-firm adopted intake → `queued` (happy path); foreign-firm intake → CLR11;
same-firm-different-uploader intake → CLR11; non-terminal-status intake → CLR11; nonexistent
intake → CLR11; 6 attachments → CLR10. **What the part carries on the wire, confirmed by the
test fixture and `apps/dashboard/app/chat/api.ts:24,27`:** `{ type: "attachment", intake_id,
document_id }` only — no filename, no extraction/OCR content, no mime type. The dashboard's own
comment (`parts.tsx:105-107`) says the chip's filename/status are a **separate, optional lookup**
against `document_intakes_visible` (PostgREST), not carried in the part. So a Slice-6 read tool
that lets the model actually *see* the document's content (extraction text, structured fields)
does not yet exist anywhere in the runtime tool surface — it would be new (see (c)).

## (c) Tools chatTurn_v1 exposes today; adding a new one under the freeze law

**Today's tool set** (`chatTurn.impl.ts:63-117`), built fresh per segment with a per-attempt wake
credential when the session is client-bound (`runModelSegmentStep`, `:198-203`; when
`clientId` is null only `clarify` is exposed, `:199`):
- `get_context_pack(purpose?)` → `clara.get_context_pack(clientId, purpose)`
- `trial_balance()` → `clara.trial_balance(clientId)`
- `list_journal_entries(limit?)` → `clara.list_journal_entries(clientId, limit)`
- `get_journal_entry(entryId)` → `clara.get_journal_entry(entryId)`
- `clarify(question, context?)` — **no `execute`**; this is the AI SDK human-in-the-loop stop
  primitive (`chatTurn.prompt.ts:33-50`); `stopWhen: hasToolCall("clarify")`
  (`chatTurn.impl.ts:212`) halts the segment so the workflow body can park on a hook.

All four read tools wrap a `safe(label, fn)` helper (`chatTurn.impl.ts:65-71`) that turns a thrown
error into a `{error}` tool **result** (never a throw) so it becomes a `tool_error` typed part
(`chatTurn.prompt.ts:98-101`) instead of crashing the segment. Every read tool is scoped by
`clientId` — there is **no firm-scoped (client-agnostic) read tool today**; a "firm-scoped
unassigned-document read tool" (per the Slice-6 task framing) is a genuinely new capability, not
an extension of an existing one, and it will need its own `withReadWakeScoped` wiring plus a new
audited Postgres function (unassigned = presumably documents with no `client_id`/no filing yet —
confirm against the document-pipeline schema, out of this lane's scope).

**Mechanics to add a tool under the freeze law (Appendix A / contract §4.9):** you cannot add a
tool to `chatTurn.v1.ts`/`.impl.ts`/`.prompt.ts` — the freeze-lint (`scripts/check-frozen-workflows.mjs`)
hard-rejects any hash drift on files registered in `frozen-workflows.json`
(`REHASHED-VS-BASE`/`BODY CHANGED`, `:356-360`, `:411-415`) via an **append-only-vs-`origin/main`**
comparison that cannot be bypassed by editing the manifest in the same PR. The required path:
1. New files: `chatTurn.v2.ts` (+ its own `.impl`/`.prompt` companions, or a shared behavior module
   à la `documentIngest.behavior.mjs` per the AB-16 precedent) — each marked `// @frozen` with the
   same header discipline (infra via `globalThis`, never imported).
2. Add the new tool(s) + any new prompt text inside v2's closure; existing v1 files are **not
   touched** (append-only; editing `chatTurn.impl.ts` in place would fail `BODY CHANGED`/`REHASHED-VS-BASE`).
3. Repoint `workflows/registry.ts`: change the `chatTurn:` entry to the new export
   (`registry.ts:10,15`) while **keeping the `chatTurn_v1` export alive** in the file until zero
   non-terminal runs reference it (registry-file comment `:4-7`; freeze-lint capability (d) —
   `checkRegistryMonotonicity`, `check-frozen-workflows.mjs:436-444` — parses the registry
   structurally at HEAD vs. base and hard-rejects a class version decreasing or a class being
   **removed** from the registry, since a removed class strands its parked runs).
4. Every `start()` call site touching chat must resolve, by import provenance, back through
   `workflows/registry.ts` (capability (e), `checkEnqueueSites`, `:446-458`) — `chatRoutes.ts:146`
   (`await start(workflows.chatTurn, [{taskId}])`) already imports the registry object
   (`chatRoutes.ts:16`), so repointing the registry entry is sufficient; a direct
   `import {chatTurn_v2} from "./chatTurn.v2.js"` handed straight to `start()` would fail this
   check even though the export exists.
5. Locally run `node scripts/check-frozen-workflows.mjs --update` to register the new frozen
   files' hashes (refused under CI — local-only re-baseline, `:298-306`); commit the updated
   `frozen-workflows.json` alongside the new code. `v1`'s existing manifest entries must remain
   byte-identical.
6. Contract §4.9 rollback preflight: before rolling back to a pre-v2 image, confirm the rollback
   target still exports every workflow name+version that has non-terminal runs — a blind revert is
   forbidden (`slice4-durable-runtime-contract.md:313-315`).

## (d) Turn settle / metering path; where a coding flow would differ

- **Checkpointing (per-segment, durable, S4-AB6):** every model segment writes a
  `task_checkpoints` row via `checkpointStep`→`clara.checkpoint_turn` (`chatTurn.impl.ts:277-282`;
  `0006_runtime_core.sql:1129-1135`, idempotent by `(task_id, segment)`).
- **Settle (terminal, once — `settled` boolean guard, `chatTurn.v1.ts:49-54`):**
  `settleStep`→`clara.settle_chat_turn` (`0006_runtime_core.sql:1011-1067`). Tokens are **not**
  taken from the passed `p_tokens` (kept only for signature stability, `:1002-1004`) — the
  authoritative total is `sum(task_checkpoints.tokens)` for the task (`:1029`). Exactly **one**
  assistant `chat_messages` row per task is written
  (`insert ... on conflict (task_id) where role='assistant' do nothing`, `:1043-1045`) — there is a
  real DB constraint that a chat_turn task produces a single assistant reply row. Any structured
  write output (e.g. a posted-entry receipt) a future coding flow needs to expose durably would
  have to live in its own table(s)/typed-part shape, not compete for this one-row slot.
- **A long-running coding flow would differ** in at least: (i) it is not obviously "chat_turn"
  kind — `agent_tasks.kind` is currently only exercised as `'chat_turn'` here and `'chat_turn'`
  is what the concurrent-run cap counts (`begin_chat_turn`, `:979-985`); a coding task needs its
  own `kind` (or reuse with a discriminator) so it doesn't silently consume/compete for the firm's
  chat concurrency slot budgeted for advisory-only turns. (ii) `MAX_SEGMENTS = 12`
  (`chatTurn.v1.ts:37`) is a hard bound "on clarify round-trips per turn (safety)" — a
  write-capable multi-step coding flow (draft → je_review → approve) will likely need either a
  larger bound, a different workflow shape entirely (separate `_v1` workflow class rather than
  reusing chatTurn's segment loop), or explicit modeling of "propose, then park for human approve"
  as a *new* hook/interruption kind analogous to `clarify` (AB-9, `slice5-as-built-amendments.md:45-47`,
  already flags this: "the durable coding-TASK carrier lands with Slice 6's coding floor"). (iii)
  today's read tools return `{error}` on failure and never mutate; a write-floor tool would need
  the DB's structural write-authorization invariant (agent role is read-only at the role level —
  CLAUDE.md cardinal invariant) to gate it, i.e. any write tool still goes through an audited
  Postgres function, never a hand-written insert from the tool `execute`.

## (e) SSE relay + typed parts wire contract

**Wire shape today** (confirmed by `chatTurn.prompt.ts:59-73` + `streamRoute.ts` + dashboard
`apps/dashboard/app/chat/parts.tsx:27-90`): two layers.
1. **Live `chunk` events** — raw AI SDK `fullStream` parts written straight through
   (`runModelSegmentStep`, `chatTurn.impl.ts:217-224`, `writer.write(part)` — no transformation) and
   relayed 1:1 by `streamRoute.ts` (`send("chunk", winner.value)`, `:117`). The dashboard's
   `applyChunk` (`parts.tsx:27-90`) recognizes AI-SDK-native `type`s: `"text-delta"`, `"tool-call"`,
   `"tool-result"`, `"tool-error"`, `"error"`; everything else (start/finish/step markers,
   reasoning) is dropped on the floor client-side.
2. **Persisted, authoritative `ClaraPart[]`** (`chatTurn.prompt.ts:67-73`) — the **provider-neutral,
   durable** transcript shape, produced by `toTypedParts` at end-of-segment (`chatTurn.impl.ts:234`)
   and by `findClarifyCall`: `text`, `tool_call`, `tool_result`, `tool_error`, `clarify`,
   `clarify_closed`. **Note: `attachment` is not a member of the runtime's `ClaraPart` union at
   all** — it only exists as a *user*-authored part type validated by the DB trigger (§b) and as a
   dashboard-side type extension in `apps/dashboard/app/chat/api.ts:24,27`
   (`{type:"attachment", document_id, intake_id}`). The runtime-side `ClaraPart` type
   (`chatTurn.prompt.ts:67-73`) and the dashboard-side `ClaraPart` type (`api.ts:14-24`) are
   **two separate, hand-synced type unions** today — dashboard's is a superset including
   `attachment`; nothing enforces they stay in sync. A Slice-6 change that adds new typed parts
   (e.g. a `je_review` card) needs to add them to *both* independently, or the contract should
   name unifying them as a followup.
3. **Terminal `message` + `done` events** (`streamRoute.ts:74-77`, `137-153`): on any terminal task
   status the route sends the **persisted** parts (`clara.chat_messages` where `task_id=... and
   role='assistant'`, `:69-73`) as ground truth, then `done`. A non-terminal detach sends an
   explicit `detached` event (never `done`) so the client knows to reconnect (`:159-161`).
4. **Stream-close law (S4-P2):** `chatTurn_v1`'s `finally` closes the run's writable on every exit
   path (`chatTurn.v1.ts:120-124`, idempotent `closeStreamStep`, `chatTurn.impl.ts:309-317`); the
   SSE route independently terminates on terminal DB status as a belt-and-braces regardless of
   whether the engine readable ever signals done (`streamRoute.ts` header comment, `:1-7`).

## (f) Workflow-versioning law — shipping chatTurn_v2 beside v1 with in-flight v1 runs

This is answered mechanically in (c) steps 1–6 above; the safety property that makes it correct
with **in-flight v1 runs** specifically: WDK self-hosted has **no run-pinning** — an in-place edit
to a deployed workflow body silently changes the un-executed remainder of every parked run
(`chatTurn.v1.ts:1-10` header; spike finding T6, ARCHITECTURE Appendix A). Because v1's files are
never touched (append-only manifest, new files only), every already-admitted/parked v1 run keeps
replaying against the exact bytes it started with — the freeze-lint's `REHASHED-VS-BASE` check is
precisely the CI-enforced guarantee of this. The registry `chatTurn:` key is what enqueue sites
resolve through (`chatRoutes.ts:146`), so once repointed, **only new admissions** get `chatTurn_v2`;
existing `agent_tasks.workflow_run_id` bindings for v1 runs are untouched and keep resuming via the
engine's own run-id-keyed state, independent of the registry. `begin_chat_turn` never references a
workflow version at all (it only writes `model_snapshot`, `0006_runtime_core.sql:990`) — workflow
version selection happens entirely at the `start()` call site in `chatRoutes.ts:146`/`:141-150`,
which is what "repoint the registry" actually flips.

## Open questions / gaps for the contract author to decide explicitly

1. **The attachment-perception gap is real and located precisely** at `messageFromParts`
   (`chatTurn.impl.ts:324-338`) — v1 literally cannot surface an attachment to the model; v2 must
   change this function (or its call site) and decide what content to surface (raw extraction? a
   pointer + a new read tool the model can call?).
2. **No existing typed part represents an attachment inside `ClaraPart` (runtime side)** — decide
   whether v2 adds one (and reconciles it with the dashboard's already-existing `attachment` part
   type used only for the user's *own* turn today).
3. **No firm-scoped/client-agnostic read tool exists** — the "unassigned-document read tool" is
   wholly new plumbing (new tool + new audited fn + new wake-scoped read), not a variant of an
   existing tool.
4. **`agent_tasks.kind='chat_turn'` is hard-coded into the concurrency cap and the settle
   function's kind check** (`begin_chat_turn:980`, `settle_chat_turn:1021`) — a coding flow sharing
   this task kind would compete for the same cap and must go through the same one-assistant-row
   settle path unless the contract introduces a new kind/settle function.
5. **`MAX_SEGMENTS=12`** is a hard safety bound in the *workflow body* (frozen); a coding flow
   needing more back-and-forth (propose → review → approve → maybe-more) either fits inside 12
   segments or needs a different workflow entirely — this is a design decision, not a code fact,
   but the number is exact and worth stating in the contract.
