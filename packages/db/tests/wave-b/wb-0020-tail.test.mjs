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
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane, roleCanExecute, fnSource, getPool,
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

test("META / [0020 §8]: EXACTLY the nine pinned functions exist, each with ONE overload, SECURITY DEFINER, search_path=clara,pg_temp, owned by clara_fn_owner", async () => {
  fail0020(live);
  // 0038 (WCB-R1, design v2.1): prepare_egress_dispatch and consume_egress_dispatch each
  // gain ONE additional sha-bound overload (6-arg / 7-arg); every other member stays single.
  const OVERLOADS_0038 = { prepare_egress_dispatch: 2, consume_egress_dispatch: 2 };
  for (const [name, sig] of Object.entries({ ...RUNTIME_FNS, ...OWNER_FNS })) {
    assert.ok(await regProcedure(sig),
      `${sig} resolves via to_regprocedure — the EXACT signature §10.2's runtime guard will use`);
    assert.equal(await overloadCount(name), OVERLOADS_0038[name] ?? 1,
      `clara.${name} has exactly ${OVERLOADS_0038[name] ?? 1} overload(s)`);
    const f = await fnFacts(sig);
    assert.equal(f.secdef, true, `${name} is SECURITY DEFINER`);
    assert.equal(f.owner, ROLES.fnOwner, `${name} is owned by clara_fn_owner`);
    assert.match(String(f.config), /search_path=clara/, `${name} pins search_path=clara,pg_temp`);
    assert.match(String(f.result), /jsonb/i, `${name} returns jsonb`);
  }
  // EIGHT in contract v1.0; NINE after the 2026-07-25 ratified §7.1 amendment (ratchet R1-F3)
  // added clara.classify_consent_evidence_document — the owner path that stamps
  // document_kind='consent_evidence' and grants NO egress. Without it the only live writer of
  // that stamp was the LEGACY grant_client_egress, which in the same call authorizes
  // purpose-blind invoice-facts egress, so §7.2's step 1 could not be executed for a client who
  // consented ONLY to wiki synthesis.
  // 0038 (WCB-R1): prepare/consume gain ONE sha-bound overload each (6-arg / 7-arg); the
  // 0020-era arities stay byte-identical. The NAME census stays nine; the overload census
  // in the meta cell below carries the two additions.
  assert.equal(ALL_0020_FN_NAMES.length, 9, "the closed set is nine function NAMES");
});

test("[0020 §7.1 amendment / R1-F3]: the owner evidence-classification verb stamps consent_evidence, grants NOTHING, and refuses a document already classified as something else", async () => {
  fail0020(live);
  const { classifyConsentEvidence, seedVerifiedDocument, filedDocument, assertRaises,
    detailReason } = await import("./wb-0020-helpers.mjs");
  const client = await freshClient("cce_owner");
  const seed = await seedVerifiedDocument({ firm: w.firms.A });
  const before0 = (await rootQuery(
    "select document_kind from clara.documents where id=$1", [seed.documentId])).rows[0].document_kind;
  assert.equal(before0, null, "the letter is INGESTED but UNCLASSIFIED — what a real upload looks like");

  const r = await classifyConsentEvidence(w.users.alice, { document: seed.documentId });
  assert.equal(r.document_kind, "consent_evidence", "the owner verb stamps the kind");
  assert.equal(r.prior_kind, null, "…and reports what it replaced");
  assert.equal((await rootQuery(
    "select document_kind from clara.documents where id=$1", [seed.documentId])).rows[0].document_kind,
  "consent_evidence", "the stamp is on the document");

  // THE POINT OF THE AMENDMENT: no egress of any kind was granted.
  assert.equal(await countRows(LEGACY_CONSENT_TABLE, "where firm_id=$1 and client_id=$2", [w.firms.A, client]), 0,
    "NO legacy purpose-blind consent — the pre-amendment shortcut was grant_client_egress, which mints one");
  assert.equal(await countRows("client_egress_purpose_consents", "where client_id=$1", [client]), 0,
    "…and no typed consent either: classification is not attestation");

  // A coded bill cannot be re-labelled as a consent letter (the 0014 rule, kept).
  const invoice = await filedDocument(w.users.alice, { firm: w.firms.A, client, kind: "invoice" });
  const err = await assertRaises("CLR28",
    () => classifyConsentEvidence(w.users.alice, { document: invoice.documentId }),
    "classifying an already-classified invoice as consent evidence");
  assert.equal(detailReason(err), "evidence_kind_conflict", "…with the kind-conflict discriminant");
});

test("[0020 §7.1 amendment / R1-F3]: the evidence-classification verb is OWNER-floored, firm-scoped (CLR11) and reachable only by clara_authenticated", async () => {
  fail0020(live);
  const { classifyConsentEvidence, seedVerifiedDocument, assertRaisesOneOf, assertRaises } =
    await import("./wb-0020-helpers.mjs");
  const seed = await seedVerifiedDocument({ firm: w.firms.A });
  await assertRaisesOneOf(["CLR03", "CLR04"],
    () => classifyConsentEvidence(w.users.bob, { document: seed.documentId }),
    "classify_consent_evidence_document as a bookkeeper");
  await assertRaises("CLR11",
    () => classifyConsentEvidence(w.users.dave, { document: seed.documentId }),
    "a firm-B owner classifying a firm-A document");
  assert.equal((await rootQuery(
    "select document_kind from clara.documents where id=$1", [seed.documentId])).rows[0].document_kind,
  null, "neither refused call stamped anything");
  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal(await roleCanExecute(role, "classify_consent_evidence_document"), false,
      `${role} cannot reach the evidence-classification verb`);
  }
  assert.equal(await roleCanExecute(ROLES.authenticated, "classify_consent_evidence_document"), true,
    "…and clara_authenticated can (the owner floor is in the body)");
});

// ===========================================================================
// RATCHET R2 — cross-firm LOCK REACH on the evidence-classification verb.
//
// The v1.1 build read `select * into d from clara.documents where id=p_document for update`
// and compared d.firm_id AFTERWARDS, while its own comment claimed "firm-checked BEFORE
// anything else is read off the row". So a firm-A owner holding a firm-B document UUID took
// a ROW LOCK on firm B's document — and, if firm B held it, WAITED on it — before receiving
// CLR11. Two defects in one: cross-tenant lock contention (firm A queues behind firm B's
// unrelated work), and a timing oracle (a foreign UUID that exists and is locked becomes
// distinguishable from one that does not exist). Same class as R1-F5, reintroduced by a verb
// added AFTER R1's sweep.
//
// The fix puts firm_id IN the predicate; NOT FOUND still means CLR11, so a foreign document
// and a nonexistent one stay indistinguishable in the RESULT. This cell proves they are now
// also indistinguishable in the WAIT.
//
// Method. Session A holds firm B's document row FOR UPDATE. A CONTROL session proves that
// lock genuinely blocks (it must time out on the same row). Then session B — the firm-A
// owner, on a short leash — calls the verb and must return CLR11 promptly. Pre-fix, session B
// takes the control's fate instead: it blocks and the leash fires (57014). That is exactly
// how this cell fails if the predicate ever regresses.
// ===========================================================================

test("[0020 ratchet R2 · two-session]: a firm-A owner classifying a LOCKED firm-B document returns CLR11 WITHOUT ever waiting on firm B's row", async () => {
  fail0020(live);
  const { seedVerifiedDocument, assertRaises, classifyConsentEvidence } =
    await import("./wb-0020-helpers.mjs");
  const foreign = await seedVerifiedDocument({ firm: w.firms.B });

  let a = null; let ctl = null; let b = null;
  let out = null; let control = null;
  try {
    // Session A — firm B holds its own document row, exactly as a concurrent firm-B write would.
    a = await getPool().connect();
    await a.query("begin");
    assert.equal((await a.query(
      "select id from clara.documents where id = $1 for update", [foreign.documentId])).rows.length, 1,
    "session A holds the firm-B document row FOR UPDATE");

    // CONTROL — anything that genuinely reaches that row now blocks. Without this the fast
    // CLR11 below could be explained by the lock not being held at all.
    ctl = await getPool().connect();
    await ctl.query("set statement_timeout = '1s'");
    try {
      await ctl.query("select id from clara.documents where id = $1 for update", [foreign.documentId]);
      control = { code: null };
    } catch (e) { control = { code: e.code }; }
    assert.equal(control.code, "57014",
      "the CONTROL proves session A's row lock is real and blocking (a plain FOR UPDATE times out)");

    // Session B — the firm-A owner, with a short leash. The leash IS the assertion.
    b = await getPool().connect();
    await b.query(`set role ${ROLES.authenticated}`);
    await b.query("select set_config('request.jwt.claims', $1, false)",
      [JSON.stringify({ sub: w.users.alice, role: "authenticated" })]);
    await b.query("set statement_timeout = '4s'");
    const t0 = Date.now();
    try {
      await b.query(
        `select clara.classify_consent_evidence_document(p_document => $1, p_reason => $2,
           p_op_key => $3) as r`,
        [foreign.documentId, "r2 cross-firm lock-reach probe", opk("r2reach")]);
      out = { code: null };
    } catch (e) { out = { code: e.code }; }
    out.ms = Date.now() - t0;

    // Session A is STILL holding the lock here — that is what makes the result mean something.
    assert.equal(out.code, "CLR11",
      `the cross-firm call refuses CLR11 (got ${JSON.stringify(out)}). A 57014 means the verb`
      + " reached and WAITED on the foreign firm's row: the R2 defect, back.");
    assert.ok(out.ms < 2000,
      `…and it refused without waiting (${out.ms}ms against a 4000ms leash, while the control`
      + " on the same row timed out at 1000ms) — no cross-tenant contention, no timing oracle");

    await a.query("commit");
  } finally {
    for (const c of [a, ctl, b]) {
      if (!c) continue;
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }

  assert.equal((await rootQuery(
    "select document_kind from clara.documents where id=$1", [foreign.documentId])).rows[0].document_kind,
  null, "the refused cross-firm call stamped nothing on firm B's document");
  // Unlocked, the same call still refuses CLR11 — the fix changed the WAIT, not the verdict,
  // and a nonexistent document is still indistinguishable from a foreign one.
  await assertRaises("CLR11",
    () => classifyConsentEvidence(w.users.alice, { document: foreign.documentId }),
    "the same cross-firm classification with NO lock held");
  await assertRaises("CLR11",
    () => classifyConsentEvidence(w.users.alice, { document: crypto.randomUUID() }),
    "classification of a document that does not exist at all");
  noteLane("[R2] classify_consent_evidence_document carries firm_id IN the document predicate;"
    + " a cross-firm probe neither locks nor waits on the foreign row, and CLR11 still covers"
    + " foreign and nonexistent identically");
});

test("[0020 §8]: the four purpose-discriminated event types are registered — and 0020 registered NOTHING else AT 20 MIGRATIONS", async () => {
  fail0020(live);
  const egress = (await rootQuery(
    "select name from clara.event_types where name like 'egress.%' order by name")).rows.map((x) => x.name);
  // [Wave-F Track A, F-A7 gamma, D1-gamma] widened this closed set: the firm-narrow typed-
  // egress family (purpose 'firm_narrow_intake') mints its OWN four lifecycle event types under
  // the same `egress.` prefix, since 0020's `egress.purpose_*` names are purpose-generic in
  // wording but the client-scoped table shape (client_id NOT NULL) cannot represent a firm-
  // scoped grant — so gamma names its own siblings rather than reusing 0020's. This is the
  // FIRST wave to add a NEW `egress.`-prefixed name since 0020 (F-A1/F-A3/PR-1c all reused the
  // existing four purpose-discriminated types for their new PURPOSE VALUES, minting no new
  // event TYPE). The title's "0020 registered NOTHING else" claim is therefore true only up to
  // the 20-migration frontier this file is contract-blind to; this cell now names the full live
  // set honestly rather than re-asserting a stale absolute.
  assert.deepEqual(egress, [
    "egress.consent_granted", "egress.consent_revoked",
    "egress.firm_purpose_activated", "egress.firm_purpose_consent_granted",
    "egress.firm_purpose_consent_revoked", "egress.firm_purpose_deactivated",
    "egress.purpose_activated", "egress.purpose_consent_granted",
    "egress.purpose_consent_revoked", "egress.purpose_deactivated",
  ], `the two legacy + four 0020 typed + four F-A7-gamma firm-narrow egress event types (got ${egress.join(",")})`);
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

test("[0020 §5.3 / Dependencies-on-0019]: record_wiki_source_ingest gains NO uniqueness requirement — the entry.approved lane, which carries an authoritative client_id and may legitimately serve a multi-filed document, keeps working", async () => {
  fail0020(live);
  assert.equal(await overloadCount("record_wiki_source_ingest"), 1,
    "one overload — 0020 did not add a uniqueness-requiring sibling");
  const src = (await fnSource("record_wiki_source_ingest")).toLowerCase();
  assert.ok(!src.includes("distinct"),
    "the writer carries no distinct-client uniqueness test — the uniqueness requirement belongs to the RESOLVER-driven entry point only (§5.3)");
  // [A6] This cell used to be titled "is NOT modified", which stopped being true when the
  // deterministic-content floor landed (§5.6c). The claim §5.3 actually makes is about
  // UNIQUENESS, and that is what is asserted above. The one real change is named here rather
  // than left implied, and its byte-exact extent is pinned in wb-0020-legacy's §6 diff cell.
  assert.ok(src.includes("source_note_not_permitted"),
    "…and the ONE change 0020 does make to this verb is the A6 note floor, present and named");
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
  const { lightSynthesis, consumeDispatch, prepareBound } = await import("./wb-0020-helpers.mjs");
  await lightSynthesis(w.users.alice, { firm: w.firms.A, client: lit });
  const { verdict: granted, intent } = await prepareBound({ firm: w.firms.A, client: lit });
  const unknown = await prepareForLatestEvent({ firm: w.firms.A, client: dark });
  const consumed = await consumeDispatch({ authorization: granted.authorization_id, intent });
  for (const payload of [granted, unknown, consumed]) {
    for (const k of FORBIDDEN_RETURN_KEYS) {
      assert.ok(!Object.prototype.hasOwnProperty.call(payload ?? {}, k),
        `the verdict ${JSON.stringify(payload)} does not carry the forbidden key '${k}'`);
    }
  }
  assert.deepEqual(Object.keys(consumed).sort(), ["verdict"], "consume is one key");
});
