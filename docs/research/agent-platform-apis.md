# Agent platform APIs — AI SDK 7, Workflow DevKit 4, and the re-platforming question

Research resolving wayfinder ticket [#581](https://github.com/BELCORT-SDN-BHD/clara/issues/581) (map: #573).
Date: 2026-09-08. Branch: `research/agent-platform-apis`.

## Scope and method

Every fact below is tagged with the package version it applies to. Sources are ranked:

1. **Shipped artifacts of the exact pinned versions** — `.d.ts`, compiled `dist/`, and the
   `docs/**/*.mdx` trees that `workflow@4.8.4`, `@workflow/core@4.8.4` and `ai@7.0.77` publish
   *inside their own npm packages* (their `package.json` `"files"` field includes `docs/**/*`).
   This is the strongest source available: it is the documentation for the version actually
   installed, not for whatever is current on the docs site. Local paths are given so any claim
   can be re-checked offline.
2. **npm registry metadata** (`registry.npmjs.org`) for versions/peer ranges — queried live.
3. **Live docs** at `workflow-sdk.dev` and `ai-sdk.dev`.

`useworkflow.dev` 308-redirects to `workflow-sdk.dev`; **`workflow-sdk.dev` is the canonical
docs domain**. `vercel.com/docs/workflow` is a narrower platform doc, not a replacement.

Versions in play (from `packages/runtime/package.json`):

| Package | Clara pins | npm `latest` (2026-09-08) | Installed locally? |
|---|---|---|---|
| `ai` | 7.0.77 | 7.0.93 | yes |
| `@ai-sdk/openai` | 4.0.46 | — | yes |
| `@ai-sdk/provider` | 4.0.7 | — | yes (dev) |
| `@ai-sdk/react` | *not installed* | 4.0.x | no |
| `workflow` | 4.8.4 | 4.8.5 | yes |
| `@workflow/core` | 4.8.4 (transitive) | — | yes |
| `@workflow/world-postgres` | 4.3.4 | 4.3.5 | yes |
| `@workflow/ai` | *not installed* | **4.2.1** (`beta` = 5.0.0-beta.15) | no — fetched tarball for this study |
| `nitro` | 3.0.260610-beta | 3.0.260903-beta | yes |

---

## 1. `ToolLoopAgent` (`ai` 7.0.77)

### 1.1 Naming and import

`ToolLoopAgent` is the **class**; `Agent` is the **interface** it implements. Both are exported
from `ai`. `Experimental_Agent` is a backwards-compat alias of the same class — the export list
contains literally `ToolLoopAgent as Experimental_Agent, ToolLoopAgentSettings as
Experimental_AgentSettings` and, separately, `ToolLoopAgent, ToolLoopAgentSettings`.

```ts
declare class ToolLoopAgent<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT>
  implements Agent<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  constructor(settings: ToolLoopAgentSettings<CALL_OPTIONS, TOOLS, RUNTIME_CONTEXT, OUTPUT>);
}
```

Source: `node_modules/.pnpm/ai@7.0.77_.../ai/dist/index.d.ts` lines 5152–5155 and the export
barrel at line 9442. The rename from `Experimental_Agent` landed in AI SDK **6.0**, before the
7.0.x line — it is not a pending change. (ai 7.0.77)

### 1.2 Constructor options — what actually exists

Verified field-by-field against `ToolLoopAgentSettings` (`dist/index.d.ts` line 4941 onward).
The type is `LanguageModelCallOptions & Omit<RequestOptions<TOOLS>,'abortSignal'> &
ToolsContextParameter<TOOLS> & { … }`, so all the usual generation settings
(`temperature`, `maxOutputTokens`, `topP`, `seed`, `headers`, `providerOptions`, …) are present
alongside the agent-specific fields:

| Option | Exists at 7.0.77 | Notes (verbatim from the `.d.ts` JSDoc where quoted) |
|---|---|---|
| `model: LanguageModel` | yes (required) | — |
| `instructions?: Instructions` | yes | "a string, or, if you need to pass additional provider options (e.g. for caching), a `SystemModelMessage`" |
| `system` | **no** | Not a field on `ToolLoopAgentSettings`. Use `instructions`. `allowSystemInMessages?: boolean` (`@default false`) controls whether system messages may appear in `prompt`/`messages` instead. |
| `tools?: TOOLS` | yes | — |
| `toolChoice?` | yes | "Default: 'auto'." |
| `stopWhen?` | yes | `@default isStepCount(20)` |
| `activeTools?` | yes | limits available tools without changing result types |
| `toolOrder?` | yes | "Tools not listed in `toolOrder` are sent after the listed tools, sorted alphabetically. This can improve provider-side caching…" |
| `toolApproval?` | yes | "This configuration takes precedence over tool-defined approval settings." |
| `prepareStep?` | yes | — |
| `prepareCall?` | yes | runs once before the loop; can return `toolApproval` per request |
| `onStepFinish?` | yes, **deprecated** | superseded by `onStepEnd` |
| `onFinish?` | yes, **deprecated** | superseded by `onEnd` |
| `context` | **no** | The field is `runtimeContext?: RUNTIME_CONTEXT` — "Treat runtime context as immutable. If you need to mutate runtime context, update it in `prepareStep`." |
| `output?`, `id?`, `callOptionsSchema?` | yes | — |
| `experimental_toolCallers?` | yes | "Configures which caller tools may invoke each tool." |
| `experimental_refineToolInput?`, `experimental_download?`, `experimental_repairToolCall?` (deprecated → `repairToolCall`), `telemetry?` / `experimental_telemetry?` (deprecated) | yes | — |

Two corrections to the ticket's premise: there is **no `system`** and **no `context`** option.

### 1.3 `generate` vs `stream`

```ts
generate(options: AgentCallParameters<…>): Promise<GenerateTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;
stream(options: AgentStreamParameters<…>): Promise<StreamTextResult<TOOLS, RUNTIME_CONTEXT, OUTPUT>>;
```

Both take `prompt`/`messages`, `abortSignal`, `timeout`, `experimental_sandbox`, typed `options`
(when `callOptionsSchema` is set) and the lifecycle callbacks; `stream` additionally takes
`experimental_transform`. Note `stream()` returns a **Promise** of the result object.
(ai 7.0.77, `dist/index.d.ts`)

The loop stops on: a finish reason other than tool-calls; a tool invoked with no `execute`; a
tool call requiring approval; or a `stopWhen` condition.

### 1.4 `createAgentUIStreamResponse`

Exported from `ai`, alongside `createAgentUIStream` and `pipeAgentUIStreamToResponse`
(`dist/index.d.ts` line 5210, export barrel line 9442). It takes `{ agent, uiMessages, … }` —
note **`uiMessages`, not `messages`** — validates them against the agent's tool set, converts to
`ModelMessage`, calls `agent.stream()`, and returns `Promise<Response>`.

Relevant deprecation: `result.toUIMessageStreamResponse()` is marked `@deprecated` in 7.0.77 —
"Use the standalone `toUIMessageStream` and `createUIMessageStreamResponse` helpers from `'ai'`
with `result.stream` instead. This method will be removed in the next major release." So the
supported shapes are `createAgentUIStreamResponse(...)` **or**
`toUIMessageStream({stream: result.stream, …})` → `createUIMessageStreamResponse({stream})`.
(ai 7.0.77)

### 1.5 Tool approval round-trip

**The ticket's `toolApproval: 'user-approval'` is not a valid top-level value.** The type is:

```ts
type ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT> =
  | GenericToolApprovalFunction<TOOLS, …>
  | { [key in keyof TOOLS]?: ToolApprovalStatus | SingleToolApprovalFunction<…> };

type ToolApprovalStatus =
  | undefined | 'not-applicable' | 'approved' | 'denied' | 'user-approval'
  | { type: 'not-applicable'; reason?: never }
  | { type: 'approved';       reason?: string }
  | { type: 'denied';         reason?: string }
  | { type: 'user-approval';  reason?: never };
```

(`dist/index.d.ts` lines 2962–3031, ai 7.0.77.) The string goes **per tool**:
`toolApproval: { runCommand: 'user-approval' }`, or a single function for all tools.

Flow, from the version-shipped doc `ai/docs/03-agents/06-tool-approvals.mdx`:

1. Agent emits a `tool-approval-request` content part instead of executing:
   `{ type: 'tool-approval-request', approvalId, toolCall, reason?, isAutomatic?, signature? }`.
2. In the UI stream this surfaces as a tool part with `state: 'approval-requested'`.
3. Client calls `addToolApprovalResponse({ id: part.approval.id, approved: true|false })`
   (typed `ChatAddToolApproveResponseFunction`, also accepts `reason`, `options`).
4. A `tool-approval-response` part is appended to the messages, and the agent is called again.
   `useChat({ sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses })`
   fires that follow-up automatically.

**Do approvals survive a server restart? Yes — and the docs are explicit about *why*, which
matters more than the yes.** From the same page:

> "In the standard `useChat` pattern, the server rebuilds the conversation from the messages the
> client sends each turn. The server does not persist conversation state between requests. This
> means the message history is client-controlled input."

There is no server-side approval registry, so a restart is irrelevant as long as messages are
persisted. But the same property makes approvals **forgeable by the client**:

> "…without additional protection, a client that crafts a valid-looking approval for a
> schema-conforming input can bypass the human-in-the-loop step."

The mitigation is `experimental_toolApprovalSecret` — the server HMAC-signs each approval at
issuance and verifies on replay; "the signature binds the approval to the exact tool name, tool
call ID, and input arguments." All server instances need the same secret. Fail-closed when set;
backwards-compatible (unsigned) when absent. **For Clara this is not optional**: an approval is
the gate in front of book-mutating tools. (ai 7.0.77)

Also in the same doc: *"`experimental_toolApprovalSecret` is not yet supported on
`WorkflowAgent`"* — see §2.6.

### 1.6 `stopWhen` helpers

Exported: `isStepCount` (aliased as `stepCountIs` — the barrel contains
`isStepCount as stepCountIs`, so both names are the same function), `hasToolCall`,
`isLoopFinished`. Array form means any condition stops the loop. Default for `ToolLoopAgent` is
`isStepCount(20)`; `generateText`/`streamText` default to `isStepCount(1)`. (ai 7.0.77)

### 1.7 7.0.77 → 7.0.93

Incremental hardening, no breaking agent API change (`packages/ai/CHANGELOG.md`, vercel/ai):
7.0.78 model-visible tool error when revalidated approved input is invalid; 7.0.82 approval
reasons preserved across requests; 7.0.83 persisted typed tool calls validated against current
schemas, auto-continue after `output-denied`; **7.0.84 fix: allow tool approval secrets in
`ToolLoopAgent` settings and `prepareCall`**; 7.0.86 signed approvals for `WorkflowAgent`;
7.0.87 preserve approval descriptors in UI message streams; 7.0.93 formalize
`onLanguageModelCallStart`/`onLanguageModelCallEnd` in the settings type.

7.0.84 is worth noting: at Clara's pinned 7.0.77 the approval-secret plumbing through
`ToolLoopAgent`/`prepareCall` was buggy. **Bump to ≥7.0.84 before relying on signed approvals.**

---

## 2. `DurableAgent` (`@workflow/ai` 4.2.1)

Not installed in this repo. Facts below come from the published tarball
(`registry.npmjs.org/@workflow/ai/-/ai-4.2.1.tgz`, extracted and read) plus the API reference
that `workflow@4.8.4` ships at `docs/api-reference/workflow-ai/durable-agent.mdx`.

The package's own docs carry a standing warning: *"The `@workflow/ai` package is currently in
active development and should be considered experimental."*

### 2.1 The blocking fact: peer ranges

From the npm registry metadata for `@workflow/ai@4.2.1` (published 2026-08-25, and the current
`latest`):

```json
"peerDependencies": { "ai": "^6", "workflow": "^4.8.5", "@opentelemetry/api": "^1.0.0" },
"dependencies":     { "zod": "~4.3.6", "@workflow/serde": "^4.1.2", "@ai-sdk/provider": "^3.0.0" }
```

Clara pins `ai@7.0.77`, `workflow@4.8.4`, `@ai-sdk/provider@4.0.7`. **All three conflict.**
`@workflow/ai@4.2.1` wants AI SDK **v6**, not v7, and `workflow` **4.8.5**, one patch above
Clara's pin. This is not a warning to be suppressed: `durable-agent.js` contains
`normalizeFinishReason` with the comment *"AI SDK v6 may return an object with a 'type'
property, while AI SDK v5 returns a plain string"* — it is written against the v5/v6 wire
shapes, and imports `LanguageModelV3*` types from `@ai-sdk/provider` v3.

Import path is `@workflow/ai/agent` (`"./agent": { "types": "./dist/agent/durable-agent.d.ts" }`
in the package `exports`). Note `workflow@4.8.4` has **no `./ai` export**, so
`import { DurableAgent } from 'workflow/ai'` — the form used in the AI SDK migration guide —
does not resolve at Clara's `workflow` version; `@workflow/ai` must be a direct dependency.

### 2.2 What it wraps, and `generate()`

`DurableAgent` does **not** wrap `ToolLoopAgent`. It is an independent re-implementation of the
loop that drives the provider's `LanguageModelV3` interface directly and writes
`UIMessageChunk`s. Its `generate()` is a stub:

```js
generate() { throw new Error('Not implemented'); }
```

(`dist/agent/durable-agent.js` line 81.) `stream()` is the only API. (@workflow/ai 4.2.1)

### 2.3 Step decomposition — narrower than assumed

Grepping `'use step'` across `dist/agent/` finds exactly these internal steps:

- `doStreamStep` (`dist/agent/do-stream-step.js:38`) — **one durable step per model call.**
- `writeFinishChunk`, `closeStream`, `convertChunksToUIMessages` (`durable-agent.js:527/537/555`)
- one in `stream-text-iterator.js:375`

**A tool's `execute` is *not* automatically a step.** The agent calls it directly:

```js
// When the execute function is a workflow step (marked with 'use step'),
// the step system captures `this` for serialization, causing failures.
const execute = tool.execute;
const toolResult = await execute(parsedInput, { toolCallId, messages, experimental_context });
```

(`durable-agent.js:771`.) It becomes a durable step only because *you* put `'use step'` in the
tool function — which is exactly what the shipped docs show, and why they also show tools that
deliberately omit it so they can `await` a hook or `sleep()` at workflow level.

Step identity is `step//{filepath}//{functionName}` (§3.1), so the agent's internal step names
live inside `@workflow/ai`'s own `dist/` paths. **Upgrading `@workflow/ai` can therefore change
step identities and ordering inside in-flight agent runs** — a versioning hazard the freeze-lint
cannot see, because it hashes `packages/**`, not `node_modules`.

### 2.4 Streaming: `writable`, and the three flags

`stream({ messages, writable, … })` where
`writable: WritableStream<UIMessageChunk>` — normally `getWritable<UIMessageChunk>()`.
From `DurableAgentStreamOptions` (`dist/agent/durable-agent.d.ts`), verbatim:

- `preventClose?: boolean` — "If true, prevents the writable stream from being closed after
  streaming completes. Defaults to false (stream will be closed)."
- `sendStart?: boolean` — "If true, sends a 'start' chunk (with an auto-generated messageId) at
  the beginning of the stream. Defaults to true. Set to `false` when you write custom
  UIMessageChunks to the writable stream **before** calling `agent.stream()`. The auto-generated
  start chunk would otherwise create a second message in the UI…"
- `sendFinish?: boolean` — "If true, sends a 'finish' chunk at the end of the stream. Defaults
  to true."

The canonical multi-turn shape, from Vercel's own
`vercel/workflow-examples` → `flight-booking-app/workflows/chat/index.ts` (read raw), is one run
spanning many turns over one long-lived stream, with the **run id doubling as the hook token**:

```ts
const hook = chatMessageHook.create({ token: runId });
let turnNumber = 0;
while (true) {
  turnNumber++;
  const result = await agent.stream({
    messages, writable,
    preventClose: true,
    sendStart: turnNumber === 1,
    sendFinish: false,
  });
  messages.push(...result.messages);
  const { message: followUp } = await hook;   // parks until resumeHook(runId, {...})
  if (followUp === "/done") break;
  messages.push({ role: "user", content: followUp });
}
```

`docs/ai/chat-session-modeling.mdx` calls multi-turn "recommended for most production
use-cases". Note the structural consequence: **one run per conversation, not per turn** — the
opposite of Clara's current `chatTurn` model, and a much longer-lived run to version around.

Other stream options that exist: `stopWhen`, `maxSteps` (**default unlimited** — the docs state
"Default `maxSteps` is unlimited"), `toolChoice`, `activeTools`, `experimental_output`
(`Output.object({schema})`), `experimental_context`, `prepareStep`, `collectUIMessages`,
`timeout` (`abortSignal` is documented as "not yet supported"), `onStepFinish`, `onFinish`,
`onError`, `onAbort`, `includeRawChunks`, `experimental_repairToolCall`, `experimental_transform`.

Result: `{ messages, steps, toolCalls, toolResults, experimental_output, uiMessages? }`.

`model` is typed `string | (() => Promise<CompatibleLanguageModel>)` — an AI Gateway model id, or
a **function** returning a model (a provider instance is not serializable across the step
boundary). Clara's `@ai-sdk/openai` usage would have to move behind such a function.

Consumption on the server side (from `@workflow/core@4.8.4`
`docs/foundations/streaming.mdx`):

```ts
const run = await start(aiAssistantWorkflow, [message]);
return createUIMessageStreamResponse({ stream: run.readable });
```

Tools can write their own progress into the same stream with
`getWritable<UIMessageChunk>()` and `{ type: 'data-progress', data: {...}, transient: true }`.

### 2.5 Human-in-the-loop: `createHook` / `defineHook` / `resumeHook`

There is **no `resume(token, payload)` free function**. The API surface
(`@workflow/core@4.8.4`, `docs/foundations/hooks.mdx` + `docs/api-reference/create-hook.mdx`):

- `createHook<T>({ token? })` → a `Hook<T>` that is thenable **and** `AsyncIterable<T>`, with
  `.token`, `.dispose()`, `.getConflict()` (since `workflow@4.5.0`), and TC39
  explicit-resource-management support (`using hook = createHook()`).
- `defineHook({ schema })` → `{ create({token}), resume(token, payload) }`. The schema is
  Standard Schema v1 (zod/valibot) and **validates the payload at resume time**. This is the
  typed form; `hookDef.resume(token, payload)` is the method the ticket was reaching for.
- `resumeHook(token, payload)` from `workflow/api` — the low-level free function.

Critical ordering rule, quoted in the docs and independently rediscovered by this repo
(GH #152, `firmInterview.v3.ts:19`): *"Calling `createHook()` alone does not register the hook —
registration is only committed when the workflow suspends."* Hence arm-before-announce.

Long-lived conversation pattern (`docs/foundations/hooks.mdx`) — a single run handling many
messages over time:

```ts
using hook = createHook<SlackMessage>({ token: `slack_messages:${channelId}` });
for await (const message of hook) {
  if (message.text === "/stop") break;
  await processMessage(message);
}
```

The docs prefer the typed form: *"We recommend using `defineHook()` over `createHook()` in
production codebases for better type safety and optional runtime validation."*
(`docs/api-reference/workflow/define-hook.mdx`). Clara currently uses bare `createHook` with a
hand-written union type — a cheap upgrade at the next version bump.

Token conflicts are first-class: a `hook_conflict` event is recorded, `hook.getConflict()`
resolves `{ runId }` of the owning run, and awaiting the hook rejects with `HookConflictError`.
`hook.dispose()` releases a token for hand-off to another run. Custom/deterministic tokens are
supported **only** for `createHook()` + server-side `resumeHook()`; `createWebhook()` always
generates random tokens because its URL is public.

Security note from the docs: `createWebhook()` exposes a public route at
`/.well-known/workflow/v1/webhook/:token` where **the token is the only authorization**. The
docs themselves recommend `createHook()` behind your own authenticated route — which is what
Clara already does (`resumeHook` is called server-side only, `interviewRoutes.ts:10`).

### 2.6 `WorkflowAgent` — DurableAgent is already superseded

`ai@7.0.77` ships `docs/03-agents/07-workflow-agent.mdx`, a 731-line page whose closing section
is titled **"Migrating from `DurableAgent`"**:

> "`WorkflowAgent` replaces the Workflow DevKit's `DurableAgent`. … `WorkflowAgent` moves the
> class into the AI SDK, tightens typing, and introduces first-class tool approval."

The differences that matter:

| | `DurableAgent` | `WorkflowAgent` |
|---|---|---|
| Package | `@workflow/ai` 4.2.1 (peer `ai ^6`) | `@ai-sdk/workflow` |
| Requires | `workflow` 4.x | **Workflow 5** (`npm i @ai-sdk/workflow workflow@beta`) |
| Stream payload | `UIMessageChunk` | `ModelCallStreamPart` + `createModelCallToUIChunkTransform()` at the boundary |
| Step cap | `maxSteps` | `stopWhen` (shared AI SDK conditions) |
| Approval | hand-rolled: await a Hook inside `execute` | `needsApproval: true` on the tool; the agent suspends and resumes automatically |
| Context | `experimental_context` | `runtimeContext` + `toolsContext` |
| `generate()` | throws | not available |
| Resumable client | — | `WorkflowChatTransport` |

So the durable-agent path forks: **stay on Workflow 4 + `@workflow/ai` (experimental, pinned to
AI SDK v6, superseded), or go to Workflow 5 beta + `@ai-sdk/workflow`.** There is no supported
combination of `ai@7` with `@workflow/ai@4.2.1`.

`WorkflowChatTransport` requires the POST route to return an `x-workflow-run-id` header and a
GET route at `{api}/{runId}/stream`; it replays the raw stream from index 0 and applies a
non-negative UI cursor in the transform.

### 2.7 Replay of a run's stream

`getRun(runId).getReadable({ startIndex?, namespace? })`
(`@workflow/core@4.8.4`, `docs/foundations/streaming.mdx`). Chunks are persisted by the world
(`workflow.workflow_stream_chunks`, §2.8), so replay works across process restarts. `startIndex`
may be negative to read relative to the current end; the docs warn that on a live stream a
negative index resolves differently on each call and that "accurate pagination over a live
stream requires cursor-based access, which is not yet supported."

Streams bypass the event log for payload, but stream *operations* are forbidden in workflow
context — `getWritable()` may be *called* in a workflow but `getWriter()`/`write()`/`close()`
must happen inside a step. Unreleased writer locks keep the step's HTTP request alive until it
times out.

### 2.8 Limits, and the Postgres world

**There is no SDK-level limit table.** The SDK docs punt all numbers to Vercel's platform docs,
and those numbers are scoped by their own headings to the **Vercel World**. From
`vercel.com/docs/workflows/pricing` (live; `last_updated: 2026-06-16`):

| Vercel-World limit | Value |
|---|---|
| Max payload size (any run/step/hook input or output) | **50 MB** |
| Events per run / steps per run | 25,000 / 10,000 (raise on request) |
| Max total entity storage per run | 2 GB (excl. streams) |
| Max workflow **replay** duration | **240 s** (exceeding it may abort the run) |
| Max **run** duration / max `sleep` | **No limit** |
| Hook token size | 255 bytes |
| Workflow / step name | 255 bytes each |
| Stream chunk size / chunks-per-sec | 10 MB / 1,000 |
| Run creations per sec; event creations per run/sec; hook creations/sec | 1,000; 200; 200 (throttled + auto-retried) |
| Storage retention after completion | Hobby 1 day / Pro 7 days / Enterprise 30 days |

**None of these are documented as applying to a self-hosted Postgres world**, and the Postgres
world doc states a different, non-numeric set of constraints. In practice the ceiling there is
Postgres itself (CBOR `bytea`/`jsonb` columns, ~1 GB per field) — but that inference is
**unverified**; no payload limit is documented for `@workflow/world-postgres`. Two of these
still deserve attention even self-hosted: the **240 s replay budget** is a property of
re-executing the workflow body (§3.1) and degrades as an event log grows — Vercel notes runs
past ~2,000 events replay slowly and recommends splitting into child workflows — and
**retention is Clara's own problem**, since nothing prunes `workflow.*` tables for you.

**Hook expiry: there is none.** `HookNotFoundError`'s doc lists "the hook has expired (past its
TTL)" as a possible cause but names no number, and `vercel/workflow#553` ("Timeout for hooks and
webhooks") is an **open feature request** proposing to add one. So a hook ends only when
disposed, when its run ends, when another run claims the token, or when storage is pruned.
Timeouts on a parked hook are therefore **application-implemented**, and the docs show exactly
how (`docs/foundations/common-patterns.mdx`):

```ts
const result = await Promise.race([
  webhook.then(r => r.json()),
  sleep("7 days").then(() => ({ timedOut: true }) as const),
]);
```

`workflow.workflow_runs` does carry an `expired_at` column and a `RunExpiredError` (HTTP-410
semantics) exists, but expiry is a world-implementation concern, not a documented SDK policy.

Postgres world (`@workflow/world-postgres` 4.3.4), from
`workflow@4.8.4 docs/deploying/world/postgres-world.mdx` and the package's compiled
`dist/drizzle/schema.js`:

- **Schema `workflow`**, tables: `workflow_runs`, `workflow_events`, `workflow_steps`,
  `workflow_hooks`, `workflow_waits`, `workflow_stream_chunks` (payloads CBOR-encoded; older
  `jsonb` columns retained and marked `@deprecated`). Plus graphile-worker's own schema.
- Queue is **graphile-worker 0.16.6**; streaming uses **Postgres LISTEN/NOTIFY**. From the
  compiled `dist/queue.js`: `run({ pgPool, concurrency, pollInterval: 500, taskList })` — a
  **500 ms poll**, supplemented by graphile-worker's own LISTEN/NOTIFY for prompt dispatch. Two
  job queues are registered per world: `{jobPrefix}flows` (orchestration) and `{jobPrefix}steps`
  (step execution), jobs added with `maxAttempts: 3` **at the graphile layer**, which is separate
  from and additional to the SDK's own step-retry semantics. `streamFlushIntervalMs` defaults to
  10 ms (0 = write immediately).
- `world.start()` calls `queue.start()` and then `reenqueueActiveRuns(...)` — **crash recovery
  happens at boot**, picking up runs left mid-flight by a previous process. This is the mechanism
  that makes a Nitro restart safe, and it is why `getWorld().start?.()` is non-optional.
- Migration: `npx --package=@workflow/world-postgres bootstrap`; "idempotent and can safely be
  run as a post-deployment lifecycle script."
- Config: `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`, `WORKFLOW_POSTGRES_URL`
  (falls back to `DATABASE_URL`), `WORKFLOW_POSTGRES_JOB_PREFIX`,
  `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` (**default 10**), `WORKFLOW_POSTGRES_MAX_POOL_SIZE`
  (default 10; "for higher worker concurrency … set `maxPoolSize` to `10` or
  `queueConcurrency + 2`, whichever is larger"). Or programmatically via `createWorld({…})`.
- Hard requirement: "requires a long-lived worker process that polls the database for jobs. This
  does not work on serverless environments." The process must call `getWorld().start?.()` at boot.
- One integrity detail worth knowing: a partial unique index
  `workflow_events_entity_creation_unique` on `(run_id, correlation_id, event_type)` for
  `step_created | hook_created | wait_created`, whose source comment explains it exists because
  "the snapshot runtime's deterministic ULIDs across replays" can otherwise let two concurrent
  invocations insert duplicate entities. Violations surface as `EntityConflictError`.

Run statuses (from the world's `status` enum): `pending | running | completed | failed |
cancelled`. Cancellation is a **method on the run**, not a free function —
`workflow/dist/api.d.ts` re-exports exactly
`{ Event, getHookByToken, getRun, Run, resumeHook, resumeWebhook, runStep, StartOptions, start,
StopSleepOptions, StopSleepResult, WorkflowReadableStream, WorkflowReadableStreamOptions,
WorkflowRun }` — **no `cancelRun`**. Use `await getRun(runId).cancel()`, the CLI
(`npx workflow cancel <run-id>`, or `--status running --workflowName "<generated id>"` in bulk),
or a `run_cancelled` event via the World SDK. `npx workflow inspect runs` / `npx workflow web`
with `--backend @workflow/world-postgres` for observability. `Run.wakeUp()` ends a `sleep()`
early without cancelling.

*Repo nit:* `packages/runtime/lib/control.mjs:20` says "cancelRun from workflow/api", but line
239 correctly does `apiGetRun(runId).cancel()`. The code is right; the comment names an export
that does not exist.

---

## 3. Determinism and versioning in Workflow DevKit 4.8.4

### 3.1 Execution model and identity

It is **full deterministic replay**, Temporal-style, enabled by a compile-time transform. The
workflow body re-runs from the top on every resume inside a **Node.js VM sandbox**; already-run
steps return memoized results from the event log.

> "Workflows resume by replaying their code from the beginning using cached step results;
> non-deterministic logic would break resumption."
> — `docs/how-it-works/understanding-directives.mdx` (workflow 4.8.4)

The `@workflow/swc-plugin` compiles the same source three ways (step / workflow / client modes);
in workflow mode each `"use step"` body is replaced by a call keyed on the step id.

**Identity is path + name, not a content hash:**

> "The compiler generates stable IDs for workflows and steps based on file paths and function
> names. **Pattern:** `{type}//{filepath}//{functionName}` … **Stable**: IDs don't change unless
> you rename files or functions."
> — `docs/how-it-works/code-transform.mdx`

Confirmed by the CLI's `--workflowName` example, which is a full generated id:
`workflow//./workflows/fulfill-order//fulfillOrder`.

### 3.2 What must stay stable for an in-flight run

- **Step/workflow names and file paths** — renaming or moving strands a run (§3.5).
- **Call order/position.** Replay correlation is anchored on **event-log position**, not on
  argument content. `@workflow/core@4.8.4 dist/private.d.ts` documents a
  `pendingDeliveryBarriers` map "Keyed by the delivery's position (index) in the consumed event
  log", introduced because otherwise a faster-resolving delivery "can lose a `Promise.race`
  (or a `useStep` ULID allocation) to a faster- or already-resolved competitor, diverging from
  the log and surfacing as `ReplayDivergenceError`." The sandbox RNG is seeded per run
  (`seedrandom` in `dist/vm/index.js`; `createRandomUUID(rng)` in `dist/vm/uuid.js`), so ids
  allocated during replay are a deterministic function of **call order**. Inserting or
  reordering a step ahead of the current suspension point shifts that sequence.
- **Argument shapes** only insofar as the code consuming them still works: args are *serialized
  and stored* in `step_created`, never hashed into identity.

**Safe:** changing the body of an already-completed step (never re-executed — its cached result
is replayed); changing prompt text passed as a step argument; adding a tool; changing code that
only runs after the current suspension point. Adding/reordering steps *before* the current
position is not safe.

### 3.3 Deployment pinning — and why Clara does not get it

The headline safety net:

> "Workflow runs are pinned to the deployment that starts them. … If you deploy a change to
> `chargeCustomer()` while a run is in the two-day sleep, the existing run does not suddenly
> resume into the new implementation."
> — `@workflow/core@4.8.4 docs/foundations/versioning.mdx`

**This does not apply on the Postgres world.** Two independent confirmations from shipped code:

```js
// @workflow/world-postgres@4.3.4 dist/queue.js:76
const getDeploymentId = async () => { return 'postgres'; };
```

Every run's `deployment_id` is the literal string `'postgres'`. And in
`@workflow/core@4.8.4 dist/runtime/start.js`:

> "Resolving 'latest' only means something in worlds with atomic, immutable deployments (e.g.
> Vercel) … Worlds without that concept (local dev, self-hosted Postgres) have nothing to resolve
> between, so rather than fail a run that works fine on Vercel, we warn and fall back to the
> current deployment — making 'latest' an effective no-op there."

The `versioning.mdx` callout says the same at doc level: *"`deploymentId: 'latest'` is currently
a Vercel-specific feature."*

**Conclusion: on Clara's self-hosted Postgres world there is exactly one code version — whatever
the running process has. A redeploy re-points every in-flight run at the new code immediately.**
The SDK's entire versioning story is unavailable, and Clara's `_vN` freeze discipline is not
belt-and-braces over an SDK guarantee — it *is* the only guarantee.

### 3.4 No built-in versioning primitive

There is no `patched()` / `getVersion()` analogue, no `@workflow/versioning` package, and no
`version` option on a workflow. Grepping the compiled `workflow@4.8.4` and `@workflow/core@4.8.4`
type declarations for `getVersion(`/`patched(` returns nothing outside docs prose. The only
sanctioned mechanisms are:

1. **Cancel and rerun** — the documented recovery flow: deploy the fix, `npx workflow inspect
   runs --status running`, `npx workflow cancel`, then `start(fn, args, { deploymentId: 'latest' })`
   or "Rerun on latest" in the observability UI.
2. **Self-upgrading runs (`continueAsNew` by hand)** — for "scheduled loops, recurring jobs,
   agents, and chat sessions" the docs prescribe modelling the work as a chain of bounded runs,
   each ending by `start()`ing the next: *"in Workflow SDK it is just explicit recursion through
   `start()`."* "The serialized `state` is the migration boundary between versions." A
   `WritableStream` can be passed forward as an argument so the client stream survives the
   hand-off. **On Postgres this pattern still has value** (it bounds how much old code any one
   run depends on) even though `deploymentId: 'latest'` is a no-op there.

### 3.5 Failure modes when code changes incompatibly

| Situation | Behaviour | Source |
|---|---|---|
| Workflow function missing/renamed | Run fails terminally, `RUNTIME_ERROR`; not retried, not catchable | `docs/errors/workflow-not-registered.mdx` |
| Step function missing/renamed | Step fails "like a `FatalError`" — not retried, but **catchable** in the workflow's `try/catch` | `docs/errors/step-not-registered.mdx` |
| Replay can't consume history | `REPLAY_DIVERGENCE` → runtime auto-queues another replay, no `run_failed` written; if the retry budget is exhausted → run `failed` with `CORRUPTED_EVENT_LOG` | `docs/errors/replay-divergence.mdx` |

### 3.6 Determinism rules

Inside `"use workflow"`: `Math.random()`, `Date.now()`, `crypto.randomUUID()` are **seeded and
safe** (sandbox-provided); `process.env` is a frozen snapshot taken at run start. **Blocked:**
Node core modules (`fs`, `path`, `http`, `child_process`, …), global `fetch` (import `fetch` from
`workflow` instead), `setTimeout`/`setInterval` (use `sleep()`), `Buffer`. Values crossing the
step boundary are **serialized copies, not references** — mutating a closed-over object inside a
step is invisible to the workflow. Functions, un-annotated class instances, Symbols and
`WeakMap`/`WeakSet` fail at runtime with `serialization-failed`, not at build time.

### 3.7 Contrast with Clara's freeze policy

Clara's policy (`packages/runtime/workflows/registry.ts` header,
`scripts/check-frozen-workflows.mjs`) is:

- (a) a deployed workflow body is immutable once any run can be in flight; behavioural change
  ships as a new `_vN` export;
- (b) enqueue sites import from the registry so they target the newest version; CI golden-hashes
  each frozen workflow **and every step/helper module it imports**;
- (c) renaming/deleting an export with in-flight runs is forbidden — "workflowName derives from
  path+export";
- (d) registry-version monotonicity, (e) enqueue-site provenance, (f) registry-view integrity;
- deploy-lock: `deployed: true` makes a hash immutable vs. the base branch forever.

Scale today: **244 frozen manifest entries, 233 deploy-locked, 98 of them chatTurn files**, and
17 live `chatTurn` versions.

**Assessment: the policy is correct, and §3.3 shows it is load-bearing rather than redundant.**
Claim (c) is precisely right — identity is `{type}//{filepath}//{functionName}`. Claim (a) is
stronger than the SDK requires in one respect (a completed step's body can safely change) and
exactly right in another (anything reachable before the current suspension point cannot).

**What a "step-level freeze" would have to lint, beyond today's file-level hashing:**

1. **Step inventory per frozen workflow** — the ordered list of `"use step"` function *names and
   file paths* reachable from the workflow body. A rename, move, insertion or deletion in that
   list is the actual break; a whole-file hash both over- and under-approximates it (a comment
   edit trips it; a step renamed inside an *unfrozen* file does not).
2. **Call-site order** — since correlation is by event-log position, the lint must compare the
   *sequence* of step call sites in the workflow body (including inside loops/branches), not just
   their presence. This is the check that has no SDK equivalent.
3. **Suspension-point inventory** — `createHook`/`defineHook(...).create`/`sleep`/`createWebhook`
   call sites, which allocate log positions exactly like steps do, plus the arm-before-announce
   ordering the repo already tests for in `wave-b-interview-park-ordering.test.mjs`.
4. **Serialized-boundary shapes** — the step argument and return types, since a shape change can
   pass a hash check on a *new* version while an old parked run deserializes the old shape.
5. **The dependency blind spot.** Today's manifest hashes `packages/**` only. `@workflow/ai`'s
   step identities live in `node_modules/@workflow/ai/dist/agent/*`. Any step-level freeze that
   is meant to protect DurableAgent runs must extend to the **lockfile-pinned version of
   `@workflow/ai`, `workflow` and `@workflow/core`**, and treat a bump as a workflow-version
   event. This gap exists today and is invisible to CI.

---

## 4. Migration constraints — draining Clara's parked runs

### 4.1 What is parked, and for how long

- **chatTurn clarify.** `chatTurn.v17.ts:120-123` arms `createHook<{kind:"answer"|"expired"|
  "cancelled"; answer?:unknown}>({token: hookToken})` then awaits it — "PARK — zero compute until
  answered/expired/cancelled". The deadline is a **database** fact, not an SDK one:
  `packages/db/migrations/0006_runtime_core.sql:203` —
  `expires_at timestamptz not null, -- 14-day clarify deadline (ruling 6)`, set to `now()+14d` at
  line 1076.
- **Interviews.** `clientOnboarding.v4.ts` and `firmInterview.v3.ts` park per question with no
  deadline at all; the v4 header says "the ≥48h parks are the whole point of this class".
  These are the genuinely unbounded ones.

### 4.2 The good news: Clara already owns a drain mechanism

`packages/runtime/lib/control.mjs` is a LISTEN+poll control listener that leases terminal
interruptions and calls `resumeHook(token, payload)` where
`resumePayloadFor(row)` maps status → `{kind:"answer"|"expired"|"cancelled"}`. Every parked
workflow already handles `expired` and `cancelled` by settling and exiting
(`chatTurn.v17.ts:135-137`). Delivery is exactly-once-or-provably-already-done via a 60s lease
plus `HookNotFoundError` treated as already-delivered.

**So draining is a database operation, not an engine operation:** mark the open interruptions
`expired` (or `cancelled`), let the control listener deliver, and the parked runs terminate
themselves on the code they started with. No `cancelRun` needed, no stranded state, and the
product semantics (a closed clarify with `CLARIFY_FRAMING`) are already defined.
`cancelRun` from `workflow/api` is available as the blunter instrument and is already wired.

### 4.3 Can old `chatTurn_v17` and a new DurableAgent chat coexist in one Postgres world?

**Yes, and Clara is already the proof.** Workflow identity is `{type}//{filepath}//{functionName}`
and the world stores `workflow_runs.name` per run; nothing keys on "the chat workflow". The repo
runs `chatTurn_v1 … v17` concurrently registered in one world today, with the registry pointing
new work at v17 and older exports retained for parked runs. A `chatTurn_v18` implemented with a
durable agent is, to the engine, just another export.

The constraints are not engine constraints, they are dependency constraints:

1. **The `ai` version is global to the process.** Introducing `@workflow/ai@4.2.1` forces `ai`
   down to v6, which every existing frozen workflow — all 233 deploy-locked entries — would then
   execute against. That is a change to the *runtime behaviour of frozen bodies* without changing
   their bytes, which is the one thing the freeze policy exists to prevent and the one thing its
   hashes cannot detect. This is the single hardest blocker in this study.
2. `workflow` must go 4.8.4 → ≥4.8.5 for the peer range.
3. The Workflow-5 route (`@ai-sdk/workflow` + `workflow@beta`) is a **major engine upgrade
   underneath live parked runs**, with no deployment pinning to protect them (§3.3).

### 4.4 What a re-platform therefore requires

Ordered, and each step is a real precondition rather than a nicety:

1. **Drain or bound the unbounded parks first.** Give interviews a deadline the way clarify has
   one — the SDK pattern is `Promise.race([hook, sleep("14 days")])` — or expire them via the
   existing control path. You cannot reason about an engine upgrade while runs may live "weeks".
2. **Keep every old export registered until zero non-terminal runs reference it.** This is
   already policy (b)/(c) and already enforced by `checkRegistryMonotonicity`; it does not change.
3. **Do the dependency move in its own window, with the queue quiesced and zero parked runs**,
   because an `ai` major or a `workflow` major changes how *frozen* bodies execute. A quiesce is
   the only way to make that safe given §3.3.
4. **Extend the freeze to the lockfile** for `ai`, `workflow`, `@workflow/core`, `@workflow/ai`
   — otherwise the policy has a hole exactly where the re-platform lands.

---

## 5. `useChat` + `DefaultChatTransport` against Clara's proxy

### 5.1 The transport is framework-agnostic — verified in the compiled source

`DefaultChatTransport extends HttpChatTransport`. `sendMessages` (`ai@7.0.77 dist/index.js`
lines 17756-17807) does exactly this and nothing more:

```js
const response = await fetch2(api, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body), credentials, signal: abortSignal });
if (!response.ok) throw new Error(await response.text() ?? "Failed to fetch the chat response.");
if (!response.body) throw new Error("The response body is empty.");
return this.processResponseStream(response.body);
```

**There is no Next.js coupling and no validation of the response's content-type or headers.**
Pointing `api` at `/api/runtime/chat` (Clara's catch-all proxy) is supported by construction.

Default request body (same function):
`{ ...resolvedBody, ...options.body, id: chatId, messages, trigger, messageId }` — the **full
messages array**, plus `trigger` (`submit-user-message` / `regenerate-assistant-message`) and
`messageId`. `prepareSendMessagesRequest({api,id,messages,body,headers,credentials,
requestMetadata,trigger,messageId})` can replace `api`, `headers`, `body` and `credentials`
wholesale — that is how you'd send only the last message.

Constructor options: `api`, `headers`, `body`, `credentials`, `fetch`,
`prepareSendMessagesRequest`, `prepareReconnectToStreamRequest` (each of the first four may be a
value or a function).

### 5.2 What the endpoint must send

`UI_MESSAGE_STREAM_HEADERS` (`ai@7.0.77 dist/index.js:6481`) is the exact header set the server
helpers apply:

```js
{ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive",
  "x-vercel-ai-ui-message-stream": "v1", "x-accel-buffering": "no" }
```

SSE framing is `data: {json}\n\n`, terminated by `data: [DONE]`. Chunk `type`s include
`start`/`finish`/`abort`, `text-start|delta|end`, `reasoning-start|delta|end`,
`tool-input-start|delta|available`, `tool-output-available`, `tool-output-denied`,
`tool-approval-request`, `tool-approval-response`, `source-url`, `source-document`, `file`,
`data-*`, `error`, `start-step`/`finish-step`/`reset-step`, `custom`.

**Finding specific to Clara.** `apps/web/app/api/runtime/[...path]/route.ts` forwards a
response-header allow-list of exactly
`["content-type","content-length","content-disposition","cache-control","x-content-type-options"]`.
So `x-vercel-ai-ui-message-stream` and `x-accel-buffering` are **dropped**. Grepping
`ai@7.0.77`'s compiled client shows the `x-vercel-ai-ui-message-stream` string appears **only**
where the response headers are constructed — the client never reads it — so dropping it does not
break `useChat`. Dropping `x-accel-buffering: no` is the real risk: it is the header that tells
nginx-class intermediaries not to buffer an SSE body. `content-type: text/event-stream` and
`cache-control` do survive the allow-list. **Recommendation: add `x-accel-buffering` (and, for
honesty, `x-vercel-ai-ui-message-stream`) to `RESPONSE_HEADERS`.**

### 5.3 Resuming a stream

`resume?: boolean` is a **stable** option on `useChat` in `@ai-sdk/react` 4.0.x
(`experimental_resume` is the superseded v5-era name). When set, the hook reconnects on mount.
The client side of that is `HttpChatTransport.reconnectToStream` (`dist/index.js:17809`):

- **GET** to `` `${api}/${chatId}/stream` `` by default (overridable via
  `prepareReconnectToStreamRequest`);
- **HTTP 204 → `null`**, meaning "no active stream" — the documented way to say nothing is live;
- otherwise the body is processed as the same SSE stream.

Server side, per `ai@7.0.77 docs/04-ai-sdk-ui/03-chatbot-resume-streams.mdx`, the SDK provides
only the reconnect plumbing; **you build** the storage. The documented stack is the
`resumable-stream` npm package plus **Redis**, with `consumeSseStream` on the POST side
registering the stream id and a GET route calling `streamContext.resumeExistingStream(...)`.

For Clara this matters twice over: (a) the proxy currently exports `GET`, `POST`, `PUT`, so the
GET reconnect leg would pass through; (b) **Clara would not need Redis** — a durable run already
has a replayable stream via `getRun(runId).getReadable({startIndex})` backed by
`workflow.workflow_stream_chunks`. That is precisely the trade `WorkflowChatTransport` makes,
and it is a genuine argument for the durable path.

`WorkflowChatTransport` already exists in the **v4** line: `@workflow/ai@4.2.1` root export,
`dist/workflow-chat-transport.d.ts`, `class WorkflowChatTransport<UI_MESSAGE> implements
ChatTransport<UI_MESSAGE>` with `{ api, fetch, onChatSendMessage, onChatEnd,
maxConsecutiveErrors, initialStartIndex, prepareSendMessagesRequest,
prepareReconnectToStreamRequest }`. It keys off an `x-workflow-run-id` response header and
reconnects to `{api}/{runId}/stream`. (The `@ai-sdk/workflow` version in §2.6 is the Workflow-5
successor.) So Redis-free resumable chat is available on either durable path — but not on the
plain `ToolLoopAgent` path, which needs `resumable-stream` + Redis.

Warning from the same doc: with resumption enabled, "client-side aborts are treated as
disconnects" — `stop()` and tab-close do not cancel the generation; a dedicated stop endpoint
is required.

### 5.4 Message persistence

The canonical server pattern at 7.0.77 (`docs/04-ai-sdk-ui/03-chatbot-message-persistence.mdx`,
appearing three times in that file):

```ts
return createUIMessageStreamResponse({
  stream: toUIMessageStream({
    stream: result.stream,
    originalMessages: messages,
    generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
    onEnd: ({ messages }) => { saveChat({ chatId, messages }); },
  }),
});
```

Note the callback is **`onEnd` on `toUIMessageStream`**, not `onFinish` on
`toUIMessageStreamResponse()` (which is deprecated, §1.4). `result.consumeStream()` — called
without `await` — drains the generation so it completes even if the client disconnects.
`validateUIMessages` handles schema drift when replaying messages out of a database.

### 5.5 Rendering `message.parts`

Part discriminants: `text`, `reasoning`, `tool-<toolName>`, `dynamic-tool`, `data-<name>`,
`file`, `source-url`, `source-document`, `step-start`.

Tool-part `state` values, all seven confirmed as `case` labels in
`docs/04-ai-sdk-ui/03-chatbot-tool-usage.mdx`:

`'input-streaming'`, `'input-available'`, `'approval-requested'`, `'approval-responded'`,
`'output-available'`, `'output-error'`, `'output-denied'`.

The approval branch reads `part.state === 'approval-requested' && !part.approval.isAutomatic`
and calls `addToolApprovalResponse({ id: part.approval.id, approved })`.

---

## 6. AI Elements

**It exists and ships.** npm package `ai-elements`, **latest 1.9.0**, published 2026-03-12
(`registry.npmjs.org/ai-elements`). The package is a thin CLI only — no dependencies, no peer
dependencies, `bin: { "elements": "index.js" }`; it drives the shadcn registry.

Install (from `elements.ai-sdk.dev/docs/setup`):

- everything: `npx ai-elements@latest`
- one component: `npx ai-elements@latest add message`
- shadcn-native equivalent: `npx shadcn@latest add @ai-elements/message`

Components land in `@/components/ai-elements/`. Repo: `github.com/vercel/ai-elements`.

**Component list — byte-verified**, not summarised. I fetched
`https://elements.ai-sdk.dev/api/registry/registry.json` (HTTP 200, 39,255 bytes) and parsed it:
`{ name: "ai-elements", homepage: "https://elements.ai-sdk.dev/elements", items: [...] }` with
**136 items, of which 48 are components** and 88 are `example-*` entries:

```
agent, artifact, attachments, audio-player, canvas, chain-of-thought, checkpoint, code-block,
commit, confirmation, connection, context, controls, conversation, edge, environment-variables,
file-tree, image, inline-citation, jsx-preview, message, mic-selector, model-selector, node,
open-in-chat, package-info, panel, persona, plan, prompt-input, queue, reasoning, sandbox,
schema-display, shimmer, snippet, sources, speech-input, stack-trace, suggestion, task,
terminal, test-results, tool, toolbar, transcription, voice-selector, web-preview
```

Note what is **absent**: `response`, `actions` and `branch` are no longer top-level registry
items — they have been folded into `message` (as `MessageResponse`, `MessageActions`,
`MessageBranch`). Any guide naming them as separate installs is out of date.

**Relation to shadcn's own items.** Queried live through the shadcn MCP server against this
project's configured `@shadcn` registry: it contains its own `message` and `message-scroller`
(`registry:ui`, one file each), separate and much thinner than AI Elements' `message`. **Same
name, two unrelated registries**: shadcn's are generic UI primitives; AI Elements' are AI-SDK
aware (they consume `UIMessage`/`message.parts`, tool `state` strings, streaming markdown via
Streamdown). Do not mix them up when adding components.

**Prerequisites** (`elements.ai-sdk.dev/docs`, `/docs/setup`): Node 18+, **React 19**,
**Tailwind CSS 4 (CSS-variables mode only)**, shadcn/ui initialised. The docs state "a Next.js
project with the AI SDK installed" as a prerequisite. Since installation is just shadcn dropping
`.tsx` files, non-Next React apps very likely work — but that is **not documented**, so treat it
as unverified. The exact `ai`/`@ai-sdk/react` versions targeted are **not stated** anywhere I
could find; what is verifiable is that the components consume the v5+/v7 `parts` protocol.

**Recommended subset for Clara** (mapping to what the chat surface actually needs):

| Need | Component |
|---|---|
| transcript container + autoscroll | `conversation` (`ConversationContent`, `ConversationEmptyState`, `ConversationScrollButton`) |
| message + streaming markdown + actions/branches | `message` (includes `MessageResponse`, backed by Streamdown; needs a CSS import in `globals.css`) |
| tool call with state | `tool` (`ToolHeader type="tool-<name>" state=…`, `ToolInput`, `ToolOutput`) |
| **human approval** | `confirmation` — renders on `state === 'approval-requested'`, wired to `addToolApprovalResponse` |
| composer + attachments | `prompt-input` (+ `attachments`) |
| optional | `reasoning`, `sources`, `task`, `code-block`, `artifact` |

`confirmation` is the notable one: an off-the-shelf component for exactly the approval flow in
§1.5, which is the interaction Clara most needs to get right.

---

## 7. Nitro 3 as host

### 7.1 What `workflow@4.8.4` actually ships

The `exports` field of `packages/runtime/node_modules/workflow/package.json` (byte-identical to
`unpkg.com/workflow@4.8.4/package.json`) is authoritative:

```
".", "./api", "./errors", "./internal/*", "./next", "./nitro", "./nuxt", "./sveltekit",
"./astro", "./vite", "./nest", "./runtime", "./observability"
```

**There is no `workflow/express`, `workflow/hono`, `workflow/fastify` or `workflow/node`**, and
no `@workflow/express`/`@workflow/hono` in the dependency graph (which does contain
`@workflow/next@4.1.8`, `@workflow/nitro@4.1.10`, `@workflow/nuxt@4.0.20`,
`@workflow/sveltekit@4.0.19`, `@workflow/astro@4.0.19`, `@workflow/nest@4.0.20`).

The docs *do* have Express, Fastify and Hono getting-started pages — and all three instruct
`npm i workflow <framework> nitro rollup` with `nitro.config.ts` carrying
`modules: ["workflow/nitro"]`, because *"By default, Express doesn't include a build system.
Nitro adds one which enables compiling workflows…"*. So Express/Hono/Fastify are **documented
recipes layered on `workflow/nitro`**, not independent adapters. NestJS is shipped but its
getting-started card is greyed out and badged "Coming soon".

**Clara's `packages/runtime/nitro.config.ts` is exactly the documented shape** —
`modules: ["workflow/nitro"]`, `plugins: ["plugins/startWorld.ts"]`, Express mounted as
`routes: { "/**": { handler: "./src/index.ts", format: "node" } }`. This is the sanctioned
non-Vercel configuration, not a workaround.

### 7.2 Nitro 3 status

**Still beta.** npm `dist-tags.latest` for `nitro` is `3.0.260903-beta` (published 2026-09-03);
the whole 3.x line since March 2026 is date-stamped betas. The `nitrojs/nitro` README says
outright: *"You're viewing the v3 branch. For the current stable release, see Nitro v2."*
No GA date is published anywhere I could find — **unverified**.

Clara pins `3.0.260610-beta`, roughly three beta releases behind. Mitigating: `@workflow/nitro@4.1.10`'s
own `devDependencies` pin **`nitro: 3.0.260610-beta`** — the identical build. Clara is pinned to
the exact Nitro the Workflow team tests against, which is a better position than being current.

### 7.3 Worlds and what the host must provide

Worlds are selected by `WORKFLOW_TARGET_WORLD`. Official (from `worlds-manifest.json` in
`vercel/workflow`): `@workflow/world-local` (dev, filesystem), `@workflow/world-postgres`
("production-ready … self-hosted"), `@workflow/world-vercel`. Everything else in the manifest
(Turso, MongoDB, Redis/BullMQ, SurrealDB, Cloudflare DO, MySQL, NATS, Upstash, Platformatic …)
is labelled `community` — no Vercel support commitment.

Self-hosting on Postgres is a **documented first-class path**: "Use the Postgres World when you
need to deploy workflows on your own infrastructure outside of Vercel — such as a Docker
container, Kubernetes cluster, or any cloud that supports long-running servers."

A host must provide three endpoints (Web-standard `Request`/`Response`):
`POST /.well-known/workflow/v1/flow`, `.../step`, `.../webhook/:token`; unbuffered streaming
responses; asynchronous queue-message processing; and a **long-lived process** that calls
`getWorld().start?.()`. Steps run **in-process** via graphile-worker inside whatever process
made that call — the SDK ships **no worker/runner CLI** (only `cancel`, `inspect`, `web`,
`build`, `health`, `validate`, `transform`). Clara's separate `scripts/worker.mjs` split is an
application-level choice, not a documented SDK pattern — a reasonable one, but unsupported
territory to be aware of.

Security: on a custom host *"you are responsible for securing the handler endpoints"* — the
three `.well-known` routes have no built-in auth off Vercel. Worth auditing against Clara's
Express router.

`healthCheck(world, "workflow" | "step")` from `workflow/runtime` round-trips a message through
the real queue and returns `{healthy, latencyMs, specVersion, workflowCoreVersion}` — a good
readiness probe for the Nitro+Postgres deployment.

---

## Implications for Clara

**Feasible now.** `ToolLoopAgent` at `ai@7.0.77` is production-shaped, and its approval round-trip is purely message-borne, so it survives restarts wherever messages are persisted. `useChat`/`DefaultChatTransport` needs nothing from Next.js — the compiled transport POSTs JSON and reads an SSE body without validating a single response header, so Clara's catch-all proxy works as-is. AI Elements is real (v1.9.0; 48 components, registry byte-verified) and ships `confirmation`, precisely the approval UI Clara needs. Nitro + `workflow/nitro` + Postgres world is the sanctioned self-hosted setup, and `nitro.config.ts` already matches the docs verbatim. A new agent workflow can run beside `chatTurn_v17` in one world — 17 already do.

**Not feasible as scoped.** `@workflow/ai@4.2.1` peer-depends on `ai: ^6` and `workflow: ^4.8.5`; Clara pins `ai@7.0.77` / `workflow@4.8.4`. No supported AI SDK 7 + `DurableAgent` combination exists, and `DurableAgent.generate()` throws "Not implemented". `ai@7.0.77`'s own shipped docs carry a "Migrating from `DurableAgent`" section: it is superseded by `WorkflowAgent`, which needs Workflow 5 beta. Adopting DurableAgent means dropping the runtime to AI SDK 6 — changing how all 233 deploy-locked frozen bodies execute without changing a byte of them.

**The finding that should change the plan.** `@workflow/world-postgres@4.3.4`'s `getDeploymentId()` returns the literal `'postgres'`, and `deploymentId: 'latest'` is a documented no-op off Vercel. Clara gets **none** of the SDK's run-pinning: a redeploy re-points every parked run at new code instantly. The `_vN` freeze is not belt-and-braces over an SDK guarantee — it is the only guarantee, and must not be relaxed.

**Open risks.** (1) A step-level freeze must lint step *inventory and call-site order* — replay correlates by event-log position, not content hash — and must cover the **lockfile**, since `@workflow/ai`'s step ids live in `node_modules`, invisible to CI today. (2) Interview parks have no deadline and the SDK has no hook TTL (`vercel/workflow#553` is still open); bound them with `Promise.race([hook, sleep("14d")])`. (3) Signed approvals are essential — history is client-controlled and forgeable — but the `ToolLoopAgent` plumbing was fixed only in **7.0.84**, above Clara's pin. (4) The proxy drops `x-accel-buffering: no`: harmless to `useChat`, a real SSE-buffering hazard through intermediaries. (5) Redis-free resumable chat exists only on the durable paths; plain `ToolLoopAgent` needs `resumable-stream` + Redis. (6) Nitro 3 is still beta with no GA date, but Clara's pin is the exact build `@workflow/nitro` tests against — hold it. (7) The `.well-known/workflow/v1/*` routes carry no built-in auth off Vercel.

**Sequence.** Bump `ai` to ≥7.0.84 and build the chat on `ToolLoopAgent` + `createAgentUIStreamResponse` + signed approvals, keeping the durable park on today's hooks. Gate the durable-agent decision on `@ai-sdk/workflow` leaving beta and on parked runs drained to zero in a quiesce window.
