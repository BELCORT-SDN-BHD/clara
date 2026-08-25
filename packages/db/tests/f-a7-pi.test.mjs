// F-A7 train pi — the ADDITIVE layer: the common receipt contract + the one read surface,
// the firm-scoped question carrier, the name-family predicate, the promotion card.
//
// Migration: packages/db/migrations/UNNUMBERED_f_a7_pi_additive.sql (numbered at merge).
// Design: docs/plan/active/filing-and-interview-design.md v2 §3.3 rider 4 · §3.4 · §4 train π;
// -annexes-1.md Annex C (D-4, D-6, D-11, D-19); -annexes-2.md Annex I.1.
//
// GATING is on the CATALOG, never on a migration number: `piApplied()` asks whether the objects
// exist. A number-keyed gate goes vacuous the day the file is renumbered at merge.
//
// WHAT THESE CELLS ARE FOR. The pi layer's central claim is that the receipt contract is a WALL
// and not a convention: a member item cannot install a projection that does not conform. So the
// cells are written as REFUSALS — each one makes the wall say no, and each has the admitting
// twin beside it so "it refused" is not confused with "nothing worked". The union is exercised
// by WIRING a shim to a real table inside a rolled-back transaction, because a view over seven
// empty stubs that returns zero rows proves nothing: a read that cannot say YES has a
// meaningless NO, exactly as the inverse is true.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, buildWorld, opk, sha, ROLES,
  ingestDocument, assertRaises, getPool,
} from "./rig-fixtures.mjs";

let world = null;
let live = false;

/** True when the pi layer is applied. Derived from the catalog: every object this battery
 *  touches must be present, and a PARTIAL set THROWS rather than skipping — a half-applied
 *  migration is a defect, not an absence. */
async function piApplied() {
  const wanted = [
    ["r", "agent_receipt_contract"], ["r", "agent_receipt_surfaces"],
    ["r", "firm_open_questions"], ["r", "client_identifier_promotions"],
    ["v", "agent_receipts_visible"], ["v", "_agent_receipt_src_f_a2"],
  ];
  const r = await rootQuery(
    `select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = any($1)`,
    [wanted.map((w) => w[1])],
  );
  const found = new Map(r.rows.map((x) => [x.relname, x.relkind]));
  const missing = wanted.filter((w) => found.get(w[1]) !== w[0]).map((w) => w[1]);
  if (missing.length === 0) return true;
  if (missing.length === wanted.length) return false;
  throw new Error(
    `F-A7 pi is HALF applied — missing/mistyped: ${missing.join(", ")}. `
    + "A partial layer is a defect; refusing to skip past it.",
  );
}

before(async () => {
  live = await piApplied();
  if (live) world = await buildWorld();
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("F-A7 pi layer not applied — clara.agent_receipts_visible absent"); return true; }
  return false;
};

/** The column contract, read from the DB. Every projection the cells build is generated
 *  from THIS, so a contract change moves the cells with it instead of leaving them stale. */
async function contract() {
  const r = await rootQuery(
    "select ordinal, column_name, data_type, nullable from clara.agent_receipt_contract order by ordinal");
  // ARITY IS DERIVED, NEVER PINNED. Pinning `18` here is what made R-L26 a three-file change
  // instead of a one-file change; a cell that hard-codes the number it is checking has to be
  // edited by hand every time the contract moves, and the edit is the thing that gets missed.
  assert.ok(r.rowCount >= 1, "the contract is non-empty");
  // R-L26: `scope` is LAST and non-nullable — the two properties the visibility predicate rests
  // on. Asserted here so every cell downstream inherits them.
  const last = r.rows[r.rows.length - 1];
  assert.equal(last.column_name, "scope", "`scope` is the LAST contract column (trailing-append law)");
  assert.equal(last.nullable, false, "`scope` is NOT NULL — a three-valued visibility column leaks");
  return r.rows;
}

/** Every contract column as `null::<type> as <name>`, in ordinal order. */
const stubOf = (cols) => cols.map((c) => `null::${c.data_type} as ${c.column_name}`).join(", ");

/** Run `fn` inside ONE transaction that is ALWAYS rolled back, so DDL against the shared shim
 *  views never leaks between cells or out of the suite. Returns fn's value. */
async function inRolledBackTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try { await client.query("rollback"); } catch { /* the rollback is best-effort cleanup */ }
    client.release();
  }
}

// ---------------------------------------------------------------------------------------
// A · THE CONTRACT AND THE ONE READ SURFACE
// ---------------------------------------------------------------------------------------

test("pi-A1 · the seven shims are registered, present, conforming, and unwired except where a "
  + "later train has since landed", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery("select * from clara.agent_receipt_source_census() order by item");
  assert.deepEqual(r.rows.map((x) => x.item),
    ["f_a2", "f_a3", "f_a4", "f_a5", "f_a6", "f_a7", "f_a8"],
    "the closed world is TA-P4 A's five plus F-A3 and F-A7 itself");
  // F-A7/PR-4 beta (0126) wires f_a7's shim to its real `agent_filing_receipts` table. At pi's
  // OWN frontier every shim was an unwired stub, but this file runs against the merged chain
  // where beta is real, so f_a7 is the one legitimately-wired exception to the closed world below.
  for (const row of r.rows) {
    assert.equal(row.shim_exists, true, `${row.item}: shim exists`);
    assert.equal(row.conforms, true, `${row.item}: shim conforms to the contract`);
    assert.equal(row.column_count, (await contract()).length, `${row.item}: contract arity`);
    if (row.item === "f_a7") {
      assert.equal(row.wired, true, "f_a7: WIRED — F-A7/PR-4 beta (0126) landed its own member table");
      assert.deepEqual(row.actual_sources, ["agent_filing_receipts"], "f_a7: reaches its real member table");
    } else {
      assert.equal(row.wired, false, `${row.item}: UNWIRED — no member receipt table has landed yet`);
      assert.deepEqual(row.actual_sources, [], `${row.item}: reaches no relation`);
    }
  }
});

test("pi-A2 · WALL — a shim whose projection RENAMES a contract column cannot install", async (t) => {
  if (gate(t)) return;
  const cols = await contract();
  // The admitting twin FIRST: the identical statement with the correct name installs. Without
  // it, the refusal below could be caused by anything in the statement.
  const good = stubOf(cols);
  await inRolledBackTx(async (client) => {
    await client.query(
      `create or replace view clara._agent_receipt_src_f_a4 as select ${good} where false`);
    await client.query("select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a4')");
  });
  // Now rename exactly one column and nothing else.
  const renamed = cols
    .map((c) => `null::${c.data_type} as ${c.column_name === "rationale" ? "reason" : c.column_name}`)
    .join(", ");
  await inRolledBackTx(async (client) => {
    await assert.rejects(
      () => client.query(
        `create or replace view clara._agent_receipt_src_f_a4 as select ${renamed} where false`),
      /cannot change name of view column|rationale/i,
      "Postgres itself refuses the rename — the wall is the engine, not a checker",
    );
  });
});

test("pi-A3 · WALL — a shim whose projection RETYPES a contract column cannot install", async (t) => {
  if (gate(t)) return;
  const cols = await contract();
  const retyped = cols
    .map((c) => `null::${c.column_name === "verdict" ? "text" : c.data_type} as ${c.column_name}`)
    .join(", ");
  await inRolledBackTx(async (client) => {
    await assert.rejects(
      () => client.query(
        `create or replace view clara._agent_receipt_src_f_a5 as select ${retyped} where false`),
      /cannot change data type of view column|verdict/i,
      "a jsonb contract column may not become text",
    );
  });
});

test("pi-A4 · WALL — the ARITY hole: an EXTRA TRAILING column installs, and the checker REFUSES it",
  async (t) => {
    if (gate(t)) return;
    const cols = await contract();
    // The counterexample is DERIVED as (contract arity + 1). Pinned at a literal it would have
    // silently become the LAWFUL shape when R-L26 took the contract from 18 to 19 columns —
    // the negative control turning into the legal case is the worst way for a cell to rot.
    const lawful = cols.length;
    const trailing = `${stubOf(cols)}, null::text as smuggled`;
    await inRolledBackTx(async (client) => {
      // This is the half `create or replace view` does NOT refuse — proven, not assumed.
      await client.query(
        `create or replace view clara._agent_receipt_src_f_a6 as select ${trailing} where false`);
      const n = await client.query(
        `select count(*)::int as n from pg_attribute
          where attrelid = 'clara._agent_receipt_src_f_a6'::regclass and attnum > 0 and not attisdropped`);
      assert.equal(n.rows[0].n, lawful + 1, "Postgres accepted the trailing column — the hole is real");
      // ...and this is the half that closes it.
      await assert.rejects(
        () => client.query("select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a6')"),
        new RegExp(`carries ${lawful + 1} column\\(s\\); the contract has ${lawful}`),
        "the checker refuses on arity BEFORE it compares names",
      );
    });
  });

test("pi-A5 · the checker refuses an UNREGISTERED surface and an ABSENT one", async (t) => {
  if (gate(t)) return;
  await assertRaises("CLR10",
    () => rootQuery("select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a99')"),
    "an unregistered shim name");
  await assertRaises("CLR10",
    () => rootQuery("select clara._assert_receipt_surface_conforms('')"),
    "a blank shim name");
  // The admitting twin: a registered, present shim passes.
  await rootQuery("select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a2')");
});

test("pi-A6 · the union REACHES a wired member, and the census sees the wiring via pg_depend",
  async (t) => {
    if (gate(t)) return;
    // Called for its assertions, not its value: `scope` is last and non-nullable. The projection
    // below is written out BY HAND on purpose — generating it from the contract would make this
    // cell agree with itself, and the whole point is that a member hand-writes its own.
    await contract();
    await inRolledBackTx(async (client) => {
      // A stand-in member receipt table: this is what F-A2's own PR will do for real, minus the
      // receipt semantics. It exercises the union, the two floors and the census in one go.
      await client.query(`create table clara._rig_pi_member_receipts (
        id bigserial primary key, firm_id uuid, client_id uuid, scope text not null,
        model_snapshot jsonb, note text, at timestamptz not null default now())`);
      // The shim is owned by clara_fn_owner and a non-security_invoker view reads its base
      // tables as its OWNER, so a table owned by anyone else is unreadable through it. Every
      // real member table is a clara_fn_owner table; the stand-in must be one too or the cell
      // would be exercising a permission accident rather than the union.
      await client.query("alter table clara._rig_pi_member_receipts owner to clara_fn_owner");
      await client.query(
        `insert into clara._rig_pi_member_receipts(firm_id, client_id, model_snapshot, note, scope)
         values ($1, $2, '{"provider":"p","model":"m","version":"v"}'::jsonb, 'firm A row', 'firm'),
                ($3, null, '{"provider":"p","model":"m","version":"v"}'::jsonb, 'firm B row', 'firm'),
                (null, null, '{"provider":"p","model":"m","version":"v"}'::jsonb, 'platform row', 'platform'),
                -- The two INCONSISTENT rows R-L26's two-arm floor must hide from EVERYONE.
                (null, null, '{"provider":"p","model":"m","version":"v"}'::jsonb, 'firm-scoped but firmless', 'firm'),
                ($1, null, '{"provider":"p","model":"m","version":"v"}'::jsonb, 'platform but firm-bound', 'platform')`,
        [world.firms.A, world.clients.A1, world.firms.B]);
      const projection = `
        select 'entry_post'::text as receipt_kind, m.id::text as receipt_id, m.firm_id,
               m.client_id, null::text as subject_id,
               '00000000-0000-4000-8000-000000c1a7a0'::uuid as acting_actor,
               null::uuid as on_behalf_of, m.at as occurred_at,
               m.model_snapshot->>'model' as model, m.model_snapshot->>'version' as model_version,
               m.note as rationale, m.model_snapshot as verdict,
               '{}'::text[] as failing_rungs, 'autodraft'::text as via_wake_kind,
               'wake_task'::text as trigger_kind, null::text as trigger_id,
               null::uuid as authorization_id, null::boolean as adopted_verbatim,
               m.scope as scope
          from clara._rig_pi_member_receipts m`;
      await client.query(`create or replace view clara._agent_receipt_src_f_a2 as ${projection}`);
      await client.query("select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a2')");

      const census = await client.query(
        "select * from clara.agent_receipt_source_census() where item = 'f_a2'");
      assert.equal(census.rows[0].wired, true, "the census now says WIRED");
      assert.deepEqual(census.rows[0].actual_sources, ["_rig_pi_member_receipts"],
        "and it names what the shim actually reaches — pg_depend, not the expected_source claim");

      // The read, as firm A's BOOKKEEPER. jwt_firm()/actor_role_rank() read `request.jwt.claims`
      // — the SAME GUC and the same JSON shape `withActor` sets for a human session, so this is
      // the production principal, not a rig-only impersonation.
      // NOTE the shape: the role is reset in a `catch`, never a `finally`. A `finally` that
      // issues SQL on an aborted transaction raises 25P02 and MASKS the real error — that cost
      // one debugging round here, and the masked error was a genuine defect.
      const asPersona = async (sub, sql) => {
        await client.query("select set_config('request.jwt.claims', $1, true)",
          [JSON.stringify({ sub, role: "authenticated" })]);
        await client.query(`set local role ${ROLES.authenticated}`);
        const out = await client.query(sql);
        await client.query("set local role none");
        return out;
      };
      const seen = await asPersona(world.users.bob,
        "select * from clara.agent_receipts_visible order by rationale");
      const notes = seen.rows.map((r) => r.rationale).sort();
      // R-L26. Firm A's bookkeeper sees EXACTLY its own firm-scoped row and the PLATFORM row.
      // Five rows exist; three are invisible to everyone, and the two named below are the whole
      // point of the ruling.
      assert.deepEqual(notes, ["firm A row", "platform row"],
        `expected the firm A row + the platform row; got ${JSON.stringify(notes)}`);
      const firmRow = seen.rows.find((r) => r.rationale === "firm A row");
      assert.equal(firmRow.receipt_kind, "entry_post");
      assert.equal(firmRow.model, "m", "the projection maps model_snapshot->>'model' onto the contract");
      assert.equal(firmRow.firm_id, world.firms.A, "the firm B row is NOT visible");
      assert.equal(firmRow.scope, "firm");
      assert.deepEqual(firmRow.failing_rungs, [], "text[] survives the union");
      const platformRow = seen.rows.find((r) => r.rationale === "platform row");
      assert.equal(platformRow.scope, "platform");
      assert.equal(platformRow.firm_id, null, "a platform receipt belongs to no firm");
      // The two INCONSISTENT rows are hidden from the very firm that would otherwise own them.
      // This is the fail-CLOSED direction: a member that mislabels scope loses its own rows and
      // finds out, rather than leaking them to the whole estate.
      assert.ok(!notes.includes("firm-scoped but firmless"),
        "scope='firm' with a NULL firm_id matches neither arm");
      assert.ok(!notes.includes("platform but firm-bound"),
        "scope='platform' with a non-NULL firm_id matches neither arm");

      // R-L26's POSITIVE CONTROL, and the reason the ruling exists: a bookkeeper at a DIFFERENT
      // firm — one that did not create the row and cannot see firm A's — still sees the platform
      // receipt. Without the scope arm this returns zero and reads as "no such receipts exist",
      // which is the exact lie TA-P4's read surface is for.
      const otherFirm = await asPersona(world.users.dave,
        "select rationale, scope from clara.agent_receipts_visible order by rationale");
      assert.deepEqual(otherFirm.rows.map((r) => r.rationale), ["firm B row", "platform row"],
        "firm B's owner sees its OWN firm row and the platform row — and none of firm A's");
      assert.equal(otherFirm.rows.find((r) => r.rationale === "platform row").scope, "platform");

      // The role floor is independent of scope: a VIEWER sees zero of BOTH, though the platform
      // row is global. Two floors, both required, neither substituting for the other.
      const viewer = await asPersona(world.users.carol,
        "select count(*)::int as n from clara.agent_receipts_visible");
      assert.equal(viewer.rows[0].n, 0,
        "viewer < bookkeeper: the role floor bites even on a platform-scoped row");

      // ARM-0: no principal at all. coalesce(...,-1) must rank BELOW viewer, not compare NULL.
      await client.query("select set_config('request.jwt.claims', '', true)");
      await client.query(`set local role ${ROLES.authenticated}`);
      const nobody = await client.query("select count(*)::int as n from clara.agent_receipts_visible");
      await client.query("set local role none");
      assert.equal(nobody.rows[0].n, 0, "a NULL principal reads nothing (ARM-0)");
    });
    // And after the rollback the shim is a stub again — the suite leaves no wiring behind.
    const after = await rootQuery(
      "select wired from clara.agent_receipt_source_census() where item = 'f_a2'");
    assert.equal(after.rows[0].wired, false, "the transaction was rolled back");
  });

test("pi-A7 · the shims are NOT directly readable — the one entrance is one", async (t) => {
  if (gate(t)) return;
  const roles = [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.runtime];
  const shims = (await rootQuery("select shim_relname from clara.agent_receipt_surfaces order by item"))
    .rows.map((r) => r.shim_relname);
  assert.equal(shims.length, 7);
  for (const role of roles) {
    for (const shim of shims) {
      const r = await rootQuery(
        "select has_table_privilege($1, 'clara.' || $2, 'select') as ok", [role, shim]);
      assert.equal(r.rows[0].ok, false, `${role} must not SELECT clara.${shim}`);
    }
  }
  // The admitting twin, so "false everywhere" is not just a broken probe.
  const entrance = await rootQuery(
    "select has_table_privilege($1, 'clara.agent_receipts_visible', 'select') as ok",
    [ROLES.authenticated]);
  assert.equal(entrance.rows[0].ok, true, "clara_authenticated CAN read the entrance");
});

test("pi-A9 · THE ACL CENSUS — zero non-owner grantees on every internal receipt view, and the "
  + "census FAILS when one is granted", async (t) => {
    if (gate(t)) return;
    // This is not defence-in-depth; it is the wall. Each shim is a plain view owned by
    // clara_fn_owner over a firm-scoped table, and every governed clara table carries
    // `p_<t>_owner for all to clara_fn_owner using (true)` — so each shim INDIVIDUALLY sees every
    // firm's rows. Measured by the F-A8 lane: a wrongly-granted shim returns rows to a human,
    // bypassing agent_receipts_visible's bookkeeper floor AND both arm predicates. On the six
    // firm-scoped shims that is a cross-tenant read. `security_invoker = true` cannot close it —
    // measured to refuse the intended path with 42501 — so the ungrant is all there is.
    const census = `
      select c.relname,
             coalesce(nullif(split_part(acl::text, '=', 1), ''), 'PUBLIC') as grantee
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral unnest(coalesce(c.relacl, '{}'::aclitem[])) acl
       where n.nspname = 'clara'
         and (c.relname like '\\_agent\\_receipt\\_src\\_%' or c.relname = '_agent_receipts_all')
         and coalesce(nullif(split_part(acl::text, '=', 1), ''), 'PUBLIC') <> 'clara_fn_owner'`;
    const clean = await rootQuery(census);
    assert.equal(clean.rowCount, 0,
      `internal receipt views must have NO non-owner grantee; found ${JSON.stringify(clean.rows)}`);
    // The census must have SEEN the eight views — a query that matched nothing would also
    // return zero rows, and that YES would be meaningless.
    const seen = await rootQuery(
      `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'clara' and c.relkind = 'v'
          and (c.relname like '\\_agent\\_receipt\\_src\\_%' or c.relname = '_agent_receipts_all')`);
    assert.equal(seen.rows[0].n, 8, "seven shims plus the raw union");
    // THE ADVERSARIAL TWIN. Grant one, and the SAME census must name it. A census never shown to
    // fail is a claim, not a wall.
    await inRolledBackTx(async (client) => {
      await client.query("grant select on clara._agent_receipt_src_f_a3 to clara_authenticated");
      const dirty = await client.query(census);
      assert.equal(dirty.rowCount, 1, "the census names the wrongly-granted shim");
      assert.equal(dirty.rows[0].relname, "_agent_receipt_src_f_a3");
      assert.equal(dirty.rows[0].grantee, "clara_authenticated");
      // ...and this is what the grant actually costs: a direct read that skips both floors.
      const reachable = await client.query(
        "select has_table_privilege('clara_authenticated','clara._agent_receipt_src_f_a3','select') as ok");
      assert.equal(reachable.rows[0].ok, true,
        "the granted shim is now readable past the bookkeeper floor and both arm predicates");
    });
    // Rolled back: the estate is clean again, proven rather than assumed.
    assert.equal((await rootQuery(census)).rowCount, 0, "the grant did not survive the cell");
  });

test("pi-A10 · DARK ROWS — a shim projecting a NULL scope is invisible to everyone, and the "
  + "census catches it", async (t) => {
    if (gate(t)) return;
    // The one failure the conformance checker CANNOT see: `null::text as scope` has the right
    // name and the right type, so arity and types conform and the checker passes — but NULL
    // matches neither arm of the scope floor, so every one of that member's rows is visible to
    // nobody, with no error at DDL time and none at read time.
    const cols = await contract();
    assert.equal((await rootQuery(
      "select count(*)::int as n from clara.agent_receipt_dark_rows()")).rows[0].n, 0,
      "at pi every shim is a stub, so there is nothing dark yet");

    await inRolledBackTx(async (client) => {
      await client.query(`create table clara._rig_pi_dark (
        id bigserial primary key, firm_id uuid, scope text)`);
      await client.query("alter table clara._rig_pi_dark owner to clara_fn_owner");
      await client.query("insert into clara._rig_pi_dark(firm_id, scope) values ($1, null)",
        [world.firms.A]);
      // Everything conforms EXCEPT the value of scope.
      const proj = cols.map((c) => (c.column_name === "scope" ? "d.scope as scope"
        : c.column_name === "firm_id" ? "d.firm_id as firm_id"
          : c.column_name === "receipt_kind" ? "'bank_agent'::text as receipt_kind"
            : c.column_name === "receipt_id" ? "d.id::text as receipt_id"
              : `null::${c.data_type} as ${c.column_name}`)).join(", ");
      // Baseline BEFORE the dark row lands: F-A7 beta wires f_a7's shim to the real
      // `agent_filing_receipts` table, so by the time this runs in the full estate suite other
      // files' fixtures may already have real (non-dark) rows in the union — the six remaining
      // stub shims still contribute nothing, but the raw union is no longer provably empty. The
      // dark-row claim is about the DELTA this cell itself introduces, not an absolute count.
      const baseline = (await client.query(
        "select count(*)::int as n from clara._agent_receipts_all")).rows[0].n;
      await client.query(
        `create or replace view clara._agent_receipt_src_f_a3 as select ${proj} from clara._rig_pi_dark d`);
      // The checker is HAPPY — that is the whole point of this cell.
      await client.query("select clara._assert_receipt_surface_conforms('_agent_receipt_src_f_a3')");
      // The row is real and reaches the raw union...
      assert.equal((await client.query(
        "select count(*)::int as n from clara._agent_receipts_all")).rows[0].n, baseline + 1,
        "the union grows by exactly the one dark row this cell inserted");
      // ...and is visible to NOBODY, including the firm that owns it.
      await client.query("select set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: world.users.bob, role: "authenticated" })]);
      await client.query(`set local role ${ROLES.authenticated}`);
      const seen = await client.query("select count(*)::int as n from clara.agent_receipts_visible");
      await client.query("set local role none");
      assert.equal(seen.rows[0].n, 0, "a NULL scope hides the row from its own firm");
      // The census is the net. Both instruments must name it.
      const dark = await client.query("select * from clara.agent_receipt_dark_rows()");
      assert.equal(dark.rowCount, 1, "the dark-row census names it");
      assert.equal(dark.rows[0].scope, null);
      assert.equal(Number(dark.rows[0].dark_rows), 1);
      const perShim = await client.query(
        "select item, dark_rows from clara.agent_receipt_source_census() where item = 'f_a3'");
      assert.equal(Number(perShim.rows[0].dark_rows), 1, "and the per-shim census attributes it");
    });
  });

test("pi-A8 · the contract registries are EXTEND-ONLY", async (t) => {
  if (gate(t)) return;
  await assertRaises("CLR08",
    () => rootQuery("update clara.agent_receipt_contract set nullable = true where ordinal = 3"),
    "UPDATE on the contract");
  await assertRaises("CLR08",
    () => rootQuery(
      "delete from clara.agent_receipt_contract where ordinal = (select max(ordinal) from clara.agent_receipt_contract)"),
    "DELETE from the contract");
  await assertRaises("CLR08",
    () => rootQuery("delete from clara.agent_receipt_surfaces where item = 'f_a8'"),
    "DELETE from the surface registry");
  // Extending is allowed — that is the "extend-never-weaken" half, and it must be shown.
  const arity = (await contract()).length;
  await inRolledBackTx(async (client) => {
    await client.query(
      `insert into clara.agent_receipt_contract(ordinal, column_name, data_type, nullable, semantics)
       select max(ordinal) + 1, 'rig_probe_col', 'text', true, 'rig extension probe'
         from clara.agent_receipt_contract`);
    const n = await client.query("select count(*)::int as n from clara.agent_receipt_contract");
    assert.equal(n.rows[0].n, arity + 1, "the contract extends");
  });
});

// ---------------------------------------------------------------------------------------
// B · THE FIRM-SCOPED QUESTION CARRIER
// ---------------------------------------------------------------------------------------

async function docFor(client, tag) {
  return ingestDocument({ kind: "human", sub: world.users.alice },
    { client, sha256: sha(`f-a7-pi-${tag}-${Math.random()}`), opKey: opk("doc") });
}

test("pi-B1 · firm_open_questions has NO client_id column (D-11), and the core writes one", async (t) => {
  if (gate(t)) return;
  const cols = await rootQuery(
    `select attname from pg_attribute where attrelid = 'clara.firm_open_questions'::regclass
       and attnum > 0 and not attisdropped`);
  const names = cols.rows.map((r) => r.attname);
  assert.ok(!names.includes("client_id"),
    "a client-bound question belongs in open_questions; this table cannot hold one");
  assert.ok(names.includes("document_id") && names.includes("firm_id"));

  const doc = await docFor(world.clients.A1, "b1");
  const r = await rootQuery(
    `select clara._firm_question_core($1,$2,null,null,$3,'unattributed',
       'Which client does this belong to?', '[{"client":"?"}]'::jsonb, null) as id`,
    [world.agent, world.firms.A, doc]);
  const row = (await rootQuery("select * from clara.firm_open_questions where id = $1", [r.rows[0].id])).rows[0];
  assert.equal(row.status, "open");
  assert.equal(row.kind, "unattributed");
  assert.equal(row.opened_by, world.agent);
  assert.equal(row.settled_by, null);
});

test("pi-B2 · the core REFUSES a cross-firm document and a malformed question", async (t) => {
  if (gate(t)) return;
  const docB = await docFor(world.clients.B1, "b2");
  await assertRaises("CLR11",
    () => rootQuery(
      `select clara._firm_question_core($1,$2,null,null,$3,'unattributed','q','[]'::jsonb,null)`,
      [world.agent, world.firms.A, docB]),
    "firm A cannot open a question about firm B's document");
  const docA = await docFor(world.clients.A1, "b2a");
  await assertRaises("CLR10",
    () => rootQuery(
      `select clara._firm_question_core($1,$2,null,null,$3,'unattributed','   ','[]'::jsonb,null)`,
      [world.agent, world.firms.A, docA]),
    "a blank question");
  await assertRaises("CLR10",
    () => rootQuery(
      `select clara._firm_question_core($1,$2,null,null,$3,'unattributed','q','{"a":1}'::jsonb,null)`,
      [world.agent, world.firms.A, docA]),
    "candidates must be a json ARRAY");
  await assert.rejects(
    () => rootQuery(
      `select clara._firm_question_core($1,$2,null,null,$3,'made_up_kind','q','[]'::jsonb,null)`,
      [world.agent, world.firms.A, docA]),
    /firm_open_questions_kind_check/,
    "the kind vocabulary is a closed world in the CHECK, not a comment");
});

test("pi-B3 · resolve/dismiss: the state machine, the role floor and the cross-firm refusal",
  async (t) => {
    if (gate(t)) return;
    const doc = await docFor(world.clients.A1, "b3");
    const mk = async () => (await rootQuery(
      `select clara._firm_question_core($1,$2,null,null,$3,'collision','which ROME?','[]'::jsonb,null) as id`,
      [world.agent, world.firms.A, doc])).rows[0].id;

    // A VIEWER cannot answer. CLR04 from _human_ctx's bookkeeper floor.
    const q0 = await mk();
    await assertRaises("CLR04",
      () => humanQuery(world.users.carol,
        "select clara.resolve_firm_question($1,'it is A1',$2,$3)", [q0, world.clients.A1, opk("rfq")]),
      "a viewer resolving");

    // The bookkeeper can, and the row records WHO and WHICH client.
    const q1 = await mk();
    await humanQuery(world.users.bob,
      "select clara.resolve_firm_question($1,'it is A1',$2,$3)", [q1, world.clients.A1, opk("rfq")]);
    const row = (await rootQuery("select * from clara.firm_open_questions where id = $1", [q1])).rows[0];
    assert.equal(row.status, "resolved");
    assert.equal(row.settled_by, world.users.bob);
    assert.equal(row.named_client, world.clients.A1);
    assert.ok(row.settled_at !== null);

    // A second answer refuses — settled is settled.
    await assertRaises("CLR10",
      () => humanQuery(world.users.bob,
        "select clara.resolve_firm_question($1,'again',$2,$3)", [q1, world.clients.A1, opk("rfq")]),
      "re-resolving a settled question");

    // A cross-firm client cannot be named.
    const q2 = await mk();
    await assertRaises("CLR11",
      () => humanQuery(world.users.bob,
        "select clara.resolve_firm_question($1,'wrong firm',$2,$3)", [q2, world.clients.B1, opk("rfq")]),
      "naming firm B's client");
    // ...and the question is still OPEN after the refusal — the raise rolled nothing forward.
    assert.equal((await rootQuery("select status from clara.firm_open_questions where id=$1", [q2]))
      .rows[0].status, "open");

    // A firm B human cannot even see it.
    await assertRaises("CLR11",
      () => humanQuery(world.users.dave,
        "select clara.resolve_firm_question($1,'mine now',null,$2)", [q2, opk("rfq")]),
      "firm B resolving firm A's question");

    // Dismissal settles without naming a client.
    await humanQuery(world.users.bob,
      "select clara.dismiss_firm_question($1,'duplicate',$2)", [q2, opk("dfq")]);
    const d = (await rootQuery("select * from clara.firm_open_questions where id = $1", [q2])).rows[0];
    assert.equal(d.status, "dismissed");
    assert.equal(d.named_client, null, "a dismissal names nobody — it is not an attribution");

    // A blank op key and a blank resolution both refuse.
    const q3 = await mk();
    await assertRaises("CLR10",
      () => humanQuery(world.users.bob,
        "select clara.resolve_firm_question($1,'x',null,'  ')", [q3]), "a blank op key");
    await assertRaises("CLR10",
      () => humanQuery(world.users.bob,
        "select clara.resolve_firm_question($1,'   ',null,$2)", [q3, opk("rfq")]), "a blank resolution");
  });

// ---------------------------------------------------------------------------------------
// C · THE NAME-FAMILY PREDICATE (D-4, D-19; prediction P-3)
// ---------------------------------------------------------------------------------------

test("pi-C1 · the leading token, both directions", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select clara.name_family_token('ROME PROPERTIES SDN BHD') a,
            clara.name_family_token('  rome-secretary ')       b,
            clara.name_family_token('Rome  Public   Advisory') c,
            clara.name_family_token('BEE CREATIVE SOLUTION')   d,
            clara.name_family_token('   ')                     e,
            clara.name_family_token(null)                      f,
            clara.name_family_token('!!!')                     g`);
  const x = r.rows[0];
  assert.equal(x.a, "rome"); assert.equal(x.b, "rome"); assert.equal(x.c, "rome");
  assert.equal(x.d, "bee", "a different family gets a different token");
  assert.equal(x.e, null); assert.equal(x.f, null);
  assert.equal(x.g, null, "a name with no alphanumeric content has NO token, so it joins no family");
});

test("pi-C2 · P-3 — the ROME family is >=2 over clients UNION counterparties, and the counterparty "
  + "arm is what makes it so; BEE is 1", async (t) => {
    if (gate(t)) return;
    // Two ROME CLIENTS and one ROME COUNTERPARTY, exactly the cardinalities ADR-0074 describes.
    // THE UNIQUENESS SUFFIX GOES AT THE END, NOT THE FRONT. `world.prefix` in front made every
    // party in the world share the leading token `rig`, so the predicate returned the whole
    // fixture and the cell "passed" its >=2 assertion for entirely the wrong reason. That is
    // the shape of a vacuous green: a corpus cell must be poisoned by nothing it did not name.
    const owner = world.users.alice;
    const uniq = world.prefix.replace(/[^a-z0-9]/gi, "");
    const c1 = (await humanQuery(owner, "select clara.create_client($1,$2) as r",
      [`ROME PROPERTIES ${uniq}`, opk("cli")])).rows[0].r.client_id;
    await humanQuery(owner, "select clara.create_client($1,$2)",
      [`ROME SECRETARY ${uniq}`, opk("cli")]);
    await humanQuery(owner, "select clara.create_client($1,$2)",
      [`BEE CREATIVE SOLUTION ${uniq}`, opk("cli")]);
    // ROME PUBLIC ADVISORY returns as a COUNTERPARTY, never a BELCORT client (constraint 13).
    await humanQuery(owner, "select clara.create_counterparty($1,'vendor',$2,null,null,$3)",
      [c1, `ROME PUBLIC ADVISORY ${uniq}`, opk("cp")]);

    const probe = "ROME anything";
    const all = await rootQuery(
      "select party_kind, party_name from clara.name_family_candidates($1,$2) order by party_name",
      [world.firms.A, probe]);
    const kinds = all.rows.map((r) => r.party_kind);
    // EXACT, not ">=": buildWorld mints a fresh firm per run, so this firm's ROME family is
    // exactly the three parties this cell created. An inequality here would hide a predicate
    // that over-matches.
    assert.equal(all.rowCount, 3,
      `the ROME family is exactly the three parties this cell made; got ${JSON.stringify(all.rows)}`);
    assert.ok(kinds.includes("client"), "clients contribute");
    assert.ok(kinds.includes("counterparty"),
      "the COUNTERPARTY contributes — a clients-only predicate could not see ADR-0074's own example");

    // DIFFERENTIAL, not self-referential: the same probe restricted to clients returns FEWER,
    // which is the measurement that proves the union arm is load-bearing.
    const clientsOnly = all.rows.filter((r) => r.party_kind === "client").length;
    assert.ok(clientsOnly < all.rowCount, "the counterparty arm adds parties a clients-only read misses");

    assert.equal((await rootQuery("select clara.name_family_is_ambiguous($1,$2) as amb",
      [world.firms.A, probe])).rows[0].amb, true, ">1 candidate ⇒ CLARIFY");

    const bee = await rootQuery(
      "select count(*)::int as n from clara.name_family_candidates($1,'BEE something')",
      [world.firms.A]);
    assert.equal(bee.rows[0].n, 1, "BEE CREATIVE SOLUTION is a family of one");
    assert.equal((await rootQuery(
      "select clara.name_family_is_ambiguous($1,'BEE something') as amb",
      [world.firms.A])).rows[0].amb, false, "one candidate is not a collision");
  });

test("pi-C3 · the predicate does not cross a firm boundary, and a tokenless name matches nothing",
  async (t) => {
    if (gate(t)) return;
    const fromB = await rootQuery(
      "select count(*)::int as n from clara.name_family_candidates($1,'ROME anything')",
      [world.firms.B]);
    assert.equal(fromB.rows[0].n, 0, "firm B sees none of firm A's ROME family");
    // ...and the admitting twin on the same probe, so the zero above is isolation and not a
    // predicate that returns nothing to anybody.
    const fromA = await rootQuery(
      "select count(*)::int as n from clara.name_family_candidates($1,'ROME anything')",
      [world.firms.A]);
    assert.equal(fromA.rows[0].n, 3, "firm A still sees its own three");
    const tokenless = await rootQuery(
      "select count(*)::int as n from clara.name_family_candidates($1,'!!!')", [world.firms.A]);
    assert.equal(tokenless.rows[0].n, 0, "a NULL token matches nothing rather than everything");
    const nullFirm = await rootQuery(
      "select count(*)::int as n from clara.name_family_candidates(null,'ROME anything')");
    assert.equal(nullFirm.rows[0].n, 0, "a NULL firm matches nothing (fail-closed, not fail-open)");
  });

// ---------------------------------------------------------------------------------------
// D · THE IDENTIFIER PROMOTION CARD (TA-P8 B)
// ---------------------------------------------------------------------------------------

const MODEL = '{"provider":"anthropic","model":"m","version":"v"}';

async function proposeCard(client = null, kind = "ssm", value = "AB-1234-X") {
  const r = await rootQuery(
    `select clara._identifier_promotion_core($1,$2,null,null,$3,$4,$5,3,
       '[{"region":"r1"}]'::jsonb,'seen three times',$6::jsonb) as id`,
    [world.agent, world.firms.A, client ?? world.clients.A2, kind, value, MODEL]);
  return r.rows[0].id;
}

test("pi-D1 · the card writes NO identifier (B9), and normalises exactly as the door does", async (t) => {
  if (gate(t)) return;
  const before = (await rootQuery(
    "select count(*)::int as n from clara.client_identifiers where client_id = $1", [world.clients.A2]))
    .rows[0].n;
  const id = await proposeCard(world.clients.A2, "ssm", "  ab 1234 X ");
  const after = (await rootQuery(
    "select count(*)::int as n from clara.client_identifiers where client_id = $1", [world.clients.A2]))
    .rows[0].n;
  assert.equal(after, before, "proposing writes NO client_identifiers row — a card is not a key");
  const card = (await rootQuery(
    "select * from clara.client_identifier_promotions where id = $1", [id])).rows[0];
  assert.equal(card.status, "proposed");
  assert.equal(card.value_normalized, "ab1234x",
    "the card stores the value the DOOR would store, so it cannot promise what the door will not write");
  assert.equal(card.identifier_id, null);
});

test("pi-D2 · confirming writes EXACTLY ONE identifier and records the confirming human", async (t) => {
  if (gate(t)) return;
  const id = await proposeCard(world.clients.A2, "tin", "C1234567890");
  const before = (await rootQuery(
    "select count(*)::int as n from clara.client_identifiers where client_id = $1", [world.clients.A2]))
    .rows[0].n;
  const out = await humanQuery(world.users.bob,
    "select clara.confirm_identifier_promotion($1,$2) as r", [id, opk("cip")]);
  const after = await rootQuery(
    "select * from clara.client_identifiers where client_id = $1 order by added_at", [world.clients.A2]);
  assert.equal(after.rowCount, before + 1, "exactly one identifier, never two");
  const written = after.rows[after.rowCount - 1];
  assert.equal(written.value_normalized, "c1234567890");
  assert.equal(written.added_by, world.users.bob, "the DOOR records the confirming human, not the agent");
  const card = (await rootQuery(
    "select * from clara.client_identifier_promotions where id = $1", [id])).rows[0];
  assert.equal(card.status, "confirmed");
  assert.equal(card.settled_by, world.users.bob);
  assert.equal(card.identifier_id, written.id);
  assert.equal(out.rows[0].r.identifier_id, written.id);

  // A second confirmation refuses, and writes nothing more.
  await assertRaises("CLR10",
    () => humanQuery(world.users.bob,
      "select clara.confirm_identifier_promotion($1,$2)", [id, opk("cip")]),
    "re-confirming a settled card");
  const still = (await rootQuery(
    "select count(*)::int as n from clara.client_identifiers where client_id = $1", [world.clients.A2]))
    .rows[0].n;
  assert.equal(still, before + 1, "still exactly one");
});

test("pi-D3 · declining writes no identifier; a viewer cannot confirm; a cross-firm card refuses",
  async (t) => {
    if (gate(t)) return;
    const id = await proposeCard(world.clients.A2, "bank_account", "5551234567");
    await assertRaises("CLR04",
      () => humanQuery(world.users.carol,
        "select clara.confirm_identifier_promotion($1,$2)", [id, opk("cip")]),
      "a viewer confirming");
    await assertRaises("CLR11",
      () => humanQuery(world.users.dave,
        "select clara.confirm_identifier_promotion($1,$2)", [id, opk("cip")]),
      "firm B confirming firm A's card");
    const before = (await rootQuery(
      "select count(*)::int as n from clara.client_identifiers where client_id = $1", [world.clients.A2]))
      .rows[0].n;
    await humanQuery(world.users.bob,
      "select clara.decline_identifier_promotion($1,'not stable',$2)", [id, opk("dip")]);
    const card = (await rootQuery(
      "select * from clara.client_identifier_promotions where id = $1", [id])).rows[0];
    assert.equal(card.status, "declined");
    assert.equal(card.identifier_id, null);
    assert.equal((await rootQuery(
      "select count(*)::int as n from clara.client_identifiers where client_id = $1", [world.clients.A2]))
      .rows[0].n, before, "a decline writes nothing");
  });

test("pi-D4 · the card's kind vocabulary MIRRORS client_identifiers' closed world", async (t) => {
  if (gate(t)) return;
  // Differential against the LIVE constraint text, not against a list in this file.
  const live = (await rootQuery(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid = 'clara.client_identifiers'::regclass and conname = 'client_identifiers_kind_check'`))
    .rows[0].d;
  const card = (await rootQuery(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid = 'clara.client_identifier_promotions'::regclass
        and conname = 'client_identifier_promotions_kind_check'`)).rows[0].d;
  const kindsOf = (s) => [...s.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
  assert.deepEqual(kindsOf(card), kindsOf(live),
    "a card kind the door cannot accept would be a promise the door refuses");
  await assert.rejects(() => proposeCard(world.clients.A2, "passport", "X1"),
    /client_identifier_promotions_kind_check/, "and the CHECK says no, behaviourally");
});

// ---------------------------------------------------------------------------------------
// E · WHAT PI DID NOT SHIP — the reachability census
// ---------------------------------------------------------------------------------------

test("pi-E1 · pi itself minted NO wake authority — any filing-kind rows, wrappers, or reachable "
  + "cores present on this chain are train beta's, not pi's", async (t) => {
  if (gate(t)) return;
  // Catalog-derived per this file's own gating law (SS0): beta is real on this chain now, so
  // "pi minted nothing" is asserted as a DELTA against beta's own known, tail-census-pinned
  // footprint (0126: exactly six filing-kind allowlist rows, five wake wrappers) rather than as
  // an absolute zero — the boundary claim under test is pi's OWN scope, not beta's absence.
  const rows = await rootQuery(
    "select count(*)::int as n from clara.wake_fn_allowlist where wake_kind = 'filing'");
  const betaLanded = rows.rows[0].n > 0;
  assert.equal(rows.rows[0].n, betaLanded ? 6 : 0,
    "the filing kind and its rows are train beta's — zero if beta is absent, exactly beta's own "
    + "pinned six if beta has landed (0126 tail census)");
  const wrappers = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.proname = any($1)`,
    [["wake_open_firm_question", "wake_reattribute_document",
      "wake_propose_filing_correction", "wake_propose_identifier_promotion", "wake_file_document"]]);
  assert.equal(wrappers.rowCount, betaLanded ? 5 : 0,
    `every wake wrapper here is beta's — pi ships none of its own: `
    + `${wrappers.rows.map((r) => r.proname).join(", ")}`);
  // ...and the cores PI ITSELF ships are reachable by no app role, which is why beta is cheap —
  // true whether or not beta has since landed alongside it (beta's own wake_* wrappers delegate
  // to beta's OWN cores, granted only to clara_wake_filing, never to the four roles probed here).
  for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.runtime]) {
    for (const sig of [
      "clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)",
      "clara._identifier_promotion_core(uuid,uuid,uuid,text,uuid,text,text,int,jsonb,text,jsonb)"]) {
      const r = await rootQuery("select has_function_privilege($1,$2,'execute') as ok", [role, sig]);
      assert.equal(r.rows[0].ok, false, `${role} must not EXECUTE ${sig}`);
    }
  }
  // The admitting twin: the human verbs ARE reachable, so the probe above is not simply broken.
  const human = await rootQuery(
    "select has_function_privilege($1,'clara.resolve_firm_question(uuid,text,uuid,text)','execute') as ok",
    [ROLES.authenticated]);
  assert.equal(human.rows[0].ok, true);
});

test("pi-E2 · pi itself minted no wake role — a clara_wake_filing role present on this chain is "
  + "train beta's own machine role, not pi's", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    "select rolname from pg_roles where rolname like 'clara%' order by rolname");
  const names = r.rows.map((x) => x.rolname);
  // Same DELTA shape as pi-E1: beta (0126) is real on this chain and mints clara_wake_filing as
  // its own machine role, so pi's "mints nothing" claim is checked against beta's OWN presence
  // rather than as an absolute absence.
  const betaFilingRows = await rootQuery(
    "select count(*)::int as n from clara.wake_fn_allowlist where wake_kind = 'filing'");
  const betaLanded = betaFilingRows.rows[0].n > 0;
  assert.equal(names.includes("clara_wake_filing"), betaLanded,
    betaLanded
      ? "clara_wake_filing exists — F-A7/PR-4 beta (0126) minted it as its own machine role"
      : "annexes-1 A.1's floor name is a KIND gated by assert_wake_allowed; pi itself mints no role");
  assert.ok(names.includes("clara_wake_interactive") && names.includes("clara_wake_proactive"),
    "and the two wake roles that do exist either way are still there — the probe can see roles");
});
