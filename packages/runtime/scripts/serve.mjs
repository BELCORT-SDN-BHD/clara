// The supervisor (Slice 4, contract §4.1). Runs the WHOLE runtime as ONE crash-only
// process group: it composes the environment, installs the crash-only + SIGTERM
// policy, then boots the built Nitro server IN-PROCESS (HTTP + world + control +
// leader loop, via plugins/startWorld.ts). Because everything shares this one
// process, ANY required component's unhandled rejection / uncaught exception —
// including a world-start failure (process.exit(1) inside the plugin) or a taxonomy
// HALT (process.exit(2) inside the leader) — terminates the group non-zero, and Fly
// restarts it. This is the "one always-on machine, non-HA, explicit" model.
//
// SIGTERM: stop intake -> bounded drain -> exit 0 (Fly's graceful stop). The
// bounded window lets in-flight HTTP + the current leader/control cycle settle; the
// durable engine loses nothing on a hard stop (every run is crash-safe by design).

// --- env composition (mirrors scripts/worker.mjs; serve = production = world on) ---
process.env.CLARA_START_WORLD ??= "1";
if (!process.env.WORKFLOW_POSTGRES_URL && process.env.DATABASE_URL) {
  process.env.WORKFLOW_POSTGRES_URL = process.env.DATABASE_URL;
}
process.env.WORKFLOW_TARGET_WORLD ??= "@workflow/world-postgres";
process.env.PORT ??= "3200";

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

function requestStop(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[clara-serve] ${sig} — stopping intake, bounded drain (${DRAIN_MS}ms) then exit`);
  // Bounded drain: give in-flight work a window, then exit cleanly. Fly SIGKILLs
  // after its own grace period if we overrun.
  setTimeout(() => process.exit(0), DRAIN_MS).unref?.();
}
process.on("SIGTERM", () => requestStop("SIGTERM"));
process.on("SIGINT", () => requestStop("SIGINT"));

// Boot the built server in-process (HTTP + world + control + leader via the plugin).
await import(new URL("../.output/server/index.mjs", import.meta.url).href);
console.log(`[clara-serve] supervisor up (crash-only) pid=${process.pid} world=${process.env.CLARA_START_WORLD}`);
