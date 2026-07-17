# Runtime recommendation — Clara rebuild agent runtime (Workstream G1, FINAL for Gate 2)

> **STATUS: FIRM RECOMMENDATION — Gate-2 decision input, owner ratifies at Gate 2.**
> Author: G1 runtime-recommendation lane · Date: 2026-07-17.
> Built on: the Gate-1 binding decisions (`docs/audit/04-gate1-decisions.md`), the Gate-1 packet
> (`docs/audit/00-GATE-1-README.md`, failure patterns 2/3/5), the adversarially-verified Grt-1…Grt-15
> findings (Workstream G, runtime statefulness/resumability/post-workflow sync), and the preliminary
> npm-verified candidate matrix (`docs/audit/evidence/runtime-research.md`, 2026-07-17).
> **Every decisive fact below was re-verified against primary sources on 2026-07-17** (npm registry via
> `npm view`, plus the official doc pages cited in §9). Facts carried from the preliminary matrix without
> re-fetch are marked *(carried)*.

---

## 1. The recommendation

**Adopt the Vercel AI SDK 7 (`ai@7`) as the model/agent layer and the Workflow DevKit
(`workflow@4` + `@workflow/world-postgres`) as the durable-execution substrate, self-hosted in the
Clara agent service (long-lived Node process on Fly), with all engine state in Postgres and all
firm-facing agent state projected into RLS-scoped app tables. Tracing = AI SDK OpenTelemetry
(`@ai-sdk/otel`) with full-content spans exported to a DPA-covered vendor (Langfuse Cloud verified as
a concrete candidate; self-host fallback documented), per the owner's C6 ruling.**

Condition attached to the recommendation: **a 1–2 week production spike is a hard precondition of the
Phase-3 build commitment** (§7, Risk 1 and §8 spike plan). If the spike fails its acceptance criteria,
the fallback is **LangGraph JS + `PostgresSaver`** (runner-up, §5) — the seam design in §6 is written
so the fallback swaps under the same interface.

The incumbent **OpenAI Agents SDK is not retained** as the rebuild runtime. Keeping it would require
hand-building the entire durable substrate (checkpoint cadence, storage, resume machinery, retry,
idempotent re-drive) that the audit proved missing — i.e., rebuilding the custom runtime kernel the
framework was supposed to provide — while carrying a documented serialized-state version-skew hazard
on a 0.x package for approvals that routinely wait days (§4, row-by-row; §5.3).

---

## 2. What this decision must satisfy (requirements, with authority)

### 2.1 Binding rulings (Gate 1, owner-approved 2026-07-17)

- **D (runtime open):** "OPEN — decided at Gate 2 with the architecture packet. The incumbent OpenAI
  Agents SDK is NOT presumptive. C6 adds a runtime requirement: vendor-tracing must be DPA-coverable;
  durable execution + resumable HITL remain the decisive rows." (`04-gate1-decisions.md` row D)
- **C6 (owner override):** "Full-content vendor tracing under DPA + firm disclosure." The runtime must
  have a real, documented tracing story able to carry **full content** to a vendor platform under an
  executed DPA (self-hosted/redacted tracing was declined twice — deliberate owner posture). The DPA
  execution, firm-facing disclosure, and PDPA cross-border check are Gate-2 checklist items, not
  runtime features — but the runtime must make them *possible and documented*.
- **C3 (structural invariants):** the four firm-killing invariants are DB guarantees. Consequence for
  the runtime: framework-level approvals/guardrails are UX/orchestration convenience; **the DB-owned
  authorization policy remains the hard floor**. The runtime must not fight that (it must be able to
  treat a DB RAISE as the authoritative gate).
- **C4 (maker-checker):** maker identity always modeled; the agent can never satisfy a human sign-off.
  Consequence: approval interruptions must durably record *who* resolved them, and resolution must be
  attributable to a human credential — the runtime's approval artifact must be persistable and
  tamper-evident.

### 2.2 The runtime requirements (from the hero prompt + audit evidence)

| # | Requirement | Why (evidence) |
|---|---|---|
| R1 | **Durable DB-backed run/task/checkpoint state surviving redeploy** | Grt-1 (all run state in one in-memory `Map`, Fly redeploy vaporizes it), Grt-6 (durable-vs-volatile inventory: "the entire agentic working set is volatile"), failure pattern 2 |
| R2 | **Resumable HITL clarification + approval interruptions (days later)** | Grt-7 (mid-interview redeploy loses the whole onboarding interview, no resume), Grt-5 (clarify loop held together by a prompt nudge), C4 |
| R3 | **Typed tools + structured outputs + per-tool guardrails** | Grt-4 (zero guardrail hits in the old build; safety rested on tool-layer policy + RLS + prompt fencing), failure pattern 4 |
| R4 | **Durable-workflow checkpointing + idempotency (no double-post)** | Grt-11 (bulk-approve restart re-drive miscounts an already-approved id as failure and settles a green job FAILED; re-drive only fires on a user surface), failure patterns 2/7 |
| R5 | **Tracing: DPA-coverable, full-content to a vendor platform OR self-host** | C6 ruling; Grt-3 (no trace ids/spans anywhere in-system; `tool_calls` column never written); GAP finding that the old SDK exported sensitive content by default with no owner decision |
| R6 | **SSE streaming to the Next.js dashboard** | current dashboard contract; failure pattern 5 (a run must not require an SSE attach to execute) |
| R7 | **Model-agnosticism** | ADR-031 swap-seam intent; owner has not relaxed it (Gate-1 row D leaves it standing) |
| R8 | **Self-host on a long-lived Node process (Fly)** | current topology; blocking clarify + long turns fight serverless limits |
| R9 | **MCP consumption** | target architecture (curated first-party tools remain the write surface; MCP for read/side tools) |
| R10 | **Skills / progressive disclosure** | `belcort/` doctrine + skills canon; failure pattern 11 (doctrine drift — the loader must be regenerable against the real registry) |
| R11 | **Multi-agent / background jobs** | bulk sweeps, wake lanes, close-period jobs (Grt-12: wakes are at-most-once in-memory timers dropped on shutdown) |

**Decisive rows (per Gate-1 row D + the Grt evidence): R1, R2, R4, R5, R7, R8.** R3/R6/R9 are ties or
near-ties across finalists; R10 is buildable everywhere except native-in-Claude-SDK; R11 follows from
R1/R4.

---

## 3. Verified fact base (all re-verified 2026-07-17 unless marked *carried*)

### 3.1 Versions (npm registry, `npm view`, 2026-07-17)

| Package | Version today | Notes |
|---|---|---|
| `ai` (Vercel AI SDK) | **7.0.30** | Apache-2.0; v5/v6 lines still maintained *(carried)* |
| `workflow` (Workflow DevKit) | **4.6.0** | Apache-2.0; 5.0.0-beta line in flight *(carried)* |
| `@ai-sdk/workflow` (WorkflowAgent) | **1.0.30** | the AI-SDK↔WDK bridge |
| `@workflow/world-postgres` | **4.3.0** | the self-hosted Postgres backend |
| `@ai-sdk/otel` | **1.0.30** | stable OTel integration |
| `@langchain/langgraph` | **1.4.8** | MIT; post-1.0 semver-stable |
| `@langchain/langgraph-checkpoint-postgres` | **1.0.4** | PostgresSaver |
| `@openai/agents` (incumbent) | **0.13.4** | MIT; still 0.x |
| `@anthropic-ai/claude-agent-sdk` | **0.3.212** | Commercial ToS, not OSS |
| `@mastra/core` | **1.51.0** | Apache-2.0 |

### 3.2 Decisive primary-doc facts (fetched 2026-07-17)

**Workflow DevKit — Postgres world** (`workflow-sdk.dev/worlds/postgres`):
- "a production-ready backend for self-hosted deployments" that "uses PostgreSQL for durable storage
  and graphile-worker for reliable job processing".
- "Workflow runs, events, steps, and hooks are stored in PostgreSQL tables"; "PostgreSQL NOTIFY/LISTEN
  enables real-time event distribution".
- Deployment targets named: Docker, Kubernetes, VMs, "Platform-as-a-Service providers (Railway,
  Render, Fly.io, etc.)".
- "The Postgres World requires a long-lived worker process that polls the database for jobs. This does
  not work on serverless environments." (Matches our Fly always-on topology exactly.)
- Config: `WORKFLOW_POSTGRES_URL` (falls back to `DATABASE_URL`); idempotent bootstrap migration safe
  as a post-deploy lifecycle script; `queueConcurrency` default 50, `maxPoolSize` default 10; job
  prefix for multi-app sharing of one database.

**Workflow DevKit — AI agents** (`workflow-sdk.dev/docs/ai`):
- `WorkflowAgent` (from `@ai-sdk/workflow`) "runs the agent loop inside a workflow, persists state
  across step boundaries, and lets tool executions marked with `'use step'` retry automatically."
- "Failed tool calls are automatically retried (up to 3 times by default)"; workflows "survive
  crashes, scale across requests, and maintain state with durable LLM tool-call loops."
- Streaming: `WorkflowAgent` writes `ModelCallStreamPart` chunks to a persistent stream
  (`getWritable()`); the API layer re-reads via `run.readable.pipeThrough(createModelCallToUIChunkTransform())`
  → **resumable client connections** (a reconnecting dashboard reattaches to a live run's stream).

**Workflow DevKit — HITL** (`workflow-sdk.dev/docs/ai/human-in-the-loop`):
- "The workflow pauses at `await hook` — no compute resources are consumed while waiting for the human
  to take action."
- "smooth resumption of workflows even after days of inactivity."
- Resume: `hook.resume(token, data)` from any endpoint, or a `createWebhook()` URL POSTed directly;
  "Use the toolCallId as the hook token so the UI can reference it."

**AI SDK 7 — tool approvals** (`ai-sdk.dev/docs/agents/tool-approvals`):
- `toolApproval` on the agent: per-tool map, per-tool function (receives typed input +
  `runtimeContext` — role-based denial shown in the docs), or a generic function; per-request via
  `prepareCall`.
- Approval state travels as **`tool-approval-request` / `tool-approval-response` message parts** —
  i.e., it persists wherever the messages persist (**our Postgres**), and the resume is "call agent
  again with updated messages". `useChat` surfaces `state: 'approval-requested'` parts +
  `addToolApprovalResponse`.
- `experimental_toolApprovalSecret`: "the server HMAC-signs each approval request at issuance and
  verifies the signature when the approval is replayed"; binds tool name + call id + input; fails
  closed. (Direct fit for C4's tamper-evident human sign-off.)
- "`needsApproval` for `WorkflowAgent` (suspends/resumes durable execution)" — the durable-agent
  variant of approvals is a shipped, documented feature, not an assembly pattern.
- Policy-as-code lane exists (`@ai-sdk/policy-opa`).

**AI SDK 7 — telemetry** (`ai-sdk.dev/docs/ai-sdk-core/telemetry`):
- `registerTelemetry(new OpenTelemetry())` from `@ai-sdk/otel`; spans: `invoke_agent` (root), `chat`
  (per model call), `execute_tool` (per tool execution); `gen_ai.usage.input_tokens`/`output_tokens`.
- **Inputs and outputs are recorded by default** ("You can disable them by setting the recordInputs and
  recordOutputs options to false") — i.e., full-content vendor tracing is the default posture, exactly
  the C6 ruling; follows "OpenTelemetry Semantic Conventions for GenAI"; presented as the recommended,
  non-experimental integration.

**WDK observability** (`workflow-sdk.dev/docs/observability`):
- Inspectable: "workflow runs, steps, webhooks, events, and stream output" via `npx workflow inspect
  runs` (CLI + local web UI); **observable data lives in the world backend** — for us, our own
  Postgres. (Engine-level run observability is therefore self-hosted by construction; model/tool
  content tracing rides the AI SDK OTel layer above.)

**WDK deploys — an honest gap (verified today):** `workflow-sdk.dev/docs/deploying` contains **no
guidance on in-flight runs across a code deploy** (no replay-compatibility, versioning, or drain
documentation). This is Risk 1 in §7 and a spike acceptance criterion in §8.

**LangGraph JS — interrupts + persistence** (`docs.langchain.com/oss/javascript/langgraph/interrupts`, `.../persistence`):
- "When you call `interrupt` within a node, LangGraph saves the current graph state and waits for you
  to resume execution with input"; "Graph waits indefinitely until you resume execution with a
  response"; resume via `new Command({ resume: value })`.
- **The decisive caveat, quoted:** "the runtime restarts the entire node from the beginning — it does
  not resume from the exact line where `interrupt` was called. This means any code that ran before the
  `interrupt` will execute again." Docs: "Do not perform non-idempotent operations before `interrupt`."
- Checkpointer mandatory; `MemorySaver` loses everything on restart; production = `PostgresSaver`
  ("PostgreSQL with async support"), thread-scoped checkpoints, fault tolerance listed as a use case.

**OpenAI Agents SDK JS — HITL** (raw guide fetched from the openai-agents-js repo):
- `needsApproval` → run pauses, `interruptions[]`; `result.state.toString()` /
  `RunState.fromString(agent, serialized)`; "You can store your serialized state in a database, or
  along with your request"; "The human-in-the-loop flow is designed to be interruptible for longer
  periods of time without keeping your server running."
- **The decisive caveat, quoted:** for pending approvals across a version change, "we currently
  recommend for you to implement your own branching logic by installing two versions of the Agents SDK
  in parallel using package aliases." On a 0.x package, for a product whose approvals normally wait
  days, this is a standing operational hazard, documented by the vendor itself.

### 3.3 Operational facts (the Supabase/Fly topology question — resolved)

This was flagged in the preliminary matrix as "the single biggest unverified operational assumption."
Verified today:

- **graphile-worker** (WDK Postgres world's queue): requires "PostgreSQL 12+ and Node 22.18+"
  (`worker.graphile.org/docs/requirements`) — our Postgres 17 / Node ≥22 stack satisfies both — and
  "uses LISTEN/NOTIFY to be informed of jobs as they're inserted" (`worker.graphile.org/docs`);
  at-least-once execution with transactional guarantees.
- **Supabase connection modes** (`supabase.com/docs/guides/database/connecting-to-postgres` + Supavisor
  FAQ): Direct connection (port 5432, **IPv6** unless the IPv4 add-on) is "for persistent servers, such
  as virtual machines (VMs) and long-lasting containers". **Supavisor session mode (port 5432, IPv4)
  supports all PostgreSQL features including LISTEN/NOTIFY** (Supavisor FAQ). Transaction mode (6543)
  does **not** support session-level features (no prepared statements; LISTEN/NOTIFY unsupported) — the
  runtime must never use it for the world connection.
- **Fly → Supabase IPv6**: works (documented pattern: "connect on the IPv6 DATABASE_URL"), but a
  regional IPv6 outage was reported from Fly `gru` to Supabase in April 2026 (community.fly.io #27739).
  Mitigation: default the world connection to **Supavisor session mode over IPv4**, keep direct IPv6 as
  the fast path, and the IPv4 add-on as escape hatch. (Clara runs in `sin`; the incident does not name
  `sin`, but the failure mode exists.)

### 3.4 C6 tracing-vendor facts

- AI SDK OTel spans carry full inputs/outputs by default (§3.2) to **any OTLP backend** → the vendor is
  a choice, not a lock-in. Concrete verified candidate: **Langfuse** — OTLP ingest endpoint
  (`/api/public/otel`, since v3.22), Cloud regions EU / US / JP with region-pinning language in its DPA
  ("customer personal data will only be hosted in selected regions"), a published DPA
  (`langfuse.com/security/dpa`), and an OSS **self-host** deployment as the documented fallback. Other
  OTLP-compatible vendors (Braintrust, LangSmith, Datadog) remain open; the vendor pick + executed DPA +
  firm disclosure + PDPA cross-border check are the Gate-2 checklist items the C6 ruling created.
- Incumbent comparison: the OpenAI SDK's default trace export goes to the OpenAI platform
  (replaceable/disable-able via `TracingProcessor`/`setTracingDisabled()` *(carried)*), i.e. one vendor,
  with the audit finding (GAP) that it was ON with sensitive content and **no owner decision** in the
  old build. C6 now makes full-content vendor export the *chosen* posture — but the requirement is a
  **documented, DPA-coverable, vendor-flexible** story, which OTel satisfies more cleanly than a
  single-vendor default.
- LangGraph comparison: paved road is LangSmith (SaaS; self-hosted LangSmith is enterprise-tier)
  *(carried)*; OTel export is buildable but not the first-class path.

---

## 4. Scored matrix (all five candidates × the eleven requirements)

Scores: **2** = native, documented, fits our shape · **1** = partial/buildable with real work ·
**0** = absent or fails. Decisive rows bolded. (Evidence: §3 + the preliminary matrix's cited cells.)

| Req | OpenAI Agents SDK | Claude Agent SDK | **AI SDK 7 + WDK** | Mastra | LangGraph JS |
|---|---|---|---|---|---|
| **R1 durable runs survive redeploy** | 1 (only at interruption boundaries you serialize; crash mid-run loses the run) | 1 (continuous transcript, but runs/approvals aren't first-class durable artifacts) | **2** (agent loop inside a step-checkpointed workflow; state in our Postgres) | 2 (workflow snapshots persist; plain agent runs not durable) | 2 (checkpoint per super-step, PostgresSaver) |
| **R2 days-later HITL resume** | 1 (RunState→DB blessed, but documented version-skew across deploys) | 1 (in-loop callbacks; days-later flow is yours to rebuild) | **2** (hooks pause "even after days" at zero compute + approvals persisted in message history + `needsApproval` on WorkflowAgent) | 2 (`suspend()`/`resume()` + resumeSchema) | 2 (interrupt/Command, indefinite wait — with the re-execution caveat) |
| R3 typed tools/structured/guardrails | 2 | 2 (coding-flavored) | **2** (+ HMAC-signed approvals, OPA policy lane) | 2 | 2 |
| **R4 checkpointing + idempotency** | 0 (no step engine, no retries/memoization) | 1 (no step engine) | **2** ('use step' memoized + auto-retried; completed steps never re-run on replay) | 2 (workflow engine) | 1 (checkpoints yes, but resume re-executes the node from its top — idempotency burden on every side-effecting node) |
| **R5 C6 tracing (full-content vendor under DPA, or self-host)** | 1 (native full-content export to one vendor; replaceable exporters) | 1 (no first-class trace-export API; build on hooks) | **2** (stable OTel, inputs/outputs on by default, any OTLP vendor w/ DPA — Langfuse verified — plus self-host fallback; WDK run data already in our DB) | 2 (traces in own PostgresStore + exporters) | 1 (LangSmith gravity; OTel buildable) |
| R6 SSE to Next.js | 2 (proven in current build) | 1 (bridge yourself) | **2** (UI message streams, `useChat`, WDK resumable streams — reconnect to a live run) | 2 | 2 (bridge yourself) |
| **R7 model-agnostic** | 1 (`aisdk()` adapter "still in beta") | 0 (Claude models only — hard fail as stated) | **2** (core identity; largest TS provider ecosystem) | 2 | 2 |
| **R8 self-host long-lived Node** | 2 | 1 (subprocess-per-session harness) | **2** (Postgres world *requires* exactly our topology; Fly named) | 2 | 2 |
| R9 MCP consumption | 2 | 2 (deepest) | 2 | 2 | 2 |
| R10 skills/progressive disclosure | 1 (buildable) | 2 (native, origin of the standard) | 1 (buildable; skills are doc-loading over our own registry) | 1 (in-progress) | 1 (buildable) |
| R11 multi-agent/background jobs | 1 (handoffs; no durable job runner) | 2 | **2** (agents-as-tools + workflows are the natural durable home for sweeps/wakes) | 2 | 2 (most explicit control) |
| **Total (decisive rows only, /12)** | **6** | **4** | **12** | 12* | 10 |
| Total (all rows, /22) | 14 | 14 | **21** | 21* | 19 |

\* Mastra ties numerically but loses on non-scorable grounds: agent-loop durability is workflow-only
(same as WDK but with a framework that also wants to own the server/studio/deployer surface we already
have), an extremely rapid release/branch cadence (hundreds of ad-hoc dist-tags) *(carried)*, and the
thinnest regulated-industry production evidence of the finalists. It is not carried to the head-to-head.

---

## 5. Head-to-head on the decisive rows (top-3 finalists)

### 5.1 AI SDK 7 + WDK (recommended) vs LangGraph JS (runner-up)

| Decisive row | AI SDK 7 + WDK | LangGraph JS | Verdict |
|---|---|---|---|
| R1 durable runs | Agent loop runs *inside* the durable engine; every step checkpointed to our Postgres; "survive crashes … durable LLM tool-call loops" | Graph state checkpointed per super-step to PostgresSaver; equally real | tie on capability; WDK's unit of durability (the tool call/step) matches our tool-centric runtime more directly than graph nodes |
| R2 days-later HITL | Hook pauses at **zero compute**, resume by token from any endpoint; approval artifacts persist in message history in our DB, HMAC-signable | `interrupt()` waits indefinitely; resume by `Command` | tie on wait semantics; WDK wins on the *artifact* (a signed, persistable approval record vs a resume value) — directly serves C4 maker-checker attribution |
| R4 idempotency | Completed steps are memoized and **never re-run on replay**; failed steps auto-retry (3×) | Resume **re-executes the interrupted node from its top**; docs mandate idempotent side effects before `interrupt` | **WDK decisively** — the exact class of bug the audit found (Grt-11's re-drive miscount) is the class LangGraph's model makes *your* permanent responsibility in every node |
| R5 C6 tracing | Stable OTel, full-content by default, vendor-flexible under DPA, self-host fallback; engine run-state observable in our own DB | LangSmith is the paved road (SaaS; self-host = enterprise tier); OTel buildable | **WDK/AI SDK** — C6 wants a *documented* story; OTel-to-any-vendor is that story |
| R7 model-agnostic | Core identity | Native | tie |
| R8 Fly long-lived Node | Postgres world *requires* it; Fly named in docs | Self-hosts anywhere | tie |
| Code ownership cost | Assembly of two layers behind our seam; determinism discipline in workflow code | Materially more hand-written orchestration code (graphs, nodes, state schemas) that we own forever | WDK smaller surface for our shape (a tool-loop agent, not a complex graph) |
| Maturity | WDK young (2025; 4.x stable, 5.0-beta); **no documented in-flight-run versioning story (verified gap)** | Post-1.0 semver-stable; strongest enterprise references (Klarna, Uber, J.P. Morgan cited) *(carried)* | **LangGraph decisively** — this is why the spike is a hard precondition and LangGraph is the named fallback |

**Net:** AI SDK+WDK wins R4 and R5 outright, ties the rest, and loses only on maturity — which a spike
+ pinning + drain policy can bound, whereas LangGraph's node-re-execution burden and observability
gravity are permanent properties of its model.

### 5.2 AI SDK 7 + WDK vs the incumbent (OpenAI Agents SDK JS)

The incumbent's honest best case: its HITL is better than the old build ever used — `RunState`
serialization to a DB with days-later resume is documented and real (§3.2). But on decisive rows:

- **R1:** serialization happens only at interruption boundaries *you* orchestrate; a crash mid-tool-chain
  loses everything since your last checkpoint. Fixing the audit's #1 pain on this SDK = building our own
  checkpoint cadence + storage + resume + re-drive machinery — the WP-015-style custom kernel again,
  now competing against a bought engine that already does it.
- **R2:** the vendor's own docs tell you to run **two SDK versions in parallel via package aliases** to
  survive a deploy while approvals are pending. Clara's approvals *normally* span deploys.
- **R4:** absent. No steps, no retries, no memoization. Grt-11's class of bug stays ours to solve alone.
- **R5:** single-vendor default export (fine under C6 *if* the owner picks OpenAI as the tracing vendor
  and executes their DPA — but it welds the tracing decision to the model decision, which R7 exists to
  keep apart).
- **R7:** model swap rides an adapter that is "still in beta" — and that adapter *is the AI SDK*. Using
  the incumbent for model-agnosticism means running the recommended stack's model layer underneath the
  incumbent's loop anyway.

**Net:** every road from the incumbent to the requirements passes through either (a) building the
durable kernel ourselves or (b) adopting the AI SDK layer anyway. Choosing the recommendation directly
is the shorter version of both roads.

### 5.3 Why not the Claude Agent SDK

Best-in-class harness (native skills — the standard `belcort/` already organizes around — subagents,
permission doctrine, deepest MCP, shipped Postgres SessionStore adapter) *(carried)*. It fails the
brief as written: **Claude models only** (R7 = 0, a stated hard requirement), Commercial ToS (not OSS),
subprocess-per-session shape for a multi-tenant DB-tool backend, and approvals are in-loop callbacks
rather than durable artifacts (R2 = 1). **Escalation flag preserved from the preliminary research:** if
the owner relaxes model-agnosticism at Gate 2, this candidate re-enters the top two and deserves a
dedicated head-to-head before Phase 3. That is an owner call; under the standing requirement set it is
eliminated.

---

## 6. Integration / seam sketch (how durable runs, interruptions, and tracing wire to Postgres)

### 6.1 Topology

```
Next.js dashboard (Vercel)
  │  SSE / fetch-streams (UI message stream; resumable via WDK readable)
  ▼
Clara agent service (Fly, long-lived Node, always-on)          ← world.start() at boot
  ├── ClaraRuntime seam (ours — the swap-seam ADR-031 preserved)
  │     startTask / streamTask / resolveInterruption / wake / pollTask
  ├── AI SDK 7: WorkflowAgent + typed tool() registry (curated db-fn tools, ported shape)
  ├── WDK engine: 'use workflow' chat/wake/sweep workflows; 'use step' tools
  │     └── @workflow/world-postgres (graphile-worker + LISTEN/NOTIFY)
  ├── @ai-sdk/otel → OTLP exporter → DPA-covered vendor (full content, per C6)
  ▼
Supabase Postgres 17 (single project)
  ├── app schemas (RLS-forced, firm_id):    books · documents · kb · chat/messages ·
  │        agent_tasks / interruptions / approvals (PROJECTION — see 6.3) · wakes_outbox
  └── engine schemas (NO grants to authenticated): workflow_* tables + graphile_worker
        — owned by a dedicated `clara_runtime` Postgres role; reached ONLY by the agent
          service over Supavisor SESSION mode (5432, IPv4) or direct IPv6; NEVER 6543.
```

Two connection planes, deliberately kept as-is where proven: the **request-path plane** stays
supabase-js on the caller's JWT (RLS; audited fns; unchanged invariant — the agent's *tools* still ride
the user/wake credential), while the **engine plane** is the world's own Postgres connection under
`clara_runtime` (engine state is not firm-facing data surface; it is protected by role + schema
isolation instead of RLS, and nothing user-reachable can query it).

### 6.2 Durable runs (kills Grt-1, Grt-2, Grt-6, Grt-8; failure patterns 2 & 5)

- Every interactive turn = `chatWorkflow(taskId, messages)` (`'use workflow'`). The WDK engine persists
  run/step/event state in `workflow_*` tables; a Fly redeploy interrupts nothing — paused runs sit in
  Postgres, active runs resume by deterministic replay over memoized steps.
- **The run executes independently of any SSE attach** (the engine drives it; the dashboard merely
  reads `run.readable`) — structurally closing the ghost-upload class (failure pattern 5) where runs
  only executed inside a stream consumer.
- `active_run_id` becomes a foreign key into a durable `agent_tasks` row (§6.3), not a pointer into a
  process Map — the reset guard keys on durable state (Grt-7's target), and a reconnect resumes the
  real run instead of reading a tombstone (Grt-8's target).
- Cross-turn continuity: messages persist as **typed `UIMessage` parts JSONB** in `chat_messages`
  (tool parts, approval parts, artifact parts are first-class parts — the persistence format *is* the
  typed history, structurally retiring the never-written `tool_calls`/`artifact` columns and the
  fence-regex reconstruction: Grt-9, Grt-10). Context packs (the Phase-2 architecture spine) are
  assembled fresh per task; the transcript is one input, not the memory model (Grt-2's target).

### 6.3 The projection layer (the DB stays the auditable source of truth)

Engine tables are vendor-shaped internals; the **app-facing registry** is ours, RLS-scoped, and written
in the same transaction boundaries as the work:

- `agent_tasks(id, firm_id, client_id, kind, workflow_run_id, status, trace_id, created_by, …)` —
  one row per task/run the firm can see; the dashboard reads THIS, never `workflow_*`.
- `agent_interruptions(id, task_id, firm_id, kind[clarify|approval], hook_token, payload, status,
  resolved_by, resolved_at, hmac_sig, …)` — one row per pending clarification/approval; `resolved_by`
  is the human credential (C4 maker-checker attribution); the HMAC-signed approval artifact from the
  AI SDK is stored verbatim.
- `wakes_outbox(id, firm_id, condition, subject, dedup_key, status, attempts, …)` — the durable wake
  queue: DB trigger inserts the outbox row; a graphile-worker job (keyed `job_key = dedup_key` for
  dedup) starts the wake workflow with per-kind tool policy. At-least-once + dedup replaces the
  unref'd in-memory timers cleared on shutdown (Grt-12's target).
- A **final `'use step'` outcome-sync step** in every workflow reconciles derived writes
  (notifications, KB proposals, recon hints, receipts) against the run's recorded tool history and
  files anything missing through the audited fns — structural post-workflow sync, not model memory
  (Grt-13/Grt-14's target). The assistant turn is persisted by a step under the task's own durable
  identity, not a fire-and-forget settle callback racing a JWT expiry (Grt-15's target).

### 6.4 Interruptions: clarify + approvals (kills Grt-5, Grt-7; serves C3/C4)

- **Clarify** = a typed tool whose `'use step'` body creates a `defineHook()` instance, inserts the
  `agent_interruptions` row (token = toolCallId, per the docs' own pattern), and `await hook` — the
  workflow parks at zero compute for hours or days; the dashboard answer POSTs to
  `resolveInterruption` → `hook.resume(token, answer)` → the loop continues **after any number of
  redeploys**. No prompt nudge holds the interview together; the pause is structural (Grt-5's target).
  A mid-interview redeploy costs nothing (Grt-7's target).
- **Approvals** = `toolApproval: 'user-approval'` (or `needsApproval` on WorkflowAgent) on every
  consequential write tool, HMAC-signed via `experimental_toolApprovalSecret`; the approval
  request/response parts persist in `chat_messages`, the artifact in `agent_interruptions`. **The
  runtime approval is UX-layer**; the C3 ruling means the audited DB fn still enforces role floors,
  plan-token/expected-revision checks, and maker≠checker on the high-stakes lane — a runtime bug can
  never bypass the law, only annoy the user.

### 6.5 Idempotency (kills Grt-11; failure-pattern-7 interaction)

Two independent layers:
1. **Engine:** completed `'use step'` executions are memoized — a replay never re-runs a completed
   posting step; a failed step retries (bounded), each retry visible in the world tables.
2. **DB:** audited write fns gain idempotency keys (`p_idempotency_key`, unique per firm+fn class) per
   the Phase-2 DB architecture, and re-drive semantics are corrected at the runner: a
   `cannot_approve:approved` RAISE on re-drive maps to *success-already-applied*, not failure — the
   exact Grt-11 fix, now expressible as a step-level catch instead of a hand-rolled runner.

### 6.6 Tracing (kills Grt-3; implements C6)

- `registerTelemetry(new OpenTelemetry())` at boot; spans `invoke_agent` / `chat` / `execute_tool`
  with `recordInputs`/`recordOutputs` **left on** (full content — the owner's C6 posture) + token usage.
- OTLP exporter → the chosen vendor endpoint (Langfuse Cloud verified viable: OTLP ingest + published
  DPA + region pinning; final vendor pick rides the Gate-2 checklist: executed DPA, firm-facing
  disclosure, PDPA cross-border check). Self-host fallback (Langfuse OSS on Fly) documented but not the
  default — C6 explicitly declined self-host-first.
- `trace_id` is threaded into `agent_tasks` and stamped on audited-fn receipts (`p_trace_id`) so a
  posted entry links to its full vendor trace — end-to-end traceability through BELCORT's own surfaces,
  which Grt-3 proved absent.
- WDK's own run/step observability data lives in **our** Postgres (world backend) with the
  `npx workflow inspect` CLI/UI — engine observability is self-hosted by construction, independent of
  the vendor lane.

### 6.7 The seam (exit ramp preserved)

All of §6.2–6.6 sits behind a thin internal `ClaraRuntime` interface (the ADR-031 swap-seam,
re-cut for durable primitives): `startTask / streamTask / resolveInterruption / pollTask / wake`.
Application and dashboard code never import WDK or AI SDK types directly. The LangGraph fallback
implements the same interface with `PostgresSaver` + `interrupt()` (its node re-execution burden then
lands inside the seam's step-wrappers, where the DB idempotency keys already protect the write path).

### 6.8 What is deliberately NOT changed by this choice

- The curated-tool law (ADR-030): tools remain a closed registry of typed wrappers over audited DB fns
  riding the caller's JWT; the structurally-read-only read surface (failure pattern 4's fix) is a DB
  design item, not a runtime item.
- The DB owns every number; the runtime owns *no* books state — only orchestration state.
- Doctrine/skills remain markdown canon loaded into instructions + progressive-disclosure tools
  (`read_skill`/`read_reference` pattern), regenerated against the live registry with a drift-lint
  (failure pattern 11) — R10 is buildable here by design, and the Agent-Skills standard is
  SDK-independent.

---

## 7. Top 3 risks of the recommendation + mitigations

1. **WDK maturity, and the undocumented in-flight-run story across deploys (the verified gap).**
   `workflow@4.6.0` is young (public 2025); a 5.0-beta line is moving; and `/docs/deploying` says
   nothing about replay compatibility when workflow code changes under live runs. For Clara this is
   acute: interviews park for days across many deploys.
   **Mitigations:** (a) the §8 spike makes redeploy-under-paused-hook and redeploy-under-active-run
   explicit acceptance criteria; (b) pin exact versions (`workflow`, `@ai-sdk/workflow`,
   `@workflow/world-postgres`, `ai`) and upgrade deliberately; (c) name-version workflows
   (`chatWorkflow_v2`) for breaking shape changes so old runs finish on old definitions; (d) a
   drain-before-deploy policy for *active* (not parked) runs — active agent turns are minutes long, so
   drain is cheap; parked hooks hold no replay position mid-step by design (steps are atomic units);
   (e) the §6.7 seam keeps the LangGraph exit ramp real, with the projection tables (§6.3) unchanged.

2. **Supabase connection topology for the engine plane.** graphile-worker needs session-grade
   connections (LISTEN/NOTIFY); Supabase direct connections are IPv6-only without the add-on; Fly↔
   Supabase IPv6 has had at least one regional incident (gru, 2026-04); engine pool (default
   `maxPoolSize` 10) + app traffic must fit the project's connection budget.
   **Mitigations:** default the world to **Supavisor session mode (5432, IPv4)** — verified to support
   LISTEN/NOTIFY; keep direct IPv6 as the fast path and the IPv4 add-on as the paid escape hatch; never
   6543/transaction mode; size `maxPoolSize`/`queueConcurrency` in the spike against the Supabase
   compute tier's connection limits; alarm on world-connection loss (a stalled worker = silent wake
   stalls — the exact failure class Grt-12 punishes).

3. **Assembly + determinism discipline (a pattern, not an appliance).** Durable HITL for agents is
   documented but composed (hooks + toolApproval + our projection tables); workflow code must keep
   non-determinism inside steps; every engineer/agent touching the runtime carries that rule; and the
   AI SDK's major-version cadence (v5→v6→v7 in ~18 months, maintained parallel lines) means periodic
   migration work.
   **Mitigations:** the `ClaraRuntime` seam confines WDK/AI-SDK idioms to one package; a lint gate on
   the runtime package (no I/O outside `'use step'`, no `Date.now()`/random in workflow bodies); golden
   replay tests in CI (record a run, replay it, assert no step re-execution); budget one maintenance
   window per AI SDK major, riding the maintained previous line until deliberate upgrade.

---

## 8. What would change the answer + the spike gate

**Changes the answer:**
- **Owner relaxes model-agnosticism (R7)** → the Claude Agent SDK re-enters the top two (native skills
  aligned with the `belcort/` canon, shipped Postgres SessionStore, deepest MCP) and deserves a
  dedicated head-to-head against this recommendation before Phase 3. This remains an owner escalation,
  deliberately preserved from the preliminary research.
- **The spike fails** (below) → **LangGraph JS + PostgresSaver becomes the recommendation** under the
  same seam and projection tables; we accept the node-re-execution idempotency burden (absorbed by the
  DB idempotency keys) and build the OTel trace exporter for C6 instead of the LangSmith paved road.
- **Phase-2 architecture rules that the durable kernel must be first-party DB schema** (the reverted
  WP-015 direction — runs/checkpoints/interruptions as our own audited tables, not a vendor engine's) →
  the framework choice collapses to "which agent loop": plain AI SDK 7 `ToolLoopAgent` over our own
  kernel is then the right pick (the model layer of this recommendation survives; the WDK layer is
  replaced by the custom kernel). The incumbent would also be defensible there, but adds nothing the
  AI SDK layer doesn't already give with better R5/R7.
- **WDK 5.0 lands with breaking world changes before Phase 3** → re-verify on the pinned 4.x line;
  adoption of 5.x is a deliberate later migration, never a mid-build drift.

**The spike (hard precondition, 1–2 weeks, before Phase-3 runtime commitment) — acceptance criteria:**
1. `@workflow/world-postgres` runs against Supabase (session mode AND direct IPv6) from a Fly machine;
   bootstrap migration applied as a release step; connection budget measured under load.
2. A clarify-style hook parks ≥48h across ≥3 redeploys and resumes correctly (the Grt-7 scenario).
3. A redeploy mid-active-run (tool loop in flight) resumes by replay with **zero** re-execution of
   completed steps (assert via step logs + a canary side-effect table).
4. A workflow-code change deployed under a parked run: old run completes correctly (or the
   name-versioning pattern is proven as the discipline).
5. Tool-approval round trip: approval request persisted in our `chat_messages`, HMAC verified,
   denial fails closed, `resolved_by` attribution lands in the projection table.
6. OTel full-content spans arrive at the candidate vendor (or a local OTLP collector standing in for
   it) with trace_id threaded into a posted entry's receipt.
7. Throughput sanity: N concurrent firm workflows × wake burst without graphile-worker starvation at
   the chosen pool size.

---

## 9. Sources (fetched 2026-07-17 unless noted)

**Versions:** npm registry via `npm view` — `ai@7.0.30`, `workflow@4.6.0`, `@ai-sdk/workflow@1.0.30`,
`@workflow/world-postgres@4.3.0`, `@ai-sdk/otel@1.0.30`, `@langchain/langgraph@1.4.8`,
`@langchain/langgraph-checkpoint-postgres@1.0.4`, `@openai/agents@0.13.4`,
`@anthropic-ai/claude-agent-sdk@0.3.212`, `@mastra/core@1.51.0`.

**Primary docs:**
- https://workflow-sdk.dev/worlds/postgres — Postgres world: production-ready self-hosted; graphile-worker; NOTIFY/LISTEN; Fly.io named; long-lived process required; config knobs.
- https://workflow-sdk.dev/docs/ai — WorkflowAgent; loop-in-workflow durability; 'use step' retries; resumable streaming transform.
- https://workflow-sdk.dev/docs/ai/human-in-the-loop — defineHook/createWebhook; zero-compute pause; "even after days of inactivity"; hook.resume token pattern.
- https://workflow-sdk.dev/docs/observability — run/step/webhook/event/stream inspection; data in the world backend; CLI/web UI.
- https://workflow-sdk.dev/docs/deploying — **verified silent** on in-flight-run versioning/replay across deploys (Risk 1).
- https://ai-sdk.dev/docs/agents/tool-approvals — toolApproval forms; approval parts in message history; addToolApprovalResponse; experimental_toolApprovalSecret (HMAC, fail-closed); needsApproval on WorkflowAgent; @ai-sdk/policy-opa.
- https://ai-sdk.dev/docs/ai-sdk-core/telemetry — @ai-sdk/otel; invoke_agent/chat/execute_tool spans; gen_ai.usage.*; recordInputs/recordOutputs default-on; GenAI semantic conventions; recommended (non-experimental).
- https://docs.langchain.com/oss/javascript/langgraph/interrupts — interrupt()/Command(resume); indefinite wait; **node re-executes from its start on resume** (quoted); idempotency warning.
- https://docs.langchain.com/oss/javascript/langgraph/persistence — checkpointers; PostgresSaver for production; MemorySaver loses on restart.
- https://raw.githubusercontent.com/openai/openai-agents-js/main/docs/src/content/docs/guides/human-in-the-loop.mdx — needsApproval/interruptions; RunState.toString()/fromString(); DB storage blessed; "interruptible for longer periods"; **parallel-SDK-versions package-alias recommendation for pending approvals across upgrades** (quoted).
- https://worker.graphile.org/docs + /docs/requirements — LISTEN/NOTIFY for job pickup; PostgreSQL 12+ and Node 22.18+; at-least-once with transactional guarantees.
- https://supabase.com/docs/guides/database/connecting-to-postgres — direct (IPv6, persistent servers) vs Supavisor session (5432, IPv4) vs transaction (6543, no prepared statements); IPv4 add-on semantics.
- Supabase Supavisor FAQ (supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI) — **session mode supports all PostgreSQL features including LISTEN/NOTIFY**.
- https://community.fly.io/t/ipv6-outbound-from-gru-to-supabase-100-packet-loss/27739 — Fly→Supabase regional IPv6 incident (2026-04), motivates session-mode default.
- Langfuse: https://langfuse.com/integrations/native/opentelemetry (OTLP ingest `/api/public/otel`, ≥v3.22), https://langfuse.com/security/dpa (published DPA; region-pinning language), EU/US/JP/HIPAA regions; OSS self-host.

**Carried from `docs/audit/evidence/runtime-research.md` (2026-07-17, cited there per-cell):** license
fields; OpenAI tracing exporter replaceability; Claude Agent SDK session-store/subprocess/ToS details;
Mastra storage domains and release-cadence observation; LangGraph production references; AI SDK major-
version cadence; MCP rows; Agent-Skills-standard adoption (secondary sources, flagged there).

**Findings base:** `findings/Grt.json` (Grt-1…Grt-15, adversarially verified: 11 CONFIRMED /
4 ADJUSTED / 0 REFUTED) · `docs/audit/00-GATE-1-README.md` failure patterns 2, 3, 4, 5, 7 ·
`docs/audit/04-gate1-decisions.md` rows C3, C4, C6, D.

---

## Addendum — 2026-07-17 owner-requested stress-test (burden of proof on EXCLUSION)

At Gate 2 the owner challenged the exclusions ("can't the Claude Agent SDK or OpenAI Agents SDK fulfill this?"). A dedicated gap-analysis lane re-fetched today's primary docs assuming the burden of proof lies on excluding them. Full analysis: `sdk-gap-analysis.md`. Outcome: **the recommendation SURVIVES, with two honest score corrections**:

1. **OpenAI Agents SDK — exclusion stands, reinforced.** The parallel-SDK-versions caveat for pending approvals is in the docs verbatim today; the new Sessions feature persists after-turn only (mid-run crash still loses everything since the last RunState serialize); no step engine shipped May–Jul; Temporal's durable integration for this SDK is Python-only (its TS lane wraps the Vercel AI SDK instead). Satisfying R1–R3 on it = rebuilding a custom durable kernel around a vendor blob with a documented version-skew hazard.
2. **Claude Agent SDK — exclusion stands on model-agnosticism (R7, verified today), BUT two matrix rows above are corrected:** (a) **R2 (HITL) is now largely NATIVE** — the shipped `defer` permission decision parks a pending tool call at process-exit and re-fires it deterministically on resume, days later, zero compute; hard limits: single-tool-call turns only (a parallel batch silently degrades through the normal permission flow — a hazard on exactly the approval gate), 30-day default session sweep, undocumented mid-run-crash semantics. (b) **R5 (tracing) is effectively satisfied** — first-class OTel export with full-content opt-ins to any OTLP vendor, Langfuse named in Anthropic's own docs. Its exclusion now rests on: R7 model-lock (every documented auth path is Claude-only) + no idempotency/step engine (R4) + the defer batch degrade + best-effort session mirroring (a dropped batch leaves ephemeral local disk authoritative) + per-session subprocess economics (~1 GiB RAM/session, Anthropic's own guidance) + Commercial ToS on the runtime. **If the owner relaxes R7, it earns a real head-to-head — and would still lose it on those grounds.**
3. **New watched fallback:** Temporal `@temporalio/ai-sdk` (TS, preview) — a second durable substrate under the same AI SDK model layer (trade: a Temporal server vs state-in-our-Postgres). Added behind LangGraph in the fallback order. Every TS durable-agent lane that emerged this quarter (WDK, Temporal ai-sdk, DBOS-under-AI-SDK) converges on the Vercel AI SDK as the model layer — independent corroboration of the model-layer choice.

---

## Addendum 2 — 2026-07-17 owner clarification: does the vision actually need the durable engine?

Asked by the owner mid-Gate-2. The honest answer recorded: **the vision does not need a "save every step" engine for its own sake — it needs three properties that such an engine is currently the cheapest proven way to obtain:**

1. **Approvals that park for days at zero cost and survive deploys** — the plan→approve gate is the product's central mechanic, and real-firm approvals arrive hours/days later. The old build lost pending interviews/approvals on every redeploy (Grt-7; the #1 verified failure class).
2. **Money workflows that cannot half-complete or double-run** — the F3 law plus the B-1 double-seed class. The DB's own idempotency keys and status gates prevent double-posting regardless (they are being built either way); the engine adds *resume-instead-of-restart*, which is both a ledger-integrity property and the 99%-labour-cut promise.
3. **Long-running work as a product feature** — close, bulk approve, recon sweeps, depreciation, carry-down are the product, not edge cases; "period-to-period continuity" is a claim about work that outlives any single process.

If Clara were a chat assistant, skip the engine. Because Clara is an OS whose workflows span days and carry money, the choice is only **buy vs hand-build**: the old build chose neither (failed), the first rebuild attempt hand-built (WP-015, reverted), this recommendation buys behind a seam with a go/no-go spike.

**2026 state of practice (primary-source-verified today):** durable execution for agents is the year's convergence — WDK, Temporal's agent integrations, DBOS, LangGraph checkpointers, and even the two challenged SDKs (OpenAI's serializable RunState; Anthropic's `defer`) all moved to the same shape: the agent loop inside a checkpointed engine, state in the operator's own Postgres, HITL as first-class parked interruptions, OTel tracing, the model layer abstracted (the Vercel AI SDK as the common model layer across WDK/Temporal-TS/DBOS lanes). The Clara architecture spine (event log + context packs + durable runs + chat+workbench over one DB-authoritative state layer) matches the current best-practice shape for agentic SaaS / AI-OS products.

---

## Addendum 3 — 2026-07-17 Codex cross-model verdict (gpt-5.6-sol, xhigh, read-only)

Full verdict: `codex-cross-check.md`. **Q1: CONCUR** with AI SDK 7 + WDK and both exclusions, conditional on the spike, with three refinements adopted into this recommendation:

1. **Step memoization is NOT exactly-once** (the strongest counter-argument, conceded): a SECURITY DEFINER posting fn can commit and the worker die before WDK records step completion — replay may re-invoke the step. DB idempotency keys on every mutation (stable operation key + uniqueness + return-original-receipt-on-duplicate) are **permanent and mandatory**, not a belt-and-braces extra. **New mandatory spike test:** kill the worker immediately after the financial transaction commits but before step-completion is recorded; prove replay produces ONE posting and the SAME receipt.
2. **Self-hosted Postgres World does not document the deployment-pinning guarantee the managed Vercel World does** — assume explicit workflow-name versioning + retention of old workflow code for the maximum parked-run lifetime, unless the spike proves stronger.
3. **Model-agnosticism (R7) reframed: over-weighted as a hard veto.** Keep the provider seam (the AI SDK abstraction is comparatively cheap and useful — technical substitutability, not behavioral equivalence) and a tested exit plan, but drop R7 as a decisive disqualifier. **This does not change the winner:** the Claude Agent SDK still loses on independent grounds (no step/idempotency engine, defer's silent non-park on parallel tool calls — structurally mismatched with Clara's loop, best-effort mirroring, subprocess economics, Commercial ToS).

**Q2 (tracing): Codex recommends REVERSING blanket full-content vendor export by default.** Launch `Clara → self-hosted OTel collector → Clara-controlled trace storage` with the cloud exporter disabled; enable a **minimized** vendor feed only after the contractual gates pass (executed DPA, subprocessor/security review, documented cross-border basis, **client-facing authorization** — MIA By-Laws prohibit disclosure outside the firm without proper and specific authority, and a DPA regulates the processor but does not itself confer that client authority — short explicit retention, tested deletion, SSO/MFA, field-level minimization). No production trace containing client books may be exported before the DPA is in force; debugging convenience is not a defensible exception. Cited: Langfuse DPA + retention docs, MIA By-Laws (confidentiality), Malaysian cross-border guidance.
