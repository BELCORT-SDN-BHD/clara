// #633's browser lane — the DOCUMENTS-TAB half of the intake journey, and the firm's
// unassigned-sources leaf.
//
// EXTENDS rather than replaces. `chat-parity-mock.mjs` already serves a REAL browser
// upload (begin -> PUT -> finalize -> the adoption read), and the brief is explicit that
// this lane reuses that harness rather than standing up a second one. What this file adds
// is everything that trip never had a surface for: a LIST-form receipts read, the
// capability catalogue, the unassigned population, the document -> Work link, and a
// second intake id whose status is still MOVING so the settle-poll has something to
// settle.
//
// EVERY BRANCH IS ID-SCOPED to this lane's own client and its own document ids, so it
// answers for nobody else and falls through otherwise — the property `serve-built.mjs`'s
// hook ordering depends on.
//
// WHAT IS REAL AND WHAT IS NOT. Real: the browser, the built bundle, the same-origin
// runtime proxy (firm-scope guard + header allow-list), the upload queue, the settle-poll,
// the capability join, the Data Table, and every message key. Mocked: PostgREST and the
// runtime's three intake legs. So this lane is evidence about the JOURNEY and the client's
// own wire shapes — never about whether Postgres would accept them. `packages/db/tests`
// owns that half, and `intake-admission-e2e.mjs` owns the real-World chain.

import { createServer as createHttpServer } from "node:http";

import { readCachedJson } from "./mock-dispatch.mjs";

export const DOCS_INTAKE = {
  clientId: "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e",
  /** ADOPTED, filed to this client, kind already known — the settled receipt. */
  settledIntakeId: "2a2a2a2a-2a2a-4a2a-8a2a-2a2a2a2a2a2a",
  settledDocumentId: "3b3b3b3b-3b3b-4b3b-8b3b-3b3b3b3b3b3b",
  /** STILL VERIFYING on the first read, ADOPTED from the second — the settle transition. */
  movingIntakeId: "4c4c4c4c-4c4c-4c4c-8c4c-4c4c4c4c4c4c",
  movingDocumentId: "5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d",
  /** UNASSIGNED at firm altitude — the leaf's own subject. */
  unassignedDocumentId: "6e6e6e6e-6e6e-4e6e-8e6e-6e6e6e6e6e6e",
  /** The Work an entry citing the settled document belongs to. */
  entryId: "7f7f7f7f-7f7f-4f7f-8f7f-7f7f7f7f7f7f",
  workId: "8a8a8a8a-8a8a-4a8a-8a8a-8a8a8a8a8a8a",
  /** Uploads made DURING a walk get their ids from `nextUploadIds` below — one per
   *  `begin`, because the queue runs at CONCURRENCY 2 and a batch sharing one intake id
   *  is a mock artefact the real runtime never produces. They are not constants. */
  userId: "11111111-1111-1111-1111-111111111111",
};

/** Mutable per-process lane state. The settle transition and the ask-once attribution are
 *  both STATE CHANGES a walk drives, so they live here rather than in a constant. */
const state = {
  /** Flips after the first read of the moving intake, so the SECOND read settles it —
   *  which is exactly what "the status settles without a reload" has to observe. */
  movingReads: 0,
  /** Set by the firm leaf's attribution act; the unassigned population then drops it. */
  attributed: false,
  /** Every attribution attempt, so a SECOND one on the same document can be refused. */
  attributionAttempts: 0,
  /** Set once an upload has been filed, so the receipts list can grow by one. */
  uploadFiled: false,
  /** See the arming note in handleDocumentsIntakeSupabase. */
  armed: false,
  /** ONE INTAKE ID PER UPLOAD, because the queue runs at CONCURRENCY 2 and a batch of
   *  four rows all polling one shared id would be a mock artefact the real runtime never
   *  produces — every `begin` mints its own. Keyed by id so the PUT, the finalize and the
   *  adoption read can all recognise a member of this lane's own set. */
  uploads: new Map(),
};

let uploadSeq = 0;
const nextUploadIds = (filename) => {
  uploadSeq += 1;
  const n = String(uploadSeq).padStart(2, "0");
  const ids = {
    intakeId: `9b9b9b9b-9b9b-4b9b-8b9b-9b9b9b9b9b${n}`,
    documentId: `0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c${n}`,
    filename,
  };
  state.uploads.set(ids.intakeId, ids);
  return ids;
};

export function resetDocsIntakeLane() {
  state.movingReads = 0;
  state.attributed = false;
  state.attributionAttempts = 0;
  state.uploadFiled = false;
  state.armed = false;
  state.uploads.clear();
  uploadSeq = 0;
}

const iso = (s) => `2026-04-0${s}T02:00:00.000Z`;

function intakeRow(over) {
  return {
    id: DOCS_INTAKE.settledIntakeId,
    uploaded_by: DOCS_INTAKE.userId,
    origin: "documents_tab",
    original_filename: "april-invoice.pdf",
    declared_mime: "application/pdf",
    declared_bytes: 20480,
    status: "adopted",
    document_id: DOCS_INTAKE.settledDocumentId,
    failure_code: null,
    expires_at: null,
    created_at: iso(1),
    updated_at: iso(1),
    ...over,
  };
}

/** The registry rows this lane joins against — the SHAPE `clara.document_capabilities`
 *  publishes, measured on the #633 rig: `custody` supported everywhere, `byte_extraction`
 *  stored_only for ofx and supported elsewhere, and (pdf, payroll_summary) carrying no
 *  typed facts at all. Three rows, not 240: a walk only ever joins the pairs it renders. */
const CAPABILITIES = [
  {
    format: "pdf", document_kind: "invoice", mime_type: "application/pdf",
    custody: "supported", byte_extraction: "supported", typed_facts: "supported",
    business_operation: "supported", engine_id: "azure-di:prebuilt-invoice:4.0",
    engine_byte: "azure-di:prebuilt-layout:4.0", registry_version: 1,
    basis: "An invoice is read end to end and its header facts are corroborated.", limits: {},
  },
  {
    format: "pdf", document_kind: "payroll_summary", mime_type: "application/pdf",
    custody: "supported", byte_extraction: "supported", typed_facts: "unsupported",
    business_operation: "unsupported", engine_id: null,
    engine_byte: "azure-di:prebuilt-layout:4.0", registry_version: 1,
    basis: "The bytes are read, but Clara derives no typed facts for this kind.", limits: {},
  },
  {
    format: "pdf", document_kind: "ssm_company_doc", mime_type: "application/pdf",
    custody: "supported", byte_extraction: "supported", typed_facts: "unsupported",
    business_operation: "unsupported", engine_id: null,
    engine_byte: "azure-di:prebuilt-layout:4.0", registry_version: 1,
    basis: "A registry document is governance evidence, not a transaction.", limits: {},
  },
];

function documentRow(id, over = {}) {
  return {
    id,
    sha256: "a".repeat(64),
    original_filename: "april-invoice.pdf",
    mime_type: "application/pdf",
    byte_size: 20480,
    storage_path: `docs/${id}`,
    uploaded_by: DOCS_INTAKE.userId,
    created_at: iso(1),
    bytes_verified_at: iso(1),
    page_count: 2,
    extraction_status: "done",
    document_kind: "invoice",
    financial_date: "2026-04-01",
    retention_state: "unanchored",
    retain_until: null,
    retention_basis: null,
    legal_hold: false,
    legal_hold_reason: null,
    ...over,
  };
}

// THE SHARED READER, NOT A LOCAL ONE (#722's `mock-dispatch.mjs`). This lane used to carry
// its own read-and-parse loop, which is precisely the hazard that module exists to close: a
// Node request stream drains ONCE, this lane runs EARLY in `serve-built.mjs`'s chain, and a
// verb it reads and then declines (`get_document_state` for another lane's document,
// `file_document` for another lane's file) would leave every later lane reading `{}` — whose
// every field is `undefined`, which a permissive guard accepts just well enough for the
// failure to be silent. `readCachedJson` parses once and re-serves the SAME object to every
// caller in any order, so declining after reading costs nobody anything.
const readJson = readCachedJson;

async function drain(request) {
  for await (const chunk of request) void chunk;
}

/** Every document id this lane speaks for: the two client-tab fixtures, the firm leaf's own
 *  subject, and anything uploaded during a walk. A read naming any other document is not this
 *  lane's business and falls through. */
function laneDocumentIds() {
  return [
    DOCS_INTAKE.settledDocumentId,
    DOCS_INTAKE.movingDocumentId,
    DOCS_INTAKE.unassignedDocumentId,
    ...[...state.uploads.values()].map((u) => u.documentId),
  ];
}

/** The ONE extraction this lane publishes, for the settled document. */
const EXTRACTION_ID = "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e001";

/** `clara.get_document_state`'s answer for this lane's two client-tab documents, shaped from
 *  the real RPC's jsonb (0191 section S8) exactly as `documents-viewer-mock.mjs` shapes its
 *  own — never invented keys. The two are deliberately OPPOSITE on the facts axis, which is
 *  what makes AC3(b) legible on the DETAIL surface as well as in the list:
 *    * april-invoice.pdf — (pdf, invoice): facts supported, and validated.
 *    * march-statement.pdf — (pdf, payroll_summary): bytes READ and facts UNSUPPORTED, while
 *      `extraction_status` still reads `done`. That pair is the whole defect this ticket
 *      closes, and here it is on the panel the person opens. */
const DOCUMENT_STATES = {
  [DOCS_INTAKE.settledDocumentId]: {
    document_id: DOCS_INTAKE.settledDocumentId, document_kind: "invoice",
    mime_type: "application/pdf", format: "pdf",
    capability: {
      format: "pdf", document_kind: "invoice", mime_type: "application/pdf",
      custody: "supported", byte_extraction: "supported",
      typed_facts: "supported", business_operation: "supported",
      engine_id: "azure-di:prebuilt-invoice:4.0", engine_byte: "azure-di:prebuilt-layout:4.0",
      registry_version: 1,
      basis: "An invoice is read end to end and its header facts are corroborated.",
      limits: {}, known_pair: true, kind_known: true,
    },
    custody: {
      state: "verified", sha256: "a".repeat(64), byte_size: 20480,
      bytes_verified_at: iso(1), legal_hold: false, legal_hold_reason: null,
      retention_state: "unanchored", retain_until: null, capability: "supported",
    },
    byte_extraction: {
      status: "done", page_count: 2, capability: "supported",
      engine_id: "azure-di:prebuilt-layout:4.0",
      tasks: [{
        id: `task-${DOCS_INTAKE.settledDocumentId}`, lane: "ocr", status: "done",
        engine_id: "azure-di:prebuilt-layout:4.0", version_n: 1, attempt_count: 1,
        error_code: null, finished_at: iso(1),
      }],
    },
    facts: {
      capability: "supported", limits: {},
      extractions: [{
        id: EXTRACTION_ID, engine_kind: "ocr", engine_id: "azure-di:prebuilt-layout:4.0",
        version_n: 1, status: "done", superseded_by: null, extracted_at: iso(1), region_count: 0,
      }],
      validations: [],
    },
    operation: { capability: "supported", codeable_kind: true, entries: [], statements: [] },
    lineage: {
      sha256: "a".repeat(64), intakes: [], corrections: [], authoritative_extraction_id: EXTRACTION_ID,
      filings: [{
        id: "f0000000-0000-4000-8000-000000000001", client_id: DOCS_INTAKE.clientId,
        filed_at: iso(1), basis: "human", retired_at: null, retirement_reason: null, correction_id: null,
      }],
    },
  },
  [DOCS_INTAKE.movingDocumentId]: {
    document_id: DOCS_INTAKE.movingDocumentId, document_kind: "payroll_summary",
    mime_type: "application/pdf", format: "pdf",
    capability: {
      format: "pdf", document_kind: "payroll_summary", mime_type: "application/pdf",
      custody: "supported", byte_extraction: "supported",
      typed_facts: "unsupported", business_operation: "unsupported",
      engine_id: null, engine_byte: "azure-di:prebuilt-layout:4.0", registry_version: 1,
      basis: "The bytes are read, but Clara derives no typed facts for this kind.",
      limits: {}, known_pair: true, kind_known: true,
    },
    custody: {
      state: "verified", sha256: "c".repeat(64), byte_size: 20480,
      bytes_verified_at: iso(2), legal_hold: false, legal_hold_reason: null,
      retention_state: "unanchored", retain_until: null, capability: "supported",
    },
    byte_extraction: {
      status: "done", page_count: 2, capability: "supported",
      engine_id: "azure-di:prebuilt-layout:4.0", tasks: [],
    },
    facts: { capability: "unsupported", limits: {}, extractions: [], validations: [] },
    operation: { capability: "unsupported", codeable_kind: false, entries: [], statements: [] },
    lineage: {
      sha256: "c".repeat(64), intakes: [], corrections: [], authoritative_extraction_id: null,
      filings: [{
        id: "f0000000-0000-4000-8000-000000000002", client_id: DOCS_INTAKE.clientId,
        filed_at: iso(2), basis: "human", retired_at: null, retirement_reason: null, correction_id: null,
      }],
    },
  },
};

/**
 * The PostgREST half. Returns true when it answered.
 *
 * SCOPING RULE, and it is what keeps this lane from swallowing chat-parity's: the
 * receipts read is the LIST form (no `id=eq.`), while the chat composer's queue polls a
 * SINGLE row by id. So this handler answers `document_intakes_visible` only when the
 * request carries no `id=eq.` filter, or when the id it names is one of THIS lane's.
 */
export async function handleDocumentsIntakeSupabase(request, response, path, url, sendJson, cors) {
  const params = url.searchParams;

  // ARMING. The receipts read is the one request in this lane that carries no scope of
  // its own — `clara.document_intakes` has no client column, which is the whole reason
  // the predicate lives in the browser. So the lane arms itself on any request that DOES
  // name this client (the filings read the workbench issues in the same breath, the
  // spoken-for door, an evidence-link read), and until then it answers the list form
  // with an honest EMPTY rather than another lane's rows. That matters in both
  // directions: unarmed, this lane injects nothing into `documents-viewer-walk`'s tab;
  // armed, it — not chat-parity's unconditional handler — is what answers here.
  if (url.search.includes(DOCS_INTAKE.clientId)) state.armed = true;

  if (request.method === "GET" && path === "/rest/v1/document_intakes_visible") {
    const idFilter = params.get("id");
    const named = idFilter?.startsWith("eq.") ? idFilter.slice(3) : null;
    const mine = new Set([DOCS_INTAKE.settledIntakeId, DOCS_INTAKE.movingIntakeId]);
    if (named !== null && !mine.has(named) && !state.uploads.has(named)) return false; // chat-parity's own poll
    if (named !== null && state.uploads.has(named)) {
      const issued = state.uploads.get(named);
      // The queue's own DB-confirmed adoption read for a file just uploaded in this walk.
      sendJson(response, 200, [intakeRow({
        id: issued.intakeId, original_filename: issued.filename,
        status: "adopted", document_id: issued.documentId, created_at: iso(4),
      })], cors);
      return true;
    }
    if (named !== null) {
      sendJson(response, 200, [intakeRow({ id: named })], cors);
      return true;
    }
    // THE LIST FORM — the receipts cell.
    if (!state.armed) {
      sendJson(response, 200, [], cors); // another lane's client: an honest empty, not our rows
      return true;
    }
    // The moving row settles on its SECOND read, which is the transition
    // "status settles without a reload" is about.
    state.movingReads += 1;
    const settledYet = state.movingReads > 1;
    sendJson(response, 200, [
      intakeRow({}),
      intakeRow({
        id: DOCS_INTAKE.movingIntakeId,
        original_filename: "march-statement.pdf",
        status: settledYet ? "adopted" : "verifying",
        document_id: settledYet ? DOCS_INTAKE.movingDocumentId : null,
        created_at: iso(2),
      }),
    ], cors);
    return true;
  }

  // -------------------------------------------------------------------------------------
  // THE DETAIL BUNDLE — found by RUNNING the walk, not by reading it.
  //
  // Clicking a filed row opened the aside and it rendered "This isn't reachable today", so
  // the file/Work boundary underneath it never mounted at all. The cause is one property of
  // `loadDocumentDetail` (`lib/documents/loaders.ts:116-134`): FIVE reads in one
  // `Promise.all`, and a single unanswered route fails the whole bundle. This lane answered
  // one of the five (`documents?id=in.(…)`), so the other four 404'd.
  //
  // Every branch below is scoped by `laneDocumentIds()` and falls through otherwise — the
  // same rule as the rest of the file, and the reason it can run early in the chain.
  // -------------------------------------------------------------------------------------
  /** `<param>=eq.<uuid>` when the id named is one of this lane's, else null. */
  const namedLaneDocument = (key) => {
    const raw = params.get(key);
    const id = raw !== null && raw.startsWith("eq.") ? raw.slice(3) : null;
    return id !== null && laneDocumentIds().includes(id) ? id : null;
  };

  /** #876 — `<param>=in.(<uuid>,<uuid>,…)`, filtered down to THIS lane's ids. `reads.ts`'s
   *  `listActiveFilingsForDocuments` (the bounded, multi-document sibling of the single-document
   *  `eq.` read this file already answers below) issues exactly this shape. Empty array, never
   *  null, when the param is present but shaped wrong or names none of this lane's documents —
   *  the caller distinguishes "answered, nothing matched" from "not this route" by whether this
   *  function returns rows at all, same as `namedLaneDocument`'s null. */
  const namedLaneDocumentsIn = (key) => {
    const raw = params.get(key);
    if (raw === null || !raw.startsWith("in.(") || !raw.endsWith(")")) return [];
    const ids = raw.slice(4, -1).split(",").map((v) => decodeURIComponent(v));
    return ids.filter((id) => laneDocumentIds().includes(id));
  };

  // THE RECEIPTS PREDICATE'S BOUNDED FILINGS READ (#876). `documents-workbench.tsx`'s intake
  // receipts card asks, for exactly the intake queue's own document ids, which of them already
  // hold an active filing — the multi-document counterpart of the single-document `eq.` branch
  // below. Answered from the SAME fixture map that branch uses, so the two routes can never
  // disagree about which of this lane's documents are filed.
  if (request.method === "GET" && path === "/rest/v1/document_filings"
      && (params.get("document_id") ?? "").startsWith("in.(")) {
    const ids = namedLaneDocumentsIn("document_id");
    if (ids.length === 0) return false; // another lane's documents — its own handler answers
    const known = {
      [DOCS_INTAKE.settledDocumentId]: { id: "f0000000-0000-4000-8000-000000000001", at: iso(1) },
      [DOCS_INTAKE.movingDocumentId]: { id: "f0000000-0000-4000-8000-000000000002", at: iso(2) },
    };
    const rows = ids.flatMap((doc) => {
      const f = known[doc];
      return f ? [{
        id: f.id, document_id: doc, client_id: DOCS_INTAKE.clientId,
        filed_at: f.at, filed_by: DOCS_INTAKE.userId, basis: "human",
        retired_at: null, retirement_reason: null, revision_token: `rev-633-${doc.slice(0, 4)}`,
      }] : [];
    });
    sendJson(response, 200, rows, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/document_filings" && params.get("document_id") !== null) {
    const doc = namedLaneDocument("document_id");
    if (doc === null) return false; // another lane's document — its own handler answers
    const known = {
      [DOCS_INTAKE.settledDocumentId]: { id: "f0000000-0000-4000-8000-000000000001", at: iso(1) },
      [DOCS_INTAKE.movingDocumentId]: { id: "f0000000-0000-4000-8000-000000000002", at: iso(2) },
    }[doc];
    // An UNFILED document (the firm leaf's subject, an upload not yet attributed) answers an
    // honest empty — that is what "no live filing" looks like on this read.
    sendJson(response, 200, known ? [{
      id: known.id, document_id: doc, client_id: DOCS_INTAKE.clientId,
      filed_at: known.at, filed_by: DOCS_INTAKE.userId, basis: "human",
      retired_at: null, retirement_reason: null, revision_token: `rev-633-${doc.slice(0, 4)}`,
    }] : [], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/document_extractions") {
    const doc = namedLaneDocument("document_id");
    if (doc === null) return false;
    sendJson(response, 200, doc === DOCS_INTAKE.settledDocumentId ? [{
      id: EXTRACTION_ID, document_id: doc, engine_id: "azure-di:prebuilt-layout:4.0",
      engine_kind: "ocr", version_n: 1, superseded_by: null, status: "done",
      page_count: 2, extracted_at: iso(1),
    }] : [], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/document_regions") {
    // Only ever asked for THIS lane's own extraction id, and the honest answer is that no
    // regions were read: this walk proves the intake journey, not the evidence viewer
    // (`documents-viewer-walk.spec.ts` owns that, with its own regions).
    if (!url.search.includes(EXTRACTION_ID)) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/journal_entries") {
    const doc = namedLaneDocument("document_id");
    if (doc === null) return false;
    // NO CODED ENTRY on this read, deliberately. The document -> Work boundary is rendered
    // from `entry_evidence_links` (the link that carries `work_id`), and this arm exists to
    // prove the other half: the coding-lane arm is empty, so nothing here can be mistaken
    // for the Work.
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/document_processing_tasks_visible") {
    const doc = namedLaneDocument("document_id");
    if (doc === null) return false;
    // TWO SETTLED TASKS — AC8's COUNT half, on the same read the queue row uses
    // (`intake.ts`'s `listProcessingTasksForDocument`).
    sendJson(response, 200, [
      {
        id: `t1-${doc.slice(0, 8)}`, document_id: doc, lane: "ocr", status: "done",
        version_n: 1, attempt_count: 1, error_code: null,
        created_at: iso(1), started_at: iso(1), finished_at: iso(1), updated_at: iso(1),
      },
      {
        id: `t2-${doc.slice(0, 8)}`, document_id: doc, lane: "classify", status: "done",
        version_n: 1, attempt_count: 1, error_code: null,
        created_at: iso(1), started_at: iso(1), finished_at: iso(1), updated_at: iso(1),
      },
    ], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/get_document_state") {
    const body = await readJson(request);
    const answer = DOCUMENT_STATES[body?.p_document];
    if (!answer) return false; // another lane's document — and the body stays readable for it
    sendJson(response, 200, answer, cors);
    return true;
  }

  // THE FILINGS THIS CLIENT HOLDS. Load-bearing twice over: it is arm (a) of the receipts
  // predicate ("filed to this client"), and it is what puts a CLICKABLE row in the filed
  // list, which is the only way to open the detail panel where the file -> Work boundary
  // is rendered. Scoped to this lane's client id, so every other walk's filings are
  // untouched.
  if (request.method === "GET" && path === "/rest/v1/document_filings") {
    if (params.get("client_id") !== `eq.${DOCS_INTAKE.clientId}`) return false;
    sendJson(response, 200, [
      {
        id: "f0000000-0000-4000-8000-000000000001",
        document_id: DOCS_INTAKE.settledDocumentId,
        client_id: DOCS_INTAKE.clientId,
        filed_at: iso(1), filed_by: DOCS_INTAKE.userId, basis: "human",
        retired_at: null, retirement_reason: null, revision_token: "rev-633-1",
      },
      {
        id: "f0000000-0000-4000-8000-000000000002",
        document_id: DOCS_INTAKE.movingDocumentId,
        client_id: DOCS_INTAKE.clientId,
        filed_at: iso(2), filed_by: DOCS_INTAKE.userId, basis: "human",
        retired_at: null, retirement_reason: null, revision_token: "rev-633-2",
      },
      ...(state.uploadFiled ? [...state.uploads.values()].map((u, i) => ({
        id: `f0000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
        document_id: u.documentId,
        client_id: DOCS_INTAKE.clientId,
        filed_at: iso(4), filed_by: DOCS_INTAKE.userId, basis: "human",
        retired_at: null, retirement_reason: null, revision_token: `rev-633-up-${i}`,
      })) : []),
    ], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/document_capabilities") {
    sendJson(response, 200, CAPABILITIES, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/caller_context") {
    sendJson(response, 200, [{
      user_id: DOCS_INTAKE.userId, firm_id: "e2e-firm", firm_name: "E2E Accounting",
      role: "owner", role_rank: 40, is_operator: false,
    }], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/list_unassigned_documents") {
    await drain(request);
    // ASK ONCE: once attributed, the document LEAVES the population — the DB's own
    // predicate stops matching it, and the leaf must stop offering the question.
    sendJson(response, 200, state.attributed ? [] : [{
      id: DOCS_INTAKE.unassignedDocumentId,
      sha256: "b".repeat(64),
      byte_size: 40960,
      mime_type: "application/pdf",
      created_at: iso(3),
      page_count: 1,
      unassigned: true,
      document_kind: "ssm_company_doc",
      financial_date: null,
      bytes_verified_at: iso(3),
      extraction_status: "done",
      original_filename: "ssm-form-24.pdf",
    }], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/record_client_resolution") {
    const body = await readJson(request);
    if (body?.p_subject !== DOCS_INTAKE.unassignedDocumentId) return false;
    state.attributionAttempts += 1;
    if (state.attributionAttempts > 1) {
      // THE SECOND ATTEMPT TO THE SAME CLIENT IS REFUSED, VERBATIM, by the DB's own
      // words — the surface renders them and mints no second filing.
      //
      // FIX ROUND 1 (review finding 633-ADV-5): this used to answer `CLR01
      // document_already_filed`, which NO door in this chain produces. Measured on a
      // real chain (clara_633r): a same-client repeat answers CLR10 "document is
      // already actively filed to this client"; a replay of the same op_key with the
      // same arguments is idempotent; and a second attribution to a DIFFERENT client is
      // ACCEPTED, leaving two live filings — which 0123's classify gate then refuses as
      // `document_processing_multi_client`. The leaf offers one act per row, so this
      // lane only ever exercises the same-client repeat; the different-client outcome
      // is pinned in packages/db/tests/unassigned-intake-reuse.test.mjs, never faked
      // here as a refusal the estate does not give.
      sendJson(response, 400, {
        code: "CLR10",
        message: "document is already actively filed to this client",
        details: "A live filing already binds this document to that client.",
      }, cors);
      return true;
    }
    sendJson(response, 200, { resolution_id: "cafe0000-0000-4000-8000-000000000001" }, cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/file_document") {
    const body = await readJson(request);
    if (body?.p_document === DOCS_INTAKE.unassignedDocumentId) {
      state.attributed = true;
      sendJson(response, 200, null, cors);
      return true;
    }
    if ([...state.uploads.values()].some((u) => u.documentId === body?.p_document)) {
      state.uploadFiled = true;
      sendJson(response, 200, null, cors);
      return true;
    }
    return false;
  }

  if (request.method === "GET" && path === "/rest/v1/entry_evidence_links") {
    const doc = params.get("document_id");
    if (doc === `eq.${DOCS_INTAKE.settledDocumentId}`) {
      sendJson(response, 200, [{
        entry_id: DOCS_INTAKE.entryId,
        client_id: DOCS_INTAKE.clientId,
        work_id: DOCS_INTAKE.workId,
        logical_op_id: "op-633-1",
        attached_at: iso(2),
      }], cors);
      return true;
    }
    // THE HONEST EMPTY, for THIS LANE'S other documents only. Scoped rather than
    // answering every `document_id=eq.` there is: `entry_evidence_links` is read by other
    // lanes' surfaces too, and a blanket empty here would quietly tell them their own
    // documents produced no Work.
    const mine = [DOCS_INTAKE.movingDocumentId, DOCS_INTAKE.unassignedDocumentId, ...[...state.uploads.values()].map((u) => u.documentId)];
    if (mine.some((id) => doc === `eq.${id}`)) {
      sendJson(response, 200, [], cors);
      return true;
    }
    return false;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/list_spoken_for_documents") {
    const body = await readJson(request);
    if (body?.p_client !== DOCS_INTAKE.clientId) return false;
    sendJson(response, 200, [{
      document_id: DOCS_INTAKE.settledDocumentId,
      entry_id: DOCS_INTAKE.entryId,
      client_id: DOCS_INTAKE.clientId,
      client_name: "Rome Properties",
      via: "evidence_link",
    }], cors);
    return true;
  }

  if (request.method === "POST" && path === "/rest/v1/rpc/set_document_kind") {
    const body = await readJson(request);
    const issuedDocs = [...state.uploads.values()].map((u) => u.documentId);
    if (body?.p_document !== DOCS_INTAKE.unassignedDocumentId && !issuedDocs.includes(body?.p_document)) return false;
    sendJson(response, 200, null, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/documents") {
    const ids = /id=in\.\(([^)]*)\)/.exec(url.search)?.[1];
    if (!ids) return false;
    const wanted = ids.split(",").map((v) => decodeURIComponent(v.trim()));
    const issued = [...state.uploads.values()];
    const mine = [DOCS_INTAKE.settledDocumentId, DOCS_INTAKE.movingDocumentId, ...issued.map((u) => u.documentId)];
    if (!wanted.some((id) => mine.includes(id))) return false;
    sendJson(response, 200, wanted.filter((id) => mine.includes(id)).map((id) => {
      if (id === DOCS_INTAKE.movingDocumentId) {
        return documentRow(id, { original_filename: "march-statement.pdf", document_kind: "payroll_summary" });
      }
      const up = issued.find((u) => u.documentId === id);
      if (up) return documentRow(id, { original_filename: up.filename, document_kind: null });
      return documentRow(id);
    }), cors);
    return true;
  }

  return false;
}

/** The runtime's three intake legs for THIS lane's upload id. Delegated into the same
 *  mock-runtime origin `chat-parity-mock.mjs` starts, because `CLARA_RUNTIME_URL` can
 *  name exactly one. */
export async function handleDocumentsIntakeRuntime(request, response, url) {
  const json = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const path = url.pathname;

  if (request.method === "POST" && path === "/api/intake/documents") {
    const body = await readJson(request);
    // THE DISCRIMINANT IS `origin`, and it is the runtime's OWN parameter, not a test
    // convention: `intake.mjs:99-102` refuses unless a chat origin arrives with a
    // session id, and `intake.ts`'s `beginIntake` defaults every Documents-workbench
    // caller to "documents_tab". So this lane answers the documents tab and the firm
    // leaf, and chat-parity's composer upload — which sends `origin: "chat"` — falls
    // through to its own handler exactly as before.
    if (body?.origin !== "documents_tab") return false;
    // FORMAT AND SIZE REFUSALS, PER FILE. These are the runtime's own walls
    // (`intake.mjs:28`, `:33-50`) and the queue has to settle each row on its own.
    if (typeof body?.declared_bytes === "number" && body.declared_bytes > 20 * 1024 * 1024) {
      json(413, { error: "too_large", message: "declared bytes exceed the 20 MB limit" });
      return true;
    }
    const admitted = new Set(["application/pdf", "image/png", "image/jpeg", "application/xml", "text/csv"]);
    if (!admitted.has(String(body?.mime))) {
      json(415, { error: "bad_type", message: `unsupported mime ${body?.mime}` });
      return true;
    }
    const issued = nextUploadIds(String(body?.filename ?? "uploaded.pdf"));
    json(201, { intake_id: issued.intakeId, upload_token: `e2e-docs-intake-token-${issued.intakeId}`, expires_at: null });
    return true;
  }
  const leg = /^\/api\/intake\/documents\/([^/]+)\/(bytes|finalize)$/.exec(path);
  if (leg && state.uploads.has(leg[1])) {
    const issued = state.uploads.get(leg[1]);
    if (request.method === "PUT" && leg[2] === "bytes") {
      await drain(request);
      response.writeHead(204);
      response.end();
      return true;
    }
    if (request.method === "POST" && leg[2] === "finalize") {
      await readJson(request);
      json(202, { status: "adopted", document_id: issued.documentId });
      return true;
    }
  }
  return false;
}

/** Stand-alone start, for a walk that wants this lane on its own runtime origin. Unused
 *  by `serve-built.mjs` (which delegates into chat-parity's single origin) and kept for
 *  the same reason `startMockRuntime` is exported there: one file, one complete lane. */
export function startDocumentsIntakeRuntime(port) {
  const server = createHttpServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    void handleDocumentsIntakeRuntime(request, response, url).then((handled) => {
      if (handled) return;
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    });
  });
  server.listen(port, "127.0.0.1");
  return { server, origin: `http://127.0.0.1:${port}` };
}
