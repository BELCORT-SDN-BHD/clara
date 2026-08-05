// 0042 Wave D-b — ROUND 9, LANE N1: THE AUTO-REVERSAL MIRROR IS VISIBLE TO THE COLLISION GATE;
// THE REFUSAL'S SECOND REMEDY IS OFFERED ONLY WHERE IT IS TRUE; THE RUN RECEIPT NAMES ITS VERB;
// AND A TEMPLATE'S FIRST DERIVED PERIOD END IS INSIDE THE STAMP GRAMMAR'S DOMAIN.
//
// Round 8 taught the gate to ask "do these shapes COLLIDE" instead of "are they identical", and
// got the predicate right. What it never asked is WHOSE MONEY IS IN THE SET. An auto-reversal
// mirror is stamped with its OCCURRENCE's period while its money posts on period_end + 1 -- the
// NEXT period -- and its own account shape is the occurrence's leg-SWAPPED. Three terms of the
// membership test therefore hid it at once, and the consequence is money:
//
//   F-N1a  TWO ORDINARY INVERSE TEMPLATES. "Accrue audit fee RM2,500 monthly, auto-reverse" and
//          "release audit fee accrual RM2,500 monthly" -- an accountant's habitual pair, made
//          fully DISJOINT by the (account, side) element. MEASURED before the fix, unattended,
//          mode='post' from the second month: after four months the expense account carried a
//          RM10,000 CREDIT balance and the accrual liability a RM10,000 DEBIT balance -- both
//          impossible for the accounts' own natures -- drifting RM2,500 every further month, with
//          clara.adjustment_run_due reporting {"due":true,"blocked":[]} throughout.
//   F-N1b  THE SECOND REMEDY MANUFACTURED THE DOUBLE. "…or give this template distinct account
//          codes", followed verbatim after a [WDB-G13] retire-and-re-propose, re-ran every
//          standing month onto fresh codes: MEASURED RM30,000 of expense and RM30,000 of accrual
//          against an RM15,000 intention, blocked:[].
//   F-N1c  THE RUN RECEIPT KNEW THE VERB AND DID NOT SAY IT. Round 8 exported `correctable` and
//          dropped `verb`, so the card wired its one button to clara.reverse_adjustment_pair --
//          which refuses CLR10 not_an_auto_pair on every SOLO occurrence.
//   F-N1d  A TEMPLATE THAT SIGNS LIVE AND CAN NEVER RUN. propose/sign domain-checked the two
//          dates a human types and not the one the cadence DERIVES: FYE 30 Nov + an annual
//          template starting 9999-12-01 signs live, and every run is refused date_unsupported.
//
// THE OFF-PATH ARMS (WDB-R4) are r9n1b, r9n1d, r9n1e and r9n1i: the LAWFUL auto-reverse ramp must
// still drain (a mirror is the leg-swap of its own occurrence, so it can never self-collide);
// pair_half_uncorrected must stay reachable and must stay the axis for the state it is named
// after; the one line shape whose mirror DOES collide with its own next occurrence must refuse
// with a followable remedy rather than silently; and the whole law must hold across the OTHER
// cadence, where a mirror lands in the next FINANCIAL YEAR rather than the next month.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, printLaneNotes, printSkipCount, rootQuery,
  x42EnsureReady, skip42, caught, reasonToken,
  EXPA, ACCR, CLR38, mon, addDays,
  runManual, runOccurrence, reversePair, approvePairReversal, adjustmentRunDue,
  accrualLines, adjWorld, freshAdjClient, liveTemplate,
  approveDraft, mirrorOf, glNet, stampedEntries,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});
after(async () => {
  printLaneNotes("x42-r9n1");
  printSkipCount("x42-r9n1");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the round-9 mirror-visibility battery");

/** The gate itself, asked with a template's own shape — so a cell reads the payload the poster
 *  and the oracle both derive from, without inferring it from either. */
const gateFor = async (client, template, period) => (await rootQuery(
  `select clara._wdb_rerun_breach($1,'recurring_adjustment',
      clara._wdb_line_shape((select lines from clara.adjustment_templates where id=$2)),
      $3::date,$4::date) as b`, [client, template, period.start, period.end])).rows[0].b;

/** The gate asked with NO shape at all — "every shape", the widest read the ABI allows. */
const gateWide = async (client, period) => (await rootQuery(
  `select clara._wdb_rerun_breach($1,'recurring_adjustment',null::text[],$2::date,$3::date) as b`,
  [client, period.start, period.end])).rows[0].b;

const runRefusal = (client, template, period) => caught(() => runManual(w.users.bob, {
  client, template, periodStart: period.start, periodEnd: period.end,
}));

// ---------------------------------------------------------------------------------------
// x42.r9n1a — F-N1a, THE MONEY LANE, DRIVEN THROUGH THE MACHINE VERB WITH NO HUMAN IN IT.
// Both templates are signed BEFORE the first period ends, so the ramp is earned and every
// occurrence from month two is mode='post' — which is the whole point: nothing reaches a queue.
// ---------------------------------------------------------------------------------------
test("x42.r9n1a two INVERSE templates (accrue + auto-reverse, and release) cannot drift the books unattended: the release is refused from the first month a mirror's money lands in it, the drift is arrested at ZERO, and the oracle blocks instead of advertising", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r9n1a");
  const M = [mon(-5), mon(-4), mon(-3), mon(-2)];
  const C = 250_000;
  const signDay = addDays(M[0].start, 1);   // signed before period 1 ends => not catch-up

  const tAcc = await liveTemplate({
    client, label: "r9n1a accrue", start: M[0].start, autoReverse: true,
    lines: accrualLines(C, { debit: EXPA, credit: ACCR }), memo: "r9n1a accrue",
    backdateSignTo: signDay });
  const tRel = await liveTemplate({
    client, label: "r9n1a release", start: M[0].start, autoReverse: false,
    lines: accrualLines(C, { debit: ACCR, credit: EXPA }), memo: "r9n1a release",
    backdateSignTo: signDay });

  // The two shapes really are DISJOINT — the (account, side) element makes an inverse template
  // invisible to every shape test. If that ever stops being true this cell is proving something
  // else, so it is asserted rather than assumed.
  const overlap = (await rootQuery(
    `select clara._wdb_shape_overlap(
        clara._wdb_line_shape((select lines from clara.adjustment_templates where id=$1)),
        clara._wdb_line_shape((select lines from clara.adjustment_templates where id=$2))) as o`,
    [tAcc.id, tRel.id])).rows[0].o;
  assert.equal(overlap, null, "the accrue and release templates share no (account, side) element");

  const drive = async (template) => {
    const out = [];
    for (const P of M) {
      let r = null;
      try {
        r = await runOccurrence({ client, template, periodStart: P.start, periodEnd: P.end });
      } catch (e) {
        out.push({ key: P.key, refused: reasonToken(e), err: e });
        continue;
      }
      if (r.status === "drafted") await approveDraft(w.users.alice, r.entry_id);
      out.push({ key: P.key, mode: r.mode ?? r.status });
      }
    return out;
  };

  const acc = await drive(tAcc.id);
  assert.equal(acc.filter((x) => x.refused).length, 0,
    "the accrual template's own four months all run — the fix must not block a healthy template");
  assert.equal((await stampedEntries(tAcc.id, "occurrence")).length, 4, "four occurrences");
  assert.equal((await stampedEntries(tAcc.id, "reversal")).length, 4, "…and four mirrors");

  const rel = await drive(tRel.id);
  assert.equal(rel[0].refused, undefined,
    "month one is admitted: no mirror has landed in it yet, and a release in an un-accrued month is the firm's own act");
  for (const r of rel.slice(1)) {
    assert.equal(r.refused, "period_shape_already_met",
      `${r.key}: the release collides with the accrual's MIRROR, whose money is standing in this month`);
    assert.equal(r.err.code, CLR38);
    const d = JSON.parse(r.err.detail);
    assert.equal(d.role, "reversal", `${r.key}: the entry named is the MIRROR — the posting that is actually here`);
    assert.deepEqual(d.colliding_elements, [ACCR + ":D", EXPA + ":C"],
      `${r.key}: and the elements named are the mirror's OWN, not its occurrence's`);
  }

  // THE MONEY. Before the fix EXPA fell 250,000 further every month; now it stops moving after
  // the single lawful month-one release. "Arrested at zero" is asserted as an equality between
  // three month-ends, not as a single figure that could be right by accident.
  const e1 = await glNet(client, EXPA, M[1].end);
  const e2 = await glNet(client, EXPA, M[2].end);
  const e3 = await glNet(client, EXPA, M[3].end);
  assert.equal(e1, 0, "at the end of month two the accruals and their releases net to zero");
  assert.equal(e2, e1, "month three adds no drift");
  assert.equal(e3, e1, "…and neither does month four");
  assert.equal(await glNet(client, EXPA), -C,
    "the ONLY residue is month one's release, RM2,500 — the firm's own act, not the machine's drift");
  assert.equal(await glNet(client, ACCR), C, "…and the liability side matches it to the sen");

  // THE ORACLE is what ran these months unattended, so it must say so.
  const due = await adjustmentRunDue(client);
  assert.deepEqual((due.blocked ?? []).filter((b) => b.template_id === tRel.id).map((b) => b.reason),
    ["period_shape_already_met"],
    "the release template reaches blocked[] instead of being advertised for ever");
});

// ---------------------------------------------------------------------------------------
// x42.r9n1b — OFF-PATH (WDB-R4): THE LAWFUL RAMP, WITH THE MONEY TERM LIVE.
// The money term puts a mirror in the set for the period its money lands in. The one template
// that ALWAYS has a mirror landing in its own next period is the auto-reverse template itself, so
// the first thing this fix could have broken is every auto-reverse template in the product.
// ---------------------------------------------------------------------------------------
test("x42.r9n1b an ordinary AUTO-REVERSE template still drains four consecutive months once the gate can see mirrors: a mirror is its occurrence leg-SWAPPED, so it never collides with the template's own next occurrence", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r9n1b");
  const M = [mon(-5), mon(-4), mon(-3), mon(-2)];
  const tpl = await liveTemplate({
    client, label: "r9n1b auto", start: M[0].start, autoReverse: true,
    lines: accrualLines(1_500_000), memo: "r9n1b auto" });

  for (const P of M) {
    // The gate itself is asked first, so a failure names the GATE rather than the poster.
    assert.equal(await gateFor(client, tpl.id, P), null,
      `${P.start}: the period is sound — the previous month's mirror is standing in it and shares no element`);
    const r = await runManual(w.users.bob, {
      client, template: tpl.id, periodStart: P.start, periodEnd: P.end });
    await approveDraft(w.users.alice, r.entry_id);
    const mir = await mirrorOf(r.entry_id);
    assert.ok(mir, `${P.start}: the mirror was born`);
    assert.equal(String(mir.posting_date).slice(0, 10), addDays(P.end, 1),
      `${P.start}: …and it posts on day one of the NEXT period, which is why the gate had to learn to see it`);
  }
  assert.equal((await stampedEntries(tpl.id, "occurrence")).length, 4,
    "all four months ran — no month blocked its successor");
  assert.equal(await glNet(client, ACCR, mon(-1).end), 0,
    "each accrual was released by its own mirror, so the liability is flat once the last release lands");
  assert.equal(await glNet(client, EXPA, mon(-1).end), 0, "…and so is the expense");
});

// ---------------------------------------------------------------------------------------
// x42.r9n1c — THE HONEST AXIS AND A REMEDY THAT CAN BE FOLLOWED. A mirror cannot be corrected on
// its own (clara.reverse_entry refuses CLR39 adjustment_pair_locked) — it is corrected through
// its PAIR. This cell does not assert a string: it takes the verb the gate names, on the entry
// the gate names, calls it, and requires the period to re-open.
// ---------------------------------------------------------------------------------------
test("x42.r9n1c when the standing posting is a MIRROR the gate names the mirror as the collision and the OCCURRENCE as the correction subject, with clara.reverse_adjustment_pair — and following that remedy re-opens the month", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r9n1c");
  const M1 = mon(-4), M2 = mon(-3);
  const C = 300_000;

  const tA = await liveTemplate({
    client, label: "r9n1c accrue", start: M1.start, autoReverse: true,
    lines: accrualLines(C, { debit: EXPA, credit: ACCR }), memo: "r9n1c accrue" });
  const rA = await runManual(w.users.bob, {
    client, template: tA.id, periodStart: M1.start, periodEnd: M1.end });
  await approveDraft(w.users.alice, rA.entry_id);
  const mir = await mirrorOf(rA.entry_id);

  const tB = await liveTemplate({
    client, label: "r9n1c release", start: M1.start,
    lines: accrualLines(C, { debit: ACCR, credit: EXPA }), memo: "r9n1c release" });

  const gate = await gateFor(client, tB.id, M2);
  assert.equal(gate.axis, "shape_already_met");
  assert.equal(gate.entry_id, mir.id, "the MIRROR is the posting that is standing in this month");
  assert.equal(gate.role, "reversal");
  assert.equal(gate.correction_verb, "clara.reverse_adjustment_pair",
    "a mirror is corrected through its pair, never directly");
  assert.equal(gate.correction_entry, rA.entry_id,
    "…and the pair verb takes the OCCURRENCE, so that is the id the human is handed");
  assert.equal(gate.correction_wall, "adjustment_pair_locked");

  const err = await runRefusal(client, tB.id, M2);
  assert.ok(err, "the poster refuses the month the mirror's money is in");
  assert.equal(reasonToken(err), "period_shape_already_met");

  // FOLLOW THE REMEDY the product printed, with the verb and the entry it named.
  const done = await reversePair(w.users.bob, {
    client, occurrence: rA.entry_id, reason: "r9n1c follow the named remedy" });
  if (done.status !== "completed") {
    await approvePairReversal(w.users.alice, { client, pair: done.pair_id ?? done.id });
  }
  assert.equal(await gateFor(client, tB.id, M2), null,
    "with the pair corrected on its own two dates, the month re-opens by itself");
  const r2 = await runManual(w.users.bob, {
    client, template: tB.id, periodStart: M2.start, periodEnd: M2.end });
  await approveDraft(w.users.alice, r2.entry_id);
  assert.equal(await glNet(client, EXPA), -C,
    "the accrual and its release are both corrected on their own dates; only the release template's own figure remains");
  assert.equal(await glNet(client, ACCR), C, "…and the liability side ties to the sen");
});

// ---------------------------------------------------------------------------------------
// x42.r9n1d — OFF-PATH (WDB-R4): pair_half_uncorrected IS STILL REACHABLE AND STILL ITS OWN AXIS.
// The money term promotes a standing mirror to shape_already_met. The axis it must NOT swallow is
// the one named for a mirror whose OCCURRENCE was corrected without it — because that mirror's
// money is in the NEXT period, not in the one being asked about.
// ---------------------------------------------------------------------------------------
test("x42.r9n1d a mirror whose occurrence was corrected without it still reads pair_half_uncorrected for the occurrence's own period — the money term does not swallow the axis it is not about", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r9n1d");
  const P = mon(-3);
  const tpl = await liveTemplate({
    client, label: "r9n1d auto", start: P.start, autoReverse: true,
    lines: accrualLines(500_000), memo: "r9n1d auto" });
  const r = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r.entry_id);
  const mir = await mirrorOf(r.entry_id);

  // FIXTURE SURGERY (a fifth of its kind, and it is the point of the axis): NO verb this
  // migration owns will correct one half of an auto pair — clara.reverse_entry refuses
  // adjustment_pair_locked precisely so that it cannot. The state is reachable only through a
  // door outside this migration (clara.approve_wrong_client_correction takes caller-named entry
  // ids), so the shortest honest staging is the direct one with user triggers silenced.
  // (A plpgsql DO block takes no bind parameters, so the entry id is interpolated — it is a uuid
  // this cell just read back from the DB, never caller text.)
  await rootQuery(`do $do$ declare o uuid := '${r.entry_id}'::uuid; v uuid; begin
      perform set_config('session_replication_role','replica',true);
      insert into clara.journal_entries(client_id, firm_id, status, posting_date, memo, origin,
          is_opening_balance, is_year_end, tax_affecting, maker_actor, last_human_editor,
          approved_at, checker_actor, reversal_of, reversal_reason)
        select e.client_id, e.firm_id, 'approved', e.posting_date, 'r9n1d half correction',
               'reversal', false, false, false, e.maker_actor, e.last_human_editor, now(),
               e.checker_actor, e.id, 'r9n1d'
          from clara.journal_entries e where e.id = o returning id into v;
      insert into clara.journal_lines(entry_id, firm_id, client_id, line_no, account_code,
          debit_cents, credit_cents)
        select v, l.firm_id, l.client_id, l.line_no, l.account_code, l.credit_cents, l.debit_cents
          from clara.journal_lines l where l.entry_id = o;
      update clara.journal_entries set reversed_by = v where id = o;
    end $do$;`);

  const gate = await gateFor(client, tpl.id, P);
  assert.equal(gate.axis, "pair_half_uncorrected",
    "the occurrence is corrected, the mirror is standing, and its money is in the NEXT period — this is the mixed set, not a met one");
  assert.equal(gate.entry_id, mir.id, "and the standing half it names is the mirror");

  // The mirror's OWN period is a different question, and there it IS met — by its own money.
  const NEXT = mon(-2);
  const gateNext = await gateFor(client, tpl.id, NEXT);
  assert.equal(gateNext, null,
    "…for the template's own shape the next month is sound: the mirror is the leg-swap and collides with nothing of it");
  const tRel = await liveTemplate({
    client, label: "r9n1d release", start: P.start,
    lines: accrualLines(500_000, { debit: ACCR, credit: EXPA }), memo: "r9n1d release" });
  const gateRel = await gateFor(client, tRel.id, NEXT);
  assert.equal(gateRel.axis, "shape_already_met",
    "…and for the SWAPPED shape it is met, because that is exactly where the mirror's money is");
  assert.equal(gateRel.entry_id, mir.id);

  // THE WIDEST READ (p_shape NULL, "every shape") sees the mirror in its money's period too.
  const wide = await gateWide(client, NEXT);
  assert.ok(wide, "the no-shape read is not blind to a mirror standing in the period its money is in");
});

// ---------------------------------------------------------------------------------------
// x42.r9n1e — OFF-PATH (WDB-R4): THE ONE LINE SHAPE WHOSE MIRROR COLLIDES WITH ITS OWN SUCCESSOR.
// A mirror is the leg-swap, so it is disjoint from its occurrence — UNLESS the template moves the
// same account in BOTH directions, in which case the shape SET is identical on both halves. That
// template can now only run once, and this cell pins the consequence with the refusal a reader
// actually gets, rather than leaving it to be discovered in production.
// ---------------------------------------------------------------------------------------
test("x42.r9n1e a DEGENERATE auto-reverse template that moves one account in both directions collides with its OWN mirror in month two — refused by name, with the colliding codes and the re-cut remedy stated", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r9n1e");
  const P = mon(-3), P2 = mon(-2);
  const tpl = await liveTemplate({
    client, label: "r9n1e degen", start: P.start, autoReverse: true,
    lines: [
      { account_code: EXPA, debit_cents: 300_000, credit_cents: 0, description: "gross" },
      { account_code: ACCR, debit_cents: 0, credit_cents: 300_000, description: "accrual" },
      { account_code: ACCR, debit_cents: 100_000, credit_cents: 0, description: "recharge back" },
      { account_code: EXPA, debit_cents: 0, credit_cents: 100_000, description: "recharge" },
    ], memo: "r9n1e degen" });

  const r1 = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: P.start, periodEnd: P.end });
  await approveDraft(w.users.alice, r1.entry_id);
  assert.equal(await glNet(client, EXPA, P.end), 200_000, "month one books its net charge once");

  const err = await runRefusal(client, tpl.id, P2);
  assert.ok(err, "month two is refused: the mirror moves the very same (account, side) elements");
  assert.equal(reasonToken(err), "period_shape_already_met");
  assert.deepEqual(JSON.parse(err.detail).colliding_elements,
    [ACCR + ":C", ACCR + ":D", EXPA + ":C", EXPA + ":D"],
    "all four elements are named — a template that debits AND credits an account collides with itself on every one");
  assert.match(err.message, /distinct account codes/,
    "and the remedy a reader can actually follow is stated: net the lines onto codes that do not overlap");
  assert.equal(await glNet(client, EXPA, P2.end), 200_000 - 200_000,
    "the month-two charge never posted; month one's release is all that moved");
});


// ---------------------------------------------------------------------------------------
// x42.r9n1j — THE COST CLAIM, PINNED AS THE STRUCTURAL FACT IT ACTUALLY RESTS ON.
//
// Round 9 (Codex finding 1) measured clara.adjustment_run_due at 2.48 s over 100 live templates x
// 6,000 recurring occurrences, and 17.8 s at 50,000 — one gate call per live template, each one
// scanning the client's whole stamped history. The in-source comment blamed a missing index, and
// this lane BUILT the index (a partial expression index on the normalised stamp span) and
// measured it: for a SUPERUSER it plans as a 199-row BitmapOr in 2.5 ms; for clara_fn_owner — the
// role the SECURITY DEFINER gate actually reads as — it collapses straight back to
// `Index Cond: client_id = $1` + `Rows Removed by Filter: 6000` at 14.8 ms, i.e. SLOWER than not
// having it. The index was therefore rejected, not shipped.
//
// The reason is structural, and it is the thing worth pinning: clara.journal_entries FORCES row
// security, so RLS applies to the table's owner too, and Postgres may only lift a qual into an
// INDEX CONDITION below a security barrier when that qual is LEAKPROOF. Every term of the gate's
// period predicate is built from jsonb extraction and regex matching, and none of those is
// leakproof. A future reader who "fixes" the cost by dropping force-RLS, or a future Postgres that
// marks these leakproof, changes the answer to a question this ladder has now spent a round on —
// so the facts are asserted rather than left in a comment.
// ---------------------------------------------------------------------------------------
test("x42.r9n1j the re-run gate's period predicate cannot be an index condition, and the reason is asserted from the catalog: journal_entries FORCES row security and every operator the predicate is built from is NOT leakproof", async (t) => {
  if (skipHere(t)) return;

  const rls = (await rootQuery(
    "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'clara.journal_entries'::regclass")).rows[0];
  assert.equal(rls.relrowsecurity, true, "clara.journal_entries has RLS enabled");
  assert.equal(rls.relforcerowsecurity, true,
    "…and FORCES it, so the SECURITY DEFINER gate reads under a security barrier as clara_fn_owner, not around it");

  const leak = Object.fromEntries((await rootQuery(
    `select p.proname, p.proleakproof from pg_proc p
      where p.proname in ('jsonb_object_field_text','jsonb_exists','textregexeq',
                          'uuid_eq','texteq','date_le','date_ge')
        and p.pronamespace = 'pg_catalog'::regnamespace`)).rows.map((r) => [r.proname, r.proleakproof]));
  for (const fn of ["jsonb_object_field_text", "jsonb_exists", "textregexeq"]) {
    assert.equal(leak[fn], false,
      `${fn} is NOT leakproof — a qual built from it can only ever be a FILTER under the barrier, never an Index Cond`);
  }
  for (const fn of ["uuid_eq", "texteq", "date_le", "date_ge"]) {
    assert.equal(leak[fn], true,
      `${fn} IS leakproof — client_id, status and posting_date are the only terms an index could ever bind here`);
  }

  // AND THE ONE LEAKPROOF BOUND THE SET CANNOT USE, stated so nobody re-derives it as "safe":
  // every member's posting_date is >= the caller's period_start (an occurrence is dated its own
  // period_end; a mirror period_end + 1), but the UPPER bound would need "no stamped period is
  // longer than the client's financial year" — true only while the cadence vocabulary stays
  // {monthly, annual} [WDB-G3]. This cell pins the vocabulary that bound would depend on, so a
  // third cadence cannot be added without the reader meeting this argument.
  const cadences = (await rootQuery(
    "select distinct cadence from clara.adjustment_templates order by 1")).rows.map((r) => r.cadence);
  for (const c of cadences) {
    assert.ok(["monthly", "annual"].includes(c),
      `cadence '${c}' is outside [WDB-G3]'s vocabulary — the gate's cost argument is written against exactly two`);
  }

  // [round-10 fix wave, lane O2; r10 Z3 finding 3 (F7), MEDIUM] THE OBSERVED-ROWS CHECK ABOVE IS
  // SOFT: it only ever sees a cadence a fixture actually inserted. MEASURED (probe
  // scratchpad/z3-schema-evasion.sql sibling technique): on a throwaway copy of this catalog,
  // `alter table clara.adjustment_templates drop constraint adjustment_templates_cadence_check,
  // add constraint adjustment_templates_cadence_check check (cadence = any (array['monthly',
  // 'annual', 'weekly']))` widens the vocabulary the CHECK actually bounds, yet the loop above
  // stays green (`ok 6`) because zero rows with cadence='weekly' exist at the moment it runs —
  // the vocabulary widening itself is invisible to an observed-rows-only pin. Pin the
  // CONSTRAINT'S OWN TEXT directly (pg_get_constraintdef), mirroring how S5.25 arm A pins the
  // forbidden-clock REGEX text rather than only observed function bodies — this half cannot be
  // defeated by fixture-ordering accidents the way the observed-rows half can.
  const cadenceCheck = (await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'clara.adjustment_templates'::regclass
        and conname = 'adjustment_templates_cadence_check'`)).rows[0]?.def;
  assert.equal(cadenceCheck, "CHECK ((cadence = ANY (ARRAY['monthly'::text, 'annual'::text])))",
    "the CHECK constraint's own text must still bound cadence to exactly {monthly, annual} — a widened constraint changes [WDB-G3]'s cost argument even before any row uses the new value, and the observed-rows loop above cannot see that moment");
});
