import { definePlugin } from "nitro";
import { mintWakeCredential, withReadWakeScoped, withRuntime, withRead } from "../lib/pools.mjs";
import { startControlListener, productionControlDeps } from "../lib/control.mjs";
import { startLeaderLoop } from "../lib/leader.mjs";
import { start, getRun } from "workflow/api";
import { workflows } from "../workflows/registry.js";

// Boots the WHOLE crash-only group (Slice 4, contract §4.1): the WDK Postgres
// world's embedded worker, the control listener (leased clarify delivery + cancel
// settlement), and the single leader loop (routing + drain + reconcile). It also
// injects the pool API for the FROZEN chatTurn steps (which never import pools.mjs,
// so pools stays out of the frozen closure).
//
// GUARDED by CLARA_START_WORLD=1. Default OFF so a /health or /ready check never
// attaches a worker to the durable engine (critical while the shared project may
// hold parked runs). Under supervision (scripts/serve.mjs) a world-start failure
// EXITS the process non-zero — the swallow-and-log of the Slice-1 skeleton is
// replaced (S4-D10); Fly restarts.
//
// Nitro invokes plugins synchronously (it does not await them), so the async boot
// runs as a self-contained task that OWNS its rejection (an unhandled rejection is
// caught by the supervisor's crash-only handler).
export default definePlugin(() => {
  if (process.env.CLARA_START_WORLD !== "1") {
    console.log("[clara-runtime] world NOT started (CLARA_START_WORLD != 1) — skeleton mode");
    return;
  }

  // Inject the pool API for the frozen chatTurn steps (globalThis contract §4.1).
  (globalThis as unknown as { __claraPools?: unknown }).__claraPools = {
    mintWakeCredential,
    withReadWakeScoped,
    withRuntime,
    withRead,
  };

  void (async () => {
    try {
      const { getWorld } = await import("workflow/runtime");
      await getWorld().start?.();
      console.log(`[clara-runtime] durable world started pid=${process.pid}`);
    } catch (err) {
      console.error("[clara-runtime] durable world FAILED to start:", err instanceof Error ? err.message : String(err));
      process.exit(1); // crash-only: world-start failure is fatal under supervision (S4-D10)
    }

    // Control listener — leased clarify delivery + cancel settlement (world API).
    const controlDeps = productionControlDeps({ log: (m: string) => console.log(m) });
    startControlListener(controlDeps);

    // Leader loop — routing + drain + reconcile under the 'router' advisory lock.
    // Enqueue targets the workflow via the REGISTRY (newest version — Appendix A).
    startLeaderLoop({
      enqueueChatTurn: (taskId: string) => start(workflows.chatTurn, [{ taskId }]),
      getRun,
      log: (m: string) => console.log(m),
    });

    console.log("[clara-runtime] control listener + leader loop started");
  })();
});
