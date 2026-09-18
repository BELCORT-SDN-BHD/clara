"use client";

// #660 — WHO DECIDES WHICH ACCOUNTS ARE CASH. A human, through this dialog, and by no other path.
//
// THIS IS THE ONLY INVALID/SAVING FACE ON THE WHOLE MONEY BAND. The rest of the band is a read:
// there are no drafts on it, nothing to lose, and nothing for a cancel to restore. THIS dialog has
// a form, so it owns the invalid state (`aria-invalid` + `FieldError`, dirty selections preserved
// on a refusal) — and its own cancel restores nothing either, because it committed nothing. Both
// facts are stated rather than left for a reader to infer from an absent control.
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

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBanner } from "@/components/common/state";
import { isDoorRefusal } from "@/lib/doors";
import { CENTS_UNAVAILABLE, fmtCents } from "@/lib/registers/money";
import {
  publishClientCashAccountSet,
  type CashCandidate,
  type CashProposal,
  type CashSetMemberInput,
} from "@/lib/dashboard/financial-pack";
import { sessionTokenAccessor } from "@/lib/session-accessor";

type Selection = Record<string, CashSetMemberInput["member_reason"] | undefined>;

export function ClientCashSetDialog({
  clientId,
  open,
  onOpenChange,
  proposal,
  loading,
  error,
  onPublished,
  publish = publishClientCashAccountSet,
}: {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: CashProposal | null;
  loading: boolean;
  error: unknown;
  onPublished: () => void;
  /** Injected by the cells; production calls the door. */
  publish?: typeof publishClientCashAccountSet;
}) {
  const t = useTranslations("ClientFinancial");
  const tc = useTranslations("Common");
  const [selection, setSelection] = useState<Selection>({});
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<unknown>(null);

  const candidates: CashCandidate[] = proposal?.candidates ?? [];
  const chosen = Object.entries(selection).filter(([, reason]) => reason !== undefined);
  // The ONLY client-side validity rule, and it mirrors the door's own `cash_set_empty` rather than
  // inventing a second one: a cash set names at least one account.
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
        // A FIRST version with a null effective_from is stamped at the books' own start by the
        // door, which is the only value that cannot make history unreadable. This face never
        // guesses one.
        { effectiveFrom: null, opKey: `p660-cashset-${clientId}-${Date.now()}` },
        { session: sessionTokenAccessor },
      );
      onPublished();
      onOpenChange(false);
      // THE SELECTION IS CLEARED ONLY ON SUCCESS. A refusal keeps every dirty choice, because the
      // human's answer was not the thing that was wrong.
      setSelection({});
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
          <DialogTitle>{t("cashSet.dialogTitle")}</DialogTitle>
          <DialogDescription>{t("cashSet.dialogBody")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {loading ? (
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
            {saving ? t("cashSet.publishing") : t("cashSet.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
