import { definePlugin } from "nitro";

// Per the Postgres-world docs: the world must be started on server boot so
// its embedded graphile-worker subscribes to the queue. The Local World has
// no start() (optional chaining), so dry-run mode is unaffected.
//
// NOTE: the postgres-world doc shows `import { defineNitroPlugin } from
// "nitro/~internal/runtime/plugin"`; that subpath does not exist in
// nitro@3.0.260610-beta's exports map - the helper is re-exported from the
// package root as `definePlugin` (verified in dist/runtime/nitro.d.mts).
export default definePlugin(async () => {
  const { getWorld } = await import("workflow/runtime");
  await getWorld().start?.();
  console.log(
    `[spike] worker up pid=${process.pid} world=${process.env.WORKFLOW_TARGET_WORLD ?? "(default)"} fault=${process.env.FAULT ?? "(none)"}`,
  );
});
