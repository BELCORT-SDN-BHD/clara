// Wave-B battery — migration 0020 §4: PURPOSE-DISCRIMINATED CONSENT EVENTS, and
// what the wiki synthesis hold IS (a publish-time backstop + a visibility signal)
// versus what it is NOT (the dispatch gate — activation is).
//
// The §4.2 headline is a NEGATIVE: an `egress.consent_granted` for the LEGACY
// null-purpose (invoice-facts) surface must stop touching wiki authorization
// state. Today `planConsentTransition` CLEARS the wiki hold on a legacy grant —
// verified in the committed runtime source — so an invoice-facts consent silently
// releases a wiki control. The consumer half of that change is PR-B's; the
// DB-observable half is asserted here: the legacy writers touch no wiki state, a
// legacy grant/revoke leaves the typed verdict and the hold row untouched, and the
// typed RPCs are the ONLY things that move the hold for a typed purpose.
//
// §4.3's hold-transition OP KEYS are pinned and replay-safe, and they are asserted
// against clara.op_receipts because that is the only place a derived op key is
// observable. CONTRACT-BLIND; FAILS below 0020.
//
// AMBIGUITY recorded here:
//   [A20-6] §4.2 makes the legacy egress.consent_* lane CHECKPOINT-ONLY for wiki
//           but names NO replacement receipt token, and §9.6's vocabulary list
//           omits one. This lane asserts DB-observable state (no hold set, no hold
//           cleared, verdict unchanged) instead of guessing a token.
//   [A20-11] §4.1 says the payloads carry "the activation id where applicable".
//           Which of the four events that covers is not enumerated; asserted only
//           for the two activation events, and RECORDED for the other two.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, noteLane,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, createClient, seedOpeningCoa, filedDocument,
  WIKI_PURPOSE, PURPOSE_EVENT_TYPES, LEGACY_EVENT_TYPES, UNKNOWN_VERDICT,
  grantPurpose, activatePurpose, deactivatePurpose, revokePurpose,
  consentEvidenceDoc, livePurposeConsent, livePurposeActivation,
  prepareForLatestEvent, clientEventsOf, holdRow, opReceiptRow, wikiLogRows,
  grantClientEgress, revokeClientEgress, fnSource,
} from "./wb-0020-helpers.mjs";

let live = false;
let w = null;

async function freshClient(tag) {
  const c = await createClient(w.users.alice, { name: `${w.prefix}_${tag}`, opKey: opk("cli") });
  await seedOpeningCoa(w.users.alice, c);
  return c;
}

before(async () => {
  live = await wbEnsureReady20();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0020-events"); await endPool(); });

test("META / [0020 §4.1]: the four purpose-discriminated event types are registered CLIENT-SCOPED in the 0007 catalog, and the two legacy types are untouched", async () => {
  fail0020(live);
  for (const name of PURPOSE_EVENT_TYPES) {
    const r = await rootQuery(
      "select client_scoped from clara.event_types where name=$1", [name]);
    assert.equal(r.rows.length, 1, `clara.event_types carries ${name}`);
    assert.equal(r.rows[0].client_scoped, true, `${name} is CLIENT-SCOPED (§4.1)`);
    const tax = await rootQuery(
      `select decision from clara.trigger_taxonomy t
        where t.event_type=$1 order by t.version desc limit 1`, [name]);
    assert.ok(tax.rows.length, `${name} is registered in the trigger taxonomy`);
  }
  for (const name of LEGACY_EVENT_TYPES) {
    const r = await rootQuery("select client_scoped from clara.event_types where name=$1", [name]);
    assert.equal(r.rows.length, 1, `the LEGACY ${name} is still registered (0020 removes nothing)`);
  }
});

test("[0020 §4.1]: every typed event carries the purpose + the consent id, and the EVIDENCE DOCUMENT rides in the PAYLOAD — never the typed document_id column (the 0014 rule)", async () => {
  fail0020(live);
  const client = await freshClient("ev_payload");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("ev_g") });
  const c = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("ev_a") });
  const a = await livePurposeActivation(client);
  await deactivatePurpose(w.users.alice, { client, reason: "rig pause", opKey: opk("ev_d") });
  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal", opKey: opk("ev_r") });

  const seen = {};
  for (const type of PURPOSE_EVENT_TYPES) {
    const rows = await clientEventsOf(client, type);
    assert.equal(rows.length, 1, `exactly one ${type} for this client (got ${rows.length})`);
    const e = rows[0];
    seen[type] = e;
    assert.equal(e.client_id, client, `${type} is attributed to the client`);
    // THE 0014 RULE: a consent artifact must not trip the filing-history
    // provenance trigger, so it can never ride the typed document_id column.
    assert.equal(e.document_id, null,
      `${type} carries NO typed document_id — the consent artifact rides the payload only (§4.1)`);
    const p = e.payload ?? {};
    assert.equal(p.purpose, WIKI_PURPOSE, `${type} payload carries the purpose`);
    assert.ok(p.consent_id, `${type} payload carries the consent id`);
  }
  assert.equal(seen["egress.purpose_consent_granted"].payload.evidence_document_id, ev.documentId,
    "the GRANT payload names the evidence document (in the payload, per §4.1)");
  // [A20-11] "the activation id where applicable" — asserted for the two events
  // where an activation demonstrably exists.
  for (const type of ["egress.purpose_activated", "egress.purpose_deactivated"]) {
    assert.equal(seen[type].payload.activation_id, a.id,
      `${type} payload carries the activation id`);
  }
  noteLane(`[A20-11] activation_id presence on the grant/revoke events is contract-unstated; observed grant=${JSON.stringify(seen["egress.purpose_consent_granted"].payload.activation_id ?? null)} revoke=${JSON.stringify(seen["egress.purpose_consent_revoked"].payload.activation_id ?? null)}`);
});

// ===========================================================================
// §4.3 — the hold's typed transitions, and their pinned replay-safe op keys.
// ===========================================================================

test("[0020 §4.2/§4.3]: a typed GRANT does NOT activate and emits NO hold transition; ACTIVATION clears the hold; DEACTIVATION sets it; REVOKE sets it", async () => {
  fail0020(live);
  const client = await freshClient("ev_hold");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });

  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("h_g") });
  const c = await livePurposeConsent(client);
  assert.equal(await livePurposeActivation(client), null, "a typed grant mints NO activation (§4.2)");
  assert.equal(await holdRow(client), null, "…and emits NO hold transition");
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client }), UNKNOWN_VERDICT,
    "…so the verdict is still unknown");

  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("h_a") });
  const a = await livePurposeActivation(client);
  assert.equal(await holdRow(client), null, "activation leaves NO hold (it CLEARS via the audited writer)");
  // §4.3's pinned op key: wikirelease:purpose:<activation_id>.
  assert.ok(await opReceiptRow("clear_wiki_synthesis_hold", `wikirelease:purpose:${a.id}`),
    "the clear went through the AUDITED writer under the pinned op key wikirelease:purpose:<activation_id>");

  await deactivatePurpose(w.users.alice, { client, reason: "rig pause", opKey: opk("h_d") });
  const heldAfterDeact = await holdRow(client);
  assert.ok(heldAfterDeact, "deactivation SETS the visibility hold");
  assert.ok(String(heldAfterDeact.reason).trim() !== "", "…with a non-blank reason");
  assert.ok(await opReceiptRow("set_wiki_synthesis_hold", `wikihold:purpose:deact:${a.id}`),
    "…under the pinned op key wikihold:purpose:deact:<activation_id>");

  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal", opKey: opk("h_r") });
  assert.ok(await holdRow(client), "revocation leaves the hold SET");
  assert.ok(await opReceiptRow("set_wiki_synthesis_hold", `wikihold:purpose:${c.id}`),
    "…under the pinned op key wikihold:purpose:<consent_id>");
  // The hold transitions went through the audited writers, so wiki_log records them.
  const logActions = (await wikiLogRows(client)).map((r) => r.action);
  assert.ok(logActions.includes("release"), "wiki_log records the release (the cardinal invariant: never hand-write a row when an audited fn exists)");
  assert.ok(logActions.includes("hold"), "…and the holds");
});

test("[0020 §4.3]: the typed hold op keys are DERIVED and REPLAY-SAFE — a revoke of a re-granted consent uses a DIFFERENT key, so a second hold is a genuine transition and not a replayed receipt", async () => {
  fail0020(live);
  const client = await freshClient("ev_replay");
  const e1 = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: e1.documentId, opKey: opk("rp_g1") });
  const c1 = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c1.id, opKey: opk("rp_a1") });
  await revokePurpose(w.users.alice, { client, reason: "first", opKey: opk("rp_r1") });
  const e2 = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: e2.documentId, opKey: opk("rp_g2") });
  const c2 = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c2.id, opKey: opk("rp_a2") });
  await revokePurpose(w.users.alice, { client, reason: "second", opKey: opk("rp_r2") });
  assert.notEqual(c1.id, c2.id, "two distinct consent versions");
  assert.ok(await opReceiptRow("set_wiki_synthesis_hold", `wikihold:purpose:${c1.id}`),
    "the first revoke's hold receipt exists under consent #1's key");
  assert.ok(await opReceiptRow("set_wiki_synthesis_hold", `wikihold:purpose:${c2.id}`),
    "the second revoke's hold receipt exists under consent #2's DISTINCT key — a fixed per-client key would have replayed the first receipt forever");
  assert.ok(await holdRow(client), "the client ends HELD");
});

// ===========================================================================
// §4.2 — the LEGACY lane must stop touching wiki authorization state.
// ===========================================================================

test("[0020 §4.2 / §6 — THE cross-purpose negative]: a LEGACY null-purpose grant does NOT clear the wiki hold and does NOT authorize wiki synthesis; a legacy revoke does not set it either", async () => {
  fail0020(live);
  const client = await freshClient("ev_legacy");
  const ev = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("lg_g") });
  const c = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c.id, opKey: opk("lg_a") });
  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal", opKey: opk("lg_r") });
  const held = await holdRow(client);
  assert.ok(held, "the client is HELD by the typed revoke");

  // A LEGACY (invoice-facts) grant now lands. Pre-0020 the consumer cleared the
  // wiki hold on this event; the DB writer itself never did, and must not start.
  const legacyDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client });
  await grantClientEgress(w.users.alice, { client, evidenceDocument: legacyDoc.documentId, scopeNote: "legacy" });
  const after = await holdRow(client);
  assert.ok(after, "the wiki hold SURVIVES a legacy null-purpose grant");
  assert.equal(after.since, held.since, "…untouched, not re-stamped");
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client }), UNKNOWN_VERDICT,
    "…and the legacy grant did NOT authorize wiki synthesis (fail-closed PER PURPOSE, §1.2)");

  await revokeClientEgress(w.users.alice, { client, reason: "legacy revoke" });
  assert.ok(await holdRow(client), "the hold is still there after a legacy revoke too");
  noteLane("[A20-6] §4.2's 'legacy consent events become CHECKPOINT-ONLY for wiki' is a CONSUMER-lane change (planConsentTransition). Only its DB-observable half is assertable here; the receipt token the consumer records instead is NOT named by the contract and belongs to PR-B's runtime suite.");
});

test("[0020 §4.2/§6]: the legacy consent writers carry NO wiki reference at all — neither a relation token nor a call edge into the wiki writers", async () => {
  fail0020(live);
  for (const fn of ["grant_client_egress", "revoke_client_egress"]) {
    const src = (await fnSource(fn)).toLowerCase();
    for (const tok of ["wiki_synthesis_holds", "wiki_pages", "wiki_log",
      "set_wiki_synthesis_hold", "clear_wiki_synthesis_hold", "publish_wiki_page_version"]) {
      assert.ok(!src.includes(tok),
        `clara.${fn} does not reference ${tok} — the legacy lane owns invoice-facts only`);
    }
    assert.ok(!/\bpurpose\b/.test(src),
      `clara.${fn} carries NO purpose vocabulary — 0020 left the legacy writer byte-identical (§6)`);
  }
});

test("[0020 §4.3]: the hold is a PUBLISH-TIME backstop, not the dispatch gate — publish_wiki_page_version still refuses p_synthesis='model' under a live hold, unchanged", async () => {
  fail0020(live);
  const src = (await fnSource("_publish_wiki_page_version_core")).toLowerCase();
  assert.ok(src.includes("wiki_synthesis_holds"),
    "the publication core still reads the hold table (0017:2040-2043 — unchanged by 0020)");
  assert.ok(src.includes("consent_held"),
    "…and still raises the CLR32 consent_held refusal");
  // The gate is ACTIVATION, so the prepare/consume verdict fns must NOT read the hold.
  for (const fn of ["prepare_egress_dispatch", "consume_egress_dispatch"]) {
    const s = (await fnSource(fn)).toLowerCase();
    assert.ok(!s.includes("wiki_synthesis_holds"),
      `clara.${fn} does NOT read wiki_synthesis_holds — §4.3: adding a plan-time hold read would be a second TOCTOU, not a control`);
  }
  noteLane("[0020 R-3] The named residual — an in-flight held_consent plan re-parking an already-activated client — is a RUNTIME ordering property (a set_wiki_synthesis_hold landing after an activation). It fails safe and is visible via the hold's reason + since; it is not deterministically expressible in the DB rig and is NOT asserted here.");
});
