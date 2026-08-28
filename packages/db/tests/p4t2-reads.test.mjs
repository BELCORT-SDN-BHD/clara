// P4 tranche-2 -- the dual-scoped read: clara.firm_registration_requests_visible. Closes the gap
// flagged before this file was written (SendMessage to the conductor): §4 E's holding state needs
// the APPLICANT to read their own request; ask 8 needs the operator's queue. One view, two scopes.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { opk, rootQuery, humanQuery, insertUser, createFirm, seedAdmission } from "./rig-fixtures.mjs";
import { requestFirmRegistration, markOperator, clearOperator } from "./p4t2-fixtures.mjs";

// Leave a clean is_operator slate for whichever file runs next in the same suite invocation --
// see markOperator's own header note (p4t2-fixtures.mjs) for why this is unscoped.
after(clearOperator);

async function operatorScene(tag) {
  const owner = await insertUser("p4t2rd", `${tag}_owner`);
  const token = await seedAdmission(`p4t2-rd-${tag}`);
  const firm = await createFirm(owner, { name: `P4T2 Reads ${tag} ${Date.now()}`, token, opKey: opk(`rdfirm_${tag}`) });
  await markOperator(firm);
  return { firm, owner };
}

test("p4t2.reads: the APPLICANT sees their own request, self-scoped, before any operator has ruled", async () => {
  const app = await insertUser("p4t2rd", "selfscope_app");
  const req = await requestFirmRegistration(app, { firmName: "Self Scope Co", opKey: opk("selfscope") });
  const r = await humanQuery(app, "select * from clara.firm_registration_requests_visible where id = $1", [req.request_id]);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].applicant, app);
  assert.equal(r.rows[0].status, "open");
});

test("p4t2.reads: two applicants each see EXACTLY their own row via self-scope -- never the other's (conductor condition d)", async () => {
  const appA = await insertUser("p4t2rd", "twoapp_a");
  const appB = await insertUser("p4t2rd", "twoapp_b");
  const reqA = await requestFirmRegistration(appA, { firmName: "Two Applicants Co A", opKey: opk("twoapp_a") });
  const reqB = await requestFirmRegistration(appB, { firmName: "Two Applicants Co B", opKey: opk("twoapp_b") });
  const rA = await humanQuery(appA, "select id, applicant from clara.firm_registration_requests_visible where id = any($1)", [
    [reqA.request_id, reqB.request_id],
  ]);
  assert.equal(rA.rows.length, 1);
  assert.equal(rA.rows[0].id, reqA.request_id);
  assert.equal(rA.rows[0].applicant, appA);
  const rB = await humanQuery(appB, "select id, applicant from clara.firm_registration_requests_visible where id = any($1)", [
    [reqA.request_id, reqB.request_id],
  ]);
  assert.equal(rB.rows.length, 1);
  assert.equal(rB.rows[0].id, reqB.request_id);
  assert.equal(rB.rows[0].applicant, appB);
});

test("p4t2.reads: a bystander (authenticated, no membership, not the applicant) sees ZERO rows for someone else's request", async () => {
  const app = await insertUser("p4t2rd", "bystander_app");
  const bystander = await insertUser("p4t2rd", "bystander_watcher");
  const req = await requestFirmRegistration(app, { firmName: "Bystander Target Co", opKey: opk("bystander") });
  const r = await humanQuery(bystander, "select * from clara.firm_registration_requests_visible where id = $1", [req.request_id]);
  assert.equal(r.rows.length, 0);
});

test("p4t2.reads: a member of a NON-operator firm (even an owner) sees ZERO rows for someone else's request -- operator-scope requires BOTH owner rank AND is_operator", async () => {
  const nonOpOwner = await insertUser("p4t2rd", "nonop_owner");
  const token = await seedAdmission("p4t2-rd-nonop");
  await createFirm(nonOpOwner, { name: `P4T2 Reads NonOp ${Date.now()}`, token, opKey: opk("nonopfirm") });
  const app = await insertUser("p4t2rd", "nonop_target_app");
  const req = await requestFirmRegistration(app, { firmName: "NonOp Target Co", opKey: opk("nonop-target") });
  const r = await humanQuery(nonOpOwner, "select * from clara.firm_registration_requests_visible where id = $1", [req.request_id]);
  assert.equal(r.rows.length, 0);
});

test("p4t2.reads: the OPERATOR (owner+ of the is_operator firm) sees EVERY open request, across multiple applicants -- the queue", async () => {
  const op = await operatorScene("queue");
  const app1 = await insertUser("p4t2rd", "queue_app1");
  const app2 = await insertUser("p4t2rd", "queue_app2");
  const req1 = await requestFirmRegistration(app1, { firmName: "Queue Co One", opKey: opk("queue1") });
  const req2 = await requestFirmRegistration(app2, { firmName: "Queue Co Two", opKey: opk("queue2") });
  const r = await humanQuery(op.owner, "select id, applicant, status from clara.firm_registration_requests_visible where id = any($1) order by created_at", [
    [req1.request_id, req2.request_id],
  ]);
  assert.equal(r.rows.length, 2);
  assert.ok(r.rows.every((row) => row.status === "open"));
  const applicants = r.rows.map((row) => row.applicant);
  assert.ok(applicants.includes(app1) && applicants.includes(app2));
});

test("p4t2.reads: F4 -- an operator-firm ADMIN (rank 2, one below the owner floor) sees ZERO rows for someone else's request -- pins the exact rank literal an owner->admin edit would silently downgrade", async () => {
  const op = await operatorScene("adminfloor");
  const admin = await insertUser("p4t2rd", "adminfloor_admin");
  await humanQuery(op.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    op.firm, admin, "admin", opk("adminfloor-add"),
  ]);
  const app = await insertUser("p4t2rd", "adminfloor_app");
  const req = await requestFirmRegistration(app, { firmName: "Admin Floor Target Co", opKey: opk("adminfloor-target") });
  const r = await humanQuery(admin, "select * from clara.firm_registration_requests_visible where id = $1", [req.request_id]);
  assert.equal(r.rows.length, 0);
});

test("p4t2.reads: an operator-firm BOOKKEEPER (below the owner floor) sees ZERO rows for someone else's request -- rank matters even inside the operator firm", async () => {
  const op = await operatorScene("bkfloor");
  const bookkeeper = await insertUser("p4t2rd", "bkfloor_bk");
  await humanQuery(op.owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    op.firm, bookkeeper, "bookkeeper", opk("bkfloor-add"),
  ]);
  const app = await insertUser("p4t2rd", "bkfloor_app");
  const req = await requestFirmRegistration(app, { firmName: "BK Floor Target Co", opKey: opk("bkfloor-target") });
  const r = await humanQuery(bookkeeper, "select * from clara.firm_registration_requests_visible where id = $1", [req.request_id]);
  assert.equal(r.rows.length, 0);
});

test("p4t2.reads: F11 -- decided_by is masked to NULL in the SELF scope, and visible in the OPERATOR scope (the applicant needs status/reason/timestamps, not the deciding operator's identity)", async () => {
  const op = await operatorScene("f11mask");
  const app = await insertUser("p4t2rd", "f11mask_app");
  const req = await requestFirmRegistration(app, { firmName: "F11 Mask Co", opKey: opk("f11mask-req") });
  await humanQuery(op.owner, "select clara.reject_firm_registration(p_request => $1, p_reason => $2, p_op_key => $3)", [
    req.request_id, "f11 fixture", opk("f11mask-reject"),
  ]);

  const asSelf = await humanQuery(app, "select decided_by, status from clara.firm_registration_requests_visible where id = $1", [req.request_id]);
  assert.equal(asSelf.rows[0].status, "rejected");
  assert.equal(asSelf.rows[0].decided_by, null, "the SELF scope must never see WHO decided");

  const asOperator = await humanQuery(op.owner, "select decided_by, status from clara.firm_registration_requests_visible where id = $1", [req.request_id]);
  assert.equal(asOperator.rows[0].status, "rejected");
  assert.equal(asOperator.rows[0].decided_by, op.owner, "the OPERATOR scope must see the real deciding actor");
});

test("p4t2.reads: security_barrier is set on the view", async () => {
  const r = await rootQuery(
    `select reloptions from pg_class where oid = 'clara.firm_registration_requests_visible'::regclass`,
  );
  assert.ok(Array.isArray(r.rows[0].reloptions) && r.rows[0].reloptions.includes("security_barrier=true"));
});
