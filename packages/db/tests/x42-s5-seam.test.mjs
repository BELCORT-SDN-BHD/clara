// Wave D-b (0042) — x42.s5.seam: THE WDB-G10 FREEZE MUST REACH A READER.
//
// THE INVARIANT: a governed refusal a surface cannot see is a broken form. Every
// per-row state that makes an audited verb REFUSE must be projected by the read
// that fronts that verb, from the guard's OWN predicate, so the surface and the
// refusal can never answer differently.
//
// WHAT WAS WRONG. 0042 S5.6 makes `dispose_fixed_asset` refuse a second proposal
// while a disposal draft is outstanding (CLR39 `disposal_draft_outstanding`, cell
// x42.s5.1). Nothing carried that state to `list_fixed_assets` / `get_fixed_asset`,
// so /assets went on offering a dispose form whose only possible outcome on such a
// row was that refusal — and the ONE remedy the refusal names (approve or withdraw
// the outstanding draft) had no door on the screen the professional was reading.
// The dashboard's own panel for it was gated on `disposal_draft_entry_id`, a key NO
// function in the schema emitted, so it could never render.
//
// EVERY CELL BELOW FAILS WITHOUT THE S5.4 PROJECTION. They are read-side twins of
// x42.s5.1's write-side guard and are deliberately asserted against BOTH reads —
// the register list and the drawer — because /assets branches on both.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, idOf, noteLane, endPool, printLaneNotes, printSkipCount, refuses,
  BANK, GAIN, LOSS, mon, dayIn,
  faWorld, faRow, entryRowOf, freshFaClient, buyAsset, completeSL,
  disposeAsset, getFixedAsset, listFixedAssets,
} from "./x41-fa-world.mjs";
import { withdrawDraft } from "./s6-fixtures.mjs";
import { x42S5Ready, x42S5SkipHere } from "./x42-s5-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42S5Ready();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x42-s5-seam");
  printSkipCount("x42-s5-seam");
  await endPool();
});

const skipHere = (t) => x42S5SkipHere(t, live);

/** The one asset's row out of `list_fixed_assets` — the LIST projection, which is
 *  a different call path to `get_fixed_asset` and must agree with it. */
const listRow = async (sub, client, assetId) =>
  ((await listFixedAssets(sub, client)).assets ?? []).find((a) => a.id === assetId) ?? null;

test("x42.s5.seam.1 G10: both /assets reads project the disposal freeze (verdict + draft id) for exactly as long as the verb refuses", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s5seam1");
  const start = mon(-3);
  // High-stakes, so the disposal DRAFTS and the freeze is genuinely outstanding
  // (the x42.s5.1 setup, deliberately identical — same subject, read side).
  const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 24, start: start.start, description: "x42 s5.seam.1" });

  // --- BEFORE: no draft, so no freeze, on both reads. ---
  const beforeGet = (await getFixedAsset(w.users.alice, asset.id)).asset;
  const beforeList = await listRow(w.users.alice, client, asset.id);
  for (const [label, row] of [["get_fixed_asset", beforeGet], ["list_fixed_assets", beforeList]]) {
    assert.ok(row, `${label} returns the row`);
    assert.equal(row.disposal_draft_outstanding, false,
      `${label} must report the freeze as FALSE — not absent — on an unfrozen row, or a reader cannot tell "no freeze" from "the DB did not say"`);
    assert.equal(row.disposal_draft_entry_id, null, `${label} names no draft when there is none`);
  }

  // --- DURING: raise the first disposal; it drafts and freezes the row. ---
  const first = await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.seam.1 first disposal",
  });
  const firstEntry = idOf(first, "entry_id", "id");
  const firstRow = await entryRowOf(firstEntry);
  assert.equal(firstRow.status, "draft", "mandatory setup: the high-stakes disposal really drafts");

  // The verb refuses…
  await refuses(() => disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.seam.1 second (must refuse)",
  }), "disposal_draft_outstanding", "a second dispose while the first draft is outstanding");

  // …and BOTH reads say so, naming the very entry a reviewer must act on.
  const duringGet = (await getFixedAsset(w.users.alice, asset.id)).asset;
  const duringList = await listRow(w.users.alice, client, asset.id);
  for (const [label, row] of [["get_fixed_asset", duringGet], ["list_fixed_assets", duringList]]) {
    assert.equal(row.disposal_draft_outstanding, true,
      `${label} must report the freeze the verb is enforcing — without this the surface offers a dispose form that can only be refused`);
    assert.equal(row.disposal_draft_entry_id, firstEntry,
      `${label} must NAME the outstanding draft, so the remedy the refusal names has a door on this screen`);
    assert.equal(row.status, "active", `${label}: the register row itself is untouched — the freeze is a fact ABOUT it, not a status change`);
  }

  // --- AFTER: withdraw the draft; the verb stops refusing and both reads clear. ---
  await withdrawDraft(w.users.alice, {
    entry: firstEntry, expectedRevision: firstRow.revision_token,
    reason: "x42 s5.seam.1 withdraw", opKey: opk("x42s5seam1wd"),
  });
  const afterGet = (await getFixedAsset(w.users.alice, asset.id)).asset;
  const afterList = await listRow(w.users.alice, client, asset.id);
  for (const [label, row] of [["get_fixed_asset", afterGet], ["list_fixed_assets", afterList]]) {
    assert.equal(row.disposal_draft_outstanding, false,
      `${label}: a WITHDRAWN draft is no longer un-dead, so the freeze must clear in the read exactly as it clears in the verb`);
    assert.equal(row.disposal_draft_entry_id, null, `${label} stops naming a draft that no longer freezes anything`);
  }
  // …and the verb agrees — the two instruments are in step, not merely both plausible.
  const second = await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.seam.1 after withdraw",
  });
  assert.ok(idOf(second, "entry_id", "id"), "the disposal proceeds once the read says the freeze is gone");
  noteLane("x42.s5.seam.1 G10: the freeze is projected by BOTH /assets reads and tracks the verb through draft→withdraw→re-dispose");
});

test("x42.s5.seam.2 G10: the projected freeze is the GUARD'S OWN predicate — a draft on a SIBLING asset never freezes this row", async (t) => {
  if (skipHere(t)) return;
  // The round-5 lesson this cell exists for: a correctly-placed guard with a
  // too-WIDE or too-NARROW subject is still wrong. The projection must be keyed on
  // THIS asset (and this client), exactly like `_fa_disposal_draft_outstanding`.
  const client = await freshFaClient("s5seam2");
  const start = mon(-3);
  const mk = async (label) => {
    const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 1) });
    await completeSL(client, asset.id, { life: 24, start: start.start, description: label });
    return asset;
  };
  const frozen = await mk("x42 s5.seam.2 frozen");
  const sibling = await mk("x42 s5.seam.2 sibling");

  const first = await disposeAsset(w.users.alice, {
    client, asset: frozen.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.seam.2 freeze one",
  });
  const frozenEntry = idOf(first, "entry_id", "id");
  assert.equal((await entryRowOf(frozenEntry)).status, "draft", "mandatory setup: it drafts");

  const rows = (await listFixedAssets(w.users.alice, client)).assets ?? [];
  const frozenRow = rows.find((a) => a.id === frozen.id);
  const siblingRow = rows.find((a) => a.id === sibling.id);
  assert.equal(frozenRow.disposal_draft_outstanding, true, "the asset the draft names is frozen");
  assert.equal(frozenRow.disposal_draft_entry_id, frozenEntry);
  assert.equal(siblingRow.disposal_draft_outstanding, false,
    "a sibling on the SAME client is NOT frozen — a whole-client predicate would wall a dispose the verb would have allowed");
  assert.equal(siblingRow.disposal_draft_entry_id, null, "…and names no draft");

  // The verb agrees on both subjects: the sibling really can be disposed.
  const ok = await disposeAsset(w.users.alice, {
    client, asset: sibling.id, disposalDate: mon(-1).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x42 s5.seam.2 sibling disposes",
  });
  assert.ok(idOf(ok, "entry_id", "id"), "the unfrozen sibling disposes — read and verb agree on the SUBJECT, not just the rule");
  assert.equal((await faRow(sibling.id)).status, "active", "…still a draft (high-stakes), which is the expected shape here");
  noteLane("x42.s5.seam.2 G10: the projected freeze is per-ASSET, matching the guard's own subject");
});

// WHAT THESE CELLS DO NOT THINK OF, stated rather than discovered:
//   * A draft whose `flags.fa_disposal.disposal_date` is NULL. `<= 'infinity'` is
//     NULL-false, so such a draft freezes NOTHING and is projected by NOTHING — the
//     read mirrors the guard exactly, which is the property that matters; whether
//     the guard SHOULD catch it is a WDB-G10 question for the owner, not a
//     divergence this lane may invent.
//   * The id is an ordered pick (`disposal_date`, then `id`). Pre-0042 data could
//     hold two outstanding drafts on one asset; the reader then names the earliest
//     and the panel re-renders on the next after it is withdrawn. The VERDICT is
//     always right; only the id is a "first of possibly several".
//   * Cost. `_fa_asset_json` now calls the guard once per row (list) and once per
//     lineage hop (drawer). It rides ix_journal_entries_fa_disposal_draft, the
//     client-keyed partial index 0041 created for this exact predicate.
