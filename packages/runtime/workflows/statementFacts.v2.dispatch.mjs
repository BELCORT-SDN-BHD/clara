// @frozen
//
// statementFacts_v2 — THE DB-VERB PLUMBING for the `statement_facts` WITNESS PAIR (F-A1 PR-4,
// design §3.7). Authorization, the pinned reads, the reading-order citation-region reader,
// metering, and the terminal settle. Split into its own file for the SAME reason
// witnessFacts.v1.dispatch.mjs is split from its behaviour (the repo's 500-line file gate) —
// everything here is a call into a named DB verb or relation, and nothing here decides what a
// read MEANS.
//
// DUPLICATED FROM witnessFacts.v1.dispatch.mjs BY DESIGN, NOT BY OVERSIGHT (the chatTurn_v8
// law: a versioned workflow must never couple its shape to another workflow FAMILY's frozen
// file). `hasStatementWitnessSurface`, `prepareStatementWitnessDispatch`,
// `consumeStatementWitnessDispatch`, `readStatementWitnessContext`, `readStatementWitnessTaskStatus`,
// the reading-order region reader and `recordStatementWitnessUsage` are the SAME MECHANISM as
// their witnessFacts.v1 counterparts — same DB verbs, same arities, same ordering arguments —
// re-implemented here so statementFacts and witnessFacts can each version independently without
// an edit to one ever silently reaching the other's frozen hash.
//
// THE CLAIM ITSELF IS NOT HERE. `claimStatementFactsTaskStep` is imported UNCHANGED from
// statementFacts.v1.impl.ts in statementFacts.v2.impl.ts — that is a SAME-FAMILY, CROSS-VERSION
// reuse (the chatTurn.v10->v11 precedent: "the coding lane ... are v10's bodies, reached by
// IMPORT rather than by copy, so they cannot drift"), which is a different case from the
// cross-FAMILY duplication this file practises. The claim mechanism (`claim_document_processing_task`,
// 3-arg, the global kill-switch boolean) is byte-identical for both statement lanes and both
// statementFacts versions, so importing it is the precedent-correct choice; duplicating it here
// would be the SAME kind of drift risk the v10->v11 ruling was written to avoid.

/** The typed governed-egress purpose the witness pair dispatches under. Reuses the SAME token
 *  witnessFacts.v1 uses (design §3.7: "witness_extraction", not a new purpose) — the purpose
 *  names the KIND of act (a witness-pair vendor read), not the document kind. */
export const STATEMENT_WITNESS_PURPOSE = "witness_extraction";
/** The dispatch intent's event type — DISTINCT from both witnessFacts.v1's "witness.extraction"
 *  and statementFacts.v1's own "statement.extraction", so a statement-witness authorization can
 *  never be confused with either sibling lane's. Task-driven: event_seq is the task's own
 *  version_n. */
export const STATEMENT_WITNESS_EVENT_TYPE = "statement.witness";

/** The vision channel's pre-egress byte cap. Same value and same reasoning as
 *  WITNESS_MAX_VISION_BYTES (witnessFacts.v1.dispatch.mjs): well above intake's own 20 MB
 *  admission ceiling, so this is a belt on an already-narrower door. */
export const STATEMENT_WITNESS_MAX_VISION_BYTES = 30_000_000;

export function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

export async function callWriter(withRuntime, sql, params) {
  return withRuntime(async (client) => {
    const out = await client.query(sql, params);
    return receipt(out.rows[0]);
  });
}

/** PER-TASK SURFACE GUARD, evaluated per call and never cached (the wiki-projection §10.2
 *  idiom every sibling lane follows). EXACT signatures via `to_regprocedure`. Deploy order is
 *  runtime-image-FIRST (the same order witnessFacts.v1 and statementFacts.v1 both shipped
 *  under): `clara.persist_statement_facts_v2(uuid,jsonb)` does not exist on this branch's
 *  migrations yet, so this image can legitimately meet a database that has not gained it. In
 *  that window the model is NEVER called — the guard WAITS rather than terminal-failing (see
 *  the behaviour's `statementWitnessWait`), exactly the witnessFacts.v1 precedent for
 *  `clara.fail_witness_facts` before PR-3. */
export async function hasStatementWitnessSurface(client) {
  const r = await client.query(
    "select to_regprocedure('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.witness_citation_regions(uuid)') is not null"
    + " and to_regprocedure('clara.persist_statement_facts_v2(uuid,jsonb)') is not null"
    + " and to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is not null"
    + " as surface",
  );
  return r.rows[0]?.surface === true;
}

/** PLAN-TIME verdict, sha-bound. Returns the DB's payload verbatim; a 42501 here is a GRANT GAP
 *  in the deployment, never bad data, and propagates. */
export async function prepareStatementWitnessDispatch(client, { firmId, clientId, eventSeq, documentSha256 }) {
  const r = await client.query("select clara.prepare_egress_dispatch($1,$2,$3,$4,$5,$6) as v", [
    firmId, clientId, STATEMENT_WITNESS_PURPOSE, eventSeq, STATEMENT_WITNESS_EVENT_TYPE, documentSha256,
  ]);
  return r.rows[0]?.v ?? { verdict: "unknown", authorization_id: null };
}

/** THE DISPATCH LINEARIZATION POINT, in its OWN committed transaction — same reasoning as
 *  witnessFacts.v1's `consumeWitnessDispatch`: a pooled connection could otherwise return
 *  `granted` from an uncommitted consume, so the explicit begin/commit makes `granted` MEAN
 *  committed before the model is ever called. */
export async function consumeStatementWitnessDispatch(client, { firmId, authorizationId, clientId, eventSeq, documentSha256 }) {
  await client.query("begin");
  let r;
  try {
    r = await client.query("select clara.consume_egress_dispatch($1,$2,$3,$4,$5,$6,$7) as v", [
      firmId, authorizationId, clientId, STATEMENT_WITNESS_PURPOSE, eventSeq, STATEMENT_WITNESS_EVENT_TYPE, documentSha256,
    ]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
  return r.rows[0]?.v ?? { verdict: "unknown" };
}

/**
 * The task's own `version_n` and `engine_id` (both DB-owned — MAJOR-2's lesson, restated for
 * this lane: `persist_statement_facts_v2` must read `engine_id` off the task row, never a
 * literal this file invents), plus the document's single active-filing client, resolved through
 * the same serialized DB verb every lane uses (`clara.resolve_document_client`, 0020 §5).
 */
export async function readStatementWitnessContext(client, taskId, doc) {
  const t = await client.query(
    "select version_n, engine_id, status from clara.document_processing_tasks where id=$1", [taskId]);
  const row = t.rows[0] ?? {};
  const r = await client.query("select clara.resolve_document_client($1,$2) as r", [doc.firm_id, doc.document_id]);
  const resolved = r.rows[0]?.r ?? { status: "unresolved" };
  return {
    versionN: Number(row.version_n ?? 0),
    engineId: row.engine_id == null ? null : String(row.engine_id),
    clientStatus: String(resolved.status ?? "unresolved"),
    clientId: resolved.client_id ?? null,
  };
}

/** THE TASK'S STATUS, READ FRESH, immediately before EACH channel's dispatch — the two channels
 *  are separate steps minutes apart, and the kill switch can park a claimed task between them
 *  (statement_facts is bound to the same global switch statementFacts.v1's OCR lane was). */
export async function readStatementWitnessTaskStatus(client, taskId) {
  const r = await client.query("select status from clara.document_processing_tasks where id=$1", [taskId]);
  return r.rows[0]?.status == null ? null : String(r.rows[0].status);
}

/** The pinned OCR extraction the TEXT channel reads and pins itself to: the newest DONE
 *  `engine_kind='ocr'` extraction of this document (the same live-generation ordering
 *  `readPinnedOcrExtraction` in witnessFacts.v1.dispatch.mjs uses, and the SAME substrate
 *  statementFacts.v1's reader-1 layout parse consumes — this pair reads the intake OCR pass,
 *  never a statement-specific extraction of its own). */
export async function readPinnedStatementOcrExtraction(client, doc) {
  const r = await client.query(
    "select id, page_count from clara.document_extractions"
    + " where document_id=$1 and firm_id=$2 and engine_kind='ocr' and status='done'"
    + " order by version_n desc, id desc limit 1",
    [doc.document_id, doc.firm_id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { id: String(row.id), pageCount: Number.isInteger(row.page_count) ? row.page_count : null };
}

/** The top-left corner of a flat `[x0,y0,x1,y1,…]` polygon, for READING-ORDER presentation
 *  only — identical to witnessFacts.v1.dispatch.mjs's `topLeft`. A malformed/absent polygon
 *  sorts LAST rather than claiming the top of the page. */
function topLeft(locator) {
  const poly = Array.isArray(locator?.polygon) ? locator.polygon : [];
  let minX = Infinity;
  let minY = Infinity;
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const x = Number(poly[i]);
    const y = Number(poly[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (y < minY) minY = y;
      if (x < minX) minX = x;
    }
  }
  return { x: minX, y: minY };
}

/**
 * THE ONE CITATION-REGION NUMBERING, PRESENTED IN READING ORDER — identical mechanism to
 * witnessFacts.v1.dispatch.mjs's `readCitationRegions`: the NUMBER is
 * `clara.witness_citation_regions`'s own ordinal (never recomputed here), the ORDER is
 * presentation (page, top-left y, top-left x — reading order), because the ordinal is over
 * UUIDs and is effectively random with respect to the page. Reused here purely as a reading
 * substrate for the TEXT channel (this file's header explains why no citation is asked back).
 */
export async function readStatementWitnessCitationRegions(client, ocrExtractionId) {
  const r = await client.query(
    "select w.idx, w.page, w.text_content, r.locator"
    + " from clara.witness_citation_regions($1) w"
    + " join clara.document_regions r on r.id = w.region_id",
    [ocrExtractionId],
  );
  return r.rows
    .map((row) => ({
      idx: Number(row.idx),
      page: row.page == null ? null : Number(row.page),
      text_content: String(row.text_content ?? ""),
      at: topLeft(row.locator),
    }))
    .sort((a, b) => {
      const pa = a.page == null ? Number.MAX_SAFE_INTEGER : a.page;
      const pb = b.page == null ? Number.MAX_SAFE_INTEGER : b.page;
      if (pa !== pb) return pa - pb;
      if (a.at.y !== b.at.y) return a.at.y - b.at.y;
      if (a.at.x !== b.at.x) return a.at.x - b.at.x;
      return a.idx - b.idx;
    })
    .map(({ idx, page, text_content }) => ({ idx, page, text_content }));
}

/**
 * ONE metering row per model call — including a call that FAILED or was REFUSED (law 76: this
 * records spend, it never gates it). Best-effort: a metering write must never be the thing that
 * loses a read the firm already paid for. `engineId` is always the TASK's own stamp
 * (`readStatementWitnessContext`'s `engineId`), never a literal this file invents.
 */
export async function recordStatementWitnessUsage(withRuntime, { doc, taskId, channel, engineId, promptHash, usage, outcome }) {
  if (!engineId) return null;
  try {
    return await withRuntime(async (client) => {
      const r = await client.query(
        "select clara.record_llm_usage_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id",
        [
          doc.firm_id, doc.document_id, taskId, channel, engineId, promptHash ?? null,
          Number.isInteger(usage?.input_tokens) ? usage.input_tokens : null,
          Number.isInteger(usage?.output_tokens) ? usage.output_tokens : null,
          Number.isInteger(usage?.duration_ms) ? usage.duration_ms : null,
          outcome,
        ],
      );
      return r.rows[0]?.id ?? null;
    });
  } catch {
    return null;
  }
}

/**
 * THE TERMINAL SETTLE. `clara.fail_statement_facts(task, reason)` ALREADY EXISTS and is
 * ALREADY DEPLOYED (0038:2046 — unlike witnessFacts.v1's `fail_witness_facts`, there is no
 * ordering-window gap to defend against here: this lane's fail path has been live since Wave
 * C-b). It passes the statement taxonomy through VERBATIM and clamps anything it does not
 * recognise to `engine_error` rather than raising — so this call can never itself wedge a task,
 * and the try/catch below is defence-in-depth only (a settle failure must never mask the
 * refusal the caller is about to throw).
 */
export async function settleStatementWitnessFailure(withRuntime, taskId, code, log = console.error) {
  try {
    const out = await callWriter(withRuntime, "select clara.fail_statement_facts($1,$2) as receipt", [taskId, code]);
    return { settled: true, reason: String(out?.reason ?? code) };
  } catch (err) {
    log(`[statement-witness] task ${taskId} could NOT be settled '${code}': ${err?.message ?? err}`);
    return { settled: false, reason: "settle_failed" };
  }
}
