// F-A7 train alpha (D1-alpha) — the constitutional recut battery.
//
// Scope: the two-migration window (UNNUMBERED_f_a7_alpha1_file_document_extraction,
// UNNUMBERED_f_a7_alpha2_judgement_recut) that widens client_resolutions.method/
// document_filings.basis to admit a fourth value, 'judgement', per digest law 79 / TA-P7 C.
// The riders that actually MINT a judgement resolution (the attribution ladder, the four
// walls) ship in later, independently-gated trains (pi/gamma/beta) — this file proves the
// SEVEN re-derivation bodies (annexes-2 Annex H) admit the value while every existing wall
// (method='agent' refused; the bound assert's D-16 confinement) stays exactly as strict as
// before. Every 'judgement' resolution below is minted by direct INSERT (rootQuery) because
// no public verb mints one yet — that verb is train beta's wake_reattribute_document /
// _agent_file_document_core, not in scope here.
//
// Cells covered (filing-and-interview-annexes-1.md Annex B / annexes-2 Annex J numbering):
//   29  — assert_client_resolved's caller census is exactly THREE live bodies (rig replay,
//         never grep), re-proven as a standing regression.
//   58/59 (AB-1) — already proven inside the migration's own postcheck; re-proven here at
//         the PUBLIC entrance (file_document) rather than a raw trigger-only fixture.
//   AB-2 attack (a) — file_document/_file_document_write, handed an EXISTING judgement
//         resolution, files against it and mints NO second resolution (the delegate's whole
//         point).
//   D-17/row-5 parity — _seed_verified_document accepts and correctly stamps a judgement
//         resolution's basis.
//   61 (AB-2 rider-3 approval) — propose_wrong_client_correction + approve_wrong_client_
//         correction complete end-to-end when the DESTINATION client's only resolution is
//         judgement-method. Minimal scenario (zero captured journal entries — a filed,
//         unposted document), which exercises exactly the predicate alpha2 recut without
//         dragging in the unrelated reverse-entry machinery.
//   D-16  — assert_client_resolved_bound still refuses a judgement resolution bound to an
//         opening-seed scope (re-proven at the estate level; the migration's own postcheck
//         proves the same claim with raw fixtures).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  CLR,
  assertRaises,
  buildWorld,
  endPool,
  humanQuery,
  namedCall,
  opk,
  rootQuery,
} from "./rig-fixtures.mjs";

let world = null;
let ready = false;

before(async () => {
  world = await buildWorld();
  const r = await rootQuery(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='_file_document_write'`,
  );
  ready = r.rowCount > 0;
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!ready) { t.skip("F-A7 train alpha not applied (clara._file_document_write absent)"); return true; }
  return false;
};

const sha = () => randomBytes(32).toString("hex");

/** Seed an UNFILED document (p_client => null skips _seed_verified_document's own auto-file
 *  arm) so the test's own file_document call is the ONLY filing act. ingestDocument's wrapper
 *  requires a client and files eagerly, which defeats every cell below that needs to file
 *  against a chosen resolution itself. */
async function seedUnfiledDocument(firm) {
  const docSha = sha();
  const r = await rootQuery(
    `select clara._seed_verified_document(p_firm => $1, p_client => null, p_sha256 => $2,
       p_filename => 'a7a-unfiled.pdf', p_mime => 'application/pdf', p_bytes => 512::bigint,
       p_storage_path => $3) as receipt`,
    [firm, docSha, `firms/${firm}/docs/${docSha}.pdf`],
  );
  return r.rows[0].receipt.document_id;
}

/** Insert a judgement-method resolution directly (no public mint verb exists yet — train
 *  beta's job). Mirrors the shape record_client_resolution stamps, method forced to 'judgement'. */
async function judgementResolution({ firm, client, document }) {
  const id = randomUUID();
  await rootQuery(
    `insert into clara.client_resolutions(id, firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by)
      values ($1, $2, $3, 'document', $4, 1.0, 'judgement', '{}'::jsonb, $5)`,
    [id, firm, client, document, world.agent],
  );
  return id;
}

async function fileDocument(sub, { document, client, resolution, opKey }) {
  const r = await humanQuery(
    sub,
    namedCall("file_document", [
      { name: "p_document" }, { name: "p_client" }, { name: "p_resolution" }, { name: "p_op_key" },
    ]),
    [document, client, resolution, opKey],
  );
  return r.rows[0].result;
}

// ===========================================================================
// Cell 29 — the assert_client_resolved caller census is exactly three live bodies.
// ===========================================================================
test("cell 29: assert_client_resolved caller census = three live bodies (rig replay, not grep)", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select proname from pg_proc
      where pronamespace='clara'::regnamespace and prosrc ~ 'assert_client_resolved\\('
      order by proname`,
  );
  const names = r.rows.map((x) => x.proname);
  assert.deepEqual(
    names,
    ["_draft_entry_core", "_draft_opening_item_core", "finalize_document_intake"],
    "caller census drifted — a splice did not apply (two) or an unaccounted caller exists (four+); stop and re-derive, never patch this list from memory",
  );
});

// ===========================================================================
// AB-2 attack (a) — file_document files against an EXISTING judgement resolution and mints
// no second one. Proven at the public entrance, not just the extracted delegate directly.
// ===========================================================================
test("AB-2 (a): file_document accepts a judgement resolution and mints no second resolution", async (t) => {
  if (gate(t)) return;
  const { users, clients } = world;
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [clients.A1])).rows[0].firm_id;
  const doc = await seedUnfiledDocument(firm);
  const res = await judgementResolution({ firm, client: clients.A1, document: doc });

  const before_ = (await rootQuery("select count(*)::int as n from clara.client_resolutions where subject_id=$1", [doc])).rows[0].n;
  const receipt = await fileDocument(users.bob, { document: doc, client: clients.A1, resolution: res, opKey: opk("a7a-file") });
  assert.ok(receipt.filing_id, "filing succeeds against a judgement resolution");

  const after_ = (await rootQuery("select count(*)::int as n from clara.client_resolutions where subject_id=$1", [doc])).rows[0].n;
  assert.equal(after_, before_, "no second (silently minted) resolution appeared — the AB-2 hazard is closed");

  const filing = (await rootQuery(
    "select resolution_id, basis from clara.document_filings where id=$1", [receipt.filing_id],
  )).rows[0];
  assert.equal(filing.resolution_id, res, "the filing binds the SAME judgement resolution the caller supplied");
  assert.equal(filing.basis, "judgement", "basis stamps 'judgement', not a silent fallback to 'human'");
});

test("AB-1 twin at the public entrance: file_document still refuses an agent-method resolution", async (t) => {
  if (gate(t)) return;
  const { users, clients } = world;
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [clients.A1])).rows[0].firm_id;
  const doc = await seedUnfiledDocument(firm);
  const agentRes = randomUUID();
  await rootQuery(
    `insert into clara.client_resolutions(id, firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by)
      values ($1, $2, $3, 'document', $4, 1.0, 'agent', '{}'::jsonb, $5)`,
    [agentRes, firm, clients.A1, doc, world.agent],
  );
  await assertRaises(
    CLR.client,
    () => fileDocument(users.bob, { document: doc, client: clients.A1, resolution: agentRes, opKey: opk("a7a-file2") }),
    "file_document against an agent-method resolution",
  );
});

// ===========================================================================
// Row 5 (D-17 parity) — _seed_verified_document accepts and correctly stamps a judgement
// resolution.
// ===========================================================================
test("row 5 parity: _seed_verified_document accepts a pre-existing judgement resolution", async (t) => {
  if (gate(t)) return;
  const { clients } = world;
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [clients.A2])).rows[0].firm_id;
  const docSha = sha();
  const seeded = await rootQuery(
    `select clara._seed_verified_document(p_firm => $1, p_client => null, p_sha256 => $2,
       p_filename => 'a7a-seed.pdf', p_mime => 'application/pdf', p_bytes => 512::bigint,
       p_storage_path => $3) as receipt`,
    [firm, docSha, `firms/${firm}/docs/${docSha}.pdf`],
  );
  const doc = seeded.rows[0].receipt.document_id;
  const res = await judgementResolution({ firm, client: clients.A2, document: doc });

  const seeded2 = await rootQuery(
    `select clara._seed_verified_document(p_firm => $1, p_client => $2, p_sha256 => $3,
       p_filename => 'a7a-seed.pdf', p_mime => 'application/pdf', p_bytes => 512::bigint,
       p_storage_path => $4, p_resolution => $5) as receipt`,
    [firm, clients.A2, docSha, `firms/${firm}/docs/${docSha}.pdf`, res],
  );
  const filing = (await rootQuery(
    "select resolution_id, basis from clara.document_filings where id=$1", [seeded2.rows[0].receipt.filing_id],
  )).rows[0];
  assert.equal(filing.resolution_id, res, "the seed lane reuses the supplied judgement resolution, never minting its own");
  assert.equal(filing.basis, "judgement", "seed-lane basis stamps 'judgement', not the seed-0007 fallback");
});

// ===========================================================================
// Cell 61 — rider 3's posted arm: propose_wrong_client_correction + approve_wrong_client_
// correction complete when the DESTINATION client's only resolution is judgement-method.
// Minimal scenario: a filed, unposted document (zero captured journal entries), which
// exercises exactly the predicate this train recut without the unrelated reverse-entry path.
// ===========================================================================
test("cell 61: a posted-misattribution correction approves when the destination resolution is judgement-only", async (t) => {
  if (gate(t)) return;
  const { users, clients } = world;
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [clients.A1])).rows[0].firm_id;

  // File the document to the FROM client via the ordinary human lane (unrelated to alpha2).
  const doc = await seedUnfiledDocument(firm);
  const humanRes = randomUUID();
  await rootQuery(
    `insert into clara.client_resolutions(id, firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by)
      values ($1, $2, $3, 'document', $4, 1.0, 'human', '{}'::jsonb, $5)`,
    [humanRes, firm, clients.A1, doc, users.alice],
  );
  const filed = await fileDocument(users.alice, { document: doc, client: clients.A1, resolution: humanRes, opKey: opk("a7a-corr-file") });
  assert.ok(filed.filing_id, "source filing exists");

  // The TO client's only resolution for this document is judgement-method.
  const judgeRes = await judgementResolution({ firm, client: clients.A2, document: doc });

  // Pre-alpha2 this would have raised CLR01 at the destination-authority check (AB-2 attack b,
  // 0027:270) -- that is exactly what the migration's prestate pin proves for the OLD body;
  // this test proves the NEW body end-to-end through the public verbs.
  const proposed = await humanQuery(
    users.bob,
    namedCall("propose_wrong_client_correction", [
      { name: "p_document" }, { name: "p_from_client" }, { name: "p_to_client" },
      { name: "p_reason" }, { name: "p_op_key" },
    ]),
    [doc, clients.A1, clients.A2, "misattributed to A1, belongs to A2", opk("a7a-corr-propose")],
  );
  const correction = proposed.rows[0].result;
  assert.equal(correction.status, "proposed", "the correction proposes cleanly against a judgement-only destination");

  // Alice (distinct from bob, the maker) approves.
  const approved = await humanQuery(
    users.alice,
    namedCall("approve_wrong_client_correction", [
      { name: "p_correction" }, { name: "p_plan_hash" }, { name: "p_attestation" }, { name: "p_op_key" },
    ]),
    [correction.correction_id, correction.plan_hash, null, opk("a7a-corr-approve")],
  );
  const result = approved.rows[0].result;
  assert.equal(result.status, "completed", "approve_wrong_client_correction completes against a judgement-only destination resolution (rider 3's dependency is closed)");

  const toFiling = (await rootQuery(
    "select resolution_id, basis from clara.document_filings where id=$1", [result.to_filing_id],
  )).rows[0];
  assert.equal(toFiling.resolution_id, judgeRes, "the new filing binds the judgement resolution the destination client carried");
  assert.equal(toFiling.basis, "correction", "basis stamps 'correction' (unaffected by the resolution's own method — unchanged behaviour)");
});

// ===========================================================================
// D-16 — the bound assert stays two-value at the estate level too (raw-fixture proof already
// lives inside the migration's own postcheck; this is the standing regression cell).
// ===========================================================================
test("D-16: assert_client_resolved_bound still refuses a judgement resolution bound to a scope", async (t) => {
  if (gate(t)) return;
  const { clients } = world;
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [clients.A1])).rows[0].firm_id;
  const plan = randomUUID();
  const scope = randomUUID();
  await rootQuery(
    `insert into clara.onboarding_plans(id, firm_id, scope_kind, client_id, state)
       values ($1, $2, 'client', $3, 'open')`,
    [plan, firm, clients.A1],
  );
  await rootQuery(
    `insert into clara.opening_seed_registry(id, firm_id, client_id, plan_id, as_of, state, created_by)
       values ($1, $2, $3, $4, date '2024-01-01', 'open', $5)`,
    [scope, firm, clients.A1, plan, world.agent],
  );
  const boundJudgement = randomUUID();
  await rootQuery(
    `insert into clara.client_resolutions(id, firm_id, client_id, subject_kind, subject_id,
        confidence, method, evidence, resolved_by, bound_scope_kind, bound_scope_id)
      values ($1, $2, $3, 'manual', $4, 1.0, 'judgement', '{}'::jsonb, $5, 'opening_seed', $4)`,
    [boundJudgement, firm, clients.A1, scope, world.agent],
  );
  await assertRaises(
    CLR.client,
    () => rootQuery("select clara.assert_client_resolved_bound($1,$2,'opening_seed',$3)", [clients.A1, boundJudgement, scope]),
    "bound assert against a judgement resolution",
  );
});
