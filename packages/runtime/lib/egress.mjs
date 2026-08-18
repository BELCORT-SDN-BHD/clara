import { createReadStream } from "node:fs";

const API_VERSION = "2024-11-30";
const MODEL = "prebuilt-layout";

export class DocumentEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DocumentEngineError";
    this.code = code;
  }
}

function remaining(deadline) {
  return Math.max(0, deadline - Date.now());
}

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

/** The real Azure adapter. One absolute deadline covers submission, every 429 wait,
 * and polling; a Retry-After value can never extend the operation past it. */
export async function analyzeLayoutReal({ filePath, mime, totalDeadlineMs = 120_000, fetchImpl = fetch }) {
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
        {
          method: "POST",
          headers: { "ocp-apim-subscription-key": key, "content-type": mime },
          body: createReadStream(filePath),
          duplex: "half",
        },
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
      let poll = await fetchWithin(fetchImpl, operation, { headers: { "ocp-apim-subscription-key": key } }, deadline, controller.signal);
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

function polygons(regions) {
  return Array.isArray(regions)
    ? regions.map((r) => ({ pageNumber: Number(r.pageNumber || 1), polygon: Array.isArray(r.polygon) ? r.polygon.map(Number) : [] }))
    : [];
}

// THE PAGE KEY IS WRITTEN TWICE, ON PURPOSE (F-A1 PR-2, owner-adjudicated at the source).
//
// `document_regions.locator` is free jsonb (0007:209 checks only that it IS an object) and the
// live estate grew TWO page spellings, each with real readers:
//   * `page_number` — this producer's original, read by the vendor-identity geometry
//     (0028:275-276, 0028:306-307, 0030:268-269) and by lib/statement-layout-reader.mjs:152 /
//     lib/table-cell-geometry.mjs:46.
//   * `page`        — read by the evidence surfaces (0011:3736, 0015:2543/2577) and by the whole
//     F-A1 witness estate: clara.witness_citation_regions (0095:301), the writer's fact locator
//     (0095:565/605) and clara.evaluate_witness_identity_v1's page grouping (0091:150/166).
//
// Before this change a REAL Azure region was invisible to every `->>'page'` reader, so a witness
// pair's fact regions landed with a NULL page and the identity leaf's geometry test refused on
// EVERY document — fail-closed, but vacuous: the D12 defense would never have fired in
// production. The fix is here, at the SOURCE, rather than in the readers: 0091's leaf is a FROZEN
// evaluator closure member, so changing it means a `_v2` re-mint with a new registry row, which
// is not worth it for a key spelling. Writing both keys moves nothing — `page_number` keeps its
// exact meaning and its existing readers — and it costs one jsonb key per region.
//
// NAMED INTERIM LIMITATION, and it is not closed by this change: OCR rows COMMITTED BEFORE this
// producer shipped carry `page_number` only. A witness run over such a document still publishes a
// null page, so its identity geometry still refuses fail-closed until that document is re-OCR'd.
// Amounts are unaffected — C2's geometry conjunct anchors on the polygon, not the page.
export function normalizeAzureLayout(payload, task) {
  const result = payload?.analyzeResult || payload || {};
  const pages = Array.isArray(result.pages) ? result.pages : [];
  const regions = [];
  for (const page of pages) {
    for (const [index, line] of (page.lines || []).entries()) {
      for (const region of polygons(line.boundingRegions?.length ? line.boundingRegions : [{ pageNumber: page.pageNumber, polygon: line.polygon }])) {
        regions.push({
          locator_kind: "page_polygon",
          locator: { page: region.pageNumber, page_number: region.pageNumber, polygon: region.polygon },
          field_path: `pages.${Number(page.pageNumber || 1)}.lines.${index}`,
          text_content: String(line.content || ""),
          engine_confidence: line.confidence == null ? null : Number(line.confidence),
          monetary_raw: null,
          monetary_cents: null,
        });
      }
    }
  }
  for (const [tableIndex, table] of (result.tables || []).entries()) {
    for (const [cellIndex, cell] of (table.cells || []).entries()) {
      for (const region of polygons(cell.boundingRegions)) {
        regions.push({
          locator_kind: "page_polygon",
          // Both spellings, for the reason stated above this function. Table cells are region
          // rows exactly like lines are, so a witness may cite one and it must carry a page too.
          locator: { page: region.pageNumber, page_number: region.pageNumber, polygon: region.polygon },
          field_path: `tables.${tableIndex}.cells.${cellIndex}`,
          text_content: String(cell.content || ""),
          engine_confidence: cell.confidence == null ? null : Number(cell.confidence),
          monetary_raw: null,
          monetary_cents: null,
        });
      }
    }
  }
  return {
    pageCount: pages.length || 1,
    vendorOpRef: payload?.operationId || null,
    envelope: {
      schema_version: 1,
      engine: { id: task.engineId, kind: "ocr", version_n: task.versionN },
      content: String(result.content || ""),
      pages: pages.map((p) => ({ page_number: Number(p.pageNumber || 1), width: p.width ?? null, height: p.height ?? null, unit: p.unit ?? null })),
      tables: result.tables || [],
    },
    regions,
  };
}

export async function analyzeDocument(filePath, mime, task) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const adapter = globalThis.__claraAzureForTest;
    if (!adapter) throw new DocumentEngineError("engine_error", "test Azure adapter is not injected");
    const payload = await adapter({ filePath, mime, task });
    return normalizeAzureLayout(payload, task);
  }
  return normalizeAzureLayout(await analyzeLayoutReal({ filePath, mime }), task);
}

export const AZURE_ENGINE_SNAPSHOT = Object.freeze({
  engineId: "azure-di:prebuilt-layout:2024-11-30",
  engineConfig: { provider: "azure-document-intelligence", model: MODEL, api_version: API_VERSION, region: "southeast-asia" },
  versionN: 1,
});

// ---------------------------------------------------------------------------
// The governed-egress purpose registry (WA-R2 / WA-D1 + ADR-024 for the per-client consent surface;
// WA2-R14 for the cross-border rescoping; Wave B W9 + WB-R23 / migration 0020 for typed purposes).
// The earlier "WA2-R2 envelope" label was wrong — WA2-R2 is MyInvois LOCAL intake — and is corrected
// here (contract §0, residual R-4). ADDITIVE — this file was the Azure DI OCR adapter and carried no
// purpose registry, so wiki_synthesis is the first entry; it names the consent discipline for a lane
// that sends client-confidential data to a model.
//
// After 0020 the consent surface for THIS purpose is the TYPED relation, never the legacy
// purpose-blind one: clara.client_egress_consents governs the invoice-facts lane and nothing else,
// and a typed grant alone does not authorize — an owner ACTIVATION must exist too, and the runtime
// reaches both only through the DEFINER verbs clara.prepare_egress_dispatch (plan time) and
// clara.consume_egress_dispatch (the dispatch linearization point). When either boundary is not
// granted the consumer records the DB-side HELD state (clara.set_wiki_synthesis_hold); the DB owns
// the final backstop (publish_wiki_page_version refuses synthesis='model' under a live hold).
// ---------------------------------------------------------------------------
// TRUED AT F-A1 PR-2 (design §3.5: "GOVERNED_EGRESS_PURPOSES is trued (statement_extraction +
// witness_extraction)"). This registry had drifted to a single entry while the DB grew two more
// typed purposes — a stale registry is worse than none, because a reader checking "is this
// purpose governed?" against it would have got NO for a purpose the database governs. Each entry
// below was written by reading what the migrations ENFORCE, not what a design intended:
//   * the purpose vocabulary CHECK on all three relations — 0090 §7a, now
//     ('wiki_synthesis','statement_extraction','witness_extraction');
//   * the per-purpose document-hash rule, ck_egress_dispatch_authorizations_doc_sha — 0090 §7b:
//     wiki REQUIRES a null hash, statement and witness each REQUIRE a non-null one, as three
//     separate conjuncts so a fourth purpose inherits nothing by accident;
//   * where the consent question is actually ASKED, which differs per purpose and is the single
//     most misreadable thing here (see `gatedAt` on each entry).
// This object is DOCUMENTATION AND A LOOKUP, never an authorization: nothing in the runtime may
// treat a purpose's presence here as permission. The DB verbs are the only gate.
export const GOVERNED_EGRESS_PURPOSES = Object.freeze({
  wiki_synthesis: Object.freeze({
    purpose: "wiki_synthesis",
    description: "LLM synthesis of a client's CLARA-maintained advisory wiki page (Wave B W9).",
    consentRequired: true,
    consentSurface:
      "clara.client_egress_purpose_consents + clara.client_egress_purpose_activations"
      + " (live = revoked_at/deactivated_at is null), reached ONLY via"
      + " clara.prepare_egress_dispatch / clara.consume_egress_dispatch",
    // EVENT-driven: the projection consumer asks at dispatch time and records a DB-side hold.
    gatedAt: "dispatch (lib/wiki-projection.mjs)",
    documentSha256: "forbidden (ck_egress_dispatch_authorizations_doc_sha: must be null)",
    heldStatePath: "clara.set_wiki_synthesis_hold / clara.wiki_synthesis_holds",
    dataClass: "client_confidential",
    engineIdRequired: true,
  }),
  statement_extraction: Object.freeze({
    purpose: "statement_extraction",
    description:
      "The bank-statement lane's SECOND reader — the typed vendor engine over a pdf/image"
      + " statement (Wave C-b, migration 0038). Reader-1 re-reads stored geometry and never"
      + " egresses; the csv/ofx statement_parse lane never egresses at all.",
    consentRequired: true,
    consentSurface:
      "clara.client_egress_purpose_consents + clara.client_egress_purpose_activations"
      + " (live = revoked_at/deactivated_at is null), reached ONLY via"
      + " clara.prepare_egress_dispatch / clara.consume_egress_dispatch",
    // ENQUEUE-gated, and that is structural rather than stylistic: the ratified ADR-0020 §6
    // byte-identity battery pins claim_document_processing_task's prosrc and asserts it carries
    // NO call edge into the typed-consent surface, so the gate CANNOT live in the claim body.
    // The dispatch pair still wraps the vendor call — enqueue answers "may we", dispatch
    // answers "may we still, right now".
    gatedAt: "enqueue (clara._enqueue_invoice_facts_core) + dispatch (statementFacts.v1.behavior.mjs)",
    documentSha256: "required (ck_egress_dispatch_authorizations_doc_sha: must be non-null)",
    // No hold relation: a refusal settles the TASK terminally through the audited writer.
    heldStatePath:
      "none — clara.fail_statement_facts(task,'consent_inactive'), or the enqueue gate's"
      + " never-claimed failed receipt ('consent_inactive' / 'statement_multi_client')",
    dataClass: "client_confidential",
    engineIdRequired: true,
  }),
  witness_extraction: Object.freeze({
    purpose: "witness_extraction",
    description:
      "The LLM witness pair over ONE document — BOTH channels under this one purpose (F-A1"
      + " design §3.5, owner ruling OQ-2). The vision channel sends the client's original filed"
      + " bytes; the TEXT channel re-sends OCR-derived client content to the vendor, which is an"
      + " egress event under law 58's plain reading and not a local read.",
    consentRequired: true,
    consentSurface:
      "clara.client_egress_purpose_consents + clara.client_egress_purpose_activations"
      + " (live = revoked_at/deactivated_at is null), reached ONLY via"
      + " clara.prepare_egress_dispatch / clara.consume_egress_dispatch",
    gatedAt: "enqueue (clara._enqueue_invoice_facts_core, 0090 §7e) + dispatch, ONCE PER CHANNEL"
      + " (witnessFacts.v1.behavior.mjs) — two authorizations per document, never one shared",
    documentSha256: "required (ck_egress_dispatch_authorizations_doc_sha: must be non-null)",
    // Stated honestly: unlike the statement lane there is no `fail_witness_facts` verb in the
    // merged estate, so a dispatch-time refusal cannot settle the task with its named reason.
    // It is recorded as a clara.llm_usage_events row with outcome='refused' and the task is left
    // to the DB's own per-lane attempt cap, which settles it 'attempt_cap' with
    // document.llm_witness_failed. The enqueue gate DOES mint named receipts.
    heldStatePath:
      "none — the enqueue gate mints a never-claimed failed receipt ('witness_consent_inactive'"
      + " / 'witness_multi_client'); a dispatch-time refusal records clara.llm_usage_events"
      + " outcome='refused' and the claim-time attempt cap settles the task",
    dataClass: "client_confidential",
    engineIdRequired: true,
  }),
});
