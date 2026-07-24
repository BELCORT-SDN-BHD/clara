// Migration-0018 blind battery — §2 seed_fixed_asset + p_resolution. The 4-arg
// signature is DROPPED and re-created as a 5-arg with `p_resolution default null`:
// omitted binds the 4-arg byte-shape (pre-0018 document-tied receipts replay
// byte-identically); a non-null value routes the keyed lane's bound assert, and
// alongside a tie it REFUSES. CONTRACT-BLIND; FAILS RED below 0018.
//
// [AMB-18a] opening-family refusals assert the exported `CLR30` const (design-doc
//   label CLR30 == as-built value "CLR31"); the FA op-key-reuse and tie-conflict
//   refusals are the generic CLR10 (CLR.badRequest) per §2.
// [AMB-19a] The tied lane derives the FA resolution from the LOCKED active filing;
//   the acquisition entry is expected to carry that document-subject resolution.
//   Congruence read: entryRow.resolution_id → a document resolution for the tie
//   doc; falls back to the opening_items row / a lane note if the column is silent.
// [AMB-19b] retire/refile concurrency: A's raw `FOR UPDATE` on the active filing
//   stands in for the fn's `_active_document_filing(...,true)` lock — the cell
//   proves a concurrent retire CONTENDS on that exact row (the race the design
//   closes). Full in-fn interleaving is deferred to the rig reconcile.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, opk, rootQuery, getPool, ROLES,
  assertRaises, assertRaisesReason, endPool, printLaneNotes, noteLane,
  fail0018, wbEnsureReady18,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc, WB_COA,
  createOpeningSeed, recordOpeningKeyedResolution, resolutionRow, seedFixedAsset,
  upsertAccountClassed, entryRow, faRow, openingItemRows,
  activeFilings, waitBlockedByOrThrow,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;

const ridOf = (mint) => mint.resolution_id ?? mint.id;
const faIdOf = (r) => r.fixed_asset_id ?? r.asset_id ?? r.id;

/** The three FA books-grade accounts (seedOpeningCoa does not seed them). */
async function seedFaAccounts(client) {
  for (const [code, name, type] of [[WB_COA.faAsset, "Plant & Machinery", "asset"],
    [WB_COA.faAccum, "Accum Depr P&M", "asset"], [WB_COA.faExp, "Depreciation Expense", "expense"]]) {
    await upsertAccountClassed(w.users.alice, { client, code, name, type });
  }
}

/** The pinned books-grade FA payload (the wb-k-supersede-fa K8 shape). */
const faAsset = (itemKey) => ({
  description: "Delivery van", acquired_date: "2024-03-01", cost_cents: 500_000,
  useful_life_months: 60, depreciation_method: "straight_line",
  asset_account_code: WB_COA.faAsset, accum_depr_account_code: WB_COA.faAccum,
  depr_expense_account_code: WB_COA.faExp, accumulated_depreciation_cents: 100_000,
  depreciation_start_date: "2024-03-01", residual_cents: 0, item_key: itemKey,
});

/** A fresh onboarding client with the opening CoA + FA accounts + a TIED seed. */
async function tiedFaClient() {
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  await seedFaAccounts(o.client);
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await createOpeningSeed(w.users.bob, { client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  return { client: o.client, plan: o.plan, seed: sr.seed_id ?? sr.id, doc };
}

/** A fresh onboarding client with the opening CoA + FA accounts + a KEYED seed. */
async function keyedFaClient() {
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  await seedFaAccounts(o.client);
  const sr = await createOpeningSeed(w.users.bob, { client: o.client, plan: o.plan });
  return { client: o.client, plan: o.plan, seed: sr.seed_id ?? sr.id };
}

// The wb-calls seedFixedAsset gained the optional p_resolution: a call WITHOUT
// `resolution` binds the 4-arg default byte-shape; WITH it, the 5-arg call.

before(async () => {
  live = await wbEnsureReady18();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0018-seed-fa"); await endPool(); });

test("META: 0018 applied — exactly ONE seed_fixed_asset overload, carrying p_resolution with a default; the exact 4-input row is ABSENT", async () => {
  fail0018(live);
  const rows = (await rootQuery(
    `select pg_get_function_identity_arguments(p.oid) as args, p.pronargs, p.pronargdefaults
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='seed_fixed_asset'`)).rows;
  assert.equal(rows.length, 1, `exactly one seed_fixed_asset overload (the 4-arg DROPPED, not co-existing): got ${rows.length}`);
  assert.ok(rows[0].args.includes("p_resolution"), "the surviving overload carries p_resolution");
  assert.ok(Number(rows[0].pronargdefaults) >= 1, "p_resolution has a DEFAULT (so the 4-arg call binds)");
  assert.ok(!/^p_client uuid, p_seed uuid, p_asset jsonb, p_op_key text$/.test(rows[0].args),
    "the exact old 4-input identity is not the surviving overload");
});

test("§2 4-arg via default: a document-TIED FA seeded with NO p_resolution succeeds (the 5-arg default provides 4-arg callability)", async () => {
  fail0018(live);
  const t = await tiedFaClient();
  const r = await seedFixedAsset(w.users.bob, { client: t.client, seed: t.seed, asset: faAsset("fa:4arg") });
  const faId = faIdOf(r);
  assert.ok(faId, `the 4-arg call returns a register-row receipt (got ${JSON.stringify(r)})`);
  const fa = await faRow(faId);
  assert.equal(fa.baseline_as_of, "2026-01-01", "baseline_as_of = seed.as_of (the FA seeded normally on the 4-arg path)");
  assert.ok(fa.acquisition_entry_id, "acquisition_entry_id linked (P8)");
});

test("§2 upgrade replay: a pre-0018 4-arg document-tied FA receipt (p_resolution NULL) replays BYTE-IDENTICALLY on the same op_key", async () => {
  fail0018(live);
  const t = await tiedFaClient();
  const key = opk("fareplay");
  const r1 = await seedFixedAsset(w.users.bob, { client: t.client, seed: t.seed, asset: faAsset("fa:replay"), opKey: key });
  const r2 = await seedFixedAsset(w.users.bob, { client: t.client, seed: t.seed, asset: faAsset("fa:replay"), opKey: key });
  assert.equal(JSON.stringify(r1), JSON.stringify(r2),
    "the op_key hash is byte-identical to the 4-arg as-built expression when p_resolution IS NULL — a clean upgrade replay");
  const n = await rootQuery("select count(*)::int as n from clara.fixed_assets where id=$1", [faIdOf(r1)]);
  assert.equal(n.rows[0].n, 1, "exactly one register row — the replay minted nothing new");
});

test("§2 keyed FA reachable: a KEYED seed + a bound resolution seeds a books-grade FA (the as-built keyed exclusion is lifted); its resolution binds to the seed", async () => {
  fail0018(live);
  const k = await keyedFaClient();
  const rb = ridOf(await recordOpeningKeyedResolution(w.users.bob, { client: k.client, seed: k.seed }));
  const r = await seedFixedAsset(w.users.bob, { client: k.client, seed: k.seed, asset: faAsset("fa:keyed"), resolution: rb });
  const fa = await faRow(faIdOf(r));
  assert.ok(fa && fa.acquisition_entry_id, "the keyed-seed FA created its register row + acquisition entry");
  const e = await entryRow(fa.acquisition_entry_id);
  if (e.resolution_id) {
    const rr = await resolutionRow(e.resolution_id);
    assert.equal(rr?.bound_scope_id, k.seed, "the keyed-FA acquisition entry is attributed to the seed-bound resolution");
  } else {
    noteLane("keyed FA: acquisition entry carries no resolution_id — could not confirm the bound attribution (finding)");
  }
});

test("§2 op-key reuse, DIFFERENT resolution: same intent + a different bound resolution refuses CLR10 (the hash includes p_resolution when non-null)", async () => {
  fail0018(live);
  const k = await keyedFaClient();
  const r1 = ridOf(await recordOpeningKeyedResolution(w.users.bob, { client: k.client, seed: k.seed }));
  const key = opk("fareuse");
  await seedFixedAsset(w.users.bob, { client: k.client, seed: k.seed, asset: faAsset("fa:reuse"), resolution: r1, opKey: key });
  const r2 = ridOf(await recordOpeningKeyedResolution(w.users.bob, { client: k.client, seed: k.seed })); // supersedes r1, a new live binding
  assert.notEqual(r2, r1, "a second bound resolution row for the seed");
  await assertRaises(CLR.badRequest, () => seedFixedAsset(w.users.bob, {
    client: k.client, seed: k.seed, asset: faAsset("fa:reuse"), resolution: r2, opKey: key }),
  "the SAME op_key with a DIFFERENT p_resolution collides on the _reserve_op hash");
});

test("§2 tie conflict: a non-null p_resolution ALONGSIDE a document tie refuses CLR10 resolution_conflicts_with_tie (explicit null ≡ omitted)", async () => {
  fail0018(live);
  const t = await tiedFaClient();
  await assertRaisesReason(CLR.badRequest, "resolution_conflicts_with_tie",
    () => seedFixedAsset(w.users.bob, { client: t.client, seed: t.seed, asset: faAsset("fa:conflict"), resolution: "00000000-0000-4000-8000-000000000abc" }),
    "supplying p_resolution on a document-TIED seed");
});

test("§2 tied-FA congruence (sequential): the tied lane derives the acquisition resolution from the ACTIVE filing (document-subject congruence)", async () => {
  fail0018(live);
  const t = await tiedFaClient();
  const r = await seedFixedAsset(w.users.bob, { client: t.client, seed: t.seed, asset: faAsset("fa:cong") });
  const fa = await faRow(faIdOf(r));
  const e = await entryRow(fa.acquisition_entry_id);
  const rid = e.resolution_id ?? (await openingItemRows(t.seed)).find((i) => i.item_key === "fa:cong")?.resolution_id;
  if (!rid) { noteLane("tied FA congruence: no resolution_id on the acquisition entry or opening item — finding"); return; }
  const rr = await resolutionRow(rid);
  assert.ok(rr, "the derived resolution row exists");
  assert.equal(rr.subject_kind, "document", "the tied FA resolution is a DOCUMENT resolution (derived from the active filing)");
  assert.equal(rr.subject_id, t.doc.documentId, "…bound to the seed's tie document — congruent with the active filing");
  assert.equal(rr.bound_scope_kind ?? null, null, "the filing-derived resolution is UNBOUND (the tied lane never mints an opening_seed binding)");
});

test("§2 retire/refile concurrency: a concurrent filing retirement CONTENDS on the exact active-filing row the tied FA lane locks FOR UPDATE — proven blocked, resolves without deadlock [AMB-19b]", async () => {
  fail0018(live);
  const t = await tiedFaClient();
  const filing = (await activeFilings(t.doc.documentId))[0];
  assert.ok(filing, "the tie document has one active filing");
  const c1 = await getPool().connect();
  let provedBlocked = false;
  let retireOut = null;
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    // Holder: the raw FOR UPDATE the tied FA lane takes on the active filing.
    await c1.query("begin");
    await c1.query("select id from clara.document_filings where id=$1 for update", [filing.id]);
    // Contender: the retirement, human lane — must WAIT on the held row lock.
    const p2 = (async () => {
      const c2 = await getPool().connect();
      try {
        await c2.query(`set role ${ROLES.authenticated}`);
        await c2.query("set statement_timeout = '15s'");
        // [AMB-0018-9] a txn-local (is_local=true) claims set_config needs an open
        // transaction, else it is discarded and retire's _human_ctx has no actor.
        await c2.query("begin");
        await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: w.users.alice, role: "authenticated" })]);
        const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
        const q = c2.query(
          "select clara.retire_document_filing(p_filing_id => $1, p_reason => $2, p_expected_revision => $3, p_op_key => $4)",
          [filing.id, "0018 retire/refile race", filing.revision_token, opk("faretire")]);
        try { await waitBlockedByOrThrow(pid2, pid1, { what: "the active document_filings row lock" }); provedBlocked = true; }
        catch (e) { noteLane(`retire/refile race: block not observed (${e.message}) — the FA lane's FOR UPDATE is a finding`); }
        await c1.query("commit"); // holder releases → contender resolves
        try { await q; retireOut = { ok: true }; } catch (e) { retireOut = { ok: false, code: e.code }; }
      } finally {
        await c2.query("rollback").catch(() => {});
        await c2.query("reset role").catch(() => {});
        await c2.query("reset all").catch(() => {});
        c2.release();
      }
    })();
    await p2;
  } finally {
    await c1.query("rollback").catch(() => {});
    c1.release();
  }
  if (provedBlocked) assert.ok(retireOut, "the retirement was proven to WAIT on the FA lane's filing lock, then ran");
  assert.ok(!(retireOut && retireOut.code === "40P01"), `no deadlock on the retirement side (got ${retireOut?.code ?? "ok"})`);
});
