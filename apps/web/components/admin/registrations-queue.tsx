"use client";

// The operator approval queue — design §4 B, §5 ask 8; Mobbin grounding §2
// (docs/plan/active/p4-mobbin-grounding-2026-08-28.md). ONE COMPONENT
// export, `RegistrationsQueuePanel`, split in three: the operator-eligibility
// gate (an AFFORDANCE, not the wall — see `isOperatorConsoleEligible`'s own
// header in lib/registration/doors.ts), the queue table, and the
// dialog-gated Reject act. Approve carries NO dialog on purpose — Mobbin §2
// takeaway 2: "approval is a direct, receipted act", the same reasoning
// `DraftGovernanceRow`'s bare approve-routine button already rides
// (components/journals/drafts-queue-panel.tsx, F5-ratified) — a no-field
// confirmation dialog around a single click that IS already the confirming
// act adds friction without adding a real second confirmation step.
//
// FOLD (round-3) exports `rejectKeyFor`, a plain, React-free async
// function — the round-2 Map-based `keyFor` it replaces is gone entirely
// (Codex round-3, LOW: the Map "retains one key per normalised reason...
// entries persist until the row unmounts" — unbounded historical state for
// no reason, since the key is a pure function of its inputs). See that
// function's own header.

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
import { isCallerContextRow, loadCallerContext } from "@/lib/firm/caller-context";
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

  // FOLD (Codex round-3, MEDIUM caller-context shape fails open):
  // `lib/read.ts`'s `getRows` (via `wire.ts`'s `pgrestSelect`) parses a
  // successful HTTP-200 body as `T[]` through a bare generic cast — nothing
  // on that path runs `isCallerContextRow`. `ctxState.data[0]` alone
  // therefore trusted an eligible-SHAPED row even if its `user_id` were
  // missing/null/not-a-UUID (minting `reg-approve-<id>-undefined` below,
  // colliding every malformed caller onto ONE key) and silently took the
  // FIRST of two-or-more rows rather than denying the ambiguity. This
  // mirrors the established fail-closed pattern this exact view already
  // has at `lib/require-firm-scope.ts`'s `resolveFirmScope` (`:176-186`
  // there — "exactly one row AND isCallerContextRow(row)"), rather than
  // re-deriving a second, driftable copy of the same judgement (review law
  // 3: a row that merely LOOKS like a CallerContextRow is a projection of
  // one, not proof). Zero rows, more than one row, and a single malformed
  // row all deny identically here — this screen shows one honest refusal
  // line either way (this gate is an AFFORDANCE, not the wall, per
  // `isOperatorConsoleEligible`'s own header — the DB is).
  // FOLD (round-3 native re-verify addendum): same four-way fail-closed
  // guard as above, restated as one combined condition per that review's
  // own requested shape — `row` is read positionally (`data[0]`) and
  // `ctxState.data.length > 1` catches the ambiguous case explicitly,
  // rather than folding "exactly one" into the lookup itself. Equivalent
  // truth table, different phrasing.
  const row = ctxState.data[0];
  if (!row || ctxState.data.length > 1 || !isCallerContextRow(row) || !isOperatorConsoleEligible(row)) {
    return <StateBanner tone="warning">{t("notOperator")}</StateBanner>;
  }

  // FOLD (Codex round-2, MEDIUM cross-operator Approve key collision): the
  // caller's own `user_id`, now PROVEN to actually be a UUID by the
  // validation above, threaded down so `handleApprove` below can bind it
  // into the deterministic op_key. See that function's own comment for why.
  return <OperatorQueue callerId={row.user_id} />;
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
function OperatorQueue({ callerId }: { callerId: string }) {
  const t = useTranslations("Registrations");
  const { data: rows, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (session) =>
    loadOperatorRegistrationQueue(session),
  );
  const [receipt, setReceipt] = useState<{ firmId: string; planId: string } | null>(null);

  // ONE synchronous guard for EVERY governed act on this page. `busy` only
  // reaches the controls on React's next render; this ref closes both the
  // same-button double click and the cross-row Approve/Reject race before
  // either action performs its first await.
  const actionGuardRef = useRef(createSingleFireGuard());

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
    //
    // FOLD (Codex round-2, MEDIUM cross-operator Approve key collision):
    // `_reserve_op` (0004_governed_fns.sql:46-55) is scoped ONLY by
    // `(firm, fn, op_key)` -- the actor lives solely inside the re-hashed
    // request/actor pair (0145:788-790), never in the reservation's own
    // identity. A key derived from `row.id` ALONE therefore collides
    // across two DIFFERENT operator-firm owners racing the same row: the
    // second caller's key is "reused with different args" (CLR10) before
    // the door ever reads the row's own status, masking the honest CLR09
    // ("no longer open") a second decider should see. `callerId` (this
    // component's own prop, sourced from `caller_context.user_id` -- see
    // RegistrationsQueuePanel's header, never a client-supplied value)
    // makes the key actor-scoped too: a SAME-actor retry still replays
    // (identical row + identical callerId -> identical key -> identical
    // request hash), while a DIFFERENT actor mints its own key and reaches
    // the row-status check on its own merits.
    const key = `reg-approve-${row.id}-${callerId}`;
    // A NEW attempt clears the LAST attempt's receipt too (the
    // OnboardingChecklistCard F5 precedent) — otherwise a later refusal
    // renders beside a stale, unrelated "firm created" banner.
    setReceipt(null);
    await runOnce(actionGuardRef.current, async () => {
      await act(async () => {
        const out = await approveFirmRegistration(sessionTokenAccessor, row.id, key);
        // The DB's own returned `plan_id` rendered verbatim, never dropped —
        // see lib/registration/doors.ts's header on `_create_firm_core`
        // opening the onboarding plan alongside the firm.
        setReceipt({ firmId: out.firm_id, planId: out.plan_id });
      });
    });
  }

  async function handleReject(row: RegistrationRequestRow, reason: string, onOk: () => void): Promise<boolean> {
    setReceipt(null);
    return runOnce(actionGuardRef.current, async () => {
      await act(async () => {
        // ROUND 5: hashing belongs INSIDE both the page-wide synchronous
        // guard and `act()` so `busy` begins before this first await.
        const opKey = await rejectKeyFor(row.id, callerId, reason);
        await rejectFirmRegistration(sessionTokenAccessor, row.id, reason, opKey);
      }, onOk);
    });
  }

  // FOLD (Codex LOW-4, amended round-2): before the first successful
  // load (`rows` still null), error and loading are mutually exclusive —
  // exactly ONE of them renders, never error-plus-loading, and the empty
  // state cannot exist yet (there is no data to be empty). ONCE `rows`
  // holds a real result (empty array included), a LATER reload failing
  // renders `errorBanner` ALONGSIDE whatever that result was — table OR
  // EmptyState — matching compliance-register-panel.tsx's own precedent
  // ("the list is still real... the failure renders ALONGSIDE it, never
  // replacing it"). Round-2 fix: the empty branch used to drop
  // `errorBanner` entirely, so a governed refusal whose mandatory
  // re-read happened to empty the queue (the row it just decided was the
  // last open one) silently vanished — the ACT succeeded or failed for
  // real reasons a screen reader and a sighted operator both need to see,
  // regardless of how many rows are left afterward.
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
        // supplies this one. Plain muted prose, no icon. FOLD (round-2):
        // `errorBanner` renders here too now — see the block comment above.
        <>
          {errorBanner}
          <EmptyState>{t("empty")}</EmptyState>
        </>
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
                onReject={(reason, onOk) => handleReject(row, reason, onOk)}
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
  onReject: (reason: string, onOk: () => void) => Promise<boolean>;
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
          <RejectDialog
            requestId={row.id}
            firmName={row.firm_name}
            busy={busy}
            onReject={onReject}
          />
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
 *  i18n namespace so the domains stay independently reviewable. Its parent
 *  owns the page-wide synchronous guard because `disabled={busy}` alone
 *  cannot close a pre-render cross-row race. */
/** The bound Codex MEDIUM-2 cites — the design's own 500-character
 *  reference, meaning Unicode CODE POINTS (matching PostgreSQL's own
 *  `char_length` direction — the DB-side twin, `char_length(v_reason) >
 *  500` → CLR10, is a MIGRATION and belongs to P4-D's tranche, not this
 *  order, recorded in the PR body, not built here), never grapheme
 *  clusters: a combining-mark sequence or a ZWJ emoji sequence counts as
 *  MULTIPLE units here even though it reads as one visual character —
 *  Postgres's `char_length` does not count grapheme clusters either, so
 *  this stays consistent with the eventual DB wall rather than a friendlier
 *  but DIFFERENT bound the two would then disagree on.
 *
 *  FOLD (Codex round-3, LOW native maxlength contradicts the code-point
 *  contract): the native `maxLength` HTML attribute counts UTF-16 CODE
 *  UNITS on the RAW, untrimmed value, before any of this file's own
 *  code-point logic ever runs (the HTML spec's own `string length`,
 *  https://infra.spec.whatwg.org/#strings) — for 500 supplementary
 *  characters (each a surrogate PAIR) that attribute silently stopped
 *  typing at ~250, and a legitimately-valid padded reason (500 core
 *  characters plus surrounding whitespace) could not be typed past 500
 *  raw units even though the TRIMMED value was fine. Removed entirely —
 *  the explicit `normalizedLength` gate below (trimmed, code-point-
 *  counted, matching what actually travels to the wire) is now the ONLY
 *  wall, never contradicted by a second, differently-counted one. */
const REASON_MAX_LENGTH = 500;

/** FOLD (Codex round-2, LOW reason-length metric drift): count Unicode CODE
 *  POINTS, not UTF-16 code units — `string.length` counts each surrogate
 *  pair (a supplementary character, e.g. many emoji) as TWO, silently
 *  halving the effective bound for such text and disagreeing with both the
 *  "characters" copy and PostgreSQL's own `char_length` (which the DB-side
 *  wall this file's header defers to P4-D will use). Iterating a string
 *  (`[...s]`/`Array.from`) walks by code point, matching that semantics. */
function codePointLength(s: string): number {
  return [...s].length;
}

function RejectDialog({
  requestId,
  firmName,
  busy,
  onReject,
}: {
  requestId: string;
  firmName: string;
  busy: boolean;
  onReject: (reason: string, onOk: () => void) => Promise<boolean>;
}) {
  const t = useTranslations("Registrations");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  // FOLD (Codex round-2, LOW reason-length metric drift): derived ONCE per
  // render and used EVERYWHERE below — the counter text, the Confirm gate,
  // and the wire payload all agree on the SAME normalised (trimmed) text
  // and the SAME code-point count. Before this fold, the counter compared
  // raw `reason.length` (untrimmed, UTF-16 units) while the gate compared
  // `reason.trim().length` (trimmed, still UTF-16 units) — a padded-500
  // reason (500 core characters plus surrounding whitespace) showed
  // "too long" while Confirm was actually enabled, and 500 supplementary
  // code points (1000 UTF-16 units) showed double their real count.
  const normalized = reason.trim();
  const normalizedLength = codePointLength(normalized);

  // FOLD (round-3 native re-verify addendum, LOW): the reason field's id/
  // htmlFor/aria-describedby used to be a bare hardcoded literal —
  // `reg-reject-reason` — shared by EVERY row's own `RejectDialog`
  // instance. With two-or-more open registrations on screen, that is a
  // duplicate id twice over (the textarea's own id, and the counter
  // paragraph's), and a screen reader's label lookup for `htmlFor`
  // resolves to whichever DOM node owns the id FIRST — always row 1's
  // field, never the row the caller actually opened. Scoped by
  // `requestId` (this dialog's own row, already a prop) so every row's
  // ids are unique in the same document.
  const reasonId = `reg-reject-reason-${requestId}`;
  const reasonCounterId = `${reasonId}-counter`;

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
          <Label htmlFor={reasonId}>{t("reasonLabel")}</Label>
          <Textarea
            id={reasonId}
            required
            aria-required="true"
            aria-describedby={reasonCounterId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
          {/* FOLD (Codex MEDIUM-2): a localized, live counter — not a bare
              number — so the bound is legible to a screen reader too. */}
          <p id={reasonCounterId} className="text-xs text-muted-foreground">
            {normalizedLength > REASON_MAX_LENGTH
              ? t("reasonTooLong", { max: REASON_MAX_LENGTH })
              : t("reasonCounter", { count: normalizedLength, max: REASON_MAX_LENGTH })}
          </p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("cancel")}</DialogClose>
          <Button
            variant="destructive"
            disabled={busy || normalizedLength === 0 || normalizedLength > REASON_MAX_LENGTH}
            onClick={async () => {
              // ROUND 5: the parent acquires the ONE page-wide guard before
              // starting `act()` and its digest. Its boolean preserves the
              // rule that a dropped concurrent click never closes a dialog.
              const ran = await onReject(normalized, () => setReason(""));
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

/** FOLD (Codex round-3, LOW Reject key — unbounded historical Map):
 *  SHA-256 via Web Crypto (native in every target browser and in Node's
 *  `node --test` harness — no polyfill, no new dependency) over the
 *  normalised reason. The digest itself needs no cryptographic property
 *  here — this is a client-side DEDUPE key, not a security boundary;
 *  `_reserve_op`'s own stored `request_hash` comparison is the real wall
 *  (0004_governed_fns.sql:46-60) — but reusing the platform's own
 *  primitive is simpler and more legible than justifying a bespoke one. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The Reject op_key — PURE and STATELESS, replacing the round-2 `Map`
 *  entirely (Codex round-3, LOW: "the Map retains one key per normalised
 *  reason... entries persist until the row unmounts" — every distinct
 *  FAILED confirm added one more, unbounded for the dialog's lifetime).
 *  `(requestId, callerId, normalizedReason)` deterministically reproduces
 *  the SAME key every time — A/A replays and A/B/A's first and third calls
 *  agree BY CONSTRUCTION, needing no cache to remember them — while a
 *  genuinely different reason always reproduces a DIFFERENT key (reject's
 *  own request hash binds `reason` too, 0145:850-851, so a key collision
 *  across two different reasons would hit `_reserve_op`'s "op_key reused
 *  with different args" CLR10). `callerId` is folded in for the SAME
 *  reason `handleApprove`'s key above binds it — two different operators
 *  independently rejecting the same request must not collide onto one
 *  key. Exported for a direct unit test, same reasoning as the round-2
 *  `keyFor` this replaces. */
export async function rejectKeyFor(requestId: string, callerId: string, normalizedReason: string): Promise<string> {
  const digest = await sha256Hex(normalizedReason);
  return `reg-reject-${requestId}-${callerId}-${digest.slice(0, 16)}`;
}
