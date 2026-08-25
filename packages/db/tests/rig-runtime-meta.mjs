// Slice-4 rig — catalog audit checkers (NOT a test file). §6 item 7: the exact
// new-fn signature set, the five-lane EXECUTE matrix (catalog-derived, never a
// hand list), zero PUBLIC-executable clara fns post-0006, the FORCE-RLS sweep
// over every new table, and the §3.0 login-shell role audit. Each returns
// failure strings (and, separately, observations on contract-silent surfaces)
// so the test bodies stay assertion-thin.

import { ROLES, rootQuery } from "./rig-runtime-helpers.mjs";
import { EXPECTED_NEW_TABLES, PRE_0006_TABLES } from "./rig-runtime-helpers.mjs";
import { ALLOWED as BASE_ALLOWED, RLS_HELPERS } from "./rig-meta.mjs";

/** Contract-named new fns + their expected single-lane EXECUTE audience.
 *  `lanes: null` = the contract is silent on the audience (observed only);
 *  `params: null` = the contract does not state the parameter names. */
export const S4_NEW_FNS = {
  resolve_chat_principal: { params: ["p_sub"], lanes: { [ROLES.runtime]: true } },
  begin_chat_turn: { params: ["p_session", "p_author", "p_turn_key", "p_user_parts", "p_model"], lanes: { [ROLES.runtime]: true } },
  settle_chat_turn: { params: ["p_task", "p_parts", "p_tokens", "p_outcome", "p_error_code"], lanes: { [ROLES.runtime]: true } },
  answer_interruption: { params: ["p_id", "p_answer", "p_op_key"], lanes: { [ROLES.authenticated]: true } },
  cancel_agent_task: { params: ["p_task", "p_op_key"], lanes: { [ROLES.authenticated]: true } },
  share_chat_session: { params: null, mustInclude: ["p_op_key"], lanes: { [ROLES.authenticated]: true } },
  relay_health: { params: null, lanes: null }, // §3.8 — audience contract-silent
  // Round-2 amendments (S4-AB4 / S4-AB6) — both runtime-only.
  open_interruption: { params: ["p_task", "p_hook_token", "p_question", "p_asked_of"], lanes: { [ROLES.runtime]: true } },
  checkpoint_turn: { params: ["p_task", "p_segment", "p_tokens", "p_parts"], lanes: { [ROLES.runtime]: true } },
};

/** Known ungranted internals from 0002–0005 (any app-role grant on one = hard failure). */
const KNOWN_INTERNALS = new Set([
  "assert_client_resolved", "assert_provenance", "assert_wake_allowed", "assert_books_current",
  "is_high_stakes", "eligible_checker_count", "wake_context", "agent_user_id",
]);

async function policyHelperNames() {
  const r = await rootQuery(
    `select distinct (regexp_matches(coalesce(qual,'') || ' ' || coalesce(with_check,''), 'clara\\.([a-z_][a-z0-9_]*)', 'g'))[1] as fn
       from pg_policies where schemaname = 'clara'`,
  );
  return new Set(r.rows.map((row) => row.fn));
}

/** The Slice-4 EXECUTE matrix sweep — catalog-derived over EVERY clara fn.
 *  Returns { hard, observations }: hard = a wrong grant on a contract-known fn
 *  or ANY PUBLIC execute (zero post-0006); observations = grants on fns the
 *  contract does not name (prune/heartbeat/health/etc.) for the lane report. */
export async function s4GrantAudit() {
  const policyHelpers = await policyHelperNames();
  const broadly = new Set([...RLS_HELPERS, ...policyHelpers]);
  const allowed = {};
  for (const [role, set] of Object.entries(BASE_ALLOWED)) allowed[role] = new Set(set);
  allowed[ROLES.authenticated].add("answer_interruption");
  allowed[ROLES.authenticated].add("cancel_agent_task");
  allowed[ROLES.authenticated].add("share_chat_session");
  allowed[ROLES.runtime].add("resolve_chat_principal");
  allowed[ROLES.runtime].add("begin_chat_turn");
  allowed[ROLES.runtime].add("settle_chat_turn");
  allowed[ROLES.runtime].add("open_interruption");
  allowed[ROLES.runtime].add("checkpoint_turn");

  const knownNames = new Set([...KNOWN_INTERNALS, ...Object.keys(S4_NEW_FNS)]);
  for (const set of Object.values(allowed)) for (const n of set) knownNames.add(n);

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
    if (f.public_exec) hard.push(`PUBLIC has EXECUTE on clara.${f.proname} (§3 tail sweep: zero PUBLIC post-0006)`);
    if (broadly.has(f.proname)) continue;
    const contractSilent = S4_NEW_FNS[f.proname]?.lanes === null;
    const isKnown = (knownNames.has(f.proname) || f.proname.startsWith("_")) && !contractSilent;
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

/** No clara proname may carry two overloads (orphan-overload sweep, §6 item 7). */
export async function overloadFailures() {
  // AMENDMENT 0038 (WCB-R1, design v2.1): prepare/consume_egress_dispatch each carry
  // EXACTLY TWO ratified overloads (the 0020 wiki arity + the 0038 sha-bound arity).
  // Anything else with >1, or these two with a third, is still an orphan.
  // AMENDMENT 0040 (WCC, design v2.1 SS5 splice register 4): match_bank_line and
  // settle_from_bank_line each gain a ratified SECOND arity carrying p_via_rule. The new
  // arities carry NO defaults, so the two candidates can never both match one call --
  // asserted by 0040's own S4.Z pronargdefaults census, which is what makes a second
  // overload safe here rather than the ambiguity this sweep exists to catch.
  // AMENDMENT 0046 (§7-A, skeleton §2d): settle_autodraft_task gains a ratified SECOND
  // arity carrying p_workflow_run_id, which closes the run-identity gap 0036:927-933 named
  // and could not close ("this function receives no run id to compare against
  // agent_tasks.workflow_run_id"). Same safety proof as the 0040 pair and not a weaker one:
  // the 6-arity carries NO defaulted parameters, so a 5-argument call can only resolve to
  // the 5-arity and a 6-argument call only to the new one — asserted by 0046's own tail arm
  // (3), which measures pronargdefaults rather than asserting it in prose.
  const RATIFIED = {
    prepare_egress_dispatch: 2, consume_egress_dispatch: 2,
    match_bank_line: 2, settle_from_bank_line: 2,
    settle_autodraft_task: 2,
  };
  const r = await rootQuery(
    `select p.proname, count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' group by p.proname having count(*) > 1`,
  );
  return r.rows
    .filter((x) => x.n !== (RATIFIED[x.proname] ?? 1))
    .map((x) => `clara.${x.proname} has ${x.n} overloads`);
}

/** proargnames of a clara fn: null when absent, else one array per overload. */
export async function fnArgNames(name) {
  const r = await rootQuery(
    `select p.proargnames from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = $1`,
    [name],
  );
  if (!r.rows.length) return null;
  return r.rows.map((x) => x.proargnames ?? []);
}

/** FORCE-RLS audit over the whole schema incl. every §3 table. */
export async function s4RlsAudit() {
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
    if (PRE_0006_TABLES.has(r.relname) || expected.has(r.relname)) continue;
    if (!r.rls || !r.force) problems.push(`${r.relname} (unlisted new table): rls=${r.rls} force=${r.force}`);
    else observations.push(`unlisted new table ${r.relname} (FORCE RLS ok) — not named by contract §3, inspect`);
  }
  return { problems, observations };
}

/** §3.0 role/login audit: the two NOLOGIN login-shells + exact single membership
 *  (never a wake role or clara_authenticated — S4-C3, rig-asserted). */
export async function loginRoleAudit() {
  const expect = {
    clara_runtime_login: ROLES.runtime,
    clara_agent_read_login: ROLES.agentRo,
  };
  // F-A6 PR-1 — THE FOURTH LOGIN, added bimodally so this audit stays green at every frontier:
  // present once F-A6 has applied, simply not audited before that. It is a member of
  // clara_freeform_ro ALONE, and the loop below proves that in both directions (the wanted
  // membership must exist; every other one is a finding).
  const freeformLive = (await rootQuery(
    "select to_regrole('clara_freeform_login') is not null and to_regrole('clara_freeform_ro') is not null as ok",
  )).rows[0].ok;
  if (freeformLive) expect.clara_freeform_login = "clara_freeform_ro";
  // EXTEND-NEVER-WEAKEN, and this is the half that matters for the EXISTING logins: the new
  // group joins the forbidden set, so clara_runtime_login and clara_agent_read_login are now
  // proved NOT to reach the freeform read surface. Adding a login without adding its group here
  // would have left every older login silently un-probed against it.
  const forbidden = new Set([ROLES.authenticated, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.fnOwner]);
  if (freeformLive) forbidden.add("clara_freeform_ro");
  const problems = [];
  for (const [login, want] of Object.entries(expect)) {
    const r = await rootQuery("select rolcanlogin, rolsuper, rolbypassrls from pg_roles where rolname = $1", [login]);
    if (!r.rows.length) {
      problems.push(`${login}: role MISSING (§3.0)`);
      continue;
    }
    const a = r.rows[0];
    if (a.rolsuper) problems.push(`${login}: SUPERUSER`);
    if (a.rolbypassrls) problems.push(`${login}: BYPASSRLS`);
    if (a.rolcanlogin) problems.push(`${login}: LOGIN enabled in-migration (§3.0: operator enables out-of-band)`);
    const m = await rootQuery(
      `with recursive memb as (
         select am.roleid from pg_auth_members am join pg_roles r on r.oid = am.member where r.rolname = $1
         union
         select am.roleid from pg_auth_members am join memb on memb.roleid = am.member)
       select r2.rolname from memb join pg_roles r2 on r2.oid = memb.roleid`,
      [login],
    );
    const groups = m.rows.map((x) => x.rolname);
    if (!groups.includes(want)) problems.push(`${login}: not a member of ${want} (memberships: ${groups.join(", ") || "none"})`);
    for (const g of groups) {
      if (g === want) continue;
      if (forbidden.has(g)) problems.push(`${login}: FORBIDDEN transitive membership in ${g} (§3.0: member of ${want} ONLY)`);
      else problems.push(`${login}: extra membership ${g} (§3.0: member of ${want} ONLY)`);
    }
    // Round-2 S4-AB1: the direct grant must be SET TRUE + INHERIT FALSE — the
    // login can BECOME its group but holds NO ambient privilege while bare.
    const opt = await rootQuery(
      `select am.set_option, am.inherit_option
         from pg_auth_members am
         join pg_roles member on member.oid = am.member
         join pg_roles grp on grp.oid = am.roleid
        where member.rolname = $1 and grp.rolname = $2`,
      [login, want],
    );
    if (opt.rowCount === 1) {
      if (opt.rows[0].set_option !== true) problems.push(`${login}→${want}: set_option=${opt.rows[0].set_option} (S4-AB1 requires SET TRUE)`);
      if (opt.rows[0].inherit_option !== false) problems.push(`${login}→${want}: inherit_option=${opt.rows[0].inherit_option} (S4-AB1 requires INHERIT FALSE)`);
    }
  }
  return problems;
}
