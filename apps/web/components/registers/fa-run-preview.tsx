"use client";

// #651 — PREVIEW FIRST, THEN CONFIRM.
//
// The run dialog used to be two raw `<Label>` + `<Input type="date">` controls and a button, and
// the two dates were a trap: `clara._fa_run_period_core` refuses ANY caller-named window that is
// not the live authority's own cadence (CLR38 `period_request_invalid`, axis
// `not_cadence_aligned`), so the only lawful thing a person could type was the value the database
// already knew. THE DATES ARE GONE. What replaces them is this: the exact period the database
// chose, the per-asset amounts, the two GL legs, every asset it will skip WITH ITS REASON IN
// WORDS, and whether the run will post or wait for approval — read from
// `clara.preview_depreciation_run`, which is `stable` in the database and therefore cannot write.
//
// EVERY SKIP REASON IS NAMED, AND AN UNKNOWN ONE IS NOT DROPPED. Five reasons were MEASURED off
// the live catalog; a sixth would be a vocabulary that grew after the measurement, and a surface
// that silently dropped its row would be telling a professional that an asset was charged when it
// was not. An unmapped reason renders as its VERBATIM code beside a neutral sentence.
//
// THE SKIPPED LIST MAY COLLAPSE ONLY WHEN EVERY REASON IS BENIGN (appendix D row 17: "never hide
// unresolved questions or errors by default"). `incomplete` and `disposal_draft_outstanding` are
// work somebody still owes, so a list containing either renders OPEN.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StateBanner } from "@/components/common/state";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCents } from "@/lib/registers/money";
import { faSkipListStartsOpen, type FaRunPreview } from "@/lib/registers/depreciation";

/** A skip reason in words, or — for a reason this surface does not know — the code itself beside a
 *  neutral sentence. Never dropped, never guessed. */
export function useSkipSentence() {
  const t = useTranslations("FixedAssetsDepreciation.preview");
  const known = new Set(["incomplete", "not_in_service", "fully_depreciated", "none_method", "disposal_draft_outstanding"]);
  return (reason: string) => (known.has(reason) ? t(`skip.${reason}`) : t("skip.unknown", { reason }));
}

/** #975 — what the caller does with a judgement this body collects. The BODY never calls a door:
 *  the panel that owns the session and the decision key does, exactly as it does for the run
 *  itself. Absent (the default) the two controls are not rendered at all and the block is a
 *  statement rather than a question. */
export type RecordArrearsHandler = (args: {
  fiscalYearId: string;
  choice: "fold_current" | "reopen_prior";
  arrearsCents: number;
  reason: string;
}) => Promise<unknown>;

export function FaRunPreviewBody({
  preview,
  loading,
  error,
  onRecordArrears,
}: {
  preview: FaRunPreview | null;
  loading: boolean;
  /** A refusal from the preview read itself, rendered VERBATIM above whatever already loaded. */
  error?: string | null;
  onRecordArrears?: RecordArrearsHandler;
}) {
  const t = useTranslations("FixedAssetsDepreciation.preview");
  const tc = useTranslations("Common");
  const skipSentence = useSkipSentence();

  // LOADING STOPS IMMEDIATELY ON SUCCESS, EMPTY, DENIED OR ERROR (appendix D row 53). The skeleton
  // is shape-matched to the three blocks below it, never a generic bar.
  if (loading && preview === null) {
    return (
      <div className="flex flex-col gap-3" data-testid="fa-preview-loading">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (error) {
    // DENIED AND FAILED ARE NOT EMPTY DATA (appendix D row 27) — the refusal renders with its own
    // tone, VERBATIM, and never as "nothing to run".
    return (
      <div data-testid="fa-preview-error">
        <StateBanner tone="error" className="text-xs">{error}</StateBanner>
      </div>
    );
  }

  if (preview === null) return <EmptyState className="text-xs">{t("unavailable")}</EmptyState>;

  if (!preview.due) {
    // THE DATABASE'S OWN REASON, in words where this surface knows the word and VERBATIM where it
    // does not. The five reasons the oracle can answer with were read off its body; a sixth is a
    // vocabulary that grew, and printing its code is more honest than printing nothing.
    const reason = preview.reason ?? "";
    const known = ["period_not_ended", "nothing_due", "authority_not_live", "period_draft_outstanding", "period_correction_unsound", "period_unreachable"];
    return (
      <div className="flex flex-col gap-2" data-testid="fa-preview-not-due">
        <EmptyState className="text-xs">
          {known.includes(reason) ? t(`notDue.${reason}`) : t("notDue.generic", { reason: reason || "—" })}
        </EmptyState>
        <FloorNote preview={preview} />
        <SkippedClosed preview={preview} onRecordArrears={onRecordArrears} />
      </div>
    );
  }

  const skipped = preview.skipped ?? [];
  const startsOpen = faSkipListStartsOpen(skipped);

  return (
    <div className="flex flex-col gap-3" data-testid="fa-preview">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium" data-testid="fa-preview-period">
          {preview.period_start} – {preview.period_end}
        </span>
        {preview.cadence ? <Badge variant="secondary">{t(`cadence.${preview.cadence}`)}</Badge> : null}
        <Badge variant={preview.mode_would_be === "post" ? "default" : "outline"} data-testid="fa-preview-mode">
          {preview.mode_would_be === "post" ? t("wouldPost") : t("wouldDraft")}
        </Badge>
      </div>
      {/* THE PERIOD IS THE DATABASE'S, SAID OUT LOUD — this is why the two date inputs are gone. */}
      <p className="text-xs text-muted-foreground">{t("periodIsTheDatabases")}</p>
      <FloorNote preview={preview} />

      <DataTableCard label={t("chargesCaption")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("assetCol")}</TableHead>
            <TableHead>{t("periodCol")}</TableHead>
            <TableHead>{t("amountCol")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.charges.map((c) => (
            <TableRow key={`${c.asset_id}-${c.period_start}-${c.period_end}`}>
              <TableCell className="whitespace-normal">{c.description ?? c.asset_id.slice(0, 8)}</TableCell>
              <TableCell className="whitespace-normal text-muted-foreground">{c.period_start} – {c.period_end}</TableCell>
              <TableCell>{fmtCents(c.amount_cents, tc("centsUnsafe"))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTableCard>

      <DataTableCard label={t("legsCaption")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("accountCol")}</TableHead>
            <TableHead>{t("debitCol")}</TableHead>
            <TableHead>{t("creditCol")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.legs.map((l, i) => (
            <TableRow key={`${l.account_code}-${i}`}>
              <TableCell className="font-mono">{l.account_code}</TableCell>
              <TableCell>{l.debit_cents ? fmtCents(l.debit_cents, tc("centsUnsafe")) : "—"}</TableCell>
              <TableCell>{l.credit_cents ? fmtCents(l.credit_cents, tc("centsUnsafe")) : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </DataTableCard>

      <p className="text-sm" data-testid="fa-preview-total">
        {t("total", { amount: fmtCents(preview.charged_cents, tc("centsUnsafe")), entries: preview.entries })}
      </p>

      {skipped.length > 0 ? (
        <Collapsible defaultOpen={startsOpen} data-testid="fa-preview-skipped" data-starts-open={startsOpen ? "true" : "false"}>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            {t("skippedHeading", { count: skipped.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="flex flex-col gap-1 pt-1 text-xs text-muted-foreground">
              {skipped.map((s) => (
                <li key={s.asset_id} data-testid={`fa-preview-skip-${s.reason}`}>
                  <span className="font-mono">{s.asset_id.slice(0, 8)}</span> — {skipSentence(s.reason)}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <SkippedClosed preview={preview} onRecordArrears={onRecordArrears} />
    </div>
  );
}

/** The authority window's floor, said in words whenever the database reported one. A person
 *  looking at "nothing is due" on a client with two years of uncharged assets needs to know WHY
 *  and WHERE that work can still be done. */
function FloorNote({ preview }: { preview: FaRunPreview }) {
  const t = useTranslations("FixedAssetsDepreciation.preview");
  if (!preview.authority_from) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="fa-preview-floor">
      {t("floor", { from: preview.authority_from })}
    </p>
  );
}

/** #975 — THE TWO RESOLUTIONS, AS TWO CONTROLS, NEITHER PRESELECTED. The run now refuses until
 *  somebody judges the closed year's arrears, so a surface that only STATED the question would
 *  have made depreciation unrunnable for that client — a wall, not a prompt, which is exactly what
 *  the standing "nothing dark" ruling forbids. Under IAS 8 folding is lawful only where the
 *  omission is immaterial, so the wording of each control is the JUDGEMENT it records, never the
 *  mechanical effect: a person is being asked about materiality, not about plumbing.
 *
 *  The optional note rides with the judgement. It is not required by the door, and this surface
 *  does not require it either — a judgement nobody could file because they had not yet typed a
 *  sentence would be the same wall in a smaller shape. */
function ArrearsChoice({
  year,
  onRecordArrears,
}: {
  year: NonNullable<FaRunPreview["closed_arrears"]>["fiscal_years"][number];
  onRecordArrears: RecordArrearsHandler;
}) {
  const t = useTranslations("FixedAssetsDepreciation.preview");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const record = (choice: "fold_current" | "reopen_prior") => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRecordArrears({
        fiscalYearId: year.fiscal_year_id,
        choice,
        // THE AMOUNT THAT WAS SHOWN, carried through unchanged. The door re-measures it and
        // refuses if it moved, so a judgement can never be filed against a figure nobody saw.
        arrearsCents: year.arrears_cents,
        reason: note.trim(),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-1 flex flex-col gap-1">
      <label className="sr-only" htmlFor={`fa-arrears-note-${year.fiscal_year_id}`}>
        {t("arrearsNoteLabel")}
      </label>
      <Input
        id={`fa-arrears-note-${year.fiscal_year_id}`}
        data-testid={`fa-arrears-note-${year.fiscal_year_id}`}
        value={note}
        disabled={busy}
        placeholder={t("arrearsNotePlaceholder")}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          data-testid={`fa-arrears-fold-${year.fiscal_year_id}`}
          onClick={record("fold_current")}
        >
          {t("arrearsFoldAction")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          data-testid={`fa-arrears-restate-${year.fiscal_year_id}`}
          onClick={record("reopen_prior")}
        >
          {t("arrearsRestateAction")}
        </Button>
      </div>
    </div>
  );
}

/** Periods the due oracle skipped because their financial year is closed, and — since #975 (0279)
 *  — the arrears those months carry and whether anybody has judged them yet. A skip nobody can see
 *  is the same defect as a silent post; an amount nobody states is the same defect as a silent
 *  ruling, because under IAS 8 the fold is only lawful where the omission is IMMATERIAL and that
 *  is the accountant's judgement, never this product's. */
function SkippedClosed({
  preview, onRecordArrears,
}: { preview: FaRunPreview; onRecordArrears?: RecordArrearsHandler }) {
  const t = useTranslations("FixedAssetsDepreciation.preview");
  const closed = preview.skipped_closed ?? [];
  const arrears = preview.closed_arrears;
  const years = arrears?.fiscal_years ?? [];
  if (closed.length === 0 && years.length === 0) return null;
  return (
    <div data-testid="fa-preview-skipped-closed">
      <StateBanner tone="warning" className="text-xs">
        {closed.length > 0 ? (
          <>
            <span>{t("skippedClosedHeading", { count: closed.length })}</span>
            <ul className="mt-1 flex flex-col gap-0.5">
              {closed.map((c) => (
                <li key={`${c.period_start}-${c.period_end}`}>
                  {c.period_start} – {c.period_end}
                  {c.fy_label ? ` (${c.fy_label})` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {years.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-1.5" data-testid="fa-preview-closed-arrears">
            {years.map((y) => (
              <li key={y.fiscal_year_id}>
                {t("arrearsAmount", {
                  amount: fmtCents(y.arrears_cents),
                  year: y.fy_label ?? `${y.fy_starts_on} – ${y.fy_ends_on}`,
                })}{" "}
                {y.resolution === null
                  ? t("arrearsUnanswered")
                  : t(y.resolution.choice === "fold_current" ? "arrearsFolded" : "arrearsRestated")}
                {y.resolution === null && onRecordArrears ? (
                  <ArrearsChoice year={y} onRecordArrears={onRecordArrears} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1">{t("skippedClosedNote")}</p>
      </StateBanner>
    </div>
  );
}
