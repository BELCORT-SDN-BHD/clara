# Runtime boundary proof for the unified Clara agent harness

Checked: 2026-09-09 MYT

Status: isolated synthetic compatibility proof passed; issue 607 and production adoption remain open

Branch/worktree: `codex/research-agent-harness` at `C:\Users\zhant\Desktop\clara-rebuild-agent-harness`

## Result

The pinned compatible route can recover the tested model/tool crash boundary. `runtimeBoundaryWorkV4` runs AI SDK `ToolLoopAgent` inside a compiled Workflow `"use step"`. Its synthetic tool locks and checks the current work, authority, knowledge and period rows, commits one effect receipt plus a fault marker, and then deliberately stops before returning a tool result. The runner observes the committed rows and terminates the actual serving Node child. A different serving process replays the uncheckpointed step, resolves the same operation key to the same receipt, and completes the Workflow with one effect row.

The same run exercised real PostgreSQL transaction ordering for cancellation and authority changes. These are synthetic tables and operations, but the row locks and commits are PostgreSQL 17 behavior rather than an in-memory simulator.

Observed environment:

| Component | Tested value |
|---|---|
| Node | `v22.23.2` |
| PostgreSQL | `17.11`, fresh loopback cluster |
| `workflow` | `4.8.4` |
| `@workflow/world-postgres` | `4.3.4` |
| `ai` | `7.0.77` |
| Nitro compilation | Exit 0; 18 steps and 5 workflows |

The Nitro build retained the existing nonfatal unresolved `@opentelemetry/api` diagnostics. It still emitted the server bundle and the proof completed. This is not a warning-free build.

## Tested boundaries

### Effect committed before the Workflow step checkpoint

Run `wrun_01M20WGD9ETKK6RWCBA8CWG1GE` produced this sequence:

1. Serving PID `55672` entered the v4 ToolLoop step.
2. The tool transaction committed receipt `1` and a fault marker identifying PID `55672`.
3. The tool waited before returning. The runner read both committed rows and killed PID `55672`; the PID probe then reported it absent.
4. Serving PID `48660` started while PostgreSQL postmaster PID `43356` remained unchanged.
5. Workflow replayed the uncheckpointed step. The stable operation key resolved to receipt `1`, `replayObservedExistingReceipt` was `true`, and the run completed with one effect row.
6. A late SSE read returned the persisted `accepted` and `completed` events.

The crash transaction inserts the effect at `server-rig/workflows/runtime-boundary-work.ts:133`, commits the fault marker at `server-rig/workflows/runtime-boundary-work.ts:145`, and stops before returning at `server-rig/workflows/runtime-boundary-work.ts:159`. The runner observes the committed receipt at `server-rig/runtime-boundary-proof.mjs:142`, kills the server at `server-rig/runtime-boundary-proof.mjs:156`, and checks the replayed result at `server-rig/runtime-boundary-proof.mjs:167`. The v4 assertion deliberately does not require the successful tool call to report `deduplicated=false`: after this crash, correct replay reports an existing receipt.

This establishes compatibility of one stable idempotency receipt with Workflow step replay. The model is `MockLanguageModelV4` following a fixed two-call script, so the result says nothing about provider behavior or general model recovery quality.

### Cancellation and an already-admitted operation

The operation transaction at `server-rig/runtime-boundary-proof.mjs:410` locked the work and trusted-state rows, checked cancellation and authority, and paused while holding the locks. A concurrent cancellation transaction at `server-rig/runtime-boundary-proof.mjs:470` could not acquire the work lock. The accepted operation then committed receipt `3`; cancellation committed after it; a subsequent operation returned `refused_cancelled`. The work had exactly one effect. The assertions and observed ordering are at `server-rig/runtime-boundary-proof.mjs:246`.

This is the proposed Q8 ordering in executable form: stop admitting new operations after cancellation, let the already-admitted atomic operation settle, and retain its receipt. It does not test Clara's terminal status transition, UI state, reversal flow or production cancellation function.

### Current authority and period state through commit

Both serialization orders at `server-rig/runtime-boundary-proof.mjs:274` passed; the competing revocation transaction is at `server-rig/runtime-boundary-proof.mjs:486`:

- Operation first: the operation checked current state while locking both rows, committed receipt `4`, then the waiting transaction changed the role to `viewer`, revoked the actor, advanced the authority revision, closed the period and advanced its revision. The next operation refused with those new values.
- Revocation first: the revocation/period-close transaction held the locks before the operation. After revocation committed, the waiting operation read the new values and returned `refused_authority_or_period`; it created zero effects.

This demonstrates a viable transaction fence on the rig schema. It is not evidence that current Clara business functions take these locks or compose the same checks with their accounting writes.

### Knowledge-only revision

Changing only `knowledge_revision` from `1` to `2` made an operation return `replan_required` with zero effects. The scenario begins at `server-rig/runtime-boundary-proof.mjs:323`; the replan transaction at `server-rig/runtime-boundary-proof.mjs:512` advanced only the work's required knowledge revision and durable source reference. Role, active state, authority revision, period-open state and period revision remained unchanged. A later operation using the revised plan committed.

The test separates knowledge invalidation from authorization: rereading or replanning does not grant authority. The knowledge rows and source reference are synthetic and do not prove the Client KB reader, provenance or production revision policy.

### Ordinary chat deletion and retained work basis

The v4 workflow persists its synthetic interruption at `server-rig/workflows/runtime-boundary-work.ts:37` and reads the minimum basis at `server-rig/workflows/runtime-boundary-work.ts:53`. The scenario at `server-rig/runtime-boundary-proof.mjs:347` deleted the ordinary chat row, then admitted one answer through the transactional first-answer gate at `server-rig/app.ts:77`. The completed workflow saw zero chat rows and recovered the instruction, source reference and accepted answer from `rig.work_basis`.

The synthetic admission gate also returned the original receipt for an identical operation-key replay, rejected a conflicting payload using the same key with HTTP 409, and rejected a second answer under a different key with HTTP 409. This avoids treating raw concurrent `resumeHook` behavior as a Clara defect. The prototype commits admission before calling `resumeHook`; it has no durable dispatcher/outbox, so a crash in that delivery window remains unproved and unresolved.

### Retained old body beside a new default

The compiled bundle contained the byte-untouched v1/v2/v3 bodies plus v4. The explicit registry and v4 default are at `server-rig/app.ts:38`. A v3 run parked, `/start/default/...` selected v4 for a new run, and the parked v3 run later completed as `v3-tool-loop`. This proves that the new registry can retain and dispatch the old body while selecting v4 for new work.

Both runs used one compiled serving bundle. This is not a two-binary deployment cutover, rollback, or proof that an older deployed run survives removal or renaming of a body.

## Reproduce

The command uses the isolated Node 22 and PostgreSQL 17 toolchains already provisioned for issue 607. It creates a fresh cluster beneath the checked scratch root, binds PostgreSQL and Nitro to free loopback ports, hides Windows child windows, and stops only its own child processes.

```powershell
cd C:\Users\zhant\Desktop\clara-rebuild-agent-harness\prototypes\agent-harness-validation
$env:RIG_PG_BIN='C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\pg17\pgsql\bin'
$env:RIG_SCRATCH='C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607'
& 'C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\node22\node_modules\node\bin\node.exe' server-rig\runtime-boundary-proof.mjs
```

The final machine result is `prototypes/agent-harness-validation/server-rig/last-runtime-boundary-pass.json`, SHA-256 `5B0738F109E67B6B11F7760B99883AD1E480567DC34926A1AA49343C615F9025`. Retained logs are under `C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\runtime-boundary-run-VjgcRz`.

The root retained an identical [machine-result copy](prototypes/agent-harness/runtime-boundary-pass.json)
with this evidence package. Executable source remains on the isolated harness branch at
`2d34cd3e`; this copy does not move prototype code into the production runtime.

The source surfaces are:

- `server-rig/workflows/runtime-boundary-work.ts`: explicit v4 Workflow body, persisted question, minimum-basis read, real ToolLoop step and crash barrier.
- `server-rig/app.ts`: explicit v1-v4 registry, v4 default for new starts, and the synthetic first-answer admission gate.
- `server-rig/runtime-boundary-proof.mjs`: scratch PG17/Workflow process proof and transaction-ordering cases.
- `server-rig/last-runtime-boundary-pass.json`: exact observed values from the final passing run.

The existing `server-rig/workflows/durable-work.ts` and `server-rig/workflows/tool-loop-work.ts` were not changed.

## What this changes for issue 607

The remaining route decision is no longer blocked on whether the pinned Workflow 4 successor can replay a real ToolLoop step after a business effect commits but before the step checkpoint. It also has an executable PostgreSQL pattern for ordering cancellation, authorization, period state and knowledge revision with an idempotent receipt.

Production implementation and rollout still require evidence for:

- Clara's tenant/RLS and business-function transaction boundary, including its actual role and period authority sources;
- a durable answer dispatch/outbox or equivalent test across admission commit, worker failure, lease expiry and redelivery;
- cancellation terminalization and reversal behavior in the actual work state machine;
- Client KB reread/provenance and ordinary-chat deletion authorization against Clara's real stores;
- a two-binary old-build/new-build cutover and rollback while an old body remains nonterminal;
- the Node 22 Linux container/runtime migration, hosted PostgreSQL and provider behavior.

The passing rig supports retaining a Workflow 4 successor plus `ToolLoopAgent` as a viable implementation candidate. It does not establish production readiness, justify removing frozen bodies, or validate WorkflowAgent 5. The route selection remains with the root review after a fair comparator against the pinned installable `WorkflowAgent@1.0.70` candidate; the production checks above are later implementation and rollout acceptance rather than prerequisites for comparing the two harness routes.
