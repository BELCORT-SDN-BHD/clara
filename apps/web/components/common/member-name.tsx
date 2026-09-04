"use client";

// CB-AE2E-027 / CB-AE2E-028 — the ONE rendering of "who is this uuid", so that the
// fallback is written once and cannot drift between six surfaces.
//
// Resolved: the member's `display_name`, with the role as a quiet secondary chip.
// Unresolved: the SHORTENED raw id in the monospace treatment the product already
// uses for ids (components/firm-admin/vendor-binding-ceremony.tsx's own precedent)
// — never a guessed name, never a blank. `lib/members/use-member-names.ts`
// documents every reason a resolve can come back null, and why this component
// claims none of them.

import { useTranslations } from "next-intl";

import { shortId } from "@/lib/registers/money";
import type { MemberNameResolver } from "@/lib/members/use-member-names";

export function MemberName({
  userId,
  resolver,
  showRole = true,
}: {
  userId: string | null | undefined;
  resolver: MemberNameResolver;
  /** Off for dense table cells where the role adds noise rather than meaning. */
  showRole?: boolean;
}) {
  const t = useTranslations("Members.name");
  const resolved = resolver.resolve(userId);

  if (!resolved) {
    return (
      <span className="font-mono text-xs text-muted-foreground" title={userId ?? undefined}>
        {shortId(userId)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{resolved.display_name}</span>
      {showRole ? <span className="text-xs text-muted-foreground">{resolved.role}</span> : null}
      {resolved.removed_at ? <span className="text-xs text-muted-foreground">{t("departed")}</span> : null}
    </span>
  );
}
