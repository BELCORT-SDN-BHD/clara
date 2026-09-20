// #993 — THE CATALOGS THAT MINT KNOWLEDGE KEYS NOW ENFORCE THE SAME GRAMMAR
// `clara.record_work_knowledge_read` ALREADY DOES.
// Migration: 0242_knowledge_key_grammar.sql. Every cell gates on the LIVE CATALOGUE, never on the
// migration number (knowledge-fixtures.mjs `keyGrammarCohortApplied`), the same discipline
// knowledge-fye-day.test.mjs and knowledge-scope-default-drop.test.mjs both state.
//
// WHAT THESE CELLS ARE FOR, one per clause of #993's Agent Brief acceptance criteria:
//   AC1 — inserting a key that would fail `record_work_knowledge_read`'s grammar (an uppercase
//         letter, a hyphen, a leading digit, or 64+ characters) is refused AT INSERT TIME by each
//         catalog itself, through a real CHECK constraint under its own name, never by the
//         recorder's own later refusal (kg.01 proves the constraint's shape and name; kg.02/kg.03
//         prove the refusal live, on each table).
//   AC3 — a test in this battery inserts a catalog key that violates the tightened grammar and
//         asserts the catalog refuses it (kg.02, kg.03 — this file IS that test).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PG, asRoot, endPool, rootQuery } from "./rig-fixtures.mjs";
import { keyGrammarCohortApplied } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 3;
let live = false;
let executed = 0;

before(async () => { live = await keyGrammarCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_KEY_GRAMMAR_0242 === "1") {
    console.warn("SKIP knowledge-key-grammar: the 0242 cohort is not applied (explicit pre-integration run).");
    t.skip("key-grammar cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0242 key-grammar cohort is required for a focused run: apply 0242_knowledge_key_grammar.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// A full, otherwise-valid row for each catalog, so a probe insert's ONLY defect is its key's own
// grammar -- never a sibling column CHECK (ck_knowledge_keys_policy_authority, value_shape,
// min_role, ...) firing instead and mis-attributing the refusal.
const knowledgeRow = (key) => ({
  text: `insert into clara.knowledge_keys
      (knowledge_key, kind, value_shape, validated_against, description, authority_bearing, min_role)
    values ($1, 'assertion', 'string', 'shape_only', '#993 rig probe -- rolled back by the test harness', false, 'bookkeeper')`,
  values: [key],
});
const factRow = (key) => ({
  text: `insert into clara.client_fact_keys (fact_key, validated_against, description)
    values ($1, 'shape_only', '#993 rig probe -- rolled back by the test harness')`,
  values: [key],
});

cell("kg.01 both catalogs carry the tightened grammar CHECK under its own name; the old blank-only CHECK is gone", async () => {
  const kk = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'clara.knowledge_keys'::regclass and conname = 'ck_knowledge_keys_key_grammar'`);
  assert.equal(kk.rowCount, 1, "ck_knowledge_keys_key_grammar must exist");
  assert.equal(kk.rows[0].def, "CHECK ((knowledge_key ~ '^[a-z][a-z0-9_]{0,62}$'::text))");

  const kkOld = await rootQuery(
    `select 1 from pg_constraint
      where conrelid = 'clara.knowledge_keys'::regclass and conname = 'knowledge_keys_knowledge_key_check'`);
  assert.equal(kkOld.rowCount, 0, "the old btrim-only CHECK must be gone");

  const cfk = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'clara.client_fact_keys'::regclass and conname = 'ck_client_fact_keys_key_grammar'`);
  assert.equal(cfk.rowCount, 1, "ck_client_fact_keys_key_grammar must exist");
  assert.equal(cfk.rows[0].def, "CHECK ((fact_key ~ '^[a-z][a-z0-9_]{0,62}$'::text))");

  const cfkOld = await rootQuery(
    `select 1 from pg_constraint
      where conrelid = 'clara.client_fact_keys'::regclass and conname = 'client_fact_keys_fact_key_check'`);
  assert.equal(cfkOld.rowCount, 0, "the old btrim-only CHECK must be gone");

  // The ONE OTHER table-level CHECK on knowledge_keys survives by name -- proof this migration
  // touched exactly the one constraint it named on each table.
  const survivor = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'clara.knowledge_keys'::regclass and conname = 'ck_knowledge_keys_policy_authority'`);
  assert.equal(survivor.rowCount, 1, "ck_knowledge_keys_policy_authority (unrelated) must survive");
});

cell("kg.02 clara.knowledge_keys refuses a key record_work_knowledge_read would also refuse", async (t) => {
  await t.test("uppercase letter", async () => {
    const err = await assertRaisesCheck(() => rootQuery(knowledgeRow("Sst_Regime").text, knowledgeRow("Sst_Regime").values));
    assert.equal(err.constraint, "ck_knowledge_keys_key_grammar");
  });
  await t.test("hyphen", async () => {
    const err = await assertRaisesCheck(() => rootQuery(knowledgeRow("sst-regime").text, knowledgeRow("sst-regime").values));
    assert.equal(err.constraint, "ck_knowledge_keys_key_grammar");
  });
  await t.test("64 characters (one past the 63-character bound)", async () => {
    const key = "a".repeat(64);
    const err = await assertRaisesCheck(() => rootQuery(knowledgeRow(key).text, knowledgeRow(key).values));
    assert.equal(err.constraint, "ck_knowledge_keys_key_grammar");
  });
  await t.test("control: a 63-character all-lowercase key is ADMITTED (rolled back after, never committed)", async () => {
    const key = "a".repeat(63);
    // ONE client for begin/insert/rollback (rootQuery alone would hand each statement a
    // DIFFERENT pooled connection and never actually roll back the insert).
    await asRoot(async (client) => {
      await client.query("begin");
      const r = await client.query(knowledgeRow(key).text, knowledgeRow(key).values);
      assert.equal(r.rowCount, 1, "the boundary-length key must be accepted, not refused by an off-by-one grammar");
      await client.query("rollback");
    });
    const gone = await rootQuery("select 1 from clara.knowledge_keys where knowledge_key = $1", [key]);
    assert.equal(gone.rowCount, 0, "the probe row must not have been left behind");
  });
});

cell("kg.03 clara.client_fact_keys refuses a key record_work_knowledge_read would also refuse", async (t) => {
  await t.test("hyphen", async () => {
    const err = await assertRaisesCheck(() => rootQuery(factRow("bad-key").text, factRow("bad-key").values));
    assert.equal(err.constraint, "ck_client_fact_keys_key_grammar");
  });
  await t.test("leading digit", async () => {
    const err = await assertRaisesCheck(() => rootQuery(factRow("1badkey").text, factRow("1badkey").values));
    assert.equal(err.constraint, "ck_client_fact_keys_key_grammar");
  });
});

/** Like assertRaises(PG.checkViolation, ...), but ALSO tolerates the harness's own pooled-client
 *  reset (a CHECK violation aborts the current implicit transaction; rootQuery's withActor always
 *  rolls back before releasing the client, so no probe row is ever left behind). */
async function assertRaisesCheck(fn) {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  if (!err) assert.fail("expected a CHECK violation but the insert SUCCEEDED");
  assert.equal(err.code, PG.checkViolation, `expected SQLSTATE ${PG.checkViolation} but got ${err.code ?? "(no code)"} -- ${err.message}`);
  return err;
}
