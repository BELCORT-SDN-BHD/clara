import { getPool } from "../lib/db.js";
import type { Approval, CompletionResult, PostEntryResult } from "../lib/types.js";

/**
 * Record one step-body invocation in the canary table. Runs as its own
 * autocommit statement BEFORE the domain transaction, so the evidence of a
 * re-invocation survives even when the process dies right after the domain
 * commit (T4) or when the domain transaction hits the ON CONFLICT path.
 */
async function logInvocation(opKey: string, stepName: string, note: string | null): Promise<void> {
  await getPool().query(
    "insert into spike.step_invocations (op_key, step_name, note) values ($1, $2, $3)",
    [opKey, stepName, note],
  );
}

/**
 * Step A - post_entry.
 *
 * Inserts the posting (idempotent on op_key) and its receipt in ONE
 * transaction. On replay the ON CONFLICT path returns the ORIGINAL row and
 * sets wasDuplicate - the DB idempotency key doing its job (T4).
 *
 * FAULT INJECTION (T4, the Codex-mandated test): with FAULT=kill-after-commit
 * the process exits IMMEDIATELY after the transaction commits but BEFORE the
 * step returns, so the engine never records step completion (worker death
 * before step-completion ack). The fault only fires on a FRESH insert
 * (wasDuplicate=false): the replayed invocation takes the duplicate path and
 * returns normally even if FAULT is still set.
 */
export async function postEntry(opKey: string, amountCents: number): Promise<PostEntryResult> {
  "use step";
  const faultArmed = process.env.FAULT === "kill-after-commit";
  await logInvocation(opKey, "post_entry", faultArmed ? "fault-armed" : null);

  const client = await getPool().connect();
  let result: PostEntryResult;
  try {
    await client.query("begin");
    const inserted = await client.query<{ id: string }>(
      `insert into spike.postings (op_key, amount_cents)
       values ($1, $2)
       on conflict (op_key) do nothing
       returning id`,
      [opKey, amountCents],
    );
    const wasDuplicate = inserted.rowCount === 0;
    const postingId = wasDuplicate
      ? (await client.query<{ id: string }>("select id from spike.postings where op_key = $1", [opKey])).rows[0]!.id
      : inserted.rows[0]!.id;

    const receiptNo = `rcpt-${opKey}`;
    await client.query(
      `insert into spike.receipts (posting_id, receipt_no)
       values ($1, $2)
       on conflict (receipt_no) do nothing`,
      [postingId, receiptNo],
    );
    const receipt = await client.query<{ id: string }>(
      "select id from spike.receipts where receipt_no = $1",
      [receiptNo],
    );
    await client.query("commit");
    result = {
      postingId,
      receiptId: receipt.rows[0]!.id,
      receiptNo,
      amountCents,
      wasDuplicate,
    };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (faultArmed && !result.wasDuplicate) {
    console.error(
      `[FAULT] kill-after-commit: posting committed (op_key=${opKey}, posting_id=${result.postingId}); exiting before step-completion ack`,
    );
    process.exit(1);
  }
  return result;
}

/**
 * T6 marker step: writes an observable canary row so tests can tell WHICH
 * workflow code version executed the post-hook continuation. Added in the
 * "V2 alongside" deploy (build B); the frozen V1 body never called it.
 */
export async function auditMark(opKey: string, marker: string): Promise<string> {
  "use step";
  await logInvocation(opKey, "audit_mark", marker);
  return marker;
}

/**
 * Step B - finalize. Inserts the completion marker keyed to the run
 * (idempotent on op_key, which is 1:1 with the run in this demo).
 */
export async function finalize(runId: string, opKey: string, approval: Approval): Promise<CompletionResult> {
  "use step";
  await logInvocation(opKey, "finalize", null);

  const pool = getPool();
  const inserted = await pool.query<{ id: string }>(
    `insert into spike.completions (run_id, op_key, approved, approver)
     values ($1, $2, $3, $4)
     on conflict (op_key) do nothing
     returning id`,
    [runId, opKey, approval.approved, approval.approver ?? null],
  );
  const wasDuplicate = inserted.rowCount === 0;
  const row = await pool.query<{ id: string; run_id: string; approved: boolean; approver: string | null }>(
    "select id, run_id, approved, approver from spike.completions where op_key = $1",
    [opKey],
  );
  const completion = row.rows[0]!;
  return {
    completionId: completion.id,
    runId: completion.run_id,
    opKey,
    approved: completion.approved,
    approver: completion.approver,
    wasDuplicate,
  };
}
