# Clara runtime route audit

Date checked: 2026-09-09 (Asia/Kuala_Lumpur)  
Decision input: [验证统一 Clara agent harness 与持久化执行的实施路线](https://github.com/BELCORT-SDN-BHD/clara/issues/607), including the [latest combined proof](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5587678356)  
Status: root adopted this first-successor route in the [2026-09-09 decision](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5588548302); no production runtime or dependency was changed

## Recommendation

Resolve the Wayfinder choice in favour of a **new frozen Workflow 4 successor that runs a bounded AI SDK `ToolLoopAgent@7.0.77` adapter**. Keep Clara's Postgres-backed Workflow lifecycle, hooks, SSE endpoint and database business doors. Treat `WorkflowAgent` on a coherent Workflow 5 release as the next engine migration behind the same invocation, tool and receipt contracts.

The fair native comparator changes the evidence, but does not change this recommendation. `@ai-sdk/workflow@1.0.70` is genuinely Workflow 4-compatible and gives materially finer durable boundaries: the provider-free compiled run recorded each model call and a step-marked tool separately. Its exact `ai@7.0.69` dependency, however, predates vendor fixes for WorkflowAgent partial-output reset on model-step retry, callback isolation and duplicate stream-part IDs. Selecting it raw would accept those gaps; selecting it with an override or backport would create a Clara-owned compatibility line. The reproducible comparator is checked in under [`prototypes/native-workflowagent-v1`](prototypes/native-workflowagent-v1/README.md).

The remaining production checks are implementation acceptance for the selected route, rather than unresolved route feasibility. The latest v4 harness proof at local commit `2d34cd3e` runs installed `ai@7.0.77` `ToolLoopAgent` inside a compiled `workflow@4.8.4` step against `@workflow/world-postgres@4.3.4`. It covers process restart, commit-before-step-checkpoint replay deduplication, synthetic Postgres cancel/authority/period ordering, KB-only revision change and chat basis. It still uses a mocked model and synthetic global operation key; it does **not** prove current Clara RLS/business SQL, a tenant/payload-bound operation key, revoke-after-effect-before-checkpoint, multi-worker delivery or two-image rollback. This report keeps those as explicit gates.

Clara's declared stack is internally misaligned at the runtime floor: `packages/runtime/package.json:18-28` installs AI SDK 7.0.77, Workflow 4.8.4 and Postgres World 4.3.4, but `package.json:8-10` and `packages/runtime/Dockerfile:8,35` still declare Node 20 while AI SDK 7 requires Node 22. The recorded Node 22 Nitro build/typecheck reduces build uncertainty but does not replace a Linux image and hosted smoke test.

## Exact route comparison

| Route | Exact compatibility on 2026-09-09 | Evidence and consequence | Disposition |
|---|---|---|---|
| Workflow 4.8.4 + Postgres World 4.3.4 + installed AI SDK 7.0.77 `ToolLoopAgent` | Uses the repository's installed packages. `ToolLoopAgent` is a reusable bounded tool loop with instructions, tools, `prepareStep`, server context and stop conditions; the default is 20 steps, but Clara should set a smaller explicit budget. | The compiled restart rig passed the narrow integration. Workflow durability is at the enclosing step boundary; database receipts still protect effects if the process dies after commit and before the step checkpoint. [Official `ToolLoopAgent` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent) | **Select.** Implement as a new frozen successor, initially beside v17. |
| Workflow 4 + `@ai-sdk/workflow@1.0.70` `WorkflowAgent` | Published stable W4 line; Node 22; exact `ai@7.0.69`. Its source places each model call in `doStreamStep`; a tool is an independent durable step only when its execute function carries `"use step"`. `generate()` is unimplemented, so Clara would use `stream()`. | The isolated W4 compiler/runtime test passed two model calls plus a step-marked synthetic receipt tool and recorded five checkpoints. A second test verified that its custom loop does not execute a tool call with `content-filter` finish reason. This is a real replay-granularity advantage. It still needs Clara's outer hook/answer/cancel/receipt orchestration. Raw AI 7.0.69 lacks the later WorkflowAgent partial-output retry reset and other stream fixes described below. [Reproducible comparator](prototypes/native-workflowagent-v1/README.md), [1.0.70 registry metadata](https://registry.npmjs.org/@ai-sdk%2fworkflow/1.0.70), [2.0 migration entry](https://github.com/vercel/ai/blob/main/packages/workflow/CHANGELOG.md#200) | Viable only behind an explicitly pinned AI 7.0.69 package boundary plus retry mitigation/backport ownership. Its finer checkpoints are material, but the raw published combination is not the safest default. |
| `@ai-sdk/workflow@2.0.24` `WorkflowAgent` + Workflow 5 beta | Requires Node 22, `ai@7.0.93` and `workflow@^5.0.0-beta.42`; a coherent checked set used Workflow beta.47 and Postgres World beta.40. The advertised Workflow beta.48 metadata names unpublished `@workflow/nest@5.0.0-beta.48`. | Current `WorkflowAgent` adds a durable-agent integration, but its package source exposes `stream()` while `generate()` still throws “Not implemented”; tool code is durable only when it is explicitly a Workflow step. This is a Workflow runtime/world/build migration, not a refactor of the loop alone. [Current package manifest](https://github.com/vercel/ai/blob/main/packages/workflow/package.json), [WorkflowAgent guide](https://ai-sdk.dev/docs/agents/workflow-agent), [Workflow v4→v5 migration](https://github.com/vercel/workflow/blob/main/skills/migrating-workflow-v4-to-v5/SKILL.md), [beta.48 registry metadata](https://registry.npmjs.org/workflow/5.0.0-beta.48) | Later migration candidate. The coherent beta.47/beta.40 set is available; require its own Nitro/Linux/Postgres restart and old-run migration evidence before adoption. |

The deprecated `@workflow/ai` `DurableAgent` is not a fourth route: its Workflow 4 release peers on AI SDK 6, and the vendor directs new durable-agent work to `WorkflowAgent`. [Official deprecation notice](https://github.com/vercel/workflow/blob/main/docs/content/docs/v4/api-reference/workflow-ai/durable-agent.mdx)

Package versions above come from the committed manifests/lockfile plus read-only npm registry metadata on the check date. “Published” or “imports” is not evidence of Clara runtime compatibility.

## Native WorkflowAgent v1 comparator

The isolated package pins `@ai-sdk/workflow@1.0.70`, `ai@7.0.69`, `workflow@4.8.4` and `@workflow/world-postgres@4.3.4`; it compiles and runs under Node 22.23.0 with Workflow's Vitest world and a serializable injected model. No provider was called. The main loop persisted five completed steps: model call, receipt tool, tool-result stream write, second model call and stream close. That is finer recovery than placing an entire `ToolLoopAgent` loop inside one Workflow step. It can avoid repeating already-checkpointed model calls and step-marked tools.

The registry publication history shows a stable 1.0.0 on 2026-06-25 followed by 70 patch releases through 1.0.70 on 2026-08-19; 2.0.0 was published on the same day as 1.0.70. This is evidence that v1 was actively patched before the Workflow 5 transition. It is not an ongoing v1 maintenance promise. [Registry history](https://registry.npmjs.org/@ai-sdk%2fworkflow)

The advantage has limits. Plain tool functions are not separate Workflow steps; provider objects and non-serializable closures still cannot cross Workflow boundaries; WorkflowAgent does not replace Clara's database doors, receipt keys, interruption admission or Work lifecycle. The test used a synthetic receipt and local Workflow test world, so it does not establish Postgres restart or Clara authority behavior.

The package's exact AI dependency is a substantive boundary:

- AI 7.0.70 added `reset-step` handling so WorkflowAgent retries clear partial UI message parts. AI 7.0.69 and WorkflowAgent 1.0.70 do not contain that reset path. Native v1 would therefore set model-call retries to zero and let an outer durable policy retry cleanly, or own a tested backport before streaming production output. [AI changelog](https://github.com/vercel/ai/blob/main/packages/ai/CHANGELOG.md), [retry fix](https://github.com/vercel/ai/commit/d3cc3fe)
- AI 7.0.70 also prevents generic AI SDK automatic tool execution after an unsafe finish reason. WorkflowAgent v1's custom loop already executes its collected tool calls only when the model finish reason is `tool-calls`; the comparator's `content-filter` case did not execute the tool. That narrow result does not establish every AI core call site. [unsafe-finish fix](https://github.com/vercel/ai/commit/a828527)
- AI 7.0.71 isolates `onChunk`/`onError` callback failures, and 7.0.76 avoids duplicate text/reasoning IDs. These remain relevant for consumer robustness even though the comparator did not exercise them. [AI changelog](https://github.com/vercel/ai/blob/main/packages/ai/CHANGELOG.md)

A native-v1 route must not silently override the vendor's exact `ai@7.0.69` dependency. A dedicated workspace package can retain AI 7.0.69 for a new successor while old v1-v17 code keeps root AI 7.0.77, but the build must prove two-copy resolution. Model, tool, message and schema types stay inside that package; shared plain tool objects are adapted explicitly rather than assumed compatible across copies. The compiled Nitro bundle, lock graph and frozen-body resume test must confirm which AI copy each workflow body actually imports. This isolation is feasible, but it is a maintenance cost absent from the selected ToolLoop 7.0.77 route.

## Contract and ownership

The successor should accept one serializable, versioned invocation envelope:

- `work_id`, optional `conversation_id`, tenant, client and initiating actor IDs;
- workflow/harness version, instruction-bundle version and digest, selected skill IDs and versions, tool-registry version;
- authority, Client KB and books revisions used to plan; model identifier and explicit segment/tool budgets;
- a stable operation key namespace. Connections, functions, provider objects and credentials are reacquired server-side and never serialized into the envelope.

Ownership should be explicit:

| Owner | Responsibilities |
|---|---|
| Frozen instruction and skill bundle | Product behaviour, accounting procedure and response rules for that harness version. Skills select reasoning/procedure; they do not grant tools or permissions. |
| Server-owned tool registry | Maps immutable tool IDs/schemas to least-privileged implementations and filters exposure by Work kind/capability. Registry version is recorded on the Work/run. The model cannot add tools or widen scope. |
| `ToolLoopAgent` | Model calls, bounded plan/tool/replan loop, schema feedback and model-visible recoverable errors. It never decides tenant access, period locks or whether a financial write committed. |
| Workflow 4 | Durable run identity, frozen body, step checkpoints, hook parking/resume, retry scheduling and engine stream. It does not become the accounting source of truth. [Workflow/step model](https://workflow-sdk.dev/docs/foundations/workflows-and-steps), [hooks](https://workflow-sdk.dev/docs/foundations/hooks) |
| Clara Postgres doors | Live tenant/role/period/authority checks, locks, accounting invariants, revision comparison, idempotency receipts, interruption admission, cancel intent and audit. A returned durable receipt is the success signal. |
| Canonical Work | Owns status, interruption, activity, evidence and receipts. Chat is an input/explanation surface attached to Work; archiving or later deleting chat must not erase or cancel the Work or its minimum audit basis. |

This produces shared reasoning across Home, Work and chat without maintaining separate assistants. Every surface addresses the same `work_id`; a conversation can add input to it, while durable state and action receipts remain on Work.

## What Clara already has

| Boundary | Current evidence | Assessment |
|---|---|---|
| Admission and live session visibility | `packages/runtime/src/chatRoutes.ts:213-298` authenticates, checks live session access, atomically admits by `turnKey`, and starts only a queued, unbound task. `packages/runtime/lib/authz.mjs:180-220` masks missing/foreign/private task and session access. | Reuse. The successor needs a Work-shaped admission adapter; it does not need a second permission system. |
| Late/reconnected stream | `packages/runtime/src/streamRoute.ts:28-202` replays from index 0, re-authorizes on each poll, distinguishes revocation/detach/terminal state and uses persisted assistant parts as final state. | Reuse the security/final-state contract. An SDK chat transport is not a substitute. |
| Answer admission | `packages/db/migrations/0006_runtime_core.sql:861-890` requires bookkeeper+, reserves an operation receipt, locks the interruption, accepts only pending/unexpired state, audits and notifies. | Existing first-answer/idempotency gate is real. Raw `resumeHook` accepting another payload is not a Clara answer-admission defect. |
| Answer delivery | `packages/runtime/lib/control.mjs:63-114` leases terminal interruptions, resumes outside the transaction and stamps `delivered_at`; `packages/runtime/tests/control-lease.test.mjs:48-126` covers normal, expired lease, synthetic single-shot HookNotFound and transient failure paths. | Real durable mechanism with a race gap: the final stamp checks neither claimant nor lease; a slow worker can stamp after another claimant reacquires. HookNotFound alone is not proof that the same Clara interruption/payload won. |
| Cancellation | Latest `clara.cancel_agent_task` in `packages/db/migrations/0133_g1_wake_engine.sql:567-613` locks the task, reserves a receipt, cancels pending interruptions and moves active work to `cancel_requested`. `packages/runtime/lib/control.mjs:121-157` calls engine cancel, then settles. | Reuse intent and receipt semantics. The route still needs a tested commit fence so a newly admitted business action cannot begin after cancel wins; an already committed receipt remains authoritative. |
| Agent loop and freshness | `packages/runtime/workflows/chatTurn.v17.ts:67-155` loads task/context once, then runs up to 12 segments and parks on a hook. `chatTurn.v17.impl.ts:93-170` executes a handwritten `streamText` loop inside one step with an eight-step model budget. The initial context pack is fetched once in `chatTurn.v10.impl.ts:108-139`. | `ToolLoopAgent` can replace loop plumbing. The successor must reread relevant authority/KB/books inside each action and after a park; the initial prompt/context snapshot is advisory. |
| Tools and frozen versions | `chatTurn.v17.tools.ts:156-184` composes a code-owned registry. `registry.ts:1-7,56-105,573-646` pins new admissions and retains v1–v17 exports. | Preserve frozen successors; add an explicit manifest for instructions, skills and registry rather than hiding those versions in imports alone. |
| Chat retirement | `packages/db/migrations/0174_web_reads_and_small_doors.sql:633-687` implements author-only, one-way archive; running streams and turns remain usable, and deletion does not exist. | Archive is implemented. Accepted future deletion with a minimal retained Work basis is a product/implementation gap, not an SDK route question. |

The Codebase Memory graph was checked first and source was then read for all cited files. Its 2026-09-08 index reported changed metadata and partial SQL/one TypeScript parse ranges, so no exhaustive security claim rests on graph coverage.

## Retry and error contract

| Category | Agent/Workflow behaviour |
|---|---|
| `invalid_input` | Return structured field/schema evidence to the model and allow correction within an explicit per-segment budget when no effect occurred. Choose measured defaults in the formal spec; do not turn every tool error into a user question. |
| `state_changed` | Reread trusted authority/KB/books state and rebuild relevant context within the bounded replan budget. Preserve logical operation identity; a changed proposal must not create a second committed effect. |
| `conflict` | Retry only when the database result says the operation is safely rebasable or the receipt replays; otherwise park with the concrete conflict. |
| `unavailable` / transient infrastructure | Throw the engine's retryable error with bounded backoff. Do not invite the model to guess around an unavailable database/provider. |
| `not_authorized`, `period_locked`, `policy_denied` | Non-retryable for that action. Explain the existing policy/result and stop or park only when human input can actually change it; do not invent another approval ceremony. |
| `cancelled` | Stop scheduling new model/tool work. Preserve committed receipts and settle after the atomic operation boundary. |
| internal/invariant failure | Fail the run with a stable code and operator evidence; never translate it into confident accounting prose. |

Every tool attempt must log run/work/tool IDs, registry/instruction/skill versions, operation key, input digest, revisions observed, receipt or refusal code and timing. Sensitive payloads remain in the domain record, not duplicated into generic telemetry.

## Acceptance gates after choosing the route

These gates can be assigned to implementation without leaving the architecture choice open:

1. Build a frozen successor (for example, v18) with the versioned envelope and explicit budgets. Allocate a stable logical operation identity server-side, scoped to firm, client, Work and the intended operation; retain it across retries, relevant replans and recovery. Bind each admitted attempt's payload digest and execution manifest separately. A changed payload or harness version must not silently mint a new identity that repeats an already committed effect: resolve its receipt or return a conflict. A correction is a distinct, explicitly linked operation; no-effect replans may use versioned attempts under the same logical intent. Run this through the **current migrations and least-privileged Clara roles**, proving role revocation, client isolation, period lock, authority/KB-only changes, books changes and receipt replay. The synthetic rig is insufficient for this claim.
2. Fix delivery ownership: condition the delivered stamp on `claimed_by` and its active lease (or an equivalent delivery token), keep batches short or renew leases, and fault-inject two slow workers plus crashes before/after `resumeHook`.
3. Test cancellation against a real business door at barriers before lock, after lock/before commit and after commit/before engine checkpoint, including revocation after the effect commits but before the engine checkpoints it. The winning database transaction defines whether a receipt exists; cancellation blocks later actions. Replay under revoked read access must not reveal the receipt or repeat the effect, and neither revocation nor cancellation may erase the committed accounting truth.
4. Promote Node 22 through root engines, Docker/Fly and CI. Run the Nitro production bundle in the Linux image with Postgres World, then a multi-host restart and late SSE replay smoke test.
5. Exercise a real two-build cutover. Build A exports v1–v17. Build B exports v1–v18 and pins v18; a parked v17 resumes after B, while new work binds v18. Do not deploy A as rollback while v18 is non-terminal. Either drain v18 first or use a rollback-compatible build C that still exports v18 but repoints new admissions to v17.
6. Verify chat archive and eventual deletion do not cancel Work, and that the retained Work basis can still explain status, evidence and committed receipts without the transcript.
   For the selected coarse ToolLoop step, also fault-inject partial output before a restart: reconcile attempt/segment identities, abandon or replace incomplete prose, replay receipt-backed final state and preserve one consistent transcript. AI 7.0.77's library fixes alone do not prove this Clara adapter behavior. Measure repeated model work and cap the replay cost before choosing the segment budget.
7. If the implementation departs from the selected route for native v1, prove the isolated AI 7.0.69 dependency in the production bundle, disable or backport the affected model-step retry path, and resume both an old AI 7.0.77 body and a new AI 7.0.69 body after restart. Passing the provider-free comparator alone is insufficient.

The existing `packages/runtime/tests/version-cutover-e2e.mjs:207-365` already proves two named bodies parked/resumed on their original names in **one compiled build**, registry pinning, hash locks and a live non-terminal inventory refusal. It does not launch build A, build B and a rollback image, so gate 5 is narrower and concrete rather than a reason to reconsider the loop choice.

The self-hosted Postgres World is the vendor's reference embedded worker and may need a more robust separated worker topology in production; this is an operational scale decision independent of ToolLoopAgent versus WorkflowAgent. [Official stable Postgres World README](https://github.com/vercel/workflow/blob/stable/packages/world-postgres/README.md)

## Remaining decision fog

No unresolved technical fact found here requires keeping the Wayfinder choice open. The native-v1 experiment resolved its feasibility and exposed a genuine advantage together with a concrete maintenance boundary. The selected ToolLoop route accepts coarser Workflow replay because database receipts protect effects and keeps the corrected AI 7.0.77 line already installed. Two later decisions have bounded triggers:

- Reconsider Workflow 5 using a coherent pinned set (the beta.47/beta.40 candidate already exists) when it passes the same real-Clara and two-build gates and its finer replay boundaries justify that migration. A broken latest tag is not a claim that every Workflow 5 combination is unavailable.
- Choose the production Postgres World worker topology from measured concurrency, recovery time and operational ownership. The current embedded reference implementation is evidence of function, not scale.

If the team deliberately accepts ownership of a frozen AI 7.0.69 boundary and the retry mitigation, native v1 is the stronger W4-native durable loop because of its per-model and per-step-marked-tool checkpoints. That is an explicit maintenance trade rather than a missing experiment or a reason to leave issue 607 undecided.

## Primary sources

- [AI SDK `ToolLoopAgent` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [AI SDK `WorkflowAgent` guide](https://ai-sdk.dev/docs/agents/workflow-agent)
- [AI SDK changelog](https://github.com/vercel/ai/blob/main/packages/ai/CHANGELOG.md)
- [`@ai-sdk/workflow` source and manifest](https://github.com/vercel/ai/tree/main/packages/workflow)
- [`@ai-sdk/workflow` changelog](https://github.com/vercel/ai/blob/main/packages/workflow/CHANGELOG.md)
- [Workflow v4→v5 migration guide](https://github.com/vercel/workflow/blob/main/skills/migrating-workflow-v4-to-v5/SKILL.md)
- [Workflow hooks](https://workflow-sdk.dev/docs/foundations/hooks) and [workflows/steps](https://workflow-sdk.dev/docs/foundations/workflows-and-steps)
- [Stable Postgres World README](https://github.com/vercel/workflow/blob/stable/packages/world-postgres/README.md)
- [Issue 607 combined restart checkpoint](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5587678356)
- [Reproducible native-v1 comparator](prototypes/native-workflowagent-v1/README.md)
