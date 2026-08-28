// P4 tranche-2 -- ask 8: clara.approve_firm_registration / reject_firm_registration, and the
// create_firm regression this file's own _create_firm_core extraction must not disturb.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AGENT_USER_ID, CLR, assertRaises, opk, rootQuery, humanQuery, insertUser, createFirm, seedAdmission, addMember } from "./rig-fixtures.mjs";
import { requestFirmRegistration, approveFirmRegistration, rejectFirmRegistration, rawRegistrationRequest, markOperator, clearOperator } from "./p4t2-fixtures.mjs";

// Leave a clean is_operator slate for whichever file runs next in the same suite invocation --
// see markOperator's own header note (p4t2-fixtures.mjs) for why this is unscoped.
after(clearOperator);

/** A firm marked is_operator, with an owner and a bookkeeper (below the ask-8 floor). */
async function operatorScene(tag) {
  const owner = await insertUser("p4t2op", `${tag}_owner`);
  const token = await seedAdmission(`p4t2-op-${tag}`);
  const firm = await createFirm(owner, { name: `P4T2 Operator ${tag} ${Date.now()}`, token, opKey: opk(`opfirm_${tag}`) });
  await markOperator(firm);
  const bookkeeper = await insertUser("p4t2op", `${tag}_bk`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm, bookkeeper, "bookkeeper", opk(`addbk_${tag}`),
  ]);
  return { firm, owner, bookkeeper };
}

async function applicant(tag) {
  return insertUser("p4t2op", `${tag}_applicant`);
}

test("p4t2.approve: floor is owner+ AND is_operator -- a bookkeeper refuses CLR04", async () => {
  const op = await operatorScene("bkfloor");
  const app = await applicant("bkfloor");
  const req = await requestFirmRegistration(app, { firmName: "BK Floor Co", opKey: opk("bkfloor-req") });
  await assertRaises(CLR.authz, () => approveFirmRegistration(op.bookkeeper, { request: req.request_id, opKey: opk("bkfloor-approve") }), "approve_firm_registration as bookkeeper");
});

test("p4t2.approve: F4 -- an ADMIN (rank 2) of the operator firm refuses CLR04 (the owner-rank floor, not merely a membership check -- the exact gap F2 closed at set_member_role/_add_member_core/invite_member, proven here at the approve door too)", async () => {
  const op = await operatorScene("adminfloor");
  const admin = await insertUser("p4t2op", "adminfloor_admin");
  await addMember(op.owner, { firm: op.firm, user: admin, role: "admin", opKey: opk("adminfloor-add") });
  const app = await applicant("adminfloor");
  const req = await requestFirmRegistration(app, { firmName: "Admin Floor Co", opKey: opk("adminfloor-req") });
  await assertRaises(CLR.authz, () => approveFirmRegistration(admin, { request: req.request_id, opKey: opk("adminfloor-approve") }), "approve_firm_registration as an operator-firm admin");
});

test("p4t2.approve: an OWNER of a NON-operator firm refuses CLR04 (owner rank alone is not sufficient, matching 0133's own comment)", async () => {
  const nonOpOwner = await insertUser("p4t2op", "nonop_owner");
  const token = await seedAdmission("p4t2-nonop");
  const nonOpFirm = await createFirm(nonOpOwner, { name: `P4T2 NonOp ${Date.now()}`, token, opKey: opk("nonopfirm") });
  void nonOpFirm;
  const app = await applicant("nonop");
  const req = await requestFirmRegistration(app, { firmName: "NonOp Target Co", opKey: opk("nonop-req") });
  await assertRaises(CLR.authz, () => approveFirmRegistration(nonOpOwner, { request: req.request_id, opKey: opk("nonop-approve") }), "approve_firm_registration as a non-operator owner");
});

test("p4t2.approve: a successful approval mints a firm owned by the APPLICANT (never the operator), stamps the request, and both firm.created + firm_registration.approved fire", async () => {
  const op = await operatorScene("happy");
  const app = await applicant("happy");
  const req = await requestFirmRegistration(app, { firmName: "Happy Approved Co", opKey: opk("happy-req") });

  // domain_events' primary key is (firm_id, seq) -- seq is PER-FIRM, not a global monotonic
  // counter, so "before" has to be captured per firm this scene already has (the operator's);
  // the applicant's own new firm does not exist yet, so every one of ITS events is trivially new.
  const opBefore = await rootQuery("select max(seq)::bigint as s from clara.domain_events where firm_id = $1", [op.firm]);
  const opSeqBefore = Number(opBefore.rows[0].s ?? 0);

  const r = await approveFirmRegistration(op.owner, { request: req.request_id, opKey: opk("happy-approve") });
  assert.ok(r.firm_id);
  assert.ok(r.plan_id);

  const membership = await rootQuery("select role, status from clara.firm_memberships where firm_id = $1 and user_id = $2", [r.firm_id, app]);
  assert.equal(membership.rows[0].role, "owner");
  assert.equal(membership.rows[0].status, "active");

  const request = await rawRegistrationRequest(req.request_id);
  assert.equal(request.status, "approved");
  assert.equal(request.decided_by, op.owner);
  assert.ok(request.decided_at);
  assert.equal(request.firm_id, r.firm_id);

  const [newFirmEvents, opFirmEvents] = await Promise.all([
    rootQuery("select firm_id, event_type from clara.domain_events where firm_id = $1 order by seq", [r.firm_id]),
    rootQuery("select firm_id, event_type from clara.domain_events where firm_id = $1 and seq > $2 order by seq", [op.firm, opSeqBefore]),
  ]);
  const events = { rows: [...newFirmEvents.rows, ...opFirmEvents.rows] };
  const types = events.rows.map((e) => e.event_type);
  assert.ok(types.includes("firm.created"), "firm.created must fire, scoped to the NEW firm");
  assert.ok(types.includes("firm_registration.approved"), "firm_registration.approved must fire, scoped to the OPERATOR's firm");
  const created = events.rows.find((e) => e.event_type === "firm.created");
  assert.equal(created.firm_id, r.firm_id);
  const decided = events.rows.find((e) => e.event_type === "firm_registration.approved");
  assert.equal(decided.firm_id, op.firm);

  const auditRows = await rootQuery(
    "select firm_id, fn from clara.audit_log where fn in ('create_firm', 'approve_firm_registration') order by at desc limit 2",
  );
  const fns = auditRows.rows.map((a) => a.fn);
  assert.ok(fns.includes("create_firm") && fns.includes("approve_firm_registration"), "both audit actions must land, never a merged/renamed action string");
});

test("p4t2.approve: a request that is no longer open (already approved) refuses CLR09 on a second approval attempt", async () => {
  const op = await operatorScene("double");
  const app = await applicant("double");
  const req = await requestFirmRegistration(app, { firmName: "Double Approve Co", opKey: opk("double-req") });
  await approveFirmRegistration(op.owner, { request: req.request_id, opKey: opk("double-approve1") });
  await assertRaises(CLR.lastOwner, () => approveFirmRegistration(op.owner, { request: req.request_id, opKey: opk("double-approve2") }), "approve_firm_registration on an already-approved request");
});

test("p4t2.approve: an op_key replay on the SAME accept call returns the SAME receipt, not a second firm", async () => {
  const op = await operatorScene("aopreplay");
  const app = await applicant("aopreplay");
  const req = await requestFirmRegistration(app, { firmName: "Approve Replay Co", opKey: opk("aopreplay-req") });
  const key = opk("aopreplay-approve");
  const first = await approveFirmRegistration(op.owner, { request: req.request_id, opKey: key });
  const second = await approveFirmRegistration(op.owner, { request: req.request_id, opKey: key });
  assert.deepEqual(second, first);
  const n = await rootQuery("select count(*)::int as n from clara.firms where id = $1", [first.firm_id]);
  assert.equal(n.rows[0].n, 1);
});

test("p4t2.approve: an applicant who acquired an active membership elsewhere SINCE requesting refuses CLR10 (the core's own re-check, not a stale snapshot)", async () => {
  const op = await operatorScene("raced");
  const app = await applicant("raced");
  const req = await requestFirmRegistration(app, { firmName: "Raced Applicant Co", opKey: opk("raced-req") });
  // The applicant joins ANOTHER firm after requesting, before the operator rules.
  const otherOwner = await insertUser("p4t2op", "raced_other_owner");
  const otherToken = await seedAdmission("p4t2-raced-other");
  const otherFirm = await createFirm(otherOwner, { name: `P4T2 Raced Other ${Date.now()}`, token: otherToken, opKey: opk("raced-otherfirm") });
  await humanQuery(otherOwner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    otherFirm, app, "viewer", opk("raced-addmember"),
  ]);
  await assertRaises(CLR.badRequest, () => approveFirmRegistration(op.owner, { request: req.request_id, opKey: opk("raced-approve") }), "approve_firm_registration for an applicant who raced a membership elsewhere");
  const request = await rawRegistrationRequest(req.request_id);
  assert.equal(request.status, "open", "the request must stay open -- the core's refusal must roll back the whole call, not half-approve");
});

test("p4t2.approve: F7 -- an operator cannot approve their OWN registration request (the applicant-turned-operator-owner case, ruling: add the self-decision wall)", async () => {
  const op = await operatorScene("selfapprove");
  const app = await applicant("selfapprove");
  const req = await requestFirmRegistration(app, { firmName: "Self Approve Co", opKey: opk("selfapprove-req") });
  // The applicant separately joins the OPERATOR firm as owner (a distinct, legitimate admin act),
  // creating the self-decision conflict F7 closes -- the request stays open.
  await addMember(op.owner, { firm: op.firm, user: app, role: "owner", opKey: opk("selfapprove-add") });
  await assertRaises(CLR.authz, () => approveFirmRegistration(app, { request: req.request_id, opKey: opk("selfapprove-approve") }), "approve_firm_registration on one's own request");
  const request = await rawRegistrationRequest(req.request_id);
  assert.equal(request.status, "open", "a refused self-approval must not consume the request");
});

test("p4t2.approve: the fixed agent identity as the request's applicant refuses CLR04 (the core's own is_agent wall, load-bearing exactly here per annex §D.3)", async () => {
  const op = await operatorScene("agentapp");
  // Directly insert a request naming the agent identity as applicant -- the normal
  // request_firm_registration door would itself refuse the agent (p4t2-registration.test.mjs),
  // so this cell proves the CORE's own wall independently, matching annex §D.3's own framing:
  // "structurally cannot mint an agent-owned firm no matter what a request row contains".
  const reqId = (await rootQuery(
    "insert into clara.firm_registration_requests(applicant, firm_name, op_key) values ($1, $2, $3) returning id",
    [AGENT_USER_ID, "Agent Owned Co", opk("agentapp-fixture")],
  )).rows[0].id;
  try {
    await assertRaises(CLR.authz, () => approveFirmRegistration(op.owner, { request: reqId, opKey: opk("agentapp-approve") }), "approve_firm_registration for a request naming the agent identity");
  } finally {
    // F5 fix (rev-p4t2 round 1): this fixture root-inserts a row the normal door would never
    // create, and the door refuses before ever changing its status -- it stays 'open' forever
    // under the fixed AGENT_USER_ID applicant unless cleaned up here, colliding with
    // uq_firm_registration_requests_open_applicant on a second run against the same DB.
    await rootQuery("delete from clara.firm_registration_requests where id = $1", [reqId]);
  }
});

test("p4t2.reject: floor is owner+ AND is_operator -- a bookkeeper refuses CLR04", async () => {
  const op = await operatorScene("rejfloor");
  const app = await applicant("rejfloor");
  const req = await requestFirmRegistration(app, { firmName: "Reject Floor Co", opKey: opk("rejfloor-req") });
  await assertRaises(CLR.authz, () => rejectFirmRegistration(op.bookkeeper, { request: req.request_id, reason: "no", opKey: opk("rejfloor-reject") }), "reject_firm_registration as bookkeeper");
});

test("p4t2.reject: F4 -- an ADMIN (rank 2) of the operator firm refuses CLR04 (same owner-rank floor proof as approve's own admin-rank cell)", async () => {
  const op = await operatorScene("rejadminfloor");
  const admin = await insertUser("p4t2op", "rejadminfloor_admin");
  await addMember(op.owner, { firm: op.firm, user: admin, role: "admin", opKey: opk("rejadminfloor-add") });
  const app = await applicant("rejadminfloor");
  const req = await requestFirmRegistration(app, { firmName: "Reject Admin Floor Co", opKey: opk("rejadminfloor-req") });
  await assertRaises(CLR.authz, () => rejectFirmRegistration(admin, { request: req.request_id, reason: "no", opKey: opk("rejadminfloor-reject") }), "reject_firm_registration as an operator-firm admin");
});

test("p4t2.reject: a BLANK reason refuses CLR10 -- the reason-required build flag, DB-enforced not merely UI-gated", async () => {
  const op = await operatorScene("blankreason");
  const app = await applicant("blankreason");
  const req = await requestFirmRegistration(app, { firmName: "Blank Reason Co", opKey: opk("blankreason-req") });
  await assertRaises(CLR.badRequest, () => rejectFirmRegistration(op.owner, { request: req.request_id, reason: "   ", opKey: opk("blankreason-reject") }), "reject_firm_registration blank reason");
  const request = await rawRegistrationRequest(req.request_id);
  assert.equal(request.status, "open", "a refused rejection must not consume the request");
});

test("p4t2.reject: a successful rejection stamps status/decided_by/decided_at/reason, mints NO firm, and fires firm_registration.rejected", async () => {
  const op = await operatorScene("rejhappy");
  const app = await applicant("rejhappy");
  const req = await requestFirmRegistration(app, { firmName: "Reject Happy Co", opKey: opk("rejhappy-req") });

  // domain_events' primary key is (firm_id, seq) -- seq is PER-FIRM, so "before" is scoped to
  // the one firm this test ever touches (reject mints no new firm).
  const before = await rootQuery("select max(seq)::bigint as s from clara.domain_events where firm_id = $1", [op.firm]);
  const seqBefore = Number(before.rows[0].s ?? 0);

  const r = await rejectFirmRegistration(op.owner, { request: req.request_id, reason: "does not meet our licensing bar", opKey: opk("rejhappy-reject") });
  assert.equal(r.status, "rejected");

  const request = await rawRegistrationRequest(req.request_id);
  assert.equal(request.status, "rejected");
  assert.equal(request.decided_by, op.owner);
  assert.ok(request.decided_at);
  assert.equal(request.reason, "does not meet our licensing bar");
  assert.equal(request.firm_id, null, "a rejection must never populate firm_id");

  const firmCount = await rootQuery("select count(*)::int as n from clara.firm_memberships where user_id = $1", [app]);
  assert.equal(firmCount.rows[0].n, 0, "a rejected applicant must never end up with a membership");

  const events = await rootQuery("select event_type, firm_id from clara.domain_events where firm_id = $1 and seq > $2 order by seq", [op.firm, seqBefore]);
  assert.equal(events.rows.length, 1);
  assert.equal(events.rows[0].event_type, "firm_registration.rejected");
  assert.equal(events.rows[0].firm_id, op.firm);
});

test("p4t2.reject: F7 -- an operator cannot reject their OWN registration request (the applicant-turned-operator-owner case, ruling: add the self-decision wall)", async () => {
  const op = await operatorScene("selfreject");
  const app = await applicant("selfreject");
  const req = await requestFirmRegistration(app, { firmName: "Self Reject Co", opKey: opk("selfreject-req") });
  await addMember(op.owner, { firm: op.firm, user: app, role: "owner", opKey: opk("selfreject-add") });
  await assertRaises(CLR.authz, () => rejectFirmRegistration(app, { request: req.request_id, reason: "no", opKey: opk("selfreject-reject") }), "reject_firm_registration on one's own request");
  const request = await rawRegistrationRequest(req.request_id);
  assert.equal(request.status, "open", "a refused self-rejection must not consume the request");
});

test("p4t2.reject: a request that is no longer open (already rejected) refuses CLR09", async () => {
  const op = await operatorScene("doublereject");
  const app = await applicant("doublereject");
  const req = await requestFirmRegistration(app, { firmName: "Double Reject Co", opKey: opk("doublereject-req") });
  await rejectFirmRegistration(op.owner, { request: req.request_id, reason: "first pass", opKey: opk("doublereject1") });
  await assertRaises(CLR.lastOwner, () => rejectFirmRegistration(op.owner, { request: req.request_id, reason: "second pass", opKey: opk("doublereject2") }), "reject_firm_registration on an already-rejected request");
});

// ---------------------------------------------------------------------------
// create_firm regression -- the recut ENTRANCE must behave exactly as the live 0017 body did.
// ---------------------------------------------------------------------------

test("p4t2.create_firm_regression: the admission-token door still works end to end, returns {firm_id, plan_id}, and remains untouched by the operator queue", async () => {
  const owner = await insertUser("p4t2cf", "reg_owner");
  const token = await seedAdmission("p4t2-cf-regression");
  const r = await humanQuery(owner, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as receipt", [
    `P4T2 Create Firm Regression ${Date.now()}`, token, opk("cf-regression"),
  ]);
  const receipt = r.rows[0].receipt;
  assert.ok(receipt.firm_id);
  assert.ok(receipt.plan_id, "the 0017 body's plan_id must survive the extraction -- the exact superseded-body risk annex §A.1 names");
  // onboarding_plans ALSO carries its own revision_n column, so r.revision_n must be qualified
  // explicitly -- the plan p.id join is not enough to disambiguate.
  const plan = await rootQuery("select p.scope_kind, r.revision_n from clara.onboarding_plans p join clara.onboarding_plan_revisions r on r.plan_id = p.id where p.id = $1", [receipt.plan_id]);
  assert.equal(plan.rows[0].scope_kind, "firm");
  assert.equal(plan.rows[0].revision_n, 1);
});

test("p4t2.create_firm_regression: an actor who already belongs to a firm still refuses on the admission-token door (CLR10, the core's own wall reached via this entrance)", async () => {
  const owner = await insertUser("p4t2cf", "already_member");
  const token1 = await seedAdmission("p4t2-cf-already1");
  await createFirm(owner, { name: `P4T2 Already ${Date.now()}`, token: token1, opKey: opk("already1") });
  const token2 = await seedAdmission("p4t2-cf-already2");
  await assertRaises(
    CLR.badRequest,
    () => humanQuery(owner, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3)", [
      "Second Firm Via Token", token2, opk("already2"),
    ]),
    "create_firm as an actor who already belongs to a firm",
  );
});

test("p4t2.create_firm_regression: a consumed token's op_key replay still returns the SAME receipt verbatim (the token-scoped idempotency annex §D.3 names, untouched by the extraction)", async () => {
  const owner = await insertUser("p4t2cf", "cf_replay");
  const token = await seedAdmission("p4t2-cf-replay");
  const key = opk("cf-replay");
  const r1 = await humanQuery(owner, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as receipt", [
    "Replay Token Co", token, key,
  ]);
  const r2 = await humanQuery(owner, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as receipt", [
    "Replay Token Co", token, key,
  ]);
  assert.deepEqual(r2.rows[0].receipt, r1.rows[0].receipt);
});

// ---------------------------------------------------------------------------
// F1 fix (rev-p4t2 round 1, HIGH, regression): create_firm's replay path must re-check WHO is
// asking, not just WHICH (token, op_key) pair -- rig-proven finding, one cell per subject class.
// ---------------------------------------------------------------------------

test("p4t2.create_firm_regression: F1 -- the fixed agent identity replaying a CONSUMED (token, op_key) pair refuses CLR04, never the cached receipt", async () => {
  const owner = await insertUser("p4t2cf", "f1_agent_orig");
  const token = await seedAdmission("p4t2-f1-agent");
  const key = opk("f1-agent-replay");
  const r1 = await humanQuery(owner, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as receipt", [
    "F1 Agent Replay Co", token, key,
  ]);
  assert.ok(r1.rows[0].receipt.firm_id, "the original, legitimate call must still succeed");
  await assertRaises(
    CLR.authz,
    () => humanQuery(AGENT_USER_ID, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3)", [
      "F1 Agent Replay Co", token, key,
    ]),
    "create_firm replay as the fixed agent identity",
  );
});

test("p4t2.create_firm_regression: F1 -- an unknown subject replaying a CONSUMED (token, op_key) pair refuses CLR04, never the cached receipt", async () => {
  const owner = await insertUser("p4t2cf", "f1_unknown_orig");
  const token = await seedAdmission("p4t2-f1-unknown");
  const key = opk("f1-unknown-replay");
  const r1 = await humanQuery(owner, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as receipt", [
    "F1 Unknown Replay Co", token, key,
  ]);
  assert.ok(r1.rows[0].receipt.firm_id, "the original, legitimate call must still succeed");
  const stranger = randomUUID();
  await assertRaises(
    CLR.authz,
    () => humanQuery(stranger, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3)", [
      "F1 Unknown Replay Co", token, key,
    ]),
    "create_firm replay as an unknown subject (no clara.users row)",
  );
});

test("p4t2.create_firm_regression: F1 -- the SAME actor who legitimately consumed the token still replays cleanly (positive control -- the fix must not break a genuine retry)", async () => {
  const owner = await insertUser("p4t2cf", "f1_valid_replay");
  const token = await seedAdmission("p4t2-f1-valid");
  const key = opk("f1-valid-replay");
  const r1 = await humanQuery(owner, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as receipt", [
    "F1 Valid Replay Co", token, key,
  ]);
  const r2 = await humanQuery(owner, "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as receipt", [
    "F1 Valid Replay Co", token, key,
  ]);
  assert.deepEqual(r2.rows[0].receipt, r1.rows[0].receipt);
});
