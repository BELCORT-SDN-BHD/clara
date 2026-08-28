"use client";

// The close plan for ONE fiscal year — get_close_plan (0064:154) is the
// canonical read; every door shares this panel's own `act()` so a write always
// re-derives the plan afterward (hydrate-never-trust, no optimistic UI). Keyed
// by `fiscalYearId` at the call site (ClosePage) so switching years remounts
// this panel outright — the simplest, structurally-sound race guard for a
// same-client selection change (lib/parts/hooks.ts's own header names this as
// the alternative to a manual reload-on-change effect).
//
// M1 (independent review): every door handler ALSO calls `reloadYears()`
// (ClosePage's own fiscal-year list reload) after `act()` settles — success or
// refusal, same as the plan's own reload — so the picker's status badge can
// never read stale against what this panel just showed.

import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  getClosePlan,
  getCloseReadiness,
  beginClose,
  finalizeClose,
  abandonClose,
  reopenFiscalYear,
  attestCloseException,
} from "@/lib/close/api";
import type { ReopenCorrectionTarget } from "@/lib/close/types";
import type { SessionTokenAccessor } from "@/lib/session";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { CloseDoors } from "./CloseDoors";
import { CloseReceiptPanel } from "./CloseReceiptPanel";
import { CloseReadinessPanel } from "./CloseReadinessPanel";
import { GateCheckRow } from "./GateCheckRow";
import { CloseProposalPanel } from "./CloseProposalPanel";

export function ClosePlanPanel({
  clientId,
  fiscalYearId,
  session,
  reloadYears,
}: {
  clientId: string;
  fiscalYearId: string;
  session: SessionTokenAccessor;
  /** ClosePage's own fiscal-year list reload (M1) — called after every door
   *  act this panel performs, alongside the plan's own reload. */
  reloadYears: () => Promise<void>;
}) {
  const t = useTranslations("ClientClose.plan");
  const tGates = useTranslations("ClientClose.gates");
  const tReceipt = useTranslations("ClientClose.receipt");
  const tReadiness = useTranslations("ClientClose.readiness");
  const { data: plan, busy, err, clr, act, reload } = useHydratedPart(session, (s) => getClosePlan(fiscalYearId, { session: s }));
  // T1: get_close_readiness rides its OWN hydrated part (a distinct DB read
  // from get_close_plan — see CloseReadinessPanel's own header for why the
  // shapes differ), reloaded in lockstep with the plan on every act below.
  const readiness = useHydratedPart(session, (s) => getCloseReadiness(clientId, fiscalYearId, { session: s }));

  // Wraps a door's own write in `act()` (which always reloads the plan, success
  // or failure) AND fires the picker's reload right alongside it — same
  // timing, same "always, regardless of outcome" discipline.
  const actAndReloadYears = (fn: () => Promise<void>): Promise<void> =>
    act(fn).then(() => Promise.all([reloadYears(), readiness.reload()]).then(() => undefined));

  // T1: CloseProposalPanel's own settle acts already reload via ITS OWN
  // hydrated part (proposals.act) — this is the follow-up reload for the
  // things settling a proposal can affect: the plan's own attestation state
  // (a settled 'adopted' proposal covers gate attestations) and readiness.
  const reloadPlanAndReadiness = (): Promise<void> => Promise.all([reload(), readiness.reload()]).then(() => undefined);

  if (!plan) {
    // `err === null` here means either still loading, or the read resolved a
    // legitimate `null` (get_close_plan's own "plan unavailable" shape) — both
    // render the same honest waiting/empty state; a real failure (err set)
    // renders distinctly.
    return err ? <StateBanner tone="error">{err}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>;
  }
  // THE VISIBLE-PLAN BELT (coordinator ruling, porting the dashboard precedent's
  // own defense-in-depth): even though this panel is keyed by fiscalYearId and
  // lives under the client-workspace's ClientScopeProvider (both already prevent
  // a cross-selection race structurally), never paint a plan whose own
  // fiscal_year identity doesn't match what is currently selected.
  if (plan.fiscal_year.id !== fiscalYearId || plan.fiscal_year.client_id !== clientId) {
    return <StateBanner tone="error">{t("mismatch")}</StateBanner>;
  }

  const closeRunId = plan.close_run.state === "present" ? plan.close_run.close_run_id : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-2">
        <SectionHeader level={2}>{plan.fiscal_year.label}</SectionHeader>
        <span className="text-xs text-muted-foreground">
          {plan.fiscal_year.starts_on} – {plan.fiscal_year.ends_on} · {plan.fiscal_year.status} · {t("fyEnd")}: {plan.fiscal_year.fy_end_source}
        </span>
      </header>

      {/* P3 polish: the sticky-refusal banner F2 hoisted out of the !read
          branch keeps that exact placement and lifetime — only its paint moved
          onto <StateBanner>, so a close refusal and a bank refusal are one
          thing to the eye. The code+reason are the chip now instead of a
          "CLR41 (reason): " prefix glued to the DB's own sentence. */}
      {err && (
        <StateBanner
          tone="error"
          code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}
        >
          {err}
        </StateBanner>
      )}

      <CloseDoors
        plan={plan}
        busy={busy}
        refusal={clr}
        onBegin={() => actAndReloadYears(async () => { await beginClose(fiscalYearId, { session }); })}
        onFinalize={(selfAttestation) => actAndReloadYears(async () => { await finalizeClose(fiscalYearId, selfAttestation, { session }); })}
        onAbandon={(reason) =>
          closeRunId
            ? actAndReloadYears(async () => { await abandonClose(closeRunId, reason, { session }); })
            : Promise.resolve()
        }
        onReopen={(args: { reason: string; correctionTarget: ReopenCorrectionTarget; attestation?: string }) =>
          actAndReloadYears(async () => {
            await reopenFiscalYear({ fiscalYearId, reason: args.reason, correctionTarget: args.correctionTarget, attestation: args.attestation }, { session });
          })
        }
      />

      <section className="flex flex-col gap-2">
        <SectionHeader level={3}>{tGates("heading")}</SectionHeader>
        {plan.checks.length === 0 ? (
          <EmptyState>{tGates("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {plan.checks.map((check) => (
              <GateCheckRow
                key={check.check_key}
                check={check}
                closeRunId={closeRunId}
                busy={busy}
                onAttest={({ checkKey, reason, itemKey }) =>
                  closeRunId
                    ? actAndReloadYears(async () => { await attestCloseException({ closeRunId, checkKey, reason, itemKey }, { session }); })
                    : Promise.resolve()
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={3}>{tReceipt("heading")}</SectionHeader>
        <CloseReceiptPanel receipt={plan.receipt} session={session} />
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader level={3}>{tReadiness("heading")}</SectionHeader>
        <CloseReadinessPanel readiness={readiness.data} loading={readiness.loading} err={readiness.err} session={session} />
      </section>

      {/* Keyed by closeRunId (M1's own remount technique, ClosePage.tsx's
          header): a fresh mount is the simplest, structurally-sound way to
          re-fetch once a Begin-close act turns closeRunId from null into a
          real id — useHydratedPart's own mount effect does not re-fire on a
          changed PROP, only on a genuine null<->present SESSION transition. */}
      <CloseProposalPanel key={closeRunId ?? "none"} closeRunId={closeRunId} session={session} reloadPlan={reloadPlanAndReadiness} />
    </div>
  );
}
