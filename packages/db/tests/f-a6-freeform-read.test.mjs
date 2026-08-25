// F-A6 PR-1 — the audited freeform read: the π receipt-contract projection, plus (added in the
// narrow re-review round) the both-polarity floor for this round's own judgement branches.
//
// SCOPE, DELIBERATELY NARROW. The first two cells prove ONLY that
// clara._agent_receipt_src_f_a6's REAL projection (migration §9.5, folded in at merge once
// 0103_f_a7_pi_additive.sql landed first) conforms to pi's contract and does not leak the base
// table's own `scope` column (client|firm, what the READ touched) into the contract's `scope`
// column (firm|platform, receipt VISIBILITY) — the exact footgun the F-A6 completion report
// named. The cells after them (headed "NARROW RE-REVIEW ROUND" below) are the minimum
// both-polarity floor an independent review demanded for the judgement branches this fix round
// touched: the MF-2 census's Node Type fix, the two S-2 when-others arms, and NOTE-2's
// check-before-count. None of this is the item's full Annex F battery (the whole admission
// ladder, the full injection-payload corpus, every arm/settle interaction) — that battery does
// not exist as a file yet; it remains a separate, larger obligation, PR-2 scope.
//
// pi's own f-a7-pi.test.mjs ALREADY proves the checker's mechanism generically (the arity and
// type walls), using clara._agent_receipt_src_f_a6's STUB as its example subject inside a
// rolled-back transaction — it never asserts anything about F-A6's real, permanent projection.
// This file is that missing assertion, built directly against the receipt table (never through
// wake_freeform_read: the wake-credential/pool wiring is PR-2's, not built yet).
//
// NOTE-1 (independent review): _assert_receipt_surface_conforms is SHAPE-ONLY — arity, column
// NAME, and column TYPE against pi's contract. It is structurally blind to a VALUE-level bug
// where a column of the right name and the right type carries the WRONG DOMAIN — exactly the
// ordinal-19 scope footgun below: the contract's `scope` (firm|platform, receipt VISIBILITY)
// and this table's own `scope` (client|firm, what the READ touched) are both bare `text` at
// the same ordinal position, so a naive `r.scope as scope` projection would PASS conformance
// perfectly while leaking the wrong domain. `f-a6.pi-conforms` below proves the shape only;
// `f-a6.pi-scope-footgun` is the separate, VALUE-level proof conformance cannot provide — do
// not read a green `pi-conforms` as evidence the domain projection is also correct.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool, insertUser } from "./rig-fixtures.mjs";
import { createChatSession, beginChatTurn } from "./rig-runtime-fixtures.mjs";
import { getPool } from "./rig-helpers.mjs";

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
  // CORRECTED (narrow re-review round): a fixed tag collides on `users_email_key` under any
  // database reuse (a re-run against a not-actually-fresh rig, #344's own class of hazard) --
  // randomized per call, matching every other fixture in this file.
  const user = await insertUser("f_a6_rct", randomUUID());
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

// =============================================================================================
// NARROW RE-REVIEW ROUND (independent review, live probes) — the minimum both-polarity floor
// for every judgement branch this round touched. NOT the full Annex F battery (still PR-2 scope,
// still absent as a file — see the header above); this is the floor the register's own honest
// gap demands now that the gap has a live-measured shape. Every cell below calls the REAL verb
// through a real armed credential, because the defect this round found (the MF-2 census escape)
// only exists inside the verb's own plan-census step — a direct table INSERT (like the two cells
// above) cannot exercise it at all.
// =============================================================================================

let mf2World = null;

async function buildMf2World() {
  if (mf2World) return mf2World;
  const firm = randomUUID();
  const client = randomUUID();
  // Randomized tag, same reasoning as pi-scope-footgun's own fix above -- a fixed tag is not
  // safe under database reuse.
  const user = await insertUser("f_a6_mf2", randomUUID());
  await rootQuery("insert into clara.firms (id, name) values ($1, $2)", [firm, "f_a6 mf2 firm"]);
  await rootQuery("insert into clara.clients (id, firm_id, name, status) values ($1, $2, $3, 'active')", [client, firm, "f_a6 mf2 client"]);
  await rootQuery(
    "insert into clara.firm_memberships (id, firm_id, user_id, role, status) values (gen_random_uuid(), $1, $2, 'owner', 'active')",
    [firm, user],
  );
  const session = await createChatSession({ firm, author: user, client });
  const beginR = await beginChatTurn({
    session,
    author: user,
    turnKey: `f-a6-mf2-${randomUUID()}`,
    parts: [{ type: "text", text: "F-A6 MF-2 re-review battery turn" }],
  });
  const task = beginR?.task_id ?? beginR?.id ?? beginR;
  const credR = await rootQuery(
    "select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)",
    ["interactive_client", firm, null, client],
  );
  mf2World = { firm, client, user, task, secret: credR.rows[0].secret };
  return mf2World;
}

/** Calls the real verb as clara_freeform_ro, with the world's armed credential, one payload
 *  per call. Returns the verb's own jsonb result (never throws for a within-verb refusal —
 *  only for a genuine unhandled abort, which some cells below deliberately probe for). */
async function callFreeformVerb(sql, { rowCap = 100 } = {}) {
  const world = await buildMf2World();
  const pool = getPool();
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set role clara_freeform_ro");
    await c.query("select set_config('clara.wake_secret',$1,true)", [world.secret]);
    let result, error;
    try {
      const r = await c.query(
        "select clara.wake_freeform_read(p_sql => $1, p_purpose => $2, p_task => $3, p_op_key => $4, p_row_cap => $5) as r",
        [sql, "mf2 re-review battery", world.task, `f-a6-mf2-${randomUUID()}`, rowCap],
      );
      result = r.rows[0].r;
    } catch (e) {
      error = e;
    }
    await c.query("reset role");
    await c.query("commit");
    return { result, error };
  } catch (e) {
    try { await c.query("rollback"); } catch { /* best-effort cleanup only */ }
    return { error: e };
  } finally {
    c.release();
  }
}

test("f-a6.mf2-rows-from-refused — a multi-function ROWS FROM(...) Function Scan is refused (the escape the census's Node Type fix closes)", async (t) => {
  if (gate(t)) return;
  const { result } = await callFreeformVerb(
    "select a::text as a from rows from (query_to_xml('select id from clara.journal_entries',true,false,''), generate_series(1,1)) t(a,b)",
  );
  assert.equal(result?.outcome, "refused", `expected refused, got ${JSON.stringify(result)}`);
  assert.equal(result?.refusal_reason, "function_not_enumerated");
  assert.deepEqual(result?.relations_read, [], "a refused function-scan read names no relation");
});

test("f-a6.mf2-xmltable-refused — XMLTABLE's Table Function Scan is refused (the second escape the same fix closes)", async (t) => {
  if (gate(t)) return;
  const { result } = await callFreeformVerb(
    "select x.v from xmltable('/x' passing query_to_xml('select id from clara.journal_entries',true,false,'') columns v text path '.') x",
  );
  assert.equal(result?.outcome, "refused", `expected refused, got ${JSON.stringify(result)}`);
  assert.equal(result?.refusal_reason, "function_not_enumerated");
});

test("f-a6.mf2-scalar-residual-unmoved — the SCALAR query_to_xml call is NOT refused (H-3's named, bounded, unmoved residual — the census cannot reach a call with no Function Scan node, by construction)", async (t) => {
  if (gate(t)) return;
  // MEASURED, this exact payload: `explain (format json, verbose)` on a scalar function call in
  // a target list produces `Subquery Scan`/`Result` nodes, never `Function Scan` or `Table
  // Function Scan` — so the Node-Type census (this round's own fix) cannot see it, structurally,
  // the same way the old name-keyed census could not. This is NOT a gap in this round's fix; it
  // is H-3's own residual, explicitly bounded (RLS still holds inside SPI — no tenancy moves,
  // only relations_read/row_count understate) and explicitly closed only by B-1's owner ceremony
  // (folded, #340, NO-GO on managed Supabase), never by the plan census. Asserting the TRUE
  // current behaviour here, not a hoped-for one: this cell is the boundary marker between "the
  // census's scope" and "the ceremony's scope" — a future change that makes this refuse would be
  // closing H-3 for real and should update this cell's own name and assertion, not silently pass.
  const { result } = await callFreeformVerb(
    "select query_to_xml('select id from clara.journal_entries',true,false,'') as x",
  );
  assert.equal(result?.outcome, "ok", `expected ok (the residual, unmoved), got ${JSON.stringify(result)}`);
  assert.deepEqual(result?.relations_read, [], "the receipt-accuracy residual: the census cannot see the relation SPI read, exactly as H-3 names");
});

test("f-a6.mf2-pg-settings-refused — pg_settings (a Function Scan on pg_show_all_settings) is refused, positive control from the original B-2 finding", async (t) => {
  if (gate(t)) return;
  const { result } = await callFreeformVerb("select name, setting from pg_settings");
  assert.equal(result?.outcome, "refused", `expected refused, got ${JSON.stringify(result)}`);
  assert.equal(result?.refusal_reason, "function_not_enumerated");
});

test("f-a6.mf2-allowed-read-passes — an ordinary enumerated relation read still passes with correct relations_read (the census's fix must not over-refuse)", async (t) => {
  if (gate(t)) return;
  const world = await buildMf2World();
  const { result } = await callFreeformVerb(`select id, name from clara.clients where id = '${world.client}'`);
  assert.equal(result?.outcome, "ok", `expected ok, got ${JSON.stringify(result)}`);
  assert.deepEqual(result?.relations_read, ["clara.clients"]);
  assert.equal(result?.row_count, 1);
});

test("f-a6.s2-open-time-runtime-error — a plan-time constant-foldable error (select 1/0) settles at the cursor-OPEN when-others arm, not FETCH", async (t) => {
  if (gate(t)) return;
  // The root-cause payload from this round's earlier fix: PostgreSQL constant-folds `1/0`
  // while planning the OPEN'd portal, one step before the plan census and two before FETCH.
  const { result } = await callFreeformVerb("select 1/0 as x");
  assert.equal(result?.outcome, "refused");
  assert.equal(result?.refusal_reason, "runtime_error");
  assert.equal(result?.rung_vector?.statement_shape, "not_evaluable",
    "OPEN never reached b_shape:='pass' -- every downstream rung stays not_evaluable, law 68");
});

test("f-a6.s2-fetch-time-runtime-error — a genuinely data-dependent runtime error (not plan-time foldable) settles at the FETCH-loop's own when-others arm", async (t) => {
  if (gate(t)) return;
  // MEASURED, isolated before this cell was written: `char_length(name) - char_length(name)`
  // depends on each row's actual column value, so the planner cannot constant-fold it away --
  // OPEN succeeds cleanly, and the division-by-zero only fires once FETCH evaluates a real row.
  // This is the payload class the FETCH loop's when-others arm actually exists to catch, distinct
  // from the OPEN-time arm the cell above proves.
  const { result } = await callFreeformVerb(
    "select 10 / (char_length(name) - char_length(name)) as x from clara.clients",
  );
  assert.equal(result?.outcome, "refused");
  assert.equal(result?.refusal_reason, "runtime_error");
  assert.equal(result?.rung_vector?.statement_shape, "pass", "OPEN succeeded this time -- the FETCH arm fired, not the OPEN one");
});

test("f-a6.note2-cap-boundary — row_count stops exactly at the cap, never overcounts the discarded row, and rows[] stays empty on refusal", async (t) => {
  if (gate(t)) return;
  const { result } = await callFreeformVerb("select * from (values (1),(2),(3),(4),(5)) as t(n)", { rowCap: 3 });
  assert.equal(result?.outcome, "refused");
  assert.equal(result?.refusal_reason, "result_row_cap");
  assert.equal(result?.row_count, 3, "the check-before-count fix: exactly the cap, not cap+1");
  assert.deepEqual(result?.rows, [], "a refusal never carries a partial rows[] leak");
});
