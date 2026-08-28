import { getRequestConfig } from "next-intl/server";

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
 */
export default getRequestConfig(async () => {
  const locale = "en";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
