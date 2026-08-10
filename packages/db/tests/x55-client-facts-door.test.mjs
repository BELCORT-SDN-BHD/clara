// 0055 (Wave E lane alpha, E-R12 trio) rig -- PART 2: the client_facts DOOR
// battery (matrix cells F3a-shape, F3d, F3f, F4, and the door refusal battery).
// Split out of x55-client-facts-trio.test.mjs (which carries F1a/F1b/F1c/F1e/
// F1f/the role battery/F2a) to keep both files under the repo's 500-line gate --
// same suite, same readiness gate, same fixtures (x55-fixtures.mjs).
//
// CONTRACT-BLIND on 0055 itself, the x52 idiom: every claim here is proved by
// CALLING clara.record_client_fact / clara.commit_client_onboarding and reading
// the resulting rows/receipts, never by reading 0055_client_facts_trio.sql.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, PG,
  endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, firmOf, filedDocument,
  reasonOf, opk, assertRaises,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0055, setupCoa, caught, recordClientFact, freshActiveClient,
} from "./x55-fixtures.mjs";

let ready = false;
let has55 = false;
let world = null;

function skip55(t) {
  if (!ready || !has55) {
    markSkip();
    t.skip("0055 (client-facts trio) not present");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x55-door suite skipped"); return; }
  has55 = await has0055();
  if (!has55) { noteLane("0055 not applied -- client-facts trio absent"); return; }
  world = await wb.buildWaveBWorld();
  await setupCoa(world.users.alice, world.clients.A1); // A1 carries a committed plan (F3d)
});
after(async () => { printLaneNotes("x55-client-facts-door"); printSkipCount("x55-client-facts-door"); await endPool(); });

// ===========================================================================
// 8. F3a-shape -- the door + replay: who/basis/when captured; the act appears
// in audit_log and domain_events; a replay under the same op_key returns the
// stored result and writes NOTHING new (counted before/after).
// ===========================================================================

test("F3a-shape door + replay -- record_client_fact writes who/basis/when, appears in audit_log and domain_events; a replay under the SAME op_key is a total no-op", async (t) => {
  if (skip55(t)) return;
  const sub = world.users.hana;
  const client = await freshActiveClient(world.users.alice, "f3a");
  const firm = await firmOf(client);
  const opKey = opk("x55-f3a");
  const basisText = "owner instructed 68109 by phone, 2026-08-11";

  const countAll = async () => ({
    facts: (await rootQuery("select count(*)::int as n from clara.client_facts where client_id=$1 and fact_key='msic'", [client])).rows[0].n,
    audit: (await rootQuery("select count(*)::int as n from clara.audit_log where firm_id=$1 and fn='record_client_fact'", [firm])).rows[0].n,
    events: (await rootQuery("select count(*)::int as n from clara.domain_events where client_id=$1 and event_type='client.fact_recorded'", [client])).rows[0].n,
  });
  const before = await countAll();

  const r1 = await recordClientFact(sub, { client, factKey: "msic", factValue: "68109", basis: basisText, basisKind: "owner_instruction", opKey });
  assert.ok(r1?.fact_id, "the door returns a fact_id");

  const row = (await rootQuery("select * from clara.client_facts where id=$1", [r1.fact_id])).rows[0];
  assert.ok(row, "the fact row exists");
  assert.equal(row.recorded_by, sub, "WHO is recorded");
  assert.equal(row.basis, basisText, "BASIS is recorded verbatim");
  assert.ok(row.recorded_at, "WHEN is recorded");

  const auditRow = (await rootQuery(
    "select 1 from clara.audit_log where firm_id=$1 and fn='record_client_fact' and (args->>'fact_id')=$2",
    [firm, r1.fact_id],
  )).rows[0];
  assert.ok(auditRow, "the act appears in clara.audit_log");
  const eventRow = (await rootQuery(
    "select 1 from clara.domain_events where client_id=$1 and event_type='client.fact_recorded' and (payload->>'fact_id')=$2",
    [client, r1.fact_id],
  )).rows[0];
  assert.ok(eventRow, "the act appears in clara.domain_events");

  // REPLAY: same op_key, same args -> the STORED receipt, no new rows anywhere.
  const r2 = await recordClientFact(sub, { client, factKey: "msic", factValue: "68109", basis: basisText, basisKind: "owner_instruction", opKey });
  assert.deepEqual(r2, r1, "the replay returns the STORED result byte-identically");

  const after = await countAll();
  assert.equal(after.facts, before.facts + 1, "exactly ONE fact row from the first call; the replay minted none");
  assert.equal(after.audit, before.audit + 1, "exactly ONE audit_log row; the replay wrote none");
  assert.equal(after.events, before.events + 1, "exactly ONE domain_events row; the replay wrote none");
});

// ===========================================================================
// 9. F3d -- commit_client_onboarding STILL refuses re-opening an ACTIVE
// client: the door is a NEW door, not a reopening of the interview commit.
// ===========================================================================

test("F3d commit_client_onboarding still refuses an ACTIVE client -- the door is a new door, not a reopening", async (t) => {
  if (skip55(t)) return;
  const admin = world.users.hana;
  const client = world.clients.A1; // already active
  const planId = (await rootQuery(
    "select id from clara.onboarding_plans where client_id=$1 order by created_at desc limit 1", [client],
  )).rows[0]?.id;
  assert.ok(planId, "mandatory setup: the client's own (committed) plan exists");

  const err = await caught(() => humanQuery(
    admin,
    "select clara.commit_client_onboarding(p_client => $1, p_plan => $2, p_expected_plan_revision => $3, p_op_key => $4) as r",
    [client, planId, randomUUID(), opk("x55-f3d")],
  ));
  assert.ok(err, "committing onboarding on an already-active client must be refused");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} -- ${err.message})`);
  assert.match(err.message ?? "", /onboarding is not open/i);
});

// ===========================================================================
// 10. F3f -- the SAME op_key with DIFFERENT arguments is REFUSED, not
// silently answered from the stored receipt (asserted as behaviour).
// ===========================================================================

test("F3f the SAME op_key with DIFFERENT args is REFUSED -- never silently answered from the stored receipt", async (t) => {
  if (skip55(t)) return;
  const sub = world.users.hana;
  const client = await freshActiveClient(world.users.alice, "f3f");
  const opKey = opk("x55-f3f");

  await recordClientFact(sub, { client, factKey: "msic", factValue: "68109", basis: "first call basis", basisKind: "owner_instruction", opKey });
  const err = await caught(() => recordClientFact(sub, { client, factKey: "msic", factValue: "74101", basis: "a DIFFERENT basis text", basisKind: "owner_instruction", opKey }));
  assert.ok(err, "a replay with different args under the same op_key must be refused");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} -- ${err.message})`);
  assert.match(err.message ?? "", /different args/i);

  const n = (await rootQuery("select count(*)::int as n from clara.client_facts where client_id=$1 and fact_key='msic'", [client])).rows[0].n;
  assert.equal(n, 1, "the mismatched replay minted no second fact");
});

// ===========================================================================
// 11. F4 -- supersession, never mutation: a corrected value SUPERSEDES the
// prior fact; the prior row stays readable with its ORIGINAL who/basis/when;
// a superseded_at-is-null read returns exactly one row; a direct UPDATE
// refuses at the PRIVILEGE level (non-owner) and at the TRIGGER level (owner).
// ===========================================================================

test("F4 supersession -- a corrected value SUPERSEDES the prior fact; the prior row is immutable; the live read returns exactly one row; direct UPDATE is refused both by privilege and by the trigger", async (t) => {
  if (skip55(t)) return;
  const admin = world.users.hana;
  const client = await freshActiveClient(world.users.alice, "f4");

  const r1 = await recordClientFact(admin, { client, factKey: "entity_type", factValue: "sdn_bhd", basis: "initial owner instruction", basisKind: "owner_instruction" });
  const priorId = r1.fact_id;
  const r2 = await recordClientFact(admin, { client, factKey: "entity_type", factValue: "sole_prop", basis: "corrected: it is actually a sole proprietorship", basisKind: "owner_instruction" });
  assert.notEqual(r2.fact_id, priorId, "a NEW row, not an in-place overwrite");
  assert.equal(r2.superseded_id, priorId, "the door names what it superseded");

  const prior = (await rootQuery("select * from clara.client_facts where id=$1", [priorId])).rows[0];
  assert.equal(prior.fact_value, "sdn_bhd", "the prior row keeps its ORIGINAL value");
  assert.equal(prior.basis, "initial owner instruction", "and its ORIGINAL basis");
  assert.equal(prior.superseded_by, r2.fact_id, "superseded_by names the successor");
  assert.ok(prior.superseded_at, "superseded_at is stamped");

  const live = (await rootQuery(
    "select * from clara.client_facts where client_id=$1 and fact_key='entity_type' and superseded_at is null", [client],
  )).rows;
  assert.equal(live.length, 1, "the live read (superseded_at is null) returns EXACTLY one row");
  assert.equal(live[0].id, r2.fact_id);
  assert.equal(live[0].fact_value, "sole_prop");

  // (a) a non-owner role UPDATE attempt: clara_authenticated holds SELECT only.
  await assertRaises(PG.insufficientPrivilege, () => humanQuery(
    admin, "update clara.client_facts set fact_value=$1::jsonb where id=$2", [JSON.stringify("bhd"), r2.fact_id],
  ), "a human UPDATE on client_facts");

  // (b) even as table owner/superuser, the TRIGGER refuses a value-changing update.
  await assertRaises("CLR10", () => rootQuery(
    "update clara.client_facts set fact_value=$1::jsonb where id=$2", [JSON.stringify("bhd"), r2.fact_id],
  ), "a superuser direct value UPDATE on client_facts");
});

// ===========================================================================
// 12. Door refusal battery -- basis/kind/key/value/document shape, and a
// cross-firm client, each refused with its named reason.
// ===========================================================================

test("Door refusal battery -- basis/kind/key/value/document shape and a cross-firm client, each refused with its named reason", async (t) => {
  if (skip55(t)) return;
  const admin = world.users.hana;
  const client = await freshActiveClient(world.users.alice, "refusals");

  const cases = [
    { label: "empty basis", args: { factKey: "msic", factValue: "68109", basis: "", basisKind: "owner_instruction" }, reason: "fact_basis_missing" },
    { label: "bad basis_kind", args: { factKey: "msic", factValue: "68109", basis: "x", basisKind: "hearsay" }, reason: "fact_basis_kind_invalid" },
    { label: "unknown key", args: { factKey: "not_a_real_key", factValue: "x", basis: "x", basisKind: "owner_instruction" }, reason: "fact_key_unknown" },
    { label: "entity_type value outside enum", args: { factKey: "entity_type", factValue: "monarchy", basis: "x", basisKind: "owner_instruction" }, reason: "fact_value_invalid" },
    { label: "msic '1234' (four digits)", args: { factKey: "msic", factValue: "1234", basis: "x", basisKind: "owner_instruction" }, reason: "fact_value_invalid" },
    { label: "msic 'abcde' (letters)", args: { factKey: "msic", factValue: "abcde", basis: "x", basisKind: "owner_instruction" }, reason: "fact_value_invalid" },
    { label: "document basis WITHOUT a document id", args: { factKey: "msic", factValue: "68109", basis: "x", basisKind: "document" }, reason: "fact_source_document_missing" },
  ];
  for (const c of cases) {
    const err = await caught(() => recordClientFact(admin, { client, ...c.args }));
    assert.ok(err, `${c.label}: must be refused`);
    assert.equal(err.code, "CLR10", `${c.label}: expected CLR10 (got ${err.code} -- ${err.message})`);
    assert.equal(reasonOf(err), c.reason, `${c.label}: expected reason '${c.reason}' (got ${reasonOf(err)} -- ${err.message})`);
  }

  // Non-document basis WITH a document id.
  const doc = await filedDocument(admin, { firm: await firmOf(client), client });
  const errDoc = await caught(() => recordClientFact(admin, {
    client, factKey: "msic", factValue: "68109", basis: "x", basisKind: "owner_instruction", sourceDocument: doc.documentId,
  }));
  assert.ok(errDoc, "a non-document basis carrying a document id must be refused");
  assert.equal(errDoc.code, "CLR10", `expected CLR10 (got ${errDoc.code} -- ${errDoc.message})`);
  assert.equal(reasonOf(errDoc), "fact_source_document_unexpected");

  // A client from ANOTHER firm.
  const other = world.clients.B1;
  const errFirm = await caught(() => recordClientFact(admin, { client: other, factKey: "msic", factValue: "68109", basis: "x", basisKind: "owner_instruction" }));
  assert.ok(errFirm, "a client from another firm must be refused");
  assert.equal(errFirm.code, "CLR11", `expected CLR11 (got ${errFirm.code} -- ${errFirm.message})`);
});
