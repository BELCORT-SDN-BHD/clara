# Clara agent harness and durable execution validation

Date: 2026-09-08  
Repository baseline: `68ab432308e1bfe87871565c207f8f4ac1e89101`  
Prototype branch: `codex/research-agent-harness`  
Issue: [验证统一 Clara agent harness 与持久化执行的实施路线](https://github.com/BELCORT-SDN-BHD/clara/issues/607)

## Recommended direction — validation remains open

Later checkpoint: the [combined ToolLoopAgent/Workflow experiment](refresh-2026-09-08-tool-loop-workflow-merge-proof.md) now runs the bounded agent in a compiled Workflow 4 step after a real hook/process restart. The [full current-runtime Node 22 build check](refresh-2026-09-08-runtime-node22-build-proof.md) also passes, with recorded packaging diagnostics. These resolve the earlier separation between loop and restart evidence; intra-step crash replay, real Clara admission, cutover and the other boundaries below remain open.

The current evidence supports evaluating a single Clara agent **contract** on the existing Workflow 4 runtime first. Put versioned instructions, skill identifiers, tool-registry version, tenant/client/work identifiers, authority revision and Client KB revision into a small serializable invocation envelope. A successor prototype can use AI SDK `ToolLoopAgent` for the bounded model/tool loop while keeping Workflow, database functions and receipts responsible for persistence and business authority.

This is a recommended implementation direction, not an accepted migration decision. The added Workflow 4 rig now proves process-kill/restart, PostgreSQL-persisted hooks and stream replay, and a trusted synthetic-store reread after parking. Issue 607 remains open because it does not prove an old body across a binary cutover or Clara's real role/RLS/business SQL. The raw hook experiment did not include Clara's existing first-answer admission gate; the [subsequent current-source trace](refresh-2026-09-08-answer-admission-evidence.md) confirms that gate should be preserved and reused, while downstream crash/lease-expiry delivery remains to be proved.

Do not migrate production execution to `WorkflowAgent` yet. The installable comparison set is `@ai-sdk/workflow@2.0.24`, `ai@7.0.93`, `workflow@5.0.0-beta.47`, and `@workflow/world-postgres@5.0.0-beta.40`. It installs and the `WorkflowAgent` export imports, but it requires Node 22, Workflow remains beta, and no Workflow 5 Nitro/Postgres restart run was completed here. The newer advertised `workflow@5.0.0-beta.48` is not installable on 2026-09-08 because it depends on unpublished `@workflow/nest@5.0.0-beta.48`.

The current Node baseline is already outside the declared support range of `ai@7.0.77`: Clara declares Node `>=20.19 <21` (`package.json:8-10`), while the installed AI SDK package declares Node `>=22`. The successful Node 20 smoke proof below is compatibility evidence, not a supported Node floor. A Node 22 runtime/build migration is a prerequisite for either route to be called production-supported.

## What ran

The throwaway prototype is in `prototypes/agent-harness-validation`. It uses only synthetic identifiers and state. The loop proof uses an AI SDK mock model and in-memory receipt map; the small integration uses Workflow's test Local World; the restart rig uses its own loopback-only PostgreSQL cluster. It has no provider key, production database connection, client data or deployment code.

### Supported-runtime Postgres World process restart

The restart rig uses Node `v22.23.2`, official EDB PostgreSQL `17.11` Windows binaries, Workflow `4.8.4`, and `@workflow/world-postgres@4.3.4`. It creates a fresh loopback-only cluster and synthetic schema per run, bootstraps Postgres World, builds Nitro, and starts the built server as a child process. Exact command for the retained scratch toolchain:

```powershell
cd C:\Users\zhant\Desktop\clara-rebuild-agent-harness\prototypes\agent-harness-validation
$env:RIG_PG_BIN='C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\pg17\pgsql\bin'
$env:RIG_SCRATCH='C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607'
& 'C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\node22\node_modules\node\bin\node.exe' server-rig/process-restart-proof.mjs
```

Observed PASS evidence is retained in `server-rig/last-pass.json`; full logs are in `C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\restart-run-qLHaR1`. The server changed from PID `42640` to `54428`; the old PID exited; PostgreSQL PID `14640` stayed alive. Both hook tokens existed in `workflow.workflow_hooks` before the kill. After restart, a late SSE reader replayed persisted `accepted` and `completed` events.

The parked revoked work received an answer payload containing only an answer identifier and text. Its step opened a fresh database pool, reread `rig.trusted_state`, observed the out-of-band change to role `viewer`, `active=false`, authority revision `2`, and knowledge revision `2`, returned `blocked_authority`, and wrote no effect. This proves the mechanism with a synthetic trusted schema; it does not prove Clara's database functions, tenant RLS, or production authorization policy.

For the authorized work, two concurrent insert attempts used the same unique operation key. PostgreSQL returned insert counts `[1,0]`, leaving one receipt. Two concurrent `resumeHook` calls both returned HTTP 200, however, and the winning answer text was nondeterministic (`duplicate` in the retained run). This synthetic route has no first-answer admission gate. Current Clara already enforces one through `answer_interruption` before its durable dispatcher calls `resumeHook`; the experiment is not a demonstrated Clara duplicate-answer defect. A separate cancel case completed with zero effects. Deleting the synthetic chat body while the process was down did not resurrect it or prevent the durable work from settling.

Root source review further bounds this proof: the synthetic step's state read and effect inserts are separate queries, so it does not prove atomic authorization-through-commit under a concurrent revocation. Authority and KB revisions changed together; a KB-only change and replanning were not exercised. The operation key and duplicate inserts are synthetic, not production business idempotency. Cancellation covered a parked run with no prior effect, and chat deletion covered one unused synthetic body row; neither validates the full cancellation race, retained work basis, or real transcript deletion propagation. The actual Clara admission transaction and version cutover remain required checks.

### Exact current stack: ToolLoopAgent plus Workflow 4

Command:

```powershell
cd C:\Users\zhant\Desktop\clara-rebuild-agent-harness\prototypes\agent-harness-validation
npm install
npm run proof
```

Observed on Node `v20.19.5`:

```text
ToolLoopAgent: PASS
model calls: 4
model-visible tool errors: 1
synthetic revision comparisons: 3
business side effects: 1
receipt id: receipt:work-42:adjustment-1
duplicate delivery deduplicated: true

Workflow 4 integration: PASS (1 test)
real compiled workflow + step bundles: yes
real hook wait/resume: yes
Workflow stream -> HTTP text/event-stream: yes
reader disconnect + late replay from startIndex 0: yes
post-resume comparison with numeric revisions supplied in the hook payload: yes
```

The ToolLoopAgent proof deliberately calls the synthetic business tool with stale numeric revisions. The tool compares them with in-memory test values and throws an actionable `STATE_CHANGED ... action=reload-and-retry` error. AI SDK places that tool error in the next model input; a scripted mock then makes the predetermined corrected call. This proves error-feedback plumbing and bounded loop behavior. It does not measure whether a real model will diagnose or repair the failure well. It also does not perform role authorization or reread authority/KB state from a trusted database. A duplicate delivery with the same operation key returns the in-memory test receipt and leaves the synthetic side-effect count at one. The loop has an explicit six-step ceiling and ends from receipt-grounded text.

The Workflow test uses `@workflow/vitest@4.0.20`, whose dependency on `@workflow/core@4.8.4` matches Clara's `workflow@4.8.4`. Its compiler transforms real `"use workflow"` and `"use step"` functions. The run parks on a Workflow hook, resumes, compares numeric revisions carried in the hook payload with numeric workflow inputs, completes, and closes its Workflow stream. That comparison is not a live reread from an authoritative source; a caller that can choose both values could satisfy it. A small HTTP adapter exposes the Workflow stream as SSE; the first reader disconnects after `accepted`, then a late reader replays both `accepted` and `completed` from the Workflow run.

### Official WorkflowAgent comparison

Exact candidate:

```powershell
cd prototypes\workflow-agent-candidate
npm install
npm run check
```

Observed:

```json
{"status":"IMPORT_PASS_BUILD_NOT_PROVEN","node":"v20.19.5","workflowAgent":"2.0.24","ai":"7.0.93","workflow":"5.0.0-beta.47"}
```

This install emitted `EBADENGINE` warnings because `@ai-sdk/workflow@2.0.24` and `ai@7.0.93` require Node `>=22`. `npm install --engine-strict --package-lock-only` refused the candidate on the current Node runtime. Import success under unsupported Node 20 does not override package metadata.

The latest-tag failure is repeatable without changing Clara's lockfile:

```powershell
npm view workflow@5.0.0-beta.48 dependencies --json
npm view @workflow/nest@5.0.0-beta.48 version --json
```

The first command names `@workflow/nest@5.0.0-beta.48`; the second returns npm `E404`. Beta 47 was selected only to establish that a coherent WorkflowAgent package set can install. It is not a production recommendation. Published `WorkflowAgent.generate()` also throws `Error('Not implemented')`; the supported implementation surface tested next must use `stream()`.

## Current Clara fit

Direct source reading shows that the compatible route preserves existing boundaries:

- The runtime pins `@workflow/world-postgres@4.3.4`, `ai@7.0.77`, Nitro, and `workflow@4.8.4` (`packages/runtime/package.json:15-26`). Neither `@ai-sdk/workflow` nor `@workflow/ai` is installed.
- Chat admission commits through the database before calling Workflow `start()` (`packages/runtime/src/chatRoutes.ts:7-17`). A new harness therefore does not need to own admission durability.
- The live workflow registry retains named versions, and `chatTurn_v17` is frozen rather than edited in place (`packages/runtime/workflows/chatTurn.v17.ts:1-12,67-96`). A harness change belongs in `chatTurn_v18` or another successor, with old bodies retained for non-terminal runs.
- Current v17 loads task/client/firm context and a books-version context pack before its bounded loop, checkpoints each segment, parks on a Workflow hook, and closes the stream in `finally` (`packages/runtime/workflows/chatTurn.v17.ts:87-97,119-130,147-153`). These are reusable execution seams.
- The existing SSE route re-authorizes on its polling loop, reads a run from `startIndex: 0`, treats browser disconnect as detach, and terminates from the server task status and persisted assistant parts (`packages/runtime/src/streamRoute.ts:1-18,47-62,84-113,144-201`). WorkflowAgent transport cannot replace these authorization and final-state rules by itself.
- Production configuration explicitly starts the Postgres world on one always-on Fly machine (`packages/runtime/fly.toml:12-34`). Official Postgres World documentation likewise requires PostgreSQL plus a long-lived worker; it is not a serverless adapter.
- The repository already contains Postgres-world E2E rigs for hook resume/SSE and frozen-version cutover (`packages/runtime/tests/world-e2e.mjs:1-26,148-214`; `packages/runtime/tests/version-cutover-e2e.mjs:37-47,176-194,291-318`). They were read as source and were **not run** in this validation.

The graph index reported `metadata_changed` for every cited repository path, so the claims above use direct source reads. Coverage reported no recorded issue on the exact cited paths. The `packages/runtime` scope has known unrelated parse gaps plus a one-line gap at `chatTurn.v17.impl.ts:99`; no exhaustive source claim depends on that line. `packages/runtime/node_modules` is intentionally not indexed, so package manifests, bundled docs and published source were read directly.

## Responsibility split

| Layer | Owns |
| --- | --- |
| Agent harness / AI SDK | Versioned instructions and skill references; typed tool catalog exposed for this call; bounded model/tool iteration; schema repair; actionable tool-error feedback; trace of model steps. |
| Workflow SDK | Durable run identity; versioned workflow body; step retry/replay; hook suspension; run stream persistence; process-independent scheduling when backed by a durable World. |
| Clara database and business tools | Tenant/client authorization at execution time; current work authority; expected books/KB revision checks; period and object invariants; atomic accounting changes; operation-key idempotency; authoritative receipts; question/answer concurrency; cancellation and final work status. |
| Client KB compiler | Source identity, verification status, freshness/revision and citations. A user declaration can be accepted as a user declaration; model inference remains unverified and cannot become execution authority merely because the loop reused it. |

The harness may carry stable IDs and revision tokens. It must reacquire live database connections and credentials inside the least-privileged step/tool, recheck authority and relevant versions immediately before each write, and treat a receipt as the only success signal. Neither `ToolLoopAgent` nor `WorkflowAgent` supplies Clara's accounting transaction or permission contract.

## Migration shape

1. Move the production runtime to a supported Node 22 line and run the existing build, tests and deployment-image checks without changing a workflow body.
2. Define a serializable `AgentInvocationV1` envelope and one generated/versioned tool registry. Keep clients, pools and functions out of runtime context.
3. Prototype a successor Workflow 4 body. Compare the handwritten per-segment loop with a bounded ToolLoopAgent adapter while reusing current admission, checkpoints, hooks, SSE, database tools and receipts. Tool errors must use stable categories such as `invalid_input`, `state_changed`, `not_authorized`, `period_locked`, `conflict`, and `unavailable`; only the first two or explicitly retryable conflicts enter a bounded repair path. Adoption still depends on the remaining acceptance rig.
4. Admit only new work to the successor. Retain every workflow body referenced by a non-terminal run. Use the existing inventory-shaped rollback preflight; rollback is allowed only when the target image contains every live run body.
5. Keep WorkflowAgent in a separate successor lane. Do not place its packages into Clara's production lockfile until an exact installable release passes the gates below. A future switch changes the loop implementation behind the same invocation/tool/receipt contracts; it must not move authority into prompt state.

## Evidence still required

The following remain unverified in this run:

- Workflow 5 Nitro production build and its Postgres-world bootstrap. The completed restart run covers the current Workflow 4 route on PostgreSQL 17.11.
- Clara's actual role/RLS/database authorization and Client KB source. The restart rig rereads a trusted synthetic table, including a changed knowledge revision, but does not execute Clara's production functions or schema.
- Reuse Clara's transactional first-answer-wins gate in the integrated rig. Exercise actual World redelivery after resume succeeds but before the delivery marker commits, and after a slow resume/batch outlives its lease. One admitted answer payload does not by itself prove exactly-once delivery or accounting effects.
- Cancellation racing an already committing tool and production chat deletion/retention semantics. The synthetic cases covered cancellation before the effect and deletion of an unrelated synthetic body.
- A Workflow 5 old-version run resuming on its original body across a new-image cutover and the corresponding rollback inventory.
- Hosted Fly behavior, deployment health, multi-host behavior, and provider streaming. No hosted environment or paid model was used.

The next acceptance rig should move the proven restart shape onto Clara's real authority and Client KB functions, reuse its existing transactional answer gate and durable dispatcher, verify the dispatch/cancellation race windows, and repeat with an old parked workflow version across a new-image cutover. Only after those checks pass should WorkflowAgent be considered as a production persistence migration rather than an installable research lane.

## Primary references checked

- [AI SDK ToolLoopAgent reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [AI SDK WorkflowAgent guide](https://ai-sdk.dev/docs/agents/workflow-agent)
- [Workflow hooks](https://workflow-sdk.dev/docs/foundations/hooks)
- [Workflow streaming](https://workflow-sdk.dev/docs/foundations/streaming)
- [Workflow Postgres World](https://workflow-sdk.dev/worlds/postgres)
- Published package manifests and bundled source/docs for `ai@7.0.77`, `workflow@4.8.4`, `@workflow/vitest@4.0.20`, `@ai-sdk/workflow@2.0.24`, `workflow@5.0.0-beta.47`, `workflow@5.0.0-beta.48`, and `@workflow/world-postgres@5.0.0-beta.40`.
