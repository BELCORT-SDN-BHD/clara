"use client";

// The client workspace "Home" tab — a SITUATION BOARD for one client, in accounting order.
//
// WHAT IT WAS. Ninety-six lines rendering a two-row `<dl>` (status, created_at) and a bare
// `<li>` text list with no link, no badge and no count — while nine client-scoped read modules
// the app already owns sat unused, and the firm-wide inbox rendered the SAME queue rows through
// `NeedsYouRow` with their deep links and inline acts.
//
// THE ORDER IS THE WALK ORDER, NOT SCREEN ORDER. Identity → what is waiting → the document and
// coding pipeline → bank → close → history: intake before bank, bank before settle, settle
// before reconcile, and only then close. An onboarding client is the one exception, and its
// exception is the whole point — for a client mid-interview the plan outranks everything, so
// section B lifts directly under the identity band and is ABSENT otherwise.
//
// EVERY SECTION READS FOR ITSELF, and that is a correctness property rather than a style. One
// failed read must leave every other section's real numbers on screen: a board that blanks on a
// single failure reads as "this client has nothing outstanding", which is the most expensive
// possible way to be wrong here.
//
// FIX-5 / R5 (independent review, 2026-08-27) SURVIVE THIS REBUILD. The queue still rides
// `lib/firm/use-review-queue.ts` (the paginated reader) rather than a raw single-page call, and
// `status` still uses the client register's own checked label lookup rather than the raw DB
// value — both now live in the sections that render them.
//
// #546 (lane L2) IS MERGED IN, WHOLE. That PR's `ContinueOnboardingCard` and its
// `CLIENT_RECORD_CHANGED` bus subscription both live here unchanged in behaviour — the card
// above the board, the subscription re-reading the client after the rail's onboarding commit
// flips `clara.clients.status`. This train was built against origin/main before that PR landed
// and left the two seams open for it deliberately; the merge took both sides rather than
// either. The one thing that did NOT survive is #546's local `statusLabels` map, and only
// because the status badge moved into the identity band, which does the same checked lookup
// against the same `ClientsRegister.statuses.*` vocabulary.

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/common/section-header";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientById } from "@/lib/firm/reads";
import { listSessionsForCaller } from "@/lib/clara/api";
import { selectOwnSession } from "@/lib/clara/useActiveThread";
import { focusRail, onClientRecordChanged } from "@/lib/command/bus";
import { useReviewQueue } from "@/lib/firm/use-review-queue";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ClientBankSummary } from "./client-home/client-bank-summary";
import { ClientCloseSummary } from "./client-home/client-close-summary";
import { ClientDocsBacklog } from "./client-home/client-docs-backlog";
import { ClientIdentityBand } from "./client-home/client-identity-band";
import { ClientLastActivity } from "./client-home/client-last-activity";
import { ClientNeedsYou } from "./client-home/client-needs-you";
import { ClientOnboardingProgress } from "./client-home/client-onboarding-progress";
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
  const client = useAsyncRead(() => loadClientById(sessionTokenAccessor, clientId));
  const queue = useReviewQueue({ client_id: clientId });

  // H-50 (#546) — `useAsyncRead` reads ONCE by contract (its own header: "a NEW loader identity
  // ALONE never re-triggers a reload… must either React-key itself by those ids or call
  // reload() explicitly"). The act that changes this client's status happens in the Clara rail,
  // a SIBLING subtree of this page's own, so nothing here could know to re-read: the status
  // badge in the identity band below would keep saying "Onboarding" for an activated client
  // until a hard reload. The card announces on the bus after a SUCCESSFUL act; this re-reads.
  // It never trusts a value from the event — there is none to trust.
  //
  // KEPT WHOLE THROUGH THIS TRAIN'S REBUILD. The seam was written for it: the reload is bound
  // to a named const, the subscription is unchanged, and the section that renders the status
  // (the identity band) is downstream of the same `client` read, so the re-read still reaches
  // it. The `statusLabels` map #546 declared beside this effect is gone from HERE and only from
  // here — the identity band owns that lookup now, using the SAME checked register vocabulary
  // (`ClientsRegister.statuses.*`) rather than a second copy of it.
  const reloadClient = client.reload;
  useEffect(
    () => onClientRecordChanged((detail) => {
      if (detail.clientId === clientId) void reloadClient();
    }),
    [clientId, reloadClient],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* #546's ask, kept exactly where it was and where this train's seam note said it would
          land: ABOVE the identity band and above section B's progress report — the escalation
          offer first, then the progress. Offered ONLY while the client is genuinely in
          onboarding, read from the client's own DB-owned status rather than from the presence
          of a plan. Section B deliberately carries no continue-affordance of its own, so this
          stays the one entrance to a governed run. */}
      {client.data?.status === "onboarding" ? <ContinueOnboardingCard clientId={clientId} /> : null}

      <DataState
        loading={client.loading}
        error={client.error}
        isEmpty={client.data === null}
        emptyMessage={t("notFoundMessage")}
      >
        {client.data ? (
          <div className="flex flex-col gap-6">
            <ClientIdentityBand clientId={clientId} client={client.data} />
            <ClientOnboardingProgress clientId={clientId} status={client.data.status} />

            <div className="@container">
              <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-6">
                  <ClientNeedsYou queue={queue} />
                  <ClientDocsBacklog clientId={clientId} />
                </div>
                <div className="flex min-w-0 flex-col gap-6">
                  <ClientBankSummary clientId={clientId} />
                  <ClientCloseSummary clientId={clientId} />
                  <ClientLastActivity clientId={clientId} />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DataState>
    </div>
  );
}
