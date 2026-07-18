import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeLayoutReal, normalizeAzureLayout } from "../lib/egress.mjs";

let root;
let file;
const saved = {};

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-egress-"));
  file = join(root, "one.pdf");
  await writeFile(file, "%PDF-1.7\n");
  for (const name of ["AZURE_DI_ENDPOINT", "AZURE_DI_KEY"]) saved[name] = process.env[name];
  process.env.AZURE_DI_ENDPOINT = "https://di.invalid";
  process.env.AZURE_DI_KEY = "test-only";
});

after(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(root, { recursive: true, force: true });
});

test("Azure adapter survives a 429 branch inside one total deadline", async () => {
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls += 1;
    if (init.body) for await (const _chunk of init.body) void _chunk;
    if (calls === 1) return new Response(null, { status: 429, headers: { "retry-after": "0" } });
    if (init.method === "POST") return new Response(null, { status: 202, headers: { "operation-location": "https://di.invalid/op/1" } });
    return new Response(JSON.stringify({ status: "succeeded", analyzeResult: { content: "ok", pages: [{ pageNumber: 1 }] } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const payload = await analyzeLayoutReal({ filePath: file, mime: "application/pdf", totalDeadlineMs: 1000, fetchImpl });
  assert.equal(payload.status, "succeeded");
  assert.equal(calls, 3);
});

test("Retry-After cannot extend the Azure hard total deadline", async () => {
  const fetchImpl = async (_url, init) => {
    if (init.body) for await (const _chunk of init.body) void _chunk;
    return new Response(null, { status: 429, headers: { "retry-after": "1" } });
  };
  await assert.rejects(
    analyzeLayoutReal({ filePath: file, mime: "application/pdf", totalDeadlineMs: 20, fetchImpl }),
    (err) => err.code === "timeout",
  );
});

test("Azure layout normalization keeps page-polygon provenance", () => {
  const normalized = normalizeAzureLayout(
    { analyzeResult: { content: "Invoice", pages: [{ pageNumber: 1, lines: [{ content: "Invoice", polygon: [0, 0, 1, 0, 1, 1, 0, 1] }] }] } },
    { engineId: "azure-di:prebuilt-layout:2024-11-30", versionN: 1 },
  );
  assert.equal(normalized.envelope.schema_version, 1);
  assert.equal(normalized.regions[0].locator_kind, "page_polygon");
  assert.equal(normalized.regions[0].text_content, "Invoice");
});
