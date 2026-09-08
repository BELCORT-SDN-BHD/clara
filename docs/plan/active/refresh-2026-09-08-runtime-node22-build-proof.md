# Current Clara runtime on Node 22 — local build checkpoint

Date: 2026-09-08. Isolated local compatibility evidence, not a runtime migration or deployment.

The current Clara runtime source in `C:/Users/zhant/Desktop/clara-rebuild-agent-harness/packages/runtime` built with Node `v22.23.2`; its TypeScript check also returned zero. This complements the [compiled ToolLoopAgent/Workflow restart experiment](refresh-2026-09-08-tool-loop-workflow-merge-proof.md). The runtime source itself was not changed for this check.

## Commands and result

From the isolated worktree root, `pnpm install --filter @clara/runtime... --frozen-lockfile` succeeded with pnpm `10.33.0`, using the existing lockfile. The project allowlist skipped `workerd`'s install script; no Cloudflare build was attempted. The following commands ran from `packages/runtime`:

```powershell
$taskNode22 = 'C:\Users\zhant\AppData\Local\Temp\clara-agent-harness-607\node22\node_modules\node\bin\node.exe'
& $taskNode22 --version
& $taskNode22 node_modules/nitro/dist/cli/index.mjs build
& $taskNode22 node_modules/typescript/bin/tsc --noEmit --pretty false
```

| Check | Observed result |
|---|---|
| Node executable | `v22.23.2` |
| Workflow compilation within the full runtime build | 212 steps, 46 workflows |
| Nitro build | Exit 0; generated `.output/server/index.mjs`; reported total 14.6 MB / 3.36 MB gzip |
| TypeScript | Exit 0, no diagnostic output |
| Tracked manifests, lockfile and runtime source | No change from these commands; only dependencies and ignored build artifacts were produced |

The build was successful **with diagnostics**. It reported a serialization-registration warning for OpenAI/Gateway model classes and missing source-map files in the installed `@ai-sdk/openai`, `@ai-sdk/gateway` and `@ai-sdk/provider-utils` packages. The latter messages used `ERROR` wording, but the builder continued, produced the server and exited zero. This is not a warning-free build or proof that serialized model instances work.

Retained logs:

- `C:/Users/zhant/AppData/Local/Temp/clara-agent-harness-607/runtime-node22-build-20260908.log`
- `C:/Users/zhant/AppData/Local/Temp/clara-agent-harness-607/runtime-node22-typecheck-20260908.log`

## Remaining boundaries

Both stages of the current runtime Dockerfile still use Node 20, and the root manifest still declares the Node 20 baseline. These checks do not change either declaration. Node 22 Linux image installation/build, runtime startup, native dependencies, CI pinning and rollback remain migration work. The full runtime test suite, real database authority/receipt functions, provider streaming, hosted Fly behavior and version cutover were not exercised by these commands.

The [runtime route decision](https://github.com/BELCORT-SDN-BHD/clara/issues/607) remains open. The combined evidence now supports the technical feasibility of a Workflow 4 successor using a bounded ToolLoopAgent step; it does not prove the complete business-admission, cancellation, replay or deletion contract.
