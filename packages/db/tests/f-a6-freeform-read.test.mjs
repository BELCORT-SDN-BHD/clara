// F-A6 PR-1 — the audited freeform read: the π receipt-contract projection.
//
// SCOPE, DELIBERATELY NARROW. This proves ONLY that clara._agent_receipt_src_f_a6's REAL
// projection (migration §9.5, folded in at merge once 0103_f_a7_pi_additive.sql landed first)
// conforms to pi's contract and does not leak the base table's own `scope` column (client|firm,
// what the READ touched) into the contract's `scope` column (firm|platform, receipt
// VISIBILITY) — the exact footgun the F-A6 completion report named. It is NOT the item's full
// Annex F battery (the admission ladder, the injection payloads, the wake-credential-driven
// arm/settle path) — that battery does not exist as a file yet; it is a separate, larger
// obligation and is out of scope for this completion round.
//
// pi's own f-a7-pi.test.mjs ALREADY proves the checker's mechanism generically (the arity and
// type walls), using clara._agent_receipt_src_f_a6's STUB as its example subject inside a
// rolled-back transaction — it never asserts anything about F-A6's real, permanent projection.
// This file is that missing assertion, built directly against the receipt table (never through
// wake_freeform_read: the wake-credential/pool wiring is PR-2's, not built yet).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool, insertUser } from "./rig-fixtures.mjs";

let live = false;

/** Derived from the catalog, never a migration number (numbers are claimed at merge): the
 *  verb this migration creates is the one thing that cannot exist without the whole file
 *  having applied. */
async function freeformApplied() {
  return (await rootQuery(
    "select to_regprocedure('clara.wake_freeform_read(text,text,uuid,text,int)') is not null as ok",
  )).rows[0].ok;
}

before(async () => { live = await freeformApplied(); });
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("F-A6 PR-1 not applied — clara.wake_freeform_read absent"); return true; }
  return false;
};

test("f-a6.pi-conforms — the real projection passes π's own conformance checker", async (t) => {
  if (gate(t)) return;
  // POSITIVE proof: the instrument that CAN say no (pi-A4/pi-A5 in f-a7-pi.test.mjs prove it
  // does, generically) says YES for F-A6's own, permanent shim.
  await assert.doesNotReject(
    () => rootQuery("select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a6')"),
    "clara._agent_receipt_src_f_a6 must conform to clara.agent_receipt_contract",
  );
});

test("f-a6.pi-scope-footgun — the contract's scope (firm|platform) is never the base table's own scope (client|firm), and failing_rungs derives correctly", async (t) => {
  if (gate(t)) return;
  // A synthetic, fully-settled REFUSED read, built directly against the table (the wake verb's
  // credential/pool machinery is PR-2's and untested here) with scope='client' — the exact
  // value that must NOT leak into the shim's own `scope` column, which conformance (a shape
  // check only) cannot catch: both domains are `text`, so a naive `r.scope as scope` would
  // conform perfectly and still be wrong.
  const firm = randomUUID();
  const client = randomUUID();
  const user = await insertUser("f_a6_rct", "u1");
  await rootQuery("insert into clara.firms (id, name) values ($1, $2)", [firm, "f_a6 rct firm"]);
  const rungVector = {
    statement_shape: "pass",
    relation_not_enumerated: "fail",
    plan_cost_ceiling: "not_evaluable",
    result_row_cap: "not_evaluable",
    result_byte_cap: "not_evaluable",
    reason: "relation_not_enumerated",
  };
  const ins = await rootQuery(
    `insert into clara.freeform_read_log
       (firm_id, credential_id, query_text, purpose, verb, scope, client_scope,
        acting_actor, via_wake_kind, task_id, op_key, arm_txid,
        settled_at, outcome, refusal_reason, rung_vector, relations_read,
        row_count, byte_count, duration_ms)
     values ($1, $2, 'select prosrc from pg_proc', 'rct footgun proof', 'wake_freeform_read',
             'client', array[$3]::uuid[], $4, 'interactive_client', $5, $6,
             pg_current_xact_id(), now(), 'refused', 'relation_not_enumerated', $7::jsonb,
             array[]::text[], 0, 0, 3)
     returning id`,
    [firm, randomUUID(), client, user, randomUUID(), `f-a6-rct-${randomUUID()}`, JSON.stringify(rungVector)],
  );
  const receiptId = String(ins.rows[0].id);
  const row = (await rootQuery(
    "select scope, client_id, failing_rungs from clara._agent_receipt_src_f_a6 where receipt_id = $1",
    [receiptId],
  )).rows[0];
  assert.ok(row, `the shim must surface the row it just projected (receipt_id ${receiptId})`);
  assert.equal(row.scope, "firm",
    `the shim's scope column is the CONTRACT's firm|platform value, always 'firm' for a freeform read — got ${row.scope} (this row's OWN scope is 'client'; leaking it through would be the exact footgun the completion report named)`);
  assert.equal(row.client_id, client, "client_id derives from client_scope[1], the credential's compiled pin");
  assert.deepEqual(row.failing_rungs, ["relation_not_enumerated"],
    `failing_rungs must list every rung whose vector value is the literal 'fail', and nothing else (the reason token is a string, never 'fail', so it never leaks in) — got ${JSON.stringify(row.failing_rungs)}`);
});
