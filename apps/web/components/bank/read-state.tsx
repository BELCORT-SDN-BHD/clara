"use client";

// The one honest read-state renderer every /bank section uses: explicit
// loading, explicit empty, and a DISTINCT rendering per `WireErrorKind`
// (no_session/forbidden/not_found get their own copy; everything else falls
// through to a generic "could not load" with the DB's own message).
//
// `hasData` (not `err` alone) is what gates whether children render: a
// useHydratedPart instance that ALSO carries a write (`act`) shares its
// err/clr slot between "the read failed" and "the write failed" (hooks.ts's
// own design — one part, one lifecycle). Once real data has loaded once
// (`hasData`), a later `err` is the WRITE's outcome, not a reason to hide
// the list that is still sitting in `data` — the caller renders that
// separately via <ActionRefusal>. Gating on `err` alone was a real bug this
// build caught in its own first draft: a failed add/void/settle attempt
// briefly replaced the whole list with a bare "could not load" card.
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { WireErrorKind } from "@/lib/wire-error-kind";
import { Button } from "@/components/ui/button";

export function ReadState({
  err,
  errKind,
  hasData,
  isEmpty,
  onRetry,
  children,
}: {
  err: string | null;
  errKind: WireErrorKind | null;
  /** `true` once the loader has EVER resolved (data !== null) — see header. */
  hasData: boolean;
  isEmpty?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("ClientBank.common");

  if (!hasData) {
    if (err) {
      const copy =
        errKind === "no_session" ? t("noSession")
        : errKind === "forbidden" ? t("forbidden")
        : errKind === "not_found" ? t("notFoundRelation")
        : t("genericError", { message: err });
      return (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <p>{copy}</p>
          {errKind !== "no_session" && errKind !== "forbidden" && onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry} className="self-start">
              {t("retry")}
            </Button>
          )}
        </div>
      );
    }
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  if (isEmpty) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return <>{children}</>;
}
