// #965 — THE RUNTIME HALF of "a file refused at intake creation leaves a committed record".
// PURE unit test: a stub DB client and a real (temp-dir) spool. No Postgres.
//
// WHAT THE DB HALF ALREADY PROVES, and is never re-proved here: that
// `clara.create_document_intake` commits the refused intake at failed/limit and RETURNS a refusal
// outcome naming its ceiling, firm, file and moment. That lives in
// `packages/db/tests/intake-refusal-record.test.mjs`, against real least-privileged roles.
//
// WHAT ONLY THIS FILE CAN SHOW. The Agent Brief's second key interface: "Every caller handles the
// refusal as a returned outcome, not only as a caught exception." There are exactly two callers of
// that door in this estate — `beginDocumentIntake` (lib/intake.mjs), reached by
// `POST /api/intake/documents` with no batch, and `beginIntakeInBatch` (lib/intake-batches.mjs),
// reached by the same route WITH a batch id. A returned refusal that either of them mistook for an
// admission would mint an upload capability for a file the database never admitted, or roll the
// very record this ticket exists to keep.
//
// THE SEAMS ARE THE TWO EXPORTED FUNCTIONS, driven for real. The sidecar is observed through
// spool.mjs's own `readIntakeMeta`, against a temp `CLARA_SPOOL_DIR`, because "no sidecar was
// written" is a filesystem fact and a stub cannot assert it.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beginDocumentIntake, intakeLimitRefusal, mapIntakeError } from "../lib/intake.mjs";
import { beginIntakeInBatch } from "../lib/intake-batches.mjs";
import { readIntakeMeta } from "../lib/spool.mjs";

const ADMITTED_INTAKE = "11111111-1111-4111-8111-111111111111";
const REFUSED_INTAKE = "22222222-2222-4222-8222-222222222222";
const FIRM = "33333333-3333-4333-8333-333333333333";
const ALICE = "44444444-4444-4444-8444-444444444444";

const INPUT = Object.freeze({
  filename: "p965.pdf", mime: "application/pdf", declared_bytes: 1048576,
  origin: "documents_tab", session_id: null,
});

/** The refusal receipt `clara.create_document_intake` returns since migration 0254, copied field
 *  for field from the shape the DB battery asserts — never re-derived here. */
const REFUSAL_RECEIPT = Object.freeze({
  intake_id: REFUSED_INTAKE, reservation_id: null, status: "failed", failure_code: "limit",
  refused: true, ceiling: "documents", firm_id: FIRM, filename: "p965.pdf",
  refused_at: "2026-09-20T04:00:00.000Z",
  reason: "document daily limit reached (docs)",
});

/** The admission receipt the same door has returned since 0007, unchanged by this ticket. */
const ADMITTED_RECEIPT = Object.freeze({
  intake_id: ADMITTED_INTAKE, reservation_id: "55555555-5555-4555-8555-555555555555",
  status: "uploading", expires_at: "2026-09-20T04:15:00.000Z",
});

/** A stub connection that answers every `select clara.<fn>(…) as receipt` with `receipt`. */
function stubClient(receipt) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      return { rows: [{ receipt }] };
    },
  };
}

let root;
let prevSpool;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-p965-"));
  prevSpool = process.env.CLARA_SPOOL_DIR;
  process.env.CLARA_SPOOL_DIR = join(root, "spool");
});

after(async () => {
  if (prevSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = prevSpool;
  await rm(root, { recursive: true, force: true }).catch(() => {});
});

test("p965.runtime.begin_returns_the_refusal — a ceiling refusal comes back as an OUTCOME, mints no capability and writes no sidecar", async () => {
  const client = stubClient(REFUSAL_RECEIPT);
  const out = await beginDocumentIntake(client, { sub: ALICE, firmId: FIRM }, INPUT);

  assert.equal(out.refused, true, "the caller sees a RETURNED refusal, not a thrown one");
  assert.equal(out.intake_id, REFUSED_INTAKE, "…naming the record the door committed");
  assert.equal(out.failure_code, "limit");
  assert.equal(out.ceiling, "documents", "…and which ceiling refused it");
  assert.equal(out.reason, "document daily limit reached (docs)",
    "the database's own sentence travels verbatim");
  assert.equal(out.upload_token ?? null, null,
    "NO upload capability is minted for a file the database never admitted");

  assert.equal(await readIntakeMeta(REFUSED_INTAKE), null,
    "…and NO sidecar is written: recoverPendingDocumentIntakes would otherwise re-drive a refused "
    + "intake every sweep until its TTL expired it");
  assert.equal(client.calls.length, 1,
    "exactly one door call — the refusal path adds no second statement, and in particular never "
    + "calls fail_document_intake on a row the database already failed");
});

test("p965.runtime.begin_still_admits — the ACCEPTED path is byte-unchanged: a token, an expiry and a sidecar", async () => {
  const client = stubClient(ADMITTED_RECEIPT);
  const out = await beginDocumentIntake(client, { sub: ALICE, firmId: FIRM }, INPUT);

  assert.equal(out.refused ?? false, false, "an admission is not a refusal");
  assert.equal(out.intake_id, ADMITTED_INTAKE);
  assert.ok(typeof out.upload_token === "string" && out.upload_token.length > 0,
    "the capability is still minted");
  assert.ok(out.expires_at, "…with its expiry");

  const meta = await readIntakeMeta(ADMITTED_INTAKE);
  assert.ok(meta, "the sidecar is still written — this is the control for the refusal cell above");
  assert.equal(meta.status, "uploading");
  assert.equal(meta.firmId, FIRM);
});

test("p965.runtime.uploader_answer_unchanged — the refusal's wire answer is byte-identical to the CLR18 one it replaces", () => {
  // THE ACCEPTANCE CRITERION, at the function `sendError` actually calls. Before #965 a ceiling
  // refusal reached the uploader as a raised CLR18 mapped by `mapIntakeError`; after it, the route
  // mints `intakeLimitRefusal()` from a RETURNED outcome. Both are mapped by the SAME function, so
  // comparing the two mappings is the honest way to say "unchanged in wording" without a server.
  const raised = new Error("document daily limit reached (docs)");
  raised.code = "CLR18";
  const before = mapIntakeError(raised);
  const after = mapIntakeError(intakeLimitRefusal());

  assert.deepEqual(after, before,
    "status, code and message are all unchanged — the person uploading cannot tell the two apart");
  assert.deepEqual(after, { status: 429, code: "limit", message: "intake limit reached" },
    "…and that answer is still the shipped 429 `intake limit reached`");
});

// ---------------------------------------------------------------------------------------------
// THE BATCH CALLER. The Agent Brief's third key interface: "The batch-member capacity belt does
// not pick this up for free: it observes a failure-reason transition on an intake that ALREADY
// exists, so a record BORN refused does not move it. If the refused file was uploaded into an open
// batch, the member's capacity wait must land through the governed member-dependency path."
//
// It does, and it has to, for a second reason the belt cannot help with either: `beginIntakeInBatch`
// opens an EXPLICIT transaction so the begin and the attach commit together, and the pre-#965 code
// answered every failure with `rollback` — which would now throw away the very record this ticket
// exists to keep.
// ---------------------------------------------------------------------------------------------

const BATCH = "66666666-6666-4666-8666-666666666666";
const MEMBER = "77777777-7777-4777-8777-777777777777";

/** A pg error exactly as node-postgres shapes one: SQLSTATE on `.code`, detail as a JSON STRING. */
function pgError(code, message, detail = null) {
  const err = new Error(message);
  err.code = code;
  if (detail) err.detail = JSON.stringify(detail);
  return err;
}

/** A stub connection recording the STATEMENT HEADS it sees, answering each door from `answer`. */
function txnClient(answer) {
  const sqls = [];
  return {
    sqls,
    query: async (sql) => {
      const text = String(sql);
      sqls.push(text.startsWith("select clara.") ? text.slice(13).split("(")[0] : text.trim());
      return { rows: [{ result: answer(text) }] };
    },
  };
}

const refusedBegin = async () => Object.freeze({
  refused: true, intake_id: REFUSED_INTAKE, status: "failed", failure_code: "limit",
  ceiling: "documents", firm_id: FIRM, filename: "p965.pdf",
  refused_at: "2026-09-20T04:00:00.000Z", reason: "document daily limit reached (docs)",
});

test("p965.runtime.refused_in_batch_is_a_waiting_member — the record COMMITS and the wait lands through the governed door", async () => {
  const cleaned = [];
  const client = txnClient((sql) => {
    if (sql.includes("attach_intake_to_batch")) return { member_id: MEMBER, batch_id: BATCH };
    if (sql.includes("set_intake_batch_member_dependency")) {
      return { member_id: MEMBER, dependency: "awaiting_capacity" };
    }
    return {};
  });

  const out = await beginIntakeInBatch({
    client,
    principal: { sub: ALICE, firmId: FIRM },
    input: INPUT,
    batchId: BATCH,
    opKey: "k",
    begin: refusedBegin,
    cleanup: async (id) => { cleaned.push(id); },
  });

  assert.equal(out.refused, true, "the refusal is handed up as an OUTCOME, exactly as the non-batch path does");
  assert.equal(out.intake_id, REFUSED_INTAKE);
  assert.equal(out.batch_id, BATCH);
  assert.equal(out.member_id, MEMBER, "a refused file IS a member — the batch read never shows a silent absence");
  assert.equal(out.dependency, "awaiting_capacity", "…and its wait is explicit");

  assert.ok(client.sqls.includes("commit"), "the committed refusal record SURVIVES — this is the whole ticket");
  assert.ok(!client.sqls.includes("rollback"),
    "…and is never rolled back, which is what the pre-#965 code did with every failure");
  assert.ok(client.sqls.includes("attach_intake_to_batch"), "the member is created through the governed attach door");
  assert.ok(client.sqls.includes("set_intake_batch_member_dependency"),
    "…and the capacity wait lands through the GOVERNED member-dependency door, never by touching the row");
  assert.deepEqual(cleaned, [],
    "no sidecar was written for a refused begin, so there is none to drop");
});

test("p965.runtime.refused_in_batch_keeps_the_record_when_the_batch_refuses — a closed batch loses the member, never the record", async () => {
  const client = txnClient((sql) => {
    if (sql.includes("attach_intake_to_batch")) {
      throw pgError("CLR13", "this intake batch is no longer open", { reason: "batch_not_open", state: "cancelling" });
    }
    return {};
  });

  const out = await beginIntakeInBatch({
    client,
    principal: { sub: ALICE, firmId: FIRM },
    input: INPUT,
    batchId: BATCH,
    opKey: "k",
    begin: refusedBegin,
  });

  assert.equal(out.refused, true);
  assert.equal(out.member_id, null, "the refused file joined no batch…");
  assert.equal(out.dependency, null, "…so there is no member to declare a dependency on");
  assert.ok(client.sqls.some((s) => s.startsWith("savepoint")),
    "a SAVEPOINT guards the attach — a refused door call aborts the transaction, and `commit` on an "
    + "aborted transaction is a ROLLBACK that would take the refusal record with it");
  assert.ok(client.sqls.some((s) => s.startsWith("rollback to savepoint")),
    "…and the abort is unwound to it, never past it");
  assert.ok(client.sqls.includes("commit"), "the refusal record is still COMMITTED");
  assert.ok(!client.sqls.includes("rollback"), "…never rolled back");
});
