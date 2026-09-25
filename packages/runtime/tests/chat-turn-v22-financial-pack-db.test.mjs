// chatTurn_v22 · #1000 — `read_client_financial_pack` AGAINST A REAL DATABASE.
//
// The sibling file `chat-turn-v22-financial-pack.test.mjs` proves the decisions (the schema, the
// walls, the refusal mapping, the stanza) with the pool seam injected. THIS file proves the one
// thing that cannot be proved that way: that the REAL tool, through the REAL credential mint and
// the REAL read pool, reaches 0320's wake wrapper and comes back with the SAME envelope the
// client home's own read hands a person for the same inputs.
//
// IT DRIVES THE REAL TOOL, not a re-implementation. `globalThis.__claraPools` is the supervisor
// slot `pools()` reads (chatTurn.v13.infra.ts:61-65); the two members filled here are exactly the
// two `readScoped` uses, and they are filled with what `packages/runtime/lib/pools.mjs` does:
// `mintWakeCredentialObo` calls `clara.mint_wake_credential('interactive', firm, obo, ttl)` on the
// runtime credential, and `withReadWakeScoped` binds the secret TXN-LOCALLY on a `clara_agent_ro`
// connection. So the bookkeeper floor, the firm scope and every refusal below are this rig's own
// Postgres answering, not a fixture.
//
// WHAT IT DELIBERATELY DOES NOT RE-PROVE. The pack's arithmetic and the whole of 0320's door
// behaviour: those are `packages/db/tests/client-financial-pack.test.mjs` (#660's own 36 cells,
// which this change leaves green) and `packages/db/tests/client-financial-pack-wake-read.test.mjs`
// (#1000's ten). This file is about the lane between the model and that door.
//
// Serial, RELAY_TEST_MODE, and it bootstraps NO Workflow World, so it leaves
// `packages/db/tests/rig-isolation.test.mjs` T10b green (#866).

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { register } = await import("tsx/esm/api");
register();

import * as rig from "./rig.mjs";

const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");

const MODEL_TASK = "77777777-7777-4777-8777-777777777777";
const BANK_COA = "1010";
const SALES_COA = "4000";
const POSTING_DATE = "2026-03-10";
const MONTH = "2026-03-01";
const SET_FROM = "2026-01-01";

/** This lane's surface, probed rather than assumed: 0232's read and 0320's wrapper. A rig without
 *  them declines rather than fails. */
async function packLaneReady() {
  try {
    const r = await rig.rootQuery(
      `select to_regprocedure('clara.wake_get_client_financial_pack(uuid,date,date)') is not null as wake,
              to_regprocedure('clara.get_client_financial_pack(uuid,date,date)') is not null as human,
              to_regprocedure('clara.publish_client_cash_account_set(uuid,jsonb,date,text)') is not null as publish,
              to_regprocedure('clara.mint_wake_credential(text,uuid,uuid,interval,uuid)') is not null as mint`,
    );
    const o = r.rows[0];
    return o.wake && o.human && o.publish && o.mint;
  } catch {
    return false;
  }
}

const READY = await packLaneReady();
const skip = READY ? false : "#1000 (0320) client-financial-pack wake read absent";

/**
 * THE POOL SLOT THE SUPERVISOR FILLS AT BOOT, filled here with `lib/pools.mjs`'s own two moves.
 * Nothing is shortened: the credential is minted on the RUNTIME persona and the read runs on the
 * AGENT-READ persona with the secret bound txn-locally, because the whole point of #1000's door is
 * that those two facts are what carry a person's authority into it.
 */
const priorPools = globalThis.__claraPools;
globalThis.__claraPools = {
  mintWakeCredentialObo: async (firmId, oboUserId, ttl = "5 minutes") => {
    const r = await rig.asRuntime((c) => c.query(
      "select credential_id, secret from clara.mint_wake_credential($1, $2, $3, $4::interval)",
      ["interactive", firmId, oboUserId, ttl],
    ));
    return { credentialId: r.rows[0].credential_id, secret: r.rows[0].secret };
  },
  withReadWakeScoped: async (secret, fn) => rig.withActor({ role: "clara_agent_ro" }, async (c) => {
    await c.query("begin");
    await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
    try {
      return await fn(c);
    } finally {
      await c.query("rollback").catch(() => {});
    }
  }),
};

after(async () => {
  globalThis.__claraPools = priorPools;
  await rig.endPool();
});

/** A firm with a client carrying a two-account chart, ONE approved sale, and (unless
 *  `publishSet` is false) a published one-member cash set covering the whole of its books. */
async function buildMoneyFixture(label, { publishSet = true, cents = 100000 } = {}) {
  const built = await rig.buildFirm(label);
  const client = await rig.createClient(built.owner, {
    name: `${label}_${randomUUID().slice(0, 6)}`, opKey: rig.opk("p1000-cli"),
  });
  for (const [code, name, type] of [[BANK_COA, "Maybank Current", "asset"], [SALES_COA, "Sales", "income"]]) {
    await rig.asHuman(built.owner, (c) => c.query(
      "select clara.upsert_account($1,$2,$3,$4,$5,$6,$7) as r",
      [client, code, name, type, null, rig.opk("p1000-coa"), null]));
  }
  // LABELLED FIXTURE DML: `is_bank_account` is minted only by `add_bank_account` /
  // `remap_bank_account_coa`, both of which want a whole bank-account registration this battery is
  // not about (`packages/db/tests/client-financial-pack-fixtures.mjs` states the same census).
  await rig.rootQuery(
    "update clara.coa_accounts set is_bank_account = true where client_id = $1 and account_code = $2",
    [client, BANK_COA]);

  const resolution = await rig.rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
       values($1,$2,'manual',null,1.0,'human','{}'::jsonb,null) returning id`,
    [built.firm, client]);
  const lines = [
    { account_code: BANK_COA, debit_cents: String(cents), credit_cents: "0", description: "p1000 receipt" },
    { account_code: SALES_COA, debit_cents: "0", credit_cents: String(cents), description: "p1000 sale" },
  ];
  const draft = (await rig.humanQuery(built.owner,
    `select clara.draft_entry(p_client=>$1,p_resolution=>$2,p_posting_date=>$3::date,p_memo=>$4,
       p_lines=>$5::jsonb,p_op_key=>$6) as r`,
    [client, resolution.rows[0].id, POSTING_DATE, "p1000 sale", JSON.stringify(lines), rig.opk("p1000-draft")],
  )).rows[0].r;
  await rig.humanQuery(built.owner,
    "select clara.approve_entry(p_entry=>$1,p_expected_revision=>$2,p_op_key=>$3) as r",
    [draft.entry_id, draft.revision_token, rig.opk("p1000-appr")]);

  if (publishSet) {
    const acct = await rig.rootQuery(
      "select account_id from clara.coa_accounts where client_id = $1 and account_code = $2",
      [client, BANK_COA]);
    await rig.humanQuery(built.owner,
      `select clara.publish_client_cash_account_set(p_client=>$1,p_members=>$2::jsonb,
         p_effective_from=>$3::date,p_op_key=>$4) as r`,
      [client, JSON.stringify([{ account_id: acct.rows[0].account_id, member_reason: "bank_registry" }]),
        SET_FROM, rig.opk("p1000-pub")]);
  }
  return { ...built, client };
}

const ctxFor = (w, client = w.client, actor = w.owner) => ({
  firmId: w.firm, clientId: client, createdBy: actor, taskId: MODEL_TASK,
});

/** The human lane's own read of the same client, as the client home makes it. */
async function humanPack(owner, client, { asOf = null, month = null } = {}) {
  const r = await rig.humanQuery(owner,
    `select clara.get_client_financial_pack(p_client=>$1::uuid,p_as_of=>$2::date,p_month=>$3::date) as pack`,
    [client, asOf, month]);
  return r.rows[0].pack;
}

/** Everything about the money, with the two keys that are sampled per call removed. */
function moneyOnly(pack) {
  const out = { ...pack };
  delete out.computed_at;
  for (const g of ["cash", "profit", "income", "expense"]) {
    if (out[g]) { out[g] = { ...out[g] }; delete out[g].computed_at; delete out[g].source_watermark; }
  }
  return out;
}

// ---------------------------------------------------------------------------

test("1000.db: the REAL tool, through a REAL credential, answers the client home's OWN envelope for the same inputs", { skip }, async () => {
  const w = await buildMoneyFixture("p1000db_same");
  const human = await humanPack(w.owner, w.client, { month: MONTH });
  const out = await v22Tools.runReadClientFinancialPack(ctxFor(w), { client_id: w.client, month: MONTH });

  assert.equal(out.ok, true, `the tool refused: ${JSON.stringify(out)}`);
  assert.equal(out.status, "read");
  assert.deepEqual(moneyOnly(out.pack), moneyOnly(human),
    "the model and the person are not looking at the same numbers");
  // …and the figure is the one the ledger holds, stated independently of both reads.
  assert.equal(BigInt(out.pack.cash.value_cents), 100000n);
  assert.equal(out.pack.cash.status, "ok");
  assert.equal(BigInt(out.pack.profit.value_cents), 100000n);
  assert.equal(out.pack.period.month, MONTH);
  assert.equal(out.pack.period.is_mtd, false);
  // The envelope is the DOOR'S OBJECT: the ten fields every figure group owes are all present,
  // which is what "computes nothing of its own" has to mean at this seam.
  for (const k of ["value_cents", "status", "unit", "currency", "period", "computed_at",
    "definition_version", "source_watermark", "coverage", "coverage_reason"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(out.pack.cash, k), `cash envelope is missing ${k}`);
  }
  assert.equal(out.pack.cash.definition_version, "clara.client-financial-pack/v1");
});

test("1000.db: a client with no published cash set answers unknown + NULL + cash_set_unpublished through the tool — never a refusal and never 0", { skip }, async () => {
  const w = await buildMoneyFixture("p1000db_unpub", { publishSet: false });
  const out = await v22Tools.runReadClientFinancialPack(ctxFor(w), { client_id: w.client, month: MONTH });

  assert.equal(out.ok, true, "an unpublished cash set is DATA about the client, not a refusal");
  assert.equal(out.pack.cash.status, "unknown");
  assert.equal(out.pack.cash.value_cents, null,
    "0 would tell a professional this client has no money, which is a different sentence");
  assert.equal(out.pack.cash.coverage_reason, "cash_set_unpublished");
  // AND THE PROFIT HALF IS UNAFFECTED — the same property the client home has.
  assert.equal(out.pack.profit.status, "ok");
  assert.equal(BigInt(out.pack.profit.value_cents), 100000n);
});

test("1000.db: another firm's real client and a uuid that names nothing are INDISTINGUISHABLE through the tool, and neither carries a figure", { skip }, async () => {
  const mine = await buildMoneyFixture("p1000db_mine");
  const theirs = await buildMoneyFixture("p1000db_theirs");
  const invented = randomUUID();

  // The conversation is pinned to the OTHER firm's client, so the provenance wall is not what
  // answers here — the ctx names it, and the credential's firm is what refuses it.
  const foreign = await v22Tools.runReadClientFinancialPack(
    ctxFor(mine, theirs.client), { client_id: theirs.client, month: MONTH });
  const nowhere = await v22Tools.runReadClientFinancialPack(
    ctxFor(mine, invented), { client_id: invented, month: MONTH });

  for (const [label, out] of [["another firm's client", foreign], ["an invented id", nowhere]]) {
    assert.equal(out.ok, true, `${label}: this lane answers with the read's own envelope, not a refusal`);
    assert.equal(out.pack.cash.status, "unknown", `${label}: cash status`);
    assert.equal(out.pack.cash.value_cents, null, `${label}: a figure leaked`);
    assert.equal(out.pack.cash.coverage_reason, "client_not_visible", `${label}: coverage reason`);
    assert.equal(out.pack.profit.value_cents, null, `${label}: a profit leaked`);
  }
  const strip = (p) => { const q = moneyOnly(p); delete q.client_id; return q; };
  assert.deepEqual(strip(nowhere.pack), strip(foreign.pack),
    "a chat turn must not be able to tell a real client of another firm from one that never existed");
  // The control: the SAME tool, the same credential, this firm's own client — and the figures are
  // there. Without it the two answers above could be identical for the wrong reason.
  const own = await v22Tools.runReadClientFinancialPack(ctxFor(mine), { client_id: mine.client, month: MONTH });
  assert.equal(BigInt(own.pack.cash.value_cents), 100000n);
});

test("1000.db: the read's own CLR10 travels from the real door to the model — reason, detail and all", { skip }, async () => {
  const w = await buildMoneyFixture("p1000db_clr10");
  const out = await v22Tools.runReadClientFinancialPack(ctxFor(w), { client_id: w.client, month: "2026-03-17" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "CLR10");
  assert.equal(out.reason, "month_not_first_day");
  assert.equal(out.details.month, "2026-03-17", "the door's own detail did not reach the model");
  assert.match(out.message, /first day/i);
});

test("1000.db: a viewer's turn cannot read the money band at all — the credential is refused before the door, and the model is told which floor", { skip }, async () => {
  const w = await buildMoneyFixture("p1000db_floor");
  const viewer = await rig.addMember(w.owner, w.firm, { role: "viewer", prefix: "p1000v" });

  // THE READ'S OWN FLOOR IS VIEWER — driven, so the comparison below is a real narrowing rather
  // than a claim: the client home answers this person.
  const asViewer = await humanPack(viewer, w.client, { month: MONTH });
  assert.equal(asViewer.cash.status, "ok", "the read's own floor is not VIEWER any more");

  // THE MODEL LANE IS NARROWER. `clara.mint_wake_credential` refuses a below-bookkeeper
  // on_behalf_of outright, so the tool never reaches the door, and the refusal names the floor.
  const out = await v22Tools.runReadClientFinancialPack(
    ctxFor(w, w.client, viewer), { client_id: w.client, month: MONTH });
  assert.equal(out.ok, false);
  assert.equal(out.code, "CLR04");
  assert.equal(out.reason, "authority_lost");
  assert.match(out.message, /bookkeeper/i);
  // The control: the SAME tool for a bookkeeper+ of the same firm reads it.
  const asOwner = await v22Tools.runReadClientFinancialPack(ctxFor(w), { client_id: w.client, month: MONTH });
  assert.equal(asOwner.ok, true);
});
