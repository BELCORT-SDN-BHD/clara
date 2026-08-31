import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { join } from "node:path";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import express from "express";
import { register } from "tsx/esm/api";
import { detectDocument, IntakeScanError, scanFile } from "../lib/scan.mjs";
import { spoolRequest, tryEnterIngress, _resetIntakeGateForTest } from "../lib/spool.mjs";
import { parseStructured } from "../lib/structured.mjs";
import { putCanonical, verifyCanonical } from "../lib/storage.mjs";

register();

const PRIVATE_DIAGNOSTIC_RE =
  /(?:SyntaxError|PayloadTooLargeError|node_modules|[A-Za-z]:[\\/]|\/(?:Users|home|workspace)\/|(?:^|\n)\s*at\s|\bstack\b)/i;

let intakeRoutesPromise;

async function requestThroughShippedIntakeRouter({
  path = "/api/intake/documents",
  method = "POST",
  headers = { "content-type": "application/json" },
  body,
  configureApp,
}) {
  const { intakeRoutes } = await (intakeRoutesPromise ??= import("../src/intakeRoutes.ts"));
  const app = express();
  configureApp?.(app);
  // This is the production composition in src/index.ts: the exported router is
  // mounted whole, including its own parser and terminal error middleware.
  app.use(intakeRoutes());
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body,
    });
    const text = await response.text();
    return { response, text, json: JSON.parse(text) };
  } finally {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

let root;
let previousSpool;
let previousStorage;
let previousMode;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-intake-"));
  previousSpool = process.env.CLARA_SPOOL_DIR;
  previousStorage = process.env.CLARA_TEST_STORAGE_DIR;
  previousMode = process.env.RELAY_TEST_MODE;
  process.env.CLARA_SPOOL_DIR = join(root, "spool");
  process.env.CLARA_TEST_STORAGE_DIR = join(root, "storage");
  process.env.RELAY_TEST_MODE = "1";
});

after(async () => {
  _resetIntakeGateForTest();
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  if (previousStorage === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
  else process.env.CLARA_TEST_STORAGE_DIR = previousStorage;
  if (previousMode === undefined) delete process.env.RELAY_TEST_MODE;
  else process.env.RELAY_TEST_MODE = previousMode;
  await rm(root, { recursive: true, force: true });
});

test("spool hashes a streamed request and enforces the declared byte count", async () => {
  const id = randomUUID();
  const bytes = Buffer.from("streamed-with-backpressure");
  const result = await spoolRequest(Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]), {
    intakeId: id,
    declaredBytes: bytes.length,
  });
  assert.equal(result.byteSize, bytes.length);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  await assert.rejects(
    spoolRequest(Readable.from([bytes]), { intakeId: randomUUID(), declaredBytes: bytes.length - 1 }),
    (err) => err.code === "too_large",
  );
});

test("ingress admission is globally bounded at two", () => {
  const a = tryEnterIngress("u1");
  const b = tryEnterIngress("u2");
  const c = tryEnterIngress("u3");
  assert.equal(typeof a, "function");
  assert.equal(typeof b, "function");
  assert.equal(c, null);
  a();
  b();
});

test("scanner rejects EICAR, encrypted PDF, and XML entity expansion", async () => {
  const eicar = join(root, "eicar.bin");
  await writeFile(eicar, "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
  await assert.rejects(scanFile(eicar), (err) => err.code === "malware_detected");

  const pdf = join(root, "encrypted.pdf");
  await writeFile(pdf, "%PDF-1.7\n1 0 obj << /Type /Page /Encrypt 2 0 R >> endobj");
  await assert.rejects(detectDocument(pdf, { originalFilename: "encrypted.pdf" }), (err) => err.code === "quarantined");

  const xml = join(root, "entity.xml");
  await writeFile(xml, `<?xml version="1.0"?><root>${"x".repeat(9000)}<!DOCTYPE x [<!ENTITY y "z">]></root>`);
  await assert.rejects(detectDocument(xml, { originalFilename: "entity.xml" }), (err) => err.code === "quarantined");
});

test("canonical test storage is immutable and readback-hash verified", async () => {
  const bytes = Buffer.from("canonical-evidence");
  const file = join(root, "source.pdf");
  await writeFile(file, bytes);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = `firms/${randomUUID()}/docs/${sha}.pdf`;
  assert.deepEqual(await putCanonical(file, key, "application/pdf"), { created: true, existed: false });
  assert.deepEqual(await putCanonical(file, key, "application/pdf"), { created: false, existed: true });
  assert.deepEqual(await verifyCanonical(key, sha), { sha256: sha });
  await assert.rejects(verifyCanonical(key, "0".repeat(64)), (err) => err.code === "checksum_mismatch");
});

test("production Storage refuses service_role instead of treating it as custody authority", async () => {
  const previousUrl = process.env.CLARA_STORAGE_URL;
  const previousJwt = process.env.CLARA_STORAGE_ROLE_JWT;
  const previousRole = process.env.CLARA_STORAGE_ROLE;
  process.env.RELAY_TEST_MODE = "0";
  process.env.CLARA_STORAGE_URL = "https://storage.invalid/object/private";
  process.env.CLARA_STORAGE_ROLE = "clara_storage_docs";
  process.env.CLARA_STORAGE_ROLE_JWT = `x.${Buffer.from(JSON.stringify({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url")}.x`;
  const file = join(root, "forbidden.pdf");
  await writeFile(file, "no service role");
  try {
    await assert.rejects(
      putCanonical(file, `firms/${randomUUID()}/docs/${"a".repeat(64)}.pdf`, "application/pdf"),
      (err) => err.code === "storage_error" && /custom-role/.test(err.message),
    );
  } finally {
    process.env.RELAY_TEST_MODE = "1";
    if (previousUrl === undefined) delete process.env.CLARA_STORAGE_URL;
    else process.env.CLARA_STORAGE_URL = previousUrl;
    if (previousJwt === undefined) delete process.env.CLARA_STORAGE_ROLE_JWT;
    else process.env.CLARA_STORAGE_ROLE_JWT = previousJwt;
    if (previousRole === undefined) delete process.env.CLARA_STORAGE_ROLE;
    else process.env.CLARA_STORAGE_ROLE = previousRole;
  }
});

test("production Storage requires the designated role claim and a future exp", async () => {
  const previous = {
    mode: process.env.RELAY_TEST_MODE,
    url: process.env.CLARA_STORAGE_URL,
    jwt: process.env.CLARA_STORAGE_ROLE_JWT,
    role: process.env.CLARA_STORAGE_ROLE,
  };
  process.env.RELAY_TEST_MODE = "0";
  process.env.CLARA_STORAGE_URL = "https://storage.invalid/object/firm-docs";
  process.env.CLARA_STORAGE_ROLE = "clara_storage_docs";
  const file = join(root, "designated-role.pdf");
  await writeFile(file, "role-check");
  const key = `firms/${randomUUID()}/docs/${"b".repeat(64)}.pdf`;
  try {
    process.env.CLARA_STORAGE_ROLE_JWT = `x.${Buffer.from(JSON.stringify({ role: "some_other_custom_role", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url")}.x`;
    await assert.rejects(putCanonical(file, key, "application/pdf"), (err) => err.code === "storage_error" && /designated/.test(err.message));
    process.env.CLARA_STORAGE_ROLE_JWT = `x.${Buffer.from(JSON.stringify({ role: "clara_storage_docs" })).toString("base64url")}.x`;
    await assert.rejects(putCanonical(file, key, "application/pdf"), (err) => err.code === "storage_error" && /expired or malformed/.test(err.message));
  } finally {
    for (const [name, value] of [["RELAY_TEST_MODE", previous.mode], ["CLARA_STORAGE_URL", previous.url], ["CLARA_STORAGE_ROLE_JWT", previous.jwt], ["CLARA_STORAGE_ROLE", previous.role]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("structured CSV parsing runs in a worker and emits row/column regions", async () => {
  const file = join(root, "values.csv");
  await writeFile(file, "date,total\n2026-07-18,123.45\n");
  const result = await parseStructured(file, "csv", { engineId: "clara-structured:v1", versionN: 1 });
  assert.equal(result.envelope.format, "csv");
  assert.equal(result.regions[0].locator_kind, "row_col");
  assert.match(result.regions[1].text_content, /123\.45/);
});

// ---------------------------------------------------------------------------
// 2026-07-31 C-b acceptance-night finding (4): "the intake CSV probe refuses
// single-column preamble rows — real bank CSV exports with banner lines may be
// refused at transport." detectDocument's validateDelimited sniff used to require
// EVERY one of the first 20 non-blank lines to split into >=2 fields, so a leading
// title/banner line with no delimiter (exactly what statement-parse.mjs's
// parseStatementCsv already treats as PREAMBLE and skips at parse) failed the intake
// probe before the parser that already handles it ever ran. Fixed: leading width<2
// rows are tolerated uncounted; the strictness still applies from the first
// genuinely-delimited row onward.
// ---------------------------------------------------------------------------

test("intake CSV probe tolerates a leading single-column banner row (real-shaped bank export)", async () => {
  const file = join(root, "maybank-statement.csv");
  await writeFile(
    file,
    [
      "MAYBANK ISLAMIC BERHAD",
      "STATEMENT OF ACCOUNT",
      "Date,Description,Amount,Balance",
      "01/04/2025,OPENING BALANCE,0.00,1000.00",
      "02/04/2025,SALARY,5000.00,6000.00",
      "03/04/2025,WITHDRAWAL,-200.00,5800.00",
    ].join("\r\n"),
  );
  const result = await detectDocument(file, { originalFilename: "maybank-statement.csv" });
  assert.equal(result.format, "csv");
  assert.equal(result.mime, "text/csv");
});

test("intake CSV probe still refuses a genuinely inconsistent body (banner tolerance is not a general relax)", async () => {
  const file = join(root, "broken-statement.csv");
  await writeFile(
    file,
    [
      "MAYBANK ISLAMIC BERHAD", // the tolerated leading banner
      "Date,Description,Amount,Balance", // width 4
      "01/04/2025,OPENING BALANCE,0.00,1000.00", // width 4
      "a ragged line with no delimiter at all", // width 1 — AFTER the body started
      "02/04/2025,SALARY,5000.00,6000.00", // width 4
    ].join("\n"),
  );
  await assert.rejects(
    detectDocument(file, { originalFilename: "broken-statement.csv" }),
    (err) => err.code === "bad_type",
  );
});

// ---------------------------------------------------------------------------
// 2026-07-26 intake outage. Two production failures produced ZERO log lines: the
// finalize catch discarded `err.message`, keeping only the coarse `failure_code`
// that reaches the DB. `storage_error` alone cannot distinguish a bad key from a
// missing config from a refused upload from a failed read-back — so the cause had
// to be reconstructed from outside the system, and two coherent-but-WRONG
// diagnoses were reached on the way, one of them acted on in production.
//
// Source-level, deliberately: driving finalize to fail needs a DB, a spool and a
// live storage adapter, and a guard that expensive is a guard that gets deleted.
// This asserts the cheap, load-bearing property — the failure path SAYS something.
// ---------------------------------------------------------------------------
test("the intake finalize failure path logs the error detail, not just the code", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join: pjoin } = await import("node:path");
  const src = await readFile(
    pjoin(dirname(fileURLToPath(import.meta.url)), "..", "lib", "intake.mjs"), "utf8");

  const catchIdx = src.indexOf("const code = failureCode(err);");
  assert.ok(catchIdx > 0, "the finalize catch still computes a failureCode");
  const block = src.slice(catchIdx, catchIdx + 900);

  assert.match(block, /console\.error\(/,
    "the finalize failure path must EMIT something — silence is what made the outage expensive");
  assert.match(block, /err\?\.message/,
    "…and it must carry the error MESSAGE (e.g. 'Storage upload failed (403)'), which is the "
    + "only thing that separates the causes a single coarse code lumps together");
  assert.match(block, /intake=\$\{intakeId\}/, "…identifying WHICH intake failed");
  assert.match(block, /code=\$\{code\}/, "…and the terminal code the DB recorded");
  assert.doesNotMatch(block.split("console.error")[1]?.slice(0, 220) ?? "", /filename|originalFilename/,
    "…but never the filename: it can identify a client");
});

// ---------------------------------------------------------------------------
// 2026-07-26. Supabase Storage wraps its real status INSIDE the body: a duplicate
// object returns **HTTP 400** with {"statusCode":"409","error":"Duplicate"}, and a
// permission failure HTTP 400 with {"statusCode":"403"}. putCanonical branched on
// `response.status === 409`, which is therefore NEVER true — so the "already exists"
// path was unreachable and every duplicate became a fatal storage_error. That is the
// ORDINARY case: a human re-dropping a file they already sent.
//
// The bodies below are the real ones observed against live storage, not invented.
// ---------------------------------------------------------------------------
test("putCanonical reads Supabase's WRAPPED status: a 400/409 duplicate is 'existed', not fatal", async (t) => {
  const { putCanonical } = await import("../lib/storage.mjs");
  const prev = { ...process.env };
  process.env.RELAY_TEST_MODE = "";
  process.env.CLARA_STORAGE_URL = "https://example.supabase.co/storage/v1/object/firm-docs";
  process.env.CLARA_STORAGE_ROLE = "clara_storage_docs";
  // a syntactically valid, unexpired role JWT (header.payload.sig — never verified locally)
  const claims = Buffer.from(JSON.stringify({
    role: "clara_storage_docs", exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  process.env.CLARA_STORAGE_ROLE_JWT = `x.${claims}.y`;

  const key = `firms/11111111-1111-4111-8111-111111111111/docs/${"a".repeat(64)}.pdf`;
  // The fixture lives OUTSIDE `root` on purpose. putCanonical opens a createReadStream that
  // the mocked fetch never consumes, so the fd stays open — and on Windows an open handle makes
  // the suite's `rm(root, {recursive:true})` fail with ENOTEMPTY, which fails the whole FILE and
  // masks every passing test in it. Its own throwaway dir keeps that blast radius to itself.
  const ownDir = await mkdtemp(join(tmpdir(), "clara-dup-"));
  const file = join(ownDir, "dup.bin");
  await writeFile(file, Buffer.from("hello"));

  // 1. THE DUPLICATE: HTTP 400 carrying statusCode 409 — must be reported as existed.
  t.mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }),
    { status: 400 }));
  assert.deepEqual(await putCanonical(file, key, "application/pdf"),
    { created: false, existed: true },
    "a wrapped 409 is a benign re-upload, not a fatal storage_error");

  // 2. A REAL failure still throws — AND carries the body, because '(400)' alone cannot
  //    distinguish a duplicate from a permission denial, and discarding it cost a day.
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "permission denied for table objects" }),
    { status: 400 }));
  await assert.rejects(() => putCanonical(file, key, "application/pdf"), (err) => {
    assert.equal(err.code, "storage_error");
    assert.match(err.message, /permission denied for table objects/,
      "the failure must carry the BODY, not just the HTTP status");
    return true;
  });

  Object.assign(process.env, prev);
  // Best-effort: the leaked read handle may still hold it on Windows. Its own dir, so a
  // failure here cannot affect the rest of the suite.
  await rm(ownDir, { recursive: true, force: true }).catch(() => {});
});

test("MATERIAL-1 malformed JSON stays a sanitized 400 through the shipped intake router", async () => {
  const { response, text, json } = await requestThroughShippedIntakeRouter({ body: '{"origin":' });

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.deepEqual(json, { error: "bad_request", message: "bad request" });
  assert.doesNotMatch(text, PRIVATE_DIAGNOSTIC_RE);
});

test("MATERIAL-1 oversized JSON stays a sanitized 413 through the shipped intake router", async () => {
  const { response, text, json } = await requestThroughShippedIntakeRouter({
    body: JSON.stringify({ padding: "x".repeat(33 * 1024) }),
  });

  assert.equal(response.status, 413);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  assert.deepEqual(json, { error: "payload_too_large", message: "payload too large" });
  assert.doesNotMatch(text, PRIVATE_DIAGNOSTIC_RE);
});

test("MATERIAL-1 keeps missing and malformed upload Authorization on the typed intake 404 mapping", async () => {
  const path = `/api/intake/documents/${randomUUID()}/bytes`;
  const request = (authorization) => requestThroughShippedIntakeRouter({
    path,
    method: "PUT",
    headers: {
      "content-type": "application/octet-stream",
      ...(authorization ? { authorization } : {}),
    },
    body: "x",
  });

  const missing = await request(undefined);
  const malformed = await request("garbage");
  assert.equal(missing.response.status, 404);
  assert.equal(malformed.response.status, 404);
  assert.equal(missing.text, malformed.text);
  assert.deepEqual(missing.json, { error: "not_found", message: "not found" });
  assert.doesNotMatch(missing.text, PRIVATE_DIAGNOSTIC_RE);
});

test("MATERIAL typed scan errors thrown before the local try keep their code and message", async () => {
  const scanError = new IntakeScanError(
    "bad_type",
    "declared MIME does not match the file signature",
    415,
  );
  const { response, json } = await requestThroughShippedIntakeRouter({
    path: `/api/intake/documents/${randomUUID()}/bytes`,
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: "x",
    configureApp(app) {
      const originalHeader = app.request.header;
      app.request.header = function header(name) {
        if (String(name).toLowerCase() === "authorization") {
          return { toString() { throw scanError; } };
        }
        return originalHeader.call(this, name);
      };
    },
  });

  assert.equal(response.status, 415);
  assert.deepEqual(json, {
    error: "bad_type",
    message: "declared MIME does not match the file signature",
  });
});
