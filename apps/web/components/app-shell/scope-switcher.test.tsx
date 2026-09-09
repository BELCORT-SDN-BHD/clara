// THE SCOPE SWITCHER (#614) — "whose books am I in, and take me to the same
// place in someone else's".
//
// THE CLAIM WORTH TESTING is not that a menu opens. It is that each row's
// DESTINATION is computed by `switchClientDestination` rather than hard-coded to
// the client's home — that is the whole reason this control exists rather than a
// link to the register — and that the three read states stay three different
// sentences.
//
// WHY THE MENU IS DRIVEN BY THE `open` PROP. Base UI portals the popup, so its
// contents exist only while it is open, and reaching them through a real pointer
// sequence in a harness with no hit-testing would be asserting the harness. The
// component takes an optional controlled `open` for exactly this, the same shape
// `SidebarProvider` already offers. What that means this file does NOT claim:
// that clicking the trigger opens it, that arrow keys move between rows, or that
// focus returns to the trigger on close. Those need a real focus manager and
// belong to the browser leg.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import type { SessionTokenAccessor } from "../../lib/session";
import { ScopeSwitcher, SCOPE_SWITCHER_CAP } from "./scope-switcher";
import { SidebarProvider } from "../ui/sidebar";

enableDomInspection();

type Stub = Record<string, unknown>;

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

const CLIENTS = [
  { id: A, name: "Rome Properties", status: "active", created_at: "2026-01-01T00:00:00.000Z" },
  { id: B, name: "Bee Creative Solution", status: "active", created_at: "2026-02-01T00:00:00.000Z" },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withFetch(impl: (url: string) => Response, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL) => impl(String(input))) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

const attr = (node: Stub, name: string): string | null => {
  const get = node.getAttribute as ((n: string) => string | null) | undefined;
  return get ? get.call(node, name) : null;
};

/** The popup is PORTALLED into `document.body`, so the harness's own container
 *  walk cannot see it. Walk the document instead. */
function documentRoot(): Stub {
  return (globalThis as unknown as { document: { body: Stub } }).document.body;
}

function collect(root: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const visit = (n: Stub) => {
    if (predicate(n)) out.push(n);
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) visit(c);
  };
  visit(root);
  return out;
}

const menuAnchors = () =>
  collect(documentRoot(), (n) => (n.tagName as string | undefined) === "A" && attr(n, "href") !== null);

const documentText = () => textOf(documentRoot());

function tree({
  pathname,
  query = "",
  clientId = null,
  clientName = null,
  open = true,
}: {
  pathname: string;
  query?: string;
  clientId?: string | null;
  clientName?: string | null;
  open?: boolean;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: () => {},
          refresh: () => {},
          push: () => {},
          back: () => {},
          forward: () => {},
          prefetch: () => {},
        } as never,
      },
      createElement(
        PathnameContext.Provider as never,
        { value: pathname as never },
        createElement(SidebarProvider, {
          children: createElement(ScopeSwitcher, {
            pathname,
            searchParams: new URLSearchParams(query),
            clientId,
            clientName,
            firmName: "E2E Accounting",
            session,
            open,
            onOpenChange: () => {},
          }),
        }),
      ),
    ),
  });
}

async function settleUntil(
  h: { settle: () => Promise<void> },
  condition: () => boolean,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}\n--- rendered ---\n${documentText()}`);
    await h.settle();
  }
}

// ── the trigger says where you are ──────────────────────────────────────────

test("the trigger names the CURRENT scope: the firm outside a client, the client inside one", async () => {
  await withFetch(
    () => json(CLIENTS),
    async () => {
      const firm = await renderComponent(tree({ pathname: "/", open: false }));
      try {
        const text = textOf(firm.container);
        assert.match(text, /E2E Accounting/);
        assert.match(text, /Firm/, "the caption must say which KIND of scope this is");
        assert.doesNotMatch(text, /Client/);
      } finally {
        await firm.unmount();
      }

      const client = await renderComponent(
        tree({ pathname: `/clients/${A}`, clientId: A, clientName: "Rome Properties", open: false }),
      );
      try {
        const text = textOf(client.container);
        assert.match(text, /Rome Properties/);
        assert.match(text, /Client/);
      } finally {
        await client.unmount();
      }
    },
  );
});

test("the read runs on OPEN, not on mount — a menu nobody opens costs no request", async () => {
  let calls = 0;
  await withFetch(
    () => {
      calls += 1;
      return json(CLIENTS);
    },
    async () => {
      const h = await renderComponent(tree({ pathname: "/", open: false }));
      try {
        await h.settle();
        assert.equal(calls, 0, "the client register was read for a closed menu");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── the destinations ────────────────────────────────────────────────────────

test("each client row keeps the DESTINATION KIND — switching from Journals lands on the new client's Journals", async () => {
  await withFetch(
    () => json(CLIENTS),
    async () => {
      const h = await renderComponent(
        tree({ pathname: `/clients/${A}/journals`, clientId: A, clientName: "Rome Properties" }),
      );
      try {
        await settleUntil(h, () => documentText().includes("Bee Creative Solution"), "the client rows");
        const hrefs = menuAnchors().map((a) => attr(a, "href")!);
        // THE DISCRIMINATING ASSERTION: `/clients/B/journals`, not `/clients/B`.
        // A switcher that always landed on the home would pass a "the row exists"
        // test and fail the journey this control was built for.
        assert.equal(hrefs.includes(`/clients/${B}/journals`), true, `got: ${hrefs.join(", ")}`);
        // The firm-home and all-clients rows are the menu's own two, always there.
        assert.equal(hrefs.includes("/"), true);
        assert.equal(hrefs.includes("/clients"), true);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a register VIEW travels, a THREAD does not — the two rules the tree owns, seen through the menu", async () => {
  await withFetch(
    () => json(CLIENTS),
    async () => {
      const withTab = await renderComponent(
        tree({ pathname: `/clients/${A}/registers`, query: "tab=fixedAssets", clientId: A }),
      );
      try {
        await settleUntil(withTab, () => documentText().includes("Bee Creative Solution"), "the client rows");
        const hrefs = menuAnchors().map((a) => attr(a, "href")!);
        assert.equal(hrefs.includes(`/clients/${B}/registers?tab=fixedAssets`), true, `got: ${hrefs.join(", ")}`);
      } finally {
        await withTab.unmount();
      }

      const thread = await renderComponent(
        tree({ pathname: `/clients/${A}/clara/thread-1`, clientId: A }),
      );
      try {
        await settleUntil(thread, () => documentText().includes("Bee Creative Solution"), "the client rows");
        const hrefs = menuAnchors().map((a) => attr(a, "href")!);
        // One conversation about one client; there is no corresponding thread
        // under B, and resolving to one would be the cross-client leak
        // components/client-scope-provider.tsx exists to prevent.
        assert.equal(hrefs.includes(`/clients/${B}`), true, `got: ${hrefs.join(", ")}`);
        assert.deepEqual(hrefs.filter((href) => href.includes("/clara/")), []);
      } finally {
        await thread.unmount();
      }
    },
  );
});

test("the client you are already in is MARKED, and it is the only one", async () => {
  await withFetch(
    () => json(CLIENTS),
    async () => {
      const h = await renderComponent(
        tree({ pathname: `/clients/${A}`, clientId: A, clientName: "Rome Properties" }),
      );
      try {
        await settleUntil(h, () => documentText().includes("Bee Creative Solution"), "the client rows");
        const marked = menuAnchors().filter((a) => attr(a, "aria-current") !== null);
        assert.equal(marked.length, 1, "exactly one row is the current scope");
        assert.equal(attr(marked[0]!, "href"), `/clients/${A}`);
        // The check glyph is decorative; the sr-only word is what a screen
        // reader gets, so the mark is not colour-and-icon only.
        assert.match(textOf(marked[0]!), /Current client/);
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── the three read states ───────────────────────────────────────────────────

test("a FAILED register read renders an honest note — never an empty list, which is a different sentence", async () => {
  await withFetch(
    () => json({ message: "denied" }, 500),
    async () => {
      const h = await renderComponent(tree({ pathname: "/" }));
      try {
        await settleUntil(h, () => /Couldn't read your client register/.test(documentText()), "the read-error note");
        const hrefs = menuAnchors().map((a) => attr(a, "href")!);
        // No client row was invented from nothing…
        assert.deepEqual(hrefs.filter((href) => href.startsWith("/clients/")), []);
        // …and the menu's own two destinations still work: one section's failed
        // read must not take the rest of the control down with it.
        assert.equal(hrefs.includes("/clients"), true);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a register read that lands EMPTY says so, and says something different from the failure", async () => {
  await withFetch(
    () => json([]),
    async () => {
      const h = await renderComponent(tree({ pathname: "/" }));
      try {
        await settleUntil(h, () => /No clients yet/.test(documentText()), "the empty note");
        assert.doesNotMatch(documentText(), /Couldn't read your client register/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the list is CAPPED and says how to reach the rest — never silently truncated", async () => {
  const many = Array.from({ length: SCOPE_SWITCHER_CAP + 5 }, (_, i) => ({
    id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`,
    name: `Test Client ${i}`,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
  }));
  await withFetch(
    () => json(many),
    async () => {
      const h = await renderComponent(tree({ pathname: "/" }));
      try {
        await settleUntil(h, () => documentText().includes("Test Client 0"), "the client rows");
        const clientRows = menuAnchors().filter((a) => (attr(a, "href") ?? "").startsWith("/clients/"));
        assert.equal(clientRows.length, SCOPE_SWITCHER_CAP);
        // A firm with more clients than fit gets a route to all of them plus the
        // one instrument that actually searches, not an unexplained cut.
        assert.match(documentText(), /Press ⌘K to search every client/);
        assert.match(documentText(), /All clients/);
      } finally {
        await h.unmount();
      }
    },
  );
});
