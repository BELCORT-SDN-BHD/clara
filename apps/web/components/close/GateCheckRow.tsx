"use client";

// One close-gate check row (get_close_plan's `checks[]`, 0064:154) — drawer
// number, title, measured state, and its outstanding items' attestations. Gate
// state is shown as shape+glyph+label, never hue alone (the coordinator's
// ruling, porting the dashboard precedent's own a11y discipline) — the Badge
// variant supplies color as a SECONDARY cue only.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CloseDoorDialog } from "./CloseDoorDialog";
import type { ClosePlanCheck, GateState } from "@/lib/close/types";

const STATE_GLYPH: Record<GateState, string> = {
  pass: "✓",
  fail: "✕",
  unknown: "?",
  error: "!",
  advisory: "·",
};

const STATE_VARIANT: Record<GateState, "default" | "destructive" | "outline" | "secondary"> = {
  pass: "default",
  fail: "destructive",
  unknown: "outline",
  error: "destructive",
  advisory: "secondary",
};

/** F1 (independent review, HIGH): get_close_plan (0064:212-219) emits the
 *  sentinel item_key '__gate__' for a NON-itemized gate (only five check_keys
 *  are ever itemized, 0104:581-606's own closed CASE) — a UI-facing
 *  placeholder, never a real item_key. Passing it straight through to
 *  attest_close_exception's p_item_key refuses FOREVER (CLR10
 *  attest_item_unknown, 0120:986-991: "gate % carries no outstanding items to
 *  attest by key"); the door's own whole-gate path requires p_item_key IS
 *  NULL. Exported (not inlined) so the mapping is unit-tested directly,
 *  independent of whether a test harness can simulate a dialog click. */
export function toAttestItemKey(itemKey: string): string | null {
  return itemKey === "__gate__" ? null : itemKey;
}

function GateBadge({ state, notYetMeasuredLabel }: { state: GateState | "not_yet_measured"; notYetMeasuredLabel: string }) {
  if (state === "not_yet_measured") {
    return (
      <Badge variant="outline">
        <span aria-hidden="true">…</span> {notYetMeasuredLabel}
      </Badge>
    );
  }
  return (
    <Badge variant={STATE_VARIANT[state]}>
      <span aria-hidden="true">{STATE_GLYPH[state]}</span> {state}
    </Badge>
  );
}

export function GateCheckRow({
  check,
  closeRunId,
  busy,
  onAttest,
}: {
  check: ClosePlanCheck;
  /** null when there is no in-progress close run to attest against (a closed
   *  or open year's checks are read-only history here). */
  closeRunId: string | null;
  busy: boolean;
  onAttest: (args: { checkKey: string; reason: string; itemKey: string | null }) => Promise<void>;
}) {
  const t = useTranslations("ClientClose.gates");
  return (
    <div className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("drawer")} {check.drawer}</span>
        <span className="font-medium text-card-foreground">{check.title}</span>
        <GateBadge state={check.result.state} notYetMeasuredLabel={t("notYetMeasured")} />
        {check.applies_when !== "always" ? (
          <span className="text-xs text-muted-foreground">({check.applies_when})</span>
        ) : null}
      </div>
      {check.items.length > 0 ? (
        <ul className="flex flex-col gap-1.5 pl-1">
          {check.items.map((item) => {
            const mappedItemKey = toAttestItemKey(item.item_key);
            const isWholeGate = mappedItemKey === null;
            return (
              <li key={item.item_key} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={isWholeGate ? "text-muted-foreground" : "font-mono text-muted-foreground"}>
                  {isWholeGate ? t("wholeGate") : item.item_key}
                </span>
                {item.attestation.state === "absent" ? (
                  <>
                    <Badge variant="outline">{t("noAttestation")}</Badge>
                    {closeRunId && check.drawer === 2 ? (
                      <AttestForm
                        busy={busy}
                        onSubmit={(reason) => onAttest({ checkKey: check.check_key, reason, itemKey: mappedItemKey })}
                      />
                    ) : null}
                  </>
                ) : (
                  <Badge variant={item.attestation.state === "live" ? "default" : "outline"}>
                    {item.attestation.state} — {item.attestation.reason}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function AttestForm({ busy, onSubmit }: { busy: boolean; onSubmit: (reason: string) => Promise<void> }) {
  const t = useTranslations("ClientClose.gates.attest");
  const [reason, setReason] = useState("");
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      disabled={reason.trim().length === 0}
      onConfirm={() => onSubmit(reason)}
    >
      <Textarea
        aria-label={t("trigger")}
        placeholder={t("reasonPlaceholder")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </CloseDoorDialog>
  );
}
