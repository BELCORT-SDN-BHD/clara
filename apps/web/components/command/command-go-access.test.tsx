// C-43 — the ⌘K "Go" section, driven through the REAL palette.
//
// `lib/command/routes.test.ts` proves the MANIFEST's floors equal the sidebar's.
// This proves the SURFACE obeys them: a row above the caller's rank is ABSENT,
// a failed read renders a sentence rather than a list (in either direction), and
// a client is reachable BY NAME from firm altitude.
//
// The instrument is command-do.test.tsx's, deliberately — same harness, same
// row-finding-by-handler discipline, so a future restyle cannot make either file
// click nothing and pass.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

// Harness before component — see components/clara/onboarding-amend-and-chart.test.tsx's note.
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";
import { CommandPalette, GO_CLIENTS_RENDER_CAP } from "./command-palette";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ctxRow = (role: string, rank: number, isOperator = false) => [
  {
    user_id: "11111111-1111-4111-8111-111111111111",
    firm_id: "44444444-4444-4444-8444-444444444444",
    firm_name: "BELCORT",
    role,
    role_rank: rank,
    is_operator: isOperator,
  },
];

const CLIENTS = [
  { id: CLIENT_A, name: "Rome Properties", status: "active", created_at: "2026-01-01T00:00:00.000Z" },
  { id: CLIENT_B, name: "Bee Creative Solution", status: "active", created_at: "2026-02-01T00:00:00.000Z" },
];

const pushed: string[] = [];

function App(pathname = "/"): ReactElement {
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
          push: (h: string) => {
            pushed.push(h);
          },
          back: () => {},
          forward: () => {},
          prefetch: () => {},
        } as never,
      },
      createElement(
        PathnameContext.Provider as never,
        { value: pathname as never },
        createElement(
          "div",
          null,
          createElement("h1", null, "Command palette"),
          createElement(CommandPalette, { onNavigate: () => {}, session }),
        ),
      ),
    ),
  });
}

function withFetch(
  impl: (url: string) => Response,
  run: () => Promise<void>,
): Promise<void> {
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

async function settleUntil(
  h: { settle: () => Promise<void> },
  condition: () => boolean,
  label: string,
  dump?: () => string,
): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for ${label}${dump ? `\n--- rendered ---\n${dump()}` : ""}`);
    }
    await h.settle();
  }
}

/** A cmdk row is whichever committed node actually carries the selection handler
 *  — found by the HANDLER, never by a tag or a class, so a restyle cannot make
 *  this walk pick a label `<span>` and then click nothing. */
function findRowByText(root: Stub, text: string): Stub | null {
  let found: Stub | null = null;
  const walk = (n: Stub) => {
    if (found) return;
    const propsKey = Object.keys(n as object).find((k) => k.startsWith("__reactProps"));
    const props = propsKey
      ? (n as unknown as Record<string, { onSelect?: unknown; onClick?: unknown }>)[propsKey]
      : undefined;
    if (
      (typeof props?.onSelect === "function" || typeof props?.onClick === "function") &&
      textOf(n).includes(text)
    ) {
      found = n;
      return;
    }
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(root);
  return found;
}

function selectRow(node: Stub): void {
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey
    ? (node as unknown as Record<string, { onSelect?: () => void; onClick?: (e: unknown) => void }>)[propsKey]
    : undefined;
  const handler =
    props?.onSelect ?? (props?.onClick ? () => props.onClick!({ preventDefault() {}, stopPropagation() {} }) : undefined);
  if (!handler) throw new Error("selectRow: no onSelect/onClick on this node — is it really a command item?");
  handler();
}

function typeQuery(node: Stub, value: string): void {
  // BOTH handlers, for the reason command-do.test.tsx records: cmdk consumes
  // `onValueChange` itself and forwards a plain `onChange` to the host node, so
  // which one the COMMITTED node carries is cmdk's internal choice, not ours.
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey
    ? (node as unknown as Record<string, { onValueChange?: (v: string) => void; onChange?: (e: unknown) => void }>)[propsKey]
    : undefined;
  if (props?.onValueChange) {
    props.onValueChange(value);
    return;
  }
  if (props?.onChange) {
    props.onChange({ target: { value }, currentTarget: { value } });
    return;
  }
  throw new Error("typeQuery: the palette input carries neither onValueChange nor onChange");
}

const inputOf = (h: { find: (p: (n: Stub) => boolean) => Stub | null }) => {
  const node = h.find((n) => (n.tagName as string | undefined)?.toLowerCase() === "input");
  assert.ok(node, "the palette has no search input");
  return node;
};

// ── GAP A: rank shaping ─────────────────────────────────────────────────────

test("a BOOKKEEPER sees Activity but not Members or Firm registrations — the sidebar's own answer", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctxRow("bookkeeper", 1));
      if (url.includes("/rest/v1/clients")) return json(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.text().includes("Firm activity"), "the Go rows", h.text);
        const text = h.text();
        // Bookkeeper (rank 1) is AT the activity floor and BELOW members (admin)
        // and registrations (owner + operator).
        assert.match(text, /Firm activity/);
        assert.match(text, /Vendor identity bindings/);
        assert.doesNotMatch(text, /Members/);
        assert.doesNotMatch(text, /Firm registrations/);
        // ABSENT, not disabled: a greyed row still asserts the room exists.
        assert.equal(findRowByText(h.container, "Members"), null);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("an OWNER on the OPERATOR firm sees every row, including the operator-only queue", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctxRow("owner", 3, true));
      if (url.includes("/rest/v1/clients")) return json(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.text().includes("Members"), "the full Go list", h.text);
        const text = h.text();
        assert.match(text, /Firm activity/);
        assert.match(text, /Members/);
        assert.match(text, /Firm registrations/);
        assert.match(text, /Firm settings/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a VIEWER is denied Activity too — the floor read is a rank comparison, not an admin/non-admin split", async () => {
  // The discriminating persona. If the shaping were "hide the /admin children",
  // a viewer would still see Activity (a bookkeeper-floor, non-admin surface)
  // and the two cells above would both still pass.
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctxRow("viewer", 0));
      if (url.includes("/rest/v1/clients")) return json(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.text().includes("Firm home"), "the viewer's Go rows", h.text);
        const text = h.text();
        assert.match(text, /Firm home/);
        assert.match(text, /Client register/);
        assert.match(text, /Compliance register/);
        assert.doesNotMatch(text, /Firm activity/);
        assert.doesNotMatch(text, /Vendor identity bindings/);
        assert.doesNotMatch(text, /Members/);
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── GAP A, the fail-closed arms ─────────────────────────────────────────────

test("a FAILED caller_context read renders the read-error banner — never the unfiltered list, never an empty one", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json({ message: "boom" }, 500);
      if (url.includes("/rest/v1/clients")) return json(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /Couldn't check what you can open/.test(h.text()), "the Go read-error banner", h.text);
        const text = h.text();
        // NOT the unfiltered list — the whole defect, back again on the failure path.
        assert.doesNotMatch(text, /Members/);
        assert.doesNotMatch(text, /Firm activity/);
        // NOT "no matching pages" either: we did not look and found nothing, we
        // could not look. Two different sentences.
        assert.doesNotMatch(text, /No matching pages/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a caller_context read that lands with NO ROW is 'couldn't read your access', not 'nothing for you'", async () => {
  // The third state, and the one an `err ? banner : rows` shape would collapse.
  // The read SUCCEEDED and returned zero rows, so nothing threw — but we still
  // do not know this caller's rank, and rendering rows on that basis would be
  // exactly the unfiltered list.
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json([]);
      if (url.includes("/rest/v1/clients")) return json(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /Couldn't read your access/.test(h.text()), "the no-context banner", h.text);
        const text = h.text();
        assert.doesNotMatch(text, /Firm home/);
        assert.doesNotMatch(text, /Members/);
        assert.doesNotMatch(text, /No matching pages/);
      } finally {
        await h.unmount();
      }
    },
  );
});

// ── GAP B: a client by name ─────────────────────────────────────────────────

test("typing a client's NAME at firm altitude lists it, and selecting it pushes that client's workspace", async () => {
  pushed.length = 0;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctxRow("owner", 3));
      if (url.includes("/rest/v1/clients")) return json(CLIENTS);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App("/"));
      try {
        await settleUntil(h, () => h.text().includes("Rome Properties"), "the clients group", h.text);
        await h.act(() => typeQuery(inputOf(h), "bee"));
        await settleUntil(h, () => !h.text().includes("Rome Properties"), "the name filter to narrow", h.text);
        assert.match(h.text(), /Bee Creative Solution/);

        const row = findRowByText(h.container, "Bee Creative Solution");
        assert.ok(row, "the matched client is not a selectable row");
        await h.act(() => selectRow(row));
        // THE DISCRIMINATING POST-CONDITION: the id the READ returned, not one
        // this test typed into a href.
        assert.deepEqual(pushed, [`/clients/${CLIENT_B}`]);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a client is reachable by name from INSIDE another client, too", async () => {
  pushed.length = 0;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctxRow("owner", 3));
      if (url.includes("/rest/v1/clients")) return json(CLIENTS);
      if (url.includes("/rest/v1/")) return json([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(`/clients/${CLIENT_A}`));
      try {
        await settleUntil(h, () => h.text().includes("Bee Creative Solution"), "the clients group", h.text);
        const row = findRowByText(h.container, "Bee Creative Solution");
        assert.ok(row, "A -> B by name is not offered from inside a client");
        await h.act(() => selectRow(row));
        assert.deepEqual(pushed, [`/clients/${CLIENT_B}`]);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a FAILED client-register read renders an honest note — it does NOT quietly fall back to the register row", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctxRow("owner", 3));
      if (url.includes("/rest/v1/clients")) return json({ message: "denied" }, 500);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /Couldn't read your client register/.test(h.text()), "the clients read-error note", h.text);
        // The Go rows themselves are unaffected — one section's failed read must
        // not take the other down with it.
        assert.match(h.text(), /Client register/);
        // …and no client row was invented from nothing.
        assert.equal(findRowByText(h.container, "Rome Properties"), null);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the clients group is CAPPED, and says so rather than truncating silently", async () => {
  const many = Array.from({ length: GO_CLIENTS_RENDER_CAP + 7 }, (_, i) => ({
    id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`,
    name: `Test Client ${i}`,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
  }));
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctxRow("owner", 3));
      if (url.includes("/rest/v1/clients")) return json(many);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => h.text().includes("Test Client 0"), "the clients group", h.text);
        // The hint names BOTH numbers, so "showing everything" and "showing a
        // slice" are distinguishable to the reader — a bare "…" is not.
        assert.match(h.text(), new RegExp(`Showing ${GO_CLIENTS_RENDER_CAP} of ${many.length}`));
        assert.equal(findRowByText(h.container, `Test Client ${many.length - 1}`), null);
      } finally {
        await h.unmount();
      }
    },
  );
});
