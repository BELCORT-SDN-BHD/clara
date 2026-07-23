// Wave-B battery — Block L (L1 findings-as-data · L3 the per-client belt ·
// L4 the WB-R5 opening-TB tie watch · L5 queue surfacing · L6 exactly-once
// notification · L7 soft caps). CONTRACT-BLIND; FAILS below 0017.
// The watched client is a B-12 graduate (onboard → commit deferred → carry
// down) so the belt — active-only by design — examines it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, CLR32, PG, ROLES, rootQuery, roleQuery, opk,
  assertRaises, endPool, printLaneNotes,
  fail0017, wbEnsureReady, fnExists, detailReason,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, planRevision,
  commitOnboarding, updatePlan, stageBeeSet, approveOpeningSeed, WB_COA,
  runClientLint, runLintAll, getLintFinding, resolveLintFinding,
  findingRows, openFinding, findingEventRows, latestLintRun,
  listReviewQueue, humanPersona, collectRowKind, notificationsMatching,
  draftEntryV3, approveEntry, freshResolution,
  publishWikiPage, setBudget, WB_BUDGET_SEEDS,
  mintInteractive, wakeDraftEntry, wakeBillDraft, readyFiling, upsertAccountClassed,
} from "./wb-fixtures.mjs";
import { maxSeq } from "../rig-events-helpers.mjs";

let live = false;
let w = null;
let b12 = null; // { client, plan } — ACTIVE with a finalized BEE seed
let st = null;

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  b12 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, b12.client);
  await updatePlan({ plan: b12.plan, expectedRevision: b12.revision, answeredBy: w.users.bob,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }] });
  // [R1-F11] the committer is DISTINCT from the plan maker/answering actors.
  await commitOnboarding(w.users.alice, { client: b12.client, plan: b12.plan, expectedPlanRevision: await planRevision(b12.plan) });
  st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: b12.client, plan: b12.plan });
  await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(b12.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("lbase"),
  });
});
after(async () => { printLaneNotes("wb-l-lint"); await endPool(); });

test("META: 0017 applied — L tables + belt fns; the belt is runtime-GROUP-only", async () => {
  fail0017(live);
  for (const t of ["lint_findings", "lint_finding_events", "lint_runs"]) {
    const r = await rootQuery(
      "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1", [t]);
    assert.ok(r.rows.length, `clara.${t} exists`);
  }
  for (const fn of ["run_client_lint", "run_lint_all", "get_lint_finding", "resolve_lint_finding"]) {
    assert.ok(await fnExists(fn), `clara.${fn} exists`);
  }
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated,
    "select clara.run_client_lint(p_client => $1, p_op_key => $2)", [b12.client, opk("x")]), "authenticated belt call");
});

test("L3: the belt NEVER raises — unknown client skips; a converged pass takes no event-seq lock [AMB-10]", async () => {
  fail0017(live);
  const unknown = await runClientLint({ client: randomUUID() });
  assert.equal(unknown.status, "skipped", "unknown client → {'status':'skipped'}");
  const noKey = await roleQuery(ROLES.runtime,
    "select clara.run_client_lint(p_client => $1, p_op_key => null) as r", [b12.client])
    .then((r) => r.rows[0].r, (e) => e);
  assert.ok(!(noKey instanceof Error), `[AMB-10] a null op_key must not RAISE (got ${noKey?.code ?? "receipt"})`);
  await runClientLint({ client: b12.client });
  const seq0 = await maxSeq(w.firms.A);
  const r2 = await runClientLint({ client: b12.client });
  assert.ok(r2.status, "receipt returned");
  assert.equal(await maxSeq(w.firms.A), seq0, "a CONVERGED pass emits nothing (no firm_event_seq lock)");
});

test("L4: a back-dated post BREAKS the tie — critical finding, sen-exact deltas, transition evented", async () => {
  fail0017(live);
  const d = await draftEntryV3(w.users.alice, {
    client: b12.client, resolution: freshResolution(w.users.alice, b12.client),
    lines: [
      { account_code: WB_COA.cash, debit_cents: 4_400, credit_cents: 0 },
      { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 4_400 },
    ],
    postingDate: "2026-01-01", opKey: opk("back"),
  });
  await approveEntry(w.users.bob, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("backa") });
  const r = await runClientLint({ client: b12.client });
  assert.ok(r.status, "belt receipt");
  const f = await openFinding(b12.client, "opening_tb_tie_broken");
  assert.ok(f, "opening_tb_tie_broken opened (watched, not blocked — visibility over constraint)");
  assert.equal(f.severity, "critical", "severity critical");
  assert.equal(f.dedupe_key, `obtie:${st.seed}`, "the P18 identity key");
  assert.ok(JSON.stringify(f.detail).includes("4400"), `DB-computed sen-exact delta in detail (got ${JSON.stringify(f.detail)})`);
  w._f = f;
});

test("L1: ONE open episode per (client, dedupe_key); a re-run neither duplicates nor re-events", async () => {
  fail0017(live);
  const seq0 = await maxSeq(w.firms.A);
  await runClientLint({ client: b12.client });
  const open = (await findingRows(b12.client)).filter((x) => x.finding_kind === "opening_tb_tie_broken" && x.state === "open");
  assert.equal(open.length, 1, "one open episode (partial unique)");
  assert.equal(await maxSeq(w.firms.A), seq0, "a still-broken UNCHANGED finding is not a transition — no new event");
  await assertRaises(PG.uniqueViolation, () => rootQuery(
    `insert into clara.lint_findings(firm_id, client_id, finding_kind, dedupe_key, severity, state)
     values ($1,$2,'opening_tb_tie_broken',$3,'critical','open')`,
    [w.firms.A, b12.client, `obtie:${st.seed}`]), "duplicate open episode");
});

test("L6: the finding notified EXACTLY ONCE across repeated belt passes", async () => {
  fail0017(live);
  await runClientLint({ client: b12.client });
  await runClientLint({ client: b12.client });
  const notes = await notificationsMatching(w._f.id);
  assert.equal(notes.length, 1, `one lint_finding_opened notification per episode (got ${notes.length})`);
});

test("L5: the queue surfaces the finding — needs_you rank, counts, envelope, finding_id on EVERY row", async () => {
  fail0017(live);
  const q = await listReviewQueue(humanPersona(w.users.alice), {});
  const lintRows = collectRowKind(q, "lint_finding");
  const mine = lintRows.find((r) => r.finding_id === w._f.id);
  assert.ok(mine, "the critical finding rides row_kind='lint_finding'");
  assert.ok(mine.section === "needs_you" || Number(mine.section_rank) === 1,
    `critical → section_rank 1 / 'needs_you' (got section=${mine.section} rank=${mine.section_rank})`);
  assert.equal(typeof q.counts?.lint_findings, "number", "counts.lint_findings is an integer (never monetary)");
  assert.equal(typeof q.lint?.stale_evaluator, "boolean", "envelope lint.stale_evaluator boolean");
  const allRows = [];
  const walk = (n) => {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.row_kind) allRows.push(n);
    Object.values(n).forEach(walk);
  };
  walk(q);
  const missing = allRows.filter((r) => !("finding_id" in r));
  assert.equal(missing.length, 0,
    `the null-defaulted finding_id column rides EVERY row CTE (missing on: ${[...new Set(missing.map((r) => r.row_kind))].join(",")})`);
  w._q = q;
});

test("L5: get_lint_finding hydrates; resolve_lint_finding — typed conclusion, floors, event trail", async () => {
  fail0017(live);
  const card = await getLintFinding(w.users.alice, { finding: w._f.id });
  assert.ok(card, "the card gets a REAL read fn (P18 — no unknown-kind placeholder)");
  const bad = await assertRaises(CLR32, () => resolveLintFinding(w.users.bob, {
    finding: w._f.id, conclusion: "whatever",
  }), "an untyped conclusion");
  if (detailReason(bad)) assert.equal(detailReason(bad), "bad_conclusion");
  await assertRaises(CLR.authz, () => resolveLintFinding(w.users.carol, {
    finding: w._f.id, conclusion: "accepted_revision",
  }), "viewer resolve");
  await resolveLintFinding(w.users.bob, {
    finding: w._f.id, conclusion: "accepted_revision", note: "deliberate governed re-statement",
  });
  const f = (await findingRows(b12.client)).find((x) => x.id === w._f.id);
  assert.equal(f.state, "resolved", "resolved");
  assert.ok(f.resolved_by && f.resolved_at && f.resolved_conclusion, "resolved fields all-or-nothing");
  assert.ok((await findingEventRows(w._f.id)).some((e) => e.event_kind === "resolved"), "lint_finding_events('resolved')");
});

test("L1: a RE-BROKEN condition opens a NEW episode citing the prior finding (the RECHECK link)", async () => {
  fail0017(live);
  await runClientLint({ client: b12.client });
  const again = await openFinding(b12.client, "opening_tb_tie_broken");
  assert.ok(again, "a fresh episode opened (the tie is still broken on the books)");
  assert.notEqual(again.id, w._f.id, "a NEW row, not a reopen");
  assert.equal(again.prior_finding_id, w._f.id, "prior_finding_id links the resolved episode");
});

test("L4: retiring the tie document's filing opens opening_doc_unfiled", async () => {
  fail0017(live);
  // L4 watches the persisted edge itself. The carried 0007 retirement writer
  // correctly refuses live approved-entry citation blockers, so this disposable
  // rig probe exercises the watch without weakening that provenance law.
  await rootQuery(
    `update clara.document_filings set retired_at=now(), retired_by=$2,
       retirement_reason='wb L4 persisted-edge probe',
       revision_token=gen_random_uuid()
     where id=$1`,
    [st.doc.filingId, w.users.alice]);
  await runClientLint({ client: b12.client });
  const f = await openFinding(b12.client, "opening_doc_unfiled");
  assert.ok(f, "opening_doc_unfiled opened for the finalized seed");
  assert.equal(f.dedupe_key, `obdoc:${st.seed}`, "dedupe key");
});

test("L7 SOFT: approach >=90% opens a cap finding; an in-place breach is CRITICAL; budgets from the table", async () => {
  fail0017(live);
  const big = "#".repeat(7_600); // 7600/8192 = 92.7%
  await publishWikiPage({ client: b12.client, firm: w.firms.A, slug: "big-page", title: "Big", content: big });
  await runClientLint({ client: b12.client });
  const approach = await openFinding(b12.client, "cap_page_size");
  assert.ok(approach, "cap_page_size opened at >=90% approach");
  assert.ok(["info", "warn"].includes(approach.severity), `approach severity is advisory (got ${approach.severity})`);
  await setBudget("max_page_bytes", 1_000); // an ADR retune below the existing page
  try {
    await runClientLint({ client: b12.client });
    const breach = await openFinding(b12.client, "cap_page_size");
    assert.equal(breach.severity, "critical", "breach-found-in-place escalates to critical");
  } finally {
    await setBudget("max_page_bytes", WB_BUDGET_SEEDS.max_page_bytes);
  }
});

test("L3: run_lint_all writes ONE append-only receipt with the run counters", async () => {
  fail0017(live);
  const beforeRun = await latestLintRun();
  const r = await runLintAll();
  assert.ok(r, "wrapper receipt returned");
  const run = await latestLintRun();
  assert.ok(run && run.id !== beforeRun?.id, "one NEW lint_runs receipt");
  for (const k of ["clients_examined", "clients_changed", "clients_failed", "through_event_seq"]) {
    assert.ok(k in run, `lint_runs carries '${k}'`);
  }
  assert.ok(Number(run.clients_examined) >= 1, "active clients examined");
  const err = await rootQuery("update clara.lint_runs set clients_examined = clients_examined where id=$1", [run.id])
    .then(() => null, (e) => e);
  assert.equal(err?.code, CLR.immutable, `lint_runs is append-only (got ${err?.code})`);
});

test("L5/ADR-031 (WA21-R14): draft rows rank by LANE — needs_you carries sort[0]='1' and the envelope orders rank-1 first", async () => {
  fail0017(live);
  // Amended part3 L5 pin: the section-order ruling closed BEFORE build, so the
  // sort-tuple alignment is folded into the 0017 CoR (the filing_rows pattern);
  // cursor grammar unchanged. Staged: a HIGH-STAKES wake draft (needs_you lane)
  // and a document-cited ROUTINE bill draft — the confidence-ladder's
  // needs_review tier (a bare uncorroborated agent draft is itself needs_you,
  // probed as-built, so the review-lane comparator must carry Tier-A evidence).
  const cred = await mintInteractive(w.firms.A);
  const hi = await wakeDraftEntry(cred, {
    client: b12.client, resolution: freshResolution(w.users.alice, b12.client),
    lines: [
      { account_code: WB_COA.cash, debit_cents: 2_000_000, credit_cents: 0 }, // RM 20,000 — over the RM10k floor
      { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 2_000_000 },
    ],
    memo: "adr031 hi", opKey: opk("a31hi"),
  });
  await upsertAccountClassed(w.users.alice, { client: b12.client, code: "400-000", name: "Trade Creditors", type: "liability", accountClass: "payable" });
  await upsertAccountClassed(w.users.alice, { client: b12.client, code: "500-A01", name: "Purchases", type: "expense" });
  const rf = await readyFiling(w.users.alice, { client: b12.client, amount: 500_000 });
  const lo = await wakeBillDraft(w.users.alice, cred, { client: b12.client, cited: rf, amount: 500_000 });
  const q = await listReviewQueue(humanPersona(w.users.alice), {});
  const pageRows = Array.isArray(q.rows)
    ? q.rows
    : (Object.values(q).find((v) => Array.isArray(v) && v.length > 0
        && v.every((x) => x && typeof x === "object" && "row_kind" in x)) ?? []);
  assert.ok(pageRows.length > 0, "the envelope exposes an ordered page of rows");
  const rowOf = (entry) => pageRows.find((r) => r.entry_id === entry || JSON.stringify(r).includes(entry));
  const hiRow = rowOf(hi.entry_id);
  const loRow = rowOf(lo.entry_id);
  assert.ok(hiRow, "the high-stakes draft rides the page");
  assert.ok(loRow, "the routine draft rides the page");
  assert.equal(String(hiRow.sort?.[0]), "1", "needs_you-lane draft carries sort[0]='1' (the filing_rows pattern)");
  assert.ok(hiRow.section === "needs_you" || Number(hiRow.section_rank) === 1,
    `high-stakes draft sections needs_you (got section=${hiRow.section} rank=${hiRow.section_rank})`);
  assert.equal(String(loRow.sort?.[0]), "2", "needs_review-lane draft ranks '2'");
  const ranks = pageRows.map((r) => Number(r.sort?.[0] ?? NaN));
  assert.ok(ranks.every((n) => Number.isFinite(n)), "every page row carries a rank in sort[0]");
  const firstNonOne = ranks.findIndex((n) => n > 1);
  const lastOne = ranks.lastIndexOf(1);
  assert.ok(firstNonOne === -1 || lastOne < firstNonOne,
    `the envelope's TOTAL order agrees with the rendered section order — every rank-1 row precedes rank-2+ (got [${ranks.join(",")}])`);
});
