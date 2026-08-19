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

/**
 * HOW LONG A CLAIMED TASK MAY KEEP WAITING (review D1).
 *
 * THE WEDGE THIS CLOSES, measured at the claim body's bytes rather than assumed. A WAIT rethrows
 * so the step retries — and the first cut claimed "the DB's per-document attempt cap bounds the
 * total", WHICH IS FALSE. The attempt cap lives in `claim_document_processing_task`, and that
 * body returns the replayed branch only for the SAME workflow_run_id; ANY other run meets
 * `if t.status<>'queued' then raise CLR16` (0090 §5). So once a task is `running`, no later run
 * can re-claim it, `attempt_count` never increments again, and the cap never fires. A task that
 * waits forever holds one of the lane's two concurrency slots forever, and two of them wedge the
 * firm's whole witness lane — the exact failure the terminal settle exists to prevent, reached
 * through the one door that had no bound on it.
 *
 * THE SCENARIO THAT GETS THERE: a rolling deploy where one instance carries a different
 * CLARA_WITNESS_MODEL_ID than the router's stamped engine_id. Every attempt fails the
 * engine-stamp guard, which is deliberately a WAIT (the right image makes the same task succeed),
 * so the task retries, is re-driven, waits again — and never dies. Two such documents and the
 * lane stops.
 *
 * THE MECHANISM, chosen because it is PROVABLE rather than plausible. A per-step counter cannot
 * work: a durable step memoizes its RETURN VALUE, and a step that throws has none, so nothing a
 * failing step computes survives its own retry. The task's own `started_at` does survive — it is
 * DB-owned, written once at claim time, and readable by every attempt in every run and every
 * process. So the bound is wall-clock since the claim, evaluated by the DATABASE's clock (never
 * the runtime's, which can skew between instances). 45 minutes is far past any legitimate
 * transient — the longest honest wait here is an OCR pass that has not landed — and far short of
 * leaving a slot held for a shift.
 */
export const WITNESS_WAIT_BUDGET_MS = 45 * 60 * 1000;

/** The code a wait-exhausted task settles with. NEW VOCABULARY: `ck_processing_task_error_code_f_a1`
 *  (0090 §8) does not admit it yet — PR-3's migration must add it beside the two witness consent
 *  codes. Until then the settle is refused by the CHECK and `settleWitnessFailure` degrades to its
 *  loud fallback, exactly as it does for the absent verb. Stated, not smuggled. */
export const WITNESS_WAIT_EXHAUSTED = "wait_exhausted";

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

/**
 * Has this claimed task been waiting past its budget (review D1)? Compared by the DATABASE's
 * clock against the DB-owned `started_at`, so the answer is the same from every instance in a
 * rolling deploy — a runtime-side `Date.now()` would let a skewed clock give two instances two
 * different verdicts about the same task.
 *
 * Read POSITIVELY and fail toward CONTINUING to wait: only a row this query actually SAW, with a
 * non-null `started_at` genuinely older than the budget, returns true. A missing row or a null
 * `started_at` returns false — killing a task on the strength of an absence would turn a read
 * failure into a settled document.
 */
export async function waitBudgetExhausted(client, taskId, budgetMs = WITNESS_WAIT_BUDGET_MS) {
  const r = await client.query(
    "select (started_at is not null and now() - started_at > make_interval(secs => $2::numeric)) as spent,"
    + " extract(epoch from (now() - started_at)) as waited_s"
    + " from clara.document_processing_tasks where id=$1",
    [taskId, budgetMs / 1000],
  );
  return { spent: r.rows[0]?.spent === true, waitedSeconds: Number(r.rows[0]?.waited_s ?? 0) };
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

/** The bounding box of a flat `[x0,y0,x1,y1,…]` polygon, for READING-ORDER presentation only.
 *  A malformed or absent polygon sorts LAST rather than first: an unplaceable region must not
 *  claim the top of the page, and it still keeps its idx, so it stays fully citable. */
function boundingBox(locator) {
  const poly = Array.isArray(locator?.polygon) ? locator.polygon : [];
  let minX = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < poly.length; i += 2) {
    const x = Number(poly[i]);
    const y = Number(poly[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
    }
  }
  const height = Number.isFinite(minY) && Number.isFinite(maxY) ? maxY - minY : 0;
  return { x: minX, y: minY, height: height > 0 ? height : 0 };
}

/**
 * THE PAGE A REGION SORTS ON (review D4). `clara.witness_citation_regions` publishes
 * `locator->>'page'` only, so a row written before the producer carried both spellings publishes
 * a NULL page and would sort to the end of a multi-page document — scrambling reading order for
 * exactly the legacy documents that need it most.
 *
 * DUPLICATED FROM `lib/extraction-result.mjs`'s `regionPage`, DELIBERATELY, and this is the
 * chatTurn_v8 law rather than laziness: importing that module relatively would pull a tunable lib
 * module into THIS frozen closure, making every future edit to the ExtractionResult seam a
 * workflow-version change. The rule is stated once canonically there and mirrored here; the
 * batteries assert both against the same live locator shapes, so a divergence is a finding.
 *
 * The DISPLAYED marker is NOT this value — the prompt prints `w.page` and nothing else, so a
 * region whose page we only INFERRED sorts correctly while still showing no page number. Sorting
 * is a presentation guess; a printed page number is a claim.
 */
function sortPage(publishedPage, locator) {
  if (publishedPage != null) return publishedPage;
  for (const key of ["page", "page_number"]) {
    const raw = locator?.[key];
    if (raw == null) continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
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
  const rows = r.rows.map((row) => ({
    idx: Number(row.idx),
    // What the prompt PRINTS: the published page, or nothing. Never the inferred one.
    page: row.page == null ? null : Number(row.page),
    text_content: String(row.text_content ?? ""),
    // What the prompt SORTS on: the published page, falling back to the locator's other live
    // spelling (D4) so a pre-change multi-page document still reads down the page.
    sortPage: sortPage(row.page == null ? null : Number(row.page), row.locator),
    box: boundingBox(row.locator),
  }));

  // STRICT PASS: a total order, so the prompt is byte-stable across reads. A null page and a
  // malformed polygon both sort LAST — never invented as page 1, which would interleave
  // unplaceable regions through a real page's reading order.
  rows.sort((a, b) => {
    const pa = a.sortPage == null ? Number.MAX_SAFE_INTEGER : a.sortPage;
    const pb = b.sortPage == null ? Number.MAX_SAFE_INTEGER : b.sortPage;
    if (pa !== pb) return pa - pb;
    if (a.box.y !== b.box.y) return a.box.y - b.box.y;
    if (a.box.x !== b.box.x) return a.box.x - b.box.x;
    return a.idx - b.idx;
  });

  // LINE BANDING (review D7). Side-by-side columns — a label at x=0 and its amount at x=400 —
  // are almost never at the SAME y to the last decimal, so a strict y sort interleaves the two
  // columns and separates every label from its own figure: the shuffled-document defect again,
  // one level finer. Regions within half a line-height of each other are therefore treated as ONE
  // LINE and ordered left to right.
  //
  // BANDED BY A GREEDY SCAN, NOT BY A TOLERANT COMPARATOR. "|Δy| < tol" is not transitive — a
  // near b, b near c, a far from c — and Array.prototype.sort with an inconsistent comparator has
  // no defined result at all. Grouping first, then sorting WITHIN each group by x, is a total
  // order in both passes and gives the same answer every time.
  const banded = [];
  let line = [];
  let anchor = null;
  const flush = () => {
    if (line.length === 0) return;
    line.sort((a, b) => (a.box.x - b.box.x) || (a.idx - b.idx));
    banded.push(...line);
    line = [];
  };
  for (const row of rows) {
    const sameBand = anchor
      && anchor.sortPage === row.sortPage
      && Number.isFinite(anchor.box.y) && Number.isFinite(row.box.y)
      // Tolerance from the SMALLER of the two heights, so a tall block never swallows a line
      // beside it. Zero-height or unknown geometry gets no tolerance: it bands only with an
      // exactly-equal y, which is the honest reading of "we do not know how tall this is".
      && Math.abs(row.box.y - anchor.box.y) <= 0.5 * Math.min(anchor.box.height, row.box.height);
    if (!sameBand) {
      flush();
      anchor = row;
    }
    line.push(row);
  }
  flush();
  return banded.map(({ idx, page, text_content }) => ({ idx, page, text_content }));
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
