// @frozen
//
// witnessFacts_v1 — THE DB-VERB PLUMBING: authorization, the reads the lane pins itself to,
// metering, and the terminal settle. Split out of witnessFacts.v1.behavior.mjs at the PR-2
// review fold (the file crossed the repo's 500-line gate); the seam is a real one — everything
// here is a call into a named DB verb or relation, and nothing here decides what a read MEANS.
// It is a frozen-closure member exactly like its caller: behavior.mjs imports it relatively, so
// freeze-lint hash-locks it and a change is a witnessFacts.v2.

/** The typed governed-egress purpose BOTH channels dispatch under (design §3.5, OQ-2). */
export const WITNESS_PURPOSE = "witness_extraction";
/** The dispatch intent's event type. This lane is TASK-driven, so the "event" is the task's own
 *  version_n — stated here rather than borrowed silently from the wiki or statement lane. */
export const WITNESS_EVENT_TYPE = "witness.extraction";

/** The vision channel's pre-egress byte cap (review N5). A provider request carries the document
 *  base64-encoded — ~1.37× on the wire — so a document this size is refused BEFORE any
 *  authorization is minted rather than after a multi-minute upload dies at the vendor. 30 MB is
 *  well above intake's own 20 MB admission ceiling (lib/intake.mjs MAX_BYTES), so this is a
 *  belt on a door that is already narrower, not a new product limit. */
export const WITNESS_MAX_VISION_BYTES = 30_000_000;

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
 *  idiom). EXACT signatures via `to_regprocedure` — an overloaded-name `to_regproc` check cannot
 *  tell one arity from another. Deploy order is runtime-image-FIRST, so this image can
 *  legitimately meet a database without the witness surface; in that window the model is NEVER
 *  called. Degrading to a narrower arity would spend an authorization carrying no document
 *  binding at all — the substitution the sha binding exists to stop.
 *
 *  `fail_witness_facts` is deliberately NOT in this list: it ships in PR-3's migration, i.e.
 *  AFTER this image, and requiring it here would make the whole lane wait on a verb that only
 *  the failure path needs. Its absence is handled where it is called. */
export async function hasWitnessSurface(client) {
  const r = await client.query(
    "select to_regprocedure('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.witness_citation_regions(uuid)') is not null"
    + " and to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null"
    + " and to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is not null"
    + " as surface",
  );
  return r.rows[0]?.surface === true;
}

/** PLAN-TIME verdict, sha-bound. Returns the DB's payload verbatim; a 42501 here is a GRANT GAP
 *  in the deployment, never bad data, and propagates. */
export async function prepareWitnessDispatch(client, { firmId, clientId, eventSeq, documentSha256 }) {
  const r = await client.query("select clara.prepare_egress_dispatch($1,$2,$3,$4,$5,$6) as v", [
    firmId, clientId, WITNESS_PURPOSE, eventSeq, WITNESS_EVENT_TYPE, documentSha256,
  ]);
  return r.rows[0]?.v ?? { verdict: "unknown", authorization_id: null };
}

/** THE DISPATCH LINEARIZATION POINT, in its OWN committed transaction. A PostgreSQL function
 *  cannot commit its caller's transaction, so on a pooled connection `granted` could come back
 *  from an UNCOMMITTED consume — the model would then be called on an authorization a revoker
 *  still sees as unspent, and a rollback would erase the record that the bytes left. The
 *  explicit begin/commit makes `granted` MEAN committed. The full intent, sha included, is
 *  presented again so an authorization minted for document A cannot be spent on document B. */
export async function consumeWitnessDispatch(client, { firmId, authorizationId, clientId, eventSeq, documentSha256 }) {
  await client.query("begin");
  let r;
  try {
    r = await client.query("select clara.consume_egress_dispatch($1,$2,$3,$4,$5,$6,$7) as v", [
      firmId, authorizationId, clientId, WITNESS_PURPOSE, eventSeq, WITNESS_EVENT_TYPE, documentSha256,
    ]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
  return r.rows[0]?.v ?? { verdict: "unknown" };
}

/**
 * The task's own `version_n` and `engine_id` (both DB-owned: `persist_witness_facts` reads them
 * off the same row, so nothing here may invent either), plus the document's single active-filing
 * client. `document_processing_tasks` carries no client binding, so consent resolves through the
 * document's filings — and that resolution belongs to the serialized DB verb
 * (`clara.resolve_document_client`, 0020 §5), never to a read this file assembles for itself.
 */
export async function readWitnessContext(client, taskId, doc) {
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

/** THE TASK'S STATUS, READ FRESH (review M5). The two channels are separate steps minutes apart,
 *  and between them the global kill switch can flip a claimed task to `held_egress`
 *  (`claim_document_processing_task`'s hold branch) or a human can settle it. Re-using the status
 *  captured at the start of the first channel would let the second channel egress on a task the
 *  DB has since parked — a derived state standing in for a fact. Read at the last moment before
 *  each dispatch instead. */
export async function readTaskStatus(client, taskId) {
  const r = await client.query("select status from clara.document_processing_tasks where id=$1", [taskId]);
  return r.rows[0]?.status == null ? null : String(r.rows[0].status);
}

/** The PINNED OCR extraction the text channel reads and pins itself to: the newest DONE
 *  `engine_kind='ocr'` extraction of this document, by the live generation order
 *  (`version_n desc, id desc` — 0054:242-245's own distinct-on ordering, so the pin names the
 *  same generation every other reader would resolve). Its `page_count` rides along as the pair's
 *  honest page count: `clara_runtime` holds no SELECT on `clara.documents`, and the pages the OCR
 *  pass actually read is a measured number rather than a guessed one. */
export async function readPinnedOcrExtraction(client, doc) {
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

/** The top-left corner of a flat `[x0,y0,x1,y1,…]` polygon, for READING-ORDER presentation only.
 *  A malformed or absent polygon sorts LAST rather than first: an unplaceable region must not
 *  claim the top of the page, and it still keeps its idx, so it stays fully citable. */
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
 * THE ONE CITATION NUMBERING (0095 §1, review M5), PRESENTED IN READING ORDER (review B2).
 *
 * Two separate things, and conflating them was the defect this shape fixes:
 *   * THE NUMBER is `clara.witness_citation_regions`' ordinal — `row_number() over (order by id)`
 *     over UUIDs. It is the WRITE CONTRACT: the writer resolves a citation's idx through the
 *     identical expression, so it is copied through verbatim and never recomputed here.
 *     `clara.get_document_extract`'s `idx` is a DIFFERENT ordinal (0054:32-42) and must never be
 *     used — it would resolve a citation to the wrong region the moment the document carries a
 *     second done extraction, which is exactly the state a witness document is in.
 *   * THE ORDER is presentation. Because the ordinal is over uuids it is effectively RANDOM with
 *     respect to the page, so the un-sorted list handed a model a SHUFFLED document: labels
 *     separated from their amounts, a total above its own subtotal. Reading a shuffled invoice
 *     is a strictly harder task than reading a printed one, and the whole cite-and-verify design
 *     assumes the witness can see context around a figure.
 *
 * So the rows are joined to `clara.document_regions` (clara_runtime holds SELECT) for their
 * geometry and sorted by (page, top-left y, top-left x) — reading order — while each keeps the
 * DB's own idx. The idx is the key; the position is only presentation.
 */
export async function readCitationRegions(client, ocrExtractionId) {
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
      // A null page sorts LAST for the same reason a malformed polygon does — never invented as
      // page 1, which would interleave unplaceable regions through a real page's reading order.
      const pa = a.page == null ? Number.MAX_SAFE_INTEGER : a.page;
      const pb = b.page == null ? Number.MAX_SAFE_INTEGER : b.page;
      if (pa !== pb) return pa - pb;
      if (a.at.y !== b.at.y) return a.at.y - b.at.y;
      if (a.at.x !== b.at.x) return a.at.x - b.at.x;
      return a.idx - b.idx;   // total order, so the prompt is byte-stable across reads
    })
    .map(({ idx, page, text_content }) => ({ idx, page, text_content }));
}

/**
 * ONE metering row per model call — including a call that FAILED or was REFUSED (design §3.6,
 * law 76: this records spend, it never gates it). Best-effort by construction: a metering write
 * must never be the thing that loses a read the firm already paid for, so a failure here is
 * swallowed. `engine_id` is the TASK's own stamp, never a literal from this file.
 */
export async function recordUsage(withRuntime, { doc, taskId, channel, engineId, promptHash, usage, outcome }) {
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
 * THE TERMINAL SETTLE (review B1). A refusal or a permanent fault must leave the task DEAD, not
 * running: a task left claimed holds one of the lane's two concurrency slots until the stranded
 * sweep re-drives it, and two of them wedge the whole firm's witness lane.
 *
 * ORDERING SAFETY, because this verb does not exist yet. `clara.fail_witness_facts` ships in
 * PR-3's migration, and this image (v64) deploys BEFORE that migration applies — the
 * runtime-image-first order every lane here follows. The call site is nevertheless UNREACHABLE
 * during that gap: nothing mints an `llm_witness` task until PR-3's router recut, so there is no
 * task for this function to settle. The window is real on paper and empty in fact.
 *
 * The defensive catch is for the case that argument is wrong. A 42883 (undefined_function) falls
 * back to the pre-B1 shape — the `llm_usage_events` row the caller has already written stands as
 * the receipt, and the FatalError still ends the run visibly — and says so LOUDLY, because a
 * silent fallback here is a wedged lane nobody is told about. Any other error is swallowed the
 * same way: a settle failure must never mask the original refusal the caller is about to throw.
 *
 * @returns {Promise<{settled: boolean, reason: string}>}
 */
export async function settleWitnessFailure(withRuntime, taskId, code, log = console.error) {
  try {
    const out = await callWriter(withRuntime, "select clara.fail_witness_facts($1,$2) as receipt", [taskId, code]);
    return { settled: true, reason: String(out?.reason ?? code) };
  } catch (err) {
    const undefinedFunction = err?.code === "42883";
    log(
      `[witness] task ${taskId} could NOT be settled '${code}': `
      + (undefinedFunction
        ? "clara.fail_witness_facts is absent on this database (PR-3's migration has not applied). "
          + "Falling back to the usage-row receipt; the task stays claimed until the reconciler "
          + "re-drives it and the per-lane attempt cap ends it. If llm_witness tasks exist on "
          + "this deployment, the PR-2-image-before-PR-3-migration window is NOT empty and the "
          + "lane can wedge — apply the migration."
        : `${err?.message ?? err}`),
    );
    return { settled: false, reason: undefinedFunction ? "verb_absent" : "settle_failed" };
  }
}
