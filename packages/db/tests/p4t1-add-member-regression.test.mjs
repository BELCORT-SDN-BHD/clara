// P4 tranche-1 -- regression: clara.add_member's recut (its body now delegates to the new
// _add_member_core, §D) must refuse and succeed EXACTLY as the live 0005 body did. This is a
// focused smoke test of the four walls the extraction moved, not a re-litigation of the wider
// Slice-2 add_member coverage that already runs elsewhere in the estate suite.

import test from "node:test";
import assert from "node:assert/strict";
import { CLR, opk, rootQuery, humanQuery, insertUser, createFirm, seedAdmission, AGENT_USER_ID, membershipId, getPool } from "./rig-fixtures.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll (bounded) until backend `pid` is observably WAITING (wait_event_type='Lock') on a
 *  lock held by `blockerPid`. Mirrors rig-runtime-race.mjs's waitBlockedBy / wb-calls.mjs's
 *  waitBlockedByOrThrow convention (db-tests.md: "never a sleep, which proves nothing about
 *  whether the block actually happened"), copied locally rather than cross-imported from
 *  another test area's own helper module. */
async function waitBlockedByOrThrow(pid, blockerPid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(25);
  }
  throw new Error(`waitBlockedByOrThrow: backend ${pid} never observably blocked on blocker ${blockerPid} within ${timeoutMs}ms`);
}

async function scene(tag) {
  const owner = await insertUser("p4t1amreg", `${tag}_owner`);
  const token = await seedAdmission(`p4t1-amreg-${tag}`);
  const firm = await createFirm(owner, { name: `P4T1 AM Regression ${tag} ${Date.now()}`, token, opKey: opk(`firm_${tag}`) });
  return { firm, owner };
}

test("p4t1.add_member_regression: a non-admin refuses CLR04", async () => {
  const sc = await scene("floor");
  const viewer = await insertUser("p4t1amreg", "floor_viewer");
  await humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc.firm, viewer, "viewer", opk("floor_seed")]);
  const target = await insertUser("p4t1amreg", "floor_target");
  await assert.rejects(
    () => humanQuery(viewer, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc.firm, target, "viewer", opk("floor_try")]),
    (e) => e.code === CLR.authz,
  );
});

test("p4t1.add_member_regression: an unknown role refuses CLR10", async () => {
  const sc = await scene("badrole");
  const target = await insertUser("p4t1amreg", "badrole_target");
  await assert.rejects(
    () => humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc.firm, target, "superadmin", opk("badrole")]),
    (e) => e.code === CLR.badRequest,
  );
});

test("p4t1.add_member_regression: the agent identity cannot be added (HIGH-11, CLR10) -- now enforced inside _add_member_core", async () => {
  const sc = await scene("agent");
  await assert.rejects(
    () => humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc.firm, AGENT_USER_ID, "viewer", opk("agent")]),
    (e) => e.code === CLR.badRequest,
  );
});

test("p4t1.add_member_regression: a user with an active membership elsewhere refuses CLR10 (the global unique index, now checked inside the core)", async () => {
  const sc1 = await scene("dupA");
  const sc2 = await scene("dupB");
  const person = await insertUser("p4t1amreg", "dup_person");
  await humanQuery(sc1.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc1.firm, person, "viewer", opk("dup1")]);
  await assert.rejects(
    () => humanQuery(sc2.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc2.firm, person, "viewer", opk("dup2")]),
    (e) => e.code === CLR.badRequest,
  );
});

test("p4t1.add_member_regression: a cross-firm p_firm refuses CLR11 (still checked at the entrance, not the core)", async () => {
  const sc1 = await scene("crossA");
  const sc2 = await scene("crossB");
  const target = await insertUser("p4t1amreg", "cross_target");
  await assert.rejects(
    () => humanQuery(sc1.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc2.firm, target, "viewer", opk("cross")]),
    (e) => e.code === CLR.notFound,
  );
});

test("p4t1.add_member_regression: a successful add mints an active membership, an op_key replay is idempotent, and both _audit + member.added land", async () => {
  const sc = await scene("happy");
  const target = await insertUser("p4t1amreg", "happy_target");
  const key = opk("happy");
  const r1 = await humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4) as receipt", [sc.firm, target, "bookkeeper", key]);
  const r2 = await humanQuery(sc.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4) as receipt", [sc.firm, target, "bookkeeper", key]);
  assert.deepEqual(r2.rows[0].receipt, r1.rows[0].receipt);

  const mid = await membershipId(sc.firm, target, "active");
  assert.ok(mid);
  const audit = await rootQuery("select fn from clara.audit_log where firm_id = $1 and fn = 'add_member' order by at desc limit 1", [sc.firm]);
  assert.equal(audit.rows[0].fn, "add_member");
  const evt = await rootQuery("select event_type from clara.domain_events where firm_id = $1 order by seq desc limit 1", [sc.firm]);
  assert.equal(evt.rows[0].event_type, "member.added");
});

test("p4t1.add_member_regression: [C4] a concurrent cross-firm race on the SAME user is caught by _add_member_core's own unique_violation catch, not a raw 23505 -- PROVEN via an observed block, never a sleep", async () => {
  const sc1 = await scene("c4a");
  const sc2 = await scene("c4b");
  const target = await insertUser("p4t1amreg", "c4_target");
  const key1 = opk("c4-t1");
  const key2 = opk("c4-t2");

  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  let loserOutcome;
  let blocked = false;
  try {
    // T1: an explicit, held-open transaction. The per-firm `for update` lock inside
    // _add_member_core only serializes callers naming the SAME p_firm, so it does nothing
    // to stop this cross-firm race -- that gap is exactly what C4 closes.
    await c1.query("set role clara_authenticated");
    await c1.query("begin");
    await c1.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: sc1.owner, role: "authenticated" }),
    ]);
    await c1.query(
      "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)",
      [sc1.firm, target, "viewer", key1],
    );
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;

    // T2: a SEPARATE, ordinary autocommitting call on ANOTHER connection, a different admin,
    // a different firm -- fired while T1's transaction is still open (uncommitted).
    await c2.query("set role clara_authenticated");
    await c2.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: sc2.owner, role: "authenticated" }),
    ]);
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    const t2Promise = c2
      .query("select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [sc2.firm, target, "viewer", key2])
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    blocked = await waitBlockedByOrThrow(pid2, pid1);
    // Only NOW does T1 commit -- releasing T1's hold is what lets T2's insert re-check the
    // (now-committed) unique index and discover the conflict. Committing before proving the
    // block would mean T2 never actually raced T1 at all.
    await c1.query("commit");
    loserOutcome = await t2Promise;
  } finally {
    await c1.query("rollback").catch(() => {});
    await c1.query("reset role").catch(() => {});
    await c1.query("reset all").catch(() => {});
    c1.release();
    await c2.query("rollback").catch(() => {});
    await c2.query("reset role").catch(() => {});
    await c2.query("reset all").catch(() => {});
    c2.release();
  }

  assert.ok(blocked, "T2 must be observably blocked on T1's uncommitted insert -- a race that never blocked proves nothing");
  assert.equal(loserOutcome.ok, false, "T2 must be refused, not silently succeed with a second active membership");
  assert.equal(loserOutcome.e.code, CLR.badRequest, "the refusal must be the SAME typed CLR10 the exists-check itself raises, not a raw 23505 unique_violation");
  const n = await rootQuery("select count(*)::int as n from clara.firm_memberships where user_id = $1 and status = 'active'", [target]);
  assert.equal(n.rows[0].n, 1, "exactly one active membership survives the race -- the loser's insert never sticks");
});
