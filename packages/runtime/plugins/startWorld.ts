import { definePlugin } from "nitro";
import { mintWakeCredential, withReadWakeScoped, withRuntime, withRead } from "../lib/pools.mjs";
import { startControlListener, productionControlDeps } from "../lib/control.mjs";
import { startLeaderLoop } from "../lib/leader.mjs";
import { heartbeat } from "../lib/reconciler.mjs";
import { start, getRun } from "workflow/api";
import { workflows } from "../workflows/registry.js";

type SupervisorState = { shuttingDown: boolean; stops: Array<() => Promise<unknown> | void> };

// Boots the WHOLE crash-only group (Slice 4, contract §4.1): the WDK Postgres
// world's embedded worker, the control listener, the single leader loop (routing +
// drain + reconcile), and the DEDICATED engine heartbeat. It injects the pool API
// for the FROZEN chatTurn steps (which never import pools.mjs).
//
// SUPERVISION (S4-AB7): every required component's promise is watched — if any
// settles UNEXPECTEDLY (not during shutdown) the whole process exits non-zero
// (crash-only; Fly restarts). A world-start failure exits non-zero. The 'world'
// heartbeat is written by a DEDICATED timer here — NEVER by the relay leader (ND5),
// so relay leadership never gates /ready. (The WDK active healthCheck is a
// Vercel-world feature; against the self-hosted Postgres world the beat reflects the
// world PROCESS's event-loop liveness — a crashed worker exits the process, a stuck
// worker stalls this timer → the beat goes stale → /ready fails.)
export default definePlugin(() => {
  if (process.env.CLARA_START_WORLD !== "1") {
    console.log("[clara-runtime] world NOT started (CLARA_START_WORLD != 1) — skeleton mode");
    return;
  }

  // Shared supervisor state (serve.mjs sets shuttingDown + calls stops on SIGTERM).
  const sup = ((globalThis as unknown as { __claraSupervisor?: SupervisorState }).__claraSupervisor ??= {
    shuttingDown: false,
    stops: [],
  });

  // Inject the pool API for the frozen chatTurn steps (globalThis contract §4.1).
  (globalThis as unknown as { __claraPools?: unknown }).__claraPools = {
    mintWakeCredential,
    withReadWakeScoped,
    withRuntime,
    withRead,
  };

  const fatal = (what: string, err?: unknown) => {
    if (sup.shuttingDown) return; // an expected settle during graceful shutdown
    console.error(`[clara-runtime] FATAL: ${what} exited unexpectedly:`, err instanceof Error ? err.stack : String(err ?? ""));
    process.exit(1);
  };

  void (async () => {
    try {
      const { getWorld } = await import("workflow/runtime");
      await getWorld().start?.();
      console.log(`[clara-runtime] durable world started pid=${process.pid}`);
    } catch (err) {
      console.error("[clara-runtime] durable world FAILED to start:", err instanceof Error ? err.message : String(err));
      process.exit(1); // crash-only: world-start failure is fatal (S4-D10)
    }

    // Control listener — leased clarify delivery + cancel settlement (world API).
    const control = startControlListener(productionControlDeps({ log: (m: string) => console.log(m) }));
    control.done.then(() => fatal("control listener"), (e: unknown) => fatal("control listener", e));
    sup.stops.push(control.stop);

    // Leader loop — routing + drain + reconcile under the 'router' advisory lock.
    const leader = startLeaderLoop({
      enqueueChatTurn: (taskId: string) => start(workflows.chatTurn, [{ taskId }]),
      getRun,
      log: (m: string) => console.log(m),
    });
    leader.done.then(() => fatal("leader loop"), (e: unknown) => fatal("leader loop", e));
    sup.stops.push(leader.stop);

    // DEDICATED engine heartbeat — the ONLY writer of the 'world' beat (S4-AB7b).
    const beatMs = Number(process.env.CLARA_WORLD_BEAT_MS || 10000);
    const timer = setInterval(() => {
      if (sup.shuttingDown) return;
      withRuntime((c) => heartbeat(c, "world")).catch((e) => console.error("[clara-runtime] world heartbeat error:", e?.message ?? e));
    }, beatMs);
    timer.unref?.();
    sup.stops.push(() => clearInterval(timer));

    console.log("[clara-runtime] control listener + leader loop + engine heartbeat started");
  })();
});
