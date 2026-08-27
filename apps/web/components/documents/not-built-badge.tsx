"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

/**
 * The ⌘K "Do" precedent (components/command/command-palette.tsx): an affordance
 * with no named backend verb renders as a disabled control naming its own shape,
 * never a fake working button and never a silent omission. `reason` names WHY —
 * which verb/surface is missing — so this never reads as a bug.
 */
export function NotBuiltBadge({ label, reason }: { label: string; reason: string }) {
  const t = useTranslations("ClientDocuments");
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
      <span aria-hidden className="cursor-not-allowed opacity-60">
        {label}
      </span>
      <Badge variant="outline">{t("notBuiltYet")}</Badge>
      <span className="sr-only">{reason}</span>
    </span>
  );
}
