# Lane 5 brief — dashboard, parts catalog, human-approve lane (ground truth)

Scope: as-built facts only, for the Slice-6 (GATE-3) design-contract author. No proposals.

---

## (a) The typed `parts[]` wire contract as rendered TODAY

**Server-side vocabulary is narrower than the dashboard's client-side vocabulary.**

- Runtime authority — `packages/runtime/workflows/chatTurn.prompt.ts:67-73` defines the
  ClaraPart union the *assistant* can emit:
  `text | tool_call | tool_result | tool_error | clarify | clarify_closed`.
  `toTypedParts()` (same file, `:76-105`) maps AI-SDK content parts into this set; anything
  else ("reasoning / other provider parts") is **dropped before persistence** — never even
  reaches the DB row.
- There is **no `attachment` case in the runtime's own ClaraPart union**. The `attachment`
  part type only exists client-side (`apps/dashboard/app/chat/api.ts:14-24`) — it is
  authored by the BROWSER at submit time (`useComposerAttachments` → `postTurn`,
  `attachments.ts:142-144`) and lands in `p_user_parts` on the **user** message row. The
  workflow (v1, frozen) never inspects it — Clara does not perceive the attachment in-turn
  (`ATTACHMENT_NON_PERCEPTION_COPY`, `parts.tsx:113`; this is the "capture door" law,
  [DELTA-OWNER-2]).
- Dashboard rendering (`apps/dashboard/app/chat/parts.tsx`, `TranscriptParts`,
  `:133-187`): a `switch`-like if/else chain keyed on `p.type`:
  `text` → prose paragraph (empty trimmed text renders nothing).
  `attachment` → a chip keyed by `intake_id`, enriched (filename/status) from an optional
  `AttachmentLookup` map; renders the fixed non-perception note.
  `tool_call` → a chip whose status (`running`/`ok`/`error`) is resolved by scanning the
  WHOLE parts array for a later `tool_result`/`tool_error` with the same `tool_call_id`
  (`toolStatuses()`, `:118-126`) — i.e. status resolution is a second pass over history,
  not per-part.
  `clarify` → `ClarifyCard` (badge "Visible to your firm", question/context/framing, and
  — only for the LAST clarify part in the array (`lastClarifyIndex`, `:128-131`) — the
  live answer form wired to `ClarifyControls`).
  `clarify_closed` → a static card ("Clarify expired/cancelled. {framing}").
  `tool_result` / `tool_error` → **render nothing directly**; they only resolve the
  matching `tool_call`'s chip status.
- **Unknown-type degradation: silent, total drop.** The final branch of the if/else chain
  is `return null` (`parts.tsx:183`, comment "tool_result / tool_error resolve their
  call's chip" — but this branch is ALSO the catch-all for any `p.type` not matched
  above). There is no "unsupported part" fallback chip, no console warning, no visual
  trace at all. **A new part type (e.g. `je_review`) added to the wire today, with no
  matching branch added to `TranscriptParts`, is invisible to the user** — not degraded
  gracefully, just gone. This is the exact failure mode the design direction's
  "card-catalog parity test" (DIRECTION.md §3) is meant to catch at build time, but no
  such CI gate exists yet in this repo (grep found none).
- Two SOURCES of parts arrive at the client: (1) live SSE `chunk` events, folded
  incrementally by `applyChunk()` (`parts.tsx:27-90`) into a `LiveTranscript`, keyed to
  the AI-SDK's own fullStream shape (`text-delta`/`tool-call`/`tool-result`/`tool-error`/
  `error`), a DIFFERENT wire shape than the persisted `ClaraPart[]`; and (2) the
  terminal SSE `message` event / the REST `getMessages` read, which carries the
  **persisted, authoritative** `ClaraPart[]` straight from `chat_messages.parts`
  (`streamRoute.ts:69-76`, `chatRoutes.ts` messages endpoint). The comment at
  `parts.tsx:1-5` states this explicitly: "the persisted parts from the terminal
  `message` event stay the authority." Any new part type therefore needs BOTH a
  live-chunk-folding rule in `applyChunk` AND a persisted-render rule in
  `TranscriptParts` — two independent code paths that must agree (this is exactly
  what a parity test would need to check).

## (b) `answer_interruption` END-TO-END — the precedent for je_review card actions

Hop by hop, cited:

1. **Dashboard button** — `ClarifyCard`'s answer form (`parts.tsx:189-225`) calls
   `controls.onAnswer(text)` on submit, wired in `page.tsx:321-323` to `onAnswer`
   (`page.tsx:254-267`).
2. **`onAnswer`** calls `answerInterruption(token, id, answer)` — `chat/api.ts:296-303`.
   This is a **PostgREST RPC POST**, `rpc("answer_interruption", {p_id, p_answer:
   {type:"text", text: answerText}, p_op_key: crypto.randomUUID()}, token)` — goes to
   `${supabaseBase()}/rest/v1/rpc/answer_interruption` with `Accept/Content-Profile: clara`
   and the user's own session JWT as Bearer (`chat/api.ts:246-257`, `pgrestHeaders`).
   **This is the HUMAN lane — it never transits the runtime** (contract §4.2 law, stated
   in the file header comment `chat/api.ts:1-8`).
3. **DB fn** `clara.answer_interruption(p_id, p_answer, p_op_key)` — the interruption
   row lives in `clara.agent_interruptions` (§3.3 of the slice-4 contract,
   `docs/plan/slice4-durable-runtime-contract.md:182-189`), a human-lane-writable table;
   the fn is granted to `clara_authenticated`. (Function body not re-read in this lane —
   grant + row model confirmed via the slice-4 contract and `chat/api.ts` callsite; the
   `p_answer` payload is typed/structured, not free text, per contract §0 "payloads stay
   typed/structure-first.")
4. **How the parked run resumes** — the DB write triggers the engine's hook mechanism:
   the workflow opened a durable hook via `openInterruptionStep` (a `clarify:<uuid>` hook
   token minted in a MEMOIZED step so it survives WDK replay —
   `packages/runtime/workflows/chatTurn.impl.ts:242-249`) and parked the run
   `running → awaiting_input` atomically with the interruption insert via
   `clara.open_interruption` (same file, `:257-` region, "S4-AB4"). The DB-side answer
   fires the corresponding **resume** through `lib/control.mjs`'s leased delivery
   listener (`packages/runtime/lib/control.mjs` — a Postgres LISTEN/NOTIFY-driven
   listener that resumes the parked WDK run on the matching hook token; not re-read line
   by line in this lane, name confirmed via CLAUDE.md's own module map and
   `chatTurn.impl.ts`'s hook-token comments).
5. **Dashboard discovers the answer landed** by polling: `refreshClarify` retries
   `pendingInterruption()` for up to 5s (`page.tsx:119-138`) to find the interruption id
   in the first place (a race — "written slightly after the clarify chunk streams" per
   the code comment), and separately the SSE stream itself resumes emitting `chunk`
   events once the workflow continues (no separate "answered" push to the dashboard;
   the client sets `answered: true` locally in `onAnswer`'s success path,
   `page.tsx:261`, and otherwise just watches the stream for new chunks / the eventual
   `done`).

**Precedent shape for je_review actions**: (i) the dashboard action button calls a typed
PostgREST RPC directly (never the runtime) with a `p_op_key` idempotency token;
(ii) the RPC is a governed, granted DB function on a human-writable table;
(iii) the caller re-fetches/polls afterward rather than getting a push confirmation —
there is no websocket/SSE channel for governance-table changes, only for the
task's own model stream. A je_review "approve" button would follow the SAME shape:
call `approve_entry` (or a je-specific wrapper) directly via `rpc()`, then re-poll/re-render
from a masked read, exactly like `CorrectionWizard`'s `approveCorrection` step (see (f)).

## (c) How the dashboard authenticates to PostgREST/DB — and is `approve_entry` already callable?

- **Auth**: a dev-mode pasted Supabase session JWT, stored in `sessionStorage`
  (`TOKEN_KEY = "clara_dev_jwt"`, shared verbatim between `/chat` and `/documents` —
  `page.tsx:34`, `documents/page.tsx:15`). Sent as `Authorization: Bearer <jwt>` to BOTH
  the runtime (agent lane) and PostgREST (human lane) — see `pgrestHeaders()`
  (`shared/wire.ts:39-48`, duplicated in `chat/api.ts:229-238`). PostgREST resolves the
  JWT to a Postgres role via its usual `request.jwt.claims` mechanism; the DB-side
  functions further gate via `clara._human_ctx(clara.role_rank('bookkeeper'|'admin'|
  'viewer'))`, i.e. **role is a claim inside the JWT resolved by a DB-side rank
  function**, not something the dashboard computes or sends explicitly. There is no
  separate "act as agent" vs "act as human" credential split at the dashboard layer —
  it is the SAME JWT on both lanes; the split is which *host* (runtime vs PostgREST)
  and which *table/fn grant set* is reachable.
- **`Content-Profile`/`Accept-Profile: clara`** headers select the exposed schema
  (`pgrestHeaders`) — confirming PostgREST must have `clara` in its exposed-schemas
  config for ANY of this to work; this is an infra precondition, not a dashboard concern.
- **Is `approve_entry` already callable this way?** Yes, mechanically — nothing new is
  needed at the grant layer:
  - `clara.approve_entry(p_entry uuid, p_expected_revision uuid, p_attestation text
    default null, p_op_key text default null)` is defined in
    `packages/db/migrations/0007_document_pipeline.sql:1278-1335` (superseding the
    0004/0005 versions) and **granted to `clara_authenticated`**
    (`packages/db/migrations/0004_governed_fns.sql:767-780`, the grant list still names
    `clara.approve_entry(uuid, uuid, text, text)` — signature unchanged across
    versions). It requires `_human_ctx(role_rank('bookkeeper'))` — i.e. the JWT's
    resolved role must be bookkeeper-or-above, else it raises inside the fn (fails
    "honestly" as a Postgres exception, which `pgrestError()` surfaces verbatim).
  - It takes `p_expected_revision` (the exact-revision/optimistic-concurrency token
    already required by the fn — `journal_entries.revision_token`, bumped by trigger
    on every JE mutation, `0003_books_core.sql:338-343`) — this is the SAME
    exact-revision-token pattern Slice 6 needs for je_review's "approve with exact
    revision token" requirement; it already exists, unmodified, from Slice 2/3.
  - **Masked views vs functions — what is actually exposed for READS**: there is
    **no masked/RLS-view read path for journal entries** analogous to
    `document_intakes_visible` or `agent_tasks_visible`. Reads go through two RPCs
    instead: `clara.get_journal_entry(p_entry uuid)` → `{entry, lines}` jsonb
    (`0004_governed_fns.sql:716-722`) and `clara.list_journal_entries(p_client uuid,
    p_limit int default 50)` → `setof jsonb`, **filtered by `client_id` only — no
    `document_id` or `status` filter param** (`0004_governed_fns.sql:724-728`). Both
    are `security invoker` (not `security definer`) and granted to
    `clara_authenticated, clara_agent_ro` (`0004_governed_fns.sql:796-797`) — RLS on
    `journal_entries` itself does the firm-scoping (invoker executes as the caller's
    role, RLS applies). **Gap for Slice 6**: there is no "find the draft entry this
    document/turn produced" read — no `document_id`-keyed or `status='draft'`-keyed
    RPC/view. A je_review card sourced from "one supplier bill → one balanced draft"
    will need either a new filtered RPC/view or client-side filtering of
    `list_journal_entries` results by `entry.document_id`/`entry.status` fields already
    present in the jsonb payload (columns exist on `journal_entries`, just unfiltered
    at the RPC boundary today).

## (d) The `/documents` page structure — adding a new card/section

`apps/dashboard/app/documents/page.tsx` is the top-level composition:
- Token bar (dev JWT) → three parallel `Promise.all` reads on mount/refresh
  (`listDocuments`, `listActiveFilings`, `listClients`, `page.tsx:37`) → local
  `useMemo` derivations (unassigned = anti-join against active filings, FIFO by
  `created_at`; filed = the complement) → a two-pane layout: `<aside>` sidebar
  (upload dropzone + unassigned list + filed list) and `<section className=pane>`
  showing `<DocumentDetail>` for the selected doc.
- **Convention for adding a section**: `DocumentDetail.tsx` is itself composed of
  `<section className={styles.section}>` blocks, each: an `<h2 className={styles.h4}>`
  title, a `load()` callback (`useCallback`) that `Promise.all`s its own reads on
  mount (`useEffect(() => void load(), [load])`), a local `busy`/`err` pair, and an
  `act(fn)` wrapper (`:61-66`) that runs a mutation, then unconditionally re-`load()`s
  AND calls the parent's `onRefresh()` — i.e. **no optimistic UI; every mutation is
  followed by a full re-read from the DB** (masked/RPC reads are the only source of
  truth rendered). A one-off multi-step flow (see CorrectionWizard) is split into its
  OWN component file, mounted conditionally from a piece of state in the parent
  (`correctionFrom`, `DocumentDetail.tsx:172-175`) rather than inlined.
- **Data fetching pattern**: every read is a typed function in `api.ts` wrapping
  `pgrestSelect<T>(pathAndQuery, jwt)` (`shared/wire.ts:60-69`) with an explicit
  `select=` column list (never `select=*`); every write is a typed function wrapping
  `rpc(fn, args, jwt)` (`shared/wire.ts:72-83`) with a **fresh `crypto.randomUUID()`
  op_key per call** (`const opKey = () => crypto.randomUUID()`, `documents/api.ts:153`)
  — i.e. idempotency-key-per-click is the house style, not per-session/per-mount.
  A je_review card's approve action should follow this identical shape: a new
  `documents/api.ts`-style (or a new `chat/`-local) typed wrapper function calling
  `rpc("approve_entry", {...}, jwt)` with its own `opKey()`.
- No router/URL-as-truth wiring exists yet (`selected` is local component state, not
  reflected in the URL) — DIRECTION.md's "URL-as-truth" principle (§4.5) is NOT yet
  implemented anywhere in this codebase; Slice 6 would be introducing it fresh if the
  contract requires it, not building on precedent.

## (e) The attachment-chip submit-blocks-on-adoption flow (AB-12) — what it knows that je_review will need

- State machine (`apps/dashboard/app/chat/attachments.ts`, `AttachmentState`):
  `starting → uploading → polling → ready | failed | error`. `ready` requires BOTH
  `documentId` and `intakeId` to be non-null (`:141-144`) — i.e. **submit is blocked
  (`!att.ready`, `page.tsx:230` and the Send button's `disabled`, `page.tsx:472`) until
  every attachment has a real, adopted `document_id` from the DB**, not merely an
  uploaded-bytes acknowledgement. This is the "no success state before the DB row
  exists" law stated in the file's own header comment (`attachments.ts:3-4`).
- The polling loop (`run()`, `:60-97`) hits `readIntake()` (a masked-view PostgREST
  read, `shared/intake.ts:172-178`) up to 45 times at 1s intervals, deriving a
  human-honest `label` via `intakeStatusCopy()` (`shared/intake.ts:208-222`) at every
  tick — so the UI narrates each transport state (`Uploading…` → `Verifying…` →
  `Stored — not yet filed` etc.), never a bare spinner.
- **What a je_review card needs from this precedent**: (i) an "adoption" concept —
  the entity referenced by the card (the draft entry) must be re-fetched from the DB
  by ID once the mutating action completes, never assumed from the action's own
  response body; (ii) a **poll-until-terminal pattern with a bounded retry count and
  an honest timeout label** (`"Timed out"`/`"Timed out awaiting the intake row."`,
  `attachments.ts:91`) is the house idiom for "the state I need hasn't landed yet";
  (iii) **submit/approve buttons gate on a boolean readiness flag derived from ALL
  items' terminal states**, not a global spinner — the exact shape a je_review
  approve button (gated on the draft's balance/attestation/distinct-checker
  preconditions) should mirror.
- Also carried by the chip today: the **intake_id is what identifies the attachment in
  the persisted `ClaraPart`** (`{type:"attachment", document_id, intake_id}`,
  `chat/api.ts:24`) — `document_id` is the durable FK a je_review card would need to
  join against (`journal_entries.document_id` exists per (c) above), but there is
  currently **no wire path from an attachment chip to "the entry this document
  produced"** — that linkage does not exist in any UI surface today (confirms the gap
  named in (c)).

## (f) Existing card/approve UI precedent — quoted from the design direction docs

- DIRECTION.md §1 (adopted normative direction) names the target vocabulary
  explicitly: *"the typed `parts[]` transcript wire, the fail-closed card catalog
  (text-to-hydration, never text-to-code), the card lifecycle that re-derives
  authoritative status on hydrate, the PLAN→SHOW→GATE→VERIFY→RECOVER surfaces..."*
  (`docs/design/DIRECTION.md:7`).
- §4 "What Phase 4 builds first (design-critical path)" **names `je_review` explicitly
  as item 2**: *"`je_review` + `clarify` + `doc_review` (side-by-side evidence with
  region overlays) — the daily loop."* (`DIRECTION.md:38`). This is the only place in
  the repo's docs that names `je_review` by that token; **no `je_review` part type,
  card component, or masked view exists yet anywhere in the codebase** — it is 100%
  greenfield for Slice 6, confirmed by grep across `apps/dashboard` and
  `packages/runtime` (no hits for `je_review`).
- §2 row 4 (rewind vs reverse boundary) is directly binding on any je_review approve
  affordance: *"Drafts get local undo ('discard draft'); posted entries expose
  **only** Reverse-with-reason; the two affordances are visually and verbally
  distinct (never a shared 'undo' verb)."* (`DIRECTION.md:20`). The existing DB
  model matches this exactly: `draft_entry`/`approve_entry`/`reverse_entry` are three
  distinct governed fns (0004/0007), never a single toggle.
- §3 (CI gates) is the closest thing to a formal "card catalog parity test"
  requirement — *"live-render and hydrate-render extractors must agree, or the build
  fails (kills the D-2/D-4 class)"* and *"No dead vocabulary — every registered card
  type must have exactly one authoritative emit path and a reachability test."*
  (`DIRECTION.md:29-30`). **Neither gate exists in this repo today** (no such test
  file found under `apps/dashboard` or CI config) — confirmed absence, not just
  unread; this is the mechanism that would have caught the "unknown part type is
  silently dropped" behavior documented in (a), and Slice 6 is the first slice where
  it actually matters (introducing `je_review` as new wire vocabulary).
- No `ActionPanel`/⌘K/ObjectPanel component exists in the codebase (DIRECTION.md §4
  item 5 "⌘K Ask/Do/Go + object ActionPanels" is still unbuilt) — the CLOSEST existing
  precedent for a multi-step, gated approve UI is `CorrectionWizard.tsx`
  (select → preview → propose → approve, each step a distinct render branch keyed by
  a `Step` union, `busy`/`error` local state, PostgREST RPC calls with fresh op_keys,
  and an explicit `p_expected_revision`-style concurrency guard surfaced as an honest
  DB error — "distinct eligible checker" CLR19 is rendered as literal warning prose,
  `CorrectionWizard.tsx:135-138`) — a je_review approve card is a strict subset of
  this same shape (one fewer step: no "propose" phase, since `draft_entry` already
  produced the immutable draft).

---

## Summary of constraints/gaps for the contract author

1. **Wire union must be extended in THREE places, not one**: the runtime's
   `ClaraPart` union + `toTypedParts()` (`chatTurn.prompt.ts`), the dashboard's mirror
   `ClaraPart` union (`chat/api.ts`), and BOTH `applyChunk()` (live) and
   `TranscriptParts()` (persisted) in `parts.tsx`. Missing any one of the render
   branches means the new type silently vanishes (confirmed catch-all `return null`).
2. **`approve_entry` is already fully callable from the human lane today** — same
   grant, same role-rank gate, same `p_expected_revision` exact-token pattern Slice 6
   needs. No DB change required to CALL it from a je_review card.
3. **No read path exists to FIND the draft entry for a document/turn** —
   `list_journal_entries` filters by `client_id` only; no `document_id` or `status`
   filter, no masked view. This is a genuine new-build gap, not a wiring exercise.
4. **The `answer_interruption` flow is the direct precedent** for a je_review approve
   button: direct PostgREST RPC with a fresh op_key, no runtime involvement, and a
   poll/re-fetch afterward rather than a push confirmation.
5. **No CI parity/reachability gate exists** for the card catalog despite DIRECTION.md
   naming it as a requirement — Slice 6 is introducing `je_review` into a codebase
   with zero guard-rails against the exact failure mode (unknown-part-silently-dropped)
   already latent in `parts.tsx`.
6. **URL-as-truth and ⌘K ActionPanels are unbuilt** — do not assume either exists as
   infrastructure to build on.
7. Attachment-chip and CorrectionWizard are the two concrete UI precedents to mirror:
   adoption-gated readiness booleans + bounded poll-with-honest-timeout (attachments),
   and multi-step wizard-in-its-own-component with per-step busy/error and explicit
   revision-token concurrency surfaced verbatim (CorrectionWizard).
