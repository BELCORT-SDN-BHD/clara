"use client";

// T1 — `get_close_readiness` (port-wave-plan §4 T1): "the DB's own verdict…
// drawer-2 gates fail-closed-with-attestation per ADR-065/E-R2 — render,
// never pre-empt." This panel computes NO aggregate ready/not-ready boolean
// — the DB returns none, and inventing one here would be exactly the
// client-side pre-emption the brief forbids. `readiness`/`err`/`clr` are
// hydrated by the PARENT (ClosePlanPanel), the same M1 lift ClosePage already
// uses for the fiscal-year picker, so an act's reload refreshes readiness in
// lockstep with the plan and receipt panels. The 14-row catalog
// (close_gate_checks) is static reference data this panel fetches once on
// its own — never re-triggered by an act — purely to show a human-readable
// title beside get_close_readiness's bare check_key (a real second read,
// joined client-side; nothing invented).

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useHydratedPart } from "@/lib/parts/hooks";
import { getCloseGateCatalog } from "@/lib/close/api";
import type { CloseReadiness, GateState } from "@/lib/close/types";
import type { SessionTokenAccessor } from "@/lib/session";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";

const STATE_VARIANT: Record<GateState, "default" | "destructive" | "outline" | "secondary"> = {
  pass: "default",
  fail: "destructive",
  unknown: "outline",
  error: "destructive",
  advisory: "secondary",
};

export function CloseReadinessPanel({
  readiness,
  loading,
  err,
  session,
}: {
  readiness: CloseReadiness | null;
  loading: boolean;
  err: string | null;
  session: SessionTokenAccessor;
}) {
  const t = useTranslations("ClientClose.readiness");
  const catalog = useHydratedPart(session, (s) => getCloseGateCatalog({ session: s }));

  if (err) return <StateBanner tone="error">{err}</StateBanner>;
  if (loading && !readiness) return <LoadingState>{t("loading")}</LoadingState>;
  if (!readiness) return null;
  if (catalog.err) return <StateBanner tone="error">{catalog.err}</StateBanner>;
  if (!catalog.data) return <LoadingState>{t("loading")}</LoadingState>;

  const byKey = new Map(readiness.gates.map((g) => [g.check_key, g]));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t("runState")}: {readiness.run_state ?? t("noRun")}</span>
        {readiness.fy_end_source ? <span>· {t("fyEndSource")}: {readiness.fy_end_source}</span> : null}
      </div>
      {catalog.data.length === 0 ? (
        <EmptyState>{t("catalogEmpty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-1">
          {catalog.data.map((c) => {
            const gate = byKey.get(c.check_key);
            return (
              <li key={c.check_key} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("drawer")} {c.drawer}</span>
                <span className="font-medium text-card-foreground">{c.title}</span>
                {gate ? (
                  <>
                    <Badge variant={STATE_VARIANT[gate.state]}>{gate.state}</Badge>
                    <Badge variant={gate.attested ? "default" : "outline"}>{gate.attested ? t("attested") : t("notAttested")}</Badge>
                  </>
                ) : (
                  <Badge variant="outline">{t("notYetMeasured")}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
