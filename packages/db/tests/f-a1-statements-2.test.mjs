// F-A1 (Wave-F Track A) PR-4 — THE STATEMENT WITNESS CUTOVER battery, PART 2 (cells e-j; a-d
// live in f-a1-statements.test.mjs — split purely to keep each file under the repo's 500-line
// gate, the x38-wave-c-b-bank.test.mjs / x38-wave-c-b-match.test.mjs precedent). Same design,
// same fixtures, same law: see f-a1-statements.test.mjs's header for the full reading list and
// the harness note on why every witness task also gets a direct processing_call_reservations
// row. NOT contract-blind for cells (i)/(j) (cross-regime dispatch + the ancestor's continued
// existence, read off the live catalog and 0038/0093); e/f/g/h are contract-blind (▣).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ROLES, rootQuery, roleQuery, endPool } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf, assertRaisesReason } from "./s6-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { factState, factStateAt } from "./f-a1-fixtures.mjs";
import { grantPurpose, activatePurpose, consentEvidenceDoc } from "./wave-b/wb-0020-helpers.mjs";
import {
  WITNESS_PURPOSE, f_a1sReady, registerAccount, ymBounds, witnessChain, stmtHeader,
  witnessReaders, agreeingWitnessPayload, filedStatementDoc, statementWitnessTask, persistV2,
  prepareDispatchSha, consumeDispatchSha,
} from "./f-a1-statements-fixtures.mjs";

const CLR10 = "CLR10";

let world = null;
let ready = false;

/** THE READINESS GATE, in the f-a1-walls idiom: absent -> FAIL LOUD, never `t.skip()`. */
function mustBeReady() {
  assert.ok(ready, "clara.persist_statement_facts_v2(uuid,jsonb) is not applied on this database (UNNUMBERED_f_a1_statements.sql is not in the chain) — this battery must FAIL, not skip, against a pre-cutover chain");
}

before(async () => {
  ready = await f_a1sReady();
  if (!ready) return;
  world = await buildWorld();
});
after(async () => {
  printLaneNotes("f-a1-statements-2");
  await endPool();
});

test("META: clara.persist_statement_facts_v2 is applied (part 2)", () => { mustBeReady(); });

// ===========================================================================
// f-a1s.e — TWO EGRESS DISPATCHES PER STATEMENT, BOTH SHA-BOUND (design §3.7: "the frozen v1
// body assumed one egressing reader"). The re-binding arm proves an authorization is bound to
// the DOCUMENT'S OWN bytes, not merely the (firm,client,purpose) triple.
// ===========================================================================

test("f-a1s.e two egress dispatches per statement, both sha-bound, and cross-document re-binding refuses", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);
  const evidence = await consentEvidenceDoc(sub, { firm });
  const grant = await grantPurpose(sub, { client, purpose: WITNESS_PURPOSE, evidenceDocument: evidence.documentId });
  assert.equal(grant.status, "live", `witness_extraction grant must succeed (got ${JSON.stringify(grant)})`);
  const activation = await activatePurpose(sub, { client, purpose: WITNESS_PURPOSE, consent: grant.consent_id });
  assert.equal(activation.status, "active", `witness_extraction activation must succeed (got ${JSON.stringify(activation)})`);

  const docA = await filedStatementDoc(sub, client);
  const docB = await filedStatementDoc(sub, client);

  const textDispatch = await prepareDispatchSha({ firm, client, documentSha256: docA.sha256, eventSeq: 101, eventType: "witness.statement.text" });
  assert.equal(textDispatch.verdict, "granted", `the TEXT channel dispatch must be granted (got ${JSON.stringify(textDispatch)})`);
  const visionDispatch = await prepareDispatchSha({ firm, client, documentSha256: docA.sha256, eventSeq: 102, eventType: "witness.statement.vision" });
  assert.equal(visionDispatch.verdict, "granted", `the VISION channel dispatch must be granted (got ${JSON.stringify(visionDispatch)})`);
  assert.notEqual(textDispatch.authorization_id, visionDispatch.authorization_id, "each channel mints its OWN authorization");

  const textConsumed = await consumeDispatchSha({ firm, authorization: textDispatch.authorization_id, client, documentSha256: docA.sha256, eventSeq: 101, eventType: "witness.statement.text" });
  assert.deepEqual(textConsumed, { verdict: "granted" }, `the TEXT authorization must consume against document A's own sha (got ${JSON.stringify(textConsumed)})`);
  const visionConsumed = await consumeDispatchSha({ firm, authorization: visionDispatch.authorization_id, client, documentSha256: docA.sha256, eventSeq: 102, eventType: "witness.statement.vision" });
  assert.deepEqual(visionConsumed, { verdict: "granted" }, `the VISION authorization must ALSO consume against document A's own sha (got ${JSON.stringify(visionConsumed)})`);

  const rows = (await rootQuery(
    `select id, purpose from clara.egress_dispatch_authorizations where id = any($1::uuid[])`,
    [[textDispatch.authorization_id, visionDispatch.authorization_id]])).rows;
  assert.equal(rows.length, 2, "both authorizations are real rows");
  for (const row of rows) assert.equal(row.purpose, WITNESS_PURPOSE, "both authorizations are stamped witness_extraction");

  // THE RE-BINDING ARM: an authorization minted for document A's bytes cannot consume against B's.
  const thirdDispatch = await prepareDispatchSha({ firm, client, documentSha256: docA.sha256, eventSeq: 103, eventType: "witness.statement.rebind" });
  assert.equal(thirdDispatch.verdict, "granted");
  const wrongDoc = await consumeDispatchSha({ firm, authorization: thirdDispatch.authorization_id, client, documentSha256: docB.sha256, eventSeq: 103, eventType: "witness.statement.rebind" });
  assert.deepEqual(wrongDoc, { verdict: "unknown" }, `an authorization minted for document A's sha must refuse against document B's (got ${JSON.stringify(wrongDoc)})`);
});

// ===========================================================================
// f-a1s.f — DESCRIPTIONS ARE NEVER LOAD-BEARING (design §3.7). A description mismatch must
// never trigger readers_disagree — the skeleton compare strips `description` first (0038:1521-
// 1528). What actually gets PERSISTED and hashed is read from the live core (0038:1536-1555):
// the merge always takes reader2's description, discarding reader1's — verified positively
// against clara._hash itself, so this cell states precisely what "never load-bearing" means.
// ===========================================================================

test("f-a1s.f descriptions are never load-bearing: wildly differing/null line descriptions never trigger readers_disagree, and reader1's own text never reaches facts_hash", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);
  const acct = await registerAccount(sub, client);
  const { periodStart, periodEnd } = ymBounds(2026, 4);
  const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
  const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });

  const withDesc = (lines, descs) => lines.map((l, i) => ({ ...l, description: descs[i] }));
  const l1 = withDesc(ch.lines, ["utterly different prose A", null, "emoji nonsense that never matches"]);
  const l2 = withDesc(ch.lines, [null, "utterly different prose B", "THE REAL VISION READING, line 3"]);

  const doc = await filedStatementDoc(sub, client);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const r = await persistV2(taskId, witnessReaders(engineId, h, l1, h, l2));
  assert.equal(r.status, "done", `a description mismatch (wildly different, and null on one side) must NEVER refuse (got ${JSON.stringify(r)})`);

  const persistedLines = (await rootQuery(
    "select line_no, description from clara.bank_statement_lines where statement_id=$1 order by line_no",
    [r.statement_id])).rows;
  assert.deepEqual(persistedLines.map((x) => x.description), l2.map((x) => x.description),
    "the persisted description is reader2's (VISION) text — reader1's is discarded (0038:1546-1553)");

  const stmtRow = (await rootQuery("select facts_hash from clara.bank_statements where id=$1", [r.statement_id])).rows[0];

  // Re-derive the EXACT hash the core computed from the live normalizers + clara._hash itself
  // (root bypasses the ungranted-to-public revoke, as the migration's own tail census does) —
  // never by re-typing the merge rule as a guess.
  const normHeader = (await rootQuery("select clara._stmt_header_norm($1::jsonb) as h", [h])).rows[0].h;
  const normLines1 = (await rootQuery("select clara._stmt_lines_norm($1::jsonb) as l", [JSON.stringify(l1)])).rows[0].l;
  const merged = normLines1.map((line, i) => ({ ...line, description: l2[i].description ?? null }));
  const expected = (await rootQuery("select clara._hash($1::jsonb) as h", [JSON.stringify({ header: normHeader, lines: merged })])).rows[0].h;
  assert.equal(stmtRow.facts_hash.toString("hex"), expected.toString("hex"),
    "facts_hash = sha256({header, lines}) where each line's description is OVERWRITTEN by reader2's — reader1's text is provably never load-bearing for the hash, but reader2's DOES enter it (a real asymmetry, not a bug: 'never load-bearing' means never GATES a refusal, not that either channel is interchangeable in what gets stored)");

  noteLane("f-a1s.f: bank_statements.facts_hash embeds reader2's (vision) description text, never reader1's — verified positively against clara._hash.");
});

// ===========================================================================
// f-a1s.g — THE REPOINTED READER COLUMNS RESOLVE (design §3.7). reader1 -> TEXT, reader2 ->
// VISION, both FK-valid, both scoped to the SAME document+firm, and ingest_mode='witness'.
// ===========================================================================

test("f-a1s.g the repointed reader columns resolve: reader1->TEXT, reader2->VISION, both FK-valid same document+firm, and ingest_mode='witness'", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);
  const acct = await registerAccount(sub, client);
  const { periodStart, periodEnd } = ymBounds(2026, 4);
  const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
  const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
  const doc = await filedStatementDoc(sub, client);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const r = await persistV2(taskId, agreeingWitnessPayload(engineId, h, ch));
  assert.equal(r.status, "done");

  const stmt = (await rootQuery(
    `select s.reader1_extraction_id, s.reader2_extraction_id, s.ingest_mode, s.firm_id, s.document_id
       from clara.bank_statements s where s.id=$1`, [r.statement_id])).rows[0];
  assert.equal(stmt.ingest_mode, "witness", `ingest_mode must be 'witness' (got ${stmt.ingest_mode})`);

  const extRows = (await rootQuery(
    `select id, engine_kind, firm_id, document_id from clara.document_extractions where id = any($1::uuid[])`,
    [[stmt.reader1_extraction_id, stmt.reader2_extraction_id]])).rows;
  const byId = (id) => extRows.find((x) => x.id === id);
  const r1 = byId(stmt.reader1_extraction_id); const r2 = byId(stmt.reader2_extraction_id);
  assert.ok(r1 && r2, "both reader ids are real, FK-valid document_extractions rows");
  assert.equal(r1.engine_kind, "llm_text_facts", "reader1_extraction_id resolves to the TEXT kind");
  assert.equal(r2.engine_kind, "llm_vision_facts", "reader2_extraction_id resolves to the VISION kind");
  for (const row of [r1, r2]) {
    assert.equal(row.firm_id, stmt.firm_id, "same firm as the statement");
    assert.equal(row.document_id, stmt.document_id, "same document as the statement");
  }
});

// ===========================================================================
// f-a1s.h — RE-RUN / REPLAY DISCIPLINE: NO SECOND PATH. A re-run must never mint a second live
// statement for a document that already has one, and a different document must never steal a
// (account,period_end) another document already holds live.
// ===========================================================================

test("f-a1s.h re-run discipline: a re-persist against a DONE task replays; a different document claiming the same period refuses duplicate_period; facts are never swapped", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);
  const acct = await registerAccount(sub, client);
  const { periodStart, periodEnd } = ymBounds(2026, 4);
  const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
  const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
  const doc = await filedStatementDoc(sub, client);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const first = await persistV2(taskId, agreeingWitnessPayload(engineId, h, ch));
  assert.equal(first.status, "done");

  const before_ = (await rootQuery("select reader1_extraction_id, reader2_extraction_id, facts_hash from clara.bank_statements where id=$1", [first.statement_id])).rows[0];
  const extCountBefore = (await rootQuery("select count(*)::int as n from clara.document_extractions where document_id=$1", [doc.documentId])).rows[0].n;

  // Same task, called again: the task is now 'done' -- must replay, never duplicate_period.
  const replay = await persistV2(taskId, agreeingWitnessPayload(engineId, h, ch));
  assert.equal(replay.replayed, true, `a re-persist against a done task must return replayed:true, never duplicate_period (got ${JSON.stringify(replay)})`);
  assert.equal(replay.statement_id, first.statement_id);

  const after = (await rootQuery("select reader1_extraction_id, reader2_extraction_id, facts_hash from clara.bank_statements where id=$1", [first.statement_id])).rows[0];
  assert.equal(after.reader1_extraction_id, before_.reader1_extraction_id, "facts are never swapped under a live statement");
  assert.equal(after.reader2_extraction_id, before_.reader2_extraction_id);
  assert.equal(after.facts_hash.toString("hex"), before_.facts_hash.toString("hex"));
  const extCountAfter = (await rootQuery("select count(*)::int as n from clara.document_extractions where document_id=$1", [doc.documentId])).rows[0].n;
  assert.equal(extCountAfter, extCountBefore, "no second insert on replay");

  // A DIFFERENT document claiming the SAME (account, period_end) refuses duplicate_period.
  const doc2 = await filedStatementDoc(sub, client);
  const { taskId: taskId2, engineId: engineId2 } = await statementWitnessTask(firm, doc2.documentId);
  await assertRaisesReason(CLR10, "duplicate_period",
    () => persistV2(taskId2, agreeingWitnessPayload(engineId2, h, ch)),
    "f-a1s.h a different document claiming the same live period");
});

// ===========================================================================
// f-a1s.i — THE CROSS-REGIME FAIL-CLOSED CELL. The statement envelope carries
// `statement_witness`, NEVER a bare `witness` key (this PR's section 3(d), 0038-successor:463-
// 470), and the 1-arg cross-regime dispatcher keys the witness scan on `t.lane = 'llm_witness'`
// (0093:255-263) — this task's lane is `statement_facts`. Both halves stop a statement pair
// from ever being read as invoice corroboration.
// ===========================================================================

test("f-a1s.i the statement pair cannot be read as invoice corroboration: the 1-arg dispatcher never scans it, and the 2-arg pinned overload fails closed", async () => {
  mustBeReady();
  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);
  const acct = await registerAccount(sub, client);
  const { periodStart, periodEnd } = ymBounds(2026, 4);
  const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
  const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
  const doc = await filedStatementDoc(sub, client);
  const { taskId, engineId } = await statementWitnessTask(firm, doc.documentId);
  const r = await persistV2(taskId, agreeingWitnessPayload(engineId, h, ch));
  assert.equal(r.status, "done");

  // (i) the 1-arg cross-regime dispatcher scans lane='llm_witness'; this task's lane is
  // 'statement_facts', so it carries NO corroboration through this door at all.
  const cross = await factState(doc.documentId);
  assert.deepEqual(cross, {}, `_invoice_fact_state must resolve NO corroboration for a statement-lane document (got ${JSON.stringify(cross)})`);

  // (ii) the 2-arg pinned overload FAILS CLOSED even bound directly to the statement's own TEXT
  // row: it finds the vision sibling by (engine_id,version_n) — regardless of lane — and calls
  // the SAME predicate the invoice regime uses, but the envelope carries 'statement_witness',
  // never a bare 'witness' key, so the predicate reads no answers at all.
  const at = await factStateAt(doc.documentId, r.reader1_extraction_id);
  assert.notEqual(at?.corroborated, true, `_invoice_fact_state_at bound to the statement's TEXT row must NOT report corroborated:true (got ${JSON.stringify(at)})`);
});

// ===========================================================================
// f-a1s.j — THE ANCESTOR IS UNMOVED. `clara._persist_statement_core` must remain byte-untouched
// and the ORIGINAL `clara.persist_statement_facts` must still serve the structured
// (`statement_parse`) lane end-to-end — the one lane this cutover does NOT touch.
// ===========================================================================

test("f-a1s.j the ancestor is unmoved BY ITS BYTES: clara._persist_statement_core's prosrc sha is the pinned 0038+0039+0040 one, and the ORIGINAL clara.persist_statement_facts still serves the structured (statement_parse) lane end-to-end", async () => {
  mustBeReady();
  const sig = "clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)";
  const stillThere = (await rootQuery("select to_regprocedure($1) is not null as ok", [sig])).rows[0].ok;
  assert.ok(stillThere, "clara._persist_statement_core must still exist — the ancestor is byte-untouched, never replaced by the v2 successor");

  // BYTE-UNTOUCHED IS A CLAIM ABOUT BYTES, so the cell reads bytes. Existence alone would pass
  // against an ancestor the cutover had quietly recut — the exact failure the migration's own
  // tail census refuses to make (its note there records why grepping the body for a WORD is not
  // evidence: 0039's spliced prose already says "balance witness"). The migration pins this sha
  // in its prestate and re-checks it in its tail, which proves the ancestor did not move DURING
  // the apply; this pin proves it has not moved SINCE, on any database the battery runs against.
  //
  // THE LITERAL is the sha256 of the LIVE prosrc after 0038 (birth) + 0039 (the
  // null-defers-to-chain splice) + 0040 (the recon_frontier_backfill splice), measured on a
  // clean 0001..0095 chain. RE-PIN IT ONLY for a migration that DELIBERATELY re-splices this
  // body — and then the re-pin belongs in that migration's own PR, with its own tail evidence.
  // A mismatch here on any other PR is a FINDING, never a test edit.
  const ANCESTOR_PROSRC_SHA256 = "13b78739ef941d69f3403bd3b37f7f7e1684b783b7d1310a8a4977f409a6821b";
  const live = (await rootQuery(
    `select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') as sha
       from pg_proc p where p.oid = $1::regprocedure`, [sig])).rows[0].sha;
  assert.equal(live, ANCESTOR_PROSRC_SHA256,
    `clara._persist_statement_core's body CHANGED — it must stay byte-untouched for the structured (statement_parse) and human (enter_bank_statement) lanes this cutover does not touch (live sha ${live})`);

  const sub = world.users.alice; const client = world.clients.A1;
  const firm = await firmOf(client);
  const acct = await registerAccount(sub, client);
  const { periodStart, periodEnd } = ymBounds(2026, 4);
  const ch = witnessChain(periodStart, periodEnd, 100000, [50000, -20000, 30000]);
  const h = stmtHeader({ accountDigits: acct.digits, periodStart, periodEnd, ch });
  const doc = await filedStatementDoc(sub, client);

  // A structured-lane task: engine_id matches the 'clara-statement-%' prefix the lane<->engine
  // CHECK requires for lane='statement_parse'; a SINGLE reader (reader2 omitted — WC-R7: the
  // CHAIN is the second reader on this lane, 0038:1456-1460). No processing-call reservation is
  // needed: v1's wrapper settles the page budget only `if t.lane = 'statement_facts'`
  // (0038:2011-2013).
  // the lane<->engine prefix CHECK wants 'clara-statement-%' (HYPHEN, not a colon).
  const engineId = `clara-statement-csv-${randomUUID().slice(0, 8)}`;
  const r0 = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
       status,workflow_run_id,started_at)
     values($1,$2,$3,1,'statement_parse','running',$4,now()) returning id`,
    [firm, doc.documentId, engineId, `rig-stmtstruct-${randomUUID().slice(0, 8)}`]);
  const taskId = r0.rows[0].id;

  const payload = { pages_used: 1, readers: { reader1: { engine_id: engineId, header: h, lines: ch.lines.map((l) => ({ ...l })) } } };
  const r = await roleQuery(ROLES.runtime,
    "select clara.persist_statement_facts(p_task => $1, p_payload => $2::jsonb) as r",
    [taskId, JSON.stringify(payload)]);
  const result = r.rows[0].r;
  assert.equal(result.status, "done", `the structured-lane persist must succeed end-to-end through the ORIGINAL clara.persist_statement_facts (got ${JSON.stringify(result)})`);

  const stmtRow = (await rootQuery("select ingest_mode from clara.bank_statements where id=$1", [result.statement_id])).rows[0];
  assert.equal(stmtRow.ingest_mode, "structured", `a statement_parse-lane persist through the v1 wrapper must land with ingest_mode='structured' (got ${stmtRow.ingest_mode})`);
});
