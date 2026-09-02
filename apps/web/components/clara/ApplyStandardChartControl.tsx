"use client";

// 裁-128 — the `coa_chart_apply` checklist row's control: ONE dialog calling
// `clara.apply_coa_template` with the keep/drop family fieldset the door already takes,
// refusals verbatim, a receipt on the row.
//
// WHAT IT READS BEFORE IT OFFERS ANYTHING (lib/onboarding/coa.ts carries the citations):
//   `coa_chart_state(client)`            — the DB's own six-state verdict for this client
//   `list_coa_templates()`               — the published templates RLS admits
//   `get_coa_template(t)`                — the family roster, with labels and `inclusion`
//   `coa_template_family_plan(client,t)` — the deterministic keep/drop, as the DEFAULT
//
// THE STATE DECIDES WHETHER THERE IS ANYTHING TO OFFER, and it is READ, never inferred:
//   `pending`      the decision wants the firm template, the chart is empty, no adoption →
//                  the apply is offered.
//   `adopted`      already applied → the row reports the adoption, no control.
//   `off_standard` the chart is NOT empty → rung 5 (`chart_not_empty`) would refuse, and
//                  0156's own header calls that rung "the design's sharpest choice": an
//                  additive apply onto a predecessor's chart sprinkles the firm's codes
//                  alongside the client's real ones. The row says that, and offers nothing.
//   `declined`     the client is deliberately on its own chart → nothing to apply.
//   `undecided`    no committed decision yet → the interview has not reached it.
//   `no_client`    RLS admits no such client → the honest not-visible arm.
//
// THE FIELDSET IS THE DOOR'S OWN `p_families`, and the default is the DATABASE'S plan, not a
// guess: every family the plan says `keep` starts checked, every `drop` starts unchecked, and
// `core` families are locked checked because rung 8 refuses `core_family_dropped` by name.
// When the plan says its axis coverage is `partial` or `core_only`, the dialog SAYS SO and
// names the axes the client cannot answer — 0156:600-616 computes that list precisely so a
// human is told the proposal rests on missing facts rather than being handed a confident
// default (Q6: "she names the absent axis rather than proposing on the strength of a guess").
//
// ONE CONFIRM = ONE GOVERNED CALL. The dialog performs `apply_coa_template` and nothing
// else; it does NOT also resolve the plan item. Composing the two would imply an atomicity
// the database does not give (frontend-handoff-addendum-2026-08-24.md §2) — and the item's
// own state is a separate human record. The receipt rendered afterwards is the door's own
// returned jsonb, verbatim.

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  applyCoaTemplate,
  isKnownCoaChartState,
  listPublishedCoaTemplates,
  readCoaChartState,
  readCoaFamilyPlan,
  readCoaTemplateFamilies,
  type ApplyChartReceipt,
  type CoaChartStateRow,
  type CoaFamilyPlan,
  type CoaTemplateFamily,
  type CoaTemplateRow,
} from "@/lib/onboarding/coa";
import type { SessionTokenAccessor } from "@/lib/session";
import { OnboardingDoorDialog } from "./OnboardingDoorDialog";

type Loaded = {
  chart: CoaChartStateRow | null;
  templates: CoaTemplateRow[];
};

async function loadChartContext(clientId: string, s: SessionTokenAccessor): Promise<Loaded> {
  const chart = await readCoaChartState(clientId, { session: s });
  // The template list is only worth reading when an apply is actually on the table.
  const templates = chart?.state === "pending" ? await listPublishedCoaTemplates({ session: s }) : [];
  return { chart, templates };
}

export function ApplyStandardChartControl({
  clientId,
  planOpen,
  session,
  onApplied,
}: {
  clientId: string;
  /** The apply itself does NOT need an open plan — `apply_coa_template` never reads the
   *  onboarding plan. It is passed only so the row can explain, when the plan has closed,
   *  that the chart decision is still actionable while the plan is not. */
  planOpen: boolean;
  session: SessionTokenAccessor;
  /** Lets the parent re-read the plan after a successful apply — hydrate-never-trust. */
  onApplied?: () => void;
}) {
  const t = useTranslations("ClientOnboarding.chart");
  const state = useHydratedPart<Loaded>(session, useCallback((s: SessionTokenAccessor) => loadChartContext(clientId, s), [clientId]));
  const [templateId, setTemplateId] = useState("");
  const [families, setFamilies] = useState<CoaTemplateFamily[]>([]);
  const [plan, setPlan] = useState<CoaFamilyPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planError, setPlanError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ApplyChartReceipt | null>(null);

  const chart = state.data?.chart ?? null;
  const templates = state.data?.templates ?? [];

  /** Reads the chosen template's families AND the database's own plan for this client, then
   *  seeds the checkboxes from the plan's `keep`. Every `core` family is forced in — the
   *  door refuses without them, so offering them as unchecked would be offering a refusal. */
  const chooseTemplate = useCallback(
    async (id: string) => {
      setTemplateId(id);
      setPlan(null);
      setFamilies([]);
      setSelected(new Set());
      setPlanError(null);
      if (!id) return;
      try {
        const [roster, computed] = await Promise.all([
          readCoaTemplateFamilies(id, { session }),
          readCoaFamilyPlan(clientId, id, { session }),
        ]);
        setFamilies(roster);
        setPlan(computed);
        const next = new Set<string>(computed?.keep ?? []);
        for (const f of roster) if (f.inclusion === "core") next.add(f.familyKey);
        setSelected(next);
      } catch (err) {
        setPlanError(err instanceof Error ? err.message : String(err));
      }
    },
    [clientId, session],
  );

  function toggle(family: CoaTemplateFamily) {
    if (family.inclusion === "core") return;
    setSelected((was) => {
      const next = new Set(was);
      if (next.has(family.familyKey)) next.delete(family.familyKey);
      else next.add(family.familyKey);
      return next;
    });
  }

  if (!state.data) {
    return state.err
      ? <StateBanner tone="error" code={state.clr?.code ?? undefined}>{state.err}</StateBanner>
      : <LoadingState>{t("loading")}</LoadingState>;
  }

  const refusal = state.err ? (
    <StateBanner tone="error" code={state.clr ? `${state.clr.code}${state.clr.reason ? ` · ${state.clr.reason}` : ""}` : undefined}>
      {state.err}
    </StateBanner>
  ) : null;

  // An unrecognised state renders its own name rather than being folded into a known arm —
  // a seventh state shipped by a later migration must read honestly, not silently.
  const stateKey = chart && isKnownCoaChartState(chart.state) ? chart.state : null;

  const receiptBanner = receipt ? (
    <StateBanner tone="info">
      {t("receipt", {
        accounts: receipt.accounts ?? 0,
        families: receipt.families.length,
        adoption: receipt.adoptionId ?? "—",
      })}
    </StateBanner>
  ) : null;

  if (chart === null) {
    return <>{refusal}<EmptyState>{t("stateUnavailable")}</EmptyState></>;
  }

  if (stateKey !== "pending") {
    return (
      <div className="flex flex-col gap-2">
        {refusal}
        {receiptBanner}
        <EmptyState>
          {stateKey
            ? t(`state.${stateKey}`, { accounts: chart.accounts ?? 0 })
            : t("state.unknown", { state: chart.state })}
        </EmptyState>
      </div>
    );
  }

  const chosen = templates.find((tpl) => tpl.template_id === templateId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      {refusal}
      {receiptBanner}
      {!planOpen ? <p className="text-xs text-muted-foreground">{t("planClosedNote")}</p> : null}
      {templates.length === 0 ? (
        <EmptyState>{t("noTemplates")}</EmptyState>
      ) : (
        <OnboardingDoorDialog
          triggerLabel={t("applyTrigger")}
          title={t("applyTitle")}
          description={t("applyDescription")}
          confirmLabel={t("applyConfirm")}
          busy={state.busy}
          confirmDisabled={!chosen || selected.size === 0}
          onConfirm={() =>
            state.act(async () => {
              if (!chosen) return;
              const out = await applyCoaTemplate(
                { clientId, templateId: chosen.template_id, families: Array.from(selected).sort() },
                { session },
              );
              setReceipt(out);
              onApplied?.();
            })
          }
        >
          <NativeSelect
            value={templateId}
            onChange={(e) => void chooseTemplate(e.target.value)}
            aria-label={t("templateLabel")}
            className="w-full"
          >
            <option value="">{t("templateNone")}</option>
            {templates.map((tpl) => (
              <option key={tpl.template_id} value={tpl.template_id}>
                {t("templateOption", { title: tpl.title, version: tpl.version, accounts: tpl.accounts })}
              </option>
            ))}
          </NativeSelect>

          {planError ? <StateBanner tone="error">{planError}</StateBanner> : null}

          {plan && plan.axis && plan.axis !== "full" ? (
            <p className="text-xs text-muted-foreground">
              {plan.absentAxes.length > 0
                ? t(`axis.${plan.axis === "core_only" ? "coreOnly" : "partial"}`, { axes: plan.absentAxes.join(", ") })
                : t("axis.partialUnnamed")}
            </p>
          ) : null}

          {families.length > 0 ? (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs font-medium text-card-foreground">{t("familiesLegend")}</legend>
              {families.map((family) => (
                <label key={family.familyKey} className="flex items-start gap-2 text-xs text-card-foreground">
                  <input
                    type="checkbox"
                    checked={selected.has(family.familyKey)}
                    disabled={family.inclusion === "core"}
                    onChange={() => toggle(family)}
                    className="mt-0.5"
                  />
                  <span>
                    {family.label}
                    {family.inclusion === "core" ? (
                      <span className="ml-1 text-muted-foreground">{t("coreNote")}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          {chosen && selected.size === 0 ? (
            <p className="text-xs text-muted-foreground">{t("selectAtLeastOne")}</p>
          ) : null}
        </OnboardingDoorDialog>
      )}
      <Button type="button" size="xs" variant="ghost" disabled={state.loading} onClick={() => void state.reload()}>
        {t("recheck")}
      </Button>
    </div>
  );
}
