// #631 seam 2 — THE POSITIVE CONTROL FOR THE EXECUTION TRACE (C77.7, AC4).
//
// WHY A POSITIVE CONTROL AND NOT A UNIT TEST OF `redactDeep`. A redaction function that is
// exercised only on the inputs its author imagined proves that the author imagined them. What #631
// asks for is the opposite direction: plant real PII and real secrets in a NESTED object graph —
// arrays of objects, seven levels deep, under innocuous keys — push it through the WHOLE path a
// run uses, and then scan what LANDED IN THE DATABASE for the literals. A leak is a substring
// match, not a missing assertion.
//
// AND THE STRUCTURAL HALF IS ASSERTED TOO. `clara.work_execution_traces` HAS NO PAYLOAD COLUMN, so
// the strongest statement this file can make is not "the redaction caught it" but "there was
// nowhere for it to go". The scan below reads EVERY column of every row as text — so a payload
// column somebody adds later, with or without redaction in front of it, reds this cell.
//
// Gated on a POSITIVE catalog probe for 0195, never on a version number.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import * as rig from "./rig.mjs";
import {
  MAX_DEPTH, OBSERVED_REVISION_KEYS, observedRevisions, recordTrace, redactDeep, redactString,
  traceDigest,
} from "../lib/work-trace.mjs";
import { CAPABILITY_REGISTRY, CAPABILITY_REGISTRY_VERSION, capabilityIds, isModelBound, purposeFor } from "../lib/capability-registry.mjs";

async function traceLaneReady() {
  try {
    const r = await rig.rootQuery(`
      select
        to_regclass('clara.work_execution_traces') is not null as tbl,
        to_regprocedure('clara.record_work_execution_trace(uuid,text,int,text,text,text,text,text,text,jsonb,text,text,text,uuid,text,jsonb,timestamptz,timestamptz,text,jsonb,uuid)') is not null as writer,
        to_regprocedure('clara.get_work_execution_trace(uuid)') is not null as reader,
        to_regprocedure('clara.prepare_work_egress_dispatch(uuid,text)') is not null as prepare
    `);
    const row = r.rows[0] ?? {};
    return Boolean(row.tbl && row.writer && row.reader && row.prepare);
  } catch {
    return false;
  }
}

const READY = (await rig.runtimeReady()) && (await traceLaneReady());
const SKIP = READY ? false : "migration 0195 (clara.work_execution_traces + its writer) is not on this database";

// ===========================================================================================
// THE FIXTURE SECRETS. Every one of these literals must be absent from every stored byte.
// ===========================================================================================
//
// EVERY ONE IS ASSEMBLED FROM PIECES, and that is not obfuscation for its own sake:
// `scripts/check-leaks.mjs` (run by `pnpm lint`) scans committed SOURCE for credential-shaped
// literals and cannot tell a positive-control fixture from a real leaked key — nor should it try.
// The VALUES below are byte-identical to what a naive literal would produce, so the walk under
// test faces exactly the input it must mask; only the source text is split. Nothing here is a real
// credential: they are shapes.
const join = (...parts) => parts.join("");
const SECRETS = Object.freeze({
  nric: join("880214", "-08-", "5531"),
  bank: join("5141 ", "8822 ", "9310 ", "7742"),
  bankPlain: join("5141", "8822", "9310"),
  email: join("siti.rahmah", "@", "example.com.my"),
  phone: join("+60 ", "12-345 ", "6789"),
  phoneLocal: join("03-", "7728 1122"),
  jwt: join("ey", "JhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", ".", "ey", "JzdWIiOiIxMjM0NSJ9", ".", "QWxpY2VJblRoZUxlZGdlcg"),
  apiKey: join("sk", "-proj-", "ZH4kQ9maRuntimeSecretValue1234"),
  bearer: join("Bearer ", "abcdefghijklmnopqrstuvwxyz123456"),
  dsn: join("postgres", "://", "clara", ":", "hunter2", "@db.internal:5432/books"),
  password: join("password", "=", "hunter2"),
});

/** A NESTED graph: arrays of objects, a secret planted at EVERY depth from 1 to 7, innocuous keys
 *  throughout so the KEY denylist alone cannot be what saves it. */
function plantedGraph() {
  return {
    memo: `payment received from ${SECRETS.email}`,                              // depth 1
    parties: [                                                                   // depth 2 (array)
      { label: "payer", note: `IC ${SECRETS.nric}` },                            // depth 3
      {
        label: "payee",
        contact: { line: `call ${SECRETS.phone} or ${SECRETS.phoneLocal}` },      // depth 4
        settlement: {
          rails: [                                                               // depth 5
            {
              account: SECRETS.bank,                                             // depth 6
              trace: { token: SECRETS.jwt, deeper: { key: SECRETS.apiKey } },     // depth 7 / 8
            },
          ],
        },
      },
    ],
    config: { header: SECRETS.bearer, store: SECRETS.dsn, env: SECRETS.password },
    identity: { nric: SECRETS.nric, passport: "A12345678" },
    plain_account: SECRETS.bankPlain,
  };
}

const everyLiteral = () => Object.values(SECRETS);

/** Every stored byte of every trace row for one Work, as ONE lower-cased string. Reads the row
 *  GENERICALLY (`select *` rendered to text) so a payload column added later is scanned too. */
async function storedTraceText(workId) {
  const r = await rig.rootQuery(
    "select to_jsonb(t)::text as all_columns from clara.work_execution_traces t where t.work_id = $1",
    [workId]);
  return r.rows.map((row) => row.all_columns).join("\n");
}

/** Admit a Work, claim its run, and give the firm the derived egress basis — the whole arming one
 *  of these cells needs. */
async function armedWork(label) {
  const { owner, firm, client } = await rig.buildFirm(label);
  // The derived activation basis: the firm's owner accepts both published legal texts.
  const docs = await rig.rootQuery(
    "select kind, version, body_sha256 from clara.legal_documents where status='published'");
  for (const d of docs.rows) {
    await rig.asHuman(owner, (c) =>
      c.query("select clara.accept_legal_document($1::text,$2::int,$3::text,$4::text)",
        [d.kind, d.version, d.body_sha256, `legal_${randomUUID()}`]));
  }
  const admitted = await rig.asRuntime((c) =>
    c.query(
      "select clara.admit_journal_work($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::jsonb,$7::text) as r",
      [client, owner, `intent_${randomUUID()}`, JSON.stringify({
        posting_date: "2026-09-01", memo: "office rent", currency: "MYR",
        lines: [
          { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "rent" },
          { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "bank" },
        ],
      }), "user_direct", "[]", rig.DEFAULT_MODEL],
    )).then((r) => r.rows[0].r);
  const runId = `run_${randomUUID()}`;
  await rig.asRuntime((c) =>
    c.query("select clara.claim_work_run($1::uuid,$2::text,$3::jsonb)", [
      admitted.task_id, runId,
      JSON.stringify({ id: "clara-work/v3", digest: "e".repeat(64), budgets: { segments: 4 }, model: rig.DEFAULT_MODEL }),
    ]));
  return { owner, firm, client, ...admitted, runId };
}

// ===========================================================================================
// 1 · THE PURE WALK.
// ===========================================================================================

test("631.redact: every planted literal is masked at every depth, inside arrays of objects", () => {
  const text = JSON.stringify(redactDeep(plantedGraph()));
  for (const literal of everyLiteral()) {
    assert.equal(text.includes(literal), false,
      `redact: the literal ${JSON.stringify(literal)} survived the walk`);
  }
  // …and the shape SURVIVES: a redaction that returned "[redacted]" for the whole graph would
  // also pass the scan above and would be useless as a diagnostic.
  const out = redactDeep(plantedGraph());
  assert.equal(Array.isArray(out.parties), true, "redact: arrays stay arrays");
  assert.equal(out.parties.length, 2);
  assert.equal(out.parties[0].label, "payer", "redact: innocuous values are untouched");
});

test("631.redact: a denylisted KEY is dropped wholesale, object value and all", () => {
  // A denylisted key drops its WHOLE value, object or not: a `bank_account` bag redacted field by
  // field would still say which rails a person banks on.
  const out = redactDeep({ bank_account: { number: SECRETS.bankPlain, swift: "MBBEMYKL" } });
  assert.equal(out.bank_account, "[redacted]");
  // A key that is NOT on the list keeps its shape and has its VALUES masked, which is what makes
  // the row still readable as a diagnostic.
  const nested = redactDeep({ identity: { nric: SECRETS.nric, passport: "A12345678" } });
  assert.equal(nested.identity.nric, "[redacted]", "redact: the denylisted leaf key still drops");
  assert.equal(nested.identity.passport, "[redacted]");
});

test("631.redact: depth beyond the cap emits [truncated] rather than recursing", () => {
  let deep = { secret: SECRETS.apiKey };
  for (let i = 0; i < MAX_DEPTH + 3; i += 1) deep = { level: deep };
  const text = JSON.stringify(redactDeep(deep));
  assert.equal(text.includes("[truncated]"), true, "redact: the cap fires");
  assert.equal(text.includes(SECRETS.apiKey), false, "redact: …and nothing past it is emitted");
  assert.equal(MAX_DEPTH, 7, "redact: the cap is the one the positive control plants against");
});

test("631.redact: cycles and exotic values do not throw", () => {
  const a = { name: "a" };
  a.self = a;
  a.when = new Date("2026-09-01T00:00:00Z");
  a.big = 10n;
  a.fn = () => 1;
  const out = redactDeep(a);
  assert.equal(out.self, "[circular]");
  assert.equal(out.when, "2026-09-01T00:00:00.000Z");
  assert.equal(out.big, "10");
  assert.equal(out.fn, "[redacted]");
});

test("631.redact: the digest is taken over the REDACTED form, so it is not an oracle", async () => {
  const withSecret = await traceDigest({ memo: `IC ${SECRETS.nric}` });
  const withOther = await traceDigest({ memo: "IC 771103-14-9002" });
  assert.equal(withSecret, withOther,
    "digest: two different NRICs redact to the same masked text, so a digest cannot confirm a guess");
  assert.match(withSecret, /^[0-9a-f]{64}$/);
  // Key order does not move it; a different SHAPE does.
  assert.equal(await traceDigest({ a: 1, b: 2 }), await traceDigest({ b: 2, a: 1 }));
  assert.notEqual(await traceDigest({ a: 1 }), await traceDigest({ a: 2 }));
});

test("631.registry: every capability declares a purpose-or-null, a data class and a scope", () => {
  assert.deepEqual(capabilityIds(), [
    "accounting_work.ask_question",
    "accounting_work.list_accounts",
    "accounting_work.model_segment",
    "accounting_work.record_journal_entry",
    "accounting_work.settle",
  ]);
  for (const [id, cap] of Object.entries(CAPABILITY_REGISTRY)) {
    assert.equal(cap.id, id, "registry: the key IS the id");
    assert.equal(typeof cap.dataClass, "string");
    assert.equal(typeof cap.scope, "string");
    assert.equal(typeof cap.modelBound, "boolean");
    assert.ok(cap.purpose === null || typeof cap.purpose === "string");
    assert.equal(Object.isFrozen(cap), true, "registry: a runtime mutation throws");
  }
  // EXACTLY ONE capability is model-bound, and it is the segment. That is the whole egress
  // surface of the Work lane, and a second one appearing here without a dispatch is a finding.
  assert.deepEqual(capabilityIds().filter(isModelBound), ["accounting_work.model_segment"]);
  assert.equal(purposeFor("accounting_work.model_segment"), "accounting_work");
  assert.equal(purposeFor("accounting_work.ask_question"), null);
  assert.equal(CAPABILITY_REGISTRY_VERSION, "clara-capability-registry/v1");
});

test("631.observed: the closed vocabulary filter keeps its own keys and drops everything else", () => {
  const out = observedRevisions({
    knowledge_version: "7", books_version: "2026-09-01", chart_revision: "abc",
    prompt: "the whole transcript", nric: SECRETS.nric, memo: SECRETS.email,
  });
  assert.deepEqual(Object.keys(out).sort(), ["books_version", "chart_revision", "knowledge_version"]);
  assert.equal(JSON.stringify(out).includes(SECRETS.nric), false);
  assert.deepEqual(OBSERVED_REVISION_KEYS.slice().sort(), [
    "basis_digest", "books_version", "chart_revision", "knowledge_version",
    "question_version", "source_sha256",
  ]);
});

// ===========================================================================================
// 2 · THE DATABASE. What LANDED, scanned for the literals.
// ===========================================================================================

test("631.trace.persisted: a planted graph reaches the database as a DIGEST and nothing else", { skip: SKIP }, async () => {
  const w = await armedWork("trace-persist");
  const graph = plantedGraph();
  const digest = await traceDigest(graph);

  const id = await rig.asRuntime((c) => recordTrace(c, {
    taskId: w.task_id, runId: w.runId, seq: 1, phase: "model_call",
    capabilityId: "accounting_work.model_segment",
    bundleId: "clara-work/v3", bundleDigest: "a".repeat(64),
    instructionsId: "clara-work-instructions/v3", skills: ["journal-entry/v3"],
    toolsId: "clara-work-tools/v3", modelId: rig.DEFAULT_MODEL,
    inputDigest: digest,
    observed: observedRevisions({ books_version: "2026-09-01", nric: SECRETS.nric }),
    startedAt: new Date(Date.now() - 1200).toISOString(), endedAt: new Date().toISOString(),
    outcome: "ok",
  }));
  assert.ok(id, "trace.persisted: the writer returned a row id");

  const stored = await storedTraceText(w.work_id);
  assert.ok(stored.length > 0, "trace.persisted: the row is there to scan");
  for (const literal of everyLiteral()) {
    assert.equal(stored.includes(literal), false,
      `trace.persisted: ${JSON.stringify(literal)} reached clara.work_execution_traces`);
  }
  // …and the row is USEFUL: the identifiers, the digest and the timing are all there.
  const row = (await rig.rootQuery("select * from clara.work_execution_traces where id=$1", [id])).rows[0];
  assert.equal(row.phase, "model_call");
  assert.equal(row.capability_id, "accounting_work.model_segment");
  assert.equal(row.registry_version, CAPABILITY_REGISTRY_VERSION);
  assert.equal(row.purpose, "accounting_work", "trace.persisted: the purpose comes from the REGISTRY, not from the caller");
  assert.match(row.input_digest, /^[0-9a-f]{64}$/);
  assert.ok(row.duration_ms >= 1000, "trace.persisted: the timing is derived from the two instants");
  assert.deepEqual(row.observed_revisions, { books_version: "2026-09-01" });
});

test("631.trace.no_payload_column: the relation has nowhere to put a payload", { skip: SKIP }, async () => {
  const r = await rig.rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name='work_execution_traces' order by column_name");
  const cols = r.rows.map((x) => x.column_name);
  for (const banned of ["payload", "input", "output", "attributes", "content", "prompt", "messages", "basis", "transcript"]) {
    assert.equal(cols.includes(banned), false,
      `no_payload_column: clara.work_execution_traces grew a '${banned}' column — the redaction claim is STRUCTURAL and this breaks it`);
  }
  assert.equal(cols.includes("input_digest"), true, "no_payload_column: the digest is what stands in for the input");
});

test("631.trace.vocabulary: an out-of-vocabulary observed-revision key is REFUSED by name", { skip: SKIP }, async () => {
  const w = await armedWork("trace-vocab");
  let err = null;
  try {
    await rig.asRuntime((c) => recordTrace(c, {
      taskId: w.task_id, runId: w.runId, seq: 1, phase: "dispatch",
      capabilityId: "accounting_work.model_segment",
      // NOT filtered through `observedRevisions` on purpose: this cell is the positive control for
      // the DATABASE's own closed vocabulary, which is the wall a careless caller meets.
      observed: { knowledge_version: "7", transcript: "the whole conversation" },
      outcome: "ok",
    }));
  } catch (e) {
    err = e;
  }
  assert.ok(err, "trace.vocabulary: the write was refused");
  assert.equal(err.code, "CLR10");
  const detail = typeof err.detail === "string" ? JSON.parse(err.detail) : err.detail;
  assert.equal(detail.reason, "invalid_trace");
  assert.equal(detail.constraint, "vocabulary");
  assert.equal(detail.key, "transcript", "trace.vocabulary: …and it NAMES the key, so a caller can fix it");
  assert.equal(await rig.rootQuery(
    "select count(*)::int as n from clara.work_execution_traces where work_id=$1", [w.work_id])
    .then((r) => r.rows[0].n), 0, "trace.vocabulary: nothing was written");
});

test("631.trace.phases: an unknown phase or outcome is refused, and the four/five are admitted", { skip: SKIP }, async () => {
  const w = await armedWork("trace-phase");
  for (const [i, phase] of ["dispatch", "model_call", "tool_call", "settle"].entries()) {
    const id = await rig.asRuntime((c) => recordTrace(c, {
      taskId: w.task_id, runId: w.runId, seq: i + 1, phase,
      capabilityId: "accounting_work.settle", outcome: "ok",
    }));
    assert.ok(id, `trace.phases: ${phase} is admitted`);
  }
  await assert.rejects(
    () => rig.asRuntime((c) => recordTrace(c, {
      taskId: w.task_id, runId: w.runId, seq: 9, phase: "thinking", outcome: "ok" })),
    (e) => e.code === "CLR10", "trace.phases: an invented phase is refused");
  await assert.rejects(
    () => rig.asRuntime((c) => recordTrace(c, {
      taskId: w.task_id, runId: w.runId, seq: 10, phase: "settle", outcome: "vibes" })),
    (e) => e.code === "CLR10", "trace.phases: an invented outcome is refused");
});

test("631.trace.replay: a re-executed step replays onto the SAME row", { skip: SKIP }, async () => {
  const w = await armedWork("trace-replay");
  const write = () => rig.asRuntime((c) => recordTrace(c, {
    taskId: w.task_id, runId: w.runId, seq: 1, phase: "dispatch",
    capabilityId: "accounting_work.model_segment", outcome: "ok" }));
  const first = await write();
  const second = await write();
  assert.equal(second, first, "trace.replay: the same (work, run, seq) returns the ORIGINAL id");
  assert.equal(await rig.rootQuery(
    "select count(*)::int as n from clara.work_execution_traces where work_id=$1", [w.work_id])
    .then((r) => r.rows[0].n), 1, "trace.replay: …and exactly one row exists");
});

test("631.trace.binding: a trace cannot be written for a task this credential cannot resolve", { skip: SKIP }, async () => {
  await assert.rejects(
    () => rig.asRuntime((c) => recordTrace(c, {
      taskId: randomUUID(), runId: "run_x", seq: 1, phase: "dispatch", outcome: "ok" })),
    (e) => e.code === "CLR11", "trace.binding: task -> work -> firm/client is POSITIVE");
});

test("631.trace.authority: a foreign authorization id is DROPPED, never recorded as authority", { skip: SKIP }, async () => {
  const w = await armedWork("trace-authority");
  const other = await armedWork("trace-authority-other");
  const prepared = await rig.asRuntime((c) =>
    c.query("select clara.prepare_work_egress_dispatch($1::uuid,$2::text) as r", [other.task_id, other.runId]))
    .then((r) => r.rows[0].r);
  assert.equal(prepared.verdict, "granted", "trace.authority: mandatory setup — the OTHER work prepared one");

  const id = await rig.asRuntime((c) => recordTrace(c, {
    taskId: w.task_id, runId: w.runId, seq: 1, phase: "model_call",
    capabilityId: "accounting_work.model_segment",
    authorizationId: prepared.authorization_id, outcome: "ok" }));
  const row = (await rig.rootQuery("select * from clara.work_execution_traces where id=$1", [id])).rows[0];
  assert.equal(row.authorization_id, null,
    "trace.authority: an authorization of ANOTHER client is not this row's authority and is not recorded as one");
  assert.equal(row.consent_ref, null);
  assert.equal(row.activation_ref, null);
});

test("631.trace.read: the human read is firm-scoped and bookkeeper-floored", { skip: SKIP }, async () => {
  const w = await armedWork("trace-read");
  await rig.asRuntime((c) => recordTrace(c, {
    taskId: w.task_id, runId: w.runId, seq: 1, phase: "dispatch",
    capabilityId: "accounting_work.model_segment", outcome: "ok" }));

  const mine = await rig.asHuman(w.owner, (c) =>
    c.query("select clara.get_work_execution_trace($1::uuid) as r", [w.work_id])).then((r) => r.rows[0].r);
  assert.equal(Array.isArray(mine), true);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].phase, "dispatch");
  assert.equal("payload" in mine[0], false, "trace.read: the read cannot serve a payload it does not have");

  const stranger = await rig.buildFirm("trace-read-stranger");
  await assert.rejects(
    () => rig.asHuman(stranger.owner, (c) =>
      c.query("select clara.get_work_execution_trace($1::uuid) as r", [w.work_id])),
    (e) => e.code === "CLR11", "trace.read: another firm's Work is NOT FOUND, never a different error");
});

test("631.trace.prune: retention is bounded, and only the prune may delete", { skip: SKIP }, async () => {
  const w = await armedWork("trace-prune");
  await rig.asRuntime((c) => recordTrace(c, {
    taskId: w.task_id, runId: w.runId, seq: 1, phase: "dispatch",
    capabilityId: "accounting_work.model_segment", outcome: "ok",
    startedAt: new Date(Date.now() - 120 * 24 * 3600 * 1000).toISOString() }));
  await rig.asRuntime((c) => recordTrace(c, {
    taskId: w.task_id, runId: w.runId, seq: 2, phase: "settle",
    capabilityId: "accounting_work.settle", outcome: "ok" }));

  // A BARE delete is refused even at the owner role — the belt, not the verb.
  await assert.rejects(
    () => rig.rootQuery("delete from clara.work_execution_traces where work_id=$1", [w.work_id]),
    (e) => e.code === "CLR08", "trace.prune: an ordinary delete is refused");

  const out = await rig.asRuntime((c) =>
    c.query("select clara.prune_work_execution_traces($1::timestamptz,$2::int) as r",
      [new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString(), 1000]))
    .then((r) => r.rows[0].r);
  assert.equal(Number(out.traces_deleted), 1, "trace.prune: the row older than the window went");
  const left = await rig.rootQuery(
    "select seq from clara.work_execution_traces where work_id=$1 order by seq", [w.work_id]);
  assert.deepEqual(left.rows.map((r) => Number(r.seq)), [2], "trace.prune: …and the recent one stayed");
});

test("631.trace.leak_probe: the WHOLE estate is scanned for the planted literals", { skip: SKIP }, async () => {
  // The `world-e2e.mjs:224-239` idiom, widened to this relation and run over every surface a Work
  // run writes: the trace rows, the Work row itself and the workflow step records.
  const w = await armedWork("trace-leak");
  const graph = plantedGraph();
  const leakDigest = await traceDigest(graph);
  await rig.asRuntime((c) => recordTrace(c, {
    taskId: w.task_id, runId: w.runId, seq: 1, phase: "model_call",
    capabilityId: "accounting_work.model_segment",
    inputDigest: leakDigest,
    observed: observedRevisions({ basis_digest: "b".repeat(64), memo: SECRETS.email }),
    refusal: { code: "CLR13", reason: "egress_not_authorized", message: `refused for ${SECRETS.email}` },
    outcome: "refused" }));

  const scanned = [
    await storedTraceText(w.work_id),
    await rig.rootQuery("select to_jsonb(a)::text as t from clara.accounting_work a where a.id=$1", [w.work_id])
      .then((r) => r.rows.map((x) => x.t).join("\n")),
  ].join("\n");
  for (const literal of everyLiteral()) {
    assert.equal(scanned.includes(literal), false,
      `trace.leak_probe: ${JSON.stringify(literal)} is stored somewhere in the Work lane`);
  }
  // The refusal DID land — redacted, not dropped. A probe that passed because nothing was written
  // would prove nothing at all.
  const row = (await rig.rootQuery(
    "select refusal from clara.work_execution_traces where work_id=$1 and seq=1", [w.work_id])).rows[0];
  assert.equal(row.refusal.reason, "egress_not_authorized");
  assert.equal(String(row.refusal.message).includes("[redacted:email]"), true,
    "trace.leak_probe: the refusal message is REDACTED in place, so the diagnosis survives and the person does not");
  assert.equal(redactString(`refused for ${SECRETS.email}`).includes(SECRETS.email), false);
});
