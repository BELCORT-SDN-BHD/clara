// #940 — THE PER-CLIENT PREPAYMENT-ACCOUNT ROSTER: the read the Registers panel hydrates from and
// the two governed writes behind it.
//
// WHY THIS ROSTER EXISTS. `clara.create_prepayment_schedule`'s prepaid-leg wall is NEGATIVE — not a
// control account, not a bank account, not inactive, not reserved by the fixed-asset or
// staff-advance rosters — so before migration 0306 any ordinary asset account passed it: a deposit,
// an inventory purchase or a prepaid tax could be amortised into expense for twelve months with
// every entry balanced. The POSITIVE statement "this account holds prepayments" is a per-client
// enrolment a bookkeeper makes with a one-line reason (owner ruling 2026-09-18, option B).
//
// THE RELATION IS READ DIRECTLY, exactly as `lib/registers/fa-account-profiles.ts` reads
// `clara.fa_account_profiles`: `clara.prepayment_account_enrolments` carries a real SELECT grant to
// `clara_authenticated` under forced RLS (`p_pae_human` scopes by `firm_id = jwt_firm()`), so the Q3
// read-the-tables mechanism applies and `useHydratedPart`'s `act()` genuinely re-reads the live
// enrolment state after every write. Deriving the panel's rows from anything else — the chart, the
// attention band — would be a second, un-synced implementation of an enumeration the database
// already answers.
//
// EVERY REFUSAL IS THE DOOR'S OWN CLR37. This module states no client-side account rule: the door
// asks the estate's shared eligibility helper and carries its axis through, so an unknown, inactive,
// control-class, bank-bound or role-reserved account is refused with the ESTATE's reason rather
// than a paraphrase invented here. The panel offers a chart dropdown and lets the door refuse.

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** WHAT the account is enrolled to carry. A CLOSED SET on ONE roster: the deferred-revenue mirror
 *  (#941) adds an arm rather than a second relation, so a firm never has two answers to "may this
 *  account carry a release schedule". This build's doors admit `prepayment` only — the enrolment
 *  door refuses `deferred_revenue` by name until #941 states its account-type rule. */
export type PrepaymentAccountPurpose = "prepayment" | "deferred_revenue";

export type PrepaymentAccountRow = {
  id: string;
  account_code: string;
  purpose: PrepaymentAccountPurpose;
  /** REQUIRED at enrolment (owner decision 4). It is the whole audit trail a later reader has for
   *  why this account was treated as a prepayment account, so the panel shows it. */
  reason: string;
  active: boolean;
  enrolled_at: string;
  created_by: string;
  retired_at: string | null;
};

const PREPAYMENT_ACCOUNT_COLS = "id,account_code,purpose,reason,active,enrolled_at,created_by,retired_at";

/** Every LIVE enrolment for this client — the roster as it stands today, which is exactly what the
 *  schedule door asks. Retired rows stay on the relation as historical intervals and are not shown:
 *  the panel is "which accounts hold prepayments", not an audit log. No explicit firm filter (RLS
 *  and `p_pae_human` already scope it, the idiom `lib/registers/accounts.ts` uses for
 *  `coa_accounts`). */
export function loadPrepaymentAccounts(
  session: SessionTokenAccessor,
  clientId: string,
  purpose: PrepaymentAccountPurpose = "prepayment",
): Promise<PrepaymentAccountRow[]> {
  return getRows<PrepaymentAccountRow>("prepayment_account_enrolments", {
    select: PREPAYMENT_ACCOUNT_COLS,
    filters: { client_id: `eq.${clientId}`, purpose: `eq.${purpose}`, active: "eq.true" },
    order: "account_code.asc",
    session,
  });
}

/**
 * `clara.enrol_prepayment_account(p_client, p_account, p_purpose, p_reason, p_op_key)` —
 * bookkeeper+.
 *
 * THE REASON CROSSES TRIMMED. The door refuses a blank one by name
 * (`prepayment_account_enrolment_invalid` / `reason_missing`) and the form refuses it before the
 * door does; trimming here means a reason of spaces can never be stored as one that looks present.
 *
 * VERSION-FORWARD, NOT AN UPDATE: re-enrolling with the SAME reason is idempotent, and a RESTATED
 * reason retires the live row and inserts a fresh one, so the basis a schedule was configured under
 * stays readable for as long as the schedule does.
 */
export function enrolPrepaymentAccount(
  session: SessionTokenAccessor,
  args: {
    clientId: string;
    accountCode: string;
    reason: string;
    purpose?: PrepaymentAccountPurpose;
    opKey?: string;
  },
): Promise<unknown> {
  return callDoor(
    "enrol_prepayment_account",
    {
      p_client: args.clientId,
      p_account: args.accountCode,
      p_purpose: args.purpose ?? "prepayment",
      p_reason: args.reason.trim(),
      p_op_key: args.opKey ?? crypto.randomUUID(),
    },
    { session },
  );
}

/**
 * `clara.retire_prepayment_account(p_client, p_account, p_purpose, p_op_key)` — bookkeeper+.
 *
 * CLOSES THE FUTURE ONLY (owner decision 5): a schedule already running posts to term end, because
 * nothing on the plan lane's monthly admission path asks the roster. Refuses CLR37
 * `prepayment_account_enrolment_invalid` / `not_enrolled` when no live enrolment stands, rather than
 * answering "done" for a retirement that never happened.
 */
export function retirePrepaymentAccount(
  session: SessionTokenAccessor,
  args: { clientId: string; accountCode: string; purpose?: PrepaymentAccountPurpose; opKey?: string },
): Promise<unknown> {
  return callDoor(
    "retire_prepayment_account",
    {
      p_client: args.clientId,
      p_account: args.accountCode,
      p_purpose: args.purpose ?? "prepayment",
      p_op_key: args.opKey ?? crypto.randomUUID(),
    },
    { session },
  );
}
