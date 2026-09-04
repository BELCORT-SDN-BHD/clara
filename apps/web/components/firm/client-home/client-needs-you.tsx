"use client";

// SECTION C — this client's Needs-you inbox. The counts chips from the envelope, and the rows
// as the FULL `NeedsYouRow` with its deep link AND its inline act.
//
// THE TWO QUEUE RENDERINGS ARE DIFFERENT ON PURPOSE (the orchestrator's decision 3, 裁-190).
// This is ONE client's inbox — the human is already here, in this client's workspace, and the
// act they came to perform is settling these rows. So the rows carry their inline
// Resolve/Dismiss on the queue's own `act()`-and-reload cycle. Firm Home renders the SAME rows
// as compact link-only triage, because at that altitude the page is a dispatcher across every
// client and the verb belongs to the surface that owns it.
//
// WHAT THIS REPLACES. The tab used to render each row as bare `<li>` text — `rowKind label —
// question_text`, with no link, no affordance, no badge and no count — while the firm-wide inbox
// rendered the identical rows through `NeedsYouRow`. Two renderings of one queue, one of them
// inert.
//
// THE CHIPS COME FROM `counts`, NEVER FROM `rows.length`. The envelope computes its eight counts
// over the whole population while `rows[]` is one page (lib/firm/use-review-queue.ts's header),
// so a page-length would silently under-report a busy client. `useReviewQueue` already returns
// `counts` and this tab read NEITHER it nor `sweep` before this train.
//
// THE ERROR BANNER IS THE INBOX'S OWN RULE, REUSED. `shouldShowQueueErrorBanner` decides between
// attaching a refusal to the row it belongs to and raising a section banner — the case it exists
// for is the acted-on row VANISHING from the re-read the act triggers (CLR10, "question is not
// open": someone else settled it), where a per-row attachment would go dark for exactly the
// failure that most needs to be seen.

import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { NeedsYouCounts } from "../needs-you-counts";
import { NeedsYouRow } from "../needs-you-row";
import { DataState, ErrorMessage } from "../data-state";
import { reviewQueueRowKey, shouldShowQueueErrorBanner } from "@/lib/firm/needs-you";
import type { ReviewQueueState } from "@/lib/firm/use-review-queue";
import { useState } from "react";

export function ClientNeedsYou({
  queue,
  clientName,
}: {
  /** The page owns the hook, because the Tax-tab-style `sweep`/`counts` fields and the rows all
   *  come from ONE envelope — a second `useReviewQueue` here would be a second RPC for data the
   *  page already has. */
  queue: ReviewQueueState;
  /** This client's own name, from the page's `loadClientById` read. `null` while that read is
   *  in flight — `NeedsYouRow` then falls back to the short id, never a guessed name. */
  clientName: string | null;
}) {
  const t = useTranslations("ClientWorkspace");
  const tny = useTranslations("NeedsYou");
  // The row last acted on, so a refusal attaches to IT rather than to whichever row the human
  // happens to look at next (needs-you-inbox.tsx's N13 rule).
  const [actingKey, setActingKey] = useState<string | null>(null);

  const bannerVisible = shouldShowQueueErrorBanner(queue.counts !== null, queue.error, queue.rows, actingKey);

  return (
    <section aria-labelledby="client-home-needs-you" className="flex flex-col gap-3">
      <SectionHeader level={2}>
        <span id="client-home-needs-you">{t("queueHeading")}</span>
      </SectionHeader>

      {queue.counts !== null ? <NeedsYouCounts counts={queue.counts} /> : null}
      {bannerVisible ? <ErrorMessage error={queue.error} /> : null}

      <DataState
        loading={queue.loading}
        error={queue.counts === null ? queue.error : null}
        isEmpty={queue.rows.length === 0}
        emptyMessage={t("queueEmpty")}
      >
        <ul className="flex flex-col gap-2">
          {queue.rows.map((row) => {
            const key = reviewQueueRowKey(row);
            return (
              // #550's `clientName`, supplied as the seam note said it would be — one line, and
              // nothing else changed. It is the CLIENT WHOSE WORKSPACE THIS IS, passed down
              // from the page's own `loadClientById` read rather than merged from the firm-wide
              // register the way the cross-client inbox does it: every row here is about that
              // one client by construction (the queue is scoped `{client_id}`), so a register
              // read would be a second network call to learn a name already on screen in the
              // page's `h1`. `null` only while that read is still in flight, which is the same
              // "not known yet" the prop's own contract documents — never a guessed name.
              <NeedsYouRow
                key={key}
                clientName={clientName}
                row={row}
                busy={queue.busy}
                error={actingKey === key ? queue.error : null}
                onAct={async (fn) => {
                  setActingKey(key);
                  return queue.act(fn);
                }}
              />
            );
          })}
        </ul>
        {queue.hasMore ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 self-start"
            onClick={() => void queue.loadMore()}
            disabled={queue.loadingMore || queue.busy}
          >
            {queue.loadingMore ? tny("loadingMore") : tny("loadMore")}
          </Button>
        ) : null}
      </DataState>
    </section>
  );
}
