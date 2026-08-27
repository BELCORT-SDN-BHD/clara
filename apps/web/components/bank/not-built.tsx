"use client";

// The one honest "no affordance without a named backend verb" placeholder
// (mohe-grill-rulings Q9). `missingVerb` is a plain code-comment-style note,
// never invented copy — it names the exact DB verb/leg this surface needs
// once it lands.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export function NotBuilt({ missingVerb }: { missingVerb: string }) {
  const t = useTranslations("ClientBank.common");
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
      <Badge variant="outline" className="self-start">{t("notBuiltYet")}</Badge>
      {/* missingVerb: {missingVerb} — named for the reader, not translated (a DB identifier). */}
      <p>{t("notBuiltDetail", { verb: missingVerb })}</p>
    </div>
  );
}
