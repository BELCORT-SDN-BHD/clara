"use client";

// #728 (hosted-walk findings 1 and 2) — the ONE actor cell shared by activity-row.tsx and
// activity-event-sheet.tsx, so the fix is written once and cannot drift between the two surfaces
// that render it (the same discipline lib/firm/activity.ts's own `describeActivity` already
// applies to the one sentence a row shows).
//
// THREE SHAPES, and every one of them is attribution present (C77.3 — no row without an actor):
//   * a member — <MemberName> resolves it, or falls back to the shortened raw id.
//   * the agent, on behalf of a member — "Clara on behalf of <name>", with a REAL space between
//     them. Finding 2's own defect ("00000000on behalf of Tao") was never a missing translation:
//     `<MemberName/>` followed immediately by a conditional `<span>` on the next JSX line has NO
//     text node between them (JSX drops whitespace-only text between sibling elements), so two
//     name fragments landed glued together with nothing but a CSS margin between them — invisible
//     to a screen reader and to anyone copying the row's text. The `{" "}` below is a real
//     character, not a stylistic gap.
//   * the system marker — a KEPT sweep-heartbeat row (0183 excludes the zero-effect ones; a row
//     that survives the door drafted something, per finding 1) carries `actor = null`, which is
//     the TRUTH the door output rather than a fabricated actor — this cell recognises exactly that
//     shape (`isSweepReceiptRow`, lib/firm/activity.ts) and labels it "Clara (system)" rather than
//     the honest-but-useless em dash `<MemberName>` would otherwise render for a null id.

import { useTranslations } from "next-intl";

import { MemberName } from "@/components/common/member-name";
import { isSweepReceiptRow, type ActivityRow as ActivityRowData } from "@/lib/firm/activity";
import type { MemberNameResolver } from "@/lib/members/use-member-names";

export type ActivityActorLineRow = Pick<ActivityRowData, "source" | "event_type" | "kind" | "actor" | "on_behalf_of">;

export function ActivityActorLine({
  row,
  memberNames,
}: {
  row: ActivityActorLineRow;
  memberNames: MemberNameResolver;
}) {
  const t = useTranslations("Activity");
  const tWalk = useTranslations("WalkFindings728");
  // A system marker only ever applies when the door left `actor` null — a defensive AND rather
  // than trusting `isSweepReceiptRow` alone, so a future row shape that reused
  // kind=agent/event_type=sweep.run_completed WITH a real actor could never be mislabelled.
  const isSystem = row.actor === null && isSweepReceiptRow(row);

  return (
    <>
      {isSystem ? <span>{tWalk("systemActorLabel")}</span> : <MemberName userId={row.actor} resolver={memberNames} />}
      {row.on_behalf_of ? (
        <span className="ml-1 text-muted-foreground">
          {" "}
          {t("onBehalfOf")} <MemberName userId={row.on_behalf_of} resolver={memberNames} showRole={false} />
        </span>
      ) : null}
    </>
  );
}
