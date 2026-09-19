// STANDALONE opening-ledger-source e2e (#656). NOT a `node --test` file. Run:
//
//   PGHOST=127.0.0.1 PGPORT=55706 PGUSER=postgres PGDATABASE=clara_656 RELAY_TEST_MODE=1 \
//   WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55706/clara_656 \
//   node tests/opening-ledger-source-e2e.mjs
//
// ── THE HOLE THIS CLOSES ─────────────────────────────────────────────────────────────────────
// Every half of this journey has been tested, and the JOIN between them never has. The producer
// (`lib/opening-tb-cells.mjs`) is proved against synthetic geometry with no database. The consumer
// (`lib/opening-parse.mjs`) is proved against `opening_tb.line` regions a fixture INSERTED by hand.
// The database battery proves the doors with regions it persisted itself. So nothing in the estate
// has ever run the chain end to end:
//
//   a real Azure layout payload
//     -> the real `normalizeAzureLayout` (with #656's in-line producer inside it)
//       -> the real `clara.persist_document_extraction`
//         -> the real authoritative-extraction trigger
//           -> the real `parseOpeningTargets` route core on a real clara_runtime connection
//             -> the real `clara.record_opening_targets_parsed`
//               -> the real `clara.approve_opening_seed` ceremony
//
// and that chain is where this slice's risk actually lives: a region shape the writer rejects, a
// text the DB's own grammar re-derives differently, a citation the authority trigger invalidates
// a moment later. Each of those is invisible to both halves tested apart.
//
// ── NO WORKFLOW WORLD, AND THAT IS MEASURED RATHER THAN SKIPPED ───────────────────────────────
// AC7 asks for a Workflow leg "only where the journey invokes it". Measured on this checkout:
// `grep -l "opening_seed\|opening_tb" packages/runtime/workflows/*` is EMPTY — no workflow of any
// kind touches the opening lane, and AC7's own clause for that case ("Database or Storage-only
// operations use their actual transaction/access boundaries") is the applicable one. So this leg
// spawns no engine and bootstraps no World; it drives the real route core on real connections
// under the real roles. Claiming a World proof here would be claiming evidence nobody ran.
//
// ── LOCAL ONLY ───────────────────────────────────────────────────────────────────────────────
// Everything below is LOCAL evidence on a per-ticket rig. Hosted evidence is pending.
//
// GATED, fail-closed, and it SKIPS CLEANLY (exit 0, printed reason) when 0228 is absent — the
// runtime half of #656 merges alongside its DB half, and a green e2e against a database that
// still publishes registry_version 1 would be a lie.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import * as fx from "./relay-fixtures.mjs";
import { normalizeAzureLayout } from "../lib/egress.mjs";
import { parseOpeningTargets } from "../lib/opening-parse.mjs";
import { OPENING_TB_FIELD_PATH } from "../lib/opening-tb-produce.mjs";
import { cell, HEADER, tbRow } from "./kdoc-opening-tb-testkit.mjs";

if (process.env.CLARA_SKIP_OPENING_LEDGER_SOURCE_E2E === "1") {
  console.log("[opening-source-e2e] skipped (CLARA_SKIP_OPENING_LEDGER_SOURCE_E2E=1)");
  process.exit(0);
}

// --- Fail-closed local gate, copied from prepayment-occurrence-e2e.mjs:59-75 verbatim. The
// numeric arm is what admits the per-ticket rig databases (`clara_656`, `clara_653`, …); the
// intake e2e's allowlist admits only `clara_rt_test|clara_intake_ci` and would throw here.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test|wave_b_ci|[0-9]{3,4})$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("opening-ledger-source-e2e is hard-gated to a loopback host + PGDATABASE in {clara_rt_test,clara_wave_b_ci,clara_<digits>}");
}
{
  if (!process.env.WORKFLOW_POSTGRES_URL) throw new Error("opening-ledger-source-e2e needs WORKFLOW_POSTGRES_URL");
  const u = new URL(process.env.WORKFLOW_POSTGRES_URL);
  const ok =
    u.protocol === "postgres:"
    && LOCAL_HOSTS.has(u.hostname)
    && u.port === String(process.env.PGPORT ?? "")
    && u.pathname === "/" + (process.env.PGDATABASE ?? "")
    && [...u.searchParams.keys()].length === 0;
  if (!ok) throw new Error("opening-ledger-source-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate");
}

const WATCHDOG_MS = 8 * 60 * 1000;
const watchdog = setTimeout(() => {
  console.error(`\nOPENING LEDGER SOURCE E2E: WATCHDOG — exceeded ${WATCHDOG_MS}ms; forcing exit(1) (a genuine hang)`);
  process.exit(1);
}, WATCHDOG_MS);

const log = (...a) => console.log("[opening-source-e2e]", ...a);
const TAG = randomUUID().slice(0, 8);

// The printed trial balance this leg reads. Five lines, DR 130,000.00 = CR 130,000.00, on the
// geometry measured off a real Malaysian General Ledger (kdoc-opening-tb-testkit.mjs's own header
// explains why invented coordinates would prove nothing).
const TB_ROWS = [
  { code: "310-000", label: "CASH AT BANK", dr: "105,000.00", type: "asset" },
  { code: "400-000", label: "TRADE DEBTORS", dr: "25,000.00", type: "asset" },
  { code: "500-000", label: "TRADE CREDITORS", cr: "24,252.03", type: "liability" },
  { code: "900-RE", label: "RETAINED EARNINGS", cr: "65,747.97", type: "equity", special: "retained_earnings" },
  { code: "910-000", label: "SHARE CAPITAL", cr: "40,000.00", type: "equity" },
];

/** The Azure `prebuilt-layout` payload shape, built from the measured cell geometry. */
function azurePayload() {
  const cells = [
    ...HEADER(),
    ...TB_ROWS.flatMap((r, i) => tbRow(1.43 + i * 0.28, r)),
    // A page footer that is NOT inside the amount column band — furniture the reader skips.
    cell(0.45, 3.2, "Printed on 01/01/2026"),
  ];
  return {
    analyzeResult: {
      content: "SYNTHETIC TRIAL BALANCE",
      pages: [{ pageNumber: 1, width: 8.27, height: 11.69, unit: "inch", lines: [] }],
      tables: [{
        rowCount: TB_ROWS.length + 1,
        columnCount: 4,
        cells: cells.map((c) => ({
          content: c.text_content,
          confidence: 0.98,
          boundingRegions: [{ pageNumber: c.locator.page_number, polygon: c.locator.polygon }],
        })),
      }],
    },
  };
}

async function main() {
  if (!(await fx.probeReady())) {
    log("SKIP — the rig database has no governed surface (probeReady() false)");
    return 0;
  }
  const published = (await fx.rootQuery(
    "select min(registry_version)::int as v, count(distinct registry_version)::int as n from clara.document_capabilities")).rows[0];
  if (published?.v !== 2 || published?.n !== 1) {
    log(`SKIP — 0228_opening_ledger_source.sql is not applied (registry publishes ${published?.v} across ${published?.n} value(s), expected 2 across 1)`);
    return 0;
  }

  // ── 1. A firm, an onboarding client with an opening-capable chart, and a FILED opening doc. ──
  const { owner, firm } = await fx.buildFirm(`p656-${TAG}`);
  const onb = await fx.asHuman(owner, (c) =>
    c.query("select clara.begin_client_onboarding($1,$2) as r", [`p656_${TAG}`, fx.opk("onb")]));
  const { client_id: client, plan_id: plan } = onb.rows[0].r;

  for (const r of TB_ROWS) {
    await fx.asHuman(owner, (c) => c.query(
      "select clara.upsert_account($1,$2,$3,$4,$5,$6,$7) as r",
      [client, r.code, r.label, r.type, r.special ?? null, fx.opk("acct"), null]));
  }
  // The opening-balance-equity marker the tie's FOURTH arm reads. `_assert_fa_baseline` /
  // `_draft_opening_item_core` require BOTH markers ("OBE and retained-earnings markers are
  // required" — measured, on this leg's first run), and the retained-earnings one is carried by
  // the printed line itself rather than by an extra account the source never mentioned.
  await fx.asHuman(owner, (c) => c.query(
    "select clara.upsert_account($1,$2,$3,$4,$5,$6,$7) as r",
    [client, "900-OBE", "Opening Balance Equity", "equity", "opening_balance_equity", fx.opk("acct"), null]));

  const docSha = fx.sha(`p656-${TAG}`);
  const seeded = await fx.rootQuery(
    "select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r",
    [firm, client, docSha, "opening-tb.pdf", "application/pdf", 4096,
      `firms/${firm}/docs/${docSha}.pdf`, owner, 1, "opening_balance_doc", null, null]);
  const documentId = seeded.rows[0].r.document_id;
  log("filed opening_balance_doc", documentId);

  // ── 2. THE REAL OCR PASS, with #656's in-line producer inside it. ────────────────────────────
  const normalized = normalizeAzureLayout(azurePayload(), {
    engineId: "clara-fixture:p656-azure", versionN: 1,
  });
  const opening = normalized.regions.filter((r) => r.field_path === OPENING_TB_FIELD_PATH);
  assert.equal(opening.length, TB_ROWS.length,
    `the in-line producer must emit one ${OPENING_TB_FIELD_PATH} region per printed line — got ${opening.length}`);
  assert.ok(normalized.regions.some((r) => r.field_path.startsWith("tables.")),
    "…and the table-cell regions it read from are still emitted, unchanged");
  log(`producer emitted ${opening.length} ${OPENING_TB_FIELD_PATH} regions in line`);

  // ── 3. THE REAL WRITER. `clara.persist_document_extraction` re-derives every triple from the
  //      region TEXT and refuses any disagreement with the monetary second representation. ──────
  const task = (await fx.rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,$3,'{}'::jsonb,
       (select coalesce(max(version_n),0)+1 from clara.document_processing_tasks
          where document_id=$2 and lane='ocr'),
       'ocr','running',$4,now()) returning id`,
    [firm, documentId, "clara-fixture:p656-azure", `p656-${TAG}`])).rows[0].id;
  await fx.rootQuery(
    `insert into clara.processing_call_reservations(firm_id, task_id, state, pages_reserved)
     values ($1,$2,'reserved',1) on conflict do nothing`, [firm, task]);

  await fx.asRuntime((c) => c.query(
    "select clara.persist_document_extraction($1,'done',$2,$3::jsonb,$4::jsonb,null,$5,$6) as r",
    [task, normalized.pageCount, JSON.stringify(normalized.envelope),
      JSON.stringify(normalized.regions), normalized.vendorOpRef, fx.opk("p656-pde")]));

  // The regions landed, on the AUTHORITATIVE extraction, carrying the exact triple.
  const stored = (await fx.rootQuery(
    `select dr.id, dr.text_content, dr.opening_account_code, dr.opening_amount_cents, dr.opening_side,
            de.id as extraction_id, d.authoritative_extraction_id
       from clara.document_regions dr
       join clara.document_extractions de on de.id = dr.extraction_id
       join clara.documents d on d.id = de.document_id
      where de.document_id = $1 and dr.field_path = $2
      order by dr.opening_account_code`, [documentId, OPENING_TB_FIELD_PATH])).rows;
  assert.equal(stored.length, TB_ROWS.length, "every produced line must be stored");
  for (const row of stored) {
    assert.equal(row.extraction_id, row.authoritative_extraction_id,
      "the producer's run must be the AUTHORITATIVE extraction — a target citing any other is refused");
    assert.ok(row.opening_account_code && row.opening_amount_cents > 0 && ["debit", "credit"].includes(row.opening_side),
      `the DB re-derived the triple from the stored text: ${JSON.stringify(row)}`);
  }
  log(`persisted ${stored.length} regions on the authoritative extraction, every triple re-derived`);

  // ── 4. THE BASIS, and the REAL ROUTE CORE on a real clara_runtime connection. ────────────────
  const seedReceipt = await fx.asHuman(owner, (c) => c.query(
    "select clara.create_opening_seed($1,$2,$3::date,$4,$5,$6) as r",
    [client, plan, "2026-01-01", documentId, docSha, fx.opk("seed")]));
  const seed = seedReceipt.rows[0].r.seed_id;

  const parsed = await fx.asRuntime((c) => parseOpeningTargets(c, { seedId: seed, firmId: firm }));
  assert.equal(parsed.http, 202, `the parse must be accepted: ${JSON.stringify(parsed.body)}`);
  assert.equal(parsed.body.status, "parsed");
  assert.equal(parsed.body.lines, TB_ROWS.length);
  log(`route core recorded ${parsed.body.lines} targets`);

  const targets = (await fx.rootQuery(
    `select line_key, account_code, debit_cents, credit_cents, provenance_kind, document_id,
            source_sha256, extraction_ref, entered_by
       from clara.opening_tb_targets where seed_id = $1 order by account_code`, [seed])).rows;
  assert.equal(targets.length, TB_ROWS.length);
  for (const t of targets) {
    assert.equal(t.provenance_kind, "document", "every target is document-sourced");
    assert.equal(t.document_id, documentId);
    assert.equal(t.source_sha256, docSha, "…bound to the bytes it was read from");
    assert.ok(t.extraction_ref?.region_id, "…and citing the exact region a human can open");
    assert.equal(t.entered_by, null, "ck_opening_tb_targets_provenance: a document row carries no keyer");
  }
  // The FIGURES match the printed page, cent for cent.
  const byCode = Object.fromEntries(targets.map((t) => [t.account_code, t]));
  for (const r of TB_ROWS) {
    const cents = Math.round(Number((r.dr ?? r.cr).replace(/,/g, "")) * 100);
    const t = byCode[r.code];
    assert.ok(t, `no target for ${r.code}`);
    assert.equal(Number(r.dr ? t.debit_cents : t.credit_cents), cents,
      `${r.code}: the recorded figure must be the printed one, to the sen`);
    assert.equal(Number(r.dr ? t.credit_cents : t.debit_cents), 0, `${r.code}: one side only`);
  }
  log("every target carries the printed figure, the document, the sha and its region");

  // ── 5. THE REPLAY. The route's own stable op key must not double the basis. ──────────────────
  const replay = await fx.asRuntime((c) => parseOpeningTargets(c, { seedId: seed, firmId: firm }));
  assert.equal(replay.http, 202, `a byte-identical replay must succeed: ${JSON.stringify(replay.body)}`);
  const afterReplay = (await fx.rootQuery(
    "select count(*)::int as n from clara.opening_tb_targets where seed_id=$1", [seed])).rows[0].n;
  assert.equal(afterReplay, TB_ROWS.length, "a replay must not author a second set of targets");
  log("replay is idempotent");

  // ── 6. THE ITEMS AND THE CEREMONY. One gl_balance item per printed line, then the governed
  //      approval — SERIALIZABLE, distinct-checker, and re-asserting every target's fact. ───────
  const checker = await fx.insertUser("p656", `chk_${TAG}`);
  await fx.addMember(owner, { firm, user: checker, role: "admin", opKey: fx.opk("mem") });

  // Through the AUDITED writer, never a raw insert: `clara.record_client_resolution` stamps the
  // method from the lane, and a hand-built row would prove the drafter accepts something no caller
  // can actually produce.
  const resolution = async () => {
    const r = await fx.asHuman(owner, (c) => c.query(
      `select clara.record_client_resolution(p_client => $1, p_subject_kind => $2, p_subject => $3,
         p_confidence => $4::numeric, p_method => $5, p_evidence => $6::jsonb, p_op_key => $7) as r`,
      [client, "document", documentId, 0.98, "human", "{}", fx.opk("res")]));
    return r.rows[0].r.resolution_id;
  };

  const drafts = [];
  for (const r of TB_ROWS) {
    const cents = Math.round(Number((r.dr ?? r.cr).replace(/,/g, "")) * 100);
    const res = await resolution();
    // RETAINED EARNINGS IS NOT A GL CARRY-DOWN. `_draft_opening_item_core` refuses a `gl_balance`
    // item on a control, OBE or RE account ("GL carry-down cannot carry control, OBE, or RE
    // accounts" — measured, on this leg's second run): the accumulated result of prior years is
    // its own item kind, `equity_net`, carrying a SIGNED amount (a debit is negative). That
    // distinction is the accounting one, not a schema detail, and a leg that papered over it would
    // be proving a path no real basis can take.
    const item = r.special === "retained_earnings"
      ? { item_kind: "equity_net", item_key: "eq:net", amount_cents: r.dr ? -cents : cents }
      : { item_kind: "gl_balance", item_key: `gl:${r.code}` };
    const lines = r.special === "retained_earnings"
      ? null
      : [{ account_code: r.code, debit_cents: r.dr ? cents : 0, credit_cents: r.cr ? cents : 0 }];
    const receipt = await fx.asHuman(owner, (c) => c.query(
      `select clara.draft_opening_item($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8) as r`,
      [client, seed, JSON.stringify(item), lines === null ? null : JSON.stringify(lines),
        res, documentId, docSha, fx.opk("obi")]));
    drafts.push(receipt.rows[0].r);
  }
  const revisions = Object.fromEntries(drafts.map((d) => [d.entry_id, d.revision_token]));
  log(`drafted ${drafts.length} opening items`);

  const planRevision = (await fx.rootQuery(
    "select revision_token from clara.onboarding_plans where id=$1", [plan])).rows[0].revision_token;

  const approved = await (async () => {
    const c = await fx.getPool().connect();
    try {
      await c.query("set role clara_authenticated");
      await c.query("begin isolation level serializable");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: checker, role: "authenticated" })]);
      const r = await c.query(
        `select clara.approve_opening_seed($1,$2,$3,$4::jsonb,$5,$6) as r`,
        [seed, planRevision, docSha, JSON.stringify(revisions), null, fx.opk("apr")]);
      await c.query("commit");
      return r.rows[0].r;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  })();
  log("approved", JSON.stringify(approved));

  // ── 7. THE STATE THE CEREMONY LEAVES. ────────────────────────────────────────────────────────
  const post = (await fx.rootQuery(
    `select
       (select state from clara.opening_seed_registry where id=$1) as state,
       (select tie_asserted_at is not null from clara.opening_seed_registry where id=$1) as tie_asserted,
       (select count(*)::int from clara.journal_entries
         where client_id=$2 and status='approved' and is_opening_balance) as approved_entries,
       (select count(*)::int from clara.opening_seed_approvals where seed_id=$1) as approvals,
       (select count(*)::int from clara.opening_items where seed_id=$1 and state='active') as items`,
    [seed, client])).rows[0];
  assert.equal(post.state, "finalized", "the basis must finalize");
  assert.equal(post.tie_asserted, true, "…with its tie asserted");
  assert.equal(post.approved_entries, TB_ROWS.length, "one approved opening entry per printed line");
  assert.equal(post.approvals, TB_ROWS.length, "…each with its own append-only approval row");
  assert.equal(post.items, TB_ROWS.length);

  // The C3 claim: those entries carry `is_opening_balance`, which is the column #656 added to
  // apps/web's `ENTRY_SELECT` so the books can tell an opening balance from a hand-keyed journal.
  const origins = (await fx.rootQuery(
    `select distinct origin from clara.journal_entries
      where client_id=$1 and is_opening_balance and status='approved'`, [client])).rows.map((r) => r.origin);
  assert.deepEqual(origins, ["manual"],
    "an opening entry posts with origin='manual' exactly like a hand-keyed one — which is WHY the badge reads the boolean");

  // And the trial balance the rest of the product reads now answers with the opening position.
  const tb = (await fx.humanQuery(owner,
    `select account_code, debit_cents::bigint as debit_cents, credit_cents::bigint as credit_cents
       from clara.trial_balance_as_of($1,$2::date) order by account_code`,
    [client, "2026-01-01"])).rows;
  const tbByCode = Object.fromEntries(tb.map((r) => [r.account_code, r]));
  for (const r of TB_ROWS) {
    const cents = Math.round(Number((r.dr ?? r.cr).replace(/,/g, "")) * 100);
    const row = tbByCode[r.code];
    assert.ok(row, `clara.trial_balance_as_of must answer for ${r.code}`);
    assert.equal(Number(r.dr ? row.debit_cents : row.credit_cents), cents,
      `${r.code}: the client's books now start from the printed figure`);
  }
  log("trial_balance_as_of answers with the opening position, cent for cent");

  log("PASS — producer -> persist -> cite -> approve, end to end, on real Postgres under real roles");
  return 0;
}

let code = 0;
try {
  code = await main();
} catch (err) {
  console.error("\nOPENING LEDGER SOURCE E2E FAILED:", err?.stack ?? err);
  code = 1;
} finally {
  clearTimeout(watchdog);
  await fx.endPool().catch(() => {});
}
process.exit(code);
