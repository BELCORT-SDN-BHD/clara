"use client";

// The compliance_watch inline act — ack_compliance_watch /
// snooze_compliance_watch / resolve_compliance_watch on clara.list_review_queue's
// row_kind born by 0016_a21_compliance_watch.sql (lib/firm/needs-you.ts's
// grounding note). Registered into ./needs-you-affordances.tsx (T0 seam,
// port-wave plan §3.2). Unlike the single-action staff-advance/fixed-asset
// affordances this pattern is copied from, a compliance watch carries THREE
// distinct governed acts — this component shows all three triggers and opens
// at most one inline form at a time, so exactly one governed call is ever a
// click away (the port-wave plan's binding law: "one confirm performs exactly
// one governed call, never a batch").
//
// resolve's 'not_liable_documented' conclusion requires admin (CLR04 below
// that rank, lib/firm-admin/compliance.ts's own header) — the conclusion
// select always offers both options; the DB's rank check is the wall, never a
// client-side role guess (team-lead security note).

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { businessDateTime } from "@/lib/business-date";
import {
  getWatchDisposition,
  lastDispositionAct,
  type WatchDisposition,
} from "@/lib/firm/compliance-disposition";
import {
  ackComplianceWatch,
  snoozeComplianceWatch,
  resolveComplianceWatch,
  type ComplianceWatchConclusion,
} from "@/lib/firm-admin/compliance";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "./data-state";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

type Mode = null | "ack" | "snooze" | "resolve";

/**
 * #659 / C88.10 — THE DISPOSITION RECEIPT, and why it lives on THIS component.
 *
 * `ComplianceWatchAffordance` is the ONE component both altitudes already mount — the firm inbox
 * registers it through `needs-you-affordances.tsx:107` and renders it at `needs-you-inbox.tsx:129`,
 * and the client's Tax tab mounts it directly at `components/tax/SstWatchSection.tsx:114`. One edit
 * therefore reaches both surfaces and no second write surface is born, which is the whole reason
 * the receipt is here and not in a new panel.
 *
 * WHAT C88.10 ACTUALLY ASKED FOR was the half that was missing: not the act (all three have shipped
 * since 0016) but the ECHO — trace the receipt back to the card, and have it survive a reload. It
 * survives because it is TABLE STATE, read back through `clara.get_compliance_watch_disposition`,
 * not because anything is held in this component's memory.
 *
 * AND IT NAMES NO VERSION. The acceptance criterion asks for actor / time / version; this schema
 * carries the first two and no third. The receipt renders `state_before → state_after` and says in
 * words that there is no version number, rather than printing a figure nothing produced.
 *
 * THE RE-READ RUNS ON MOUNT AND AFTER EVERY ACT — including after a REFUSAL, deliberately: a
 * refused acknowledgement must leave the STANDING disposition exactly as it was, and the only way
 * to show that honestly is to go and look.
 */
function WatchDispositionReceipt({ watchId, epoch }: { watchId: string; epoch: number }) {
  const t = useTranslations("FirmAdminCompliance.needsYou");
  const [disposition, setDisposition] = useState<WatchDisposition | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  const read = useCallback(async () => {
    try {
      setDisposition(await getWatchDisposition(watchId, { session: sessionTokenAccessor }));
      setUnreadable(false);
    } catch {
      // A read that did not answer is not evidence that nothing was recorded (law 2). The card says
      // it could not find out, and keeps whatever it had.
      setUnreadable(true);
    }
  }, [watchId]);

  useEffect(() => { void read(); }, [read, epoch]);

  const act = lastDispositionAct(disposition);

  if (unreadable && disposition === null) {
    return <p className="text-xs text-muted-foreground">{t("receiptUnreadable")}</p>;
  }
  if (act === null) {
    return <p className="text-xs text-muted-foreground">{t("receiptNone")}</p>;
  }

  const at = act.createdAt === null ? "" : businessDateTime(act.createdAt);
  const actor = act.actor ?? "";
  const kind = act.eventKind ?? "";
  const line =
    kind === "acknowledged" ? t("receiptAct.acknowledged", { actor, at })
      : kind === "snoozed" ? t("receiptAct.snoozed", { actor, at })
        : kind === "re_armed" ? t("receiptAct.re_armed", { at })
          : t("receiptAct.resolved", { actor, at });

  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <span className="font-medium text-card-foreground">{t("receiptHeading")}</span>
      <span>{line}</span>
      {act.stateBefore !== null && act.stateAfter !== null ? (
        <span>{t("receiptTransition", { before: act.stateBefore, after: act.stateAfter })}</span>
      ) : null}
      {act.rationale !== null ? <span>{t("receiptRationale", { rationale: act.rationale })}</span> : null}
      {disposition?.resolvedEvidence != null ? (
        <span>{t("receiptEvidence", { evidence: disposition.resolvedEvidence })}</span>
      ) : null}
      <span>{t("receiptNoVersion")}</span>
    </div>
  );
}

/** N5 (independent review, 2026-08-28): the DB's own bound is
 *  `(now(), now()+60 days]` (lib/firm-admin/compliance.ts's own header,
 *  grounded at snooze_compliance_watch's live body). This is UI SHAPING
 *  only — a client whose clock differs from the server's still gets the
 *  DB's own verbatim refusal, never a client-side substitute for it. `min`
 *  is tomorrow (the finest day-granularity boundary strictly after "now"
 *  under any reasonable clock skew); `max` is today+60 days. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function snoozeDateBounds(): { min: string; max: string } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return { min: isoDate(new Date(now + dayMs)), max: isoDate(new Date(now + 60 * dayMs)) };
}

export function ComplianceWatchAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  const t = useTranslations("FirmAdminCompliance.needsYou");
  const tc = useTranslations("Common");
  const [mode, setMode] = useState<Mode>(null);
  const [rationale, setRationale] = useState("");
  const [until, setUntil] = useState("");
  const [conclusion, setConclusion] = useState<ComplianceWatchConclusion>("registration_recorded");
  const [evidence, setEvidence] = useState("");
  // #659 — the receipt's own re-read trigger. It advances after EVERY act, refused ones included:
  // a refusal must leave the standing disposition visibly unchanged, and the only honest way to
  // show that is to go and look rather than to assume.
  const [receiptEpoch, setReceiptEpoch] = useState(0);

  if (!row.watch_id) return null;
  const watchId = row.watch_id;

  const reset = () => {
    setMode(null);
    setRationale("");
    setUntil("");
    setEvidence("");
    setConclusion("registration_recorded");
  };

  const submitAck = async () => {
    const r = rationale.trim();
    if (!r) return;
    const ok = await act(() => ackComplianceWatch(sessionTokenAccessor, watchId, r).then(() => undefined));
    setReceiptEpoch((n) => n + 1);
    // N13 (the needs-you house rule this train's own registry entry follows):
    // clear only on success — a refusal must not discard what the human typed.
    if (ok) reset();
  };
  const submitSnooze = async () => {
    const r = rationale.trim();
    if (!r || !until) return;
    const untilIso = `${until}T00:00:00Z`;
    const ok = await act(() => snoozeComplianceWatch(sessionTokenAccessor, watchId, untilIso, r).then(() => undefined));
    setReceiptEpoch((n) => n + 1);
    if (ok) reset();
  };
  const submitResolve = async () => {
    const e = evidence.trim();
    if (!e) return;
    const ok = await act(() => resolveComplianceWatch(sessionTokenAccessor, watchId, conclusion, e).then(() => undefined));
    setReceiptEpoch((n) => n + 1);
    if (ok) reset();
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      {/* THE ECHO (C88.10). Rendered ABOVE the triggers so what has already been recorded is in
          front of a person BEFORE they reach for a second act, and read back from the database so
          it survives a reload. */}
      <WatchDispositionReceipt watchId={watchId} epoch={receiptEpoch} />
      {mode === null ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("ack")} disabled={busy}>
            {t("ackTrigger")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("snooze")} disabled={busy}>
            {t("snoozeTrigger")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("resolve")} disabled={busy}>
            {t("resolveTrigger")}
          </Button>
        </div>
      ) : null}
      {mode === "ack" ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder={t("rationalePlaceholder")}
            aria-label={t("rationalePlaceholder")}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submitAck()} disabled={busy || !rationale.trim()}>
              {busy ? t("submitting") : t("ackTrigger")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={reset} disabled={busy}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {mode === "snooze" ? (
        <div className="flex flex-col gap-2">
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            aria-label={t("untilLabel")}
            disabled={busy}
            min={snoozeDateBounds().min}
            max={snoozeDateBounds().max}
            className="motion-fast h-8 w-fit rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder={t("rationalePlaceholder")}
            aria-label={t("rationalePlaceholder")}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submitSnooze()} disabled={busy || !rationale.trim() || !until}>
              {busy ? t("submitting") : t("snoozeTrigger")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={reset} disabled={busy}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {mode === "resolve" ? (
        <div className="flex flex-col gap-2">
          <NativeSelect
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value as ComplianceWatchConclusion)}
            aria-label={t("conclusionLabel")}
            disabled={busy}
          >
            <option value="registration_recorded">{t("conclusion.registration_recorded")}</option>
            <option value="not_liable_documented">{t("conclusion.not_liable_documented")}</option>
          </NativeSelect>
          <Textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder={t("evidencePlaceholder")}
            aria-label={t("evidencePlaceholder")}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submitResolve()} disabled={busy || !evidence.trim()}>
              {busy ? t("submitting") : t("resolveTrigger")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={reset} disabled={busy}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
