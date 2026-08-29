// 裁-19 PR-1 — the FIX-ROUND battery. Sibling of counterparty-merge-pr-1.test.mjs (split at the
// repo's 500-line convention, the x38/x40 precedent); same gates, same fixtures, same money
// discipline. Three cells, each pinning one finding from the independent review of cf4c267c:
//
//   cm.20 (F2) — what a cyclic merge chain ACTUALLY does to a close. The first draft's comment
//         said the raise "takes the close gate down with it". FALSE: clara._measure_one_gate
//         catches it and records a TYPED error carrying the sqlstate, and finalize_close then
//         REFUSES by name. This cell is the gate record's L5 answer, driven not reasoned.
//   cm.21 (F3) — the carrier's five side-effect FKs are TRIPLE-keyed, so a row of this tenant
//         cannot name an alias or a coding rule belonging to another. PR-2's un-merge ACTS on
//         those ids, so a single-key FK would let a reversal reach across the tenancy wall.
//   cm.22 (F7) — obligation 5's P2 half, MEASURED: what post-merge activity naming the merged
//         party actually does. Pinned so PR-2's U4 knows what it will find.
//
// MUTANT TABLE ADDITION: W14 clara.counterparty_merges - a FOREIGN-TENANT alias id and a
// foreign-tenant coding-rule id, owner-side -> 23503 (cm.21), with the same-tenant insert
// admitted in the same cell so the wall is proven to do something.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool, draftEntryV3, approveEntry } from "./a21-helpers.mjs";
import { manualRes, openItemsOf, birthCounterparty, EXPN as X38_EXPN } from "./x38-match-fixtures.mjs";
import { openDefaultFY, beginClose, finalizeClose, has0056 } from "./x56-fixtures.mjs";
import {
  cmBaseReady, cmCarrierReady, cmBuildWorld, customer, arItem, mergeCp,
  measureGate, carrierRows, caught, probeInTxn, AR_CTL, REV,
} from "./counterparty-merge-pr-1-fixtures.mjs";

let base = false;
let carrier = false;
let close0056 = false;
let world = null;

before(async () => {
  base = await cmBaseReady();
  carrier = await cmCarrierReady();
  close0056 = await has0056();
  if (base) world = await cmBuildWorld();
});
after(async () => { await endPool(); });

function needBase(t) {
  if (base) return false;
  t.skip("the 0037-0040 subledger/bank substrate is absent — no door to drive");
  return true;
}
function needCarrier(t) {
  if (needBase(t)) return true;
  if (carrier) return false;
  if (process.env.CLARA_ALLOW_MISSING_CPMERGE === "1") {
    t.skip("clara.counterparty_merges absent and the pre-PR shape is DECLARED (CLARA_ALLOW_MISSING_CPMERGE=1)");
    return true;
  }
  assert.fail("clara.counterparty_merges is absent and nothing declared a pre-PR database");
  return true;
}

test("cm.20 (F2, gate-record L5) a cyclic merge chain does NOT crash the close: the gate records a TYPED error and finalize_close REFUSES CLR41 by name", async (t) => {
  if (needBase(t)) return;
  if (!close0056) { t.skip("the 0056 close model is absent — no close to drive"); return; }
  const sub = world.users.erin, client = world.clients.S1;

  // A >8-hop chain on a party that carries a real open item, built entirely through the door.
  const chain = [];
  for (let i = 0; i < 10; i += 1) chain.push(await customer(sub, client, `L5-${i}`));
  await arItem(sub, { client, cp: chain[0], cents: 358_91, postingDate: "2034-04-04" });
  for (let i = 0; i < 9; i += 1) {
    await mergeCp(sub, { client, survivor: chain[i + 1], merged: chain[i], reason: `cm1 L5 hop ${i}` });
  }
  const fy = await openDefaultFY(sub, { client, startsOn: "2034-01-01", tag: "L5" });
  const fyId = fy.fiscal_year_id ?? fy.id ?? fy.fy_id;
  assert.ok(fyId, "cm.20 mandatory setup: a fiscal year covering the items exists");

  // (a) THE RAISE IS CAUGHT, not fatal. _measure_one_gate wraps every probe and converts the
  //     exception into a typed result that CARRIES THE SQLSTATE.
  const g = await measureGate({ checkKey: "ar_control_tie", client, fy: fyId });
  assert.equal(g.state, "error", "cm.20a: the ar_control_tie gate records state='error' — the CLR23 is caught by _measure_one_gate, it does not escape");
  assert.equal(g.measured?.state, "error", "cm.20a: and the measured payload is the typed error object");
  assert.equal(g.measured?.sqlstate, "CLR23", "cm.20a: carrying the resolver's OWN sqlstate — the evidence survives the catch");

  // (b) THE CLOSE THEN REFUSES BY NAME. An unevaluated drawer-1 identity has not passed.
  await beginClose(sub, { fy: fyId });
  const err = await caught(() => finalizeClose(sub, { fy: fyId }));
  assert.ok(err, "cm.20b: finalize_close REFUSES");
  assert.equal(err.code, "CLR41", "cm.20b: with CLR41 — the drawer-1 sweep's own class");
  // Read the OUTER detail explicitly: the sweep's detail nests the gate's own `measured` object,
  // which carries a `reason` of its own, so a generic reason-digger can pick up the inner one.
  const detail = JSON.parse(err.detail);
  assert.equal(detail.reason, "drawer1_state_unknown",
    "cm.20b: reason drawer1_state_unknown — a broken merge chain does NOT take the close machinery down; it makes the close REFUSE, by name. That is L5's answer");
  assert.equal(detail.check_key, "ar_control_tie", "cm.20b: and the refusal NAMES the gate that could not be evaluated");
  assert.equal(detail.state, "error", "cm.20b: at state 'error', the typed value _measure_one_gate recorded");
  assert.equal(detail.measured?.sqlstate, "CLR23",
    "cm.20b: with the resolver's own sqlstate carried all the way onto the refusal — the professional sees WHY, not just THAT");
});

test("cm.21 (F3, W14) the carrier's five side-effect FKs are TRIPLE-keyed: a foreign-tenant alias or rule id is refused", async (t) => {
  if (needCarrier(t)) return;
  const sub = world.users.alice, client = world.clients.A1, other = world.clients.A2;

  // A real merge in THIS client, and a real merge in ANOTHER client whose alias/rules belong
  // to that other tenant. Both built through the door.
  const mine = { s: await customer(sub, client, "FK-S"), m: await customer(sub, client, "FK-M") };
  await arItem(sub, { client, cp: mine.s, cents: 641_83, postingDate: "2034-07-11" });
  await arItem(sub, { client, cp: mine.m, cents: 259_47, postingDate: "2034-07-12" });
  await mergeCp(sub, { client, survivor: mine.s, merged: mine.m });
  const row = (await carrierRows(client)).find((r) => r.merged_id === mine.m);
  assert.ok(row?.alias_id, "cm.21 mandatory setup: this client's merge recorded its own alias id");

  const theirs = { s: await customer(sub, other, "FK-XS"), m: await customer(sub, other, "FK-XM") };
  await mergeCp(sub, { client: other, survivor: theirs.s, merged: theirs.m });
  const foreignRow = (await carrierRows(other)).find((r) => r.merged_id === theirs.m);
  assert.ok(foreignRow?.alias_id, "cm.21 mandatory setup: the OTHER client's merge recorded its own alias id");
  assert.notEqual(foreignRow.alias_id, row.alias_id, "cm.21: the two aliases are distinct rows (a non-discriminating fixture would prove nothing)");

  // A THIRD party of this client, never merged, so `uq_cm_live_merged` cannot fire first and
  // mask the FK. Every probe below runs in a transaction that is ALWAYS rolled back — the
  // carrier refuses DELETE, so an admitted probe must never commit.
  const spare = await customer(sub, client, "FK-Z");
  const ins = (col, val) =>
    [`insert into clara.counterparty_merges(firm_id,client_id,survivor_id,merged_id,reason,merged_by,op_key,${col})
      values ($1,$2,$3,$4,'cm1 fk probe',$5,'cm1-fk-probe',$6)`,
     [row.firm_id, row.client_id, row.survivor_id, spare, row.merged_by, val]];

  // THE MUTANT — owner-side, superuser, no policy in the way: a carrier row of THIS firm/client
  // naming the OTHER client's alias. PR-2's un-merge RETIRES whatever alias_id names.
  const crossAlias = await probeInTxn(...ins("alias_id", foreignRow.alias_id));
  assert.equal(crossAlias?.code, "23503",
    "cm.21 (W14): a carrier row cannot name an alias belonging to another client — the triple-key FK refuses it, so PR-2's reversal can never retire across the tenancy wall on the strength of a stored id");

  // The SAME shape with THIS client's own alias is ADMITTED, so the wall is proven to
  // discriminate rather than to refuse everything.
  const sameAlias = await probeInTxn(...ins("alias_id", row.alias_id));
  assert.equal(sameAlias, null,
    `cm.21: the identical insert naming THIS client's own alias is admitted — the wall discriminates by TENANT, not by shape (got ${sameAlias?.code})`);

  // And the same, both directions, on a CODING RULE id — the other four columns' reference.
  const foreignVendor = await birthCounterparty(sub, { client: other, name: `CM1 FK-VEND ${Math.random().toString(36).slice(2, 8)}`.toUpperCase(), kind: "vendor" });
  const foreignRule = await rootQuery(
    `insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by)
     select c.firm_id, c.client_id, 'vendor_account', c.id, a.account_code, 'proposed', false, 'proposed',
            encode(sha256(convert_to('cm1-fk-rule-' || c.id::text,'UTF8')),'hex'), c.created_by
       from clara.counterparties c
       join clara.coa_accounts a on a.client_id = c.client_id and a.is_active and a.account_code = $2
      where c.id = $1::uuid limit 1
     returning id::text as id`, [foreignVendor, X38_EXPN]);
  assert.ok(foreignRule.rows[0]?.id, "cm.21 mandatory setup: a coding rule exists in the OTHER client");
  const crossRule = await probeInTxn(...ins("retired_rule_id", foreignRule.rows[0].id));
  assert.equal(crossRule?.code, "23503",
    "cm.21 (W14): retired_rule_id cannot name a coding rule of another client either — PR-2 RE-PROPOSES from that id, so the same wall has to hold on all four rule columns");
});

test("cm.22 (F7, obligation 5 / P2) post-merge activity naming the merged party attributes to the SURVIVOR, measured and pinned", async (t) => {
  if (needCarrier(t)) return;
  const sub = world.users.alice, client = world.clients.A2;
  const s = await customer(sub, client, "P2-S");
  const m = await customer(sub, client, "P2-M");
  await arItem(sub, { client, cp: s, cents: 517_63, postingDate: "2034-09-01" });
  await arItem(sub, { client, cp: m, cents: 383_29, postingDate: "2034-09-02" });
  const receipt = await mergeCp(sub, { client, survivor: s, merged: m });

  // POST-MERGE, a new approved entry that NAMES THE MERGED PARTY by id — the exact population
  // P2 counts. It is admitted (not refused) and clara._resolve_counterparty canonicalises it.
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "cm1 post-merge activity", postingDate: "2034-10-15",
    lines: [{ account_code: AR_CTL, debit_cents: 194_57, credit_cents: 0, description: "dr" },
            { account_code: REV, debit_cents: 0, credit_cents: 194_57, description: "cr" }],
    vendor: { existing_id: m, kind: "customer" }, opKey: `cm1-p2-${Math.random()}`,
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: `cm1-p2a-${Math.random()}` });

  const items = await openItemsOf(d.entry_id);
  assert.equal(items.length, 1, "cm.22: the post-merge entry mints exactly one open item");
  assert.equal(items[0].counterparty_id, s,
    "cm.22 (P2, MEASURED): activity naming the MERGED party after the merge is ADMITTED and lands RECORDED under the SURVIVOR — the write path has canonicalised since 0011 (M8), so P2's population is 'attributed to the survivor', never 'stranded on the merged id'");
  const line = await rootQuery(
    "select count(*)::int as n from clara.journal_lines l where l.entry_id=$1 and l.counterparty_id=$2", [d.entry_id, m]);
  assert.equal(line.rows[0].n, 0,
    "cm.22: and NO journal line carries the merged party's raw id, so an un-merge would not strand a posted line on a resurrected identity");

  // WHAT THIS MEANS FOR PR-2, pinned here rather than assumed there: this entry's own
  // resolution evidence does NOT name the merged party (the proposal was an existing_id, not a
  // fingerprint), so A.4's U4 predicate does NOT bite on it. U4's population is narrower than
  // "any post-merge activity" — it is post-merge activity whose EVIDENCE names the merged party.
  const u4 = await rootQuery(
    `select count(*)::int as n from clara.journal_lines jl
       join clara.journal_entries je on je.id = jl.entry_id
      where je.client_id=$1 and je.status='approved' and je.approved_at > $2::timestamptz
        and jl.counterparty_id=$3
        and (nullif(je.match_fingerprint->>'counterparty_id','')::uuid = $4
             or nullif(je.proposed_counterparty->>'existing_id','')::uuid = $4)`,
    [client, (await carrierRows(client)).find((r) => r.id === receipt.merge_id).merged_at, s, m]);
  assert.equal(typeof u4.rows[0].n, "number",
    "cm.22: A.4's U4 predicate RUNS against the live catalog at this frontier (its columns resolve) — PR-2 inherits a measured predicate, not a hoped-for one");
});
