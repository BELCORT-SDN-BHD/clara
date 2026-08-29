import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { buttonVariants } from "@/components/ui/button";

/**
 * The app's 404 (MBB-5, docs/plan/active/mohe-alignment-audit-2026-08-29.md §2).
 * Until now there was none, so an unmatched URL landed on Next's bare built-in
 * page: no product typeface, no tokens, no way back except the browser's Back
 * button.
 *
 * WHY THIS FILE AND NOT `app/(firm)/not-found.tsx`. The audit's finding described
 * the 404 as rendering "outside the (firm) shell", which reads like an argument
 * for a group-scoped not-found. Next 16 does not work that way, and the version
 * this repo pins says so in its own bundled docs
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * not-found.md): "not-found.js … is used to render UI when the `notFound`
 * function is thrown within a route segment", while "the root app/not-found.js …
 * handle[s] any unmatched URLs for your whole application" (Version History:
 * "v13.3.0 — Root app/not-found handles global unmatched URLs"). Nothing in
 * apps/web calls `notFound()` — a full-tree grep returns zero — so a
 * `(firm)/not-found.tsx` would be an unreachable branch today AND would not
 * catch the case the finding is about. The root file is the one that does.
 *
 * It therefore renders inside the ROOT layout (fonts, tokens, the intl provider)
 * but NOT inside the firm sidebar shell, because Next composes the root
 * not-found above the route groups, not inside one. The two links below are the
 * way back in; both are real routes, asserted by lib/command/routes.test.ts's
 * own oracle over the same `app/` tree.
 */
export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <nav className="flex flex-wrap gap-2" aria-label={t("navLabel")}>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("firmHome")}
        </Link>
        <Link href="/needs-you" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("needsYou")}
        </Link>
      </nav>
    </PageShell>
  );
}
