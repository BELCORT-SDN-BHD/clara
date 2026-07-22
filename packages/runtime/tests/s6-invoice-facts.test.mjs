// Slice-6 invoice-facts lane — pure unit tests (no DB, no 0009). Exercises the Azure
// prebuilt-invoice normalizer, the injected test adapter, and the frozen behavior
// closure's success / terminal-failure / attempt-cap branches with stubbed services.

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.RELAY_TEST_MODE = "1";

const azure = await import("../workflows/invoiceFacts.v1.azure.mjs");
const { processInvoiceFactsBehavior, interpretClaimReceipt } = await import("../workflows/invoiceFacts.v1.behavior.mjs");

function samplePayload() {
  return {
    status: "succeeded",
    analyzeResult: {
      documents: [
        {
          fields: {
            InvoiceTotal: {
              content: "435,560.00",
              valueCurrency: { amount: 435560, currencyCode: "MYR" },
              boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }],
              confidence: 0.98,
            },
            InvoiceId: { content: "BINV202510-018", boundingRegions: [{ pageNumber: 1, polygon: [] }], confidence: 0.9 },
            VendorName: { content: "BRIGHTPATH SDN BHD", confidence: 0.95 },
            InvoiceDate: { content: "2025-10-15", confidence: 0.9 },
          },
        },
      ],
      pages: [{ pageNumber: 1 }],
    },
  };
}

test("normalizeAzureInvoice maps DI fields to the pinned field_path vocabulary + currency", () => {
  const out = azure.normalizeAzureInvoice(samplePayload());
  const byPath = Object.fromEntries(out.fields.map((f) => [f.field_path, f]));
  assert.equal(byPath["invoice.total"].value_raw, "435,560.00", "total is RAW (DB normalizes cents)");
  assert.equal(byPath["invoice.total"].page, 1);
  assert.equal(byPath["invoice.total"].confidence, 0.98);
  assert.equal(byPath["invoice.invoice_id"].value_raw, "BINV202510-018");
  assert.equal(byPath["invoice.vendor_name"].value_raw, "BRIGHTPATH SDN BHD");
  assert.equal(byPath["invoice.currency"].value_raw, "MYR", "currency rides the total's valueCurrency");
  assert.equal(out.pagesUsed, 1);
  assert.equal(out.normalizationVersion, azure.NORMALIZATION_VERSION);
  assert.match(out.rawSha256, /^[0-9a-f]{64}$/, "raw response is hashed with the policy version");
});

test("the engine snapshot id is the pinned azure-di:prebuilt-invoice:2024-11-30", () => {
  assert.equal(azure.AZURE_INVOICE_ENGINE_SNAPSHOT.engineId, "azure-di:prebuilt-invoice:2024-11-30");
});

// --- W3 corroboration-eligibility rules (Tier-A physical/single-doc/classification) ---

test("normalizeAzureInvoice NEVER fabricates geometry — a total without a bounding region emits an EMPTY polygon", () => {
  const payload = {
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: { InvoiceTotal: { content: "100.00", valueCurrency: { currencyCode: "MYR" }, confidence: 0.99 } } }],
      pages: [{ pageNumber: 1 }],
    },
  };
  const out = azure.normalizeAzureInvoice(payload);
  const total = out.fields.find((f) => f.field_path === "invoice.total");
  assert.deepEqual(total.polygon, [], "no boundingRegions => empty polygon (the DB then refuses to corroborate)");
  assert.deepEqual(out.envelope, {}, "a single eligible invoice carries no ineligibility reason");
});

test("normalizeAzureInvoice flags a MULTI-DOCUMENT result as corroboration_ineligible='multi_document'", () => {
  const oneDoc = { fields: { InvoiceTotal: { content: "100.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 } } };
  const out = azure.normalizeAzureInvoice({ status: "succeeded", analyzeResult: { documents: [oneDoc, oneDoc], pages: [{ pageNumber: 1 }] } });
  assert.equal(out.envelope.corroboration_ineligible, "multi_document");
});

test("normalizeAzureInvoice flags a CREDIT NOTE (docType / negative total) as corroboration_ineligible='credit_note'", () => {
  const byDocType = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: { documents: [{ docType: "invoice.creditNote", fields: { InvoiceTotal: { content: "100.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 } } }], pages: [{ pageNumber: 1 }] },
  });
  assert.equal(byDocType.envelope.corroboration_ineligible, "credit_note", "docType signal");
  const byNegative = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: { documents: [{ fields: { InvoiceTotal: { content: "-100.00", valueCurrency: { currencyCode: "MYR", amount: -100 }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 } } }], pages: [{ pageNumber: 1 }] },
  });
  assert.equal(byNegative.envelope.corroboration_ineligible, "credit_note", "negative total signal");
});

test("normalizeAzureInvoice emits invoice.deposit ONLY when the engine returns one", () => {
  const withDeposit = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: { documents: [{ fields: { InvoiceTotal: { content: "100.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 }, Deposit: { content: "20.00", confidence: 0.9 } } }], pages: [{ pageNumber: 1 }] },
  });
  assert.ok(withDeposit.fields.some((f) => f.field_path === "invoice.deposit"), "deposit emitted when present");
  const out = azure.normalizeAzureInvoice(samplePayload());
  assert.ok(!out.fields.some((f) => f.field_path === "invoice.deposit"), "no deposit fabricated when absent");
});

// --- WA §11 invoice_id recovery (the typed InvoiceId field is lossy on MY layouts) ---
// Real RPR-corpus shapes: Azure returned an InvoiceId field with a bounding region but
// an EMPTY value (BINV202510-018 / PKLG-2508-001), or no field at all, while the number
// was plainly in the OCR. The mapper recovers it from keyValuePairs / content — but only
// when the typed field yields nothing, and never for an implausible token.

function idOf(out) {
  return out.fields.find((f) => f.field_path === "invoice.invoice_id");
}

test("invoice_id: a non-empty TYPED InvoiceId is source of truth and is NEVER overridden by KV", () => {
  const out = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: {
        InvoiceTotal: { content: "100.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 },
        InvoiceId: { content: "TYPED-001", boundingRegions: [{ pageNumber: 1, polygon: [] }], confidence: 0.9 },
      } }],
      keyValuePairs: [{ key: { content: "Invoice No" }, value: { content: "KV-999" }, confidence: 0.8 }],
      pages: [{ pageNumber: 1 }],
    },
  });
  assert.equal(idOf(out).value_raw, "TYPED-001", "typed hit wins; KV must not override");
});

test("invoice_id: an EMPTY typed InvoiceId (region, no value) is recovered from keyValuePairs", () => {
  const out = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: {
        InvoiceTotal: { content: "435,560.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.98 },
        InvoiceId: { content: "", boundingRegions: [{ pageNumber: 1, polygon: [0.1, 0.1, 0.2, 0.2] }], confidence: 0.5 },
      } }],
      keyValuePairs: [
        { key: { content: "Vendor" }, value: { content: "BRIGHTPATH" }, confidence: 0.9 },
        { key: { content: "Invoice No." }, value: { content: "BINV202510-018", boundingRegions: [{ pageNumber: 1, polygon: [0.3, 0.3, 0.4, 0.4] }] }, confidence: 0.87 },
      ],
      pages: [{ pageNumber: 1 }],
    },
  });
  assert.equal(idOf(out).value_raw, "BINV202510-018", "KV recovers the number the typed field dropped");
  assert.equal(idOf(out).page, 1);
});

test("invoice_id: an ABSENT typed InvoiceId is recovered from a same-line content label", () => {
  const out = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: { InvoiceTotal: { content: "5,000.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 } } }],
      content: "ROME PUBLIC ADVISORY SDN BHD\nInvoice No : INV2510/10\nDate : 2025-10-13\nTotal RM 5,000.00\n",
      pages: [{ pageNumber: 1 }],
    },
  });
  assert.equal(idOf(out).value_raw, "INV2510/10");
  assert.deepEqual(idOf(out).polygon, [], "a content-scan recovery carries no fabricated geometry");
});

test("invoice_id: recovered from a NEXT-line content label (label and value on separate lines)", () => {
  const out = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: { InvoiceTotal: { content: "1,190.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 } } }],
      content: "KOK LIONG ACCOUNTANCY\nInvoice No.\n202509230\nSecretary fees\n",
      pages: [{ pageNumber: 1 }],
    },
  });
  assert.equal(idOf(out).value_raw, "202509230");
});

test("invoice_id: the plausibility gate rejects a currency amount mislabelled as invoice no", () => {
  const out = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: { InvoiceTotal: { content: "5,000.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 } } }],
      keyValuePairs: [{ key: { content: "Invoice No" }, value: { content: "RM 5,000.00" }, confidence: 0.6 }],
      content: "Total Amount Due\nRM 5,000.00\n",
      pages: [{ pageNumber: 1 }],
    },
  });
  assert.equal(idOf(out), undefined, "a currency total is not a plausible invoice number");
});

test("invoice_id: no recoverable number anywhere leaves invoice.invoice_id absent (honest)", () => {
  const out = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: { InvoiceTotal: { content: "100.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 } } }],
      content: "A receipt with no invoice number printed on it at all.\n",
      pages: [{ pageNumber: 1 }],
    },
  });
  assert.equal(idOf(out), undefined);
});

// --- WA §11 / AB-16 vendor registration (the typed VendorTaxId field) ---
// The prebuilt-invoice VendorTaxId carries the supplier's SSM/tax registration.
// Emitted as a NON-MONETARY invoice.vendor_registration fact so the coding lane can
// resolve a REGISTERED vendor by number instead of stalling on name ambiguity.

function regOf(out) {
  return out.fields.find((f) => f.field_path === "invoice.vendor_registration");
}

test("vendor_registration: a typed VendorTaxId is emitted as invoice.vendor_registration", () => {
  const out = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: {
        InvoiceTotal: { content: "5,000.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 },
        VendorName: { content: "READYCO SDN BHD", confidence: 0.95 },
        VendorTaxId: { content: "201801000900", boundingRegions: [{ pageNumber: 1, polygon: [0.2, 0.2, 0.3, 0.3] }], confidence: 0.88 },
      } }],
      pages: [{ pageNumber: 1 }],
    },
  });
  const reg = regOf(out);
  assert.ok(reg, "VendorTaxId yields an invoice.vendor_registration fact");
  assert.equal(reg.value_raw, "201801000900");
  assert.equal(reg.page, 1);
  assert.equal(reg.confidence, 0.88);
  assert.equal(out.normalizationVersion, "clara-invoice-norm:v5", "normalization version is bumped to v5 (Wave A2 customer fields)");
});

test("v5 (Wave A2): CustomerName/SubTotal/TotalTax map to AR facts; CustomerTaxId → customer_registration", () => {
  const payload = samplePayload();
  Object.assign(payload.analyzeResult.documents[0].fields, {
    CustomerName: { content: "DARE TO DREAM REAL ESTATE SDN BHD", confidence: 0.93 },
    SubTotal: { content: "410,000.00", confidence: 0.9 },
    TotalTax: { content: "25,560.00", confidence: 0.9 },
    CustomerTaxId: { content: "201901111111", confidence: 0.88 },
  });
  const out = azure.normalizeAzureInvoice(payload);
  const byPath = Object.fromEntries(out.fields.map((f) => [f.field_path, f]));
  assert.equal(byPath["invoice.customer_name"].value_raw, "DARE TO DREAM REAL ESTATE SDN BHD");
  assert.equal(byPath["invoice.total_excl_tax"].value_raw, "410,000.00", "SubTotal is RAW (DB owns cents)");
  assert.equal(byPath["invoice.tax_total"].value_raw, "25,560.00");
  assert.equal(byPath["invoice.customer_registration"].value_raw, "201901111111");
  // AB-3 boundary: none of the v5 customer keys may match the attribution patterns.
  for (const p of Object.keys(byPath)) {
    assert.ok(!/tin|ssm|account/.test(p), `v5 key ${p} avoids the attribution patterns`);
  }
});

test("vendor_registration: a MISSING VendorTaxId yields no invoice.vendor_registration field", () => {
  const out = azure.normalizeAzureInvoice(samplePayload()); // sample has no VendorTaxId
  assert.equal(regOf(out), undefined, "no registration fabricated when the engine returns none");
});

test("vendor_registration: an implausible VendorTaxId (a currency total) is dropped, never Tier-A geometry", () => {
  const out = azure.normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: {
        InvoiceTotal: { content: "5,000.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.99 },
        VendorTaxId: { content: "RM 5,000.00", confidence: 0.4 },
      } }],
      pages: [{ pageNumber: 1 }],
    },
  });
  assert.equal(regOf(out), undefined, "a currency amount mislabelled as a tax id is not a plausible registration");
});

// WA §11 / v4: the real Azure request enables the (free, 2024-11-30) keyValuePairs
// add-on so the model returns key-value pairs for the invoice_id KV recovery.
test("analyzeInvoiceReal enables the keyValuePairs add-on on the analyze request", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clara-kvp-"));
  const file = join(dir, "one.pdf");
  writeFileSync(file, "%PDF-1.7\n");
  const saved = { ep: process.env.AZURE_DI_ENDPOINT, key: process.env.AZURE_DI_KEY };
  process.env.AZURE_DI_ENDPOINT = "https://di.invalid";
  process.env.AZURE_DI_KEY = "test-only";
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url);
    if (init?.body) { for await (const _chunk of init.body) void _chunk; }
    if (init?.method === "POST") return new Response(null, { status: 202, headers: { "operation-location": "https://di.invalid/op/1" } });
    return new Response(JSON.stringify({ status: "succeeded", analyzeResult: { documents: [], pages: [{ pageNumber: 1 }] } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await azure.analyzeInvoiceReal({ filePath: file, mime: "application/pdf", totalDeadlineMs: 1000, fetchImpl });
    const analyzeUrl = urls[0];
    assert.match(analyzeUrl, /:analyze\?/, "the first call is the analyze submission");
    assert.match(analyzeUrl, /[?&]features=keyValuePairs\b/, "the analyze request enables the keyValuePairs add-on");
    assert.match(analyzeUrl, /api-version=2024-11-30/, "the pinned api-version is preserved");
  } finally {
    if (saved.ep === undefined) delete process.env.AZURE_DI_ENDPOINT; else process.env.AZURE_DI_ENDPOINT = saved.ep;
    if (saved.key === undefined) delete process.env.AZURE_DI_KEY; else process.env.AZURE_DI_KEY = saved.key;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("analyzeInvoice uses the injected test adapter (no network) in RELAY_TEST_MODE", async () => {
  globalThis.__claraAzureInvoiceForTest = async () => samplePayload();
  try {
    const out = await azure.analyzeInvoice("/tmp/x.pdf", "application/pdf", {});
    assert.ok(out.fields.some((f) => f.field_path === "invoice.total"));
  } finally {
    delete globalThis.__claraAzureInvoiceForTest;
  }
});

// PIN-AB-6: the behavior is RECEIPT-DRIVEN — doc metadata (storage_path/sha256/mime_type)
// comes flat from the claim receipt, not a sidecar.
const DOC = {
  document_id: "d",
  firm_id: "f",
  lane: "invoice_facts",
  storage_path: "firms/f/docs/s.pdf",
  sha256: "s",
  mime_type: "application/pdf",
  byte_size: 16,
};

test("interpretClaimReceipt: running carries doc + claimed; held_egress/failed/deduped end the workflow (no-work)", () => {
  const running = interpretClaimReceipt({
    task_id: "t",
    status: "running",
    document_id: "d",
    firm_id: "f",
    lane: "invoice_facts",
    storage_path: "firms/f/docs/s.pdf",
    sha256: "s",
    mime_type: "application/pdf",
    byte_size: 10,
  });
  assert.equal(running.claimed, true);
  assert.equal(running.doc.storage_path, "firms/f/docs/s.pdf");
  assert.equal(running.doc.mime_type, "application/pdf");

  // Same-run replayed still reports 'running' + carries metadata (no re-attempt).
  const replayed = interpretClaimReceipt({ task_id: "t", status: "running", replayed: true, storage_path: "k", sha256: "s", mime_type: "application/pdf" });
  assert.equal(replayed.claimed, true);
  assert.ok(replayed.doc);

  const held = interpretClaimReceipt({ task_id: "t", status: "held_egress" });
  assert.equal(held.claimed, false);
  assert.equal(held.doc, null);

  // The DB's attempt_cap: it already failed + refunded + evented — the workflow must
  // simply END with this status, never re-fail or loop.
  const failed = interpretClaimReceipt({ task_id: "t", status: "failed", reason: "attempt_cap" });
  assert.equal(failed.claimed, false);
  assert.equal(failed.status, "failed");
  assert.equal(failed.doc, null);
});

function stubServices(overrides = {}) {
  const calls = { persist: 0, fail: [], downloaded: 0 };
  const services = {
    taskTempPath: () => "/tmp/task.bin",
    removeTempFile: async () => {},
    downloadCanonical: async () => {
      calls.downloaded += 1;
    },
    analyzeInvoice: async () => ({ fields: [{ field_path: "invoice.total", value_raw: "10.00", page: 1, polygon: [], confidence: 0.99 }], rawSha256: "r", normalizationVersion: "v1", pagesUsed: 1 }),
    noteTaskFailure: async () => {},
    ...overrides,
  };
  const withRuntime = async (fn) =>
    fn({
      query: async (sql) => {
        if (/persist_invoice_facts/.test(sql)) calls.persist += 1;
        if (/fail_invoice_facts/.test(sql)) calls.fail.push(sql);
        return { rows: [{ receipt: { status: "ok" } }], rowCount: 1 };
      },
    });
  return { services, withRuntime, calls };
}

test("behavior success path persists facts from the claim receipt (never touches extraction_status)", async () => {
  const { services, withRuntime, calls } = stubServices();
  const out = await processInvoiceFactsBehavior(services, withRuntime, "task-1", DOC);
  assert.equal(out.status, "done");
  assert.equal(calls.persist, 1);
  assert.equal(calls.fail.length, 0);
  assert.equal(calls.downloaded, 1);
});

test("behavior treats a claim outcome without metadata as no-work", async () => {
  const { services, withRuntime, calls } = stubServices();
  const out = await processInvoiceFactsBehavior(services, withRuntime, "task-x", null);
  assert.equal(out.status, "no_work");
  assert.equal(calls.downloaded, 0);
  assert.equal(calls.persist, 0);
});

test("behavior terminal failure (bad_type) calls fail_invoice_facts, not a retry", async () => {
  const { services, withRuntime, calls } = stubServices({
    analyzeInvoice: async () => {
      throw Object.assign(new Error("corrupt invoice"), { code: "bad_type" });
    },
  });
  const out = await processInvoiceFactsBehavior(services, withRuntime, "task-2", DOC);
  assert.equal(out.status, "failed");
  assert.equal(out.code, "bad_type");
  assert.equal(calls.fail.length, 1);
});

test("behavior transient fault (engine_error) RETHROWS to be retried; no premature terminal fail", async () => {
  const { services, withRuntime, calls } = stubServices({
    analyzeInvoice: async () => {
      throw Object.assign(new Error("azure 503"), { code: "engine_error" });
    },
  });
  await assert.rejects(() => processInvoiceFactsBehavior(services, withRuntime, "t", DOC), /azure 503/);
  assert.equal(calls.fail.length, 0, "transient: rethrown (WDK step retry + reconciler; the DB caps), never a premature terminal fail");
});
