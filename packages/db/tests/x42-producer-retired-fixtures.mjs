// F-A3 PR-3 (Annex I) SUCCESSOR FIXTURE (review round SHOULD A3; NOT a test file — `node
// --test` ignores it). propose_bank_rule / sign_bank_rule / accept_bank_rule_suggestion all
// retire whole, so x42-producer-stale.test.mjs's and x42-producer-role.test.mjs's arm-(3)
// cells lost the only lawful way to construct their fixture: a SIGNED coding rule plus an
// OUTSTANDING `bank_rule_suggested`-flagged draft. Arm (3) itself is untouched by the drop —
// it still re-validates any pre-existing flagged draft (0129 SS0's own KEEP finding) — so the
// CLAIM survives; only the fixture-construction path needs a successor.
//
// Root-SQL, deliberately (the x37 dog-fooding law's one named exception: "a raw INSERT
// appears ONLY where no audited verb can reach the shape under test"): with the three
// producer verbs gone, no audited verb can mint this shape any more, so this is the file that
// carries the exception. Every write here reproduces EXACTLY what the retired verbs used to
// produce, proved two ways: (a) the derived lines come from clara._wdb_suggestion_lines, the
// SAME kept helper arm (3) itself calls, so "the legs match what the rule derives" is true by
// construction, never assumed; (b) bank_rules' own CHECK/trigger family (content_hash shape,
// the lifecycle CHECK, no-delete/no-truncate) still binds a raw insert exactly as it always
// did — a malformed stage fails LOUD at the constraint, not silently.

import { rootQuery, firmOf, freshBankAccount, enterStatement, nextPeriod } from "./x42-af2-world.mjs";
import { CODEACC } from "./x42-af2-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";

/** Signs a coding rule directly into `clara.bank_rules` — the exact shape
 *  propose_bank_rule + sign_bank_rule used to leave behind. */
async function stageSignedCodingRule({ client, owner, proposer, pattern, proposal }) {
  const firm = await firmOf(client);
  const contentHash = (await rootQuery(
    "select encode(sha256(convert_to($1::text, 'UTF8')), 'hex') as h",
    [JSON.stringify({ kind: "coding", pattern, proposal })],
  )).rows[0].h;
  const r = await rootQuery(
    `insert into clara.bank_rules(firm_id, client_id, kind, status, pattern, proposal, evidence,
        content_hash, created_by, signed_by, signed_at)
       values ($1,$2,'coding','signed',$3,$4,'{}'::jsonb,$5,$6,$7,now())
       returning id`,
    [firm, client, JSON.stringify(pattern), JSON.stringify(proposal), contentHash, proposer, owner],
  );
  return r.rows[0].id;
}

/** Stages an OUTSTANDING `bank_rule_suggested`-flagged DRAFT directly into
 *  `clara.journal_entries`/`journal_lines`, reproducing accept_bank_rule_suggestion's own
 *  output shape byte-for-byte on the legs (via the SAME `_wdb_suggestion_lines` derivation
 *  arm (3) re-checks against) — the "legs" axis (x42.stale-22f) starts PASSING, exactly as a
 *  real accept would have left it, so a cell that deliberately breaks a DIFFERENT axis is
 *  testing that axis alone. */
async function stageSuggestedDraft({ client, proposer, line, rule }) {
  const firm = await firmOf(client);
  const legs = (await rootQuery(
    "select clara._wdb_suggestion_lines($1,$2,$3) as legs", [client, line, rule],
  )).rows[0].legs;
  const lineRow = (await rootQuery(
    "select entry_date from clara.bank_statement_lines where id = $1", [line],
  )).rows[0];
  // ONE transaction (db-tests.md's withTxn rule): t_jl_balance is DEFERRABLE INITIALLY
  // DEFERRED, but a pooled query() outside an explicit begin is its OWN autocommitting
  // transaction, so the entry insert alone would commit -- and get checked -- before any line
  // exists (the exact "unbalanced debit=0 credit=0" trap this rule warns about).
  return withTxn(async (c) => {
    const entry = (await c.query(
      `insert into clara.journal_entries(firm_id, client_id, status, posting_date, memo, origin,
          maker_actor, last_human_editor, flags)
         values ($1,$2,'draft',$3,'x42 staged suggestion','manual',$4,$4,
           jsonb_build_object('bank_rule_suggested', jsonb_build_object('rule_id',$5::uuid,'line_id',$6::uuid)))
         returning id, revision_token`,
      [firm, client, lineRow.entry_date, proposer, rule, line],
    )).rows[0];
    for (const [i, leg] of legs.entries()) {
      await c.query(
        `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents)
           values ($1,$2,$3,$4,$5)`,
        [entry.id, i + 1, leg.account_code, leg.debit_cents, leg.credit_cents],
      );
    }
    // Each line write ROTATES the entry's revision_token (0003's t_jl_rotate_token,
    // x42.stale-22f's own header note) -- the token from the entry INSERT above is stale by
    // the time the lines land; re-read the CURRENT one so a fresh approve isn't refused CLR06
    // for a reason that has nothing to do with the axis under test.
    const fresh = (await c.query(
      "select revision_token from clara.journal_entries where id = $1", [entry.id],
    )).rows[0];
    return { entry: entry.id, token: fresh.revision_token };
  });
}

/** retire_bank_rule also retires with the machine (it is one of the eleven drop targets) --
 *  x42.stale-22a stages its OWN OUT-OF-BAND event (the rule retiring while the suggestion
 *  sits in queue) the same way: a direct, lifecycle-CHECK-honouring update, never the door. */
export async function stageRuleRetirement({ rule, actor, reason = "x42 stale: retired directly (successor fixture)" }) {
  await rootQuery(
    "update clara.bank_rules set status='retired', retired_by=$2, retired_at=now(), retired_reason=$3 where id=$1",
    [rule, actor, reason],
  );
}

/** The one-call successor to `signedCodingRule({...})` + `acceptBankRuleSuggestion({...})`
 *  chained -- SAME return shape as the old `acceptedSuggestion()` fixture both files built on
 *  top of ({ client, w: {...signedCodingRule's own return...}, line, entry, token }), so every
 *  existing cell body below the fixture call is unchanged. */
export async function stageSuggestionDraft({
  client, owner, proposer, lineCount = 4, amountCents = -42_000,
  tokens = ["tnb", "electricity"], narration = "TNB ELECTRICITY BILL",
  accountCode = CODEACC, counterparty = null, lineIndex = 0,
}) {
  const bankAccount = await freshBankAccount(owner, client);
  const p = nextPeriod();
  const stmt = await enterStatement(owner, {
    client, bankAccount, periodStart: p.start, periodEnd: p.end, opening: 0, keepPeriod: true,
    specs: Array.from({ length: lineCount }, (_, i) => ({
      amountCents, entryDate: p.mid, description: `${narration} ${i + 1}`,
    })),
  });
  const pattern = { tokens, direction: amountCents < 0 ? "debit" : "credit" };
  const proposal = { account_code: accountCode, narration_template: narration };
  if (counterparty) proposal.counterparty_id = counterparty;
  const rule = await stageSignedCodingRule({ client, owner, proposer, pattern, proposal });
  const line = stmt.lines[lineIndex];
  const { entry, token } = await stageSuggestedDraft({ client, proposer, line: line.id, rule });
  const w = {
    rule, pattern, proposal, bankAccount, period: p, statement: stmt.statementId,
    lines: stmt.lines, amountCents,
  };
  return { client, w, line, entry, token };
}
