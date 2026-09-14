// #741 — ONE PRODUCT-WIDE DISPLAY TIME ZONE, and the one call site that still
// overrides it.
//
// WHAT THE OWNER RULED (2026-09-13). `i18n/request.ts` declares a static
// `timeZone` equal to `lib/business-date.ts`'s `CLARA_BUSINESS_TIMEZONE`, so
// every date and time next-intl formats renders the same wall clock on the
// server and in the browser, and agrees with the zone the ledger itself books
// in. Before the pin the zone came from whatever environment the formatter ran
// in — workerd (UTC) on the hosted server, the viewer's own browser on the
// client — which is a hydration mismatch by construction and made every
// server-side format emit use-intl's environment-fallback error.
//
// WHY THESE FOUR CELLS AND NOT A SNAPSHOT. Each one pins a separate half of the
// ruling, and each would go red on a different way of getting it wrong:
//   1. the pinned string IS the business constant (not a second spelling of
//      "Asia/Kuala_Lumpur" that a rename could silently drift away from);
//   2. a BOUNDARY instant — 16:30Z, which is 00:30 the NEXT day in Kuala
//      Lumpur — renders the same Malaysian wall clock under a server
//      static-markup render and under a real client render (the mismatch this
//      ticket exists to remove would show as two different days here);
//   3. `FormattedDate`'s own explicit `timeZone: "UTC"` survives the pin — a
//      `date` column has no instant, and the recorded calendar day must never
//      shift, which is proven against a zone that WOULD shift it;
//   4. a server-side format under the pin emits no environment-fallback error —
//      with a positive control, so "no error" is a measurement and not the
//      absence of a listener.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { CLARA_BUSINESS_TIMEZONE } from "../../lib/business-date";
import { claraRequestConfig } from "../../i18n/request";
import { FormattedDate, FormattedDateTime } from "./formatted-date";

/** The request configuration this app actually returns. It is the module's own
 *  factory, called directly: `next-intl/server`'s client-condition build — the only
 *  one resolvable under this runner — replaces `getRequestConfig` with a thrower, so
 *  the DEFAULT export cannot be invoked here (see that module's own note). */
async function pinnedConfig(): Promise<{ locale: string; timeZone?: string }> {
  return await claraRequestConfig();
}

function provided(timeZone: string | undefined, children: ReactNode): ReactElement {
  return createElement(NextIntlClientProvider, { locale: "en", messages: {}, timeZone, children });
}

/** 2026-09-17T16:30:00Z is 00:30 on 2026-09-18 in Kuala Lumpur (UTC+8) — the
 *  instant whose DAY differs between the pinned zone and the UTC the hosted
 *  server runs in, which is the only kind of instant this ticket can be wrong
 *  about. */
const BOUNDARY_INSTANT = "2026-09-17T16:30:00Z";

/** use-intl's environment-fallback fault, in both spellings its two builds use. */
const FALLBACK = /ENVIRONMENT_FALLBACK|timeZone/;

test("the request configuration pins the BUSINESS time zone, read from its own constant", async () => {
  const config = await pinnedConfig();
  assert.equal(
    config.timeZone,
    CLARA_BUSINESS_TIMEZONE,
    "the display zone and the zone the ledger books in must be one value, not two that happen to agree today",
  );
  assert.equal(config.locale, "en", "the single static locale is unchanged by this ticket");
});

test("a boundary instant renders the SAME Malaysian wall clock server-side and client-side", async () => {
  const { timeZone } = await pinnedConfig();

  const server = renderToStaticMarkup(provided(timeZone, createElement(FormattedDateTime, { value: BOUNDARY_INSTANT })));

  const h = await renderComponent(provided(timeZone, createElement(FormattedDateTime, { value: BOUNDARY_INSTANT })));
  let client: string;
  try {
    client = h.text();
  } finally {
    await h.unmount();
  }

  assert.equal(client, server, "the same instant must format identically on both sides of hydration");
  // The Malaysian reading, spelled out: the NEXT calendar day, at 00:30 — which
  // `Intl` renders as 12:30 AM under this locale's own 12-hour clock.
  assert.match(server, /Sep 18, 2026/, "16:30Z is already the 18th in Kuala Lumpur");
  assert.match(server, /12:30/, "…at 00:30 — the wall clock, not the UTC one");
  assert.doesNotMatch(server, /Sep 17, 2026/, "rendering the UTC day here is exactly the defect");
});

test("the calendar-date component keeps its UTC override — the recorded day never shifts", async () => {
  const { timeZone } = await pinnedConfig();

  const pinned = renderToStaticMarkup(provided(timeZone, createElement(FormattedDate, { value: "2026-09-18" })));
  assert.match(pinned, /Sep 18, 2026/, "a `date` column renders the day the database recorded");

  // The override is what does the work, proven against a zone that WOULD shift it:
  // UTC midnight on the 18th is 17:00 on the 17th in Los Angeles, so a component
  // that had inherited the ambient zone would print the 17th here.
  const westOfUtc = renderToStaticMarkup(
    provided("America/Los_Angeles", createElement(FormattedDate, { value: "2026-09-18" })),
  );
  assert.match(westOfUtc, /Sep 18, 2026/, "the explicit UTC pin must survive any ambient or configured zone");
});

test("a server-side format under the pin emits NO environment-fallback error", async () => {
  const { timeZone } = await pinnedConfig();
  const real = console.error;
  const seen: string[] = [];
  console.error = ((...args: unknown[]) => {
    seen.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
  }) as typeof console.error;
  let withoutZone: string[];
  // use-intl names this fault `ENVIRONMENT_FALLBACK`; its DEVELOPMENT build spells it
  // out ("There is no `timeZone` configured…") and its production build — the one this
  // runner resolves — prints the code alone. Both readings are matched, so the cell
  // measures the same fault whichever build is loaded.
  try {
    renderToStaticMarkup(provided(timeZone, createElement(FormattedDateTime, { value: BOUNDARY_INSTANT })));
    const pinnedErrors = [...seen];
    assert.deepEqual(
      pinnedErrors.filter((m) => FALLBACK.test(m)),
      [],
      "the library's environment-fallback error must be gone once a zone is configured",
    );

    // POSITIVE CONTROL — the same render with NO zone must still raise it, or the
    // assertion above would pass against a listener that simply never fires.
    seen.length = 0;
    renderToStaticMarkup(provided(undefined, createElement(FormattedDateTime, { value: BOUNDARY_INSTANT })));
    withoutZone = seen.filter((m) => FALLBACK.test(m));
  } finally {
    console.error = real;
  }
  assert.ok(
    withoutZone.length > 0,
    "control: an unconfigured zone must raise the very error the cell above asserts is absent",
  );
});
