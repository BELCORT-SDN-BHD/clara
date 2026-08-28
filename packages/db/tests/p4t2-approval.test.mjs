// P4 tranche-2 -- ask 8: clara.approve_firm_registration / reject_firm_registration, and the
// create_firm regression this file's own _create_firm_core extraction must not disturb.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { AGENT_USER_ID, CLR, assertRaises, opk, rootQuery, humanQuery, insertUser, createFirm, seedAdmission } from "./rig-fixtures.mjs";
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
  await assertRaises(CLR.authz, () => approveFirmRegistration(op.owner, { request: reqId, opKey: opk("agentapp-approve") }), "approve_firm_registration for a request naming the agent identity");
});

test("p4t2.reject: floor is owner+ AND is_operator -- a bookkeeper refuses CLR04", async () => {
  const op = await operatorScene("rejfloor");
  const app = await applicant("rejfloor");
  const req = await requestFirmRegistration(app, { firmName: "Reject Floor Co", opKey: opk("rejfloor-req") });
  await assertRaises(CLR.authz, () => rejectFirmRegistration(op.bookkeeper, { request: req.request_id, reason: "no", opKey: opk("rejfloor-reject") }), "reject_firm_registration as bookkeeper");
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
