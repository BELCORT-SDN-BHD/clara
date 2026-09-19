// components/bank/matching-exception-face.tsx — #657 AC12 / C-40.
//
// `clara._wdb_line_booking_block` has answered this question since migration 0044 and had ZERO
// consumers in `apps/web` or `packages/runtime` — a named door with no UI, which is what C-40
// carries. The two things this cell holds:
//   1. `remedy_calls` render as LINKS into the Exceptions tab, so the human moves to where the
//      act lives instead of reading the name of a function;
//   2. NO RESOLVE CONTROL is offered here, ever — that door is #671's, and offering it on the
//      matching surface would put two lanes on one act. Asserted as an absence, because an
//      absence is exactly the kind of thing a later change removes by accident.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";

import { MatchingExceptionFace } from "./matching-exception-face";
import type { BankLineMatchingContext } from "@/lib/bank/matching-context-types";
import messages from "../../messages/en.json";

// REQUIRED, not decorative: every remedy renders a next/link <Link>, whose prefetch-on-visible
// hook reaches  — undefined in a bare Node process without this.
enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; getAttribute?: (k: string) => string | null };

/** Every node matching `predicate`. `renderComponent`s own `find` returns the FIRST match, and
 *  two of the cells below are about how many there are. */
function findAll(root: unknown, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root as Node);
  return out;
}


const EXCEPTION: BankLineMatchingContext["exception"] = {
  id: "x1",
  kind: "disputed",
  reason: "the client says this credit is not theirs",
  status: "open",
  created_at: "2026-04-01T00:00:00.000Z",
  resolved_at: null,
  resolution_disposition: null,
  resolution_note: null,
  evidence_document_id: null,
  counterpart_line_id: null,
};

const BLOCK: BankLineMatchingContext["booking_block"] = {
  reason: "exception_booking_outstanding",
  blocking: true,
  line_id: "l1",
  exception_id: "x1",
  remedy: "reverse the booking, then resolve the exception",
  bookings: [
    {
      entry_id: "je-1",
      match_id: "m-1",
      match_status: "unmatched",
      orphaned: true,
      caused_by: "born_in_booking_act",
      reverse_blocked_by: null,
      remedy_calls: ["clara.reverse_entry", { call: "clara.resolve_bank_line_exception" }],
    },
  ],
};

function mount(exception: BankLineMatchingContext["exception"], block: BankLineMatchingContext["booking_block"]) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(MatchingExceptionFace, { clientId: "c1", exception, block }),
    }),
  );
}

test("p657.web.exception-face · the exception's kind, reason and the block's own token render, and remedy_calls become links into the Exceptions tab", async () => {
  const h = await mount(EXCEPTION, BLOCK);
  try {
    const text = h.text();
    assert.match(text, /disputed · the client says this credit is not theirs/, "the exception's kind and reason render verbatim");
    assert.match(text, /exception_booking_outstanding/,
      "the DB's own token renders — the block's header says a human must not learn two names for this state");
    assert.match(text, /A booking made from this line is still outstanding/, "`blocking` is the verdict and it is rendered as one");
    assert.match(text, /reverse the booking, then resolve the exception/, "the block's own remedy sentence renders verbatim");
    assert.match(text, /Entry je-1 · born_in_booking_act/, "each booking names the entry and WHY it is this line's to answer for");

    const links = findAll(h.container, (n) => n.tagName === "A");
    const hrefs = links.map((a) => a.getAttribute?.("href"));
    assert.ok(hrefs.includes("/clients/c1/bank?tab=exceptions"),
      `the remedy links point at the Exceptions tab of this workbench (got ${JSON.stringify(hrefs)})`);
    assert.equal(links.length, 2, "both remedy calls render — a string one and an object one — and neither is dropped");
    assert.match(links.map((a) => textOf(a)).join(" "), /clara\.reverse_entry/, "the call's own name is the link text");
    assert.match(links.map((a) => textOf(a)).join(" "), /clara\.resolve_bank_line_exception/);
  } finally {
    await h.unmount();
  }
});

test("p657.web.exception-face · NO resolve control is offered here — that door belongs to ticket 671", async () => {
  const h = await mount(EXCEPTION, BLOCK);
  try {
    const buttons = findAll(h.container, (n) => n.tagName === "BUTTON");
    assert.equal(buttons.length, 0, `the exception face offers NO button at all, and certainly not a resolve one (found ${buttons.map((b) => textOf(b)).join(", ")})`);
    assert.match(h.text(), /Exceptions are resolved in the Exceptions tab, not here\./,
      "the boundary is stated to the human, not only to the reviewer");
  } finally {
    await h.unmount();
  }
});

test("p657.web.exception-face · a clean line renders nothing at all", async () => {
  const h = await mount(null, null);
  try {
    assert.equal(h.text().trim(), "", "with no exception and no block this component contributes nothing to the page");
  } finally {
    await h.unmount();
  }
});
