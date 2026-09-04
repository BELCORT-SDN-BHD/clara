// The documents-viewer walk's own mock lane — a file-disjoint sibling of
// `chat-parity-mock.mjs` and `agentic-finish-mock.mjs`, consulted by
// `serve-built.mjs` through two hooks (Supabase, and the runtime chain for the
// document-bytes route), exactly the shape those two already take.
//
// EVERY HANDLER IS ID-SCOPED and falls through otherwise, so this lane cannot
// starve another walk's fixtures in either direction. Its client id, document
// id and extraction id are distinct from every id in the two sibling lanes and
// from `serve-built.mjs`'s own CLIENT_A/CLIENT_B.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle, the real
// same-origin runtime proxy, the real proxy auth gate and every line of client
// code under test are REAL — including `fetchDocumentBytes`, the
// `VIEWABLE_IN_NEW_TAB` gate and `openDocumentInNewTab`'s whole branch logic.
// What is faked is what sits behind them: PostgREST's reads and RPCs, and the
// runtime's byte stream. So this walk proves the JOURNEY and the client's own
// wire shapes. It proves nothing about whether Postgres would accept them.
//
// THE TWO DOCUMENTS EXIST TO BE DIFFERENT TYPES, and that IS the walk:
//   * `DOC_PDF` is `application/pdf` — the viewer gate ADMITS it, so a tab
//     opens and is navigated to a blob: URL.
//   * `DOC_XML` is `application/xml` — an e-invoice, the exact shape C-07 /
//     裁-175 is about. The gate REFUSES it: no tab is navigated, the blob is
//     revoked, and the face renders the honest reason.

export const DOCS = {
  clientId: "d0c0d0c0-1111-4111-8111-111111111111",
  firmId: "33333333-3333-3333-3333-333333333333",
  subject: "11111111-1111-1111-1111-111111111111",
  docPdf: "d0cd0cd0-1111-4111-8111-111111111111",
  docXml: "d0cd0cd0-2222-4222-8222-222222222222",
  filingPdf: "f11117d0-1111-4111-8111-111111111111",
  filingXml: "f11117d0-2222-4222-8222-222222222222",
  extraction: "e0e0e0e0-1111-4111-8111-111111111111",
  regionTotal: "4e610011-1111-4111-8111-111111111111",
  regionVendor: "4e610011-2222-4222-8222-222222222222",
  regionLine: "4e610011-3333-4333-8333-333333333333",
  regionBroken: "4e610011-4444-4444-8444-444444444444",
  attempt: "a77e0011-1111-4111-8111-111111111111",
  candidate: "ca4d0011-1111-4111-8111-111111111111",
};

/** A one-page A4-ish envelope in the producer's OWN shape
 *  (packages/runtime/lib/egress.mjs:174-181): `pages[]` carries
 *  page_number/width/height/unit, which is the ONLY source of a scale for the
 *  overlay. Written here as real data rather than a stub so the walk exercises
 *  the arm where geometry IS derivable. */
const ENVELOPE = {
  schema_version: 1,
  engine: { id: "azure-di:prebuilt-layout:2024-11-30", kind: "ocr", version_n: 1 },
  // LONG ON PURPOSE. A real envelope runs to the read's full 20,000-character
  // budget, and the raw-envelope block is a capped `max-h-96 overflow-auto`
  // <pre> — with a three-line fixture it never overflows, so axe's
  // `scrollable-region-focusable` rule has nothing to fire on and the walk's
  // a11y cell silently proved nothing about it. The fold's mutant panel is what
  // exposed that: removing the pre's `tabIndex` left the axe cell GREEN.
  content: ["INVOICE", "Acme Sdn Bhd", "Total RM 1,234.50"]
    .concat(Array.from({ length: 400 }, (_, i) => `line ${i + 1}: an extracted line of page text, long enough that the raw envelope is a real scroll region`))
    .join("\n"),
  pages: [{ page_number: 1, width: 8.5, height: 11, unit: "inch" }],
  tables: [],
};

const REGIONS = [
  {
    idx: 0, id: DOCS.regionTotal, extraction_id: DOCS.extraction, engine_kind: "ocr", version_n: 1,
    extracted_at: "2026-04-01T00:00:02.000Z", locator_kind: "page_polygon",
    locator: { page: 1, page_number: 1, polygon: [5.2, 8.1, 7.6, 8.1, 7.6, 8.45, 5.2, 8.45] },
    field_path: "invoice.total", text_content: "RM 1,234.50", engine_confidence: 0.973,
    monetary_raw: "1234.50", monetary_cents: 123450,
  },
  {
    idx: 1, id: DOCS.regionVendor, extraction_id: DOCS.extraction, engine_kind: "ocr", version_n: 1,
    extracted_at: "2026-04-01T00:00:02.000Z", locator_kind: "page_polygon",
    locator: { page: 1, page_number: 1, polygon: [0.8, 1.2, 3.9, 1.2, 3.9, 1.6, 0.8, 1.6] },
    field_path: "invoice.vendor_name", text_content: "Acme Sdn Bhd", engine_confidence: 0.941,
    monetary_raw: null, monetary_cents: null,
  },
  {
    idx: 2, id: DOCS.regionLine, extraction_id: DOCS.extraction, engine_kind: "ocr", version_n: 1,
    extracted_at: "2026-04-01T00:00:02.000Z", locator_kind: "page_polygon",
    locator: { page: 1, page_number: 1, polygon: [0.8, 0.5, 2.4, 0.5, 2.4, 0.9, 0.8, 0.9] },
    field_path: "pages.1.lines.0", text_content: "INVOICE", engine_confidence: 0.998,
    monetary_raw: null, monetary_cents: null,
  },
  {
    // MALFORMED GEOMETRY, on purpose. Three numbers is not a ring; the overlay
    // must SKIP it and still draw the other three. `locator` is free jsonb, so
    // this is a reachable shape, not a hypothetical.
    idx: 3, id: DOCS.regionBroken, extraction_id: DOCS.extraction, engine_kind: "ocr", version_n: 1,
    extracted_at: "2026-04-01T00:00:02.000Z", locator_kind: "page_polygon",
    locator: { page: 1, polygon: [1, 2, 3] },
    field_path: "pages.1.lines.1", text_content: "Acme Sdn Bhd", engine_confidence: 0.9,
    monetary_raw: null, monetary_cents: null,
  },
];

const DOC_ROWS = {
  [DOCS.docPdf]: {
    id: DOCS.docPdf, sha256: "a".repeat(64), original_filename: "invoice-april.pdf",
    mime_type: "application/pdf", byte_size: 20480, storage_path: "docs/pdf", uploaded_by: DOCS.subject,
    created_at: "2026-04-01T00:00:00.000Z", bytes_verified_at: "2026-04-01T00:00:01.000Z",
    page_count: 1, extraction_status: "done", document_kind: "invoice", financial_date: "2026-04-01",
    retention_state: "unanchored", retain_until: null, retention_basis: null,
    legal_hold: false, legal_hold_reason: null,
  },
  [DOCS.docXml]: {
    id: DOCS.docXml, sha256: "b".repeat(64), original_filename: "myinvois-e-invoice.xml",
    mime_type: "application/xml", byte_size: 4096, storage_path: "docs/xml", uploaded_by: DOCS.subject,
    created_at: "2026-04-02T00:00:00.000Z", bytes_verified_at: "2026-04-02T00:00:01.000Z",
    page_count: null, extraction_status: "stored_unparsed", document_kind: "e_invoice_xml",
    financial_date: "2026-04-02", retention_state: "unanchored", retain_until: null,
    retention_basis: null, legal_hold: false, legal_hold_reason: null,
  },
};

const FILINGS = [
  {
    id: DOCS.filingPdf, document_id: DOCS.docPdf, client_id: DOCS.clientId,
    filed_at: "2026-04-02T09:00:00.000Z", filed_by: DOCS.subject, basis: "human",
    retired_at: null, retirement_reason: null, revision_token: "rev-pdf-1",
  },
  {
    id: DOCS.filingXml, document_id: DOCS.docXml, client_id: DOCS.clientId,
    filed_at: "2026-04-03T09:00:00.000Z", filed_by: DOCS.subject, basis: "human",
    retired_at: null, retirement_reason: null, revision_token: "rev-xml-1",
  },
];

/** THE ONE PIECE OF MUTABLE STATE: whether the open attribution candidate is
 *  still open. `confirm_attribution_candidate` disposes it, and the walk's
 *  confirm-and-file leg asserts the "Needs your confirmation" cell re-read and
 *  lost the row — the D1 half. */
const state = { candidateOpen: true };

export function resetDocumentsViewer() {
  state.candidateOpen = true;
}

/** A minimal but STRUCTURALLY COMPLETE one-page PDF, assembled with a real
 *  cross-reference table at correct byte offsets.
 *
 *  Hand-writing the bytes with a made-up `/Length` and no xref was the first
 *  cut, and it is exactly the kind of fixture that makes a browser leg lie:
 *  pdf.js has a recovery path for a broken xref, so such a file MIGHT render
 *  and might not, and a flaky page is indistinguishable from a broken viewer.
 *  Built properly, the walk's canvas assertion means what it says — pdf.js
 *  parsed a real document, fetched its worker from public/, and painted.
 *
 *  It is a genuine PDF rather than a stub for the same reason: a stub would
 *  prove the component's plumbing while proving nothing about whether the
 *  bundle actually carries pdfjs-dist. */
function buildMinimalPdf() {
  const NL = "\n";
  const content = "BT /F1 24 Tf 72 700 Td (INVOICE Acme Sdn Bhd) Tj ET" + NL;
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    "<</Length " + Buffer.byteLength(content, "utf8") + ">>" + NL + "stream" + NL + content + "endstream",
  ];

  let pdf = "%PDF-1.4" + NL;
  const offsets = [];
  objects.forEach((objectBody, i) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += (i + 1) + " 0 obj" + NL + objectBody + NL + "endobj" + NL;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += "xref" + NL + "0 " + (objects.length + 1) + NL + "0000000000 65535 f " + NL;
  for (const offset of offsets) pdf += String(offset).padStart(10, "0") + " 00000 n " + NL;
  pdf += "trailer" + NL + "<</Size " + (objects.length + 1) + "/Root 1 0 R>>" + NL
    + "startxref" + NL + xrefOffset + NL + "%%EOF" + NL;
  return Buffer.from(pdf, "utf8");
}

const MINIMAL_PDF = buildMinimalPdf();

const MINIMAL_XML = '<?xml version="1.0" encoding="UTF-8"?><Invoice><ID>INV-1</ID></Invoice>';

function json(sendJson, response, body, cors) {
  sendJson(response, 200, body, cors);
  return true;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return {}; }
}

function eqParam(url, key) {
  const raw = url.searchParams.get(key);
  return raw?.startsWith("eq.") ? raw.slice(3) : null;
}

function inParam(url, key) {
  const raw = url.searchParams.get(key);
  if (!raw?.startsWith("in.(")) return null;
  return raw.slice(4, -1).split(",").map((v) => decodeURIComponent(v.trim()));
}

/** The Supabase/PostgREST hook. Returns true when it answered. Every branch is
 *  scoped to THIS lane's ids; a request naming any other client, document or
 *  extraction falls through untouched. */
export async function handleDocumentsViewerSupabase(request, response, path, url, sendJson, cors) {
  // THE CLIENT REGISTER IS SHARED, and this lane does NOT claim it. It answers
  // ONLY the by-id form for its own client — the one the workspace layout asks
  // for after a direct navigation — and falls through on the unfiltered
  // register read, which stays `serve-built.mjs`'s. `e2e-fixture-ownership.
  // test.ts` exists because a sibling lane claimed that register outright and
  // took away another walk's navigation link.
  if (request.method === "GET" && path === "/rest/v1/clients") {
    if (eqParam(url, "id") !== DOCS.clientId) return false;
    return json(sendJson, response, [{
      id: DOCS.clientId, name: "Documents Viewer Fixture", status: "active",
      created_at: "2026-01-01T00:00:00.000Z",
    }], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_filings") {
    const client = eqParam(url, "client_id");
    const document = eqParam(url, "document_id");
    if (client === DOCS.clientId) return json(sendJson, response, FILINGS, cors);
    if (document === DOCS.docPdf || document === DOCS.docXml) {
      return json(sendJson, response, FILINGS.filter((f) => f.document_id === document), cors);
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/documents") {
    const ids = inParam(url, "id");
    if (!ids) return false;
    const rows = ids.map((id) => DOC_ROWS[id]).filter(Boolean);
    if (rows.length === 0) return false;
    return json(sendJson, response, rows, cors);
  }

  if (request.method === "GET" && path === "/rest/v1/attribution_candidates") {
    if (eqParam(url, "client_id") !== DOCS.clientId) return false;
    return json(sendJson, response, state.candidateOpen ? [{
      id: DOCS.candidate, attempt_id: DOCS.attempt, client_id: DOCS.clientId,
      rank: 1, rule_kind: "name_exact", disposition: "open", created_at: "2026-04-01T00:10:00.000Z",
    }] : [], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/attribution_attempts") {
    const ids = inParam(url, "id");
    if (!ids?.includes(DOCS.attempt)) return false;
    return json(sendJson, response, [{
      id: DOCS.attempt, document_id: DOCS.docXml, matcher_version: "1",
      outcome: "ambiguous", conflict_reason: null, created_at: "2026-04-01T00:10:00.000Z",
    }], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_extractions") {
    const document = eqParam(url, "document_id");
    if (document !== DOCS.docPdf && document !== DOCS.docXml) return false;
    if (document === DOCS.docXml) return json(sendJson, response, [], cors);
    return json(sendJson, response, [{
      id: DOCS.extraction, document_id: DOCS.docPdf,
      engine_id: "azure-di:prebuilt-layout:2024-11-30", engine_kind: "ocr", version_n: 1,
      superseded_by: null, status: "done", page_count: 1, extracted_at: "2026-04-01T00:00:02.000Z",
    }], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_regions") {
    const ids = inParam(url, "extraction_id");
    if (!ids?.includes(DOCS.extraction)) return false;
    return json(sendJson, response, REGIONS.map(({ idx, engine_kind, version_n, extracted_at, locator, ...row }) => {
      // The DETAIL panel's read does not select `locator` (reads.ts:105) — that
      // is precisely why the overlay drives off get_document_extract instead.
      // Mirrored here so the walk cannot accidentally prove the overlay works
      // off a column the real read never returns.
      void idx; void engine_kind; void version_n; void extracted_at; void locator;
      return row;
    }), cors);
  }

  if (request.method === "GET" && path === "/rest/v1/document_processing_tasks_visible") {
    const document = eqParam(url, "document_id");
    if (document !== DOCS.docPdf && document !== DOCS.docXml) return false;
    return json(sendJson, response, [{
      id: `task-${document}`, document_id: document, lane: document === DOCS.docPdf ? "ocr" : "none",
      status: "done", version_n: 1, attempt_count: 1, error_code: null,
      created_at: "2026-04-01T00:00:00.000Z", started_at: "2026-04-01T00:00:01.000Z",
      finished_at: "2026-04-01T00:00:02.000Z", updated_at: "2026-04-01T00:00:02.000Z",
    }], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/journal_entries") {
    if (eqParam(url, "client_id") !== DOCS.clientId) return false;
    return json(sendJson, response, [], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/coding_tasks_visible") {
    if (eqParam(url, "client_id") !== DOCS.clientId) return false;
    return json(sendJson, response, [], cors);
  }

  if (request.method === "GET" && path === "/rest/v1/lint_findings") {
    if (eqParam(url, "client_id") !== DOCS.clientId) return false;
    return json(sendJson, response, [], cors);
  }

  if (request.method === "POST" && path.startsWith("/rest/v1/rpc/")) {
    const verb = path.slice("/rest/v1/rpc/".length);
    // THE BODY IS READ INSIDE A MATCHED VERB, NEVER IN THIS PRELUDE, and that is
    // a cross-lane rule rather than a style choice.
    //
    // `readJson` CONSUMES the request stream. A lane that parses the body and
    // then falls through hands every lane after it an empty object, and an
    // id-scoped guard reading `body.p_candidate` on `{}` refuses its own walk's
    // traffic — measured, not theorised: `bank-close-registers-mock.mjs:204-246`
    // parses on every `/rest/v1/rpc/` POST and returns false for verbs that are
    // not its own, which is what made this lane's confirm-and-file arrive as
    // "unhandled e2e Supabase route" the first time the two ran together.
    //
    // Reading lazily means this lane cannot do that to anyone, wherever it sits
    // in the chain. It also keeps ONE spelling of "which verbs are mine" — the
    // `if (verb === …)` blocks themselves — rather than a second list beside
    // them that would drift.
    //
    // EACH HANDLER ALSO SCOPES ITSELF on its own discriminant. #549's widened
    // census reads each `verb === "…"` as its own handler and looks for the
    // fall-through INSIDE it, so a shared prelude guard reads as several
    // unscoped handlers — and it deserves to, because a verb added below would
    // silently inherit a guard written for the others.

    if (verb === "get_document_extract") {
      const body = await readJson(request);
      if (body.p_document !== DOCS.docPdf && body.p_document !== DOCS.docXml) return false;
      if (body.p_document !== DOCS.docPdf) return json(sendJson, response, null, cors);
      return json(sendJson, response, {
        document: {
          id: DOCS.docPdf, sha256: "a".repeat(64), original_filename: "invoice-april.pdf",
          mime_type: "application/pdf", byte_size: 20480, bytes_verified_at: "2026-04-01T00:00:01.000Z",
          page_count: 1, extraction_status: "done", document_kind: "invoice", financial_date: "2026-04-01",
        },
        unassigned: false,
        filing: { id: DOCS.filingPdf, client_id: DOCS.clientId, filed_at: "2026-04-02T09:00:00.000Z", basis: "human" },
        extractions: [{
          id: DOCS.extraction, engine_id: "azure-di:prebuilt-layout:2024-11-30", engine_kind: "ocr",
          version_n: 1, status: "done", page_count: 1, extracted_at: "2026-04-01T00:00:02.000Z",
          envelope_text: JSON.stringify(ENVELOPE), raw_sha256: null, normalization_version: "1",
        }],
        regions: REGIONS,
        max_chars: body.p_max_chars ?? 20000,
      }, cors);
    }

    if (verb === "confirm_attribution_candidate") {
      const body = await readJson(request);
      if (body.p_candidate !== DOCS.candidate) return false;
      state.candidateOpen = false;
      return json(sendJson, response, { candidate: DOCS.candidate, disposition: "confirmed" }, cors);
    }

    // ONE VERB PER HANDLER, ONE HANDLER PER LINE. #549's widened ownership
    // census recognises `verb === "…"` as a handler opener and cross-checks a
    // per-line walk against a whole-source match; two verbs sharing a line made
    // those two techniques disagree (14 vs 15), which is that gate's own
    // positive control telling the truth — the walk would have attributed both
    // verbs to one census row, so the second one's scoping was invisible to it.
    if (verb === "list_uncoded_filings") {
      const body = await readJson(request);
      if (body.p_client !== DOCS.clientId) return false;
      return json(sendJson, response, [], cors);
    }
    if (verb === "list_coding_lanes") {
      const body = await readJson(request);
      if (body.p_client !== DOCS.clientId) return false;
      return json(sendJson, response, [], cors);
    }
  }

  return false;
}

/** The runtime hook — this lane's ONE runtime route, the document byte stream
 *  (`packages/runtime/src/documentRoutes.ts:50`, reached through apps/web's own
 *  same-origin proxy at `/api/runtime/documents/:id/bytes`). The content-type
 *  is set from the document's stored `mime_type`, exactly as the real route
 *  does — which is what makes `VIEWABLE_IN_NEW_TAB` the thing under test here
 *  rather than a mock's opinion. */
export async function handleDocumentsViewerRuntime(request, response, url) {
  // `/api/` PREFIXED, and this cost a round to find. The browser asks
  // apps/web for `/api/runtime/documents/:id/bytes`; the runtime proxy
  // (`app/api/runtime/[...path]/route.ts:53`) rebuilds the target as
  // `${base}/api/${path...}`, so what reaches this mock runtime is
  // `/api/documents/:id/bytes`. A handler anchored at `/documents/...` never
  // matches, the mock runtime answers its own 404, and the face renders an
  // honest byte-fetch failure — which is a REAL failure of the walk, not a
  // false green, but it looks nothing like the selector bug it actually was.
  const match = /^\/api\/documents\/([^/]+)\/bytes$/.exec(url.pathname);
  if (!match || request.method !== "GET") return false;
  const id = decodeURIComponent(match[1]);
  if (id !== DOCS.docPdf && id !== DOCS.docXml) return false;

  const pdf = id === DOCS.docPdf;
  const body = pdf ? MINIMAL_PDF : Buffer.from(MINIMAL_XML, "utf8");
  response.writeHead(200, {
    "content-type": pdf ? "application/pdf" : "application/xml",
    "content-length": String(body.length),
  });
  response.end(body);
  return true;
}
