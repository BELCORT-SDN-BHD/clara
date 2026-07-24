// Migration-0018 blind battery — §1 SUBJECT-BOUND KEYED RESOLUTIONS. Written from
// docs/plan/wave-b-migration-0018-design.md ALONE (the 0018 SQL is NEVER read —
// a sibling lane writes it concurrently; these cells encode the CONTRACT, not the
// SQL). A divergence at reconcile is a FINDING for orchestrator adjudication, never
// a silent edit. FAILS RED below 0018 (fail0018 — the pins are not built yet).
//
// [AMB-18b] The bound-mint receipt key for the resolution id — encoded
//   {resolution_id} (mirrors record_client_resolution's receipt). `.id` accepted
//   as a fallback. Adjudication if the as-built key differs.
// [AMB-18c] The generic-assert and bound-assert refusal class is CLR01 (client
//   attribution) per §1 ("Refusal class CLR01"). Encoded firm.
// [AMB-18d] Supersession of a seed's live bound resolution is driven by minting a
//   SECOND bound resolution on the same seed (the partial index `where
//   superseded_at is null` permits one live per scope — so the mint must supersede
//   the prior). If the mint instead REFUSES a second-live, that is a finding.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, opk, rootQuery, getPool, ROLES, jtxt,
  assertRaises, assertRaisesReason, endPool, printLaneNotes, noteLane,
  fail0018, wbEnsureReady18, fnExists, hasColumn,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc, planRevision,
  createOpeningSeed, draftOpeningItem, recordOpeningTarget, updatePlan, commitOnboarding,
  recordOpeningKeyedResolution, resolutionRow, approveOpeningSeed, supersedeOpeningItem,
  approveOpeningCorrection, reopenOpeningSeed, freshResolution, draftEntryV3,
  upsertAccountClassed, openingItemRows, entryRow, seedRegRow, revMapOf, WB_COA,
  waitBlockedByOrThrow,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let G = null; // the seed-grain lifecycle state (staged in before)

const ridOf = (mint) => mint.resolution_id ?? mint.id; // [AMB-18b]

/** Onboard → deferred commit → ACTIVE, then a KEYED opening seed (no tie doc).
 *  The B-12 carry-down shape: seeds are creatable on a committed plan/active
 *  client (proven live in wb-k-approval K11). */
async function activeClientWithSeed() {
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  await updatePlan({ plan: o.plan, expectedRevision: o.revision, answeredBy: w.users.bob,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }] });
  await commitOnboarding(w.users.alice, { client: o.client, plan: o.plan, expectedPlanRevision: await planRevision(o.plan) });
  const sr = await createOpeningSeed(w.users.bob, { client: o.client, plan: o.plan });
  return { client: o.client, plan: o.plan, seed: sr.seed_id ?? sr.id };
}

/** A keyed target line (keyed provenance — the solo-approval idiom). */
const keyedTarget = (sub, seed, k, code, dr, cr) => recordOpeningTarget(sub, { seed, line: {
  line_key: k, account_code: code, source_label: k, debit_cents: dr, credit_cents: cr,
  provenance_kind: "keyed", entered_by: sub } });

before(async () => {
  live = await wbEnsureReady18();
  if (!live) return;
  w = await buildWaveBWorld();

  // The seed-grain lifecycle fixture: ONE active client + ONE keyed seed + ONE
  // bound resolution (Rb) reused across two items, a reopen/additive batch and a
  // same-seed supersede. bob (bookkeeper) mints + drafts; hana (admin) approves.
  const base = await activeClientWithSeed();
  const mint = await recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed });
  const rb = ridOf(mint);
  await keyedTarget(w.users.bob, base.seed, "cash", WB_COA.cash, 1_000, 0);
  await keyedTarget(w.users.bob, base.seed, "cap", WB_COA.shareCap, 0, 1_000);
  const i1 = await draftOpeningItem(w.users.bob, {
    client: base.client, seed: base.seed, resolution: rb,
    item: { item_kind: "gl_balance", item_key: "grain:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }] });
  const i2 = await draftOpeningItem(w.users.bob, {
    client: base.client, seed: base.seed, resolution: rb,
    item: { item_kind: "gl_balance", item_key: "grain:cap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 1_000 }] });
  G = { ...base, rb, drafts: [i1, i2] };
});
after(async () => { printLaneNotes("wb-0018-binding-mint"); await endPool(); });

test("META: 0018 applied — the bound mint verb + binding columns exist", async () => {
  fail0018(live);
  assert.ok(await fnExists("record_opening_keyed_resolution"), "clara.record_opening_keyed_resolution exists");
  assert.ok(await hasColumn("client_resolutions", "bound_scope_kind"), "client_resolutions.bound_scope_kind added");
  assert.ok(await hasColumn("client_resolutions", "bound_scope_id"), "client_resolutions.bound_scope_id added");
});

test("§1 mint: a bound keyed resolution pins confidence 1.0, subject=(manual,seed), the opening_seed binding, and the canonical evidence spine", async () => {
  fail0018(live);
  const row = await resolutionRow(G.rb);
  assert.ok(row, "the bound resolution row exists");
  assert.equal(Number(row.confidence), 1, "confidence PINNED 1.0 (a categorical human confirmation — no caller confidence)");
  assert.equal(row.method, "human", "method stamped human (the human lane)");
  assert.equal(row.subject_kind, "manual", "subject_kind='manual'");
  assert.equal(row.subject_id, G.seed, "subject_id=p_seed");
  assert.equal(row.bound_scope_kind, "opening_seed", "bound_scope_kind='opening_seed'");
  assert.equal(row.bound_scope_id, G.seed, "bound_scope_id=p_seed");
  const spine = JSON.stringify(row.evidence ?? {});
  assert.ok(spine.includes("opening_keyed_seed"), "evidence carries the {source:'opening_keyed_seed'} spine");
  assert.ok(spine.includes(G.seed), "evidence spine carries seed_id");
});

test("§1 mint: a TIED seed is refused — the seed must be KEYED (tie_document_id is null) → CLR10 tie_document_present", async () => {
  fail0018(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await createOpeningSeed(w.users.bob, { client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  const tied = sr.seed_id ?? sr.id;
  await assertRaisesReason(CLR.badRequest, "tie_document_present",
    () => recordOpeningKeyedResolution(w.users.bob, { client: o.client, seed: tied }),
    "mint a bound resolution against a document-TIED seed");
});

test("§1 mint: non-object evidence (R1-0018-2) — a jsonb ARRAY/STRING p_evidence refuses CLR10 evidence_not_object BEFORE any op_key is reserved; a SQL-NULL p_evidence still mints with the canonical spine intact", async () => {
  fail0018(live);
  const base = await activeClientWithSeed();
  const arrKey = opk("okr_evarr");
  await assertRaisesReason(CLR.badRequest, "evidence_not_object",
    () => recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed, evidence: ["not", "an", "object"], opKey: arrKey }),
    "a jsonb ARRAY p_evidence");
  const strKey = opk("okr_evstr");
  await assertRaisesReason(CLR.badRequest, "evidence_not_object",
    () => recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed, evidence: "not an object", opKey: strKey }),
    "a jsonb STRING p_evidence");
  // The refusal fires BEFORE _reserve_op — zero op_receipts rows for either probe.
  for (const k of [arrKey, strKey]) {
    const rec = await rootQuery("select count(*)::int as n from clara.op_receipts where fn='record_opening_keyed_resolution' and op_key=$1", [k]);
    assert.equal(rec.rows[0].n, 0, `evidence_not_object reserved ZERO op_receipts for ${k}`);
  }
  // A SQL-NULL p_evidence is legal: it coalesces to '{}'::jsonb and the mint
  // still succeeds with the canonical {source,seed_id} spine intact.
  const mint = await recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed, evidence: null });
  const row = await resolutionRow(ridOf(mint));
  assert.equal(row.evidence?.source, "opening_keyed_seed", "a SQL-NULL evidence still carries the canonical source spine");
  assert.equal(row.evidence?.seed_id, base.seed, "a SQL-NULL evidence still carries the canonical seed_id spine");
});

test("§1 confinement (dir 1): a BOUND resolution REFUSES the generic keyed draft_entry (CLR01) while an UNBOUND one still passes there", async () => {
  fail0018(live);
  // A bound resolution fails the generic assert's new `bound_scope_kind IS NULL`
  // predicate — usable ONLY on its bound opening lane.
  await assertRaises(CLR.client, () => draftEntryV3(w.users.bob, {
    client: G.client, resolution: G.rb,
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0, description: "confine-dr" },
      { account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 1_000, description: "confine-cr" }],
    opKey: opk("cf1bad") }), "a bound resolution on the generic keyed draft_entry");
  // Every pre-0018 (unbound) resolution keeps byte-identical generic behavior.
  const ru = await freshResolution(w.users.bob, G.client);
  const r = await draftEntryV3(w.users.bob, {
    client: G.client, resolution: ru,
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0, description: "ok-dr" },
      { account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 1_000, description: "ok-cr" }],
    opKey: opk("cf1ok") });
  assert.ok(r.entry_id, "an unbound resolution still drafts a generic keyed entry");
});

test("§1 confinement (dir 2): an UNBOUND resolution REFUSES the keyed opening lane (CLR01) while the BOUND one passes", async () => {
  fail0018(live);
  const base = await activeClientWithSeed();
  const ru = await freshResolution(w.users.bob, base.client);
  await assertRaises(CLR.client, () => draftOpeningItem(w.users.bob, {
    client: base.client, seed: base.seed, resolution: ru,
    item: { item_kind: "gl_balance", item_key: "unbound:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }], opKey: opk("cf2bad") }),
  "an unbound resolution on the keyed opening lane (p_document IS NULL)");
  const mint = await recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed });
  const rb = ridOf(mint);
  const ok = await draftOpeningItem(w.users.bob, {
    client: base.client, seed: base.seed, resolution: rb,
    item: { item_kind: "gl_balance", item_key: "bound:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }], opKey: opk("cf2ok") });
  assert.ok(ok.entry_id, "the seed-bound resolution drafts on its own keyed opening lane");
});

test("§1 seed-grain: one bound resolution serves TWO items in one seed (both attributed to Rb)", async () => {
  fail0018(live);
  const items = await openingItemRows(G.seed);
  const cash = items.find((i) => i.item_key === "grain:cash");
  const cap = items.find((i) => i.item_key === "grain:cap");
  assert.ok(cash && cap, "both drafted items exist");
  for (const it of [cash, cap]) {
    const e = await entryRow(it.entry_id);
    assert.equal(e.resolution_id, G.rb, `${it.item_key} carries the shared bound resolution Rb (seed-grain reuse)`);
  }
});

test("§1 seed-grain: the SAME bound resolution carries through finalize → reopen → an ADDITIVE batch", async () => {
  fail0018(live);
  await approveOpeningSeed(w.users.hana, {
    seed: G.seed, planRevision: await planRevision(G.plan),
    entryRevisions: revMapOf(G.drafts), opKey: opk("grainfin") });
  assert.equal((await seedRegRow(G.seed)).state, "finalized", "the initial keyed batch finalizes");
  await reopenOpeningSeed(w.users.hana, { seed: G.seed, reason: "B-12 additive under the same bound resolution" });
  await upsertAccountClassed(w.users.alice, { client: G.client, code: "930-000", name: "Capital Reserve", type: "equity" });
  await keyedTarget(w.users.bob, G.seed, "prepaid", WB_COA.expense, 1_000, 0);
  await keyedTarget(w.users.bob, G.seed, "capres", "930-000", 0, 1_000);
  const a1 = await draftOpeningItem(w.users.bob, {
    client: G.client, seed: G.seed, resolution: G.rb,
    item: { item_kind: "gl_balance", item_key: "grain:prepaid" },
    lines: [{ account_code: WB_COA.expense, debit_cents: 1_000, credit_cents: 0 }] });
  const a2 = await draftOpeningItem(w.users.bob, {
    client: G.client, seed: G.seed, resolution: G.rb,
    item: { item_kind: "gl_balance", item_key: "grain:capres" },
    lines: [{ account_code: "930-000", debit_cents: 0, credit_cents: 1_000 }] });
  for (const d of [a1, a2]) assert.equal((await entryRow(d.entry_id)).resolution_id, G.rb, "the additive draft reuses the LIVE Rb");
  assert.equal((await resolutionRow(G.rb)).superseded_at ?? null, null, "Rb is still live after the additive reuse");
  await approveOpeningSeed(w.users.hana, {
    seed: G.seed, planRevision: await planRevision(G.plan),
    entryRevisions: revMapOf([a1, a2]), opKey: opk("grainadd") });
  assert.equal((await seedRegRow(G.seed)).state, "finalized", "the additive batch re-finalizes the seed");
});

test("§1 seed-grain: a same-seed supersede (K6) proceeds while Rb stays the live seed binding", async () => {
  fail0018(live);
  const cash = (await openingItemRows(G.seed)).find((i) => i.item_key === "grain:cash" && i.state !== "superseded");
  assert.ok(cash, "the cash item is present to supersede");
  const sup = await supersedeOpeningItem(w.users.bob, { item: cash.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "grain:cash:v2" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }] } });
  const drafts = [];
  for (const eid of new Set([sup.reversal_entry_id ?? sup.reversal_id,
    (await openingItemRows(G.seed)).find((i) => i.item_key === "grain:cash:v2")?.entry_id])) {
    if (!eid) continue;
    const e = await entryRow(eid);
    if (e.status === "draft") drafts.push({ entry_id: eid, revision_token: e.revision_token });
  }
  await approveOpeningCorrection(w.users.hana, { seed: G.seed, entryRevisions: revMapOf(drafts), opKey: opk("grainsup") });
  assert.equal((await resolutionRow(G.rb)).superseded_at ?? null, null,
    "Rb remains the live seed binding across a same-seed supersede (seed-grain by design)");
  const v2 = (await openingItemRows(G.seed)).find((i) => i.item_key === "grain:cash:v2");
  if (v2) {
    const rr = await resolutionRow((await entryRow(v2.entry_id)).resolution_id);
    if (rr && rr.bound_scope_id !== G.seed) noteLane("same-seed supersede: the replacement's resolution is not seed-bound — finding");
  }
});

test("§1 supersession (BEFORE draft): superseding Rb, then drafting on the keyed lane with the superseded id, refuses CLR01", async () => {
  fail0018(live);
  const base = await activeClientWithSeed();
  const m1 = await recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed });
  const r1 = ridOf(m1);
  // A SECOND bound mint on the same seed supersedes the first (partial index:
  // one live per scope). [AMB-18d]
  const m2 = await recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed });
  assert.notEqual(ridOf(m2), r1, "the second mint is a distinct resolution row");
  assert.ok((await resolutionRow(r1)).superseded_at, "the first bound resolution is now superseded");
  await assertRaises(CLR.client, () => draftOpeningItem(w.users.bob, {
    client: base.client, seed: base.seed, resolution: r1,
    item: { item_kind: "gl_balance", item_key: "stale:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }], opKey: opk("supbefore") }),
  "a superseded bound resolution no longer passes the bound assert (not live)");
});

test("§1 supersession (POST draft, pinned): superseding Rb NEVER retroactively invalidates an already-attributed draft; only FUTURE drafts are blocked", async () => {
  fail0018(live);
  const base = await activeClientWithSeed();
  const m1 = await recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed });
  const r1 = ridOf(m1);
  const d = await draftOpeningItem(w.users.bob, {
    client: base.client, seed: base.seed, resolution: r1,
    item: { item_kind: "gl_balance", item_key: "post:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }] });
  await recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed }); // supersedes r1
  assert.ok((await resolutionRow(r1)).superseded_at, "r1 is superseded post-draft");
  const e = await entryRow(d.entry_id);
  assert.equal(e.resolution_id, r1, "the ALREADY-attributed draft keeps its r1 attribution (not retroactively invalidated)");
  assert.equal(e.status, "draft", "the already-attributed draft still stands");
  await assertRaises(CLR.client, () => draftOpeningItem(w.users.bob, {
    client: base.client, seed: base.seed, resolution: r1,
    item: { item_kind: "gl_balance", item_key: "post:cap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 1_000 }], opKey: opk("postfuture") }),
  "a FUTURE draft on the superseded r1 is blocked");
});

test("§1 supersession (DURING draft, two-session): the bound assert's FOR SHARE lock serializes a concurrent supersede; exactly one live binding survives", async () => {
  fail0018(live);
  const base = await activeClientWithSeed();
  const m1 = await recordOpeningKeyedResolution(w.users.bob, { client: base.client, seed: base.seed });
  const r1 = ridOf(m1);
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query(`set role ${ROLES.authenticated}`);
    await c1.query("begin isolation level serializable");
    await c1.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: w.users.bob, role: "authenticated" })]);
    // A drafts on the keyed lane → the bound assert locks r1 FOR SHARE, held open.
    await c1.query(
      // [AMB-0018-8] the raw keyed call carries ALL EIGHT named args (draft_opening_item
      // has no defaults) — p_document/p_sha256 explicitly null selects the keyed lane.
      `select clara.draft_opening_item(p_client => $1, p_seed => $2, p_item => $3::jsonb,
         p_lines => $4::jsonb, p_resolution => $5, p_document => null, p_sha256 => null, p_op_key => $6)`,
      [base.client, base.seed, jtxt({ item_kind: "gl_balance", item_key: "race:cash" }),
        jtxt([{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }]), r1, opk("racedraft")]);
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("set statement_timeout = '15s'");
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: w.users.bob, role: "authenticated" })]);
    // B supersedes r1 by minting a second bound resolution (an UPDATE of r1's
    // superseded_at) — it must WAIT on A's FOR SHARE.
    const p2 = c2.query(
      "select clara.record_opening_keyed_resolution(p_client => $1, p_seed => $2, p_evidence => '{}'::jsonb, p_op_key => $3)",
      [base.client, base.seed, opk("racesup")]);
    try { await waitBlockedByOrThrow(pid2, pid1, { what: "the bound resolution FOR SHARE lock" }); }
    catch (e) { noteLane(`during-draft supersede race: block not observed (${e.message}) — the FOR SHARE serialization is a finding`); }
    await c1.query("commit");
    await p2.catch(() => {}); // B settles after A releases
    await c2.query("commit").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  // The invariant, interleaving-independent: exactly ONE live bound resolution
  // survives for the seed, and A's draft is coherently attributed to a seed-bound
  // resolution.
  const live1 = await rootQuery(
    "select count(*)::int as n from clara.client_resolutions where bound_scope_kind='opening_seed' and bound_scope_id=$1 and superseded_at is null", [base.seed]);
  assert.equal(live1.rows[0].n, 1, "exactly one LIVE bound resolution survives the race (the partial index holds)");
  const race = (await openingItemRows(base.seed)).find((i) => i.item_key === "race:cash");
  assert.ok(race, "A's concurrent draft persisted");
  const rr = await resolutionRow((await entryRow(race.entry_id)).resolution_id);
  assert.equal(rr?.bound_scope_id, base.seed, "A's draft is attributed to a seed-bound resolution (coherent)");
});

test("§1 concurrent mint (two-session, R1-0018-1): two concurrent mints on ONE seed serialize via the seed FOR UPDATE lock — BOTH succeed, exactly ONE live bound row survives (the later winner), zero 23505, both op_receipts rows exist", async () => {
  fail0018(live);
  const base = await activeClientWithSeed();
  const keyA = opk("racemintA");
  const keyB = opk("racemintB");
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  let idA = null, idB = null, errA = null, errB = null;
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c1.query(`set role ${ROLES.authenticated}`);
    await c1.query("begin");
    await c1.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: w.users.bob, role: "authenticated" })]);
    // A mints first (fully awaited): the seed FOR UPDATE lock persists on A's
    // OPEN transaction after the statement returns — held until A commits.
    const rA = await c1.query(
      "select clara.record_opening_keyed_resolution(p_client => $1, p_seed => $2, p_evidence => '{}'::jsonb, p_op_key => $3) as r",
      [base.client, base.seed, keyA]).catch((e) => { errA = e; return null; });
    if (rA) idA = rA.rows[0].r.resolution_id ?? rA.rows[0].r.id;

    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("set statement_timeout = '15s'");
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: w.users.bob, role: "authenticated" })]);
    // B fires un-awaited — it must BLOCK on A's seed FOR UPDATE lock.
    const pB = c2.query(
      "select clara.record_opening_keyed_resolution(p_client => $1, p_seed => $2, p_evidence => '{}'::jsonb, p_op_key => $3) as r",
      [base.client, base.seed, keyB]);
    try { await waitBlockedByOrThrow(pid2, pid1, { what: "the opening_seed_registry FOR UPDATE lock (concurrent mint)" }); }
    catch (e) { noteLane(`concurrent-mint race: block not observed (${e.message}) — the FOR UPDATE serialization is a finding`); }
    await c1.query("commit");
    const rB = await pB.catch((e) => { errB = e; return null; });
    if (rB) idB = rB.rows[0].r.resolution_id ?? rB.rows[0].r.id;
    await c2.query("commit").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  assert.equal(errA, null, `A's mint must not raise (got ${errA?.code}: ${errA?.message})`);
  assert.equal(errB, null, `B's mint must not raise — a raw 23505 must be unreachable (got ${errB?.code}: ${errB?.message})`);
  assert.ok(idA, "A's mint succeeded");
  assert.ok(idB, "B's mint succeeded");
  assert.notEqual(idA, idB, "A and B minted distinct resolution rows");
  const live1 = await rootQuery(
    "select count(*)::int as n from clara.client_resolutions where bound_scope_kind='opening_seed' and bound_scope_id=$1 and superseded_at is null", [base.seed]);
  assert.equal(live1.rows[0].n, 1, "exactly ONE live bound resolution survives the concurrent-mint race");
  assert.equal((await resolutionRow(idB)).superseded_at ?? null, null, "B (the later committer) is the live winner");
  assert.ok((await resolutionRow(idA)).superseded_at, "A (the earlier committer) is superseded by B's mint (last-wins)");
  const recA = await rootQuery("select count(*)::int as n from clara.op_receipts where fn='record_opening_keyed_resolution' and op_key=$1", [keyA]);
  const recB = await rootQuery("select count(*)::int as n from clara.op_receipts where fn='record_opening_keyed_resolution' and op_key=$1", [keyB]);
  assert.equal(recA.rows[0].n, 1, "A's op_receipts row exists");
  assert.equal(recB.rows[0].n, 1, "B's op_receipts row exists");
});

test("§1 cross-firm (extends the wb-x-crossfirm pattern): firm-B owner (dave) minting against a firm-A client+seed → CLR11, zero mint", async () => {
  fail0018(live);
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const sr = await createOpeningSeed(w.users.bob, { client: o.client, plan: o.plan });
  const seed = sr.seed_id ?? sr.id;
  const before = await rootQuery("select count(*)::int as n from clara.client_resolutions where bound_scope_id=$1", [seed]);
  const key = opk("xf_record_opening_keyed_resolution");
  await assertRaises(CLR.notFound, () => recordOpeningKeyedResolution(w.users.dave, { client: o.client, seed, opKey: key }),
    "firm-B dave → firm-A client+seed: the CLR11 firm-check fires before any state check");
  const after = await rootQuery("select count(*)::int as n from clara.client_resolutions where bound_scope_id=$1", [seed]);
  assert.equal(after.rows[0].n, before.rows[0].n, "no bound resolution minted by the refused cross-firm probe");
  const rec = await rootQuery("select count(*)::int as n from clara.op_receipts where fn='record_opening_keyed_resolution' and op_key=$1", [key]);
  assert.equal(rec.rows[0].n, 0, "the refusal reserved ZERO op_receipts");
});
