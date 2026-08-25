// F-A5b PR-1 -- THE SANDBOX EXPORT LANE'S DB LAYER, for
// migrations/0132_f_a5b_pr1_sandbox_export.sql.
//
// Design of record: docs/plan/active/sandbox-export-design.md (v2, gate-folded 2026-08-23) +
// -design-part2.md + -annexes.md (Annex A surface, B battery, C decisions) + the gate record's
// 2026-08-23 owner rulings (SS6, both owner cards RULED) + the post-push consolidated fix-round
// mandate (opus fresh-context review + Codex law-28 pass against tip 70ad2fa, TIER A folded).
//
// SCOPE. PR-1 is DB-only. The second render entrance is F-A5b's own PR-3 -- B3.1/B3.4/B3.5/B3.6
// (watermark bytes) and B5.* (one architecture) are out of scope here, named and skipped. B1.3
// (cross_client) skips until F-A6 v2 merges and B1.2/B1.4/B1.6/B1.9(firm leg) skip until F-A6 PR-1
// merges (measured at runtime on this chain, not assumed). B4.1 skips per the annex's own framing.
//
// THE FAIL-SAFE INTERIM (TIER A A1(iii)). Every block kind this PR-1 admits is free text
// (kind='text'), and the substitution seam is unbuilt, so `_sandbox_client_set` now ALWAYS widens
// the returned client_set to firm_closure (the full firm roster) once any block validates -- never
// the "exact" per-basis-kind set alone. Every cell below that used to assert client_set_basis
// 'exact' now asserts 'firm_closure' and a SUBSET containment (the fixture's own clients are IN
// the roster), not an equality -- the roster also contains whatever else buildWorld()/freshDeltaClient
// minted under that firm.
//
// EVERY WALL IS FORCED IN BOTH POLARITIES (law 31): a refusal cell's differential twin must be
// ADMITTED, and the two differ in exactly the term the wall reads.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  rootQuery, endPool, asWake, asHuman, ROLES, opk, roleQuery,
} from "./rig-helpers.mjs";
import { buildWorld, mintWake } from "./rig-fixtures.mjs";
import {
  freshDeltaClient, createStandardSets, mintPeriodWithMovement, proposeMetricDefinition,
  approveMetricDefinition, evaluateMetricHuman, metricAst, measure, cellRow, pastMonthStart,
} from "./delta-fixtures.mjs";
import { withTxn, truncateGuardError } from "./rig-txn.mjs";

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
      "clara._watermark_policy_version_for(text,text,date)",
      "clara._sandbox_view_mint_core(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text)",
      "clara._sandbox_export_request_core(uuid,uuid,uuid,text,uuid,uuid,text,jsonb,text,text)",
      "clara.wake_mint_sandbox_view(jsonb,jsonb,text,jsonb,text)",
      "clara.wake_request_sandbox_export(uuid,uuid,text,text,jsonb,text)",
      "clara.wake_sandbox_export_state(uuid)",
      "clara.sandbox_export_payload(uuid,text)",
      "clara.complete_sandbox_export(uuid,text,text,bigint,text)",
      "clara.fail_sandbox_export(uuid,text,jsonb)",
      "clara.register_export_recipient(text,uuid,text,text,uuid[],text)",
      "clara.supersede_export_recipient(uuid,text,uuid[],text)",
      "clara.list_sandbox_exports(uuid,int)",
    ]],
  );
  const s = r.rows[0];
  const halves = [s.relations, s.fns === 14, s.wm === 3];
  if (halves.every((h) => !h)) return false;
  if (!halves.every((h) => h)) {
    throw new Error(`F-A5b PR-1 DRIFT: relations=${s.relations} fns=${s.fns}/14 sandbox_watermark rows=${s.wm}/3`);
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
// A3: the 0106 idiom -- provider/model/version, never model/model_version.
const model = (over = {}) => ({ provider: "anthropic", model: "claude-opus-5", version: "2026-08", ...over });

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

test("B1.1 -- a preview-cell basis derives -- with the A1(iii) fail-safe, the returned set is the FULL firm roster (firm_closure), containing the cited client", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const label = "cell1";
  const body = textBody([textBlock(label)]);
  const basis = basisArr(previewBasis(label, cellId));
  const r = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [body, basis, "b1.1", model(), opk("b11")]));
  const out = r.rows[0].r;
  assert.ok(out.client_set.includes(fx.A1.clientId), "the cited client is in the derived (widened) set");
  assert.equal(out.client_set_basis, "firm_closure", "the fail-safe interim always widens while free text is present");
  // NT-1 (opus, final round): client_set alone is vacuous once widened to the full firm roster --
  // assert the REAL, pre-widening exact derivation instead.
  assert.deepEqual([...out.client_set_exact].sort(), [fx.A1.clientId].sort(),
    "the EXACT (pre-widening) derivation for a single preview-cell basis is exactly that one client, not the roster");
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
  assert.ok(ok.rows[0].r.client_set.includes(fx.A1.clientId));
});

test("B1.7 -- replay: deriving the same view's client_set twice is byte-identical (P-3)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const label = "replay";
  const body = textBody([textBlock(label)]);
  const basis = basisArr(previewBasis(label, cellId));
  const viewId = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [body, basis, "b1.7", model(), opk("b17")])).then((r) => r.rows[0].r.sandbox_view_id);
  const row = await rootQuery("select client_set, client_set_basis from clara.sandbox_views where id=$1", [viewId]);
  // The row is append-only; "replay" here is re-deriving from the SAME durable basis/body via the
  // core directly and comparing against the frozen row -- a pure function of durable rows.
  const rederived = await rootQuery("select clara._sandbox_client_set($1,$2,$3) as r", [world.firms.A, basis, body]);
  const sortedA = [...row.rows[0].client_set].sort();
  const sortedB = [...JSON.parse(JSON.stringify(rederived.rows[0].r.client_set))].sort();
  assert.deepEqual(sortedA, sortedB, "the same basis/body derives the SAME set on replay");
  assert.equal(row.rows[0].client_set_basis, rederived.rows[0].r.client_set_basis);
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
  assert.ok(ok.rows[0].r.client_set.includes(fx.A1.clientId) && ok.rows[0].r.client_set.includes(fx.A2.clientId));
  // NT-1 (opus, final round): the widened client_set above passes trivially whether the exact
  // derivation actually produced {A1,A2} or silently narrowed to {A1} alone -- the real positive
  // claim is on client_set_exact.
  assert.deepEqual([...ok.rows[0].r.client_set_exact].sort(), [fx.A1.clientId, fx.A2.clientId].sort(),
    "the EXACT derivation for two preview-cell blocks is precisely {A1,A2}, not a narrowed subset");

  const droppedRefBlock = { blocks: [textBlock("a"), { kind: "text", displayed_text: "block b, no ref" }] };
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [droppedRefBlock, basis, "b1.9-drop", model(), opk("b19drop")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_block_basis_absent/); return true; },
    "dropping the second block's basis_ref must REFUSE, never silently derive {A} alone");
});

test("A1(i) -- a duplicate label in the basis refuses sandbox_view_basis_malformed; the twin with distinct labels succeeds", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const dupBasis = basisArr(previewBasis("x", cellId), previewBasis("x", cellId));
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [textBody([textBlock("x")]), dupBasis, "a1i-refuse", model(), opk("a1idup")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_basis_malformed/); return true; });
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [textBody([textBlock("x")]), basisArr(previewBasis("x", cellId)), "a1i-ok", model(), opk("a1iok")]));
  assert.ok(ok.rows[0].r.sandbox_view_id);
});

test("A1(i) -- a blank label refuses sandbox_view_basis_malformed", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [textBody([textBlock("x")]), basisArr({ label: "  ", kind: "preview_cell", id: cellId }), "a1i-blank", model(), opk("a1iblank")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_basis_malformed/); return true; });
});

test("A1(ii) -- EVERY basis element is validated, including ones no block references: a foreign/absent/malformed id refuses typed", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const cellB1 = await Promise.resolve(fx.B1.id);
  // "unreferenced" -- x is used by the one block; y is NOT, and points at another firm's cell.
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [textBody([textBlock("x")]), basisArr(previewBasis("x", cellId), previewBasis("y", cellB1)), "a1ii-foreign", model(), opk("a1iiforeign")])),
    (e) => { assert.equal(e.code, "CLR11"); assert.match(e.detail || "", /sandbox_view_basis_unknown/); return true; },
    "an unreferenced element with a foreign id still refuses");
  // A malformed (non-uuid) id string on an UNREFERENCED element must refuse typed, never a raw
  // 22P02 cast exception (the nit the widened validation closes).
  const malformed = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
      [textBody([textBlock("x")]), basisArr(previewBasis("x", cellId), { label: "y", kind: "preview_cell", id: "not-a-uuid" }), "a1ii-malformed", model(), opk("a1iimalformed")]))
    .catch((e) => e);
  assert.equal(malformed.code, "CLR10", `expected a typed CLR10, got ${malformed.code} (${malformed.message})`);
  assert.match(malformed.detail || "", /sandbox_view_basis_unknown/);
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

test("B1.12 -- firm_closure covers non-active clients too (archived/onboarding) -- named skip: no onboarding/archived fixture client is minted by this battery's own world builders", async (t) => {
  // freshDeltaClient/buildWorld mint ACTIVE clients only; standing up an onboarding-or-archived
  // client needs a separate audited path (begin_client_onboarding without commit, or
  // cancel_client_onboarding) this battery does not otherwise touch. Registered per A10's own
  // named-skip allowance rather than half-built against a fixture this file does not own. The
  // underlying predicate (no status conjunct on the firm_closure query, gate M2/C-21) is read
  // directly off the migration text and is unconditional -- there is no branch for it to take.
  t.skip("named: no onboarding/archived fixture client available in this battery's world builders (A10)");
});

test("B1.13 -- the mint-side sandbox_view_client_set_empty arm, for a preview_cell basis, is structurally unreachable in this PR-1 -- named skip, like B1.12 (opus final round: the prior body asserted basis_unknown under a title claiming client_set_empty, a title/body mismatch, never a real B1.13 witness)", async (t) => {
  // metric_cells FKs to clara.clients (not-null, referencing). A preview_cell basis element can
  // therefore only ever RESOLVE to a real, existing client of the firm it belongs to -- so a firm
  // whose preview_cell basis element resolves at all cannot simultaneously have zero clients (the
  // resolved cell's own client is proof of at least one), and a firm with zero clients can only
  // ever produce sandbox_view_basis_unknown for a preview_cell basis (no cell can exist there to
  // resolve), never reaching the empty-derived-set check downstream. The prior attempt at this
  // cell (this file's own history) tried exactly the zero-client-firm construction and landed on
  // basis_unknown, mislabelling that as B1.13 rather than recognising it as the STRUCTURAL reason
  // no preview_cell path can ever witness client_set_empty in this build. The CHECK constraint
  // ck_sandbox_views_client_set_nonempty and the belt raise inside _sandbox_view_mint_core remain
  // in place as defence-in-depth for a future basis kind (a chart_ref or a freeform_read row whose
  // OWN client can be legitimately absent) that this PR-1 does not ship.
  t.skip("named: the preview_cell-only empty-set arm is structurally unreachable in this build (metric_cells FKs clients) -- see comment");
});

test("A10: body_malformed -- no blocks / non-text kind refuses (the cell PREVIOUSLY mis-labelled B1.13)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  // A1(ii) validates EVERY basis element up front, before the body/blocks are even inspected -- so
  // this cell needs a REAL, resolvable basis element (not a random id) to reach the body-shape
  // checks it is actually testing, rather than tripping the (correct, but different) basis wall.
  const cellId = await Promise.resolve(fx.A1.id);
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [{ blocks: [] }, basisArr(previewBasis("x", cellId)), "malformed-empty", model(), opk("malformedempty")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_body_malformed/); return true; });
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [{ blocks: [{ kind: "chart_ref", basis_ref: "x" }] }, basisArr(previewBasis("x", cellId)), "malformed-kind", model(), opk("malformedkind")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_view_body_malformed/); return true; });
});

// =============================================================================================
// A3 -- PROVENANCE THREADING (opus F3 = Codex #7).
// =============================================================================================

test("A3 -- p_model missing provider/model/version refuses at the wrapper; a complete model succeeds", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const basis = basisArr(previewBasis("x", cellId));
  await assert.rejects(
    asSandboxWake(world.firms.A, world.users.alice, (db) =>
      db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
        [textBody([textBlock("x")]), basis, "a3-badmodel", { provider: "anthropic", model: "claude-opus-5" }, opk("a3badmodel")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /invalid_request/); return true; });
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [textBody([textBlock("x")]), basis, "a3-ok", model(), opk("a3ok")]));
  assert.ok(ok.rows[0].r.sandbox_view_id);
  const stored = await rootQuery("select model_snapshot, rationale from clara.sandbox_views where id=$1", [ok.rows[0].r.sandbox_view_id]);
  assert.deepEqual(stored.rows[0].model_snapshot, model());
  assert.equal(stored.rows[0].rationale, "a3-ok");
});

test("A3 -- an op_key replayed with CHANGED provenance (model/rationale) CONFLICTS, never silently replays", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const basis = basisArr(previewBasis("x", cellId));
  const key = opk("a3replay");
  const first = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [textBody([textBlock("x")]), basis, "first rationale", model(), key]));
  assert.ok(first.rows[0].r.sandbox_view_id);
  const conflict = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
      [textBody([textBlock("x")]), basis, "DIFFERENT rationale", model(), key])).catch((e) => e);
  assert.equal(conflict.code, "CLR10", `expected op_key reuse to conflict, got ${conflict.code}`);
  assert.match(conflict.message || "", /op_key reused with different args/i);
});

// =============================================================================================
// opus F8, final round -- THE WRAPPER GUARDS. Every wrapper's OWN pre-core validation (blank
// op_key, blank rationale, an unrecognised locale) had no direct cell, and assert_wake_allowed's
// fine-grained per-wake_kind refusal (the mechanism the whole allowlist census in the migration
// tail exists to prove is load-bearing) had none either.
// =============================================================================================
test("wrapper guard -- a blank p_op_key refuses at wake_mint_sandbox_view before the core ever runs", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const e = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
      [textBody([textBlock("x")]), basisArr(previewBasis("x", cellId)), "rat", model(), "   "])).catch((err) => err);
  assert.equal(e.code, "CLR10");
  assert.match(e.detail || "", /"class":"op_key"/);
});

test("wrapper guard -- a blank p_rationale refuses at wake_mint_sandbox_view before the core ever runs", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const e = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
      [textBody([textBlock("x")]), basisArr(previewBasis("x", cellId)), "  ", model(), opk("wgblankrat")])).catch((err) => err);
  assert.equal(e.code, "CLR10");
  assert.match(e.detail || "", /"class":"rationale"/);
});

test("wrapper guard -- an unrecognised p_locale refuses at wake_request_sandbox_export before the core ever runs", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "wglocale");
  const member = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.bob, displayName: "WG-locale" });
  const e = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6)",
      [viewId, member, "fr", "wglocale", model(), opk("wglocale")])).catch((err) => err);
  assert.equal(e.code, "CLR10");
  assert.match(e.detail || "", /"class":"locale"/);
});

test("wrapper guard -- assert_wake_allowed refuses a non-allowlisted wake_kind (interactive_client, mintable but not allowlisted for this lane's verbs)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  // interactive_client credentials dispatch under the SAME clara_wake_interactive role as
  // interactive credentials (0107's role-vs-allowlist split, this migration's own SECTION 6
  // header) -- so a call under one reaches this wrapper's SQL-level EXECUTE grant just fine, and
  // it is assert_wake_allowed's OWN per-wake_kind check (not the coarser role grant) that must
  // refuse it. interactive_client requires a non-null client_id (wake_credentials' own CHECK).
  const clientId = fx.A1.clientId;
  const cred = await roleQuery(ROLES.runtime,
    "select * from clara.mint_wake_credential(p_wake_kind => $1, p_firm => $2, p_on_behalf_of => $3, p_ttl => $4::interval, p_client => $5)",
    ["interactive_client", world.firms.A, world.users.alice, "15 minutes", clientId]);
  const secret = cred.rows[0].secret;
  const cellId = await Promise.resolve(fx.A1.id);
  const e = await asWake(ROLES.wakeInteractive, secret, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5)",
      [textBody([textBlock("x")]), basisArr(previewBasis("x", cellId)), "wg-kind", model(), opk("wgkind")])).catch((err) => err);
  assert.equal(e.code, "CLR03",
    `an interactive_client credential must be refused by assert_wake_allowed (not allowlisted for wake_mint_sandbox_view), got ${e.code}: ${e.message}`);
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

test("A9 -- external recipients are DARK at the request door regardless of coverage math (Codex #4, enforcing design-part2:132)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellA = await Promise.resolve(fx.A1.id);
  const cellB = await Promise.resolve(fx.A2.id);
  const viewId = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_mint_sandbox_view($1,$2,$3,$4,$5) as r",
      [textBody([textBlock("a"), textBlock("b")]), basisArr(previewBasis("a", cellA), previewBasis("b", cellB)),
        "a9", model(), opk("a9view")])).then((r) => r.rows[0].r.sandbox_view_id);
  // Register an external recipient that WOULD cover the whole firm roster -- coverage math would
  // pass if it were reached. It must never be reached: the kind check refuses first.
  const firmClients = await rootQuery("select id from clara.clients where firm_id=$1", [world.firms.A]);
  const wouldCover = await registerExternal(world.firms.A, world.users.alice,
    { displayName: "Would-cover", coveredClients: firmClients.rows.map((r) => r.id) });
  const refused = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6)",
      [viewId, wouldCover, "en", "a9-external", model(), opk("a9external")])).catch((e) => e);
  assert.equal(refused.code, "CLR10");
  assert.match(refused.detail || "", /sandbox_export_external_unavailable/);
  // The differential twin: a firm_member recipient for the SAME view succeeds normally.
  const member = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.bob, displayName: "Bob-a9" });
  const ok = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [viewId, member, "en", "a9-member", model(), opk("a9member")]));
  assert.equal(ok.rows[0].r.state, "claimable");
});

test("B2.3 -- a firm_closure view + an external recipient covering a strict subset REFUSES -- the SS3.2 consequence, made visible via the coverage core directly (A9 makes the request door dark for external; this cell forces the underlying predicate itself)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const partial = await registerExternal(world.firms.A, world.users.alice, { displayName: "B2.3-partial", coveredClients: [fx.A1.clientId] });
  const e = await rootQuery("select clara._recipient_covers($1,$2,$3)", [world.firms.A, [fx.A1.clientId, fx.A2.clientId], partial]).catch((err) => err);
  assert.equal(e.code, "CLR10");
  assert.match(e.detail || "", /recipient_coverage_incomplete/);
  assert.match(e.detail || "", new RegExp(fx.A2.clientId));
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

// =============================================================================================
// F5 (opus, final round) -- THE HUMAN FLOORS. Every human caller elsewhere in this battery is an
// owner (alice/dave/adminSub) -- bob (bookkeeper) and carol (viewer) appear only as REGISTRATION
// ARGUMENTS, never as CALLERS, so the rank floor on the two admin+ verbs and the bookkeeper+ floor
// on the read verb were never actually exercised by a caller who could fail them. C-8: covered_
// clients IS the wall (design SS3.3) -- its authorship floor merges unproven without these cells.
// =============================================================================================
test("F5 -- register_export_recipient refuses a bookkeeper (needs admin+)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const e = await asHuman(world.users.bob, (db) =>
    db.query("select clara.register_export_recipient($1,$2,$3,$4,$5,$6)",
      ["firm_member", world.users.carol, "F5-bk", "bk floor", null, opk("f5reg")])).catch((err) => err);
  assert.equal(e.code, "CLR04", "a bookkeeper is below register_export_recipient's admin+ floor");
});

test("F5 -- supersede_export_recipient refuses a bookkeeper (needs admin+)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const original = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.carol, displayName: "F5-sup-target" });
  const e = await asHuman(world.users.bob, (db) =>
    db.query("select clara.supersede_export_recipient($1,$2,$3,$4)",
      [original, "F5 bookkeeper attempt", null, opk("f5sup")])).catch((err) => err);
  assert.equal(e.code, "CLR04", "a bookkeeper is below supersede_export_recipient's admin+ floor");
});

test("F5 -- list_sandbox_exports refuses a viewer (below bookkeeper+) and succeeds for a bookkeeper (positive read)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const refused = await asHuman(world.users.carol, (db) =>
    db.query("select clara.list_sandbox_exports($1,$2)", [null, 10])).catch((err) => err);
  assert.equal(refused.code, "CLR04", "a viewer is below list_sandbox_exports' bookkeeper+ floor");

  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "f5list");
  const member = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.bob, displayName: "F5-list-recipient" });
  await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6)",
      [viewId, member, "en", "f5list", model(), opk("f5listreq")]));
  const allowed = await asHuman(world.users.bob, (db) =>
    db.query("select clara.list_sandbox_exports($1,$2) as r", [viewId, 10]));
  assert.ok(Array.isArray(allowed.rows[0].r) && allowed.rows[0].r.length >= 1,
    "a bookkeeper meets the floor and reads at least the export just requested");
});

test("F5 -- register_export_recipient refuses a covered_clients id from another firm", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const e = await asHuman(world.users.alice, (db) =>
    db.query("select clara.register_export_recipient($1,$2,$3,$4,$5,$6)",
      ["external", null, "F5-cross-firm-reg", "cross-firm test", [fx.B1.clientId], opk("f5regcf")])).catch((err) => err);
  assert.equal(e.code, "CLR11");
  // jsonb serialises keys SORTED (by length then lexicographically), never in jsonb_build_object's
  // insertion order -- a regex assuming "reason" precedes "class" broke on the real {"class":...,
  // "reason":...,"unknown":...} ordering. Match each fact independently instead of assuming order.
  assert.match(e.detail || "", /"reason":\s*"invalid_request"/);
  assert.match(e.detail || "", /"class":\s*"covered_clients"/);
  assert.match(e.detail || "", new RegExp(fx.B1.clientId), "the refusal names the offending foreign-firm id");
});

test("F5 -- supersede_export_recipient refuses a covered_clients id from another firm", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const original = await registerExternal(world.firms.A, world.users.alice, { displayName: "F5-cross-firm-sup", coveredClients: [fx.A1.clientId] });
  const e = await asHuman(world.users.alice, (db) =>
    db.query("select clara.supersede_export_recipient($1,$2,$3,$4)",
      [original, "F5 cross-firm attempt", [fx.B1.clientId], opk("f5supcf")])).catch((err) => err);
  assert.equal(e.code, "CLR11");
  assert.match(e.detail || "", new RegExp(fx.B1.clientId), "the refusal names the offending foreign-firm id");
});

test("B2.5 / A4 -- a superseded recipient refuses; the successor covers; basis is PRESERVED (never overwritten by the reason); covered_clients is EXPLICIT, never a silent clone", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  // The BASIS-PRESERVATION / covered_clients-explicit assertions (A4) use an EXTERNAL recipient
  // (the shape that actually carries covered_clients). The REQUEST-DOOR "superseded refuses"
  // assertion (B2.5) uses a SEPARATE firm_member recipient instead -- A9 makes external recipients
  // dark at the request door BEFORE the superseded check is ever reached, so an external fixture
  // cannot exercise export_recipient_superseded through that door any more; a firm_member can.
  const original = await registerExternal(world.firms.A, world.users.alice, { displayName: "Orig", coveredClients: [fx.A1.clientId] });
  const originalRow = await rootQuery("select basis from clara.export_recipients where id=$1", [original]);
  const supersededRow = await asHuman(world.users.alice, (db) =>
    db.query("select clara.supersede_export_recipient($1,$2,$3,$4) as r",
      [original, "role change", [fx.A1.clientId], opk("b25sup")]));
  const superseded = supersededRow.rows[0].r.recipient_id;
  const newRow = await rootQuery("select basis, covered_clients from clara.export_recipients where id=$1", [superseded]);
  assert.equal(newRow.rows[0].basis, originalRow.rows[0].basis, "A4: basis carries FORWARD from the predecessor, never overwritten by the supersede reason");
  assert.deepEqual([...newRow.rows[0].covered_clients].sort(), [fx.A1.clientId].sort());
  // The successor still covers -- proven via the coverage CORE directly (the request door is dark
  // for external kind regardless, by A9's own design, so this is the honest instrument now).
  const cover = await rootQuery("select clara._recipient_covers($1,$2,$3) as r", [world.firms.A, [fx.A1.clientId], superseded]);
  assert.equal(cover.rows[0].r.covered, true);

  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "sup");
  const memberOriginal = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.carol, displayName: "Carol-b25" });
  await asHuman(world.users.alice, (db) =>
    db.query("select clara.supersede_export_recipient($1,$2,$3,$4)",
      [memberOriginal, "role change", null, opk("b25supmember")]));
  const refused = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6)",
      [viewId, memberOriginal, "en", "b2.5-old", model(), opk("b25old")])).catch((e) => e);
  assert.equal(refused.code, "CLR10");
  assert.match(refused.detail || "", /export_recipient_superseded/);
});

test("A4 -- supersede refuses a firm_member successor carrying covered_clients, and an external successor missing them", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const member = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.carol, displayName: "Carol-a4" });
  await assert.rejects(
    asHuman(world.users.alice, (db) =>
      db.query("select clara.supersede_export_recipient($1,$2,$3,$4)",
        [member, "a4 bad", [fx.A1.clientId], opk("a4badmember")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /covered_clients/); return true; });

  const external = await registerExternal(world.firms.A, world.users.alice, { displayName: "Ext-a4", coveredClients: [fx.A1.clientId] });
  await assert.rejects(
    asHuman(world.users.alice, (db) =>
      db.query("select clara.supersede_export_recipient($1,$2,$3,$4)",
        [external, "a4 missing", null, opk("a4missingext")])),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /covered_clients/); return true; });
});

test("B2.6 -- covered_clients cannot be written by any wake verb (prosrc census, both applicable verb families) + behavioral half: no wake wrapper's signature even carries the parameter", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const r = await rootQuery(
    `select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='clara' and p.proname like 'wake_%sandbox%'
         and lower(p.prosrc) ~ 'covered_clients'`);
  assert.equal(r.rows[0].n, 0);
  // Behavioral half (A10): the three wake wrapper signatures are read from the live catalog and
  // NONE carries a uuid[] argument at all -- there is no surface an agent-lane call could even
  // attempt to smuggle covered_clients through.
  const sigs = await rootQuery(
    `select p.proname, pg_get_function_arguments(p.oid) as args from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname in ('wake_mint_sandbox_view','wake_request_sandbox_export','wake_sandbox_export_state')`);
  for (const row of sigs.rows) {
    assert.doesNotMatch(row.args, /uuid\[\]/, `${row.proname} carries no uuid[] argument`);
  }
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
// B3 / A2 -- WATERMARK REQUEST-DOOR (SS3.6) + SINGLE AUTHORITY (opus F2). B3.1/B3.4/B3.5/B3.6 are
// the RENDERER's own (PR-3); this battery only forces the REQUEST-time presence check PR-1 owns.
// =============================================================================================

test("B3.2 / A2 -- with no sandbox_watermark row effective for the window, BOTH the public resolver and the ungranted core refuse watermark_policy_absent identically; a covered window succeeds on both", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  // The owner ratified all THREE legal locales (en/ms/zh) at once, and watermark_policy_versions is
  // append-only -- so there is no live "delete a ratified row" way to exercise this wall through
  // the wrapper on THIS migration's own seeded state. This cell forces the SAME predicate at an
  // as_of date OUTSIDE the row's effective window, through BOTH doors: the public CoR'd resolver
  // (clara.watermark_policy_for) and the shared core it now delegates to
  // (clara._watermark_policy_version_for) -- opus F2's single-authority proof, not just a
  // behavioural coincidence.
  const outsideWindow = "2020-01-01";
  const viaPublic = await rootQuery("select clara.watermark_policy_for('sandbox_watermark','en',$1::date)", [outsideWindow]).catch((e) => e);
  const viaCore = await rootQuery("select clara._watermark_policy_version_for('sandbox_watermark','en',$1::date)", [outsideWindow]).catch((e) => e);
  for (const e of [viaPublic, viaCore]) {
    assert.equal(e.code, "CLR10");
    assert.match(e.detail || "", /watermark_policy_absent/);
  }
  // A2's positive probe via the UNVALIDATED p_locale path: the CORE itself (not the wrapper, which
  // validates locale in ('en','ms','zh') before ever calling down) still refuses cleanly, typed,
  // on a locale that resolves no row -- proving the wall does not rely on the wrapper's own gate.
  const unvalidatedLocale = await rootQuery(
    "select clara._watermark_policy_version_for('sandbox_watermark','fr',clara._book_today())").catch((e) => e);
  assert.equal(unvalidatedLocale.code, "CLR10");
  assert.match(unvalidatedLocale.detail || "", /watermark_policy_absent/);

  const okPublic = await rootQuery("select clara.watermark_policy_for('sandbox_watermark','en',clara._book_today()) as w");
  assert.ok(okPublic.rows[0].w?.watermark, "an as_of date inside the ratified row's window resolves the watermark text (public resolver)");
  const okCore = await rootQuery("select clara._watermark_policy_version_for('sandbox_watermark','en',clara._book_today()) as r");
  assert.ok(okCore.rows[0].r, "and via the shared core directly");
});

// =============================================================================================
// A6 -- wake_sandbox_export_state is VOLATILE (a receipted reader), not STABLE.
// =============================================================================================

test("A6 -- wake_sandbox_export_state is volatile (not stable), writes its own audit receipt, and is firm-scoped", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const vol = await rootQuery(
    "select provolatile from pg_proc where oid='clara.wake_sandbox_export_state(uuid)'::regprocedure");
  assert.notEqual(vol.rows[0].provolatile, "s", "a receipted reader is volatile in this estate -- no precedent for stable+audit");

  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "a6");
  const member = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.bob, displayName: "Bob-a6" });
  const exportId = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [viewId, member, "en", "a6", model(), opk("a6req")])).then((r) => r.rows[0].r.sandbox_export_id);

  const before = await rootQuery("select count(*)::int n from clara.audit_log where fn='wake_sandbox_export_state' and entry_id=$1", [exportId]);
  await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_sandbox_export_state($1)", [exportId]));
  const after = await rootQuery("select count(*)::int n from clara.audit_log where fn='wake_sandbox_export_state' and entry_id=$1", [exportId]);
  assert.equal(after.rows[0].n, before.rows[0].n + 1, "wake_sandbox_export_state writes exactly one audit row per call");

  // Firm scoping: firm B's session cannot read firm A's export state.
  const foreign = await asSandboxWake(world.firms.B, world.users.dave, (db) =>
    db.query("select clara.wake_sandbox_export_state($1)", [exportId])).catch((e) => e);
  assert.equal(foreign.code, "CLR11");
});

// =============================================================================================
// Codex #14 -- sandbox_export_payload previously handed the worker only the pinned
// watermark_policy_version_id UUID, never the watermark TEXT -- clara_runtime holds no table grant
// on watermark_policy_versions (0111 grants humans only), so PR-3's renderer had no door to it.
// One join now resolves the pinned TEXT at payload time. This cell forces the harder claim: the
// resolved text is the REQUEST-time pin, not whatever the policy resolves to NOW.
// =============================================================================================
test("A-payload -- sandbox_export_payload returns the REQUEST-time pinned watermark text, unaffected by a later policy bump", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "wmpin");
  const member = await registerFirmMember(world.firms.A, world.users.alice, { user: world.users.bob, displayName: "Bob-wmpin" });
  const requested = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [viewId, member, "en", "wmpin", model(), opk("wmpin")]));
  const exportId = requested.rows[0].r.sandbox_export_id;
  const pinnedId = requested.rows[0].r.watermark_policy_version_id;
  assert.ok(pinnedId, "the request pins a watermark_policy_version_id");

  const pinnedRow = await rootQuery("select watermark from clara.watermark_policy_versions where id=$1", [pinnedId]);
  const pinnedText = pinnedRow.rows[0].watermark;

  // watermark_policy_versions is append-only (0111) -- a bump row, once committed, can never be
  // taken back and would permanently move fa5bReady()'s own exact "3 seeded rows" drift-detector
  // to 4 for every future invocation against this database. The bump, the positive control, the
  // claim simulation and the payload call therefore all run on ONE never-committed transaction
  // (withTxn, commit:false): the bump is fully visible to every read inside it, and vanishes on
  // rollback, so this cell proves the same properties without leaving a permanent mark.
  const bumpText = { watermark: "BUMPED TEXT -- must never appear in an already-requested export's payload" };
  await withTxn(async (c) => {
    // Bump the policy AFTER the request: a NEW, LATER version for the same (policy_key, locale),
    // effective from today -- the resolver's own version-desc-limit-1 ordering would favour this
    // new row for any FRESH request made after this point. This ALREADY-REQUESTED export must not
    // see it.
    const nextVersion = await c.query(
      "select coalesce(max(version),0)+1 as v from clara.watermark_policy_versions where policy_key='sandbox_watermark' and locale='en'");
    await c.query(
      `insert into clara.watermark_policy_versions (firm_id, policy_key, version, locale, watermark, effective_from, source_note)
       values (null, 'sandbox_watermark', $1, 'en', $2::jsonb, clara._book_today(), 'A-payload test bump')`,
      [nextVersion.rows[0].v, JSON.stringify(bumpText)]);
    // Confirm the bump really is what a FRESH resolution would now pick (positive control --
    // proves the bump is not a no-op that this cell would pass vacuously). _watermark_policy_
    // version_for returns TABLE(id, watermark) -- unpack columns directly rather than wrapping in
    // `as r`, which would hand the pg driver a raw composite-row string, not a JS object.
    const freshResolve = await c.query("select watermark from clara._watermark_policy_version_for('sandbox_watermark','en',clara._book_today())");
    assert.deepEqual(freshResolve.rows[0].watermark, bumpText,
      "positive control: a FRESH resolution now picks the bumped version -- the bump is live, not inert");

    await c.query(
      "update clara.sandbox_exports set state='running', claimed_by=$2, claimed_at=now(), lease_expires_at=now()+interval '20 minutes' where id=$1",
      [exportId, "worker-wmpin"]);
    const payload = await c.query("select clara.sandbox_export_payload($1,$2) as r", [exportId, "worker-wmpin"]);
    assert.deepEqual(payload.rows[0].r.watermark, pinnedText,
      "the payload's watermark is the REQUEST-time pinned text, not whatever resolves now");
    assert.notDeepEqual(payload.rows[0].r.watermark, bumpText,
      "and specifically not the later bump's text");
  }, { commit: false });

  // Rolled back: the bump row, the claim and the (uncommitted) payload call are all gone --
  // fa5bReady()'s own drift-detector still sees exactly 3 sandbox_watermark rows.
  const afterRollback = await rootQuery(
    "select count(*)::int n from clara.watermark_policy_versions where policy_key='sandbox_watermark'");
  assert.equal(afterRollback.rows[0].n, 3, "the bump did not survive the rollback -- append-only stays append-free of test residue");
});

// =============================================================================================
// A5 -- storage_key BINDING (Codex #5).
// =============================================================================================

test("A5 -- complete_sandbox_export enforces the content-addressed storage_key shape, both polarities", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const exportId = await fullExportRow();
  await rootQuery(
    "update clara.sandbox_exports set state='running', claimed_by=$2, claimed_at=now(), lease_expires_at=now()+interval '20 minutes' where id=$1",
    [exportId, "worker-a5"]);
  const firmRow = await rootQuery("select firm_id from clara.sandbox_exports where id=$1", [exportId]);
  const sha = sha256hex("a5-payload");
  const wrongKey = "firms/not-the-firm/sandbox/" + sha + ".pdf";
  const refused = await rootQuery("select clara.complete_sandbox_export($1,$2,$3,$4,$5)",
    [exportId, "worker-a5", sha, 100, wrongKey]).catch((e) => e);
  assert.equal(refused.code, "CLR10");
  assert.match(refused.detail || "", /storage_key_mismatch/);
  const stillOpen = await rootQuery("select state, artifact_sha256 from clara.sandbox_exports where id=$1", [exportId]);
  assert.equal(stillOpen.rows[0].state, "running", "a mismatched storage_key must not complete the row");
  assert.equal(stillOpen.rows[0].artifact_sha256, null);

  const rightKey = `firms/${firmRow.rows[0].firm_id}/sandbox/${sha}.pdf`;
  const ok = await rootQuery("select clara.complete_sandbox_export($1,$2,$3,$4,$5) as r",
    [exportId, "worker-a5", sha, 100, rightKey]);
  assert.equal(ok.rows[0].r.state, "done");
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

// A10: B6.1's other 8 frozen columns, forced individually (locale was the only one probed before).
const FROZEN_COLUMN_PROBES = [
  ["firm_id", "gen_random_uuid()"],
  ["sandbox_view_id", "gen_random_uuid()"],
  ["recipient_id", "gen_random_uuid()"],
  ["coverage_proof", "'{}'::jsonb"],
  ["watermark_policy_version_id", "gen_random_uuid()"],
  ["requested_by", "gen_random_uuid()"],
  ["on_behalf_of", "gen_random_uuid()"],
  ["op_key", "'tampered'"],
];
for (const [col, val] of FROZEN_COLUMN_PROBES) {
  test(`B6.1 -- frozen column ${col} refuses UPDATE`, async (t) => {
    if (!ready) return skipHere(t, "not applied");
    const exportId = await fullExportRow();
    await assert.rejects(
      rootQuery(`update clara.sandbox_exports set ${col}=${val} where id=$1`, [exportId]),
      (e) => { assert.equal(e.code, "CLR08"); return true; },
      `${col} is part of the request half and must be frozen`);
  });
}

test("B6.1/B6.2 -- locale (sample) refuses UPDATE, moving columns accept a lawful claim/complete transition", async (t) => {
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

  const firmRow = await rootQuery("select firm_id from clara.sandbox_exports where id=$1", [exportId]);
  const sha = sha256hex("payload");
  const key = `firms/${firmRow.rows[0].firm_id}/sandbox/${sha}.pdf`;
  const done = await rootQuery(
    "select clara.complete_sandbox_export($1,$2,$3,$4,$5) as r",
    [exportId, "worker-1", sha, 1024, key]);
  assert.equal(done.rows[0].r.state, "done");
});

// A7: the 0079 lease-CHECK trio, forced both directions.
test("A7 -- claimed_by/claimed_at/lease_expires_at are null TOGETHER (three-way pairing)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const exportId = await fullExportRow();
  for (const cols of [
    "claimed_by='w', claimed_at=now()", // lease_expires_at still null
    "claimed_by='w', lease_expires_at=now()+interval '1 hour'", // claimed_at still null
    "claimed_at=now(), lease_expires_at=now()+interval '1 hour'", // claimed_by still null
  ]) {
    await assert.rejects(
      rootQuery(`update clara.sandbox_exports set ${cols} where id=$1`, [exportId]),
      (e) => { assert.equal(e.code, "23514"); return true; },
      `setting only two of the three lease columns must violate ck_sandboxexports_lease_paired (${cols})`);
  }
  await rootQuery(
    "update clara.sandbox_exports set claimed_by='w', claimed_at=now(), lease_expires_at=now()+interval '1 hour' where id=$1",
    [exportId]);
  const ok = await rootQuery("select claimed_by from clara.sandbox_exports where id=$1", [exportId]);
  assert.equal(ok.rows[0].claimed_by, "w", "all three together is lawful");
});

test("A7 -- state='running' REQUIRES claimed_by (the running=>held implication)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const exportId = await fullExportRow();
  await assert.rejects(
    rootQuery("update clara.sandbox_exports set state='running' where id=$1", [exportId]),
    (e) => { assert.equal(e.code, "23514"); return true; },
    "running with no claim at all must violate the running=>held implication");
});

test("B6.3 -- complete_sandbox_export twice refuses sandbox_export_already_completed (now REACHABLE via the real double-call path, A10)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const exportId = await fullExportRow();
  await rootQuery(
    "update clara.sandbox_exports set state='running', claimed_by=$2, claimed_at=now(), lease_expires_at=now()+interval '20 minutes' where id=$1",
    [exportId, "worker-2"]);
  const firmRow = await rootQuery("select firm_id from clara.sandbox_exports where id=$1", [exportId]);
  const sha = sha256hex("p1");
  const key = `firms/${firmRow.rows[0].firm_id}/sandbox/${sha}.pdf`;
  await rootQuery("select clara.complete_sandbox_export($1,$2,$3,$4,$5)", [exportId, "worker-2", sha, 10, key]);
  // The SAME worker calls complete AGAIN, without any manual row surgery -- the real path the
  // dead-branch finding named. claimed_by/lease persist through 'done' (A7's own CHECK), so this
  // reaches already_completed rather than the wrong lease_not_held.
  const second = await rootQuery("select clara.complete_sandbox_export($1,$2,$3,$4,$5)",
    [exportId, "worker-2", sha, 10, key]).catch((e) => e);
  assert.equal(second.code, "CLR08");
  assert.match(second.detail || "", /sandbox_export_already_completed/);
});

test("B6.4 -- a worker without the lease refuses sandbox_export_lease_not_held, for payload/complete/fail alike; the POSITIVE (lease-held) polarity succeeds for payload and fail too", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const exportId = await fullExportRow();
  for (const call of [
    () => rootQuery("select clara.sandbox_export_payload($1,$2)", [exportId, "nobody"]),
    () => rootQuery("select clara.complete_sandbox_export($1,$2,$3,$4,$5)", [exportId, "nobody", sha256hex("z"), 1, "k"]),
    () => rootQuery("select clara.fail_sandbox_export($1,$2,$3)", [exportId, "nobody", {}]),
  ]) {
    const e = await call().catch((err) => err);
    assert.equal(e.code, "CLR43", "lease-not-held is CLR43 across all three worker verbs");
    assert.match(e.detail || "", /sandbox_export_lease_not_held/);
  }
  // A10 positive polarities: payload succeeds once the lease IS held; fail (on a SEPARATE export,
  // since a completed/failed row is terminal) succeeds too.
  await rootQuery(
    "update clara.sandbox_exports set state='running', claimed_by=$2, claimed_at=now(), lease_expires_at=now()+interval '20 minutes' where id=$1",
    [exportId, "worker-held"]);
  const payload = await rootQuery("select clara.sandbox_export_payload($1,$2) as r", [exportId, "worker-held"]);
  assert.equal(payload.rows[0].r.sandbox_export_id, exportId);

  const failExportId = await fullExportRow();
  await rootQuery(
    "update clara.sandbox_exports set state='running', claimed_by=$2, claimed_at=now(), lease_expires_at=now()+interval '20 minutes' where id=$1",
    [failExportId, "worker-held2"]);
  const failed = await rootQuery("select clara.fail_sandbox_export($1,$2,$3) as r", [failExportId, "worker-held2", { reason: "test" }]);
  assert.equal(failed.rows[0].r.state, "failed");
});

test("B6.5 -- sandbox_views refuses UPDATE/DELETE (append-only) and TRUNCATE (no-truncate)", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const cellId = await Promise.resolve(fx.A1.id);
  const viewId = await mintView(world.firms.A, world.users.alice, cellId, "ao");
  await assert.rejects(
    rootQuery("update clara.sandbox_views set rationale='tampered' where id=$1", [viewId]),
    (e) => { assert.equal(e.code, "CLR08"); return true; });
  await assert.rejects(
    rootQuery("delete from clara.sandbox_views where id=$1", [viewId]),
    (e) => { assert.equal(e.code, "CLR08"); return true; });
  // opus, final round: the title claimed TRUNCATE coverage the body never actually exercised
  // (a title/body mismatch class). truncateGuardError() (rig-txn.mjs) per the db-tests.md rule --
  // never a bare TRUNCATE, which can lose a lock race before the BEFORE TRUNCATE guard ever fires.
  // CASCADE is required here for a DIFFERENT reason than the usual lock race: sandbox_exports FKs
  // to sandbox_views, so a plain TRUNCATE sandbox_views hits Postgres' own native referential-
  // integrity check (0A000, "cannot truncate a table referenced in a foreign key constraint")
  // before the BEFORE TRUNCATE trigger even gets a chance to fire -- CASCADE resolves that
  // dependency-order concern; the trigger still fires and still aborts the whole statement (the
  // trigger raising means CASCADE never actually gets to truncate anything either).
  const trunc = await truncateGuardError("truncate clara.sandbox_views cascade");
  assert.equal(trunc.code, "CLR08", `TRUNCATE must be refused by the no-truncate trigger, got ${trunc.code}: ${trunc.message}`);
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
// B4.4 -- the narrative-authority wall is structural (no definition_version_id/cell_id column).
// =============================================================================================
test("B4.4 -- sandbox_views has no definition_version_id and no cell_id column", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  const r = await rootQuery(
    `select count(*)::int n from information_schema.columns
       where table_schema='clara' and table_name='sandbox_views'
         and column_name in ('definition_version_id','cell_id')`);
  assert.equal(r.rows[0].n, 0);
});

// =============================================================================================
// SS3.7 / G-3 -- the narrative-authority wall's catalog census, in both directions. A10: gains the
// uuid-column arm (a bare, un-FK'd uuid column named for this lane would evade the FK-only scan)
// and a positive control proving the detector is not vacuous.
// =============================================================================================
test("G-3 -- no FK / uuid column in posting, reporting or knowledge layers references sandbox_views or sandbox_exports", async (t) => {
  if (!ready) return skipHere(t, "not applied");
  // FK arm. Excludes this lane's OWN three relations as SOURCE tables (sandbox_exports.sandbox_view_id
  // -> sandbox_views is a legitimate in-lane FK, not the laundering channel G-3 walls against).
  const fkCensus = await rootQuery(
    `select count(*)::int n from pg_constraint c
       join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'f' and n.nspname = 'clara'
        and c.confrelid in ('clara.sandbox_views'::regclass, 'clara.sandbox_exports'::regclass)
        and t.relname not in ('sandbox_views','sandbox_exports','export_recipients')`);
  assert.equal(fkCensus.rows[0].n, 0, "no FK OUTSIDE this lane's own relations points at sandbox_views/sandbox_exports");

  // uuid-column arm (A10, Codex #11): a bare uuid column NAMED for this lane, with no FK at all,
  // would evade the arm above entirely. opus law 3 (final round): matching by a loose SUBSTRING
  // ("sandbox" anywhere in the name) reads a projection, not the thing -- an unrelated column
  // merely CONTAINING that substring (a "sandboxed" flag, a future "sandbox_theme_id") would false-
  // positive, while the pattern proves nothing about actual reference either way (a bare uuid
  // column carries no catalog-provable identity without a FK; only DATA could ever prove that, and
  // a DDL census cannot read data). Tightened to the EXACT two column-name shapes this lane's own
  // legitimate FK'd columns use (sandbox_view_id, sandbox_export_id) -- this narrows false
  // positives on an unrelated name while staying honest that it is still a NAME heuristic, now the
  // most precise one available, paired below with the reverse arm's independent per-table
  // enumeration rather than relying on this filtered scan alone. Positive control FIRST -- prove
  // the detector can fire.
  await rootQuery(`create temp table t_g3_probe (id uuid primary key default gen_random_uuid(),
    sandbox_view_id uuid)`);
  const positiveControl = await rootQuery(
    `select count(*)::int n from information_schema.columns
       where table_schema ~ '^pg_temp' and table_name = 't_g3_probe' and column_name ~ '^sandbox_(view|export)_id$'`);
  assert.equal(positiveControl.rows[0].n, 1, "the uuid-name detector DOES catch a deliberately-planted column -- not vacuous");
  await rootQuery("drop table t_g3_probe");

  const uuidCensus = await rootQuery(
    `select count(*)::int n from information_schema.columns c
       join pg_namespace n on n.nspname = c.table_schema
      where c.table_schema = 'clara' and c.data_type = 'uuid'
        and c.column_name ~ '^sandbox_(view|export)_id$'
        and c.table_name not in ('sandbox_views','sandbox_exports','export_recipients')`);
  assert.equal(uuidCensus.rows[0].n, 0, "no uuid column OUTSIDE this lane's own relations is named for sandbox_views/sandbox_exports");

  // A10-followup (Codex re-review): the REVERSE / list-equality arm. The two arms above scan FROM
  // pg_constraint/information_schema.columns FILTERED to sandbox_* as the target -- a filter-driven
  // scan can only ever report matches it looked for; a table with a silently-broken join condition
  // or an unexpected schema would simply never appear, and "0 rows" would look identical whether
  // nothing referenced sandbox_* or the scan quietly examined nothing. F5-D30: "a roster that can
  // only find extras cannot find omissions." The reverse arm inverts the derivation: enumerate the
  // FULL universe of base tables in schema clara (excluding this lane's own three) FRESH from the
  // live catalog every run -- never a frozen hardcoded list, so a table ANY future migration adds
  // automatically enters the universe and cannot slip out of coverage -- then, independently of the
  // two arms above (a per-table predicate, not the global JOIN those use), prove each one individually
  // carries neither an FK nor a uuid column referencing this lane.
  const universe = await rootQuery(
    `select table_name from information_schema.tables
      where table_schema = 'clara' and table_type = 'BASE TABLE'
        and table_name not in ('sandbox_views','sandbox_exports','export_recipients')
      order by table_name`);
  // Floor, not a frozen count: proves the universe itself is not accidentally empty or narrow (the
  // filter-driven arms above would read as "0 violations" identically whether this reverse
  // enumeration found 3 tables or 300 -- this is what tells them apart). ~130 migrations have landed
  // by this PR; 50 is a conservative floor nowhere near the live count, chosen so the assertion never
  // needs revisiting as the estate grows.
  assert.ok(universe.rows.length >= 50,
    `G-3 reverse arm: the live-catalog universe (${universe.rows.length} tables) must be non-trivially large, or this arm is silently scanning nothing`);
  const offenders = [];
  for (const { table_name: tbl } of universe.rows) {
    // A per-table catalog probe; the universe is a few hundred rows at most and this only runs
    // once per suite invocation.
    const hit = await rootQuery(
      `select
         exists(select 1 from pg_constraint c where c.conrelid = $1::regclass and c.contype = 'f'
           and c.confrelid in ('clara.sandbox_views'::regclass, 'clara.sandbox_exports'::regclass)) as fk_hit,
         exists(select 1 from pg_attribute a where a.attrelid = $1::regclass and a.attnum > 0
           and not a.attisdropped and format_type(a.atttypid, a.atttypmod) = 'uuid'
           and a.attname ~ '^sandbox_(view|export)_id$') as uuid_hit`,
      [`clara.${tbl}`]);
    if (hit.rows[0].fk_hit || hit.rows[0].uuid_hit) offenders.push(tbl);
  }
  assert.deepEqual(offenders, [],
    `G-3 reverse arm: independently-derived per-table check found reference(s) outside the filter-driven arms' own denominator: ${offenders.join(", ")}`);
});
