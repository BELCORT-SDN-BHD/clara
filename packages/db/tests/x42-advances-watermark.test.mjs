// 0042 Wave D-b — the STAFF-ADVANCE battery, part 6: THE **OTHER** SIDE OF THE WATERMARK.
//
// WHY THIS FILE EXISTS. Round 2 of the as-built ladder fixed the watermark's LOWER bound (an
// enrolment committing under an open approve) and deliberately left the UPPER bound on the
// transaction-start stamp, arguing that clock-correcting it "would hand the boundary to the
// retirer". Round 3 measured what that costs: a DISBURSEMENT whose approving transaction BEGAN
// before a `retire_staff_advance_account` COMMITTED soft-births a register row onto an ALREADY
// RETIRED enrolment — bypassing the retire guard (it looked, honestly, and the row did not exist
// yet) and stranding the money behind three refusals. BOTH directions of that boundary can
// strand money, which is why the adjudication was re-opened.
//
// THE RULING THESE CELLS PIN: a retirement that is COMMITTED and VISIBLE, and stamped at or
// after the approval's own stamp, WINS — and the losing act is REFUSED by name rather than
// re-dated or quietly re-filed, because only the STAMP survives the transaction and every later
// instrument (the tie, a deferred-belt re-fire) reads the stamp. Refusing is the one answer no
// instrument has to remember: the belt, `_adv_enrolment_at`, `staff_advance_tie` and the retire
// guard all keep their existing readings and AGREE, because the state they would have disagreed
// about can no longer be created.
//
// WHAT THESE CELLS ASK THAT THE FIX DID NOT. Round 3 found that round 2's own cell "walks only
// the balance corridor and never asks the register/chart gates". So this file deliberately walks
// PAST the debit path the fix was written for: the reversal-mirror arm (w6c), the arm the retire
// guard makes structurally unreachable (w6c), the boundary a retirement that committed EARLIER
// must not trip (w6d), and the lawful retire-AND-re-enrol the gate must NOT refuse (w6d) — the
// false-positive direction, which a cell that only walks the fixed path can never see.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane,
  x42EnsureReady, skip42, refusesWith, caught, axisToken, detailOf, T, E,
  ADV1, BANKV, WAGES, mon, dayIn, today,
  advWorld, freshAdvClient, enrolHere, retireAdvance, approvedEntry, disburse, applyToAdvance,
  approveDraft, advanceTie, rowsBy, numOf, advanceRows, entryRowOf, mirrorIdOf,
  applicationRows, outstandingAt, glNet, approveRacingRetirement,
} from "./x42-adv-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-advances-watermark");
  printSkipCount("x42-advances-watermark");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b retirement-race battery");

/** The one tie row for `code`, with the envelope's own key names discovered. */
async function tieRow(client, code, asOf, label) {
  const tie = await advanceTie(w.users.alice, client, asOf);
  const row = rowsBy(tie, "account_code", label).find((r) => r.account_code === code);
  assert.ok(row, `${label}: staff_advance_tie carries a row for ${code}`);
  return row;
}

/** The refusal GUARD 0 raises, asserted by every axis a surface reads. */
function assertClosedUnder(err, label, { client, code = ADV1, entry = null } = {}) {
  assert.ok(err, `${label}: the approve must be REFUSED, not committed`);
  assert.equal(err.code, E.belt, `${label}: on the belt SQLSTATE (got ${err.code} — ${err.message})`);
  const d = detailOf(err);
  assert.equal(d.reason, T.advanceMovementUnregistered,
    `${label}: the register-cannot-hold-this token (got '${d.reason}')`);
  assert.equal(axisToken(err), "enrolment_closed_mid_approval",
    `${label}: on the axis that says WHICH way the boundary fell — the window shut under the act, which is a different defect from an act that arrived after a long-closed window`);
  assert.equal(d.account_code, code, `${label}: naming the account`);
  assert.equal(d.remedy, "retry_the_approval",
    `${label}: and carrying the remedy machine-readably, because the refusal is affordable only if the caller can act on it`);
  assert.ok(d.retired_at && d.approved_at,
    `${label}: with BOTH stamps, so the professional can see the band rather than be told one exists (got ${JSON.stringify(d)})`);
  assert.ok(new Date(d.retired_at) >= new Date(d.approved_at),
    `${label}: …and the reported band is the one the ruling describes (retired_at >= approved_at)`);
  if (entry) assert.equal(d.entry_id, entry, `${label}: naming the entry that was refused`);
  if (client) assert.ok(d.enrolment_id, `${label}: naming the generation that closed`);
  return d;
}

// ===========================================================================
// x42v.w6a — A DISBURSEMENT RACING A RETIREMENT IS REFUSED, AND LEAVES NOTHING BEHIND.
// ===========================================================================

test("x42v.w6a an approve whose transaction began BEFORE a retirement committed is REFUSED by name — no register row is born on a closed generation, the GL never moves, and the draft survives at its original revision so the named retry is real", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("w6a");

  const r = await approveRacingRetirement({
    client, enrolment, cents: 100_000, postingDate: dayIn(mon(0), 1),
    maker: w.users.alice, checker: w.users.bob,
  });
  noteLane(`x42v.w6a: approved_at ${r.approvedAt?.toISOString?.()} vs retired_at ${r.retiredAt?.toISOString?.()} — the stamp really does precede the retirement`);
  assertClosedUnder(r.approveError, "x42v.w6a", { client, entry: r.entry });

  // (i) NOTHING WAS BORN. Under the defect this was ONE row, bound to the retired generation:
  // the register said a person owed 100,000 on an account nobody watches any more.
  assert.equal((await advanceRows(client)).length, 0,
    "no register row exists — the soft-birth never happened");
  assert.equal(await glNet(client, ADV1), 0,
    "…and the GL never moved either: the hook runs INSIDE the approving transaction, so the refusal takes the whole act with it");

  // (ii) THE RETIRE GUARD'S PROMISE NOW HOLDS. Its whole meaning is "no advance survives this
  // retirement outstanding" — a promise it could not keep while an in-flight approve could add
  // one behind it. Asked over the WHOLE client, not just the row this cell made.
  const orphan = (await advanceRows(client)).filter((x) => x.enrolment_id === enrolment);
  assert.equal(orphan.length, 0,
    "no advance anywhere on this client hangs off the retired generation");
  assert.equal((await entryRowOf(r.entry)).status, "draft",
    "the entry is still a DRAFT — 'retry the approval' names something that exists");
  assert.equal((await entryRowOf(r.entry)).revision_token, r.revision,
    "…at the SAME revision token the caller already holds, so the retry needs no re-read");

  const row = await tieRow(client, ADV1, today(), "staff_advance_tie after the refused race");
  assert.equal(row.explained, true, "the tie is explained");
  assert.equal(numOf(row, /^difference_cents$/, "the tie row"), 0, "…at zero on both sides");
  assert.equal(numOf(row, /^out_of_window_cents$/, "the tie row"), 0,
    "…and nothing rode out-of-window, because nothing was ever posted");
});

// ===========================================================================
// x42v.w6b — BOTH ENDINGS THE REFUSAL NAMES ARE EXECUTABLE.
// ===========================================================================

test("x42v.w6b the remedy is real in BOTH directions: retrying the approval posts the movement OUTSIDE the register (and the tie says so in out_of_window_cents), while re-enrolling first makes it a register act on the NEW generation", async (t) => {
  if (skipHere(t)) return;

  // (a) THE PLAIN RETRY — the remedy the message leads with. A fresh transaction stamps
  // approved_at after retired_at, the watermark returns NULL, and the movement posts as an
  // ordinary entry on a retired code, which design §3.1 blesses and §3.4 reports.
  const c1 = await freshAdvClient("w6b1");
  const r1 = await approveRacingRetirement({
    client: c1.client, enrolment: c1.enrolment, cents: 80_000, postingDate: dayIn(mon(0), 2),
    maker: w.users.alice, checker: w.users.bob,
  });
  assertClosedUnder(r1.approveError, "x42v.w6b(a)", { client: c1.client, entry: r1.entry });

  await approveDraft(r1.entry, { maker: w.users.alice });
  assert.equal((await entryRowOf(r1.entry)).status, "approved",
    "the retry COMMITS — the refusal was about the band, not about the entry");
  assert.equal((await advanceRows(c1.client)).length, 0,
    "…and births nothing: the register is genuinely shut for this code now");
  assert.equal(await glNet(c1.client, ADV1), 80_000, "…while the GL did move");
  const row1 = await tieRow(c1.client, ADV1, today(), "staff_advance_tie after the retry");
  assert.equal(numOf(row1, /^out_of_window_cents$/, "the tie row"), 80_000,
    "…and the whole movement is reported in its own EXPLAINED column, not left to read as a break");
  assert.equal(row1.explained, true, "so the tie is explained");

  // (b) THE OTHER ENDING the message names — "if it really is a staff advance, re-enrol the
  // account first". A DIFFERENT client, because the point is the register acting, not the
  // out-of-window residue.
  const c2 = await freshAdvClient("w6b2");
  const r2 = await approveRacingRetirement({
    client: c2.client, enrolment: c2.enrolment, cents: 90_000, postingDate: dayIn(mon(0), 3),
    maker: w.users.alice, checker: w.users.bob,
  });
  assertClosedUnder(r2.approveError, "x42v.w6b(b)", { client: c2.client, entry: r2.entry });

  const gen2 = await enrolHere(w.users.alice, { client: c2.client, personLabel: "w6b successor" });
  assert.notEqual(gen2, c2.enrolment, "the re-enrolment opens a NEW generation");
  await approveDraft(r2.entry, { maker: w.users.alice });
  const rows = await advanceRows(c2.client);
  assert.equal(rows.length, 1, "…and the same entry now soft-births its register row");
  assert.equal(rows[0].enrolment_id, gen2,
    "…bound to the generation that is actually in force, never to the closed one");
  assert.equal(Number(rows[0].amount_cents), 90_000, "…for the whole disbursement");
  const row2 = await tieRow(c2.client, ADV1, today(), "staff_advance_tie after the re-enrolment ending");
  assert.equal(numOf(row2, /^difference_cents$/, "the tie row"), 0, "the tie holds to the sen");
  assert.equal(numOf(row2, /^out_of_window_cents$/, "the tie row"), 0,
    "…with nothing outside a window, because the movement really did happen inside one");
});

// ===========================================================================
// x42v.w6c — THE ARMS THE DEBIT PATH NEVER WALKED.
// ===========================================================================

test("x42v.w6c the gate is asked ABOVE every arm, not beside the one that was broken: a REVERSAL MIRROR racing a retirement is refused on the same axis and mints no correction — and the credit arm is structurally unreachable, because the retire guard refuses exactly while something is outstanding", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("w6c");
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(mon(-4), 5) })).advance;
  const app = await applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 100_000, postingDate: dayIn(mon(-3), 5), counter: BANKV, kind: "bank_return",
  });
  assert.equal(await outstandingAt(a.id, today()), 0, "mandatory setup: the advance is fully repaid, so the retirement is lawful");
  const appsBefore = (await applicationRows(client)).length;

  // ARM (1), IN THE BAND. `clara.reverse_entry` approves its own mirror in the CALLER'S
  // transaction on the low-stakes branch, so running the verb itself inside the open
  // transaction is the only instrument that reaches arm (1) here. Under the defect the mirror's
  // stamp still fell inside the closed generation, so arm (1a)'s own enrolment_closed guard did
  // NOT fire and a correction was minted onto a retired code — 100,000 back outstanding on an
  // account nothing watches, and a tie break with no act that could ever clear it.
  const r = await approveRacingRetirement({
    client, enrolment, reason: "x42 w6c the staff member left",
    act: async (conn) => conn.query(
      "select clara.reverse_entry(p_entry => $1::uuid, p_reason => $2::text, p_op_key => $3::text) as r",
      [app.entryId, "x42 w6c the repayment never happened", opk("x42w6crev")]),
  });
  assertClosedUnder(r.approveError, "x42v.w6c mirror arm", { client });

  assert.equal(await mirrorIdOf(app.entryId), null,
    "no mirror survived — the refusal took the whole reversal with it");
  assert.equal((await applicationRows(client)).length, appsBefore,
    "…and NO correction row was minted onto the closed generation");
  assert.equal(await outstandingAt(a.id, today()), 0,
    "…so the register still says the advance is settled, which is what the books say");

  // THE CREDIT ARM (arm 2) CANNOT REACH THE BAND AT ALL, and this pins WHY rather than
  // asserting nothing: an application needs something outstanding, and the retire guard refuses
  // exactly while something is outstanding. If that guard is ever loosened, this assertion
  // fails and the next author learns that arm (2) then needs its own race cell.
  const c2 = await freshAdvClient("w6c2");
  const b = (await disburse({ client: c2.client, cents: 70_000, postingDate: dayIn(mon(-2), 5) })).advance;
  assert.ok(await outstandingAt(b.id, today()) > 0, "mandatory setup: the advance is outstanding");
  await refusesWith(() => retireAdvance(w.users.hana, {
    client: c2.client, enrolment: c2.enrolment, reason: "x42 w6c2 try to close early", opKey: opk("x42w6c2"),
  }), E.badRequest, T.advanceOutstandingOnRetire,
  "retiring while an advance is outstanding — the guard that makes the credit arm's race band empty");
  noteLane("x42v.w6c: arm (2) is unreachable in the race band by construction — an application requires an outstanding advance, and `advance_outstanding_on_retire` refuses the retirement exactly then");
});

// ===========================================================================
// x42v.w6d — THE GATE IS NOT TOO WIDE (the false-positive direction).
// ===========================================================================

test("x42v.w6d the gate covers EXACTLY the band: a retirement that committed BEFORE the approving transaction began posts silently out-of-window as design §3.4 intends, and a lawful retire-AND-re-enrol inside the band is ADMITTED and binds to the NEW generation", async (t) => {
  if (skipHere(t)) return;

  // (a) THE NEGATIVE CONTROL. A code retired long before this approval is an ordinary account
  // again — the register is shut, nothing refuses, and the movement rides out_of_window_cents.
  // A gate that fired here would refuse every ordinary entry on every retired advance code the
  // firm has ever had, which is precisely the re-use design §3.1 blesses.
  const c1 = await freshAdvClient("w6d1");
  await retireAdvance(w.users.hana, {
    client: c1.client, enrolment: c1.enrolment, reason: "x42 w6d1 closed months ago", opKey: opk("x42w6d1"),
  });
  const ok = await caught(() => approvedEntry(w.users.alice, {
    client: c1.client, memo: "x42 w6d the code is re-used as an ordinary float", postingDate: today(),
    lines: [
      { account_code: ADV1, debit_cents: 40_000, credit_cents: 0, description: "petty float" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 40_000, description: "from bank" },
    ],
  }));
  assert.equal(ok, null,
    `an entry on a code retired BEFORE the transaction began must post untouched (got ${ok?.code} ${ok?.message})`);
  assert.equal((await advanceRows(c1.client)).length, 0, "…and births nothing");
  const row1 = await tieRow(c1.client, ADV1, today(), "staff_advance_tie after the ordinary re-use");
  assert.equal(numOf(row1, /^out_of_window_cents$/, "the tie row"), 40_000,
    "…riding the EXPLAINED column, exactly as design §3.4 says a repurposed retired code should");

  // (b) THE HARDER FALSE POSITIVE — and the one a cell that only walks the fixed path can never
  // see. Inside the SAME band, an admin retires the leaving holder and enrols the successor on
  // the same code. Both generations satisfy the watermark's bounds here, so the reader has to
  // choose; preferring the generation in force AT THE STAMP would pick the RETIRED one and this
  // gate would then refuse a completely lawful sequence. An ACTIVE generation must win.
  const c2 = await freshAdvClient("w6d2");
  let gen2 = null;
  const r = await approveRacingRetirement({
    client: c2.client, enrolment: c2.enrolment, cents: 65_000, postingDate: dayIn(mon(0), 4),
    maker: w.users.alice, checker: w.users.bob, reason: "x42 w6d2 the holder left mid-approval",
    then: async () => {
      gen2 = await enrolHere(w.users.alice, { client: c2.client, personLabel: "w6d2 successor" });
      return gen2;
    },
  });
  assert.ok(gen2 && gen2 !== c2.enrolment, "mandatory setup: a NEW generation was opened inside the band");
  assert.equal(r.approveError, null,
    `the approve is lawful and must COMMIT — a live enrolment is in force at the act (got ${r.approveError?.code} ${r.approveError?.message})`);
  const rows = await advanceRows(c2.client);
  assert.equal(rows.length, 1, "…and the disbursement soft-births its register row");
  assert.equal(rows[0].enrolment_id, gen2,
    "…bound to the ACTIVE successor generation, never to the one that closed under the act");
  const row2 = await tieRow(c2.client, ADV1, today(), "staff_advance_tie after the retire-and-re-enrol");
  assert.equal(numOf(row2, /^difference_cents$/, "the tie row"), 0, "the tie holds to the sen");
  assert.equal(numOf(row2, /^out_of_window_cents$/, "the tie row"), 0,
    "…and nothing is stranded outside a window");
  noteLane(`x42v.w6d: WAGES/OTHER codes untouched by the gate — the scan is pruned to codes carrying a RETIRED enrolment (${WAGES} never enters it)`);
});
