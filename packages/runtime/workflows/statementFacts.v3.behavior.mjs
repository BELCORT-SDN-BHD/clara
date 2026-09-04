// @frozen
//
// Behavioral closure for statementFacts_v3's `statement_facts` WITNESS PAIR. Copied from
// statementFacts.v2.behavior.mjs (F-A1 PR-4 — `docs/plan/active/f-a1-witness-pair-design.md`
// §3.7, §3.1, §3.4, §3.5) and edited for H-02 / H-03 / H-05; v2 stays exported and frozen.
// ONE document, TWO independent reads through TWO CHANNELS of the SAME provider, ONE persist:
//
//   * TEXT channel   — reads the pinned OCR extraction as NUMBERED REGIONS (the same substrate
//                      the invoice witness reads, and the same one statementFacts.v1's reader-1
//                      layout parse consumed).
//   * VISION channel — reads the ORIGINAL filed bytes. No regions, no citations.
//
// ============================== WHAT v3 CHANGES ==============================
//
// H-05 — THE PERSIST NOW SETTLES ITS OWN TASK, and this is the change that mattered most.
// v2's `withStatementTerminalSettle` wrapped ONLY the two read channels; the persist issued a
// BARE `callWriter` (v2:354-358) and its step had neither a try/catch nor the
// `rethrowStatementWitness` shaping the read steps got. So EVERY verdict
// `clara.persist_statement_facts_v2` / `_persist_statement_core_v2` RAISES — the whole design
// §4.3 taxonomy listed in `FAILURE_CODES` below — rolled its transaction back and left
// `document_processing_tasks.status = 'running'` FOREVER, with no card, no failure event and no
// refund. (The two account-binding verdicts escaped this because they are RETURNED, not raised,
// and the wrapper settles them itself inside the same transaction, 0098:756-793.) v3 wraps the
// whole persist — payload build included — in the SAME `withStatementTerminalSettle` the reads
// use, and gives the step the same rethrow shaping.
//
// AND THE REASON CODE HAD TO LEARN TO READ `detail`. `statementWitnessFailureCode` reads
// `err.code`, which for a raised plpgsql exception is the SQLSTATE (`CLR10`) — not a member of
// `FAILURE_CODES`, so it clamped to `internal` and the whole design §4.3 taxonomy would have been
// lost on the way to `clara.fail_statement_facts`. `statementPersistFailureCode` below reads the
// DETAIL token the DB actually raises with. A TRANSIENT fault is not a verdict about the document
// at all and becomes a retryable `engine_error` before the settle wrapper sees it; the persist
// verb is idempotent on replay, so a retry after a committed write that lost its answer is safe.
//
// H-03 — THE PRINTED INSTITUTION IS RESOLVED TO THE ROSTER CODE before the persist, by
// `normalizeStatementHeaderV3`. v2 relayed the model's string into a column the DB binds against
// `clara.bank_institutions.code` (PK check `^[A-Z0-9]{2,10}$`, 0038:183), so a perfectly-read
// "ALLIANCE BANK" was `header_unreadable` for the whole bank. A name that resolves to no single
// roster row REFUSES here — fail closed, with the printed string and the candidates named.
//
// H-02 — THE PERIOD BAND CARRIES A STATED BASIS. A statement that prints only a statement date
// (the Maybank shape) gets its band derived from that date's calendar month and the basis
// recorded; one that prints neither refuses exactly as v2 does.
//
// WHERE THE BASIS LIVES, AND WHY NOT ON THE HEADER. `clara._stmt_header_norm` builds its return
// object from a fixed field list (0038:1259-1272) — an extra `period_basis` key on the wire
// header would be dropped on the floor, silently. `corroboration` IS stored verbatim, as
// `corroboration_claimed`, on BOTH reader extraction envelopes (0098:475,484), so that is where
// both bases ride. A DB-side `period_basis` would need `_stmt_header_norm` widened — it is
// `immutable` and shared by four lanes, so moving it moves all four. A DB-lane item, not this one.
//
// NOTHING BELOW DECIDES A NUMBER. Hard constraint 2 is unchanged: the two transforms are an
// identity projection and a deterministic restatement of a date the reader printed, both
// receipted, and the DB still runs the two-reader header agreement, the line-skeleton compare
// and the chain walk afterwards.
//
// BUT DO NOT CLAIM THE PERIOD WALLS STILL DECIDE — ON A DERIVED BAND THEY CANNOT. `period_invalid`
// is UNREACHABLE by construction for that whole class, and `line_date_out_of_period` inherits the
// derived year rather than checking it. The full argument, with the migration line numbers and
// the one control that does still stand, is in `statementFacts.v3.header.mjs`'s H-02 header —
// read it before writing anything that relies on either refusal for this lane.
// ============================================================================
//
// THE `statement_facts` LANE NAME DOES NOT CHANGE, and this version is reached by REPOINTING the
// class (registry.ts) rather than relabelling the task: `_invoice_fact_state` keys the witness
// regime on `lane='llm_witness'`, so a statement sitting there would be resolved as an INVOICE.
//
// EACH MODEL CALL IS ITS OWN MEMOIZED STEP (witnessFacts.v1's §3.1): a step's return value is
// memoized by the durable engine, so a persist retry REPLAYS the stored envelopes instead of
// re-calling a model already paid for — which is what makes retrying a transient persist fault
// free. The download lives INSIDE the vision step because a temp-file path does not survive a
// cross-process replay, and storage is not egress.
//
// EGRESS, TWICE, ONE PURPOSE (design §3.7, witnessFacts.v1's OQ-2 answer: `witness_extraction`).
// `consume` runs in its OWN committed transaction immediately before each call, so a
// deactivation that committed since `prepare` refuses HERE and the bytes never leave.
//
// AUDIT-TRAIL HONESTY, inherited and never to be softened: the typed authorization covers THESE
// two witness reads and nothing earlier. The kind-blind intake OCR pass that produced the very
// regions the text channel reads egressed under the GLOBAL switch and the engagement-letter
// consent, before any typed gate could see the document's kind. Nothing here may assert otherwise.
//
// TWO POSTURES THAT ARE THE DELIBERATE OPPOSITE OF witnessFacts.v1's (reasoning in
// statementFacts.v3.prompts.mjs): currency absence reads MYR, and descriptions decide nothing.
//
// NO SHAPE COUPLING TO ANOTHER WORKFLOW FAMILY (the chatTurn_v8 law). `ownsStatementWitnessLane`
// is written locally rather than imported from witnessFacts.v1's `ownsWitnessLane`. The DB-verb
// plumbing IS imported from statementFacts.v2.dispatch.mjs — a SAME-FAMILY, cross-VERSION reuse
// (the chatTurn.v10->v11 precedent), lawful because not one byte of it changes in v3.
//
// WHAT THIS FILE STILL DOES NOT DO: compute a corroboration VERDICT. `_persist_statement_core` is
// repo law's "ONE CORE" for statement validation, and a second agreement/chain check here is
// exactly what that header forbids. `corroboration` stays EVIDENCE — method, channels, and now
// the two header bases — never authority.

import { FatalError } from "workflow";
import {
  STATEMENT_HEADER_FIELDS,
  STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT,
  STATEMENT_WITNESS_VISION_SYSTEM_PROMPT,
  buildStatementWitnessTextPrompt,
  buildStatementWitnessVisionPrompt,
  statementWitnessPromptHash,
  statementWitnessSchema,
  toWriterHeader,
  toWriterLines,
} from "./statementFacts.v3.prompts.mjs";
import { normalizeStatementHeaderV3 } from "./statementFacts.v3.header.mjs";
import {
  callWriter,
  consumeStatementWitnessDispatch,
  hasStatementWitnessSurface,
  prepareStatementWitnessDispatch,
  readPinnedStatementOcrExtraction,
  readStatementWitnessCitationRegions,
  readStatementWitnessContext,
  readStatementWitnessTaskStatus,
  recordStatementWitnessUsage,
  settleStatementWitnessFailure,
  STATEMENT_WITNESS_EVENT_TYPE,
  STATEMENT_WITNESS_MAX_VISION_BYTES,
  STATEMENT_WITNESS_PURPOSE,
} from "./statementFacts.v2.dispatch.mjs";

export { STATEMENT_WITNESS_EVENT_TYPE, STATEMENT_WITNESS_MAX_VISION_BYTES, STATEMENT_WITNESS_PURPOSE };

/** Copied VERBATIM from witnessFacts.v1.behavior.mjs / statementFacts.v1.behavior.mjs's own
 *  RETRYABLE — one ratified set, not reinvented. `internal` stays deliberately NOT retryable. */
const RETRYABLE = new Set(["engine_error", "timeout", "engine_lost", "storage_error"]);

/** The full set `clara.fail_statement_facts` admits (0038:2063-2071) that this file may hand
 *  it. A code outside this set is clamped to `engine_error` by the writer itself, so this list
 *  is a documentation aid, not a second gate — but a mapping function that emits something
 *  outside it would silently lose the real diagnosis into that clamp. */
const FAILURE_CODES = new Set([
  "engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted",
  "bad_type", "limit", "budget", "attempt_cap", "internal",
  "header_unreadable", "totals_unreadable", "readers_disagree", "chain_broken",
  "continuity_mismatch", "duplicate_period", "overlapping_period", "non_myr_statement",
  "account_unregistered", "account_inactive", "statement_multi_client", "period_invalid",
  "line_date_out_of_period", "consent_inactive",
]);

/** SQLSTATEs and driver codes that say "the database or the connection was momentarily away",
 *  never "this statement is bad". Class 08 is Postgres's own connection-exception class; the
 *  rest are the crash/shutdown/serialization/lock family plus node-postgres's socket errors. */
const TRANSIENT_DB_CODES = new Set([
  "40001", "40P01", "53300", "55P03", "57P01", "57P02", "57P03",
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN",
]);

/** THE CODELESS TRANSIENT FAULTS, AND WHY A MESSAGE MATCH IS THE ONLY THING THAT CAN SEE THEM.
 *  The three faults a pooled runtime meets most often are constructed by the driver as BARE
 *  `new Error(...)` with no `code` property at all:
 *    `pg@8.20.0/lib/client.js:180`  — "Connection terminated unexpectedly" (a dropped socket,
 *                                     handed to every in-flight query by `_errorAllQueries`);
 *    `pg@8.20.0/lib/client.js:678`  — "Client has encountered a connection error and is not
 *                                     queryable";
 *    `pg-pool@3.14.0/index.js:224`  — "timeout exceeded when trying to connect", and `:276`
 *                                     "Connection terminated due to connection timeout".
 *  A code-only test reads all four as `internal`, which is NOT retryable — so a pooler blink
 *  would settle a perfectly good statement `failed` and no retry would ever re-buy the persist.
 *  That is strictly WORSE than v2, which never settled the persist arm at all and let the
 *  durable engine retry. Matching the message is unlovely and it is the only signal the driver
 *  gives; the alternative is a regression. Kept deliberately narrow, and anchored by a
 *  MUST-NOT-RED cell that drives these exact strings. */
const TRANSIENT_DB_MESSAGES = /connection terminated|timeout exceeded when trying to connect|client has encountered a connection error/i;

/** A refusal: terminal by nature, never retried into a second egress attempt. */
function statementWitnessRefusal(code, message) {
  return Object.assign(new FatalError(`statement witness read refused (${code}): ${message}`), { code, statementWitnessRefusal: true });
}

/** A WAIT: neither a vendor fault nor a fact about the document — a deployment window, a filing
 *  correction in flight, an OCR substrate not yet landed, a task the DB has parked. Rethrown so
 *  the step retries; the DB's per-document attempt cap bounds the total. Never settles, never
 *  meters. */
function statementWitnessWait(message) {
  return Object.assign(new Error(message), { code: "internal", claraRetry: true });
}

function statementWitnessFailureCode(err) {
  const code = String(err?.code || "internal");
  return FAILURE_CODES.has(code) ? code : "internal";
}

/** The DB's own DETAIL token. Every statement verdict `_persist_statement_core_v2` raises rides
 *  `using errcode='CLR10', detail='{"reason":"..."}'`, so `err.code` is the SQLSTATE and the
 *  diagnosis is in `err.detail`. Anything that is not a member of the ratified taxonomy is
 *  ignored rather than forwarded — `fail_statement_facts` would clamp it anyway, and a code
 *  this file invented would be a taxonomy nobody else in the system knows. */
function statementDetailReason(err) {
  const detail = err?.detail;
  if (typeof detail !== "string" || detail.length === 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return null;
  }
  const reason = typeof parsed?.reason === "string" ? parsed.reason : null;
  return reason && FAILURE_CODES.has(reason) ? reason : null;
}

/** The settle reason for ANY arm of this lane: a locally-raised refusal keeps its own code, a
 *  DB-raised verdict is read off `detail`, and everything else is `internal`. */
export function statementPersistFailureCode(err) {
  const own = String(err?.code || "");
  if (FAILURE_CODES.has(own)) return own;
  return statementDetailReason(err) ?? "internal";
}

function isTransientDbFault(err) {
  const code = String(err?.code ?? "");
  if (code) return code.startsWith("08") || TRANSIENT_DB_CODES.has(code);
  return TRANSIENT_DB_MESSAGES.test(String(err?.message ?? ""));
}

/**
 * THE PROVENANCE STAMP MUST NAME THE MODEL THAT IS ABOUT TO BE CALLED — the same MAJOR-2 lesson
 * statementFacts.v1.behavior.mjs's own header cites, applied pre-egress rather than only at
 * persist time: `persist_statement_facts_v2` reads `engine_id` OFF THE TASK ROW and stamps both
 * readers with it, so the ROUTER's literal — not anything this file assumes — is the pair's
 * provenance. Compared BEFORE any dispatch; a mismatch WAITS rather than egressing (a deployment
 * fact, not a document fact — the right image or CLARA_STATEMENT_WITNESS_MODEL_ID makes the SAME
 * task succeed unchanged).
 */
function assertStatementEngineStamp(services, ctx, taskId) {
  const expected = services?.engineSnapshot?.engineId;
  if (!expected) {
    throw statementWitnessWait(`statement witness services carry no engine snapshot; refusing to egress without a provenance stamp to check (task ${taskId})`);
  }
  if (ctx.engineId !== expected) {
    throw statementWitnessWait(
      `statement witness task ${taskId} is stamped engine_id '${ctx.engineId}' but this image calls '${expected}'`
      + " — refusing to egress under a provenance receipt naming a model it did not call",
    );
  }
}

/** Shared per-channel preamble over an ALREADY-READ context: engine-stamp agreement, a FRESH
 *  task-status read, surface, consent dispatch. Mirrors witnessFacts.v1.behavior.mjs's
 *  `authorizeChannel` mechanically; the refusal codes are drawn from `clara.fail_statement_facts`'s
 *  EXISTING taxonomy rather than minted anew. */
async function authorizeStatementChannel(services, withRuntime, taskId, doc, ctx) {
  assertStatementEngineStamp(services, ctx, taskId);
  if (ctx.clientStatus === "ambiguous") {
    throw statementWitnessRefusal("statement_multi_client", `document ${doc.document_id} resolves more than one active filing client`);
  }
  if (ctx.clientStatus !== "unique" || !ctx.clientId) {
    // A filing correction in flight is the realistic cause and it may well land — WAIT, never
    // settle a verdict that would misdescribe it (the statementFacts.v1 OCR-lane precedent).
    throw statementWitnessWait(`statement witness task ${taskId} resolves no active filing client`);
  }
  const surface = await withRuntime((client) => hasStatementWitnessSurface(client));
  if (!surface) {
    throw statementWitnessWait("the statement-witness egress/persist surface is absent; refusing to call the model unauthorized");
  }
  // The LAST-MOMENT status read (witnessFacts.v1's M5): the two channels are separate steps
  // minutes apart, and the kill switch can park a claimed task between them.
  const status = await withRuntime((client) => readStatementWitnessTaskStatus(client, taskId));
  if (status !== "running") {
    throw statementWitnessWait(`statement witness task ${taskId} is '${status ?? "gone"}', not running — refusing to dispatch`);
  }
  const prepared = await withRuntime((client) => prepareStatementWitnessDispatch(client, {
    firmId: doc.firm_id, clientId: ctx.clientId, eventSeq: ctx.versionN, documentSha256: doc.sha256,
  }));
  const authorizationId = prepared?.authorization_id ?? null;
  if (prepared?.verdict !== "granted" || !authorizationId) {
    throw statementWitnessRefusal("consent_inactive", "no live typed consent + activation for witness_extraction");
  }
  const consumed = await withRuntime((client) => consumeStatementWitnessDispatch(client, {
    firmId: doc.firm_id, authorizationId, clientId: ctx.clientId, eventSeq: ctx.versionN, documentSha256: doc.sha256,
  }));
  if (consumed?.verdict !== "granted") {
    throw statementWitnessRefusal("consent_inactive", "the dispatch authorization was not consumable at dispatch time");
  }
}

/** Wrap one channel: read the context, authorize, call, meter — a row on EVERY outcome but a
 *  WAIT. The context read is FIRST and outside the try so its own failure is not metered as a
 *  model call, and so the engine stamp is in hand for every later outcome. */
async function withMeteredStatementChannel(services, withRuntime, taskId, doc, channel, promptHash, run) {
  const ctx = await withRuntime((client) => readStatementWitnessContext(client, taskId, doc));
  const startedAt = Date.now();
  try {
    await authorizeStatementChannel(services, withRuntime, taskId, doc, ctx);
    const out = await run(ctx);
    const usage = { ...(out.usage ?? {}), duration_ms: Date.now() - startedAt };
    await recordStatementWitnessUsage(withRuntime, { doc, taskId, channel, engineId: ctx.engineId, promptHash, usage, outcome: "success" });
    return { ...out, usage, engineId: ctx.engineId };
  } catch (err) {
    if (err?.claraRetry === true) throw err;
    const outcome = err?.statementWitnessRefusal === true
      ? "refused"
      : (statementWitnessFailureCode(err) === "timeout" ? "timeout" : "error");
    await recordStatementWitnessUsage(withRuntime, {
      doc, taskId, channel, engineId: ctx.engineId, promptHash,
      usage: { duration_ms: Date.now() - startedAt }, outcome,
    });
    throw err;
  }
}

/** TERMINAL OUTCOMES SETTLE THE TASK through `clara.fail_statement_facts`; WAITs and transient
 *  faults do not. Wraps a whole channel read INCLUDING its pre-egress refusals, and — new in
 *  v3 — the PERSIST as well, which is the arm that used to strand every raised verdict. */
async function withStatementTerminalSettle(services, withRuntime, taskId, run) {
  try {
    return await run();
  } catch (err) {
    if (err?.claraRetry === true) throw err;
    const code = statementPersistFailureCode(err);
    if (!RETRYABLE.has(code) || err?.statementWitnessRefusal === true) {
      await settleStatementWitnessFailure(withRuntime, taskId, code, services?.log ?? console.error);
    }
    throw err;
  }
}

/**
 * THE TEXT CHANNEL. Reads the pinned OCR extraction and its published citation numbering, sends
 * the numbered regions, and returns the writer's reader-1 blob plus the pair's page count.
 */
export async function runStatementWitnessTextRead(services, withRuntime, taskId, doc) {
  const promptHash = statementWitnessPromptHash("text");
  return withStatementTerminalSettle(services, withRuntime, taskId, async () => {
    const pinned = await withRuntime((client) => readPinnedStatementOcrExtraction(client, doc));
    if (!pinned) {
      // NO OCR extraction at all — an absent SUBSTRATE, not an unreadable statement. WAIT;
      // settling a code here would blame the page for the pipeline.
      throw statementWitnessWait(`statement witness task ${taskId} has no done OCR extraction to read`);
    }
    const regions = await withRuntime((client) => readStatementWitnessCitationRegions(client, pinned.id));
    if (regions.length === 0) {
      throw statementWitnessWait(`statement witness task ${taskId}'s pinned OCR extraction carries no regions`);
    }
    const built = buildStatementWitnessTextPrompt({ regions });
    const out = await withMeteredStatementChannel(services, withRuntime, taskId, doc, "text", promptHash, async () =>
      services.callStatementWitnessModel({
        channel: "text",
        system: STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT,
        prompt: built.prompt,
        schema: statementWitnessSchema,
      }));
    return {
      header: toWriterHeader(out.object?.header),
      lines: toWriterLines(out.object),
      usage: out.usage,
      engineId: out.engineId,
      pages_used: pinned.pageCount,
    };
  });
}

/**
 * THE VISION CHANNEL. Downloads the canonical bytes (hash-verified), sends the ORIGINAL file,
 * and returns the writer's reader-2 blob — no citations, because this channel never sees
 * regions.
 */
export async function runStatementWitnessVisionRead(services, withRuntime, taskId, doc) {
  const promptHash = statementWitnessPromptHash("vision");
  return withStatementTerminalSettle(services, withRuntime, taskId, async () => {
    // Both pre-egress refusals happen HERE — before the temp file, before the context read, and
    // above all before `prepare` mints an authorization: a document whose bytes can never leave
    // must not consume a single-use authorization on the way to finding that out.
    if (!services.statementWitnessMediaType || !services.statementWitnessMediaType(doc.mime_type)) {
      throw Object.assign(
        new Error(`statement witness vision channel cannot read media type '${doc.mime_type}'`),
        { code: "bad_type" },
      );
    }
    if (Number(doc.byte_size) > STATEMENT_WITNESS_MAX_VISION_BYTES) {
      throw Object.assign(
        new Error(`statement witness vision payload is ${doc.byte_size} bytes, over the ${STATEMENT_WITNESS_MAX_VISION_BYTES} pre-egress cap`),
        { code: "limit" },
      );
    }
    const tempPath = services.taskTempPath(taskId);
    try {
      await services.downloadCanonical(doc.storage_path, tempPath, doc.sha256);
      const out = await withMeteredStatementChannel(services, withRuntime, taskId, doc, "vision", promptHash, async () =>
        services.callStatementWitnessModel({
          channel: "vision",
          system: STATEMENT_WITNESS_VISION_SYSTEM_PROMPT,
          prompt: buildStatementWitnessVisionPrompt(),
          schema: statementWitnessSchema,
          file: { path: tempPath, mime: doc.mime_type },
        }));
      return {
        header: toWriterHeader(out.object?.header),
        lines: toWriterLines(out.object),
        usage: out.usage,
        engineId: out.engineId,
      };
    } finally {
      await services.removeTempFile(tempPath).catch(() => {});
    }
  });
}

/** An institution the roster cannot resolve to exactly one code is a REFUSAL, not a value to
 *  relay and hope about. The message carries the two things a human needs — what the page
 *  printed, and which roster rows it matched — because `fail_statement_facts` stores only the
 *  code and this text is what the operator will read in the runtime log. */
function assertResolvedInstitution(reader, institution) {
  if (institution.code !== null) return;
  const printed = institution.printed === null ? "(nothing)" : JSON.stringify(institution.printed);
  const candidates = institution.candidates.length > 0
    ? ` — it matched ${institution.candidates.length} roster entries (${institution.candidates.join(", ")}), which is not one`
    : " — it matches no entry in the bank institution roster";
  throw statementWitnessRefusal(
    "header_unreadable",
    `${reader} printed the institution as ${printed} [${institution.basis}]${candidates}`,
  );
}

/** The persist call itself, with the ONE distinction the settle wrapper cannot make for itself:
 *  a transient database fault is not a verdict about the document and must retry rather than
 *  end it. `engine_error` is in RETRYABLE and the marker is set as well, so neither the settle
 *  wrapper nor the step's classifier can mistake it for a terminal outcome. */
async function callStatementPersistWriter(withRuntime, taskId, payload) {
  try {
    return await callWriter(
      withRuntime,
      "select clara.persist_statement_facts_v2($1,$2::jsonb) as receipt",
      [taskId, JSON.stringify(payload)],
    );
  } catch (err) {
    if (!isTransientDbFault(err)) throw err;
    throw Object.assign(
      new Error(`statement witness persist met a transient database fault (${String(err?.code ?? "unknown")}) on task ${taskId}; retrying rather than settling the statement failed`),
      { code: "engine_error", claraRetry: true, cause: err },
    );
  }
}

/**
 * THE ONE PERSIST. Builds the payload and calls `clara.persist_statement_facts_v2($1,$2::jsonb)`.
 * `engine_id` for BOTH readers is the SAME value — the task's OWN stamp, read off
 * `document_processing_tasks.engine_id` by `readStatementWitnessContext` during the text
 * channel's metered call — never a literal this file invents (the MAJOR-2 lesson, restated).
 *
 * v3 WRAPS THE WHOLE THING IN `withStatementTerminalSettle` (H-05). The payload build is inside
 * the wrapper deliberately: an institution the roster cannot resolve is a terminal verdict about
 * the document and must settle the task exactly as a DB-raised one does.
 *
 * `corroboration` stays MINIMAL and NON-AUTHORITATIVE. It now also carries each channel's header
 * BASIS — how the institution code and the period band were obtained — which is evidence about
 * the read, never a claim about the statement.
 */
export async function persistStatementWitnessPair(services, withRuntime, taskId, textRead, visionRead) {
  return withStatementTerminalSettle(services, withRuntime, taskId, async () => {
    const engineId = textRead?.engineId ?? visionRead?.engineId ?? null;
    const reader1 = normalizeStatementHeaderV3(textRead?.header);
    const reader2 = normalizeStatementHeaderV3(visionRead?.header);
    assertResolvedInstitution("reader1 (text channel)", reader1.institution);
    assertResolvedInstitution("reader2 (vision channel)", reader2.institution);
    const payload = {
      pages_used: Number.isInteger(textRead?.pages_used) && textRead.pages_used >= 0 ? textRead.pages_used : 0,
      readers: {
        reader1: { engine_id: engineId, header: reader1.header, lines: textRead.lines },
        reader2: { engine_id: engineId, header: reader2.header, lines: visionRead.lines },
      },
      corroboration: {
        method: "witness_pair",
        header_fields: [...STATEMENT_HEADER_FIELDS],
        reader1_channel: "text",
        reader2_channel: "vision",
        reader1_header_basis: reader1.receipt,
        reader2_header_basis: reader2.receipt,
      },
    };
    const out = await callStatementPersistWriter(withRuntime, taskId, payload);
    return { taskId, status: "done", receipt: out };
  });
}

/** Terminal-vs-retryable, mirroring witnessFacts.v1's `classifyWitnessFailure`. A refusal is
 *  already a FatalError and passes through unchanged; a DB-raised verdict is named by its own
 *  DETAIL token rather than collapsing into `internal`. */
export function classifyStatementWitnessFailure(err) {
  if (err?.statementWitnessRefusal === true || err instanceof FatalError) {
    return { retry: false, code: String(err?.code ?? "internal") };
  }
  const code = statementPersistFailureCode(err);
  if (err?.claraRetry === true || RETRYABLE.has(code)) return { retry: true, code };
  return { retry: false, code };
}

/**
 * A lane this witness pair does not own must never be driven here — silently running a witness
 * pass over a `statement_parse` (or any other) task would spend real model egress on the wrong
 * lane under an authorization minted for a different purpose.
 */
export function ownsStatementWitnessLane(doc) {
  return !!doc && doc.lane === "statement_facts" && !!doc.storage_path && !!doc.sha256;
}
