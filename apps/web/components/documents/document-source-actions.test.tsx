// THE SOURCE-READ STATE LADDER, at the face — one cell per state a human is told apart.
//
// `lib/documents/bytes.test.ts` proves the CLASSIFIER puts each of the door's seven refusals on its
// own rung. That is a different claim from this one: a ladder that classifies correctly and then
// renders the same sentence with the same (or no) recovery control for every rung is exactly the
// defect this lane was opened for. So every cell below asserts on RENDERED TEXT and on which
// CONTROL is offered — never on the component's internal state.
//
// THE RETRY GATE IS THE SHARPEST ASSERTION HERE, in both directions. A Retry beside "the stored
// bytes no longer match the record" is a button that cannot work; the absence of one beside "the
// document store could not be reached" strands a person on a failure that fixes itself. Both
// directions are measured, and the counts at the end are what stop the whole ladder collapsing
// into one bucket while every individual cell still passes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentSourceActions, reauthenticateHref } from "./document-source-actions";
import messages from "../../messages/en.json";
import type { DocumentRow } from "../../lib/documents/types";

enableDomInspection();

const CLIENT = "c1111111-1111-4111-8111-111111111111";

const PDF: DocumentRow = {
  id: "d1111111-1111-4111-8111-111111111111", sha256: "a".repeat(64),
  original_filename: "invoice-april.pdf", mime_type: "application/pdf", byte_size: 20480,
  storage_path: "docs/pdf", uploaded_by: "u1", created_at: "2026-04-01T00:00:00Z",
  bytes_verified_at: "2026-04-01T00:00:01Z", page_count: 1, extraction_status: "done",
  document_kind: "invoice", financial_date: "2026-04-01", retention_state: "unanchored",
  retain_until: null, retention_basis: null, legal_hold: false, legal_hold_reason: null,
};

const XML: DocumentRow = { ...PDF, id: "d2222222-2222-4222-8222-222222222222", original_filename: "e-invoice.xml", mime_type: "application/xml" };

type StubNode = { tagName?: string; childNodes?: StubNode[]; getAttribute?: (n: string) => string | null; disabled?: boolean };

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children });
}

/** Everything one click of either control touches, installed for the duration of a cell and always
 *  removed: the wire, the object-URL pair, the session, and a `window.open` on the harness's OWN
 *  window (replacing it wholesale breaks @base-ui/react's `instanceof` feature detection — see
 *  document-metadata-viewer-gate.test.tsx's own note). */
async function withEnv(impl: typeof fetch, run: (saved: { href: string; download: string; rel: string }[]) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  globalThis.fetch = impl;
  URL.createObjectURL = () => "blob:fake-url";
  URL.revokeObjectURL = () => {};
  configureSessionTokenSource(async () => "tok");

  const saved: { href: string; download: string; rel: string }[] = [];
  const doc = globalThis.document as unknown as {
    createElement: (tag: string) => unknown;
    body: { appendChild: (c: unknown) => void };
  };
  const realCreateElement = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    if (tag !== "a") return realCreateElement(tag);
    const a = { href: "", download: "", rel: "", style: {} as Record<string, string>, click() {}, remove() {} };
    saved.push(a);
    return a;
  };
  try {
    await run(saved);
  } finally {
    doc.createElement = realCreateElement;
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    resetSessionTokenSource();
  }
}

function refusalFetch(status: number, body: Record<string, string>): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

/** Every announced region's text, in document order — both computed roles StateBanner can take
 *  plus the panel's own progress region, so a cell can assert on how MANY of them are speaking as
 *  well as on what they say. */
function findAnnounced(root: StubNode): string[] {
  const out: string[] = [];
  (function walk(n: StubNode) {
    const role = n.getAttribute?.("role");
    if (role === "alert" || role === "status") out.push(textOf(n as never));
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

function findButton(h: { find: (p: (n: StubNode) => boolean) => unknown }, label: string): StubNode | null {
  return h.find((n) => n.tagName === "BUTTON" && textOf(n as never).includes(label)) as StubNode | null;
}

async function mount(document_: DocumentRow) {
  const h = await renderComponent(App(createElement(DocumentSourceActions, { document: document_, clientId: CLIENT })));
  for (let i = 0; i < 4; i++) await h.settle();
  return h;
}

/** Presses Download and settles. Download is the control every document has, which is what makes it
 *  the honest driver for a cell about the READ's outcome rather than about the preview gate. */
async function pressDownload(h: Awaited<ReturnType<typeof mount>>) {
  const button = findButton(h, "Download original");
  assert.ok(button, "the download control must render for every stored type");
  await clickButton(button as never);
  for (let i = 0; i < 8; i++) await h.settle();
}

// ---------------------------------------------------------------------------------------------
// The two controls, and which types get which
// ---------------------------------------------------------------------------------------------
test("a viewable type is offered BOTH controls; an un-previewable one is offered the download and the honest reason", async () => {
  await withEnv(async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } }), async () => {
    const pdf = await mount(PDF);
    try {
      assert.ok(findButton(pdf, "Open original"), "a PDF can be shown in a tab");
      assert.ok(findButton(pdf, "Download original"));
      assert.doesNotMatch(pdf.text(), /can't be shown in a browser tab/);
    } finally { await pdf.unmount(); }

    const xml = await mount(XML);
    try {
      assert.equal(findButton(xml, "Open original"), null, "a type the viewer wall refuses must not be offered a tab");
      assert.ok(findButton(xml, "Download original"), "…and must still be obtainable, which is the whole reason the second control exists");
      assert.match(xml.text(), /can't be shown in a browser tab/, "the reason STANDS, before anybody presses anything");
      assert.match(xml.text(), /application\/xml/);
    } finally { await xml.unmount(); }
  });
});

test("both controls carry an accessible name that NAMES THE DOCUMENT, not just the verb", async () => {
  await withEnv(async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } }), async () => {
    const h = await mount(PDF);
    try {
      const open = findButton(h, "Open original");
      const download = findButton(h, "Download original");
      assert.equal(open?.getAttribute?.("aria-label"), "Open original — invoice-april.pdf");
      assert.equal(download?.getAttribute?.("aria-label"), "Download original — invoice-april.pdf");
      // A page can carry several of these (one per open panel); two buttons both called
      // "Download original" are two identical entries in a screen reader's control list.
      assert.notEqual(open?.getAttribute?.("aria-label"), download?.getAttribute?.("aria-label"));
    } finally { await h.unmount(); }
  });
});

test("BUSY is announced and is a real gate: aria-busy, a progress name, and both controls disabled", async () => {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((r) => { release = r; });
  await withEnv(async () => {
    await gate;
    return new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } });
  }, async () => {
    const h = await mount(PDF);
    try {
      const download = findButton(h, "Download original")!;
      await clickButton(download as never);
      for (let i = 0; i < 3; i++) await h.settle();

      const busyButton = findButton(h, "Preparing");
      assert.ok(busyButton, "the pressed control must say what it is doing");
      assert.equal(busyButton?.getAttribute?.("aria-busy"), "true");
      assert.equal(busyButton?.getAttribute?.("aria-label"), "Preparing invoice-april.pdf for download…");
      assert.match(h.text(), /Preparing invoice-april\.pdf for download…/, "…and the same sentence reaches the live region");

      // THE OTHER control must be shut too — two concurrent reads of the same document would
      // produce two saves and two audit lines for one human intention.
      assert.equal(findButton(h, "Open original")?.disabled, true);

      release?.();
      for (let i = 0; i < 8; i++) await h.settle();
      assert.equal(findButton(h, "Preparing"), null, "the busy state must clear when the read settles");
    } finally { await h.unmount(); }
  });
});

// ---------------------------------------------------------------------------------------------
// One cell per rung of the ladder
// ---------------------------------------------------------------------------------------------
const RUNGS = [
  { name: "denied", status: 403, body: { error: "no_membership" }, sentence: /no longer have access to this firm's documents/, retry: false },
  { name: "not_found", status: 404, body: { error: "not_found" }, sentence: /isn't available in this client/, retry: false },
  { name: "custody_pending", status: 409, body: { error: "custody_pending" }, sentence: /still verifying this file's stored copy/, retry: true },
  { name: "storage_unavailable", status: 502, body: { error: "storage_error", reason: "unavailable" }, sentence: /document store couldn't be reached/, retry: true },
  { name: "integrity", status: 502, body: { error: "checksum_mismatch" }, sentence: /no longer matches the record Clara holds/, retry: false },
  { name: "server_error", status: 500, body: { error: "internal" }, sentence: /problem sending this file/, retry: true },
] as const;

for (const rung of RUNGS) {
  test(`${rung.name}: its own sentence, and Retry ${rung.retry ? "IS" : "is NOT"} offered`, async () => {
    await withEnv(refusalFetch(rung.status, rung.body as Record<string, string>), async (saved) => {
      const h = await mount(PDF);
      try {
        await pressDownload(h);
        assert.match(h.text(), rung.sentence, `the ${rung.name} rung must render its own sentence`);
        assert.deepEqual(saved, [], "a refused read must never reach the anchor");

        const retry = findButton(h, "Retry");
        if (rung.retry) {
          assert.ok(retry, `${rung.name} recovers on its own — withholding Retry strands the reader on a failure that fixes itself`);
        } else {
          assert.equal(retry, null, `${rung.name} answers identically on a second attempt — a Retry there is a control that cannot work`);
        }
        // The re-authenticate action belongs to exactly one rung, and this is not it.
        assert.equal(findButton(h, "Sign in again"), null);
      } finally { await h.unmount(); }
    });
  });
}

test("unauthenticated: the expired-session rung gets a RE-AUTHENTICATE action, never a Retry", async () => {
  await withEnv(refusalFetch(401, { error: "unauthenticated" }), async () => {
    const h = await mount(PDF);
    try {
      await pressDownload(h);
      assert.match(h.text(), /Your session expired while this file was being read/);
      assert.ok(findButton(h, "Sign in again"), "a dead session is recovered by signing in, not by pressing the same button again");
      assert.equal(findButton(h, "Retry"), null, "retrying with no session answers 401 again");
    } finally { await h.unmount(); }
  });
});

test("the re-authenticate destination preserves the RETURN URL, query included", async () => {
  // `lib/supabase/proxy.ts` sends an unauthenticated request to /login?next=<pathname> and drops
  // the query wholesale. This builder keeps the search too, which is what makes a reader whose
  // session expired on ?document=<id> come back to that document rather than to the bare tab.
  assert.equal(
    reauthenticateHref({ pathname: "/clients/c-1/documents", search: "?document=d-1" }),
    "/login?next=%2Fclients%2Fc-1%2Fdocuments%3Fdocument%3Dd-1",
  );
  assert.equal(reauthenticateHref({ pathname: "/clients/c-1/documents", search: "" }), "/login?next=%2Fclients%2Fc-1%2Fdocuments");
  // …and the value is ENCODED, so it cannot smuggle a second parameter into /login's own query.
  assert.doesNotMatch(reauthenticateHref({ pathname: "/a", search: "?x=1&next=/evil" }), /next=\/evil/);
});

test("RETRY actually re-runs the read, and a recovered read clears the banner", async () => {
  let call = 0;
  await withEnv(async () => {
    call += 1;
    return call === 1
      ? new Response(JSON.stringify({ error: "storage_error", reason: "unavailable" }), { status: 502, headers: { "content-type": "application/json" } })
      : new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } });
  }, async (saved) => {
    const h = await mount(PDF);
    try {
      await pressDownload(h);
      assert.match(h.text(), /document store couldn't be reached/);
      assert.equal(saved.length, 0, "control: nothing was saved by the failed attempt");

      const retry = findButton(h, "Retry");
      assert.ok(retry);
      await clickButton(retry as never);
      for (let i = 0; i < 10; i++) await h.settle();

      assert.equal(call, 2, "Retry must issue a SECOND read, not repaint the first one's outcome");
      assert.doesNotMatch(h.text(), /document store couldn't be reached/, "a recovered read must clear the standing failure");
      assert.equal(saved.length, 1, "…and the recovered read must actually save the file");
      assert.equal(saved[0]!.download, "invoice-april.pdf");
    } finally { await h.unmount(); }
  });
});

test("THE LADDER DOES NOT COLLAPSE: seven refusals produce seven distinct rendered sentences", async () => {
  // Every cell above passes against a component that renders one constant sentence per rung — so
  // long as each constant happens to match its own regex. This is the control on all of them.
  const rendered = new Set<string>();
  const cases = [
    [401, { error: "unauthenticated" }],
    [403, { error: "no_membership" }],
    [404, { error: "not_found" }],
    [409, { error: "custody_pending" }],
    [502, { error: "storage_error" }],
    [502, { error: "checksum_mismatch" }],
    [500, { error: "internal" }],
  ] as const;
  for (const [status, body] of cases) {
    await withEnv(refusalFetch(status, body as Record<string, string>), async () => {
      const h = await mount(PDF);
      try {
        await pressDownload(h);
        // The banner's text only — the rest of the panel is identical in every case.
        //
        // THE FIRST role=status ON THIS PANEL IS THE PROGRESS REGION, and it is EMPTY once a read
        // has settled. Taking `find`'s first match therefore collected "" seven times and the whole
        // control passed nothing but its own bug. The subject is the announced node that actually
        // says something.
        const announced = findAnnounced(h.container as unknown as StubNode).filter((text) => text.trim().length > 0);
        assert.equal(announced.length, 1, `the ${status} case must render exactly ONE non-empty announced outcome, saw ${announced.length}`);
        rendered.add(announced[0]!);
      } finally { await h.unmount(); }
    });
  }
  assert.equal(rendered.size, 7, `seven refusals must read seven different ways — saw ${rendered.size}:\n${[...rendered].join("\n---\n")}`);
});

test("the outcome is PERSISTENT, and it is announced — a refusal is never a toast", async () => {
  await withEnv(refusalFetch(403, { error: "no_membership" }), async () => {
    const h = await mount(PDF);
    try {
      await pressDownload(h);
      const banner = h.find((n) => (n as StubNode).getAttribute?.("role") === "alert");
      assert.ok(banner, "a withheld capability interrupts — role=alert, the StateBanner's own computed role for the warning rung");
      // Still there several settles later: nothing dismisses it on a timer.
      for (let i = 0; i < 10; i++) await h.settle();
      assert.match(h.text(), /no longer have access to this firm's documents/);
    } finally { await h.unmount(); }
  });
});

test("the client scope travels on BOTH controls — a read that silently dropped it would widen the door", async () => {
  const urls: string[] = [];
  await withEnv(async (url) => {
    urls.push(String(url));
    return new Response(new Blob(["x"]), { status: 200, headers: { "content-type": "application/pdf" } });
  }, async () => {
    const h = await mount(PDF);
    try {
      await pressDownload(h);
      assert.equal(urls.length, 1);
      assert.match(urls[0]!, new RegExp(`\\?client=${CLIENT}&disposition=attachment$`));
    } finally { await h.unmount(); }
  });
});
