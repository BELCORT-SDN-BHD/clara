// ===========================================================================
// [WAVE D-b SPLIT — D-b0 (0042, shared authorities)] A FORK OF `x42-r9-n2.test.mjs`.
//
// E21 RESIDUAL (ERRATA-E19-E25.md): R3's handoff ruled this file fully green at
// D-b3 and forking it OPTIONAL; four of its seven cells are green EARLIER, and this
// fork executes the remedy E21 named and quantified but did not perform. THE SPLIT
// MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is byte-for-byte
// the block of the same name in x42-r9-n2.test.mjs; the prologue (imports, world
// builder, before/after, module-level helpers) is byte-for-byte the original's and
// is shared by every fork of this file. The ONLY authored bytes in this file are
// this banner.
//
// CELLS HERE (3): x42.r9n2.f3, x42.r9n2.f6, x42.r9n2.f7
// CELLS IN THE SIBLING FORK(S): b1 → D-b1; b3 → D-b3
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0 (0041 template + 0042)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-r9-n2.test.mjs lands with its own slice.
// ===========================================================================
// 0042 Wave D-b — as-built ladder ROUND-9 FIX WAVE, lane N2: THE FIFTH WALL, MIRRORED, AND
// THE WIDENED CLOCK CENSUS.
//
// Two independent findings from round 9 (session 651d02fc; ladder-r9-record.md), fixed in
// s3-advances.sql and s5-residuals.sql respectively:
//
//   F1 (Y2, HIGH, r9 finding 3) — `_tf_adv_movement_belt` door (c)'s `unregistered_mirror`
//   refusal was a FIFTH advance-side reversal wall that neither `_adv_reversal_admission` nor
//   the S4.6A release report modelled, so the report handed out `clara.reverse_entry` as a
//   remedy on a booking the register refuses at approval. Fixed by a new arm (1c) in
//   `_adv_reversal_admission`, mirroring the belt's own evidence test predictively off the
//   ORIGINAL entry's lines. CELLS 1-4 below reproduce the defect's own probe (finder Y2's
//   p1-fifth-wall.mjs) as durable assertions and, per WDB-R2/WDB-R4, CLOSE THE CLASS: a census
//   cell that fails the moment a sixth un-mirrored wall appears, rather than one that only
//   proves this one wall.
//
//   F3 (Y3, HIGH, r9 finding 5, instrument) — S5.25 arm (A)'s forbidden-clock-cast census was
//   evadable by FOUR syntactically-legal, semantically-identical-to-`now()::date` spellings
//   (`CAST(now() AS date)`, `date(now())`, a double-parenthesised call, an indirect cast
//   through an intermediate type) — a real, measured coverage hole in a money-date-correctness
//   gate, zero live occurrences today. CELL 5 re-derives the WIDENED v_forbidden pattern
//   independently (the x42-s5c-clock.test.mjs.5 "forward ratchet" precedent, kept duplicated on
//   purpose so a drift between the migration's own copy and this one is itself a finding) and
//   proves it against the LIVE catalog, positive and negative.
//
//   F7 (Codex, LOW, r9 finding 3, instrument) — the S5.26/S5.27 throwaway-proof header claimed
//   the insert-then-delete cycle left the schema "byte-identical"; Codex measured that
//   OVERSTATED (physical tuple/page churn is real and untouched). CELL 6 pins the narrower,
//   honest claim (logical/catalog/sequence cleanliness only) as its own positive proof.
//
//   F6 (Y1, LOW, r9 finding 9) — under a mid-month FYE, the ANNUAL depreciation run receipt
//   (exact-day, S5.26) and its own charge rows (month-grain, S5.27) name INCOHERENT windows —
//   both correct, individually, and tying to the cent, but nothing states the law that makes
//   that true. CELL 7 pins the documented, deliberate shape (s5-residuals.sql's own new
//   comment, right above clara._fa_fy_month_open_for) as a NAMED fact, not a silent gap — the
//   smallest honest, text/documentation-only fix (no persisted column, no RPC envelope, no
//   charge arithmetic touched; the CLAMPING alternative Y1 also named is a real code change
//   left for the owner at round 10, reported not attempted here).
//
// CONTRACT-BLIND POSTURE: this file asserts from the round-9 ladder record's OWN measured
// findings and fix directions (docs/plan/completed/wave-d-b-design.md's WDB-R1..R4 + the recovered
// ladder-r9-record.md), never from re-reading the fix's own SQL after the fact — every assert
// below is what the FINDING says must now be true, not a description of what the code happens
// to do.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane, rootQuery,
} from "./a21-helpers.mjs";
import {
  af2World, freshAf2Client, openException, plainAt, unmatchBankMatch,
  enrolStaffAdvanceAccount, matchIdOf, reverseEntry,
  af2SubstrateReady, skipAf2, BANKCOA, ADVCODE, EXPN,
} from "./x42-af2-world.mjs";
import { pastBankLine, block, resolveAndBookAck, openExceptionOf, retireStaffAdvanceAccount } from "./x42-r8-seam-kit.mjs";
import { x42S5Ready, x42S5SkipHere } from "./x42-s5-helpers.mjs";
import { refusalSites, admissionArms, censusVerdict } from "./x42-r10-o3-kit.mjs";
import {
  faWorld, freshFaClient, setClientFyEnd, buyAsset, completeRB, liveAuthority, drainDue,
  chargeRows, runRows, mon,
} from "./x41-fa-world.mjs";

let live = false;
let world = null;
let liveFa = false;

before(async () => {
  live = await af2SubstrateReady();
  if (live) world = await af2World();
  liveFa = await x42S5Ready();
});

after(async () => {
  printLaneNotes("x42-r9-n2");
  printSkipCount("x42-r9-n2");
  await endPool();
});

const skipHere = (t) => skipAf2(t, live, "the round-9 fix-wave N2 battery (fifth wall + clock census)");
const skipHereFa = (t) => x42S5SkipHere(t, liveFa);
const caught = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const axisOf = (err) => /"axis"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;
const reasonOf = (err) => /"reason"\s*:\s*"([a-z0-9_]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;

// ===========================================================================
// F3 [round-9 fix wave, lane N2; r9 finding 5, HIGH] — THE WIDENED FORBIDDEN-CLOCK CENSUS,
// RE-DERIVED INDEPENDENTLY (the x42-s5c-clock.test.mjs.5 "forward ratchet" precedent, kept
// duplicated on purpose: a drift between this copy and the migration's own v_forbidden is
// itself a finding). Proves the four round-9-measured evasions are now caught, that the
// pre-round-9 controls still hold, and that the widening itself introduces no false positive
// against the LIVE catalog.
// ===========================================================================
test("x42.r9n2.f3 the widened forbidden-clock detector catches all four round-9 measured evasions, keeps every pre-round-9 control, and fires on ZERO live clara objects", async (t) => {
  if (skipHere(t)) return;
  const CLOCKFN = "(now\\(\\)|current_timestamp|localtimestamp|clock_timestamp\\(\\)"
    + "|statement_timestamp\\(\\)|transaction_timestamp\\(\\))";
  const FORBIDDEN =
    "(\\mcurrent_date\\M|\\mcurrent_time\\M|\\mlocaltime\\M|\\mlocaltimestamp\\M"
    + "|\\(*" + CLOCKFN + "\\)*([[:space:]]*::[[:space:]]*[a-z_][a-z0-9_]*)*[[:space:]]*::[[:space:]]*date"
    + "|\\mcast[[:space:]]*\\([[:space:]]*" + CLOCKFN + "[[:space:]]+as[[:space:]]+date[[:space:]]*\\)"
    + "|\\mdate[[:space:]]*\\([[:space:]]*" + CLOCKFN + "[[:space:]]*\\))";

  // (0a) THE FOUR ROUND-9 EVASIONS, POSITIVE.
  const ev = (await rootQuery(
    `select ('select cast(now() as date)' ~* $1) as e1,
            ('select date(now())' ~* $1) as e2,
            ('select ((now()))::date' ~* $1) as e3,
            ('select now()::timestamp::date' ~* $1) as e4`, [FORBIDDEN])).rows[0];
  assert.deepEqual([ev.e1, ev.e2, ev.e3, ev.e4], [true, true, true, true],
    "the widened detector must catch all four round-9 measured evasions (CAST(...AS date), date(...), double-parenthesised, indirect double-cast)");

  // (0b) NEGATIVE CONTROLS FOR THE WIDENING ITSELF — a CAST/date(...) call on something other
  // than a clock token, and a cast chain that never reaches ::date, must stay exempt.
  const neg = (await rootQuery(
    `select ('select cast(v_period_end as date)' ~* $1) as n1,
            ('select cast(now() as text)' ~* $1) as n2,
            ('select date(v_declared_timestamp)' ~* $1) as n3,
            ('select now()::text::varchar' ~* $1) as n4`, [FORBIDDEN])).rows[0];
  assert.deepEqual([neg.n1, neg.n2, neg.n3, neg.n4], [false, false, false, false],
    "the widening must not fire on a CAST/date(...) call whose argument is not a clock token, or a cast chain that never reaches ::date");

  // (0c) THE PRE-ROUND-9 CONTROLS MUST STILL HOLD — bare tokens, the single ::date cast, the
  // deparsed paren-wrapped shape, and the lawful explicitly-zoned cast (raw or deparsed).
  const pre = (await rootQuery(
    `select ('select current_date' ~* $1) as p1, ('select now()::date' ~* $1) as p2,
            ('select localtimestamp' ~* $1) as p3, ('(now())::date' ~* $1) as p4,
            ('select (now() at time zone ''utc'')::date' ~* $1) as z1,
            ('select current_dates_view' ~* $1) as z2,
            ('((now() AT TIME ZONE ''Asia/Kuala_Lumpur''::text))::date' ~* $1) as z3`, [FORBIDDEN])).rows[0];
  assert.deepEqual([pre.p1, pre.p2, pre.p3, pre.p4], [true, true, true, true],
    "every pre-round-9 positive control must still match after the widening");
  assert.deepEqual([pre.z1, pre.z2, pre.z3], [false, false, false],
    "every pre-round-9 negative control (explicitly-zoned casts, a merely-containing identifier) must stay exempt after the widening");

  // (A) THE LIVE CATALOG, WIDENED — zero clara functions today, on the shipped migration.
  const stripWide = "lower(regexp_replace(regexp_replace(regexp_replace(coalesce(prosrc,'')||coalesce(pg_get_functiondef(oid),''),'/\\*[\\s\\S]*?\\*/','','g'),'--[^\\n]*','','g'),'\\s+',' ','g'))";
  const fns = (await rootQuery(
    `select coalesce(string_agg(proname, ', ' order by proname),'') as n from pg_proc
      where pronamespace='clara'::regnamespace and ${stripWide} ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(fns, "", `the WIDENED detector must fire on zero live clara functions: ${fns}`);
});

// ===========================================================================
// [round-9 fix wave, lane N2; Codex r9 finding 3, LOW] THE S5.26/S5.27 THROWAWAY-PROOF WORDING
// — pinning the LOGICAL half only. The migration's own comments used to claim the insert-then-
// delete throwaway firm/client left the schema "byte-identical" — Codex measured that
// OVERSTATED: logically/catalog clean (zero residual business/audit rows, no sequence advance)
// but physical tuple/page-level churn (an MVCC dead tuple until VACUUM, table statistics
// counters) is real and untouched by this proof. The wording in s5-residuals.sql now says
// "logically clean" and states the physical-churn exclusion explicitly. THIS CELL is the
// narrower, honest claim's OWN positive proof — a fresh throwaway firm+client insert+delete
// cycle, independent of which branch the migration's own build-time postcheck took, measured
// at exactly the LOGICAL/catalog/sequence grain the corrected wording claims and NOTHING wider
// (no pg_stat_* / heap-page assertion here — that is explicitly out of scope, not silently
// dropped).
// ===========================================================================
test("x42.r9n2.f7 the throwaway firm/client insert+delete cycle is LOGICALLY clean for ITS OWN rows (zero residual audit/domain-event rows attributable to this firm_id) — scoped to the fixture, not a whole-database before/after [round-10 fix wave, lane O2: r10 Z2 finding 6 (F6), LOW — the pre-round-10 whole-table version MEASURED red (3941 !== 3900) under a concurrent audited write elsewhere in the shared CI database, the #62 class]", async (t) => {
  if (skipHere(t)) return;

  const ins = await rootQuery(
    `insert into clara.firms (name) values ('x42.r9n2.f7 throwaway -- deleted below') returning id`);
  const firmId = ins.rows[0].id;
  const insC = await rootQuery(
    `insert into clara.clients (firm_id, name) values ($1, 'x42.r9n2.f7 throwaway -- deleted below') returning id`,
    [firmId]);
  const clientId = insC.rows[0].id;
  await rootQuery("delete from clara.clients where id=$1", [clientId]);
  await rootQuery("delete from clara.firms where id=$1", [firmId]);

  // SCOPED to THIS firm_id — both tables carry it as a plain, not-null, non-FK-enforced
  // column, so a concurrent writer touching ANY OTHER firm cannot move this count, unlike the
  // whole-table before/after this replaces.
  const scoped = await rootQuery(
    `select (select count(*) from clara.audit_log where firm_id=$1)::int as audit_log,
            (select count(*) from clara.domain_events where firm_id=$1)::int as domain_events`,
    [firmId]);
  assert.equal(scoped.rows[0].audit_log, 0, "zero audit rows attributable to THIS firm_id — the insert+delete carries no audit trigger");
  assert.equal(scoped.rows[0].domain_events, 0, "zero domain-event rows attributable to THIS firm_id");

  // [round-10, F6 LOW] The whole-database audit_log_id_seq before/after equality the
  // pre-round-10 version asserted is DROPPED here, not weakened — a sequence has no firm_id, so
  // it is the one part of this cell that structurally CANNOT be scoped to a fixture. CI runs
  // `pnpm -r --if-present test` against ONE shared postgres:17 service with workspace
  // concurrency unpinned (MEASURED, r10 Z2 finding 6: the runtime package's own DB-touching
  // cells write clara.audit_log rows in the same window), so ANY concurrent audited write
  // anywhere in the database — not only in this file — moved the sequence and failed the old
  // assertion on an otherwise-green build. The scoped audit_log count above already proves the
  // fact this check existed to support (this specific insert+delete cycle triggers no audit
  // row of its own) without assuming exclusive access to the database.
  const gone = await rootQuery(
    "select (exists(select 1 from clara.clients where id=$1) or exists(select 1 from clara.firms where id=$2)) as survived",
    [clientId, firmId]);
  assert.equal(gone.rows[0].survived, false, "neither row may survive its own deletion");
});

// ===========================================================================
// F6 [round-9 fix wave, lane N2; r9 finding 9, LOW, Y1] — THE RECEIPT/REGISTER WINDOW
// INCOHERENCE, PINNED. Reproduces Y1's own money probe (p2-fy-money.mjs) as a durable
// assertion: under a mid-month FYE (6,15) on an ANNUAL reducing-balance cadence, every charge
// row's own period_start/period_end lies OUTSIDE the exact-day window its own run receipt
// claims — S5.26's receipt window is exact-day, S5.27's charge window is month-grain, both
// correct, both tying to the cent, and the incoherence between their LABELS is now a named,
// documented fact (s5-residuals.sql, the comment immediately above
// clara._fa_fy_month_open_for) rather than a silent gap a reviewer must infer. This cell
// PINS the documented shape — it is a positive proof of a KNOWN, deliberate incoherence, not a
// red asking someone to "fix" it; a change to EITHER direction (the incoherence silently
// disappearing, or the money no longer tying) is what would make this cell fail.
// ===========================================================================
test("x42.r9n2.f6 [documented, not a defect] a mid-month-FYE annual reducing-balance charge row's own period lies outside its receipt's exact-day window, and the money still ties to the cent", async (t) => {
  if (skipHereFa(t)) return;
  const w = await faWorld();
  const sub = w.users.alice;
  const client = await freshFaClient("r9n2f6");
  await setClientFyEnd(sub, { client, month: 6, day: 15 });
  await liveAuthority(client, "annual");
  const start = mon(-14);
  const { asset } = await buyAsset({ client, cents: 1_000_000, postingDate: start.start });
  await completeRB(client, asset.id, { life: 60, rateBps: 2000, start: start.start });
  const receipts = await drainDue(client);
  assert.ok(receipts.length >= 1, "at least one annual run receipt must post");

  const runs = await runRows(client);
  const rows = await chargeRows(asset.id);
  assert.ok(rows.length >= 1, "at least one charge row must post");

  let outOfPeriod = 0;
  for (const r of rows) {
    const own = runs.find((x) => String(x.entry_id) === String(r.entry_id));
    assert.ok(own, `charge row ${r.id} must belong to a real run receipt`);
    const inside = String(r.period_start).slice(0, 10) >= String(own.period_start).slice(0, 10)
      && String(r.period_end).slice(0, 10) <= String(own.period_end).slice(0, 10);
    if (!inside) outOfPeriod += 1;
  }
  // THE DOCUMENTED FACT, PINNED: every mid-month-FYE annual charge row lies outside its own
  // receipt's exact-day window — this is the s5-residuals.sql comment's own claim, proven
  // here rather than merely asserted in prose.
  assert.equal(outOfPeriod, rows.length,
    `every charge row is expected to lie outside its receipt's exact-day window under a mid-month FYE (documented, s5-residuals.sql above clara._fa_fy_month_open_for) — got ${outOfPeriod}/${rows.length} out-of-period; if this is now 0, the incoherence was silently closed and the documentation is stale; if it is a PARTIAL count, something regressed`);

  // THE MONEY STILL TIES — the incoherence is a LABEL problem, never a cents problem: no
  // month charged twice, no month skipped.
  const months = rows.map((r) => String(r.period_start).slice(0, 7)).sort();
  const dup = months.filter((m, i) => months[i - 1] === m);
  assert.deepEqual([...new Set(dup)], [], "no month may be charged twice across the FY boundary");
  noteLane(`f6: ${outOfPeriod}/${rows.length} charge rows outside their receipt's exact-day window (documented, expected under a mid-month FYE); months charged: ${months.join(",")}`);
});
