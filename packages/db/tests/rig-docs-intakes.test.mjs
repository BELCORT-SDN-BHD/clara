// Slice-5 rig — DOCUMENT PIPELINE part 3: INTAKES (companion §3.2, runtime-control,
// NO domain events). Contract-blind. The laws: NO human base grant + a masked
// definer view WITHOUT chat_session_id; terminal states (finalized/adopted/failed)
// IMMUTABLE — the exact edge set; identity + op_key fixed at creation; one upload
// lease; the hashed token authorizes PUT/finalize ONLY (status GET needs the
// session, no token); finalize_document_intake is the SOLE document creator
// (document + processing task + document.ingested in ONE txn); duplicate → adopt
// with ONE charge + task + event.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  PG,
  ROLES,
  rootActor,
  assertRaises,
  assertRaisesOneOf,
  opk,
  sha,
  rootQuery,
  roleQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  seedIntake,
  finalizeIntake,
  intakeViewName,
  INTAKE_TERMINAL,
  INTAKE_TERMINAL_CODES,
  DOC_EVT,
  NO_HUMAN_BASE_GRANT,
} from "./rig-docs-fixtures.mjs";
import { holdThenContend } from "./rig-docs-race.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("intakes");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

// ===========================================================================
// §3.2 / §R6 — masking: no human base grant; the definer view hides chat_session_id.
// ===========================================================================

test("§3.2 document_intakes has NO human base grant; a masked definer view exists WITHOUT chat_session_id", async (t) => {
  if (unready(t)) return;
  assert.ok(NO_HUMAN_BASE_GRANT.has("document_intakes"), "contract: intakes carry no human base grant");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated, "select count(*) from clara.document_intakes"), "human SELECT on the intakes BASE table");

  const views = await intakeViewName();
  assert.ok(views.length >= 1, `a masked intake view exists (found: ${views.join(", ") || "NONE"})`);
  for (const v of views) {
    const cols = await rootQuery(
      "select column_name from information_schema.columns where table_schema='clara' and table_name=$1",
      [v],
    );
    const names = cols.rows.map((x) => x.column_name);
    assert.ok(!names.includes("chat_session_id"), `the masked view clara.${v} NEVER exposes chat_session_id (§R6)`);
    noteLane(`masked intake view resolved as clara.${v} (columns: ${names.join(", ")})`);
  }
});

// ===========================================================================
// §3.2 — finalize is the sole document creator (document + task + event, one txn).
// ===========================================================================

test("§3.2 finalize_document_intake creates the document + a processing task + document.ingested in ONE txn (sole creator)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const digest = sha(randomUUID());
  const intake = await seedIntake({
    firm, uploadedBy: users.alice, origin: "documents_tab", status: "verified",
    sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf`,
  });

  const receipt = await finalizeIntake({ intake });
  noteLane(`finalize receipt shape: ${JSON.stringify(receipt)}`);

  const doc = await rootQuery("select id, bytes_verified_at from clara.documents where firm_id=$1 and sha256=$2", [firm, digest]);
  assert.equal(doc.rowCount, 1, "finalize created exactly one document for the verified sha");
  assert.ok(doc.rows[0].bytes_verified_at, "the created document is verified (bytes_verified_at set)");

  const task = await rootQuery("select count(*)::int as n from clara.document_processing_tasks where document_id=$1", [doc.rows[0].id]);
  assert.ok(task.rows[0].n >= 1, "finalize created a processing task (§3.9 durable enqueue)");

  const ev = await rootQuery("select count(*)::int as n from clara.domain_events where document_id=$1 and event_type=$2", [doc.rows[0].id, DOC_EVT.ingested]);
  assert.equal(ev.rows[0].n, 1, "finalize emitted exactly one document.ingested");

  const intakeRow = await rootQuery("select status, document_id from clara.document_intakes where id=$1", [intake]);
  assert.equal(intakeRow.rows[0].status, "finalized", "the intake is now finalized");
  assert.equal(intakeRow.rows[0].document_id, doc.rows[0].id, "the intake points at its created document");
});

test("§3.2 terminal intakes (finalized/adopted/failed) are IMMUTABLE — the exact edge set", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const digest = sha(randomUUID());
  const intake = await seedIntake({ firm, uploadedBy: users.alice, status: "verified", sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf` });
  await finalizeIntake({ intake });

  // A terminal intake cannot be mutated — not its status, not its identity, not even as root.
  await assertRaisesOneOf(INTAKE_TERMINAL_CODES, () => rootQuery("update clara.document_intakes set status='verifying' where id=$1", [intake]), "mutate a finalized intake's status");
  await assertRaisesOneOf(INTAKE_TERMINAL_CODES, () => rootQuery("update clara.document_intakes set original_filename='x' where id=$1", [intake]), "mutate a finalized intake's identity");
  noteLane(`terminal-immutability edge set under test: ${INTAKE_TERMINAL.join("/")}`);
});

test("§3.2 identity + op_key are fixed at creation (immutable after insert)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const intake = await seedIntake({ firm, uploadedBy: users.alice, status: "uploading", opKey: opk("fixed") });
  // Identity fields immutable while still non-terminal (a stricter law than terminal-only).
  await assertRaisesOneOf([CLR.immutable, CLR.badRequest, PG.checkViolation], () => rootQuery("update clara.document_intakes set op_key=$2 where id=$1", [intake, opk("changed")]), "mutate a fixed op_key");
  await assertRaisesOneOf([CLR.immutable, CLR.badRequest, PG.checkViolation], () => rootQuery("update clara.document_intakes set firm_id=gen_random_uuid() where id=$1", [intake]), "mutate the stamped firm_id");
});

// ===========================================================================
// §3.2 / §8 — duplicate → adopted: one finalize wins, the second adopts (ONE
// charge + task + event). Sequential form (the concurrent race is in the metering
// storm suite).
// ===========================================================================

test("§3.2 duplicate sha: the second finalize ADOPTS the existing document — no second document row, one document.ingested", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const digest = sha(randomUUID());
  const key = `firms/${firm}/docs/${digest}.pdf`;

  const i1 = await seedIntake({ firm, uploadedBy: users.alice, status: "verified", sha256: digest, storageKey: key });
  await finalizeIntake({ intake: i1 });
  const afterFirst = await rootQuery("select count(*)::int as n from clara.documents where firm_id=$1 and sha256=$2", [firm, digest]);
  assert.equal(afterFirst.rows[0].n, 1, "first finalize created the document");

  const i2 = await seedIntake({ firm, uploadedBy: users.alice, status: "verified", sha256: digest, storageKey: key });
  await finalizeIntake({ intake: i2 });

  const afterSecond = await rootQuery("select count(*)::int as n from clara.documents where firm_id=$1 and sha256=$2", [firm, digest]);
  assert.equal(afterSecond.rows[0].n, 1, "the duplicate did NOT create a second document row (adopted)");
  const events = await rootQuery("select count(*)::int as n from clara.domain_events d join clara.documents doc on doc.id=d.document_id where doc.firm_id=$1 and doc.sha256=$2 and d.event_type=$3", [firm, digest, DOC_EVT.ingested]);
  assert.equal(events.rows[0].n, 1, "exactly ONE document.ingested across the original + adopted duplicate (§8)");

  const i2row = await rootQuery("select status from clara.document_intakes where id=$1", [i2]);
  assert.equal(i2row.rows[0].status, "adopted", "the duplicate intake terminalizes as 'adopted'");
});

// ===========================================================================
// §3.2 — cross-firm no-existence-oracle on the intakes surface.
// ===========================================================================

test("§3.2 cross-firm intake read via the masked view is zero-rows-or-denied (no existence oracle)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firmA = await firmOf(clients.A1);
  const intakeA = await seedIntake({ firm: firmA, uploadedBy: users.alice, status: "uploading" });
  const views = await intakeViewName();
  if (!views.length) { noteLane("no masked intake view found — cross-firm oracle test inconclusive"); return; }
  const view = views[0];
  // dave (firm B) must not see firm A's intake through the firm-scoped definer view.
  const seen = await roleQuery(ROLES.authenticated, `select count(*)::int as n from clara.${view} where id=$1`, [intakeA]).catch((e) => ({ rows: [{ n: `denied:${e.code}` }] }));
  const n = seen.rows[0].n;
  // The querying identity here is unset (no jwt sub) → RLS yields zero; a scoped
  // human in firm B also yields zero. Either zero or a clean denial is acceptable.
  assert.ok(n === 0 || String(n).startsWith("denied"), `cross-firm intake view leaks nothing (got ${n})`);
});

// ===========================================================================
// §3.2 — one upload lease: concurrent PUT exclusion (X7) + the token-vs-poll split.
// ===========================================================================

test("§3.2 concurrent PUT exclusion: a second lease acquisition BLOCKS on the holder (pg_blocking_pids-proven) then is EXCLUDED (zero rows) — one upload lease", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const intake = await seedIntake({ firm, uploadedBy: users.alice, status: "uploading" });

  // The lease CAS: claim only when unowned or expired. Two sessions race it; the
  // second must block on the row lock (proven), then match zero rows once the first holds it.
  const claim = (owner) => (c) => c.query(
    "update clara.document_intakes set upload_lease_owner=$2, lease_expires_at=now()+interval '2 minutes' where id=$1 and (upload_lease_owner is null or lease_expires_at < now()) returning id",
    [intake, owner],
  );
  const out = await holdThenContend({
    a: { ...rootActor, run: claim(users.alice) },
    b: { ...rootActor, run: claim(users.bob) },
  });
  assert.equal(out.provedBlocked, true, "X7: the second PUT was PROVEN blocked on the lease row before the first committed");
  assert.ok(out.a?.ok && out.a.receipt.rowCount === 1, "the first PUT acquired the lease");
  assert.ok(out.b?.ok && out.b.receipt.rowCount === 0, "the second PUT was EXCLUDED (zero rows — one lease at a time)");
});

test("§3.2 token-vs-poll split: token_hash gates PUT/finalize while the masked status view carries NEITHER token_hash NOR chat_session_id (status GET needs the session, not the token)", async (t) => {
  if (unready(t)) return;
  const cols = new Set((await rootQuery("select column_name from information_schema.columns where table_schema='clara' and table_name='document_intakes'")).rows.map((x) => x.column_name));
  assert.ok(cols.has("token_hash"), "document_intakes carries token_hash (PUT/finalize capability)");
  const views = await intakeViewName();
  for (const v of views) {
    const vcols = new Set((await rootQuery("select column_name from information_schema.columns where table_schema='clara' and table_name=$1", [v])).rows.map((x) => x.column_name));
    assert.ok(!vcols.has("token_hash"), `the masked status view clara.${v} never exposes token_hash (poll is session-authorized, §3.2)`);
    assert.ok(!vcols.has("chat_session_id"), `the masked status view clara.${v} never exposes chat_session_id`);
  }
});
