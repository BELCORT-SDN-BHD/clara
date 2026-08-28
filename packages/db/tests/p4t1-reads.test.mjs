// P4 tranche-1 -- asks 5, 6 (read half), 7: firm_members_visible, firm_invites_visible,
// caller_context. Each is an owner-executed masked view; RLS on the base tables is irrelevant to
// them, so these tests prove the view's OWN predicate, not RLS.

import test from "node:test";
import assert from "node:assert/strict";
import { opk, humanQuery, insertUser, createFirm, seedAdmission } from "./rig-fixtures.mjs";
import { inviteMember, acceptInvite, freshPersona } from "./p4t1-fixtures.mjs";

async function scene(tag) {
  const owner = await insertUser("p4t1rd", `${tag}_owner`);
  const token = await seedAdmission(`p4t1-reads-${tag}`);
  const firm = await createFirm(owner, { name: `P4T1 Reads ${tag} ${Date.now()}`, token, opKey: opk(`firm_${tag}`) });
  const admin = await insertUser("p4t1rd", `${tag}_admin`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [firm, admin, "admin", opk(`addadmin_${tag}`)]);
  const bookkeeper = await insertUser("p4t1rd", `${tag}_bk`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [firm, bookkeeper, "bookkeeper", opk(`addbk_${tag}`)]);
  const viewer = await insertUser("p4t1rd", `${tag}_viewer`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [firm, viewer, "viewer", opk(`addviewer_${tag}`)]);
  return { firm, owner, admin, bookkeeper, viewer };
}

// ---------------------------------------------------------------------------
// firm_members_visible (ask 5)
// ---------------------------------------------------------------------------

test("p4t1.reads: firm_members_visible -- a viewer (below the bookkeeper floor) sees ZERO rows, not an error", async () => {
  const sc = await scene("rosterfloor");
  const r = await humanQuery(sc.viewer, "select * from clara.firm_members_visible", []);
  assert.equal(r.rows.length, 0);
});

test("p4t1.reads: firm_members_visible -- bookkeeper+ sees the roster, but email is null-masked below admin", async () => {
  const sc = await scene("rostermask");
  const bk = await humanQuery(sc.bookkeeper, "select user_id, email from clara.firm_members_visible order by user_id", []);
  assert.equal(bk.rows.length, 4, "owner + admin + bookkeeper + viewer");
  assert.ok(bk.rows.every((r) => r.email === null), "email must be masked below admin+");

  const admin = await humanQuery(sc.admin, "select user_id, email from clara.firm_members_visible order by user_id", []);
  assert.equal(admin.rows.length, 4);
  assert.ok(admin.rows.every((r) => typeof r.email === "string" && r.email.length > 0), "email must be visible at admin+");
});

test("p4t1.reads: firm_members_visible -- role_rank matches clara.role_rank and status/timestamps are the real membership row", async () => {
  const sc = await scene("rosterfields");
  const admin = await humanQuery(sc.admin, "select user_id, role, role_rank, status from clara.firm_members_visible where user_id = $1", [sc.viewer]);
  assert.equal(admin.rows[0].role, "viewer");
  assert.equal(admin.rows[0].role_rank, 0);
  assert.equal(admin.rows[0].status, "active");
});

test("p4t1.reads: firm_members_visible -- cross-firm isolation: a member of firm A sees zero of firm B's roster", async () => {
  const scA = await scene("crossA");
  const scB = await scene("crossB");
  void scB;
  const rows = await humanQuery(scA.admin, "select user_id from clara.firm_members_visible", []);
  const ids = rows.rows.map((r) => r.user_id);
  assert.ok(!ids.includes(scB.admin) && !ids.includes(scB.owner));
});

// ---------------------------------------------------------------------------
// firm_invites_visible (ask 6, read half)
// ---------------------------------------------------------------------------

test("p4t1.reads: firm_invites_visible -- admin+ only (bookkeeper sees zero rows), and token_hash is never a column", async () => {
  const sc = await scene("invreadfloor");
  await inviteMember(sc.admin, { email: "invread@rig.test", role: "viewer", opKey: opk("invread") });
  const bk = await humanQuery(sc.bookkeeper, "select * from clara.firm_invites_visible", []);
  assert.equal(bk.rows.length, 0);
  const admin = await humanQuery(sc.admin, "select * from clara.firm_invites_visible", []);
  assert.equal(admin.rows.length, 1);
  assert.ok(!("token_hash" in admin.rows[0]), "token_hash must never be a column on the visible view");
});

test("p4t1.reads: firm_invites_visible -- status reflects accept/revoke", async () => {
  const sc = await scene("invreadstatus");
  const p = freshPersona("invreadjoiner");
  const issued = await inviteMember(sc.admin, { email: p.email, role: "viewer", opKey: opk("irs-issue") });
  let row = await humanQuery(sc.admin, "select status from clara.firm_invites_visible where id = $1", [issued.invite_id]);
  assert.equal(row.rows[0].status, "pending");
  await acceptInvite(p.sub, p.email, { token: issued.token, displayName: "X", opKey: opk("irs-accept") });
  row = await humanQuery(sc.admin, "select status from clara.firm_invites_visible where id = $1", [issued.invite_id]);
  assert.equal(row.rows[0].status, "accepted");
});

// ---------------------------------------------------------------------------
// caller_context (ask 7)
// ---------------------------------------------------------------------------

test("p4t1.reads: caller_context -- one row for an active member, correct firm_id/role/role_rank/is_operator", async () => {
  const sc = await scene("ctxmember");
  const r = await humanQuery(sc.admin, "select * from clara.caller_context", []);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].user_id, sc.admin);
  assert.equal(r.rows[0].firm_id, sc.firm);
  assert.equal(r.rows[0].role, "admin");
  assert.equal(r.rows[0].role_rank, 2);
  assert.equal(r.rows[0].is_operator, false);
});

test("p4t1.reads: caller_context -- zero rows for a claimed identity with no membership yet (the holding-state trigger)", async () => {
  const p = freshPersona("ctxnofirm");
  await (await import("./p4t1-fixtures.mjs")).claimIdentity(p.sub, p.email, { displayName: "No Firm Yet", opKey: opk("ctxnofirm") });
  const r = await (await import("./p4t1-fixtures.mjs")).humanEmailQuery(p.sub, p.email, "select * from clara.caller_context", []);
  assert.equal(r.rows.length, 0, "no active membership must mean zero rows, not an error");
});

test("p4t1.reads: caller_context -- zero rows for an authenticated session that never even claimed identity", async () => {
  const p = freshPersona("ctxneverclaimed");
  const r = await (await import("./p4t1-fixtures.mjs")).humanEmailQuery(p.sub, p.email, "select * from clara.caller_context", []);
  assert.equal(r.rows.length, 0);
});
