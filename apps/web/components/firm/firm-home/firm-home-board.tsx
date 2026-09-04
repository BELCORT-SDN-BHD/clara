"use client";

// FIRM HOME — the roll-up over the four firm-altitude surfaces (map item E-1, design spec
// part 1). Until this train the route rendered a `PageHeader` and nothing else and performed
// ZERO reads: it could not name the firm, the caller's role, or one number.
//
// THE SHAPE, and where it comes from. Rox + Plain + Midday agree on one arrangement for an
// AI-native work home — a state sentence, a scoreboard whose chips navigate, a triage list, and
// a right column of record — and Xero/QuickBooks add the accounting register's own discipline:
// numbers only where the ledger owns them, and a DESIGNED caught-up state rather than a grid of
// zeros. Attio and Lightfield settle the agent question: the agent's ACTIVITY is content in the
// main column, and the agent's MOUTH stays in the rail. There is deliberately no second
// composer on this page (the rail is mounted beside it by app/(firm)/layout.tsx).
//
// EVERY TILE LINKS; NO TILE ACTS. The verb lives on the surface that owns it — the inbox
// settles a question, /activity cancels a task, the journals tab approves a draft. This page
// dispatches. That is the `needs-you-row.tsx` precedent applied one altitude up, and it is why
// the triage rows here are link-only while the SAME rows on a client's Home tab carry their
// inline act (the orchestrator's decision 3, 裁-190).
//
// THE GRID REFLOWS ON A CONTAINER QUERY, NOT A VIEWPORT ONE (decision 1, 裁-190). The shell
// puts a 224px sidebar and a 320px Clara rail either side of this column, and the rail TOGGLES:
// at a fixed 1440px viewport the content column is 832px with the rail open and 1152px with it
// closed. A `lg:` viewport breakpoint would therefore be wrong in one of those two states no
// matter which number it was tuned to. `@container` + `@3xl:` (48rem of CONTAINER inline size)
// asks the only question that matters — how wide is the space this grid actually has.
//
// WHAT IS DELIBERATELY ABSENT, each with its reason:
//   * a firm-wide close status per client — `get_close_readiness` and `list_fiscal_years` are
//     BOTH per-client (0056:2618, :2665; live bodies 0138:997, :1022). An N x 2 RPC fan-out from
//     a browser is not a design. The gaps note says so in the product's own words.
//   * statutory deadlines — `clara.statutory_deadlines` is live-empty with no grant and no verb.
//   * a firm-wide agent-receipts feed — five of `agent_receipts_visible`'s nine union arms are
//     still typed-empty stubs (map item E-2), so the tile would be near-permanently empty. It
//     stays on /activity until those shims land.
//   * any chart — every accounting series worth drawing needs a DB-owned aggregate that does not
//     exist, and `--chart-1…5` existing in the token file is not a licence to invent one.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { loadCallerContext } from "@/lib/firm/caller-context";
import { clientStatusTally, oldestWaiting } from "@/lib/firm/home-facts";
import { loadClientRegister } from "@/lib/firm/reads";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { useReviewQueue } from "@/lib/firm/use-review-queue";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState, ErrorMessage } from "../data-state";
import { SweepStatusPanel } from "../sweep-status-panel";
import { ClaraWorkingTile } from "./clara-working-tile";
import { FirmTimelineSection } from "./firm-timeline-section";
import { NeedsYouScoreboard } from "./needs-you-scoreboard";
import { OldestWaitingList } from "./oldest-waiting-list";

/** How many triage rows the dispatcher shows. Five is what fits above the fold at 1440 with the
 *  rail open, measured against the design spec's own wireframe; the footer link carries the
 *  human to the rest rather than this page growing an inbox of its own. */
const TRIAGE_ROWS = 5;

export function FirmHomeBoard() {
  const t = useTranslations("FirmHome");
  const tcr = useTranslations("ClientsRegister");

  // `clara.caller_context` — the firm's own name and the caller's role. The shell already read
  // this server-side to decide SCOPE (lib/require-firm-scope.ts), but it hands only
  // `{role_rank, is_operator}` down through `FirmScopeProvider` (lib/firm/navigation.ts's
  // `NavigationScope`), which carries no firm name. Reading it again here is one extra GET
  // against a view with no rank floor and a self-only predicate — not a second authority: this
  // read shapes a HEADING, and nothing on this page is gated on it.
  const caller = useAsyncRead(() => loadCallerContext(sessionTokenAccessor));
  const queue = useReviewQueue({});
  const register = useAsyncRead(() => loadClientRegister(sessionTokenAccessor));

  // ZERO rows and MORE THAN ONE row are both "this build cannot name the firm" — and neither is
  // silently collapsed into a name. `uq_membership_active_user` makes >1 a structural surprise;
  // the scope spine's own fail-closed reading is copied here rather than reinvented.
  const context = caller.data?.length === 1 ? (caller.data[0] ?? null) : null;

  const rows = queue.rows;
  const counts = queue.counts;
  const clients = register.data ?? [];
  const tally = clientStatusTally(clients);
  const clientNames = new Map(clients.map((client) => [client.id, client.name] as const));
  const triage = oldestWaiting(rows, TRIAGE_ROWS);

  // The identity line. The firm's NAME is the h1 once the read resolves; before that the page
  // keeps its own static label so the document always has exactly one h1 and never an h1 that
  // reads "Loading…". There is NO greeting by name: `caller_context` has no display-name column
  // at all (its six columns are pinned byte-for-byte in lib/firm/caller-context.ts), so
  // "Good morning, ⟨name⟩" would be a name this build invented.
  const heading = context?.firm_name ?? t("heading");
  const description =
    context === null
      ? undefined
      : register.loading || register.error
        ? t("roleOnly", { role: context.role })
        : t("roleAndClients", { role: context.role, clientCount: tally.total });

  const caughtUp = counts !== null && counts.needs_you === 0 && counts.needs_review === 0;

  return (
    <PageShell>
      <PageHeader title={heading} description={description} />
      {/* A failed caller read degrades the HEADING only — every section below reads for itself
          and still renders. It is shown, never swallowed: a page that quietly forgot the firm's
          name would look identical to one that never had it. */}
      {caller.error ? <ErrorMessage error={caller.error} /> : null}

      {/* The orientation sentence. OMITTED ENTIRELY while the envelope is unread — a sentence
          with a blank where a count belongs is worse than no sentence, and this one is the first
          thing a professional reads at 09:00 on a Monday. */}
      {counts !== null ? (
        <p className="enter-content max-w-prose text-sm text-muted-foreground">
          {caughtUp
            ? t("orientationClear")
            : t("orientation", { needsYou: counts.needs_you, needsReview: counts.needs_review })}
        </p>
      ) : null}

      <div className="@container">
        <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <section aria-labelledby="firm-home-needs-you" className="flex flex-col gap-3">
              <SectionHeader
                level={2}
                action={
                  <Link href="/needs-you" className="text-xs text-primary underline-offset-4 hover:underline">
                    {t("seeInbox")}
                  </Link>
                }
              >
                <span id="firm-home-needs-you">{t("needsYouHeading")}</span>
              </SectionHeader>
              <DataState
                loading={queue.loading}
                error={queue.error}
                isEmpty={counts === null}
                emptyMessage={t("needsYouUnavailable")}
              >
                {counts === null ? null : <NeedsYouScoreboard counts={counts} />}
              </DataState>

              <div className="flex flex-col gap-2">
                <SectionHeader level={3}>{t("oldestWaitingHeading")}</SectionHeader>
                <DataState
                  loading={queue.loading}
                  error={queue.error}
                  isEmpty={triage.length === 0}
                  emptyMessage={t("oldestWaitingEmpty")}
                >
                  <OldestWaitingList rows={triage} clientNames={clientNames} />
                </DataState>
              </div>
            </section>

            <ClaraWorkingTile />
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <FirmTimelineSection clientNames={clientNames} />

            {/* Reused verbatim: it renders the same `sweep` object off the same envelope this
                page already read, and returns null when the envelope carries none. */}
            <SweepStatusPanel sweep={queue.sweep} />

            <section aria-labelledby="firm-home-clients" className="flex flex-col gap-2">
              <SectionHeader level={2}>
                <span id="firm-home-clients">{tcr("heading")}</span>
              </SectionHeader>
              <DataState
                loading={register.loading}
                error={register.error}
                isEmpty={clients.length === 0}
                emptyMessage={t("clientsEmpty")}
              >
                <p className="enter-content text-sm">
                  <Link href="/clients" className="text-primary underline-offset-4 hover:underline">
                    {t("clientsLine", {
                      active: tally.active,
                      onboarding: tally.onboarding,
                      archived: tally.archived,
                    })}
                  </Link>
                </p>
                {/* A status the CHECK constraint does not admit today would otherwise vanish from
                    a line that claims to cover the register. It is named, never folded in. */}
                {tally.other > 0 ? (
                  <p className="text-xs text-muted-foreground">{t("clientsOther", { count: tally.other })}</p>
                ) : null}
              </DataState>
            </section>

            <NotBuiltNote className="text-xs">{t("notBuilt")}</NotBuiltNote>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
