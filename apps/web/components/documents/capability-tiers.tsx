"use client";

// #633 AC3(b) — THE FOUR TIERS, ON AN INTAKE ROW.
//
// #624 shipped these four verdicts on the DETAIL panel, from `get_document_state`.
// What was missing is the list side: a payroll PDF read `done` in the filed table
// while the detail panel said facts are unsupported for that kind. The same four
// axes now render on a queue row, a receipt row and the firm leaf — from the
// registry catalogue read once per mount, joined in the browser.
//
// THE TWO HALVES ARE NOT THE SAME KIND OF ANSWER, and this component never blurs them:
//   * custody + byte extraction are FORMAT-INTRINSIC (0191's own column comments say
//     the intake lane does not know the kind yet), so they publish as soon as the
//     canonical mime is known — OFX's honest `stored_only` included;
//   * typed facts + business operation depend on the KIND, so until classification
//     lands they render the NAMED "Needs classification" state — never a guess, and
//     never `extraction_status: 'done'` standing in for facts support.
//
// It is a `<ul>` of four named pairs rather than four bare badges: on a table row a
// screen reader otherwise reads four adjacent words with nothing saying which axis
// each belongs to. NOT a live region — the surface owns exactly one announcement
// owner (`document-source-actions.tsx:271`'s rule), and this renders on every row.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CapabilityIndex, ResolvedCapability, TierState } from "@/lib/documents/capability-registry";
import { resolveCapability, tierStateKey } from "@/lib/documents/capability-registry";
import { capabilityLimitLevelKey, type BusinessOperationLevel } from "@/lib/documents/document-state";

/** KEYED BY THE CLOSED SET ITSELF, not by `string`. `BusinessOperationLevel` is the widest of the
 *  four axes' level sets, so this map must be total over it — and typing it that way is what
 *  makes the compiler say so. A map keyed by `string` silently falls through to an unstyled badge
 *  when a level is added or renamed, which is exactly the state this file was in for one commit
 *  before `proposal_only` was added to it by hand. */
const TONE: Record<BusinessOperationLevel, string> = {
  supported: "text-success",
  stored_only: "text-muted-foreground",
  unsupported: "text-warning",
  planned: "text-muted-foreground",
  // #988 — Clara proposes, a person confirms: real work happened (unlike `stored_only`'s "Clara
  // derives nothing"), but nothing posted on Clara's own authority (unlike `supported`'s green).
  // Its own tone, rather than falling through to the unmatched-key default, so the fifth level
  // reads as a distinct tier rather than a blank one.
  proposal_only: "text-info",
};

function tierTone(tier: TierState): string {
  return tier.state === "level" ? TONE[tier.level] : "text-muted-foreground";
}

export function CapabilityTiers({
  index, mime, kind, filename, compact = false,
}: {
  /** `null` while the one registry read is still in flight, or after it failed — the
   *  honest "not published" face, never a fabricated default. */
  index: CapabilityIndex | null;
  mime: string | null | undefined;
  kind: string | null | undefined;
  /** Names the group, so a row in a 40-row table says WHICH file it describes. */
  filename: string;
  compact?: boolean;
}) {
  const t = useTranslations("ClientDocuments");
  const resolved: ResolvedCapability | null = index ? resolveCapability(index, mime, kind) : null;

  const rows: Array<{ label: string; tier: TierState }> = [
    { label: t("stateCustodyLabel"), tier: resolved?.custody ?? { state: "unknown" } },
    { label: t("stateExtractionLabel"), tier: resolved?.byteExtraction ?? { state: "unknown" } },
    { label: t("stateFactsLabel"), tier: resolved?.typedFacts ?? { state: "unknown" } },
    { label: t("stateOperationLabel"), tier: resolved?.businessOperation ?? { state: "unknown" } },
  ];

  const needsClassification = rows.some((r) => r.tier.state === "needs_classification");
  const anyUnknown = rows.every((r) => r.tier.state === "unknown");

  return (
    <div className="flex flex-col gap-1">
      <ul aria-label={t("capabilityTiersLabel", { filename })} className="flex flex-col gap-0.5">
        {rows.map(({ label, tier }) => (
          <li key={label} className="flex flex-wrap items-baseline gap-1 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("font-medium", tierTone(tier))}>{t(tierStateKey(tier))}</span>
            {/* #782 — the limit's VALUE goes through its own message key here too, or the same
                registry tokens the detail panel stopped showing would still reach an accountant
                on every intake row. The NAME is still the registry's own key: naming each limit
                for a badge is #633's surface, not this fix round's. */}
            {tier.state === "level"
              ? Object.entries(tier.limits).map(([name, value]) => {
                  const levelKey = capabilityLimitLevelKey(String(value));
                  return (
                    <Badge key={name} variant="outline" className="text-[0.65rem]">
                      {t("capabilityLimitUnknown", { name, level: levelKey ? t(levelKey) : String(value) })}
                    </Badge>
                  );
                })
              : null}
          </li>
        ))}
      </ul>
      {compact ? null : anyUnknown ? (
        <p className="text-xs text-muted-foreground">{t("capabilityUnknownPair")}</p>
      ) : needsClassification ? (
        <p className="text-xs text-muted-foreground">{t("capabilityNeedsClassificationDetail")}</p>
      ) : null}
    </div>
  );
}
