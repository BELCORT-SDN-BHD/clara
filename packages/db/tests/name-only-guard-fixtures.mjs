// RS name-only guard rig -- fixture helpers and refusal assertions (NOT a test file: the name
// does not end in `.test.mjs`, so `node --test` ignores it). Split out of name-only-guard.test.mjs
// to keep both files under the repo's 500-line gate, the same reason and the same shape as
// x55-fixtures.mjs / x56-fixtures.mjs.
//
// Everything here is stateless on purpose: the suite's mutable readiness flags stay in the test
// file, so a helper can never make a cell pass by mutating a gate it also reads.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, humanQuery, opk } from "./wave-a-fixtures.mjs";

export const POLICY_KEY = "customer_identity_policy";
/** The counterparty wall's own refusal token (0062_rs_name_only_guard.sql). */
export const REASON = "customer_identity_name_only";
/** The owner lift floor's own refusal token (0063_rs_name_only_lift_floor.sql). */
export const LIFT_REASON = "customer_identity_lift_requires_owner";

export const tag = () => randomUUID().slice(0, 8);

/** Which halves of the ruling are present? Probed SEPARATELY so a partial apply is diagnosable
 *  rather than a blanket failure -- the two migrations must land in order, and naming the missing
 *  one is the difference between a five-second fix and a hunt. Read off the LIVE catalog, never
 *  off the .sql (contract-blind). */
export async function probeHalves() {
  const r = await rootQuery(
    `select
       (select count(*) from pg_trigger t
         where t.tgrelid = 'clara.counterparties'::regclass and not t.tgisinternal
           and t.tgname = 't_counterparties_name_only_guard') as wall_trg,
       (select count(*) from pg_proc p
         where p.pronamespace = 'clara'::regnamespace
           and p.proname = '_tf_counterparty_name_only_guard') as wall_fn,
       (select count(*) from clara.client_fact_keys k where k.fact_key = $1) as key,
       (select count(*) from pg_trigger t
         where t.tgrelid = 'clara.client_facts'::regclass and not t.tgisinternal
           and t.tgname = 't_client_facts_name_only_lift_floor') as floor_trg,
       (select count(*) from pg_proc p
         where p.pronamespace = 'clara'::regnamespace
           and p.proname = '_tf_client_facts_name_only_lift_floor') as floor_fn`,
    [POLICY_KEY],
  );
  const x = r.rows[0];
  return {
    hasWall: Number(x.wall_trg) === 1 && Number(x.wall_fn) === 1 && Number(x.key) === 1,
    hasFloor: Number(x.floor_trg) === 1 && Number(x.floor_fn) === 1,
  };
}

/** The product door for birthing a counterparty, registration and TIN included. */
export async function createCounterparty(sub, { client, kind, name, registration = null, tin = null }) {
  const r = await humanQuery(
    sub,
    `select clara.create_counterparty(p_client => $1, p_kind => $2, p_name => $3,
       p_registration_no => $4, p_tin => $5, p_op_key => $6) as receipt`,
    [client, kind, name, registration, tin, opk("nog")],
  );
  return r.rows[0].receipt;
}

/** The ONE audited door, for any fact key (NOG-17 needs a key that is not the policy). */
export async function recordFact(sub, { client, key, value, basis = "name-only guard rig cell" }) {
  const r = await humanQuery(
    sub,
    `select clara.record_client_fact(p_client => $1, p_fact_key => $2, p_fact_value => $3::jsonb,
       p_basis => $4, p_basis_kind => 'owner_instruction', p_source_document_id => null,
       p_op_key => $5) as receipt`,
    [client, key, JSON.stringify(value), basis, opk("nog-fact")],
  );
  return r.rows[0].receipt;
}

export const recordPolicy = (sub, { client, value, basis = "name-only guard rig cell" }) =>
  recordFact(sub, { client, key: POLICY_KEY, value, basis });

export async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

export async function counterpartyRow(id) {
  const r = await rootQuery("select to_jsonb(c) as row from clara.counterparties c where c.id = $1", [id]);
  return r.rows[0]?.row ?? null;
}

/** The live policy row for a client, or null. */
export async function livePolicy(client, key = POLICY_KEY) {
  const r = await rootQuery(
    `select fact_value, recorded_by from clara.client_facts
      where client_id = $1 and fact_key = $2 and superseded_at is null`,
    [client, key],
  );
  return r.rows.length === 1 ? r.rows[0] : (r.rows.length === 0 ? null : r.rows);
}

/**
 * THE ASSERTION THAT MAKES THIS BATTERY EVIDENCE. Requires a refusal by SQLSTATE *and* by the
 * structured reason token -- not merely "an error", and not a substring match on the message
 * (which a future message edit could satisfy by accident). A unique-index violation, an RLS
 * denial, or the pre-existing 0011 mutation wall all FAIL this, which is the point.
 */
function assertRefusal(err, label, code, reason) {
  assert.ok(err, `${label}: expected a REFUSAL, but the write SUCCEEDED`);
  assert.equal(err.code, code, `${label}: expected ${code} (got ${err.code} -- ${err.message})`);
  let detail = null;
  try { detail = JSON.parse(err.detail ?? "null"); } catch { detail = null; }
  assert.ok(detail && typeof detail === "object",
    `${label}: refusal carried no JSON detail (detail=${err.detail} message=${err.message})`);
  assert.equal(detail.reason, reason,
    `${label}: refused, but by reason '${detail.reason}' rather than '${reason}'`);
}

/** The counterparty enrichment wall refused this, by name. */
export const assertNameOnly = (err, label) => assertRefusal(err, label, "CLR10", REASON);
/** The owner lift floor refused this, by name. */
export const assertLiftFloor = (err, label) => assertRefusal(err, label, "CLR04", LIFT_REASON);

/** The complement: refused, but demonstrably NOT by the counterparty wall. */
export function assertNotThisGuard(err, label) {
  assert.ok(err, `${label}: expected a refusal`);
  let detail = null;
  try { detail = JSON.parse(err.detail ?? "null"); } catch { detail = null; }
  assert.notEqual(detail?.reason, REASON,
    `${label}: the wall refused a write it is supposed to let through`);
}
