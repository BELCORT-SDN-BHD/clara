import { definePlugin } from "nitro";

// Starts the Workflow DevKit Postgres world's embedded graphile-worker on boot.
//
// GUARDED: only runs when CLARA_START_WORLD=1. Default OFF so booting the
// skeleton for a /health or /ready check never attaches a worker to the durable
// engine — critical while a shared project may hold parked runs from the
// Slice-0 spike. Slice 4 turns this on for the real chat loop.
//
// NOTE: the postgres-world doc shows `import { defineNitroPlugin } from
// "nitro/~internal/runtime/plugin"`; that subpath does not exist in
// nitro@3.0.260610-beta — the helper is re-exported from the package root as
// `definePlugin` (verified against the Slice-0 spike).
export default definePlugin(async () => {
  if (process.env.CLARA_START_WORLD !== "1") {
    console.log("[clara-runtime] world NOT started (CLARA_START_WORLD != 1) — skeleton mode");
    return;
  }
  const { getWorld } = await import("workflow/runtime");
  await getWorld().start?.();
  console.log(`[clara-runtime] durable world started pid=${process.pid}`);
});
