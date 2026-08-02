// 0041 Wave D-a — the ROUND-3.5 fix-ledger battery, part C: THE TIE AS A PRE-FLIGHT
// INSTRUMENT (fix ledger G3 + G7 shapes (c)/(d)).
//
//   x41.s5  G3 — the K6 opening-correction hand-off: `approve_opening_correction`
//           supersedes a carry-down register row, and the corrected PREDECESSOR must
//           leave the as-of window. It only can if the hand-off stamps `superseded_at`,
//           so the cell also censuses the whole register for the NULL.
//   x41.s4  G7(c) — the WHOLE-DB `fa_register_tie` sweep, at THREE as-ofs, through the
//           production instrument, with an explicit NAMED allow-list. Unexplained reds
//           must be EMPTY; an explained red must belong to a fixture named right here.
//           [ROUND-4.6] A tie REFUSAL is held to the same bar and one class narrower:
//           zero, save the single deliberately over-cap lineage x41.u4 leaves standing
//           to prove the ratified 64-hop boundary — and that one must PROVE itself
//           over-cap against the register before it is excused.
//
// WHY. `fa_register_tie` is the wave's assertion instrument and WD-R14's pre-flight: a
// professional who meets one false red stops trusting the green ones. Per-fixture tie
// cells cannot see a break that a DIFFERENT lane's writer causes — the K6 hand-off lives
// in 0017 and double-counted every corrected carry-down at EVERY as-of, on exactly the
// real-client shape acceptance will run, and no cell in the battery saw it. A sweep with
// a named allow-list is the cheapest instrument that does.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, noteLane, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  wb, COST, ACCUM, EXPENSE, mon, dayIn, anyKey,
  faRegisterTie, listFixedAssets, assetRowsOf, tieAccts, tieSumBy,
  faWorld, faRow, faRows, glNet, entryRowOf, openingItemRowsOf, kSeededFaClient,
  tieSweep, sweepAccountRows, isRed, isExplained, openReversalWindows, inReversalWindow,
} from "./x41-round35-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round35-tie");
  printSkipCount("x41-round35-tie");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3.5 tie-instrument battery");

// ---------------------------------------------------------------------------
// THE ALLOW-LIST. Minimal and NAMED: every entry is a fixture this repo builds on
// purpose, matched by the client NAME its own cell chose (the ids are per-run uuids).
// A red that no entry here explains is a DEFECT, not an exception.
// ---------------------------------------------------------------------------

const ALLOWED_RED = [
  {
    match: /^x41_r3_/,
    why: "x41.r3's DELIBERATE pre-enrolment fixture — GL history approved on the cost account BEFORE anyone enrolled it. §1.2's watermark forbids a retroactive birth and there is no back-fill door, so the register HONESTLY holds less than the GL; the tie's own pre-enrolment column reports the whole residue (F9), which is why this red is EXPLAINED and never unexplained.",
  },
];

const allowedBy = (name) => ALLOWED_RED.find((a) => a.match.test(name ?? ""));

// ---------------------------------------------------------------------------
// [ROUND-4.6] THE REFUSAL ALLOW-LIST — a SEPARATE list from ALLOWED_RED (which
// governs differences), and EVIDENCE-GATED rather than name-gated.
//
// WHY IT EXISTS. Round-4.6 adjudication 4 aligned `_fa_disposal_stub`'s local walk
// with both other lineage readers: exactly 64 edges admitted, the 65th refused
// `fa_lineage_too_deep`. x41.u4 proves the FAR side of that boundary, and the only
// way to show it is to leave a real 65-edge lineage standing — `revise_fixed_asset_
// particulars` mints the 65th edge and no verb unwinds a revision, so from then on
// `fa_register_tie` refuses for that fixture client permanently. On a FRESH database
// — CI's model, and acceptance's — s4 runs before u4 and sees nothing at all; only a
// re-run of the same rig meets it.
//
// WHY IT IS STILL AN INSTRUMENT. The round-4 hardening below (errors must be ZERO)
// stands for every other client: a book the tie cannot answer for is a book nobody
// can assert, and it must never be demoted to a lane note. This ONE class is named
// AND PROVEN — the client must really hold a lineage past the ratified cap, measured
// against the register itself. A refusal that merely carries the fixture's name, or
// names a different cause, is still a DEFECT.
// ---------------------------------------------------------------------------

const ALLOWED_REFUSAL = [
  {
    match: /^x41_u4_/,
    err: /exceeds 64 supersede hops/,
    why: "x41.u4's DELIBERATE over-cap lineage — the 65th edge that proves the ratified 64-hop cap (round-4.6 adjudication 4). Verified over-cap against the register, never taken on the name.",
  },
];

/** The deepest supersede chain (in EDGES) this client holds, read off the register. */
async function deepestLineage(client) {
  const r = await rootQuery(
    `with recursive chain(id, hops) as (
       select f.id, 0
         from clara.fixed_assets f
        where f.client_id = $1
          and not exists (select 1 from clara.fixed_assets p where p.superseded_by_asset_id = f.id)
       union all
       select f.superseded_by_asset_id, c.hops + 1
         from chain c
         join clara.fixed_assets f on f.id = c.id
        where f.superseded_by_asset_id is not null
     )
     select coalesce(max(hops), 0)::int as hops from chain`,
    [client],
  );
  return Number(r.rows[0].hops);
}

// ===========================================================================
// x41.s5 — THE K6 HAND-OFF LEAVES THE AS-OF WINDOW (G3).
// ===========================================================================

test("x41.s5 approve_opening_correction hands the register over: the corrected predecessor is stamped superseded_at and leaves every as-of, so the register reads ONCE and ties to the GL", async (t) => {
  if (skipHere(t)) return;
  const k = await kSeededFaClient("s5");
  assert.equal((await faRows(k.client)).length, 1, "mandatory setup: the carry-down client starts with exactly one register row");
  const items = await openingItemRowsOf(k.seed);
  const faItem = items.find((i) => i.item_kind === "fixed_asset");
  assert.ok(faItem, "mandatory setup: the approved seed carries a fixed_asset item to correct");

  // The K6 two-step, on an asset whose D-a lifecycle has NOT advanced — the lawful,
  // everyday correction (a wrong useful life on a carried register). Cost and carried
  // accumulated are UNCHANGED so the seed still ties to its own parsed targets; the
  // correction is to the LIFE alone.
  const superseded = await wb.supersedeOpeningItem(w.users.bob, {
    item: faItem.id,
    replacement: {
      item: { item_kind: "fixed_asset", item_key: `${faItem.item_key}:v2` },
      asset: {
        description: "Delivery van (x41 s5 corrected life)", acquired_date: mon(-24).start,
        cost_cents: k.cost, useful_life_months: 84, depreciation_method: "straight_line",
        asset_account_code: COST, accum_depr_account_code: ACCUM, depr_expense_account_code: EXPENSE,
        accumulated_depreciation_cents: k.accum, depreciation_start_date: mon(-24).start,
        residual_cents: 0, item_key: `${faItem.item_key}:v2`,
      },
    },
    opKey: opk("x41s5sup"),
  });
  assert.ok(superseded?.replacement_entry_id, "the supersede DRAFTED a replacement (the K6 two-step)");
  const revs = await wb.revMapOf([
    { entry_id: superseded.reversal_entry_id, revision_token: superseded.reversal_revision_token },
    {
      entry_id: superseded.replacement_entry_id,
      revision_token: (await entryRowOf(superseded.replacement_entry_id)).revision_token,
    },
  ]);
  await wb.approveOpeningCorrection(w.users.hana, { seed: k.seed, entryRevisions: revs, opKey: opk("x41s5apr") });

  // ---- The register hand-off itself.
  const rows = await faRows(k.client);
  assert.equal(rows.length, 2, `the correction minted the v2 carry-down beside the original (got ${rows.length} rows)`);
  const pred = await faRow(k.assetId);
  const succ = rows.find((r) => r.id !== k.assetId);
  assert.equal(pred.status, "superseded", "the corrected predecessor is superseded");
  assert.equal(pred.superseded_by_asset_id, succ.id, "…and names its replacement");
  assert.ok(pred.superseded_at,
    "…AND carries superseded_at (G3). Without it `_fa_included_at` keeps the predecessor in the register at EVERY as-of and the whole register reads 2× on books that are exactly right — with every explained column at zero.");
  const corrDate = (await entryRowOf(succ.acquisition_entry_id)).posting_date;
  assert.equal(String(pred.superseded_at), String(corrDate),
    `superseded_at is the CORRECTION entry's own accounting date (${corrDate}), never a transaction timestamp — the as-of window is an accounting fact`);
  noteLane(`x41.s5 the K6 hand-off stamped superseded_at=${pred.superseded_at} and the v2 row is '${succ.status}'`);

  // ---- The instrument. The GL nets to ONE asset across the three entries; so must the
  // register, at every as-of at or after the correction posted.
  const glCost = await glNet(k.client, COST, dayIn(mon(0), 1));
  assert.equal(glCost, k.cost, `mandatory cross-check: the GL nets to one asset's cost (${k.cost}) across original + reversal + replacement`);
  for (const [label, asOf] of [
    ["the correction's own posting date", String(corrDate)],
    ["a month after the correction", mon(-1).end],
    ["today", dayIn(mon(0), 1)],
  ]) {
    const tie = await faRegisterTie(w.users.alice, k.client, asOf);
    const accts = tieAccts(tie, COST);
    assert.ok(accts.length >= 1, `${label}: the enrolled cost account appears in the tie`);
    assert.equal(tieSumBy(accts, /^register_cost/, "the tie register cost"), k.cost,
      `${label} (${asOf}): the register reports ONE asset's cost, not the predecessor plus its replacement`);
    assert.equal(tieSumBy(accts, /^register_accum/, "the tie register accumulated"), k.accum,
      `${label} (${asOf}): …and ONE asset's carried accumulated`);
    assert.equal(tieSumBy(accts, /^cost_diff/, "the tie cost difference"), 0, `${label}: cost difference EXACTLY zero`);
    assert.equal(tieSumBy(accts, /^accum_diff/, "the tie accumulated difference"), 0, `${label}: accumulated difference EXACTLY zero`);
    assert.equal(tie.tie, true, `${label}: fa_register_tie is GREEN (got ${JSON.stringify(tie.accounts ?? tie)})`);
  }

  // The read surface the professional actually opens agrees.
  const listed = assetRowsOf(await listFixedAssets(w.users.alice, k.client));
  const shown = listed.filter((r) => r.id === k.assetId || r.id === succ.id);
  noteLane(`x41.s5 list_fixed_assets shows ${shown.length} row(s) of the corrected pair (statuses: ${shown.map((r) => r.status).join(", ")})`);

  // ---- The census that makes the whole class unrepresentable, corpus-wide: the backfill
  // AND the recut writer together. A superseded row with no superseded_at is a register
  // row that never leaves the as-of window.
  const orphans = await rootQuery(
    `select f.id, f.client_id, f.description from clara.fixed_assets f
      where f.status = 'superseded' and f.superseded_at is null`,
  );
  assert.equal(orphans.rowCount, 0,
    `NO register row anywhere is 'superseded' with a NULL superseded_at (G3: the 0041 backfill + the recut K6 writer). Offenders: ${JSON.stringify(orphans.rows)}`);
});

// ===========================================================================
// x41.s4 — THE WHOLE-DB SWEEP, WITH A NAMED ALLOW-LIST (G7(c)).
// ===========================================================================

test("x41.s4 the WHOLE-DB fa_register_tie sweep at three as-ofs: unexplained differences are EMPTY, every explained one belongs to a fixture named in this cell's allow-list, and every A6 correction window has shut by the settled as-of", async (t) => {
  if (skipHere(t)) return;
  // THREE as-ofs, and the third is load-bearing. Two of them sit in the past, where a
  // reversal mirror dated on TODAY's business date can still be pending (the A6 window
  // below); the third is past every mirror this database can hold, so nothing there can
  // hide behind A6. That is what keeps the A6 classification a self-closing window rather
  // than an open-ended excuse.
  const asOfs = [mon(-1).end, dayIn(mon(0), 1), dayIn(mon(1), 28)];
  const settled = asOfs[asOfs.length - 1];
  const seen = { clients: 0, rows: 0, flagged: 0, explained: 0, a6: 0, overCap: 0 };

  for (const asOf of asOfs) {
    const windows = await openReversalWindows(asOf);
    if (asOf === settled) {
      assert.equal(windows.size, 0,
        `at as_of ${asOf} NO reversal window is still open (this as-of is past every mirror in the database) — so nothing measured here can be excused as A6`);
    }
    const swept = await tieSweep(asOf);
    assert.ok(swept.length > 0, `the sweep found register-bearing clients to measure at ${asOf} (a vacuous sweep proves nothing)`);
    // [ROUND-4] ZERO ERRORS, ASSERTED. A client whose tie THROWS is not "unmeasured" —
    // it is a client whose books nobody can assert, and the pre-flight that was supposed
    // to say so would have stayed green while quietly demoting it to a lane note. The
    // note stays for diagnosis; the assertion is what makes the sweep an instrument.
    const errs = swept.filter((r) => r.err);
    if (errs.length) {
      noteLane(`x41.s4 at ${asOf} the tie REFUSED for ${errs.length} client(s): ${errs.slice(0, 5).map((e) => `${e.client_name}: ${e.err}`).join(" | ")}`);
    }
    // [ROUND-4.6] …with exactly ONE tolerated class, and the tolerance is EARNED, not
    // asserted: the client must carry the fixture's own name AND the cap's own words AND
    // really hold a lineage past the cap when the register is walked here. Anything that
    // fails any of the three falls straight through to the zero-refusals assertion below.
    const overCap = [];
    for (const e of errs) {
      const a = ALLOWED_REFUSAL.find((x) => x.match.test(e.client_name ?? "") && x.err.test(e.err ?? ""));
      if (!a) continue;
      const hops = await deepestLineage(e.client);
      assert.ok(hops > 64,
        `at as_of ${asOf}: client '${e.client_name}' (${e.client}) claims the deliberate over-cap exemption, but its deepest supersede chain is ${hops} edge(s) — at or inside the ratified 64-hop cap. This exemption is EVIDENCE-gated: a refusal that is not really over-cap is a defect, not a fixture.`);
      seen.overCap += 1;
      noteLane(`x41.s4 allow-listed REFUSAL at ${asOf}: '${e.client_name}' holds a ${hops}-edge lineage, past the ratified 64-hop cap — ${a.why.slice(0, 90)}…`);
      overCap.push(e);
    }
    assert.deepEqual(errs.filter((e) => !overCap.includes(e))
      .map((e) => ({ client: e.client, name: e.client_name, err: e.err })), [],
    `at as_of ${asOf}: fa_register_tie must RETURN for every register-bearing client in the database. A refusal here is a book WD-R14's pre-flight cannot measure at all.`);
    const rows = sweepAccountRows(swept.filter((r) => !r.err));
    seen.clients = Math.max(seen.clients, swept.length);
    seen.rows += rows.length;

    // An as-of before a carried row's own baseline is DECLARED unreliable by the
    // instrument itself (x41.r4 owns that shape) — count it, never silently fold it in.
    const flagged = rows.filter((r) => anyKey(r.raw, /before_baseline/)?.value === true);
    seen.flagged += flagged.length;

    const red = rows.filter(isRed).filter((r) => !flagged.includes(r));

    // THE A6 CORRECTION WINDOW — a CLASS, derived from the data, never a fixture name.
    // `reverse_entry` dates its mirror on the current business date while the register act
    // it drives lands at approve; between the two dates the GL and the register legitimately
    // disagree. A row is only excused here if a later-dated approved mirror really is
    // pending on THAT client's own FA accounts at THAT as-of — and every such window has
    // already been proven shut at `settled` above. Counted and named, never folded away.
    const a6 = red.filter((r) => inReversalWindow(r, windows));
    seen.a6 += a6.length;
    for (const r of a6) {
      noteLane(`x41.s4 A6 correction window at ${asOf}: '${r.clientName}' ${r.account} cost_diff=${r.costDiff} accum_diff=${r.accumDiff} — an approved entry the GL still carries at this as-of has an approved mirror dated LATER, so the register (which moved at approve) and the GL disagree until the mirror lands`);
    }

    const rest = red.filter((r) => !a6.includes(r));
    const unexplained = rest.filter((r) => !isExplained(r));
    const explained = rest.filter(isExplained);
    seen.explained += explained.length;

    assert.deepEqual(unexplained.map((r) => ({
      client: r.client, name: r.clientName, account: r.account,
      cost_diff: r.costDiff, accum_diff: r.accumDiff,
      pre_cost: r.preCost, pre_accum: r.preAccum, keys: r.keys,
    })), [],
    `at as_of ${asOf}: EVERY register-vs-GL difference in the whole database is either zero or fully explained by the tie's own pre-enrolment column. An unexplained red is what a WD-R14 pre-flight would surface on a real firm's books with no column to point at.`);

    for (const r of explained) {
      const allow = allowedBy(r.clientName);
      assert.ok(allow,
        `at as_of ${asOf}: the EXPLAINED difference on client '${r.clientName}' (${r.client}, account ${r.account}, cost_diff ${r.costDiff} pre_cost ${r.preCost}, accum_diff ${r.accumDiff} pre_accum ${r.preAccum}) is not named in this cell's allow-list. Either the fixture that built it should be repaired at its source cell, or it belongs in ALLOWED_RED with a reason.`);
      noteLane(`x41.s4 allow-listed red at ${asOf}: '${r.clientName}' ${r.account} cost_diff=${r.costDiff} accum_diff=${r.accumDiff} — ${allow.why.slice(0, 90)}…`);
    }
  }

  noteLane(`x41.s4 swept ${seen.clients} register-bearing client(s) × ${asOfs.length} as-of(s) = ${seen.rows} account rows; ${seen.explained} explained red(s), ${seen.a6} open-A6-window row(s), ${seen.flagged} before_baseline row(s), ${seen.overCap} proven over-cap refusal(s), 0 unexplained`);
  assert.equal(ALLOWED_RED.length, 1,
    "the allow-list stays MINIMAL: exactly one deliberate fixture. Growing it is a decision, not a convenience — a new entry needs a reason a professional would accept.");
  assert.equal(ALLOWED_REFUSAL.length, 1,
    "the REFUSAL allow-list stays MINIMAL too: exactly one deliberate over-cap fixture, and it must prove itself over-cap. A second entry is a decision — a book the tie cannot answer for is the one thing this sweep exists to surface.");
});
