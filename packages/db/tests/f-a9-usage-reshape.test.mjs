// F-A9 PR-1A — the ledger reshape, the second door, the seeded price table, the spend
// evaluator and the monthly rollup. Design of record: docs/plan/active/metering-design.md
// v2 §§3.1/3.2/3.5/3.6/3.7; Annex C cells C.1-C.8, C.14, C.19, C.21; plus the unpriced
// tripwire cell the orchestrator required (an unseeded engine stamp reads unpriced, and
// the same stamp reads priced once its row is seeded).
//
// WHAT THIS FILE DELIBERATELY DOES NOT RE-PROVE. The second live writer,
// clara.persist_witness_facts, keeps working through the reshape — and the proof of that
// is `f-a1-writer.test.mjs`, a contract-blind battery written BEFORE this change that
// drives the real writer end to end and asserts its usage rows. A cell here that re-drove
// the same verb would be this lane marking its own homework; the F-A1 battery passing
// unchanged against the reshaped table is the stronger evidence, and the estate run is
// where it is collected.
//
// Cells are contract-blind where the contract allows: they assert the DOCUMENTED behaviour
// (a refusal, a computed number, a default) and never a today-only implementation detail.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool, humanQuery, asRoot, assertRaises, CLR, PG } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf, filedDocument } from "./s6-helpers.mjs";

let world = null;
let live = false;

// The EXACT probe string the two live frozen closures use (witnessFacts.v1.dispatch.mjs:86,
// imported unchanged by witnessFacts_v2; statementFacts.v2.dispatch.mjs:68). Written out
// character for character on purpose: a function's identity in Postgres IS this string, so
// a paraphrase would prove nothing about the hazard Annex A D2 refused.
const FROZEN_PROBE =
  "clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)";
const NEW_DOOR =
  "clara.record_agent_usage_event(uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,text,int,int,int)";

before(async () => {
  world = await buildWorld();
  live = (await rootQuery(
    `select exists (select 1 from pg_attribute
                     where attrelid = to_regclass('clara.llm_usage_events')
                       and attname = 'call_kind' and not attisdropped)
        and to_regprocedure($1) is not null
        and to_regclass('clara.llm_price_table') is not null
        and to_regclass('clara.llm_usage_events_priced') is not null as ok`,
    [NEW_DOOR],
  )).rows[0].ok;
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("F-A9 PR-1A not applied — clara.llm_usage_events.call_kind absent"); return true; }
  return false;
};

// ---------------------------------------------------------------------------------------
// Fixtures. Each THROWS on construction failure — a fixture that silently returns nothing
// turns every cell built on it into a vacuous pass.
// ---------------------------------------------------------------------------------------

/** A document_processing_task on a freshly filed document of `client`. The engine id is
 *  randomised because filing a document already mints an llm_witness task at the LIVE
 *  witness engine stamp (0102's activation), and
 *  uq_document_processing_tasks_doc_engine_version_lane would refuse a second one. */
async function extractionTask(sub, client) {
  const firm = await firmOf(client);
  if (!firm) throw new Error("fixture: firmOf(client) returned nothing");
  const doc = await filedDocument(sub, { firm, client, kind: "invoice" });
  if (!doc?.documentId) throw new Error("fixture: filedDocument returned no documentId");
  const engineId = `llm-openai:gpt-5.6-terra:rig-${randomUUID().slice(0, 8)}`;
  const r = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
       status,workflow_run_id,started_at)
     values($1,$2,$3,1,'llm_witness','running',$4,now()) returning id`,
    [firm, doc.documentId, engineId, `rig-f-a9-${randomUUID().slice(0, 8)}`],
  );
  if (!r.rows[0]?.id) throw new Error("fixture: document_processing_tasks insert returned no id");
  return { firm, documentId: doc.documentId, taskId: r.rows[0].id, engineId };
}

/** A queued chat agent_task authored by `createdBy`, optionally bound to `client`.
 *  clara._tf_agent_task_insert DERIVES firm_id/client_id from the session and refuses a
 *  chat_turn task with no session, so the session is built first — through the real
 *  shape, not around it. Returns the task's id AND the firm the trigger stamped. */
async function agentTask(createdBy, client = null) {
  const s = await rootQuery(
    `insert into clara.chat_sessions(created_by, client_id, visibility)
     values($1,$2,'private') returning id, firm_id`,
    [createdBy, client],
  );
  if (!s.rows[0]?.id) throw new Error("fixture: chat_sessions insert returned no id");
  const r = await rootQuery(
    `insert into clara.agent_tasks(kind, session_id, status, created_by, turn_key)
     values('chat_turn',$1,'queued',$2,$3) returning id, firm_id`,
    [s.rows[0].id, createdBy, `rig-f-a9-${randomUUID().slice(0, 8)}`],
  );
  if (!r.rows[0]?.id) throw new Error("fixture: agent_tasks insert returned no id");
  return { id: r.rows[0].id, firm: r.rows[0].firm_id };
}

const usageRow = async (id) =>
  (await rootQuery(
    `select call_kind, client_id, triggering_actor, agent_task_id, via_wake_kind,
            document_id, task_id, channel, engine_id, input_tokens, output_tokens, outcome
       from clara.llm_usage_events where id = $1`, [id])).rows[0] ?? null;

// ---------------------------------------------------------------------------------------
// C.1 / C.2 — the OLD verb is untouched. These two cells are the whole no-D1 claim from the
// consumer's side: the door two frozen closures already call must still exist, still
// resolve under its exact identity string, and still produce a correctly-kinded row.
// ---------------------------------------------------------------------------------------

test("f-a9.C1 the unchanged 10-arg verb still inserts, and its row takes call_kind='document_extraction' by column default", async (t) => {
  if (gate(t)) return;
  const { firm, documentId, taskId, engineId } = await extractionTask(world.users.alice, world.clients.A1);
  const id = (await rootQuery(
    `select clara.record_llm_usage_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id`,
    [firm, documentId, taskId, "text", engineId, "sha-f-a9-c1", 1000, 500, 42, "success"],
  )).rows[0].id;
  const row = await usageRow(id);
  assert.ok(row, "the 10-arg verb did not produce a readable row");
  assert.equal(row.call_kind, "document_extraction",
    "a row from the legacy verb must take the column DEFAULT — its two live callers are exactly this kind");
  // The five new columns are NULL for a legacy row: the verb's INSERT never names them,
  // which is precisely why its body needed no change.
  for (const col of ["client_id", "triggering_actor", "agent_task_id", "via_wake_kind"]) {
    assert.equal(row[col], null, `${col} must be NULL on a legacy row`);
  }
  assert.equal(row.channel, "text");
  assert.equal(row.input_tokens, 1000);
});

test("f-a9.C2 the frozen closures' to_regprocedure probe string still resolves after the reshape", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery("select to_regprocedure($1) is not null as ok", [FROZEN_PROBE]);
  assert.equal(r.rows[0].ok, true,
    `the exact identity string the frozen dispatch closures probe (${FROZEN_PROBE}) no longer resolves — `
    + "widening the old verb's signature is the hazard Annex A D2 refused, and this is what it looks like");
});

// ---------------------------------------------------------------------------------------
// C.3-C.7 — the NEW door's walls. Every negative cell asserts a NAMED refusal; a cell that
// merely observed "it did not insert" would pass for the wrong reason on a typo.
// ---------------------------------------------------------------------------------------

test("f-a9.C3 record_agent_usage_event REFUSES call_kind='document_extraction' (one call-kind, one door)", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.A;
  await assertRaises(CLR.badRequest, () => rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'document_extraction',
       p_engine_id => 'rig', p_outcome => 'success')`, [firm]),
  "record_agent_usage_event(document_extraction)");
});

test("f-a9.C4 a p_client from ANOTHER firm is refused by the composite (client_id, firm_id) FK", async (t) => {
  if (gate(t)) return;
  await assertRaises(PG.foreignKeyViolation, () => rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'chat',
       p_engine_id => 'rig', p_outcome => 'success', p_client => $2)`,
    [world.firms.A, world.clients.B1]),
  "record_agent_usage_event with firm A and client B1");
  // Positive control: the SAME call with the firm's OWN client succeeds. Without this, the
  // refusal above could be a broken call rather than a working wall.
  const ok = (await rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'chat',
       p_engine_id => 'rig', p_outcome => 'success', p_client => $2) as id`,
    [world.firms.A, world.clients.A1])).rows[0].id;
  assert.ok(ok, "the positive control did not record");
  assert.equal((await usageRow(ok)).client_id, world.clients.A1);
});

test("f-a9.firm a row naming a firm that does not exist is REFUSED — the binding the two relaxed composite FKs used to carry", async (t) => {
  if (gate(t)) return;
  // Before the reshape, firm_id needed no FK of its own: both composite FKs were NOT NULL,
  // so every row's firm was transitively bound. Relaxing them unbinds a non-extraction
  // row's firm entirely, and this ledger is append-only — a row naming a firm that does
  // not exist could never be corrected, and would be invisible to RLS and to every rollup.
  await assertRaises(PG.foreignKeyViolation, () => rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'chat',
       p_engine_id => 'rig', p_outcome => 'success')`, [randomUUID()]),
  "record_agent_usage_event naming a non-existent firm");
  await assertRaises(PG.foreignKeyViolation, () => rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome)
     values($1,'chat','rig','success')`, [randomUUID()]),
  "a direct INSERT naming a non-existent firm");
});

test("f-a9.C5 a p_agent_task belonging to ANOTHER firm is refused by the writer's positive read", async (t) => {
  if (gate(t)) return;
  const foreign = await agentTask(world.users.dave);
  assert.equal(foreign.firm, world.firms.B, "fixture: the foreign task must really be firm B's");
  await assertRaises(CLR.badRequest, () => rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'chat',
       p_engine_id => 'rig', p_outcome => 'success', p_agent_task => $2)`,
    [world.firms.A, foreign.id]),
  "record_agent_usage_event naming firm B's agent task under firm A");
  // A task that does not exist at all falls through the SAME refusal — absence is not
  // evidence, and a read that cannot say NO would have a meaningless YES.
  await assertRaises(CLR.badRequest, () => rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'chat',
       p_engine_id => 'rig', p_outcome => 'success', p_agent_task => $2)`,
    [world.firms.A, randomUUID()]),
  "record_agent_usage_event naming a non-existent agent task");
});

test("f-a9.C6 a triggering actor who is not a live ACTIVE member of the firm is refused", async (t) => {
  if (gate(t)) return;
  // dave is firm B's owner and holds no membership in firm A.
  await assertRaises(CLR.authz, () => rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'chat',
       p_engine_id => 'rig', p_outcome => 'success', p_triggering_actor => $2)`,
    [world.firms.A, world.users.dave]),
  "record_agent_usage_event naming a non-member as the triggering actor");
  // Positive control: bob IS an active member of firm A.
  const ok = (await rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'chat',
       p_engine_id => 'rig', p_outcome => 'success', p_triggering_actor => $2) as id`,
    [world.firms.A, world.users.bob])).rows[0].id;
  assert.equal((await usageRow(ok)).triggering_actor, world.users.bob);
});

test("f-a9.C7 a chat row with NULL document_id / task_id / channel and an agent_task INSERTS cleanly", async (t) => {
  if (gate(t)) return;
  const task = await agentTask(world.users.bob, world.clients.A1);
  assert.equal(task.firm, world.firms.A, "fixture: bob's session must be firm A's");
  const id = (await rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'chat',
       p_engine_id => 'gpt-5.6-terra', p_outcome => 'success', p_client => $2,
       p_agent_task => $3, p_triggering_actor => $4, p_via_wake_kind => 'interactive',
       p_input_tokens => 700, p_output_tokens => 300, p_duration_ms => 1200) as id`,
    [world.firms.A, world.clients.A1, task.id, world.users.bob])).rows[0].id;
  const row = await usageRow(id);
  assert.equal(row.call_kind, "chat");
  assert.equal(row.document_id, null, "a chat call has no document");
  assert.equal(row.task_id, null, "a chat call has no document_processing_task");
  assert.equal(row.channel, null, "a chat call has no text/vision channel");
  assert.equal(row.agent_task_id, task.id);
  assert.equal(row.client_id, world.clients.A1);
  assert.equal(row.via_wake_kind, "interactive");
});

// ---------------------------------------------------------------------------------------
// C.8 — the extraction-shape wall. THE cell of the reshape: relaxing three NOT NULLs
// removed a safety net the original author's own comment relied on, and this is the
// replacement saying NO on exactly that case.
// ---------------------------------------------------------------------------------------

test("f-a9.C8 the extraction-shape wall REFUSES a document_extraction row missing its channel/document/task", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.A;
  await assertRaises(PG.checkViolation, () => rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome)
     values($1,'document_extraction','rig','success')`, [firm]),
  "a document_extraction row with no document, task or channel");
  // And the same row under any OTHER kind is fine — the wall is call-kind-scoped, which is
  // the entire point of the reshape.
  const ok = await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome)
     values($1,'reporting','rig','success') returning id`, [firm]);
  assert.ok(ok.rows[0].id, "a non-extraction kind must be free of the extraction shape");
});

test("f-a9.C8b an UNREGISTERED call_kind is refused by the roster CHECK — a lane that forgets to register fails loudly", async (t) => {
  if (gate(t)) return;
  await assertRaises(PG.checkViolation, () => rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome)
     values($1,'a_kind_nobody_registered','rig','success')`, [world.firms.A]),
  "an unregistered call_kind");
});

// ---------------------------------------------------------------------------------------
// The price table and the evaluator.
// ---------------------------------------------------------------------------------------

test("f-a9.seed the five seeded price rows carry the published rates, their source URL and their fetch date", async (t) => {
  if (gate(t)) return;
  // Scoped to the SEEDED rows by their citation, not to the whole table: other cells in
  // this file (and in the estate run) stage rig price rows, and a global count would then
  // be measuring the rig rather than the seed.
  const r = await rootQuery(
    `select engine_id, effective_from::text as ef, effective_to::text as et, currency,
            input_price_cents_per_million_tokens as inp, output_price_cents_per_million_tokens as outp,
            source_note, source_urls
       from clara.llm_price_table
      where source_urls @> '["https://developers.openai.com/api/docs/pricing"]'::jsonb
      order by engine_id`);
  const byEngine = Object.fromEntries(r.rows.map((x) => [x.engine_id, x]));
  const terraStamps = [
    "gpt-5.6-terra",
    "llm-openai:gpt-5.6-terra:v1",
    "llm-openai:gpt-5.6-terra:v2",
    "llm-openai:gpt-5.6-terra:stmt-witness-v1",
  ];
  for (const e of terraStamps) {
    const row = byEngine[e];
    assert.ok(row, `no seeded price row for ${e}`);
    assert.equal(Number(row.inp), 200, `${e} input rate`);   // $2.00 / 1M tokens
    assert.equal(Number(row.outp), 1200, `${e} output rate`); // $12.00 / 1M tokens
    assert.equal(row.et, null, `${e} must be the open-ended row`);
  }
  const sol = byEngine["gpt-5.6-sol"];
  assert.ok(sol, "no seeded price row for gpt-5.6-sol");
  assert.equal(Number(sol.inp), 400);
  assert.equal(Number(sol.outp), 2000);
  assert.equal(sol.et, "2026-11-21",
    "the sol row must CLOSE at the published promotional guarantee — a rate past it is unknown, not carried forward");
  for (const row of r.rows) {
    assert.equal(row.currency, "USD");
    assert.equal(row.ef, "2026-08-23", "effective_from is the day the page was read, never a backdated guess");
    assert.match(row.source_note, /fetched 2026-08-23/, "every row's source_note must carry the fetch date");
    assert.match(row.source_note, /SHORT CONTEXT|short-context|SHORT-CONTEXT/,
      "every row's source_note must name the tier it prices, so the long-context understatement is visible");
    assert.deepEqual(row.source_urls, ["https://developers.openai.com/api/docs/pricing"]);
  }
  assert.equal(r.rows.length, 5, "the seed is exactly five rows");
});

test("f-a9.C14 a usage row in a GAP between two price rows computes spend_cents IS NULL — never the nearest neighbour's rate", async (t) => {
  if (gate(t)) return;
  const engine = `rig-gap-${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-01-01', date '2026-01-31', 100, 100, 'rig gap fixture, lower'),
            ($1, date '2026-03-01', null,             900, 900, 'rig gap fixture, upper')`, [engine]);
  const mk = async (whenUtc) => (await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome,
        input_tokens, output_tokens, created_at)
     values($1,'chat',$2,'success',1000000,1000000,$3) returning id`,
    [world.firms.A, engine, whenUtc])).rows[0].id;
  const spendOf = async (id) => (await rootQuery(
    "select spend_cents from clara.llm_usage_events_priced where id = $1", [id])).rows[0].spend_cents;

  const inGap = await mk("2026-02-15T03:00:00Z");
  assert.equal(await spendOf(inGap), null,
    "a call in a price GAP must read unpriced — never zero, never the nearest row's rate");
  // Positive controls on BOTH sides of the gap: without them, a NULL above could mean the
  // evaluator is simply broken for this engine.
  const below = await mk("2026-01-15T03:00:00Z");
  assert.equal(Number(await spendOf(below)), 200, "1M+1M at 100c/1M each = 200 cents");
  const above = await mk("2026-03-15T03:00:00Z");
  assert.equal(Number(await spendOf(above)), 1800, "1M+1M at 900c/1M each = 1800 cents");
});

test("f-a9.C21 the evaluator returns an IDENTICAL spend_cents under five hostile session TimeZones", async (t) => {
  if (gate(t)) return;
  const engine = `rig-tz-${randomUUID().slice(0, 8)}`;
  // A price that CHANGES on 2026-09-01 UTC, and a call at 2026-09-01 03:00 UTC — which is
  // 2026-08-31 in a western zone and 2026-09-01 in Asia/Kuala_Lumpur. A session-TimeZone
  // -dependent join gives two different money numbers here with no error anywhere.
  await rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-08-01', date '2026-08-31', 100, 100, 'rig tz fixture, august'),
            ($1, date '2026-09-01', null,             900, 900, 'rig tz fixture, september')`, [engine]);
  const id = (await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome,
        input_tokens, output_tokens, created_at)
     values($1,'chat',$2,'success',1000000,1000000, timestamptz '2026-09-01 03:00:00+00') returning id`,
    [world.firms.A, engine])).rows[0].id;
  const seen = [];
  for (const zone of ["UTC", "Asia/Kuala_Lumpur", "America/Los_Angeles", "Pacific/Kiritimati", "Etc/GMT+12"]) {
    const v = await asRoot(async (c) => {
      await c.query(`set time zone '${zone}'`);
      const r = await c.query("select spend_cents from clara.llm_usage_events_priced where id = $1", [id]);
      return r.rows[0].spend_cents;
    });
    seen.push([zone, v === null ? null : Number(v)]);
  }
  const distinct = new Set(seen.map(([, v]) => String(v)));
  assert.equal(distinct.size, 1,
    `the evaluator is session-TimeZone dependent — one boundary-day call priced differently per zone: ${JSON.stringify(seen)}`);
  assert.equal(seen[0][1], 1800,
    "the UTC-anchored join must price a 03:00Z call on 2026-09-01 against SEPTEMBER's row (1M+1M at 900c/1M = 1800c)");
});

// ---------------------------------------------------------------------------------------
// The rollup: its firm wall, and the unpriced tripwire.
// ---------------------------------------------------------------------------------------

test("f-a9.C19 get_llm_usage_summary REFUSES a foreign p_firm and returns the caller's own firm's rows", async (t) => {
  if (gate(t)) return;
  // dave is firm B's owner; naming firm A's id must be refused, not silently narrowed.
  await assertRaises(CLR.notFound, () => humanQuery(
    world.users.dave, "select * from clara.get_llm_usage_summary($1, date '2026-08-01')", [world.firms.A]),
  "firm B's owner naming firm A's id");
  // Positive control on the same instrument: firm B's own call SUCCEEDS. A refusal cell
  // whose instrument cannot also say YES proves nothing about the wall.
  const engine = `rig-roll-${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-08-01', null, 100, 100, 'rig rollup fixture')`, [engine]);
  await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome,
        input_tokens, output_tokens, created_at)
     values($1,'freeform_read',$2,'success',1000000,1000000, timestamptz '2026-08-15 03:00:00+00')`,
    [world.firms.B, engine]);
  const r = await humanQuery(
    world.users.dave, "select * from clara.get_llm_usage_summary($1, date '2026-08-01')", [world.firms.B]);
  const row = r.rows.find((x) => x.call_kind === "freeform_read");
  assert.ok(row, "firm B's own summary did not return the row it just recorded");
  assert.equal(Number(row.calls), 1);
  assert.equal(Number(row.spend_cents), 200);
  assert.equal(Number(row.priced_calls), 1);
  assert.equal(Number(row.unpriced_calls), 0);
});

test("f-a9.tripwire an UNSEEDED engine stamp publishes as UNPRICED, and reads priced once its row is seeded", async (t) => {
  if (gate(t)) return;
  // Firm S is untouched by the other cells, so its month is a clean instrument.
  const engine = `rig-unseeded-${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome,
        input_tokens, output_tokens, created_at)
     values($1,'web_fetch',$2,'success',1000000,1000000, timestamptz '2026-07-15 03:00:00+00')`,
    [world.firms.S, engine]);
  const read = async () => {
    const r = await humanQuery(
      world.users.erin, "select * from clara.get_llm_usage_summary($1, date '2026-07-01')", [world.firms.S]);
    return r.rows.find((x) => x.call_kind === "web_fetch") ?? null;
  };

  const before_ = await read();
  assert.ok(before_, "the rollup did not return the unpriced row at all — an unpriced call must still be COUNTED");
  assert.equal(Number(before_.unpriced_calls), 1, "the unpriced count is the tripwire and must read non-zero");
  assert.equal(Number(before_.priced_calls), 0);
  assert.equal(Number(before_.spend_cents), 0, "an unpriced call contributes no spend — and says so via the unpriced count");

  await rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-07-01', null, 200, 1200, 'rig tripwire fixture')`, [engine]);

  const after_ = await read();
  assert.equal(Number(after_.unpriced_calls), 0, "the tripwire must clear once the day has an effective price row");
  assert.equal(Number(after_.priced_calls), 1);
  assert.equal(Number(after_.spend_cents), 1400, "1M input @200c/1M + 1M output @1200c/1M = 1400 cents");
});

test("f-a9.resolve a legacy extraction row's client is resolved at READ time through its ACTIVE filing, and a stored client_id wins", async (t) => {
  if (gate(t)) return;
  // The design resolves this through "documents.client_id (0003:67)" — a column that no
  // longer exists on the live table. The live surface is clara.document_filings, which is
  // one-to-many, so this cell is the proof of the substituted join and of its fail-closed
  // reading (exactly one active filing resolves; anything else stays unattributed).
  const engine = `rig-resolve-${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-06-01', null, 100, 100, 'rig resolve fixture')`, [engine]);
  const { firm, documentId, taskId } = await extractionTask(world.users.alice, world.clients.A1);
  await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, document_id, task_id, channel,
        engine_id, outcome, input_tokens, output_tokens, created_at)
     values($1,'document_extraction',$2,$3,'text',$4,'success',1000000,1000000,
            timestamptz '2026-06-15 03:00:00+00')`,
    [firm, documentId, taskId, engine]);
  const summary = async (client) => {
    const r = await humanQuery(world.users.alice,
      "select * from clara.get_llm_usage_summary($1, date '2026-06-01', $2)", [firm, client]);
    return r.rows.find((x) => x.call_kind === "document_extraction") ?? null;
  };
  const mine = await summary(world.clients.A1);
  assert.ok(mine, "the extraction row did not resolve to the client of its own ACTIVE filing");
  assert.equal(Number(mine.spend_cents), 200);
  assert.equal(await summary(world.clients.A2), null,
    "the extraction row must NOT roll up under a client it was never filed to");

  // A row that CARRIES its own client_id is not re-resolved: the stored value wins.
  const task = await agentTask(world.users.alice, world.clients.A2);
  await rootQuery(
    `select clara.record_agent_usage_event(p_firm => $1, p_call_kind => 'reporting',
       p_engine_id => $2, p_outcome => 'success', p_client => $3, p_agent_task => $4,
       p_input_tokens => 1000000, p_output_tokens => 1000000)`,
    [firm, engine, world.clients.A2, task.id]);
  const r2 = await humanQuery(world.users.alice,
    "select * from clara.get_llm_usage_summary($1, $2, $3)",
    [firm, new Date().toISOString().slice(0, 10), world.clients.A2]);
  assert.ok(r2.rows.find((x) => x.call_kind === "reporting"),
    "a row carrying its own client_id must roll up under that client");
});

// ---------------------------------------------------------------------------------------
// R-L10 / R-L26 — the platform scope. Every cell here reads through a REAL
// clara_authenticated session, because the thing under test is what a human can see.
// ---------------------------------------------------------------------------------------

test("f-a9.scope a firm-less row declaring scope='firm' is REFUSED, and so is a firm-bearing scope='platform' row", async (t) => {
  if (gate(t)) return;
  // The forgotten-firm_id case. Without the biconditional this row would be ACCEPTED and
  // then read as a platform row by the policy — a cross-tenant leak arriving through an
  // omission nobody reviewed.
  await assertRaises(PG.checkViolation, () => rootQuery(
    `insert into clara.llm_usage_events(call_kind, engine_id, outcome)
     values('chat','rig','success')`),
  "a row with no firm_id, scope left at its 'firm' default");
  await assertRaises(PG.checkViolation, () => rootQuery(
    `insert into clara.llm_usage_events(firm_id, scope, call_kind, engine_id, outcome)
     values($1,'platform','chat','rig','success')`, [world.firms.A]),
  "a row claiming scope='platform' while naming a firm");
  await assertRaises(PG.checkViolation, () => rootQuery(
    `insert into clara.llm_usage_events(scope, call_kind, engine_id, outcome)
     values('not_a_scope','chat','rig','success')`),
  "an unregistered scope");
  // The ADMIT direction, through the real door: a platform call records with no firm.
  const id = (await rootQuery(
    `select clara.record_agent_usage_event(p_firm => null, p_call_kind => 'tier1_policy_fetch',
       p_engine_id => 'gpt-5.6-terra', p_outcome => 'success',
       p_input_tokens => 1000000, p_output_tokens => 1000000) as id`)).rows[0].id;
  const row = (await rootQuery(
    "select firm_id, scope from clara.llm_usage_events where id = $1", [id])).rows[0];
  assert.equal(row.firm_id, null, "R-L10: a platform call has no firm");
  assert.equal(row.scope, "platform", "the door DECLARES the scope; it is never inferred at read time");
});

test("f-a9.scope a platform call may not name a client, an agent task or a triggering actor", async (t) => {
  if (gate(t)) return;
  const task = await agentTask(world.users.bob, world.clients.A1);
  for (const [label, arg, val] of [
    ["a client", "p_client", world.clients.A1],
    ["an agent task", "p_agent_task", task.id],
    ["a triggering actor", "p_triggering_actor", world.users.bob],
  ]) {
    await assertRaises(CLR.badRequest, () => rootQuery(
      `select clara.record_agent_usage_event(p_firm => null, p_call_kind => 'web_fetch',
         p_engine_id => 'rig', p_outcome => 'success', ${arg} => $1)`, [val]),
    `a platform call naming ${label}`);
  }
  // And structurally, below the door: the composite client FK is MATCH SIMPLE, so with a
  // NULL firm_id it would SKIP entirely — this CHECK is what stops a dangling client_id.
  await assertRaises(PG.checkViolation, () => rootQuery(
    `insert into clara.llm_usage_events(scope, call_kind, client_id, engine_id, outcome)
     values('platform','web_fetch',$1,'rig','success')`, [randomUUID()]),
  "a direct platform INSERT carrying a client_id");
});

test("f-a9.rls a platform row IS visible to a foreign bookkeeper; a sibling firm's row is NOT", async (t) => {
  if (gate(t)) return;
  const engine = `rig-rls-${randomUUID().slice(0, 8)}`;
  const platformId = (await rootQuery(
    `insert into clara.llm_usage_events(scope, call_kind, engine_id, outcome)
     values('platform','tier1_policy_fetch',$1,'success') returning id`, [engine])).rows[0].id;
  const firmAId = (await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome)
     values($1,'chat',$2,'success') returning id`, [world.firms.A, engine])).rows[0].id;

  // Read as DAVE, firm B's owner — a firm that did not create either row.
  const seen = await humanQuery(world.users.dave,
    "select id from clara.llm_usage_events where engine_id = $1 order by id", [engine]);
  const ids = seen.rows.map((r) => r.id);
  assert.ok(ids.includes(platformId),
    "R-L10 platform row is INVISIBLE to a firm session — it would be recorded, billed and unseeable");
  assert.ok(!ids.includes(firmAId),
    "CROSS-TENANT LEAK: firm B's session can see firm A's usage row");
  assert.equal(ids.length, 1, `firm B must see exactly the platform row; saw ${ids.length}`);

  // The positive control that makes the negative meaningful: firm A's own session DOES see
  // its row. Without this, "firm B saw one row" could just mean the read was broken.
  const own = await humanQuery(world.users.alice,
    "select id from clara.llm_usage_events where engine_id = $1 order by id", [engine]);
  const ownIds = own.rows.map((r) => r.id);
  assert.ok(ownIds.includes(firmAId), "firm A cannot see its OWN usage row");
  assert.ok(ownIds.includes(platformId), "firm A cannot see the platform row either");
});

test("f-a9.leak the priced view is invoker-executed and reachable by no app role — the owner-view cross-tenant leak has no door", async (t) => {
  if (gate(t)) return;
  const opt = await rootQuery(
    `select c.reloptions from pg_class c where c.oid = 'clara.llm_usage_events_priced'::regclass`);
  assert.ok((opt.rows[0].reloptions ?? []).includes("security_invoker=true"),
    "an owner-executed view over this table runs under the owner policy USING (true) and returns EVERY firm's rows");
  const g = await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'clara' and table_name = 'llm_usage_events_priced' and grantee <> 'clara_fn_owner'`);
  assert.equal(g.rows.length, 0, `the priced view must have no app-role grant; found ${JSON.stringify(g.rows)}`);
  // Behavioural: the door is shut, and the read says NO rather than returning rows.
  await assertRaises(PG.insufficientPrivilege, () => humanQuery(
    world.users.dave, "select count(*) from clara.llm_usage_events_priced"),
  "a human session reading the priced view directly");
});

test("f-a9.buckets the rollup gives firm B zero of firm A's rows and keeps platform spend in its own bucket", async (t) => {
  if (gate(t)) return;
  const engine = `rig-bucket-${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-05-01', null, 100, 100, 'rig bucket fixture')`, [engine]);
  const when = "2026-05-15T03:00:00Z";
  await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome, input_tokens, output_tokens, created_at)
     values($1,'chat',$2,'success',1000000,1000000,$3)`, [world.firms.A, engine, when]);
  await rootQuery(
    `insert into clara.llm_usage_events(firm_id, call_kind, engine_id, outcome, input_tokens, output_tokens, created_at)
     values($1,'reporting',$2,'success',1000000,1000000,$3)`, [world.firms.B, engine, when]);
  await rootQuery(
    `insert into clara.llm_usage_events(scope, call_kind, engine_id, outcome, input_tokens, output_tokens, created_at)
     values('platform','tier1_policy_fetch',$1,'success',1000000,1000000,$2)`, [engine, when]);

  const r = await humanQuery(world.users.dave,
    "select * from clara.get_llm_usage_summary($1, date '2026-05-01')", [world.firms.B]);
  const firmRows = r.rows.filter((x) => x.scope === "firm");
  const platformRows = r.rows.filter((x) => x.scope === "platform");
  assert.ok(!firmRows.some((x) => x.call_kind === "chat"),
    "CROSS-TENANT LEAK: firm A's 'chat' spend appeared in firm B's rollup");
  assert.ok(firmRows.some((x) => x.call_kind === "reporting"), "firm B's own row is missing from its rollup");
  const plat = platformRows.find((x) => x.call_kind === "tier1_policy_fetch");
  assert.ok(plat, "the platform call vanished from the rollup — R-L10 says it is metered, not unmetered");
  assert.equal(Number(plat.spend_cents), 200);
  // The whole point of the split: platform spend is NOT inside any firm's figure.
  const firmSpend = firmRows.reduce((a, x) => a + Number(x.spend_cents), 0);
  assert.equal(firmSpend, 200,
    "firm B's own figure must be its own 200c alone — a platform call billed to one tenant is a lie in a money number");
  // A client-scoped question excludes the platform bucket by construction.
  const scoped = await humanQuery(world.users.dave,
    "select * from clara.get_llm_usage_summary($1, date '2026-05-01', $2)", [world.firms.B, world.clients.B1]);
  assert.equal(scoped.rows.filter((x) => x.scope === "platform").length, 0,
    "a firm-less call cannot be one client's, so a client-scoped rollup must not carry the platform bucket");
});

test("f-a9.overlap the price table REFUSES two overlapping effective ranges for one engine — one usage row can never match two price rows", async (t) => {
  if (gate(t)) return;
  const engine = `rig-ovl-${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-01-01', date '2026-06-30', 100, 100, 'rig overlap base')`, [engine]);
  await assertRaises(CLR.badRequest, () => rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-06-01', date '2026-12-31', 900, 900, 'rig overlap probe')`, [engine]),
  "an overlapping price range");
  // A row that ABUTS without overlapping is fine — the wall must not forbid the lawful
  // supersede shape it exists to protect.
  const ok = await rootQuery(
    `insert into clara.llm_price_table(engine_id, effective_from, effective_to,
       input_price_cents_per_million_tokens, output_price_cents_per_million_tokens, source_note)
     values ($1, date '2026-07-01', null, 900, 900, 'rig abutting successor') returning engine_id`, [engine]);
  assert.equal(ok.rows[0].engine_id, engine);
});

test("f-a9.grants llm_price_table carries NO app-role grant, and the rollup is reachable by clara_authenticated", async (t) => {
  if (gate(t)) return;
  const g = await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'clara' and table_name = 'llm_price_table' and grantee <> 'clara_fn_owner'`);
  assert.equal(g.rows.length, 0,
    `llm_price_table must be reachable only through the typed function (D5); found ${JSON.stringify(g.rows)}`);
  const ex = await rootQuery(
    `select has_function_privilege('clara_authenticated', 'clara.get_llm_usage_summary(uuid,date,uuid)', 'execute') as ok`);
  assert.equal(ex.rows[0].ok, true, "the typed read must be EXECUTE-able by the only role a human session holds");
  // The new door is the runtime's, and PUBLIC reaches neither.
  const pub = await rootQuery(
    `select has_function_privilege('public', $1, 'execute') as door,
            has_function_privilege('public', 'clara.get_llm_usage_summary(uuid,date,uuid)', 'execute') as rollup`,
    [NEW_DOOR]);
  assert.equal(pub.rows[0].door, false, "PUBLIC must not execute record_agent_usage_event");
  assert.equal(pub.rows[0].rollup, false, "PUBLIC must not execute get_llm_usage_summary");
});
