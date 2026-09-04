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

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientById } from "@/lib/firm/reads";
import { listSessionsForCaller } from "@/lib/clara/api";
import { selectOwnSession } from "@/lib/clara/useActiveThread";
import { focusRail, onClientRecordChanged } from "@/lib/command/bus";
import { isKnownReviewQueueRowKind, reviewQueueRowKey } from "@/lib/firm/needs-you";
import { useReviewQueue } from "@/lib/firm/use-review-queue";
import { businessDate } from "@/lib/business-date";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/common/section-header";
import { DataState } from "./data-state";

/**
 * The owner's "fullscreen onboarding" ask, built the honest way.
 *
 * THE TARGET NEEDS NOTHING NEW. `app/(full)/clients/[clientId]/clara/[threadId]` already
 * mounts the same `ClaraThreadView` — and therefore the same onboarding checklist card — that
 * the rail does; the rail already builds exactly this href. What the Home tab lacks is the
 * thread id.
 *
 * AND IT IS RESOLVED BY A READ ONLY. `useActiveThreadId` — the hook the rail uses — CREATES a
 * session when it finds none, and the rail is mounted on this very page: a second caller of
 * that hook would race it and could mint a duplicate thread for the same (caller, client),
 * after which the rail and this link could point at two different threads. So this reads the
 * caller's own session list and SELECTS through the rail's own `selectOwnSession` predicate,
 * with no create. When the read finds the rail's thread, the control is a real link to the
 * full-screen route; when it does not (or the read failed) the control opens the rail in
 * place, which is the same card at the other altitude. Neither arm is a claim about a thread
 * nobody saw.
 *
 * NO AUTO-REDIRECT, deliberately. `BeginOnboardingCard`'s own header records the house
 * precedent — "no auto-navigation: the human decides when to move" — and a redirect would make
 * this client's other eight workspace tabs unreachable for the whole of onboarding.
 */
function ContinueOnboardingCard({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientOnboarding.card");
  const pathname = usePathname();
  const thread = useAsyncRead(async () => {
    const { sessions, callerSubject } = await listSessionsForCaller(sessionTokenAccessor);
    return selectOwnSession(sessions, callerSubject, clientId)?.id ?? null;
  });

  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-clara/40 bg-clara-muted p-3">
      <SectionHeader level={2}>{t("continueOnboarding")}</SectionHeader>
      <p className="text-sm text-secondary-ink">{t("continueOnboardingBody")}</p>
      {thread.loading ? (
        <p className="text-xs text-secondary-ink">{t("continueOnboardingResolving")}</p>
      ) : thread.data ? (
        <Link
          href={`/clients/${clientId}/clara/${thread.data}?from=${encodeURIComponent(pathname)}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("continueOnboarding")}
        </Link>
      ) : (
        <>
          <Button type="button" size="sm" onClick={() => focusRail({ query: "", source: "inbox" })}>
            {t("continueOnboarding")}
          </Button>
          <p className="text-xs text-secondary-ink">{t("continueOnboardingUnavailable")}</p>
        </>
      )}
    </div>
  );
}

export function ClientWorkspaceOverview({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspace");
  const tny = useTranslations("NeedsYou");
  const tcr = useTranslations("ClientsRegister");
  const client = useAsyncRead(() => loadClientById(sessionTokenAccessor, clientId));
  const queue = useReviewQueue({ client_id: clientId });

  // H-50 — `useAsyncRead` reads ONCE by contract (its own header: "a NEW loader identity ALONE
  // never re-triggers a reload… must either React-key itself by those ids or call reload()
  // explicitly"). The act that changes this client's status happens in the Clara rail, a
  // SIBLING subtree of this page's own, so nothing here could know to re-read: the status line
  // below kept saying "Onboarding" for an activated client until a hard reload. The card
  // announces on the bus after a SUCCESSFUL act; this re-reads. It never trusts a value from
  // the event — there is none to trust.
  const reloadClient = client.reload;
  useEffect(
    () => onClientRecordChanged((detail) => {
      if (detail.clientId === clientId) void reloadClient();
    }),
    [clientId, reloadClient],
  );

  const statusLabels: Record<string, string> = {
    active: tcr("statuses.active"),
    archived: tcr("statuses.archived"),
    onboarding: tcr("statuses.onboarding"),
  };

  return (
    <div className="flex flex-col gap-6">
      {/* The owner's ask — offered ONLY while the client is genuinely in onboarding, and read
          from the client's own DB-owned status rather than from the presence of a plan. */}
      {client.data?.status === "onboarding" ? <ContinueOnboardingCard clientId={clientId} /> : null}

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
        <SectionHeader level={2}>{t("queueHeading")}</SectionHeader>
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
      </div>
    </div>
  );
}
