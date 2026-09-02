// FS-7 echelon 2 — the ARTIFACT-BYTES route (packages/runtime/src/reportRoutes.ts).
//
// TWO LAYERS, and the second is the one that matters. The pure helpers (id shape, the error→status
// map, the Content-Disposition builder) are exercised without a server, exactly as
// wave-a-document-route.test.mjs does for its sibling. Then the WHOLE route is mounted on a real
// express server with a real signed JWT, a real clara_runtime transaction against the rig, and a
// local content-addressed object store — so "the bytes download" is a measurement rather than a
// composition of three things that each work alone.
//
// THE STORAGE LAYER IS REAL, NOT STUBBED. RELAY_TEST_MODE=1 puts packages/runtime/lib/storage.mjs
// on its local content-addressed directory, which runs the SAME safeArtifactKey validator and the
// SAME hash-en-route verification the Supabase path runs. A stub would have proved that the route
// calls a function; this proves the object comes back and that a tampered one does not.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const ISSUER = "https://fs7e2.rig.invalid/auth/v1";
const AUD = "authenticated";
const JWT_SECRET = `fs7e2-${randomUUID().replace(/-/g, "")}`;
process.env.SUPABASE_JWT_ISSUER = ISSUER;
process.env.SUPABASE_JWT_AUD = AUD;
process.env.SUPABASE_JWT_SECRET = JWT_SECRET;
process.env.RELAY_TEST_MODE = "1";
// A per-run object root, so two runs on one host never see each other's bytes.
const STORAGE_ROOT = mkdtempSync(join(tmpdir(), "fs7e2-store-"));
process.env.CLARA_TEST_STORAGE_DIR = STORAGE_ROOT;

const { SignJWT } = await import("jose");
const { register } = await import("tsx/esm/api");
register();

const express = (await import("express")).default;
const route = await import("../src/reportRoutes.ts");
const { AuthError, _resetJwtConfigForTest } = await import("../lib/authz.mjs");
const storage = await import("../lib/storage.mjs");
const { StorageError, safeArtifactKey, downloadArtifactCanonical } = storage;
const { isArtifactId, artifactRouteStatus, refusalReason, contentDisposition, reportRoutes } = route;

// ---------------------------------------------------------------------------------------------
// LAYER 1 — the pure helpers. No server, no DB.
// ---------------------------------------------------------------------------------------------
test("R1.1 — isArtifactId accepts a well-formed uuid and rejects everything else", () => {
  assert.equal(isArtifactId("11111111-1111-1111-1111-111111111111"), true);
  assert.equal(isArtifactId("not-a-uuid"), false);
  assert.equal(isArtifactId(""), false);
  assert.equal(isArtifactId(undefined), false);
  assert.equal(isArtifactId(12345), false);
});

test("R1.2 — the status map: CLR11 is 404, CLR04 is 403, CLR10 is 409, storage is 502, the rest is a generic 500", () => {
  assert.deepEqual(artifactRouteStatus({ code: "CLR11" }), { status: 404, code: "not_found" });
  assert.deepEqual(artifactRouteStatus({ code: "CLR03" }), { status: 404, code: "not_found" });
  assert.deepEqual(artifactRouteStatus({ code: "CLR04" }), { status: 403, code: "forbidden" });
  assert.deepEqual(artifactRouteStatus({ code: "CLR10" }), { status: 409, code: "not_downloadable" });
  assert.deepEqual(artifactRouteStatus(new StorageError("storage_error", "x")), { status: 502, code: "storage_error" });
  // NO SQL TEXT EVER REACHES A CLIENT: an unrecognised error is a bare 500.
  assert.deepEqual(artifactRouteStatus(new Error("select * from clara.report_artifacts")),
    { status: 500, code: "internal" });
  assert.deepEqual(artifactRouteStatus(new AuthError(401, "no_bearer", "x")), { status: 401, code: "no_bearer" });
});

test("R1.3 — refusalReason carries the DOOR's own typed reason and invents none", () => {
  assert.equal(refusalReason({ detail: '{"reason":"artifact_superseded"}' }), "artifact_superseded");
  assert.equal(refusalReason({ detail: "not json" }), null);
  assert.equal(refusalReason({ detail: '{"no_reason":1}' }), null);
  assert.equal(refusalReason({}), null);
});

test("R1.4 — Content-Disposition is an ATTACHMENT and cannot be broken out of by a filename", () => {
  const d = contentDisposition("clara-report-pre_sign-0123456789ab.pdf");
  assert.match(d, /^attachment; filename="clara-report-pre_sign-0123456789ab\.pdf"/);
  // A quote or a backslash in a filename is how a header injection starts; both are neutralised.
  const hostile = contentDisposition('a"; filename="evil.exe');
  assert.equal(hostile.includes('"; filename="evil.exe'), false);
  assert.match(hostile, /filename\*=UTF-8''/);
});

// ---------------------------------------------------------------------------------------------
// LAYER 2 — the storage key space. Both artifact prefixes, and nothing else.
// ---------------------------------------------------------------------------------------------
const FIRM = "11111111-1111-4111-8111-111111111111";
const SHA = "a".repeat(64);

test("R2.1 — safeArtifactKey admits BOTH families' content-addressed shapes", () => {
  assert.equal(safeArtifactKey(`firms/${FIRM}/reports/${SHA}.pdf`), `firms/${FIRM}/reports/${SHA}.pdf`);
  assert.equal(safeArtifactKey(`firms/${FIRM}/reports/${SHA}.json`), `firms/${FIRM}/reports/${SHA}.json`);
  assert.equal(safeArtifactKey(`firms/${FIRM}/sandbox/${SHA}.pdf`), `firms/${FIRM}/sandbox/${SHA}.pdf`);
});

test("R2.2 — every other shape is refused, traversal and the DOCS prefix included", () => {
  for (const bad of [
    `firms/${FIRM}/docs/${SHA}.pdf`,                 // the OTHER key space — a different door's
    `firms/${FIRM}/sandbox/${SHA}.json`,             // the sandbox family is PDF by construction
    `firms/${FIRM}/reports/${SHA}.exe`,
    `firms/${FIRM}/reports/../../${SHA}.pdf`,
    `../firms/${FIRM}/reports/${SHA}.pdf`,
    `firms/${FIRM}/reports/${SHA.slice(0, 63)}.pdf`, // a short hash is not a content address
    "", null, undefined, 42,
  ]) {
    assert.throws(() => safeArtifactKey(bad), (e) => e instanceof StorageError,
      `safeArtifactKey must refuse ${String(bad)}`);
  }
});

/** Write real bytes at a real content address in the local store, and return the key. */
function putLocal(prefix, bytes, firm = FIRM) {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = `firms/${firm}/${prefix}/${sha}.pdf`;
  const dest = join(STORAGE_ROOT, ...key.split("/"));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  return { key, sha };
}

test("R2.3 — downloadArtifactCanonical hashes EN ROUTE and refuses a tampered object", async () => {
  const bytes = Buffer.from("%PDF-1.7\nfs7 e2 artifact bytes\n%%EOF\n");
  const { key, sha } = putLocal("reports", bytes);
  const good = join(STORAGE_ROOT, `out-${randomUUID()}.pdf`);
  const r = await downloadArtifactCanonical(key, good, sha);
  assert.equal(r.sha256, sha);

  // The SAME object, asked for under a DIFFERENT expected hash: the stream is fine, the identity
  // is not, and the door's promise is the identity.
  await assert.rejects(
    () => downloadArtifactCanonical(key, join(STORAGE_ROOT, `out-${randomUUID()}.pdf`), "b".repeat(64)),
    (e) => e instanceof StorageError && e.code === "checksum_mismatch");
});

test("R2.4 — an artifact download without the row's own sha256 is refused outright", async () => {
  const { key } = putLocal("sandbox", Buffer.from("%PDF-1.7\nsandbox\n%%EOF\n"));
  for (const bad of [undefined, null, "", "not-a-hash", "A".repeat(64)]) {
    await assert.rejects(
      () => downloadArtifactCanonical(key, join(STORAGE_ROOT, `out-${randomUUID()}.pdf`), bad),
      (e) => e instanceof StorageError,
      `a download must not proceed on ${String(bad)} as the expected hash`);
  }
});

// ---------------------------------------------------------------------------------------------
// LAYER 3 — THE WHOLE ROUTE, over HTTP, against the rig.
// ---------------------------------------------------------------------------------------------
let rig = null;
let ready = false;
let server = null;
let baseUrl = "";
let world = null;
let fixture = null;
let artifactId = null;

const mint = async (sub) => new SignJWT({ role: AUD })
  .setProtectedHeader({ alg: "HS256" }).setSubject(sub).setIssuer(ISSUER).setAudience(AUD)
  .setIssuedAt().setExpirationTime("15m")
  .sign(new TextEncoder().encode(JWT_SECRET));

/**
 * A REAL, COMPLETE sandbox export under `world.firm`, at a real content address.
 *
 * THE SANDBOX FAMILY IS THE ONE THIS FILE DRIVES, and that is a deliberate scoping choice rather
 * than the easier of two: a `report_artifacts` row is only reachable through the whole epsilon
 * chain (a spec, a run, a dataset seal, a claim assessment), whose fixtures live in packages/db's
 * own battery and are exercised there. Building a second copy of that chain here would couple this
 * ROUTE file to the reporting lane's preconditions for no additional coverage — the door's
 * two-family behaviour is what packages/db/tests/fs7-e2-artifact-download.test.mjs proves, cell by
 * cell, and what this file proves is that the ROUTE turns the door's answer into bytes on the wire.
 */
async function seedSandboxExport(bytes, { complete = true, ghost = false } = {}) {
  const put = putLocal("sandbox", bytes, world.firm);
  const recipient = (await rig.humanQuery(world.owner,
    "select clara.register_export_recipient($1,$2,$3,$4,$5,$6) as r",
    ["firm_member", world.owner, `fs7e2 route ${randomUUID().slice(0, 6)}`, "fs7 e2 route", null,
      rig.opk("fs7e2rt")])).rows[0].r.recipient_id;
  const policy = (await rig.rootQuery(
    `select id from clara.watermark_policy_versions
      where policy_key='sandbox_watermark' and locale='en' and effective_to is null
        and btrim(coalesce(watermark ->> 'watermark','')) <> ''
      order by version desc limit 1`)).rows[0]?.id ?? null;
  if (!policy) return null;
  const view = (await rig.rootQuery(
    `insert into clara.sandbox_views(firm_id, body, body_sha256, client_set, client_set_basis,
       basis, acting_actor, model_snapshot, rationale)
     values ($1, $2::jsonb, $3, $4::uuid[], 'exact', '[]'::jsonb, $5,
       '{"provider":"anthropic","model":"claude-opus-5","version":"2026-08"}'::jsonb, 'fs7 e2 route')
     returning id`,
    [world.firm, JSON.stringify({ blocks: [{ kind: "text", basis_ref: "a", displayed_text: "prose" }] }),
      createHash("sha256").update(randomUUID()).digest("hex"), [world.client], world.owner])).rows[0].id;
  // A GHOST points at a content address with NO OBJECT behind it — the row is valid and the door
  // serves it; the STREAM is what must fail.
  const sha = ghost ? createHash("sha256").update(`no-object-${randomUUID()}`).digest("hex") : put.sha;
  const key = ghost ? `firms/${world.firm}/sandbox/${sha}.pdf` : put.key;
  // THE ROW IS SEEDED IN ITS TARGET STATE, never inserted done and then edited down:
  // clara._tf_sandbox_export_lifecycle freezes a terminal export in full, so an UPDATE here is a
  // CLR08 rather than a fixture — which is the wall working, and how the first cut of this file
  // discovered it.
  const exp = (await rig.rootQuery(
    complete
      ? `insert into clara.sandbox_exports(firm_id, sandbox_view_id, recipient_id, coverage_proof,
           watermark_policy_version_id, locale, requested_by, op_key, state, artifact_sha256,
           byte_size, storage_key, claimed_by, claimed_at, lease_expires_at, finished_at)
         values ($1,$2,$3,'{}'::jsonb,$4,'en',$5,$6,'done',$7,$8,$9,'fs7e2-route',now(),
           now()+interval '20 minutes', now())
         returning id`
      : `insert into clara.sandbox_exports(firm_id, sandbox_view_id, recipient_id, coverage_proof,
           watermark_policy_version_id, locale, requested_by, op_key, state)
         values ($1,$2,$3,'{}'::jsonb,$4,'en',$5,$6,'claimable')
         returning id`,
    complete
      ? [world.firm, view, recipient, policy, world.owner, rig.opk("fs7e2exp"), sha, bytes.length, key]
      : [world.firm, view, recipient, policy, world.owner, rig.opk("fs7e2exp")])).rows[0].id;
  return { exportId: exp, key, sha, byteSize: bytes.length };
}

before(async () => {
  if (!process.env.PGHOST && !process.env.DATABASE_URL) return; // no rig target: layers 1-2 only
  rig = await import("./rig.mjs");
  const probe = await rig.rootQuery(
    `select to_regprocedure('clara.get_artifact_for_human_read(uuid,uuid)') is not null as door,
            to_regclass('clara.sandbox_exports') is not null as rel`);
  ready = probe.rows[0].door === true && probe.rows[0].rel === true && (await rig.runtimeReady());
  if (!ready) return;
  _resetJwtConfigForTest();

  world = await rig.buildFirm("fs7e2rt");
  const bytes = Buffer.from(`%PDF-1.7\nfs7 e2 route ${randomUUID()}\n%%EOF\n`);
  fixture = await seedSandboxExport(bytes);
  if (!fixture) { ready = false; return; }
  artifactId = fixture.exportId;

  const app = express();
  app.use(reportRoutes());
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (rig) await rig.endPool();
});

const skipHttp = () => (ready ? false : "FS-7 e2 route: no rig target, no download door, or no ratified watermark policy row");

const get = (id, token) => fetch(`${baseUrl}/api/artifacts/${id}/bytes`,
  token ? { headers: { authorization: `Bearer ${token}` } } : {});

test("R3.1 — a member of the firm downloads the real bytes as an ATTACHMENT", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const res = await get(artifactId, await mint(world.owner));
  // NB: never build the failure message from res.text() — that consumes the body before
  // the assertion below can read it, which is how the first cut of this cell failed itself.
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.match(res.headers.get("content-disposition") ?? "", /^attachment; filename="clara-sandbox-export-/);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  const body = Buffer.from(await res.arrayBuffer());
  assert.ok(body.length > 0, "the response carried bytes");
  // THE BYTE-HASH RECEIPT, closed at the client end: what arrived hashes to what the row recorded.
  assert.equal(createHash("sha256").update(body).digest("hex"), fixture.sha);
  assert.equal(body.length, fixture.byteSize);
});

test("R3.2 — the download writes the door's egress audit line", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const before_ = (await rig.rootQuery(
    `select count(*)::int n from clara.audit_log
      where fn='get_artifact_for_human_read' and entry_id=$1`, [artifactId])).rows[0].n;
  const res = await get(artifactId, await mint(world.owner));
  assert.equal(res.status, 200);
  await res.arrayBuffer();
  const after_ = (await rig.rootQuery(
    `select count(*)::int n, max(actor::text) a from clara.audit_log
      where fn='get_artifact_for_human_read' and entry_id=$1`, [artifactId])).rows[0];
  assert.equal(after_.n, before_ + 1, "a served byte stream is a receipted egress");
  assert.equal(after_.a, world.owner);
});

test("R3.3 — no bearer is 401, and it costs no database round trip", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const res = await get(artifactId, null);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "no_bearer");
});

test("R3.4 — a malformed id is the same 404 as a nonexistent one (no existence oracle at the edge)", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const token = await mint(world.owner);
  const bad = await get("not-a-uuid", token);
  const absent = await get(randomUUID(), token);
  assert.equal(bad.status, 404);
  assert.equal(absent.status, 404);
  // BYTE-IDENTICAL, not merely same-status: a reason field present on one 404 and absent on the
  // other would be an existence oracle wearing a matching status code.
  assert.deepEqual(await bad.json(), await absent.json());
});

test("R3.5 — a stranger's valid token is refused, and never with bytes", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const res = await get(artifactId, await mint(randomUUID()));
  assert.ok(res.status === 403 || res.status === 404, `expected a refusal, got ${res.status}`);
  assert.equal((await res.text()).includes("%PDF"), false, "a refusal must never carry artifact bytes");
});

test("R3.6 — a VIEWER is 403 (the door's CLR04), never 200 and never a bare 404", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const viewer = await rig.addMember(world.owner, world.firm, { role: "viewer", prefix: "fs7e2v" });
  const res = await get(artifactId, await mint(viewer));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, "forbidden");
});

test("R3.7 — an UNFINISHED export is 409 carrying the door's own typed reason, never 200", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  const pending = await seedSandboxExport(
    Buffer.from(`%PDF-1.7\npending ${randomUUID()}\n%%EOF\n`), { complete: false });
  const res = await get(pending.exportId, await mint(world.owner));
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "not_downloadable");
  assert.equal(body.reason, "sandbox_export_not_complete", "the DATABASE's word reaches the client verbatim");
});

test("R3.8 — a MISSING object is a 502, not a truncated 200 the browser would save", async (t) => {
  if (skipHttp()) return t.skip(skipHttp());
  // The row is perfectly valid and the DOOR serves it; the STREAM is what fails. A route that
  // streamed first and verified later would have written a broken PDF to the user's disk under a
  // 200 — which is exactly why this route downloads-then-streams.
  const ghost = await seedSandboxExport(
    Buffer.from(`%PDF-1.7\nghost ${randomUUID()}\n%%EOF\n`), { ghost: true });
  const res = await get(ghost.exportId, await mint(world.owner));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, "storage_error");
});
