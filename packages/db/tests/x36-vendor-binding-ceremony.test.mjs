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
import { opk, assertRaises, endPool, rootQuery } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld } from "./x1-helpers.mjs";
import { insertUser, addMember } from "./rig-fixtures.mjs";
import {
  has28, has29, seedPayableAccount, seedPassingWindow, propose, sign, revoke, deriveOrError,
} from "./x36-vendor-binding-helpers.mjs";

let has0028 = false;
let has0029 = false;
let w = null;

before(async () => {
  has0028 = await has28();
  has0029 = await has29();
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

// propose/sign/revoke now live in x36-vendor-binding-helpers.mjs (shared with the resolver
// battery, which also needs to drive a binding to 'live').

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

test("x36c.2 THE INTERLOCK — signing is closed before 0029 and opens only after its ledger row", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C2");
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  if (has0029) {
    const signed = await sign(w.users.alice, { binding: proposed.binding_id });
    assert.equal(signed.status, "live",
      "the exact 0029 ledger row opens the signing interlock");
    return;
  }
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

// ---------------------------------------------------------------------------
// 裁-18a (mohe-grill-rulings, 2026-08-28): the signer<>proposer wall on
// sign_vendor_identity_binding. Four cells, both directions:
//   x36c.5 (negative) — the proposer attempts to sign their own proposal, refused CLR04 with
//     the wall's own two-ways-out message.
//   x36c.6 (positive) — a DIFFERENT admin (not the proposer) signs, succeeds.
//   x36c.8 (positive, 裁-18b interlock) — an admin signs a proposal whose created_by is the
//     AGENT identity (clara.agent_user_id()), succeeds — proves the wall is written as an
//     ACTOR comparison (b.created_by = c.actor), never a "the proposer must be human" rule;
//     the latter would strand every single-admin firm's future Clara-proposed binding and
//     defeat 裁-18c, whose whole point is agent-proposes/human-signs as the NORMAL shape.
//   x36c.7 (rank floor untouched) — a bookkeeper who is ALSO the proposer still gets the
//     PRE-EXISTING rank-floor refusal ('insufficient role'), never the new wall's message —
//     proves the wall did not paper over or replace the existing admin+ floor.
//
// MUTANT RUN (law: "every wall you add gets ... a mutant you run yourself"): during authoring,
// the signer<>proposer `if b.created_by = c.actor then raise ...` block was temporarily deleted
// from the CoR'd function on this same rig and x36c.5 was re-run — it went RED (sign succeeded,
// `status: 'live'`, no CLR04) exactly as expected of a battery that would pass vacuously
// against an unwalled body. The wall was restored and the full x36 family re-run green before
// this file was committed. Not left in the tree — this note is the record of that run.
// ---------------------------------------------------------------------------

test("x36c.5 sign_vendor_identity_binding refuses the proposer signing their own binding (裁-18a)", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C5");
  // alice is firm A's owner (rank above admin), so she alone clears BOTH propose's
  // bookkeeper+ floor and sign's admin+ floor — the shape that used to be a legitimate
  // solo propose-then-sign path before this wall existed.
  const proposed = await propose(w.users.alice, { client: w.clients.A1, counterparty: cp.id });
  try {
    await sign(w.users.alice, { binding: proposed.binding_id });
    assert.fail("sign_vendor_identity_binding must refuse when the signer is also the proposer");
  } catch (e) {
    assert.equal(e.code, "CLR04", `expected CLR04, got ${e.code}: ${e.message}`);
    assert.match(e.message, /let Clara propose it, or a different admin signs it/,
      `expected the wall's own two-ways-out message, got: ${e.message}`);
  }
});

test("x36c.6 sign_vendor_identity_binding succeeds when a DIFFERENT admin signs (positive control for 裁-18a)", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C6");
  // Mint a second admin-rank member of firm A — the fixture roster (alice owner / bob
  // bookkeeper / carol viewer) has no second admin+ user, and dave/erin already hold an
  // active membership in a DIFFERENT firm (uq_membership_active_user is global, one active
  // membership per user), so a fresh identity is required.
  const frank = await insertUser(w.prefix, "frank");
  await addMember(w.users.alice, { firm: w.firms.A, user: frank, role: "admin", opKey: opk("vbframk") });
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  if (has0029) {
    const signed = await sign(frank, { binding: proposed.binding_id });
    assert.equal(signed.status, "live", "a different admin's signature succeeds");
    return;
  }
  // 0029 absent on this rig frontier: the wall must NOT be what refuses here — the
  // post_control_absent interlock (x36c.2) is the expected refusal instead, proving the new
  // wall did not fire on a legitimate different-signer case.
  try {
    await sign(frank, { binding: proposed.binding_id });
    assert.fail("sign must throw while 0029 is absent");
  } catch (e) {
    assert.doesNotMatch(e.message, /let Clara propose it, or a different admin signs it/,
      `the signer<>proposer wall must NOT fire for a different admin, got: ${e.message}`);
    assert.match(e.message, /post_control_absent|post-time control not yet deployed/,
      `expected the post_control_absent interlock, got: ${e.message}`);
  }
});

test("x36c.8 sign_vendor_identity_binding admits an ADMIN signing an AGENT-created proposal (裁-18b interlock) — the wall is an actor comparison, never a human-vs-agent rule", async () => {
  requireReady();
  // 裁-18b's Clara-proposal door (agent proposes -> human signs) does not exist yet in this
  // batch -- it is its own design+build train. This cell root-inserts the SAME shape that
  // door will eventually produce (created_by = clara.agent_user_id(), the real global agent
  // identity row, is_agent=true, no FK to relax around) to prove NOW that the wall this file
  // adds is written as an ACTOR comparison (`b.created_by = c.actor`), never a "the proposer
  // must be human" rule -- the coordinator's own measured interlock: a "must be human" wall
  // would strand every single-admin firm's Clara-proposed binding and directly defeat 裁-18c
  // (agent-proposes-human-signs is supposed to be the NORMAL two-party shape once 裁-18b
  // ships). clara.agent_user_id() can never equal a human admin's jwt_sub(), so ANY admin --
  // including the sole admin of a single-admin firm -- must be able to sign an agent-proposed
  // binding; this cell proves that holds, not merely that the wall compiles.
  const cp = await seedPassingWindow(w, "C8agent");
  const derived = await deriveOrError(w.firms.A, w.clients.A1, cp.id);
  assert.ok(derived.ok, `the fixture window must independently derive cleanly: ${derived.message}`);
  const r = derived.receipt;
  const bindingId = (await rootQuery(
    `insert into clara.vendor_identity_bindings(
       firm_id,client_id,counterparty_id,status,
       f1_vendor_name_norm,f2_invoice_prefix,registration_at_signing,
       content_hash,created_by,expires_at
     ) values ($1,$2,$3,'proposed',$4,$5,$6,$7,$8,now()+interval '12 months')
     returning id`,
    [w.firms.A, w.clients.A1, r.counterparty_id, r.f1_vendor_name_norm, r.f2_invoice_prefix,
      r.registration_at_signing, r.content_hash, w.agent],
  )).rows[0].id;
  for (const ev of r.evidence) {
    await rootQuery(
      `insert into clara.vendor_identity_binding_evidence(
         binding_id,firm_id,client_id,entry_id,document_id,facts_extraction_id,ocr_extraction_id)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [bindingId, w.firms.A, w.clients.A1, ev.entry_id, ev.document_id, ev.facts_extraction_id, ev.ocr_extraction_id],
    );
  }
  // Sanity: this binding's created_by really is the agent identity, not a human's, so a
  // green result below is actually proving the agent-proposer case and not an accident.
  const stored = await rootQuery("select created_by from clara.vendor_identity_bindings where id=$1", [bindingId]);
  assert.equal(stored.rows[0].created_by, w.agent, "fixture sanity: created_by is the agent identity");

  if (has0029) {
    const signed = await sign(w.users.alice, { binding: bindingId });
    assert.equal(signed.status, "live", "an admin signs an agent-created proposal without hitting the signer<>proposer wall");
    return;
  }
  try {
    await sign(w.users.alice, { binding: bindingId });
    assert.fail("sign must throw while 0029 is absent");
  } catch (e) {
    assert.doesNotMatch(e.message, /let Clara propose it, or a different admin signs it/,
      `the wall must NOT fire for an admin signing an agent-created proposal, got: ${e.message}`);
    assert.match(e.message, /post_control_absent|post-time control not yet deployed/,
      `expected the post_control_absent interlock, got: ${e.message}`);
  }
});

test("x36c.7 sign_vendor_identity_binding's admin+ rank floor is UNTOUCHED by the new wall — a bookkeeper proposer is still refused by RANK, not by the wall", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C7");
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  // bob (bookkeeper) attempting to sign his OWN proposal hits _human_ctx(role_rank('admin'))
  // FIRST — before the function ever reaches the select that would let the new wall compare
  // b.created_by to c.actor. The refusal must be the PRE-EXISTING rank message, never the
  // wall's message, proving the two guards are independent and the wall did not weaken or
  // replace the rank floor.
  try {
    await sign(w.users.bob, { binding: proposed.binding_id });
    assert.fail("a bookkeeper must be refused by rank before the signer<>proposer wall is ever reached");
  } catch (e) {
    assert.equal(e.code, "CLR04", `expected CLR04, got ${e.code}: ${e.message}`);
    assert.match(e.message, /insufficient role/, `expected the rank-floor message, got: ${e.message}`);
    assert.doesNotMatch(e.message, /let Clara propose it, or a different admin signs it/,
      `bob was refused by rank, not by the signer<>proposer wall, but the wall's message leaked: ${e.message}`);
  }
});
