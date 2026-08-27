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
import { EmptyState, LoadingState, StateBanner, type BannerTone } from "@/components/common/state";

/**
 * P3 polish — the tone ladder, applied. This file used to paint ALL four
 * wire-error kinds in the destructive tone, while components/firm/data-state.tsx
 * painted the same four in four different tones (and unboxed). Neither was
 * wrong about its own copy; they simply disagreed. One ladder now
 * (components/common/state.tsx): being signed out is a STATE, lacking a grant
 * is an authority fault, a missing relation is an absence, and only a real
 * failure is an error. The retry gate below is unchanged — no_session and
 * forbidden still get no Retry, because retrying fixes neither.
 */
const KIND_TONE: Record<string, BannerTone> = {
  no_session: "info",
  forbidden: "warning",
  not_found: "neutral",
};

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
        <StateBanner
          tone={(errKind && KIND_TONE[errKind]) ?? "error"}
          action={
            errKind !== "no_session" && errKind !== "forbidden" && onRetry ? (
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                {t("retry")}
              </Button>
            ) : undefined
          }
        >
          {copy}
        </StateBanner>
      );
    }
    return <LoadingState>{t("loading")}</LoadingState>;
  }

  if (isEmpty) {
    return <EmptyState>{t("empty")}</EmptyState>;
  }

  return <>{children}</>;
}
