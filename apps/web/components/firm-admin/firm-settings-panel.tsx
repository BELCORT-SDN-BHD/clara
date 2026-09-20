"use client";

// #635 — `/settings/firm`: the firm's real legal, commercial and model-usage state.
//
// THE THREE READS LIVE HERE, NOT IN THE CARDS, for one measured reason: `capacity` and the plan
// arrive on the SAME door answer (`clara.get_firm_commercial_state`), and `created_at` on it too.
// One read feeding three renderers is a page that cannot contradict itself; three cards each
// calling the same door would be three answers free to disagree, and two of them would be reads
// nothing asked for. The cards below are presentational and take a `FirmSettingsView`.
//
// REVOCATION (AC4), THREE LAYERS, NONE OF WHICH RE-READS `caller_context` IN A CHILD:
//
//  1. THE SERVER. `app/(firm)/layout.tsx` re-runs `requireFirmScope()` on every navigation, so a
//     demotion that happens between pages is caught before this component mounts at all.
//  2. THIS COMPONENT, on `visibilitychange`→visible and on window `focus`. Both door calls are
//     re-issued, and a CLR04 answer CLEARS the fetched rows from state and renders the denied
//     face. It cannot leave a stale payload behind a disabled control, because the `denied` view
//     has no `data` field to hold one (`firm-settings-view.ts`).
//     POLLING THE RANK-BEARING CLAIM IS REFUSED. Re-reading `clara.caller_context` here to notice
//     a demotion is exactly the child-side re-read P4-6 rules out, and it would make the surface
//     trust a MIRRORED rank instead of the wall. The doors answer the question themselves.
//  3. THE ACCEPT CONTROL is gated on `can_accept_for_firm`, which the standing door re-derives
//     from 0195:905's membership predicate on every call.
//
// NAMED RESIDUAL: a tab that is never refocused and never navigated keeps its last payload until
// one of those happens. Closing that needs a server-push channel this estate does not have.
//
// IT SPLITS INTO A WRAPPER AND A VIEW, exactly as `components/settings/settings-hub.tsx` does and
// for the same measured reason: `useSearchParams`/`useRouter`/`usePathname` need a real Next
// router, which the bare `node --test` harness does not provide (see
// `components/firm/activity/activity-event-sheet.test.tsx`'s own note). `FirmSettingsPanel` is
// the URL half — it reads the period out of the query string and pushes a new one — and
// `FirmSettingsPanelView` is everything else, so every cell below can mount the real cards, the
// real reads and the real refresh without a router.
//
// THE TWO LEGACY CARDS ARE KEPT, VERBATIM AND AT THE BOTTOM. `SettingsPanel` (裁-187's approvals
// note and the honest capabilities note) is RENDERED, not re-typed, so the sentences
// `firm-admin-pages-a11y.test.tsx:253-263` and `e2e/firm-navigation-walk.spec.ts:189-190` pin
// stay byte-identical and keep their own history and header.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SettingsPanel } from "@/components/firm-admin/settings-panel";
import { AiUsageCard, type FirmUsageAnswer } from "@/components/firm-admin/ai-usage-card";
import { CommercialStateCard } from "@/components/firm-admin/commercial-state-card";
import { FirmIdentityCard } from "@/components/firm-admin/firm-identity-card";
import { LegalStandingCard } from "@/components/firm-admin/legal-standing-card";
import { ProcessingCapacityCard } from "@/components/firm-admin/processing-capacity-card";
import { useFirmScope } from "@/components/firm-scope-provider";
import { isDoorRefusal } from "@/lib/doors";
import {
  newProcessingCapsOpKey,
  setFirmDocumentLimits,
  type ProcessingCapEdits,
  type SetProcessingCapsOutcome,
} from "@/lib/firm/capacity-doors";
import {
  loadFirmAiUsage,
  loadFirmCommercialState,
  loadFirmLegalStanding,
  type FirmCommercialState,
  type FirmLegalStanding,
  type FirmUsageTable,
} from "@/lib/firm/commercial-reads";
import { recentUsageMonths, resolveUsagePeriod, type UsagePeriod } from "@/lib/firm/usage-period";
import { denied, failed, LOADING, ready, type FirmSettingsView } from "./firm-settings-view";

/** #960 — the ONE governed WRITE this page owns. It is not a loader, so it is not in the bag
 *  above: a loader is re-fired by the focus refresh, and re-firing a write would be a second
 *  cap change nobody asked for. */
export type SetFirmCaps = (edits: ProcessingCapEdits) => Promise<SetProcessingCapsOutcome>;

export type FirmSettingsLoaders = {
  readonly legalStanding: () => Promise<FirmLegalStanding>;
  readonly commercialState: () => Promise<FirmCommercialState>;
  readonly aiUsage: (period: string) => Promise<FirmUsageTable>;
};

const PRODUCTION_LOADERS: FirmSettingsLoaders = {
  legalStanding: () => loadFirmLegalStanding(),
  commercialState: () => loadFirmCommercialState(),
  aiUsage: (period) => loadFirmAiUsage(period),
};

/** THE ONE CLASSIFIER. A governed refusal is a STATE with the database's own sentence; anything
 *  else is a failure with a retry. `clara._human_ctx` raises CLR04 carrying no `detail.reason`
 *  (0004:299-309, measured), so the code alone is the discriminant and no reason token is
 *  invented from the message. */
function classify<T>(error: unknown): FirmSettingsView<T> {
  if (isDoorRefusal(error) && error.code === "CLR04") return denied<T>(error.message);
  if (isDoorRefusal(error)) return failed<T>(`${error.code}: ${error.message}`);
  return failed<T>(error instanceof Error ? error.message : String(error));
}

export type FirmSettingsPanelProps = {
  readonly loaders?: FirmSettingsLoaders;
  /** #960: injected by the cells; production calls `clara.set_firm_document_limits` directly. */
  readonly setCaps?: SetFirmCaps;
  /** Injected by the cells so "the current month" is not a moving target. */
  readonly now?: Date;
  readonly dialogProps?: React.ComponentProps<typeof LegalStandingCard>["dialogProps"];
  readonly download?: React.ComponentProps<typeof AiUsageCard>["download"];
};

/** THE URL HALF. Everything it does is read one search param and push another. */
export function FirmSettingsPanel(props: FirmSettingsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period: UsagePeriod = useMemo(
    () => resolveUsagePeriod(searchParams.get("period"), props.now),
    [searchParams, props.now],
  );
  const months = useMemo(() => {
    const recent = recentUsageMonths(props.now);
    // A LINKED MONTH OUTSIDE THE WINDOW STILL RENDERS. The selector offers a fixed twelve, but a
    // colleague's link to an older month must not silently snap to a different one.
    return recent.includes(period.month) ? recent : [period.month, ...recent];
  }, [props.now, period.month]);

  function changePeriod(month: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", month);
    // PUSH, not replace: Back must restore the previous month rather than leave the page.
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <FirmSettingsPanelView {...props} period={period} months={months} onPeriodChange={changePeriod} />
  );
}

/** Exported for the structural/a11y/behaviour cells; production gets its period from the URL. */
export function FirmSettingsPanelView({
  loaders = PRODUCTION_LOADERS,
  setCaps,
  dialogProps,
  download,
  period,
  months,
  onPeriodChange,
}: FirmSettingsPanelProps & {
  readonly period: UsagePeriod;
  readonly months: readonly string[];
  readonly onPeriodChange: (month: string) => void;
}) {
  const scope = useFirmScope();

  const [standing, setStanding] = useState<FirmSettingsView<FirmLegalStanding>>(LOADING);
  const [commercial, setCommercial] = useState<FirmSettingsView<FirmCommercialState>>(LOADING);
  const [usage, setUsage] = useState<FirmSettingsView<FirmUsageAnswer>>(LOADING);

  // N3's latest-wins epoch, and there is ONE PER READ rather than one shared counter. A single
  // counter is not a smaller version of this: the three reads start together, so the third would
  // bump the epoch past the first two and both of their answers would be discarded as "stale"
  // — a page whose legal and commercial cards never leave their skeletons. Measured here, by
  // `p635.web.panel_composition`, before this file left the branch.
  const standingEpoch = useRef(0);
  const commercialEpoch = useRef(0);
  const usageEpoch = useRef(0);

  // THE LOADERS ARE READ THROUGH A REF, NEVER DEPENDED ON BY IDENTITY (`lib/parts/hooks.ts`'s
  // "P3 FOLLOW-UP" paragraph). A caller handing in a fresh `loaders` object every render would
  // otherwise change all three read callbacks' identities, re-fire their effects and storm — the
  // 4GB-heap class that hook's header measured, and which this ticket's own dialog cells
  // reproduced before the same fix landed there.
  const loaderRef = useRef(loaders);
  loaderRef.current = loaders;

  const readStanding = useCallback(async () => {
    const mine = ++standingEpoch.current;
    try {
      const data = await loaderRef.current.legalStanding();
      if (standingEpoch.current === mine) setStanding(ready(data));
    } catch (e) {
      if (standingEpoch.current === mine) setStanding(classify<FirmLegalStanding>(e));
    }
  }, []);

  const readCommercial = useCallback(async () => {
    const mine = ++commercialEpoch.current;
    try {
      const data = await loaderRef.current.commercialState();
      if (commercialEpoch.current === mine) setCommercial(ready(data));
    } catch (e) {
      // THE CLEARING STEP, and it is the whole of AC4's second layer: a CLR04 replaces the view,
      // it does not decorate it, so the plan and the payment are GONE rather than stale.
      if (commercialEpoch.current === mine) setCommercial(classify<FirmCommercialState>(e));
    }
  }, []);

  const readUsage = useCallback(async (month: string) => {
    const mine = ++usageEpoch.current;
    try {
      const table = await loaderRef.current.aiUsage(`${month}-01`);
      // THE MONTH TRAVELS WITH THE ROWS. The epoch guard below fixes out-of-order RESPONSES; it
      // says nothing about the stretch BEFORE the first one, where the label has already moved.
      // Stamping the answer lets the card refuse to render rows under a window they are not from.
      if (usageEpoch.current === mine) setUsage(ready({ month, ...table }));
    } catch (e) {
      if (usageEpoch.current === mine) setUsage(classify<FirmUsageAnswer>(e));
    }
  }, []);

  useEffect(() => { void readStanding(); }, [readStanding]);
  useEffect(() => { void readCommercial(); }, [readCommercial]);
  useEffect(() => { void readUsage(period.month); }, [readUsage, period.month]);

  // LAYER 2. Both governed reads are re-issued when the tab comes back; the standing read rides
  // along because a version published while the tab was hidden withdraws authority the moment it
  // lands (0195:890-892) and this page is where that is noticed.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void readStanding();
      void readCommercial();
      void readUsage(period.month);
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [readStanding, readCommercial, readUsage, period.month]);

  const createdAt = commercial.status === "ready" ? commercial.data.firm.createdAt : null;

  // #960 — THE CAP WRITE, and the re-read that always follows it. A FRESH op key per
  // submission (`lib/firm/capacity-doors.ts`'s own header says why at length): a cap set back to
  // a number it once held is a NEW change of the firm's state, and a key derived from the values
  // would make the door replay the first receipt and write nothing.
  // The re-read is unconditional — accepted, refused or unavailable — because the figures above
  // the control belong to `clara.get_firm_commercial_state` and to nothing else, and because a
  // refusal is exactly the moment the page's idea of the caps is most worth checking.
  const saveCaps = useCallback(async (edits: ProcessingCapEdits): Promise<SetProcessingCapsOutcome> => {
    const call = setCaps ?? ((e: ProcessingCapEdits) => setFirmDocumentLimits({
      edits: e, opKey: newProcessingCapsOpKey(),
    }));
    try {
      return await call(edits);
    } finally {
      await readCommercial();
    }
  }, [setCaps, readCommercial]);

  return (
    <div className="flex flex-col gap-4">
      <FirmIdentityCard createdAt={createdAt} />
      <LegalStandingCard
        view={standing}
        onRetry={() => { void readStanding(); }}
        onAccepted={() => { void readStanding(); }}
        dialogProps={dialogProps}
      />
      <CommercialStateCard view={commercial} onRetry={() => { void readCommercial(); }} />
      <AiUsageCard
        view={usage}
        period={period}
        months={months}
        firmName={scope.firm_name ?? ""}
        onPeriodChange={onPeriodChange}
        onRetry={() => { void readUsage(period.month); }}
        download={download}
      />
      <ProcessingCapacityCard view={commercial} save={saveCaps} />
      {/* The two legacy cards, rendered rather than re-typed — see this file's header. */}
      <SettingsPanel />
    </div>
  );
}
