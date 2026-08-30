// A shared, PER-CYCLE feature-detection helper for the *_run_due / emit_*/claim_* family of DB
// surfaces the G1 PR-2b producer belts depend on (reconciler-bank-agent.mjs,
// reconciler-close-prep.mjs). MEDIUM-4 (G1 PR-2b fold, Codex r1 review of #449): to_regprocedure
// alone proves NAME + ARGUMENT TYPES resolve to exactly one pg_proc row — it does NOT prove that
// row is a genuine SCALAR (or SETOF) FUNCTION returning the exact type the caller expects. A
// same-name/same-arity PROCEDURE, a text-returning function, or a wrongly-shaped SETOF all
// satisfy to_regprocedure and then fail — or, worse, silently misbehave — the moment the belt
// actually calls it.
//
// THREE STATES, deliberately distinct and never collapsed to a boolean:
//   'absent'  — to_regprocedure itself returns null. The ordinary, EXPECTED pre-migration state
//               for a source that has not shipped yet (F-A3's bank_agent_run_due today) —
//               dormant, never a failure.
//   'invalid' — the name/arity resolves, but prokind/prorettype/proretset (or the EXECUTE grant)
//               do not match. This is NEVER expected in a healthy deploy — a shadow, a botched
//               migration, a signature drift — and the belt must treat it as a FAILURE
//               (bankAgentOk:false / closePrepOk:false), never as "dormant" (which would
//               silently park the cadence for up to its own interval on a genuinely broken
//               surface).
//   'valid'   — resolves AND is a plain function (or SETOF, when returnsSet:true) of the exact
//               return type, EXECUTE-granted to the given role.
//
// LOGGED SHAPE IS SAFE METADATA ONLY (MEDIUM-4's own log-safety clause) — booleans and the
// single-char prokind, never the raw pg_proc row or any value the database itself holds.

/**
 * @param {import("pg").ClientBase} client a clara_runtime connection
 * @param {{signature:string, returnType:string, returnsSet?:boolean, role?:string}} spec
 *   `signature` — the exact to_regprocedure argument, e.g. "clara.bank_agent_run_due(uuid)".
 *   `returnType` — the exact regtype name the function must return, e.g. "jsonb".
 *   `returnsSet` — true for a SETOF-returning function (close_prep_due()); false (default) for
 *   a plain scalar.
 * @returns {Promise<{status:"absent"}|{status:"valid"}|{status:"invalid", detail:object}>}
 */
export async function checkFunctionSurface(client, { signature, returnType, returnsSet = false, role = "clara_runtime" }) {
  const oid = await client.query("select to_regprocedure($1) as oid", [signature]);
  if (oid.rows[0]?.oid == null) return { status: "absent" };

  const r = await client.query(
    `select p.prokind, (p.prorettype = $2::regtype) as return_type_ok, p.proretset,
            has_function_privilege($3, p.oid, 'execute') as executable
       from pg_proc p where p.oid = to_regprocedure($1)`,
    [signature, returnType, role],
  );
  const row = r.rows[0];
  // A raced-away row (dropped between the two reads) is ABSENT, never INVALID — invalid is
  // reserved for a genuinely wrong SHAPE, not a timing gap between two catalog reads.
  if (!row) return { status: "absent" };

  const ok = row.prokind === "f" && row.return_type_ok === true && row.proretset === returnsSet && row.executable === true;
  if (ok) return { status: "valid" };
  return {
    status: "invalid",
    detail: { prokind: row.prokind, returnTypeOk: row.return_type_ok, proretset: row.proretset, executable: row.executable },
  };
}
