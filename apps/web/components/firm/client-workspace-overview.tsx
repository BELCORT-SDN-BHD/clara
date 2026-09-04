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
// MERGE-FORWARD NOTE (PR #546, lane L2). That PR adds a `ContinueOnboardingCard` above the board
// and a `CLIENT_RECORD_CHANGED` bus subscription that re-reads the client after the rail's
// onboarding commit flips `clara.clients.status`. This branch is cut from origin/main, where
// neither `onClientRecordChanged` nor that card exists yet, so neither can be imported here. The
// seam they need is left open on purpose: `client.reload` is bound to a named const below, and
// the card's slot is the first child of the board — see the two marked comments.

import { useTranslations } from "next-intl";

import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientById } from "@/lib/firm/reads";
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

export function ClientWorkspaceOverview({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspace");
  const client = useAsyncRead(() => loadClientById(sessionTokenAccessor, clientId));
  const queue = useReviewQueue({ client_id: clientId });

  // MERGE-FORWARD SEAM (PR #546, H-50). `useAsyncRead` reads ONCE by contract, and the act that
  // flips this client's status happens in the Clara rail — a SIBLING subtree of this page — so
  // nothing here could know to re-read. #546's `useEffect(() => onClientRecordChanged(...))`
  // subscribes this reload to that announcement. Binding the reload to a named const now means
  // that effect drops in beside this line without touching anything else.
  const reloadClient = client.reload;
  void reloadClient;

  return (
    <div className="flex flex-col gap-6">
      {/* MERGE-FORWARD SLOT (PR #546): `{client.data?.status === "onboarding" ? <Continue
          OnboardingCard clientId={clientId} /> : null}` lands here, above the identity band and
          above section B's progress report — the escalation offer, then the progress. */}
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
