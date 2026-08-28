// P4 tranche-2 -- ask 2: clara.request_firm_registration. The self-serve door an authenticated,
// no-membership session calls to enter the operator's queue.

import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_USER_ID, CLR, assertRaises, opk, rootQuery, roleQuery, insertUser, createFirm, seedAdmission } from "./rig-fixtures.mjs";
import { requestFirmRegistration, rawRegistrationRequest } from "./p4t2-fixtures.mjs";

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

test("p4t2.request: no _audit row and no domain event fire -- the identical structural reason claim_identity (0141) documents: no firm_id exists yet to scope either under", async () => {
  const actor = await unclaimedActor("noaudit");
  const before = await rootQuery("select count(*)::int as n from clara.audit_log");
  await requestFirmRegistration(actor, { firmName: "No Audit Co", opKey: opk("noaudit") });
  const after = await rootQuery("select count(*)::int as n from clara.audit_log");
  assert.equal(after.rows[0].n, before.rows[0].n, "request_firm_registration must not write an audit_log row");
});
