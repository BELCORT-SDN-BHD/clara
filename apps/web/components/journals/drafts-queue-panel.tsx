"use client";

// The drafts list + the review queue's approve/revise doors (mission SCOPE a+b —
// one section: the queue row IS the draft, its expanded detail IS the review
// surface). Rows come from lib/journals/api.ts's `listReviewQueue` (the DB's own
// pending-review union, filtered to row_kind==='draft'); a row's full lines,
// memo and revision_token come from the direct table reads (journal_entries/
// journal_lines) the same combined loader already fetched — hydrate-never-trust
// means BOTH reads land together on every mount and after every action.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, StateBanner } from "@/components/common/state";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { Money } from "@/components/journals/money";
import { EntryStatusBadge, QueueSectionBadge } from "@/components/journals/entry-status-badge";
import { EntryLinesEditor } from "@/components/journals/entry-lines-editor";
import { EntryDiffPanel } from "@/components/journals/entry-diff-panel";
import { JournalsDoorDialog } from "@/components/journals/JournalsDoorDialog";
import { sumLines } from "@/lib/journals/balance";
import type {
  CoaAccountRow,
  EntryLineInput,
  JournalEntryRow,
  JournalLineRow,
  ReviewQueueCounts,
  ReviewQueueRow,
} from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

export function DraftsQueuePanel({
  clientId,
  queueRows,
  queueCounts,
  entries,
  lines,
  linesTruncated,
  accounts,
  busy,
  err,
  clr,
  actingId,
  onApprove,
  onRevise,
  onApproveRoutine,
  onWithdraw,
}: {
  /** T6: threaded to EntryDiffPanel's `get_doc_entry_diff`/`get_entry_diff`
   *  calls, both of which take `p_client` alongside `p_entry`. */
  clientId: string;
  queueRows: ReviewQueueRow[];
  queueCounts: ReviewQueueCounts;
  entries: JournalEntryRow[];
  lines: JournalLineRow[];
  linesTruncated: boolean;
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  /** FIX-2 / N1: which row's busy/err/clr this render belongs to — a page-wide
   *  hook state, attributed per action so entry A's refusal never paints onto
   *  entry B's still-open detail panel. */
  actingId: string | null;
  onApprove: (entryId: string, expectedRevision: string, attestation: string | null) => void;
  onRevise: (entryId: string, lines: EntryLineInput[], expectedRevision: string, onOk: () => void) => void;
  /** T6: clara.approve_routine_entry — no attestation, self-refuses CLR05 on
   *  a high-stakes entry (governance-doors.ts's own header). */
  onApproveRoutine: (entryId: string, expectedRevision: string) => void;
  /** T6: clara.withdraw_draft — abandons the draft entirely. */
  onWithdraw: (entryId: string, reason: string, expectedRevision: string, onOk: () => void) => Promise<void>;
}) {
  const t = useTranslations("JournalsWorkbench.drafts");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // FIX-6 (independent review): `queueRows` is what fit under `p_limit` —
  // `queueCounts.open_drafts` is the TRUE total, computed pre-limit. Only ever
  // say "no drafts" when the TRUE total says so; a tail-loss (more drafts
  // exist than this page could show) gets its own honest note instead of a
  // silently-empty page.
  if (queueCounts.open_drafts === 0) {
    return <EmptyState>{t("empty")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      {queueRows.length < queueCounts.open_drafts && (
        // The old copy ended "Narrow the queue to see the rest" and NO
        // narrowing control existed anywhere on this tab — a dead-end CTA. The
        // rest genuinely cannot be reached from here: this tab calls
        // clara.list_review_queue with `p_cursor: null` hard-wired
        // (lib/journals/api.ts:220) and does not paginate past `p_limit`. The
        // one surface that DOES page through the same union is /needs-you,
        // which threads the RPC's own `next_cursor` (components/firm/
        // needs-you-inbox.tsx's Load more). So the sentence now states the
        // fact and the link goes where the rest of the queue actually is.
        <p className="text-sm text-warning">
          {t("showingOf", { shown: queueRows.length, total: queueCounts.open_drafts })}{" "}
          <Link href="/needs-you" className="underline underline-offset-2">
            {t("showingOfLink")}
          </Link>
        </p>
      )}
      {queueRows.map((row) => {
        const entryId = row.entry_id;
        const entry = entryId ? entries.find((e) => e.id === entryId) : undefined;
        const entryLines = entryId ? lines.filter((l) => l.entry_id === entryId) : [];
        const expanded = expandedId === entryId;
        const isActing = entryId !== null && actingId === entryId;
        return (
          <Card key={row.id} className="enter-content">
            <CardContent className="flex flex-col gap-2">
              {/* Stays a raw <button>: the whole row IS the disclosure, and
                  the Button primitive is a fixed-height, nowrap control. What
                  it was missing is the product's focus idiom — it fell through
                  to the browser/global outline while every other control drew
                  the 3px ring — and `aria-expanded`, which a disclosure owes
                  a screen reader. */}
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : (entryId ?? null))}
                className="-m-1 flex w-full items-center justify-between gap-2 rounded-md p-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/70"
              >
                <span className="flex items-center gap-2">
                  <QueueSectionBadge section={row.section} />
                  {row.high_stakes && (
                    <span className="text-xs font-medium text-warning">{t("highStakes")}</span>
                  )}
                  <span className="text-sm text-foreground">{entry?.memo ?? t("noMemo")}</span>
                </span>
                <span className="text-sm font-medium">
                  <Money cents={row.amount_cents} />
                </span>
              </button>
              {expanded && entry && (
                <DraftDetail
                  key={entry.revision_token}
                  clientId={clientId}
                  entry={entry}
                  highStakes={row.high_stakes}
                  lines={entryLines}
                  linesTruncated={linesTruncated}
                  accounts={accounts}
                  busy={busy}
                  err={isActing ? err : null}
                  clr={isActing ? clr : null}
                  onApprove={onApprove}
                  onRevise={onRevise}
                  onApproveRoutine={onApproveRoutine}
                  onWithdraw={onWithdraw}
                />
              )}
              {expanded && !entry && <StateBanner tone="error">{t("entryUnavailable")}</StateBanner>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * THE ATTESTATION TOKENS, transcribed from the LIVE `_approve_entry_core`
 * body's three human arms — 0016_a21_compliance_watch.sql:1424-1442, carried
 * verbatim into the fifth recut at 0037:1992-2010 and fenced-but-BYTE-
 * UNTOUCHED by the ninth body at 0106_f_a2_posting_core.sql:1496-1503 (which
 * only rewrites the head to `and not coalesce(v_is_agent,false)` for the agent
 * lane, recording that "the three human arms below are byte-untouched").
 *
 * These are the only two refusals an ATTESTATION can answer. `distinct_checker`
 * — the third arm — is deliberately ABSENT: it asks for a different PERSON, and
 * revealing a text field beside it would offer a control that cannot clear it.
 */
const ATTESTATION_REFUSALS: ReadonlySet<string> = new Set(["attestation_required", "self_attestation"]);

/**
 * `revise_entry`'s CLR21 gates read `e.coding_kind in ('supplier_bill',
 * 'sales_invoice','sales_credit_note')` — 0016_a21_compliance_watch.sql:4817-4826,
 * still the live text (packages/db/tests/f-a2-post-world.mjs:83-84 cites those
 * exact lines as current). For those three kinds the door demands a
 * counterparty proposal AND a non-empty evidence array, and this workbench
 * hardcodes BOTH to null (lib/journals/api.ts's `reviseEntry`), so Revise
 * could never do anything but produce CLR21.
 *
 * NOT `coding_kind === null`: the CHECK domain is FIVE values since
 * 0037_wave_c_a_subledger.sql:499-500 ('customer_receipt' and
 * 'supplier_payment' joined the three above), and the door's gate names only
 * three. Gating on "is it coded at all" would hide a working control on the
 * other two. The predicate here IS the door's predicate.
 */
const REVISE_REFUSING_CODING_KINDS: ReadonlySet<string> = new Set([
  "supplier_bill",
  "sales_invoice",
  "sales_credit_note",
]);

function DraftDetail({
  clientId,
  entry,
  highStakes,
  lines,
  linesTruncated,
  accounts,
  busy,
  err,
  clr,
  onApprove,
  onRevise,
  onApproveRoutine,
  onWithdraw,
}: {
  clientId: string;
  entry: JournalEntryRow;
  /** The QUEUE row's own flag (`ReviewQueueRow.high_stakes`, already rendered
   *  as a chip on the collapsed row) — it decides which door the one Approve
   *  button calls, and the DB arbitrates if the flag is stale. */
  highStakes: boolean;
  lines: JournalLineRow[];
  linesTruncated: boolean;
  accounts: CoaAccountRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  onApprove: (entryId: string, expectedRevision: string, attestation: string | null) => void;
  onRevise: (entryId: string, lines: EntryLineInput[], expectedRevision: string, onOk: () => void) => void;
  onApproveRoutine: (entryId: string, expectedRevision: string) => void;
  /** Returns act()'s own Promise (never rejects — hooks.ts's own contract) so
   *  JournalsDoorDialog can await it to know when the attempt SETTLED. */
  onWithdraw: (entryId: string, reason: string, expectedRevision: string, onOk: () => void) => Promise<void>;
}) {
  const t = useTranslations("JournalsWorkbench.drafts");
  // FIX-5 (independent review): this whole component is now KEYED on
  // `entry.revision_token` by the parent — a revise success rotates the
  // token, which REMOUNTS this component from scratch (fresh `editing`,
  // fresh `draftLines` seeded from the JUST-RELOADED `lines`). Before this
  // fix, `draftLines` was a lazy initializer that never resynced: a reload
  // could bring a FRESH revision_token while `draftLines` still held the
  // STALE pre-reload snapshot, so a submit sent stale lines under a fresh
  // token — revise_entry accepted it and silently erased whatever the stale
  // read had already missed (worse than no token at all, since the token
  // existed exactly to catch this).
  const [editing, setEditing] = useState(false);
  const [draftLines, setDraftLines] = useState<EntryLineInput[]>(() => toInput(lines));
  const [attestation, setAttestation] = useState("");
  const balance = sumLines(lines);

  // 裁-187 / ADR-0078: the attestation CEREMONY is abolished — the click is the
  // act. The FIELD is not deleted outright only because the DB wall is still
  // standing until the 裁-188 wall-removal lane lands, and a wall with no way
  // to satisfy it is a dead end. So it is hidden by default and revealed ONLY
  // beside a door refusal that actually asks for an attestation. Before this,
  // it was collected unconditionally and DISCARDED for every routine entry:
  // `v_attest` is assigned only inside the high-stakes arm while the UPDATE
  // writes `self_approval_attestation=v_attest` regardless (0016:1424-1446), so
  // a professional could type one, click Approve, get a success, and have the
  // text silently dropped. A control that does nothing is worse than no
  // control.
  const attestationDemanded = clr !== null && ATTESTATION_REFUSALS.has(clr.reason ?? "");
  const [attestationRevealed, setAttestationRevealed] = useState(false);
  useEffect(() => {
    // A LATCH, not a mirror: `act()` clears err/clr at the START of the next
    // call (lib/parts/hooks.ts), so a plain `showAttestation = demanded` would
    // unmount the field — and lose what was typed in it — the instant the
    // second Approve fired.
    if (attestationDemanded) setAttestationRevealed(true);
  }, [attestationDemanded]);
  const showAttestation = attestationRevealed || attestationDemanded;

  const reviseRefused = entry.coding_kind !== null && REVISE_REFUSING_CODING_KINDS.has(entry.coding_kind);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <EntryStatusBadge status={entry.status} />
      {editing ? (
        <EntryLinesEditor lines={draftLines} onChange={setDraftLines} accounts={accounts} />
      ) : (
        <>
          {linesTruncated && <p className="text-sm text-warning">{t("linesTruncated")}</p>}
          {/* P3 polish: the shared Table primitive, so a draft's lines have the
              same density and hairlines as every other table in the product.
              No DataTableCard here — this table is already INSIDE the draft's
              own Card, and a card inside a card is a second edge saying
              nothing. */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("account")}</TableHead>
                <TableHead>{t("description")}</TableHead>
                <TableHead className="text-right">{t("debit")}</TableHead>
                <TableHead className="text-right">{t("credit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const account = accounts.find((a) => a.account_code === line.account_code);
                return (
                  <TableRow key={line.id}>
                    <TableCell>{account ? `${line.account_code} — ${account.name}` : line.account_code}</TableCell>
                    <TableCell className="text-muted-foreground">{line.description ?? ""}</TableCell>
                    <TableCell className="text-right">{line.debit_cents ? <Money cents={line.debit_cents} /> : ""}</TableCell>
                    <TableCell className="text-right">{line.credit_cents ? <Money cents={line.credit_cents} /> : ""}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="text-right text-muted-foreground">
                  {linesTruncated ? t("presentationSumUnavailable") : t("presentationSumLabel")}
                </TableCell>
                <TableCell className="text-right">{linesTruncated ? "—" : <Money cents={balance.debitCents} />}</TableCell>
                <TableCell className="text-right">{linesTruncated ? "—" : <Money cents={balance.creditCents} />}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </>
      )}
      {/* P3 polish: the same <StateBanner> shell every other refusal in the
          product uses — the CLR code becomes the chip rather than a "CLR41: "
          prefix glued onto the message, which is how Bank, Documents, Close
          and the Clara `refusal` part have all rendered it. The message text
          itself is still the DB's own bytes, verbatim. */}
      {err && (
        <StateBanner tone="error" code={clr ? clr.code : undefined}>
          {err}
        </StateBanner>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => onRevise(entry.id, draftLines, entry.revision_token, () => setEditing(false))}
            >
              {t("saveRevision")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            {showAttestation && (
              <Input
                aria-label={t("attestation")}
                placeholder={t("attestationPlaceholder")}
                value={attestation}
                onChange={(e) => setAttestation(e.target.value)}
                className="max-w-xs"
              />
            )}
            {/* ONE primary approval control (CB-AE2E-021 part A). There was a
                second, "Approve (routine)", in the governance row below, and
                nothing on screen ever said what "routine" meant or when it
                would refuse. It was never a second KIND of approval:
                clara.approve_routine_entry (0011_daily_loop.sql:3211-3230, the
                sole definition) raises CLR05 `routine_refuses_high_stakes` on
                a high-stakes entry and otherwise DELEGATES to
                clara.approve_entry with a null attestation — the same door.
                So one button, routed by the queue row's own flag:

                  high_stakes false -> the GUARDED door. If the flag is stale
                    the DB refuses CLR05 verbatim rather than posting
                    something this client thought was routine; the reload that
                    follows brings the fresh flag and the next click routes the
                    other way. Fail closed, then correct.
                  high_stakes true  -> approve_entry, carrying the attestation
                    only if a refusal has already asked for one.

                The DB stays the arbiter — this component still invents no
                client-side rule about who may approve. */}
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                highStakes
                  ? onApprove(entry.id, entry.revision_token, attestation.trim() || null)
                  : onApproveRoutine(entry.id, entry.revision_token)
              }
            >
              {showAttestation ? t("approveAgain") : t("approve")}
            </Button>
            {reviseRefused ? null : (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                {t("revise")}
              </Button>
            )}
          </>
        )}
      </div>
      {!editing && showAttestation && <p className="text-sm text-muted-foreground">{t("attestationRevealed")}</p>}
      {/* The Revise control is GATED, not disabled-and-hoped-about: for the
          three coded kinds the door refuses CLR21 on every single call this
          editor can make, so the honest shape is the product's own
          "named, not delivered" note saying exactly which two inputs are
          missing (components/common/not-built-note.tsx — naming the door's
          own parameters verbatim is that component's documented idiom). */}
      {!editing && reviseRefused && <NotBuiltNote>{t("reviseNotBuilt")}</NotBuiltNote>}
      {!editing && <DraftGovernanceRow clientId={clientId} entry={entry} busy={busy} onWithdraw={onWithdraw} />}
    </div>
  );
}

/** T6: the withdraw door and the diff/history toggle ("the diff IS the
 *  decision", port-wave plan §5) — grouped below the approve/revise row.
 *
 *  THE SECOND APPROVE BUTTON IS GONE (CB-AE2E-021 part A). It used to sit
 *  here as "Approve (routine)" beside the primary "Approve", on the reasoning
 *  — recorded in this file's own prior comment — that the DB's CLR05/CLR06
 *  refusal should arbitrate which door an entry accepts and the component
 *  should invent no client-side rule. That mechanism reasoning was right and
 *  is UNCHANGED: the routing now lives on the one button in DraftDetail,
 *  which still lets the DB refuse rather than deciding anything itself. What
 *  was wrong was the interface: two controls a professional could not tell
 *  apart, for what is not two kinds of approval at all
 *  (clara.approve_routine_entry delegates to clara.approve_entry for every
 *  entry it does not refuse — 0011_daily_loop.sql:3211-3230).
 *
 *  BOTH DOORS STAY EXPORTED AND TESTED in lib/journals/governance-doors.ts.
 *  The routine door is the right one for a future BATCH approve surface (the
 *  shape packages/db/tests/wave-a-attest.test.mjs:105-119 exercises); this
 *  removes a button from the single-draft surface, never a verb. */
function DraftGovernanceRow({
  clientId, entry, busy, onWithdraw,
}: {
  clientId: string;
  entry: JournalEntryRow;
  busy: boolean;
  onWithdraw: (entryId: string, reason: string, expectedRevision: string, onOk: () => void) => Promise<void>;
}) {
  const t = useTranslations("DraftsDocumentGovernance");
  const [showDiff, setShowDiff] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

  return (
    <div className="flex flex-col gap-2 border-t border-dashed border-border pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <JournalsDoorDialog
          triggerLabel={t("withdraw.trigger")}
          triggerVariant="destructive"
          title={t("withdraw.title")}
          description={t("withdraw.description")}
          confirmLabel={t("withdraw.confirm")}
          busy={busy}
          confirmDisabled={!withdrawReason.trim()}
          onConfirm={() => onWithdraw(entry.id, withdrawReason.trim(), entry.revision_token, () => setWithdrawReason(""))}
        >
          <Textarea
            aria-label={t("withdraw.reasonLabel")}
            placeholder={t("withdraw.reasonPlaceholder")}
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
          />
        </JournalsDoorDialog>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShowDiff((v) => !v)}>
          {showDiff ? t("entryDiff.hide") : t("entryDiff.show")}
        </Button>
      </div>
      {showDiff && <EntryDiffPanel key={entry.id} entryId={entry.id} clientId={clientId} />}
    </div>
  );
}

function toInput(lines: JournalLineRow[]): EntryLineInput[] {
  return lines
    .slice()
    .sort((a, b) => a.line_no - b.line_no)
    .map((l) => ({ account_code: l.account_code, debit_cents: l.debit_cents, credit_cents: l.credit_cents, description: l.description }));
}
