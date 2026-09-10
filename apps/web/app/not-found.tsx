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
 * "v13.3.0 — Root app/not-found handles global unmatched URLs"). At the time
 * this file was written, nothing in apps/web called `notFound()`, so a
 * `(firm)/not-found.tsx` would have been an unreachable branch. This root file
 * still owns the UNMATCHED-URL case; #614 D6 later gave one of the segments
 * that now call `notFound()` (`app/(firm)/clients/[clientId]/layout.tsx`) its own
 * boundary at `app/(firm)/clients/not-found.tsx`, inside the shell. The other two
 * call sites — `app/(full)/clients/[clientId]/layout.tsx` (the malformed-id
 * guard added for the same #614 follow-up) and
 * `app/(full)/clients/[clientId]/clara/[threadId]/page.tsx` — are in the `(full)`
 * group rather than `(firm)` and have no boundary of their own, so they still
 * bubble all the way up to this file — an escalated thread on an unreadable or
 * malformed client id renders the same unmatched-URL page as a bad path.
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
        {/* #614 D5: the needs-you door renamed to Work. */}
        <Link href="/work" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("work")}
        </Link>
      </nav>
    </PageShell>
  );
}
