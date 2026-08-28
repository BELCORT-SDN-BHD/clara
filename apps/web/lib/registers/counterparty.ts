// T8 (port-wave plan §4/§5) rung-0 census — instance-unique throwaway rig blocked on
// local DB credentials (see the T8 build report); every signature below is grounded
// against the LIVE catalog TEXT at the migration frontier this branch forked from
// (0001..0140, no docker/pg available locally to run pg_get_functiondef directly) —
// every function was traced from its FIRST `create function` to every later migration
// that so much as MENTIONS its name, so a dynamic splice would have been caught (the
// "chase the LIVE body" rule, apps/web/AGENTS.md). Confirm against a real
// pg_proc/pg_get_functiondef read before merge; this header records exactly what that
// confirmation should re-derive.
//
// clara.customer_statement(p_client uuid, p_counterparty uuid, p_from date, p_to date)
// / clara.supplier_statement(same) — packages/db/migrations/0040_wave_c_c_tieout.sql:
// 4069/4079, delegating to clara._statement_core (0040:4013-4066). bookkeeper+. UNRECUT
// (only ONE `create function` for either name in the whole migration set). Running-
// balance ledger: item rows (keyed on item_date) UNION allocation rows (keyed on
// effective_date), ordered, each row's own `running_balance_cents` DB-computed —
// this module never sums a delta itself (hard constraint 2).
//
// clara.set_counterparty_terms(p_counterparty uuid, p_days int, p_op_key text) —
// 0040:3864. bookkeeper+. UNRECUT. Refuses CLR10 "terms_out_of_range" (days must be
// 1-365) and CLR08 on a merged/retired counterparty.
//
// clara.counterparties / clara.counterparty_aliases — direct RLS table reads (policies
// p_counterparties_human / the client-scoped alias read, 0009:1117 / 0011:~660),
// clara_authenticated holds plain SELECT, forced RLS, firm_id = jwt_firm(). Columns
// confirmed at their DDL: counterparties(id, firm_id, client_id, kind['vendor'|
// 'customer'], name, name_normalized, registration_no, registration_normalized, tin,
// payment_terms_days[0040], merged_into[0011], retired_at[0011], created_by,
// created_at, updated_at); counterparty_aliases(id, firm_id, client_id,
// counterparty_id, alias_normalized, alias_display, origin['former_name'|
// 'trade_name'|'human'], created_by, created_at, retired_at).
//
// clara.open_items / clara.open_item_allocations — direct RLS table reads (0037:851
// grants plain SELECT to clara_authenticated, forced RLS, firm-scoped). Used here ONLY
// to list a counterparty's own application groups for the unallocate surface — never to
// re-derive an outstanding balance (that stays `_aging_core`'s / `_statement_core`'s
// monopoly, read via ../registers/aging.ts's `loadAging` and `getCustomerStatement`/
// `getSupplierStatement` below).

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import { loadAging, type AgingDomain, type AgingCounterpartyRow } from "./aging";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

// =====================================================================
// Reads — direct RLS table reads.
// =====================================================================

export type CounterpartyKind = "vendor" | "customer";

export type CounterpartyRow = {
  id: string;
  firm_id: string;
  client_id: string;
  kind: CounterpartyKind | string;
  name: string;
  name_normalized: string;
  registration_no: string | null;
  tin: string | null;
  payment_terms_days: number | null;
  merged_into: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
};

const COUNTERPARTY_COLS =
  "id,firm_id,client_id,kind,name,name_normalized,registration_no,tin," +
  "payment_terms_days,merged_into,retired_at,created_at,updated_at";

/** Every counterparty of one kind for this client — live, retired AND merged, oldest
 *  first — so the hygiene panel can show full history honestly (a merged/retired row
 *  still renders, with its own status, rather than silently vanishing). A caller that
 *  needs only LIVE candidates (a merge/rename/terms picker) filters the returned array
 *  on `merged_into === null && retired_at === null` itself — that is a presentation
 *  filter over already-fetched facts, never a re-implementation of a DB predicate
 *  (review law 3): the DB is the one that refuses an act against a dead row. */
export function loadCounterparties(
  session: SessionTokenAccessor,
  clientId: string,
  kind: CounterpartyKind,
  opts: Opts = {},
): Promise<CounterpartyRow[]> {
  return getRows<CounterpartyRow>("counterparties", {
    select: COUNTERPARTY_COLS,
    filters: { client_id: `eq.${clientId}`, kind: `eq.${kind}` },
    order: "name.asc",
    session,
    signal: opts.signal,
  });
}

export type CounterpartyAliasRow = {
  id: string;
  client_id: string;
  counterparty_id: string;
  alias_normalized: string;
  alias_display: string;
  origin: "former_name" | "trade_name" | "human" | string;
  created_at: string;
  retired_at: string | null;
};

const ALIAS_COLS = "id,client_id,counterparty_id,alias_normalized,alias_display,origin,created_at,retired_at";

/** Every alias (live AND retired) recorded for this client, across every
 *  counterparty — the hygiene panel groups them client-side by
 *  `counterparty_id` (a pure grouping of already-fetched rows, not a
 *  derived legality decision). */
export function loadCounterpartyAliases(
  session: SessionTokenAccessor,
  clientId: string,
  opts: Opts = {},
): Promise<CounterpartyAliasRow[]> {
  return getRows<CounterpartyAliasRow>("counterparty_aliases", {
    select: ALIAS_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "created_at.asc",
    session,
    signal: opts.signal,
  });
}

export type OpenItemRow = {
  id: string;
  client_id: string;
  domain: AgingDomain;
  counterparty_id: string;
  entry_id: string;
  item_kind: "invoice" | "credit_note" | "bill" | "settlement" | "adjustment" | "opening" | "reversal_unwind" | string;
  item_date: string;
  due_date: string | null;
  amount_cents: number;
};

const OPEN_ITEM_COLS = "id,client_id,domain,counterparty_id,entry_id,item_kind,item_date,due_date,amount_cents";

/** clara.open_items — every item ever recorded for this counterparty in this domain
 *  (not only the currently-outstanding ones `loadAging`'s items[] returns) — the input
 *  the unallocate surface needs to find every application_group that ever touched this
 *  party, including one whose item has since fully settled. `amount_cents` is the
 *  item's ORIGINAL face value, never an outstanding balance — outstanding stays
 *  `_aging_core`'s monopoly (loadAging). */
export function loadCounterpartyOpenItems(
  session: SessionTokenAccessor,
  clientId: string,
  domain: AgingDomain,
  counterpartyId: string,
  opts: Opts = {},
): Promise<OpenItemRow[]> {
  return getRows<OpenItemRow>("open_items", {
    select: OPEN_ITEM_COLS,
    filters: { client_id: `eq.${clientId}`, domain: `eq.${domain}`, counterparty_id: `eq.${counterpartyId}` },
    order: "item_date.asc",
    session,
    signal: opts.signal,
  });
}

export type OpenItemAllocationRow = {
  id: string;
  client_id: string;
  domain: AgingDomain;
  item_id: string;
  application_group: string;
  operation_kind: "allocate" | "unallocate" | "apply" | string;
  reverses_allocation_id: string | null;
  amount_cents: number;
  reason: string | null;
  created_by: string;
  created_at: string;
};

const ALLOCATION_COLS =
  "id,client_id,domain,item_id,application_group,operation_kind,reverses_allocation_id,amount_cents,reason,created_by,created_at";

/** clara.open_item_allocations, filtered to the given item ids — the raw rows the
 *  unallocate surface groups CLIENT-SIDE by `application_group` for display (a pure
 *  grouping of already-fetched facts, never a legality decision: whether a group is
 *  still unallocatable is `unallocate_group`'s own refusal to make, rendered verbatim
 *  if it fires). Empty `itemIds` short-circuits to `[]` without a network call — an
 *  `item_id=in.()` filter is malformed PostgREST syntax, not merely an empty result. */
export function loadOpenItemAllocationsForItems(
  session: SessionTokenAccessor,
  clientId: string,
  itemIds: string[],
  opts: Opts = {},
): Promise<OpenItemAllocationRow[]> {
  if (itemIds.length === 0) return Promise.resolve([]);
  return getRows<OpenItemAllocationRow>("open_item_allocations", {
    select: ALLOCATION_COLS,
    filters: { client_id: `eq.${clientId}`, item_id: `in.(${itemIds.join(",")})` },
    order: "created_at.desc",
    session,
    signal: opts.signal,
  });
}

// =====================================================================
// Statement reads — governed RPC transport, but READ-flavoured: no
// confirmation UI, no re-read-after semantics (apps/web/AGENTS.md's own
// "a read-flavoured RPC still rides callDoor as transport but is NOT a
// governed act" rule, aging.ts's precedent).
// =====================================================================

export type CounterpartyStatementRow = {
  event_date: string;
  row_type: "item" | "allocation" | string;
  label: string | null;
  delta_cents: number;
  running_balance_cents: number;
  item_id: string | null;
  allocation_id: string | null;
};

export type CounterpartyStatement = {
  counterparty_id: string;
  domain: AgingDomain;
  from: string | null;
  to: string;
  opening_balance_cents: number;
  rows: CounterpartyStatementRow[];
  closing_balance_cents: number;
};

/** clara.customer_statement(p_client, p_counterparty, p_from, p_to) — 0040:4069,
 *  bookkeeper+. `from`/`to` nullable at the wire; the DB's `_statement_core` treats a
 *  null `from` as "since the beginning" and a null `to` as required-by-caller here
 *  (this module always sends a real `to`, following aging.ts's `businessToday()`
 *  precedent at the call site). */
export function getCustomerStatement(
  clientId: string,
  counterpartyId: string,
  from: string | null,
  to: string,
  opts: Opts = {},
): Promise<CounterpartyStatement> {
  return callDoor<CounterpartyStatement>(
    "customer_statement",
    { p_client: clientId, p_counterparty: counterpartyId, p_from: from, p_to: to },
    opts,
  );
}

/** clara.supplier_statement — same shape, AP domain. 0040:4079. */
export function getSupplierStatement(
  clientId: string,
  counterpartyId: string,
  from: string | null,
  to: string,
  opts: Opts = {},
): Promise<CounterpartyStatement> {
  return callDoor<CounterpartyStatement>(
    "supplier_statement",
    { p_client: clientId, p_counterparty: counterpartyId, p_from: from, p_to: to },
    opts,
  );
}

/** Dispatches on `AgingDomain` the same way `loadAging` (./aging.ts) does — `"ar"` is
 *  always the customer/receivables statement, `"ap"` the supplier/payables one. */
export function getCounterpartyStatement(
  domain: AgingDomain,
  clientId: string,
  counterpartyId: string,
  from: string | null,
  to: string,
  opts: Opts = {},
): Promise<CounterpartyStatement> {
  const fn = domain === "ar" ? getCustomerStatement : getSupplierStatement;
  return fn(clientId, counterpartyId, from, to, opts);
}

// =====================================================================
// The merge preview — the wave's heaviest-treatment surface (port-wave plan
// §5's note on merge_counterparties + the Mobbin grounding's ManyChat-shaped
// "named, separate preview step"). Composed from THREE fresh reads, never a
// re-read of already-loaded state (the Mobbin doc's own warning: "the counts
// could be stale or paginated differently from what the merge door will
// actually act on") — the DB owns every figure this shows; this module only
// assembles the three responses into one shape for the card to render.
// =====================================================================

/** `kind` -> the aging/statement domain it lives in — `loadAging`'s and
 *  `getCounterpartyStatement`'s own dispatch, restated here because the merge
 *  picker starts from a `CounterpartyKind`, not a domain. */
export function domainForKind(kind: CounterpartyKind): AgingDomain {
  return kind === "customer" ? "ar" : "ap";
}

export type CounterpartyMergeSide = {
  counterparty: CounterpartyRow;
  /** Live (non-retired) aliases only — a retired alias carries no bearing on
   *  what a human judging this merge needs to see. */
  aliases: CounterpartyAliasRow[];
  /** This side's row from a FRESH ar_aging/ap_aging read, or `null` when the
   *  side carries no currently-outstanding open items (a real, DB-confirmed
   *  absence — `_aging_core` simply omits a counterparty with nothing
   *  outstanding, never a placeholder for "not read yet"). */
  aging: AgingCounterpartyRow | null;
};

export type CounterpartyMergePreview = {
  domain: AgingDomain;
  as_of: string;
  survivor: CounterpartyMergeSide;
  merged: CounterpartyMergeSide;
};

/** Three PARALLEL fresh reads (counterparties, counterparty_aliases, a full
 *  ar_aging/ap_aging pass), assembled into the two sides the preview card
 *  renders. Throws (never returns a partial/guessed shape) if either id is
 *  missing from the fresh counterparties read — the caller's DataState
 *  renders that as a real read failure, not a silent empty preview. */
export async function loadCounterpartyMergePreview(
  session: SessionTokenAccessor,
  clientId: string,
  kind: CounterpartyKind,
  survivorId: string,
  mergedId: string,
  asOf: string,
  opts: Opts = {},
): Promise<CounterpartyMergePreview> {
  const domain = domainForKind(kind);
  const [counterparties, aliases, aging] = await Promise.all([
    getRows<CounterpartyRow>("counterparties", {
      select: COUNTERPARTY_COLS,
      filters: { client_id: `eq.${clientId}`, id: `in.(${survivorId},${mergedId})` },
      session,
      signal: opts.signal,
    }),
    getRows<CounterpartyAliasRow>("counterparty_aliases", {
      select: ALIAS_COLS,
      filters: { client_id: `eq.${clientId}`, counterparty_id: `in.(${survivorId},${mergedId})`, retired_at: "is.null" },
      order: "created_at.asc",
      session,
      signal: opts.signal,
    }),
    loadAging(session, domain, clientId, asOf),
  ]);

  const side = (id: string): CounterpartyMergeSide => {
    const counterparty = counterparties.find((c) => c.id === id);
    if (!counterparty) {
      throw new Error(`loadCounterpartyMergePreview: counterparty ${id} not found in the fresh read`);
    }
    return {
      counterparty,
      aliases: aliases.filter((a) => a.counterparty_id === id),
      aging: aging.counterparties.find((r) => r.counterparty_id === id) ?? null,
    };
  };

  return { domain, as_of: asOf, survivor: side(survivorId), merged: side(mergedId) };
}
