// SHARED TEST FIXTURES for the /admin/members battery — deliberately NOT a
// `.test.ts` file.
//
// The four member cells (a11y, keyboard, the behaviour/wall panel) all mount the
// same surface against the same three reads. Importing one test file from another
// would RE-RUN its cases inside the importer, inflating every count and hiding
// which file actually proved what; `scripts/check-test-manifest.mjs` globs
// `*.test.{ts,tsx,js,jsx,mjs,cjs}` and correctly ignores this one, so it stays
// out of the manifest and out of the runner.
//
// The rows here are shaped to be DISCRIMINATING, not merely valid: one member
// with an email and one WITHOUT (the floored/absent column), one REMOVED
// membership (no verbs), one `pending` invite and one whose status the view
// computed as `expired` while the row is still pending.

import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { MembersPanel } from "./members-panel";
import messages from "../../messages/en.json";

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

export const MEMBERS = [
  {
    membership_id: "m-owner",
    user_id: "u-owner",
    display_name: "Tao Lim",
    email: "tao@example.test",
    role: "owner",
    role_rank: 3,
    status: "active",
    created_at: "2026-01-04T00:00:00Z",
    removed_at: null,
  },
  {
    membership_id: "m-book",
    user_id: "u-book",
    display_name: "Siti Rahman",
    // The withheld/absent email — the cell the order says must never be blank.
    email: null,
    role: "bookkeeper",
    role_rank: 1,
    status: "active",
    created_at: "2026-02-11T00:00:00Z",
    removed_at: null,
  },
  {
    membership_id: "m-gone",
    user_id: "u-gone",
    display_name: "Wei Chan",
    email: "wei@example.test",
    role: "viewer",
    role_rank: 0,
    status: "removed",
    created_at: "2026-03-01T00:00:00Z",
    removed_at: "2026-06-30T00:00:00Z",
  },
];

export const INVITES = [
  {
    id: "i-pending",
    firm_id: "f-1",
    email: "newhire@example.test",
    role: "bookkeeper",
    status: "pending",
    invited_by: "u-owner",
    created_at: "2026-08-25T00:00:00Z",
    expires_at: "2026-09-01T00:00:00Z",
    accepted_at: null,
    revoked_at: null,
  },
  {
    id: "i-expired",
    firm_id: "f-1",
    email: "stale@example.test",
    role: "viewer",
    // EFFECTIVE, computed by the view off `expires_at` — the row itself is still
    // `pending`, which is why Revoke stays offered on it (`0141:526-529`).
    status: "expired",
    invited_by: "u-owner",
    created_at: "2026-07-01T00:00:00Z",
    expires_at: "2026-07-08T00:00:00Z",
    accepted_at: null,
    revoked_at: null,
  },
];

export const OWNER_CONTEXT = [
  { user_id: "u-owner", firm_id: "f-1", firm_name: "ROME PROPERTIES", role: "owner", role_rank: 3, is_operator: false },
];

export const BOOKKEEPER_CONTEXT = [
  { user_id: "u-book", firm_id: "f-1", firm_name: "ROME PROPERTIES", role: "bookkeeper", role_rank: 1, is_operator: false },
];

export function mockMembersFetch(u: string): Response {
  if (u.includes("/rest/v1/firm_members_visible")) return jsonResponse(MEMBERS);
  if (u.includes("/rest/v1/firm_invites_visible")) return jsonResponse(INVITES);
  if (u.includes("/rest/v1/caller_context")) return jsonResponse(OWNER_CONTEXT);
  throw new Error(`unexpected fetch: ${u}`);
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

export function App(children: unknown, heading: string) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), children as never),
  });
}

/**
 * Mounts the panel and appends the container to `document.body`, because
 * @base-ui/react portals an open Dialog and an open Menu there — a scan of the
 * container alone would walk right past the content those cells exist to check,
 * and pass.
 */
export async function mountMembers() {
  const h = await renderComponent(App(createElement(MembersPanel), "Members"));
  const body = (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } })
    .document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body };
}
