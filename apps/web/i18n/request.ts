import { getRequestConfig } from "next-intl/server";

import { CLARA_BUSINESS_TIMEZONE } from "@/lib/business-date";

/**
 * P1 foundation: a single static locale, no locale-prefixed routing.
 *
 * Owner ruling Q5 (docs/plan/active/mohe-grill-rulings-2026-08-27.md): UI
 * chrome is English-first for beta, but every string goes through next-intl
 * from day one — hardcoded UI strings are lint-banned once product screens
 * land. Statutory/client-facing instruments (PDPA notices, client
 * authorization, watermark locale) ship BM+EN separately (docs/ops/legal/);
 * that is a different, later surface from this UI-chrome skeleton.
 *
 * THE SCREENS HAVE LANDED AND THAT BAN IS STILL OWED (trued 2026-08-29 —
 * the sentence above read in the future tense long after P3 and the port
 * wave shipped). eslint.config.mjs now carries Q5's sibling ruling Q4, the
 * raw-colour ban, but not the string half. Measured while landing Q4: a
 * `JSXText` selector would catch 7 sites in 2 files today — cheap. What no
 * selector can see is a hardcoded string passed as a PROP, e.g. the ten card
 * titles in components/parts/PartRenderer.tsx's `summaryOf`. A JSXText-only
 * rule would therefore green a file that is still full of them, which is a
 * worse state than no gate. Both halves belong in one pass, at P6's entry
 * gate (裁-9's third conformance pass).
 *
 * This is next-intl's documented "without i18n routing" setup
 * (https://next-intl.dev/docs/usage/configuration#static-request-locale):
 * no middleware, no `[locale]` segment, `getRequestConfig` returns a static
 * locale. Adding `en-GB`/`ms`/`zh` later is a routing.ts + middleware change
 * scoped to this file and next.config.ts — it does not require moving any
 * route.
 *
 * PORT-WAVE NAMESPACE OWNERSHIP (T0 seam, port-wave plan §3.4, pre-landed
 * 2026-08-28). ../messages/en.json's 23 pre-existing top-level namespaces
 * (Metadata … Invite) are untouched. Eleven empty namespace blocks were
 * appended after them, one per port-wave train, so each train's own copy
 * lands as a diff confined to its own block — never a shared insertion point
 * eleven trains would otherwise collide on:
 *
 *   T1  CloseLifecycle            close lifecycle + fiscal year
 *   T2  OpeningCarryDown          opening & carry-down (seed lifecycle)
 *   T3  FixedAssetsDepreciation   fixed assets & depreciation
 *   T4  AdjustmentsAccounts       adjustments, templates & accounts
 *   T5  StaffAdvances             staff advances
 *   T6  DraftsDocumentGovernance  drafts & document governance
 *   T7  CodingQuestionsSignals    coding, questions & quality signals
 *   T8  ArApCounterparty          AR/AP statements & counterparty hygiene
 *   T9  ReportsSnapshotsSeeding   reports authoring, snapshots, wiki & seeding
 *   T10 FirmAdminCompliance       vendor bindings, compliance & sharing
 *   T11 ClientOnboarding          client onboarding five (in-thread checklist)
 *
 * These are namespace assignments only, independent of where each train's
 * surface ends up routed (registers-workbench.tsx's TABS and
 * client-workspace-nav.tsx's CLIENT_TABS are untouched by this seam PR — see
 * that PR's own report for why). A train extending an EXISTING namespace
 * that only it owns (e.g. T1 may still add keys under "ClientClose" if its
 * copy belongs there) is not required to use its assigned block instead —
 * the assignment exists so a train that DOES need fresh keys never has to
 * pick an insertion point another train might also pick.
 *
 * ONE PRODUCT-WIDE DISPLAY TIME ZONE (#741, owner ruling 2026-09-13). Left
 * unset, next-intl resolves the zone from whatever environment the formatter
 * happens to run in — workerd's on the hosted server (UTC), the viewer's own
 * browser on the client — so one instant could render as two different wall
 * clocks either side of hydration, and every server-side format emitted the
 * library's own "There is no `timeZone` configured" environment-fallback
 * error. The zone is pinned here instead, and it is `lib/business-date.ts`'s
 * `CLARA_BUSINESS_TIMEZONE` READ, never a second spelling of the same string:
 * Clara's scope is Malaysian accounting firms, `clara._book_today()` books in
 * that zone, and a displayed instant that disagreed with the day the ledger
 * recorded it on would be the "two machines, two days" hazard that module
 * exists to prevent, arriving on the READ side.
 *
 * A CALL SITE MAY STILL OVERRIDE IT, and exactly one does:
 * `components/journals/formatted-date.tsx`'s `FormattedDate` pins UTC, because
 * a `date` column carries no instant and any zone at all could shift the
 * calendar day the database recorded (that component's own header argues it).
 * Its `FormattedDateTime` twin inherits this pin.
 *
 * PER-FIRM TIME ZONES ARE OUT OF SCOPE. If one is ever needed it becomes a firm
 * setting that overrides this pin; nothing today asks for one.
 */
/** The factory itself, exported so a unit cell can READ what this app configures.
 *  `getRequestConfig` below is `next-intl/server`, whose client-condition build
 *  returns a function that throws "not supported in Client Components" — under the
 *  node test runner that is the only build resolvable, so the default export can be
 *  imported but never called. A cell that asserted the pin any other way (a source
 *  regex, a re-declared constant) would be asserting a copy of this rule instead of
 *  this rule. */
export async function claraRequestConfig() {
  const locale = "en";

  return {
    locale,
    timeZone: CLARA_BUSINESS_TIMEZONE,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
}

export default getRequestConfig(claraRequestConfig);
