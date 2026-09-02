// FS-7 echelon 2 -- THE ONE GENERIC ARTIFACT DOWNLOAD DOOR, for
// migrations/UNNUMBERED_fs7_e2_artifact_download_door.sql.
//
// Design of record: 裁-96② (docs/plan/active/mohe-grill-rulings-2026-09-01.md) -- ONE generic door
// over BOTH artifact families, server-side gate only, client-side signed-URL minting FORBIDDEN --
// and the FS-7 PR-3 row of docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md.
//
// EVERY WALL IS FORCED IN BOTH POLARITIES (estate law 31). A refusal cell's differential twin is
// ADMITTED, and the two differ in exactly the term the wall reads -- never in two terms at once,
// because a cell whose arms differ in two places cannot say which one the gate answered.
//
// THE GATE IS EXECUTED, NEVER RE-IMPLEMENTED (裁-112). No assertion below recomputes "is this
// downloadable"; every one of them calls clara.get_artifact_for_human_read or
// clara.list_downloadable_artifacts and reads the DOOR's verdict. The mutant panel that proves
// each wall discriminates lives in scripts and is named in the PR body; the cells here are what
// it makes red.
//
// THE READINESS GATE IS MEASURED, NOT ASSUMED, and it is THREE-VALUED: all present -> run, all
// absent -> skip (a pre-FS-7 chain), a mix -> THROW. A partial cohort is drift and must be loud.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  rootQuery, roleQuery, humanQuery, endPool, ROLES, opk, asHuman, asWake, CLR,
} from "./rig-helpers.mjs";
import { mintWake } from "./rig-fixtures.mjs";
import { sealArtifact, sealedRun, sharedWorld, parkQueue } from "./zeta-fixtures.mjs";

const FNS = Object.freeze([
  "clara._artifact_download_core(uuid,uuid,uuid,int)",
  "clara.get_artifact_for_human_read(uuid,uuid)",
  "clara.list_downloadable_artifacts(uuid,int)",
]);

/** Three-valued readiness, read from the LIVE CATALOG by EXACT SIGNATURE (law 3). */
async function fs7e2Ready() {
  const r = await rootQuery(
    `select (select count(*)::int from unnest($1::text[]) s where to_regprocedure(s) is not null) as fns`,
    [[...FNS]]);
  const n = r.rows[0].fns;
  if (n === 0) return false;
  if (n !== FNS.length) throw new Error(`FS-7 e2 DRIFT: ${n}/${FNS.length} download-door functions resolve`);
  return true;
}

let ready = false;
let world = null;
let eps = null;          // an epsilon world under firm A, owned by alice
let presign = null;      // a sealed pre_sign artifact of that run

/**
 * A sealed run whose render queue holds ONLY this run's job.
 *
 * `zeta-fixtures.sealArtifact` claims the OLDEST claimable job in the whole table, so a world
 * built without parking first seals SOMEBODY ELSE'S run — which is exactly how the first cut of
 * this file failed, and it failed in `before()`, taking every cell with it. `sealedRun` parks the
 * queue before it builds, which is the invariant every ζ cell is written against.
 */
async function ownSealedRun(tag) {
  const { eps: e } = await sealedRun(`fs7e2-${tag}-${randomUUID().slice(0, 6)}`);
  return e;
}

before(async () => {
  ready = await fs7e2Ready();
  if (!ready) return;
  world = await sharedWorld();
  eps = await ownSealedRun("base");
  presign = await sealArtifact(eps, `fs7e2-sealer-${randomUUID().slice(0, 8)}`, "pre_sign");
});

after(async () => { await endPool(); });

const skipHere = (t, why) => { t.skip(`FS-7 e2: ${why}`); return true; };

/** THE BYTE DOOR, called the way the runtime route calls it: as clara_runtime, principal in. */
const byteDoor = (artifactId, userId) =>
  roleQuery(ROLES.runtime, "select clara.get_artifact_for_human_read($1::uuid, $2::uuid) as r",
    [artifactId, userId]).then((r) => r.rows[0].r);

/** THE OFFER DOOR, called the way the browser calls it: as clara_authenticated, JWT-scoped. */
const offerDoor = (sub, clientId, limit = 200) =>
  humanQuery(sub, "select clara.list_downloadable_artifacts($1::uuid, $2::int) as r", [clientId, limit])
    .then((r) => r.rows[0].r);

/** Assert a refusal by SQLSTATE and by the gate's own typed `reason`, never by message text. */
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

// =============================================================================================
// D1 -- FIRM SCOPE. A member of firm B cannot fetch firm A's artifact, and the refusal is the
// SINGLE not-found shape -- it must be indistinguishable from an id that does not exist at all.
// =============================================================================================
test("D1.1 -- a firm-A artifact is served to a firm-A owner (the ADMITTED twin)", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const r = await byteDoor(presign.artifactId, world.users.alice);
  assert.equal(r.family, "report_artifact");
  assert.equal(r.artifact_id, presign.artifactId);
  assert.equal(r.sha256, presign.sha256);
});

test("D1.2 -- the SAME artifact is not-found to a firm-B member (the REFUSED twin)", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  await refusal(() => byteDoor(presign.artifactId, world.users.dave),
    CLR.notFound, "artifact_not_found", "D1.2 cross-firm");
});

test("D1.3 -- NO EXISTENCE ORACLE: a nonexistent id refuses with the same code and the same reason as a foreign-firm one", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const absent = await refusal(() => byteDoor(randomUUID(), world.users.alice),
    "CLR11", "artifact_not_found", "D1.3 nonexistent");
  const foreign = await refusal(() => byteDoor(presign.artifactId, world.users.dave),
    "CLR11", "artifact_not_found", "D1.3 foreign");
  // The two must be indistinguishable by everything a caller can see, message included: a
  // different message is an oracle wearing a matching SQLSTATE.
  assert.equal(absent.message, foreign.message, "the two refusals must not be tellable apart");
  assert.equal(absent.detail, foreign.detail, "the two refusal details must not be tellable apart");
});

// =============================================================================================
// D2 -- THE HUMAN READ FLOOR. Same firm, same artifact; the arms differ in RANK alone.
// =============================================================================================
test("D2.1 -- a bookkeeper (at the floor) is served", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const r = await byteDoor(presign.artifactId, world.users.bob);
  assert.equal(r.artifact_id, presign.artifactId);
});

test("D2.2 -- a VIEWER of the same firm is refused CLR04 insufficient_role", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  await refusal(() => byteDoor(presign.artifactId, world.users.carol),
    "CLR04", "insufficient_role", "D2.2 viewer");
});

test("D2.3 -- a REMOVED member's id buys nothing, even though the row still exists", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  // A fresh member so the removal cannot disturb the shared world's other cells.
  const u = randomUUID();
  await rootQuery(
    `insert into clara.users(id, display_name, email, is_agent) values ($1, 'fs7e2 removed', $2, false)`,
    [u, `fs7e2-removed-${u.slice(0, 8)}@rig.test`]);
  await rootQuery(
    `insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'bookkeeper','active')`,
    [world.firms.A, u]);
  const served = await byteDoor(presign.artifactId, u);
  assert.equal(served.artifact_id, presign.artifactId, "the ADMITTED twin: an active bookkeeper is served");
  await rootQuery(
    `update clara.firm_memberships set status='removed', removed_at=now() where firm_id=$1 and user_id=$2`,
    [world.firms.A, u]);
  await refusal(() => byteDoor(presign.artifactId, u), "CLR11", "artifact_not_found", "D2.3 removed member");
});

// =============================================================================================
// D3 -- THE BYTE-HASH RECEIPT. What the door serves is what the ROW says, field for field. This
// is the cell that makes "the byte hash in the row equals sha256(bytes served)" checkable at the
// route: the route streams the object at `storage_key` and verifies against `sha256`.
// =============================================================================================
test("D3.1 -- the door's storage_key/sha256/byte_size are the artifact row's own, and the key is content-addressed", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const row = (await rootQuery(
    `select storage_key, sha256, byte_size, key_extension, kind, client_id, firm_id
       from clara.report_artifacts where id=$1`, [presign.artifactId])).rows[0];
  const r = await byteDoor(presign.artifactId, world.users.alice);
  assert.equal(r.storage_key, row.storage_key);
  assert.equal(r.sha256, row.sha256);
  assert.equal(String(r.byte_size), String(row.byte_size));
  assert.equal(r.content_type, "application/pdf");
  assert.deepEqual(r.client_ids, [row.client_id]);
  // The storage key IS the content address -- so a route that verifies the downloaded bytes
  // against r.sha256 has verified them against the path it fetched them from.
  assert.equal(r.storage_key, `firms/${row.firm_id}/reports/${row.sha256}.${row.key_extension}`);
  // The filename is DERIVED from the content address, never carried from a database string.
  assert.equal(r.filename, `clara-report-${row.kind}-${row.sha256.slice(0, 12)}.${row.key_extension}`);
});

// =============================================================================================
// D4/D5 -- THE DRAFT LANE. Both walls need a `draft_watermarked` artifact whose sealed manifest
// carries a keyword string this file CHOSE, and clara.report_artifacts is insert-once with UPDATE
// trigger-blocked (0066 E8): the keyword cannot be patched in afterwards, it has to be sealed in.
// So the draft is sealed through the REAL queue path, exactly as the render worker seals one.
//
// ONE DRAFT PER RUN, and that is forced rather than tidy: the gate checks SUPERSEDED before it
// checks the watermark, and clara.complete_render_job auto-chains a run's second artifact to its
// first -- so two drafts on one run would make the first refuse `artifact_superseded` and the
// watermark arm would never be reached. D5's three arms therefore take three runs.
// =============================================================================================

/** Seal ONE draft_watermarked artifact on `e.runId` with a chosen `document_metadata.keywords`.
 *  Mirrors zeta-fixtures.sealArtifact, which cannot be reused here because it authors the whole
 *  manifest and this file's whole subject is one key inside it. */
async function sealDraft(e, keywords) {
  const worker = `fs7e2-draft-${randomUUID().slice(0, 8)}`;
  await parkQueue();
  await roleQuery(ROLES.fnOwner, "select clara.enqueue_render_job($1, 'draft_watermarked')", [e.runId]);
  const job = (await roleQuery(ROLES.runtime, "select clara.claim_render_job($1) j", [worker])).rows[0].j;
  assert.equal(job?.report_run_id, e.runId, "the parked queue must hand back THIS run's draft job");
  assert.equal(job.kind, "draft_watermarked");
  const sha = createHash("sha256").update(`${worker}:${randomUUID()}`).digest("hex");
  const documentMeta = { title: "fs7 e2 draft", creation_date_utc: "2025-12-31T00:00:00Z" };
  if (keywords !== null) documentMeta.keywords = keywords;
  const manifest = {
    ...job.request_manifest,
    render_request_sha256: job.manifest_sha256,
    assembler_version: "clara.reporting-render/v1",
    renderer_image_digest: `sha256:${"c".repeat(64)}`,
    renderer_source_commit: "d".repeat(40),
    node_version: "v20.19.5", os_version: "linux test", architecture: "x64",
    font_engine_version: "typst 0.0.0-test",
    document_metadata: documentMeta,
    extracted_text_sha256: "e".repeat(64),
    extraction_tool: "pdftotext (poppler-utils) 0.0.0-test",
  };
  const done = (await roleQuery(ROLES.runtime,
    "select clara.complete_render_job($1,$2,$3,4096,$4::jsonb) r",
    [job.render_job_id, worker, sha, JSON.stringify(manifest)])).rows[0].r;
  assert.ok(done.report_artifact_id, "the draft fixture must actually seal an artifact");
  return { artifactId: done.report_artifact_id, sha256: sha };
}

const BURNED = "report_run:r dataset:d uncertified watermarked";

test("D4.1 -- an artifact whose successor exists is refused; the successor itself is served", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  // THE TWO ARTIFACTS ARE DIFFERENT KINDS, and that is forced by the estate rather than chosen:
  // clara.render_jobs' idempotency key is a partial unique index on (report_run_id,
  // manifest_sha256) (0079:171), and clara.render_request_manifest_v1 pins the KIND -- so a second
  // draft_watermarked job on one run is the SAME request and enqueue hands back the finished one.
  // pre_sign first (the dataset seal already queued it), then the draft that supersedes it.
  const own = await ownSealedRun("sup");
  const first = await sealArtifact(own, `fs7e2-sup-${randomUUID().slice(0, 8)}`, "pre_sign");
  // ADMITTED, before anything supersedes it -- so the refusal below is attributable to the
  // successor and to nothing else about this row.
  const before_ = await byteDoor(first.artifactId, world.users.alice);
  assert.equal(before_.artifact_id, first.artifactId);

  // clara.complete_render_job chains the run's second artifact to its first ITSELF (0082:219) --
  // this cell never writes prior_artifact_id, it makes the estate write it.
  const second = await sealDraft(own, BURNED);
  const chained = (await rootQuery(
    "select prior_artifact_id from clara.report_artifacts where id=$1", [second.artifactId])).rows[0];
  assert.equal(chained.prior_artifact_id, first.artifactId, "premise: the estate chained the successor");

  const err = await refusal(() => byteDoor(first.artifactId, world.users.alice),
    "CLR10", "artifact_superseded", "D4.1 superseded");
  assert.equal(JSON.parse(err.detail).successor_artifact_id, second.artifactId);
  const after_ = await byteDoor(second.artifactId, world.users.alice);
  assert.equal(after_.artifact_id, second.artifactId, "the successor is the one that serves");
});

// =============================================================================================
// D5 -- THE DRAFT WATERMARK WALL, and the WORD BOUNDARY that makes it real.
//
// D5.2 IS THE POINT. `unwatermarked` CONTAINS `watermarked`, so a substring predicate would pass
// the exact artifact this wall exists to stop. The three arms differ in that one keyword and in
// nothing else -- same kind, same run shape, the same manifest otherwise.
// =============================================================================================
test("D5.1 -- draft_watermarked: a manifest that records the burn SERVES", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const art = await sealDraft(await ownSealedRun("wm-ok"), BURNED);
  const ok = await byteDoor(art.artifactId, world.users.alice);
  assert.equal(ok.artifact_id, art.artifactId, "ADMITTED: the sealed manifest records the burn");
  assert.equal(ok.kind, "draft_watermarked");
});

test("D5.2 -- `unwatermarked` must NOT satisfy the wall (the word-boundary cell)", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const art = await sealDraft(await ownSealedRun("wm-un"),
    "report_run:r dataset:d uncertified unwatermarked");
  await refusal(() => byteDoor(art.artifactId, world.users.alice),
    "CLR10", "artifact_watermark_unproven", "D5.2 unwatermarked");
});

test("D5.3 -- an ABSENT keywords key refuses too (absence is not evidence of a burn)", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const art = await sealDraft(await ownSealedRun("wm-none"), null);
  await refusal(() => byteDoor(art.artifactId, world.users.alice),
    "CLR10", "artifact_watermark_unproven", "D5.3 absent keywords");
});

test("D5.4 -- a pre_sign artifact carries no watermark and is served anyway (the wall is kind-scoped)", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const kw = (await rootQuery(
    `select manifest #>> '{document_metadata,keywords}' as kw from clara.report_artifacts where id=$1`,
    [presign.artifactId])).rows[0].kw;
  assert.equal(kw, null, "premise: the pre_sign fixture claims no burn");
  const r = await byteDoor(presign.artifactId, world.users.alice);
  assert.equal(r.kind, "pre_sign");
});

// =============================================================================================
// D6 -- THE SANDBOX FAMILY. The same door, the other family.
// =============================================================================================
async function sandboxFixture({ complete = true, watermarkPolicyId = null, clientSet = null } = {}) {
  const client = clientSet ? clientSet[0] : eps.client;
  // AN OPEN, NON-BLANK WINDOW ONLY. D6.3 lands a deliberately BLANK rig fixture row with a closed
  // historical window; a bare `order by version desc` would pick that row on the NEXT run of this
  // file and quietly turn every other sandbox cell into the refusal cell -- which is how the first
  // cut of this file went red on its second run and green on its first.
  const pol = watermarkPolicyId ?? (await rootQuery(
    `select id from clara.watermark_policy_versions
      where policy_key='sandbox_watermark' and locale='en' and effective_to is null
        and btrim(coalesce(watermark ->> 'watermark','')) <> ''
      order by version desc limit 1`)).rows[0].id;
  const recipient = (await asHuman(world.users.alice, (db) =>
    db.query("select clara.register_export_recipient($1,$2,$3,$4,$5,$6) as r",
      ["firm_member", world.users.bob, `fs7e2 ${randomUUID().slice(0, 6)}`, "fs7 e2 battery", null,
        opk("fs7e2rcpt")]))).rows[0].r.recipient_id;
  // The VIEW and the EXPORT are inserted directly rather than driven through the wake verbs: this
  // file is about the DOWNLOAD gate, and the mint/request path has its own battery (F-A5b PR-1 /
  // card 1). Driving it here would couple this cell to the seam's own preconditions and to
  // whichever cell happened to leave a claimable row behind.
  const view = (await rootQuery(
    `insert into clara.sandbox_views(firm_id, body, body_sha256, client_set, client_set_basis,
       basis, acting_actor, model_snapshot, rationale)
     values ($1, $2::jsonb, $3, $4::uuid[], 'exact', '[]'::jsonb, $5,
       '{"provider":"anthropic","model":"claude-opus-5","version":"2026-08"}'::jsonb, 'fs7 e2 battery')
     returning id`,
    [world.firms.A, JSON.stringify({ blocks: [{ kind: "text", basis_ref: "a", displayed_text: "prose" }] }),
      createHash("sha256").update(randomUUID()).digest("hex"), clientSet ?? [client], world.users.alice],
  )).rows[0].id;
  const sha = createHash("sha256").update(`fs7e2-${randomUUID()}`).digest("hex");
  const exp = (await rootQuery(
    `insert into clara.sandbox_exports(firm_id, sandbox_view_id, recipient_id, coverage_proof,
       watermark_policy_version_id, locale, requested_by, op_key, state)
     values ($1,$2,$3,'{}'::jsonb,$4,'en',$5,$6,'claimable') returning id`,
    [world.firms.A, view, recipient, pol, world.users.alice, opk("fs7e2exp")])).rows[0].id;
  if (complete) {
    await rootQuery(
      `update clara.sandbox_exports set state='done', artifact_sha256=$2, byte_size=2048,
         storage_key=$3, claimed_by='fs7e2-worker', claimed_at=now(),
         lease_expires_at=now()+interval '20 minutes', finished_at=now() where id=$1`,
      [exp, sha, `firms/${world.firms.A}/sandbox/${sha}.pdf`]);
  }
  return { exportId: exp, viewId: view, sha256: sha, clientId: client };
}

test("D6.1 -- a COMPLETED sandbox export downloads through the SAME door as a sealed artifact", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const fx = await sandboxFixture({ complete: true });
  const r = await byteDoor(fx.exportId, world.users.alice);
  assert.equal(r.family, "sandbox_export");
  assert.equal(r.sha256, fx.sha256);
  assert.equal(r.content_type, "application/pdf");
  assert.equal(r.storage_key, `firms/${world.firms.A}/sandbox/${fx.sha256}.pdf`);
  assert.equal(r.filename, `clara-sandbox-export-${fx.sha256.slice(0, 12)}.pdf`);
  assert.deepEqual(r.client_ids, [fx.clientId]);
});

test("D6.2 -- an UNFINISHED sandbox export refuses CLR10 sandbox_export_not_complete", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const fx = await sandboxFixture({ complete: false });
  const err = await refusal(() => byteDoor(fx.exportId, world.users.alice),
    "CLR10", "sandbox_export_not_complete", "D6.2 unfinished");
  assert.equal(JSON.parse(err.detail).state, "claimable");
});

test("D6.3 -- a sandbox export whose pinned watermark policy carries BLANK text refuses", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  // A rig-only policy version with a CLOSED historical window, so clara._watermark_policy_version_for
  // can never pick it for a real request -- it exists only to be pinned by this fixture.
  const blank = (await rootQuery(
    `insert into clara.watermark_policy_versions(firm_id, policy_key, version, locale, watermark,
       effective_from, effective_to, source_note)
     values (null,'sandbox_watermark',$1,'en','{"watermark":""}'::jsonb,
       date '2001-01-01', date '2001-01-02', 'fs7 e2 rig fixture: a blank ratified text')
     returning id`, [900000 + Math.floor(Math.random() * 90000)])).rows[0].id;
  const refused = await sandboxFixture({ complete: true, watermarkPolicyId: blank });
  await refusal(() => byteDoor(refused.exportId, world.users.alice),
    "CLR10", "watermark_policy_absent", "D6.3 blank watermark");
  // THE ADMITTED TWIN differs in the pinned policy row and in nothing else.
  const served = await sandboxFixture({ complete: true });
  const ok = await byteDoor(served.exportId, world.users.alice);
  assert.equal(ok.family, "sandbox_export");
});

test("D6.4 -- a sandbox export covering a client OUTSIDE the firm is not-found, not partially served", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  // The stray client is firm B's. The view's client_set therefore carries one id this firm does
  // not own, which is the covered-recipient cross-client case the design names.
  const fx = await sandboxFixture({ complete: true, clientSet: [eps.client, world.clients.B1] });
  await refusal(() => byteDoor(fx.exportId, world.users.alice),
    "CLR11", "artifact_not_found", "D6.4 stray covered client");
});

// =============================================================================================
// D7 -- THE EGRESS RECEIPT. A byte leaving the system is an audit line: who, which, when.
// =============================================================================================
test("D7.1 -- every successful byte read writes exactly one audit line naming the actor and the artifact", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const before_ = (await rootQuery(
    `select count(*)::int n from clara.audit_log where fn='get_artifact_for_human_read' and entry_id=$1`,
    [presign.artifactId])).rows[0].n;
  await byteDoor(presign.artifactId, world.users.bob);
  const rows = (await rootQuery(
    `select actor, firm_id, args, at from clara.audit_log
      where fn='get_artifact_for_human_read' and entry_id=$1 order by at desc`, [presign.artifactId])).rows;
  assert.equal(rows.length, before_ + 1, "exactly one new line");
  assert.equal(rows[0].actor, world.users.bob);
  assert.equal(rows[0].firm_id, world.firms.A);
  assert.equal(rows[0].args.family, "report_artifact");
  assert.equal(rows[0].args.sha256, presign.sha256);
  // The storage path is deliberately NOT in the ledger: the line records WHICH artifact left and
  // to whom, and the content address already lives on the artifact row.
  assert.equal(rows[0].args.storage_key, undefined);
});

test("D7.2 -- a REFUSED read writes no line at all", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const n0 = (await rootQuery(
    `select count(*)::int n from clara.audit_log where fn='get_artifact_for_human_read'`)).rows[0].n;
  await refusal(() => byteDoor(presign.artifactId, world.users.carol),
    "CLR04", "insufficient_role", "D7.2");
  const n1 = (await rootQuery(
    `select count(*)::int n from clara.audit_log where fn='get_artifact_for_human_read'`)).rows[0].n;
  assert.equal(n1, n0, "a refusal is not an egress and must not be receipted as one");
});

// =============================================================================================
// D8 -- THE OFFER DOOR. What the Reports tab asks before it draws a control.
// =============================================================================================
test("D8.1 -- the offer NEVER returns a storage_key, for either family", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  await sandboxFixture({ complete: true });
  const rows = await offerDoor(world.users.alice, eps.client);
  assert.ok(rows.length >= 2, `both families must appear (got ${rows.length})`);
  assert.ok(rows.some((x) => x.family === "report_artifact"));
  assert.ok(rows.some((x) => x.family === "sandbox_export"));
  for (const row of rows) {
    assert.equal(Object.prototype.hasOwnProperty.call(row, "storage_key"), false,
      `the offer leaked a storage_key on ${row.artifact_id}`);
    assert.equal(JSON.stringify(row).includes("firms/"), false,
      `the offer leaked a storage path on ${row.artifact_id}`);
  }
});

test("D8.2 -- the offer's `downloadable` IS the byte door's verdict, row for row", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  await sandboxFixture({ complete: false });
  await sandboxFixture({ complete: true });
  const rows = await offerDoor(world.users.alice, eps.client);
  assert.ok(rows.length >= 3, `the fixture must offer several rows (got ${rows.length})`);
  let agreed = 0;
  for (const row of rows) {
    let served = true;
    try { await byteDoor(row.artifact_id, world.users.alice); } catch { served = false; }
    assert.equal(row.downloadable, served,
      `offer and byte door disagree on ${row.artifact_id} (offer=${row.downloadable} door=${served})`);
    if (!served) assert.ok(row.refusal_reason, "a non-downloadable row must carry the gate's own reason");
    agreed += 1;
  }
  assert.ok(agreed >= 3, "the agreement must be measured over several rows, not one");
});

test("D8.3 -- the offer is firm-scoped and client-scoped: firm B's owner cannot list firm A's client", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  await refusal(() => offerDoor(world.users.dave, eps.client), "CLR11", "client_not_found", "D8.3");
});

test("D8.4 -- a VIEWER is refused the offer at the door's own floor, never handed an empty list", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  // An empty list would read to a UI as "nothing to download" -- indistinguishable from a client
  // with no artifacts. The floor must REFUSE.
  let err = null;
  try { await offerDoor(world.users.carol, eps.client); } catch (e) { err = e; }
  assert.ok(err, "a viewer must be refused, not handed []");
  assert.equal(err.code, "CLR04");
});

// =============================================================================================
// D9 -- THE GRANT WALLS, proven BEHAVIOURALLY. An ACL census is in the migration's tail; this is
// the other half -- what each role can actually CALL.
// =============================================================================================
test("D9.1 -- clara_authenticated cannot execute the BYTE door (no storage path reaches a browser)", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  let err = null;
  try {
    await asHuman(world.users.alice, (db) =>
      db.query("select clara.get_artifact_for_human_read($1::uuid,$2::uuid) r",
        [presign.artifactId, world.users.alice]));
  } catch (e) { err = e; }
  assert.ok(err, "the byte door must not be callable by the browser's role");
  assert.equal(err.code, "42501", `expected an EXECUTE denial, got ${err.code}: ${err.message}`);
});

test("D9.2 -- clara_runtime cannot execute the OFFER door, and the GATE core is callable by nobody", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  let e1 = null;
  try {
    await roleQuery(ROLES.runtime, "select clara.list_downloadable_artifacts($1::uuid, 10) r", [eps.client]);
  } catch (e) { e1 = e; }
  assert.ok(e1 && e1.code === "42501", `the offer door must be runtime-denied (got ${e1?.code})`);

  for (const role of [ROLES.runtime, ROLES.authenticated, ROLES.agentRo]) {
    let e2 = null;
    try {
      await roleQuery(role, "select clara._artifact_download_core($1::uuid,$2::uuid,$3::uuid,3) r",
        [presign.artifactId, world.firms.A, world.users.alice]);
    } catch (e) { e2 = e; }
    assert.ok(e2 && e2.code === "42501", `the gate core must be denied to ${role} (got ${e2?.code})`);
  }
});

test("D9.3 -- no wake role reaches either door (an agent never receives raw bytes)", async (t) => {
  if (!ready) return skipHere(t, "the download-door migration is not applied on this database");
  const { secret } = await mintWake({ kind: "interactive", firm: world.firms.A, onBehalfOf: world.users.alice });
  for (const sql of [
    "select clara.get_artifact_for_human_read($1::uuid,$2::uuid) r",
    "select clara.list_downloadable_artifacts($1::uuid, 10) r",
  ]) {
    let err = null;
    try {
      await asWake(ROLES.wakeInteractive, secret, (db) =>
        db.query(sql, sql.includes("get_artifact") ? [presign.artifactId, world.users.alice] : [eps.client]));
    } catch (e) { err = e; }
    assert.ok(err && err.code === "42501",
      `a wake role must be EXECUTE-denied on ${sql.slice(7, 45)} (got ${err?.code})`);
  }
});
