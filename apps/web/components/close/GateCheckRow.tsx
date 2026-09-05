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
import type { AttestationState, ClosePlanCheck, GateState } from "@/lib/close/types";
import type { PartClr } from "@/lib/parts/hooks";
import type { DialogRefusal } from "@/components/common/dialog-refusal";

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

/** 裁-187 (owner, 2026-09-04) — the attestation FIELD is revealed only beside a
 *  verbatim door refusal that NAMES an attestation. These are finalize_close's own
 *  two attestation reasons, read from its live body (0128:199-232 `drawer2_unattested`,
 *  0128:222-229 `close_attestation_stale`); the database walls come down in a later
 *  lane, so until then the honest interim is: don't offer a ceremony until the DB
 *  asks for one, and never fabricate the string it asks for. */
export function attestationWasNamedByRefusal(refusal: PartClr): boolean {
  return (
    refusal?.code === "CLR41" &&
    (refusal.reason === "drawer2_unattested" || refusal.reason === "close_attestation_stale")
  );
}

/** H-56 — the DB's raw `close_gate_results.state` token was printed straight to a
 *  professional ("? unknown", "live") beside translated copy in the same row. A
 *  CHECKED lookup with a RAW-VALUE fallback, never a dynamic `t(state)` call: a
 *  value outside the closed set falls back to the token rather than throwing a
 *  missing-message error out of the close plan (the fixed-assets-register.tsx
 *  precedent this row's own header already cites). */
function useGateStateLabel(): (state: GateState) => string {
  const t = useTranslations("ClientClose.gates.state");
  return (state) => {
    const known: Record<GateState, string> = {
      pass: t("pass"),
      fail: t("fail"),
      unknown: t("unknown"),
      error: t("error"),
      advisory: t("advisory"),
    };
    return known[state] ?? state;
  };
}

function useAttestationStateLabel(): (state: AttestationState) => string {
  const t = useTranslations("ClientClose.gates.attestationState");
  return (state) => {
    const known: Record<AttestationState, string> = {
      absent: t("absent"),
      live: t("live"),
      stale: t("stale"),
    };
    return known[state] ?? state;
  };
}

function GateBadge({ state, notYetMeasuredLabel, label }: { state: GateState | "not_yet_measured"; notYetMeasuredLabel: string; label: (s: GateState) => string }) {
  if (state === "not_yet_measured") {
    return (
      <Badge variant="outline">
        <span aria-hidden="true">…</span> {notYetMeasuredLabel}
      </Badge>
    );
  }
  return (
    <Badge variant={STATE_VARIANT[state]}>
      <span aria-hidden="true">{STATE_GLYPH[state]}</span> {label(state)}
    </Badge>
  );
}

export function GateCheckRow({
  check,
  closeRunId,
  busy,
  refusal,
  refusalMessage,
  onAttest,
}: {
  check: ClosePlanCheck;
  /** null when there is no in-progress close run to attest against (a closed
   *  or open year's checks are read-only history here). */
  closeRunId: string | null;
  busy: boolean;
  /** The panel's own standing refusal. 裁-187: it is what REVEALS the attest
   *  affordance — see `attestationWasNamedByRefusal`. Defaults to null, i.e. no
   *  attestation ceremony is offered. */
  refusal?: PartClr;
  /** The same refusal's verbatim message, carried INTO the attest dialog
   *  (CB-AE2E-004 — the page banner is behind the modal backdrop). */
  refusalMessage?: string | null;
  onAttest: (args: { checkKey: string; reason: string; itemKey: string | null }) => Promise<boolean>;
}) {
  const t = useTranslations("ClientClose.gates");
  const gateStateLabel = useGateStateLabel();
  const attestationStateLabel = useAttestationStateLabel();
  const attestationOffered = attestationWasNamedByRefusal(refusal ?? null);
  return (
    <div className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("drawer")} {check.drawer}</span>
        <span className="font-medium text-card-foreground">{check.title}</span>
        <GateBadge state={check.result.state} notYetMeasuredLabel={t("notYetMeasured")} label={gateStateLabel} />
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
                    {closeRunId && check.drawer === 2 && attestationOffered ? (
                      <AttestForm
                        busy={busy}
                        dialogRefusal={{ err: refusalMessage ?? null, clr: refusal ?? null }}
                        onSubmit={(reason) => onAttest({ checkKey: check.check_key, reason, itemKey: mappedItemKey })}
                      />
                    ) : null}
                  </>
                ) : (
                  // P3 polish: the STATE is the badge; the human's free-text
                  // reason is prose beside it. Seen in the harness at 1440px,
                  // a whole sentence inside a filled `--primary` pill was the
                  // loudest element on the close plan and grew unboundedly
                  // with whatever the attester typed. Both values still render
                  // verbatim — only which one is a chip changed.
                  <>
                    <Badge variant={item.attestation.state === "live" ? "default" : "outline"}>
                      {attestationStateLabel(item.attestation.state)}
                    </Badge>
                    <span className="text-muted-foreground">{item.attestation.reason}</span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function AttestForm({ busy, dialogRefusal, onSubmit }: { busy: boolean; dialogRefusal: DialogRefusal; onSubmit: (reason: string) => Promise<boolean> }) {
  const t = useTranslations("ClientClose.gates.attest");
  const [reason, setReason] = useState("");
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      refusal={dialogRefusal}
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
