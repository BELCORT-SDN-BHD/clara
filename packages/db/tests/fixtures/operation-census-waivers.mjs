// WAIVERS for the operation-contract census (packages/db/scripts/operation-census.mjs).
//
// A waiver suppresses EXACTLY ONE (label, target) pair. There is no function-level blanket
// exemption and no wildcard: the key is `<label>:<target>` with the target spelled exactly
// as the census reports it (a function IDENTITY — `clara.name(argtypes)` — for every
// catalog-resolved finding, `clara.name` for a `called_missing`, `ledger-vs-disk` for a
// `frontier_mismatch`). A waiver for `unattributed:clara.foo(uuid)` therefore says nothing
// at all about `called_ungranted:clara.foo(uuid)`, nor about a second overload of `foo`.
//
// THE REASON IS THE EVIDENCE, not a note. `validateWaivers` refuses a reason under 40
// characters, refuses an unknown label, and refuses a wildcard target — so an exemption
// cannot be added without stating what was reviewed. `expires_frontier` is optional and
// records the migration version after which the waiver is expected to be re-reviewed; the
// census reports a waiver that matched nothing as a DEAD exemption rather than ignoring it.
//
// Every entry below was reviewed individually against the live catalog and the call sites
// the census reports; none is here because "the census was noisy".

/** The labels a waiver key may name — kept in step with the census's own FINDING_LABELS. */
export const WAIVABLE_LABELS = [
  "called_missing",
  "called_ungranted",
  "frontier_mismatch",
  "granted_uncalled",
  "named_arg_mismatch",
  "public_execute",
  "unattributed",
];

export const MIN_REASON_CHARS = 40;

/**
 * @type {Map<string, {reason: string, expires_frontier?: string}>}
 */
export const WAIVERS = new Map([
  // REVIEWED 2026-09-09 against the live catalog at frontier 0177 and the call site itself.
  //
  // `clara.record_rule_resolution(uuid,text)` is granted to `clara_runtime_login` and to NO
  // group role — `{clara_fn_owner=X/clara_fn_owner,clara_runtime_login=X/clara_fn_owner}`,
  // read off pg_proc.proacl. packages/runtime/lib/matcher.mjs:186-196 reaches it DELIBERATELY:
  // it issues `reset role` to fall back to the session's bare login identity for exactly this
  // one statement and restores `set role clara_runtime` in a `finally`. The census resolves
  // that call site to the module's pool lanes (clara_runtime / clara_wake_interactive) because
  // the transient login identity is a runtime manoeuvre no static lane map models, not because
  // the grant is missing. rig-meta.mjs's new "clara_runtime_login" key asserts this exact
  // one-name surface catalog-wide, so a REVOKE still reds — in T17 rather than here.
  ["called_ungranted:clara.record_rule_resolution(p_document uuid, p_op_key text)", {
    reason:
      "matcher.mjs:186-196 calls this under a deliberate transient `reset role` to "
      + "clara_runtime_login, which is the sole grantee (pg_proc.proacl, measured); the lane "
      + "map models pool roles, not that manoeuvre. T17's new clara_runtime_login key covers "
      + "the grant itself, so a revoke still fails a test.",
  }],
  // REVIEWED 2026-09-09. A REAL, UNFIXABLE-HERE DEFECT, waived so it is stated rather than
  // silently green — see the report on #618 for the routing note.
  //
  // packages/runtime/workflows/chatTurn.impl.ts:112 (chatTurn_v1's read tool) calls
  // `clara.get_journal_entry($1)` on the READ pool, which SET ROLEs to clara_agent_ro.
  // Migration 0009 (S6 §9/C-11) retired the bare same-firm entry oracle from the agent lane —
  // rig-meta.mjs's agentRo roster is literally `READS.filter(r => r !== "get_journal_entry")`
  // — so that tool answers 42501 today. It is the ONLY call site of the bare reader left in
  // packages/runtime (measured: `grep -n "clara.get_journal_entry(" workflows/*.ts`); every
  // later version calls the client-pinned `get_journal_entry_for` instead, and
  // workflows/registry.ts:88 binds `chatTurn` to chatTurn_v17. The file is FROZEN
  // (frozen-workflows.json lists it), so the fix is not a source edit here: a parked v1 run
  // that resumes into that tool surfaces the read as its `{ error }` result.
  ["called_ungranted:clara.get_journal_entry(p_entry uuid)", {
    reason:
      "chatTurn_v1 (workflows/chatTurn.impl.ts:112, FROZEN per frozen-workflows.json) is the "
      + "last caller of the bare reader 0009 retired from clara_agent_ro; every later version "
      + "uses get_journal_entry_for and registry.ts:88 binds chatTurn to v17. Real defect, "
      + "unfixable in a frozen artifact — reported for routing, not silently absorbed.",
  }],
]);

/**
 * Refuse anything that is not a single, explained (label, target) pair.
 * @param {Map<string, {reason: string, expires_frontier?: string}>} waivers
 */
export function validateWaivers(waivers) {
  if (!(waivers instanceof Map)) throw new TypeError("census waivers must be a Map keyed by <label>:<target>");
  for (const [key, value] of waivers) {
    if (typeof key !== "string" || !key.includes(":")) {
      throw new Error(`census waiver key ${JSON.stringify(key)} is not "<label>:<target>"`);
    }
    const label = key.slice(0, key.indexOf(":"));
    const target = key.slice(key.indexOf(":") + 1);
    if (!WAIVABLE_LABELS.includes(label)) {
      throw new Error(`census waiver ${JSON.stringify(key)} names an unknown label ${JSON.stringify(label)} — it can never suppress a finding`);
    }
    if (target.length === 0 || target.includes("*")) {
      throw new Error(`census waiver ${JSON.stringify(key)} does not name exactly one target — a wildcard or empty target is refused`);
    }
    if (!value || typeof value.reason !== "string" || value.reason.length < MIN_REASON_CHARS) {
      throw new Error(
        `census waiver ${JSON.stringify(key)} needs a reason of at least ${MIN_REASON_CHARS} characters naming the evidence reviewed`
        + ` (got ${value && typeof value.reason === "string" ? value.reason.length : 0})`,
      );
    }
    if (value.expires_frontier !== undefined && typeof value.expires_frontier !== "string") {
      throw new Error(`census waiver ${JSON.stringify(key)} has a non-string expires_frontier`);
    }
  }
  return waivers;
}
