// F-T1 (the SST engine) PR-1 — the two SST reference tables.
// Design of record: docs/plan/active/sst-engine-design.md S1-S4 + -design-part2.md S8's PR-1
// row + -annexes.md Annex A.1/A.1a + -annexes-2.md Annex C-4/C-5 + -gate-record-part2.md OQ-14.
//
// FIX ROUND (conductor review, 2026-08-24): F1 (blocker, credit-card citation) + F2 (predecessor
// rows) + F3 (threshold table immutability triggers) + F4 (self-supersession CHECK, both tables)
// + F5 (basis_kind vocabulary + document tie, both tables) + F7 (the two orphaned Annex A.1
// obligations: this file's own re-cut plus a21-watch.test.mjs's, and a measured cell for the
// 0016:882-886 schedule-note residual). F6's conceptual note is doc-only, recorded in the design.
//
// STEM-GATED (db-tests.md, wave-f-lane-brief.md): keys on the file STEM, never a number —
// this file's migration ships UNNUMBERED and is renumbered by the conductor at merge.
//
// SCOPE: clara.sst_rate_schedule (greenfield, ten rows — six live + four verified predecessors)
// + the clara.sst_threshold_schedule ALTER (Annex A.1's ordered spec + the F3-F5 hardening) +
// the reachable-closure write assertion, armed for both tables. No evaluator, no writer verb —
// those are later F-T1 PRs / F-A8's own.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, roleQuery, endPool, ROLES, CLR, assertRaisesOneOf,
} from "./rig-helpers.mjs";
import { checkDefs, uniqueIndexDefs, rlsFlags, roleCanExecute } from "./a21-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { markSkip, printSkipCount } from "./wave-a-helpers.mjs";

const LABEL = "F-T1 PR-1 sst reference tables";

let hasFT1PR1 = false;

async function detect() {
  const r = await rootQuery("select version from clara.schema_migrations where version ~ '_f_t1_sst_reference_tables$'");
  return r.rows.length > 0;
}

function skipHere(t) {
  if (!hasFT1PR1) {
    markSkip();
    t.skip("F-T1 PR-1 not applied (clara.schema_migrations has no '*_f_t1_sst_reference_tables' row) — battery dormant");
    return true;
  }
  return false;
}

before(async () => {
  hasFT1PR1 = await detect();
});

after(async () => {
  printLaneNotes(LABEL);
  printSkipCount(LABEL);
  await endPool();
});

// ---------------------------------------------------------------------------
// clara.sst_rate_schedule — shape, RLS, CHECK vocabulary.
// ---------------------------------------------------------------------------

test("sst_rate_schedule: RLS enabled + forced, zero direct app-role write grants", async (t) => {
  if (skipHere(t)) return;
  const f = await rlsFlags("sst_rate_schedule");
  assert.ok(f, "clara.sst_rate_schedule exists");
  assert.ok(f.rls && f.force, "clara.sst_rate_schedule is RLS + FORCE RLS");
  const g = await rootQuery(
    `select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
       cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
       join pg_roles r on r.oid=a.grantee
      where n.nspname='clara' and c.relname='sst_rate_schedule' and r.rolname like 'clara_%'
        and r.rolname <> 'clara_fn_owner'
        and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`,
  );
  assert.equal(g.rows[0].n, 0, "no lane role can write sst_rate_schedule directly — zero direct app-role grants (Annex A.1)");
});

test("sst_rate_schedule: three rate FORMS, exactly-one-of-rate_bp/rate_amount_sen, the effective-order/supersession CHECKs, F4's self-supersession block, and F5's basis_kind + document-tie", async (t) => {
  if (skipHere(t)) return;
  const defs = await checkDefs("sst_rate_schedule");
  for (const frag of [
    "rate_kind = ANY (ARRAY['ad_valorem'::text, 'per_unit'::text, 'per_measure'::text])",
    "tax_type = ANY (ARRAY['sales'::text, 'service'::text])",
    "(rate_kind = 'ad_valorem'::text) = (rate_bp IS NOT NULL)",
    "(rate_kind = ANY (ARRAY['per_unit'::text, 'per_measure'::text])) = (rate_amount_sen IS NOT NULL)",
    "(rate_kind = ANY (ARRAY['per_unit'::text, 'per_measure'::text])) = (unit_code IS NOT NULL)",
    "(effective_to IS NULL) OR (effective_to > effective_from)",
    "(superseded_by IS NULL) = (superseded_at IS NULL)",
    // F4 (conductor fix-round 2026-08-24): self-supersession forgery blocked structurally.
    "superseded_by IS DISTINCT FROM id",
    // F5: basis_kind closed to the 0055:395 four-value vocabulary (nullable here, unlike client_facts).
    "(basis_kind IS NULL) OR (basis_kind = ANY (ARRAY['owner_instruction'::text, 'document'::text, 'registry_lookup'::text, 'interview_carryover'::text]))",
    // F5: the document-source tie, 0055:413's shape verbatim.
    "(basis_kind = 'document'::text) = (source_document_id IS NOT NULL)",
  ]) {
    assert.ok(defs.includes(frag), `sst_rate_schedule CHECK vocabulary carries: ${frag} (got: ${defs.slice(0, 600)})`);
  }
  const uq = await uniqueIndexDefs("sst_rate_schedule");
  assert.ok(
    uq.some((d) => /tax_type/.test(d) && /scope_key/.test(d) && /effective_from/.test(d) && /WHERE \(superseded_by IS NULL\)/.test(d)),
    `sst_rate_schedule carries a partial UNIQUE(tax_type, scope_key, effective_from) WHERE superseded_by IS NULL (got: ${uq.join(" ~~ ")})`,
  );
});

// ---------------------------------------------------------------------------
// F1/F2 — the seed content: ten rows, the credit-card citation fix, the four verified
// predecessors and their supersession chains.
// ---------------------------------------------------------------------------

test("sst_rate_schedule: seed is exactly TEN rows (six currently-live + four F2 predecessors), NONE superseded (F2 RE-FIXED — a rate change is a new row, never a correction), all migration-seeded (recorded_by NULL throughout), each source_note non-blank", async (t) => {
  if (skipHere(t)) return;
  const rows = (await rootQuery(
    "select tax_type, scope_key, rate_kind, rate_bp, rate_amount_sen, unit_code, effective_from::text as ef, effective_to::text as et, superseded_by, recorded_by, source_note from clara.sst_rate_schedule order by tax_type, scope_key, effective_from",
  )).rows;
  assert.equal(rows.length, 10, `sst_rate_schedule carries exactly 10 seed rows (got ${rows.length})`);
  // F2 RE-FIX (conductor delta-confirm 2026-08-24): a predecessor is chronologically adjacent
  // history, not a correction — superseded_by/at stay NULL on ALL ten rows. Stamping a
  // predecessor superseded made uq_sst_rate_schedule_live's WHERE superseded_by IS NULL clause
  // (S1 above) blind to it, so a date inside its window resolved to NO ROW under the live-row
  // filter — the exact defect this re-fix removes.
  const superseded = rows.filter((r) => r.superseded_by !== null);
  assert.equal(superseded.length, 0, `zero rows carry a supersession stamp — every row closes by effective_to alone (got ${superseded.length})`);
  for (const r of rows) {
    assert.equal(r.recorded_by, null, `${r.tax_type}/${r.scope_key}@${r.ef} is migration-seeded, not governed-recorded`);
    assert.ok((r.source_note ?? "").length > 20, `${r.tax_type}/${r.scope_key}@${r.ef} cites a real source_note`);
    const bp = r.rate_bp !== null;
    const amt = r.rate_amount_sen !== null;
    assert.notEqual(bp, amt, `${r.tax_type}/${r.scope_key}@${r.ef}: exactly one of rate_bp/rate_amount_sen is set`);
  }

  // "Currently live" is identified by effective_to IS NULL (open-ended) — NOT by
  // superseded_by IS NULL, which is now true of every row and cannot disambiguate a scope's
  // most-recent fact from its history.
  const current = Object.fromEntries(rows.filter((r) => r.et === null).map((r) => [`${r.tax_type}/${r.scope_key}`, r]));
  assert.equal(Number(current["sales/general"].rate_bp), 1000, "sales/general (current) is 10% (S-1)");
  assert.equal(Number(current["sales/first_schedule"].rate_bp), 500, "sales/first_schedule (current) is 5% (S-1)");
  assert.equal(Number(current["service/general"].rate_bp), 800, "service/general (current) is 8% (V-1)");
  assert.equal(Number(current["service/first_schedule_6pct"].rate_bp), 600, "service/first_schedule_6pct (current) is 6% (V-2)");

  // F1 BLOCKER FIX: credit/charge-card now cites P.U.(A) 213/2018 @ 2018-09-01, never
  // 64/2024 @ 2024-03-01 — and has no predecessor (213/2018 IS the earliest instrument).
  const card = current["service/credit_charge_card"];
  assert.ok(card, "service/credit_charge_card is current");
  assert.equal(card.ef, "2018-09-01", "F1 fix: credit_charge_card's effective_from is 2018-09-01, not 2024-03-01");
  assert.equal(Number(card.rate_amount_sen), 2500, "credit/charge card is RM25.00 in sen");
  assert.equal(card.unit_code, "card", "credit/charge card unit_code is 'card'");
  assert.match(card.source_note, /213\/2018/, "F1 fix: source_note cites P.U.(A) 213/2018");

  // The V-3 flagship, unchanged by the fix round.
  const rental = current["service/rental_leasing"];
  assert.equal(rental.ef, "2026-01-01", "rental_leasing's own scope starts exactly 2026-01-01 (V-3's deemed-effective date)");
  assert.equal(Number(rental.rate_bp), 600, "rental_leasing is 6% once its own First-Schedule item exists (V-3)");
});

test("sst_rate_schedule: F2's four predecessor rows are chronologically ADJACENT history, never a supersession — abutting effective_to/effective_from boundaries, no gap or overlap, superseded_by NULL on both sides", async (t) => {
  if (skipHere(t)) return;
  const chains = [
    { tax_type: "sales", scope_key: "general", predFrom: "2022-06-01", predRate: 1000, succFrom: "2025-07-01" },
    { tax_type: "sales", scope_key: "first_schedule", predFrom: "2022-06-01", predRate: 500, succFrom: "2025-07-01" },
    { tax_type: "service", scope_key: "general", predFrom: "2018-09-01", predRate: 600, succFrom: "2024-03-01" },
    { tax_type: "service", scope_key: "first_schedule_6pct", predFrom: "2024-03-01", predRate: 600, succFrom: "2025-07-01" },
  ];
  for (const c of chains) {
    const pred = (await rootQuery(
      "select rate_bp, effective_from::text as ef, effective_to::text as et, superseded_by, superseded_at from clara.sst_rate_schedule where tax_type=$1 and scope_key=$2 and effective_from=$3::date",
      [c.tax_type, c.scope_key, c.predFrom],
    )).rows[0];
    const succ = (await rootQuery(
      "select id, effective_from::text as ef, superseded_by from clara.sst_rate_schedule where tax_type=$1 and scope_key=$2 and effective_from=$3::date",
      [c.tax_type, c.scope_key, c.succFrom],
    )).rows[0];
    assert.ok(pred && succ, `${c.tax_type}/${c.scope_key}: both the predecessor and successor rows resolve`);
    assert.equal(Number(pred.rate_bp), c.predRate, `${c.tax_type}/${c.scope_key} predecessor rate matches`);
    assert.equal(pred.et, succ.ef, `${c.tax_type}/${c.scope_key}: predecessor's effective_to abuts the successor's effective_from exactly — no gap, no overlap`);
    // F2 RE-FIX: NEITHER side carries a supersession stamp — history, not a correction.
    assert.equal(pred.superseded_by, null, `${c.tax_type}/${c.scope_key}: predecessor's superseded_by is NULL (F2 re-fix)`);
    assert.equal(pred.superseded_at, null, `${c.tax_type}/${c.scope_key}: predecessor's superseded_at is NULL (F2 re-fix)`);
    assert.equal(succ.superseded_by, null, `${c.tax_type}/${c.scope_key}: successor's superseded_by is NULL`);
  }
});

test("sst_rate_schedule: F2's two-direction re-probe (conductor delta-confirm 2026-08-24) — a date inside the predecessor's window resolves under the SAME live-row filter a real evaluator would use; a date before the earliest verified instrument does not", async (t) => {
  if (skipHere(t)) return;
  // The exact live-row predicate uq_sst_rate_schedule_live encodes: superseded_by IS NULL,
  // effective-dated, at most one row can ever match once rows never overlap.
  const liveAt = async (taxType, scopeKey, asOf) => (await rootQuery(
    `select rate_bp from clara.sst_rate_schedule
      where tax_type=$1 and scope_key=$2 and superseded_by is null
        and effective_from<=$3::date and (effective_to is null or effective_to>$3::date)`,
    [taxType, scopeKey, asOf],
  )).rows;
  const inside = await liveAt("sales", "general", "2023-01-01");
  assert.equal(inside.length, 1, "sales/general @2023-01-01 resolves to exactly one row under the live-row filter (the F2 re-fix's own scenario)");
  assert.equal(Number(inside[0].rate_bp), 1000, "sales/general @2023-01-01 is the 1000bp predecessor rate (P.U.(A) 176/2022)");

  const before = await liveAt("sales", "general", "2022-01-01");
  assert.equal(before.length, 0, "sales/general @2022-01-01 — before the earliest verified instrument — resolves to NOTHING, the named gap standing rather than a silent extrapolation");
});

test("sst_rate_schedule: a period before the earliest verified predecessor has NO row for that scope — fail-closed, not extrapolated (F2's own boundary)", async (t) => {
  if (skipHere(t)) return;
  const before = [
    { tax_type: "sales", scope_key: "general", asOf: "2022-05-31" },
    { tax_type: "service", scope_key: "general", asOf: "2018-08-31" },
    { tax_type: "service", scope_key: "first_schedule_6pct", asOf: "2024-02-29" },
  ];
  for (const b of before) {
    const hit = await rootQuery(
      `select 1 from clara.sst_rate_schedule
        where tax_type=$1 and scope_key=$2 and effective_from<=$3::date
          and (effective_to is null or effective_to>$3::date)`,
      [b.tax_type, b.scope_key, b.asOf],
    );
    assert.equal(hit.rowCount, 0, `${b.tax_type}/${b.scope_key} has NO covering row as of ${b.asOf} — a period this early REFUSES by name (no fabricated pre-history)`);
  }
});

// ---------------------------------------------------------------------------
// sst_rate_schedule immutability (unchanged pattern from v1 — throwaway probe rows, never a
// real seed row, since the trigger's supersession stamp is permanent).
// ---------------------------------------------------------------------------

test("sst_rate_schedule: immutable + supersede — DELETE, TRUNCATE, an out-of-shape UPDATE and F4's self-supersession attempt all refuse (as clara_fn_owner, the only role with any grant at all)", async (t) => {
  if (skipHere(t)) return;
  await roleQuery(
    ROLES.fnOwner,
    `insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
       values ('sales', '_ft1_test_immutability_probe', 'ad_valorem', 1, current_date, 'throwaway immutability-probe fixture, never a real rate'),
              ('sales', '_ft1_test_immutability_probe_successor', 'ad_valorem', 2, current_date, 'throwaway successor fixture, never a real rate')`,
  );
  const row = (await rootQuery(
    "select id from clara.sst_rate_schedule where tax_type='sales' and scope_key='_ft1_test_immutability_probe'",
  )).rows[0];
  const successor = (await rootQuery(
    "select id from clara.sst_rate_schedule where tax_type='sales' and scope_key='_ft1_test_immutability_probe_successor'",
  )).rows[0];
  assert.ok(row && successor, "throwaway fixture rows present");

  await assertRaisesOneOf([CLR.immutable], () => roleQuery(ROLES.fnOwner, "delete from clara.sst_rate_schedule where id=$1", [row.id]), "DELETE on sst_rate_schedule");
  await assertRaisesOneOf([CLR.immutable], () => roleQuery(ROLES.fnOwner, "truncate clara.sst_rate_schedule"), "TRUNCATE on sst_rate_schedule");
  await assertRaisesOneOf([CLR.badRequest], () => roleQuery(ROLES.fnOwner, "update clara.sst_rate_schedule set rate_bp = rate_bp + 1 where id=$1", [row.id]), "an UPDATE that is not the supersession stamp");
  // F4: self-supersession is a CHECK violation (23514), a different failure than the trigger's
  // CLR10 — proven directly, never assumed to be caught by the trigger path.
  await assertRaisesOneOf(["23514"], () => roleQuery(ROLES.fnOwner, "update clara.sst_rate_schedule set superseded_by=id, superseded_at=now() where id=$1", [row.id]), "self-supersession (superseded_by = own id)");

  // The ONE lawful UPDATE — the supersession stamp, paired, pointing at a REAL other row.
  await roleQuery(
    ROLES.fnOwner,
    "update clara.sst_rate_schedule set superseded_by=$2, superseded_at=now() where id=$1",
    [row.id, successor.id],
  );
  const after1 = (await rootQuery("select superseded_by from clara.sst_rate_schedule where id=$1", [row.id])).rows[0];
  assert.equal(after1.superseded_by, successor.id, "the supersession stamp is admitted");
  await assertRaisesOneOf([CLR.badRequest], () => roleQuery(ROLES.fnOwner, "update clara.sst_rate_schedule set superseded_at=now() where id=$1", [row.id]), "a second update to an already-superseded row");
  noteLane("sst_rate_schedule immutability cell left its OWN throwaway probe row (_ft1_test_immutability_probe) permanently superseded, by design — the ten real seed rows are untouched by this cell.");
});

// ---------------------------------------------------------------------------
// clara.sst_threshold_schedule — the Annex A.1 ordered ALTER + the F3-F5 fix-round hardening.
// ---------------------------------------------------------------------------

test("sst_threshold_schedule: the ordered ALTER landed — id+unique, paired supersession, F4's self-supersession block, the governed-origin conjunct, F5's basis_kind + document-tie, the relaxed NIL-capable CHECK, per-item PK", async (t) => {
  if (skipHere(t)) return;
  const defs = await checkDefs("sst_threshold_schedule");
  assert.ok(defs.includes("threshold_cents >= 0"), `threshold_cents CHECK relaxed to >= 0 (V-6 NIL-threshold defect) (got: ${defs})`);
  assert.ok(defs.includes("(superseded_by IS NULL) = (superseded_at IS NULL)"), "paired supersession CHECK present");
  assert.ok(defs.includes("superseded_by IS DISTINCT FROM id"), "F4: self-supersession block present");
  assert.ok(
    defs.includes("(recorded_by IS NULL) OR ((btrim(COALESCE(basis, ''::text)) <> ''::text) AND (basis_kind IS NOT NULL))"),
    `governed-origin conjunct present (got: ${defs})`,
  );
  assert.ok(
    defs.includes("(basis_kind IS NULL) OR (basis_kind = ANY (ARRAY['owner_instruction'::text, 'document'::text, 'registry_lookup'::text, 'interview_carryover'::text]))"),
    `F5: basis_kind vocabulary CHECK present (got: ${defs.slice(0, 800)})`,
  );
  assert.ok(
    defs.includes("(basis_kind = 'document'::text) = (source_document_id IS NOT NULL)"),
    `F5: document-source tie present (got: ${defs.slice(0, 800)})`,
  );

  const pk = (await rootQuery(
    "select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='clara.sst_threshold_schedule'::regclass and contype='p'",
  )).rows[0].d;
  assert.equal(pk, "PRIMARY KEY (service_group, item_no, effective_from)", "PK widened to include item_no (V-6 per-item defect)");

  const uq = (await rootQuery(
    "select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='clara.sst_threshold_schedule'::regclass and conname='uq_sst_threshold_schedule_id'",
  )).rows[0]?.d;
  assert.equal(uq, "UNIQUE (id)", "id carries its own UNIQUE constraint, ordered before the self-referencing FK (Annex A.1 step 1)");
});

test("sst_threshold_schedule: both G/I seed rows survive the ALTER byte-for-byte on every pre-existing column (a21-watch.test.mjs P1's premise)", async (t) => {
  if (skipHere(t)) return;
  for (const g of ["G", "I"]) {
    const row = (await rootQuery(
      "select threshold_cents::bigint as c, effective_to, source_note, item_no, id, superseded_by, recorded_by from clara.sst_threshold_schedule where service_group=$1 and effective_from=date '2018-09-01'",
      [g],
    )).rows[0];
    assert.ok(row, `group ${g}'s seed row still resolves at its original key`);
    assert.equal(Number(row.c), 50_000_000, `group ${g} threshold is unchanged at RM500k in cents`);
    assert.equal(row.effective_to, null, `group ${g} is still open-ended (the a21-watch standing pin)`);
    assert.ok((row.source_note ?? "").length > 0, `group ${g} still cites its source`);
    assert.equal(row.item_no, "*", `group ${g}'s new item_no defaulted to '*' (group-wide)`);
    assert.ok(row.id, `group ${g} was backfilled a surrogate id`);
    assert.equal(row.superseded_by, null, `group ${g} is not superseded by this ALTER`);
    assert.equal(row.recorded_by, null, `group ${g} stays migration-seeded (governed-origin conjunct exempts a NULL recorder)`);
  }
});

test("sst_threshold_schedule: F3 — immutable + supersede now mirrors its sibling exactly. Before this fix DELETE and an out-of-shape UPDATE of a live row were BOTH allowed (measured); now they refuse", async (t) => {
  if (skipHere(t)) return;
  // UNLIKE the sst_rate_schedule probe above, this one MUST roll back rather than leave a
  // permanently-superseded row: sst_threshold_schedule already has FIVE LIVE READERS
  // (ack_compliance_watch, evaluate_sst_watch, evaluate_sst_watches_all,
  // record_future_attestation, set_turnover_classification), every one of them keyed on
  // service_group ALONE with no item_no or superseded_by filter (F6's named group-grain
  // obligation) — a permanent extra row for group G, even superseded, still satisfies
  // `effective_from<=today and (effective_to is null or ...)` and can silently win a bare
  // `select ... into` with no ORDER BY/LIMIT. MEASURED the hard way in this fix round: an
  // earlier draft of this cell left such a row and corrupted a21-watch.test.mjs's tier-boundary
  // assertions elsewhere in the estate suite — exactly the class F6 names, not merely a risk.
  await withTxn(async (c) => {
    await c.query("set role clara_fn_owner");
    await c.query(
      `insert into clara.sst_threshold_schedule (service_group, item_no, threshold_cents, effective_from, source_note)
         values ('G', '_ft1_test_thr_immutability_probe', 1, current_date, 'throwaway immutability-probe fixture, rolled back — never a real threshold'),
                ('G', '_ft1_test_thr_immutability_probe_successor', 2, current_date, 'throwaway successor fixture, rolled back — never a real threshold')`,
    );
    const row = (await c.query(
      "select id from clara.sst_threshold_schedule where service_group='G' and item_no='_ft1_test_thr_immutability_probe'",
    )).rows[0];
    const successor = (await c.query(
      "select id from clara.sst_threshold_schedule where service_group='G' and item_no='_ft1_test_thr_immutability_probe_successor'",
    )).rows[0];
    assert.ok(row && successor, "throwaway fixture rows present");

    // A failed statement aborts the whole enclosing transaction, not just itself — SAVEPOINT
    // around each expected-failure statement (the x56-wall-battery.test.mjs idiom) so the
    // transaction can keep going after each controlled refusal.
    const expectRefused = async (sp, sql, params, expectedCode, label) => {
      await c.query(`savepoint ${sp}`);
      let err = null;
      try {
        await c.query(sql, params);
      } catch (e) {
        err = e;
      }
      await c.query(`rollback to savepoint ${sp}`);
      assert.ok(err, `${label}: expected SQLSTATE ${expectedCode} but the call SUCCEEDED`);
      assert.equal(err.code, expectedCode, `${label}: expected SQLSTATE ${expectedCode}, got ${err.code ?? "(no code)"} — ${err.message}`);
    };

    await expectRefused("sp_delete", "delete from clara.sst_threshold_schedule where id=$1", [row.id], CLR.immutable, "DELETE on sst_threshold_schedule");
    await expectRefused("sp_badupdate", "update clara.sst_threshold_schedule set threshold_cents = threshold_cents + 1 where id=$1", [row.id], CLR.badRequest, "an UPDATE that is not the supersession stamp");
    await expectRefused("sp_selfsupersede", "update clara.sst_threshold_schedule set superseded_by=id, superseded_at=now() where id=$1", [row.id], "23514", "F4: self-supersession on the threshold table");

    await c.query(
      "update clara.sst_threshold_schedule set superseded_by=$2, superseded_at=now() where id=$1",
      [row.id, successor.id],
    );
    const after1 = (await c.query("select superseded_by from clara.sst_threshold_schedule where id=$1", [row.id])).rows[0];
    assert.equal(after1.superseded_by, successor.id, "the supersession stamp is admitted");
    await expectRefused("sp_doublesupersede", "update clara.sst_threshold_schedule set superseded_at=now() where id=$1", [row.id], CLR.badRequest, "a second update to an already-superseded row");
  }, { commit: false });
});

// ---------------------------------------------------------------------------
// F7(a) — the 0016:882-886 schedule-note residual (Annex A.1 GN-2's named, accepted gap):
// no LIMIT/DISTINCT on the string_agg, so it double-lists a service_group once more than one
// live threshold row shares it. MEASURED inside a rolled-back transaction — never a permanent
// row, and the append-only trigger (F3) would refuse a DELETE afterward regardless.
// ---------------------------------------------------------------------------

test("0016:882-886 schedule-note residual: double-lists a group once an item-grain row coexists with the group-wide row — MEASURED, not fabricated (Annex A.1 GN-2, accepted as advisory-only)", async (t) => {
  if (skipHere(t)) return;
  await withTxn(async (c) => {
    await c.query("set role clara_fn_owner");
    await c.query(
      `insert into clara.sst_threshold_schedule (service_group, item_no, threshold_cents, effective_from, source_note)
         values ('G', '_ft1_test_double_list_probe', 1, current_date, 'throwaway item-grain probe fixture, rolled back — never a real threshold')`,
    );
    // Stay as clara_fn_owner throughout: evaluate_sst_watches_all is DEFINER so any granted
    // caller could invoke it, but compliance_eval_runs' own RLS carries an OWNER-ONLY policy
    // (no clara_runtime read grant) — reading the receipt back needs the owner role, not
    // merely EXECUTE on the function that wrote it.
    await c.query("select clara.evaluate_sst_watches_all($1)", ["_ft1_test_double_list_probe"]);
    const note = (await c.query(
      "select schedule_note from clara.compliance_eval_runs order by started_at desc limit 1",
    )).rows[0].schedule_note ?? "";
    const gHits = (note.match(/\bG@/g) || []).length;
    assert.ok(
      gHits >= 2,
      `schedule_note double-lists group G once a per-item row coexists with the group-wide row (0016:882-886, GN-2's named residual — F7) — got: "${note}"`,
    );
  }, { commit: false });
  // Rolled back: no throwaway row and no compliance_eval_runs receipt survive this cell.
});

// ---------------------------------------------------------------------------
// The reachable-closure write assertion — proving the scan CAN refuse, not merely that it
// currently passes vacuously (internet-lane-annexes.md C.5e's adversarial-twin discipline,
// re-derived independently here in JS rather than trusting the migration's own DO block).
// ---------------------------------------------------------------------------

const CLOSURE_ROLES = [
  "clara_authenticated", "clara_agent_ro", "clara_agent_read_login",
  "clara_runtime", "clara_runtime_login", "clara_wake_interactive", "clara_wake_proactive",
  "clara_wake_write_login",
];

async function reachableClosureWriters(target) {
  const pattern = `(insert\\s+into|update|delete\\s+from)\\s+(clara\\.)?${target}\\M`;
  const roots = (await rootQuery(
    `select coalesce(array_agg(distinct p.proname), '{}') as fns
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
       join pg_roles r on r.oid=a.grantee
      where n.nspname='clara' and a.privilege_type='EXECUTE' and r.rolname = any($1)`,
    [CLOSURE_ROLES],
  )).rows[0].fns;
  let frontier = roots;
  let reached = [];
  for (let i = 0; i < 25 && frontier.length > 0; i += 1) {
    reached = [...new Set([...reached, ...frontier])];
    const next = (await rootQuery(
      `select coalesce(array_agg(distinct callee), '{}') as fns from (
          select (regexp_matches(p.prosrc, 'clara\\.([a-z_][a-z0-9_]*)\\s*\\(', 'g'))[1] as callee
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='clara' and p.proname = any($1)
        ) x
       where callee <> all($2)
         and exists (select 1 from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
                      where n2.nspname='clara' and p2.proname = x.callee)`,
      [frontier, reached],
    )).rows[0].fns;
    frontier = next;
  }
  const offenders = (await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname = any($1) and p.prosrc ~* $2`,
    [reached, pattern],
  )).rows.map((r) => r.proname);
  return offenders;
}

test("reachable closure: currently ZERO writers reach sst_threshold_schedule or sst_rate_schedule (no governed door exists yet; the two new F3 trigger functions are neither granted nor called by anything, so they never enter the closure)", async (t) => {
  if (skipHere(t)) return;
  assert.deepEqual(await reachableClosureWriters("sst_threshold_schedule"), [], "no reachable writer for sst_threshold_schedule");
  assert.deepEqual(await reachableClosureWriters("sst_rate_schedule"), [], "no reachable writer for sst_rate_schedule");
});

test("reachable closure ADVERSARIAL TWIN: an ungranted core writing sst_rate_schedule, reachable only through a granted wrapper, IS caught by the SAME scan", async (t) => {
  if (skipHere(t)) return;
  await rootQuery("set role clara_fn_owner");
  try {
    // The ungranted core: writes the table directly, EXECUTE not granted to any lane role —
    // exactly the class F-A8's gate found blind to the granted-fn-prosrc-only scan (GM-1/C.5e).
    await rootQuery(`
      create function clara._ft1_test_adversarial_core() returns void
        language plpgsql security definer set search_path to 'clara','pg_temp' as $fn$
      begin
        insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
          values ('sales', '_ft1_adversarial_probe', 'ad_valorem', 1, current_date, 'adversarial twin — never a real rate');
      end $fn$;
    `);
    await rootQuery("revoke all on function clara._ft1_test_adversarial_core() from public");
    // The granted wrapper: EXECUTE granted to a lane role, calling the ungranted core by its
    // clara.-qualified name — the estate's own proven internal-call convention (0044:1652/1927).
    await rootQuery(`
      create function clara._ft1_test_adversarial_wrapper() returns void
        language plpgsql security definer set search_path to 'clara','pg_temp' as $fn$
      begin
        perform clara._ft1_test_adversarial_core();
      end $fn$;
    `);
    await rootQuery("grant execute on function clara._ft1_test_adversarial_wrapper() to clara_wake_proactive");

    const found = await reachableClosureWriters("sst_rate_schedule");
    assert.ok(
      found.includes("_ft1_test_adversarial_core"),
      `the reachable-closure scan catches the ungranted core through the granted wrapper (found: ${found.join(", ") || "(none)"})`,
    );
  } finally {
    await rootQuery("drop function if exists clara._ft1_test_adversarial_wrapper()");
    await rootQuery("drop function if exists clara._ft1_test_adversarial_core()");
    await rootQuery("reset role");
  }
});

test("PUBLIC has no EXECUTE on either new trigger function; clara_fn_owner owns both (DEFINER hygiene)", async (t) => {
  if (skipHere(t)) return;
  for (const fn of ["_tf_sst_rate_schedule_supersede_only", "_tf_sst_threshold_schedule_supersede_only"]) {
    const pub = await roleCanExecute("public", fn);
    assert.notEqual(pub, true, `PUBLIC does not hold EXECUTE on ${fn}`);
    const owner = (await rootQuery(
      "select pg_get_userbyid(proowner) as o from pg_proc where proname=$1 and pronamespace='clara'::regnamespace",
      [fn],
    )).rows[0]?.o;
    assert.equal(owner, "clara_fn_owner", `${fn} is clara_fn_owner-owned (DEFINER-writer idiom)`);
  }
});
