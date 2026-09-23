"use client";

// The `fixed_asset_incomplete` inline needs-you affordance (T3, port-wave plan
// §5's "T3 fixed assets | fixed_asset_incomplete inline complete" row) —
// registered into ./needs-you-affordances.tsx's NEEDS_YOU_AFFORDANCES table.
// Reuses components/registers/fa-particulars-fields.tsx's exact particulars
// form (the SAME closed key set clara._fa_validate_particulars accepts) so an
// asset can be completed straight from the queue, without a trip to the
// client's own Fixed assets tab — the pattern ./open-question-affordance.tsx
// set as the exemplar for every later train's own inline affordance.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { completeFixedAssetParticulars, completeIntent } from "@/lib/registers/fixed-assets";
import { useDepreciationDecisionKey } from "@/lib/registers/depreciation";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FaParticularsFields, EMPTY_PARTICULARS, particularsReadyToSubmit } from "@/components/registers/fa-particulars-fields";
import type { FaParticularsInput } from "@/lib/registers/fixed-assets";
import { ErrorMessage } from "./data-state";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

export function FixedAssetIncompleteAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  const t = useTranslations("FixedAssetsDepreciation.needsYou");
  const [open, setOpen] = useState(false);
  const [particulars, setParticulars] = useState<FaParticularsInput>(EMPTY_PARTICULARS);
  // #978 — ONE DECISION, ONE KEY, the same house shape #651 wired onto the run/authority/revise
  // doors and #978 itself wired onto CompleteParticularsDialog/DisposeDialog
  // (components/registers/fa-row-actions.tsx). This inline affordance has no FaDoorDialog of its
  // own, so ITS open/close IS the decision boundary: `cancel` below and a successful submit both
  // end it, exactly as a dialog's `onClosed` would.
  const decision = useDepreciationDecisionKey();

  if (!row.asset_id || !row.client_id) return null;
  const assetId = row.asset_id;
  const clientId = row.client_id;

  const submit = async () => {
    const intent = completeIntent({ clientId, assetId, particulars });
    const ok = await act(() =>
      completeFixedAssetParticulars(sessionTokenAccessor, { clientId, assetId, particulars, opKey: decision.key(intent) }).then(() => undefined),
    );
    if (ok) {
      setOpen(false);
      setParticulars(EMPTY_PARTICULARS);
      decision.renew();
    }
  };

  const cancel = () => {
    setOpen(false);
    decision.renew();
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      {open ? (
        <div className="flex flex-col gap-2">
          <FaParticularsFields idPrefix={`needsyou-fa-${assetId}`} value={particulars} onChange={setParticulars} />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || !particularsReadyToSubmit(particulars)}>
              {busy ? t("submitting") : t("submit")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancel} disabled={busy}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} disabled={busy}>
          {t("heading")}
        </Button>
      )}
    </div>
  );
}
