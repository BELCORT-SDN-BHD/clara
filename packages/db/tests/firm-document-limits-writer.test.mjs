// #960 — THE FIRM'S OWN PROCESSING CAPS NOW HAVE A HUMAN WRITER.
// Migration: 0270_firm_document_limits_writer.sql (stem `firm_document_limits_writer$`).
//
// THE OWNER'S RULING (2026-09-20, on the ticket) IS THE CONTRACT: option C. The FIRM's own
// owner or admin sets all four document-processing caps freely — there is no operator gate and
// no operator-side surface. BELCORT will price by usage later, so every change is receipted and
// audited as usage-billing evidence, and the ESTATE's own safety ceiling stands above whatever
// a firm sets.
//
// WHY THIS BATTERY EXISTS BESIDE firm-document-limits.test.mjs RATHER THAN INSIDE IT. That file
// is #692's, and every cell in it runs as ROOT on purpose: before this ticket the relation had
// no human writer at all, so a cell that drove a role would have been testing the grant matrix
// rather than the trigger. This battery is the opposite shape — every cell drives the DOOR as a
// real `clara_authenticated` session — and folding the two together would blur which half a red
// cell is accusing.
//
// THE SEAM IS THE DOOR, and nothing here reaches around it: the caps are ARRANGED through
// `clara.set_firm_document_limits` and READ BACK from the relation (root, labelled) and from
// `clara.get_firm_commercial_state` (the shipped read). No cell writes the relation by hand.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { assertRaises, rootQuery, endPool } from "./rig-fixtures.mjs";
import {
  auditRows, CAPS, CEILINGS, commercialState, FIRST_INSERT, firmScene, P960, setLimits,
  storedRow,
} from "./firm-document-limits-writer-fixtures.mjs";
import { insertUser, opk } from "./rig-fixtures.mjs";

/** The migration's STABLE STEM, probed against clara.schema_migrations — never a file listing,
 *  and never a migration NUMBER (numbers are claimed at merge). */
const STEM = "firm_document_limits_writer$";

let live = false;
let executed = 0;
const EXPECTED_CELLS = 11;

before(async () => {
  try {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
    live = r.rows[0].n > 0;
  } catch {
    live = false;
  }
});

after(async () => {
  if (live) {
    assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_DOCUMENT_LIMITS_WRITER === "1") {
    console.warn("SKIP firm-document-limits-writer: 0270 is not applied (explicit pre-integration run).");
    t.skip("#960 firm document-limits writer absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#960: clara.set_firm_document_limits is absent. Apply packages/db/migrations/"
    + "0270_firm_document_limits_writer.sql, or preload tests/firm-document-limits-writer-"
    + "preintegration-gate.mjs for a deliberate pre-integration run.");
  return true;
}

// ===========================================================================
// CELL 1 — A FIRM WITH NO STORED ROW: the owner's FIRST write names ONE cap, and the receipt
// states ALL FOUR resulting caps, not only the one that was named.
//
// The three unnamed caps land on the relation's OWN first-insert values (100 / 1000 / 2 / 2),
// which `clara._tf_firm_document_limits_upsert` supplies and 0196's header states — an
// independent source of truth this battery reads off the trigger, never off the door.
// ===========================================================================
test("#960 cell 1 · a first write names one cap and the receipt states all four", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("first_write");

  assert.equal(await storedRow(scene.firm), null, "the fresh firm must start with no limits row");

  const receipt = await setLimits(scene.owner, { docs_per_day: 250 });

  assert.equal(receipt.firm_id, scene.firm, "the receipt names the caller's own firm");
  assert.deepEqual(receipt.caps, {
    docs_per_day: 250,
    pages_per_day: FIRST_INSERT.pages_per_day,
    ocr_concurrency: FIRST_INSERT.ocr_concurrency,
    llm_witness_concurrency: FIRST_INSERT.llm_witness_concurrency,
  }, "the receipt states every resulting cap, not only the changed one");

  const row = await storedRow(scene.firm);
  assert.ok(row, "the first write created the firm's row");
  for (const cap of CAPS) {
    assert.equal(row[cap], receipt.caps[cap], `${cap}: the stored row and the receipt agree`);
  }
  assert.equal(row.updated_by, scene.owner, "the row carries the acting owner");
  executed += 1;
});

// ===========================================================================
// CELL 2 — A WRITE NAMING ONE CAP LEAVES THE OTHER THREE AT THEIR STORED VALUES, and the
// receipt says which cap actually moved and what it moved FROM.
//
// The baseline here shares no value with the relation's first-insert values (100/1000/2/2), so
// "the other three were preserved" can never be mistaken for "the other three were reset to a
// default that happened to match" — the discipline firm-document-limits.test.mjs's own BASE
// constant established for 0196's trigger, re-used here one level up at the door.
// ===========================================================================
test("#960 cell 2 · a second write moves one cap, preserves three, and reports both sides", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("preserve");
  const base = { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 };
  await setLimits(scene.owner, base);

  const receipt = await setLimits(scene.owner, { pages_per_day: 77 });

  assert.deepEqual(receipt.caps, { ...base, pages_per_day: 77 },
    "only the named cap moved; the other three kept their stored values");
  assert.deepEqual(receipt.previous, base,
    "the receipt states what every cap was before this call");
  assert.deepEqual(receipt.changed, ["pages_per_day"],
    "the receipt names exactly the caps that actually moved");

  const row = await storedRow(scene.firm);
  for (const cap of CAPS) {
    assert.equal(row[cap], receipt.caps[cap], `${cap}: the stored row and the receipt agree`);
  }
  executed += 1;
});

// ===========================================================================
// CELL 3 — THE AUDIT ENTRY IS USAGE-BILLING EVIDENCE, so it is complete and attributable: the
// actor, the firm, and the BEFORE and AFTER value of every cap that changed.
//
// The owner's ruling says so in as many words — "every change must be receipted and audited as
// usage-billing evidence" — which is why this cell asserts a SHAPE (`changes` keyed by cap, each
// with old and new) rather than merely that a row exists. An audit that records only the new
// value cannot answer "what was it before this call", which is the question a bill disputes.
//
// THE ADMIN, NOT THE OWNER, drives this cell: the ruling admits both ranks, and an audit row
// that attributed a change to the firm's owner because the owner happens to be the firm's
// creator would be attributing it to the wrong person.
// ===========================================================================
test("#960 cell 3 · the audit row names the actor, the firm, and both sides of every changed cap", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("audit", ["admin"]);
  const admin = scene.members.admin;
  await setLimits(admin, { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 });

  await setLimits(admin, { pages_per_day: 77, ocr_concurrency: 3, llm_witness_concurrency: 9 });

  const rows = await auditRows(scene.firm);
  assert.equal(rows.length, 2, "one audit row per accepted write");
  const latest = rows[0];
  assert.equal(latest.firm_id, scene.firm, "the audit row names the firm");
  assert.equal(latest.actor, admin, "the audit row names the ACTOR, not the firm's owner");
  assert.equal(latest.outcome, "ok");
  assert.deepEqual(latest.args.changes, {
    pages_per_day: { old: 22, new: 77 },
    llm_witness_concurrency: { old: 4, new: 9 },
  }, "both sides of every cap that moved, and nothing for the cap re-named at its own value");
  assert.deepEqual(latest.args.caps, {
    docs_per_day: 11, pages_per_day: 77, ocr_concurrency: 3, llm_witness_concurrency: 9,
  }, "the resulting four caps ride the audit row too");
  executed += 1;
});

// ===========================================================================
// CELL 4 — THE ESTATE'S CEILING STANDS ABOVE WHATEVER A FIRM SETS, and the refusal names it.
//
// The owner's ruling: the firm sets its own caps freely, and "the estate's own safety limits
// stay the absolute ceiling above whatever a firm sets". No such maximum was expressed anywhere
// before this ticket (the four columns carry only `> 0`), so the door carries it.
//
// THE FOUR NUMBERS ARE THE SPEC, not a reading of the code: they are written here as literals,
// and `CEILINGS` in the fixtures module carries the same four with the reasoning. The cell
// drives BOTH SIDES of each boundary — the ceiling value itself is ACCEPTED and one more is
// REFUSED — so a green here cannot mean "the door refuses everything" or "the door refuses
// nothing".
// ===========================================================================
test("#960 cell 4 · the ceiling value is accepted, one above it is refused, and the refusal names the ceiling", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("ceiling");

  // The ceiling itself: accepted, all four at once.
  const receipt = await setLimits(scene.owner, CEILINGS);
  assert.deepEqual(receipt.caps, CEILINGS, "every cap may be set AT the estate ceiling");

  for (const cap of CAPS) {
    const err = await assertRaises("CLR10",
      () => setLimits(scene.owner, { [cap]: CEILINGS[cap] + 1 }), `${cap} above the ceiling`);
    assert.equal(JSON.parse(err.detail ?? "{}").reason, "cap_above_ceiling",
      `${cap}: the refusal is typed, not a bare CLR10`);
    assert.ok(err.message.includes(String(CEILINGS[cap])),
      `${cap}: the refusal must name the ceiling — got ${JSON.stringify(err.message)}`);
    assert.ok(err.message.includes(cap),
      `${cap}: the refusal must name the cap — got ${JSON.stringify(err.message)}`);
  }

  // NOT A SILENT NO-OP AND NOT A PARTIAL WRITE: the stored row is exactly what the accepted
  // call left, after four refusals.
  const row = await storedRow(scene.firm);
  for (const cap of CAPS) assert.equal(row[cap], CEILINGS[cap], `${cap}: unchanged by the refusals`);
  executed += 1;
});

// ===========================================================================
// CELL 5 — THE TWO MALFORMED CALLS ARE TYPED REFUSALS, never a raw constraint violation and
// never a silent no-op.
//
// (a) A cap at zero or below. The relation's own CHECKs say `> 0` (and the fourth column's says
//     `null or > 0`), so a bare insert would die on 23514 — a Postgres error string no surface
//     can render. The door mirrors the CHECK and refuses FIRST, exactly as
//     `clara.set_firm_high_stakes_threshold` does for the same reason (0022 §B's own comment).
//
// (b) A call that names NO cap at all. Every argument is optional, so this is reachable, and
//     riding it through would write an audit row and a receipt for a change that did not
//     happen — evidence of a thing that never occurred, in a trail that is billing evidence.
// ===========================================================================
test("#960 cell 5 · a non-positive cap and a call naming no cap at all are typed refusals", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("malformed");
  await setLimits(scene.owner, { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 });

  for (const cap of CAPS) {
    for (const bad of [0, -1]) {
      const err = await assertRaises("CLR10",
        () => setLimits(scene.owner, { [cap]: bad }), `${cap} = ${bad}`);
      assert.equal(JSON.parse(err.detail ?? "{}").reason, "invalid_cap",
        `${cap} = ${bad}: the refusal is typed`);
      assert.ok(err.message.includes(cap), `${cap} = ${bad}: the refusal names the cap`);
    }
  }

  const empty = await assertRaises("CLR10", () => setLimits(scene.owner, {}), "no cap named");
  assert.equal(JSON.parse(empty.detail ?? "{}").reason, "no_cap_named");

  const row = await storedRow(scene.firm);
  assert.deepEqual(
    { docs_per_day: row.docs_per_day, pages_per_day: row.pages_per_day,
      ocr_concurrency: row.ocr_concurrency, llm_witness_concurrency: row.llm_witness_concurrency },
    { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 },
    "nine refusals later the stored row is exactly what the one accepted call left");
  assert.equal((await auditRows(scene.firm)).length, 1, "a refused call writes no audit row");
  executed += 1;
});

// ===========================================================================
// CELL 6 — EVERY IDENTITY BELOW THE FIRM'S ADMIN FLOOR IS REFUSED WITH A TYPED ERROR, and the
// row does not move.
//
// THIS CELL PINS RATHER THAN DRIVES, and says so: the floor is `clara._human_ctx(
// clara.role_rank('admin'))`, the estate's shared preamble, so the refusal was there the moment
// the door was. What the cell is worth is the proof that THIS door actually carries that
// preamble — a door that read `clara.jwt_firm()` directly instead would be green everywhere
// else in this battery and open here.
//
// THE CROSS-FIRM CASE IS STRUCTURAL, NOT A CHECK: the door has no `p_firm` argument at all, so
// another firm's admin can only ever write their OWN firm's caps. The cell proves the shape —
// a second firm's owner writes and only their own row moves — rather than probing for a wall
// that would have to exist if the argument did.
// ===========================================================================
test("#960 cell 6 · bookkeeper, viewer and a stranger are refused; another firm's admin reaches only their own row", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("floor", ["admin", "bookkeeper", "viewer"]);
  await setLimits(scene.members.admin, { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 });

  for (const role of ["bookkeeper", "viewer"]) {
    const err = await assertRaises("CLR04",
      () => setLimits(scene.members[role], { docs_per_day: 999 }), `${role} write`);
    assert.equal(err.message, "insufficient role", `${role}: the estate's own sentence, verbatim`);
  }

  // A person with no membership anywhere: refused at the same door, for the other reason.
  const stranger = await insertUser(P960, "floor_stranger");
  const err = await assertRaises("CLR04",
    () => setLimits(stranger, { docs_per_day: 999 }), "stranger write");
  assert.equal(err.message, "actor has no active membership");

  const row = await storedRow(scene.firm);
  assert.equal(row.docs_per_day, 11, "three refusals later the cap has not moved");
  assert.equal((await auditRows(scene.firm)).length, 1, "a refused call writes no audit row");

  // ANOTHER FIRM'S OWNER writes their own caps; this firm's row is untouched.
  const other = await firmScene("floor_other");
  await setLimits(other.owner, { docs_per_day: 55 });
  assert.equal((await storedRow(other.firm)).docs_per_day, 55);
  assert.equal((await storedRow(scene.firm)).docs_per_day, 11, "the first firm's caps did not move");
  executed += 1;
});

// ===========================================================================
// CELL 7 — THE RECEIPT IS DURABLE AND THE OP KEY MEANS WHAT IT MEANS.
//
// Three facts, and the third is the one this door has to add for itself:
//  (a) the SAME op_key with the SAME caps returns the ORIGINAL receipt, byte for byte, and
//      writes no second audit row — clara._reserve_op / _finish_op's contract, pinned here
//      because a door that re-derived a receipt instead of returning the stored one would look
//      identical on the happy path and lie on a retry;
//  (b) a NEW op_key at values the firm already holds is ACCEPTED, with `changed: []` — an
//      admin's re-affirmation is a receipt worth having (clara.set_firm_high_stakes_threshold's
//      own header says so), and the audit row records that nothing moved rather than inventing
//      a change;
//  (c) the SAME op_key with DIFFERENT caps is a typed refusal. `_reserve_op` raises an UNTYPED
//      CLR10 there ("op_key reused with different args", 0004), which carries no detail.reason
//      for a surface to branch on — so this door wraps it, exactly as
//      clara.set_legal_enforcement_mode (0234) does for the same reason.
// ===========================================================================
test("#960 cell 7 · the same op key replays its receipt, a new one re-affirms, a reused one with different caps is typed", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("opkey");
  const key = opk("p960_replay");

  const first = await setLimits(scene.owner, { docs_per_day: 42 }, { opKey: key });
  const replay = await setLimits(scene.owner, { docs_per_day: 42 }, { opKey: key });
  assert.deepEqual(replay, first, "the replay is the ORIGINAL receipt, not a fresh derivation");
  assert.equal((await auditRows(scene.firm)).length, 1, "a replay writes no second audit row");

  const again = await setLimits(scene.owner, { docs_per_day: 42 });
  assert.deepEqual(again.changed, [], "a re-affirmation changes nothing, and says so");
  assert.equal(again.caps.docs_per_day, 42);
  const rows = await auditRows(scene.firm);
  assert.equal(rows.length, 2, "a re-affirmation under a NEW op key is still receipted");
  assert.deepEqual(rows[0].args.changes, {}, "...and records that nothing moved");

  const err = await assertRaises("CLR10",
    () => setLimits(scene.owner, { docs_per_day: 43 }, { opKey: key }), "op key reused");
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "op_key_conflict",
    "the reuse refusal is typed, not _reserve_op's bare CLR10");
  assert.equal((await storedRow(scene.firm)).docs_per_day, 42, "and nothing was written");
  executed += 1;
});

// ===========================================================================
// CELL 8 — THE READ SIDE IS UNCHANGED BY THIS TICKET, in both directions.
//
// #635's card renders a firm with no stored row as a NAMED ZERO — not as the relation's
// first-insert values — because "a number nobody stored is not that firm's cap"
// (processing-capacity-card.tsx's own header, and 0233's `capacity` object, which reports the
// four columns raw). #960 adds a writer; it does NOT change that, and this cell is the proof
// from the door the card actually calls rather than from the card's own props.
//
// The second half is the other direction: once the firm HAS written, the same read reports the
// stored numbers, so the card's control and the card's figures cannot disagree.
// ===========================================================================
test("#960 cell 8 · a firm with no row still reads as four nulls, and reads its own numbers after the first write", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("read_side");

  const before = await commercialState(scene.owner);
  assert.deepEqual(before.capacity, {
    docs_per_day: null, pages_per_day: null, ocr_concurrency: null,
    llm_witness_concurrency: null, source: "firm_document_limits",
  }, "no stored row is four nulls -- never the relation's first-insert values");

  await setLimits(scene.owner, { docs_per_day: 250, ocr_concurrency: 5 });

  const after = await commercialState(scene.owner);
  assert.deepEqual(after.capacity, {
    docs_per_day: 250,
    pages_per_day: FIRST_INSERT.pages_per_day,
    ocr_concurrency: 5,
    llm_witness_concurrency: FIRST_INSERT.llm_witness_concurrency,
    source: "firm_document_limits",
  }, "after the first write the card's own read reports the stored four");
  executed += 1;
});

// ===========================================================================
// CELL 9 — THE CATALOG CENSUS. A structural cell, and the repo's own documented standard for a
// migration that opens a new writer onto a relation that had none (work order rule 4's
// "catalog census / prestate pin / tail assertion" carve-out). Four claims:
//
//  (a) EVERY DOOR THAT ENFORCES A CAP IS BYTE-IDENTICAL to the pre-image measured on this rig
//      before 0270 applied. The brief's last acceptance criterion is "every door enforcing a cap
//      keeps its existing fallback when no row exists", and the honest proof of "keeps" is that
//      the bodies did not move at all — each of them still reads
//      `coalesce(l.<cap>, <fallback>)` off a LEFT JOIN, so a firm with no row is unaffected by
//      this ticket in either direction.
//  (b) THE TABLE'S GRANT MATRIX IS UNMOVED: SELECT to clara_authenticated and nothing else to
//      any application role. #960's out-of-scope list says the read grant is not narrowed; this
//      says it is not WIDENED either. The door writes as `clara_fn_owner` inside a SECURITY
//      DEFINER body, which is the whole point: the relation stays unwritable from outside.
//  (c) THE DOOR IS GRANTED TO clara_authenticated AND NOBODY ELSE, and its posture is the
//      estate's (owner clara_fn_owner, SECURITY DEFINER, pinned search_path). The role floor is
//      INSIDE the body (cell 6), never on the grant.
//  (d) THE ESTATE'S CEILING IS GRANTED TO NOBODY, which is what "no firm can raise it" means
//      structurally.
// ===========================================================================
test("#960 cell 9 · the enforcing doors are unmoved, and the new surface is exactly one granted door", async (t) => {
  if (gate(t)) return;

  // (a) The pre-images, MEASURED on this rig before 0270 applied and transcribed here.
  //
  // RE-MEASURED AT INTEGRATION (wave 2, 2026-09-20). Four of these nine are recut EARLIER in
  // merged chain order by 0252 (#964, lane 05 — the Asia/Kuala_Lumpur ingest window), which
  // lane 10 never had on its own database: _reserve_document_ingest,
  // _resize_document_reservation, _settle_document_reservation and settle_ingest_reservation.
  // The cell's claim is unchanged — 0270 must not move a body that enforces a cap — so the four
  // pins now name what 0252 leaves live, exactly as migration 0270's own prestate/tail arrays
  // do. A flat re-measure (rather than the two-generation shape intake-batch.test.mjs uses) is
  // right here because this battery gates on 0270, and no chain can carry 0270 without 0252:
  // 0252 is lower in the same ordered chain. The other five are untouched by any wave-2
  // migration and keep the values lane 10 measured.
  const PINS = {
    "clara._reserve_document_ingest(uuid,uuid,integer,timestamp with time zone)":
      "32a42ca3de5c3f4de81971530430ceffe4f763eb9ed2b7e215941c8a94e70400",
    "clara._reserve_processing_call(uuid,integer)":
      "a713fa374a9069e08862a5a234ad0df6f5303a4223de3bdaaeafc99ae4358043",
    "clara._resize_document_reservation(uuid,uuid,integer)":
      "865f01a0c1094caf82efe9b9fec8b3bc4d611d1266be26058a42e9d8b60cc622",
    "clara._settle_document_reservation(uuid,uuid,integer)":
      "c96f43c0d5e4acec8871012044f3c4763f7af13b139b91ba7f3cede26f4b7d00",
    "clara._settle_processing_call(uuid,integer)":
      "e8b50f0d10da45be4caf6e278248750a4b1e862148dc879fbe38e7a5b4a02408",
    "clara._tf_firm_document_limits_upsert()":
      "e07fabd4e475ae29ac8b5fa6a4f8477f72698df26110bfe8d4f3e456aa1f8eb2",
    // RE-MEASURED AGAIN (wave 4, 2026-09-24), AND THEN ONCE MORE IN THE SAME LANE (fix round,
    // finding SPEC-04). #945's 0296 recuts this body for the payroll_facts lane — the kill
    // switch, the per-lane attempt cap, the lane-true cap emit and the per-lane concurrency
    // window — and #948's 0299 recuts it AGAIN for the contract_facts lane, which the first
    // re-base missed: the pin named 0296's post-image and the head carried 0299's. The claim
    // here is "0270 must not move a body that enforces a cap", and 0270 still does not; the pin
    // names what the ordered chain leaves live at this frontier, exactly as the four 0252-recut
    // pins above already do. Both 0296 and 0299 are higher in the same ordered chain than 0270,
    // and they are consecutive files in it, so the post-0296 / pre-0299 body is not a state a
    // database rests in and one flat value is right rather than a generation ladder.
    "clara.claim_document_processing_task(uuid,text,boolean)":
      "16b4d47bd62bf827ca310b143275592759e1b1369ca212fa70666eed964c9c64",
    "clara.get_firm_commercial_state()":
      "347141ee22b52c125ff845451051f03354f1f0e9d57cc43d759253f3273ed19e",
    "clara.settle_ingest_reservation(uuid,integer,text)":
      "0cb7be8fd77bc076c395d22cf282dc345a0636998c46a37787d51d015d18bb75",
  };
  for (const [fn, sha] of Object.entries(PINS)) {
    const r = await rootQuery(
      "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure",
      [fn]);
    assert.equal(r.rows[0]?.sha, sha, `${fn} MOVED -- 0270 must not touch a body that enforces a cap`);
  }
  // NOT VACUOUS: the same probe must disagree for a body 0270 DID write.
  const own = await rootQuery(
    "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure",
    ["clara.set_firm_document_limits(int,int,int,int,text)"]);
  assert.ok(own.rows[0]?.sha && !Object.values(PINS).includes(own.rows[0].sha),
    "the probe cannot tell a moved body from an unmoved one");

  // (b) The table's application-role grant matrix.
  const grants = await rootQuery(
    `select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type collate "C"), '') as m
       from information_schema.role_table_grants
      where table_schema = 'clara' and table_name = 'firm_document_limits'
        and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive','PUBLIC')`);
  assert.equal(grants.rows[0].m, "clara_authenticated:SELECT",
    "0270 neither narrowed nor widened the relation's own grants");

  // (c) + (d) the two new routines' posture and ACL.
  const acl = await rootQuery(
    `select p.oid::regprocedure::text as n,
            pg_get_userbyid(p.proowner) || ' | ' || p.prosecdef::text || ' | '
              || coalesce(array_to_string(p.proconfig, ','), '<none>') || ' | '
              || coalesce(array_to_string(p.proacl, ','), '<null>') as posture
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.proname in ('set_firm_document_limits', '_firm_document_limit_ceiling')
      order by 1`);
  assert.deepEqual(acl.rows.map((r) => `${r.n} :: ${r.posture}`), [
    "clara._firm_document_limit_ceiling(text) :: clara_fn_owner | false | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner",
    "clara.set_firm_document_limits(integer,integer,integer,integer,text) :: clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner",
  ], "exactly one granted door, granted to clara_authenticated alone; the estate's ceiling is granted to nobody");
  executed += 1;
});

// ===========================================================================
// CELL 10 — A CAP SET BACK TO A NUMBER IT ONCE HELD IS A **NEW** CHANGE, and the operation
// identity has to be able to say so.
//
// WHY THIS CELL EXISTS (adversarial review ADV-L10-01 / spec review S-960-1, 2026-09-20). The
// door itself was never wrong; the WEB layer minted a key that was a pure function of the caller
// and the four values, so the third call below re-minted the key of the first and
// `clara._reserve_op` replayed its receipt: no write, no audit row, and a card rendering
// "Saved … 8" over a stored 2. This cell pins BOTH halves from the door's own side, so the
// hazard is measured here and not only in a web cell:
//
//   (a) under FRESH keys the set → change → set-back sequence MOVES the row every time and
//       receipts each move with its true before-image;
//   (b) under the REPEATED key the same third call is a silent no-op that hands back the FIRST
//       receipt byte for byte — which is exactly what a caller must never mint, and is the
//       vacuity control for (a): the assertions in (a) genuinely fail if the caller reuses a key.
// ===========================================================================
test("#960 cell 10 · setting a cap back to a number it once held is a NEW change under a fresh key, and a REPEATED key silently re-serves the first receipt", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("reset_back");
  const first = opk("p960_back_1");

  const r1 = await setLimits(scene.owner, { ocr_concurrency: 8 }, { opKey: first });
  assert.equal(r1.caps.ocr_concurrency, 8);
  const r2 = await setLimits(scene.owner, { ocr_concurrency: 2 }, { opKey: opk("p960_back_2") });
  assert.equal(r2.caps.ocr_concurrency, 2);
  assert.equal(r2.previous.ocr_concurrency, 8, "the second change's before-image is the first's value");

  // (a) THE SAME EDIT AGAIN, under a key of its own.
  const r3 = await setLimits(scene.owner, { ocr_concurrency: 8 }, { opKey: opk("p960_back_3") });
  assert.deepEqual(r3.changed, ["ocr_concurrency"], "the third call moved a cap, and says which");
  assert.equal(r3.previous.ocr_concurrency, 2, "...from where the SECOND call left it, not from nothing");
  assert.equal(r3.created, false, "...on a row that already existed");
  assert.equal((await storedRow(scene.firm)).ocr_concurrency, 8, "...and the stored cap actually moved");
  assert.equal((await auditRows(scene.firm)).length, 3,
    "three genuine changes leave three audit rows -- this trail is usage-billing evidence");

  // (b) THE TRAP, measured. Nothing is written and the ORIGINAL receipt comes back.
  const replayed = await setLimits(scene.owner, { ocr_concurrency: 8 }, { opKey: first });
  assert.deepEqual(replayed, r1, "a repeated key re-serves the FIRST receipt, not a fresh one");
  assert.equal(replayed.previous.ocr_concurrency, null,
    "...including its before-image, which by now names a state two changes old");
  assert.equal((await storedRow(scene.firm)).ocr_concurrency, 8, "and nothing moved");
  assert.equal((await auditRows(scene.firm)).length, 3, "and no fourth audit row was written");
  executed += 1;
});

// ===========================================================================
// CELL 11 — THE CLR13 `operation_in_flight` ARM, OBSERVED.
//
// WHY THIS CELL EXISTS (adversarial review ADV-L10-06, 2026-09-20). The reviewer measured that
// two real sessions racing ONE key never reach this arm: `clara._reserve_op`'s speculative
// `on conflict do nothing` BLOCKS the second session until the first commits, and by then the
// row carries its `_finish_op` result — so the second replays a settled receipt. The arm was
// therefore documented (the migration's §D census, this module's refusal map, the successor
// contract) but never observed, and a refusal nobody can see should not be handed to a future
// tool author as one it must handle.
//
// IT IS NOT DROPPED, and the reason is the shared helper's own contract rather than this door's
// taste: `clara._reserve_op` (0004:46-59) SYNTHESISES `{"pending": true}` for any committed
// receipt row whose `result` is still null, and EIGHTEEN migration files in this estate answer
// that with exactly this CLR13 — 0178, 0180, 0182, 0184, 0185, 0186, 0193, 0194, 0195, 0200 and
// the rest (`grep -rln operation_in_flight packages/db/migrations`). A door that dropped the arm
// would RETURN `{"pending": true}` to the caller as if it were a receipt, which is strictly
// worse than a typed refusal and would make this the one governed door in the estate that does.
//
// SO THE ARM IS PROVED INSTEAD, from a receipt row arranged as root. That row is a PRESTATE, not
// a side channel: the observation below is the DOOR's own refusal, through the same human
// session every other cell uses. The request hash is built the way §B builds it, so the call
// gets past `_reserve_op`'s "reused with different args" wall and reaches the pending arm.
// ===========================================================================
test("#960 cell 11 · a committed receipt row with no result yet is refused CLR13 operation_in_flight", async (t) => {
  if (gate(t)) return;
  const scene = await firmScene("in_flight");
  const key = opk("p960_in_flight");

  // The reservation §B would have made, WITHOUT the `_finish_op` that always follows it in one
  // transaction. `clara._hash(jsonb_build_object(...))` is the door's own expression, with the
  // four cap arguments in its own order and the actor last.
  await rootQuery(
    `insert into clara.op_receipts(firm_id, fn, op_key, request_hash)
     values ($1, 'set_firm_document_limits', $2,
       clara._hash(jsonb_build_object(
         'docs_per_day', 33, 'pages_per_day', null::int, 'ocr_concurrency', null::int,
         'llm_witness_concurrency', null::int, 'actor', $3::uuid)))`,
    [scene.firm, key, scene.owner],
  );

  const err = await assertRaises("CLR13",
    () => setLimits(scene.owner, { docs_per_day: 33 }, { opKey: key }), "already being recorded");
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "operation_in_flight",
    "the in-flight refusal is TYPED, so a surface branches on the reason and never on the sentence");
  assert.equal(await storedRow(scene.firm), null, "and the refusal wrote nothing");
  assert.equal((await auditRows(scene.firm)).length, 0, "and left no audit row");
  executed += 1;
});
