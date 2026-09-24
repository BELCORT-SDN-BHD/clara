// #1000 [0320_client_financial_pack_wake_read.sql] — THE MODEL LANE'S ENTRANCE TO THE CLIENT
// HOME'S MONEY BAND, and the split that makes one entrance possible without a second definition.
//
// WHAT THIS FILE IS ABOUT. `clara.get_client_financial_pack` (0232, #660) is the ONE read behind
// the client home's money band. It was SECURITY INVOKER, floored inline on the JWT, and granted
// to `clara_authenticated` alone — so the chat lane, which runs on pooled credentials carrying no
// JWT claims at all, could not reach it. #1000 opens it the house way: the computation moves into
// ONE ungranted core (`clara._client_financial_pack_core`), the human door becomes its own thin
// audited wrapper, and a SECOND audited wrapper — `clara.wake_get_client_financial_pack`, granted
// to `clara_agent_ro`, allowlisted for exactly one wake kind — is the model lane's door.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. The whole of #660's own behaviour: that is
// `client-financial-pack.test.mjs`, which runs unchanged against the human door and is this
// change's real regression proof. This file proves the NEW lane and the ONE property the split
// must never lose — that both lanes answer from the same body.
//
// FRONTIER-GATED on the `client_financial_pack_wake_read$` stable stem, the
// `prepayment-stated-term.test.mjs:64-84` idiom: a package-wide sweep preloads this file's
// pre-integration gate module and skips LOUDLY on a chain below 0320; a FOCUSED run sets nothing
// and fails, because a skip is not evidence.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorld, endPool, assertRaises, mintWake, revokeWake, wakeQuery, asWake, namedCall,
} from "./rig-fixtures.mjs";
import {
  CHART, financialClient, pack, publish, members, reasonOf,
  ROLES, rootQuery, roleQuery, postEntry,
} from "./client-financial-pack-fixtures.mjs";

const STEM = "client_financial_pack_wake_read$";
const WAKE_DOOR = "wake_get_client_financial_pack";

let world = null;
let lane = null;

async function lanePresent() {
  if (lane !== null) return lane;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  lane = Number(r.rows[0].n) > 0;
  return lane;
}

async function gate(t) {
  if (await lanePresent()) return false;
  if (process.env.CLARA_ALLOW_MISSING_CLIENT_FINANCIAL_PACK_WAKE_READ !== "1") {
    throw new Error(
      `#1000: no migration matching /${STEM}/ is applied to this database and `
      + "CLARA_ALLOW_MISSING_CLIENT_FINANCIAL_PACK_WAKE_READ is unset — this is a FOCUSED run and "
      + "must fail loudly rather than skip. Apply 0320_client_financial_pack_wake_read.sql, or "
      + "preload ./tests/client-financial-pack-wake-read-preintegration-gate.mjs for an estate "
      + "sweep against a pre-0320 chain.");
  }
  t.skip(`#1000 wake read lane absent (no ${STEM} migration applied)`);
  return true;
}

before(async () => {
  world = await buildWorld();
});
after(async () => {
  await endPool();
});

const ALICE = () => world.users.alice; // owner, firm A — the publisher and the maker
const BOB = () => world.users.bob;     // bookkeeper, firm A — the checker, and the OBO human the
                                       // chat lane acts for (bookkeeper+ is the wake floor)
const CAROL = () => world.users.carol; // viewer, firm A — the human floor the read itself carries
const FIRM_A = () => world.firms.A;

const rm = (n) => n * 100;
const sale = (amount) => [{ code: CHART.bank, debit: amount }, { code: CHART.sales, credit: amount }];

/** The model lane's read: an `interactive` wake credential minted ON BEHALF OF a live
 *  bookkeeper+, bound txn-locally, on the READ role the chat lane's `readScoped` runs as. */
async function wakePack(secret, client, { asOf = null, month = null } = {}) {
  const r = await wakeQuery(ROLES.agentRo, secret, namedCall(WAKE_DOOR, [
    { name: "p_client", cast: "uuid" },
    { name: "p_as_of", cast: "date" },
    { name: "p_month", cast: "date" },
  ]), [client, asOf, month]);
  return r.rows[0].result;
}

async function chatCredential(onBehalfOf = BOB()) {
  return mintWake({ kind: "interactive", firm: FIRM_A(), onBehalfOf });
}

// ===========================================================================================
// AC1 — THE SAME ENVELOPE, FROM THE SAME BODY.
// ===========================================================================================

test("p1000.wake.same_envelope — the model lane's door answers, for one client and one month, the envelope the client home's own read answers for the same inputs", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "wake-same");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(1000)) });
  await publish(ALICE(), client, members(accounts, [CHART.bank, "bank_registry"]));

  const human = await pack(CAROL(), client, { month: "2026-03-01" });
  const { secret } = await chatCredential();
  const machine = await wakePack(secret, client, { month: "2026-03-01" });

  // `computed_at` and `source_watermark` are SAMPLED per call — two reads of one ledger a
  // millisecond apart legitimately differ there and nowhere else. Everything that is a statement
  // ABOUT THE MONEY must be identical, or the two surfaces can disagree in front of a person.
  assert.equal(machine.client_id, human.client_id);
  assert.deepEqual(machine.period, human.period);
  assert.equal(machine.coverage_floor, human.coverage_floor);
  for (const group of ["cash", "profit", "income", "expense"]) {
    const a = { ...human[group] }; const b = { ...machine[group] };
    delete a.computed_at; delete a.source_watermark;
    delete b.computed_at; delete b.source_watermark;
    assert.deepEqual(b, a, `${group}: the model lane's figures differ from the client home's`);
  }
  assert.deepEqual(machine.series, human.series);
  assert.deepEqual(machine.excluded_by_design, human.excluded_by_design);
  assert.equal(BigInt(machine.cash.value_cents), BigInt(rm(1000)));
});

// ===========================================================================================
// THE CEREMONY — what the model lane's door asks for before it reads anything.
// ===========================================================================================

test("p1000.wake.no_credential — a session with no wake secret is refused CLR03, and the refusal says nothing about the client it was asked for", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "wake-nocred");
  // The READ role, no secret bound: this is what a pooled checkout looks like before
  // `withReadWakeScoped` binds anything.
  await assertRaises("CLR03", () => roleQuery(ROLES.agentRo, namedCall(WAKE_DOOR, [
    { name: "p_client", cast: "uuid" }, { name: "p_as_of", cast: "date" },
    { name: "p_month", cast: "date" },
  ]), [client, null, null]), "the model lane's door without a credential");
  // …and the SAME refusal for a client that does not exist at all, so a credential-less caller
  // cannot use the door as an existence probe.
  await assertRaises("CLR03", () => roleQuery(ROLES.agentRo, namedCall(WAKE_DOOR, [
    { name: "p_client", cast: "uuid" }, { name: "p_as_of", cast: "date" },
    { name: "p_month", cast: "date" },
  ]), ["00000000-0000-4000-8000-0000000001aa", null, null]));
});

test("p1000.wake.kind_not_allowlisted — a wake kind with no allowlist row for this door is refused CLR03 even holding the EXECUTE, and the allowlist holds exactly one row", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "wake-kind");
  // `proactive` is a live kind with a credential of its own and NO row for this door. The EXECUTE
  // is on the ROLE, so this is the kind gate doing the refusing, not the ACL.
  const { secret } = await mintWake({ kind: "proactive", firm: FIRM_A() });
  await assertRaises("CLR03", () => wakePack(secret, client), "a proactive credential");

  const rows = await rootQuery(
    "select wake_kind from clara.wake_fn_allowlist where function_name = $1 order by 1",
    [WAKE_DOOR]);
  assert.deepEqual(rows.rows.map((r) => r.wake_kind), ["interactive"],
    "the model lane's door must be reachable from exactly one wake kind");
});

test("p1000.wake.needs_a_named_person — an interactive credential that names no on_behalf_of is refused CLR03 wake_authority_absent: this read rides a person's authority or it does not happen", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "wake-noobo");
  const { secret } = await mintWake({ kind: "interactive", firm: FIRM_A(), onBehalfOf: null });
  let err = null;
  try { await wakePack(secret, client); } catch (e) { err = e; }
  assert.ok(err, "an unattended credential read a client's money band");
  assert.equal(err.code, "CLR03");
  assert.equal(reasonOf(err), "wake_authority_absent");
});

test("p1000.wake.floor_is_the_credential — the model lane's floor is the wake credential's own BOOKKEEPER+, strictly above the VIEWER floor the read itself carries, and a revoked credential goes inert", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "wake-floor");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(200)) });
  await publish(ALICE(), client, members(accounts, [CHART.bank, "bank_registry"]));

  // (a) THE READ'S OWN FLOOR IS VIEWER, and it is driven rather than recited: CAROL is a viewer of
  //     firm A and the client home's read answers her.
  const asViewer = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(asViewer.cash.status, "ok", "the read's own floor is not VIEWER any more");

  // (b) THE MODEL LANE CANNOT ACT FOR HER. The credential cannot even be minted: #630's typed
  //     authority_lost, raised by clara.mint_wake_credential before this door is involved. So the
  //     machine lane is NARROWER than the door it reaches, which is what "carries the human door's
  //     role floor rather than widening it" has to mean here.
  await assertRaises("CLR10",
    () => mintWake({ kind: "interactive", firm: FIRM_A(), onBehalfOf: CAROL() }),
    "an OBO credential for a viewer");

  // (c) AND A CREDENTIAL THAT WAS VALID GOES INERT the moment it is revoked — the same mechanism
  //     that makes a demotion mid-conversation stop the read.
  const live = await chatCredential();
  assert.equal((await wakePack(live.secret, client, { month: "2026-03-01" })).cash.status, "ok");
  await revokeWake(live.credentialId);
  await assertRaises("CLR03", () => wakePack(live.secret, client), "a revoked credential");
});

// ===========================================================================================
// AC4 — NO ORACLE. A client outside the caller's scope and an invented id answer identically.
// ===========================================================================================

test("p1000.wake.no_oracle — through firm A's credential, firm B's real client and a uuid that names nothing answer IDENTICALLY, as DATA rather than as a refusal, and neither leaks a figure", async (t) => {
  if (await gate(t)) return;
  const theirs = world.clients.B1;              // a real client of firm B, built by buildWorld
  const invented = "00000000-0000-4000-8000-0000000002bb";
  const { secret } = await chatCredential();

  const a = await wakePack(secret, theirs, { month: "2026-03-01" });
  const b = await wakePack(secret, invented, { month: "2026-03-01" });

  // THE ANSWER IS THE READ'S OWN unknown ENVELOPE, not a raised refusal: a caller learns the same
  // thing about a client that exists elsewhere and one that exists nowhere.
  for (const [label, p] of [["another firm's client", a], ["an invented id", b]]) {
    assert.equal(p.cash.status, "unknown", `${label}: cash status`);
    assert.equal(p.cash.value_cents, null, `${label}: a 0 here would be a figure about somebody else`);
    assert.equal(p.cash.coverage_reason, "client_not_visible", `${label}: coverage reason`);
    assert.equal(p.profit.status, "unknown", `${label}: profit status`);
    assert.equal(p.profit.coverage_reason, "client_not_visible", `${label}: profit coverage reason`);
    assert.equal(p.coverage_floor, null, `${label}: a coverage floor is a fact about their books`);
    assert.deepEqual(p.series, [], `${label}: the six-month series`);
  }
  // …AND IDENTICALLY. Only the three keys that are sampled per call, or that echo the id the
  // caller itself named, may differ — `client_id` is the caller's own argument coming back, which
  // tells them nothing they did not supply.
  const strip = (p) => { const q = { ...p }; delete q.computed_at; delete q.client_id;
    for (const g of ["cash", "profit", "income", "expense"]) {
      q[g] = { ...q[g] }; delete q[g].computed_at; delete q[g].source_watermark; }
    return q; };
  assert.deepEqual(strip(b), strip(a),
    "another firm's client and an invented id must be indistinguishable to this lane");
});

// ===========================================================================================
// AC2 / AC3 — THE READ'S OWN TYPED REFUSALS, AND THE TWO STATES THAT STAY DATA.
// ===========================================================================================

test("p1000.wake.typed_refusals — a malformed month, a future as-of, an as-of outside the named month and a null client reach the model lane as the READ'S OWN CLR10s, reason for reason", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "wake-refusals");
  const { secret } = await chatCredential();
  const cases = [
    [{ month: "2026-03-17" }, "month_not_first_day"],
    [{ asOf: "2999-01-01" }, "as_of_in_future"],
    [{ month: "2026-03-01", asOf: "2026-05-01" }, "as_of_outside_month"],
  ];
  for (const [args, reason] of cases) {
    let err = null;
    try { await wakePack(secret, client, args); } catch (e) { err = e; }
    assert.ok(err, `${reason}: the model lane accepted it`);
    assert.equal(err.code, "CLR10", `${reason}: errcode`);
    assert.equal(reasonOf(err), reason, `${reason}: the door's own detail reason did not travel`);
  }
  // A NULL CLIENT IS THE READ'S OWN CALLER DEFECT, and it is answered by the core rather than by
  // the wrapper — the wrapper adds no argument validation of its own.
  let err = null;
  try { await wakePack(secret, null); } catch (e) { err = e; }
  assert.equal(err && err.code, "CLR10");
  assert.equal(reasonOf(err), "invalid_client");
});

test("p1000.wake.unknown_cash_set_is_not_zero — a client with no published cash set answers unknown + NULL + cash_set_unpublished to the model lane too, never a refusal and never 0", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "wake-unpub");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(500)) });
  const { secret } = await chatCredential();

  const p = await wakePack(secret, client, { month: "2026-03-01" });
  assert.equal(p.cash.status, "unknown");
  assert.equal(p.cash.value_cents, null,
    "a 0 here would tell a professional this client has no money, which is a different sentence");
  assert.equal(p.cash.coverage_reason, "cash_set_unpublished");
  assert.equal(p.cash.set, null);
  // …and the profit half is unaffected, exactly as it is on the client home.
  assert.equal(p.profit.status, "ok");
  assert.equal(BigInt(p.profit.value_cents), BigInt(rm(500)));
});

// ===========================================================================================
// THE GRANT THE TICKET BOUGHT, AND NOTHING ELSE.
// ===========================================================================================

test("p1000.wake.grant_is_one_role — clara_agent_ro holds the model lane's door, clara_runtime and clara_authenticated are refused 42501 on it, and the core is reachable by nobody at all", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "wake-acl");
  const { secret } = await chatCredential();
  // DRIVEN, not read off the catalog: the role that is supposed to hold it does.
  assert.ok(await wakePack(secret, client), "clara_agent_ro cannot call the door this ticket added");

  for (const role of [ROLES.runtime, ROLES.authenticated, ROLES.wakeInteractive]) {
    await assertRaises("42501", () => roleQuery(role, namedCall(WAKE_DOOR, [
      { name: "p_client", cast: "uuid" }, { name: "p_as_of", cast: "date" },
      { name: "p_month", cast: "date" },
    ]), [client, null, null]), `${role} on the model lane's door`);
  }
  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.authenticated, ROLES.wakeInteractive]) {
    await assertRaises("42501", () => roleQuery(role,
      "select clara._client_financial_pack_core($1::uuid, $2::uuid, null, null)",
      [FIRM_A(), client]), `${role} on the ungranted core`);
  }
});

test("p1000.wake.read_only — the model lane's door answers inside a READ ONLY transaction, which is the only kind the chat lane's read pool opens", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "wake-ro");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(700)) });
  await publish(ALICE(), client, members(accounts, [CHART.bank, "bank_registry"]));
  const { secret } = await chatCredential();

  // `withReadWakeScoped` runs on a connection with default_transaction_read_only=on. A door that
  // wrote anything — a receipt, a usage row, a touched credential — would 25006 here rather than
  // in front of a person mid-conversation.
  const p = await asWake(ROLES.agentRo, secret, async (c) => {
    await c.query("select set_config('transaction_read_only', 'on', true)");
    // The control: this transaction really IS read-only, proven by a write that 25006s in it. It
    // runs inside a savepoint, because a refused statement aborts the transaction it was refused
    // in and the door still has to be called in the SAME one.
    await c.query("savepoint p1000_ro");
    let refused = null;
    try { await c.query("create temporary table _p1000_ro_probe(x int)"); }
    catch (e) { refused = e.code; }
    await c.query("rollback to savepoint p1000_ro");
    assert.equal(refused, "25006", "the read-only probe did not make the transaction read-only");
    return (await c.query(namedCall(WAKE_DOOR, [
      { name: "p_client", cast: "uuid" }, { name: "p_as_of", cast: "date" },
      { name: "p_month", cast: "date" },
    ]), [client, null, "2026-03-01"])).rows[0].result;
  });
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(700)));
});
