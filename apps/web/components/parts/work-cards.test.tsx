// The three durable-Work transcript cards (B6), under test.
//
// WHAT A GREEN HERE MEANS. These cards render the WIRE and stop — there is no
// hydrate to prove, so the questions are narrower and sharper than the v16
// cards' three: does the branch exist at all, does it render the DB's own
// identifiers verbatim, does it build a REAL route, and does it refuse to build
// one when the payload cannot address anything.
//
// THE LINK CELLS ARE THE LOAD-BEARING ONES. `/clients//work/work-1` is a 404
// dressed as an affordance, and the emitter can genuinely construct a part
// before `client_id` is filled — `entry_posted` has done exactly that since
// chatTurn.v13. So "no client, no link" is asserted, not assumed.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "./PartRenderer";
import type { ClaraPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function App(part: ClaraPart): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(PartRenderer, { part }),
  });
}

/** Every `<a href>` the card rendered, in document order. */
function hrefs(container: Stub): string[] {
  const out: string[] = [];
  const walk = (n: Stub) => {
    if (n.tagName === "A") {
      const href = (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(container);
  return out;
}

const ACCEPTED: ClaraPart = {
  type: "work_accepted",
  work_id: "work-1",
  client_id: "client-1",
  purpose: "journal_entry",
  logical_op_id: "work:work-1:journal_entry:1",
};

test("work_accepted renders the operation identity and links to the WORK'S OWN page", async () => {
  const h = await renderComponent(App(ACCEPTED));
  try {
    const text = h.text();
    assert.match(text, /Accounting work accepted/);
    assert.match(text, /journal_entry/, "the DB's own purpose token, verbatim");
    assert.match(text, /work-1/);
    // The logical operation identity is what makes a replayed commit resolve the
    // ORIGINAL receipt. A professional can match it against the Work page.
    assert.match(text, /work:work-1:journal_entry:1/);
    assert.deepEqual(hrefs(h.container), ["/clients/client-1/work/work-1"]);
    assert.ok(!text.includes(FALLBACK_UNSUPPORTED_PREFIX), "the branch exists — this is not the unsupported chip");
  } finally {
    await h.unmount();
  }
});

test("work_accepted with an EMPTY client_id renders in full and offers NO link", async () => {
  const h = await renderComponent(App({ ...ACCEPTED, client_id: "" } as ClaraPart));
  try {
    assert.match(h.text(), /work-1/, "the card still renders");
    assert.deepEqual(hrefs(h.container), [], "a route built from an empty client id is a 404 dressed as an affordance");
  } finally {
    await h.unmount();
  }
});

test("work_status is a compact NAMED line — never a bare adjective, and never a link", async () => {
  const h = await renderComponent(App({ type: "work_status", work_id: "work-1", status: "running" }));
  try {
    const text = h.text();
    // The label is what makes "running" readable to someone who cannot see the
    // layout; §5's announcement boundary is why it is static text and not a
    // live region of its own.
    assert.match(text, /Work status/);
    assert.match(text, /running/);
    assert.match(text, /work-1/);
    // The part carries no client id at all, so there is no route to build.
    assert.deepEqual(hrefs(h.container), []);
  } finally {
    await h.unmount();
  }
});

test("an UNKNOWN status renders VERBATIM rather than through a missing message key", async () => {
  const h = await renderComponent(App({ type: "work_status", work_id: "work-1", status: "some_future_status" }));
  try {
    assert.match(h.text(), /some_future_status/);
    assert.ok(!h.text().includes("Clara.parts"), "next-intl renders a missing key as its raw dotted path — that must never happen here");
  } finally {
    await h.unmount();
  }
});

test("work_result names the entry AND the receipt, and links to the journals workbench", async () => {
  const h = await renderComponent(
    App({ type: "work_result", work_id: "work-1", client_id: "client-1", entry_id: "entry-1", receipt_id: "receipt-1" }),
  );
  try {
    const text = h.text();
    assert.match(text, /Journal entry posted/);
    assert.match(text, /entry-1/);
    assert.match(text, /receipt-1/);
    // The lines and the total are read live on the workbench — a figure copied
    // into a transcript card goes stale and this UI never invents one.
    assert.ok(!/RM/.test(text), "no amount may appear on a card whose wire carries none");
    assert.deepEqual(hrefs(h.container), ["/clients/client-1/journals"]);
  } finally {
    await h.unmount();
  }
});

test("work_result with no usable client renders without a link", async () => {
  const h = await renderComponent(
    App({ type: "work_result", work_id: "work-1", client_id: "   ", entry_id: "entry-1", receipt_id: "receipt-1" }),
  );
  try {
    assert.match(h.text(), /entry-1/);
    assert.deepEqual(hrefs(h.container), []);
  } finally {
    await h.unmount();
  }
});
