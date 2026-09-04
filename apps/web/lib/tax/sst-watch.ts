// The client Tax tab's ONE read, and its ONE governed write.
//
// WHAT IS ACTUALLY REACHABLE ON THIS TAB TODAY, measured rather than assumed (map item
// CB-AE2E-032's own backend census, re-read against packages/db/migrations on this checkout):
//
//   EXISTS AND IS HUMAN-REACHABLE
//     * the SST compliance watch, and only through `clara.list_review_queue`'s top-level
//       `compliance` object — `clara.compliance_watches` itself carries NO `clara_authenticated`
//       grant at all, so there is no table read of it from a browser;
//     * `clara.ack_compliance_watch` / `snooze_compliance_watch` / `resolve_compliance_watch`,
//       all three EXECUTE-granted to `clara_authenticated` and already wired at the firm
//       altitude (components/firm/compliance-watch-affordance.tsx);
//     * `clara.set_turnover_classification(uuid,text,text,text,text,text,date,text)` — LIVE,
//       EXECUTE-granted to `clara_authenticated` (0016_a21_compliance_watch.sql:4744-4751, tail-
//       asserted at :5085), with NO user interface anywhere in the product before this train.
//
//   DOES NOT EXIST ANYWHERE IN THE CATALOG
//     * any SST registration, taxable-period or return object; any CP204 or Form C object; and
//       the income-tax computation function the Tax tab's old copy named by signature.
//
//   EXISTS BUT IS NOT READABLE BY A HUMAN SESSION
//     * the SST rate/threshold and tax-law reference tables carry no `clara_authenticated`
//       grant, so this module never tries to read them — which is why the service-group choices
//       offered by the classification control below come from the client's OWN compliance
//       envelope rather than from the threshold schedule.
//
// ONE ENVELOPE, TWO HALVES. The `compliance` aggregate carries this client's turnover figures
// and watch state but NOT the `watch_id` the three acts address; the paginated `rows[]` carries
// a `compliance_watch` row that does. Both come back from the same call, so this module makes
// one and splits it — never two calls for two halves of one answer.

import { listReviewQueue, type ReviewQueueRow } from "@/lib/firm/needs-you";
import { parseComplianceEnvelope, type ComplianceClientWatch } from "@/lib/firm-admin/compliance";
import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type ClientSstWatch = {
  /** True when no compliance evaluation run has completed in the last 48h — the DB's own
   *  staleness flag, surfaced so a professional is never shown a figure without being told the
   *  evaluator behind it may be behind. */
  staleEvaluator: boolean;
  /** This client's watch rows from the aggregate, one per service group. Empty is a real
   *  answer: no watch is open for this client. */
  watches: ComplianceClientWatch[];
  /** The queue row for this client's compliance watch, when one is open — the ONLY carrier of
   *  `watch_id`, and therefore the only thing the three governed acts can be hung on. `null`
   *  means no actionable watch row, which is not the same as "no watch figures". */
  actionable: ReviewQueueRow | null;
};

/** One page is enough: `compliance` and `counts` are computed over the WHOLE population
 *  regardless of `p_limit` (the live body's CTEs read `all_rows`, never `page`), and a single
 *  client has at most a handful of open rows. */
const PAGE = 50;

export async function loadClientSstWatch(
  session: SessionTokenAccessor,
  clientId: string,
): Promise<ClientSstWatch> {
  const envelope = await listReviewQueue(session, { client_id: clientId }, null, PAGE);
  const register = parseComplianceEnvelope(envelope);
  // The aggregate is firm-wide in shape even when the scope is one client, so it is filtered by
  // id here rather than trusted to already be narrow — the same belt the close tab applies to a
  // plan document it reads under a client scope.
  const watches = register.clients.filter((row) => row.client_id === clientId);
  const actionable = envelope.rows.find((row) => row.row_kind === "compliance_watch" && row.watch_id) ?? null;
  return { staleEvaluator: register.staleEvaluator, watches, actionable };
}

/** The three values `p_classification` admits — the live body's own `not in (...)` guard
 *  (0016:922). A fourth value is refused CLR10 by the DB; this list exists so the control
 *  cannot OFFER one, never as a substitute for that refusal. */
export const TURNOVER_CLASSIFICATIONS = ["included", "excluded", "unknown_or_mixed"] as const;
export type TurnoverClassification = (typeof TURNOVER_CLASSIFICATIONS)[number];

export type SetTurnoverClassificationInput = {
  clientId: string;
  /** Must exist on the client's own chart — the door checks `clara.coa_accounts` and refuses
   *  CLR10 otherwise. The control reads the chart so it never offers a code that is not there. */
  accountCode: string;
  classification: TurnoverClassification;
  /** Optional. When given it must name a row of `clara.sst_threshold_schedule` or the door
   *  refuses CLR10 "unknown service group". That table is not readable by a human session, so
   *  the control offers only the groups this client's OWN compliance envelope reports. */
  serviceGroup: string | null;
  /** Required, non-blank — the door's own CLR10. */
  reason: string;
  /** Required by the door for a WATCH-LOWERING move (to `excluded`, from `included` to
   *  `unknown_or_mixed`, or a service-group reassignment), which additionally requires admin.
   *  This module does NOT pre-compute which moves are lowering: that predicate reads the
   *  classification in force at the effective date, which no human read exposes. The DB decides
   *  and refuses verbatim. */
  evidence: string;
  /** `YYYY-MM-DD`. The door closes the open predecessor row at this date minus one day so the
   *  effective-dated history stays gapless. */
  effectiveFrom: string;
};

/** `clara.set_turnover_classification` — bookkeeper+, and admin+ for a watch-lowering move.
 *  A fresh `op_key` per attempt, never reused across a retry (doors.ts's law). */
export function setTurnoverClassification(
  session: SessionTokenAccessor,
  input: SetTurnoverClassificationInput,
): Promise<unknown> {
  return callDoor(
    "set_turnover_classification",
    {
      p_client: input.clientId,
      p_account_code: input.accountCode,
      p_classification: input.classification,
      p_service_group: input.serviceGroup,
      p_reason: input.reason,
      p_evidence: input.evidence,
      p_effective_from: input.effectiveFrom,
      p_op_key: crypto.randomUUID(),
    },
    { session },
  );
}
