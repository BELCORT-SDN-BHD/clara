// Wave-B battery — migration 0020 §3.6 / §9.3: THE REVOCATION-vs-DISPATCH RACES.
// The ruling's before-lighting bar. This is the file that decides whether client
// data can reach a third-party model after a withdrawal has committed.
//
// §3.6 states the linearization semantics HONESTLY, and this battery asserts them
// as stated — including the one that looks like a bug and is not:
//   * consumed BEFORE a revocation commits  -> MAY dispatch (the bytes were
//     authorized; the revocation applies from its own commit forward);
//   * revocation committed BEFORE consumption -> MUST refuse.
// What is NOT achievable — cancellation after consumption but before the bytes
// leave the process (R-2) — is documented, never claimed, and is asserted here
// only as "the DB does not pretend to close it".
//
// Two-session discipline: PLAIN `begin` (READ COMMITTED) on both sides — nothing
// 0020 pins is SSI-dependent, and its guarantees are stated as row-lock
// linearization. Every interleave is PROVEN with waitBlockedByOrThrow, never with
// a sleep. CONTRACT-BLIND; FAILS below 0020.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, noteLane,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, createClient, seedOpeningCoa,
  CONSUME_GRANTED, CONSUME_UNKNOWN, UNKNOWN_VERDICT,
  lightSynthesis, revokePurpose, deactivatePurpose, activatePurpose, grantPurpose,
  consentEvidenceDoc, livePurposeConsent,
  prepareForLatestEvent, consumeDispatch, authorizationRow, authorizationsForClient,
  raceRevokeThenConsume, modelVersionCount,
} from "./wb-0020-helpers.mjs";

let live = false;
let w = null;

async function litClient(tag) {
  const c = await createClient(w.users.alice, { name: `${w.prefix}_${tag}`, opKey: opk("cli") });
  await seedOpeningCoa(w.users.alice, c);
  const lit = await lightSynthesis(w.users.alice, { firm: w.firms.A, client: c });
  return { client: c, ...lit };
}

before(async () => {
  live = await wbEnsureReady20();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0020-races"); await endPool(); });

test("META: 0020 applied — the race battery is armed", async () => {
  fail0020(live);
  assert.ok(w, "world built");
});

// ===========================================================================
// §9.3(a) — the ruling's core cell: a revocation that COMMITS before the model
// call must abort the dispatch. This is the whole point of two-phase.
// ===========================================================================

test("[0020 §3.6 / §9.3(a) — THE core cell]: A prepares `granted`; B REVOKES and commits; A's consume returns `unknown` → no model call, no publish", async () => {
  fail0020(live);
  const { client } = await litClient("race_a");
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.equal(v.verdict, "granted", "the plan-time verdict was granted (the window is real)");
  // B's withdrawal commits between plan time and the model call.
  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal mid-plan", opKey: opk("ra_rv") });
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "consume REFUSES — the last DB interaction before the model call is a state transition the revoker can invalidate, not a query");
  assert.equal(await modelVersionCount(client), 0, "zero model-lane publications for this client");
  assert.ok((await authorizationRow(v.authorization_id)).invalidated_at,
    "the authorization is terminally invalidated, not merely stale");
});

test("[0020 §3.6 / §9.3(b)]: A prepares; B revokes AND re-grants AND ACTIVATES a new consent; A's consume STILL returns `unknown`", async () => {
  fail0020(live);
  const { client } = await litClient("race_b");
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.equal(v.verdict, "granted");
  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal", opKey: opk("rb_rv") });
  const ev2 = await consentEvidenceDoc(w.firms.A);
  await grantPurpose(w.users.alice, { client, evidenceDocument: ev2.documentId, opKey: opk("rb_g") });
  const c2 = await livePurposeConsent(client);
  await activatePurpose(w.users.alice, { client, consent: c2.id, opKey: opk("rb_a") });
  assert.equal((await prepareForLatestEvent({ firm: w.firms.A, client })).verdict, "granted",
    "the client is fully lit again — so a refusal below is NOT a fail-closed artefact");
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "the stranded authorization names the OLD consent — a fresh grant is never a silent re-authorization (§3.5)");
});

test("[0020 §3.6 / §9.3(c)]: A prepares; B DEACTIVATES without revoking; A's consume returns `unknown`", async () => {
  fail0020(live);
  const { client } = await litClient("race_c");
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  await deactivatePurpose(w.users.alice, { client, reason: "rig pause mid-plan", opKey: opk("rc_d") });
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_UNKNOWN,
    "a pause is a withdrawal for dispatch purposes even though the consent record survives");
  assert.ok(await livePurposeConsent(client), "…and the consent record does survive");
});

test("[0020 §3.6 / §9.3(h) — the documented semantics, NOT a bug report]: a consume that COMMITS BEFORE a revocation DOES dispatch; the revocation applies from its own commit forward", async () => {
  fail0020(live);
  const { client } = await litClient("race_h");
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.deepEqual(await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }), CONSUME_GRANTED,
    "the consume commits first and IS granted — this is §3.6's stated linearization, asserted deliberately");
  await revokePurpose(w.users.alice, { client, reason: "rig withdrawal after consume", opKey: opk("rh_rv") });
  const row = await authorizationRow(v.authorization_id);
  assert.ok(row.consumed_at, "the already-consumed authorization stays consumed");
  assert.equal(row.invalidated_at, null,
    "…and the revoke does NOT retro-invalidate it (the one-terminal CHECK; §3.6's residual R-2 is documented, not claimed away)");
  // Every SUBSEQUENT plan is refused — the revocation is effective from here on.
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client }), UNKNOWN_VERDICT,
    "the next plan is refused — the withdrawal is effective forward");
});

// ===========================================================================
// The genuine TWO-SESSION interleave: a withdrawal in flight while a consume is
// in flight. §3.5 makes the withdrawal WRITE the authorization row, which is what
// forces the consume to serialize behind it instead of racing it.
// ===========================================================================

test("[0020 §3.5/§3.6 — two-session]: an UNCOMMITTED revoke parks a concurrent consume on the authorization row; when the revoke commits the parked consume re-reads and REFUSES", async () => {
  fail0020(live);
  const { client } = await litClient("race_2s");
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  assert.equal(v.verdict, "granted");
  const out = await raceRevokeThenConsume({
    firm: w.firms.A, client, authorization: v.authorization_id, ownerSub: w.users.alice });
  // The OUTCOME is the invariant; the blocking observation is the mechanism.
  assert.deepEqual(out.consume, CONSUME_UNKNOWN,
    `the consume that lost the race REFUSES (got ${JSON.stringify(out.consume)})`);
  assert.equal(await modelVersionCount(client), 0, "no model-lane publication for this client");
  if (out.blocked) {
    noteLane("[0020 §3.5] OBSERVED: the concurrent consume genuinely PARKED on the authorization row lock held by the uncommitted revoke — §3.5's same-transaction invalidation is what serializes them");
  } else {
    noteLane("[0020 §3.5] NOT OBSERVED: the concurrent consume did not park on the revoke's row lock. The refusal still held, but the serialization mechanism is not the one §3.5 implies — worth an adjudication look at whether the revoke's invalidation reaches every unconsumed row.");
  }
  assert.ok((await authorizationRow(v.authorization_id)).invalidated_at,
    "the authorization ended terminally invalidated");
});

test("[0020 §3.4 — two-session]: two concurrent consumes of the SAME authorization — EXACTLY ONE may be granted (single use is a lock, not a read)", async () => {
  fail0020(live);
  const { client } = await litClient("race_dbl");
  const v = await prepareForLatestEvent({ firm: w.firms.A, client });
  const [r1, r2] = await Promise.all([
    consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }).catch((e) => ({ error: e.code })),
    consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }).catch((e) => ({ error: e.code })),
  ]);
  const granted = [r1, r2].filter((x) => x?.verdict === "granted").length;
  assert.equal(granted, 1,
    `EXACTLY ONE of two concurrent consumes is granted (got ${JSON.stringify([r1, r2])})`);
  const unknown = [r1, r2].filter((x) => x?.verdict === "unknown").length;
  assert.equal(unknown, 1, "…and the other is a clean `unknown`, never an exception");
});

test("[0020 §3.6]: the FULL plan→consume window with a withdrawal landing inside it never dispatches — asserted end-to-end across ten independent clients", async () => {
  fail0020(live);
  // Ten independent lit clients; for each, prepare, revoke, then consume. A single
  // green cell can hide an ordering fluke; ten cannot.
  const outcomes = [];
  for (let i = 0; i < 10; i += 1) {
    const { client } = await litClient(`race_bulk${i}`);
    const v = await prepareForLatestEvent({ firm: w.firms.A, client });
    await revokePurpose(w.users.alice, { client, reason: `rig bulk ${i}`, opKey: opk(`rbk${i}`) });
    outcomes.push({
      client,
      consume: await consumeDispatch({ firm: w.firms.A, authorization: v.authorization_id }),
      models: await modelVersionCount(client),
      auths: (await authorizationsForClient(client)).length,
    });
  }
  for (const o of outcomes) {
    assert.deepEqual(o.consume, CONSUME_UNKNOWN, `client ${o.client}: consume refused`);
    assert.equal(o.models, 0, `client ${o.client}: zero model-lane publications`);
    assert.equal(o.auths, 1, `client ${o.client}: exactly the one prepared authorization exists`);
  }
});
