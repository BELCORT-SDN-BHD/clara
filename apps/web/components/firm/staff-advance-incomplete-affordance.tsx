"use client";

// The staff_advance_incomplete inline act — complete_staff_advance_particulars
// on clara.list_review_queue's row_kind born by 0043's S3.8 (fixed_asset_incomplete's
// own shape, copied exactly — lib/firm/needs-you.ts's grounding note). Registered
// into ./needs-you-affordances.tsx (T0 seam, port-wave plan §3.2) — the
// OpenQuestionAffordance pattern (this train's own copy: purpose/reference
// inputs rather than a single resolution field, since
// complete_staff_advance_particulars takes both).

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeStaffAdvanceParticulars } from "@/lib/registers/staff-advances-doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "./data-state";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

export function StaffAdvanceIncompleteAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  const t = useTranslations("StaffAdvances.needsYou");
  const tc = useTranslations("Common");
  const [editing, setEditing] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [reference, setReference] = useState("");

  if (!row.advance_id || !row.client_id) return null;
  const advanceId = row.advance_id;
  const clientId = row.client_id;

  const submit = async () => {
    const p = purpose.trim();
    const r = reference.trim();
    if (!p || !r) return;
    const ok = await act(() =>
      completeStaffAdvanceParticulars(clientId, advanceId, p, r, { session: sessionTokenAccessor }).then(() => undefined),
    );
    // N13 (the needs-you house rule this train's own registry entry follows):
    // clear only on success — a refusal must not discard what the human typed.
    if (ok) {
      setEditing(false);
      setPurpose("");
      setReference("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      {editing ? (
        <div className="flex flex-col gap-2">
          <Input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={t("purposePlaceholder")}
            aria-label={t("purposePlaceholder")}
            disabled={busy}
          />
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t("referencePlaceholder")}
            aria-label={t("referencePlaceholder")}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || !purpose.trim() || !reference.trim()}>
              {busy ? t("submitting") : t("submit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setPurpose("");
                setReference("");
              }}
              disabled={busy}
            >
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
          {t("completeTrigger")}
        </Button>
      )}
    </div>
  );
}
