// Accounting-Work routes (#623, contract §Runtime). The SECOND trusted-ingress boundary in this
// package, and it is deliberately the same shape as the first (src/chatRoutes.ts): every route
// resolves the principal through lib/authz (JWT → live membership) before any DB work, the
// database verb re-checks that principal's role and client access for itself, and the verb's
// structured errors are mapped to HTTP by an exported predicate a cell can drive.
//
// ADMISSION IS `clara.admit_journal_work` — ONE atomic transaction: the authority recheck, the
// basis validation, the `(firm, intent_key)` idempotency, the Work row with its server-assigned
// `logical_op_id`, and the queued `accounting_work` task. AFTER it commits we enqueue the durable
// run best-effort, exactly as the chat turn route does and for the same reason: the workflow's
// first step CAS-binds itself, so a failed enqueue here is recoverable by the reconciler's
// `accounting_work` arm and is never a lost Work.
//
// WHY 202 AND NOT 201. The response acknowledges an ADMITTED intent, not a posted entry. The
// entry is posted seconds later by a claraWork_v1 run under a wake credential minted OBO this
// same human, with the period, the chart, the control-account rule and their live role all
// rechecked AT COMMIT. A 201 would read as "created the entry", which is the single most
// consequential thing this surface could get wrong.
//
// THE MALFORMED-ID RULE IS #614's LESSON, KEPT: a client id or a work id that is not a uuid is a
// NOT-FOUND, never a database error. The guard runs before any query so a malformed id cannot
// reach Postgres and come back as a 500 that reads like an outage.
//
// WHAT THIS FILE NEEDS FROM MIGRATION 0178, stated here so a deploy can check it rather than
// discover it: EXECUTE on `clara.admit_journal_work` and `clara.retry_accounting_work` for the
// role the runtime pool SET ROLEs to (the way `clara.begin_chat_turn` is granted), and SELECT on
// `clara.accounting_work` for that same role — the read route below joins it directly rather than
// through a verb, exactly as the chat session list reads `clara.chat_sessions`. Without the
// SELECT the read route 500s while admission still works, which is the confusing half-state worth
// naming in advance.
//
// THE READ ROUTE IS NARROW ON PURPOSE. The web reads `clara.accounting_work`,
// `clara.operation_receipts`, `clara.journal_entries` and `clara.journal_lines` through their own
// RLS as the signed-in human; `GET /api/work/:workId` exists for the lost-response check and for
// the e2e, and it returns the task's `workflow_run_id` as a BOOLEAN — whether the Work is bound
// to a run is the operable fact, and the engine's run id is not a thing a browser needs.

import express from "express";
import { start } from "workflow/api";
import { authenticate, AuthError } from "../lib/authz.mjs";
import { withRuntime } from "../lib/pools.mjs";
import { workflows } from "../workflows/registry.js";

const DEFAULT_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type WireLine = { accountCode?: unknown; debitCents?: unknown; creditCents?: unknown; description?: unknown };
type WireBasis = { postingDate?: unknown; memo?: unknown; currency?: unknown; lines?: unknown };

/** A 400 payload: the offending field and the machine-readable reason, so the composer can put
 *  the error beside the control that produced it instead of showing one banner for everything. */
export type InvalidBasis = { error: "invalid_basis"; field: string; reason: string };

function invalid(field: string, reason: string): InvalidBasis {
  return { error: "invalid_basis", field, reason };
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Shape-validate the WIRE basis and translate it into the DATABASE's own field spelling. The
 * database re-validates every one of these and is the authority; this is the earlier, more
 * legible half whose job is to name the field. Exported so a cell drives THIS function rather
 * than a copy of its predicate (the `turnErrorStatus` precedent).
 *
 * NO FLOATING POINT ANYWHERE. Cents arrive as integers and stay integers; a non-integer is
 * refused by name rather than rounded, because a rounded cent is a wrong ledger.
 */
export function toDbBasis(raw: unknown): { ok: true; basis: Record<string, unknown> } | { ok: false; error: InvalidBasis } {
  if (!raw || typeof raw !== "object") return { ok: false, error: invalid("basis", "required") };
  const basis = raw as WireBasis;
  if (typeof basis.postingDate !== "string" || !DATE_RE.test(basis.postingDate)) {
    return { ok: false, error: invalid("basis.postingDate", "date_required") };
  }
  if (typeof basis.memo !== "string" || basis.memo.trim() === "") {
    return { ok: false, error: invalid("basis.memo", "memo_required") };
  }
  if (basis.currency !== "MYR") return { ok: false, error: invalid("basis.currency", "currency_must_be_myr") };
  if (!Array.isArray(basis.lines) || basis.lines.length < 2) {
    return { ok: false, error: invalid("basis.lines", "at_least_two_lines") };
  }
  const lines: Array<Record<string, unknown>> = [];
  let debit = 0;
  let credit = 0;
  for (let i = 0; i < basis.lines.length; i += 1) {
    const line = basis.lines[i] as WireLine;
    if (!line || typeof line !== "object") return { ok: false, error: invalid(`basis.lines[${i}]`, "line_required") };
    if (typeof line.accountCode !== "string" || line.accountCode.trim() === "") {
      return { ok: false, error: invalid(`basis.lines[${i}].accountCode`, "account_required") };
    }
    if (!isInteger(line.debitCents) || line.debitCents < 0) {
      return { ok: false, error: invalid(`basis.lines[${i}].debitCents`, "integer_cents_required") };
    }
    if (!isInteger(line.creditCents) || line.creditCents < 0) {
      return { ok: false, error: invalid(`basis.lines[${i}].creditCents`, "integer_cents_required") };
    }
    const oneSided = (line.debitCents > 0 && line.creditCents === 0) || (line.creditCents > 0 && line.debitCents === 0);
    if (!oneSided) return { ok: false, error: invalid(`basis.lines[${i}]`, "exactly_one_side") };
    if (line.description !== undefined && typeof line.description !== "string") {
      return { ok: false, error: invalid(`basis.lines[${i}].description`, "text_expected") };
    }
    debit += line.debitCents;
    credit += line.creditCents;
    lines.push({
      account_code: line.accountCode,
      debit_cents: line.debitCents,
      credit_cents: line.creditCents,
      description: line.description === undefined ? null : line.description,
    });
  }
  if (debit !== credit) return { ok: false, error: invalid("basis.lines", "unbalanced") };
  return {
    ok: true,
    basis: { posting_date: basis.postingDate, memo: basis.memo, currency: "MYR", lines },
  };
}

/**
 * The admission route's COMPLETE refusal map, in the `turnErrorStatus` idiom. Keyed on the
 * `(code, detail.reason)` pair the database raises, because two CLR10s mean two different things
 * here — a malformed basis is the caller's mistake (400) and an intent-key payload conflict is a
 * genuine conflict with a Work that already exists (409).
 */
export function workErrorStatus(code: string | undefined, reason: string | null): number | null {
  if (code === "CLR10") {
    if (reason === "intent_payload_conflict") return 409;
    return 400;
  }
  if (code === "CLR11") return 404; // unknown / foreign client, or a Work that is not this firm's
  if (code === "CLR03" || code === "CLR04") return 403;
  // CLR13 is the estate's "the state is not the one this act needs". `clara.retry_accounting_work`
  // raises it with reason `not_retryable` (the Work is not terminal, or its run is still live) and
  // with `operation_in_flight` (an uncommitted sibling holds the retry key). Both are 409s.
  if (code === "CLR13") return 409;
  // An immutability refusal, and PostgreSQL's own unique_violation. Both mean "that state is
  // already spoken for", which is the chat route's reading of the same two codes.
  if (code === "CLR08") return 409;
  if (code === "23505") return 409;
  return null;
}

/** Every code `workErrorStatus` claims to map — read by the census cell in BOTH directions: a
 *  code here that these doors cannot raise is as much a lie as a raised code that is missing.
 *  The set is the LIVE catalog's, measured off `clara.admit_journal_work`,
 *  `clara.retry_accounting_work`, their call graph and the triggers on the two relations they
 *  write; CLR03 and CLR14 are deliberately ABSENT because neither door can raise them (the
 *  wake lane's CLR03s are classified by claraWork.v1.errors.ts, not by an HTTP status). */
export const WORK_MAPPED_CODES = Object.freeze(["CLR04", "CLR08", "CLR10", "CLR11", "CLR13", "23505"]);

/** Read the typed `detail.reason` off a raised error. PostgreSQL's own details are plain text, so
 *  a non-JSON detail yields null rather than a guess. */
export function reasonOf(err: unknown): string | null {
  const detail = (err as { detail?: unknown })?.detail;
  if (typeof detail !== "string" || detail.length === 0) return null;
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const reason = (parsed as { reason?: unknown }).reason;
      return typeof reason === "string" ? reason : null;
    }
  } catch {
    /* a plain-text detail carries no typed reason */
  }
  return null;
}

/** Read one string-valued key off a raised error's typed `detail` jsonb. PostgreSQL's own
 *  details are plain text, so a non-JSON detail yields null rather than a guess. */
export function detailField(err: unknown, key: string): string | null {
  const detail = (err as { detail?: unknown })?.detail;
  if (typeof detail !== "string" || detail.length === 0) return null;
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>)[key];
      return typeof value === "string" ? value : null;
    }
  } catch {
    /* a plain-text detail carries no typed field */
  }
  return null;
}

/** Read the typed `detail.field` off a raised error, for the 400 payload. */
function fieldOf(err: unknown): string | null {
  return detailField(err, "field");
}

function sendAuthError(res: express.Response, err: unknown): boolean {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.code, message: err.status === 404 ? "not found" : err.message });
    return true;
  }
  return false;
}

function shuttingDown(): boolean {
  const sup = (globalThis as unknown as { __claraSupervisor?: { shuttingDown?: boolean } }).__claraSupervisor;
  return sup?.shuttingDown === true;
}

/** Post-commit enqueue — BEST-EFFORT by design. The reconciler's `accounting_work` arm
 *  re-enqueues a queued+unbound task, and the workflow's claim step CAS-binds itself, so a
 *  duplicate start self-aborts and a failed start is deferred, never lost. */
async function enqueueWork(taskId: string): Promise<void> {
  try {
    await start(workflows.claraWork, [{ taskId }]);
  } catch (err) {
    console.error("[clara-runtime] work enqueue failed (reconciler will re-enqueue):", (err as Error)?.message ?? err);
  }
}

function sendAdmissionError(res: express.Response, err: unknown, label: string): void {
  const code = (err as { code?: string })?.code;
  const reason = reasonOf(err);
  const status = workErrorStatus(code, reason);
  if (status === 400) {
    res.status(400).json({ error: "invalid_basis", field: fieldOf(err) ?? "basis", reason: reason ?? "invalid_basis" });
    return;
  }
  if (status === 409) {
    if (reason === "not_retryable") {
      // The contract's 409 body: the machine-readable error AND the Work status that made the
      // retry illegal, which is what the detail's own `status` field carries.
      res.status(409).json({ error: "not_retryable", status: detailField(err, "status") });
      return;
    }
    res.status(409).json({ error: reason === "intent_payload_conflict" ? "intent_payload_conflict" : "conflict" });
    return;
  }
  if (status === 404) {
    res.status(404).json({ error: "not_found", message: "not found" });
    return;
  }
  if (status === 403) {
    res.status(403).json({ error: "forbidden", message: "not permitted" });
    return;
  }
  console.error(`[clara-runtime] ${label} error:`, (err as Error)?.message ?? err);
  res.status(500).json({ error: "internal" });
}

export function workRoutes(): express.Router {
  const router = express.Router();

  // ---- C3 / B6 admission -------------------------------------------------
  router.post("/api/work/journal", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const body = (req.body ?? {}) as { clientId?: unknown; intentKey?: unknown; basis?: unknown };
    if (typeof body.clientId !== "string" || !UUID_RE.test(body.clientId)) {
      // A malformed client id is a NOT-FOUND, never a database error (#614's lesson).
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    if (typeof body.intentKey !== "string" || body.intentKey.trim() === "") {
      // C82.1: an empty or whitespace key is refused BEFORE any reservation. The database
      // refuses it too; refusing it here means it never reaches a reservation at all.
      res.status(400).json({ error: "invalid_basis", field: "intentKey", reason: "intent_key_required" });
      return;
    }
    const translated = toDbBasis(body.basis);
    if (!translated.ok) {
      res.status(400).json(translated.error);
      return;
    }

    try {
      const admitted = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query(
          "select clara.admit_journal_work($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text, $6::jsonb, $7::text) as receipt",
          [body.clientId, p.sub, body.intentKey, JSON.stringify(translated.basis), "user_direct", "[]", DEFAULT_MODEL],
        );
        return (r.rows[0]?.receipt ?? null) as {
          work_id: string;
          task_id: string;
          logical_op_id: string;
          status: string;
          replayed: boolean;
        } | null;
      });
      if (!admitted) {
        res.status(500).json({ error: "internal" });
        return;
      }
      // A replay returns the EXISTING Work and mints no task, so there is nothing to start; the
      // original run either already holds the task or the reconciler owns it.
      if (admitted.replayed !== true) await enqueueWork(admitted.task_id);
      res.status(202).json({
        work_id: admitted.work_id,
        task_id: admitted.task_id,
        logical_op_id: admitted.logical_op_id,
        status: admitted.status,
        replayed: admitted.replayed === true,
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "work admission");
    }
  });

  // ---- B3 retry: a NEW run for the SAME Work (same logical identity) ------
  router.post("/api/work/:workId/retry", async (req, res) => {
    if (shuttingDown()) {
      res.status(503).json({ error: "shutting_down", message: "the runtime is draining — retry shortly" });
      return;
    }
    const workId = req.params.workId;
    if (!UUID_RE.test(workId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    const body = (req.body ?? {}) as { opKey?: unknown };
    if (typeof body.opKey !== "string" || body.opKey.trim() === "") {
      res.status(400).json({ error: "invalid_basis", field: "opKey", reason: "op_key_required" });
      return;
    }
    try {
      const retried = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const r = await c.query("select clara.retry_accounting_work($1::uuid, $2::uuid, $3::text) as receipt", [
          workId,
          p.sub,
          body.opKey,
        ]);
        return (r.rows[0]?.receipt ?? null) as {
          work_id: string;
          task_id: string;
          logical_op_id: string;
          status: string;
          replayed: boolean;
        } | null;
      });
      if (!retried) {
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      if (retried.replayed !== true) await enqueueWork(retried.task_id);
      res.status(202).json({
        work_id: retried.work_id,
        task_id: retried.task_id,
        logical_op_id: retried.logical_op_id,
        status: retried.status,
        replayed: retried.replayed === true,
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      sendAdmissionError(res, err, "work retry");
    }
  });

  // ---- the lost-response check -------------------------------------------
  router.get("/api/work/:workId", async (req, res) => {
    const workId = req.params.workId;
    if (!UUID_RE.test(workId)) {
      res.status(404).json({ error: "not_found", message: "not found" });
      return;
    }
    try {
      const found = await withRuntime(async (c) => {
        const p = await authenticate(c, req.header("authorization"));
        const w = await c.query(
          `select w.id, w.firm_id, w.client_id, w.purpose, w.status, w.initiator, w.initiator_role,
                  w.intent_key, w.logical_op_id, w.basis, w.basis_digest, w.basis_origin, w.source_refs,
                  w.current_task_id, w.bundle, w.result, w.error, w.created_at, w.updated_at,
                  t.id as task_id, t.status as task_status, t.error_code as task_error_code,
                  (t.workflow_run_id is not null) as task_bound
             from clara.accounting_work w
             left join clara.agent_tasks t on t.id = w.current_task_id
            where w.id = $1 and w.firm_id = $2`,
          [workId, p.firmId],
        );
        return w.rows[0] ?? null;
      });
      if (!found) {
        res.status(404).json({ error: "not_found", message: "not found" });
        return;
      }
      res.json({
        work: {
          id: found.id,
          firm_id: found.firm_id,
          client_id: found.client_id,
          purpose: found.purpose,
          status: found.status,
          initiator: found.initiator,
          initiator_role: found.initiator_role,
          intent_key: found.intent_key,
          logical_op_id: found.logical_op_id,
          basis: found.basis,
          basis_digest: found.basis_digest,
          basis_origin: found.basis_origin,
          source_refs: found.source_refs,
          current_task_id: found.current_task_id,
          bundle: found.bundle,
          result: found.result,
          error: found.error,
          created_at: found.created_at,
          updated_at: found.updated_at,
        },
        task: {
          id: found.task_id,
          status: found.task_status,
          error_code: found.task_error_code,
          // The engine's run id is NOT served: whether the Work is bound to a run is the operable
          // fact, and a run id is an internal handle no browser needs.
          workflow_run_id: found.task_bound === true,
        },
      });
    } catch (err) {
      if (sendAuthError(res, err)) return;
      console.error("[clara-runtime] work read error:", (err as Error)?.message ?? err);
      res.status(500).json({ error: "internal" });
    }
  });

  return router;
}
