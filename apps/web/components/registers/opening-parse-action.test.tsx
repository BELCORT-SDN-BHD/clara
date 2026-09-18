// #656 — the "Read this document" action and, more importantly, WHAT IT SAYS AFTERWARDS.
//
// The producer's whole value is that it names the lines it could not read. That value is destroyed
// by a surface that paraphrases the refusal, truncates it, or shows it in something that fades. So
// these cells hold the outcome table:
//
//   · a 422 named refusal renders VERBATIM, with its counts and failing row keys, as a PERSISTENT
//     block (never a toast), and the basis stays usable underneath it;
//   · `no_opening_tb_lines` is NOT painted as an error — it is the honest keyed-fallback signal;
//   · a 403 renders the DENIED state and names the restriction, never "no opening seed yet" (the
//     defect `opening-register.tsx:66-75` records from the other end of this lane);
//   · a chart gap names the accounts;
//   · a transport failure is classified by KIND and quotes no body.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { isKeyedFallback, parseOpeningSource } from "../../lib/registers/opening-source";
import { OpeningParseAction } from "./opening-parse-action";
import messages from "../../messages/en.json";

enableDomInspection();

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function withRoute(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
  run: (ctx: { calls: string[] }) => Promise<void>,
): Promise<void> {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  configureSessionTokenSource(async () => "tok");
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    calls.push(url);
    return respond(url, init);
  }) as typeof fetch;
  try {
    await run({ calls });
  } finally {
    globalThis.fetch = originalFetch;
    resetSessionTokenSource();
  }
}

// ---------------------------------------------------------------------------------------------
// The wire.
// ---------------------------------------------------------------------------------------------

test("every answer the route contracts becomes a typed outcome, and the reason travels verbatim", async () => {
  const NAMED = "3 opening_tb.line region(s) did not parse: reg-4, reg-9, reg-11";
  const cases: Array<[number, unknown, unknown]> = [
    [202, { status: "parsed", lines: 5 }, { kind: "parsed", lines: 5 }],
    [422, { status: "unparseable", reason: NAMED }, { kind: "unparseable", reason: NAMED, unmappedAccounts: [] }],
    [422, { status: "unparseable", reason: "no_opening_tb_lines" }, { kind: "unparseable", reason: "no_opening_tb_lines", unmappedAccounts: [] }],
    [422, { status: "unparseable", reason: "account 777-XYZ is printed on this document but is not in this client's chart of accounts", unmapped_accounts: ["777-XYZ"] },
      { kind: "unparseable", reason: "account 777-XYZ is printed on this document but is not in this client's chart of accounts", unmappedAccounts: ["777-XYZ"] }],
    [409, { status: "conflict", reason: "registry_not_open" }, { kind: "refused", reason: "registry_not_open", code: null }],
    [409, { status: "refused", code: "CLR31", reason: "tie_mismatch" }, { kind: "refused", reason: "tie_mismatch", code: "CLR31" }],
    [403, { error: "forbidden" }, { kind: "denied" }],
    [404, { error: "not_found" }, { kind: "not_found" }],
  ];
  for (const [status, body, expected] of cases) {
    await withRoute(() => jsonResponse(body, status), async () => {
      assert.deepEqual(await parseOpeningSource("s1"), expected, `status ${status}`);
    });
  }
});

test("the call goes to the SAME-ORIGIN proxy path, POSTs the seed and carries the session bearer", async () => {
  await withRoute((url, init) => {
    assert.equal(url, "/api/runtime/opening/parse-targets",
      "never the runtime's absolute URL — the app's own proxy maps /api/runtime/* to the runtime's /api/*");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "manual",
      "an expired cookie must surface as a redirect, never be followed into a 200 HTML login page");
    assert.deepEqual(JSON.parse(String(init?.body)), { seedId: "s1" });
    assert.match(String((init?.headers as Record<string, string>).authorization), /^Bearer /);
    return jsonResponse({ status: "parsed", lines: 1 }, 202);
  }, async () => { await parseOpeningSource("s1"); });
});

test("isKeyedFallback is TRUE only for the honest no-lines signal", () => {
  assert.equal(isKeyedFallback({ kind: "unparseable", reason: "no_opening_tb_lines", unmappedAccounts: [] }), true);
  assert.equal(isKeyedFallback({ kind: "unparseable", reason: "2 region(s) did not parse: a, b", unmappedAccounts: [] }), false);
  assert.equal(isKeyedFallback({ kind: "parsed", lines: 3 }), false);
});

// ---------------------------------------------------------------------------------------------
// The surface.
// ---------------------------------------------------------------------------------------------

async function mount() {
  let reloads = 0;
  const el = createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null,
      createElement("h1", null, "Registers"),
      createElement(OpeningParseAction, {
        seedId: "s1", busy: false, onParsed: async () => { reloads += 1; },
      })),
  });
  const h = await renderComponent(el);
  for (let i = 0; i < 4; i++) await h.settle();
  return { h, reloads: () => reloads };
}

async function click(h: Awaited<ReturnType<typeof renderComponent>>) {
  const button = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Read this document"));
  assert.ok(button, "the read action must be reachable on an open tied basis");
  await h.fireEvent(button, "click");
  for (let i = 0; i < 8; i++) await h.settle();
}

test("a 422 NAMED refusal renders VERBATIM as a persistent block, and the action stays usable", async () => {
  const NAMED = "3 opening_tb.line region(s) did not parse: reg-4, reg-9, reg-11";
  await withRoute(() => jsonResponse({ status: "unparseable", reason: NAMED }, 422), async () => {
    const { h } = await mount();
    try {
      await click(h);
      const text = h.text();
      assert.match(text, /Not read/);
      // VERBATIM — the counts AND every failing row key. Paraphrasing throws away the only thing
      // that tells a person which line to go and look at.
      assert.ok(text.includes(NAMED), `the reason must render verbatim; got: ${text}`);
      assert.match(text, /one unreadable line forfeits the whole document/,
        "…and the all-or-nothing law is said out loud, so nobody hunts for the rows that 'went through'");

      // PERSISTENT: it is still there after further settles, and the trigger is still operable.
      for (let i = 0; i < 10; i++) await h.settle();
      assert.ok(h.text().includes(NAMED), "the outcome must not fade");
      const button = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Read this document"));
      assert.ok(button && !button.disabled, "the basis stays usable — the person can fix the source and read again");
    } finally {
      await h.unmount();
    }
  });
});

test("`no_opening_tb_lines` renders as INFORMATION with the keyed path named — it is not an error", async () => {
  await withRoute(() => jsonResponse({ status: "unparseable", reason: "no_opening_tb_lines" }, 422), async () => {
    const { h } = await mount();
    try {
      await click(h);
      assert.match(h.text(), /Nothing to read/);
      assert.match(h.text(), /Key the balances instead/,
        "the honest fallback is NAMED, so the person learns what to do rather than that something broke");
      assert.doesNotMatch(h.text(), /Not read/, "it must not borrow the refusal's heading");
    } finally {
      await h.unmount();
    }
  });
});

test("a chart gap names the accounts and points at where they are created", async () => {
  await withRoute(() => jsonResponse({
    status: "unparseable",
    reason: "account 777-XYZ is printed on this document but is not in this client's chart of accounts",
    unmapped_accounts: ["777-XYZ"],
  }, 422), async () => {
    const { h } = await mount();
    try {
      await click(h);
      assert.match(h.text(), /777-XYZ/, "the account is NAMED");
      assert.match(h.text(), /Accounts tab/, "…and the person is told where to create it");
    } finally {
      await h.unmount();
    }
  });
});

test("a 403 renders the DENIED state naming the restriction — never 'no opening seed yet'", async () => {
  await withRoute(() => jsonResponse({ error: "forbidden" }, 403), async () => {
    const { h } = await mount();
    try {
      await click(h);
      assert.match(h.text(), /Not allowed/);
      assert.match(h.text(), /bookkeeper or above/, "the restriction is named");
      assert.doesNotMatch(h.text(), /no opening seed/i,
        "the defect opening-register.tsx:66-75 records is a 403 falling through to an empty state");
    } finally {
      await h.unmount();
    }
  });
});

test("a 202 renders the count and asks the caller to re-read the basis", async () => {
  await withRoute(() => jsonResponse({ status: "parsed", lines: 5 }, 202), async () => {
    const { h, reloads } = await mount();
    try {
      await click(h);
      assert.match(h.text(), /5 line\(s\) were read/);
      assert.equal(reloads(), 1, "the targets and the tie gates must move together after a successful read");
    } finally {
      await h.unmount();
    }
  });
});

test("a transport failure is classified by KIND and quotes no body", async () => {
  await withRoute(() => { throw new TypeError("network down"); }, async () => {
    const { h } = await mount();
    try {
      await click(h);
      assert.match(h.text(), /Could not reach the reader/);
      assert.match(h.text(), /transport/);
      assert.doesNotMatch(h.text(), /network down/, "a raw transport message is never surfaced unclassified");
      assert.match(h.text(), /Nothing was recorded/);
    } finally {
      await h.unmount();
    }
  });
});
