// #657 — THE NO-NEW-CASH PROOF SHAPE, as a reusable helper.  NOT a test file.
//
// AC3's whole claim is a NEGATIVE: matching a bank line to an ALREADY-APPROVED booking must
// allocate the existing movement and create nothing — no journal entry, no journal line, no
// open item, no allocation — and the client's GL cash on that bank account must read the same
// number before and after. The behaviour has been implemented since 0038; nothing in the estate
// asserted it, which is why the same negative had to be re-argued in every review.
//
// It is exported rather than inlined because #666 and #667 land on this chassis next
// (SYNTHESIS.md:447 — both are blocked by #657) and a second, slightly different copy of
// "prove nothing was created" is exactly how two lanes come to disagree about what "nothing"
// means. The shape is: snapshot → act → snapshot → diff, with the GL figure read through the
// PRODUCT'S OWN existing expression rather than a second one written for the test.
//
// THE GL FIGURE IS `list_bank_statements(...)->'tie'->>'gl_balance_cents'` (0038:7942-7947),
// read under a REAL least-privileged human persona. #657 deliberately adds no other cash
// expression on its side. (Open question for the owner, raised in #657's report: #660 ships a
// separate "book cash" over its own governed cash-account set, and nobody has ruled the two
// into one.)

import assert from "node:assert/strict";
import { rootQuery, humanQuery } from "./rig-helpers.mjs";

/**
 * The five figures AC3 is about, for one client + one bank account.
 *
 * The four counts are structural facts about what exists, so they are read as root and
 * LABELLED as such (evidence law: `rootQuery` only for labelled fixture reads). The GL figure
 * — the one the acceptance criterion actually names — is read under `sub`'s own least-
 * privileged session through the granted door, because "a bookkeeper sees the same number"
 * is part of the claim.
 *
 * @param {string} sub        the human subject whose session reads the GL figure
 * @param {{client:string, bankAccount:string, statement?:string|null}} where
 */
export async function snapshotNoNewCash(sub, { client, bankAccount, statement = null }) {
  const counts = await rootQuery(
    `select
       (select count(*) from clara.journal_entries where client_id = $1) as journal_entries,
       (select count(*) from clara.journal_lines jl
          join clara.journal_entries je on je.id = jl.entry_id where je.client_id = $1) as journal_lines,
       (select count(*) from clara.open_items where client_id = $1) as open_items,
       (select count(*) from clara.open_item_allocations where client_id = $1) as open_item_allocations,
       (select count(*) from clara.op_receipts r
          join clara.clients c on c.firm_id = r.firm_id where c.id = $1) as op_receipts`,
    [client],
  );
  const tie = await humanQuery(
    sub,
    "select clara.list_bank_statements(p_client => $1::uuid, p_bank_account => $2::uuid) as result",
    [client, bankAccount],
  );
  const rows = tie.rows[0].result ?? [];
  const row = statement ? rows.find((r) => r.id === statement) : rows[0];
  const c0 = counts.rows[0];
  return {
    journal_entries: Number(c0.journal_entries),
    journal_lines: Number(c0.journal_lines),
    open_items: Number(c0.open_items),
    open_item_allocations: Number(c0.open_item_allocations),
    op_receipts: Number(c0.op_receipts),
    gl_balance_cents: row ? Number(row.tie.gl_balance_cents) : null,
    unmatched_cents: row ? Number(row.tie.unmatched_cents) : null,
  };
}

/**
 * Assert a match created NO cash. The four object counts and the GL figure must be unchanged;
 * `op_receipts` must have grown by EXACTLY the number of governed operations the act performed
 * (one for a plain match — the door reserves one op key and finishes it once).
 *
 * @param {ReturnType<typeof snapshotNoNewCash> extends Promise<infer T> ? T : never} before
 * @param {ReturnType<typeof snapshotNoNewCash> extends Promise<infer T> ? T : never} after
 * @param {{label:string, expectedNewReceipts?:number}} opts
 */
export function assertNoNewCash(before, after, { label, expectedNewReceipts = 1 }) {
  for (const key of ["journal_entries", "journal_lines", "open_items", "open_item_allocations"]) {
    assert.equal(
      after[key], before[key],
      `${label}: ${key} moved ${before[key]} -> ${after[key]} — a match against an already-approved booking creates NO new accounting object`,
    );
  }
  assert.equal(
    after.gl_balance_cents, before.gl_balance_cents,
    `${label}: GL cash on the bank account moved ${before.gl_balance_cents} -> ${after.gl_balance_cents} — matching allocates an existing movement, it never books a second one`,
  );
  assert.equal(
    after.op_receipts - before.op_receipts, expectedNewReceipts,
    `${label}: expected exactly ${expectedNewReceipts} new op_receipts row(s), saw ${after.op_receipts - before.op_receipts}`,
  );
}

/** The `new_journal_entries: 0` / `settlement_objects: 0` pair #657 put on the door's own
 *  receipt (0226 §6). A face that renders "no new cash entry was created" must read THIS,
 *  never assert it client-side. */
export function assertReceiptStatesNoNewCash(receipt, label) {
  assert.ok(receipt && typeof receipt === "object", `${label}: the match receipt is not an object`);
  assert.equal(
    Number(receipt.new_journal_entries), 0,
    `${label}: the door's own receipt must state new_journal_entries = 0 (got ${JSON.stringify(receipt.new_journal_entries)})`,
  );
  assert.equal(
    Number(receipt.settlement_objects), 0,
    `${label}: the door's own receipt must state settlement_objects = 0 (got ${JSON.stringify(receipt.settlement_objects)})`,
  );
}
