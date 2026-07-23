// @frozen
//
// FROZEN — the runtime-lane plan writer for the interview family. NO "workflow" import
// (closure-testable with a stubbed withRuntime, the wave-a-autodraft pattern). The ONLY
// DB surface the interview workflows mutate is clara.update_onboarding_plan (clara_runtime
// GRANT, G2) — the human-floor verbs (begin/commit/cancel_client_onboarding, create_firm,
// resolve_onboarding_plan_item) are the dashboard/PostgREST lane and NEVER transit here.
//
// The DB owns every number: this writer records interview answers as plan items; it never
// computes a financial figure. Revision CAS: update_onboarding_plan raises CLR06 on a
// stale revision (AMB-9); a stale write (a parallel dashboard edit landed during a ≥48h
// park) is reconciled by re-reading the plan's current revision and retrying ONCE, else
// surfaced to the caller.

import type { PlanItemInput } from "./interview.v1.core.js";

export type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};
export type RuntimeExec = <T>(fn: (c: PgExec) => Promise<T>) => Promise<T>;

/** One plan item as the reader returns it (camel — the module convention). `answer` is the
 *  raw jsonb value; `interviewRunBinding` + `itemFingerprint` consume this shape. */
export type PlanItemSnapshot = {
  itemKey: string;
  state: string;
  answer: unknown;
  answeredBy: string | null;
};

export type PlanSnapshot = {
  planId: string;
  revisionToken: string;
  revisionN: number;
  state: "open" | "committed" | "cancelled";
  scopeKind: "firm" | "client";
  clientId: string | null;
  firmId: string;
  /** The plan's current items (for the binding check + the CAS conflict fingerprints). */
  items: PlanItemSnapshot[];
};

/** A stable, key-sorted serialization of an item's material fields (state + answer) — the
 *  fingerprint the CAS conflict check compares. `null` means "the item is absent". */
export function itemFingerprint(item: Pick<PlanItemSnapshot, "state" | "answer"> | null | undefined): string | null {
  if (item == null) return null;
  return stableStringify({ state: item.state, answer: item.answer ?? null });
}

/** Deterministic JSON with recursively sorted object keys (so a re-read jsonb answer and a
 *  JS-object answer compare equal regardless of key order). */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null; // defensive — plan answers are acyclic
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(norm);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = norm((v as Record<string, unknown>)[k]);
    return out;
  };
  return JSON.stringify(norm(value));
}

/** Fingerprints of every current plan item, keyed by item_key — the "what the writer last
 *  knew" baseline a workflow threads into `updatePlanWithCas.knownItems`. */
export function fingerprintMap(items: ReadonlyArray<PlanItemSnapshot>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const it of items) out[it.itemKey] = itemFingerprint(it);
  return out;
}

/** The item_keys in `items` whose CURRENT plan fingerprint (from a fresh re-read) differs from
 *  what the writer last knew (`knownItems`: item_key → fingerprint, absent/undefined ⇒ "was
 *  absent"). A non-empty result means a concurrent editor touched one of OUR keys — the write
 *  must NOT overwrite it (F6); an empty result means the revision bump came from OTHER items and
 *  a fresh-revision retry is safe. */
export function computeConflictingKeys(
  items: ReadonlyArray<PlanItemInput>,
  knownItems: Readonly<Record<string, string | null>> | undefined,
  liveItems: ReadonlyArray<PlanItemSnapshot>,
): string[] {
  const liveByKey = new Map(liveItems.map((i) => [i.itemKey, i]));
  const conflicting: string[] = [];
  for (const it of items) {
    const key = it.item_key;
    const currentFp = itemFingerprint(liveByKey.get(key) ?? null);
    const knownFp = knownItems ? (knownItems[key] ?? null) : null;
    if (currentFp !== knownFp) conflicting.push(key);
  }
  return conflicting;
}

/** True iff a thrown DB error is the plan-CAS stale-revision class (AMB-9 / CLR06). */
export function isStalePlan(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === "CLR06";
}

/** Read the plan's current revision + lifecycle (runtime SELECT, RLS using(true) — 0008
 *  law; the firm is hard-scoped by the plan id). Returns null when the plan is absent. */
export async function readPlan(withRuntime: RuntimeExec, planId: string): Promise<PlanSnapshot | null> {
  return withRuntime(async (c) => {
    const r = await c.query(
      `select id, revision_token, revision_n, state, scope_kind, client_id, firm_id
         from clara.onboarding_plans where id = $1`,
      [planId],
    );
    if (r.rowCount === 0) return null;
    const row = r.rows[0]!;
    const it = await c.query(
      `select item_key, state, answer, answered_by
         from clara.onboarding_plan_items where plan_id = $1`,
      [planId],
    );
    const items: PlanItemSnapshot[] = it.rows.map((x) => ({
      itemKey: String(x.item_key),
      state: String(x.state),
      answer: x.answer ?? null,
      answeredBy: x.answered_by == null ? null : String(x.answered_by),
    }));
    return {
      planId: String(row.id),
      revisionToken: String(row.revision_token),
      revisionN: Number(row.revision_n),
      state: String(row.state) as PlanSnapshot["state"],
      scopeKind: String(row.scope_kind) as PlanSnapshot["scopeKind"],
      clientId: row.client_id == null ? null : String(row.client_id),
      firmId: String(row.firm_id),
      items,
    };
  });
}

/** Verify a firm create_firm receipt BEFORE the workflow writes anything (F2). The receipt
 *  {firmId, planId} is verified iff: the plan is a scope='firm', state='open' plan of firmId,
 *  AND principalUserId is the active OWNER of firmId. clara_runtime cannot read firm_memberships
 *  directly (0006 §8 — the grant is dropped under FORCE RLS), so membership is read through the
 *  runtime's sole membership surface, clara.resolve_chat_principal. Fail-closed on any mismatch. */
export async function verifyFirmCommitReceipt(
  withRuntime: RuntimeExec,
  args: { planId: string; firmId: string; principalUserId: string },
): Promise<boolean> {
  return withRuntime(async (c) => {
    const pr = await c.query(
      `select id, scope_kind, state, firm_id from clara.onboarding_plans where id = $1`,
      [args.planId],
    );
    const plan = pr.rows[0] as { scope_kind?: string; state?: string; firm_id?: string } | undefined;
    if (!plan || plan.scope_kind !== "firm" || plan.state !== "open" || plan.firm_id !== args.firmId) return false;
    const mr = await c.query("select firm_id, role from clara.resolve_chat_principal($1)", [args.principalUserId]);
    const m = mr.rows[0] as { firm_id?: string; role?: string } | undefined;
    return !!m && m.firm_id === args.firmId && m.role === "owner";
  });
}

export type PlanWriteResult = {
  revisionToken: string;
  revisionN: number;
  status: string; // 'updated' from the DB writer, or 'stale_conflict' when a foreign edit hit our keys
  /** On 'stale_conflict': the item_keys a concurrent editor changed (the segment must re-echo). */
  conflictingKeys?: string[];
  /** On 'stale_conflict': the plan's fresh items (so the caller re-echoes against live state
   *  without a second — memoization-hazardous — readPlanStep). */
  liveItems?: PlanItemSnapshot[];
};

async function callUpdate(
  withRuntime: RuntimeExec,
  planId: string,
  expectedRevision: string,
  items: PlanItemInput[],
  answeredBy: string,
  opKey: string,
): Promise<PlanWriteResult> {
  return withRuntime(async (c) => {
    const r = await c.query("select clara.update_onboarding_plan($1, $2, $3::jsonb, $4, $5) as receipt", [
      planId,
      expectedRevision,
      JSON.stringify(items),
      answeredBy,
      opKey,
    ]);
    const receipt = (r.rows[0]?.receipt ?? {}) as { revision_token?: string; revision_n?: number; status?: string };
    return {
      revisionToken: String(receipt.revision_token ?? ""),
      revisionN: Number(receipt.revision_n ?? 0),
      status: String(receipt.status ?? ""),
    };
  });
}

/** Persist ONE confirmed segment's items via update_onboarding_plan under the revision
 *  CAS. `expectedRevision` is the caller's last-known token; on CLR06 (a concurrent
 *  dashboard edit rotated it) we re-read the plan's live revision and retry EXACTLY once.
 *  The op_key hash covers the full payload (plan+revision+items+answered_by, per the DB
 *  writer), so an exact retry after a lost response replays byte-identically — but a
 *  stale-revision retry uses a FRESH op_key (the payload's revision changed, so the same
 *  op_key would be a receipt-hash CLR10). Returns the new revision token to thread on. */
export async function updatePlanWithCas(
  withRuntime: RuntimeExec,
  args: {
    planId: string;
    expectedRevision: string;
    items: PlanItemInput[];
    answeredBy: string;
    opKey: string;
    retryOpKey: string;
    /** What the caller last knew for the keys it writes (item_key → fingerprint; absent ⇒ the
     *  key was absent). Supplied ⇒ CLR06 conflict detection (F6); omitted ⇒ legacy blind retry. */
    knownItems?: Readonly<Record<string, string | null>>;
  },
): Promise<PlanWriteResult> {
  try {
    return await callUpdate(withRuntime, args.planId, args.expectedRevision, args.items, args.answeredBy, args.opKey);
  } catch (err) {
    if (!isStalePlan(err)) throw err;
    // A parallel edit rotated the revision during our park — reconcile. Re-read the live plan
    // (revision + items) ONCE, inside this single step execution (no memoization hazard).
    const live = await readPlan(withRuntime, args.planId);
    if (!live) throw err;
    if (live.state !== "open") throw err; // committed/cancelled underneath — surface (no retry)
    // If the concurrent editor touched one of OUR keys, refuse to overwrite: surface the fresh
    // state so the segment re-echoes against it (F6). Only an unrelated-item bump retries.
    const conflictingKeys = computeConflictingKeys(args.items, args.knownItems, live.items);
    if (conflictingKeys.length > 0) {
      return { revisionToken: live.revisionToken, revisionN: live.revisionN, status: "stale_conflict", conflictingKeys, liveItems: live.items };
    }
    return await callUpdate(withRuntime, args.planId, live.revisionToken, args.items, args.answeredBy, args.retryOpKey);
  }
}
