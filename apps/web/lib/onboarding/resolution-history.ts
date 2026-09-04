// 裁-27 — THE PRIOR RESOLUTIONS OF ONE PLAN ITEM, out of the append-only trail.
//
// THE PROBLEM. `clara.resolve_onboarding_plan_item` (live body 0017_wave_b.sql:2706, no
// CREATE OR REPLACE and no splice anywhere in the migration set) re-resolves an item in ANY
// state — it carries no "already resolved" refusal at all — but the checklist card disabled
// the control once an item left `pending`, and the card is the ONLY surface for that door in
// the whole product. So a mis-typed answer was uncorrectable from inside Clara. 裁-27
// allows the amend.
//
// AND THE AMEND IS A NEW RESOLUTION, NOT AN EDIT. The door UPDATEs the item row in place
// (`answer=to_jsonb(p_resolution)`, :2726-2733) — so the ITEM shows only the latest answer —
// and then, in the same transaction, bumps the plan and INSERTs a full snapshot into
// `clara.onboarding_plan_revisions` (:2740-2742, append-only: 0017's own trigger block gives
// the table no UPDATE or DELETE path). That table is the trail, and it is READABLE by a
// human session: `grant select … to clara_authenticated` at 0017:5114-5122 with
// `p_onboarding_plan_revisions_human` (0017:1448-1451) scoping it to the caller's own firm
// through the parent plan.
//
// So this module does NOT re-derive history from the item row (which has none) or from
// `clara.audit_log` (whose entry for this door records `{plan, item_key, state, op_key}` and
// deliberately NOT the resolution text). It reads the snapshots and projects ONE item's
// answer out of each — the supersession chain, as written, in the order it was written.

import { getRows } from "@/lib/read";
import { verbatimAnswerText } from "./answer-format";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

export type PlanRevisionRow = {
  revision_n: number;
  snapshot: unknown;
  created_at: string;
};

export type ItemResolution = {
  revisionN: number;
  at: string;
  state: string;
  /** The answer AS STORED. `resolve_onboarding_plan_item` writes `to_jsonb(text)`, so a
   *  human resolution is a JSON string; an interview-written answer is an object. Rendered
   *  as text either way, never re-parsed into a shape this module invents (the same posture
   *  `OnboardingPlanItemRow.answer` already documents). */
  answerText: string;
};

/** Every revision snapshot for a plan, oldest first — the order the supersessions happened
 *  in, which is the order a human reads a correction trail in. */
export function loadPlanRevisions(planId: string, opts: Opts = {}): Promise<PlanRevisionRow[]> {
  return getRows<PlanRevisionRow>("onboarding_plan_revisions", {
    select: "revision_n,snapshot,created_at",
    filters: { plan_id: `eq.${planId}` },
    order: "revision_n.asc",
    ...opts,
  });
}

/** `_onboarding_plan_snapshot` (0017:1911-1918) builds `{plan, items:[…]}` where each item is
 *  a raw `to_jsonb(row)` of `clara.onboarding_plan_items`. This reads that shape defensively:
 *  anything it cannot positively read yields no entry rather than a guessed one. */
function itemFromSnapshot(snapshot: unknown, itemKey: string): { state: string; answer: unknown; answeredAt: string | null } | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const items = (snapshot as Record<string, unknown>).items;
  if (!Array.isArray(items)) return null;
  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (item.item_key !== itemKey) continue;
    const state = typeof item.state === "string" ? item.state : null;
    if (state === null) return null;
    return {
      state,
      answer: item.answer,
      answeredAt: typeof item.answered_at === "string" ? item.answered_at : null,
    };
  }
  return null;
}

/** H-26 — the trail agrees with the row. This used to `JSON.stringify`, so the amend dialog's
 *  "earlier answers, superseded" list rendered raw JSON for exactly the answers the row above
 *  it now renders in words. It routes through the SAME verbatim renderer the row's formatter
 *  falls back to, so the de-duplication below still compares like with like: two genuinely
 *  different objects still produce different text, and an unchanged one still produces the
 *  same text across every snapshot that carries it. */
function answerToText(answer: unknown): string {
  if (typeof answer === "string") return answer;
  if (answer === null || answer === undefined) return "";
  return verbatimAnswerText(answer);
}

/**
 * The item's SUPERSEDED answers, oldest first — every settled answer the trail holds EXCEPT
 * the one standing now.
 *
 * DE-DUPLICATED BY VALUE, deliberately. A snapshot is written for every plan revision, and
 * most revisions are about a DIFFERENT item — so the same unchanged answer appears in dozens
 * of snapshots. Emitting one entry per snapshot would render a correction trail claiming a
 * dozen amendments that never happened, which is a fabricated history, not a verbose one.
 * An entry is emitted only where THIS item's answer text actually CHANGED from the previous
 * snapshot, and the timestamp carried is the item's own `answered_at` (the DB's record of
 * when it was answered) rather than the snapshot's `created_at` (when some other item moved).
 *
 * The LATEST entry is dropped: it is the answer the card already renders as current, and
 * showing it under "previously" would read as a supersession of itself.
 */
export function supersededResolutions(revisions: readonly PlanRevisionRow[], itemKey: string): ItemResolution[] {
  const chain: ItemResolution[] = [];
  let lastText: string | null = null;
  for (const rev of revisions) {
    const item = itemFromSnapshot(rev.snapshot, itemKey);
    if (item === null) continue;
    if (item.state === "pending") {
      lastText = null;
      continue;
    }
    const text = answerToText(item.answer);
    if (!text) continue;
    if (text === lastText) continue;
    lastText = text;
    chain.push({
      revisionN: rev.revision_n,
      at: item.answeredAt ?? rev.created_at,
      state: item.state,
      answerText: text,
    });
  }
  // Everything but the standing answer.
  return chain.slice(0, -1);
}
