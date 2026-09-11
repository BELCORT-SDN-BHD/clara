// SHARED TEST FIXTURES for the Activity feed's RTL battery (#632 review finding 16) —
// deliberately NOT a `.test.ts` file, same discipline `components/admin/members-fixtures.ts`
// already established: importing one test file from another re-runs its cases inside the
// importer, inflating counts and hiding which file proved what.
// `scripts/check-test-manifest.mjs` globs `*.test.{ts,tsx,js,jsx,mjs,cjs}` and correctly ignores
// this one, so it stays out of the manifest and out of the runner.

import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../../lib/session-accessor";
import type { ActivityRow } from "../../../lib/firm/activity";
import messages from "../../../messages/en.json";

export type StubNode = {
  tagName?: string;
  childNodes?: StubNode[];
  getAttribute?: (n: string) => string | null;
};

export function findIn(root: StubNode, predicate: (n: StubNode) => boolean): StubNode | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

export function findAll(root: StubNode, predicate: (n: StubNode) => boolean): StubNode[] {
  const out: StubNode[] = [];
  (function walk(n: StubNode) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

export function attrOf(n: StubNode, name: string): string | null {
  return typeof n.getAttribute === "function" ? n.getAttribute(name) : null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export const ACTIVITY_CLIENT = { id: "c1111111-1111-1111-1111-111111111111", name: "Acme Sdn Bhd", status: "active", created_at: "2026-01-01T00:00:00Z" };

export const MEMBERS = [
  { membership_id: "m1", user_id: "u1111111-1111-1111-1111-111111111111", display_name: "Siti Rahman", email: "siti@example.test", role: "bookkeeper", role_rank: 1, status: "active", created_at: "2026-01-01T00:00:00Z", removed_at: null },
];

/** A single, representative page-1 row — an `event` source, kind=documents, with a real actor —
 *  distinct from the `documents.filed` shape only in that this fixture makes no claim about
 *  which event_type registered it; the sentence is what a row actually renders. */
export function activityRow(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: "e1111111-1111-1111-1111-111111111111",
    source: "event",
    event_type: "document.filed",
    description: "A document was filed.",
    client_id: ACTIVITY_CLIENT.id,
    actor: MEMBERS[0]!.user_id,
    on_behalf_of: null,
    via_wake_kind: null,
    occurred_at: "2026-06-01T10:00:00.000Z",
    object_kind: "document",
    object_id: "d1111111-1111-1111-1111-111111111111",
    work_id: null,
    receipt_id: null,
    document_id: "d1111111-1111-1111-1111-111111111111",
    original_entry_id: null,
    replacement_entry_id: null,
    status: null,
    kind: "documents",
    ...overrides,
  };
}

export type ActivityFetchState = {
  /** Popped in order for each `list_activity` POST; the LAST entry repeats once exhausted, so a
   *  test that only cares about the first N calls need not enumerate every later one (e.g. the
   *  focus-recheck effect firing again on unmount/remount). Each entry is a thunk so a test can
   *  make a LATER call throw without constructing the Response up front. */
  listActivity: Array<() => Response | Promise<Response>>;
  getActivityEvent?: () => Response | Promise<Response>;
  calls: { list_activity: unknown[]; get_activity_event: unknown[] };
};

export function freshActivityFetchState(pages: Array<() => Response | Promise<Response>>): ActivityFetchState {
  return { listActivity: pages, calls: { list_activity: [], get_activity_event: [] } };
}

export function mockActivityFetch(state: ActivityFetchState): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) return jsonResponse([ACTIVITY_CLIENT]);
    if (u.includes("/rest/v1/firm_members_visible")) return jsonResponse(MEMBERS);
    if (u.includes("/rest/v1/rpc/list_activity")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as unknown;
      state.calls.list_activity.push(body);
      const idx = Math.min(state.calls.list_activity.length - 1, state.listActivity.length - 1);
      const next = state.listActivity[idx];
      if (!next) throw new Error("mockActivityFetch: no list_activity response configured for this call");
      return next();
    }
    if (u.includes("/rest/v1/rpc/get_activity_event")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as unknown;
      state.calls.get_activity_event.push(body);
      if (!state.getActivityEvent) throw new Error("mockActivityFetch: no get_activity_event response configured");
      return state.getActivityEvent();
    }
    throw new Error(`mockActivityFetch: unexpected fetch ${u}`);
  }) as typeof fetch;
}

export function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

export function App(children: unknown) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children: children as never });
}

/** Mounts `children` and appends the container to `document.body`, because the event Sheet
 *  (@base-ui/react) portals its open content there — a scan of the container alone would walk
 *  right past it (the same reasoning `members-fixtures.ts`'s own `mountMembers` records). */
export async function mountActivity(children: unknown) {
  const h = await renderComponent(App(children) as never);
  const body = (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } })
    .document.body;
  body.appendChild(h.container as unknown as StubNode);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body };
}
