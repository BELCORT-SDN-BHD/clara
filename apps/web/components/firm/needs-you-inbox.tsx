"use client";

// The cross-client Needs-you inbox (owner ruling Q3) — clara.list_review_queue at
// firm altitude (p_scope: {}, this build's coordinator ruling: "the ONE existing
// paginated multi-source queue... never a hand-built union"). Hydrate-never-trust:
// every resolve/dismiss re-reads the queue afterward.
//
// FIX-5 (independent review, fix-required, 2026-08-27): rides lib/firm/
// use-review-queue.ts — a single unpaginated page left the counts chips showing
// TRUE firm-wide totals over a list silently cut to 50 rows. `Load more` now
// wires the RPC's own `next_cursor` verbatim; `hasMore` is derived honestly from
// page size (see that module's header for why, not `next_cursor` presence).
//
// N13 (independent review, 2026-08-27): a resolve/dismiss REFUSAL is attached to
// the SPECIFIC row that was acted on (`actingKey`) — a page-level banner would
// misattribute it to whichever row a human happens to be looking at. Three
// mutually-exclusive error placements share the ONE `error` state
// useReviewQueue exposes:
//   - no data has EVER loaded (`!hasData`): the full DataState error page — there
//     is nothing else to show.
//   - the last action was a specific ROW's resolve/dismiss AND that row is STILL
//     PRESENT after the re-read (`actingKey` set and attached): the error
//     renders ONLY inside that row.
//   - anything else (loadMore, or a row action whose row VANISHED on re-read —
//     R1 below): a banner above the still-real list.
//
// R1 (independent review, fix-required, 2026-08-27 — round 2): the most common
// refusal on this queue is "someone else already settled it" (CLR10, "question
// is not open"), which makes the acted-on row DISAPPEAR from the very re-read
// act() triggers. The original per-row-only attachment went dark for exactly
// this case (actingKey pointed at a row no longer in `rows`, and the banner
// required actingKey===null) — a human would see the row vanish with NO error
// anywhere and reasonably (wrongly) conclude their OWN resolution took effect.
// lib/firm/needs-you.ts's `shouldShowQueueErrorBanner` now falls back to the
// banner whenever the acting row is no longer attached, not only when nothing
// was acted on.

// P2 · dialog-close-polarity (the verified sweep, 2026-09-04). `DataState`'s
// `loading` prop unmounted the WHOLE affordance list on every reload — including
// the reload an act's own `act()` triggers — so a refusal destroyed the inline
// form the human had just typed into. `ClosePrepHoldPanel`'s FIX-1 settled the
// shape: gate ONLY on "no data has ever arrived". A reload over data that is
// already on screen leaves the list mounted, and the per-row error attribution
// above is what tells the human what happened.
//
// E-3 (CB-AE2E-026): the queue is CROSS-CLIENT, and until this train no row
// named its client. The register read below is the same firm-wide
// `loadClientRegister` NeedsYouGaps already performs (needs-you-gaps.tsx:34) —
// merged CLIENT-SIDE onto `row.client_id`, the join lib/firm/reads.ts's own
// header sanctions. A client absent from the register renders as its short id,
// never a guessed name, and the queue never waits on this read: rows render
// with their ids the moment the queue lands.
//
// E-3: the sweep panel now sits BELOW the queue. It is context about an
// unattended pass, not the queue itself, and it was the first thing under the
// counts chips — above the work.

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useReviewQueue } from "@/lib/firm/use-review-queue";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientRegister } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { reviewQueueRowKey, shouldShowQueueErrorBanner } from "@/lib/firm/needs-you";
import { Button } from "@/components/ui/button";
import { DataState, ErrorMessage } from "./data-state";
import { NeedsYouCounts } from "./needs-you-counts";
import { NeedsYouRow } from "./needs-you-row";
import { NeedsYouGaps } from "./needs-you-gaps";
import { SweepStatusPanel } from "./sweep-status-panel";

export function NeedsYouInbox() {
  const t = useTranslations("NeedsYou");
  const { rows, counts, sweep, loading, loadingMore, busy, error, hasMore, act, loadMore } = useReviewQueue({});
  const [actingKey, setActingKey] = useState<string | null>(null);

  // A SEPARATE, NON-BLOCKING READ. Its failure is not the queue's failure: the
  // rows still render, each naming its client by short id. Nothing here retries
  // and nothing here blocks.
  // THE ONE FIRM-WIDE REGISTER READ ON THIS PAGE. `NeedsYouGaps` used to issue
  // its own beside this one, so `/needs-you` called `clara.clients` twice on
  // every load; it now takes the rows as props (review-550). One read, two
  // consumers, one judgement about what a failure means.
  const register = useAsyncRead(() => loadClientRegister(sessionTokenAccessor));
  const clientRows = register.data ?? [];
  const clientsUnavailable = register.data === null && register.error !== null;
  const clientNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const client of register.data ?? []) names.set(client.id, client.name);
    return names;
  }, [register.data]);

  const hasData = counts !== null;

  // T0 seam (port-wave plan §3.2): ONE generic act, scoped to whichever row's
  // key the caller closes over below — replaces the former handleResolve/
  // handleDismiss pair now that the door call itself lives inside each
  // registered affordance (components/firm/needs-you-affordances.tsx), not
  // here. Same act()-and-reload contract as before; only the door(s) invoked
  // inside `fn` are no longer this file's business.
  const handleAct = async (rowKey: string, fn: () => Promise<void>): Promise<boolean> => {
    setActingKey(rowKey);
    return act(fn);
  };
  const handleLoadMore = () => {
    setActingKey(null); // any resulting error is now general, not row-attributed
    void loadMore();
  };

  const showBanner = shouldShowQueueErrorBanner(hasData, error, rows, actingKey);

  return (
    <div className="flex flex-col gap-4">
      {counts ? <NeedsYouCounts counts={counts} /> : null}
      {showBanner ? <ErrorMessage error={error} /> : null}
      <DataState
        // P2 fix: `!hasData && loading`, never a bare `loading`. See this file's
        // header — a reload over data already on screen must not unmount the
        // affordances, because one of them is mid-edit whenever an act refuses.
        loading={!hasData && loading}
        error={hasData ? null : error}
        isEmpty={rows.length === 0}
        emptyMessage={t("emptyMessage")}
      >
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const rowKey = reviewQueueRowKey(row);
            return (
              <NeedsYouRow
                key={rowKey}
                row={row}
                clientName={row.client_id === null ? null : (clientNames.get(row.client_id) ?? null)}
                busy={busy}
                error={actingKey === rowKey ? error : null}
                onAct={(fn) => handleAct(rowKey, fn)}
              />
            );
          })}
        </ul>
        {hasMore ? (
          // P3 polish: the <Button> primitive, not a hand-rolled bordered
          // <button> — same act, same affordance, but now the same press
          // feedback, disabled treatment and focus ring as every other
          // secondary control in the product.
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 self-start"
            onClick={handleLoadMore}
            disabled={loadingMore || busy}
          >
            {loadingMore ? t("loadingMore") : t("loadMore")}
          </Button>
        ) : null}
      </DataState>
      <NeedsYouGaps clients={clientRows} clientsUnavailable={clientsUnavailable} />
      {/* T7 (port-wave plan §4/§5) — the sweep-runs state, from the SAME
          envelope `counts`/`rows` above already read; zero extra call. Moved
          BELOW the queue (E-3): it is context about an unattended pass, not the
          work, and it used to sit between the counts chips and the first row. */}
      <SweepStatusPanel sweep={sweep} />
    </div>
  );
}
