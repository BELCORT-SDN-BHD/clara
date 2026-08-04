// 0042 Wave D-b — the AF-2 RE-BOOK battery's own INSTRUMENTS (NOT a test file:
// the name does not end in `.test.mjs`, so `node --test` ignores it). Split out
// because the repo's 500-line-per-file gate is enforced; the cells live in
// `x42-af2-rebook.test.mjs` and the lane law lives in that file's header.

import assert from "node:assert/strict";
import { rootQuery, humanQuery, namedCall, opk, reverseEntry } from "./a21-helpers.mjs";
import { BANKCOA, REVN, unmatchBankMatch, approveEntry, entryRowOf } from "./x42-af2-world.mjs";

/** THE GL TOTAL IS THE POINT of this battery: it sums every APPROVED line on the
 *  account, reversal mirrors INCLUDED, because a reversed original stays
 *  approved (0003) and the mirror is what brings the account back. Filtering
 *  `reversed_by IS NULL` would hide the mirror and report a reversal as a
 *  NEGATIVE balance — the wrong instrument for "how much bank GL does this one
 *  statement line carry". */
export async function glTotal(client, code) {
  const r = await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents), 0)::bigint as n
       from clara.journal_lines l
       join clara.journal_entries e on e.id = l.entry_id
      where e.client_id = $1 and l.account_code = $2 and e.status = 'approved'`,
    [client, code],
  );
  return Number(r.rows[0].n);
}

/** Every advisory lock a backend currently holds, as {classid, objid}. */
export const advisoryLocks = async (pid) =>
  (await rootQuery(
    "select classid, objid from pg_locks where locktype='advisory' and pid=$1 and granted", [pid],
  )).rows.map((x) => ({ classid: Number(x.classid), objid: Number(x.objid) }));

/** Is the 203005003 counterparty rung held for (client, cp)? `hashtext` is int4
 *  and pg_locks.objid is an unsigned oid, so the comparison is on the low 32
 *  bits — computed through the same expression the verbs key on, never
 *  re-derived in JavaScript. */
export async function rungHeld(pid, client, cp) {
  const want = Number((await rootQuery(
    "select (hashtext($1::text)::bigint & 4294967295) as h", [`${client}:${cp}`])).rows[0].h);
  return (await advisoryLocks(pid)).some((l) => l.classid === 203005003 && l.objid === want);
}

/** The plain two-leg hand-draft this battery books over and over. */
export const twoLegDraft = (postingDate, memo, cents) => ({
  posting_date: postingDate, memo,
  lines: [
    { account_code: BANKCOA, debit_cents: cents, credit_cents: 0, description: "into the bank" },
    { account_code: REVN, debit_cents: 0, credit_cents: cents, description: "sundry income" },
  ],
});

/** A hand-draft carrying a TOP-LEVEL counterparty proposal and a control-class
 *  credit leg. `_draft_entry_core` reads NO per-line counterparty_id (measured:
 *  its journal_lines INSERT selects only account_code / amounts / description),
 *  so the proposal is the only channel a hand-draft has — and it is exactly the
 *  channel `_approve_entry_core` re-resolves and re-canonicalises at approve
 *  time, which is what makes the merge race reachable at all. */
export const stampedDraft = (postingDate, memo, cents, control, cp) => ({
  posting_date: postingDate, memo,
  counterparty: { existing_id: cp, kind: "customer" },
  lines: [
    { account_code: BANKCOA, debit_cents: cents, credit_cents: 0, description: "dr bank" },
    { account_code: control, debit_cents: 0, credit_cents: cents, description: "cr debtor" },
  ],
});

/** Run a composed `remedy_calls` chain EXACTLY as the refusal named it. A remedy
 *  the human cannot execute as written IS the walled-corridor defect, so the
 *  cells drive the payload rather than a hand-written approximation of it.
 *
 *  `checker` exists because `reverse_entry` leaves a HIGH-STAKES mirror as a
 *  DRAFT (0003/0041): the remedy for a high-stakes booking is genuinely two
 *  human acts, and a cell that only called reverse_entry would report the GL as
 *  un-unwound and blame the wrong thing. */
export async function runRemedy(sub, client, calls, label, { checker = null } = {}) {
  for (const step of calls) {
    if (step.fn === "clara.unallocate_group") {
      await humanQuery(sub, namedCall("unallocate_group", [
        { name: "p_client" }, { name: "p_group" }, { name: "p_reason" }, { name: "p_op_key" }]),
      [client, step.group_id, `${label}: unwinding the released booking`, opk("x42rb-unalloc")]);
    } else if (step.fn === "clara.reverse_entry") {
      const rev = await reverseEntry(sub, {
        entry: step.entry_id, reason: `${label}: un-booking the released entry`, opKey: opk("x42rb-rev"),
      });
      if (rev?.status === "draft") {
        assert.ok(checker, `${label}: the reversal mirror is high-stakes and needs a distinct checker`);
        const mirror = await entryRowOf(rev.reversal_id);
        await approveEntry(checker, {
          entry: rev.reversal_id, expectedRevision: mirror.revision_token, opKey: opk("x42rb-revapr"),
        });
      }
    } else if (step.fn === "clara.unmatch_bank_match") {
      await unmatchBankMatch(sub, {
        client, match: step.match_id, reason: `${label}: releasing the group first`, opKey: opk("x42rb-unm"),
      });
    } else {
      assert.fail(`${label}: the composed remedy names an unknown call '${step.fn}'`);
    }
  }
}
