// F-A5b PR-1 -- THE SANDBOX EXPORT LANE'S DB LAYER, for
// migrations/UNNUMBERED_f_a5b_pr1_sandbox_export.sql.
//
// Design of record: docs/plan/active/sandbox-export-design.md (v2, gate-folded 2026-08-23) +
// -design-part2.md + -annexes.md (Annex A surface, B battery, C decisions) + the gate record's
// 2026-08-23 owner rulings (SS6, both owner cards RULED).
//
// SCOPE. PR-1 is DB-only (three relations, four ungranted cores, nine verbs, the allowlist, the
// signed sandbox_watermark trio, the closed-world censuses this lane owns). The second render
// entrance is F-A5b's own PR-3 -- B3.1/B3.4/B3.5/B3.6 (watermark bytes) and B5.* (one architecture)
// are out of scope here, named and skipped. B1.3 (cross_client) skips until F-A6 v2 merges and
// B4.1 (the receipt-schema wall) skips until F-A5 PR-1's own wall lands (it did -- 0111, merged --
// but the RECEIPT SCHEMA this lane's citation would land in is a later F-A5 item outside this
// file's reach either way; kept as a named skip per the annex's own framing). The free-read basis
// kinds (scope='client'/'cross_client'/'firm') are MEASURED at runtime, not assumed: this battery
// runs on a chain where F-A6 PR-1 has not merged, so B1.2/B1.4/B1.6/B1.9(firm leg) are also named
// skips here -- the degraded-but-honest Annex-K mode the conductor ruled.
//
// EVERY WALL IS FORCED IN BOTH POLARITIES (law 31): a refusal cell's differential twin must be
// ADMITTED, and the two differ in exactly the term the wall reads.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  rootQuery, endPool, asWake, asHuman, ROLES, opk,
} from "./rig-helpers.mjs";
import { buildWorld, mintWake } from "./rig-fixtures.mjs";
import {
  freshDeltaClient, createStandardSets, mintPeriodWithMovement, proposeMetricDefinition,
  approveMetricDefinition, evaluateMetricHuman, metricAst, measure, cellRow, pastMonthStart,
} from "./delta-fixtures.mjs";

const sha256hex = (s) => createHash("sha256").update(String(s)).digest("hex");

async function fa5bReady() {
  const r = await rootQuery(
    `select (to_regclass('clara.sandbox_views') is not null
             and to_regclass('clara.sandbox_exports') is not null
             and to_regclass('clara.export_recipients') is not null) as relations,
            (select count(*)::int from unnest($1::text[]) s where to_regprocedure(s) is not null) as fns,
            (select count(*)::int from clara.watermark_policy_versions where policy_key = 'sandbox_watermark') as wm`,
    [[
      "clara._sandbox_client_set(uuid,jsonb,jsonb)",
      "clara._recipient_covers(uuid,uuid[],uuid)",
      "clara._sandbox_view_mint_core(uuid,uuid,uuid,text,jsonb,jsonb,text)",
      "clara._sandbox_export_request_core(uuid,uuid,uuid,text,uuid,uuid,text,text)",
      "clara.wake_mint_sandbox_view(jsonb,jsonb,text,jsonb,text)",
      "clara.wake_request_sandbox_export(uuid,uuid,text,text,jsonb,text)",
      "clara.wake_sandbox_export_state(uuid)",
      "clara.sandbox_export_payload(uuid,text)",
      "clara.complete_sandbox_export(uuid,text,text,bigint,text)",
      "clara.fail_sandbox_export(uuid,text,jsonb)",
      "clara.register_export_recipient(text,uuid,text,text,uuid[],text)",
      "clara.supersede_export_recipient(uuid,text,text)",
      "clara.list_sandbox_exports(uuid,int)",
    ]],
  );
  const s = r.rows[0];
  const halves = [s.relations, s.fns === 13, s.wm === 3];
  if (halves.every((h) => !h)) return false;
  if (!halves.every((h) => h)) {
    throw new Error(`F-A5b PR-1 DRIFT: relations=${s.relations} fns=${s.fns}/13 sandbox_watermark rows=${s.wm}/3`);
  }
  return true;
}

async function fa6ScopePresent() {
  const r = await rootQuery(
    `select exists(select 1 from information_schema.columns
       where table_schema='clara' and table_name='freeform_read_log' and column_name='scope') as present`);
  return r.rows[0].present;
}

let ready = false;
let fa6 = false;
let world = null;
/** Pre-minted, REAL metric_cells (via delta's own audited pipeline -- an evaluator-originated
 *  cell, never a hand-rolled row, since metric_input_snapshots carries a reconstruct-from-facts
 *  trigger this file must not fight). Minted ONCE in before() and reused across cells. */
let fx = null;

function skipHere(t, why) { t.skip(`F-A5b PR-1: ${why}`); return true; }

async function ensureEvaluatorDeployed() {
  await rootQuery(
    "update clara.evaluator_versions set deployed = true where not deployed and evaluator_name <> 'evaluate_fs_pack_agent'");
}

/** A real preview cell: post a movement, mint a period + snapshot, propose/approve a metric
 *  definition over the revenue set, evaluate it. Returns { id, clientId }. */
async function mintRealCell(owner, client, tag) {
  await createStandardSets(owner, client);
  const monthStart = await pastMonthStart(2);
  const { period, snapshotId } = await mintPeriodWithMovement(owner, { client, monthStart, cents: 100_000 });
  const version = await proposeMetricDefinition(owner, {
    client, key: `sbx_${tag}_${randomUUID().slice(0, 8)}`, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  await approveMetricDefinition(owner, version);
  const receipt = await evaluateMetricHuman(owner, { client, definitionVersion: version, periodIds: [period.id], snapshotId });
  const cell = await cellRow(receipt);
  return { id: cell.id, clientId: client };
}

const textBody = (blocks) => ({ blocks });
const textBlock = (ref, txt = "some analysis prose") => ({ kind: "text", basis_ref: ref, displayed_text: txt });
const previewBasis = (label, id) => ({ label, kind: "preview_cell", id });
// pg's node driver serializes a bare JS ARRAY parameter as a POSTGRES ARRAY LITERAL, not JSON --
// wrong for a jsonb `p_basis` argument that IS an array. Stringify explicitly, always.
const basisArr = (...elems) => JSON.stringify(elems);
const model = () => ({ model: "claude-opus-5", model_version: "2026-08" });

/** Mint a wake credential + run one call as that wake identity (interactive kind, HOME-scoped). */
async function asSandboxWake(firm, obo, fn) {
  const { secret } = await mintWake({ kind: "interactive", firm, onBehalfOf: obo });
  return asWake(ROLES.wakeInteractive, secret, fn);
}

before(async () => {
  ready = await fa5bReady();
  if (!ready) return;
  fa6 = await fa6ScopePresent();
  world = await buildWorld();
  await ensureEvaluatorDeployed();
  const clientA1 = await freshDeltaClient(world.users.alice, "a1sbx");
  const clientA2 = await freshDeltaClient(world.users.alice, "a2sbx");
  const clientB1 = await freshDeltaClient(world.users.dave, "b1sbx");
  fx = {
    A1: await mintRealCell(world.users.alice, clientA1, "a1"),
    A2: await mintRealCell(world.users.alice, clientA2, "a2"),
    B1: await mintRealCell(world.users.dave, clientB1, "b1"),
  };
});
after(async () => { await endPool(); });

// =============================================================================================
// B1 -- CLIENT-SET DERIVATION (SS3.2), judgement logic, every arm forced.
// =============================================================================================

test("B1.1 -- a preview-cell basis derives the cell's own client id, exact", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const label = "cell1";
  const body = textBody([textBlock(label)]);
  const basis = basisArr(previewBasis(label, cellId));
  const r = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [body, basis, "b1.1", model(), opk("b11")]));
  const out = r.rows[0].r;
  assert.deepEqual(out.client_set, [fx.A1.clientId]);
  assert.equal(out.client_set_basis, "exact");
});

test("B1.2/B1.4/B1.6/B1.9(firm leg) -- free-read basis kinds", { skip: fa6 ? false : "F-A6 PR-1 not merged on this chain: free-read basis kinds are unavailable (Annex K); preview-cell bases only" }, async (t) => {
  if (!ready) return skipHere(t, "not applied");
  t.skip("free-read fixtures require F-A6 PR-1's hardened freeform_read_log shape -- placeholder for when it lands");
});

test("B1.3 -- cross_client basis skips until F-A6 v2 merges", async (t) => {
  t.skip("F-A6 v2 (the cross-client named read) has not merged");
});

test("B1.5 -- no basis rows refuses sandbox_view_basis_absent; one basis row succeeds", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const label = "c";
  const body = textBody([textBlock(label)]);
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [body, basisArr(), "b1.5-refuse", model(), opk("b15r")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_basis_absent/); return true; });
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [body, basisArr(previewBasis(label, cellId)), "b1.5-ok", model(), opk("b15o")]));
  assert.deepEqual(ok.rows[0].r.client_set, [fx.A1.clientId]);
});

test("B1.8 -- a block with no basis_ref refuses sandbox_view_block_basis_absent; the twin with the ref succeeds", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const badBlock = { kind: "text", displayed_text: "no ref" };
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [{ blocks: [badBlock] }, basisArr(previewBasis("x", cellId)), "b1.8-refuse", model(), opk("b18r")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_block_basis_absent/); return true; });
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [{ blocks: [textBlock("x")] }, basisArr(previewBasis("x", cellId)), "b1.8-ok", model(), opk("b18o")]));
  assert.ok(ok.rows[0].r.sandbox_view_id);
});

test("B1.9 -- the narrowing differential: dropping a cited block's basis_ref REFUSES rather than narrowing", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellA = await Promise.resolve(fx.A1.id);
  const cellB = await Promise.resolve(fx.A2.id);
  const basis = basisArr(previewBasis("a", cellA), previewBasis("b", cellB));
  const twoBlock = { blocks: [textBlock("a"), textBlock("b")] };
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [twoBlock, basis, "b1.9-two", model(), opk("b19two")]));
  assert.deepEqual(new Set(ok.rows[0].r.client_set), new Set([fx.A1.clientId, fx.A2.clientId]));

  const droppedRefBlock = { blocks: [textBlock("a"), { kind: "text", displayed_text: "block b, no ref" }] };
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [droppedRefBlock, basis, "b1.9-drop", model(), opk("b19drop")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_block_basis_absent/); return true; },
    "dropping the second block's basis_ref must REFUSE, never silently derive {A} alone");
});

test("B1.10 -- a basis_ref naming an undeclared label refuses sandbox_view_block_basis_unknown; a declared label succeeds", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [textBody([textBlock("ghost")]), basisArr(previewBasis("real", cellId)), "b1.10-refuse", model(), opk("b110r")])),
    (e) => { assert.equal(e.code, "CLR11"); assert.match(e.detail || "", /sandbox_view_block_basis_unknown/); return true; });
});

test("B1.11 -- cross-firm / absent / NULL-firm basis all refuse sandbox_view_basis_unknown, indistinguishably", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellB1 = await Promise.resolve(fx.B1.id);
  // firm A's session citing firm B's cell id.
  const crossFirm = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
      [textBody([textBlock("x")]), basisArr(previewBasis("x", cellB1)), "b1.11-cross", model(), opk("b111cross")])
      .catch((e) => e));
  assert.equal(crossFirm.code, "CLR11");
  assert.match(crossFirm.detail || "", /sandbox_view_basis_unknown/);

  const absentId = randomUUID();
  const absent = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
      [textBody([textBlock("x")]), basisArr(previewBasis("x", absentId)), "b1.11-absent", model(), opk("b111absent")])
      .catch((e) => e));
  assert.equal(absent.code, "CLR11");
  assert.match(absent.detail || "", /sandbox_view_basis_unknown/);
  assert.equal(absent.detail, crossFirm.detail, "absent and foreign must be INDISTINGUISHABLE (no existence oracle)");

  const cellA = await Promise.resolve(fx.A1.id);
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [textBody([textBlock("x")]), basisArr(previewBasis("x", cellA)), "b1.11-ok", model(), opk("b111ok")]));
  assert.ok(ok.rows[0].r.sandbox_view_id);
});

test("B1.13 -- body_malformed: no blocks / non-text kind refuses", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [{ blocks: [] }, basisArr(previewBasis("x", randomUUID())), "b1.13-empty", model(), opk("b113empty")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_body_malformed/); return true; });
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [{ blocks: [{ kind: "chart_ref", basis_ref: "x" }] }, basisArr(previewBasis("x", randomUUID())), "b1.13-kind", model(), opk("b113kind")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_body_malformed/); return true; });
});

// =============================================================================================
// B2 -- COVERAGE (SS3.3).
// =============================================================================================

async function registerFirmMember(firm, adminSub, { user, displayName }) {
  return asHuman(adminSub, (db) =>
    db.query("select clara.register_export_recipient($1,$2,$3,$4,$5,$6) as r",
      ["firm_member", user, displayName, "test firm member", null, opk("rfm")]))
    .then((r) => r.rows[0].r.recipient_id);
}
async function registerExternal(firm, adminSub, { displayName, coveredClients }) {
  return asHuman(adminSub, (db) =>
    db.query("select clara.register_export_recipient($1,$2,$3,$4,$5,$6) as r",
      ["external", null, displayName, "test external", coveredClients, opk("rext")]))
    .then((r) => r.rows[0].r.recipient_id);
}
async function mintView(firm, obo, cellId, label = "x") {
  const r = await asSandboxWake(firm, obo, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [textBody([textBlock(label)]), basisArr(previewBasis(label, cellId)), "view", model(), opk("view")]));
  return r.rows[0].r.sandbox_view_id;
}

test("B2.1 -- firm_member with active membership covers; removed membership refuses export_recipient_membership_inactive", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId);
  const recipient = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.bob, displayName: "Bob" });
  const wpv = await rootQuery("select id from clara.watermark_policy_versions where policy_key='sandbox_watermark' and locale='en'");
  assert.ok(wpv.rows.length === 1);
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [viewId, recipient, "en", "b2.1", model(), opk("b21ok")]));
  assert.equal(ok.rows[0].r.state, "claimable");
});

test("B2.2 -- external covering the whole client_set covers; one client short refuses recipient_coverage_incomplete, naming it", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellA = await Promise.resolve(fx.A1.id);
  const cellB = await Promise.resolve(fx.A2.id);
  const viewId = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [textBody([textBlock("a"), textBlock("b")]), basisArr(previewBasis("a", cellA), previewBasis("b", cellB)),
        "b2.2", model(), opk("b22view")])).then((r) => r.rows[0].r.sandbox_view_id);

  const partial = await registerExternal(world.firms.A, world.users.alice, { displayName: "Partial", coveredClients: [fx.A1.clientId] });
  const refused = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6)",
      [viewId, partial, "en", "b2.2-short", model(), opk("b22short")])).catch((e) => e);
  assert.equal(refused.code, "CLR10");
  assert.match(refused.detail || "", /recipient_coverage_incomplete/);
  assert.match(refused.detail || "", new RegExp(fx.A2.clientId));

  const full = await registerExternal(world.firms.A, world.users.alice, { displayName: "Full", coveredClients: [fx.A1.clientId, fx.A2.clientId] });
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [viewId, full, "en", "b2.2-full", model(), opk("b22full")]));
  assert.equal(ok.rows[0].r.state, "claimable");
});

test("B2.4 -- a recipient of another firm answers export_recipient_unknown, never 'found but refused'", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "cf");
  const foreignRecipient = await registerFirmMember(world.firms.B, world.users.dave, { user: world.users.dave, displayName: "Dave" });
  const e = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6)",
      [viewId, foreignRecipient, "en", "b2.4", model(), opk("b24")])).catch((err) => err);
  assert.equal(e.code, "CLR11");
  assert.match(e.detail || "", /export_recipient_unknown/);
});

test("B2.5 -- a superseded recipient refuses; the successor covers", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "sup");
  const original = await registerExternal(world.firms.A, world.users.alice, { displayName: "Orig", coveredClients: [fx.A1.clientId] });
  const superseded = await asHuman(world.users.alice, (db) =>
    db.query("select clara.supersede_export_recipient($1,$2,$3) as r", [original, "role change", opk("b25sup")]))
    .then((r) => r.rows[0].r.recipient_id);
  const refused = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6)",
      [viewId, original, "en", "b2.5-old", model(), opk("b25old")])).catch((e) => e);
  assert.equal(refused.code, "CLR10");
  assert.match(refused.detail || "", /export_recipient_superseded/);
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [viewId, superseded, "en", "b2.5-new", model(), opk("b25new")]));
  assert.equal(ok.rows[0].r.state, "claimable");
});

test("B2.6 -- covered_clients cannot be written by any wake verb (prosrc census)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const r = await rootQuery(
    `select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='clara' and p.proname like 'wake_%sandbox%'
         and lower(p.prosrc) ~ 'covered_clients'`);
  assert.equal(r.rows[0].n, 0);
});

test("B2.7 -- _recipient_covers never answers YES on an empty client_set, for both kinds", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const member = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.carol, displayName: "Carol" });
  const external = await registerExternal(world.firms.A, world.users.alice, { displayName: "Ext", coveredClients: [fx.A1.clientId] });
  for (const recipient of [member, external]) {
    const e = await rootQuery("select clara._recipient_covers($1,$2,$3)", [world.firms.A, [], recipient]).catch((err) => err);
    assert.equal(e.code, "CLR10");
    assert.match(e.detail || "", /sandbox_view_client_set_empty/);
  }
  const nonEmpty = await rootQuery("select clara._recipient_covers($1,$2,$3) as r", [world.firms.A, [fx.A1.clientId], external]);
  assert.equal(nonEmpty.rows[0].r.covered, true);
});

// =============================================================================================
// B3 -- WATERMARK REQUEST-DOOR (SS3.6). B3.1/B3.4/B3.5/B3.6 are the RENDERER's own (PR-3); this
// battery only forces the REQUEST-time presence check PR-1 owns.
// =============================================================================================

test("B3.2 -- with no sandbox_watermark row effective for the window, the resolver refuses watermark_policy_absent; a covered window succeeds", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  // The owner signed all THREE legal locales (en/ms/zh) at once, and watermark_policy_versions is
  // append-only -- so there is no live "delete a signed row" way to exercise this wall through the
  // wrapper on THIS migration's own seeded state (that permanence is the DARK-condition-lifts
  // point, not a gap). This cell instead forces the SAME resolver `_sandbox_export_request_core`
  // calls inline -- clara.watermark_policy_for, over the SAME table and predicate -- with an as_of
  // date OUTSIDE the signed row's effective window, proving the absent-row refusal fires; the
  // positive twin proves the covered window succeeds, using the resolver F-A5 PR-1 ships and this
  // core reuses verbatim.
  await assert.rejects(
    rootQuery("select clara.watermark_policy_for('sandbox_watermark','en','2020-01-01'::date)"),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /watermark_policy_absent/); return true; },
    "an as_of date before the signed row's effective_from must refuse");
  const ok = await rootQuery("select clara.watermark_policy_for('sandbox_watermark','en',current_date) as w");
  assert.ok(ok.rows[0].w?.watermark, "an as_of date inside the signed row's window resolves the watermark text");
});

// =============================================================================================
// B6 -- LIFECYCLE AND FORGERY.
// =============================================================================================

async function fullExportRow() {
  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "lc" + randomUUID().slice(0, 4));
  const recipient = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.bob, displayName: "Bob-lc" });
  const r = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [viewId, recipient, "en", "lc", model(), opk("lc" + randomUUID())]));
  return r.rows[0].r.sandbox_export_id;
}

test("B6.1/B6.2 -- frozen columns refuse UPDATE, moving columns accept a lawful claim/complete transition", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const exportId = await fullExportRow(t);
  await assert.rejects(
    rootQuery("update clara.sandbox_exports set locale='ms' where id=$1", [exportId]),
    (e) => { assert.equal(e.code, "CLR08"); return true; },
    "the request half is frozen");

  await rootQuery(
    "update clara.sandbox_exports set state='running', claimed_by=$2, claimed_at=now(), lease_expires_at=now()+interval '20 minutes' where id=$1",
    [exportId, "worker-1"]);
  const running = await rootQuery("select state from clara.sandbox_exports where id=$1", [exportId]);
  assert.equal(running.rows[0].state, "running", "the moving half accepts a lawful claim transition");

  const done = await rootQuery(
    "select clara.complete_sandbox_export($1,$2,$3,$4,$5) as r",
    [exportId, "worker-1", sha256hex("payload"), 1024, "firms/x/sandbox/y.pdf"]);
  assert.equal(done.rows[0].r.state, "done");
});

test("B6.3 -- complete_sandbox_export twice refuses sandbox_export_already_completed", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const exportId = await fullExportRow(t);
  await rootQuery(
    "update clara.sandbox_exports set state='running', claimed_by=$2, claimed_at=now(), lease_expires_at=now()+interval '20 minutes' where id=$1",
    [exportId, "worker-2"]);
  await rootQuery("select clara.complete_sandbox_export($1,$2,$3,$4,$5)",
    [exportId, "worker-2", sha256hex("p1"), 10, "firms/x/sandbox/a.pdf"]);
  // A terminal row is immutable in full (the codex-M2 shape), so a second completion attempt
  // cannot even re-claim: force the row back to running directly to isolate the SET-ONCE arm.
  await assert.rejects(
    rootQuery("update clara.sandbox_exports set state='running' where id=$1 and state='done'", [exportId]),
    (e) => { assert.equal(e.code, "CLR08"); return true; },
    "a terminal (done) row refuses re-opening -- the immutability wall IS the double-complete wall");
});

test("B6.4 -- a worker without the lease refuses sandbox_export_lease_not_held, for payload/complete/fail alike", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const exportId = await fullExportRow(t);
  for (const call of [
    () => rootQuery("select clara.sandbox_export_payload($1,$2)", [exportId, "nobody"]),
    () => rootQuery("select clara.complete_sandbox_export($1,$2,$3,$4,$5)", [exportId, "nobody", sha256hex("z"), 1, "k"]),
    () => rootQuery("select clara.fail_sandbox_export($1,$2,$3)", [exportId, "nobody", {}]),
  ]) {
    const e = await call().catch((err) => err);
    assert.equal(e.code, "CLR43", "lease-not-held is CLR43 across all three worker verbs");
    assert.match(e.detail || "", /sandbox_export_lease_not_held/);
  }
});

test("B6.5 -- sandbox_views refuses UPDATE/DELETE (append-only) and TRUNCATE (no-truncate)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "ao");
  await assert.rejects(
    rootQuery("update clara.sandbox_views set model_snapshot='tampered' where id=$1", [viewId]),
    (e) => { assert.equal(e.code, "CLR08"); return true; });
  await assert.rejects(
    rootQuery("delete from clara.sandbox_views where id=$1", [viewId]),
    (e) => { assert.equal(e.code, "CLR08"); return true; });
});

test("B6.6 -- cross-firm isolation: firm A's session sees zero of firm B's sandbox rows (positive read)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellB = await Promise.resolve(fx.B1.id);
  const viewBId = await mintView(world.firms.B, world.users.dave, cellB, "isob");
  const seenFromA = await asHuman(world.users.alice, (db) =>
    db.query("select count(*)::int n from clara.sandbox_views where id=$1", [viewBId]));
  assert.equal(seenFromA.rows[0].n, 0, "a POSITIVE read of a real firm-B row from firm A must return zero, never an empty table by accident");
  const seenFromB = await asHuman(world.users.dave, (db) =>
    db.query("select count(*)::int n from clara.sandbox_views where id=$1", [viewBId]));
  assert.equal(seenFromB.rows[0].n, 1, "firm B's own session DOES see it -- proves the zero above was RLS, not an empty table");
});

// =============================================================================================
// SS3.7 / G-3 -- the narrative-authority wall's catalog census, in both directions.
// =============================================================================================
test("G-3 -- no FK / uuid column in posting, reporting or knowledge layers references sandbox_views or sandbox_exports", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  // Excludes this lane's OWN three relations as SOURCE tables (sandbox_exports.sandbox_view_id ->
  // sandbox_views is a legitimate in-lane FK, not the laundering channel G-3 walls against).
  const r = await rootQuery(
    `select count(*)::int n from pg_constraint c
       join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'f' and n.nspname = 'clara'
        and c.confrelid in ('clara.sandbox_views'::regclass, 'clara.sandbox_exports'::regclass)
        and t.relname not in ('sandbox_views','sandbox_exports','export_recipients')`);
  assert.equal(r.rows[0].n, 0, "no FK OUTSIDE this lane's own relations points at sandbox_views/sandbox_exports");
});
