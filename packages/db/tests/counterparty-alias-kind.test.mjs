// H-17 (the kind-blind alias unique) + H-19 (the ungranted, unwalled sales-lane flip).
// Migration: UNNUMBERED_counterparty_alias_kind_scope.sql (number claimed at merge, 裁-108).
// Every cell gates on the LIVE CATALOG, never on the migration number.
//
// THIS FILE OWNS HALF OF A PAIR. The other half is
// packages/runtime/tests/h17-autodraft-v10-constraint-map.test.mjs, which proves autoDraft_v10's
// error map recognises exactly four constraint NAMES and nothing else. A map keyed on a name
// PostgreSQL never emits is a map that never fires — which is precisely how v9's substring test
// stayed green against three FICTIONAL names for a year. So the cells below provoke the real
// uniques on a real rig and assert what the driver actually puts in `error.constraint`. Neither
// half is evidence alone; together they are.
//
// WHY THESE ARE JUDGEMENT LOGIC, and therefore celled rather than trusted: the alias unique
// decides whether two identities may share a trade name (an accounting-identity wall), and
// set_firm_sales_lane_activation decides who may turn the unattended sales drafter on.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  addMember, assertRaises, createClient, createFirm, endPool, humanQuery, insertUser,
  opk, rootQuery, seedAdmission,
} from "./rig-fixtures.mjs";

const EXPECTED_CELLS = 28;

let live = false;
let executed = 0;

/** The four names autoDraft.v10.uniques.ts keys its map on, written out here rather than imported
 *  (no cross-package import from packages/db). Provenance: 0011:669-670, 0015:187, 0015:190,
 *  0017:799. */
const ALIAS_UQ = "uq_counterparty_aliases_live_name";
const UNREG_NAME_UQ = "uq_counterparties_client_unregistered_name";
const REGISTRATION_UQ = "uq_counterparties_client_registration";
const ONE_OPEN_DRAFT_UQ = "uq_journal_entries_one_open_draft_filing";

async function cohortApplied() {
  const rows = await rootQuery(
    `select
       exists (select 1 from information_schema.columns
                where table_schema='clara' and table_name='counterparty_aliases' and column_name='kind') as kind_column,
       exists (select 1 from pg_constraint where conrelid='clara.counterparty_aliases'::regclass
                and conname='fk_counterparty_aliases_kind') as kind_fk,
       exists (select 1 from pg_trigger where tgrelid='clara.counterparty_aliases'::regclass
                and tgname='t_counterparty_aliases_kind_derive') as derive_trigger,
       to_regprocedure('clara.set_firm_sales_lane_activation(boolean,timestamptz,text,text)') is not null as wrapper,
       to_regclass('clara.firm_sales_lane_visible') is not null as lane_read`,
  );
  const { kind_column, kind_fk, derive_trigger, wrapper, lane_read } = rows.rows[0];
  const present = [kind_column, kind_fk, derive_trigger, wrapper, lane_read].filter(Boolean).length;
  if (present !== 0 && present !== 5) {
    throw new Error(
      `alias-kind cohort is PARTIAL: kind_column=${kind_column} kind_fk=${kind_fk} derive_trigger=${derive_trigger} wrapper=${wrapper} lane_read=${lane_read}`,
    );
  }
  return present === 5;
}

before(async () => { live = await cohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_COUNTERPARTY_ALIAS_KIND === "1") {
    console.warn("SKIP counterparty-alias-kind: the cohort is not applied (explicit unnumbered/pre-integration run).");
    t.skip("counterparty alias-kind cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "counterparty alias-kind is required for a focused run: apply UNNUMBERED_counterparty_alias_kind_scope.sql (or its numbered suite copy)",
  );
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// Fixtures. Minted through the root connection: this battery's subject is the SUBSTRATE (indexes,
// triggers, FKs and a grant), so going through the human doors would only add ways to fail for
// reasons that are not the subject. The H-19 cells DO go through the real door, because there the
// door IS the subject.
// ---------------------------------------------------------------------------------------------
async function scratchClient(tag) {
  const r = await rootQuery(
    `with f as (insert into clara.firms(name) values ($1) returning id),
          u as (insert into clara.users(id, email, display_name)
                select gen_random_uuid(), $2, $3 returning id),
          cl as (insert into clara.clients(firm_id, name)
                 select f.id, $4 from f returning id, firm_id)
     select cl.id as client, cl.firm_id as firm, (select id from u) as usr from cl`,
    [`ak_${tag}_${randomUUID().slice(0, 8)}`, `ak_${tag}_${randomUUID()}@example.test`,
      `alias-kind ${tag}`, `ak_${tag}_client`],
  );
  return r.rows[0];
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function mintCounterparty(w, { kind, name, registration = null }) {
  const r = await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,
        registration_no,registration_normalized,created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [w.firm, w.client, kind, name, norm(name), registration,
      registration === null ? null : norm(registration), w.usr],
  );
  return r.rows[0].id;
}

async function mintAlias(w, counterparty, display, extra = {}) {
  if (Object.prototype.hasOwnProperty.call(extra, "kind")) {
    const r = await rootQuery(
      `insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,alias_normalized,
          alias_display,origin,created_by,kind)
       values ($1,$2,$3,$4,$5,'former_name',$6,$7) returning id, kind`,
      [w.firm, w.client, counterparty, norm(display), display, w.usr, extra.kind],
    );
    return r.rows[0];
  }
  const r = await rootQuery(
    `insert into clara.counterparty_aliases(firm_id,client_id,counterparty_id,alias_normalized,
        alias_display,origin,created_by)
     values ($1,$2,$3,$4,$5,'former_name',$6) returning id, kind`,
    [w.firm, w.client, counterparty, norm(display), display, w.usr],
  );
  return r.rows[0];
}

/** Run `action` and hand back the DatabaseError. The `constraint` field is the whole point of the
 *  four cells that use this, so it is returned rather than asserted on inside. */
async function caught(action, label) {
  let error = null;
  try { await action(); } catch (e) { error = e; }
  assert.ok(error, `${label}: expected a violation, but it succeeded`);
  return error;
}

// =============================================================================================
// A. THE CATALOG, AFTER THE MIGRATION
// =============================================================================================

cell("ak.1 counterparty_aliases.kind exists and is NOT NULL", async () => {
  const r = await rootQuery(
    `select data_type, is_nullable from information_schema.columns
      where table_schema='clara' and table_name='counterparty_aliases' and column_name='kind'`,
  );
  assert.equal(r.rowCount, 1);
  assert.equal(r.rows[0].data_type, "text");
  assert.equal(r.rows[0].is_nullable, "NO", "a nullable kind would let the unique degenerate to the old key");
});

cell("ak.2 uq_counterparty_aliases_live_name is KIND-SCOPED, under the same name", async () => {
  const r = await rootQuery(
    "select indexdef from pg_indexes where schemaname='clara' and indexname=$1", [ALIAS_UQ],
  );
  assert.equal(r.rowCount, 1, "the index must keep its NAME -- three DB pre-checks and the runtime error map key on it");
  assert.equal(
    r.rows[0].indexdef,
    `CREATE UNIQUE INDEX ${ALIAS_UQ} ON clara.counterparty_aliases USING btree (client_id, kind, alias_normalized) WHERE (retired_at IS NULL)`,
  );
});

cell("ak.3 the composite FK binds (counterparty_id, kind) to counterparties(id, kind)", async () => {
  const r = await rootQuery(
    `select c.confrelid = 'clara.counterparties'::regclass as references_counterparties,
            (select string_agg(a.attname, ',' order by k.ord)
               from unnest(c.conkey) with ordinality k(att, ord)
               join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.att) as local_cols,
            (select string_agg(a.attname, ',' order by k.ord)
               from unnest(c.confkey) with ordinality k(att, ord)
               join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.att) as foreign_cols,
            c.confupdtype, c.confdeltype
       from pg_constraint c
      where c.conrelid='clara.counterparty_aliases'::regclass
        and c.conname='fk_counterparty_aliases_kind' and c.contype='f'`,
  );
  assert.equal(r.rowCount, 1);
  const fk = r.rows[0];
  assert.equal(fk.references_counterparties, true);
  assert.equal(fk.local_cols, "counterparty_id,kind");
  assert.equal(fk.foreign_cols, "id,kind");
  assert.equal(fk.confupdtype, "a", "NO ACTION on update -- a cascade would collide with the append-only trigger");
  assert.equal(fk.confdeltype, "a");
});

cell("ak.4 the derive trigger is installed AND the append-only trigger the backfill disabled is back on", async () => {
  const r = await rootQuery(
    `select tgname, tgenabled from pg_trigger
      where tgrelid='clara.counterparty_aliases'::regclass and not tgisinternal order by tgname`,
  );
  const byName = Object.fromEntries(r.rows.map((x) => [x.tgname, x.tgenabled]));
  assert.equal(byName.t_counterparty_aliases_kind_derive, "O", "the derive trigger must be present and enabled");
  assert.equal(byName.t_counterparty_aliases_update, "O",
    "a migration that left this disabled would silently retire the append-only wall on the whole table");
});

cell("ak.5 all four constraint names the runtime map keys on EXIST in the catalog under exactly those names", async () => {
  const r = await rootQuery(
    "select indexname from pg_indexes where schemaname='clara' and indexname = any($1) order by indexname",
    [[ALIAS_UQ, UNREG_NAME_UQ, REGISTRATION_UQ, ONE_OPEN_DRAFT_UQ]],
  );
  assert.deepEqual(
    r.rows.map((x) => x.indexname),
    [REGISTRATION_UQ, UNREG_NAME_UQ, ALIAS_UQ, ONE_OPEN_DRAFT_UQ].sort(),
    "a name in autoDraft.v10.uniques.ts that no index carries is a map arm that can never fire",
  );
});

// =============================================================================================
// B. WHAT POSTGRESQL ACTUALLY EMITS IN `constraint` — the half the runtime map depends on
// =============================================================================================

cell("ak.6 an unregistered-name collision reports uq_counterparties_client_unregistered_name verbatim", async () => {
  const w = await scratchClient("unreg");
  await mintCounterparty(w, { kind: "vendor", name: "Acme Trading" });
  const e = await caught(() => mintCounterparty(w, { kind: "vendor", name: "Acme Trading" }), "same-kind name");
  assert.equal(e.code, "23505");
  assert.equal(e.constraint, UNREG_NAME_UQ);
});

cell("ak.7 a registration collision reports uq_counterparties_client_registration verbatim", async () => {
  const w = await scratchClient("reg");
  await mintCounterparty(w, { kind: "vendor", name: "Reg Co", registration: "1234-X" });
  const e = await caught(
    () => mintCounterparty(w, { kind: "vendor", name: "Different Name", registration: "1234-X" }),
    "same registration",
  );
  assert.equal(e.code, "23505");
  assert.equal(e.constraint, REGISTRATION_UQ);
});

cell("ak.8 MUST-NOT-RED CONTROL: a SAME-kind alias collision still refuses, and still names the same index", async () => {
  const w = await scratchClient("same");
  const vendor = await mintCounterparty(w, { kind: "vendor", name: "Zeta Supplies" });
  await mintAlias(w, vendor, "Zeta Old");
  const e = await caught(() => mintAlias(w, vendor, "Zeta Old"), "same-kind alias");
  assert.equal(e.code, "23505");
  assert.equal(e.constraint, ALIAS_UQ,
    "the widening must not weaken the same-kind wall, and must not rename the index out from under three pre-checks");
});

cell("ak.9 the cross-kind counterparties themselves were always admitted — the kind-scoped uniques are correct", async () => {
  const w = await scratchClient("cross");
  const v = await mintCounterparty(w, { kind: "vendor", name: "Nova Bhd" });
  const c = await mintCounterparty(w, { kind: "customer", name: "Nova Bhd" });
  assert.notEqual(v, c, "one client may hold a vendor and a customer of the same name");
});

// =============================================================================================
// C. THE HOLE, CLOSED
// =============================================================================================

cell("ak.10 THE H-17 HOLE: a CROSS-kind alias of the same name is now ADMITTED", async () => {
  const w = await scratchClient("hole");
  const vendor = await mintCounterparty(w, { kind: "vendor", name: "Orion Trading" });
  const customer = await mintCounterparty(w, { kind: "customer", name: "Orion Trading" });
  const a1 = await mintAlias(w, vendor, "Orion Former");
  const a2 = await mintAlias(w, customer, "Orion Former");
  assert.equal(a1.kind, "vendor");
  assert.equal(a2.kind, "customer");
  assert.notEqual(a1.id, a2.id, "two live aliases, same normalised name, one client, different kinds");
});

cell("ak.11 the derive trigger sets kind with NO writer supplying it — the three alias writers are untouched", async () => {
  const w = await scratchClient("derive");
  const customer = await mintCounterparty(w, { kind: "customer", name: "Derive Sdn" });
  const a = await mintAlias(w, customer, "Derive Old");
  assert.equal(a.kind, "customer", "rename_counterparty / merge_counterparties / tick_seeding_proposal all insert without a kind");
});

cell("ak.12 a writer that SUPPLIES a kind does not get to state one — the parent row is the authority", async () => {
  const w = await scratchClient("override");
  const vendor = await mintCounterparty(w, { kind: "vendor", name: "Override Bhd" });
  const a = await mintAlias(w, vendor, "Override Old", { kind: "customer" });
  assert.equal(a.kind, "vendor", "the trigger OVERWRITES rather than defaults, so there is one answer to where this value comes from");
});

cell("ak.13 congruence cannot drift: a parent kind change is refused before the FK is ever consulted", async () => {
  const w = await scratchClient("immutable");
  const vendor = await mintCounterparty(w, { kind: "vendor", name: "Static Bhd" });
  await mintAlias(w, vendor, "Static Old");
  await assertRaises("CLR08",
    () => rootQuery("update clara.counterparties set kind='customer' where id=$1", [vendor]),
    "counterparties.kind is not in _tf_counterparty_update_0011's column whitelist");
});

cell("ak.14 an alias naming no counterparty fails CLOSED — the trigger leaves kind null and the walls refuse", async () => {
  const w = await scratchClient("orphan");
  const e = await caught(() => mintAlias(w, randomUUID(), "Ghost Old"), "orphan alias");
  assert.ok(["23502", "23503"].includes(e.code),
    `an unresolvable parent must refuse on NOT NULL or the FK, got ${e.code}: ${e.message}`);
});

// =============================================================================================
// D. H-19 — THE OWNER-FLOORED SALES-LANE DOOR
// =============================================================================================

async function firmWithRoles(tag) {
  const prefix = `ak19_${tag}_${randomUUID().slice(0, 6)}`;
  const owner = await insertUser(prefix, "owner");
  const keeper = await insertUser(prefix, "keeper");
  const admin = await insertUser(prefix, "admin");
  const firm = await createFirm(owner, { name: prefix, token: await seedAdmission(), opKey: opk("firm") });
  await addMember(owner, { firm, user: keeper, role: "bookkeeper", opKey: opk("mem") });
  await addMember(owner, { firm, user: admin, role: "admin", opKey: opk("mem") });
  await createClient(owner, { name: `${prefix}_c1`, opKey: opk("cli") });
  return { firm, owner, keeper, admin };
}

const flip = (sub, active, watermark, reason, key) =>
  humanQuery(sub, "select clara.set_firm_sales_lane_activation($1,$2,$3,$4) as r",
    [active, watermark, reason, key]);

const limitsOf = async (firm) => (await rootQuery(
  "select sales_lane_active, sales_admission_watermark from clara.firm_limits where firm_id=$1", [firm],
)).rows[0] ?? null;

cell("ak.15 a BOOKKEEPER is refused — the floor is owner, not bookkeeper", async () => {
  const w = await firmWithRoles("bk");
  await assertRaises("CLR04", () => flip(w.keeper, true, null, "trying it on", opk("sl")),
    "bookkeeper at the sales-lane door");
  assert.equal(await limitsOf(w.firm), null, "a refused call must leave no firm_limits row behind");
});

cell("ak.16 an ADMIN is refused too — ADR-0078 puts the operator-tier acts at owner alone", async () => {
  const w = await firmWithRoles("adm");
  await assertRaises("CLR04", () => flip(w.admin, true, null, "admin attempt", opk("sl")),
    "admin at the sales-lane door");
});

cell("ak.17 the OWNER flips it on, and the watermark is recorded", async () => {
  const w = await firmWithRoles("on");
  const mark = "2026-07-01T00:00:00Z";
  const r = await flip(w.owner, true, mark, "opening the sales lane for the pilot client", opk("sl"));
  assert.equal(r.rows[0].r.sales_lane_active, true);
  const row = await limitsOf(w.firm);
  assert.equal(row.sales_lane_active, true);
  assert.equal(new Date(row.sales_admission_watermark).toISOString(), new Date(mark).toISOString());
});

cell("ak.18 activating with NO watermark on a firm that has none sets NOW — everything already filed is backlog", async () => {
  const w = await firmWithRoles("now");
  const before = new Date();
  await flip(w.owner, true, null, "no watermark supplied", opk("sl"));
  const after = new Date();
  const row = await limitsOf(w.firm);
  const wm = new Date(row.sales_admission_watermark);
  assert.ok(wm >= new Date(before.getTime() - 1000) && wm <= new Date(after.getTime() + 1000),
    `the watermark should be ~now, got ${row.sales_admission_watermark}`);
});

cell("ak.19 deactivating LEAVES the watermark where it was — an emergency flip-off then on must not re-open the backlog", async () => {
  const w = await firmWithRoles("off");
  const mark = "2026-06-15T08:30:00Z";
  await flip(w.owner, true, mark, "on", opk("sl"));
  await flip(w.owner, false, null, "emergency de-activation", opk("sl"));
  const row = await limitsOf(w.firm);
  assert.equal(row.sales_lane_active, false);
  assert.equal(new Date(row.sales_admission_watermark).toISOString(), new Date(mark).toISOString(),
    "the inner verb's own watermark rule must survive the wrapper");
});

cell("ak.20 a blank reason is refused, and the wrapper writes NOTHING when it refuses", async () => {
  const w = await firmWithRoles("reason");
  await assertRaises("CLR10", () => flip(w.owner, true, null, "   ", opk("sl")), "blank reason");
  assert.equal(await limitsOf(w.firm), null, "the refusal precedes every write");
  // And a second owner, a second firm: the wrapper takes NO firm argument, so a caller has no
  // surface on which to name someone else's row. Proven by the signature, then by behaviour.
  const other = await firmWithRoles("neighbour");
  await flip(w.owner, true, null, "only my own firm", opk("sl"));
  assert.equal(await limitsOf(other.firm), null, "an owner's flip must not reach another firm's row");
});

cell("ak.21 ACL: the WRAPPER is clara_authenticated's alone, and the ORIGINAL signature is still reachable by NOBODY", async () => {
  const roles = ["clara_authenticated", "clara_runtime", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive"];
  const r = await rootQuery(
    `select role,
            has_function_privilege(role, 'clara.set_firm_sales_lane_activation(boolean,timestamptz,text,text)'::regprocedure, 'execute') as wrapper,
            has_function_privilege(role, 'clara.set_sales_lane_activation(uuid,boolean,timestamptz,text)'::regprocedure, 'execute') as original
       from unnest($1::text[]) as role`,
    [roles],
  );
  const byRole = Object.fromEntries(r.rows.map((x) => [x.role, x]));
  assert.equal(byRole.clara_authenticated.wrapper, true, "the human owner lane needs the wrapper");
  for (const role of roles.filter((x) => x !== "clara_authenticated")) {
    assert.equal(byRole[role].wrapper, false, `${role} must not reach the wrapper`);
  }
  for (const role of roles) {
    assert.equal(byRole[role].original, false,
      `${role} gained EXECUTE on the ORIGINAL set_sales_lane_activation -- 0046 acl 3 is red`);
  }
  const pub = await rootQuery(
    `select exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='clara' and p.proname='set_firm_sales_lane_activation'
                       and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a
                                                         where a.grantee=0 and a.privilege_type='EXECUTE'))) as leaked`,
  );
  assert.equal(pub.rows[0].leaked, false, "PUBLIC must hold no EXECUTE on the wrapper");
});

cell("ak.22 ACL: the derive trigger function is reachable by NOBODY — not PUBLIC, not any app role", async () => {
  // THIS CELL EXISTS BECAUSE THE FIRST CUT OF THE MIGRATION FAILED IT. The file relied on
  // 0004:752's `alter default privileges … revoke execute on functions from public`; applied
  // through psql under an explicit `set role` that held, and applied through the MIGRATION RUNNER
  // it did NOT — the function landed with a NULL proacl, which IS PUBLIC, on a SECURITY DEFINER
  // body. checkout-gate-c2's closed-world routine census caught it on a fresh estate run. A
  // default-privileges assumption is about the session; the explicit revoke the migration now
  // carries is about the object, and this cell reads the object.
  const r = await rootQuery(
    `select p.proacl is null as acl_null,
            exists (select 1 from aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
                     where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
            (select string_agg(role, ',' order by role) from unnest(array[
               'clara_authenticated','clara_runtime','clara_agent_ro','clara_wake_interactive',
               'clara_wake_proactive','clara_freeform_ro','clara_stripe_webhook']) as role
              where has_function_privilege(role, p.oid, 'execute')) as roles_that_can
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='_tf_counterparty_alias_kind'`,
  );
  assert.equal(r.rowCount, 1, "the derive trigger function must exist");
  const acl = r.rows[0];
  assert.equal(acl.acl_null, false, "a NULL proacl IS PUBLIC — the explicit revoke must have run");
  assert.equal(acl.public_execute, false, "PUBLIC must hold no EXECUTE on a SECURITY DEFINER body");
  assert.equal(acl.roles_that_can, null,
    `no application role may EXECUTE the derive trigger function, found: ${acl.roles_that_can}`);
});

// =============================================================================================
// E. THE op_key CONTRACT (review-556 item 1) — the guard, and the replay it exists to make safe
// =============================================================================================

const auditRows = async (firm) => (await rootQuery(
  "select count(*)::int n from clara.audit_log where firm_id=$1 and fn='set_firm_sales_lane_activation'",
  [firm],
)).rows[0].n;

cell("ak.23 a null or blank op_key is refused CLR10, and nothing is written", async () => {
  const w = await firmWithRoles("opkey");
  for (const key of [null, "", "   "]) {
    await assertRaises("CLR10", () => flip(w.owner, true, null, "trying a bad key", key),
      `op_key ${JSON.stringify(key)}`);
  }
  assert.equal(await limitsOf(w.firm), null, "a refused call must precede every write");
  assert.equal(await auditRows(w.firm), 0, "and must leave no audit row");
});

cell("ak.24 REPLAY: the door called TWICE under one op_key returns the stored result and audits ONCE", async () => {
  // This is what the guard in ak.23 protects. `_reserve_op` keys on (firm, fn, op_key), so a
  // blank key would be a REAL key that every later blank-key call replays — a second, different
  // flip would silently return the FIRST one's receipt. The two halves belong together.
  const w = await firmWithRoles("replay");
  const key = opk("sl-replay");
  const first = await flip(w.owner, true, "2026-05-01T00:00:00Z", "opening for the pilot", key);
  const second = await flip(w.owner, true, "2026-05-01T00:00:00Z", "opening for the pilot", key);
  assert.deepEqual(second.rows[0].r, first.rows[0].r, "the replay must return the STORED result");
  assert.equal(await auditRows(w.firm), 1, "the replayed call must not write a second audit row");
  const row = await limitsOf(w.firm);
  assert.equal(row.sales_lane_active, true);
  assert.equal(new Date(row.sales_admission_watermark).toISOString(), "2026-05-01T00:00:00.000Z");
});

// =============================================================================================
// F. H-19's READ (review-556 item 2) — clara.firm_sales_lane_visible
// =============================================================================================

const readLane = (sub) => humanQuery(sub, "select * from clara.firm_sales_lane_visible");

cell("ak.25 a firm member reads their OWN lane row, and it carries the act's watermark", async () => {
  const w = await firmWithRoles("read-own");
  const mark = "2026-04-02T09:30:00Z";
  await flip(w.owner, true, mark, "opening for the read cell", opk("sl"));
  // Read as the BOOKKEEPER, not the owner: the door is owner-floored, the READ is not — every
  // member of the firm may see the lane's current state, which is what a Settings face shows.
  const r = await readLane(w.keeper);
  assert.equal(r.rowCount, 1, "a member must see exactly their own firm's row");
  assert.equal(r.rows[0].firm_id, w.firm);
  assert.equal(r.rows[0].sales_lane_active, true);
  assert.equal(new Date(r.rows[0].sales_admission_watermark).toISOString(), new Date(mark).toISOString());
  assert.ok(r.rows[0].limits_updated_at instanceof Date, "limits_updated_at must be a real timestamp");
});

cell("ak.26 a member of ANOTHER firm reads NOTHING — scope, proven against a populated table", async () => {
  // The discriminating half: firm B is flipped too, so the table is NOT empty when A's member
  // reads it. An empty-table pass would prove nothing about scoping.
  const a = await firmWithRoles("read-a");
  const b = await firmWithRoles("read-b");
  await flip(a.owner, true, null, "firm A opens", opk("sl"));
  await flip(b.owner, true, null, "firm B opens", opk("sl"));
  assert.equal((await rootQuery("select count(*)::int n from clara.firm_limits")).rows[0].n >= 2, true,
    "both firms must have a row for this cell to discriminate");
  const seen = await readLane(a.keeper);
  assert.equal(seen.rowCount, 1, "A's member sees exactly one row");
  assert.equal(seen.rows[0].firm_id, a.firm, "and it is A's own, never B's");
});

cell("ak.27 zero rows is the honest answer for a firm that has never touched the lane", async () => {
  const w = await firmWithRoles("read-none");
  assert.equal(await limitsOf(w.firm), null, "precondition: no firm_limits row yet");
  const r = await readLane(w.owner);
  assert.equal(r.rowCount, 0, "the face renders 'never activated' from an empty read, not an error");
});

cell("ak.28 the view projects ONLY the lane fields, and only clara_authenticated may select it", async () => {
  const cols = await rootQuery(
    `select column_name from information_schema.columns
      where table_schema='clara' and table_name='firm_sales_lane_visible' order by ordinal_position`,
  );
  assert.deepEqual(cols.rows.map((c) => c.column_name),
    ["firm_id", "sales_lane_active", "sales_admission_watermark", "limits_updated_at"],
    "firm_limits' concurrency and sweep governors are a different subject and must not leak here");
  const roles = ["clara_authenticated", "clara_runtime", "clara_agent_ro", "clara_wake_interactive",
    "clara_wake_proactive", "clara_freeform_ro", "clara_stripe_webhook"];
  const r = await rootQuery(
    `select role, has_table_privilege(role, 'clara.firm_sales_lane_visible', 'select') as can
       from unnest($1::text[]) as role`, [roles],
  );
  const byRole = Object.fromEntries(r.rows.map((x) => [x.role, x.can]));
  assert.equal(byRole.clara_authenticated, true, "the human lane needs the read");
  for (const role of roles.filter((x) => x !== "clara_authenticated")) {
    assert.equal(byRole[role], false, `${role} must not reach the lane read`);
  }
  const pub = await rootQuery(
    `select coalesce(has_table_privilege('public', 'clara.firm_sales_lane_visible', 'select'), false) as leaked`,
  );
  assert.equal(pub.rows[0].leaked, false, "PUBLIC must hold no SELECT on the view");
  // And the base table stays ungranted — the view is the ONLY widening.
  const base = await rootQuery(
    "select coalesce(relacl::text,'(none)') as acl from pg_class where oid='clara.firm_limits'::regclass",
  );
  assert.equal(base.rows[0].acl, "(none)", "clara.firm_limits itself must gain no grant");
});
