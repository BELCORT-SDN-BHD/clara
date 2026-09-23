// Migration 0273 (vendor_binding_write_doors_revoked) — #921: the legacy vendor-bindings panel
// becomes read-only. `clara_authenticated` loses EXECUTE on propose/sign/decline; list/get/
// revoke are untouched. D6: the panel keeps "historical receipts and in-flight legacy
// visibility" — no human may create, approve or refuse a NEW binding; a human may still see
// history and close an in-flight LIVE one.
//
//   vb921.1/.2/.3 clara_authenticated is denied propose/sign/decline — 42501, at the ACL layer,
//     before the door's own body (its rank floor, its shape checks, its business rules) ever
//     runs. Proven with a bogus/nonexistent argument on purpose: a 42501 fires identically
//     regardless of the argument's shape, which is exactly what distinguishes "the grant is
//     gone" from "the body refused this particular call".
//   vb921.4 the same denial holds for EVERY rank, not only bookkeeper's own floor — an admin
//     (who used to clear sign's floor) and a viewer (who never cleared anything) are both
//     refused identically by the ACL layer now, before rank is ever read.
//   vb921.5 list_vendor_bindings, get_vendor_binding and revoke_vendor_identity_binding remain
//     reachable — driven end-to-end AS A HUMAN against a REAL binding: the read verbs return the
//     row, and revoke actually transitions it to 'revoked'. None of the three touch a door this
//     migration moved. The binding itself is built through the propose/sign BODIES, carried by
//     `clara_fn_owner` (x36-vendor-binding-helpers.mjs's `…AsFnOwner` wrappers and their header)
//     — the bodies are untouched by 0273 and D6 keeps them; only the human GRANT is gone, which
//     is what vb921.1–.4 above prove.
//
// FAIL, NEVER SKIP, when run in isolation against a chain missing 0273 (the estate's fail0017
// idiom) — a package-wide pre-integration sweep tolerates absence instead via
// vendor-binding-write-doors-revoked-preintegration-gate.mjs.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, endPool, PG } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld } from "./x1-helpers.mjs";
import {
  seedPayableAccount, seedClientHardIdentifier, seedPassingWindow,
  proposeAsFnOwner, signLiveAsFnOwner,
} from "./x36-vendor-binding-helpers.mjs";

let ready = false;
let w = null;

async function has0273() {
  const r = await rootQuery(
    "select 1 from clara.schema_migrations where version ~ 'vendor_binding_write_doors_revoked$'",
  );
  return r.rows.length > 0;
}

function requireReady() {
  if (!ready) {
    throw new Error(
      "0273 (vendor_binding_write_doors_revoked) NOT applied (clara.schema_migrations has no "
      + "matching row) — this battery is REQUIRED to fail against the pre-#921 frontier.");
  }
}

before(async () => {
  ready = await has0273();
  if (!ready) {
    if (process.env.CLARA_ALLOW_MISSING_VENDOR_BINDING_WRITE_DOORS_REVOKED === "1") {
      noteLane("0273 (vendor_binding_write_doors_revoked) absent — skipping under the package-wide pre-integration sweep");
      return;
    }
    return; // the first test's requireReady() throws, per the fail0017 idiom
  }
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await seedClientHardIdentifier(w.firms.A, w.clients.A1);
});
after(async () => { printLaneNotes("vendor-binding-write-doors-revoked"); await endPool(); });

test("vb921 readiness", () => { requireReady(); assert.ok(w, "world built"); });

test("vb921.1 clara_authenticated is denied propose_vendor_identity_binding (42501)", async () => {
  requireReady();
  const err = await humanQuery(w.users.bob,
    "select clara.propose_vendor_identity_binding(p_proposal => $1::jsonb, p_op_key => $2) as r",
    [JSON.stringify({ client_id: w.clients.A1, counterparty_id: randomUUID() }), "vb921-propose"])
    .then(() => null, (e) => e);
  assert.ok(err, "propose must throw");
  assert.equal(err.code, PG.insufficientPrivilege, `expected 42501, got ${err.code}: ${err.message}`);
});

test("vb921.2 clara_authenticated is denied sign_vendor_identity_binding (42501)", async () => {
  requireReady();
  const err = await humanQuery(w.users.alice,
    "select clara.sign_vendor_identity_binding(p_binding => $1, p_op_key => $2) as r",
    [randomUUID(), "vb921-sign"])
    .then(() => null, (e) => e);
  assert.ok(err, "sign must throw");
  assert.equal(err.code, PG.insufficientPrivilege, `expected 42501, got ${err.code}: ${err.message}`);
});

test("vb921.3 clara_authenticated is denied decline_vendor_identity_binding (42501)", async () => {
  requireReady();
  const err = await humanQuery(w.users.alice,
    "select clara.decline_vendor_identity_binding(p_binding => $1, p_reason => $2, p_op_key => $3) as r",
    [randomUUID(), "vb921 rig probe", "vb921-decline"])
    .then(() => null, (e) => e);
  assert.ok(err, "decline must throw");
  assert.equal(err.code, PG.insufficientPrivilege, `expected 42501, got ${err.code}: ${err.message}`);
});

test("vb921.4 the denial holds for every rank — an admin (sign's own former floor) and a viewer (never cleared anything) are both refused identically, before rank is ever read", async () => {
  requireReady();
  for (const [label, user] of [["owner/admin", w.users.alice], ["viewer", w.users.carol]]) {
    const err = await humanQuery(user,
      "select clara.sign_vendor_identity_binding(p_binding => $1, p_op_key => $2) as r",
      [randomUUID(), `vb921-sign-${label}`])
      .then(() => null, (e) => e);
    assert.ok(err, `${label} sign must throw`);
    assert.equal(err.code, PG.insufficientPrivilege,
      `${label}: expected 42501 (the ACL layer, before any rank floor is read), got ${err.code}: ${err.message}`);
  }
});

test("vb921.5 list_vendor_bindings, get_vendor_binding and revoke_vendor_identity_binding remain reachable, driven end-to-end against a real binding", async () => {
  requireReady();
  // The fixture binding is built through the REAL propose/sign bodies, carried by
  // `clara_fn_owner` (see x36-vendor-binding-helpers.mjs's header): no human session could
  // reach them — that is exactly what vb921.1–.4 above prove — but the bodies themselves are
  // untouched by 0273, so the row this builds is one the doors really would have written.
  const cp = await seedPassingWindow(w, "VB921");
  const p = await proposeAsFnOwner(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  assert.equal(p.status, "proposed", "fixture: the proposal really is in 'proposed'");
  const signed = await signLiveAsFnOwner(w.users.alice, { binding: p.binding_id });
  assert.equal(signed.status, "live", "fixture: the binding really reached 'live'");

  const listed = await humanQuery(w.users.bob,
    "select * from clara.list_vendor_bindings(p_client => $1)", [w.clients.A1]);
  assert.ok(listed.rows.some((r) => r.binding_id === p.binding_id),
    "list_vendor_bindings must still return the fixture binding — the ACL layer admits the call");

  const detail = await humanQuery(w.users.bob,
    "select clara.get_vendor_binding(p_binding => $1) as r", [p.binding_id]);
  assert.equal(detail.rows[0].r.binding.id, p.binding_id,
    "get_vendor_binding must still return the fixture binding — the ACL layer admits the call");

  const revoked = await humanQuery(w.users.bob,
    "select clara.revoke_vendor_identity_binding(p_binding => $1, p_reason => $2, p_op_key => $3) as r",
    [p.binding_id, "vb921 rig revoke", "vb921-revoke"]);
  assert.equal(revoked.rows[0].r.status, "revoked",
    "revoke_vendor_identity_binding must still WRITE — the ACL layer admits the call and the door's own body runs");
  const row = await rootQuery("select status from clara.vendor_identity_bindings where id=$1", [p.binding_id]);
  assert.equal(row.rows[0].status, "revoked");
});
