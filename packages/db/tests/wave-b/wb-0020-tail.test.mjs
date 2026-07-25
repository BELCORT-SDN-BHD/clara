// Wave-B battery — migration 0020 §8 (the in-transaction tail, mirrored against
// the LIVE catalog) and §10 (what "DARK" actually means).
//
// The §8 tail runs inside the migration's own transaction and aborts the apply on
// any failure. That is necessary but not sufficient as a REGRESSION surface: it
// never runs again. This file re-asserts the same closed sets against the live
// catalog, so a LATER migration cannot quietly widen them.
//
// §10.1 is the honest DARK claim. v0.1 said "every new path degrades exactly to
// today" and that is FALSE — 0020 deliberately changes five things. What is DARK
// is MODEL SYNTHESIS: with zero typed consents and zero activations every verdict
// is `unknown`, and deterministic ingest of a uniquely-filed document is
// deliberately LIVE. Both halves are asserted here. CONTRACT-BLIND; FAILS below 0020.
//
// AMBIGUITY / LIMIT recorded here:
//   [A20-14] §8's apply-time precondition ("the three new relations are empty at
//            end of apply") is a ONE-SHOT assertion inside the migration's own
//            transaction. It is NOT re-assertable from a rig that has since run
//            this battery, and no live-catalog probe can substitute for it. The
//            behavioural DARK equivalence is asserted instead, over clients that
//            provably carry no typed consent.
//   [A20-15] THE CONTRACT GAP the "Dependencies on 0019" row leaves open: 0019's
//            clean-end-state scan fails any non-whitelisted clara function whose
//            prosrc names a wiki relation OR CARRIES A CALL EDGE into the wiki
//            set. The contract states the obligation for RELATION references only,
//            yet §4.3 and §5.3 REQUIRE four 0020 functions to call the audited
//            wiki writers. Those four must join the closed set.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane, roleCanExecute, fnSource,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, createClient, seedOpeningCoa,
  RUNTIME_FNS, OWNER_FNS, ALL_0020_FN_NAMES, ALL_0020_FN_SIGS, NEW_RELATIONS,
  PURPOSE_EVENT_TYPES, TTL_SECONDS, UNKNOWN_VERDICT, DELETED_VERDICT_TOKEN,
  FORBIDDEN_RETURN_KEYS, INGEST_STATUS, LEGACY_CONSENT_TABLE,
  WB_WIKI_RELATIONS, WB_0019_WHITELIST_SIGS, WB_0020_WHITELIST_SIGS,
  regProcedure, fnFacts, overloadCount, canonical, anyTableGrant,
  prepareForLatestEvent, resolveIngest, classifiedDocument, fileTo,
  modelVersionCount, sourcePageVersions, countRows,
} from "./wb-0020-helpers.mjs";

let live = false;
let w = null;

async function freshClient(tag) {
  const c = await createClient(w.users.alice, { name: `${w.prefix}_${tag}`, opKey: opk("cli") });
  await seedOpeningCoa(w.users.alice, c);
  return c;
}

before(async () => {
  live = await wbEnsureReady20();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0020-tail"); await endPool(); });

// ===========================================================================
// §8 — structural / catalog.
// ===========================================================================

test("META / [0020 §8]: EXACTLY the eight pinned functions exist, each with ONE overload, SECURITY DEFINER, search_path=clara,pg_temp, owned by clara_fn_owner", async () => {
  fail0020(live);
  for (const [name, sig] of Object.entries({ ...RUNTIME_FNS, ...OWNER_FNS })) {
    assert.ok(await regProcedure(sig),
      `${sig} resolves via to_regprocedure — the EXACT signature §10.2's runtime guard will use`);
    assert.equal(await overloadCount(name), 1, `clara.${name} has exactly ONE overload`);
    const f = await fnFacts(sig);
    assert.equal(f.secdef, true, `${name} is SECURITY DEFINER`);
    assert.equal(f.owner, ROLES.fnOwner, `${name} is owned by clara_fn_owner`);
    assert.match(String(f.config), /search_path=clara/, `${name} pins search_path=clara,pg_temp`);
    assert.match(String(f.result), /jsonb/i, `${name} returns jsonb`);
  }
  assert.equal(ALL_0020_FN_NAMES.length, 8, "the closed set is eight functions");
});

test("[0020 §8]: the four purpose-discriminated event types are registered — and 0020 registered NOTHING else", async () => {
  fail0020(live);
  const egress = (await rootQuery(
    "select name from clara.event_types where name like 'egress.%' order by name")).rows.map((x) => x.name);
  assert.deepEqual(egress, [
    "egress.consent_granted", "egress.consent_revoked",
    "egress.purpose_activated", "egress.purpose_consent_granted",
    "egress.purpose_consent_revoked", "egress.purpose_deactivated",
  ], `exactly the two legacy + four typed egress event types (got ${egress.join(",")})`);
  for (const n of PURPOSE_EVENT_TYPES) assert.ok(egress.includes(n), `${n} registered`);
});

// ===========================================================================
// §8 — return shape: the STRUCTURAL allowlist, asserted in SOURCE.
// ===========================================================================

test("[0020 §8 — the leakage source-scan]: prepare_egress_dispatch's body builds NO forbidden key and NO count expression; consume returns one key; the resolver returns no count", async () => {
  fail0020(live);
  const prep = (await fnSource("prepare_egress_dispatch")).toLowerCase();
  for (const k of ["granted_at", "scope_note", "evidence_document_id", "granted_by", "revoke_reason"]) {
    assert.ok(!prep.includes(`'${k}'`),
      `prepare_egress_dispatch never builds the key '${k}' into its return (§3.3's structural allowlist)`);
  }
  assert.ok(!/count\s*\(/.test(prep),
    "prepare_egress_dispatch's body carries no count() expression — an existence count is an oracle");
  // The two keys it MUST build.
  assert.ok(prep.includes("'verdict'"), "…it builds 'verdict'");
  assert.ok(prep.includes("'authorization_id'"), "…and 'authorization_id'");

  const cons = (await fnSource("consume_egress_dispatch")).toLowerCase();
  assert.ok(cons.includes("'verdict'"), "consume builds 'verdict'");
  assert.ok(!cons.includes("'authorization_id'"),
    "…and NOT 'authorization_id' — consume returns exactly ONE key (§3.4)");

  const res = (await fnSource("resolve_document_client")).toLowerCase();
  assert.ok(res.includes("'status'") && res.includes("'client_id'"),
    "the resolver builds 'status' and (only on unique) 'client_id'");
  assert.ok(!res.includes("'candidates'") && !res.includes("'candidates_n'"),
    "…and never a candidate list or count key (§5.1: no count at all)");
});

test("[0020 §8 / §3.3]: the literal 'denied' appears in NO 0020 function source — the token is DELETED from the vocabulary, not merely unused", async () => {
  fail0020(live);
  const offenders = [];
  for (const name of ALL_0020_FN_NAMES) {
    const src = (await fnSource(name)).toLowerCase();
    if (src.includes(DELETED_VERDICT_TOKEN)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `'denied' survives in: ${offenders.join(", ")} — both non-granted states lead to the identical safety action, so distinguishing them is pure existence leakage (§3.3)`);
});

test("[0020 §8/§3.2]: the 120-second TTL is a single named constant present in prepare_egress_dispatch's source", async () => {
  fail0020(live);
  const src = (await fnSource("prepare_egress_dispatch")).toLowerCase();
  assert.ok(/\b120\b/.test(src) || /'120 seconds'/.test(src) || /interval\s*'120/.test(src),
    `the ${TTL_SECONDS}-second TTL constant is visible in prepare_egress_dispatch's source (§8)`);
  // …and the OTHER seven do not carry their own copy of it.
  const dupes = [];
  for (const name of ALL_0020_FN_NAMES.filter((n) => n !== "prepare_egress_dispatch")) {
    if (/interval\s*'120/.test((await fnSource(name)).toLowerCase())) dupes.push(name);
  }
  assert.deepEqual(dupes, [], `the TTL is a SINGLE named constant, not copied into ${dupes.join(", ")}`);
});

// ===========================================================================
// §8 / §9.5 — grants and the capability closed set.
// ===========================================================================

test("[0020 §8/§9.5 — the capability closed set]: the four runtime fns reach clara_runtime ONLY; the four owner RPCs reach clara_authenticated ONLY; PUBLIC-execute sweep = 0", async () => {
  fail0020(live);
  const APP_ROLES = [ROLES.runtime, ROLES.authenticated, ROLES.agentRo,
    ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const name of Object.keys(RUNTIME_FNS)) {
    for (const role of APP_ROLES) {
      assert.equal(await roleCanExecute(role, name), role === ROLES.runtime,
        `${name}: EXECUTE for ${role} should be ${role === ROLES.runtime}`);
    }
  }
  for (const name of Object.keys(OWNER_FNS)) {
    for (const role of APP_ROLES) {
      assert.equal(await roleCanExecute(role, name), role === ROLES.authenticated,
        `${name}: EXECUTE for ${role} should be ${role === ROLES.authenticated}`);
    }
  }
  for (const sig of ALL_0020_FN_SIGS) {
    const f = await fnFacts(sig);
    assert.equal(f.public_exec, false, `${sig} is NOT PUBLIC-executable (the §8 sweep must be 0)`);
  }
});

test("[0020 §8 / A20-16 — a CONTRACT-vs-CODE contradiction]: NO app role holds a table grant on the three new relations or on the LEGACY consent relation; on clara.document_filings the true (and only implementable) claim is §5.1's — clara_runtime holds none", async () => {
  fail0020(live);
  const APP_ROLES = [ROLES.runtime, ROLES.authenticated, ROLES.agentRo,
    ROLES.wakeInteractive, ROLES.wakeProactive];
  for (const rel of [...NEW_RELATIONS, LEGACY_CONSENT_TABLE]) {
    for (const role of APP_ROLES) {
      assert.equal(await anyTableGrant(role, rel), false,
        `${role} holds NO table privilege on clara.${rel} — the DEFINER functions are the only surface`);
    }
  }
  // §8 says "No table grant to any role ... nor on clara.document_filings —
  // asserted absent." That is FALSE in the prestate: 0007:2739-2740 grants SELECT
  // on clara.document_filings to clara_authenticated AND clara_agent_ro, and 0020
  // does not (and must not) revoke it. §5.1 states the true, narrower property.
  // A tail written to §8's literal words would have ABORTED the 0020 apply.
  assert.equal(await anyTableGrant(ROLES.runtime, "document_filings"), false,
    "clara_runtime holds NO table privilege on clara.document_filings (§5.1 — the DEFINER resolver is the entire surface)");
  const legacyGrantees = [];
  for (const role of APP_ROLES) {
    if (await anyTableGrant(role, "document_filings")) legacyGrantees.push(role);
  }
  assert.deepEqual(legacyGrantees.sort(), [ROLES.agentRo, ROLES.authenticated].sort(),
    `the PRE-EXISTING 0007 grantees of clara.document_filings are unchanged by 0020 (got ${legacyGrantees.join(",")})`);
  noteLane(`[A20-16] §8's "No table grant to any role ... nor on clara.document_filings — asserted absent" CONTRADICTS committed 0007:2739-2740 (grant select ... to clara_authenticated, clara_agent_ro). §5.1's clara_runtime-scoped statement is the true one. A tail implementing §8 literally aborts the apply; asserted here in its correct form and RECORDED.`);
});

// ===========================================================================
// The 0019 COUPLING — the highest-value structural cell in this file.
// ===========================================================================

test("[0020 / 0019 §9 — A20-15 THE CONTRACT GAP]: 0019's clean-end-state closed-set scan still passes ONLY once 0020's four wiki-calling functions join the whitelist; the contract's 'Dependencies on 0019' row states the RELATION half only", async () => {
  fail0020(live);
  const RELATION_RE = `\\m(${WB_WIKI_RELATIONS.join("|")})\\M`;
  const CALL_EDGE_RE = "\\m(publish_wiki_page_version|_publish_wiki_page_version_core|record_wiki_source_ingest"
    + "|retire_wiki_page|set_wiki_synthesis_hold|clear_wiki_synthesis_hold|get_wiki_page"
    + "|list_wiki_pages|get_context_pack|run_client_lint|run_lint_all|mark_wiki_citations_stale)\\M";

  // Resolve each whitelisted SIGNATURE to an oid text (the wb-0019-tail idiom —
  // EXACT regprocedure identity, never proname, so a future overload of a
  // whitelisted name is not silently covered).
  const oidsOf = async (sigs) => (await rootQuery(
    "select s::regprocedure::oid::text as oid from unnest($1::text[]) s", [sigs])).rows.map((x) => x.oid);
  const SCAN = `
    select p.oid::regprocedure::text sig,
           (p.prosrc ~* $2) names_relation, (p.prosrc ~* $3) call_edge
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara'
       and not (p.oid::text = any($1::text[]))
       and (p.prosrc ~* $2 or p.prosrc ~* $3)
     order by 1`;

  // (1) With the 0019 whitelist ALONE the scan must now FAIL — that is the gap.
  const only19 = await rootQuery(SCAN,
    [await oidsOf(WB_0019_WHITELIST_SIGS), RELATION_RE, CALL_EDGE_RE]);
  const gapNames = only19.rows.map((r) => r.sig);
  noteLane(`[A20-15] functions outside 0019's 12-member whitelist that now touch the wiki set: ${gapNames.join(", ") || "(none)"} — wb-0019-tail.test.mjs asserts whitelistOids.length === 12 and scans for exactly these two regexes, so it (and 0019's own apply-time scan, were it re-run) BREAKS unless the whitelist is extended in lockstep. §9.7's lockstep list does not mention it.`);

  // (2) With the 0019 ∪ 0020 whitelist the closed set must be CLEAN again.
  const union = [...WB_0019_WHITELIST_SIGS, ...WB_0020_WHITELIST_SIGS];
  const both = await rootQuery(SCAN, [await oidsOf(union), RELATION_RE, CALL_EDGE_RE]);
  assert.equal(both.rows.length, 0,
    `clara functions outside the 0019∪0020 wiki whitelist touching the wiki set:\n${both.rows.map((x) => `  ${x.sig} (relation=${x.names_relation} call_edge=${x.call_edge})`).join("\n")}\nEither 0020 introduced an unexpected wiki toucher, or the expected 0020 whitelist in wb-helpers.mjs (WB_0020_WHITELIST_SIGS) does not match what 0020 built.`);
});

test("[0020 Dependencies-on-0019]: 0020's functions do NOT name any of the seven wiki relations directly — they go through the AUDITED writers, exactly as the pinned design requires", async () => {
  fail0020(live);
  const relRe = new RegExp(`\\b(${WB_WIKI_RELATIONS.join("|")})\\b`, "i");
  const offenders = [];
  for (const name of ALL_0020_FN_NAMES) {
    if (relRe.test(await fnSource(name))) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    `these 0020 functions hand-touch a wiki relation instead of calling the audited writer (the cardinal invariant): ${offenders.join(", ")}`);
  // …and the expected call edges ARE there (a vacuous scan proves nothing).
  const ingestSrc = await fnSource("resolve_and_ingest_wiki_source");
  assert.ok(ingestSrc.includes("record_wiki_source_ingest"),
    "resolve_and_ingest_wiki_source calls the audited ingest writer (§5.3: 0020 hand-writes nothing)");
  const revSrc = await fnSource("revoke_client_egress_purpose");
  assert.ok(revSrc.includes("set_wiki_synthesis_hold"),
    "revoke_client_egress_purpose sets the hold via the audited writer (§4.3)");
  const actSrc = await fnSource("activate_client_egress_purpose");
  assert.ok(actSrc.includes("clear_wiki_synthesis_hold"),
    "activate_client_egress_purpose clears the hold via the audited writer (§4.3)");
});

test("[0020 §5.3 / Dependencies-on-0019]: record_wiki_source_ingest is NOT modified — the entry.approved lane, which carries an authoritative client_id and may legitimately serve a multi-filed document, keeps working", async () => {
  fail0020(live);
  assert.equal(await overloadCount("record_wiki_source_ingest"), 1,
    "one overload — 0020 did not add a uniqueness-requiring sibling");
  const src = (await fnSource("record_wiki_source_ingest")).toLowerCase();
  assert.ok(!src.includes("distinct"),
    "the writer carries no distinct-client uniqueness test — the uniqueness requirement belongs to the RESOLVER-driven entry point only (§5.3)");
});

// ===========================================================================
// §10.1 — what DARK actually means.
// ===========================================================================

test("[0020 §10.1 — the DARK claim, positive half]: with ZERO typed consents and ZERO activations, EVERY client's verdict is a byte-identical `unknown` and there are ZERO model-lane publications", async () => {
  fail0020(live);
  const clients = [];
  for (let i = 0; i < 4; i += 1) clients.push(await freshClient(`dark${i}`));
  const payloads = [];
  for (const c of clients) {
    assert.equal(await countRows("client_egress_purpose_consents", "where client_id=$1", [c]), 0,
      "the client carries zero typed consents");
    assert.equal(await countRows("client_egress_purpose_activations", "where client_id=$1", [c]), 0,
      "…and zero activations");
    payloads.push(await prepareForLatestEvent({ firm: w.firms.A, client: c }));
    assert.equal(await modelVersionCount(c), 0, "…and zero model-lane wiki versions");
  }
  const want = canonical(UNKNOWN_VERDICT);
  for (const p of payloads) {
    assert.equal(canonical(p), want, `every verdict is a byte-identical unknown (got ${JSON.stringify(p)})`);
  }
  assert.equal(await countRows("egress_dispatch_authorizations",
    "where client_id = any($1::uuid[])", [clients]), 0,
    "no authorization row was minted for any dark client");
  noteLane("[A20-14] §8's apply-time 'the three new relations are EMPTY at end of apply' is a ONE-SHOT assertion inside the migration's own transaction. It cannot be re-asserted from a rig that has since run this battery; the behavioural DARK equivalence above is the strongest live-catalog substitute.");
});

test("[0020 §10.1(1) — the DELIBERATELY LIVE half]: deterministic ingest of a uniquely-filed classified document is NOT dark; it publishes, with no consent and no model anywhere in the path", async () => {
  fail0020(live);
  const client = await freshClient("dark_ingest");
  const doc = await classifiedDocument({ firm: w.firms.A });
  await fileTo(w.users.alice, { document: doc.documentId, client });
  assert.deepEqual(await prepareForLatestEvent({ firm: w.firms.A, client }), UNKNOWN_VERDICT,
    "the client has NO typed consent — model synthesis is dark for it");
  const r = await resolveIngest({ firm: w.firms.A, document: doc.documentId });
  assert.equal(r.status, INGEST_STATUS.projected,
    "…yet deterministic ingest PUBLISHES: this is WB-R23(3), ruled — the point of the resolver, not a side effect");
  const { versions } = await sourcePageVersions(client, doc.documentId);
  assert.equal(versions.length, 1, "one deterministic version");
  assert.equal(versions[0].synthesis, "deterministic", "…on the deterministic lane");
  assert.equal(await modelVersionCount(client), 0, "…and STILL zero model-lane publications");
});

test("[0020 §3.3/§8]: the FORBIDDEN return keys never appear in a VERDICT payload — granted or unknown", async () => {
  fail0020(live);
  const dark = await freshClient("dark_keys");
  const lit = await freshClient("lit_keys");
  const { lightSynthesis, consumeDispatch } = await import("./wb-0020-helpers.mjs");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client: lit });
  const granted = await prepareForLatestEvent({ firm: w.firms.A, client: lit });
  const unknown = await prepareForLatestEvent({ firm: w.firms.A, client: dark });
  const consumed = await consumeDispatch({ firm: w.firms.A, authorization: granted.authorization_id });
  for (const payload of [granted, unknown, consumed]) {
    for (const k of FORBIDDEN_RETURN_KEYS) {
      assert.ok(!Object.prototype.hasOwnProperty.call(payload ?? {}, k),
        `the verdict ${JSON.stringify(payload)} does not carry the forbidden key '${k}'`);
    }
  }
  assert.deepEqual(Object.keys(consumed).sort(), ["verdict"], "consume is one key");
});
