"use client";

// #1050 — THE FIRM'S STANDING INSTRUCTION TO CLARA, GIVEN AND TAKEN BACK ON THIS PAGE.
//
// WHY THIS CARD EXISTS AT ALL. Migration 0338 re-opened the clocked `close_prep` lane: an
// unattended run may now establish a client's prepayment schedule, but only while a NAMED MEMBER
// of the firm has recorded a firm-level standing instruction, and every plan it writes is
// authorised by THAT member, admitted under their own membership and rank. Without a surface the
// whole feature is unreachable — the refusal a firm would actually meet names two SQL functions as
// its remedy, which is not something a person can act on — and the standing owner ruling of
// 2026-09-20 is that a beta feature is usable and testable, never dark.
//
// IT IS FIRM GOVERNANCE, SO IT SITS ON /settings/firm, beside legal standing and the processing
// caps, and not on the prepayment register. Standing an act for EVERY client of the firm, until
// somebody withdraws it, is the same kind of decision as accepting the firm's terms; configuring
// ONE client's schedule is bookkeeper work and already has its own door.
//
// THE CONTROL IS AN AFFORDANCE, NOT THE WALL. `clara.record_firm_standing_instruction` and
// `clara.withdraw_firm_standing_instruction` each re-derive the admin floor for themselves
// (`clara._human_ctx(clara.role_rank('admin'))`), so a member who reaches the door another way
// meets its CLR04 rather than a hidden button. This card renders the doors when it has writers
// wired and renders their refusals verbatim.
//
// THE RECEIPT IS A REPORT, NOT THE TRUTH (`lib/doors.ts`'s hydrate-never-trust rule). Each door
// answers with an instruction id; the sentence above it comes from the parent's RE-READ of the
// live row, never from the receipt.
//
// A WITHDRAWAL OWES ITS OWN SENTENCE, and so does a recording — the database refuses a blank one
// by name (`firm_standing_instruction_invalid`, axis `reason_missing` / `withdraw_reason_missing`).
// The field is not validated away here: the refusal the person is shown is the database's.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  FirmStandingInstruction,
  StandingInstructionOutcome,
} from "@/lib/firm/standing-instructions";
import type { FirmSettingsView } from "./firm-settings-view";

/** The card hands over the firm's own sentence and nothing else. THE OP KEY IS THE PARENT'S to
 *  mint, fresh per submission (`ProcessingCapacityCard`'s own division of labour): a key this
 *  presentational component derived would have to be derived from something, and everything it
 *  holds — the instruction, the sentence — repeats. */
export type StandingInstructionWriter =
  (reason: string) => Promise<StandingInstructionOutcome>;

const REASON_FIELD = "firm-standing-instruction-reason";

export function StandingInstructionsCard({
  view,
  record,
  withdraw,
  onRetry,
}: {
  /** `null` inside a ready view is the legitimate state "this firm has instructed nothing". */
  readonly view: FirmSettingsView<FirmStandingInstruction | null>;
  readonly record?: StandingInstructionWriter;
  readonly withdraw?: StandingInstructionWriter;
  readonly onRetry?: () => void;
}) {
  const t = useTranslations("FirmSettings");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<StandingInstructionOutcome | null>(null);

  const live = view.status === "ready" ? view.data : null;
  const standing = live !== null;

  async function submit(writer: StandingInstructionWriter | undefined): Promise<void> {
    if (writer === undefined || busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const answer = await writer(reason);
      setOutcome(answer);
      // THE FIELD IS CLEARED ONLY BY AN ACCEPTED ACT. After a refusal the person's own sentence
      // stays where they typed it — the refusal tells them what to change, and taking the words
      // away would take away the thing they have to edit.
      if (answer.kind === "recorded" || answer.kind === "withdrawn") setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("standingHeading")}</SectionHeader>
        <CardDescription className="text-xs">{t("standingSubheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view.status === "loading" ? <Skeleton className="h-20 w-full" /> : null}
        {view.status === "denied" ? (
          <StateBanner tone="warning" title={t("standingDeniedTitle")}>{view.message}</StateBanner>
        ) : null}
        {view.status === "failed" ? (
          <StateBanner tone="error" title={t("readFailed")}>
            {view.message}
            {onRetry ? (
              <div className="mt-2">
                <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t("retry")}</Button>
              </div>
            ) : null}
          </StateBanner>
        ) : null}

        {view.status === "ready" ? (
          <>
            {standing ? (
              <div className="flex flex-col gap-1 text-sm">
                <p className="max-w-prose font-medium">{t("standingInForce")}</p>
                {/* THE FIRM'S OWN SENTENCE, shown as it was recorded. The row is the record of
                    record, and this is the basis every plan written under it cites. */}
                <p className="max-w-prose text-muted-foreground">
                  {t("standingReasonGiven", { reason: live.reason })}
                </p>
              </div>
            ) : (
              <p className="max-w-prose text-sm text-muted-foreground">{t("standingAbsent")}</p>
            )}

            {outcome?.kind === "recorded" ? (
              <StateBanner tone="info">{t("standingRecorded")}</StateBanner>
            ) : null}
            {outcome?.kind === "withdrawn" ? (
              <StateBanner tone="info">{t("standingWithdrawn")}</StateBanner>
            ) : null}
            {outcome?.kind === "refused" ? (
              <StateBanner
                tone="warning"
                title={t("standingRefusedTitle")}
                code={outcome.reason ? `${outcome.code} · ${outcome.reason}` : outcome.code}
              >
                {/* VERBATIM — never re-worded. */}
                {outcome.message}
              </StateBanner>
            ) : null}
            {outcome?.kind === "unavailable" ? (
              <StateBanner tone="error">{t("standingUnavailable")}</StateBanner>
            ) : null}

            {record !== undefined || withdraw !== undefined ? (
              <div className="flex flex-col gap-3 border-t pt-3">
                <div className="grid gap-1.5">
                  <Label htmlFor={REASON_FIELD}>
                    {standing ? t("standingWithdrawReasonLabel") : t("standingReasonLabel")}
                  </Label>
                  <Input
                    id={REASON_FIELD}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    aria-describedby="firm-standing-instruction-hint"
                  />
                </div>
                <p id="firm-standing-instruction-hint" className="max-w-prose text-xs text-muted-foreground">
                  {standing ? t("standingWithdrawHint") : t("standingReasonHint")}
                </p>
                <div>
                  {standing ? (
                    <Button type="button" size="sm" variant="outline" disabled={busy || withdraw === undefined}
                      onClick={() => { void submit(withdraw); }}>
                      {busy ? t("standingBusy") : t("standingWithdrawAction")}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" disabled={busy || record === undefined}
                      onClick={() => { void submit(record); }}>
                      {busy ? t("standingBusy") : t("standingRecordAction")}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            <p className="max-w-prose text-xs text-muted-foreground">{t("standingScopeNote")}</p>
            <p className="max-w-prose text-xs text-muted-foreground">{t("standingWithdrawalNote")}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
