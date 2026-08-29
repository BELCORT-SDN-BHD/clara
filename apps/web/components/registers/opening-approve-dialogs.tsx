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
import { ErrorMessage } from "@/components/firm/data-state";
import { fmtCents } from "@/lib/registers/money";
import { approveOpeningSeed, approveOpeningCorrection } from "@/lib/registers/opening-doors";
import { loadOpeningEntryRevisions, loadOnboardingPlanRevision, buildEntryRevisionsMap } from "@/lib/registers/opening";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { OpeningItemRow, OpeningSeedRow } from "@/lib/registers/opening-types";

/** N5 (fix round, rev-t2): the prior version had NO `.catch` — a rejected
 *  `loadOpeningEntryRevisions` (a 403, a dropped connection) surfaced as an
 *  unhandled promise rejection AND left `revisions` at `{}`, so Confirm still
 *  looked reachable and, if clicked, posted an EMPTY `p_entry_revisions` —
 *  the door's own `revision_mismatch` refusal then read as if the human's
 *  own edit were stale, when the real cause was a READ that never completed.
 *  The read failure now renders as its own error, and Confirm gates on it. */
function useEntryRevisions(items: OpeningItemRow[]) {
  const [revisions, setRevisions] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const entryIds = items.map((i) => i.entry_id).sort().join(",");
  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadOpeningEntryRevisions(sessionTokenAccessor, items.map((i) => i.entry_id))
      .then((rows) => {
        if (!cancelled) setRevisions(buildEntryRevisionsMap(rows));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e);
      });
    return () => { cancelled = true; };
    // Deliberately keyed on the entry-id SET (a joined string), not `items`'
    // object identity — this project's eslint config does not register
    // react-hooks/exhaustive-deps (lib/parts/hooks.ts's own header notes the
    // same), so no suppression comment is needed.
  }, [entryIds]);
  return { revisions, error };
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
  const { revisions, error: revisionsError } = useEntryRevisions(draftItems);

  return (
    <OpeningDoorDialog
      triggerLabel={t("approveTrigger")}
      title={t("approveTitle")}
      description={t("approveDescription")}
      confirmLabel={t("approveTrigger")}
      busy={busy}
      confirmDisabled={draftItems.length === 0 || revisionsError !== null}
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
        <ApprovalItemList items={draftItems} />
        {revisionsError ? <ErrorMessage error={revisionsError} /> : null}
        <div className="grid gap-1.5">
          <Label htmlFor="opening-approve-attestation">{t("attestationLabel")}</Label>
          <Textarea id="opening-approve-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("attestationHint")}</p>
        </div>
      </div>
    </OpeningDoorDialog>
  );
}

/** N6 (fix round, rev-t2): consent shows the SET it approves (item key, kind,
 *  amount), not a bare count — up to a printable cap, beyond which it falls
 *  back to the count (declined-with-reason: a 40-item batch's per-row list
 *  would overflow the dialog and stop being readable consent, which is worse
 *  than an honest count). */
const APPROVAL_LIST_CAP = 12;

function ApprovalItemList({ items }: { items: OpeningItemRow[] }) {
  const t = useTranslations("OpeningCarryDown.approve");
  const tk = useTranslations("OpeningCarryDown.items");
  const tc = useTranslations("Common");
  // A checked lookup, never a dynamic `tk(item_kind)` call (N10's own
  // reasoning, fixed-assets-register.tsx) — a kind value outside the closed
  // set falls back to the RAW value rather than throwing a missing-message
  // error out of a governed consent dialog.
  const kindLabels: Record<string, string> = {
    gl_balance: tk("kindLabels.gl_balance"),
    bank_uncleared: tk("kindLabels.bank_uncleared"),
    ar_open_item: tk("kindLabels.ar_open_item"),
    ap_open_item: tk("kindLabels.ap_open_item"),
    fixed_asset: tk("kindLabels.fixed_asset"),
    equity_net: tk("kindLabels.equity_net"),
    obe_plug: tk("kindLabels.obe_plug"),
  };
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{t("draftCountNote", { count: 0 })}</p>;
  if (items.length > APPROVAL_LIST_CAP) {
    return <p className="text-xs text-muted-foreground">{t("draftCountNote", { count: items.length })}</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.id}>
          {i.item_key} — {kindLabels[i.item_kind] ?? i.item_kind} — {fmtCents(i.amount_cents, tc("centsUnsafe"))}
        </li>
      ))}
    </ul>
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
  const { revisions, error: revisionsError } = useEntryRevisions(correctionItems);

  return (
    <OpeningDoorDialog
      triggerLabel={t("approveCorrectionTrigger")}
      title={t("approveCorrectionTitle")}
      description={t("approveCorrectionDescription")}
      confirmLabel={t("approveCorrectionTrigger")}
      busy={busy}
      confirmDisabled={correctionItems.length === 0 || revisionsError !== null}
      onConfirm={async () => { await act(async () => { await approveOpeningCorrection(sessionTokenAccessor, { seed: seed.id, entryRevisions: revisions, attestation }); }); }}
    >
      <div className="flex flex-col gap-2">
        <ApprovalItemList items={correctionItems} />
        {revisionsError ? <ErrorMessage error={revisionsError} /> : null}
        <div className="grid gap-1.5">
          <Label htmlFor="opening-approve-correction-attestation">{t("attestationLabel")}</Label>
          <Textarea id="opening-approve-correction-attestation" value={attestation} onChange={(e) => setAttestation(e.target.value)} />
        </div>
      </div>
    </OpeningDoorDialog>
  );
}
