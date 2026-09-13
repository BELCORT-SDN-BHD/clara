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
type LoadRow = Parameters<typeof AccountingWorkList>[0]["loadRow"];

function App(opts: {
  search?: string;
  load?: Load;
  loadRow?: LoadRow;
  scope?: WorkListScope;
}): ReactElement {
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
            loadRow: opts.loadRow,
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

// #641 fix round — THE ADDRESSED ROW (`?work=<id>`), #719's own lesson.
//
// The cell that matters is the THIRD one: a `?work=` naming a Work that is not on the page the
// URL also describes must be FETCHED by id and rendered, because the alternative is a link that
// silently shows the person a list their Work is not in. The first two cells fence that: the door
// is not called at all when the page can already answer, and a CLR11 is said out loud rather than
// dropped.

test("an addressed row that IS on this page is marked current, and no addressed-row read is made", async () => {
  await withMockedEnv(async () => {
    let rowReads = 0;
    const h = await renderComponent(App({
      search: `work=${WORK}`,
      load: async () => ({ rows: [row()], next_cursor: null, truncated: false }),
      loadRow: async (id) => { rowReads += 1; return row({ id }); },
    }));
    try {
      await h.settle();
      assert.equal(rowReads, 0, "the page already holds the row; a second read of it would be a second truth");
      const marked = h.find((n) => {
        const node = n as { tagName?: string; getAttribute?: (k: string) => string | null };
        return node.tagName === "TR" && node.getAttribute?.("data-addressed") === "true";
      });
      assert.ok(marked !== null, "the row the link names is marked as the current one");
      assert.match(h.text(), /The work this link names is on this page/);
      assert.doesNotMatch(h.text(), /not on this page of the list/);
    } finally {
      await h.unmount();
    }
  });
});

test("an addressed row OUTSIDE the page window is fetched by id and rendered above the page", async () => {
  // The exact #719 shape: the URL carries filters that exclude the addressed Work AND names it.
  // A surface that could only see its page would show nothing and say nothing.
  const AWAY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await withMockedEnv(async () => {
    let asked: string | null = null;
    const h = await renderComponent(App({
      search: `status=awaiting_input&work=${AWAY}`,
      load: async () => ({ rows: [row()], next_cursor: "page2", truncated: true }),
      loadRow: async (id) => {
        asked = id;
        return row({ id, memo: "Opening balances tie-out", status: "completed", attempts: 1 });
      },
    }));
    try {
      await h.settle();
      assert.equal(asked, AWAY, "the addressed-row door is asked for the id the URL named");
      const region = h.find((n) => {
        const node = n as { getAttribute?: (k: string) => string | null };
        return node.getAttribute?.("data-slot") === "addressed-work";
      });
      assert.ok(region !== null, "the addressed row gets its own labelled region above the page");
      const text = h.text();
      assert.match(text, /The work this link names is not on this page of the list/);
      assert.match(text, /Opening balances tie-out/);
      // It is the SAME projection a row carries, so its state word is derived the same way.
      assert.match(text, /Completed/);
      // …and it is NOT spliced into the table, where the ordering never put it.
      const inTable = h.find((n) => {
        const node = n as { tagName?: string; textContent?: string };
        return node.tagName === "TABLE" && /Opening balances tie-out/.test(String(node.textContent ?? ""));
      });
      assert.equal(inTable, null, "a visitor is not a row of an ordered, paged list");
    } finally {
      await h.unmount();
    }
  });
});

test("an addressed id the door refuses CLR11 is said out loud, never silently dropped", async () => {
  const GONE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      search: `work=${GONE}`,
      load: emptyPage,
      loadRow: async () => {
        throw new RefusalError("CLR11", "accounting work not found", {
          reason: "accounting_work_not_found", status: 400, pgCode: "CLR11", codeSource: "sqlstate",
        });
      },
    }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /That work could not be opened/);
      assert.match(text, /does not exist, or that is not yours to read/);
      // The LIST is unaffected: an unopenable addressed row is not a broken list.
      assert.match(text, /No work yet/, "the page still tells its own honest story");
    } finally {
      await h.unmount();
    }
  });
});

test("an addressed-row read FAILURE is distinct from not-found, and offers Retry", async () => {
  const AWAY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      search: `work=${AWAY}`,
      load: async () => ({ rows: [row()], next_cursor: null, truncated: false }),
      loadRow: async () => { throw new DoorError("boom", { status: 500, kind: "transport" }); },
    }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /The work this link names could not be read/);
      assert.doesNotMatch(text, /does not exist, or that is not yours to read/,
        "'we could not ask' says nothing about whether the row exists");
    } finally {
      await h.unmount();
    }
  });
});

test("a DENIED list asks the addressed-row door nothing — one banner, not two", async () => {
  await withMockedEnv(async () => {
    let rowReads = 0;
    const h = await renderComponent(App({
      search: `work=${WORK}`,
      load: async () => {
        throw new RefusalError("CLR04", "insufficient role", {
          reason: null, status: 400, pgCode: "CLR04", codeSource: "sqlstate",
        });
      },
      loadRow: async (id) => { rowReads += 1; return row({ id }); },
    }));
    try {
      await h.settle();
      assert.equal(rowReads, 0, "a door that would refuse identically is not asked");
      assert.match(h.text(), /Work is not available/);
      assert.doesNotMatch(h.text(), /not on this page of the list/);
    } finally {
      await h.unmount();
    }
  });
});
