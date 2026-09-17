// #649 AC2 — the committed plan's answers reach the CLIENT RECORD, not only the Knowledge
// register.
//
// `clara.settle_client_onboarding_facts(p_plan, p_fy_end_month, p_fy_end_day, p_op_key)` — 0219,
// bookkeeper floor, human lane only (there is no machine twin, and the ground is structural:
// `clara.set_client_fy_end` opens with `clara._human_ctx`, which raises CLR04 with no `jwt_sub`,
// and is EXECUTE-granted to `clara_authenticated` alone).
//
// THIS CALL IS NOT SWALLOWED, and it is the ONE post-commit call that is not.
// `promotePlanAnswersToKnowledge` is deliberately swallowed at the same call site — a KB
// projection failure must not present itself as a failed commit (#603) — but this door WRITES THE
// CLIENT'S OWN FINANCIAL YEAR, and its refusals are about that write:
//
//   CLR38 `fy_end_locked_by_annual_cadence`  a live ANNUAL adjustment template or depreciation
//     authority stands, so the year end did not move. Presenting that as a settled onboarding is
//     the worst outcome this journey can produce.
//   CLR10 `fy_end_day_required`              the day was not supplied. Never derived (D7).
//   CLR10 `fy_end_month_contradicts_plan`    the form's month disagrees with the interview answer;
//     the detail names both, and the face shows both.
//   CLR10 `fy_end_month_unanswered`          neither the plan nor the form states a month.
//   CLR37 `fa_particulars_invalid`           an impossible calendar day (31 February).
//   CLR10 `onboarding_plan_open` / `onboarding_plan_not_committed` / `plan_not_client_scoped`
//   CLR11 `plan_not_in_firm`                 unknown plan or another firm's — one answer, no oracle.
//
// THE OP KEY IS MINTED FRESH PER ATTEMPT (doors.ts's "never retry a refusal" law). The door's own
// receipt hash covers the month AND the day, so a replay under the same key carrying a different
// day is the house receipt-hash CLR10 rather than a second, silent year-end move.

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const opKey = (): string => crypto.randomUUID();

export type SettleFactsReceipt = {
  plan_id: string;
  client_id: string;
  fy_end_month: number;
  fy_end_day: number;
  /** `plan` (taken from the interview answer) · `plan_confirmed` (the form repeated it) ·
   *  `caller` (the plan stated none and the form supplied one). The face says which. */
  fy_end_month_source: string;
};

/** GOVERNED ACT: `clara.settle_client_onboarding_facts`. Refusals propagate as `DoorRefusal` and
 *  are rendered VERBATIM by the caller — never caught, re-worded or retried here.
 *
 *  `fyEndMonth` is `null` when the human left the month to the plan's own recorded answer. The
 *  DAY is never null: it is asked, and the door refuses without it. */
export async function settleClientOnboardingFacts(
  args: { planId: string; fyEndMonth: number | null; fyEndDay: number },
  opts: Opts = {},
): Promise<SettleFactsReceipt> {
  const raw = await callDoor(
    "settle_client_onboarding_facts",
    {
      p_plan: args.planId,
      p_fy_end_month: args.fyEndMonth,
      p_fy_end_day: args.fyEndDay,
      p_op_key: opKey(),
    },
    opts,
  );
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    plan_id: typeof r.plan_id === "string" ? r.plan_id : args.planId,
    client_id: typeof r.client_id === "string" ? r.client_id : "",
    fy_end_month: Number.isInteger(r.fy_end_month) ? (r.fy_end_month as number) : Number.NaN,
    fy_end_day: Number.isInteger(r.fy_end_day) ? (r.fy_end_day as number) : Number.NaN,
    fy_end_month_source: typeof r.fy_end_month_source === "string" ? r.fy_end_month_source : "plan",
  };
}
