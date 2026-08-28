"use client";

// T1 — the fiscal-year opener (port-wave-plan §4 T1; census: "nothing in the
// entire product can open a fiscal year today" — this is the first-ever
// trigger for `open_fiscal_year`, port-wave-plan §9.3). Two governed doors
// share ONE hydrated read (the client's own fy_end_month/day, OQ-7's
// precondition) so both act()s reload it and both share ONE persistent
// refusal banner — the same composition ClosePlanPanel/CloseDoors already use
// for a small cluster of related writes.
//
// `propose_fiscal_year` is a STABLE preview RPC — labelled a read at this
// call site (lib/close/api.ts's own header convention: "a read-flavoured RPC
// still rides callDoor as transport but is NOT a governed act"), so it is NOT
// wrapped in `act()` and does not touch the shared refusal banner; it manages
// its own small local state, the same shape CloseReceiptPanel's `runVerify`
// already uses for `verify_close`.

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydratedPart, type PartClr } from "@/lib/parts/hooks";
import {
  getClientFyEnd,
  isDoorRefusal,
  openFiscalYear,
  proposeFiscalYear,
  setClientFyEnd,
} from "@/lib/close/api";
import type { FiscalYearProposal } from "@/lib/close/types";
import type { SessionTokenAccessor } from "@/lib/session";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { CloseDoorDialog } from "./CloseDoorDialog";

/** open_fiscal_year's CLR10 `fy_length_reason_required` refusal, verbatim
 *  (`_open_fiscal_year_core`) — the M7 house pattern (CloseDoors.tsx's own
 *  header): the length-reason field renders ONLY once a refusal has actually
 *  named it, never unconditionally pre-offered. Exported + pure, same reason
 *  CloseDoors exports its own M7/F3 predicates: testable without a dialog. */
export function openFiscalYearNeedsLengthReason(refusal: PartClr): boolean {
  return refusal?.code === "CLR10" && refusal.reason === "fy_length_reason_required";
}

export function FiscalYearOpener({
  clientId,
  session,
  onOpened,
}: {
  clientId: string;
  session: SessionTokenAccessor;
  /** ClosePage's own fiscal-year list reload — called after every write this
   *  component performs, success or refusal (the same "always, regardless of
   *  outcome" discipline ClosePlanPanel's `actAndReloadYears` uses). */
  onOpened: () => Promise<void>;
}) {
  const fyEnd = useHydratedPart(session, (s) => getClientFyEnd(clientId, { session: s }));
  const actAndReload = (fn: () => Promise<void>): Promise<void> => fyEnd.act(fn).then(() => onOpened());

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <FyEndBadge row={fyEnd.data} loading={fyEnd.loading} err={fyEnd.err} />
        <SetFyEndDialog
          busy={fyEnd.busy}
          onConfirm={(month, day) =>
            actAndReload(async () => {
              await setClientFyEnd(clientId, month, day, { session });
            })
          }
        />
        <OpenFiscalYearDialog
          clientId={clientId}
          session={session}
          busy={fyEnd.busy}
          refusal={fyEnd.clr}
          onConfirm={(args) =>
            actAndReload(async () => {
              await openFiscalYear({ clientId, ...args }, { session });
            })
          }
        />
      </div>
      {fyEnd.err ? (
        <StateBanner tone="error" code={fyEnd.clr ? `${fyEnd.clr.code}${fyEnd.clr.reason ? ` · ${fyEnd.clr.reason}` : ""}` : undefined}>
          {fyEnd.err}
        </StateBanner>
      ) : null}
    </div>
  );
}

function FyEndBadge({ row, loading, err }: { row: { fy_end_month: number | null; fy_end_day: number | null } | null; loading: boolean; err: string | null }) {
  const t = useTranslations("ClientClose.opener");
  if (err) return null; // the shared banner below already shows this read's own failure
  if (loading && !row) return <LoadingState>{t("fyEndLoading")}</LoadingState>;
  if (!row || row.fy_end_month === null || row.fy_end_day === null) {
    return <Badge variant="outline">{t("fyEndUnset")}</Badge>;
  }
  return (
    <Badge variant="secondary">
      {t("fyEndSet", { month: String(row.fy_end_month).padStart(2, "0"), day: String(row.fy_end_day).padStart(2, "0") })}
    </Badge>
  );
}

function SetFyEndDialog({ busy, onConfirm }: { busy: boolean; onConfirm: (month: number, day: number) => Promise<void> }) {
  const t = useTranslations("ClientClose.opener.setFyEnd");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const m = Number(month);
  const d = Number(day);
  const valid = Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= 31;
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!valid}
      onConfirm={() => onConfirm(m, d)}
    >
      <div className="flex gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fy-end-month">{t("monthLabel")}</Label>
          <Input id="fy-end-month" type="number" min="1" max="12" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fy-end-day">{t("dayLabel")}</Label>
          <Input id="fy-end-day" type="number" min="1" max="31" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
      </div>
    </CloseDoorDialog>
  );
}

type ProposeState = { loading: boolean; result: FiscalYearProposal | null; err: string | null };

function OpenFiscalYearDialog({
  clientId,
  session,
  busy,
  refusal,
  onConfirm,
}: {
  clientId: string;
  session: SessionTokenAccessor;
  busy: boolean;
  refusal: PartClr;
  onConfirm: (args: { label: string; startsOn: string; endsOn: string; lengthReason: string | null }) => Promise<void>;
}) {
  const t = useTranslations("ClientClose.opener.open");
  const [label, setLabel] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [endsOnTouched, setEndsOnTouched] = useState(false);
  const [lengthReason, setLengthReason] = useState("");
  const [propose, setPropose] = useState<ProposeState>({ loading: false, result: null, err: null });
  const epochRef = useRef(0);
  const needsLengthReason = openFiscalYearNeedsLengthReason(refusal);

  async function previewEndsOn(value: string) {
    setStartsOn(value);
    if (!value) return;
    const epoch = ++epochRef.current;
    setPropose({ loading: true, result: null, err: null });
    try {
      const result = await proposeFiscalYear(clientId, value, { session });
      if (epoch !== epochRef.current) return; // superseded by a later blur
      setPropose({ loading: false, result, err: null });
      if (!endsOnTouched) setEndsOn(result.ends_on);
    } catch (e) {
      if (epoch !== epochRef.current) return;
      setPropose({ loading: false, result: null, err: isDoorRefusal(e) ? e.message : e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={label.trim().length === 0 || !startsOn || !endsOn || (needsLengthReason && lengthReason.trim().length === 0)}
      onConfirm={() => onConfirm({ label, startsOn, endsOn, lengthReason: lengthReason.trim() || null })}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fy-open-label">{t("labelLabel")}</Label>
          <Input id="fy-open-label" placeholder={t("labelPlaceholder")} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fy-open-starts">{t("startsOnLabel")}</Label>
            <Input id="fy-open-starts" type="date" value={startsOn} onChange={(e) => void previewEndsOn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fy-open-ends">{t("endsOnLabel")}</Label>
            <Input
              id="fy-open-ends"
              type="date"
              value={endsOn}
              onChange={(e) => {
                setEndsOnTouched(true);
                setEndsOn(e.target.value);
              }}
            />
          </div>
        </div>
        {propose.loading ? <LoadingState>{t("previewLoading")}</LoadingState> : null}
        {propose.result ? (
          <EmptyState>
            {propose.result.fy_end.fallback ? t("previewFallback", { endsOn: propose.result.ends_on }) : t("previewAsserted", { endsOn: propose.result.ends_on })}
          </EmptyState>
        ) : null}
        {propose.err ? <StateBanner tone="error">{propose.err}</StateBanner> : null}
        {needsLengthReason ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fy-open-length-reason">{t("lengthReasonLabel")}</Label>
            <Input id="fy-open-length-reason" value={lengthReason} onChange={(e) => setLengthReason(e.target.value)} />
          </div>
        ) : null}
      </div>
    </CloseDoorDialog>
  );
}
