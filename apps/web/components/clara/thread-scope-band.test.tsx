// #642 AC1 — THE CONVERSATION'S SCOPE, BESIDE THE COMPOSER.
//
// THE DEFECT, measured before the change: scope was ABSENT from this screen.
// `ClaraRail.tsx:113` rendered `t("title")` ("Clara"), `ClaraFullScreenThread.tsx:53`'s
// only `<h1>` was the same word, and the ONLY sentence about scope anywhere on the
// surface was the NEGATIVE one — the firm-altitude note explaining why there is no
// attach control. A person about to send an instruction that moves a client's books had
// nothing on screen telling them whose books, on a rail mounted beside every page.
//
// THE RULE THIS FILE GUARDS HARDEST is the refusal: a name is never guessed. The band
// renders a NEUTRAL PLACEHOLDER for an identity it has not positively read, never the
// previous client's name — which is how an instruction reaches the wrong books.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraScopeBand, claraScopeText, type ClaraScopeDescriptor } from "./ClaraScopeBand";
import { ClaraThreadView } from "./ClaraThreadView";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { claraThreadStore } from "../../lib/clara/threadStore";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const THREAD = "aaaaaaaa-6421-4421-8421-642164216421";
const CLIENT = "bbbbbbbb-6421-4421-8421-642164216421";
const CALLER = "99999999-9999-4999-8999-999999999999";
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: CALLER })).toString("base64url")}.y`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function withFetch(run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/messages")) return json({ messages: [] });
    if (url.includes("/rest/v1/")) return json([]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

/** The scope copy, resolved through the real message catalogue — never a literal typed
 *  into this file, which would pass even if `messages/en.json` lost the key. */
function t(key: string, values?: Record<string, string>): string {
  const parts = key.split(".");
  let node: unknown = (messages as Record<string, unknown>).Clara;
  for (const p of ["thread", ...parts]) node = (node as Record<string, unknown>)[p];
  assert.equal(typeof node, "string", `Clara.thread.${key} must be a string in messages/en.json`);
  return String(node).replace(/\{(\w+)\}/g, (_m, name: string) => values?.[name] ?? `{${name}}`);
}

test("p642.web.scope_band_names_the_client — the four cases, as a pure function", () => {
  const at = (scope: ClaraScopeDescriptor) => claraScopeText(scope, t);
  assert.equal(
    at({ firmName: "Rome Public Advisory", clientName: "Milan Trading", clientId: CLIENT }),
    "Milan Trading · Rome Public Advisory",
    "a client-scoped conversation names the CLIENT first — it is what the instruction will move",
  );
  assert.equal(
    at({ firmName: "Rome Public Advisory", clientName: null, clientId: null }),
    "Firm-wide · Rome Public Advisory",
    "firm altitude names the firm and carries NO client name",
  );
  // THE REFUSAL. An identity that has not been published FOR THIS CLIENT resolves to
  // null upstream (`useClientIdentity` returns `name: null` unless the stored id equals
  // the URL's), and the band must render the neutral placeholder rather than a name.
  const unpublished = at({ firmName: "Rome Public Advisory", clientName: null, clientId: CLIENT });
  assert.equal(unpublished, "This client · Rome Public Advisory");
  assert.doesNotMatch(unpublished, /Milan Trading/, "never a stale name from a previous client");
  // A firm name this mount point could not read degrades too, rather than blocking.
  assert.equal(at({ firmName: null, clientName: null, clientId: null }), "Firm-wide · Your firm");
});

test("p642.web.scope_band_names_the_client — the band is reachable by ROLE and NAME, not by a testid", () => {
  // #896 left `StateBanner`'s `data-testid` broken, and the lesson is that a walk should
  // assert what a screen reader hears anyway. `role="group"` + a stable `aria-label` is
  // what both a browser walk and an assistive technology can find.
  return (async () => {
    const h = await renderComponent(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        timeZone: "Asia/Kuala_Lumpur",
        children: createElement(ClaraScopeBand, {
          scope: { firmName: "Rome Public Advisory", clientName: "Milan Trading", clientId: CLIENT },
        }),
      }) as ReactElement,
    );
    try {
      const band = h.find((n: Stub) =>
        typeof n.getAttribute === "function"
        && (n.getAttribute as (a: string) => string | null)("role") === "group"
        && (n.getAttribute as (a: string) => string | null)("aria-label") === t("scope.label"));
      assert.ok(band, "the band must expose role=group with its own accessible name");
      assert.match(h.text(), /Milan Trading · Rome Public Advisory/);
    } finally {
      await h.unmount();
    }
  })();
});

test("p642.web.scope_band_names_the_client — the per-item attribution slot (issue 664 fills it) exists and this ticket leaves it EMPTY", () => {
  return (async () => {
    const h = await renderComponent(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        timeZone: "Asia/Kuala_Lumpur",
        children: createElement(ClaraScopeBand, {
          scope: {
            firmName: "Rome Public Advisory",
            clientName: "Milan Trading",
            clientId: CLIENT,
            attributions: [{ id: "r1", label: "Result 1 · Milan Trading" }],
          },
        }),
      }) as ReactElement,
    );
    try {
      // The slot renders what it is given — which is what lets #664 fill it one altitude
      // up without a second band. #642 itself never passes any, and the cells below prove
      // the mounted thread carries none.
      assert.match(h.text(), /Result 1 · Milan Trading/);
    } finally {
      await h.unmount();
    }
  })();
});

test("p642.web.scope_band_names_the_client — the mounted thread carries the band at CLIENT altitude, above the composer", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        timeZone: "Asia/Kuala_Lumpur",
        children: createElement(ClaraThreadView, {
          auth: { getAccessToken: async () => TOKEN },
          threadId: THREAD,
          variant: "full" as const,
          clientId: CLIENT,
          firmName: "Rome Public Advisory",
          clientName: "Milan Trading",
        }),
      }) as ReactElement,
    );
    try {
      for (let i = 0; i < 6; i += 1) await h.settle();
      assert.match(h.text(), /Milan Trading · Rome Public Advisory/);
      // The firm-altitude attachment note belongs to the OTHER altitude, and must not
      // appear beside a composer that has an attach control.
      assert.doesNotMatch(h.text(), /Open a client's workspace to attach/);
    } finally {
      await h.unmount();
    }
  });
});

test("p642.web.scope_band_names_the_client — at FIRM altitude it names the firm, carries no client name, and folds the attach note in", async () => {
  claraThreadStore.reset(THREAD);
  await withFetch(async () => {
    const h = await renderComponent(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        timeZone: "Asia/Kuala_Lumpur",
        children: createElement(ClaraThreadView, {
          auth: { getAccessToken: async () => TOKEN },
          threadId: THREAD,
          variant: "rail" as const,
          firmName: "Rome Public Advisory",
        }),
      }) as ReactElement,
    );
    try {
      for (let i = 0; i < 6; i += 1) await h.settle();
      assert.match(h.text(), /Firm-wide · Rome Public Advisory/);
      assert.doesNotMatch(h.text(), /Milan Trading/, "firm altitude names no client at all");
      // The note is now the band's second sentence rather than a loose <p> in the form's
      // grid — two sentences about one scope, in one block.
      assert.match(h.text(), /Open a client's workspace to attach/);
    } finally {
      await h.unmount();
    }
  });
});
