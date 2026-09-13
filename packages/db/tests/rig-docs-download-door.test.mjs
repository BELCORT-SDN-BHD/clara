// #620 — THE SOURCE-DOCUMENT DOWNLOAD DOOR, for
// migrations/0190_document_byte_door_v2.sql (clara.get_document_for_human_read_v2).
//
// Design of record: issue #620 AC2 ("allowed own-client reads, denied cross-firm/client/object
// access, revoked membership") and AC5 (bounded purpose / policy consistency with the artifact
// door). Shaped cell-for-cell after packages/db/tests/fs7-e2-artifact-download.test.mjs's D1-D9,
// which is the same discipline applied to clara.get_artifact_for_human_read.
//
// WHY THIS FILE EXISTS AT ALL. Cross-firm denial for source bytes lives ENTIRELY in one Postgres
// function: the Storage RLS policies scope by bucket + key SHAPE only (packages/db/deploy/
// storage-provision.sql:66-80), so the custody credential can read any firm's conforming object.
// Until this file, that function had ZERO behavioural coverage — no test in the repository called
// clara.get_document_for_human_read against a real database. This is the battery that makes the
// one wall a measurement.
//
// EVERY WALL IS FORCED IN BOTH POLARITIES (estate law 31). A refusal cell's differential twin is
// ADMITTED, and the two differ in exactly the term the wall reads — never in two terms at once,
// because a cell whose arms differ in two places cannot say which one the door answered.
//
// THE DOOR IS EXECUTED, NEVER RE-IMPLEMENTED (裁-112). No assertion below recomputes "may this
// person read these bytes"; every one of them calls clara.get_document_for_human_read_v2 as
// clara_runtime — the way packages/runtime/src/documentRoutes.ts calls it — and reads the DOOR's
// own verdict.
//
// THE READINESS GATE IS MEASURED, NOT ASSUMED: the door resolves by EXACT SIGNATURE or the whole
// file skips (a pre-0190 chain), so this file is bimodal-green on db-slice-frontiers legs.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ROLES, asRoot, rootQuery, roleQuery, asHuman, asWake, assertRaises,
  ensureReady, docsReady, buildWorld, endPool, printLaneNotes, noteLane,
  seedVerifiedDocument, fileDocument, retireDocumentFiling, documentRow, freshResolution,
  addMember, removeMember, insertUser, opk, sha,
} from "./rig-docs-fixtures.mjs";
import { mintWake } from "./rig-fixtures.mjs";

const V2 = "clara.get_document_for_human_read_v2(uuid,uuid,uuid,text)";
const V1 = "clara.get_document_for_human_read(uuid,uuid)";
const MIGRATION = new URL("../migrations/0190_document_byte_door_v2.sql", import.meta.url);

let ready = false;
let world = null;
let ownDoc = null;      // firm A, filed under client A1
let foreignDoc = null;  // firm B, filed under client B1
let unfiledDoc = null;  // firm A, no filing at all

/** THE DOOR, called the way the runtime route calls it: as clara_runtime, principal in.
 *  NAMED arguments, so an omitted `client` or `purpose` takes the FUNCTION's own default rather
 *  than sliding the next value into its position — a positional builder silently resolved
 *  (uuid,uuid,text) and asked for an overload that does not exist. */
async function door(documentId, userId, { client, purpose } = {}) {
  const specs = ["p_document => $1::uuid", "p_user => $2::uuid"];
  const params = [documentId, userId];
  if (client !== undefined) { params.push(client); specs.push(`p_client => $${params.length}::uuid`); }
  if (purpose !== undefined) { params.push(purpose); specs.push(`p_purpose => $${params.length}::text`); }
  const r = await roleQuery(ROLES.runtime,
    `select clara.get_document_for_human_read_v2(${specs.join(", ")}) as r`, params);
  return r.rows[0].r;
}

/** Assert a refusal by SQLSTATE and by the door's own typed `reason`, never by message text. */
async function refusal(fn, code, reason, label) {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  assert.ok(err, `${label}: expected a refusal, the call SUCCEEDED`);
  assert.equal(err.code, code, `${label}: sqlstate (${err.message})`);
  let detail = null;
  try { detail = JSON.parse(err.detail ?? "null"); } catch { detail = null; }
  assert.equal(detail?.reason, reason, `${label}: typed reason (detail=${err.detail})`);
  return err;
}

const auditCount = async (documentId) => (await rootQuery(
  "select count(*)::int n from clara.audit_log where fn='get_document_for_human_read_v2' and entry_id=$1",
  [documentId])).rows[0].n;

/** A document in `firm` whose custody bond is not stamped. There is no supported writer for this
 *  shape post-0007 (both legacy ingest writers are retired and _seed_verified_document always
 *  stamps `bytes_verified_at`), so the row is inserted directly as superuser — the same technique
 *  x27-filings-lock-order.test.mjs and x36-vendor-binding-helpers.mjs already use, and legal
 *  because clara._tf_documents_immutable guards UPDATE/DELETE only. */
async function seedCustodyPendingDocument(firm, { withPath = false } = {}) {
  const digest = sha(randomUUID());
  const r = await rootQuery(
    `insert into clara.documents(firm_id, sha256, original_filename, mime_type, byte_size,
        storage_path, bytes_verified_at, extraction_status)
     values ($1,$2,'pending.pdf','application/pdf',1024,$3,null,'pending') returning id`,
    [firm, digest, withPath ? `firms/${firm}/docs/${digest}.pdf` : null]);
  return r.rows[0].id;
}

before(async () => {
  await ensureReady();
  const probe = await rootQuery(
    "select to_regprocedure($1) is not null as v2, to_regprocedure($2) is not null as v1", [V2, V1]);
  ready = (await docsReady()) && probe.rows[0].v2 === true && probe.rows[0].v1 === true;
  if (!ready) return;

  world = await buildWorld();
  const a = await seedVerifiedDocument({ firm: world.firms.A });
  await fileDocument(world.users.alice, {
    document: a.documentId, client: world.clients.A1,
    resolution: await freshResolution(world.users.alice, world.clients.A1),
  });
  ownDoc = a;
  const b = await seedVerifiedDocument({ firm: world.firms.B });
  await fileDocument(world.users.dave, {
    document: b.documentId, client: world.clients.B1,
    resolution: await freshResolution(world.users.dave, world.clients.B1),
  });
  foreignDoc = b;
  unfiledDoc = await seedVerifiedDocument({ firm: world.firms.A, client: null });
});

after(async () => { printLaneNotes("rig-docs-download-door"); await endPool(); });

const skipHere = (t) => {
  if (ready) return false;
  t.skip("#620: migration 0190 (clara.get_document_for_human_read_v2) is not applied on this database");
  return true;
};

// =============================================================================================
// D1 — THE ADMITTED TWIN, AND ITS RECEIPT. Every field the door returns is the ROW's own, and one
// successful read writes exactly ONE audit line carrying the client scope and the purpose.
//
// A VIEWER-RANK MEMBER IS SERVED TOO, and that is a decision rather than an omission (#620
// contract decision 4): unlike the artifact door (CLR04 below bookkeeper, 0162:176), the source
// door has NO rank floor — any ACTIVE member of the firm may read their firm's own source
// documents, exactly as v1 has always allowed. The cell asserts it positively so a later "tidy"
// that adds a floor reds here instead of silently changing who may see a client's invoice.
// =============================================================================================
test("D1.1 — an own-firm OWNER is served, and every field is the documents row's own", async (t) => {
  if (skipHere(t)) return;
  const row = await documentRow(ownDoc.documentId);
  const r = await door(ownDoc.documentId, world.users.alice);
  assert.equal(r.storage_path, row.storage_path);
  assert.equal(r.sha256, row.sha256);
  assert.equal(String(r.byte_size), String(row.byte_size));
  assert.equal(r.mime_type, row.mime_type);
  assert.equal(r.original_filename, row.original_filename);
  assert.equal(r.document_kind, row.document_kind);
  assert.equal(r.bytes_verified_at, row.bytes_verified_at);
  assert.equal(r.firm_id, world.firms.A);
  // The storage path IS the content address — so a route that verifies the downloaded bytes
  // against r.sha256 has verified them against the path it fetched them from.
  assert.equal(r.storage_path, `firms/${world.firms.A}/docs/${row.sha256}.pdf`);
  // No client was asked for, so the door reports the document's ACTIVE filing.
  assert.equal(r.client_id, world.clients.A1);
});

test("D1.2 — a VIEWER-rank member of the same firm is served (the source door has NO rank floor)", async (t) => {
  if (skipHere(t)) return;
  const rank = (await rootQuery(
    "select role from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [world.firms.A, world.users.carol])).rows[0]?.role;
  assert.equal(rank, "viewer", "the world's carol must be a VIEWER or this cell measures nothing");
  const r = await door(ownDoc.documentId, world.users.carol);
  assert.equal(r.storage_path, (await documentRow(ownDoc.documentId)).storage_path);
});

test("D1.3 — one successful read writes exactly ONE audit line, with {client, purpose} and no path", async (t) => {
  if (skipHere(t)) return;
  const before_ = await auditCount(ownDoc.documentId);
  await door(ownDoc.documentId, world.users.bob, { client: world.clients.A1, purpose: "preview" });
  const rows = (await rootQuery(
    `select actor, firm_id, args, at from clara.audit_log
      where fn='get_document_for_human_read_v2' and entry_id=$1 order by at desc, ctid desc`,
    [ownDoc.documentId])).rows;
  assert.equal(rows.length, before_ + 1, "exactly one new line");
  assert.equal(rows[0].actor, world.users.bob);
  assert.equal(rows[0].firm_id, world.firms.A);
  assert.deepEqual(rows[0].args, { client: world.clients.A1, purpose: "preview" });
  // The storage path is deliberately NOT in the ledger: the line records WHICH document left and
  // to whom, and the content address already lives on the document row.
  assert.equal(JSON.stringify(rows[0].args).includes("firms/"), false);
});

// =============================================================================================
// D2 / D3 — FIRM SCOPE, WITH NO EXISTENCE ORACLE. A nonexistent id and another firm's document
// must be indistinguishable by everything a caller can see.
// =============================================================================================
test("D2 — a nonexistent document id is CLR11 document_not_found", async (t) => {
  if (skipHere(t)) return;
  await refusal(() => door(randomUUID(), world.users.alice), "CLR11", "document_not_found", "D2");
});

test("D3 — firm B's document is the SAME refusal, byte for byte (no existence oracle)", async (t) => {
  if (skipHere(t)) return;
  const absent = await refusal(() => door(randomUUID(), world.users.alice),
    "CLR11", "document_not_found", "D3 nonexistent");
  const foreign = await refusal(() => door(foreignDoc.documentId, world.users.alice),
    "CLR11", "document_not_found", "D3 foreign firm");
  // A different message or detail is an oracle wearing a matching SQLSTATE.
  assert.equal(absent.message, foreign.message, "the two refusals must not be tellable apart");
  assert.equal(absent.detail, foreign.detail, "the two refusal details must not be tellable apart");
  // …and the differential twin: firm B's OWNER reads firm B's document.
  const served = await door(foreignDoc.documentId, world.users.dave);
  assert.equal(served.firm_id, world.firms.B);
  // A null principal collapses into the same shape rather than raising something else.
  const nullUser = await refusal(() => door(ownDoc.documentId, null),
    "CLR11", "document_not_found", "D3 null user");
  assert.equal(nullUser.message, absent.message);
});

// =============================================================================================
// D4 — A REVOKED MEMBERSHIP IS DENIED ON THE NEXT CALL. The credential is unchanged; the
// membership row is what the door reads, and it reads it per call.
// =============================================================================================
test("D4 — a removed member's id buys nothing on the very next call", async (t) => {
  if (skipHere(t)) return;
  const user = await insertUser(world.prefix, `d620rm${randomUUID().slice(0, 4)}`);
  await addMember(world.users.alice,
    { firm: world.firms.A, user, role: "bookkeeper", opKey: opk("d620mem") });
  const membership = (await rootQuery(
    "select id from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [world.firms.A, user])).rows[0]?.id;
  assert.ok(membership, "the audited add_member writer must have left an ACTIVE membership row");
  const served = await door(ownDoc.documentId, user);
  assert.equal(served.storage_path, (await documentRow(ownDoc.documentId)).storage_path,
    "the ADMITTED twin: an active member is served");
  // Through the estate's OWN path (clara.remove_member, the admission lane's writer), never a
  // direct status UPDATE — a hand-written status flip would prove the predicate reads a column,
  // not that the product's removal verb closes the door.
  await removeMember(world.users.alice, { membership, opKey: opk("d620rm") });
  await refusal(() => door(ownDoc.documentId, user), "CLR11", "document_not_found", "D4 removed");
});

// =============================================================================================
// D5 — CLIENT SCOPE. The document's ACTIVE filing decides, and nothing else (#620 decision 3).
// Five arms, each differing from the admitted one in exactly the client term.
// =============================================================================================
test("D5.1 — p_client = the document's own client is served; a SIBLING client of the same firm is not", async (t) => {
  if (skipHere(t)) return;
  const ok = await door(ownDoc.documentId, world.users.alice, { client: world.clients.A1 });
  assert.equal(ok.client_id, world.clients.A1);
  await refusal(() => door(ownDoc.documentId, world.users.alice, { client: world.clients.A2 }),
    "CLR11", "document_not_found", "D5.1 sibling client");
});

test("D5.2 — a client of ANOTHER firm is the same refusal, and leaks nothing about that client", async (t) => {
  if (skipHere(t)) return;
  const other = await refusal(() => door(ownDoc.documentId, world.users.alice, { client: world.clients.B1 }),
    "CLR11", "document_not_found", "D5.2 foreign client");
  const sibling = await refusal(() => door(ownDoc.documentId, world.users.alice, { client: world.clients.A2 }),
    "CLR11", "document_not_found", "D5.2 sibling client");
  assert.equal(other.message, sibling.message);
  assert.equal(other.detail, sibling.detail);
});

test("D5.3 — an UNFILED document is served without a client and refused with ANY client", async (t) => {
  if (skipHere(t)) return;
  const ok = await door(unfiledDoc.documentId, world.users.alice);
  assert.equal(ok.client_id, null, "an unfiled document reports no client, and is still readable");
  for (const c of [world.clients.A1, world.clients.A2, world.clients.B1]) {
    await refusal(() => door(unfiledDoc.documentId, world.users.alice, { client: c }),
      "CLR11", "document_not_found", `D5.3 unfiled + ${c}`);
  }
});

test("D5.4 — a RETIRED filing is not a filing: the same client that was served is then refused", async (t) => {
  if (skipHere(t)) return;
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  await fileDocument(world.users.alice, {
    document: doc.documentId, client: world.clients.A2,
    resolution: await freshResolution(world.users.alice, world.clients.A2),
  });
  const served = await door(doc.documentId, world.users.alice, { client: world.clients.A2 });
  assert.equal(served.client_id, world.clients.A2, "the ADMITTED twin: an ACTIVE filing is in scope");

  const filing = (await rootQuery(
    `select id, revision_token from clara.document_filings
      where document_id=$1 and client_id=$2 and retired_at is null`,
    [doc.documentId, world.clients.A2])).rows[0];
  assert.ok(filing, "the fixture must have an active filing to retire");
  await retireDocumentFiling(world.users.alice, {
    filing: filing.id, reason: "#620 D5.4 scope proof", expectedRevision: filing.revision_token,
  });
  const retired = (await rootQuery(
    "select retired_at from clara.document_filings where id=$1", [filing.id])).rows[0].retired_at;
  assert.ok(retired, "the audited retire writer must actually have retired the filing");

  await refusal(() => door(doc.documentId, world.users.alice, { client: world.clients.A2 }),
    "CLR11", "document_not_found", "D5.4 retired filing");
  // …and with no client asked for, the document is STILL readable and now reports no client:
  // retiring a filing removes the client scope, never the firm's access to its own document.
  const noClient = await door(doc.documentId, world.users.alice);
  assert.equal(noClient.client_id, null);
});

// =============================================================================================
// D6 — CUSTODY PENDING. The one refusal that is deliberately NOT the not-found shape: it is the
// caller's OWN document and the fix is theirs. It writes NO audit line — nothing egressed.
// =============================================================================================
test("D6 — a document whose custody bond is unstamped is CLR13 custody_pending, with no audit line", async (t) => {
  if (skipHere(t)) return;
  for (const withPath of [true, false]) {
    const id = await seedCustodyPendingDocument(world.firms.A, { withPath });
    const before_ = await auditCount(id);
    const err = await refusal(() => door(id, world.users.alice), "CLR13", "custody_pending",
      `D6 (${withPath ? "bytes_verified_at null" : "storage_path null"})`);
    // The refusal is TELLABLE APART from a not-found — that is the whole point of the code.
    assert.notEqual(err.code, "CLR11");
    assert.equal(await auditCount(id), before_, "a refusal is not an egress and must not be receipted");
  }
});

test("D6.2 — custody is checked AFTER client scope: an out-of-scope pending document is still not-found", async (t) => {
  if (skipHere(t)) return;
  // Otherwise CLR13 would tell a caller that a document they may not read for this client exists.
  const id = await seedCustodyPendingDocument(world.firms.A, { withPath: true });
  await refusal(() => door(id, world.users.alice, { client: world.clients.A1 }),
    "CLR11", "document_not_found", "D6.2 pending + out-of-scope client");
  await refusal(() => door(id, world.users.dave), "CLR11", "document_not_found", "D6.2 pending + foreign firm");
});

// =============================================================================================
// D7 — THE PURPOSE. It reaches the ledger verbatim, and an unsupported one refuses CLR10 BEFORE
// anything is read (so an arbitrary purpose string is not an existence probe).
// =============================================================================================
test("D7.1 — p_purpose='download' is recorded in the audit args verbatim", async (t) => {
  if (skipHere(t)) return;
  await door(ownDoc.documentId, world.users.alice, { client: world.clients.A1, purpose: "download" });
  const args = (await rootQuery(
    `select args from clara.audit_log where fn='get_document_for_human_read_v2' and entry_id=$1
      order by at desc, ctid desc limit 1`, [ownDoc.documentId])).rows[0].args;
  assert.deepEqual(args, { client: world.clients.A1, purpose: "download" });
});

test("D7.2 — an unsupported purpose is CLR10 invalid_purpose, writes no line, and is NOT an existence probe", async (t) => {
  if (skipHere(t)) return;
  const before_ = await auditCount(ownDoc.documentId);
  for (const bad of ["", "PREVIEW", "delete", "download ", null]) {
    await refusal(() => door(ownDoc.documentId, world.users.alice, { purpose: bad }),
      "CLR10", "invalid_purpose", `D7.2 purpose=${JSON.stringify(bad)}`);
  }
  assert.equal(await auditCount(ownDoc.documentId), before_, "a refused purpose is not an egress");
  // THE ORACLE TEST. A readable document and one that does not exist must answer the SAME code
  // for the same bad purpose — otherwise a caller who may send a purpose has a two-answer probe
  // for whether a document id is real.
  const mine = await refusal(() => door(ownDoc.documentId, world.users.alice, { purpose: "delete" }),
    "CLR10", "invalid_purpose", "D7.2 mine");
  const absent = await refusal(() => door(randomUUID(), world.users.alice, { purpose: "delete" }),
    "CLR10", "invalid_purpose", "D7.2 absent");
  assert.equal(mine.message, absent.message);
  assert.equal(mine.detail, absent.detail);
  // …and the differential twin: the SAME calls with a supported purpose diverge as they should.
  assert.ok(await door(ownDoc.documentId, world.users.alice, { purpose: "download" }));
  await refusal(() => door(randomUUID(), world.users.alice, { purpose: "download" }),
    "CLR11", "document_not_found", "D7.2 absent + good purpose");
});

// =============================================================================================
// D8 — THE EXECUTE SWEEP, proven BEHAVIOURALLY. The migration's tail censuses the ACL; this is
// the other half — what each role can actually CALL. A storage_path must be unreachable from a
// browser session, from either agent read role, and from every wake lane.
// =============================================================================================
test("D8.1 — clara_runtime can call the door (the positive control for the whole sweep)", async (t) => {
  if (skipHere(t)) return;
  assert.ok(await door(ownDoc.documentId, world.users.alice));
});

test("D8.2 — clara_authenticated and the agent read roles are EXECUTE-denied (42501)", async (t) => {
  if (skipHere(t)) return;
  let err = null;
  try {
    await asHuman(world.users.alice, (db) =>
      db.query("select clara.get_document_for_human_read_v2($1::uuid,$2::uuid) r",
        [ownDoc.documentId, world.users.alice]));
  } catch (e) { err = e; }
  assert.ok(err, "the byte door must not be callable by the browser's role");
  assert.equal(err.code, "42501", `expected an EXECUTE denial, got ${err.code}: ${err.message}`);

  for (const role of [ROLES.agentRo, ROLES.authenticated]) {
    await assertRaises("42501", () => roleQuery(role,
      "select clara.get_document_for_human_read_v2($1::uuid,$2::uuid) r",
      [ownDoc.documentId, world.users.alice]), `D8.2 ${role}`);
  }
});

test("D8.3 — no wake lane reaches the door (an agent never receives raw source bytes)", async (t) => {
  if (skipHere(t)) return;
  const { secret } = await mintWake({ kind: "interactive", firm: world.firms.A, onBehalfOf: world.users.alice });
  let err = null;
  try {
    await asWake(ROLES.wakeInteractive, secret, (db) =>
      db.query("select clara.get_document_for_human_read_v2($1::uuid,$2::uuid) r",
        [ownDoc.documentId, world.users.alice]));
  } catch (e) { err = e; }
  assert.ok(err && err.code === "42501",
    `a wake role must be EXECUTE-denied on the source byte door (got ${err?.code}: ${err?.message})`);
  for (const role of [ROLES.wakeProactive]) {
    await assertRaises("42501", () => roleQuery(role,
      "select clara.get_document_for_human_read_v2($1::uuid,$2::uuid) r",
      [ownDoc.documentId, world.users.alice]), `D8.3 ${role}`);
  }
  // The freeform / bank / filing / webhook lanes exist on some chains and not others — sweep
  // whichever this cluster actually has rather than skipping the question.
  const extra = (await rootQuery(
    `select r as role from unnest(array['clara_freeform_ro','clara_wake_bank','clara_wake_filing',
       'clara_stripe_webhook']) r where to_regrole(r) is not null`)).rows.map((x) => x.role);
  assert.ok(extra.length > 0, "no further wake/agent lanes on this cluster — the sweep would be vacuous");
  for (const role of extra) {
    const ok = (await rootQuery("select has_function_privilege($1,$2,'execute') as ok", [role, V2])).rows[0].ok;
    assert.equal(ok, false, `${role} must not hold EXECUTE on ${V2}`);
  }
});

// =============================================================================================
// D9 / D10 — THE FILE'S OWN PROMISES, re-read from the live catalog.
// =============================================================================================
test("D9 — v1 is UNTOUCHED: its prosrc matches the sha 0190 pins, and its grant row is unchanged", async (t) => {
  if (skipHere(t)) return;
  // The pin is read out of the MIGRATION, not retyped here: a second, independent copy of the
  // same hex string is a copy that can rot. This cell proves the migration's own pin still
  // describes the live body.
  const sql = readFileSync(MIGRATION, "utf8");
  const pins = [...sql.matchAll(/c_v1_sha\s+constant text\s*:=\s*'([0-9a-f]{64})'/g)].map((m) => m[1]);
  assert.equal(pins.length, 1, "0190 must pin v1's prosrc sha exactly once");
  const live = (await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid=$1::regprocedure",
    [V1])).rows[0].sha;
  assert.equal(live, pins[0], "v1 get_document_for_human_read moved — #620 promised not to touch it");

  const acl = (await rootQuery(
    `select coalesce(string_agg(distinct coalesce(rr.rolname,'PUBLIC'), ',' order by coalesce(rr.rolname,'PUBLIC')),'(none)') as acl
       from pg_proc p, aclexplode(p.proacl) acl left join pg_roles rr on rr.oid=acl.grantee
      where p.oid=$1::regprocedure and acl.privilege_type='EXECUTE'`, [V1])).rows[0].acl;
  assert.equal(acl, "clara_fn_owner,clara_runtime",
    "v1's EXECUTE grantee set is pinned by 0011's own tail assertion (0011:4238) and must not move");
  // v1 still ANSWERS, so the route's cutover is a choice and not a forced march.
  const v1 = (await roleQuery(ROLES.runtime,
    "select clara.get_document_for_human_read($1::uuid,$2::uuid) as r",
    [ownDoc.documentId, world.users.alice])).rows[0].r;
  assert.equal(v1.storage_path, (await documentRow(ownDoc.documentId)).storage_path);
});

test("D10 — the door pins plan_cache_mode=force_custom_plan and search_path in proconfig", async (t) => {
  if (skipHere(t)) return;
  const p = (await rootQuery(
    "select p.proconfig, p.prosecdef, p.provolatile, p.proowner::regrole::text as owner from pg_proc p where p.oid=$1::regprocedure",
    [V2])).rows[0];
  assert.ok((p.proconfig ?? []).includes("plan_cache_mode=force_custom_plan"),
    `proconfig is ${JSON.stringify(p.proconfig)} — without the pin the session firm is planned at the per-firm average`);
  assert.ok((p.proconfig ?? []).includes("search_path=clara, pg_temp"));
  assert.equal(p.prosecdef, true);
  assert.equal(p.provolatile, "v", "the door WRITES an audit line, so it cannot be STABLE");
  assert.equal(p.owner, "clara_fn_owner");
});

// =============================================================================================
// D11 — THE TAIL IS RE-RUNNABLE. A self-checking tail that could only ever run once inside its
// own migration transaction is a tail nobody can use as a live audit; this runs 0190's own block
// TWICE against the migrated database and requires both to pass.
// =============================================================================================
test("D11 — 0190's tail census is idempotent: its own block runs twice, green both times", async (t) => {
  if (skipHere(t)) return;
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("do $tail$");
  const end = sql.indexOf("end $tail$;");
  assert.ok(start > 0 && end > start, "0190 must carry exactly one do $tail$ ... end $tail$; block");
  const tail = sql.slice(start, end + "end $tail$;".length);
  assert.ok(tail.includes("0190 tail: OK"), "the extracted block must be the tail census");

  await asRoot(async (c) => {
    // The tail reads the prestate table the migration built (on commit drop, so it is long gone).
    // Rebuild it from the LIVE catalog: the tail then compares its literals against the catalog
    // twice over, which is exactly the audit this cell is asserting can be re-run.
    await c.query("create temp table _d620_prestate (k text primary key, v jsonb not null)");
    try {
      await c.query(
        `insert into _d620_prestate(k,v)
         select 'v1_sha', to_jsonb(encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'))
           from pg_proc p where p.oid = $1::regprocedure`, [V1]);
      await c.query(
        `insert into _d620_prestate(k,v)
         select 'v1_acl', to_jsonb(coalesce(string_agg(distinct coalesce(rr.rolname,'PUBLIC'), ',' order by coalesce(rr.rolname,'PUBLIC')),'(none)'))
           from pg_proc p, aclexplode(p.proacl) acl left join pg_roles rr on rr.oid=acl.grantee
          where p.oid = $1::regprocedure and acl.privilege_type='EXECUTE'`, [V1]);
      for (const pass of [1, 2]) {
        await c.query(tail); // throws with the tail's own CLR10 message on any drift
        noteLane(`D11: 0190's tail census re-ran green (pass ${pass}/2)`);
      }
    } finally {
      await c.query("drop table if exists _d620_prestate");
    }
  });
});
