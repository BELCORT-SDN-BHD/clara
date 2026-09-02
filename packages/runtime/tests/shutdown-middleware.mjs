// STANDALONE in-process check of the FX2 shutdown MIDDLEWARE (src/index.ts). Unlike
// shutdown-e2e (which needs an OS SIGTERM the graceful handler catches — impossible on
// win32, where child.kill('SIGTERM') unconditionally terminates the target), this test
// imports the express app directly and drives the middleware itself, so it verifies the
// load-bearing FX2 behaviour on EVERY platform:
//   (1) the middleware captures the HTTP listener into __claraSupervisor.httpServer,
//   (2) while shuttingDown, NEW intake is refused 503 GLOBALLY (all routes) EXCEPT
//       /health liveness (which must keep answering 200 for the platform),
//   (3) in-flight requests are counted in activeRequests and decremented on finish,
//   (4) /ready reports 503 (not ready) while draining.
// Run (needs the tsx loader for the TS app):  node --import tsx tests/shutdown-middleware.mjs
//
// No DB is touched: /health, /ready(shutdown short-circuit), and the 503 gate all run
// BEFORE any pool checkout. TEST_MODE keeps the pool import fail-open.

import http from "node:http";

process.env.TEST_MODE = "1";
process.env.RELAY_TEST_MODE = "1";

const sup = (globalThis.__claraSupervisor ??= { shuttingDown: false, stops: [], activeRequests: 0 });

const { default: app } = await import("../src/index.ts");

const server = http.createServer(app);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}`;

let failed = false;
const check = (name, cond) => {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failed = true;
    console.error(`  FAIL ${name}`);
  }
};

try {
  // (1) A normal request while UP → 200, and the listener is captured.
  const up = await fetch(`${BASE}/health`);
  check("health 200 while up", up.status === 200);
  check("middleware captured the http listener", sup.httpServer === server);

  // /workflows is a real non-/health route with no DB dependency → 200 while up.
  check("non-health route 200 while up", (await fetch(`${BASE}/workflows`)).status === 200);

  // (2)+(4) Flip the drain flag — exactly what serve.mjs's gracefulStop does.
  sup.shuttingDown = true;
  const drainHealth = await fetch(`${BASE}/health`);
  check("health STILL 200 while draining (liveness never 503s)", drainHealth.status === 200);
  const drainWorkflows = await fetch(`${BASE}/workflows`);
  check("non-health route 503 while draining (global gate)", drainWorkflows.status === 503);
  const body = await drainWorkflows.json().catch(() => ({}));
  check("503 body says shutting_down", body.error === "shutting_down");
  const drainReady = await fetch(`${BASE}/ready`);
  const readyBody = await drainReady.json().catch(() => ({}));
  check("/ready 503 while draining", drainReady.status === 503);
  check(
    "/ready emits the exact structured shutdown readiness envelope",
    JSON.stringify({ ...readyBody, ts: "<timestamp>" }) === JSON.stringify({
      ready: false,
      checks: { shutdown: true },
      failures: [{ check: "shutdown", reason: "runtime_shutting_down" }],
      warnings: [],
      ts: "<timestamp>",
    }),
  );
  check("/ready shutdown envelope carries an ISO timestamp", !Number.isNaN(Date.parse(readyBody.ts)));

  for (const path of ["/ready/", "/READY"]) {
    const variant = await fetch(`${BASE}${path}`);
    const variantBody = await variant.json().catch(() => ({}));
    check(`${path} 503 while draining`, variant.status === 503);
    check(
      `${path} uses the structured readiness envelope while draining`,
      variantBody.ready === false &&
        variantBody.checks?.shutdown === true &&
        variantBody.failures?.[0]?.reason === "runtime_shutting_down",
    );
  }

  const doubleSlashReady = await fetch(`${BASE}/ready//`);
  const doubleSlashBody = await doubleSlashReady.json().catch(() => ({}));
  check(
    "GET /ready// uses the global drain response",
    doubleSlashReady.status === 503 && doubleSlashBody.error === "shutting_down",
  );

  const headReady = await fetch(`${BASE}/ready`, { method: "HEAD" });
  const headReadyBody = await headReady.text();
  check("HEAD /ready uses the readiness-handler status", headReady.status === drainReady.status);
  check(
    "HEAD /ready uses the readiness-handler headers",
    headReady.headers.get("content-type") === drainReady.headers.get("content-type") &&
      headReady.headers.get("content-length") === drainReady.headers.get("content-length"),
  );
  check("HEAD /ready is bodyless", headReadyBody === "");

  const postReady = await fetch(`${BASE}/ready`, { method: "POST" });
  const postReadyBody = await postReady.json().catch(() => ({}));
  check("POST /ready uses the global drain response", postReady.status === 503 && postReadyBody.error === "shutting_down");

  const drainHealthSlash = await fetch(`${BASE}/health/`);
  check("/health/ STILL 200 while draining", drainHealthSlash.status === 200);

  // (3) Active-request tracking returns to zero after each request settles (finish/close
  // both decrement, once-guarded). After all the awaited fetches above, it must be 0.
  sup.shuttingDown = false; // let one more clean request through and confirm the counter balances
  await fetch(`${BASE}/workflows`);
  // give the 'finish'/'close' listeners a tick to run
  await new Promise((r) => setTimeout(r, 50));
  check("activeRequests balanced back to 0", (sup.activeRequests ?? -1) === 0);
} finally {
  server.close();
}

if (failed) {
  console.error("\nSHUTDOWN MIDDLEWARE: FAIL");
  process.exit(1);
}
console.log("\nSHUTDOWN MIDDLEWARE: PASS");
process.exit(0);
