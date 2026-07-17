# Agent-runtime candidate research for the Clara greenfield rebuild

> **STATUS: PRELIMINARY — input to the Gate-2 decision, not the decision.**
> Researched 2026-07-17 from primary sources (official docs + npm registry). Every version below was
> verified live against the npm registry on 2026-07-17; all five candidates published releases within
> the last week, so the evidence is current. Doc-page claims cite the page fetched. Secondary sources
> are used only for the Agent-Skills-standard adoption row and are marked as such.

## 0. Candidates and current versions (npm registry, fetched 2026-07-17)

| Candidate | Package | Latest | Published | License |
|---|---|---|---|---|
| OpenAI Agents SDK JS (incumbent) | `@openai/agents` | **0.13.4** | 2026-07-15 | MIT |
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` | **0.3.211** | 2026-07-15 | Anthropic Commercial ToS (not OSS) |
| Vercel AI SDK | `ai` | **7.0.29** (v5/v6 lines still maintained) | 2026-07-15 | Apache-2.0 |
| Vercel Workflow SDK (companion) | `workflow` | **4.6.0** (5.0.0-beta.35 in beta) | 2026-07-06 | Apache-2.0 |
| Mastra | `@mastra/core` | **1.51.0** | 2026-07-15 | Apache-2.0 |
| LangGraph JS | `@langchain/langgraph` | **1.4.8** | 2026-07-15 | MIT |

Source: `https://registry.npmjs.org/<package>` (dist-tags + time + license fields).

The two extras included (Mastra, LangGraph JS) are the only non-listed contenders I judged production-credible
for accounting software; both have Postgres-backed durability as a first-class feature. I excluded
others (e.g. VoltAgent, Inngest AgentKit) as either too young or not runtime-shaped for this decision.

Note on licensing nuance: the Claude Agent SDK is governed by Anthropic's Commercial Terms of Service,
not an OSS license ("Use of the Claude Agent SDK is governed by Anthropic's Commercial Terms of Service" —
overview page). Everything else in the table is MIT/Apache-2.0.

---

## 1. Requirements matrix

Legend: **NATIVE** = shipped, documented capability. **BUILDABLE** = achievable on documented extension
points with your own code. **ABSENT** = no documented path short of forking. Citation key in §3.

| Requirement | OpenAI Agents SDK JS | Claude Agent SDK | AI SDK 7 + Workflow SDK | Mastra | LangGraph JS |
|---|---|---|---|---|---|
| **Durable session state (survives restart/redeploy)** | PARTIAL-NATIVE. Sessions persist *history* (Memory / OpenAI-hosted Conversations; custom `Session` impl for Postgres). Mid-run state persists **only** when you serialize `RunState` at an interruption — a crash mid-run loses the run since the last serialization point. [O2][O3] | NATIVE (transcript). Sessions written continuously to JSONL; `resume`/`continue` restore full context after restart. `SessionStore` adapter mirrors to Postgres/S3/Redis for cross-host resume (reference Postgres adapter shipped). Mirror writes are best-effort (retried 3×, then dropped with `mirror_error`). [C2][C3] | NATIVE (strongest). `WorkflowAgent` (`@ai-sdk/workflow`) runs the agent loop *inside* a durable workflow; state persists across step boundaries; runs "survive deployments and crashes with deterministic replays". Self-hosted via `@workflow/world-postgres`. [V1][W1][W2] | NATIVE for workflows: "Snapshots are stored in your configured storage provider and persist across deployments and application restarts" (PostgresStore). Plain `Agent` runs are NOT durable — durability comes from wrapping work in workflows. [M2][M3] | NATIVE. Checkpointer persists graph state per super-step per `thread_id`; `PostgresSaver` survives crash/restart; "resume later, even when in an error state". [L2][L3] |
| **HITL: resumable clarifications/approvals mid-run (days later)** | NATIVE. `needsApproval` → run pauses with `interruptions[]`; `result.state.toString()` / `RunState.fromString()`; docs explicitly bless DB storage + later resume. **Caveat: serialized-state version skew** — if you bump agent definitions or SDK version while approvals are pending, they "recommend you implement your own branching logic" with parallel SDK versions. [O2] | PARTIAL. Permission prompts (`canUseTool`) and `AskUserQuestion` are handled *in-loop* — they don't end the call and are not a serialized, first-class pending-approval artifact. Session `resume` restores conversation after a crash, but the pending-approval workflow is yours to rebuild on top. [C1][C2] | NATIVE, two complementary layers: (a) AI SDK `toolApproval` → `tool-approval-request`/`-response` live **in the message history**, so approval state persists in *your* DB and resumes across sessions; HMAC-signed approvals (`experimental_toolApprovalSecret`) prevent client tampering. (b) WDK hooks: `defineHook()`/`createWebhook()` pause a workflow "even after days of inactivity" at **zero compute**, resumed by `hook.resume(token, data)`. [V2][W3][W4] | NATIVE. `suspend()` inside a step + `resumeSchema`; `resume()` callable "from anywhere in your application, including HTTP endpoints … in response to human input"; suspended snapshots persist across restarts. [M2] | NATIVE, most battle-tested pattern. `interrupt()` pauses; `new Command({ resume })` continues; checkpointer makes it survive restarts, "days, weeks, or longer". **Caveat: the node re-executes from its start on resume** — code before `interrupt()` runs again; side effects must be idempotent. [L3] |
| **Tool orchestration (typed tools, parallel calls, structured outputs, per-tool guardrails)** | NATIVE. Zod-typed function tools, guardrails framework (input/output + `GuardrailSpanData`), structured outputs, hosted tools. [O1][O4] | NATIVE but coding-flavored. Ships filesystem/shell/web tools + hooks (`PreToolUse`/`PostToolUse` as per-tool guardrails); custom typed tools via in-process MCP servers rather than plain function defs. [C1] | NATIVE. Zod-typed `tool()`, parallel tool calls, `generateObject`/structured outputs, per-tool `toolApproval` policies (per-tool map / per-tool function / generic fn; `@ai-sdk/policy-opa` for policy-as-code). [V2] | NATIVE. `createTool()` with input/output schemas; tool-input validation; model router. [M1] | NATIVE. LangChain typed tools; graph gives the finest-grained control of orchestration logic (that's its point: "low-level orchestration framework"). [L1][L4] |
| **Durable workflow/checkpointing, retry, idempotency (no double-posting)** | ABSENT as a substrate. No step engine, no retries/memoization; serialization only at interruption boundaries. DB-side idempotency keys mandatory (they are anyway). [O2][O3] | PARTIAL. Continuous transcript persistence gives crash recovery to last message, and file-checkpointing exists for *files*, but there is no step engine, no retry semantics, no memoized side effects. [C2][C3] | NATIVE. `'use step'` = durable, memoized, auto-retried steps (default 3 attempts); completed steps don't re-run on replay — the strongest no-double-posting story of the five *at the runtime layer* (DB-side idempotency still belongs in the audited fns). [W2][W5] | NATIVE for workflows: step-based engine, snapshots, error-handling docs; optional external runners (Inngest). [M2][M4] | NATIVE checkpointing per super-step; retry policies configurable; **but** resume re-executes the interrupted node from its top, so tool side effects must be idempotent/upserted. [L2][L3] |
| **Tracing/observability (exportable, self-hostable)** | NATIVE. Default exports to OpenAI's dashboard (`OpenAITracingExporter`); replaceable — `TracingProcessor`/`TracingExporter` interfaces, `setTraceProcessors()`, `setTracingDisabled()`. Captures generations (tokens), tool calls, guardrails, handoffs. [O4] | PARTIAL/BUILDABLE. No first-class trace-exporter API in the SDK; you observe via the message stream + hooks; Claude Code's OTel telemetry env vars apply to the subprocess for usage metrics. Runtime tracing of tool calls = build on hooks. [C1] | NATIVE. `@ai-sdk/otel` — standard OpenTelemetry spans (`invoke_agent`, `chat`, `execute_tool`, `gen_ai.usage.*` tokens) to any OTLP collector → fully self-hostable. WDK adds per-step run observability (Vercel dashboard when hosted; Postgres world state is in your own DB). [V3][V1] | NATIVE. Observability is a *storage domain* — "Traces, spans, metrics, logs" stored in your own PostgresStore; exporters to Langfuse etc. [M3] | PARTIAL. Deep integration targets LangSmith (SaaS; self-hosted LangSmith is an enterprise product); OTel-based alternatives are buildable. Streaming exposes full event granularity. [L1] |
| **Streaming (SSE) to custom Next.js dashboard** | NATIVE. Streaming runs; you bridge to SSE (already proven in the current build). [O1] | NATIVE-ish. Async-iterator message stream (incl. partial messages); you bridge to SSE yourself. [C1] | NATIVE, best-in-class for Next.js: UI message streams, `useChat`, and WDK **resumable streams** — a client can reconnect to a running workflow's stream after disconnect (`WorkflowChatTransport`). [V1][W2][W6] | NATIVE. `.stream()` / `fullStream`, `.resumeStream()` for interrupted streams. [M2] | NATIVE. Multiple stream modes (values/updates/events); bridge to SSE yourself. [L1] |
| **Model-agnosticism** | PARTIAL. First-class = OpenAI models. Any other provider goes through the `@openai/agents-extensions` `aisdk()` adapter, which is **"still in beta"**, and docs steer OpenAI models away from it. Some features unsupported through the adapter (deferred tool loading, `toolSearchTool()`). [O5] | ABSENT. Claude models only (via Anthropic API, Bedrock, Vertex, Azure Foundry — different *clouds*, same model family). This is a hard fail on the swap-provider requirement as stated. [C1] | NATIVE — this is the AI SDK's core identity; largest provider ecosystem in TS; provider/model swap is a string change. [V1] | NATIVE. Model router: `provider/model` strings (openai/…, anthropic/…, google/…) with auto env detection. [M1] | NATIVE. Model-agnostic via LangChain integrations. [L1] |
| **Self-host on long-lived Node (Fly.io) / serverless fit** | NATIVE. Plain library; runs anywhere Node runs (current build proves it on Fly). [O1] | NATIVE with a caveat: the TS SDK spawns a bundled Claude Code binary subprocess per session — a heavier per-tenant footprint for a multi-tenant SaaS backend; hosting guide exists. [C1][C3] | NATIVE both ways. AI SDK runs anywhere. WDK: `@workflow/world-postgres` is "a production-ready backend for self-hosted deployments" — your Postgres + graphile-worker + LISTEN/NOTIFY, long-lived Node, explicitly lists Fly.io; requires `world.start()`, **not** serverless; the Vercel world covers the serverless path instead. [W1][V1] | NATIVE. Self-hosted Node server is the default shape; deployers for serverless exist. [M1] | NATIVE. OSS library self-hosts anywhere; LangGraph Platform is the optional managed path. [L1] |
| **MCP support (consume tool servers)** | NATIVE. Dedicated MCP guide (hosted / streamable-HTTP / stdio servers). [O1] | NATIVE and deepest — MCP is the SDK's primary custom-tool mechanism (`mcpServers` option; in-process SDK MCP servers too). [C1] | NATIVE. MCP tools + MCP apps in AI SDK docs. [V4] | NATIVE both directions: `MCPClient` (`@mastra/mcp`) to consume; `MCPServer` to expose agents. [M5] | NATIVE via `@langchain/mcp-adapters` `MultiServerMCPClient` (stdio + HTTP/SSE); stateless-per-call by default. [L5] |
| **Skills / progressive disclosure** | ABSENT in the SDK itself (OpenAI adopted the SKILL.md standard in Codex/ChatGPT, not as an Agents-SDK runtime feature). Buildable: load skill docs into instructions/tools. [S1] | NATIVE. Filesystem skills (`.claude/skills/*/SKILL.md`), auto- or slash-invoked; plugins bundle skills+hooks+MCP. Origin of the open Agent Skills standard (agentskills.io, Dec 2025; 30+ tools adopted — secondary source). [C1][S1] | ABSENT natively; buildable (skills are just progressive doc-loading; Vercel even runs a skills marketplace, skills.sh, aimed at coding agents). [S1] | ABSENT/IN-PROGRESS. npm dist-tags show active `feat-cli-skills-installation` work, but no shipped, documented skills feature I could verify. Buildable. [M-npm] | ABSENT natively; buildable (a skill-loader node/tool is trivial in a graph). [S1] |
| **Multi-agent / subagents for background jobs** | NATIVE. Handoffs + agents-as-tools + multi-agent guide. Background *durability* (bulk sweeps) still needs your own job runner. [O1] | NATIVE. `agents` option defines subagents; `parent_tool_use_id` tracks their messages; subagent transcripts mirrored in SessionStore. [C1][C3] | NATIVE pattern + durable substrate: agents-as-tools in AI SDK; WDK workflows are the natural home for bulk approve/reconciliation sweeps (queued, retried, observable). [V1][W2] | NATIVE. Agent networks + workflows calling agents; background tasks/schedules are storage domains. [M1][M3] | NATIVE. Subgraphs, supervisor/swarm patterns — the most explicit multi-agent control of the five. [L1] |

---

## 2. Per-candidate narrative

### 2.1 OpenAI Agents SDK JS — the incumbent (`@openai/agents` 0.13.4, MIT)

What it genuinely has: the HITL story is better than the current BELCORT build uses — `needsApproval`
tool interruption produces a serializable `RunState` (`result.state.toString()` / `RunState.fromString()`),
and the docs explicitly bless storing it in a database and resuming later, including agent-graph identity
stability across handoffs [O2]. Tracing is complete and replaceable (custom `TracingExporter`,
`setTracingDisabled()`) [O4]. MCP, guardrails, handoffs, sessions are all native [O1].

The honest gaps, which map one-to-one onto the audit findings that motivated this evaluation:
- **No durable execution substrate.** Serialization happens at interruption/turn boundaries you manage.
  A crash mid-run (mid-tool-chain) loses everything since the last checkpoint you took. Sessions persist
  *history*, not *runs* [O2][O3]. Fixing the #1 pain on this SDK means building your own checkpoint
  cadence + storage + wake/resume machinery — i.e. the WP-015-style custom runtime kernel again.
- **Serialized-state version skew is documented as your problem**: pending approvals across an agent-def
  or SDK upgrade require "your own branching logic" with parallel package-aliased SDK versions [O2]. For
  approvals that wait days (Clara's normal case), this is a standing operational hazard on a 0.x package.
- **Model-agnosticism is second-class**: the `aisdk()` adapter is "still in beta" [O5].
- Still 0.x semver after ~2 years; default trace export target is OpenAI's platform (disable/replace is easy).

### 2.2 Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.211, Anthropic Commercial ToS)

The most capable *agent harness* of the five: native skills (the standard BELCORT already organizes work
around), subagents, hooks, permission system, and the deepest MCP integration [C1]. The new `SessionStore`
adapter is a real answer to durability-of-context: continuous transcript persistence, mirrored to
Postgres/S3/Redis with a shipped reference Postgres adapter and a conformance test suite; any host can
resume any session [C3].

Why it still ranks low *for this specific product as specified*:
- **Model lock-in**: Claude models only. The brief's model-agnosticism requirement fails outright [C1].
- **License/coupling**: not OSS; governed by Anthropic's commercial terms [C1].
- **Architecture fit**: each session runs a bundled Claude Code binary subprocess. For a multi-tenant
  accounting backend on Fly where tools are curated DB functions (not filesystem edits), you carry the
  weight of a coding-agent harness you mostly won't use [C1].
- **HITL shape**: approvals/clarifications are in-loop callbacks, not serialized pending-approval
  artifacts; the days-later approval flow is rebuilt app-side on top of session resume [C2].
- **API churn evidence**: the experimental V2 session API was added and then removed at 0.3.142 [C2].

If the owner drops model-agnosticism (Clara is Claude-branded in spirit), this candidate jumps to the
top tier and the skills/subagent/permission alignment with BELCORT's existing doctrine becomes decisive.
That is an owner decision, not a research conclusion.

### 2.3 Vercel AI SDK 7 + Workflow SDK (`ai` 7.0.29 + `workflow` 4.6.0, both Apache-2.0)

Two composable layers, both open source:
- **AI SDK 7** supplies the model layer and agent loop (`ToolLoopAgent`), the widest provider ecosystem
  in TypeScript, typed tools, structured outputs, and — critically — **tool approvals whose state lives in
  the message history** (`tool-approval-request`/`-response` parts, `addToolApprovalResponse()`), so the
  pending-approval record persists in *your* Postgres and resumes across sessions; approvals can be
  HMAC-signed (`experimental_toolApprovalSecret`) against client tampering, and policy-based approvals
  (`@ai-sdk/policy-opa`) exist for policy-as-code [V2]. Observability is stable OpenTelemetry
  (`@ai-sdk/otel`) with token/tool spans to any collector [V3].
- **Workflow SDK** supplies durable execution: `'use workflow'` / `'use step'`, memoized auto-retried
  steps, `sleep()` for months, typed `defineHook()` / `createWebhook()` that pause a run "even after days
  of inactivity" at zero compute [W3][W4]. `WorkflowAgent` from `@ai-sdk/workflow` runs the AI SDK agent
  loop *inside* a workflow so the loop itself is crash-durable and tool calls become retryable steps [W2].
  **Self-hosting is first-class**: `@workflow/world-postgres` is documented as "a production-ready backend
  for self-hosted deployments" — your own Postgres, graphile-worker, LISTEN/NOTIFY, long-lived Node,
  Fly.io named explicitly; no Vercel dependency [W1]. Resumable streams let a dashboard reconnect to a
  live run [W6].

Alignment with BELCORT's cardinal invariant is the quiet winner here: approval state in app-owned
messages + workflow state in your own Postgres means **the DB remains the single source of truth for
agent state**, rather than a vendor-hosted conversations API (OpenAI) or a filesystem transcript (Claude).

Honest gaps: WDK is young (public in 2025; 4.x stable, 5.0 in beta with the 4.x→5.x line moving fast);
the AI-SDK-agent + workflow composition has more moving parts than an all-in-one framework; workflow code
carries determinism discipline (non-deterministic work must live in steps); native HITL for *agents* is a
pattern you assemble from hooks + tools (documented, but assembly nonetheless) [W2][W3]; skills are absent
(buildable). Version cadence risk: `ai` has jumped v5→v6→v7 in ~18 months (old lines are maintained, but
migrations recur).

### 2.4 Mastra (`@mastra/core` 1.51.0, Apache-2.0)

The batteries-included option: agents + workflows + memory + storage + observability + MCP (both
directions) in one framework. Storage domains (memory, workflow snapshots, traces, background tasks,
schedules) all persist to your choice of 12 backends including **PostgresStore** [M3]. Workflow
`suspend()`/`resume()` with `resumeSchema` survives restarts and can be resumed from any HTTP endpoint —
a clean days-later approval fit [M2]. Model routing is provider-string agnostic [M1].

Honest gaps: plain agent runs are not durable — durability requires structuring work as workflows;
the npm registry shows an extremely rapid release/branch cadence (hundreds of ad-hoc dist-tags, 1.51.0
current, 1.52 alpha already up), which reads as high velocity *and* high churn [M-npm]; the framework
wants to own a lot of surface (server, studio, deployer) which overlaps awkwardly with an existing
Next.js + Fly architecture; production adoption in regulated/financial domains is less evidenced than
LangGraph's.

### 2.5 LangGraph JS (`@langchain/langgraph` 1.4.8, MIT)

The most proven durable-HITL machinery: checkpointer-backed graph state per `thread_id`
(`PostgresSaver`), `interrupt()` + `Command({resume})` that survives restarts "days, weeks, or longer",
time travel, and explicit fault-tolerance framing [L2][L3]. Post-1.0 (Oct 2025) it is semver-stable, MIT,
model-agnostic, with real production references (Klarna, Uber, J.P. Morgan cited on the overview) [L1].

Honest gaps: it is deliberately low-level — you write more orchestration code than with any other
candidate; **resume re-executes the interrupted node from its top**, so every side-effecting node must be
idempotent (docs say so explicitly) [L3]; best-path observability is LangSmith, a proprietary SaaS
(self-hosted LangSmith is enterprise-tier) — OTel alternatives exist but are not the paved road; the JS
port historically trails the Python flagship in features and docs.

---

## 3. Citations

**OpenAI Agents SDK JS**
- [O1] https://openai.github.io/openai-agents-js/ (feature/nav overview: sessions, HITL, MCP, tracing, guardrails, handoffs, streaming)
- [O2] https://openai.github.io/openai-agents-js/guides/human-in-the-loop/ (fetched via repo source `docs/src/content/docs/guides/human-in-the-loop.mdx`): `needsApproval`, `interruptions`, `RunState.fromString`, DB storage blessed, version-skew caveat quoted
- [O3] https://openai.github.io/openai-agents-js/guides/sessions/ : `MemorySession`, `OpenAIConversationsSession`, `OpenAIResponsesCompactionSession`
- [O4] https://openai.github.io/openai-agents-js/guides/tracing/ : `OpenAITracingExporter`, `TracingProcessor`/`TracingExporter`, `setTracingDisabled()`, span data incl. tokens
- [O5] https://openai.github.io/openai-agents-js/extensions/ai-sdk/ (repo source): `@openai/agents-extensions` `aisdk()`, "still in beta", unsupported features list

**Claude Agent SDK**
- [C1] https://code.claude.com/docs/en/agent-sdk/overview : tools, hooks, subagents, MCP, permissions, sessions, skills table, Bedrock/Vertex/Foundry auth, bundled binary note, Commercial-ToS license section
- [C2] https://code.claude.com/docs/en/agent-sdk/sessions : JSONL under `~/.claude/projects/<encoded-cwd>/`, `continue`/`resume`/`forkSession`, `persistSession:false`, V2-API removal note (0.3.142), in-loop permission/AskUserQuestion note
- [C3] https://code.claude.com/docs/en/agent-sdk/session-storage : `SessionStore` interface, S3/Redis/**Postgres** reference adapters, conformance suite, dual-write + best-effort mirror semantics, subagent transcript mirroring

**Vercel AI SDK + Workflow SDK**
- [V1] https://vercel.com/docs/workflows (last_updated 2026-06-17): resumable/durable/observable claims, `'use workflow'`, managed platform vs open-source SDK, 5.0-beta multi-region note
- [V2] https://ai-sdk.dev/docs/agents/tool-approvals : `toolApproval` policies, `tool-approval-request/-response` in message history, `addToolApprovalResponse()`, `experimental_toolApprovalSecret`, `@ai-sdk/policy-opa`
- [V3] https://ai-sdk.dev/docs/ai-sdk-core/telemetry : `@ai-sdk/otel`, `registerTelemetry`, span taxonomy + `gen_ai.usage.*`
- [V4] https://ai-sdk.dev/docs/agents/overview : AI SDK 7, `ToolLoopAgent`, loop control, MCP tools/apps
- [W1] https://workflow-sdk.dev/worlds/postgres : `@workflow/world-postgres` "production-ready backend for self-hosted deployments", graphile-worker + NOTIFY/LISTEN, `world.start()`, not serverless, Fly.io listed
- [W2] https://workflow-sdk.dev/docs/ai : `WorkflowAgent` from `@ai-sdk/workflow`, loop-in-workflow persistence, `'use step'` tools with default 3 retries, `createModelCallToUIChunkTransform()`
- [W3] https://workflow-sdk.dev/docs/ai/human-in-the-loop : `defineHook()`/`createWebhook()`, "even after days of inactivity", zero compute while paused, `hook.resume(toolCallId, …)`
- [W4] https://workflow-sdk.dev/llms.txt (doc index: hooks, errors-and-retries, resumable streams, worlds)
- [W5] https://workflow-sdk.dev/docs/foundations/errors-and-retries (indexed; step retry semantics)
- [W6] https://workflow-sdk.dev/docs/ai/resumable-streams + `WorkflowChatTransport` API reference (indexed)

**Mastra**
- [M1] https://mastra.ai/docs : `Agent`, `createTool()`, model router `provider/model` strings
- [M2] https://mastra.ai/docs/workflows/overview + https://mastra.ai/docs/workflows/suspend-and-resume : `createWorkflow`, `suspend()`/`resume()`/`resumeSchema`, "Snapshots … persist across deployments and application restarts", resume from any endpoint
- [M3] https://mastra.ai/docs/server-db/storage : 12 backends incl. `PostgresStore`; domains = memory / workflow snapshots / observability traces / background tasks / schedules; `MastraCompositeStore`
- [M4] Mastra workflows error-handling docs (linked from [M2])
- [M5] https://mastra.ai/docs/mcp/overview : `MCPClient` (`@mastra/mcp`), `MCPServer`, stdio + HTTP(S) transports
- [M-npm] https://registry.npmjs.org/@mastra/core (dist-tag churn, 1.51.0 latest, `feat-cli-skills-installation` tag)

**LangGraph JS**
- [L1] https://docs.langchain.com/oss/javascript/langgraph/overview : low-level orchestration framing, durable execution, HITL, model-agnostic, Klarna/Uber/J.P. Morgan
- [L2] https://docs.langchain.com/oss/javascript/langgraph/persistence : `MemorySaver`, `PostgresSaver`, `SqliteSaver`, thread model, crash recovery
- [L3] https://docs.langchain.com/oss/javascript/langgraph/interrupts : `interrupt()`, `Command({resume})`, checkpointer requirement, days/weeks resume, node re-execution caveat (quoted), `result.__interrupt__`
- [L4] https://docs.langchain.com/oss/javascript/langchain/tools
- [L5] https://docs.langchain.com/oss/javascript/langchain/mcp : `@langchain/mcp-adapters`, `MultiServerMCPClient`, stateless-per-call default

**Agent Skills standard** (secondary sources — adoption claims not verified against each vendor)
- [S1] Anthropic published SKILL.md as an open standard 2025-12-18 (agentskills.io); adopted within days by Microsoft and OpenAI (Codex/ChatGPT) and by 30+ tools by mid-2026; Vercel runs the skills.sh marketplace. Sources: https://www.paperclipped.de/en/blog/agent-skills-open-standard-interoperability/ , https://developers.openai.com/codex/skills , https://developers.openai.com/blog/skills-agents-sdk , https://agentman.ai/blog/agent-skills-ecosystem-report-2026

---

## 4. Operational-risk comparison

| Candidate | Vendor coupling | Breaking-change history / semver | Community & production evidence | Standing hazards |
|---|---|---|---|---|
| OpenAI Agents SDK JS | Default tracing → OpenAI platform; hosted Conversations optional; model layer OpenAI-first | Still **0.x** (0.13.4); serialized `RunState` explicitly not stable across SDK/agent-def upgrades [O2] | Large; OpenAI-backed; incumbent in current build | Pending approvals spanning a deploy = documented skew problem; no crash-mid-run durability |
| Claude Agent SDK | Highest: Claude models only; Commercial ToS; bundled proprietary binary | 0.3.x with fast cadence; V2 session API added then removed (0.3.142) [C2] | Anthropic-backed, huge Claude Code user base; SDK-as-server-runtime adoption younger | Model lock-in; per-session subprocess footprint; best-effort mirror can drop transcript batches (monitor `mirror_error`) [C3] |
| AI SDK 7 + Workflow SDK | Low for AI SDK (Apache-2.0, any provider); WDK roadmap Vercel-steered but self-host world is first-class Apache-2.0 [W1] | AI SDK majors v5→v6→v7 in ~18 months (parallel maintenance lines); WDK 4.x stable / 5.0-beta split | AI SDK = the dominant TS LLM toolkit; WDK young (2025) with growing but shorter production record | Two-layer composition; workflow determinism discipline; **LISTEN/NOTIFY + graphile-worker vs Supabase connection pooling needs a spike** (direct connection required, Supavisor session-mode implications) |
| Mastra | Low (Apache-2.0, self-hosted default; Mastra Cloud optional) | 1.x since late 2025, but hyperactive release/branch cadence [M-npm]; past AI-SDK-version compat breaks visible in tags | YC-backed, fast-growing; fewer regulated-industry references | Framework wants the whole stack (server/studio/deployer) — friction with an existing Next.js+Fly architecture; agent runs not durable outside workflows |
| LangGraph JS | Low for OSS (MIT); observability paved road = LangSmith SaaS | 1.0 shipped Oct 2025 → semver-stable now; pre-1.0 era churn was real; JS trails Python | Strongest enterprise production evidence of the five [L1] | Node re-execution on resume demands idempotent side effects everywhere; more hand-written orchestration code to own |

---

## 5. Preliminary ranked recommendation

**Context weighting:** the decisive requirements for Clara are (1) durable runs that survive
restart/redeploy, (2) days-later resumable approvals/clarifications, (3) state in *our* Postgres (DB is
the single source of truth — PRD cardinal invariant), (4) self-host on Fly's long-lived Node, (5) model
swap without runtime rewrite. Rows most candidates tie on (MCP, streaming, typed tools) were not decisive.

1. **Vercel AI SDK 7 + Workflow SDK (Postgres world)** — the only candidate where the durable-execution
   substrate is a step-checkpointed engine running on **our own Postgres**, with the agent loop inside it
   (`WorkflowAgent`), approvals persisted in app-owned message history, hooks that pause for days at zero
   compute, stable OTel tracing, Apache-2.0, and true model-agnosticism. It is the only stack that
   satisfies every decisive row natively while keeping agent state in the DB we already govern.
2. **LangGraph JS** — the most battle-tested durable-HITL machinery (`interrupt()` + `PostgresSaver`),
   MIT, model-agnostic, strongest enterprise references. Costs: significantly more orchestration code to
   own, idempotency burden from node re-execution, LangSmith gravity for observability. The right choice
   if WDK fails its production spike.
3. **Mastra** — closest to "everything included, all state in Postgres", genuine suspend/resume. Held
   back by agent-loop durability being workflow-only, release-cadence churn, and its ambition to own the
   server surface we already have.
4. **OpenAI Agents SDK JS (incumbent)** — keeping it is not free: the #1 pain (process-local run state)
   is a structural property of this SDK, and its documented answer (serialize `RunState` at interruptions,
   accept version-skew risk across deploys) recreates the custom runtime kernel we'd hoped to buy.
   Retain only if minimizing migration outweighs the durability requirement — which contradicts the brief.
5. **Claude Agent SDK** — the best harness (skills, subagents, permissions, MCP, SessionStore→Postgres)
   but fails the stated model-agnosticism requirement outright, is non-OSS, and its coding-agent
   subprocess architecture is a poor shape for a multi-tenant DB-tool backend. **Escalation flag: if the
   owner is willing to drop model-agnosticism, this re-ranks into the top two and deserves a dedicated
   head-to-head with option 1.**

### Top 3 risks of the recommended choice (AI SDK + WDK)

1. **WDK maturity/churn.** The `workflow` package is young (4.6.0 stable, 5.0.0-beta.35 in flight); the
   self-hosted Postgres world's long-run production record is short, and cross-deploy replay compatibility
   for in-flight runs under our own deploy cadence must be proven, not assumed. Mitigation: 1-week spike
   + pin versions + drain-before-deploy policy for in-flight runs.
2. **Postgres-world × Supabase operational fit.** graphile-worker + LISTEN/NOTIFY need direct (non-pooled,
   session-mode) connections; running the runtime's tables inside `belcort-shared` raises RLS/namespace
   questions (runtime state is firm-scoped data too), vs. a separate runtime DB which splits the source of
   truth. This is a Gate-2 design decision interacting with the WP-015-style durable-runtime schema from
   the first rebuild attempt (adopt framework persistence vs. re-build the custom kernel).
3. **Assembly, not appliance.** Durable HITL for agents is a documented *pattern* (hooks + tool wiring +
   UI routing), not a one-line API; plus workflow-code determinism discipline for every engineer/agent
   touching the runtime. The integration code we write is ours to test and own — smaller than building a
   durable kernel from scratch, but not zero.

### What would change the answer

- **Owner relaxes model-agnosticism** → Claude Agent SDK re-enters at the top (skills + subagents +
  permission doctrine align with BELCORT's existing `belcort/` canon and `.claude/skills` practice).
- **WDK spike fails** (Supabase pooling, throughput, replay-across-deploy) → LangGraph JS becomes #1.
- **Decision to keep the custom DB-owned runtime kernel (WP-015 direction)** → the framework matters much
  less; the incumbent OpenAI SDK (or plain AI SDK loop) driven by our own tasks/runs/checkpoints tables
  becomes defensible, since durability would be DB-native and runtime-independent.
- **Team-capacity constraint** (minimum new code now) → Mastra rises; incumbent stays only if durability
  is deferred, which the audit says it cannot be.

---

## 6. Addendum — post-review closures from G1's re-verification (2026-07-17)

G1 (Gate-2 runtime recommendation worker) re-verified this matrix against primary sources and reports it
held up; their FIRM recommendation (AI SDK 7 + WDK Postgres world, LangGraph fallback, spike as a hard
precondition) is at `C:\Users\zhant\Desktop\clara-rebuild\docs\phase2-research\runtime-recommendation.md`.
Two updates to the risk picture above (verified by G1, not independently re-checked by this report's author):

1. **Risk 2 of §5 (WDK × Supabase pooling) is RESOLVED.** Supavisor **session mode** (port 5432, IPv4)
   officially supports LISTEN/NOTIFY per the Supavisor FAQ, and graphile-worker's requirements (PG12+,
   Node 22.18+) are met by our PG17/Node 22+. **Transaction mode (port 6543) remains forbidden for the
   world connection.** Operational default: session mode; direct IPv6 as the fast path — noting a
   Fly→Supabase regional IPv6 incident (gru, 2026-04) as the reason session mode is the default.
2. **New verified gap (now Risk 1 in G1's recommendation):** `workflow-sdk.dev/docs/deploying` is
   **silent on in-flight-run replay/versioning across code deploys**. Mitigations carried by G1:
   drain-before-deploy + workflow name-versioning, with an explicit spike acceptance criterion.

Attribution correction: the "Grt-*" findings referenced alongside this file in some task briefs come from
the Workstream-G findings JSON (scratchpad `findings/Grt.json`), **not** from this report.
