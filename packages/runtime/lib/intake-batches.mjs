// #636 — THE INTAKE BATCH lane's runtime half. A NEW, NON-FROZEN module.
//
// WHY IT IS NOT IN `lib/intake.mjs`, MEASURED RATHER THAN ASSUMED. `lib/intake.mjs` is one
// manifest line from freezing: five real reverse importers already point at it
// (`invoiceFacts.v1.services.mjs:9`, `statementFacts.v1.services.mjs:19`,
// `statementFacts.v2.services.mjs:31`, `witnessFacts.v1.services.mjs:27`,
// `witnessFacts.v2.services.mjs:38`), none of which is in `frozen-workflows.json` TODAY. Measured
// on the rig with `node scripts/check-frozen-workflows.mjs --print-closure`: 288 entry files lock
// 296 modules, and `lib/intake.mjs`, `src/intakeRoutes.ts`, `lib/reconciler.mjs` and
// `lib/spool.mjs` are all OUTSIDE that closure. The day one of those five services is frozen,
// every line of batch logic written inside `lib/intake.mjs` becomes unamendable. So it lives here.
//
// NOTHING FROZEN IMPORTS THIS MODULE — that is the constraint that matters. This module may
// IMPORT `lib/spool.mjs` (it does, for `readIntakeMeta`): an import edge pointing INTO a closure
// does not pull the importer in.
//
// THE BATCH ID NEVER ENTERS `documentIngest`'s STEP IO. That would be `documentIngest_v3`, which
// nobody cuts this wave. The membership is read back from the database instead.
//
// EVERY FUNCTION RETURNS A TYPED `{ status: 'ok' | 'refused' | 'unavailable', … }` — never null,
// never a raw throw. `refused` is the database saying no with a reason a human can act on;
// `unavailable` is everything else (a dead pool, a timeout, a bug), and the caller decides whether
// to retry. The distinction is the whole reason the reconciler belt can be idempotent.

import { readIntakeMeta } from "./spool.mjs";

/**
 * THE ONE ANSWER SHAPE, declared so a TypeScript caller can read a field without narrowing a union
 * of eight literal object types. `status` is the discriminant every caller checks first; the rest
 * are present-or-absent by arm, exactly as each function's own comment says.
 *
 * @typedef {object} BatchAnswer
 * @property {"ok"|"refused"|"unavailable"|"skipped"} status
 * @property {string|null} [code]        the SQLSTATE, on a refusal
 * @property {string|null} [reason]      the typed `detail.reason`, on a refusal
 * @property {string} [message]          the database's own sentence, verbatim
 * @property {Record<string, unknown>|null} [detail]
 * @property {any} [batch]               `openBatch`
 * @property {any} [member]              `attachIntake` / `setMemberDependency`
 * @property {any} [worklist]            `sweepBatchCancellations`
 * @property {any} [decision]            `cancelBatch`
 * @property {string} [batch_id]         `resumeCancel`
 * @property {{work_id: string, status: string|null, replayed: boolean|null}[]} [cancelled]
 * @property {{work_id: string, reason: string}[]} [deferred]
 * @property {{work_id: string, code: string|null, reason: string|null}[]} [refused]
 */

const NOOP_LOG = /** @type {(message: string) => void} */ (() => {});

/** The SQLSTATE class the estate uses for its own refusals. Anything else is infrastructure. */
const CLARA_SQLSTATE = /^CLR\d\d$/;

/** `detail` travels as a JSON string on a pg error; a refusal that carries none still answers. */
function detailOf(err) {
  try {
    return err?.detail ? JSON.parse(err.detail) : {};
  } catch {
    return {};
  }
}

/**
 * Classify a thrown database error ONCE, in one place, so no caller has to re-derive it.
 * A `CLRxx` SQLSTATE is a DECISION the database made and is reported as `refused` with its own
 * reason; everything else is `unavailable`, because a timeout and a refusal are different facts
 * and treating them alike is how a retry loop turns a permanent no into an infinite one.
 */
function classify(err) {
  const code = String(err?.code || "");
  if (CLARA_SQLSTATE.test(code)) {
    return { status: "refused", code, reason: detailOf(err).reason ?? null, message: String(err?.message || ""), detail: detailOf(err) };
  }
  return { status: "unavailable", code: code || null, message: String(err?.message || err) };
}

async function callDoor(client, sql, params) {
  const r = await client.query(sql, params);
  return r.rows[0]?.result ?? null;
}

// ---------------------------------------------------------------------------------------------
// §1  The four write doors, each one statement on a clara_runtime connection.
// ---------------------------------------------------------------------------------------------

/** @returns {Promise<BatchAnswer>} */
export async function openBatch(client, { actor, origin = "documents_tab", label, sessionId = null, opKey }) {
  try {
    const batch = await callDoor(client,
      "select clara.open_intake_batch($1::uuid,$2::text,$3::text,$4::uuid,$5::text) as result",
      [actor, origin, label, sessionId, opKey]);
    return { status: "ok", batch };
  } catch (err) {
    return classify(err);
  }
}

/** @returns {Promise<BatchAnswer>} */
export async function attachIntake(client, { actor, batchId, intakeId, opKey }) {
  try {
    const member = await callDoor(client,
      "select clara.attach_intake_to_batch($1::uuid,$2::uuid,$3::uuid,$4::text) as result",
      [actor, batchId, intakeId, opKey]);
    return { status: "ok", member };
  } catch (err) {
    return classify(err);
  }
}

/** @returns {Promise<BatchAnswer>} */
export async function setMemberDependency(client, { actor, intakeId, dependency, reason = null, opKey }) {
  try {
    const member = await callDoor(client,
      "select clara.set_intake_batch_member_dependency($1::uuid,$2::uuid,$3::text,$4::text,$5::text) as result",
      [actor, intakeId, dependency, reason, opKey]);
    return { status: "ok", member };
  } catch (err) {
    return classify(err);
  }
}

/** @returns {Promise<BatchAnswer>} */
export async function sweepBatchCancellations(client, { limit = 20 } = {}) {
  try {
    const worklist = await callDoor(client,
      "select clara.sweep_intake_batch_cancellations($1::int) as result", [limit]);
    return { status: "ok", worklist: worklist ?? { batches: [], settled: [] } };
  } catch (err) {
    return classify(err);
  }
}

// ---------------------------------------------------------------------------------------------
// §2  BEGIN + ATTACH, together.
//
// `withRuntime` is AUTOCOMMIT (`checkout()` in lib/pools.mjs issues no BEGIN), so two calls on one
// connection are two transactions. When a batch is named, this opens an EXPLICIT transaction so a
// begun intake and its membership commit TOGETHER — a member whose intake exists but whose
// membership does not would be a file the batch card can never show, and the browser has already
// moved on to uploading its bytes by then.
//
// The existing, batch-less path is BYTE-UNCHANGED: this function is reached only when the caller
// passed a batch id.
//
// `begin` is INJECTED rather than imported, for two reasons: this module keeps no edge into
// `lib/intake.mjs` (the freeze-edge file), and the unit cell can drive the rollback arm without a
// spool, a storage account or a real upload.
//
// ON A REFUSED ATTACH the transaction ROLLS BACK, so the intake row and its capacity reservation
// both vanish; `cleanup` (the route passes `removeIntakeSpool`) then drops the sidecar the begin
// wrote, because a sidecar whose intake no longer exists would be re-driven by
// `recoverPendingDocumentIntakes` every sweep until its 15-minute TTL expired it.
//
// #965 — ON A CEILING REFUSAL, THE OPPOSITE. Since migration 0254 the creation door COMMITS a
// refused intake at failed/limit and RETURNS `refused: true` rather than raising CLR18, and this
// function's blanket `rollback` would throw that record away again — the exact loss the ticket
// exists to stop. So a refused begin takes `commitRefusedMember` below instead, which gives the
// record a member, declares its wait through the GOVERNED door, and COMMITS.
//
// THE BELT DOES NOT PICK THIS UP. 0229's trigger arm (b) fires on an UPDATE that moves
// `failure_code` to 'limit' on an intake that already has a member; here the member does not exist
// yet when the door writes that value (the attach can only happen once the intake id exists), so
// the arm's `select … where b.intake_id = new.id` finds nothing and returns. The wait therefore has
// to be declared explicitly — which is also what `recordCapacityWait` does for the post-custody
// refusal, through the same door, with the same verbatim reason.
// ---------------------------------------------------------------------------------------------

/**
 * #965 — a file the daily ceiling refused, inside an OPEN batch.
 *
 * WHY EVERY DOOR CALL HERE SITS UNDER A SAVEPOINT. `attachIntake` and `setMemberDependency` catch
 * their own refusals and answer typed — but the failed statement has already aborted the
 * transaction, and `commit` on an aborted transaction is a ROLLBACK. Without the savepoint, a
 * batch that closed between the upload and the refusal would silently take the refusal record
 * down with it, which is precisely the defect this ticket closes. The record is the thing that
 * must survive; the membership is best-effort on top of it.
 *
 * NO OBJECT SPREAD, like every other return in this module.
 *
 * @returns {Promise<{refused: true, intake_id: string, status: string, failure_code: string,
 *                    ceiling: string|null, reason: string|null, batch_id: string,
 *                    member_id: string|null, dependency: string|null}>}
 */
async function commitRefusedMember({ client, principal, batchId, opKey, started, intakeId, log }) {
  let memberId = null;
  let dependency = null;

  await client.query("savepoint clara_refused_attach");
  const attached = await attachIntake(client, { actor: principal.sub, batchId, intakeId, opKey });
  if (attached.status !== "ok") {
    await client.query("rollback to savepoint clara_refused_attach");
    log(`[clara-runtime] intake batch: a ceiling-refused intake=${intakeId} could not join batch=${batchId}: ${attached.status} ${attached.code ?? ""} ${attached.reason ?? ""} — the refusal record is kept, the batch shows no member`);
  } else {
    memberId = attached.member?.member_id ?? null;
    await client.query("savepoint clara_refused_wait");
    const waited = await setMemberDependency(client, {
      actor: principal.sub,
      intakeId,
      dependency: "awaiting_capacity",
      // The database's OWN sentence, verbatim — the operator remedy the batch card renders, and
      // the same text `recordCapacityWait` passes for the post-custody refusal.
      reason: started.reason ?? "document daily limit reached",
      opKey: `intake-batch-capacity:${intakeId}`,
    });
    if (waited.status !== "ok") {
      await client.query("rollback to savepoint clara_refused_wait");
      log(`[clara-runtime] intake batch: capacity wait not recorded for refused intake=${intakeId}: ${waited.status} ${waited.code ?? ""} ${waited.reason ?? ""}`);
    } else {
      dependency = "awaiting_capacity";
    }
  }

  await client.query("commit");
  return Object.freeze({
    refused: true,
    intake_id: intakeId,
    status: "failed",
    failure_code: started.failure_code ?? "limit",
    ceiling: started.ceiling ?? null,
    reason: started.reason ?? null,
    batch_id: batchId,
    member_id: memberId,
    dependency,
  });
}

/**
 * @param {{ client: any, principal: any, input: any, batchId: string, opKey: string,
 *           begin: (c: any, p: any, i: any) => Promise<any>,
 *           cleanup?: ((id: string) => unknown) | null, log?: (m: string) => void }} args
 * @returns {Promise<{intake_id: string, upload_token: string, expires_at: string|null, batch_id: string, member_id: string|null}>}
 */
export async function beginIntakeInBatch({ client, principal, input, batchId, opKey, begin, cleanup = null, log = NOOP_LOG }) {
  await client.query("begin");
  let intakeId = null;
  try {
    const started = await begin(client, principal, input);
    intakeId = String(started.intake_id);
    // #965: a ceiling refusal is a RETURNED outcome whose record is already written in this
    // transaction. It must be COMMITTED, not rolled back — see commitRefusedMember above.
    if (started.refused === true) {
      return await commitRefusedMember({
        client, principal, batchId, opKey, started, intakeId, log,
      });
    }
    const attached = await attachIntake(client, {
      actor: principal.sub, batchId, intakeId, opKey,
    });
    if (attached.status !== "ok") {
      const err = new Error(attached.message || "the intake could not join that batch");
      err.code = attached.code ?? "internal";
      err.detail = JSON.stringify(attached.detail ?? { reason: attached.reason ?? "batch_attach_failed" });
      throw err;
    }
    await client.query("commit");
    // NO OBJECT SPREAD ANYWHERE IN THIS MODULE. `check-parts-parity.mjs` refuses one in any file
    // it can reach, because a spread is a shape it cannot classify statically — and this module is
    // reachable from `src/intakeRoutes.ts`. Every field is named.
    return Object.freeze({
      intake_id: started.intake_id,
      upload_token: started.upload_token,
      expires_at: started.expires_at ?? null,
      batch_id: batchId,
      member_id: attached.member?.member_id ?? null,
    });
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* the connection is already gone; checkout()'s own cleanup discards it */
    }
    if (intakeId && typeof cleanup === "function") {
      await Promise.resolve(cleanup(intakeId)).catch((e) => {
        log(`[clara-runtime] intake batch: could not drop the spool for rolled-back intake=${intakeId}: ${String(e?.message || e)}`);
      });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// §3  THE CAPACITY WAIT, and the measurement that makes it necessary.
//
// MEASURED on clara_636 (0229's header, M2): a post-custody capacity refusal comes out of
// `clara._resize_document_reservation` as SQLSTATE `CLR18`. `lib/intake.mjs:155-159` maps eight
// LITERAL codes and everything else to `internal` — and a pg error's `.code` is the SQLSTATE, not
// one of those eight — so the intake lands at `failure_code='internal'` and 0229's trigger arm (b),
// which keys on `failure_code='limit'`, never fires in production. This function is therefore the
// PRODUCTION path to `awaiting_capacity`; the trigger stays as the belt for the day the database
// itself raises `limit`.
//
// THE ACTOR COMES FROM THE SIDECAR, because the finalize route carries a CAPABILITY TOKEN and no
// human principal (`src/intakeRoutes.ts:125-147`). `readIntakeMeta(intakeId).uploadedBy` is the
// human who began the upload (written at `intake.mjs:182`), and it is still there on this path:
// `canonicalReached` is true and `internal` is not one of the three spool-clearing codes
// (`intake.mjs:424-426`). The DOOR then rechecks that human's LIVE membership at bookkeeper rank
// for itself — this function grants nothing.
//
// IT SWALLOWS ITS OWN REFUSAL. A CLR04 (the uploader's authority was revoked between upload and
// refusal) or a CLR11 (this intake is in no batch) is logged and returned typed. It must NEVER
// turn the finalize route's honest 429 into a 500: the accountant's remedy is "wait for 08:00",
// not "something exploded".
// ---------------------------------------------------------------------------------------------

/** @returns {Promise<BatchAnswer>} */
export async function recordCapacityWait(withRuntimeFn, intakeId, err, { log = NOOP_LOG, readMeta = readIntakeMeta } = {}) {
  if (String(err?.code || "") !== "CLR18") return { status: "skipped", reason: "not_a_capacity_refusal" };
  let actor = null;
  try {
    actor = (await readMeta(intakeId))?.uploadedBy ?? null;
  } catch (e) {
    log(`[clara-runtime] intake batch: no sidecar for intake=${intakeId}: ${String(e?.message || e)}`);
  }
  if (!actor) return { status: "skipped", reason: "no_sidecar_actor" };
  try {
    return await withRuntimeFn(async (client) => {
      const out = await setMemberDependency(client, {
        actor,
        intakeId,
        dependency: "awaiting_capacity",
        // The database's OWN sentence, verbatim. It is the operator remedy the card renders.
        reason: String(err?.message || "document daily limit reached"),
        opKey: `intake-batch-capacity:${intakeId}`,
      });
      if (out.status !== "ok") {
        log(`[clara-runtime] intake batch: capacity wait not recorded for intake=${intakeId}: ${out.status} ${out.code ?? ""} ${out.reason ?? ""}`);
      }
      return out;
    });
  } catch (e) {
    log(`[clara-runtime] intake batch: capacity wait unavailable for intake=${intakeId}: ${String(e?.message || e)}`);
    return { status: "unavailable", code: null, message: String(e?.message || e) };
  }
}

// ---------------------------------------------------------------------------------------------
// §4  THE FAN-OUT, and its resume.
//
// ONE `clara.cancel_accounting_work` PER CHILD, ONE CALL PER TRANSACTION. That is not an
// optimisation, it is the acceptance criterion: a child that already posted answers
// `already_completed` and KEEPS its receipt (0199:230-272), and a child already settling answers
// `already_stopping` (0199:295-304). One transaction around all of them would make the first
// refusal roll the others back.
//
// EVERY CHILD'S KEY IS DERIVED, NEVER MINTED. `<cancel_op_key>:<work_id>` is a pure function of
// the parent decision, so two runs of this fan-out issue BYTE-IDENTICAL calls and `_reserve_op`
// (0004:46-60) replays the stored result instead of deciding twice.
//
// THE AUTHOR IS THE STORED ONE, NEVER THE SWEEP'S. MEASURED on the rig:
// `clara._work_door_ctx` hashes `{work, author}` (0184:262-264), so `cancel_accounting_work(w, bob,
// 'k')` after `cancel_accounting_work(w, alice, 'k')` raises CLR10 `op_key_conflict`. A resumed
// fan-out that passed the reconciler's own identity would refuse on EVERY child.
//
// CLR13 `operation_in_flight` IS NOT A FAILURE. It means a sibling holds this exact key right now;
// the child is left for the next sweep, which is the same answer as "not finished yet".
// ---------------------------------------------------------------------------------------------

/** The one place a child's op key is spelled. Two callers, one spelling. */
export const childCancelKey = (cancelOpKey, workId) => `${cancelOpKey}:${workId}`;

async function fanOutCancel(withRuntimeFn, { actor, cancelOpKey, children, log = NOOP_LOG }) {
  const cancelled = []; const deferred = []; const refused = [];
  for (const child of children ?? []) {
    const workId = child?.work_id;
    if (!workId) continue;
    try {
      // AWAITED IN A LOOP, DELIBERATELY: one call per transaction, by design (see §4)
      const out = await withRuntimeFn((client) => callDoor(client,
        "select clara.cancel_accounting_work($1::uuid,$2::uuid,$3::text) as result",
        [workId, actor, childCancelKey(cancelOpKey, workId)]));
      cancelled.push({ work_id: workId, status: out?.status ?? null, replayed: out?.replayed ?? null });
    } catch (err) {
      const classified = classify(err);
      if (classified.code === "CLR13" && classified.reason === "operation_in_flight") {
        deferred.push({ work_id: workId, reason: "operation_in_flight" });
        continue;
      }
      log(`[clara-runtime] intake batch: child cancel refused work=${workId}: ${classified.code ?? ""} ${classified.reason ?? ""} ${classified.message}`);
      refused.push({ work_id: workId, code: classified.code, reason: classified.reason });
    }
  }
  return { cancelled, deferred, refused };
}

/**
 * The human's press. ONE governed decision (`clara.cancel_intake_batch`), then the fan-out.
 * The decision's own answer carries the child list and the actor/key the fan-out must use, which
 * is what makes a replay of this whole function produce identical calls.
 */
/** @returns {Promise<BatchAnswer>} */
export async function cancelBatch(withRuntimeFn, { actor, batchId, opKey, log = NOOP_LOG }) {
  let decision;
  try {
    decision = await withRuntimeFn((client) => callDoor(client,
      "select clara.cancel_intake_batch($1::uuid,$2::uuid,$3::text) as result",
      [actor, batchId, opKey]));
  } catch (err) {
    return classify(err);
  }
  const fan = await fanOutCancel(withRuntimeFn, {
    actor: decision?.cancel_requested_by ?? actor,
    cancelOpKey: decision?.cancel_op_key ?? opKey,
    children: decision?.children ?? [],
    log,
  });
  return {
    status: "ok", decision,
    cancelled: fan.cancelled, deferred: fan.deferred, refused: fan.refused,
  };
}

/**
 * The belt's arm. `parent` is ONE element of `sweep_intake_batch_cancellations`' `batches` array,
 * so the actor and the key are the STORED ones by construction — this function cannot use its own
 * identity even by accident, because it has none.
 */
/** @returns {Promise<BatchAnswer>} */
export async function resumeCancel(withRuntimeFn, parent, { log = NOOP_LOG } = {}) {
  if (!parent?.cancel_requested_by || !parent?.cancel_op_key) {
    return { status: "refused", code: null, reason: "missing_stored_decision", message: "a resumed fan-out needs the STORED actor and key" };
  }
  const fan = await fanOutCancel(withRuntimeFn, {
    actor: parent.cancel_requested_by,
    cancelOpKey: parent.cancel_op_key,
    children: parent.live ?? [],
    log,
  });
  return {
    status: "ok", batch_id: parent.batch_id,
    cancelled: fan.cancelled, deferred: fan.deferred, refused: fan.refused,
  };
}
