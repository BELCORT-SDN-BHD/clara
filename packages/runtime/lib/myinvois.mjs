// The MyInvois UBL e-invoice engine (Wave A2, contract §3 / migration 0015 companion).
// A LOCAL, deterministic, NO-EGRESS structured engine (engine id `clara-myinvois:v1`).
// The XML parse + schema boundary lives in `./myinvois-ubl.mjs` (FIX-7): raw XML is
// parsed with the hardened `fast-xml-parser` and VALIDATED as a well-formed, correctly-
// namespaced, approved-type/version, correctly-shaped MyInvois UBL invoice BEFORE any
// fact or identity region is emitted — anything else throws UblParseError and the worker
// fails the task cleanly (NEEDS YOU), never trusted facts.
//
// This module is the two-extraction MAPPER (§3.1):
//   * The IDENTITY pass (engine_kind='structured_parse', lane='structured_parse') runs in
//     the frozen documentIngest lane and emits ONLY the parties' identity regions with
//     deliberate field_paths — `myinvois.supplier_tin`/`supplier_brn` attribute (the sales
//     supplier IS the client), `myinvois.buyer_id_*` never match %tin%/%ssm%/%account%.
//     A CONSOLIDATED (B2C aggregate) document emits NO attribution-bearing regions at all
//     (FIX-8) — it must never resolve to a client, so it routes to NEEDS YOU.
//   * The FACTS pass (engine_kind='invoice_facts', lane='local_facts') runs on the new
//     non-frozen local_facts consumer's worker and emits the full §3.2 vocabulary
//     (supplier + buyer + totals + rounding + tax breakdown) for persist_invoice_facts.
//
// CARDINAL: the mapper NEVER computes a number — every monetary value is emitted as
// `value_raw` byte-for-byte and the DB owns cents / ties / rounding. Geometry is honest
// (page:1, polygon:[]). Direction is DB-determined (§3.3): both supplier (`invoice.vendor_*`)
// and buyer (`invoice.customer_*`) facts are emitted; this mapper never asserts a side.

import { createHash } from "node:crypto";
import { parseXml, extractUblModel, detectConsolidated, resolveCurrency, UblParseError, GENERAL_PUBLIC_TIN } from "./myinvois-ubl.mjs";

// Re-export the parse/model layer so callers and tests keep one import surface.
export { parseXml, extractUblModel, detectConsolidated, UblParseError, GENERAL_PUBLIC_TIN };

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
 *  below changes across a DEPLOYED boundary. v1 (Wave A2): the first MyInvois UBL facts
 *  mapping — supplier/buyer identity, totals, PayableRoundingAmount, SST tax breakdown,
 *  type_code, envelope provenance. */
export const MYINVOIS_NORMALIZATION_VERSION = "clara-myinvois-norm:v1";

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

// ---------------------------------------------------------------------------
// Signature handling: strip the enveloped XAdES block (ext:UBLExtensions +
// cac:Signature) before content-hashing, exactly as the UBL signing flow removes them
// before c14n (§3.1 / format brief §7). Coarse text-level strip — sufficient for a
// stable provenance content hash (the parser never re-serializes).
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
  const isConsolidated = detectConsolidated(model);
  const regions = [];
  // FIX-8: a CONSOLIDATED (B2C aggregate) document is non-attributable by construction —
  // its buyer is the General Public and there is no per-buyer client to resolve. Emit NO
  // attribution-bearing regions so it can never auto-attribute a client; the document
  // routes to NEEDS YOU (the DB attribution CTE finds no identity region → it abstains).
  // The `consolidated` envelope marker keeps the task legible.
  if (!isConsolidated) {
    // Supplier identifiers ATTRIBUTE (sales supplier = the client). Names are on the
    // DB attribution allowlist; supplier_tin deliberately matches %tin%.
    if (model.supplier?.tin) regions.push(identityRegion("myinvois.supplier_tin", model.supplier.tin));
    if (model.supplier?.brn) regions.push(identityRegion("myinvois.supplier_brn", model.supplier.brn));
    // Buyer identifiers must NEVER attribute — names avoid %tin%/%ssm%/%account%.
    if (model.buyer?.tin) regions.push(identityRegion("myinvois.buyer_id_primary", model.buyer.tin));
    if (model.buyer?.brn) regions.push(identityRegion("myinvois.buyer_id_secondary", model.buyer.brn));
  }

  const envelope = {
    schema_version: 1,
    engine: { id: task.engineId || MYINVOIS_ENGINE_ID, kind: "structured_parse", version_n: task.versionN ?? 1 },
    format: "xml",
    myinvois: {
      type_code: model.typeCode,
      list_version: model.listVersionId,
      consolidated: isConsolidated,
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
  // FIX-9: the rounding adjustment (PayableRoundingAmount) so the DB tie can enforce
  // net + tax + rounding = gross. RAW — the DB owns the sign/cents.
  push("invoice.rounding", model.totals.rounding?.raw);

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
// Worker entry points — parse a raw XML string and return the pass-appropriate result.
// Called from the worker thread (structured-worker.mjs) so a large/hostile XML parse
// never blocks the supervisor event loop. A document that is not a well-formed,
// correctly-namespaced MyInvois UBL invoice throws UblParseError — the worker turns that
// into a clean task failure (NEEDS YOU), never trusted facts.
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
