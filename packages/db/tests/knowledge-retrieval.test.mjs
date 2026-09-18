// #658 — BOUNDED, CORE-FIRST KNOWLEDGE RETRIEVAL; THE RECORDED READ-SET; DRIFT; AND THE SEVENTH
// DOOR. Migration: 0230_knowledge_retrieval.sql. Every cell gates on the LIVE CATALOG, never on
// the migration number (knowledge-retrieval-fixtures.mjs `knowledgeRetrievalCohortApplied`).
//
// WHAT THESE CELLS ARE FOR. #658's acceptance criteria are claims about what a run READS and what
// the estate can say afterwards:
//   AC1 — a bounded, core-first retrieval whose firm defaults merge only through explicit scope,
//         and whose `purpose` is recorded rather than used as a filter. Cells 1, 5, 6, 7, 8.
//   AC2 — record the versions each attempt read, and make "a relevant revision moved" computable.
//         Cells 11, 12, 19, 20.
//   AC3 — an explicit status, never null-as-empty. Cells 13, 20.
//   AC5 — C13 and Work expose source / applicability / freshness / historical basis, with real
//         isolation. Cells 2, 9, 10, 14, 15, 16, 17, 18, 22.
//   AC7 — production-facing reads under real least-privileged roles. Cells 3, 4, 21 and the
//         persona discipline of every other cell.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH `roleQuery`/`humanQuery` AT THE LEAST PRIVILEGE THAT
// SHOULD SUCCEED. `rootQuery` appears only to MINT a world or to READ BACK a catalog/table for a
// census — never as the caller of the act a cell is about.

import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  assertRaises, endPool, humanQuery, roleQuery, rootQuery, CLR, PG, ROLES,
} from "./rig-fixtures.mjs";
import {
  capture, coreKeys, drift, driftFor, knowledgeRetrievalCohortApplied,
  listReadsForRecord, nonWorkTask, projectRow, readHistoryFor, readRecordFor, recordRead, retrieve,
  retrievalWorld, workWithTask,
} from "./knowledge-retrieval-fixtures.mjs";

const EXPECTED_CELLS = 23;
let live = false;
let executed = 0;

before(async () => { live = await knowledgeRetrievalCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_KNOWLEDGE_RETRIEVAL_0230 === "1") {
    console.warn("SKIP knowledge-retrieval: the 0230 cohort is not applied (explicit pre-integration run).");
    t.skip("knowledge-retrieval cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0230 knowledge-retrieval cohort is required for a focused run: apply 0230_knowledge_retrieval.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

const RUN = (n) => `wrun_P658${String(n).padStart(4, "0")}ABCDEFGHJKMNPQ`.slice(0, 31);
const byKey = (answer, key) => answer.records.filter((r) => r.knowledge_key === key);
const tierOf = (answer, key) => byKey(answer, key).map((r) => r.tier);

// =============================================================================================
// 1 · clara.retrieve_knowledge
// =============================================================================================

cell("p658.retrieve.core_first — every core row returns, the remainder is capped, hidden_count is exact", async () => {
  const w = await retrievalWorld("core");
  // THREE core rows: two policies and the owner-floored authority-bearing assertion.
  await capture(w.owner, { key: "accounting_basis", value: { basis: "accrual" }, client: w.clientA });
  await capture(w.owner, { key: "reporting_framework", value: { framework: "mpers" }, client: w.clientA });
  await capture(w.owner, { key: "customer_identity_policy", value: "name_only", client: w.clientA });
  // SIXTY remainder rows: one preference key at sixty distinct applicabilities, which
  // `uq_knowledge_live` treats as sixty independent live facts (0192:512-514).
  for (let i = 0; i < 60; i += 1) {
    await capture(w.owner, {
      key: "coa_seed_decision", value: { seed: i }, client: w.clientA,
      appliesWhen: { segment: `s${i}` },
    });
  }
  const a = await retrieve({ client: w.clientA, firm: w.firm, limit: 40 });
  assert.equal(a.status, "ok");
  assert.equal(a.tiers.core, 3, "every core row rides, unbounded");
  assert.equal(a.tiers.remainder, 40, "the remainder is capped at p_limit");
  assert.equal(a.truncated, true);
  assert.equal(a.hidden_count, 20, "hidden_count is the exact number withheld, never an estimate");
  assert.equal(a.records.length, 43);
  // The core is FIRST in the array, so a prompt built by concatenation cannot lose it to a cap.
  assert.deepEqual(a.records.slice(0, 3).map((r) => r.tier), ["core", "core", "core"]);
  // A larger cap takes the whole remainder and says so.
  const b = await retrieve({ client: w.clientA, firm: w.firm, limit: 200 });
  assert.equal(b.tiers.remainder, 60);
  assert.equal(b.truncated, false);
  assert.equal(b.hidden_count, 0);
  // A NAMED key is promoted out of the remainder into `requested` and is never capped away.
  const c = await retrieve({ client: w.clientA, firm: w.firm, limit: 1, keys: ["coa_seed_decision"] });
  assert.equal(c.tiers.requested, 60, "a run that named a key is owed every answer to it");
  assert.equal(c.tiers.remainder, 0);
  assert.equal(c.truncated, false);
});

cell("p658.retrieve.period — an out-of-effect rule is MARKED and returned, never dropped; as_of defaults to the server's KL date", async () => {
  const w = await retrievalWorld("period");
  await capture(w.owner, {
    key: "sst_regime", value: "sales_tax", client: w.clientA,
    from: "2020-01-01", to: "2020-12-31",
  });
  await capture(w.owner, {
    key: "turnover_band", value: "<RM1M", client: w.clientA,
    from: "2020-01-01", to: null,
  });
  const a = await retrieve({ client: w.clientA, firm: w.firm });
  const expired = byKey(a, "sst_regime");
  assert.equal(expired.length, 1, "an expired rule is PRESENT -- silently dropping it is how a run reasons without a fact that applies");
  assert.equal(expired[0].in_effect, false);
  assert.equal(byKey(a, "turnover_band")[0].in_effect, true);
  // THE DEFAULT IS THE SERVER'S Asia/Kuala_Lumpur CALENDAR DAY, not a caller's clock.
  const today = (await rootQuery("select (now() at time zone 'Asia/Kuala_Lumpur')::date::text as d")).rows[0].d;
  assert.equal(a.as_of, today);
  // ...and an explicit as_of inside the window flips the same row back into effect.
  const b = await retrieve({ client: w.clientA, firm: w.firm, asOf: "2020-06-30" });
  assert.equal(byKey(b, "sst_regime")[0].in_effect, true);
});

cell("p658.retrieve.tenancy — the runtime lane names its firm, and absent and foreign answer alike", async () => {
  const w = await retrievalWorld("tenancy");
  const other = await retrievalWorld("tenancy_other");
  await assertRaises(CLR.badRequest,
    () => retrieve({ client: w.clientA, firm: null }),
    "the runtime lane without p_firm");
  const foreign = await assertRaises(CLR.notFound,
    () => retrieve({ client: other.clientA, firm: w.firm }),
    "another firm's client");
  const absent = await assertRaises(CLR.notFound,
    () => retrieve({ client: randomUUID(), firm: w.firm }),
    "a client id nobody holds");
  assert.equal(foreign.message, absent.message,
    "a real foreign client and a random uuid must be indistinguishable -- no existence oracle");
  // Neither an identified human nor the runtime → the authority class, never a fall-through.
  await assertRaises(CLR.wake,
    () => roleQuery(ROLES.fnOwner,
      "select clara.retrieve_knowledge(p_client => $1, p_purpose => 'accounting_work') as r", [w.clientA]),
    "a session that is neither lane");
});

cell("p658.retrieve.no_human_grant — #783: the three pack-shaped reads are clara_runtime's alone", async () => {
  const roles = ["clara_authenticated", "clara_agent_ro", "clara_agent_read_login",
    "clara_wake_interactive", "clara_wake_proactive", "clara_wake_bank", "clara_wake_filing",
    "clara_freeform_ro"];
  const fns = ["clara.retrieve_knowledge(uuid,text,date,text[],int,uuid)",
    "clara.read_knowledge_record_for(uuid,uuid,uuid)",
    "clara.read_knowledge_history_for(uuid,uuid,uuid)"];
  for (const fn of fns) {
    for (const role of roles) {
      const r = await rootQuery("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, fn]);
      assert.equal(r.rows[0].ok, false,
        `${role} must NOT hold EXECUTE on ${fn} -- #783 (.out-of-scope/human-read-of-knowledge-pack.md)`);
    }
    const r = await rootQuery("select has_function_privilege('clara_runtime', $1, 'EXECUTE') as ok", [fn]);
    assert.equal(r.rows[0].ok, true, `clara_runtime must hold EXECUTE on ${fn}`);
  }
  // ...and the grant is not the only wall: an authenticated session gets a PRIVILEGE ERROR, not
  // an answer, which is what a reader of the ACL alone could not tell you.
  const w = await retrievalWorld("no_grant");
  await assertRaises(PG.insufficientPrivilege,
    () => humanQuery(w.owner,
      "select clara.retrieve_knowledge(p_client => $1, p_purpose => 'chat_turn') as r", [w.clientA]),
    "a clara_authenticated session calling retrieve_knowledge");
});

cell("p658.retrieve.shadow_parity — ONE register, ONE pack, ONE answer, proven across two personas", async () => {
  const w = await retrievalWorld("parity");
  // A firm default and a client exception at the SAME applicability (so the shadow bites), plus a
  // firm default at a DIFFERENT applicability (so it survives) -- the per-applicability rule.
  await capture(w.owner, { key: "reporting_framework", value: { framework: "mpers" }, scope: "firm" });
  await capture(w.owner, { key: "reporting_framework", value: { framework: "mfrs" }, client: w.clientA });
  await capture(w.owner, {
    key: "coa_seed_decision", value: { seed: "firm" }, scope: "firm",
    appliesWhen: { segment: "digital" },
  });
  await capture(w.owner, { key: "sst_regime", value: "service_tax", client: w.clientA });

  const mine = await retrieve({ client: w.clientA, firm: w.firm, limit: 200 });
  const pack = (await roleQuery(ROLES.runtime,
    "select clara.get_knowledge_pack(p_client => $1, p_purpose => 'accounting_work', p_firm => $2) as r",
    [w.clientA, w.firm])).rows[0].r;
  const register = (await humanQuery(w.viewer,
    "select clara.list_client_knowledge(p_client => $1) as r", [w.clientA])).rows[0].r;

  const mineById = new Map(mine.records.map((r) => [r.record_id, projectRow(r)]));
  const packById = new Map(pack.records.map((r) => [r.record_id, projectRow(r)]));
  assert.deepEqual([...mineById.keys()].sort(), [...packById.keys()].sort(),
    "the bounded read and the shipped pack must select the SAME live rows for the same client");
  for (const [id, row] of packById) assert.deepEqual(mineById.get(id), row, `record ${id} differs from the pack`);
  // ...and on the rows they SHARE, the human register agrees too (it additionally carries
  // withdrawn revisions, which a run must not act on).
  let shared = 0;
  for (const r of register.records) {
    const proj = projectRow(r);
    if (!mineById.has(proj.record_id)) continue;
    shared += 1;
    assert.deepEqual(mineById.get(proj.record_id), proj, `record ${proj.record_id} differs from the register`);
  }
  assert.ok(shared >= 3, `expected the register and the bounded read to share rows, shared ${shared}`);
  assert.equal(mine.knowledge_version, pack.knowledge_version, "one watermark expression, one answer");
  assert.equal(mine.knowledge_version, register.knowledge_version);
});

cell("p658.retrieve.legacy_unshadowed — the five carried keys ride in as core, authoritative, and are never hidden", async () => {
  const w = await retrievalWorld("legacy");
  await rootQuery(
    `insert into clara.client_facts(firm_id, client_id, fact_key, fact_value, basis, basis_kind,
        validated_against, recorded_by)
     values ($1,$2,'trade_nature','"services"'::jsonb,'p658 legacy','owner_instruction','enum:TRADE_NATURE_V1',$3)`,
    [w.firm, w.clientA, w.owner]);
  // ...and a KNOWLEDGE record of the same key beside it. Neither hides the other: the legacy row
  // is still what the estate READS for all five (0192 decision 1).
  await capture(w.owner, { key: "trade_nature", value: "goods_trading", client: w.clientA });
  const a = await retrieve({ client: w.clientA, firm: w.firm, limit: 200 });
  const rows = byKey(a, "trade_nature");
  assert.equal(rows.length, 2, "the legacy fact and the knowledge record both ride");
  const legacy = rows.find((r) => r.source_kind === "legacy_client_fact");
  assert.ok(legacy, "the legacy client_fact must be present");
  assert.equal(legacy.authoritative, true);
  assert.equal(legacy.editable, false);
  assert.equal(legacy.tier, "core", "a carried key is a CORE key by construction");
  assert.equal(legacy.in_effect, true, "a legacy fact carries no window, so it is in effect for every period");
  assert.equal(rows.find((r) => r.source_kind === "user_statement").tier, "core");
  assert.equal(legacy.knowledge_version, null, "a legacy fact has no revision to stamp, so it cannot move the watermark");
});

cell("p658.retrieve.bounds — an out-of-range limit and an unknown key REFUSE; neither is a silent empty", async () => {
  const w = await retrievalWorld("bounds");
  for (const limit of [0, -1, 201, 100000]) {
    const e = await assertRaises(CLR.badRequest,
      () => retrieve({ client: w.clientA, firm: w.firm, limit }), `p_limit ${limit}`);
    assert.match(e.detail ?? "", /knowledge_limit_out_of_range/);
  }
  const e = await assertRaises(CLR.badRequest,
    () => retrieve({ client: w.clientA, firm: w.firm, keys: ["turnover_band", "not_a_real_key"] }),
    "an unknown requested key");
  assert.match(e.detail ?? "", /knowledge_key_unknown/,
    "a run that asked for a key that does not exist has a bug, and answering [] hides it");
  // A purpose is required, and the refusal says which reason.
  const p = await assertRaises(CLR.badRequest,
    () => retrieve({ client: w.clientA, firm: w.firm, purpose: "  " }), "a blank purpose");
  assert.match(p.detail ?? "", /knowledge_purpose_required/);
  // The bounds are INCLUSIVE at both ends.
  assert.equal((await retrieve({ client: w.clientA, firm: w.firm, limit: 1 })).status, "ok");
  assert.equal((await retrieve({ client: w.clientA, firm: w.firm, limit: 200 })).status, "ok");
});

cell("p658.retrieve.purpose_is_recorded_not_filtered — the C7 non-goal, ASSERTED so a later ticket has a cell to flip", async () => {
  const w = await retrievalWorld("purpose");
  await capture(w.owner, { key: "accounting_basis", value: { basis: "cash" }, client: w.clientA });
  await capture(w.owner, { key: "sst_regime", value: "both", client: w.clientA });
  await capture(w.owner, { key: "default_currency", value: "MYR", client: w.clientA });
  const a = await retrieve({ client: w.clientA, firm: w.firm, purpose: "accounting_work", limit: 200 });
  const b = await retrieve({ client: w.clientA, firm: w.firm, purpose: "chat_turn", limit: 200 });
  assert.equal(a.purpose, "accounting_work", "the purpose is ECHOED");
  assert.equal(b.purpose, "chat_turn");
  assert.deepEqual(a.records.map((r) => r.record_id), b.records.map((r) => r.record_id),
    "two calls differing only in p_purpose return the SAME record set -- purpose filters NOTHING");
  assert.deepEqual(a.tiers, b.tiers);
  assert.deepEqual(a.keys, b.keys);
});

// =============================================================================================
// 2 · The runtime inspection twins
// =============================================================================================

cell("p658.inspect.record_for — the record, its pins and the document's METADATA; never its bytes", async () => {
  const w = await retrievalWorld("inspect");
  const sha = "a".repeat(64);
  const doc = (await rootQuery(
    `insert into clara.documents(firm_id, sha256, original_filename, mime_type, byte_size,
        storage_path, uploaded_by, document_kind, bytes_verified_at)
     values ($1,$2,'p658-basis.pdf','application/pdf',10,$3,$4,'other', now()) returning id`,
    [w.firm, sha, `firms/${w.firm}/docs/${sha}.pdf`, w.owner])).rows[0].id;
  const rec = await capture(w.owner, {
    key: "msic", value: "62010", client: w.clientA,
    sourceKind: "registry_lookup", source: { document_id: doc },
  });
  const a = await readRecordFor({ firm: w.firm, client: w.clientA, record: rec.record_id });
  assert.equal(a.status, "ok");
  assert.equal(a.record.knowledge_key, "msic");
  assert.equal(a.source.document_id, doc);
  assert.equal(a.source_document.filename, "p658-basis.pdf");
  assert.equal(a.source_document.legal_hold, false);
  assert.ok(a.source_document.bytes_verified_at);
  // NO BYTES, and no key that could ever carry them.
  const text = JSON.stringify(a);
  for (const forbidden of ["storage_path", "bytes", "content", "sha256", "payload"]) {
    assert.ok(!text.includes(`"${forbidden}"`), `the inspection envelope must not carry "${forbidden}"`);
  }
  // Outside the named firm/client: CLR11, and absent and foreign answer alike.
  const other = await retrievalWorld("inspect_other");
  const foreign = await assertRaises(CLR.notFound,
    () => readRecordFor({ firm: other.firm, client: other.clientA, record: rec.record_id }), "another firm");
  const absent = await assertRaises(CLR.notFound,
    () => readRecordFor({ firm: other.firm, client: other.clientA, record: randomUUID() }), "an absent record");
  assert.equal(foreign.message, absent.message);
  // ...and no human role can reach it at all.
  await assertRaises(PG.insufficientPrivilege,
    () => humanQuery(w.owner,
      "select clara.read_knowledge_record_for(p_firm => $1, p_client => $2, p_record => $3) as r",
      [w.firm, w.clientA, rec.record_id]), "a clara_authenticated session");
});

cell("p658.inspect.history_for — every revision of one record, oldest first, inside the named firm only", async () => {
  const w = await retrievalWorld("history");
  const rec = await capture(w.owner, { key: "default_currency", value: "MYR", client: w.clientA });
  await humanQuery(w.owner,
    `select clara.correct_knowledge(p_record => $1, p_value => $2::jsonb, p_reason => $3,
        p_op_key => $4, p_basis => $5, p_source_kind => null, p_source => null) as r`,
    [rec.record_id, JSON.stringify("SGD"), "rig correction", `p658_${randomUUID()}`, "p658 correction"]);
  const a = await readHistoryFor({ firm: w.firm, client: w.clientA, record: rec.record_id });
  assert.equal(a.status, "ok");
  assert.equal(a.knowledge_key, "default_currency");
  assert.equal(a.revisions.length, 2);
  assert.deepEqual(a.revisions.map((r) => r.revision_n), [1, 2]);
  assert.equal(a.revisions[0].state, "superseded");
  assert.equal(a.revisions[1].state, "live");
  const other = await retrievalWorld("history_other");
  const foreign = await assertRaises(CLR.notFound,
    () => readHistoryFor({ firm: other.firm, client: other.clientA, record: rec.record_id }), "another firm");
  const absent = await assertRaises(CLR.notFound,
    () => readHistoryFor({ firm: other.firm, client: other.clientA, record: randomUUID() }), "an absent record");
  assert.equal(foreign.message, absent.message);
});

// =============================================================================================
// 3 · clara.work_knowledge_reads and its sole writer
// =============================================================================================

cell("p658.reads.no_work_fk — the 0195 cell: no FK to accounting_work, and the positive join carries the binding", async () => {
  const fk = await rootQuery(
    `select count(*)::int as n from pg_constraint
      where conrelid='clara.work_knowledge_reads'::regclass and contype='f'
        and confrelid='clara.accounting_work'::regclass`);
  assert.equal(fk.rows[0].n, 0,
    "an FK here takes FOR KEY SHARE behind every posting lock (0195:254-268 measured 4001 ms and a silent cancel)");
  // ...and the binding is not lost. A task of the WRONG KIND is a not-found.
  const w = await retrievalWorld("nofk");
  const other = await nonWorkTask(w.firm, w.clientA, w.owner);
  await assertRaises(CLR.notFound, () => recordRead({ task: other }), "a task of another kind");
  await assertRaises(CLR.notFound, () => recordRead({ task: randomUUID() }), "a task nobody holds");
  // ...and the row it DOES write names the Work the task names, derived rather than supplied.
  const { work, task } = await workWithTask(w.firm, w.clientA, w.owner);
  const r = await recordRead({ task, run: RUN(1), keys: ["sst_regime"] });
  assert.equal(r.work_id, work);
  assert.equal(r.client_id, w.clientA);
  assert.equal(r.firm_id, w.firm);
  // The residual FKs 0195 keeps and explains ARE here.
  const kept = await rootQuery(
    `select confrelid::regclass::text as t from pg_constraint
      where conrelid='clara.work_knowledge_reads'::regclass and contype='f' order by 1`);
  assert.deepEqual(kept.rows.map((x) => x.t).sort(),
    ["clara.agent_tasks", "clara.clients", "clara.firms"]);
});

cell("p658.reads.append_only — idempotent on (work, run, seq); UPDATE and DELETE refused even as clara_fn_owner", async () => {
  const w = await retrievalWorld("append");
  const { work, task } = await workWithTask(w.firm, w.clientA, w.owner);
  const first = await recordRead({ task, run: RUN(2), seq: 1, keys: ["sst_regime"], knowledgeVersion: "7" });
  const replay = await recordRead({ task, run: RUN(2), seq: 1, keys: ["sst_regime"], knowledgeVersion: "7" });
  assert.equal(replay.read_id, first.read_id, "a WDK re-execution replays onto the SAME row");
  const n = await rootQuery("select count(*)::int as n from clara.work_knowledge_reads where work_id=$1", [work]);
  assert.equal(n.rows[0].n, 1);
  // A different seq is a different read.
  await recordRead({ task, run: RUN(2), seq: 2, keys: ["sst_regime"] });
  const n2 = await rootQuery("select count(*)::int as n from clara.work_knowledge_reads where work_id=$1", [work]);
  assert.equal(n2.rows[0].n, 2);
  // APPEND-ONLY, at the highest privilege any door runs as.
  await assertRaises(CLR.immutable,
    () => roleQuery(ROLES.fnOwner,
      "update clara.work_knowledge_reads set status='denied' where id=$1", [first.read_id]),
    "an UPDATE as clara_fn_owner");
  await assertRaises(CLR.immutable,
    () => roleQuery(ROLES.fnOwner,
      "delete from clara.work_knowledge_reads where id=$1", [first.read_id]),
    "a DELETE as clara_fn_owner");
  // NO APPLICATION ROLE HOLDS ANYTHING, and SELECT is in the list.
  for (const role of ["clara_authenticated", "clara_runtime", "clara_agent_ro",
    "clara_wake_interactive", "clara_wake_proactive", "clara_wake_bank", "clara_wake_filing"]) {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      const r = await rootQuery("select has_table_privilege($1,'clara.work_knowledge_reads',$2) as ok", [role, priv]);
      assert.equal(r.rows[0].ok, false, `${role} must hold no ${priv} on clara.work_knowledge_reads`);
    }
  }
  await assertRaises(PG.insufficientPrivilege,
    () => humanQuery(w.owner, "select count(*) from clara.work_knowledge_reads"),
    "a clara_authenticated session reading the relation directly");
});

cell("p658.reads.status_vocabulary — exactly the four face words; `unavailable` is refused by the CHECK", async () => {
  const w = await retrievalWorld("vocab");
  const { task } = await workWithTask(w.firm, w.clientA, w.owner);
  let seq = 0;
  for (const status of ["ok", "partial", "unknown", "denied"]) {
    seq += 1;
    const r = await recordRead({ task, run: RUN(3), seq, status, reason: status === "ok" ? null : "rig" });
    assert.ok(r.read_id, `${status} must be admitted`);
  }
  for (const bad of ["unavailable", "stale", "OK", "refused", ""]) {
    await assertRaises(CLR.badRequest,
      () => recordRead({ task, run: RUN(3), seq: 99, status: bad }), `status "${bad}"`);
  }
  // The WALL is the relation's own CHECK, not only the writer's diagnosis.
  const chk = await rootQuery(
    `select count(*)::int as n from pg_constraint
      where conrelid='clara.work_knowledge_reads'::regclass and contype='c'
        and pg_get_constraintdef(oid) like '%ok%partial%unknown%denied%'`);
  assert.equal(chk.rows[0].n, 1);
  const def = await rootQuery(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid='clara.work_knowledge_reads'::regclass and contype='c'
        and pg_get_constraintdef(oid) like '%ok%partial%unknown%denied%'`);
  assert.ok(!def.rows[0].d.includes("unavailable"),
    "the runtime's own word must never be admissible in a register column");
});

// =============================================================================================
// 4 · The SEVENTH door — clara.list_work_knowledge_reads_for_record (DECISIONS.md:83)
// =============================================================================================

cell("p658.record_reads.lists — a viewer sees which Work read this record, at which version and with which face word", async () => {
  const w = await retrievalWorld("reads_list");
  const rec = await capture(w.owner, { key: "sst_regime", value: "service_tax", client: w.clientA });
  const { work, task } = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  await recordRead({
    task, run: RUN(4), seq: 1, keys: ["sst_regime", "default_currency"],
    knowledgeVersion: "12", asOf: "2026-09-19", purpose: "accounting_work",
    status: "partial", reason: "remainder truncated", recordsShown: 9, truncated: true,
    tiers: { core: 3, requested: 0, remainder: 6 },
  });
  const a = await listReadsForRecord(w.viewer, rec.record_id);
  assert.equal(a.status, "ok");
  assert.equal(a.record_id, rec.record_id);
  assert.equal(a.knowledge_key, "sst_regime");
  assert.equal(a.scope_kind, "client");
  assert.equal(a.reads.length, 1);
  assert.equal(a.reads[0].work_id, work);
  assert.equal(a.reads[0].knowledge_version, "12");
  assert.equal(a.reads[0].as_of, "2026-09-19");
  assert.equal(a.reads[0].purpose, "accounting_work");
  assert.equal(a.reads[0].status, "partial");
  assert.equal(a.reads[0].reason, "remainder truncated");
  assert.equal(a.truncated, false);
  assert.equal(a.hidden_count, 0);
  // A record whose key NO read names comes back EMPTY -- and empty is not an error.
  const unread = await capture(w.owner, { key: "turnover_band", value: "RM1M-5M", client: w.clientA });
  const b = await listReadsForRecord(w.viewer, unread.record_id);
  assert.equal(b.status, "ok");
  assert.deepEqual(b.reads, []);
});

cell("p658.record_reads.floor_and_tenancy — below the viewer floor is refused; another firm and a random uuid answer alike", async () => {
  const w = await retrievalWorld("reads_floor");
  const rec = await capture(w.owner, { key: "sst_regime", value: "both", client: w.clientA });
  const { task } = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  await recordRead({ task, run: RUN(5), keys: ["sst_regime"] });
  // A session with no membership at all is below every floor.
  const stranger = randomUUID();
  await rootQuery("insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [stranger, "p658 stranger", `p658_stranger_${stranger.slice(0, 8)}@rig.test`]);
  await assertRaises(CLR.authz, () => listReadsForRecord(stranger, rec.record_id),
    "a caller with no active membership");
  // Another firm's viewer cannot see the record at all -- and cannot distinguish it from nothing.
  const other = await retrievalWorld("reads_floor_other");
  const foreign = await assertRaises(CLR.notFound,
    () => listReadsForRecord(other.viewer, rec.record_id), "another firm's record");
  const absent = await assertRaises(CLR.notFound,
    () => listReadsForRecord(other.viewer, randomUUID()), "a record nobody holds");
  assert.equal(foreign.message, absent.message, "no existence oracle");
  // A read row belonging to another firm never appears, even for the same key name.
  const otherRec = await capture(other.owner, { key: "sst_regime", value: "both", client: other.clientA });
  const otherWork = await workWithTask(other.firm, other.clientA, other.bookkeeper);
  await recordRead({ task: otherWork.task, run: RUN(6), keys: ["sst_regime"] });
  const mine = await listReadsForRecord(w.viewer, rec.record_id);
  assert.equal(mine.reads.length, 1, "one firm's reads only");
  const theirs = await listReadsForRecord(other.viewer, otherRec.record_id);
  assert.equal(theirs.reads.length, 1);
  assert.notEqual(mine.reads[0].work_id, theirs.reads[0].work_id);
});

cell("p658.record_reads.firm_scope_shadow — a client whose own live record shadows the key is EXCLUDED", async () => {
  const w = await retrievalWorld("shadow");
  // The FIRM default, and clientA's own exception at the SAME applicability.
  const firmRec = await capture(w.owner, {
    key: "reporting_framework", value: { framework: "mpers" }, scope: "firm",
  });
  await capture(w.owner, { key: "reporting_framework", value: { framework: "mfrs" }, client: w.clientA });
  const a = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  const b = await workWithTask(w.firm, w.clientB, w.bookkeeper);
  await recordRead({ task: a.task, run: RUN(7), keys: ["reporting_framework"], knowledgeVersion: "3" });
  await recordRead({ task: b.task, run: RUN(8), keys: ["reporting_framework"], knowledgeVersion: "3" });

  const list = await listReadsForRecord(w.viewer, firmRec.record_id);
  assert.equal(list.scope_kind, "firm");
  const clients = list.reads.map((r) => r.client_id);
  assert.ok(clients.includes(w.clientB), "a client with no exception WAS reading the firm default");
  assert.ok(!clients.includes(w.clientA),
    "a client whose own live record shadows the key was NOT reading the firm default -- claiming otherwise is the one place this door can silently lie");
  assert.equal(list.reads.length, 1);
  // ...and the client-scope exception's OWN record lists clientA's read and nobody else's.
  const own = (await humanQuery(w.viewer, "select clara.list_client_knowledge(p_client => $1) as r",
    [w.clientA])).rows[0].r.records.find(
    (r) => r.knowledge_key === "reporting_framework" && r.scope_kind === "client");
  const ownList = await listReadsForRecord(w.viewer, own.record_id);
  assert.deepEqual(ownList.reads.map((r) => r.client_id), [w.clientA]);
});

cell("p658.record_reads.bounded — newest first, capped at 100, with an exact hidden_count", async () => {
  const w = await retrievalWorld("bounded");
  const rec = await capture(w.owner, { key: "sst_regime", value: "sales_tax", client: w.clientA });
  const { task } = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  for (let i = 1; i <= 104; i += 1) {
    await recordRead({ task, run: RUN(9), seq: i, keys: ["sst_regime"], knowledgeVersion: String(i) });
  }
  const a = await listReadsForRecord(w.viewer, rec.record_id);
  assert.equal(a.reads.length, 100, "a record page must not quietly become a Work directory");
  assert.equal(a.truncated, true);
  assert.equal(a.hidden_count, 4);
  const seqs = a.reads.map((r) => r.seq);
  assert.deepEqual([...seqs].sort((x, y) => y - x), seqs, "newest first");
  assert.equal(seqs[0], 104);
});

cell("p658.record_reads.no_values — the #783 guard: read METADATA only, and the relation gains no SELECT", async () => {
  const w = await retrievalWorld("novalues");
  const rec = await capture(w.owner, {
    key: "banking_arrangement", value: "has_accounts", client: w.clientA,
    appliesWhen: { segment: "retail" },
  });
  const { task } = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  await recordRead({ task, run: RUN(10), keys: ["banking_arrangement"] });
  const a = await listReadsForRecord(w.viewer, rec.record_id);
  const text = JSON.stringify(a);
  for (const forbidden of ["value", "applies_when", "applies_when_digest", "records",
    "source", "basis", "trust", "storage_path"]) {
    assert.ok(!text.includes(`"${forbidden}"`),
      `the reads envelope must not carry "${forbidden}" -- "just add the value, the human is already allowed" has a wall here`);
  }
  assert.ok(!text.includes("has_accounts"), "no record value, by value");
  assert.ok(!text.includes("retail"), "no applicability, by value");
  // The grant is clara_authenticated's and NOBODY else's.
  for (const role of ["clara_runtime", "clara_agent_ro", "clara_agent_read_login",
    "clara_wake_interactive", "clara_wake_proactive", "clara_wake_bank", "clara_wake_filing"]) {
    const r = await rootQuery(
      "select has_function_privilege($1,'clara.list_work_knowledge_reads_for_record(uuid)','EXECUTE') as ok", [role]);
    assert.equal(r.rows[0].ok, false, `${role} must NOT reach the seventh door -- the run already knows what it read`);
  }
  const auth = await rootQuery(
    "select has_function_privilege('clara_authenticated','clara.list_work_knowledge_reads_for_record(uuid)','EXECUTE') as ok");
  assert.equal(auth.rows[0].ok, true, "DECISIONS.md:83 mandates exactly this door");
  const sel = await rootQuery(
    "select has_table_privilege('clara_authenticated','clara.work_knowledge_reads','SELECT') as ok");
  assert.equal(sel.rows[0].ok, false,
    "a grant select is NOT an alternative to the door -- that is the whole reason DECISIONS.md:83 mandates one");
});

// =============================================================================================
// 5 · Drift
// =============================================================================================

cell("p658.drift.relevant — moving a key the run READ is relevant; moving an unrelated key is drift without relevance", async () => {
  const w = await retrievalWorld("drift");
  await capture(w.owner, { key: "sst_regime", value: "sales_tax", client: w.clientA });
  await capture(w.owner, { key: "turnover_band", value: "<RM1M", client: w.clientA });
  const a = await retrieve({ client: w.clientA, firm: w.firm, limit: 200 });
  const { work, task } = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  await recordRead({
    task, run: RUN(11), keys: ["sst_regime"], knowledgeVersion: a.knowledge_version,
    recordsShown: a.records.length, tiers: a.tiers, status: "ok",
  });
  const quiet = await driftFor(w.firm, work);
  assert.equal(quiet.observed_from, "read");
  assert.equal(quiet.drifted, false);
  assert.equal(quiet.relevant, false);
  assert.deepEqual(quiet.read_keys, ["sst_regime"]);

  // AN UNRELATED KEY MOVES: drifted, but not relevant.
  await capture(w.owner, { key: "default_currency", value: "USD", client: w.clientA });
  const unrelated = await driftFor(w.firm, work);
  assert.equal(unrelated.drifted, true);
  assert.equal(unrelated.relevant, false, "an unrelated revision must not block the run");
  assert.deepEqual(unrelated.moved_keys, ["default_currency"]);

  // A KEY THE RUN READ MOVES: relevant. This is the cell AC2 turns on.
  await humanQuery(w.owner,
    `select clara.correct_knowledge(p_record => $1, p_value => $2::jsonb, p_reason => $3,
        p_op_key => $4, p_basis => $5, p_source_kind => null, p_source => null) as r`,
    [(await humanQuery(w.viewer, "select clara.list_client_knowledge(p_client => $1) as r", [w.clientA]))
      .rows[0].r.records.find((r) => r.knowledge_key === "sst_regime").record_id,
    JSON.stringify("both"), "rig correction", `p658_${randomUUID()}`, "p658 drift"]);
  const relevant = await driftFor(w.firm, work);
  assert.equal(relevant.drifted, true);
  assert.equal(relevant.relevant, true);
  assert.ok(relevant.moved_keys.includes("sst_regime"));
});

cell("p658.drift.trace_fallback — with no read-set, `relevant` is NULL and never false", async () => {
  const w = await retrievalWorld("fallback");
  await capture(w.owner, { key: "sst_regime", value: "sales_tax", client: w.clientA });
  const { work, task } = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  // A v4-SHAPED TRACE: knowledge_version and nothing about the keys (claraWork.v4.impl.ts:593).
  await roleQuery(ROLES.runtime,
    `select clara.record_work_execution_trace($1,$2,$3,'model_call',null,null,null,null,null,
       '[]'::jsonb,null,null,'accounting_work',null,null,$4::jsonb,now(),now(),'ok',null,null)`,
    [task, RUN(12), 1, JSON.stringify({ knowledge_version: "1" })]);
  const before = await driftFor(w.firm, work);
  assert.equal(before.observed_from, "trace");
  assert.equal(before.observed_version, "1");
  assert.equal(before.read_keys, null);
  assert.equal(before.relevant, null,
    "the absence of a read-set is not evidence that nothing relevant moved -- that is the null-as-empty defect this ticket exists to kill");
  await capture(w.owner, { key: "default_currency", value: "MYR", client: w.clientA });
  const after = await driftFor(w.firm, work);
  assert.equal(after.drifted, true, "drift is still computable from the trace alone");
  assert.equal(after.relevant, null, "...but relevance is not, and the door says so");
  // A recorded read-set WINS over the trace, because it knows more.
  await recordRead({ task, run: RUN(12), seq: 2, keys: ["sst_regime"], knowledgeVersion: "1" });
  const withRead = await driftFor(w.firm, work);
  assert.equal(withRead.observed_from, "read");
  assert.equal(withRead.relevant, false);
  // A Work with NEITHER answers null all the way down, and never a confident "no drift".
  const bare = await workWithTask(w.firm, w.clientB, w.bookkeeper);
  const none = await driftFor(w.firm, bare.work);
  assert.equal(none.observed_from, null);
  assert.equal(none.observed_version, null);
  assert.equal(none.drifted, null);
  assert.equal(none.relevant, null);
});

cell("p658.drift.lanes — the human door floors at viewer and binds the session firm; the twin names it", async () => {
  const w = await retrievalWorld("lanes");
  const { work, task } = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  await recordRead({ task, run: RUN(13), keys: ["sst_regime"], knowledgeVersion: "1" });
  const asViewer = await drift(w.viewer, work);
  assert.equal(asViewer.work_id, work);
  assert.equal(asViewer.observed_from, "read");
  const stranger = randomUUID();
  await rootQuery("insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [stranger, "p658 lanes stranger", `p658_lanes_${stranger.slice(0, 8)}@rig.test`]);
  await assertRaises(CLR.authz, () => drift(stranger, work), "a caller with no active membership");
  // The human door takes the firm from the SESSION: another firm's viewer gets a not-found.
  const other = await retrievalWorld("lanes_other");
  await assertRaises(CLR.notFound, () => drift(other.viewer, work), "another firm's Work");
  // The runtime twin REQUIRES p_firm and refuses another firm's Work with no oracle.
  await assertRaises(CLR.badRequest, () => driftFor(null, work), "the twin without p_firm");
  const foreign = await assertRaises(CLR.notFound, () => driftFor(other.firm, work), "another firm's Work");
  const absent = await assertRaises(CLR.notFound, () => driftFor(other.firm, randomUUID()), "an absent Work");
  assert.equal(foreign.message, absent.message);
  // The ungranted core is reachable by nobody.
  for (const role of ["clara_authenticated", "clara_runtime", "clara_agent_ro"]) {
    const r = await rootQuery(
      "select has_function_privilege($1,'clara._work_knowledge_drift_core(uuid,uuid)','EXECUTE') as ok", [role]);
    assert.equal(r.rows[0].ok, false, `${role} must not reach the ungranted core directly`);
  }
});

cell("p658.drift.isolation — another firm's revision never moves this Work's drift", async () => {
  const w = await retrievalWorld("iso");
  const other = await retrievalWorld("iso_other");
  await capture(w.owner, { key: "sst_regime", value: "sales_tax", client: w.clientA });
  const a = await retrieve({ client: w.clientA, firm: w.firm, limit: 200 });
  const { work, task } = await workWithTask(w.firm, w.clientA, w.bookkeeper);
  await recordRead({ task, run: RUN(14), keys: ["sst_regime"], knowledgeVersion: a.knowledge_version });
  assert.equal((await driftFor(w.firm, work)).drifted, false);
  // Another FIRM captures, loudly and repeatedly.
  for (let i = 0; i < 3; i += 1) {
    await capture(other.owner, {
      key: "sst_regime", value: "both", client: other.clientA, appliesWhen: { n: i },
    });
  }
  assert.equal((await driftFor(w.firm, work)).drifted, false, "another firm's watermark is not this one's");
  // ...and neither is ANOTHER CLIENT's in the same firm, unless the rule is firm-scoped.
  await capture(w.owner, { key: "sst_regime", value: "both", client: w.clientB });
  assert.equal((await driftFor(w.firm, work)).drifted, false, "a sibling client's client-scope rule is not this client's basis");
  await capture(w.owner, { key: "coa_seed_decision", value: { seed: "firm" }, scope: "firm" });
  assert.equal((await driftFor(w.firm, work)).drifted, true, "a FIRM-scope rule IS this client's basis");
});

// =============================================================================================
// 6 · The negative the whole design turns on
// =============================================================================================

cell("p658.census.no_recut — the eight pinned bodies are byte-identical and get_context_pack has one overload", async () => {
  const pins = [
    ["clara.get_knowledge_pack(uuid,text,uuid)", "2deb725f00229f60a2fbbcc158fe656c5635cd220ec11727c182c39dc6c693fb"],
    ["clara.list_client_knowledge(uuid)", "32999fef181b09989994d40a9c12956f6107798b55eae0b45fce2806d2e7b691"],
    ["clara._knowledge_legacy_rows(uuid,uuid)", "65f4f0f3db1ab64cfa2e4ef55cc850fa9f2176009ac5271c57030e18706ff35a"],
    ["clara._knowledge_capture_core(uuid,text,uuid,text,jsonb,jsonb,date,date,text,text,jsonb,uuid,text,text,text,text)",
      "2c8526b82d54ac0aa49c77c3be277be5ecd9cad73df0fec63908d67a0681b01b"],
    ["clara._knowledge_floor(text,text)", "5e4d80691226a6b0bc80dc45c50a6089db5f3a3f7e905f782a0c99c6db8820ca"],
    ["clara.capture_knowledge(text,jsonb,text,text,text,uuid,text,jsonb,date,date,jsonb)",
      "b9f1cf6b4aa54c9b26dfad6d8a256d5812f3660bf5b65a39e399bbca9be1009e"],
    ["clara.get_context_pack(uuid,text)", "1a0312c9b80555a6e3cf41347b65ac52fa4e45d6a714e23d65ad6646336de81b"],
    ["clara.answer_work_question(uuid,integer,jsonb,text)", "15a82c080d102e61ebdead2280577072a87c21720375174e83c86a7198fb07a7"],
  ];
  for (const [sig, want] of pins) {
    const r = await rootQuery(
      "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure",
      [sig]);
    assert.equal(r.rows[0].sha, want, `${sig} is NOT at its measured pre-0230 body -- 0230 recuts nothing`);
  }
  const overloads = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='get_context_pack'`);
  assert.equal(overloads.rows[0].n, 1, "0109:361's exactly-one-overload assertion");
  // Every name 0230 installs resolves to EXACTLY ONE pg_proc row (0103:1055-1070's census).
  const names = ["retrieve_knowledge", "read_knowledge_record_for", "read_knowledge_history_for",
    "record_work_knowledge_read", "work_knowledge_drift", "work_knowledge_drift_for",
    "list_work_knowledge_reads_for_record", "_work_knowledge_drift_core"];
  for (const name of names) {
    const r = await rootQuery(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara' and p.proname=$1`, [name]);
    assert.equal(r.rows[0].n, 1, `clara.${name} must have exactly one pg_proc row`);
  }
  // The CORE tier is small and enumerable -- the mitigation for "a required read can stop
  // legitimate accounting". Measured, not assumed.
  const core = await coreKeys();
  assert.ok(core.length > 0 && core.length <= 40,
    `the CORE tier enumerates ${core.length} key(s); a required-read terminal over more than that stops legitimate accounting`);
});
