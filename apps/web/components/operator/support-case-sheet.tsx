"use client";

// THE SUPPORT CASE DETAIL (#615, journey D3: "queue and detail → permitted support action →
// receipt") — contextual, not the durable URL: the QUEUE is the address, and this Sheet is a
// supporting view of one case keyed by `?case=<kind>:<id>` (spec appendix C §4, "Sheet is
// supporting context, not the durable URL"). Opening and closing are owned by the parent
// (`support-queue.tsx`), which knows whether the Sheet was opened by an in-page click (Back should
// pop that history entry) or arrived already-open from a direct link (Back would leave the app, so
// closing rewrites the URL instead) — the same split `components/firm/activity/activity-feed.tsx`
// established for `?event=`.
//
// ONLY THE PERMITTED NEXT STEP IS OFFERED (#615 AC3, and this ticket's own scope decision). The
// console exposes the acts the estate ALREADY governs and invents none:
//   registration, still open  → Approve (direct) / Reject (dialog, reason REQUIRED)
//   problem, still open       → Resolve (dialog, resolution REQUIRED)
//   everything else           → a NAMED absence: "no supported action for this state", with the
//                               reason, rather than a control the database would refuse.
// An unconsumed payment is the honest case for that absence: `clara.claim_paid_firm` is the
// APPLICANT's own door, and there is no operator-side writer that consumes a payment. Saying so is
// the product decision; a disabled button with no explanation would not be.
//
// EVERY OP KEY IS A PURE FUNCTION of (case id, caller id, normalised argument). `clara._reserve_op`
// keys replay on `(firm, fn, op_key)` and re-hashes the arguments (0004:46-60), so a lost response
// replays the ORIGINAL receipt only if the retry carries the SAME key — a fresh random key on each
// attempt is exactly what defeats that contract, which is why none is minted here. The Reject key
// additionally binds a digest of the reason, because `reject_firm_registration`'s own hash binds it
// (0145:850-851): an EDITED reason must mint a different key rather than collide.
//
// A REFUSAL LEAVES THE TYPED TEXT STANDING. Both dialogs close only on a CONFIRMED success
// (`closeOnConfirmedOk`), so a refused act keeps the dialog, the reason and the focus where the
// person left them.

import { useEffect, useRef, useState } from "react";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LoadingState, StateBanner } from "@/components/common/state";
import { createSingleFireGuard, runOnce } from "@/lib/parts/single-fire-guard";
import { closeOnConfirmedOk } from "@/lib/parts/door-dialog-outcome";
import { businessDateTime } from "@/lib/business-date";
import { shortId } from "@/lib/firm-admin/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  approveFirmRegistration,
  rejectFirmRegistration,
  resolveStripeEventProblem,
} from "@/lib/operator/doors";
import {
  classifySupportFailure,
  getOperatorSupportCase,
  supportCaseState,
  supportedActionFor,
  type SupportCaseDetail,
  type SupportCaseKind,
} from "@/lib/operator/reads";

/** The design's own 500-character bound, meaning Unicode CODE POINTS — matching PostgreSQL's
 *  `char_length`, which is what `reject_firm_registration`'s DB-side wall would count. */
const REASON_MAX_LENGTH = 500;

function codePointLength(s: string): number {
  return [...s].length;
}

/** SHA-256 via Web Crypto (native in every target browser and in `node --test`). The digest needs
 *  no cryptographic property here — this is a client-side DEDUPE key, not a boundary;
 *  `clara._reserve_op`'s stored `request_hash` is the real wall — but reusing the platform's own
 *  primitive is simpler than justifying a bespoke one. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic, stateless, and exported for a direct unit test: the SAME (case, caller, text)
 *  always reproduces the SAME key — an A/A retry replays without any cache to remember it — while
 *  a genuinely edited text always reproduces a different one. */
export async function supportOpKey(
  verb: "approve" | "reject" | "resolve",
  caseId: string,
  callerId: string,
  text?: string,
): Promise<string> {
  if (text === undefined) return `op-${verb}-${caseId}-${callerId}`;
  const digest = await sha256Hex(text);
  return `op-${verb}-${caseId}-${callerId}-${digest.slice(0, 16)}`;
}

export function SupportCaseSheet({
  caseRef,
  callerId,
  onOpenChange,
  onActed,
}: {
  caseRef: { kind: SupportCaseKind; id: string } | null;
  callerId: string;
  onOpenChange: (open: boolean) => void;
  /** The parent re-reads the queue after every attempt, success or failure — hydrate-never-trust:
   *  this component never paints the act's own response as the new truth. */
  onActed: () => void;
}) {
  const t = useTranslations("Operator");
  const [detail, setDetail] = useState<SupportCaseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);
  const [actError, setActError] = useState<unknown>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const actionGuardRef = useRef(createSingleFireGuard());

  const open = caseRef !== null;

  useEffect(() => {
    if (!caseRef) {
      setDetail(null);
      setReadError(null);
      setActError(null);
      setReceipt(null);
      return;
    }
    let live = true;
    setLoading(true);
    setDetail(null);
    setReadError(null);
    setActError(null);
    setReceipt(null);
    getOperatorSupportCase(caseRef.kind, caseRef.id, { session: sessionTokenAccessor })
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch((e: unknown) => {
        if (live) setReadError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // This project's eslint config does not register react-hooks/exhaustive-deps. The SCALAR pair
    // is the real dependency — a new `caseRef` object identity with the same (kind, id) must not
    // re-fetch, which is exactly what depending on the object itself would do.
  }, [caseRef?.kind, caseRef?.id]);

  useEffect(() => {
    if (open && !loading) titleRef.current?.focus();
  }, [open, loading, detail, readError]);

  /** ONE path for every governed act on this Sheet: the page-wide synchronous guard, then the
   *  call, then an UNCONDITIONAL re-read (the write's own answer is a report, never the truth). */
  async function perform(run: () => Promise<string>, onOk?: () => void): Promise<boolean> {
    setActError(null);
    setReceipt(null);
    const outcome = await runOnce(actionGuardRef.current, async () => {
      setBusy(true);
      try {
        const line = await run();
        setReceipt(line);
        onOk?.();
        return true;
      } catch (e: unknown) {
        setActError(e);
        return false;
      } finally {
        setBusy(false);
        // Re-read AFTER every attempt, success and failure alike: a door that refused may still
        // have moved the row (another operator decided it a moment earlier), and the queue behind
        // this Sheet must show what is actually true.
        onActed();
      }
    });
    return closeOnConfirmedOk(outcome);
  }

  const action = detail ? supportedActionFor(detail) : "none";
  const failure = actError === null ? null : classifySupportFailure(actError);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" aria-describedby={undefined}>
        <SheetHeader>
          {/* tabIndex=-1 + an explicit focus() on open: the WAI Dialog pattern's own initial-focus
              recommendation when no form control should take it by default — this is a READ first
              and an act second. */}
          <SheetTitle ref={titleRef} tabIndex={-1}>
            {loading ? t("caseLoading") : t("caseHeading")}
          </SheetTitle>
          <SheetDescription>{t("caseSubheading")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
          {loading ? <LoadingState>{t("caseLoading")}</LoadingState> : null}

          {/* The no-oracle refusal, rendered as itself: an unknown id, a foreign kind and a
              mismatched pair are one answer at the door, so they are one answer here too. */}
          {!loading && readError ? (
            <div data-operator-region="case-not-found">
              <StateBanner tone="warning" code={classifySupportFailure(readError).code ?? undefined}>
                {t("caseNotFound")}
              </StateBanner>
            </div>
          ) : null}

          {receipt ? (
            <div data-operator-region="receipt">
              <StateBanner tone="info">{receipt}</StateBanner>
            </div>
          ) : null}

          {failure ? <ActFailureBanner failure={failure} /> : null}

          {!loading && !readError && detail ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t("columnCase")}</dt>
                <dd className="text-card-foreground">
                  <Badge variant="secondary">{t(`kind.${detail.case_kind}`)}</Badge>
                </dd>

                <dt className="text-muted-foreground">{t("columnFirm")}</dt>
                <dd className="text-card-foreground">{detail.firm_name ?? t("unavailable")}</dd>

                <dt className="text-muted-foreground">{t("columnApplicant")}</dt>
                {/* No display-name resolution exists for an applicant: `clara.users_visible`
                    requires the target share the CALLER's firm and a pre-membership applicant has
                    no membership anywhere (lib/registration/doors.ts's own measured note). The
                    truncated id is an honest absence, never a fabricated name. */}
                <dd className="font-mono text-xs text-muted-foreground">{shortId(detail.applicant)}</dd>

                <dt className="text-muted-foreground">{t("columnState")}</dt>
                <dd className="text-card-foreground">{t(`state.${supportCaseState(detail)}`)}</dd>

                <dt className="text-muted-foreground">{t("columnOccurred")}</dt>
                <dd className="text-card-foreground">{businessDateTime(detail.occurred_at)}</dd>

                {detail.note ? (
                  <>
                    <dt className="text-muted-foreground">{t("columnNote")}</dt>
                    <dd className="text-card-foreground">{detail.note}</dd>
                  </>
                ) : null}

                {detail.intent_status ? (
                  <>
                    <dt className="text-muted-foreground">{t("columnIntent")}</dt>
                    <dd className="text-card-foreground">
                      {detail.intent_status}
                      {detail.intent_status_reason ? ` · ${detail.intent_status_reason}` : ""}
                    </dd>
                  </>
                ) : null}

                {detail.problem_kind ? (
                  <>
                    <dt className="text-muted-foreground">{t("columnProblem")}</dt>
                    <dd className="text-card-foreground">{detail.problem_kind}</dd>
                  </>
                ) : null}

                {detail.stripe_event_id ? (
                  <>
                    <dt className="text-muted-foreground">{t("columnEvent")}</dt>
                    <dd className="font-mono text-xs text-muted-foreground">
                      {detail.stripe_event_id}
                      {detail.event_type ? ` · ${detail.event_type}` : ""}
                    </dd>
                  </>
                ) : null}

                {detail.decided_at ? (
                  <>
                    <dt className="text-muted-foreground">{t("columnReceipt")}</dt>
                    <dd className="text-card-foreground">
                      {t("receiptLine", {
                        who: shortId(detail.decided_by),
                        when: businessDateTime(detail.decided_at),
                        why: detail.decided_reason ?? t("unavailable"),
                      })}
                    </dd>
                  </>
                ) : null}
              </dl>

              <section
                aria-label={t("actionsLabel")}
                data-operator-region={action === "none" ? "unsupported-action" : "actions"}
                className="flex flex-col gap-2 border-t border-border pt-3"
              >
                {action === "none" ? (
                  <p className="max-w-prose text-sm text-muted-foreground">
                    {t(`noAction.${detail.case_kind}`)}
                  </p>
                ) : null}

                {action === "decide" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          const key = await supportOpKey("approve", detail.case_id, callerId);
                          const out = await approveFirmRegistration(sessionTokenAccessor, detail.case_id, key);
                          return t("approveReceipt", { firmId: out.firm_id, planId: out.plan_id });
                        })
                      }
                    >
                      {busy ? t("working") : t("approveTrigger")}
                    </Button>
                    <ReasonDialog
                      id={`reject-${detail.case_id}`}
                      busy={busy}
                      tone="destructive"
                      triggerLabel={t("rejectTrigger")}
                      title={t("rejectTitle", { firm: detail.firm_name ?? t("unavailable") })}
                      description={t("rejectDescription")}
                      confirmLabel={t("rejectConfirm")}
                      onConfirm={(reason) =>
                        perform(async () => {
                          const key = await supportOpKey("reject", detail.case_id, callerId, reason);
                          await rejectFirmRegistration(sessionTokenAccessor, detail.case_id, reason, key);
                          return t("rejectReceipt", { firm: detail.firm_name ?? t("unavailable") });
                        })
                      }
                    />
                  </div>
                ) : null}

                {action === "resolve" ? (
                  <div className="flex flex-wrap gap-2">
                    <ReasonDialog
                      id={`resolve-${detail.case_id}`}
                      busy={busy}
                      tone="default"
                      triggerLabel={t("resolveTrigger")}
                      title={t("resolveTitle", { problem: detail.problem_kind ?? t("unavailable") })}
                      description={t("resolveDescription")}
                      confirmLabel={t("resolveConfirm")}
                      onConfirm={(resolution) =>
                        perform(async () => {
                          const key = await supportOpKey("resolve", detail.case_id, callerId, resolution);
                          const out = await resolveStripeEventProblem(
                            sessionTokenAccessor, detail.case_id, resolution, key);
                          return t("resolveReceipt", { event: out.event_id });
                        })
                      }
                    />
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The five distinct act failures, each its OWN labelled region with the DB's own code beside it.
 *  Distinguishing them is #615 AC3's whole point: a duplicate operation, a provider outage, a row
 *  that moved under you and a withheld authority are four different next steps, and a single red
 *  box saying "something went wrong" offers none of them. */
function ActFailureBanner({ failure }: { failure: ReturnType<typeof classifySupportFailure> }) {
  const t = useTranslations("Operator");
  const tone = failure.kind === "denied" || failure.kind === "stale" ? "warning" : "error";
  return (
    <div data-operator-region={`failure-${failure.kind}`}>
      <StateBanner
        tone={tone}
        title={t(`failureTitle.${failure.kind}`)}
        code={failure.code ? (failure.reason ? `${failure.code} · ${failure.reason}` : failure.code) : undefined}
      >
        {t(`failureBody.${failure.kind}`)}
      </StateBanner>
    </div>
  );
}

/** The ONE dialog shape both reason-carrying acts use — Reject and Resolve differ in their words
 *  and their tone, not in their mechanics. The DB is the wall on content in both cases
 *  (`nullif(btrim(...),'')` → CLR10); the disabled Confirm below is a courtesy that keeps a person
 *  from spending a round trip to learn it. */
function ReasonDialog({
  id,
  busy,
  tone,
  triggerLabel,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  id: string;
  busy: boolean;
  tone: "default" | "destructive";
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (text: string) => Promise<boolean>;
}) {
  const t = useTranslations("Operator");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  // Derived ONCE per render and used everywhere: the counter, the Confirm gate and the wire
  // payload all agree on the SAME normalised (trimmed) text and the SAME code-point count.
  const normalized = text.trim();
  const normalizedLength = codePointLength(normalized);
  const fieldId = `operator-reason-${id}`;
  const counterId = `${fieldId}-counter`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={tone === "destructive" ? "destructive" : "outline"} size="sm" disabled={busy} />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={fieldId}>{t("reasonLabel")}</Label>
          <Textarea
            id={fieldId}
            required
            aria-required="true"
            aria-describedby={counterId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
          <p id={counterId} className="text-xs text-muted-foreground">
            {normalizedLength > REASON_MAX_LENGTH
              ? t("reasonTooLong", { max: REASON_MAX_LENGTH })
              : t("reasonCounter", { count: normalizedLength, max: REASON_MAX_LENGTH })}
          </p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("cancel")}</DialogClose>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={busy || normalizedLength === 0 || normalizedLength > REASON_MAX_LENGTH}
            onClick={async () => {
              const ok = await onConfirm(normalized);
              if (ok) {
                setText("");
                setOpen(false);
              }
            }}
          >
            {busy ? t("working") : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
