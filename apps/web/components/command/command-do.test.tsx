// 裁-37 — the ⌘K "Do" section, driven through the REAL palette.
//
// lib/command/do-actions.test.ts proves the gate; this proves the SURFACE obeys it: what the
// live read returns is what renders, an act the caller cannot perform is ABSENT rather than
// disabled, and a refusal renders verbatim without the palette retrying or closing.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

// Harness before component — see components/clara/onboarding-amend-and-chart.test.tsx's note.
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import type { SessionTokenAccessor } from "../../lib/session";
import messages from "../../messages/en.json";
import { CommandPalette } from "./command-palette";

enableDomInspection();

type Stub = Record<string, unknown>;
type Call = { url: string; body: unknown };

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ctx = (role: string, rank: number) => ([{
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "44444444-4444-4444-8444-444444444444",
  firm_name: "BELCORT", role, role_rank: rank, is_operator: false,
}]);

/** Every navigation the palette performs, captured — so a cell can prove a Do dispatch sends
 *  the human to the client the DATABASE returned, not to a path this test guessed. */
const pushed: string[] = [];

function App(pathname = "/"): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      AppRouterContext.Provider as never,
      { value: { replace: () => {}, refresh: () => {}, push: (h: string) => { pushed.push(h); }, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
      createElement(
        PathnameContext.Provider as never,
        { value: pathname as never },
        createElement("div", null,
          createElement("h1", null, "Command palette"),
          createElement(CommandPalette, { onNavigate: () => {}, session })),
      ),
    ),
  });
}

function withFetch(impl: (url: string, init?: RequestInit) => Response, run: (calls: Call[]) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const calls: Call[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url, body });
    return impl(url, init);
  }) as typeof fetch;
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string, dump?: () => string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}${dump ? `\n--- rendered ---\n${dump()}` : ""}`);
    await h.settle();
  }
}

/** The palette is a cmdk list, so a row is a `[cmdk-item]`, not a `<button>`. Selecting one
 *  is what `onSelect` fires on; this invokes the committed handler on the real node — the
 *  same discipline `clickButton` applies to a button. */
function selectRow(node: Stub): void {
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey ? (node as unknown as Record<string, { onSelect?: () => void; onClick?: (e: unknown) => void }>)[propsKey] : undefined;
  const handler = props?.onSelect ?? (props?.onClick ? () => props.onClick!({ preventDefault() {}, stopPropagation() {} }) : undefined);
  if (!handler) throw new Error("selectRow: no onSelect/onClick on this node — is it really a command item?");
  handler();
}

/** A cmdk row is whichever committed node actually carries `onSelect` — found by the HANDLER,
 *  not by a tag name or a class. Matching on markup would silently pick the label `<span>` on
 *  a future restyle and then click nothing, which is the vacuous-green class this repo's
 *  dialog laws already name. Narrowed by text so the cell addresses one row. */
function findRowByText(root: Stub, text: string): Stub | null {
  let found: Stub | null = null;
  const walk = (n: Stub) => {
    if (found) return;
    const propsKey = Object.keys(n as object).find((k) => k.startsWith("__reactProps"));
    const props = propsKey ? (n as unknown as Record<string, { onSelect?: unknown; onClick?: unknown }>)[propsKey] : undefined;
    // cmdk consumes `onSelect` itself and forwards a plain `onClick` to the host node, so the
    // handler that actually fires a selection is whichever of the two the COMMITTED node
    // carries. Reading both is what keeps this from depending on cmdk's internal choice.
    if ((typeof props?.onSelect === "function" || typeof props?.onClick === "function") && textOf(n).includes(text)) {
      found = n;
      return;
    }
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(root);
  return found;
}

/** The palette's search input is a cmdk `CommandInput`; its committed props carry
 *  `onValueChange` (cmdk's own contract), which is what the palette reads. */
function typeQuery(node: Stub, value: string): void {
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const props = propsKey ? (node as unknown as Record<string, { onValueChange?: (v: string) => void; onChange?: (e: unknown) => void }>)[propsKey] : undefined;
  if (props?.onValueChange) { props.onValueChange(value); return; }
  if (props?.onChange) { props.onChange({ target: { value }, currentTarget: { value } }); return; }
  throw new Error("typeQuery: the palette input carries neither onValueChange nor onChange");
}

test("a caller BELOW the door's floor sees the row ABSENT, with an honest note — never a disabled row", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctx("bookkeeper", 1));
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => !/Checking what you can dispatch/.test(h.text()), "the Do read to settle", () => h.text());
        assert.match(h.text(), /Nothing to dispatch from here/, "the honest empty note names why, rather than showing a greyed promise");
        assert.doesNotMatch(h.text(), /Open a new client file/, "an act this caller cannot perform is ABSENT");
        assert.deepEqual(checkAccessibility(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a FAILED allowlist read says so, and offers nothing — it is not an empty list", async () => {
  await withFetch(
    () => json({ message: "boom" }, 500),
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => /Couldn't check what you can dispatch/.test(h.text()), "the read-error arm", () => h.text());
        assert.doesNotMatch(h.text(), /Nothing to dispatch from here/, "'we could not find out' and 'there is nothing' are different sentences");
        assert.doesNotMatch(h.text(), /Open a new client file/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a permitted row renders with the TYPED name in it, and selecting it calls the door once", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctx("admin", 2));
      if (url.includes("/rest/v1/rpc/begin_client_onboarding")) return json({ client_id: CLIENT_ID, plan_id: PLAN_ID });
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => !/Checking what you can dispatch/.test(h.text()), "the Do read to settle", () => h.text());
        // With no typed query the row's own precondition (a non-blank name) fails, so it is
        // absent — the precondition is per-action and live, not just a role check.
        assert.doesNotMatch(h.text(), /Open a new client file/, "no name typed, no row");

        const input = h.find((n: Stub) => n.tagName === "INPUT");
        assert.ok(input, "the palette's own search input");
        await h.act(() => typeQuery(input, "ROME PUBLIC ADVISORY"));
        await settleUntil(h, () => /Open a new client file for "ROME PUBLIC ADVISORY"/.test(h.text()), "the Do row", () => h.text());

        const row = findRowByText(h.container as Record<string, unknown>, 'Open a new client file for "ROME PUBLIC ADVISORY"');
        assert.ok(row, "the row carries the typed name — the palette's input IS the door's p_name argument");
        await h.act(() => selectRow(row));
        await settleUntil(h, () => calls.some((c) => c.url.includes("/rest/v1/rpc/begin_client_onboarding")), "the door call");
        assert.equal(
          calls.filter((c) => c.url.includes("/rest/v1/rpc/begin_client_onboarding")).length,
          1,
          "exactly one governed call — never a batch, never a retry",
        );
        assert.equal((calls.find((c) => c.url.includes("begin_client_onboarding"))!.body as Record<string, unknown>).p_name, "ROME PUBLIC ADVISORY");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("a DoorRefusal renders VERBATIM in the palette and is never retried", async () => {
  let attempts = 0;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json(ctx("admin", 2));
      if (url.includes("/rest/v1/rpc/begin_client_onboarding")) {
        attempts += 1;
        return json({ code: "CLR04", message: "admin role or higher is required", details: '{"reason":"role_floor"}' }, 400);
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App());
      try {
        await settleUntil(h, () => !/Checking what you can dispatch/.test(h.text()), "the Do read to settle", () => h.text());
        const input = h.find((n: Stub) => n.tagName === "INPUT");
        await h.act(() => typeQuery(input!, "ROME PUBLIC ADVISORY"));
        await settleUntil(h, () => /Open a new client file for "ROME PUBLIC ADVISORY"/.test(h.text()), "the Do row", () => h.text());

        const row = findRowByText(h.container as Record<string, unknown>, 'Open a new client file for "ROME PUBLIC ADVISORY"');
        assert.ok(row);
        await h.act(() => selectRow(row));
        await settleUntil(h, () => /admin role or higher is required/.test(h.text()), "the verbatim refusal", () => h.text());

        assert.match(h.text(), /CLR04/, "the DB's own code, rendered — never re-worded");
        assert.equal(attempts, 1, "a refusal is never retried");
        // The palette stays OPEN on a refusal so the human reads what the database said. Its
        // own row is still there; nothing was closed out from under them.
        assert.match(h.text(), /Open a new client file for "ROME PUBLIC ADVISORY"/);
      } finally {
        await h.unmount();
      }
    },
  );
});

