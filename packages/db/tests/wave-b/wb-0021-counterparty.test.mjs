// Wave-B rig — migration 0021: the HUMAN counterparty lane.
//
// WHY THIS FILE EXISTS AT ALL. 0021 landed with only the META cohorts covering it — the
// grant matrix (T17) and the definer invariant (T18). Those caught two real defects on the
// first run (the verb was not declared in the pinned grant set; it was left owned by the
// migration role rather than clara_fn_owner) and would catch neither of the two BEHAVIOURAL
// defects that actually matter here, both of which live in the create-or-get recovery:
//
//   (a) the recovery must key on `kind`, because the two unique indexes do
//       (0015:187-192). A name-only lookup returns the WRONG party when the same name is
//       held by a vendor and a customer for one client — a mis-attributed payable.
//   (b) the recovery must branch on WHICH index collided. When the collision is on
//       REGISTRATION and the two names differ, a name lookup finds nothing and the verb
//       reports a retired-party collision that never happened.
//
// Both are invisible to a single-call happy path. Every cell below drives the verb through
// the DATABASE, as a real member of the firm, and reads the committed row back.
//
// SCOPE. This verb mints a counterparty and NOTHING else. It does not code, resolve, match
// or merge, and identity resolution stays with `_resolve_counterparty` and the approve_entry
// birth path. So the cells assert what it does AND that the neighbouring authority is
// untouched: no entry, no filing, no resolution.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROLES, CLR, rootQuery, humanQuery, roleQuery, namedCall, assertRaises, opk, endPool,
  buildWorld,
} from "./wb-helpers.mjs";

const DEPLOY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "deploy");

let W = null;
let live = false;

before(async () => {
  try {
    const { ensureReady } = await import("../rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0021_'");
  live = r.rows.length > 0;
  if (live) W = await buildWorld();
});
after(async () => { await endPool(); });

/** At 20 migrations every cell here FAILS loudly rather than skipping (ratchet R4 F2). */
function fail0021() {
  if (!live) {
    throw new Error(
      "0021 NOT applied (clara.schema_migrations has no '0021_%' row) — clara.create_counterparty"
      + " does not exist, so the opening carry-down still cannot seed a payable or a receivable"
      + " before any entry exists. This battery is REQUIRED to fail against the 20-migration"
      + " prestate.");
  }
}

/** The verb, called as a real firm member through the governed surface. */
async function create(sub, { client, kind = "vendor", name, reg = null, tin = null, opKey }) {
  const specs = [{ name: "p_client" }, { name: "p_kind" }, { name: "p_name" },
                 { name: "p_registration_no" }, { name: "p_tin" }, { name: "p_op_key" }];
  const r = await humanQuery(sub, namedCall("create_counterparty", specs),
    [client, kind, name, reg, tin, opKey]);
  return r.rows[0].result;
}

const rowOf = async (id) => (await rootQuery(
  `select kind, name, name_normalized, registration_no, registration_normalized, tin,
          firm_id, client_id, created_by, merged_into, retired_at
     from clara.counterparties where id = $1`, [id])).rows[0];

// ===========================================================================

test("[0021] a bookkeeper mints a counterparty: the row lands normalised, attributed, and audited", async () => {
  fail0021();
  const name = `Lost Invention Sdn Bhd ${opk("n")}`;
  const res = await create(W.users.bob, {
    client: W.clients.A1, name, reg: "199801012345", tin: "C12345678901", opKey: opk("cp"),
  });
  assert.ok(res.counterparty_id, "the verb returns the minted id");
  assert.equal(res.created, true, "…and says it created rather than recovered");

  const row = await rowOf(res.counterparty_id);
  assert.equal(row.name, name, "the name is stored verbatim");
  assert.equal(row.name_normalized, name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    "…and normalised byte-identically to the approve_entry birth path (0011:3035-3037)");
  assert.equal(row.registration_normalized, "199801012345", "the registration normalises too");
  assert.equal(row.tin, "C12345678901", "the TIN is carried");
  assert.equal(row.firm_id, W.firms.A, "attributed to the caller's firm");
  assert.equal(row.client_id, W.clients.A1, "…and to the named client");
  assert.equal(row.created_by, W.users.bob, "…and to the HUMAN who minted it, not a service role");

  // The audit row, in the schema's own terms. `on_behalf_of` mirrors
  // wake_credentials.on_behalf_of and means a USER (0002:234) — a human-lane verb leaves it
  // null and puts the client in `args`, as upsert_account does (0004:395). audit_log carries
  // no FK on that column (0002:280), so a client id written there would have been silent.
  const aud = await rootQuery(
    `select actor, on_behalf_of, via_wake_kind, args, outcome from clara.audit_log
      where fn = 'create_counterparty' and args->>'counterparty_id' = $1`,
    [res.counterparty_id]);
  assert.equal(aud.rows.length, 1, "exactly one audit row, naming the party");
  assert.equal(aud.rows[0].actor, W.users.bob, "…attributed to the human who called it");
  assert.equal(aud.rows[0].on_behalf_of, null, "…with on_behalf_of NULL: nobody delegated this");
  assert.equal(aud.rows[0].via_wake_kind, null, "…and no wake kind: this is not a wake lane");
  assert.equal(aud.rows[0].args.client, W.clients.A1, "…and the client recorded in args");
  assert.equal(aud.rows[0].outcome, "ok", "…as a completed action");
});

test("[0021] create-or-get recovers on the REGISTRATION index even when the NAME differs", async () => {
  fail0021();
  // (b): the defect a name-only recovery has. Same registration, deliberately different
  // spelling of the name — which is the ordinary case, since one party is written
  // "Sdn Bhd", "SDN BHD" and "Sdn. Bhd." across three documents.
  const reg = `20240${Math.floor(Math.random() * 89999 + 10000)}`;
  const first = await create(W.users.bob, {
    client: W.clients.A1, name: `Acme Trading Sdn Bhd ${opk("a")}`, reg, opKey: opk("cp"),
  });
  const second = await create(W.users.bob, {
    client: W.clients.A1, name: `ACME TRADING SDN. BHD. ${opk("b")}`, reg, opKey: opk("cp"),
  });
  assert.equal(second.counterparty_id, first.counterparty_id,
    "the second call RECOVERED the existing party rather than forking it or raising");
  assert.equal(second.created, false, "…and says so honestly");

  const n = await rootQuery(
    "select count(*)::int n from clara.counterparties where client_id=$1 and registration_normalized=$2",
    [W.clients.A1, reg]);
  assert.equal(n.rows[0].n, 1, "exactly one row exists for that registration");
});

test("[0021] create-or-get recovers on the NAME index when there is no registration", async () => {
  fail0021();
  const name = `Kedai Runcit ${opk("k")}`;
  const first = await create(W.users.bob, { client: W.clients.A1, name, opKey: opk("cp") });
  const second = await create(W.users.bob, { client: W.clients.A1, name, opKey: opk("cp") });
  assert.equal(second.counterparty_id, first.counterparty_id, "recovered, not forked");
  assert.equal(second.created, false, "…and says so");
});

test("[0021] `kind` is part of the identity: one name, a vendor AND a customer, two rows", async () => {
  fail0021();
  // (a): a recovery that dropped `kind` would return the vendor here and silently attach a
  // RECEIVABLE to a payable party. Both unique indexes carry kind (0015:187-192); so must
  // the recovery.
  const name = `Bee Creative Enterprise ${opk("bc")}`;
  const vendor = await create(W.users.bob, { client: W.clients.A1, kind: "vendor", name, opKey: opk("cp") });
  const customer = await create(W.users.bob, { client: W.clients.A1, kind: "customer", name, opKey: opk("cp") });
  assert.notEqual(customer.counterparty_id, vendor.counterparty_id,
    "the customer is a DISTINCT party from the identically-named vendor");
  assert.equal(customer.created, true, "…genuinely created, not recovered from the vendor");
  assert.equal((await rowOf(vendor.counterparty_id)).kind, "vendor", "the vendor stayed a vendor");
  assert.equal((await rowOf(customer.counterparty_id)).kind, "customer", "…and the customer a customer");

  // the same split holds through the REGISTRATION index.
  const reg = `19990${Math.floor(Math.random() * 89999 + 10000)}`;
  const v2 = await create(W.users.bob, { client: W.clients.A1, kind: "vendor", name: `${name} R`, reg, opKey: opk("cp") });
  const c2 = await create(W.users.bob, { client: W.clients.A1, kind: "customer", name: `${name} R`, reg, opKey: opk("cp") });
  assert.notEqual(c2.counterparty_id, v2.counterparty_id,
    "one registration, two kinds, two parties — the registration index is kind-scoped too");
});

test("[0021] the same op_key REPLAYS its receipt; a different one does not double-mint", async () => {
  fail0021();
  const name = `Replay Holdings ${opk("r")}`;
  const key = opk("cp");
  const first = await create(W.users.bob, { client: W.clients.A1, name, opKey: key });
  const replay = await create(W.users.bob, { client: W.clients.A1, name, opKey: key });
  assert.deepEqual(replay, first, "the exact op_key returns the stored receipt byte-identically");
  assert.equal(replay.created, true,
    "…including the ORIGINAL `created` flag — a replay reports what happened, not what would happen now");

  const n = await rootQuery(
    "select count(*)::int n from clara.counterparties where client_id=$1 and name=$2",
    [W.clients.A1, name]);
  assert.equal(n.rows[0].n, 1, "one row, however many times the call arrives");
});

test("[0021] the op_key covers EVERY argument, so a changed one is refused, not ignored", async () => {
  fail0021();
  // `_reserve_op` replays on a matching request hash and raises CLR10 on a differing one, so
  // an argument left OUT of the hash is one a caller can change under a re-used op_key and
  // have silently discarded. A bookkeeper fixing a mistyped registration number and pressing
  // the button again must get an honest refusal, not a stale receipt for the row they were
  // trying to correct.
  const key = opk("cp");
  const name = `Hash Cover ${opk("h")}`;
  await create(W.users.bob, { client: W.clients.A1, name, reg: "200001011111", opKey: key });
  for (const [label, args] of [
    ["a changed registration", { name, reg: "200001012222" }],
    ["a dropped registration", { name, reg: null }],
    ["a changed TIN", { name, reg: "200001011111", tin: "C99999999999" }],
    ["a changed name", { name: `${name} X`, reg: "200001011111" }],
    ["a changed kind", { name, reg: "200001011111", kind: "customer" }],
  ]) {
    await assertRaises(CLR.badRequest,
      () => create(W.users.bob, { client: W.clients.A1, ...args, opKey: key }),
      `${label} under the same op_key`);
  }
  // …while a byte-identical retry still replays, which is the whole point of the key.
  const replay = await create(W.users.bob, {
    client: W.clients.A1, name, reg: "200001011111", opKey: key,
  });
  assert.equal(replay.created, true, "an identical retry replays the original receipt");
});

test("[0021] a blank registration and a NULL registration are the SAME request", async () => {
  fail0021();
  // The DB stores '' as NULL (both the row and the hash normalise first), so a UI that sends
  // an empty box on the retry must not trip the different-args refusal. This is the case that
  // would break if the hash were taken over the RAW arguments instead of the normalised ones.
  const key = opk("cp");
  const name = `Blank Reg ${opk("b")}`;
  const first = await create(W.users.bob, { client: W.clients.A1, name, reg: null, opKey: key });
  const again = await create(W.users.bob, { client: W.clients.A1, name, reg: "   ", opKey: key });
  assert.deepEqual(again, first, "'' and NULL are one request, as they are one stored value");
});

test("[0021] a client in ANOTHER firm is an honest refusal, not a silent no-op", async () => {
  fail0021();
  const before = await rootQuery("select count(*)::int n from clara.counterparties where client_id=$1",
    [W.clients.A1]);
  await assertRaises(CLR.notFound,
    () => create(W.users.dave, { client: W.clients.A1, name: "Cross Firm Bhd", opKey: opk("cp") }),
    "dave (firm B) minting against firm A's client");
  const after = await rootQuery("select count(*)::int n from clara.counterparties where client_id=$1",
    [W.clients.A1]);
  assert.equal(after.rows[0].n, before.rows[0].n, "…and nothing was written");
});

test("[0021] the floor is bookkeeper: a viewer is refused, a bookkeeper is not", async () => {
  fail0021();
  await assertRaises(CLR.authz,
    () => create(W.users.carol, { client: W.clients.A1, name: "Viewer Bhd", opKey: opk("cp") }),
    "carol (viewer) minting a counterparty");
  const ok = await create(W.users.bob, {
    client: W.clients.A1, name: `Floor Ok ${opk("f")}`, opKey: opk("cp"),
  });
  assert.ok(ok.counterparty_id, "the same call from a bookkeeper succeeds — the floor, not a blanket deny");
});

test("[0021] the arguments are validated before anything is reserved", async () => {
  fail0021();
  const cases = [
    ["a blank name", { name: "   ", opKey: opk("cp") }],
    ["a name of nothing", { name: "", opKey: opk("cp") }],
    ["an unknown kind", { name: "Kind Bhd", kind: "supplier", opKey: opk("cp") }],
    ["a null op_key", { name: "Nokey Bhd", opKey: null }],
    ["a blank op_key", { name: "Blankkey Bhd", opKey: "  " }],
  ];
  for (const [label, args] of cases) {
    await assertRaises(CLR.badRequest,
      () => create(W.users.bob, { client: W.clients.A1, ...args }), label);
  }
});

test("[0021] minting a counterparty authorizes NOTHING else — no entry, no filing, no resolution", async () => {
  fail0021();
  const snap = async () => (await rootQuery(
    `select (select count(*) from clara.journal_entries where client_id=$1)  entries,
            (select count(*) from clara.client_resolutions where client_id=$1) resolutions`,
    [W.clients.A2])).rows[0];
  const before = await snap();
  await create(W.users.bob, { client: W.clients.A2, name: `Inert Bhd ${opk("i")}`, opKey: opk("cp") });
  assert.deepEqual(await snap(), before,
    "the verb is inert outside clara.counterparties — creating a party is reference data, not authority");
});

test("[0021] the SHIPPED post-verify file passes, run VERBATIM", async () => {
  fail0021();
  // The artifact the owner runs at the end of the 0021 ceremony. Running it here is the only
  // thing that keeps it honest between deploys: it raises on the first failed invariant, so a
  // green run IS the assertion. Probe 1 asserts 0021 is the HEAD — correct for a ceremony,
  // and false on a rig database once 0022 lands, so this cell opts out EXPLICITLY through the
  // GUC the file documents rather than the file weakening its own predicate.
  const sql = readFileSync(join(DEPLOY_DIR, "wave-b-0021-postverify.sql"), "utf8");
  await rootQuery(`set local clara.postverify_allow_later = 'on'; ${sql}`);
});

test("[0021] the RUNTIME lane cannot mint a counterparty — this is a human act", async () => {
  fail0021();
  for (const role of [ROLES.runtime, ROLES.agentRo]) {
    if (!role) continue;
    const err = await roleQuery(role,
      `select clara.create_counterparty($1,'vendor','Runtime Bhd',null,null,$2)`,
      [W.clients.A1, opk("cp")]).then(() => null, (e) => e);
    assert.ok(err, `${role} must not be able to execute create_counterparty`);
    assert.equal(err.code, "42501", `${role} is refused at the GRANT, not inside the body`);
  }
});
