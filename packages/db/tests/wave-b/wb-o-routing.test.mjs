// Wave-B battery — Block O routing (O2 shared guard + the O8 per-consumer
// matrix; "the matrix IS the spec; each row gets a contract-blind negative
// test"). Rows 12/13 ride the K/S files (cross-referenced there).
// CONTRACT-BLIND; FAILS (never skips) below 0017.
// [AMB-12] O8 row 6 — WHERE the terminal 'skipped_client_onboarding' receipt
// surfaces is unpinned; encoded: no live classify/facts task may exist for the
// document, and any task row that does exist must be terminal and carry the
// token. Adjudication requested.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, ROLES, rootQuery, opk,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes,
  fail0017, wbEnsureReady, fnExists, roleCanExecute,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, WB_COA,
  filedDocument, freshResolution, draftEntryV3, wakeDraftEntry, mintWake5,
  mintInteractive, docTasks, setDocumentKind, evaluateAllWatches,
  listDocumentAutodraftCandidates, listAutodraftCandidates, listReviewQueue,
  humanPersona, publishWikiPage, runClientLint, packHuman, pageRow,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let onb = null; // { client, plan, revision } — one onboarding client for the file

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client); // CoA is a P19-allowed dry-run FK
});
after(async () => { printLaneNotes("wb-o-routing"); await endPool(); });

test("META: 0017 applied — O2 guard internals present and UNGRANTED to every app role", async () => {
  fail0017(live);
  for (const fn of ["_client_operational", "_assert_client_operational"]) {
    assert.ok(await fnExists(fn), `clara.${fn} exists`);
    for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime]) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} holds NO EXECUTE on ${fn}`);
    }
  }
});

test("O2: _client_operational is the active ALLOWLIST; _assert refuses onboarding (CLR10) and cross-firm (CLR11)", async () => {
  fail0017(live);
  const probe = async (client) =>
    (await rootQuery("select clara._client_operational($1) as ok", [client])).rows[0].ok;
  assert.equal(await probe(w.clients.A1), true, "active client is operational");
  assert.equal(await probe(onb.client), false, "onboarding client is NOT operational");
  assert.equal(await probe(w.clients.A3), false, "archived client is NOT operational");
  await rootQuery("select clara._assert_client_operational($1, $2)", [w.clients.A1, w.firms.A]);
  const e1 = await assertRaises(CLR.badRequest, () =>
    rootQuery("select clara._assert_client_operational($1, $2)", [onb.client, w.firms.A]), "onboarding assert");
  assert.match(e1.message, /not active/i, "the WB-R1 refusal names the exclusion");
  await assertRaises(CLR.notFound, () =>
    rootQuery("select clara._assert_client_operational($1, $2)", [w.clients.A1, w.firms.B]), "firm mismatch");
});

test("O8 row 1: draft_entry refuses an onboarding client (CLR10, allowlist flip) and still drafts on active", async () => {
  fail0017(live);
  const lines = [
    { account_code: WB_COA.cash, debit_cents: 900, credit_cents: 0 },
    { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 900 },
  ];
  await assertRaises(CLR.badRequest, () => draftEntryV3(w.users.alice, {
    client: onb.client, resolution: freshResolution(w.users.alice, onb.client), lines, opKey: opk("onbd"),
  }), "draft_entry on onboarding");
  const ok = await draftEntryV3(w.users.alice, {
    client: w.clients.A1, resolution: freshResolution(w.users.alice, w.clients.A1), lines, opKey: opk("actd"),
  });
  assert.ok(ok.entry_id, "draft_entry on active still works");
});

test("O8 row 1b: wake_draft_entry refuses an onboarding client (the blacklist would have made it postable)", async () => {
  fail0017(live);
  const cred = await mintInteractive(w.firms.A);
  await assertRaises(CLR.badRequest, () => wakeDraftEntry(cred, {
    client: onb.client, resolution: freshResolution(w.users.alice, onb.client),
    lines: [
      { account_code: WB_COA.cash, debit_cents: 800, credit_cents: 0 },
      { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 800 },
    ],
    opKey: opk("onbw"),
  }), "wake_draft_entry on onboarding");
});

test("O8 row 2: sweep enumerators exclude onboarding filings (guard join), active control still enumerates", async () => {
  fail0017(live);
  const onbDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client: onb.client, kind: "invoice" });
  const rows = await listDocumentAutodraftCandidates({ document: onbDoc.documentId });
  assert.equal(rows.length, 0, "an onboarding client's filing yields ZERO autodraft candidates");
  const all = await listAutodraftCandidates();
  assert.ok(!all.some((r) => r.filing_id === onbDoc.filingId), "the sweep enumerator never lists it");
  const actDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  const control = await listDocumentAutodraftCandidates({ document: actDoc.documentId });
  assert.equal(control.length, 1, "the SAME shape on an active client enumerates (the guard, not the shape, excluded it)");
});

test("O8 row 3: an autodraft wake credential pinned to an onboarding client is refused (re-asserted)", async () => {
  fail0017(live);
  await assertRaisesOneOf([CLR.badRequest, CLR.notFound], () =>
    mintWake5({ kind: "autodraft", firm: w.firms.A, client: onb.client }), "autodraft mint on onboarding");
});

test("O8 row 4: list_review_queue carries ZERO rows for the onboarding client (guard join in EVERY row CTE)", async () => {
  fail0017(live);
  await filedDocument(w.users.alice, { firm: w.firms.A, client: onb.client, kind: null });
  const q = await listReviewQueue(humanPersona(w.users.alice), {});
  const offenders = [];
  const walk = (node) => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.client_id === onb.client && node.row_kind) offenders.push(node);
    Object.values(node).forEach(walk);
  };
  walk(q);
  assert.equal(offenders.length, 0,
    `queue rows for the onboarding client: ${offenders.map((o) => o.row_kind).join(",") || "none"}`);
});

test("O8 row 5: the SST evaluator never examines a non-active client", async () => {
  fail0017(live);
  await evaluateAllWatches();
  const n = await rootQuery("select count(*)::int as n from clara.compliance_watches where client_id=$1", [onb.client]);
  assert.equal(n.rows[0].n, 0, "no compliance watch rows for the onboarding client");
});

test("O8 row 6: a NULL-kind pdf filed to an onboarding client gets NO live classify task [AMB-12]; set_document_kind (human) works", async () => {
  fail0017(live);
  const doc = await filedDocument(w.users.alice, { firm: w.firms.A, client: onb.client, kind: null });
  const tasks = await docTasks(doc.documentId);
  const liveTasks = tasks.filter((t) => !["done", "failed", "skipped"].includes(t.status));
  assert.equal(liveTasks.length, 0, `no pending/running task for the onboarding doc (got ${liveTasks.map((t) => `${t.lane}:${t.status}`).join(",")})`);
  if (tasks.length > 0) {
    assert.ok(tasks.some((t) => JSON.stringify(t).includes("skipped_client_onboarding")),
      `a recorded task row must be the terminal 'skipped_client_onboarding' receipt (got ${tasks.map((t) => `${t.lane}:${t.status}`).join(",")})`);
  }
  const r = await setDocumentKind(w.users.alice, { document: doc.documentId, kind: "opening_balance_doc", reason: "takeover pack" });
  assert.ok(r, "the onboarding staff stamps kinds via set_document_kind (required by the K flow)");
});

test("O8 row 7: the lint belt skips a non-active client ({'status':'skipped'})", async () => {
  fail0017(live);
  const r = await runClientLint({ client: onb.client });
  assert.equal(r.status, "skipped", `belt receipt for onboarding client (got ${JSON.stringify(r)})`);
});

test("O8 row 8: W3 writers admit ('active','onboarding') for SEEDING; archived refuses", async () => {
  fail0017(live);
  const r = await publishWikiPage({
    client: onb.client, firm: w.firms.A, slug: "profile", pageKind: "profile",
    title: "Onboarding profile", content: "# seeded during onboarding",
  });
  assert.ok(r, "seeding publish on an onboarding client works");
  assert.ok(await pageRow(onb.client, "profile"), "the page landed");
  await assertRaisesOneOf([CLR.badRequest, CLR.notFound], () => publishWikiPage({
    client: w.clients.A3, firm: w.firms.A, slug: "profile", pageKind: "profile",
    title: "Archived profile", content: "# never",
  }), "publish on an archived client");
});

test("O8 row 9: get_context_pack is the deliberate EXCEPTION — an onboarding client gets a pack", async () => {
  fail0017(live);
  const pack = await packHuman(w.users.alice, { client: onb.client, purpose: "chat" });
  assert.ok(pack, "pack returned for the onboarding client (interview + dry-run need it)");
  assert.equal(pack.pack_schema_version, 4, "and it is the v4 pack");
});

test("O8 rows 10/11: filing + resolution WIDEN to onboarding (positive) and refuse archived (negative)", async () => {
  fail0017(live);
  const res = await freshResolution(w.users.alice, onb.client);
  assert.ok(res, "record_client_resolution admits an onboarding client (row 11)");
  await assertRaisesOneOf([CLR.client, CLR.badRequest, CLR.notFound], () =>
    filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A3, kind: null }),
  "the filing lane refuses an archived client (row 10)");
});
