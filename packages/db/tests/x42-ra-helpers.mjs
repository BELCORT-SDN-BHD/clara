// 0042 Wave D-b — shared fixtures for THE RESERVATION AUTHORITY batteries.
//
// Extracted when the round-4 root-fix cells (x42.ra5 / x42.ra6) pushed
// x42-reservation-authority.test.mjs past the repo's 500-line file cap. Nothing here is new:
// it is the same fixture code, with the acting subject passed explicitly instead of read off
// a module-level world, so two test files can share it without one importing the other's
// tests. x42-reservation-authority.test.mjs owns the ruling's four cells;
// x42-reservation-role.test.mjs owns the two round-4 root fixes.

import { rootQuery, humanCall, withActor, approvedEntry, advWorld,
         FACOST, FAACCUM, FAEXP, WAGES, SHAREV, BANKV, mon, dayIn } from "./x42-adv-world.mjs";

/** Does the shared union currently reserve `code` for `client`? Asked through the union
 *  itself rather than through a verb, so a cell can distinguish "the predicate released it"
 *  from "some door happened to admit it for an unrelated reason". */
export const reserved = async (client, code) =>
  (await rootQuery(
    "select domain, role, owner_ref from clara._acct_role_reserved($1::uuid, $2::text)",
    [client, code],
  )).rows;

/** clara.fa_register_tie(p_client, p_as_of) — read as a human, like every other reader. */
export const faRegisterTie = (sub, client, asOf) =>
  humanCall(sub, "fa_register_tie",
    [{ name: "p_client" }, { name: "p_as_of", cast: "date" }], [client, asOf]);

/** A journal entry to hang lineage off. The legs are a neutral Dr wages / Cr share-capital
 *  pair — nothing in these cells reads them, and keeping them OFF the fixed-asset and the
 *  advance codes is what lets the tie cells attribute a difference to the act under test
 *  rather than to the fixture.
 *
 *  APPROVED entries go through the REAL maker-checker verbs, because the rig's belts are
 *  real: an entry without legs never commits, and legs may not be added to an approved
 *  entry afterwards. Only the DRAFT case is raw (the x37.q / x41 precedent) — it exists
 *  solely so a `pending` register row has the acquisition entry its 0017 CHECK demands. */
export async function plantEntry(alice, client, { status = "approved", memo = "x42 ra" } = {}) {
  const lines = [
    { account_code: WAGES, debit_cents: 1000, credit_cents: 0, description: "x42 ra fixture" },
    { account_code: SHAREV, debit_cents: 0, credit_cents: 1000, description: "x42 ra fixture" },
  ];
  if (status === "approved") {
    return approvedEntry(alice, { client, lines, memo, postingDate: dayIn(mon(-2), 10) });
  }
  const w2 = await advWorld();
  return withActor({ transaction: true }, async (c) => {
    const e = await c.query(
      `insert into clara.journal_entries
         (firm_id, client_id, status, posting_date, memo, origin, maker_actor)
       select cl.firm_id, cl.id, 'draft', current_date - 30, $2::text, 'manual', $3::uuid
         from clara.clients cl where cl.id = $1::uuid returning id`,
      [client, memo, w2.users.alice]);
    await c.query(
      `insert into clara.journal_lines
         (entry_id, line_no, account_code, debit_cents, credit_cents, description)
       values ($1, 1, $2, 1000, 0, 'x42 ra fixture'), ($1, 2, $3, 0, 1000, 'x42 ra fixture')`,
      [e.rows[0].id, WAGES, SHAREV]);
    return e.rows[0].id;
  });
}

/** Plant a clara.fixed_assets row directly, at a chosen lifecycle status. Deliberately a raw
 *  insert: the SUBJECT of these cells is the predicate's reading of `status`, and driving five
 *  statuses through their real verbs would make them tests of the disposal/revision/reversal
 *  machinery (which x41-disposal, x41-round35-g5 and x41-reversal already own) and would not
 *  reach `pending` or `superseded` at all without a K-doc seed and a split. The lawful paths
 *  that PRODUCE each status are exercised in x41; what is unpinned anywhere else, and is
 *  exactly what the ruling turned on, is the mapping from status to claim.
 *
 *  The two 0017 lineage CHECKs are honoured rather than worked around, because they are the
 *  reason the terminal set is what it is: `pending` demands an acquisition entry (it is a
 *  carry-down awaiting approval, which is WHY it must still reserve), and `superseded`
 *  demands a successor (which is WHY a superseded row's claim is redundant — the successor
 *  carries the same codes). The successor planted here is itself UNWOUND, so a cell measures
 *  the superseded row's own contribution and not its child's. */
export async function plantRow(alice, client, { status, cost = FACOST, accum = FAACCUM, expense = FAEXP }) {
  const acq = status === "pending" ? await plantEntry(alice, client, { status: "draft" }) : null;
  const heir = status === "superseded"
    ? await plantRow(alice, client, { status: "unwound", cost, accum, expense })
    : null;
  const { rows } = await rootQuery(
    `insert into clara.fixed_assets
       (firm_id, client_id, description, acquired_date, cost_cents, useful_life_months,
        depreciation_method, asset_account_code, accum_depr_account_code,
        depr_expense_account_code, status, acquisition_entry_id, superseded_by_asset_id)
     select cl.firm_id, cl.id, $2::text, current_date - 400, 100000, 60,
            'straight_line', $3::text, $4::text, $5::text, $6::text, $7::uuid, $8::uuid
       from clara.clients cl where cl.id = $1::uuid
     returning id`,
    [client, `x42 ra ${status}`, cost, accum, expense, status, acq, heir],
  );
  return rows[0].id;
}

/** A DISPOSED register row on the three FA codes, with its disposal entry. The tie cells all
 *  need this exact shape, and building it inline three times is how two of them drifted apart
 *  on the disposal DATE — which is the one field an as-of walk actually turns on. */
export async function plantDisposed(alice, client, { disposedAt = dayIn(mon(-1), 28), memo = "x42 ra disposal" } = {}) {
  const disposal = await plantEntry(alice, client, { memo });
  await rootQuery(
    `insert into clara.fixed_assets
       (firm_id, client_id, description, acquired_date, cost_cents, useful_life_months,
        depreciation_method, asset_account_code, accum_depr_account_code,
        depr_expense_account_code, status, disposed_at, disposal_entry_id)
     select cl.firm_id, cl.id, $2::text, current_date - 400, 100000, 60, 'straight_line',
            $3::text, $4::text, $5::text, 'disposed', $6::date, $7::uuid
       from clara.clients cl where cl.id = $1::uuid`,
    [client, memo, FACOST, FAACCUM, FAEXP, disposedAt, disposal]);
  return disposal;
}

/** An asset whose REGISTER row and GL legs are the same money, with real dates: an approved
 *  Dr FACOST / Cr bank purchase, an `active` register row nailed to it by acquisition_entry_id,
 *  and (optionally) an approved Cr FACOST relief plus the disposal stamp.
 *
 *  The GL half goes through the real maker-checker verbs because the SUBJECT here is which
 *  family the tie attributes each GL leg to — a fixture that skipped the entries would have
 *  nothing to attribute. The register row itself is a raw insert for the x42.ra5/ra6 reason:
 *  driving it through dispose_fixed_asset would make this a test of the disposal machinery
 *  (x41-disposal owns that) and would not let the DATES be chosen, which is the one field an
 *  as-of question turns on. */
export async function plantAssetWithGl(alice, client, {
  cost = 100_000, buyDate, disposeDate = null, code = FACOST, tag = "x42 ra7",
} = {}) {
  const buy = await approvedEntry(alice, {
    client, memo: `${tag} purchase`, postingDate: buyDate,
    lines: [
      { account_code: code, debit_cents: cost, credit_cents: 0, description: "asset in" },
      { account_code: BANKV, debit_cents: 0, credit_cents: cost, description: "paid" },
    ],
  });
  const { rows } = await rootQuery(
    `insert into clara.fixed_assets
       (firm_id, client_id, description, acquired_date, cost_cents, useful_life_months,
        depreciation_method, asset_account_code, accum_depr_account_code,
        depr_expense_account_code, status, acquisition_entry_id)
     select cl.firm_id, cl.id, $2::text, $3::date, $4::bigint, 60, 'straight_line',
            $5::text, $6::text, $7::text, 'active', $8::uuid
       from clara.clients cl where cl.id = $1::uuid returning id`,
    [client, tag, buyDate, cost, code, FAACCUM, FAEXP, buy]);
  const asset = rows[0].id;
  if (!disposeDate) return { buy, asset, disposal: null };
  const disposal = await approvedEntry(alice, {
    client, memo: `${tag} disposal`, postingDate: disposeDate,
    lines: [
      { account_code: BANKV, debit_cents: cost, credit_cents: 0, description: "proceeds" },
      { account_code: code, debit_cents: 0, credit_cents: cost, description: "cost out" },
    ],
  });
  await rootQuery(
    `update clara.fixed_assets set status = 'disposed', disposed_at = $2::date,
            disposal_entry_id = $3::uuid where id = $1::uuid`,
    [asset, disposeDate, disposal]);
  return { buy, asset, disposal };
}

/** clara._fa_gl_leg_foreign(client, code, entry, at) — asked directly, so a cell can tell
 *  "the predicate kept this leg" apart from "the tie happened to balance anyway". */
export const legForeign = async (client, code, entry, at) =>
  (await rootQuery(
    "select clara._fa_gl_leg_foreign($1::uuid, $2::text, $3::uuid, $4::timestamptz) as f",
    [client, code, entry, at])).rows[0].f;
