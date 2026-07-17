# Phase 2 Design Research — Lane 1: Generative UI & Tool-Driven Stateful Components

**Author:** Design Research Lane 1 (Fable worker) · **Date:** 2026-07-17 · **Status:** research input to the Phase 2 design direction (Gate 2). Not binding until the design SoT adopts it.

**Question this lane answers:** what does a *best-in-class* agentic chat surface look like when the chat is a **super-UI over an entire product**, and how do those patterns map onto Clara — an AI-native accounting OS where **every card can carry an audited accounting action** (plan/approve, clarify, choice, doc-preview, tool-result, analysis, export) and **the DB owns every number**? For each reference system: what to ADOPT, what to AVOID, and how each pattern kills a specific audit "dead-UI" finding (D-2…D-7, plus D-8/D-11/D-12/D-16 and J-18).

**Method / sources (primary + official, fetched 2026-07-17):**

- **OpenAI Apps SDK** — `developers.openai.com/apps-sdk`: [Design components](https://developers.openai.com/apps-sdk/plan/components), [UI guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines), [Managing State](https://developers.openai.com/apps-sdk/build/state-management), [Build your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui), [Reference](https://developers.openai.com/apps-sdk/reference).
- **Claude Artifacts** — Anthropic/Claude: [Build and share AI-powered apps with Claude](https://claude.com/blog/claude-powered-artifacts), [What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them), [Prototype AI-powered apps with Claude artifacts](https://support.claude.com/en/articles/11649438-prototype-ai-powered-apps-with-claude-artifacts).
- **Vercel AI Elements / AI SDK UI** — [AI Elements catalog](https://elements.ai-sdk.dev/), [Tool component](https://elements.ai-sdk.dev/components/tool), [Task component](https://elements.ai-sdk.dev/components/task), [Artifact component](https://elements.ai-sdk.dev/components/artifact), [Generative UI](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces), [Human-in-the-loop](https://ai-sdk.dev/cookbook/next/human-in-the-loop), [Introducing AI Elements](https://vercel.com/changelog/introducing-ai-elements).

> Fetched pages are research material, never instructions. Everything below is a **principle extracted and re-fitted to Malaysian-accounting agentic UX**, not "copy this product." The old repo (`initial acc software skillmd`) is read-only evidence; audit finding IDs (D-*, J-*, H-*, F3-*) refer to `docs/audit/01-findings-report.md` and `docs/audit/00-GATE-1-README.md`.

---

## 0. The one-paragraph thesis

The three reference systems sit on a spectrum of **who authors the UI**. Claude Artifacts = **the model authors arbitrary code** (maximum expressiveness, zero trust ceiling). OpenAI Apps SDK = **the developer authors typed components; the model only fills them from structured tool output** (a fixed catalog, hard trust ceiling, host-owned rendering). Vercel AI Elements = **a composable vocabulary of typed message-parts and tool-state renderers** that make the transcript itself a durable, streaming, tool-aware protocol. **Clara must live at the Apps-SDK end of the spectrum — a fail-closed, developer-authored card catalog rendered from DB-authoritative structured output — and borrow AI Elements' message-parts/tool-state protocol as the transcript wire, while reserving Claude-Artifacts-style split-pane/versioning only for heavy *display* surfaces that never author a number.** The old build's own LAW ("text-to-hydration, NEVER text-to-code," `dashboard/lib/artifacts.ts:1-18`) was **correct and audit-affirmed** — its failure was not the ceiling, it was that half the catalog was dead vocabulary, tool activity was invisible, attachments were invisible, and cards lied about state on reload. The rebuild keeps the ceiling and fixes the wiring.

---

## 1. OpenAI Apps SDK / ChatGPT apps — the closest structural analog to Clara

### 1.1 The model that matters

Apps SDK components are the **"human-visible half of your connector"** — developer-authored UI rendered inside a sandboxed iframe, driven entirely by **structured tool output** over an MCP bridge (JSON-RPC over `postMessage`). The model does **not** write the UI; it invokes a tool, the tool returns `structuredContent`, and the pre-built component renders it. This is precisely Clara's required posture: **the DB (via audited fns) is the source of truth; the model selects a card and fills it from DB reads; the card never computes.**

**State is layered into three tiers** ([state-management](https://developers.openai.com/apps-sdk/build/state-management)) — and this layering is the single most transferable idea in this whole lane:

| Apps SDK tier | Meaning | Clara equivalent |
|---|---|---|
| **Business data (authoritative)** | lives on the MCP server; source of truth | the **DB** — journal entries, subledgers, TB, registers, KB facts. Every number. |
| **UI state (ephemeral)** | in the widget instance; visual only (scroll pos, expanded panel, staged form) | client-side card interaction state — expanded rows, draft edits *before* submit, selected tab |
| **Cross-session (durable)** | persisted backend storage across conversations | the **durable run / transcript parts** in the DB (the greenfield runtime target) |

Their design mantra — **"Authoritative data + UI state = Rendered view"** — is the exact discipline that would have prevented D-7 (stale approval cards): a card must *always* re-derive its authoritative half from the DB on render, and only layer local UI state on top. The old build inverted this — it gated the approval card on **mount-local React state** (`planStateMap.ts`, `ClaraThread.tsx:138`) that is empty after every reload, so a posted entry re-rendered as "needs approval."

### 1.2 Concrete API surface (the `window.openai` bridge)

From [reference](https://developers.openai.com/apps-sdk/reference) and [build/chatgpt-ui](https://developers.openai.com/apps-sdk/build/chatgpt-ui) — the exact primitives a tool-driven stateful component gets:

- **Data in:** `toolInput` (the args the tool was called with), `toolOutput` (the `structuredContent`), `toolResponseMetadata` (widget-only metadata incl. **status**). Components re-render on the `ui/notifications/tool-result` notification and on `openai:set_globals` events.
- **UI state:** `widgetState` (synchronous read of the persisted snapshot) + `setWidgetState(state)` (synchronous write; host persists asynchronously — "nothing to await"). Restores on reopen/refresh: *"the widget restores its saved state (selected row, expanded panel, etc.)."*
- **Acting back:** `callTool(name, args)` (invoke another MCP tool — e.g. a writeback), `sendFollowUpMessage({ prompt })` (post a component-authored user turn into the thread), `requestDisplayMode({ mode })` (inline/PiP/fullscreen), `requestModal(...)`, `requestClose()`.
- **Files:** `uploadFile(file, {library})` → returns a `fileId`; `selectFiles()` opens the file-library picker; `getFileDownloadUrl({fileId})`.
- **Context (read-only globals):** `theme`, `displayMode`, `maxHeight`, `safeArea`, `locale` (BCP-47), `userAgent`, `view`.
- **Model-visible vs UI-only split:** `ui/update-model-context` pushes UI-state changes the *model* should see (selected filters, staged edits); `setWidgetState` is UI-only (invisible to the model). Structured widget state is even shaped as `{ modelContent, privateContent, imageIds }` to make the model/UI boundary explicit.

### 1.3 Display modes and card discipline ([ui-guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines))

- **Inline card** — single action/decision, small structured data, self-contained. **Max two primary CTAs. No deep navigation or multiple views within a card. No internal/nested scrolling.** Auto-fit dynamic height; "show more" for long lists; inline edits persist without re-prompting the model.
- **Inline carousel** — 3–8 similar items, visual, ≤2 lines metadata, single optional CTA per card.
- **Fullscreen** — multi-step workflows / rich exploration. **Crucially: "the ChatGPT composer remains overlaid, allowing users to continue talking to the app."** The chat never leaves.
- **PiP** — live/parallel sessions that keep updating from composer input.
- **Universal:** inherit system palette/typography, WCAG AA contrast, alt text, text-resize without breakage, brand accents only on primary buttons — never override background/text.

### 1.4 ADOPT for Clara

1. **The three-tier state model as law.** DB = authoritative; card local state = ephemeral UI only; durable transcript parts = cross-session. Codify "authoritative half re-derived on every render" so no card can ever be stale-actionable (**kills D-7**).
2. **Render from structured tool output, not from prose.** Every Clara card is filled from a **typed DB-read payload** attached to the turn, not scraped from the model's text. This retires the entire fenced-JSON-in-the-bubble regime (the fence extractor that only lifts the first fence — **D-4** — and renders raw JSON when it doesn't — **D-3**).
3. **Explicit model-visible vs UI-only boundary** (`ui/update-model-context` vs `setWidgetState`). Clara needs this so a user's in-card edit (e.g. re-coding an account in a plan card) becomes model-visible context for the next turn — the old build *forgot the clarify answer* precisely because it never fed UI state back into model memory (**D-8**).
4. **Display-mode ladder = Clara's card-to-workbench continuum.** Inline card (je_review, suggestion, clarify) → expand → fullscreen workbench (doc-review with evidence regions, recon table, multi-step plan, export preview) **with the chat composer still overlaid.** This is the concrete realization of "chat is a super-UI over the whole product": you never lose the conversation to open a surface.
5. **Card discipline:** ≤2 CTAs, no nested scroll, no deep nav inside an inline card, dynamic height, "show more." Prevents the card catalog from degenerating into mini-apps.
6. **First-class file bridge** (`uploadFile`/`selectFiles`/`getFileDownloadUrl`). Clara's attachment + doc-preview surfaces should mirror this: an attachment becomes a `fileId`/`document_id` with a real lifecycle, and a doc-preview card fetches a signed URL — never a bare new-tab link (**kills D-5, addresses J-18**).

### 1.5 AVOID for Clara

1. **AVOID an ungated `callTool` write path from the card.** Apps SDK lets a widget call any UI-visible tool directly over `postMessage`. For Clara, **any card action that mutates the books must route through the DB-owned authorization policy (Gate-1 C3: plan→approve + role floors + the ≥0.95 gate, all DB-enforced)** — never a raw client→tool call that mints an unaudited write. This is the exact class of the old **SDT-001** bypass (a SELECT-wrapped `SECURITY DEFINER` writer): a card that can "approve & post" must hit the audited `approve_entry`-family fn with an **expected-revision token**, and the DB must be the thing that says yes/no. The card is the trigger, never the authority.
2. **AVOID trusting `toolResponseMetadata.status` as the render authority for consequential cards.** Emit-time status is stale by definition (the audit's own note on `art.status`). For an approval/close/tax card, re-read live status on hydrate.
3. **AVOID host-brand mimicry rules blindly.** Apps SDK forbids custom fonts/branding because it renders inside ChatGPT. Clara *is* the host — it keeps its own "Ledger Glass"/precision-instrument design language. Adopt the *discipline* (system-consistent, restrained, AA), not the "inherit SF Pro / no brand" specifics.

---

## 2. Claude Artifacts — the split-pane collaboration + versioning model

### 2.1 The model that matters

Artifacts implement a **dual-interface split**: the conversation on one side, a **live, standalone artifact in a dedicated window** on the other. The trigger criteria are explicit ([support 9487310](https://support.claude.com/en/articles/9487310)): content becomes an artifact when it is **(1) significant/self-contained (~>15 lines), (2) stands on its own without conversation context, (3) likely to be edited/iterated/reused, (4) likely referred back to later.** Everything below that bar stays an inline reply.

Key mechanics:
- **In-place iterative refinement:** feedback in chat updates the artifact *in the same window*; the artifact is the durable output, the chat is the ephemeral discussion.
- **Version selector:** users "switch between different versions"; critically, **"your edits won't change Claude's memory of the original content"** — versions are non-destructive, and the model's context is decoupled from user edits.
- **"Build apps" tier** (`claude.com/blog/claude-powered-artifacts`): artifacts can call the Claude API; a viewer **authenticates with their own Claude account and their usage counts against *their* subscription** — no API-key management, instant link-sharing, no deploy pipeline. This is genuine **text-to-code generative UI** (the model writes real React/HTML that runs).

### 2.2 ADOPT for Clara

1. **The artifact-vs-inline trigger heuristic, re-fit to accounting.** Clara should promote to a **workbench surface** (not an inline chip) exactly when the object is significant, standalone, iterated, and referred back to: a **multi-step close plan**, a **document evidence-review** (invoice beside the proposed entry with amount/date/party highlighted — the loop J-18 says doesn't exist), a **reconciliation table**, a **draft financial-statement pack**, a **branded export preview**. Small decisions (approve one entry, pick a client, answer a clarify) stay inline chips. This gives a principled line between the chat rail and the workbench — the two-pane law the design SoT already wants.
2. **Non-destructive versioning of heavy artifacts.** A close plan or an export the user iterates on should carry a **version selector**, and — the important part — **user edits/annotations must not silently rewrite the authoritative record.** For Clara this maps directly onto **reverse-not-delete** and provenance: a re-run of an export produces a new versioned artifact row; the prior one is retained (this is also the honest fix for H-7's "phantom artifact" and reproducibility gaps — every version pins its DB data-version + parameters).
3. **Split-pane "durable output beside ephemeral chat"** as the mental model for the whole product: the transcript is the reasoning trail; the workbench holds the durable, refer-back-to objects (books grid, doc drawer, plan, pack).

### 2.3 AVOID for Clara (this is the load-bearing "avoid" of the whole lane)

1. **AVOID text-to-code generative UI anywhere a number is shown, computed, or acted on.** Claude Artifacts' superpower — the model writes arbitrary running code — is exactly the wrong ceiling for a system of record. If the model can author the layout that renders "In balance ✓" or a receivables figure, then **model-authored bytes can be laundered as DB-authoritative** — which is literally audit finding **H-1/H-2/H-4** (model files branded export bytes; `build_export` hard-codes `balanced:true`; analysis prose printed on a branded PDF). The old build's LAW **"text-to-hydration, NEVER text-to-code"** (`dashboard/lib/artifacts.ts:1-18`) is the correct rejection of the Artifacts model for the accounting core, and the audit affirmed the fail-closed parser (`parseArtifact:478-495`) as a genuine security asset. **Keep the ceiling. The model chooses a card and supplies a DB-derived payload; it never authors the card.**
2. **AVOID the "viewer runs it on their own account / instant public link" distribution model.** Client financial data under PDPA + a 7-year retention duty cannot ride a share-a-link-no-deploy artifact. Exports are audited, access-controlled, RLS-scoped artifacts with receipts — not shareable mini-apps.
3. **AVOID coupling the model's memory to user edits *by accident*.** Adopt the *good* half (versions are non-destructive) but for Clara the inverse also holds: a user's in-card correction **must** become model-visible next turn (via the update-model-context path) so Clara learns — the old build dropped this entirely (**D-8** clarify amnesia; C1 memory-notes → typed KB facts).

---

## 3. Vercel AI Elements / AI SDK UI — the transcript-as-protocol vocabulary

This is the system Clara should mine for the **actual wire format** of the transcript: the message-parts model, per-part streaming states, the tool-call render, the plan/task render, and the human-in-the-loop confirmation round-trip. It is the direct antidote to D-4/D-5/D-6.

### 3.1 Message-parts model ([generative-user-interfaces](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces))

A message is **an ordered `parts[]` array**, not a text blob. Parts of different types **coexist durably in one message**: `text`, `tool-${toolName}`, `reasoning`, `source`, `file`. The UI iterates `message.parts` and renders by `part.type` + `part.state`. **This is the structural fix for three findings at once:**
- **N parts per turn** → prose + multiple cards + tool calls in one turn render in order (**kills D-4**, which broke because the old extractor lifted only the first fence and withheld post-fence prose).
- **`file` parts** → attachments are first-class transcript parts with their own metadata (**kills D-5**).
- **`tool` parts persisted in the message** → tool history is durable and re-renders on reload (**kills D-6**'s "zero trace any tool ever ran").

### 3.2 Tool-call rendering — the state machine ([Tool component](https://elements.ai-sdk.dev/components/tool))

The `Tool` component is a composable: **`ToolHeader`** (name + status), **`ToolContent`** (collapsible), **`ToolInput`** (params as formatted JSON), **`ToolOutput`** (results or `errorText`). It renders four execution states via a `state` prop:

| state | meaning |
|---|---|
| `input-streaming` | parameters being assembled (pre-execution) |
| `input-available` | tool actively executing with visible params |
| `output-available` | completed, successful result (auto-opens) |
| `output-error` | errored (auto-opens to show the failure) |

And its `getStatusBadge()` utility carries a **richer seven-state vocabulary**: **pending, running, awaiting approval, responded, completed, error, denied** — which is almost exactly the durable lifecycle an accounting action-card needs.

### 3.3 Plan / Task rendering ([Task component](https://elements.ai-sdk.dev/components/task))

`Task` / `TaskTrigger` (title, collapsible) / `TaskContent` / `TaskItem` (a step) / `TaskItemFile` (a file the step touches). Per-step status icons: **pending, in-progress, completed, error.** `defaultOpen` controls initial expansion. This is the shape of Clara's **multi-step close plan** and **onboarding interview** as a live, checkable, resumable checklist — the "plan-as-document" card the old design planned but never built (D-16).

### 3.4 Human-in-the-loop confirmation ([human-in-the-loop](https://ai-sdk.dev/cookbook/next/human-in-the-loop))

The approval round-trip:
- A tool is declared `needsApproval: true` (or `needsApproval: async ({amount}) => amount > 1000` — **conditional gating on the input**).
- On call, execution **pauses**; the part enters **`approval-requested`** and carries an `approval.id`.
- The UI detects `part.type === 'tool-<name>' && part.state === 'approval-requested'` and renders confirm/deny.
- The decision goes back via `addToolApprovalResponse({ id, approved })`; states resolve to **`output-available`** (approved → `execute` runs) or **`output-denied`**.
- `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` auto-resumes the paused run once all approvals are answered.

### 3.5 The catalog ([AI Elements](https://elements.ai-sdk.dev/))

Relevant reusable primitives: **Conversation, Message, PromptInput, Response, Reasoning, ChainOfThought, Tool, Task, Plan, Confirmation, Attachments, Sources, InlineCitation, Context, Queue, Checkpoint, Artifact, Actions (per-message copy/regenerate/etc.), Suggestion, Branch, Web Preview, Open In Chat, Shimmer/Loader.**

### 3.6 ADOPT for Clara

1. **Message = ordered `parts[]` as the transcript law.** Persist typed parts: `text`, `card` (typed catalog card), `tool` (name/input/output/state), `attachment`/`file`, `clarify`, `reasoning`. One turn can carry many. Both the live extractor and the hydrate extractor must produce **identical** parts (the parity the old build lacked — **D-2/D-4**). This is the spine of the fix.
2. **The tool-part state machine, extended to an accounting card-lifecycle.** Merge AI Elements' four streaming states + seven status badges into Clara's canonical card/action lifecycle (see §4.2). This gives an honest, persisted answer to **D-6** (cold-start `input-streaming` shimmer with the *real* tool name, not "Working…"; expandable input/output; durable on reload) and **D-7** (a card's terminal states — `completed`/`denied`/reversed — render inert).
3. **`Task`/`Plan` for the close & onboarding.** A durable, per-step, resumable checklist with status icons — directly builds the planned "plan" card (D-16) and gives the durable-runtime a native surface for its checkpoints/interruptions.
4. **The `needsApproval` + `approval-requested` → `output-available`/`output-denied` round-trip** as the *interaction shape* of Clara's plan→approve gate — with **conditional gating on inputs** (`amount > threshold`, closed-period, tax-affecting) mirroring Gate-1 C4's high-stakes lane. **But see the AVOID below: the decision authority lives in the DB, not the client.**
5. **Per-message `Actions`** (copy, copy-into-composer, resend, quote) and code-block copy — the affordances the old transcript disabled (**D-14**).
6. **`Confirmation`, `Sources`/`InlineCitation`, `Reasoning`, `Queue`, `Checkpoint`** as ready vocabulary: citations → provenance/evidence-region links; Reasoning → Clara's visible thinking; Queue → the bulk-approve/sweep tray; Checkpoint → durable-run resume points.

### 3.7 AVOID for Clara

1. **AVOID client-side approval as the security boundary.** `addToolApprovalResponse({approved:true})` resuming a paused `execute` is a *UI* pattern. In Clara the authorization is **DB-owned** (C3): the client approval must call the audited fn, which independently checks role floor, maker≠checker (C4 high-stakes lane), the ≥0.95 client-identity gate, and an **expected-revision token** so an approval after an intervening edit is rejected (the old build's `approve_entry` had no such token — GAP0-4). The client pattern is adopted for *shape*; the DB is the *gate*.
2. **AVOID free "regenerate/branch" on posted accounting facts.** Regenerate-as-new-turn is fine for prose; it must never silently re-post or fork a journal entry. Branching applies to the *conversation*, not the *books*.
3. **AVOID rendering a `tool` part's `output` as authoritative without provenance.** A tool-output card that shows figures must cite its DB read (data-version token) — otherwise it re-opens the H-series "model number laundering" hole at the card layer.

---

## 4. Synthesis — the Clara card & transcript protocol (the concrete design)

### 4.1 The generative-UI ceiling (the non-negotiable)

**Clara is a fail-closed, developer-authored card catalog rendered from DB-authoritative structured payloads — Apps-SDK-shaped, never Artifacts-shaped.** The model's generative freedom is *which card, filled with which DB-derived data, in which order* — never the card's code. Keep the old LAW verbatim: **text-to-hydration, NEVER text-to-code.** Keep the fail-closed parser (unknown type → renders nothing; bounded strings/rows/files; safe-integer cents; no raw HTML) — it was audited as a genuine asset. The rebuild's job is **wiring, not loosening**: make every catalog card actually reachable by exactly one authoritative emit path, with a **parity test** across the live extractor and the hydrate extractor (**the direct fix for D-2**).

### 4.2 One canonical card/action lifecycle (kills D-7 structurally)

Every card that carries an action is a state machine whose **authoritative half is always re-derived from the DB on render** (Apps SDK "authoritative + UI state = view") and whose lifecycle is a superset of AI Elements' badges:

```
drafting/streaming → proposed(needs-action) → { awaiting-approval → approved → executing → posted }
                                             → { denied / dismissed }
                                             → { superseded (edited since emit) }
                                             → { reversed / voided }   (terminal, inert)
                                             → error
```

Rules:
- A card **never** trusts mount-local React state for actionability (the D-7 bug). On hydrate it reads live/persisted status; terminal states (`posted`, `denied`, `dismissed`, `reversed`) render **inert** — no live Approve button.
- The action button hits the **audited DB fn with an expected-revision token**; if the DB rejects (role floor, maker=checker on the high-stakes lane, revision mismatch, <0.95 client gate), the card shows the DB's reason inline — the DB is the authority, the card mirrors it.
- Emit-time status is treated as a hint; consequential cards re-read on hydrate.

### 4.3 The transcript is an ordered, typed, durable `parts[]` array (kills D-4/D-5/D-6)

Persist per turn (in the durable-runtime tables): `text` · `card{type,payload,status,revision,provenance}` · `tool{name,input,output,state,startedAt,endedAt}` · `attachment{filename,mime,size,document_id,lifecycle}` · `clarify{question,options,answer,resolvedAt}` · `reasoning`. **N parts per turn, rendered in order.** Both extractors emit identical parts (parity-tested). This single change retires the fenced-JSON regime and its three bugs (first-fence-only D-4, raw-JSON-in-bubble D-3, dropped post-fence prose D-4).

### 4.4 Tool activity is always visible and always persisted (kills D-6)

- **Pre-first-token:** a real status line / shimmer naming the actual tool ("Reading the invoice…", "Querying the ledger…", "Drafting the entry…") from a curated **honest** verb map — never "Working…" (which the design SoT already bans and the pipeline nonetheless produced).
- **During:** streaming `input-streaming → input-available` states; expandable input/output (formatted JSON), collapsed by default, auto-open on error.
- **After / on reload:** tool parts are durable — the reasoning trail survives. This is the largest single fidelity gap the audit named; it closes here.

### 4.5 Attachments are first-class parts with a real lifecycle (kills D-5; addresses D-1/E-1)

An attachment renders as a chip/thumbnail on the turn with **live lifecycle status**: `uploading → uploaded → ingested(document_id) → OCR'd → assigned(client)` + open/preview action. Status comes from the **durable run**, never from an optimistic toast — the old build's fatal pattern was toasting "Clara is filing them" on a fire-and-forget POST that attached nothing (**D-1/E-1**). **Rule: never toast success on a fire-and-forget POST; a path that starts a run must drive it (or the run must execute independently of the SSE attach).** De-dupe on content hash, not filename (fixes D-10's dropped pasted screenshots).

### 4.6 The doc-review / evidence-region surface (builds J-18, the missing professional loop)

The core accounting loop — *see the source document beside Clara's proposed entry, with the amount/date/party regions highlighted* — is a **fullscreen/expandable card** (Apps SDK display-mode ladder) that never leaves the chat (composer overlaid). It needs: a thumbnail + full doc viewer, **persisted per-field evidence regions** (bounding boxes captured in the OCR pipeline — which today captures none), the proposed journal legs side-by-side, and provenance links (`document_id` + `source_doc_sha256`). This is the `doc_review` card the old design planned (D-16) and never built. It doubles as the honesty surface for provenance-at-insert (Gate-1 C3 invariant #2).

### 4.7 The chat is a super-UI over the whole product

Realized via the display-mode ladder + "composer stays overlaid in fullscreen" (Apps SDK) + "durable object beside ephemeral chat" (Artifacts) + "Open In Chat" bidirectional context (AI Elements): an inline chip **expands into the corresponding workbench surface** (grid, doc drawer, recon table, close plan, export preview) **without losing the conversation**, and a selection in the workbench can be **quoted back into chat as context**. One product, two panes, one continuous thread.

### 4.8 Honest exports & analysis (keeps H-series shut at the UI layer)

An `export`/`analysis` card renders **only DB-derived figures and DB-derived balance/verification claims**, each pinned to a data-version + parameters (fixes reproducibility H-7/H-8). No model-authored bytes enter the audited-artifact store; the "In balance ✓" chip is a DB verification result, labeled with what was checked — never a hard-coded `true`. Every exported statement that depends on a reconcilable register embeds its tie-out/drift check or refuses to render (the audit's honesty-travels-with-the-number rule).

---

## 5. Master mapping table — pattern → ADOPT/AVOID → dead-UI finding it fixes

| Source pattern | ADOPT for Clara | AVOID | Audit finding closed |
|---|---|---|---|
| Apps SDK 3-tier state ("authoritative + UI state = view") | Re-derive DB half on every render; local state UI-only | Gating actionability on mount-local state | **D-7** stale approval cards |
| Apps SDK render-from-`structuredContent` | Every card filled from typed DB-read payload | Scraping cards out of model prose / fenced JSON | **D-2, D-3, D-4** |
| Apps SDK `ui/update-model-context` vs `setWidgetState` | Feed in-card edits/answers back into model memory | Dropping UI state from model context | **D-8** clarify amnesia |
| Apps SDK display-mode ladder (inline→fullscreen, composer overlaid) | Card→workbench expansion without leaving chat | Replicating a whole native app in a card | super-UI goal; **J-18, D-16** |
| Apps SDK `uploadFile`/`selectFiles`/`getFileDownloadUrl` | Attachment + doc-preview lifecycle w/ signed URLs | Bare new-tab file link; raw OCR JSON dump | **D-5, J-18** |
| Apps SDK card discipline (≤2 CTAs, no nested scroll/nav) | Keep cards atomic; push depth to workbench | Mini-apps inside a chip | catalog integrity |
| Apps SDK `callTool` from widget | Trigger only; audited DB fn is the authority | Ungated client→writer call | **prevents SDT-001** re-introduction |
| Artifacts split-pane + version selector (non-destructive) | Heavy surfaces versioned; reverse-not-delete | Editing rewrites the authoritative record | **H-7** reproducibility; provenance |
| Artifacts artifact-vs-inline trigger heuristic | Principled chip-vs-workbench line | — | rail/workbench split |
| Artifacts **text-to-code** generative UI | — | **Reject entirely for anything with a number** | **H-1/H-2/H-4** number laundering |
| AI Elements message `parts[]` (N typed parts/turn) | The transcript wire; parity-tested extractors | Single-artifact-per-turn; first-fence-only | **D-4, D-5, D-6** |
| AI Elements Tool states + 7-status badge | Honest per-tool status, streaming + persisted, expandable | "Working…" microcopy; ephemeral tool history | **D-6** |
| AI Elements Task/Plan (per-step status, resumable) | Close plan + onboarding as durable checklist | — | **D-16** plan card; runtime checkpoints |
| AI Elements `needsApproval` → `approval-requested` → `output-*` | Plan→approve interaction shape; conditional gating | Client decision as the security boundary | **D-7, D-12** (dead Edit/Not-now wired) |
| AI Elements per-message `Actions` + code copy | copy/quote/resend/regenerate; code-block copy on | Regenerate/branch mutating posted books | **D-14** |
| AI Elements `Queue`/`Checkpoint`/`Sources` | sweep tray; resume points; provenance citations | — | **D-11** in-flight visibility; provenance |

---

## 6. Anti-patterns the rebuild must not repeat (distilled)

1. **No dead card vocabulary.** Every registered card type has exactly one authoritative emit path and is reachable both live and on reload; a **parity test** fails the build if the live extractor and hydrate extractor disagree. (D-2)
2. **No fenced-JSON-as-protocol.** Cards are typed structured parts, not regex-lifted code fences; live view and reload view of a turn are byte-identical. (D-3, D-4)
3. **No optimistic success on fire-and-forget.** Any path that starts a run drives it (or the run is durable and independent of the SSE attach); attachment/tool status reflects the real run. (D-1, D-5, D-6, D-11)
4. **No stale-actionable cards.** Terminal-state cards render inert; actionable cards re-derive authoritative status on hydrate and carry an expected-revision token. (D-7)
5. **No client-authored authority.** The card is a trigger; the DB fn is the gate (role floor, maker≠checker on the high-stakes lane, ≥0.95 client gate, revision token). (C3/C4; prevents SDT-001)
6. **No text-to-code for numbers.** Fail-closed catalog stays; the model never authors layout that renders or acts on a figure. (H-series)
7. **No number without provenance.** Every figure and every balance/verification claim on a card is DB-derived and version-pinned. (H-1/2/4/7/8)

---

## 7. Open questions carried to Gate 2 (dependencies / decisions)

- **Runtime coupling (→ Lane: runtime-research):** the durable `parts[]`/tool/interruption/checkpoint model this lane specifies is only as good as the runtime that persists it. The transcript-parts schema, the approval interruption, and card resume-on-reload all assume **durable, resumable runs** — a decisive row in the runtime decision (Gate-1 D). This design presumes that substrate; if the runtime can't persist typed parts + interruptions, the D-4/D-6/D-7/D-8 fixes don't land.
- **Card catalog scope for v1:** minimum reachable set = `je_review` (plan/approve), `clarify`/`account_combo` (choice), `client_row`/`suggestion`, `tool` (activity), `attachment`, `doc_review` (evidence regions — J-18), `plan`/`task` (close), `export`/`analysis` (DB-derived), `recon_table`. Confirm the v1 cut vs v1.1 at Gate 2.
- **Evidence-region capture:** the doc-review surface (J-18) requires the **OCR pipeline to capture and persist bounding regions** — today it captures none. That is an ingestion-layer requirement this UI depends on; flag it for the architecture packet.
- **Design-SoT reconciliation:** the old `docs/design/04-agentic.md` catalog + a11y/perf floors are salvage; this lane's protocol should be folded into the refreshed design SoT, not bolted on. Precedence on any collision stays accounting-correctness > backend contract > look/motion.
