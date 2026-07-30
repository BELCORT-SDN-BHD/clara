// @frozen
//
// Behavioral closure for statementFacts_v1 (Wave C-b — `docs/plan/wave-c-b-bank-design.md`
// §4.3, §4.4; part2 §5). ONE frozen workflow serves BOTH statement lanes, branching on the
// claimed task's own `lane` — the documentIngest ocr/structured_parse precedent:
//
//   * `statement_facts`  — pdf/image. TWO INDEPENDENT READERS. Reader-1 is a deterministic
//     table extraction over the layout geometry the intake OCR pass already committed (no
//     new egress, no vendor). Reader-2 is the typed engine behind the injected service seam
//     (Azure DI prebuilt bank-statement). Corroboration is computed HERE — full load-bearing
//     header + the per-line numeric skeleton + the chain — and shipped in the persist
//     payload as evidence the DB re-derives for itself.
//   * `statement_parse`  — csv/ofx. ONE deterministic in-process parse; THE CHAIN IS THE
//     SECOND READER (WC-R7). No vendor, no egress, no page budget.
//
// WHY THE CONSENT DISPATCH IS HERE AND NOWHERE ELSE (design §4.4, [RV]). The ratified 0020
// §6 byte-identity battery pins `claim_document_processing_task`'s prosrc and asserts it
// carries NO call edge into the typed-consent surface — so the typed gate must NOT live in
// the claim body. It lives at ENQUEUE (the DB router) and at EGRESS TIME (this file). The
// two-phase pair wraps ONLY the reader-2 vendor call: reader-1 re-reads stored geometry and
// the structured lane never egresses, so neither touches an authorization. `prepare` mints
// the authorization; `consume` — in its OWN committed transaction, immediately before the
// vendor call — is the dispatch linearization point, so a deactivation that committed since
// prepare refuses here and the bytes never leave. This is the `wiki-projection.mjs` pattern
// with ONE difference, stated because it matters: the wiki lane is EVENT-driven, this lane
// is TASK-driven, so the dispatch intent is `event_type='statement.extraction'` with
// `event_seq` = the task's own `version_n`.
//
// AUDIT-TRAIL HONESTY (design §4.4, and it must never be softened). The typed authorization
// covers THIS statement-specific second read and nothing earlier. The kind-blind intake OCR
// pass — the one that produced the very geometry reader-1 consumes — egressed under the
// GLOBAL switch and the engagement-letter consent, before any typed gate could see the
// document's kind. Nothing in this file, and nothing in the payload it builds, may assert
// otherwise. Typing that first pass is a named future wave.
//
// FAIL-CLOSED ON A MISSING SURFACE. Deploy order is runtime-image-FIRST (design §5), so
// this image can run against a database that has not yet gained the sha-bound overloads. In
// that window the vendor is NEVER called: the surface guard refuses and the step throws.
// Degrading to the 5-arg wiki arity would spend an authorization that carries no document
// binding at all — precisely the substitution the sha binding exists to stop.
//
// TERMINAL vs RETRYABLE, unchanged from the ratified classification. `RETRYABLE` is copied
// VERBATIM from `invoiceFacts.v1.behavior.mjs` — one ratified set, not reinvented here.
// Transient vendor/storage faults THROW so the step is retried (WDK step retry + the
// reconciler's stranded-run sweep; the DB's per-document attempt cap bounds the total). A
// statement that cannot be read is TERMINAL immediately, settled through
// `fail_statement_facts` with a code from the design's own taxonomy — and the honest human
// remedy is `enter_bank_statement`, never a guess.
//
// NO SHAPE COUPLING TO ANOTHER WORKFLOW FAMILY. `interpretClaimReceipt` / `docFromReceipt`
// are DUPLICATED here rather than imported from the frozen invoiceFacts closure — the
// chatTurn_v8 law: a versioned workflow must never couple its shape to another workflow
// FAMILY's frozen file. Cross-referenced deliberately; kept in step by review, not by
// import.

/** The typed governed-egress purpose this lane dispatches under (design §4.4, WCB-R1). */
const STATEMENT_PURPOSE = "statement_extraction";
/** The dispatch intent's event type. This lane is TASK-driven, so the "event" is the task's
 *  own version — stated in the design rather than borrowed silently from the wiki lane. */
const STATEMENT_EVENT_TYPE = "statement.extraction";

/** Copied VERBATIM from invoiceFacts.v1.behavior.mjs's own RETRYABLE. `internal` is
 *  deliberately NOT retryable, matching that file: fail closed on the unknown. */
const RETRYABLE = new Set(["engine_error", "timeout", "engine_lost", "storage_error"]);

/** Codes `fail_statement_facts` is called with. The design §4.3 taxonomy plus the generic
 *  engine vocabulary `ck_processing_task_error_code_0016` already admits, plus
 *  `consent_inactive` (design §5 widens the CHECK for it). A code outside this set would be
 *  clamped by the DB writer, so the mapping is explicit rather than hopeful.
 *
 *  DUPLICATED, deliberately, from `lib/statement-corroboration.mjs`'s
 *  STATEMENT_FAILURE_CODES: that one is the PURE design taxonomy the readers raise, this one
 *  is the WIDER set this workflow may hand the writer (it also covers vendor/storage codes
 *  and the consent terminal). Importing it would drag the whole reader closure into the
 *  frozen import graph and make every parser tweak a workflow-version change. */
const FAILURE_CODES = new Set([
  "header_unreadable", "totals_unreadable", "readers_disagree", "chain_broken",
  "continuity_mismatch", "duplicate_period", "overlapping_period", "non_myr_statement",
  "account_unregistered", "account_inactive", "statement_multi_client", "period_invalid",
  "line_date_out_of_period", "consent_inactive",
  "engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted",
  "bad_type", "limit", "internal",
]);

function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

/** The typed refusal reason a clara CLR error carries in its jsonb detail. */
function claraReason(err) {
  try {
    return JSON.parse(err?.detail || "{}").reason ?? null;
  } catch {
    return null;
  }
}

function statementFailureCode(err) {
  const named = err?.code && FAILURE_CODES.has(String(err.code)) ? String(err.code) : null;
  if (named) return named;
  const reason = claraReason(err);
  if (reason && FAILURE_CODES.has(String(reason))) return String(reason);
  // `engine_unavailable` (the prebuilt model is not enabled on this resource) is a
  // DEPLOYMENT fact, not a document fact. Retrying it burns the attempt cap for nothing, so
  // it settles terminal + visible; the remedy is to enable the model (or key the statement
  // by hand) and re-enqueue.
  if (err?.code === "engine_unavailable") return "engine_error";
  return "internal";
}

async function callWriter(withRuntime, sql, params) {
  return withRuntime(async (client) => {
    const out = await client.query(sql, params);
    return receipt(out.rows[0]);
  });
}

/** PER-LANE SURFACE GUARD, evaluated per task and never cached (the wiki-projection §10.2
 *  idiom). EXACT signatures — `to_regprocedure`, never an overloaded-name `to_regproc`
 *  check, which cannot tell one arity from another. A plain catalog read: no EXECUTE
 *  needed, so it never fails for a privilege reason. */
async function hasStatementEgressSurface(client) {
  const r = await client.query(
    "select to_regprocedure('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)')"
    + " is not null as surface",
  );
  return r.rows[0]?.surface === true;
}

/** PLAN-TIME verdict, sha-bound (design §4.4's new overload). Returns the DB's payload
 *  verbatim; a 42501 here is a GRANT GAP in the deployment, never bad data, and propagates. */
async function prepareStatementDispatch(client, { firmId, clientId, eventSeq, documentSha256 }) {
  const r = await client.query(
    "select clara.prepare_egress_dispatch($1,$2,$3,$4,$5,$6) as v",
    [firmId, clientId, STATEMENT_PURPOSE, eventSeq, STATEMENT_EVENT_TYPE, documentSha256],
  );
  return r.rows[0]?.v ?? { verdict: "unknown", authorization_id: null };
}

/** THE DISPATCH LINEARIZATION POINT, in its OWN committed transaction. A PostgreSQL
 *  function cannot commit its caller's transaction, so on a pooled connection `granted`
 *  could otherwise be returned from an UNCOMMITTED consume — the vendor would then be called
 *  on an authorization a revoker can still see as unspent, and a later rollback would erase
 *  the record that the bytes left. The explicit begin/commit makes `granted` MEAN committed.
 *
 *  The FULL dispatch intent is presented again, including the document sha: the DB re-verifies
 *  that the authorization was minted for exactly this (firm, client, purpose, event, document)
 *  before consuming, so an authorization for document A can never be spent on document B. */
async function consumeStatementDispatch(client, { firmId, authorizationId, clientId, eventSeq, documentSha256 }) {
  await client.query("begin");
  let r;
  try {
    r = await client.query(
      "select clara.consume_egress_dispatch($1,$2,$3,$4,$5,$6,$7) as v",
      [firmId, authorizationId, clientId, STATEMENT_PURPOSE, eventSeq, STATEMENT_EVENT_TYPE, documentSha256],
    );
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
  return r.rows[0]?.v ?? { verdict: "unknown" };
}

/**
 * The task's own `version_n` (the dispatch intent's event_seq) and the document's single
 * active-filing client. `document_processing_tasks` carries NO client binding (design fact
 * 2.13), so consent must be resolved through the document's filings — and that resolution
 * belongs to the serialized DB verb (`clara.resolve_document_client`, 0020 §5), never to a
 * read this file assembles for itself.
 */
async function readStatementContext(client, taskId, doc) {
  const t = await client.query("select version_n from clara.document_processing_tasks where id=$1", [taskId]);
  const versionN = Number(t.rows[0]?.version_n ?? 0);
  const r = await client.query("select clara.resolve_document_client($1,$2) as r", [doc.firm_id, doc.document_id]);
  const resolved = r.rows[0]?.r ?? { status: "unresolved" };
  return { versionN, clientStatus: String(resolved.status ?? "unresolved"), clientId: resolved.client_id ?? null };
}

/**
 * Process one claimed statement task from its CLAIM-RECEIPT metadata (`doc`).
 *
 * @param services  injected infrastructure (temp files, canonical download, reader-1's DB
 *                  read + parse, the reader-2 engine, the structured parser, the
 *                  corroborator and the payload builder). NOT frozen — vendor/parser tuning
 *                  is never a workflow-version change (AB-16).
 * @param withRuntime the injected pool boundary.
 * @param doc       the flat document metadata the claim receipt carries (PIN-AB-6).
 */
export async function processStatementFactsBehavior(services, withRuntime, taskId, doc) {
  if (!doc || !doc.storage_path || !doc.sha256) return { taskId, status: "no_work" };
  if (doc.lane === "statement_facts") return processOcrLane(services, withRuntime, taskId, doc);
  if (doc.lane === "statement_parse") return processStructuredLane(services, withRuntime, taskId, doc);
  // A lane this workflow does not own must never be driven here — silently running an OCR
  // pass over, say, an invoice_facts task would spend real vendor egress on the wrong lane.
  return { taskId, status: "no_work", lane: doc.lane };
}

async function processOcrLane(services, withRuntime, taskId, doc) {
  const tempPath = services.taskTempPath(taskId);
  try {
    const ctx = await withRuntime((client) => readStatementContext(client, taskId, doc));
    if (ctx.clientStatus === "ambiguous") {
      return settleFailure(services, withRuntime, taskId, "statement_multi_client");
    }
    if (ctx.clientStatus !== "unique" || !ctx.clientId) {
      // ZERO active filings for a task that was enqueued with exactly one. A filing
      // correction in flight is the realistic cause and it may well land, so this THROWS
      // (retried) rather than settling a code that would misdescribe it — there IS no
      // honest code in the taxonomy for "the filing vanished under me". The DB's
      // per-document attempt cap is what bounds the retries — never an unbounded loop.
      throw Object.assign(new Error(`statement task ${taskId} resolves no active filing client`), {
        code: "internal",
        claraRetry: true,
      });
    }

    // READER-1 — deterministic, over geometry the intake pass already committed.
    const reader1 = await withRuntime((client) => services.readStatementLayout(client, {
      documentId: doc.document_id,
      firmId: doc.firm_id,
    }));
    if (Number(reader1?.receipt?.region_count ?? 0) === 0) {
      // NO layout extraction at all for this document — not an unreadable statement, an
      // absent substrate (the OCR pass has not landed, or its extraction was superseded).
      // It WAITS; settling `header_unreadable` here would blame the page for the pipeline.
      throw Object.assign(new Error(`statement task ${taskId} has no layout extraction to read`), {
        code: "internal",
        claraRetry: true,
      });
    }
    // PREFLIGHT reader-1 BEFORE any authorization is minted. `header_unreadable` /
    // `totals_unreadable` fire when EITHER read is short, so judging reader-1 alone can
    // never reach a different verdict than the full corroboration would — it just reaches
    // it before a client's bytes leave and before a single-use authorization is spent.
    const preflight = services.preflightRead(reader1, { requireTotals: true });
    if (preflight) return settleFailure(services, withRuntime, taskId, preflight.code);

    // Canonical bytes, sha-verified. Storage is not egress; doing it before `prepare` means
    // a storage fault never burns an authorization.
    await services.downloadCanonical(doc.storage_path, tempPath, doc.sha256);

    const surface = await withRuntime((client) => hasStatementEgressSurface(client));
    if (!surface) {
      // A DEPLOYMENT window, not a fact about this statement: the image shipped before the
      // migration (the binding order). It must WAIT, never settle — a terminal failure here
      // would permanently kill a task whose only problem is that the DB has not caught up.
      throw Object.assign(
        new Error("the sha-bound egress dispatch overloads are absent; refusing to call the vendor unauthorized"),
        { code: "internal", claraRetry: true },
      );
    }

    // PHASE 1 — prepare. `unknown` covers every non-granted state without distinction, and
    // this lane must not try to tell them apart: there is nothing in the payload that would
    // let it, and guessing would leak the consent state into a diagnostic.
    const prepared = await withRuntime((client) => prepareStatementDispatch(client, {
      firmId: doc.firm_id,
      clientId: ctx.clientId,
      eventSeq: ctx.versionN,
      documentSha256: doc.sha256,
    }));
    const authorizationId = prepared?.authorization_id ?? null;
    if (prepared?.verdict !== "granted" || !authorizationId) {
      return settleFailure(services, withRuntime, taskId, "consent_inactive");
    }

    // PHASE 2 — consume, IMMEDIATELY before the vendor call, in its own committed txn.
    const consumed = await withRuntime((client) => consumeStatementDispatch(client, {
      firmId: doc.firm_id,
      authorizationId,
      clientId: ctx.clientId,
      eventSeq: ctx.versionN,
      documentSha256: doc.sha256,
    }));
    if (consumed?.verdict !== "granted") {
      return settleFailure(services, withRuntime, taskId, "consent_inactive");
    }

    // READER-2 — the only vendor call on this lane, and the only line of this file that
    // sends bytes anywhere.
    const reader2 = await services.analyzeBankStatement(tempPath, doc.mime_type, doc);

    const agreed = services.corroborateTwoReaders(reader1, reader2);
    const payload = services.buildStatementPersistPayload({
      ingestMode: "ocr",
      agreed,
      reader1: { extraction_id: reader1?.extraction_id ?? null, source: "layout_geometry", engine_id: reader1?.engine_id ?? null },
      reader2: {
        extraction_id: null,
        source: "azure_bank_statement",
        engine_id: reader2?.engineId ?? null,
        raw_sha256: reader2?.rawSha256 ?? null,
        normalization_version: reader2?.normalizationVersion ?? null,
        pages_used: reader2?.pagesUsed ?? null,
      },
    });
    await callWriter(withRuntime, "select clara.persist_statement_facts($1,$2::jsonb) as receipt", [
      taskId,
      JSON.stringify(payload),
    ]);
    return { taskId, status: "done", lane: "statement_facts" };
  } catch (err) {
    return handleFailure(services, withRuntime, taskId, err, "statement_facts");
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}

async function processStructuredLane(services, withRuntime, taskId, doc) {
  const tempPath = services.taskTempPath(taskId);
  try {
    await services.downloadCanonical(doc.storage_path, tempPath, doc.sha256);
    // NO prepare/consume: this lane parses in-process and never egresses. Consent for it is
    // RECORDED at enqueue (design §4.3) — recorded, not dispatched, because there is no
    // dispatch to linearize.
    const reader = await services.parseStatementFile(tempPath, statementFormat(doc.mime_type));
    const agreed = services.corroborateChain(reader);
    const payload = services.buildStatementPersistPayload({
      ingestMode: "structured",
      agreed,
      reader1: { extraction_id: null, source: reader?.receipt?.reader ?? "structured", engine_id: null },
      reader2: null,
    });
    await callWriter(withRuntime, "select clara.persist_statement_facts($1,$2::jsonb) as receipt", [
      taskId,
      JSON.stringify(payload),
    ]);
    return { taskId, status: "done", lane: "statement_parse" };
  } catch (err) {
    return handleFailure(services, withRuntime, taskId, err, "statement_parse");
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}

/** mime → the structured parser's format token. Nothing else reaches this lane: the DB
 *  router admits csv/ofx mimes only (design §4.3). */
export function statementFormat(mime) {
  const m = String(mime ?? "").toLowerCase();
  if (m === "application/x-ofx" || m === "application/vnd.intu.qfx") return "ofx";
  if (m === "text/csv" || m === "text/tab-separated-values") return "csv";
  return m;
}

/** Terminal settle through the audited writer. A writer failure falls back to the local
 *  diagnostic note (the invoiceFacts shape) so the reason is never lost entirely. */
async function settleFailure(services, withRuntime, taskId, code) {
  try {
    await callWriter(withRuntime, "select clara.fail_statement_facts($1,$2) as receipt", [taskId, code]);
  } catch {
    await services.noteTaskFailure?.(taskId, code)?.catch?.(() => {});
  }
  return { taskId, status: "failed", code };
}

function handleFailure(services, withRuntime, taskId, err, lane) {
  const code = statementFailureCode(err);
  // Transient: rethrow so the step is retried. Nothing is persisted and the task stays
  // 'running' under this run's claim, so a later attempt's persist still passes the DB's
  // status guard — the documentIngest_v2 discipline, applied here for the same reason.
  //
  // `claraRetry` is the EXPLICIT non-settling marker for conditions that are neither a
  // vendor fault nor a fact about the document — a deployment window, or a filing
  // correction in flight. Without it those conditions fell into the terminal branch and
  // settled `internal`, permanently failing a task that only needed to wait. Caught by the
  // first orchestration smoke run; the marker is the fix, and it is deliberately explicit
  // rather than another opaque code in the RETRYABLE set.
  //
  // `engine_unavailable` is the ONE code that must not follow its mapping into the retry
  // set. It maps to `engine_error` because that is the vocabulary the DB writer stores, but
  // the CONDITION is a deployment fact (the prebuilt model is not enabled on this Azure
  // resource) that no number of retries will change — retrying it would burn the attempt cap
  // silently instead of surfacing a task a human can act on.
  const terminal = err?.code === "engine_unavailable";
  if (!terminal && (err?.claraRetry === true || RETRYABLE.has(code))) throw err;
  return settleFailure(services, withRuntime, taskId, code).then((out) => ({ ...out, lane }));
}

/** Pull the flat document metadata off a claim receipt (present only on the
 *  'running'/'replayed' branch, PIN-AB-6); null when the claim carried none. Duplicated
 *  from the invoiceFacts closure by design — see this file's header. */
export function docFromReceipt(r) {
  if (!r || r.storage_path == null || r.sha256 == null) return null;
  return {
    document_id: String(r.document_id ?? ""),
    firm_id: String(r.firm_id ?? ""),
    lane: String(r.lane ?? ""),
    storage_path: String(r.storage_path),
    sha256: String(r.sha256),
    mime_type: String(r.mime_type ?? ""),
    byte_size: Number(r.byte_size ?? 0),
  };
}

/**
 * Interpret a claim receipt (pure). Only a 'running' claim (including the same-run
 * 'replayed' branch — the DB neither increments nor re-checks the attempt cap on a
 * reattach) is claimed + carries metadata and proceeds. 'held_egress' parks; a terminal
 * 'failed' outcome (the DB's attempt cap: it ALREADY failed + refunded + evented the task)
 * is NOT claimed — the workflow simply ends with that status, never re-failing or
 * error-looping. Anything else is treated as not-claimed.
 */
export function interpretClaimReceipt(r) {
  const status = String(r?.status ?? "held_egress");
  const claimed = status === "running";
  return { claimed, status, doc: claimed ? docFromReceipt(r) : null };
}
