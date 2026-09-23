"use client";

// #660 — WHO DECIDES WHICH ACCOUNTS ARE CASH. A human, through this dialog, and by no other path.
//
// THIS IS THE ONLY INVALID/SAVING FACE ON THE WHOLE MONEY BAND. The rest of the band is a read:
// there are no drafts on it, nothing to lose, and nothing for a cancel to restore. THIS dialog has
// a form, so it owns the invalid state (`aria-invalid` + `FieldError`, dirty selections preserved
// on a refusal) — and its own cancel restores nothing either, because it committed nothing. Both
// facts are stated rather than left for a reader to infer from an absent control.
//
// A REFUSAL AND A CLOSE ARE DIFFERENT THINGS. A refusal keeps every dirty choice: the human's
// answer was not what was wrong. A CLOSE discards the second-pass editor's draft outright, so the
// next open states the CURRENT published version rather than boxes somebody abandoned — see
// `seededForRef` below. The first-publish face keeps the draft behaviour #660 shipped.
//
// THE PROPOSAL IS A PROPOSAL. `clara.propose_client_cash_accounts` lists every account carrying
// the bank-registry marker — ACTIVE OR INACTIVE, because a retired account still holds the balance
// it held — and proposes NOTHING else. Petty cash has no structural marker in this schema and
// `0121:4749` forbids a name or code heuristic ("no name or code heuristic, ever — structure and
// declared facts only"), so the door will never offer it and this dialog says so in words and
// gives the human the way to add it themselves. An account named "Petty Cash" is not evidence that
// it is petty cash.
//
// A REFUSAL IS SHOWN VERBATIM, WITH ITS CODE. The door names every refusal
// (`first_version_after_books_start`, `effective_from_not_after_current`, `cash_set_empty`, …) and
// each one is a real thing the human can fix; a generic "could not save" would throw that away.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBanner } from "@/components/common/state";
import { isDoorRefusal } from "@/lib/doors";
import { CENTS_UNAVAILABLE, fmtCents } from "@/lib/registers/money";
import { memberReasonKey } from "@/lib/dashboard/financial-display";
import {
  publishClientCashAccountSet,
  type CashCandidate,
  type CashProposal,
  type CashSetMember,
  type CashSetMemberInput,
  type CurrentCashSet,
} from "@/lib/dashboard/financial-pack";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { formatDay } from "./client-financial-figure";

type MemberReason = CashSetMemberInput["member_reason"];
type Selection = Record<string, MemberReason | undefined>;

// #1002 — ONE ROW PER ACCOUNT THE EDITOR CAN OFFER: the union of the structurally derivable
// candidates (`propose_client_cash_accounts`) and the CURRENT published version's own recorded
// membership (`get_client_cash_account_set_members`, migration 0276). `reason` is the reason
// RECORDED ON THE CURRENT VERSION when the account is a member of it, and null when it is not —
// never a value this face invents. A row with `reason !== null` and no candidate match (a
// declared cash or petty cash account with no bank-registry marker) carries `balanceCents: null`
// because no door on this estate has ever computed one for it (0276's own header).
type EditorRow = {
  accountId: string;
  accountCode: string;
  name: string | null;
  isActive: boolean;
  balanceCents: number | null;
  reason: MemberReason | null;
};

/** CURRENT MEMBERS FIRST, in the ordinal order `get_client_cash_account_set_members` already
 *  returned them in — the order the current version was published in — THEN any bank-registry
 *  candidate that is not yet a member, in the order the proposal read gave it. A member with no
 *  bank-registry candidacy still gets a row; a candidate already folded into a member row is
 *  never listed twice. */
function buildRoster(candidates: CashCandidate[], members: CashSetMember[]): EditorRow[] {
  const byId = new Map<string, EditorRow>();
  for (const m of members) {
    byId.set(m.accountId, {
      accountId: m.accountId, accountCode: m.accountCode, name: m.name, isActive: m.isActive,
      balanceCents: null, reason: (m.memberReason as MemberReason) ?? null,
    });
  }
  for (const c of candidates) {
    const existing = byId.get(c.accountId);
    if (existing) existing.balanceCents = c.balanceCents;
    else byId.set(c.accountId, {
      accountId: c.accountId, accountCode: c.accountCode, name: c.name, isActive: c.isActive,
      balanceCents: c.balanceCents, reason: null,
    });
  }
  const memberIds = new Set(members.map((m) => m.accountId));
  const rest = candidates.filter((c) => !memberIds.has(c.accountId)).map((c) => byId.get(c.accountId)!);
  return [...members.map((m) => byId.get(m.accountId)!), ...rest];
}

export function ClientCashSetDialog({
  clientId,
  open,
  onOpenChange,
  // The ALREADY-LOADED financial pack's answer (`pack.cashSet !== null`, the same fact
  // `ClientCashSummary`'s own "Change" entrance is gated behind) — known the instant the dialog
  // opens, so the face never flickers while the membership read is in flight. It is the FIRST
  // answer, not the LAST one: see `isEdit` below.
  hasPublishedSet,
  proposal,
  loading,
  error,
  currentSet,
  membersLoading,
  membersError,
  onPublished,
  publish = publishClientCashAccountSet,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPublishedSet: boolean;
  proposal: CashProposal | null;
  loading: boolean;
  error: unknown;
  currentSet: CurrentCashSet | null;
  membersLoading: boolean;
  membersError: unknown;
  onPublished: () => void;
  /** Injected by the cells; production calls the door. */
  publish?: typeof publishClientCashAccountSet;
}) {
  const t = useTranslations("ClientFinancial");
  const tc = useTranslations("Common");
  const [selection, setSelection] = useState<Selection>({});
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<unknown>(null);
  const [effectiveDate, setEffectiveDate] = useState("");

  // WHICH FACE OPENS IS THE PUBLISH DOOR'S OWN FACT — "does this client have a PUBLISHED cash
  // account set?" — and only one of these two answers is that fact.
  //
  // `hasPublishedSet` comes from `pack.cashSet`, which 0232 resolves through the PERIOD WINDOW
  // (`effective_from <= as_of and (effective_to is null or effective_to >= as_of)`,
  // 0232:1051-1055). A human reading an EARLIER period than the current version's own
  // effective_from therefore gets `null` for a client that plainly has a published set, and the
  // first-publish face on such a client is a DEAD END: it states no date at all, so
  // `publish_client_cash_account_set` meets a null `p_effective_from` with a published current
  // version — its own lock is `where v.client_id = p_client and v.state = 'published'`, with NO
  // window (0232:587-589) — and raises `effective_from_required`, which that face has no field
  // to answer.
  //
  // `currentSet.publishedVersionId` is that unwindowed fact, from the read this dialog already
  // loads on the same open (`get_client_cash_account_set_members`, 0276:214, the identical
  // `state = 'published'` predicate). So the pack answers INSTANTLY and the read CORRECTS it; the
  // `||` means the face only ever moves from first-publish to editor, never back, so nothing
  // flickers under a human's hands.
  const isEdit = hasPublishedSet || currentSet?.publishedVersionId != null;

  // THE EDITOR'S OWN OP KEY: minted on the first submit attempt of a DECISION and reused for
  // every retry of the SAME figures, the same idiom `plan-form.tsx:116-126` already carries for
  // exactly this reason ("an idempotency key derived from the intent rather than the clock" —
  // the ticket's own Agent Brief). A `Date.now()` key here would mint a NEW key on every retry, so
  // a lost response would ask the same question twice instead of replaying through
  // `clara._reserve_op`. Selecting a different member or a different date is a DIFFERENT
  // decision, so both renew it.
  const editOpKeyRef = useRef<string | null>(null);
  const renewEditKey = () => { editOpKeyRef.current = null; };
  const editOpKey = () => {
    if (editOpKeyRef.current === null) editOpKeyRef.current = crypto.randomUUID();
    return editOpKeyRef.current;
  };

  // THE ROSTER IS SEEDED ONCE PER OPEN, never on every render — and CLOSING THE EDITOR DISCARDS
  // THE DRAFT, so the next open states the CURRENT version again rather than boxes a human
  // abandoned. This face's whole job is to say what the published version says; boxes that no
  // longer describe it, with the diff computed from them and nothing on screen calling them a
  // leftover, would make it say something else. It is also this file's own footer rule, taken
  // literally: "cancel restores nothing because it committed nothing — this dialog holds no
  // draft that outlives it."
  //
  // A REFUSAL IS NOT A CLOSE. The dialog stays open on a refusal and every dirty choice survives
  // it, because the human's answer was not the thing that was wrong (see `submit` below).
  //
  // THE FIRST-PUBLISH FACE IS NOT TOUCHED BY ANY OF THIS: the whole effect is behind `isEdit`,
  // so that face keeps the exact draft behaviour #660 shipped.
  const seededForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEdit) return;
    if (!open) {
      // Nothing was ever seeded, so there is nothing to forget — and no state to churn on a
      // board whose dialog has never been opened.
      if (seededForRef.current === null) return;
      seededForRef.current = null;
      setSelection({});
      setEffectiveDate("");
      setRefusal(null);
      // The abandoned figures were a DECISION. The next open is a different one (it is reseeded
      // from the current version), so it must not replay through the abandoned decision's key.
      renewEditKey();
      return;
    }
    if (currentSet === null || currentSet.publishedVersionId === null) return;
    if (seededForRef.current === currentSet.publishedVersionId) return;
    seededForRef.current = currentSet.publishedVersionId;
    const seeded: Selection = {};
    for (const m of currentSet.members) seeded[m.accountId] = m.memberReason as MemberReason;
    setSelection(seeded);
  }, [open, isEdit, currentSet]);

  const candidates: CashCandidate[] = proposal?.candidates ?? [];
  const roster: EditorRow[] = isEdit ? buildRoster(candidates, currentSet?.members ?? []) : [];
  const currentMemberIds = new Set(isEdit ? (currentSet?.members ?? []).map((m) => m.accountId) : []);
  const chosen = Object.entries(selection).filter(([, reason]) => reason !== undefined);
  const selectedIds = new Set(chosen.map(([id]) => id));
  const added = roster.filter((r) => selectedIds.has(r.accountId) && !currentMemberIds.has(r.accountId));
  const removed = roster.filter((r) => !selectedIds.has(r.accountId) && currentMemberIds.has(r.accountId));
  const unchangedCount = roster.filter((r) => selectedIds.has(r.accountId) && currentMemberIds.has(r.accountId)).length;
  // The ONLY client-side validity rule, and it mirrors the door's own `cash_set_empty` rather than
  // inventing a second one: a cash set names at least one account. The EFFECTIVE DATE carries no
  // client-side rule of its own — a null or non-advancing date is the DOOR's own refusal
  // (`effective_from_required` / `effective_from_not_after_current`), and this face lets it
  // arrive and shows it verbatim rather than guessing the rule and blocking early.
  const invalid = chosen.length === 0;

  const submit = async () => {
    if (invalid) return;
    setSaving(true);
    setRefusal(null);
    try {
      await publish(
        clientId,
        chosen.map(([accountId, reason]) => ({
          account_id: accountId,
          member_reason: reason as CashSetMemberInput["member_reason"],
        })),
        isEdit
          ? { effectiveFrom: effectiveDate === "" ? null : effectiveDate, opKey: editOpKey() }
          // A FIRST version with a null effective_from is stamped at the books' own start by the
          // door, which is the only value that cannot make history unreadable. This face never
          // guesses one.
          : { effectiveFrom: null, opKey: `p660-cashset-${clientId}-${Date.now()}` },
        { session: sessionTokenAccessor },
      );
      onPublished();
      onOpenChange(false);
      // THE SELECTION IS CLEARED ONLY ON SUCCESS. A refusal keeps every dirty choice, because the
      // human's answer was not the thing that was wrong.
      setSelection({});
      if (isEdit) {
        setEffectiveDate("");
        renewEditKey();
        seededForRef.current = null;
      }
    } catch (e) {
      setRefusal(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("cashSet.editTitle") : t("cashSet.dialogTitle")}</DialogTitle>
          <DialogDescription>{isEdit ? t("cashSet.editBody") : t("cashSet.dialogBody")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {isEdit ? (
            // =====================================================================================
            // #1002 — THE SECOND-PASS EDITOR. Everything below this line is NEW; the first-publish
            // face (the `else` arm) is untouched byte for byte, exactly as the ticket's own AC
            // requires ("first publish is unchanged").
            // =====================================================================================
            (loading || membersLoading) ? (
              <Skeleton className="h-24 w-full" aria-hidden="true" />
            ) : membersError ? (
              <StateBanner tone="error" title={t("cashSet.membersFailed")}>
                {String((membersError as Error)?.message ?? membersError)}
              </StateBanner>
            ) : error ? (
              <StateBanner tone="error" title={t("cashSet.proposalFailed")}>
                {String((error as Error)?.message ?? error)}
              </StateBanner>
            ) : (
              <>
                {currentSet ? (
                  <p className="text-xs text-muted-foreground">
                    {t("cashSet.editCurrentBasis", {
                      n: currentSet.memberCount ?? 0,
                      date: formatDay(currentSet.effectiveFrom),
                      revision: currentSet.revision ?? 1,
                    })}
                  </p>
                ) : null}
                <Field data-invalid={invalid ? "true" : undefined}>
                  <FieldLabel htmlFor="client-cash-set-members">
                    {t("cashSet.membersLabel")}
                  </FieldLabel>
                  <ul id="client-cash-set-members" className="flex flex-col gap-2">
                    {roster.map((r) => (
                      <li key={r.accountId} className="flex items-center justify-between gap-3">
                        <label className="flex min-w-0 items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4"
                            data-testid={`cash-set-member-${r.accountCode}`}
                            checked={selection[r.accountId] !== undefined}
                            aria-invalid={invalid ? true : undefined}
                            onChange={(e) => {
                              // NEVER REWRITTEN TO bank_registry: a row that carries its own
                              // RECORDED reason (a current member) keeps that exact reason on
                              // re-check; only a row with none (a bank-registry candidate that was
                              // never a member) takes the structural default.
                              setSelection((prev) => ({
                                ...prev,
                                [r.accountId]: e.target.checked ? (r.reason ?? "bank_registry") : undefined,
                              }));
                              renewEditKey();
                            }}
                          />
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{r.accountCode}</span> {r.name}
                            {!r.isActive ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                {t("cashSet.inactive")}
                              </span>
                            ) : null}
                            {r.reason !== null && r.reason !== "bank_registry" ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({t(memberReasonKey(r.reason))})
                              </span>
                            ) : null}
                          </span>
                        </label>
                        <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                          {r.balanceCents === null
                            ? CENTS_UNAVAILABLE
                            : fmtCents(r.balanceCents, tc("centsUnsafe"))}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {invalid ? <FieldError>{t("cashSet.pickOne")}</FieldError> : null}
                </Field>

                {/* THE DIFF, AGAINST THE CURRENT VERSION — added, removed, unchanged, before a
                    single byte is submitted (the ticket's own AC). */}
                <Field>
                  <FieldLabel>{t("cashSet.diffHeading")}</FieldLabel>
                  {added.length === 0 && removed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("cashSet.diffNothing")}</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-sm">
                      {added.length > 0 ? (
                        <li data-testid="cash-set-diff-added">
                          <span className="font-medium">{t("cashSet.diffAdded")}:</span>{" "}
                          {added.map((r) => r.accountCode).join(", ")}
                        </li>
                      ) : null}
                      {removed.length > 0 ? (
                        <li data-testid="cash-set-diff-removed">
                          <span className="font-medium">{t("cashSet.diffRemoved")}:</span>{" "}
                          {removed.map((r) => r.accountCode).join(", ")}
                        </li>
                      ) : null}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground" data-testid="cash-set-diff-unchanged">
                    {t("cashSet.diffUnchanged", { n: unchangedCount })}
                  </p>
                </Field>

                {/* THE HUMAN STATES THE DATE. No default is guessed here, the same rule the
                    first-publish face states for its own null: a date this face invented would be
                    a claim about WHEN, and only the human owns that claim. A null or non-advancing
                    date is the DOOR's own refusal — `effective_from_required` /
                    `effective_from_not_after_current` — shown verbatim below, never pre-empted. */}
                <Field>
                  <FieldLabel htmlFor="client-cash-set-effective-date">
                    {t("cashSet.effectiveDateLabel")}
                  </FieldLabel>
                  <Input
                    id="client-cash-set-effective-date"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => { setEffectiveDate(e.target.value); renewEditKey(); }}
                  />
                </Field>
              </>
            )
          ) : loading ? (
            <Skeleton className="h-24 w-full" aria-hidden="true" />
          ) : error ? (
            <StateBanner tone="error" title={t("cashSet.proposalFailed")}>
              {String((error as Error)?.message ?? error)}
            </StateBanner>
          ) : (
            <Field data-invalid={invalid ? "true" : undefined}>
              <FieldLabel htmlFor="client-cash-set-candidates">
                {t("cashSet.candidatesLabel")}
              </FieldLabel>
              <ul id="client-cash-set-candidates" className="flex flex-col gap-2">
                {candidates.map((c) => (
                  <li key={c.accountId} className="flex items-center justify-between gap-3">
                    <label className="flex min-w-0 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={selection[c.accountId] !== undefined}
                        aria-invalid={invalid ? true : undefined}
                        onChange={(e) =>
                          setSelection((prev) => ({
                            ...prev,
                            [c.accountId]: e.target.checked ? "bank_registry" : undefined,
                          }))}
                      />
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{c.accountCode}</span> {c.name}
                        {!c.isActive ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {t("cashSet.inactive")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
                      {c.balanceCents === null
                        ? CENTS_UNAVAILABLE
                        : fmtCents(c.balanceCents, tc("centsUnsafe"))}
                    </span>
                  </li>
                ))}
              </ul>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("cashSet.noCandidates")}</p>
              ) : null}
              {/* THE SENTENCE THE DOOR CANNOT SAY FOR ITSELF, said here instead of hidden. */}
              <p className="mt-2 text-xs text-muted-foreground">{t("cashSet.pettyCashNote")}</p>
              {invalid ? <FieldError>{t("cashSet.pickOne")}</FieldError> : null}
            </Field>
          )}

          {refusal ? (
            <StateBanner
              tone="error"
              title={t("cashSet.refused")}
              code={isDoorRefusal(refusal) ? `${refusal.code}${refusal.reason ? ` · ${refusal.reason}` : ""}` : undefined}
            >
              {String((refusal as Error)?.message ?? refusal)}
            </StateBanner>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {/* CANCEL RESTORES NOTHING BECAUSE IT COMMITTED NOTHING — this dialog holds no draft that
              outlives it, and there is nothing on the board behind it to put back. */}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cashSet.cancel")}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={invalid || saving}>
            {isEdit
              ? (saving ? t("cashSet.saving") : t("cashSet.save"))
              : (saving ? t("cashSet.publishing") : t("cashSet.publish"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
