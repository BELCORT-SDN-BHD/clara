// Wave-B battery — Block K structure (K1 seeded-once registry · K2 opening_items
// CHECK matrix · K7 OBE/RE markers · RLS posture on the K tables).
// CONTRACT-BLIND; FAILS (never skips) below 0017. Two-session/approval cells
// live in wb-k-approval; writer-behavior cells in wb-k-obwriter.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, CLR30, PG, ROLES, rootQuery, roleQuery, opk,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes,
  fail0017, wbEnsureReady, fnExists, rlsFlags, checkDefs, detailReason,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, seedMarkers, openingDoc,
  createOpeningSeed, cancelOpeningSeed, seedRegRow,
  rawBalancedEntry, rawOpeningItem, upsertAccountClassed, filedDocument,

} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let onb = null;
let doc = null;
let seed = null; // the file-level open seed the K2 matrix rides
let cp = null; // a raw vendor counterparty for the ar/ap kind CHECKs

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: onb.client });
  const r = await createOpeningSeed(w.users.bob, {
    client: onb.client, plan: onb.plan, asOf: "2026-01-01",
    tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  seed = r.seed_id ?? r.id;
  cp = randomUUID();
  await rootQuery(
    `insert into clara.counterparties(id,firm_id,client_id,kind,name,name_normalized,created_by)
     values ($1,$2,$3,'vendor','WB K2 Vendor','wbk2vendor',$4)`,
    [cp, w.firms.A, onb.client, w.users.alice]);
});
after(async () => { printLaneNotes("wb-k-registry"); await endPool(); });

test("META: 0017 applied — K-block tables + writers present", async () => {
  fail0017(live);
  for (const t of ["opening_seed_registry", "opening_items", "opening_tb_targets", "opening_seed_approvals"]) {
    const r = await rootQuery(
      "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'", [t]);
    assert.ok(r.rows.length, `clara.${t} exists`);
  }
  for (const fn of ["create_opening_seed", "draft_opening_item", "approve_opening_seed", "reopen_opening_seed"]) {
    assert.ok(await fnExists(fn), `clara.${fn} exists`);
  }
  assert.ok(seed, "the file-level seed minted (bookkeeper maker lane)");
  assert.equal((await seedRegRow(seed)).state, "open", "registry state 'open'");
});

test("K1: the maker floor is bookkeeper+ — a viewer cannot create a seed (CLR04)", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await assertRaises(CLR.authz, () => createOpeningSeed(w.users.carol, {
    client: o2.client, plan: o2.plan,
  }), "viewer create_opening_seed");
});

test("K1: the tie document must be an ACTIVE verified opening_balance_doc filing (an invoice refuses)", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  const wrong = await filedDocument(w.users.alice, { firm: w.firms.A, client: o2.client, kind: "invoice" });
  await assertRaisesOneOf([CLR.provenance, CLR.badRequest], () => createOpeningSeed(w.users.bob, {
    client: o2.client, plan: o2.plan, tieDocument: wrong.documentId, tieSha256: wrong.sha256,
  }), "invoice as the tie document");
});

test("K1: a SECOND semantic seed RAISES (partial unique — receipts replay, the registry raises)", async () => {
  fail0017(live);
  const err = await assertRaises(CLR30, () => createOpeningSeed(w.users.bob, {
    client: onb.client, plan: onb.plan, asOf: "2026-01-01",
    tieDocument: doc.documentId, tieSha256: doc.sha256, opKey: opk("dup"),
  }), "second semantic seed");
  assert.equal(detailReason(err) ?? "duplicate_seed", "duplicate_seed", "the CLR30 reason is duplicate_seed");
});

test("K1: same-op retry replays the create receipt byte-identically (one live registry row)", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const d2 = await openingDoc(w.users.alice, { firm: w.firms.A, client: o2.client });
  const key = opk("seedr");
  const args = { client: o2.client, plan: o2.plan, tieDocument: d2.documentId, tieSha256: d2.sha256, opKey: key };
  const r1 = await createOpeningSeed(w.users.bob, args);
  const r2 = await createOpeningSeed(w.users.bob, args);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "receipt replayed byte-identically");
  const n = await rootQuery(
    "select count(*)::int as n from clara.opening_seed_registry where client_id=$1 and state <> 'cancelled'", [o2.client]);
  assert.equal(n.rows[0].n, 1, "one live registry row");
});

test("K1: a CANCELLED seed frees the one-per-client slot [AMB-6 cancel verb]", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const d2 = await openingDoc(w.users.alice, { firm: w.firms.A, client: o2.client });
  const r1 = await createOpeningSeed(w.users.bob, { client: o2.client, plan: o2.plan, tieDocument: d2.documentId, tieSha256: d2.sha256 });
  const s1 = r1.seed_id ?? r1.id;
  await cancelOpeningSeed(w.users.hana, { seed: s1, reason: "restage" });
  assert.equal((await seedRegRow(s1)).state, "cancelled", "seed cancelled");
  const r2 = await createOpeningSeed(w.users.bob, { client: o2.client, plan: o2.plan, tieDocument: d2.documentId, tieSha256: d2.sha256 });
  assert.ok(r2.seed_id ?? r2.id, "a fresh seed can be created after cancel");
});

test("K1: an ACTIVE client is admitted with a management_account tie — the POSITIVE B-12 receipt [R3-F2]", async () => {
  fail0017(live);
  // R3 repair (memo 2): the old any-refusal tolerance was a false-green. The
  // active client's OWN plan (its committed onboarding plan) hosts the
  // incremental seed, and the receipt must be POSITIVE.
  await seedMarkers(w.users.alice, w.clients.A2);
  const ma = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A2, kind: "management_account" });
  const a2plan = (await rootQuery(
    "select id from clara.onboarding_plans where client_id=$1 order by created_at desc limit 1", [w.clients.A2])).rows[0]?.id;
  assert.ok(a2plan, "the active client carries its onboarding plan (the B-12 entry point)");
  const r = await createOpeningSeed(w.users.bob, {
    client: w.clients.A2, plan: a2plan, tieDocument: ma.documentId, tieSha256: ma.sha256,
  });
  assert.ok(r.seed_id ?? r.id, "the incremental seed minted on the ACTIVE client (WB-R16 — the RPR vehicle)");
});

test("K2: SST typed columns are ar/ap-only and all-three-or-none (CHECK matrix)", async () => {
  fail0017(live);
  const sst = { sst_portion_cents: 6000, sst_rate_bp: 800, sst_basis: "output tax carried" };
  await assertRaises(PG.checkViolation, async () => rawOpeningItem({
    firm: w.firms.A, client: onb.client, seed, maker: w.users.bob,
    entry: await rawBalancedEntry({ client: onb.client, maker: w.users.bob }),
    kind: "gl_balance", itemKey: `k2a_${opk("x")}`, extra: sst,
  }), "SST fields on gl_balance");
  await assertRaises(PG.checkViolation, async () => rawOpeningItem({
    firm: w.firms.A, client: onb.client, seed, maker: w.users.bob,
    entry: await rawBalancedEntry({ client: onb.client, maker: w.users.bob }),
    kind: "ap_open_item", itemKey: `k2b_${opk("x")}`,
    extra: { counterparty_id: cp, sst_rate_bp: 800 },
  }), "partial SST triple on ap_open_item");
  const ok = await rawOpeningItem({
    firm: w.firms.A, client: onb.client, seed, maker: w.users.bob,
    entry: await rawBalancedEntry({ client: onb.client, maker: w.users.bob }),
    kind: "ap_open_item", itemKey: `k2c_${opk("x")}`,
    extra: { counterparty_id: cp, ...sst, item_ref: "INV-001", item_date: "2025-12-01" },
  });
  assert.ok(ok.rows[0].id, "full SST triple + counterparty on ap_open_item inserts (Wave F reads these)");
});

test("K2: counterparty is REQUIRED for ar/ap kinds and FORBIDDEN for gl/equity/obe", async () => {
  fail0017(live);
  await assertRaises(PG.checkViolation, async () => rawOpeningItem({
    firm: w.firms.A, client: onb.client, seed, maker: w.users.bob,
    entry: await rawBalancedEntry({ client: onb.client, maker: w.users.bob }),
    kind: "ar_open_item", itemKey: `k2d_${opk("x")}`,
  }), "ar item without a counterparty");
  await assertRaises(PG.checkViolation, async () => rawOpeningItem({
    firm: w.firms.A, client: onb.client, seed, maker: w.users.bob,
    entry: await rawBalancedEntry({ client: onb.client, maker: w.users.bob }),
    kind: "gl_balance", itemKey: `k2e_${opk("x")}`, extra: { counterparty_id: cp },
  }), "counterparty on a gl item");
});

test("K2: (seed_id, item_key) is unique and entry_id is 1:1 — a re-run is a conflict, never a double post", async () => {
  fail0017(live);
  const key = `k2f_${opk("x")}`;
  const e1 = await rawBalancedEntry({ client: onb.client, maker: w.users.bob });
  await rawOpeningItem({ firm: w.firms.A, client: onb.client, seed, maker: w.users.bob, entry: e1, kind: "gl_balance", itemKey: key });
  await assertRaises(PG.uniqueViolation, async () => rawOpeningItem({
    firm: w.firms.A, client: onb.client, seed, maker: w.users.bob,
    entry: await rawBalancedEntry({ client: onb.client, maker: w.users.bob }),
    kind: "gl_balance", itemKey: key,
  }), "duplicate item_key in a seed");
  await assertRaises(PG.uniqueViolation, () => rawOpeningItem({
    firm: w.firms.A, client: onb.client, seed, maker: w.users.bob, entry: e1,
    kind: "gl_balance", itemKey: `k2g_${opk("x")}`,
  }), "duplicate entry_id (the 1:1 anchor)");
});

test("K7: the special_acc_type CHECK admits both markers; the type-binding CHECKs hold; one-per-client", async () => {
  fail0017(live);
  const defs = await checkDefs("coa_accounts");
  assert.ok(defs.includes("'opening_balance_equity'"), "special CHECK admits opening_balance_equity");
  assert.ok(defs.includes("'retained_earnings'"), "special CHECK admits retained_earnings");
  for (const c of ["ck_coa_obe_equity", "ck_coa_retained_earnings_equity"]) {
    const r = await rootQuery("select 1 from pg_constraint where conname=$1", [c]);
    assert.ok(r.rows.length, `${c} exists`);
  }
  const o2 = await onboardingClient(w.users.hana);
  await assertRaises(PG.checkViolation, () => upsertAccountClassed(w.users.alice, {
    client: o2.client, code: "620-000", name: "Bad OBE", type: "expense", special: "opening_balance_equity",
  }), "OBE marker on a non-equity account");
  await seedMarkers(w.users.alice, o2.client);
  // K7 keeps the as-built upsert_account arity/body; that writer maps its
  // uq_coa_special 23505 to CLR10, while the index itself remains authoritative.
  await assertRaisesOneOf([PG.uniqueViolation, CLR.badRequest], () => upsertAccountClassed(w.users.alice, {
    client: o2.client, code: "901-RE2", name: "Second RE", type: "equity", special: "retained_earnings",
  }), "a second RE marker for the client (uq_coa_special)");
});

test("RLS posture: every new K table is FORCE-RLS'd with zero app-role DML", async () => {
  fail0017(live);
  for (const t of ["opening_seed_registry", "opening_items", "opening_tb_targets", "opening_seed_approvals"]) {
    const f = await rlsFlags(t);
    assert.ok(f?.rls && f?.force, `clara.${t} has RLS + FORCE RLS`);
    await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated,
      `insert into clara.${t} (id) values (gen_random_uuid())`), `direct INSERT into ${t} as authenticated`);
  }
});
