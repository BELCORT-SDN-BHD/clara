// #1059, FIX ROUND (spec finding L04-SPEC-01 and adversarial ADV-03) — THE DURABLE HALF of the
// payroll settlement reverse route.
//
// WHAT WAS WRONG. The first cut kept the accept receipt (settlement entry id + match id) in this
// panel's React state and offered the reverse ceremony against THAT pair. A reload, a tab change
// or a fresh visit left the card gone and the person back on the two general-purpose doors the
// ticket exists to replace — while AC1 asks that "a settled payroll run's entry is DISCOVERABLE
// from the payroll settlements panel". The stated reason for the narrowing was that a durable list
// would need a new SQL read and therefore a migration, which this ticket may not add. That reason
// does not survive measurement: on clara_l07, `clara_authenticated` already holds column SELECT on
// `clara.journal_entries.flags` (information_schema.column_privileges) and table SELECT on
// `clara.bank_matches` and `clara.bank_match_entry_members`. The settlement entry's own flags carry
// `payroll_settlement.{payroll_entry_id, document_id, period_month}` (0298:463-465). So the list is
// reachable through the SAME RLS-scoped table reads `lib/journals/api.ts` already makes, with NO
// new door, NO new view and NO migration.
//
// NO JSONB FILTER OPERATOR IS GUESSED. The discrimination ("does this entry carry a
// payroll_settlement marker?") is done HERE, in TypeScript, over rows the server filtered on
// columns whose PostgREST operators this repo already uses elsewhere (`eq`, `in`, `is.null`). A
// `cs.` containment filter on a jsonb column would probably work, but "probably" is not a standard
// this module can cite, and a filter that silently matched nothing would make a reversible
// settlement invisible — the exact failure this file exists to remove. The cost is bounded by
// FETCH_CAP and the same read the Journals workbench already makes for every client.
//
// THREE STATES, BECAUSE THE LEDGER HAS THREE. A settlement is `settled` (approved, riding a live
// or pending bank match: both doors are still owed), `unmatched` (approved, no live match — the
// bank line was already freed and only the entry reversal is owed; this is the half-reversed state
// ADV-03 measured, and surfacing it is what makes the ceremony RESUMABLE rather than a dead end),
// or `awaiting_checker` (a draft the high-stakes wall left for a distinct checker, which has no
// match to unmatch and no posting to reverse — its remedy is `clara.withdraw_draft`).

import { getRows, type GetRowsOptions } from "@/lib/read";
import type { SessionTokenAccessor } from "@/lib/session";
import { rec, s, numOrNull } from "./types";

/** Same cap and the same truncation-is-proof posture as `lib/journals/api.ts`'s `fetchBounded`:
 *  PostgREST's documented `db-max-rows` default is 1000, so a read with no limit silently returns
 *  at most that many with no signal. Asking for CAP + 1 turns a full answer into proof. */
const FETCH_CAP = 1000;

export type PayrollSettlementReversalStatus = "settled" | "unmatched" | "awaiting_checker";

export type PayrollSettlementReversal = {
  /** The SETTLEMENT entry (0298's own Dr 2040 / Cr bank), not the payroll run's entry. */
  settlementEntryId: string;
  /** The payroll run this settled, off the settlement entry's own marker. */
  payrollEntryId: string | null;
  periodMonth: string | null;
  postingDate: string | null;
  /** The bank match still riding this entry, or null when there is none to unmatch. */
  matchId: string | null;
  /** Cents, always positive — |matched_cents| off the match member row, or 0 when this settlement
   *  has no match (the `unmatched` and `awaiting_checker` arms). Never derived from anything the
   *  caller typed. */
  amountCents: number;
  status: PayrollSettlementReversalStatus;
  /** `clara.withdraw_draft` demands the expected revision; only the draft arm needs it. */
  revisionToken: string | null;
};

export type PayrollSettlementReversals = {
  readonly rows: readonly PayrollSettlementReversal[];
  /** True when the entry read hit its cap, so an older settlement may be missing from this list. */
  readonly truncated: boolean;
};

type EntryRow = {
  id: string;
  status: string;
  posting_date: string | null;
  revision_token: string | null;
  flags: unknown;
};

type MemberRow = { match_id: string; entry_id: string; matched_cents: number | string | null };
type MatchRow = { id: string; status: string };

const ENTRY_SELECT = "id,status,posting_date,revision_token,flags";

/** Every payroll net-pay settlement of this client that a person could still undo: approved and
 *  not already reversed, or drafted and waiting for a checker. Derived entirely from live state —
 *  this module stores nothing and remembers nothing between calls. */
export async function listPayrollSettlementReversals(
  clientId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<PayrollSettlementReversals> {
  const common: Pick<GetRowsOptions, "session" | "signal"> = { session: opts.session, signal: opts.signal };

  const entries = await getRows<EntryRow>("journal_entries", {
    ...common,
    select: ENTRY_SELECT,
    filters: {
      client_id: `eq.${clientId}`,
      // A REVERSED settlement is finished business: the run already reads unsettled again and the
      // panel offers it above. `withdrawn` is likewise done.
      reversed_by: "is.null",
      status: "in.(draft,approved)",
    },
    order: "posting_date.desc",
    limit: FETCH_CAP + 1,
  });
  const truncated = entries.length > FETCH_CAP;
  const page = truncated ? entries.slice(0, FETCH_CAP) : entries;

  const settlements = page
    .map((row) => {
      const marker = rec(rec(row.flags).payroll_settlement);
      if (Object.keys(marker).length === 0) return null;
      return {
        id: s(row.id) ?? "",
        status: s(row.status) ?? "",
        postingDate: s(row.posting_date),
        revisionToken: s(row.revision_token),
        payrollEntryId: s(marker.payroll_entry_id),
        periodMonth: s(marker.period_month),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.id !== "");

  if (settlements.length === 0) return { rows: [], truncated };

  const ids = settlements.map((r) => r.id);
  const members = await getRows<MemberRow>("bank_match_entry_members", {
    ...common,
    select: "match_id,entry_id,matched_cents",
    filters: { client_id: `eq.${clientId}`, entry_id: `in.(${ids.join(",")})` },
    limit: FETCH_CAP,
  });

  const matchIds = [...new Set(members.map((m) => s(m.match_id)).filter((m): m is string => !!m))];
  // A match row the caller cannot see, or one already unmatched, is NOT a live match. The default
  // is therefore "no match", never "assume it is still there" — an unmatch call against a match
  // that is already unmatched is exactly the CLR10 dead end ADV-03 measured.
  const liveMatchIds = new Set<string>();
  if (matchIds.length > 0) {
    const matches = await getRows<MatchRow>("bank_matches", {
      ...common,
      select: "id,status",
      filters: { client_id: `eq.${clientId}`, id: `in.(${matchIds.join(",")})`, status: "in.(pending,live)" },
      limit: FETCH_CAP,
    });
    for (const m of matches) {
      const id = s(m.id);
      if (id) liveMatchIds.add(id);
    }
  }

  const rows: PayrollSettlementReversal[] = settlements.map((r) => {
    const member = members.find((m) => s(m.entry_id) === r.id && liveMatchIds.has(s(m.match_id) ?? ""));
    const matchId = member ? (s(member.match_id) ?? null) : null;
    const amountCents = member ? Math.abs(numOrNull(member.matched_cents) ?? 0) : 0;
    const status: PayrollSettlementReversalStatus =
      r.status === "draft" ? "awaiting_checker" : matchId ? "settled" : "unmatched";
    return {
      settlementEntryId: r.id,
      payrollEntryId: r.payrollEntryId,
      periodMonth: r.periodMonth,
      postingDate: r.postingDate,
      matchId,
      amountCents,
      status,
      revisionToken: r.revisionToken,
    };
  });

  return { rows, truncated };
}
