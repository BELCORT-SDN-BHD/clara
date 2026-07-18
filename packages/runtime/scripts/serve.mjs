// The supervisor (Slice 4, contract §4.1 / S4-AB7). Runs the WHOLE runtime as ONE
// crash-only process group: it composes the environment, asserts the production pool
// config, installs the crash-only + graceful-SIGTERM policy, then boots the built
// Nitro server IN-PROCESS (HTTP + world + control + leader + engine heartbeat, via
// plugins/startWorld.ts). Because everything shares this process, ANY required
// component's unhandled rejection / uncaught exception — a world-start failure
// (exit 1 in the plugin), a taxonomy HALT (exit 2 in the leader), or a component
// promise settling unexpectedly (the plugin's watchers) — terminates the group
// non-zero, and Fly restarts it. "One always-on machine, non-HA, explicit."

// --- env composition (mirrors scripts/worker.mjs) ---
// CLARA_START_WORLD is NOT defaulted here — the world is EXPLICIT opt-in (the
// world-off-default law). Production sets CLARA_START_WORLD=1 via fly.toml [env].
if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
}
process.env.WORKFLOW_TARGET_WORLD ??= "@workflow/world-postgres";
process.env.PORT ??= "3200";

// Fail CLOSED at boot if the production pool DSNs are missing (S4-AB8).
const { assertProductionPoolConfig } = await import("../lib/pools.mjs");
assertProductionPoolConfig();

const { setTimeout: sleep } = await import("node:timers/promises");
const DRAIN_MS = Number(process.env.CLARA_DRAIN_MS || 5000);
let shuttingDown = false;

function fatal(label, err) {
  console.error(`[clara-serve] FATAL ${label}:`, err?.stack ?? err);
  process.exit(1);
}

// Crash-only: any unhandled rejection / uncaught exception from ANY component takes
// the whole group down (S4-D10). The loops catch their own transient errors, so an
// unhandled one here is a genuine fault, not routine.
process.on("uncaughtException", (err) => fatal("uncaughtException", err));
process.on("unhandledRejection", (err) => fatal("unhandledRejection", err));

// SIGTERM/SIGINT graceful shutdown (S4-AB7d/FX2): flip the shutdown flag (503s NEW
// requests globally, /ready → 503, SSE streams detach), CLOSE the HTTP listener
// (stop accepting new connections; in-flight finish), DRAIN the HTTP layer FIRST
// (wait for active requests + SSE streams to reach zero, bounded), THEN stop the
// components in parallel (they must not short-circuit the HTTP drain), then exit 0.
// Fly SIGKILLs on overrun.
async function gracefulStop(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  const sup = (globalThis.__claraSupervisor ??= { shuttingDown: false, stops: [], activeRequests: 0 });
  sup.shuttingDown = true; // 503 new intake globally; the plugin's watchers now expect component settles
  console.error(`[clara-serve] ${sig} — stop intake, close listener, drain HTTP (${DRAIN_MS}ms), exit`);

  // Close the HTTP listener — no new connections; existing ones drain.
  if (sup.httpServer) {
    try {
      sup.httpServer.close();
    } catch {
      /* already closing */
    }
  }

  // HTTP DRAIN FIRST: wait for active requests + SSE streams to reach zero (bounded).
  const deadline = Date.now() + DRAIN_MS;
  while ((sup.activeRequests ?? 0) > 0 && Date.now() < deadline) await sleep(100);

  // THEN stop the components in parallel (bounded — never short-circuits the drain above).
  await Promise.race([
    Promise.allSettled((sup.stops ?? []).map((s) => Promise.resolve().then(s).catch(() => {}))),
    sleep(3000),
  ]);
  process.exit(0);
}
process.on("SIGTERM", () => gracefulStop("SIGTERM"));
process.on("SIGINT", () => gracefulStop("SIGINT"));

// Boot the built server in-process (HTTP + world + control + leader via the plugin).
await import(new URL("../.output/server/index.mjs", import.meta.url).href);
console.log(`[clara-serve] supervisor up (crash-only) pid=${process.pid} world=${process.env.CLARA_START_WORLD ?? "0"}`);
