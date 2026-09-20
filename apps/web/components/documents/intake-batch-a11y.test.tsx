// #636 — ONE ANNOUNCEMENT OWNER, AND NO ROW IS A LIVE REGION.
//
// `upload-panel.tsx:44-52` already fixed this once on the neighbouring surface: a hundred live
// rows speak a hundred times on every re-render, which turns a screen reader into noise exactly
// when a batch is at its busiest. The card inherits the fix — ONE `sr-only role="status"
// aria-live="polite"` region — and this file is what keeps it inherited.
//
// The structural scan rides `test/a11yRules.ts`, the same hand-written rule engine
// `documents-a11y.test.tsx` uses; see `test/domInspect.ts`'s header for what that substitution
// does and does not cover.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility, type A11yViolation } from "../../test/a11yRules";
import messages from "../../messages/en.json";
import { IntakeBatchCard, type IntakeBatchCardState } from "./intake-batch-card";
import { toIntakeBatchPack } from "../../lib/documents/intake-batch";

enableDomInspection();

type Stub = Record<string, unknown>;

const BATCH = "b1111111-1111-4111-8111-111111111111";
const CLIENT = "c1111111-1111-4111-8111-111111111111";

/** MANY rows, deliberately: one row proves nothing about a hundred speaking at once. */
function manyRows(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    member_id: `m${i}`, intake_id: `i${i}`, document_id: `d${i}`, work_id: null, client_id: null,
    filename: `source-${i}.pdf`, intake_status: "finalized", dependency: "awaiting_attribution",
    dependency_reason: "no client chosen yet", has_open_question: false,
    created_at: "2026-04-05T01:00:00Z",
  }));
}

const pack = (state = "open") => toIntakeBatchPack(BATCH, {
  computed_at: "2026-04-05T02:00:00Z",
  preview_limit: 25,
  batch: { id: BATCH, label: "April sources", origin: "documents_tab", state, opened_by: "u1", opened_at: "2026-04-05T01:00:00Z", cancel_requested_at: null },
  facets: {
    admitted: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
    settled: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, uncounted_completions: 0, rows: [] },
    waiting: { status: "ok", count: 40, coverage: "ok", coverage_reason: null, rows: manyRows(40) },
    failed: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
    unassigned: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
  },
  waiting_basis: { by_question: 0, by_dependency: { awaiting_fact: 0, awaiting_attribution: 40, awaiting_capacity: 0 }, by_unfiled: 40, by_capacity_failure: 0 },
  // #964: the daily window moved from a UTC day (utc_day/08:00) to an Asia/Kuala_Lumpur day.
  capacity: { window: "myt_day", resets_at_local: "00:00", timezone: "Asia/Kuala_Lumpur" },
});

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

async function mount(state: IntakeBatchCardState) {
  const h = await renderComponent(App(createElement(
    "div", null,
    createElement("h1", null, "Documents"),
    createElement(IntakeBatchCard, {
      state, clientId: CLIENT, facet: "all", onFacetChange: () => {}, onRefresh: () => {},
    } as never),
  )));
  for (let i = 0; i < 2; i += 1) await h.settle();
  return h;
}

function collect(root: Stub, out: Stub[] = []): Stub[] {
  out.push(root);
  for (const c of ((root.childNodes as Stub[] | undefined) ?? [])) collect(c, out);
  return out;
}
const attrOf = (n: Stub, name: string): string | null =>
  (typeof n.getAttribute === "function" ? (n.getAttribute as (k: string) => string | null)(name) : null);

test("intake batch card: forty rows, and EXACTLY ONE live region on the whole card", async () => {
  const h = await mount({ kind: "ready", pack: pack() });
  const nodes = collect(h.container as Stub);
  const live = nodes.filter((n) => attrOf(n, "aria-live") !== null);
  assert.equal(live.length, 1, `exactly one aria-live region (found ${live.length})`);
  const region = live[0] as Stub;
  assert.equal(attrOf(region, "aria-live"), "polite");
  assert.equal(attrOf(region, "role"), "status");
  const rows = nodes.filter((n) => n.tagName === "TR");
  assert.ok(rows.length > 10, `the fixture really renders many rows (${rows.length})`);
  for (const row of rows) {
    assert.equal(attrOf(row, "aria-live"), null, "a ROW is never a live region — forty rows would speak forty times");
    assert.equal(attrOf(row, "role"), null);
  }
  await h.unmount();
});

test("intake batch card: the one region is sr-only and carries its own name", async () => {
  const h = await mount({ kind: "ready", pack: pack() });
  const nodes = collect(h.container as Stub);
  const live = nodes.find((n) => attrOf(n, "aria-live") !== null) as Stub;
  assert.match(String(attrOf(live, "class") ?? ""), /sr-only/, "the announcement is for a screen reader, not a visible banner");
  assert.ok((attrOf(live, "aria-label") ?? "").length > 0, "…and it names itself, so it is findable in a rotor");
  await h.unmount();
});

test("intake batch card: zero structural a11y violations, ready / loading / denied / failed / cancelling", async () => {
  const states: IntakeBatchCardState[] = [
    { kind: "ready", pack: pack() },
    { kind: "ready", pack: pack("cancelling") },
    { kind: "loading" },
    { kind: "denied" },
    { kind: "failed", message: "the read did not answer" },
  ];
  for (const state of states) {
    const h = await mount(state);
    const violations: A11yViolation[] = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], `${state.kind}: ${JSON.stringify(violations)}`);
    await h.unmount();
  }
});

test("intake batch card: the section names itself, so it is one landmark in a rotor rather than a loose table", async () => {
  const h = await mount({ kind: "ready", pack: pack() });
  const nodes = collect(h.container as Stub);
  const section = nodes.find((n) => n.tagName === "SECTION" && attrOf(n, "aria-labelledby") !== null) as Stub;
  assert.ok(section, "the card is a labelled section");
  const headingId = attrOf(section, "aria-labelledby");
  assert.ok(nodes.some((n) => attrOf(n, "id") === headingId), "…and the heading it names exists");
  await h.unmount();
});
