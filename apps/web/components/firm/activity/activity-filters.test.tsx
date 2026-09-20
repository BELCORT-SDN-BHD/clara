// components/firm/activity/activity-filters.tsx — #1005.
//
// The Activity feed's client filter trigger showed the raw `__all__` sentinel or a client's row
// id instead of its name (found on hosted, `app.clarabook.com`, the signed-in release walk of
// wave 2026-09-18). `state`/`clients` are plain props here — no fetch mocking needed — but the
// component still calls `useRouter`/`usePathname`/`useSearchParams` for its `apply()` callback,
// so mounting needs the same three App Router contexts `accounting-work-list.test.tsx` wires up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { ActivityFilters } from "./activity-filters";
import type { ActivityUrlState } from "@/lib/firm/activity";
import type { ClientRow } from "@/lib/firm/reads";
import messages from "../../../messages/en.json";

enableDomInspection();

const router = { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

const CLIENT_A = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Rome Properties", status: "active", created_at: "2026-01-01T00:00:00.000Z" } as ClientRow;

function App(state: ActivityUrlState, clients: readonly ClientRow[] = [CLIENT_A]): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams() as never },
      createElement(
        AppRouterContext.Provider as never,
        { value: router as never },
        createElement(
          PathnameContext.Provider as never,
          { value: "/activity" as never },
          createElement(ActivityFilters, { state, clients }),
        ),
      ),
    ),
  });
}

async function mount(el: ReactElement) {
  const h = await renderComponent(el);
  await h.settle();
  return h;
}

test("[1005]: with a client chosen, the client filter trigger shows the client's NAME, never its row id", async () => {
  const h = await mount(App({ client: CLIENT_A.id, kinds: [], since: null, until: null, event: null }));
  try {
    assert.match(h.text(), /Rome Properties/, "the trigger must show the client's name");
    assert.doesNotMatch(h.text(), new RegExp(CLIENT_A.id), "the client row id must never render as trigger text");
  } finally {
    await h.unmount();
  }
});

test("[1005]: with no client chosen, the trigger shows the 'All clients' label, never the raw __all__ sentinel", async () => {
  const h = await mount(App({ client: null, kinds: [], since: null, until: null, event: null }));
  try {
    const text = h.text();
    assert.match(text, /All clients/);
    assert.doesNotMatch(text, /__all__/, "the raw sentinel value must never render as trigger text");
  } finally {
    await h.unmount();
  }
});

// fix-round ADV-2: a well-formed client id that is NOT in the `clients` roster (an archived or
// out-of-scope client reached via a bookmarked/hand-edited URL) used to fall back to the exact
// same "All clients" label the trigger shows when nothing is filtered, so an applied filter read
// as unfiltered. It must render something distinguishable from BOTH the placeholder and any real
// client's name — proving the label is neither "no value" nor a lucky roster hit.
test("[ADV-2]: a client id absent from the roster reads as filtered, never as 'All clients'", async () => {
  const missingClientId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const h = await mount(App({ client: missingClientId, kinds: [], since: null, until: null, event: null }));
  try {
    const text = h.text();
    assert.doesNotMatch(text, /All clients/, "an applied-but-unresolvable filter must not read as 'All clients'");
    assert.doesNotMatch(text, new RegExp(missingClientId), "the raw id must never render as trigger text");
    assert.match(text, /not in this list/i, "the trigger must say the value is filtered but unresolvable");
  } finally {
    await h.unmount();
  }
});
