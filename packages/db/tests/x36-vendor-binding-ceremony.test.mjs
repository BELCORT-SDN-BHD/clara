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
//   x36c.5/.6/.7/.8/.9 -- 裁-18a, the signer<>proposer wall (own section below, all eight
//     cells named there).
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

// MED-3 (independent review, 2026-08-29): the estate's own DETAIL-reason idiom
// (f-a1-0017-kind-scoped.test.mjs's reasonOf) -- a STRUCTURED assertion on the typed discriminant,
// never a string-match on English prose alone.
function reasonOf(err) {
  const m = /"reason"\s*:\s*"([a-z_]+)"/.exec(err?.detail ?? "");
  return m ? m[1] : null;
}

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
// sign_vendor_identity_binding. EIGHT cells, both directions:
//   x36c.5 (negative) — the proposer attempts to sign their own proposal, refused CLR04 with
//     the OWNER'S RULED WORDS (裁-18c: "let Clara propose, or add a second admin" — NOT "a
//     different admin signs it", which would tell a genuinely solo firm to use a person who
//     does not exist) and the stable DETAIL reason token (MED-3), asserted STRUCTURALLY via
//     reasonOf(), never by string-matching English prose alone. Also proves F-B: the refusal
//     rolls back the whole transaction (v2 §G, pre-existing estate law) — op_receipts carries
//     ZERO row for this op_key afterward, so a CLR04 here never burns the idempotency key.
//   x36c.6 (positive) — a DIFFERENT admin (not the proposer) signs, succeeds.
//   x36c.8 (positive, 裁-18b interlock) — an admin signs a proposal whose created_by is
//     genuinely clara.agent_user_id() (CALLED live, not merely asserted equal to a fixture
//     constant), succeeds — proves the wall is written as an ACTOR comparison
//     (b.created_by = c.actor), never a "the proposer must be human" rule; the latter would
//     strand every single-admin firm's future Clara-proposed binding and defeat 裁-18c, whose
//     whole point is agent-proposes/human-signs as the NORMAL shape.
//   x36c.7 (rank floor untouched) — a bookkeeper who is ALSO the proposer still gets the
//     PRE-EXISTING rank-floor refusal ('insufficient role'), never the new wall's message —
//     proves the wall did not paper over or replace the existing admin+ floor.
//   x36c.9 (LOW-5, PROVEN BY EXECUTION) — a binding whose created_by has been drifted to NULL
//     (simulating a hypothetical future nullable-drift on the column) is STILL refused —
//     regression-pins the fix for the fail-open independent review measured for real (a bare
//     `=` comparison alone evaluates NULL, not TRUE, on a nulled column, so the ORIGINAL
//     first-draft wall would have let a nulled-created_by binding sign LIVE with no
//     separation of duties at all).
//
// MUTANT RUNS (law: "every wall you add gets ... a mutant you run yourself") — each performed
// for real on this rig during authoring/fix-round, then restored, never left in the tree:
//   M1 (the whole wall deleted) — x36c.5 went RED (sign succeeded, status:'live', no CLR04).
//   M2 (`b.signed_by = c.actor` — a WRONG column, plausible-looking) — x36c.5 went RED (the
//     proposer's own signed_by is NULL pre-sign, so `NULL = c.actor` is never TRUE — the wall
//     never fires at all, and sign succeeds where it must refuse).
//   M3 (the disjunct `b.created_by = c.actor OR b.created_by = clara.agent_user_id()`) —
//     x36c.8 went RED (an admin signing a genuinely agent-proposed binding is now wrongly
//     refused — this is the exact "must be human" class the wall must NOT be).
//   M4 (debt-BAR1's own mutant — `alter view ... reset (security_barrier)` — lives in
//     debt-human-read-surfaces.test.mjs, not here).
// ---------------------------------------------------------------------------

test("x36c.5 sign_vendor_identity_binding refuses the proposer signing their own binding (裁-18a)", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C5");
  // alice is firm A's owner (rank above admin), so she alone clears BOTH propose's
  // bookkeeper+ floor and sign's admin+ floor — the shape that used to be a legitimate
  // solo propose-then-sign path before this wall existed.
  const proposed = await propose(w.users.alice, { client: w.clients.A1, counterparty: cp.id });
  const opKey = opk("c5sign");
  try {
    await sign(w.users.alice, { binding: proposed.binding_id, opKey });
    assert.fail("sign_vendor_identity_binding must refuse when the signer is also the proposer");
  } catch (e) {
    assert.equal(e.code, "CLR04", `expected CLR04, got ${e.code}: ${e.message}`);
    assert.match(e.message, /let Clara propose it, or add a second admin/,
      `expected the wall's own two-ways-out message in the OWNER'S RULED WORDS, got: ${e.message}`);
    // MED-3 (independent review, structural, not English-prose matching): the stable reason
    // token rides the raised DETAIL.
    assert.equal(reasonOf(e), "signer_is_proposer", `expected the stable reason token, got: ${JSON.stringify(e.detail)}`);
  }
  // F-B (independent review, measured): the refusal rolled back the WHOLE transaction —
  // _reserve_op's own row for this op_key never survives a RAISE (v2 §G) — so op_receipts
  // carries ZERO rows for this (firm, fn, op_key), proving a CLR04 here never burns the key.
  const receipt = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where firm_id=$1 and fn='sign_vendor_identity_binding' and op_key=$2",
    [w.firms.A, opKey],
  );
  assert.equal(receipt.rows[0].n, 0, "a CLR04 refusal from this wall must not persist an op_receipts row (the raise rolls back the reservation too)");
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
    assert.notEqual(reasonOf(e), "signer_is_proposer", `the signer<>proposer wall must NOT fire for a different admin, got detail: ${JSON.stringify(e.detail)}`);
    assert.match(e.message, /post_control_absent|post-time control not yet deployed/,
      `expected the post_control_absent interlock, got: ${e.message}`);
  }
});

test("x36c.8 sign_vendor_identity_binding admits an ADMIN signing an AGENT-created proposal (裁-18b interlock) — the wall is an actor comparison, never a human-vs-agent rule", async () => {
  requireReady();
  // 裁-18b's Clara-proposal door (agent proposes -> human signs) does not exist yet in this
  // batch -- it is its own design+build train. This cell root-inserts the SAME shape that
  // door will eventually produce (created_by = the REAL live clara.agent_user_id(), no FK to
  // relax around) to prove NOW that the wall this file adds is written as an ACTOR comparison
  // (`b.created_by = c.actor`), never a "the proposer must be human" rule -- a "must be human"
  // wall would strand every single-admin firm's Clara-proposed binding and directly defeat
  // 裁-18c (agent-proposes-human-signs is supposed to be the NORMAL two-party shape once
  // 裁-18b ships). clara.agent_user_id() can never equal a human admin's jwt_sub(), so ANY
  // admin -- including the sole admin of a single-admin firm -- must be able to sign an
  // agent-proposed binding; this cell proves that holds, not merely that the wall compiles.
  // MED-4 law-3 (independent review): the agent identity is CALLED here, live, not merely
  // asserted equal to the fixture constant `w.agent` -- a coincidental match would prove
  // nothing.
  const agentId = (await rootQuery("select clara.agent_user_id() as id")).rows[0].id;
  assert.equal(agentId, w.agent, "fixture sanity: the fixture's own agent constant matches the LIVE clara.agent_user_id() -- both are used below, and this proves they are the same identity, not a coincidence");

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
      r.registration_at_signing, r.content_hash, agentId],
  )).rows[0].id;
  for (const ev of r.evidence) {
    await rootQuery(
      `insert into clara.vendor_identity_binding_evidence(
         binding_id,firm_id,client_id,entry_id,document_id,facts_extraction_id,ocr_extraction_id)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [bindingId, w.firms.A, w.clients.A1, ev.entry_id, ev.document_id, ev.facts_extraction_id, ev.ocr_extraction_id],
    );
  }
  // Sanity: this binding's created_by really is the LIVE agent identity (re-queried, not
  // trusted from the INSERT's own args), so a green result below is actually proving the
  // agent-proposer case and not an accident.
  const stored = await rootQuery("select created_by from clara.vendor_identity_bindings where id=$1", [bindingId]);
  assert.equal(stored.rows[0].created_by, agentId, "fixture sanity: created_by is the LIVE clara.agent_user_id(), re-read from the row");

  if (has0029) {
    const signed = await sign(w.users.alice, { binding: bindingId });
    assert.equal(signed.status, "live", "an admin signs an agent-created proposal without hitting the signer<>proposer wall");
    return;
  }
  try {
    await sign(w.users.alice, { binding: bindingId });
    assert.fail("sign must throw while 0029 is absent");
  } catch (e) {
    assert.notEqual(reasonOf(e), "signer_is_proposer", `the wall must NOT fire for an admin signing an agent-created proposal, got detail: ${JSON.stringify(e.detail)}`);
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
    assert.notEqual(reasonOf(e), "signer_is_proposer",
      `bob was refused by rank, not by the signer<>proposer wall, but the wall's reason token leaked: ${JSON.stringify(e.detail)}`);
  }
});

test("x36c.9 sign_vendor_identity_binding still refuses a binding whose created_by is NULL (LOW-5, PROVEN BY EXECUTION, regression pin for the fail-open independent review measured for real)", async () => {
  requireReady();
  const cp = await seedPassingWindow(w, "C9null");
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  // Simulate a hypothetical future nullable-drift on the column directly, as owner (the
  // migration's own prestate would refuse a REAL such drift at apply time -- this cell proves
  // the WALL ITSELF is also independently safe, defense in depth, not merely relying on that
  // prestate check to have run). A bare `b.created_by = c.actor` would evaluate NULL here
  // (neither TRUE nor FALSE), which the original (pre-fix-round) draft of this wall got
  // wrong -- measured by the independent reviewer executing exactly this scenario.
  await rootQuery("update clara.vendor_identity_bindings set created_by = null where id = $1", [proposed.binding_id]);
  try {
    await sign(w.users.alice, { binding: proposed.binding_id });
    assert.fail("sign_vendor_identity_binding must refuse a NULL created_by, not silently sign it live (the fail-open this cell regression-pins)");
  } catch (e) {
    assert.equal(e.code, "CLR04", `expected CLR04, got ${e.code}: ${e.message}`);
    assert.equal(reasonOf(e), "signer_is_proposer", `expected the wall's reason token even on the defensive NULL arm, got: ${JSON.stringify(e.detail)}`);
  }
});
