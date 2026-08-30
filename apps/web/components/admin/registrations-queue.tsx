"use client";

// The operator approval queue — design §4 B, §5 ask 8; Mobbin grounding §2
// (docs/plan/active/p4-mobbin-grounding-2026-08-28.md). One export,
// `RegistrationsQueuePanel`, split in three: the operator-eligibility gate
// (an AFFORDANCE, not the wall — see `isOperatorConsoleEligible`'s own
// header in lib/registration/doors.ts), the queue table, and the
// dialog-gated Reject act. Approve carries NO dialog on purpose — Mobbin §2
// takeaway 2: "approval is a direct, receipted act", the same reasoning
// `DraftGovernanceRow`'s bare approve-routine button already rides
// (components/journals/drafts-queue-panel.tsx, F5-ratified) — a no-field
// confirmation dialog around a single click that IS already the confirming
// act adds friction without adding a real second confirmation step.

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableCard } from "@/components/common/data-table-card";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";
import { loadCallerContext } from "@/lib/firm/caller-context";
import {
  approveFirmRegistration,
  isOperatorConsoleEligible,
  loadOperatorRegistrationQueue,
  rejectFirmRegistration,
} from "@/lib/registration/doors";
import type { RegistrationRequestRow } from "@/lib/registration/reads";
import { shortId } from "@/lib/firm-admin/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";

/**
 * THE ENTRY POINT. Reads `clara.caller_context` (the SAME view P4-2's scope
 * spine reads — lib/firm/caller-context.ts, unmodified here) purely to
 * decide what to SHOW: eligible renders the real queue, anything else
 * renders one honest refusal line, covering both a genuine non-operator
 * (`is_operator` false, or owner rank not met) and the zero-row edge case
 * (this read is its own instrument — review law 2: a derived "must have a
 * membership, `requireFirmScope` already checked" is not evidence; a
 * revoked-mid-session caller who lands on this URL before its own redirect
 * fires gets the SAME honest refusal, not a crash on `ctx[0]`).
 * `_human_ctx(role_rank('owner'))` AND the `is_operator` predicate in the
 * DB are what actually decide whether an act succeeds — see
 * lib/registration/doors.ts's own header.
 */
export function RegistrationsQueuePanel() {
  const t = useTranslations("Registrations");
  const ctxState = useHydratedPart(sessionTokenAccessor, (session) => loadCallerContext(session));

  if (!ctxState.data) {
    return ctxState.err ? (
      <StateBanner
        tone="error"
        code={ctxState.clr ? `${ctxState.clr.code}${ctxState.clr.reason ? ` · ${ctxState.clr.reason}` : ""}` : undefined}
      >
        {ctxState.err}
      </StateBanner>
    ) : (
      <LoadingState>{t("loading")}</LoadingState>
    );
  }

  const row = ctxState.data[0];
  if (!row || !isOperatorConsoleEligible(row)) {
    return <StateBanner tone="warning">{t("notOperator")}</StateBanner>;
  }

  return <OperatorQueue />;
}

/** THE REAL QUEUE — mounted only once the eligibility gate above has
 *  already granted. `busy`/`act` are page-wide (not per-row): the queue is
 *  a single operator working through one request at a time, and every
 *  Approve/Reject control below disables under the SAME `busy`, so a
 *  second row's action cannot race the first's — matching
 *  compliance-register-panel.tsx's / vendor-bindings-panel.tsx's own
 *  single-banner convention rather than drafts-queue-panel.tsx's per-row
 *  `actingId` attribution, which that file needs only because it also
 *  carries an expandable per-row detail panel this one does not. */
function OperatorQueue() {
  const t = useTranslations("Registrations");
  const { data: rows, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (session) =>
    loadOperatorRegistrationQueue(session),
  );
  const [receipt, setReceipt] = useState<{ firmId: string; planId: string } | null>(null);

  // ONE synchronous guard for every Approve click in this queue (mirrors
  // RejectDialog's own per-dialog guard) — closes the pre-render race
  // `disabled={busy}` alone cannot: `busy` only takes effect on react's
  // NEXT render, so two rapid clicks (same row, or two different rows)
  // can both reach this function before either sees it.
  const approveGuardRef = useRef(createSingleFireGuard());

  async function handleApprove(row: RegistrationRequestRow) {
    // FOLD (Codex HIGH-1, RULED at the opus addendum — MEDIUM FIND-3): a
    // STABLE, DETERMINISTIC key derived from `row.id` alone, not a cached
    // `crypto.randomUUID()`. `_reserve_op`'s replay contract (0004:46-60,
    // doors.ts's own header) is keyed on `(firm, fn, op_key)` and re-hashes
    // `{request, actor}` — approve's request/actor pair for a given row
    // never changes across retries, so the key can be computed FRESH on
    // every call instead of cached in a Map that then needs pruning once a
    // row is decided. Simpler than the round-1 fix and needs no cleanup:
    // once the row leaves the open queue it is never re-approved, so this
    // key is never recomputed for it again either way.
    const key = `reg-approve-${row.id}`;
    // A NEW attempt clears the LAST attempt's receipt too (the
    // OnboardingChecklistCard F5 precedent) — otherwise a later refusal
    // renders beside a stale, unrelated "firm created" banner.
    setReceipt(null);
    await runOnce(approveGuardRef.current, async () => {
      await act(async () => {
        const out = await approveFirmRegistration(sessionTokenAccessor, row.id, key);
        // The DB's own returned `plan_id` rendered verbatim, never dropped —
        // see lib/registration/doors.ts's header on `_create_firm_core`
        // opening the onboarding plan alongside the firm.
        setReceipt({ firmId: out.firm_id, planId: out.plan_id });
      });
    });
  }

  async function handleReject(row: RegistrationRequestRow, reason: string, opKey: string, onOk: () => void) {
    setReceipt(null);
    await act(async () => {
      await rejectFirmRegistration(sessionTokenAccessor, row.id, reason, opKey);
    }, onOk);
  }

  // FOLD (Codex LOW-4): the FOUR states below are mutually exclusive at
  // the top level — before the first successful load, exactly ONE of
  // error / loading / empty / table renders, never error-plus-loading. A
  // LATER reload failing (rows already holds data from an earlier load)
  // is a DIFFERENT case: the error banner renders ALONGSIDE the still-
  // displayed table, matching compliance-register-panel.tsx's own
  // precedent ("the list is still real... the failure renders ALONGSIDE
  // it, never replacing it").
  const errorBanner = err ? (
    <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
      {err}
    </StateBanner>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      {receipt ? (
        <StateBanner tone="info">{t("approveReceipt", { firmId: receipt.firmId, planId: receipt.planId })}</StateBanner>
      ) : null}
      {!rows ? (
        // Before any successful load: error and loading are exclusive.
        errorBanner ?? <LoadingState>{t("queueLoading")}</LoadingState>
      ) : rows.length === 0 ? (
        // Mobbin grounding §2 takeaway 5: none of the three table references
        // showed an empty state — the house pattern, not a reference,
        // supplies this one. Plain muted prose, no icon.
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <>
          {errorBanner}
          <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnFirm")}</TableHead>
              <TableHead>{t("columnApplicant")}</TableHead>
              <TableHead>{t("columnNote")}</TableHead>
              <TableHead>{t("columnRequested")}</TableHead>
              <TableHead>{t("columnStatus")}</TableHead>
              <TableHead className="text-right">{t("columnActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <RegistrationRow
                key={row.id}
                row={row}
                busy={busy}
                onApprove={() => handleApprove(row)}
                onReject={(reason, opKey, onOk) => handleReject(row, reason, opKey, onOk)}
              />
            ))}
          </TableBody>
          </DataTableCard>
        </>
      )}
    </div>
  );
}

function RegistrationRow({
  row,
  busy,
  onApprove,
  onReject,
}: {
  row: RegistrationRequestRow;
  busy: boolean;
  onApprove: () => Promise<void>;
  onReject: (reason: string, opKey: string, onOk: () => void) => Promise<void>;
}) {
  const t = useTranslations("Registrations");
  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{row.firm_name}</TableCell>
      {/* No display-name resolution exists for `applicant` on this screen —
          lib/registration/doors.ts's own header explains why
          `users_visible` cannot resolve it here. `shortId` is the same
          honest-truncation idiom vendor-binding-ceremony.tsx already uses
          for an actor id this app cannot name. */}
      <TableCell className="font-mono text-xs text-muted-foreground">{shortId(row.applicant)}</TableCell>
      <TableCell className="max-w-xs text-muted-foreground">{row.note ?? t("noteUnavailable")}</TableCell>
      <TableCell className="text-muted-foreground">{row.created_at}</TableCell>
      <TableCell>
        <Badge variant="secondary">{t("statusOpen")}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={onApprove}>
            {t("approveTrigger")}
          </Button>
          <RejectDialog firmName={row.firm_name} busy={busy} onReject={onReject} />
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Reject, dialog-gated with a REQUIRED reason (Mobbin grounding §2
 *  takeaway 3, the Dribbble idiom over Braintrust's optional one): Confirm
 *  stays disabled until the textarea is non-empty. This is a UI-only gate —
 *  the DB is still the wall on content (CLR10, `reject_firm_registration`'s
 *  own `nullif(btrim(p_reason),'')` check, lib/registration/doors.ts's
 *  header) — kept as its OWN small copy rather than importing
 *  components/firm-admin/FirmAdminDoorDialog.tsx, matching that file's own
 *  stated convention: each admin domain owns its dialog chrome and its own
 *  i18n namespace so the domains stay independently reviewable. The
 *  single-fire guard mirrors that same file's ref-backed reasoning (a
 *  synchronous click-to-click race `disabled={busy}` alone cannot close,
 *  because `busy` only takes effect on the NEXT render). */
/** The bound Codex MEDIUM-2 cites — the design's own 500-character reference.
 *  The DB-side twin (`char_length(v_reason) > 500` → CLR10) is a MIGRATION
 *  and belongs to P4-D's tranche, not this order — recorded in the PR body,
 *  not built here. A UI-only bound is bypassable, so it is enforced TWICE
 *  here: the native `maxLength` attribute (stops typing/most pastes) AND an
 *  explicit length check in `confirmDisabled` (never trusts the attribute
 *  alone — a test can set `.value` directly, bypassing native input
 *  handling entirely, the same class of gap `setFieldValue`'s own header
 *  in test/hookHarness.ts documents). */
const REASON_MAX_LENGTH = 500;

function RejectDialog({
  firmName,
  busy,
  onReject,
}: {
  firmName: string;
  busy: boolean;
  onReject: (reason: string, opKey: string, onOk: () => void) => Promise<void>;
}) {
  const t = useTranslations("Registrations");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const guardRef = useRef(createSingleFireGuard());
  // FOLD (Codex HIGH-1): ONE stable op_key per (request, NORMALISED
  // reason) — reject's own hash binds `reason` (0145:850-851), so a retry
  // of the SAME reason must reuse the SAME key, but an EDITED reason must
  // mint a fresh one (reusing the old key against different args would hit
  // `_reserve_op`'s own "op_key reused with different args" CLR10). This
  // dialog's own component instance is stable for the lifetime of its row
  // (keyed by `row.id` one level up) and unmounts once the row leaves the
  // open queue, so the cache needs no separate pruning — it disappears with
  // the row it belongs to.
  const keyCacheRef = useRef<{ reason: string; key: string } | null>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* FOLD (opus addendum, LOW FIND-4): the trigger itself must be
          disabled={busy} too — Approve's own button already is, and this
          file's own header claims every control disables under the SAME
          `busy` while an act is in flight; the trigger was the one
          exception. Opening a NEW dialog while another row's act is still
          running is exactly the kind of overlap `busy` exists to prevent. */}
      <DialogTrigger render={<Button variant="destructive" size="sm" disabled={busy} />}>{t("rejectTrigger")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rejectTitle", { firm: firmName })}</DialogTitle>
          <DialogDescription>{t("rejectDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="reg-reject-reason">{t("reasonLabel")}</Label>
          <Textarea
            id="reg-reject-reason"
            required
            aria-required="true"
            maxLength={REASON_MAX_LENGTH}
            aria-describedby="reg-reject-reason-counter"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
          {/* FOLD (Codex MEDIUM-2): a localized, live counter — not a bare
              number — so the bound is legible to a screen reader too. */}
          <p id="reg-reject-reason-counter" className="text-xs text-muted-foreground">
            {reason.length > REASON_MAX_LENGTH
              ? t("reasonTooLong", { max: REASON_MAX_LENGTH })
              : t("reasonCounter", { count: reason.length, max: REASON_MAX_LENGTH })}
          </p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("cancel")}</DialogClose>
          <Button
            variant="destructive"
            disabled={busy || reason.trim().length === 0 || reason.trim().length > REASON_MAX_LENGTH}
            onClick={async () => {
              const normalized = reason.trim();
              const ran = await runOnce(guardRef.current, () =>
                onReject(normalized, keyFor(keyCacheRef, normalized), () => setReason("")),
              );
              if (ran) setOpen(false);
            }}
          >
            {busy ? t("working") : t("rejectConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** See `RejectDialog`'s own `keyCacheRef` comment. A free function (not a
 *  method) so it stays trivially unit-testable in isolation from React. */
function keyFor(cacheRef: { current: { reason: string; key: string } | null }, normalizedReason: string): string {
  if (cacheRef.current && cacheRef.current.reason === normalizedReason) {
    return cacheRef.current.key;
  }
  const key = crypto.randomUUID();
  cacheRef.current = { reason: normalizedReason, key };
  return key;
}
