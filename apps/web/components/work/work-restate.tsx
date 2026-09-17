"use client";

// #721 — RESTATE AS A NEW INSTRUCTION.
//
// The owner's ruling of 2026-09-12. A Work question's answer completes only what was asked: an
// answer that would change an admitted basis element is refused (`basis_change_not_allowed`,
// naming the element), because 0178 digests the basis at admission and freezes it. A reply that
// genuinely changes the instruction is therefore a NEW WORK — and this is where a person says so.
//
// WHY IT IS ONE PRESS AND NOT "cancel, then submit again". The database does both halves in ONE
// transaction (`clara.restate_accounting_work`): the successor is admitted with `supersedes`, the
// predecessor is cancelled with `superseded_by`, and the single `work.cancelled` event carries the
// link. Two presses would have a state between them in which the firm has two live Works for one
// instruction — or none — with nothing on either row saying which was meant.
//
// WHAT IS PREFILLED. The OLD BASIS, unchanged, with the person's revised wording merged into its
// MEMO. The cents, the accounts and the posting date are the figures already admitted, and this
// control does not silently re-derive them from a sentence: what a person types here is the
// instruction, and the composer is where figures are typed. A restatement that needs different
// cents goes through "Edit as a new draft", which opens exactly that composer.
//
// NOTHING HERE PAINTS AN OUTCOME IT WAS NOT TOLD BY THE DOOR (the same rule work-cancel-dialog.tsx
// states). The op key survives an unobserved outcome, so a retry REPLAYS rather than restating
// twice.

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StateBanner } from "@/components/common/state";
import { workDetailHref } from "@/lib/navigation/tree";
import { restateWork, type JournalBasisWire, type RestateWorkResult } from "@/lib/work/api";
import type { AccountingWorkRow, WorkBasis } from "@/lib/work/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** The admitted basis, on the runtime's camelCase wire. A TRANSCRIPTION, never a re-derivation:
 *  every figure is the one already admitted, and only the memo carries the new wording. */
export function restatedBasis(basis: WorkBasis, instruction: string): JournalBasisWire {
  const trimmed = instruction.trim();
  const memo = trimmed === "" ? basis.memo : `${basis.memo} — ${trimmed}`;
  return {
    postingDate: basis.posting_date,
    // `clara._assert_journal_basis` caps the memo; the door is the authority and its refusal
    // renders verbatim, but sending a string this UI knows is over the cap would spend a press.
    memo: memo.slice(0, 500),
    currency: "MYR",
    lines: basis.lines.map((l) => ({
      accountCode: l.account_code,
      debitCents: l.debit_cents,
      creditCents: l.credit_cents,
      ...(l.description ? { description: l.description } : {}),
    })),
  };
}

export function RestateWorkPanel({
  work,
  clientId,
  session,
  restate = restateWork,
  onRestated,
}: {
  work: AccountingWorkRow;
  clientId: string;
  session: SessionTokenAccessor;
  restate?: typeof restateWork;
  /** Re-read the Work. The predecessor is cancelled by the same transaction, so the page this
   *  control lives on is about to be describing a Work that has finished. */
  onRestated?: () => void | Promise<void>;
}) {
  const t = useTranslations("WorkRestate");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RestateWorkResult | null>(null);
  // ONE IDENTITY PER DECISION, held across retries of the SAME press (see this file's header).
  const opKey = useRef<string | null>(null);
  const intentKey = useRef<string | null>(null);

  // NO BASIS, NO CONTROL. A Work whose basis this build cannot read is one whose figures it must
  // not claim to be carrying forward.
  if (work.basis === null) return null;
  const basis = work.basis;

  async function submit() {
    if (opKey.current === null) opKey.current = crypto.randomUUID();
    if (intentKey.current === null) intentKey.current = crypto.randomUUID();
    setBusy(true);
    const answer = await restate(session, {
      workId: work.id,
      opKey: opKey.current,
      intentKey: intentKey.current,
      basis: restatedBasis(basis, instruction),
    });
    setBusy(false);
    setResult(answer);
    if (answer.kind === "accepted") {
      // The decision is spent. A later press is a DIFFERENT restatement and gets its own identity.
      opKey.current = null;
      intentKey.current = null;
      await onRestated?.();
    }
  }

  return (
    <section className="flex flex-col gap-2" data-testid="work-restate">
      <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
      <Textarea
        aria-label={t("label")}
        rows={2}
        value={instruction}
        disabled={busy}
        placeholder={t("placeholder")}
        data-testid="work-restate-instruction"
        onChange={(e) => setInstruction(e.target.value)}
      />
      <div>
        <Button type="button" variant="outline" size="sm" disabled={busy}
                data-testid="work-restate-submit" onClick={() => void submit()}>
          {busy ? t("restating") : t("restate")}
        </Button>
      </div>
      <RestateOutcome result={result} clientId={clientId} />
    </section>
  );
}

/** The door's own answer, rendered. `null` renders nothing. */
export function RestateOutcome({
  result,
  clientId,
}: {
  result: RestateWorkResult | null;
  clientId: string;
}) {
  const t = useTranslations("WorkRestate");
  if (result === null) return null;
  if (result.kind === "accepted") {
    return (
      <StateBanner
        tone="info"
        title={t("acceptedTitle")}
        action={
          <Link href={workDetailHref(clientId, result.workId)}
                className="text-sm font-medium text-primary underline underline-offset-2">
            {t("openNew")}
          </Link>
        }
      >
        {t("acceptedBody")}
      </StateBanner>
    );
  }
  if (result.kind === "not_restatable") {
    return (
      <StateBanner tone="warning" title={t("notRestatableTitle")} code={result.status ?? result.reason ?? undefined}>
        {t("notRestatableBody")}
      </StateBanner>
    );
  }
  if (result.kind === "invalid_basis") {
    return (
      <StateBanner tone="error" title={t("invalidTitle")} code={result.reason ?? undefined}>
        {t("invalidBody")}
      </StateBanner>
    );
  }
  if (result.kind === "denied") {
    return <StateBanner tone="error" title={t("deniedTitle")}>{t("deniedBody")}</StateBanner>;
  }
  if (result.kind === "lost") {
    // NOBODY CAN SAY WHETHER THE DOOR RAN. The page re-reads the Work; that row is the answer.
    return <StateBanner tone="warning" title={t("lostTitle")}>{t("lostBody")}</StateBanner>;
  }
  return (
    <StateBanner tone="error" title={t("unavailableTitle")}>{t("unavailableBody")}</StateBanner>
  );
}
