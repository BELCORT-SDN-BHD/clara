import { checkReadiness } from "./health.mjs";

/** The shipped /ready HTTP handler. Kept in plain ESM so the DB-backed runtime suite can
 * exercise the exact status/body mapping that src/index.ts mounts, without reimplementing it. */
export async function readinessHandler(_req, res) {
  const supervisor = globalThis.__claraSupervisor;
  if (supervisor?.shuttingDown) {
    res.status(503).json({
      ready: false,
      checks: { shutdown: true },
      failures: [{ check: "shutdown", reason: "runtime_shutting_down" }],
      warnings: [],
      ts: new Date().toISOString(),
    });
    return;
  }
  const result = await checkReadiness();
  res.status(result.ready ? 200 : 503).json({
    ready: result.ready,
    checks: result.checks,
    failures: result.failures,
    warnings: result.warnings,
    ts: new Date().toISOString(),
  });
}
