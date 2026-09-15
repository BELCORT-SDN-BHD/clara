"use client";

// #654 — PROMOTE THIS CLIENT RECORD TO A FIRM-WIDE DEFAULT.
//
// THE ESTATE'S FIRST MANUAL-CAPTURE UI AT ANY SCOPE. `clara.capture_knowledge` has
// had zero callers since 0192 shipped it — 0192 records that as its own deferral
// (3) — so there is no existing capture form to extend. This dialog is it, at firm
// scope, and it calls the SHIPPED door: the promotion is not a new contract, it is
// the caller 0192 was missing.
//
// FOUR THINGS THIS SURFACE IS RESPONSIBLE FOR, each because the database cannot be:
//
//  1 · THE REASON IS AUTHORED HERE, never inherited. The client record's `basis` is
//      that client's own narrative ("the client invoices in dollars"), and carrying
//      it over would put one client's words behind a rule applied to every other.
//      The field starts EMPTY and the confirm is disabled until it is written; the
//      door refuses a blank one too (CLR10 `knowledge_basis_missing`), so this is
//      the shape of the act, not the only wall.
//
//  2 · THE EFFECTIVE WINDOW'S DEFAULT IS THE FIRM'S LEGAL DATE, read from the
//      database's own `as_of` (`(now() at time zone 'Asia/Kuala_Lumpur')::date`,
//      returned by `clara.get_knowledge_applicability`) — never `new Date()` in the
//      browser. A laptop on UTC would otherwise date a firm-wide rule a day early.
//
//  3 · IT SAYS WHAT PROMOTION DOES TO EXISTING CLIENTS, persistently, in the
//      dialog: established client exceptions survive, and the rule reaches only
//      the clients that have not recorded their own. The count comes from the same
//      read, so the sentence is measured rather than reassuring.
//
//  4 · IT DOES NOT OFFER A CONTROL THAT CAN ONLY REFUSE (裁-187). Below the admin
//      floor, and for a key the catalog does not admit at firm scope, the trigger
//      is ABSENT and an explanation stands in its place — an address a human
//      reached deserves a reason, not a blank.
//
// A REFUSAL RENDERS VERBATIM, WITH ITS CLR CODE, INSIDE THE DIALOG, and the typed
// values survive it (`ArApCounterpartyDoorDialog` + `DoorDialogRefusal`; CB-AE2E-004).
// Never a toast: the persistent object is the receipt.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StateBanner } from "@/components/common/state";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadCallerContext } from "@/lib/firm/caller-context";
import { capabilityScopeFromRows } from "@/lib/firm/capabilities";
import { roleRank } from "@/lib/members/reads";
import {
  loadKnowledgeApplicability,
  promoteKnowledgeToFirm,
  type KnowledgeRecordRow,
} from "@/lib/registers/knowledge";
import { toDialogRefusal } from "@/components/common/dialog-refusal";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import { knowledgeValueText } from "./knowledge-shared";
import { FIRM_KNOWLEDGE_HREF } from "./knowledge-exception";

/**
 * `name = value` per line, parsed into the equality-condition object 0192 admits
 * (`clara._knowledge_assert_applies_when`: an object whose values are all scalars).
 *
 * Returns a TOKEN on failure rather than throwing or coercing — appendix C's field
 * rule ("preserve user input; do not change amount/date semantics to make
 * validation pass"). An empty text is a valid "always applies", not an error.
 */
export function parseAppliesWhen(
  raw: string,
): { ok: true; value: Record<string, string> } | { ok: false } {
  const value: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const at = trimmed.indexOf("=");
    if (at <= 0) return { ok: false };
    const name = trimmed.slice(0, at).trim();
    const condition = trimmed.slice(at + 1).trim();
    if (name === "" || condition === "") return { ok: false };
    value[name] = condition;
  }
  return { ok: true, value };
}

/** The admin floor `clara._knowledge_floor(key, 'firm')` enforces for EVERY key at
 *  firm scope (#603 Q22), applied fail-closed on a null/unknown rank — the same
 *  `(rank ?? -1) >= n` reading `firmCapabilities` uses. */
export function canPromoteToFirm(rank: number | null | undefined): boolean {
  return (rank ?? -1) >= (roleRank("admin") ?? Number.POSITIVE_INFINITY);
}

export function KnowledgePromoteDialog({
  clientId,
  record,
  onPromoted,
}: {
  clientId: string;
  record: KnowledgeRecordRow;
  /** Re-read whatever the caller renders, so the outcome lands on the persistent
   *  object rather than on this dialog's own optimism. */
  onPromoted?: () => Promise<void> | void;
}) {
  const t = useTranslations("FirmKnowledge.promote");
  const scope = useAsyncRead(() => loadCallerContext(sessionTokenAccessor));
  const applicability = useAsyncRead(() =>
    loadKnowledgeApplicability(clientId, record.knowledge_key, { session: sessionTokenAccessor }),
  );

  const [reason, setReason] = useState("");
  const [conditions, setConditions] = useState("");
  const [fromDraft, setFromDraft] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [fieldError, setFieldError] = useState<"applies" | "order" | null>(null);

  const rank = capabilityScopeFromRows(scope.data)?.role_rank ?? null;
  const asOf = applicability.data?.as_of ?? "";
  const from = fromDraft ?? asOf;

  // A key the catalog does not admit at firm scope is not a permission problem and
  // must not read as one: the honest sentence is "this is a fact about one client".
  const eligible = applicability.data?.key.firm_defaultable ?? null;
  const exceptionCount = applicability.data?.exception_count ?? 0;
  // A live firm rule at the SAME applicability would meet `uq_knowledge_live`
  // (CLR10 `knowledge_already_live`). Saying so before the click is kinder than
  // letting the door say it, and the door still says it if the state moved.
  const alreadyDefaulted = (applicability.data?.applicabilities ?? []).some(
    (entry) => entry.firm_rule !== null,
  );

  // Nothing is decided until BOTH reads have answered: a control offered against an
  // unknown rank would be a guess, and a control withheld against one would be a
  // denial the server never made.
  if (scope.loading || applicability.loading) return null;
  if (rank !== null && !canPromoteToFirm(rank)) {
    return (
      <StateBanner tone="neutral" title={t("deniedTitle")} className="text-xs">
        {t("deniedBody")}
      </StateBanner>
    );
  }
  if (rank === null) return null;
  if (eligible === false) {
    return (
      <StateBanner tone="neutral" title={t("ineligibleTitle")} className="text-xs">
        {t("ineligibleBody")}
      </StateBanner>
    );
  }
  if (alreadyDefaulted) {
    return (
      <StateBanner tone="info" title={t("existsTitle")} className="text-xs">
        <span className="flex flex-col items-start gap-1">
          <span>{t("existsBody")}</span>
          <Link className="underline underline-offset-4" href={FIRM_KNOWLEDGE_HREF}>
            {t("openRegister")}
          </Link>
        </span>
      </StateBanner>
    );
  }

  async function run(): Promise<boolean> {
    const parsed = parseAppliesWhen(conditions);
    if (!parsed.ok) {
      setFieldError("applies");
      return false;
    }
    if (from !== "" && to !== "" && to < from) {
      setFieldError("order");
      return false;
    }
    setFieldError(null);
    const ok = await applicability.act(async () => {
      await promoteKnowledgeToFirm(
        {
          knowledgeKey: record.knowledge_key,
          value: record.value,
          reason,
          // TRUST TRAVELS FROM WHAT IS BEING GENERALISED (C79.6): an extracted or
          // inferred client row cannot become an asserted firm policy, and this
          // does not pretend otherwise — the door refuses it by name.
          sourceKind: record.source_kind,
          appliesWhen: parsed.value,
          effectiveFrom: from === "" ? null : from,
          effectiveTo: to === "" ? null : to,
        },
        { session: sessionTokenAccessor },
      );
    });
    if (ok) {
      setReason("");
      setConditions("");
      setFromDraft(null);
      setTo("");
      await onPromoted?.();
    }
    return ok;
  }

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      title={t("title", { key: record.knowledge_key })}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={applicability.busy}
      confirmDisabled={reason.trim() === ""}
      refusal={toDialogRefusal(applicability.error)}
      onConfirm={run}
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t("valueLabel")}: {knowledgeValueText(record.value)}
        </p>

        {/* PERSISTENT, not a one-time hint: what promotion does to clients that
            already recorded their own value is the whole question this act asks. */}
        <StateBanner tone="info" title={t("preserveTitle")} className="text-xs">
          <span className="flex flex-col gap-1">
            <span>{t("preserveBody")}</span>
            {exceptionCount > 0 ? <span>{t("exceptionsToday", { count: exceptionCount })}</span> : null}
          </span>
        </StateBanner>

        <label className="flex flex-col gap-1 text-xs" htmlFor="knowledge-promote-reason">
          {t("reasonLabel")}
          <Textarea
            id="knowledge-promote-reason"
            aria-label={t("reasonLabel")}
            aria-describedby="knowledge-promote-reason-hint"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p id="knowledge-promote-reason-hint" className="text-xs text-muted-foreground">
          {t("reasonHint")}
        </p>
        {reason.trim() === "" ? (
          <p className="text-xs text-muted-foreground">{t("reasonRequired")}</p>
        ) : null}

        <label className="flex flex-col gap-1 text-xs" htmlFor="knowledge-promote-applies">
          {t("appliesWhenLabel")}
          <Textarea
            id="knowledge-promote-applies"
            aria-label={t("appliesWhenLabel")}
            aria-invalid={fieldError === "applies"}
            value={conditions}
            onChange={(e) => {
              setConditions(e.target.value);
              setFieldError(null);
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">{t("appliesWhenHint")}</p>
        {fieldError === "applies" ? (
          <p className="text-xs text-error">{t("appliesWhenInvalid")}</p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs" htmlFor="knowledge-promote-from">
            {t("effectiveFromLabel")}
            <Input
              id="knowledge-promote-from"
              type="date"
              aria-label={t("effectiveFromLabel")}
              value={from}
              onChange={(e) => {
                setFromDraft(e.target.value);
                setFieldError(null);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" htmlFor="knowledge-promote-to">
            {t("effectiveToLabel")}
            <Input
              id="knowledge-promote-to"
              type="date"
              aria-label={t("effectiveToLabel")}
              aria-invalid={fieldError === "order"}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setFieldError(null);
              }}
            />
          </label>
        </div>
        {fieldError === "order" ? (
          <p className="text-xs text-error">{t("effectiveOrder")}</p>
        ) : null}
      </div>
    </ArApCounterpartyDoorDialog>
  );
}
