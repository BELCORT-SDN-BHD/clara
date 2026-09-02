// PROGRESS.md "Known issues" (3b) -- clara.propose_vendor_identity_binding's unique_violation
// handler (born 0028:758-772, carried forward byte-identical in this one respect by 0154's own
// recut) relabelled EVERY unique_violation on the INSERT as binding_conflict, regardless of
// which of the table's several unique indexes actually fired. Design of record: the migration's
// own header (packages/db/migrations/UNNUMBERED_unique_violation_constraint_name.sql -- the
// number is claimed at merge, packages/db/README.md "Migration numbers are claimed at MERGE
// time").
//
// WHAT IS UNDER TEST, proven BEHAVIOURALLY (never by reading the body text -- a body-text check
// cannot tell a narrow handler from one that relabels every unique_violation on the table,
// exactly 0148's own Part D framing):
//   PART A -- a REAL collision on a ROSTERED constraint (uq_vib_one_active_binding, the one that
//     actually backs this door's own status='proposed' rows) still returns the typed
//     binding_conflict -- the pre-existing, correct-for-that-one-constraint behaviour is
//     UNCHANGED by this narrowing.
//   PART B -- a REAL collision on an UNROSTERED constraint (a throwaway probe index, scoped to a
//     run-unique f2_invoice_prefix so it cannot collide with any other test's rows on the shared
//     rig) surfaces as a RAW 23505, naming the probe index by constraint_name -- never relabelled
//     binding_conflict. This is the exact defect this migration fixes: before it, this same
//     probe would have been mislabelled.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).
//
// THREE-ARMED AUTHORING GATE. The package-wide sweep preloads
// unique-violation-constraint-name-preintegration-gate.mjs because the migration remains
// UNNUMBERED until merge and is therefore absent from HEAD's numbered replay. That shape skips
// these cells loudly. A focused run does not preload it, so a missing migration still fails;
// once the migration is applied, both behavioural cells execute in either shape. A body that
// matches neither the migration-owned pre-image nor the gate's post-image executes the file but
// prefixes both testCodeFailure outcomes with the same re-derive-the-pins diagnostic.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { opk, assertRaises, endPool, rootQuery, PG } from "./rig-helpers.mjs";
import { printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld } from "./x1-helpers.mjs";
import { seedPayableAccount, seedClientHardIdentifier, propose } from "./x36-vendor-binding-helpers.mjs";
import { seedWindow, DATES_OK } from "./binding-proposal-pr-1-helpers.mjs";
import { readUniqueViolationConstraintNameGate } from "./unique-violation-constraint-name-gate.mjs";

let ready = false;
let w = null;
let missingReason = null;
let unknownBodyDiagnostic = null;

before(async () => {
  const gate = await readUniqueViolationConstraintNameGate(
    rootQuery,
    process.env.CLARA_ALLOW_MISSING_UNIQUE_VIOLATION_CONSTRAINT_NAME,
  );
  if (gate.action !== "execute") {
    missingReason = gate.reason;
    if (gate.action === "skip") return;
    throw new Error(
      `${missingReason}. Focused/post-migration runs fail loudly; only the explicit ` +
      "package-wide preintegration sweep may skip.",
    );
  }
  if (gate.unknownBodyDiagnostic) {
    unknownBodyDiagnostic = gate.unknownBodyDiagnostic;
    console.warn(`UNKNOWN unique-violation-constraint-name: ${unknownBodyDiagnostic}`);
    return;
  }
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
  await seedClientHardIdentifier(w.firms.A, w.clients.A1);
  ready = true;
});
after(async () => { printLaneNotes("unique-violation-constraint-name"); await endPool(); });

function unready(t) {
  if (!ready) {
    console.warn(`SKIP unique-violation-constraint-name: ${missingReason}`);
    t.skip(`${missingReason} Explicit package-wide preintegration run.`);
    return true;
  }
  return false;
}

function failUnknownBody() {
  if (unknownBodyDiagnostic) throw new Error(unknownBodyDiagnostic);
}

// ===========================================================================
// PART A -- a REAL collision on the ROSTERED constraint still binds correctly
// ===========================================================================

test("unique_violation constraint_name: a REAL collision on uq_vib_one_active_binding (the rostered constraint) still refuses binding_conflict, unchanged from before this migration", async (t) => {
  failUnknownBody();
  if (unready(t)) return;
  const cp = await seedWindow(w, `uvc-A-${Date.now()}`, { dates: DATES_OK, client: w.clients.A1 });
  const first = await propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id, opKey: opk("uvc-a1") });
  assert.equal(first.status, "proposed", "setup: the first proposal is admitted");

  // The SAME (client, counterparty) pair, second proposal, DIFFERENT op_key (so this is a real
  // second INSERT attempt, not a cached op-key replay). _binding_suppression only reads
  // declined/revoked (packages/db/migrations/0154_binding_proposal_pr_1.sql:1534-1541) -- a
  // still-`proposed` row is NOT suppressed at that rung, so this call reaches the INSERT and
  // collides for real on uq_vib_one_active_binding.
  const err = await assertRaises("CLR36",
    () => propose(w.users.bob, { client: w.clients.A1, counterparty: cp.id, opKey: opk("uvc-a2") }),
    "second proposal, same pair, still open");
  assert.match(err.message, /^binding_conflict$/, "the typed refusal, not a raw 23505");
  const n = await rootQuery(
    "select count(*)::int as n from clara.vendor_identity_bindings where client_id=$1 and counterparty_id=$2 and status='proposed'",
    [w.clients.A1, cp.id]);
  assert.equal(n.rows[0].n, 1, "exactly the one row from the first proposal survives");
});

// ===========================================================================
// PART B -- a REAL collision on an UNROSTERED constraint surfaces raw, unrelabelled
// ===========================================================================

test("unique_violation constraint_name NARROWNESS: a REAL collision on an UNROSTERED unique index surfaces as a raw 23505, naming the probe index -- never relabelled binding_conflict", async (t) => {
  failUnknownBody();
  if (unready(t)) return;
  const sharedPrefix = `UVCB${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}-`;
  const cpA = await seedWindow(w, `uvc-B-a-${Date.now()}`, { dates: DATES_OK, client: w.clients.A1, invoicePrefix: sharedPrefix });
  const first = await propose(w.users.bob, { client: w.clients.A1, counterparty: cpA.id, opKey: opk("uvc-b1") });
  assert.equal(first.status, "proposed", "setup: the first proposal (vendor A) is admitted");

  // A SECOND, DIFFERENT counterparty sharing the SAME derived f2_invoice_prefix (both windows
  // were built from the SAME invoicePrefix override) -- a real, legitimate, non-colliding pair as
  // far as the REAL schema is concerned (different counterparty_id, so uq_vib_one_active_binding
  // does NOT fire). The probe index below is scoped to f2_invoice_prefix = sharedPrefix-derived
  // value, a string unique to THIS test run, so it cannot collide with any other test's rows on
  // the shared rig.
  const cpB = await seedWindow(w, `uvc-B-b-${Date.now()}`, { dates: DATES_OK, client: w.clients.A1, invoicePrefix: sharedPrefix });

  const sharedPrefixRow = await rootQuery(
    "select f2_invoice_prefix from clara.vendor_identity_bindings where id=$1", [first.binding_id]);
  const derivedPrefix = sharedPrefixRow.rows[0].f2_invoice_prefix;
  // The derivation lowercases (_binding_normalize's own fold, same as f1_vendor_name_norm) --
  // compare case-insensitively; the REAL derived value (not this prediction) is what the probe
  // index below actually keys on.
  assert.ok(derivedPrefix && derivedPrefix.toLowerCase().startsWith(sharedPrefix.toLowerCase()),
    `setup: the derived f2_invoice_prefix (${derivedPrefix}) starts with the shared override -- proves the two vendors will collide on it`);

  // An index predicate must be a compile-time constant expression -- no bound parameter -- so
  // the value is interpolated directly (0148's own Part D idiom, rig-fixtures.mjs's
  // promotion-dup-open-wall.test.mjs). Safe here: derivedPrefix is server-derived from a
  // randomUUID-based fixture, alphanumeric and hyphens only.
  const probe = "uq_rig_uvc_probe_bindings";
  await rootQuery(
    `create unique index ${probe} on clara.vendor_identity_bindings (f2_invoice_prefix)
       where status = 'proposed' and f2_invoice_prefix = '${derivedPrefix}'`);
  try {
    // MUTANT this discriminates: a handler that relabelled every unique_violation on this table
    // (the pre-migration shape) would answer binding_conflict here, indistinguishable from a
    // real rostered collision -- exactly the defect PROGRESS 3b names.
    const err = await assertRaises(PG.uniqueViolation,
      () => propose(w.users.bob, { client: w.clients.A1, counterparty: cpB.id, opKey: opk("uvc-b2") }),
      "vendor B's proposal collides on the UNROSTERED probe index");
    assert.equal(err.constraint, probe, "the raw error still names the index that actually refused");
    assert.notEqual(err.message, "binding_conflict", "NOT relabelled as the typed refusal");
  } finally {
    await rootQuery(`drop index if exists clara.${probe}`);
  }
});
