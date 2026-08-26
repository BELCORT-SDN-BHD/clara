"use client";

// The client workspace "Home" tab — the real client record (lib/firm/reads.ts's
// loadClientById), replacing the P1 scaffold's verbatim-clientId placeholder, plus
// a client-scoped slice of the SAME queue Needs-you reads (clara.list_review_queue,
// p_scope: {client_id}) — "what does THIS client need from me", not a duplicated
// mechanism.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientById } from "@/lib/firm/reads";
import { listReviewQueue } from "@/lib/firm/needs-you";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "./data-state";

export function ClientWorkspaceOverview({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspace");
  const client = useAsyncRead(() => loadClientById(sessionTokenAccessor, clientId));
  const queue = useAsyncRead(() => listReviewQueue(sessionTokenAccessor, { client_id: clientId }));

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
            <dd className="text-foreground">{client.data.status}</dd>
            <dt className="text-muted-foreground">{t("createdLabel")}</dt>
            <dd className="text-foreground">{new Date(client.data.created_at).toLocaleDateString()}</dd>
          </dl>
        ) : null}
      </DataState>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("queueHeading")}</h2>
        <DataState
          loading={queue.loading}
          error={queue.error}
          isEmpty={(queue.data?.rows.length ?? 0) === 0}
          emptyMessage={t("queueEmpty")}
        >
          <ul className="flex flex-col gap-1 text-sm text-card-foreground">
            {(queue.data?.rows ?? []).map((row) => (
              <li key={`${row.row_kind}:${row.id}`}>
                {row.row_kind}
                {row.question_text ? ` — ${row.question_text}` : ""}
              </li>
            ))}
          </ul>
        </DataState>
      </div>
    </div>
  );
}
