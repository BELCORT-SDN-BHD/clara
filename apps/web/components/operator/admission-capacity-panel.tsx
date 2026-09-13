"use client";

// ADMISSION CAPACITY (#615 scope Q1: IN) — `clara.get_admission_capacity` /
// `clara.set_admission_capacity` (0186 §C), behind the SAME owner+operator-firm wall the support
// reads carry, on the destination that already carries that authority.
//
// THIS IS `get_admission_capacity`'s FIRST WEB LANE, and the reason it is in scope while
// `clara.set_wake_source_enabled` (0133) is not: capacity is part of ADMISSION — it is the reason
// a checkout refuses `capacity_reached`, which is a sentence an applicant sees and an operator has
// to be able to explain and change. Estate wake-source control is operator scope by PRD §7 but is
// not admission support, so it stays where it is and #615 does not move it.
//
// `firms_count` IS BUSINESS-CONFIDENTIAL (0186 §C's own review S4), which is why this panel — and
// no applicant-facing surface — is allowed to read it. `lib/registration/checkout-doors.test.ts`
// still holds that property over the applicant lanes; #615 narrows its scan to those lanes rather
// than deleting it.
//
// NULL MEANS UNLIMITED, and it travels as null: an empty field is unlimited, not zero. Zero is a
// real, different value (the estate admits nobody), and conflating the two on the way to a money
// wall would be this build inventing a policy.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, StateBanner } from "@/components/common/state";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getAdmissionCapacity, setAdmissionCapacity, type AdmissionCapacity } from "@/lib/operator/doors";
import { classifySupportFailure } from "@/lib/operator/reads";

/** The op key binds the VALUE and the reason, so a lost response replays the original receipt and
 *  a genuinely different change mints its own key — `clara._reserve_op` re-hashes
 *  `{max_firms, reason, actor}` (0186 §C), so a key that ignored either would meet
 *  `op_key_conflict` instead of replaying. */
export function capacityOpKey(callerId: string, maxFirms: number | null, reason: string): string {
  return `op-capacity-${callerId}-${maxFirms === null ? "unlimited" : maxFirms}-${reason.length}`;
}

export function AdmissionCapacityPanel({ callerId }: { callerId: string }) {
  const t = useTranslations("Operator");
  const [state, setState] = useState<AdmissionCapacity | null>(null);
  const [readError, setReadError] = useState<unknown>(null);
  const [actError, setActError] = useState<unknown>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState("");
  const [reason, setReason] = useState("");
  const guardRef = useRef(createSingleFireGuard());

  async function reload(): Promise<void> {
    try {
      const answer = await getAdmissionCapacity(sessionTokenAccessor);
      setState(answer);
      setReadError(null);
      setLimit(answer.max_firms === null ? "" : String(answer.max_firms));
    } catch (e: unknown) {
      setReadError(e);
    }
  }

  useEffect(() => {
    void reload();
    // Mount-only: the capacity is re-read after every write below, and a background poll of a
    // policy number nobody else is editing would be noise.
  }, []);

  const trimmedReason = reason.trim();
  const parsed = limit.trim() === "" ? null : Number.parseInt(limit.trim(), 10);
  const limitValid = parsed === null || (Number.isInteger(parsed) && parsed >= 0);

  async function save(): Promise<void> {
    setActError(null);
    setReceipt(null);
    await runOnce(guardRef.current, async () => {
      setBusy(true);
      try {
        const out = await setAdmissionCapacity(
          sessionTokenAccessor, parsed, trimmedReason,
          capacityOpKey(callerId, parsed, trimmedReason));
        setReceipt(t("capacityReceipt", {
          limit: out.max_firms === null ? t("capacityUnlimited") : String(out.max_firms),
          count: out.firms_count,
        }));
      } catch (e: unknown) {
        setActError(e);
      } finally {
        setBusy(false);
        // Hydrate-never-trust: the write's own answer is a report. Re-read either way.
        await reload();
      }
    });
  }

  const failure = actError === null ? null : classifySupportFailure(actError);

  return (
    <Card data-operator-region="capacity">
      <CardContent className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-card-foreground">{t("capacityHeading")}</h2>

        {readError ? (
          <StateBanner tone="warning" code={classifySupportFailure(readError).code ?? undefined}>
            {t("capacityUnavailable")}
          </StateBanner>
        ) : null}

        {receipt ? <StateBanner tone="info">{receipt}</StateBanner> : null}

        {failure ? (
          <div data-operator-region={`failure-${failure.kind}`}>
            <StateBanner
              tone={failure.kind === "denied" || failure.kind === "stale" ? "warning" : "error"}
              title={t(`failureTitle.${failure.kind}`)}
              code={failure.code ? (failure.reason ? `${failure.code} · ${failure.reason}` : failure.code) : undefined}
            >
              {t(`failureBody.${failure.kind}`)}
            </StateBanner>
          </div>
        ) : null}

        {!state && !readError ? <LoadingState>{t("capacityLoading")}</LoadingState> : null}

        {state ? (
          <p className="text-sm text-muted-foreground">
            {t("capacityCurrent", {
              limit: state.max_firms === null ? t("capacityUnlimited") : String(state.max_firms),
              count: state.firms_count,
              full: state.full ? t("capacityFull") : t("capacityOpen"),
            })}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="operator-capacity-limit">{t("capacityLimitLabel")}</Label>
            <Input
              id="operator-capacity-limit"
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder={t("capacityUnlimited")}
              aria-describedby="operator-capacity-hint"
            />
            <p id="operator-capacity-hint" className="text-xs text-muted-foreground">
              {limitValid ? t("capacityLimitHint") : t("capacityLimitInvalid")}
            </p>
          </div>
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="operator-capacity-reason">{t("capacityReasonLabel")}</Label>
            <Input
              id="operator-capacity-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("capacityReasonPlaceholder")}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={busy || !limitValid || trimmedReason.length === 0}
            onClick={() => void save()}
          >
            {busy ? t("working") : t("capacitySave")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
