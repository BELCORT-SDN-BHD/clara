// F-A3 PR-1a — THE NINE PURE CORE EXTRACTIONS, battery for
// migrations/0119_f_a3_pr1a_core_extractions.sql (the number was claimed at merge; this
// file gates on CATALOG FACTS and never on a filename or a version string).
//
// Design of record: docs/plan/active/bank-agency-design.md v2 §4 with
// bank-agency-annexes-1-mechanics.md Annex A.2 (the extraction contract) and Annex C (the lock
// order), bank-agency-annexes-2-record.md Annex H.1 (the cells below), and
// bank-agency-annexes-3-build.md Annex O.2 row 1 / Annex J.1 (the nine bodies).
//
// WHAT IS BEING PROVEN, IN ONE SENTENCE: an extraction changes WHERE a body lives, never what it
// answers. Nine live human verbs became thin delegators over new ungranted cores; nothing else
// moved. The claim is small on purpose — PR-1a contains nothing but this — and the file's spine
// is that a small claim deserves a proof that CANNOT pass on a wrong build:
//
//   1  the byte-differential (H.1's first bullet, and the whole safety argument). For each verb
//      the live CORE prosrc, with the ctx unpack inverted back to the `_human_ctx` anchor it
//      replaced, must re-derive the PRE-EXTRACTION prosrc sha-256 pinned below. One space, one
//      reordered clause, one dropped comment anywhere in the body and this goes RED. The pins
//      are declared HERE independently of the migration's own roster: two copies that disagree
//      mean one is wrong, and the cell says which.
//   2  the public face is unmoved — signature, arity, owner, volatility, SECURITY DEFINER,
//      search_path, and clara_authenticated's EXECUTE.
//   3  the cores are UNGRANTED: PUBLIC holds nothing and no clara role can execute one. Read as
//      a closed world over the live catalog's roles, so a role minted later is still covered.
//   4  the extracted public bodies hold NO advisory rung and the cores DO (H.0's gating cell).
//      Both halves: a negative assertion alone passes on a body that lost the rungs entirely.
//   5  the BEHAVIOURAL differential — the same inputs through the public verb and through the
//      core with the ctx the wrapper builds produce the same refusal and the same audit row.
//   6  fail-closed on the missing: a core called with no actor/firm in its context REFUSES
//      (CLR10 core_ctx_missing) rather than letting a NULL flow into a firm predicate. RED
//      against a build that unpacks the ctx without checking it.
//   7  the roster is CLOSED at nine: a tenth `_<verb>_core` of an extracted name cannot arrive
//      unreviewed, and none of Annex J.4's untouched verbs may be factored by this item.
//
// CONTRACT-BLINDNESS, STATED HONESTLY: this lane authored the migration, so the blindness here
// is PROCEDURAL, not structural. Every sha below was measured by `pg_get_functiondef` on a rig
// at frontier 0102 BEFORE the migration existed, and cells 4-7 read catalog text or invoke the
// surface rather than restating what the migration says about itself.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, namedCall, opk, endPool, printLaneNotes, printSkipCount,
  noteLane, markSkip, a21EnsureReady, buildWorld, firmOf,
} from "./a21-helpers.mjs";

/** The nine, with the prosrc sha-256 each body carried BEFORE PR-1a factored it, and the exact
 *  `_human_ctx` anchor line the extraction replaced. Measured on a rig at frontier 0102. */
const NINE = [
  { fn: "match_bank_line", sig: "clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)",
    // overloads: 1 as of F-A3 PR-3 -- the /7 rule arity (the bank-rules machine's own overload)
    // dropped with the rest of the retired machine (Annex I). Was 2 pre-PR-3; the drop is
    // deliberately visible HERE rather than absorbed, per this cell's own exact-count law below.
    floor: "bookkeeper", overloads: 1, rung: true,
    anchor: "  c := clara._human_ctx(clara.role_rank('bookkeeper'));",
    sha: "493cdd27cf8dad42a48e210f2514660fa4c17a5d1c03aad91355feeadc771744" },
  { fn: "unmatch_bank_match", sig: "clara.unmatch_bank_match(uuid,uuid,text,text)",
    floor: "bookkeeper", overloads: 1, rung: true,
    anchor: "  c := clara._human_ctx(clara.role_rank('bookkeeper'));",
    sha: "cd2333b64be822256f05a1c6eeaf199405c46119a588ffc1d71ffe9010577ec7" },
  { fn: "complete_bank_reconciliation", sig: "clara.complete_bank_reconciliation(uuid,uuid[],text)",
    floor: "bookkeeper", overloads: 1, rung: true,
    anchor: "  c := clara._human_ctx(clara.role_rank('bookkeeper'));",
    sha: "d0110ffbb72db03d91c4eb2cadb3e898cd95a9057253c2225ecf6236fe5ec7e9" },
  { fn: "void_bank_reconciliation", sig: "clara.void_bank_reconciliation(uuid,text,text)",
    floor: "bookkeeper", overloads: 1, rung: true,
    anchor: "  c := clara._human_ctx(clara.role_rank('bookkeeper'));",
    sha: "5ef59b980651212703bcce1ba8c776b49998a1e0ceaa08347c03a25945df657a" },
  { fn: "resolve_bank_line_exception", sig: "clara.resolve_bank_line_exception(uuid,text,text,uuid,text)",
    floor: "owner", overloads: 1, rung: true,
    anchor: "  c := clara._human_ctx(clara.role_rank('owner'));",
    sha: "e97c9c75430e7b808dcd0d96b6c74e80a6d4e9d32bc2fc89fcd2cb9909985810" },
  { fn: "resolve_and_book_bank_line",
    sig: "clara.resolve_and_book_bank_line(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,bigint,text,text,text,boolean)",
    floor: "owner", overloads: 1, rung: true,
    anchor: "  c := clara._human_ctx(clara.role_rank('owner'));",
    sha: "c1977e8667ac9ab7cc9059b788baf7d84b86e4cd92c2994e264f7da6252f3c16" },
  { fn: "void_bank_statement", sig: "clara.void_bank_statement(uuid,uuid,text,text)",
    floor: "bookkeeper", overloads: 1, rung: true,
    anchor: "  c := clara._human_ctx(clara.role_rank('bookkeeper'));",
    sha: "5fa1db34c19884107872307d394f39f594bbf5a23b1f5a4ecd2de58d81b9ebd7" },
  // add_bank_account and upsert_account take NO advisory rung: they serialise on the op receipt
  // and the client row. Stated as data so cell 4's positive half is a MEASURED population (7 of
  // 9) rather than a blanket claim that would pass whatever it found.
  { fn: "add_bank_account", sig: "clara.add_bank_account(uuid,text,text,text,text,uuid,text)",
    floor: "bookkeeper", overloads: 1, rung: false,
    anchor: "  c := clara._human_ctx(clara.role_rank('bookkeeper'));",
    sha: "7f7b89ccb5a65ba039157bb2708a333c51600386ec3ce19751559a340c66882c" },
  { fn: "upsert_account", sig: "clara.upsert_account(uuid,text,text,text,text,text,text)",
    floor: "bookkeeper", overloads: 1, rung: false,
    anchor: "  c:=clara._human_ctx(clara.role_rank('bookkeeper'));",
    sha: "94463acb4d936111c0eafba819555f41189a41e2a01fd9662cd119a17639b1c9" },
];

/** Annex J.4's named non-goals: verbs F-A3 does not touch in ANY PR. Cell 7 proves no core of
 *  these names was born, so "pure extraction" cannot quietly widen the item's surface. */
const UNTOUCHED = ["except_bank_line", "enter_bank_statement", "deactivate_bank_account",
  "reactivate_bank_account", "remap_bank_account_coa", "complete_pending_match"];

const core = (fn) => `_${fn}_core`;

/** The ctx unpack the migration substituted for the anchor, rebuilt here from the CONTRACT
 *  (Annex A.2) rather than read out of the installed body — otherwise the inversion in cell 1
 *  would be self-referential and could not fail. */
const ctxBlock = (fn) =>
  `  select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;
  if c.actor is null or c.firm is null then
    raise exception 'the ${fn} core requires an actor and a firm in its context'
      using errcode='CLR10',detail='{"reason":"core_ctx_missing"}';
  end if;`;

let ready = false;
let world = null;

/** Loud + counted skip — a dormant suite must show up in printSkipCount. */
function skipHere(t) {
  if (!ready) {
    markSkip();
    t.skip("F-A3 PR-1a is not applied on this database (clara._match_bank_line_core absent) — the extraction battery is dormant");
    return true;
  }
  return false;
}

before(async () => {
  const base = await a21EnsureReady();
  const present = (await rootQuery(
    `select count(*)::int as n from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.proname = any($1)`,
    [NINE.map((x) => core(x.fn))])).rows[0].n;
  // Wholly present or wholly absent. A PARTIAL roster is NOT a dormant suite — it is a
  // half-applied extraction, and it must be loud rather than skipped.
  if (present !== 0 && present !== NINE.length) {
    throw new Error(`F-A3 PR-1a is PARTIALLY applied: ${present} of ${NINE.length} extracted cores exist. A half-factored estate has some verbs delegating and some not; refuse rather than skip.`);
  }
  ready = Boolean(base.base) && present === NINE.length;
  if (!ready) {
    noteLane("F-A3 PR-1a not applied — f-a3-pr1a-extraction suite dormant");
    return;
  }
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("f-a3-pr1a-extraction");
  printSkipCount("f-a3-pr1a-extraction");
  await endPool();
});

// ===========================================================================
// f-a3.1a-a — THE BYTE-DIFFERENTIAL. H.1's first bullet and the whole safety argument.
// ===========================================================================
test("f-a3.1a-a every extracted core is the PRE-EXTRACTION body byte-for-byte: inverting the ctx substitution re-derives the pinned sha256", async (t) => {
  if (skipHere(t)) return;
  const rows = (await rootQuery(
    `select p.proname, p.prosrc,
            encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as post_sha
       from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.proname = any($1) order by p.proname`,
    [NINE.map((x) => core(x.fn))])).rows;
  assert.equal(rows.length, NINE.length,
    `all ${NINE.length} extracted cores are present (found ${rows.length})`);
  const byName = new Map(rows.map((r) => [r.proname, r]));
  // F-A3/PR-1b (`f_a3_pr1b_agent_limb`, numbered at merge) legitimately RE-CoRs four of the
  // nine cores to grow the agent limb's shared bodies — so the pure-extraction byte-inversion
  // is a FROZEN-WINDOW claim: it holds from PR-1a's apply up to the first successor CoR. The
  // machine proof at the boundary is the SUCCESSOR'S OWN §0 PRE-STATE PINS: 0121 hard-aborts
  // unless each of these four cores is byte-exactly PR-1a's output at its apply — re-proving
  // precisely what this cell proves, at the moment the body changed. (The successor's own
  // DELTA being minimal is a review obligation on that PR's ladder, not a tail proof.) Same
  // frozen-window shape as x38/x42's moved pins; GATED ON THE MIGRATION STEM, never a number.
  // The no-`_human_ctx` invariant is NOT windowed — it must survive every successor recut.
  const SUPERSEDED_BY_PR1B = new Set([
    "_match_bank_line_core", "_unmatch_bank_match_core",
    "_complete_bank_reconciliation_core", "_resolve_and_book_bank_line_core",
  ]);
  const pr1bApplied = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ '^[0-9]{4}_f_a3_pr1b_agent_limb$'",
  )).rows[0].n === 1;
  let windowed = 0;
  for (const spec of NINE) {
    const row = byName.get(core(spec.fn));
    if (pr1bApplied && SUPERSEDED_BY_PR1B.has(core(spec.fn))) {
      // Presence (asserted above) + the un-windowed invariant still hold; the inversion is
      // the successor's own tail's business now.
      assert.ok(!row.prosrc.includes("clara._human_ctx("),
        `clara.${core(spec.fn)} resolves NO human context of its own — an invariant every successor recut must keep`);
      windowed += 1;
      noteLane(`f-a3.1a-a clara.${core(spec.fn)}: recut by PR-1b (whose §0 pre-state pin re-proved this core was byte-exactly PR-1a's output at its apply) — the pure-extraction inversion is a pre-PR-1b-window claim for this core`);
      continue;
    }
    const block = ctxBlock(spec.fn);
    const occurrences = row.prosrc.split(block).length - 1;
    assert.equal(occurrences, 1,
      `clara.${core(spec.fn)} carries the contract's ctx unpack EXACTLY once (found ${occurrences}) — the extraction's one substitution, and nothing that looks like it`);
    const inverted = row.prosrc.split(block).join(spec.anchor);
    const sha = await sha256Of(inverted);
    assert.equal(sha, spec.sha,
      `clara.${core(spec.fn)} is NOT a pure extraction: inverting the ctx substitution yields ${sha}, but ${spec.sig}'s pre-extraction body was ${spec.sha} — something other than the _human_ctx line moved`);
    // NON-VACUOUS: the post-extraction body must actually DIFFER from the pre-extraction one, or
    // the inversion above would be comparing a body to itself and could never fail.
    assert.notEqual(row.post_sha, spec.sha,
      `clara.${core(spec.fn)}'s installed body differs from the pre-extraction body (the ctx unpack really is in there)`);
    assert.ok(!row.prosrc.includes("clara._human_ctx("),
      `clara.${core(spec.fn)} resolves NO human context of its own — it takes one, which is the point of the extraction`);
  }
  noteLane(`f-a3.1a-a ${NINE.length - windowed} cores inverted to their pinned pre-extraction shas${windowed ? ` (${windowed} recut by PR-1b, inversion windowed)` : ""}`);
});

// ===========================================================================
// f-a3.1a-b — THE PUBLIC FACE IS UNMOVED (H.1 bullet 2).
// ===========================================================================
test("f-a3.1a-b each extracted public verb keeps its exact signature, arity, owner, volatility, definer, search_path and clara_authenticated EXECUTE", async (t) => {
  if (skipHere(t)) return;
  for (const spec of NINE) {
    const rows = (await rootQuery(
      `select p.oid::regprocedure::text as sig, p.pronargs::int as nargs, l.lanname,
              p.prosecdef, p.provolatile, p.prokind,
              pg_get_userbyid(p.proowner) as owner,
              coalesce(array_to_string(p.proconfig,','),'') as config,
              pg_get_function_result(p.oid) as result,
              has_function_privilege('clara_authenticated', p.oid, 'execute') as human_exec,
              coalesce(array_to_string(p.proacl::text[],' | '),'(null)') as acl
         from pg_proc p join pg_language l on l.oid=p.prolang
        where p.oid = to_regprocedure($1)`, [spec.sig])).rows;
    assert.equal(rows.length, 1, `${spec.sig} still resolves at its exact original signature`);
    const r = rows[0];
    assert.deepEqual(
      { lang: r.lanname, secdef: r.prosecdef, vol: r.provolatile, kind: r.prokind,
        owner: r.owner, config: r.config, result: r.result, human: r.human_exec },
      { lang: "plpgsql", secdef: true, vol: "v", kind: "f",
        owner: "clara_fn_owner", config: "search_path=clara, pg_temp", result: "jsonb", human: true },
      `${spec.sig} kept every property a caller can observe (acl: ${r.acl})`);
    // The overload count is EXACT, never >=: match_bank_line's rule arity is dropped in PR-3 and
    // that drop must be visible here rather than absorbed.
    const n = (await rootQuery(
      `select count(*)::int as n from pg_proc p
        where p.pronamespace='clara'::regnamespace and p.proname=$1`, [spec.fn])).rows[0].n;
    assert.equal(n, spec.overloads, `clara.${spec.fn} has exactly ${spec.overloads} live arity/arities`);
  }
});

// ===========================================================================
// f-a3.1a-c — THE CORES ARE UNGRANTED (H.1 bullet 3), closed-world over the live roles.
// ===========================================================================
test("f-a3.1a-c every extracted core holds ZERO grants: PUBLIC has nothing and no clara role can execute one", async (t) => {
  if (skipHere(t)) return;
  const roles = (await rootQuery(
    "select rolname from pg_roles where rolname like 'clara%' and rolname <> 'clara_fn_owner' order by 1")).rows.map((r) => r.rolname);
  // NON-VACUOUS: a role census that found nothing would make every assertion below trivially
  // true. The estate carries the six clara_* roles plus the wake and login roles.
  assert.ok(roles.length >= 6, `the clara role census populated (${roles.length}: ${roles.join(", ")})`);
  for (const spec of NINE) {
    const rows = (await rootQuery(
      `select p.oid::int8 as oid, pg_get_userbyid(p.proowner) as owner,
              (p.proacl is null) as acl_null,
              exists (select 1 from aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
                       where a.grantee=0 and a.privilege_type='EXECUTE') as public_exec
         from pg_proc p
        where p.pronamespace='clara'::regnamespace and p.proname=$1`, [core(spec.fn)])).rows;
    assert.equal(rows.length, 1, `clara.${core(spec.fn)} exists exactly once`);
    const r = rows[0];
    assert.equal(r.owner, "clara_fn_owner",
      `clara.${core(spec.fn)} is owned by clara_fn_owner — a SECURITY DEFINER body owned by anyone else runs with the wrong authority`);
    assert.equal(r.acl_null, false,
      `clara.${core(spec.fn)} has an explicit ACL — a NULL proacl MEANS PUBLIC EXECUTE, which is a second public entrance, not an internal delegate`);
    assert.equal(r.public_exec, false, `PUBLIC holds no EXECUTE on clara.${core(spec.fn)}`);
    for (const role of roles) {
      const ok = (await rootQuery("select has_function_privilege($1, $2::oid, 'execute') as ok",
        [role, r.oid])).rows[0].ok;
      assert.equal(ok, false,
        `${role} must NOT execute clara.${core(spec.fn)} — an extracted core is an internal delegate (H.1); the granted agent wrappers are PR-1b's, not this PR's`);
    }
  }
});

// ===========================================================================
// f-a3.1a-d — THE LOCK ORDER MOVED, IT DID NOT EVAPORATE (H.0's gating cell, material M2).
// ===========================================================================
test("f-a3.1a-d the extracted public bodies hold NO advisory rung, reservation, row lock or write — and the cores hold the rungs that moved with them", async (t) => {
  if (skipHere(t)) return;
  const FORBIDDEN = ["pg_advisory_xact_lock", "clara._reserve_op(", " for update", " for share",
    "insert into ", "update clara.", "delete from "];
  let rungs = 0;
  for (const spec of NINE) {
    const pub = (await rootQuery("select p.prosrc as s from pg_proc p where p.oid = to_regprocedure($1)",
      [spec.sig])).rows[0].s;
    assert.ok(pub.includes(`clara.${core(spec.fn)}(`), `${spec.sig} delegates to clara.${core(spec.fn)}`);
    assert.ok(pub.includes(`clara._human_ctx(clara.role_rank('${spec.floor}'))`),
      `${spec.sig} keeps its ${spec.floor} floor in the WRAPPER — the floor is the human lane's gate and never moves into a shared delegate`);
    for (const needle of FORBIDDEN) {
      assert.ok(!pub.includes(needle),
        `${spec.sig} must acquire and write NOTHING in its own body — found "${needle}", so the ladder was re-inlined above the core and Annex C's "the order is the DELEGATE'S OWN order" is unmeasured again`);
    }
    const cs = (await rootQuery(
      `select p.prosrc as s from pg_proc p
        where p.pronamespace='clara'::regnamespace and p.proname=$1`, [core(spec.fn)])).rows[0].s;
    assert.equal(cs.includes("pg_advisory_xact_lock"), spec.rung,
      `clara.${core(spec.fn)} ${spec.rung ? "carries" : "carries no"} advisory rung, as its pre-extraction body did`);
    assert.ok(cs.includes("clara._reserve_op("),
      `clara.${core(spec.fn)} owns the op-key reservation — every one of the nine is an audited writer and the receipt cannot live in a body that no longer computes it`);
    if (spec.rung) rungs += 1;
  }
  assert.equal(rungs, 7,
    "exactly SEVEN of the nine cores take an advisory rung (add_bank_account and upsert_account serialise on the op receipt and the client row) — a measured population, not a blanket claim");
});

// ===========================================================================
// f-a3.1a-e — THE BEHAVIOURAL DIFFERENTIAL. Same inputs, two entrances, one answer.
// ===========================================================================
test("f-a3.1a-e the public verb and the core, given the ctx the wrapper builds, answer identically — same refusal, same audit row", async (t) => {
  if (skipHere(t)) return;
  const alice = world.users.alice;
  const clientA = world.clients.A1;
  const clientB = world.clients.B1; // a client of the OTHER firm
  const firmA = await firmOf(clientA);
  const ctx = JSON.stringify({ actor: alice, firm: firmA });
  const coreCall = (specs) => `select clara._upsert_account_core(${specs.join(", ")}) as result`;
  const ARGS = ["p_ctx => $1::jsonb", "p_client => $2::uuid", "p_code => $3", "p_name => $4",
    "p_type => $5", "p_op_key => $6"];
  const PUB = [{ name: "p_client" }, { name: "p_code" }, { name: "p_name" }, { name: "p_type" },
    { name: "p_op_key" }];

  // ---- (1) THE REFUSAL DIFFERENTIAL: a cross-firm client is CLR11 from both entrances, with
  // the same message. The firm predicate reads c.firm, which is exactly the value the ctx now
  // carries, so this is the cell that would go RED if the wrapper handed the core a different
  // identity than _human_ctx produced.
  const caught = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const pubErr = await caught(() => humanQuery(alice, namedCall("upsert_account", PUB),
    [clientB, "9911", "cross-firm probe", "expense", opk("fa3pub")]));
  const coreErr = await caught(() => rootQuery(coreCall(ARGS),
    [ctx, clientB, "9911", "cross-firm probe", "expense", opk("fa3core")]));
  assert.ok(pubErr, "the public verb refused a cross-firm client (the differential is non-vacuous)");
  assert.ok(coreErr, "the core refused a cross-firm client");
  assert.deepEqual(
    { code: coreErr.code, message: coreErr.message, detail: coreErr.detail ?? null },
    { code: pubErr.code, message: pubErr.message, detail: pubErr.detail ?? null },
    "the core's refusal is byte-identical to the public verb's — same SQLSTATE, same message, same detail");
  assert.equal(pubErr.code, "CLR11", `…and it is the firm wall (got ${pubErr.code})`);

  // ---- (2) THE SUCCESS DIFFERENTIAL: the same upsert through both entrances writes the same
  // audit row. The fn name, the acting identity and the payload are all things an extraction
  // could plausibly have moved; this reads them off clara.audit_log rather than assuming.
  const code = `99${Math.floor(Math.random() * 90 + 10)}`;
  const auditAfter = async () => (await rootQuery(
    `select a.id, a.fn, a.firm_id, a.actor, a.on_behalf_of, a.via_wake_kind, a.outcome, a.args
       from clara.audit_log a
      where a.fn='upsert_account' and a.args->>'code'=$1 order by a.id desc limit 1`,
    [code])).rows[0];
  await humanQuery(alice, namedCall("upsert_account", PUB),
    [clientA, code, "F-A3 differential", "expense", opk("fa3pub2")]);
  const viaPublic = await auditAfter();
  await rootQuery(coreCall(ARGS),
    [ctx, clientA, code, "F-A3 differential", "expense", opk("fa3core2")]);
  const viaCore = await auditAfter();
  assert.ok(viaPublic && viaCore, "both entrances audited their act");
  assert.notEqual(viaCore.id, viaPublic.id, "…as two distinct rows (the second call really ran)");
  const shape = (r) => ({ fn: r.fn, firm: r.firm_id, actor: r.actor, obo: r.on_behalf_of,
    wake: r.via_wake_kind, outcome: r.outcome, args: r.args });
  assert.deepEqual(shape(viaCore), shape(viaPublic),
    "the core writes the same audit identity and payload the public verb does — the fn literal, the firm, the acting actor, the (absent) on-behalf-of and wake-kind, the outcome and the args all moved with the body unchanged");
  noteLane(`f-a3.1a-e differential on upsert_account: refusal ${pubErr.code} identical both ways; audit args ${JSON.stringify(viaCore.args)}`);
});

// ===========================================================================
// f-a3.1a-f — FAIL-CLOSED ON THE MISSING. The new refusal the extraction owes.
// ===========================================================================
test("f-a3.1a-f a core called with no actor or firm in its context REFUSES CLR10 core_ctx_missing rather than letting a NULL reach a firm predicate", async (t) => {
  if (skipHere(t)) return;
  const clientA = world.clients.A1;
  const shapes = [
    ["an empty context", "{}"],
    ["a context with a firm but no actor", JSON.stringify({ firm: randomUUID() })],
    ["a context with an actor but no firm", JSON.stringify({ actor: randomUUID() })],
  ];
  for (const [label, ctx] of shapes) {
    let err = null;
    try {
      await rootQuery(
        `select clara._upsert_account_core(p_ctx => $1::jsonb, p_client => $2::uuid, p_code => $3,
           p_name => $4, p_type => $5, p_op_key => $6) as result`,
        [ctx, clientA, "9990", "ctx probe", "expense", opk("fa3ctx")]);
    } catch (e) { err = e; }
    assert.ok(err, `${label} is REFUSED — a core that accepted it would run the whole body with a NULL firm`);
    assert.equal(err.code, "CLR10", `${label} raises CLR10 (got ${err.code})`);
    assert.match(String(err.detail ?? ""), /core_ctx_missing/,
      `${label} names the typed reason core_ctx_missing (got ${err.detail ?? "(none)"})`);
  }
  // The POSITIVE control: the same call with a well-formed ctx does NOT raise, so the three
  // refusals above are about the context and not about the arguments.
  const firmA = await firmOf(clientA);
  await rootQuery(
    `select clara._upsert_account_core(p_ctx => $1::jsonb, p_client => $2::uuid, p_code => $3,
       p_name => $4, p_type => $5, p_op_key => $6) as result`,
    [JSON.stringify({ actor: world.users.alice, firm: firmA }), clientA, "9990", "ctx probe",
      "expense", opk("fa3ctxok")]);
});

// ===========================================================================
// f-a3.1a-g — THE ROSTER IS CLOSED AT NINE (Annex J.1 in, Annex J.4 out).
// ===========================================================================
test("f-a3.1a-g PR-1a factored exactly the nine Annex J.1 verbs and no other bank/COA verb gained a core", async (t) => {
  if (skipHere(t)) return;
  const expected = NINE.map((x) => core(x.fn)).sort();
  const found = (await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and p.proname = any($1) order by 1`,
    [expected])).rows.map((r) => r.proname);
  assert.deepEqual(found, expected, "the nine Annex J.1 cores are all present");
  // And nothing Annex J.4 rules untouched was factored. except_bank_line is the load-bearing one
  // — the sitting ruled it stays human "in any PR", and a core of that name is how a widening
  // would arrive looking like a refactor.
  const strays = (await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.proname = any($1) order by 1`,
    [UNTOUCHED.map((f) => core(f))])).rows.map((r) => r.proname);
  assert.deepEqual(strays, [],
    `no core was minted for a verb F-A3 does not touch (Annex J.4) — found: ${strays.join(", ") || "(none)"}`);
  // …and those verbs still resolve their own human context, which is the positive twin: the
  // assertion above would also pass on a build that DELETED them.
  for (const fn of UNTOUCHED) {
    const rows = (await rootQuery(
      `select bool_or(p.prosrc like '%clara._human_ctx(%') as human from pg_proc p
        where p.pronamespace='clara'::regnamespace and p.proname=$1`, [fn])).rows;
    assert.equal(rows[0].human, true,
      `clara.${fn} is still a live human-lane verb resolving its own context (untouched by F-A3, Annex J.4)`);
  }
});

/** sha256 hex of a string, computed in-DB so the encoding matches the migration's own
 *  `encode(sha256(convert_to(...,'UTF8')),'hex')` exactly rather than approximately. */
async function sha256Of(text) {
  return (await rootQuery("select encode(sha256(convert_to($1::text,'UTF8')),'hex') as sha", [text])).rows[0].sha;
}
