// #641 — the Work list's own state ladder, asserted by RENDERED TEXT.
//
// THE CELL THAT MATTERS MOST IS THE EMPTY PAIR. Appendix C §3's Empty rule and appendix D's
// taxonomy both turn on one distinction: a successful read with zero rows and NO filters says
// "nothing has happened here yet and this is what will appear"; the same read WITH filters says
// "your filters matched nothing" and keeps them, offering Clear filters. A surface that showed one
// sentence for both would be telling a person their firm has no work when in fact they had typed
// a date range into a box they have since scrolled past.
//
// AND THE THREE THAT ARE NOT EMPTY AT ALL: a first read that FAILED (a read that did not answer
// proves nothing about whether there is work), a permission loss (rows cleared, access explained,
// no create/retry affordance that could only refuse), and a refresh failure over rows we already
// have (kept and dated, never blanked).
//
// THE DOOR IS INJECTED (`load`), so no cell reaches a socket for the list itself; the client
// register and member roster are answered at `fetch`, because the component reads them through
// the shared `useAsyncRead`/`useMemberNames` hooks rather than through a prop.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DoorError } from "../../lib/doors";
import { RefusalError } from "../../lib/wire";
import messages from "../../messages/en.json";
import { AccountingWorkList, type WorkListScope } from "./accounting-work-list";
import type { WorkListRow } from "../../lib/work/work-list";

enableDomInspection();

// The harness's `window` stub has NO-OP event methods; the list's focus/visibility recheck
// registers a real listener, so this swap is done at MODULE scope, before any mount.
const realEventTarget = new EventTarget();
globalThis.window.addEventListener = realEventTarget.addEventListener.bind(realEventTarget);
globalThis.window.removeEventListener = realEventTarget.removeEventListener.bind(realEventTarget);
globalThis.window.dispatchEvent = realEventTarget.dispatchEvent.bind(realEventTarget);

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const router = { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The two relation reads the component makes on its own (client register, member roster) plus the
 *  preferences door the saved-view strip reads. Everything else is injected. */
function baseFetch(): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) {
      return json([{ id: CLIENT, name: "Rome Properties", status: "active", created_at: "2026-01-01T00:00:00.000Z" }]);
    }
    if (u.includes("/rest/v1/firm_members_visible")) {
      return json([{
        membership_id: "m1", user_id: USER, display_name: "E2E Owner", email: null,
        role: "owner", role_rank: 3, status: "active", created_at: "2026-01-01T00:00:00.000Z", removed_at: null,
      }]);
    }
    if (u.includes("/rest/v1/rpc/get_my_preferences")) {
      return json({ version: 0, interface: {}, notifications: {}, updated_at: null });
    }
    return json([]);
  }) as typeof fetch;
}

function withMockedEnv(run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = baseFetch();
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function row(over: Partial<WorkListRow> = {}): WorkListRow {
  return {
    id: WORK,
    client_id: CLIENT,
    client_name: "Rome Properties",
    purpose: "journal_entry",
    status: "queued",
    initiator: USER,
    initiated_by: USER,
    initiator_role: "bookkeeper",
    basis_origin: "user_direct",
    memo: "Office rent, September",
    posting_date: "2026-09-01",
    currency: "MYR",
    source_ref_count: 0,
    current_task_id: null,
    entry_id: null,
    receipt_id: null,
    error_code: null,
    error_reason: null,
    attempts: 1,
    current_run_status: "queued",
    pending_question_id: null,
    pending_question_version: null,
    created_at: "2026-09-01T01:00:00.000Z",
    updated_at: "2026-09-01T01:00:00.000Z",
    ...over,
  };
}

type Load = Parameters<typeof AccountingWorkList>[0]["load"];

function App(opts: { search?: string; load?: Load; scope?: WorkListScope }): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams(opts.search ?? "") as never },
      createElement(
        AppRouterContext.Provider as never,
        { value: router as never },
        createElement(
          PathnameContext.Provider as never,
          { value: "/work" as never },
          createElement(AccountingWorkList, {
            scope: opts.scope ?? { kind: "firm" },
            load: opts.load,
          }),
        ),
      ),
    ),
  });
}

const emptyPage = async () => ({ rows: [], next_cursor: null, truncated: false });

test("first use: a successful read with no filters and no rows explains what will appear here", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({ load: emptyPage }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /No work yet/);
      assert.match(text, /Every job Clara is asked to do/);
      assert.doesNotMatch(text, /Clear filters/, "there is nothing to clear");
    } finally {
      await h.unmount();
    }
  });
});

test("no results: the same empty read WITH filters keeps them and offers Clear filters", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({ search: "status=cancelled&q=rent", load: emptyPage }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /No work matches these filters/);
      assert.match(text, /Your filters are still applied/);
      // The Clear-filters control is offered inside the Empty itself, where the person is
      // looking — not only up in the filter bar they may have scrolled past.
      const clear = h.find((n) => (n as { tagName?: string }).tagName === "BUTTON"
        && /Clear filters/.test(String((n as { textContent?: string }).textContent ?? "")));
      assert.ok(clear !== null, "Clear filters is a real control in the Empty");
      assert.doesNotMatch(text, /No work yet/, "never the first-use sentence for a filtered list");
    } finally {
      await h.unmount();
    }
  });
});

test("a page-2 read with zero rows is a no-results Empty, not a first-use one", async () => {
  // A cursor is not a filter, but arriving at a page that turns out to be empty is emphatically
  // not "this firm has no work" — the person has already seen page 1.
  await withMockedEnv(async () => {
    const h = await renderComponent(App({ search: "cursor=page2", load: emptyPage }));
    try {
      await h.settle();
      assert.match(h.text(), /No work matches these filters/);
    } finally {
      await h.unmount();
    }
  });
});

test("rows render the memo, the client, the state WORD and a link to the Work's own address", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      load: async () => ({
        rows: [row(), row({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", status: "running", attempts: 2, memo: "Bank fee" })],
        next_cursor: null,
        truncated: false,
      }),
    }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /Office rent, September/);
      assert.match(text, /Rome Properties/);
      assert.match(text, /Queued/);
      // C08.6 — the retry signal is a WORD on the badge, derived from `attempts`, not a colour.
      assert.match(text, /Retrying/);
      const link = h.find((n) => {
        const node = n as { tagName?: string; getAttribute?: (k: string) => string | null };
        return node.tagName === "A" && node.getAttribute?.("href")?.includes(`/work/${WORK}`) === true;
      });
      assert.ok(link !== null, "every row links to its own durable address");
      // NO MONEY ON A LIST ROW (the door projects none, and this asserts the page renders none).
      assert.doesNotMatch(text, /1,200\.00|120000/);
    } finally {
      await h.unmount();
    }
  });
});

test("a first read that FAILED is an error with Retry, never an Empty", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      load: async () => { throw new DoorError("boom", { status: 500, kind: "transport" }); },
    }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /The work list could not be read/);
      assert.match(text, /says nothing about whether there is work here/);
      assert.doesNotMatch(text, /No work yet/);
    } finally {
      await h.unmount();
    }
  });
});

test("a permission loss clears the rows and explains the access state", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      load: async () => {
        throw new RefusalError("CLR04", "insufficient role", {
          reason: null, status: 400, pgCode: "CLR04", codeSource: "sqlstate",
        });
      },
    }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /Work is not available/);
      assert.match(text, /your access to this firm's work changed/i);
      assert.doesNotMatch(text, /Office rent/);
    } finally {
      await h.unmount();
    }
  });
});

test("a refresh failure over known rows KEEPS them and says the last look failed", async () => {
  await withMockedEnv(async () => {
    let calls = 0;
    const h = await renderComponent(App({
      load: async () => {
        calls += 1;
        if (calls === 1) return { rows: [row()], next_cursor: null, truncated: false };
        throw new DoorError("boom", { status: 500, kind: "transport" });
      },
    }));
    try {
      await h.settle();
      assert.match(h.text(), /Office rent, September/);
      await h.act(async () => { globalThis.window.dispatchEvent(new Event("focus")); });
      await h.settle();
      const text = h.text();
      assert.match(text, /rows from the last successful read/);
      assert.match(text, /Office rent, September/, "the dated rows stay on screen");
    } finally {
      await h.unmount();
    }
  });
});

test("pagination offers Next only while the door minted a cursor, and never a page total", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      load: async () => ({ rows: [row()], next_cursor: "page2", truncated: true }),
    }));
    try {
      await h.settle();
      const nav = h.find((n) => {
        const node = n as { tagName?: string; getAttribute?: (k: string) => string | null };
        return node.tagName === "NAV" && node.getAttribute?.("aria-label") === "Work list pages";
      });
      assert.ok(nav !== null, "the pager is a labelled navigation region");
      const text = h.text();
      assert.match(text, /Next page/);
      assert.doesNotMatch(text, /First page/, "there is no previous page from the first one");
      // Appendix D row 42: never infer a total from the current page.
      assert.doesNotMatch(text, /of \d+/);
    } finally {
      await h.unmount();
    }
  });
});

test("the client surface pins its own client and offers no client filter", async () => {
  await withMockedEnv(async () => {
    let seenClient: unknown = "unset";
    const h = await renderComponent(App({
      // A hand-edited ?client= pointing at ANOTHER client must not reach the door from this route.
      search: "client=99999999-9999-4999-8999-999999999999",
      scope: { kind: "client", clientId: CLIENT },
      load: async (filters) => {
        seenClient = filters.client;
        return { rows: [], next_cursor: null, truncated: false };
      },
    }));
    try {
      await h.settle();
      assert.equal(seenClient, CLIENT, "the ROUTE's client id wins over the URL's");
      const clientFilter = h.find((n) => {
        const node = n as { getAttribute?: (k: string) => string | null };
        return node.getAttribute?.("id") === "work-filter-client";
      });
      assert.equal(clientFilter, null, "no client picker on a route that already pins the client");
    } finally {
      await h.unmount();
    }
  });
});
