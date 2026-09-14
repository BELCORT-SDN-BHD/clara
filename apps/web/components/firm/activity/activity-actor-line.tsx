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
//   * the system marker — a row Clara wrote herself carries `actor = null`, which is the TRUTH the
//     door output rather than a fabricated actor. `isSystemActorRow` (lib/firm/activity.ts) names
//     every shape that is true of and labels it "Clara (system)" rather than the honest-but-useless
//     em dash `<MemberName>` would otherwise render for a null id: the KEPT sweep heartbeat (#728
//     finding 1 — 0183 excludes the zero-effect ones, so a row that survives the door drafted
//     something) and, since #742, the document pipeline's own four machine-written event types.
//     Those four were 7 of the live feed's first 25 rows rendering "—": a C77.3 miss on events that
//     did have an author. A HUMAN-written row of the same four types keeps its person's name,
//     because the human door passes the actor and the predicate refuses any row that has one.

import { useTranslations } from "next-intl";

import { MemberName } from "@/components/common/member-name";
import { isSystemActorRow, type ActivityRow as ActivityRowData } from "@/lib/firm/activity";
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
  // A system marker only ever applies when the door left `actor` null — the check lives inside
  // `isSystemActorRow` so neither this cell nor any future caller can forget it: a row that reused
  // one of the recognised event types WITH a real actor (the human classification door does
  // exactly that) must render that person, never the system label.
  const isSystem = isSystemActorRow(row);

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
