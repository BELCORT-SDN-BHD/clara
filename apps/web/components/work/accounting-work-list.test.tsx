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
import { AccountingWorkList, workRowKindLabel, type WorkListScope } from "./accounting-work-list";
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
    intent_key: "w623:journal_entry:2026-09-01:office-rent",
    claim_id: null,
    claimant_label: null,
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

// ===========================================================================================
// #880 — workRowKindLabel, the pure decision behind the compact line's label. Tested directly at
// the function boundary (no render, no fetch) so the three branches are each one assertion, plus
// once end-to-end through the rendered list below to prove it is actually wired in.
// ===========================================================================================
{
  const t = (key: string, values?: Record<string, string>) => {
    if (key === "claimLabel") return `Staff expense claim — ${values?.claimant ?? ""}`;
    if (key === "purposeLabels.journal_entry") return "Journal entry";
    if (key === "purposeLabels.periodic_stock_adjustment") return "Periodic stock adjustment";
    throw new Error(`unexpected key in workRowKindLabel test double: ${key}`);
  };

  test("workRowKindLabel: a claim row (claim_id set) renders the claimant label, not the purpose", () => {
    assert.equal(
      workRowKindLabel({ purpose: "journal_entry", claim_id: "claim-1", claimant_label: "Farah binti Idris" }, t),
      "Staff expense claim — Farah binti Idris",
    );
  });

  test("workRowKindLabel: a plain row (claim_id null) with a KNOWN purpose is unchanged", () => {
    assert.equal(
      workRowKindLabel({ purpose: "journal_entry", claim_id: null, claimant_label: null }, t),
      "Journal entry",
    );
    assert.equal(
      workRowKindLabel({ purpose: "periodic_stock_adjustment", claim_id: null, claimant_label: null }, t),
      "Periodic stock adjustment",
    );
  });

  test("workRowKindLabel: a plain row with a purpose this build has not learned renders it VERBATIM", () => {
    assert.equal(
      workRowKindLabel({ purpose: "vendor_bill_stub", claim_id: null, claimant_label: null }, t),
      "vendor_bill_stub",
    );
  });

  // Defensive only — clara.staff_expense_claims.claimant_label is NOT NULL (0221), so a live row
  // never carries this combination; asserted so a malformed wire answer degrades rather than throws.
  test("workRowKindLabel: claim_id set with a null claimant_label renders an empty claimant, never throws", () => {
    assert.equal(
      workRowKindLabel({ purpose: "journal_entry", claim_id: "claim-1", claimant_label: null }, t),
      "Staff expense claim — ",
    );
  });

  // THE DEGRADE MUST NOT INVENT A CLAIM (fix round, review finding L09-ADV-07). `lib/work/
  // work-list.ts` passes the door's rows straight through with no runtime validation, so the KEY
  // can be absent — from a door below the 0266 frontier during a deploy window, or from the
  // malformed answer the `?? ""` above exists for. `undefined !== null` is TRUE, so a strict
  // null test labelled EVERY row a staff expense claim on exactly the answer it was meant to
  // survive. An absent or empty claim id is not a claim.
  test("workRowKindLabel: a row whose wire answer OMITS claim_id is not a claim", () => {
    assert.equal(
      workRowKindLabel({ purpose: "journal_entry" } as unknown as Parameters<typeof workRowKindLabel>[0], t),
      "Journal entry",
    );
    assert.equal(
      workRowKindLabel({ purpose: "journal_entry", claim_id: "", claimant_label: null }, t),
      "Journal entry",
      "an empty claim id is not a claim either",
    );
  });
}

/** The first node carrying this `data-testid`, walked off the harness's stub tree — the same
 *  technique `components/parts/work-cards.test.tsx` uses. */
function byTestId(root: unknown, id: string): Record<string, unknown> | null {
  let found: Record<string, unknown> | null = null;
  const walk = (n: unknown): void => {
    if (found !== null || n === null || typeof n !== "object") return;
    const node = n as Record<string, unknown> & {
      getAttribute?: (k: string) => string | null; childNodes?: unknown[];
    };
    if (typeof node.getAttribute === "function" && node.getAttribute("data-testid") === id) {
      found = node;
      return;
    }
    for (const c of node.childNodes ?? []) walk(c);
  };
  walk(root);
  return found;
}

/** Every node carrying this `data-testid`, in document order. */
function allByTestId(root: unknown, id: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: unknown): void => {
    if (n === null || typeof n !== "object") return;
    const node = n as Record<string, unknown> & {
      getAttribute?: (k: string) => string | null; childNodes?: unknown[];
    };
    if (typeof node.getAttribute === "function" && node.getAttribute("data-testid") === id) out.push(node);
    for (const c of node.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

function textOfNode(n: Record<string, unknown> | null): string {
  if (n === null) return "";
  let out = "";
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const stub = node as Record<string, unknown> & { nodeValue?: string; childNodes?: unknown[] };
    if (typeof stub.nodeValue === "string") out += stub.nodeValue;
    for (const c of stub.childNodes ?? []) walk(c);
  };
  walk(n);
  return out;
}

test("a staff expense claim row shows its claimant label on the compact line, never 'Journal entry'", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      load: async () => ({
        rows: [
          row({ claim_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", claimant_label: "Farah binti Idris" }),
          row({
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", memo: "Bank fee", claim_id: null, claimant_label: null,
          }),
        ],
        next_cursor: null,
        truncated: false,
      }),
    }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /Staff expense claim — Farah binti Idris/, "the claim row carries its label");
      // The plain row on the SAME page is unchanged — the regression AC2 asks for.
      assert.match(text, /Journal entry/, "a plain journal Work on the same page still reads 'Journal entry'");
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================================
// #880 — AND THE LABEL HAS TO REACH A DESKTOP READER (fix round, review finding L09-SPEC-05).
//
// The compact line above is `md:hidden`: it exists to re-express the columns the NARROW table
// withdraws, and at `md` and up it is not rendered at all. Tailwind does nothing in this harness,
// so a scan of the whole page's text could not tell the two lines apart — the claim label was
// reaching only a phone. The always-visible desktop sub-line (the one that carries the posting
// date) is where a wide reader looks, so the CLAIM label is rendered there too, addressed by
// `data-testid` rather than by a text scan so the cell proves WHICH line carries it.
//
// AND ONLY THE CLAIM LABEL. AC2 is "non-claim rows are unchanged", and the ticket puts
// purpose-specific labels for any other purpose out of scope, so the desktop line of an ordinary
// journal Work gains nothing.
// ===========================================================================================
test("880 the claim label reaches the DESKTOP sub-line too, and a plain row's desktop line is untouched", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      load: async () => ({
        rows: [
          row({ claim_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", claimant_label: "Farah binti Idris" }),
          row({
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", memo: "Bank fee", claim_id: null, claimant_label: null,
          }),
        ],
        next_cursor: null,
        truncated: false,
      }),
    }));
    try {
      await h.settle();
      const desktop = allByTestId(h.container, "work-row-wide-line").map(textOfNode);
      assert.equal(desktop.length, 2, "one always-visible sub-line per row");
      assert.match(desktop[0]!, /Staff expense claim — Farah binti Idris/,
        "the claim row's DESKTOP line carries the label, not only the md:hidden compact line");
      assert.match(desktop[0]!, /2026-09-01/, "…beside the posting date that line already carried");
      assert.doesNotMatch(desktop[1]!, /Journal entry/,
        "a plain row's desktop line gains NO kind label — AC2's 'non-claim rows are unchanged'");
      assert.match(desktop[1]!, /2026-09-01/, "…and still carries exactly what it carried before");

      // The compact line is still the one that labels EVERY row, claim or not.
      const compact = allByTestId(h.container, "work-row-compact-line").map(textOfNode);
      assert.match(compact[0]!, /Staff expense claim — Farah binti Idris/);
      assert.match(compact[1]!, /Journal entry/);
      assert.ok(byTestId(h.container, "work-row-compact-line") !== null, "the compact line still exists");
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

test("[1005]: the client, purpose and initiator filter triggers show their LABELS, never a row id or the ALL sentinel", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      search: `client=${CLIENT}&purpose=journal_entry&initiator=${USER}`,
      load: emptyPage,
    }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /Rome Properties/, "the client trigger must show the client's name, not its row id");
      assert.doesNotMatch(text, new RegExp(CLIENT), "the client row id must never render as trigger text");
      assert.match(text, /Journal entry/, "the purpose trigger must show the translated purpose label");
      assert.match(text, /E2E Owner/, "the initiator trigger must show the member's display name, not their user id");
      assert.doesNotMatch(text, new RegExp(USER), "the initiator's user id must never render as trigger text");
    } finally {
      await h.unmount();
    }
  });
});

test("[1005]: with no filter chosen, all three triggers show their ALL-sentinel labels, never the raw sentinel", async () => {
  await withMockedEnv(async () => {
    const h = await renderComponent(App({ load: emptyPage }));
    try {
      await h.settle();
      const text = h.text();
      assert.match(text, /All clients/);
      // WorkList.filterPurposeAll and filterInitiatorAll both happen to read "All kinds"/"Anyone" —
      // asserted from en.json directly above rather than restated here.
      assert.match(text, /Anyone/);
      // The sentinel is `const ALL = "__all__"` in this component (case-sensitive check — several
      // legitimate words in this view contain "all", e.g. "All clients").
      assert.doesNotMatch(text, /__all__/);
    } finally {
      await h.unmount();
    }
  });
});

// fix-round ADV-2: a well-formed but unresolvable filter value (a client id no longer in the
// roster, a purpose newer than KNOWN_PURPOSES, a former member's id) used to fall back to the
// SAME "All …"/"Anyone" label the trigger shows when nothing is filtered at all — a real, applied
// filter read as unfiltered. All three must read as filtered-but-unresolvable instead.
test("[ADV-2]: a client/purpose/initiator value absent from its roster reads as filtered, never as 'All …'", async () => {
  const MISSING_CLIENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const MISSING_INITIATOR = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  await withMockedEnv(async () => {
    const h = await renderComponent(App({
      search: `client=${MISSING_CLIENT}&purpose=vendor_bill_stub&initiator=${MISSING_INITIATOR}`,
      load: emptyPage,
    }));
    try {
      await h.settle();
      const text = h.text();
      assert.doesNotMatch(text, /All clients/, "an applied client filter must not read as 'All clients'");
      assert.doesNotMatch(text, /All kinds/, "an applied purpose filter must not read as 'All kinds'");
      assert.doesNotMatch(text, /\bAnyone\b/, "an applied initiator filter must not read as 'Anyone'");
      assert.doesNotMatch(text, new RegExp(MISSING_CLIENT), "the raw client id must never render as trigger text");
      assert.doesNotMatch(text, new RegExp(MISSING_INITIATOR), "the raw initiator id must never render as trigger text");
      assert.doesNotMatch(text, /vendor_bill_stub/, "the raw purpose value must never render as trigger text");
      assert.match(text, /not in this list/i, "each unresolved trigger must say the value is filtered but unresolvable");
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
