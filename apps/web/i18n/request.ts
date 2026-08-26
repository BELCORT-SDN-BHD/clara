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
 */
export default getRequestConfig(async () => {
  const locale = "en";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
