// STANDALONE transport + world e2e (not collected by node --test). Run only
// against the disposable local database named in the environment:
//
//   PGHOST=127.0.0.1 PGPORT=5544 PGUSER=postgres PGDATABASE=clara_rt_test \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:5544/clara_rt_test \
//   node tests/intake-e2e.mjs

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SignJWT } from "jose";
import { ephemeralPort } from "./ephemeral-port.mjs";

// Fail-closed local gate. Any PGPORT is accepted (local 5544, CI's 5432 service),
// but the host MUST be loopback and the database MUST be one of the two sanctioned
// throwaways — never a live/remote target. The runtime local rig uses clara_rt_test;
// CI provisions a fresh clara_intake_ci for this e2e.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|intake_ci)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("intake-e2e is hard-gated to a loopback host (127.0.0.1|localhost) + PGDATABASE in {clara_rt_test,clara_intake_ci}");
}
if (!process.env.WORKFLOW_POSTGRES_URL
    || !/(?:\/\/|@)(?:127\.0\.0\.1|localhost):\d+\/clara_(?:rt_test|intake_ci)(?:\?|$)/.test(process.env.WORKFLOW_POSTGRES_URL)) {
  throw new Error("intake-e2e needs WORKFLOW_POSTGRES_URL targeting a loopback host + clara_(rt_test|intake_ci)");
}

process.env.RELAY_TEST_MODE = "1";
process.env.CLARA_START_WORLD = "1";
process.env.CLARA_DOC_EGRESS_APPROVED = "1";
process.env.WORKFLOW_TARGET_WORLD = "@workflow/world-postgres";
// OS-assigned: CI jobs from different PRs share the runner host's network namespace; a
// fixed port cross-wires one job's client into another job's runtime (401 jwt_signature).
process.env.PORT ||= await ephemeralPort();
process.env.CLARA_INTAKE_CORS_ORIGINS = "https://dashboard.test";
const tempBase = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
await mkdir(tempBase, { recursive: true });
const scratch = await mkdtemp(join(tempBase, "clara-intake-e2e-"));
process.env.CLARA_SPOOL_DIR = join(scratch, "spool");
process.env.CLARA_TEST_STORAGE_DIR = join(scratch, "storage");

const issuer = "https://clara-intake.test/auth/v1";
const audience = "authenticated";
const jwtSecret = `intake-${randomUUID().replaceAll("-", "")}`;
process.env.SUPABASE_JWT_ISSUER = issuer;
process.env.SUPABASE_JWT_AUD = audience;
process.env.SUPABASE_JWT_SECRET = jwtSecret;
globalThis.__claraAzureForTest = async () => ({
  status: "succeeded",
  operationId: "fixture-op",
  analyzeResult: {
    content: "Synthetic invoice total MYR 123.45",
    pages: [{ pageNumber: 1, lines: [{ content: "Synthetic invoice total MYR 123.45", polygon: [0, 0, 1, 0, 1, 1, 0, 1] }] }],
  },
});

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const ORIGIN = "https://dashboard.test";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = new TextEncoder().encode(jwtSecret);
const mint = (sub) =>
  new SignJWT({ role: audience })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);

async function consumeSSE(url, jwt, maxMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  const events = [];
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${jwt}` }, signal: controller.signal });
    assert.equal(response.status, 200, "SSE stream opened");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return events;
      buffered += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffered.indexOf("\n\n")) >= 0) {
        const block = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        const event = /event:\s*(.+)/.exec(block)?.[1]?.trim();
        const data = /data:\s*(.+)/.exec(block)?.[1];
        events.push({ event, data: data ? JSON.parse(data) : null });
        if (event === "done" || event === "detached") {
          await reader.cancel().catch(() => {});
          return events;
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function waitHealthy() {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      // booting
    }
    await sleep(100);
  }
  throw new Error("runtime did not become healthy");
}

async function begin(jwt, bytes, filename = "synthetic.pdf", mime = "application/pdf") {
  const response = await fetch(`${BASE}/api/intake/documents`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ filename, mime, declared_bytes: bytes.length, origin: "documents_tab" }),
  });
  if (response.status !== 201) assert.fail(`begin returned ${response.status}: ${await response.text()}`);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  return response.json();
}

async function poll(rig, sql, params, predicate, label) {
  let last;
  for (let i = 0; i < 300; i += 1) {
    last = (await rig.rootQuery(sql, params)).rows[0] ?? null;
    if (predicate(last)) return last;
    await sleep(100);
  }
  throw new Error(`${label} timed out; last=${JSON.stringify(last)}`);
}

async function main() {
  const rig = await import("./rig.mjs");
  if (!(await rig.documentPipelineReady())) throw new Error("migration 0007 is absent");
  const { mockTextModel } = await import("./mockModel.mjs");
  const { owner, client } = await rig.buildFirm("intake-http-e2e");
  const jwt = await mint(owner);

  globalThis.__claraModelForTest = mockTextModel("structured parsing left chat streaming live");
  await import("../.output/server/index.mjs");
  await waitHealthy();

  const preflight = await fetch(`${BASE}/api/intake/documents/x/bytes`, {
    method: "OPTIONS",
    headers: { origin: ORIGIN, "access-control-request-method": "PUT", "access-control-request-headers": "authorization,content-type" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), ORIGIN);

  // Structurally plausible per the F-12 admission check (startxref + obj/endobj + %%EOF).
  const bytes = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");
  const intake = await begin(jwt, bytes);

  // A slow first stream holds the intake lock; a second concurrent PUT is
  // excluded before it can consume a body.
  const slow = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 8));
      setTimeout(() => {
        controller.enqueue(bytes.subarray(8));
        controller.close();
      }, 250);
    },
  });
  const firstPut = fetch(`${BASE}/api/intake/documents/${intake.intake_id}/bytes`, {
    method: "PUT",
    duplex: "half",
    headers: { authorization: `Bearer ${intake.upload_token}`, "content-type": "application/octet-stream", origin: ORIGIN },
    body: slow,
  });
  await sleep(75);
  const concurrent = await fetch(`${BASE}/api/intake/documents/${intake.intake_id}/bytes`, {
    method: "PUT",
    headers: { authorization: `Bearer ${intake.upload_token}`, "content-type": "application/octet-stream", origin: ORIGIN },
    body: bytes,
  });
  assert.equal(concurrent.status, 409);
  assert.equal((await firstPut).status, 204);

  const replayedPut = await fetch(`${BASE}/api/intake/documents/${intake.intake_id}/bytes`, {
    method: "PUT",
    headers: { authorization: `Bearer ${intake.upload_token}`, "content-type": "application/octet-stream", origin: ORIGIN },
    body: bytes,
  });
  assert.equal(replayedPut.status, 404, "an upload capability cannot replay its completed lease");

  const wrong = await fetch(`${BASE}/api/intake/documents/${intake.intake_id}/finalize`, {
    method: "POST",
    headers: { authorization: "Bearer wrong", "content-type": "application/json", origin: ORIGIN },
    body: "{}",
  });
  const unknown = await fetch(`${BASE}/api/intake/documents/${randomUUID()}/finalize`, {
    method: "POST",
    headers: { authorization: "Bearer wrong", "content-type": "application/json", origin: ORIGIN },
    body: "{}",
  });
  assert.equal(wrong.status, 404);
  assert.equal(unknown.status, 404);
  assert.equal(await wrong.text(), await unknown.text());

  const finalized = await fetch(`${BASE}/api/intake/documents/${intake.intake_id}/finalize`, {
    method: "POST",
    headers: { authorization: `Bearer ${intake.upload_token}`, "content-type": "application/json", origin: ORIGIN },
    body: "{}",
  });
  if (finalized.status !== 202) assert.fail(`finalize returned ${finalized.status}: ${await finalized.text()}`);
  const receipt = await finalized.json();
  await poll(rig, "select status,workflow_run_id from clara.document_processing_tasks where id=$1", [receipt.task_id], (row) => row?.status === "done", "document workflow");
  const extraction = await rig.rootQuery(
    "select e.status,e.page_count,r.locator_kind from clara.document_extractions e join clara.document_regions r on r.extraction_id=e.id where e.document_id=$1",
    [receipt.document_id],
  );
  assert.equal(extraction.rows[0].status, "done");
  assert.equal(extraction.rows[0].page_count, 1);
  assert.equal(extraction.rows[0].locator_kind, "page_polygon");

  const durableInput = await rig.rootQuery(
    `select count(*)::int as leaks from workflow.workflow_steps
      where input::text like $1 or output::text like $1`,
    [`%${intake.upload_token}%`],
  );
  assert.equal(durableInput.rows[0].leaks, 0, "upload capability never crossed workflow step IO");

  const csvPath = join(scratch, "parse-load.csv");
  await writeFile(csvPath, `memo,amount\n${`${"x".repeat(100)},1\n`.repeat(20_000)}`);
  const { parseStructured } = await import("../lib/structured.mjs");
  let parseLoadFinished = false;
  let parseLoadFailure;
  const parseLoad = Promise.all(
    Array.from({ length: 4 }, () => parseStructured(csvPath, "csv", { engineId: "clara-structured:v1", versionN: 1 })),
  )
    .then((result) => {
      parseLoadFinished = true;
      return result;
    })
    .catch((err) => {
      parseLoadFinished = true;
      parseLoadFailure = err;
      return [];
    });
  const session = await rig.createChatSession({ author: owner, client });
  const turn = await fetch(`${BASE}/api/chat/${session}/turns`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ turnKey: "intake-parse-load", parts: [{ type: "text", text: "prove the stream remains live" }] }),
  });
  assert.equal(turn.status, 202);
  assert.equal(parseLoadFinished, false, "chat admission happened while structured parsing was still active");
  const { task_id: chatTaskId } = await turn.json();
  const streamEvents = await consumeSSE(`${BASE}/api/tasks/${chatTaskId}/stream`, jwt);
  assert.equal(streamEvents.find((event) => event.event === "done")?.data?.status, "completed");
  assert.ok(streamEvents.some((event) => event.event === "chunk"), "SSE delivered live chunks under parse load");
  const parsed = await parseLoad;
  if (parseLoadFailure) throw parseLoadFailure;
  assert.equal(parsed.length, 4);
  assert.ok(parsed.every((result) => result.regions.length === 20_001));

  console.log("INTAKE E2E: PASS (HTTP stream/CORS/token lock -> Storage -> finalizer -> WDK OCR -> regions; SSE live under structured parse load)");
  process.exit(0);
}

main().catch((err) => {
  console.error("INTAKE E2E: FAIL", err?.stack ?? err);
  process.exit(1);
});
