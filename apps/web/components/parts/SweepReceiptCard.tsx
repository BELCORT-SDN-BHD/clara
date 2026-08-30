"use client";

// 裁-20 — the sweep-receipt card, upgraded from an id-only summary to a rich
// hydrated card (docs/plan/active/mohe-grill-rulings-2026-08-28.md:268-272,
// owner-ruled to land INSIDE the P6 wire bump, no separate train).
//
// THIS KIND NEEDED NO WIRE CHANGE. `SweepReceiptPart` has been a member of the
// live union since the port (`{ type: "sweep_receipt"; run_id: string }`), and
// Clara has been posting it into a thread whenever a sweep finalizes. What was
// missing was never the part — it was the card: the part rendered through
// PartRenderer's generic `SUMMARY_TYPES` bucket as one labelled id and nothing
// else. So this file ships alongside the four v16 cards rather than as part of
// them, and it changes nothing in lib/parts/types.ts.
//
// AND THIS CARD IS THE ONLY POSSIBLE HOME FOR THE ACKNOWLEDGE CONTROL, which is
// why 裁-20 exists at all. Neither `clara.sweep_runs` nor `clara.sweep_run_items`
// carries a human SELECT policy (owner-only RLS on both), `list_sweep_runs` does
// not exist, and `list_review_queue`'s own `sweep` envelope carries booleans and
// timestamps but NEVER a run id. So there is no browsable list of sweep runs
// anywhere in the product, and the queue-altitude panel
// (components/firm/sweep-status-panel.tsx) genuinely cannot host a control that
// needs an id it never receives. A run id reaches a human through exactly one
// channel: this part. `get_sweep_run(p_run)` and `acknowledge_sweep_run(p_run,
// p_op_key)` are real, callable doors FOR THAT id.
//
// EVERY FIGURE HERE IS A DB COLUMN, PRINTED (hard constraint 2). The five
// counters are five separate columns the sweep itself wrote, and 0108's own
// comment on `posted_count` says why it is a fourth counter rather than a fold
// into `drafted_count`: "folding would make a posted row indistinguishable from
// a drafted one in the run summary". A card that summed them, or reconciled them
// against `expected_count`, would be doing exactly the arithmetic the schema
// split apart. Nothing below adds, subtracts or percentages anything.

import { useTranslations } from "next-intl";

import { Badge } from "./PartBadge";
import { PartSummaryCard } from "./PartSummaryCard";
import { FactRows, HydrateState, MalformedPart, usableId } from "./PartCardShell";
import { Button } from "@/components/ui/button";
import { businessDateTime } from "@/lib/business-date";
import { useHydratedPart } from "@/lib/parts/hooks";
import { threadActionOpKey, useThreadActionCoordinator } from "@/lib/parts/thread-action-coordinator";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getSweepRun } from "@/lib/coding/reads";
import { acknowledgeSweepRun } from "@/lib/coding/doors";
import type { SweepRunDetail, SweepRunItemRow } from "@/lib/coding/types";
import type { SweepReceiptPart } from "@/lib/parts/types";

/** An item's outcome decides its tone, and the mapping is DELIBERATELY
 *  fail-soft rather than exhaustive. `sweep_run_items.outcome`'s CHECK has been
 *  widened twice and never narrowed (0108 added `posted`, 0151 added
 *  `refused_concurrency`), so an outcome this build has never seen must render
 *  as a neutral chip carrying the DB's own spelling — never crash, and never be
 *  silently bucketed as something it is not. */
function outcomeTone(outcome: string): "info" | "warning" | "neutral" {
  if (outcome === "drafted" || outcome === "posted") return "info";
  if (outcome === "refused_budget" || outcome === "refused_concurrency" || outcome === "refused_attempts") return "warning";
  return "neutral";
}

/** The audited sweep-run receipt. Hydrates `clara.get_sweep_run(run_id)` on
 *  mount and offers the bookkeeper+ `acknowledge_sweep_run` on a FINALIZED run.
 *
 *  THE GATE IS THE DOOR'S OWN, READ FROM THE HYDRATE. `acknowledge_sweep_run`
 *  refuses CLR29 `not_finalized` while `state <> 'finalized'` (0011:2802-2805),
 *  so that is the one precondition this card mirrors — from `row.state`, which
 *  it just re-read, never from anything the part remembered. The button is
 *  RENDERED AND DISABLED rather than hidden, with the reason beside it: gating
 *  shapes, never hides.
 *
 *  ALREADY-ACKNOWLEDGED IS A SECOND, DIFFERENT GATE, AND IT IS NOT A REFUSAL THIS
 *  CARD INVENTED. The live body is idempotent there — `if r.acknowledged_at is
 *  null then update ... end if` (0011:2806-2808) — so a second call succeeds and
 *  changes nothing. Offering a control that provably does nothing is not honest,
 *  so the button is disabled once `acknowledged_at` is set and the DB's own
 *  record of who acknowledged it, and when, is rendered in its place. That is a
 *  fact the row carries, not a precondition invented here.
 *
 *  IT DOES NOT MIRROR THE CLR03 AGENT-IDENTITY ARM. The door refuses an agent
 *  credential outright (0011:2790-2793); this card has no way to know what
 *  identity the session carries, so it never guesses — a human whose credential
 *  the door rejects gets the refusal verbatim through `act`'s sticky-refusal
 *  path, which is the only place that verdict can honestly be made.
 *
 *  THE LINK goes to the firm's Needs-you queue, where `SweepStatusPanel` renders
 *  the sweep's own queue-altitude state. There is no per-run route to point at
 *  and this card does not pretend otherwise. */
export function SweepReceiptCard({ part }: { part: SweepReceiptPart }) {
  const t = useTranslations("Clara.parts.sweepReceipt");
  const tc = useTranslations("Clara.parts.common");
  const addressable = usableId(part.run_id);
  // The ENVELOPE, not the detail — see HydrateState's caller contract in
  // ./PartCardShell.tsx. `SweepRunDetail` is ITSELF `{...} | null` (the live
  // body returns SQL NULL for a run this session cannot see), so without the
  // wrapper "no such run" and "still loading" would be the same value.
  const state = useHydratedPart<{ row: SweepRunDetail }>(addressable ? sessionTokenAccessor : null, async (s) => ({
    row: await getSweepRun(part.run_id, { session: s }),
  }));
  const actions = useThreadActionCoordinator();

  if (!addressable) return <MalformedPart kind="sweep_receipt" fields={["run_id"]} />;

  const detail = state.data?.row ?? null;
  const run = detail?.run ?? null;
  const items: SweepRunItemRow[] = detail?.items ?? [];
  const finalized = run?.state === "finalized";
  const acknowledged = run?.acknowledged_at != null;
  const actionBusy = state.busy || actions.busy;
  const actionUnavailable = actions.callerId === null;

  return (
    <PartSummaryCard
      title={t("title")}
      rows={[[t("runLabel"), part.run_id]]}
      link={{ href: "/needs-you", label: t("link") }}
    >
      <HydrateState state={state} hasRow={run !== null} />
      {run ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={finalized ? "info" : "neutral"}>{run.state}</Badge>
            <span className="text-xs text-muted-foreground">{businessDateTime(run.window_started_at)}</span>
          </div>

          {/* THE FIVE COUNTERS — five DB columns, five labelled rows, printed as
              written. `String(...)` and nothing else: no locale formatting, no
              total, no "N of M". */}
          <FactRows
            rows={[
              [t("expectedLabel"), String(run.expected_count)],
              [t("draftedLabel"), String(run.drafted_count)],
              [t("postedLabel"), String(run.posted_count)],
              [t("skippedLabel"), String(run.skipped_count)],
              [t("refusedLabel"), String(run.refused_count)],
            ]}
          />
          <FactRows
            rows={[
              [t("windowEndedLabel"), run.window_ended_at ? businessDateTime(run.window_ended_at) : null],
              [t("finalizedAtLabel"), run.finalized_at ? businessDateTime(run.finalized_at) : null],
              [t("acknowledgedByLabel"), run.acknowledged_by],
              [t("acknowledgedAtLabel"), run.acknowledged_at ? businessDateTime(run.acknowledged_at) : null],
            ]}
          />

          {items.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t("itemsLabel")}</span>
              <ul className="flex flex-col gap-1">
                {items.map((item) => (
                  <li key={`${item.run_id}:${item.filing_id}`} className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone={outcomeTone(item.outcome)}>{item.outcome}</Badge>
                    <span className="wrap-anywhere text-muted-foreground">{item.filing_id}</span>
                    {/* `refusal_token` is caller-shaped jsonb with no per-outcome
                        schema — never walked (V16Cards.tsx header rule 2). */}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <Button
              type="button"
              size="sm"
              className="w-fit"
              onClick={() => {
                if (!run) return;
                const runId = run.id;
                void actions.runOnce(async (callerId) => {
                  await state.act(async () => {
                    const operationKey = await threadActionOpKey({
                      callerId,
                      objectType: "sweep-run",
                      objectId: runId,
                      action: "acknowledge-sweep-run",
                    });
                    await acknowledgeSweepRun(runId, operationKey, { session: sessionTokenAccessor });
                  });
                });
              }}
              disabled={actionBusy || actionUnavailable || !finalized || acknowledged}
            >
              {actionBusy ? tc("submitting") : t("acknowledge")}
            </Button>
            {!finalized ? <p className="text-xs text-muted-foreground">{t("acknowledgeBlockedNotFinalized")}</p> : null}
            {finalized && acknowledged ? <p className="text-xs text-muted-foreground">{t("acknowledgeAlreadyDone")}</p> : null}
          </div>
        </div>
      ) : null}
    </PartSummaryCard>
  );
}
