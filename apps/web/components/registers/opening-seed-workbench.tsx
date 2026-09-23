"use client";

// The live seed's own workbench — mounted keyed by `seed.id` (opening-register.tsx),
// so every hook below is scoped to exactly one seed for its whole lifetime;
// a seed switch remounts this component fresh rather than reusing state
// across seeds (the use-async-read.ts convention for a captured id that can
// change). ONE combined read drives items/targets/keyed-resolution together
// so a single `act()` reloads all three plus the PARENT's own seed-list read
// (`onSeedsChanged`) after every governed write — the seed's own state/badge
// must never go stale after an approve/cancel/reopen/supersede.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import {
  loadOpeningItems, loadOpeningTbTargets, loadOpeningKeyedResolution,
  loadOpeningTargetRefreshes,
} from "@/lib/registers/opening";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { isDoorRefusal } from "@/lib/doors";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { OpeningSeedBadge, CancelOpeningSeedDialog, ReopenOpeningSeedDialog } from "./opening-seed-lifecycle";
import { OpeningDryrunStrip } from "./opening-dryrun-strip";
import { toDialogRefusal, type DialogRefusal } from "@/components/common/dialog-refusal";
import { OpeningItemsPanel } from "./opening-items-panel";
import { OpeningTargetKeyedPanel } from "./opening-target-keyed-panel";
import { OpeningTargetDocumentPanel } from "./opening-target-document-panel";
import { OpeningParseAction } from "./opening-parse-action";
import { OpeningSourceHeader } from "./opening-source-header";
import { OpeningFixedAssetDialog } from "./opening-fixed-asset-dialog";
import { ApproveOpeningSeedDialog, ApproveOpeningCorrectionDialog } from "./opening-approve-dialogs";
import type { OpeningSeedRow } from "@/lib/registers/opening-types";
import type { AccountRow } from "@/lib/registers/accounts";
import type { CounterpartyRow } from "@/lib/registers/counterparty";

export function OpeningSeedWorkbench({
  clientId,
  seed,
  accounts,
  counterparties,
  onSeedsChanged,
}: {
  clientId: string;
  seed: OpeningSeedRow;
  accounts: AccountRow[];
  counterparties: CounterpartyRow[];
  onSeedsChanged: () => Promise<void>;
}) {
  const t = useTranslations("OpeningCarryDown.seed");
  const { data, loading, error, busy, act: rawAct } = useAsyncRead(async () => {
    const [items, targets, keyed] = await Promise.all([
      loadOpeningItems(sessionTokenAccessor, seed.id),
      loadOpeningTbTargets(sessionTokenAccessor, seed.id),
      loadOpeningKeyedResolution(sessionTokenAccessor, seed.id),
    ]);
    return { items, targets, keyed };
  });

  // (fix-round, browser leg) THE TIE DOCUMENT'S NAME, because a sha is not a document a person can
  // go and find. Before this the panel was mounted with `documentName={null}` and every provenance
  // cell read "Document 65a6f1e2d3c4 (sha 65a6f1e2d3c4)" — the hash twice, and the footer said
  // "Bound to  (sha …)" with a hole where the filename belongs. AC5's provenance is a figure a
  // professional can trace back to a PAGE, and the filename is how they find the page.
  //
  // It is a SEPARATE read on purpose: a failure here must leave the basis, its targets and its
  // gates exactly as they are (the filename degrades to the sha, which is what the panel already
  // falls back to), and never take the whole tied-basis surface down the way a failed member of
  // the combined read above does.
  // #986 — THE BASIS'S REFRESH RECORD, read SEPARATELY for the same reason the tie document's
  // name is: a basis that has never been refreshed carries no receipt and this read adds nothing
  // to the surface, so a failure here (an older database under a newer build, most of all) must
  // degrade to "no refresh is named" rather than take the targets and the tie gates down with it.
  const refreshRead = useAsyncRead(async () => {
    if (!seed.tie_document_id) return [];
    return loadOpeningTargetRefreshes(sessionTokenAccessor, seed.id);
  });

  const tieDocumentRead = useAsyncRead(async () => {
    if (!seed.tie_document_id) return null;
    const { listDocumentsByIds } = await import("@/lib/documents/reads");
    const rows = await listDocumentsByIds([seed.tie_document_id], { session: sessionTokenAccessor });
    return rows[0]?.original_filename ?? null;
  });

  // BLOCKER 1 (fix round 2, rev-t2): `record_opening_target`'s live body ends
  // in `on conflict(seed_id,line_key) do update set … debit_cents=excluded…`
  // against `uq_opening_tb_targets_key UNIQUE(seed_id,line_key)` — RE-recording
  // an EXISTING line_key (correcting a mistyped amount, the commonest action
  // while keying a TB) updates the row IN PLACE. `targets.length` therefore
  // never moves on an edit, even though the figure the dry-run strip's own
  // `_opening_seed_deltas` reads DID change — a count-based remount key is
  // blind to an upsert. An epoch this component itself bumps on every
  // SETTLED `act()` (success or failure — the strip re-reading after a
  // failed act is exactly the same "never trust, always re-derive" law every
  // other read in this file already follows) is discriminator-free: it does
  // not need to know WHAT changed, only that a governed write on this seed
  // just settled, which subsumes the items.length/targets.length signals it
  // replaces.
  const [actEpoch, setActEpoch] = useState(0);
  const act = async (fn: () => Promise<void>): Promise<boolean> => {
    const ok = await rawAct(fn);
    setActEpoch((e) => e + 1);
    await onSeedsChanged();
    return ok;
  };

  // #987 — THE PERIOD WALL, IN THE OPENING BASIS'S OWN WORDS (#656 residual R2).
  //
  // `clara._tf_period_wall_lines` (0056_wave_e_close_model.sql:746-749) refuses `draft_opening_item`
  // at the DRAFT with CLR19 `write_into_closed_period`, naming the fiscal year LABEL and the id of
  // the journal entry it would have created — the estate's ONE generic period-wall message, correct
  // everywhere else it fires. A person working an opening basis never typed a journal entry and is
  // shown one anyway. The rule, the code and the firing point are exactly what they were; only the
  // SENTENCE changes, and only inside this flow — every other caller of this same refusal
  //
  // CRS-07-04 (code-review fix round, RECORDED not fixed): the substitution below drops the
  // fiscal-year LABEL too, which #987 never asked to remove — a client with more than one closed or
  // closing year cannot tell FROM THIS REFUSAL ALONE which year is in the way. The refusal's own
  // `detail` carries `fiscal_year_id` (0056:748-749) but no label, so recovering it here would mean
  // this workbench growing its OWN fiscal-year read (`clara.list_fiscal_years`, lib/close/api.ts) —
  // a new read, a new loading/error leg, and a lookup keyed against an id this component has never
  // otherwise needed — for a label that is a minor, undeclared loss, not a missing rule or a wrong
  // one. Left out on purpose this fix round (scope discipline, WORK-ORDER rule 5); flagged here and
  // in the report for the owner to rule on rather than silently accepted.
  // (prepayments' own `explainClosedPeriod`, the bank/journals lanes, …) reads its message through
  // `toDialogRefusal`/`ErrorMessage` untouched, because this substitution lives here, not in either
  // of those shared renderers.
  //
  // WORDED DOOR-NEUTRAL ON PURPOSE (fix round, L07-05/L07-A04). `error` is this workbench's ONE
  // shared sticky failure — set by the SAME `act()` every governed door on this surface shares
  // (draft, record target, keyed resolution, SUPERSEDE, fixed asset, approve seed, approve
  // correction, cancel, reopen) — and `clara.supersede_opening_item` inserts journal lines too
  // (opening-item-doors.ts's own header), so a supersede refused by the period wall reaches this
  // SAME banner. The original wording ("cannot be drafted here") named an act that was not always
  // the one refused; "cannot be changed here" is correct for every door on this workbench, not only
  // the draft. See the 987.L07-05 cell below, which drives this refusal out of Supersede — a
  // non-draft door — and asserts the sentence still fits.
  const openingClosedPeriodRefusal = isDoorRefusal(error) && error.code === "CLR19" && error.reason === "write_into_closed_period"
    ? error
    : null;
  const openingRefusalCode = openingClosedPeriodRefusal
    ? <>{openingClosedPeriodRefusal.code}{openingClosedPeriodRefusal.reason ? ` · ${openingClosedPeriodRefusal.reason}` : ""}</>
    : null;

  // CRS-07-01 (code-review fix round). `_tf_period_wall_lines` returns early only for
  // `status in ('open','reopened')` (0056:735) — a fiscal year `status = 'closing'` (set by
  // begin_close, and the wall's own FY lookup deliberately PREFERS it over 'open':
  // `order by (fy.status in ('closing','closed')) desc`, 0056:733) fires this SAME CLR19 refusal,
  // reachable any time a close run is in progress. "now closed" and "have that year reopened" are
  // both wrong for that state: the year is not yet closed (a close run can still be abandoned —
  // CloseLifecycle.doors.abandon — putting it back to open with no reopen ceremony at all), and
  // `reopen_fiscal_year` (CloseLifecycle.doors.reopen: "Reopen this CLOSED fiscal year") answers a
  // different door than the one that would actually get this basis moving again. `fy_status` is
  // already on the refusal's own detail (0056:748-749; wire.ts's `RefusalError.detail`), so the two
  // real states are told apart rather than guessed at.
  const openingPeriodWallClosing = openingClosedPeriodRefusal?.detail?.fy_status === "closing";
  const openingPeriodWallMessage = openingClosedPeriodRefusal
    ? (openingPeriodWallClosing ? t("closingPeriodRefusal") : t("closedPeriodRefusal"))
    : null;

  // CB-AE2E-004 / 裁-187: ONE conversion of this workbench's sticky failure into
  // the shape every governed dialog below reads — it renders verbatim inside the
  // dialog (which now stays open on a refusal) and it is the only thing that
  // reveals an attestation field.
  const dialogRefusal: DialogRefusal | undefined = openingClosedPeriodRefusal
    ? { err: openingPeriodWallMessage as string, clr: { code: openingClosedPeriodRefusal.code, reason: openingClosedPeriodRefusal.reason } }
    : toDialogRefusal(error);

  // (fix-round, browser leg) ONCE THE BASIS HAS LOADED, A LATER `loading` IS A REFRESH — never a
  // teardown. `DataState` renders its LoadingState INSTEAD of children, and every `act()` flips
  // `loading` on the reload it always fires, so the reload that follows a successful read
  // UNMOUNTED `OpeningParseAction` and took its settled outcome with it: the banner that must be
  // persistent ("reading an opening source is a material act … a message that disappears cannot
  // carry that", #656 AC5) vanished the instant the read succeeded. The browser leg is what
  // caught it — the component cells mount the action on its own, where nothing re-reads around
  // it. This is `opening-register.tsx`'s own `hasSeedsData` precedent, applied one level down.
  const hasData = data !== null;

  const items = data?.items ?? [];
  const draftItems = items.filter((i) => i.state === "active");
  const correctionItems = items; // the door itself selects which drafts qualify (opening-approve-dialogs.tsx)
  const keyedResolutionId = data?.keyed?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <SectionHeader level={2}>{t("heading")}</SectionHeader>
            <OpeningSeedBadge state={seed.state} />
          </div>
          {/* #656: WHERE THIS BASIS CAME FROM, on the basis itself. A professional asked to
              approve an opening position must be able to see, without opening anything, whether
              the figures were read off a document this firm holds or keyed by a person. */}
          <OpeningSourceHeader seed={seed} targets={data?.targets ?? []} refreshes={refreshRead.data ?? []} />
        </div>
        <div className="flex flex-wrap gap-2">
          {/* F8 (fix round, rev-t2): un-hid — cancel_opening_seed's live
              precondition ("only an EMPTY open seed") was being enforced a
              second time here by hiding the trigger once items existed,
              contradicting opening-doors.ts's own doc comment ("never hides
              it outright"). Render-and-shape: the trigger is reachable on
              any open seed; the door refuses CLR31 `registry_not_open` on a
              non-empty one, surfaced verbatim like any other refusal. */}
          {seed.state === "open" ? <CancelOpeningSeedDialog seed={seed} busy={busy} refusal={dialogRefusal} act={act} /> : null}
          {seed.state === "finalized" ? <ReopenOpeningSeedDialog seed={seed} busy={busy} refusal={dialogRefusal} act={act} /> : null}
          {seed.state === "open" ? <ApproveOpeningSeedDialog seed={seed} draftItems={draftItems} busy={busy} refusal={dialogRefusal} act={act} /> : null}
          {seed.state === "open" && items.some((i) => i.supersedes_item_id !== null) ? (
            <ApproveOpeningCorrectionDialog seed={seed} correctionItems={correctionItems} busy={busy} refusal={dialogRefusal} act={act} />
          ) : null}
          {seed.state === "open" ? <OpeningFixedAssetDialog clientId={clientId} seed={seed} accounts={accounts} keyedResolutionId={keyedResolutionId} busy={busy} refusal={dialogRefusal} act={act} /> : null}
        </div>
      </div>

      {openingClosedPeriodRefusal ? (
        <StateBanner tone="error" code={openingRefusalCode}>{openingPeriodWallMessage}</StateBanner>
      ) : error ? <ErrorMessage error={error} /> : null}
      {/* NOT A DEFECT, recorded per the fix round: approve_opening_seed /
          approve_opening_correction assert `transaction_isolation =
          'serializable'` in-body; no migration sets it (a manual wave-b 0017
          ceremony artifact) — an un-ceremonied DB refuses CLR31
          `not_serializable` on EVERY approve attempt. The refusal itself
          already renders verbatim above; this is one extra line of operator
          guidance, reusing the prior build's own hint text verbatim
          (apps/dashboard/app/opening/openingModel.ts:348-349) rather than
          inventing new copy. */}
      {isDoorRefusal(error) && error.code === "CLR31" && error.reason === "not_serializable" ? (
        <p className="text-xs text-muted-foreground">{t("notSerializableHint")}</p>
      ) : null}

      <DataState loading={!hasData && loading} error={null} isEmpty={false} emptyMessage="">
        {data ? (
          <div className="flex flex-col gap-6">
            {/* F2 residual fix (fix round 2, rev-t2): a COUNT-based key
                (items.length/targets.length) is blind to an in-place UPDATE
                (record_opening_target's own upsert on an existing line_key)
                — the count never moves even though the figure did. The
                act-epoch above bumps on every settled write on this seed,
                remounting (and re-fetching) the strip regardless of whether
                the write added, updated, or left the row count unchanged. */}
            <OpeningDryrunStrip key={`${seed.id}:${actEpoch}`} seedId={seed.id} targets={data?.targets ?? []} />

            {/* #656: a TIED basis used to render NOTHING here — the keyed panel was the only
                target surface and it is mounted only for an untied seed, so a basis bound to a
                document showed its tie gates over targets nobody could see. The two lanes now
                each have their own panel, and which one mounts is still decided by the one fact
                that decides everything else about this basis: whether it carries a tie document. */}
            {seed.tie_document_id ? (
              <div className="flex flex-col gap-3">
                {seed.state === "open" ? (
                  <OpeningParseAction seedId={seed.id} busy={busy} onParsed={async () => { await act(async () => {}); }} />
                ) : null}
                <OpeningTargetDocumentPanel
                  clientId={clientId}
                  seed={seed}
                  targets={data.targets}
                  documentName={tieDocumentRead.data ?? null}
                />
              </div>
            ) : (
              <OpeningTargetKeyedPanel clientId={clientId} seed={seed} targets={data.targets} keyedResolutionId={keyedResolutionId} accounts={accounts} busy={busy} act={act} />
            )}

            <OpeningItemsPanel clientId={clientId} seed={seed} items={items} accounts={accounts} counterparties={counterparties} keyedResolutionId={keyedResolutionId} busy={busy} act={act} />
          </div>
        ) : null}
      </DataState>
    </div>
  );
}
