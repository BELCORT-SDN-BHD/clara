// 0042 Wave D-b — the AF-2 ONE-STANDING-BOOKING battery, ROUND 5: shared
// INSTRUMENTS (NOT a test file: the name does not end in `.test.mjs`, so
// `node --test` ignores it). Split out because the repo's 500-line-per-file gate
// is enforced; the cells live in `x42-af2-rebook3.test.mjs`.

import assert from "node:assert/strict";
import { rootQuery, opk } from "./a21-helpers.mjs";
import {
  AR1, REVN, BANKCOA, EXPN, AP1,
  enterStatement, freshBankAccount, nextPeriod, stampedItem, birthCounterparty,
  settleFromBankLine, matchIdOf, uniq,
} from "./x42-af2-world.mjs";

/** A LIVE statement carrying MANY lines on ONE fresh account, in its own period
 *  — the corrective-pair drill needs two lines that net to zero on the SAME bank
 *  account, and `bankLine` mints one line per account by construction. */
export async function bankLines(sub, { client, specs }) {
  const bankAccount = await freshBankAccount(sub, client);
  const p = nextPeriod();
  const stmt = await enterStatement(sub, {
    client, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: specs.map((s) => ({ entryDate: p.mid, ...s })),
  });
  return { bankAccount, period: p, statement: stmt.statementId, lines: stmt.lines };
}

/** A customer receipt settled STRAIGHT off a statement line: the invoice is
 *  minted at exactly the line amount, so the settlement ties and the group goes
 *  LIVE (below the high-stakes threshold). Returns the group and the invoice. */
export async function settleLine(sub, {
  client, line, cents, postingDate, cp, checker = null, label = "x42 r5 settle",
}) {
  const counterparty = cp ?? await birthCounterparty(sub, {
    client, name: `X42 R5 ${uniq()}`, kind: "customer",
  });
  const inv = await stampedItem(sub, {
    client, domain: "ar", cp: counterparty, cpKind: "customer", cents, control: AR1,
    postingDate, checker,
  });
  const receipt = await settleFromBankLine(sub, {
    client, line, counterparty,
    allocations: [{ item_id: inv.item, amount_cents: cents }],
    memo: label, postingDate, opKey: opk("x42r5-settle"),
  });
  return { receipt, match: matchIdOf(receipt), counterparty, invoice: inv, entry: receipt.entry_id };
}

/** Every APPROVED bank-GL movement of a client, as {entry_id, cents}. The
 *  battery's headline instrument is the TOTAL (kit round 4), but "how many
 *  distinct entries moved this bank account" is what tells a double-post from a
 *  single larger booking, and the round-5 defects are all double-posts. */
export async function bankMovements(client, code = BANKCOA) {
  const r = await rootQuery(
    `select l.entry_id, sum(l.debit_cents - l.credit_cents)::bigint as cents
       from clara.journal_lines l
       join clara.journal_entries e on e.id = l.entry_id
      where e.client_id = $1 and l.account_code = $2 and e.status = 'approved'
      group by l.entry_id having sum(l.debit_cents - l.credit_cents) <> 0
      order by 1`,
    [client, code],
  );
  return r.rows.map((x) => ({ entry_id: x.entry_id, cents: Number(x.cents) }));
}

/** A plain approved entry that DEBITS the bank — the "second booking" every
 *  re-book cell tries to push through a door. */
export const bankDraft = (postingDate, memo, cents) => ({
  posting_date: postingDate, memo,
  lines: [
    { account_code: BANKCOA, debit_cents: cents, credit_cents: 0, description: "dr bank" },
    { account_code: REVN, debit_cents: 0, credit_cents: cents, description: "cr revenue" },
  ],
});

/** A supplier bill of `cents`, for the payment-side settle drill. */
export async function billFor(sub, { client, cents, postingDate, cp, checker = null }) {
  const vendor = cp ?? await birthCounterparty(sub, {
    client, name: `X42 R5 VND ${uniq()}`, kind: "vendor",
  });
  const bill = await stampedItem(sub, {
    client, domain: "ap", cp: vendor, cpKind: "vendor", cents, control: AP1,
    postingDate, checker,
  });
  return { vendor, bill };
}

/** The refusal's own detail object, parsed, with the two facts every round-5
 *  cell asserts. Keeps each cell's assertions about the SHAPE in one place so a
 *  token rename shows up as one diff rather than nine. */
export function blockDetail(err, label) {
  assert.ok(err?.detail, `${label}: the refusal carries a detail payload (got ${err?.message})`);
  const d = JSON.parse(err.detail);
  assert.equal(d.reason, "exception_booking_outstanding",
    `${label}: one law, one token (got ${d.reason})`);
  assert.equal(d.blocking, true, `${label}: the shared verdict says blocking`);
  return d;
}

export const EXPN_CODE = EXPN;
