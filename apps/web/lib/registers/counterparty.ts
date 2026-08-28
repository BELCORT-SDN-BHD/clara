// T8 (port-wave plan §4/§5) rung-0 census — CONFIRMED at the LIVE catalog (an
// instance-unique throwaway rig, docker-via-WSL2, migrated to frontier 0140,
// pg_proc/pg_get_functiondef + pg_policy read directly — not migration text)
// after an earlier text-only pass through every migration mention of each
// name. Every signature and grant below is a live read, not an inference.
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
// clara.counterparties — direct RLS table read, policy p_counterparties_human,
// clara_authenticated holds plain SELECT, forced RLS, firm_id = jwt_firm().
// Columns confirmed live via information_schema: id, firm_id, client_id,
// kind['vendor'|'customer'], name, name_normalized, registration_no,
// registration_normalized, tin, payment_terms_days, merged_into, retired_at,
// created_by, created_at, updated_at.
//
// clara.counterparty_aliases — NO clara_authenticated read policy exists
// (confirmed via pg_policy: only p_counterparty_aliases_owner and
// p_counterparty_aliases_freeform). There is deliberately no bulk-read
// function for this table below — see the finding recorded just above
// `OpenItemRow`.
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

// RUNG-0 LIVE-CATALOG FINDING (throwaway rig, migrated to 0140): unlike
// `counterparties`/`open_items`/`open_item_allocations` above, the live
// `clara.counterparty_aliases` table carries NO `clara_authenticated` human
// read policy — only `p_counterparty_aliases_owner` (clara_fn_owner) and
// `p_counterparty_aliases_freeform` (clara_freeform_ro). Confirmed by a
// direct `pg_policy` read, not by migration text. There is deliberately no
// `loadCounterpartyAliases` here: a bulk table read against this relation
// would 403/return zero rows under RLS for every human session. Reported to
// the conductor as a new backend-read finding — `add_counterparty_alias`
// needs no such read (a human types a new alias) and stays wired;
// `retire_counterparty_alias` is EXECUTE-granted but has no honest way to
// discover an alias id to retire, so it is not offered as a control.

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

export type ApplicationGroup = { application_group: string; rows: OpenItemAllocationRow[] };

/** PURE grouping over already-fetched facts (the staffAdvanceEnrolCandidates
 *  precedent, EnrolAccountDialog.tsx — extracted so the narrowing has its own
 *  test independent of rendering). Groups by `application_group`, keeping
 *  only groups whose own operation is 'allocate' or 'apply' (an 'unallocate'
 *  row is itself a negation, never a candidate to negate again) AND that
 *  have no OTHER row in this same set pointing `reverses_allocation_id` at
 *  one of their own rows (already unallocated, visibly, in what was just
 *  read). This is NOT the full legality check — `unallocate_group` itself
 *  owns that, and a real CLR10 (not_unallocatable / already_unallocated)
 *  renders verbatim if this presentation filter ever misses a case the DB
 *  still catches (e.g. a change committed after this read). Rows within
 *  each group keep their own `amount_cents` — this function never sums
 *  one. */
export function unallocateCandidateGroups(rows: OpenItemAllocationRow[]): ApplicationGroup[] {
  const reversedIds = new Set(rows.filter((r) => r.reverses_allocation_id !== null).map((r) => r.reverses_allocation_id as string));
  const byGroup = new Map<string, OpenItemAllocationRow[]>();
  for (const r of rows) {
    if (r.operation_kind === "unallocate") continue;
    if (reversedIds.has(r.id)) continue;
    const existing = byGroup.get(r.application_group);
    if (existing) existing.push(r);
    else byGroup.set(r.application_group, [r]);
  }
  return Array.from(byGroup.entries()).map(([application_group, groupRows]) => ({ application_group, rows: groupRows }));
}

/** clara.open_item_allocations, filtered to the given item ids — the raw rows
 *  `unallocateCandidateGroups` above groups for display (a pure grouping of
 *  already-fetched facts, never a legality decision: whether a group is
 *  still unallocatable is `unallocate_group`'s own refusal to make, rendered
 *  verbatim if it fires). Empty `itemIds` short-circuits to `[]` without a
 *  network call — an `item_id=in.()` filter is malformed PostgREST syntax,
 *  not merely an empty result. */
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

/** TWO PARALLEL fresh reads (counterparties, a full ar_aging/ap_aging pass),
 *  assembled into the two sides the preview card renders. No aliases —
 *  `counterparty_aliases` carries no human-read policy (this file's own
 *  header). Throws (never returns a partial/guessed shape) if either id is
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
  const [counterparties, aging] = await Promise.all([
    getRows<CounterpartyRow>("counterparties", {
      select: COUNTERPARTY_COLS,
      filters: { client_id: `eq.${clientId}`, id: `in.(${survivorId},${mergedId})` },
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
    return { counterparty, aging: aging.counterparties.find((r) => r.counterparty_id === id) ?? null };
  };

  return { domain, as_of: asOf, survivor: side(survivorId), merged: side(mergedId) };
}
