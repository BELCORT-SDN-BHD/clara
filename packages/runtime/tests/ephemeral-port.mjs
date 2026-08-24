// CI jobs from different PRs share the runner host's network namespace; any fixed
// default port cross-wires one job's client into another job's spawned runtime (the
// 401 jwt_signature class, 2026-08-24). The OS hands out a genuinely free port; the
// bind-then-release gap is the standard, vanishingly small TOCTOU.
import { createServer } from "node:net";

export async function ephemeralPort() {
  const srv = createServer();
  await new Promise((resolve, reject) => {
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", resolve);
  });
  const port = srv.address().port;
  await new Promise((resolve) => srv.close(resolve));
  return String(port);
}
