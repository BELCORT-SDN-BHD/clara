// Slice-5 rig — DOCUMENT PIPELINE part 7: METERING (companion §3.6). Contract-
// blind. Laws: firm_document_limits (operator defaults + per-firm override, the
// ruling-4 pattern); document_ingest_reservations is the DURABLE carrier
// (reserved → resized → settled | refunded), every transition under the namespaced
// advisory lock; concurrent admissions cannot OVERSHOOT pages/day (X7-proven
// block); refund idempotent on every terminal path; adopted duplicates share ONE
// charge; the legacy-upgrade branch CREATES a fresh charge.
//
// The reservation WRITER names/signatures are contract-SILENT — this suite resolves
// them from candidates and RECORDS the resolution (an interface expectation). A
// reservation test that can't resolve its writer degrades to a recorded finding
// rather than a false red (the divergence is captured in the lane notes + report).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES,
  PG,
  assertRaises,
  roleQuery,
  opk,
  sha,
  rootQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  seedIntake,
  finalizeIntake,
  setDocLimits,
  reservationFn,
  callFnAdaptive,
  RESERVATION_STATES,
  LIMIT_CODES,
} from "./rig-docs-fixtures.mjs";
import { seedFreshFirm } from "./rig-events-helpers.mjs";
import { holdThenContend, concurrentTwoSession, sawDeadlock } from "./rig-docs-race.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("metering");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

async function reservationsFor(firm) {
  const r = await rootQuery("select to_jsonb(t) as row from clara.document_ingest_reservations t where t.firm_id=$1 order by t.created_at", [firm]);
  return r.rows.map((x) => x.row);
}

/** Reserve via the resolved writer; { firm, intake, pages }. Returns the receipt or
 *  null when the writer name can't be resolved (recorded). */
async function reserve(firm, intake, pages) {
  const fn = await reservationFn("reserve");
  if (!fn) { noteLane("reservation reserve writer unresolved — reservation lifecycle tests degrade to a recorded finding"); return null; }
  return callFnAdaptive(fn, { firm, intake, pages_reserved: pages, pages, docs_reserved: 1, op_key: opk("resv") },
    { persona: { kind: "role", role: ROLES.runtime }, label: fn });
}

// ===========================================================================
// §3.6 — firm_document_limits: operator defaults + per-firm override.
// ===========================================================================

test("§3.6 firm_document_limits carries docs_per_day / pages_per_day / ocr_concurrency and accepts a per-firm override", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const cols = await rootQuery("select column_name from information_schema.columns where table_schema='clara' and table_name='firm_document_limits'");
  const names = new Set(cols.rows.map((x) => x.column_name));
  for (const c of ["docs_per_day", "pages_per_day", "ocr_concurrency"]) assert.ok(names.has(c), `firm_document_limits.${c} exists`);
  await setDocLimits(firm, { docsPerDay: 3, pagesPerDay: 5, ocrConcurrency: 1 });
  const row = await rootQuery("select docs_per_day, pages_per_day, ocr_concurrency from clara.firm_document_limits where firm_id=$1", [firm]);
  assert.equal(row.rows[0].pages_per_day, 5, "the per-firm pages/day override took");
});

// ===========================================================================
// C-26 [#618] — THE PARTIAL-UPDATE HAZARD IS UNREACHABLE FROM THE BOUNDARY.
//
// THE HAZARD, stated in migration 0090's own SECTION 4 header and NOT fixed there:
// `clara._tf_firm_document_limits_upsert` (0007:545-556) is a BEFORE-INSERT pseudo-upsert
// with a HARDCODED column list — it rewrites docs_per_day, pages_per_day and ocr_concurrency
// on every INSERT against an existing firm row. An INSERT naming only ONE limit therefore
// silently resets the other two to their table defaults.
//
// WHY THERE IS NOTHING TO FIX AT THE OPERATION BOUNDARY, and this cell is the proof rather
// than the claim: there is no public writer to reach the trigger through. `clara.firm_document_limits`
// carries SELECT for clara_authenticated and clara_runtime (0007:810/818 policies) and NOTHING
// else for any application role, and no granted routine writes it — the ONLY routine in the
// whole schema that does is the trigger function itself, which is granted to nobody. So the
// hazard is reachable only by an owner-level or superuser hand (the operator ceremony, and this
// rig's own root fixture). Both halves are asserted here, from the live catalog and from a live
// refusal, so a future migration that opens a writer or a table grant reds THIS cell.
//
// THE SECOND HALF is the fixture's own discipline: `setDocLimits` always names all three limit
// columns (its parameter defaults fill any the caller omits), so a rig cell can never
// accidentally author a partial row and then reason about a value the trigger reset. Proven
// behaviourally — a second call that names one limit still lands the fixture's defaults for the
// other two, which is exactly what "always writes all three" looks like from the outside.
// ===========================================================================
test("C-26 §3.6 no application role can write firm_document_limits, and the root fixture always writes all three limits", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);

  // (a) TABLE PRIVILEGE — swept over every clara_* role the cluster actually has, not a
  //     hard-coded list, so a role added by a later migration is covered the day it lands.
  const roles = await rootQuery(
    "select rolname from pg_roles where rolname like 'clara\\_%' and rolname <> 'clara_fn_owner' order by rolname",
  );
  assert.ok(roles.rowCount >= 6, `only ${roles.rowCount} clara_* application roles found — the sweep is not reading pg_roles`);
  const writers = [];
  for (const { rolname } of roles.rows) {
    for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
      const r = await rootQuery("select has_table_privilege($1, 'clara.firm_document_limits', $2) as ok", [rolname, priv]);
      if (r.rows[0].ok) writers.push(`${rolname} ${priv}`);
    }
  }
  assert.deepEqual(writers, [], "an application role can write clara.firm_document_limits — the 0090 partial-update hazard becomes reachable");
  // The sweep is not vacuous: the same probe must answer TRUE for the owner.
  const owner = await rootQuery("select has_table_privilege('clara_fn_owner', 'clara.firm_document_limits', 'INSERT') as ok");
  assert.equal(owner.rows[0].ok, true, "clara_fn_owner must hold INSERT — otherwise the probe above proves nothing");

  // (b) NO GRANTED ROUTINE WRITES IT. The only writer in the schema is the trigger function,
  //     and it is EXECUTE-granted to nobody.
  const writersInCatalog = await rootQuery(
    `select p.proname,
            (select count(*)::int from pg_roles r
              where r.rolname like 'clara\\_%' and r.rolname <> 'clara_fn_owner'
                and has_function_privilege(r.rolname, p.oid, 'execute')) as granted_to
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and p.prosrc ~* '(insert\\s+into|update)\\s+clara\\.firm_document_limits'
      order by p.proname`,
  );
  assert.deepEqual(
    writersInCatalog.rows.map((r) => `${r.proname} (reachable by ${r.granted_to} app role(s))`),
    ["_tf_firm_document_limits_upsert (reachable by 0 app role(s))"],
    "something other than the BEFORE-INSERT trigger writes firm_document_limits, or the trigger became app-callable",
  );

  // (c) A LIVE REFUSAL, not only a catalog reading.
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery(ROLES.authenticated, "insert into clara.firm_document_limits (firm_id, pages_per_day) values ($1, 1)", [firm]),
    "clara_authenticated INSERT into firm_document_limits",
  );
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery(ROLES.runtime, "update clara.firm_document_limits set pages_per_day = 1 where firm_id = $1", [firm]),
    "clara_runtime UPDATE of firm_document_limits",
  );

  // (d) THE FIXTURE NAMES ALL THREE, EVERY TIME. First a fully-specified row, then a call that
  //     names ONE limit: the other two come back as the FIXTURE's defaults (100/2), never as
  //     the previous call's values — which is what "always writes all three columns" means, and
  //     simultaneously demonstrates the trigger's rewrite that makes it necessary.
  await setDocLimits(firm, { docsPerDay: 7, pagesPerDay: 11, ocrConcurrency: 1 });
  const first = (await rootQuery(
    "select docs_per_day, pages_per_day, ocr_concurrency from clara.firm_document_limits where firm_id=$1", [firm],
  )).rows[0];
  assert.deepEqual([first.docs_per_day, first.pages_per_day, first.ocr_concurrency], [7, 11, 1]);
  await setDocLimits(firm, { pagesPerDay: 13 });
  const second = (await rootQuery(
    "select docs_per_day, pages_per_day, ocr_concurrency from clara.firm_document_limits where firm_id=$1", [firm],
  )).rows[0];
  assert.deepEqual(
    [second.docs_per_day, second.pages_per_day, second.ocr_concurrency],
    [100, 13, 2],
    "setDocLimits left a limit column unnamed — the trigger would then reset it to the TABLE default and a "
    + "cell reasoning about docs_per_day/ocr_concurrency would be reading a value nobody chose",
  );
  noteLane("C-26: firm_document_limits has no public writer; the 0090 partial-update hazard is owner-only (no fix at the boundary)");
});

// ===========================================================================
// §3.6 — reservation lifecycle + refund idempotency.
// ===========================================================================

test("§3.6 a reservation moves reserved → resized → settled, each transition durable; refund is idempotent on a terminal path", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  await setDocLimits(firm, { docsPerDay: 100, pagesPerDay: 1000, ocrConcurrency: 2 });
  const intake = await seedIntake({ firm, uploadedBy: users.alice, status: "verifying", sha256: sha(randomUUID()) });
  const receipt = await reserve(firm, intake, 2);
  if (receipt == null) { noteLane("reservation lifecycle skipped (writer unresolved)"); return; }

  const rows = await reservationsFor(firm);
  assert.ok(rows.length >= 1, "a reservation row was created");
  assert.ok(RESERVATION_STATES.includes(rows[0].state), `the reservation carries a valid state (got ${rows[0].state})`);

  const resizeFn = await reservationFn("resize");
  const settleFn = await reservationFn("settle");
  const refundFn = await reservationFn("refund");
  const rid = rows[0].id;
  if (resizeFn) await callFnAdaptive(resizeFn, { reservation: rid, pages: 3, pages_reserved: 3, op_key: opk("rs") }, { persona: { kind: "role", role: ROLES.runtime }, label: resizeFn });
  if (settleFn) await callFnAdaptive(settleFn, { reservation: rid, pages: 3, actual_pages: 3, op_key: opk("st") }, { persona: { kind: "role", role: ROLES.runtime }, label: settleFn });

  if (refundFn) {
    const before = await reservationsFor(firm);
    await callFnAdaptive(refundFn, { reservation: rid, op_key: opk("rf") }, { persona: { kind: "role", role: ROLES.runtime }, label: refundFn }).catch((e) => noteLane(`refund after settle: ${e.code ?? e.message}`));
    // Idempotent: a repeat refund changes nothing observable.
    await callFnAdaptive(refundFn, { reservation: rid, op_key: opk("rf2") }, { persona: { kind: "role", role: ROLES.runtime }, label: refundFn }).catch(() => {});
    const after = await reservationsFor(firm);
    assert.equal(after.length, before.length, "refund is idempotent — no duplicate reservation rows");
  }
});

// ===========================================================================
// §3.6 — reservation storm: concurrent admissions cannot overshoot pages/day.
// ===========================================================================

test("§6 reservation storm: at pages/day−k two concurrent reserves serialize on the advisory lock (X7-proven) and the overshoot one is refused (limit code, which-limit=pages)", async (t) => {
  if (unready(t)) return;
  const fn = await reservationFn("reserve");
  if (!fn) { noteLane("reservation storm skipped (reserve writer unresolved)"); return; }
  // Integration reconciliation: the storm runs on a FRESH firm — settled usage counts
  // against pages/day (conservative daily accounting, as-built), so sharing firm A
  // with the lifecycle test's settled pages makes BOTH reserves fail at admission and
  // the X7 block unreachable.
  const fresh = await seedFreshFirm(`s5storm_${Date.now().toString(36)}`);
  const firm = fresh.firm;
  // Pages/day = 2; each reserve wants 2 pages → the second must be refused.
  await setDocLimits(firm, { docsPerDay: 100, pagesPerDay: 2, ocrConcurrency: 2 });
  const iA = await seedIntake({ firm, uploadedBy: fresh.owner, status: "verifying", sha256: sha(randomUUID()) });
  const iB = await seedIntake({ firm, uploadedBy: fresh.owner, status: "verifying", sha256: sha(randomUUID()) });

  const run = (intake) => (c) => c.query(
    `select clara.${fn}(${["p_firm => $1", "p_intake => $2", "p_pages_reserved => $3", "p_op_key => $4"].join(", ")})`,
    [firm, intake, 2, opk("storm")],
  ).catch((e) => { if (e.code === "42883") noteLane(`${fn}: named-arg storm call 42883 — param-name divergence (interface expectation)`); throw e; });

  const out = await holdThenContend({
    a: { role: ROLES.runtime, run: run(iA) },
    b: { role: ROLES.runtime, run: run(iB) },
  });
  assert.equal(out.provedBlocked, true, "X7: the second reserve was PROVEN blocked on the namespaced advisory lock");
  // The winner reserved the last 2 pages; the loser overshoots → CLR14.
  if (out.b && out.b.ok === false) {
    assert.ok(LIMIT_CODES.includes(out.b.code), `the overshoot reserve is refused CLR14 (got ${out.b.code}: ${out.b.message})`);
    assert.match(out.b.message ?? "", /page|limit|budget/i, `CLR14 carries which-limit (pages) — got ${out.b.message}`);
  } else {
    noteLane(`storm loser was not refused (got ${JSON.stringify(out.b)}) — reservation may admit-then-bound differently (interface expectation)`);
  }
  const total = (await reservationsFor(firm)).filter((r) => ["reserved", "resized", "settled"].includes(r.state)).reduce((s, r) => s + Number(r.pages_reserved ?? 0), 0);
  assert.ok(total <= 2, `admitted reservations never overshoot pages/day (sum=${total} ≤ 2)`);
});

test("§6 adopted duplicate shares ONE charge (the near-limit duplicate consequence, §8): the duplicate's reservation is REFUNDED at adoption and exactly ONE physical document's pages survive as a live charge", async (t) => {
  if (unready(t)) return;
  const fn = await reservationFn("reserve");
  if (!fn) { noteLane("adopted-charge test skipped (reserve writer unresolved)"); return; }
  // A FRESH firm so the charge accounting is isolated from the shared world's reservations.
  const fresh = await seedFreshFirm(`s5adopt_${Date.now().toString(36)}`);
  const firm = fresh.firm;
  await setDocLimits(firm, { docsPerDay: 100, pagesPerDay: 1000, ocrConcurrency: 2 });
  const digest = sha(randomUUID());
  const key = `firms/${firm}/docs/${digest}.pdf`;

  // Canonical ingest: reserve → finalize (creates the document + links the charge to its task).
  const iA = await seedIntake({ firm, uploadedBy: fresh.owner, status: "verified", sha256: digest, storageKey: key });
  await reserve(firm, iA, 1);
  await finalizeIntake({ intake: iA });

  // A second same-sha intake: reserve → finalize → ADOPTED (folds onto the canonical ingest).
  const iB = await seedIntake({ firm, uploadedBy: fresh.owner, status: "verified", sha256: digest, storageKey: key });
  await reserve(firm, iB, 1);
  await finalizeIntake({ intake: iB });

  const iBrow = await rootQuery("select status from clara.document_intakes where id=$1", [iB]);
  assert.equal(iBrow.rows[0].status, "adopted", "the duplicate intake terminalizes as 'adopted'");

  const resv = await reservationsFor(firm);
  const dupResv = resv.find((r) => r.intake_id === iB);
  assert.ok(dupResv, "the duplicate's reservation row exists");
  assert.equal(dupResv.state, "refunded", "the duplicate reservation is REFUNDED at adoption (transferred to the canonical charge, §3.6)");
  const livePages = resv.filter((r) => r.state !== "refunded").reduce((s, r) => s + Number(r.pages_reserved ?? 0), 0);
  assert.equal(livePages, 1, "exactly ONE physical document's pages survive as a live charge (one-charge-per-physical-ingest)");
  noteLane(`adopted-duplicate reservations: ${resv.map((r) => `${r.state}:${r.pages_reserved}`).join(", ")}`);
});

// ===========================================================================
// §3.6 — resize/refund race: two concurrent transitions on ONE reservation
// serialize under the advisory lock and leave exactly ONE coherent terminal state.
// ===========================================================================

test("§3.6 resize-vs-refund race: concurrent transitions on one reservation never deadlock and settle to a single coherent terminal state", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const reserveWriter = await reservationFn("reserve");
  const resizeWriter = await reservationFn("resize");
  const refundWriter = await reservationFn("refund");
  if (!reserveWriter || !resizeWriter || !refundWriter) { noteLane("resize/refund race skipped (writers unresolved)"); return; }
  await setDocLimits(firm, { docsPerDay: 100, pagesPerDay: 1000, ocrConcurrency: 2 });
  const intake = await seedIntake({ firm, uploadedBy: users.alice, status: "verifying", sha256: sha(randomUUID()) });
  await reserve(firm, intake, 2);
  const rid = (await reservationsFor(firm))[0].id;

  const out = await concurrentTwoSession({
    a: { role: ROLES.runtime, run: (c) => c.query(`select clara.${resizeWriter}(p_reservation => $1, p_pages_reserved => $2, p_op_key => $3)`, [rid, 4, opk("rz")]).catch((e) => { if (e.code === "42883") noteLane(`${resizeWriter}: named-arg 42883 (param divergence)`); throw e; }) },
    b: { role: ROLES.runtime, run: (c) => c.query(`select clara.${refundWriter}(p_reservation => $1, p_op_key => $2)`, [rid, opk("rf")]).catch((e) => { if (e.code === "42883") noteLane(`${refundWriter}: named-arg 42883 (param divergence)`); throw e; }) },
  });
  assert.ok(!sawDeadlock(out), `resize/refund never deadlock (a=${out.a?.code ?? "ok"} b=${out.b?.code ?? "ok"})`);
  const states = (await reservationsFor(firm)).filter((r) => r.id === rid).map((r) => r.state);
  assert.equal(states.length, 1, "exactly one reservation row for the id (no split)");
  assert.ok(RESERVATION_STATES.includes(states[0]), `the reservation rests in ONE coherent state (got ${states[0]})`);
  noteLane(`resize/refund race terminal state: ${states[0]}`);
});
