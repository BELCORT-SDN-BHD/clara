"use client";

// THE ONE DOWNLOAD CONTROL, for BOTH artifact families (FS-7 echelon 2, 裁-96②).
//
// A sealed `report_artifacts` row and a watermarked `sandbox_exports` row are the same thing to
// this component: an id the OFFER door has already ruled on. It renders three states and only
// three, and each is the database's own word rather than this surface's guess:
//
//   · the door said downloadable  → the control, enabled;
//   · the door said no            → the control is NOT rendered; the typed reason is shown instead;
//   · the fetch failed            → the control stays, and the failure is shown beside it.
//
// NEVER A DEAD LINK. The control is not rendered at all unless `offer.downloadable` is true, and
// that flag is the byte door's own gate executed per row — not a predicate this file re-derives
// from a row's `kind` or `state`. A control that looks live and then refuses is the exact failure
// 裁-112's duplicated-predicate rule exists to prevent, wearing a button.
//
// THE REFUSAL RENDERS VERBATIM. `refusal_reason` is a typed token the database chose
// (`artifact_superseded`, `sandbox_export_not_complete`, `watermark_policy_absent`,
// `artifact_watermark_unproven`); it is interpolated into the surface's copy and never rewritten
// into a sentence about a decision this surface did not make.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { StateBanner } from "@/components/common/state";
import { downloadArtifact, isArtifactDownloadRefusal } from "@/lib/reports/download";
import type { DownloadableArtifact } from "@/lib/reports/types";
import type { SessionTokenAccessor } from "@/lib/session";

export function DownloadArtifactButton({
  offer,
  session,
  namespace,
}: {
  /** The OFFER door's row for this artifact, or `null` while the offer is still loading — in
   *  which case nothing is rendered, because "we do not know yet" must not look like "no". */
  offer: DownloadableArtifact | null;
  session: SessionTokenAccessor;
  /** Which surface's copy to use — the two panels carry their own wording. */
  namespace: "ClientReports.statutory.download" | "ClientReports.sandbox.download";
}) {
  const t = useTranslations(namespace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!offer) return null;

  if (!offer.downloadable) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="artifact-download-unavailable">
        {t("unavailable", { reason: offer.refusal_reason ?? "unknown" })}
      </p>
    );
  }

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadArtifact(offer.artifact_id, {
        session,
        fallbackFilename: offer.filename ?? undefined,
      });
    } catch (e) {
      // A DOOR refusal that arrives HERE is a state change between the offer and the click — the
      // artifact was superseded while the tab sat open, say. Its typed reason is shown the same
      // way the offer's is, because it is the same fact arriving later.
      setError(isArtifactDownloadRefusal(e)
        ? t("unavailable", { reason: e.reason ?? "unknown" })
        : t("failed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={run}
        data-testid="artifact-download"
        aria-label={offer.filename ? `${t("trigger")} ${offer.filename}` : t("trigger")}
      >
        {busy ? t("working") : t("trigger")}
      </Button>
      {error ? <StateBanner tone="error">{error}</StateBanner> : null}
    </div>
  );
}
