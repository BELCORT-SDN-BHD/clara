// Azure Document Intelligence prebuilt-invoice adapter (Slice-6 D-1). INFRASTRUCTURE
// — injected via globalThis (__claraInvoiceFactsServices), NOT part of the frozen
// invoiceFacts_v1 closure, so vendor/deadline tuning is not a workflow-version change
// (the AB-16 precedent; mirrors lib/egress.mjs for the layout lane). One absolute
// deadline covers submission, every 429 wait, and polling — a Retry-After can never
// extend the operation past it (the same 429-surviving discipline as the layout lane).

import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

import { readTotalsFromLines } from "../lib/invoice-totals-reader.mjs";
import { mergeTotalsIntoFields } from "../lib/invoice-totals-merge.mjs";
import { looksLikeRegistration, readVendorIdentityFromLines, mergeVendorIdentity, anchorsFromTypedFields } from "../lib/invoice-vendor-identity.mjs";
import { readCurrencyFromLines, mergeCurrencyIntoFields } from "../lib/invoice-currency-reader.mjs";
import { readCustomerIdentityFromLines, mergeCustomerIdentity } from "../lib/invoice-customer-identity.mjs";
import { recoverInvoiceId } from "../lib/invoice-id-recovery.mjs";

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
 *  v2 (Wave A): invoice.invoice_id gains a key-value-pair / OCR-content fallback for a typed
 *  InvoiceId field carrying no value (WA §11 facts-capture fix).
 *  v3 (Wave A.1): invoice.vendor_registration emitted from the typed `VendorTaxId` field so the
 *  coding lane can resolve a REGISTERED vendor by number, not name-only ambiguity (AB-16).
 *  v4 (Wave A.1): `features=keyValuePairs` ENABLED (owner decision 2026-07-21; a FREE add-on on
 *  prebuilt-invoice at this api-version) — the invoice_id KV recovery goes live.
 *  v5 (Wave A2): the AR facts vocabulary — CustomerName/SubTotal/TotalTax (FIELD_MAP) and a
 *  gated CustomerTaxId -> invoice.customer_registration, avoiding the AB-3 %tin%/%ssm%/%account%
 *  naming boundary (§3.2; customer_taxid stays UBL-only, never emitted here).
 *  v6 (extraction slice X2, ADR-047): the DETERMINISTIC TOTALS READER
 *  (lib/invoice-totals-reader.mjs) runs after the typed loop and emits the stated totals
 *  the typed fields do not carry — measured 0/29 for TotalTax on the live corpus, which is
 *  why Gate P has no tax leg and the auto-draft lane has never drafted. It reads them
 *  label-anchored off pages[].lines[] geometry, and every emission carries that line's own
 *  polygon. Bumped for TWO reasons, both needed: v5 and v6 extractions must stay
 *  distinguishable (the same document yields more fields under v6), and the version is
 *  hashed with the raw response, so a re-extraction is a genuinely new fact set rather than
 *  a silent supersede. The reader's refusal counters ride the envelope as `totals_reader`.
 *  Also v6: the reader/typed RECONCILIATION (see normalizeAzureInvoice) — Azure types
 *  SubTotal nondeterministically on the SAME document, so a reader emission can collide
 *  with a typed one. Two identical readings collapse to one; two different readings emit
 *  NEITHER. Letting both through would hand the DB conflicting duplicates, and 0016 forfeits
 *  the WHOLE extraction on those — destroying today's working 29/29 invoice.total capture.
 *  v7 (extraction slice X6, ADR-047 Q3): the DETERMINISTIC VENDOR-IDENTITY READER
 *  (lib/invoice-vendor-identity.mjs) emits `invoice.vendor_registration` from a label-anchored
 *  letterhead line when the typed `VendorTaxId` is absent — measured on the Gate-P vehicle,
 *  where Azure typed no tax id at all and typed VendorName came back as OCR garbage, while
 *  `Company No. 202401047756 (1593602-X)` sat cleanly in the letterhead of both pages and
 *  normalizes EXACTLY to the registry's registration_normalized. Without it the auto-draft
 *  lane's second blocker (`vendor_unresolved`) cannot fall: resolution had nothing but a
 *  mangled name, and name-only matching against a REGISTERED counterparty is refused by
 *  CLR23 doctrine — correctly. Bumped because the same document now yields a fact it did not
 *  under v6, so v6 and v7 extractions must stay distinguishable. The reader's counters ride
 *  the envelope under `vendor_identity`.
 *  v8 (runway measurement, 2026-07-28): the totals vocabulary learns the EZSEC net label.
 *  EZSEC (~45 bills — the corpus's only family that prints a corroborable MYR breakdown)
 *  states its net as `Total Payable Excl. SST:`, which exact-prefix-matched NOTHING, so
 *  `invoice.total_excl_tax` stayed typed-only while its tax half was already
 *  `typed_collapsed`. X5 requires BOTH halves agreed, so the whole family sat one label short
 *  of corroborating. Adding the `total payable excl` / `total excl` prefixes gives the reader
 *  a second reading of the net that the typed field can collapse against. Bumped because the
 *  same document now yields a fact it did not under v7 (and a differently-sourced one), so v7
 *  and v8 extractions must stay distinguishable and a re-extraction is a genuinely new fact
 *  set rather than a silent supersede — the same reason v6 and v7 were bumped.
 *  v9 (the currency-defect fix, 2026-07-28): the DETERMINISTIC CURRENCY READER
 *  (lib/invoice-currency-reader.mjs — full rationale there) reconciles against the typed
 *  `invoice.currency` emission below, a MODEL GUESS measured wrong on 7/40 real documents CLR21
 *  then refused to code at all. Agreement keeps the typed row + stamps `typed_collapsed`;
 *  disagreement withdraws BOTH rows, lifting the refusal without ever adding a document to
 *  `corroborated`. NO DB CHANGE ships here; bumped for the v6/v7/v8 reason — a different fact set.
 *  v10 (the F6–F9 fix batch, finding F7): the DETERMINISTIC CUSTOMER-IDENTITY READER, X7
 *  (lib/invoice-customer-identity.mjs + lib/invoice-party-grammar.mjs — full rationale there).
 *  Until now `invoice.customer_name` was a byte-for-byte pass-through of Azure's typed
 *  `CustomerName`, with no second reader anywhere: on BOTH real KONG CHENG invoices
 *  (wave-7a-acceptance-h1.md rows 1 and 12) the model typed the `Attn :` CONTACT PERSON instead
 *  of the company in the bill-to box, and both drafts are still held `counterparty_unresolved`.
 *  X7 reads the addressee party off the layout — label-anchored, attributed to the typed
 *  CustomerName region's own geometry — and emits the `Attn` person separately as the NEW
 *  `invoice.contact_person` fact. Bumped for the v6/v7/v8/v9 reason and one more: the same
 *  document now yields a fact it could not under v9, and on the F7 shape it yields a DIFFERENT
 *  customer_name, so v9 and v10 extractions must stay distinguishable and a re-extraction is a
 *  genuinely new fact set rather than a silent supersede. The reader's counters ride the
 *  envelope under `customer_identity`. THIS ONE DOES CARRY A DB CHANGE — `invoice.contact_person`
 *  joins persist_invoice_facts' CLOSED field_path allowlist in its own migration; without it
 *  every extraction carrying the new fact would raise CLR10 and forfeit outright.
 *  v11 (the A1 field test — F7 REOPENED): v10 SHIPPED AND DID NOT WORK. Both real KONG CHENG
 *  documents re-extracted cleanly under v10 and `customer_name` came back BYTE-IDENTICAL to v1,
 *  still the contact person: X7's only candidate-GENERATION surface was a bill-to LABEL, and
 *  those invoices print none, so every wall the reviews hardened sat unreached (the live receipts
 *  read zero in every refusal head). Two repairs ride this bump — geometry-anchored generation on
 *  label-less pages (lib/invoice-anchor-sweep.mjs), and the vendor attribution term becoming
 *  IDENTITY rather than PROXIMITY after the capture showed Azure types VendorName onto a top-left
 *  LOGO sitting nearer the buyer than the buyer's own anchor. Plus ruling 2: a typed value the
 *  reader positively read AS its own accepted contact is WITHDRAWN when no party is reachable,
 *  instead of shipping the same human as both `contact_person` and `customer_name`. NO DB CHANGE
 *  — `0052`'s allowlist splice already covers `invoice.contact_person`, so this half is runtime
 *  only. Bumped because the SAME document yields a DIFFERENT customer_name than under v10, and
 *  the A-leg replay must be able to tell a v10 fact set from a v11 one. */
export const NORMALIZATION_VERSION = "clara-invoice-norm:v11";

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
export function firstRegion(field) {
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
  // Wave A2 (v5): the AR sales-invoice fields. CustomerName gives the buyer identity;
  // SubTotal/TotalTax carry the net + tax split for the SST 3-leg tie. RAW value_raw
  // (the DB owns cents). Names avoid %tin%/%ssm%/%account% (the AB-3 boundary, §3.2).
  CustomerName: "invoice.customer_name",
  SubTotal: "invoice.total_excl_tax",
  TotalTax: "invoice.tax_total",
};

// DI field names that carry a deposit / prepayment (emitted as invoice.deposit when the
// engine returns one; a non-zero deposit blocks Tier-A corroboration at the DB).
const DEPOSIT_FIELDS = ["Deposit", "Deposits", "DepositAmount"];

// --- invoice_id recovery (WA §11) -----------------------------------------------
// MOVED, byte-for-byte, to lib/invoice-id-recovery.mjs by the F6–F9 fix batch (the repo's
// 500-line file limit, when X7's wiring landed below) and imported back above — the same
// mechanical-move discipline the X6 note below records. Its full rationale travels with it;
// `firstRegion` stays here (the typed loop, the currency emit and both tax-id emits use it too)
// and is passed in, so there is still exactly ONE definition of it.

// A plausible vendor registration number (Malaysian SSM/ROC or tax id): has a sane
// length and substantive alphanumeric content, and is not a bare currency amount or
// an ISO date. Registration numbers carry dashes/slashes (e.g. "202301234567",
// "1234567-A", "IG12345678900") — those pass; the DB normalizer strips separators.
// Deliberately permissive on the token shape (the coding lane only uses it to match
// an EXISTING registered counterparty by normalized registration; a non-match simply
// falls back to name-only ambiguity, never a wrong resolution).
//
// v7 (X6): the body MOVED, byte-for-byte, to lib/invoice-vendor-identity.mjs so the typed
// emits below and the new layout reader share ONE gate instead of two that drift apart.
// Imported back above; behaviour here is unchanged.

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
  // A CROSS-MODULE COUPLING, named here because tidying this loop would move behaviour two files
  // away. A row is emitted whenever the typed field OBJECT exists — even when its content is
  // EMPTY — and X7's `mergeCustomerIdentity` is written against exactly that: it finds a
  // `invoice.customer_name` row to reconcile against, and its `!typed` arm is unreachable through
  // this adapter. Skipping empty-content fields here would make that arm live again. It is now a
  // deliberate REFUSAL rather than a hole (the reader never authors a name — see that module's
  // header), so a change here would not create a wrong identity; it would silently move which
  // branch runs. Reconcile the two modules before tidying either.
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

  // Customer registration (Wave A2 / §3.2): the prebuilt-invoice `CustomerTaxId` field
  // carries the BUYER's registration / tax id. Emit it as the non-monetary
  // invoice.customer_registration fact (gated by looksLikeRegistration, exactly like
  // VendorTaxId) so the sales-direction coding lane can resolve a REGISTERED customer by
  // registration. `customer_registration` avoids %tin%/%ssm%/%account% (AB-3 boundary).
  const ctax = fields.CustomerTaxId;
  if (ctax) {
    const regRaw = String(ctax.content ?? ctax.valueString ?? "").trim();
    if (looksLikeRegistration(regRaw)) {
      const region = firstRegion(ctax);
      out.push({ field_path: "invoice.customer_registration", value_raw: regRaw, page: region.page, polygon: region.polygon, confidence: ctax.confidence == null ? null : Number(ctax.confidence) });
    }
  }

  // invoice_id recovery (WA §11): the typed InvoiceId field above may be absent, or
  // present with an empty value. Only then do we recover the number from the model's
  // key-value pairs / OCR content — never overriding a real typed hit.
  const idFact = out.find((r) => r.field_path === "invoice.invoice_id");
  if (!idFact || !String(idFact.value_raw ?? "").trim()) {
    const recovered = recoverInvoiceId(result, firstRegion);
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

  // --- X2: the deterministic totals reader (ADR-047) ------------------------------------
  // Runs LAST, over pages[].lines[] geometry, and only for the six stated-component paths.
  // A payload whose pages carry no lines[] (every pre-X2 fixture, and any engine result
  // without layout regions) yields nothing here, so this is a pure widening: the typed
  // vocabulary, the recovery paths, pagesUsed and engineConfig are untouched.
  //
  // SINGLE-DOCUMENT ONLY. The typed fields above come exclusively from `documents[0]`, while
  // `result.pages` spans the whole scan. On a multi-document bundle the reader would happily
  // pair a label on document B's page with an amount there and file it as a component of
  // document A — two different bills fused into one fact set. `corroboration_ineligible`
  // blocks Tier A but does NOT stop that region from persisting or from being shown to a
  // human coder, so the reader simply does not run. Same convention, stated in the receipt.
  const singleDocument = documents.length <= 1;
  const totals = singleDocument
    ? readTotalsFromLines(result.pages)
    : { fields: [], receipt: { ...readTotalsFromLines([]).receipt, reason: "multi_document" } };
  mergeTotalsIntoFields(out, totals);

  // --- X6: the deterministic vendor-identity reader (ADR-047 Q3) -------------------------
  // Runs after the typed VendorTaxId emit above, so a typed row is present to reconcile
  // against. Single-document only, for the same reason the totals reader is: typed fields come
  // from documents[0] while pages span the whole scan, so on a bundle a letterhead belonging
  // to document B would be filed as document A's supplier — a WRONG identity, which is worse
  // than the missing one it replaces.
  // Attribution rides the TYPED VendorName/CustomerName regions. Their geometry is what is
  // being used, never their content — on the vehicle VendorName reads as OCR garbage while
  // its region sits 0.015in from the letterhead.
  const anchors = anchorsFromTypedFields(fields);
  const identity = singleDocument
    ? readVendorIdentityFromLines(result.pages, anchors)
    : { fields: [], receipt: { ...readVendorIdentityFromLines([]).receipt, outcome: "multi_document" } };
  mergeVendorIdentity(out, identity);

  // --- X7: the deterministic CUSTOMER-identity reader (F6–F9 fix batch, finding F7) ----------
  // Runs after the typed CustomerName emit above, so a typed row is present to reconcile
  // against, and it rides the SAME anchors X6 built — the typed CustomerName region is what
  // makes a bill-to candidate EVIDENCED rather than merely label-shaped. Single-document only,
  // for the reason X2 and X6 are: typed fields come from documents[0] while pages span the whole
  // scan, so on a bundle document B's bill-to box would be filed as document A's buyer — a WRONG
  // party, which is worse than the missing one it replaces.
  const customer = singleDocument
    ? readCustomerIdentityFromLines(result.pages, anchors)
    : { fields: [], receipt: { ...readCustomerIdentityFromLines([]).receipt, outcome: "multi_document" } };
  mergeCustomerIdentity(out, customer);

  // --- the currency reader (design doc part 1 §3/§4; rationale in its own header). Document-
  // scope; gated on `singleDocument` anyway so a foreign token on B's page can't withdraw A's row.
  const currencyReader = singleDocument
    ? readCurrencyFromLines(result.pages)
    : { fields: [], receipt: { ...readCurrencyFromLines([]).receipt, reason: "multi_document" } };
  mergeCurrencyIntoFields(out, currencyReader);

  let corroborationIneligible = null;
  if (documents.length > 1) corroborationIneligible = "multi_document";
  else if (doc && isCreditNote(doc, fields)) corroborationIneligible = "credit_note";
  const envelope = corroborationIneligible ? { corroboration_ineligible: corroborationIneligible } : {};
  // The reader's counters ride the extraction envelope so every refusal is inspectable on
  // live without re-running the engine. The envelope is a free-form jsonb the DB merges
  // (0022:475) and reads only by named key, so an added key is inert to every consumer.
  envelope.totals_reader = totals.receipt;
  envelope.vendor_identity = identity.receipt;
  envelope.currency_reader = currencyReader.receipt;
  envelope.customer_identity = customer.receipt;

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
