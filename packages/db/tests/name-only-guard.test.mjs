// THE NAME-ONLY CUSTOMER GUARD rig -- cells for 0062_rs_name_only_guard.sql, the DB-side
// discharge of AGENTS.md hard constraint 12 ("ROME SECRETARY's customers are NAME-ONLY -- never
// enrich them with a registration number or a TIN").
//
// WHAT IS UNDER TEST -- the ruling's TWO halves, which ship as two migrations that must land in
// order and are probed separately here so a partial apply names itself:
//   NOG-1..13  THE WALL (0062_rs_name_only_guard.sql) -- a BEFORE INSERT OR UPDATE trigger
//              on clara.counterparties refusing a registration number or a TIN for a
//              CUSTOMER-kind counterparty of a client whose LIVE customer_identity_policy is
//              'name_only'.
//   NOG-14..17 THE FLOOR (0063_rs_name_only_lift_floor.sql, finding B5) -- a BEFORE INSERT
//              trigger on clara.client_facts making the LIFT of that policy an OWNER act, while
//              arming and re-arming stay admin+ and every other fact key is untouched.
//
// THIS FILE NEVER TOUCHES ROME SECRETARY, and that is the point. The guard's identity is a
// RECORDED FACT, not a name (standing law 27.3), so the cells build their OWN flagged client out
// of buildWorld()'s fixture firm and arm it through the audited door. On a throwaway rig the
// real client does not exist; a battery that depended on it would be permanently skipped, which
// is a false green. Everything proven here is proven against fixtures this file created --
// including its own ADMIN member, because the B5 ruling turns on admin-vs-owner.
//
// CONTRACT-BLIND on the migration files: readiness is probed off the LIVE catalog (pg_trigger,
// pg_proc, clara.client_fact_keys), never by reading the .sql.
//
// B7 -- THE ABSENT-MIGRATION POLARITY. A FOCUSED run FAILS when the objects are absent; only the
// package-wide sweep, which preloads tests/rs-guard-preintegration-gate.mjs and thereby sets
// CLARA_ALLOW_MISSING_RS_GUARD, skips (loudly, counted). Before that gate existed these cells
// skipped unconditionally, so a migration that was never applied, was misnumbered, or was
// silently reverted read as GREEN.
//
// EVERY REFUSAL IS ASSERTED BY ITS OWN NAME, never by "some error happened" (standing law: a test
// must be able to fail). assertNameOnly/assertLiftFloor require the exact SQLSTATE AND a parseable
// JSON detail whose `reason` is the guard's own token. A unique-index violation, an RLS denial, or
// the pre-existing 0011 mutation wall all fail those assertions -- which is what makes the passing
// cells evidence rather than decoration.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool,
  noteLane, printLaneNotes, markSkip, printSkipCount,
  waveAEnsureReady, buildWorld, createClient, renameCounterparty,
  insertUser, addMember,
} from "./wave-a-fixtures.mjs";
import {
  POLICY_KEY, tag, probeHalves, createCounterparty, recordFact, recordPolicy,
  caught, counterpartyRow, livePolicy,
  assertNameOnly, assertLiftFloor, assertNotThisGuard,
} from "./name-only-guard-fixtures.mjs";

let ready = false;
let hasWall = false;   // 0062_rs_name_only_guard.sql
let hasFloor = false;  // 0063_rs_name_only_lift_floor.sql
let world = null;
let owner = null;      // firm A's OWNER -- rank 3; the only rank that may LIFT
let adm = null;        // an ADMIN minted by this file -- rank 2; may ARM, may not LIFT
let keeper = null;     // firm A's BOOKKEEPER -- rank 1, below record_client_fact's floor
let flagged = null;    // the client this file arms
let unflagged = null;  // its control, same firm, never armed

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- the name-only guard suite cannot build its world"); return; }
  ({ hasWall, hasFloor } = await probeHalves());
  if (!hasWall) { noteLane("the enrichment wall (0062_rs_name_only_guard.sql) is NOT applied"); return; }
  if (!hasFloor) noteLane("the lift floor (0063_rs_name_only_lift_floor.sql) is NOT applied -- NOG-14..17 cannot run");
  world = await buildWorld();
  owner = world.users.alice;
  keeper = world.users.bob;
  flagged = world.clients.A1;
  unflagged = world.clients.A2;
  // An ADMIN of the same firm, minted here because buildWorld's roster is owner/bookkeeper/viewer
  // and the B5 ruling turns on exactly the admin-vs-owner distinction.
  adm = await insertUser(world.prefix, "nogadmin");
  await addMember(owner, { firm: world.firms.A, user: adm, role: "admin", opKey: opk("nog-mem") });
  // ARMED THROUGH THE DOOR, never by a hand-written row, and BY THE ADMIN -- which is itself the
  // proof that arming stays admin+ under the new floor.
  await recordPolicy(adm, { client: flagged, value: "name_only", basis: "rig: arm the flagged client" });
});

after(async () => {
  printLaneNotes("name-only-guard");
  printSkipCount("name-only-guard");
  await endPool();
});

/**
 * B7 PRE-INTEGRATION POLARITY. A FOCUSED run (no --import gate) FAILS when the objects are
 * absent; only the gated package-wide sweep skips. Before this existed the battery skipped
 * unconditionally, so a migration that was never applied, was misnumbered, or was silently
 * reverted read as GREEN -- the exact false-green .claude/rules/db-tests.md warns about.
 */
function requirePresent(t, present, what) {
  if (ready && present) return false;
  const missing = !ready ? "the 0011 counterparty surface" : what;
  if (process.env.CLARA_ALLOW_MISSING_RS_GUARD === "1") {
    console.warn(`SKIP name-only guard: ${missing} is absent on this database (explicit pre-integration run).`);
    markSkip();
    t.skip(`${missing} not applied -- explicit pre-integration run`);
    return true;
  }
  assert.fail(`${missing} is required for a focused or post-migration run: apply 0062_rs_name_only_guard.sql then 0063_rs_name_only_lift_floor.sql (numbered, in that order), or set CLARA_ALLOW_MISSING_RS_GUARD=1 for the package-wide pre-integration sweep`);
  return true;
}

const gate = (t) => requirePresent(t, hasWall, "the RS name-only enrichment wall");
const gateFloor = (t) => requirePresent(t, hasWall && hasFloor, "the RS name-only OWNER lift floor");

// ---------------------------------------------------------------------------
// NOG-1..3 -- THE REFUSALS. The enrichment vector is INSERT (0011's whitelist already blocks
// every UPDATE of these columns), so the birth door is where the guard earns its keep.
// ---------------------------------------------------------------------------

test("NOG-1 a CUSTOMER of a flagged client cannot be born with a REGISTRATION NUMBER", async (t) => {
  if (gate(t)) return;
  const err = await caught(() => createCounterparty(owner, {
    client: flagged, kind: "customer", name: `NOG1 BUYER ${tag()} SDN BHD`,
    registration: "202501099001",
  }));
  assertNameOnly(err, "NOG-1");
  // AND NOTHING LANDED. A BEFORE trigger that raises rolls the statement back, but "the door
  // raised" and "no row exists" are two claims and only one of them was just proven.
  const left = await rootQuery(
    "select count(*)::int as n from clara.counterparties where client_id = $1 and registration_normalized = $2",
    [flagged, "202501099001"],
  );
  assert.equal(left.rows[0].n, 0, "NOG-1: the refused counterparty must not exist");
});

test("NOG-2 a CUSTOMER of a flagged client cannot be born with a TIN", async (t) => {
  if (gate(t)) return;
  const err = await caught(() => createCounterparty(owner, {
    client: flagged, kind: "customer", name: `NOG2 BUYER ${tag()} SDN BHD`,
    tin: "C99887766000",
  }));
  assertNameOnly(err, "NOG-2");
});

test("NOG-3 registration AND tin together is still one refusal, by the same reason", async (t) => {
  if (gate(t)) return;
  const err = await caught(() => createCounterparty(owner, {
    client: flagged, kind: "customer", name: `NOG3 BUYER ${tag()} SDN BHD`,
    registration: "202501099003", tin: "C99887766003",
  }));
  assertNameOnly(err, "NOG-3");
});

// ---------------------------------------------------------------------------
// NOG-4..6 -- THE PASSES. A guard is only as good as what it does NOT refuse; each of these
// would be a production outage if the predicate were written one clause too wide.
// ---------------------------------------------------------------------------

test("NOG-4 a NAME-ONLY customer of a flagged client is born normally", async (t) => {
  if (gate(t)) return;
  const receipt = await createCounterparty(owner, {
    client: flagged, kind: "customer", name: `NOG4 BUYER ${tag()} SDN BHD`,
  });
  assert.ok(receipt?.counterparty_id, "NOG-4: a name-only customer must still be creatable");
  const row = await counterpartyRow(receipt.counterparty_id);
  assert.equal(row.kind, "customer");
  assert.equal(row.registration_no, null, "NOG-4: born without a registration");
  assert.equal(row.tin, null, "NOG-4: born without a TIN");
});

test("NOG-5 a VENDOR of the SAME flagged client CAN carry a registration -- out of scope, proven", async (t) => {
  if (gate(t)) return;
  const reg = `2025010${Math.floor(Math.random() * 90000) + 10000}`;
  const receipt = await createCounterparty(owner, {
    client: flagged, kind: "vendor", name: `NOG5 SUPPLIER ${tag()} SDN BHD`, registration: reg,
  });
  assert.ok(receipt?.counterparty_id, "NOG-5: a vendor birth must not be refused");
  const row = await counterpartyRow(receipt.counterparty_id);
  assert.equal(row.kind, "vendor");
  assert.equal(row.registration_no, reg,
    "NOG-5: the vendor kept its registration -- the AP identity lane depends on exactly this");
});

test("NOG-6 an UNFLAGGED client's customer CAN be enriched -- the scope is the flag, not the world", async (t) => {
  if (gate(t)) return;
  const reg = `2025020${Math.floor(Math.random() * 90000) + 10000}`;
  const receipt = await createCounterparty(owner, {
    client: unflagged, kind: "customer", name: `NOG6 BUYER ${tag()} SDN BHD`,
    registration: reg, tin: "C11223344000",
  });
  assert.ok(receipt?.counterparty_id, "NOG-6: an unflagged client's customer birth must not be refused");
  const row = await counterpartyRow(receipt.counterparty_id);
  assert.equal(row.registration_no, reg, "NOG-6: the registration landed");
  assert.equal(row.tin, "C11223344000", "NOG-6: the TIN landed");
});

// ---------------------------------------------------------------------------
// NOG-7..9 -- THE UPDATE ARM.
//
// TRUED 2026-09-04 (H-09 / 裁-190, 0174_web_reads_and_small_doors.sql). This block's
// original comment read: "Today clara._tf_counterparty_update_0011's whitelist already refuses
// every UPDATE of these columns, for every client ... no product verb can reach this path -- that
// is the finding, not a shortcut." BOTH halves of that have now changed, and they changed BY
// DESIGN rather than by drift, which is why the cells move with them (.claude/rules/db-tests.md:
// a floor pinned to a catalog object a later migration retires is trued IN THE SAME PR):
//   * the non-merge whitelist widened a SECOND time -- exactly the possibility the old comment
//     itself flagged -- and now admits registration_no / registration_normalized / tin, so the
//     0011 immutability wall no longer refuses these UPDATEs for an unflagged client;
//   * a product verb DOES now reach this path: clara.set_counterparty_identifiers (admin floor).
// WHAT DID NOT CHANGE, and is what these cells are actually for: 0062's guard is still the wall
// for a FLAGGED client, it still sorts BEFORE the 0011 trigger, and its named reason is still the
// one a caller sees. The AUTHORIZATION wall was never this trigger and still is not -- no
// application role holds UPDATE on clara.counterparties (0009:2879 grants SELECT and nothing
// else), which NOG-8 now asserts positively instead of leaning on the immutability refusal.
// These cells still drive the UPDATE directly as root, because root is the only principal that
// can reach the raw statement at all.
// ---------------------------------------------------------------------------

test("NOG-7 UPDATE enriching a flagged client's existing customer is refused BY THIS GUARD", async (t) => {
  if (gate(t)) return;
  const receipt = await createCounterparty(owner, {
    client: flagged, kind: "customer", name: `NOG7 BUYER ${tag()} SDN BHD`,
  });
  const err = await caught(() => rootQuery(
    `update clara.counterparties
        set registration_no = '202501099007', registration_normalized = '202501099007'
      where id = $1`,
    [receipt.counterparty_id],
  ));
  // The 0011 wall would answer CLR08 'illegal counterparty mutation' with no detail. Requiring
  // the guard's own reason is therefore also the proof that it fires FIRST.
  assertNameOnly(err, "NOG-7");
  const row = await counterpartyRow(receipt.counterparty_id);
  assert.equal(row.registration_no, null, "NOG-7: the row is unchanged");
});

/** The H-09 cohort's CATALOG witness (.claude/rules/db-tests.md's succession pattern): an EXACT
 *  signature via to_regprocedure, never a bare name — the door is UNNUMBERED until merge prep
 *  (裁-108) and a migration-stem witness does not exist until the number is claimed, so the
 *  catalog is the only stable half of the pattern available here. Both limbs below keep their
 *  PRE-cohort assertion on the other branch rather than skipping, so this file says something
 *  true on every chain instead of going quiet on half of them. */
async function identifiersDoorLanded() {
  const r = await rootQuery(
    "select to_regprocedure('clara.set_counterparty_identifiers(uuid,uuid,text,text,text)') is not null as ok");
  return r.rows[0].ok;
}

test("NOG-8 UPDATE enriching an UNFLAGGED client's customer is NOT refused by this guard — and on a pre-H-09 chain the 0011 wall is what stops it", async (t) => {
  if (gate(t)) return;
  const landed = await identifiersDoorLanded();
  const receipt = await createCounterparty(owner, {
    client: unflagged, kind: "customer", name: `NOG8 BUYER ${tag()} SDN BHD`,
  });
  const err = await caught(() => rootQuery(
    `update clara.counterparties
        set registration_no = '202501099008', registration_normalized = '202501099008'
      where id = $1`,
    [receipt.counterparty_id],
  ));
  // THE ONE PROPERTY THIS CELL HAS ALWAYS BEEN FOR, and it holds on BOTH branches: whatever
  // happens to an UNFLAGGED client's customer, it is not THIS guard's doing.
  if (err) assertNotThisGuard(err, "NOG-8");

  if (!landed) {
    // PRE-COHORT: the 0011 immutability whitelist still refuses the column write outright.
    assert.equal(err?.code, "CLR08",
      `NOG-8: expected 0011's CLR08 immutability wall on a pre-H-09 chain (got ${err?.code} -- ${err?.message})`);
    const row = await counterpartyRow(receipt.counterparty_id);
    assert.equal(row.registration_no, null, "NOG-8: the row is unchanged on a pre-H-09 chain");
    return;
  }

  // POST-COHORT: H-09 widened the whitelist, so the write LANDS — which makes the cell
  // discriminating in a way the old CLR08 assertion no longer could: a guard that had started
  // firing on unflagged clients would now show up as a refusal here rather than as a
  // differently-spelled refusal that still looked like the wall doing its job.
  assert.equal(err, null,
    `NOG-8: an unflagged client's customer may be enriched (got ${err?.code} -- ${err?.message})`);
  const row = await counterpartyRow(receipt.counterparty_id);
  assert.equal(row.registration_no, "202501099008", "NOG-8: the registration landed");

  // THE AUTHORIZATION WALL, ASSERTED POSITIVELY. The immutability whitelist was never what kept
  // an application role out of this statement, and now that it admits the column the distinction
  // has to be proven rather than implied: clara.counterparties carries SELECT and nothing else
  // for every non-owner role, so the only reachable writer is a SECURITY DEFINER door.
  const grants = await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'clara' and table_name = 'counterparties'
        and grantee not in ('clara_fn_owner', 'postgres')
        and privilege_type <> 'SELECT'`,
  );
  assert.equal(grants.rowCount, 0,
    `NOG-8: an application role gained a non-SELECT grant on clara.counterparties: ${JSON.stringify(grants.rows)}`);
});

test("NOG-9 an ordinary RENAME of a flagged client's customer still succeeds", async (t) => {
  if (gate(t)) return;
  const receipt = await createCounterparty(owner, {
    client: flagged, kind: "customer", name: `NOG9 BUYER ${tag()} SDN BHD`,
  });
  const newName = `NOG9 RENAMED ${tag()} SDN BHD`;
  await renameCounterparty(owner, { client: flagged, counterparty: receipt.counterparty_id, newName });
  const row = await counterpartyRow(receipt.counterparty_id);
  assert.equal(row.name, newName,
    "NOG-9: the guard must not strand ordinary maintenance on the rows it protects");
});

// ---------------------------------------------------------------------------
// NOG-10 -- THE ALREADY-ENRICHED ROW. A client can acquire the policy AFTER a customer was
// enriched (that is exactly the state the live census warns about), so both limbs need proving
// on a row that really does carry an identifier: CHANGING it is refused by this guard, and
// CLEARING it is not. The fixture arms the client AFTER the birth, which is the only order that
// can produce such a row through the product's own door.
// ---------------------------------------------------------------------------

test("NOG-10 on an already-enriched customer: CHANGING the registration is refused, CLEARING is not", async (t) => {
  if (gate(t)) return;
  const late = await createClient(owner, { name: `nog_late_${tag()}`, opKey: opk("nog-cli") });
  const born = await createCounterparty(owner, {
    client: late, kind: "customer", name: `NOG10 BUYER ${tag()} SDN BHD`,
    registration: "202501099010",
  });
  assert.ok(born?.counterparty_id, "NOG-10: the pre-policy birth must succeed (the client is not armed yet)");
  await recordPolicy(owner, { client: late, value: "name_only", basis: "rig: arm AFTER the enriched birth" });

  // (a) value -> DIFFERENT value is an enrichment, and this guard refuses it.
  const changed = await caught(() => rootQuery(
    `update clara.counterparties
        set registration_no = '202501099099', registration_normalized = '202501099099'
      where id = $1`,
    [born.counterparty_id],
  ));
  assertNameOnly(changed, "NOG-10(a)");

  // (b) value -> NULL is the REMEDY, not an enrichment. TRUED 2026-09-04 (H-09 / 裁-190): this
  // limb used to be able to assert only "whatever stopped it, it was not this guard", because
  // 0011's whitelist refused the column write for its own unrelated reason. The whitelist now
  // admits the three identifier columns, so the remedy can be shown SUCCEEDING END TO END --
  // which is what the limb always wanted to prove and could not. A cleared registration is the
  // fix for a mistyped one, and a guard that blocked the fix would strand the very rows it
  // protects.
  const cleared = await caught(() => rootQuery(
    "update clara.counterparties set registration_no = null, registration_normalized = null where id = $1",
    [born.counterparty_id],
  ));
  if (cleared) assertNotThisGuard(cleared, "NOG-10(b)");

  if (!(await identifiersDoorLanded())) {
    // PRE-COHORT: 0011's whitelist refuses the column write for its own unrelated reason, so the
    // limb can assert exactly what it always could and no more — whatever stopped it, it was not
    // this guard, and the row is untouched.
    const row = await counterpartyRow(born.counterparty_id);
    assert.equal(row.registration_no, "202501099010",
      "NOG-10(b): on a pre-H-09 chain the original registration is untouched");
    return;
  }

  // POST-COHORT: the whitelist now admits the three identifier columns, so the remedy can be
  // shown SUCCEEDING END TO END — which is what this limb always wanted and could not prove.
  assert.equal(cleared, null,
    `NOG-10(b): clearing is the remedy and must land (got ${cleared?.code} -- ${cleared?.message})`);
  const cleanedRow = await counterpartyRow(born.counterparty_id);
  assert.equal(cleanedRow.registration_no, null, "NOG-10(b): the registration is cleared");
  assert.equal(cleanedRow.registration_normalized, null, "NOG-10(b): the normalized form is cleared too");

  // (c) AND THE GUARD IS STILL ARMED ON THE SAME ROW. Clearing must not be a way to launder a
  // flagged client's customer into an enrichable state: re-introducing an identifier on the very
  // row just cleared is refused by name.
  const reIntroduced = await caught(() => rootQuery(
    `update clara.counterparties
        set registration_no = '202501099011', registration_normalized = '202501099011'
      where id = $1`,
    [born.counterparty_id],
  ));
  assertNameOnly(reIntroduced, "NOG-10(c)");
});

// ---------------------------------------------------------------------------
// NOG-11..13 -- THE FLAG ITSELF: an ordinary audited write path, read LIVE by the trigger.
// ---------------------------------------------------------------------------

test("NOG-11 the trigger reads the policy LIVE: lifting it admits the very write it just refused", async (t) => {
  if (gate(t)) return;
  const lifted = await buildLiftedClient();
  const name = `NOG11 BUYER ${tag()} SDN BHD`;
  const reg = `2025030${Math.floor(Math.random() * 90000) + 10000}`;

  // (a) armed -> refused
  const before = await caught(() => createCounterparty(owner, {
    client: lifted, kind: "customer", name, registration: reg,
  }));
  assertNameOnly(before, "NOG-11(a)");

  // (b) lifted THROUGH THE DOOR (supersession, never an UPDATE) -> the same write is admitted
  await recordPolicy(owner, { client: lifted, value: "unrestricted", basis: "rig: lift the policy" });
  const receipt = await createCounterparty(owner, {
    client: lifted, kind: "customer", name, registration: reg,
  });
  assert.ok(receipt?.counterparty_id, "NOG-11(b): a lifted policy must admit the write");

  // (c) re-armed -> refused again, with no cached state anywhere
  await recordPolicy(owner, { client: lifted, value: "name_only", basis: "rig: re-arm" });
  const after = await caught(() => createCounterparty(owner, {
    client: lifted, kind: "customer", name: `NOG11 SECOND ${tag()} SDN BHD`, registration: `${reg}9`,
  }));
  assertNameOnly(after, "NOG-11(c)");
});

test("NOG-12 the policy fact carries its who/basis/when, and only ONE row is live", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select fact_value, basis, basis_kind, recorded_by, validated_against
       from clara.client_facts
      where client_id = $1 and fact_key = $2 and superseded_at is null`,
    [flagged, POLICY_KEY],
  );
  assert.equal(r.rows.length, 1, "NOG-12: exactly one live policy row per client");
  const row = r.rows[0];
  assert.equal(row.fact_value, "name_only", "NOG-12: the live value is name_only");
  assert.equal(row.basis_kind, "owner_instruction");
  assert.ok((row.basis ?? "").trim().length > 0, "NOG-12: a policy without its basis is refused at the door");
  assert.equal(row.recorded_by, adm, "NOG-12: attributed to the admin who recorded it");
  assert.equal(row.validated_against, "enum:CUSTOMER_IDENTITY_POLICY_V1",
    "NOG-12: stamped with the catalog rule that validated it");
});

test("NOG-13 the policy is admin+ only, and the catalog refuses a value outside the enum", async (t) => {
  if (gate(t)) return;
  const floor = await caught(() => recordPolicy(keeper, { client: unflagged, value: "name_only" }));
  assert.ok(floor, "NOG-13: a bookkeeper must not be able to set a client's identity policy");
  assert.equal(floor.code, "CLR04", `NOG-13: expected the admin+ floor (got ${floor.code} -- ${floor.message})`);

  const bad = await caught(() => recordPolicy(owner, { client: unflagged, value: "whatever" }));
  assert.ok(bad, "NOG-13: an off-catalog value must be refused");
  assert.equal(bad.code, "CLR10", `NOG-13: expected CLR10 (got ${bad.code} -- ${bad.message})`);
});

// ---------------------------------------------------------------------------
// NOG-14..17 -- THE OWNER-ONLY LIFT FLOOR (finding B5). The wall says WHAT is refused; the floor
// says WHO may lower it. The whole ruling turns on one distinction, so these cells drive a real
// ADMIN and a real OWNER of the same firm rather than asserting about ranks.
// ---------------------------------------------------------------------------

test("NOG-14 ARMING stays admin+: an ADMIN may record a client's first name_only policy", async (t) => {
  if (gateFloor(t)) return;
  const c = await createClient(owner, { name: `nog_arm_${tag()}`, opKey: opk("nog-cli") });
  const receipt = await recordPolicy(adm, { client: c, value: "name_only", basis: "rig: admin arms" });
  assert.ok(receipt, "NOG-14: an admin must still be able to ARM the policy");
  const p = await livePolicy(c);
  assert.equal(p.fact_value, "name_only");
  assert.equal(p.recorded_by, adm, "NOG-14: attributed to the admin, not silently to an owner");
});

test("NOG-15 LIFTING is owner-only: an ADMIN is REFUSED by the floor, by name", async (t) => {
  if (gateFloor(t)) return;
  const c = await createClient(owner, { name: `nog_adminlift_${tag()}`, opKey: opk("nog-cli") });
  await recordPolicy(adm, { client: c, value: "name_only", basis: "rig: arm before the admin lift" });
  const err = await caught(() => recordPolicy(adm, { client: c, value: "unrestricted", basis: "rig: admin attempts a lift" }));
  assertLiftFloor(err, "NOG-15");
  // AND THE POLICY DID NOT MOVE. "The door raised" and "the client is still armed" are two
  // claims; the refusal proves only the first, and the second is the one that matters.
  const p = await livePolicy(c);
  assert.ok(p && !Array.isArray(p), "NOG-15: exactly one live policy row survives the refused lift");
  assert.equal(p.fact_value, "name_only", "NOG-15: the client is still armed");
});

test("NOG-16 an OWNER may lift, and an ADMIN may RE-ARM afterwards", async (t) => {
  if (gateFloor(t)) return;
  const c = await createClient(owner, { name: `nog_ownerlift_${tag()}`, opKey: opk("nog-cli") });
  await recordPolicy(adm, { client: c, value: "name_only", basis: "rig: arm before the owner lift" });

  await recordPolicy(owner, { client: c, value: "unrestricted", basis: "rig: owner lifts, lawfully" });
  assert.equal((await livePolicy(c)).fact_value, "unrestricted", "NOG-16: an owner's lift lands");
  // The wall follows the policy immediately -- a lifted client's customer takes a registration.
  const born = await createCounterparty(owner, {
    client: c, kind: "customer", name: `NOG16 BUYER ${tag()} SDN BHD`, registration: "202501099016",
  });
  assert.ok(born?.counterparty_id, "NOG-16: after a lawful lift the enrichment is admitted");

  // RE-ARMING is not a lift, so it stays admin+ -- the asymmetry the ruling asked for.
  await recordPolicy(adm, { client: c, value: "name_only", basis: "rig: admin re-arms" });
  const back = await livePolicy(c);
  assert.equal(back.fact_value, "name_only", "NOG-16: an admin may re-arm");
  assert.equal(back.recorded_by, adm, "NOG-16: the re-arm is the admin's act");
});

test("NOG-17 the floor is invisible to every OTHER fact key", async (t) => {
  if (gateFloor(t)) return;
  const c = await createClient(owner, { name: `nog_otherkey_${tag()}`, opKey: opk("nog-cli") });
  // msic rides the same door and the same table. An admin must be able to record it AND supersede
  // it -- a floor that keyed on the table rather than on the KEY would refuse this second call.
  await recordFact(adm, { client: c, key: "msic", value: "82110", basis: "rig: admin records msic" });
  await recordFact(adm, { client: c, key: "msic", value: "68109", basis: "rig: admin supersedes msic" });
  const m = await livePolicy(c, "msic");
  assert.ok(m && !Array.isArray(m), "NOG-17: one live msic row");
  assert.equal(m.fact_value, "68109", "NOG-17: an admin superseded a non-policy fact untouched by the floor");
});

/** A client armed by this file, distinct from `flagged`, so the lift cell cannot disarm the
 *  client the refusal cells depend on (node --test runs this file's cells in order, but a
 *  shared mutable flag across cells is exactly the coupling that turns one failure into five).
 *  createClient() is the rig's own fixture and drives the 0017 plan+commit bridge to 'active'. */
async function buildLiftedClient() {
  const client = await createClient(owner, { name: `nog_lift_${tag()}`, opKey: opk("nog-cli") });
  await recordPolicy(owner, { client, value: "name_only", basis: "rig: arm the lift-cell client" });
  return client;
}
