// HUMAN-lane wire client for the /accounts page (closes live-gate-run-2026-07-24 finding
// 1). All reads are firm-scoped PostgREST SELECTs on clara.coa_accounts (RLS pins them to
// jwt_firm()); the one mutation is the governed writer clara.upsert_account (0009/0017 —
// p_client, p_code, p_name, p_type, p_special_acc_type, p_op_key, p_account_class),
// granted to clara_authenticated at bookkeeper+. Never a hand-written accounts row — the
// DB owns every account (CLAUDE.md law); this module only calls the named function.

import { pgrestSelect, rpc } from "../shared/wire";
import type { AccountRow } from "./accountsModel";

export type { AccountRow };

const ACCOUNT_COLS = "account_code,name,account_type,account_class,special_acc_type,is_active";

/** One client's chart of accounts, ordered by code. Empty means exactly what item 1 says:
 *  this client cannot receive any posting until an account exists. */
export async function listAccounts(token: string, clientId: string): Promise<AccountRow[]> {
  return pgrestSelect<AccountRow>(
    `coa_accounts?client_id=eq.${encodeURIComponent(clientId)}&select=${ACCOUNT_COLS}&order=account_code.asc`,
    token,
  );
}

/** A cheap existence probe (limit=1) for the /clients/plan gap banner — item 6. We only
 *  need "zero or not", never a full read, so this never fetches more than one row. */
export async function hasAnyAccounts(token: string, clientId: string): Promise<boolean> {
  const rows = await pgrestSelect<{ account_code: string }>(
    `coa_accounts?client_id=eq.${encodeURIComponent(clientId)}&select=account_code&limit=1`,
    token,
  );
  return rows.length > 0;
}

const opKey = () => crypto.randomUUID();

/** upsert_account (0009 7-arg latest signature, bookkeeper+). Refusals throw PgrestError
 *  (clr + reason) — the caller renders the DB's message verbatim, never suppressed behind
 *  a bare code. `opKeyOverride` lets the template-apply loop supply the DETERMINISTIC
 *  coaSeedOpKey (WB-R19); omitted, a fresh op_key is minted (the ad-hoc single-add form's
 *  one-off intent). */
export async function upsertAccount(
  token: string,
  args: {
    clientId: string;
    code: string;
    name: string;
    type: string;
    special?: string | null;
    accountClass?: string | null;
    opKeyOverride?: string;
  },
): Promise<{ client_id: string; account_code: string }> {
  const out = (await rpc(
    "upsert_account",
    {
      p_client: args.clientId,
      p_code: args.code,
      p_name: args.name,
      p_type: args.type,
      p_special_acc_type: args.special ?? null,
      p_op_key: args.opKeyOverride ?? opKey(),
      p_account_class: args.accountClass ?? null,
    },
    token,
  )) as { client_id?: string; account_code?: string } | null;
  if (!out?.account_code) throw new Error("upsert_account returned no account_code");
  return { client_id: out.client_id ?? args.clientId, account_code: out.account_code };
}
