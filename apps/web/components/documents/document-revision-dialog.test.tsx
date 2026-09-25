// #646 — THE HUMAN FACT REVISION DIALOG, at the face.
//
// THREE PROPERTIES, and each is an acceptance criterion rather than a rendering detail:
//
//   1. THE DECISION IS MADE AGAINST STATED FACTS. The canonical field path, the current value and
//      the source version are all on screen before the confirm — AC1's "source version, actor,
//      reason" in the one place a human can see it.
//   2. A REFUSAL KEEPS WHAT WAS TYPED. `DocumentsDoorDialog` closes only on an explicit success, so
//      a refused revision leaves the value and the reason exactly where the human left them, with
//      the CLR rendered verbatim beside them. Destroying the input a refusal is asking you to
//      correct is the defect CB-AE2E-004 removed from every door on this surface.
//   3. THE STALE FACE IS A SECOND, DELIBERATE ACT. CLR19 `stale_source_version` carries both
//      version numbers and the attempted value; the dialog states all three and offers a control
//      that moves the revision onto the current version. It never re-submits by itself — that is
//      exactly how one person's correction silently overwrites another's.
//
// EVERY CELL DRIVES THE REAL COMPONENT against a stubbed `fetch`, so the assertion is about what a
// human would see, not about what a helper returned. The dialog PORTALS, so every query below runs
// against `document.body` rather than the render container (the idiom
// `coding-lane-keyboard.test.tsx` established for the same primitive).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentRevisionDialog, isRevisableFieldPath, revisableFactLane, REVISABLE_PAYROLL_RUN_PATHS } from "./document-revision-dialog";
import { KNOWN_FACT_PATHS } from "../../lib/documents/extract-shape";
import type { SourceRevisionResult } from "../../lib/documents/types";
import messages from "../../messages/en.json";

// The dialog mounts @base-ui/react primitives whose floating-ui internals feature-detect against
// `window.Element`/`Node` (test/domInspect.ts).
enableDomInspection();

type Node_ = { tagName?: string; childNodes?: Node_[]; getAttribute?: (k: string) => string | null };

function findIn(root: Node_, predicate: (n: Node_) => boolean): Node_ | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

function body(): Node_ {
  return (globalThis as unknown as { document: { body: Node_ } }).document.body;
}

const byLabel = (b: Node_, label: string) =>
  findIn(b, (n) => n.getAttribute?.("aria-label") === label);
const buttonNamed = (b: Node_, re: RegExp, not?: Node_ | null) =>
  findIn(b, (n) => n.tagName === "BUTTON" && re.test(textOf(n as never)) && n !== not);

type Call = { body: unknown };

/** A PostgREST-shaped stub. `answer` decides what `revise_document_fact` replies with; anything
 *  else answers an empty list. */
function stubFetch(answer: () => { status: number; body: unknown }, calls: Call[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("revise_document_fact")) {
      calls.push({ body: init?.body ? JSON.parse(String(init.body)) : null });
      const a = answer();
      return new Response(JSON.stringify(a.body), {
        status: a.status, headers: { "content-type": "application/json" },
      });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function withDialog(
  fetchImpl: typeof fetch,
  run: (ctx: {
    h: Awaited<ReturnType<typeof renderComponent>>;
    b: Node_;
    revised: { n: number; last: SourceRevisionResult | null };
  }) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = fetchImpl;
  configureSessionTokenSource(async () => "tok");
  const revised: { n: number; last: SourceRevisionResult | null } = { n: 0, last: null };
  const h = await renderComponent(App(createElement(DocumentRevisionDialog, {
    documentId: "11111111-1111-4111-8111-111111111111",
    fieldPath: "invoice.total",
    fieldLabel: "Invoice total",
    currentValue: "1050.00",
    factsVersion: 1,
    busy: false,
    onRevised: (result: SourceRevisionResult) => { revised.n += 1; revised.last = result; },
  })));
  const b = body();
  (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  try {
    await run({ h, b, revised });
  } finally {
    await h.unmount();
    const bodyEl = b as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
    if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

/** Open the dialog, fill both fields, press Record revision. Returns the trigger so later queries
 *  can exclude it. */
async function attempt(
  ctx: { h: Awaited<ReturnType<typeof renderComponent>>; b: Node_ },
  value: string, reason: string,
): Promise<Node_> {
  const { h, b } = ctx;
  for (let i = 0; i < 2; i++) await h.settle();
  const trigger = h.find((n) => n.tagName === "BUTTON" && /^Revise$/.test(textOf(n)));
  assert.ok(trigger, "the per-row Revise trigger must render");
  await h.fireEvent(trigger!, "click");
  for (let i = 0; i < 6; i++) await h.settle();

  const valueField = byLabel(b, "Corrected value");
  const reasonField = byLabel(b, "Revision reason");
  assert.ok(valueField, "the corrected-value field must render");
  assert.ok(reasonField, "the reason field must render");
  await h.act(() => { setFieldValue(valueField as never, value); });
  await h.act(() => { setFieldValue(reasonField as never, reason); });
  for (let i = 0; i < 2; i++) await h.settle();

  const confirm = buttonNamed(b, /^Record revision$/);
  assert.ok(confirm, "the confirm control must render");
  await h.act(() => { clickButton(confirm as never); });
  for (let i = 0; i < 8; i++) await h.settle();
  return trigger as unknown as Node_;
}

test("the closed revisable set is exactly the DB's, and a layout or statement path is not in it", () => {
  // The wall that matters is in the database (`clara._revisable_invoice_field`). This cell pins the
  // surface's copy against the cases a reader would most likely get wrong.
  assert.equal(isRevisableFieldPath("invoice.total"), true);
  assert.equal(isRevisableFieldPath("invoice.tax_total"), true);
  assert.equal(isRevisableFieldPath("statement.closing_balance"), false,
    "a perfectly canonical path from another lane is not revisable here — an invoice-facts "
    + "extraction cannot carry it, and the door refuses CLR10 field_path_not_revisable");
  assert.equal(isRevisableFieldPath("pages.1.lines.0"), false, "a layout fragment is not a typed fact");
  assert.equal(isRevisableFieldPath(null), false);
});

// #1056 — THE LANE ARBITER, the second half of the same wall.
//
// `clara._revisable_fact_lane` (migration 0344) is what the door asks now: which fact CHAIN a
// revision of this path would land in. The surface mirrors it because the chain decides which
// source version the control has to quote, and a control quoting the other chain's number refuses
// CLR19 every time it is pressed.

test("1056 · the lane arbiter names the payroll lane, the invoice lane, and nothing else", () => {
  for (const f of REVISABLE_PAYROLL_RUN_PATHS) {
    assert.equal(revisableFactLane(f), "payroll", `${f} is a payroll-lane fact`);
  }
  assert.equal(revisableFactLane("invoice.total"), "invoice");
  assert.equal(revisableFactLane("invoice.myinvois_longid"), "invoice");
  assert.equal(revisableFactLane("payroll.row.gross_pay"), null,
    "nothing below the run level: the per-employee quotes are summed and discarded at read time, "
    + "so there is no region to revise and no prior value to replace");
  assert.equal(revisableFactLane("payroll.run.bonus"), null, "a path outside the closed set");
  assert.equal(revisableFactLane("statement.closing_balance"), null);
  assert.equal(revisableFactLane("pages.1.lines.0"), null);
  assert.equal(revisableFactLane(null), null);

  // THE INVOICE SET IS NOT WIDENED. The arbiter asks the invoice predicate; it does not absorb it,
  // which is the same shape migration 0344 takes in the database.
  assert.equal(isRevisableFieldPath("payroll.run.gross_pay"), false);
});

test("1056 · DRIFT CELL: the revisable payroll set is exactly the payroll paths this app labels", () => {
  // Two copies of #945's eleven run-level questions live in this app: `KNOWN_FACT_PATHS` (which
  // decides whether a row gets a human label) and the list above (which decides whether it gets a
  // control). A path in one and not the other is a row that is either labelled and uncorrectable
  // or correctable and unlabelled, and both are wrong.
  const labelled = KNOWN_FACT_PATHS.filter((p) => p.startsWith("payroll."));
  assert.deepEqual([...REVISABLE_PAYROLL_RUN_PATHS].sort(), [...labelled].sort());
  assert.equal(REVISABLE_PAYROLL_RUN_PATHS.length, 11, "#945's eleven run-level questions");
});

test("the dialog states the field path, the current value and the source version before the confirm", async () => {
  await withDialog(stubFetch(() => ({ status: 200, body: {} }), []), async ({ h, b }) => {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && /^Revise$/.test(textOf(n)));
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();
    const text = textOf(b as never);
    assert.match(text, /invoice\.total/, "the canonical field path the revision is written under");
    assert.match(text, /1050\.00/, "what the document says today");
    assert.match(text, /Source version/, "and which reading this decision is being made against");
  });
});

test("a refusal keeps the typed value and renders the CLR verbatim — the dialog does not close", async () => {
  const calls: Call[] = [];
  await withDialog(
    stubFetch(() => ({
      status: 400,
      body: {
        code: "CLR10",
        message: "a revised monetary value must be readable as cents",
        details: JSON.stringify({ reason: "monetary_value_malformed", field_path: "invoice.total" }),
      },
    }), calls),
    async (ctx) => {
      await attempt(ctx, "N/A", "the printed figure is unreadable");
      const text = textOf(ctx.b as never);
      assert.equal(calls.length, 1, "exactly one governed call was made");
      assert.match(text, /readable as cents/, "the DB's own sentence, verbatim");
      assert.match(text, /CLR10/, "with its code");
      assert.match(text, /monetary_value_malformed/, "and its typed discriminant");
      assert.ok(byLabel(ctx.b, "Corrected value"),
        "the dialog is still open, with the input the refusal is asking about still there");
      assert.equal(ctx.revised.n, 0, "nothing was reported as revised");
    },
  );
});

test("CLR19 stale_source_version states both versions and the attempted value, and offers a second, deliberate act", async () => {
  const calls: Call[] = [];
  await withDialog(
    stubFetch(() => ({
      status: 400,
      body: {
        code: "CLR19",
        message: "this revision was written against facts version 1, the current version is 3",
        details: JSON.stringify({
          reason: "stale_source_version", observed_version: 1, current_version: 3,
          field_path: "invoice.total", attempted_value: "1150.00",
        }),
      },
    }), calls),
    async (ctx) => {
      await attempt(ctx, "1150.00", "the reader misread the printed total");
      let text = textOf(ctx.b as never);
      assert.match(text, /1150\.00/, "the attempted value is re-shown, never discarded (AC2)");
      assert.match(text, /source version 1/, "with the version it was written against");
      assert.match(text, /version 3/, "and the version the document now reads");
      assert.equal(calls.length, 1, "and NOTHING was re-submitted on its own");

      // THE SECOND, DELIBERATE ACT: move the revision onto the current version. Pressing it is not
      // a submit — the human still has to confirm.
      const useCurrent = buttonNamed(ctx.b, /^Use version 3$/);
      assert.ok(useCurrent, "the recovery is a control the human presses, not an automatic retry");
      await ctx.h.act(() => { clickButton(useCurrent as never); });
      for (let i = 0; i < 4; i++) await ctx.h.settle();
      text = textOf(ctx.b as never);
      assert.equal(calls.length, 1, "pressing it still does not submit — it restates the decision");
      assert.match(text, /Source version/, "and the dialog now states the version it will quote");
    },
  );
});

// #885 (fix round) — WHAT THE CORRECTION DID TO THE WORK QUEUE REACHES THE SURFACE THAT ASKED FOR
// IT. Migration 0268 retires every Work parked on a question about the corrected document, and
// since review finding L09-ADV-01 a Work whose basis was DERIVED from the reading that just moved
// is retired with NO successor at all — nobody may re-admit a stale figure on a corrected document.
// That arm is the one a person has to be told about: their correction succeeded AND something they
// were waiting on now needs stating again. The door already says so on its receipt
// (`superseded_work`, one entry per Work with `replaced` and `not_replaced_reason`); this dialog
// used to await that receipt and throw it away.
test("885 a confirmed revision hands its receipt to the caller, Work effects included", async () => {
  const calls: Call[] = [];
  const receipt = {
    document_id: "11111111-1111-4111-8111-111111111111",
    revision_id: "99999999-9999-4999-8999-999999999999",
    field_path: "invoice.total",
    prior_value: { text: "1050.00", cents: 105_000 },
    new_value: { text: "1150.00", cents: 115_000 },
    extraction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    observed_extraction_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    observed_version: 1,
    facts_version: 2,
    carried_regions: 3,
    superseded_work: [
      {
        work_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        new_work_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        reason: "source_corrected", replaced: true, not_replaced_reason: null,
        revision_id: "99999999-9999-4999-8999-999999999999",
      },
      {
        work_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        new_work_id: null,
        reason: "source_corrected", replaced: false, not_replaced_reason: "interpreted_basis",
        revision_id: "99999999-9999-4999-8999-999999999999",
      },
    ],
  };
  await withDialog(stubFetch(() => ({ status: 200, body: receipt }), calls), async (ctx) => {
    await attempt(ctx, "1150.00", "the reader misread the printed total");
    assert.equal(calls.length, 1, "exactly one governed call was made");
    assert.equal(ctx.revised.n, 1, "the surface was told to re-read");
    assert.deepEqual(ctx.revised.last, receipt,
      "…and was handed the door’s own receipt, so it can say what the correction retired");
  });
});
