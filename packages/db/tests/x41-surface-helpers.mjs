// 0041 Wave D-a — the x41.m SERIALIZATION machinery, split out of x41-surface.test.mjs
// (NOT a test file: the name does not end in `.test.mjs`, so `node --test` ignores it).
// Split for one reason only: the D-b (0042) census re-pins in x41.k1 pushed the surface
// battery past the repo's 500-line file ceiling — the house remedy is to extract helpers,
// never to drop cells or shrink the comments that carry the law.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header). Everything here is fixture plumbing for
// design §3.2/§4.1: the two-session race on the 203005004 client advisory rung.

import {
  getPool, ROLES, noteLane, mon, dayIn, freshFaClient, buyAsset, completeSL,
  liveAuthority, earnRamp,
} from "./x41-fa-world.mjs";
import { waitBlockedByOrThrow } from "./wave-b/wb-fixtures.mjs";

export const DISPOSE_SQL = `select clara.dispose_fixed_asset(p_client => $1, p_asset => $2,
  p_disposal_date => $3::date, p_proceeds_cents => $4::bigint, p_proceeds_account => $5,
  p_gain_account => $6, p_loss_account => $7, p_memo => $8, p_op_key => $9) as r`;
export const RUN_SQL = `select clara.run_depreciation_period(p_client => $1, p_period_start => $2::date,
  p_period_end => $3::date, p_op_key => $4) as r`;

/** Two sessions on the SAME client: A takes the rung and holds it; B contends and is
 *  PROVEN blocked before A commits. Returns {a, b, provedBlocked}. */
export async function raceOnRung({ first, second }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null, provedBlocked: false };
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await first.begin(c1);
    await c1.query(first.sql, first.params);

    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await second.begin(c2);
    await c2.query("set statement_timeout = '20s'");
    const p2 = c2.query(second.sql, second.params)
      .then((r) => { out.b = { ok: true, result: r.rows[0].r }; })
      .catch((e) => { out.b = { ok: false, code: e.code, detail: e.detail, message: e.message }; });

    try {
      await waitBlockedByOrThrow(pid2, pid1, { what: "the 203005004 client advisory rung" });
      out.provedBlocked = true;
    } catch (e) {
      noteLane(`x41.m block not observed (${e.message}) — the rung placement is a FINDING`);
    }
    await c1.query("commit");
    out.a = { ok: true };
    await p2;
    if (out.b?.ok) await c2.query("commit").catch((e) => { out.b = { ok: false, code: e.code }; });
    else await c2.query("rollback").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}

export const beginHuman = (sub) => async (c) => {
  await c.query(`set role ${ROLES.authenticated}`);
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
};
export const beginRuntime = async (c) => {
  await c.query(`set role ${ROLES.runtime}`);
  await c.query("begin");
};

/** A client with ONE ramp-earned depreciable asset, poised on the NEXT due month. */
export async function rungFixture(label) {
  const client = await freshFaClient(label);
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: `x41 ${label}` });
  await liveAuthority(client);
  await earnRamp(client, start);
  return { client, asset: asset.id, next: mon(-2) };
}
