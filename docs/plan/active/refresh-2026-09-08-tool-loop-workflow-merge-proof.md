# ToolLoopAgent inside Workflow 4 restart proof

Date: 2026-09-08

Status: isolated compatibility proof passed; production adoption and issue 607 remain open

Branch/worktree: `codex/research-agent-harness` at `C:\Users\zhant\Desktop\clara-rebuild-agent-harness`

## Result

A new, explicitly named `toolLoopWorkV3` prototype body compiled through the real Workflow Nitro transform. It parks on a real Workflow hook, survives termination of the actual serving Node process while the same PostgreSQL World stays alive, resumes after a new serving process starts, and runs AI SDK `ToolLoopAgent` inside a real `"use step"`.

The scripted model first calls the synthetic receipt tool with stale authority and knowledge revisions. The tool opens a new PostgreSQL connection, locks and reads the rig's trusted rows, and throws an actionable `STATE_CHANGED` error. ToolLoopAgent receives that error in the next model input, makes a corrected call with the current revisions, repeats the same operation key once, and finishes from the persisted receipt. The corrected and duplicate calls resolve to the same receipt, and `rig.effects` contains one row.

Observed environment and process evidence:

- Node `v22.23.2`
- PostgreSQL `17.11`
- `workflow@4.8.4`
- `@workflow/world-postgres@4.3.4`
- serving PID `46840` exited; restarted serving PID `4752`
- PostgreSQL PID remained `23128` across the serving-process restart
- `answer:tool-loop` existed in `workflow.workflow_hooks` before the kill
- Workflow run `wrun_01M20ST4NPBXV2R5HRD4RFPPT9`
- four scripted model calls, one model-visible tool error, one persisted effect
- receipt `3`, operation key `tool-loop:tool-loop-answer:synthetic-effect-v1`
- post-restart late SSE read replayed both `accepted` and `completed`

Machine-readable evidence is `prototypes/agent-harness-validation/server-rig/last-tool-loop-pass.json` with SHA-256 `7AAB804D6F3D35A2287A3571019C0731D50E30455672F15D48050BE21CBADA39`. Full retained logs are under `C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\tool-loop-merge\restart-run-HS1Rig`. The rig stopped both serving processes and its PostgreSQL process; PID probes after completion found all three exited.

## Reproduce

The command uses only the previously isolated Node/PostgreSQL toolchains and creates a fresh cluster beneath the explicit scratch root:

```powershell
cd C:\Users\zhant\Desktop\clara-rebuild-agent-harness\prototypes\agent-harness-validation
$env:RIG_PG_BIN='C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\pg17\pgsql\bin'
$env:RIG_SCRATCH='C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\tool-loop-merge'
New-Item -ItemType Directory -Force -Path $env:RIG_SCRATCH | Out-Null
& 'C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\node22\node_modules\node\bin\node.exe' server-rig/process-restart-proof.mjs
```

The runner resolves and checks that its generated run directory remains beneath `RIG_SCRATCH`. Every Windows child spawn uses `windowsHide: true`. Cleanup addresses only the child handles and fresh PostgreSQL data directory created by this run; the runner does not read repository `.env` files or use provider credentials.

## Changed prototype surface

- `server-rig/workflows/tool-loop-work.ts` is the new v3 Workflow/ToolLoopAgent body.
- `server-rig/app.ts` admits explicit `v1`, `v2`, or `v3` starts; unknown versions refuse. The existing v1/v2 body file is byte-untouched.
- `server-rig/process-restart-proof.mjs` adds the v3 parked/restart/resume assertions, retained JSON evidence, scratch containment check and hidden Windows child processes.

## Evidence boundary

This closes the narrow route-compatibility question that the earlier evidence left open: `ToolLoopAgent@7.0.77` can run inside a compiled `workflow@4.8.4` step on the tested Node 22/Nitro/Postgres World stack, with a hook park and process restart around that step.

It does not establish any of the following:

- Clara roles, tenant RLS, Client KB sources or production business functions; the tables and receipt are synthetic.
- General model recovery quality; the mock model follows a fixed four-call script.
- A single canonical Client KB revision or KB-only change/replanning; this run uses numeric synthetic revisions fixed at `1`.
- Clara's first-answer admission or downstream delivery crash window; the prototype app still calls raw `resumeHook` and does not fault between resume success and `delivered_at`.
- Cancellation racing an admitted/committing business operation, ordinary-chat deletion propagation, or retained minimal Work basis.
- Old/nonterminal body recovery across two different builds. This is a same-binary process restart with v1/v2/v3 present in both processes, not a deployment cutover.
- Full Clara runtime, Docker/Fly image, Linux, multi-host, hosted provider streaming, or WorkflowAgent 5.

The next route decision can therefore prefer a Workflow 4 successor carrying ToolLoopAgent behind Clara's existing admission/business/receipt contracts. Closing issue 607 still requires the real Clara DB authority-through-commit and cancellation fence, World delivery fault injection, KB-only re-evaluation, chat-delete/minimal-basis behavior, and an actual old-build/new-build cutover with rollback inventory.
