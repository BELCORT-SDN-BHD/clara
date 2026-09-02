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

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
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
    // N13 (the needs-you house rule this train's own registry entry follows):
    // clear only on success — a refusal must not discard what the human typed.
    if (ok) reset();
  };
  const submitSnooze = async () => {
    const r = rationale.trim();
    if (!r || !until) return;
    const untilIso = `${until}T00:00:00Z`;
    const ok = await act(() => snoozeComplianceWatch(sessionTokenAccessor, watchId, untilIso, r).then(() => undefined));
    if (ok) reset();
  };
  const submitResolve = async () => {
    const e = evidence.trim();
    if (!e) return;
    const ok = await act(() => resolveComplianceWatch(sessionTokenAccessor, watchId, conclusion, e).then(() => undefined));
    if (ok) reset();
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
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
