# WorkflowAgent 1.0.70 / Workflow 4 comparator

This isolated, provider-free comparator pins the last Workflow 4-compatible
`@ai-sdk/workflow` line and runs its native agent loop through the Workflow 4
Vitest compiler/runtime. It does not import Clara or the active harness.

Run on Node 22:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npx --yes --package node@22.23.0 node node_modules/typescript/bin/tsc --noEmit
npx --yes --package node@22.23.0 node node_modules/vitest/vitest.mjs run --config vitest.config.ts
```

The passed run returned two agent model steps, the scripted final text and the
synthetic receipt in the model message history. Workflow's local event store
recorded five independently completed steps: model call, receipt tool, stream
tool-result write, second model call and stream close. A second test supplied a
tool call with `content-filter` as its finish reason and verified that the
WorkflowAgent 1 loop did not execute it. `last-pass.json` is the compact output
manifest.

This establishes compilation, model/tool loop execution, tool-result
continuation, per-call/per-tool Workflow step registration and that narrow
unsafe-finish behavior for the exact package set. It does not establish model
retry stream reset behavior, process restart, PostgreSQL World, Clara
permissions, accounting effects, cancellation, hosted streaming or cutover.
