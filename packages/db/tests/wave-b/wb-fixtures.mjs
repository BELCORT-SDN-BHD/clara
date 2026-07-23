// Wave-B rig — prestate world + opening-set stage + concurrency drivers (NOT a
// test file). Cut from the part-3 "Prestate fixtures" pin: Firm A carries TWO
// bookkeepers + an admin (distinct-checker paths); the solo-attestation firm is
// the base world's firm S (erin, sole owner) and the cross-firm DEFINER probe
// actor is firm B's dave — same coverage as the pin's two-firm phrasing, split
// across the existing world shape. Every object is built THROUGH audited
// writers except where the rig idiom is root (archived flip, raw FK targets).

import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, humanQuery, opk, getPool, jtxt,
  buildWorld, insertUser, addMember, createClient, upsertAccountClassed,
  filedDocument, freshResolution,
  beginOnboarding, draftOpeningItem, createOpeningSeed, planRow,
} from "./wb-calls.mjs";
import { withTxn } from "../rig-txn.mjs";

export * from "./wb-calls.mjs";

// ---------------------------------------------------------------------------
// Account codes (grammar '^[0-9]{4,8}$|^[0-9]{3}-[0-9A-Z]{2,4}$' — O9).
// ---------------------------------------------------------------------------

export const WB_COA = {
  cash: "1000", sales: "4000", expense: "5000", // base buildCoa codes
  arCtl: "300-A00", apCtl: "400-A00", // control accounts, account_class-marked
  shareCap: "910-000", obe: "900-OBE", re: "900-RE", // K7 markers (post-0017)
  faAsset: "110-FA", faAccum: "111-FA", faExp: "610-000",
};

/** The pinned BEE equity fixture (K3/part 3): prior TB 105,000.00; closing net
 *  equity Dr 65,747.97 (accumulated losses); share capital balances the set. */
export const BEE = { cashDr: 10_500_000, reDr: 6_574_797, shareCr: 17_074_797 };

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

/** buildWorld() + the Wave-B extensions: grace (bookkeeper #2) and hana (admin)
 *  on firm A; an ARCHIVED firm-A client (A3, root-flipped — no archive verb is
 *  in scope here); control/share-cap/FA accounts on A1. OBE/RE markers are NOT
 *  seeded here (the K7 CHECK lands only at 0017) — call seedMarkers() in-test. */
export async function buildWaveBWorld() {
  const w = await buildWorld();
  w.users.grace = await insertUser(w.prefix, "grace");
  w.users.hana = await insertUser(w.prefix, "hana");
  await addMember(w.users.alice, { firm: w.firms.A, user: w.users.grace, role: "bookkeeper", opKey: opk("mem") });
  await addMember(w.users.alice, { firm: w.firms.A, user: w.users.hana, role: "admin", opKey: opk("mem") });
  const a3 = await createClient(w.users.alice, { name: `${w.prefix}_A3_archived`, opKey: opk("cli") });
  await rootQuery("update clara.clients set status='archived' where id=$1", [a3]);
  w.clients.A3 = a3;
  for (const [code, name, type, accountClass] of [
    [WB_COA.arCtl, "Trade Debtors", "asset", "receivable"],
    [WB_COA.apCtl, "Trade Creditors", "liability", "payable"],
    [WB_COA.shareCap, "Share Capital", "equity", null],
    [WB_COA.faAsset, "Plant & Machinery", "asset", null],
    [WB_COA.faAccum, "Accum Depreciation P&M", "asset", null],
    [WB_COA.faExp, "Depreciation Expense", "expense", null],
  ]) {
    await upsertAccountClassed(w.users.alice, { client: w.clients.A1, code, name, type, accountClass });
  }
  return w;
}

/** K7/O9 — the OBE + RE marker accounts, seeded THROUGH upsert_account (the
 *  salvage law: markers, never literal codes). Post-0017 only. */
export async function seedMarkers(sub, client) {
  await upsertAccountClassed(sub, {
    client, code: WB_COA.obe, name: "Opening Balance Equity", type: "equity", special: "opening_balance_equity",
  });
  await upsertAccountClassed(sub, {
    client, code: WB_COA.re, name: "Retained Earnings", type: "equity", special: "retained_earnings",
  });
}

/** Seed a client's minimal opening-capable CoA (cash + share cap + controls +
 *  markers) — for clients minted in-test (e.g. onboarding births). */
export async function seedOpeningCoa(sub, client) {
  for (const [code, name, type, accountClass] of [
    [WB_COA.cash, "Cash", "asset", null],
    [WB_COA.sales, "Sales", "income", null],
    [WB_COA.expense, "Expense", "expense", null],
    [WB_COA.shareCap, "Share Capital", "equity", null],
    [WB_COA.arCtl, "Trade Debtors", "asset", "receivable"],
    [WB_COA.apCtl, "Trade Creditors", "liability", "payable"],
  ]) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass });
  }
  await seedMarkers(sub, client);
}

/** Birth an onboarding client (O3) and return {client, plan, revision}. */
export async function onboardingClient(sub, name = null) {
  const r = await beginOnboarding(sub, { name: name ?? `wbonb_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}` });
  const plan = r.plan_id;
  const rev = (await planRow(plan))?.revision_token ?? null;
  return { client: r.client_id, plan, revision: rev, receipt: r };
}

export async function planRevision(plan) {
  return (await planRow(plan))?.revision_token ?? null;
}

/** A verified+filed opening_balance_doc for the client (the K1 tie target). */
export async function openingDoc(sub, { firm, client, kind = "opening_balance_doc" }) {
  return filedDocument(sub, { firm, client, kind });
}

// ---------------------------------------------------------------------------
// Opening-set stage — the BEE set (3 items, document lane, tie targets).
// ---------------------------------------------------------------------------

// [R1-F2]/[R2-F1] The DOCUMENT-PRIMARY target lane is the PARSED runtime
// writer bound to REAL extraction evidence. R2 memo finding 1 called out the
// old fixture's single text-only region blessing many values — RESTAGED
// honest: every target line seeds ITS OWN region whose text carries the
// ACTUAL account/label/amount/side, so the extraction-fact comparison has
// genuine facts to bind against. One extraction per tie document (cached).
const _tieExtractions = new Map();
export async function ensureTieExtraction(firm, doc) {
  if (_tieExtractions.has(doc.documentId)) return _tieExtractions.get(doc.documentId);
  const { seedExtraction } = await import("../rig-docs-fixtures.mjs");
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  _tieExtractions.set(doc.documentId, extractionId);
  return extractionId;
}

/** The canonical TB-line region text the parsed lane exposes (house RM idiom). */
export function tbRegionText({ account_code, source_label, debit_cents = 0, credit_cents = 0 }) {
  const side = Number(debit_cents) > 0 ? "DR" : "CR";
  const cents = Number(debit_cents) > 0 ? Number(debit_cents) : Number(credit_cents);
  return `${account_code} ${source_label} RM ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} ${side}`;
}

/** Seed one REAL TB-line region for `line` on the doc's extraction. */
export async function seedTbLineRegion(firm, doc, line, { text = null } = {}) {
  const { seedRegion } = await import("../rig-docs-fixtures.mjs");
  const extractionId = await ensureTieExtraction(firm, doc);
  const regionId = await seedRegion({
    firm, extraction: extractionId, fieldPath: "opening_tb.line",
    textContent: text ?? tbRegionText(line), locator: { page: 1, polygon: [0, 0, 1, 1] },
  });
  return { extraction_id: extractionId, region_id: regionId };
}

/** Record document-primary targets via the parsed lane. `lines` carry
 *  {line_key, account_code, source_label, debit_cents, credit_cents}; each
 *  line binds its OWN matching region. */
export async function recordParsedTargets({ firm, seed, doc, lines }) {
  const { recordOpeningTargetsParsed } = await import("./wb-calls.mjs");
  const withRefs = [];
  for (const l of lines) {
    withRefs.push({ ...l, extraction_ref: await seedTbLineRegion(firm, doc, l) });
  }
  return recordOpeningTargetsParsed({ seed, document: doc.documentId, lines: withRefs });
}

/** Record the three BEE tie targets against `seed` (document-primary lane). */
export async function recordBeeTargets({ firm, seed, doc }) {
  const mk = (lineKey, code, label, debit, credit) => ({
    line_key: lineKey, account_code: code, source_label: label,
    debit_cents: debit, credit_cents: credit,
  });
  await recordParsedTargets({ firm, seed, doc, lines: [
    mk("cash", WB_COA.cash, "Cash and bank", BEE.cashDr, 0),
    mk("re", WB_COA.re, "Retained earnings", BEE.reDr, 0),
    mk("sharecap", WB_COA.shareCap, "Share capital", 0, BEE.shareCr),
  ] });
}

/** Draft the three BEE opening items (K3): gl cash, equity_net (RE Dr via the
 *  [AMB-5] signed amount), gl share capital. Returns the draft receipts. */
export async function stageBeeItems(sub, { client, seed, doc }) {
  const res = () => freshResolution(sub, client, { subjectKind: "document", subjectId: doc.documentId });
  const cash = await draftOpeningItem(sub, {
    client, seed, resolution: res(), document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }],
  });
  const re = await draftOpeningItem(sub, {
    client, seed, resolution: res(), document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "equity_net", item_key: "eq:net", amount_cents: -BEE.reDr },
  });
  const cap = await draftOpeningItem(sub, {
    client, seed, resolution: res(), document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:sharecap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: BEE.shareCr }],
  });
  return { cash, re, cap, all: [cash, re, cap] };
}

/** Full stage: markers+CoA assumed present. create seed → targets → items.
 *  Returns { seed, doc, drafts, revMap }. */
export async function stageBeeSet(sub, { firm, client, plan, asOf = "2026-01-01" }) {
  const doc = await openingDoc(sub, { firm, client });
  const seedReceipt = await createOpeningSeed(sub, {
    client, plan, asOf, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  const seed = seedReceipt.seed_id ?? seedReceipt.id;
  await recordBeeTargets({ firm, seed, doc });
  const drafts = await stageBeeItems(sub, { client, seed, doc });
  return { seed, doc, drafts, revMap: revMapOf(drafts.all) };
}

/** [AMB-3] — the encoded p_entry_revisions OBJECT MAP from draft receipts. */
export function revMapOf(receipts) {
  const m = {};
  for (const r of receipts) m[r.entry_id] = r.revision_token;
  return m;
}

export const RESERVES = "920-000";

/** BEE + a counterparty-stamped AR item + a balancing Reserves item (5 entries,
 *  OBE nets zero, every target document-primary). `owner` upserts the Reserves
 *  account; `sub` (bookkeeper) stages. Returns { seed, doc, cpId, all, revMap }. */
export async function stageFullSet(sub, { owner, client, plan, firm }) {
  await upsertAccountClassed(owner, { client, code: RESERVES, name: "Reserves", type: "equity" });
  const cpId = (await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values ($1,$2,'customer','WB Carry Customer','wbcarrycustomer',$3) returning id`,
    [firm, client, owner])).rows[0].id;
  const st = await stageBeeSet(sub, { firm, client, plan });
  await recordParsedTargets({ firm, seed: st.seed, doc: st.doc, lines: [
    { line_key: "ar", account_code: WB_COA.arCtl, source_label: "Trade debtors", debit_cents: 3_000_000, credit_cents: 0 },
    { line_key: "reserves", account_code: RESERVES, source_label: "Reserves", debit_cents: 0, credit_cents: 3_000_000 },
  ] });
  const res = () => freshResolution(sub, client, { subjectKind: "document", subjectId: st.doc.documentId });
  const ar = await draftOpeningItem(sub, {
    client, seed: st.seed, resolution: res(),
    document: st.doc.documentId, sha256: st.doc.sha256,
    item: { item_kind: "ar_open_item", item_key: "ar:cust1", amount_cents: 3_000_000,
      counterparty_id: cpId, item_ref: "SI-100", item_date: "2025-12-15" },
  });
  const rv = await draftOpeningItem(sub, {
    client, seed: st.seed, resolution: res(),
    document: st.doc.documentId, sha256: st.doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:reserves" },
    lines: [{ account_code: RESERVES, debit_cents: 0, credit_cents: 3_000_000 }],
  });
  const all = [...st.drafts.all, ar, rv];
  return { ...st, cpId, ar, all, revMap: revMapOf(all) };
}

// ---------------------------------------------------------------------------
// The K5 serializable approval driver (the dashboard rpc lane is PINNED
// serializable; the fn refuses otherwise — the non-serial refusal cell calls
// with serializable:false).
// ---------------------------------------------------------------------------

/** Run fn(client) as `sub` inside ONE explicit human transaction. */
export async function asHumanTxn(sub, fn, { serializable = true } = {}) {
  const c = await getPool().connect();
  try {
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query(serializable ? "begin isolation level serializable" : "begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

const APPROVE_SQL =
  `select clara.approve_opening_seed(p_seed => $1, p_expected_plan_revision => $2,
     p_tie_document_sha256 => $3, p_entry_revisions => $4::jsonb, p_attestation => $5,
     p_op_key => $6) as r`;

export async function approveOpeningSeed(sub, {
  seed, planRevision: rev, tieSha256 = null, entryRevisions, attestation = null,
  opKey = null, serializable = true,
}) {
  const params = [seed, rev, tieSha256, jtxt(entryRevisions), attestation, opKey ?? opk("apr")];
  if (!serializable) {
    const r = await humanQuery(sub, APPROVE_SQL, params);
    return r.rows[0].r;
  }
  try {
    return await asHumanTxn(sub, async (c) => (await c.query(APPROVE_SQL, params)).rows[0].r);
  } catch (e) {
    // K5 pin: a 40001 serialization failure surfaces for retry with the SAME
    // op_key (the receipt rolled back with the txn). One pin-faithful retry —
    // kills the transient class a NONSERIAL runner can provoke; serial stays
    // the discipline.
    if (e.code !== "40001") throw e;
    return asHumanTxn(sub, async (c) => (await c.query(APPROVE_SQL, params)).rows[0].r);
  }
}

const CORRECTION_SQL =
  `select clara.approve_opening_correction(p_seed => $1, p_entry_revisions => $2::jsonb,
     p_attestation => $3, p_op_key => $4) as r`;

export async function approveOpeningCorrection(sub, {
  seed, entryRevisions, attestation = null, opKey = null,
}) {
  const params = [seed, jtxt(entryRevisions), attestation, opKey ?? opk("cor")];
  try {
    return await asHumanTxn(sub, async (c) => (await c.query(CORRECTION_SQL, params)).rows[0].r);
  } catch (e) {
    if (e.code !== "40001") throw e; // the K5 same-op retry pin, applied to K6
    return asHumanTxn(sub, async (c) => (await c.query(CORRECTION_SQL, params)).rows[0].r);
  }
}

// ---------------------------------------------------------------------------
// Two-session WB-R4 race driver: both sessions SERIALIZABLE; A calls first and
// holds the registry FOR UPDATE + client advisory lock; B calls concurrently
// with a DIFFERENT op_key; A commits; B settles. Exactly one approval must win.
// ---------------------------------------------------------------------------

export async function raceOpeningApproval({ seed, planRevision: rev, tieSha256, revsA, revsB, subA, subB, attestation = null }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null };
  const start = async (c, sub) => {
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("begin isolation level serializable");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
  };
  try {
    await start(c1, subA);
    await c1.query(APPROVE_SQL, [seed, rev, tieSha256, jtxt(revsA), attestation, opk("racea")]);

    await start(c2, subB);
    const p2 = c2
      .query(APPROVE_SQL, [seed, rev, tieSha256, jtxt(revsB), attestation, opk("raceb")])
      .then(() => { out.b = { ok: true }; })
      .catch((e) => { out.b = { ok: false, code: e.code, reason: e.detail ?? e.message }; });

    await c1.query("commit");
    out.a = { ok: true };
    await p2;
    if (out.b?.ok) await c2.query("commit").catch((e) => { out.b = { ok: false, code: e.code }; });
    else await c2.query("rollback").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// [R1-F7] Two-session page-cap race driver: both RUNTIME sessions publish a
// NEW slug concurrently at cap−1; A holds its open txn while B runs; A commits
// first. Under the fixed cap exactly ONE may succeed.
// ---------------------------------------------------------------------------

const PUBLISH_SQL =
  `select clara.publish_wiki_page_version(p_client => $1, p_slug => $2,
     p_page_kind => 'profile', p_title => $3, p_counterparty => null,
     p_content => $4, p_content_sha256 => $5, p_storage_key => $6,
     p_citations => $7::jsonb, p_refs => '[]'::jsonb,
     p_synthesis => 'deterministic', p_engine_id => null,
     p_projected_from_seq => null, p_op_key => $8) as r`;

export async function racePublishPages({ firm, client, slugA, slugB }) {
  const { shaHex, wikiKey } = await import("./wb-helpers.mjs");
  const cites = JSON.stringify([{ source_kind: "human_note", detail: { note: "race" } }]);
  const params = (slug, tag) => {
    const content = `# race ${slug}`;
    const digest = shaHex(content);
    return [client, slug, `Race ${slug}`, content, digest, wikiKey(firm, client, digest), cites, opk(tag)];
  };
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null };
  try {
    await c1.query(`set role ${ROLES.runtime}`);
    await c1.query("begin");
    await c1.query(PUBLISH_SQL, params(slugA, "rca"));

    await c2.query(`set role ${ROLES.runtime}`);
    await c2.query("begin");
    const p2 = c2.query(PUBLISH_SQL, params(slugB, "rcb"))
      .then(() => { out.b = { ok: true }; })
      .catch((e) => { out.b = { ok: false, code: e.code }; });

    await c1.query("commit");
    out.a = { ok: true };
    await p2;
    if (out.b?.ok) await c2.query("commit").catch((e) => { out.b = { ok: false, code: e.code }; });
    else await c2.query("rollback").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// [GATE 1] Two-session race against update_onboarding_plan (the ANSWER half of
// the O5 concurrency story). Mirrors racePublishPages, NOT raceOpeningApproval:
// update_onboarding_plan is granted clara_runtime ONLY (WB_ACL) and has NO
// transaction_isolation assertion — it serializes on a FOR UPDATE row-lock +
// revision_token CAS (0017:2643 FOR UPDATE -> 2655-2660 CLR06 stale_plan), not
// SSI. PLAIN `begin` (READ COMMITTED) on both sessions; c1 takes the lock and
// rotates the token uncommitted, c2 fires with the SAME expected_revision but a
// DIFFERENT op_key (fired WITHOUT awaiting — it blocks on c1's row lock), c1
// commits, then c2 is awaited and re-reads the rotated token -> CAS-fails.
// ---------------------------------------------------------------------------

const UPDATE_PLAN_SQL =
  `select clara.update_onboarding_plan(p_plan => $1, p_expected_revision => $2,
     p_items => $3::jsonb, p_answered_by => $4, p_op_key => $5) as r`;

export async function raceAnswerPlan({ plan, expectedRevision, itemsA, itemsB, answeredByA, answeredByB }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const keyA = opk("raceanA");
  const keyB = opk("raceanB");
  const out = { a: null, b: null };
  try {
    await c1.query(`set role ${ROLES.runtime}`);
    await c1.query("begin");
    const r1 = await c1.query(UPDATE_PLAN_SQL,
      [plan, expectedRevision, jtxt(itemsA), answeredByA, keyA]);

    await c2.query(`set role ${ROLES.runtime}`);
    await c2.query("begin");
    const p2 = c2.query(UPDATE_PLAN_SQL,
      [plan, expectedRevision, jtxt(itemsB), answeredByB, keyB])
      .then((r) => { out.b = { ok: true, opKey: keyB, result: r.rows[0].r }; })
      .catch((e) => { out.b = { ok: false, opKey: keyB, code: e.code, reason: e.detail ?? e.message }; });

    await c1.query("commit");
    out.a = { ok: true, opKey: keyA, result: r1.rows[0].r };
    await p2;
    if (out.b?.ok) await c2.query("commit").catch((e) => { out.b = { ok: false, opKey: keyB, code: e.code }; });
    else await c2.query("rollback").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Raw FK targets for the K2 CHECK matrix (rig-txn idiom: entries built raw as
// superuser with balanced lines so ONLY the constraint under test can fail).
// ---------------------------------------------------------------------------

/** A raw balanced draft entry (root) for `client`; returns its id. */
export async function rawBalancedEntry({ client, maker, coa = WB_COA, amount = 1000, date = "2026-01-01" }) {
  return withTxn(async (c) => {
    const e = (await c.query(
      `insert into clara.journal_entries (client_id, posting_date, memo, origin, status, maker_actor)
       values ($1, $2, 'wb raw fk target', 'manual', 'draft', $3) returning id`,
      [client, date, maker],
    )).rows[0].id;
    await c.query(
      "insert into clara.journal_lines (entry_id, line_no, account_code, debit_cents, credit_cents) values ($1,1,$2,$3,0),($1,2,$4,0,$3)",
      [e, coa.cash, amount, coa.sales],
    );
    return e;
  });
}

/** Root-insert an opening_items row (CHECK-matrix probe surface). Returns the
 *  insert promise so callers can assertRaises on 23514/23505. */
export function rawOpeningItem({ firm, client, seed, entry, kind, itemKey, maker, extra = {} }) {
  const cols = {
    firm_id: firm, client_id: client, seed_id: seed, entry_id: entry,
    item_kind: kind, item_key: itemKey, amount_cents: 1000, created_by: maker,
    ...extra,
  };
  const names = Object.keys(cols).filter((k) => cols[k] !== undefined);
  const ph = names.map((_, i) => `$${i + 1}`).join(",");
  return rootQuery(
    `insert into clara.opening_items(${names.join(",")}) values (${ph}) returning id`,
    names.map((k) => cols[k]),
  );
}
