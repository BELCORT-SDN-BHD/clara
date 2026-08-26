// F-A5b PR-1 fast-follow — the `freeform_read` BASIS ARM of clara._sandbox_client_set, trued to
// F-A6 PR-1's live column shape by migration 0136_fix_freeform_basis_types.sql.
//
// WHY THIS FILE EXISTS. 0132 cut its freeform arm against `origin/main` BEFORE 0131 merged, so on
// the merged chain it validated every basis id as a uuid and cast `::uuid`, while
// clara.freeform_read_log.id is a `bigint generated always as identity` (0002:309). Every
// kind='freeform_read' basis therefore refused CLR10 'a basis element carries a malformed id'
// before it could resolve — fail-closed, but the whole product arm was dead. Behind it, the arm
// declared `v_fr_client_scope uuid` against a `client_scope uuid[]` column (0131:519).
//
// WHY IT IS A NEW FILE rather than cells inside f-a5b-sandbox-export-pr1.test.mjs: that battery's
// own B1.2 placeholder is being converted by an unmerged branch (card1/build) at the same time,
// and two lanes editing one file is the collision this repo has paid for before. Every cell here
// is named `fix.fr.*`, which no other battery uses.
//
// A NOTE ON THAT PLACEHOLDER, for whoever reads both files. B1.2's gate is written
// `test("…", { skip: fa6 ? false : "…" }, …)` — and `fa6` is assigned inside before(), which runs
// AFTER node:test has already evaluated every options object at module load. So that cell has
// always skipped, on every chain, F-A6 merged or not. That is precisely why nothing caught the
// dead arm. Every gate below is therefore evaluated INSIDE the test body, never in an options
// object, and reads the live catalog rather than a migration number.
//
// BOTH POLARITIES, EVERYWHERE (law 31): each refusal cell carries the differential twin that is
// ADMITTED, and the two differ in exactly the term the wall reads.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool, asWake, ROLES, opk, getPool } from "./rig-helpers.mjs";
import { buildWorld, mintWake } from "./rig-fixtures.mjs";

const FN = "clara._sandbox_client_set(uuid,jsonb,jsonb)";
// The gate reads the CATALOG, never a filename and never a schema_migrations row — a row records
// that a FILE ran, not that this body carries the change, and numbers are claimed at merge.
const FIXED_MARKER = "clara.freeform_read_log where id = v_label_id::bigint";
const PRE_MARKER = "clara.freeform_read_log where id = v_label_id::uuid";

let ready = false;      // 0132's core resolves at its exact signature
let fa6 = false;        // 0131's hardened receipt shape is on this chain
let fixReady = false;   // 0136's recut is in the LIVE body
let preShape = false;   // ...or the superseded pre-0136 body is
let world = null;
let fx = null;

const model = () => ({ provider: "anthropic", model: "claude-opus-5", version: "2026-08" });
// node-pg serializes a bare JS array parameter as a POSTGRES ARRAY LITERAL, not JSON — wrong for
// a jsonb `p_basis` that IS an array. Stringify explicitly, always.
const basisArr = (...elems) => JSON.stringify(elems);
const frBasis = (label, id) => ({ label, kind: "freeform_read", id: String(id) });
const textBlock = (ref, txt = "narrative prose citing the read") => ({ kind: "text", basis_ref: ref, displayed_text: txt });
const body = (...refs) => ({ blocks: refs.map((r) => textBlock(r)) });

/** THREE-STATE GATE. Runs when 0136's recut is live; skips LOUDLY (a counted skip, with the
 *  reason) when the body positively carries the PRE-0136 shape; and on a body carrying NEITHER
 *  does NOT skip — it falls through so the cell runs and FAILS. A gate that only asks "is the new
 *  text there?" turns a later regression into a quiet skip, which is proof deletion wearing a
 *  skip's clothes (review law 2: absence is not evidence). */
function gate(t) {
  if (!ready) { t.skip("F-A5b PR-1 (0132) not applied — clara._sandbox_client_set absent"); return true; }
  if (!fa6) { t.skip("F-A6 PR-1 (0131) not applied — clara.freeform_read_log has no `scope` column, so no freeform basis can exist (Annex K)"); return true; }
  if (fixReady) return false;
  if (preShape) {
    t.skip("0136 not applied — clara._sandbox_client_set still carries the pre-0136 ::uuid basis arm; the freeform basis kind is dormant");
    return true;
  }
  return false; // neither shape: run and fail loudly.
}

/** A REAL, fully-settled freeform receipt, written straight to the table. The wake verb's own
 *  credential/pool machinery is F-A6's to exercise (f-a6-freeform-read.test.mjs does); what this
 *  battery needs from a receipt is only its durable arm-phase columns, which are exactly what
 *  _sandbox_client_set reads. `p_clients` is null for a firm-wide read and a uuid[] otherwise. */
async function mintReceipt({ firm, scope, clients = null, actor, wakeKind = "interactive_client",
  outcome = "ok" }) {
  // ck_freeform_settled (0131:555-561): a non-ok outcome MUST name a refusal_reason.
  const reason = outcome === "ok" ? null : `fix.fr synthetic ${outcome}`;
  const r = await rootQuery(
    `insert into clara.freeform_read_log
       (firm_id, credential_id, query_text, purpose, verb, scope, client_scope, acting_actor,
        via_wake_kind, task_id, op_key, arm_txid, settled_at, outcome, refusal_reason, rung_vector,
        relations_read, row_count, byte_count, duration_ms)
     values ($1, $2, 'select id from clara.clients', 'fix.fr basis fixture', 'wake_freeform_read',
             $3, $4::uuid[], $5, $6, $7, $8, pg_current_xact_id(), now(), $9, $10,
             '{"statement_shape":"pass"}'::jsonb, array['clara.clients']::text[], 1, 64, 3)
     returning id`,
    [firm, randomUUID(), scope, clients, actor, wakeKind, randomUUID(), `fixfr-${randomUUID()}`,
      outcome, reason],
  );
  return String(r.rows[0].id);
}

/** Mint a sandbox view through the REAL granted door (an interactive, HOME-scoped wake), never by
 *  reaching into the ungranted core. Returns the verb's jsonb result. */
async function mintView(firm, obo, p_body, p_basis, tag) {
  const { secret } = await mintWake({ kind: "interactive", firm, onBehalfOf: obo });
  const r = await asWake(ROLES.wakeInteractive, secret, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [p_body, p_basis, tag, model(), opk(tag)]));
  return r.rows[0].r;
}

/** The refusal shape of a mint, or null if it was admitted. */
async function mintRefusal(firm, obo, p_body, p_basis, tag) {
  try {
    await mintView(firm, obo, p_body, p_basis, tag);
    return null;
  } catch (e) { return { code: e.code, message: e.message, detail: e.detail }; }
}

before(async () => {
  const r = await rootQuery(
    `select to_regprocedure($3) is not null as fn,
            exists(select 1 from information_schema.columns
              where table_schema='clara' and table_name='freeform_read_log'
                and column_name='scope') as fa6,
            (select position($1 in p.prosrc) > 0 from pg_proc p where p.oid = to_regprocedure($3)) as has_fix,
            (select position($2 in p.prosrc) > 0 from pg_proc p where p.oid = to_regprocedure($3)) as has_pre`,
    [FIXED_MARKER, PRE_MARKER, FN]);
  const row = r.rows[0];
  ready = Boolean(row.fn);
  fa6 = Boolean(row.fa6);
  fixReady = Boolean(row.has_fix);
  preShape = Boolean(row.has_pre);
  if (ready && fa6 && !fixReady && !preShape) {
    // Not a skip and not silent: say out loud that the cells below will RUN and FAIL.
    console.log("fix.fr GATE: clara._sandbox_client_set carries NEITHER the pre-0136 ::uuid arm nor 0136's ::bigint arm — the cells below will RUN and FAIL rather than skip.");
  }
  if (!ready || !fa6) return;

  world = await buildWorld();
  // An ARCHIVED client in firm A. firm_closure is deliberately the estate's house form's opposite
  // — every row of clara.clients for the firm AT ANY STATUS, no `status` conjunct (design §3.2,
  // gate M2/C-21) — and a roster of active-only clients cannot tell a correct derivation from an
  // under-covering one.
  const archived = randomUUID();
  await rootQuery(
    "insert into clara.clients (id, firm_id, name, status) values ($1,$2,$3,'archived')",
    [archived, world.firms.A, `${world.prefix}_A_archived`]);

  fx = {
    archived,
    frA1: await mintReceipt({ firm: world.firms.A, scope: "client", clients: [world.clients.A1], actor: world.users.alice }),
    frA2: await mintReceipt({ firm: world.firms.A, scope: "client", clients: [world.clients.A2], actor: world.users.alice }),
    frFirm: await mintReceipt({ firm: world.firms.A, scope: "firm", clients: null, actor: world.users.alice, wakeKind: "interactive" }),
    frForeign: await mintReceipt({ firm: world.firms.B, scope: "client", clients: [world.clients.B1], actor: world.users.dave }),
  };
  // A bigint id that certainly resolves to no row — derived from the live max, never guessed.
  fx.absentId = String(
    BigInt((await rootQuery("select coalesce(max(id),0)::text as m from clara.freeform_read_log")).rows[0].m) + 1_000_000n);
});

after(async () => { await endPool(); });

// =============================================================================================
// THE ROOT CAUSE, RE-MEASURED ON EVERY RUN. 0132's in-body probe asked whether a COLUMN EXISTS
// and was mistaken for a check that its TYPE is what the arm assumes — the spelling-is-not-
// identity law landing on a column. 0136 moved that assertion into its own prestate, which runs
// once at deploy; this cell re-proves it on every suite run, so a later re-type cannot land
// silently.
// =============================================================================================
test("fix.fr.types — the live column types the arm depends on are still bigint / uuid[] / uuid", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select (select format_type(a.atttypid,a.atttypmod) from pg_attribute a
              where a.attrelid='clara.freeform_read_log'::regclass and a.attname='id' and not a.attisdropped) as fr_id,
            (select format_type(a.atttypid,a.atttypmod) from pg_attribute a
              where a.attrelid='clara.freeform_read_log'::regclass and a.attname='client_scope' and not a.attisdropped) as fr_scope,
            (select format_type(a.atttypid,a.atttypmod) from pg_attribute a
              where a.attrelid='clara.metric_cells'::regclass and a.attname='id' and not a.attisdropped) as mc_id`);
  assert.equal(r.rows[0].fr_id, "bigint", "freeform_read_log.id is the bigint identity the ::bigint gate is cut for");
  assert.equal(r.rows[0].fr_scope, "uuid[]", "client_scope is an ARRAY — the derivation unions it");
  assert.equal(r.rows[0].mc_id, "uuid", "metric_cells.id is uuid — which is what makes the DEFAULT uuid id-rule correct");
});

// =============================================================================================
// B1.2 / B1.4 — THE ARM ITSELF. Dead on the merged chain before 0136; these are its first
// positive proofs.
// =============================================================================================
test("fix.fr.resolves — a settled client-pinned freeform read GROUNDS a basis; the EXACT derivation is that receipt's own client", async (t) => {
  if (gate(t)) return;
  const out = await mintView(world.firms.A, world.users.alice,
    body("fr"), basisArr(frBasis("fr", fx.frA1)), "fixfr-resolves");
  // NT-1: the widened client_set cannot distinguish a correct derivation from a narrowed one once
  // A1(iii) widens it to the roster, so the real claim is asserted on client_set_exact.
  assert.deepEqual(out.client_set_exact, [world.clients.A1],
    "the exact per-basis-kind derivation for one client-pinned read is exactly that read's client");
  assert.equal(out.client_set_basis, "firm_closure", "A1(iii)'s free-text fail-safe still widens the RETURNED set");
  assert.ok(out.client_set.includes(world.clients.A1), "and the widened set still covers the cited client");
});

test("fix.fr.union — two client-pinned reads UNION; dropping one block's citation narrows the exact set to the one still cited", async (t) => {
  if (gate(t)) return;
  const both = await mintView(world.firms.A, world.users.alice,
    body("a", "b"), basisArr(frBasis("a", fx.frA1), frBasis("b", fx.frA2)), "fixfr-union");
  assert.deepEqual([...both.client_set_exact].sort(), [world.clients.A1, world.clients.A2].sort(),
    "client_scope is a SET: the derivation unions every cited receipt's clients, never keeps only the first");
  // The differential twin: same basis, but only `a` is cited by a block. The derivation runs over
  // USED labels, so the exact set must shrink to A1 alone — proof the union above came from the
  // citations and not from some blanket widening.
  const one = await mintView(world.firms.A, world.users.alice,
    body("a"), basisArr(frBasis("a", fx.frA1), frBasis("b", fx.frA2)), "fixfr-union-twin");
  assert.deepEqual(one.client_set_exact, [world.clients.A1],
    "an uncited basis element is still VALIDATED but contributes no client");
});

test("fix.fr.firm-closure — a firm-wide read derives the WHOLE roster, ARCHIVED clients included (no status conjunct)", async (t) => {
  if (gate(t)) return;
  const out = await mintView(world.firms.A, world.users.alice,
    body("f"), basisArr(frBasis("f", fx.frFirm)), "fixfr-firmclosure");
  const roster = (await rootQuery("select id from clara.clients where firm_id=$1", [world.firms.A]))
    .rows.map((r) => r.id).sort();
  assert.deepEqual([...out.client_set_exact].sort(), roster,
    "firm_closure is every row of clara.clients for the firm, at ANY status");
  assert.ok(out.client_set_exact.includes(fx.archived),
    "the ARCHIVED client is inside the aggregate a firm-wide read could have touched — an active-only derivation UNDER-COVERS, and §3.3's wall would silently accept it");
  assert.equal(out.client_set_basis, "firm_closure");
});

// =============================================================================================
// THE MALFORMED-ID WALL. 0136 changes WHICH literal grammar is well-formed for which relation's
// key. It does not, and must not, weaken the wall.
// =============================================================================================
test("fix.fr.malformed — a genuinely malformed freeform id still REFUSES typed; the twin with the real id is admitted", async (t) => {
  if (gate(t)) return;
  const bad = [
    ["not-a-number", "non-numeric text"],
    ["", "the empty string"],
    ["12x3", "digits with a letter inside"],
    ["-5", "a negative literal"],
    [" 7", "a leading space"],
    ["7 ", "a trailing space"],
    ["1.0", "a decimal point"],
    ["01", "a leading zero"],
    [randomUUID(), "a UUID — well-formed for the OTHER basis kind, malformed for this one"],
    ["9223372036854775808", "int8's ceiling plus one: an overflow that must never reach the ::bigint cast"],
    ["99999999999999999999999", "a 23-digit overflow"],
    // N5 — THE EMBEDDED-NEWLINE CLASS, the one shape where a regex surprise could actually leak.
    // In many regex dialects `$` matches before a trailing newline, which would make '7\n' pass a
    // `^[0-9]+$` test and reach the cast. PostgreSQL's ARE anchors `$` at end-of-STRING unless
    // newline-sensitive matching is switched on, so these refuse — but that is a property of the
    // engine, not of the pattern, and it is the difference between a typed refusal and a raw
    // 22P02 escaping through the wake wrapper. Measured, not assumed.
    ["7\n", "a trailing newline after a valid digit"],
    ["7\nx", "a valid digit, a newline, then garbage"],
    ["\n7", "a leading newline"],
    ["7\n9223372036854775808", "a valid digit, a newline, then an overflow"],
  ];
  for (const [id, why] of bad) {
    const e = await mintRefusal(world.firms.A, world.users.alice,
      body("fr"), basisArr({ label: "fr", kind: "freeform_read", id }), `fixfr-bad-${randomUUID().slice(0, 8)}`);
    assert.ok(e, `an id that is ${why} must refuse, not mint`);
    assert.equal(e.code, "CLR10", `${why}: expected the typed CLR10, got ${e.code} (${e.message})`);
    assert.match(e.detail || "", /sandbox_view_basis_unknown/, `${why}: the refusal must carry the typed token`);
    assert.doesNotMatch(String(e.code), /^22P02$|^22003$/, `${why}: a raw cast error must never escape the wall`);
  }
  // The differential twin: identical in every term except the id, and admitted.
  const ok = await mintView(world.firms.A, world.users.alice,
    body("fr"), basisArr(frBasis("fr", fx.frA1)), "fixfr-bad-twin");
  assert.deepEqual(ok.client_set_exact, [world.clients.A1]);
});

test("fix.fr.per-kind — the numeric grammar does NOT leak onto the uuid-keyed relation, and an unrecognised kind still refuses at the same point", async (t) => {
  if (gate(t)) return;
  const one = (basis, tag) => mintRefusal(world.firms.A, world.users.alice,
    { blocks: [textBlock("x")] }, basisArr(basis), tag);

  // A preview_cell keeps the UUID rule: a numeric id is malformed there, exactly as before 0136.
  const numericOnUuidRelation = await one({ label: "x", kind: "preview_cell", id: "1" }, "fixfr-pk-num");
  assert.equal(numericOnUuidRelation?.code, "CLR10", "a bigint literal is NOT a well-formed metric_cells id");
  assert.match(numericOnUuidRelation?.detail || "", /sandbox_view_basis_unknown/);
  const textOnUuidRelation = await one({ label: "x", kind: "preview_cell", id: "not-a-uuid" }, "fixfr-pk-txt");
  assert.equal(textOnUuidRelation?.code, "CLR10");

  // An UNRECOGNISED kind with a malformed id still trips the id gate first (CLR10), because the
  // uuid rule is the DEFAULT branch — the pre-0136 order and token, preserved deliberately.
  const unknownKindBadId = await one({ label: "x", kind: "chart_ref", id: "not-a-uuid" }, "fixfr-pk-uk1");
  assert.equal(unknownKindBadId?.code, "CLR10", "the id gate still precedes the kind dispatch");
  // ...and with a WELL-FORMED id it reaches the kind dispatch and refuses there.
  const unknownKindGoodId = await one({ label: "x", kind: "chart_ref", id: randomUUID() }, "fixfr-pk-uk2");
  assert.equal(unknownKindGoodId?.code, "CLR11", "an unrecognised kind refuses at the dispatch, CLR11");
  assert.match(unknownKindGoodId?.detail || "", /sandbox_view_basis_unknown/);
});

// =============================================================================================
// NO EXISTENCE ORACLE. Absent and foreign must be INDISTINGUISHABLE — freeform_read_log.id is a
// single global identity sequence, so a foreign id is guessable, not secret (design §3.2).
// =============================================================================================
test("fix.fr.no-oracle — an absent id and another firm's real receipt refuse IDENTICALLY", async (t) => {
  if (gate(t)) return;
  const refuse = (id, tag) => mintRefusal(world.firms.A, world.users.alice,
    body("fr"), basisArr(frBasis("fr", id)), tag);

  const absent = await refuse(fx.absentId, "fixfr-absent");
  const foreign = await refuse(fx.frForeign, "fixfr-foreign");
  assert.ok(absent && foreign, "both must refuse");
  assert.equal(absent.code, "CLR11");
  assert.equal(absent.code, foreign.code, "the error CODES must not distinguish absent from foreign");
  assert.equal(absent.message, foreign.message, "nor the messages");
  assert.equal(absent.detail, foreign.detail, "nor the details — the same label was used in both, so any difference IS an oracle");
  assert.match(absent.detail || "", /sandbox_view_basis_unknown/);

  // The twin, differing only in WHOSE receipt it is: firm A's own resolves.
  const own = await mintView(world.firms.A, world.users.alice,
    body("fr"), basisArr(frBasis("fr", fx.frA1)), "fixfr-noora-twin");
  assert.deepEqual(own.client_set_exact, [world.clients.A1]);
});

// =============================================================================================
// F1 — THE TENANCY WALL (fix round; the implementation and adversarial review legs converged on
// this independently). Proving the RECEIPT belongs to the firm does not prove the CLIENTS it
// names do. The adversarial leg measured that clara._recipient_covers answers covered:true for a
// foreign-firm client_set with no backstop behind it, so the arm's correctness rested on a
// three-hop cross-file premise. One conjunct makes it local. These cells force it directly:
// client_scope has no FK, so a receipt naming a foreign client is CONSTRUCTIBLE at the table —
// which is exactly why the wall has to live in the body.
// =============================================================================================
test("fix.fr.tenancy — a receipt naming a client of ANOTHER firm refuses, indistinguishably from one naming no client at all; the own-firm twin is admitted", async (t) => {
  if (gate(t)) return;
  const cite = (id, tag) => mintRefusal(world.firms.A, world.users.alice,
    body("fr"), basisArr(frBasis("fr", id)), tag);

  // (1) A firm-A receipt whose client_scope names a REAL client of firm B.
  const foreignClient = await mintReceipt({
    firm: world.firms.A, scope: "client", clients: [world.clients.B1], actor: world.users.alice });
  const eForeign = await cite(foreignClient, "fixfr-ten-foreign");
  assert.ok(eForeign, "a client_scope naming another firm's client must refuse the mint — otherwise the foreign client enters client_set and _recipient_covers answers covered:true on it");
  assert.equal(eForeign.code, "CLR11", `expected the typed CLR11, got ${eForeign.code} (${eForeign.message})`);
  assert.match(eForeign.detail || "", /sandbox_view_basis_unknown/);

  // (2) NO ORACLE: a client_scope naming a uuid that is no client of ANY firm must be
  //     indistinguishable from (1). Same label, so any difference at all IS the oracle.
  const noSuchClient = await mintReceipt({
    firm: world.firms.A, scope: "client", clients: [randomUUID()], actor: world.users.alice });
  const eAbsent = await cite(noSuchClient, "fixfr-ten-absent");
  assert.ok(eAbsent, "a client_scope naming a non-existent client must also refuse");
  assert.equal(eAbsent.code, eForeign.code, "the error CODE must not distinguish a foreign client from a non-existent one");
  assert.equal(eAbsent.message, eForeign.message, "nor the message");
  assert.equal(eAbsent.detail, eForeign.detail, "nor the detail — same label was used, so any difference IS an existence oracle");

  // (3) The differential twin: identical in every term except WHOSE client it names, and admitted.
  const ok = await mintView(world.firms.A, world.users.alice,
    body("fr"), basisArr(frBasis("fr", fx.frA1)), "fixfr-ten-twin");
  assert.deepEqual(ok.client_set_exact, [world.clients.A1],
    "a receipt naming this firm's own client still derives normally — the wall refuses foreign clients, not legitimate ones");

  // (4) And no firm-B client ever reached the set, on any path this cell exercised.
  assert.ok(!ok.client_set.includes(world.clients.B1), "no foreign client in the widened set either");
});

// =============================================================================================
// F2 — SETTLED IS NOT SUCCEEDED (fix round). A refused or errored read returned NO ROWS, so
// grounding a durable export's narrative on it is a provenance defect against hard constraint 2.
// The conjunct rides inside the existence probe, so a non-ok read refuses through the SAME arm as
// an absent or foreign one and the three stay indistinguishable.
// =============================================================================================
test("fix.fr.outcome — a settled-but-REFUSED and a settled-but-ERRORED read cannot ground a basis, and refuse indistinguishably from an absent id; the ok twin is admitted", async (t) => {
  if (gate(t)) return;
  const cite = (id, tag) => mintRefusal(world.firms.A, world.users.alice,
    body("fr"), basisArr(frBasis("fr", id)), tag);

  const refusedId = await mintReceipt({
    firm: world.firms.A, scope: "client", clients: [world.clients.A1], actor: world.users.alice, outcome: "refused" });
  const erroredId = await mintReceipt({
    firm: world.firms.A, scope: "client", clients: [world.clients.A1], actor: world.users.alice, outcome: "error" });

  const eRefused = await cite(refusedId, "fixfr-out-refused");
  const eErrored = await cite(erroredId, "fixfr-out-errored");
  const eAbsent = await cite(fx.absentId, "fixfr-out-absent");

  assert.ok(eRefused, "a REFUSED read produced no rows — it must not ground a basis");
  assert.ok(eErrored, "an ERRORED read produced no rows — it must not ground a basis");
  assert.equal(eRefused.code, "CLR11", `expected the typed CLR11, got ${eRefused.code} (${eRefused.message})`);
  assert.match(eRefused.detail || "", /sandbox_view_basis_unknown/);
  // No oracle: a non-ok read is indistinguishable from an id that does not exist at all.
  for (const [label, e] of [["refused", eRefused], ["errored", eErrored]]) {
    assert.equal(e.code, eAbsent.code, `${label}: the CODE must not distinguish a non-ok read from an absent id`);
    assert.equal(e.message, eAbsent.message, `${label}: nor the message`);
    assert.equal(e.detail, eAbsent.detail, `${label}: nor the detail`);
  }

  // The differential twin: same firm, same client, same everything — outcome 'ok' — and admitted.
  const okId = await mintReceipt({
    firm: world.firms.A, scope: "client", clients: [world.clients.A1], actor: world.users.alice, outcome: "ok" });
  const ok = await mintView(world.firms.A, world.users.alice,
    body("fr"), basisArr(frBasis("fr", okId)), "fixfr-out-twin");
  assert.deepEqual(ok.client_set_exact, [world.clients.A1],
    "the ONLY term that differs from the refused/errored receipts is `outcome`, and this one derives");
});

// =============================================================================================
// WHY 0136 ADDS NO SEPARATE `settled_at` CONJUNCT — F2's `outcome = 'ok'` already implies it
// (ck_freeform_settled makes outcome non-null exactly when settled_at is). The weaker property is
// independently guaranteed anyway, and this cell proves that rather than asserting it. 0131's
// t_freeform_must_settle is a DEFERRABLE INITIALLY DEFERRED constraint trigger, so an armed and
// unsettled receipt can never COMMIT. Every row this arm can see from another transaction is
// settled by construction, which is exactly the design's "pure function of durable rows" (P-3).
// =============================================================================================
test("fix.fr.unsettled-cannot-commit — an unsettled receipt is not a durable row: the COMMIT is refused", async (t) => {
  if (gate(t)) return;
  const c = await getPool().connect();
  let committed = false; let err = null;
  try {
    await c.query("begin");
    await c.query(
      `insert into clara.freeform_read_log
         (firm_id, credential_id, query_text, purpose, verb, scope, client_scope, acting_actor,
          via_wake_kind, task_id, op_key, arm_txid)
       values ($1,$2,'select 1','fix.fr unsettled','wake_freeform_read','client',array[$3]::uuid[],
               $4,'interactive_client',$5,$6,pg_current_xact_id())`,
      [world.firms.A, randomUUID(), world.clients.A1, world.users.alice, randomUUID(), `fixfr-uns-${randomUUID()}`]);
    await c.query("commit");
    committed = true;
  } catch (e) {
    err = e;
    try { await c.query("rollback"); } catch { /* best-effort cleanup only */ }
  } finally {
    try { await c.query("reset role"); await c.query("reset all"); } catch { /* best-effort */ }
    c.release();
  }
  assert.equal(committed, false, "an armed-but-unsettled receipt must not be able to commit");
  assert.equal(err?.code, "CLR10", `expected the must-settle CLR10, got ${err?.code} (${err?.message})`);
  assert.match(err?.message || "", /armed and never settled/,
    "the refusal must come from t_freeform_must_settle, not from some other constraint — otherwise this cell proves nothing about durability");
});

// =============================================================================================
// WHY THE MULTI-ELEMENT / NULL / EMPTY GUARDS CANNOT BE EXERCISED THROUGH A ROW TODAY. Rather
// than leave three bare skips, prove POSITIVELY that F-A6 v1's own CHECK is what closes them —
// so the guards are known-unreachable rather than merely untested, and the day F-A6 v2 widens
// that CHECK, this cell is where the change announces itself.
// =============================================================================================
test("fix.fr.guards-unreachable — ck_freeform_scope_client is what makes the multi/NULL/empty client_scope shapes unconstructible on this chain", async (t) => {
  if (gate(t)) return;
  const tryRow = async (scope, clientsSql) => {
    const c = await getPool().connect();
    try {
      await c.query("begin");
      await c.query(
        `insert into clara.freeform_read_log
           (firm_id, credential_id, query_text, purpose, verb, scope, client_scope, acting_actor,
            via_wake_kind, task_id, op_key, arm_txid, settled_at, outcome, rung_vector,
            relations_read, row_count, byte_count, duration_ms)
         values ($1,$2,'select 1','fix.fr guard probe','wake_freeform_read',$3,${clientsSql},$4,
                 'interactive_client',$5,$6,pg_current_xact_id(),now(),'ok','{}'::jsonb,
                 array[]::text[],0,0,1)`,
        [world.firms.A, randomUUID(), scope, world.users.alice, randomUUID(), `fixfr-g-${randomUUID()}`]);
      await c.query("rollback");
      return null;
    } catch (e) {
      try { await c.query("rollback"); } catch { /* best-effort */ }
      return { code: e.code, constraint: e.constraint, message: e.message };
    } finally {
      try { await c.query("reset role"); await c.query("reset all"); } catch { /* best-effort */ }
      c.release();
    }
  };
  const twoClients = `array['${world.clients.A1}','${world.clients.A2}']::uuid[]`;
  for (const [label, scope, sql, constraint] of [
    ["a TWO-element client_scope on scope='client'", "client", twoClients, "ck_freeform_scope_client"],
    ["a NULL client_scope on scope='client'", "client", "null::uuid[]", "ck_freeform_scope_client"],
    ["an EMPTY client_scope on scope='client'", "client", "'{}'::uuid[]", "ck_freeform_scope_client"],
    ["a client_scope carrying a NULL element", "client", "array[null]::uuid[]", "ck_freeform_scope_client"],
    ["scope='cross_client' at all", "cross_client", "null::uuid[]", "freeform_read_log_scope_check"],
  ]) {
    const e = await tryRow(scope, sql);
    assert.ok(e, `${label} must be refused by the table itself — if this row can now be written, 0136's array guards are LIVE and need their own cells`);
    assert.equal(e.code, "23514", `${label}: expected a CHECK violation, got ${e.code} (${e.message})`);
    assert.equal(e.constraint, constraint, `${label}: refused by ${e.constraint}, expected ${constraint}`);
  }

  // THE SIXTH SHAPE (F3), and it refuses DIFFERENTLY — measured, not assumed. A 2-D client_scope
  // is not caught by a CHECK returning false: ck_freeform_scope_client's OWN array_position
  // raises 0A000 ("searching for elements in multidimensional arrays is not supported") while
  // evaluating the constraint, so the refusal carries no constraint name at all. That is exactly
  // the raw error 0136's array_ndims guard pre-empts on the READ side, for the day a writer
  // reaches this column by some path that does not evaluate this CHECK.
  const eNd = await tryRow("client", `array[array['${world.clients.A1}'::uuid]]`);
  assert.ok(eNd, "a 2-D client_scope must not be writable");
  assert.equal(eNd.code, "0A000",
    `a 2-D client_scope is refused by array_position raising, not by a CHECK returning false — got ${eNd.code} (${eNd.message})`);
  assert.match(eNd.message, /multidimensional/,
    "and the raise is the multidimensional-array one, which is the precise error 0136's array_ndims guard exists to pre-empt");
  // POSITIVE CONTROL on the probe itself: the one shape F-A6 v1 DOES admit goes through, so the
  // five refusals above are the CHECKs answering and not the fixture failing for its own reasons.
  assert.equal(await tryRow("client", `array['${world.clients.A1}']::uuid[]`), null,
    "a one-element client_scope on scope='client' must INSERT — otherwise every refusal above is meaningless");
});
