// P4 tranche-2 -- ask 2: clara.request_firm_registration. The self-serve door an authenticated,
// no-membership session calls to enter the operator's queue.

import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_USER_ID, CLR, assertRaises, opk, rootQuery, roleQuery, insertUser, createFirm, seedAdmission, getPool } from "./rig-fixtures.mjs";
import { requestFirmRegistration, rawRegistrationRequest } from "./p4t2-fixtures.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll (bounded) until backend `pid` is observably WAITING (wait_event_type='Lock') on a lock
 *  held by `blockerPid`. Mirrors p4t1-add-member-regression.test.mjs's own local copy (itself
 *  mirroring rig-runtime-race.mjs's convention, db-tests.md: "never a sleep, which proves
 *  nothing about whether the block actually happened") -- copied locally rather than
 *  cross-imported from another test area's own helper module. */
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

async function unclaimedActor(tag) {
  // A raw jwt_sub with a real clara.users row (request_firm_registration requires the actor to
  // exist in clara.users, matching create_firm's own wall) but NO membership -- the identity-gap
  // door (0141 claim_identity) isn't this file's subject, so insertUser stands in for "already
  // claimed, never joined a firm".
  return insertUser("p4t2reg", tag);
}

test("p4t2.request: an unauthenticated call (no jwt_sub) refuses CLR04", async () => {
  await assertRaises(
    CLR.authz,
    () => roleQuery("clara_authenticated", "select clara.request_firm_registration(p_firm_name => $1, p_note => $2, p_op_key => $3)", ["X", null, opk("noauth")]),
    "request_firm_registration with no jwt_sub",
  );
});

test("p4t2.request: a blank op_key refuses CLR10", async () => {
  const actor = await unclaimedActor("blankop");
  await assertRaises(CLR.badRequest, () => requestFirmRegistration(actor, { firmName: "Blank Op Co", opKey: "" }), "request_firm_registration blank op_key");
});

test("p4t2.request: a blank firm name refuses CLR10", async () => {
  const actor = await unclaimedActor("blankname");
  await assertRaises(CLR.badRequest, () => requestFirmRegistration(actor, { firmName: "   ", opKey: opk("blankname") }), "request_firm_registration blank name");
});

test("p4t2.request: the fixed agent identity refuses (CLR04, unknown/agent actor -- it has no genuine session anyway)", async () => {
  await assertRaises(
    CLR.authz,
    () => requestFirmRegistration(AGENT_USER_ID, { firmName: "Agent Co", opKey: opk("agentreg") }),
    "request_firm_registration as the agent id",
  );
});

test("p4t2.request: a successful request mints exactly one open row, readable back with the applicant's own args", async () => {
  const actor = await unclaimedActor("happy");
  const r = await requestFirmRegistration(actor, { firmName: "Happy Sdn Bhd", note: "first-time applicant", opKey: opk("happy") });
  assert.ok(r.request_id);
  assert.equal(r.status, "open");
  const row = await rawRegistrationRequest(r.request_id);
  assert.equal(row.applicant, actor);
  assert.equal(row.firm_name, "Happy Sdn Bhd");
  assert.equal(row.note, "first-time applicant");
  assert.equal(row.status, "open");
});

test("p4t2.request: an actor already holding an active membership refuses CLR09, and no request row is created", async () => {
  const owner = await insertUser("p4t2reg", "existing_owner");
  const token = await seedAdmission("p4t2-reg-existing");
  await createFirm(owner, { name: `P4T2 Existing ${Date.now()}`, token, opKey: opk("existingfirm") });
  await assertRaises(CLR.lastOwner, () => requestFirmRegistration(owner, { firmName: "Second Firm Attempt", opKey: opk("existing-req") }), "request_firm_registration while already a member");
  const n = await rootQuery("select count(*)::int as n from clara.firm_registration_requests where applicant = $1", [owner]);
  assert.equal(n.rows[0].n, 0);
});

test("p4t2.request: a SECOND open request for the same applicant (different op_key) refuses CLR09, and only one row survives", async () => {
  const actor = await unclaimedActor("dupreq");
  const first = await requestFirmRegistration(actor, { firmName: "First Attempt Co", opKey: opk("dup1") });
  assert.ok(first.request_id);
  await assertRaises(CLR.lastOwner, () => requestFirmRegistration(actor, { firmName: "Second Attempt Co", opKey: opk("dup2") }), "request_firm_registration second open request");
  const n = await rootQuery("select count(*)::int as n from clara.firm_registration_requests where applicant = $1", [actor]);
  assert.equal(n.rows[0].n, 1);
});

test("p4t2.request: an op_key replay (SAME actor, SAME op_key) returns the SAME receipt, not a second row or a refusal", async () => {
  const actor = await unclaimedActor("replay");
  const key = opk("replay-key");
  const first = await requestFirmRegistration(actor, { firmName: "Replay Co", opKey: key });
  const second = await requestFirmRegistration(actor, { firmName: "Replay Co", opKey: key });
  assert.deepEqual(second, first);
  const n = await rootQuery("select count(*)::int as n from clara.firm_registration_requests where applicant = $1", [actor]);
  assert.equal(n.rows[0].n, 1, "a genuine op_key retry must never mint a second row");
});

test("p4t2.request: F6 -- reusing an op_key with a DIFFERENT firm_name refuses CLR10 (op_key reused with different args), and no second row is created", async () => {
  const actor = await unclaimedActor("f6args");
  const key = opk("f6args-key");
  const first = await requestFirmRegistration(actor, { firmName: "F6 Original Co", opKey: key });
  assert.ok(first.request_id);
  await assertRaises(CLR.badRequest, () => requestFirmRegistration(actor, { firmName: "F6 Different Co", opKey: key }), "request_firm_registration op_key reused with different firm_name");
  const n = await rootQuery("select count(*)::int as n from clara.firm_registration_requests where applicant = $1", [actor]);
  assert.equal(n.rows[0].n, 1, "the mismatched-args attempt must not mint a second row");
});

test("p4t2.request: F6 -- reusing an op_key with a DIFFERENT note (same firm_name) also refuses CLR10", async () => {
  const actor = await unclaimedActor("f6note");
  const key = opk("f6note-key");
  await requestFirmRegistration(actor, { firmName: "F6 Note Co", note: "first note", opKey: key });
  await assertRaises(CLR.badRequest, () => requestFirmRegistration(actor, { firmName: "F6 Note Co", note: "different note", opKey: key }), "request_firm_registration op_key reused with different note");
});

test("p4t2.request: F6 -- an op_key that already decided a request (approved/rejected) is used up: identical args still replay the OLD receipt (now reflecting its current status), a FRESH op_key is required for a genuinely new request", async () => {
  const actor = await unclaimedActor("f6decided");
  const key = opk("f6decided-key");
  const first = await requestFirmRegistration(actor, { firmName: "F6 Decided Co", opKey: key });
  assert.equal(first.status, "open");

  // Reject it directly (root, bypassing the operator ceremony -- this file only proves the
  // request-door's own replay contract, not the decision doors, which have their own battery).
  await rootQuery(
    "update clara.firm_registration_requests set status = 'rejected', decided_at = now(), reason = 'f6 fixture' where id = $1",
    [first.request_id],
  );

  // Identical args, same op_key: replays the SAME row, now reporting its CURRENT (rejected) status
  // -- not a fabricated frozen receipt, and not a fresh "open" row.
  const replay = await requestFirmRegistration(actor, { firmName: "F6 Decided Co", opKey: key });
  assert.equal(replay.request_id, first.request_id);
  assert.equal(replay.status, "rejected");
  const n1 = await rootQuery("select count(*)::int as n from clara.firm_registration_requests where applicant = $1", [actor]);
  assert.equal(n1.rows[0].n, 1, "a replay after rejection must never mint a second row");

  // A FRESH op_key opens a genuinely new request for the same applicant (the old row is no
  // longer 'open', so the open-applicant partial-unique index does not block it).
  const second = await requestFirmRegistration(actor, { firmName: "F6 Decided Co Take Two", opKey: opk("f6decided-fresh") });
  assert.equal(second.status, "open");
  assert.notEqual(second.request_id, first.request_id);
  const n2 = await rootQuery("select count(*)::int as n from clara.firm_registration_requests where applicant = $1", [actor]);
  assert.equal(n2.rows[0].n, 2);
});

test("p4t2.request: F6 -- a concurrent IDENTICAL pair (SAME actor, op_key, and args, racing on two connections) yields a replay for BOTH callers, never a spurious CLR09 for the loser -- PROVEN via an observed block, never a sleep", async () => {
  const actor = await unclaimedActor("f6race");
  const key = opk("f6race-key");

  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  let loserOutcome;
  let blocked = false;
  try {
    // T1: an explicit, held-open transaction inserting the request row (uncommitted).
    await c1.query("set role clara_authenticated");
    await c1.query("begin");
    await c1.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: actor, role: "authenticated" }),
    ]);
    const t1Result = await c1.query(
      "select clara.request_firm_registration(p_firm_name => $1, p_note => $2, p_op_key => $3) as receipt",
      ["F6 Race Co", null, key],
    );
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;

    // T2: a SEPARATE, ordinary autocommitting call on ANOTHER connection -- the SAME actor,
    // SAME op_key, SAME args -- fired while T1's transaction is still open (uncommitted). T2's
    // own replay lookup cannot see T1's uncommitted row (MVCC), so T2 also attempts the INSERT
    // and blocks on uq_firm_registration_requests_open_applicant until T1 resolves.
    await c2.query("set role clara_authenticated");
    await c2.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ sub: actor, role: "authenticated" }),
    ]);
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    const t2Promise = c2
      .query("select clara.request_firm_registration(p_firm_name => $1, p_note => $2, p_op_key => $3) as receipt", ["F6 Race Co", null, key])
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    blocked = await waitBlockedByOrThrow(pid2, pid1);
    // Only NOW does T1 commit -- releasing T1's hold is what lets T2's insert re-check the
    // (now-committed) unique index and discover the conflict.
    await c1.query("commit");
    loserOutcome = await t2Promise;

    assert.ok(blocked, "T2 must be observably blocked on T1's uncommitted insert -- a race that never blocked proves nothing");
    assert.equal(loserOutcome.ok, true, "the loser of the race must be REPLAYED, never refused with a spurious CLR09");
    assert.deepEqual(loserOutcome.r.rows[0].receipt, t1Result.rows[0].receipt, "both callers must see the SAME receipt");
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
  const n = await rootQuery("select count(*)::int as n from clara.firm_registration_requests where applicant = $1", [actor]);
  assert.equal(n.rows[0].n, 1, "exactly one request row survives the race");
});

test("p4t2.request: no _audit row and no domain event fire -- the identical structural reason claim_identity (0141) documents: no firm_id exists yet to scope either under", async () => {
  const actor = await unclaimedActor("noaudit");
  const before = await rootQuery("select count(*)::int as n from clara.audit_log");
  await requestFirmRegistration(actor, { firmName: "No Audit Co", opKey: opk("noaudit") });
  const after = await rootQuery("select count(*)::int as n from clara.audit_log");
  assert.equal(after.rows[0].n, before.rows[0].n, "request_firm_registration must not write an audit_log row");
});
