// Azure Document Intelligence prebuilt-invoice adapter (Slice-6 D-1). INFRASTRUCTURE
// — injected via globalThis (__claraInvoiceFactsServices), NOT part of the frozen
// invoiceFacts_v1 closure, so vendor/deadline tuning is not a workflow-version change
// (the AB-16 precedent; mirrors lib/egress.mjs for the layout lane). One absolute
// deadline covers submission, every 429 wait, and polling — a Retry-After can never
// extend the operation past it (the same 429-surviving discipline as the layout lane).

import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

const API_VERSION = "2024-11-30";
const MODEL = "prebuilt-invoice";

/** The pinned engine snapshot id (contract §4 / pins §3). */
export const AZURE_INVOICE_ENGINE_SNAPSHOT = Object.freeze({
  engineId: "azure-di:prebuilt-invoice:2024-11-30",
  engineConfig: { provider: "azure-document-intelligence", model: MODEL, api_version: API_VERSION, region: "southeast-asia" },
  versionN: 1,
});

/** The deterministic normalization-policy version hashed with the raw engine
 *  response (model-drift honesty, S6-D1) — bump when the mapping below changes. */
export const NORMALIZATION_VERSION = "clara-invoice-norm:v1";

export class DocumentEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DocumentEngineError";
    this.code = code;
  }
}

const remaining = (deadline) => Math.max(0, deadline - Date.now());

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("aborted"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

function retryDelay(response, fallback = 1000) {
  const raw = response.headers.get("retry-after");
  if (!raw) return fallback;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallback;
}

async function fetchWithin(fetchImpl, url, init, deadline, signal) {
  if (remaining(deadline) <= 0) throw new DocumentEngineError("timeout", "Azure DI total deadline exceeded");
  return fetchImpl(url, { ...init, signal });
}

/** The real Azure prebuilt-invoice call — returns the full raw payload. */
export async function analyzeInvoiceReal({ filePath, mime, totalDeadlineMs = 120_000, fetchImpl = fetch }) {
  const endpoint = process.env.AZURE_DI_ENDPOINT?.replace(/\/+$/, "");
  const key = process.env.AZURE_DI_KEY;
  if (!endpoint || !key) throw new DocumentEngineError("engine_error", "Azure DI configuration is missing");
  const deadline = Date.now() + totalDeadlineMs;
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort(new Error("Azure DI total deadline exceeded")), totalDeadlineMs);
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${MODEL}:analyze?api-version=${API_VERSION}`;
  try {
    let response;
    while (true) {
      response = await fetchWithin(
        fetchImpl,
        analyzeUrl,
        { method: "POST", headers: { "ocp-apim-subscription-key": key, "content-type": mime }, body: createReadStream(filePath), duplex: "half" },
        deadline,
        controller.signal,
      );
      if (response.status !== 429) break;
      const wait = retryDelay(response);
      if (wait >= remaining(deadline)) throw new DocumentEngineError("timeout", "Azure DI 429 exceeded the total deadline");
      await delay(wait, controller.signal);
    }
    if (response.status !== 202) {
      throw new DocumentEngineError(response.status >= 500 ? "engine_error" : "bad_type", `Azure DI submission failed (${response.status})`);
    }
    const operation = response.headers.get("operation-location");
    if (!operation) throw new DocumentEngineError("engine_error", "Azure DI response omitted operation-location");
    while (true) {
      if (remaining(deadline) <= 0) throw new DocumentEngineError("timeout", "Azure DI total deadline exceeded");
      const poll = await fetchWithin(fetchImpl, operation, { headers: { "ocp-apim-subscription-key": key } }, deadline, controller.signal);
      if (poll.status === 429) {
        const wait = retryDelay(poll);
        if (wait >= remaining(deadline)) throw new DocumentEngineError("timeout", "Azure DI poll 429 exceeded the total deadline");
        await delay(wait, controller.signal);
        continue;
      }
      if (!poll.ok) throw new DocumentEngineError("engine_error", `Azure DI poll failed (${poll.status})`);
      const payload = await poll.json();
      const status = String(payload.status || "").toLowerCase();
      if (status === "succeeded") return payload;
      if (status === "failed" || status === "canceled") throw new DocumentEngineError("engine_error", `Azure DI operation ${status}`);
      const wait = Math.min(1000, remaining(deadline));
      if (wait <= 0) throw new DocumentEngineError("timeout", "Azure DI total deadline exceeded");
      await delay(wait, controller.signal);
    }
  } catch (err) {
    if (err instanceof DocumentEngineError) throw err;
    if (controller.signal.aborted) throw new DocumentEngineError("timeout", "Azure DI total deadline exceeded");
    throw new DocumentEngineError("engine_error", String(err?.message || err));
  } finally {
    clearTimeout(hardTimer);
  }
}

function firstRegion(field) {
  const region = Array.isArray(field?.boundingRegions) ? field.boundingRegions[0] : null;
  return region ? { page: Number(region.pageNumber || 1), polygon: Array.isArray(region.polygon) ? region.polygon.map(Number) : [] } : { page: 1, polygon: [] };
}

// DI invoice field name -> the pinned field_path vocabulary. value_raw stays RAW
// (the DB does deterministic cents normalization); currency is emitted separately.
const FIELD_MAP = {
  InvoiceTotal: "invoice.total",
  AmountDue: "invoice.amount_due",
  InvoiceId: "invoice.invoice_id",
  InvoiceDate: "invoice.invoice_date",
  VendorName: "invoice.vendor_name",
};

/** Map a succeeded prebuilt-invoice payload to the persist_invoice_facts fields
 *  array [{field_path, value_raw, page, polygon, confidence}] + a raw hash + pages. */
export function normalizeAzureInvoice(payload) {
  const result = payload?.analyzeResult || payload || {};
  const doc = Array.isArray(result.documents) ? result.documents[0] : null;
  const fields = doc?.fields || {};
  const out = [];
  for (const [diName, fieldPath] of Object.entries(FIELD_MAP)) {
    const f = fields[diName];
    if (!f) continue;
    const region = firstRegion(f);
    out.push({
      field_path: fieldPath,
      value_raw: String(f.content ?? f.valueString ?? ""),
      page: region.page,
      polygon: region.polygon,
      confidence: f.confidence == null ? null : Number(f.confidence),
    });
  }
  // Currency rides on the total's valueCurrency (the ledger is MYR-only; a non-MYR
  // code lets the coding tool refuse before any draft).
  const total = fields.InvoiceTotal;
  const currency = total?.valueCurrency?.currencyCode;
  if (currency) {
    const region = firstRegion(total);
    out.push({ field_path: "invoice.currency", value_raw: String(currency), page: region.page, polygon: region.polygon, confidence: total.confidence == null ? null : Number(total.confidence) });
  }
  const rawSha256 = createHash("sha256")
    .update(JSON.stringify(payload ?? {}) + "|" + NORMALIZATION_VERSION, "utf8")
    .digest("hex");
  const pagesUsed = Array.isArray(result.pages) ? result.pages.length : doc ? 1 : 0;
  return { fields: out, rawSha256, normalizationVersion: NORMALIZATION_VERSION, pagesUsed: pagesUsed || 1 };
}

/** The injected service entry point. Test mode uses an injected adapter (no network). */
export async function analyzeInvoice(filePath, mime, task) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const adapter = globalThis.__claraAzureInvoiceForTest;
    if (!adapter) throw new DocumentEngineError("engine_error", "test Azure invoice adapter is not injected");
    return normalizeAzureInvoice(await adapter({ filePath, mime, task }));
  }
  return normalizeAzureInvoice(await analyzeInvoiceReal({ filePath, mime }));
}
