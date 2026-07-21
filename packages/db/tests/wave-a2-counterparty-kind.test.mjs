// Wave-A2 rig — kind-scoped counterparties (contract §4.2 + probe P3). CONTRACT-BLIND:
// from contract v1.0 §4.2 + the as-built counterparties DDL/uniqueness indexes (0009)
// + _resolve_counterparty (0011) — NEVER 0015 source. Invariants under test:
//
//   - The kind CHECK admits 'customer' (default stays 'vendor').
//   - BOTH uniqueness indexes are KIND-SCOPED: a vendor and a customer may share ONE
//     registration under a client (two rows — separate AR/AP subledger practice), and
//     likewise one unregistered name; a SECOND row of the SAME kind+key still refuses.
//   - _resolve_counterparty is kind-discriminating: a CUSTOMER proposal resolves to the
//     customer row and NEVER to the vendor row sharing that registration (M5).
//   - Aliases stay kind-agnostic (reused unchanged) on a customer-kind counterparty.
//
// The index/resolution properties are exercised by DIRECT counterparty rows (as root,
// bypassing RLS) so the uniqueness index — not the full AP/sales approve path — is the
// thing under test. Skips (loudly, counted) until 0015 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk, addAlias,
} from "./wave-a-fixtures.mjs";

let ready = false;
let has15 = false;
let world = null;

/** 0015 counterparty marker — the kind CHECK admits 'customer' (live catalog). */
async function has0015Kind() {
  const r = await rootQuery(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='counterparties' and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%customer%' limit 1`,
  );
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 not present — counterparties.kind CHECK lacks 'customer'"); return true; }
  return false;
}

const norm = (s) => (s == null ? null : String(s).replace(/[^a-zA-Z0-9]/g, "").toLowerCase());

/** Insert a counterparty row directly (root; superuser bypasses RLS). Satisfies the
 *  name_normalized / registration_normalized CHECKs. Returns id, or throws (e.g.
 *  23505 when the kind-scoped uniqueness index refuses a duplicate key+kind). */
async function rawCounterparty({ firm, client, kind, name, reg = null, createdBy }) {
  const r = await rootQuery(
    `insert into clara.counterparties
       (firm_id, client_id, kind, name, name_normalized, registration_no, registration_normalized, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [firm, client, kind, name, norm(name), reg, reg == null ? null : norm(reg), createdBy],
  );
  return r.rows[0].id;
}
async function resolve(client, proposal) {
  const r = await rootQuery("select clara._resolve_counterparty($1, $2::jsonb) as r", [client, JSON.stringify(proposal)]);
  return r.rows[0].r;
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await has0015Kind());
  if (has15) world = await buildWorld();
  else noteLane(ready ? "0015 counterparties.kind('customer') absent — kind suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-counterparty-kind"); printSkipCount("wave-a2-counterparty-kind"); await endPool(); });

// ===========================================================================
// The kind CHECK + kind-scoped uniqueness indexes (shape).
// ===========================================================================

test("§4.2 the counterparties.kind CHECK admits both 'vendor' and 'customer'", async (t) => {
  if (skip15(t)) return;
  const defs = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='counterparties' and c.contype='c'`,
  );
  const all = defs.rows.map((x) => x.def).join(" ~~ ");
  assert.ok(all.includes("'vendor'") && all.includes("'customer'"), `kind CHECK admits vendor + customer (got ${all.slice(0, 300)})`);
});

test("§4.2 BOTH counterparty uniqueness indexes are KIND-SCOPED (kind in the key)", async (t) => {
  if (skip15(t)) return;
  const idx = await rootQuery(
    `select i.relname as idx, pg_get_indexdef(ix.indexrelid) as def
       from pg_index ix join pg_class i on i.oid=ix.indexrelid join pg_class t on t.oid=ix.indrelid
       join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='counterparties' and ix.indisunique`,
  );
  const reg = idx.rows.find((r) => /registration_normalized/.test(r.def) && !/name_normalized/.test(r.def));
  // The unregistered-name index keys on name_normalized; only it carries that column
  // (its partial WHERE legitimately references registration_normalized IS NULL, so we
  // must NOT exclude defs that merely mention "registration").
  const name = idx.rows.find((r) => /name_normalized/.test(r.def));
  assert.ok(reg && /\bkind\b/.test(reg.def), `the registration uniqueness index is kind-scoped (got ${reg?.def})`);
  assert.ok(name && /\bkind\b/.test(name.def), `the unregistered-name uniqueness index is kind-scoped (got ${name?.def})`);
});

// ===========================================================================
// P3 — vendor + customer coexist on ONE registration; same kind still refuses.
// ===========================================================================

test("P3 a vendor and a customer may SHARE one registration under a client (kind-scoped) — two rows", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const reg = `2018${randomUUID().slice(0, 8).replace(/\D/g, "0")}`;
  const v = await rawCounterparty({ firm, client: clients.A1, kind: "vendor", name: `SHAREDREG VENDOR ${reg}`, reg, createdBy: users.alice });
  const c = await rawCounterparty({ firm, client: clients.A1, kind: "customer", name: `SHAREDREG CUSTOMER ${reg}`, reg, createdBy: users.alice });
  assert.ok(v && c && v !== c, "the vendor and customer sharing one registration are two distinct rows");
  // A SECOND vendor with the SAME registration must refuse (one live per client+kind+reg).
  await assert.rejects(
    () => rawCounterparty({ firm, client: clients.A1, kind: "vendor", name: `SHAREDREG VENDOR2 ${reg}`, reg, createdBy: users.alice }),
    (e) => e.code === "23505",
    "a second VENDOR sharing the registration refuses (the index is (client, kind, registration), not just (client, registration))",
  );
});

test("P3 a vendor and a customer may SHARE one unregistered name under a client (kind-scoped)", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const name = `SHARED NAME ${randomUUID().slice(0, 8)}`;
  const v = await rawCounterparty({ firm, client: clients.A2, kind: "vendor", name, createdBy: users.alice });
  const c = await rawCounterparty({ firm, client: clients.A2, kind: "customer", name, createdBy: users.alice });
  assert.ok(v && c && v !== c, "an unregistered vendor and customer of the same name coexist (kind-scoped name index)");
  await assert.rejects(
    () => rawCounterparty({ firm, client: clients.A2, kind: "customer", name, createdBy: users.alice }),
    (e) => e.code === "23505",
    "a second unregistered CUSTOMER of the same name refuses (kind-scoped)",
  );
});

// ===========================================================================
// P3 / M5 — a customer proposal never resolves to a vendor row.
// ===========================================================================

test("M5 a CUSTOMER proposal resolves to the customer row and NEVER to the vendor sharing that registration", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const reg = `2018${randomUUID().slice(0, 8).replace(/\D/g, "0")}`;
  const vendorId = await rawCounterparty({ firm, client: clients.A1, kind: "vendor", name: `XREG VENDOR ${reg}`, reg, createdBy: users.alice });
  const customerId = await rawCounterparty({ firm, client: clients.A1, kind: "customer", name: `XREG CUSTOMER ${reg}`, reg, createdBy: users.alice });

  // ASSUMPTION (contract §4.2 / pin: p_proposal gains a top-level `kind` key, default
  // 'vendor'): a customer proposal carries kind:'customer'. If 0015 keys it elsewhere,
  // a resolve to the vendor row is the very defect M5 guards — this test surfaces it.
  const asCustomer = await resolve(clients.A1, { new: { name: `XREG CUSTOMER ${reg}`, registration_no: reg }, kind: "customer" });
  const gotCust = asCustomer?.counterparty_id ?? null;
  assert.notEqual(gotCust, vendorId, "a customer proposal must NEVER resolve to the vendor row sharing the registration");
  if (gotCust !== customerId) noteLane(`customer proposal resolved to ${gotCust} (decision=${asCustomer?.decision}), expected the customer row ${customerId} — inspect the kind filter`);

  const asVendor = await resolve(clients.A1, { new: { name: `XREG VENDOR ${reg}`, registration_no: reg }, kind: "vendor" });
  const gotVend = asVendor?.counterparty_id ?? null;
  assert.notEqual(gotVend, customerId, "a vendor proposal must NEVER resolve to the customer row");
});

// ===========================================================================
// P3 — aliases stay kind-agnostic (reused unchanged) on a customer-kind row.
// ===========================================================================

test("§4.2 add_counterparty_alias is kind-agnostic — it works on a customer-kind counterparty", async (t) => {
  if (skip15(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const customerId = await rawCounterparty({ firm, client: clients.A2, kind: "customer", name: `ALIASABLE CUSTOMER ${randomUUID().slice(0, 6)}`, createdBy: users.alice });
  const alias = `former ${randomUUID().slice(0, 6)}`;
  await assert.doesNotReject(
    () => addAlias(users.alice, { client: clients.A2, counterparty: customerId, alias, origin: "former_name", opKey: opk("custalias") }),
    "an alias adds to a customer-kind counterparty (the alias writer is kind-agnostic, reused unchanged)",
  );
  const rows = await rootQuery("select 1 from clara.counterparty_aliases where counterparty_id=$1 and alias_normalized=$2", [customerId, norm(alias)]);
  assert.ok(rows.rows.length > 0, "the customer's alias row persisted");
});
