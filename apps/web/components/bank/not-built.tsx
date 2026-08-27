"use client";

// The one honest "no affordance without a named backend verb" placeholder
// (mohe-grill-rulings Q9). `missingVerb` is a plain code-comment-style note,
// never invented copy — it names the exact DB verb/leg this surface needs
// once it lands.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { NotBuiltNote } from "@/components/common/not-built-note";

export function NotBuilt({ missingVerb }: { missingVerb: string }) {
  const t = useTranslations("ClientBank.common");
  return (
    <NotBuiltNote>
      <Badge variant="outline">{t("notBuiltYet")}</Badge>
      {/* missingVerb: {missingVerb} — named for the reader, not translated (a DB identifier). */}
      <p>{t("notBuiltDetail", { verb: missingVerb })}</p>
    </NotBuiltNote>
  );
}
