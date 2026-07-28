// Worker-path resolution — the regression battery for the live Gate-S defect (2026-07-28).
//
// The defect: `new Worker(new URL("./structured-worker.mjs", import.meta.url))` is correct from
// source and WRONG in the deployed image, because nitro inlines the spawning modules into
// .output/server/index.mjs while the Dockerfile puts the worker in lib/. `structured_parse` had
// never once succeeded in production and nothing caught it, because every existing test drives
// the mapper directly or runs from the source layout — neither is the layout production uses.
//
// So these tests assert the thing that was actually untested: that the resolution is correct
// under the DEPLOYED layout, reproduced here as a real directory tree.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveLibWorker, libWorkerCandidates } from "../lib/worker-path.mjs";
import { parseStructured } from "../lib/structured.mjs";
import { runUblFactsWorker } from "../lib/local-facts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib");
const WORKER = "structured-worker.mjs";

/** A throwaway tree; returned path is the root. */
function tempTree(build) {
  const root = mkdtempSync(join(tmpdir(), "clara-workerpath-"));
  build(root);
  return root;
}

test("resolves the worker under the DEPLOYED layout (the live defect)", () => {
  // Exactly the image's shape: the caller is inlined at <root>/.output/server/index.mjs and the
  // worker lives at <root>/lib/structured-worker.mjs. The sibling URL this replaced pointed at
  // <root>/.output/server/structured-worker.mjs, which is never written.
  const root = tempTree((r) => {
    mkdirSync(join(r, ".output", "server"), { recursive: true });
    mkdirSync(join(r, "lib"), { recursive: true });
    writeFileSync(join(r, ".output", "server", "index.mjs"), "// bundle\n");
    writeFileSync(join(r, "lib", WORKER), "// worker\n");
  });
  try {
    const bundleUrl = pathToFileURL(join(root, ".output", "server", "index.mjs")).href;
    const resolved = fileURLToPath(resolveLibWorker(WORKER, bundleUrl));
    assert.equal(resolved, join(root, "lib", WORKER));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolves the worker under the SOURCE layout (the sibling still wins)", () => {
  const importer = pathToFileURL(join(LIB, "structured.mjs")).href;
  const resolved = fileURLToPath(resolveLibWorker(WORKER, importer));
  assert.equal(resolved, join(LIB, WORKER));
});

test("CLARA_LIB_DIR overrides both layouts", () => {
  const root = tempTree((r) => writeFileSync(join(r, WORKER), "// pinned worker\n"));
  const prev = process.env.CLARA_LIB_DIR;
  process.env.CLARA_LIB_DIR = root;
  try {
    // Ask from the SOURCE layout, where a real sibling also exists — the anchor must still win.
    const importer = pathToFileURL(join(LIB, "structured.mjs")).href;
    assert.equal(fileURLToPath(resolveLibWorker(WORKER, importer)), join(root, WORKER));
  } finally {
    if (prev === undefined) delete process.env.CLARA_LIB_DIR;
    else process.env.CLARA_LIB_DIR = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

test("a worker absent from every layout THROWS, naming the paths tried", () => {
  const root = tempTree((r) => {
    mkdirSync(join(r, ".output", "server"), { recursive: true });
    writeFileSync(join(r, ".output", "server", "index.mjs"), "// bundle, no lib beside it\n");
  });
  try {
    const bundleUrl = pathToFileURL(join(root, ".output", "server", "index.mjs")).href;
    assert.throws(
      () => resolveLibWorker(WORKER, bundleUrl),
      (err) => {
        // Loud and specific: the original defect was invisible because the failure surfaced far
        // from its cause, as a bare `internal` on a task row.
        assert.equal(err.code, "internal");
        assert.match(err.message, /structured-worker\.mjs/);
        assert.match(err.message, /tried:/);
        assert.match(err.message, /\.output/); // the path it would have used before the fix
        return true;
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("candidate order is anchor, then source sibling, then the bundle's lib", () => {
  const prev = process.env.CLARA_LIB_DIR;
  process.env.CLARA_LIB_DIR = join("/anchor", "lib");
  try {
    const c = libWorkerCandidates(WORKER, "file:///app/.output/server/index.mjs");
    assert.equal(c.length, 3);
    assert.match(c[0], /anchor/);
    assert.equal(c[1], "file:///app/.output/server/structured-worker.mjs");
    assert.equal(c[2], "file:///app/lib/structured-worker.mjs");
  } finally {
    if (prev === undefined) delete process.env.CLARA_LIB_DIR;
    else process.env.CLARA_LIB_DIR = prev;
  }
});

test("neither spawn site may go back to the bundle-relative sibling URL", async () => {
  // A source-level guard, because the idiom that broke production is the natural one to write.
  const { readFileSync } = await import("node:fs");
  for (const rel of ["structured.mjs", "local-facts.mjs"]) {
    const src = readFileSync(join(LIB, rel), "utf8");
    assert.ok(
      !/new Worker\(\s*new URL\(/.test(src),
      `${rel} spawns a Worker from a raw new URL(...) — it must go through resolveLibWorker (see lib/worker-path.mjs)`,
    );
    assert.match(src, /resolveLibWorker\(/, `${rel} must resolve its worker through resolveLibWorker`);
  }
});

// --- the spawn actually works, end to end -----------------------------------
// The unit tests elsewhere call the mapper directly, which is why a broken SPAWN was invisible.
// These drive the real worker thread.

const UBL = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>WP-TEST-0001</cbc:ID>
  <cbc:IssueDate>2026-07-28</cbc:IssueDate>
  <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="TIN">C00000000001</cbc:ID></cac:PartyIdentification>
    <cac:PartyIdentification><cbc:ID schemeID="BRN">209901000001</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>WORKER PATH TEST SDN BHD</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="TIN">C00000000002</cbc:ID></cac:PartyIdentification>
    <cac:PartyLegalEntity><cbc:RegistrationName>WORKER PATH BUYER SDN BHD</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="MYR">60.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="MYR">1000.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="MYR">60.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>02</cbc:ID><cbc:Percent>6</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="MYR">1000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="MYR">1060.00</cbc:TaxInclusiveAmount>
    <cbc:PayableRoundingAmount currencyID="MYR">0.00</cbc:PayableRoundingAmount>
    <cbc:PayableAmount currencyID="MYR">1060.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;

function withUblFile(fn) {
  const root = mkdtempSync(join(tmpdir(), "clara-workerpath-xml-"));
  const path = join(root, "invoice.xml");
  writeFileSync(path, UBL, "utf8");
  return Promise.resolve(fn(path)).finally(() => rmSync(root, { recursive: true, force: true }));
}

test("parseStructured SPAWNS the worker and returns the identity regions", async () => {
  const out = await withUblFile((path) =>
    parseStructured(path, "xml", { taskId: "worker-path-test", lane: "structured_parse", format: "xml", engineId: "clara-myinvois:v1", versionN: 1 }),
  );
  const byPath = Object.fromEntries(out.regions.map((r) => [r.field_path, r.text_content]));
  assert.equal(byPath["myinvois.supplier_tin"], "C00000000001");
  assert.equal(byPath["myinvois.supplier_brn"], "209901000001");
  assert.equal(out.envelope.myinvois.type_code, "01");
});

test("runUblFactsWorker SPAWNS the worker and returns the facts fields", async () => {
  const out = await withUblFile((path) =>
    runUblFactsWorker(path, { engineId: "clara-myinvois:v1", versionN: 1, lane: "local_facts", format: "xml" }),
  );
  const byPath = Object.fromEntries(out.fields.map((f) => [f.field_path, f.value_raw]));
  assert.equal(byPath["invoice.total"], "1060.00");
  assert.equal(byPath["invoice.total_excl_tax"], "1000.00");
  assert.equal(byPath["invoice.tax_total"], "60.00");
  assert.equal(byPath["invoice.rounding"], "0.00");
  assert.equal(byPath["invoice.type_code"], "01");
});
