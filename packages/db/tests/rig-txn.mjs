// Slice-2 rig — low-level manual-transaction + concurrency helpers (NOT a test
// file). These exercise the DEFERRED constraint triggers on the raw superuser
// path (balance/provenance fire at COMMIT even when the writer is bypassed) and
// the FOR UPDATE concurrency backstops. Kept out of the test file so the test
// bodies stay assertion-thin.
//
// Raw INSERTs list only the columns the contract marks NOT NULL without a default
// (client_id, posting_date, origin, status, maker_actor [+ the document pair]).
// firm_id (entries) and client_id/firm_id (lines) are trigger-stamped from the
// parent, so we never pass them. If lane-M adds another NOT NULL-without-default
// column, these INSERTs fail loudly — a real finding, not a silent skip.

import { getPool, namedCall, opk, ROLES } from "./rig-helpers.mjs";

/**
 * Attempt a TRUNCATE (as superuser) and return the resulting error, retrying the
 * TRANSIENT lock races that a shared, concurrently-written DB produces.
 *
 * TRUNCATE takes a table-level ACCESS EXCLUSIVE lock on the named table AND every
 * cascade dependent; on a hot table (audit_log / journal_* / domain_events) that
 * contends with the other test files' concurrent writers and can lose a deadlock
 * (40P01) or lock-wait race BEFORE reaching the BEFORE TRUNCATE guard. A short
 * lock_timeout turns the wait into a fast 55P03 (below deadlock_timeout), and we
 * retry so the assertion observes the GUARD's SQLSTATE (CLR08), not the race.
 * Returns the final error (expected: the append-only guard's CLR08) or null.
 */
export async function truncateGuardError(sql, { tries = 15, lockTimeoutMs = 700 } = {}) {
  for (let i = 0; ; i++) {
    const c = await getPool().connect();
    let err = null;
    try {
      await c.query(`set lock_timeout = '${lockTimeoutMs}ms'`);
      await c.query(sql);
    } catch (e) {
      err = e;
    } finally {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
    if (!err) return null; // truncate SUCCEEDED — the guard failed to fire (a real defect)
    if ((err.code === "40P01" || err.code === "55P03") && i < tries) {
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 160));
      continue;
    }
    return err;
  }
}

/** Run fn(client) inside one superuser txn; COMMIT at the end. Always resets. */
export async function withTxn(fn, { commit = true } = {}) {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query(commit ? "commit" : "rollback");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    // RESET ALL does NOT reset the role — a SET ROLE'd client would return to the
    // pool impersonating, poisoning a later rootQuery (which assumes superuser).
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

async function insertRawEntry(c, { client, origin = "manual", status = "draft", memo = "raw", maker, documentId = null, sha256 = null }) {
  const r = await c.query(
    `insert into clara.journal_entries (client_id, posting_date, memo, origin, status, maker_actor, document_id, source_doc_sha256)
     values ($1, '2026-01-15', $2, $3, $4, $5, $6, $7) returning id`,
    [client, memo, origin, status, maker, documentId, sha256],
  );
  return r.rows[0].id;
}

async function insertRawLine(c, { entry, lineNo, account, debit = 0, credit = 0 }) {
  await c.query(
    "insert into clara.journal_lines (entry_id, line_no, account_code, debit_cents, credit_cents) values ($1, $2, $3, $4, $5)",
    [entry, lineNo, account, debit, credit],
  );
}

/** T9 — a raw unbalanced entry that COMMITs must be caught by the deferred balance
 * trigger (CLR07), even with SET CONSTRAINTS ALL DEFERRED. */
export function commitRawUnbalanced({ client, maker, coa }) {
  return withTxn(async (c) => {
    await c.query("set constraints all deferred");
    const entry = await insertRawEntry(c, { client, maker });
    await insertRawLine(c, { entry, lineNo: 1, account: coa.cash, debit: 100 }); // no matching credit
  });
}

/** T4 — a raw entry whose (document, sha) pair MISMATCHES must be caught by the
 * deferred provenance constraint trigger (CLR02) at commit. Lines are balanced so
 * only provenance can fail. */
export function commitRawProvenanceMismatch({ client, maker, documentId, wrongSha, coa, amount = 1000 }) {
  return withTxn(async (c) => {
    const entry = await insertRawEntry(c, { client, maker, origin: "document", documentId, sha256: wrongSha });
    await insertRawLine(c, { entry, lineNo: 1, account: coa.cash, debit: amount });
    await insertRawLine(c, { entry, lineNo: 2, account: coa.sales, credit: amount });
  });
}

/** T4 — a raw entry with a NULL-paired document/sha violates the both-or-neither
 * CHECK immediately (23514), not at commit. */
export function insertRawNullPair({ client, maker, documentId }) {
  return withTxn(async (c) => {
    await insertRawEntry(c, { client, maker, origin: "document", documentId, sha256: null });
  });
}

/** T9 — moving a line between two balanced drafts must leave BOTH balanced; a move
 * that unbalances them is caught at commit (CLR07). Builds two balanced drafts,
 * then reparents one line. */
export function commitRawMovedLine({ client, maker, coa, amount = 500 }) {
  return withTxn(async (c) => {
    const e1 = await insertRawEntry(c, { client, maker, memo: "e1" });
    await insertRawLine(c, { entry: e1, lineNo: 1, account: coa.cash, debit: amount });
    await insertRawLine(c, { entry: e1, lineNo: 2, account: coa.sales, credit: amount });
    const e2 = await insertRawEntry(c, { client, maker, memo: "e2" });
    await insertRawLine(c, { entry: e2, lineNo: 1, account: coa.cash, debit: amount });
    await insertRawLine(c, { entry: e2, lineNo: 2, account: coa.sales, credit: amount });
    // Reparent one leg of e1 onto e2 → both become unbalanced.
    await c.query("update clara.journal_lines set entry_id = $1, line_no = 3 where entry_id = $2 and line_no = 1", [e2, e1]);
  });
}

/** T10 / HIGH 3 — reparent one line OUT OF an approved entry onto a draft. The
 * line-immutability trigger inspects the OLD parent (approved) → CLR08, so an
 * approved entry can never silently lose a line through a move. */
export function reparentLineFromApproved({ approvedEntry, draftEntry, lineNo = 1, newLineNo = 97 }) {
  return withTxn(async (c) => {
    await c.query("update clara.journal_lines set entry_id = $1, line_no = $2 where entry_id = $3 and line_no = $4", [
      draftEntry,
      newLineNo,
      approvedEntry,
      lineNo,
    ]);
  });
}

/** T8 / HIGH 3 — moving a line between two DRAFTS must rotate BOTH parents' tokens
 * (else the source draft's stale revision stays usable after it lost a line). We
 * observe the rotation INSIDE the txn (the AFTER trigger fires immediately; the
 * deferred balance check only fires at commit), then roll back. */
export async function moveLineBetweenDraftsRotatesTokens({ draftA, draftB }) {
  const c = await getPool().connect();
  const tok = async (id) => (await c.query("select revision_token from clara.journal_entries where id = $1", [id])).rows[0].revision_token;
  try {
    await c.query("begin");
    const a0 = await tok(draftA);
    const b0 = await tok(draftB);
    await c.query("update clara.journal_lines set entry_id = $1, line_no = 96 where entry_id = $2 and line_no = 1", [draftB, draftA]);
    const a1 = await tok(draftA);
    const b1 = await tok(draftB);
    await c.query("rollback");
    return { rotatedSource: a1 !== a0, rotatedDest: b1 !== b0 };
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** T6 / HIGH 2 — two concurrent proactive notifications on ONE single-use
 * credential (distinct op keys). c1 consumes-and-holds the row lock; c2 blocks,
 * then after c1 commits its `where consumed_at is null` matches 0 rows → CLR03 and
 * its whole txn (notification included) rolls back. Exactly one notification. */
export async function raceProactiveNotification({ secret }) {
  const call = "select clara.wake_record_notification(p_kind => $1, p_payload => '{}'::jsonb, p_op_key => $2) as r";
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null };
  try {
    await c1.query(`set role ${ROLES.wakeProactive}`);
    await c1.query("begin");
    await c1.query("select set_config('clara.wake_secret', $1, true)", [secret]);
    await c1.query(call, ["race.a", opk()]); // consumes + writes; txn open, row lock held
    out.a = { ok: true };

    await c2.query(`set role ${ROLES.wakeProactive}`);
    await c2.query("begin");
    await c2.query("select set_config('clara.wake_secret', $1, true)", [secret]);
    const c2p = c2
      .query(call, ["race.b", opk()])
      .then(() => { out.b = { ok: true }; })
      .catch((e) => { out.b = { ok: false, code: e.code }; });

    await c1.query("commit"); // releases the lock; c2's conditional consume now matches 0 rows
    await c2p;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}

/** T8 / concurrency — two sessions approve the same draft with the same expected
 * revision; exactly one wins, the other loses (CLR06 stale-token, or CLR10 once
 * the status has flipped to approved under the lock). */
export async function raceApprove({ entry, expectedRevision, subA, subB }) {
  const approveSql = namedCall("approve_entry", [{ name: "p_entry" }, { name: "p_expected_revision" }, { name: "p_op_key" }]);
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null };
  try {
    await c1.query(`set role ${ROLES.authenticated}`);
    await c1.query("begin");
    await c1.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: subA })]);
    await c1.query(approveSql, [entry, expectedRevision, opk()]); // holds FOR UPDATE

    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: subB })]);
    const c2p = c2
      .query(approveSql, [entry, expectedRevision, opk()])
      .then(() => { out.b = { ok: true }; })
      .catch((e) => { out.b = { ok: false, code: e.code }; });

    await c1.query("commit");
    out.a = { ok: true };
    await c2p;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {}); // RESET ALL does NOT reset the role
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}
