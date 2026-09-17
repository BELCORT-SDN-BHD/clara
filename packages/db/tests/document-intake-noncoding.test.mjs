// H-53, RE-MEASURED ON THE INTAKE ROUTE (#633).
//
// H-53's own obligation is a REDESIGN row: the law is in place and proven at the coding
// lane's boundary (0165 seeds 12 codeable / 8 non-coding kinds with a written basis each;
// 0168 splices `list_uncoded_filings` and `list_review_queue` so the non-coding kinds
// leave the coding population WITHOUT losing custody), but nothing in packages/db or
// packages/runtime exercises it FROM THE INTAKE ROUTE. That is the one cell this ticket
// owes, and it is re-measured here rather than copied from the 0165/0168 batteries:
//
//   p633.noncoding.custody — a `consent_evidence` document BORN on the intake route
//                            (begin -> bytes -> finalize, the same `finalize_document_intake`
//                            the runtime calls) keeps custody and source authority, and
//                            appears in NEITHER `list_uncoded_filings` NOR
//                            `list_review_queue`.
//
// NON-VACUITY IS THE WHOLE RISK HERE. "It is not in the coding lane" is trivially true of
// a document that was never filed, so every cell files it first and proves a CODEABLE
// sibling born the same way DOES appear — otherwise the assertion would pass on an empty
// lane and prove nothing at all.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  rootQuery, humanQuery, ensureReady, endPool, buildWorld, opk,
} from "./rig-fixtures.mjs";
import { docsReady, seedIntake, finalizeIntake } from "./rig-docs-fixtures.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  const codeability = await rootQuery("select to_regclass('clara.document_kind_codeability') is not null as ok");
  ready = (await docsReady()) && codeability.rows[0].ok === true;
  if (ready) world = await buildWorld();
});
after(async () => { await endPool(); });

function unready(t) {
  if (!ready) { t.skip("the document pipeline (0007) or the codeability table (0165) is not present"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

/** A document BORN ON THE INTAKE ROUTE and filed to `client`, with `kind` set. The kind is
 *  stamped by root because `set_document_kind` deliberately refuses `consent_evidence`
 *  outright (that kind has its own audited door, `classify_consent_evidence_document`) —
 *  and what this battery is measuring is the CODING LANE's treatment of the kind, not the
 *  classify door's own floor. */
async function bornAndFiled(firm, client, filename, kind) {
  const digest = sha(randomUUID());
  const intake = await seedIntake({
    firm, uploadedBy: world.users.alice, origin: "documents_tab", status: "verified",
    sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf`, filename,
  });
  await finalizeIntake({ intake });
  const documentId = (await rootQuery(
    "select document_id from clara.document_intakes where id = $1", [intake],
  )).rows[0].document_id;

  await rootQuery("update clara.documents set document_kind = $2 where id = $1", [documentId, kind]);

  const resolution = await humanQuery(
    world.users.bob,
    `select clara.record_client_resolution(p_client => $1, p_subject_kind => 'document', p_subject => $2,
       p_confidence => 1.0, p_method => 'human', p_evidence => '{"source":"p633-h53"}'::jsonb, p_op_key => $3) as out`,
    [client, documentId, opk("h53-res")],
  );
  const out = resolution.rows[0].out;
  await humanQuery(
    world.users.bob,
    "select clara.file_document(p_document => $1, p_client => $2, p_resolution => $3, p_op_key => $4)",
    [documentId, client, out?.resolution_id ?? out, opk("h53-file")],
  );
  return { documentId, intake };
}

async function uncodedIds(client) {
  const r = await humanQuery(world.users.bob, "select x from clara.list_uncoded_filings($1) x", [client]);
  return r.rows.map((row) => row.x.document_id ?? row.x.documentId ?? row.x.id);
}

test("p633.noncoding.custody — the codeability law is seeded and NAMES consent_evidence as non-coding", async (t) => {
  if (unready(t)) return;
  const row = await rootQuery("select codeable, basis from clara.document_kind_codeability where kind = 'consent_evidence'");
  assert.equal(row.rowCount, 1, "0165 seeds a row per kind");
  assert.equal(row.rows[0].codeable, false, "consent evidence is not a transaction and never posts");
  assert.ok(String(row.rows[0].basis).length > 20, "and the ruling carries its own written basis, not a bare flag");

  const invoice = await rootQuery("select codeable from clara.document_kind_codeability where kind = 'invoice'");
  assert.equal(invoice.rows[0].codeable, true, "control: the table is not uniformly false");
});

test("p633.noncoding.custody — a consent_evidence document born on the INTAKE ROUTE keeps custody and source authority", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A1);
  const { documentId, intake } = await bornAndFiled(firm, world.clients.A1, "consent-letter.pdf", "consent_evidence");

  // CUSTODY: the bytes are sealed and the document is a real, verified row — the kind
  // changes what Clara may DERIVE, never whether the file is held.
  const doc = await rootQuery(
    "select bytes_verified_at, sha256, storage_path, document_kind from clara.documents where id = $1",
    [documentId],
  );
  assert.equal(doc.rowCount, 1, "the document exists");
  assert.ok(doc.rows[0].bytes_verified_at, "its bytes are verified — custody is intact");
  assert.ok(doc.rows[0].storage_path, "and it has a stored object behind it");
  assert.equal(doc.rows[0].document_kind, "consent_evidence");

  // SOURCE AUTHORITY: its intake receipt still names it, and the filing is live.
  const receipt = await humanQuery(
    world.users.alice,
    "select status, document_id from clara.document_intakes_visible where id = $1",
    [intake],
  );
  assert.equal(receipt.rows[0].document_id, documentId, "the receipt still points at the document it adopted");

  const filing = await rootQuery(
    "select count(*)::int n from clara.document_filings where document_id=$1 and retired_at is null",
    [documentId],
  );
  assert.equal(filing.rows[0].n, 1, "it is filed to its client — non-coding is not unfiled");
});

test("p633.noncoding.custody — and it appears in NEITHER list_uncoded_filings NOR list_review_queue (with a codeable control)", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A2);
  // The CONTROL is built first and on the SAME route, so a lane that is simply empty
  // cannot make this cell pass.
  const codeable = await bornAndFiled(firm, world.clients.A2, "supplier-invoice.pdf", "invoice");
  const noncoding = await bornAndFiled(firm, world.clients.A2, "consent-letter-2.pdf", "consent_evidence");

  const uncoded = await uncodedIds(world.clients.A2);
  assert.ok(
    uncoded.includes(codeable.documentId),
    `CONTROL: a codeable document born the same way MUST be in the coding lane — saw ${JSON.stringify(uncoded)}`,
  );
  assert.equal(
    uncoded.includes(noncoding.documentId), false,
    "the consent-evidence document must not be waiting for a posting decision that can never come",
  );

  // The review queue takes a scope envelope rather than a client id (0016/0168).
  const review = await humanQuery(
    world.users.bob,
    "select clara.list_review_queue($1::jsonb, null::jsonb, 500) as out",
    [JSON.stringify({ client_id: world.clients.A2 })],
  );
  const payload = JSON.stringify(review.rows[0].out ?? {});
  assert.equal(
    payload.includes(noncoding.documentId), false,
    "nor may it surface in the review queue — 0168 splices both reads for exactly this",
  );
});

test("p633.noncoding.custody — an identity_document born on the same route behaves identically", async (t) => {
  if (unready(t)) return;
  const firm = await firmOf(world.clients.A2);
  const { documentId } = await bornAndFiled(firm, world.clients.A2, "director-ic.pdf", "identity_document");

  const kind = await rootQuery("select codeable from clara.document_kind_codeability where kind='identity_document'");
  assert.equal(kind.rows[0].codeable, false, "identity documents are governance evidence, not transactions");

  const uncoded = await uncodedIds(world.clients.A2);
  assert.equal(uncoded.includes(documentId), false, "it never enters the coding lane");

  const doc = await rootQuery("select bytes_verified_at from clara.documents where id=$1", [documentId]);
  assert.ok(doc.rows[0].bytes_verified_at, "and custody survives — the whole point of H-53");
});
