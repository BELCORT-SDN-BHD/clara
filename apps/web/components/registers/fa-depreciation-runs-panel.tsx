"use client";

// The depreciation runs list + the run-depreciation door — split out of
// depreciation-authority-panel.tsx (file-size discipline).
//
// #651 REWROTE THE DIALOG AND THE TABLE, AND BOTH CHANGES REMOVE SOMETHING.
//
//   THE TWO DATE INPUTS ARE GONE. `clara._fa_run_period_core` refuses any caller-named window that
//   is not the live authority's own cadence (CLR38 `period_request_invalid`, axis
//   `not_cadence_aligned`), so the only lawful value a person could type was the one the database
//   already knew — and typing anything else earned a refusal that read like a bug. The dialog now
//   PREVIEWS: `clara.preview_depreciation_run` names the exact period, the per-asset amounts, the
//   two GL legs, every skipped asset with its reason and whether the run will post or wait. Then
//   Confirm.
//
//   THE TABLE STOPPED HIDING TWO COLUMNS IT WAS ALREADY BEING GIVEN. `clara.list_depreciation_runs`
//   has returned `skipped` and `entry_id` since 0041 and this panel rendered neither, so a run that
//   quietly skipped half the register looked identical to one that charged everything.
//
//   ONE DECISION, ONE KEY. `runDepreciationManual` used to mint a fresh uuid per call, so a lost
//   response answered the retry with a refusal instead of the receipt. The key is now held for the
//   life of the open decision (`useDepreciationDecisionKey`) and renewed when the dialog closes.

import { useCallback, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  listDepreciationRuns, runDepreciationManual, previewDepreciationRun,
  depreciationIntent, useDepreciationDecisionKey, faSkipListStartsOpen,
  type FaRunPreview,
} from "@/lib/registers/depreciation";
import { fmtCents } from "@/lib/registers/money";
import { journalEntryHref } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FaDoorDialog } from "./FaDoorDialog";
import { FaRunPreviewBody, useSkipSentence } from "./fa-run-preview";

export function DepreciationRunsPanel({
  clientId,
  hasLiveAuthority,
  onPosted,
}: {
  clientId: string;
  hasLiveAuthority: boolean;
  /** Fired ONLY after a run the DB accepted (sweep addendum item 1). A manual run
   *  posts real journal entries, so the fixed-asset table's own cost/accumulated/NBV
   *  and the register↔GL tie both move — and both live in SIBLING components with
   *  their own hooks, which this panel's `act()` cannot reach. Rides `act`'s `onOk`
   *  channel (lib/parts/hooks.ts), which fires before the follow-up reload and never
   *  on the catch path, so a refused run refreshes nothing. */
  onPosted?: () => void;
}) {
  const t = useTranslations("FixedAssetsDepreciation.runs");
  const tc = useTranslations("Common");
  const skipSentence = useSkipSentence();
  const { data: runs, loading, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (s) => listDepreciationRuns(s, clientId));

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={3} action={hasLiveAuthority
        ? <RunDialog clientId={clientId} busy={busy} act={act} err={err} clr={clr} onPosted={onPosted} />
        : undefined}>
        {t("heading")}
      </SectionHeader>
      {runs && err ? (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined} className="text-xs">
          {err}
        </StateBanner>
      ) : null}
      {/* N1 (mechanical sweep, 2026-08-28): `loading` gates the empty claim —
          the same shape as fa-account-profiles-panel.tsx's own fix. */}
      {!runs ? (
        err ? <StateBanner tone="error" className="text-xs">{String(err)}</StateBanner> : null
      ) : !loading && runs.length === 0 ? (
        <EmptyState className="text-xs">{t("empty")}</EmptyState>
      ) : (
        <DataTableCard label={t("heading")}>
          <TableHeader>
            <TableRow>
              <TableHead>{t("periodCol")}</TableHead>
              <TableHead>{t("modeCol")}</TableHead>
              <TableHead>{t("chargedCol")}</TableHead>
              <TableHead>{t("entriesCol")}</TableHead>
              <TableHead>{t("entryCol")}</TableHead>
              <TableHead>{t("skippedCol")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => {
              const skipped = (r.skipped ?? []) as { asset_id?: string; reason: string }[];
              return (
                <TableRow key={r.id} data-testid={`fa-run-row-${r.id}`}>
                  <TableCell className="whitespace-normal">{r.period_start} – {r.period_end}</TableCell>
                  <TableCell><Badge variant={r.mode === "post" ? "default" : "outline"}>{t(`mode.${r.mode}`)}</Badge></TableCell>
                  <TableCell>{fmtCents(r.charged_cents, tc("centsUnsafe"))}</TableCell>
                  <TableCell className="text-muted-foreground">{r.entries}</TableCell>
                  <TableCell>
                    {r.entry_id ? (
                      <Link
                        href={journalEntryHref(clientId, r.entry_id)}
                        title={r.entry_id}
                        className="font-mono break-all underline-offset-4 hover:underline"
                      >
                        {r.entry_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {skipped.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      // Appendix D row 17: a list carrying work somebody still owes renders OPEN.
                      <Collapsible
                        defaultOpen={faSkipListStartsOpen(skipped)}
                        data-testid={`fa-run-skipped-${r.id}`}
                        data-starts-open={faSkipListStartsOpen(skipped) ? "true" : "false"}
                      >
                        <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
                          {t("skippedCount", { count: skipped.length })}
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <ul className="flex flex-col gap-0.5 pt-1 text-xs text-muted-foreground">
                            {skipped.map((s, i) => (
                              <li key={`${s.asset_id ?? i}`}>{skipSentence(s.reason)}</li>
                            ))}
                          </ul>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </DataTableCard>
      )}
    </div>
  );
}

function RunDialog({
  clientId,
  busy,
  act,
  err,
  clr,
  onPosted,
}: {
  clientId: string;
  busy: boolean;
  /** `useHydratedPart`'s own `act`, INCLUDING its `onOk` parameter — the previous
   *  one-argument prop type erased the channel this fix needs. */
  act: (fn: () => Promise<void>, onOk?: () => void) => Promise<boolean>;
  /** THE REFUSAL HAS TO TRAVEL IN HERE WITH THE HUMAN. `act()` stores a refused run on the
   *  hydrated part, and the panel renders it — BEHIND this modal's backdrop, where the person who
   *  pressed Confirm cannot read it. MEASURED as exactly that: the closed-period walk leg found a
   *  dialog that correctly stayed open and carried no refusal at all. `FaDoorDialog`'s `refusal`
   *  prop is CB-AE2E-004's own mechanism for this; the run dialog simply was not using it. */
  err: string | null;
  clr: { code: string; reason: string | null } | null;
  onPosted?: () => void;
}) {
  const t = useTranslations("FixedAssetsDepreciation.runs");
  const [preview, setPreview] = useState<FaRunPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const decision = useDepreciationDecisionKey();

  // THE PREVIEW IS READ WHEN THE DIALOG OPENS, never on a timer and never eagerly for every client
  // on the page: it is a per-client arithmetic pass, and a panel that ran it unasked would ask the
  // database to compute a schedule nobody is looking at.
  const load = useCallback(async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      setPreview(await previewDepreciationRun(sessionTokenAccessor, clientId));
    } catch (e) {
      // VERBATIM, with its code where the door gave one — never re-worded.
      const code = (e as { code?: string } | null)?.code;
      setPreview(null);
      setPreviewError(`${code ? `${code} · ` : ""}${(e as Error)?.message ?? String(e)}`);
    } finally {
      setPreviewing(false);
    }
  }, [clientId]);

  const canConfirm = preview !== null && preview.due === true && preview.charges.length > 0;

  return (
    <FaDoorDialog
      triggerLabel={t("runTrigger")}
      title={t("runTitle")}
      description={t("runDescription")}
      confirmLabel={t("runConfirm")}
      busy={busy || previewing}
      confirmDisabled={!canConfirm}
      refusal={err === null ? undefined : { err, clr }}
      onOpen={load}
      onClosed={() => {
        // A CLOSED DIALOG ENDS THE DECISION. The next press is a new one and mints a new key —
        // otherwise a run that was withdrawn and is being made again would be answered with the
        // receipt of the run that was withdrawn.
        decision.renew();
        setPreview(null);
        setPreviewError(null);
      }}
      onConfirm={() => {
        if (preview === null || !preview.period_start || !preview.period_end) return Promise.resolve(false);
        const periodStart = preview.period_start;
        const periodEnd = preview.period_end;
        const opKey = decision.key(depreciationIntent({ clientId, periodStart, periodEnd }));
        return act(async () => {
          await runDepreciationManual(sessionTokenAccessor, { clientId, periodStart, periodEnd, opKey });
        }, onPosted);
      }}
    >
      <FaRunPreviewBody preview={preview} loading={previewing} error={previewError} />
    </FaDoorDialog>
  );
}
