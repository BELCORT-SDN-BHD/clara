// WEB READS AND SMALL DOORS — the rig battery for
// packages/db/migrations/0174_web_reads_and_small_doors.sql and its statement-lane sibling
// 0175_stmt_witness_totals_and_institution_code.sql (numbered at merge under 裁-108).
//
// Refs #541 · CB-AE2E-007 · H-18 · CB-AE2E-018 · C-1 · H-09 · CB-AE2E-035 · H-49 · 裁-190.
//
// GATING IS ON THE LIVE CATALOG, never on a migration number: a number-keyed gate goes vacuous
// the day the file is renumbered at merge (review law 3, and the checkout-gate batteries' own
// shape). A PARTIAL cohort THROWS rather than skipping — a half-applied migration is a defect.
//
// WHAT THESE CELLS ARE FOR. Every door here decides WHO may read WHAT, on surfaces whose base
// relations are force-RLS with no application-role grant — so the door IS the wall, and a door
// that cannot say NO has a meaningless YES. Each refusal is asserted by its own SQLSTATE, and
// each is paired with the admitting twin that proves the refusal was the wall and not the
// fixture. Two cells are MUST-NOT-RED controls over pre-existing walls this migration widened
// (the chat one-way archive and the DELETE refusal), because a whitelist widening is exactly the
// shape that quietly opens more than it meant to.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, runAs, human, roleActor, endPool, getPool,
  buildWorld, createClient, insertUser, opk,
} from "./rig-fixtures.mjs";
import { seedVerifiedDocument } from "./rig-docs-fixtures.mjs";

const CLR04 = "CLR04";
const CLR08 = "CLR08";
const CLR10 = "CLR10";
const CLR11 = "CLR11";
const CLR23 = "CLR23";

let live = false;
let stmtLive = false;
let world = null;
let firmA = null;
let firmB = null;

/** Every object the cohort installs, probed as a set. A partial presence is a defect. */
async function cohortApplied() {
  const r = await rootQuery(`select
      to_regprocedure('clara.get_own_dpa_signature()')                                is not null as d1,
      to_regprocedure('clara.client_egress_state(uuid)')                              is not null as d2,
      to_regprocedure('clara.list_firm_timeline(bigint,integer)')                     is not null as d3,
      to_regprocedure('clara.archive_chat_session(uuid,text)')                        is not null as d4,
      to_regprocedure('clara.set_counterparty_identifiers(uuid,uuid,text,text,text)') is not null as d5,
      to_regprocedure('clara.build_frontier()')                                       is not null as d6,
      to_regclass('clara.firm_timeline_visible')                                      is not null as v1,
      to_regclass('clara.dr_canary_subjects')                                         is not null as t1,
      exists (select 1 from information_schema.columns
               where table_schema='clara' and table_name='chat_sessions'
                 and column_name='archived_at')                                                   as c1`);
  const row = r.rows[0];
  const flags = Object.entries(row);
  const present = flags.filter(([, v]) => v).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(
      `web-reads cohort is PARTIAL: ${flags.map(([k, v]) => `${k}=${v}`).join(" ")}. `
      + "A half-applied migration is a defect; refusing to skip past it.",
    );
  }
  return present === flags.length;
}

before(async () => {
  live = await cohortApplied();
  const s = await rootQuery(
    "select to_regprocedure('clara._stmt_institution_code(text)') is not null as ok");
  stmtLive = s.rows[0].ok;
  if (live) {
    world = await buildWorld();
    firmA = world.firms.A;
    firmB = world.firms.B;
  }
});
after(async () => { await endPool(); });

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_WEB_READS === "1") {
    console.warn("SKIP web-reads-and-doors: the cohort is not applied (explicit unnumbered/pre-integration run).");
    t.skip("web-reads cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "web-reads-and-doors is required for a focused run: apply "
    + "0174_web_reads_and_small_doors.sql (or its numbered suite copy)",
  );
}

function stmtGate(t) {
  if (gate(t)) return true;
  if (stmtLive) return false;
  if (process.env.CLARA_ALLOW_MISSING_WEB_READS === "1") {
    t.skip("statement-lane sibling absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "web-reads-and-doors statement cells require 0175_stmt_witness_totals_and_institution_code.sql",
  );
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; await fn(t); });
const stmtCell = (name, fn) => test(name, async (t) => { if (stmtGate(t)) return; await fn(t); });

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

async function expectCode(code, fn, label) {
  const err = await caught(fn);
  assert.ok(err, `${label}: expected ${code}, but it succeeded`);
  assert.equal(err.code, code, `${label}: expected ${code}, got ${err.code} -- ${err.message}`);
  return err;
}

/** One transaction that is ALWAYS rolled back, so a cell that has to move estate-wide state
 *  (publishing a superseding DPA version) never leaks into a sibling battery on the same rig. */
async function inRolledBackTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try { await client.query("rollback"); } catch { /* best-effort */ }
    try { await client.query("reset role"); } catch { /* best-effort */ }
    try { await client.query("reset all"); } catch { /* best-effort */ }
    client.release();
  }
}

const asSub = (client, sub) => client.query(
  "select set_config('request.jwt.claims', $1, true)",
  [JSON.stringify({ sub, role: "authenticated" })]);

// =====================================================================================
// wr.1..4 — clara.get_own_dpa_signature() (CB-AE2E-007)
// =====================================================================================

cell("wr.1 the DPA read is clara_authenticated-only and refuses an unauthenticated caller", async () => {
  const acl = await rootQuery(
    `select array_agg(distinct g.grantee order by g.grantee) as who
       from (select (aclexplode(p.proacl)).grantee::regrole::text as grantee
               from pg_proc p where p.oid='clara.get_own_dpa_signature()'::regprocedure) g
      where g.grantee <> 'clara_fn_owner'`);
  assert.deepEqual(acl.rows[0].who, ["clara_authenticated"],
    "wr.1 EXECUTE is exactly {clara_authenticated}");
  // The role WITHOUT a jwt: the door must refuse rather than return an empty set, because an
  // empty set is indistinguishable from "you signed nothing".
  await expectCode(CLR04,
    () => runAs(roleActor("clara_authenticated"), "select * from clara.get_own_dpa_signature()"),
    "wr.1 anon");
});

cell("wr.2 the DPA read is SELF-scoped: a signature is visible to its signer and to nobody else", async () => {
  const signer = await insertUser(world.prefix, "dpa1");
  const other = await insertUser(world.prefix, "dpa2");
  const doc = await rootQuery(
    "select version, body_sha256 from clara.dpa_documents where effective_to is null");
  assert.equal(doc.rowCount, 1, "wr.2 exactly one current DPA document");
  await humanQuery(signer,
    "select clara.sign_dpa(p_version => $1, p_body_sha256 => $2, p_op_key => $3) as r",
    [doc.rows[0].version, doc.rows[0].body_sha256, opk("wr-sign")]);

  const mine = await humanQuery(signer, "select * from clara.get_own_dpa_signature()");
  assert.equal(mine.rowCount, 1, "wr.2 the signer reads exactly their own signature");
  assert.equal(mine.rows[0].dpa_version, doc.rows[0].version);
  assert.equal(mine.rows[0].is_current, true, "wr.2 a signature against the live bytes is current");
  assert.ok(mine.rows[0].signed_at instanceof Date, "wr.2 signed_at is a real timestamp");

  // THE WALL. The door takes no parameter, so the only way to ask about somebody else is to BE
  // somebody else — and then you see your own (empty) history, never theirs.
  const theirs = await humanQuery(other, "select * from clara.get_own_dpa_signature()");
  assert.equal(theirs.rowCount, 0, "wr.2 another actor reads ZERO rows, not the signer's");
});

cell("wr.3 a signature against SUPERSEDED bytes reads is_current=false, not as signed", async () => {
  const signer = await insertUser(world.prefix, "dpa3");
  const doc = (await rootQuery(
    "select version, body, body_sha256 from clara.dpa_documents where effective_to is null")).rows[0];
  await humanQuery(signer,
    "select clara.sign_dpa(p_version => $1, p_body_sha256 => $2, p_op_key => $3) as r",
    [doc.version, doc.body_sha256, opk("wr-sign2")]);

  await inRolledBackTx(async (client) => {
    // Publish a superseding version. Order matters: uq_dpa_documents_current is a unique index
    // on ((true)) WHERE effective_to IS NULL, so the standing row is stamped FIRST.
    await client.query("set local role clara_fn_owner");
    await client.query(
      "update clara.dpa_documents set effective_to = now() where effective_to is null");
    const nextBody = `${doc.body}\n-- wr.3 superseding text`;
    await client.query(
      `insert into clara.dpa_documents(version, body, body_sha256, source_path, effective_from)
       values ($1, $2, sha256(convert_to($2,'UTF8')), 'rig://wr.3', now())`,
      [`${doc.version}-wr3`, nextBody]);
    await client.query("reset role");

    await client.query("set local role clara_authenticated");
    await asSub(client, signer);
    const r = await client.query("select * from clara.get_own_dpa_signature()");
    assert.equal(r.rowCount, 1, "wr.3 the signature is still returned");
    assert.equal(r.rows[0].is_current, false,
      "wr.3 a signature against superseded bytes must read is_current=false");
  });

  // AND THE ROLLBACK HELD: the estate's current document is unchanged for every sibling battery.
  const after = await rootQuery(
    "select count(*)::int as n from clara.dpa_documents where effective_to is null");
  assert.equal(after.rows[0].n, 1, "wr.3 the superseding fixture was rolled back");
});

// =====================================================================================
// wr.4..7 — clara.client_egress_state(uuid) (H-18, the READ half)
// =====================================================================================

cell("wr.4 the egress read returns every ratified purpose plus the legacy row, all 'none' when nothing is granted", async () => {
  const r = await humanQuery(world.users.alice,
    "select * from clara.client_egress_state($1)", [world.clients.A2]);
  const purposes = r.rows.map((x) => x.purpose);
  assert.equal(purposes[0], null,
    "wr.4 the legacy blanket row (purpose NULL) LEADS -- apps/web renders the rows in the order it receives them");
  // The five typed purposes as a SET: their relative order is the database's collation, which is
  // not a property this contract should pin (a C-collation cluster and an ICU one would disagree
  // and neither would be wrong). What IS pinned is that all five are always present.
  assert.deepEqual([...purposes.slice(1)].sort(),
    ["bank_matching", "document_processing", "statement_extraction", "wiki_synthesis", "witness_extraction"],
    "wr.4 every ratified typed purpose is reported, present or not");
  for (const row of r.rows) {
    assert.equal(row.state, "none", `wr.4 ${row.purpose ?? "(legacy)"} reads state='none'`);
    assert.equal(row.consent_id, null, "wr.4 no consent id when nothing is granted");
    assert.equal(row.evidence_kind, null, "wr.4 no evidence kind when nothing is granted");
  }
});

cell("wr.5 the egress read is firm-scoped and floored at bookkeeper", async () => {
  // CROSS-FIRM: firm A's owner asking about firm B's client is an honest refusal, never an
  // empty result — an empty result would be indistinguishable from "that client has no consent".
  await expectCode(CLR11,
    () => humanQuery(world.users.alice, "select * from clara.client_egress_state($1)", [world.clients.B1]),
    "wr.5 cross-firm");
  // BELOW THE FLOOR: carol is firm A's viewer.
  await expectCode(CLR04,
    () => humanQuery(world.users.carol, "select * from clara.client_egress_state($1)", [world.clients.A1]),
    "wr.5 viewer");
  // THE ADMITTING TWIN: bob is firm A's bookkeeper, and the floor is bookkeeper+.
  const ok = await humanQuery(world.users.bob,
    "select * from clara.client_egress_state($1)", [world.clients.A1]);
  assert.equal(ok.rowCount, 6, "wr.5 a bookkeeper reads the full six-row state");
});

cell("wr.6 a granted purpose reads 'granted', an activated one reads 'active', a revoked one reads 'revoked'", async () => {
  const client = await createClient(world.users.alice, { name: `wr6_${Date.now()}`, opKey: opk("wr-cli") });
  const evidence = await seedVerifiedDocument({ firm: firmA, grantClassifyConsent: false });
  await runAs(human(world.users.alice),
    "select clara.classify_consent_evidence_document(p_document => $1, p_reason => $2, p_op_key => $3) as r",
    [evidence.documentId, "wr.6 rig consent letter", opk("wr-cce")]);
  const grant = await runAs(human(world.users.alice),
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => 'wiki_synthesis',
       p_evidence_document => $2, p_scope_note => $3, p_op_key => $4) as r`,
    [client, evidence.documentId, "wr.6 rig scope note", opk("wr-grant")]);
  const consentId = grant.rows[0].r.consent_id;

  const granted = await humanQuery(world.users.alice,
    "select * from clara.client_egress_state($1) where purpose='wiki_synthesis'", [client]);
  assert.equal(granted.rows[0].state, "granted",
    "wr.6 a live consent with no activation reads 'granted', never 'active'");
  assert.equal(granted.rows[0].consent_id, consentId);
  assert.equal(granted.rows[0].evidence_document_id, evidence.documentId);
  assert.equal(granted.rows[0].evidence_kind, "consent_evidence",
    "wr.6 the evidence kind is read LIVE off the document, not assumed from the grant");
  assert.equal(granted.rows[0].scope_note, "wr.6 rig scope note");

  await runAs(human(world.users.alice),
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => 'wiki_synthesis',
       p_consent => $2, p_op_key => $3) as r`,
    [client, consentId, opk("wr-act")]);
  const active = await humanQuery(world.users.alice,
    "select * from clara.client_egress_state($1) where purpose='wiki_synthesis'", [client]);
  assert.equal(active.rows[0].state, "active", "wr.6 a live consent + live activation reads 'active'");
  assert.ok(active.rows[0].activation_id, "wr.6 the activation id is reported");

  // REVOKED READS AS REVOKED, NOT AS ABSENT — the whole reason the read exists. Revocation is
  // driven through the base relation as the owner principal because this battery is not testing
  // the revoke verb; what it is testing is that the READ tells revoked from never-granted.
  await rootQuery(
    `update clara.client_egress_purpose_consents
        set revoked_at = now(), revoked_by = $2, revoke_reason = 'wr.6 rig revoke'
      where id = $1`, [consentId, world.users.alice]);
  const revoked = await humanQuery(world.users.alice,
    "select * from clara.client_egress_state($1) where purpose='wiki_synthesis'", [client]);
  assert.equal(revoked.rows[0].state, "revoked",
    "wr.6 a revoked consent reads 'revoked' -- distinguishable from 'none'");
  assert.equal(revoked.rows[0].consent_id, consentId, "wr.6 the revoked consent is still named");
  // The OTHER four purposes are untouched by any of this.
  const others = await humanQuery(world.users.alice,
    "select state from clara.client_egress_state($1) where purpose is not null and purpose<>'wiki_synthesis'",
    [client]);
  assert.deepEqual(others.rows.map((x) => x.state), ["none", "none", "none", "none"],
    "wr.6 one purpose's consent does not colour the others");
});

cell("wr.7 the egress read added NO table grant to the consent relations", async () => {
  const r = await rootQuery(
    `select count(*)::int as n from information_schema.role_table_grants
      where table_schema='clara'
        and table_name in ('client_egress_consents','client_egress_purpose_consents',
                           'client_egress_purpose_activations')
        and grantee not in ('clara_fn_owner','postgres')`);
  assert.equal(r.rows[0].n, 0, "wr.7 the door is the only read path; the wall is intact");
  // And the direct read really is refused, so the door is not decoration.
  await expectCode("42501",
    () => humanQuery(world.users.alice, "select 1 from clara.client_egress_purpose_consents limit 1"),
    "wr.7 direct table read");
});

// =====================================================================================
// wr.8..11 — the firm timeline (CB-AE2E-018)
// =====================================================================================

cell("wr.8 firm_timeline_visible drops the payload entirely and carries both floors", async () => {
  const cols = await rootQuery(
    `select string_agg(column_name, ',' order by ordinal_position) as cols
       from information_schema.columns
      where table_schema='clara' and table_name='firm_timeline_visible'`);
  assert.equal(cols.rows[0].cols,
    "firm_id,seq,event_id,event_type,event_description,client_id,actor,on_behalf_of,via_wake_kind,object_id,object_kind,created_at",
    "wr.8 the column list is pinned WHOLE, so a trailing append cannot shift the ordinals apps/web reads");
  // Asserted as an absence of the COLUMN, not of a value: a payload column holding NULLs today
  // would still be a payload column tomorrow.
  const payload = await rootQuery(
    `select count(*)::int as n from information_schema.columns
      where table_schema='clara' and table_name='firm_timeline_visible' and column_name='payload'`);
  assert.equal(payload.rows[0].n, 0, "wr.8 there is no payload column at all");
});

cell("wr.9 the timeline view is firm-scoped and floored: a viewer reads zero rows, a bookkeeper reads their own firm only", async () => {
  // buildWorld's own fixture acts have already emitted domain events for both firms.
  const mine = await humanQuery(world.users.bob,
    "select count(*)::int as n, count(*) filter (where firm_id <> $1)::int as foreign_rows from clara.firm_timeline_visible",
    [firmA]);
  assert.ok(mine.rows[0].n > 0, "wr.9 a bookkeeper of firm A reads a non-empty timeline (the YES that gives the NO meaning)");
  assert.equal(mine.rows[0].foreign_rows, 0, "wr.9 not one row belongs to another firm");
  const viewer = await humanQuery(world.users.carol,
    "select count(*)::int as n from clara.firm_timeline_visible");
  assert.equal(viewer.rows[0].n, 0, "wr.9 a rank-0 viewer reads ZERO rows -- the floor the raw domain_events grant lacks");
  // The CONTROL that proves the floor is what did it: the same viewer CAN read raw domain_events.
  const raw = await humanQuery(world.users.carol,
    "select count(*)::int as n from clara.domain_events");
  assert.ok(raw.rows[0].n > 0,
    "wr.9 the viewer's zero came from the view's floor, not from an empty firm -- raw domain_events is still readable to them");
});

cell("wr.10 list_firm_timeline refuses below bookkeeper, clamps its page, and pages strictly OLDER than the cursor", async () => {
  await expectCode(CLR04,
    () => humanQuery(world.users.carol, "select * from clara.list_firm_timeline(null, 10)"),
    "wr.10 viewer");

  const page = await humanQuery(world.users.bob,
    "select * from clara.list_firm_timeline(null, 3)");
  assert.equal(page.rowCount, 3, "wr.10 the first page honours the limit");
  assert.deepEqual(Object.keys(page.rows[0]),
    ["seq", "event_type", "event_description", "client_id", "actor", "on_behalf_of", "via_wake_kind", "created_at"],
    "wr.10 the door returns exactly the eight contracted columns, in order");
  const seqs = page.rows.map((x) => Number(x.seq));
  assert.deepEqual(seqs, [...seqs].sort((a, b) => b - a), "wr.10 reading order is newest first");
  assert.ok(page.rows[0].event_description,
    "wr.10 event_description is joined from clara.event_types, not left null");

  const next = await humanQuery(world.users.bob,
    "select * from clara.list_firm_timeline($1, 3)", [seqs[2]]);
  const nextSeqs = next.rows.map((x) => Number(x.seq));
  assert.ok(nextSeqs.every((s) => s < seqs[2]),
    `wr.10 the next page is STRICTLY older than the cursor (cursor ${seqs[2]}, got ${nextSeqs.join(",")})`);
  assert.equal(nextSeqs.filter((s) => seqs.includes(s)).length, 0, "wr.10 no row is served twice");

  // The clamp is the DB's and the caller cannot raise it.
  const huge = await humanQuery(world.users.bob, "select count(*)::int as n from clara.list_firm_timeline(null, 100000)");
  assert.ok(huge.rows[0].n <= 200, `wr.10 the page ceiling is 200 (got ${huge.rows[0].n})`);
  const zero = await humanQuery(world.users.bob, "select count(*)::int as n from clara.list_firm_timeline(null, 0)");
  assert.equal(zero.rows[0].n, 1, "wr.10 a non-positive limit clamps to 1 rather than refusing");

  // AND IT IS SECURITY INVOKER, alone among this cohort's doors. The view is granted and scopes
  // itself, so the door borrows no privilege it does not need; asserting the mode here is what
  // stops a later recut from silently promoting it and bypassing the view's own predicate.
  const mode = await rootQuery(
    "select prosecdef from pg_proc where oid='clara.list_firm_timeline(bigint,integer)'::regprocedure");
  assert.equal(mode.rows[0].prosecdef, false,
    "wr.10 list_firm_timeline is SECURITY INVOKER — the view's predicate binds, it is not re-implemented");
});

cell("wr.11 the timeline never crosses a firm boundary", async () => {
  const a = await humanQuery(world.users.bob, "select seq from clara.list_firm_timeline(null, 200)");
  const b = await humanQuery(world.users.dave, "select seq from clara.list_firm_timeline(null, 200)");
  assert.ok(a.rowCount > 0 && b.rowCount > 0, "wr.11 both firms have a timeline (the YES)");
  const aIds = await humanQuery(world.users.bob,
    "select count(*)::int as n from clara.firm_timeline_visible where firm_id = $1", [firmB]);
  assert.equal(aIds.rows[0].n, 0, "wr.11 firm A's bookkeeper sees no row of firm B");
});

cell("wr.12 the f_a4 receipt shim reaches clara.agent_act_receipts and still conforms", async () => {
  const src = await rootQuery(
    `select pg_get_viewdef('clara._agent_receipt_src_f_a4'::regclass) as def`);
  assert.match(src.rows[0].def, /agent_act_receipts/,
    "wr.12 the shim is wired to its real member table, not pi's typed-empty stub");
  // The conformance checker is the estate's own wall; running it here proves the projection did
  // not merely install but still satisfies the contract's arity, names and types.
  await rootQuery("select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a4')");
  const census = await rootQuery(
    "select wired, actual_sources from clara.agent_receipt_source_census() where item='f_a4'");
  assert.equal(census.rows[0].wired, true, "wr.12 the census reports f_a4 as WIRED");
  assert.deepEqual(census.rows[0].actual_sources, ["agent_act_receipts"],
    "wr.12 and it names the table derived from pg_depend, not the advisory expected_source");
});

// =====================================================================================
// wr.13..15 — the chat archive (C-1)
// =====================================================================================

async function newSession(author, clientId = null) {
  const r = await rootQuery(
    "insert into clara.chat_sessions(created_by, client_id, title) values ($1,$2,$3) returning id",
    [author, clientId, "wr chat"]);
  return r.rows[0].id;
}

cell("wr.13 archive is AUTHOR-ONLY, one-way and idempotent", async () => {
  const mine = await newSession(world.users.bob);
  // A colleague in the same firm is refused, and the refusal is the author wall, not tenancy.
  await expectCode(CLR04,
    () => humanQuery(world.users.alice,
      "select clara.archive_chat_session(p_session => $1, p_op_key => $2) as r", [mine, opk("wr-arch")]),
    "wr.13 non-author");
  let row = await rootQuery("select archived_at from clara.chat_sessions where id=$1", [mine]);
  assert.equal(row.rows[0].archived_at, null, "wr.13 the refusal left the row alone");

  const first = await humanQuery(world.users.bob,
    "select clara.archive_chat_session(p_session => $1, p_op_key => $2) as r", [mine, opk("wr-arch-ok")]);
  assert.ok(first.rows[0].r.archived_at, "wr.13 the author's archive stamps a time");
  assert.equal(first.rows[0].r.replay ?? false, false, "wr.13 the first call is not a replay");
  row = await rootQuery("select archived_at from clara.chat_sessions where id=$1", [mine]);
  assert.ok(row.rows[0].archived_at, "wr.13 the stamp is durable");

  // Idempotent under a NEW op_key: the door reports the standing state rather than moving it.
  const second = await humanQuery(world.users.bob,
    "select clara.archive_chat_session(p_session => $1, p_op_key => $2) as r", [mine, opk("wr-arch-2")]);
  assert.equal(second.rows[0].r.replay, true, "wr.13 a second archive replays");
  assert.equal(String(second.rows[0].r.archived_at), String(first.rows[0].r.archived_at),
    "wr.13 and it reports the ORIGINAL stamp, never a fresh one");

  // Cross-firm is CLR11 and is checked before the author wall.
  const theirs = await newSession(world.users.dave);
  await expectCode(CLR11,
    () => humanQuery(world.users.bob,
      "select clara.archive_chat_session(p_session => $1, p_op_key => $2) as r", [theirs, opk("wr-arch-x")]),
    "wr.13 cross-firm");
});

cell("wr.14 MUST-NOT-RED — widening the chat whitelist did not open un-archive, a title edit, or DELETE", async () => {
  const s = await newSession(world.users.bob);
  await humanQuery(world.users.bob,
    "select clara.archive_chat_session(p_session => $1, p_op_key => $2) as r", [s, opk("wr-arch-3")]);

  // Un-archive: the one-way rule the splice added.
  await expectCode(CLR08,
    () => rootQuery("update clara.chat_sessions set archived_at = null where id = $1", [s]),
    "wr.14 un-archive");
  // Re-stamping a different time is also a move, not a no-op.
  await expectCode(CLR08,
    () => rootQuery("update clara.chat_sessions set archived_at = now() + interval '1 day' where id = $1", [s]),
    "wr.14 re-stamp");
  // The PRE-EXISTING walls: any other column, and DELETE. These are the controls that prove the
  // widening admitted exactly one column and nothing else.
  await expectCode(CLR08,
    () => rootQuery("update clara.chat_sessions set title = 'moved' where id = $1", [s]),
    "wr.14 title");
  await expectCode(CLR08,
    () => rootQuery("delete from clara.chat_sessions where id = $1", [s]),
    "wr.14 delete");
  // And the ADMITTING twin for the column that was always allowed to move.
  const share = await humanQuery(world.users.bob,
    "select clara.share_chat_session(p_session => $1, p_op_key => $2) as r", [s, opk("wr-share")]);
  assert.equal(share.rows[0].r.visibility, "firm", "wr.14 private->firm still works after the widening");
});

cell("wr.15 archiving is audited", async () => {
  const s = await newSession(world.users.bob);
  await humanQuery(world.users.bob,
    "select clara.archive_chat_session(p_session => $1, p_op_key => $2) as r", [s, opk("wr-arch-4")]);
  const audit = await rootQuery(
    `select count(*)::int as n from clara.audit_log
      where fn='archive_chat_session' and args->>'session' = $1::text`, [s]);
  assert.equal(audit.rows[0].n, 1, "wr.15 exactly one audit row names the archived session");
});

// =====================================================================================
// wr.16..20 — clara.set_counterparty_identifiers (H-09)
// =====================================================================================

async function newVendor(sub, client, name) {
  const r = await runAs(human(sub),
    `select clara.create_counterparty(p_client => $1, p_kind => 'vendor', p_name => $2,
       p_op_key => $3) as r`, [client, name, opk("wr-cp")]);
  return r.rows[0].r.counterparty_id;
}

cell("wr.16 the identifiers door is floored at ADMIN and writes both columns", async () => {
  const cp = await newVendor(world.users.alice, world.clients.A1, `WR16 VENDOR ${Date.now()} SDN BHD`);
  // bob is firm A's BOOKKEEPER: below the floor, and refused by the floor rather than by tenancy.
  await expectCode(CLR04,
    () => runAs(human(world.users.bob),
      `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
         p_registration_no => '202501099016', p_tin => 'C16000000000', p_op_key => $3) as r`,
      [world.clients.A1, cp, opk("wr-sci-low")]),
    "wr.16 bookkeeper");

  const ok = await runAs(human(world.users.alice),
    `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
       p_registration_no => ' 2025-0109-9016 ', p_tin => ' C16000000000 ', p_op_key => $3) as r`,
    [world.clients.A1, cp, opk("wr-sci-ok")]);
  assert.equal(ok.rows[0].r.registration_no, "2025-0109-9016", "wr.16 the display value is trimmed, not stripped");
  assert.equal(ok.rows[0].r.registration_normalized, "202501099016",
    "wr.16 normalisation is byte-identical to create_counterparty's");
  const row = await rootQuery(
    "select registration_no, registration_normalized, tin from clara.counterparties where id=$1", [cp]);
  assert.equal(row.rows[0].registration_normalized, "202501099016", "wr.16 the normalized column landed");
  assert.equal(row.rows[0].tin, "C16000000000", "wr.16 the TIN landed trimmed");

  // THE POINT OF THE DOOR: the settle gate's M4 rung reads these two columns, and before this
  // migration a party born without them could never acquire them.
  assert.ok(row.rows[0].registration_normalized && row.rows[0].tin,
    "wr.16 both M4 inputs are now present on a party that was born without them");
});

cell("wr.17 op_key reuse with DIFFERENT arguments is refused, and the same arguments replay", async () => {
  const cp = await newVendor(world.users.alice, world.clients.A1, `WR17 VENDOR ${Date.now()} SDN BHD`);
  const key = opk("wr-sci-replay");
  const first = await runAs(human(world.users.alice),
    `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
       p_registration_no => '202501099017', p_tin => null, p_op_key => $3) as r`,
    [world.clients.A1, cp, key]);
  assert.equal(first.rows[0].r.registration_no, "202501099017");
  const replay = await runAs(human(world.users.alice),
    `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
       p_registration_no => '202501099017', p_tin => null, p_op_key => $3) as r`,
    [world.clients.A1, cp, key]);
  assert.equal(replay.rows[0].r.registration_no, "202501099017", "wr.17 the same args replay the receipt");
  // The TIN is part of the hash, so correcting it under the same key is an honest refusal rather
  // than a stale receipt for the row the caller was trying to fix.
  await expectCode(CLR10,
    () => runAs(human(world.users.alice),
      `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
         p_registration_no => '202501099017', p_tin => 'C17000000000', p_op_key => $3) as r`,
      [world.clients.A1, cp, key]),
    "wr.17 changed args");
});

cell("wr.18 clearing to NULL is admitted, and a duplicate registration is refused BY NAME", async () => {
  const cp = await newVendor(world.users.alice, world.clients.A1, `WR18A VENDOR ${Date.now()} SDN BHD`);
  const other = await newVendor(world.users.alice, world.clients.A1, `WR18B VENDOR ${Date.now()} SDN BHD`);
  await runAs(human(world.users.alice),
    `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
       p_registration_no => '202501099018', p_tin => 'C18000000000', p_op_key => $3) as r`,
    [world.clients.A1, cp, opk("wr-sci-18")]);

  // The partial unique refuses by a NAMED reason, never a raw 23505.
  const dup = await expectCode(CLR23,
    () => runAs(human(world.users.alice),
      `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
         p_registration_no => '2025-0109-9018', p_tin => null, p_op_key => $3) as r`,
      [world.clients.A1, other, opk("wr-sci-dup")]),
    "wr.18 duplicate registration");
  assert.match(String(dup.detail ?? dup.message), /registration_collision/,
    "wr.18 the refusal carries its own reason token");

  // CLEARING is the remedy for a mistyped identifier and must land.
  const cleared = await runAs(human(world.users.alice),
    `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
       p_registration_no => null, p_tin => null, p_op_key => $3) as r`,
    [world.clients.A1, cp, opk("wr-sci-clear")]);
  assert.equal(cleared.rows[0].r.registration_no, null, "wr.18 the registration cleared");
  const row = await rootQuery(
    "select registration_no, registration_normalized, tin from clara.counterparties where id=$1", [cp]);
  assert.deepEqual([row.rows[0].registration_no, row.rows[0].registration_normalized, row.rows[0].tin],
    [null, null, null], "wr.18 all three columns are NULL after a clear");
});

cell("wr.18b clearing into an occupied unregistered-name slot refuses BY NAME, never a raw 23505", async () => {
  // THE OTHER partial unique, which the door's own header names and which had no cell. Clearing a
  // registration moves the row OUT of uq_counterparties_client_registration and INTO
  // uq_counterparties_client_unregistered_name — so a same-name, same-kind party that already
  // holds that slot is a collision the door must name. A typo in the index name inside the door
  // would fall through to a bare 23505, which is exactly what this asserts against.
  const stamp = Date.now();
  const name = `WR18B VENDOR ${stamp} SDN BHD`;
  // The squatter: born WITHOUT a registration, so it occupies the unregistered-name slot.
  await newVendor(world.users.alice, world.clients.A1, name);
  // The subject: same name and kind, but born WITH a registration, so it lives in the other index
  // and the two coexist.
  const withReg = await runAs(human(world.users.alice),
    `select clara.create_counterparty(p_client => $1, p_kind => 'vendor', p_name => $2,
       p_registration_no => $3, p_op_key => $4) as r`,
    [world.clients.A1, name, `2025${stamp}`.slice(0, 12), opk("wr-cp18b")]);
  const subject = withReg.rows[0].r.counterparty_id;
  assert.notEqual(subject, null, "wr.18b the registered twin was born (the fixture, not the assertion)");

  const err = await expectCode(CLR23,
    () => runAs(human(world.users.alice),
      `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
         p_registration_no => null, p_tin => null, p_op_key => $3) as r`,
      [world.clients.A1, subject, opk("wr-sci-18b")]),
    "wr.18b clearing into an occupied unregistered-name slot");
  assert.match(String(err.detail ?? err.message), /unregistered_name_collision/,
    "wr.18b the refusal carries its own reason token, not a bare unique violation");
  const row = await rootQuery(
    "select registration_normalized from clara.counterparties where id=$1", [subject]);
  assert.ok(row.rows[0].registration_normalized,
    "wr.18b the refused clear left the registration in place");
});

cell("wr.19 the door refuses a foreign client, a retired party, and a registration with no alphanumerics", async () => {
  const cp = await newVendor(world.users.alice, world.clients.A1, `WR19 VENDOR ${Date.now()} SDN BHD`);
  await expectCode(CLR11,
    () => runAs(human(world.users.dave),
      `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
         p_registration_no => '202501099019', p_tin => null, p_op_key => $3) as r`,
      [world.clients.A1, cp, opk("wr-sci-x")]),
    "wr.19 foreign firm");
  const junk = await expectCode(CLR10,
    () => runAs(human(world.users.alice),
      `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
         p_registration_no => '---', p_tin => null, p_op_key => $3) as r`,
      [world.clients.A1, cp, opk("wr-sci-junk")]),
    "wr.19 unusable registration");
  assert.match(String(junk.detail ?? junk.message), /registration_unusable/,
    "wr.19 the unusable registration refuses by name rather than storing a NULL key");

  // Retire the party the only way the substrate allows: the 0011 trigger's MERGE branch, which
  // is the one arm that may move retired_at (and which this migration deliberately left frozen).
  const survivor = await newVendor(world.users.alice, world.clients.A1, `WR19S VENDOR ${Date.now()} SDN BHD`);
  await rootQuery(
    "update clara.counterparties set merged_into = $2, retired_at = now() where id = $1", [cp, survivor]);
  const retired = await expectCode(CLR23,
    () => runAs(human(world.users.alice),
      `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
         p_registration_no => '202501099019', p_tin => null, p_op_key => $3) as r`,
      [world.clients.A1, cp, opk("wr-sci-ret")]),
    "wr.19 retired party");
  assert.match(String(retired.detail ?? retired.message), /target_retired/, "wr.19 named reason");
});

cell("wr.20 THE WALL IS STILL THE WALL — the 0062 name-only guard refuses through the NEW door", async () => {
  const client = await createClient(world.users.alice, { name: `wr20_${Date.now()}`, opKey: opk("wr-cli20") });
  const r = await runAs(human(world.users.alice),
    `select clara.create_counterparty(p_client => $1, p_kind => 'customer',
       p_name => $2, p_op_key => $3) as r`,
    [client, `WR20 BUYER ${Date.now()} SDN BHD`, opk("wr-cp20")]);
  const cp = r.rows[0].r.counterparty_id;
  await runAs(human(world.users.alice),
    `select clara.record_client_fact(p_client => $1, p_fact_key => 'customer_identity_policy',
       p_fact_value => '"name_only"'::jsonb, p_basis => $2, p_basis_kind => 'owner_instruction',
       p_source_document_id => null, p_op_key => $3) as r`,
    [client, "wr.20 rig: arm the name-only policy", opk("wr-fact20")]);

  const err = await expectCode(CLR10,
    () => runAs(human(world.users.alice),
      `select clara.set_counterparty_identifiers(p_client => $1, p_counterparty => $2,
         p_registration_no => '202501099020', p_tin => null, p_op_key => $3) as r`,
      [client, cp, opk("wr-sci-nog")]),
    "wr.20 name-only guard");
  assert.match(String(err.detail ?? err.message), /customer_identity_name_only/,
    "wr.20 the refusal is the 0062 TRIGGER's own reason -- the door does not re-implement the policy, and does not bypass it");
  const row = await rootQuery("select registration_no from clara.counterparties where id=$1", [cp]);
  assert.equal(row.rows[0].registration_no, null, "wr.20 the row is unchanged");
});

// =====================================================================================
// wr.21..23 — build_frontier, the DR registry, and the statement resolver
// =====================================================================================

cell("wr.21 build_frontier is executable by clara_runtime and by NOBODY else, and its count is the truth", async () => {
  const acl = await rootQuery(
    `select array_agg(distinct g.grantee order by g.grantee) as who
       from (select (aclexplode(p.proacl)).grantee::regrole::text as grantee
               from pg_proc p where p.oid='clara.build_frontier()'::regprocedure) g
      where g.grantee <> 'clara_fn_owner'`);
  assert.deepEqual(acl.rows[0].who, ["clara_runtime"], "wr.21 EXECUTE is exactly {clara_runtime}");
  for (const role of ["clara_authenticated", "clara_agent_ro"]) {
    const can = await rootQuery(
      "select has_function_privilege($1,'clara.build_frontier()','execute') as ok", [role]);
    assert.equal(can.rows[0].ok, false, `wr.21 ${role} cannot execute it`);
  }
  // The frontier is a FACT, re-derived here from the ledger rather than trusted from the door.
  const viaDoor = await runAs(roleActor("clara_runtime"), "select clara.build_frontier() as r");
  const direct = await rootQuery(
    "select count(*)::int as n, max(version) as mx from clara.schema_migrations");
  assert.equal(Number(viaDoor.rows[0].r.count), direct.rows[0].n, "wr.21 the count matches the ledger");
  assert.equal(viaDoor.rows[0].r.max_version, direct.rows[0].mx, "wr.21 the max version matches the ledger");
  // And the table itself gained no reach.
  const grants = await rootQuery(
    `select count(*)::int as n from information_schema.role_table_grants
      where table_schema='clara' and table_name='schema_migrations'
        and grantee not in ('clara_fn_owner','postgres')`);
  assert.equal(grants.rows[0].n, 0, "wr.21 schema_migrations gained no application-role grant");
});

cell("wr.22 the DR canary registry is forced-RLS, unreachable by every application role, and EMPTY at birth", async () => {
  const rls = await rootQuery(
    `select c.relrowsecurity, c.relforcerowsecurity,
            (select count(*)::int from pg_policies p
              where p.schemaname='clara' and p.tablename='dr_canary_subjects') as policies
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='dr_canary_subjects'`);
  assert.equal(rls.rows[0].relrowsecurity, true, "wr.22 RLS is enabled");
  assert.equal(rls.rows[0].relforcerowsecurity, true, "wr.22 RLS is FORCED");
  assert.equal(rls.rows[0].policies, 1, "wr.22 exactly one policy (clara_fn_owner)");
  const grants = await rootQuery(
    `select count(*)::int as n from information_schema.role_table_grants
      where table_schema='clara' and table_name='dr_canary_subjects'
        and grantee not in ('clara_fn_owner','postgres')`);
  assert.equal(grants.rows[0].n, 0,
    "wr.22 no application role may write a subject -- the drill's subject is not forgeable by a tenant");
  const rows = await rootQuery("select count(*)::int as n from clara.dr_canary_subjects");
  assert.equal(rows.rows[0].n, 0,
    "wr.22 EMPTY at birth: 裁-160 killed both former subjects and 裁-172 names the replacement post-reset -- a seeded prefix would re-create the very defect H-49 reports");
  // The append-only guard is real, not decorative: a planted subject cannot be re-pointed.
  await rootQuery(
    `insert into clara.dr_canary_subjects(relation, subject_id, note)
     values ('agent_tasks', gen_random_uuid(), 'wr.22 rig subject')`);
  await expectCode(CLR08,
    () => rootQuery("update clara.dr_canary_subjects set note = 'moved' where note = 'wr.22 rig subject'"),
    "wr.22 update");
  await rootQuery("delete from clara.dr_canary_subjects where note = 'wr.22 rig subject'");
});

stmtCell("wr.23 _stmt_institution_code resolves at every tier, refuses ambiguity and the unknown, and is clara_runtime-only", async () => {
  const acl = await rootQuery(
    `select array_agg(distinct g.grantee order by g.grantee) as who
       from (select (aclexplode(p.proacl)).grantee::regrole::text as grantee
               from pg_proc p where p.oid='clara._stmt_institution_code(text)'::regprocedure) g
      where g.grantee <> 'clara_fn_owner'`);
  assert.deepEqual(acl.rows[0].who, ["clara_runtime"], "wr.23 EXECUTE is exactly {clara_runtime}");
  const can = await rootQuery(
    "select has_function_privilege('clara_authenticated','clara._stmt_institution_code(text)','execute') as ok");
  assert.equal(can.rows[0].ok, false, "wr.23 a human role cannot execute it");

  const resolve = async (printed) => {
    const r = await runAs(roleActor("clara_runtime"),
      "select clara._stmt_institution_code($1) as code", [printed]);
    return r.rows[0].code;
  };
  assert.equal(await resolve("MBB"), "MBB", "wr.23 tier 1 — the code itself");
  assert.equal(await resolve("mbb"), "MBB", "wr.23 tier 1 is case- and punctuation-insensitive");
  assert.equal(await resolve("Public Bank Berhad"), "PBB", "wr.23 tier 2 — the full name");
  assert.equal(await resolve("Maybank"), "MBB", "wr.23 tier 3 — contained in the registered name");

  // PARITY WITH THE MIRROR THIS DOOR RETIRES (`statementFacts.v3.header.mjs:149,156-160`), which
  // drops the corporate-form noise tokens and splits parentheticals. A first cut of the door
  // compared bare alphanumerics and would have raised institution_unknown on all four of these —
  // one `Berhad` and one `Bhd` per direction, plus the two whose match only exists once a
  // parenthetical is split off the seeded name.
  assert.equal(await resolve("Maybank Berhad"), "MBB", "wr.23 a Berhad suffix on a parenthetical variant");
  assert.equal(await resolve("Public Bank Bhd"), "PBB", "wr.23 a Bhd suffix where the roster says Berhad");
  assert.equal(await resolve("CIMB Bank Bhd"), "CIMB", "wr.23 a Bhd suffix on a plain name");
  assert.equal(await resolve("United Overseas Bank Berhad"), "UOB",
    "wr.23 the roster's own name is 'United Overseas Bank (Malaysia) Bhd' — the parenthetical and both noise tokens must drop");

  for (const [printed, reason] of [["Bank", "institution_ambiguous"], ["Banco Fittizio", "institution_unknown"], ["", "institution_unknown"]]) {
    const err = await expectCode(CLR10, () => resolve(printed), `wr.23 refusal for "${printed}"`);
    assert.match(String(err.detail ?? err.message), new RegExp(reason),
      `wr.23 "${printed}" refuses with ${reason} rather than guessing a bank`);
  }
});
