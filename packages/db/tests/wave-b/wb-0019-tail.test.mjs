// Wave-B battery — migration 0019 §9: THE CLEAN-END-STATE CLOSED SET, re-run OUT
// of the migration transaction (the 0016 lesson: an in-txn tail proves the apply,
// not the live catalog). Catalog/structural asserts · the whitelist by EXACT
// regprocedure identity · the INVERSE all-definers scan over relation tokens AND
// call edges · the grants closed set · the amendment-4 negative.
// CONTRACT-BLIND; FAILS below 0019.
//
// SUPERSESSION (§9, explicit): the 0017 apply-time veto-EXISTENCE pins
// (0017:5595-5618) are NOT re-run here. They ran apply-time-once and pass there
// because the rig replays 0001 → … → 0019 in order (the veto IS present when
// 0017 applies). This file asserts their exact INVERSE.
//
// AMBIGUITIES this lane encodes:
//   [D19-18] §9 requires a PAIRED REPOSITORY LINT ("a repo-side check forbidding
//            dynamic wiki SQL — any execute/format/string-concatenated statement
//            naming a wiki relation — outside the whitelisted set", shipping with
//            0019). That is a scripts/ deliverable and is NOT expressible from
//            the DB rig, which owns no filesystem assertions. Reported as
//            uncovered-by-this-battery, by construction. (It ships as
//            scripts/check-wiki-dynamic-sql.mjs with its own fixture-driven
//            self-test, both wired into `pnpm lint` and called out in CI.)
//   [D19-19] §9's honest characterisation says the scan is a closed STATIC
//            defence with a known FALSE-FAIL mode (a raw prosrc regex also sees
//            comments and string literals). This lane verified the current
//            baseline is clean — the only in-body call edges into the wiki set
//            are 0017:2212, 0017:2264 and 0017:4930, all from whitelisted
//            callers, and the one 'get_context_pack' string literal in the tree
//            (0011:3345) sits INSIDE get_context_pack itself, which is
//            whitelisted. A future offender is a finding, not a test bug.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, endPool, printLaneNotes,
  fail0019, wbEnsureReady19, fnSource,
  WB_0019_WHITELIST_SIGS, WB_WIKI_RELATIONS, WB_STALE_RELATIONS, WB_STALE_COLS,
  WB_STALE_FINDING, WB_EVENT_TYPES,
} from "./wb-fixtures.mjs";

const FN = "mark_wiki_citations_stale";
const SIG = "clara.mark_wiki_citations_stale(uuid,uuid,text,text)";

/** §9(a): a word-bounded reference to one of the seven wiki relations — the
 *  0017:5961-5963 expression, verbatim. */
const RELATION_RE = `\\m(${WB_WIKI_RELATIONS.join("|")})\\M`;
/** §9(b): a CALL EDGE — a reference to any function IN the wiki-touch set.
 *  Derived from the contract's §9 whitelist block, bare names, word-bounded.
 *  (plpgsql bodies create no pg_depend edges for their callees, so a source-token
 *  scan is the only mechanism available — §9 states this rather than implying a
 *  stronger one.) */
const CALL_EDGE_RE = "\\m(publish_wiki_page_version|_publish_wiki_page_version_core"
  + "|record_wiki_source_ingest|retire_wiki_page|set_wiki_synthesis_hold"
  + "|clear_wiki_synthesis_hold|get_wiki_page|list_wiki_pages|get_context_pack"
  + "|run_client_lint|run_lint_all|mark_wiki_citations_stale"
  + "|_assert_filing_wiki_unreferenced)\\M";

let live = false;
let whitelistOids = [];

before(async () => {
  live = await wbEnsureReady19();
});
after(async () => { printLaneNotes("wb-0019-tail"); await endPool(); });

test("META: 0019 applied — the clean-end-state tail is armed", async () => {
  fail0019(live);
  const migs = await rootQuery(
    "select version from clara.schema_migrations where version ~ '^001[789]_' order by version");
  const vs = migs.rows.map((x) => x.version);
  assert.equal(vs.length, 3, `0017, 0018 and 0019 all applied, in order (got ${vs.join(",")})`);
});

test("[0019 §9]: the whitelist resolves by EXACT regprocedure identity — every one of the twelve signatures", async () => {
  fail0019(live);
  whitelistOids = [];
  for (const sig of WB_0019_WHITELIST_SIGS) {
    const r = await rootQuery("select to_regprocedure($1)::oid::text as oid", [sig]);
    assert.ok(r.rows[0].oid && r.rows[0].oid !== "0",
      `${sig} exists with EXACTLY this signature (the whitelist is by identity, not by proname — a future overload of a whitelisted NAME must not be silently covered)`);
    whitelistOids.push(r.rows[0].oid);
  }
  assert.equal(whitelistOids.length, 12, "the whitelist is a closed set of twelve");
});

test("[0019 §9]: the INVERSE closed-set scan — NO clara fn outside the whitelist names a wiki relation OR carries a call edge", async () => {
  fail0019(live);
  assert.ok(whitelistOids.length === 12, "the whitelist resolved (this cell depends on the previous one)");
  // RATCHET R1 finding 4: the scan is NOT restricted to `p.prosecdef`. A definers-only
  // filter leaves a SECURITY INVOKER helper reading wiki_pages invisible — and when an
  // authority definer calls it, current_user is still the definer's owner, so the helper
  // carries the definer's authority. This mirrors the migration tail, which was widened
  // the same way; wb-0019-ratchet.test.mjs proves the delta with a live probe.
  const r = await rootQuery(`
    select p.oid::regprocedure::text as sig, p.prosecdef,
           (p.prosrc ~* $2) as names_relation,
           (p.prosrc ~* $3) as call_edge
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara'
       and not (p.oid::text = any($1::text[]))
       and (p.prosrc ~* $2 or p.prosrc ~* $3)
     order by 1`, [whitelistOids, RELATION_RE, CALL_EDGE_RE]);
  assert.equal(r.rows.length, 0,
    `clara functions outside the wiki whitelist touching the wiki set:\n${r.rows.map((x) => `  ${x.sig} (secdef=${x.prosecdef} relation=${x.names_relation} call_edge=${x.call_edge})`).join("\n")}`);
  // …and the scan is NOT vacuous: the whitelisted members do trip both halves.
  const positive = await rootQuery(`
    select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.oid::text = any($1::text[])
       and (p.prosrc ~* $2 or p.prosrc ~* $3)`, [whitelistOids, RELATION_RE, CALL_EDGE_RE]);
  assert.ok(positive.rows[0].n >= 5,
    `the scan expression genuinely matches (got ${positive.rows[0].n} whitelisted fns) — a vacuous regex would pass the assertion above for the wrong reason`);
});

test("[0019 §9]: the veto helper is GONE and BOTH former deviations are clean (the exact inverse of the 0017:5595-5618 pins)", async () => {
  fail0019(live);
  const reg = await rootQuery(
    "select to_regprocedure('clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid)') as reg");
  assert.equal(reg.rows[0].reg, null, "to_regprocedure (NOT to_regproc — 0011:4132-4136) resolves to NULL");
  for (const fn of ["retire_document_filing", "approve_wrong_client_correction"]) {
    const src = await fnSource(fn);
    assert.ok(!new RegExp(RELATION_RE.replace(/\\m|\\M/g, "\\b"), "i").test(src),
      `${fn} names NO wiki relation`);
    assert.ok(!src.includes("_assert_filing_wiki_unreferenced"), `${fn} carries NO call edge to the dropped helper`);
    assert.ok(/clara\.clients/.test(src), `${fn} still serializes on the client row (§1: the lock survives the veto)`);
  }
});

test("[0019 §9]: catalog markers — the stale columns + their CHECKs, the writer, and both CHECK-vocabulary extensions", async () => {
  fail0019(live);
  for (const rel of WB_STALE_RELATIONS) {
    for (const col of WB_STALE_COLS) {
      const c = await rootQuery(
        "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2",
        [rel, col]);
      assert.equal(c.rows.length, 1, `clara.${rel}.${col} exists`);
    }
    const defs = (await rootQuery(`
      select string_agg(pg_get_constraintdef(x.oid),' ~~ ') as d from pg_constraint x
        join pg_class t on t.oid=x.conrelid join pg_namespace n on n.oid=t.relnamespace
       where n.nspname='clara' and t.relname=$1 and x.contype='c'`, [rel])).rows[0].d ?? "";
    assert.ok(defs.includes("'source_filing_retired'"), `clara.${rel} carries the reason CHECK`);
    assert.ok(/stale_at IS NULL/i.test(defs) && /stale_reason IS NULL/i.test(defs),
      `clara.${rel} carries the PAIRED presence CHECK (got ${defs})`);
    // Index coverage exists (the tables shipped with none beyond the PK).
    const ix = (await rootQuery(`
      select count(*)::int as n from pg_index i join pg_class t on t.oid=i.indrelid
        join pg_namespace n on n.oid=t.relnamespace
       where n.nspname='clara' and t.relname=$1 and not i.indisprimary`, [rel])).rows[0].n;
    assert.ok(ix >= 1, `clara.${rel} gained non-PK index coverage (§2)`);
  }
  const r = await rootQuery(`
    select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner
      from pg_proc p where p.oid=$1::regprocedure`, [SIG]);
  assert.equal(r.rows[0].prosecdef, true, "mark_wiki_citations_stale is SECURITY DEFINER");
  // pg normalises proconfig to "search_path=clara, pg_temp" — compare whitespace-insensitively.
  assert.ok((r.rows[0].proconfig ?? []).some((x) => x.replace(/\s+/g, "") === "search_path=clara,pg_temp"),
    "…with the pinned search_path");
  assert.equal(r.rows[0].owner, ROLES.fnOwner, "…owned by clara_fn_owner");
  const logCheck = (await rootQuery(`
    select string_agg(pg_get_constraintdef(x.oid),' ~~ ') as d from pg_constraint x
      join pg_class t on t.oid=x.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='clara' and t.relname='wiki_log' and x.contype='c'`)).rows[0].d ?? "";
  assert.ok(logCheck.includes("'mark_stale'"), "wiki_log.action CHECK contains 'mark_stale'");
  const findCheck = (await rootQuery(`
    select string_agg(pg_get_constraintdef(x.oid),' ~~ ') as d from pg_constraint x
      join pg_class t on t.oid=x.conrelid join pg_namespace n on n.oid=t.relnamespace
     where n.nspname='clara' and t.relname='lint_findings' and x.contype='c'`)).rows[0].d ?? "";
  assert.ok(findCheck.includes(`'${WB_STALE_FINDING}'`), "lint_findings.finding_kind CHECK contains 'stale_citation'");
});

test("[0019 §9]: prosrc markers — the read surfaces, the lint class + inverted probe, and the monotonic guard", async () => {
  fail0019(live);
  for (const fn of ["get_wiki_page", "list_wiki_pages", "get_context_pack"]) {
    assert.ok((await fnSource(fn)).includes("has_stale_sources"), `${fn} references has_stale_sources`);
  }
  const pack = await fnSource("get_context_pack");
  assert.ok(pack.includes("stale_at"), "the pack additionally references stale_at in its citation enumeration");
  const lint = await fnSource("run_client_lint");
  assert.ok(lint.includes(WB_STALE_FINDING), "run_client_lint references the stale_citation class");
  assert.ok(/document_filings/.test(lint), "…and the inverted document_filings probe");
  const core = await fnSource("_publish_wiki_page_version_core");
  assert.ok(core.includes("stale_projected_from_seq"), "the publication core carries the typed guard reason literal");
  assert.ok(/projected_from_seq/.test(core), "…and the projected_from_seq comparison");
});

test("[0019 §9]: the GRANTS closed set — runtime-only EXECUTE, zero PUBLIC, and NO new table grant to ANY role", async () => {
  fail0019(live);
  assert.equal((await rootQuery("select has_function_privilege($1,$2,'execute') as ok",
    [ROLES.runtime, SIG])).rows[0].ok, true, "clara_runtime EXECUTEs the writer");
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal((await rootQuery("select has_function_privilege($1,$2,'execute') as ok", [role, SIG])).rows[0].ok,
      false, `${role} must NOT reach the writer`);
  }
  const pub = await rootQuery(`
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname=$1
       and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a
              where a.grantee=0 and a.privilege_type='EXECUTE'))`, [FN]);
  assert.equal(pub.rows.length, 0, "PUBLIC-execute sweep = 0 on the new fn");
  // NO widening of the clara_runtime table read surface — 0020's decision, not 0019's.
  assert.equal((await rootQuery(
    "select has_table_privilege($1,'clara.document_filings','SELECT') as ok", [ROLES.runtime])).rows[0].ok,
  false,
  "clara_runtime STILL has no SELECT on clara.document_filings (0007:2740-2741) — the inverted catch-up scan must run on the ceremony/owner connection, and a silent widening here would be out of scope");
  // The marker relations keep SELECT-only for the app roles: no DML was granted.
  for (const rel of WB_STALE_RELATIONS) {
    for (const role of [ROLES.authenticated, ROLES.runtime]) {
      assert.equal((await rootQuery("select has_table_privilege($1,$2,'SELECT') as ok",
        [role, `clara.${rel}`])).rows[0].ok, true, `${role} keeps its carried SELECT on clara.${rel}`);
      for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
        assert.equal((await rootQuery("select has_table_privilege($1,$2,$3) as ok",
          [role, `clara.${rel}`, priv])).rows[0].ok, false,
        `${role} holds NO ${priv} on clara.${rel} — the marker moves ONLY through the audited writer`);
      }
    }
    for (const role of [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      assert.equal((await rootQuery("select has_table_privilege($1,$2,'SELECT') as ok",
        [role, `clara.${rel}`])).rows[0].ok, false, `${role} reaches clara.${rel} not at all`);
    }
  }
});

test("[0019 amendment 4]: NO event type was registered — not in event_types, not in the ACTIVE taxonomy, not in the pinned roster", async () => {
  fail0019(live);
  const t = await rootQuery("select name from clara.event_types where name ~ 'citations_staled|wiki.*stale'");
  assert.equal(t.rows.length, 0, `no wiki stale event type exists (got ${t.rows.map((x) => x.name).join(",")})`);
  const tax = await rootQuery(`
    select t.event_type from clara.trigger_taxonomy t
      join clara.taxonomy_active a on a.version=t.version and a.singleton
     where t.event_type ~ 'citations_staled|wiki.*stale'`);
  assert.equal(tax.rows.length, 0, "…and none in the ACTIVE trigger taxonomy");
  assert.deepEqual(
    (await rootQuery("select name from clara.event_types where name like 'wiki.%' order by name")).rows.map((x) => x.name),
    ["wiki.page_published", "wiki.page_retired", "wiki.source_ingested"],
    "the wiki event family is EXACTLY the three 0017 types");
  assert.equal(Object.keys(WB_EVENT_TYPES).filter((k) => /stale/.test(k)).length, 0,
    "the pinned WB_EVENT_TYPES roster is unchanged — the negative proof of amendment 4");
});
