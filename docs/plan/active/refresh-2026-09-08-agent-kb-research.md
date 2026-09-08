# Clara agent runtime and client knowledge research

**Research date:** 2026-09-08 (Asia/Kuala Lumpur)  
**Scope:** Evidence and architectural options for the refresh. This report makes no adoption decision. Package tags, beta status, and hosted-service terms are a point-in-time observation.

## Answer in one page

One coherent Clara agent is technically feasible. AI SDK 7's `ToolLoopAgent` supplies a reusable model/tool loop, while `@ai-sdk/workflow`'s `WorkflowAgent` adds durable model calls, serializable context and streaming on Workflow SDK. Tool execution is durable when implemented through Workflow steps; approval output is not automatically a parked run. A single user-facing agent can plan across bookkeeping, close, reporting, and knowledge tools without a classifier workflow deciding which separate assistant owns the request.

That coherence should be a product and orchestration property, not a transfer of accounting authority to one prompt. Clara's database permissions, expected-basis checks, idempotency keys, versioned evaluators, write receipts, and approval records remain the authority boundary. Classifiers, extractors, verifiers, and evaluators can become typed tools or bounded subroutines behind one agent, while deterministic workflows still own consequential state transitions.

The native durable route is not compatible with Clara's installed dependency set today. Clara pins `ai@7.0.77`, `workflow@4.8.4`, and `@workflow/world-postgres@4.3.4`; it installs neither `@ai-sdk/workflow` nor `@workflow/ai`. The current `@ai-sdk/workflow@2.0.24` requires `ai@7.0.93` and peers on `workflow@^5.0.0-beta.42`. Workflow's current package tag is `4.8.5`, while its v5 line is still `5.0.0-beta.48`. Adopting `WorkflowAgent` is therefore a Workflow 5 beta migration, not a drop-in refactor. The older `@workflow/ai@4.2.1` peers on AI SDK 6 and Workflow 4.8.5, so it is also incompatible with Clara's AI SDK 7 baseline.

“Google OKF” is identifiable as Google's **Open Knowledge Format**, announced as v0.1 on 2026-06-12 and revised to v0.2 on 2026-07-24. It is a small Markdown/YAML interchange format, not a knowledge runtime or access-control system. Its provenance, verification, freshness, lifecycle, and attestation fields are useful for a portable projection of Clara's client knowledge, but Clara still needs its database index, object custody, row-level tenant controls, citations, and audited compiler.

## Repository baseline

The installed versions below come from [`packages/runtime/package.json`](../../../packages/runtime/package.json), not from old research branches or registry defaults.

| Package/capability | Clara pin | Registry observation on 2026-09-08 | Consequence |
|---|---:|---:|---|
| `ai` | `7.0.77` | `7.0.93` | `ToolLoopAgent` exists locally; current `@ai-sdk/workflow` expects a newer AI SDK patch. |
| `workflow` | `4.8.4` | stable `4.8.5`; beta `5.0.0-beta.48` | Current durable agent integration requires the v5 beta line. |
| `@workflow/world-postgres` | `4.3.4` | stable `4.3.5`; beta `5.0.0-beta.40` | A v5 evaluation must include Postgres-world migration and replay/rollback evidence. |
| `@ai-sdk/workflow` | absent | `2.0.24` | The supported AI SDK 7 durable agent package is not installed. |
| `@workflow/ai` | absent | `4.2.1` | Its peers are AI SDK 6 and Workflow 4.8.5; it is not an AI SDK 7 bridge. |

Clara already runs versioned Workflow SDK functions, streams with `streamText`, exposes SSE through its runtime, resumes interview hooks, and freezes deployed workflow bodies and their relative-import closures. The architecture requires successor versions for behavior changes and retention of every version referenced by a non-terminal run. It also says tools are hand-authored, versioned registrations; generating the catalog from the database registry remains a target. The present `autoDraft.v10` is an explicit `streamText` tool loop inside a workflow rather than a `ToolLoopAgent` or `WorkflowAgent` instance.

This baseline matters because a durable-agent experiment must preserve Clara's current workflow-name registry, frozen-body policy, Postgres world history, deploy/rollback compatibility, and Fly/Nitro streaming path. A package example succeeding in a fresh Next.js app would not establish those properties.

## What the Vercel stack provides

### Coherent loop and tool registry

`ToolLoopAgent` is AI SDK's reusable loop around a model, instructions, typed tools, tool choice, active-tool filtering, step preparation, structured output, callbacks, and stop conditions. Its default stop condition is 20 steps. A loop ends when the model stops calling tools, calls a tool without an executor, reaches an approval request, or satisfies a configured stop condition. `prepareStep`, `runtimeContext`, and `toolsContext` support dynamic tool exposure and server-side context without placing every value in the prompt.

`WorkflowAgent` implements substantially the same agent interface inside Workflow. Current package source additionally exposes `prepareCall`, `repairToolCall`, lifecycle callbacks, active tools, typed tool context, and a workflow-level approval policy. Tools can execute as durable Workflow steps or as workflow-level code when they need primitives such as hooks and sleep.

Neither class is an `AGENTS.md` or filesystem skill loader. A coherent Clara harness would still need a versioned instruction/skill compiler that resolves allowed skills, validates their metadata, records the exact compiled prompt/tool roster, and progressively discloses content. Prompt text and skills cannot grant database privileges.

### Retries and bounded self-repair

The durable agent's model call is a persisted Workflow step. The current package defaults retryable model calls to two retries and respects `Retry-After`; it avoids stacking the Workflow step retry count on top of the model retry setting. A tool marked `"use step"` is persisted and retried separately by Workflow. Workflow step functions default to three retries, and its docs warn that retryable side effects must be idempotent. Serialization failures are deterministic and are not retried.

Current `WorkflowAgent` source converts tool execution failures into model-visible tool-error results, so the next model step can revise its plan. `repairToolCall` has a narrower role: it repairs a tool call that failed parsing or schema validation. These mechanisms can support a bounded self-repair loop, but they do not prove correctness. For Clara, retry budgets, loop budgets, monotonic progress checks, and an explicit park/escalate outcome should cap recovery. Financial writes must be idempotent and revalidate authority and the expected books version on every execution.

Workflow uses event sourcing to rebuild state after interruption. The v5 docs state a 25,000-event limit per run for Local and Vercel Worlds, so an indefinitely lived “one agent run per client” needs rollover or compaction rather than an unbounded loop.

### Human approval and resume

Core AI SDK tool approval returns an approval request and stops that generation. The application collects a decision, appends a tool-approval response to the message history, then calls generation again. `useChat` exposes `addToolApprovalResponse` and stream-resume support.

Correction after inspecting the owner's prior fact-check and the published `@ai-sdk/workflow@2.0.24` source: `needsApproval` writes approval requests, closes the stream according to its options, and returns from `stream()` (`src/workflow-agent.ts:2571–2594`). It does not itself await a Workflow hook. The caller must persist the request/history and arrange continuation; whether the enclosing run ends depends on the caller. Signed approval payloads are supported through an environment-backed secret and the approved tool, arguments, policy and signature are revalidated before execution. This hardening arrived in `@ai-sdk/workflow@2.0.16`, coupled to `ai@7.0.86`; it is not available on a hypothetical `2.0.7` integration aligned to Clara's `ai@7.0.77`.

Workflow hooks are a separate durable primitive for arbitrary external input. A hook has a resumable token and serializable payload; an API route can call `resumeHook`. A tool that creates or awaits a hook must execute at workflow level rather than inside a `"use step"` function. Clara should represent approval as a durable action request bound to tenant, client, actor, tool name, normalized arguments, expected state version, expiry, and one-time receipt. Approval should authorize a subsequent checked execution, not freeze an old database snapshot into authority.

### Streaming and context

Workflow streams survive request and process interruption and can be read again by run ID. `WorkflowAgent` can stream UI-message chunks, and the integration provides `WorkflowChatTransport` plus model-to-UI transforms. Its documentation calls out cursor/index handling and the need to write user-message markers when modeling an entire multi-turn conversation inside one run. Those are integration obligations for Clara's existing SSE detach/reattach path.

Core `ToolLoopAgent` context may contain ordinary server values. Durable `WorkflowAgent` `runtimeContext` and `toolsContext` cross step/replay boundaries and therefore must serialize; clients, functions, class instances, and live database handles do not belong there. Clara should pass stable identifiers, policy snapshots, and version tokens, then acquire credentials and connections inside least-privileged tool execution.

Workflow v5 documents deployment pinning for active runs on its managed world: a run resumes against the deployment that started it, and removing that deployment can strand it. This report did not establish equivalent deployment pinning for Clara's self-hosted Postgres world. Clara's existing frozen exports and image rollback discipline must remain the proven control until Postgres-world behavior is tested directly.

### Maturity caveat

The package surface is moving quickly. `@ai-sdk/workflow` 2.0.0 dropped Workflow 4 support and moved to Workflow 5 while Workflow 5 remained on the beta tag. Versions 2.0.8 through 2.0.24 then fixed approved-input revalidation, signed approvals, approval context, tool errors, abort propagation, active-tool handling, context types, preserved tool behavior/results, structured output, and callback types. That is useful evidence of active maintenance and also evidence that a prototype must pin exact versions and exercise the failure paths Clara relies on.

Context7's Workflow v5 corpus still returned `DurableAgent` examples from `@workflow/ai` alongside newer AI SDK `WorkflowAgent` material. Package manifests, current source, and changelog are the stronger compatibility evidence.

## Knowledge architecture evidence

### Karpathy's gist

Andrej Karpathy's 2026-04-04 gist proposes replacing repeated raw-document RAG with a persistent, compiled, interlinked Markdown wiki. Its three layers are:

1. immutable raw sources as truth, read-only to the agent;
2. an agent-maintained Markdown wiki; and
3. a co-evolved `CLAUDE.md`/`AGENTS.md` schema and workflow guide.

It names ingest, query, and lint operations, plus `index.md` for progressive discovery, `log.md` for chronological changes, and Git for history. The gist describes success at a moderate scale of roughly 100 sources and hundreds of pages. It is a design note, not a tenant-isolation, provenance, security, or accounting-control standard.

### Google's Open Knowledge Format

Canonical-source correction from the [Client KB format recheck](refresh-2026-09-08-kb-format-recheck.md): the maintained repository is now `GoogleCloudPlatform/open-knowledge-format`; the old `knowledge-catalog/okf` copy is a frozen snapshot. Current specification version remains v0.2, with full offset-bearing ISO datetime requirements. Earlier blog examples and old-repository links are historical references, not the maintained specification.

The exact Google term is **Open Knowledge Format (OKF)**. The current public specification is v0.2. An OKF bundle is a directory of UTF-8 Markdown files with YAML frontmatter. `type` is the only always-required concept field; `index.md` and `log.md` are optional. The specification intentionally does not prescribe storage, query infrastructure, a schema registry, or a runtime.

OKF v0.2 adds optional fields and conventions for:

- source provenance, including stable source IDs and per-claim Markdown-footnote joins;
- `generated` and `verified` actors/timestamps;
- derived trust tiers, while stating that trust signals are advisory and not access control;
- lifecycle state and absolute `stale_after` time;
- attested computations with executor receipts and deterministic attesters.

Google's later Knowledge Catalog article explicitly separates the portable bundle from organization-wide serving, discovery, search, ownership, and IAM. That distinction maps well to Clara: OKF can be an import/export or compiled-view contract, while Clara's database and private object storage remain the governed system of record.

### Inference for Clara's client knowledge base

A practical Clara compiler can retain the existing three-layer architecture and add a typed, tenant-aware compilation boundary:

```text
immutable client sources + effective-dated public authorities
                |
        extract / normalize / cite
                v
tenant-bound knowledge claims in DB + content-addressed page bytes
                |
        compile / index / lint
                v
OKF-shaped Markdown projection + index summaries + agent skill/context packs
```

The compiled view should carry `tenant_id`, `client_id` or firm scope, source object/version/hash, extraction engine and version, claim-level citations, generator, verifier, effective dates, stale-after policy, lifecycle state, and compilation manifest/hash. Tenant and client scope should be enforced before retrieval and compilation; an ID included only in prompt text is insufficient. Global Malaysian authorities, firm policy, and private client facts should be distinct source classes with explicit precedence and no cross-client synthesis.

`AGENTS.md` should describe stable operating rules and how to discover skills. Domain skills should package procedures and progressive context. Frequently changing client facts belong in the governed knowledge store and context packs, not in a shared repository instruction file. A query should record the exact knowledge version and citations used so a later audit can reconstruct the answer.

OKF's attested-computation shape is interesting for reporting and tax explanations, but it should reference Clara's existing versioned evaluator and receipt rather than allow Markdown to define an executable financial authority. A model-written page remains untrusted knowledge until a deterministic or human verifier records a check.

## Architectural options to evaluate

| Option | What it proves | Main cost/risk |
|---|---|---|
| Keep Workflow 4 and build a coherent facade around current versioned workflows/tools | Product coherence, tool-registry design, instruction/skill compilation, and bounded repair can be tested without an engine migration. | The loop, approval continuation, and stream recovery need Clara-owned persistence/glue; `ToolLoopAgent` alone does not make a Workflow 4 run durable. |
| Isolated Workflow 5 + `WorkflowAgent` successor lane | Native durable loop, tool steps, approvals, hooks, resumable streams, and serializable context can be tested together. | Requires AI SDK patches, Workflow 5 beta, Postgres-world migration, frozen-run compatibility, deployment/rollback proof, and the current fast-moving integration surface. |
| Anthropic Managed Agents comparison prototype | Tests a hosted, versioned agent resource that natively bundles system instructions, tools, MCP servers, skills, persisted session events, and cloud or self-hosted sandboxes. | Beta API; greater control-plane coupling; retention, residency, permission, cost, and accounting-data governance need separate acceptance. |

These are evaluation lanes, not a ranking. A narrow shadow task with read-only tools is enough to compare trace quality, restart behavior, loop repair, citations, approval resumption, tenant leakage controls, event growth, and operator recovery before any write authority is considered.

## Anthropic managed-agent alternative: verified constraints

Claude Managed Agents is a hosted agent harness for long-running asynchronous sessions. A versioned agent resource bundles the model, system prompt, tools, MCP servers, skills, and optional multi-agent roster. Sessions stream over SSE, persist event history, can be steered or interrupted, and can use either Anthropic cloud sandboxes or self-hosted sandboxes.

The service is explicitly beta and requires the `managed-agents-2026-04-01` header. Permission policies can pause server/MCP tool calls for approval, but custom-tool authorization remains the application's responsibility. Live token-delta events are not persisted even though session events are, so replay UX still needs design.

Anthropic states that Managed Agents is not eligible for Zero Data Retention or HIPAA BAA coverage; session history and outputs persist until deletion. Self-hosting the sandbox does not remove the Anthropic control plane or the application's responsibility for tool blast radius and copied state. Current data-residency behavior and Malaysian accounting-firm contractual requirements need legal/security verification before client data is used. These are evaluation constraints, not a conclusion that the service is unsuitable.

## Unknowns that need a prototype or owner decision

- Whether Workflow 5 and its matching Postgres world replay all Clara patterns, including frozen closures, named exports, hook resumes, stream detachment, and rollback with parked runs.
- Whether self-hosted Postgres world provides deployment pinning equivalent to Vercel's managed world; no such guarantee was established here.
- The exact deployment unit and retention scheme for a long-lived conversation before the 25,000-event limit; one run per task, period, or bounded session are all plausible.
- The signed-approval key rotation, expiry, one-time-use, denial, and revalidation contract Clara wants above the library primitive.
- The observed quality of a repair loop on Clara's failure taxonomy. Library error propagation is capability evidence, not an accuracy result.
- Whether OKF v0.2 remains compatible during its early evolution and which fields Clara should make mandatory in its stricter profile.
- Hosted-agent data residency, deletion evidence, subprocessor terms, and professional-accounting obligations for Malaysian tenant data.

## Primary sources

All web sources were accessed 2026-09-08.

### Vercel AI SDK and Workflow

- [AI SDK `ToolLoopAgent` reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [AI SDK WorkflowAgent guide](https://ai-sdk.dev/docs/agents/workflow-agent)
- [AI SDK tools, tool errors, and approval](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [`@ai-sdk/workflow` changelog](https://github.com/vercel/ai/blob/main/packages/workflow/CHANGELOG.md)
- [`@ai-sdk/workflow` package](https://www.npmjs.com/package/@ai-sdk/workflow)
- [`@workflow/ai` package](https://www.npmjs.com/package/@workflow/ai)
- [Workflow SDK v5 errors and retries](https://workflow-sdk.dev/v5/docs/foundations/errors-and-retries)
- [Workflow SDK v5 hooks](https://workflow-sdk.dev/v5/docs/foundations/hooks)
- [Workflow SDK v5 resumable AI streams](https://workflow-sdk.dev/v5/docs/ai/resumable-streams)
- [Workflow SDK deployment mismatch](https://workflow-sdk.dev/v5/docs/errors/deployment-mismatch)

The exact package manifests, bundled documentation, types, and source for `ai@7.0.77`, `@ai-sdk/workflow@2.0.24`, `workflow@5.0.0-beta.48`, and `@workflow/ai@4.2.1` were also inspected locally from installed modules or npm package tarballs. Context7 library IDs `/vercel/ai` and `/websites/workflow-sdk_dev_v5` were queried as a second documentation path.

### Knowledge formats

- [Karpathy, “An idea for an LLM application” gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Google Cloud: Open Knowledge Format v0.1 announcement, 2026-06-12](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/)
- [Google Cloud: OKF v0.2 trust signals, 2026-07-24](https://cloud.google.com/blog/products/data-analytics/okf-v0-2-adds-trust-signals/)
- [Open Knowledge Format v0.2 maintained specification](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)
- [Google Cloud: serving OKF with Knowledge Catalog, 2026-08-26](https://cloud.google.com/blog/products/data-analytics/scale-okf-bundles-across-an-organization-with-knowledge-catalog)

### Anthropic

- [Claude Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Versioned agent setup](https://platform.claude.com/docs/en/managed-agents/agent-setup)
- [Permission policies](https://platform.claude.com/docs/en/managed-agents/permission-policies)
- [Session events and streaming](https://platform.claude.com/docs/en/managed-agents/events-and-streaming)
- [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)
- [Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency)
- [Self-hosted sandbox security model](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes-security)

## Research limits

### Follow-up package verification from the supplied research pack

The owner's same-day Claude fact-check prompted a fresh check of npm metadata and the published 2.0.24 TypeScript source. The current `workflow@5.0.0-beta.48` metadata references an unpublished `@workflow/nest@5.0.0-beta.48`; the observed nest beta tag is beta.47. Treat the top-level beta tag as a release inventory entry, not an installable recommendation. `WorkflowAgent.generate()` still throws in this package, tool execution only gains a separate durable boundary when explicitly implemented as a step, and a stop budget must be supplied. The approval section above corrects the original wording about automatic pauses.

The bundle also identifies a pre-existing supported-runtime mismatch: Clara's `.nvmrc`, root engines and runtime Dockerfile select Node 20, while the installed `ai@7.0.77` manifest requires Node >=22. This is a verified support-range discrepancy, not proof that a particular production call currently fails. It belongs in the stack compatibility test and rollout plan.

Primary package evidence: [Workflow 5 beta.48 metadata](https://registry.npmjs.org/workflow/5.0.0-beta.48), [Workflow Nest metadata](https://registry.npmjs.org/@workflow%2fnest), [WorkflowAgent 2.0.24 metadata](https://registry.npmjs.org/@ai-sdk%2fworkflow/2.0.24), and the tarball's `src/workflow-agent.ts:1540–1541,1575,2571–2594,3253–3261`. The current [Nitro bundling issue](https://github.com/vercel/workflow/issues/3004) is a relevant reproduction target, not evidence that Clara's specific Nitro 3 build has failed.

Some prior comparison wording should not be reused: a whole loop inside one durable step has coarse restart granularity, not literally zero durability; resumable streaming does not inherently require Redis; two installed AI SDK versions are a compatibility question rather than automatic proof of breakage. See the [research correction record](https://github.com/BELCORT-SDN-BHD/clara/issues/599#issuecomment-5580492291).

No dependency was installed, no workflow was migrated, no hosted service was changed, and no client data was sent externally. Withdrawn issue/branch research was used only to identify questions to re-check; compatibility and feature claims above are grounded in current manifests, source, changelogs, vendor documentation, and the repository baseline. The codebase index reported parse-only gaps at one line in each of `chatTurn.v11` through `chatTurn.v17`; source reads and literal search were used for the baseline claims, and no exhaustive behavioral claim depends on those indexed ranges.
