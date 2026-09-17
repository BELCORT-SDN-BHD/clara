"use client";

// #639 — "Fixed asset registered" on journey B3's Work identity block.
//
// ONE ROW, AND ONLY WHEN THERE IS ONE. Before this ticket `components/work/work-detail.tsx`
// contained ZERO occurrences of the word `asset`: a Work that had just acquired a machine said
// nothing about it, and the human had to go and find the register. AC5 asks the linked Work
// surface to show the completed acquisition.
//
// DERIVED, NOT STORED, AND THROUGH A DOOR THAT ALREADY EXISTS. Migration 0216 projects
// `acquisition_entry_id` on EVERY register row shape (`clara._fa_asset_json`), so the asset this
// Work created is the row whose acquisition entry is the Work's own posted entry. That is one
// viewer-floored read of a register the reader may already see, not a new door and not a new
// column on `clara.accounting_work` — the receipt is inserted after the approve, so nothing could
// have stamped an asset id on the Work in the first place.
//
// IT IS A SELF-CONTAINED CHILD RATHER THAN A PROP ON `WorkFacts`, for exactly the reason
// `components/plans/work-plan-origin.tsx` states in its own header: #638, #652 and #653 are all
// editing `work-detail.tsx` in this same wave, so this lane's footprint there is ONE import and
// ONE JSX line inside the existing identity `<dl>`.
//
// IT RENDERS NOTHING while the read is in flight, nothing when the Work posted no entry, nothing
// when no register row names that entry (which is most Works), and nothing when the read FAILS.
// A "Loading…" line that usually resolves to "this Work bought nothing" would flicker on the
// surface a professional reads most often, and the Work's own identity is unaffected by a failed
// register read.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { loadFixedAssets } from "@/lib/registers/fixed-assets";
import { fixedAssetHref } from "@/lib/navigation/tree";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";

export function WorkAssetRow({
  clientId,
  entryId,
}: {
  clientId: string;
  /** The Work's own posted entry (`accounting_work.result.entry_id`). Null until it posts — and
   *  this component is mounted only when it is non-null, so the register is never read for a Work
   *  that has produced nothing. */
  entryId: string | null;
}) {
  const t = useTranslations("WorkDetail");
  const register = useAsyncRead(() => loadFixedAssets(sessionTokenAccessor, clientId));
  if (entryId === null) return null;
  const rows = register.data?.assets ?? [];
  const born = rows.filter((a) => a.acquisition_entry_id === entryId);
  if (born.length === 0) return null;
  return (
    <>
      <dt className="text-muted-foreground">{t("fixedAssetLabel")}</dt>
      <dd className="text-foreground">
        <span className="inline-flex flex-wrap items-baseline gap-2">
          {born.map((a) => (
            <span key={a.id} className="inline-flex flex-wrap items-baseline gap-1">
              <Link className="underline underline-offset-2" href={fixedAssetHref(clientId, a.id)}>
                {a.description ?? a.id.slice(0, 8)}
              </Link>
              {/* THE PRODUCT SENTENCE, on the Work's own page: the acquisition is done and only
                  the depreciation setup is waiting. Said in words, never by colour alone. */}
              {!a.particulars_complete ? (
                <span className="text-warning">{t("fixedAssetPendingParticulars")}</span>
              ) : null}
            </span>
          ))}
        </span>
      </dd>
    </>
  );
}
