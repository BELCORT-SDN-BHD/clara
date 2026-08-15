// x85 -- B3 (ADR-068 ruling 1): reopen_fiscal_year's reversal mirror is an ends_on-dated
// formal prior-period adjustment. PART 1 -- the shape of the reversal, the act's own facts,
// the ledger's correctness at source, and the correction-target refusal arms.
// Part 2 (x85-b3-permit-and-regression.test.mjs) carries the permit binding/consumption
// cells and the clara.reverse_entry regression floor.
//
// CONTRACT-BLIND on the migration: every claim is probed off the LIVE catalog or off a
// behavioural run, never by reading 0085/0086's .sql.
//
// GATED ON 0056 ONLY, DELIBERATELY -- NOT on B3. This battery IS the B3 contract, so it
// must be capable of failing on a frontier that has not adopted it; a battery that skips
// itself on the very frontier it pins proves nothing. The red-proof transcript in the PR
// record is exactly that: these cells RED against the pre-B3 body.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip, waveAEnsureReady,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, beginClose, finalizeClose, reopenFY, reopenerFor,
  bookToday, plainEntry, addDaysStr, BANK1, REVN,
} from "./x56-fixtures.mjs";

let ready = false;
let has56 = false;
let world = null;

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x85 suite skipped"); return; }
  has56 = await has0056();
  if (!has56) noteLane("0056 not applied -- the close model (and therefore B3) is absent");
  if (ready && has56) world = await wb.buildWaveBWorld();
});
after(async () => { printLaneNotes("x85-part1"); printSkipCount("x85-part1"); await endPool(); });

function skipHere(t) {
  if (!ready || !has56) { markSkip(); t.skip("0056 (close model) not present"); return true; }
  return false;
}

/** close a clean FY and reopen it; return everything both halves produced. The CLOSER and the
 *  REOPENER are deliberately different humans: post-B3 a year-end close may not be reversed by
 *  the human who signed it while the firm holds >=2 eligible checkers, which is B3.9's subject
 *  and every other cell's precondition. reopenerFor() grants the capability and is a no-op on a
 *  pre-B3 frontier, so these cells stay runnable on both. */
async function closeThenReopen(tag, { reason = "x85: reopening to correct the year", revCents = 500000, expCents = 200000 } = {}) {
  const owner = world.users.alice;
  const preparer = world.users.hana;
  const fx = await cleanCloseableFY(owner, { tag, prepSub: preparer, startsOn: "2027-01-01", revCents, expCents });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  const target = fx.revenueEntry ?? closed.close_entry_id;
  const reopener = await reopenerFor(owner, { closer: owner, alternate: world.users.hana });
  const before_ = new Date();
  const reopened = await reopenFY(reopener, {
    fy: fx.fy, reason, correctionTarget: target ? { entry_ids: [target] } : { check_key: "ar_control_tie" },
  });
  return { owner, preparer, reopener, fx, closed, reopened, calledAt: before_ };
}

// ===========================================================================
// B3.1 -- THE REVERSAL LANDS DATED ends_on, INSIDE the reopened year, and
// reverses the closing entry EXACTLY: per line, at the finest grain the
// original carries. An aggregate that ties proves nothing -- two lines could
// net to the same total with both accounts wrong -- so the comparison is
// row-by-row on (line_no, account_code, debit, credit).
// ===========================================================================

test("B3.1 the reopen reversal is DATED the reopened year's ends_on, inside that year's own period, and mirrors the closing entry line for line", async (t) => {
  if (skipHere(t)) return;
  const { fx, closed, reopened } = await closeThenReopen("b31");
  assert.ok(closed.close_entry_id, "mandatory setup: the close minted a closing entry (non-zero P&L)");

  const mirror = (await rootQuery(
    `select id, status, posting_date::text as posting_date, origin, is_year_end, reversal_of,
            memo, maker_actor, checker_actor
       from clara.journal_entries where reversal_of = $1`,
    [closed.close_entry_id],
  )).rows;
  assert.equal(mirror.length, 1, "exactly one reversal of the closing entry");
  const m = mirror[0];
  assert.equal(m.posting_date, fx.endsOn, "the reversal is DATED the reopened year's ends_on");
  assert.equal(m.status, "approved", "and it is APPROVED -- an unwind left as a draft unwinds nothing");
  assert.equal(m.reversal_of, closed.close_entry_id, "it names the closing entry as what it reverses");
  assert.equal(m.origin, "reversal");
  assert.equal(m.is_year_end, true, "it inherits is_year_end: period machinery, not a business transaction");
  assert.equal(reopened.reversal_entry_id, m.id, "the verb's own receipt names the entry it minted");
  assert.equal(reopened.reversal_posting_date, fx.endsOn, "and names the date it placed it at");

  // INSIDE the period, read from the fiscal_years row rather than from the fixture's memory
  // of it -- the claim is "in the reopened year", and the year is the thing that says so.
  const inYear = (await rootQuery(
    `select count(*)::int as n from clara.fiscal_years fy
       where fy.id = $1 and $2::date between fy.starts_on and fy.ends_on`,
    [fx.fy, m.posting_date],
  )).rows[0].n;
  assert.equal(inYear, 1, "the reversal's posting_date falls inside the reopened fiscal year's own span");

  // PER-LINE, FINEST GRAIN. A full-join on line_no so a missing or extra line is a failure
  // rather than a silently shorter loop.
  const pairs = (await rootQuery(
    `select coalesce(o.line_no, r.line_no) as line_no,
            o.account_code as o_acct, r.account_code as r_acct,
            o.debit_cents::text as o_dr, o.credit_cents::text as o_cr,
            r.debit_cents::text as r_dr, r.credit_cents::text as r_cr
       from (select * from clara.journal_lines where entry_id = $1) o
       full outer join (select * from clara.journal_lines where entry_id = $2) r
         on r.line_no = o.line_no
      order by 1`,
    [closed.close_entry_id, m.id],
  )).rows;
  assert.ok(pairs.length >= 3, `the closing entry carries its P&L lines plus the retained-earnings leg (got ${pairs.length})`);
  for (const p of pairs) {
    assert.equal(p.r_acct, p.o_acct, `line ${p.line_no}: same account on both sides`);
    assert.equal(p.r_dr, p.o_cr, `line ${p.line_no}: the mirror debits what the original credited`);
    assert.equal(p.r_cr, p.o_dr, `line ${p.line_no}: the mirror credits what the original debited`);
  }
});

// ===========================================================================
// B3.2 -- THE ACT'S OWN FACTS ARE THE ACT'S. Only posting_date moves; the
// timestamp, the actor and the receipt trail all say when this really happened
// and who did it. This is the difference between a prior-period adjustment and
// a forgery, so it is measured rather than assumed.
// ===========================================================================

test("B3.2 created_at / approved_at / actor / receipt / audit / events all carry the REAL act, never ends_on", async (t) => {
  if (skipHere(t)) return;
  const { owner, reopener, fx, closed, reopened, calledAt } = await closeThenReopen("b32");
  const after_ = new Date();
  const m = (await rootQuery(
    `select id, created_at, approved_at, updated_at, maker_actor, checker_actor, last_human_editor
       from clara.journal_entries where reversal_of = $1`, [closed.close_entry_id])).rows[0];
  assert.ok(m, "mandatory setup: the reversal exists");
  const within = (ts) => new Date(ts) >= calledAt && new Date(ts) <= after_;
  assert.ok(within(m.created_at), `created_at is the moment of the act (${m.created_at}), not the year end`);
  assert.ok(within(m.approved_at), `approved_at is the moment of the act (${m.approved_at})`);
  // And it is emphatically NOT the accounting date: ends_on is a future year here.
  assert.notEqual(String(m.created_at).slice(0, 10), fx.endsOn, "created_at is not ends_on");
  assert.equal(m.maker_actor, reopener, "the reopening human made it");
  assert.equal(m.checker_actor, reopener, "and stands as its checker on the row");
  assert.equal(m.last_human_editor, reopener);
  // AND THE REOPENER IS NOT THE CLOSER -- which is what makes the act two-human. The row's
  // maker and checker are necessarily the same human (one call authors and approves it), so
  // the segregation lives one level up: in WHO is allowed to make that call at all.
  assert.notEqual(reopener, owner, "the human who signed the close is not the human who reversed it");
  const rcptSeg = (await rootQuery(
    "select segregation_mode, last_preparer_actor, self_attestation from clara.close_receipts where id=$1",
    [reopened.reopen_receipt_id])).rows[0];
  assert.equal(rcptSeg.segregation_mode, "two_person", "and the receipt records the determination it took");
  assert.equal(rcptSeg.last_preparer_actor, owner, "naming the closer as the human who was checked");
  assert.equal(rcptSeg.self_attestation, null, "with no attestation, because none was required");

  // THE RECEIPT: minted now, and it NAMES the reversal, its date and its basis, so the
  // record is recoverable from the receipt alone years later (E-R2's own bar).
  const rcpt = (await rootQuery(
    "select kind, status, closed_at, closed_by, snapshot from clara.close_receipts where id=$1",
    [reopened.reopen_receipt_id])).rows[0];
  assert.equal(rcpt.kind, "reopen");
  assert.ok(within(rcpt.closed_at), "the reopen receipt is stamped at the act, not at the year end");
  assert.equal(rcpt.closed_by, reopener, "and attributed to the reopening human");
  assert.equal(rcpt.snapshot.reversal_entry_id, m.id, "the receipt names the reversal entry");
  assert.equal(rcpt.snapshot.reversal_posting_date, fx.endsOn, "and the date it was placed at");
  assert.equal(rcpt.snapshot.reversal_basis, "prior_period_adjustment_at_fiscal_year_end",
    "and says in its own words what kind of act this was");

  // THE AUDIT TRAIL: two rows -- the reopen, and the reversal naming its OWN entry.
  const audits = (await rootQuery(
    `select fn, actor, entry_id, at, args from clara.audit_log
      where args->>'fiscal_year_id' = $1 and fn in ('reopen_fiscal_year','reopen_reversal')
      order by fn`, [fx.fy])).rows;
  assert.deepEqual(audits.map((a) => a.fn), ["reopen_fiscal_year", "reopen_reversal"],
    "both receipts are written: the reopen, and the reversal act itself");
  for (const a of audits) {
    assert.equal(a.actor, reopener, `${a.fn} is attributed to the reopening human`);
    assert.ok(within(a.at), `${a.fn} is stamped at the act`);
  }
  assert.equal(audits[1].entry_id, m.id, "the reversal receipt points at the reversal entry");
  assert.equal(audits[0].args.reversal_entry_id, m.id, "the reopen receipt names it too");

  // THE EVENT SPINE sees the same three facts reverse_entry would have emitted.
  const evts = (await rootQuery(
    `select event_type, entry_id from clara.domain_events
      where entry_id in ($1,$2) and event_type in ('entry.drafted','entry.approved','entry.reversed')
      order by event_type`, [m.id, closed.close_entry_id])).rows;
  assert.deepEqual(
    evts.map((e) => `${e.event_type}:${e.entry_id === m.id ? "mirror" : "original"}`).sort(),
    ["entry.approved:mirror", "entry.drafted:mirror", "entry.reversed:original"],
    "drafted + approved on the mirror, reversed on the original -- the same three facts the generic verb emits",
  );
});

// ===========================================================================
// B3.3 -- THE LEDGER IS CORRECT AT SOURCE. This is the ADR's stated ground for
// the ruling, and its stated consequence: nothing downstream owes an
// interim-exclusion rule, because there is nothing to exclude. Two halves:
// (a) the reopened year's own trial balance is back where it was pre-close and
// the retained-earnings roll nets to nothing; (b) NOTHING the reopen wrote
// lands after ends_on, so a successor year's interim P&L is untouched.
// ===========================================================================

test("B3.3 after the reopen the year's own TB is restored and NOTHING the reopen wrote lands after ends_on -- no successor-year interim pollution, so no exclusion rule is owed", async (t) => {
  if (skipHere(t)) return;
  const { fx } = await closeThenReopen("b33");
  const re = (await rootQuery(
    "select account_code from clara.coa_accounts where client_id=$1 and special_acc_type='retained_earnings' and is_active",
    [fx.client])).rows[0].account_code;

  const tb = (await rootQuery(
    "select account_code, (debit_cents - credit_cents)::text as net from clara.trial_balance_as_of($1,$2::date)",
    [fx.client, fx.endsOn])).rows;
  const net = Object.fromEntries(tb.map((r) => [r.account_code, Number(r.net)]));
  assert.equal(net[re] ?? 0, 0, "the retained-earnings roll is fully unwound at the year end -- the close and its reversal cancel to the cent");
  assert.equal(net[REVN] ?? 0, -500000, "revenue is back to the year's own movement (credit balance)");
  assert.equal(net[BANK1] ?? 0, 300000, "the balance-sheet side never moved");

  // (b) NOTHING landed after ends_on. Measured over EVERY entry of this client, not just the
  // reversal -- an exclusion rule would be owed for anything the reopen put in the successor
  // year, whatever its origin.
  const after = (await rootQuery(
    `select count(*)::int as n from clara.journal_entries
      where client_id=$1 and posting_date > $2::date`, [fx.client, fx.endsOn])).rows[0].n;
  assert.equal(after, 0, "the reopen wrote nothing dated after the reopened year -- the successor year's interim P&L is untouched, which is why no consumer owes an exclusion rule");
  const today = await bookToday();
  assert.notEqual(today, fx.endsOn, "mandatory setup: the fixture year ends on a date that is not today, or this cell could not tell the two apart");
});

test("B3.3b the round trip: a re-close after the reopen re-derives the year's P&L and mints a FRESH closing entry (pre-B3 the standing close had already zeroed it, so the re-close minted nothing)", async (t) => {
  if (skipHere(t)) return;
  const { owner, preparer, fx, closed } = await closeThenReopen("b33b");
  // One more in-FY touch by a non-owner so the close's segregation check (closer != the
  // year's last human preparer) is satisfiable with owner as the closer.
  await plainEntry(preparer, { client: fx.client, debit: BANK1, credit: REVN, cents: 100, postingDate: addDaysStr(fx.startsOn, 200), memo: "x85 post-reopen in-FY touch" });
  await beginClose(owner, { fy: fx.fy });
  const closed2 = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed2.close_entry_id, "the re-close mints a closing entry of its own");
  assert.notEqual(closed2.close_entry_id, closed.close_entry_id, "a genuinely new entry, not the old one re-used");
  assert.equal(Number(closed2.pl_net_cents), 300100, "and it re-derives the year's P&L from the restored ledger (300000 + the 100-cent touch)");
});

// ===========================================================================
// B3.4 -- THE CORRECTION-TARGET REFUSAL ARMS, including the two the B3 body
// adds. Three-valued logic is only safe when the null case is SAID: a shape
// this reader cannot walk used to raise 22023 out of jsonb_array_elements_text
// (an unnamed error, not a refusal a caller can act on), and a null ELEMENT
// reported a row as missing when the caller in fact named nothing.
// ===========================================================================

test("B3.4 the reopen's correction target fails CLOSED on every malformed shape, and the null arms say so BY NAME", async (t) => {
  if (skipHere(t)) return;
  const { owner, fx } = await (async () => {
    const o = world.users.alice;
    const f = await cleanCloseableFY(o, { tag: "b34", prepSub: world.users.hana, startsOn: "2027-01-01" });
    await beginClose(o, { fy: f.fy });
    await finalizeClose(o, { fy: f.fy });
    return { owner: o, fx: f };
  })();
  const attempt = (target) => caught(() => reopenFY(owner, {
    fy: fx.fy, reason: "x85 b34: a malformed correction target must refuse", correctionTarget: target,
  }));

  for (const [label, target] of [
    ["a null target", null],
    ["a scalar target", 7],
    ["an empty object", {}],
    ["an empty entry_ids array", { entry_ids: [] }],
    ["entry_ids as json null", { entry_ids: null }],
    ["entry_ids as a scalar", { entry_ids: "not-an-array" }],
    ["a null entry id element", { entry_ids: [null] }],
    ["an unknown gate", { check_key: "no_such_gate" }],
  ]) {
    const err = await attempt(target);
    assert.ok(err, `${label} must refuse`);
    assert.equal(err.code, "CLR10", `${label}: a named refusal, never an unhandled error (got ${err.code} -- ${err.message})`);
    assert.equal(JSON.parse(err.detail ?? "{}").reason, "reopen_target_missing", `${label}: with the target token`);
  }
  // The two NEW arms name what is wrong instead of blaming a row that was never named.
  const nullElem = await attempt({ entry_ids: [null] });
  assert.match(nullElem.message, /correction target entry id is null/i,
    "a null element is refused AS a null element -- not reported as a row that is 'not in this client'");
  const badShape = await attempt({ entry_ids: null });
  assert.match(badShape.message, /entry_ids must be an array/i,
    "a non-array entry_ids is refused by shape, not by an unhandled 22023 out of jsonb_array_elements_text");

  // And the year is untouched by every one of those refusals.
  const fy = (await rootQuery("select status from clara.fiscal_years where id=$1", [fx.fy])).rows[0];
  assert.equal(fy.status, "closed", "no malformed attempt moved the year off 'closed'");
});

// ===========================================================================
// B3.5 -- THE EMPTY-YEAR ARM. A year whose P&L never moved mints no closing
// entry, so there is nothing to reverse: the reopen must still succeed, mint
// NO reversal and NO permit, and say so in its receipt rather than leaving the
// caller to infer it from a missing key.
// ===========================================================================

test("B3.5 a fiscal year with no closing entry reopens cleanly: no reversal, no permit, and the RECEIPT ITSELF says so rather than asserting an adjustment that never happened", async (t) => {
  if (skipHere(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "b35", prepSub: world.users.hana, startsOn: "2027-01-01", revCents: 0, expCents: 0 });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.equal(closed.close_entry_id, null, "mandatory setup: a zero-movement year mints no closing entry");
  const reopener = await reopenerFor(owner, { closer: owner, alternate: world.users.hana });
  const reopened = await reopenFY(reopener, {
    fy: fx.fy, reason: "x85 b35: reopening a year that never had a closing entry",
    correctionTarget: { check_key: "ar_control_tie" },
  });
  assert.ok(reopened.reopen_receipt_id, "the reopen succeeds");
  assert.equal(reopened.reversal_entry_id, null, "the payload says NO reversal was minted -- an explicit null, not an absent key the caller has to interpret");
  const permits = (await rootQuery(
    "select count(*)::int as n from clara.close_write_permits where fiscal_year_id=$1 and purpose='reopen_reversal'",
    [fx.fy])).rows[0].n;
  assert.equal(permits, 0, "and no permit was minted -- a backdating permit with nothing to write is a door left open for no reason");

  // THE RECEIPT IS READ, not assumed. This cell's title advertises a receipt check, so it
  // performs one: close_receipts is the only source a reviewer reconstructing this year has
  // years later, and a permanent row claiming a prior-period adjustment on an act that never
  // occurred is a lie in the durable record, not a cosmetic default.
  const snap = (await rootQuery(
    "select snapshot from clara.close_receipts where id=$1", [reopened.reopen_receipt_id])).rows[0].snapshot;
  assert.equal(snap.reversal_basis, "no_closing_entry_to_reverse",
    "the receipt names the empty arm in its own words");
  assert.equal(snap.reversal_entry_id, null, "and asserts no reversal entry");
  assert.equal(snap.reversal_posting_date, null, "and no posting date for an adjustment that was never made");
  const fy = (await rootQuery("select status from clara.fiscal_years where id=$1", [fx.fy])).rows[0];
  assert.equal(fy.status, "reopened");
});

// ===========================================================================
// B3.9 -- SEGREGATION ON THE REVERSAL. The mirror is high-stakes (it inherits
// is_year_end) and this verb approves it in-body, so the CLR05 wall that binds
// every other high-stakes approval binds here. Measured against the human who
// SIGNED the close: a different eligible human reopening is two accountable
// humans; the signer reopening their own close is self-approval. BOTH arms are
// red-proofed -- pre-B3 the same call approved with maker=checker and nothing
// recorded, so both of these cells fail against that body.
// ===========================================================================

test("B3.9 the human who SIGNED the close cannot reverse it while the firm has >=2 eligible checkers -- CLR05 distinct_checker, and nothing is written", async (t) => {
  if (skipHere(t)) return;
  const owner = world.users.alice;
  const fx = await cleanCloseableFY(owner, { tag: "b39", prepSub: world.users.hana, startsOn: "2027-01-01" });
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  const eligible = (await rootQuery(
    "select clara.eligible_checker_count((select firm_id from clara.clients where id=$1)) as n",
    [fx.client])).rows[0].n;
  assert.ok(Number(eligible) >= 2, `mandatory setup: the fixture firm holds >=2 eligible checkers (got ${eligible})`);

  const err = await caught(() => reopenFY(owner, {
    fy: fx.fy, reason: "x85 b39: the closer attempts to reverse their own close",
    correctionTarget: { entry_ids: [closed.close_entry_id] },
  }));
  assert.ok(err, "the closer may not reopen-and-reverse their own close");
  assert.equal(err.code, "CLR05", `expected CLR05 (got ${err.code} -- ${err.message})`);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "distinct_checker",
    "and in _approve_entry_core's own vocabulary -- no new refusal word is minted for this act");
  assert.match(err.message, /different eligible human/i, "the refusal names the remedy, so it is actionable rather than a dead end");
  // AND AN ATTESTATION DOES NOT BUY PAST IT: at >=2 eligible checkers there is no attestation
  // door anywhere in the estate, and there is none here.
  const err2 = await caught(() => reopenFY(owner, {
    fy: fx.fy, reason: "x85 b39: the closer attempts it again, this time with an attestation",
    correctionTarget: { entry_ids: [closed.close_entry_id] },
    attestation: "I am the only one available and I accept responsibility",
  }));
  assert.ok(err2, "an attestation is not a door at >=2 eligible checkers");
  assert.equal(JSON.parse(err2.detail ?? "{}").reason, "distinct_checker");

  // NOTHING WAS WRITTEN by either refusal -- a refusal that half-performed the act would be
  // worse than one that never fired.
  const fy = (await rootQuery("select status from clara.fiscal_years where id=$1", [fx.fy])).rows[0];
  assert.equal(fy.status, "closed", "the year never left 'closed'");
  const mirrors = (await rootQuery(
    "select count(*)::int as n from clara.journal_entries where reversal_of=$1", [closed.close_entry_id])).rows[0].n;
  assert.equal(mirrors, 0, "no reversal entry was minted");
  const permits = (await rootQuery(
    "select count(*)::int as n from clara.close_write_permits where fiscal_year_id=$1 and purpose='reopen_reversal'",
    [fx.fy])).rows[0].n;
  assert.equal(permits, 0, "and no backdating permit was left behind");
});

test("B3.9b the SOLE eligible human may reverse their own close, but only through a recorded attestation -- which lands on the entry row AND on the receipt", async (t) => {
  if (skipHere(t)) return;
  // A FIRM OF ONE, built in its own world so no other cell's fixtures are touched: every
  // membership but the owner's is deactivated, so eligible_checker_count = 1 and the
  // distinct-checker rule cannot be satisfied by anybody at all. This is BELCORT's own shape,
  // which is why the sole-eligible door has to exist and has to cost an attestation.
  const solo = await wb.buildWaveBWorld();
  const owner = solo.users.alice;
  await rootQuery(
    "update clara.firm_memberships set status='removed' where firm_id=$1 and user_id <> $2",
    [solo.firms.A, owner]);
  const fx = await cleanCloseableFY(owner, { tag: "b39b", startsOn: "2027-01-01" });
  const eligible = (await rootQuery(
    "select clara.eligible_checker_count((select firm_id from clara.clients where id=$1)) as n",
    [fx.client])).rows[0].n;
  assert.equal(Number(eligible), 1, `mandatory setup: a firm of exactly one eligible checker (got ${eligible})`);
  await beginClose(owner, { fy: fx.fy });
  const closed = await finalizeClose(owner, { fy: fx.fy, selfAttestation: "x85 b39b: solo close" });

  // Without the attestation: REFUSED, in the estate's own sole-eligible vocabulary.
  const err = await caught(() => reopenFY(owner, {
    fy: fx.fy, reason: "x85 b39b: the sole human reverses their own close, unattested",
    correctionTarget: { entry_ids: [closed.close_entry_id] },
  }));
  assert.ok(err, "even the sole eligible human does not get a frictionless self-reversal");
  assert.equal(err.code, "CLR05", `expected CLR05 (got ${err.code} -- ${err.message})`);
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "self_attestation");

  // With it: admitted, and the attestation is RECORDED in both durable places.
  const att = "x85 b39b: I am the sole eligible checker of this firm and I take responsibility for reversing my own close";
  const reopened = await reopenFY(owner, {
    fy: fx.fy, reason: "x85 b39b: the sole human reverses their own close, attested",
    correctionTarget: { entry_ids: [closed.close_entry_id] }, attestation: att,
  });
  assert.ok(reopened.reopen_receipt_id, "the attested sole path is admitted");
  assert.equal(reopened.segregation_mode, "solo_self_attested", "and the payload names the mode it took");
  const row = (await rootQuery(
    "select status, self_approval_attestation, checker_actor from clara.journal_entries where id=$1",
    [reopened.reversal_entry_id])).rows[0];
  assert.equal(row.status, "approved", "the reversal is approved");
  assert.equal(row.self_approval_attestation, att, "the attestation rides the ENTRY row -- where every other self-approved high-stakes entry carries it");
  const rcpt = (await rootQuery(
    "select segregation_mode, self_attestation, last_preparer_actor, snapshot from clara.close_receipts where id=$1",
    [reopened.reopen_receipt_id])).rows[0];
  assert.equal(rcpt.segregation_mode, "solo_self_attested", "and the RECEIPT records the determination, not the superseded close's copied one");
  assert.equal(rcpt.self_attestation, att, "with the attestation itself");
  assert.equal(rcpt.last_preparer_actor, owner, "naming the human who was checked");
  assert.equal(rcpt.snapshot.segregation.mode, "solo_self_attested");
  assert.equal(Number(rcpt.snapshot.segregation.eligible_checker_count), 1,
    "the snapshot records WHY the sole path was lawful -- the count, at the moment of the act");
  assert.equal(rcpt.snapshot.segregation.attested, true);
});
