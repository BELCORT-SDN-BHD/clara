// 0042 Wave D-b — the ADJUSTMENT-TEMPLATE battery, part 1c: THE READ SURFACE that the
// /rules AdjustmentTemplatePanel stands on (design §2.8).
//
// WHY THIS FILE EXISTS. The as-built ladder (round 2) found that /rules called three
// RPCs the migration never shipped — `list_adjustment_templates`, `list_adjustment_runs`
// and `get_adjustment_run`. The dashboard lane had written the names down as a NAMED
// ASSUMPTION and asked the DB lane to confirm or correct them; nobody did, so the panel
// took a PostgREST 404 on every load and sign / retire / run-manual were unreachable from
// the UI while design §2.8 requires that panel. The reads are now authored, and these
// cells are what stops the pair from drifting apart again: every key the dashboard maps is
// asserted here by name.
//
// The three follow the D-a `list_fixed_assets`/`get_fixed_asset` +
// `list_depreciation_runs`/`get_depreciation_run` precedent exactly — viewer+ floor,
// firm-scoped, ONE jsonb OBJECT each, never a bare array.
//
// CONTRACT-BLIND-ADJACENT: the cells below assert the D-a READ PRECEDENT (which is
// shipped law) rather than 0042's SQL, and every fixture is built through the audited
// verbs. Split from `x42-adj-due.test.mjs` only because the repo enforces a 500-line
// ceiling; `node --test tests/` discovers all three automatically.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  humanQuery, noteLane, endPool, printLaneNotes, printSkipCount,
  x42EnsureReady, skip42, caught, T, mon,
  runManual, adjustmentRunDue, proposeTemplate, idOf,
  adjWorld, freshAdjClient, liveTemplate, approveDraft, accrualLines, prepaymentLines,
  runRowsForTemplate, EXPB, ACCR2, PREP, EXPA,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-adj-reads");
  printSkipCount("x42-adj-reads");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b adjustment READ battery");

/** CLR11 — "not in your firm". The adjustment lane's own vocabulary names CLR10/38/39/04;
 *  the firm-scope refusal belongs to the shared 0003-era family, so it is spelled here. */
const CLR11 = "CLR11";

// The three reads, called by their PINNED names with NAMED args (the house wrapper idiom).
const listTemplates = async (sub, client) =>
  (await humanQuery(sub, "select clara.list_adjustment_templates(p_client => $1) as r", [client])).rows[0].r;
const listRuns = async (sub, client) =>
  (await humanQuery(sub, "select clara.list_adjustment_runs(p_client => $1) as r", [client])).rows[0].r;
const getRun = async (sub, run) =>
  (await humanQuery(sub, "select clara.get_adjustment_run(p_run => $1) as r", [run])).rows[0].r;

/** A jsonb object, never an array — the D-a read law, asserted per read. */
function assertEnvelope(payload, key, label) {
  assert.ok(payload && typeof payload === "object" && !Array.isArray(payload),
    `${label} returns ONE jsonb object, never a bare array (got ${JSON.stringify(payload)?.slice(0, 120)})`);
  assert.ok(Array.isArray(payload[key]), `${label} carries the '${key}' array`);
  return payload[key];
}

test("x42.r1 list_adjustment_templates: ONE envelope, the ABI §D.1 columns under `template_id`, PROPOSED ordered first, and a viewer may read it", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r1");
  const live1 = await liveTemplate({ client, label: "r1live", start: mon(-3).start, cents: 40_000 });
  const proposed = await proposeTemplate(w.users.bob, {
    client, name: `x42 r1prop ${live1.id.slice(0, 6)}`, cadence: "monthly",
    start: mon(-2).start, end: null, autoReverse: true,
    lines: accrualLines(30_000, { debit: EXPB, credit: ACCR2 }), memo: "x42 r1 proposal",
  });
  const proposedId = idOf(proposed, "template_id", "id");

  const payload = await listTemplates(w.users.bob, client);
  const rows = assertEnvelope(payload, "templates", "list_adjustment_templates");
  assert.equal(payload.client_id, client, "the envelope echoes the client it answered for");
  assert.equal(rows.length, 2, "both templates on this client are listed");

  // A PROPOSAL is the thing a human must act on, so it must not be buried under a long
  // retired tail — the panel renders this order verbatim.
  assert.equal(rows[0].template_id, proposedId, "the PROPOSED template sorts first");
  assert.equal(rows[0].status, "proposed", "…and says so");
  assert.equal(rows[1].template_id, live1.id, "…with the live one after it");
  assert.equal(rows[1].status, "live");

  // ONE SPELLING FOR ONE IDENTITY: `template_id` is also blocked[]'s key and every write
  // receipt's key, so the panel can join them without guessing.
  assert.ok(!("id" in rows[0]), "a template row names itself template_id, not id (one spelling per identity)");

  const r = rows[1];
  assert.equal(r.name, live1.name, "the row carries its name");
  assert.equal(r.cadence, "monthly");
  assert.equal(r.start_date, mon(-3).start);
  assert.equal(r.end_date, null);
  assert.equal(r.auto_reverse, false);
  assert.equal(r.memo_template, live1.memo, "…the memo template the occurrence memo is built from");
  assert.equal(r.content_hash, live1.contentHash, "…the content hash propose returned");
  assert.equal(r.signed_by, live1.signedBy, "…and the SIGNER, because the signature is the posting authority");
  assert.ok(Array.isArray(r.lines) && r.lines.length === 2, "…and the template's own line set");
  assert.equal(r.lines[0].account_code, EXPA);
  assert.equal(r.lines[0].debit_cents, 40_000);
  assert.equal(payload.live_count, 1, "the envelope counts the LIVE templates");
  assert.equal(payload.draft_blocked_count, 0, "…and reports nothing blocked by a draft yet");

  // viewer+ (the D-a read floor): carol is firm A's viewer and /rules is a read surface.
  const asViewer = await listTemplates(w.users.carol, client);
  assert.equal(assertEnvelope(asViewer, "templates", "the viewer's list_adjustment_templates").length, 2,
    "a VIEWER reads the template registry");
});

test("x42.r2 the blocked[] remedy is REACHABLE, not merely named: the template row carries the outstanding draft's own entry id, and it clears when the draft is resolved", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r2");
  const tpl = await liveTemplate({ client, label: "r2", start: mon(-3).start, cents: 40_000 });

  const before = (await listTemplates(w.users.bob, client)).templates[0];
  assert.equal(before.occurrence_draft_entry_id, null, "nothing is outstanding before a run");

  const receipt = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: mon(-3).start, periodEnd: mon(-3).end });
  const entry = idOf(receipt, "entry_id", "id");
  assert.ok(entry, `the poster names its entry (got ${JSON.stringify(receipt)})`);

  // The oracle now says this template is blocked and names the remedy in words ("approve or
  // withdraw the draft"). A remedy the reader cannot REACH is the shape this build has
  // already had to fix once — so the row must name WHICH draft.
  const due = await adjustmentRunDue(client);
  const blocked = due.blocked.find((b) => b.template_id === tpl.id);
  assert.ok(blocked, "the oracle reports this template as blocked");
  assert.equal(blocked.reason, T.occurrenceDraftOutstanding, "…on the transient reason");

  const payload = await listTemplates(w.users.bob, client);
  const row = payload.templates[0];
  assert.equal(row.occurrence_draft_entry_id, entry,
    "the row names the EXACT draft blocking the sweep, so the panel can point a human at it");
  assert.equal(payload.draft_blocked_count, 1, "…and the envelope counts it");

  await approveDraft(w.users.alice, entry);
  const after = await listTemplates(w.users.bob, client);
  assert.equal(after.templates[0].occurrence_draft_entry_id, null,
    "resolving the draft clears the pointer — the row and the oracle never disagree");
  assert.equal(after.draft_blocked_count, 0);
  assert.deepEqual((await adjustmentRunDue(client)).blocked, [], "…and the oracle agrees");
});

test("x42.r3 list_adjustment_runs is newest-period-first and get_adjustment_run reads ONE receipt by id, with the amount + mode the run really wrote", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r3");
  const tpl = await liveTemplate({ client, label: "r3", start: mon(-3).start, cents: 55_000 });

  // Two occurrences, oldest first — the ladder's own order, so "newest first" in the read
  // is a real re-ordering rather than an accident of insertion.
  for (const p of [mon(-3), mon(-2)]) {
    const rec = await runManual(w.users.bob, { client, template: tpl.id, periodStart: p.start, periodEnd: p.end });
    await approveDraft(w.users.alice, idOf(rec, "entry_id", "id"));
  }

  const payload = await listRuns(w.users.bob, client);
  const runs = assertEnvelope(payload, "runs", "list_adjustment_runs");
  assert.equal(payload.client_id, client, "the envelope echoes its client");
  assert.equal(runs.length, 2, "both receipts are listed");
  assert.equal(runs[0].period_end, mon(-2).end, "the NEWEST period is the head row (the panel takes the head, it does not sort)");
  assert.equal(runs[1].period_end, mon(-3).end, "…and the older one follows");
  assert.equal(runs[0].template_id, tpl.id, "a run row names its parent template");
  assert.equal(runs[0].amount_cents, 55_000, "…and the DB's own charged amount");
  assert.ok(runs[0].entry_id, "…and the entry it drafted/posted");

  // A run row keeps BOTH ids: its own `id` and its parent's `template_id` — the
  // get_depreciation_run shape, because a receipt's identity and its parent's differ.
  const stored = await runRowsForTemplate(tpl.id);
  assert.equal(stored.length, 2, "the register really holds two receipts");
  const one = await getRun(w.users.carol, runs[0].id);
  assert.ok(one && typeof one === "object" && !Array.isArray(one), "get_adjustment_run returns ONE jsonb object");
  assert.ok(one.run, "…wrapped in a `run` key (the get_depreciation_run envelope)");
  assert.equal(one.run.id, runs[0].id, "…naming the receipt asked for");
  assert.equal(one.run.amount_cents, runs[0].amount_cents, "…with the same figure the list gave");
  assert.equal(one.run.mode, runs[0].mode, "…and the same mode");
  noteLane(`x42.r3 run modes observed: ${runs.map((r) => r.mode).join(", ")}`);
});

test("x42.r4 firm scope: a cross-firm caller gets no existence oracle from any of the three reads", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("r4");
  const tpl = await liveTemplate({
    client, label: "r4", start: mon(-3).start, cents: 20_000,
    lines: prepaymentLines(20_000, { asset: PREP, expense: EXPA }) });
  const rec = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: mon(-3).start, periodEnd: mon(-3).end });
  await approveDraft(w.users.alice, idOf(rec, "entry_id", "id"));
  const runId = (await runRowsForTemplate(tpl.id))[0].id;

  // erin is the SOLO firm S's only member — a real, authenticated human with no business
  // seeing firm A's rows. Whether the read refuses or answers empty, it must never leak.
  for (const [label, call] of [
    ["list_adjustment_templates", () => listTemplates(w.users.erin, client)],
    ["list_adjustment_runs", () => listRuns(w.users.erin, client)],
    ["get_adjustment_run", () => getRun(w.users.erin, runId)],
  ]) {
    const err = await caught(call);
    if (err) {
      assert.equal(err.code, CLR11,
        `${label} refuses a cross-firm caller with the not-in-your-firm shape (got ${err.code} — ${err.message})`);
    } else {
      const json = JSON.stringify(await call());
      assert.ok(!json.includes(tpl.id) && !json.includes(runId),
        `${label} leaked a firm-A id to a cross-firm caller — an existence oracle (${json.slice(0, 200)})`);
      noteLane(`x42.r4 ${label} answers a cross-firm caller with an EMPTY payload rather than CLR11 — recorded`);
    }
  }
});
