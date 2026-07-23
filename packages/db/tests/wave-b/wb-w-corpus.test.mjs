// Wave-B battery — GATE 6: a large-corpus token-ceiling proof for the get_context_pack
// v4 wiki-block selection, run at TRUE PRODUCTION-DEFAULT budgets (this file NEVER
// calls setBudget — that is the whole point: max_pages_per_client=40,
// max_page_bytes=8192, pack_max_pages=6, pack_max_bytes=12288, WB_BUDGET_SEEDS /
// 0017:816-819). Reads via packHuman (the human lane renders the wiki block without
// a GUC — proven by wb-w-pack FORK-6). CONTRACT-BLIND; FAILS below 0017.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR31, rootQuery, opk,
  assertRaises, endPool, printLaneNotes, detailReason,
  fail0017, wbEnsureReady,
  buildWaveBWorld, createClient,
  packHuman, publishWikiPage,
  WB_V7_PURPOSE, WB_BUDGET_SEEDS,
  seedWikiCorpus, expectedPackWindow,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;

before(async () => {
  live = await wbEnsureReady();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-w-corpus"); await endPool(); });

/** A firm-A counterparty birthed the same rootQuery idiom stageFullSet uses
 *  (page_kind='counterparty' REQUIRES counterparty_id per the W1 CHECK). */
async function birthCounterparty(client, name) {
  const r = await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values ($1,$2,'customer',$3,$4,$5) returning id`,
    [w.firms.A, client, name, name.toLowerCase().replace(/[^a-z0-9]/g, ""), w.users.alice]);
  return r.rows[0].id;
}

/** 40-page shape: 1 each of the five ranked kinds + 35 open_question, EACH
 *  `bytes` long (byte-exact ASCII). */
function corpusShape(bytes) {
  const kinds = ["profile", "period_context", "treatment", "recurring_pattern", "counterparty"];
  const pages = kinds.map((k) => ({ slug: `${k}-page`, page_kind: k, bytes }));
  for (let i = 0; i < 35; i++) pages.push({ slug: `oq-${String(i).padStart(2, "0")}`, page_kind: "open_question", bytes });
  return pages;
}

test("META: 0017 applied — the world stages for the large-corpus proof", async () => {
  fail0017(live);
  assert.ok(w, "world staged");
});

test("6A: page-cap-bound at the TRUE default budget — a 40-page corpus selects EXACTLY pack_max_pages=6 in deterministic rank order, whole pages only", async () => {
  fail0017(live);
  const c6a = await createClient(w.users.alice, { name: `wbcorpus6a_${opk("x")}`, opKey: opk("cli") });
  const cp6a = await birthCounterparty(c6a, "WB Corpus Counterparty 6A SDN BHD");
  const model = await seedWikiCorpus(c6a, w.firms.A, { counterparty: cp6a, pages: corpusShape(2000) });
  const exp = expectedPackWindow(model, { pageCap: WB_BUDGET_SEEDS.pack_max_pages, byteCap: WB_BUDGET_SEEDS.pack_max_bytes });
  const pack = await packHuman(w.users.alice, { client: c6a, purpose: WB_V7_PURPOSE });

  assert.equal(pack.wiki.pages.length, 6, "pack.wiki.pages.length === pack_max_pages");
  assert.equal(exp.length, 6, "the JS replication agrees");
  assert.deepEqual(pack.wiki.pages.slice(0, 5).map((p) => p.page_kind),
    ["profile", "period_context", "treatment", "recurring_pattern", "counterparty"],
    "the pinned priority order 1..5, each a unique priority so no tie ambiguity");
  assert.equal(pack.wiki.pages[5].page_kind, "open_question", "the 6th slot is an open_question");
  assert.equal(pack.wiki.pages[5].slug, exp[5].slug,
    "the top-ranked open_question by (updated_at DESC, slug), computed from the DB-assigned updated_at read back");
  assert.deepEqual(pack.wiki.pages.map((p) => p.slug), exp.map((e) => e.slug),
    "the full ordered window matches the JS replication of the DB rule EXACTLY");

  let total = 0;
  for (const p of pack.wiki.pages) {
    const expected = model.find((m) => m.slug === p.slug).content;
    assert.equal(p.content, expected, `page '${p.slug}' content is byte-identical — NEVER a partial/truncated page`);
    assert.equal(Buffer.byteLength(p.content, "utf8"), 2000, `page '${p.slug}' is exactly 2000 bytes`);
    total += Buffer.byteLength(p.content, "utf8");
  }
  assert.equal(total, 12_000, "sum(bytes) === 12000");
  assert.ok(total <= WB_BUDGET_SEEDS.pack_max_bytes, "byte budget honored exactly");

  const selected = new Set(pack.wiki.pages.map((p) => p.slug));
  const droppedOq = model.filter((m) => m.page_kind === "open_question" && !selected.has(m.slug));
  assert.equal(droppedOq.length, 34, "none of the 34 non-selected open_question slugs appear in the pack");

  assert.equal(Number(pack.wiki.budget.pages), WB_BUDGET_SEEDS.pack_max_pages, "budget.pages surfaced from wiki_budgets");
  assert.equal(Number(pack.wiki.budget.bytes), WB_BUDGET_SEEDS.pack_max_bytes, "budget.bytes surfaced from wiki_budgets");

  w._c6a = c6a; // carried into the 6A-caps and 6C scenarios
});

test("6A caps: the writer enforces max_pages_per_client=40 at TRUE default; a 41st NEW slug refuses CLR31, a new VERSION does not", async () => {
  fail0017(live);
  const c6a = w._c6a;
  const active = await rootQuery(
    "select count(*)::int as n from clara.wiki_pages where client_id=$1 and state='active'", [c6a]);
  assert.equal(active.rows[0].n, 40, "rootQuery count of active wiki_pages for c6a === 40");

  const err = await assertRaises(CLR31, () => publishWikiPage({
    client: c6a, firm: w.firms.A, slug: "page-41", title: "41", content: "# 41st page",
  }), "a 41st NEW slug over max_pages_per_client");
  if (detailReason(err)) assert.equal(detailReason(err), "cap_exceeded");

  await publishWikiPage({ client: c6a, firm: w.firms.A, slug: "profile-page", title: "profile v2", content: "# profile v2" });
  const active2 = await rootQuery(
    "select count(*)::int as n from clara.wiki_pages where client_id=$1 and state='active'", [c6a]);
  assert.equal(active2.rows[0].n, 40, "a re-publish (new VERSION) of an existing slug does not count against the page cap");
});

test("6B: byte-cap-bound at the TRUE default budget — cumulative bytes cut the window mid-rank; the first over-budget page and all after drop WHOLE (never partial)", async () => {
  fail0017(live);
  const c6b = await createClient(w.users.alice, { name: `wbcorpus6b_${opk("x")}`, opKey: opk("cli") });
  const cp6b = await birthCounterparty(c6b, "WB Corpus Counterparty 6B SDN BHD");
  const model = await seedWikiCorpus(c6b, w.firms.A, { counterparty: cp6b, pages: corpusShape(3000) });
  const exp = expectedPackWindow(model, { pageCap: WB_BUDGET_SEEDS.pack_max_pages, byteCap: WB_BUDGET_SEEDS.pack_max_bytes });
  const pack = await packHuman(w.users.alice, { client: c6b, purpose: WB_V7_PURPOSE });

  assert.equal(pack.wiki.pages.length, 4, "the byte budget, not the page cap, is binding");
  assert.equal(exp.length, 4, "the JS replication agrees");
  assert.deepEqual(pack.wiki.pages.map((p) => p.page_kind),
    ["profile", "period_context", "treatment", "recurring_pattern"], "priorities 1..4, each unique");
  assert.ok(!pack.wiki.pages.some((p) => p.page_kind === "counterparty"),
    "the counterparty page (priority 5, ord 5, cumulative 15000) is ABSENT even though its OWN size is only 3000 bytes — proves the whole-page prefix drop, never truncation");

  let total = 0;
  for (const p of pack.wiki.pages) {
    const expected = model.find((m) => m.slug === p.slug).content;
    assert.equal(p.content, expected, "byte-identical");
    assert.equal(Buffer.byteLength(p.content, "utf8"), 3000);
    total += Buffer.byteLength(p.content, "utf8");
  }
  assert.equal(total, 12_000, "sum(bytes) === 12000 <= 12288");
  assert.ok(total <= WB_BUDGET_SEEDS.pack_max_bytes);
  assert.deepEqual(pack.wiki.pages.map((p) => p.slug), exp.map((e) => e.slug), "exact prefix match to the JS replication");
});

test("6C: wall-clock sanity bound over the large corpus", async () => {
  fail0017(live);
  const t0 = Date.now();
  await packHuman(w.users.alice, { client: w._c6a, purpose: WB_V7_PURPOSE });
  assert.ok(Date.now() - t0 < 2_000, "the v4 wiki-block selection over a 40-page corpus completes well under 2s");
});
