// #633 AC1(c) — THE DURABLE UPLOAD RECEIPT, read the way the web surface reads it.
//
// The web half rehydrates a client's upload receipts at mount with a LIST-FORM query on
// `clara.document_intakes_visible` (`apps/web/lib/documents/receipts.ts`). That read is
// new; the view and its grant are not (0007:2233, grant 0007:2747). What these cells
// pin is the three properties the surface's honesty rests on:
//
//   p633.receipt.mask              — the list read's key set is EXACTLY the masked view's
//                                    projection, and carries NONE of 0007:2231-2232's
//                                    never-exposed columns. A surface that could see
//                                    `storage_key` or `token_hash` would be one accidental
//                                    `select *` away from publishing them.
//   p633.receipt.cross_firm        — firm B's persona reads ZERO of firm A's intakes, with
//                                    a non-vacuity control proving firm A's own persona
//                                    does see them (otherwise "zero rows" could mean the
//                                    fixture never wrote anything).
//   p633.receipt.unfiled_is_unassigned — an adopted, unfiled intake reads as UNASSIGNED to
//                                    its uploader and is attributed to no client. This is
//                                    the DB half of the receipts predicate's second arm
//                                    ("mine and unattributed"), which exists because
//                                    `document_intakes` HAS NO CLIENT COLUMN.
//
// EVERY ASSERTION RUNS THROUGH A LEAST-PRIVILEGED HUMAN PERSONA (`humanQuery`), never
// `rootQuery` — root is used only to build fixtures and to prove a fixture exists.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  ROLES, PG, rootQuery, humanQuery, roleQuery, assertRaises, ensureReady, endPool, buildWorld,
} from "./rig-fixtures.mjs";
import { docsReady, seedIntake, finalizeIntake } from "./rig-docs-fixtures.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

/** VERBATIM the projection `apps/web/lib/documents/intake.ts` (`readIntake`) and
 *  `apps/web/lib/documents/receipts.ts` (`listIntakeReceipts`) both ask for. Written out
 *  here rather than imported — packages/db never imports from apps/web — so a drift on
 *  either side reds this file instead of silently shipping. */
const WEB_INTAKE_COLS = [
  "id", "uploaded_by", "origin", "original_filename", "declared_mime", "declared_bytes",
  "status", "document_id", "failure_code", "expires_at", "created_at", "updated_at",
];

/** 0007:2231-2232's own list of columns the masked view must NEVER expose. */
const NEVER_EXPOSED = [
  "chat_session_id", "token_hash", "storage_key", "op_key",
  "upload_lease_owner", "lease_expires_at", "sha256", "firm_id",
];

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => { await endPool(); });

function unready(t) {
  if (!ready) { t.skip("document pipeline (0007) not present on this database"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

test("p633.receipt.mask — the list-form read's key set IS the masked view's projection, and carries no never-exposed column", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  const digest = sha(randomUUID());
  await seedIntake({
    firm, uploadedBy: world.users.alice, origin: "documents_tab", status: "verified",
    sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf`, filename: "mask-probe.pdf",
  });

  // The web read as the web issues it: an explicit column list, under the human persona.
  const rows = await humanQuery(
    world.users.alice,
    `select ${WEB_INTAKE_COLS.join(", ")} from clara.document_intakes_visible order by created_at desc limit 50`,
  );
  assert.ok(rows.rowCount >= 1, "control: the persona must actually see its firm's intakes");
  assert.deepEqual(
    rows.fields.map((f) => f.name), WEB_INTAKE_COLS,
    "the web's projection and the view's own column order must agree, in this order",
  );

  // And the VIEW ITSELF publishes exactly that set — so a future `select *` could not
  // widen the surface without this cell noticing.
  const cols = await rootQuery(
    `select column_name from information_schema.columns
      where table_schema='clara' and table_name='document_intakes_visible' order by ordinal_position`,
  );
  assert.deepEqual(cols.rows.map((r) => r.column_name), WEB_INTAKE_COLS);
  for (const hidden of NEVER_EXPOSED) {
    assert.equal(
      cols.rows.some((r) => r.column_name === hidden), false,
      `the masked view must never expose ${hidden} (0007:2231-2232)`,
    );
  }

  // NON-VACUITY on the masking itself: the BASE table really does hold those columns,
  // and a human role cannot read it at all.
  const base = await rootQuery(
    `select column_name from information_schema.columns
      where table_schema='clara' and table_name='document_intakes'`,
  );
  for (const hidden of ["storage_key", "token_hash", "chat_session_id"]) {
    assert.ok(base.rows.some((r) => r.column_name === hidden), `control: ${hidden} exists on the base table`);
  }
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery(ROLES.authenticated, "select count(*) from clara.document_intakes"),
    "a human role must have NO base-table grant on document_intakes",
  );
});

test("p633.receipt.cross_firm — firm B's persona sees ZERO of firm A's receipts (with a non-vacuity control)", async (t) => {
  if (unready(t)) return;
  const firmA = await firmOf(world.clients.A1);
  const digest = sha(randomUUID());
  const intake = await seedIntake({
    firm: firmA, uploadedBy: world.users.alice, origin: "documents_tab", status: "verified",
    sha256: digest, storageKey: `firms/${firmA}/docs/${digest}.pdf`, filename: "cross-firm-probe.pdf",
  });

  // NON-VACUITY FIRST: firm A's own persona must see it, or "zero rows" below proves nothing.
  const mine = await humanQuery(
    world.users.alice,
    "select id from clara.document_intakes_visible where id = $1",
    [intake],
  );
  assert.equal(mine.rowCount, 1, "control: firm A's persona sees firm A's intake");

  // dave is firm B's owner (buildWorld). The row is addressed BY ID, so this is not a
  // filter test — it is a tenancy test.
  const theirs = await humanQuery(
    world.users.dave,
    "select id from clara.document_intakes_visible where id = $1",
    [intake],
  );
  assert.equal(theirs.rowCount, 0, "a foreign firm's persona must see nothing, not even by exact id");

  // And the whole list read, unfiltered, must contain none of firm A's rows either.
  const list = await humanQuery(
    world.users.dave,
    `select id from clara.document_intakes_visible order by created_at desc limit 500`,
  );
  assert.equal(
    list.rows.some((r) => r.id === intake), false,
    "firm A's receipt must not appear anywhere in firm B's list read",
  );
});

test("p633.receipt.unfiled_is_unassigned — an adopted, unfiled intake is attributed to NO client and reads as unassigned", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  const digest = sha(randomUUID());
  const intake = await seedIntake({
    firm, uploadedBy: world.users.alice, origin: "documents_tab", status: "verified",
    sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf`, filename: "unfiled-probe.pdf",
  });
  // Finalize with NO client and NO resolution — the exact shape the firm lane produces.
  await finalizeIntake({ intake });

  const row = await humanQuery(
    world.users.alice,
    "select status, document_id from clara.document_intakes_visible where id = $1",
    [intake],
  );
  assert.equal(row.rowCount, 1);
  assert.ok(["finalized", "adopted"].includes(row.rows[0].status), `expected an adopted intake, saw ${row.rows[0].status}`);
  const documentId = row.rows[0].document_id;
  assert.ok(documentId, "an adopted intake names its document");

  // NO CLIENT ANYWHERE. `document_intakes` has no client column at all, and no active
  // filing claims the document — which is precisely why the web receipts predicate's
  // second arm has to be "mine and unattributed" rather than "my uploads".
  const filings = await rootQuery(
    "select count(*)::int n from clara.document_filings where document_id = $1 and retired_at is null",
    [documentId],
  );
  assert.equal(filings.rows[0].n, 0, "an unfiled document has no active filing");

  const unassigned = await humanQuery(
    world.users.alice,
    "select x from clara.list_unassigned_documents(500) x",
  );
  const ids = unassigned.rows.map((r) => r.x.id);
  assert.ok(ids.includes(documentId), "the adopted-but-unfiled document reads as UNASSIGNED to its uploader");

  // And a foreign firm's persona sees it in neither read.
  const theirs = await humanQuery(world.users.dave, "select x from clara.list_unassigned_documents(500) x");
  assert.equal(
    theirs.rows.some((r) => r.x.id === documentId), false,
    "the unassigned population is firm-scoped, not estate-wide",
  );
});

test("p633.receipt.tasks_mask — the per-file processing-task view the queue reads is masked and firm-scoped too", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  // BORN ON THE INTAKE ROUTE, because that is the only writer that mints a processing
  // task: `finalize_document_intake` creates the document, its task and the
  // `document.ingested` event in ONE transaction (0007 §3.2). A directly-seeded
  // document has no task at all, so this cell's control would pass for the wrong
  // reason if it used one.
  const digest = sha(randomUUID());
  const intake = await seedIntake({
    firm, uploadedBy: world.users.alice, origin: "documents_tab", status: "verified",
    sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf`, filename: "tasks-probe.pdf",
  });
  await finalizeIntake({ intake });
  const seeded = {
    documentId: (await rootQuery("select document_id from clara.document_intakes where id = $1", [intake])).rows[0].document_id,
  };

  const cols = await rootQuery(
    `select column_name from information_schema.columns
      where table_schema='clara' and table_name='document_processing_tasks_visible' order by ordinal_position`,
  );
  assert.deepEqual(
    cols.rows.map((r) => r.column_name),
    ["id", "document_id", "lane", "status", "version_n", "attempt_count", "error_code",
      "created_at", "started_at", "finished_at", "updated_at"],
    "the queue row's COUNT half reads exactly these columns (apps/web/lib/documents/intake.ts's TASK_COLS)",
  );
  assert.equal(cols.rows.some((r) => r.column_name === "firm_id"), false, "no tenant column is published");

  const mine = await humanQuery(
    world.users.alice,
    "select count(*)::int n from clara.document_processing_tasks_visible where document_id = $1",
    [seeded.documentId],
  );
  assert.ok(mine.rows[0].n >= 1, "control: the uploader's persona sees this document's tasks");

  const theirs = await humanQuery(
    world.users.dave,
    "select count(*)::int n from clara.document_processing_tasks_visible where document_id = $1",
    [seeded.documentId],
  );
  assert.equal(theirs.rows[0].n, 0, "a foreign firm's persona sees none of them");
});
