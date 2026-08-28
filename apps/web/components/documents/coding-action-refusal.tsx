"use client";

// R2, independent review: components/bank/action-refusal.tsx's own title
// text defaults to `ClientBank.common` — a real problem the moment ANY
// non-bank surface uses it (every coding-lane / agent-tasks refusal was
// silently titled "The bank refused this"). ActionRefusal itself now takes
// optional title overrides (its own header explains the fix); this thin
// wrapper supplies the shared, domain-neutral `Common` namespace strings
// once, for every T7 caller, rather than six files each re-deriving the
// same two `t()` calls.

import { useTranslations } from "next-intl";
import { ActionRefusal } from "@/components/bank/action-refusal";
import type { PartClr } from "@/lib/parts/hooks";

export function CodingActionRefusal({ err, clr }: { err: string | null; clr: PartClr }) {
  const t = useTranslations("Common");
  return <ActionRefusal err={err} clr={clr} refusalTitle={t("refusalTitle")} actionFailedTitle={t("actionFailedTitle")} />;
}
