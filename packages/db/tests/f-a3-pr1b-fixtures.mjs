// F-A3 PR-1b -- agent-limb battery shared fixture CORE (NOT a test file: the name does not end
// in `.test.mjs`, so `node --test` ignores it). Split out of f-a3-pr1b-agent-limb.test.mjs purely
// to keep each module under the repo's 500-line gate (the wave-a-helpers/wave-a-fixtures split
// precedent, also used by x38-match-fixtures.mjs). Every function here is STATELESS.

import { rootQuery } from "./a21-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import { GUARD } from "./x38-match-fixtures.mjs";

export const AGENT_UUID = "00000000-0000-4000-8000-000000c1a7a0"; // clara.agent_user_id()

/** The ctx a future wrapper/agent-core will build. Every field this file's ten CoR'd bodies
 *  read is here; extra keys are harmless (jsonb, extend-only reads). */
export function agentCtx(firm, extra = {}) {
  return {
    actor: AGENT_UUID, firm,
    is_agent: true, on_behalf_of: null, wake_kind: "bank_agent",
    rationale: "f31b battery: agent-arm cell",
    model: { provider: "openai", model: "gpt-5.6-terra", version: "v1" },
    ...extra,
  };
}

export function coreCallSql(fnName, argCasts) {
  const specs = [{ name: "p_ctx", cast: "jsonb" }, ...argCasts.map((c) => ({ name: c.name, cast: c.cast }))];
  return `select clara.${fnName}(${specs.map((s, i) => `${s.name} => $${i + 1}${s.cast ? `::${s.cast}` : ""}`).join(", ")}) as result`;
}
export async function coreCall(fnName, argCasts, ctx, args) {
  const r = await rootQuery(coreCallSql(fnName, argCasts), [JSON.stringify(ctx), ...args]);
  return r.rows[0].result;
}
/** Runs fn against a single transacted client `c` -- `c.query(sql, params)` -- so a fixture
 *  (entry + lines) and the core call that depends on it, or a core call and the
 *  bank_agent_receipts row its own deferred wall demands, land in ONE transaction (db-tests.md's
 *  withTxn rule: a deferred constraint trigger fires on the first statement alone otherwise). */
export async function inTxn(fn) {
  return withTxn(async (c) => {
    await c.query(GUARD);
    return fn(c);
  });
}

export async function entryRow(entry) {
  const r = await rootQuery("select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry]);
  return r.rows[0]?.row ?? null;
}
export async function receiptRow(entry) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.entry_post_receipts x where x.entry_id=$1", [entry]);
  return r.rows[0]?.row ?? null;
}
