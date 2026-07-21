// The MyInvois UBL e-invoice engine (Wave A2, contract §3 / migration 0015 companion).
// A LOCAL, deterministic, NO-EGRESS structured engine (engine id `clara-myinvois:v1`):
// it parses an uploaded MyInvois UBL 2.1 XML file offline and produces the TWO
// lifecycle-separated extractions the contract mandates (§3.1):
//
//   * The IDENTITY pass (engine_kind='structured_parse', lane='structured_parse') runs
//     inside the frozen documentIngest lane via the shared worker thread. It emits ONLY
//     the parties' identity regions with DELIBERATE field_paths:
//       - `myinvois.supplier_tin` / `myinvois.supplier_brn` MATCH the attribution
//         patterns (%tin%) and are on the DB attribution allowlist — the SALES supplier
//         IS the client, so these attribute.
//       - `myinvois.buyer_id_*` are named to NEVER match %tin%/%ssm%/%account%, so a
//         buyer identifier can never attribute a client (the inversion guard; the 0015
//         write-gate makes this structural, not just naming discipline).
//   * The FACTS pass (engine_kind='invoice_facts', lane='local_facts') runs on the NEW
//     non-frozen local_facts consumer's own worker. It emits the full §3.2 vocabulary
//     (supplier + buyer + totals + tax breakdown) for persist_invoice_facts.
//
// CARDINAL INVARIANTS honored here: the parser NEVER computes a number — every monetary
// value is emitted as `value_raw` byte-for-byte and the DB owns cents / ties / rounding.
// Geometry is honest (page:1, polygon:[] — the empty-polygon marker). Direction is
// DB-determined (§3.3): this mapper emits BOTH supplier (`invoice.vendor_*`) and buyer
// (`invoice.customer_*`) facts and never asserts a side. The XML parser is SELF-CONTAINED
// (no new dependency) — the OOXML hand-parse idiom, targeted at the LHDN SDK sample shape
// (WA2-R5 residual: a real validated e-invoice is unproven). DOCTYPE/ENTITY are refused as
// defence-in-depth (intake already ran the XXE gate before custody was sealed).

import { createHash } from "node:crypto";

/** The pinned local engine id (contract §3.1 / companion Deploy-artifacts). */
export const MYINVOIS_ENGINE_ID = "clara-myinvois:v1";

/** The engine snapshot laneSnapshot() stamps for an uploaded XML (intake.mjs). Distinct
 *  from the generic clara-structured:v1 (review L7) so the MyInvois lane is legible in
 *  the task row + satisfies the 0015 lane↔engine CHECK (structured_parse ⟹ clara-%). */
export const MYINVOIS_ENGINE_SNAPSHOT = Object.freeze({
  engineId: MYINVOIS_ENGINE_ID,
  engineConfig: { provider: "clara", parser: "myinvois-ubl", version: 1 },
  versionN: 1,
});

/** The deterministic normalization-policy version hashed with the signature-stripped
 *  document content (provenance-drift honesty, the S6-D1 idiom). Bump when the mapping
 *  below changes. v1 (Wave A2): the first MyInvois UBL facts mapping — supplier/buyer
 *  identity, totals, SST tax breakdown, type_code, envelope provenance. */
export const MYINVOIS_NORMALIZATION_VERSION = "clara-myinvois-norm:v1";

/** The MyInvois General TIN used on a CONSOLIDATED (B2C aggregate) e-invoice — the buyer
 *  is "General Public", never a resolvable customer counterparty (§3 / G-format §3). */
export const GENERAL_PUBLIC_TIN = "EI00000000010";

export class UblParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UblParseError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// A minimal, self-contained namespace-aware XML reader. NOT a general XML
// processor: it ignores the XML declaration / comments / processing instructions,
// treats CDATA as text, and refuses DOCTYPE/ENTITY. Namespaces are handled by
// splitting `prefix:local` and matching on the LOCAL part (UBL uses cbc:/cac:/ext:).
// ---------------------------------------------------------------------------

function splitName(raw) {
  const i = raw.indexOf(":");
  return i < 0 ? { prefix: "", local: raw } : { prefix: raw.slice(0, i), local: raw.slice(i + 1) };
}

function xmlUnescape(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&#34;", '"')
    .replaceAll("&amp;", "&");
}

function makeNode(tag) {
  const trimmed = tag.trim();
  const m = /^(\S+)([\s\S]*)$/.exec(trimmed);
  const rawName = m ? m[1] : trimmed;
  const attrsStr = m ? m[2] : "";
  const { prefix, local } = splitName(rawName);
  const attrs = Object.create(null);
  const re = /([^\s=/]+)\s*=\s*"([^"]*)"|([^\s=/]+)\s*=\s*'([^']*)'/g;
  let a;
  while ((a = re.exec(attrsStr))) {
    const key = a[1] ?? a[3];
    const val = xmlUnescape(a[2] ?? a[4]);
    const { local: aLocal } = splitName(key);
    // Store BOTH the full name and the local name; UBL attributes we read
    // (schemeID / listID / currencyID / listVersionID) are unprefixed local names.
    attrs[key] = val;
    if (!(aLocal in attrs)) attrs[aLocal] = val;
  }
  return { name: rawName, local, prefix, attrs, children: [], text: "" };
}

/** Parse an XML string into a lightweight tree rooted at a synthetic `#root`.
 *  Throws UblParseError('bad_type') on a DOCTYPE/ENTITY declaration. */
export function parseXml(text) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) {
    throw new UblParseError("bad_type", "XML DOCTYPE/ENTITY declarations are forbidden");
  }
  const cleaned = String(text)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "");
  const root = { name: "#root", local: "#root", prefix: "", attrs: Object.create(null), children: [], text: "" };
  const stack = [root];
  const n = cleaned.length;
  let i = 0;
  while (i < n) {
    const lt = cleaned.indexOf("<", i);
    if (lt < 0) break;
    if (lt > i) {
      const chunk = cleaned.slice(i, lt);
      if (chunk.trim()) stack[stack.length - 1].text += xmlUnescape(chunk);
    }
    if (cleaned.startsWith("<![CDATA[", lt)) {
      const end = cleaned.indexOf("]]>", lt + 9);
      const cdata = end < 0 ? cleaned.slice(lt + 9) : cleaned.slice(lt + 9, end);
      stack[stack.length - 1].text += cdata;
      i = end < 0 ? n : end + 3;
      continue;
    }
    const gt = cleaned.indexOf(">", lt);
    if (gt < 0) break;
    let tag = cleaned.slice(lt + 1, gt);
    i = gt + 1;
    if (tag.startsWith("/")) {
      const closeName = tag.slice(1).trim();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].name === closeName) {
          stack.length = s;
          break;
        }
      }
      continue;
    }
    const selfClose = tag.endsWith("/");
    if (selfClose) tag = tag.slice(0, -1);
    const node = makeNode(tag);
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

// --- tree query helpers (local-name matching) ------------------------------

function childNamed(node, local) {
  if (!node) return null;
  for (const c of node.children) if (c.local === local) return c;
  return null;
}

function childrenNamed(node, local) {
  return node ? node.children.filter((c) => c.local === local) : [];
}

function descend(node, ...locals) {
  let cur = node;
  for (const l of locals) {
    cur = childNamed(cur, l);
    if (!cur) return null;
  }
  return cur;
}

function textOf(node) {
  if (!node) return null;
  if (node.text && node.text.trim()) return node.text.trim();
  const parts = [];
  (function walk(x) {
    if (x.text) parts.push(x.text);
    for (const c of x.children) walk(c);
  })(node);
  const s = parts.join("").trim();
  return s || null;
}

function textAt(node, ...locals) {
  return textOf(descend(node, ...locals));
}

function amountAt(node, ...locals) {
  const el = descend(node, ...locals);
  if (!el) return null;
  const raw = textOf(el);
  if (raw == null || raw === "") return null;
  return { raw, currency: el.attrs.currencyID || null };
}

// ---------------------------------------------------------------------------
// UBL model extraction. Reads a parsed tree into a plain object the mappers
// consume. Party identity is registration-scheme-aware (§2 of the format brief).
// ---------------------------------------------------------------------------

const BRN_SCHEMES = ["BRN", "NRIC", "PASSPORT", "ARMY"];

function findInvoiceElement(root) {
  const known = ["Invoice", "CreditNote", "DebitNote", "SelfBilledInvoice"];
  for (const c of root.children) if (known.includes(c.local)) return c;
  return root.children[0] || null;
}

function partyName(party) {
  return textAt(party, "PartyLegalEntity", "RegistrationName") || textAt(party, "PartyName", "Name") || null;
}

function partyIdBySchemes(party, schemes) {
  for (const pi of childrenNamed(party, "PartyIdentification")) {
    const id = childNamed(pi, "ID");
    if (!id) continue;
    const scheme = String(id.attrs.schemeID || "").toUpperCase();
    if (schemes.includes(scheme)) {
      const v = textOf(id);
      if (v) return v;
    }
  }
  return null;
}

/** Extract the load-bearing UBL fields into a plain model (no numbers computed). */
export function extractUblModel(root) {
  const invoice = findInvoiceElement(root);
  if (!invoice) throw new UblParseError("bad_type", "no UBL document element found");

  const supplier = descend(invoice, "AccountingSupplierParty", "Party");
  const buyer = descend(invoice, "AccountingCustomerParty", "Party");

  const legal = descend(invoice, "LegalMonetaryTotal");
  const taxTotal = childNamed(invoice, "TaxTotal");

  const taxBreakdown = [];
  for (const sub of childrenNamed(taxTotal, "TaxSubtotal")) {
    const category = childNamed(sub, "TaxCategory");
    taxBreakdown.push({
      type: textAt(category, "ID"),
      rate: textAt(sub, "Percent") ?? textAt(category, "Percent"),
      taxable: (amountAt(sub, "TaxableAmount") || {}).raw ?? null,
      amount: (amountAt(sub, "TaxAmount") || {}).raw ?? null,
      exempt_reason: textAt(category, "TaxExemptionReason"),
    });
  }

  const lineClassifications = [];
  for (const line of childrenNamed(invoice, "InvoiceLine")) {
    const item = childNamed(line, "Item");
    for (const cc of childrenNamed(item, "CommodityClassification")) {
      const code = childNamed(cc, "ItemClassificationCode");
      if (code && String(code.attrs.listID || "").toUpperCase() === "CLASS") {
        const v = textOf(code);
        if (v) lineClassifications.push(v);
      }
    }
  }

  const typeCodeEl = childNamed(invoice, "InvoiceTypeCode");

  return {
    documentLocal: invoice.local,
    invoiceId: textAt(invoice, "ID"),
    issueDate: textAt(invoice, "IssueDate"),
    typeCode: typeCodeEl ? textOf(typeCodeEl) : null,
    listVersionId: typeCodeEl ? typeCodeEl.attrs.listVersionID || null : null,
    documentCurrency: textAt(invoice, "DocumentCurrencyCode"),
    supplier: supplier
      ? {
          name: partyName(supplier),
          tin: partyIdBySchemes(supplier, ["TIN"]),
          brn: partyIdBySchemes(supplier, BRN_SCHEMES),
        }
      : { name: null, tin: null, brn: null },
    buyer: buyer
      ? {
          name: partyName(buyer),
          tin: partyIdBySchemes(buyer, ["TIN"]),
          brn: partyIdBySchemes(buyer, BRN_SCHEMES),
        }
      : { name: null, tin: null, brn: null },
    totals: {
      taxExclusive: amountAt(legal, "TaxExclusiveAmount"),
      taxInclusive: amountAt(legal, "TaxInclusiveAmount"),
      payable: amountAt(legal, "PayableAmount"),
      prepaid: amountAt(legal, "PrepaidAmount"),
      rounding: amountAt(legal, "PayableRoundingAmount"),
    },
    taxAmount: amountAt(taxTotal, "TaxAmount"),
    taxBreakdown,
    lineClassifications,
    uuid: textAt(invoice, "UUID"),
  };
}

/** Detect a consolidated (B2C aggregate) e-invoice — a non-attributable document
 *  (§3.1): the buyer is the General Public, so it never resolves to a customer. */
export function detectConsolidated(model) {
  const buyerTin = String(model.buyer?.tin || "").replace(/\s+/g, "").toUpperCase();
  if (buyerTin === GENERAL_PUBLIC_TIN) return true;
  if (/general\s+public/i.test(String(model.buyer?.name || ""))) return true;
  if (model.lineClassifications.some((c) => String(c).trim() === "004")) return true;
  return false;
}

/** Coarse corroboration-ineligibility reason for a non-standard type code. Any
 *  non-null value blocks the DB's structured Tier-A (mirrors the OCR `credit_note`
 *  marker); the DB reads the `invoice.type_code` fact for the actual CN/DN polarity. */
function typeCodeReason(code) {
  switch (String(code)) {
    case "02":
      return "credit_note";
    case "03":
      return "debit_note";
    case "04":
      return "refund_note";
    case "11":
    case "12":
    case "13":
    case "14":
      return "self_billed";
    default:
      return null;
  }
}

/** Assert monetary elements do not mix currencies; return the single doc currency.
 *  A MIXED-currency document is a data-integrity refusal (terminal). */
function resolveCurrency(model) {
  const seen = new Set();
  const add = (a) => {
    if (a && a.currency) seen.add(String(a.currency).toUpperCase());
  };
  add(model.totals.taxExclusive);
  add(model.totals.taxInclusive);
  add(model.totals.payable);
  add(model.totals.prepaid);
  add(model.taxAmount);
  if (seen.size > 1) throw new UblParseError("bad_type", "UBL document mixes currencies across amounts");
  return (model.documentCurrency && String(model.documentCurrency).toUpperCase()) || (seen.size === 1 ? [...seen][0] : null);
}

// ---------------------------------------------------------------------------
// Signature handling: strip the enveloped XAdES block (ext:UBLExtensions +
// cac:Signature) before content-hashing, exactly as the UBL signing flow removes
// them before c14n (§3.1 / format brief §7). Coarse text-level strip (the parser
// never re-serializes) — sufficient for a stable provenance content hash.
// ---------------------------------------------------------------------------

export function stripUblSignature(xmlText) {
  return String(xmlText)
    .replace(/<([A-Za-z0-9]+:)?UBLExtensions\b[\s\S]*?<\/([A-Za-z0-9]+:)?UBLExtensions>/g, "")
    .replace(/<([A-Za-z0-9]+:)?Signature\b[\s\S]*?<\/([A-Za-z0-9]+:)?Signature>/g, "");
}

function contentHash(xmlText) {
  return createHash("sha256").update(stripUblSignature(xmlText) + "|" + MYINVOIS_NORMALIZATION_VERSION, "utf8").digest("hex");
}

// The empty-polygon honest marker for a geometry-less structured source (§3.1).
const NO_REGION = Object.freeze({ page: 1, polygon: [] });

function identityRegion(fieldPath, textContent) {
  return {
    locator_kind: "page_polygon",
    locator: { page: 1, polygon: [] },
    field_path: fieldPath,
    text_content: String(textContent),
    engine_confidence: null,
    monetary_raw: null,
    monetary_cents: null,
  };
}

// ---------------------------------------------------------------------------
// The IDENTITY pass — emits ONLY the parties' identity regions with the deliberate
// field_paths (§3.1). Returns the structured-parse region-emit shape that
// persist_document_extraction consumes ({ pageCount, envelope, regions }).
// ---------------------------------------------------------------------------

export function mapIdentityRegions(model, task = {}) {
  const regions = [];
  // Supplier identifiers ATTRIBUTE (sales supplier = the client). Names are on the
  // DB attribution allowlist; supplier_tin deliberately matches %tin%.
  if (model.supplier?.tin) regions.push(identityRegion("myinvois.supplier_tin", model.supplier.tin));
  if (model.supplier?.brn) regions.push(identityRegion("myinvois.supplier_brn", model.supplier.brn));
  // Buyer identifiers must NEVER attribute — names avoid %tin%/%ssm%/%account%.
  if (model.buyer?.tin) regions.push(identityRegion("myinvois.buyer_id_primary", model.buyer.tin));
  if (model.buyer?.brn) regions.push(identityRegion("myinvois.buyer_id_secondary", model.buyer.brn));

  const envelope = {
    schema_version: 1,
    engine: { id: task.engineId || MYINVOIS_ENGINE_ID, kind: "structured_parse", version_n: task.versionN ?? 1 },
    format: "xml",
    myinvois: {
      type_code: model.typeCode,
      list_version: model.listVersionId,
      consolidated: detectConsolidated(model),
      authority_unverified: true,
    },
  };
  return { pageCount: 1, envelope, regions };
}

// ---------------------------------------------------------------------------
// The FACTS pass — the full §3.2 vocabulary for persist_invoice_facts. Emits BOTH
// supplier (invoice.vendor_*) and buyer (invoice.customer_*) facts; the DB decides
// direction. Monetary values stay RAW (the DB owns cents / ties / rounding).
// ---------------------------------------------------------------------------

function fact(fieldPath, valueRaw) {
  return { field_path: fieldPath, value_raw: String(valueRaw), page: NO_REGION.page, polygon: NO_REGION.polygon, confidence: null };
}

export function mapFactsFields(model) {
  const currency = resolveCurrency(model);
  const out = [];
  const push = (path, value) => {
    if (value != null && String(value).trim() !== "") out.push(fact(path, value));
  };

  push("invoice.invoice_id", model.invoiceId);
  push("invoice.invoice_date", model.issueDate);
  push("invoice.type_code", model.typeCode);
  if (currency) push("invoice.currency", currency);

  // Supplier = vendor side (AP resolution / direction match).
  push("invoice.vendor_name", model.supplier?.name);
  push("invoice.vendor_registration", model.supplier?.brn ?? model.supplier?.tin);

  // Buyer = customer side (AR resolution). customer_taxid is deliberately named to
  // avoid the %tin% attribution pattern (§3.2) and lives only in invoice_facts rows.
  push("invoice.customer_name", model.buyer?.name);
  push("invoice.customer_registration", model.buyer?.brn);
  push("invoice.customer_taxid", model.buyer?.tin);

  // Monetary — RAW; the DB normalizes to cents and validates the tie.
  push("invoice.total", model.totals.taxInclusive?.raw);
  push("invoice.amount_due", model.totals.payable?.raw);
  push("invoice.total_excl_tax", model.totals.taxExclusive?.raw);
  push("invoice.tax_total", model.taxAmount?.raw);
  push("invoice.deposit", model.totals.prepaid?.raw);

  // SST breakdown — header-level v1, serialized; the DB validates Σ = tax_total.
  const breakdown = model.taxBreakdown.filter((b) => b.type != null || b.amount != null || b.taxable != null);
  if (breakdown.length > 0) push("invoice.tax_breakdown", JSON.stringify(breakdown));

  // Envelope provenance — recorded authority-unverified (no API check this wave).
  push("invoice.myinvois_uuid", model.uuid);

  return out;
}

function factsEnvelope(model) {
  const isConsolidated = detectConsolidated(model);
  const currency = (model.documentCurrency && String(model.documentCurrency).toUpperCase()) || null;
  let ineligible = null;
  if (isConsolidated) ineligible = "consolidated";
  else if (model.typeCode && model.typeCode !== "01") ineligible = typeCodeReason(model.typeCode);
  else if (currency && currency !== "MYR") ineligible = "non_myr";
  const envelope = {
    myinvois: { type_code: model.typeCode, list_version: model.listVersionId, consolidated: isConsolidated, authority_unverified: true },
  };
  if (ineligible) envelope.corroboration_ineligible = ineligible;
  return envelope;
}

// ---------------------------------------------------------------------------
// Worker entry points — parse a raw XML string and return the pass-appropriate
// result. Called from the worker thread (structured-worker.mjs) so a large/hostile
// XML parse never blocks the supervisor event loop.
// ---------------------------------------------------------------------------

/** IDENTITY pass: XML text → { pageCount, envelope, regions }. */
export function parseUblIdentity(xmlText, task = {}) {
  const model = extractUblModel(parseXml(xmlText));
  return mapIdentityRegions(model, task);
}

/** FACTS pass: XML text → { fields, rawSha256, normalizationVersion, pagesUsed, envelope }.
 *  Engine-agnostic: persist_invoice_facts stamps engine_id from the task row, not from here. */
export function parseUblFacts(xmlText) {
  const model = extractUblModel(parseXml(xmlText));
  const fields = mapFactsFields(model);
  return {
    fields,
    rawSha256: contentHash(xmlText),
    normalizationVersion: MYINVOIS_NORMALIZATION_VERSION,
    pagesUsed: 1,
    envelope: factsEnvelope(model),
  };
}
