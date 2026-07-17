import "dotenv/config";
import { randomUUID } from "node:crypto";
import { describeTarget, makeClient, requireDatabaseUrl } from "./util.js";

// T5: LISTEN/NOTIFY round trip through the DATABASE_URL connection
// (Supavisor SESSION mode must pass; transaction mode 6543 must fail).
// Two separate connections so the NOTIFY crosses the server, not the socket.
const CHANNEL = "spike_probe";
const payload = `probe-${randomUUID()}`;

const listener = makeClient();
const notifier = makeClient();

try {
  await listener.connect();
  await notifier.connect();

  const version = await notifier.query("select version() as v");
  console.log(`target:  ${describeTarget(requireDatabaseUrl())}`);
  console.log(`server:  ${version.rows[0]?.v}`);

  const received = new Promise<{ payload: string; ms: number }>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("timed out after 10s waiting for NOTIFY (transaction-mode pooler? port 6543 does not support LISTEN/NOTIFY - use session mode on 5432)")),
      10_000,
    );
    const startedAt = Date.now();
    listener.on("notification", (msg) => {
      if (msg.channel === CHANNEL && msg.payload === payload) {
        clearTimeout(timeout);
        resolve({ payload: msg.payload, ms: Date.now() - startedAt });
      }
    });
  });

  await listener.query(`listen ${CHANNEL}`);
  await notifier.query("select pg_notify($1, $2)", [CHANNEL, payload]);

  const result = await received;
  console.log(`PASS: LISTEN/NOTIFY round trip ok (payload matched, ${result.ms}ms)`);
  process.exitCode = 0;
} catch (err) {
  console.error(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await listener.end().catch(() => {});
  await notifier.end().catch(() => {});
}
