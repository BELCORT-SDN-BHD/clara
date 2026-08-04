// 0042 Wave D-b — THE RESERVATION AUTHORITY, ROUND-4 ROOT FIXES.
//
// Ladder round 4 found that three of its own findings were REGRESSIONS FROM FIXES MADE HOURS
// EARLIER, and the common cause was that each fix landed at the SITE it was reported at
// instead of on the INVARIANT. These two cells belong to the two fixes that moved:
//
//   x42.ra5  THE ONE DISCRIMINATOR (0042 S5.15b). INVARIANT: within a client an account code
//            carries AT MOST ONE (domain, role) claim — a door claiming the fixed-asset role
//            R may share the code only with an identical (fa, R) claim, and with nothing
//            else. That rule had THREE hand-written copies in one migration and the K-doc
//            seed door's omitted the ROLE, so a register row could be baked with its COST
//            code set to another LIVE row's ACCUMULATED code (measured: fa_register_tie
//            false, a debit-balance "accumulated depreciation" of -400,000 and an
//            unexplained 600,000 difference). The rule now has one home and this proves the
//            rule itself, not the door.
//   x42.ra6  THE TIE AGREES WITH THE GATE (0042 S5.19). INVARIANT: clara.fa_register_tie's
//            account universe is exactly the accounts the fixed-asset family holds AT
//            p_as_of. The lifecycle gate released terminal rows' codes and nothing recut
//            this reader, so a lawfully re-claimed code made the tie go red with a
//            difference no accounting act could clear. This cell walks the DANGEROUS
//            direction of that recut too — a historical as-of must still see a
//            since-disposed account, or the tie reports green over an account nobody looked
//            at, which is the worse defect because it is silent.
//
// The ruling's own four cells are the sibling file, x42-reservation-authority.test.mjs.
// Fixtures are shared through x42-ra-helpers.mjs so the two files cannot drift apart on the
// one field an as-of walk turns on.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane, caught, reasonToken,
  x42EnsureReady, skip42, refusesNamed, E,
  ADV1, FACOST, FAACCUM, FAEXP,
  advWorld, freshAdvClient, enrolAdvance, retireAdvance, disburse, mon, dayIn,
} from "./x42-adv-world.mjs";
import { glNet, applyToAdvance, humanCall } from "./x42-adv-world.mjs";
import { faRegisterTie, plantRow, plantDisposed, plantAssetWithGl, legForeign }
  from "./x42-ra-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-reservation-role");
  printSkipCount("x42-reservation-role");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the D-b reservation round-4 root-fix battery");
// ===========================================================================
// x42.ra5 — THE ONE DISCRIMINATOR (round-4 root fix, 0042 S5.15b).
//
// THE INVARIANT: within a client an account code carries AT MOST ONE (domain, role) claim;
// a door claiming the fixed-asset role R may share the code only with an identical (fa, R)
// claim, and with nothing else. It had three hand-written copies and one of them — the K-doc
// seed door's — omitted the role, so a register row could be baked with its COST code set to
// another LIVE row's ACCUMULATED code. It now has exactly one home, proved here behaviourally.
// ===========================================================================

test("x42.ra5 the shared discriminator admits same-role sharing and refuses every cross-role and cross-domain claim — the rule that three doors hand-wrote, one of them without the role", async (t) => {
  if (skipHere(t)) return;

  const conflict = async (client, code, wantRole) =>
    (await rootQuery(
      "select res_domain, res_role, res_owner from clara._fa_role_claim_conflict($1::uuid, $2::text, $3::text)",
      [client, code, wantRole])).rows;

  // A live register row holding cost=FACOST, accum=FAACCUM, expense=FAEXP.
  const { client } = await freshAdvClient("ra5", { enrol: false });
  await plantRow(w.users.alice, client, { status: "active" });

  // (a) SAME ROLE IS LAWFUL AND MUST STAY LAWFUL. Many assets legitimately post to one cost
  // account — that is what a register IS — so a discriminator that refused here would have
  // broken the ordinary case while fixing the exotic one. This arm is first on purpose: the
  // failure mode of an over-eager fix is worse than the defect it removes.
  assert.deepEqual(await conflict(client, FACOST, "cost"), [],
    "a second asset may share a live row's COST account — same role, lawful, and refusing it would make the register unusable");
  assert.deepEqual(await conflict(client, FAACCUM, "accum"), [],
    "…and its accumulated account in the accumulated role");

  // (b) CROSS-ROLE IS THE DEFECT THAT SHIPPED. FACOST is held in the cost role; claiming it
  // as ACCUMULATED puts two roles on one account, and the measured consequence was a
  // fa_register_tie with a debit-balance "accumulated depreciation" and a difference no act
  // could clear. A `domain <> 'fa'` filter — the one S5.17 was built with — returns nothing
  // for every pair below.
  for (const [code, held, want] of [
    [FACOST, "cost", "accum"], [FACOST, "cost", "expense"],
    [FAACCUM, "accum", "cost"], [FAEXP, "expense", "cost"],
  ]) {
    const hits = await conflict(client, code, want);
    assert.equal(hits.length, 1,
      `claiming ${code} (held as ${held}) in the ${want} role is a CONFLICT — a domain-only filter would have missed exactly half of this rule`);
    assert.equal(hits[0].res_domain, "fa", "…and it names the holding domain");
    assert.equal(hits[0].res_role, held, "…and the role that actually holds it, so the refusal can say what to release");
  }

  // (c) CROSS-DOMAIN, in every role. An actively enrolled advance code conflicts with all
  // three fixed-asset roles: the advance register shares with nothing.
  const { client: c2 } = await freshAdvClient("ra5x");
  for (const want of ["cost", "accum", "expense"]) {
    const hits = await conflict(c2, ADV1, want);
    assert.equal(hits.length, 1, `an actively enrolled advance code conflicts with the FA ${want} role`);
    assert.equal(hits[0].res_domain, "staff_advance", "…named as the advance register's");
  }

  // (d) WHAT THIS FIX DID NOT THINK OF — the role it was never taught. A door that hands the
  // predicate a role nobody classified must be REFUSED, not answered "no conflict": an
  // admission that comes from a question never asked is precisely how the defect shipped.
  for (const bad of ["depreciation", "proceeds", "COST", null]) {
    const err = await caught(() => rootQuery(
      "select 1 from clara._fa_role_claim_conflict($1::uuid, $2::text, $3::text)",
      [client, FACOST, bad]));
    assert.ok(err, `an unclassified role (${bad ?? "null"}) is refused, not answered`);
    assert.equal(reasonToken(err), "fa_role_unclassified",
      `…by name, so the next author is told to classify it (got ${err?.message})`);
  }

  // (e) …AND A RELEASED CODE REALLY IS FREE IN EVERY ROLE. The discriminator reads through the
  // gated union, so it must agree with x42.ra1: a terminal row conflicts with nothing. A
  // predicate that answered "conflict" here would re-impose the permanent claim S5.15 removed,
  // from a new place.
  const { client: c3 } = await freshAdvClient("ra5rel", { enrol: false });
  await plantRow(w.users.alice, c3, { status: "disposed" });
  for (const want of ["cost", "accum", "expense"]) {
    assert.deepEqual(await conflict(c3, FACOST, want), [],
      `a DISPOSED row's code is free in the ${want} role — the discriminator inherits the lifecycle gate rather than restating it`);
  }
});

// ===========================================================================
// x42.ra6 — THE TIE AGREES WITH THE GATE (round-4 root fix, 0042 S5.19).
//
// THE INVARIANT: clara.fa_register_tie's account universe is exactly the accounts the
// fixed-asset family holds AT p_as_of. x42.ra4(b) pins the case the finding measured; this
// cell walks the arms that fix could break — above all the DANGEROUS direction, where a
// too-eager gate silently drops a real account from a historical tie and reports green.
// ===========================================================================

test("x42.ra6 the register tie's universe is what the FA family holds AT the as-of date — a historical as-of still sees a since-disposed account, and a code a LIVE row holds can never be taken by another register", async (t) => {
  if (skipHere(t)) return;

  // Disposed at the END of last month, so mon(-2) is inside its life and mon(1) is after it.
  // The date is the whole subject of this cell, so it comes from the SHARED planter — a
  // second inline copy of this fixture is exactly how (a) and (b) would drift apart.
  const { client } = await freshAdvClient("ra6", { enrol: false });
  await plantDisposed(w.users.alice, client,
    { disposedAt: dayIn(mon(-1), 28), memo: "x42 ra6 disposal" });

  const tieAt = (asOf) => faRegisterTie(w.users.alice, client, asOf);
  const rowFor = (tie) => (tie.accounts ?? []).find((r) => r.asset_account === FACOST);

  // (a) THE DANGEROUS DIRECTION, TESTED FIRST. The obvious recut — gate the walk on the
  // CURRENT status, the way the reservation does — would drop this account from every
  // historical answer, and the tie would report GREEN over an account nobody examined. That
  // is a worse defect than the one being fixed, because it is silent. The walk is gated on
  // clara._fa_included_at (an AS-OF question) precisely so this arm holds.
  const hist = await tieAt(dayIn(mon(-2), 15));
  assert.ok(rowFor(hist),
    "an as-of DURING the asset's life still walks its account — the row was genuinely in the register then and its cost is genuinely in the GL, so gating on CURRENT status would hide a real account behind a green tie");

  // (b) …AND AFTER THE DISPOSAL IT LEAVES, because the family no longer holds it.
  assert.equal(rowFor(await tieAt(dayIn(mon(1), 28))), undefined,
    "an as-of after the disposal does not walk the account — the register holds nothing on it and has nothing to answer for");

  // (c) A LIVE ROW ANYWHERE ON THE CODE KEEPS IT, and that is what makes the whole design
  // safe: an account another register could poison is an account no live FA row holds, and an
  // account a live FA row holds is one no other register can be enrolled on. The two halves
  // are asserted together because either alone is a half-argument.
  await plantRow(w.users.alice, client, { status: "active" });
  const shared = await tieAt(dayIn(mon(1), 28));
  assert.ok(rowFor(shared),
    "…while a LIVE row shares the code, the account stays in the universe — assets sharing one cost account is what a register IS");
  await refusesNamed(() => enrolAdvance(w.users.alice, {
    client, accountCode: FACOST, personLabel: "ra6 claimant",
  }), "enrolling an advance on a code a LIVE register row holds",
  { codes: [E.badRequest, "CLR37", "CLR10"] });

  // (d) WHAT THIS FIX DID NOT THINK OF — the RE-CLAIM. Nothing above stops this sequence:
  // release the code, let an advance hold it for a while, retire the enrolment, seed the FA
  // register on it again. The account comes back into the walk carrying a GL history the
  // register never held. The answer is that the advance era NETS TO ZERO, and it does so
  // structurally: retire_staff_advance_account refuses while ANY advance is outstanding, and
  // the code cannot be re-claimed by the FA family until the enrolment is retired. That
  // premise is load-bearing, so it is measured rather than trusted.
  const { client: c2 } = await freshAdvClient("ra6rc");
  await disburse({ client: c2, cents: 250_000, postingDate: dayIn(mon(-1), 10), account: ADV1 });
  const enrolment = (await rootQuery(
    "select id from clara.staff_advance_accounts where client_id=$1::uuid and account_code=$2::text and active",
    [c2, ADV1])).rows[0].id;
  const err = await caught(() => retireAdvance(w.users.hana, {
    client: c2, enrolment, reason: "x42 ra6 premise", opKey: opk("ra6"),
  }));
  assert.ok(err,
    "retiring an enrolment with an advance still outstanding is REFUSED — this is the premise that makes a re-claimed code's advance era net to zero, and fa_register_tie's honesty rests on it");
  assert.equal(reasonToken(err), "advance_outstanding_on_retire",
    `…by name (got ${err?.message} / ${err?.detail})`);
  noteLane("x42.ra6(d) the NAMED RESIDUAL this cell recorded was MEASURED FALSE in ladder round 6 and is now a fixed defect, not a residue: draft_entry takes its posting date from the caller, so a backdated advance leg IS reachable through the D-b doors. Closed by 0042 S5.19's GL-side scoping; the end-to-end evidence and the whole-lifecycle sweep are x42.ra7.");
});

// ===========================================================================
// x42.ra7 — THE TIE IS SYMMETRIC ACROSS AS-OF (round-6 lens 3, 0042 S5.19).
//
// THE INVARIANT: at EVERY as-of, clara.fa_register_tie's register side and GL side agree about
// WHICH FAMILY OWNS EACH MOVEMENT. A foreign register's lawful movement rides an EXPLAINED
// column — never an unexplained difference — at every date, not only after the terminal date.
//
// WHAT WENT WRONG BEFORE: x42.ra6 recut the WALK and the GL side kept summing the whole
// account, so the fix held only FORWARD from an asset's terminal date. Between the foreign
// register's first posting and that date, every as-of reported tie=false with a difference no
// accounting act could clear — while clara.staff_advance_tie, on the same code at the same
// date, reported tie=true with the fixed-asset money on out_of_window_cents. Two instruments,
// one account, opposite verdicts. This cell sweeps the whole lifecycle rather than one date,
// because "held on one side of a date" is precisely the defect it exists to close.
// ===========================================================================

test("x42.ra7 the register tie explains a foreign register's lawful movement at EVERY as-of — the whole lifecycle, both instruments agreeing, and a real break still red", async (t) => {
  if (skipHere(t)) return;

  const { client } = await freshAdvClient("ra7", { enrol: false });
  const buyDate = dayIn(mon(-6), 5);
  const dispDate = dayIn(mon(-3), 20);
  const advDate = dayIn(mon(-5), 10); // BACKDATED into the window the asset was still live
  const { buy, disposal } = await plantAssetWithGl(w.users.alice, client,
    { cost: 100_000, buyDate, disposeDate: dispDate, tag: "x42 ra7 asset" });

  // The code is released (the row is terminal), so the advance family may lawfully take it —
  // and then post INSIDE the fixed asset's life, which is the whole finding.
  await enrolAdvance(w.users.alice, { client, accountCode: FACOST, personLabel: "ra7 claimant" });
  const { entry: advEntry } = await disburse({
    client, cents: 250_000, postingDate: advDate, account: FACOST,
    memo: "x42 ra7 backdated disbursement" });

  const rowAt = async (asOf) => {
    const env = await faRegisterTie(w.users.alice, client, asOf);
    return { env, row: (env.accounts ?? []).find((x) => x.asset_account === FACOST) };
  };

  // (a) THE SWEEP. Before the asset existed, across its life, over the day the foreign leg
  // lands, up to the terminal date and past it. One assertion set, every date.
  for (const asOf of [dayIn(mon(-7), 1), dayIn(mon(-6), 1), dayIn(mon(-6), 20), advDate,
                      dayIn(mon(-5), 20), dayIn(mon(-4), 30), dayIn(mon(-3), 19),
                      dispDate, dayIn(mon(-1), 28), dayIn(mon(0), 28)]) {
    const { env, row } = await rowAt(asOf);
    assert.equal(env.tie, true,
      `the tie is honest at ${asOf} — a foreign register's lawful posting is never an unexplained fixed-asset difference (got ${JSON.stringify(row)})`);
    if (!row) continue;
    assert.equal(Number(row.cost_diff_cents), 0, `…and nothing to act on at ${asOf}`);
    assert.equal(Number(row.gl_foreign_register_cost_cents), asOf >= advDate ? 250_000 : 0,
      `…with the foreign register's movement reported EXACTLY once it has posted, at ${asOf}`);
    // NOTHING VANISHED. The compared sum plus the explained column is the whole approved
    // movement on the account — measured independently of the DB body, so "excluded" can
    // never quietly mean "lost".
    assert.equal(
      Number(row.gl_cost_cents) + Number(row.gl_foreign_register_cost_cents),
      await glNet(client, FACOST, asOf),
      `…and the two columns total the account's whole approved movement at ${asOf}`);
  }
  assert.equal((await rowAt(dayIn(mon(-7), 1))).row, undefined,
    "an as-of BEFORE the asset existed walks nothing on the code — there is no register row to answer for and no profile holding it [WDB-R4]");
  assert.equal((await rowAt(dispDate)).row, undefined,
    "…and from the terminal date the account leaves the walk entirely, which is x42.ra6's half of the fix, unchanged");

  // (b) BOTH INSTRUMENTS, ONE ACCOUNT, ONE DATE — the asymmetry that named the finding.
  const advTie = await humanCall(w.users.alice, "staff_advance_tie",
    [{ name: "p_client" }, { name: "p_as_of", cast: "date" }], [client, dayIn(mon(-4), 30)]);
  assert.equal(advTie.tie, true, "the advance tie is green on the same code at the same date");
  assert.equal(Number((advTie.accounts ?? [])[0]?.out_of_window_cents), 100_000,
    "…explaining the FIXED-ASSET era on out_of_window_cents — the posture the register tie now mirrors instead of contradicting");

  // (c) THE DANGEROUS DIRECTION, ASKED OF THE PREDICATE ITSELF. A window that swallowed the
  // fixed-asset family's OWN money would report green over a real break — worse than the
  // defect fixed. Both register-minted entries are inside the advance's live window right now
  // and neither is foreign; the disbursement, at the same instant, is.
  const now = new Date().toISOString();
  assert.equal(await legForeign(client, FACOST, buy, now), false,
    "the ACQUISITION entry is never foreign — the register demonstrably acted on it, whoever else holds the code");
  assert.equal(await legForeign(client, FACOST, disposal, now), false,
    "…nor the DISPOSAL entry, for the same reason");
  assert.equal(await legForeign(client, FACOST, advEntry, now), true,
    "…while the advance's own disbursement is, which is what makes the explained column mean something");

  // …AND A GENUINE BREAK IS STILL RED. A register row carrying cost the GL never received is
  // exactly what this instrument exists to catch; the round-6 fix must not have made it green.
  const { client: c2 } = await freshAdvClient("ra7red", { enrol: false });
  await plantAssetWithGl(w.users.alice, c2, { cost: 100_000, buyDate, tag: "x42 ra7 real" });
  await plantRow(w.users.alice, c2, { status: "active" }); // 100,000 of cost, no GL leg
  const redEnv = await faRegisterTie(w.users.alice, c2, dayIn(mon(0), 28));
  const redRow = (redEnv.accounts ?? []).find((x) => x.asset_account === FACOST);
  assert.equal(redEnv.tie, false, "an unposted register row is STILL a red tie");
  assert.equal(Number(redRow.cost_diff_cents), 100_000, "…by the exact amount the GL never received");
  assert.equal(Number(redRow.gl_foreign_register_cost_cents), 0,
    "…and nothing was explained away to get there");

  // (d) TWO REGISTERS CLAIMING THE CODE IN SEQUENCE [WDB-R4]: fa → advance → retire → fa
  // again, with the second fixed asset acquired INSIDE the advance era and the advance still
  // outstanding at the as-of. This is the arm the old argument could not reach: it rested on
  // the advance era netting to zero, and here it does not net at the date being asked.
  const { client: c3 } = await freshAdvClient("ra7seq", { enrol: false });
  await plantAssetWithGl(w.users.alice, c3,
    { cost: 100_000, buyDate: dayIn(mon(-8), 5), disposeDate: dayIn(mon(-6), 10), tag: "x42 ra7 first" });
  const rec = await enrolAdvance(w.users.alice, { client: c3, accountCode: FACOST, personLabel: "ra7 seq" });
  const enrolment = rec.enrolment_id ?? rec.id;
  const { advance } = await disburse({ client: c3, cents: 60_000, postingDate: dayIn(mon(-5), 5),
                                       account: FACOST, memo: "x42 ra7 seq disbursement" });
  await applyToAdvance(w.users.alice, { client: c3, advance: advance.id, accountCode: FACOST,
                                        cents: 60_000, postingDate: dayIn(mon(-3), 5),
                                        reason: "x42 ra7 seq settlement" });
  await retireAdvance(w.users.hana, { client: c3, enrolment, reason: "x42 ra7 seq retire",
                                      opKey: opk("ra7seq") });
  await plantAssetWithGl(w.users.alice, c3,
    { cost: 40_000, buyDate: dayIn(mon(-4), 20), tag: "x42 ra7 second" });

  for (const [asOf, foreign] of [[dayIn(mon(-4), 25), 60_000], [dayIn(mon(-2), 20), 0]]) {
    const env = await faRegisterTie(w.users.alice, c3, asOf);
    const row = (env.accounts ?? []).find((x) => x.asset_account === FACOST);
    assert.ok(row, `the re-claimed account is walked at ${asOf}`);
    assert.equal(env.tie, true,
      `both fixed-asset eras stay in the compared sum and only the advance era is explained away, at ${asOf} (got ${JSON.stringify(row)})`);
    assert.equal(Number(row.register_cost_cents), 40_000,
      `…the register side is the SECOND asset alone at ${asOf}`);
    assert.equal(Number(row.gl_foreign_register_cost_cents), foreign,
      `…and the advance era is reported at its own as-of value at ${asOf}, not assumed to net to zero`);
    assert.equal(Number(row.gl_cost_cents) + Number(row.gl_foreign_register_cost_cents),
      await glNet(c3, FACOST, asOf), `…totalling the whole account at ${asOf}`);
  }
});
