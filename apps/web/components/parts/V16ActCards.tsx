"use client";

// The chatTurn_v16 cards that carry a governed ACT door (P6-2, ruling Q8):
// `firm_question` and `close_proposal`. The two read-only v16 kinds are in
// ./V16Cards.tsx, whose header carries the three rules both files hold
// themselves to; the shared shell is ./PartCardShell.tsx.
//
// WHY THESE TWO SIT TOGETHER, AWAY FROM THE OTHER TWO. They hold this bump's
// ONLY judgement logic — code that decides whether an act is offered at all:
// `firm_question`'s open/settled gate, `close_proposal`'s open gate, and the
// required-reason branch on withdraw. Review law 1 ("a PR that changes judgement
// logic gets an independent review pass") is easiest to honour when that logic
// is one file a reviewer can read end to end, rather than two gates buried among
// two cards that have none.
//
// EVERY ACT RIDES `useHydratedPart().act()`, WHICH IS NOT A CONVENIENCE. It
// re-reads after the write — success AND failure, because the DB may have
// partially applied — and it keeps a governed refusal STICKY across that
// follow-up read, so a refusal is never silently erased by a re-read that merely
// happens to succeed. No optimistic UI, ever (apps/web/AGENTS.md): nothing below
// paints an outcome the write only claimed.
//
// EVERY GATE SHAPES, NEVER HIDES. A settled question and a settled proposal
// still render in full, with the DB's own record of who settled them and how —
// the controls go away because the act is genuinely unavailable, and the object
// stays because a transcript card lives in a conversation that stays on screen
// forever. The same discipline OnboardingChecklistCard.tsx states for its own
// two doors.

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "./PartBadge";
import { PartSummaryCard } from "./PartSummaryCard";
import { AgentProse, FactRows, HydrateState, MalformedPart, TokenList, usableId } from "./PartCardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/common/native-select";
import { businessDateTime } from "@/lib/business-date";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  normalizeThreadActionText,
  threadActionOpKey,
  useThreadActionCoordinator,
} from "@/lib/parts/thread-action-coordinator";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadClientRegister, type ClientRow } from "@/lib/firm/reads";
import {
  dismissFirmQuestion,
  getFirmOpenQuestionById,
  isKnownFirmQuestionKind,
  resolveFirmQuestion,
  type FirmOpenQuestionRow,
} from "@/lib/firm/needs-you-gaps";
import { listCloseProposalsForRun, settleCloseProposal } from "@/lib/close/api";
import type { CloseProposalRow } from "@/lib/close/types";
import type { CloseProposalPart, FirmQuestionPart } from "@/lib/parts/types";

/** The three settled spellings `clara.firm_open_questions.status` commits to
 *  (0103's own CHECK). Read through a guard rather than interpolated straight
 *  into a `t()` key: an unrecognised status must render an honest unknown label,
 *  never a missing-message crash — the same posture
 *  `isKnownFirmQuestionKind` already takes for the sibling column. */
const FIRM_QUESTION_STATUSES = ["open", "resolved", "dismissed"] as const;
function statusKey(status: string): (typeof FIRM_QUESTION_STATUSES)[number] | "unknown" {
  return (FIRM_QUESTION_STATUSES as readonly string[]).includes(status)
    ? (status as (typeof FIRM_QUESTION_STATUSES)[number])
    : "unknown";
}

// --- firm_question -----------------------------------------------------------

/** A FIRM-scoped open question — the carrier for a document with no client yet.
 *  Hydrates `clara.firm_open_questions_visible` in ANY status and acts through
 *  `resolve_firm_question` / `dismiss_firm_question`; `question_id` IS both
 *  doors' subject argument, which is why the wire shape is one field wide.
 *
 *  THE HYDRATE IS DELIBERATELY UNFILTERED ON STATUS — see
 *  `getFirmOpenQuestionById`'s own doc comment. A card that re-read with
 *  `status=eq.open` would go blank the moment its own act succeeded.
 *
 *  THE TWO DOORS ARE NOT SYMMETRIC, AND THE FORM MIRRORS THE SCHEMA RATHER THAN
 *  TIDYING IT. Resolve takes an OPTIONAL client (`p_client` is nullable) and
 *  stamps `named_client`; dismiss structurally CANNOT name one
 *  (`ck_firm_open_questions_dismissed_names_nobody`, 0103:591-592) — dismissing
 *  means "this was never a real question", never an attribution — so the dismiss
 *  form carries no client control at all. The same split
 *  components/firm/firm-question-row.tsx already ships for the same two doors.
 *
 *  THE CLIENT REGISTER IS A SECOND READ, AND ITS FAILURE IS NOT THIS CARD'S
 *  FAILURE. Naming a client is the entire point of the `unattributed` kind, so
 *  the card loads the register rather than shipping a degraded resolve that
 *  could only ever pass `null`. But a question is still answerable without
 *  naming anyone, so a register read that fails degrades to the same
 *  "clients unavailable" arm the queue row already has, and never takes the
 *  card down with it. `null` (could not load) and `[]` (loaded; the firm has no
 *  clients) are kept distinct for exactly that reason.
 *
 *  NO PER-KIND BRANCH ANYWHERE. `kind` goes through the shared
 *  `isKnownFirmQuestionKind` lookup with an explicit unknown arm, so the seventh
 *  kind — `onboarding_proposed`, widened into the live CHECK by 0142:222 and
 *  owed its own affordance by P6-5 ③ — renders honestly here today rather than
 *  breaking. This card adds no kind to that array: the array is
 *  needs-you-gaps.ts's to extend, and P6-5 owns it. */
export function FirmQuestionCard({ part }: { part: FirmQuestionPart }) {
  const t = useTranslations("Clara.parts.firmQuestion");
  const tn = useTranslations("NeedsYou");
  const tc = useTranslations("Clara.parts.common");
  const addressable = usableId(part.question_id);
  const state = useHydratedPart<{ row: FirmOpenQuestionRow | null; clients: ClientRow[] | null }>(
    addressable ? sessionTokenAccessor : null,
    async (s) => {
      const row = await getFirmOpenQuestionById(s, part.question_id);
      const clients = await loadClientRegister(s).catch(() => null);
      return { row, clients };
    },
  );

  const [mode, setMode] = useState<"resolve" | "dismiss" | null>(null);
  const [text, setText] = useState("");
  const [clientId, setClientId] = useState("");
  const actions = useThreadActionCoordinator();
  const resolveTriggerRef = useRef<HTMLButtonElement>(null);
  const dismissTriggerRef = useRef<HTMLButtonElement>(null);
  const originatingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const formInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (mode !== null) {
      formInputRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      originatingTriggerRef.current?.focus();
    }
  }, [mode]);

  if (!addressable) return <MalformedPart kind="firm_question" fields={["question_id"]} />;

  const row = state.data?.row ?? null;
  const clients = state.data?.clients ?? null;
  const isOpen = row?.status === "open";
  const actionBusy = state.busy || actions.busy;
  const actionUnavailable = actions.callerId === null;

  const reset = () => {
    restoreFocusRef.current = true;
    setMode(null);
    setText("");
    setClientId("");
  };

  const openMode = (next: "resolve" | "dismiss", trigger: RefObject<HTMLButtonElement | null>) => {
    originatingTriggerRef.current = trigger.current;
    setMode(next);
  };

  const submit = () => {
    const body = normalizeThreadActionText(text);
    const selectedMode = mode;
    const selectedClient = clientId || null;
    if (!body || !selectedMode || !row) return;
    const questionId = row.id;
    // The typed text is cleared by `act`'s onOk arm ONLY — a refusal must never
    // discard what the human wrote (firm-question-row.tsx's own rule).
    void actions.runOnce(async (callerId) => {
      await state.act(async () => {
        const action = selectedMode === "resolve" ? "resolve-firm-question" : "dismiss-firm-question";
        const operationKey = await threadActionOpKey({
          callerId,
          objectType: "firm-question",
          objectId: questionId,
          action,
          intent: selectedMode === "resolve" ? [body, selectedClient] : [body],
        });
        if (selectedMode === "resolve") {
          await resolveFirmQuestion(sessionTokenAccessor, questionId, body, selectedClient, operationKey);
        } else {
          await dismissFirmQuestion(sessionTokenAccessor, questionId, body, operationKey);
        }
      }, reset);
    });
  };

  return (
    <PartSummaryCard
      title={t("title")}
      rows={[[t("questionLabel"), part.question_id]]}
      link={{ href: "/needs-you", label: t("link") }}
    >
      <HydrateState state={state} hasRow={row !== null} />
      {row ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {isKnownFirmQuestionKind(row.kind) ? tn(`firmQuestionKind.${row.kind}`) : tn("firmQuestionKind.unknown", { kind: row.kind })}
            </Badge>
            <Badge tone={isOpen ? "info" : "neutral"}>{t(`status.${statusKey(row.status)}`)}</Badge>
            <span className="text-xs text-muted-foreground">{businessDateTime(row.opened_at)}</span>
          </div>
          {/* The DB's own bytes, never re-worded. */}
          <p className="wrap-anywhere text-card-foreground">{row.question_text}</p>
          <FactRows rows={[[t("documentLabel"), row.document_id]]} />
          {/* `candidates` is deliberately absent — V16Cards.tsx header rule 2.
              The queue row at /needs-you renders it; this card links there. */}

          {isOpen && actionUnavailable ? <p className="text-xs text-muted-foreground">{tc("actionUnavailable")}</p> : null}
          {isOpen ? (
            mode ? (
              <div className="flex flex-col gap-2">
                <Input
                  ref={formInputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={mode === "resolve" ? t("resolutionPlaceholder") : t("reasonPlaceholder")}
                  aria-label={mode === "resolve" ? t("resolutionPlaceholder") : t("reasonPlaceholder")}
                  disabled={actionBusy || actionUnavailable}
                />
                {mode === "resolve" ? (
                  clients === null ? (
                    <p className="text-xs text-muted-foreground">{t("clientsUnavailable")}</p>
                  ) : (
                    <NativeSelect
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      disabled={actionBusy || actionUnavailable}
                      aria-label={t("namedClientLabel")}
                      className="w-full"
                    >
                      <option value="">{t("namedClientNone")}</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  )
                ) : null}
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={submit} disabled={actionBusy || actionUnavailable || text.trim().length === 0}>
                    {actionBusy ? tc("submitting") : tc("submit")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={reset} disabled={actionBusy || actionUnavailable}>
                    {tc("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  ref={resolveTriggerRef}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openMode("resolve", resolveTriggerRef)}
                  disabled={actionBusy || actionUnavailable}
                >
                  {t("resolve")}
                </Button>
                <Button
                  ref={dismissTriggerRef}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openMode("dismiss", dismissTriggerRef)}
                  disabled={actionBusy || actionUnavailable}
                >
                  {t("dismiss")}
                </Button>
              </div>
            )
          ) : (
            // SETTLED: the DB's own record of who settled it and how — read,
            // never re-derived, and never an editable field pretending the
            // question is still open.
            <FactRows
              rows={[
                [t("settledByLabel"), row.settled_by],
                [t("settledAtLabel"), row.settled_at ? businessDateTime(row.settled_at) : null],
                [t("settlementLabel"), row.settlement_text],
                [t("namedClientResultLabel"), row.named_client],
              ]}
            />
          )}
        </div>
      ) : null}
    </PartSummaryCard>
  );
}

// --- close_proposal ----------------------------------------------------------

/** ONE close proposal — the close agent's drafted plan, standing until a human
 *  settles it. Hydrates via `listCloseProposalsForRun(close_run_id)` and picks
 *  its own row by `proposal_id`: the ABI publishes no single-row getter, so this
 *  is the same documented "pick by id from a list" fallback `staff_advance`
 *  uses, never a fabricated read function.
 *
 *  STATE IS READ, NEVER REMEMBERED. The wire deliberately carries no `state` —
 *  P6-1's declarer calls it "the one a copy would actively lie about": at most
 *  one proposal per run is ever `open` (`uq_close_proposal_live`, 0138:482), and
 *  a human adopting or withdrawing it flips that value under a card already on
 *  screen. The gate below therefore reads `row.state` from the hydrate, never
 *  anything the part remembered.
 *
 *  ADOPT IS TWO STEPS, AND THE CONSENT SHOWS WHAT IT APPROVES (law 71). Adopting
 *  binds the firm to Clara's judgement across every drafted gate item
 *  (`settle_close_proposal`'s own FIX-7 arm proves each one carries a live
 *  agent-authored attestation before it will adopt), so the trigger reveals a
 *  confirm step with the narrative, the rationale, the authoring model and the
 *  drafted items ALREADY ON SCREEN above it. The workbench panel's own FIX-4
 *  finding was precisely that a modal hiding those showed the human nothing of
 *  what they were actually approving; here they are never hidden in the first
 *  place. Withdraw requires a typed reason, exactly as the door's own arm does —
 *  the wrapper passes the value through and the DB stays the authority.
 *
 *  This is the TRANSCRIPT half of components/close/CloseProposalPanel.tsx and
 *  calls the identical door. The panel remains the full workbench, and the
 *  card's link goes there. */
export function CloseProposalCard({ part }: { part: CloseProposalPart }) {
  const t = useTranslations("Clara.parts.closeProposal");
  const tc = useTranslations("Clara.parts.common");
  const addressable = usableId(part.proposal_id) && usableId(part.close_run_id) && usableId(part.client_id);
  // The ENVELOPE, not the row — see HydrateState's caller contract in
  // ./PartCardShell.tsx: a loader resolving to `null` itself is
  // indistinguishable from one that has not resolved yet.
  const state = useHydratedPart<{ row: CloseProposalRow | null }>(addressable ? sessionTokenAccessor : null, async (s) => {
    const rows = await listCloseProposalsForRun(part.close_run_id, { session: s });
    return { row: rows.find((r) => r.id === part.proposal_id) ?? null };
  });

  const [mode, setMode] = useState<"adopt" | "withdraw" | null>(null);
  const [reason, setReason] = useState("");
  const actions = useThreadActionCoordinator();
  const adoptTriggerRef = useRef<HTMLButtonElement>(null);
  const withdrawTriggerRef = useRef<HTMLButtonElement>(null);
  const originatingTriggerRef = useRef<HTMLButtonElement | null>(null);
  const adoptConfirmRef = useRef<HTMLButtonElement>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (mode === "adopt") {
      adoptConfirmRef.current?.focus();
    } else if (mode === "withdraw") {
      reasonInputRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      originatingTriggerRef.current?.focus();
    }
  }, [mode]);

  if (!addressable) return <MalformedPart kind="close_proposal" fields={["proposal_id", "close_run_id", "client_id"]} />;

  const row = state.data?.row ?? null;
  if (row !== null && (row.client_id !== part.client_id || row.close_run_id !== part.close_run_id)) {
    return <MalformedPart kind="close_proposal" fields={["proposal_id", "close_run_id", "client_id"]} />;
  }
  const isOpen = row?.state === "open";
  const actionBusy = state.busy || actions.busy;
  const actionUnavailable = actions.callerId === null;
  const reset = () => {
    restoreFocusRef.current = true;
    setMode(null);
    setReason("");
  };

  const openMode = (next: "adopt" | "withdraw", trigger: RefObject<HTMLButtonElement | null>) => {
    originatingTriggerRef.current = trigger.current;
    setMode(next);
  };

  const settle = (next: "adopted" | "withdrawn") => {
    if (!row) return;
    const proposalId = row.id;
    const normalizedReason = next === "withdrawn" ? normalizeThreadActionText(reason) : null;
    void actions.runOnce(async (callerId) => {
      await state.act(async () => {
        const operationKey = await threadActionOpKey({
          callerId,
          objectType: "close-proposal",
          objectId: proposalId,
          action: next === "adopted" ? "adopt-close-proposal" : "withdraw-close-proposal",
          intent: [normalizedReason],
        });
        await settleCloseProposal(proposalId, next, normalizedReason, operationKey, {
          session: sessionTokenAccessor,
        });
      }, reset);
    });
  };

  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("proposalLabel"), part.proposal_id],
        [t("runLabel"), part.close_run_id],
      ]}
      link={row ? { href: `/clients/${encodeURIComponent(row.client_id)}/close`, label: t("link") } : undefined}
    >
      <HydrateState state={state} hasRow={row !== null} />
      {row ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isOpen ? "info" : "neutral"}>{row.state}</Badge>
            <span className="text-xs text-muted-foreground">
              {row.model_name} {row.model_version} · {businessDateTime(row.created_at)}
            </span>
          </div>
          <AgentProse label={t("narrativeLabel")} text={row.narrative} />
          <AgentProse label={t("rationaleLabel")} text={row.rationale} />
          {/* The DB's own check_key/item_key strings, LISTED — never counted.
              The keys are what a professional checks, and a count would be a
              figure this UI derived rather than one the DB wrote. */}
          <TokenList
            label={t("draftedLabel")}
            tokens={row.drafted.map((d) => (d.item_key ? `${d.check_key} · ${d.item_key}` : d.check_key))}
          />
          {/* `bound_digests` is deliberately absent — V16Cards.tsx header rule 2. */}

          {isOpen && actionUnavailable ? <p className="text-xs text-muted-foreground">{tc("actionUnavailable")}</p> : null}
          {isOpen ? (
            mode === null ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  ref={adoptTriggerRef}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openMode("adopt", adoptTriggerRef)}
                  disabled={actionBusy || actionUnavailable}
                >
                  {t("adopt")}
                </Button>
                <Button
                  ref={withdrawTriggerRef}
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => openMode("withdraw", withdrawTriggerRef)}
                  disabled={actionBusy || actionUnavailable}
                >
                  {t("withdraw")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">{mode === "adopt" ? t("adoptConsent") : t("withdrawConsent")}</p>
                {mode === "withdraw" ? (
                  <Input
                    ref={reasonInputRef}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t("reasonPlaceholder")}
                    aria-label={t("reasonPlaceholder")}
                    disabled={actionBusy || actionUnavailable}
                  />
                ) : null}
                <div className="flex gap-2">
                  <Button
                    ref={mode === "adopt" ? adoptConfirmRef : undefined}
                    type="button"
                    size="sm"
                    variant={mode === "withdraw" ? "destructive" : "default"}
                    onClick={() => settle(mode === "adopt" ? "adopted" : "withdrawn")}
                    disabled={actionBusy || actionUnavailable || (mode === "withdraw" && reason.trim().length === 0)}
                  >
                    {actionBusy ? tc("submitting") : mode === "adopt" ? t("adoptConfirm") : t("withdrawConfirm")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={reset} disabled={actionBusy || actionUnavailable}>
                    {tc("cancel")}
                  </Button>
                </div>
              </div>
            )
          ) : (
            <FactRows
              rows={[
                [t("settledByLabel"), row.settled_by],
                [t("settledAtLabel"), row.settled_at ? businessDateTime(row.settled_at) : null],
                [t("settleReasonLabel"), row.settle_reason],
              ]}
            />
          )}
        </div>
      ) : null}
    </PartSummaryCard>
  );
}
