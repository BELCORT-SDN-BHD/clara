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
import { isKeyedFallback, isSourceRereadConflict, parseOpeningSource, refreshOpeningSource } from "../../lib/registers/opening-source";
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

test("fix-round A1 (ticket 656): a trial balance the READER refused is a WARNING carrying its reason — never the keyed-fallback invitation", async () => {
  // The defect this cell stands against: the in-line producer's refusal used to be discarded at
  // the OCR pass, so a trial balance that does not balance reached this surface as
  // `no_opening_tb_lines` — an INFORMATION banner reading "this document has no trial-balance
  // lines Clara can read, key the balances instead". That invites a professional to hand-key a
  // document whose own printed figures the machine has just found inconsistent. The route now
  // answers the producer's reason verbatim (`packages/runtime/lib/opening-parse.mjs`,
  // `readOpeningRefusal`), and the face must treat it as the refusal it is.
  const REFUSAL = "trial balance does not balance: DR 130000.00 vs CR 129000.00";
  await withRoute(() => jsonResponse(
    { status: "unparseable", reason: REFUSAL, source_refusal: true, failing_rows: [] }, 422), async () => {
    const { h } = await mount();
    try {
      await click(h);
      const text = h.text();
      assert.ok(text.includes(REFUSAL), `the reader's own sentence must render verbatim; got: ${text}`);
      assert.match(text, /Not read/, "the warning state, not the information state");
      assert.doesNotMatch(text, /key the balances|type the balances/i,
        "a document the reader REFUSED must not be offered as one to hand-key");
      assert.equal(isKeyedFallback({ kind: "unparseable", reason: REFUSAL, unmappedAccounts: [] }), false);
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

// ---------------------------------------------------------------------------------------------
// #986 — THE WAY FORWARD FROM A RE-READ.
//
// `source_reread_since_parse` was an honest refusal with nowhere to go: this surface printed the
// raw token under "Refused" and the basis could not be read again OR approved, so the only way on
// was to abandon it. These cells hold the two halves of the remedy: the wire to the refresh route,
// and the fact that THIS conflict — and no other — offers the act by name.
// ---------------------------------------------------------------------------------------------

test("isSourceRereadConflict is TRUE only for the re-read conflict, never for another refusal", () => {
  assert.equal(isSourceRereadConflict({ kind: "refused", reason: "source_reread_since_parse", code: null }), true);
  assert.equal(isSourceRereadConflict({ kind: "refused", reason: "registry_not_open", code: null }), false);
  assert.equal(isSourceRereadConflict({ kind: "refused", reason: "tie_mismatch", code: "CLR31" }), false);
  assert.equal(isSourceRereadConflict({ kind: "parsed", lines: 3 }), false);
});

test("ticket 986: every answer the refresh route contracts becomes a typed outcome", async () => {
  const cases: Array<[number, unknown, unknown]> = [
    [202, { status: "refreshed", lines: 5, retired: 3 }, { kind: "refreshed", lines: 5, retired: 3 }],
    [409, { status: "refused", code: "CLR31", reason: "no_reread_to_refresh" },
      { kind: "refused", reason: "no_reread_to_refresh", code: "CLR31" }],
    [409, { status: "conflict", reason: "registry_not_open" }, { kind: "refused", reason: "registry_not_open", code: null }],
    [422, { status: "unparseable", reason: "no_opening_tb_lines" },
      { kind: "unparseable", reason: "no_opening_tb_lines", unmappedAccounts: [] }],
    [403, { error: "forbidden" }, { kind: "denied" }],
    [404, { error: "not_found" }, { kind: "not_found" }],
  ];
  for (const [status, body, expected] of cases) {
    await withRoute(() => jsonResponse(body, status), async () => {
      assert.deepEqual(await refreshOpeningSource("s1"), expected, `status ${status}`);
    });
  }
});

test("ticket 986: the refresh goes to its OWN same-origin proxy path, never the parse one", async () => {
  await withRoute((url, init) => {
    assert.equal(url, "/api/runtime/opening/refresh-targets",
      "the refresh is a second verb on the same lane, not a flag on the parse route");
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "manual");
    assert.deepEqual(JSON.parse(String(init?.body)), { seedId: "s1" });
    assert.match(String((init?.headers as Record<string, string>).authorization), /^Bearer /);
    return jsonResponse({ status: "refreshed", lines: 1, retired: 1 }, 202);
  }, async () => { await refreshOpeningSource("s1"); });
});

test("ticket 986: the re-read conflict is the ONE refusal that carries the act, and running it refreshes the basis", async () => {
  // Both verbs are routed from one handler, so this cell drives the REAL two-call sequence a
  // person makes: read -> the conflict -> refresh.
  let refreshCalls = 0;
  await withRoute((url) => {
    if (url.endsWith("/parse-targets")) {
      return jsonResponse({ status: "conflict", reason: "source_reread_since_parse" }, 409);
    }
    refreshCalls += 1;
    return jsonResponse({ status: "refreshed", lines: 5, retired: 3 }, 202);
  }, async () => {
    const { h, reloads } = await mount();
    try {
      await click(h);
      const text = h.text();
      // THE FACT, IN WORDS. The raw token told a professional nothing and named no act.
      assert.match(text, /read again/i, `the conflict must be said in words; got: ${text}`);
      assert.doesNotMatch(text, /source_reread_since_parse/,
        "the token is the runtime's vocabulary, not a person's");
      const refresh = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Refresh from the new reading"));
      assert.ok(refresh, "without the act beside it this refusal is still the dead end ticket 656 filed");

      await h.fireEvent(refresh, "click");
      for (let i = 0; i < 8; i++) await h.settle();
      assert.equal(refreshCalls, 1, "the act calls the refresh verb, never the read again");
      const after = h.text();
      assert.match(after, /5 line\(s\)/, "the new reading's count");
      assert.match(after, /3 /, "…and how many the reading it left behind had");
      assert.equal(reloads(), 1, "the targets and the tie gates must move together after a refresh");
    } finally {
      await h.unmount();
    }
  });
});

test("ticket 986: another refusal offers NO refresh — a control that cannot work is never shown", async () => {
  await withRoute(() => jsonResponse({ status: "conflict", reason: "registry_not_open" }, 409), async () => {
    const { h } = await mount();
    try {
      await click(h);
      assert.match(h.text(), /Refused/);
      assert.ok(
        !h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Refresh from the new reading")),
        "a closed registry is not a re-read; refreshing it would refuse, so the act is not offered",
      );
      assert.match(h.text(), /registry_not_open/, "…and the plain block still carries the reason verbatim");
    } finally {
      await h.unmount();
    }
  });
});
