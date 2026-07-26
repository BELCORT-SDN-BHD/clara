// The counterparty lane's wire client (migration 0021).
//
// WHY IT EXISTS. An opening carry-down seeds payables and receivables as `ap_open_item` /
// `ar_open_item`, and both REQUIRE a counterparty_id. Until 0021 the only way a counterparty
// came into existence was inside `approve_entry`'s birth path — i.e. by approving a coded
// journal entry — so at takeover, before any entry exists, a real trade creditor could not be
// seeded at all. The Bee Creative run hit this immediately (RM105,000.00 owed to one supplier
// across two December invoices). 0021 added the door; this is the dashboard's side of it.
//
// HUMAN LANE ONLY. `create_counterparty` is granted to `clara_authenticated` and to nothing
// else — not the runtime, not either wake role. Minting a trading partner is a human act, so
// it goes through PostgREST as the signed-in member, exactly like every other governed
// writer. The read is the plain RLS table read (policy `p_counterparties_human`,
// firm_id = jwt_firm()).
//
// NO FIGURE IS COMPUTED HERE, and no identity decision is made here: this module lists
// parties and asks the DB to mint one. Deciding whether an incoming DOCUMENT names an
// existing party remains `_resolve_counterparty`'s monopoly.

import { pgrestSelect, rpc } from "./wire";

export type CounterpartyKind = "vendor" | "customer";

export type CounterpartyRow = {
  id: string;
  kind: CounterpartyKind;
  name: string;
  registration_no: string | null;
  tin: string | null;
  merged_into: string | null;
  retired_at: string | null;
};

const COLS = "id,kind,name,registration_no,tin,merged_into,retired_at";

/**
 * The client's LIVE counterparties of one kind, by name.
 *
 * Merged and retired parties are excluded at the query, not in the component: both still hold
 * their slot in the unique indexes, so offering one in a picker would let a human select a
 * party that `create_counterparty` itself refuses to re-mint — a dead option that reads like
 * a bug.
 */
export async function listCounterparties(
  token: string,
  clientId: string,
  kind: CounterpartyKind,
): Promise<CounterpartyRow[]> {
  return pgrestSelect<CounterpartyRow>(
    `counterparties?client_id=eq.${encodeURIComponent(clientId)}`
    + `&kind=eq.${encodeURIComponent(kind)}`
    + `&merged_into=is.null&retired_at=is.null`
    + `&select=${COLS}&order=name.asc`,
    token,
  );
}

export type CreateCounterpartyResult = { counterparty_id: string; created: boolean };

/**
 * Mint a counterparty, or recover the one that already holds the slot.
 *
 * `created: false` is not a failure — the verb is a create-or-get, because the coding lane
 * may have minted the same party from a document between the caller reading the list and
 * pressing the button. The caller should say which happened rather than hiding it: a human
 * who typed a new supplier and silently got an existing row deserves to know.
 *
 * A FRESH op_key per attempt (the DB is idempotent on firm,fn,op_key). Re-using one would
 * replay the FIRST call's receipt, which is right for a retry and wrong for a second party.
 */
export async function createCounterparty(
  token: string,
  input: {
    clientId: string;
    kind: CounterpartyKind;
    name: string;
    registrationNo?: string | null;
    tin?: string | null;
  },
): Promise<CreateCounterpartyResult> {
  const res = await rpc("create_counterparty", {
    p_client: input.clientId,
    p_kind: input.kind,
    p_name: input.name,
    p_registration_no: emptyToNull(input.registrationNo),
    p_tin: emptyToNull(input.tin),
    p_op_key: crypto.randomUUID(),
  }, token);
  const r = res as CreateCounterpartyResult | null;
  if (!r || typeof r.counterparty_id !== "string") {
    throw new Error("create_counterparty returned no counterparty id");
  }
  return { counterparty_id: r.counterparty_id, created: r.created === true };
}

/** Blank is not a registration number. The DB treats '' and NULL differently — the partial
 *  unique indexes key on registration_normalized IS NULL — so an empty box must send null,
 *  not the empty string, or the two index branches stop agreeing about which one applies. */
function emptyToNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}
