// Migration 0028 -- the vendor identity binding propose/sign/revoke ceremony (task #36).
// Complements x36-vendor-binding-dwell.test.mjs (which proves the derivation's dwell gate in
// isolation): this file drives the three GRANTED verbs themselves --
//   x36c.1 propose_vendor_identity_binding happy path (bookkeeper floor) over a window that
//     clears every _derive_vendor_binding_proposal gate (dwell+restated+F1+F2+F3).
//   x36c.2 THE INTERLOCK -- sign_vendor_identity_binding refuses post_control_absent (CLR36)
//     while migration 0029 (the executor) has not been deployed. Directly testable against
//     THIS scratch DB today, because 0029 genuinely does not exist yet -- proves the design's
//     load-bearing cross-migration safety gate fires for real, not just by code inspection.
//   x36c.3 revoke_vendor_identity_binding refuses binding_not_live (CLR36) against a binding
//     still in 'proposed' status (it can never reach 'live' pre-0029, so this is also the
//     only revoke path reachable today).
//   x36c.4 propose is bookkeeper-floor, refuses a viewer (role-floor smoke).
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { humanQuery, namedCall, opk, assertRaises, endPool } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld } from "./x1-helpers.mjs";
import { has28, seedPayableAccount, seedPassingWindow } from "./x36-vendor-binding-helpers.mjs";

let has0028 = false;
let w = null;

before(async () => {
  has0028 = await has28();
  if (!has0028) { noteLane("0028 absent -- x36-vendor-binding-ceremony battery FAILS loudly rather than skipping"); return; }
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
});
after(async () => { printLaneNotes("x36-vendor-binding-ceremony"); await endPool(); });

function requireReady() {
  if (!has0028) {
    throw new Error(
      "0028 NOT applied (clara.schema_migrations has no '0028_%' row) -- this battery is "
      + "REQUIRED to fail against the 27-migration prestate.");
  }
}

async function propose(sub, { client, counterparty, opKey } = {}) {
  const specs = [{ name: "p_proposal", cast: "jsonb" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("propose_vendor_identity_binding", specs), [
    JSON.stringify({ client_id: client, counterparty_id: counterparty }),
    opKey ?? opk("vbprop"),
  ]);
  return r.rows[0].result;
}

async function sign(sub, { binding, opKey } = {}) {
  const specs = [{ name: "p_binding" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("sign_vendor_identity_binding", specs),
    [binding, opKey ?? opk("vbsign")]);
  return r.rows[0].result;
}

async function revoke(sub, { binding, reason, opKey } = {}) {
  const specs = [{ name: "p_binding" }, { name: "p_reason" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("revoke_vendor_identity_binding", specs),
    [binding, reason ?? "rig revoke", opKey ?? opk("vbrevoke")]);
  return r.rows[0].result;
}

// ---------------------------------------------------------------------------

test("x36c readiness", () => { requireReady(); assert.ok(w, "world built"); });

test("x36c.1 propose_vendor_identity_binding — bookkeeper happy path over a fully-qualifying window", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C1");
  const r = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  assert.equal(r.status, "proposed");
  assert.ok(r.binding_id, "binding_id returned");
  // f1_vendor_name_norm comes from _binding_normalize (NFC + format-strip + whitespace-
  // collapse + lowercase -- SPACES PRESERVED), a different fold than the counterparties
  // table's alphanumeric-only ck_counterparties_name_normalized (cp.nameNorm strips spaces).
  // No diacritics/format codepoints or repeated whitespace in this fixture name, so the
  // expected _binding_normalize output is simply the lowercased name as-is.
  assert.equal(r.f1_vendor_name_norm, cp.name.toLowerCase());
  assert.equal(r.registration_at_signing, cp.regNorm);
  return r.binding_id;
});

test("x36c.2 THE INTERLOCK — sign_vendor_identity_binding refuses post_control_absent while 0029 is undeployed", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C2");
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  await assertRaises("CLR36",
    () => sign(w.users.alice, { binding: proposed.binding_id }),
    "sign before 0029 deploys");
  try {
    await sign(w.users.alice, { binding: proposed.binding_id, opKey: opk("vbsign2") });
    assert.fail("sign_vendor_identity_binding must throw while 0029 is absent");
  } catch (e) {
    assert.match(e.message, /post_control_absent|post-time control not yet deployed/,
      `expected the post_control_absent interlock, got: ${e.message}`);
  }
});

test("x36c.3 revoke_vendor_identity_binding refuses binding_not_live against a still-proposed binding", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C3");
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  try {
    await revoke(w.users.bob, { binding: proposed.binding_id });
    assert.fail("revoke must refuse a proposed (never-signed) binding");
  } catch (e) {
    assert.equal(e.code, "CLR36");
    assert.match(e.message, /binding_not_live/, `expected binding_not_live, got: ${e.message}`);
  }
});

test("x36c.4 propose_vendor_identity_binding floors at bookkeeper+ — a viewer is refused CLR04", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C4");
  // _human_ctx(role_rank('bookkeeper')) raises CLR04 'insufficient role' -- the GRANT itself
  // admits clara_authenticated broadly; the floor is enforced inside the function body.
  await assertRaises("CLR04",
    () => propose(w.users.carol, { client: w.clients.A1, counterparty: cp.id }),
    "viewer proposes a vendor identity binding");
});
