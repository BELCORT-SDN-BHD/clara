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
import { buildWorld, endPool, assertRaises, mintWake, wakeQuery, namedCall } from "./rig-fixtures.mjs";
import {
  CHART, financialClient, pack, publish, members, reasonOf,
  ROLES, rootQuery, postEntry,
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
