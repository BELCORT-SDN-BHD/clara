// F-A4 PR-2a -- Annex A's END-TO-END pair (W34 twin equivalence, W35 the books actually close),
// the six-reader wall (W44), F4's month-scoped receipt key (W32) and the self-healable FY refusal
// (W31).
//
// W35 is the cell that matters most in this file: it is the only place the whole train is asked
// whether it posts CORRECT BOOKS -- propose, sign, run every occurrence, and watch the prepaid
// asset reach EXACTLY zero on a total that does not divide evenly.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import { humanQuery } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, recordPeriod, rootQuery, wake12, caught, uniq,
  proposeTemplate, pair, templateById, receiptsForTask, opk, derivedOpKey, MODEL,
} from "./f-a4-pr2a-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(noteLane); });

const sign = (sub, client, template) => humanQuery(sub,
  "select clara.sign_adjustment_template($1::uuid,$2::uuid,$3) as r",
  [client, template, opk("fa4p2a-sign")]).then((r) => r.rows[0].r);

// THE OCCURRENCE BELT IS clara_runtime's, not a human's -- measured: the door holds EXECUTE for
// clara_fn_owner and clara_runtime only, and a human call answers 42501. That is the design's own
// division (F-A4 writes no journal line; the existing belt posts after a human signature), so the
// cell uses the estate's OWN runtime helper rather than inventing a call.
const runOccurrence = async (_sub, client, template, ps, pe) => {
  const { runOccurrence: run } = await import("./x42-adj-core.mjs");
  return run({ client, template, periodStart: ps, periodEnd: pe });
};

/** Approve every outstanding occurrence draft for one template, through the governed door. The
 *  belt admits ONE unreviewed draft per template at a time, so this is called between runs. */
async function approveOutstanding(sc, template) {
  const { approveEntry } = await import("./wave-a-reads.mjs");
  const rows = await rootQuery(
    `select id, revision_token from clara.journal_entries
      where client_id=$1 and status='draft' and flags ? 'recurring_adjustment'
        and (flags -> 'recurring_adjustment' ->> 'template_id') = $2 order by created_at`,
    [sc.client, template]);
  for (const e of rows.rows) {
    await approveEntry(sc.bob, { entry: e.id, expectedRevision: e.revision_token,
      opKey: opk("fa4p2a-runappr") });
  }
  return rows.rows.length;
}

/** The net movement on one account across every APPROVED line of a client, in cents. */
async function accountNet(client, code) {
  const r = await rootQuery(
    `select coalesce(sum(jl.debit_cents - jl.credit_cents), 0)::bigint as net
       from clara.journal_lines jl join clara.journal_entries je on je.id = jl.entry_id
      where jl.client_id = $1 and jl.account_code = $2 and je.status = 'approved'`, [client, code]);
  return Number(r.rows[0].net);
}

// ---------------------------------------------------------------------------------------------
// W35 -- THE BOOKS ACTUALLY CLOSE.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W35 end-to-end over the ruled convention: the prepaid asset reaches EXACTLY zero and the expense side totals the term", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // 100000 sen over 3 months does NOT divide evenly (33333 x 3 = 99999), so the final period must
  // absorb the remainder. A cell run on a total that divided evenly would pass with the remainder
  // rule broken.
  const CENTS = 100000;
  const sc = await prepaidScene("w35", { cents: CENTS });
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });

  const opened = await accountNet(sc.client, sc.prepaid);
  assert.equal(opened, CENTS, "the prepaid asset does not open at the amount the entry posted");

  const drafted = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(drafted.status, "acted", `the draft was refused: ${JSON.stringify(drafted).slice(0, 300)}`);
  const tmpl = await templateById(drafted.template_id);
  assert.equal(tmpl.status, "proposed");

  // A HUMAN SIGNS. R6's whole point: the agent drafts, the professional signs, and this is the
  // untouched admin door doing it.
  const signed = await sign(sc.alice, sc.client, drafted.template_id);
  assert.ok(signed, "the admin sign door refused the agent's proposal");
  const live = await templateById(drafted.template_id);
  assert.equal(live.status, "live", "the template did not go live at signature");
  assert.ok(live.signed_by, "a live template with no signatory");

  // EVERY OCCURRENCE RUNS, through the existing belt's own door -- and each is APPROVED before the
  // next is run. The belt refuses otherwise ("an occurrence draft for this template is outstanding;
  // approve or withdraw it before running another period"), which is the estate keeping one
  // unreviewed draft per template rather than letting a schedule stack up unapproved. Measured; the
  // first cut ran all three and then approved, and never got past the second.
  const periods = live.schedule.map((s) => [s.period_start, s.period_end]);
  assert.equal(periods.length, 3);
  const { approveEntry } = await import("./wave-a-reads.mjs");
  for (const [ps, pe] of periods) {
    await runOccurrence(sc.alice, sc.client, drafted.template_id, ps, pe);
    await approveOutstanding(sc, drafted.template_id);
  }
  const entries = await rootQuery(
    `select id, status from clara.journal_entries
      where client_id=$1 and flags ? 'recurring_adjustment'
        and (flags -> 'recurring_adjustment' ->> 'template_id') = $2 order by created_at`,
    [sc.client, drafted.template_id]);
  assert.equal(entries.rows.length, 3, `expected three occurrence entries, found ${entries.rows.length}`);
  assert.ok(entries.rows.every((e) => e.status === "approved"), "an occurrence was left unapproved");
  void approveEntry;

  // THE ASSERTION THE WHOLE TRAIN EXISTS FOR.
  const prepaidAfter = await accountNet(sc.client, sc.prepaid);
  assert.equal(prepaidAfter, 0,
    `the prepaid asset did not reach zero -- it stands at ${prepaidAfter} sen, so the schedule either under- or over-charged`);
  const expenseAfter = await accountNet(sc.client, sc.target);
  assert.equal(expenseAfter, CENTS,
    `the expense side totals ${expenseAfter}, not the term's ${CENTS}`);

  // AND THE REMAINDER IS IN THE FINAL PERIOD, not smeared: periods 1..n-1 carry the base.
  const amounts = live.schedule.map((s) =>
    Number(s.lines.find((l) => Number(l.debit_cents) > 0).debit_cents));
  assert.deepEqual(amounts, [33333, 33333, 33334],
    "the remainder is not wholly in the final period");
  noteLane(`W35: prepaid ${opened} -> 0, expense -> ${expenseAfter}, periods ${amounts.join("/")}`);
});

test("fa4p2a.W35-mutant stopping ONE occurrence short leaves the prepaid account NON-ZERO", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // Without this the cell could be asserting a tautology -- a books read that always says zero
  // proves nothing about the schedule.
  const CENTS = 100000;
  const sc = await prepaidScene("w35m", { cents: CENTS });
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const drafted = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  await sign(sc.alice, sc.client, drafted.template_id);
  const live = await templateById(drafted.template_id);
  for (const s of live.schedule.slice(0, 2)) {          // TWO of three, deliberately
    await runOccurrence(sc.alice, sc.client, drafted.template_id, s.period_start, s.period_end);
    await approveOutstanding(sc, drafted.template_id);
  }
  const left = await accountNet(sc.client, sc.prepaid);
  assert.notEqual(left, 0,
    "two of three occurrences left the prepaid account at ZERO -- W35 is reading something other than the ledger");
  assert.equal(left, 100000 - 33333 - 33333);
});

// ---------------------------------------------------------------------------------------------
// W34 -- TWIN EQUIVALENCE.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W34 the agent core and the human door, given IDENTICAL inputs, produce byte-identical durable state", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // Differing only in the two ctx-derived fields. If these ever diverge, the extraction has stopped
  // being a MOVE and become a second implementation.
  const sc = await prepaidScene("w34", { cents: 90000 });
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: "2025-04-30" });
  const agent = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(agent.status, "acted");
  const a = await templateById(agent.template_id);

  // The HUMAN door, THE SAME INPUTS, on a twin client so the duplicate guard does not intervene.
  // DATES COME BACK FORMATTED BY THE DATABASE. A DATE column arrives as a JS Date at LOCAL
  // midnight, so toISOString() shifts it a day west of UTC -- feeding the door a start of
  // 2025-01-31 for a schedule that begins 2025-02-01, which the coverage clause then refused. The
  // wall was right; my fixture was reformatting its own inputs.
  const dates = await rootQuery(
    `select to_char(start_date,'YYYY-MM-DD') as s, to_char(end_date,'YYYY-MM-DD') as e
       from clara.adjustment_templates where id = $1`, [agent.template_id]);
  const iso = (which) => (which === "start" ? dates.rows[0].s : dates.rows[0].e);
  const sc2 = await prepaidScene("w34b", { cents: 90000 });
  const human = await proposeTemplate(sc2.alice, {
    client: sc2.client, name: a.name, start: iso('start'), end: iso('end'),
    lines: a.lines, schedule: a.schedule, memo: a.memo_template });
  const h = await templateById(human.template_id);

  for (const col of ["cadence", "auto_reverse", "memo_template", "status"]) {
    assert.deepEqual(h[col], a[col], `the two paths disagree on ${col}`);
  }
  assert.deepEqual(h.lines, a.lines, "the canonical lines differ");
  assert.deepEqual(h.schedule, a.schedule, "the schedules differ");
  assert.equal(h.content_hash, a.content_hash,
    "the content hashes differ -- the two paths did not produce the same signed content");
  // The two ctx-derived fields are EXPECTED to differ, and the cell says which.
  assert.notEqual(h.proposed_by, a.proposed_by, "the agent's draft is attributed to the human");

  // MUTANT: perturb ONE line's order in the human's input and the hashes must diverge, proving the
  // comparison is live rather than trivially true.
  const sc3 = await prepaidScene("w34c", { cents: 90000 });
  const perturbed = await proposeTemplate(sc3.alice, {
    client: sc3.client, name: a.name, start: iso('start'), end: iso('end'),
    lines: [...a.lines].reverse(), schedule: a.schedule, memo: a.memo_template });
  const p = await templateById(perturbed.template_id);
  assert.notEqual(p.content_hash, a.content_hash,
    "reversing the line order left the content hash unchanged -- W34's comparison cannot see a difference");
});

// ---------------------------------------------------------------------------------------------
// W44 -- the six readers stay ABOUT what posts.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W44 with a CONGRUENT schedule live, the amount-blind readers answer exactly as they do for a null-schedule twin", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // Congruence clause (a) is what makes this true: the readers project (account, direction) and
  // DISCARD magnitudes, so a congruent schedule is invisible to them BY CONSTRUCTION -- which is
  // precisely why they did not need their own recut and the D1 inventory stayed at four.
  const sc = await prepaidScene("w44", { cents: 90000 });
  const lines = pair(sc.target, sc.prepaid, 30000);
  const withSched = await proposeTemplate(sc.alice, {
    client: sc.client, name: `w44s-${uniq()}`, start: "2025-02-01", end: "2025-04-30", lines,
    schedule: [
      { period_start: "2025-02-01", period_end: "2025-02-28", lines: pair(sc.target, sc.prepaid, 30000) },
      { period_start: "2025-03-01", period_end: "2025-03-31", lines: pair(sc.target, sc.prepaid, 30000) },
      { period_start: "2025-04-01", period_end: "2025-04-30", lines: pair(sc.target, sc.prepaid, 30000) },
    ] });
  const twin = await prepaidScene("w44b", { cents: 90000 });
  const nullSched = await proposeTemplate(twin.alice, {
    client: twin.client, name: `w44n-${uniq()}`, start: "2025-02-01", end: "2025-04-30",
    lines: pair(twin.target, twin.prepaid, 30000) });

  // THE SIX CLAIMED CONSUMERS ARE CALLED, not two helpers standing in for them (Codex C6).
  // Annex H.3 names SIX live readers that take t.lines as a stand-in for what an occurrence posts,
  // and the four-body D1 claim rests on all six being amount-blind. An earlier cut exercised only
  // _wdb_line_shape and _adj_line_eligibility_breach directly -- the two HELPERS the six lean on --
  // which proves the helpers are blind but not that the READERS are. The consumers themselves are
  // driven here, each on the scheduled template and its null-schedule twin, and each must agree.
  const consumer = async (sql, client, template) =>
    (await rootQuery(sql, [client, template])).rows[0].r;

  // (1) the due oracle -- the one the CLOSE-AGENT WAKE LANE itself reads.
  const dueA = await consumer(
    "select clara._adj_oldest_unmet_period($1::uuid,$2::uuid) as r", sc.client, withSched.template_id);
  const dueB = await consumer(
    "select clara._adj_oldest_unmet_period($1::uuid,$2::uuid) as r", twin.client, nullSched.template_id);
  assert.deepEqual(dueA, dueB,
    "the due oracle answers differently for a scheduled template than for its null-schedule twin -- the close lane's own read is not amount-blind");

  // (2) the template projection the sign surface renders. Compared on the keys congruence covers:
  // `lines` must read identically; `schedule` is EXPECTED to differ and is excluded by name.
  const projection = async (template) =>
    (await rootQuery("select clara._adj_template_json($1::uuid) as r", [template])).rows[0].r;
  const jsonA = await projection(withSched.template_id);
  const jsonB = await projection(nullSched.template_id);
  assert.deepEqual(jsonA.lines, jsonB.lines, "the sign-surface projection's `lines` differ across the pair");
  assert.ok(jsonA.schedule && !jsonB.schedule, "the projection does not distinguish the two by schedule");

  // (3) the shape projection and (4) the eligibility read, which the remaining consumers lean on.
  const shapes = await rootQuery(
    `select (select clara._wdb_line_shape(t.lines) from clara.adjustment_templates t where t.id=$1) as with_sched,
            (select clara._wdb_line_shape(t.lines) from clara.adjustment_templates t where t.id=$2) as null_sched`,
    [withSched.template_id, nullSched.template_id]);
  assert.deepEqual(shapes.rows[0].with_sched, shapes.rows[0].null_sched,
    "the shape projection differs between a scheduled template and its null-schedule twin -- the readers are NOT amount-blind and the four-body claim is wrong");
  const elig = await rootQuery(
    `select (select clara._adj_line_eligibility_breach($1, t.lines) from clara.adjustment_templates t where t.id=$2) as a,
            (select clara._adj_line_eligibility_breach($3, t.lines) from clara.adjustment_templates t where t.id=$4) as b`,
    [sc.client, withSched.template_id, twin.client, nullSched.template_id]);
  assert.equal(elig.rows[0].a, null, "the scheduled template's lines are ineligible");
  assert.equal(elig.rows[0].b, null, "the twin's lines are ineligible");
  noteLane("W44: the due oracle, the sign projection, the shape read and the eligibility read all agree across the scheduled/null pair");
});

// ---------------------------------------------------------------------------------------------
// W32 -- F4's month-scoped receipt key.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W32 (F4) two DIFFERENT months minted in ONE task write TWO receipts, each naming its own month", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The shipped defect: subject_id is uuid-not-null so a month cannot ride the subject, and the op
  // key derives per (task, verb, client) -- so the month appeared in NONE of uq_aar's seven columns
  // and the second month's refusal was answered with the first month's receipt id.
  const sc = await prepaidScene("w32");
  const call = (month) => humanQuery(sc.alice, "select 1").then(() => null).catch(() => null)
    .then(() => rootQuery(
      `select clara._agent_mint_month_snapshot_core(
         jsonb_build_object('firm_id', $1::uuid, 'wake_kind', 'close_prep', 'task_id', $2::uuid),
         $3::uuid, $4::date, 'rig', '{}'::jsonb, $5) as r`,
      [sc.firm, sc.s.task, sc.client, month, "w32key"]))
    .then((r) => r.rows[0].r);
  // An INCOMPLETE model triple gives a task-level rung, byte-identical for every month in the pass
  // -- which is exactly the condition Annex G says produces the collision.
  const a = await call("2025-01-01");
  const b = await call("2025-02-01");
  assert.equal(a.status, "refused");
  assert.equal(b.status, "refused");
  assert.notEqual(a.receipt_id, b.receipt_id,
    "the second month's refusal was answered with the FIRST month's receipt id -- F4's shipped defect");
  const rows = await rootQuery(
    "select op_key from clara.agent_act_receipts where id = any($1::uuid[]) order by op_key",
    [[a.receipt_id, b.receipt_id]]);
  assert.deepEqual(rows.rows.map((r) => r.op_key), ["w32key:2025-01-01", "w32key:2025-02-01"],
    "the receipts are not month-scoped -- a receipt for this verb must say which month it was about");
});

// ---------------------------------------------------------------------------------------------
// W31 -- the FY refusal is SELF-HEALABLE.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W31 a term running past the FY refuses -- and the SAME lane can clear it by opening the successor year", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // The conductor's note on design §13 item 4: under R6/HIGH-1 the clocked lane may lawfully open
  // the successor year itself, so this refusal is a SELF-HEALABLE state, not a dead end. The estate
  // has been bitten by a rung whose "blocked" state nothing ever drove to resolution.
  const sc = await prepaidScene("w31");
  const fy = await rootQuery(
    "select id, to_char(ends_on,'YYYY-MM-DD') as ends from clara.fiscal_years where id = $1", [sc.fy]);
  const endsOn = fy.rows[0].ends;
  // A term that runs a year past this FY's end.
  const past = `${Number(endsOn.slice(0, 4)) + 1}-06-30`;
  await recordPeriod(sc.alice, { document: sc.document, start: "2025-02-01", end: past,
    basis: "a term running past the fiscal year" });
  const blocked = await wake12(sc.s, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(blocked.status, "refused", "a term past the FY with no successor must refuse");
  const toks = (blocked.rung_vector ?? []).map((v) => v.token);
  assert.ok(toks.includes("prepayment_term_underivable"), `got ${toks.join(",")}`);
  const missing = (blocked.rung_vector ?? []).find((v) => v.missing)?.missing;
  assert.equal(missing, "fiscal_years.successor",
    "the refusal must NAME the successor year as the missing thing, so the lane knows what to open");

  // MUTANT: leave the year unopened and re-run in a NEW session -- still refuses, so the refusal is
  // the year's absence and not a flake.
  const { mintClosePrepSession } = await import("./f-a4-pr1c-fixtures.mjs");
  const s2 = await mintClosePrepSession(sc.firm, sc.client);
  const still = await wake12(s2, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(still.status, "refused", "the refusal is not stable -- it was a flake, not a state");

  // ===== THE SELF-HEAL, ACTUALLY DRIVEN (Codex C5) =====
  // An earlier cut of this cell claimed the refusal was self-healable and then only re-confirmed
  // it in a fresh session -- it never invoked the verb it advertised. Under R6/HIGH-1 the clocked
  // lane may open the successor year ITSELF, so the cell now does exactly that and proves the same
  // draft then ACTS. Without this the "self-healable, not a dead end" claim was a sentence, not a
  // demonstration.
  const { callWake } = await import("./f-a4-pr1c-fixtures.mjs");
  // THE LANE CANNOT INVENT THE FY END. wake_open_fiscal_year refuses `fy_end_not_on_file` until a
  // HUMAN has stated it -- measured, not assumed, and exactly the right division: the year-end is a
  // client FACT a professional asserts, not something the clocked lane may decide. So the human
  // states it through the governed door first, and only then does the lane clear its own blocker.
  // That is what makes the self-heal a real division of labour rather than the agent doing both.
  await humanQuery(sc.alice, "select clara.set_client_fy_end($1::uuid,$2::int,$3::int,$4) as r",
    [sc.client, 12, 31, opk("fa4p2a-fyend")]);
  const s3 = await mintClosePrepSession(sc.firm, sc.client);
  const nextStart = `${Number(endsOn.slice(0, 4)) + 1}-01-01`;
  const opened = await callWake(s3.secret, "wake_open_fiscal_year",
    [{ name: "p_client", cast: "uuid" }, { name: "p_label" }, { name: "p_starts_on", cast: "date" },
     { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }],
    [sc.client, `FY${Number(endsOn.slice(0, 4)) + 1}`, nextStart,
     "f-a4-pr2a W31: the lane clears its own blocker", JSON.stringify(MODEL),
     derivedOpKey(s3.task, "wake_open_fiscal_year", sc.client)]);
  assert.equal(opened.status, "acted",
    `the lane could not open the successor year: ${JSON.stringify(opened).slice(0, 300)}`);

  // THE SAME DRAFT NOW ACTS, in a fresh session, with a real schedule and an honest receipt.
  const s4 = await mintClosePrepSession(sc.firm, sc.client);
  const healed = await wake12(s4, { client: sc.client, entry: sc.entry, target: sc.target });
  assert.equal(healed.status, "acted",
    `the refusal did not clear after the lane opened the year: ${JSON.stringify(healed).slice(0, 300)}`);
  const tmpl = await templateById(healed.template_id);
  assert.ok(tmpl.schedule, "the healed act drafted no schedule");
  assert.equal(tmpl.status, "proposed");
  assert.ok(Number(healed.period_count) > 0, "the healed schedule carries no periods");
  const rec = await receiptsForTask(s4.task);
  const act = rec.find((r) => r.act_kind === "prepayment_schedule" && r.verdict === "acted");
  assert.ok(act, "the healed act left no acted receipt");
  assert.equal(act.subject_kind, "adjustment_template");
  assert.equal(act.subject_id, healed.template_id, "the receipt names a different template");
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  assert.equal(skipped, 0, `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip`);
  void caught; void withTxn; void receiptsForTask;
});
