// MyInvois UBL parse + schema boundary (Wave A2, contract §3 / migration 0015 companion).
//
// This module is the SCHEMA BOUNDARY (FIX-7): raw XML → a validated MyInvois UBL model,
// or a terminal refusal. It parses with the hardened, well-tested `fast-xml-parser` and
// then VALIDATES the document as a MyInvois UBL invoice BEFORE any caller can read a fact.
// A document is REFUSED (UblParseError `bad_type` → the worker fails the task cleanly /
// routes to NEEDS YOU, never trusted facts) unless it is:
//   (a) well-formed XML (mismatched/unclosed tags rejected by the validator),
//   (b) correctly namespaced — matched by NAMESPACE URI, not prefix spelling (XML prefixes
//       are arbitrary): the document element is in its exact UBL document namespace and the
//       cbc/cac (and ext) URIs are each bound to SOME prefix (which may be `b`/`a`/anything);
//       a document that uses the right prefixes bound to the WRONG URIs is refused, and a
//       nested rebinding of a resolved prefix to a hostile URI is refused,
//   (c) an APPROVED, POLARITY-bound document type — the root's own type-code element (no
//       cross-root fallback) carrying an approved MyInvois code (01/02/03/04/11-14) valid
//       for that root, plus an approved version (listVersionID 1.0 / 1.1), and
//   (d) shaped with the mandatory cardinalities (single LegalMonetaryTotal with its three
//       mandatory totals, a single header TaxTotal/TaxAmount, both parties, a single ID).
// DOCTYPE/ENTITY are refused up front and entity processing is disabled (XXE defence in
// depth). CARDINAL: the parser NEVER coerces a monetary value into a number — every value
// stays byte-exact text (`value_raw`) and the DB owns cents / ties / rounding.

import { XMLParser, XMLValidator } from "fast-xml-parser";

export class UblParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "UblParseError";
    this.code = code;
  }
}

/** The MyInvois General TIN used on a CONSOLIDATED (B2C aggregate) e-invoice — the buyer
 *  is "General Public", never a resolvable customer counterparty (§3 / G-format §3). */
export const GENERAL_PUBLIC_TIN = "EI00000000010";

// The UBL namespace boundary. A trusted MyInvois invoice binds these exact URIs; anything
// else is refused so an attacker-namespaced <Invoice>/<TaxTotal> can never be trusted.
const UBL_NS = Object.freeze({
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
});

// Approved UBL document elements → the exact document namespace each must be bound to.
const DOCUMENT_NS = Object.freeze({
  Invoice: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  CreditNote: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
  DebitNote: "urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2",
});

// The type-code element per document root (RESIDUAL-6b): MyInvois models every e-invoice
// type (01/02/03/04/11-14) on an `Invoice` root carrying `cbc:InvoiceTypeCode`; the
// CreditNote/DebitNote UBL roots (if ever used) carry their OWN note-type element. A
// document is bound to its root's element — there is NO cross-root fallback, so a
// CreditNote root can never present a `cbc:InvoiceTypeCode` and pass as a standard invoice.
const TYPE_CODE_ELEMENT = Object.freeze({
  Invoice: "cbc:InvoiceTypeCode",
  CreditNote: "cbc:CreditNoteTypeCode",
  DebitNote: "cbc:DebitNoteTypeCode",
});

// The approved type codes each root may carry (RESIDUAL-6b/c, G-brief §2 code table):
// POLARITY-bound to the root and drawn from the approved set — an unknown code, or a code
// whose polarity contradicts the root, is refused before any fact is emitted.
const ROOT_TYPE_CODES = Object.freeze({
  Invoice: new Set(["01", "02", "03", "04", "11", "12", "13", "14"]),
  CreditNote: new Set(["02", "12"]),
  DebitNote: new Set(["03", "13"]),
});

// The MyInvois e-invoice UBL versions currently accepted (§1 of the format brief).
const APPROVED_LIST_VERSIONS = new Set(["1.0", "1.1"]);

const BRN_SCHEMES = ["BRN", "NRIC", "PASSPORT", "ARMY"];

function splitName(raw) {
  const s = String(raw);
  const i = s.indexOf(":");
  return i < 0 ? { prefix: "", local: s } : { prefix: s.slice(0, i), local: s.slice(i + 1) };
}

const XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false, // keep cbc:/cac:/ext: prefixes so the namespace binding is checkable
  parseTagValue: false, // CARDINAL: never coerce a value into a number — value_raw stays byte-exact
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false, // XXE defence in depth (no entity expansion)
  ignoreDeclaration: true,
  ignorePiTags: true, // drop <?xml-stylesheet?> / other PIs (no active-content foothold)
  allowBooleanAttributes: false,
});

/** Parse an XML string into the fast-xml-parser document object. Throws UblParseError
 *  ('bad_type') on a DOCTYPE/ENTITY declaration or any well-formedness error. The returned
 *  object's single element key is the document root. NAMESPACE-correctness (matched by URI)
 *  and the MyInvois schema shape are enforced later, in `validateUblDocument`. */
export function parseXml(text) {
  const raw = String(text);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(raw)) {
    throw new UblParseError("bad_type", "XML DOCTYPE/ENTITY declarations are forbidden");
  }
  const verdict = XMLValidator.validate(raw, { allowBooleanAttributes: false });
  if (verdict !== true) {
    const msg = verdict && verdict.err ? verdict.err.msg : "malformed XML";
    throw new UblParseError("bad_type", `XML is not well-formed: ${msg}`);
  }
  return XML_PARSER.parse(raw);
}

// --- object-tree query helpers (fast-xml-parser output shape) ---------------

function first(x) {
  return Array.isArray(x) ? x[0] : x;
}

function child(node, name) {
  if (node == null || typeof node !== "object") return null;
  const v = node[name];
  return v === undefined ? null : first(v);
}

function children(node, name) {
  if (node == null || typeof node !== "object") return [];
  const v = node[name];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function descend(node, ...names) {
  let cur = node;
  for (const n of names) {
    cur = child(cur, n);
    if (cur == null) return null;
  }
  return cur;
}

function txt(node) {
  if (node == null) return null;
  if (typeof node === "string") {
    const s = node.trim();
    return s || null;
  }
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node === "object") {
    const t = node["#text"];
    if (t == null) return null;
    const s = String(t).trim();
    return s || null;
  }
  return null;
}

function txtAt(node, ...names) {
  return txt(descend(node, ...names));
}

function attrOf(node, attr) {
  return node && typeof node === "object" ? node[attr] ?? null : null;
}

// A well-formed monetary decimal string: an optional sign, integer digits, and an optional
// fractional part. No thousands separators, no scientific notation, no bare `.` / trailing `.`.
const MONETARY_DECIMAL = /^-?\d+(?:\.\d+)?$/;

function amountAt(node, name, { required = false } = {}) {
  const el = descend(node, name);
  const raw = el == null ? null : txt(el);
  if (raw == null || raw === "") {
    // FIX-7a: a MANDATORY monetary element that is absent OR present-but-EMPTY (blank /
    // whitespace-only) is a terminal refusal — it must never be silently coerced to a trusted
    // NULL fact and skipped. An OPTIONAL amount that is absent/empty is a legitimate NULL
    // (PrepaidAmount, PayableRoundingAmount, a subtotal amount).
    if (required) {
      throw new UblParseError("bad_type", `mandatory monetary value (${name}) is missing or empty`);
    }
    return null;
  }
  // FIX-6c: a PRESENT monetary value must be a well-formed numeric decimal string. We validate
  // the SHAPE only and keep `raw` byte-exact — the DB still owns cents/ties (never reformat or
  // compute here). A non-numeric amount (`1,060.00`, `N/A`, `1e3`) is a terminal refusal.
  if (!MONETARY_DECIMAL.test(raw)) {
    throw new UblParseError("bad_type", `monetary value '${raw}' (${name}) is not a well-formed decimal`);
  }
  return { raw, currency: attrOf(el, "@_currencyID") };
}

// --- structural validation (FIX-7): a document is a MyInvois UBL invoice or it is refused

function documentElementKeys(doc) {
  if (!doc || typeof doc !== "object") return [];
  return Object.keys(doc).filter((k) => !k.startsWith("@_") && !k.startsWith("#") && !k.startsWith("?"));
}

function requireSingle(node, name, label) {
  if (node == null || typeof node !== "object" || node[name] === undefined) {
    throw new UblParseError("bad_type", `MyInvois document missing ${label}`);
  }
  if (Array.isArray(node[name])) {
    throw new UblParseError("bad_type", `MyInvois document has more than one ${label}`);
  }
  return node[name];
}

// --- namespace resolution + canonicalization (RESIDUAL-5 / FIX-5: match by URI, not prefix) ---
//
// XML namespace prefixes are ARBITRARY — a legitimate UBL invoice may bind the UBL URIs to
// `b`/`a`/anything, and an attacker may spell a prefix `cbc` yet bind it to a HOSTILE URI.
// The namespace identity of an element is therefore its RESOLVED URI, never the literal
// prefix string. We walk the parsed tree tracking the in-scope prefix→URI bindings and
// canonicalize STRICTLY by resolved URI:
//   * an element whose prefix resolves to a trusted UBL URI (cbc/cac/ext) is rewritten to
//     that canonical prefix — so a key named `cbc:X` is GUARANTEED to come only from the real
//     cbc URI (a decoy `xmlns:b=<real cbc>` + `xmlns:cbc=<hostile>` can no longer collide);
//   * an element whose URI is NOT trusted (hostile / undeclared / default namespace) is
//     DROPPED — it can never occupy a trusted canonical key;
//   * two aliases bound to the SAME trusted URI that supply the same local name are ARRAYED,
//     so a header singleton duplicated under two prefixes still trips requireSingle;
//   * a LITERAL trusted prefix (`cbc`/`cac`/`ext`) bound — at ANY depth — to a URI other than
//     its own is REFUSED outright (defeats the decoy collision and nested hostile rebinding).

// Canonical prefix keyed by the exact trusted UBL URI (the ONLY way an element earns one).
const CANON_BY_URI = new Map([
  [UBL_NS.cbc, "cbc"],
  [UBL_NS.cac, "cac"],
  [UBL_NS.ext, "ext"],
]);

// A literal trusted prefix, if declared, MUST be bound to its own URI. Refusing otherwise
// closes the decoy-prefix collision (`xmlns:cbc="urn:attacker"`) and any nested rebinding.
const RESERVED_PREFIX_URI = new Map([
  ["cbc", UBL_NS.cbc],
  ["cac", UBL_NS.cac],
  ["ext", UBL_NS.ext],
]);

/** Collect the xmlns declarations ON a node into Map(prefix→URI) ("" = the default ns),
 *  REFUSING any binding of a reserved trusted prefix (cbc/cac/ext) to a non-matching URI. */
function ownBindings(node) {
  const own = new Map();
  if (node == null || typeof node !== "object" || Array.isArray(node)) return own;
  for (const key of Object.keys(node)) {
    let prefix;
    if (key === "@_xmlns") prefix = "";
    else if (key.startsWith("@_xmlns:")) prefix = key.slice("@_xmlns:".length);
    else continue;
    const uri = String(node[key]);
    const reserved = RESERVED_PREFIX_URI.get(prefix);
    if (reserved !== undefined && uri !== reserved) {
      throw new UblParseError(
        "bad_type",
        `namespace prefix '${prefix}' is reserved for the UBL ${prefix} namespace and cannot be bound to '${uri}'`,
      );
    }
    own.set(prefix, uri);
  }
  return own;
}

/** Merge a canonicalized child into `out`, ARRAYING same-canonical-key siblings that arrived
 *  under different aliases (RESIDUAL-6a) so single-cardinality checks still see the duplicate
 *  rather than silently overwriting the first. */
function mergeChild(out, key, val) {
  if (!(key in out)) {
    out[key] = val;
    return;
  }
  const existing = Array.isArray(out[key]) ? out[key] : [out[key]];
  const incoming = Array.isArray(val) ? val : [val];
  out[key] = existing.concat(incoming);
}

/** Rewrite an element-instance value by RESOLVED namespace URI. `scope` is the in-scope
 *  prefix→URI map that ALREADY includes this element's own declarations. Each child instance
 *  is resolved against `scope` overlaid with that instance's own xmlns declarations (an
 *  element's own decls are in scope for resolving its OWN name); untrusted-URI children are
 *  dropped, trusted-URI children are canonicalized (and same-URI same-local aliases arrayed),
 *  and reserved-prefix rebindings are refused during binding collection. */
function canonicalizeElement(value, scope) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith("@_") || key.startsWith("#") || key.startsWith("?")) {
      out[key] = val; // attributes / text / PI preserved byte-exact
      continue;
    }
    const { prefix, local } = splitName(key);
    const instances = Array.isArray(val) ? val : [val];
    for (const inst of instances) {
      const childScope = new Map(scope);
      for (const [p, u] of ownBindings(inst)) childScope.set(p, u);
      const uri = childScope.get(prefix);
      const canon = uri === undefined ? undefined : CANON_BY_URI.get(uri);
      if (canon === undefined) continue; // not a trusted UBL element — drop (never a canonical key)
      mergeChild(out, `${canon}:${local}`, canonicalizeElement(inst, childScope));
    }
  }
  return out;
}

/** Validate the parsed object is a well-namespaced (by URI), approved-type, correctly-shaped
 *  MyInvois UBL invoice. Returns the CANONICALIZED document element node + metadata, or
 *  throws UblParseError('bad_type'). */
function validateUblDocument(doc) {
  const keys = documentElementKeys(doc);
  if (keys.length !== 1) {
    throw new UblParseError("bad_type", `expected exactly one root element, found ${keys.length}`);
  }
  const rootKey = keys[0];
  const rootVal = doc[rootKey];
  if (Array.isArray(rootVal)) throw new UblParseError("bad_type", "multiple document elements");
  const rootNode = rootVal;
  if (!rootNode || typeof rootNode !== "object") throw new UblParseError("bad_type", "empty document element");

  const { prefix: rootPrefix, local } = splitName(rootKey);
  const docNs = DOCUMENT_NS[local];
  if (!docNs) throw new UblParseError("bad_type", `unsupported document element '${rootKey}'`);

  // Resolve namespaces by URI (prefixes are arbitrary). `ownBindings` also enforces that no
  // reserved trusted prefix is bound to a non-matching URI at the root. The document element
  // must be in its exact UBL document namespace, and cbc/cac must each be bound to their exact
  // UBL URI by SOME prefix; ext is optional (only the signature envelope uses it).
  const rootScope = ownBindings(rootNode);
  if (rootScope.get(rootPrefix) !== docNs) {
    throw new UblParseError("bad_type", `document element '${rootKey}' is not bound to the UBL ${local} namespace`);
  }
  const boundUris = new Set(rootScope.values());
  if (!boundUris.has(UBL_NS.cbc)) {
    throw new UblParseError("bad_type", "the UBL CommonBasicComponents-2 (cbc) namespace is not bound");
  }
  if (!boundUris.has(UBL_NS.cac)) {
    throw new UblParseError("bad_type", "the UBL CommonAggregateComponents-2 (cac) namespace is not bound");
  }

  // Canonicalize to cbc/cac/ext STRICTLY by resolved URI (untrusted-URI elements dropped,
  // reserved-prefix rebindings refused at any depth); every check below reads canonical keys.
  const node = canonicalizeElement(rootNode, rootScope);

  // Document type-code — STRICTLY the element for this root (no cross-root fallback), a
  // single element, an APPROVED code, and POLARITY-bound to the root — plus an approved
  // MyInvois version.
  const typeCodeEl = requireSingle(node, TYPE_CODE_ELEMENT[local], `a document type code (${TYPE_CODE_ELEMENT[local]})`);
  const typeCode = txt(typeCodeEl);
  if (!typeCode) throw new UblParseError("bad_type", "empty document type code");
  if (!ROOT_TYPE_CODES[local].has(typeCode)) {
    throw new UblParseError("bad_type", `type code '${typeCode}' is not a valid MyInvois type for a ${local} document`);
  }
  const listVersionId = attrOf(typeCodeEl, "@_listVersionID");
  if (!listVersionId || !APPROVED_LIST_VERSIONS.has(String(listVersionId))) {
    throw new UblParseError("bad_type", `unsupported MyInvois e-invoice version '${listVersionId ?? ""}'`);
  }

  // Mandatory element cardinalities (§2). A structurally-incomplete document — or one with
  // duplicated header singletons (e.g. >1 TaxTotal) — is refused rather than partially
  // trusted or silently deduplicated.
  // FIX-7a: the invoice number is present, single, AND non-empty — a blank cbc:ID is refused,
  // never trusted as a present-but-absent identifier (extraction reads it as an invoice fact).
  const invoiceIdEl = requireSingle(node, "cbc:ID", "an invoice number (cbc:ID)");
  if (txt(invoiceIdEl) == null) {
    throw new UblParseError("bad_type", "MyInvois document has an empty invoice number (cbc:ID)");
  }
  const legal = requireSingle(node, "cac:LegalMonetaryTotal", "LegalMonetaryTotal");
  requireSingle(legal, "cbc:TaxExclusiveAmount", "TaxExclusiveAmount");
  requireSingle(legal, "cbc:TaxInclusiveAmount", "TaxInclusiveAmount");
  requireSingle(legal, "cbc:PayableAmount", "PayableAmount");
  const taxTotal = requireSingle(node, "cac:TaxTotal", "a single header TaxTotal");
  // FIX-6b: the header total TaxAmount must be present AND single (was `child`, which silently
  // accepted a duplicated TaxAmount and read only the first).
  requireSingle(taxTotal, "cbc:TaxAmount", "a single total TaxAmount in the header TaxTotal");
  // FIX-7b: exactly ONE supplier and ONE buyer — a genuine invoice has a single accounting
  // party of each side with a single cac:Party inside. Duplicated party elements are REFUSED
  // (was `child`/`descend` first-selection, which silently trusted the first of several).
  const supplierParty = requireSingle(node, "cac:AccountingSupplierParty", "the supplier party (cac:AccountingSupplierParty)");
  requireSingle(supplierParty, "cac:Party", "a single supplier cac:Party");
  const customerParty = requireSingle(node, "cac:AccountingCustomerParty", "the buyer party (cac:AccountingCustomerParty)");
  requireSingle(customerParty, "cac:Party", "a single buyer cac:Party");

  return { node, localName: local, typeCode, listVersionId: String(listVersionId) };
}

// --- model extraction (party identity is registration-scheme-aware, §2) -----

function partyName(party) {
  return txtAt(party, "cac:PartyLegalEntity", "cbc:RegistrationName") || txtAt(party, "cac:PartyName", "cbc:Name") || null;
}

function partyIdBySchemes(party, schemes) {
  for (const pi of children(party, "cac:PartyIdentification")) {
    const id = child(pi, "cbc:ID");
    if (!id) continue;
    const scheme = String(attrOf(id, "@_schemeID") || "").toUpperCase();
    if (schemes.includes(scheme)) {
      const v = txt(id);
      if (v) return v;
    }
  }
  return null;
}

/** Extract the load-bearing UBL fields into a plain model (no numbers computed). Throws
 *  UblParseError('bad_type') if the document is not a well-formed, correctly-namespaced,
 *  approved-shape MyInvois UBL invoice. */
export function extractUblModel(doc) {
  const { node: invoice, localName, typeCode, listVersionId } = validateUblDocument(doc);

  const supplier = descend(invoice, "cac:AccountingSupplierParty", "cac:Party");
  const buyer = descend(invoice, "cac:AccountingCustomerParty", "cac:Party");
  const legal = child(invoice, "cac:LegalMonetaryTotal");
  const taxTotal = child(invoice, "cac:TaxTotal");

  const taxBreakdown = [];
  for (const sub of children(taxTotal, "cac:TaxSubtotal")) {
    const category = child(sub, "cac:TaxCategory");
    taxBreakdown.push({
      type: txtAt(category, "cbc:ID"),
      rate: txtAt(sub, "cbc:Percent") ?? txtAt(category, "cbc:Percent"),
      taxable: (amountAt(sub, "cbc:TaxableAmount") || {}).raw ?? null,
      amount: (amountAt(sub, "cbc:TaxAmount") || {}).raw ?? null,
      exempt_reason: txtAt(category, "cbc:TaxExemptionReason"),
    });
  }

  const lineClassifications = [];
  for (const line of children(invoice, "cac:InvoiceLine")) {
    const item = child(line, "cac:Item");
    for (const cc of children(item, "cac:CommodityClassification")) {
      const code = child(cc, "cbc:ItemClassificationCode");
      if (code && String(attrOf(code, "@_listID") || "").toUpperCase() === "CLASS") {
        const v = txt(code);
        if (v) lineClassifications.push(v);
      }
    }
  }

  return {
    documentLocal: localName,
    invoiceId: txtAt(invoice, "cbc:ID"),
    issueDate: txtAt(invoice, "cbc:IssueDate"),
    typeCode,
    listVersionId,
    documentCurrency: txtAt(invoice, "cbc:DocumentCurrencyCode"),
    supplier: supplier
      ? { name: partyName(supplier), tin: partyIdBySchemes(supplier, ["TIN"]), brn: partyIdBySchemes(supplier, BRN_SCHEMES) }
      : { name: null, tin: null, brn: null },
    buyer: buyer
      ? { name: partyName(buyer), tin: partyIdBySchemes(buyer, ["TIN"]), brn: partyIdBySchemes(buyer, BRN_SCHEMES) }
      : { name: null, tin: null, brn: null },
    totals: {
      // FIX-7a: the three LegalMonetaryTotal amounts are mandatory — an absent/empty one is a
      // terminal refusal, not a NULL fact. Prepaid + rounding are genuinely optional.
      taxExclusive: amountAt(legal, "cbc:TaxExclusiveAmount", { required: true }),
      taxInclusive: amountAt(legal, "cbc:TaxInclusiveAmount", { required: true }),
      payable: amountAt(legal, "cbc:PayableAmount", { required: true }),
      prepaid: amountAt(legal, "cbc:PrepaidAmount"),
      rounding: amountAt(legal, "cbc:PayableRoundingAmount"),
    },
    taxAmount: amountAt(taxTotal, "cbc:TaxAmount", { required: true }),
    taxBreakdown,
    lineClassifications,
    uuid: txtAt(invoice, "cbc:UUID"),
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

/** Assert monetary elements do not mix currencies; return the single doc currency.
 *  A MIXED-currency document is a data-integrity refusal (terminal). */
export function resolveCurrency(model) {
  const seen = new Set();
  const add = (a) => {
    if (a && a.currency) seen.add(String(a.currency).toUpperCase());
  };
  add(model.totals.taxExclusive);
  add(model.totals.taxInclusive);
  add(model.totals.payable);
  add(model.totals.prepaid);
  add(model.totals.rounding);
  add(model.taxAmount);
  if (seen.size > 1) throw new UblParseError("bad_type", "UBL document mixes currencies across amounts");
  return (model.documentCurrency && String(model.documentCurrency).toUpperCase()) || (seen.size === 1 ? [...seen][0] : null);
}
