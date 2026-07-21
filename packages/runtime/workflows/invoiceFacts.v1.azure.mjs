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
 *  response (model-drift honesty, S6-D1) — bump when the mapping below changes.
 *  v2 (Wave A): invoice.invoice_id gains a key-value-pair / OCR-content fallback
 *  when the typed InvoiceId field carries no value (WA §11 facts-capture fix).
 *  v3 (Wave A.1): invoice.vendor_registration emitted from the typed `VendorTaxId`
 *  field (non-monetary) so the coding lane can resolve a REGISTERED vendor by
 *  registration number instead of stalling on name-only ambiguity (AB-16).
 *  v4 (Wave A.1): the `features=keyValuePairs` add-on is ENABLED (owner decision
 *  2026-07-21), so the model now returns keyValuePairs and the invoice_id KV recovery
 *  (recoverFromKeyValuePairs) goes live — recovering invoice numbers printed with no
 *  recognizable label. keyValuePairs is a FREE add-on on prebuilt-invoice at
 *  api-version 2024-11-30 (Azure add-on-capabilities version table — only Font/
 *  Formula/HighRes/QueryFields are billable), so it adds no per-page cost. Bumped so
 *  KV-enabled extractions are distinguishable from v3. */
export const NORMALIZATION_VERSION = "clara-invoice-norm:v4";

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
  // The prebuilt-invoice `InvoiceId` typed field has poor recall on non-US layouts
  // (it returns a region with no value, or no field at all — see the RPR corpus).
  // ENABLED (owner decision 2026-07-21): `features=keyValuePairs` makes the model
  // return key-value pairs, from which normalizeAzureInvoice's invoice_id recovery
  // (recoverFromKeyValuePairs) reads the number off its printed label — recovering
  // numbers the typed field and the label-anchored content scan both miss.
  // keyValuePairs is a FREE add-on on prebuilt-invoice at 2024-11-30 (it adds no
  // per-page charge — only Font/Formula/HighRes/QueryFields are billable), so this is
  // not a billing-surface change. Remove `&features=keyValuePairs` to turn it off.
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${MODEL}:analyze?api-version=${API_VERSION}&features=keyValuePairs`;
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

// NEVER fabricate geometry (W3 / finding 3): the page is a structural index, but the
// POLYGON is emitted as an empty array whenever Azure returns no bounding region (or an
// empty polygon). An empty polygon is the honest "no physical region" marker — the DB's
// _invoice_fact_state refuses to corroborate a total whose polygon is empty, so a
// geometry-less fact can never be promoted to Tier A.
function firstRegion(field) {
  const region = Array.isArray(field?.boundingRegions) ? field.boundingRegions[0] : null;
  if (!region) return { page: 1, polygon: [] };
  const polygon = Array.isArray(region.polygon) && region.polygon.length > 0 ? region.polygon.map(Number) : [];
  return { page: Number(region.pageNumber || 1), polygon };
}

// Credit-note doctype signal (W3): a credit note lawfully INCREASES nothing on the AP
// gross-to-payable shape and has no S6 booking, so it must never corroborate. This is an
// honest best-effort read of the engine result (docType / a type field / a negative or
// parenthesised total); the DB is the final guard (it never corroborates when the
// envelope carries corroboration_ineligible='credit_note').
function isCreditNote(doc, fields) {
  const docType = String(doc?.docType ?? "").toLowerCase();
  if (docType.includes("credit")) return true;
  for (const key of ["InvoiceType", "DocumentType", "Type"]) {
    const v = fields[key];
    const s = String(v?.content ?? v?.valueString ?? "").toLowerCase();
    if (s.includes("credit")) return true;
  }
  const amt = fields.InvoiceTotal?.valueCurrency?.amount;
  if (typeof amt === "number" && amt < 0) return true;
  const content = String(fields.InvoiceTotal?.content ?? "").trim();
  return content.startsWith("-") || /^\(.*\)$/.test(content);
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

// DI field names that carry a deposit / prepayment (emitted as invoice.deposit when the
// engine returns one; a non-zero deposit blocks Tier-A corroboration at the DB).
const DEPOSIT_FIELDS = ["Deposit", "Deposits", "DepositAmount"];

// --- invoice_id recovery (WA §11) -----------------------------------------------
// The prebuilt-invoice `InvoiceId` typed field is high-recall on US templates but
// LOSSY on Malaysian layouts: on the RPR corpus it returned a bounding region with
// an EMPTY value (or no field at all) on most bills, while the number was plainly in
// the OCR content. The typed field stays the source of truth; ONLY when it yields no
// value do we recover the number from the response's own structures — first the
// model's key-value pairs (features=keyValuePairs), then a label-anchored line scan of
// analyzeResult.content. Recovery is conservative (label-anchored + a plausibility
// gate) and NEVER overrides a non-empty typed hit, so the fields Azure did type stay
// byte-identical. A recovered id carries whatever geometry its source had (KV) or an
// empty polygon (content) — invoice_id is non-monetary, so it never affects Tier-A
// total corroboration; it only arms the duplicate-bill + near-dup keys the DB owns.

// Normalizes a label for matching: lowercase, collapse runs to single spaces, trim.
function normLabel(s) {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Label vocabulary for the invoice-number field across the layouts we see (English +
// Malay: "No. Invois", "No. Bil"). Deliberately excludes purchase-order / account /
// customer labels so we never capture a neighbouring number.
// Invoice-number anchors ONLY. `reference/ref/document/doc no.` labels are
// deliberately EXCLUDED: the recovered id feeds the exact-duplicate-bill key, and a
// delivery-order / customer reference sharing across two of a vendor's bills would
// false-positive that gate. Keep to invoice/bill/invois anchors (dual-review LOW).
const INVOICE_ID_LABEL =
  /\b(?:tax\s+)?inv(?:oice)?\.?\s*(?:no\.?|number|num\.?|#|id)\b|\binvois\b|\bno\.?\s*bil\b|\bbil\s*(?:no\.?|number)\b/i;

// A plausible invoice number: has a digit, sane length, and is not a bare currency
// amount or an ISO date (those are other fields). Invoice numbers may carry slashes,
// dashes and dots (INV2510/10, IV-2512-001, 202509230), so those pass.
function looksLikeInvoiceNumber(s) {
  const v = String(s ?? "").trim();
  if (v.length < 3 || v.length > 40) return false;
  if (!/[0-9]/.test(v)) return false;
  if (/^\(?\s*(?:rm|myr|usd|sgd)?\s*[\d,]+\.\d{2}\s*\)?$/i.test(v)) return false; // currency total
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; // ISO date == invoice_date, not id
  if (/^[\d\s]+$/.test(v) && v.replace(/\D/g, "").length > 12) return false; // long digit run (phone/acct)
  return true;
}

// A plausible vendor registration number (Malaysian SSM/ROC or tax id): has a sane
// length and substantive alphanumeric content, and is not a bare currency amount or
// an ISO date. Registration numbers carry dashes/slashes (e.g. "202301234567",
// "1234567-A", "IG12345678900") — those pass; the DB normalizer strips separators.
// Deliberately permissive on the token shape (the coding lane only uses it to match
// an EXISTING registered counterparty by normalized registration; a non-match simply
// falls back to name-only ambiguity, never a wrong resolution).
function looksLikeRegistration(s) {
  const v = String(s ?? "").trim();
  if (v.length < 3 || v.length > 40) return false;
  if (v.replace(/[^a-zA-Z0-9]/g, "").length < 3) return false; // substantive alnum content
  if (/^\(?\s*(?:rm|myr|usd|sgd)?\s*[\d,]+\.\d{2}\s*\)?$/i.test(v)) return false; // currency amount
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; // ISO date, not a registration
  return true;
}

// Trims label noise and surrounding punctuation, returning the invoice-number token.
function cleanIdToken(s) {
  return String(s ?? "")
    .replace(/^[\s:#.\-–—]+/, "")
    .replace(/[\s:#]+$/, "")
    .trim();
}

// Recover the invoice number from the model's key-value pairs (features=keyValuePairs).
function recoverFromKeyValuePairs(result) {
  const kvps = Array.isArray(result?.keyValuePairs) ? result.keyValuePairs : [];
  for (const kv of kvps) {
    if (!INVOICE_ID_LABEL.test(normLabel(kv?.key?.content))) continue;
    const val = cleanIdToken(kv?.value?.content);
    if (!looksLikeInvoiceNumber(val)) continue;
    const region = firstRegion(kv?.value);
    return {
      value: val,
      page: region.page,
      polygon: region.polygon,
      confidence: kv?.confidence == null ? null : Number(kv.confidence),
    };
  }
  return null;
}

// Recover from a label-anchored scan of the concatenated OCR content. Conservative:
// the value must sit after the label on the SAME line, or be the first plausible token
// on the NEXT line (the common "Invoice No:\nINV2510/10" print shape).
function recoverFromContent(result) {
  const content = typeof result?.content === "string" ? result.content : "";
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = INVOICE_ID_LABEL.exec(lines[i]); // case-insensitive, matched on the raw line
    if (!m) continue;
    // Same-line: the first whitespace-delimited token after the label.
    const sameLine = cleanIdToken(lines[i].slice(m.index + m[0].length)).split(/\s+/)[0];
    if (looksLikeInvoiceNumber(sameLine)) {
      return { value: sameLine, page: 1, polygon: [], confidence: null };
    }
    // Next-line: first whitespace-delimited token on the following line.
    const next = cleanIdToken((lines[i + 1] ?? "").trim().split(/\s+/)[0]);
    if (looksLikeInvoiceNumber(next)) {
      return { value: next, page: 1, polygon: [], confidence: null };
    }
  }
  return null;
}

// Best-effort recovery: KV first (Azure-structured), then content scan. Returns a
// {value, page, polygon, confidence} facts row or null.
function recoverInvoiceId(result) {
  return recoverFromKeyValuePairs(result) || recoverFromContent(result);
}

/** Map a succeeded prebuilt-invoice payload to the persist_invoice_facts fields
 *  array [{field_path, value_raw, page, polygon, confidence}] + a raw hash + pages +
 *  a corroboration-ineligibility envelope. The engine result is ALWAYS persisted as
 *  facts; the envelope records WHY a total may never reach Tier A (W3):
 *    - 'multi_document' — the result carries more than one top-level document (the INF
 *      bundle rule: never corroborate the first/largest total of a multi-document scan).
 *    - 'credit_note'    — a credit-note doctype signal (no S6 booking shape).
 *  (A deposit is carried as its own invoice.deposit fact; the DB blocks corroboration on
 *  a non-zero deposit directly, so it needs no envelope reason.) */
export function normalizeAzureInvoice(payload) {
  const result = payload?.analyzeResult || payload || {};
  const documents = Array.isArray(result.documents) ? result.documents : [];
  const doc = documents[0] || null;
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
  // Deposit / prepayment (emitted only when the engine returns one — never fabricated).
  for (const key of DEPOSIT_FIELDS) {
    const f = fields[key];
    if (!f) continue;
    const region = firstRegion(f);
    out.push({ field_path: "invoice.deposit", value_raw: String(f.content ?? f.valueString ?? ""), page: region.page, polygon: region.polygon, confidence: f.confidence == null ? null : Number(f.confidence) });
    break;
  }

  // Vendor registration (WA §11 / AB-16): the prebuilt-invoice `VendorTaxId` typed
  // field carries the supplier's registration / tax id. Emit it as a NON-MONETARY
  // invoice.vendor_registration fact so the coding lane can resolve a REGISTERED
  // vendor by registration number. Only when present and plausibly a registration
  // (a currency total / date mislabelled as a tax id is dropped). It carries the
  // typed field's own geometry (empty when Azure returned no region) — non-monetary,
  // so it can NEVER corroborate a Tier-A total; it only feeds vendor identity.
  const vtax = fields.VendorTaxId;
  if (vtax) {
    const regRaw = String(vtax.content ?? vtax.valueString ?? "").trim();
    if (looksLikeRegistration(regRaw)) {
      const region = firstRegion(vtax);
      out.push({ field_path: "invoice.vendor_registration", value_raw: regRaw, page: region.page, polygon: region.polygon, confidence: vtax.confidence == null ? null : Number(vtax.confidence) });
    }
  }

  // invoice_id recovery (WA §11): the typed InvoiceId field above may be absent, or
  // present with an empty value. Only then do we recover the number from the model's
  // key-value pairs / OCR content — never overriding a real typed hit.
  const idFact = out.find((r) => r.field_path === "invoice.invoice_id");
  if (!idFact || !String(idFact.value_raw ?? "").trim()) {
    const recovered = recoverInvoiceId(result);
    if (recovered) {
      const row = {
        field_path: "invoice.invoice_id",
        value_raw: recovered.value,
        page: recovered.page,
        polygon: recovered.polygon,
        confidence: recovered.confidence,
      };
      if (idFact) Object.assign(idFact, row);
      else out.push(row);
    }
  }

  let corroborationIneligible = null;
  if (documents.length > 1) corroborationIneligible = "multi_document";
  else if (doc && isCreditNote(doc, fields)) corroborationIneligible = "credit_note";
  const envelope = corroborationIneligible ? { corroboration_ineligible: corroborationIneligible } : {};

  const rawSha256 = createHash("sha256")
    .update(JSON.stringify(payload ?? {}) + "|" + NORMALIZATION_VERSION, "utf8")
    .digest("hex");
  const pagesUsed = Array.isArray(result.pages) ? result.pages.length : doc ? 1 : 0;
  return { fields: out, rawSha256, normalizationVersion: NORMALIZATION_VERSION, pagesUsed: pagesUsed || 1, envelope };
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
