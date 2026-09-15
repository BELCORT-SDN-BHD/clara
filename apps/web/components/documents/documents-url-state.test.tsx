// `?document=` — the Documents workbench's URL-state contract (#719's Documents half), measured at
// the face rather than only in the parser.
//
// WHAT WAS WRONG. Selecting a filed document set React state and nothing else: a refresh lost it, a
// link could not name a document, and Back left the tab entirely. Every claim below is about a
// property the parser alone cannot have — which History verb was used, and what a reload restores.
//
// FOCUS IS NOT ONE OF THIS FILE'S CLAIMS, and saying so is the point. There is no focus manager,
// no `requestAnimationFrame` and no @base-ui/react focus guard in this environment, so every
// assertion this file could write about focus is either unfailable or a restatement of how its own
// subject was selected — both of which it used to contain (see the close cell's own note).
// `document.activeElement` after a real Back is measured in e2e/documents-viewer-walk.spec.ts, and
// only there.
//
// THE HISTORY VERBS ARE THE SUBJECT, not the resulting address. A push and a replace reach the same
// URL and differ only in what Back then does, so a cell that asserted the address would pass on the
// exact defect this file exists to catch. `makeNavigation` (documents-test-fixtures.ts) records the
// verb of every navigation, and these cells assert on that sequence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentsWorkbench } from "./documents-workbench";
import { DOCUMENT_HEADING_ID } from "./document-detail";
import { applyDocumentTabParam, isDocumentTab, parseDocumentTabParam } from "../../lib/documents/url-state";
import {
  DOCUMENTS_CLIENT, DOC_PDF, DOC_XML, DOC_ROWS,
  documentsApp, documentsFetch, makeNavigation, type Navigation,
} from "./documents-test-fixtures";

// The detail panel mounts @base-ui/react primitives (DocumentAdmin's Select, the door dialogs)
// whose floating-ui internals feature-detect against `window.Element`/`Node` — see
// test/domInspect.ts:435-460.
enableDomInspection();

type StubNode = { tagName?: string; childNodes?: StubNode[]; getAttribute?: (n: string) => string | null };

type Harness = Awaited<ReturnType<typeof renderComponent>> & { sync: () => Promise<void>; nav: Navigation };

async function withWorkbench(
  opts: { search?: string; docs?: Record<string, Record<string, unknown>> },
  run: (h: Harness) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = documentsFetch({ docs: opts.docs });
  configureSessionTokenSource(async () => "tok");

  const nav = makeNavigation(opts.search ?? "");
  const tree = () => documentsApp(createElement(DocumentsWorkbench, { clientId: DOCUMENTS_CLIENT }), nav);
  const base = await renderComponent(tree());
  const h: Harness = Object.assign(base, {
    nav,
    sync: async () => {
      await base.rerender(tree());
      for (let i = 0; i < 8; i++) await base.settle();
    },
  });
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    await run(h);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

function rowFor(h: Harness, filename: string): StubNode {
  const row = h.find((n) => n.tagName === "TR" && textOf(n).includes(filename));
  assert.ok(row, `the filed row for ${filename} must render`);
  return row as unknown as StubNode;
}

async function openRow(h: Harness, filename: string): Promise<StubNode> {
  const row = rowFor(h, filename);
  await h.fireEvent(row as never, "click");
  for (let i = 0; i < 6; i++) await h.settle();
  await h.sync();
  return row;
}

test("[the defect] selecting a document PUSHES ?document=<uuid> — the address names what is open", async () => {
  await withWorkbench({}, async (h) => {
    assert.equal(h.nav.search(), "", "control: nothing is selected on a bare load");
    assert.match(h.text(), /Select a document to see its evidence/);

    await openRow(h, "invoice-april.pdf");

    assert.equal(h.nav.search(), `document=${DOC_PDF}`);
    assert.deepEqual(h.nav.kinds(), ["push"], "opening a document must be a real history entry, or Back cannot close it");
    assert.match(h.text(), /invoice-april\.pdf/);
    assert.doesNotMatch(h.text(), /Select a document to see its evidence/, "the empty state must be gone once a document is open");
  });
});

test("a reload at ?document=<uuid> RESTORES the selection — the property React state could never have", async () => {
  await withWorkbench({ search: `document=${DOC_PDF}` }, async (h) => {
    // No click anywhere: this is a fresh mount at that address, exactly what a refresh or a shared
    // link produces.
    assert.match(h.text(), /invoice-april\.pdf/);
    assert.deepEqual(h.nav.kinds(), [], "restoring a selection from the URL must not itself navigate");
  });
});

test("stepping to ANOTHER document REPLACES — Back returns to the list, not backwards through every row clicked", async () => {
  await withWorkbench({}, async (h) => {
    await openRow(h, "invoice-april.pdf");
    await openRow(h, "myinvois-e-invoice.xml");

    assert.equal(h.nav.search(), `document=${DOC_XML}`);
    assert.deepEqual(
      h.nav.kinds(),
      ["push", "replace"],
      "the first open is a place to come back to; changing what the one panel shows is not",
    );
  });
});

test("Closing a pushed detail POPS its entry, clears the address, and leaves the originating row on the page", async () => {
  // RETITLED TO WHAT THIS HARNESS CAN SEE, because the previous title ("…and returns focus to the
  // row that opened it") claimed a property it could not measure and its two focus assertions were
  // both structurally unfailable:
  //
  //   · `assert.notEqual(activeElement(), null)` — test/domInspect.ts:436 initialises
  //     `activeElement` to `doc.body` and :254 resets it to `doc.body` on blur. It is never null,
  //     so that line could not fail for any implementation.
  //   · `active === row || textOf(row).includes("invoice-april.pdf")` — `row` was SELECTED by the
  //     predicate `textOf(n).includes(filename)`, so the right-hand disjunct is the selection
  //     criterion restated. It is true by construction, which made the whole assertion true
  //     regardless of the left-hand one.
  //
  // Measured consequence: deleting the WHOLE focus effect (documents-workbench.tsx — both
  // `focusHeading` and `restoreRow`) left this file at 10 pass / 0 fail, unchanged from baseline.
  //
  // FOCUS RETURN IS MEASURED IN THE BROWSER, and only there: "the row that opened it takes focus
  // back after the pop" is a claim about a real focus manager, a real `requestAnimationFrame` and
  // @base-ui/react's one-frame focus guard, none of which exist here. Its home is the
  // `URL: ?document= survives a reload, and the browser's own Back button closes the detail` cell
  // in e2e/documents-viewer-walk.spec.ts, which polls `document.activeElement` after
  // `page.goBack()` and requires it to be the row rather than <body>. What THIS cell owns is the
  // part the DOM harness can see: the history verb, the address, the detail being gone, and the
  // originating row being back in the tree at all — the precondition without which focus return
  // has no target to reach.
  await withWorkbench({}, async (h) => {
    await openRow(h, "invoice-april.pdf");
    assert.match(h.text(), /invoice-april\.pdf/);

    const close = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Close");
    assert.ok(close, "an open detail must offer a close control — Escape and the browser Back are not the only ways out");
    await clickButton(close!);
    for (let i = 0; i < 6; i++) await h.settle();
    await h.sync();

    assert.deepEqual(h.nav.kinds(), ["push", "back"], "closing a pushed detail must POP that entry, never write a third one");
    assert.equal(h.nav.search(), "", "…and the address stops naming a document that is no longer open");
    assert.match(h.text(), /Select a document to see its evidence/);

    // THE ROW IS BACK IN THE TREE — re-queried after the close rather than reusing the node the
    // open returned, which would be the same tautology in a new spelling.
    const reopened = h.find((n) => n.tagName === "TR" && textOf(n).includes("invoice-april.pdf"));
    assert.ok(reopened, "the originating row must be back on the page — without it focus return has nothing to return to");
  });
});

test("a page loaded DIRECTLY at ?document= closes by REPLACE — there is no entry to pop, and Back must not leave the tab", async () => {
  await withWorkbench({ search: `document=${DOC_PDF}` }, async (h) => {
    const close = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Close");
    assert.ok(close);
    await clickButton(close!);
    for (let i = 0; i < 6; i++) await h.settle();
    await h.sync();

    assert.deepEqual(h.nav.kinds(), ["replace"], "a bookmark has no history entry of its own to pop");
    assert.equal(h.nav.search(), "");
  });
});

test("a MALFORMED id renders the not-available state and CLEARS the parameter", async () => {
  await withWorkbench({ search: "document=not-a-uuid" }, async (h) => {
    await h.sync();
    assert.match(h.text(), /That document isn't available in this client/);
    assert.equal(h.nav.search(), "", "the address must stop repeating an id it cannot mean");
    assert.deepEqual(h.nav.kinds(), ["replace"], "clearing a bad address is a correction, never a new place to come back to");
    // …and it is NOT the ordinary empty state, which would be an answer to a question nobody asked.
    assert.doesNotMatch(h.text(), /Select a document to see its evidence/);
  });
});

test("an UNKNOWN but well-formed id — another client's document — renders the same not-available state and clears the parameter", async () => {
  // The door collapses absent / another firm's / not-filed-to-this-client into ONE shape on
  // purpose (no existence oracle), so the surface must not claim to know which of the three it is.
  const onlyXml = { [DOC_XML]: DOC_ROWS[DOC_XML]! };
  await withWorkbench({ search: `document=${DOC_PDF}`, docs: onlyXml }, async (h) => {
    for (let i = 0; i < 8; i++) await h.settle();
    await h.sync();
    assert.match(h.text(), /That document isn't available in this client/);
    assert.equal(h.nav.search(), "");
  });
});

test("the detail exports a heading id, and it is on the document's own name", async () => {
  // The workbench moves focus to this element on open (documents-workbench.tsx). An id that names
  // nothing is a focus target that silently does not exist, which is precisely the "focus drops to
  // body" class the exported-heading-id idiom was introduced to close.
  await withWorkbench({ search: `document=${DOC_PDF}` }, async (h) => {
    const heading = h.find((n) => (n as StubNode).getAttribute?.("id") === DOCUMENT_HEADING_ID);
    assert.ok(heading, `the detail must render an element with id="${DOCUMENT_HEADING_ID}"`);
    assert.match(textOf(heading!), /invoice-april\.pdf/, "the heading a reader lands on must name the DOCUMENT, not the panel");
  });
});

// ---------------------------------------------------------------------------------------------
// THE READ'S OWN RECOVERY CONTROL — the gap the matrix named "no retry anywhere in the documents
// surface". `DoorFeedback` never populated StateBanner's `action` slot, though `useHydratedPart`
// had exposed `reload` all along, so a document detail that failed to load was a dead end whatever
// the reason. It is wired now, and the KIND decides: a transport or server failure recovers by
// itself, a 401/403/404 answers identically however many times it is asked, and a governed refusal
// is a decision rather than a failure.
// ---------------------------------------------------------------------------------------------

/** A workbench whose FILED read fails the way `impl` says, so the failure banner is on screen. */
async function withFailingFiled(
  impl: typeof fetch,
  run: (h: Awaited<ReturnType<typeof renderComponent>>) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  const nav = makeNavigation("");
  const h = await renderComponent(documentsApp(createElement(DocumentsWorkbench, { clientId: DOCUMENTS_CLIENT }), nav));
  try {
    for (let i = 0; i < 10; i++) await h.settle();
    await run(h);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

/** Fails `document_filings` with `status`, answers everything else honestly. */
function filedFails(status: number, calls: { n: number }): typeof fetch {
  const ok = documentsFetch({});
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/document_filings")) {
      calls.n += 1;
      return new Response(JSON.stringify({ message: "nope" }), { status, headers: { "content-type": "application/json" } });
    }
    return ok(input as never, init as never);
  }) as typeof fetch;
}

test("[the gap] a failed filed read now offers RETRY, and pressing it re-reads", async () => {
  const calls = { n: 0 };
  await withFailingFiled(filedFails(500, calls), async (h) => {
    const retry = h.find((n) => (n as StubNode).getAttribute?.("data-testid") === "documents-filed-retry");
    assert.ok(retry, "a server failure recovers by itself — the banner must carry a control that says so");
    const before = calls.n;
    assert.ok(before > 0, "control: the read must actually have been attempted");
    await clickButton(retry as never);
    for (let i = 0; i < 8; i++) await h.settle();
    assert.ok(calls.n > before, `Retry must issue a SECOND read — saw ${calls.n}, unchanged from ${before}`);
  });
});

test("a DENIED filed read offers no Retry — a control that cannot work is worse than none", async () => {
  const calls = { n: 0 };
  await withFailingFiled(filedFails(403, calls), async (h) => {
    assert.equal(
      h.find((n) => (n as StubNode).getAttribute?.("data-testid") === "documents-filed-retry"),
      null,
      "a 403 answers identically however many times it is asked",
    );
    // …and the honest sentence is still there: withholding the control is not withholding the news.
    assert.match(h.text(), /You don't have access to this/);
  });
});

// =============================================================================================
// #646 — `?tab=original|facts|accounting`, the SECOND parameter on the SAME route.
//
// These cells are about the PARSER and the FOLD, which is where the whole contract lives: which
// values are real views, what an unrecognised one does, and — the property a careless
// implementation loses — that the default view writes NO parameter at all, so every `?document=`
// link #624 published still names the same address it always did.
// =============================================================================================

test("#646 the tab parameter admits exactly the three routed views, and anything else reads as Original", () => {
  const parse = (search: string) => parseDocumentTabParam(new URLSearchParams(search));
  assert.equal(parse(""), "original", "no parameter is the default view, not an error");
  assert.equal(parse("tab=original"), "original");
  assert.equal(parse("tab=facts"), "facts");
  assert.equal(parse("tab=accounting"), "accounting");
  // A MALFORMED TAB IS NOT A THIRD ANSWER, deliberately — unlike `?document=`, where a bad uuid is
  // a stale link that owes someone a not-found state. There is nothing to "not find" here: the
  // document the address named is open, and the honest answer is the view it opens on.
  assert.equal(parse("tab=ledger"), "original", "a hand-edited view name falls back, it does not error");
  assert.equal(parse("tab="), "original");
  assert.equal(parse("tab=FACTS"), "original", "the check is exact — no case folding a link could not rely on");
  assert.equal(isDocumentTab("facts"), true);
  assert.equal(isDocumentTab("ledger"), false);
  assert.equal(isDocumentTab(null), false);
});

test("#646 the DEFAULT view writes no tab parameter, and every other parameter survives the fold", () => {
  const base = new URLSearchParams("document=11111111-1111-4111-8111-111111111111&page=2");
  const facts = applyDocumentTabParam(base, "facts");
  assert.equal(facts.get("tab"), "facts");
  assert.equal(facts.get("document"), "11111111-1111-4111-8111-111111111111", "the document parameter is untouched");
  assert.equal(facts.get("page"), "2", "and so is everything else on the URL");
  assert.equal(base.get("tab"), null, "the input is not mutated — a NEW instance comes back");

  // THE PROPERTY THAT PROTECTS #624's PUBLISHED LINKS: the default view DELETES the key rather than
  // writing `?tab=original`, so the address for "the document, as it opens" is byte-identical to
  // the one this surface has been handing out since #719.
  const back = applyDocumentTabParam(facts, "original");
  assert.equal(back.get("tab"), null, "switching back to Original leaves no dead parameter behind");
  assert.equal(back.toString(), base.toString(), "and the URL is exactly the one #624 published");
  assert.equal(applyDocumentTabParam(facts, null).get("tab"), null);
});
