// #906 — `clara._assert_journal_basis`'s `nonzero_total` arm (0178:785-787, "the basis moves no
// money") carried no statement of its own reachability. Found independently from both the accrual
// (#652) and prepayment (#653) sides while each wired refusal logic through this shared predicate:
// the gap map records `nonzero_total` as untested because it is UNREACHABLE — `at_least_two`
// (0178:743-745) refuses fewer than two lines, and the per-line `exactly_one_side` arm
// (0178:769-772) refuses a line whose two sides are both zero (or both positive), so a debit
// total of zero always makes the credit total strictly positive, and `balanced` (0178:780-783)
// refuses that mismatch before `nonzero_total`'s own check ever runs. Migration 0237 closes the
// discoverability gap with ONE `comment on function`, re-derived from the live body and refusing
// to apply unless the body still carries all three tokens (its own prestate/tail carry that
// guard; see packages/db/README.md's "0237" section).
//
// SEAM: `clara._assert_journal_basis(jsonb)` itself — the one public surface the ticket's Agent
// Brief names ("gains the comment; body not replaced") — called DIRECTLY (rootQuery runs as the
// session superuser, which bypasses the function's `revoke all ... from public`), and the catalog
// comment (`obj_description`). No business door, no wire shape, no new relation.
//
// NON-REGRESSION (AC2): 0237 must change nothing else about the predicate — same prosrc, same
// owner, same SECURITY DEFINER flag, the same owner-only ACL.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, ensureReady, endPool } from "./rig-fixtures.mjs";

const FN = "clara._assert_journal_basis(jsonb)";
const MIGRATION = "0237_journal_basis_zero_total_unreachable.sql";
const STEM = "journal_basis_zero_total_unreachable$";

/** The predicate's own prosrc sha256, MEASURED on this rig at 236 migrations (0001->0236) before
 *  0237 existed — never transcribed from 0178, because 0178 is where the body was AUTHORED, not
 *  necessarily where a reader would look to confirm it is unmoved. 0237's own prestate carries
 *  the same pin and refuses to apply against a drifted body; this cell re-asserts it from the
 *  other side, after. */
const FN_SHA = "2ba8e307098f4d5c6214ad48770b84eb574f0edf55cab11f5e122b5adbcc3684";
const FN_ACL = "{clara_fn_owner=X/clara_fn_owner}";

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (r.rows[0].n === 0) {
    if (process.env.CLARA_ALLOW_MISSING_JOURNAL_BASIS_ZERO_TOTAL_ARM !== "1") {
      throw new Error(
        `#906 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) ` +
        "and CLARA_ALLOW_MISSING_JOURNAL_BASIS_ZERO_TOTAL_ARM is unset -- this is a FOCUSED run " +
        "and must fail loudly, not skip. Preload " +
        "./tests/journal-basis-zero-total-unreachable-preintegration-gate.mjs for an estate " +
        "sweep against a pre-#906 chain.");
    }
    ready = false;
  }
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() failed, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

async function caught(fn) {
  try { await fn(); return null; } catch (error) { return error; }
}
function errorDetail(error) {
  if (!error?.detail) return {};
  try { return JSON.parse(error.detail); } catch { return { raw: error.detail }; }
}

/** A syntactically valid, JSON-object basis with exactly two lines, each carrying BOTH sides as
 *  zero cents -- the literal "all-zero balanced basis" AC3 names. `debit_cents`/`credit_cents`
 *  default to zero when omitted (`clara._journal_cents`, 0178:672), so this is the same shape as
 *  writing neither key; both spelled out here for the case's own clarity. */
const ALL_ZERO_BASIS = {
  posting_date: "2026-01-15",
  memo: "#906 seam probe -- an all-zero balanced basis",
  currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 0, credit_cents: 0, description: "nothing" },
    { account_code: "1150", debit_cents: 0, credit_cents: 0, description: "nothing" },
  ],
};

/** A basis whose lines are each non-degenerate (one strictly positive side apiece) but whose
 *  DEBIT total still sums to zero because every line is credit-only -- the second (non-vacuous)
 *  way `v_dr = 0` could be reached, refuted by `balanced` rather than `exactly_one_side`. */
const ALL_CREDIT_BASIS = {
  posting_date: "2026-01-15",
  memo: "#906 seam probe -- every line credits, none debits",
  currency: "MYR",
  lines: [
    { account_code: "6100", debit_cents: 0, credit_cents: 500, description: "credit only" },
    { account_code: "1150", debit_cents: 0, credit_cents: 700, description: "credit only" },
  ],
};

test("jz.1 the predicate carries a comment naming nonzero_total as unreachable and naming both guarding arms", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(`select obj_description(to_regprocedure($1), 'pg_proc') as d`, [FN]);
  const d = r.rows[0].d ?? "";
  assert.ok(d.length > 0, "clara._assert_journal_basis carries no comment");
  assert.match(d, /nonzero_total/, "comment does not name the nonzero_total arm");
  assert.match(d, /unreachable/i, "comment does not say the arm is unreachable");
  assert.match(d, /at_least_two/, "comment does not name the minimum-line arm (at_least_two)");
  assert.match(d, /exactly_one_side/, "comment does not name the per-line arm (exactly_one_side)");
});

test("jz.2 AC2 non-regression: the predicate's body, owner, definer flag and ACL are byte-for-byte unmoved", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha,
            r.rolname as owner, p.prosecdef as secdef, coalesce(p.proacl::text,'(null)') as acl
       from pg_proc p join pg_roles r on r.oid = p.proowner
      where p.oid = to_regprocedure($1)`,
    [FN],
  );
  assert.equal(r.rowCount, 1, "clara._assert_journal_basis does not resolve");
  const row = r.rows[0];
  assert.equal(row.sha, FN_SHA, "0237 must not touch the predicate's body");
  assert.equal(row.owner, "clara_fn_owner", "0237 must not change the predicate's owner");
  assert.equal(row.secdef, true, "0237 must not change the predicate's SECURITY DEFINER flag");
  assert.equal(row.acl, FN_ACL, "0237 must not grant EXECUTE to any application role");
});

test("jz.3 AC3: an all-zero balanced basis is refused naming the per-line constraint, never the zero-total one", async (t) => {
  if (unready(t)) return;
  const error = await caught(() =>
    rootQuery("select clara._assert_journal_basis($1::jsonb)", [JSON.stringify(ALL_ZERO_BASIS)]));
  assert.ok(error, "an all-zero balanced basis must be refused, not accepted");
  assert.equal(error.code, "CLR10");
  const detail = errorDetail(error);
  assert.equal(detail.reason, "invalid_basis");
  assert.equal(detail.constraint, "exactly_one_side",
    "MEASURED: the live predicate refuses an all-zero basis per LINE, on the first line that "
    + "carries both sides as zero -- nonzero_total (0178:785-787) sits behind this arm and is "
    + "therefore unreachable for this shape, exactly as 0237's comment now states");
  assert.equal(detail.field, "lines[1]");
  assert.notEqual(detail.constraint, "nonzero_total",
    "the zero-total arm must never be the one that answers");
});

test("jz.4 the non-vacuous zero-debit-total shape (every line credits, none debits) is refused as unbalanced, never as zero-total", async (t) => {
  if (unready(t)) return;
  const error = await caught(() =>
    rootQuery("select clara._assert_journal_basis($1::jsonb)", [JSON.stringify(ALL_CREDIT_BASIS)]));
  assert.ok(error, "a basis whose debit total is zero but whose lines are each one-sided must still be refused");
  assert.equal(error.code, "CLR10");
  const detail = errorDetail(error);
  assert.equal(detail.reason, "invalid_basis");
  assert.equal(detail.constraint, "balanced",
    "MEASURED: a debit total of zero forces every line's credit to be strictly positive "
    + "(exactly_one_side, 0178:769-772), so the totals mismatch and `balanced` (0178:780-783) "
    + "answers before `nonzero_total`'s own check is ever reached");
  assert.equal(detail.debit_cents, 0);
  assert.equal(detail.credit_cents, 1200);
  assert.notEqual(detail.constraint, "nonzero_total",
    "the zero-total arm must never be the one that answers, even for a genuinely zero debit total");
});
