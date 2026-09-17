// #633 AC5 — THE FIRM LEAF'S READ, AND THE FLOOR ITS NAV ROW IS SET FROM.
//
// `clara.list_unassigned_documents(p_limit)` has existed since 0009:2590 and had never
// had an `apps/web` caller. This ticket adds the caller, not the function — so these
// cells measure what the FUNCTION admits rather than restating a migration.
//
//   p633.unassigned.reuse      — the population under viewer and bookkeeper personas;
//                                every row carries `unassigned: true`; filing REMOVES a
//                                document from the set; `p_limit` clamps at 500 (:2610).
//   p633.unassigned.second_attempt
//                              — WHAT "ASK ONCE" ACTUALLY BUYS (fix round 1, review
//                                finding 633-ADV-5). The leaf's header used to claim
//                                `file_document` refuses ANY second attempt. Measured
//                                here: a repeat to the SAME client is refused with the
//                                estate's own words and leaves ONE filing; a second
//                                attribution to a DIFFERENT client is ACCEPTED and
//                                leaves TWO live filings — a state 0123's classify gate
//                                then refuses as `document_processing_multi_client`,
//                                stopping that document's processing.
//   p633.unassigned.file_floor — THE MEASUREMENT THE NAV ROW COMES FROM. A persona that
//                                can LIST is not necessarily a persona that can FILE. The
//                                leaf must render the DB's own refusal rather than a
//                                fabricated success — and it must not hide the list from
//                                someone the read admits.
//
// The nav floor recorded in `apps/web/lib/navigation/tree.ts` is whatever the LIST arm
// below admits, and the ACT arm is what the surface renders as a refusal. If either
// moves, this file is what says so.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  CLR, rootQuery, humanQuery, ensureReady, endPool, buildWorld, opk,
} from "./rig-fixtures.mjs";
import { docsReady, seedIntake, finalizeIntake, seedExtraction } from "./rig-docs-fixtures.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

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

/** An ADOPTED, UNFILED document, born the way the real route makes one. */
async function bornUnassigned(firm, uploadedBy, filename) {
  const digest = sha(randomUUID());
  const intake = await seedIntake({
    firm, uploadedBy, origin: "documents_tab", status: "verified",
    sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf`, filename,
  });
  await finalizeIntake({ intake });
  const row = await rootQuery("select document_id from clara.document_intakes where id = $1", [intake]);
  return row.rows[0].document_id;
}

const listAs = async (sub, limit = 500) => {
  const r = await humanQuery(sub, "select x from clara.list_unassigned_documents($1) x", [limit]);
  return r.rows.map((row) => row.x);
};

test("p633.unassigned.reuse — viewer AND bookkeeper both READ the population; every row says unassigned; filing removes it", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  const documentId = await bornUnassigned(firm, world.users.alice, "reuse-probe.pdf");

  // THE MEASURED READ FLOOR. carol is a viewer, bob a bookkeeper (buildWorld).
  const asViewer = await listAs(world.users.carol);
  const asBookkeeper = await listAs(world.users.bob);
  assert.ok(
    asViewer.some((r) => r.id === documentId),
    "MEASURED: a VIEWER reads clara.list_unassigned_documents — it is SECURITY INVOKER, so its floor is whatever RLS admits",
  );
  assert.ok(asBookkeeper.some((r) => r.id === documentId), "and a bookkeeper reads it too");

  // The projection the web leaf renders from.
  const row = asViewer.find((r) => r.id === documentId);
  assert.equal(row.unassigned, true, "every row declares itself unassigned (0009:2600-2606)");
  for (const key of ["mime_type", "document_kind", "extraction_status", "original_filename"]) {
    assert.ok(key in row, `the leaf renders ${key} straight off this projection — it must be present`);
  }

  // FILING REMOVES IT — the whole reason the leaf asks once.
  const resolution = await humanQuery(
    world.users.bob,
    `select clara.record_client_resolution(p_client => $1, p_subject_kind => 'document', p_subject => $2,
       p_confidence => 1.0, p_method => 'human', p_evidence => '{"source":"p633"}'::jsonb, p_op_key => $3) as out`,
    [world.clients.A1, documentId, opk("p633-res")],
  );
  const out = resolution.rows[0].out;
  const resolutionId = out?.resolution_id ?? out;
  await humanQuery(
    world.users.bob,
    "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)",
    [documentId, world.clients.A1, resolutionId, opk("p633-file")],
  );

  const after = await listAs(world.users.carol);
  assert.equal(
    after.some((r) => r.id === documentId), false,
    "once filed, the document LEAVES the unassigned set — the row does not need to be asked again",
  );
});

test("p633.unassigned.reuse — p_limit is clamped by the function itself, never by the caller", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  for (let i = 0; i < 3; i++) await bornUnassigned(firm, world.users.alice, `clamp-${i}.pdf`);

  const huge = await listAs(world.users.alice, 100000);
  assert.ok(huge.length <= 500, `p_limit clamps at 500 (0009:2610) — saw ${huge.length} rows`);

  const negative = await listAs(world.users.alice, -5);
  assert.equal(negative.length, 0, "a negative limit clamps to zero rather than erroring or defaulting");

  const one = await listAs(world.users.alice, 1);
  assert.equal(one.length, 1, "a small limit is honoured exactly");
});

test("p633.unassigned.file_floor — a persona that can LIST but not FILE is refused with the DB's own reason", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  const documentId = await bornUnassigned(firm, world.users.alice, "floor-probe.pdf");

  // NON-VACUITY: the viewer can genuinely SEE this row. A refusal below therefore
  // proves the ACT's floor, not that the fixture was invisible.
  const seen = await listAs(world.users.carol);
  assert.ok(seen.some((r) => r.id === documentId), "control: the viewer sees the row it is about to be refused on");

  let refusal = null;
  try {
    await humanQuery(
      world.users.carol,
      `select clara.record_client_resolution(p_client => $1, p_subject_kind => 'document', p_subject => $2,
         p_confidence => 1.0, p_method => 'human', p_evidence => '{"source":"p633"}'::jsonb, p_op_key => $3) as out`,
      [world.clients.A1, documentId, opk("p633-floor")],
    );
  } catch (e) {
    refusal = e;
  }
  assert.ok(refusal, "a viewer must NOT be able to attribute a document");
  assert.equal(
    refusal.code, CLR.authz,
    `MEASURED: the attribution act refuses a viewer with ${CLR.authz}, saw ${refusal.code} — this is the floor the leaf renders`,
  );
  assert.match(String(refusal.message), /role/i, "and the refusal names the constraint rather than being generic");

  // The row is STILL THERE afterwards. A refused act must not consume the question.
  const after = await listAs(world.users.carol);
  assert.ok(after.some((r) => r.id === documentId), "a refused attribution leaves the document unassigned, still askable");
});

test("p633.unassigned.file_floor — a bookkeeper IS admitted, so the refusal above is about rank and nothing else", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  const documentId = await bornUnassigned(firm, world.users.bob, "floor-control.pdf");

  const resolution = await humanQuery(
    world.users.bob,
    `select clara.record_client_resolution(p_client => $1, p_subject_kind => 'document', p_subject => $2,
       p_confidence => 1.0, p_method => 'human', p_evidence => '{"source":"p633"}'::jsonb, p_op_key => $3) as out`,
    [world.clients.A1, documentId, opk("p633-ok")],
  );
  const out = resolution.rows[0].out;
  assert.ok(out, "MEASURED: a bookkeeper IS admitted by record_client_resolution");

  await humanQuery(
    world.users.bob,
    "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)",
    [documentId, world.clients.A1, out?.resolution_id ?? out, opk("p633-ok-file")],
  );
  const filings = await rootQuery(
    "select count(*)::int n from clara.document_filings where document_id=$1 and retired_at is null",
    [documentId],
  );
  assert.equal(filings.rows[0].n, 1, "and the filing really happened");
});

test("p633.unassigned.reuse — the population is FIRM-SCOPED: firm B never sees firm A's unassigned sources", async (t) => {
  if (unready(t)) return;
  const firmA = await firmOf(world.clients.A1);
  const documentId = await bornUnassigned(firmA, world.users.alice, "tenancy-probe.pdf");

  const mine = await listAs(world.users.alice);
  assert.ok(mine.some((r) => r.id === documentId), "control: firm A sees its own unassigned source");

  const theirs = await listAs(world.users.dave);
  assert.equal(
    theirs.some((r) => r.id === documentId), false,
    "the firm leaf shows one firm's material only — SECURITY INVOKER means RLS is the wall",
  );
});
test("p633.unassigned.second_attempt — a repeat to the SAME client is refused; a DIFFERENT client is ACCEPTED, and processing stops", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  const documentId = await bornUnassigned(firm, world.users.bob, "second-attempt.pdf");

  const fileTo = async (client, tag) => {
    const res = await humanQuery(
      world.users.bob,
      `select clara.record_client_resolution(p_client => $1, p_subject_kind => 'document', p_subject => $2,
         p_confidence => 1.0, p_method => 'human', p_evidence => '{"source":"p633"}'::jsonb, p_op_key => $3) as out`,
      [client, documentId, opk(tag)],
    );
    const out = res.rows[0].out;
    return humanQuery(
      world.users.bob,
      "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)",
      [documentId, client, out?.resolution_id ?? out, opk(`${tag}-file`)],
    );
  };
  const liveFilings = async () => (await rootQuery(
    "select client_id from clara.document_filings where document_id=$1 and retired_at is null order by client_id",
    [documentId],
  )).rows.map((r) => r.client_id);

  // 1. THE ACT THE LEAF OFFERS, ONCE.
  await fileTo(world.clients.A1, "p633-sa1");
  assert.deepEqual(await liveFilings(), [world.clients.A1].sort(), "control: the one act the leaf offers really filed it");

  // 2. THE SAME CLIENT AGAIN — REFUSED, IN THE ESTATE'S OWN WORDS.
  let repeat = null;
  try { await fileTo(world.clients.A1, "p633-sa2"); } catch (e) { repeat = e; }
  assert.ok(repeat, "a repeat attribution to the SAME client must be refused");
  assert.equal(repeat.code, CLR.badRequest, `MEASURED: the same-client repeat refuses with ${CLR.badRequest}, saw ${repeat.code}`);
  assert.match(
    String(repeat.message), /already .*filed/i,
    `and it names the reason — the words the leaf renders verbatim; saw: ${repeat.message}`,
  );
  assert.deepEqual(await liveFilings(), [world.clients.A1].sort(), "and it minted no second filing");

  // 3. A DIFFERENT CLIENT — ACCEPTED. This is the half the header used to deny.
  await fileTo(world.clients.A2, "p633-sa3");
  const both = await liveFilings();
  assert.equal(both.length, 2, `the estate PERMITS a second live filing to a different client — saw ${both.length}`);

  // 4. THE CONSEQUENCE, NAMED. Two live filings put the document into 0123's
  //    multi-client arm: its classify task is a terminal, never-claimed failure and the
  //    document stops being processed. Driven through the enqueue core the way the
  //    RUNTIME lane reaches it (this is an observation of the consequence, not the
  //    tenancy assertion under test — those all ran through `humanQuery` above).
  await seedExtraction({ firm, document: documentId, engineKind: "ocr", status: "done" });
  const routed = await rootQuery("select clara._enqueue_invoice_facts_core($1) as out", [documentId]);
  assert.match(
    JSON.stringify(routed.rows[0].out), /document_processing_multi_client/,
    `two live filings must stop classify with its own named verdict — saw ${JSON.stringify(routed.rows[0].out)}`,
  );
});
