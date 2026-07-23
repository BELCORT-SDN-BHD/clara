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

export type PlanSnapshot = {
  planId: string;
  revisionToken: string;
  revisionN: number;
  state: "open" | "committed" | "cancelled";
  scopeKind: "firm" | "client";
  clientId: string | null;
  firmId: string;
};

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
    return {
      planId: String(row.id),
      revisionToken: String(row.revision_token),
      revisionN: Number(row.revision_n),
      state: String(row.state) as PlanSnapshot["state"],
      scopeKind: String(row.scope_kind) as PlanSnapshot["scopeKind"],
      clientId: row.client_id == null ? null : String(row.client_id),
      firmId: String(row.firm_id),
    };
  });
}

export type PlanWriteResult = { revisionToken: string; revisionN: number; status: string };

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
  },
): Promise<PlanWriteResult> {
  try {
    return await callUpdate(withRuntime, args.planId, args.expectedRevision, args.items, args.answeredBy, args.opKey);
  } catch (err) {
    if (!isStalePlan(err)) throw err;
    // A parallel dashboard edit rotated the revision during our park — reconcile: read
    // the live revision and retry ONCE with a fresh op_key (the payload changed).
    const live = await readPlan(withRuntime, args.planId);
    if (!live) throw err;
    if (live.state !== "open") throw err; // committed/cancelled underneath — surface (no retry)
    return await callUpdate(withRuntime, args.planId, live.revisionToken, args.items, args.answeredBy, args.retryOpKey);
  }
}
