"use client";

// approve_opening_seed / approve_opening_correction — admin+, the two
// batch-approval ceremonies. Both gather `p_entry_revisions` from the seed's
// own draft opening_items (lib/registers/opening.ts's `loadOpeningEntryRevisions`
// + `buildEntryRevisionsMap`) and, for approve_opening_seed, the onboarding
// plan's current `revision_token` (`loadOnboardingPlanRevision`) — a
// server-side optimistic-concurrency check (CLR31 `stale_plan`), never a
// figure this dialog invents. Attestation is offered unconditionally; the
// door alone decides (CLR05 `self_attestation`) whether it was required —
// gating SHAPES, never HIDES.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OpeningDoorDialog } from "./OpeningDoorDialog";
import { approveOpeningSeed, approveOpeningCorrection } from "@/lib/registers/opening-doors";
import { loadOpeningEntryRevisions, loadOnboardingPlanRevision, buildEntryRevisionsMap } from "@/lib/registers/opening";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { OpeningItemRow, OpeningSeedRow } from "@/lib/registers/opening-types";

function useEntryRevisions(items: OpeningItemRow[]) {
  const [revisions, setRevisions] = useState<Record<string, string>>({});
  const entryIds = items.map((i) => i.entry_id).sort().join(",");
  useEffect(() => {
    let cancelled = false;
    loadOpeningEntryRevisions(sessionTokenAccessor, items.map((i) => i.entry_id)).then((rows) => {
      if (!cancelled) setRevisions(buildEntryRevisionsMap(rows));
    });
    return () => { cancelled = true; };
    // Deliberately keyed on the entry-id SET (a joined string), not `items`'
    // object identity — this project's eslint config does not register
    // react-hooks/exhaustive-deps (lib/parts/hooks.ts's own header notes the
    // same), so no suppression comment is needed.
  }, [entryIds]);
  return revisions;
}

export function ApproveOpeningSeedDialog({
  seed,
  draftItems,
  busy,
  act,
}: {
  seed: OpeningSeedRow;
  draftItems: OpeningItemRow[];
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.approve");
  const [attestation, setAttestation] = useState("");
  const revisions = useEntryRevisions(draftItems);

  return (
    <OpeningDoorDialog
      triggerLabel={t("approveTrigger")}
      title={t("approveTitle")}
      description={t("approveDescription")}
      confirmLabel={t("approveTrigger")}
      busy={busy}
      confirmDisabled={draftItems.length === 0}
      onConfirm={async () => {
        await act(async () => {
          const plan = await loadOnboardingPlanRevision(sessionTokenAccessor, seed.plan_id);
          if (!plan) throw new Error(t("planRevisionMissing"));
          await approveOpeningSeed(sessionTokenAccessor, {
            seed: seed.id,
            expectedPlanRevision: plan.revision_token,
            tieDocumentSha256: seed.tie_document_sha256,
            entryRevisions: revisions,
            attestation,
          });
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{t("draftCountNote", { count: draftItems.length })}</p>
        <div className="grid gap-1.5">
          <Label htmlFor="opening-approve-attestation">{t("attestationLabel")}</Label>
          <Textarea id="opening-approve-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("attestationHint")}</p>
        </div>
      </div>
    </OpeningDoorDialog>
  );
}

export function ApproveOpeningCorrectionDialog({
  seed,
  correctionItems,
  busy,
  act,
}: {
  seed: OpeningSeedRow;
  correctionItems: OpeningItemRow[];
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.approve");
  const [attestation, setAttestation] = useState("");
  const revisions = useEntryRevisions(correctionItems);

  return (
    <OpeningDoorDialog
      triggerLabel={t("approveCorrectionTrigger")}
      title={t("approveCorrectionTitle")}
      description={t("approveCorrectionDescription")}
      confirmLabel={t("approveCorrectionTrigger")}
      busy={busy}
      confirmDisabled={correctionItems.length === 0}
      onConfirm={async () => { await act(async () => { await approveOpeningCorrection(sessionTokenAccessor, { seed: seed.id, entryRevisions: revisions, attestation }); }); }}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{t("draftCountNote", { count: correctionItems.length })}</p>
        <div className="grid gap-1.5">
          <Label htmlFor="opening-approve-correction-attestation">{t("attestationLabel")}</Label>
          <Textarea id="opening-approve-correction-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
        </div>
      </div>
    </OpeningDoorDialog>
  );
}
