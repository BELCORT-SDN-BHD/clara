"use client";

// The dry-run tie-out strip — clara.get_opening_dryrun(p_seed). Mobbin
// grounding takeaways 1-3 (docs/plan/active/mobbin-grounding-wave-2026-08-28.md
// §T2): the tie-out is a strip of DB-RETURNED terms converging on the DB's
// own signed difference (`obe_net_cents`) — a `StateBanner`, never client
// arithmetic (constraint 2); zero is quiet, nonzero is `tone="warning"`
// carrying the DB figure. N3 (fix round, rev-t2): the mobbin takeaway's own
// language is "quiet tone=success", but `BannerTone`
// (components/common/state.tsx) has no `"success"` value — the quiet state
// below is `tone="neutral"`, this file's own scope note on that wording, not
// a code change (neutral IS this house's quiet tone; adding a `"success"`
// variant for one caller was not this fix round's call to make). The
// outstanding-items-causing-the-gap table (`deltas[]`) is what makes the
// difference actionable.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { getOpeningDryrun } from "@/lib/registers/opening";
import type { OpeningDryrun, OpeningTbTargetRow } from "@/lib/registers/opening-types";
import { fmtCents } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner, EmptyState } from "@/components/common/state";
import { DataTableCard } from "@/components/common/data-table-card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataState } from "@/components/firm/data-state";

/** CB-AE2E-020 — the FOUR conditions `clara._assert_opening_tie` actually
 *  enforces (0017:3674-3697), in its own order, each a boolean over facts the DB
 *  already returned. No numeral is minted and no tie is re-derived (constraint 2):
 *  every gate is a presence/emptiness test on a DB-returned collection, or the DB's
 *  own signed `obe_net_cents` compared to zero.
 *
 *  The strip used to render ONE of them — `obe_net_cents === 0` — under the copy
 *  "ties", so a seed with no TB targets keyed at all and a trivially-nil OBE painted
 *  a quiet pass and then refused CLR31 `tie_mismatch` on Approve. Worse, it named
 *  the one gate it did render after a DIFFERENT refusal: the DB reports that arm as
 *  `obe_not_nil`, never `tie_mismatch`.
 *
 *  Gate 1 is the only one not derivable from the dry-run payload —
 *  `_opening_seed_deltas` full-joins targets against actuals, so an empty `deltas`
 *  cannot tell "no targets" from "no basis rows" — hence `targets`, which the
 *  workbench already holds, is threaded in. */
export type OpeningTieGate = {
  /** The DB's own reason token for the arm this gate belongs to, so the copy here
   *  and the refusal the human may see name the same thing. */
  reason: "tie_mismatch" | "obe_not_nil";
  key: "targetsPresent" | "allMapped" | "allTie" | "obeNil";
  passed: boolean;
};

export function openingTieGates(data: OpeningDryrun, targets: OpeningTbTargetRow[]): OpeningTieGate[] {
  return [
    { key: "targetsPresent", reason: "tie_mismatch", passed: targets.length > 0 },
    { key: "allMapped", reason: "tie_mismatch", passed: data.unmapped_labels.length === 0 },
    {
      key: "allTie",
      reason: "tie_mismatch",
      passed: data.deltas.every((d) => d.delta_debit === 0 && d.delta_credit === 0),
    },
    { key: "obeNil", reason: "obe_not_nil", passed: data.obe_net_cents === 0 },
  ];
}

export function OpeningDryrunStrip({ seedId, targets }: { seedId: string; targets: OpeningTbTargetRow[] }) {
  const t = useTranslations("OpeningCarryDown.dryrun");
  const tc = useTranslations("Common");
  // Re-keyed by seedId (React key on the caller side) rather than a manual
  // reload-on-change wire — this panel is small enough that an unmount/
  // remount on seed switch is the simplest correct thing (aging-register.tsx's
  // own precedent documents the alternative for a case that needs it).
  const { data, loading, error } = useAsyncRead(() => getOpeningDryrun(sessionTokenAccessor, seedId));

  return (
    <div className="flex flex-col gap-2" data-testid="opening-dryrun-strip">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <DataState loading={loading} error={error} isEmpty={false} emptyMessage="">
        {data ? (
          <div className="flex flex-col gap-2">
            <OpeningTieGates data={data} targets={targets} asOf={data.as_of} />
            {data.deltas.length === 0 ? (
              <EmptyState className="text-xs">{t("noDeltas")}</EmptyState>
            ) : (
              <DataTableCard>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("accountCol")}</TableHead>
                    <TableHead className="text-right">{t("targetDebitCol")}</TableHead>
                    <TableHead className="text-right">{t("targetCreditCol")}</TableHead>
                    <TableHead className="text-right">{t("actualDebitCol")}</TableHead>
                    <TableHead className="text-right">{t("actualCreditCol")}</TableHead>
                    <TableHead className="text-right">{t("deltaDebitCol")}</TableHead>
                    <TableHead className="text-right">{t("deltaCreditCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.deltas.map((d) => {
                    const off = d.delta_debit !== 0 || d.delta_credit !== 0;
                    return (
                      <TableRow key={d.account_code}>
                        <TableCell>{d.account_code}</TableCell>
                        <TableCell className="text-right">{fmtCents(d.target_debit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className="text-right">{fmtCents(d.target_credit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className="text-right">{fmtCents(d.actual_debit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className="text-right">{fmtCents(d.actual_credit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className={off ? "text-right text-warning" : "text-right"}>{fmtCents(d.delta_debit, tc("centsUnsafe"))}</TableCell>
                        <TableCell className={off ? "text-right text-warning" : "text-right"}>{fmtCents(d.delta_credit, tc("centsUnsafe"))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </DataTableCard>
            )}
            {data.unmapped_labels.length > 0 ? (
              <StateBanner tone="info" title={t("unmappedTitle")}>
                <ul className="list-disc pl-4">
                  {data.unmapped_labels.map((u) => (
                    <li key={u.line_key}>{u.source_label ?? u.line_key}</li>
                  ))}
                </ul>
              </StateBanner>
            ) : null}
            {data.missing_must_asks.length > 0 ? (
              <StateBanner tone="warning" title={t("missingMustAsksTitle")}>
                <ul className="list-disc pl-4">
                  {data.missing_must_asks.map((m) => (
                    <li key={m.item_key}>{m.question}</li>
                  ))}
                </ul>
              </StateBanner>
            ) : null}
          </div>
        ) : null}
      </DataState>
    </div>
  );
}

function OpeningTieGates({ data, targets, asOf }: { data: OpeningDryrun; targets: OpeningTbTargetRow[]; asOf: string }) {
  const t = useTranslations("OpeningCarryDown.dryrun");
  const tc = useTranslations("Common");
  const gates = openingTieGates(data, targets);
  const allPassed = gates.every((g) => g.passed);
  return (
    <StateBanner tone={allPassed ? "neutral" : "warning"} title={t("asOf", { date: asOf })}>
      <p>{allPassed ? t("readyToApprove") : t("notReadyToApprove")}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {gates.map((g) => (
          <li key={g.key} className="flex items-start gap-1.5">
            <span aria-hidden="true">{g.passed ? "✓" : "✕"}</span>
            <span>
              <span className="sr-only">{g.passed ? t("gatePassed") : t("gateFailed")} — </span>
              {g.key === "obeNil" && !g.passed
                ? t("gate.obeNilFailed", { amount: fmtCents(data.obe_net_cents, tc("centsUnsafe")) })
                : t(`gate.${g.key}`)}
              <span className="ml-1.5 font-mono text-xs opacity-70">{g.reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </StateBanner>
  );
}
