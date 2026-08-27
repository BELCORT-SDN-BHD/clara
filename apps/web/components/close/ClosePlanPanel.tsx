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
  beginClose,
  finalizeClose,
  abandonClose,
  reopenFiscalYear,
  attestCloseException,
} from "@/lib/close/api";
import type { ReopenCorrectionTarget } from "@/lib/close/types";
import type { SessionTokenAccessor } from "@/lib/session";
import { CloseDoors } from "./CloseDoors";
import { CloseReceiptPanel } from "./CloseReceiptPanel";
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
  const { data: plan, busy, err, clr, act } = useHydratedPart(session, (s) => getClosePlan(fiscalYearId, { session: s }));

  // Wraps a door's own write in `act()` (which always reloads the plan, success
  // or failure) AND fires the picker's reload right alongside it — same
  // timing, same "always, regardless of outcome" discipline.
  const actAndReloadYears = (fn: () => Promise<void>): Promise<void> => act(fn).then(() => reloadYears());

  if (!plan) {
    // `err === null` here means either still loading, or the read resolved a
    // legitimate `null` (get_close_plan's own "plan unavailable" shape) — both
    // render the same honest waiting/empty state; a real failure (err set)
    // renders distinctly.
    return err ? (
      <p className="text-sm text-destructive">{err}</p>
    ) : (
      <p className="text-sm text-muted-foreground">{t("loading")}</p>
    );
  }
  // THE VISIBLE-PLAN BELT (coordinator ruling, porting the dashboard precedent's
  // own defense-in-depth): even though this panel is keyed by fiscalYearId and
  // lives under the client-workspace's ClientScopeProvider (both already prevent
  // a cross-selection race structurally), never paint a plan whose own
  // fiscal_year identity doesn't match what is currently selected.
  if (plan.fiscal_year.id !== fiscalYearId || plan.fiscal_year.client_id !== clientId) {
    return <p className="text-sm text-destructive">{t("mismatch")}</p>;
  }

  const closeRunId = plan.close_run.state === "present" ? plan.close_run.close_run_id : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-medium text-foreground">{plan.fiscal_year.label}</h2>
        <span className="text-xs text-muted-foreground">
          {plan.fiscal_year.starts_on} – {plan.fiscal_year.ends_on} · {plan.fiscal_year.status} · {t("fyEnd")}: {plan.fiscal_year.fy_end_source}
        </span>
      </header>

      {(err || clr) && (
        <p className="rounded-lg border border-destructive/30 bg-error-muted p-2 text-sm text-destructive">
          {clr ? `${clr.code}${clr.reason ? ` (${clr.reason})` : ""}: ` : ""}
          {err}
        </p>
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
        <h3 className="text-sm font-medium text-foreground">{tGates("heading")}</h3>
        {plan.checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tGates("empty")}</p>
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
        <h3 className="text-sm font-medium text-foreground">{tReceipt("heading")}</h3>
        <CloseReceiptPanel receipt={plan.receipt} session={session} />
      </section>

      <CloseProposalPanel />
    </div>
  );
}
