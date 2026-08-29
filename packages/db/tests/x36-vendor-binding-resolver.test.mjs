// Migration 0028 -- Slot A's live-binding resolver, exercised end-to-end now that 0029
// makes 'live' reachable (task #36, owner-mandated follow-up). Closes the standing lesson
// this exact battery just relearned: "never exercised because it was structurally
// unreachable" is not a defense once the blocker (0029) is gone -- the cell that WOULD have
// caught the min(uuid) crash, the F2-omission over-match, and the birth-gate reachability
// gap has to actually exist.
//
//   x36v.1 drive a binding fully to 'live' (propose -> sign, 0029 present).
//   x36v.2 a NEW document (outside the evidence window) whose vendor name/registration/
//     invoice-prefix all match the live binding resolves via clara._resolve_vendor_binding
//     -- proves F1+F2+F3 all hit AND the uuid tiebreak (array_agg(...)[1]) never 42883s on
//     the v_matches=1 path.
//   x36v.3 THE F2 NEGATIVE CELL (owner-mandated): F1 and F3 both hold, but the new
//     document's invoice_id does NOT start with the binding's stored prefix -- must NOT
//     resolve. Proves the matcher is no longer WIDER than designed.
//   x36v.4 THE AMBIGUOUS SHAPE, honestly rebuilt after the owner ruling: the
//     registration_conflict admission carries a candidate-equality wall, so it can never
//     itself produce v_matches>1 -- true ambiguity is only reachable via the ORIGINAL
//     'birth' path (two DIFFERENT registered vendors, both also invoiced under one SHARED
//     trading name that matches neither registration).
//   x36v.5 THE DIFFERENT-CANDIDATE REFUSAL (owner-mandated): the page's own bare-name
//     evidence points at a REGISTERED counterparty other than the one whose binding would
//     otherwise match on F1+F2+F3 -- must refuse, not admit the uninvolved binding.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld } from "./x1-helpers.mjs";
import {
  has28, has29, seedPayableAccount, seedLiveBinding, seedBareDocument, seedF123Evidence,
  seedVendorCounterparty, seedApprovedEntry, propose, sign,
} from "./x36-vendor-binding-helpers.mjs";

let has0028 = false;
let has0029 = false;
let w = null;

before(async () => {
  has0028 = await has28();
  has0029 = await has29();
  if (!has0028) { noteLane("0028 absent -- x36-vendor-binding-resolver battery FAILS loudly rather than skipping"); return; }
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
});
after(async () => { printLaneNotes("x36-vendor-binding-resolver"); await endPool(); });

function requireReady() {
  if (!has0028) {
    throw new Error(
      "0028 NOT applied (clara.schema_migrations has no '0028_%' row) -- this battery is "
      + "REQUIRED to fail against the 27-migration prestate.");
  }
  if (!has0029) {
    throw new Error(
      "0029 NOT applied -- a binding can never reach 'live' without it, so this battery "
      + "(which specifically covers the LIVE-binding resolution path) is REQUIRED to fail "
      + "rather than silently skip. This is exactly the structural-unreachability trap the "
      + "owner flagged: absence of coverage must be visible, never quiet.");
  }
}

// P-round (Finding A/E): _resolve_vendor_binding gained a third p_page_candidate
// parameter and now returns jsonb {outcome:'bound'|'unresolved'|'ambiguous', ...} instead
// of a bare uuid/null -- the caller (_coding_lane_core) now derives the page candidate
// itself and passes it in; this resolver no longer re-derives it internally.
async function resolveOrError(client, document, pageCandidate = null) {
  const r = await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,$3) as r", [client, document, pageCandidate],
  );
  return r.rows[0].r;
}

/** propose -> sign a binding to 'live' whose 3-document window ALL cite the SAME
 *  literal invoiceId (so f2_invoice_prefix ends up being that whole string -- a
 *  deterministic, caller-controlled prefix) AND the SAME evidence vendor-name text
 *  (so F1 is that exact _binding_normalize'd string). `evidenceIdentity` lets the
 *  evidence's invoice.vendor_name region carry TEXT DIFFERENT from the counterparty's
 *  own registered name -- realistic (an invoice's letterhead trading name need not be
 *  the SSM-registered legal name) and needed to construct name-collision cells where
 *  _resolve_counterparty's exact registered-name lookup must NOT find the counterparty
 *  even though F1 (derived purely from evidence text) matches. Defaults to `cp` itself. */
async function bindLiveWithInvoiceId(cp, invoiceId, evidenceIdentity = cp) {
  const dates = ["2025-08-25", "2025-08-29", "2025-10-13"];
  let i = 0;
  for (const d of dates) {
    const doc = await seedBareDocument(w.firms.A, `${cp.id}-${d}`);
    // 裁-18b PR-1 (the wall-introducing-PR law): the three documents now carry DISTINCT printed
    // invoice ids, because a corpus wall above the frozen window refuses three scans of one
    // invoice. The ids are `${invoiceId}1/2/3`, so their longest common prefix is EXACTLY
    // `invoiceId` — this helper's whole contract ("f2_invoice_prefix ends up being that whole
    // string") is preserved byte-for-byte, and every cell below still reads the prefix it
    // expects. The approved_at/extracted_at backdating is the trusted-clock wall's requirement.
    await seedF123Evidence(w.firms.A, doc.id, evidenceIdentity, `${invoiceId}${i + 1}`,
      evidenceIdentity.name, `${d}T00:00:00Z`);
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc,
      { postingDate: d, approvedAt: `${d}T09:00:00Z` });
    i += 1;
  }
  const proposed = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id });
  return sign(w.users.alice, { binding: proposed.binding_id });
}

/** Add one more top-band OCR region to a document's (already-seeded) ocr extraction,
 *  naming `text` -- so F3 can be independently satisfied for a SECOND candidate whose
 *  own registration/name differs from whatever seedF123Evidence's own region embedded.
 *  _binding_f3_holds is always called with cp.name_normalized -- the ALPHANUMERIC-ONLY
 *  fold (no spaces), same as 0029's own post-time check -- so its name branch can only
 *  match text that ALSO lacks the relevant spaces; multi-word names embedded WITH spaces
 *  (as seedF123Evidence does) only ever corroborate via the registration branch, which
 *  is exactly why every multi-candidate cell below carries an explicit registration line
 *  per candidate rather than relying on a shared name to satisfy F3. */
async function addTopBandOcrLine(document, text) {
  const ocrExt = (await rootQuery(
    `select e.id from clara.document_extractions e
       where e.document_id=$1 and e.engine_kind='ocr' and e.status='done'
       order by e.version_n desc,e.id desc limit 1`,
    [document],
  )).rows[0].id;
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon',$3::jsonb,'pages.1.lines.1',$4,1.0)`,
    [w.firms.A, ocrExt, JSON.stringify({ page_number: 1, polygon: [1, 0.55, 2, 0.55, 2, 0.95, 1, 0.95] }), text],
  );
}

// ---------------------------------------------------------------------------

test("x36v readiness", () => { requireReady(); assert.ok(w, "world built"); });

test("x36v.1 propose -> sign drives a binding to 'live' (0029 present)", async () => {
  requireReady();
  const { binding } = await seedLiveBinding(w, "V1");
  assert.equal(binding.status, "live");
  assert.ok(binding.binding_id, "binding_id returned");
});

test("x36v.2 a NEW document matching F1+F2+F3 resolves via _resolve_vendor_binding (the uuid tiebreak never 42883s)", async () => {
  requireReady();
  const { cp, binding } = await seedLiveBinding(w, "V2");
  // A document OUTSIDE the 3-doc evidence window: same vendor name (F1), an invoice_id that
  // STARTS WITH the binding's stored prefix (F2), and OCR band text naming the same
  // registration (F3). This is exactly what Slot A meets on a real future document. F1 here
  // ALSO exactly equals cp's own registered name, so _resolve_counterparty finds cp itself
  // (CLR23 registration_conflict, candidate_id=cp.id) -- the clean-name-same-party admission
  // path condition 5's amendment exists to cover.
  const newDoc = await seedBareDocument(w.firms.A, "v2-new");
  const invoiceId = `${binding.f2_invoice_prefix}-99`;
  await seedF123Evidence(w.firms.A, newDoc.id, cp, invoiceId);
  // The page's bare-name lookup finds cp itself (registration_conflict, candidate=cp.id) --
  // _coding_lane_core is what derives this in production; the test supplies it directly
  // to exercise the resolver's own contract in isolation.
  const resolved = await resolveOrError(w.clients.A1, newDoc.id, cp.id);
  assert.equal(resolved.outcome, "bound", `expected bound, got: ${JSON.stringify(resolved)}`);
  assert.equal(resolved.counterparty_id, cp.id, "the new document resolves to the bound counterparty");
  assert.equal(resolved.binding_id, binding.binding_id);
});

test("x36v.2b BIRTH STILL ADMITS — a trading-name F1 that matches no counterparty's OWN registration resolves via the original birth path", async () => {
  requireReady();
  // The ORIGINAL case A.1 condition 5 was written against (Part 2's fragmented-name
  // shape): the page's own bare-name lookup finds NOTHING at all -- 'birth', not a
  // registration_conflict -- and a single unambiguous live binding still resolves. cp is
  // registered under its OWN name, but the evidence window (and this new document) cite a
  // DIFFERENT trading-name text that matches no counterparty's registration.
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "BIRTH");
  const tradingName = `FRAGMENTED TRADING NAME ${randomUUID().slice(0, 5)}`;
  const invoiceId = `BIRTH-${randomUUID().slice(0, 6)}`;
  const binding = await bindLiveWithInvoiceId(cp, invoiceId, { name: tradingName, reg: cp.reg });
  assert.equal(binding.status, "live");

  const newDoc = await seedBareDocument(w.firms.A, "v2b-new");
  await seedF123Evidence(w.firms.A, newDoc.id, { name: tradingName, reg: cp.reg }, `${invoiceId}-99`);

  const birthCheck = await rootQuery(
    "select clara._resolve_counterparty($1,$2) as r",
    [w.clients.A1, JSON.stringify({ kind: "vendor", new: { name: tradingName } })],
  );
  assert.equal(birthCheck.rows[0].r.decision, "birth",
    "fixture sanity: the trading name must resolve to birth (matches no registered counterparty)");

  const resolved = await resolveOrError(w.clients.A1, newDoc.id, null);
  assert.equal(resolved.outcome, "bound", `expected bound, got: ${JSON.stringify(resolved)}`);
  assert.equal(resolved.counterparty_id, cp.id,
    "a single, unambiguous live binding still resolves via the original birth path");
});

test("x36v.3 F2 NEGATIVE — F1 and F3 hold but the invoice prefix does not match -> no resolution", async () => {
  requireReady();
  const { cp, binding } = await seedLiveBinding(w, "V3");
  const newDoc = await seedBareDocument(w.firms.A, "v3-new");
  // Deliberately UNRELATED to binding.f2_invoice_prefix -- a fresh random id sharing no
  // prefix with the stored one. F1 (same cp.name) and F3 (same cp.reg in the OCR band)
  // both still hold; only F2 differs.
  const wrongPrefixInvoiceId = `UNRELATED-${randomUUID().slice(0, 8)}`;
  assert.ok(
    !wrongPrefixInvoiceId.toLowerCase().startsWith(binding.f2_invoice_prefix.toLowerCase()),
    "fixture sanity: the wrong-prefix id must not actually share the stored prefix",
  );
  await seedF123Evidence(w.firms.A, newDoc.id, cp, wrongPrefixInvoiceId);
  // Same setup as x36v.2 -- the page's bare-name lookup finds cp itself.
  const resolved = await resolveOrError(w.clients.A1, newDoc.id, cp.id);
  // A unique F1 match whose F2 fails is reported as 'ambiguous' (P-round Finding B/E) --
  // never a silent 'unresolved' that would look identical to no evidence existing at all.
  assert.equal(resolved.outcome, "ambiguous",
    `a document whose invoice_id does not extend the bound F2 prefix must not resolve as `
    + `bound, even though F1 and F3 both hold -- got: ${JSON.stringify(resolved)}`);
});

test("x36v.4 AMBIGUOUS (honest rebuild) — two DIFFERENT registered vendors, both invoiced under the SAME trading name, both live and both matching -> resolves to nothing", async () => {
  requireReady();
  // Owner ruling (post-blocker): condition 5's registration_conflict admission carries a
  // candidate-equality wall, which means it structurally narrows to AT MOST the one
  // candidate the page's own bare-name lookup finds -- v_matches can never exceed 1 via
  // that path. The TRUE v_matches=2 ambiguity is only reachable via the ORIGINAL 'birth'
  // path: _resolve_counterparty's exact registered-name lookup must find NEITHER
  // candidate, while their STORED F1 (derived purely from EVIDENCE TEXT at propose time,
  // never from counterparties.name) both independently equal the incoming page's name.
  // Realistic shape: two vendors registered under DISTINCT legal names, both also
  // invoiced under one shared trading name that matches NEITHER registration -- e.g. a
  // shared secretarial/nominee letterhead used by two unrelated client entities.
  const cpA = await seedVendorCounterparty(w.firms.A, w.clients.A1, "AMBA");
  const cpB = await seedVendorCounterparty(w.firms.A, w.clients.A1, "AMBB");
  assert.notEqual(cpA.name, cpB.name, "fixture sanity: distinct REGISTERED names");
  assert.notEqual(cpA.reg, cpB.reg, "fixture sanity: distinct registrations");

  const tradingName = `SHARED TRADING NAME ${randomUUID().slice(0, 5)}`;
  const sharedInvoiceId = `AMBIGUOUS-${randomUUID().slice(0, 6)}`;
  // Both evidence windows cite the trading name (not either cp's OWN registered name)
  // and the SAME literal invoiceId, so BOTH bindings' F1 and F2 collide exactly.
  const bindingA = await bindLiveWithInvoiceId(cpA, sharedInvoiceId, { name: tradingName, reg: cpA.reg });
  const bindingB = await bindLiveWithInvoiceId(cpB, sharedInvoiceId, { name: tradingName, reg: cpB.reg });
  assert.equal(bindingA.status, "live");
  assert.equal(bindingB.status, "live");
  assert.notEqual(bindingA.binding_id, bindingB.binding_id);
  assert.equal(bindingA.f2_invoice_prefix, bindingB.f2_invoice_prefix,
    "fixture sanity: identical window invoice ids -> identical stored F2 prefixes");
  assert.equal(bindingA.f1_vendor_name_norm, bindingB.f1_vendor_name_norm,
    "fixture sanity: both windows cited the SAME trading-name text -> identical F1");

  // The new document: vendor_name = the trading name (matches neither cp's OWN registered
  // name -> _resolve_counterparty must return 'birth', not a registration_conflict). F3
  // needs each candidate's OWN registration text present; embed both as separate lines.
  const newDoc = await seedBareDocument(w.firms.A, "v4-new");
  await seedF123Evidence(w.firms.A, newDoc.id, { name: tradingName, reg: cpA.reg }, `${sharedInvoiceId}-99`);
  await addTopBandOcrLine(newDoc.id, cpB.reg);

  const birthCheck = await rootQuery(
    "select clara._resolve_counterparty($1,$2) as r",
    [w.clients.A1, JSON.stringify({ kind: "vendor", new: { name: tradingName } })],
  );
  assert.equal(birthCheck.rows[0].r.decision, "birth",
    "fixture sanity: the trading name must resolve to birth (matches neither cp's own registered name)");

  const resolved = await resolveOrError(w.clients.A1, newDoc.id, null);
  assert.equal(resolved.outcome, "ambiguous",
    `two live bindings independently matching the same document via the birth path must `
    + `resolve as ambiguous (fail-closed) -- never bound, never an error, never an `
    + `arbitrary pick -- got: ${JSON.stringify(resolved)}`);
});

test("x36v.5 DIFFERENT CANDIDATE REFUSES — the page's own evidence names a DIFFERENT known party than the F1/F2/F3-matching binding", async () => {
  requireReady();
  // cpCompetitor: a REGISTERED counterparty the page's own bare-name evidence points at
  // directly (registration_conflict, candidate_id=cpCompetitor) -- but it holds NO binding.
  const cpCompetitor = await seedVendorCounterparty(w.firms.A, w.clients.A1, "COMP");
  // cpBound: a DIFFERENT counterparty with a live binding that WOULD otherwise match this
  // exact document on F1+F2+F3 -- except its F1 is cpCompetitor's OWN registered name (the
  // binding's evidence window happened to also cite that text), so without the candidate-
  // equality wall this would incorrectly resolve to cpBound.
  const cpBound = await seedVendorCounterparty(w.firms.A, w.clients.A1, "BOUND");
  const invoiceId = `COMPETE-${randomUUID().slice(0, 6)}`;
  const binding = await bindLiveWithInvoiceId(cpBound, invoiceId, { name: cpCompetitor.name, reg: cpBound.reg });
  assert.equal(binding.status, "live");
  assert.equal(binding.f1_vendor_name_norm, cpCompetitor.name.toLowerCase(),
    "fixture sanity: the bound vendor's F1 is cpCompetitor's OWN registered name text");

  // The new document: vendor_name = cpCompetitor's exact registered name (so
  // _resolve_counterparty finds cpCompetitor specifically, CLR23 registration_conflict).
  // F2/F3 both still line up with cpBound's binding (extending its prefix, naming
  // cpBound's own registration in the OCR band) -- the ONLY thing that should stop this
  // admission is the candidate-equality wall.
  const newDoc = await seedBareDocument(w.firms.A, "v5-new");
  await seedF123Evidence(w.firms.A, newDoc.id, { name: cpCompetitor.name, reg: cpBound.reg }, `${invoiceId}-99`);

  let conflictCode = null;
  try {
    await rootQuery(
      "select clara._resolve_counterparty($1,$2) as r",
      [w.clients.A1, JSON.stringify({ kind: "vendor", new: { name: cpCompetitor.name } })],
    );
  } catch (e) {
    conflictCode = e.code;
  }
  assert.equal(conflictCode, "CLR23", "fixture sanity: cpCompetitor's own name must raise, not birth");

  // The page's evidence points at cpCompetitor -- the resolver is constrained to ONLY
  // cpCompetitor's own bindings, which has none, so this is a plain non-match (not
  // 'ambiguous' -- that outcome is reserved for a genuine multi-candidate or F2-mismatch
  // shape, neither of which applies here: cpBound's binding is excluded by the
  // candidate-equality wall before it is ever counted).
  const resolved = await resolveOrError(w.clients.A1, newDoc.id, cpCompetitor.id);
  assert.equal(resolved.outcome, "unresolved",
    `the page's own evidence names cpCompetitor, not cpBound -- REFUSE, never admit the `
    + `F1/F2/F3-matching but uninvolved binding (the binding_page_resolves_other family) -- `
    + `got: ${JSON.stringify(resolved)}`);
});
