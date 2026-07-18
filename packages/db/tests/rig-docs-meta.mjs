// Slice-5 rig — catalog audit checkers (NOT a test file). The per-slice
// meta-checker in the exact Slice-4 5-function shape (brief §3 · rig-runtime-meta):
//   1. S5_NEW_FNS       — the §3.10 fn matrix, {params, lanes} (null = contract-silent)
//   2. s5GrantAudit()   — hard-vs-observations EXECUTE sweep (catalog-derived)
//   3. overloadFailures — the orphan-overload sweep (reused; no clara proname twice)
//   4. s5RlsAudit()     — FORCE-RLS over EXPECTED_NEW_TABLES + an unlisted catch-all
//   5. runtimeLoginExecuteAudit() — the widened runtime-login EXECUTE surface
//      (record_rule_resolution) + the human-only writers hold NO agent/runtime/login
//      grant + _seed_verified_document is executable by NO app role.
//
// Catalog-derived, never hand lists: a new object cannot silently escape. Where a
// writer's NAME is contract-silent (identifier/alias/reservation writers) the audit
// resolves it from candidates and folds it into the expected lane, so it is checked
// HARD if built; unresolved silent names surface as observations.

import {
  ROLES,
  rootQuery,
  EXPECTED_NEW_TABLES,
  PRE_0007_TABLES,
  resolveFn,
} from "./rig-docs-helpers.mjs";
import { ALLOWED as BASE_ALLOWED, RLS_HELPERS } from "./rig-meta.mjs";
import { overloadFailures } from "./rig-runtime-meta.mjs";

export { overloadFailures };

/** The two Slice-4 NOLOGIN login shells (§1a). record_rule_resolution's widened
 *  EXECUTE lands on the runtime login. */
export const RUNTIME_LOGIN = "clara_runtime_login";
export const AGENT_READ_LOGIN = "clara_agent_read_login";

/** §3.10 fn matrix. lanes = the EXPECTED group-role EXECUTE audience (the login-only
 *  surface is checked separately in runtimeLoginExecuteAudit); params = the
 *  contract-stated parameter names (null where the contract is silent). */
export const S5_NEW_FNS = {
  file_document: { params: null, lanes: { [ROLES.authenticated]: true } },
  retire_document_filing: { params: null, lanes: { [ROLES.authenticated]: true } }, // contract arg list: (filing_id, reason, expected_revision, op_key)
  preview_wrong_client_correction: { params: null, lanes: { [ROLES.authenticated]: true } },
  propose_wrong_client_correction: { params: null, lanes: { [ROLES.authenticated]: true } },
  approve_wrong_client_correction: { params: null, lanes: { [ROLES.authenticated]: true } }, // human-only forever
  confirm_attribution_candidate: { params: null, lanes: { [ROLES.authenticated]: true } },
  dismiss_attribution_candidate: { params: null, lanes: { [ROLES.authenticated]: true } },
  place_legal_hold: { params: null, lanes: { [ROLES.authenticated]: true } },
  release_legal_hold: { params: null, lanes: { [ROLES.authenticated]: true } },
  finalize_document_intake: { params: null, lanes: { [ROLES.runtime]: true } },
  record_rule_resolution: { params: ["p_document", "p_op_key"], lanes: {} }, // login-only — no GROUP role grant (checked in #5)
};

/** Human-only writers that must never carry an agent/runtime/login EXECUTE grant. */
export const HUMAN_ONLY_WRITERS = [
  "approve_wrong_client_correction", "propose_wrong_client_correction",
  "preview_wrong_client_correction", "file_document", "retire_document_filing",
  "confirm_attribution_candidate", "dismiss_attribution_candidate",
  "place_legal_hold", "release_legal_hold",
];

async function policyHelperNames() {
  const r = await rootQuery(
    `select distinct (regexp_matches(coalesce(qual,'') || ' ' || coalesce(with_check,''), 'clara\\.([a-z_][a-z0-9_]*)', 'g'))[1] as fn
       from pg_policies where schemaname = 'clara'`,
  );
  return new Set(r.rows.map((row) => row.fn));
}

/** #2 — the EXECUTE matrix sweep over EVERY clara fn. { hard, observations }:
 *  hard = a wrong grant on a contract-KNOWN fn or ANY PUBLIC execute; observations
 *  = grants on fns the contract does not name (silent writer names, prune, etc.). */
export async function s5GrantAudit() {
  const policyHelpers = await policyHelperNames();
  const broadly = new Set([...RLS_HELPERS, ...policyHelpers]);

  const allowed = {};
  for (const [role, set] of Object.entries(BASE_ALLOWED)) allowed[role] = new Set(set);
  // S5 human writers (the contract-named ones).
  for (const fn of HUMAN_ONLY_WRITERS) allowed[ROLES.authenticated].add(fn);
  // S5 runtime writer(s) named by the contract.
  allowed[ROLES.runtime].add("finalize_document_intake");
  // Resolve the contract-SILENT writer names and fold them into their lane so they
  // are checked HARD if built (unresolved → left out → surfaces as an observation).
  const cid = await resolveFn(["add_client_identifier", "record_client_identifier", "upsert_client_identifier"], { label: "identifier writer" });
  const alias = await resolveFn(["add_client_alias", "record_client_alias", "upsert_client_alias"], { label: "alias writer" });
  if (cid) allowed[ROLES.authenticated].add(cid);
  if (alias) allowed[ROLES.authenticated].add(alias);
  for (const kind of ["reserve", "resize", "settle", "refund"]) {
    const fn = await resolveFn(
      [`${kind}_document_ingest`, `${kind}_ingest_reservation`, `${kind}_document_reservation`, `${kind}_reservation`],
      { label: `reservation ${kind} writer` },
    );
    if (fn) allowed[ROLES.runtime].add(fn);
  }

  // record_rule_resolution is login-only: expected FALSE for every GROUP role.
  const knownNames = new Set(Object.keys(S5_NEW_FNS));
  for (const set of Object.values(allowed)) for (const n of set) knownNames.add(n);
  // the seed helper + legacy-upgrade writer are owner/runtime internals — silent.

  const fns = await rootQuery(
    `select p.oid::int8 as oid, p.proname,
            (p.proacl is null
             or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as public_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'`,
  );
  const hard = [];
  const observations = [];
  for (const f of fns.rows) {
    if (f.public_exec) hard.push(`PUBLIC has EXECUTE on clara.${f.proname} (§3.10 tail: zero PUBLIC post-0007)`);
    if (broadly.has(f.proname)) continue;
    const isKnown = knownNames.has(f.proname) || f.proname.startsWith("_");
    for (const role of Object.keys(allowed)) {
      const priv = await rootQuery("select has_function_privilege($1, $2::oid, 'execute') as ok", [role, f.oid]);
      const expected = allowed[role].has(f.proname);
      if (priv.rows[0].ok !== expected) {
        const line = `${role} EXECUTE clara.${f.proname}: expected ${expected}, got ${priv.rows[0].ok}`;
        if (isKnown) hard.push(line);
        else observations.push(line);
      }
    }
  }
  return { hard, observations };
}

/** proargnames of a clara fn (one array per overload); null when absent. */
export async function fnArgNames(name) {
  const r = await rootQuery(
    `select p.proargnames from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = $1`,
    [name],
  );
  if (!r.rows.length) return null;
  return r.rows.map((x) => x.proargnames ?? []);
}

/** #4 — FORCE-RLS sweep over every EXPECTED_NEW_TABLE + an unlisted-table catch. */
export async function s5RlsAudit() {
  const rows = await rootQuery(
    `select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as force
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relkind = 'r'`,
  );
  const present = new Map(rows.rows.map((r) => [r.relname, r]));
  const problems = [];
  const observations = [];
  for (const t of EXPECTED_NEW_TABLES) {
    const r = present.get(t);
    if (!r) problems.push(`${t}: MISSING from schema clara (contract §3 names it — check for an as-built rename)`);
    else if (!r.rls || !r.force) problems.push(`${t}: rls=${r.rls} force=${r.force} (FORCE RLS required on every new table)`);
  }
  const expected = new Set(EXPECTED_NEW_TABLES);
  for (const r of rows.rows) {
    if (PRE_0007_TABLES.has(r.relname) || expected.has(r.relname)) continue;
    if (!r.rls || !r.force) problems.push(`${r.relname} (unlisted new table): rls=${r.rls} force=${r.force}`);
    else observations.push(`unlisted new table ${r.relname} (FORCE RLS ok) — not named by contract §3, inspect`);
  }
  return { problems, observations };
}

/** #5 — the runtime-login EXECUTE surface + human-only writer isolation +
 *  the owner-only seed helper. Returns { problems, observations }. */
export async function runtimeLoginExecuteAudit() {
  const problems = [];
  const observations = [];
  const groups = [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime];

  const hasExec = async (role, fn) => {
    const r = await rootQuery(
      `select has_function_privilege($1, p.oid, 'execute') as ok
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.proname = $2`,
      [role, fn],
    );
    return r.rows.length ? r.rows[0].ok : null; // null = fn absent
  };

  // (a) record_rule_resolution: EXECUTE on the runtime LOGIN shell; NOT on any group
  //     role, NOT on the agent-read login. (The widened surface, §3.4.)
  const onLogin = await hasExec(RUNTIME_LOGIN, "record_rule_resolution");
  if (onLogin === null) {
    observations.push("record_rule_resolution absent — not yet built");
  } else {
    if (onLogin !== true) problems.push(`record_rule_resolution: clara_runtime_login lacks EXECUTE (§3.4 runtime-login-only surface)`);
    for (const g of groups) {
      if (await hasExec(g, "record_rule_resolution")) problems.push(`record_rule_resolution: ${g} has EXECUTE (must be runtime-login ONLY, not the group)`);
    }
    if (await hasExec(AGENT_READ_LOGIN, "record_rule_resolution")) problems.push("record_rule_resolution: clara_agent_read_login has EXECUTE (must be runtime-login only)");
  }

  // (b) human-only writers: no EXECUTE for agent_ro, runtime group, or either login shell.
  for (const fn of HUMAN_ONLY_WRITERS) {
    if ((await hasExec(ROLES.authenticated, fn)) === null) { observations.push(`${fn} absent — not yet built`); continue; }
    for (const role of [ROLES.agentRo, ROLES.runtime, ROLES.wakeInteractive, ROLES.wakeProactive, RUNTIME_LOGIN, AGENT_READ_LOGIN]) {
      if (await hasExec(role, fn)) problems.push(`${fn}: ${role} holds EXECUTE (human-only writer — §3.10)`);
    }
  }

  // (c) _seed_verified_document executable by NO app role (companion §3.11).
  const seedPresent = await hasExec(ROLES.authenticated, "_seed_verified_document");
  if (seedPresent === null) {
    observations.push("_seed_verified_document absent — not yet built");
  } else {
    for (const role of [...groups, RUNTIME_LOGIN, AGENT_READ_LOGIN]) {
      if (await hasExec(role, "_seed_verified_document")) problems.push(`_seed_verified_document: ${role} holds EXECUTE (owner/superuser-only — §3.11)`);
    }
  }
  return { problems, observations };
}
