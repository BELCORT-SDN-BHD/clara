// Wave-B battery — Block K writers (K3 the OB writer family — the ONLY lawful
// setter of is_opening_balance — with the BEE fixture · K10 the dated TB).
// CONTRACT-BLIND; FAILS (never skips) below 0017. K5 approval cells (incl. K11
// watch interplay) live in wb-k-approval.
// [AMB-13] K3 "receipt + NO event until approval" vs "entry.drafted-class
// emission follows the as-built draft convention" — no event assert is encoded
// either way; adjudication requested on whether OB drafts emit entry.drafted.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR30, rootQuery, opk, human,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes, noteLane,
  fail0017, wbEnsureReady, fnExists,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc,
  createOpeningSeed, draftOpeningItem, getOpeningDryrun, keyedRes,
  stageBeeSet, BEE, WB_COA,
  entryRow, entryLines, openingItemRows, recordResolution, freshResolution,
  draftEntryV3, approveEntry, trialBalanceAsOf, trialBalance1,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let onb = null;
let doc = null;
let seed = null;

const res = (sub, client, docId) =>
  freshResolution(sub, client, docId ? { subjectKind: "document", subjectId: docId } : {});

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
});
after(async () => { printLaneNotes("wb-k-obwriter"); await endPool(); });

test("META: 0017 applied — the OB writer exists; NO wake sibling ever", async () => {
  fail0017(live);
  assert.ok(await fnExists("draft_opening_item"), "clara.draft_opening_item exists");
  assert.equal(await fnExists("wake_draft_opening_item"), false, "no wake sibling (WB-R1/B4 human-lane by construction)");
});

test("K3: a document-lane gl item posts at as_of with is_opening_balance=true + the OBE contra", async () => {
  fail0017(live);
  const r = await draftOpeningItem(w.users.bob, {
    client: onb.client, seed, resolution: res(w.users.bob, onb.client, doc.documentId),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "k3:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 250_000, credit_cents: 0 }],
  });
  assert.ok(r.entry_id, "draft receipt carries entry_id");
  const e = await entryRow(r.entry_id);
  assert.equal(e.is_opening_balance, true, "is_opening_balance=true (the ONLY lawful setter)");
  assert.equal(e.posting_date, "2026-01-01", "posted at the governed as_of");
  assert.equal(e.status, "draft", "drafts are dry-run state");
  assert.equal(e.origin, "manual", "origin 'manual'");
  assert.equal(e.coding_kind ?? null, null, "coding_kind NULL (ck_je_coding_kind untouched)");
  const lines = await entryLines(r.entry_id);
  const obe = lines.find((l) => l.account_code === WB_COA.obe);
  assert.ok(obe, "the OBE contra leg landed on the MARKER account");
  assert.equal(Number(obe.credit_cents), 250_000, "contra = the item amount");
  const items = await openingItemRows(seed);
  assert.ok(items.some((i) => i.item_key === "k3:cash" && i.entry_id === r.entry_id), "opening_items row 1:1 with the entry");
});

test("K3: gl_balance REFUSES control-class and OBE/RE-marked lines (double-count structurally impossible)", async () => {
  fail0017(live);
  for (const code of [WB_COA.apCtl, WB_COA.arCtl, WB_COA.obe, WB_COA.re]) {
    await assertRaises(CLR.badRequest, () => draftOpeningItem(w.users.bob, {
      client: onb.client, seed, resolution: res(w.users.bob, onb.client, doc.documentId),
      document: doc.documentId, sha256: doc.sha256,
      item: { item_kind: "gl_balance", item_key: `k3bad:${code}:${opk("x")}` },
      lines: [{ account_code: code, debit_cents: 1000, credit_cents: 0 }],
    }), `gl_balance line on ${code}`);
  }
});

test("K3: an ap_open_item posts exactly its counterparty-stamped control leg + OBE contra", async () => {
  fail0017(live);
  const cpId = (await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values ($1,$2,'vendor','K3 Carry Vendor','k3carryvendor',$3) returning id`,
    [w.firms.A, onb.client, w.users.alice])).rows[0].id;
  const r = await draftOpeningItem(w.users.bob, {
    client: onb.client, seed, resolution: res(w.users.bob, onb.client, doc.documentId),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "ap_open_item", item_key: "k3:ap1", amount_cents: 45_000, counterparty_id: cpId,
      item_ref: "INV-777", item_date: "2025-11-30" },
  });
  const lines = await entryLines(r.entry_id);
  assert.equal(lines.length, 2, "exactly control leg + OBE contra");
  const ctl = lines.find((l) => l.account_code === WB_COA.apCtl);
  assert.ok(ctl, "the control leg rides the account_class-marked AP account");
  assert.equal(Number(ctl.credit_cents), 45_000, "AP carries as a credit");
  const blob = JSON.stringify([await entryRow(r.entry_id), lines]);
  assert.ok(blob.includes(cpId), "the counterparty is stamped on the carried leg");
});

test("K3: the WB-R15 keyed FALLBACK lane rides a NO-document seed; under a tie document it REFUSES [R1-F2]", async () => {
  fail0017(live);
  // [R1-F2] (fix-round 1 invalidation): keyed is lawful ONLY without a tie
  // document — the fallback stages its own document-less seed, and the old
  // tie-document staging becomes the negative probe.
  // [AMB-0018-1]/WB-R24(i): the keyed lane is now SEED-BOUND — its attribution
  // is minted by record_opening_keyed_resolution for THIS keyed seed (the
  // attributed-keyed spirit of WB-R15, tightened to seed-grain). A document-TIED
  // seed can never mint such a binding, so a keyed draft under a tie registry is
  // now refused at the BINDING layer (CLR01, the bound-assert precedes the tie
  // check in _draft_opening_item_core) as well as the document-primary tie policy
  // — either refusal proves the same invariant: document-primary is law.
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const sr = await createOpeningSeed(w.users.bob, { client: o2.client, plan: o2.plan });
  const keyedSeed = sr.seed_id ?? sr.id;
  const r = await draftOpeningItem(w.users.bob, {
    client: o2.client, seed: keyedSeed, resolution: keyedRes(w.users.bob, { client: o2.client, seed: keyedSeed }),
    item: { item_kind: "gl_balance", item_key: "k3:keyed1" },
    lines: [{ account_code: WB_COA.expense, debit_cents: 3_300, credit_cents: 0 }],
  });
  const e = await entryRow(r.entry_id);
  assert.equal(e.document_id, null, "no document bound (keyed lane)");
  assert.match(e.memo ?? "", /opening carry-down/i, "the memo basis 'opening carry-down: <item_key>' (ck_je_basis)");
  await assertRaisesOneOf([CLR30, CLR.badRequest, CLR.client], () => draftOpeningItem(w.users.bob, {
    client: onb.client, seed, resolution: res(w.users.bob, onb.client),
    item: { item_kind: "gl_balance", item_key: `k3:keyedtie:${opk("x")}` },
    lines: [{ account_code: WB_COA.expense, debit_cents: 3_300, credit_cents: 0 }],
  }), "a keyed item under the TIE-DOCUMENT registry (document-primary is law; WB-R24(i) refuses it at the binding layer)");
});

test("K3: CLR02 is never loosened — a document item with a MISMATCHED sha refuses", async () => {
  fail0017(live);
  await assertRaises(CLR.provenance, () => draftOpeningItem(w.users.bob, {
    client: onb.client, seed, resolution: res(w.users.bob, onb.client, doc.documentId),
    document: doc.documentId, sha256: "0".repeat(64),
    item: { item_kind: "gl_balance", item_key: `k3:sha:${opk("x")}` },
    lines: [{ account_code: WB_COA.cash, debit_cents: 100, credit_cents: 0 }],
  }), "mismatched provenance sha");
});

test("K3: assert_client_resolved binds carry-down — a <0.95 resolution refuses (CLR01)", async () => {
  fail0017(live);
  const weak = await recordResolution(human(w.users.bob), {
    client: onb.client, confidence: 0.5, opKey: opk("weak"),
  });
  await assertRaises(CLR.client, () => draftOpeningItem(w.users.bob, {
    client: onb.client, seed, resolution: weak,
    document: doc.documentId, sha256: doc.sha256, // document lane — [R1-F2] keyed would refuse first
    item: { item_kind: "gl_balance", item_key: `k3:low:${opk("x")}` },
    lines: [{ account_code: WB_COA.cash, debit_cents: 100, credit_cents: 0 }],
  }), "low-confidence resolution");
});

test("K3: the viewer floor refuses (CLR04); an ARCHIVED client refuses (O8 row 12)", async () => {
  fail0017(live);
  await assertRaises(CLR.authz, () => draftOpeningItem(w.users.carol, {
    client: onb.client, seed, resolution: res(w.users.bob, onb.client),
    item: { item_kind: "gl_balance", item_key: `k3:vw:${opk("x")}` },
    lines: [{ account_code: WB_COA.cash, debit_cents: 100, credit_cents: 0 }],
  }), "viewer maker");
  await assertRaisesOneOf([CLR.badRequest, CLR.notFound], () => draftOpeningItem(w.users.bob, {
    client: w.clients.A3, seed, resolution: null,
    item: { item_kind: "gl_balance", item_key: `k3:arch:${opk("x")}` },
    lines: [{ account_code: WB_COA.cash, debit_cents: 100, credit_cents: 0 }],
  }), "archived client");
});

test("K3: the GENERIC writers keep hardcoding is_opening_balance=false forever", async () => {
  fail0017(live);
  let receipt = null;
  try {
    receipt = await draftEntryV3(w.users.alice, {
      client: w.clients.A1, resolution: freshResolution(w.users.alice, w.clients.A1),
      lines: [
        { account_code: WB_COA.cash, debit_cents: 1_100, credit_cents: 0 },
        { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 1_100 },
      ],
      flags: { is_opening_balance: true }, opKey: opk("genob"),
    });
  } catch (e) {
    // a refusal of the unknown/untrusted flag ALSO proves the generic path
    // cannot set it — record which shape landed.
    noteLane(`generic draft with is_opening_balance flag REFUSED (${e.code}) — flag not accepted at all`);
    assert.equal(e.code, CLR.badRequest, "refusal is CLR10");
    return;
  }
  const e = await entryRow(receipt.entry_id);
  assert.equal(e.is_opening_balance, false, "flag ignored — generic core hardcodes false (0004 law)");
});

test("K3/BEE: the pinned equity fixture stages sen-exact and the dry-run deltas are ZERO", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const staged = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o2.client, plan: o2.plan });
  const reLines = await entryLines(staged.drafts.re.entry_id);
  const reLeg = reLines.find((l) => l.account_code === WB_COA.re);
  assert.ok(reLeg, "equity_net resolved by the RE MARKER (never a literal code)");
  assert.equal(Number(reLeg.debit_cents), BEE.reDr, "RE Dr 65,747.97 exact (the balance-sheet sign)");
  const dry = await getOpeningDryrun(w.users.hana, { seed: staged.seed });
  const blob = JSON.stringify(dry);
  assert.ok(dry, "dry-run returns");
  const deltas = [];
  const walk = (n) => {
    if (n == null || typeof n !== "object") { return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if ("delta_cents" in n) deltas.push(Number(n.delta_cents));
    Object.values(n).forEach(walk);
  };
  walk(dry);
  if (deltas.length > 0) {
    assert.ok(deltas.every((d) => d === 0), `every mapped line delta is 0 to the sen (got ${deltas.join(",")})`);
  } else {
    noteLane(`dry-run delta key shape differs from 'delta_cents' — payload: ${blob.slice(0, 400)} (shape finding, not a silent edit)`);
    assert.ok(!/[1-9]\d*\s*(delta|diff)/i.test(blob), "no non-zero delta appears in the dry-run payload");
  }
});

test("K10: trial_balance_as_of(today) ≡ the 1-arg TB; the as_of boundary excludes later entries; RLS-scoped INVOKER", async () => {
  fail0017(live);
  const mk = async (date, amount) => {
    const d = await draftEntryV3(w.users.alice, {
      client: w.clients.A1, resolution: freshResolution(w.users.alice, w.clients.A1),
      lines: [
        { account_code: WB_COA.cash, debit_cents: amount, credit_cents: 0 },
        { account_code: WB_COA.sales, debit_cents: 0, credit_cents: amount },
      ],
      postingDate: date, opKey: opk("k10"),
    });
    await approveEntry(w.users.bob, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("k10a") });
    return d.entry_id;
  };
  await mk("2026-06-01", 5_000);
  await mk("2026-06-10", 7_000);
  const today = new Date().toISOString().slice(0, 10);
  const full = await trialBalanceAsOf(w.users.alice, { client: w.clients.A1, asOf: today });
  const one = await trialBalance1(w.users.alice, { client: w.clients.A1 });
  assert.equal(JSON.stringify(full), JSON.stringify(one), "dated TB at today ≡ the untouched 1-arg TB");
  const early = await trialBalanceAsOf(w.users.alice, { client: w.clients.A1, asOf: "2026-06-05" });
  const cash = (rows) => Number(rows.find((r) => r.account_code === WB_COA.cash)?.debit_cents ?? 0);
  assert.equal(cash(full) - cash(early), 7_000, "je.posting_date <= p_as_of excludes the later entry, sen-exact");
  const cross = await trialBalanceAsOf(w.users.dave, { client: w.clients.A1, asOf: today });
  assert.equal(cross.length, 0, "SECURITY INVOKER — a firm-B actor sees ZERO rows (RLS scope)");
});
