// F-A3 PR-1b -- wake-verbs battery shared fixture CORE (NOT a test file: the name does not end
// in `.test.mjs`, so `node --test` ignores it). Split out of f-a3-pr1b-wake-verbs.test.mjs purely
// to keep it under the repo's 500-line gate (the wave-a-helpers/wave-a-fixtures split precedent,
// also used by f-a3-pr1b-fixtures.mjs and x38-match-fixtures.mjs). Every function here is
// STATELESS except where it plainly says otherwise.

import { rootQuery } from "./a21-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import { GUARD } from "./x38-match-fixtures.mjs";

export const WAKE_ROLE = "clara_wake_bank_login";
export const RATIONALE = "f31w battery: unattended agent judgement";
export const MODEL = { provider: "openai", model: "gpt-5.6-terra", version: "v1" };

/** Mint a real wake credential and return { id, secret } (mint_wake_credential builds no ctx,
 *  so rootQuery is fine -- the pinned shape f-a3-pr1b-agent-limb.test.mjs's f31b.f already uses). */
export async function mintCred(kind, firm, client, obo = null) {
  const r = await rootQuery(
    "select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)",
    [kind, firm, obo, client]);
  return { id: r.rows[0].id, secret: r.rows[0].secret };
}

export function callWrapper(name, specs) {
  return `select clara.${name}(${specs.map((s, i) => `${s.name} => $${i + 1}${s.cast ? `::${s.cast}` : ""}`).join(", ")}) as r`;
}

/** A plain APPROVED 2-leg entry (Dr bankCoa / Cr other, both = cents), the draft -> lines ->
 *  approve order every real writer uses (`_tf_lines_immutable` refuses a lines write once the
 *  entry is anything but 'draft', INCLUDING the entry's very first insert if it is born
 *  'approved' directly -- rig-replay-caught by this file's own battery, f31w.h/i/j). ONE
 *  transaction (db-tests.md's withTxn rule): a deferred balance trigger fires on the entry alone
 *  otherwise. Returns the entry id. */
export async function approvedEntry({ client, actor, postingDate, memo, bankCoa, otherCoa, cents }) {
  return withTxn(async (c) => {
    await c.query(GUARD);
    const draft = await c.query(
      `insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor)
         values ($1,'draft',$2,$3,'manual',$4) returning id`,
      [client, postingDate, memo, actor]);
    const entryId = draft.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents)
         values ($1,1,$2,$4,0),($1,2,$3,0,$4)`,
      [entryId, bankCoa, otherCoa, cents]);
    await c.query(
      `update clara.journal_entries set status='approved', checker_actor=$2, approved_at=now() where id=$1`,
      [entryId, actor]);
    return entryId;
  });
}
