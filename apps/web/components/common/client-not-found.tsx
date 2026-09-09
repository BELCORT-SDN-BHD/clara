"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { buttonVariants } from "@/components/ui/button";

/**
 * #614 D6 — the boundary for `notFound()` thrown by
 * `app/(firm)/clients/[clientId]/layout.tsx` (no session, a deleted client, a
 * client this firm cannot see, or a client that resolved but does not match
 * the caller's scope). Rendered from `app/(firm)/clients/not-found.tsx`, a
 * `not-found.tsx` under the `clients` segment, so `(firm)/layout.tsx` still
 * wraps it — the sidebar and rail stay on screen, unlike the root 404.
 *
 * NEVER SAYS WHICH OF THE FOUR CAUSES IT WAS, on purpose: telling a caller
 * "no such client" vs "not yours" vs "removed" would let them probe ids
 * across firms. One honest sentence covers all four. NEVER REDIRECTS either
 * — a silent bounce to /clients would look like nothing happened, and D6's
 * whole point is an explicit state, not a swallowed one.
 */
export function ClientNotFound() {
  const t = useTranslations("ClientNotFound");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <nav className="flex flex-wrap gap-2" aria-label={t("navLabel")}>
        <Link href="/clients" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("clients")}
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("firmHome")}
        </Link>
      </nav>
    </PageShell>
  );
}
