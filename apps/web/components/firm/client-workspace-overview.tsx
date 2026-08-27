"use client";

// The client workspace "Home" tab — the real client record (lib/firm/reads.ts's
// loadClientById), replacing the P1 scaffold's verbatim-clientId placeholder, plus
// a client-scoped slice of the SAME queue Needs-you reads (clara.list_review_queue,
// p_scope: {client_id}) — "what does THIS client need from me", not a duplicated
// mechanism.
//
// FIX-5 (independent review, fix-required, 2026-08-27): rides lib/firm/
// use-review-queue.ts (the paginated reader) rather than a raw single-page
// listReviewQueue call — the same "silently cut list under a true count" gap
// applies here as much as the firm-wide inbox. Row_kind uses the SAME checked
// lookup as components/firm/needs-you-row.tsx (lib/firm/needs-you.ts's
// isKnownReviewQueueRowKind) rather than a second copy. N11: `created_at`
// renders in the business timezone explicitly.
// R5 (independent review, 2026-08-27 — round 2): `status` now uses the SAME
// checked lookup built for the client register (components/firm/
// client-register-list.tsx) instead of the raw DB value.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientById } from "@/lib/firm/reads";
import { isKnownReviewQueueRowKind, reviewQueueRowKey } from "@/lib/firm/needs-you";
import { useReviewQueue } from "@/lib/firm/use-review-queue";
import { businessDate } from "@/lib/business-date";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "./data-state";

export function ClientWorkspaceOverview({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspace");
  const tny = useTranslations("NeedsYou");
  const tcr = useTranslations("ClientsRegister");
  const client = useAsyncRead(() => loadClientById(sessionTokenAccessor, clientId));
  const queue = useReviewQueue({ client_id: clientId });

  const statusLabels: Record<string, string> = {
    active: tcr("statuses.active"),
    archived: tcr("statuses.archived"),
    onboarding: tcr("statuses.onboarding"),
  };

  return (
    <div className="flex flex-col gap-6">
      <DataState
        loading={client.loading}
        error={client.error}
        isEmpty={client.data === null}
        emptyMessage={t("notFoundMessage")}
      >
        {client.data ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("statusLabel")}</dt>
            <dd className="text-foreground">{statusLabels[client.data.status] ?? client.data.status}</dd>
            <dt className="text-muted-foreground">{t("createdLabel")}</dt>
            <dd className="text-foreground">{businessDate(new Date(client.data.created_at))}</dd>
          </dl>
        ) : null}
      </DataState>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("queueHeading")}</h2>
        <DataState
          loading={queue.loading}
          error={queue.error}
          isEmpty={queue.rows.length === 0}
          emptyMessage={t("queueEmpty")}
        >
          <ul className="flex flex-col gap-1 text-sm text-card-foreground">
            {queue.rows.map((row) => (
              <li key={reviewQueueRowKey(row)}>
                {isKnownReviewQueueRowKind(row.row_kind)
                  ? tny(`rowKind.${row.row_kind}`)
                  : tny("rowKind.unknown", { kind: row.row_kind })}
                {row.question_text ? ` — ${row.question_text}` : ""}
              </li>
            ))}
          </ul>
          {queue.hasMore ? (
            <button
              type="button"
              className="self-start rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
              onClick={() => void queue.loadMore()}
              disabled={queue.loadingMore || queue.busy}
            >
              {queue.loadingMore ? tny("loadingMore") : tny("loadMore")}
            </button>
          ) : null}
        </DataState>
      </div>
    </div>
  );
}
