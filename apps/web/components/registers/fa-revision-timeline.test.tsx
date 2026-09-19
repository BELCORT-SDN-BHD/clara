// #651 — the policy-effective revision timeline, driven through its real render states.
//
// WHAT EACH CELL PINS:
//   revisions.rows      one row per generation, with the class and the effective date, current last.
//   revisions.empty     ITS OWN empty state — "never revised" is not "no particulars yet", and that
//                       difference is the reason this is a tab rather than a section of another.
//   revisions.absent    a generation with NO class reads as NOT RECORDED. The class is stamped on
//                       the successor only and never back-filled, so every root row and every
//                       revision minted before 0227 answers null; rendering "estimate" there would
//                       be this surface inventing an accounting claim.
//   revisions.sr_name   the table carries an accessible name, because its only heading is a
//                       page-level <h1> two landmarks up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { FaRevisionTimeline, faGenerations } from "./fa-revision-timeline";
import { intlApp, faRow, faPredecessor, findAll, tid, attr, FA_ASSET, FA_ASSET_PRED } from "./fa-depreciation-test-fixtures";

enableDomInspection();

const render = (asset: ReturnType<typeof faRow>, lineage: ReturnType<typeof faPredecessor>[]) =>
  renderComponent(intlApp(createElement(FaRevisionTimeline, { asset: asset as never, lineage: lineage as never })));

test("revisions.rows one row per generation, oldest first, with the class and the effective date — and the CURRENT generation is last and marked", async () => {
  const h = await render(faRow(), [faPredecessor()]);
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const rows = findAll(h.container as never, (n) => n.tagName === "TR" && tid(n).startsWith("fa-revision-row-"));
    assert.equal(rows.length, 2, "two generations, two rows");
    assert.equal(rows[0]!.getAttribute?.("data-testid"), `fa-revision-row-${FA_ASSET_PRED}`,
      "the PREDECESSOR is first: a timeline reads forwards");
    assert.equal(rows[1]!.getAttribute?.("data-testid"), `fa-revision-row-${FA_ASSET}`);
    assert.equal(rows[1]!.getAttribute?.("data-current"), "true", "…and the last one is the current generation");
    assert.equal(rows[0]!.getAttribute?.("data-current"), null);

    const current = textOf(rows[1]!);
    assert.match(current, /2026-06-01/, "the successor's own effective_from");
    assert.match(current, /Estimate change/, "…its class, in words");
    assert.match(current, /plant survey/, "…and the reason a reviewer reads");
    assert.match(current, /48/, "…and what it changed the life to");

    // THE PREDECESSOR'S DATE IS ITS ACQUISITION DATE. A root generation has no effective_from —
    // it came into effect when the asset was acquired, and showing a dash there would hide a fact
    // the read already has.
    assert.match(textOf(rows[0]!), /2026-03-01/);
  } finally {
    await h.unmount();
  }
});

test("revisions.empty an asset that has never been revised gets ITS OWN empty state, not the particulars one", async () => {
  const h = await render(faRow({ change_class: null, change_reason: null, effective_from: null }), []);
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const text = h.text();
    assert.match(text, /never been revised/i,
      "the sentence is about REVISIONS — 'this asset's estimate has never been revised'");
    assert.doesNotMatch(text, /particulars are not filled in/i,
      "…and it is NOT the particulars' empty state: they are different facts about different things");
    assert.equal(findAll(h.container as never, (n) => n.tagName === "TR").length, 0, "no table renders at all for one generation");
  } finally {
    await h.unmount();
  }
});

test("revisions.absent a generation with no recorded class reads as NOT RECORDED, never as an invented one", async () => {
  // Two generations, but the successor was minted BEFORE 0227 — so it carries no class.
  const h = await render(faRow({ change_class: null, change_reason: null }), [faPredecessor()]);
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const rows = findAll(h.container as never, (n) => n.tagName === "TR" && tid(n).startsWith("fa-revision-row-"));
    assert.equal(rows.length, 2);
    assert.match(textOf(rows[1]!), /Not recorded/,
      "an un-classified generation says so — rendering 'Estimate change' would be the surface making an accounting claim the database never made");
    assert.doesNotMatch(textOf(rows[1]!), /Estimate change/);
  } finally {
    await h.unmount();
  }
});

test("revisions.sr_name the table is NAMED, and faGenerations orders oldest-first with the subject last", async () => {
  const h = await render(faRow(), [faPredecessor()]);
  try {
    for (let i = 0; i < 3; i++) await h.settle();
    const table = h.find((n) => n.tagName === "TABLE");
    assert.ok(table, "a table renders");
    const label = attr(table as never, "aria-label");
    assert.ok(label && label.length > 0,
      "a table whose only heading is a page-level <h1> two landmarks up is announced as an UNNAMED table");
    assert.match(label!, /revision/i);
  } finally {
    await h.unmount();
  }

  // The ordering helper is the one piece of logic this surface owns, so it is pinned directly:
  // `clara.get_fixed_asset` walks the lineage UPWARD, and the timeline reads forwards.
  const ordered = faGenerations(faRow() as never, [faPredecessor()] as never);
  assert.deepEqual(ordered.map((g) => g.id), [FA_ASSET_PRED, FA_ASSET]);
});
