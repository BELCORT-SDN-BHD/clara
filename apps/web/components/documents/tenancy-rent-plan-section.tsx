"use client";

// #949 — THE CONTRACT PAGE'S TENANCY PANEL (AC8). It mounts on the document detail's FACTS view,
// under the typed-facts table, and it is where the three things a tenancy owes a person live
// together: the terms Clara read, WITH THE REGION EACH ONE CAME FROM; what the standard says
// about charging this lease as a monthly rent expense; and the recurring plan that starts only
// when somebody says so.
//
// WHY THE REGIONS ARE ON SCREEN AND NOT JUST IN THE DATA. AC1 asks for terms "with their source
// regions" and AC8 for the page to render them. A figure whose provenance a person cannot see is
// a figure they have to take on trust, which is the opposite of what this whole lane is for. So
// every term carries a VISIBLE basis line — read from the page, derived from what the page
// prints, or stated by a person — and, where it cites regions, how many and which (the ids ride
// `data-region-ids`, so the page overlay and a walk can both find them).
//
// THE PANEL NEVER POSTS ANYTHING BY ITSELF. `getTenancyRentPlanDraft` is inert by construction
// (the DB body writes nothing), and the ONLY act here is Confirm, which a person presses. When
// the lessee branch asks — MFRS over twelve months, or a stated escalation — there is no plan to
// look at at all, and the question takes its place with a required written judgement beside it.
// "Beta, nothing dark": the gate PROMPTS, it never disables. A person may still confirm, having
// written down the treatment they are taking.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useReadErrKind } from "@/lib/parts/read-err-kind";
import { getContractTerms, getTenancyRentPlanDraft } from "@/lib/documents/tenancy-reads";
import { confirmTenancyRentPlan } from "@/lib/documents/tenancy-doors";
import type {
  ContractTerm, ContractTermsRead, TenancyRentPlanDraftRead,
} from "@/lib/documents/tenancy-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { DoorFeedback } from "./door-feedback";

type Loaded = { terms: ContractTermsRead; draft: TenancyRentPlanDraftRead };

/** Cents to a plain MYR rendering. NOT `toLocaleString`: that reads the VIEWER's own locale, and
 *  two people looking at one tenancy must see one figure (the house rule lib/bank/money.ts keeps
 *  for the same reason). */
function myr(cents: number | null): string {
  if (cents === null) return "—";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100));
  const sen = String(abs % 100).padStart(2, "0");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}RM ${grouped}.${sen}`;
}

function termValue(term: ContractTerm): string {
  if (term.term_key === "escalation") {
    const e = term.escalation;
    if (!e) return "—";
    return `${myr(e.new_amount_cents)} from ${e.effective_from ?? "—"}`;
  }
  if (term.term_date) return term.term_date;
  return myr(term.amount_cents);
}

export function TenancyRentPlanSection({ clientId, documentId }: { clientId: string; documentId: string }) {
  const t = useTranslations("ClientDocuments.tenancy");
  const errKind = useReadErrKind();
  const [judgement, setJudgement] = useState("");

  const part = useHydratedPart<Loaded>(
    sessionTokenAccessor,
    useCallback(
      (s) =>
        errKind.wrap(async () => ({
          terms: await getContractTerms(documentId, { session: s }),
          draft: await getTenancyRentPlanDraft(documentId, { session: s }),
        })),
      [documentId, errKind],
    ),
  );

  const confirm = useCallback(async () => {
    await part.act(async () => {
      await confirmTenancyRentPlan(
        { clientId, documentId, judgement: judgement.trim() === "" ? null : judgement.trim() },
        { session: sessionTokenAccessor },
      );
    });
  }, [clientId, documentId, judgement, part]);

  const data = part.data;
  // A page that is not a tenancy renders NOTHING here rather than an empty panel: the facts table
  // above it is the whole story for a hire purchase, and a panel headed "Tenancy" on a hire
  // purchase is a lie the layout tells.
  if (!data) {
    return part.err ? (
      <div data-testid="tenancy-panel-error">
        <DoorFeedback err={part.err} clr={part.clr} />
      </div>
    ) : null;
  }
  if (data.draft.agreement_class !== "tenancy") return null;

  const { terms, draft } = data;
  const treatment = draft.treatment;
  const asks = treatment !== null && !treatment.drafts;
  const needsJudgement = asks && judgement.trim() === "";

  return (
    <section className="flex flex-col gap-3" data-testid="tenancy-rent-plan-panel">
      <SectionHeader level={4}>{t("heading")}</SectionHeader>
      <p className="text-xs text-muted-foreground">{t("body")}</p>

      <DoorFeedback err={part.err} clr={part.clr} />

      <div className="flex flex-col gap-2" data-testid="tenancy-terms">
        {terms.terms.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="tenancy-terms-empty">{t("termsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {terms.terms.map((term) => (
              <li
                key={term.id}
                className="flex flex-col gap-0.5 rounded-lg border border-border p-2"
                data-testid={`contract-term-${term.term_key}`}
                data-region-ids={term.source_region_ids.join(" ")}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{t(`term.${term.term_key}`)}</span>
                  <span data-testid="term-value">{termValue(term)}</span>
                </div>
                {term.printed_raw ? (
                  <span className="text-xs text-muted-foreground" data-testid="term-printed">
                    {t("printedAs", { raw: term.printed_raw })}
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground" data-testid="term-basis-kind">
                  {t(`basisKind.${term.basis_kind}`)}
                  {term.source_region_ids.length > 0
                    ? ` · ${t("citedRegions", { count: term.source_region_ids.length })}`
                    : ""}
                </span>
                <span className="text-xs text-muted-foreground">{term.basis}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {treatment ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-2" data-testid="tenancy-treatment">
          <span className="text-sm font-medium" data-testid="tenancy-standard">
            {treatment.standard ?? t("standardUnknown")}
          </span>
          {treatment.basis ? (
            <span className="text-xs text-muted-foreground" data-testid="tenancy-basis">{treatment.basis}</span>
          ) : null}
          {asks && treatment.question ? (
            <p className="text-sm" data-testid="tenancy-question">{treatment.question}</p>
          ) : null}
        </div>
      ) : null}

      {draft.refusals.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="tenancy-refusals">
          {draft.refusals.map((r) => (
            <li key={r.reason} className="text-sm text-error" data-testid={`tenancy-refusal-${r.reason}`}>
              {t(`refusal.${r.reason}`, { account: String(r.detail.account_code ?? "") })}
            </li>
          ))}
        </ul>
      ) : null}

      {draft.plan ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border p-2" data-testid="tenancy-plan-draft">
          <span className="text-sm font-medium">{t("planHeading")}</span>
          <span className="text-sm" data-testid="tenancy-plan-schedule">
            {t("planSchedule", {
              amount: myr(draft.plan.monthly_rent_cents),
              from: draft.plan.effective_from ?? "—",
              to: draft.plan.effective_to ?? "—",
              occurrences: draft.plan.occurrences ?? 0,
            })}
          </span>
          <ul className="flex flex-col gap-0.5">
            {draft.plan.lines.map((line) => (
              <li key={line.account_code} className="text-xs text-muted-foreground" data-testid={`tenancy-plan-leg-${line.account_code}`}>
                {line.debit_cents > 0
                  ? t("legDebit", { code: line.account_code, amount: myr(line.debit_cents) })
                  : t("legCredit", { code: line.account_code, amount: myr(line.credit_cents) })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {asks ? (
        <div className="flex flex-col gap-1" data-testid="tenancy-judgement">
          <label className="text-xs text-muted-foreground" htmlFor="tenancy-judgement-input">
            {t("judgementLabel")}
          </label>
          <Textarea
            id="tenancy-judgement-input"
            value={judgement}
            onChange={(e) => setJudgement(e.target.value)}
            placeholder={t("judgementPlaceholder")}
          />
        </div>
      ) : null}

      {draft.confirmed ? (
        <p className="text-sm" data-testid="tenancy-plan-confirmed">
          {t("confirmed", { status: draft.plan_status ?? "active" })}
        </p>
      ) : (
        <div>
          <Button
            type="button"
            size="sm"
            data-testid="tenancy-confirm-plan"
            disabled={part.busy || draft.plan === null || needsJudgement}
            onClick={() => void confirm()}
          >
            {part.busy ? t("busy") : t("confirmPlan")}
          </Button>
          {needsJudgement ? (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="tenancy-judgement-required">
              {t("judgementRequired")}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
