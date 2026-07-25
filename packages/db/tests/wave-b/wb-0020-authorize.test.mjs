// Wave-B battery — migration 0020 §3: TWO-PHASE DISPATCH AUTHORIZATION.
//
// The verdict function is the ONLY thing the runtime learns about a client's
// consent, so its return is a STRUCTURAL allowlist: `{verdict, authorization_id}`
// and nothing else. `denied` is deleted from the vocabulary — both non-granted
// states lead to the identical safety action, so distinguishing them would be a
// runtime-readable oracle for "did this client ever consent, and did they
// withdraw?". This file proves the allowlist, the byte-identity of every
// non-granted payload, single-use consumption, the TTL, the firm binding and
// §3.5's same-transaction invalidation. The RACES live in wb-0020-races.
// CONTRACT-BLIND; FAILS below 0020.
//
// AMBIGUITIES recorded here:
//   [A20-3] Does prepare VALIDATE (p_event_seq, p_event_type) against
//           clara.domain_events? §3.2 calls them "dispatch intent"; §8 pins no FK.
//           Every positive cell passes a REAL pair so both readings pass; one cell
//           probes a synthetic pair and RECORDS the observed behaviour.
//   [A20-10] §3.2 pins `expires_at NOT NULL` and a 120s TTL but does not say
//           whether `expires_at` is exposed anywhere. §3.3's allowlist forbids it
//           in the RETURN; the column itself is asserted present on the row.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, CLR, rootQuery, opk, endPool, printLaneNotes, noteLane, assertRaisesOneOf, checkDefs,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, createClient, seedOpeningCoa, filedDocument,
  WIKI_PURPOSE, DISPATCH_AUTH_TABLE, UNKNOWN_VERDICT, CONSUME_GRANTED, CONSUME_UNKNOWN,
  FORBIDDEN_RETURN_KEYS, TTL_SECONDS,
  grantPurpose, activatePurpose, deactivatePurpose, revokePurpose,
  consentEvidenceDoc, livePurposeConsent, lightSynthesis,
  prepareDispatch, prepareForLatestEvent, consumeDispatch, latestEventOf,
  authorizationRow, authorizationsForConsent, authorizationsForClient,
  backdateAuthExpiry, canonical, keysOf, countRows,
  grantClientEgress, revokeClientEgress, grantConsent,
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
after(async () => { printLaneNotes("wb-0020-authorize"); await endPool(); });

test("META: 0020 applied — the dispatch-authorization relation carries the pinned intent + terminal columns and the one-terminal CHECK", async () => {
  fail0020(live);
  const cols = (await rootQuery(
    `select column_name from information_schema.columns
       where table_schema='clara' and table_name=$1 order by column_name`,
    [DISPATCH_AUTH_TABLE])).rows.map((x) => x.column_name);
  for (const c of ["id", "firm_id", "client_id", "purpose", "consent_id", "activation_id",
    "event_seq", "event_type", "document_sha256", "issued_at", "expires_at",
    "consumed_at", "invalidated_at", "invalidated_reason"]) {
    assert.ok(cols.includes(c), `clara.${DISPATCH_AUTH_TABLE}.${c} exists (got ${cols.join(",")})`);
  }
  const defs = await checkDefs(DISPATCH_AUTH_TABLE);
  assert.ok(/consumed_at/.test(defs) && /invalidated_at/.test(defs),
    `the at-most-one-terminal CHECK names both terminals (got ${defs})`);
  assert.ok(/document_sha256/.test(defs) && /wiki_synthesis/.test(defs),
    `the "document_sha256 is null for wiki_synthesis" CHECK is present (got ${defs}) — WB-R23's "+ document hash where applicable" slot, reserved not used`);
});

// ===========================================================================
// §3.3 — the verdict's structural return allowlist.
// ===========================================================================

test("[0020 §3.3 — THE leakage cell]: `granted` returns EXACTLY {verdict, authorization_id} — no granted_at, no consent/activation id, no evidence, no scope, no expiry, no history, no count", async () => {
  fail0020(live);
  const client = await freshClient("auth_keys");
  const { consent } = await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.deepEqual(keysOf(v), ["authorization_id", "verdict"],
    `the granted verdict has EXACTLY two keys (got ${JSON.stringify(v)})`);
  assert.equal(v.verdict, "granted");
  assert.match(String(v.authorization_id), /^[0-9a-f-]{36}$/, "authorization_id is a bare uuid");
  const blob = JSON.stringify(v);
  for (const k of FORBIDDEN_RETURN_KEYS) {
    assert.ok(!Object.prototype.hasOwnProperty.call(v, k), `the return does not carry key '${k}'`);
  }
  // The id is OPAQUE: it must encode nothing about the consent it authorizes.
  assert.ok(!blob.includes(consent.id), "the return does not leak the consent id");
  assert.ok(!blob.includes(consent.evidence_document_id), "…nor the evidence document id");
  assert.ok(!blob.includes(String(consent.scope_note)), "…nor the scope note");
  // …and the row the id names DOES carry all of it, owner-only behind FORCE RLS.
  const row = await authorizationRow(v.authorization_id);
  assert.equal(row.consent_id, consent.id, "the authorization ROW binds the consent (owner-only surface)");
  assert.equal(row.purpose, WIKI_PURPOSE, "…and the purpose");
  assert.equal(row.consumed_at, null, "…unconsumed");
  assert.equal(row.invalidated_at, null, "…and not invalidated");
  assert.ok(row.expires_at, "[A20-10] expires_at is populated on the row (never in the return)");
});

test("[0020 §3.3 / §9.1 — THE no-oracle cell]: ALL SIX non-granted states return a BYTE-IDENTICAL {verdict:'unknown',authorization_id:null}; the literal 'denied' never appears", async () => {
  fail0020(live);
  const ev = await latestEventOf(w.firms.A);
  const P = (client) => prepareDispatch({ firm: w.firms.A, client, eventSeq: ev.seq, eventType: ev.eventType });

  // (1) never attested.
  const never = await freshClient("auth_never");
  // (2) attested then revoked.
  const revoked = await freshClient("auth_revoked");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client: revoked });
  await revokePurpose(w.users.alice, { client: revoked, opKey: opk("nr_rv") });
  // (3) consent live but NEVER activated.
  const unactivated = await freshClient("auth_unact");
  const evd = await consentEvidenceDoc(w.firms.A);
  await grantPurpose(w.users.alice, { client: unactivated, evidenceDocument: evd.documentId, opKey: opk("nr_g") });
  // (4) consent live, activation DEACTIVATED.
  const paused = await freshClient("auth_paused");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client: paused });
  await deactivatePurpose(w.users.alice, { client: paused, opKey: opk("nr_d") });
  // (5) LEGACY null-purpose consent only — RPR's exact live shape.
  const legacyOnly = await freshClient("auth_legacy");
  await grantConsent(w.users.alice, { firm: w.firms.A, client: legacyOnly });

  const payloads = {
    never: await P(never),
    revoked: await P(revoked),
    unactivated: await P(unactivated),
    paused: await P(paused),
    legacyOnly: await P(legacyOnly),
    // (6) FOREIGN FIRM: a firm-B caller naming a firm-A client.
    foreignFirm: await prepareDispatch({ firm: w.firms.B, client: never, eventSeq: ev.seq, eventType: ev.eventType }),
    // (7) NONEXISTENT client.
    nonexistent: await prepareDispatch({
      firm: w.firms.A, client: "00000000-0000-4000-8000-0000000000cc",
      eventSeq: ev.seq, eventType: ev.eventType }),
    // (8) UNKNOWN purpose — §9.1: `unknown`, NEVER an error.
    unknownPurpose: await prepareDispatch({
      firm: w.firms.A, client: never, purpose: "treatment_synthesis",
      eventSeq: ev.seq, eventType: ev.eventType }),
  };
  const want = canonical(UNKNOWN_VERDICT);
  for (const [label, got] of Object.entries(payloads)) {
    assert.equal(canonical(got), want,
      `${label}: byte-identical {"verdict":"unknown","authorization_id":null} (got ${JSON.stringify(got)})`);
    assert.ok(!JSON.stringify(got).includes("denied"),
      `${label}: the token 'denied' is DELETED from the vocabulary (§3.3)`);
  }
  // …and NO authorization row was minted by any refusal.
  for (const c of [never, revoked, unactivated, paused, legacyOnly]) {
    assert.equal((await authorizationsForClient(c)).length, 0,
      "a non-granted verdict mints NO authorization row");
  }
});

test("[0020 §3.3 — THE firm-binding cell]: a FULLY LIT client probed with the WRONG firm returns `unknown` and mints NOTHING — p_firm is an authorization argument, not decoration", async () => {
  fail0020(live);
  const client = await freshClient("auth_firmbind");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const ev = await latestEventOf(w.firms.A);
  assert.equal(
    (await prepareDispatch({ firm: w.firms.A, client, eventSeq: ev.seq, eventType: ev.eventType })).verdict,
    "granted", "the client IS lit in its own firm — so the refusal below is the FIRM check, not a fail-closed artefact");
  const foreign = await prepareDispatch({ firm: w.firms.B, client, eventSeq: ev.seq, eventType: ev.eventType });
  assert.deepEqual(foreign, UNKNOWN_VERDICT,
    "a firm-B caller naming a LIT firm-A client gets the uniform unknown — a p_firm-ignoring body would have returned granted here");
  const foreignS = await prepareDispatch({ firm: w.firms.S, client, eventSeq: ev.seq, eventType: ev.eventType });
  assert.deepEqual(foreignS, UNKNOWN_VERDICT, "…and so does a third firm");
  const rows = await authorizationsForClient(client);
  assert.equal(rows.length, 1, "exactly ONE authorization exists — neither foreign probe minted one");
  assert.equal(rows[0].firm_id, w.firms.A, "…and it belongs to firm A");
});

test("[0020 §3.2]: the authorization relation is APPEND-ONLY apart from the two terminal transitions — a DELETE or an UPDATE of the binding columns raises CLR08", async () => {
  fail0020(live);
  const client = await freshClient("auth_immut");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  const id = v.authorization_id;
  await assertRaisesOneOf([CLR.immutable],
    () => rootQuery(`delete from clara.${DISPATCH_AUTH_TABLE} where id=$1`, [id]),
    "DELETE of a dispatch authorization");
  for (const [col, val] of [["firm_id", w.firms.B], ["client_id", w.clients.A1],
    ["event_seq", 42], ["expires_at", "now() + interval '1 day'"]]) {
    const set = col === "expires_at" ? `expires_at = ${val}` : `${col} = $2`;
    const params = col === "expires_at" ? [id] : [id, val];
    await assertRaisesOneOf([CLR.immutable],
      () => rootQuery(`update clara.${DISPATCH_AUTH_TABLE} set ${set} where id=$1`, params),
      `UPDATE of the ${col} binding column`);
  }
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: id }), CONSUME_GRANTED,
    "the row survived every tampering attempt intact and still consumes cleanly");
});

test("[0020 §3.3 — an UNSTATED input, RECORDED]: a client that is neither active nor onboarding but IS lit — the contract does not say whether prepare re-checks client status", async () => {
  fail0020(live);
  const client = await freshClient("auth_archived");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted", "lit while active");
  await rootQuery("update clara.clients set status='archived' where id=$1", [client]);
  const after = await prepareForLatestEvent({ firm: w.firms.A, client });
  noteLane(`[A20-17] prepare_egress_dispatch for an ARCHIVED but fully-lit client returned ${JSON.stringify(after)}. §3.3's grant condition names only "a live typed consent + a live activation + p_client belongs to p_firm" — client STATUS is not in it, while the wiki writers all floor on active/onboarding (0017:2200-2204). Whether an archived client should still authorize model egress is a real product question the contract does not answer.`);
  assert.ok(["granted", "unknown"].includes(after.verdict), "the verdict is one of the two members of the vocabulary");
});

test("[0020 §3.3]: every `granted` prepare mints a FRESH authorization row — ids are never reused, and two prepares for the same event yield two distinct ids", async () => {
  fail0020(live);
  const client = await freshClient("auth_fresh");
  const { consent } = await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const ev = await latestEventOf(w.firms.A);
  const a = await prepareDispatch({ firm: w.firms.A, client, eventSeq: ev.seq, eventType: ev.eventType });
  const b = await prepareDispatch({ firm: w.firms.A, client, eventSeq: ev.seq, eventType: ev.eventType });
  assert.notEqual(a.authorization_id, b.authorization_id, "each prepare mints a NEW id");
  const rows = await authorizationsForConsent(consent.id);
  assert.equal(rows.length, 2, "two distinct authorization rows");
  for (const r of rows) {
    assert.equal(Number(r.event_seq), ev.seq, "the dispatch intent's event seq is recorded");
    assert.equal(r.event_type, ev.eventType, "…and its event type");
    assert.equal(r.document_sha256, null,
      "document_sha256 is NULL for wiki_synthesis (the reserved slot, §3.2)");
  }
});

// ===========================================================================
// §3.4 — consumption is the dispatch linearization point.
// ===========================================================================

test("[0020 §3.4 / §9.3(d)]: the no-race baseline — prepare `granted` → consume `granted` (ONE key), and the row is terminally consumed", async () => {
  fail0020(live);
  const client = await freshClient("auth_happy");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.equal(v.verdict, "granted");
  const got = await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id });
  assert.deepEqual(keysOf(got), ["verdict"], `consume returns EXACTLY one key (got ${JSON.stringify(got)})`);
  assert.deepEqual(got, CONSUME_GRANTED, "…and it is granted");
  const row = await authorizationRow(v.authorization_id);
  assert.ok(row.consumed_at, "consumed_at is stamped");
  assert.equal(row.invalidated_at, null, "…and the row was not also invalidated (the one-terminal CHECK)");
});

test("[0020 §3.4 / §9.3(e)]: SINGLE USE — a second consume of the same authorization id returns `unknown`; there is no peek variant", async () => {
  fail0020(live);
  const client = await freshClient("auth_twice");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_GRANTED);
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "the SECOND consume is unknown — a consumed authorization is terminal (§3.2: no reuse path)");
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "…and stays unknown");
});

test("[0020 §3.4 / §9.3(g)]: consuming an authorization prepared for a DIFFERENT firm returns `unknown` — and does NOT consume it", async () => {
  fail0020(live);
  const client = await freshClient("auth_xfirm");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.deepEqual(await consumeDispatch({ firm: w.firms.B, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "a firm-B consume of a firm-A authorization is unknown");
  assert.equal((await authorizationRow(v.authorization_id)).consumed_at, null,
    "…and it did NOT burn the authorization — the legitimate owner can still consume it");
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_GRANTED,
    "the firm-A consume still succeeds");
  // An unknown authorization id is the same uniform unknown — no existence oracle.
  assert.deepEqual(
    await consumeDispatch({ firm: w.firms.A, authorization: "00000000-0000-4000-8000-0000000000dd" }),
    CONSUME_UNKNOWN, "a nonexistent authorization id returns the SAME unknown");
});

test("[0020 §3.2/§3.4 / §9.3(f)]: TTL — an authorization consumed after `expires_at` returns `unknown`; the pinned window is 120 seconds", async () => {
  fail0020(live);
  const client = await freshClient("auth_ttl");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  const row = await authorizationRow(v.authorization_id);
  const ttl = (new Date(row.expires_at).getTime() - new Date(row.issued_at).getTime()) / 1000;
  assert.ok(Math.abs(ttl - TTL_SECONDS) < 2,
    `the TTL is the pinned ${TTL_SECONDS}s (observed ${ttl}s) — a single named constant in the migration (§3.2)`);
  // Expiry is TIME-DERIVED (no sweep job, no expiry write): backdate and re-consume.
  await backdateAuthExpiry(v.authorization_id, { seconds: 5 });
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "an expired authorization refuses");
  const after = await authorizationRow(v.authorization_id);
  assert.equal(after.consumed_at, null, "…and expiry writes NOTHING — it is derived, not swept");
  assert.equal(after.invalidated_at, null, "…no invalidation row-write either");
});

// ===========================================================================
// §3.5 — invalidation on withdrawal, in the SAME transaction.
// ===========================================================================

test("[0020 §3.5 / §9.3(a)]: a typed REVOKE invalidates EVERY unconsumed authorization for that consent in the same transaction — an outstanding id can no longer dispatch", async () => {
  fail0020(live);
  const client = await freshClient("auth_inval");
  const { consent } = await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const ev = await latestEventOf(w.firms.A);
  const a = await prepareDispatch({ firm: w.firms.A, client, eventSeq: ev.seq, eventType: ev.eventType });
  const b = await prepareDispatch({ firm: w.firms.A, client, eventSeq: ev.seq, eventType: ev.eventType });
  // Consume ONE of them first — §3.5 invalidates only the neither-consumed-nor-
  // already-invalidated rows, and the one-terminal CHECK forbids doing both.
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: a.authorization_id }), CONSUME_GRANTED);

  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal", opKey: opk("inv_rv") });

  const rowA = await authorizationRow(a.authorization_id);
  const rowB = await authorizationRow(b.authorization_id);
  assert.ok(rowA.consumed_at, "the already-consumed authorization stays consumed");
  assert.equal(rowA.invalidated_at, null, "…and is NOT also invalidated (at most one terminal)");
  assert.ok(rowB.invalidated_at, "the UNCONSUMED authorization is invalidated by the revoke");
  assert.ok(rowB.invalidated_reason && String(rowB.invalidated_reason).trim() !== "",
    "…with a non-blank invalidated_reason");
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: b.authorization_id }), CONSUME_UNKNOWN,
    "the invalidated authorization can no longer dispatch");
  assert.equal((await authorizationsForConsent(consent.id)).length, 2, "both rows belong to the revoked consent");
});

test("[0020 §3.5 / §9.3(c)]: a DEACTIVATE (a pause, consent left live) also invalidates unconsumed authorizations", async () => {
  fail0020(live);
  const client = await freshClient("auth_deact");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  await deactivatePurpose(w.users.alice, { client, reason: "rig pause", opKey: opk("inv_d") });
  assert.ok((await authorizationRow(v.authorization_id)).invalidated_at,
    "the outstanding authorization is invalidated by the deactivation");
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "…and refuses at consume");
  assert.ok(await livePurposeConsent(client), "…while the typed CONSENT record survives the pause");
});

test("[0020 §3.5 / §9.3(b) — THE regrant cell]: revoke + re-grant + ACTIVATE the new consent does NOT resurrect the old authorization; a fresh grant is never a silent re-authorization", async () => {
  fail0020(live);
  const client = await freshClient("auth_regrant");
  const { consent: c1 } = await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const stale = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.equal(stale.verdict, "granted", "an authorization is outstanding against consent #1");

  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal", opKey: opk("rg_rv") });
  const { consent: c2 } = await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  assert.notEqual(c2.id, c1.id, "consent #2 is a new id");
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted",
    "the client is lit again on consent #2 — so this is NOT a fail-closed artefact");

  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: stale.authorization_id }), CONSUME_UNKNOWN,
    "the STRANDED authorization (which names consent #1) still refuses, even though the client is lit again");
  assert.ok((await authorizationRow(stale.authorization_id)).invalidated_at,
    "…because §3.5 invalidated it inside the revoke's own transaction");
});

test("[0020 §3.4]: consume RE-CHECKS live consent AND live activation atomically — an authorization that survives a pause/resume cycle still refuses because the activation row changed", async () => {
  fail0020(live);
  const client = await freshClient("auth_recheck");
  const { consent } = await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  await deactivatePurpose(w.users.alice, { client, reason: "rig pause", opKey: opk("rc_d") });
  await activatePurpose(w.users.alice, { client, consent: consent.id, opKey: opk("rc_a") });
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted",
    "the client is lit again on the SAME consent through a NEW activation");
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "the pre-pause authorization names the DEACTIVATED activation and must still refuse (§3.4 step 2: the named activation must still be live)");
});

// ===========================================================================
// §3.3 — dispatch-intent recording, and the ACL closed set.
// ===========================================================================

test("[0020 §3.2 / A20-3]: prepare records the dispatch intent it was given; whether it VALIDATES (event_seq,event_type) against domain_events is contract-silent — the observed behaviour is RECORDED", async () => {
  fail0020(live);
  const client = await freshClient("auth_intent");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  let synthetic = null;
  let raised = null;
  try {
    synthetic = await prepareDispatch({
      firm: w.firms.A, client, eventSeq: 9_000_000_001, eventType: "counterparty.created" });
  } catch (e) { raised = e.code ?? e.message; }
  if (raised) {
    noteLane(`[A20-3] prepare_egress_dispatch REFUSED a synthetic (seq,type) pair with ${raised} — it validates the dispatch intent against clara.domain_events. §3.2/§8 pin no such FK; the contract is silent.`);
  } else if (synthetic?.verdict === "granted") {
    const row = await authorizationRow(synthetic.authorization_id);
    assert.equal(Number(row.event_seq), 9_000_000_001, "the synthetic seq was recorded verbatim");
    noteLane("[A20-3] prepare_egress_dispatch ACCEPTS an arbitrary (seq,type) pair — the dispatch intent is recorded, not validated. Consistent with §3.2's wording; recorded because the contract never says either way.");
  } else {
    noteLane(`[A20-3] prepare_egress_dispatch returned ${JSON.stringify(synthetic)} for a synthetic (seq,type) pair — neither a refusal nor a grant; RECORDED`);
  }
});

test("[0020 §3.3/§3.4 / §9.5]: prepare and consume are EXECUTE-granted to clara_runtime ONLY — clara_authenticated, clara_agent_ro and both wake roles are refused 42501", async () => {
  fail0020(live);
  const client = await freshClient("auth_acl");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const ev = await latestEventOf(w.firms.A);
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    await assertRaisesOneOf(["42501"],
      () => prepareDispatch({ firm: w.firms.A, client, eventSeq: ev.seq, eventType: ev.eventType, role }),
      `prepare_egress_dispatch as ${role}`);
    await assertRaisesOneOf(["42501"],
      () => consumeDispatch({ firm: w.firms.A, authorization: "00000000-0000-4000-8000-0000000000ee", role }),
      `consume_egress_dispatch as ${role}`);
  }
  assert.equal(await countRows(DISPATCH_AUTH_TABLE, "where client_id=$1", [client]), 0,
    "no refused ACL probe minted an authorization row");
});

test("[0020 §6 / §9.2]: the legacy consent writers are UNAFFECTED by every typed operation in this file — the legacy one-live invariant still holds for a client carrying BOTH", async () => {
  fail0020(live);
  const client = await freshClient("auth_both");
  const legacyDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client });
  await grantClientEgress(w.users.alice, { client, evidenceDocument: legacyDoc.documentId, scopeNote: "legacy" });
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client });
  const liveLegacy = await rootQuery(
    "select count(*)::int n from clara.client_egress_consents where client_id=$1 and revoked_at is null", [client]);
  assert.equal(liveLegacy.rows[0].n, 1, "exactly ONE live legacy row (the 0011 partial unique is untouched)");
  await revokePurpose(w.users.alice, { client, reason: "typed only", opKey: opk("bo_rv") });
  const stillLive = await rootQuery(
    "select count(*)::int n from clara.client_egress_consents where client_id=$1 and revoked_at is null", [client]);
  assert.equal(stillLive.rows[0].n, 1, "a TYPED revoke left the legacy row live — separate relations, separate lifecycles");
  await revokeClientEgress(w.users.alice, { client, reason: "legacy only" });
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.client_egress_consents where client_id=$1 and revoked_at is null", [client])
  ).rows[0].n, 0, "the legacy revoke found and revoked the legacy row deterministically (no typed row can shadow it)");
});
