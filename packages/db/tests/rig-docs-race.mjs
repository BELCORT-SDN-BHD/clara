// Slice-5 rig — two-session forced-schedule drivers (NOT a test file). The X7 law
// throughout: PROVE the block via pg_blocking_pids BEFORE releasing — a schedule
// that never blocked proves nothing (brief §5). Because many S5 writers are
// contract-silent on name/signature, these drivers are GENERIC: each side supplies
// a `run(client)` callback the TEST builds from the resolved fn, and the driver
// owns only the schedule + client hygiene (rollback → reset role → reset session
// authorization → reset all → release), identical to rig-runtime-race.mjs.

import { getPool, rootQuery } from "./rig-docs-fixtures.mjs";
import { waitBlockedBy } from "./rig-runtime-race.mjs";

export { waitBlockedBy };

async function cleanup(clients) {
  for (const c of clients) {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset session authorization").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** Apply a side's identity (role + human/wake GUC) to a fresh txn-open client. */
async function enter(client, side) {
  const pid = (await client.query("select pg_backend_pid() as pid")).rows[0].pid;
  if (side.role) await client.query(`set role ${side.role}`);
  await client.query("begin");
  if (side.jwtSub != null) {
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: side.jwtSub, role: "authenticated" })]);
  }
  if (side.wakeSecret != null) {
    await client.query("select set_config('clara.wake_secret', $1, true)", [side.wakeSecret]);
  }
  return pid;
}

/**
 * HOLD-then-CONTEND schedule (§3.6 reservation storm / §3.2 intake PUT exclusion):
 * side `a` opens a txn and runs its statement (acquiring + HOLDING a lock,
 * uncommitted); side `b`'s statement is FIRED-not-awaited and must BLOCK — proven
 * via pg_blocking_pids — until `a` commits, then it resolves against a's COMMITTED
 * state. Returns { a, b, provedBlocked }; each side = { ok, receipt?|code?, message? }.
 */
export async function holdThenContend({ a, b }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null, provedBlocked: false };
  try {
    const pid1 = await enter(c1, a);
    try {
      out.a = { ok: true, receipt: await a.run(c1) };
    } catch (e) {
      out.a = { ok: false, code: e.code, message: `${e.message} ${e.detail ?? ""}`.trim() };
    }

    const pid2 = await enter(c2, b);
    const p2 = Promise.resolve()
      .then(() => b.run(c2))
      .then((receipt) => { out.b = { ok: true, receipt }; })
      .catch((e) => { out.b = { ok: false, code: e.code, message: `${e.message} ${e.detail ?? ""}`.trim() }; });

    out.provedBlocked = await waitBlockedBy(pid2, pid1);
    await c1.query("commit").catch(() => c1.query("rollback").catch(() => {}));
    await p2;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    await cleanup([c1, c2]);
  }
  return out;
}

/**
 * CONCURRENT schedule (the lock-order deadlock probe — §3.5 posting-vs-retirement):
 * both sides open txns and fire concurrently, each COMMITTING the moment its OWN
 * statement resolves (so a block on the other's row lock resolves when the holder
 * commits, instead of a client-orchestration deadlock). A genuine DB deadlock still
 * surfaces as 40P01 on the loser — the point of the probe: with a consistent global
 * lock order there is NONE. Returns { a, b } outcomes.
 */
export async function concurrentTwoSession({ a, b }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null };
  try {
    await enter(c1, a);
    await enter(c2, b);
    const p1 = (async () => {
      try { out.a = { ok: true, receipt: await a.run(c1) }; }
      catch (e) { out.a = { ok: false, code: e.code, message: e.message }; }
      finally { await c1.query("commit").catch(() => c1.query("rollback").catch(() => {})); }
    })();
    const p2 = (async () => {
      try { out.b = { ok: true, receipt: await b.run(c2) }; }
      catch (e) { out.b = { ok: false, code: e.code, message: e.message }; }
      finally { await c2.query("commit").catch(() => c2.query("rollback").catch(() => {})); }
    })();
    await Promise.all([p1, p2]);
  } finally {
    await cleanup([c1, c2]);
  }
  return out;
}

/** Whether a driver outcome pair contains a serialization/deadlock SQLSTATE. */
export function sawDeadlock(out) {
  return [out.a, out.b].some((s) => s && s.ok === false && (s.code === "40P01" || s.code === "40001"));
}

/** Convenience: the count of clara rows matching a predicate (root). */
export async function countWhere(table, whereSql, params) {
  const r = await rootQuery(`select count(*)::int as n from clara.${table} where ${whereSql}`, params);
  return r.rows[0].n;
}
