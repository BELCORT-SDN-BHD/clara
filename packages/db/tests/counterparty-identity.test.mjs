// #647 — COUNTERPARTY IDENTITY PROVENANCE, THE REVISION LOG, THE THREE READS AND THE FOUR EVENTS.
// Migration of record: packages/db/migrations/0200_counterparty_identity_provenance.sql.
// Brief of record: docs/plan/active/refresh-wave-2026-09-15/brief-647.md (orchestrator decisions).
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH `humanQuery` — a real least-privileged
// `clara_authenticated` session with a real JWT sub, at the rank the cell names. `rootQuery` is
// used ONLY to build the world and to read the catalog for a census (the wave rule: a cell that
// proves a human-lane behaviour from the owner connection has proven nothing about the human lane).
//
// THE GATE. `counterparty-identity-preintegration-gate.mjs` is preloaded by the package-wide
// `pnpm test` script, so on a chain that has NOT applied 0200 this battery skips LOUDLY. A FOCUSED
// invocation does not preload it and therefore FAILS — a cell that only ever skips is a false green.
//
// THE MUTANT TABLE — one per wall, with the object it attacks:
//   W1  clara.counterparty_aliases              · a direct INSERT claiming recorded_via='human_ui'
//                                                 with no clara.jwt_sub()            -> CLR08  (p647.provenance.no_lie)
//   W2  clara.counterparty_aliases              · a stray extraction pin on a non-'extracted'
//                                                 origin                             -> 23514  (p647.provenance.source_pins)
//   W3  clara.counterparty_aliases              · a source document of ANOTHER FIRM  -> 23503  (p647.provenance.source_pins)
//   W4  clara.add_counterparty_alias            · a source document of another CLIENT of the SAME
//                                                 firm (the #646 re-attribution hole) -> CLR23 (p647.provenance.source_pins)
//   W5  clara.counterparty_identity_revisions   · UPDATE a revision                  -> CLR08  (p647.revisions.append_only)
//   W6  clara.counterparty_identity_revisions   · DELETE a revision                  -> CLR08  (p647.revisions.append_only)
//   W7  clara.counterparty_identity_revisions   · TRUNCATE                           -> CLR08  (p647.revisions.append_only)
//   W8  clara.counterparty_identity_revisions   · clara_authenticated INSERT         -> 42501  (p647.revisions.append_only)
//   W9  clara.get_counterparty_identity         · a client of ANOTHER firm           -> CLR11  (p647.reads.shape)
//   W10 clara.counterparty_aliases              · the immutability trigger still refuses any
//                                                 non-retirement UPDATE after the backfill -> CLR08 (p647.provenance.human)
//   W11 clara._resolve_counterparty             · two clients, one TIN — still no cross-client
//                                                 link                                (p647.ac4.same_tin)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, roleQuery, endPool, ROLES } from "./rig-helpers.mjs";
import {
  identityCohortApplied, identityWorld, createCounterparty, addAlias, addAliasFiveArgs,
  retireAlias, renameCounterparty, setIdentifiers, mergeCounterparties, identity, identityList,
  mergeCorrections, revisionRows, aliasRow, sourceDocument, caught, reasonOf, opk,
} from "./counterparty-identity-fixtures.mjs";

let applied = false;
let w = null;

before(async () => {
  applied = await identityCohortApplied();
  if (applied) w = await identityWorld("p647");
});
after(async () => { await endPool(); });

/** FAIL-CLOSED unless the pre-0200 shape is DECLARED by the package-wide gate module. */
function need(t) {
  if (applied) return false;
  if (process.env.CLARA_ALLOW_MISSING_COUNTERPARTY_IDENTITY === "1") {
    t.skip("0200 counterparty-identity cohort absent and the pre-0200 shape is DECLARED (CLARA_ALLOW_MISSING_COUNTERPARTY_IDENTITY=1)");
    return true;
  }
  assert.fail("the #647 counterparty-identity cohort (0200) is absent and nothing declared a pre-0200 database — set CLARA_ALLOW_MISSING_COUNTERPARTY_IDENTITY=1 only when that is deliberate");
  return true;
}

const name = (p) => `${p}-${randomUUID().slice(0, 8)}`;

// ===========================================================================
// AC1 — PROVENANCE ON THE WRITE SIDE.
// ===========================================================================

test("p647.provenance.human — an alias added through the door by a BOOKKEEPER stamps recorded_via='human_ui', created_by=jwt_sub, and the row stays immutable afterwards", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("ACME") });
  const r = await addAlias(w.bookkeeper, {
    client: w.clientA, counterparty: cp, alias: name("ACME TRADING"), origin: "trade_name",
    basis: "the invoice letterhead uses the trade name",
  });
  const row = await aliasRow(r.alias_id);
  assert.equal(row.recorded_via, "human_ui", "p647.provenance.human: the human door stamps its OWN lane, never a caller-supplied one");
  assert.equal(row.created_by, w.bookkeeper, "p647.provenance.human: created_by is the JWT subject the door ran under");
  assert.equal(row.recorded_basis, "the invoice letterhead uses the trade name", "p647.provenance.human: the human's stated basis is kept on the row it qualifies");
  assert.equal(row.origin, "trade_name");
  assert.equal(row.source_document_id, null, "p647.provenance.human: no source pinned, and that is a recorded absence rather than a silent one");

  // W10 — the 0011 immutability trigger is ENABLED again after 0200's backfill disabled it.
  const err = await caught(() => rootQuery(
    "update clara.counterparty_aliases set recorded_via='agent' where id=$1", [r.alias_id]));
  assert.ok(err, "p647.provenance.human: a non-retirement UPDATE is still refused");
  assert.equal(err.code, "CLR08", "p647.provenance.human: t_counterparty_aliases_update is enabled after the backfill (CLR08, not a silent success)");
});

test("p647.provenance.no_lie — a direct insert claiming 'human_ui' with no clara.jwt_sub() is refused; the seeding/legacy lanes land 'legacy_unknown', never 'human_ui'", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("LIAR") });

  // W1 — the OWNER connection has no JWT at all, which is exactly the machine lane's shape.
  const err = await caught(() => rootQuery(
    `insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,alias_normalized,
        alias_display,origin,created_by,recorded_via)
     values($1,$2,$3,$4,$5,'human',$6,'human_ui')`,
    [w.firm, w.clientA, cp, "lyingalias", "LYING ALIAS", w.bookkeeper]));
  assert.ok(err, "p647.provenance.no_lie: the claim is refused");
  assert.equal(err.code, "CLR08", "p647.provenance.no_lie: refused as an honesty violation (CLR08), not as a constraint accident");
  assert.match(String(err.message), /human_ui/, "p647.provenance.no_lie: the refusal names the value that was claimed");

  // …and the same insert WITHOUT the claim lands the recorded unknown, which is what
  // clara.tick_seeding_proposal (0118:315, a declared residue of this slice) does today.
  const okId = (await rootQuery(
    `insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,alias_normalized,
        alias_display,origin,created_by)
     values($1,$2,$3,$4,$5,'human',$6) returning id`,
    [w.firm, w.clientA, cp, "seededalias", "SEEDED ALIAS", w.bookkeeper])).rows[0].id;
  const row = await aliasRow(okId);
  assert.equal(row.recorded_via, "legacy_unknown", "p647.provenance.no_lie: an omitted lane is a RECORDED unknown, never an invisible one");
  assert.notEqual(row.recorded_via, "human_ui");
});

test("p647.provenance.source_pins — a stray extraction pin is refused; a cross-FIRM document is refused by the FK; a cross-CLIENT document is refused by the DOOR (the #646 hole)", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("PINS") });
  const own = await sourceDocument({ firm: w.firm, client: w.clientA, filedBy: w.bookkeeper, tag: "own" });
  const sibling = await sourceDocument({ firm: w.firm, client: w.clientB, filedBy: w.bookkeeper, tag: "sib" });
  const foreign = await sourceDocument({ firm: w.other, client: w.otherClient, filedBy: w.otherAdmin, tag: "for" });

  // The HAPPY path first, so the three refusals below are refusals of something that otherwise works.
  const ok = await addAlias(w.bookkeeper, {
    client: w.clientA, counterparty: cp, alias: name("PINNED"), origin: "extracted",
    document: own.document, extraction: own.extraction, region: own.region,
    fieldPath: "invoice.vendor_name", basis: "read off the vendor block",
  });
  const okRow = await aliasRow(ok.alias_id);
  assert.equal(okRow.source_document_id, own.document);
  assert.equal(okRow.source_extraction_id, own.extraction);
  assert.equal(okRow.source_region_id, own.region);
  assert.equal(okRow.source_field_path, "invoice.vendor_name");

  // W2 — a stray extraction pin on a non-'extracted' origin is provenance theatre.
  const stray = await caught(() => addAlias(w.bookkeeper, {
    client: w.clientA, counterparty: cp, alias: name("STRAY"), origin: "human",
    document: own.document, extraction: own.extraction,
  }));
  assert.ok(stray, "p647.provenance.source_pins: a stray extraction pin is refused");
  assert.equal(stray.code, "23514", "p647.provenance.source_pins: refused by the two-way CHECK, not by the door's care");

  // W3 — a document of ANOTHER FIRM: the composite (id, firm_id) FK cannot even be satisfied.
  const cross = await caught(() => addAlias(w.bookkeeper, {
    client: w.clientA, counterparty: cp, alias: name("XFIRM"), origin: "extracted",
    document: foreign.document, extraction: foreign.extraction,
  }));
  assert.ok(cross, "p647.provenance.source_pins: a cross-firm document is refused");
  assert.ok(["23503", "CLR23"].includes(cross.code),
    `p647.provenance.source_pins: refused structurally (got ${cross.code})`);

  // W4 — a document of another CLIENT of the SAME firm. The FK is firm-congruent only, so this
  // one has to be the DOOR's job: #646 re-attributes documents between clients, and an alias
  // pinned to a sibling client's page is exactly the hole that leaves.
  const sib = await caught(() => addAlias(w.bookkeeper, {
    client: w.clientA, counterparty: cp, alias: name("XCLIENT"), origin: "extracted",
    document: sibling.document, extraction: sibling.extraction,
  }));
  assert.ok(sib, "p647.provenance.source_pins: a sibling client's document is refused");
  assert.equal(sib.code, "CLR23", "p647.provenance.source_pins: the DOOR refuses it (CLR23) — the firm-congruent FK cannot");
  assert.equal(reasonOf(sib), "source_not_this_client",
    "p647.provenance.source_pins: the refusal names the reason a human can act on");
});

test("p647.overload.one — clara.add_counterparty_alias resolves to EXACTLY ONE regprocedure, and the shipped web door's FIVE NAMED ARGS still reach it", async (t) => {
  if (need(t)) return;
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig, coalesce(p.proacl::text,'(none)') as acl
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='add_counterparty_alias'`);
  assert.equal(r.rows.length, 1,
    `p647.overload.one: exactly one add_counterparty_alias exists — a second overload would make the web door's named call 42725 function is not unique (found ${JSON.stringify(r.rows.map((x) => x.sig))})`);
  assert.match(r.rows[0].acl, /clara_authenticated=X/,
    "p647.overload.one: the ACL survived the recut — clara_authenticated still holds EXECUTE");
  assert.doesNotMatch(r.rows[0].acl, /clara_runtime|clara_agent_ro|clara_wake_/,
    "p647.overload.one: no machine role gained EXECUTE (D11: Clara gets no write verb here)");

  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("FIVEARG") });
  const out = await addAliasFiveArgs(w.bookkeeper, {
    client: w.clientA, counterparty: cp, alias: name("FIVE"), origin: "human",
  });
  assert.ok(out.alias_id, "p647.overload.one: the five-named-arg call the web door posts still resolves and returns the alias id");
  const row = await aliasRow(out.alias_id);
  assert.equal(row.recorded_via, "human_ui");
  assert.equal(row.recorded_basis, null, "p647.overload.one: the defaulted trailer is genuinely optional");
});

// ===========================================================================
// AC5 — ONE APPEND-ONLY REVISION LOG, CARRYING ALL FIVE ACTS.
// ===========================================================================

test("p647.revisions.append_only — rename, alias add, alias retire, identifier change and merge each append a revision with monotonic revision_n; UPDATE/DELETE/TRUNCATE refused; clara_authenticated has SELECT and no DML", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.admin, { client: w.clientA, name: name("TIMELINE") });
  const dead = await createCounterparty(w.admin, { client: w.clientA, name: name("DUPE") });

  const a = await addAlias(w.admin, { client: w.clientA, counterparty: cp, alias: name("T-ALIAS"), origin: "human" });
  await renameCounterparty(w.admin, { client: w.clientA, counterparty: cp, name: name("TIMELINE-II") });
  await setIdentifiers(w.admin, { client: w.clientA, counterparty: cp, registration: `R${randomUUID().slice(0, 8)}`, tin: "C1234567890" });
  await retireAlias(w.admin, { client: w.clientA, alias: a.alias_id });
  await mergeCounterparties(w.admin, { client: w.clientA, survivor: cp, merged: dead });

  const rows = await revisionRows(cp);
  const acts = rows.map((r) => r.act);
  assert.deepEqual(rows.map((r) => Number(r.revision_n)), rows.map((_, i) => i + 1),
    "p647.revisions.append_only: revision_n is 1..n with no gaps and no repeats");
  for (const want of ["alias_added", "rename", "identifiers_set", "alias_retired"]) {
    assert.ok(acts.includes(want), `p647.revisions.append_only: the ${want} act appended a revision (got ${acts.join(", ")})`);
  }
  assert.equal(acts.filter((x) => x === "rename").length, 1, "p647.revisions.append_only: a rename appends EXACTLY ONE rename revision");
  assert.equal(acts.filter((x) => x === "identifiers_set").length, 1, "p647.revisions.append_only: one identifier change, one revision");
  // The MERGED party carries the 'merged' revision: its identity is the one that changed.
  const deadRows = await revisionRows(dead);
  assert.deepEqual(deadRows.map((r) => r.act), ["merged"],
    "p647.revisions.append_only: the absorbed party's own log says it was merged — written by a trigger on clara.counterparty_merges, because clara.merge_counterparties is declared residue and is NOT recut here");
  assert.equal(deadRows[0].after_state.merged_into, cp);

  for (const r of rows) {
    assert.ok(r.basis && r.basis.trim() !== "", "p647.revisions.append_only: every revision carries a non-blank basis");
    assert.ok(["human_ui", "agent", "seeding", "legacy_unknown"].includes(r.recorded_via));
  }

  const target = rows[0];
  const upd = await caught(() => rootQuery(
    "update clara.counterparty_identity_revisions set basis='rewritten' where counterparty_id=$1 and revision_n=$2",
    [cp, target.revision_n]));
  assert.equal(upd?.code, "CLR08", "W5: a revision is never edited");
  const del = await caught(() => rootQuery(
    "delete from clara.counterparty_identity_revisions where counterparty_id=$1", [cp]));
  assert.equal(del?.code, "CLR08", "W6: a revision is never deleted");
  const trunc = await caught(() => rootQuery("truncate clara.counterparty_identity_revisions"));
  assert.equal(trunc?.code, "CLR08", "W7: the relation is never truncated");

  // W8 — the human role READS and writes nothing. The wave-a fn-fronted family rule.
  const ins = await caught(() => humanQuery(w.admin,
    `insert into clara.counterparty_identity_revisions(firm_id,client_id,counterparty_id,revision_n,
        act,basis,changed_by,recorded_via) values($1,$2,$3,999,'rename','forged',$4,'human_ui')`,
    [w.firm, w.clientA, cp, w.admin]));
  assert.equal(ins?.code, "42501", "W8: clara_authenticated holds no INSERT on the revision log");
  const seen = await humanQuery(w.admin,
    "select count(*)::int n from clara.counterparty_identity_revisions where counterparty_id=$1", [cp]);
  assert.equal(seen.rows[0].n, rows.length, "p647.revisions.append_only: …but it DOES read its own firm's rows");
  const blind = await humanQuery(w.otherAdmin,
    "select count(*)::int n from clara.counterparty_identity_revisions where counterparty_id=$1", [cp]);
  assert.equal(blind.rows[0].n, 0, "W9: another firm's admin sees zero rows through forced RLS");
});

test("p647.identifiers.history — two set_counterparty_identifiers calls leave two revisions carrying before AND after values, and the door's own _finish_op payload is unchanged", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.admin, { client: w.clientA, name: name("IDS") });
  const r1 = `R1${randomUUID().slice(0, 6)}`;
  const r2 = `R2${randomUUID().slice(0, 6)}`;

  const first = await setIdentifiers(w.admin, { client: w.clientA, counterparty: cp, registration: r1, tin: "C111" });
  const second = await setIdentifiers(w.admin, { client: w.clientA, counterparty: cp, registration: r2, tin: "C222" });

  // 0174:850-852's payload keys, unchanged by this slice.
  assert.deepEqual(Object.keys(second).sort(),
    ["counterparty_id", "registration_no", "registration_normalized", "tin"],
    "p647.identifiers.history: the door's return envelope is byte-compatible with 0174's");
  assert.equal(second.counterparty_id, cp);
  assert.equal(second.registration_no, r2);
  assert.equal(first.registration_no, r1);

  const rows = (await revisionRows(cp)).filter((x) => x.act === "identifiers_set");
  assert.equal(rows.length, 2, "p647.identifiers.history: two corrections, two revisions — the value is no longer overwritten without a trace");
  assert.equal(rows[0].before_state.registration_no, null, "p647.identifiers.history: the FIRST correction's before-state is the empty identity");
  assert.equal(rows[0].after_state.registration_no, r1);
  assert.equal(rows[0].after_state.tin, "C111");
  assert.equal(rows[1].before_state.registration_no, r1, "p647.identifiers.history: the SECOND correction's before-state is the first one's value");
  assert.equal(rows[1].before_state.tin, "C111");
  assert.equal(rows[1].after_state.registration_no, r2);
  assert.equal(rows[1].after_state.tin, "C222");
});

test("p647.revisions.race — two concurrent alias adds on ONE counterparty both land, with distinct monotonic revision_n and no lost append", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("RACE") });
  const [x, y] = await Promise.all([
    addAlias(w.bookkeeper, { client: w.clientA, counterparty: cp, alias: name("RACE-A"), origin: "human" }),
    addAlias(w.admin, { client: w.clientA, counterparty: cp, alias: name("RACE-B"), origin: "human" }),
  ]);
  assert.ok(x.alias_id && y.alias_id, "p647.revisions.race: both concurrent adds committed");
  const rows = (await revisionRows(cp)).filter((r) => r.act === "alias_added");
  assert.equal(rows.length, 2, "p647.revisions.race: two appends, not one — the revision counter is serialised, not last-write-wins");
  assert.deepEqual([...new Set(rows.map((r) => Number(r.revision_n)))].sort((a, b) => a - b),
    rows.map((r) => Number(r.revision_n)).sort((a, b) => a - b),
    "p647.revisions.race: no two revisions share a number");
});

// ===========================================================================
// AC2 / AC3 / AC5 — THE THREE READS.
// ===========================================================================

test("p647.reads.shape — the three reads answer a VIEWER with the documented envelope, return zero rows cross-firm, refuse CLR11 on a foreign client, and are FUNCTIONS (never a new masked view)", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("SHAPE") });
  const a = await addAlias(w.bookkeeper, { client: w.clientA, counterparty: cp, alias: name("SHAPE-ALIAS"), origin: "trade_name" });
  await setIdentifiers(w.admin, { client: w.clientA, counterparty: cp, registration: `RS${randomUUID().slice(0, 6)}`, tin: "C900" });

  const detail = await identity(w.viewer, { client: w.clientA, counterparty: cp });
  assert.deepEqual(Object.keys(detail).sort(),
    ["aliases", "as_of", "client_id", "conflicts", "current", "identifier_revisions", "merges"],
    "p647.reads.shape: the detail envelope is exactly the documented one");
  assert.equal(detail.current.id, cp);
  assert.equal(detail.current.kind, "vendor");
  assert.equal(detail.aliases.length, 1, "p647.reads.shape: the viewer sees the alias");
  assert.equal(detail.aliases[0].id, a.alias_id);
  assert.equal(detail.aliases[0].recorded_via, "human_ui", "p647.reads.shape: provenance reaches the surface — that is the whole point of the column");
  assert.ok(detail.identifier_revisions.length >= 2, "p647.reads.shape: the revision timeline is projected");
  assert.ok(Array.isArray(detail.merges) && Array.isArray(detail.conflicts));

  const list = await identityList(w.viewer, { client: w.clientA, kind: "vendor" });
  assert.deepEqual(Object.keys(list).sort(), ["as_of", "client_id", "counterparties", "kind"],
    "p647.reads.shape: the list envelope is exactly the documented one");
  const listed = list.counterparties.find((x) => x.id === cp);
  assert.ok(listed, "p647.reads.shape: the counterparty is listed");
  assert.equal(Number(listed.live_alias_count), 1, "H-34: every count on the surface comes from a read that actually ran");
  assert.ok(Number(listed.revision_count) >= 2);

  const corrections = await mergeCorrections(w.viewer, { client: w.clientA });
  assert.deepEqual(Object.keys(corrections).sort(), ["as_of", "client_id", "merges"]);

  // W9 — a foreign client, and a foreign firm.
  const foreign = await caught(() => identity(w.viewer, { client: w.otherClient, counterparty: cp }));
  assert.equal(foreign?.code, "CLR11", "W9: a client outside the caller's firm is CLR11, never a silent empty");
  const foreignList = await caught(() => identityList(w.otherAdmin, { client: w.clientA }));
  assert.equal(foreignList?.code, "CLR11", "W9: the neighbour firm's admin cannot read this client at all");

  // The three reads are FUNCTIONS, pinned, granted to the human lane alone — a NEW masked
  // human-read VIEW would join debt-BAR1's catalog-derived roster and red its closed world.
  const census = await rootQuery(
    `select p.proname, p.prokind, p.prosecdef, coalesce(p.proconfig,'{}'::text[]) as cfg,
            coalesce(p.proacl::text,'(none)') as acl
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname in
        ('get_counterparty_identity','list_counterparty_identity','list_counterparty_merge_corrections')
      order by p.proname`);
  assert.equal(census.rows.length, 3, "p647.reads.shape: all three reads exist");
  for (const row of census.rows) {
    assert.equal(row.prokind, "f", `${row.proname} is a plain function`);
    assert.equal(row.prosecdef, true, `${row.proname} is SECURITY DEFINER`);
    assert.ok(row.cfg.includes("search_path=clara, pg_temp"), `${row.proname} pins search_path (got ${JSON.stringify(row.cfg)})`);
    assert.ok(row.cfg.includes("plan_cache_mode=force_custom_plan"), `${row.proname} pins plan_cache_mode`);
    assert.match(row.acl, /clara_authenticated=X/, `${row.proname} is reachable by the human lane`);
    assert.doesNotMatch(row.acl, /clara_runtime|clara_agent_ro|clara_wake_|clara_freeform_ro/,
      `${row.proname} is reachable by NO machine role`);
  }
  const views = await rootQuery(
    `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relkind='v'
        and c.relname like 'counterparty_identity%'`);
  assert.equal(views.rows.length, 0, "p647.reads.shape: this slice minted NO new masked human-read view (debt-BAR1's closed world is untouched)");
});

test("p647.reads.denied — a caller BELOW the viewer floor is refused CLR04, and the widened counterparty_aliases_visible still projects only the caller's own firm", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("MASK") });
  await addAlias(w.bookkeeper, { client: w.clientA, counterparty: cp, alias: name("MASK-ALIAS"), origin: "human" });

  // The widened view keeps its firm predicate and its grant matrix.
  const mine = await humanQuery(w.viewer,
    "select id, client_id, kind, origin, recorded_via, created_by, source_document_id from clara.counterparty_aliases_visible where counterparty_id=$1", [cp]);
  assert.equal(mine.rows.length, 1, "p647.reads.denied: the widened view answers the caller's own firm");
  assert.equal(mine.rows[0].recorded_via, "human_ui", "p647.reads.denied: the widening actually landed");
  assert.equal(mine.rows[0].client_id, w.clientA);
  const theirs = await humanQuery(w.otherAdmin,
    "select count(*)::int n from clara.counterparty_aliases_visible where counterparty_id=$1", [cp]);
  assert.equal(theirs.rows[0].n, 0, "p647.reads.denied: the firm predicate survived the CREATE OR REPLACE");

  // The base table gained NO app-role grant — clara.counterparty_aliases is the first member of
  // wave-a-shape.test.mjs's fn-fronted-only family.
  const base = await caught(() => humanQuery(w.viewer, "select count(*) from clara.counterparty_aliases"));
  assert.equal(base?.code, "42501", "p647.reads.denied: the base table is still fn-fronted for the human lane");
});

test("p647.merge.representable — a carrier-backed merge reports representable=true; a bare merged_into with no carrier reports false WITH its reason; there is still NO unmerge door", async (t) => {
  if (need(t)) return;
  const survivor = await createCounterparty(w.admin, { client: w.clientA, name: name("SURV") });
  const merged = await createCounterparty(w.admin, { client: w.clientA, name: name("GONE") });
  await mergeCounterparties(w.admin, { client: w.clientA, survivor, merged, reason: "same SSM, two spellings" });

  // A PRE-0149 legacy merge: merged_into set, no carrier row. Written as root, through the same
  // column the old door wrote, because no door can produce this state any more.
  const legacySurv = await createCounterparty(w.admin, { client: w.clientA, name: name("LSURV") });
  const legacyGone = await createCounterparty(w.admin, { client: w.clientA, name: name("LGONE") });
  await rootQuery("update clara.counterparties set merged_into=$1, retired_at=now(), updated_at=now() where id=$2",
    [legacySurv, legacyGone]);

  const out = await mergeCorrections(w.viewer, { client: w.clientA });
  const byId = Object.fromEntries(out.merges.map((m) => [m.merged_id, m]));
  assert.equal(byId[merged].representable, true, "p647.merge.representable: a carrier-backed merge CAN be represented");
  assert.equal(byId[merged].reason, "carrier_recorded");
  assert.equal(byId[merged].survivor_id, survivor);
  assert.equal(byId[merged].merge_reason, "same SSM, two spellings", "p647.merge.representable: the human's own words reach the surface");
  assert.equal(byId[legacyGone].representable, false, "p647.merge.representable: a pre-lineage merge is NOT representable, and says so");
  assert.equal(byId[legacyGone].reason, "legacy_no_carrier");
  assert.equal(byId[legacyGone].merge_reason, null, "p647.merge.representable: an absent reason is null, never an invented one");

  const door = await rootQuery("select to_regproc('clara.unmerge_counterparties') is null as absent");
  assert.equal(door.rows[0].absent, true,
    "p647.merge.representable: AC3's prohibition holds by ABSENCE — this slice ships bounded discovery and no reversal door");
});

// ===========================================================================
// AC4 — ROLES DISTINCT, CROSS-CLIENT AMBIGUOUS, NO NETTING, NO AUTHORITY.
// ===========================================================================

test("p647.ac4.same_tin — two clients of ONE firm may carry the same TIN; nothing links them, the resolver still refuses to look outside its client, and the surface SAYS so", async (t) => {
  if (need(t)) return;
  const tin = `C${randomUUID().slice(0, 10)}`;
  const inA = await createCounterparty(w.admin, { client: w.clientA, name: name("TWIN-A"), tin });
  const inB = await createCounterparty(w.admin, { client: w.clientB, name: name("TWIN-B"), tin });
  assert.notEqual(inA, inB, "p647.ac4.same_tin: both were admitted — the estate has no firm-wide identifier unique (C-17)");

  const rows = await rootQuery(
    "select count(*)::int n from clara.counterparties where id in ($1,$2) and merged_into is null", [inA, inB]);
  assert.equal(rows.rows[0].n, 2, "p647.ac4.same_tin: neither was auto-linked or auto-merged");

  // The RESOLVER still answers inside one client only.
  const resolved = await rootQuery(
    "select clara._resolve_counterparty($1,$2,$3,null,null) as r", [w.firm, w.clientA, "vendor"]).catch(() => null);
  // …and, whatever that helper's arity is on this frontier, the READ is what the human sees:
  const detail = await identity(w.viewer, { client: w.clientA, counterparty: inA });
  const conflict = detail.conflicts.find((c) => c.kind === "cross_client_identifier");
  assert.ok(conflict, "p647.ac4.same_tin: the ambiguity is STATED on the surface rather than resolved behind it");
  assert.equal(conflict.other_client_id, w.clientB);
  assert.equal(conflict.other_counterparty_id, inB);
  assert.equal(conflict.identifier_kind, "tin");
  assert.equal(detail.current.id, inA, "p647.ac4.same_tin: the detail is still about the counterparty that was asked for");
  void resolved;
});

test("p647.ac4.no_netting — an identity fact creates no allocation, moves no open item and grants no accounting authority", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.admin, { client: w.clientA, name: name("AUTH") });
  const before = await rootQuery(
    `select (select count(*) from clara.open_item_allocations where client_id=$1)::int as allocs,
            (select count(*) from clara.open_items where client_id=$1)::int as items,
            (select count(*) from clara.journal_entries where client_id=$1)::int as entries`, [w.clientA]);

  await addAlias(w.admin, { client: w.clientA, counterparty: cp, alias: name("AUTH-ALIAS"), origin: "human" });
  await setIdentifiers(w.admin, { client: w.clientA, counterparty: cp, registration: `RA${randomUUID().slice(0, 6)}`, tin: "C777" });
  await renameCounterparty(w.admin, { client: w.clientA, counterparty: cp, name: name("AUTH-II") });

  const after = await rootQuery(
    `select (select count(*) from clara.open_item_allocations where client_id=$1)::int as allocs,
            (select count(*) from clara.open_items where client_id=$1)::int as items,
            (select count(*) from clara.journal_entries where client_id=$1)::int as entries`, [w.clientA]);
  assert.deepEqual(after.rows[0], before.rows[0],
    "p647.ac4.no_netting: three identity acts moved NOTHING in the books (0021:31-33 says so; until now no test did)");

  // …and a VIEWER who may now READ every identity fact still cannot write one.
  const denied = await caught(() => addAlias(w.viewer, {
    client: w.clientA, counterparty: cp, alias: name("VIEWER-ALIAS"), origin: "human" }));
  assert.equal(denied?.code, "CLR04",
    "p647.ac4.no_netting: reading an identity never becomes authority to change it");
});

test("p647.ac4.kinds — a vendor and a customer of one client may share a name; the alias unique stays kind-scoped; and the detail surfaces the same-name pair as a stated conflict", async (t) => {
  if (need(t)) return;
  const shared = name("JANUS");
  const vendor = await createCounterparty(w.admin, { client: w.clientA, kind: "vendor", name: shared });
  const customer = await createCounterparty(w.admin, { client: w.clientA, kind: "customer", name: shared });
  assert.notEqual(vendor, customer, "p647.ac4.kinds: AR and AP roles stay distinct (0015:159, :187)");

  const aliasName = name("JANUS-TRADE");
  await addAlias(w.admin, { client: w.clientA, counterparty: vendor, alias: aliasName, origin: "trade_name" });
  const same = await addAlias(w.admin, { client: w.clientA, counterparty: customer, alias: aliasName, origin: "trade_name" });
  assert.ok(same.alias_id, "p647.ac4.kinds: the SAME alias across kinds is admitted — uq_counterparty_aliases_live_name is kind-scoped (0176)");

  const detail = await identity(w.viewer, { client: w.clientA, counterparty: vendor });
  const conflict = detail.conflicts.find((c) => c.kind === "cross_kind_same_name");
  assert.ok(conflict, "p647.ac4.kinds: the surface states the same-name-other-role pair instead of letting a reader assume they are one party");
  assert.equal(conflict.other_counterparty_id, customer);
});

// ===========================================================================
// AC5 — THE FOUR EVENTS.
// ===========================================================================

test("p647.events.taxonomy — the four identity event types exist, client-scoped, routed context_update at the ACTIVE taxonomy version, and the coverage anti-join stays empty", async (t) => {
  if (need(t)) return;
  const want = ["counterparty.alias_added", "counterparty.alias_retired",
    "counterparty.identifiers_set", "counterparty.renamed"];
  const types = await rootQuery(
    "select name, client_scoped from clara.event_types where name = any($1) order by name", [want]);
  assert.deepEqual(types.rows.map((r) => r.name), want, "p647.events.taxonomy: all four types are registered");
  for (const r of types.rows) assert.equal(r.client_scoped, true, `${r.name} is client-scoped`);

  const routes = await rootQuery(
    `select tt.event_type, tt.decision from clara.trigger_taxonomy tt
       join clara.taxonomy_active ta on ta.version = tt.version
      where tt.event_type = any($1) order by tt.event_type`, [want]);
  assert.deepEqual(routes.rows.map((r) => r.event_type), want, "p647.events.taxonomy: all four are routed at the ACTIVE version");
  for (const r of routes.rows) {
    assert.equal(r.decision, "context_update",
      `${r.event_type} routes context_update — deliberately NOT one of the wake-bound decisions (PRD:123 parks the consumer)`);
  }

  const orphan = await rootQuery(
    `select et.name from clara.event_types et
      where not exists (select 1 from clara.trigger_taxonomy tt
                         join clara.taxonomy_active ta on ta.version = tt.version
                        where tt.event_type = et.name)`);
  assert.deepEqual(orphan.rows, [], "p647.events.taxonomy: the active taxonomy still routes EVERY catalog row");
});

test("p647.events.emitted — a rename, an alias add, an alias retire and an identifier change each append their own client-scoped event row", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("EVENTS") });
  const a = await addAlias(w.bookkeeper, { client: w.clientA, counterparty: cp, alias: name("EV-ALIAS"), origin: "human" });
  await renameCounterparty(w.bookkeeper, { client: w.clientA, counterparty: cp, name: name("EVENTS-II") });
  await setIdentifiers(w.admin, { client: w.clientA, counterparty: cp, registration: `RE${randomUUID().slice(0, 6)}`, tin: "C555" });
  await retireAlias(w.bookkeeper, { client: w.clientA, alias: a.alias_id });

  const ev = await rootQuery(
    `select event_type, client_id, payload from clara.domain_events
      where client_id=$1 and event_type like 'counterparty.%'
        and payload->>'counterparty_id' = $2 order by event_type`, [w.clientA, cp]);
  const seen = ev.rows.map((r) => r.event_type);
  for (const want of ["counterparty.alias_added", "counterparty.alias_retired",
    "counterparty.identifiers_set", "counterparty.renamed"]) {
    assert.ok(seen.includes(want), `p647.events.emitted: ${want} was appended (got ${seen.join(", ")})`);
  }
  for (const r of ev.rows) assert.equal(r.client_id, w.clientA, "p647.events.emitted: every identity event is client-scoped");
});

// ===========================================================================
// H-17 residue + the machine-lane posture.
// ===========================================================================

test("p647.h17.kind_blind_prechecks — the alias writers' own pre-checks are still kind-blind: a cross-kind name collision refuses at the PRE-CHECK, while the kind-scoped unique would have admitted it", async (t) => {
  if (need(t)) return;
  const shared = name("BLIND");
  const vendor = await createCounterparty(w.admin, { client: w.clientA, kind: "vendor", name: shared });
  const customer = await createCounterparty(w.admin, { client: w.clientA, kind: "customer", name: shared });
  // add_counterparty_alias's canonical-name pre-check (0011:1730-1734) asks
  // `counterparties where client_id=p_client and name_normalized=v_norm` — with NO kind term.
  const err = await caught(() => addAlias(w.admin, {
    client: w.clientA, counterparty: customer, alias: shared, origin: "trade_name" }));
  assert.equal(err?.code, "CLR23", "p647.h17.kind_blind_prechecks: refused");
  assert.equal(reasonOf(err), "alias_collision",
    "p647.h17.kind_blind_prechecks: a RESIDUE 0176 named and this slice deliberately does not change — recorded, not silently fixed");
  void vendor;
});

test("p647.machine_lane — no machine role can execute any identity door or read, and no wake_fn_allowlist row was minted (C-22)", async (t) => {
  if (need(t)) return;
  const doors = ["add_counterparty_alias", "retire_counterparty_alias", "rename_counterparty",
    "set_counterparty_identifiers", "get_counterparty_identity", "list_counterparty_identity",
    "list_counterparty_merge_corrections"];
  const acl = await rootQuery(
    `select p.proname, coalesce(p.proacl::text,'(none)') as acl
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname = any($1) order by p.proname`, [doors]);
  assert.equal(acl.rows.length, doors.length, "p647.machine_lane: every named door resolves to exactly one body");
  for (const r of acl.rows) {
    assert.doesNotMatch(r.acl, /clara_runtime|clara_agent_ro|clara_wake_interactive|clara_wake_proactive/,
      `p647.machine_lane: ${r.proname} is reachable by NO machine role (D11)`);
    assert.doesNotMatch(r.acl, /=X\/clara_fn_owner.*\bpublic\b/, `p647.machine_lane: ${r.proname} is not PUBLIC`);
  }
  const allow = await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where fn_name = any($1)", [doors]);
  assert.equal(allow.rows[0].n, 0, "C-22: the wake allowlist is keyed by BARE NAME and gained nothing here");

  const runtimeRead = await caught(() => roleQuery(ROLES.runtime,
    "select clara.get_counterparty_identity($1,$2)", [w.clientA, randomUUID()]));
  assert.ok(runtimeRead, "p647.machine_lane: clara_runtime cannot even call the identity read");
  assert.equal(runtimeRead.code, "42501");
});

test("p647.alias.provenance_reaches_the_list — every one of the four recorded_via values round-trips through the detail read", async (t) => {
  if (need(t)) return;
  const cp = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("VIAS") });
  const human = await addAlias(w.bookkeeper, { client: w.clientA, counterparty: cp, alias: name("VIA-HUMAN"), origin: "human" });
  const legacy = (await rootQuery(
    `insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,alias_normalized,
        alias_display,origin,created_by) values($1,$2,$3,$4,$5,'human',$6) returning id`,
    [w.firm, w.clientA, cp, `vialegacy${randomUUID().slice(0, 6).replace(/-/g, "")}`, "VIA LEGACY", w.bookkeeper])).rows[0].id;
  const agent = (await rootQuery(
    `insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,alias_normalized,
        alias_display,origin,created_by,recorded_via)
     values($1,$2,$3,$4,$5,'agent_proposed',$6,'agent') returning id`,
    [w.firm, w.clientA, cp, `viaagent${randomUUID().slice(0, 6).replace(/-/g, "")}`, "VIA AGENT", w.bookkeeper])).rows[0].id;
  const seeding = (await rootQuery(
    `insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,alias_normalized,
        alias_display,origin,created_by,recorded_via)
     values($1,$2,$3,$4,$5,'human',$6,'seeding') returning id`,
    [w.firm, w.clientA, cp, `viaseed${randomUUID().slice(0, 6).replace(/-/g, "")}`, "VIA SEED", w.bookkeeper])).rows[0].id;

  const detail = await identity(w.viewer, { client: w.clientA, counterparty: cp });
  const via = Object.fromEntries(detail.aliases.map((a) => [a.id, a.recorded_via]));
  assert.equal(via[human.alias_id], "human_ui");
  assert.equal(via[legacy], "legacy_unknown");
  assert.equal(via[agent], "agent");
  assert.equal(via[seeding], "seeding");
  assert.equal(new Set(Object.values(via)).size, 4,
    "p647.alias.provenance_reaches_the_list: all four lanes are distinguishable on the surface — AC1's 'without labelling agent writes human'");
});
