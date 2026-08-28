"use client";

// T11 — the in-thread onboarding checklist card (port-wave-plan-2026-08-28.md
// §4 T11, §5's Clara-raised-card column; R7, mobbin-grounding-wave-2026-08-28.md
// §T11). R7's ruling and its mobbin grounding are BOTH explicit: a STATEFUL
// CARD INLINE IN THE MESSAGE STREAM (the Manus "task progress" precedent — an
// N/N counter of DB-read completed-over-total, checkmarks that flip as steps
// complete, ONE card, never a side panel/drawer/canvas under any name, no
// wizard pages). This card is mounted directly inside `ClaraThreadView`
// (both the docked rail and the escalated full-screen thread share the one
// component, per that file's own header) — never a `/onboarding` route.
//
// WIRE-PART NOTE (owed to P6, not built here): the mobbin grounding's own
// flag (§T11, item 5) says the actual wire-format addition — a new `ClaraPart`
// variant carried by `chatTurn` — is P6's four-part wire bump to specify
// (part2 §8.1), not this train's. This card is therefore built as a
// DB-HYDRATED card (hydrate-never-trust, `useHydratedPart`) keyed on the
// session's active onboarding plan — reading `clara.onboarding_plans` /
// `clara.onboarding_plan_items` directly (both direct RLS-scoped table reads;
// lib/onboarding/types.ts's header has the grant/policy citations) — NOT a
// `parts[]` member. When P6 lands the wire bump, this card's own read becomes
// the hydrate target for that new part type; nothing here needs to change to
// make that swap.
//
// SCOPE: begin_client_onboarding does not take an existing client id (it
// MINTS a brand-new client), so it is the one door offered at FIRM altitude
// (`clientId` undefined — no client workspace to scope a plan read to yet).
// The other four doors are client-scoped and render once `clientId` is
// known. This split is a judgement call recorded here because no needs-you
// row exists to signal "begin an onboarding" any other way (rung-0 census:
// `list_review_queue` emits exactly eight row_kinds, none named for an
// onboarding plan item or a begin affordance — REVIEW_QUEUE_ROW_KINDS,
// lib/firm/needs-you.ts) and no `/onboarding` route may exist (R7) — this
// card is the ONLY surface for all five doors in the whole product today.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  beginClientOnboarding,
  bootstrapClientPlan,
  cancelClientOnboarding,
  commitClientOnboarding,
  getMostRecentOnboardingPlan,
  getOnboardingClient,
  listOnboardingPlanItems,
  resolveOnboardingPlanItem,
} from "@/lib/onboarding/api";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { OnboardingClientRow, OnboardingPlanItemRow, OnboardingPlanRow } from "@/lib/onboarding/types";
import { OnboardingDoorDialog } from "./OnboardingDoorDialog";
import { OnboardingItemRow } from "./OnboardingItemRow";

/** The one entry point `ClaraThreadView` mounts. `clientId` decides the
 *  shape — see this file's own header for why. */
export function OnboardingChecklistCard({
  clientId,
  session,
}: {
  clientId?: string;
  session: SessionTokenAccessor;
}) {
  if (!clientId) return <BeginOnboardingCard session={session} />;
  return <ClientOnboardingCard clientId={clientId} session={session} />;
}

type Loaded =
  | { kind: "no_client" }
  | { kind: "no_plan"; client: OnboardingClientRow }
  | { kind: "plan"; client: OnboardingClientRow | null; plan: OnboardingPlanRow; items: OnboardingPlanItemRow[] };

async function loadClientOnboarding(clientId: string, s: SessionTokenAccessor): Promise<Loaded> {
  const client = await getOnboardingClient(clientId, { session: s });
  if (!client) return { kind: "no_client" };
  const plan = await getMostRecentOnboardingPlan(clientId, { session: s });
  if (!plan) return { kind: "no_plan", client };
  const items = await listOnboardingPlanItems(plan.id, { session: s });
  return { kind: "plan", client, plan, items };
}

/** `resolve_onboarding_plan_item` counts an item "completed" toward Q9's
 *  DB-read N/N counter law once it has left `pending` — every non-pending
 *  state carries a non-null `answered_at` (0017:1059-1063's own CHECK), so
 *  this is a fact the DB already recorded, never a client-side derivation of
 *  progress (mobbin-grounding-wave-2026-08-28.md §T11 takeaway 2: "a
 *  completed-count over the plan's own item total, both DB-read values —
 *  never a client-computed percentage"). */
function completedCount(items: OnboardingPlanItemRow[]): number {
  return items.filter((i) => i.state !== "pending").length;
}

/** required_for_commit rows are the ONE opening-position/checker rule this
 *  card pre-computes — it is exactly what commit_client_onboarding's own
 *  CLR10 checks (0017:2806-2811), never a wider re-derivation of Gate O.
 *  Everything else commit_client_onboarding refuses on (the opening-position
 *  arm, the distinct-checker/self-attestation arm) is left to the DB's own
 *  verbatim refusal — this card does not re-implement Gate O. */
function hasUnresolvedRequiredItem(items: OnboardingPlanItemRow[]): boolean {
  return items.some((i) => i.required_for_commit && i.state !== "answered" && i.state !== "resolved");
}

function ClientOnboardingCard({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientOnboarding.card");
  const { data, busy, err, clr, act } = useHydratedPart(session, (s) => loadClientOnboarding(clientId, s));
  const [cancelReason, setCancelReason] = useState("");
  const [attestation, setAttestation] = useState("");

  if (!data) {
    return err ? <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>{err}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>;
  }

  const refusalBanner = err ? (
    <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
      {err}
    </StateBanner>
  ) : null;

  if (data.kind === "no_client") {
    return <EmptyState>{t("clientNotVisible")}</EmptyState>;
  }

  if (data.kind === "no_plan") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        {refusalBanner}
        {data.client.status === "active" ? (
          <>
            <EmptyState>{t("noPlanBootstrapEligible")}</EmptyState>
            <OnboardingDoorDialog
              triggerLabel={t("bootstrapTrigger")}
              title={t("bootstrapTitle")}
              description={t("bootstrapDescription")}
              confirmLabel={t("bootstrapConfirm")}
              busy={busy}
              onConfirm={() => act(async () => { await bootstrapClientPlan(clientId, { session }); })}
            />
          </>
        ) : (
          <EmptyState>{t("noPlanNotEligible", { status: data.client.status })}</EmptyState>
        )}
      </div>
    );
  }

  const { plan, items } = data;
  const total = items.length;
  const completed = completedCount(items);
  const planOpen = plan.state === "open";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <header className="flex flex-wrap items-baseline gap-2">
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <span className="text-xs text-muted-foreground" aria-label={t("progressLabel", { completed, total })}>
          {completed} / {total}
        </span>
        <span className="text-xs text-muted-foreground">· {t(`planState.${plan.state}`)}</span>
      </header>

      {plan.opened_by_agent ? (
        <p className="text-xs text-muted-foreground">
          {plan.opener_model ? t("openedByAgentWithModel", { model: plan.opener_model }) : t("openedByAgent")}
        </p>
      ) : null}

      {refusalBanner}

      {plan.state === "committed" ? (
        <StateBanner tone="info">
          {t("committedNote", { at: plan.committed_at ? businessDateTime(plan.committed_at) : "—" })}
        </StateBanner>
      ) : null}
      {plan.state === "cancelled" ? (
        <StateBanner tone="neutral">
          {t("cancelledNote", { reason: plan.cancel_reason ?? "" })}
        </StateBanner>
      ) : null}

      {items.length === 0 ? (
        <EmptyState>{t("noItems")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <OnboardingItemRow
              key={item.item_key}
              item={item}
              busy={busy}
              planOpen={planOpen}
              onResolve={(resolution) =>
                act(async () => {
                  await resolveOnboardingPlanItem(plan.id, item.item_key, resolution, { session });
                })
              }
            />
          ))}
        </ul>
      )}

      {planOpen ? (
        <div className="flex flex-wrap gap-2">
          {/* Consent shows what it approves (working protocol): the dialog
              lists exactly what commit does — activates the client and closes
              the plan — never a bare "Confirm". */}
          <OnboardingDoorDialog
            triggerLabel={t("commitTrigger")}
            title={t("commitTitle")}
            description={t("commitDescription", { client: data.client?.name ?? clientId, completed, total })}
            confirmLabel={t("commitConfirm")}
            busy={busy}
            confirmDisabled={hasUnresolvedRequiredItem(items)}
            onConfirm={() =>
              act(async () => {
                await commitClientOnboarding(
                  { clientId, planId: plan.id, expectedPlanRevision: plan.revision_token, attestation: attestation.trim() || null },
                  { session },
                );
              })
            }
          >
            {hasUnresolvedRequiredItem(items) ? <p className="text-xs text-muted-foreground">{t("commitBlockedRequired")}</p> : null}
            <Textarea
              aria-label={t("attestationLabel")}
              placeholder={t("attestationPlaceholder")}
              value={attestation}
              onChange={(e) => setAttestation(e.target.value)}
            />
          </OnboardingDoorDialog>

          {/* Cancel — a destructive, irreversible-from-the-thread act (law 6:
              the estate has no delete verb; cancel archives the client). No
              literal "interruption" widget in this codebase models a governed
              cancel act (mobbin-grounding-wave-2026-08-28.md §T11 takeaway 5:
              "no pattern to import" for this door) — this reuses the SAME
              destructive door-dialog treatment the thread's other running-act
              cancels already use (components/firm/agent-tasks-panel.tsx's
              cancel_agent_task, components/close/CloseDoors.tsx's abandon):
              a destructive-styled confirm dialog requiring a typed reason,
              never a silent one-click. */}
          <OnboardingDoorDialog
            triggerLabel={t("cancelTrigger")}
            triggerVariant="destructive"
            title={t("cancelTitle")}
            description={t("cancelDescription", { client: data.client?.name ?? clientId })}
            confirmLabel={t("cancelConfirm")}
            busy={busy}
            confirmDisabled={cancelReason.trim().length === 0}
            onConfirm={() =>
              act(async () => {
                await cancelClientOnboarding({ clientId, planId: plan.id, reason: cancelReason.trim() }, { session });
              }, () => setCancelReason(""))
            }
          >
            <Textarea
              aria-label={t("cancelReasonLabel")}
              placeholder={t("cancelReasonPlaceholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </OnboardingDoorDialog>
        </div>
      ) : null}
    </div>
  );
}

/** Firm-altitude shape — see this file's own header ("SCOPE"). No hydrated
 *  read: there is no plan to scope a read to until AFTER a successful call,
 *  so this is a plain write-and-report affordance, never `useHydratedPart`
 *  over nothing. The DB's own returned `{client_id, plan_id}` is rendered
 *  VERBATIM as the receipt — never a fabricated "success" sentence — with an
 *  honest link into the new workspace (no auto-navigation: the human decides
 *  when to move, matching client-register-list.tsx's own Link-not-redirect
 *  precedent). */
function BeginOnboardingCard({ session }: { session: SessionTokenAccessor }) {
  const t = useTranslations("ClientOnboarding.card");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clrCode, setClrCode] = useState<string | null>(null);
  const [result, setResult] = useState<{ client_id: string; plan_id: string } | null>(null);

  async function onConfirm() {
    setBusy(true);
    setErr(null);
    setClrCode(null);
    try {
      const out = await beginClientOnboarding(name.trim(), { session });
      setResult(out);
      setName("");
    } catch (e) {
      if (isDoorRefusal(e)) {
        setErr(e.reason ? `${e.message} (${e.reason})` : e.message);
        setClrCode(e.code);
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <SectionHeader level={2}>{t("beginHeading")}</SectionHeader>
      {err ? <StateBanner tone="error" code={clrCode ?? undefined}>{err}</StateBanner> : null}
      {result ? (
        <StateBanner tone="info">
          {t("beginResult", { clientId: result.client_id, planId: result.plan_id })}
        </StateBanner>
      ) : null}
      <OnboardingDoorDialog
        triggerLabel={t("beginTrigger")}
        title={t("beginTitle")}
        description={t("beginDescription")}
        confirmLabel={t("beginConfirm")}
        busy={busy}
        confirmDisabled={name.trim().length === 0}
        onConfirm={onConfirm}
      >
        <Input
          aria-label={t("nameLabel")}
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </OnboardingDoorDialog>
    </div>
  );
}
