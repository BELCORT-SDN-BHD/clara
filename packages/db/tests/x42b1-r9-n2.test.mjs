// ===========================================================================
// [WAVE D-b SPLIT — D-b1 (0043, staff advances)] A FORK OF `x42-r9-n2.test.mjs`.
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
// CELLS HERE (1): x42.r9n2.f1-census
// CELLS IN THE SIBLING FORK(S): b0 → D-b0; b3 → D-b3
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b01 (… + 0043)
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
// F1, WDB-R2/WDB-R4 CLASS CLOSURE — census every reversal-path CLR40 refusal SITE
// `_tf_adv_movement_belt` can raise, and require a mirroring arm inside
// `_adv_reversal_admission` carrying the SAME (reason, axis) pair AND consulting the same
// books. DB-only (reads pg_proc), no fixture: this cell fails the moment a SIXTH un-mirrored
// wall appears, rather than proving only the fifth round 9 found.
// ===========================================================================
test("x42.r9n2.f1-census every reversal-path CLR40 refusal SITE the belt can raise has a mirroring (reason, axis) arm inside _adv_reversal_admission that reads the same books — a SIXTH un-mirrored wall must fail this cell, INCLUDING one that reuses an existing axis [round-10 fix wave: widened by lane O2 per r10 Z2 finding 6 to enumerate every reversal-scoped guard and judge every raise on its own text; widened again by lane O3 per Codex r10 finding 2 from axis SETS to refusal SITES]", async (t) => {
  if (skipHere(t)) return;

  // --- (0) SELF-TEST against the synthetic shapes MEASURED to evade the two previous
  // generations of this scanner, before trusting it against the live belt.
  const CONTROL = `
    if new.reversal_of is not null then
      if r.debit_cents > 0 then
        v_backed := exists (select 1 from clara.staff_advance_applications ap where ap.id = r.line_id);
      end if;
      if v_backed then continue; end if;
      raise exception 'x' using errcode = 'CLR40', detail = jsonb_build_object('reason', 'advance_movement_unregistered', 'axis', 'unregistered_mirror')::text;
    end if;`;
  const ARMS = [{ reason: "advance_movement_unregistered", axis: "unregistered_mirror", relations: ["staff_advance_applications"] }];
  {
    const v = censusVerdict(refusalSites(CONTROL), ARMS);
    assert.deepEqual([v.nonLiteral, v.unmirrored, v.underConsulted, v.overSited], [[], [], [], []],
      "control: the live-shaped guard must census clean against an arm carrying its pair");
  }
  // (B) a NEW axis alongside the original inside the SAME block — worked before round 10.
  {
    const shapeB = CONTROL.replace("raise exception 'x'",
      "raise exception 'y' using errcode = 'CLR40', detail = jsonb_build_object('reason', 'jumbo', 'axis', 'jumbo_mirror_leg')::text;\n      raise exception 'x'");
    assert.deepEqual(censusVerdict(refusalSites(shapeB), ARMS).unmirrored, ["jumbo|jumbo_mirror_leg"],
      "(B) a second, differently-axed raise inside the SAME reversal block must be seen");
  }
  // (C) a SECOND, separate reversal guard with a COMPOUND condition — r10 Z2's evasion.
  {
    const shapeC = `${CONTROL}
    if new.reversal_of is not null and r.account_code like '350%' then
      raise exception 'z' using errcode = 'CLR40', detail = jsonb_build_object('reason', 'compound', 'axis', 'compound_leg')::text;
    end if;`;
    assert.deepEqual(censusVerdict(refusalSites(shapeC), ARMS).unmirrored, ["compound|compound_leg"],
      "(C) a compound-condition reversal guard must be found as its OWN block");
  }
  // (E) a reversal-path CLR40 raise with NO axis key — r10 Z2's evasion.
  {
    const shapeE = "\n    if new.reversal_of is not null then\n      raise exception 'no axis' using errcode = 'CLR40', detail = jsonb_build_object('reason', 'something')::text;\n    end if;";
    const v = censusVerdict(refusalSites(shapeE), ARMS);
    assert.equal(v.nonLiteral.length, 1, "(E) a reversal-path CLR40 raise naming no axis must be flagged");
    assert.match(v.nonLiteral[0], /axis:absent/, "(E) must be reported as an ABSENT axis, by that name");
  }
  // (D) CODEX'S r10 MUTATION — a sixth un-mirrored wall with a NEW reason and the EXISTING
  // axis. MEASURED green under BOTH previous scanners (probe o3/p3-census-axis-reuse.mjs);
  // this is the capability this widening exists for.
  {
    const shapeD = CONTROL.replace("raise exception 'x'",
      "raise exception 'sixth' using errcode = 'CLR40', detail = jsonb_build_object('reason', 'advance_leg_unbacked_by_particulars', 'axis', 'unregistered_mirror')::text;\n      raise exception 'x'");
    assert.deepEqual(censusVerdict(refusalSites(shapeD), ARMS).unmirrored,
      ["advance_leg_unbacked_by_particulars|unregistered_mirror"],
      "(D) a sixth wall REUSING an existing axis under a new reason must go RED — Codex r10 finding 2's own mutation");
  }
  // (F) THE DYNAMIC AXIS, named for what it is rather than mislabelled a bare raise.
  {
    const shapeF = CONTROL.replace("'axis', 'unregistered_mirror'", "'axis', v_axis");
    const v = censusVerdict(refusalSites(shapeF), ARMS);
    assert.equal(v.nonLiteral.length, 1);
    assert.match(v.nonLiteral[0], /axis:dynamic/, "(F) a computed axis must be reported as DYNAMIC, not as a missing key");
  }
  // (G) THE SAME PAIR AT MORE SITES THAN THE ADMISSION BODY HAS ARMS — the narrowest thing a
  // text census can still say about a wall that clones an existing pair outright.
  {
    const shapeG = CONTROL.replace("raise exception 'x'",
      "raise exception 'clone' using errcode = 'CLR40', detail = jsonb_build_object('reason', 'advance_movement_unregistered', 'axis', 'unregistered_mirror')::text;\n      raise exception 'x'");
    assert.equal(censusVerdict(refusalSites(shapeG), ARMS).overSited.length, 1,
      "(G) two belt sites sharing one pair against ONE admission arm must go red on the site count");
  }

  // --- (1) THE LIVE BELT AND THE LIVE ADMISSION BODY.
  const belt = (await rootQuery(
    "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname='_tf_adv_movement_belt'",
  )).rows[0]?.prosrc;
  assert.ok(belt, "clara._tf_adv_movement_belt must exist — the census would prove nothing over an absent body");
  const admission = (await rootQuery(
    "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname='_adv_reversal_admission'",
  )).rows[0]?.prosrc;
  assert.ok(admission, "clara._adv_reversal_admission must exist");

  const sites = refusalSites(belt);
  const arms = admissionArms(admission);
  assert.ok(sites.length >= 1, "the belt's reversal-only branch must state at least one CLR40 refusal today — an empty census proves nothing");
  const v = censusVerdict(sites, arms);
  assert.deepEqual(v.nonLiteral, [],
    `every reversal-path CLR40 raise in the live belt must name a LITERAL reason and axis — otherwise no census can mirror it: ${v.nonLiteral.join(" | ")}`);
  assert.deepEqual(v.unmirrored, [],
    `every (reason, axis) pair the belt can raise on a reversal path must be carried CO-LOCATED by an arm of _adv_reversal_admission — un-mirrored: ${v.unmirrored.join(", ")} (the exact WDB-R2 defect class round 9 found; a NEW wall that never joins the admission body must fail HERE, not wait for a round-11 lens)`);
  assert.deepEqual(v.underConsulted, [],
    `an admission arm must read the same books its belt site's guard tests — otherwise it agrees on the token and disagrees on the evidence: ${v.underConsulted.join(" | ")}`);
  assert.deepEqual(v.overSited, [],
    `a (reason, axis) pair may not be raised at more belt sites than the admission body has arms for it: ${v.overSited.join(" | ")}`);
  noteLane(`f1-census (site-level, r10 O3): ${sites.length} belt refusal site(s), pairs {${v.pairs.join(", ")}}, ${arms.length} admission arm(s); zero un-mirrored, zero under-consulted, zero over-sited, zero non-literal`);
});
